import { Line } from '@react-three/drei'
import { useFlow } from './store'
import { ROUTE_COLORS } from './types'
import type { PlannedRoute, TrafficZone } from './types'
import type { Vec2 } from '../world/types'

const Y = 0.1
const Y_INTENT = 0.12
const noHit = () => null

const lift = (pts: Vec2[], y = Y) => pts.map(([x, z]) => [x, y, z] as [number, number, number])

function routeColor(route: PlannedRoute, selected: boolean): string {
  if (route.assignedAgentIds.length && route.status === 'valid') return ROUTE_COLORS.reserved
  if (selected && route.status === 'valid') return '#5eead4'
  return ROUTE_COLORS[route.status] ?? ROUTE_COLORS.valid
}

function ZoneMesh({ zone }: { zone: TrafficZone }) {
  const color =
    zone.type === 'no-go' || zone.type === 'restricted'
      ? '#ef476f'
      : zone.type === 'one-way'
        ? '#9b5de5'
        : zone.type === 'slow'
          ? '#ffd166'
          : '#4cc9f0'
  return (
    <group position={zone.position} rotation={[0, zone.rotationY, 0]}>
      <mesh position={[0, Math.max(0.05, zone.size[1] / 2), 0]} raycast={noHit}>
        <boxGeometry args={[zone.size[0], Math.max(0.08, zone.size[1]), zone.size[2]]} />
        <meshBasicMaterial color={color} transparent opacity={0.18} depthWrite={false} />
      </mesh>
    </group>
  )
}

function RouteMesh({ route, selected }: { route: PlannedRoute; selected: boolean }) {
  if (!route.visible) return null
  const color = routeColor(route, selected)
  const intent = route.waypoints
  const traj = route.trajectory.length > 1 ? route.trajectory : intent
  // Key forces drei Line to remount when the trajectory changes (points prop alone can stick).
  const trajKey = `${route.id}-${route.status}-${traj.length}-${traj[0]?.[0] ?? 0}-${traj[traj.length - 1]?.[0] ?? 0}`
  return (
    <group>
      {intent.length > 1 && (
        <Line
          key={`${route.id}-intent-${intent.length}`}
          points={lift(intent, Y_INTENT)}
          color={ROUTE_COLORS.intent}
          lineWidth={selected ? 2 : 1}
          dashed
          dashSize={0.35}
          gapSize={0.2}
          raycast={noHit}
        />
      )}
      {traj.length > 1 && (
        <Line
          key={trajKey}
          points={lift(traj)}
          color={color}
          lineWidth={selected ? 5 : 3}
          dashed={route.status === 'blocked' || route.status === 'unreachable'}
          dashSize={0.3}
          gapSize={0.2}
          raycast={noHit}
        />
      )}
      {intent.map((p, i) => (
        <mesh key={i} position={[p[0], 0.15, p[1]]} raycast={noHit}>
          <sphereGeometry args={[selected ? 0.28 : 0.2, 12, 12]} />
          <meshBasicMaterial color={i === 0 ? '#06d6a0' : i === intent.length - 1 ? '#ef476f' : color} />
        </mesh>
      ))}
    </group>
  )
}

/** Planned routes (intent dashed + execution solid) and traffic zones. */
export function FlowOverlay() {
  const showRoutes = useFlow((s) => s.showRoutes)
  const showZones = useFlow((s) => s.showZones)
  const routes = useFlow((s) => s.routes)
  const zones = useFlow((s) => s.trafficZones)
  const selected = useFlow((s) => s.selectedRouteId)
  const draft = useFlow((s) => s.draft)

  return (
    <group>
      {showRoutes &&
        Object.values(routes).map((r) => <RouteMesh key={r.id} route={r} selected={r.id === selected} />)}
      {showRoutes && draft && draft.waypoints.length > 0 && (
        <group>
          {draft.waypoints.length > 1 && (
            <Line points={lift(draft.waypoints)} color={ROUTE_COLORS.draft} lineWidth={4} raycast={noHit} />
          )}
          {draft.waypoints.map((p, i) => (
            <mesh key={i} position={[p[0], 0.16, p[1]]} raycast={noHit}>
              <sphereGeometry args={[0.22, 12, 12]} />
              <meshBasicMaterial color={ROUTE_COLORS.draft} />
            </mesh>
          ))}
        </group>
      )}
      {showZones && Object.values(zones).map((z) => <ZoneMesh key={z.id} zone={z} />)}
    </group>
  )
}
