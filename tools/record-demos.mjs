/**
 * Records the landing page's "Watch it in action" replays: scripted runs of the real editor,
 * on desktop and in an emulated Meta Quest 3 (IWER), captured from headless Chromium.
 *
 *   npm run dev                       # in another terminal
 *   npm run demos:record              # all clips → public/demos/*.mp4 + posters
 *   npm run demos:record -- replan vr # just some clips
 *
 * Needs ffmpeg (with libx264 and libvpx-vp9) on PATH. Writes <clip>.mp4, <clip>.webm and a <clip>.jpg poster.
 *
 * Uses 127.0.0.1 (not localhost) so @react-three/xr doesn't auto-inject its
 * own emulator; this script installs IWER itself, without the dev UI, so the clip shows only the
 * headset view.
 *
 * Software WebGL is slow, so the page runs on a dilated clock (TIME_SCALE): the app sees time pass
 * at a fraction of real speed and the captured frames are retimed to app time. Clips play back at
 * normal speed and stay smooth however slow the machine is.
 */
import { chromium, request } from 'playwright'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const BASE = process.env.DEMO_URL ?? 'https://127.0.0.1:5173/'
const OUT = path.resolve(process.env.DEMO_OUT ?? 'public/demos')
const TIME_SCALE = Number(process.env.DEMO_TIME_SCALE ?? 0.25)
const SIZE = { width: 1280, height: 720 }
const FPS = 30

// ---------------------------------------------------------------- page setup

/** Runs before any app code: slows the page clock by TIME_SCALE, and removes Chromium's native WebXR so IWER can install. */
function pageInit({ K, emulateXR }) {
  const pn = performance.now.bind(performance)
  const dn = Date.now
  const base = pn()
  const dbase = dn()
  performance.now = () => base + (pn() - base) * K
  Date.now = () => dbase + (dn() - dbase) * K
  const raf = window.requestAnimationFrame.bind(window)
  window.requestAnimationFrame = (cb) => raf((t) => cb(base + (t - base) * K))
  const st = window.setTimeout.bind(window)
  const si = window.setInterval.bind(window)
  window.setTimeout = (f, d, ...a) => st(f, (d || 0) / K, ...a)
  window.setInterval = (f, d, ...a) => si(f, (d || 0) / K, ...a)
  if (emulateXR) {
    delete Navigator.prototype.xr
  }
  // Keep the replay free of first-run prompts.
  try {
    localStorage.setItem('rf-demo-recording', '1')
  } catch {}

  const STYLE = `
    body{user-select:none!important;-webkit-user-select:none!important}
    #rf-demo-cursor{position:fixed;left:0;top:0;width:22px;height:22px;margin:-3px 0 0 -3px;z-index:2147483646;pointer-events:none;transition:transform .08s ease}
    #rf-demo-cursor svg{filter:drop-shadow(0 2px 3px rgba(0,0,0,.55))}
    #rf-demo-cursor.down{transform:scale(.86)}
    .rf-demo-ripple{position:fixed;width:36px;height:36px;margin:-18px 0 0 -18px;border-radius:50%;border:2px solid #ff8854;z-index:2147483645;pointer-events:none;animation:rfRipple .5s ease-out forwards}
    @keyframes rfRipple{from{transform:scale(.3);opacity:1}to{transform:scale(1.4);opacity:0}}
    #rf-demo-caption{position:fixed;left:50%;top:22px;transform:translateX(-50%);z-index:2147483644;pointer-events:none;
      font:600 17px/1.2 Inter,system-ui,sans-serif;color:#fff4ec;background:rgba(14,17,26,.86);border:1px solid rgba(255,136,84,.55);
      border-radius:999px;padding:10px 20px 10px 14px;display:flex;gap:10px;align-items:center;box-shadow:0 8px 24px rgba(0,0,0,.35);
      transition:opacity .25s ease;white-space:nowrap}
    #rf-demo-caption b{font:700 12px/1 ui-monospace,monospace;color:#120d0a;background:#ff8854;border-radius:999px;padding:5px 8px}
    #rf-demo-caption:empty{opacity:0}
    #rf-demo-badge{position:fixed;left:20px;bottom:20px;z-index:2147483644;pointer-events:none;font:600 13px/1 ui-monospace,monospace;letter-spacing:.06em;
      color:#ffd9c6;background:rgba(14,17,26,.8);border:1px solid rgba(255,255,255,.18);border-radius:8px;padding:9px 12px}
    #rf-demo-vignette{position:fixed;inset:0;z-index:2147483643;pointer-events:none;background:radial-gradient(ellipse at center,transparent 58%,rgba(0,0,0,.6) 100%)}
  `
  const mount = () => {
    const s = document.createElement('style')
    s.textContent = STYLE
    document.head.appendChild(s)
    const c = document.createElement('div')
    c.id = 'rf-demo-cursor'
    c.innerHTML =
      '<svg width="22" height="22" viewBox="0 0 22 22"><path d="M3 2l15 8.5-6.6 1.6L8.2 18z" fill="#fff" stroke="#120d0a" stroke-width="1.6" stroke-linejoin="round"/></svg>'
    c.style.display = 'none'
    document.body.appendChild(c)
    const cap = document.createElement('div')
    cap.id = 'rf-demo-caption'
    document.body.appendChild(cap)
    addEventListener('mousemove', (e) => {
      c.style.display = ''
      c.style.left = e.clientX + 'px'
      c.style.top = e.clientY + 'px'
    }, true)
    addEventListener('mousedown', (e) => {
      c.classList.add('down')
      const r = document.createElement('div')
      r.className = 'rf-demo-ripple'
      r.style.left = e.clientX + 'px'
      r.style.top = e.clientY + 'px'
      document.body.appendChild(r)
      setTimeout(() => r.remove(), 700)
    }, true)
    addEventListener('mouseup', () => c.classList.remove('down'), true)
  }
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', mount)
  else mount()
}

