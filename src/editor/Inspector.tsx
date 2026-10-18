import { useMemo, useState } from 'react'
import { ActorPanel } from '../actors/ActorPanel'
import { getAsset } from '../world/assets'
import { AssetCatalogPanel } from './AssetCatalogPanel'
import { WorldsPanel } from './WorldsPanel'
import { worldActions } from '../world/actions'
import { useWorld, type Tool } from '../world/store'
import { STEP_HEIGHT, blocksNavigation, type MaterialId, type SimulationRole, type WorldObject } from '../world/types'
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
import {
  EVENT_CATALOG_CATEGORIES,
  SIMULATION_ROLE_LABELS,
  getEventCatalogEntry,
  listEventCatalog,
  type EventCatalogCategory,
} from '../world/eventCatalog'
import { useEditor, type DecorKind } from './settings'
import { deleteSelected, duplicateSelected } from './Obstacles'
import { SimulationPanel } from '../sim/SimulationPanel'
import { useNav } from '../nav/navigation'
import { useHudSection } from './hudSectionStore'
import { resolveInspectorContext, TOOL_PANEL_HEADINGS } from './inspectorContext'
import { useAttendee, type AttendeeStatus } from '../sim/attendee'

/**
 * Context-sensitive right panel: shows only controls for the active Hud section,
 * selected object/actor, or placement tool. Uses existing world/editor/attendee stores.
 */
export function Inspector() {
  const [collapsed, setCollapsed] = useState(false)
  const section = useHudSection((s) => s.section)
  const selected = useWorld((s) => (s.selectedId ? s.objects[s.selectedId] : null))
  const selectedActorId = useWorld((s) => s.selectedActorId)
  const tool = useWorld((s) => s.tool)
  const sim = useAttendee()

  if (collapsed) {
    return (
      <div className="inspector inspector-collapsed">
        <button
          type="button"
          className="inspector-toggle"
          title="Show side panel"
          aria-expanded={false}
          onClick={() => setCollapsed(false)}
        >
          Show panel
        </button>
        {sim.running && <p className="inspector-sim-pill" role="status">{simStatusLabel(sim)}</p>}
      </div>
    )
  }

  return (
    <div
      className="inspector"
      data-context={resolveInspectorContext({
        section,
        tool,
        hasObject: Boolean(selected),
        hasActor: Boolean(selectedActorId),
      })}
    >
      <header className="inspector-chrome">
        <h2 className="inspector-title">{panelHeading(section, tool, selected, selectedActorId)}</h2>
        <button
          type="button"
          className="ghost inspector-toggle"
          title="Hide side panel"
          aria-expanded={true}
          onClick={() => setCollapsed(true)}
        >
          Hide
        </button>
      </header>

      <div className="inspector-body">
        {section === 'simulate' ? (
          <SimulationPanel />
        ) : section === 'save' ? (
          <WorldsPanel />
        ) : selected ? (
          <ObjectPanel o={selected} />
        ) : selectedActorId ? (
          <ActorPanel />
        ) : (
          <ToolContextPanel tool={tool} />
        )}
      </div>

      {sim.running && section !== 'simulate' && (
        <p className="inspector-sim-pill" role="status" title="Open Simulate on the left for full controls">
          {simStatusLabel(sim)}
        </p>
      )}
    </div>
  )
}

function panelHeading(
  section: string,
  tool: Tool,
  selected: WorldObject | null,
  selectedActorId: string | null,
): string {
  if (section === 'simulate') return 'Simulation'
  if (section === 'save') return 'Saved worlds'
  if (selected) return 'Selected object'
  if (selectedActorId) return 'Selected actor'
  return TOOL_PANEL_HEADINGS[tool] ?? 'Inspector'
}

function simStatusLabel(sim: AttendeeStatus) {
  if (sim.paused) return 'Simulation paused'
  if (sim.phase === 'done') return 'Simulation completed'
  if (sim.phase === 'blocked' || sim.phase === 'no-path') return 'Simulation blocked'
  return 'Simulation running'
}

function ToolContextPanel({ tool }: { tool: Tool }) {
  switch (tool) {
    case 'wall':
      return <WallBrushPanel />
    case 'building':
      return <BuildingBrushPanel />
    case 'platform':
      return <PlatformBrushPanel />
    case 'decor':
      return <DecorBrushPanel />
    case 'event':
      return <EventBrushPanel />
    case 'asset':
      return <AssetCatalogPanel />
    case 'actor':
      return <ActorPanel />
    case 'goal':
      return <GoalToolPanel />
    case 'robot':
      return <RobotToolPanel />
    case 'select':
    default:
      return <SelectEmptyPanel />
  }
}

