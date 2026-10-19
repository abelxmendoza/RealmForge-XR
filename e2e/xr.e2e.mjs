/**
 * Simulated-headset tests: the real editor in Chromium with Meta's WebXR emulator (IWER, a Quest 3 with
 * Touch Plus controllers). Each test enters VR, aims the right controller's ray at palette buttons by id
 * and pulls the trigger, exactly as a person would, then checks app state and that nothing threw.
 *
 *   npm run test:xr                 run everything (builds the app and serves it itself)
 *   npm run test:xr -- back         only tests whose name contains "back"
 *
 * Screenshots of each test's last frame land in e2e/artifacts/ (gitignored).
 * Needs Chromium: set CHROMIUM_PATH, or `npx playwright install chromium`.
 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build, preview } from 'vite'
import { chromium } from 'playwright-core'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const artifacts = join(root, 'e2e', 'artifacts')
mkdirSync(artifacts, { recursive: true })
const only = process.argv.slice(2).join(' ').toLowerCase()

// ---------------------------------------------------------------- harness

// Test the production bundle (what the Quest loads), built with the emulator hooks switched on.
// A built bundle also can't hot-reload or re-optimize mid-test like the dev server does.
const outDir = join(root, 'e2e', '.dist')
process.env.VITE_XR_EMULATOR = '1'
await build({ root, logLevel: 'warn', build: { outDir, emptyOutDir: true } })
const server = await preview({ root, logLevel: 'error', build: { outDir }, preview: { port: 0, host: '127.0.0.1' } })
const base = server.resolvedUrls.local[0]
const executablePath = process.env.CHROMIUM_PATH ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined)
const browser = await chromium.launch({
  executablePath,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})

/** Messages that mean something broke (CDN fetches, uncaught errors, React errors). */
// The preview server's self-signed certificate blocks the service worker; that's the test setup, not the app.
const isProblem = (text) =>
  /error|failed to fetch|uncaught|multiple instances of three/i.test(text) &&
  !/favicon|AssemblyAI|token|SpeechRecognition|microphone|SSL certificate error|ServiceWorker|Service worker/i.test(text)

async function openEditor(world = 'forge-district') {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, ignoreHTTPSErrors: true })
  const problems = []
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
  page.on('requestfailed', (r) => problems.push(`request failed: ${r.url()}`))
  if (process.env.DEBUG_XR) page.on('console', (m) => console.log('  [console]', m.type(), m.text().slice(0, 300)))
  page.on('console', (m) => {
    if ((m.type() === 'error' || m.type() === 'warning') && isProblem(m.text())) problems.push(`${m.type()}: ${m.text()}`)
  })
  await page.goto(`${base}?editor=1&world=${world}&iwer`, { waitUntil: 'load' })
  await page.waitForFunction(() => window.__r3f && window.__rf, null, { timeout: 30_000 })
  return { page, problems }
}

async function enterVR(page) {
  await page.getByRole('button', { name: 'VR', exact: true }).click()
  await page.waitForFunction(() => window.__xrDevice?.activeSession && window.__r3f.gl.xr.isPresenting, null, { timeout: 15_000 })
  // Left controller upside down at your side, so the wrist menu (top toward your face) stays hidden.
  await remote(page, 'set_transform', { device: 'controller-left', position: { x: -0.3, y: 0.8, z: -0.1 }, orientation: { x: 0, y: 0, z: 1, w: 0 } })
  await frames(page, 30)
}

const remote = (page, method, params) => page.evaluate(([m, p]) => window.__xrDevice.remote.dispatch(m, p), [method, params])

/** Let the XR frame loop run `n` frames. */
const frames = (page, n = 10) =>
  page.evaluate(
    (count) =>
      new Promise((resolve) => {
        const s = window.__xrDevice.activeSession
        if (!s) return resolve()
        let left = count
        const tick = () => (--left <= 0 ? resolve() : s.requestAnimationFrame(tick))
        s.requestAnimationFrame(tick)
        setTimeout(resolve, 4000)
      }),
    n,
  )

/**
 * Point the right controller's ray at control `id` on panel `panel`, wait until the panel reports the ray over it,
 * and pull the trigger. A press that still never reached the panel is aimed and pulled once more (as a person
 * would). A press the panel saw but refused still fails.
 */
