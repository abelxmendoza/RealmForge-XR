import { useEffect, useState } from 'react'
import type { AssetManifest, Generation } from '../manifest'
import { approvalPhrase } from '../generation'
import { api, type DryRunPreview, type StudioStatus } from './api'
import { IssueList } from './IssueList'

/**
 * Generation preview + explicit approval. Three separate steps, each a deliberate click:
 * dry-run (free, validates and prices) -> approve (typed phrase + three acknowledgements) -> submit
 * (only enabled when the dev server was started with CREATIVE_ALLOW_SPEND=1). Nothing auto-submits.
 */
export function GeneratePanel({ asset, status, onChange }: { asset: AssetManifest; status: StudioStatus | null; onChange: (m: AssetManifest) => void }) {
  const ready = asset.preparations.filter((p) => p.analysis.subjects >= 1)
  const latest = ready.at(-1)?.id ?? 'original'
  const [prep, setPrep] = useState(latest)
  useEffect(() => setPrep(latest), [latest]) // follow the newest preparation when one is saved
  const [name, setName] = useState(asset.title)
  const [text, setText] = useState('')
  const [subjectName, setSubjectName] = useState('')
  const [meshQuality, setMeshQuality] = useState<'standard' | 'low' | 'ultra_low'>('standard')
  const [textureResolution, setTex] = useState<2048 | 4096 | 8192>(2048)
  const [preview, setPreview] = useState<{ gen: Generation; p: DryRunPreview } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const run = async (f: () => Promise<void>) => {
    setBusy(true); setError(null)
    try { await f() } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  const dryRun = () => run(async () => {
    const r = await api.dryRun(asset.id, prep, { name, text, subjectName, meshQuality, textureResolution })
    onChange(r.manifest)
    setPreview({ gen: r.generation, p: r.preview })
  })

  return (
    <section className="cs-panel" aria-labelledby="gen-h">
      <h3 id="gen-h">3 · Generate <small>ProjectSim Standard · 4 credits per asset · one image</small></h3>
      <div className="cs-grid2">
        <label>Image <select value={prep} onChange={(e) => setPrep(e.target.value)}>
          {asset.preparations.map((p) => <option key={p.id} value={p.id}>{p.id} · {p.analysis.subjects} subject(s)</option>)}
          <option value="original">original (unprepared)</option>
        </select></label>
        <label>Name <input value={name} maxLength={100} onChange={(e) => setName(e.target.value)} /></label>
        <label>Mesh quality <select value={meshQuality} onChange={(e) => setMeshQuality(e.target.value as typeof meshQuality)}>
          <option value="standard">standard</option><option value="low">low</option><option value="ultra_low">ultra_low</option>
        </select></label>
        <label>Texture <select value={textureResolution} onChange={(e) => setTex(Number(e.target.value) as typeof textureResolution)}>
          <option value={2048}>2K</option><option value={4096}>4K</option><option value={8192}>8K</option>
        </select></label>
        <label className="cs-span2">Subject name <small>(only if the image has several objects; isolates one)</small>
          <input value={subjectName} onChange={(e) => setSubjectName(e.target.value)} placeholder="e.g. red dragon" /></label>
        <label className="cs-span2">Text <small>(optional; with an image this EDITS the artwork, leave empty to keep it as drawn)</small>
          <textarea value={text} maxLength={10000} rows={2} onChange={(e) => setText(e.target.value)} /></label>
      </div>
      <div className="cs-row">
        <button type="button" onClick={dryRun} disabled={busy}>Dry run (free, no network)</button>
        {status && <span className="cs-chip">{status.budget.available} credits available to this studio</span>}
      </div>
      {error && <p className="cs-error" role="alert">{error}</p>}
      {preview && <DryRunCard asset={asset} gen={asset.generations.find((g) => g.id === preview.gen.id) ?? preview.gen} p={preview.p} onChange={onChange} />}
      {asset.generations.length > 0 && <GenerationHistory asset={asset} onChange={onChange} />}
    </section>
  )
}

function DryRunCard({ asset, gen, p, onChange }: { asset: AssetManifest; gen: Generation; p: DryRunPreview; onChange: (m: AssetManifest) => void }) {
  const [phrase, setPhrase] = useState('')
  const [ackCredits, setAckCredits] = useState(false)
  const [ackLicence, setAckLicence] = useState(false)
  const [noCard, setNoCard] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const act = async (f: () => Promise<AssetManifest>) => {
    setBusy(true); setError(null)
    try { onChange(await f()) } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  const required = approvalPhrase(gen.credits)

  return (
    <div className="cs-card" data-testid="dry-run" data-status={gen.status}>
      <h4>Dry run {gen.dryRun.ok ? 'passed' : 'found problems'} · <code>{gen.id}</code></h4>
      <IssueList issues={gen.dryRun.issues} empty="Request matches the documented Standard contract." />
      <dl className="cs-cost">
        <dt>Cost</dt><dd><strong>{p.credits} credits</strong></dd>
        <dt>Available before</dt><dd>{p.budgetBefore}</dd>
        <dt>Available after</dt><dd>{p.budgetAfter}</dd>
      </dl>
      <details>
        <summary>Exact request ({p.endpoint})</summary>
        <ol>{p.steps.map((s) => <li key={s}>{s}</li>)}</ol>
        <pre>{JSON.stringify(p.body, null, 2)}</pre>
        <small>Payload hash <code>{gen.payloadHash.slice(0, 16)}…</code>; approval is bound to it. Changing anything needs a new dry run.</small>
      </details>
      <div className="cs-warning">
        <strong>Licence:</strong> {p.licence.summary} <a href={p.licence.termsUrl} target="_blank" rel="noreferrer">Terms</a>
        <br /><strong>Billing:</strong> {p.overageWarning}
      </div>
      {gen.status === 'validated' && (
        <form className="cs-approve" onSubmit={(e) => { e.preventDefault(); void act(() => api.approve(asset.id, gen.id, { phrase, acknowledgeCredits: ackCredits, acknowledgeLicence: ackLicence, confirmNoCardOnFile: noCard })) }}>
          <label><input type="checkbox" checked={ackCredits} onChange={(e) => setAckCredits(e.target.checked)} /> I approve spending {gen.credits} gift credits on this one request.</label>
          <label><input type="checkbox" checked={ackLicence} onChange={(e) => setAckLicence(e.target.checked)} /> I understand Kaedim gets a broad licence to the generated model (section 4.2), and that whether gift-credit outputs count as paid is unconfirmed.</label>
          <label><input type="checkbox" checked={noCard} onChange={(e) => setNoCard(e.target.checked)} /> I checked the ProjectSim dashboard: no payment card is on file.</label>
          <label>Type <code>{required}</code> <input value={phrase} onChange={(e) => setPhrase(e.target.value)} autoComplete="off" spellCheck={false} /></label>
          <button type="submit" disabled={busy || phrase !== required || !ackCredits || !ackLicence || !noCard}>Approve</button>
        </form>
      )}
      {gen.status === 'approved' && (
        <div className="cs-row">
          <button type="button" className="cs-danger" disabled={busy || !p.spendEnabledOnServer} onClick={() => void act(() => api.submit(asset.id, gen.id))}>
            Submit: spend {gen.credits} credits
          </button>
          {!p.spendEnabledOnServer && <small>Spending is off on this dev server. To enable it, restart it yourself with <code>CREATIVE_ALLOW_SPEND=1 npm run dev</code>.</small>}
          <small>Approval expires {new Date(gen.approval!.expiresAt).toLocaleTimeString()}.</small>
        </div>
      )}
      {error && <p className="cs-error" role="alert">{error}</p>}
    </div>
  )
}

function GenerationHistory({ asset, onChange }: { asset: AssetManifest; onChange: (m: AssetManifest) => void }) {
  const [error, setError] = useState<string | null>(null)
  return (
    <details className="cs-history" open={asset.generations.some((g) => g.status === 'submitted')}>
      <summary>Generation history ({asset.generations.length})</summary>
      <table>
        <thead><tr><th>id</th><th>image</th><th>status</th><th>credits</th><th>job</th><th /></tr></thead>
        <tbody>
          {asset.generations.map((g) => (
            <tr key={g.id}>
              <td><code>{g.id}</code></td><td>{g.preparationId}</td><td>{g.status}{g.error ? ` (${g.error})` : ''}</td>
              <td>{g.submission ? g.credits : '0 (not sent)'}</td><td>{g.submission?.jobId ?? '-'}</td>
              <td>{g.status === 'submitted' && <button type="button" onClick={() => api.refresh(asset.id, g.id).then((r) => onChange(r.manifest)).catch((e: Error) => setError(e.message))}>Check status</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {error && <p className="cs-error" role="alert">{error}</p>}
    </details>
  )
}
