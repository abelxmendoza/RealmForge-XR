import { useEffect, useRef } from 'react'
import { GUIDE_SECTIONS, getGuideSection } from '../guide/controlsGuide'
import { useGuide } from '../guide/guideStore'
import { useInXRSession } from '../xr/xrStore'

/**
 * Desktop DOM guide. Same content as the XR floating panel (xr/ControlsGuidePanel.tsx), which is what shows
 * during an XR session: this modal stays closed then, because a modal <dialog> makes the page inert and that
 * swallowed every XR press (the guide could be opened in VR but nothing, not even Close, could be pressed).
 * Opens from the HUD "Guide" button; Escape or Close dismisses.
 */
export function ControlsGuide() {
  const open = useGuide((s) => s.open)
  const sectionId = useGuide((s) => s.section)
  const setSection = useGuide((s) => s.setSection)
  const closeGuide = useGuide((s) => s.closeGuide)
  const dialog = useRef<HTMLDialogElement>(null)
  const section = getGuideSection(sectionId)
  const inXR = useInXRSession()

  useEffect(() => {
    const el = dialog.current
    if (!el) return
    const show = open && !inXR
    if (show && !el.open) el.showModal()
    if (!show && el.open) el.close()
  }, [open, inXR])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeGuide()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, closeGuide])

  return (
    <dialog
      ref={dialog}
      className="controls-guide"
      aria-labelledby="controls-guide-title"
      onCancel={(e) => {
        e.preventDefault()
        closeGuide()
      }}
      onClick={(e) => {
        if (e.target === dialog.current) closeGuide()
      }}
    >
      <div className="controls-guide-shell">
        <header className="controls-guide-head">
          <div>
            <p className="controls-guide-kicker">User &amp; controls guide</p>
            <h2 id="controls-guide-title">{section.title}</h2>
          </div>
          <button type="button" className="ghost" onClick={closeGuide} aria-label="Close guide">
            Close
          </button>
        </header>

        <nav className="controls-guide-tabs" aria-label="Guide sections">
          {GUIDE_SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={s.id === sectionId ? 'on' : ''}
              aria-pressed={s.id === sectionId}
              onClick={() => setSection(s.id)}
            >
              {s.tab}
            </button>
          ))}
        </nav>

        <ol className="controls-guide-body">
          {section.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ol>

        <footer className="controls-guide-foot">
          <p>Same guide opens in VR from the wrist menu or control panel.</p>
          <div className="row">
            <button
              type="button"
              onClick={() => {
                const i = GUIDE_SECTIONS.findIndex((s) => s.id === sectionId)
                setSection(GUIDE_SECTIONS[(i - 1 + GUIDE_SECTIONS.length) % GUIDE_SECTIONS.length]!.id)
              }}
            >
              ← Prev
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => {
                const i = GUIDE_SECTIONS.findIndex((s) => s.id === sectionId)
                setSection(GUIDE_SECTIONS[(i + 1) % GUIDE_SECTIONS.length]!.id)
              }}
            >
              Next →
            </button>
          </div>
        </footer>
      </div>
    </dialog>
  )
}
