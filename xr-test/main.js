/**
 * Quest 2 / Quest 3S passthrough test (served at /xr-test/).
 * Standalone three.js on purpose: it checks the headset's WebXR features in isolation from the
 * RealmForge app. Every XR feature is optional and detected at runtime; see docs/quest2-testing.md.
 */
import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';

// ---------- Tunables ----------
const SNAP_IN = 0.05;        // snap when base is within 5 cm of a surface
const SNAP_OUT = 0.08;       // stay snapped until 8 cm away (hysteresis)
const ROT_SNAP_DEG = 12;     // align to 90° room axes when within this angle

// ---------- Renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0);          // transparent => passthrough shows through
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
document.body.appendChild(renderer.domElement);
renderer.domElement.style.display = 'none';   // only visible inside XR

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 50);
scene.add(new THREE.HemisphereLight(0xffffff, 0x666677, 2.2));
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(1, 3, 1);
scene.add(sun);

// ---------- Session start with fallback chain ----------
const FULL_FEATURES = ['local-floor', 'anchors', 'plane-detection', 'mesh-detection', 'hand-tracking', 'hit-test'];
const ATTEMPTS = [
  {
    name: 'full (with depth)',
    init: {
      optionalFeatures: [...FULL_FEATURES, 'depth-sensing'],
      depthSensing: { usagePreference: ['gpu-optimized', 'cpu-optimized'], dataFormatPreference: ['luminance-alpha', 'float32'] },
    },
  },
  { name: 'no depth', init: { optionalFeatures: FULL_FEATURES } },
  { name: 'minimal', init: { optionalFeatures: ['local-floor'] } },
];

const enterBtn = document.getElementById('enter');
const statusEl = document.getElementById('status');
let sessionInfo = { attempt: '-', features: [], blend: '-' };

async function initButton() {
  if (!navigator.xr) {
    enterBtn.textContent = 'WebXR not available';
    statusEl.textContent = 'Open this page in the Quest Browser (needs https:// or localhost).';
    return;
  }
  const ok = await navigator.xr.isSessionSupported('immersive-ar').catch(() => false);
  if (!ok) {
    enterBtn.textContent = 'immersive-ar not supported';
    statusEl.textContent = 'This browser/device cannot do passthrough AR.\nOn PC, try the Meta Immersive Web Emulator extension.';
    return;
  }
  enterBtn.disabled = false;
  enterBtn.textContent = 'Enter AR';
  enterBtn.onclick = startSession;
}

async function startSession() {
  enterBtn.disabled = true;
  const errors = [];
  for (const a of ATTEMPTS) {
    try {
      const session = await navigator.xr.requestSession('immersive-ar', a.init);
      sessionInfo = {
        attempt: a.name,
        features: [...(session.enabledFeatures ?? [])],
        blend: session.environmentBlendMode ?? '?',
      };
      console.log('[MR] session started:', sessionInfo, errors);
      session.addEventListener('end', onSessionEnd);
      await renderer.xr.setSession(session);
      renderer.domElement.style.display = 'block';
      needsSpawn = true;
      return;
    } catch (e) {
      errors.push(`${a.name}: ${e.name} ${e.message}`);
    }
  }
  statusEl.textContent = 'Could not start AR:\n' + errors.join('\n');
  enterBtn.disabled = false;
}

function onSessionEnd() {
  renderer.domElement.style.display = 'none';
  enterBtn.disabled = false;
  for (const o of grabbables) dropAnchor(o);
  clearRoomVis();
}

const has = (f) => sessionInfo.features.includes(f);

// ---------- Test objects (true scale: 1 unit = 1 m) ----------
const grabbables = [];

