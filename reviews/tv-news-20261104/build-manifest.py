"""Records the 2026-11-04 closing-news pass.

Run from the repository root: python3 reviews/tv-news-20261104/build-manifest.py
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
    "nw_b1678": """Create ONE horizontal widescreen 16:9 photorealistic cinematic film still for the Tokyo noir drama Nobody's Witness: the epilogue, inside Kaneko's tiny noodle bar under a brick railway arch at night. The first reference shows the same shop, the same elderly Kaneko behind the counter and the same small old television on the wooden shelf above the door; use it only for the room, the shelf, the lighting and the wardrobe. Compose a slightly closer shot on that shelf, seen at a three-quarter angle from the counter side: a small old dusty CRT television, sound off, on the wooden shelf above the dark blue noren curtain. On its small screen, the evening news: the composed Japanese politician KUROSE — matching the exact face, age, swept-back silver hair and heavy-lidded calm of the man in the second reference — in a dark navy suit and tie, walking toward a building entrance between two suited lawyers, press photographers' flashbulbs flaring white around him, cool grey daylight behind them on the screen. Foreground and lower edge stay soft: the warm bare bulb, the brick arch, drifting steam, and behind them Kaneko at the counter and a dark-coated man on a stool with an empty space beside him. Warm tungsten light on the set's dusty plastic casing against the cold grey-blue light of its own screen, muted midnight-teal palette, restrained 35mm film grain, true 16:9 landscape frame with comfortable headroom. The screen's lower third is only a plain soft bar with no lettering; no captions, subtitles, chyrons, readable or invented text, logos or watermarks anywhere.""",
    "nw_b1679": """Create ONE horizontal widescreen 16:9 photorealistic cinematic film still for the Tokyo noir drama Nobody's Witness: the epilogue, in Kaneko's tiny noodle bar under a brick railway arch at night. The first reference shows the same old television standing on the wooden shelf above the door in that shop; keep the same set, shelf, brickwork and warm bulb so this reads as the very next moment on the same screen. Compose a closer shot of the small old dusty CRT television, angled toward the counter, its dark plastic bezel with a dusty speaker grille and worn dials filling the frame edges. On the screen: a formal police press portrait, head and shoulders, of ISHIDA — matching the exact face, brow, nose, jawline and neatly combed salt-and-pepper hair of the man in the second reference — now composed and unsmiling in a dark navy Japanese police uniform with silver collar insignia and a peaked cap, lit flatly against a plain pale grey studio background, framed with a thin light border like a photograph shown on air. The image is slightly soft, faintly scan-lined and cool, as a small television broadcast would be; the glass carries a faint reflection of the shop's warm bulb. Around the set the shot stays dark and soft: brick arch, noren, steam, the wooden shelf edge. Warm tungsten spill on the casing against the cold screen glow, muted midnight-teal palette, restrained 35mm film grain, true 16:9 landscape frame. No lettering on the screen's lower third; no captions, subtitles, chyrons, readable or invented text, logos or watermarks anywhere.""",
}

