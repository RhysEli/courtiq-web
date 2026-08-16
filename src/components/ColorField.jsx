import { Box, Stack, Typography } from '@mui/material';
import NamedColorGrid from './NamedColorGrid';
import { COLOR_PALETTE } from '../theme/colorPalette';

// Shared "label + current-color preview + named swatch grid" unit, so
// every screen that edits a team's real brand colors (team-brand-
// settings.jsx, teams.jsx, teams-management.jsx) looks and behaves
// identically rather than each hand-rolling its own layout around
// NamedColorGrid. Always shows the actual current value as text (via
// "Current: <value>") and a live-colored preview chip, regardless of
// whether it matches a named swatch -- a custom hex or non-hex legacy
// data (e.g. a real saved "YELLOW") still displays honestly.
function ColorField({ label, value, onChange }) {
  return (
    <Box sx={{ mb: 3 }}>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1.5 }}>
        <Box sx={{ width: 36, height: 36, borderRadius: 1.5, bgcolor: value || 'transparent', border: '2px solid rgba(255,255,255,0.25)', flexShrink: 0 }} />
        <Box>
          <Typography variant="subtitle1" fontWeight={700}>{label}</Typography>
          <Typography variant="caption" color="text.secondary">Current: {value || 'not set'}</Typography>
        </Box>
      </Stack>
      <NamedColorGrid options={COLOR_PALETTE} value={value} onChange={onChange} />
    </Box>
  );
}

export default ColorField;
