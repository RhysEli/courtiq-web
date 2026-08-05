import { Card, CardContent, Box } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';

export function GlassCard({ children, sx = {}, glowColor, ...props }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  return (
    <Card
      {...props}
      sx={{
        position: 'relative',
        overflow: 'hidden',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        backgroundColor: isDark ? 'rgba(17, 24, 39, 0.55)' : 'rgba(255, 255, 255, 0.65)',
        border: isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(15,23,42,0.08)',
        boxShadow: isDark
          ? `0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08)`
          : `0 8px 32px rgba(15,23,42,0.08), inset 0 1px 0 rgba(255,255,255,0.8)`,
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: isDark
            ? `0 12px 40px rgba(0,0,0,0.4), 0 0 0 1px ${alpha(glowColor || theme.palette.primary.main, 0.2)}`
            : `0 12px 40px rgba(15,23,42,0.12), 0 0 0 1px ${alpha(glowColor || theme.palette.primary.main, 0.15)}`,
        },
        ...sx,
      }}
    >
      {glowColor && (
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 3,
            background: `linear-gradient(90deg, transparent, ${glowColor}, transparent)`,
            opacity: 0.7,
          }}
        />
      )}
      {children}
    </Card>
  );
}

export function GlassCardContent({ children, sx = {} }) {
  return <CardContent sx={{ position: 'relative', zIndex: 1, ...sx }}>{children}</CardContent>;
}

export default GlassCard;