DEPTH_PROMPTS = {
    "nw_b1678": """Create a pure greyscale DEPTH MAP (a Z-pass render) for the supplied 16:9 cinematic film still — not a photograph, not a shaded render. Use the reference only to trace exactly what is where: keep the identical framing, crop and 16:9 aspect, and align every silhouette edge precisely to the reference with clean, crisp, unfeathered boundaries. Luminance encodes distance only: no texture, no colour, no lighting, no highlights, no brick pattern, no screen picture detail, no steam, no grain, no vignette, no border, no text, no signature.

Nearest surfaces, near-white (about 0.92-0.98): the wooden slab running along the very bottom edge of frame beneath the television, and the dark brick pier filling the frame's far-left edge from top to bottom.

Second nearest, light grey (about 0.72-0.85): the small old television set itself in the upper centre-right — its front plastic bezel, its dusty speaker grille and control buttons along the bottom, and its curved cabinet sides — one continuous readable block proud of everything behind it.

Mid-ground, mid grey (about 0.52-0.66): the television's glass screen and the flat news picture on it (the suited man, the lawyers and the photographers' flash), treated as one smooth recessed panel inside the bezel, marginally darker than the bezel around it.

Farther, dark grey (about 0.30-0.44): the pale cardboard box standing to the right of the set (roughly the right fifth of frame, upper half) and the low stack of newspapers and boards below it.

Deeper, darker grey (about 0.16-0.28): the dark blue noren curtain panels hanging in the doorway on the right, and the shop's brick arch and dark ceiling across the top of frame.

Background, near-black (about 0.03-0.10): the dim interior of the shop behind and below the shelf — the far counter with the elderly woman and the man seated on a stool, the bare bulb's glow and the steam — all read only as very dark, barely separated masses at the bottom left and centre. Corner recesses darkest.

Every surface a smooth continuous gradient across the object, each object marginally lighter toward its near edge, with hard clean separation where one object occludes another. Single flat greyscale depth map, full-bleed 16:9, no colour anywhere.""",
    "nw_b1679": """Create a pure greyscale DEPTH MAP (a Z-pass render) for the supplied 16:9 cinematic film still — not a photograph, not a shaded render. Use the reference only to trace exactly what is where: keep the identical framing, crop and 16:9 aspect, and align every silhouette edge precisely to the reference with clean, crisp, unfeathered boundaries. Luminance encodes distance only: no texture, no colour, no lighting, no highlights, no scan lines, no broadcast picture detail, no grain, no vignette, no border, no text, no signature.

Nearest surfaces, near-white (about 0.92-0.98): the wooden shelf edge running along the bottom of frame below the set, and the dark brickwork filling the frame's far-left edge.

Second nearest, light grey (about 0.72-0.85): the old television set's cabinet across the centre of frame — the thick front plastic bezel, the two large round channel and volume dials standing proud at the upper right of the set, the vertical speaker grille below them, and the control strip with its small sockets and buttons along the bottom of the cabinet.

Mid-ground, mid grey (about 0.52-0.66): the television's curved glass screen and its blue broadcast picture — the pale studio background and the thin light frame around the portrait.

Farther, slightly darker grey (about 0.42-0.52): the flat photograph on the screen itself, the head-and-shoulders police portrait with its cap and uniform, a shallow panel recessed a touch inside the screen's glass.

Farther again, dark grey (about 0.26-0.40): the pale wooden cabinet face standing behind the set at the right of frame, and the small dark cased object resting at the lower right corner.

Background, near-black (about 0.03-0.12): the unlit brickwork and dim room above and to the right of the set, the deep shadow in the top right corner, and the faint steam haze at the right edge. Every corner and the top of frame darkest.

Every surface a smooth continuous gradient across the object, each object marginally lighter toward its near edge, with hard clean separation where one object occludes another. Single flat greyscale depth map, full-bleed 16:9, no colour anywhere.""",
}

