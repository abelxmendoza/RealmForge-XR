/**
 * RealmForge logo files (public/brand/), resolved against Vite's base URL so they work
 * when the app is served from a sub-path. Source artwork: the "RF" ember-glass mark.
 */
const base = import.meta.env.BASE_URL ?? '/'

export const BRAND = {
  /** Square mark, small (HUD, nav, favicons). */
  logo: `${base}brand/logo-256.webp`,
  /** Square mark, large (hero, headset panels). */
  logoLarge: `${base}brand/logo-512.webp`,
  /** Original wide artwork. */
  logoWide: `${base}brand/logo-wide.webp`,
} as const
