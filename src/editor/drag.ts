import type { ThreeEvent } from '@react-three/fiber'
import { useWorld } from '../world/store'
import type { Vec2 } from '../world/types'
import { groundPoint } from '../scene/worldRoot'

/**
 * One active drag at a time, keyed by pointer id. Drags start on an object's pointerdown;
 * moves and releases are routed from <WorldRoot> so they keep working when the pointer
 * slides off the object. Mouse, controller rays and hand rays all go through here.
 */
interface Drag {
  pointerId: number
  move: (p: Vec2) => void
  end?: () => void
}

let active: Drag | null = null

type PEvent = ThreeEvent<PointerEvent>

export function beginDrag(e: PEvent, drag: Omit<Drag, 'pointerId'>) {
  e.stopPropagation()
  active = { ...drag, pointerId: e.pointerId }
  try {
    ;(e.target as unknown as { setPointerCapture?: (id: number) => void })?.setPointerCapture?.(e.pointerId)
  } catch {
    // Capture is a nicety; routing through the root still works without it.
  }
  useWorld.getState().setDragging(true)
}

export function dragMove(e: PEvent) {
  if (!active || e.pointerId !== active.pointerId) return
  const p = groundPoint(e)
  if (p) active.move(p)
}

export function endDrag(pointerId?: number) {
  if (!active || (pointerId !== undefined && pointerId !== active.pointerId)) return
  active.end?.()
  active = null
  useWorld.getState().setDragging(false)
}

export const isDragging = () => active !== null
