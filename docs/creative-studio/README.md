# RealmForge Creative Studio

A personal image-to-3D asset library inside RealmForge-XR. Import your artwork, prepare it
non-destructively, preview and price a ProjectSim generation, approve it by hand, then inspect the
resulting model in a GLB viewer or a small gallery scene.

Open `https://localhost:5173/?studio=1` from **this machine** while `npm run dev` is running.
Deep links: `&tab=gallery`, `&asset=<id>`. The studio API is dev-server-only and refuses LAN, tunnel and
cross-site requests ([AUDIT.md](AUDIT.md)).

> **Status (2026-10-21):** every step up to and including the dry run is implemented and verified.
> **No creative generation has been submitted**, so the path from a real ProjectSim output to the viewer
> is tested only against a faked API. See [What is verified](#what-is-verified).

## Workflow

| Step | Where | Spends credits? |
| --- | --- | --- |
| 1. Import artwork (PNG/JPEG/WebP) | Library → Import / drop | No |
| 2. Prepare: crop, remove a plain background, trim + pad, downsize → **derived copy** | Prepare panel | No |
| 3. Dry run: build the exact request, validate it, price it, check the budget | Generate → Dry run | No, and no network |
| 4. Approve: type `SPEND 4 CREDITS` and tick credits / licence / no-card | Generate → Approve | No |
| 5. Submit | Generate → Submit (only if the server has `CREATIVE_ALLOW_SPEND=1`) | **Yes, 4 credits** |
| 6. Check status → download → GLB conversion gate → viewer | Generation history → Check status | No |

A GLB you already have the rights to can be attached to an asset without generating anything (Model →
Import a GLB), which goes through the same conversion gate.

## Spend safety

Enforced in code (`tools/creative/service.ts`, `src/creative/generation.ts`) and covered by tests:

1. **Dry run is offline.** It records a `validated` (or `rejected`) generation in the manifest and never
   constructs a ProjectSim client.
2. **Approval is human and specific**: the exact phrase `SPEND <n> CREDITS`, plus three ticked
   acknowledgements (credit cost, Kaedim licence 4.2, no payment card on file). It is bound to a
   sha256 over the endpoint, the exact request and the image bytes, and expires after 30 minutes.
3. **Submit needs a server-side switch**: `CREATIVE_ALLOW_SPEND=1` in the dev server's own environment.
   The browser cannot set it. Start it yourself when you intend to spend:
   ```
   CREATIVE_ALLOW_SPEND=1 npm run dev
   ```
4. **Re-checked at submit**: the request and the prepared image are re-hashed from disk; if anything
   changed since approval, submit refuses.
5. **Budget**: the 24-credit creative allocation **and** the account-wide holdback (22 credits),
   summing this studio's ledger and the PX4 ledger (read-only). See [CREDITS.md](CREDITS.md).
6. **Ledger first**: an `intent` line is appended before the paid POST. A 4xx rejection (nothing created)
   records a refund, as does a failed or cancelled job. A crash leaves the intent counted as spent.
7. **Idempotency-Key** derived from the payload hash, and a ledger check, so a retry never buys twice.
8. **Token hygiene**: read from `PROJECTSIM_TOKEN` / `KAEDIM_API_TOKEN` or `~/.config/projectsim/token`
   (refused unless chmod 600). Never logged, never sent to the browser, and never sent to storage or
   download URLs. Presigned URLs are stripped from stored metadata.

## Library layout (gitignored: `creative-library/`)

```
creative-library/
  ledger.jsonl                     spend ledger (same events as the PX4 ledger)
  assets/<id>/
    manifest.json                  schema v1, `revision` bumps on every write
    history/r0001.json …           every previous revision
    original/<sha256>.<ext>        your artwork, byte-for-byte, mode 0444
    derived/<prep-id>.png          prepared copies, mode 0444; ops recorded as the recipe
    provider/<gen-id>/…            raw ProjectSim output + projectsim_asset.json (URLs stripped)
    converted/model-<n>.glb        GLB that passed the conversion gate
    preview/preview-<t>.png        viewer screenshot
```

Override the location with `CREATIVE_LIBRARY_DIR`. External ledgers default to
`../px4-autonomous-mission/sim_assets/projectsim_ledger.jsonl` if it exists; set
`CREATIVE_EXTERNAL_LEDGERS` (path-separated, empty to disable) to change that.

The manifest (`src/creative/manifest.ts`) records: original (sha256, bytes, format, size, alpha,
validation), preparations (parent, ops, sha256, server-recomputed subject analysis), generations (exact
request, payload hash, idempotency key, dry-run result, approval, job and asset ids, credit cost, provider
files and hashes), the converted model (triangles, extents, textures, warnings), the preview, and the
licence (origin, owner, provider terms snapshot).

## Image checks

* Header level (`src/creative/imageInfo.ts`): format by magic bytes, ≤ 100 MB, ≤ 8192 px, a warning under
  1024 px (and a stronger one under 512 px), aspect ≤ 4:1, a note if there is no alpha.
* Pixel level (`src/creative/pixels.ts`), recomputed **on the server** for every derived copy: subject
  count (8-connected components ≥ 1% of the image, specks reported separately), empty images, a subject
  that fills the frame, a tiny subject, the transparent fraction.
* Background removal is a flood fill from the border by colour tolerance. It works on plain backdrops;
  it is not a segmentation model.

## Viewer and gallery

* Viewer (`src/creative/ui/ModelViewer.tsx`): orbit, zoom and pan, reset, wireframe, grid (1 m or 10 cm
  cells), lighting presets (studio / soft / dramatic / flat), background colour, bounding box with
  dimensions, screenshot (downloads it and stores it as the asset preview).
* Gallery (`?studio=1&tab=gallery`): CC-BY-4.0 projectsim samples, plus every library asset with a
  converted model, on plinths; click to inspect and see attribution, then open in the viewer.
* Gallery samples are rebuilt with
  `python3 tools/creative/build_gallery_samples.py --px4-root ~/Desktop/px4-autonomous-mission --sample articulated-desks/desk_0001 …`
  (attribution and provenance in `public/creative/gallery/`).
* Without WebGL the 3D areas show a notice; the rest of the studio keeps working.

## What is verified

| Claim | Evidence |
| --- | --- |
| Image validation, prep ops, subject counting | `src/creative/creative.test.ts` |
| Manifest schema, lineage, versioning, read-only originals, path escape | `creative.test.ts`, `tools/creative/service.test.ts` |
| Credit accounting incl. the PX4 ledger, allocation and holdback | `creative.test.ts`, `service.test.ts` |
| Dry run makes no network call; approval and submit enforcement; refunds; idempotency | `service.test.ts` (faked ProjectSim API) |
| HTTP guards (loopback, Host / tunnel headers, client header, origin, no token leak) | `tools/creative/http.test.ts` |
| GLB conversion gate: missing textures, invalid meshes, extents | `creative.test.ts`, `service.test.ts` |
| Viewer loading (same GLTFLoader) and the committed gallery GLBs | `src/creative/viewer/model.test.ts` |
| UI: import → prepare → save derived copy → dry run, live dev server | Browser pane, 2026-10-21 (synthetic image, scratch library) |
| Viewer controls and gallery rendering | Headless Chrome + SwiftShader, 2026-10-21 (screenshots; orbit / reset / wireframe / bounds / lighting / screenshot-to-preview) |

**Not verified:** a real ProjectSim generation (nothing submitted), the real Standard output's file
kinds and layout (`pickGlb` assumes a `glb`/`simready_glb` kind or a `.glb` path), the S3 upload against
real storage, and Quest / XR use of the studio (desktop only).
