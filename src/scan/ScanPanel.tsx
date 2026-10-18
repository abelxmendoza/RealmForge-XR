import { useRef, useState } from 'react'
import { requestConfirmation } from '../world/confirmation'
import { scaleFromMeasurement } from './analyze'
import { DEFAULT_CUT, importScanFile } from './importScan'
import { openScanPanel, patchScan, setScan, startMeasuring, useScan } from './store'

const STEP = Math.PI / 36
/** Turn relative to the squared-up position, folded into (−180°, 180°]. */
const turnLabel = (r: number) => {
  const d = Math.round(((((r * 180) / Math.PI + 180) % 360) + 360) % 360 - 180)
  return d === 0 || d === -180 ? (d ? 'Squared up · turned 180°' : 'Squared up with the grid') : `Turned ${d}° from square`
}
const fileSize = (bytes: number) => (bytes < 1048576 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1048576).toFixed(1)} MB`)

/** Side panel for an imported real-world scan: import, line up, measure to scale, opacity, remove. */
export function ScanPanel() {
  const { scan, status, message, measuring, measurePoints } = useScan()
  const file = useRef<HTMLInputElement>(null)
  const [note, setNote] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [real, setReal] = useState('')
  const [captureHelp, setCaptureHelp] = useState<'iphone' | 'realsense'>('iphone')
  const relink = status === 'missing'

  const choose = async (f: File | undefined) => {
    if (!f) return
    setNote(null)
    const r = await importScanFile(f, { relink })
    if (!r.ok) setNote({ kind: 'error', text: r.error })
    else setNote({ kind: 'ok', text: r.warning ?? 'Scan imported: floor detected and walls squared to the grid.' })
  }

  const measured =
    measurePoints.length === 2
      ? Math.hypot(...([0, 1, 2] as const).map((i) => measurePoints[1][i] - measurePoints[0][i]))
      : null

  const applyScale = () => {
    if (!scan || measured === null) return
    const next = scaleFromMeasurement(scan.scale, measured, Number(real))
    if (next === null) return setNote({ kind: 'error', text: 'Enter the real distance in metres.' })
    patchScan({ scale: next })
    startMeasuring(false)
    setReal('')
    setNote({ kind: 'ok', text: `Scale set: the two points are now ${Number(real)} m apart.` })
  }

  const nudge = (axis: 0 | 1 | 2, by: number) => {
    if (!scan) return
    const offset = [...scan.offset] as [number, number, number]
    offset[axis] = Math.round((offset[axis] + by) * 1000) / 1000
    patchScan({ offset })
  }

  return (
    <section className="scan-panel">
      <h3>Real-world scan</h3>
      <input
        ref={file}
        type="file"
        accept=".glb,.gltf,.obj,model/gltf-binary,model/gltf+json,text/plain"
        hidden
        onChange={(e) => {
          void choose(e.target.files?.[0])
          e.target.value = ''
        }}
      />

      {!scan ? (
        <>
          <p className="hint">
            Turn a real room into a 3D backdrop for worldbuilding. Choose how to capture it, export a single
            <strong> .glb or .obj</strong> mesh, then import it here.
          </p>
          <div className="row" role="group" aria-label="Scan capture method">
            <button type="button" className={captureHelp === 'iphone' ? 'on' : ''} aria-pressed={captureHelp === 'iphone'} onClick={() => setCaptureHelp('iphone')}>
              iPhone
            </button>
            <button type="button" className={captureHelp === 'realsense' ? 'on' : ''} aria-pressed={captureHelp === 'realsense'} onClick={() => setCaptureHelp('realsense')}>
              RealSense D455
            </button>
          </div>
          {captureHelp === 'iphone' ? (
            <p className="hint">
              <strong>iPhone capture:</strong> Scan a room using a 3D scanning app such as Polycam or Scaniverse.
              Export an OBJ mesh (or GLB, if available) and select it below. OBJ material textures are not imported. LiDAR is available only on supported iPhone Pro models;
              other iPhones may use photo-based reconstruction when supported by the scanning app.
              A normal photo or live camera stream alone is not a 3D scan. For the iPhone 15 (non-Pro), choose Scaniverse photogrammetry mesh mode, not LiDAR or a Gaussian splat.
            </p>
            <p className="hint"><a href="https://www.nianticspatial.com/docs/scaniverse/quickstart/" target="_blank" rel="noreferrer">Scaniverse official documentation ↗</a></p>
          ) : (
            <p className="hint">
              <strong>RealSense D455 capture:</strong> Record RGB-D frames on your computer using librealsense,
              reconstruct a room with RTAB-Map or another RGB-D mapping tool, then export a GLB.
              The browser cannot directly read the D455 through this importer.
            </p>
          )>
          <div className="row">
            <button className="primary" disabled={status === 'loading'} onClick={() => file.current?.click()}>
              {status === 'loading' ? 'Reading scan…' : 'Import scan (.glb / .obj)'}
            </button>
          </div>
          <p className="hint">RealmForge estimates floor and wall alignment. The file stays on this device. Scanned geometry is visual-only until navigation obstacles are added.</p>
        </>
      ) : (
        <>
          <p className="scan-file">
            <strong title={scan.name}>{scan.name}</strong>
            <small>
              {fileSize(scan.bytes)} · about {(scan.analysis.footprint[0] * scan.scale).toFixed(1)} ×{' '}
              {(scan.analysis.footprint[1] * scan.scale).toFixed(1)} m
            </small>
          </p>
          {(status === 'missing' || status === 'error') && (
            <div className="scan-alert" role="alert">
              <p>{message}</p>
              {relink && <button onClick={() => file.current?.click()}>Import the file again</button>}
            </div>
          )}
          {status === 'loading' && <p className="hint">{message ?? 'Loading scan…'}</p>}

          <h4>Line it up</h4>
          <div className="row">
            <button title="Turn 90° left" onClick={() => patchScan({ rotationY: scan.rotationY + Math.PI / 2 })}>⟲ 90°</button>
            <button title="Turn 5° left" onClick={() => patchScan({ rotationY: scan.rotationY + STEP })}>−5°</button>
            <button title="Turn 5° right" onClick={() => patchScan({ rotationY: scan.rotationY - STEP })}>+5°</button>
            <button title="Turn 90° right" onClick={() => patchScan({ rotationY: scan.rotationY - Math.PI / 2 })}>⟳ 90°</button>
          </div>
          <div className="row">
            <button title="Square the walls up with the grid again" onClick={() => patchScan({ rotationY: -scan.analysis.wallAngle })}>
              Straighten to grid
            </button>
            <span className="hint">{turnLabel(scan.rotationY + scan.analysis.wallAngle)}</span>
          </div>
          <div className="row scan-nudge" aria-label="Move the scan">
            <button title="Move west 0.5 m" onClick={() => nudge(0, -0.5)}>←</button>
            <button title="Move north 0.5 m" onClick={() => nudge(2, -0.5)}>↑</button>
            <button title="Move south 0.5 m" onClick={() => nudge(2, 0.5)}>↓</button>
            <button title="Move east 0.5 m" onClick={() => nudge(0, 0.5)}>→</button>
            <button title="Raise 2 cm" onClick={() => nudge(1, 0.02)}>Floor ▲</button>
            <button title="Lower 2 cm" onClick={() => nudge(1, -0.02)}>Floor ▼</button>
          </div>
          <div className="row">
            <button onClick={() => patchScan({ offset: [0, 0, 0] })} disabled={scan.offset.every((v) => v === 0)}>
              Re-centre
            </button>
          </div>

          <h4>Scale</h4>
          {!measuring ? (
            <>
              <p className="hint">
                Phone scans are usually true to size. To check, click two points you know the distance between (a doorway, a
                wall).
              </p>
              <div className="row">
                <button onClick={() => startMeasuring(true)}>Measure to set scale</button>
              </div>
            </>
          ) : (
            <>
              <p className="hint">
                {measured === null
                  ? `Click ${measurePoints.length ? 'the second' : 'the first'} point on the scan.`
                  : `Those points are ${measured.toFixed(2)} m apart in the plan. How far apart are they really?`}
              </p>
              {measured !== null && (
                <div className="row">
                  <label className="field">
                    Real distance (m)
                    <input type="number" min="0" step="0.01" inputMode="decimal" value={real} onChange={(e) => setReal(e.target.value)} />
                  </label>
                  <button className="primary" onClick={applyScale} disabled={!(Number(real) > 0)}>
                    Apply
                  </button>
                </div>
              )}
              <div className="row">
                <button className="ghost" onClick={() => startMeasuring(false)}>
                  Cancel
                </button>
              </div>
            </>
          )}

          <h4>Display</h4>
          <label className="field">
            Opacity {Math.round(scan.opacity * 100)}%
            <input
              type="range"
              min="0.1"
              max="1"
              step="0.05"
              value={scan.opacity}
              onChange={(e) => patchScan({ opacity: Number(e.target.value) })}
            />
          </label>
          <div className="row">
            <button
              className={scan.cutHeight !== null ? 'on' : ''}
              aria-pressed={scan.cutHeight !== null}
              title="Cut the scan away above a height so ceilings and roofs don't hide the floor plan"
              onClick={() => patchScan({ cutHeight: scan.cutHeight === null ? DEFAULT_CUT : null })}
            >
              {scan.cutHeight === null ? 'Ceiling shown' : 'Ceiling cut away'}
            </button>
          </div>
          {scan.cutHeight !== null && (
            <label className="field">
              Cut at {scan.cutHeight.toFixed(1)} m
              <input
                type="range"
                min="0.5"
                max="12"
                step="0.1"
                value={scan.cutHeight}
                onChange={(e) => patchScan({ cutHeight: Number(e.target.value) })}
              />
            </label>
          )}
          <div className="row">
            <button className={scan.visible ? 'on' : ''} aria-pressed={scan.visible} onClick={() => patchScan({ visible: !scan.visible })}>
              {scan.visible ? 'Showing scan' : 'Scan hidden'}
            </button>
            <button onClick={() => file.current?.click()}>Replace…</button>
            <button
              className="ghost danger"
              onClick={() =>
                void requestConfirmation({ type: 'DELETE', message: `Remove "${scan.name}" from this world?` }).then((ok) => {
                  if (ok) setScan(null)
                })
              }
            >
              Remove
            </button>
          </div>
          <p className="hint">
            The scan is a backdrop: props, the robot and attendees don’t collide with it yet, so trace key walls with Wall or
            Barrier props.
          </p>
        </>
      )}

      {note && (
        <p className={note.kind === 'error' ? 'scan-error' : 'hint'} role={note.kind === 'error' ? 'alert' : 'status'}>
          {note.text}
        </p>
      )}
      <div className="row">
        <button className="ghost" onClick={() => openScanPanel(false)}>
          Close
        </button>
      </div>
    </section>
  )
}
