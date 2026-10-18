/**
 * Shared molten-forge visual tokens for desktop CSS and immersive XR UI.
 * Keep hex values in sync with CSS variables in style.css / landing.css.
 */
export const FORGE = {
  ink: '#0c1018',
  slate: '#151c28',
  panel: '#121925',
  panelMuted: '#182435',
  panelDisabled: '#27303c',
  line: '#5c4a3a',
  lineSoft: '#62768b',
  text: '#f3ebe0',
  textMuted: '#8190a0',
  ember: '#e07845',
  emberHot: '#f0a46a',
  emberDeep: '#b84f28',
  emberActive: '#aa4d12',
  copper: '#d4a574',
  hover: '#3a2a22',
  live: '#5ecf9a',
  warn: '#d94a5c',
  tip: '#7bdff2',
} as const

export type ForgeColor = (typeof FORGE)[keyof typeof FORGE]

/**
 * The desktop HUD's CSS (style.css `:root` and `.hud button` rules) as values, so the XR panels
 * (xr/panel/draw.ts) paint the same panels and buttons. Change both together.
 */
export const HUD = {
  panel: 'rgba(14, 20, 32, 0.9)',
  panelBrandGlow: 'rgba(224, 120, 69, 0.14)',
  line: 'rgba(232, 196, 150, 0.16)',
  lineStrong: 'rgba(232, 196, 150, 0.32)',
  text: '#f3ebe0',
  textHover: '#ffffff',
  muted: 'rgba(243, 235, 224, 0.62)',
  faint: 'rgba(243, 235, 224, 0.38)',
  button: 'rgba(255, 255, 255, 0.04)',
  buttonHover: 'rgba(255, 255, 255, 0.09)',
  onTop: 'rgba(240, 164, 106, 0.95)',
  onBottom: 'rgba(224, 120, 69, 0.9)',
  onText: '#1a100c',
  onGlow: 'rgba(224, 120, 69, 0.35)',
  primaryTop: '#f0a46a',
  primaryBottom: '#e07845',
  dangerLine: 'rgba(239, 107, 124, 0.45)',
  dangerText: '#ffb4bf',
  dangerHover: 'rgba(239, 107, 124, 0.16)',
  chip: 'rgba(0, 0, 0, 0.32)',
  live: '#5ecf9a',
  warn: '#ef6b7c',
  copper: '#d4a574',
  radius: 12,
  radiusSm: 8,
  disabledOpacity: 0.38,
  font: "'Sora', 'Segoe UI', sans-serif",
  fontDisplay: "'Bricolage Grotesque', Georgia, serif",
} as const