function makeLabel(text) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const tex = new THREE.CanvasTexture(c);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.scale.set(0.2, 0.05, 1);
  sprite.renderOrder = 10;
  sprite.userData.draw = (t) => {
    const g = c.getContext('2d');
    g.clearRect(0, 0, 512, 128);
    g.fillStyle = 'rgba(0,0,0,0.65)';
    g.beginPath(); g.roundRect(0, 0, 512, 128, 24); g.fill();
    g.fillStyle = '#fff'; g.font = 'bold 40px system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(t, 256, 64);
    tex.needsUpdate = true;
  };
  sprite.userData.draw(text);
  return sprite;
}

function addGrabbable(name, geometry, material, extra) {
  const mesh = new THREE.Mesh(geometry, material);
  geometry.computeBoundingBox();
  const size = geometry.boundingBox.getSize(new THREE.Vector3());
  mesh.name = name;
  mesh.userData = {
    lockedScale: new THREE.Vector3(1, 1, 1),
    geomSize: size,
    baseOffset: -geometry.boundingBox.min.y,   // distance from origin to bottom face
    baseColor: material.color?.clone(),
    anchor: null, anchorPending: false, heldBy: null,
    candidate: null,
  };
  if (extra) mesh.add(extra);
  const label = makeLabel(name);
  label.position.y = geometry.boundingBox.max.y + 0.05;
  mesh.add(label);
  mesh.userData.label = label;
  scene.add(mesh);
  grabbables.push(mesh);

  // ghost preview for snapping
  const ghost = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0x66ffcc, transparent: true, opacity: 0.35, depthWrite: false }));
  ghost.visible = false;
  scene.add(ghost);
  mesh.userData.ghost = ghost;
  return mesh;
}

addGrabbable('10 cm cube', new THREE.BoxGeometry(0.1, 0.1, 0.1),
  new THREE.MeshStandardMaterial({ color: 0xff8a3d, roughness: 0.5 }));

addGrabbable('Mug 8x10 cm', new THREE.CylinderGeometry(0.04, 0.04, 0.1, 32),
  new THREE.MeshStandardMaterial({ color: 0x3d9bff, roughness: 0.4 }));

addGrabbable('Book 24x17x3 cm', new THREE.BoxGeometry(0.24, 0.03, 0.17),
  new THREE.MeshStandardMaterial({ color: 0x55c46a, roughness: 0.7 }));

{ // 1 m reference cube: faint faces (for grabbing) + bright edges
  const g = new THREE.BoxGeometry(1, 1, 1);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color: 0xffff66 }));
  addGrabbable('1 m reference', g,
    new THREE.MeshBasicMaterial({ color: 0xffff66, transparent: true, opacity: 0.06, depthWrite: false }), edges);
}

let needsSpawn = false;
function spawnInFront() {
  const xrCam = renderer.xr.getCamera();
  const head = new THREE.Vector3().setFromMatrixPosition(xrCam.matrixWorld);
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(xrCam.getWorldQuaternion(new THREE.Quaternion()));
  fwd.y = 0;
  if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, -1);
  fwd.normalize();
  const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));
  const yaw = Math.atan2(-fwd.x, -fwd.z);

  const spots = [
    [-0.25, 0.5, -0.25], [0, 0.5, -0.25], [0.25, 0.5, -0.25], // small objects at chest height
    [0, null, 1.6],                                           // reference cube on floor, 1.6 m ahead
  ];
  grabbables.forEach((o, i) => {
    if (o.userData.heldBy) return;
    dropAnchor(o);
    const [r, h, f] = spots[i];
    const fwdDist = i < 3 ? 0.5 : f;
    const p = head.clone().addScaledVector(fwd, fwdDist).addScaledVector(right, r);
    p.y = h === null ? o.userData.baseOffset : head.y - 0.35;
    o.position.copy(p);
    o.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  });

  hud.position.copy(head).addScaledVector(fwd, 0.9).addScaledVector(right, -0.55);
  hud.position.y = head.y - 0.05;
  hud.lookAt(head.x, hud.position.y, head.z);
}

