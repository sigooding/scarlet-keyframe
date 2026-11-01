# Changes in this branch

## Sweet Jesus — location and prop reference sheets (in progress)

The remaining Sweet Jesus pictures are being built **sheets first**: every room, exterior and vehicle in the
screenplay gets a 16:9 production-design plate with no people in it, and every item the story turns on gets its own
prop sheet. Scene stills are then generated against those sheets plus the voted cast portraits, so a room looks like
the same room in every scene that uses it.

- **Rule adopted this session:** create the reference sheets for the rooms, and for any locations and items used,
  before generating the scene stills that take place in them.
- **All twenty location plates are in** (`public/sweet-jesus/locations/`, 16:9, ~1376×768 originals), covering
  every place in the screenplay except the launderette, which already has its own voted references:
  `ray-flat`, `ray-stoop`, `bug-room`, `morgue`, `jack-office`, `coffee-shop`, `back-office`, `property-office`,
  `church-kitchen`, `church-basement`, `church-yard`, `auction-office`, `navy-gate`, `pool-hall`, `pike-car`,
  `diner`, `vera-car`, `payphone`, `warehouse`, `clinic`.
- **All twenty prop sheets are in** (`public/sweet-jesus/props/`, 16:9, shot alone on a neutral seamless ground):
  `ledger`, `stamp`, `glassine-note`, `tape-loop`, `transfer-slip`, `laundry-receipt`, `cash-envelope`,
  `coin-box`, `pinball-machine`, `hearse`, `revolver`, `pike-photo`, `pike-badge`, `nicky-cart`, `seed-twist`,
  `wheelchair`, `hand-truck`, `two-recorders`, `evidence-bag`, `ledger-copies`.
- `npm run build:still-plan` writes `reviews/sweet-jesus-sheets-20261031/scene-stills-plan.json`: the shooting
  order for **89 stills across the 29 scenes after the opening** (2 a scene up to eight beats, 3 above, 12 for
  the 76-beat warehouse climax). Each entry lists the room sheet, the prop sheets, the cast portraits in frame and
  every beat it must cover, so a still is prompted from its own room, people and objects.
- Voices that are heard but never seen — Peanut on tape, the man on the step, the O.S. neighbours — are listed as
  `heardNotSeen` and kept out of `cast`, so no still puts a dead boy in frame. `src/core/still-plan.test.ts`
  enforces that, and that the plan's beat list still matches the compiled storyboard.
- `src/data/sweet-jesus-props.json` records where each item comes from, what it must look like and the scenes
  it travels through; `src/core/sweetJesusProps.ts` exposes `PROPS_BY_SCENE`, so a still for any scene can be
  prompted with the room, the people and the objects in it.
- `src/data/sweet-jesus-locations.json` holds each sheet's kicker, alt text, design/staging direction and a
  continuity lock naming the props that live there; `src/core/sweetJesusLocations.ts` bundles the previews and
  maps every sheet to the scenes that use it (`LOCATION_BY_SCENE`).
- `npm run build:location-previews` (ImageMagick) rebuilds the 1280×720 letterboxed previews from the preserved
  originals in `public/`; nothing is cropped or stretched.
- Prompts, plate labels and a numbered gallery are in `reviews/sweet-jesus-sheets-20261031/`
  (`python3 build-gallery.py` rebuilds `index.html` from `prompts.json`; the gallery links to the single
  full-size copy of each plate rather than duplicating it).
- Four scene stills were drafted before this rule (`public/sweet-jesus/scenes/s02-*`, `s03-01-stoop`); they will be
  regenerated against the new room sheets.

## Sweet Jesus — scene keyframes (in progress)

Every still from here on is a **keyframe of the film**, not a reference plate: the characters are acting the
beat, in the room from the location sheets, holding the props from the prop sheets, lit and composed as a shot.

- Ten keyframes installed, covering **38 beats across S02–S05**: `s02-01-coffee`, `s02-02-officers`,
  `s02-03-bug-doorway`, `s03-01-stoop`, `s03-02-coroner-van`, `s04-01-counter`, `s04-02-receipt`,
  `s04-03-seed-wrapper`, `s05-01-bag-note`, `s05-02-pike`. Each is prompted from its room plate plus the voted
  cast portrait and prop sheet for whatever is in frame.
