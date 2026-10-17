import type { LandingWorldId } from './entry'

const point = (x: number, z: number, height = 0) => [340 + (x - z) * 34, 118 + (x + z) * 18 - height]
const path = (vertices: number[][]) => vertices.map((vertex) => vertex.join(',')).join(' ')
const footprint = (x: number, z: number, width: number, depth: number, h = 0) => [point(x, z, h), point(x + width, z, h), point(x + width, z + depth, h), point(x, z + depth, h)]

/** Small illustrative model, drawn locally rather than loading the editor's XR renderer. */
export function WorldDiorama({ world, compact = false }: { world: LandingWorldId; compact?: boolean }) {
  const mars = world === 'mars-outpost', warehouse = world === 'warehouse'
  const terrain = mars ? '#925c45' : warehouse ? '#7e918c' : '#8c9c83'
  const road = mars ? '#bd8c68' : '#a9b2a5'
  const route = [point(3.8, 7.3, 5), point(3.8, 5, 5), point(3.8, 3.8, 5), point(6.7, 3.8, 5), point(6.7, 1, 5)]
  const buildings = warehouse ? [
    [0.8, 0.7, 1.2, 1.8, 52], [0.8, 4.7, 1.2, 1.8, 52], [5, 0.6, 1.2, 1.8, 52], [5, 5.2, 1.2, 1.8, 52], [1, 3, 1.4, 0.7, 24], [5, 3, 1.2, 0.7, 24],
  ] : mars ? [
    [0.9, 0.7, 1.3, 1.2, 36], [0.9, 5.7, 1.5, 1.2, 36], [5.2, 0.7, 1.4, 1.2, 44], [5.1, 5.5, 1.6, 1.2, 32], [0.8, 3, 1, 0.8, 24], [5.2, 3, 0.8, 0.8, 88],
  ] : [
    [0.8, 0.8, 1.1, 1.2, 93], [2.2, 0.8, 0.7, 0.8, 56], [0.8, 5.3, 1.4, 1.1, 48], [1.5, 3.2, 1, 1, 38], [5.2, 0.8, 1.1, 1.1, 116], [5.2, 5.3, 1.2, 1.3, 66], [5.1, 3.1, 1, 0.7, 40],
  ]
  return <svg className="rf-diorama" viewBox="0 0 680 470" role="img" aria-label={`${mars ? 'Mars research outpost' : warehouse ? 'Warehouse with equipment' : 'Miniature city'} illustration with a robot route`}>
    <ellipse cx="340" cy="371" rx="232" ry="47" fill="#000" opacity="0.24" />
    <polygon points={path([point(0, 8), point(8, 8), point(8, 8, -20), point(0, 8, -20)])} fill="#343d36" />
    <polygon points={path([point(8, 0), point(8, 8), point(8, 8, -20), point(8, 0, -20)])} fill="#202923" />
    <polygon points={path(footprint(0, 0, 8, 8))} fill={terrain} stroke="#c4cbb2" strokeWidth="1.5" />
    {Array.from({ length: 17 }, (_, i) => <g key={i} stroke="#e6ebdb" strokeWidth="0.5" opacity="0.14"><polyline points={path([point(i / 2, 0), point(i / 2, 8)])} /><polyline points={path([point(0, i / 2), point(8, i / 2)])} /></g>)}
    <polygon points={path(footprint(3.2, 0, 1.2, 8, 1))} fill={road} />
    <polygon points={path(footprint(0, 3.3, 8, 1.1, 1))} fill={road} />
    <polyline points={path([point(3.8, 0), point(3.8, 8)])} fill="none" stroke="#e7ddba" strokeWidth="1.5" strokeDasharray="7 7" />
    {[...buildings].sort((a, b) => a[0] + a[1] - b[0] - b[1]).map(([x, z, width, depth, h], index) => {
      const bottom = footprint(x, z, width, depth), top = footprint(x, z, width, depth, h)
      const roof = mars ? '#ded3bc' : warehouse ? '#d8bf8a' : index % 2 ? '#c4c9bc' : '#ede8d6'
      return <g key={index}>
        <polygon points={path([top[2], top[3], bottom[3], bottom[2]])} fill={mars ? '#bca78b' : warehouse ? '#415e66' : '#53696e'} />
        <polygon points={path([top[1], top[2], bottom[2], bottom[1]])} fill={mars ? '#8d8981' : warehouse ? '#263f4c' : '#334b56'} />
        <polygon points={path(top)} fill={roof} stroke="#fff" strokeOpacity="0.25" />
        {!warehouse && <polygon points={path(footprint(x + width * 0.25, z + depth * 0.25, width * 0.5, depth * 0.5, h + 4))} fill="#73858a" />}
        {Array.from({ length: Math.max(1, Math.floor(h / 18)) }, (_, floor) => <g key={floor} stroke={warehouse ? '#e4ae55' : '#b6d2cb'} strokeWidth={warehouse ? 3 : 2} opacity="0.75">
          <polyline points={path([point(x + width, z + depth, 8 + floor * 17), point(x, z + depth, 8 + floor * 17)])} />
          <polyline points={path([point(x + width, z, 8 + floor * 17), point(x + width, z + depth, 8 + floor * 17)])} />
        </g>)}
      </g>
    })}
    {[point(2.8, 5), point(4.8, 6.4), point(6.8, 4.7)].map(([x, y], i) => <g key={i}><path d={`M${x} ${y}v-22`} stroke="#3c4a3e" strokeWidth="2" /><ellipse cx={x} cy={y - 25} rx="8" ry="12" fill={mars ? '#bc7855' : warehouse ? '#adab73' : '#567859'} /></g>)}
    <polyline className={compact ? '' : 'rf-route'} points={path(route)} stroke="#ffd795" fill="none" strokeWidth="3" strokeDasharray="6 5" strokeLinejoin="round" />
    <circle cx={route[route.length - 1][0]} cy={route[route.length - 1][1]} r="7" fill="none" stroke="#ffd795" strokeWidth="2" />
    <g transform={`translate(${route[0][0]},${route[0][1]})`}><ellipse cy="4" rx="13" ry="7" fill="#273632" /><rect x="-9" y="-9" width="18" height="12" rx="4" fill="#ffe1a5" /><rect x="-6" y="-7" width="12" height="4" rx="2" fill="#293a3b" /><circle cx="-3" cy="-5" r="1" fill="#77ded7" /><circle cx="3" cy="-5" r="1" fill="#77ded7" /></g>
    {!compact && <g fill="#9eaa98" fontFamily="monospace" fontSize="9" letterSpacing="2"><text x="325" y="451" textAnchor="middle">WORLD-LOCAL COORDINATES / ILLUSTRATION</text></g>}
  </svg>
}
