# Changes in this branch

## Thumbnails for the timeline, the Media Bin and the picture lists

Scrolling the timeline and opening the Media Bin used to pull the full-size pictures: 8.49 MB of the first
screen's 9.55 MB, and 54.2 MB while stepping through scenes 1–20. Lists now use 400 px thumbnails
(0.19 MB and 1.72 MB respectively; the rest of those totals is the viewer's own original picture, the depth
parallax plates and the preloader, which keep the full-size files by design).

- `scripts/make-thumbs.mjs` / `npm run thumbs`: 400 px wide copies of every picture in
  `src/data/media-index.json` under `public/thumbs/` (path mirrored), JPEG sources as JPEG `-q:v 4`, pictures
  with transparency as WebP when the bundled FFmpeg has libwebp (otherwise counted and reported as skipped).
  Incremental, four at a time, progress line, `public/thumbs/index.json` lists what exists. Originals are only
  read — nothing under `public/` or `src/assets/` is touched — and `public/thumbs/` is in `.gitignore`.
- `src/core/thumbs.ts`: `thumbFor(ref)` returns the thumbnail when the index lists the picture, else the
  original. The index is fetched once, lazily; missing/unparseable/no server means originals only. Query
  strings are ignored, `%20` and literal spaces both match, only listed paths are ever returned (no 404s).
- Used in the timeline clip thumbnails (video lane), the depth and cutout lane thumbnails, Media Bin tiles
  (scene and Show everything), AssetBrowser rows. The viewer, depth camera, preloader, MP4 export and the
  bundle keep the originals; the Media Bin hover preview and the picture chooser's preview stay full size.
- `npm run build` (the single-file page) no longer leaves the derived `public/thumbs/` copies in `dist/`:
  a `file:` page always uses the originals, so `vite-plugins/skip-thumbs-in-single-file-build.ts` removes
  that one folder after the build (dist stays 1.7 GB instead of 1.8 GB). `npm run serve` copies no public/
  at all, and `public/` itself is never modified.
- `npm run check:thumbs` (`scripts/check-thumbs.mjs`) drives headless Chromium: first screen lists are
  `/thumbs/…` and under 1.5 MB, the viewer asks for the original, a scroll across scenes 1–20 only asks for
  thumbnails, Media Bin tiles are thumbnails with the original on hover, and with `public/thumbs/` moved away
  every picture still shows from the originals with no failed requests.

## `npm run serve` — the production build is now how the app is run

`npm run dev` stays for coding only; the app is meant to run from a production build. New command:

    npm run serve

- `scripts/serve-local.mjs` builds with `--mode serve` into `dist-local/` and serves it with `vite preview` on
  127.0.0.1:4173 (both ports are now `strictPort`, so a busy port stops with a message instead of moving to a new
  origin and showing an empty project). Node only — no shell commands — so it works on Windows.
- The serve build is a normal multi-file build: `build.copyPublicDir: false` (the 1.7 GB `public/` folder is served
  from the repository, not copied), `assetsInlineLimit: 4096`, and no `viteSingleFile`. `npm run build` still makes
  the single self-contained `dist/index.html`.
- `vite-plugins/public-preview-assets.ts` serves `public/` in preview with sirv (new devDependency): Range requests
  (206) for audio and video, ETag/304, and 30-day cache for `/film/img`, `/film/audio`, `/film/depth`,
  `/sweet-jesus`, `/miami-vice`, `/reels`, `/img`, `/audio`, `/fonts`.
- `vite-plugins/mp4-export-api.ts` is the MP4 export API, moved out of `vite.config.ts` and registered by
  **both** `configureServer` and `configurePreviewServer`, so Export > MP4 and `npm run export` work against
  `npm run serve` (and the frames render from the production build). `vite-plugins/media-library.ts` is the
  existing Scarlett Reel media fallback, now shared by both servers too.
- `scripts/export-mp4.mjs` renders from a running `npm run serve` when it finds one (`http://127.0.0.1:4173`,
  `--url` overrides), instead of starting its own Vite server.
- The production build now reads film pictures, depth maps and audio from its own server instead of
  raw.githubusercontent.com (`src/core/servedMedia.ts`); only a `file:` page falls back to the repository copy.
