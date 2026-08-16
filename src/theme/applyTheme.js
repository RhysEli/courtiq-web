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
//   - --user-accent: the RESOLVED accent a future component (e.g. the
//     ambient background, not built yet) should consume -- the user's
//     accent_override if they've set one, otherwise the team's
//     brand_accent. This is the one new variable this step introduces.
//   - theme_mode (light/dark/auto) is independent of all of the above --
//     it drives MUI's palette.mode via src/contexts/ThemeContext.jsx, not
//     a CSS custom property, so it isn't handled here. See ThemeContext's
//     resolveMode().

import { applyBrandColors, DEFAULT_BRAND_COLORS } from './brandColors.js';

function applyTheme({ brand = {}, userPref = {} } = {}) {
  applyBrandColors(brand);
  const resolvedAccent = userPref.accentOverride || brand.brandAccent || DEFAULT_BRAND_COLORS.brandAccent;
  document.documentElement.style.setProperty('--user-accent', resolvedAccent);
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