async function openEditor(browser, { world, emulateXR = false }) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: SIZE, deviceScaleFactor: 1 })
  const page = await context.newPage()
  page.on('pageerror', (e) => console.warn('  [page error]', String(e).slice(0, 200)))
  await page.addInitScript(pageInit, { K: TIME_SCALE, emulateXR })
  await routeCdn(page)
  const url = new URL(BASE)
  url.searchParams.set('editor', '1')
  if (world) url.searchParams.set('world', world)
  await page.goto(url.href, { waitUntil: 'load' })
  await page.waitForSelector('canvas', { timeout: 60_000 })
  await page.waitForTimeout(2500 / TIME_SCALE)
  return { context, page }
}

/**
 * XR controller models and 3D-text fallback fonts come from jsDelivr. Serve the controller models
 * from a local @webxr-input-profiles/assets when installed, and fetch through HTTPS_PROXY when set,
 * so recording also works on locked-down machines. Otherwise the requests go out untouched.
 */
let api
async function routeCdn(page) {
  const local = path.resolve('node_modules/@webxr-input-profiles/assets/dist/profiles')
  if (fs.existsSync(local)) {
    await page.route('https://cdn.jsdelivr.net/npm/@webxr-input-profiles/assets@*/dist/profiles/**', (r) =>
      r.fulfill({ path: path.join(local, r.request().url().split('/dist/profiles/')[1]) }),
    )
  }
  if (process.env.HTTPS_PROXY) {
    api ??= await request.newContext({ proxy: { server: process.env.HTTPS_PROXY } })
    // jsDelivr's GitHub mirror → raw.githubusercontent.com (same files).
    await page.route('https://cdn.jsdelivr.net/gh/**', async (r) => {
      const u = r
        .request()
        .url()
        .replace('https://cdn.jsdelivr.net/gh/', 'https://raw.githubusercontent.com/')
        .replace(/^(https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/@]+)@/, '$1/')
      const res = await api.get(u)
      await r.fulfill({
        status: res.status(),
        body: await res.body(),
        headers: { 'access-control-allow-origin': '*', 'content-type': u.endsWith('.json') ? 'application/json' : 'font/woff' },
      })
    })
  }
}

// ---------------------------------------------------------------- capture

/** Screencast frames with their real timestamps; retimed to page time when written out. */
async function startCapture(context, page) {
  const cdp = await context.newCDPSession(page)
  const frames = []
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    frames.push({ t: metadata.timestamp, data })
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {})
  })
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: SIZE.width, maxHeight: SIZE.height, everyNthFrame: 1 })
  return async function stop(name) {
    await cdp.send('Page.stopScreencast')
    await encode(name, frames)
  }
}

