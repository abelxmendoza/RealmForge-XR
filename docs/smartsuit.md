# Smartsuit Pro (Rokoko) live skeleton

Scaffolding that streams a Rokoko Smartsuit Pro into RealmForge and draws a debug skeleton, at 1:1 in
your room or inside the world (scaled with it). It runs without a suit too: a mock mode sends a
synthetic walking skeleton.

> **Status:** tested end to end with the mock (bridge → Vite proxy → tunnel → browser). It has
> **not** been run with a real suit yet. Joint names follow Rokoko's JSON v3 body schema, and the axis
> conversion is a best guess. Both are isolated in `src/mocap/rokoko.ts` so they're quick to adjust.

## How the data flows

```
Smartsuit Pro ──► Rokoko Studio ──UDP 14043 (JSON v3)──► tools/mocap-bridge.ts ──ws :14044/mocap──►
  Vite dev server (proxies /mocap) ──wss://<host>/mocap──► browser / Quest ──► MocapSkeleton
```

Browsers can't receive UDP, so the bridge relays each frame over WebSocket. Because Vite proxies
`/mocap`, the headset uses the same address as the app: LAN, `adb reverse` or the cloudflared tunnel
all work with no extra setup.

## Try it without a suit

```bash
npm run dev          # terminal 1
npm run mocap:mock   # terminal 2: synthetic skeleton at 60 fps
```

Open the app and press **Mocap** in the HUD, or in XR use the **Mocap** button on the wrist menu. The
status line shows `mocap live 60 fps`, and a skeleton walks a 1 m circle around the spot where your
XR session started.

## With the suit

1. **Rokoko Studio** (on any PC on the same network as the laptop running the bridge):
   - Livestream → add a **Custom** target
   - Data format **JSON v3**, compression **off**
   - Target IP: the bridge laptop's IP; port **14043**
   - Start streaming
2. On the bridge laptop:

   ```bash
   npm run dev
   npm run mocap:bridge     # logs "waiting for Rokoko Studio on UDP 14043", then the fps
   ```

3. In the app, press **Mocap**. The bridge logs `client connected` and its fps.

If Studio runs on the same laptop, use target IP `127.0.0.1`.

## Settings

| What | Where |
| --- | --- |
| UDP port (from Studio) | `MOCAP_UDP_PORT` env var for the bridge (default 14043) |
| WebSocket port | `MOCAP_WS_PORT` (default 14044); also update the `/mocap` proxy in `vite.config.ts` |
| Bridge on another machine | `VITE_MOCAP_URL=wss://host/mocap` (for example via `npm run env:set`) |
| Room vs world placement | `useMocap.getState().set({ placement: 'map' })` draws the skeleton inside the world at the robot start, scaled with it. The default `'room'` is 1:1 in your room |
| Axes (if mirrored or facing backwards) | `MIRROR_Z` / `toSceneSpace()` in `src/mocap/rokoko.ts` |

## Code map

```
tools/mocap-bridge.ts       UDP → WebSocket relay; --mock sends synthetic frames (Node runs the .ts directly)
src/mocap/rokoko.ts         JSON v3 types, JOINTS/BONES, parseRokokoFrame(), toSceneSpace()
src/mocap/mock.ts           synthetic walking actor (shared by the bridge and the tests)
src/mocap/store.ts          connection state for the UI; latest frame in mocapFrame (not React state)
src/mocap/client.ts         WebSocket client with reconnect backoff, fps and stall detection
src/mocap/MocapSkeleton.tsx joint spheres + bone sticks, updated every render frame
src/mocap/rokoko.test.ts    parser, mock round trip, malformed data, axis conversion
```

## Troubleshooting

| Problem | Fix |
| --- | --- |
| Status stays `connecting` | The bridge isn't running, or no frames are arriving. Check the bridge terminal |
| Status `error` | The app can't reach `/mocap`. Is `npm run dev` running with the proxy? |
| Bridge says "non-JSON data" | In Studio, choose JSON v3 and turn compression off |
| Bridge gets nothing from Studio | Windows Firewall: allow Node.js for UDP 14043 on that network; check the target IP |
| Skeleton mirrored or facing backwards | Flip `MIRROR_Z` or adjust `toSceneSpace()` |
| Skeleton offset in the room | Rokoko's origin maps to where the XR session started; recalibrate in Studio or add an offset in `Scene.tsx` |

## Next steps to build on

- Replace the debug skeleton with a rigged avatar and retarget joint rotations (`Joint.rotation` is
  already in scene space).
- Use hands and feet as interaction points: push or grab objects, and add the actor to navigation as a
  moving obstacle so the robot avoids the person.
- Add props and fingers (Studio sends them; the parser currently ignores them).