// ---------- HUD panel ----------
const hudCanvas = document.createElement('canvas');
hudCanvas.width = 1024; hudCanvas.height = 640;
const hudTex = new THREE.CanvasTexture(hudCanvas);
const hud = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.3125),
  new THREE.MeshBasicMaterial({ map: hudTex, transparent: true }));
scene.add(hud);

function drawHud(lines) {
  const g = hudCanvas.getContext('2d');
  g.clearRect(0, 0, 1024, 640);
  g.fillStyle = 'rgba(10,14,20,0.82)';
  g.beginPath(); g.roundRect(0, 0, 1024, 640, 32); g.fill();
  g.font = '30px ui-monospace, monospace';
  g.textBaseline = 'top';
  lines.forEach((l, i) => {
    g.fillStyle = l.startsWith('✔') ? '#8ef59b' : l.startsWith('✘') ? '#ff8f8f' : l.startsWith('#') ? '#ffd166' : '#e8eaed';
    g.fillText(l.replace(/^#/, ''), 32, 28 + i * 40);
  });
  hudTex.needsUpdate = true;
}

// ---------- Controllers & hands ----------
const raycaster = new THREE.Raycaster();
const ctrlModels = new XRControllerModelFactory();
const handModels = new XRHandModelFactory();
const controllers = [];

for (let i = 0; i < 2; i++) {
  const ctrl = renderer.xr.getController(i);       // target-ray space (works for controllers AND hands)
  const ray = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }));
  ray.scale.z = 3;
  ctrl.add(ray);
  ctrl.userData.ray = ray;
  ctrl.addEventListener('selectstart', onGrab);
  ctrl.addEventListener('selectend', onRelease);
  ctrl.addEventListener('squeezestart', () => { needsSpawn = true; });
  ctrl.addEventListener('connected', (e) => { ctrl.userData.isHand = !!e.data.hand; ray.visible = true; });
  ctrl.addEventListener('disconnected', () => { ray.visible = false; });
  scene.add(ctrl);
  controllers.push(ctrl);

  const grip = renderer.xr.getControllerGrip(i);
  grip.add(ctrlModels.createControllerModel(grip));
  scene.add(grip);

  const hand = renderer.xr.getHand(i);
  hand.add(handModels.createHandModel(hand, 'mesh'));
  scene.add(hand);
}

function pickFrom(ctrl) {
  const m = ctrl.matrixWorld;
  raycaster.ray.origin.setFromMatrixPosition(m);
  raycaster.ray.direction.set(0, 0, -1).transformDirection(m);
  raycaster.far = 5;
  const hits = raycaster.intersectObjects(grabbables.filter((o) => !o.userData.heldBy), false);
  return hits[0] ?? null;
}

function onGrab(e) {
  const ctrl = e.target;
  const hit = pickFrom(ctrl);
  if (!hit) return;
  const obj = hit.object;
  dropAnchor(obj);
  obj.userData.heldBy = ctrl;
  obj.userData.candidate = null;
  ctrl.attach(obj);                 // keeps world transform (and therefore scale)
  ctrl.userData.held = obj;
  pulse(ctrl, 0.4, 40);
}

function onRelease(e) {
  const ctrl = e.target;
  const obj = ctrl.userData.held;
  if (!obj) return;
  scene.attach(obj);
  obj.userData.heldBy = null;
  ctrl.userData.held = null;
  const c = obj.userData.candidate;
  if (c) {
    obj.position.copy(c.position);
    obj.quaternion.copy(c.quaternion);
    lastSnapReport = `${obj.name} → ${c.label}`;
    pulse(ctrl, 0.8, 60);
  } else {
    lastSnapReport = `${obj.name} → free (no surface)`;
  }
  obj.userData.candidate = null;
  obj.userData.ghost.visible = false;
  obj.userData.anchorPending = true;  // created on next XR frame
}

function pulse(ctrl, intensity, ms) {
  const src = ctrl.userData.inputSource;
  src?.gamepad?.hapticActuators?.[0]?.pulse?.(intensity, ms);
}
for (const c of controllers) c.addEventListener('connected', (e) => { c.userData.inputSource = e.data; });