- Saves are one browser origin, so the app says which one: the Save button's tooltip and the status text read
  "Saved in this browser for http://127.0.0.1:4173" (`src/core/saveLocation.ts`), and a page opened from a file
  shows a one-line warning (`src/components/SaveLocationBanner.tsx`). README has a "Running locally" section.
- `npm run check:serve` (`scripts/check-serve.mjs`) drives headless Chromium against the running server: editor
  opens, edit survives Save + reload, picture/depth/audio (206) load, and a 24-frame draft MP4 comes out one second
  long.

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

- **Thirty keyframes installed, covering 128 beats across S02–S12.** The first ten (S02–S05) are listed below;
  the second ten add `s05-03-drawer`, `s06-01-hired`, `s06-02-ledger-page`, `s06-03-the-advance`,
  `s07-01-the-suit`, `s07-02-counting`, `s07-03-biscuit-tin`, `s08-01-under-the-table`,
  `s08-02-pencilled-thirteen` and `s08-03-the-cassette`; the third ten add `s09-01-stamp`,
  `s09-02-lot-thirteen`, `s09-03-telephone`, `s10-01-sandwich-line`, `s10-02-dorothy`, `s10-03-the-note`,
  `s11-01-the-books`, `s11-02-bent-nib`, `s11-03-the-drawer` and `s12-01-auction-window`. Each is prompted from
  its room plate plus the voted cast portrait and prop sheet for whatever is in frame:
  `s02-01-coffee`, `s02-02-officers`, `s02-03-bug-doorway`, `s03-01-stoop`, `s03-02-coroner-van`,
  `s04-01-counter`, `s04-02-receipt`, `s04-03-seed-wrapper`, `s05-01-bag-note`, `s05-02-pike`.
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
- **9 November 2026 — one duplicate bridge (`nw_b166`, scene 6):** the repeated interview-room image at `nw_b163`–`nw_b166` now cuts to a separately voted close-up of Vera on her existing “Stop saying that” beat, before the cup-crush shot. Option 2 was selected using the first and last frames as references. A guarded v19 migration upgrades only Original Uncut where the original image is still present; custom active/stashed images, audio, captions and total timing are preserved. The current audit is 924 adjacent pairs (24 cross-scene), down from 925 in this checkout. Prompt and selected original: `reviews/uncut-duplicates-20261109/`.
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

## Miami Vice - Salt Water (new film, first slice)

An original feature in the season-four register, night-heavy Miami, built on the same
toolchain as Sweet Jesus.

- `src/data/miami-vice.fountain` - the screenplay: 95 scenes, 442 beats. A dock foreman
  who counts the crates twice, a relief charity with a laundering route through Nassau
  called Salt Water, a federal agent running a witness by letting half of it through, and
  a surveillance man who has been handing their movements to a bookie for eight months.
- `scripts/build-miami-vice.mjs` (`npm run build:miami-vice`) - compiles the Fountain
  draft into `src/data/miami-vice-film.json` (ids `mv_*`).
- `public/miami-vice/characters/*.png` - ten generated casting plates: Crockett, Tubbs,
  Castillo, Gina, Trudy, Switek, Zito, Izzy, plus two originals for the new plot, Marta
  Escobar (the charity director) and Ray Coburn (the federal agent).
- `scripts/build-miami-vice-previews.sh` (`npm run build:miami-vice-previews`) - 1024x576
  JPEG previews into `src/assets/miami-vice/portraits/`; the originals are never touched.
- `src/core/miamiViceCharacters.ts` + `src/data/miami-vice-characters.json` - cast
  references with wardrobe and continuity notes; `src/components/MiamiViceCast.tsx` is
  the gallery, reachable from the topbar when the Miami Vice film is open.
- `src/core/bundledFilms.ts` - `miami-vice-film` is now a selectable built-in film; the
  screenplay downloads from the topbar button.

Draft length after the Act II pass: 115 scenes / 994 beats, 86 minutes of compiled beat
time. Compiled beat time runs roughly a third of screen time (dialogue is timed at
fourteen characters a second and action shots cap at nine seconds), so this is a feature
draft. Act III gets the same treatment next, then locations, props and keyframes.

Act III added: Lupe running from the county home to Tubbs' car, Marta's telephone call in a
rain-soaked booth - she is Coburn's witness and she has scheduled the truth for a Wednesday - Izzy driving the
donation truck in, the shootout in the racking, Prieto's answer, Coburn's car with a child in it, the causeway
standoff where Tubbs has the shot and lowers it, and the ledger traded for a twelve-year-old.

