import { useEffect, useRef, useState } from 'react'
import { REPLAYS, replaySrc } from './replays'

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * "Watch it in action": the recorded replays in one player. Plays muted once scrolled into view
 * (not with reduced motion), moves on to the next clip when one ends, pauses when scrolled away.
 */
export function ReplayReel() {
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [inView, setInView] = useState(false)
  const video = useRef<HTMLVideoElement>(null)
  const frame = useRef<HTMLDivElement>(null)
  /** Becomes true once playback has started, by scrolling into view or a click. */
  const engaged = useRef(false)
  const clip = REPLAYS[index]

  useEffect(() => {
    const el = frame.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.45 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    const v = video.current
    if (!v) return
    if (inView && (engaged.current || !reducedMotion())) {
      engaged.current = true
      void v.play().catch(() => setPlaying(false))
    } else if (!inView) {
      v.pause()
    }
  }, [inView, index])

  const choose = (i: number) => {
    engaged.current = true
    setProgress(0)
    if (i === index) {
      const v = video.current
      if (v) {
        v.currentTime = 0
        void v.play().catch(() => setPlaying(false))
      }
    } else {
      setIndex(i)
    }
  }

  const toggle = () => {
    const v = video.current
    if (!v) return
    engaged.current = true
    if (v.paused) void v.play().catch(() => setPlaying(false))
    else v.pause()
  }

  return (
    <div className="rf-replay">
      <div className="rf-replay-stage" ref={frame}>
        <video
          ref={video}
          key={clip.id}
          className="rf-replay-video"
          poster={replaySrc(clip.id, 'jpg')}
          muted
          playsInline
          preload="metadata"
          aria-label={`Replay: ${clip.title}`}
          onClick={toggle}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onTimeUpdate={(e) => {
            const v = e.currentTarget
            if (v.duration) setProgress(v.currentTime / v.duration)
          }}
          onEnded={() => {
            setProgress(0)
            setIndex((i) => (i + 1) % REPLAYS.length)
          }}
        >
          <source src={replaySrc(clip.id, 'mp4')} type='video/mp4; codecs="avc1.64001f"' />
          <source src={replaySrc(clip.id, 'webm')} type='video/webm; codecs="vp9"' />
        </video>
        <span className="rf-replay-device">{clip.device}</span>
        <button className="rf-replay-toggle" onClick={toggle} aria-label={playing ? 'Pause replay' : 'Play replay'}>
          <span aria-hidden="true">{playing ? '❚❚' : '▶'}</span>
        </button>
      </div>

      <ol className="rf-replay-list" aria-label="Replays">
        {REPLAYS.map((item, i) => (
          <li key={item.id}>
            <button aria-pressed={i === index} onClick={() => choose(i)}>
              <span className="rf-replay-num">
                {String(i + 1).padStart(2, '0')} / {item.device}
              </span>
              <strong>{item.title}</strong>
              <span className="rf-replay-blurb">{item.blurb}</span>
              <span className="rf-replay-bar" aria-hidden="true">
                <i style={{ transform: `scaleX(${i === index ? progress : 0})` }} />
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}