async function press(page, id, panel = 'palette') {
  for (let attempt = 1; ; attempt++) {
    const target = await page.evaluate(([p, i]) => window.__rf.controlWorldPoint(p, i), [panel, id])
    assert.ok(target, `"${id}" is not on the ${panel} panel`)
    const [x, y, z] = target
    await remote(page, 'set_transform', { device: 'controller-right', position: { x: 0.15, y: 1.35, z: -0.15 } })
    await remote(page, 'look_at', { device: 'controller-right', target: { x, y, z } })
    // Pull the trigger only once the ray is on the control (the emulator can lag the new aim by a few frames).
    await page
      .waitForFunction(([p, i]) => window.__rf.panelRegistry.get(p)?.hover.includes(i), [panel, id], { timeout: 4000 })
      .catch(() => {})
    const before = await page.evaluate(() => window.__rf.pressLog.length)
    // Hold the trigger 0.6 s (a real pull's length): IWER's default 0.15 s can fit between two frames on a slow
    // machine, so the app never sees it down. IWER's select waits on frames, and a press that ends the session
    // (Exit VR) never gets them, so don't wait forever either.
    await Promise.race([remote(page, 'select', { device: 'controller-right', duration: 0.6 }), page.waitForTimeout(4000)])
    await frames(page, 8)
    const log = await page.evaluate((n) => window.__rf.pressLog.slice(n), before)
    const mine = log.filter((p) => p.panel === panel && p.id === id)
    if (mine.some((p) => p.accepted)) break
    assert.ok(attempt < 2 && !mine.length, `pressing "${id}" on ${panel} did not register: ${JSON.stringify(log)}`)
  }
  await page.waitForTimeout(160) // past the panel's press cooldown, like a person between taps
}

/** Tap Y on the left controller (pins / unpins the wrist menu). IWER's remote numbers buttons
 * trigger, squeeze, thumbstick, X, Y, thumbrest, so Y is 4 here (the app reads xr-standard index 5). */
async function pressY(page) {
  await remote(page, 'set_gamepad_state', { device: 'controller-left', buttons: [{ index: 4, value: 1 }] })
  await frames(page, 4)
  await remote(page, 'set_gamepad_state', { device: 'controller-left', buttons: [{ index: 4, value: 0 }] })
  await frames(page, 6)
}

/** Look at the palette (headset faces it). */
async function lookAtPalette(page) {
  const p = await page.evaluate(() => window.__rf.controlWorldPoint('palette', 'move'))
  if (p) await remote(page, 'look_at', { device: 'headset', target: { x: p[0], y: p[1] - 0.3, z: p[2] } })
  await frames(page, 4)
}

const state = (page, fn) => page.evaluate(fn)
const paletteState = (page) =>
  state(page, () => {
    const s = window.__rf.paletteUI.usePaletteUI.getState()
    return { page: s.stack[s.stack.length - 1], stack: s.stack, hidden: s.hidden, closed: s.closed }
  })

// ---------------------------------------------------------------- tests

const tests = []
const test = (name, fn) => tests.push({ name, fn })

test('enters VR: the world, controllers and palette render with no errors or CDN fetches', async ({ page, problems }) => {
  await enterVR(page)
  const stats = await state(page, async () => {
    const g = window.__r3f.gl
    g.info.autoReset = false
    g.info.reset()
    await new Promise((r) => setTimeout(r, 500))
    const calls = g.info.render.calls
    g.info.autoReset = true
    // A suspended load (a CDN font or model) makes React hide every top-level group, blanking the world.
    let visibleMeshes = 0
    window.__r3f.scene.traverseVisible((o) => (visibleMeshes += o.isMesh ? 1 : 0))
    return { calls, visibleMeshes }
  })
  assert.ok(stats.calls > 50, `expected the scene to draw in VR, got ${stats.calls} draw calls`)
  assert.ok(stats.visibleMeshes > 100, `only ${stats.visibleMeshes} meshes visible: something suspended and hid the world`)
  assert.ok(await state(page, () => !!window.__rf.controlWorldPoint('palette', 'section:build')), 'palette is not showing')
  assert.deepEqual(problems, [])
})

test('section tabs, sub-pages and Back', async ({ page }) => {
  await enterVR(page)
  await lookAtPalette(page)
  await press(page, 'section:edit')
  assert.equal((await paletteState(page)).page, 'edit')
  await press(page, 'section:build')
  await press(page, 'page:assets')
  assert.deepEqual((await paletteState(page)).stack, ['build', 'assets'])
  await press(page, 'back')
  assert.deepEqual((await paletteState(page)).stack, ['build'])
})

test('one trigger pull is one press, even when the page changes under the ray', async ({ page }) => {
  await enterVR(page)
  await lookAtPalette(page)
  await press(page, 'page:assets')
  // "Back" now sits where the ray is; holding the ray there must not press it until a fresh pull.
  await frames(page, 20)
  assert.equal((await paletteState(page)).page, 'assets')
})

