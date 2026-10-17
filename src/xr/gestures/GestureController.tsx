import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { useWorld } from '../../world/store'
import type { WorldObject } from '../../world/types'
import { snapAngle } from '../../world/snap'
import { useEditor } from '../../editor/settings'
import { groupIds, useSelection } from '../../editor/selection'
import { wristMenuState } from '../../editor/WristMenu'
import { WORLD_ROOT, worldRootRef } from '../../scene/worldRoot'
import { REQUIRED_JOINTS, dist, handFeatures, rollAngle, type HandFeatures, type Handedness, type Joints, type V3 } from './handPose'
import { GestureRecognizer, type GestureEvent } from './recognizer'
import { applyPull, insideViewFrame, nearestEquivalent, pullStep, rotateAbout, rotateGroup, yawAligning } from './actions'
import { ControllerRecognizer, type ControllerEvent, type ControllerSample } from './controllerInput'
import { placeAssetAt, setGroundHover } from '../../editor/Ground'
import { worldActions } from '../../world/actions'
import { HAPTIC, pulse } from '../haptics'

/**
 * Minority Report–style hand gestures (see docs/gestures.md). Reads both hands' joints from the XRFrame
 * every frame, recognises poses, and acts:
 * - L (hold)          → turn the world so its main axis points where your index points
 * - two fists (pull)  → drag the whole world through the room at true scale
 * - frame (two L's)   → select everything inside the frame as a group
 * - pinch (at a distance) + wrist roll → rotate the pinched object (or the group)
 * Near grabbing (touching an object) stays with @react-three/handle; wrist-menu pokes stay with the menu.
 * Controllers get the same actions through ControllerRecognizer (grips = pull, triggers = frame / select,
 * hold A = axis, sticks = move and turn).
 */

/** Wrist roll → object yaw. Rolling clockwise (looking down your forearm) turns the object clockwise from above. */
const ROLL_GAIN = 1
/** Objects closer than this to the pinch (m) are near-grabbed by hand, not pinch-rotated from afar. */
const NEAR_GRAB = 0.12

const v = new THREE.Vector3()
/** Where you're looking this frame (for head-relative stick movement). */
const headForward = new THREE.Vector3(0, 0, -1)
const toV3 = (p: THREE.Vector3): V3 => [p.x, p.y, p.z]

/** Shared with the feedback visuals (read in their render loop; never React state). */
const ui = {
  lArrow: null as null | { from: V3; dir: V3; progress: number },
  frame: null as null | { a: V3; b: V3; progress: number },
  fists: null as null | { left: V3; right: V3 },
  axisFlashUntil: 0,
  axisFlash: { at: [0, 0, 0] as V3, yaw: 0 },
}

interface PinchRotate {
  hand: Handedness
  /** Extra yaw from controller stick flicks while holding the selection. */
  extraYaw: number
  n0: V3
  ids: string[]
  start: Pick<WorldObject, 'position' | 'rotationY'>[]
  lastYaw: number
}

