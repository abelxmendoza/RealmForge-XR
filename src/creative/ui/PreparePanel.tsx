import { useEffect, useRef, useState } from 'react'
import { analysePixels, applyOps, countSubjects, type PrepOp, type Rgba } from '../pixels'
import type { AssetManifest } from '../manifest'
import { api } from './api'
import { IssueList } from './IssueList'

async function loadRgba(url: string): Promise<Rgba> {
  const img = new Image()
  img.src = url
  await img.decode()
  const c = document.createElement('canvas')
  c.width = img.naturalWidth
  c.height = img.naturalHeight
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0)
  const d = ctx.getImageData(0, 0, c.width, c.height)
  return { width: d.width, height: d.height, data: d.data }
}

function draw(canvas: HTMLCanvasElement, img: Rgba) {
  canvas.width = img.width
  canvas.height = img.height
  canvas.getContext('2d')!.putImageData(new ImageData(img.data as Uint8ClampedArray<ArrayBuffer>, img.width, img.height), 0, 0)
}

/**
 * Non-destructive preparation: pick a source (the original or an earlier derived copy), choose ops,
 * preview, and save the result as a NEW derived copy. The source file is never changed; the op list is
 * stored in the manifest as the recipe, and the server re-checks the saved PNG itself.
 */
export function PreparePanel({ asset, onSaved }: { asset: AssetManifest; onSaved: (m: AssetManifest) => void }) {
  const [source, setSource] = useState('original')
  const [src, setSrc] = useState<Rgba | null>(null)
  const [cropOn, setCropOn] = useState(false)
  const [rect, setRect] = useState({ x: 0, y: 0, width: 0, height: 0 })
  const [bgOn, setBgOn] = useState(!asset.original.alphaChannel)
  const [tolerance, setTolerance] = useState(24)
  const [padOn, setPadOn] = useState(true)
  const [margin, setMargin] = useState(10)
  const [square, setSquare] = useState(true)
  const [resizeOn, setResizeOn] = useState(true)
  const [maxSide, setMaxSide] = useState(2048)
  const [result, setResult] = useState<{ img: Rgba; ops: PrepOp[]; analysis: ReturnType<typeof analysePixels> } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const out = useRef<HTMLCanvasElement>(null)

  const sourceFile = source === 'original' ? asset.original.file : asset.preparations.find((p) => p.id === source)?.file

  useEffect(() => {
    if (!sourceFile) return
    let cancelled = false
    setSrc(null); setResult(null); setError(null)
    loadRgba(api.fileUrl(asset.id, sourceFile)).then((img) => {
      if (cancelled) return
      setSrc(img)
      setRect({ x: 0, y: 0, width: img.width, height: img.height })
    }).catch((e: Error) => setError(`Could not decode image: ${e.message}`))
    return () => { cancelled = true }
  }, [asset.id, sourceFile])

  useEffect(() => { if (result && out.current) draw(out.current, result.img) }, [result])

  const ops = (): PrepOp[] => [
    ...(cropOn ? [{ op: 'crop' as const, ...rect }] : []),
    ...(bgOn ? [{ op: 'remove-background' as const, tolerance }] : []),
    ...(padOn ? [{ op: 'pad' as const, marginFraction: margin / 100, square }] : []),
    ...(resizeOn ? [{ op: 'resize' as const, maxSide }] : []),
  ]

  const fitToSubject = () => {
    if (!src) return
    const { boxes } = countSubjects(src)
    if (!boxes.length) return setError('No subject found to fit.')
    const b = boxes.reduce((a, c) => (c.area > a.area ? c : a))
    const m = Math.round(Math.max(b.width, b.height) * 0.05)
    const x = Math.max(0, b.x - m), y = Math.max(0, b.y - m)
    setRect({ x, y, width: Math.min(src.width - x, b.width + 2 * m), height: Math.min(src.height - y, b.height + 2 * m) })
    setCropOn(true)
  }

  const preview = () => {
    if (!src) return
    setBusy(true); setError(null)
    // Yield a frame so the "Working…" state paints before the CPU-bound ops run.
    requestAnimationFrame(() => {
      try {
        const list = ops()
        const img = applyOps(src, list)
        setResult({ img, ops: list, analysis: analysePixels(img) })
      } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
    })
  }

  const save = async () => {
    if (!result || !out.current) return
    setBusy(true); setError(null)
    try {
      const blob = await new Promise<Blob>((res, rej) => out.current!.toBlob((b) => (b ? res(b) : rej(new Error('PNG encode failed'))), 'image/png'))
      onSaved(await api.addPreparation(asset.id, blob, source, result.ops))
      setResult(null)
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <section className="cs-panel" aria-labelledby="prep-h">
      <h3 id="prep-h">2 · Prepare <small>derived copies only; the original is never changed</small></h3>
      <div className="cs-row">
        <label>Source <select value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="original">Original ({asset.original.width}×{asset.original.height})</option>
          {asset.preparations.map((p) => <option key={p.id} value={p.id}>{p.id} ({p.width}×{p.height})</option>)}
        </select></label>
      </div>
      <fieldset className="cs-ops" disabled={!src || busy}>
        <div className="cs-op">
          <label><input type="checkbox" checked={cropOn} onChange={(e) => setCropOn(e.target.checked)} /> Crop</label>
          {(['x', 'y', 'width', 'height'] as const).map((k) => (
            <label key={k}>{k} <input type="number" min={0} value={rect[k]} onChange={(e) => setRect({ ...rect, [k]: Math.max(0, Number(e.target.value)) })} /></label>
          ))}
          <button type="button" onClick={fitToSubject}>Fit to subject</button>
        </div>
        <div className="cs-op">
          <label><input type="checkbox" checked={bgOn} onChange={(e) => setBgOn(e.target.checked)} /> Remove plain background</label>
          <label>tolerance <input type="range" min={4} max={96} value={tolerance} onChange={(e) => setTolerance(Number(e.target.value))} /> {tolerance}</label>
          <small>Flood-fills the border colour; for busy backgrounds use an external cut-out tool first.</small>
        </div>
        <div className="cs-op">
          <label><input type="checkbox" checked={padOn} onChange={(e) => setPadOn(e.target.checked)} /> Trim + pad</label>
          <label>margin <input type="number" min={0} max={50} value={margin} onChange={(e) => setMargin(Number(e.target.value))} />%</label>
          <label><input type="checkbox" checked={square} onChange={(e) => setSquare(e.target.checked)} /> square</label>
        </div>
        <div className="cs-op">
          <label><input type="checkbox" checked={resizeOn} onChange={(e) => setResizeOn(e.target.checked)} /> Downsize</label>
          <label>max side <select value={maxSide} onChange={(e) => setMaxSide(Number(e.target.value))}>
            {[1024, 2048, 4096].map((v) => <option key={v} value={v}>{v}px</option>)}
          </select></label>
        </div>
        <div className="cs-row">
          <button type="button" onClick={preview}>{busy ? 'Working…' : 'Preview'}</button>
          <button type="button" className="cs-primary" onClick={save} disabled={!result}>Save as derived copy</button>
        </div>
      </fieldset>
      {error && <p className="cs-error" role="alert">{error}</p>}
      <div className="cs-compare">
        <figure>
          {sourceFile && <img src={api.fileUrl(asset.id, sourceFile)} alt="Source image" />}
          <figcaption>Source{src ? ` · ${src.width}×${src.height}` : ''}</figcaption>
        </figure>
        <figure className="cs-checker">
          <canvas ref={out} hidden={!result} aria-label="Prepared preview" />
          <figcaption>{result ? `Preview · ${result.img.width}×${result.img.height} · ${result.analysis.subjects.subjects} subject(s) · ${(result.analysis.alpha.transparentFraction * 100).toFixed(0)}% transparent` : 'Preview appears here'}</figcaption>
        </figure>
      </div>
      {result && <IssueList issues={result.analysis.issues} empty="One subject, framed well." />}
      {asset.preparations.length > 0 && (
        <ul className="cs-preps">
          {asset.preparations.map((p) => (
            <li key={p.id}>
              <img src={api.fileUrl(asset.id, p.file)} alt="" />
              <div><strong>{p.id}</strong> from {p.parent} · {p.width}×{p.height} · {p.analysis.subjects} subject(s)
                <br /><code>{p.ops.map((o) => o.op).join(' → ') || 'no ops'}</code>
                <IssueList issues={p.issues} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
