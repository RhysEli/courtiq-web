import { Box, Grid, Typography } from '@mui/material';

// Shared "paint-store swatch chart" picker: a grid of named color chips,
// click to select. Used by team-brand-settings.jsx (the full curated
// palette) and settings.jsx's Quick Team Preset / My Accent Color (their
// own, smaller/constrained option lists) -- one component, one look, so
// picking a color feels the same everywhere in the app rather than each
// screen hand-rolling its own swatch markup.
//
// Purely presentational: `options` is `[{ hex, name }]`, `value` is the
// currently-selected hex (or null/undefined), `onChange(hex)` fires on
// click. Matching is case-insensitive on the raw hex string -- if `value`
// doesn't match any option (a custom color, or non-hex legacy data),
// nothing is highlighted, which is correct: it genuinely isn't one of
// these named options.
function NamedColorGrid({ options, value, onChange, chipSize = 40 }) {
  const normalize = (hex) => (hex || '').trim().toLowerCase();
  const normalizedValue = normalize(value);

  return (
    <Grid container spacing={1.5}>
      {options.map((option) => {
        const selected = normalizedValue !== '' && normalizedValue === normalize(option.hex);
        return (
          <Grid item key={option.hex} xs={4} sm={3} md={2}>
            <Box
              onClick={() => onChange(option.hex)}
              title={option.name}
              sx={{ cursor: 'pointer', textAlign: 'center' }}
            >
              <Box
                sx={{
                  width: chipSize,
                  height: chipSize,
                  borderRadius: 1.5,
                  bgcolor: option.hex,
                  mx: 'auto',
                  border: selected ? '3px solid #fff' : '2px solid rgba(255,255,255,0.15)',
                  boxShadow: selected ? `0 0 10px ${option.hex}` : 'none',
                  transition: 'transform 0.15s ease',
                  '&:hover': { transform: 'scale(1.08)' },
                }}
              />
              <Typography
                variant="caption"
                sx={{ display: 'block', mt: 0.5, color: selected ? 'text.primary' : 'text.secondary', fontWeight: selected ? 700 : 400 }}
              >
                {option.name}
              </Typography>
            </Box>
          </Grid>
        );
      })}
    </Grid>
  );
}

export default NamedColorGrid;
