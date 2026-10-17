import { useWorld, type Tool } from '../world/store'
import { STEP_HEIGHT, blocksNavigation, type MaterialId, type WorldObject } from '../world/types'
import {
  BUILDING_STYLES,
  BUILDING_STYLE_IDS,
  CRATE_MATERIALS,
  KIND_LABELS,
  MATERIAL_LABELS,
  PLATFORM_MATERIALS,
  TREE_STYLES,
  WALL_MATERIALS,
  buildingRoof,
  buildingStyle,
  defaultMaterial,
  treeStyle,
} from '../world/catalog'
import { PRESETS } from '../world/presets'
import { useEditor, type DecorKind } from './settings'
import { deleteSelected, duplicateSelected } from './Obstacles'

/**
 * Desktop side panel for worldbuilding: exact dimensions and looks for the selected object,
 * what the creation tools place next, snapping and presets. Everything here is also reachable
 * without it (keys on desktop, in-scene buttons in XR); it only calls store actions.
 */
export function Inspector() {
  const selected = useWorld((s) => (s.selectedId ? s.objects[s.selectedId] : null))
  const tool = useWorld((s) => s.tool)
  return (
    <div className="inspector">
      {selected ? <ObjectPanel o={selected} /> : <BrushPanel tool={tool} />}
      <WorldPanel />
    </div>
  )
}

const num = (v: string, min: number) => Math.max(min, Number(v) || min)

