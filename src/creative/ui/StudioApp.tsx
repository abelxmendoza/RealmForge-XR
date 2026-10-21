import { useCallback, useEffect, useState } from 'react'
import type { AssetManifest } from '../manifest'
import { MIME } from '../imageInfo'
import { api, ApiError, type StudioStatus } from './api'
import { ModelViewer } from './ModelViewer'
import { PreparePanel } from './PreparePanel'
import { GeneratePanel } from './GeneratePanel'
import { Gallery, type GalleryItem } from './Gallery'
import { IssueList } from './IssueList'
import { AccountMenu, RequireCapability } from '../../auth/ui/AuthUI'
import './studio.css'

type Tab = 'library' | 'gallery'

/**
 * RealmForge Creative Studio (?studio=1): personal image-to-3D asset library. Local dev server only.
 * Developer (or admin) accounts only when sign-in is configured; the API itself is loopback-only.
 */
export default function StudioApp() {
  return (
    <RequireCapability cap="creative-studio" title="Creative Studio">
      <Studio />
    </RequireCapability>
  )
}

function Studio() {
  const params = new URLSearchParams(window.location.search) // deep links: &tab=gallery, &asset=<id>
  const [tab, setTab] = useState<Tab>(params.get('tab') === 'gallery' ? 'gallery' : 'library')
  const [status, setStatus] = useState<StudioStatus | null>(null)
  const [assets, setAssets] = useState<AssetManifest[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(params.get('asset'))
  const [viewerOverride, setViewerOverride] = useState<GalleryItem | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [offline, setOffline] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const [s, list] = await Promise.all([api.status(), api.list()])
      setStatus(s); setAssets(list); setOffline(false)
    } catch (e) {
      if (e instanceof ApiError && e.status !== 404) setError(e.message)
      else setOffline(true)
    }
  }, [])
  useEffect(() => { void refresh() }, [refresh])

  const update = (m: AssetManifest) => {
    setAssets((list) => list.some((a) => a.id === m.id) ? list.map((a) => (a.id === m.id ? m : a)) : [...list, m])
    void api.status().then(setStatus).catch(() => {})
  }
  const asset = assets.find((a) => a.id === selectedId) ?? null

  return (
    <div className="cs-app">
      <header className="cs-header">
        <a href="?" className="cs-brand">RealmForge <em>Creative Studio</em></a>
        <nav role="tablist">
          <button role="tab" aria-selected={tab === 'library'} onClick={() => setTab('library')}>Library</button>
          <button role="tab" aria-selected={tab === 'gallery'} onClick={() => setTab('gallery')}>Gallery</button>
        </nav>
        {status && <BudgetChip status={status} />}
        <AccountMenu />
      </header>
      {offline && <p className="cs-banner cs-error" role="alert">The studio API is unavailable. It runs only on the local dev server (<code>npm run dev</code>), opened from this machine as https://localhost.</p>}
      {error && <p className="cs-banner cs-error" role="alert">{error}</p>}

      {tab === 'gallery' && (
        <main className="cs-main-gallery">
          <Gallery library={assets} onOpen={(item) => { setViewerOverride(item); setTab('library'); setSelectedId(null) }} />
        </main>
      )}

      {tab === 'library' && (
        <main className="cs-main">
          <aside className="cs-sidebar">
            <ImportBox disabled={offline} onImported={(m) => { update(m); setSelectedId(m.id); setViewerOverride(null) }} />
            <ul className="cs-assets" aria-label="Library assets">
              {assets.map((a) => (
                <li key={a.id}>
                  <button type="button" aria-current={a.id === selectedId} onClick={() => { setSelectedId(a.id); setViewerOverride(null) }}>
                    <img src={api.fileUrl(a.id, a.preview?.file ?? a.preparations.at(-1)?.file ?? a.original.file)} alt="" />
                    <span>{a.title}<small>{a.converted ? 'model ready' : a.generations.some((g) => g.status === 'submitted') ? 'generating' : `${a.preparations.length} prepared`}</small></span>
                  </button>
                </li>
              ))}
              {!assets.length && !offline && <li className="cs-empty">No artwork yet. Import an image to start.</li>}
            </ul>
          </aside>
          <section className="cs-detail">
            {viewerOverride && (
              <>
                <h2>{viewerOverride.name} <small>{viewerOverride.origin === 'sample' ? `${viewerOverride.licence.id} · ${viewerOverride.licence.attribution}` : 'library'}</small></h2>
                <ModelViewer url={viewerOverride.url} title={viewerOverride.name} />
              </>
            )}
            {!viewerOverride && !asset && <p className="cs-empty">Select or import an artwork. The gallery tab has licensed sample models to try the viewer on.</p>}
            {!viewerOverride && asset && <AssetDetail key={asset.id} asset={asset} status={status} onChange={update} />}
          </section>
        </main>
      )}
    </div>
  )
}