function encode(name, allFrames) {
  // Software GL occasionally hands the compositor an empty canvas for a frame; those encode far
  // smaller than their neighbours, so drop them rather than flash a blank board.
  const sizes = allFrames.map((f) => f.data.length)
  const frames = allFrames.filter((f, i) => {
    const near = sizes.slice(Math.max(0, i - 6), i + 7).sort((a, b) => a - b)
    return sizes[i] > near[Math.floor(near.length / 2)] * 0.8
  })
  if (frames.length < allFrames.length) console.log(`  dropped ${allFrames.length - frames.length} blank frames`)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `rf-demo-${name}-`))
  let list = ''
  frames.forEach((f, i) => {
    const file = path.join(dir, `${String(i).padStart(5, '0')}.jpg`)
    fs.writeFileSync(file, Buffer.from(f.data, 'base64'))
    const d = i + 1 < frames.length ? (frames[i + 1].t - f.t) * TIME_SCALE : 1 / FPS
    list += `file '${file}'\nduration ${Math.max(d, 0.001).toFixed(4)}\n`
  })
  // concat needs the last file repeated for its duration to count.
  list += `file '${path.join(dir, `${String(frames.length - 1).padStart(5, '0')}.jpg`)}'\n`
  fs.writeFileSync(path.join(dir, 'list.txt'), list)
  fs.mkdirSync(OUT, { recursive: true })
  const mp4 = path.join(OUT, `${name}.mp4`)
  const run = (args) => {
    const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' })
    if (r.status !== 0) throw new Error(`ffmpeg failed for ${name}`)
  }
  run(['-f', 'concat', '-safe', '0', '-i', path.join(dir, 'list.txt'), '-vf', `fps=${FPS},format=yuv420p`,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '26', '-movflags', '+faststart', '-an', mp4])
  // WebM/VP9 too: Chromium builds without H.264 (and some Linux browsers) play this one.
  run(['-i', mp4, '-c:v', 'libvpx-vp9', '-crf', '38', '-b:v', '0', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2', '-an', path.join(OUT, `${name}.webm`)])
  // Poster: a frame from late in the clip, where the action has happened.
  run(['-sseof', '-1.5', '-i', mp4, '-frames:v', '1', '-q:v', '4', path.join(OUT, `${name}.jpg`)])
  fs.rmSync(dir, { recursive: true, force: true })
  const secs = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp4]).stdout.toString().trim()
  console.log(`  → ${path.relative(process.cwd(), mp4)} (${Number(secs).toFixed(1)} s, ${(fs.statSync(mp4).size / 1e6).toFixed(1)} MB)`)
}

// ---------------------------------------------------------------- script helpers

function helpers(page) {
  let cursor = { x: SIZE.width / 2, y: SIZE.height / 2 }
  /** Wait in page (app) time. */
  const wait = (ms) => page.waitForTimeout(ms / TIME_SCALE)
  /** Glide the cursor smoothly to (x, y) over `ms` of app time (paced by the wall clock, so round trips don't stretch it). */
  const glide = async (x, y, ms = 600) => {
    const from = { ...cursor }
    const start = Date.now()
    const real = ms / TIME_SCALE
    for (;;) {
      const t = Math.min(1, (Date.now() - start) / real)
      const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
      await page.mouse.move(from.x + (x - from.x) * e, from.y + (y - from.y) * e)
      if (t >= 1) break
      await page.waitForTimeout(25)
    }
    cursor = { x, y }
  }
  const caption = (step, text) =>
    page.evaluate(([s, t]) => {
      const c = document.getElementById('rf-demo-caption')
      c.innerHTML = t ? `<b>${s}</b>${t}` : ''
    }, [step, text])
  const button = (label) => page.locator('button:visible', { hasText: new RegExp(`^\\s*${label}\\s*$`) }).first()
  const clickButton = async (label, ms = 550) => {
    const box = await button(label).boundingBox()
    if (!box) throw new Error(`No visible button "${label}"`)
    await glide(box.x + box.width / 2, box.y + box.height / 2, ms)
    await click()
  }
  const click = async () => {
    await page.mouse.down()
    await wait(90)
    await page.mouse.up()
    await wait(120)
  }
  const drag = async (to, ms = 900) => {
    await page.mouse.down()
    await wait(80)
    await glide(to.x, to.y, ms)
    await page.mouse.up()
    await wait(120)
  }
  /** Screen position of a map point (map units, metres before world scale). */
  const toScreen = (x, z, y = 0) =>
    page.evaluate(
      async ([x, z, y, w, h]) => {
        const st = await rfStore()
        const root = rfRoot(st.scene)
        const v = root.localToWorld(new root.position.constructor(x, y, z)).project(st.camera)
        return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h }
      },
      [x, z, y, SIZE.width, SIZE.height],
    )
  /** Screen point of a map point; if a HUD panel covers it, slides it toward the map centre until it's clear. */
  const ground = async (x, z, y = 0) => {
    for (let i = 0; i < 10; i++) {
      const k = 1 - i * 0.08
      const p = await toScreen(x * k, z * k, y)
      const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.tagName, [p.x, p.y])
      if (hit === 'CANVAS') return p
    }
    throw new Error(`Map point ${x},${z} is covered by the HUD`)
  }
  const world = () =>
    page.evaluate(async () => {
      const { useWorld } = await import('/src/world/store.ts')
      const s = useWorld.getState()
      return { objects: Object.values(s.objects), robotStart: s.robotStart }
    })
  return { wait, glide, caption, clickButton, click, drag, toScreen, ground, world, button, get cursor() { return cursor } }
}

