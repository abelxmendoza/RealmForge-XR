import { requestConfirmation } from '../world/confirmation'
import { useEffect, useRef, useState, type DragEvent } from 'react'
import { listSavedWorlds, useWorldLibrary } from '../world/persistence'
import { redo, undo, subscribeHistory } from '../world/history'
import {
  isWorldsMenuBusy,
  menuDeleteSavedWorld,
  menuDownloadWorld,
  menuImportWorld,
  menuLoadSavedWorld,
  menuQuickSave,
  menuRenameSavedWorld,
  menuSaveWorld,
  type WorldsMenuFeedback,
} from './worldsMenuController'
import { confirmReplace } from '../world/confirmation'

/**
 * Minimal desktop controls for the world management API (save / load / rename / delete,
 * export / import). Routes mutations through worldsMenuController so errors never escape
 * as unhandled rejections and overlapping actions are rejected cleanly.
 */
export function WorldsPanel() {
  const worlds = useWorldLibrary((s) => s.worlds)
  const activeId = useWorldLibrary((s) => s.activeId)
  const activeName = useWorldLibrary((s) => s.activeName)
  const dirty = useWorldLibrary((s) => s.dirty)
  const [name, setName] = useState(activeName)
  const [feedback, setFeedback] = useState<WorldsMenuFeedback>({ kind: 'idle' })
  const [dropHover, setDropHover] = useState(false)
  const [hist, setHist] = useState({ canUndo: false, canRedo: false })
  const fileInput = useRef<HTMLInputElement>(null)
  const busy = feedback.kind === 'busy' || isWorldsMenuBusy()

  useEffect(() => void listSavedWorlds(), [])
  useEffect(() => setName(activeName), [activeName])
  useEffect(() => subscribeHistory((s) => setHist({ canUndo: s.canUndo, canRedo: s.canRedo })), [])

  const apply = (next: WorldsMenuFeedback) => setFeedback(next)

  const save = async () => {
    if (busy) return
    setFeedback({ kind: 'busy', action: 'Save' })
    apply((await menuSaveWorld(name)).feedback)
  }
  const update = async () => {
    if (busy || !activeId) return
    if (
      !(await requestConfirmation({
        type: 'OVERWRITE_SAVE',
        message: `Overwrite the saved world "${activeName}" with the current world?`,
      }))
    )
      return
    setFeedback({ kind: 'busy', action: 'Save' })
    apply((await menuSaveWorld(name, { overwriteId: activeId, confirmed: true })).feedback)
  }
  const saveQuick = async () => {
    if (busy) return
    setFeedback({ kind: 'busy', action: 'Save' })
    apply((await menuQuickSave(name)).feedback)
  }
  const rename = async (id: string, current: string) => {
    if (busy) return
    const next = window.prompt('Rename saved world', current)
    if (next === null) return
    setFeedback({ kind: 'busy', action: 'Rename' })
    apply((await menuRenameSavedWorld(id, next)).feedback)
  }
  const remove = async (id: string, label: string) => {
    if (busy) return
    if (!(await requestConfirmation({ type: 'DELETE', message: `Delete the saved world "${label}"? This cannot be undone.` }))) return
    setFeedback({ kind: 'busy', action: 'Delete' })
    apply((await menuDeleteSavedWorld(id, label)).feedback)
  }

  const importFile = async (f: File) => {
    if (busy) return
    setFeedback({ kind: 'busy', action: 'Import' })
    apply((await menuImportWorld(f, confirmReplace)).feedback)
  }

  const onDrop = async (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDropHover(false)
    const f = [...(e.dataTransfer.files ?? [])].find((file) => /\.json$/i.test(file.name) || file.type === 'application/json')
    if (f) await importFile(f)
  }

  const status =
    feedback.kind === 'busy'
      ? `${feedback.action}…`
      : feedback.kind === 'ok'
        ? feedback.message
        : feedback.kind === 'error'
          ? feedback.message
          : feedback.kind === 'cancelled'
            ? 'Cancelled.'
            : null

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
        <input type="text" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} disabled={busy} />
      </label>
      <div className="row">
        <button type="button" className="primary" disabled={busy} onClick={() => void saveQuick()} title="Save this world (Ctrl+S)">
          Save World
        </button>
        <button type="button" disabled={busy} onClick={() => void save()} title="Save a new copy under this name">
          Save as New
        </button>
        <button type="button" disabled={!activeId || busy} onClick={() => void update()} title={activeId ? 'Overwrite the save this world came from' : 'Open a saved world first'}>
          Update Save
        </button>
      </div>
      <div className="row">
        <button
          type="button"
          className="ghost"
          disabled={busy}
          title="Download a JSON file of this world"
          onClick={() => {
            if (busy) return
            setFeedback({ kind: 'busy', action: 'Export' })
            void menuDownloadWorld(name).then(({ feedback: next }) => apply(next))
          }}
        >
          Export
        </button>
        <button type="button" className="ghost" disabled={busy} title="Import a previously exported JSON world" onClick={() => fileInput.current?.click()}>
          Import
        </button>
        <button type="button" disabled={!hist.canUndo || busy} onClick={() => undo()} title="Ctrl+Z">
          Undo
        </button>
        <button type="button" disabled={!hist.canRedo || busy} onClick={() => redo()} title="Ctrl+Shift+Z">
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
            if (f) await importFile(f)
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
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setFeedback({ kind: 'busy', action: 'Load' })
                  apply((await menuLoadSavedWorld(w.id, confirmReplace)).feedback)
                }}
              >
                Load
              </button>
              <button type="button" className="ghost" disabled={busy} onClick={() => void rename(w.id, w.name)}>
                Rename
              </button>
              <button type="button" className="danger" disabled={busy} onClick={() => void remove(w.id, w.name)} aria-label={`Delete ${w.name}`}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      {status && (
        <p className={`hint${feedback.kind === 'error' ? ' toast-err' : feedback.kind === 'ok' ? ' toast' : ''}`} role="status" aria-live="polite">
          {status}
        </p>
      )}
    </section>
  )
}
