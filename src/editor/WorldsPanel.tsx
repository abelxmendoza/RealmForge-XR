import { useEffect, useRef, useState, type DragEvent } from 'react'
import {
  deleteSavedWorld,
  downloadWorld,
  importWorld,
  listSavedWorlds,
  loadSavedWorld,
  quickSave,
  renameSavedWorld,
  saveWorld,
  useWorldLibrary,
  type ReplaceResult,
} from '../world/persistence'
import { redo, undo, subscribeHistory } from '../world/history'

/**
 * Minimal desktop controls for the world management API (save / load / rename / delete,
 * export / import). Only calls functions from world/persistence.ts, so it can be restyled
 * or replaced freely.
 */
export function WorldsPanel() {
  const worlds = useWorldLibrary((s) => s.worlds)
  const activeId = useWorldLibrary((s) => s.activeId)
  const activeName = useWorldLibrary((s) => s.activeName)
  const dirty = useWorldLibrary((s) => s.dirty)
  const [name, setName] = useState(activeName)
  const [msg, setMsg] = useState<string | null>(null)
  const [dropHover, setDropHover] = useState(false)
  const [hist, setHist] = useState({ canUndo: false, canRedo: false })
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => void listSavedWorlds(), [])
  useEffect(() => setName(activeName), [activeName])
  useEffect(() => subscribeHistory((s) => setHist({ canUndo: s.canUndo, canRedo: s.canRedo })), [])

  const report = (r: ReplaceResult, done: string) => {
    if (r.ok) setMsg(r.warnings.length ? `${done} with ${r.warnings.length} fix(es): ${r.warnings[0]}` : done)
    else if (!r.cancelled) setMsg(r.error)
  }

  const save = () => {
    const r = saveWorld(name)
    setMsg(r.ok ? `Saved "${r.value.name}".` : r.error)
  }
  const update = () => {
    if (!activeId || !window.confirm(`Overwrite the saved world "${activeName}" with the current world?`)) return
    const r = saveWorld(name, { overwriteId: activeId })
    setMsg(r.ok ? `Updated "${r.value.name}".` : r.error)
  }
  const saveQuick = () => {
    const r = quickSave(name)
    setMsg(r.ok ? `Saved "${r.value.name}".` : r.error)
  }
  const rename = (id: string, current: string) => {
    const next = window.prompt('Rename saved world', current)
    if (next === null) return
    const r = renameSavedWorld(id, next)
    if (!r.ok) setMsg(r.error)
  }
  const remove = (id: string, label: string) => {
    if (!window.confirm(`Delete the saved world "${label}"? This cannot be undone.`)) return
    const r = deleteSavedWorld(id)
    setMsg(r.ok ? `Deleted "${label}".` : r.error)
  }

  const onDrop = async (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDropHover(false)
    const f = [...(e.dataTransfer.files ?? [])].find((file) => /\.json$/i.test(file.name) || file.type === 'application/json')
    if (f) report(await importWorld(f), `Imported "${f.name}".`)
  }

  return (
    <section
      className={dropHover ? 'drop-target' : undefined}
      onDragEnter={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault()
          setDropHover(true)
        }
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
        }
      }}
      onDragLeave={() => setDropHover(false)}
      onDrop={onDrop}
    >
      <h3>
        Worlds
        {dirty ? <span className="dirty-dot" title="Unsaved changes" /> : null}
      </h3>
      <label>
        Name
        <input type="text" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="row">
        <button onClick={save}>Save as new</button>
        <button disabled={!activeId} onClick={update} title="Overwrite the save this world came from">
          Update save
        </button>
        <button onClick={saveQuick} title="Ctrl+S — update active save, or save as new">
          Save
        </button>
      </div>
      <div className="row">
        <button onClick={() => downloadWorld(name)}>Export JSON</button>
        <button onClick={() => fileInput.current?.click()}>Import JSON</button>
        <button disabled={!hist.canUndo} onClick={() => undo()} title="Ctrl+Z">
          Undo
        </button>
        <button disabled={!hist.canRedo} onClick={() => redo()} title="Ctrl+Shift+Z">
          Redo
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) report(await importWorld(f), `Imported "${f.name}".`)
          }}
        />
      </div>
      <p className="hint">{dropHover ? 'Drop JSON to import…' : 'Drop a .json world here, or Ctrl+S to save.'}</p>
      {worlds.length > 0 && (
        <ul className="worlds">
          {worlds.map((w) => (
            <li key={w.id} className={w.id === activeId ? 'active' : ''}>
              <span title={new Date(w.savedAt).toLocaleString()}>
                {w.name} <small>({w.objectCount})</small>
              </span>
              <button onClick={async () => report(await loadSavedWorld(w.id), `Loaded "${w.name}".`)}>Load</button>
              <button onClick={() => rename(w.id, w.name)}>Rename</button>
              <button onClick={() => remove(w.id, w.name)}>✕</button>
            </li>
          ))}
        </ul>
      )}
      {msg && <p className="hint">{msg}</p>}
    </section>
  )
}