export function GestureController() {
  const gl = useThree((s) => s.gl)
  const recognizer = useMemo(() => new GestureRecognizer(), [])
  const controllers = useMemo(() => new ControllerRecognizer(), [])
  const lastT = useRef(0)
  const pinch = useRef<PinchRotate | null>(null)
  const pull = useRef<{ left: V3; right: V3 } | null>(null)
  const ownDrag = useRef(false)
  const raycaster = useMemo(() => new THREE.Raycaster(), [])

  useFrame((state, _dt, frame?: XRFrame) => {
    ui.lArrow = null
    ui.frame = null
    ui.fists = null
    const refSpace = gl.xr.getReferenceSpace()
    if (!frame || !refSpace || !useEditor.getState().gestures) return

    // --- Read both hands.
    const hands: Record<Handedness, HandFeatures | null> = { left: null, right: null }
    const pads: Record<Handedness, ControllerSample | null> = { left: null, right: null }
    for (const source of frame.session.inputSources) {
      if (source.handedness !== 'left' && source.handedness !== 'right') continue
      if (!source.hand) {
        pads[source.handedness] = controllerSample(frame, refSpace, source)
        continue
      }
      const joints: Joints = {}
      for (const name of [...REQUIRED_JOINTS, 'thumb-metacarpal']) {
        const space = source.hand.get(name as XRHandJoint)
        const pose = space && frame.getJointPose?.(space, refSpace)
        if (pose) joints[name] = [pose.transform.position.x, pose.transform.position.y, pose.transform.position.z]
      }
      hands[source.handedness] = handFeatures(joints, source.handedness)
    }
    const xrCam = gl.xr.getCamera()
    const head = toV3(xrCam.getWorldPosition(v))
    headForward.set(0, 0, -1).applyQuaternion(xrCam.getWorldQuaternion(new THREE.Quaternion()))

    // A hand is busy when something else owns it: a near grab is running, or it's using the wrist menu.
    const world = useWorld.getState()
    const grabbing = world.dragging && !ownDrag.current
    const nearMenu = (f: HandFeatures | null) =>
      !!f && wristMenuState.visible && (f.handedness === 'left' || dist(f.pinchPoint, toV3(wristMenuState.position)) < 0.2)
    const blocked = { left: grabbing || nearMenu(hands.left), right: grabbing || nearMenu(hands.right) }

    // Asset tool: the ghost follows where you aim on the floor (right controller ray, else your eyes
    // through a pinch point), so you can place without rays, even at 1:1.
    const placingAssets = world.tool === 'asset' && !useEditor.getState().rays
    if (placingAssets) {
      const aim = aimRay(head, pads.right ?? pads.left, hands.right ?? hands.left)
      setGroundHover(aim ? floorPoint(aim) : null)
    }
    const t = state.clock.elapsedTime
    const dt = Math.min(0.1, Math.max(0, t - lastT.current))
    lastT.current = t
    const events = recognizer.update(t, hands.left, hands.right, blocked)
    for (const e of events) handle(e, head)

    // Controllers: same actions. A controller is busy when a near grab runs or it's at the wrist menu.
    const padNearMenu = (c: ControllerSample | null) =>
      !!c && wristMenuState.visible && (c.handedness === 'left' || dist(c.grip, toV3(wristMenuState.position)) < 0.2)
    const padBlocked = { left: grabbing || padNearMenu(pads.left), right: grabbing || padNearMenu(pads.right) }
    if (pads.left || pads.right) {
      const padEvents = controllers.update(t, dt, pads.left, pads.right, padBlocked, useEditor.getState().rays)
      for (const e of padEvents) {
        // Trigger-select aims along the controller's own ray, not from your eyes.
        const c = 'hand' in e && e.hand ? pads[e.hand] : null
        handle(e, head, c ? { origin: c.rayOrigin, dir: c.rayDir } : undefined)
      }
      events.push(...(padEvents.filter((e) => e.type === 'frame-progress') as GestureEvent[]))
    }
    // A frame let go of before it completed leaves no preview behind.
    if (!events.some((e) => e.type === 'frame-progress') && useSelection.getState().preview.length) useSelection.getState().setPreview([])
  })

  function setOwnDrag(on: boolean) {
    ownDrag.current = on
    useWorld.getState().setDragging(on) // one undo step per gesture (history coalesces while dragging)
  }

  function handle(e: ControllerEvent, head: V3, ray?: { origin: V3; dir: V3 }) {
    const root = worldRootRef.current
    if (!root) return
    switch (e.type) {
      case 'move':
        moveYou(root, head, e.x, e.z)
        return
      case 'turn':
        if (useWorld.getState().tool === 'asset') {
          worldActions.rotateCatalogAsset(e.yaw > 0 ? 1 : -1)
          pulse('right', HAPTIC.tick)
          return
        }
        turnAboutHead(root, head, e.yaw)
        return
      case 'rotate-step':
        if (pinch.current) {
          pinch.current.extraYaw += e.yaw
          pinch.current.lastYaw = NaN // force the next update to apply
        }
        return
      case 'l-progress':
        ui.lArrow = { from: e.f.pinchPoint, dir: e.f.indexDir, progress: e.progress }
        return
      case 'l-hold':
        alignAxis(root, e.f.indexDir, head)
        pulse('active', HAPTIC.commit)
        return
      case 'pull-start':
        pull.current = { left: e.left.wrist, right: e.right.wrist }
        ui.fists = { left: e.left.wrist, right: e.right.wrist }
        pulse('both', HAPTIC.grab)
        return
      case 'pull-move': {
        const prev = pull.current
        if (!prev) return
        // A near grab (e.g. two-hand scaling an object) owns the fists: stop pulling the world.
        if (useWorld.getState().dragging && !ownDrag.current) {
          pull.current = null
          return
        }
        pullWorld(root, prev.left, prev.right, e.left.wrist, e.right.wrist)
        pull.current = { left: e.left.wrist, right: e.right.wrist }
        ui.fists = { left: e.left.wrist, right: e.right.wrist }
        return
      }
      case 'pull-end':
        pull.current = null
        return
      case 'frame-progress':
        ui.frame = { a: e.a, b: e.b, progress: e.progress }
        useSelection.getState().setPreview(objectsInFrame(root, head, e.a, e.b))
        return
      case 'frame': {
        const ids = objectsInFrame(root, head, e.a, e.b)
        useSelection.getState().setGroup(ids)
        useWorld.getState().select(null)
        pulse('active', HAPTIC.commit)
        return
      }
      case 'pinch-start':
        if (useEditor.getState().rays) return // rays already pinch-drag
        if (useWorld.getState().tool === 'asset') {
          const aim = ray ?? { origin: head, dir: toV3(new THREE.Vector3(...e.f.pinchPoint).sub(new THREE.Vector3(...head)).normalize()) }
          const at = floorPoint(aim)
          if (at) placeAssetAt(at)
          return
        }
        startPinchRotate(root, e.hand, e.f, ray ?? { origin: head, dir: toV3(new THREE.Vector3(...e.f.pinchPoint).sub(new THREE.Vector3(...head)).normalize()) })
        return
      case 'pinch-move':
        if (pinch.current?.hand === e.hand) movePinchRotate(e.f)
        return
      case 'pinch-end':
      case 'cancel':
        if (pinch.current && (e.type === 'cancel' || pinch.current.hand === e.hand)) {
          pinch.current = null
          setOwnDrag(false)
        }
        useSelection.getState().setPreview([])
        return
    }
  }

  // --- Pinch + wrist roll → rotate.
  function startPinchRotate(root: THREE.Group, hand: Handedness, f: HandFeatures, ray: { origin: V3; dir: V3 }) {
    raycaster.set(new THREE.Vector3(...ray.origin), new THREE.Vector3(...ray.dir).normalize())
    raycaster.far = 200
    let id: string | null = null
    const pinchAt = new THREE.Vector3(...f.pinchPoint)
    for (const hit of raycaster.intersectObjects(root.children, true)) {
      // Within reach of the pinch, it's a near grab (@react-three/handle): leave it to that.
      if (hit.point.distanceTo(pinchAt) < NEAR_GRAB) return
      for (let o: THREE.Object3D | null = hit.object; o; o = o.parent) {
        if (typeof o.userData.objectId === 'string') {
          id = o.userData.objectId
          break
        }
      }
      if (id) break
    }
    if (!id) return
    const group = groupIds()
    const ids = group.includes(id) ? group : [id]
    if (ids.length === 1) {
      useSelection.getState().clear()
      useWorld.getState().select(id)
    }
    const objects = useWorld.getState().objects
    pinch.current = {
      hand,
      extraYaw: 0,
      n0: f.palmNormal,
      ids,
      start: ids.map((i) => ({ position: [...objects[i].position] as WorldObject['position'], rotationY: objects[i].rotationY })),
      lastYaw: 0,
    }
    setOwnDrag(true)
  }

  function movePinchRotate(f: HandFeatures) {
    const p = pinch.current
    if (!p) return
    let yaw = -rollAngle(p.n0, f.palmNormal, f.forward) * ROLL_GAIN + p.extraYaw
    if (useEditor.getState().snap) yaw = snapAngle(yaw)
    if (Math.abs(yaw - p.lastYaw) < 1e-4) return
    p.lastYaw = yaw
    const w = useWorld.getState()
    const next = p.ids.length === 1 ? [{ position: p.start[0].position, rotationY: p.start[0].rotationY + yaw }] : rotateGroup(p.start, yaw)
    p.ids.forEach((id, i) => w.objects[id] && w.updateObject(id, next[i]))
  }

  return <GestureFeedback />
}

