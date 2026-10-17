import { worldActions } from '../world/actions'
import { confirmReplace } from '../world/confirmation'
import { listEnvironments, useEnvironment, type EnvironmentId } from '../world/environment'

/**
 * Menu to switch hackathon environments (Forge / Mars / Warehouse).
 * Uses worldActions.loadEnvironment + the shared confirmReplace channel
 * so desktop, voice, and XR stay on one confirmation path.
 * Styled with the molten-forge HUD / inspector tokens.
 */
export function EnvironmentsMenu({ compact = false }: { compact?: boolean }) {
  const activeId = useEnvironment((s) => s.activeId)
  const envs = listEnvironments()

  const load = (id: EnvironmentId) => {
    void worldActions.loadEnvironment(id, { confirmReplace })
  }

  if (compact) {
    return (
      <div className="hud-panel env-menu-compact" role="group" aria-label="Environments">
        <span className="env-menu-label">Env</span>
        {envs.map((env) => (
          <button
            key={env.id}
            type="button"
            className={activeId === env.id ? 'on' : ''}
            title={env.description}
            aria-pressed={activeId === env.id}
            onClick={() => load(env.id)}
          >
            {shortName(env.name)}
          </button>
        ))}
      </div>
    )
  }

  return (
    <section className="env-menu" aria-label="Environments">
      <h3>Environments</h3>
      <p className="hint">Loads a full world layout and look. Replaces the current world (asks first).</p>
      <ul className="env-list">
        {envs.map((env) => {
          const active = activeId === env.id
          return (
            <li key={env.id} className={active ? 'active' : ''}>
              <button type="button" className={active ? 'on' : ''} onClick={() => load(env.id)} title={env.description} aria-pressed={active}>
                <span className="env-name">{env.name}</span>
                <span className="env-desc">{env.description}</span>
              </button>
            </li>
          )
        })}
      </ul>
      {!activeId && <p className="hint">Sandbox (default look) until you load one.</p>}
    </section>
  )
}

function shortName(name: string): string {
  if (name.startsWith('Forge')) return 'Forge'
  if (name.startsWith('Mars')) return 'Mars'
  if (name.startsWith('Autonomous')) return 'Warehouse'
  return name.split(/\s+/)[0] ?? name
}
