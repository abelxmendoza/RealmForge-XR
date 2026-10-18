# Voice worldbuilding plan

Goal: say one sentence like *"add 3 lampposts, a road and two houses with a few people walking around"* and get a sensible little scene, then shape it by voice ("make the houses brick", "make the road longer", "move the people to the goal").

Written against `main` at `d3f2baf`. **Status:** built; see [voice-commands.md](voice-commands.md#scenes-people-and-shaping-things) for what you can say now. The tables under “Where voice is today” describe the parser before this work.

## Where voice is today

The pipeline is solid. What it understands is the weak part.

- **Speech:** AssemblyAI streaming v3 (`src/voice/assemblyAIClient.ts`), with Web Speech as a fallback and a typed box for testing. `VoiceController` joins the final pieces of one sentence and runs it after a 700 ms pause.
- **Parsing:** `src/voice/commandParser.ts` and `objectCommands.ts` match keywords and return **exactly one** `VoiceCommand`.
- **Doing:** `commandExecutor.ts` calls `src/world/spawn.ts` (`spawnObjects`, `moveObjects`, `rotateObjects`, `resizeObjects`, `duplicateObjects`). Spawning already finds free ground, snaps to the grid, keeps the robot and goal clear, and makes each batch one undo step.
- **References:** "it" is the selection and "them" is the last batch. There's no way to say "the houses" or "the road".
- **Actors:** workers, courier robots and vehicles exist in `src/actors/`, but voice can't create or move them.

### What your example does right now

I ran the current parser on these sentences:

| You say | It does |
| --- | --- |
| add 3 lampposts a road and two houses with a few people walking around | **3 houses** (the first noun in its list wins, and the first number wins) |
| add two houses and a tree | 2 houses, no tree |
| make the house brick | **adds a new house** |
| put a road between the houses | adds a house |

So the problems are:

1. One command per sentence.
2. Counts aren't tied to their nouns.
3. You can't name things you already made.
4. You can't change material, style, roof or exact size.
5. There's no layout ("along the road", "between", "in a row").
6. There are no people.

## The plan

### 1. Compound sentences become a list of commands

- Change `parseVoiceCommand` to return `commands: VoiceCommand[]`. Single commands become a list of one, so nothing else breaks.
- Split the sentence on `and`, `,`, `then`, `with`, `plus` and `also`. Each piece keeps the verb from the start ("add 3 lampposts, a road and two houses" means add + add + add).
- Each count is read **next to its own noun** ("3 lampposts", "a road", "two houses", "a few people"). The existing number words and sound-alikes ("to" for two, "for" for four) still apply.
- The executor runs the list inside **one undo step**, so "undo" removes the whole scene. It reports one summary line, for example: *"Added 3 streetlights, a road, 2 houses and 3 people walking around."*
- If one piece isn't understood, the rest still run, and the reply names the piece it skipped.

### 2. A scene layout instead of a spiral

At the moment every batch spirals out from the same centre point, so the objects in a compound sentence end up wherever there's room. Add `src/world/compose.ts` with a small layout step that runs whenever one sentence makes several kinds of thing:

- **A road is the spine.** If the sentence includes a road or street, it's placed first.
- **Buildings line up along it.** They alternate sides and face the road, with a setback.
- **Streetlights are spaced evenly** along the road edges.
- **Trees fill gaps** between buildings.
- **People** start on the road or plaza.
- With no road, objects are grouped in a loose cluster around the anchor point, buildings first.
- Everything still goes through the existing `fits()` and `snapFootprint()`, so nothing overlaps, blocks the robot, or lands off the board.

These relation words map to layout rules:

| Words | Rule |
| --- | --- |
| along / beside / lining the road | along the spine |
| on both sides / either side | alternate sides |
| in a row / in a line | evenly spaced on a line |
| around / circling X | ring around the target |
| between A and B | midpoint, oriented along A to B |
| in front of / behind / next to / north of X | offset from the target, using the existing direction code |
| at the end of the road | the road's end point |

### 3. People and other actors by voice

- Add vocabulary: *people, person, pedestrians, workers, staff* make `worker` actors; *robots, couriers, delivery bots* make `courier` actors; *cars, vehicles, trucks, carts* make `vehicle` actors.
- Add new commands `SPAWN_ACTORS` and `ACTOR_BEHAVIOUR`. Placement uses `placeActor()` and its checks.
- **"Walking around" or "wandering"** gives each actor a loop of a few reachable stops near where it was placed (on the road, if there is one). This needs a small `loop?: boolean` on `Actor`, so that `tickActors` adds the stop it just reached back to the end of the route. That is a few lines in `src/actors/`. **Check who owns actors before changing it.** Without it, I can give each actor a long route of stops with no runtime change, but they will stop eventually.
- Other behaviours: "send the workers to the goal", "have the people patrol the road", "make them stop", "make them faster".
- Actors are limited to 32 (`MAX_ACTORS`). If you ask for more, the reply says how many fit.

### 4. Naming things you already made

Replace `which: 'selected' | 'last'` with a target selector:

```ts
type Target =
  | { ref: 'it' } | { ref: 'them' }                                   // as today
  | { kind?: ObjectKind | 'actor'; style?: string; label?: string;
      all?: boolean; ordinal?: number; nearest?: AnchorName }          // "the houses", "the second house", "the tree near the robot"
```

- "The houses" means all houses in the last batch, or else every house.
- "The house" means the selected house, or else the one made most recently.
- "All the trees" means every tree.
- "The second house" uses creation order.
- Selected objects are highlighted briefly so you can see what was picked.

### 5. Shaping and finishing by voice

Add `EDIT_OBJECTS` with a target and a patch, which runs through `updateObject` in one undo step:

| You say | Change |
| --- | --- |
| make the houses brick / glass walls / asphalt | `material` |
| make it a tower / pine trees / office | `style` |
| pitched roofs / flat roof | `roof` |
| paint it red / make the house blue | `color` |
| make the road longer / 20 meters long / 6 wide | size on one axis, either absolute or a multiplier (roads stretch along their length) |
| make the tower 3 times taller / 30 meters tall | height |
| turn the houses to face the road | rotation toward the road |
| make the trees solid / let the robot through | `solid` |
| remove the trees / delete the people | delete (asks first when it's more than 3 things) |

Existing move, rotate, resize and duplicate commands get the new target selector, so "move the houses 5 meters north" works.

### 6. Whole environments from one phrase

- Add scene recipes in `src/world/recipes.ts`: *a street, a town square, a neighbourhood, a park, a parking lot, an industrial yard, a market, a job fair hall*. Each recipe is a list of commands, so it runs through the same layout and undo code.
- Phrases like "build a small neighbourhood" or "make a town square with a fountain and people" choose a recipe. Sizes like "small", "big" and "huge" scale the counts. Extra pieces ("with a fountain") are added to it.
- The recipe list is shown in the controls guide so people know what to try.

### 7. Claude as a fallback parser (decided: yes)

Keyword matching is enough for the examples above and works offline. For anything it can't handle ("a cosy village with a few shops facing a little park"), we can send the sentence to Claude:

- Add a serverless route `api/voice/plan.ts`, next to the AssemblyAI token route, that calls Claude (Haiku 5.5, for speed) with one tool. The tool's input schema is the `VoiceCommand[]` list above, plus a short summary of the current world (kinds, counts, the selection, the robot and the goal).
- The result is **only used after the same validation**. Claude never touches the world directly, and confirmation for deletions still applies.
- The keyword parser runs first and Claude is called only when it fails or returns nothing, so the common commands stay instant and free.
- This needs an Anthropic API key in `.env` (encrypted, like the AssemblyAI key) and in the hosting environment.

### 8. Better listening

- Pass AssemblyAI a `keyterms_prompt` built from the object, actor, material and recipe vocabulary (lamppost, streetlight, asphalt, pitched, courier…), so domain words are heard correctly. Confirm that the model in use accepts it. If it doesn't, keep the sound-alike table and add to it.
- Raise the end-of-turn wait a little only while a compound sentence is being spoken (after "and" or a comma), so long sentences aren't cut in half.
- While you're still talking, the panel shows the plan it's building ("3 streetlights · road · 2 houses · 3 people") so you can see what's coming.

## Files

**Mine to change (voice and world):** `src/voice/*`, `src/world/spawn.ts`, new `src/world/compose.ts`, new `src/world/recipes.ts`, `src/editor/VoicePanel.tsx` (plan preview), `api/voice/plan.ts` (step 7).

**Teammates' code, not touched:** `src/xr/*` (XR session, gestures, palette) and `src/nav/*` / `src/flow/*` (navigation). The VR palette's voice tile shares the same controller, so it gets all of this without changes.

**Needs an owner check:** `src/actors/runtime.ts` and `types.ts`, for the `loop` flag.

## Order of work

1. **Compound sentences, counts tied to nouns, one undo step.** This alone makes your example produce the right objects.
2. **Layout along a road.** The example then looks like a street.
3. **People and other actors**, including walking around.
4. **Naming things you made, and shaping them** (materials, styles, roofs, sizes, delete).
5. **Scene recipes.**
6. **Listening improvements and the plan preview.**
7. **Claude fallback** (you chose to include it).

Each step comes with a table of example phrases in `src/voice/__tests__/phrases.test.ts` (sentence in, expected commands out), and a test that the layout puts out non-overlapping objects and keeps a route for the robot. The current 8 voice test files keep passing.