// --- World transforms (in the root's parent space: WorldPlacement may have pinned it to a plane).

const toParent = (root: THREE.Object3D, p: V3): V3 => {
  const local = root.parent ? root.parent.worldToLocal(new THREE.Vector3(...p)) : new THREE.Vector3(...p)
  return toV3(local)
}

function setRootPose(root: THREE.Group, x: number, z: number, yaw: number) {
  root.position.x = x
  root.position.z = z
  root.rotation.set(0, yaw, 0)
  WORLD_ROOT.position.copy(root.position)
  WORLD_ROOT.yaw = yaw
}

/** L gesture: turn the world about your head so its +X axis (aisles, grid) follows your index finger. */
function alignAxis(root: THREE.Group, indexDir: V3, head: V3) {
  const parentYaw = root.parent ? new THREE.Euler().setFromQuaternion(root.parent.getWorldQuaternion(new THREE.Quaternion()), 'YXZ').y : 0
  let target = yawAligning(indexDir) - parentYaw
  // With snapping on, pick the quarter turn closest to where the world is, so aligning never spins it around.
  if (useEditor.getState().snap) target = nearestEquivalent(target, root.rotation.y)
  const delta = target - root.rotation.y
  const pivot = toParent(root, head)
  const [x, z] = rotateAbout([root.position.x, root.position.z], [pivot[0], pivot[2]], delta)
  setRootPose(root, x, z, target)
  ui.axisFlashUntil = performance.now() + 900
  ui.axisFlash = { at: head, yaw: target + parentYaw }
}