/** Page-side lookups shared by helpers: R3F's store and the scaled world root. */
async function installPageLookups(page) {
  await page.evaluate(() => {
    window.rfStore = async () => {
      const meta = performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.includes('/.vite/deps/@react-three_fiber.js'))
      const f = await import(meta)
      return [...f._roots.values()][0].store.getState()
    }
    window.rfRoot = (scene) => {
      let root = null
      scene.traverse((o) => {
        if (!root && o.isGroup && o.scale.x < 0.99 && o.scale.x > 0 && o.children.length > 3) root = o
      })
      return root
    }
  })
}

/** Zoom the desktop orbit camera in by `notches` wheel steps around `at`, before capture starts. */
async function zoom(page, h, notches, at) {
  await page.mouse.move(at.x, at.y)
  for (let i = 0; i < notches; i++) {
    await page.mouse.wheel(0, -240)
    await h.wait(80)
  }
  await h.wait(700)
  await h.glide(at.x, at.y, 1)
}

/** Move the desktop camera toward the orbit target (factor < 1 = closer), past the wheel's zoom steps; shiftZ slides the view (metres). */
async function dolly(page, h, factor, shiftZ = 0) {
  await page.evaluate(async ([f, dz]) => {
    const st = await window.rfStore()
    const t = st.controls.target
    st.camera.position.sub(t).multiplyScalar(f).add(t)
    // Sliding camera and target toward you lifts the subject up the screen, clear of the voice bar.
    st.camera.position.z += dz
    t.z += dz
    st.controls.update()
  }, [factor, shiftZ])
  await h.wait(500)
}

// ---------------------------------------------------------------- clips