// ---------- Anchors ----------
function dropAnchor(obj) {
  obj.userData.anchor?.delete?.();
  obj.userData.anchor = null;
  obj.userData.anchorPending = false;
}

function createAnchorFor(obj, frame, refSpace) {
  obj.userData.anchorPending = false;
  if (!has('anchors') || !frame.createAnchor) return;
  const p = obj.position, q = obj.quaternion;
  frame.createAnchor(new XRRigidTransform({ x: p.x, y: p.y, z: p.z }, { x: q.x, y: q.y, z: q.z, w: q.w }), refSpace)
    .then((anchor) => {
      if (obj.userData.heldBy) { anchor.delete(); return; }
      obj.userData.anchor = anchor;
    })
    .catch((err) => console.warn('[MR] anchor failed', err));
}

// ---------- Room visualisation: planes + meshes ----------
const PLANE_COLORS = { floor: 0x4caf50, table: 0xff9800, wall: 0x2196f3, ceiling: 0x9c27b0, couch: 0xe91e63 };
const planeVis = new Map();  // XRPlane -> { group, lastChanged, matrix }
const meshVis = new Map();   // XRMesh  -> { mesh, lastChanged }
const roomMeshGroup = new THREE.Group();
scene.add(roomMeshGroup);

function buildPlaneGroup(plane) {
  const color = PLANE_COLORS[plane.semanticLabel] ?? 0xaaaaaa;
  const pts = plane.polygon.map((p) => new THREE.Vector2(p.x, -p.z));
  const geom = new THREE.ShapeGeometry(new THREE.Shape(pts));
  geom.rotateX(-Math.PI / 2);   // shape XY -> plane XZ (plane normal = +Y)
  const fill = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }));
  const outline = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(plane.polygon.map((p) => new THREE.Vector3(p.x, 0.002, p.z))),
    new THREE.LineBasicMaterial({ color }));
  const group = new THREE.Group();
  group.add(fill, outline);
  group.matrixAutoUpdate = false;
  return group;
}

function disposeGroup(obj) {
  obj.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
  obj.parent?.remove(obj);
}

function updateRoom(frame, refSpace) {
  const planes = frame.detectedPlanes;
  if (planes) {
    for (const [plane, vis] of planeVis) if (!planes.has(plane)) { disposeGroup(vis.group); planeVis.delete(plane); }
    for (const plane of planes) {
      let vis = planeVis.get(plane);
      if (!vis || vis.lastChanged !== plane.lastChangedTime) {
        if (vis) disposeGroup(vis.group);
        vis = { group: buildPlaneGroup(plane), lastChanged: plane.lastChangedTime, matrix: new THREE.Matrix4(), valid: false };
        scene.add(vis.group);
        planeVis.set(plane, vis);
      }
      const pose = frame.getPose(plane.planeSpace, refSpace);
      vis.valid = !!pose;
      vis.group.visible = vis.valid;
      if (pose) { vis.matrix.fromArray(pose.transform.matrix); vis.group.matrix.copy(vis.matrix); }
    }
  }

  const meshes = frame.detectedMeshes;
  if (meshes) {
    for (const [m, vis] of meshVis) if (!meshes.has(m)) { disposeGroup(vis.mesh); meshVis.delete(m); }
    for (const m of meshes) {
      let vis = meshVis.get(m);
      if (!vis || vis.lastChanged !== m.lastChangedTime) {
        if (vis) disposeGroup(vis.mesh);
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(m.vertices), 3));
        geom.setIndex(new THREE.BufferAttribute(new Uint32Array(m.indices), 1));
        geom.computeVertexNormals();
        const mesh = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ color: 0x00e5ff, wireframe: true, transparent: true, opacity: 0.12, side: THREE.DoubleSide }));
        mesh.matrixAutoUpdate = false;
        mesh.userData.label = m.semanticLabel ?? 'mesh';
        roomMeshGroup.add(mesh);
        vis = { mesh, lastChanged: m.lastChangedTime };
        meshVis.set(m, vis);
      }
      const pose = frame.getPose(m.meshSpace, refSpace);
      vis.mesh.visible = !!pose;
      if (pose) vis.mesh.matrix.fromArray(pose.transform.matrix);
    }
  }
}

