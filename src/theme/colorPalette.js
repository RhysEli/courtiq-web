// A curated, named color palette for src/components/NamedColorGrid.jsx --
// UI-only. The backend still just stores whatever hex string it's sent
// (teams.color_primary/color_secondary/brand_accent are plain TEXT
// columns, no format constraint), so nothing here changes what's
// persisted, only how a color gets picked.
//
// Deliberately separate from src/theme/userPreference.js's ACCENT_OPTIONS
// (6 colors) -- that list is genuinely constrained (a DB CHECK on
// users.accent_override enforces exactly those 6), so it keeps its own
// short list rather than growing to match this one.

const COLOR_PALETTE = [
  { name: 'Crimson', hex: '#DC143C' },
  { name: 'Scarlet', hex: '#FF2400' },
  { name: 'Coral', hex: '#FF7F50' },
  { name: 'Tangerine', hex: '#F28500' },
  { name: 'Amber', hex: '#FFBF00' },
  { name: 'Gold', hex: '#FFD700' },
  { name: 'Sunflower', hex: '#FFDA03' },
  { name: 'Lime', hex: '#32CD32' },
  { name: 'Emerald', hex: '#50C878' },
  { name: 'Forest Green', hex: '#228B22' },
  { name: 'Teal', hex: '#008080' },
  { name: 'Turquoise', hex: '#40E0D0' },
  { name: 'Sky Blue', hex: '#87CEEB' },
  { name: 'Cerulean', hex: '#007BA7' },
  { name: 'Cobalt Blue', hex: '#0047AB' },
  { name: 'Royal Blue', hex: '#4169E1' },
  { name: 'Navy', hex: '#001F54' },
  { name: 'Indigo', hex: '#4B0082' },
  { name: 'Violet', hex: '#8A2BE2' },
  { name: 'Purple', hex: '#800080' },
  { name: 'Orchid', hex: '#DA70D6' },
  { name: 'Magenta', hex: '#FF00FF' },
  { name: 'Fuchsia', hex: '#FF1493' },
  { name: 'Rose', hex: '#FF007F' },
  { name: 'Maroon', hex: '#800000' },
  { name: 'Burgundy', hex: '#800020' },
  { name: 'Chocolate', hex: '#7B3F00' },
  { name: 'Charcoal', hex: '#36454F' },
  { name: 'Slate Gray', hex: '#708090' },
  { name: 'Silver', hex: '#C0C0C0' },
  { name: 'White', hex: '#FFFFFF' },
  { name: 'Black', hex: '#000000' },
];

export { COLOR_PALETTE };
