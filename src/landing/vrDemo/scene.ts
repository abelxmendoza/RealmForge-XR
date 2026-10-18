import * as THREE from 'three'
import {
  BARRIER_LENGTH,
  ENTRANCE,
  EXIT,
  MENU_ITEMS,
  PLACEMENTS,
  REPLAN_AT,
  ROLE_TAGS,
  ROUTE_PLANNED,
  ROUTE_REPLANNED,
  SAVED_AT,
  attendeeAt,
  barrierAt,
  gazeAt,
  ghostAt,
  headAt,
  laserAt,
  menuFocus,
  menuRaise,
  smooth,
  wristAt,
  type V2,
} from './timeline'

const EMBER = '#e07845'
const IPD = 0.064

/** Text on a canvas, for wrist-menu rows and floating role tags. */
function labelTexture(text: string, { w = 512, h = 128, bg = 'rgba(20,16,12,0.86)', fg = '#f3ebe0', border = EMBER } = {}) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  g.fillStyle = bg
  g.beginPath()
  g.roundRect(4, 4, w - 8, h - 8, 22)
  g.fill()
  g.lineWidth = 6
  g.strokeStyle = border
  g.stroke()
  g.fillStyle = fg
  g.font = `600 ${Math.round(h * 0.42)}px Sora, 'Segoe UI', sans-serif`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(text, w / 2, h / 2 + 2)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

function tagSprite(text: string) {
  const tex = labelTexture(text, { w: 512, h: 112 })
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }))
  s.scale.set(1.5, 0.33, 1)
  s.renderOrder = 10
  return s
}

const flat = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05, ...extra })

function makeProp(kind: 'desk' | 'booth', size: V2, color: string) {
  const g = new THREE.Group()
  if (kind === 'desk') {
    const top = new THREE.Mesh(new THREE.BoxGeometry(size[0], 0.95, size[1]), flat(color))
    top.position.y = 0.475
    const front = new THREE.Mesh(new THREE.BoxGeometry(size[0] * 0.98, 0.32, 0.02), flat(EMBER, { emissive: EMBER, emissiveIntensity: 0.35 }))
    front.position.set(0, 0.62, size[1] / 2 + 0.011)
    g.add(top, front)
  } else {
    const back = new THREE.Mesh(new THREE.BoxGeometry(size[0], 2.3, 0.08), flat('#e9e3d8'))
    back.position.set(0, 1.15, -size[1] / 2)
    const banner = new THREE.Mesh(new THREE.BoxGeometry(size[0], 0.42, 0.1), flat(color, { emissive: color, emissiveIntensity: 0.3 }))
    banner.position.set(0, 2.1, -size[1] / 2 + 0.03)
    const counter = new THREE.Mesh(new THREE.BoxGeometry(size[0] * 0.8, 1, 0.5), flat(color))
    counter.position.set(0, 0.5, size[1] / 2 - 0.3)
    const sideL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.4, size[1]), flat('#d8d1c4'))
    sideL.position.set(-size[0] / 2, 0.7, 0)
    const sideR = sideL.clone()
    sideR.position.x = size[0] / 2
    g.add(back, banner, counter, sideL, sideR)
  }
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = o.receiveShadow = true
  })
  return g
}

function makeBarrier() {
  const g = new THREE.Group()
  const post = new THREE.CylinderGeometry(0.04, 0.05, 1, 12)
  const metal = flat('#b8bec4', { metalness: 0.7, roughness: 0.3 })
  for (const x of [-BARRIER_LENGTH / 2, 0, BARRIER_LENGTH / 2]) {
    const p = new THREE.Mesh(post, metal)
    p.position.set(x, 0.5, 0)
    p.castShadow = true
    g.add(p)
  }
  const belt = new THREE.Mesh(new THREE.BoxGeometry(BARRIER_LENGTH, 0.1, 0.02), flat('#b33a2a', { emissive: '#b33a2a', emissiveIntensity: 0.25 }))
  belt.position.y = 0.88
  g.add(belt)
  return g
}

