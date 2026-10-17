import { useEffect, useMemo, useRef, useState } from 'react'
import { create } from 'zustand'
import { DEFAULT_APPEARANCE, getEnvironment } from '../world/environment'
import {
  createWorld,
  deleteWorld,
  duplicateWorld,
  getThumbnail,
  listTemplates,
  filterWorlds,
  nextWorldName,
  openWorld,
  renameWorld,
  thumbVersion,
  type TemplateId,
} from '../world/library'
import { downloadWorld, importWorld, listSavedWorlds, quickSave, saveWorld, useWorldLibrary } from '../world/persistence'
import { getConfirmation, requestConfirmation } from '../world/confirmation'

/** Open/close state for the library palette, so any button or key can open it. */
export const useLibraryPalette = create<{ open: boolean; set: (open: boolean) => void }>((set) => ({ open: false, set: (open) => set({ open }) }))
export const openWorldLibrary = () => useLibraryPalette.getState().set(true)

/**
 * Worlds library palette (desktop): start a new world from a blank board or an environment,
 * save the current one, and browse, open, copy, rename or delete saved worlds.
 * Every action goes through world/library.ts and world/persistence.ts.
 * Open with the "Worlds library" button or the L key.
 */
export function WorldLibrary() {
  const open = useLibraryPalette((s) => s.open)
  useLibraryKey()
  return open ? <Palette /> : null
}

function useLibraryKey() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target
      if (t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement) return
      if ((e.key === 'l' || e.key === 'L') && !e.ctrlKey && !e.metaKey) {
        const s = useLibraryPalette.getState()
        s.set(!s.open)
      } else if (e.key === 'Escape' && !getConfirmation()) useLibraryPalette.getState().set(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

const swatch = (id: TemplateId) => {
  const a = id === 'blank' ? DEFAULT_APPEARANCE : (getEnvironment(id)?.appearance ?? DEFAULT_APPEARANCE)
  return `linear-gradient(135deg, ${a.lighting.background} 0%, ${a.groundColor} 55%, ${a.tableEdge} 100%)`
}

function Palette() {
  // Subscribe so the list refreshes after any save, rename, delete or thumbnail change.
  const library = useWorldLibrary()
  const [query, setQuery] = useState('')
  const [name, setName] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const close = () => useLibraryPalette.getState().set(false)
  // Read storage once on open; after that the store's list stays current.
  useEffect(() => void listSavedWorlds(), [])
  const worlds = filterWorlds(library.worlds, query)
  const suggested = nextWorldName('My world', library.worlds.map((w) => w.name))
  const templates = listTemplates()

  const act = async (label: string, fn: () => Promise<{ ok: boolean; error?: string; cancelled?: boolean }> | { ok: boolean; error?: string }, closeAfter = false) => {
    if (busy) return
    setBusy(true)
    try {
      const r = await fn()
      if (r.ok) {
        setMsg(label)
        if (closeAfter) close()
      } else if (!('cancelled' in r && r.cancelled)) setMsg(r.error ?? 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  const create = (template: TemplateId) =>
    act(`Created "${name.trim() || suggested}".`, () => createWorld(name.trim() || suggested, template), true).then(() => setName(''))

  return (
    <div className="library-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="library" role="dialog" aria-label="Worlds library">
        <header>
          <h2>Worlds library</h2>
          <button className="close" onClick={close} title="Close (Esc)">
            ✕
          </button>
        </header>

        <section>
          <h3>Start a new world</h3>
          <p className="hint">Empty has no content. Job Fair includes registration, employer booths, seating and a stage.</p>
          <div className="library-row">
            <input type="text" placeholder={suggested} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
            <span className="hint">Pick a starting point. It's saved to your library straight away.</span>
          </div>
          <div className="templates">
            {templates.map((t) => (
              <button key={t.id} className="template" disabled={busy} onClick={() => void create(t.id)} title={t.description}>
                <span className="swatch" style={{ background: swatch(t.id) }}>
                  {t.id === 'blank' ? '+' : ''}
                </span>
                <strong>{t.name}</strong>
                <small>{t.description}</small>
              </button>
            ))}
          </div>
        </section>

        <section>
          <h3>
            Current world: {library.activeName}
            {library.dirty ? <span className="dirty-dot" title="Unsaved changes" /> : null}
          </h3>
          <div className="library-row">
            <button disabled={busy} onClick={() => void act('Saved.', () => quickSave())}>
              {library.activeId ? 'Save' : 'Save to library'}
            </button>
            <button disabled={busy} onClick={() => void act('Saved as a new world.', () => saveWorld(library.activeId ? `${library.activeName} (copy)` : library.activeName))}>
              Save as new
            </button>
            <button disabled={busy} onClick={() => downloadWorld()}>Export JSON</button>
            <button disabled={busy} onClick={() => fileInput.current?.click()}>
              Import JSON
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) void act(`Imported "${f.name}".`, () => importWorld(f))
              }}
            />
          </div>
        </section>

        <section className="grow">
          <h3>
            My worlds <small>({library.worlds.length})</small>
            <input className="search" type="search" placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} />
          </h3>
          {worlds.length === 0 ? (
            <p className="hint">{query ? 'No worlds match.' : 'No saved worlds yet. Start one above, or save the current world.'}</p>
          ) : (
            <div className="world-cards">
              {worlds.map((w) => (
                <WorldCard
                  key={w.id}
                  id={w.id}
                  name={w.name}
                  savedAt={w.savedAt}
                  objectCount={w.objectCount}
                  active={w.id === library.activeId}
                  busy={busy}
                  onOpen={() => void act(`Opened "${w.name}".`, () => openWorld(w.id), true)}
                  onCopy={() => void act(`Copied "${w.name}".`, () => duplicateWorld(w.id))}
                  onRename={() => {
                    const next = window.prompt('Rename world', w.name)
                    if (next !== null) void act('Renamed.', () => renameWorld(w.id, next))
                  }}
                  onDelete={() =>
                    void act(`Deleted "${w.name}".`, async () =>
                      (await requestConfirmation({ type: 'DELETE', message: `Delete "${w.name}" from your library? This cannot be undone.` }))
                        ? deleteWorld(w.id)
                        : { ok: false, cancelled: true },
                    )
                  }
                />
              ))}
            </div>
          )}
        </section>
        {msg && <p className="hint status-line">{msg}</p>}
      </div>
    </div>
  )
}

