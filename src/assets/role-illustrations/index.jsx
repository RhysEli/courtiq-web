// Inline SVG "hero" illustrations, one per role, for RoleBackground.jsx's
// new illustrated layer. Deliberately abstract/geometric line-and-shape
// art built from basic SVG primitives -- not a photo, so there's no
// licensing/watermark risk and no asset file to source or ship.
//
// Each component takes a single `color` prop (a hex string) that drives
// every fill/stroke inside it, plus passes through `style`/`className` so
// the caller controls sizing/positioning. This is the "swap point" for a
// real photo later: replace one component's internals with an <img>
// (or a <Box sx={{ backgroundImage: ... }}>) that still accepts the same
// props -- RoleBackground.jsx itself doesn't need to change.
//
// All viewBoxes are 400x400 so they crop/scale consistently regardless
// of which one is active.

export function AthleteIllustration({ color = '#ff9500', className, style }) {
  return (
    <svg viewBox="0 0 400 400" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={style}>
      {/* Hoop: backboard, rim, net */}
      <rect x="260" y="40" width="90" height="60" rx="4" fill={color} fillOpacity="0.9" />
      <ellipse cx="255" cy="100" rx="45" ry="10" fill="none" stroke={color} strokeWidth="6" />
      <path d="M215 103 L225 150 M235 105 L240 150 M255 106 L255 150 M275 105 L270 150 M295 103 L285 150" stroke={color} strokeWidth="3" strokeLinecap="round" opacity="0.7" />

      {/* Player silhouette, dribbling lunge pose */}
      <circle cx="120" cy="150" r="22" fill={color} />
      <path
        d="M120 172 C 100 190, 90 210, 95 250 C 97 270, 110 290, 100 330 L 88 330
           C 95 290, 85 275, 78 255 C 70 225, 80 195, 108 175 Z"
        fill={color}
      />
      <path
        d="M118 190 C 145 200, 160 220, 158 250 L 170 320 L 155 322 L 145 255
           C 140 235, 130 215, 112 205 Z"
        fill={color}
      />
      {/* extended dribbling arm */}
      <path d="M100 195 C 130 210, 155 240, 165 275 L 155 282 C 145 250, 122 222, 95 205 Z" fill={color} />

      {/* Basketball */}
      <circle cx="178" cy="295" r="18" fill="none" stroke={color} strokeWidth="4" />
      <path d="M160 295 H196 M178 277 V313 M165 282 C175 292, 181 292, 191 282 M165 308 C175 298, 181 298, 191 308" stroke={color} strokeWidth="2" />

      {/* Motion lines trailing the player */}
      <path d="M40 260 C 70 255, 90 250, 60 240" stroke={color} strokeWidth="4" strokeLinecap="round" opacity="0.5" fill="none" />
      <path d="M30 285 C 65 280, 95 273, 65 262" stroke={color} strokeWidth="4" strokeLinecap="round" opacity="0.4" fill="none" />
      <path d="M45 310 C 80 305, 100 298, 75 288" stroke={color} strokeWidth="4" strokeLinecap="round" opacity="0.3" fill="none" />
    </svg>
  );
}