Draft length after the Act III pass: 122 scenes / 1,192 beats, 102.6 minutes of compiled beat time, which is roughly
a two-hour film once action shots play out. Locations, props and keyframes come next.

Act II added: the buy money and its band numbers, a bank room with no name on the door,
Switek taking two thousand dollars in a parking lot, the tape of the truck that leaves at
three, the mule who walks behind it, Eddie's autopsy (a broken arm, graphite on the palm),
Crockett recording his own badge number below decks, Coburn's locker, and the Miramar,
where Burnett is spent to pull Gina out of a van.

## Miami Vice - cast fix, first location plates, music supervision

- **Tubbs recast.** The casting plate for Ricardo Tubbs was regenerated: close-cropped
  hair, clean-shaven, charcoal suit over an open collar with a thin gold chain, and an
  explicit "no moustache, no sunglasses, no weapon" line in the prompt. The preview was
  rebuilt; the original in `public/miami-vice/characters/` is the new one.
- **Nine location plates** (`public/miami-vice/locations/`, previews in
  `src/assets/miami-vice/locations/` at 1280x720), described in
  `src/data/miami-vice-locations.json` with camera design and continuity notes and keyed
  to their scenes through `MIAMI_VICE_LOCATION_BY_SCENE`: the OCB bullpen, the container
  yard, the St. Vitus, the warehouse on the river, the Carlyle bar, Marta's office, the
  causeway, the thrift store and the Hotel Miramar pool. Roughly a dozen remain - the
  Castillo office, the Marin kitchen, Izzy's lot, the bookie's back room, the bank room
  with no name, the airstrip, the hospital, Ocean Drive and the rest.
- **Music**: `docs/miami-vice-music.md` and 29 cues in `src/data/miami-vice-music.json`,
  keyed to scene ids. Original synth score in the Jan Hammer register, five licensed
  period songs (Glenn Frey x2, Sade, Phil Collins, Jan Hammer), and source music in every
  location - salsa at the docks, a ball game in the bookie's back room, a house pianist
  at the Carlyle, a cover band at the Miramar.
- `npm run build:miami-vice-locations` added. Suite is 34 files / 244 tests green.

## Miami Vice - location plates, second batch

Ten more plates, for nineteen in total covering 84 of the film's 122 scenes:

Castillo's office, the Marin kitchen, Izzy's lot, the bookie's back room, the bank room
with no name on the door, the Everglades airstrip, the hospital corridor, Ocean Drive,
county family services, and the glass office inside the warehouse.

Each plate carries camera design notes and continuity notes in
`src/data/miami-vice-locations.json`, and is keyed to its scenes through
`MIAMI_VICE_LOCATION_BY_SCENE`.

Still to plate (38 scenes, roughly fifteen more sheets): the federal building, the OCB
evidence room and cage, the interrogation room, the locker room, the hallway, the Little
Havana cafeteria, Switek's car and apartment, the sorting room, the river channel, the
surveillance van, the warehouse loading dock, the dog track, the rooftops, the morgue, the
St. Vitus cabin, the Carlyle suite and street, the school, Gina's apartment, the alley, the
Miramar corridor, Tubbs' car, the beach at dawn and the cemetery. Then the prop sheets,
then two to three keyframes a scene.

## Nobody's Witness — 359 "Eat. Then go." retake (4 November 2026)