- `src/data/sweet-jesus-shots.json` is the shot list: label, alt text, a note on what the frame has to carry, the
  scene, the exact beats it covers, and the location, cast and props it was generated from.
  `src/core/sweetJesusShots.ts` bundles the previews (1024×576, a third of a 1280×720 plate — 89 of them are
  inline assets) and fills only blank beats, so dialogue, captions, timing, deliberate gaps and any custom
  picture a user has set are untouched.
- `createBundledFilm` now applies the shot upgrade after the opening one. Beat pictures are `asset:sj-shot-v1-*`.

- A selected caption can be split at the playhead with S or Split CC without splitting its picture or audio clip. The cue text is divided at an estimated word boundary and can be edited afterwards; single-word cues cannot be divided this way. With no caption selected, Split continues to split the picture clip.
- The marker name editor is positioned above the timeline toolbar controls so its buttons remain accessible.
- Original imported source images remain unchanged.

## Recovery limitation

The workspace was reset to the base checkout during this session. The previously generated and voted images and other earlier uncommitted work (including Directed Uncut and character cutout) were not available in this checkout. Image recreation is underway; see IMAGE_RECOVERY.md for what has been recreated and what remains. The other earlier features have not been restored.

## MP4 export browser selection & GPU acceleration

- On Windows and macOS, MP4 export can use an installed Chrome or Edge when Playwright's Chromium is not installed. The serverless Chromium package is used only on its supported Linux x64 platform. If no browser can launch, export now explains how to install one or configure `PLAYWRIGHT_CHROMIUM_PATH`.
- MP4 export now enables hardware GPU acceleration by default (`--gpu`, with `--no-gpu` CPU override and an in-app **GPU acceleration** toggle): Chromium launches with hardware WebGL, 2D canvas, and OOP GPU rasterization (with automatic SwiftShader fallback if hardware GPU init fails), and FFmpeg probes hardware H.264 encoders (`h264_nvenc`, `h264_videotoolbox`, `h264_amf`, `h264_qsv`, `h264_vaapi`) with automatic `libx264` fallback and concurrent session-cap staging.
- Export supports up to 6 parallel Chromium + FFmpeg segment workers (`1..6` in the Export Modal and `--workers 1..6` on the CLI), launching worker browsers concurrently.

## Original Uncut long-hold coverage

- Fourteen separately voted intermediate stills (`v7–v11` and `v16`) have been added at existing beat boundaries; the original source pictures, dialogue, captions, audio and total timing remain intact. Existing Uncut saves are upgraded only where their current pictures still match the original; custom active and stashed pictures are preserved. Other cuts are unchanged.
- The reproducible audit in `scripts/audit-uncut-holds.ts` reports both scene-bounded and continuous still-image holds, including pictures carried over scene boundaries. Its current normal-playback result is 300 continuous holds over seven seconds (295 scene-bounded), so this work remains incomplete. See `IMAGE_RECOVERY.md` for accepted and rejected votes, exact prompts, the continuation prompt and remaining earlier recreations.

## Original Uncut adjacent duplicate images

- Twenty randomly selected duplicate pairs (`v12–v16`) have separately voted replacements at their existing beat boundaries. The original stills, dialogue, audio, captions and timeline duration remain intact; guarded v12–v16 migrations preserve direct and carried custom pictures in active or stashed saves. V15–v16 also protect explicit holds and shot-specific edits and roll back changes that would affect another frame's effective picture or look. Other cuts are unchanged.
- At the user's request Harada's initial tight crop was replaced with a separately voted wide newsroom shot. The earlier selected image remains saved; the v13 migration changes the previous bundled shot only where other pictures and effective looks remain intact.
- `scripts/audit-uncut-duplicates.ts` reports adjacent stills sharing the same effective image reference, including short holds and cross-scene pairs. The factory cut went from 914 to 894 pairs; this is incomplete and does not detect differently named files with identical pixels. See `IMAGE_RECOVERY.md` for exact prompts, votes and continuation instructions.