/** Stylized Quest-style controller: grip, face and tracking ring. */
function makeController(color: string) {
  const g = new THREE.Group()
  const grip = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.08, 6, 12), flat('#2a2d33', { roughness: 0.5 }))
  grip.rotation.x = Math.PI / 2.6
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.008, 8, 28), flat('#3a3e46', { roughness: 0.4 }))
  ring.position.set(0, 0.04, -0.03)
  ring.rotation.x = Math.PI / 2.2
  const glow = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.002, 6, 28), new THREE.MeshBasicMaterial({ color }))
  glow.position.copy(ring.position)
  glow.rotation.copy(ring.rotation)
  glow.position.y += 0.009
  g.add(grip, ring, glow)
  return g
}

function routeLine(pts: V2[], color: string, dashed = true) {
  const geo = new THREE.BufferGeometry().setFromPoints(pts.map(([x, z]) => new THREE.Vector3(x, 0.04, z)))
  const mat = dashed
    ? new THREE.LineDashedMaterial({ color, dashSize: 0.35, gapSize: 0.2, transparent: true })
    : new THREE.LineBasicMaterial({ color, transparent: true })
  const line = new THREE.Line(geo, mat)
  line.computeLineDistances()
  return line
}

function pad(color: string) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(0.75, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55 }))
  m.rotation.x = -Math.PI / 2
  m.position.y = 0.02
  return m
}

export type DemoScene = {
  /** Draw the replay at time `t`. */
  render: (t: number) => void
  setStereo: (on: boolean) => void
  resize: () => void
  dispose: () => void
}

