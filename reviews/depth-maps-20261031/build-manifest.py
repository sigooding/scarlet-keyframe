"""Records the 2026-10-31 voted depth-map batch.

Run from the repository root: python3 reviews/depth-maps-20261031/build-manifest.py
It rewrites manifest.json from the exact prompts below and the files on disk.
"""

import hashlib
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
R = Path(__file__).resolve().parent


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def dims(path: Path) -> dict:
    out = subprocess.run(
        ["identify", "-format", "%wx%h|%[colorspace]|%[type]", str(path)],
        capture_output=True, text=True, check=True,
    ).stdout
    wh, colorspace, kind = out.split("|")
    width, height = wh.split("x")
    return {"width": int(width), "height": int(height), "colorspace": colorspace, "type": kind}


PROMPTS = {
    "nw_b1562": """Create a pure greyscale DEPTH MAP (a Z-pass render) for the supplied 16:9 cinematic film still — not a photograph, not a shaded render. Use the reference only to trace exactly what is where: keep the identical framing, crop and 16:9 aspect, and align every silhouette edge precisely to the reference with clean, crisp, unfeathered boundaries. Luminance encodes distance only: no texture, no colour, no lighting, no highlights, no rain streaks, no grain, no vignette, no border, no text, no signature.

Nearest surfaces, near-white (about 0.92-0.98): the wet black car bodywork and its open rear door frame across the right and lower right of frame, the front door pillar and window glass at the far right edge, and the wet curb/asphalt strip in the bottom-left foreground.

Second nearest, light grey (about 0.72-0.85): the open car door's inner trim and window sill, the wheel arch and rear wheel in the lower left, the door step plate and carpeted sill.

Mid-ground, mid grey (about 0.45-0.62): the pale beige leather rear seat cushions and backrest, the centre armrest, and the seated silver-haired older man in a dark suit — his head, shoulders, torso and legs each a smooth slightly-lighter-on-near-face gradient, still one continuous mid-grey mass clearly readable as the seated figure.

Farther, dark grey (about 0.22-0.38): the far side of the interior, the window frames and headliner of the car, the door light on the headliner, and the parked white blinds of the opposite windows.

Background, near-black (about 0.04-0.14): the rain-soaked night street beyond the car — the wet road with reflected light pools as small soft mid-dark patches, the dark building facades and tree line, and the distant out-of-focus bokeh lights as small soft mid-grey dots. Sky at the very top darkest.

Every surface must be a smooth continuous gradient across the object, each object marginally lighter toward its near edge, with hard clean separation where one object occludes another. Single flat greyscale depth map, full-bleed 16:9, no colour anywhere.""",
    "nw_b465": """Create a pure greyscale DEPTH MAP (a Z-pass render) for the supplied 16:9 cinematic film still — not a photograph, not a shaded render. Use the reference only to trace what is where: identical framing and 16:9 crop, every silhouette edge crisp and aligned to the reference, no feathering. Luminance encodes distance only: no wood grain, no texture, no colour, no lamp glow, no steam shading, no grain, no vignette, no border, no text.

Nearest surfaces, near-white (about 0.92-0.98): the worn wooden counter edge running along the bottom-left to centre foreground, the chopstick holder and small condiment bottles standing on it at the left, and the bottom of the near wooden stool at the lower right.

Light grey, second nearest (about 0.70-0.85): the counter top surface receding toward the right, the near stool seat, the tall chopstick cylinders and bowls further along the counter, and the right-hand wooden wall and coat hooks at frame right.

Mid-ground, mid grey (about 0.45-0.62): the elderly woman in the brown cardigan and dark apron behind the counter at the left — head, shoulders, arms and hands each a smooth gradient, one readable mid-grey mass; the two older customers seated at the far end of the counter as clearly darker mid-grey silhouettes; and the dark-haired greying man in the dark coat standing at the right of the counter, his head, shoulder, arm and hand a single continuous mid-grey figure with a slightly lighter near edge.

Farther, dark grey (about 0.22-0.36): the metal shelving and steam hood behind the counter, the hanging pendant lamp shade and its stem as a mid-dark shape, the dark blue noren curtains in the doorway and the back kitchen doorway.

Background, near-black (about 0.04-0.14): the rear kitchen interior, the far wall with posters and the framed sign, and the recesses behind the shelves. Ceiling and deep corners darkest.

Every surface a smooth continuous gradient, each object marginally lighter at its near edge, with clean hard separation at every occlusion boundary. Single flat greyscale depth map, full-bleed 16:9, no colour anywhere.""",
    "nw_b1316": """Create a pure greyscale DEPTH MAP (a Z-pass render) for the supplied 16:9 cinematic film still — not a photograph, not a shaded render. Use the reference only to trace what is where: identical framing and 16:9 crop, crisp silhouette edges aligned exactly to the reference, no feathering. Luminance encodes distance only: no texture, no handwriting, no colour, no lighting, no grain, no vignette, no border, no text.

Nearest surfaces, near-white (about 0.92-0.98): the low wooden table top filling the bottom centre and right foreground, the two pale cups standing on it, and the open notebook lying on it slightly farther, plus the very bottom edge of the woman's dark skirt at the lower left.

Light grey, second nearest (about 0.70-0.85): the sheet of paper held in the woman's hands, her hands and forearms, her bare shoulders, and the left-hand wooden sideboard with its drawers and the small framed photo on it.

Mid-ground, mid grey (about 0.45-0.62): the blonde woman's head, face and torso — one continuous readable figure mass with a smooth gradient that is marginally lighter toward her near side — and the tall lamp shade on the left, the dark CRT television on its stand at the right and the armchair back at the extreme lower right.

Farther, dark grey (about 0.22-0.36): the curtains at both window edges and along the base, and the balcony rail and outer window frame.

Background, near-black (about 0.04-0.16): the rain-streaked window glass and the blurred apartment block beyond it, plus the pale sky visible outside as a slightly lighter dark patch. The deepest interior shadows stay darkest.

Every surface a smooth continuous gradient, each object marginally lighter at its near edge, clean hard separation at every occlusion boundary. Single flat greyscale depth map, full-bleed 16:9, no colour anywhere.""",
}

