# Quest 2 testing

We develop and test on a **Quest 2** first, then move to the **Quest 3S** for the demo. WebXR is just a
web page, so nothing gets ported: the same URL runs on both headsets. This doc covers getting the dev
server onto a Quest 2, the standalone passthrough test page, and what to expect from each headset.

## Quest 2 vs Quest 3S

| Feature | Quest 2 | Quest 3S | Effect on us |
| --- | --- | --- | --- |
| `immersive-ar` passthrough | Grayscale, low resolution | Full colour | Logic tests carry over; judge visuals on the 3S |
| Hand tracking | Yes | Yes (better) | Pointer events behave the same |
| Controllers | Touch | Touch Plus | Same buttons and events |
| `hit-test`, `anchors` | Yes | Yes | Carry over |
| `plane-detection` | Yes, room drawn **manually** in Space Setup | Yes, automatic scan | Same code; Quest 2 room data is only as accurate as what you drew |
| `mesh-detection` | No | Yes | Mesh snapping is 3S-only |
| `depth-sensing` (occlusion) | No | Yes | Occlusion is 3S-only |
| Performance | XR2 Gen 1 | XR2 Gen 2 | If it holds 72 fps on the Quest 2, the 3S has headroom |

Room data and anchors are per headset. After switching to the 3S, run Space Setup there and expect
previously placed anchors not to load.

## One-time headset setup

1. Update Horizon OS (Settings → System → Software Update) and the Quest Browser.
2. Turn on hand tracking (Settings → Movement Tracking → Hand Tracking).
3. Run **Space Setup** (Settings → Physical Space → Space Setup). On the Quest 2 this is manual:
   trace the walls, mark the floor, and **add the table you'll test on** as a box matching its
   height and edges. Snapping uses exactly these boxes.
4. Use a well-lit room; tracking drifts in dim light.

For the USB route you also need **Developer Mode**: create a free developer organization at
developer.meta.com, then in the Meta Horizon phone app go to Devices → your headset → Headset
settings → Developer Mode.

## Getting the dev server onto the headset

```bash
npm install
npm run dev
```

The dev server is HTTPS (self-signed, via `@vitejs/plugin-basic-ssl`) on port 5173. Choose one:

- **USB with adb (recommended).** Install Meta Quest Developer Hub, or Android platform-tools plus
  the Oculus ADB driver. Plug the headset in, accept *Allow USB debugging* inside the headset, then:

  ```bash
  adb reverse tcp:5173 tcp:5173
  ```

  Open `https://localhost:5173` in the Quest Browser and accept the certificate warning.
  Re-run `adb reverse` after unplugging.
- **Same Wi-Fi.** Open `https://<laptop-LAN-IP>:5173` and accept the certificate warning.
  Vite prints the LAN address when it starts. Guest and venue networks often block device-to-device
  traffic, so if the headset says the site is unreachable, use a tunnel instead.
- **Tunnel (any network, no Developer Mode).** Install `cloudflared` (`winget install Cloudflare.cloudflared`),
  keep `npm run dev` running, then:

  ```bash
  cloudflared tunnel --url https://localhost:5173 --no-tls-verify
  ```

  Open the `https://<random>.trycloudflare.com` address it prints. It has a real certificate, so there's
  no warning. `vite.config.ts` allows `*.trycloudflare.com` hosts for this. The address is public while
  the tunnel runs and changes on every restart; stop it with Ctrl+C when you're done.

Pages:

- `/` is RealmForge XR (**Enter AR** / **Enter VR** / **Place city**).
- `/xr-test/` is the standalone passthrough test described below.

## Main app smoke (`/`)

The product page uses the same AR fallback chain as `/xr-test/` (`src/xr/session.ts`:
`full (with depth)` → `no depth` → `minimal`). After Enter AR, pin the miniature city onto a
Space Setup table with **Place city** (or key `P`).

### Checklist — RealmForge on Quest 2

