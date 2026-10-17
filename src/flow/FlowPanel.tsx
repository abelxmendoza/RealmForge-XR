import { useWorld } from '../world/store'
import { useFlow } from './store'
import { flowActions } from './actions'
import type { PlannedRoute, TrafficZoneType } from './types'

const ZONE_TYPES: TrafficZoneType[] = ['no-go', 'one-way', 'slow', 'stop']

export function FlowPanel() {
  const tool = useWorld((s) => s.tool)
  const routes = useFlow((s) => s.routes)
  const zones = useFlow((s) => s.trafficZones)
  const selectedId = useFlow((s) => s.selectedRouteId)
  const draft = useFlow((s) => s.draft)
  const showRoutes = useFlow((s) => s.showRoutes)
  const showZones = useFlow((s) => s.showZones)
  const activeRouteId = useFlow((s) => s.activeRouteId)
  const paused = useFlow((s) => s.simulationPaused)
  const list = Object.values(routes)
  const selected = selectedId ? routes[selectedId] : null

  return (
    <section>
      <h3>RealmForge Flow</h3>
      <p className="hint" style={{ marginTop: 0 }}>
        Draw waypoint routes on the ground. Intent stays fixed when obstacles move — only the execution path replans.
      </p>
      <div className="row">
        <button
          type="button"
          className={tool === 'route' ? 'on' : ''}
          onClick={() => flowActions.beginRoute('waypoint')}
        >
          Route tool
        </button>
        <button type="button" className={showRoutes ? 'on' : ''} onClick={() => flowActions.setShowRoutes(!showRoutes)}>
          {showRoutes ? 'Hide routes' : 'Show routes'}
        </button>
        <button type="button" className={showZones ? 'on' : ''} onClick={() => flowActions.setShowZones(!showZones)}>
          {showZones ? 'Hide zones' : 'Show zones'}
        </button>
      </div>

      <div className="row" style={{ marginTop: 8, flexWrap: 'wrap', gap: 6 }}>
        {!draft ? (
          <button type="button" className="primary" onClick={() => flowActions.beginRoute('waypoint')}>
            New route
          </button>
        ) : (
          <>
            <span className="hint">
              {draft.waypoints.length} waypoint{draft.waypoints.length === 1 ? '' : 's'} — click ground to add · Enter finishes
            </span>
            <button
              type="button"
              className="primary"
              disabled={draft.waypoints.length < 2}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                flowActions.finishRoute()
              }}
            >
              Finish route
            </button>
            <button type="button" onClick={() => flowActions.undoWaypoint()}>
              Undo point
            </button>
            <button type="button" className="ghost" onClick={() => flowActions.cancelRoute()}>
              Cancel
            </button>
          </>
        )}
      </div>
      {tool === 'route' && !draft && <p className="hint">Route tool active — click the map to place waypoints.</p>}

      {list.length > 0 && (
        <ul className="flow-route-list" style={{ listStyle: 'none', padding: 0, margin: '10px 0' }}>
          {list.map((r) => (
            <RouteRow key={r.id} route={r} selected={r.id === selectedId} active={r.id === activeRouteId} />
          ))}
        </ul>
      )}

      {selected && <RouteEditor route={selected} />}

      <h4 style={{ marginBottom: 4 }}>Traffic zones</h4>
      <div className="row">
        {ZONE_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            title="Uses current ground pointer — hover the map first"
            onClick={() => {
              const r = flowActions.addZoneAtPointer(t)
              if (!r.ok) console.warn('[Flow]', r.error)
            }}
          >
            {t}
          </button>
        ))}
      </div>
      {Object.values(zones).length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0' }}>
          {Object.values(zones).map((z) => (
            <li key={z.id} className="row" style={{ justifyContent: 'space-between' }}>
              <span>
                {z.name} <span className="tag">{z.type}</span>
              </span>
              <button type="button" className="ghost" onClick={() => flowActions.deleteZone(z.id)}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="row" style={{ marginTop: 8 }}>
        <button type="button" onClick={() => (paused ? flowActions.resume() : flowActions.pause())}>
          {paused ? 'Resume agents' : 'Pause agents'}
        </button>
        <button type="button" onClick={() => flowActions.revalidate()}>
          Recalculate routes
        </button>
      </div>
    </section>
  )
}

function RouteRow({ route, selected, active }: { route: PlannedRoute; selected: boolean; active: boolean }) {
  return (
    <li>
      <button
        type="button"
        className={selected ? 'on' : ''}
        style={{ width: '100%', textAlign: 'left' }}
        onClick={() => flowActions.selectRoute(route.id)}
      >
        {route.name}{' '}
        <span className="tag">{route.status}</span>
        {active && <span className="tag">active</span>}
        <span className="hint"> · {route.waypoints.length} pts</span>
      </button>
    </li>
  )
}

function RouteEditor({ route }: { route: PlannedRoute }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label className="field">
        Name
        <input
          value={route.name}
          onChange={(e) => flowActions.renameRoute(route.id, e.target.value)}
        />
      </label>
      {route.message && <p className="hint">{route.message}</p>}
      <div className="row">
        <button type="button" onClick={() => flowActions.assignToRobot(route.id)}>
          Assign to robot
        </button>
        <button type="button" onClick={() => flowActions.clearAssignment(route.id)}>
          Clear assignment
        </button>
        <button type="button" onClick={() => flowActions.reverseRoute(route.id)}>
          Reverse
        </button>
        <button type="button" onClick={() => flowActions.duplicateRoute(route.id)}>
          Duplicate
        </button>
        <button type="button" className="ghost" onClick={() => flowActions.deleteRoute(route.id)}>
          Delete
        </button>
      </div>
    </div>
  )
}