function BudgetChip({ status }: { status: StudioStatus }) {
  const b = status.budget
  return (
    <div className="cs-budget" title={`${b.note}\nPricing: ${b.pricingSource}`}>
      <span><strong>{b.available}</strong> credits available here</span>
      <small>creative {b.creativeCommitted}/{b.budget.creativeAllocation} · account {b.accountCommitted}/{b.budget.accountCredits} committed · expires {b.budget.expires}</small>
      <small>{status.spendEnabled ? '⚠ spending enabled on this server' : 'spending disabled on this server'} · token {status.token.configured ? 'configured' : 'missing'}</small>
    </div>
  )
}

function ImportBox({ disabled, onImported }: { disabled: boolean; onImported: (m: AssetManifest) => void }) {
  const [error, setError] = useState<{ message: string; details?: unknown } | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [drag, setDrag] = useState(false)
  const handle = async (file: File | undefined) => {
    if (!file) return
    setError(null); setNote(null)
    if (!Object.values(MIME).includes(file.type)) return setError({ message: `${file.name}: only PNG, JPEG and WebP are accepted.` })
    try {
      const r = await api.importArtwork(file, file.name)
      if (r.duplicate) setNote(`Already in the library as “${r.manifest.title}”.`)
      onImported(r.manifest)
    } catch (e) { setError({ message: (e as Error).message, details: (e as ApiError).details }) }
  }
  return (
    <div className={`cs-import${drag ? ' cs-drag' : ''}`} onDragOver={(e) => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); void handle(e.dataTransfer.files[0]) }}>
      <label className="cs-primary cs-file">
        Import artwork
        <input type="file" accept="image/png,image/jpeg,image/webp" disabled={disabled} onChange={(e) => { void handle(e.target.files?.[0]); e.target.value = '' }} />
      </label>
      <small>or drop an image here. The original is stored unchanged and read-only.</small>
      {note && <p className="cs-ok">{note}</p>}
      {error && <div className="cs-error" role="alert">{error.message}{Array.isArray(error.details) && <IssueList issues={error.details} />}</div>}
    </div>
  )
}

function AssetDetail({ asset, status, onChange }: { asset: AssetManifest; status: StudioStatus | null; onChange: (m: AssetManifest) => void }) {
  const [verify, setVerify] = useState<string | null>(null)
  const [glbError, setGlbError] = useState<string | null>(null)
  const o = asset.original
  const importGlb = async (file: File | undefined) => {
    if (!file) return
    setGlbError(null)
    try { onChange((await api.importModel(asset.id, file, file.name)).manifest) } catch (e) {
      const d = (e as ApiError).details as { errors?: string[] } | undefined
      setGlbError(`${(e as Error).message}${d?.errors ? `: ${d.errors.join('; ')}` : ''}`)
    }
  }
  return (
    <>
      <h2>{asset.title} <small>rev {asset.revision} · <code>{asset.id}</code></small></h2>
      <section className="cs-panel" aria-labelledby="orig-h">
        <h3 id="orig-h">1 · Original <small>never modified</small></h3>
        <div className="cs-original">
          <img src={api.fileUrl(asset.id, o.file)} alt={`Original artwork ${asset.title}`} />
          <dl>
            <dt>File</dt><dd>{o.sourceName}</dd>
            <dt>Format</dt><dd>{o.format.toUpperCase()} · {o.width}×{o.height} · {(o.bytes / 1e6).toFixed(2)} MB</dd>
            <dt>Transparency</dt><dd>{o.alphaChannel ? 'has alpha channel' : 'none'}</dd>
            <dt>sha256</dt><dd><code>{o.sha256.slice(0, 16)}…</code></dd>
            <dt>Licence</dt><dd>{asset.licence.origin} · {asset.licence.owner}</dd>
          </dl>
        </div>
        <IssueList issues={o.issues} empty="Passes format and resolution checks." />
        <button type="button" onClick={() => api.verify(asset.id).then((r) => setVerify(r.files.every((f) => f.ok && f.readOnly) ? `All ${r.files.length} files match their recorded hashes and are read-only.` : `Problem: ${r.files.filter((f) => !f.ok || !f.readOnly).map((f) => f.file).join(', ')}`))}>Verify files</button>
        {verify && <p className="cs-ok">{verify}</p>}
      </section>
      <PreparePanel asset={asset} onSaved={onChange} />
      <GeneratePanel asset={asset} status={status} onChange={onChange} />
      <section className="cs-panel" aria-labelledby="model-h">
        <h3 id="model-h">4 · Model</h3>
        {asset.converted && (
          <p className="cs-meta">{asset.converted.file} · {asset.converted.triangles.toLocaleString()} triangles · {asset.converted.extents.map((v) => v.toFixed(3)).join(' × ')} · from {asset.converted.from}
            {asset.converted.warnings.length > 0 && <> · warnings: {asset.converted.warnings.join('; ')}</>}</p>
        )}
        <ModelViewer url={asset.converted ? api.fileUrl(asset.id, asset.converted.file) : null} title={asset.title}
          onScreenshot={(png) => void api.setPreview(asset.id, png).then(onChange).catch(() => {})} />
        <label className="cs-file-inline">Import a GLB you have rights to <input type="file" accept=".glb,model/gltf-binary" onChange={(e) => { void importGlb(e.target.files?.[0]); e.target.value = '' }} /></label>
        {glbError && <p className="cs-error" role="alert">{glbError}</p>}
      </section>
    </>
  )
}