const CLIPS = {
  /** Desktop: empty board → buildings, a wall, trees → robot with a route. */
  async build(browser) {
    const { context, page } = await openEditor(browser, { world: 'empty-event-venue' })
    await installPageLookups(page)
    const h = helpers(page)
    await zoom(page, h, 3, { x: 700, y: 400 })
    const stop = await startCapture(context, page)
    await h.wait(300)

    await h.caption('01', 'Start from an empty board')
    await h.wait(800)
    await h.caption('02', 'Place buildings')
    await h.clickButton('Building')
    for (const [x, z] of [[-6, -18], [14, -20], [24, 2]]) {
      const p = await h.ground(x, z)
      await h.glide(p.x, p.y, 500)
      await h.click()
      await h.wait(200)
    }
    await h.clickButton('Done placing', 500)
    await h.caption('03', 'Draw a wall')
    await h.clickButton('Wall')
    const a = await h.ground(-8, 6)
    const b = await h.ground(20, 6)
    await h.glide(a.x, a.y, 550)
    await h.drag(b, 800)
    await h.wait(200)
    await h.caption('04', 'Add trees')
    await h.clickButton('Decoration', 450)
    for (const [x, z] of [[-4, -6], [30, -12], [8, 22], [-2, 26]]) {
      const p = await h.ground(x, z)
      await h.glide(p.x, p.y, 380)
      await h.click()
    }
    await h.clickButton('Done placing', 450)
    await h.caption('05', 'Drop in a robot and a destination')
    await h.clickButton('Plan Routes')
    await h.clickButton('Place Robot')
    let p = await h.ground(-22, 14)
    await h.glide(p.x, p.y, 550)
    await h.click()
    await h.clickButton('Add Waypoint')
    p = await h.ground(30, -30)
    await h.glide(p.x, p.y, 650)
    await h.click()
    await h.clickButton('Play', 500)
    await h.caption('06', 'It finds a way around everything you built')
    await h.glide(1120, 640, 700)
    await h.wait(4000)
    await stop('build')
    await context.close()
  },

  /** Desktop: Forge District robot on its route → block the path → replan → clear it again. */
  async replan(browser) {
    const { context, page } = await openEditor(browser, { world: 'forge-district' })
    await installPageLookups(page)
    const h = helpers(page)
    await page.mouse.move(h.cursor.x, h.cursor.y)
    const stop = await startCapture(context, page)
    await h.wait(300)
    await h.caption('01', 'The robot follows its route through the city')
    await h.wait(1800)
    await h.caption('02', 'Block the path')
    await h.clickButton('Plan Routes')
    await h.clickButton('Block Path')
    await h.wait(900)
    await h.caption('03', 'It replans instantly with A*')
    await h.wait(2200)
    await h.caption('04', 'Move the wall: it reroutes again')
    const walls = (await h.world()).objects.filter((o) => o.kind === 'wall')
    const w = walls[0]
    const from = await h.toScreen(w.position[0], w.position[2], 1)
    const to = await h.toScreen(w.position[0] + 12, w.position[2] + 14, 1)
    await h.clickButton('Edit')
    await h.clickButton('Select')
    await h.glide(from.x, from.y, 700)
    await h.click()
    await h.wait(200)
    await h.drag(to, 1200)
    await h.glide(1040, 560, 700)
    await h.wait(2600)
    await stop('replan')
    await context.close()
  },

  /** Desktop: Job Fair → start the attendee and watch the flow. */
  async event(browser) {
    const { context, page } = await openEditor(browser, { world: 'job-fair' })
    await installPageLookups(page)
    const h = helpers(page)
    // Frame the hall: it sits in the middle of an 80 m board.
    await dolly(page, h, 0.32, 0.08)
    const stop = await startCapture(context, page)
    await h.wait(300)
    await h.caption('01', 'A job fair venue: booths, seating, stage')
    await h.glide(760, 420, 900)
    await h.wait(600)
    await h.caption('02', 'Start a virtual attendee')
    await h.clickButton('Simulate')
    await h.clickButton('Start')
    await h.glide(1040, 560, 800)
    await h.caption('03', 'Registration, booths, stage, exit')
    await h.wait(9000)
    await stop('event')
    await context.close()
  },

  /** Emulated Meta Quest 3: enter VR, look around, grab a building, block the robot's route. */
  async vr(browser) {
    const { context, page } = await openEditor(browser, { world: 'forge-district', emulateXR: true })
    await installPageLookups(page)
    const h = helpers(page)
    await page.evaluate(async () => {
      const { XRDevice, metaQuest3 } = await import('/node_modules/iwer/lib/index.js')
      const d = new XRDevice(metaQuest3)
      d.installRuntime()
      window.rfHeadset = d
    })
    const pose = (o) => page.evaluate(vrPose, o)
    await pose({ head: { yaw: 0, pitch: -0.15 }, hands: 'rest' })
    await page.mouse.move(h.cursor.x, h.cursor.y)
    const stop = await startCapture(context, page)
    await h.wait(300)
    await h.caption('01', 'Same editor, one click into VR')
    await h.clickButton('VR', 800)
    await h.wait(500)
    // Hide the desktop page: only the headset view stays.
    await page.evaluate(() => {
      document.getElementById('root').style.visibility = 'hidden'
      document.getElementById('rf-demo-cursor').style.display = 'none'
      const b = document.createElement('div')
      b.id = 'rf-demo-badge'
      b.textContent = 'META QUEST 3 · EMULATED HEADSET VIEW'
      document.body.appendChild(b)
      const v = document.createElement('div')
      v.id = 'rf-demo-vignette'
      document.body.appendChild(v)
    })
    const look = async (to, ms) => {
      const steps = Math.round(ms / 33)
      const from = await page.evaluate(() => window.rfHeadPose ?? { yaw: 0, pitch: 0 })
      for (let i = 1; i <= steps; i++) {
        const t = i / steps
        const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
        const mix = (k, d) => (from[k] ?? d) + ((to[k] ?? d) - (from[k] ?? d)) * e
        await pose({ head: { yaw: mix('yaw', 0), pitch: mix('pitch', 0), y: mix('y', 1.6), z: mix('z', 0) } })
        await h.wait(ms / steps)
      }
    }
    await h.caption('02', 'The city sits on the floor in front of you')
    await look({ yaw: 0, pitch: -0.7, y: 1.4, z: -0.2 }, 1500)
    await h.wait(400)
    await look({ yaw: 0.3, pitch: -0.62, y: 1.4, z: -0.2 }, 900)
    await look({ yaw: -0.08, pitch: -0.72, y: 1.4, z: -0.2 }, 1100)
    await h.caption('03', 'Reach in and grab a building')
    const route = await page.evaluate(async () => (await import('/src/nav/navigation.ts')).remainingRoute())
    const target = route[Math.floor(route.length * 0.5)] ?? [0, 0]
    // The building nearest the middle of the route that isn't already on it.
    const buildings = (await h.world()).objects.filter((o) => o.kind === 'building')
    const dist = (o) => Math.hypot(o.position[0] - target[0], o.position[2] - target[1])
    const pick = buildings.filter((o) => dist(o) > 8).sort((a, b) => dist(a) - dist(b))[0]
    const lift = Math.min(pick.size[1] / 2, 4)
    await vrMove(page, h, { map: [pick.position[0], pick.position[2]], y: lift, ms: 1000 })
    await page.evaluate(() => window.rfHeadset.controllers.right.updateButtonValue('squeeze', 1))
    await h.wait(300)
    await h.caption('04', 'Set it down across the robot’s path')
    await vrMove(page, h, { map: target, y: lift, ms: 1500 })
    await page.evaluate(() => window.rfHeadset.controllers.right.updateButtonValue('squeeze', 0))
    await h.wait(300)
    await vrMove(page, h, { rest: true, ms: 700 })
    await h.caption('05', 'The robot replans around it')
    await h.wait(3200)
    await stop('vr')
    await context.close()
  },
}

