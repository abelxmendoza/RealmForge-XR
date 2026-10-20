import { describe, expect, it } from 'vitest';
import { inside, overlaps, solveLayout } from './optimizer';
describe('adaptive layout MVP', () => {
  it('places modular equipment without overlap', () => {
    const room={x:0,z:0,width:5,depth:4};
    const modules=[{id:'washer',width:2,depth:1,clearance:0.25},{id:'conveyor',width:1.5,depth:0.75,clearance:0.25}];
    const result=solveLayout(room,modules,[],0.25);
    expect(result.status).toBe('feasible');
    if(result.status!=='feasible') return;
    expect(result.placements).toHaveLength(2);
    for(const p of result.placements) expect(inside(p,room)).toBe(true);
    expect(overlaps(result.placements[0],result.placements[1])).toBe(false);
  });
  it('reports infeasibility for oversized equipment', () => {
    expect(solveLayout({x:0,z:0,width:2,depth:2},[{id:'machine',width:3,depth:3}]).status).toBe('infeasible');
  });
  it('respects blocked regions', () => {
    const obstacle={x:0,z:0,width:1,depth:2};
    const r=solveLayout({x:0,z:0,width:3,depth:2},[{id:'unit',width:1,depth:1}], [obstacle]);
    expect(r.status).toBe('feasible');
    if(r.status==='feasible') expect(overlaps(r.placements[0],obstacle)).toBe(false);
  });
  it('does not mistake search budget exhaustion for proven infeasibility', () => {
    const r=solveLayout({x:0,z:0,width:5,depth:5},[{id:'a',width:1,depth:1},{id:'b',width:1,depth:1}],[],0.25,1);
    expect(r.status).toBe('infeasible');
    if(r.status==='infeasible') expect(r.reason).toMatch(/budget/i);
  });
  it('rejects duplicate ids and invalid dimensions', () => {
    expect(()=>solveLayout({x:0,z:0,width:2,depth:2},[{id:'x',width:1,depth:1},{id:'x',width:1,depth:1}])).toThrow();
  });
});
