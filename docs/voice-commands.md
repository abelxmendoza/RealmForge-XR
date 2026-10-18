# Voice Commands (AssemblyAI)

Agent 4 — speech recognition and spoken world actions for RealmForge XR.

**Branch:** `cursor/assemblyai-voice-commands-96f4`

## Architecture

```
USER SPEECH
    │
    ▼
MICROPHONE CAPTURE          (push-to-talk)
    │
    ▼
ASSEMBLYAI STREAMING STT    (temp token via /api/assemblyai/token)
    │
    ▼
FINAL TRANSCRIPT            (partials ignored)
    │
    ▼
commandParser.ts            (deterministic, no LLM)
    │
    ▼
commandExecutor.ts          (confirm gate → worldActions)
    │
    ▼
src/world/actions.ts        (Agent 2 World Action API)
    │
    ▼
Zustand world / environment / history / nav
```

Mock path (no credentials / no mic):

```
submitMockTranscript("Load Mars Outpost")
    → same parser + executor
```

| Module | Role |
| --- | --- |
| `src/voice/types.ts` | `VoiceCommand`, confirm + event types |
| `src/voice/commandParser.ts` | Phrase → typed command |
| `src/voice/commandExecutor.ts` | Execute via `worldActions` |
| `src/voice/assemblyAIClient.ts` | Browser mic + WebSocket STT |
| `src/voice/voiceController.ts` | Push-to-talk lifecycle |
| `src/voice/useVoiceCommands.ts` | React / XR hook |
| `src/voice/mockProvider.ts` | Manual transcript injection |
| `src/voice/events.ts` | ElevenLabs-compatible event bus |
| `vite/assemblyaiTokenPlugin.ts` | Server-side temp token proxy |

Voice **does not** own a second world store. All mutations go through Agent 2’s `worldActions`.

## AssemblyAI setup

1. Create an AssemblyAI account and API key.
2. Store the key **server-side only** with dotenvx:

   ```bash
   npm run env:set -- ASSEMBLYAI_API_KEY <your-key>
   ```

3. Run the app with dotenvx (already wired):

   ```bash
   npm run dev
   ```

4. The Vite plugin exposes `GET /api/assemblyai/token`, which calls  
   `https://streaming.assemblyai.com/v3/token?expires_in_seconds=60`  
   with `Authorization: <ASSEMBLYAI_API_KEY>` and returns `{ token }` to the browser.

5. The browser opens  
   `wss://streaming.assemblyai.com/v3/ws?sample_rate=16000&formatted_finals=true&token=...`

### Secret management

| Do | Don’t |
| --- | --- |
| `ASSEMBLYAI_API_KEY` in encrypted `.env` (server) | `VITE_ASSEMBLYAI_API_KEY` |
| Issue temporary tokens via `/api/assemblyai/token` | Ship the permanent key in JS |
| Keep `.env.keys` gitignored | Commit plaintext keys |

Encrypted dotenvx does **not** make a `VITE_*` key safe for the browser.

## Supported commands

| Spoken example | Command | Action |
| --- | --- | --- |
| “Load Mars” / “Open Mars Outpost” | `LOAD_ENVIRONMENT` | `worldActions.loadEnvironment('mars-outpost')` |
| “Switch to warehouse” | `LOAD_ENVIRONMENT` | `warehouse` |
| “Load Forge District” | `LOAD_ENVIRONMENT` | `forge-district` |
| “Create a blank world” | `RESET_WORLD` | Empty snapshot (confirm required) |
| “Select building tool” / “Building tool” | `SELECT_TOOL` | Activates `building` tool |
| “Select wall tool” / “Draw a wall” | `SELECT_TOOL` | `wall` |
| “Select road tool” / “Platform tool” | `SELECT_TOOL` | `platform` |
| “Select robot” / “Place robot” | `SELECT_TOOL` | `robot` |
| “Set destination” | `SELECT_TOOL` | `goal` (goal-placement mode) |
| “Start navigation” | `START_NAVIGATION` | Replans if a goal exists |
| “Undo” / “Redo” | `UNDO` / `REDO` | History API |
| “Save world” | `SAVE_WORLD` | `quickSave` / `saveWorld` |
| “Reset selection” | `CLEAR_SELECTION` | Clears selection |
| “Delete it” / “Remove that” / “Get rid of this” / “Delete” | `DELETE_SELECTED` | Deletes the selection or framed group at once (one undo step; say “undo” to restore) |
| “Delete them” / “Remove those” | `DELETE_SELECTED` (`which: 'last'`) | Deletes everything the last add/duplicate made |

### Making and moving objects

Parsed by `src/voice/objectCommands.ts`, executed through `src/world/spawn.ts` (store actions only, so navigation replans and each command is one undo step).

| Spoken example | Command | Action |
| --- | --- | --- |
| “Add three trees near the robot” | `SPAWN_OBJECTS` | 3 trees on free ground around the robot start |
| “Build two tall glass towers 20 meters north of the goal” | `SPAWN_OBJECTS` | Count, style, size, landmark + direction + distance |
| “Create a building” / “Place a brick wall in the center” | `SPAWN_OBJECTS` | One object (count defaults to 1) |
| “Put four storage racks” / “Add a charging pad” | `SPAWN_OBJECTS` | Catalog items by name |
| “Move them 10 meters left” / “Move it to the goal” | `MOVE_OBJECTS` | By direction + metres, or next to robot / goal / center |
| “Rotate it 45 degrees” / “Turn them right” | `ROTATE_OBJECTS` | Default 90°, right = clockwise |
| “Make it bigger / smaller / taller / shorter / twice as big” | `RESIZE_OBJECTS` | Scales size |
| “Duplicate it 3 times” | `DUPLICATE_OBJECTS` | Copies on free ground around it |