function DonePlacingButton() {
  return (
    <button
      type="button"
      className="ghost"
      title="Leave placement mode and return to Select (1)"
      onClick={() => worldActions.setTool('select')}
    >
      Done placing
    </button>
  )
}

function SelectEmptyPanel() {
  return (
    <section>
      <p className="hint">
        Click an object in the world to edit it, or choose a Build / Plan tool on the left to place something new.
      </p>
      <p className="hint">Tip: right-click the scene for quick world actions.</p>
    </section>
  )
}

function GoalToolPanel() {
  const goal = useWorld((s) => s.goal)
  const selectedActorId = useWorld((s) => s.selectedActorId)
  const actor = useWorld((s) => (selectedActorId ? s.actors[selectedActorId] : null))
  const status = useNav((s) => s.status)
  const objects = useWorld((s) => s.objects)
  const destinations = useMemo(() => Object.values(objects).filter((o) => o.destinationRole), [objects])
  return (
    <section>
      <p className="hint">
        Click the ground to set a destination for {actor ? actor.name : 'the robot'}. Current path status:{' '}
        <strong>{status}</strong>.
      </p>
      {goal ? (
        <p className="hint">
          Destination at ({round(goal[0])}, {round(goal[1])}).
        </p>
      ) : (
        <p className="hint">No destination set yet.</p>
      )}
      {destinations.length > 0 && (
        <>
          <h3>Quick destinations</h3>
          <ul className="catalog-destinations">
            {destinations.map((object, i) => (
              <li key={object.id}>
                <button
                  type="button"
                  title={`Send ${actor?.name || 'robot'} to this marker`}
                  onClick={() => worldActions.sendRobotToDestination(object.id)}
                >
                  Go: {getAsset(object.assetId || '')?.name || object.destinationRole} {i + 1}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="row">
        <DonePlacingButton />
        {goal && (
          <button type="button" className="ghost" title="Clear destination" onClick={() => useWorld.getState().setGoal(null)}>
            Clear destination
          </button>
        )}
      </div>
    </section>
  )
}

function RobotToolPanel() {
  const robotStart = useWorld((s) => s.robotStart)
  const goal = useWorld((s) => s.goal)
  const status = useNav((s) => s.status)
  const replans = useNav((s) => s.replanCount)
  const objects = useWorld((s) => s.objects)
  const destinations = useMemo(() => Object.values(objects).filter((o) => o.destinationRole), [objects])
  return (
    <section>
      <p className="hint">Click the ground to place the robot start. Navigation updates automatically when the destination or obstacles change.</p>
      <div className="grid3">
        <label>
          Start X
          <input
            type="number"
            step={0.5}
            value={round(robotStart[0])}
            onChange={(e) => useWorld.getState().placeRobot([Number(e.target.value) || 0, robotStart[1]])}
          />
        </label>
        <label>
          Start Z
          <input
            type="number"
            step={0.5}
            value={round(robotStart[1])}
            onChange={(e) => useWorld.getState().placeRobot([robotStart[0], Number(e.target.value) || 0])}
          />
        </label>
      </div>
      <p className="hint" role="status">
        Status: <strong>{status}</strong> · replans {replans}
        {goal ? ` · goal (${round(goal[0])}, ${round(goal[1])})` : ' · no destination'}
      </p>
      <div className="row">
        <button type="button" className={useWorld.getState().tool === 'goal' ? 'on' : ''} onClick={() => worldActions.setTool('goal')}>
          Set destination
        </button>
        {goal && (
          <button type="button" onClick={() => useWorld.getState().setGoal(null)}>
            Clear destination
          </button>
        )}
      </div>
      {destinations.length > 0 && (
        <>
          <h3>Send to marker</h3>
          <ul className="catalog-destinations">
            {destinations.map((object, i) => (
              <li key={object.id}>
                <button type="button" onClick={() => worldActions.sendRobotToDestination(object.id)}>
                  Go: {getAsset(object.assetId || '')?.name || object.destinationRole} {i + 1}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="row">
        <DonePlacingButton />
      </div>
    </section>
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
  const materials =
    o.kind === 'wall' ? WALL_MATERIALS : o.kind === 'platform' ? PLATFORM_MATERIALS : o.kind === 'crate' ? CRATE_MATERIALS : null
  const isDecor = o.kind === 'tree' || o.kind === 'streetlight' || o.kind === 'crate' || o.kind === 'prop'
  const blocks = blocksNavigation(o)
  const labels = o.kind === 'wall' ? ['Length', 'Height', 'Thickness'] : ['Width', 'Height', 'Depth']
  const catalogLabel = o.catalogId ? getEventCatalogEntry(o.catalogId)?.label : null
  const title = catalogLabel ?? KIND_LABELS[o.kind]
  const showSimRole = o.kind === 'prop' || Boolean(o.simulationRole)

  return (
    <section>
      <h3>
        {getAsset(o.assetId || '')?.name || title}{' '}
        <span className={blocks ? 'tag block' : 'tag'}>{blocks ? 'blocks path' : 'walkable'}</span>
      </h3>
      <p className="hint">Only properties for this {KIND_LABELS[o.kind].toLowerCase()} are shown.</p>

      <div className="grid3">
        <label>
          Position X
          <input
            type="number"
            step={0.5}
            value={round(o.position[0])}
            onChange={(e) => update({ position: [num(e.target.value, -999), o.position[1], o.position[2]] })}
          />
        </label>
        <label>
          Position Z
          <input
            type="number"
            step={0.5}
            value={round(o.position[2])}
            onChange={(e) => update({ position: [o.position[0], o.position[1], num(e.target.value, -999)] })}
          />
        </label>
      </div>

      <div className="grid3">
        {labels.map((label, axis) => (
          <label key={label}>
            {label}
            <input
              type="number"
              step={0.5}
              min={0.1}
              value={round(o.size[axis])}
              onChange={(e) => setSize(axis as 0 | 1 | 2, num(e.target.value, 0.05))}
            />
          </label>
        ))}
      </div>

      {o.kind !== 'wall' && (
        <label>
          Rotation°
          <input type="number" step={15} value={deg} onChange={(e) => update({ rotationY: ((Number(e.target.value) || 0) * Math.PI) / 180 })} />
        </label>
      )}

      {materials && !o.assetId && (
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

      {o.kind === 'building' && !o.assetId && (
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
          Blocks navigation
          {o.kind === 'platform' && o.solid === undefined && <small> (auto: taller than {STEP_HEIGHT})</small>}
        </label>
      )}

      {o.assetId && (
        <label>
          Color
          <input type="color" value={o.color || '#8fa6c9'} onChange={(e) => update({ color: e.target.value })} />
        </label>
      )}

      {showSimRole && (
        <label>
          Simulation role
          <select
            value={o.simulationRole ?? ''}
            onChange={(e) => {
              const v = e.target.value
              update({ simulationRole: v ? (v as SimulationRole) : undefined })
            }}
          >
            <option value="">None</option>
            {(Object.keys(SIMULATION_ROLE_LABELS) as SimulationRole[]).map((role) => (
              <option key={role} value={role}>
                {SIMULATION_ROLE_LABELS[role]}
              </option>
            ))}
          </select>
        </label>
      )}

      {o.kind === 'prop' && o.capacity != null && (
        <p className="hint">Capacity hint: {o.capacity}</p>
      )}

      <div className="row">
        {o.kind !== 'wall' && (
          <button type="button" title="Duplicate (D)" onClick={duplicateSelected}>
            Duplicate
          </button>
        )}
        <button type="button" className="danger" title="Delete (Delete)" onClick={deleteSelected}>
          Delete
        </button>
      </div>
    </section>
  )
}

function BuildingBrushPanel() {
  const s = useEditor()
  return (
    <section>
      <p className="hint">Choose a style, then click the ground to place. Stay in this tool to place several buildings.</p>
      <label>
        Style
        <select
          value={s.buildingStyle}
          onChange={(e) => {
            const style = e.target.value as keyof typeof BUILDING_STYLES
            s.set({ buildingStyle: style, roof: BUILDING_STYLES[style].roof })
          }}
        >
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
      <label className="check" title="Snap new buildings to the map grid (G)">
        <input type="checkbox" checked={s.snap} onChange={(e) => s.set({ snap: e.target.checked })} />
        Align to grid
      </label>
      <div className="row">
        <DonePlacingButton />
      </div>
    </section>
  )
}

function WallBrushPanel() {
  const s = useEditor()
  return (
    <section>
      <p className="hint">Press on the ground, drag, and release to draw a wall.</p>
      <label>
        Material
        <select value={s.wallMaterial} onChange={(e) => s.set({ wallMaterial: e.target.value as MaterialId })}>
          {WALL_MATERIALS.map((m) => (
            <option key={m} value={m}>
              {MATERIAL_LABELS[m]}
            </option>
          ))}
        </select>
      </label>
      <label className="check">
        <input type="checkbox" checked={s.snap} onChange={(e) => s.set({ snap: e.target.checked })} />
        Align to grid
      </label>
      <div className="row">
        <DonePlacingButton />
      </div>
    </section>
  )
}

function PlatformBrushPanel() {
  const s = useEditor()
  return (
    <section>
      <p className="hint">Drag out a rectangle. Asphalt reads as a road; taller platforms can block the robot.</p>
      <label>
        Material
        <select value={s.platformMaterial} onChange={(e) => s.set({ platformMaterial: e.target.value as MaterialId })}>
          {PLATFORM_MATERIALS.map((m) => (
            <option key={m} value={m}>
              {MATERIAL_LABELS[m]}
            </option>
          ))}
        </select>
      </label>
      <label className="check">
        <input type="checkbox" checked={s.snap} onChange={(e) => s.set({ snap: e.target.checked })} />
        Align to grid
      </label>
      <div className="row">
        <DonePlacingButton />
      </div>
    </section>
  )
}

function DecorBrushPanel() {
  const s = useEditor()
  return (
    <section>
      <p className="hint">Pick a decoration, then click the ground. Stay in this tool to place more.</p>
      <div className="row">
        {(['tree', 'streetlight', 'crate'] as DecorKind[]).map((k) => (
          <button key={k} type="button" className={s.decor === k ? 'on' : ''} aria-pressed={s.decor === k} onClick={() => s.set({ decor: k })}>
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
      <label className="check">
        <input type="checkbox" checked={s.snap} onChange={(e) => s.set({ snap: e.target.checked })} />
        Align to grid
      </label>
      <div className="row">
        <DonePlacingButton />
      </div>
    </section>
  )
}

function EventBrushPanel() {
  const s = useEditor()
  const [category, setCategory] = useState<EventCatalogCategory>('furniture')
  const [query, setQuery] = useState('')
  const entries = useMemo(() => {
    const list = listEventCatalog(category)
    const q = query.trim().toLowerCase()
    return q ? list.filter((e) => e.label.toLowerCase().includes(q) || e.id.includes(q)) : list
  }, [category, query])
  const activeInCategory = entries.some((e) => e.id === s.eventCatalogId)
  const selectedId = activeInCategory ? s.eventCatalogId : (entries[0]?.id ?? s.eventCatalogId)
  const selected = getEventCatalogEntry(selectedId)
  return (
    <section>
      <p className="hint">Choose a category and object, then click the ground. Stay in Event mode to place several props.</p>
      <div className="row">
        {EVENT_CATALOG_CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            className={category === c.id ? 'on' : ''}
            aria-pressed={category === c.id}
            onClick={() => {
              setCategory(c.id)
              const first = listEventCatalog(c.id)[0]
              if (first) s.set({ eventCatalogId: first.id })
            }}
          >
            {c.label}
          </button>
        ))}
      </div>
      <label>
        Search
        <input type="search" value={query} placeholder="Filter objects…" onChange={(e) => setQuery(e.target.value)} />
      </label>
      <label>
        Object
        <select
          value={selectedId}
          onChange={(e) => s.set({ eventCatalogId: e.target.value })}
          disabled={entries.length === 0}
          title={entries.length === 0 ? 'No objects match this search' : undefined}
        >
          {entries.map((e) => (
            <option key={e.id} value={e.id}>
              {e.label}
            </option>
          ))}
        </select>
      </label>
      {selected && (
        <p className="hint">
          Preview: {selected.label} · role {SIMULATION_ROLE_LABELS[selected.simulationRole] ?? selected.simulationRole}
          {selected.capacity != null ? ` · capacity ${selected.capacity}` : ''}
        </p>
      )}
      <label className="check">
        <input type="checkbox" checked={s.snap} onChange={(e) => s.set({ snap: e.target.checked })} />
        Align to grid
      </label>
      <div className="row">
        <DonePlacingButton />
      </div>
    </section>
  )
}

const round = (v: number) => Math.round(v * 100) / 100