test('collapse, expand and close; "show menu" brings it back', async ({ page }) => {
  await enterVR(page)
  await lookAtPalette(page)
  await press(page, 'collapse')
  assert.equal((await paletteState(page)).hidden, true)
  assert.equal(await state(page, () => window.__rf.controlWorldPoint('palette', 'section:build')), null, 'collapsed palette still shows its pages')
  await press(page, 'collapse')
  assert.equal((await paletteState(page)).hidden, false)
  await press(page, 'close')
  assert.equal((await paletteState(page)).closed, true)
  await state(page, () => window.__rf.voice('show menu'))
  await frames(page, 10)
  assert.equal((await paletteState(page)).closed, false)
})

test('voice: go back, open a page, hide and show everything', async ({ page }) => {
  await enterVR(page)
  await state(page, () => window.__rf.voice('open the object catalog'))
  assert.equal((await paletteState(page)).page, 'assets')
  await state(page, () => window.__rf.voice('go back'))
  assert.equal((await paletteState(page)).page, 'build')
  await state(page, () => window.__rf.useGuide.getState().openGuide('start'))
  await state(page, () => window.__rf.voice('hide everything'))
  assert.equal((await paletteState(page)).closed, true)
  assert.equal(await state(page, () => window.__rf.useGuide.getState().open), false)
  await state(page, () => window.__rf.voice('show the menu'))
  assert.equal((await paletteState(page)).closed, false)
})

test('voice: waypoints at named places, then play the route', async ({ page }) => {
  await enterVR(page)
  const r1 = await state(page, () => window.__rf.voice('add a waypoint at the goal'))
  assert.equal(r1.status, 'executed', JSON.stringify(r1))
  const r2 = await state(page, () => window.__rf.voice('add a waypoint 10 meters north of the robot'))
  assert.equal(r2.status, 'executed', JSON.stringify(r2))
  assert.equal(await state(page, () => window.__rf.useRoutePlan.getState().waypoints.length), 2)
  await state(page, () => window.__rf.voice('remove the last waypoint'))
  assert.equal(await state(page, () => window.__rf.useRoutePlan.getState().waypoints.length), 1)
  await state(page, () => window.__rf.voice('start the route'))
  assert.equal(await state(page, () => window.__rf.useRoutePlan.getState().playState), 'playing')
})

test('a confirmation shows in the headset and Confirm answers it', async ({ page }) => {
  await enterVR(page)
  const pending = state(page, () => window.__rf.voice('load mars'))
  await frames(page, 10)
  // A modal desktop <dialog> used to make the page inert and swallow every XR press, so this hung forever.
  assert.equal(await state(page, () => !!document.querySelector('dialog[open]')), false, 'desktop confirm dialog opened during XR')
  assert.ok(await state(page, () => !!window.__rf.controlWorldPoint('palette', 'confirm:yes')), 'confirmation is not on the palette')
  await lookAtPalette(page)
  await press(page, 'confirm:yes')
  const result = await pending
  assert.equal(result.status, 'executed', JSON.stringify(result))
})

test('a confirmation started from a palette button can be answered (palette busy meanwhile)', async ({ page }) => {
  await enterVR(page)
  await lookAtPalette(page)
  await press(page, 'section:save')
  // Replacing a non-empty world asks first; the palette stays busy until it's answered.
  await press(page, 'new:mars-outpost')
  assert.ok(await state(page, () => !!window.__rf.controlWorldPoint('palette', 'confirm:yes')), 'confirmation is not on the palette')
  await press(page, 'confirm:yes')
  await frames(page, 20)
  assert.equal(await state(page, () => !!window.__rf.controlWorldPoint('palette', 'confirm:yes')), false, 'confirmation still pending')
})

test('the guide opened in VR can be paged and closed (no desktop modal swallowing presses)', async ({ page }) => {
  await enterVR(page)
  await lookAtPalette(page)
  await press(page, 'guide')
  await frames(page, 10)
  assert.equal(await state(page, () => window.__rf.useGuide.getState().open), true)
  assert.equal(await state(page, () => !!document.querySelector('dialog[open]')), false, 'desktop guide modal opened during XR')
  await press(page, 'next', 'guide')
  assert.equal(await state(page, () => window.__rf.useGuide.getState().section), 'hands')
  await press(page, 'close', 'guide')
  assert.equal(await state(page, () => window.__rf.useGuide.getState().open), false)
})

test('Exit VR ends the session and returns to the desktop editor', async ({ page, problems }) => {
  await enterVR(page)
  await lookAtPalette(page)
  await press(page, 'exit')
  await page.waitForFunction(() => !window.__xrDevice.activeSession, null, { timeout: 5000 })
  assert.equal(await state(page, () => window.__r3f.gl.xr.isPresenting), false)
  assert.deepEqual(problems, [])
})

