import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, IconButton, Stack, TextField, Tooltip, Typography } from '@mui/material';
import ColorizeRoundedIcon from '@mui/icons-material/ColorizeRounded';

// Full-spectrum picker for personal accent_override -- unlike team brand
// colors (still a curated named palette, see ColorField.jsx/NamedColorGrid.jsx
// and their CHECK-constraint-driven caution), accent_override's CHECK is
// now format-only (any #rrggbb, see backend/src/db/schema.sql), so this
// gives free rein: an HSV saturation/value square, a hue strip, raw RGB
// number inputs, and the native EyeDropper API where the browser supports
// it (feature-detected -- the button simply doesn't render otherwise,
// Chromium-only as of this writing).
//
// Dragging the square/hue strip only live-previews via onPreview (cheap,
// client-only) -- it does NOT fire onCommit on every pointermove, which
// would otherwise hammer the backend PATCH on every pixel of drag. onCommit
// (the one that actually persists) fires on pointer release, on RGB field
// blur/Enter, and on a successful eyedropper pick.

function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return null;
  const int = parseInt(m[1], 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

function rgbToHex({ r, g, b }) {
  return `#${[r, g, b].map((c) => clamp(Math.round(c), 0, 255).toString(16).padStart(2, '0')).join('')}`;
}

function rgbToHsv({ r, g, b }) {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : (d / max) * 100;
  const v = max * 100;
  return { h, s, v };
}

function hsvToRgb({ h, s, v }) {
  const sn = s / 100, vn = v / 100;
  const c = vn * sn;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = vn - c;
  let rgb = [0, 0, 0];
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return { r: (rgb[0] + m) * 255, g: (rgb[1] + m) * 255, b: (rgb[2] + m) * 255 };
}

const HUE_GRADIENT = 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)';
const eyedropperSupported = typeof window !== 'undefined' && 'EyeDropper' in window;