/** Controller stick: move *you* (x right, z forward relative to where you look) by moving the world the other way. */
function moveYou(root: THREE.Group, head: V3, x: number, z: number) {
  const fwd = headForward.clone().setY(0)
  if (fwd.lengthSq() < 1e-6) return
  fwd.normalize()
  const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0))
  const step = new THREE.Vector3().addScaledVector(fwd, z).addScaledVector(right, x)
  // Move the world by −step, expressed in the root's parent space.
  const a = toParent(root, head)
  const b = toParent(root, toV3(new THREE.Vector3(...head).sub(step)))
  setRootPose(root, root.position.x + (b[0] - a[0]), root.position.z + (b[2] - a[2]), root.rotation.y)
}

/** Controller snap turn: the world turns about you (so you face a new way in it). */
function turnAboutHead(root: THREE.Group, head: V3, yaw: number) {
  const pivot = toParent(root, head)
  const [x, z] = rotateAbout([root.position.x, root.position.z], [pivot[0], pivot[2]], yaw)
  setRootPose(root, x, z, root.rotation.y + yaw)
}

/** Two-fist pull: the world follows your fists 1:1 on the floor and turns with them. */
function pullWorld(root: THREE.Group, l0: V3, r0: V3, l1: V3, r1: V3) {
  const step = pullStep(toParent(root, l0), toParent(root, r0), toParent(root, l1), toParent(root, r1))
  const next = applyPull([root.position.x, root.position.z], root.rotation.y, step)
  setRootPose(root, next.pos[0], next.pos[1], next.yaw)
}