function clearRoomVis() {
  for (const v of planeVis.values()) disposeGroup(v.group);
  for (const v of meshVis.values()) disposeGroup(v.mesh);
  planeVis.clear(); meshVis.clear();
}

// ---------- Snapping ----------
const _inv = new THREE.Matrix4(), _v = new THREE.Vector3(), _q = new THREE.Quaternion();

function insidePolygon(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

// Build a rotation whose +Y is the surface normal, keeping the object's heading.
function alignedQuaternion(obj, normal, planeMatrix) {
  const worldQ = obj.getWorldQuaternion(_q);
  const fwd = new THREE.Vector3(1, 0, 0).applyQuaternion(worldQ);
  fwd.addScaledVector(normal, -fwd.dot(normal));
  if (fwd.lengthSq() < 1e-6) fwd.set(1, 0, 0).addScaledVector(normal, -normal.x);
  fwd.normalize();

  // Rotation snap: line up with the plane's own X axis (room-aligned) at 90° steps
  if (planeMatrix) {
    const px = new THREE.Vector3().setFromMatrixColumn(planeMatrix, 0).normalize();
    const pz = new THREE.Vector3().setFromMatrixColumn(planeMatrix, 2).normalize();
    const ang = Math.atan2(fwd.dot(pz), fwd.dot(px));
    const snapped = Math.round(ang / (Math.PI / 2)) * (Math.PI / 2);
    if (Math.abs(ang - snapped) < THREE.MathUtils.degToRad(ROT_SNAP_DEG)) {
      fwd.copy(px).multiplyScalar(Math.cos(snapped)).addScaledVector(pz, Math.sin(snapped)).normalize();
    }
  }
  const z = new THREE.Vector3().crossVectors(fwd, normal).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(fwd, normal, z));
}

function findSnap(obj) {
  const world = obj.getWorldPosition(new THREE.Vector3());
  const base = obj.userData.baseOffset;
  const threshold = obj.userData.candidate ? SNAP_OUT : SNAP_IN;
  let best = null;

  // 1) Planes (Quest 2 + 3S)
  for (const [plane, vis] of planeVis) {
    if (!vis.valid) continue;
    _inv.copy(vis.matrix).invert();
    const local = _v.copy(world).applyMatrix4(_inv);
    const dist = Math.abs(local.y - base);
    if (dist > threshold || !insidePolygon(local.x, local.z, plane.polygon)) continue;
    if (best && dist >= best.dist) continue;
    local.y = base;
    const normal = new THREE.Vector3().setFromMatrixColumn(vis.matrix, 1).normalize();
    best = {
      dist,
      position: local.clone().applyMatrix4(vis.matrix),
      quaternion: alignedQuaternion(obj, normal, vis.matrix),
      label: `plane:${plane.semanticLabel ?? plane.orientation}`,
    };
  }

  // 2) Room mesh (Quest 3S only) – drop straight down onto upward-facing geometry
  if (roomMeshGroup.children.length) {
    raycaster.ray.origin.copy(world).y += 0.02;
    raycaster.ray.direction.set(0, -1, 0);
    raycaster.far = base + threshold + 0.02;
    const hit = raycaster.intersectObjects(roomMeshGroup.children, false)[0];
    if (hit?.face) {
      const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
      const dist = Math.max(0, hit.distance - 0.02 - base);
      if (n.y > 0.7 && dist <= threshold && (!best || dist < best.dist - 0.01)) {
        best = {
          dist,
          position: hit.point.clone().addScaledVector(n, base),
          quaternion: alignedQuaternion(obj, n, null),
          label: `mesh:${hit.object.userData.label}`,
        };
      }
    }
  }
  return best;
}