export function createDemoScene(canvas: HTMLCanvasElement, { motion = true } = {}): DemoScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping

  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#161b22')
  scene.fog = new THREE.Fog('#161b22', 14, 32)
  const camera = new THREE.PerspectiveCamera(78, 1, 0.03, 80)
  const eye = new THREE.PerspectiveCamera(90, 1, 0.03, 80)
  let stereo = false

  // Hall: floor, grid, low perimeter walls and ceiling light bars.
  scene.add(new THREE.HemisphereLight('#d6e0f0', '#3a2c20', 1.6))
  const sun = new THREE.DirectionalLight('#ffe2c4', 1.6)
  sun.position.set(-6, 12, 6)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10 })
  scene.add(sun)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(18, 14), flat('#3b444b', { roughness: 0.95 }))
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  scene.add(floor)
  const grid = new THREE.GridHelper(18, 36, '#6a7680', '#4a545d')
  grid.position.y = 0.005
  scene.add(grid)
  const wallMat = flat('#2b3239', { roughness: 1 })
  for (const [x, z, w, r] of [
    [0, -7, 18, 0],
    [0, 7, 18, 0],
    [-9, 0, 14, Math.PI / 2],
    [9, 0, 14, Math.PI / 2],
  ]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 3.2, 0.1), wallMat)
    wall.position.set(x, 1.6, z)
    wall.rotation.y = r
    scene.add(wall)
  }
  for (let z = -5; z <= 5; z += 5) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(12, 0.05, 0.2), new THREE.MeshBasicMaterial({ color: '#fff3e0' }))
    bar.position.set(0, 3.2, z)
    scene.add(bar)
  }

  const entrance = pad('#5fa37a')
  entrance.position.set(ENTRANCE[0], 0.02, ENTRANCE[1])
  const exit = pad('#c4553a')
  exit.position.set(EXIT[0], 0.02, EXIT[1])
  scene.add(entrance, exit)

  // Props, each with a translucent ghost used while it is under the laser.
  const props = PLACEMENTS.map((p) => {
    const real = makeProp(p.kind, p.size, p.color)
    real.position.set(p.at[0], 0, p.at[1])
    const ghost = makeProp(p.kind, p.size, p.color)
    ghost.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.material = new THREE.MeshBasicMaterial({ color: '#f0a46a', transparent: true, opacity: 0.28, depthWrite: false })
        o.castShadow = false
      }
    })
    const footprint = new THREE.Mesh(
      new THREE.PlaneGeometry(p.size[0] + 0.2, p.size[1] + 0.2),
      new THREE.MeshBasicMaterial({ color: EMBER, transparent: true, opacity: 0.35, depthWrite: false }),
    )
    footprint.rotation.x = -Math.PI / 2
    footprint.position.y = 0.015
    ghost.add(footprint)
    scene.add(real, ghost)
    return { p, real, ghost }
  })

  const tags = ROLE_TAGS.map((r) => {
    const s = tagSprite(r.text)
    s.position.set(r.at[0], r.height, r.at[1])
    scene.add(s)
    return { r, s }
  })

  const barrier = makeBarrier()
  scene.add(barrier)

  const planned = routeLine(ROUTE_PLANNED, '#f0a46a')
  const replanned = routeLine(ROUTE_REPLANNED, '#7fd1a6')
  const blocked = routeLine([ROUTE_PLANNED[3], ROUTE_PLANNED[4]], '#ff4a3a', false)
  scene.add(planned, replanned, blocked)

  // Attendee: capsule body, head and a direction "nose".
  const attendee = new THREE.Group()
  const bodyMat = flat(EMBER, { emissive: EMBER, emissiveIntensity: 0.25, transparent: true })
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.85, 6, 16), bodyMat)
  body.position.y = 0.65
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 20, 14), bodyMat)
  head.position.y = 1.42
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 10), flat('#f3ebe0', { transparent: true }))
  nose.rotation.x = Math.PI / 2
  nose.position.set(0, 1.42, 0.2)
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.4, 32), new THREE.MeshBasicMaterial({ color: '#f0a46a', transparent: true, opacity: 0.7 }))
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.02
  attendee.add(body, head, nose, ring)
  attendee.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true
  })
  scene.add(attendee)

  // Hands: left controller carries the wrist menu; right controller casts the laser.
  const left = makeController('#7fd1a6')
  const right = makeController(EMBER)
  scene.add(left, right)

  const menu = new THREE.Group()
  const menuBg = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.27), new THREE.MeshBasicMaterial({ color: '#14100c', transparent: true, opacity: 0.88 }))
  menuBg.position.y = 0.04
  menu.add(menuBg)
  const header = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.035), new THREE.MeshBasicMaterial({ map: labelTexture('REALMFORGE', { w: 512, h: 100, bg: '#e07845', fg: '#1a100c', border: '#e07845' }), transparent: true }))
  header.position.set(0, 0.16, 0.001)
  menu.add(header)
  const rowTex = MENU_ITEMS.map((label) => ({
    idle: labelTexture(label, { border: '#4a4036' }),
    hover: labelTexture(label, { bg: 'rgba(224,120,69,0.35)' }),
    press: labelTexture(label, { bg: '#e07845', fg: '#1a100c' }),
  }))
  const rows = MENU_ITEMS.map((_, i) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.04), new THREE.MeshBasicMaterial({ map: rowTex[i].idle, transparent: true }))
    m.position.set(0, 0.11 - i * 0.045, 0.002)
    menu.add(m)
    return m
  })
  scene.add(menu)

  const laserGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()])
  const laser = new THREE.Line(laserGeo, new THREE.LineBasicMaterial({ color: '#ffb184', transparent: true, opacity: 0.85 }))
  laser.frustumCulled = false
  const reticle = new THREE.Mesh(new THREE.SphereGeometry(0.03, 14, 10), new THREE.MeshBasicMaterial({ color: '#fff1e2' }))
  const pulse = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.08, 28), new THREE.MeshBasicMaterial({ color: '#ffb184', transparent: true, side: THREE.DoubleSide, depthTest: false }))
  scene.add(laser, reticle, pulse)

  const saveFlash = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.13, 40), new THREE.MeshBasicMaterial({ color: '#7fd1a6', transparent: true, depthTest: false }))
  scene.add(saveFlash)

  const tmp = new THREE.Vector3()
  const headPos = new THREE.Vector3()
  const look = new THREE.Vector3()

  function render(t: number) {
    // Head pose with a little natural sway.
    const h = headAt(t)
    const sway = motion ? 1 : 0
    headPos.set(h[0] + Math.sin(t * 0.9) * 0.012 * sway, h[1] + Math.sin(t * 1.7) * 0.006 * sway, h[2])
    const g = gazeAt(t)
    look.set(g[0] + Math.sin(t * 0.6) * 0.05 * sway, g[1] + Math.sin(t * 0.8) * 0.03 * sway, g[2])
    camera.position.copy(headPos)
    camera.lookAt(look)

    // Placed props drop in; ghosts track the laser.
    const ghost = ghostAt(t)
    for (const { p, real, ghost: gh } of props) {
      const k = smooth((t - p.placedAt) / 0.35)
      real.visible = t > p.placedAt
      real.position.y = (1 - k) * 0.45
      real.scale.setScalar(0.9 + 0.1 * k)
      gh.visible = ghost?.placement.id === p.id
      if (gh.visible) gh.position.set(ghost!.at[0], 0, ghost!.at[2])
    }
    for (const { r, s } of tags) {
      const k = smooth((t - r.time) / 0.3)
      s.visible = k > 0
      s.scale.set(1.5 * k, 0.33 * k, 1)
    }

    const b = barrierAt(t)
    barrier.position.set(b.at[0], b.lift, b.at[1])
    barrier.rotation.y = -b.rot

    // Route lines: planned → blocked flash → replanned detour.
    const routeOn = t > 25.2 && t < 43.2
    const routeFade = Math.min(smooth((t - 25.2) / 0.6), 1 - smooth((t - 42.6) / 0.6))
    planned.visible = routeOn && t < REPLAN_AT
    replanned.visible = routeOn && t >= REPLAN_AT
    ;(planned.material as THREE.LineDashedMaterial).opacity = routeFade
    ;(replanned.material as THREE.LineDashedMaterial).opacity = routeFade * smooth((t - REPLAN_AT) / 0.5)
    blocked.visible = t > REPLAN_AT - 0.4 && t < REPLAN_AT + 1.4
    ;(blocked.material as THREE.LineBasicMaterial).opacity = 0.5 + 0.5 * Math.sin(t * 18)
    const dashShift = -t * 0.8
    ;(planned.material as THREE.LineDashedMaterial).dashOffset = dashShift
    ;(replanned.material as THREE.LineDashedMaterial).dashOffset = dashShift

    const a = attendeeAt(t)
    attendee.visible = !!a
    if (a) {
      const bob = a.moving ? Math.abs(Math.sin(t * 9)) * 0.05 : 0
      attendee.position.set(a.at[0], bob, a.at[1])
      if (a.heading !== null) attendee.rotation.y = a.heading
      bodyMat.opacity = a.fade
      ;(nose.material as THREE.MeshStandardMaterial).opacity = a.fade
      ;(ring.material as THREE.MeshBasicMaterial).opacity = 0.7 * a.fade
    }

    // Left hand + wrist menu.
    const raise = menuRaise(t)
    const w = wristAt(t)
    left.position.set(w[0], w[1], w[2])
    left.lookAt(headPos)
    menu.visible = raise > 0.05
    menu.position.set(w[0] + 0.02, w[1] + 0.06, w[2] - 0.02)
    menu.lookAt(headPos)
    menu.scale.setScalar(0.4 + 0.6 * raise)
    const focus = menuFocus(t)
    rows.forEach((m, i) => {
      const set = rowTex[i]
      const next = focus.item === i ? (focus.pressed ? set.press : set.hover) : set.idle
      const mat = m.material as THREE.MeshBasicMaterial
      if (mat.map !== next) {
        mat.map = next
        mat.needsUpdate = true
      }
    })

    // Right hand rests low, lifts when the laser is in use.
    const beam = laserAt(t)
    if (beam && focus.item >= 0) {
      menu.updateMatrixWorld()
      beam.target = rows[focus.item].getWorldPosition(tmp).toArray()
    }
    camera.getWorldDirection(tmp)
    tmp.y = 0
    tmp.normalize()
    // Forward (fx, fz) and right (−fz, fx) on the floor plane.
    right.position.set(h[0] + tmp.x * 0.34 - tmp.z * 0.3, h[1] - 0.46 + (beam ? 0.12 : 0), h[2] + tmp.z * 0.34 + tmp.x * 0.3)
    laser.visible = reticle.visible = !!beam
    pulse.visible = false
    if (beam) {
      tmp.set(...beam.target)
      right.lookAt(tmp)
      right.rotateX(-Math.PI / 2.6)
      const pos = laserGeo.attributes.position as THREE.BufferAttribute
      pos.setXYZ(0, right.position.x, right.position.y + 0.02, right.position.z)
      pos.setXYZ(1, tmp.x, tmp.y, tmp.z)
      pos.needsUpdate = true
      reticle.position.copy(tmp)
      reticle.scale.setScalar(tmp.distanceTo(headPos) < 1 ? 0.25 : 1)
      if (beam.click) {
        pulse.visible = true
        pulse.position.copy(tmp)
        pulse.lookAt(headPos)
        const s = 1 + ((t * 6) % 1) * 2
        pulse.scale.setScalar(tmp.distanceTo(headPos) < 1 ? s * 0.25 : s)
      }
    } else {
      right.rotation.set(-0.4, 0, 0)
    }

    const sk = (t - SAVED_AT) / 0.8
    saveFlash.visible = sk > 0 && sk < 1
    if (saveFlash.visible) {
      saveFlash.position.set(w[0] + 0.02, w[1] + 0.06, w[2] - 0.019)
      saveFlash.lookAt(headPos)
      saveFlash.scale.setScalar(0.4 + sk * 1.2)
      ;(saveFlash.material as THREE.MeshBasicMaterial).opacity = 1 - sk
    }

    draw()
  }

  function draw() {
    const { width, height } = renderer.getSize(new THREE.Vector2())
    if (!stereo) {
      renderer.setScissorTest(false)
      renderer.setViewport(0, 0, width, height)
      renderer.render(scene, camera)
      return
    }
    // Side-by-side per-eye views, like a headset capture.
    renderer.setScissorTest(true)
    const half = width / 2
    eye.aspect = half / height
    eye.updateProjectionMatrix()
    for (const side of [-1, 1]) {
      eye.position.copy(camera.position)
      eye.quaternion.copy(camera.quaternion)
      eye.translateX((side * IPD) / 2)
      const x = side < 0 ? 0 : half
      renderer.setViewport(x, 0, half, height)
      renderer.setScissor(x, 0, half, height)
      renderer.render(scene, eye)
    }
  }

  function resize() {
    const { clientWidth: w, clientHeight: h } = canvas
    if (!w || !h) return
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }

  function dispose() {
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Line || o instanceof THREE.Sprite) {
        o.geometry?.dispose()
        const mats = Array.isArray(o.material) ? o.material : [o.material]
        for (const m of mats) {
          ;(m as THREE.MeshBasicMaterial).map?.dispose()
          m.dispose()
        }
      }
    })
    for (const set of rowTex) for (const tex of Object.values(set)) tex.dispose()
    renderer.dispose()
  }

  resize()
  return {
    render,
    setStereo: (on) => {
      stereo = on
    },
    resize,
    dispose,
  }
}