SHOTS = [
    dict(
        number=1, scene="nw_s94", sceneTitle="94 — Only tea", targetBeat="nw_b1562",
        shot="Its rear door stands open: warm amber light, leather.", voteOption=2, depthAmount=0.28,
        plate=dict(
            filmPath="/film/img/s94/139-only-tea.jpg", bundledAsset="duplicate-uncut-1562",
            file="src/assets/recreated-uncut/1562-sedan-door.jpg",
            reviewPlate="context/01-plate-1562-sedan-door.jpg",
        ),
        reviewed="images/01-nw_b1562-sedan-door-depth.png",
        installed="public/film/depth/recreated-uncut/1562-sedan-door-depth.jpg",
        bundled="src/assets/recreated-uncut/depth/1562-sedan-door-depth.jpg",
        depthAssetId="depth-uncut-1562",
    ),
    dict(
        number=2, scene="nw_s17", sceneTitle="17 — You got old", targetBeat="nw_b465",
        shot="Everything is going. We are just slower.", voteOption=1, depthAmount=0.26,
        plate=dict(
            filmPath="/film/img/s17/434-i-was-already-old.jpg", bundledAsset="duplicate-uncut-465",
            file="src/assets/recreated-uncut/465-kaneko-at-counter.jpg",
            reviewPlate="context/02-plate-465-kaneko-counter.jpg",
        ),
        reviewed="images/02-nw_b465-kaneko-counter-depth.png",
        installed="public/film/depth/recreated-uncut/465-kaneko-counter-depth.jpg",
        bundled="src/assets/recreated-uncut/depth/465-kaneko-counter-depth.jpg",
        depthAssetId="depth-uncut-465",
    ),
    dict(
        number=3, scene="nw_s79", sceneTitle="79 — Grey light", targetBeat="nw_b1316",
        shot='Careful, laborious English handwriting. "Miss Voss. Your father did not kill himself. I can prove it."',
        voteOption=1, depthAmount=0.26,
        plate=dict(
            filmPath="/film/img/s79/91-grey-light.jpg", bundledAsset="duplicate-uncut-1316",
            file="src/assets/recreated-uncut/1316-vera-reads-letter.jpg",
            reviewPlate="context/03-plate-1316-vera-reads-letter.jpg",
        ),
        reviewed="images/03-nw_b1316-vera-reads-letter-depth.png",
        installed="public/film/depth/recreated-uncut/1316-vera-reads-letter-depth.jpg",
        bundled="src/assets/recreated-uncut/depth/1316-vera-reads-letter-depth.jpg",
        depthAssetId="depth-uncut-1316",
    ),
]


