#!/usr/bin/env python3
"""Build web GLBs for the Creative Studio gallery from projectsim CC-BY-4.0 samples.

The samples are real ProjectSim procedural outputs (USD) published by Kaedim on
Hugging Face under CC-BY-4.0; attribution: "projectsim by Kaedim". They are
already fetched (pinned revisions, sha256 in provenance.json) by the PX4 repo's
tools/sim_assets/hf_samples.py.

USD parsing is REUSED, not copied: this script imports `read_stage` from the
PX4 repo's tools/sim_assets/usd_import.py (read-only; nothing there is
modified). See docs/creative-studio/AUDIT.md for the proposal to extract
that code into a shared package instead of a cross-repo import.

Output (one self-contained .glb per sample, Y up, metres, textures downscaled
for the browser) plus public/creative/gallery/gallery.json with provenance.

Usage:
  python3 tools/creative/build_gallery_samples.py \
      --px4-root ~/Desktop/px4-autonomous-mission \
      --sample articulated-desks/desk_0001 --sample articulated-logistics-cages/cage_0001
Needs: usd-core, trimesh, numpy, Pillow (system python3 on this machine has them).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

import numpy as np

REPO = Path(__file__).resolve().parents[2]
OUT = REPO / "public" / "creative" / "gallery"
# read_stage returns Gazebo frame (Z up); glTF is Y up: rotate -90 deg about X.
Z_UP_TO_Y_UP = np.array([[1, 0, 0, 0], [0, 0, 1, 0], [0, -1, 0, 0], [0, 0, 0, 1]], dtype=float)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build(px4_root: Path, sample: str, max_px: int) -> dict:
    sys.path.insert(0, str(px4_root))
    from tools.sim_assets.usd_import import read_stage  # noqa: E402  (read-only reuse)
    import trimesh

    folder = px4_root / "sim_assets" / "samples" / sample
    provenance = json.loads((folder / "provenance.json").read_text())
    asset = provenance["asset"]
    usd = folder / "usd" / asset / f"{asset}.usda"
    data = read_stage(usd, max_texture_px=max_px)
    scene = trimesh.Scene()
    triangles = 0
    for body in data["bodies"]:
        for i, mesh in enumerate(body["visual"]):
            m = mesh.copy()
            m.apply_transform(Z_UP_TO_Y_UP @ body["world"])
            triangles += len(m.faces)
            scene.add_geometry(m, node_name=f"{body['name']}_{i}")
    if triangles == 0:
        raise ValueError(f"{sample}: no visual triangles")
    lo, hi = scene.bounds
    # Sit on the ground and centre the footprint (the viewer also does this, but the
    # gallery places models directly).
    scene.apply_translation([-(lo[0] + hi[0]) / 2, -lo[1], -(lo[2] + hi[2]) / 2])
    OUT.mkdir(parents=True, exist_ok=True)
    out = OUT / f"{asset}.glb"
    out.write_bytes(scene.export(file_type="glb"))
    lo, hi = scene.bounds
    return {
        "id": asset.replace("_", "-"),
        "name": provenance["sample_manifest"].get("class", asset),
        "file": out.name,
        "sha256": sha256(out),
        "bytes": out.stat().st_size,
        "triangles": int(triangles),
        "extents_m": [round(float(v), 4) for v in (hi - lo)],
        "max_texture_px": max_px,
        "licence": {
            "id": "CC-BY-4.0",
            "attribution": provenance["attribution"],
            "source": provenance["source"],
            "revision": provenance["revision"],
            "source_sha256": provenance["sha256"],
            "changes": f"USD converted to GLB, articulation and physics dropped, textures resized to {max_px}px",
        },
        "warnings": data["warnings"],
    }


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--px4-root", type=Path, required=True)
    p.add_argument("--sample", action="append", required=True, help="dataset/asset, e.g. articulated-desks/desk_0001")
    p.add_argument("--max-texture-px", type=int, default=512)
    args = p.parse_args()
    entries = [build(args.px4_root.expanduser().resolve(), s, args.max_texture_px) for s in args.sample]
    doc = {"format": "realmforge-creative-gallery", "version": 1, "assets": entries}
    (OUT / "gallery.json").write_text(json.dumps(doc, indent=2) + "\n")
    for e in entries:
        print(f"{e['file']}: {e['bytes'] / 1e6:.2f} MB, {e['triangles']} tris, extents {e['extents_m']}")


if __name__ == "__main__":
    main()
