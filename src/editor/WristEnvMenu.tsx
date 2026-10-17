import { MenuButton } from './WristMenu'
import { worldActions } from '../world/actions'
import { ENVIRONMENT_IDS, getEnvironment, useEnvironment } from '../world/environment'
import { confirmReplace } from '../world/confirmation'

/**
 * Wrist-menu environment buttons. Calls worldActions.loadEnvironment with the shared
 * confirmation channel (no window.confirm) so XR and desktop stay consistent.
 */
export function WristEnvMenu() {
  const active = useEnvironment((s) => s.activeId)
  return (
    <>
      {ENVIRONMENT_IDS.map((id) => {
        const env = getEnvironment(id)!
        const short = env.name.replace(/\s+/g, ' ').slice(0, 14)
        return (
          <MenuButton
            key={id}
            width={0.154}
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