def build() -> dict:
    shots = []
    for shot in SHOTS:
        plate_file = ROOT / shot["plate"]["file"]
        reviewed = R / shot["reviewed"]
        installed = ROOT / shot["installed"]
        bundled = ROOT / shot["bundled"]
        entry = {
            "number": shot["number"],
            "scene": shot["scene"],
            "sceneTitle": shot["sceneTitle"],
            "targetBeat": shot["targetBeat"],
            "shot": shot["shot"],
            "status": "selected",
            "voteOption": shot["voteOption"],
            "references": [
                {
                    "order": 1,
                    "role": "Plate this depth map was drawn from (the only image supplied to the generator)",
                    "sourceFilmPath": shot["plate"]["filmPath"],
                    "bundledAsset": shot["plate"]["bundledAsset"],
                    "generationInputPath": shot["plate"]["file"],
                    "sha256": sha(plate_file),
                    "reviewPreview": shot["plate"]["reviewPlate"],
                }
            ],
            "prompt": PROMPTS[shot["targetBeat"]],
            "reviewedImage": {"file": shot["reviewed"], "sha256": sha(reviewed), **dims(reviewed)},
            "installedDepthMap": {"file": shot["installed"], "sha256": sha(installed), **dims(installed)},
            "bundledDepthMap": {"file": shot["bundled"], "sha256": sha(bundled), **dims(bundled)},
            "wiring": {
                "registry": "RECREATED_DEPTH_MAP_BY_BEAT (src/core/recreatedUncut.ts)",
                "depthAssetId": shot["depthAssetId"],
                "cinematic": {
                    "mode": "static", "depthMotion": "push",
                    "depthAmount": shot["depthAmount"], "depthSeconds": 8,
                },
            },
        }
        shots.append(entry)
    return {
        "date": "2026-10-31",
        "project": "Original Uncut",
        "selection": "Three recreated Original Uncut stills that had no depth camera, in three distinct scenes and lighting setups, each voted between two candidates.",
        "request": "The user asked for real depth-map images for Nobody's Witness, generated with the vote option.",
        "generation": {
            "voting": {"attempts": 3, "selected": 3, "skipped": 0},
            "method": "generate_image with offer_options: true, prompting a pure greyscale Z-pass depth map traced from the plate alone",
            "postProcessing": "trimmed the generator's 1-3 px margin, converted to genuine 8-bit greyscale, resized to 960x540, JPEG quality 88 to match the existing /film/depth/ maps; no blur, no inversion, no re-lighting",
        },
        "installation": "Original Uncut only, via RECREATED_DEPTH_MAP_BY_BEAT and upgrade version 17. The map is bundled inline so the single-file build needs no server.",
        "cutModified": True,
        "frameRate": 24,
        "shots": shots,
    }


if __name__ == "__main__":
    manifest = build()
    (R / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    print("\n".join(
        f"{s['number']}. {s['targetBeat']} option {s['voteOption']} -> {s['installedDepthMap']['file']} "
        f"{s['installedDepthMap']['width']}x{s['installedDepthMap']['height']} {s['installedDepthMap']['colorspace']}"
        for s in manifest["shots"]
    ))
