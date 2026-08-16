// Visual overhaul step 2: the single shared entry point for applying both
// the team's real brand colors and the current user's resolved accent, so
// login bootstrap, the team-brand settings screen, and the personal-
// preference settings screen all go through the same logic instead of
// each re-implementing CSS-var assignment.
//
// Resolution order:
//   - --brand-primary / --brand-secondary: always the team's colors.
//     Never affected by any personal preference.
//   - --brand-accent: always the team's own accent, unchanged from Step 1.
//     Left alone here so any future consumer of "the team's real accent"
//     specifically still gets it, independent of a user's override.
//   - --user-accent: the RESOLVED accent components consume for personal
//     UI (sidebar active-nav, topbar avatar, selected toggle pills, ...) --
//     the user's accent_override if they've set one, otherwise the team's
//     brand_accent.
//   - --user-accent-fg: a readable foreground (near-black or near-white)
//     for text/icons drawn ON TOP of a solid --user-accent fill. Now that
//     accent_override can be any full-spectrum color (not the original
//     6-swatch enum), a fixed foreground -- e.g. always black -- reads
//     fine against the old palette's pale swatches but breaks against a
//     dark custom pick (navy, near-black) or is illegible against a pale
//     one, and a pure text-in-accent-color-on-translucent-accent-tint
//     treatment (the toggle-pill selected state's first version) fails
//     the same way in the other direction: a pale accent's own text color
//     barely contrasts against ITS OWN faint tint of itself. Computed via
//     WCAG relative luminance, same idea as a paint swatch card always
//     printing readable text regardless of the swatch behind it.
//   - theme_mode (light/dark/auto) is independent of all of the above --
//     it drives MUI's palette.mode via src/contexts/ThemeContext.jsx, not
//     a CSS custom property, so it isn't handled here. See ThemeContext's
//     resolveMode().

import { applyBrandColors, DEFAULT_BRAND_COLORS } from './brandColors.js';

function hexToRgbChannels(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return null;
  const int = parseInt(m[1], 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

// WCAG relative luminance -- https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
function relativeLuminance([r, g, b]) {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastingForeground(hex) {
  const rgb = hexToRgbChannels(hex);
  if (!rgb) return '#0f172a';
  // Threshold sits a bit above the pure-0.5 midpoint -- mid-tones read
  // more reliably with dark text than white in practice.
  return relativeLuminance(rgb) > 0.42 ? '#0f172a' : '#f8fafc';
}

function applyTheme({ brand = {}, userPref = {} } = {}) {
  applyBrandColors(brand);
  const resolvedAccent = userPref.accentOverride || brand.brandAccent || DEFAULT_BRAND_COLORS.brandAccent;
  document.documentElement.style.setProperty('--user-accent', resolvedAccent);
  document.documentElement.style.setProperty('--user-accent-fg', contrastingForeground(resolvedAccent));
}

// Reads back the currently-applied brand colors from the CSS custom
// properties themselves. Lets a settings screen that's only changing ONE
// side of applyTheme's input (e.g. personal preference previewing just
// the accent) pass through the OTHER side's real current value instead of
// needing its own copy of state it isn't editing -- avoids an extra
// fetch, and avoids accidentally reverting whichever half it didn't mean
// to touch.
function getCurrentBrand() {
  const style = getComputedStyle(document.documentElement);
  return {
    colorPrimary: style.getPropertyValue('--brand-primary').trim(),
    colorSecondary: style.getPropertyValue('--brand-secondary').trim(),
    brandAccent: style.getPropertyValue('--brand-accent').trim(),
  };
}

export { applyTheme, getCurrentBrand };
