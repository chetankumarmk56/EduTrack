const tintColorLight = '#2563eb';
const tintColorDark = '#3b82f6';

export const Colors = {
  // Primary Palette (Neon Bluish)
  primary: '#2563eb',       // Royal Blue
  secondary: '#38bdf8',     // Sky Blue Neon
  accent: '#06b6d4',        // Cyan Neon
  
  // Semantic Colors
  success: '#10b981',       // Emerald
  warning: '#f59e0b',       // Amber
  danger: '#ef4444',        // Red
  info: '#3b82f6',          // Blue

  // Backgrounds & Surfaces (Bright Mode)
  background: '#ffffff',    // Pure White
  surface: '#f8fafc',       // Slate 50 (Very light gray)
  surfaceElevated: '#f1f5f9', // Slate 100
  card: '#ffffff',
  
  // Text (High Contrast)
  text: '#0f172a',          // Slate 900 (Deep navy)
  textSecondary: '#475569', // Slate 600
  textMuted: '#94a3b8',     // Slate 400
  white: '#ffffff',
  black: '#000000',
  
  // Borders & Dividers
  border: '#e2e8f0',        // Slate 200
  divider: '#f1f5f9',       // Slate 100
  
  // Special (Neon Shadows)
  neonBlue: 'rgba(37, 99, 235, 0.15)',
  neonCyan: 'rgba(6, 182, 212, 0.15)',
  shadow: 'rgba(15, 23, 42, 0.08)',
  
  light: {
    text: '#11181C',
    background: '#fff',
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: '#ECEDEE',
    background: '#151718',
    tint: tintColorDark,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
  },
};