function WorldCard(props: {
  id: string
  name: string
  savedAt: string
  objectCount: number
  active: boolean
  busy: boolean
  onOpen: () => void
  onCopy: () => void
  onRename: () => void
  onDelete: () => void
}) {
  const thumb = useMemo(() => getThumbnail(props.id), [props.id, props.savedAt, thumbVersion.n]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={props.active ? 'world-card active' : 'world-card'}>
      <button className="thumb" onClick={props.onOpen} disabled={props.busy} title="Open">
        {thumb ? <img src={thumb} alt="" /> : <span>{props.name.slice(0, 1).toUpperCase()}</span>}
      </button>
      <div className="meta">
        <strong title={props.name}>{props.name}</strong>
        <small>
          {props.objectCount} objects · {relativeTime(props.savedAt)}
          {props.active ? ' · open now' : ''}
        </small>
      </div>
      <div className="actions">
        <button disabled={props.busy} onClick={props.onOpen}>
          Open
        </button>
        <button disabled={props.busy} onClick={props.onCopy}>
          Copy
        </button>
        <button disabled={props.busy} onClick={props.onRename}>
          Rename
        </button>
        <button disabled={props.busy} onClick={props.onDelete} title="Delete">
          ✕
        </button>
      </div>
    </div>
  )
}

function relativeTime(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (!Number.isFinite(s)) return ''
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return new Date(iso).toLocaleDateString()
}
