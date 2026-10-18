# Demo readiness — presentation build

Assessment: **desktop + Quest XR finishing touches are on this branch / headed to `main`**.

## What’s included

| Area | Status |
| --- | --- |
| Six-section toolbar (Build → Save), Select-over-spawn | Shipped |
| Multi-waypoint robot routes (Play / Pause / Stop) | Shipped |
| Actor multi-stop planned routes | Shipped |
| Quest XR: occlusion, real surfaces, spatial save, room scan, floor snap | Shipped |
| Movable XR control palette + wrist Menu → palette | Shipped |
| Worlds library, environments, voice (AssemblyAI + laptop Web Speech) | Shipped |
| Demo script | See `docs/demo-script.md` |

## Automated validation

| Check | Result |
| --- | --- |
| `npm test` | Run before present |
| `npm run build` | Run before present |

## Live demo checklist

1. Landing → Enter warehouse / job fair
2. **Build** a wall + building; click object to **Select** and drag
3. **Plan Routes** → Add Waypoint ×3 → **Play** → **Pause** → **Resume**
4. **Enter XR** on Quest → wrist menu → Menu (palette) → Plan Routes
5. Voice: “save world” / place object (mic needs keys or Web Speech)
6. Block Path demo, then Clear Route

## Notes

- Prefer `npm run dev` + HTTPS / tunnel for Quest
- AssemblyAI live mic needs `.env.keys`; Web Speech works on Chromium without it
- Physical headset PASS/FAIL still owned by the Quest operator
