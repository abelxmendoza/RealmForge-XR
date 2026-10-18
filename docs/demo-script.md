# Demo script — RealmForge XR

Timed walkthrough for the MOLTEN / Worldbuild demo. Desktop first; Quest when ready.
Fresh tunnel each session — do not reuse stale cloudflared URLs.

## Prep (5 min before)

1. `npm install` then `npm run dev` (needs `.env.keys` / `DOTENV_PRIVATE_KEY` for live cloud mic).
2. Desktop Chrome/Edge: open the printed LAN or tunnel HTTPS URL.
3. Optional Quest: same URL in Quest Browser; accept the certificate; run Emiliano’s checklist in `docs/demo-readiness.md`.
4. Without a voice key: typed commands and browser speech still work — say so if asked.

## Story arc (~4–5 min)

### 1. Landing (30 s)

- Open `/`. Show RealmForge brand + environment previews.
- Pick **Forge District** (or Job Fair if leading with events) → **Launch editor**.

### 2. Build a miniature (60–90 s)

- HUD sections: **Build** → Place Building, Draw Wall.
- Drop 2–3 buildings and a wall. Mention grab works the same in XR.
- **Plan Routes** → Place Robot, Set Destination — watch the path.
- Press **Block Path** (or voice “block the route”) — robot replans. That’s the hook.

### 3. Environments & save (45 s)

- **Save** → Quick Save, or Environments menu → load **Mars Outpost** / **Warehouse** (confirm replace).
- Or deep-link Job Fair: `/?editor=1&world=job-fair` for booths / stage.

### 4. Voice (30–45 s)

- Bottom mic: “add three trees near the robot” or Type the same.
- Fallback path: typed command if mic/token fails — demo still lands.

### 5. XR (when headset is ready) (~90 s)

- **Enter XR** → **Place World** on a table → scale **1:60 → 1:1** from wrist / View.
- Grab a building; open wrist **Guide** once; exit cleanly.

## One-liners

| If they ask… | Say… |
| --- | --- |
| What is this? | Tabletop world you shape with hands; a robot that re-routes when you move walls. |
| Desktop vs Quest? | Same editor — mouse on laptop, hands on Quest. |
| Persistence? | Worlds library + JSON export; resumes where you left off. |
| Events? | Empty venue → job-fair catalog → single attendee preview. |

## Recovery

| Problem | Fix |
| --- | --- |
| Blank / cert warning | Accept self-signed cert; hard-refresh; confirm `npm run dev` is up |
| Mic fails | Type a command; or browser speech on Chrome/Edge |
| Robot stuck | Set Destination again, or Block Path / move the wall |
| XR won’t start | Emphasize desktop path; Emiliano owns Quest PASS/FAIL |

## After the demo

Point judges at `docs/controls-guide.md` and `docs/demo-readiness.md`. Hardware results go on Emiliano’s checklist — do not invent PASS/FAIL.