// ---------- Main loop ----------
let lastSnapReport = '-';
let frames = 0, fps = 0, fpsT = performance.now(), hudT = 0;

renderer.setAnimationLoop((time, frame) => {
  if (!frame) return;
  const refSpace = renderer.xr.getReferenceSpace();
  scene.updateMatrixWorld();

  if (needsSpawn) { spawnInFront(); needsSpawn = false; }

  updateRoom(frame, refSpace);
  scene.updateMatrixWorld();

  for (const obj of grabbables) {
    obj.scale.copy(obj.userData.lockedScale);   // scale lock

    if (obj.userData.heldBy) {
      const c = findSnap(obj);
      obj.userData.candidate = c;
      obj.userData.ghost.visible = !!c;
      if (c) { obj.userData.ghost.position.copy(c.position); obj.userData.ghost.quaternion.copy(c.quaternion); }
    } else {
      if (obj.userData.anchorPending) createAnchorFor(obj, frame, refSpace);
      const a = obj.userData.anchor;
      if (a) {
        const pose = frame.getPose(a.anchorSpace, refSpace);
        if (pose) {
          const { position: p, orientation: o } = pose.transform;
          obj.position.set(p.x, p.y, p.z);
          obj.quaternion.set(o.x, o.y, o.z, o.w);
        }
      }
    }
  }

  // hover highlight
  const hovered = new Set();
  for (const ctrl of controllers) {
    if (ctrl.userData.held) continue;
    const hit = pickFrom(ctrl);
    ctrl.userData.ray.scale.z = hit ? hit.distance : 3;
    if (hit) hovered.add(hit.object);
  }
  for (const o of grabbables) {
    if (o.material.emissive) o.material.emissive.setHex(hovered.has(o) || o.userData.heldBy ? 0x333333 : 0x000000);
  }

  // stats + HUD (4x per second)
  frames++;
  const now = performance.now();
  if (now - fpsT >= 1000) { fps = Math.round((frames * 1000) / (now - fpsT)); frames = 0; fpsT = now; }
  if (now - hudT > 250) { hudT = now; updateHud(); }

  renderer.render(scene, camera);
});

function updateHud() {
  const f = (name, note = '') => `${has(name) ? '✔' : '✘'} ${name}${note}`;
  const held = grabbables.find((o) => o.userData.heldBy) ?? grabbables.find((o) => o.userData.anchor) ?? grabbables[0];
  const ws = held.getWorldScale(new THREE.Vector3());
  const s = held.userData.geomSize.clone().multiply(ws).multiplyScalar(100);
  const device = (navigator.userAgent.match(/Quest[^;)]*/) ?? ['unknown device'])[0];

  drawHud([
    `#MR Snap Test — ${device} — ${fps} fps`,
    `session: ${sessionInfo.attempt}  blend: ${sessionInfo.blend}`,
    f('plane-detection', `  (${planeVis.size} planes)`),
    f('mesh-detection', `  (${meshVis.size} meshes)`),
    f('anchors', `  (${grabbables.filter((o) => o.userData.anchor).length} placed)`),
    f('hand-tracking'),
    f('depth-sensing', has('depth-sensing') ? '  (occlusion via three.js)' : ''),
    `#${held.name}${held.userData.heldBy ? '  [HELD]' : ''}`,
    `size ${s.x.toFixed(1)} × ${s.y.toFixed(1)} × ${s.z.toFixed(1)} cm   scale ${ws.x.toFixed(3)}`,
    `snap: ${held.userData.candidate ? held.userData.candidate.label + ' (' + (held.userData.candidate.dist * 100).toFixed(1) + ' cm)' : '-'}`,
    `last: ${lastSnapReport}`,
    `grip button = respawn objects in front`,
  ]);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

initButton();
