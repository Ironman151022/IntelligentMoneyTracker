export const Colors = {
  // Dark background palette
  bg: '#0A0A0F',
  bgCard: '#12121A',
  bgSurface: '#1A1A27',

  // Liquid Glass tints
  glassBase: 'rgba(255,255,255,0.06)',
  glassBorder: 'rgba(255,255,255,0.12)',
  glassTint: 'rgba(120,180,255,0.10)',
  glassHighlight: 'rgba(255,255,255,0.18)',

  // Brand
  accent: '#6C8EFF',
  accentSoft: 'rgba(108,142,255,0.20)',
  accentGlow: 'rgba(108,142,255,0.40)',
  teal: '#00D4AA',
  tealSoft: 'rgba(0,212,170,0.15)',
  purple: '#9B6DFF',
  purpleSoft: 'rgba(155,109,255,0.15)',

  // Text
  textPrimary: '#FFFFFF',
  textSecondary: 'rgba(255,255,255,0.65)',
  textMuted: 'rgba(255,255,255,0.35)',
  textHint: 'rgba(255,255,255,0.22)',

  // Status
  success: '#00D4AA',
  error: '#FF5F7E',
  warning: '#FFB020',

  // Gradients (used as arrays)
  gradientAccent: ['#6C8EFF', '#9B6DFF'] as const,
  gradientCard: ['rgba(108,142,255,0.15)', 'rgba(155,109,255,0.08)'] as const,
  gradientGlass: [
    'rgba(255,255,255,0.12)',
    'rgba(255,255,255,0.04)',
  ] as const,
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const Radius = {
  sm: 8,
  md: 14,
  lg: 20,
  xl: 28,
  full: 999,
};

export const Typography = {
  displayLg: { fontSize: 34, fontWeight: '700' as const, letterSpacing: -0.5 },
  displayMd: { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.3 },
  h1: { fontSize: 22, fontWeight: '700' as const },
  h2: { fontSize: 18, fontWeight: '600' as const },
  h3: { fontSize: 16, fontWeight: '600' as const },
  body: { fontSize: 15, fontWeight: '400' as const, lineHeight: 22 },
  bodySmall: { fontSize: 13, fontWeight: '400' as const, lineHeight: 20 },
  caption: { fontSize: 11, fontWeight: '500' as const, letterSpacing: 0.4 },
  mono: { fontSize: 13, fontFamily: 'monospace' as const },
};
