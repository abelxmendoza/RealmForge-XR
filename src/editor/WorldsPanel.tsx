import { useEffect, useRef, useState } from 'react'
import {
  deleteSavedWorld,
  downloadWorld,
  importWorld,
  listSavedWorlds,
  loadSavedWorld,
  renameSavedWorld,
  saveWorld,
  useWorldLibrary,
  type ReplaceResult,
} from '../world/persistence'

/**
 * Minimal desktop controls for the world management API (save / load / rename / delete,
 * export / import). Only calls functions from world/persistence.ts, so it can be restyled
 * or replaced freely.
 */
export function WorldsPanel() {
  const worlds = useWorldLibrary((s) => s.worlds)
  const activeId = useWorldLibrary((s) => s.activeId)
  const activeName = useWorldLibrary((s) => s.activeName)
  const [name, setName] = useState(activeName)
  const [msg, setMsg] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => void listSavedWorlds(), [])
  useEffect(() => setName(activeName), [activeName])

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

  return (
    <section>
      <h3>Worlds</h3>
      <label>
        Name
        <input type="text" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="row">
        <button onClick={save}>Save as new</button>
        <button disabled={!activeId} onClick={update} title="Overwrite the save this world came from">
          Update save
        </button>
      </div>
      <div className="row">
        <button onClick={() => downloadWorld(name)}>Export JSON</button>
        <button onClick={() => fileInput.current?.click()}>Import JSON</button>
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
