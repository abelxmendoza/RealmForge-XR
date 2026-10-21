# Creative Studio — audit (2026-10-21)

Audit done before building the Creative Studio (`?studio=1`). Covers RealmForge-XR as found on `main`
at `ee9b2ee`, and the PX4 repo's ProjectSim pipeline (`px4-autonomous-mission/tools/sim_assets/`,
branch `feat/sim-asset-pipeline`), which was read but **not modified**.

## RealmForge-XR as found

| Area | Finding |
| --- | --- |
| Stack | React 19, @react-three/fiber 9, drei 10, @react-three/xr 6, three 0.186, zustand 5, Vite 8, TypeScript 7, Vitest 5 |
| Entry | `src/main.tsx` routes `?` → landing, `?editor=1` → lazy editor. No router library; query flags only |
| Server code | None in production. Dev-only Vite middleware (`vite/assemblyaiTokenPlugin.ts`) + Vercel function (`api/assemblyai`). Secrets stay server-side (dotenvx `.env`) |
| Dev server | HTTPS self-signed (`basic-ssl`), `host: true` (LAN, for the Quest), `allowedHosts: .trycloudflare.com` |
| 3D loading | `src/scene/structures/ModelStructure.tsx`: drei `useGLTF`, fit to footprint, error boundary → placeholder. Custom assets come from `public/assets/library.json` (validated by `src/world/assetManifest.ts`) |
| Tests | 62 files / 412 tests, all passing at baseline; Node environment, no DOM, no WebGL |
| Docs | Living docs rule in `docs/plan.md`: BUILD_LOG + CHANGELOG + STATE per meaningful change |
| Kaedim | `KAEDIM_API_TOKEN` in the encrypted `.env`, "unused in app code" (STATE.md); plan.md P2.2 "integrate or drop" |

Consequences for the design:

* A personal library needs to write files. The only server-side seam is Vite middleware, so the studio
  API is a dev-only plugin (`vite/creativeStudioPlugin.ts`, `apply: 'serve'`). It is not mounted on
  `vite preview` or Vercel: the library is local and personal, and the spend path must not be exposed.
* Because the dev server listens on the LAN and accepts cloudflared tunnel hosts, the API checks the
  socket address, the Host header and tunnel headers (`tools/creative/http.ts`). Tunnel traffic
  arrives from loopback, so the socket check alone would not be enough; this is covered by a test.
* The existing `useGLTF` + error-boundary pattern is reused for the gallery. The viewer parses GLBs
  itself (`src/creative/viewer/model.ts`), so load errors become UI state and the same loader runs in tests.

## PX4 pipeline: reuse vs port

| PX4 module | What it does | Decision |
| --- | --- | --- |
| `projectsim.py` | ProjectSim client, spend guard, JSONL ledger, idempotency keys, URL stripping | **Ported to TypeScript** (`tools/creative/projectsim.ts`, `service.ts`). It is Python and the studio's server is Node. Same token rules, same **ledger event format** (`intent / submitted / refunded / downloaded`), so the studio can **read the PX4 ledger read-only** and enforce one account-wide budget. The guard logic is stricter here (typed human approval bound to a payload hash, a server env flag, and the upload flow) |
| `usd_import.py` | USD → per-link glTF for Gazebo, shared textures | **Reused by import, not copied**: `tools/creative/build_gallery_samples.py` adds the PX4 repo to `sys.path` and calls `read_stage()` read-only, then merges the links into one web GLB. The repo path is an explicit `--px4-root` argument |
| `hf_samples.py` | Pinned CC-BY-4.0 projectsim samples from Hugging Face | **Reused as data**: the samples it already fetched (pinned revisions, sha256 in `provenance.json`) are the gallery's source; provenance is carried into `public/creative/gallery/gallery.json` |
| `acceptance.py` | Gazebo acceptance criteria (scale, ground, collision budget, joints, drop test) | **Not reused**: it measures physics/simulation. The web equivalent is the GLB conversion gate (`src/creative/glb.ts`): container, accessors, NaN, textures, triangles, extents |
| `render_view.py` | Headless Gazebo camera snapshot | **Not reused**: Gazebo-specific. The web viewer screenshot replaces it |
| `mesh_import.py`, `gz_model.py`, `drop_test.py`, `world_builder.py` | SDF / Gazebo model building | Not relevant to the web library |

### Proposal: extract a shared package (not done; needs your OK)

Two copies of the ProjectSim protocol now exist: Python (PX4) and TypeScript (here). Copying silently
would let them drift, so the duplication is explicit, and this is the suggested fix:

1. A small repo `projectsim-guard` holding the **ledger JSONL schema**, pricing table, Standard and
   Procedural request contracts as JSON Schema, plus **conformance fixtures** (ledger streams with an
   expected `committed` value, valid and invalid request bodies).
2. Both implementations run the same fixtures in CI.
3. `usd_import.read_stage` moves into a pip package (`sim-assets-usd`) that both the PX4 Gazebo path and
   the gallery builder depend on, replacing today's `sys.path` import.

## Provider facts used (docs.projectsim.ai, read 2026-10-21)

* Standard: **exactly one** PNG/JPEG/WebP image ≤ 100 MB, optional text (≤ 10,000 chars). With an image,
  text is applied as **edits** to the image. `multi_subject_image: true` + `subject_name` isolates one object.
* Uploads: `POST /v1/uploads {count}` → `{id, url, fields, max_bytes, expires_at}`; multipart POST to `url`
  with all fields unchanged and the file last, **no Authorization**; cite as `{upload_id}`. Free.
* Params: `mesh.quality` standard|low|ultra_low; `texture.resolution` 2048|4096|8192;
  `physics.simulator` … `agnostic` (FBX + GLB + physics sidecar). Articulated is Isaac/Genesis USD only.
* Pricing (verified 2026-10-21): standard / measured / high-fidelity 4 credits, procedural 1 per member
  (10 minimum). Failed jobs are refunded. **No balance API**: the dashboard is the source of truth.
* Billing risk: with a card on file, overage starts a $1,200/month plan.

## Licensing (projectsim.ai/terms) — surfaced before any creative generation

* 2.2 permits robotics use; forbids training image/video/3D generators on outputs.
* 3.1 commercial use of **paid** outputs. Whether **gift-credit** outputs count as paid: **unconfirmed**.
* 4.2 gives Kaedim a broad licence to outputs (training, selling and licensing assets); 4.3 excludes only
  original **inputs**. So a 3D model generated from your artwork may be used by Kaedim, even though the
  artwork itself stays yours.

The approval form requires ticking an acknowledgement of exactly this. A snapshot of the terms
summary is written into the asset manifest (`licence.provider`) when a generation is submitted.
