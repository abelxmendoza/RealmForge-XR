import { idFor, type WorldSnapshot } from './store'
import type { WorldObject } from './types'
import { propFromCatalog } from './eventCatalog'

/**
 * Fictional, modular four-arm dishroom for desktop and WebXR.
 * Not an Armstrong floor plan or a verified robot/industrial safety model.
 * All measurements are illustrative metres, not surveyed dimensions.
 */
export function roboticDishroom(): WorldSnapshot {
  const objects: WorldObject[] = []
  const box = (kind: 'wall' | 'platform', x: number, z: number, w: number, h: number, d: number, color: string, solid = true, rotationY = 0) => {
    objects.push({ id: idFor(kind), kind, position: [x,0,z], size: [w,h,d], rotationY, color, material: kind === 'wall' ? 'metal' : 'concrete', solid })
  }
  const machine = (catalogId: string, x: number, z: number, rotationY = 0): boolean => {
    const asset = propFromCatalog(catalogId, [x,0,z], rotationY)
    if (!asset) return false
    objects.push({ ...asset, id: idFor('prop'), solid: true })
    return true
  }
  // Room 16 × 12 m, with a 2.4 m entry opening on the south side.
  box('platform',0,0,16,0.05,12,'#a7b2ba',false)
  box('wall',0,-6,16,3.4,0.18,'#d0d7da')
  box('wall',-8,0,12,3.4,0.18,'#d0d7da',true,Math.PI/2)
  box('wall',8,0,12,3.4,0.18,'#d0d7da',true,Math.PI/2)
  box('wall',-5.2,6,5.6,3.4,0.18,'#d0d7da')
  box('wall',5.2,6,5.6,3.4,0.18,'#d0d7da')
  // Modular washing line runs across the room. Colors distinguish clean/dirty stations.
  // Existing asset catalog provides reusable geometry in all rendering modes.
  if (!machine('assembly-conveyor',-3.8,0)) box('platform',-3.8,0,3,0.9,1,'#9aaab2')
  if (!machine('assembly-conveyor',3.8,0)) box('platform',3.8,0,3,0.9,1,'#9aaab2')
  // Dishwasher is an independent module (placeholder geometry).
  box('platform',0,0,3.1,1.8,1.6,'#8798a5')
  // Four generic robotic workcells; these are NOT animated articulated arms yet.
  for (const [x,z] of [[-5,-2.4],[-2.2,-2.4],[2.2,2.4],[5,2.4]] as const) {
    if (!machine('robot-cell',x,z)) box('platform',x,z,1.1,1.4,1.1,'#e7a75c')
  }
  // Racks and service stations. Keep a central access lane and clear entrance.
  for (const [x,z] of [[-6.5,-4.2],[-4,-4.2],[4,4.2],[6.5,4.2]] as const) {
    if (!machine('storage-rack',x,z)) box('platform',x,z,1,1.5,0.6,'#a9bac4')
  }
  if (!machine('workbench',-6,2.2)) box('platform',-6,2.2,1.4,0.9,0.7,'#c0cbd1')
  if (!machine('workbench',6,-2.2)) box('platform',6,-2.2,1.4,0.9,0.7,'#c0cbd1')
  return { objects, robotEnabled: false, robotStart: [0,4.7], goal: null }
}