/** Put the headset `distance` m straight in front of a panel's centre, looking at it (for close-up shots). */
async function faceup(page, panel, distance = 0.55) {
  const c = await page.evaluate((name) => {
    const p = window.__rf.panelCenter(name)
    return p && { ...p }
  }, panel)
  assert.ok(c, `${panel} panel is not showing`)
  await remote(page, 'set_transform', { device: 'headset', position: { x: c.x + c.nx * distance, y: c.y + c.ny * distance, z: c.z + c.nz * distance } })
  await remote(page, 'look_at', { device: 'headset', target: { x: c.x, y: c.y, z: c.z } })
  await frames(page, 10)
}

test('visual: palette, wrist menu and guide close up', async ({ page, problems }) => {
  await enterVR(page)
  // Only what the headset shows: the desktop HUD and dialogs are DOM, invisible in a real headset.
  await page.addStyleTag({ content: '#root > *:not(:has(canvas)) { display: none !important }' })
  await faceup(page, 'palette')
  await page.screenshot({ path: join(artifacts, 'visual-palette.png') })
  await state(page, () => window.__rf.useGuide.getState().openGuide('start'))
  await frames(page, 10)
  await faceup(page, 'guide')
  await page.screenshot({ path: join(artifacts, 'visual-guide.png') })
  // Left controller held in front of you: Y pins the wrist menu open.
  await remote(page, 'set_transform', { device: 'headset', position: { x: 0, y: 1.6, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } })
  await remote(page, 'set_transform', { device: 'controller-left', position: { x: -0.05, y: 1.3, z: -0.3 }, orientation: { x: 0, y: 0, z: 0, w: 1 } })
  await pressY(page)
  assert.ok(await state(page, () => !!window.__rf.controlWorldPoint('wrist', 'menu')), 'wrist menu is not showing')
  await faceup(page, 'wrist', 0.3)
  await page.screenshot({ path: join(artifacts, 'visual-wrist.png') })
  assert.deepEqual(problems, [])
})

test('wrist menu: hidden in a normal controller hold, Y pins it, and its Back and Menu work', async ({ page }) => {
  await enterVR(page)
  const wristShowing = () => state(page, () => !!window.__rf.controlWorldPoint('wrist', 'menu'))
  // Held forward at waist height, like when pointing at things: no menu in the way.
  await remote(page, 'set_transform', { device: 'controller-left', position: { x: -0.2, y: 1.0, z: -0.3 }, orientation: { x: 0, y: 0, z: 0, w: 1 } })
  await frames(page, 6)
  assert.equal(await wristShowing(), false, 'wrist menu pops up during a normal controller hold')
  await pressY(page)
  assert.equal(await wristShowing(), true, 'Y does not pin the wrist menu')
  await state(page, () => window.__rf.voice('open the object catalog'))
  await press(page, 'back', 'wrist')
  assert.equal((await paletteState(page)).page, 'build')
  await press(page, 'menu', 'wrist')
  await press(page, 'menu', 'wrist')
  assert.equal((await paletteState(page)).closed, false, 'Menu twice should close then bring back the palette')
  await pressY(page)
  assert.equal(await wristShowing(), false, 'Y again does not unpin the wrist menu')
})

// ---------------------------------------------------------------- runner

let failed = 0
for (const t of tests) {
  if (only && !t.name.toLowerCase().includes(only)) continue
  const ctx = await openEditor()
  const started = Date.now()
  let timer
  try {
    // A stuck test fails on its own instead of hanging the whole run.
    await Promise.race([t.fn(ctx), new Promise((_, reject) => (timer = setTimeout(() => reject(new Error('timed out after 120 s')), 120_000)))])
    console.log(`✓ ${t.name} (${Date.now() - started} ms)`)
  } catch (error) {
    failed++
    console.log(`✗ ${t.name}\n    ${String(error?.stack ?? error).split('\n').slice(0, 4).join('\n    ')}`)
    if (ctx.problems.length) console.log(`    console: ${ctx.problems.slice(0, 5).join('\n             ')}`)
  } finally {
    clearTimeout(timer)
    await ctx.page.screenshot({ path: join(artifacts, `${t.name.replace(/[^a-z0-9]+/gi, '-').slice(0, 60)}.png`) }).catch(() => {})
    await ctx.page.close()
  }
}
await browser.close()
await server.close()
console.log(failed ? `\n${failed} failed` : '\nall passed')
process.exit(failed ? 1 : 0)
