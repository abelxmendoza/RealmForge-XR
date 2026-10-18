import { useState } from 'react'
import { getAsset } from '../world/assets'
import { ASSET_CATEGORIES, assetsIn, useAssetLibrary, type AssetCategory } from '../world/assetLibrary'
import { worldActions } from '../world/actions'
import { useWorld } from '../world/store'
import { useEditor } from './settings'
import { useNav } from '../nav/navigation'

export function AssetCatalogPanel() {
  const [category, setCategory] = useState<AssetCategory>('Warehouse')
  useAssetLibrary((s) => s.version)
  const categories = ASSET_CATEGORIES.filter((c) => assetsIn(c).length > 0)
  const [message, setMessage] = useState('')
  const assetId = useEditor((s) => s.assetId)
  const rotation = useEditor((s) => s.assetRotation)
  const tool = useWorld((s) => s.tool)
  const objects = useWorld((s) => s.objects)
  const selectedActor = useWorld((s) => s.selectedActorId ? s.actors[s.selectedActorId] : null)
  const navStatus = useNav((s) => s.status)
  const destinations = Object.values(objects).filter((o) => o.destinationRole)
  const asset = getAsset(assetId) ?? assetsIn('Warehouse')[0]
  return <section>
    <h3>Object library</h3>
    <div className="row">{categories.map((value) => <button key={value} className={category === value ? 'on' : ''} onClick={() => setCategory(value)}>{value}</button>)}</div>
    <div className="catalog-grid">{assetsIn(category).map((entry) => <button key={entry.id} className={tool === 'asset' && entry.id === assetId ? 'on' : ''} title={entry.description} onClick={() => worldActions.selectCatalogAsset(entry.id)}>{entry.name}</button>)}</div>
    <p>{asset.name} · {Math.round(rotation * 180 / Math.PI)}°</p>
    <p className="hint">{asset.description}</p>
    <div className="row"><button onClick={() => worldActions.rotateCatalogAsset(-1)}>Rotate −90°</button><button onClick={() => worldActions.rotateCatalogAsset(1)}>Rotate +90°</button></div>
    {tool === 'asset' && <p className="hint">Aim at clear ground to preview. Green: place; red: blocked. Click to place. R rotates.</p>}
    {destinations.length > 0 && <>
      <h3>Robot destinations</h3>
      <p className="hint">{navStatus}. Choose a marker to send {selectedActor?.name || 'the original robot'} to its current center.</p>
      <ul className="catalog-destinations">{destinations.map((object, i) => <li key={object.id}>
        <button onClick={() => { const result = worldActions.sendRobotToDestination(object.id); setMessage(result.ok ? `${selectedActor?.name || 'Robot'} dispatched to ${object.destinationRole} marker ${i + 1}.` : result.error) }}>Go: {getAsset(object.assetId || '')?.name || object.destinationRole} {i + 1}</button>
      </li>)}</ul>
    </>}
    {message && <p role="status">{message}</p>}
  </section>
}
