import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { BRAND } from '../theme/brand'
import { getThumbnail, listTemplates, openWorld, startFromTemplate, type TemplateId } from '../world/library'
import { listSavedWorlds, useWorldLibrary } from '../world/persistence'
import { openWorldLibrary, swatch } from './WorldLibrary'

/** Shown when the editor opens without a world picked on the landing page. */
export const useStartChooser = create<{ open: boolean }>(() => ({ open: false }))
export const showStartChooser = () => useStartChooser.setState({ open: true })

/**
 * "Start a world" screen: an empty world, every environment, or a saved world.
 * Nothing has been edited yet, so a choice replaces the starter scene without asking.
 */
export function StartChooser() {
  const open = useStartChooser((s) => s.open)
  return open ? <Chooser /> : null
}

function Chooser() {
  const worlds = useWorldLibrary((s) => s.worlds)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => void listSavedWorlds(), [])
  const close = () => useStartChooser.setState({ open: false })

  const pick = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const r = await fn()
      if (r.ok) close()
      else setError(r.error ?? 'That world could not be opened.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="start-backdrop">
      <div className="start" role="dialog" aria-modal="true" aria-labelledby="start-title">
        <header>
          <img src={BRAND.logo} width="44" height="44" alt="" />
          <div>
            <h2 id="start-title">Start a world</h2>
            <p>Pick an empty board or one of the environments. You can switch any time from the Worlds library.</p>
          </div>
        </header>

        <div className="start-templates">
          {listTemplates().map((t) => (
            <button key={t.id} className={t.id === 'blank' ? 'start-card blank' : 'start-card'} disabled={busy} onClick={() => void pick(() => startFromTemplate(t.id as TemplateId))}>
              <span className="swatch" style={{ background: swatch(t.id as TemplateId) }}>
                {t.id === 'blank' ? '+' : ''}
              </span>
              <strong>{t.id === 'blank' ? 'Empty world' : t.name}</strong>
              <small>{t.description}</small>
            </button>
          ))}
        </div>

        {worlds.length > 0 && (
          <>
            <h3>Continue a saved world</h3>
            <div className="start-saved">
              {worlds.slice(0, 6).map((w) => {
                const thumb = getThumbnail(w.id)
                return (
                  <button key={w.id} className="start-saved-card" disabled={busy} onClick={() => void pick(() => openWorld(w.id, { confirmReplace: () => true }))}>
                    <span className="thumb">{thumb ? <img src={thumb} alt="" /> : w.name.slice(0, 1).toUpperCase()}</span>
                    <strong title={w.name}>{w.name}</strong>
                    <small>{w.objectCount} objects</small>
                  </button>
                )
              })}
            </div>
          </>
        )}

        <footer>
          {error && <p className="start-error">{error}</p>}
          {worlds.length > 6 && (
            <button
              onClick={() => {
                close()
                openWorldLibrary()
              }}
            >
              All saved worlds…
            </button>
          )}
          <button className="link" onClick={close}>
            Keep the starter scene
          </button>
        </footer>
      </div>
    </div>
  )
}