- [ ] Open `/` (not only `/xr-test/`) over USB, LAN, or tunnel
- [ ] **Enter AR** starts passthrough (HUD shows `AR no depth` or similar — depth may fail, that is OK)
- [ ] Status line lists features that include `plane-detection` and preferably `anchors` / `hand-tracking`
- [ ] **Place city** highlights planes (table orange, floor green); walls are ignored for pinning
- [ ] Point + trigger/pinch on the table pins the miniature; status shows `on table` (or `on floor`)
- [ ] City stays put while you walk (anchor when granted; otherwise last pose)
- [ ] Tools still work: draw a wall, set goal, place robot, watch a path
- [ ] **B Block route** forces a replan
- [ ] **Unpin** restores the default floating pose; **Cancel place** exits choose mode
- [ ] Holds usable framerate (~72 fps feel)

Then on Quest 3S:

- [ ] Enter AR may report `full (with depth)`
- [ ] Same Place city → edit → robot flow with colour passthrough

If Enter AR fails, the HUD shows which attempt errored. Fall back to `/xr-test/` to isolate headset
vs app issues, then return here.

## The passthrough test page (`/xr-test/`)

`xr-test/` is a small standalone three.js page, separate from the React app, that checks the
headset's mixed-reality features in isolation. It asks for every feature as optional and falls
back in steps (`full (with depth)` → `no depth` → `minimal`), so it starts on both headsets and
reports what each one actually granted.

It spawns four true-scale objects (1 unit = 1 m): a 10 cm cube, an 8 × 10 cm mug, a 24 × 17 × 3 cm
book and a 1 m reference cube. A floating panel shows enabled features, plane/mesh counts, fps, and
the live measured size and scale of the held object.

| Input | Action |
| --- | --- |
| Point + trigger, or pinch | Grab |
| Move near a real surface | Green ghost shows the snap target (in at 5 cm, out at 8 cm) |
| Release | Snap, square up to the surface edges (within 12°), and anchor |
| Grip | Respawn objects in front of you |

### Checklist

Expected results on the Quest 2:

- [ ] Panel shows **✔ plane-detection, ✔ anchors, ✔ hand-tracking**
- [ ] Panel shows **✘ mesh-detection, ✘ depth-sensing** (expected; the fallback path works)
- [ ] Coloured outlines line up with the walls, floor and table from Space Setup
- [ ] Held 10 cm cube reads ~10.0 cm per side and `scale 1.000`, and doesn't change while moving
- [ ] 1 m reference cube matches a tape measure
- [ ] Ghost appears near the table; release snaps flat onto it and squares to its edge
- [ ] Ghost doesn't flicker at the snap distance
- [ ] Wall snap sits flush against the wall
- [ ] Placed objects stay put while walking around (anchors)
- [ ] Hands: pinch grab and release work the same as the trigger
- [ ] Holds ~72 fps (panel)

Then on the Quest 3S, also check:

- [ ] Panel shows **✔ mesh-detection** and **✔ depth-sensing** (session `full (with depth)`)
- [ ] Objects snap onto the scanned room mesh (snap label `mesh:…`)
- [ ] Real hands and furniture hide virtual objects behind them (depth occlusion)

## Debugging

With USB connected, open `chrome://inspect/#devices` in desktop Chrome and click **inspect** next to
the Quest Browser tab for a live console. The test page logs which session attempt succeeded and the
enabled features (`[MR] session started: …`).

| Problem | Fix |
| --- | --- |
| `adb devices` shows nothing / `unauthorized` | Use a data cable, install the Oculus ADB driver, accept the prompt in the headset |
| "Site can't be reached" over Wi-Fi | Network isolates devices (common on guest Wi-Fi); use the tunnel |
| No ADB interface even with a data cable | Developer Mode isn't on yet; use Wi-Fi or the tunnel meanwhile |
| No **Enter AR**, or "not supported" | Page must be `https://` or `localhost` |
| No outlines, nothing snaps | Redo Space Setup with a table, and allow spatial-data access when prompted |
| Page won't load after unplugging | Re-run `adb reverse tcp:5173 tcp:5173` |
