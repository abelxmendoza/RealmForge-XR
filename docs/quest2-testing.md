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

`npm run dev` goes through dotenvx. Without Abel's `.env.keys` it prints
`[DECRYPTION_FAILED] could not decrypt …` and still starts; only the encrypted secrets are missing,
and nothing in the editor needs them yet. On Windows PowerShell, use `npm.cmd` if script execution is disabled.

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

- `/` is the project landing page. Choose **Launch editor**, or open `/?editor=1`, for **Enter AR** / **Enter VR**.
- `/xr-test/` is the standalone passthrough test described below.

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

## Hand grab in the RealmForge app (`/`)

Open `/?editor=1` (not `/xr-test/`), press **Enter AR**, and keep the **Select** tool on. No rays should appear
from your hands or controllers. Gestures are listed in the README under *Hand grab in XR*.

- [ ] No pointer rays from hands or controllers
- [ ] Pinch or fist on a building picks it up (it gets the selection outline) and it follows your hand
- [ ] Object stays on the ground and inside the map while held
- [ ] Twisting your wrist turns it; with snap on (G) it steps in 15°
- [ ] With snap on, position steps along the grid; with snap off it moves freely
- [ ] Second hand on the same object: pulling apart and together scales it uniformly; sizes step with snap on
- [ ] One-hand grab never changes the object's size
- [ ] Robot replans while you move a wall across its route
- [ ] Fingertip poke still hits the green, purple and red buttons and places objects with the other tools
- [ ] Controller: squeeze the grip while touching an object grabs it the same way
- [ ] Small objects (trees, crates) are still grabbable
- [ ] Grabbing the dark table edge moves the whole map; lower it to a comfortable height (or onto a real table)
- [ ] Two hands on the table edge turn the map; it stays level
- [ ] After moving the map, grabbing buildings and placing objects still lands where you touch

## Life size, scale presets, wrist menu and rays

- [ ] Turning the left palm toward your face shows the wrist menu; turning it away hides it
- [ ] Right index finger pokes the wrist buttons (each press toggles once)
- [ ] **Rays on** shows pointer rays live and they can drag objects; **Rays off** removes them; grabbing works in both
- [ ] **1:60** tabletop board in front of you; buildings show storey rows and doors at scale
- [ ] **1:20** world on your floor ahead of you, no table edge
- [ ] **1:4** world on your floor with the robot start about 1.5 m ahead
- [ ] **1:1** life size: stand next to the robot; a house door is about 2.1 m, an office door 2.4 m
- [ ] Grabbing buildings works at every scale; handles and buttons stay pokeable
- [ ] Shadows stay on the world after changing scale and after grabbing the map
- [ ] **Recenter** brings the world back in front of you
- [ ] **Real** surface: your real floor shows through the grid at 1:20, 1:4 and 1:1 (0.5 m and 5 m lines, orange map edge, 1 m origin cross)
- [ ] Buildings and the robot still cast shadows onto your real floor
- [ ] At 1:60 the city sits on your real table, visible through the middle of the board frame
- [ ] With rays on, pointing at the floor with the Building tool places a building; grabbing it works
- [ ] Wrist **Real / Virtual** button (and V on desktop) switches to the solid placeholder ground and back
- [ ] Holds a usable frame rate at 1:1 with Forge District loaded (panel or feel)

## Gestures (Quest 3S recommended)

See docs/gestures.md for the poses.

- [ ] Walk past your old play area without the app pausing; the dev log's "AR session started" line shows `referenceSpace: 'unbounded'`
- [ ] L with your right hand pointed along a real wall: an arrow grows along your finger, then the grid and aisles turn to match
- [ ] Both fists, pull toward you: the world slides past at true scale; twist the fists and it turns
- [ ] Frame a few pallets with both hands: white preview, then a cyan group; the wrist shows Duplicate / Delete / Clear
- [ ] Pinch a distant rack and roll your wrist: it turns, in 15° steps with snap on (flip `ROLL_GAIN` if reversed)
- [ ] Pinch-roll on a grouped object turns the whole group about its centre
- [ ] Near grab still works, and gestures don't fire while you're grabbing or using the wrist menu
- [ ] Wrist **Gestures off** disables all of the above
- [ ] Each gesture edit is one Undo
- [ ] Controllers: left stick moves you, right stick snap-turns, both grips pull the world
- [ ] Controllers: hold A aiming along a wall sets the axis; both triggers frame-select; right trigger on a distant rack + twist (or stick flicks) rotates it
- [ ] Controllers: grip on an object still near-grabs it; grip on a wrist button presses it

## Smartsuit mock skeleton

On the PC run `npm run mocap:mock` (alongside the dev server), then press **Mocap** on the wrist menu.

- [ ] Wrist button reads **Mocap live**
- [ ] A skeleton walks a 1 m circle around where the XR session started
- [ ] Works through the cloudflared tunnel (`wss://…/mocap` is proxied by the dev server)

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
