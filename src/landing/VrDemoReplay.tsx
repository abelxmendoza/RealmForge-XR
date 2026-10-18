import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { editorHref } from './entry'
import { createDemoScene, type DemoScene } from './vrDemo/scene'
import {
  ATTENDEE_START,
  CHAPTERS,
  DURATION,
  REPLAN_AT,
  ROUTE_PLANNED,
  ROUTE_REPLANNED,
  SAVED_AT,
  chapterAt,
  pathLength,
} from './vrDemo/timeline'

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const PLANNED_M = pathLength(ROUTE_PLANNED)
const REPLANNED_M = pathLength(ROUTE_PLANNED.slice(0, 4)) + pathLength(ROUTE_REPLANNED)

/**
 * Simulated first-person replay of the headset workflow (scripted, not a capture).
 * Lazy-loaded from the landing page so three.js only downloads when someone opens it.
 */
export default function VrDemoReplay({ onClose }: { onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const sceneRef = useRef<DemoScene | null>(null)
  const timeRef = useRef(0)
  const playingRef = useRef(true)
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [stereo, setStereo] = useState(false)
  const [failed, setFailed] = useState(false)

  const play = (on: boolean) => {
    if (on && timeRef.current >= DURATION) timeRef.current = 0
    playingRef.current = on
    setPlaying(on)
  }
  const seek = (t: number) => {
    timeRef.current = Math.min(DURATION, Math.max(0, t))
    setTime(timeRef.current)
  }

  useEffect(() => {
    const canvas = canvasRef.current!
    let demo: DemoScene
    try {
      demo = createDemoScene(canvas, { motion: !window.matchMedia('(prefers-reduced-motion: reduce)').matches })
    } catch {
      setFailed(true)
      return
    }
    sceneRef.current = demo
    const ro = new ResizeObserver(() => demo.resize())
    ro.observe(canvas)

    let raf = 0
    let last = performance.now()
    let lastUi = 0
    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      if (playingRef.current) {
        timeRef.current = Math.min(DURATION, timeRef.current + dt)
        if (timeRef.current >= DURATION) {
          playingRef.current = false
          setPlaying(false)
        }
      }
      demo.render(timeRef.current)
      if (now - lastUi > 66) {
        lastUi = now
        setTime(timeRef.current)
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      demo.dispose()
      sceneRef.current = null
    }
  }, [])

  useEffect(() => sceneRef.current?.setStereo(stereo), [stereo])

  // Modal behaviour: lock page scroll, focus the dialog, keyboard shortcuts, restore focus on close.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === ' ' && !(e.target instanceof HTMLButtonElement || e.target instanceof HTMLInputElement)) {
        e.preventDefault()
        play(!playingRef.current)
      } else if (e.key === 'ArrowRight' && !(e.target instanceof HTMLInputElement)) seek(timeRef.current + 5)
      else if (e.key === 'ArrowLeft' && !(e.target instanceof HTMLInputElement)) seek(timeRef.current - 5)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      previous?.focus()
    }
  }, [onClose])

  const chapter = chapterAt(time)
  const simOn = time > ATTENDEE_START - 0.5 && time < 43.2
  const replanned = time >= REPLAN_AT
  const saved = time > SAVED_AT && time < DURATION - 0.6

  return (
    <div className="rf-demo-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="rf-demo" role="dialog" aria-modal="true" aria-labelledby="rf-demo-title" aria-describedby="rf-demo-desc">
        <header className="rf-demo-head">
          <div>
            <p className="rf-demo-kicker">
              <span className="rf-demo-rec" aria-hidden="true" /> SIMULATED REPLAY · HEADSET POV
            </p>
            <h2 id="rf-demo-title">A venue, built from inside the headset</h2>
          </div>
          <button ref={closeRef} className="rf-demo-close" onClick={onClose} aria-label="Close demo">
            ✕
          </button>
        </header>

        <div className="rf-demo-body">
          <div className={`rf-demo-view${stereo ? ' is-stereo' : ''}`}>
            <canvas ref={canvasRef} aria-label="First-person view of the RealmForge editor in a VR headset" role="img" />
            <div className="rf-demo-lens" aria-hidden="true" />
            {failed && <p className="rf-demo-fallback">This browser could not start WebGL, so the replay can’t play here.</p>}
            <div className="rf-demo-hud" aria-hidden="true">
              <span>
                {String(chapter + 1).padStart(2, '0')} · {CHAPTERS[chapter].title.toUpperCase()}
              </span>
              <span>{fmt(time)} / {fmt(DURATION)}</span>
            </div>
            {simOn && (
              <div className={`rf-demo-sim${replanned ? ' is-replanned' : ''}`} aria-hidden="true">
                <b>{replanned ? 'ROUTE REPLANNED' : 'ATTENDEE · WALKING'}</b>
                <span>
                  path {replanned ? REPLANNED_M.toFixed(1) : PLANNED_M.toFixed(1)} m{replanned && ` (was ${PLANNED_M.toFixed(1)} m)`}
                </span>
              </div>
            )}
            {saved && (
              <div className="rf-demo-toast" aria-hidden="true">
                ✓ Saved “Job Fair draft” to your world library
              </div>
            )}
            <p className="rf-demo-caption" id="rf-demo-desc" aria-live="polite">
              {CHAPTERS[chapter].detail}
            </p>
          </div>

          <ol className="rf-demo-steps" aria-label="Workflow steps">
            {CHAPTERS.map((c, i) => (
              <li key={c.title} className={i === chapter ? 'is-current' : i < chapter ? 'is-done' : ''}>
                <button onClick={() => (seek(c.start), play(true))} aria-current={i === chapter ? 'step' : undefined}>
                  <span>{String(i + 1).padStart(2, '0')}</span>
                  {c.title}
                </button>
              </li>
            ))}
          </ol>
        </div>

        <div className="rf-demo-controls">
          <button className="rf-demo-play" onClick={() => play(!playing)} aria-label={playing ? 'Pause' : time >= DURATION ? 'Replay' : 'Play'}>
            {playing ? '❚❚' : time >= DURATION ? '↻' : '▶'}
          </button>
          <input
            type="range"
            min={0}
            max={DURATION}
            step={0.1}
            value={time}
            onChange={(e) => seek(Number(e.target.value))}
            aria-label="Seek"
            aria-valuetext={`${fmt(time)} — ${CHAPTERS[chapter].title}`}
            style={{ '--rf-progress': `${(time / DURATION) * 100}%` } as CSSProperties}
          />
          <label className="rf-demo-toggle">
            <input type="checkbox" checked={stereo} onChange={(e) => setStereo(e.target.checked)} />
            Per-eye view
          </label>
          <a className="rf-demo-try" href={editorHref('empty-event-venue')}>
            Try it yourself ↗
          </a>
        </div>
        <p className="rf-demo-rotate">
          <span aria-hidden="true">📱</span> Turn your phone sideways for a full-screen view.
        </p>
        <p className="rf-demo-note">
          Scripted preview rendered in your browser to show the workflow — not a recording from a physical headset.
        </p>
      </div>
    </div>
  )
}