/** Page side: set the emulated head (yaw/pitch, radians) and park the controllers. */
function vrPose({ head, hands }) {
  const d = window.rfHeadset
  if (head) {
    window.rfHeadPose = head
    const { yaw, pitch } = head
    // q = yaw(Y) * pitch(X)
    const cy = Math.cos(yaw / 2), sy = Math.sin(yaw / 2), cp = Math.cos(pitch / 2), sp = Math.sin(pitch / 2)
    d.quaternion.set(cy * sp, sy * cp, -sy * sp, cy * cp)
    d.position.set(0, head.y ?? 1.6, head.z ?? 0)
  }
  if (hands === 'rest') {
    // Left hand down at your side, so the wrist menu stays closed and out of the shot.
    d.controllers.left.position.set(-0.32, 0.75, -0.05)
    d.controllers.right.position.set(0.22, 1.12, -0.32)
    d.controllers.left.quaternion.set(-0.3, 0, 0, 0.954)
    d.controllers.right.quaternion.set(-0.3, 0, 0, 0.954)
  }
}

/** Glide the right controller to a map point (on the ground) or back to rest. */
async function vrMove(page, h, { map, y = 0.4, rest, ms }) {
  const target = await page.evaluate(
    async ({ map, y, rest }) => {
      if (rest) return [0.22, 1.12, -0.32]
      const st = await window.rfStore()
      const root = window.rfRoot(st.scene)
      const v = root.localToWorld(new root.position.constructor(map[0], y, map[1]))
      return [v.x, v.y, v.z]
    },
    { map, y, rest },
  )
  const from = await page.evaluate(() => window.rfHeadset.controllers.right.position.toArray?.() ?? [
    window.rfHeadset.controllers.right.position.x, window.rfHeadset.controllers.right.position.y, window.rfHeadset.controllers.right.position.z,
  ])
  const steps = Math.max(4, Math.round(ms / 33))
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
    const p = from.map((f, k) => f + (target[k] - f) * e)
    await page.evaluate((p) => window.rfHeadset.controllers.right.position.set(p[0], p[1], p[2]), p)
    await h.wait(ms / steps)
  }
}

// ---------------------------------------------------------------- main

const names = process.argv.slice(2).filter((a) => !a.startsWith('-'))
const run = names.length ? names : Object.keys(CLIPS)
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
try {
  for (const name of run) {
    if (!CLIPS[name]) throw new Error(`Unknown clip "${name}". Clips: ${Object.keys(CLIPS).join(', ')}`)
    console.log(`Recording ${name}…`)
    await CLIPS[name](browser)
  }
} finally {
  await browser.close()
  await api?.dispose()
}
