import { switchWorldView } from '../xr/worldView'
import { useWorld } from '../world/store'
import { useRef, useState } from 'react'
import { requestConfirmation } from '../world/confirmation'
import { importScanFile } from './importScan'
import { calibrateScan, scanControls, showAllScans, soloScan } from './actions'
import { downloadPropertyBundle, importPropertyBundle } from './propertyBundle'
import { openScanPanel, patchScan, removeScan, selectScan, startMeasuring, useScan } from './store'

/** Same section state/actions as the in-headset palette; native file pickers run outside immersive XR. */
export function ScanPanel() {
  const { scans, scan, runtime, status, message, measuring, measurePoints } = useScan()
  const file = useRef<HTMLInputElement>(null)
  const bundle = useRef<HTMLInputElement>(null)
  const target = useRef<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ error?: boolean; text: string } | null>(null)
  const [real, setReal] = useState('')
  const choose = async (files: File[]) => {
    setBusy(true); setNote(null)
    const generation = useScan.getState().generation
    const id = target.current
    try {
      for (const f of files) {
        if (generation !== useScan.getState().generation) throw new Error('World changed. Choose the remaining files again.')
        const r = await importScanFile(f, { relink: !!id, targetId: id })
        if (!r.ok) throw new Error(r.error)
        setNote({ text: r.warning ?? 'Section imported. Align shared doorways and verify a known distance.' })
      }
    } catch (e) { setNote({ error: true, text: e instanceof Error ? e.message : 'Import failed.' }) }
    finally { setBusy(false) }
  }
  const pick = (id?: string) => { target.current = id; if (file.current) { file.current.multiple = !id; file.current.click() } }
  const transfer = async (run: () => Promise<unknown>) => {
    setBusy(true); setNote(null)
    try { await run() } catch (e) { setNote({ error: true, text: e instanceof Error ? e.message : 'Transfer failed.' }) }
    finally { setBusy(false) }
  }
  const distance = measurePoints.length === 2 ? Math.hypot(...([0, 1, 2] as const).map((i) => measurePoints[1][i] - measurePoints[0][i])) : null
  return <section className="scan-panel">
    <h3>Property scans</h3>
    <p className="hint">Build a property room by room: kitchen, bathroom, living room, garage, front yard, and backyard. Export mesh GLBs from Scaniverse, then align each section here.</p>
    {/* Open for first-time users (no scans yet); collapsed once a property has sections. */}
    <details className="scan-howto" open={scans.length === 0}>
      <summary>How to scan with Scaniverse</summary>
      <ol>
        <li>Install <a href="https://scaniverse.com" target="_blank" rel="noopener noreferrer">Scaniverse</a> (free on iPhone and Android).</li>
        <li>Scan one room or area at a time. Move slowly and include a doorway that the next room shares.</li>
        <li>Get a <strong>mesh</strong> as a <strong>GLB</strong> file (not a splat):
          <ul>
            <li><strong>Classic</strong> experience: choose <strong>Mesh</strong> when you start, let it process, then <strong>Share → Export Model → GLB</strong>.</li>
            <li><strong>New</strong> experience: capture into a Site, generate a Mesh asset, then download its GLB from Scaniverse Web.</li>
          </ul>
        </li>
        <li>Send the .glb to this device (AirDrop, Google Drive, email, or USB).</li>
        <li>Press <strong>Add scans (.glb)</strong> below, line rooms up at the shared doorway, then use <strong>Measure scale</strong> with a distance you know, like a door width. In the headset, open <strong>Files / names (exit XR)</strong> first.</li>
      </ol>
    </details>
    <p className="hint">Scans are visual references. Trace solid walls for navigation. Raised floors are viewable, but agents currently navigate one flat ground plane.</p>
    <input ref={file} type="file" accept=".glb,model/gltf-binary" multiple hidden onChange={(e) => { const files = Array.from(e.target.files ?? []); e.target.value = ''; if (files.length) void choose(files) }} />
    <input ref={bundle} type="file" accept=".rfproperty" hidden onChange={(e) => {
      const f = e.target.files?.[0]; e.target.value = ''
      if (f) void transfer(async () => { const r = await importPropertyBundle(f); if (!r.ok) throw new Error(r.error); setNote({ text: 'Property opened, including its scan files.' }) })
    }} />
    <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <div className="row">
        <button className="primary" onClick={() => pick()}>{busy ? 'Working…' : 'Add scans (.glb)'}</button>
        <button onClick={() => bundle.current?.click()}>Open property bundle</button>
        <button disabled={!scans.length} onClick={() => void transfer(downloadPropertyBundle)}>Export property bundle</button>
      </div>
      <p className="hint">{scans.length}/24 sections · {(scans.reduce((n, s) => n + s.bytes, 0) / 1048576).toFixed(1)}/250 MB. Prefer small room-sized meshes; hide sections you aren’t using.</p>
      <p className="hint">A property bundle includes your actual scan files for another computer or headset. World JSON keeps alignment only. Files remain local unless you share them.</p>
      {!!scans.length && <>
        <label className="field">Active section
          <select value={scan?.id ?? ''} onChange={(e) => { selectScan(e.target.value); setReal(''); setNote(null) }}>
            {scans.map((s) => <option key={s.id} value={s.id}>{s.name}{s.level ? ` · ${s.level}` : ''}{!s.visible ? ' (hidden)' : ''}{runtime[s.id]?.status === 'missing' ? ' (missing file)' : ''}</option>)}
          </select>
        </label>
        <div className="row"><button onClick={soloScan}>Only this section</button><button onClick={showAllScans}>Show all sections</button></div>
      </>}
      {scan && <>
        <label className="field">Section name<input value={scan.name} maxLength={120} onChange={(e) => patchScan({ name: e.target.value })} /></label>
        <label className="field">Floor / area label<input placeholder="Ground floor, Upstairs, Outdoors…" value={scan.level ?? ''} maxLength={60} onChange={(e) => patchScan({ level: e.target.value })} /></label>
        <p className="hint">{(scan.bytes / 1048576).toFixed(1)} MB · {(scan.analysis.footprint[0] * scan.scale).toFixed(1)} × {(scan.analysis.footprint[1] * scan.scale).toFixed(1)} m · {scan.visible ? status : 'hidden'}</p>
        {(status === 'missing' || status === 'error') && <p className="scan-alert" role="alert">{message} Use Re-link selected file below.</p>}
        <h4>Align this section</h4>
        <p className="hint">Use a shared doorway to line up adjacent rooms. Coordinates are metres in the same property space on web and in VR.</p>
        <div className="row">{scanControls().map((c) => <button key={c.id} onClick={c.run} disabled={c.disabled} className={c.active ? 'on' : ''}>{c.label}</button>)}</div>
        {(['East / west (m)', 'Floor elevation (m)', 'North / south (m)'] as const).map((label, axis) => <label className="field" key={axis}>{label}
          <input type="number" step="0.02" min="-10000" max="10000" value={scan.offset[axis]} onChange={(e) => {
            const n = e.target.valueAsNumber
            if (Number.isFinite(n) && Math.abs(n) <= 10000) { const offset = [...scan.offset] as [number, number, number]; offset[axis] = n; patchScan({ offset }) }
          }} />
        </label>)}
        <h4>Measure to set scale</h4>
        {!measuring ? <button disabled={!scan.visible || status !== 'ready'} onClick={() => { setReal(''); startMeasuring() }}>Pick two points</button> : <>
          <p className="hint">{distance === null ? `Pick ${measurePoints.length ? 'the second' : 'the first'} point on this scan using the mouse or XR pointer.` : `Measured ${distance.toFixed(2)} m. Enter the real distance:`}</p>
          {distance !== null && <div className="row"><label className="field">Real distance (m)<input type="number" min="0.01" step="0.01" value={real} onChange={(e) => setReal(e.target.value)} /></label>
            <button onClick={() => { const ok = calibrateScan(Number(real)); setNote({ error: !ok, text: ok ? 'Scale calibrated.' : 'Enter a valid positive distance.' }) }}>Apply</button></div>}
          <button onClick={() => startMeasuring(false)}>Cancel measurement</button>
        </>}
        <h4>Build around this scan</h4>
        <p className="hint">The scan is visual geometry. Add solid walls for robot navigation, then place catalog objects and route waypoints. Edits are shared between tabletop and life-size views.</p>
        <div className="row">
          <button onClick={() => { startMeasuring(false); useWorld.getState().setTool('wall'); openScanPanel(false) }}>Trace solid walls</button>
          <button onClick={() => { startMeasuring(false); useWorld.getState().setTool('asset'); openScanPanel(false) }}>Add catalog objects</button>
          <button onClick={() => switchWorldView('tabletop')}>Tabletop view</button>
          <button onClick={() => switchWorldView('life')}>Life-size view</button>
        </div>
        <h4>Display</h4>
        <label className="field">Opacity {Math.round(scan.opacity * 100)}%<input type="range" min="0.1" max="1" step="0.05" value={scan.opacity} onChange={(e) => patchScan({ opacity: Number(e.target.value) })} /></label>
        {scan.cutHeight !== null && <label className="field">Ceiling cut {scan.cutHeight.toFixed(1)} m above this section’s floor<input type="range" min="0.5" max="12" step="0.1" value={scan.cutHeight} onChange={(e) => patchScan({ cutHeight: Number(e.target.value) })} /></label>}
        <div className="row"><button onClick={() => pick(scan.id)}>Re-link selected file</button><button className="ghost danger" onClick={() => {
          const id = scan.id
          void requestConfirmation({ type: 'DELETE', message: `Remove “${scan.name}” from this property?` }).then((ok) => { if (ok) removeScan(id) })
        }}>Remove section</button></div>
      </>}
    </fieldset>
    {note && <p className={note.error ? 'scan-error' : 'hint'} role={note.error ? 'alert' : 'status'}>{note.text}</p>}
    <div className="row"><button className="ghost" onClick={() => openScanPanel(false)}>Close</button></div>
  </section>
}
