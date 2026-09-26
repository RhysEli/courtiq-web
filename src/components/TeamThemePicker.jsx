import { Box, FormControlLabel, Grid, Stack, Switch, TextField, Typography } from '@mui/material';
import { useState } from 'react';
import { TEAM_PRESETS } from '../theme/themeConfig';

// Step 63: replaces the old per-field picker (Primary/Secondary/Accent
// edited independently, each its own 32-swatch NamedColorGrid via
// ColorField, plus a separate hidden "Advanced" hex toggle) that was
// duplicated across team-brand-settings.jsx, teams.jsx, and
// teams-management.jsx with ONE shared "Team Theme" widget: pick one of
// the real, already-proven TEAM_PRESETS as a matched primary+secondary+
// accent set, or drop into Custom for the 3 raw hex fields directly.
//
// All 5 real presets are shown -- settings.jsx's own "Quick Team Preset"
// only ever surfaced 4 of these via a bare `.slice(0, 4)` with no comment
// explaining the exclusion; confirmed (Step 62/63) there's no real reason
// for it, just an arbitrary slice, so nothing here perpetuates it.
//
// value: { colorPrimary, colorSecondary, brandAccent }. onChange(next)
// always fires with the FULL updated object -- a preset click and a
// custom hex edit both merge into the same shape, so every caller can
// use one handler (spread into its own form state, and where relevant
// also live-preview it) instead of three separate per-field setters.
// ColorField.jsx/NamedColorGrid's own "always show the real current
// value as text, even if it matches no swatch" honesty is preserved via
// the caption line below, shown regardless of whether Custom is open.
function TeamThemePicker({ value, onChange }) {
  const [customOpen, setCustomOpen] = useState(false);

  const normalize = (hex) => (hex || '').trim().toLowerCase();
  const matchedPresetId = Object.values(TEAM_PRESETS).find((p) => (
    normalize(p.primary) === normalize(value.colorPrimary)
    && normalize(p.secondary) === normalize(value.colorSecondary)
    && normalize(p.accent) === normalize(value.brandAccent)
  ))?.id || null;

  const pickPreset = (preset) => {
    onChange({ colorPrimary: preset.primary, colorSecondary: preset.secondary, brandAccent: preset.accent });
  };

  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 0.5 }}>Team theme</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ mb: 1.5, display: 'block' }}>
        Current: primary {value.colorPrimary || 'not set'} · secondary {value.colorSecondary || 'not set'} · accent {value.brandAccent || 'not set'}
      </Typography>

      <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
        {Object.values(TEAM_PRESETS).map((preset) => {
          const selected = matchedPresetId === preset.id;
          return (
            <Box key={preset.id} onClick={() => pickPreset(preset)} title={preset.name} sx={{ cursor: 'pointer', textAlign: 'center', width: 96 }}>
              <Stack
                direction="row"
                sx={{
                  height: 40,
                  borderRadius: 1.5,
                  overflow: 'hidden',
                  border: selected ? '3px solid #fff' : '2px solid rgba(255,255,255,0.15)',
                  boxShadow: selected ? `0 0 10px ${preset.primary}` : 'none',
                }}
              >
                <Box sx={{ flex: 1, bgcolor: preset.primary }} />
                <Box sx={{ flex: 1, bgcolor: preset.secondary }} />
                <Box sx={{ flex: 1, bgcolor: preset.accent }} />
              </Stack>
              <Typography
                variant="caption"
                sx={{ display: 'block', mt: 0.5, fontWeight: selected ? 700 : 400, color: selected ? 'text.primary' : 'text.secondary' }}
              >
                {preset.name}
              </Typography>
            </Box>
          );
        })}
      </Stack>

      <FormControlLabel
        control={<Switch checked={customOpen} onChange={(event) => setCustomOpen(event.target.checked)} />}
        label="Custom: enter exact hex codes"
      />
      {customOpen && (
        <Grid container spacing={2} sx={{ mt: 0.5 }}>
          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth label="Primary hex" value={value.colorPrimary || ''}
              onChange={(event) => onChange({ ...value, colorPrimary: event.target.value })}
              helperText="e.g. #ff7a1a"
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth label="Secondary hex" value={value.colorSecondary || ''}
              onChange={(event) => onChange({ ...value, colorSecondary: event.target.value })}
              helperText="e.g. #111827"
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth label="Accent hex" value={value.brandAccent || ''}
              onChange={(event) => onChange({ ...value, brandAccent: event.target.value })}
              helperText="e.g. #f8fafc"
            />
          </Grid>
        </Grid>
      )}
    </Box>
  );
}

export default TeamThemePicker;
