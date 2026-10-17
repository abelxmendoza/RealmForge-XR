# Event Venue Builder

Hackathon MVP: turn an empty warehouse into a job fair (and other events) using a shared object catalog and a single virtual attendee.

**Branch:** `cursor/event-venue-builder-96f4`

## Create → Configure → Simulate → Experience

1. Load **Empty Event Venue** or **Job Fair**
2. Place / edit catalog objects (tool **8 Event object**)
3. Press **Start** in Event simulation
4. Move a booth into a walkway → attendee replans (or reports no path)

## Environments

| ID | Name |
| --- | --- |
| `empty-event-venue` | Empty rectangular venue (~18×14 m interior), entrance + exits |
| `job-fair` | Registration, 4 booths, seating, stage, barriers — all catalog props |

```ts
await loadEnvironment('empty-event-venue', { confirmReplace })
await loadEnvironment('job-fair', { confirmReplace })
```

## Universal event catalog

`src/world/eventCatalog.ts` — furniture, structures, equipment, wayfinding.

Placement creates `kind: 'prop'` with:

- `catalogId` — catalog entry
- `simulationRole` — entrance | exit | registration | booth | stage | …
- `solid` — navigation blocking (from catalog default; editable)

Appearance (mesh) is separate from role.

## Simulation (MVP)

`src/sim/attendee.ts` — **one** attendee agent.

Itinerary: Entrance → Registration → Booth → Booth → Exit

Controls (desktop inspector + `src/sim/actions.ts` for XR):

- `startAttendeeSimulation()`
- `pauseAttendeeSimulation()` / `resumeAttendeeSimulation()`
- `resetAttendeeSimulation()`

Uses existing A* / grid. Does **not** replace robot navigation.

**Disclaimer:** Not a certified crowd-flow, egress, or accessibility model.

## XR integration (Emiliano)

Expose without rewriting gestures:

```ts
import { worldActions } from '../world/actions'
import { listEventCatalog } from '../world/eventCatalog'
import { startAttendeeSimulation, pauseAttendeeSimulation, resetAttendeeSimulation } from '../sim/actions'

worldActions.loadEnvironment('job-fair', { confirmReplace: showXRConfirm })
listEventCatalog('furniture')
// place via worldActions.createObject(propFromCatalog(...))
startAttendeeSimulation()
```

Suggested wrist menu: Worlds | Objects | Events | Simulation | Save

## Persistence

`catalogId`, `simulationRole`, `capacity`, `serviceDuration` serialize in realmforge-world v1.
Older saves without these fields still load.

Loading an environment resets the attendee simulation.

## Known limitations

- Venue fits the existing 20×20 map (not a full 30×20 building shell yet)
- Single attendee only (multi-agent / analytics are stretch)
- Procedural meshes only
- Quest placement UX owned by Emiliano — not validated on headset in this PR
