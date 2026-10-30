# The cold open — second-pass plates

Retakes of the `Untitled: the cold open` boards. The first pass (the 39 painted boards the reel shipped with) is still in
`../hangar/`; nothing here replaces it on disk. The playable second pass is `src/data/hangarColdOpenV2Reel.ts`, where every
picture that has a file in this folder is swapped in and everything else keeps its first-pass board.

```
sheets/       character, vehicle and prop model sheets (16:9) — the references every shot is drawn against
backgrounds/  the location paintings, empty, plus the flare version of the creek and the key art
shots/        the shot plates, named exactly as the first-pass files they replace (04-wright-patterson-night.jpg …)
alt/          alternate takes, kept but not wired in — promote one by moving it up into shots/
```

Rules that matter here:

* **File names are the wiring.** A plate is used only if its file name matches a first-pass picture name, so
  `shots/07-coffee-ring.jpg` replaces the board of the same name. Anything else in the folder is ignored.
* **No lettering.** Every stencil panel and sign is painted blank; `WRIGHT FIELD 1944 — INERT`, `AGRICULTURAL EQUIPMENT`
  and `WEIGH STATION — ALL TRUCKS MUST ENTER` are set in a stencil face in post, because generated type garbles and a
  garbled stencil reads as damage to the prop the film turns on.
* **Beat 1 is black.** `01-black-radio.jpg`, `02-three-quick-one-slow.jpg` and `03-gunfire-silence.jpg` are pure black on
  purpose: the pilot's radio, the clicking and the gunfire are heard over black, and no picture is shown.
* **2.39:1 safe.** Plates are 16:9 and composed inside a centre band, because the reel letterboxes the frame.
* **The robot stays unseen.** Nothing in the woods, the straw or the inside of the crate may read as a figure.

## Where the pass stands (18 October 2026)

All 60 plates are drawn: 12 model sheets, 9 backgrounds (including the flare-lit creek and the key art) and
39 shot plates. Every picture the reel uses now points at a retake — `node tools/retake-reel-pictures.mjs hangar`
reports `44/44`. `shots/02c-the-hangar-floor.jpg` is new: it has no first-pass board (the first pass had no
picture for that shot and held 2B), so the second pass is the first cut to show the hangar floor.

**Promoting an alternate.** `alt/weigh-station--clean-sign.jpg` is the clean-sign take that replaced the
weathered panel on 18 October (the weathered one is kept as `alt/weigh-station--weathered.jpg`): the empty
sign is where the WEIGH STATION stencil goes, and the old panel's grey smudges read as ghosted type at full size.
To promote any other alternate, copy it over the plate's name in `backgrounds/` or `shots/` and re-run the two
commands below; nothing else needs editing.

**Rim leak.** Two plates (8A `shots/37-far-off.jpg`, the wooded bank) came back with the paper/vignette pale
edge that a watercolour look sometimes paints in, which reads as a frame inside a night scene. `node
tools/trim-plate-borders.mjs` measures each plate's rim against a band inside it and crops the pale ones by a
small inset, rescaling back to the same size, so framing and aspect don't move. It keeps the untouched original
in `alt/`. Run it after new plates land; the clean plates are not touched.

**Promoted takes.** `alt/38-only-airman-hears--flat-red.jpg` is the first 8B: a flat red wash that lost his
shadow structure. The plate now is the relit take (red from one side, cold moonlight from the other).
`alt/weigh-station--weathered.jpg`, `alt/wooded-bank--untrimmed.jpg` and `alt/37-far-off--untrimmed.jpg` are
the superseded files, kept for comparison.

Rebuild after adding plates:

```
node tools/retake-reel-pictures.mjs hangar      # or: npm run art:retakes
node tools/cold-open-prompts.mjs list           # what is still first-pass
node tools/cold-open-prompts.mjs pack --write    # regenerate docs/hangar/cold-open-second-pass.md
```