SETS = [
    {
        "number": 1,
        "scene": "nw_s100",
        "sceneTitle": "100 — The shop",
        "beat": "nw_b1678",
        "shot": "On a shelf above the door, a small old television with the sound down: the evening news.",
        "beatText": "On a shelf above the door, a small old television with the sound down: the evening news.",
        "voteOption": 2,
        "voteResult": "option 2 accepted",
        "stagedPlate": "images/01-nw-b1678-kurose.jpg",
        "stagedPlateFull": "images/full/01-nw-b1678-kurose.png",
        "installedPlate": "public/film/img/s100/1678-the-evening-news-kurose.jpg",
        "bundledPlate": "src/assets/recreated-uncut/1678-the-evening-news-kurose.jpg",
        "references": [
            ("Shop plate: the same shelf, set, doorway and wardrobe", "/film/img/s100/158-the-third-stool.jpg", "context/01-shop-plate-third-stool.jpg"),
            ("Kurose identity lock", "/film/img/kurose_new/03-s94-door-stands-open.jpg", "context/02-kurose-identity-ref.jpg"),
        ],
        "camera": "static · push · amount 0.22 · 10 s · focal 68% 32%",
        "stagedDepth": "depth/01-nw-b1678-evening-news-depth.jpg",
        "stagedDepthFull": "depth/full/01-nw-b1678-evening-news-depth.png",
        "installedDepth": "public/film/depth/recreated-uncut/1678-evening-news-depth.jpg",
        "bundledDepth": "src/assets/recreated-uncut/depth/1678-evening-news-depth.jpg",
        "depthOption": 1,
    },
    {
        "number": 2,
        "scene": "nw_s100",
        "sceneTitle": "100 — The shop",
        "beat": "nw_b1679",
        "shot": "KUROSE walking into a building between lawyers, cameras flashing… A photograph of ISHIDA in uniform.",
        "beatText": "KUROSE walking into a building between lawyers, cameras flashing, his face composed. A photograph of ISHIDA in uniform. Then the weather.",
        "voteOption": 2,
        "voteResult": "option 2 accepted",
        "stagedPlate": "images/02-nw-b1679-ishida.jpg",
        "stagedPlateFull": "images/full/02-nw-b1679-ishida.png",
        "installedPlate": "public/film/img/s100/1679-the-photograph-of-ishida.jpg",
        "bundledPlate": "src/assets/recreated-uncut/1679-the-photograph-of-ishida.jpg",
        "references": [
            ("Shop plate: the same shelf, set, doorway and wardrobe", "/film/img/s100/158-the-third-stool.jpg", "context/01-shop-plate-third-stool.jpg"),
            ("Ishida identity lock", "/film/img/jack_ishida_new/style-sheets/refs/ishida-face.jpg", "context/03-ishida-identity-ref.jpg"),
        ],
        "camera": "static · push · amount 0.22 · 10 s · focal 44% 44%",
        "stagedDepth": "depth/02-nw-b1679-ishida-photograph-depth.jpg",
        "stagedDepthFull": "depth/full/02-nw-b1679-ishida-photograph-depth.png",
        "installedDepth": "public/film/depth/recreated-uncut/1679-ishida-photograph-depth.jpg",
        "bundledDepth": "src/assets/recreated-uncut/depth/1679-ishida-photograph-depth.jpg",
        "depthOption": 2,
    },
]

CHYRON_FRAMES = [
    # file, box the lettering occupied (x, y, w, h), archive version, role
    ("158-the-third-stool", (1370, 186, 126, 44), 4, "nw_b1675, nw_b1676, nw_b1677 (the shop, before the news)"),
    ("159-she-doesnt-turn", (1362, 190, 160, 44), 4, "nw_b1687 (the three of them in the steam)"),
    ("160-the-clip", (1370, 186, 126, 44), 4, "nw_b1684 (Kaneko sets a bowl down)"),
    ("161-stool-three", (1382, 178, 130, 48), 4, "nw_b1683 (she sits down beside him)"),
]


