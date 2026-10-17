/**
 * Laptop/desktop right-click menu for common worldbuilding actions.
 * Browser contextmenu only — not an XR menu.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useWorld, type Tool } from '../world/store'
import { openWorldLibrary } from './WorldLibrary'
import { quickSave, useWorldLibrary } from '../world/persistence'
import { getHistoryState, redo, undo, subscribeHistory } from '../world/history'
import { deleteSelected, duplicateSelected } from './Obstacles'
import { useEditor } from './settings'
import { blockRoute } from './demo'
import { getSharedVoiceController, type VoiceController } from '../voice'

type Panel =
  | { kind: 'menu'; x: number; y: number }
  | { kind: 'voice' }

type Item =
  | {
      kind: 'action'
      id: string
      label: string
      shortcut?: string
      disabled?: boolean
      danger?: boolean
      run: () => void | Promise<void>
    }
  | { kind: 'sep' }

const TOOLS: { id: Tool; label: string }[] = [
  { id: 'select', label: 'Select / move' },
  { id: 'wall', label: 'Draw wall' },
  { id: 'building', label: 'Building' },
  { id: 'goal', label: 'Set destination' },
  { id: 'robot', label: 'Place robot' },
  { id: 'platform', label: 'Platform / road' },
  { id: 'decor', label: 'Decoration' },
]

function isEditableTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false
  if (t.isContentEditable) return true
  const tag = t.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

export function DesktopContextMenu() {
  const [panel, setPanel] = useState<Panel | null>(null)
  const [hist, setHist] = useState(() => getHistoryState())
  const [voiceText, setVoiceText] = useState('')
  const [listening, setListening] = useState(false)
  const [tool, setTool] = useState(() => useWorld.getState().tool)
  const [selectedId, setSelectedId] = useState(() => useWorld.getState().selectedId)
  const [snap, setSnap] = useState(() => useEditor.getState().snap)
  const [dirty, setDirty] = useState(() => useWorldLibrary.getState().dirty)
  const rootRef = useRef<HTMLDivElement>(null)
  const voiceRef = useRef<VoiceController | null>(null)
  const ignoreOutside = useRef(false)

  useEffect(() => subscribeHistory((s) => setHist(s)), [])
  useEffect(
    () =>
      useWorld.subscribe((s) => {
        setTool(s.tool)
        setSelectedId(s.selectedId)
      }),
    [],
  )
  useEffect(() => useEditor.subscribe((s) => setSnap(s.snap)), [])
  useEffect(() => useWorldLibrary.subscribe((s) => setDirty(s.dirty)), [])

  useEffect(() => {
    const voice = getSharedVoiceController({
      provider: 'mock',
      fallbackToMock: true,
      confirm: async (req) => window.confirm(req.message),
    })
    voiceRef.current = voice
    return voice.subscribe((s) => setListening(s.isListening))
  }, [])

  const close = useCallback(() => {
    setPanel(null)
    setVoiceText('')
    ignoreOutside.current = false
  }, [])

  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      if (isEditableTarget(e.target)) return
      if (e.target instanceof Node && rootRef.current?.contains(e.target) && isEditableTarget(e.target)) return
      e.preventDefault()
      setVoiceText('')
      setPanel({ kind: 'menu', x: e.clientX, y: e.clientY })
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    const onPointerDownCapture = (e: PointerEvent) => {
      if (ignoreOutside.current) return
      if (!rootRef.current) return
      if (e.target instanceof Node && rootRef.current.contains(e.target)) return
      close()
    }
    window.addEventListener('contextmenu', onContextMenu)
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointerDownCapture, true)
    return () => {
      window.removeEventListener('contextmenu', onContextMenu)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointerDownCapture, true)
    }
  }, [close])

  useLayoutEffect(() => {
    if (panel?.kind !== 'menu' || !rootRef.current) return
    const rect = rootRef.current.getBoundingClientRect()
    const pad = 8
    let x = panel.x
    let y = panel.y
    if (x + rect.width > window.innerWidth - pad) x = Math.max(pad, window.innerWidth - rect.width - pad)
    if (y + rect.height > window.innerHeight - pad) y = Math.max(pad, window.innerHeight - rect.height - pad)
    if (x !== panel.x || y !== panel.y) setPanel({ kind: 'menu', x, y })
  }, [panel])

  if (!panel) return null


  const items: Item[] = [
    {
      kind: 'action',
      id: 'voice-type',
      label: 'Type a command…',
      run: () => {
        ignoreOutside.current = true
        setVoiceText('')
        setPanel({ kind: 'voice' })
        // Allow outside-dismiss again after the opening gesture finishes.
        window.setTimeout(() => {
          ignoreOutside.current = false
        }, 0)
      },
    },
    {
      kind: 'action',
      id: 'voice-toggle',
      label: listening ? 'Stop voice listening' : 'Start voice listening',
      run: async () => {
        const voice = voiceRef.current
        if (!voice) return
        if (listening) await voice.stopListening()
        else await voice.startListening()
      },
    },
    { kind: 'sep' },
    ...TOOLS.map(
      (t): Item => ({
        kind: 'action',
        id: `tool-${t.id}`,
        label: `${t.label}${tool === t.id ? ' ✓' : ''}`,
        run: () => useWorld.getState().setTool(t.id),
      }),
    ),
    { kind: 'sep' },
    {
      kind: 'action',
      id: 'duplicate',
      label: 'Duplicate',
      shortcut: 'D',
      disabled: !selectedId,
      run: () => duplicateSelected(),
    },
    {
      kind: 'action',
      id: 'delete',
      label: 'Delete selected',
      shortcut: 'Del',
      disabled: !selectedId,
      danger: true,
      run: () => deleteSelected(),
    },
    {
      kind: 'action',
      id: 'clear-sel',
      label: 'Clear selection',
      shortcut: 'Esc',
      disabled: !selectedId,
      run: () => useWorld.getState().select(null),
    },
    { kind: 'sep' },
    {
      kind: 'action',
      id: 'undo',
      label: 'Undo',
      shortcut: 'Ctrl+Z',
      disabled: !hist.canUndo,
      run: () => {
        undo()
      },
    },
    {
      kind: 'action',
      id: 'redo',
      label: 'Redo',
      shortcut: 'Ctrl+Shift+Z',
      disabled: !hist.canRedo,
      run: () => {
        redo()
      },
    },
    {
      kind: 'action',
      id: 'save',
      label: dirty ? 'Save world •' : 'Save world',
      shortcut: 'Ctrl+S',
      run: async () => {
        const r = await quickSave()
        if (!r.ok) console.warn('[RealmForge] save failed:', r.error)
      },
    },
    {
      kind: 'action',
      id: 'snap',
      label: snap ? 'Snap grid ✓' : 'Snap grid',
      shortcut: 'G',
      run: () => useEditor.getState().set({ snap: !useEditor.getState().snap }),
    },
    {
      kind: 'action',
      id: 'block',
      label: 'Block route (demo)',
      shortcut: 'B',
      run: () => blockRoute(),
    },
    { kind: 'sep' },
    { kind: 'action', id: 'worlds', label: 'Worlds library…', run: openWorldLibrary },
  ]

  const activate = (item: Extract<Item, { kind: 'action' }>) => {
    if (item.disabled) return
    const result = item.run()
    if (item.id === 'voice-type') return
    void Promise.resolve(result).finally(() => close())
  }

  if (panel.kind === 'voice') {
    return (
      <div ref={rootRef} className="ctx-voice-backdrop" role="presentation">
        <div
          className="ctx-voice-dialog"
          role="dialog"
          aria-label="Voice command"
          onContextMenu={(e) => e.preventDefault()}
        >
          <div className="ctx-menu-title">Voice command</div>
          <form
            className="ctx-voice"
            onSubmit={(e) => {
              e.preventDefault()
              const text = voiceText.trim()
              if (!text) return
              void (async () => {
                await voiceRef.current?.submitTranscript(text)
                close()
              })()
            }}
          >
            <input
              autoFocus
              value={voiceText}
              onChange={(e) => setVoiceText(e.target.value)}
              placeholder='e.g. "Select wall tool"'
              aria-label="Voice command text"
            />
            <div className="ctx-voice-row">
              <button type="submit">Run</button>
              <button type="button" onClick={close}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={rootRef}
      className="ctx-menu"
      style={{ left: panel.x, top: panel.y }}
      role="menu"
      aria-label="World actions"
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="ctx-menu-title">World actions</div>
      {items.map((item, i) =>
        item.kind === 'sep' ? (
          <div key={`sep-${i}`} className="ctx-sep" role="separator" />
        ) : (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              className={item.danger ? 'danger' : undefined}
              disabled={item.disabled}
              // preventDefault on mousedown keeps the menu from losing the gesture to the WebGL canvas.
              onMouseDown={(e) => {
                if (e.button === 0) e.preventDefault()
              }}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                activate(item)
              }}
            >
              <span>{item.label}</span>
              {item.shortcut ? <kbd>{item.shortcut}</kbd> : null}
            </button>
        ),
      )}
    </div>
  )
}