## Faster MP4 export

- The export dialog now starts at a worker count derived from the machine's CPU count (up to 6) instead of always 1. Export is CPU-bound per worker, so a single worker wasted most of a laptop; each worker adds one Chromium (about 300-600 MB RAM).
- New `--capture <auto|png|jpeg>` and `--capture-quality <1..100>` (UI: **Capture: Auto / JPEG fast**, default q97). `auto` keeps the old pairing (PNG for Master, JPEG q92 for Draft); `jpeg` captures Master frames as high-quality JPEG, which is far cheaper to encode and pipe and halves FFmpeg's decode work. The FFmpeg decoder now always matches the capture format, so a JPEG master is not fed to the PNG decoder.
- Frame capture goes straight to CDP `Page.captureScreenshot` with `optimizeForSpeed: true` instead of Playwright's `page.screenshot()`, removing per-frame emulation/layout round trips and trading a slightly larger PNG for a much faster encoder; it falls back to Playwright if the browser rejects the call.
- Each export prints per-frame stage timings (`setFrame`, `capture`, `pipe/write`) and suggests more workers when it ran with one. See README "Making MP4 export faster" for the whole picture, including why GPU memory does not help.

## Real depth maps for eleven recreated Uncut stills

- Eleven recreated Original Uncut stills that had no 2.5D camera now have their own greyscale depth maps, each voted between two candidates: `nw_b1562` (2), `nw_b465` (1), `nw_b1316` (1), `nw_b17` (2), `nw_b27` (1), `nw_b38` (1), `nw_b716` (1), `nw_b1054` (2), `nw_b1073` (1), `nw_b1351` (1) and `nw_b1464` (1). Prompts, digests, full-size voted PNGs and a numbered review gallery are in `reviews/depth-maps-20261031/`.
- Each map was generated from its own plate only, converted to true greyscale, resized to 960x540 and saved as JPEG quality 88 like the film's existing depth maps. Nothing was inverted or relit; `nw_b1351`'s copied ceiling tubes were flattened with a graded mask, and the raw vote is kept.
- `nw_b1349` and `nw_b1358` were rejected and deliberately left without a depth map: every candidate copied the office's bright fluorescent ceiling into the map as a near-plane band. Their prompts are kept for a retry.
- `RECREATED_DEPTH_MAP_BY_BEAT` and upgrade version 18 add the maps to an already-saved active or stashed Original Uncut only where the recreated plate is still showing and the shot has no depth rig of its own. Each shot plays as a static 8-second depth push (amounts 0.26-0.34); a `dolly` preset is re-based to `static` since a dolly cannot be combined with a depth camera, keeping its focal point, grade and timing. Pictures, dialogue, captions, audio, total duration and other cuts are unchanged.
- The maps are bundled inline, so the single-file build needs no server; full-size copies are in `public/film/depth/recreated-uncut/` and listed in both media indexes.

## Faster MP4 export

- The export dialog now starts at a worker count derived from the machine's CPU count (up to 6) instead of always 1. Export is CPU-bound per worker, so a single worker wasted most of a laptop; each worker adds one Chromium (about 300-600 MB RAM).
- New `--capture <auto|png|jpeg>` and `--capture-quality <1..100>` (UI: **Capture: Auto / JPEG fast**, default q97). `auto` keeps the old pairing (PNG for Master, JPEG q92 for Draft); `jpeg` captures Master frames as high-quality JPEG, which is far cheaper to encode and pipe and halves FFmpeg's decode work. The FFmpeg decoder now always matches the capture format, so a JPEG master is not fed to the PNG decoder.
- Frame capture goes straight to CDP `Page.captureScreenshot` with `optimizeForSpeed: true` instead of Playwright's `page.screenshot()`, removing per-frame emulation/layout round trips and trading a slightly larger PNG for a much faster encoder; it falls back to Playwright if the browser rejects the call.
- Each export prints per-frame stage timings (`setFrame`, `capture`, `pipe/write`) and suggests more workers when it ran with one. See README "Making MP4 export faster" for the whole picture, including why GPU memory does not help.

## Real depth maps for three recreated Uncut stills

