import { MenuButton } from './WristMenu'
import { worldActions } from '../world/actions'
import { ENVIRONMENT_IDS, getEnvironment, useEnvironment } from '../world/environment'
import { confirmReplace } from '../world/confirmation'

/**
 * Wrist-menu environment buttons. Calls worldActions.loadEnvironment with the shared
 * confirmation channel (no window.confirm) so XR and desktop stay consistent.
 * Stacked under Guide / Recenter so they stay pokeable.
 */
export function WristEnvMenu() {
  const active = useEnvironment((s) => s.activeId)
  const n = ENVIRONMENT_IDS.length
  const width = Math.min(0.154, (0.16 - 0.006 * (n - 1)) / n)
  const gap = 0.006
  const total = n * width + (n - 1) * gap
  return (
    <>
      {ENVIRONMENT_IDS.map((id, i) => {
        const env = getEnvironment(id)!
        const short = env.name.replace(/\s+/g, ' ').slice(0, 10)
        return (
          <MenuButton
            key={id}
            position={[-total / 2 + width / 2 + i * (width + gap), 0, 0]}
            width={width}
            label={short}
            active={active === id}
            onPress={() => {
              void worldActions.loadEnvironment(id, { confirmReplace })
            }}
          />
        )
      })}
    </>
  )
}
