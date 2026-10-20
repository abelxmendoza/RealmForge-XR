# Adaptive robotics layout engine — milestone 1

## Problem
Fit reusable modular equipment into unfamiliar physical spaces without manually redesigning every site. Motivated by generic restaurant back-of-house deployment challenges; no employer-specific designs or data are used.

## Shipped in this branch
- Pure TypeScript grid-search solver: `src/layout/optimizer.ts`.
- Rectangle rooms, obstacles, 90° rotations, configurable per-module clearance.
- Deterministic feasible placement or explicit no-solution/search-budget result.
- Unit tests: `src/layout/optimizer.test.ts`.

## Run
```bash
npm install
npm test
npm run build
```

## Known limitations
This is a **geometry feasibility prototype**, not a full configuration optimizer. It does not optimize throughput, connect modular ports, model plumbing/power, handle nonrectangular rooms, verify human safety, or simulate robotic reach. A search-budget result is **unknown**, not proof of infeasibility. The grid can miss off-grid solutions.

## Next milestone
Add a synthetic kitchen dataset, port/adjacency constraints, and a standalone viewer integration using existing RealmForge world schema. Keep simulation and scan ingestion out of scope until independent geometric validation passes.