function ObjectPanel({ o }: { o: WorldObject }) {
  const update = (patch: Partial<WorldObject>) => useWorld.getState().updateObject(o.id, patch)
  const setSize = (axis: 0 | 1 | 2, v: number) => {
    const size = [...o.size] as WorldObject['size']
    size[axis] = v
    update({ size })
  }
  const deg = Math.round(((o.rotationY * 180) / Math.PI) % 360)
  const materials = o.kind === 'wall' ? WALL_MATERIALS : o.kind === 'platform' ? PLATFORM_MATERIALS : o.kind === 'crate' ? CRATE_MATERIALS : null
  const isDecor = o.kind === 'tree' || o.kind === 'streetlight' || o.kind === 'crate'
  const blocks = blocksNavigation(o)
  const labels = o.kind === 'wall' ? ['Length', 'Height', 'Thickness'] : ['Width', 'Height', 'Depth']

  return (
    <section>
      <h3>
        {KIND_LABELS[o.kind]} <span className={blocks ? 'tag block' : 'tag'}>{blocks ? 'blocks robot' : 'walkable'}</span>
      </h3>
      <div className="grid3">
        {labels.map((label, axis) => (
          <label key={label}>
            {label}
            <input type="number" step={0.5} min={0.1} value={round(o.size[axis])} onChange={(e) => setSize(axis as 0 | 1 | 2, num(e.target.value, 0.05))} />
          </label>
        ))}
      </div>
      <label>
        Rotation°
        <input type="number" step={15} value={deg} onChange={(e) => update({ rotationY: ((Number(e.target.value) || 0) * Math.PI) / 180 })} />
      </label>
      {materials && (
        <label>
          Material
          <select value={defaultMaterial(o)} onChange={(e) => update({ material: e.target.value as MaterialId })}>
            {materials.map((m) => (
              <option key={m} value={m}>
                {MATERIAL_LABELS[m]}
              </option>
            ))}
          </select>
        </label>
      )}
      {o.kind === 'building' && (
        <>
          <label>
            Style
            <select
              value={buildingStyle(o)}
              onChange={(e) => {
                const style = e.target.value as keyof typeof BUILDING_STYLES
                update({ style, roof: BUILDING_STYLES[style].roof, color: BUILDING_STYLES[style].color })
              }}
            >
              {BUILDING_STYLE_IDS.map((s) => (
                <option key={s} value={s}>
                  {BUILDING_STYLES[s].label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Roof
            <select value={buildingRoof(o)} onChange={(e) => update({ roof: e.target.value as 'flat' | 'pitched' })}>
              <option value="flat">Flat</option>
              <option value="pitched">Pitched</option>
            </select>
          </label>
        </>
      )}
      {o.kind === 'tree' && (
        <label>
          Style
          <select value={treeStyle(o)} onChange={(e) => update({ style: e.target.value as 'round' | 'pine' })}>
            {TREE_STYLES.map((s) => (
              <option key={s} value={s}>
                {s === 'pine' ? 'Pine' : 'Round'}
              </option>
            ))}
          </select>
        </label>
      )}
      {(isDecor || o.kind === 'platform') && (
        <label className="check">
          <input type="checkbox" checked={blocks} onChange={(e) => update({ solid: e.target.checked })} />
          Blocks the robot
          {o.kind === 'platform' && o.solid === undefined && <small> (auto: taller than {STEP_HEIGHT})</small>}
        </label>
      )}
      <div className="row">
        <button onClick={duplicateSelected}>D Duplicate</button>
        <button onClick={deleteSelected}>Del Delete</button>
      </div>
    </section>
  )
}

function BrushPanel({ tool }: { tool: Tool }) {
  const s = useEditor()
  if (tool === 'building')
    return (
      <section>
        <h3>New building</h3>
        <label>
          Style
          <select value={s.buildingStyle} onChange={(e) => {
            const style = e.target.value as keyof typeof BUILDING_STYLES
            s.set({ buildingStyle: style, roof: BUILDING_STYLES[style].roof })
          }}>
            {BUILDING_STYLE_IDS.map((id) => (
              <option key={id} value={id}>
                {BUILDING_STYLES[id].label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Roof
          <select value={s.roof} onChange={(e) => s.set({ roof: e.target.value as 'flat' | 'pitched' })}>
            <option value="flat">Flat</option>
            <option value="pitched">Pitched</option>
          </select>
        </label>
        <p className="hint">Click the ground to place.</p>
      </section>
    )
  if (tool === 'wall' || tool === 'platform') {
    const key = tool === 'wall' ? 'wallMaterial' : 'platformMaterial'
    const list = tool === 'wall' ? WALL_MATERIALS : PLATFORM_MATERIALS
    return (
      <section>
        <h3>New {tool}</h3>
        <label>
          Material
          <select value={s[key]} onChange={(e) => s.set({ [key]: e.target.value as MaterialId })}>
            {list.map((m) => (
              <option key={m} value={m}>
                {MATERIAL_LABELS[m]}
              </option>
            ))}
          </select>
        </label>
        <p className="hint">{tool === 'wall' ? 'Press, drag and release to draw.' : 'Drag out a rectangle. Asphalt makes a road.'}</p>
      </section>
    )
  }
  if (tool === 'decor')
    return (
      <section>
        <h3>New decoration</h3>
        <div className="row">
          {(['tree', 'streetlight', 'crate'] as DecorKind[]).map((k) => (
            <button key={k} className={s.decor === k ? 'on' : ''} onClick={() => s.set({ decor: k })}>
              {KIND_LABELS[k]}
            </button>
          ))}
        </div>
        {s.decor === 'tree' && (
          <label>
            Tree style
            <select value={s.treeStyle} onChange={(e) => s.set({ treeStyle: e.target.value as 'round' | 'pine' })}>
              <option value="round">Round</option>
              <option value="pine">Pine</option>
            </select>
          </label>
        )}
        <p className="hint">Click to place. Decorations don't block the robot unless you tick "Blocks the robot".</p>
      </section>
    )
  return (
    <section>
      <h3>Inspector</h3>
      <p className="hint">Select an object to edit its size, material and style.</p>
    </section>
  )
}

function WorldPanel() {
  const snap = useEditor((s) => s.snap)
  const load = (build: () => ReturnType<(typeof PRESETS)[number]['build']>, label: string) => {
    const count = Object.keys(useWorld.getState().objects).length
    if (count > 0 && !window.confirm(`Replace the current world (${count} objects) with "${label}"?`)) return
    useWorld.getState().loadWorld(build())
  }
  return (
    <section>
      <h3>World</h3>
      <label className="check">
        <input type="checkbox" checked={snap} onChange={(e) => useEditor.getState().set({ snap: e.target.checked })} />
        Snap to grid (G)
      </label>
      {PRESETS.map((p) => (
        <button key={p.id} onClick={() => load(p.build, p.label)}>
          Load {p.label}
        </button>
      ))}
    </section>
  )
}

const round = (v: number) => Math.round(v * 100) / 100