- **Counts:** digits or words, “a couple”, “a dozen”; capped at 25. “to/too/for” before a noun are heard as 2/4.
- **Objects:** tree, pine tree, streetlight, crate, metal crate, house, office, tower/skyscraper, factory/warehouse, brick/glass/wood/metal wall, road, park, platform, and every catalog asset.
- **Places:** near / by / next to / in / at the robot, goal, center, or “here” (selected object); north/south/east/west, left/right/forward/back; “N meters”.
- **“it”** = selected object (else the last one added); **“them”** = everything from the last add/duplicate.
- **Delete** takes only pronouns or “selected”: “delete the tree” is not guessed at. It never asks to confirm (one undo restores it) and buzzes both controllers twice.
- Objects land on free ground, spaced apart and snapped; solid ones never cover the robot start or goal. If space runs out, it adds what fits and says so.

### Worlds

| Spoken example | Command | Action |
| --- | --- | --- |
| “New world” / “Start a new Mars world called red base” | `NEW_WORLD` | Creates from a template and saves it to the library |
| “Open my world 2” / “Open harbor” | `OPEN_SAVED_WORLD` | Best name match among saved worlds (environments win unless you say “my” / “saved”) |
| “Save as harbor town” | `SAVE_WORLD` | Saves as a new library entry with that name |
| “Resume” / “Continue where I left off” | `RESUME_SESSION` | Restores the auto-saved last session (`src/world/autosave.ts`) |
| “Go home” / “Exit the editor” / “Back to landing” | `GO_HOME` | Leaves for the project page; confirms if unsaved |
| “Go home now” / “Leave now” / “Force home” | `GO_HOME` (force) | Same, **skips confirm** — escape hatch if UI is stuck |

**Unsupported (structured reject):** “Stop navigation” (no safe stop API yet), free-form NL, anything not listed.

Destructive commands without a connected `ConfirmHandler` return `needs_confirmation` and **do not** mutate the world. Core voice logic never calls `window.confirm()`.

## Microphone requirements

- Secure context (HTTPS / localhost) — already required for WebXR.
- `navigator.mediaDevices.getUserMedia({ audio: true })`.
- Push-to-talk: call `startListening()` then `stopListening()`. Mic tracks are stopped on stop/unmount.
- Audio is streamed for STT only; recordings are **not** retained by default.

Quest Browser compatibility is **unverified on device** until headset testing.

## XR integration (Emiliano)

Do **not** edit Emiliano’s XR menu in this branch. Consume the hook/controller:

```ts
import { useVoiceCommands, subscribeVoiceEvents } from '../voice'

function XrVoiceHud() {
  const voice = useVoiceCommands({
    provider: 'assemblyai', // or 'mock'
    confirm: (req) => showXRConfirm(req.message),
  })

  // Map grip / menu buttons:
  // onPress  → voice.startListening()
  // onRelease → voice.stopListening()

  return null // drive existing XR HUD from voice.isListening / voice.lastTranscript
}
```

Imperative (no React):

```ts
import { createVoiceCommands } from '../voice'
const voice = createVoiceCommands({ confirm: showXRConfirm })
await voice.startListening()
await voice.stopListening()
await voice.dispose() // on XR session end
```

Expose to the player:

- Listening status (`isListening`)
- Last transcript / command
- Confirmation request (`VOICE_CONFIRMATION_REQUIRED` or `pendingConfirmation`)
- Errors (`lastError`)

## ElevenLabs event integration (Agent 3)

Subscribe without importing Agent 3 code:

```ts
import { subscribeVoiceEvents } from '../voice'

subscribeVoiceEvents((event) => {
  switch (event.type) {
    case 'VOICE_COMMAND_RECOGNIZED':
    case 'VOICE_COMMAND_EXECUTED':
    case 'VOICE_COMMAND_REJECTED':
    case 'VOICE_COMMAND_FAILED':
    case 'VOICE_CONFIRMATION_REQUIRED':
      // speak event.message or map to ElevenLabs lines
      break
  }
})
```

Voice commands work with speech synthesis fully disabled.

## Mock testing

```ts
import { VoiceController, submitMockTranscript } from '../voice'

const voice = new VoiceController({ provider: 'mock' })
await voice.startListening()
submitMockTranscript('Load Mars Outpost')
// or:
await voice.submitTranscript('Select wall tool')
```

Demo remains usable when AssemblyAI is missing, mic is denied, or the network drops — the controller can fall back to `mock`.

## Known limitations

- Deterministic keyword parser only (no LLM / free-form world gen).
- “Create a building” activates the tool; it does not place geometry at guessed coordinates.
- “Stop navigation” is intentionally unsupported until a safe stop API exists.
- Token proxy is Vite-dev middleware; production hosting needs an equivalent serverless/proxy route.
- Quest mic + WebXR session behavior not yet validated on hardware.
- Desktop: right-click the canvas for **World actions** (tools, save/undo, environments, voice). Orbit pans with middle-drag; right-click is reserved for the menu.

## Tests

```bash
npm test
npm run build
```

Coverage includes parsing, tools, environments, undo/redo, unsupported commands, destructive confirms, duplicate finals, mock STT, connection fallback, and mic/socket cleanup.
