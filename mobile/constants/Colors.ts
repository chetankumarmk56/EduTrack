export const Colors = {
  primary: '#4f46e5',
  primaryLight: '#6366f1',
  primaryDark: '#3730a3',
  secondary: '#7c3aed',
  accent: '#06b6d4',

  background: '#0f0f1a',
  surface: '#1a1a2e',
  surfaceElevated: '#22223a',
  card: '#1e1e35',
  border: '#2d2d4a',
  borderLight: '#3d3d5c',

  text: '#f1f1f5',
  textSecondary: '#9494b8',
  textMuted: '#5c5c8a',
  textInverse: '#0f0f1a',

  success: '#10b981',
  successLight: '#d1fae5',
  warning: '#f59e0b',
  warningLight: '#fef3c7',
  danger: '#ef4444',
  dangerLight: '#fee2e2',
  info: '#3b82f6',

  white: '#ffffff',
  black: '#000000',

  gradientStart: '#4f46e5',
  gradientEnd: '#7c3aed',

  tabBarBackground: '#12122a',
  tabBarBorder: '#2a2a48',
  tabBarActive: '#6366f1',
  tabBarInactive: '#5c5c8a',

  // Priority colors
  priorityHigh: '#ef4444',
  priorityMedium: '#f59e0b',
  priorityLow: '#4f46e5',

  // Card overlays
  overlay10: 'rgba(79, 70, 229, 0.10)',
  overlay20: 'rgba(79, 70, 229, 0.20)',
  whiteOverlay10: 'rgba(255, 255, 255, 0.10)',
  whiteOverlay20: 'rgba(255, 255, 255, 0.20)',
  blackOverlay40: 'rgba(0, 0, 0, 0.40)',
};

export type ColorKey = keyof typeof Colors;
