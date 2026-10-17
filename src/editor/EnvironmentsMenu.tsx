import { useState } from 'react'
import { listEnvironments, useEnvironment, type EnvironmentId } from '../world/environment'
import {
  environmentShortName,
  isEnvironmentLoadBusy,
  loadEnvironmentFromMenu,
  type EnvMenuFeedback,
} from './environmentMenuController'

/**
 * Menu to switch hackathon environments (Forge / Mars / Warehouse).
 * Uses the shared confirmReplace channel and surfaces load failures without crashing the HUD.
 * Styled with the molten-forge HUD / inspector tokens.
 */
export function EnvironmentsMenu({ compact = false }: { compact?: boolean }) {
  const activeId = useEnvironment((s) => s.activeId)
  const envs = listEnvironments()
  const [feedback, setFeedback] = useState<EnvMenuFeedback>({ kind: 'idle' })
  const loading = feedback.kind === 'loading' || isEnvironmentLoadBusy()

  const load = (id: EnvironmentId) => {
    if (loading) return
    setFeedback({ kind: 'loading', id })
    void loadEnvironmentFromMenu(id).then(({ feedback: next }) => setFeedback(next))
  }

  const statusText =
    feedback.kind === 'loading'
      ? `Loading ${feedback.id}…`
      : feedback.kind === 'error'
        ? feedback.message
        : feedback.kind === 'cancelled'
          ? 'Load cancelled.'
          : null

  if (compact) {
    return (
      <div className="hud-panel env-menu-compact" role="group" aria-label="World templates">
        <span className="env-menu-label">Templates</span>
        {envs.map((env) => (
          <button
            key={env.id}
            type="button"
            className={activeId === env.id ? 'on' : ''}
            title={loading ? 'Loading a template…' : `Load ${env.name}: ${env.description}`}
            aria-pressed={activeId === env.id}
            disabled={loading}
            onClick={() => load(env.id)}
          >
            {environmentShortName(env.name)}
          </button>
        ))}
        {statusText && (
          <span className={`env-menu-status${feedback.kind === 'error' ? ' err' : ''}`} role="status" aria-live="polite">
            {statusText}
          </span>
        )}
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
              <button
                type="button"
                className={active ? 'on' : ''}
                onClick={() => load(env.id)}
                title={env.description}
                aria-pressed={active}
                disabled={loading}
              >
                <span className="env-name">{env.name}</span>
                <span className="env-desc">{env.description}</span>
              </button>
            </li>
          )
        })}
      </ul>
      {!activeId && feedback.kind === 'idle' && <p className="hint">Sandbox (default look) until you load one.</p>}
      {statusText && (
        <p className={`hint${feedback.kind === 'error' ? ' toast-err' : feedback.kind === 'ready' ? ' toast' : ''}`} role="status" aria-live="polite">
          {statusText}
        </p>
      )}
    </section>
  )
}
