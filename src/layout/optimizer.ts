/** Deterministic, dependency-free MVP for modular equipment placement.
 * Coordinates are metres; footprints are axis-aligned for this first milestone.
 * Synthetic examples only: not an installation or safety certification tool.
 */
export type Rect = { x: number; z: number; width: number; depth: number };
export type Module = { id: string; width: number; depth: number; clearance?: number };
export type Placement = Rect & { id: string; rotated: boolean };
export type LayoutResult = { status: 'feasible'; placements: Placement[]; checked: number } | { status: 'infeasible'; placements: []; checked: number; reason: string };
const EPS = 1e-9;
const finitePositive = (n: number) => Number.isFinite(n) && n > 0;
export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width - EPS && a.x + a.width > b.x + EPS &&
    a.z < b.z + b.depth - EPS && a.z + a.depth > b.z + EPS;
}
export function inside(a: Rect, room: Rect): boolean {
  return a.x >= room.x - EPS && a.z >= room.z - EPS &&
    a.x + a.width <= room.x + room.width + EPS &&
    a.z + a.depth <= room.z + room.depth + EPS;
}
function inflated(p: Placement, c: number): Rect {
  return { x: p.x - c, z: p.z - c, width: p.width + 2*c, depth: p.depth + 2*c };
}
/** Search a bounded grid. Returns the first feasible configuration, not an optimum. */
export function solveLayout(room: Rect, modules: Module[], obstacles: Rect[] = [], step = 0.25, maxChecks = 200000): LayoutResult {
  if (![room.x, room.z].every(Number.isFinite) || !finitePositive(room.width) || !finitePositive(room.depth) ||
      !finitePositive(step) || !Number.isInteger(maxChecks) || maxChecks < 1 ||
      modules.some(m => !m.id || !finitePositive(m.width) || !finitePositive(m.depth) || !Number.isFinite(m.clearance ?? 0) || (m.clearance ?? 0) < 0) ||
      new Set(modules.map(m => m.id)).size !== modules.length ||
      obstacles.some(o => ![o.x,o.z].every(Number.isFinite) || !finitePositive(o.width) || !finitePositive(o.depth))) {
    throw new Error('Invalid room, module, obstacle or search parameters');
  }
  const placed: Placement[] = [];
  let checked = 0;
  let budgetHit = false;
  function visit(index: number): boolean {
    if (index === modules.length) return true;
    const m = modules[index], c = m.clearance ?? 0;
    const variants = [{ width: m.width, depth: m.depth, rotated: false }];
    if (Math.abs(m.width-m.depth) > EPS) variants.push({ width: m.depth, depth: m.width, rotated: true });
    for (const v of variants) {
      const nx = Math.floor((room.width - v.width - 2*c + EPS)/step);
      const nz = Math.floor((room.depth - v.depth - 2*c + EPS)/step);
      for (let iz = 0; iz <= nz; iz++) for (let ix = 0; ix <= nx; ix++) {
        if (++checked > maxChecks) { budgetHit = true; return false; }
        const p: Placement = { id: m.id, x: room.x + c + ix*step, z: room.z + c + iz*step, ...v };
        const envelope = inflated(p,c);
        if (!inside(envelope,room) || obstacles.some(o => overlaps(envelope,o)) ||
          placed.some(other => overlaps(envelope,inflated(other,modules.find(k=>k.id===other.id)!.clearance ?? 0)))) continue;
        placed.push(p);
        if (visit(index+1)) return true;
        placed.pop();
        if (budgetHit) return false;
      }
    }
    return false;
  }
  if (visit(0)) return { status:'feasible', placements: placed.slice(), checked };
  return { status:'infeasible', placements:[], checked, reason: budgetHit ? 'Search budget exhausted; feasibility unknown' : 'No placement found on the selected grid' };
}
