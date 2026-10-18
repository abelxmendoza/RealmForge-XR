import { useState } from 'react'
import { ASSETS, getAsset } from '../world/assets'
import { worldActions } from '../world/actions'
import { useWorld } from '../world/store'
import { useEditor } from './settings'
import { useNav } from '../nav/navigation'

export function AssetCatalogPanel() {
  const [category, setCategory] = useState<'Equipment' | 'Destinations'>('Equipment')
  const [query, setQuery] = useState('')
  const [message, setMessage] = useState('')
  const assetId = useEditor((s) => s.assetId)
  const rotation = useEditor((s) => s.assetRotation)
  const tool = useWorld((s) => s.tool)
  const objects = useWorld((s) => s.objects)
  const selectedActor = useWorld((s) => s.selectedActorId ? s.actors[s.selectedActorId] : null)
  const navStatus = useNav((s) => s.status)
  const destinations = Object.values(objects).filter((o) => o.destinationRole)
  const filtered = ASSETS.filter((entry) => {
    if (entry.category !== category) return false
    const q = query.trim().toLowerCase()
    if (!q) return true
    return entry.name.toLowerCase().includes(q) || entry.id.includes(q) || entry.description.toLowerCase().includes(q)
  })
  const asset = getAsset(assetId) ?? filtered[0] ?? ASSETS[0]
  return (
    <section>
      <p className="hint">Pick a category and object, then click clear ground to place. Stay in catalog mode to place several.</p>
      <div className="row">
        {(['Equipment', 'Destinations'] as const).map((value) => (
          <button key={value} type="button" className={category === value ? 'on' : ''} aria-pressed={category === value} onClick={() => setCategory(value)}>
            {value}
          </button>
        ))}
      </div>
      <label>
        Search
        <input type="search" value={query} placeholder="Filter objects…" onChange={(e) => setQuery(e.target.value)} />
      </label>
      <div className="catalog-grid">
        {filtered.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={tool === 'asset' && entry.id === assetId ? 'on' : ''}
            title={entry.description}
            aria-pressed={tool === 'asset' && entry.id === assetId}
            onClick={() => worldActions.selectCatalogAsset(entry.id)}
          >
            {entry.name}
          </button>
        ))}
      </div>
      {filtered.length === 0 && <p className="hint">No objects match this search.</p>}
      {asset && (
        <p className="hint">
          Preview: {asset.name} · {Math.round((rotation * 180) / Math.PI)}° — {asset.description}
        </p>
      )}
      <div className="row">
        <button type="button" title="Rotate preview left (R)" onClick={() => worldActions.rotateCatalogAsset(-1)}>
          Rotate −90°
        </button>
        <button type="button" title="Rotate preview right (R)" onClick={() => worldActions.rotateCatalogAsset(1)}>
          Rotate +90°
        </button>
      </div>
      {tool === 'asset' && <p className="hint">Green preview: place here. Red: blocked. Click to place. R rotates.</p>}
      {destinations.length > 0 && (
        <>
          <h3>Robot destinations</h3>
          <p className="hint">
            {navStatus}. Send {selectedActor?.name || 'the original robot'} to a marker.
          </p>
          <ul className="catalog-destinations">
            {destinations.map((object, i) => (
              <li key={object.id}>
                <button
                  type="button"
                  onClick={() => {
                    const result = worldActions.sendRobotToDestination(object.id)
                    setMessage(
                      result.ok
                        ? `${selectedActor?.name || 'Robot'} dispatched to ${object.destinationRole} marker ${i + 1}.`
                        : result.error,
                    )
                  }}
                >
                  Go: {getAsset(object.assetId || '')?.name || object.destinationRole} {i + 1}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="row">
        <button type="button" className="ghost" title="Leave catalog mode and return to Select (1)" onClick={() => worldActions.setTool('select')}>
          Done placing
        </button>
      </div>
      {message && <p role="status">{message}</p>}
    </section>
  )
}
