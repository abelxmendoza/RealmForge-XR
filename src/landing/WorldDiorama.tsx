import type { LandingWorldId } from './entry'

const point = (x: number, z: number, height = 0) => [340 + (x - z) * 34, 118 + (x + z) * 18 - height]
const path = (vertices: number[][]) => vertices.map((vertex) => vertex.join(',')).join(' ')
const footprint = (x: number, z: number, width: number, depth: number, h = 0) => [
  point(x, z, h),
  point(x + width, z, h),
  point(x + width, z + depth, h),
  point(x, z + depth, h),
]

function labelFor(world: LandingWorldId) {
  if (world === 'mars-outpost') return 'Mars research outpost'
  if (world === 'warehouse') return 'Warehouse with equipment'
  if (world === 'empty-event-venue') return 'Empty Space'
  if (world === 'job-fair') return 'Job fair venue with booths and stage'
  if (world === 'factory-floor') return 'Factory floor with machines, an assembly line and robot cells'
  if (world === 'music-festival') return 'Music festival site with a main stage, gates and food stalls'
  return 'Miniature city'
}

/** Small illustrative model, drawn locally rather than loading the editor's XR renderer. */
export function WorldDiorama({ world, compact = false }: { world: LandingWorldId; compact?: boolean }) {
  const mars = world === 'mars-outpost'
  const warehouse = world === 'warehouse'
  const venue = world === 'empty-event-venue' || world === 'job-fair'
  const jobFair = world === 'job-fair'
  const factory = world === 'factory-floor'
  const festival = world === 'music-festival'
  // Industrial styling (dark teal walls, amber trim) and whether a person, not a robot, walks the route.
  const industrial = warehouse || venue || factory
  const walker = venue || festival
  const terrain = mars ? '#925c45' : festival ? '#6f9a5c' : factory ? '#78838a' : warehouse || venue ? '#7e918c' : '#8c9c83'
  const road = mars ? '#bd8c68' : venue ? '#9aa7a1' : factory ? '#d6b25e' : '#a9b2a5'
  const route = venue
    ? [point(4, 7.2, 5), point(4, 5.2, 5), point(2.2, 5.2, 5), point(2.2, 2.8, 5), point(5.5, 2.8, 5), point(5.5, 1.2, 5)]
    : festival
      ? [point(4, 7.6, 5), point(4, 6.4, 5), point(1.9, 4.8, 5), point(3.2, 3, 5), point(5.6, 4.4, 5), point(7.6, 6, 5)]
      : factory
        ? [point(6.4, 6.4, 5), point(6.4, 4.1, 5), point(1.6, 4.1, 5), point(1.6, 3.1, 5)]
        : [point(3.8, 7.3, 5), point(3.8, 5, 5), point(3.8, 3.8, 5), point(6.7, 3.8, 5), point(6.7, 1, 5)]

  const buildings = factory
    ? [
        // CNC machines (north row)
        [0.7, 0.7, 0.9, 0.7, 30],
        [2.1, 0.7, 0.9, 0.7, 30],
        [3.5, 0.7, 0.9, 0.7, 30],
        // robot cells
        [5.2, 0.6, 1, 1, 34],
        [6.5, 0.6, 1, 1, 34],
        // assembly conveyor and workbenches
        [1, 2.3, 4.2, 0.35, 12],
        [1.3, 2.9, 0.6, 0.3, 14],
        [2.6, 2.9, 0.6, 0.3, 14],
        [3.9, 2.9, 0.6, 0.3, 14],
        // racking
        [4.6, 5.6, 2.6, 0.5, 48],
        [4.6, 6.3, 2.6, 0.5, 48],
      ]
    : festival
      ? [
          // main stage
          [2.2, 0.4, 3.6, 1.6, 26],
          // light towers
          [1.5, 2.6, 0.2, 0.2, 70],
          [6.3, 2.6, 0.2, 0.2, 70],
          // food stalls (west) and merch (east)
          [0.4, 2.8, 0.6, 0.6, 22],
          [0.4, 3.8, 0.6, 0.6, 22],
          [0.4, 4.8, 0.6, 0.6, 22],
          [7, 3.4, 0.7, 0.7, 24],
          // front-of-house
          [3.6, 3.8, 0.8, 0.6, 14],
          // security gates
          [2.4, 6.8, 0.7, 0.3, 20],
          [3.5, 6.8, 0.7, 0.3, 20],
          [4.6, 6.8, 0.7, 0.3, 20],
        ]
      : warehouse
    ? [
        [0.8, 0.7, 1.2, 1.8, 52],
        [0.8, 4.7, 1.2, 1.8, 52],
        [5, 0.6, 1.2, 1.8, 52],
        [5, 5.2, 1.2, 1.8, 52],
        [1, 3, 1.4, 0.7, 24],
        [5, 3, 1.2, 0.7, 24],
      ]
    : mars
      ? [
          [0.9, 0.7, 1.3, 1.2, 36],
          [0.9, 5.7, 1.5, 1.2, 36],
          [5.2, 0.7, 1.4, 1.2, 44],
          [5.1, 5.5, 1.6, 1.2, 32],
          [0.8, 3, 1, 0.8, 24],
          [5.2, 3, 0.8, 0.8, 88],
        ]
      : venue
        ? jobFair
          ? [
              // registration desk
              [3.2, 5.8, 1.6, 0.55, 18],
              // left booths
              [0.7, 1.4, 1.1, 1.4, 28],
              [0.7, 3.4, 1.1, 1.4, 28],
              // right booths
              [6.2, 1.4, 1.1, 1.4, 28],
              [6.2, 3.4, 1.1, 1.4, 28],
              // seating tables
              [2.6, 3.2, 1, 0.7, 14],
              [4.4, 3.2, 1, 0.7, 14],
              // stage
              [2.8, 0.6, 2.4, 1.1, 22],
            ]
          : [
              // perimeter posts / low walls only — open floor
              [0.5, 0.5, 0.4, 0.4, 36],
              [7.1, 0.5, 0.4, 0.4, 36],
              [0.5, 7.1, 0.4, 0.4, 36],
              [7.1, 7.1, 0.4, 0.4, 36],
              [0.5, 3.6, 0.35, 0.9, 30],
              [7.15, 3.6, 0.35, 0.9, 30],
            ]
        : [
            [0.8, 0.8, 1.1, 1.2, 93],
            [2.2, 0.8, 0.7, 0.8, 56],
            [0.8, 5.3, 1.4, 1.1, 48],
            [1.5, 3.2, 1, 1, 38],
            [5.2, 0.8, 1.1, 1.1, 116],
            [5.2, 5.3, 1.2, 1.3, 66],
            [5.1, 3.1, 1, 0.7, 40],
          ]

  return (
    <svg
      className="rf-diorama"
      viewBox="0 0 680 470"
      role="img"
      aria-label={`${labelFor(world)} illustration with a ${walker ? 'visitor' : 'robot'} route`}
    >
      <ellipse cx="340" cy="371" rx="232" ry="47" fill="#000" opacity="0.24" />
      <polygon points={path([point(0, 8), point(8, 8), point(8, 8, -20), point(0, 8, -20)])} fill="#343d36" />
      <polygon points={path([point(8, 0), point(8, 8), point(8, 8, -20), point(8, 0, -20)])} fill="#202923" />
      <polygon points={path(footprint(0, 0, 8, 8))} fill={terrain} stroke="#c4cbb2" strokeWidth="1.5" />
      {Array.from({ length: 17 }, (_, i) => (
        <g key={i} stroke="#e6ebdb" strokeWidth="0.5" opacity="0.14">
          <polyline points={path([point(i / 2, 0), point(i / 2, 8)])} />
          <polyline points={path([point(0, i / 2), point(8, i / 2)])} />
        </g>
      ))}
      {!venue && !festival && !factory && <polygon points={path(footprint(3.2, 0, 1.2, 8, 1))} fill={road} />}
      {!venue && !festival && <polygon points={path(footprint(0, 3.3, 8, 1.1, 1))} fill={road} opacity={factory ? 0.55 : 1} />}
      {venue && (
        <>
          {/* open hall floor wash */}
          <polygon points={path(footprint(0.6, 0.6, 6.8, 6.8, 1))} fill={road} opacity="0.55" />
          {/* south entrance gap marker */}
          <polygon points={path(footprint(3.2, 7.2, 1.6, 0.5, 2))} fill="#e07845" opacity="0.85" />
          {/* north exit */}
          <polygon points={path(footprint(3.2, 0.3, 1.6, 0.45, 2))} fill="#5ecf9a" opacity="0.75" />
        </>
      )}
      {!venue && !festival && !factory && <polyline points={path([point(3.8, 0), point(3.8, 8)])} fill="none" stroke="#e7ddba" strokeWidth="1.5" strokeDasharray="7 7" />}
      {[...buildings]
        .sort((a, b) => a[0] + a[1] - b[0] - b[1])
        .map(([x, z, width, depth, h], index) => {
          const bottom = footprint(x, z, width, depth)
          const top = footprint(x, z, width, depth, h)
          const roof = festival
            ? (['#3a3f47', '#fff3bf', '#fff3bf', '#e07845', '#e07845', '#e07845', '#7048e8', '#495057'][index] ?? '#51cf66')
            : factory
              ? (index === 3 || index === 4 ? '#f59f00' : '#c9d1d9')
              : mars ? '#ded3bc' : warehouse || venue ? (jobFair && index === buildings.length - 1 ? '#f0a46a' : '#d8bf8a') : index % 2 ? '#c4c9bc' : '#ede8d6'
          return (
            <g key={index}>
              <polygon points={path([top[2], top[3], bottom[3], bottom[2]])} fill={festival ? '#4b4458' : mars ? '#bca78b' : industrial ? '#415e66' : '#53696e'} />
              <polygon points={path([top[1], top[2], bottom[2], bottom[1]])} fill={festival ? '#2f2a3a' : mars ? '#8d8981' : industrial ? '#263f4c' : '#334b56'} />
              <polygon points={path(top)} fill={roof} stroke="#fff" strokeOpacity="0.25" />
              {!industrial && !festival && <polygon points={path(footprint(x + width * 0.25, z + depth * 0.25, width * 0.5, depth * 0.5, h + 4))} fill="#73858a" />}
              {Array.from({ length: Math.max(1, Math.floor(h / 18)) }, (_, floor) => (
                <g key={floor} stroke={industrial || festival ? '#e4ae55' : '#b6d2cb'} strokeWidth={industrial || festival ? 3 : 2} opacity="0.75">
                  <polyline points={path([point(x + width, z + depth, 8 + floor * 17), point(x, z + depth, 8 + floor * 17)])} />
                  <polyline points={path([point(x + width, z, 8 + floor * 17), point(x + width, z + depth, 8 + floor * 17)])} />
                </g>
              ))}
            </g>
          )
        })}
      {!venue && !factory &&
        (festival ? [point(0.3, 7.4), point(7.6, 0.6), point(7.4, 7.4)] : [point(2.8, 5), point(4.8, 6.4), point(6.8, 4.7)]).map(([x, y], i) => (
          <g key={i}>
            <path d={`M${x} ${y}v-22`} stroke="#3c4a3e" strokeWidth="2" />
            <ellipse cx={x} cy={y - 25} rx="8" ry="12" fill={mars ? '#bc7855' : warehouse ? '#adab73' : festival ? '#3f6b3a' : '#567859'} />
          </g>
        ))}
      <polyline
        className={compact ? '' : 'rf-route'}
        points={path(route)}
        stroke="#ffd795"
        fill="none"
        strokeWidth="3"
        strokeDasharray="6 5"
        strokeLinejoin="round"
      />
      <circle cx={route[route.length - 1][0]} cy={route[route.length - 1][1]} r="7" fill="none" stroke="#ffd795" strokeWidth="2" />
      <g transform={`translate(${route[0][0]},${route[0][1]})`}>
        <ellipse cy="4" rx="13" ry="7" fill="#273632" />
        {walker ? (
          <>
            <circle cy="-10" r="5" fill="#ffe1a5" />
            <rect x="-5" y="-5" width="10" height="12" rx="3" fill="#e8dcc8" />
          </>
        ) : (
          <>
            <rect x="-9" y="-9" width="18" height="12" rx="4" fill="#ffe1a5" />
            <rect x="-6" y="-7" width="12" height="4" rx="2" fill="#293a3b" />
            <circle cx="-3" cy="-5" r="1" fill="#77ded7" />
            <circle cx="3" cy="-5" r="1" fill="#77ded7" />
          </>
        )}
      </g>
      {!compact && (
        <g fill="#9eaa98" fontFamily="monospace" fontSize="9" letterSpacing="2">
          <text x="325" y="451" textAnchor="middle">
            {walker ? 'VENUE LAYOUT / ILLUSTRATION' : factory ? 'PLANT LAYOUT / ILLUSTRATION' : 'WORLD-LOCAL COORDINATES / ILLUSTRATION'}
          </text>
        </g>
      )}
    </svg>
  )
}