export function CoachIllustration({ color = '#34d399', className, style }) {
  return (
    <svg viewBox="0 0 400 400" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={style}>
      {/* Clipboard body + clip */}
      <rect x="70" y="60" width="260" height="320" rx="16" fill={color} fillOpacity="0.12" stroke={color} strokeWidth="5" />
      <rect x="150" y="40" width="100" height="36" rx="10" fill={color} />

      {/* Court diagram on the board */}
      <rect x="110" y="120" width="180" height="210" rx="4" fill="none" stroke={color} strokeWidth="3" opacity="0.6" />
      <circle cx="200" cy="225" r="35" fill="none" stroke={color} strokeWidth="3" opacity="0.6" />
      <path d="M110 190 H150 V260 H110" fill="none" stroke={color} strokeWidth="3" opacity="0.6" />

      {/* Play markers: O O X X */}
      <circle cx="150" cy="150" r="12" fill="none" stroke={color} strokeWidth="4" />
      <circle cx="250" cy="150" r="12" fill="none" stroke={color} strokeWidth="4" />
      <path d="M138 195 L162 219 M162 195 L138 219" stroke={color} strokeWidth="4" strokeLinecap="round" />
      <path d="M238 260 L262 284 M262 260 L238 284" stroke={color} strokeWidth="4" strokeLinecap="round" />

      {/* Play-diagram arrows */}
      <path d="M155 158 C 175 180, 185 195, 190 210" stroke={color} strokeWidth="3" strokeDasharray="2 6" strokeLinecap="round" fill="none" />
      <path d="M245 158 C 225 190, 215 220, 205 245" stroke={color} strokeWidth="3" strokeDasharray="2 6" strokeLinecap="round" fill="none" />
      <path d="M195 288 L192 250 M186 258 L192 250 L200 257" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export function StatisticianIllustration({ color = '#a78bfa', className, style }) {
  return (
    <svg viewBox="0 0 400 400" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={style}>
      {/* Axes */}
      <path d="M70 330 H340 M70 330 V60" stroke={color} strokeWidth="4" strokeLinecap="round" opacity="0.6" />

      {/* Bars */}
      <rect x="95" y="230" width="30" height="100" fill={color} opacity="0.55" />
      <rect x="140" y="190" width="30" height="140" fill={color} opacity="0.55" />
      <rect x="185" y="250" width="30" height="80" fill={color} opacity="0.55" />
      <rect x="230" y="150" width="30" height="180" fill={color} opacity="0.55" />
      <rect x="275" y="200" width="30" height="130" fill={color} opacity="0.55" />

      {/* Trend line over the bars */}
      <path d="M110 220 L155 175 L200 235 L245 130 L290 185" fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="110" cy="220" r="6" fill={color} />
      <circle cx="155" cy="175" r="6" fill={color} />
      <circle cx="200" cy="235" r="6" fill={color} />
      <circle cx="245" cy="130" r="6" fill={color} />
      <circle cx="290" cy="185" r="6" fill={color} />

      {/* Scatter cluster */}
      <circle cx="320" cy="90" r="5" fill={color} opacity="0.7" />
      <circle cx="335" cy="110" r="4" fill={color} opacity="0.5" />
      <circle cx="310" cy="115" r="3" fill={color} opacity="0.6" />
    </svg>
  );
}

export function TeamManagerIllustration({ color = '#fbbf24', className, style }) {
  return (
    <svg viewBox="0 0 400 400" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={style}>
      {/* Stadium tiers */}
      <path d="M40 300 C 40 180, 140 90, 260 90 C 340 90, 380 150, 380 220" fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" opacity="0.5" />
      <path d="M70 300 C 70 200, 155 120, 260 120 C 325 120, 355 165, 355 220" fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" opacity="0.6" />
      <path d="M100 300 C 100 220, 170 150, 260 150 C 310 150, 330 180, 330 220" fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" opacity="0.7" />

      {/* Field / court */}
      <ellipse cx="215" cy="300" rx="175" ry="45" fill={color} opacity="0.18" />
      <ellipse cx="215" cy="300" rx="175" ry="45" fill="none" stroke={color} strokeWidth="3" opacity="0.6" />
      <line x1="215" y1="255" x2="215" y2="345" stroke={color} strokeWidth="2" opacity="0.5" />
      <circle cx="215" cy="300" r="30" fill="none" stroke={color} strokeWidth="2" opacity="0.5" />

      {/* Spotlight mast + flag */}
      <line x1="355" y1="220" x2="355" y2="150" stroke={color} strokeWidth="4" strokeLinecap="round" />
      <path d="M355 150 L390 165 L355 178 Z" fill={color} opacity="0.8" />
    </svg>
  );
}