The director flagged `359-eat-then-go` (scene 17, beat `nw_b472`, "Kaneko sets a bowl of
noodles in front of Jack"): Jack was standing on the wrong side of the counter, inside
the kitchen workspace beside the stockpot and burner. The still was regenerated with the
two-option vote, prompted from the flawed frame plus `358-the-empty-third-stool` (Jack's
customer-side seating) and `187-you-got-old` (the scene's establishing staging). Option 2
was selected: Jack seated on a stool on the customer side, the full counter between him
and Kaneko, the bowl set down in front of him, the two old customers still at the far end.

- Full-size voted original (2752x1536): `public/film/img/retakes_2026_11_04/359-eat-then-go-r1.jpg`.
- Previous frame archived: `public/film/img/archive/s17/359-eat-then-go--v1.jpg`.
- Installed at the original path `public/film/img/s17/359-eat-then-go.jpg` (1920x1080,
  centre-cropped from the voted original, quality 90). Both media indexes list the new
  archive and retake paths; the retake also shows as an alternative in the Media Bin's
  scene 17 view (same leading shot number).
- Beat `nw_b472` keeps its picture path, dolly, timing, captions and the bowl-set-down
  SFX; no other cut or beat changed. The beat has no depth rig, so no depth map was needed.

## Nobody's Witness — 275 "The kiss" retake (4 November 2026)

The director flagged `275-the-kiss` (scene 53, beat `nw_b899`, "she kisses him. Or he
kisses her"): the existing frame only touched foreheads and noses, not lips. A new frame
was regenerated with the two-option vote, prompted from the existing still plus
`219-pink-water` (the room and kneeling staging) and `474-careful-steady` (the plaster,
the bloodied shoulder, the cloth). Option 1 was selected: an actual closed-mouth kiss,
his hand cupping her jaw, same white-tiled bathroom, bowl of pink water on the floor.

- **Added, nothing deleted.** The original `public/film/img/s53/275-the-kiss.jpg` is
  untouched and stays in the scene folder as an alternative in the Media Bin.
- Full-size voted original (1376x768): `public/film/img/retakes_2026_11_04/275-the-kiss-r1.jpg`.
- Installed copy `public/film/img/s53/275-the-kiss-r1.jpg` (1920x1080, centre-cropped
  from the voted original, quality 90); beat `nw_b899` now points at it.
- Both media indexes list the two new paths. The beat keeps its zoom-hold, focal point,
  timing and captions; no other beat or cut changed. The beat has no depth rig.

## Nobody's Witness — 225 "Bring her" retake (4 November 2026)

The director flagged `225-bring-her` (scene 58, beat `nw_b962`, "Vera eats. All of it. She
laughs once, at nothing, wiping her eyes"): a pile of banknotes and coins sat on the
counter, but the money is only put down later, at `nw_b966` ("Vera puts money on the
counter. Too much.", still `476-too-much`). The frame was edited with the two-option vote
to erase only the money and restore the bare wooden counter; option 2 was selected.
Everything else is unchanged — Vera laughing and wiping her eye, her bowl and chopsticks,
Kaneko at the steaming pot, the sign, steam, curtain and condiments.

- **Added, nothing deleted.** The original `public/film/img/s58/225-bring-her.jpg` is
  untouched and stays in the scene folder as an alternative in the Media Bin.
- Full-size voted original (2096x1184): `public/film/img/retakes_2026_11_04/225-bring-her-r1.jpg`.
- Installed copy `public/film/img/s58/225-bring-her-r1.jpg` (1920x1080, centre-cropped
  from the voted original, quality 90). Both the scene `nw_s58` background and beat
  `nw_b962` now point at it.
- Both media indexes list the two new paths. The beat keeps its dolly, focal point,
  timing and captions; no other beat or cut changed. The scene has no depth rig.

## Nobody's Witness — 476 "Too much" retake (4 November 2026)

The director flagged `476-too-much` (scene 58, beat `nw_b966`, "Vera puts money on the
counter. Too much. Kaneko notices and says nothing"): the frame showed a huge mound of
banknotes and dozens of coins, and the counter was a glossy orange wood that did not match
the rest of the scene. The first edit vote was skipped (both candidates rejected); a fresh
generation anchored to the scene's own counter (`225-bring-her-r1`, `475-the-chopsticks-stop`)
and the same bar's modest overpayment (`s17/360-more-than-the-bowl-costs`) was then voted,
and option 2 selected: a small overpayment of a couple of folded notes and about a dozen
coins on the dark, matte, worn wooden counter, Vera's hand setting them down, Kaneko at the
steaming pot, the empty bowl at right.

- **Convention clarified by the director: keep the files, replace the frame.** The old
  frame is archived (not deleted) and the new frame is installed at the original path, so
  the beat keeps its picture path and no film JSON change is needed.
- Old frame archived byte-for-byte: `public/film/img/archive/s58/476-too-much--v1.jpg`.
- Full-size voted original (1360x768): `public/film/img/retakes_2026_11_04/476-too-much-r1.jpg`.
- Installed at the original path `public/film/img/s58/476-too-much.jpg` (1920x1080,
  centre-cropped from the voted original, quality 90). Beat `nw_b966` still points here.
- Both media indexes list the new archive and retake paths. The beat keeps its zoom-hold,
  focal point, timing and captions; no other beat or cut changed. The scene has no depth rig.

## Nobody's Witness — Sakai altar photograph identity fix (4 November 2026)

The director flagged that every Sakai-house altar picture showed a photograph of a man
who did not look like Sakai. The altar portrait is now locked to the established scene-1
Sakai identity (`s1_new/style-sheets/refs/sakai-face.jpg` and `old-man-sakai.jpg`): grey
tweed flat cap, narrow lined face, hooded eyes, white-grey stubble, gentle closed-mouth
smile. A single memorial portrait was generated (`public/film/img/props/sakai-altar-portrait.jpg`)
and used as the identity reference for every frame edit, so the photograph is the same
man in every shot.

Corrected frames (old files archived, frames replaced at their existing paths):

- Scene 29: `204-the-tea-she-does-not-want-to-pour`, `273-the-receipts`,
  `354-the-altar-photograph`, `357-heavier-than-me`, `457-a-man-a-debt`.
- Scene 59: `364-the-kotatsu`, `365-the-altar`, `367-the-phone-rings`, and the active
  `retakes_2026_10_20/365-the-altar-r1` take used by beat `nw_b972`.
- Full-size corrected takes are under `public/film/img/retakes_2026_11_04/`; prior files
  are preserved under `public/film/img/archive/…--vN.jpg`.
- Depth: `354-the-altar-photograph` has a separate clean plate, so
  `/film/depth/s29/354-the-altar-photograph/plate.jpg` was replaced with the corrected
  frame and the old plate archived under `/film/depth/archive/…/plate--v1.jpg`. Its depth
  map and the two character cutouts are unchanged because the room/people geometry was
  preserved. `364` and `367` have depth maps but no separate plate; the parallax renderer
  falls back to the corrected background picture, so no depth JSON change was needed.
- No beat picture paths, timing, captions, audio or cuts changed. Both media indexes list
  the new portrait, corrected takes and archives. Review notes and a contact sheet are in
  `reviews/sakai-altar-20261104/`.

Validation: `npm test` passed (647 passed, 24 skipped); both media indexes are sorted,
unique and contain every corrected path; all active beat paths and depth references still
resolve; `git diff --check` clean.

## The closing news is two frames again, and the invented chyron is gone

`IMAGE_RECOVERY.md` requires `nw_b1678` and `nw_b1679` to be **two sequential TV frames — Kurose first, then
Ishida's police portrait**. As shipped, `nw_b1678` used one picture with both men crammed onto a single screen and
`nw_b1679` fell back to that same picture, so the epilogue showed no second frame at all.

Two plates were generated from the shop's own set plate (`s100/158-the-third-stool.jpg`) plus one identity
reference each, offered as a two-candidate vote, and installed as `s100/1678-the-evening-news-kurose.jpg` and
`s100/1679-the-photograph-of-ishida.jpg`, each with a voted depth map (`/film/depth/recreated-uncut/`,
960x540 greyscale, `push`, amount 0.22). The two beats **split the hold `nw_b1678` already owned** — 4.71 s for
the news, 7.00 s for the portrait, held through `nw_b1680` — so beat count, total duration, captions, voice and
music are unchanged; Neo-Noir simply gains one clip (705 -> 706). The superseded two-in-one frame is archived as
`archive/s100/320-the-news-nobody-watches--v2.jpg` and now runs on no beat. Its depth folder and the filename-keyed
`pictureLook` entry in `studio-edits.json` are deliberately left alone: one filename cannot carry two cameras.

The same request asked for a pass over on-screen Japanese signage. The gibberish (耕ニンヌ) was a broadcast chyron
drawn on the inset television in **all four** wide shop frames — `158`, `159`, `160` and `161` — not only the news
beat. Each frame's own pixels in the lettering area were locally defocused through a feathered mask (60% downscale
and back up, small blur): no pixels copied between frames, nothing redrawn or lettered, everything else untouched.
Archives are `archive/s100/<name>--v4.jpg`. The shop's 金子 sign, the investigations card (ジャック・探偵社 /
東京都千代田区神田1-2-3), the cassette label, the clipping and the letter were checked and are correct, so they were
left alone; no depth map covered the four repaired frames, so none needed re-tracing.

Playback bookkeeping: the closing shot (`320`) is now the only picture in `public/film/img/s100/` that no beat
uses. `src/core/closing-news.test.ts` pins the two-frame rule, the order, the holds, the 1920x1080 plates, both
indexes and the archives. `src/core/turn28.test.tsx` and `src/core/turn32.test.tsx` were updated for the 9-picture
epilogue and the 706-clip Neo-Noir cut.

Validation: `npm test` passed (654 passed, 24 skipped); both media indexes are sorted, unique and contain every
new path; `git diff --check` clean. Prompts, votes, digests, before/after chyron crops and a numbered review
gallery are in `reviews/tv-news-20261104/`.

## Scene 1's refusal reads at last, and the blood is where the director counted it

`TODO-FILM.md` §1, done in full: four pictures, each picked by the director from a two-option vote, and the beats
rewired around them. Review notes, prompts, votes and digests live in `reviews/s1-blood-and-refusal-20261105/`.

- **The head shake, two frames cut together.** `nw_b25` now plays the new `s1/384-he-half-turns.jpg` (head half-turned,
  eyes already leaving her) on "Then he shakes his head. Barely."; an inserted beat `nw_b1722` plays
  `s1/385-he-turns-the-other-way.jpg` (head fully to the other side, near-profile) on "A man refusing a stranger.";
  a second inserted beat `nw_b1723` carries the old wide `331-he-refuses.jpg` — still playing, untouched — on "And he
  turns his back on her, slowly, to face the road.", keeping its depth camera. The beat's line is only split at sentence
  boundaries; no words changed. Both new pictures keep the lane's geometry (barbershop left, vending machine right,
  bar glow far) and Sakai's locked face, cap and cheap raincoat, and carry no depth map, so no cut-outs were needed.
- **Blood under Mara's hand (`14-she-kneels.jpg`, `nw_b39`).** Every model refused eight edit attempts on this frame
  (full frame, 1920 copy, face-free crops; "red dye", "scarlet dye", "dark thick red liquid", paint-packet phrasing);
  the colourless "the hand is leaking dye" passed on a palm-only crop and the director voted it. The dye came out
  glossy black; a hue-shifted scarlet variant was built for comparison and refused ("never mind i like the black one").
  Because the edit re-rendered the crop's folds, only the dye pixels were lifted (strict luminance mask, closed,
  boxed, feathered) onto the original coat under her palm — the rest of the frame is pixel-identical. The old picture
  is archived `archive/s1/14-she-kneels--v5.jpg`; the beat's depth plate and cut-out carry the same stain through a
  difference mask split by the cut-out alpha, archived as `depth/archive/s1/14-she-kneels/plate--v1.jpg` and
  `cutout-1--v1.png`; `depth.png` unchanged (geometry unchanged).
- **A stream of blood in the water (`15-the-grip.jpg`, `nw_b42`).** A clean pixel edit, voted option 1; hands, key and
  ripples untouched. Old picture archived `archive/s1/15-the-grip--v4.jpg` (v1–v3 are older takes).
- **The puddle (`s1/386-the-puddle-leaking-blood.jpg`).** Three vote pairs were skipped; the director set the framing
  by question (ground-level, low) and the phrasing ("dark thick red liquid"). Installed as an inserted beat `nw_b1724`
  after the key (`nw_b46`) on the director's own words, "On the pavement: a puddle of rainwater, leaking blood.";
  she-runs and the open bag follow as pictures 24/25. Nothing else in frame, as noted.
- House rules kept: nothing overwritten without an archive, nothing downscaled (the 1672×941 and 2048×2048 votes were
  cropped to 16:9 and enlarged to house size, the 2730-wide takes kept their size), new pictures got new file names,
  both media indexes list every new picture and archive, and `npm run thumbs` regenerated the 400 px thumbnails.
  An early command in the session briefly clobbered the historic `--v1` archives of both retakes; they were restored
  from git before archiving continued at the right numbers.
- Validation: `npx vitest run` green after moving three count pins (uncut frames 1618→1621 in `turn21`/`turn28`,
  Neo-Noir clips 706→709 in `turn32`) for the three inserted beats; indexes sorted and unique; `git diff --check` clean.
- `TODO-FILM.md` §1 is marked done with an install note; §2 (Mara knows the driver by his voice) remains open.
