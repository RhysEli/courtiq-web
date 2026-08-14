import { Box } from '@mui/material';
import { motion } from 'framer-motion';
import { getRoleTheme } from '../theme/themeConfig';
import { useThemePreferences } from '../contexts/ThemeContext';
import {
  AthleteIllustration,
  CoachIllustration,
  StatisticianIllustration,
  TeamManagerIllustration,
} from '../assets/role-illustrations';

const INTENSITY_OPACITY = { subtle: 0.35, medium: 0.55, vivid: 0.75 };

const ROLE_ILLUSTRATIONS = {
  Athlete: AthleteIllustration,
  Coach: CoachIllustration,
  Statistician: StatisticianIllustration,
  'Team Manager': TeamManagerIllustration,
};

function CourtLines({ color, opacity }) {
  return (
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        opacity,
        backgroundImage: `
          linear-gradient(${color}22 2px, transparent 2px),
          linear-gradient(90deg, ${color}22 2px, transparent 2px),
          radial-gradient(circle at 50% 60%, transparent 120px, ${color}18 121px, transparent 122px)
        `,
        backgroundSize: '80px 80px, 80px 80px, 100% 100%',
        animation: 'courtDrift 40s linear infinite',
      }}
    />
  );
}

function TacticalGrid({ color, opacity }) {
  return (
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        opacity,
        backgroundImage: `
          linear-gradient(${color}15 1px, transparent 1px),
          linear-gradient(90deg, ${color}15 1px, transparent 1px)
        `,
        backgroundSize: '48px 48px',
        animation: 'gridPulse 8s ease-in-out infinite',
      }}
    />
  );
}

function DataGrid({ color, opacity }) {
  return (
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        opacity,
        backgroundImage: `
          repeating-linear-gradient(0deg, transparent, transparent 39px, ${color}12 39px, ${color}12 40px),
          repeating-linear-gradient(90deg, transparent, transparent 59px, ${color}08 59px, ${color}08 60px)
        `,
        animation: 'dataScan 12s linear infinite',
      }}
    />
  );
}

function NetworkNodes({ color, opacity }) {
  return (
    <>
      {[...Array(8)].map((_, i) => (
        <Box
          key={i}
          sx={{
            position: 'absolute',
            width: 6,
            height: 6,
            borderRadius: '50%',
            bgcolor: color,
            opacity: opacity * 0.8,
            top: `${15 + (i * 11) % 70}%`,
            left: `${10 + (i * 17) % 80}%`,
            boxShadow: `0 0 20px ${color}`,
            animation: `nodeFloat ${6 + i}s ease-in-out infinite`,
            animationDelay: `${i * 0.7}s`,
          }}
        />
      ))}
    </>
  );
}

function FloatingParticles({ color, count, role }) {
  const shapes = role === 'Athlete' ? ['🏀', '⚡', '🔥'] : role === 'Coach' ? ['✕', '○', '→'] : role === 'Statistician' ? ['▮', '▯', '%'] : ['★', '◆', '●'];

  return (
    <>
      {[...Array(count)].map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 100 }}
          animate={{
            opacity: [0, 0.6, 0],
            y: [-20, -600],
            x: [0, (i % 2 === 0 ? 1 : -1) * 40],
          }}
          transition={{
            duration: 8 + (i % 5) * 2,
            repeat: Infinity,
            delay: i * 1.2,
            ease: 'linear',
          }}
          style={{
            position: 'absolute',
            left: `${5 + (i * 13) % 90}%`,
            bottom: '-5%',
            fontSize: role === 'Athlete' ? '1.4rem' : '0.9rem',
            color,
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          {shapes[i % shapes.length]}
        </motion.div>
      ))}
    </>
  );
}

function RoleBackground({ role }) {
  const { teamColors, backgroundIntensity, mode } = useThemePreferences();
  const roleTheme = getRoleTheme(role);
  const opacity = INTENSITY_OPACITY[backgroundIntensity] || 0.55;
  const isDark = mode === 'dark';

  const overlayGradient = isDark
    ? `linear-gradient(135deg, ${roleTheme.gradient[0]}ee 0%, ${roleTheme.gradient[1]}cc 50%, ${roleTheme.gradient[2]}ee 100%)`
    : `linear-gradient(135deg, ${teamColors.secondary}22 0%, ${teamColors.primary}18 50%, ${teamColors.secondary}15 100%)`;

  // "More lively" per lecturer feedback: a large per-role hero
  // illustration sitting behind everything else. Bright role.particle
  // in dark mode (same color the existing pattern/particle layers
  // already use, proven readable against the dark gradient); the deep
  // role.gradient[1] tone in light mode instead -- particle is tuned
  // for a dark backdrop and reads as too pale/washed-out on light.
  // Opacity scales off the same backgroundIntensity dial as everything
  // else here (INTENSITY_OPACITY), just scaled down so a large-scale
  // illustration doesn't overpower the existing subtle layers -- not a
  // separate hardcoded number.
  const Illustration = ROLE_ILLUSTRATIONS[role] || ROLE_ILLUSTRATIONS.Statistician;
  const illustrationColor = isDark ? roleTheme.particle : roleTheme.gradient[1];
  const illustrationOpacity = opacity * 0.35;

  return (
    <Box
      sx={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          background: overlayGradient,
        }}
      />

      <Box
        sx={{
          position: 'absolute',
          right: '-8%',
          bottom: '-8%',
          width: { xs: '110vw', md: '55vw' },
          height: { xs: '110vw', md: '55vw' },
          maxWidth: 760,
          maxHeight: 760,
          opacity: illustrationOpacity,
        }}
      >
        <Illustration color={illustrationColor} style={{ width: '100%', height: '100%' }} />
      </Box>

      <Box
        sx={{
          position: 'absolute',
          top: '-20%',
          right: '-10%',
          width: '60vw',
          height: '60vw',
          borderRadius: '50%',
          background: `radial-gradient(circle, ${roleTheme.glow}${Math.round(opacity * 60).toString(16).padStart(2, '0')} 0%, transparent 70%)`,
          animation: 'orbFloat 20s ease-in-out infinite',
        }}
      />

      <Box
        sx={{
          position: 'absolute',
          bottom: '-30%',
          left: '-15%',
          width: '70vw',
          height: '70vw',
          borderRadius: '50%',
          background: `radial-gradient(circle, ${teamColors.primary}${Math.round(opacity * 40).toString(16).padStart(2, '0')} 0%, transparent 70%)`,
          animation: 'orbFloat 25s ease-in-out infinite reverse',
        }}
      />

      {role === 'Athlete' && <CourtLines color={roleTheme.particle} opacity={opacity} />}
      {role === 'Coach' && <TacticalGrid color={roleTheme.particle} opacity={opacity} />}
      {role === 'Statistician' && <DataGrid color={roleTheme.particle} opacity={opacity} />}
      {role === 'Team Manager' && <NetworkNodes color={roleTheme.particle} opacity={opacity} />}

      <FloatingParticles color={roleTheme.particle} count={backgroundIntensity === 'subtle' ? 4 : backgroundIntensity === 'vivid' ? 12 : 8} role={role} />

      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          background: isDark
            ? 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.4) 100%)'
            : 'radial-gradient(ellipse at center, transparent 50%, rgba(255,255,255,0.3) 100%)',
        }}
      />
    </Box>
  );
}

export default RoleBackground;
