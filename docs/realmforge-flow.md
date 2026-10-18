# RealmForge Flow — Spatial Navigation & Traffic Control

Blueprint 8.0 MVP: planned routes (user intent) stay separate from A* execution trajectories.

## Architecture

```
Desktop / XR / Voice
        │
 World Action API + Flow Action API
        │
   ┌────┴────┐
 World Editor   Flow Controller
   (objects)    (routes, zones)
        │            │
        └────┬───────┘
      Navigation grid + A*
             │
        Simulation
```

| Module | Role |
| --- | --- |
| `src/flow/types.ts` | `PlannedRoute`, `TrafficZone`, status colors |
| `src/flow/store.ts` | Zustand routes / zones / draft / pointer |
| `src/flow/validate.ts` | Trajectory via chained A*; no-go in grid |
| `src/flow/controller.ts` | Draft/edit, revalidate on geometry commit |
| `src/flow/placement.ts` | Overlap reject + route warnings + suggestion |
| `src/flow/actions.ts` | Shared desktop / XR / voice API |
| `src/flow/RouteOverlay.tsx` | Intent (dashed) + trajectory (solid) |
| `src/flow/FlowPanel.tsx` | Inspector UI |

**Do not** rewrite A* or Quest gestures. Flow sits above `src/nav/*`.

## Intent vs trajectory

- **Waypoints** = what the user wants (Entrance → Registration → Exit).
- **Trajectory** = how A* accomplishes it right now.
- Moving a booth invalidates / replans the trajectory only; waypoints are preserved.

## Desktop

1. Press **P** or choose **Route / Flow**.
2. Click the ground to add waypoints.
3. **Finish** in the Flow panel (or voice “finish route”).
4. **Assign to robot** to navigate the multi-waypoint path.
5. Move a solid object onto the path → route turns yellow (replanned) or red (blocked).

## XR

Route tool is on the control palette. Waypoint clicks use the same ground hit-testing as other tools (world-local metres). Tabletop move/scale does not alter stored coordinates. Full freehand stroke snapping can ship with Emiliano’s gesture pass later; waypoint mode is the MVP.

## Voice (pointer supplies coordinates)

| Command | Result |
| --- | --- |
| Create a new route | Start draft |
| Add waypoint here | Add at current pointer |
| Finish route | Validate & save |
| Cancel route | Discard draft |
| Recalculate all routes | Revalidate |
| Show / hide routes | Overlay toggle |
| Pause / resume agents | Simulation flag |
| Assign route / clear selected route | Assignment (clear confirms) |
| Avoid selected area / one-way path | Zone at pointer |

## Persistence

World JSON may include optional `routes` and `trafficZones`. Trajectories are **not** authoritative on disk — they regenerate after load. Older saves without these fields still load.

## Placement

Solid overlap / out-of-bounds / robot overlap → **reject** with optional nearest-valid suggestion (user must accept). Blocking a planned route → **warn**, still allow placement (Flow replans).

## Out of scope (later)

- Full crowd / multi-agent reservation physics
- Freehand stroke resampling in XR
- Code-compliance exit guarantees
