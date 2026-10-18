/**
 * Self-hosted brand fonts (Sora for UI, Bricolage Grotesque for the wordmark), so the editor and the
 * XR panels look the same offline as online. index.html still links Google Fonts; these win either way.
 */
import '@fontsource/sora/latin-400.css'
import '@fontsource/sora/latin-500.css'
import '@fontsource/sora/latin-600.css'
import '@fontsource/bricolage-grotesque/latin-700.css'
import '@fontsource/bricolage-grotesque/latin-800.css'
import soraWoff from '@fontsource/sora/files/sora-latin-600-normal.woff?url'

/** For troika / drei `<Text font>`: without a font it fetches glyph data from a CDN at runtime. */
export const SORA_WOFF = soraWoff

/** Resolves once the fonts canvas-drawn XR panels use are ready (or right away where unsupported). */
export function uiFontsReady(): Promise<unknown> {
  if (typeof document === 'undefined' || !document.fonts?.load) return Promise.resolve()
  return Promise.all([
    document.fonts.load('600 24px Sora'),
    document.fonts.load('500 24px Sora'),
    document.fonts.load('800 24px "Bricolage Grotesque"'),
  ]).catch(() => undefined)
}