/** Ids of objects whose mid-height centre is inside the hands' frame as seen from your head. */
function objectsInFrame(root: THREE.Group, head: V3, a: V3, b: V3): string[] {
  root.updateWorldMatrix(true, false)
  const out: string[] = []
  for (const o of Object.values(useWorld.getState().objects)) {
    const c = root.localToWorld(new THREE.Vector3(o.position[0], o.size[1] / 2, o.position[2]))
    if (insideViewFrame(toV3(c), head, a, b)) out.push(o.id)
  }
  return out
}

// --- Feedback visuals (real-metre sizes, in room space).

const ARROW = new THREE.MeshBasicMaterial({ color: '#f4a261', transparent: true, opacity: 0.9, depthTest: false })
const FRAME = new THREE.LineBasicMaterial({ color: '#7bdff2', depthTest: false })
const RING = new THREE.MeshBasicMaterial({ color: '#06d6a0', transparent: true, opacity: 0.8, depthTest: false })
const AXIS = new THREE.MeshBasicMaterial({ color: '#f4a261', transparent: true, opacity: 0.6, depthTest: false })

function GestureFeedback() {
  const arrow = useRef<THREE.Mesh>(null)
  const frame = useRef<THREE.LineLoop>(null)
  const ringL = useRef<THREE.Mesh>(null)
  const ringR = useRef<THREE.Mesh>(null)
  const axis = useRef<THREE.Mesh>(null)
  const framePoints = useMemo(() => new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3)), [])
  const camera = useThree((s) => s.gl.xr)

  useFrame(() => {
    const a = arrow.current
    if (a) {
      a.visible = !!ui.lArrow
      if (ui.lArrow) {
        // A bar growing along the index finger while the L dwells.
        const length = 0.05 + 0.25 * ui.lArrow.progress
        const dir = new THREE.Vector3(...ui.lArrow.dir)
        a.position.set(...ui.lArrow.from).addScaledVector(dir, length / 2)
        a.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
        a.scale.set(1, length, 1)
      }
    }
    const f = frame.current
    if (f) {
      f.visible = !!ui.frame
      if (ui.frame) {
        // The view-aligned rectangle spanned by the two hand corners.
        const head = camera.getCamera().getWorldPosition(new THREE.Vector3())
        const A = new THREE.Vector3(...ui.frame.a)
        const B = new THREE.Vector3(...ui.frame.b)
        const fwd = A.clone().add(B).multiplyScalar(0.5).sub(head).normalize()
        const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize()
        const d = B.clone().sub(A)
        const C = A.clone().addScaledVector(right, d.dot(right))
        const D = B.clone().addScaledVector(right, -d.dot(right))
        const pos = framePoints.getAttribute('position') as THREE.BufferAttribute
        ;[A, C, B, D].forEach((p, i) => pos.setXYZ(i, p.x, p.y, p.z))
        pos.needsUpdate = true
        FRAME.opacity = 0.4 + 0.6 * ui.frame.progress
      }
    }
    for (const [ring, at] of [
      [ringL.current, ui.fists?.left],
      [ringR.current, ui.fists?.right],
    ] as const) {
      if (!ring) continue
      ring.visible = !!at
      if (at) ring.position.set(...at)
    }
    const x = axis.current
    if (x) {
      x.visible = performance.now() < ui.axisFlashUntil
      if (x.visible) {
        x.position.set(ui.axisFlash.at[0], 0.02, ui.axisFlash.at[2])
        x.rotation.set(0, ui.axisFlash.yaw, 0)
      }
    }
  })

  return (
    <>
      <mesh ref={arrow} material={ARROW} visible={false} raycast={() => null} renderOrder={5}>
        <cylinderGeometry args={[0.004, 0.004, 1, 6]} />
      </mesh>
      <lineLoop ref={frame} geometry={framePoints} material={FRAME} visible={false} raycast={() => null} renderOrder={5} />
      {[ringL, ringR].map((r, i) => (
        <mesh key={i} ref={r} material={RING} visible={false} raycast={() => null} rotation={[Math.PI / 2, 0, 0]} renderOrder={5}>
          <torusGeometry args={[0.06, 0.006, 6, 24]} />
        </mesh>
      ))}
      {/* The new primary axis, flashed along the floor through where you stand. */}
      <mesh ref={axis} material={AXIS} visible={false} raycast={() => null} renderOrder={5}>
        <boxGeometry args={[6, 0.01, 0.03]} />
      </mesh>
    </>
  )
}