function FullColorPicker({ value, onPreview, onCommit }) {
  const [hsv, setHsv] = useState(() => rgbToHsv(hexToRgb(value) || { r: 255, g: 255, b: 255 }));
  const lastEmittedHex = useRef(value);
  const svRef = useRef(null);
  const hueRef = useRef(null);

  // Only re-sync from the incoming value when it changed for a reason
  // OTHER than our own last onPreview/onCommit echo (e.g. a quick-pick
  // swatch was clicked instead) -- otherwise every drag frame's own
  // round-trip through the parent would fight the in-progress gesture.
  useEffect(() => {
    if (value && value !== lastEmittedHex.current) {
      const rgb = hexToRgb(value);
      if (rgb) setHsv(rgbToHsv(rgb));
      lastEmittedHex.current = value;
    }
  }, [value]);

  const emit = useCallback((nextHsv, { commit }) => {
    const hex = rgbToHex(hsvToRgb(nextHsv));
    lastEmittedHex.current = hex;
    onPreview?.(hex);
    if (commit) onCommit?.(hex);
  }, [onPreview, onCommit]);

  const updateFromSvPointer = useCallback((clientX, clientY, commit) => {
    const rect = svRef.current.getBoundingClientRect();
    const s = clamp(((clientX - rect.left) / rect.width) * 100, 0, 100);
    const v = clamp(100 - ((clientY - rect.top) / rect.height) * 100, 0, 100);
    setHsv((prev) => {
      const next = { ...prev, s, v };
      emit(next, { commit });
      return next;
    });
  }, [emit]);

  const updateFromHuePointer = useCallback((clientX, commit) => {
    const rect = hueRef.current.getBoundingClientRect();
    const h = clamp(((clientX - rect.left) / rect.width) * 360, 0, 360);
    setHsv((prev) => {
      const next = { ...prev, h };
      emit(next, { commit });
      return next;
    });
  }, [emit]);

  const makeDragHandlers = (updateFn, argsFromEvent) => ({
    onPointerDown: (event) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      updateFn(...argsFromEvent(event), false);
    },
    onPointerMove: (event) => {
      if (event.buttons !== 1) return;
      updateFn(...argsFromEvent(event), false);
    },
    onPointerUp: (event) => {
      updateFn(...argsFromEvent(event), true);
    },
  });

  const svHandlers = makeDragHandlers(updateFromSvPointer, (e) => [e.clientX, e.clientY]);
  const hueHandlers = makeDragHandlers(updateFromHuePointer, (e) => [e.clientX]);

  const rgb = hsvToRgb(hsv);
  const rgbInt = { r: Math.round(rgb.r), g: Math.round(rgb.g), b: Math.round(rgb.b) };

  // Preview-only on every keystroke -- committing here would fire one PATCH
  // per character typed (e.g. "1", "12", "125"), and overlapping requests
  // can complete out of order, letting an earlier keystroke's response
  // overwrite a later one's. Actually persisting happens in commitRgb,
  // once, on blur/Enter -- same "live during the gesture, save at the end"
  // shape as the square/hue-strip drag handlers above.
  const setRgbChannel = (channel, rawValue) => {
    const n = clamp(parseInt(rawValue, 10) || 0, 0, 255);
    const nextRgb = { ...rgbInt, [channel]: n };
    const next = rgbToHsv(nextRgb);
    setHsv(next);
    emit(next, { commit: false });
  };

  const commitRgb = () => emit(hsv, { commit: true });

  const pickWithEyedropper = async () => {
    try {
      const result = await new window.EyeDropper().open();
      const rgbFromPick = hexToRgb(result.sRGBHex);
      if (!rgbFromPick) return;
      const next = rgbToHsv(rgbFromPick);
      setHsv(next);
      emit(next, { commit: true });
    } catch {
      /* user cancelled the eyedropper -- not an error */
    }
  };

  const pureHueHex = rgbToHex(hsvToRgb({ h: hsv.h, s: 100, v: 100 }));

  return (
    <Box>
      <Box
        ref={svRef}
        {...svHandlers}
        sx={{
          position: 'relative',
          width: '100%',
          height: 160,
          borderRadius: 1.5,
          cursor: 'crosshair',
          touchAction: 'none',
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${pureHueHex})`,
          border: '1px solid rgba(255,255,255,0.15)',
          mb: 1.5,
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            left: `${hsv.s}%`,
            top: `${100 - hsv.v}%`,
            width: 16,
            height: 16,
            borderRadius: '50%',
            border: '2px solid #fff',
            boxShadow: '0 0 0 1px rgba(0,0,0,0.4), 0 1px 4px rgba(0,0,0,0.5)',
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
          }}
        />
      </Box>

      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
        <Box
          ref={hueRef}
          {...hueHandlers}
          sx={{
            position: 'relative',
            flex: 1,
            height: 14,
            borderRadius: 999,
            cursor: 'pointer',
            touchAction: 'none',
            background: HUE_GRADIENT,
            border: '1px solid rgba(255,255,255,0.15)',
          }}
        >
          <Box
            sx={{
              position: 'absolute',
              left: `${(hsv.h / 360) * 100}%`,
              top: '50%',
              width: 16,
              height: 16,
              borderRadius: '50%',
              border: '2px solid #fff',
              boxShadow: '0 0 0 1px rgba(0,0,0,0.4), 0 1px 4px rgba(0,0,0,0.5)',
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'none',
              bgcolor: pureHueHex,
            }}
          />
        </Box>

        {eyedropperSupported && (
          <Tooltip title="Pick a color from your screen">
            <IconButton size="small" onClick={pickWithEyedropper} sx={{ border: '1px solid rgba(255,255,255,0.15)' }}>
              <ColorizeRoundedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Stack>

      <Stack direction="row" spacing={1.5}>
        {['r', 'g', 'b'].map((channel) => (
          <TextField
            key={channel}
            size="small"
            type="number"
            label={channel.toUpperCase()}
            value={rgbInt[channel]}
            onChange={(event) => setRgbChannel(channel, event.target.value)}
            onBlur={commitRgb}
            onKeyDown={(event) => { if (event.key === 'Enter') { commitRgb(); event.currentTarget.blur(); } }}
            inputProps={{ min: 0, max: 255 }}
            sx={{ width: 90 }}
          />
        ))}
        <Stack direction="row" alignItems="center" spacing={1} sx={{ flex: 1, justifyContent: 'flex-end' }}>
          <Box sx={{ width: 28, height: 28, borderRadius: 1, bgcolor: rgbToHex(rgb), border: '1px solid rgba(255,255,255,0.25)' }} />
          <Typography variant="body2" color="text.secondary">{rgbToHex(rgb)}</Typography>
        </Stack>
      </Stack>
    </Box>
  );
}

export default FullColorPicker;
