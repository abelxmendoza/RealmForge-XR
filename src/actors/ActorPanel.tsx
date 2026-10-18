import { useEffect, useState, useSyncExternalStore } from 'react'
import { worldActions } from '../world/actions'
import { useWorld } from '../world/store'
import { useEditor } from '../editor/settings'
import { requestConfirmation } from '../world/confirmation'
import { ACTOR_CATALOG, ACTOR_KINDS, MAX_ACTORS, type Actor } from './types'
import { actorRuntimeRevision, getActorRuntime, subscribeActorRuntime } from './runtime'

export function ActorPanel() {
  const actors = useWorld((s) => s.actors)
  const selectedId = useWorld((s) => s.selectedActorId)
  const tool = useWorld((s) => s.tool)
  const kind = useEditor((s) => s.actorKind)
  const message = useEditor((s) => s.actorMessage)
  const selected = selectedId ? actors[selectedId] : null
  const [name, setName] = useState(selected?.name || '')
  useEffect(() => setName(selected?.name || ''), [selected?.id, selected?.name])
  useSyncExternalStore(subscribeActorRuntime, actorRuntimeRevision, actorRuntimeRevision)
  const report = (result: { ok: boolean; error?: string }, done = 'Actor updated.') => useEditor.getState().set({ actorMessage: result.ok ? done : result.error || 'Action failed.' })
  const update = (patch: Partial<Omit<Actor, 'id' | 'kind'>>) => { if (selected) report(worldActions.updateActor(selected.id, patch)) }
  return (
    <section>
      <h3>
        Actors{' '}
        <small>
          {Object.keys(actors).length}/{MAX_ACTORS}
        </small>
      </h3>
      <p className="hint">Choose a type, then click clear ground to place. Stay in Actors to place several.</p>
      <div className="actor-kind-grid">
        {ACTOR_KINDS.map((id) => (
          <button
            key={id}
            type="button"
            className={tool === 'actor' && kind === id ? 'on' : ''}
            aria-pressed={tool === 'actor' && kind === id}
            onClick={() => worldActions.selectActorKind(id)}
          >
            {ACTOR_CATALOG[id].name}
          </button>
        ))}
      </div>
      {tool === 'actor' && (
        <p className="hint">Aim at clear ground and click to place a {ACTOR_CATALOG[kind].name.toLowerCase()}. Green fits; red is blocked.</p>
      )}
      <label>
        Control actor
        <select
          aria-label="Control actor"
          value={selectedId || ''}
          onChange={(e) => {
            worldActions.selectActor(e.target.value || null)
            worldActions.setTool('select')
          }}
        >
          <option value="">Original robot</option>
          {Object.values(actors).map((actor) => (
            <option key={actor.id} value={actor.id}>
              {actor.name}
            </option>
          ))}
        </select>
      </label>
      {selected && (
        <>
          <p className="actor-status" role="status">
            Type: {ACTOR_CATALOG[selected.kind].name} · Navigation: {getActorRuntime(selected.id)?.status || 'idle'}
          </p>
          <label>
            Name
            <input
              aria-label="Actor name"
              value={name}
              maxLength={48}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => {
                const result = worldActions.updateActor(selected.id, { name })
                report(result)
                if (!result.ok) setName(selected.name)
              }}
            />
          </label>
          <label>
            Color
            <input aria-label="Actor color" type="color" value={selected.color} onChange={(e) => update({ color: e.target.value })} />
          </label>
          <label>
            Speed (m/s)
            <input
              aria-label="Actor speed"
              type="number"
              min={0.1}
              max={8}
              step={0.1}
              value={selected.speed}
              onChange={(e) => update({ speed: Number(e.target.value) })}
            />
          </label>
          <div className="grid3">
            {['Width', 'Height', 'Depth'].map((label, axis) => (
              <label key={label}>
                {label}
                <input
                  aria-label={`Actor ${label.toLowerCase()}`}
                  type="number"
                  min={0.3}
                  max={8}
                  step={0.1}
                  value={selected.size[axis]}
                  onChange={(e) => {
                    const size = [...selected.size] as Actor['size']
                    size[axis] = Number(e.target.value)
                    update({ size })
                  }}
                />
              </label>
            ))}
          </div>
          <div className="row">
            <button type="button" className={tool === 'goal' ? 'on' : ''} onClick={() => worldActions.setTool('goal')}>
              Set destination
            </button>
            <button type="button" onClick={() => report(worldActions.setActorGoal(selected.id, null), 'Actor stopped.')}>
              Stop
            </button>
          </div>
          <div className="row">
            <button type="button" onClick={() => report(worldActions.duplicateActor(selected.id), 'Actor duplicated.')}>
              Duplicate
            </button>
            <button
              type="button"
              className="danger"
              onClick={async () => {
                const id = selected.id
                if (await requestConfirmation({ type: 'DELETE', message: `Delete actor "${selected.name}"?` })) {
                  worldActions.removeActor(id)
                  useEditor.getState().set({ actorMessage: 'Actor deleted.' })
                }
              }}
            >
              Delete
            </button>
          </div>
          <p className="hint">Use Set destination, then click ground — or send to a catalog destination marker.</p>
        </>
      )}
      <p className="hint">Actors path around world obstacles. They do not avoid each other yet.</p>
      {tool === 'actor' && (
        <div className="row">
          <button type="button" className="ghost" title="Leave placement and return to Select (1)" onClick={() => worldActions.setTool('select')}>
            Done placing
          </button>
        </div>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  )
}