def main() -> None:
    shots = []
    for s in SETS:
        entry = {
            "number": s["number"],
            "scene": s["scene"],
            "sceneTitle": s["sceneTitle"],
            "targetBeat": s["beat"],
            "shot": s["shot"],
            "targetText": s["beatText"],
            "status": "selected",
            "voteOption": s["voteOption"],
            "voteResult": s["voteResult"],
            "references": [
                {"order": i + 1, "role": role, "sourceFilmPath": film, "reviewPreview": preview}
                for i, (role, film, preview) in enumerate(s["references"])
            ],
            "prompt": PROMPTS[s["beat"]],
            "reviewedImage": {"file": s["stagedPlate"], **dims(R / s["stagedPlate"]), "sha256": sha(R / s["stagedPlate"])},
            "reviewedImageFull": {"file": s["stagedPlateFull"], **dims(R / s["stagedPlateFull"]), "sha256": sha(R / s["stagedPlateFull"])},
            "installedPlate": {"file": s["installedPlate"], **dims(ROOT / s["installedPlate"]), "sha256": sha(ROOT / s["installedPlate"])},
            "bundledPlate": {"file": s["bundledPlate"], "sha256": sha(ROOT / s["bundledPlate"])},
            "camera": s["camera"],
            "depth": {
                "voteOption": s["depthOption"],
                "voteResult": f"option {s['depthOption']} accepted",
                "prompt": DEPTH_PROMPTS[s["beat"]],
                "reviewedImage": {"file": s["stagedDepth"], **dims(R / s["stagedDepth"]), "sha256": sha(R / s["stagedDepth"])},
                "reviewedImageFull": {"file": s["stagedDepthFull"], **dims(R / s["stagedDepthFull"]), "sha256": sha(R / s["stagedDepthFull"])},
                "installedDepthMap": {"file": s["installedDepth"], **dims(ROOT / s["installedDepth"]), "sha256": sha(ROOT / s["installedDepth"])},
                "bundledDepthMap": {"file": s["bundledDepth"], "sha256": sha(ROOT / s["bundledDepth"])},
                "postProcessing": "trimmed the generator's margin where present, converted to genuine 8-bit greyscale, resized to 960x540, JPEG quality 88 to match the film's other maps. No blur, no inversion, no relighting.",
            },
        }
        shots.append(entry)

    chyron = []
    for name, (x, y, w, h), version, role in CHYRON_FRAMES:
        live = f"public/film/img/s100/{name}.jpg"
        chyron.append({
            "frame": live,
            "usedBy": role,
            "archivedAs": f"public/film/img/archive/s100/{name}--v{version}.jpg",
            "letteringBox": {"x": x, "y": y, "w": w, "h": h},
            "before": f"chyron/before-{name}.jpg",
            "after": f"chyron/after-{name}.jpg",
            "cropBefore": f"chyron/crop-before-{name}.jpg",
            "cropAfter": f"chyron/crop-after-{name}.jpg",
            "sha256": sha(ROOT / live),
        })

    manifest = {
        "date": "2026-11-04",
        "project": "Original Uncut",
        "request": "The closing TV news beat contradicts IMAGE_RECOVERY.md: nw_b1678 carried both Kurose and Ishida's portrait in one screen and nw_b1679 had no picture at all. Rebuild them as two sequential TV frames, voted; then pass over on-screen Japanese signage, starting with the gibberish chyron (耕ニンヌ).",
        "selection": "The two closing-news beats, plus the broadcast lower-third lettering on the four wide shop frames of the same scene.",
        "generation": {
            "provider": "vote (offer_options, 2 candidates per image)",
            "plates": {"attempts": 2, "selected": 2, "skipped": 0},
            "depthMaps": {"attempts": 2, "selected": 2, "skipped": 0},
            "method": "generate_image with offer_options: true; both plates of a pair offered in the same response so the vote is between two candidates for each. References: the shop plate for set and wardrobe, and the character's identity lock only for the face.",
        },
        "installation": "Both beats live on nw_s100 in src/data/nobodys-witness-film.json; plates and their inline copies are bundled for the single-file build. Timing, dialogue, captions, audio and every other beat are unchanged: the two frames split the hold that nw_b1678 already owned (113 + 168 frames, 4.71 s + 7.00 s).",
        "cutModified": True,
        "frameRate": 24,
        "reviewPage": "index.html",
        "readme": "README.md",
        "shots": shots,
        "chyronRepair": {
            "problem": "The third-person wide shop frames each carried the same invented broadcast chyron on the inset television — illegible Japanese-like glyphs with a station badge.",
            "method": "Each frame's own pixels in the lettering area were locally defocused (60% downscale, back up, blur), applied through a feathered mask. No pixel was copied from another frame, nothing was redrawn or lettered, and the rest of each picture is untouched.",
            "sidecar": "studio-edits.json pictureLook['320-the-news-nobody-watches'] is a filename-keyed look for a picture that now runs on no beat. It is left as-is rather than retargeted, because keying a look by filename cannot distinguish the two new beats.",
            "frames": chyron,
        },
    }

    (R / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"wrote {R / 'manifest.json'} ({len(shots)} shots, {len(chyron)} chyron frames)")


if __name__ == "__main__":
    main()