- Three recreated Original Uncut stills that had no 2.5D camera now have their own greyscale depth maps, each voted between two candidates and all three accepted: `nw_b1562` (option 2), `nw_b465` (option 1) and `nw_b1316` (option 1). Prompts, digests, full-size voted PNGs and a numbered review gallery are in `reviews/depth-maps-20261031/`.
- Each map was generated from its own plate only, trimmed, converted to true greyscale, resized to 960x540 and saved as JPEG quality 88 like the film's existing depth maps. Nothing was blurred, inverted or relit.
- `RECREATED_DEPTH_MAP_BY_BEAT` and upgrade version 17 add the maps to an already-saved active or stashed Original Uncut only where the recreated plate is still showing and the shot has no depth rig of its own. Each shot plays as a static 8-second depth push (amounts 0.28 / 0.26 / 0.26); a `dolly` preset is re-based to `static` since a dolly cannot be combined with a depth camera, keeping its focal point, grade and timing. Pictures, dialogue, captions, audio, total duration and other cuts are unchanged.
- The maps are bundled inline, so the single-file build needs no server; full-size copies are in `public/film/depth/recreated-uncut/` and listed in both media indexes.

## Ten-shot voting fallback

- The no-vote image provider returned HTTP 403 on retry, so the user requested voting instead. Nine selected images were installed; `nw_b87` was skipped and remains unchanged. The selected originals, numbered review gallery, reference previews and exact prompts are in `reviews/uncut-no-vote-20261030/`.
- Three additional directory-only ten-shot review batches (`reviews/uncut-no-vote-20261030-batch2/`, `-batch3/`, and `-batch4/`, saving 7, 8, and 6 voted frames respectively) are preserved with their manifests and side-by-side galleries without modifying any cut (`cutModified: false`).
- Directory-only batch 5 (`reviews/uncut-no-vote-20261030-batch5/`) saves ten more randomly chosen hold targets — `nw_b963`, `nw_b658`, `nw_b40`, `nw_b1371`, `nw_b730`, `nw_b504`, `nw_b349`, `nw_b1441`, `nw_b1167` and `nw_b1078` — each chosen between two candidates and recorded with its exact prompt, reference previews and hold split. The first unvoted burst returned HTTP 403 for nine of the ten prompts; retrying them as two-candidate votes succeeded for every shot, so voting is the working generation path. No cut was modified (`cutModified: false`); the selected frames are saved under `images/` only.

- Directory-only batch 6 (`reviews/uncut-no-vote-20261030-batch6/`) saves six more randomly chosen hold targets — `nw_b1335`, `nw_b93`, `nw_b1102`, `nw_b614`, `nw_b1299` and `nw_b51` — each voted between two candidates. All six are saved exactly as generated (no crop, resize or re-encode) and the original source pictures are untouched; nothing was installed, so no cut changed (`cutModified: false`).
- Directory-only batch 7 (`reviews/uncut-no-vote-20261030-batch7/`) votes six more randomly chosen hold targets — `nw_b634`, `nw_b363`, `nw_b703`, `nw_b1123`, `nw_b1452` and `nw_b1639`. Five were selected and saved exactly as generated; `nw_b363` was skipped twice and left unsaved with both prompts recorded. Originals are untouched (no crop, resize or re-encode) and no cut changed (`cutModified: false`).
- Directory-only batch 8 (`reviews/uncut-no-vote-20261030-batch8/`) votes three final randomly chosen hold targets — `nw_b932`, `nw_b470` and `nw_b414`. All three candidate pairs were rejected, so nothing was saved; the prompts, reference previews and gallery are kept for a later retry. Originals untouched and no cut changed (`cutModified: false`).
## Select and grade image frames

- Use Ctrl+A (Cmd+A on Mac), or **Select all images** in the timeline, to select all still-image frames. Text fields keep their normal Select All shortcut; videos, gaps, gradients and other non-image frames are excluded.
- In the Clip inspector, expand **Camera & effects → Grade & texture** and change a setting. It applies to every selected image frame in one undoable edit; camera, timing, audio and other effects are preserved. Other effect groups still affect only the current frame.
