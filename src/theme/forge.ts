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