// --- Controller pose -> ControllerSample (xr-standard gamepad: 0 trigger, 1 squeeze, 4 A/X; axes 2/3 thumbstick).

function controllerSample(frame: XRFrame, refSpace: XRReferenceSpace, source: XRInputSource): ControllerSample | null {
  const ray = frame.getPose(source.targetRaySpace, refSpace)
  if (!ray) return null
  const grip = (source.gripSpace && frame.getPose(source.gripSpace, refSpace)) || ray
  const o = grip.transform.orientation
  const q = new THREE.Quaternion(o.x, o.y, o.z, o.w)
  const ro = ray.transform.orientation
  const rq = new THREE.Quaternion(ro.x, ro.y, ro.z, ro.w)
  const pad = source.gamepad
  const button = (i: number) => pad?.buttons[i]?.value ?? 0
  const axes = pad?.axes ?? []
  const stick: [number, number] = axes.length >= 4 ? [axes[2], axes[3]] : [axes[0] ?? 0, axes[1] ?? 0]
  const p = grip.transform.position
  const r = ray.transform.position
  return {
    handedness: source.handedness as Handedness,
    grip: [p.x, p.y, p.z],
    up: toV3(new THREE.Vector3(0, 1, 0).applyQuaternion(q)),
    forward: toV3(new THREE.Vector3(0, 0, -1).applyQuaternion(q)),
    rayOrigin: [r.x, r.y, r.z],
    rayDir: toV3(new THREE.Vector3(0, 0, -1).applyQuaternion(rq)),
    trigger: button(0),
    squeeze: button(1),
    primary: !!pad?.buttons[4]?.pressed,
    stick,
  }
}

// --- Aiming at the floor without rays (asset placement).

/** The aim for placing: the controller's ray, else from your eyes through your pinch point. */
function aimRay(head: V3, pad: ControllerSample | null, hand: HandFeatures | null): { origin: V3; dir: V3 } | null {
  if (pad) return { origin: pad.rayOrigin, dir: pad.rayDir }
  if (hand) return { origin: head, dir: toV3(new THREE.Vector3(...hand.pinchPoint).sub(new THREE.Vector3(...head)).normalize()) }
  return null
}

/** Where a ray meets the world's ground (map-local metres), or null if it points away from it. */
function floorPoint(ray: { origin: V3; dir: V3 }): [number, number] | null {
  const root = worldRootRef.current
  if (!root) return null
  root.updateWorldMatrix(true, false)
  const normal = new THREE.Vector3(0, 1, 0).transformDirection(root.matrixWorld)
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, new THREE.Vector3().setFromMatrixPosition(root.matrixWorld))
  const hit = new THREE.Ray(new THREE.Vector3(...ray.origin), new THREE.Vector3(...ray.dir).normalize()).intersectPlane(plane, new THREE.Vector3())
  if (!hit) return null
  const local = root.worldToLocal(hit)
  return [local.x, local.z]
}
