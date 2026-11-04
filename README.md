# Scarlet Keyframe

The animatic and keyframe editor for **Nobody's Witness** and **Sweet Jesus**: each film is a timeline of keyframes,
with editable pictures, camera, effects, audio and captions. Use the film selector beside FRAME/24 to switch projects.
Each film (including imported projects) is saved separately in this browser; the current project is saved before
switching. Existing single-project autosaves are preserved.

    npm ci
    npm run serve        # the editor at http://127.0.0.1:4173 (production build - use this)
    npm run dev          # development server at http://127.0.0.1:5173 (only while coding)
    npm run build        # one self-contained page, dist/index.html, that opens from disk
    npm run depth:setup  # once, then npm run depth -- <picture> makes or lines up a depth map (see Depth maps)
    npm test

## Running locally

Run the app with **`npm run serve`** and open <http://127.0.0.1:4173>. That command builds a normal
multi-file production build into `dist-local/` and serves it: the editor starts in about two seconds
instead of five to ten, playback leaves the main thread idle most of the time, and Export > MP4 works
from the production build. `public/` (1.7 GB of film pictures, depth maps and audio) is not copied into
the build; the preview server reads it from `public/` as it is, with range requests. Files in `public/` are
working files (a retaken picture or a re-made depth map replaces the old one under the same name), so the
browser is told to check with the server each time (`Cache-Control: no-cache`, answered with `304` when
nothing changed) and a replaced file shows up on the next load.

`npm run dev` (port 5173) is for **coding only** — it has hot reload and React's development build, which
is several times slower at playback. Both ports are pinned (`strictPort`): if 4173 is busy, `npm run serve`
stops and names the port instead of quietly moving to another one.

Where your work is saved: **in this browser, at that exact address**. Projects live in the browser's
IndexedDB, which belongs to one origin, so `http://127.0.0.1:4173`, `http://127.0.0.1:5173` and a page
opened from `dist/index.html` (`file:`) are three separate libraries — the same project does not appear in
all three. The editor says so: the Save button's tooltip and the status text read *Saved in this browser
for http://127.0.0.1:4173*, and a page opened from a file shows a one-line warning at the bottom of the
screen.

A browser profile reset, "clear site data", or a different browser means starting from the last backup, so
**real backup = Export > Portable Bundle (.reel.json)**, then Import that file on any machine.

## Thumbnails (timeline, Media Bin, picture lists)

The lanes, the Media Bin tiles and the picture chooser load **400 px wide thumbnails**, not the full-size
pictures; the viewer, the depth camera, the preloader, MP4 export and the `.reel.json` bundle always use the
originals. Build them once (and again whenever you add pictures):

    npm run thumbs      # every picture in src/data/media-index.json -> public/thumbs/
    npm run check:thumbs   # browser check, while `npm run serve` is up

`scripts/make-thumbs.mjs` reads the originals and only ever writes derived copies under `public/thumbs/`,
mirroring the original path (`public/film/img/s2/10-bar.jpg` -> `public/thumbs/film/img/s2/10-bar.jpg`). JPEG
sources become JPEG (`-q:v 4`); PNG/WebP/AVIF/GIF sources keep transparency and become WebP. It is incremental
(a thumbnail newer than its original is skipped), encodes four files at a time, and writes
`public/thumbs/index.json`. Set `FFMPEG` to use a different FFmpeg. Nothing under `public/` or `src/assets/` is
modified, moved, downscaled or re-encoded, and `public/thumbs/` is in `.gitignore`. If the folder is missing,
`src/core/thumbs.ts` simply uses the originals — the app works with no thumbnails at all, and it never asks
for a thumbnail the index does not list. The single-file `npm run build` leaves the derived folder out of
`dist/` (a page opened from disk uses the originals), while `npm run serve` and `npm run dev` serve
`/thumbs/…` from `public/`.

## Depth maps (`npm run depth`)

The depth-map camera plays a picture's `depth.png` (white = near, black = far) from
`public/film/depth/<folder>/<picture>/`. This command makes or repairs one on your own machine, with Depth Anything V2
run through `onnxruntime` (no torch; the same stack as the film's own tool in scarlett-witness). One-time setup:

    npm run depth:setup              # a Python environment in .depth-venv (Python 3.9-3.13); CPU, works everywhere
    npm run depth:setup -- --gpu     # optional: an NVIDIA card (about 1.3 GB of CUDA libraries as pip packages; see below)

Then, with the picture's path or just its name:

    npm run depth -- m4-railway-rain --check     # is its map lined up with the picture? changes nothing
    npm run depth -- m4-railway-rain --fit       # line the existing map up with the picture, keeping its detail
    npm run depth -- 337-engine-off              # a picture with no map yet: make one from the model
    npm run depth -- 337-engine-off --replace    # make a new one from the model although one exists

**A map must have the picture's exact shape and size.** The engine stretches the map over the whole picture, so a map
of another shape, or one with a border (a map made with Google's image tools comes out 1408x768 with rounded
corners), puts every edge in the wrong place; as the camera moves, thin things (poles, rails, railings) are torn and
appear twice. `--fit` finds the scale and shift that put the map's edges on the picture's, using the model only as a
ruler, and writes the map again at the picture's exact size. `--fit=<file>` does the same for a map from anywhere
and installs it as the picture's map. `--check` and `--fit` print how far out of place the edges were (in pixels of
a 1920-wide picture) and `--fit` writes `exports/depth/<picture>-fit-check.jpg`: the picture with the map's edges in
red, before and after, to look at.

Nothing is overwritten without a copy: the map that was there is first copied to `depth--v1.png`, `depth--v2.png` ...
in the same folder (copy one back over `depth.png` to undo). The model (`small` 99 MB, Apache-2.0; `base` 389 MB by
default and `large` 1.3 GB, both **CC-BY-NC-4.0, non-commercial use only**; `--model large` for the most detail) is
downloaded once into a cache folder outside the repository (see *Models* below; `SCARLET_KEYFRAME_MODELS` changes it)
and checked against a pinned size and SHA-256. A new map is softened like the film's own (`--smooth`, default 3); a fitted map is not
(default 0) unless you ask, because softening trades the doubling for a rubbery smear.

This makes the *depth-only* kind of map. A picture with **people** in it also needs cut-outs and a background plate,
or they stretch as the camera moves: that is `npm run cutouts`, below. A map from a model is a relative guess: look at
it in the app before it ships. `npm test` covers the command with a tiny stand-in model
(`scripts/depth/fixtures/tiny-depth.onnx`), and `python scripts/depth/test_fit.py` checks the fitting maths alone.

### In the editor: Make depth map

In the Clip tab's Picture section, a shot whose picture is one of the film's (`/film/img/...`) and that has no depth map
shows a **Make depth map** button. It asks the editor's own server (`npm run dev` or `npm run serve`; a page opened
from disk has none, and the button says so) to run `npm run depth` for that picture, shows how it is going (the model
download the first time, then the making; **Cancel** stops it), and puts the finished map on the shot as one undo step,
the same way Browse does. Run `npm run depth:setup` once first; the button tells you if it is missing. It uses your
NVIDIA GPU when `npm run depth:setup -- --gpu` was run, otherwise the CPU; `SCARLET_KEYFRAME_DEPTH_MODEL_FILE` points
it at a model file of your own. Which depth model it uses follows the **Best / Fast** switch in the *Models* list
(Best: Depth Anything V2 Large, Fast: Small).

If the picture already has a map file on disk, the row offers two buttons: **Use it** (attaches that file, nothing is made)
or **Make a new one** (the same as `--replace`: a new map is made from the model, and the old file is first copied beside it as
`depth--v1.png`, `depth--v2.png` ... so nothing is ever lost; copy one back over `depth.png` to undo). A shot that already has a
depth map and no cut-outs shows a quiet **Make a new one** too, for a map that needs redoing (a map from elsewhere that does not
line up with its picture makes thin things appear twice). The file keeps its name, so the shot's address for it gets a version
(`depth.png?v=...`) and the viewer loads the new one at once; other shots of the same picture show it after a reload. The server
only answers requests from the editor page itself, one map at a time.
Pictures with people in them still need cut-outs: the button says so when it is done, and **Make cutouts** (below)
is the next button down. Turn on **MAP** in the Depth Maps lane to look at the greyscale map.

## Cut-outs for people (`npm run cutouts`)

A depth map alone stretches a person like rubber as the camera moves. A picture with people in it needs each person cut
out as a layer of their own, what was behind them painted back in (the **plate**), and a depth map with the people
painted out of it. `npm run cutouts` makes all of that for **one picture at a time** (there is no batch mode), on your
own machine, with the same steps as scarlett-witness's `tools/make-depth-layers.py`:

1. **YOLOX-X** finds the people (a box each; the film's size rule keeps real people and drops specks).
2. **BiRefNet** cuts each one out: a soft matte at 1024x1024 from a square crop around the box.
3. **LaMa** paints the background back in behind them: the plate.
4. **Depth Anything V2** makes the depth map (or `--source-map` keeps a map you already have), with the people painted
   out of it. Each person is given the depth at their feet, or at their body when their feet are out of the shot.
5. A **review sheet** (`review.jpg`: the picture with its boxes, the cut-outs on green, the plate, the depth map) and a
   list of things to look at: a cut-out clipped at the edge of its box, one nearly empty, a person-shaped thing still in
   the plate, smaller people left out. The engine plays at most four cut-outs per shot.

    npm run cutouts -- 75-one-desperate-blow                  # best models
    npm run cutouts -- 75-one-desperate-blow --quality fast   # small models, permissive licences
    npm run cutouts -- 75-one-desperate-blow --source-map /film/depth/s74/75-one-desperate-blow/depth.png

Everything goes into a **new** folder beside the picture's depth map, `public/film/depth/<folder>/<picture>/people-1/`
(`people-2` the next time): `depth.png`, `plate.jpg`, `cutout-1.png` ... and `review.jpg`. It is written under a
`.part` name and renamed when whole, so a stop or a failure leaves nothing half-made, and nothing that was there before
is overwritten or deleted. The command downloads any missing model first (after the same size and SHA-256 check as
the depth command).

**What it cannot do.** The finder looks for whole people. A close-up of a hand, a lone face, or an object is not found
(use the film's own `people: true` workflow for those), and a face on a television or in a photograph can be counted as
a person; the review sheet and the list are there to catch both. Nobody in the picture means nothing is written, and it
says so. The models run on the CPU unless `npm run depth:setup -- --gpu` was run (see *Using the NVIDIA GPU*);
the code asks for the NVIDIA card and falls back to the CPU, saying why. The GPU path itself has only been exercised with a stand-in onnxruntime here.

### Using the NVIDIA GPU

    npm run depth:setup -- --gpu

This replaces onnxruntime with `onnxruntime-gpu` **1.22 to 1.26** and adds NVIDIA's **CUDA 12 runtime and cuDNN 9 as ordinary
pip packages** inside `.depth-venv` (about 1.3 GB, once), so nothing has to be installed on the system except the NVIDIA
driver (R525 or newer; Python 3.10+). The version is held below 1.27 on purpose: from 1.27 the default onnxruntime-gpu is built for
CUDA 13, which needs a much newer driver (R580+). The worker finds the packages' DLLs itself (it puts
`site-packages/nvidia/*/bin` on the DLL search path and calls onnxruntime's `preload_dlls`).

The list of providers onnxruntime prints (`CUDAExecutionProvider` ...) only says what it was *built* with, not whether CUDA and
cuDNN can be *loaded*. So the setup ends by making a real session on a tiny model and printing the verdict; the editor does the
same when it starts and shows the result in the rows: "Uses your graphics card" or "Not using your graphics card: <why>", and a
run that still ended on the CPU says why. `python scripts/depth/make_depth.py --gpu-check` prints the same check as one JSON line.
If the GPU cannot be used everything still works on the CPU, only slower. Restart `npm run serve` / `npm run dev` after changing
the setup: the server checks once when it starts.

### Models (`npm run models`)

| What it does | Model | Best | Fast | Size | Licence |
| --- | --- | --- | --- | --- | --- |
| finds the people | YOLOX-X | yes | yes | 396 MB | Apache-2.0 |
| cuts them out | BiRefNet general | full, 973 MB | light, 224 MB | | MIT |
| paints the plate | LaMa | yes | yes | 93 MB | Apache-2.0 |
| makes the depth map | Depth Anything V2 | Large, 1.3 GB | Small, 99 MB | | CC-BY-NC-4.0 (Large), Apache-2.0 (Small) |

**Best** is 2.8 GB in all, **Fast** 0.8 GB. **Best includes a non-commercial licence** (Depth Anything V2 Large; the Base
size is the same): fine for working out the look of a film, not for selling or showing it commercially, so the editor
says so wherever Best is offered. Fast is permissive from top to bottom. The finder was chosen by trying it: on 45 of
the film's pictures with 79 people boxes drawn by hand, YOLOX-X found 95% of them (U2-Net 86%, and scanning in tiles
did not help); BiRefNet's full and light sizes came out nearly identical on a clean crop, the light one faster.

    npm run models                        # every model: what for, size, licence, on this computer or not
    npm run models -- best                # download what Best needs (or: fast)
    npm run models -- matte-best inpaint  # or single models, by id

Models are kept outside the repository: `%LOCALAPPDATA%\scarlet-keyframe\models` on Windows,
`~/Library/Caches/scarlet-keyframe/models` on macOS, `$XDG_CACHE_HOME` (else `~/.cache`)`/scarlet-keyframe/models`
elsewhere; `SCARLET_KEYFRAME_MODELS` changes it. You can also download a model yourself from its **Source** link and
put the file there under its own name: it is checked once, then used. `SCARLET_KEYFRAME_CUTOUT_MODEL_FILES`
(`{"people":"...","matte":"...","inpaint":"..."}`) and `SCARLET_KEYFRAME_DEPTH_MODEL_FILE` point the buttons at model
files of your own, `SCARLET_KEYFRAME_PYTHON` at another Python.

### In the editor: Make cutouts and Models

Under **Make depth map**, a shot whose picture is one of the film's and that has no cut-outs yet shows **Make cutouts**.
It works on **the selected shot only**: it asks the editor's server to run `npm run cutouts` for that one picture, shows
the step it is on (1 of 5 finding the people ... 5 of 5 checking and writing the files; **Cancel** stops it and cleans
up), and when it is done puts the depth map, the plate and the cut-outs on the shot as **one undo step**, with the
review sheet shown under the button and the list of things to look at. Choosing another shot meanwhile is fine: the
layers go to the shot they were made for, and the other shots' buttons wait ("one thing at a time", also across two open
pages). If the shot's camera is a dolly it says that the depth camera is not used there.

If a model is not on the computer yet, the button turns into **Download models (size)** and the **Models** list below it
opens. For each model of the chosen quality the list shows what it is for, its size and licence, a **Source** link to
the project it comes from, a **File** link to the file itself (to download by hand and put in the models folder), and a
**Download** button of its own that has the editor's server fetch it (nothing is downloaded until a button is pressed;
**Cancel** removes the half-downloaded file), plus **Download all that are missing** and the **Best / Fast** switch
(remembered in this browser). The first time a model is used the command checks its checksum, which the button shows as
"Checking ... (once)"; after that it is trusted while its size is unchanged. A shot that already has a depth map keeps
it: the cut-outs paint the people out of that map instead of making a new one, and no depth model is needed. If nobody
is found in the picture, nothing is written and the row says so.

The editor only treats a file as there if it is in its media index, which is made when the film is imported. So that the
layers these buttons write are found at once, and again after a reload, it adds them when they are put on a shot and, on
`npm run dev` / `npm run serve`, asks the server for the depth folder's file list (`GET /__api/depth/files`) when it starts.
(Without that the plate was not found and the viewer drew the original picture, people and all, under the cut-outs: everyone
appeared twice.)

## Miami Vice - Salt Water

Select **Miami Vice - Salt Water** in the film selector to open an original feature in the season-four register:
pastels draining into shadow, night-heavy Miami, and the season-four squad (Crockett, Tubbs, Castillo, Gina, Trudy,
Switek, Zito and Izzy) alongside two characters written for this story - Marta Escobar, who runs a relief charity, and
Ray Coburn, a federal agent twenty-two months under. A dock foreman counts the crates twice; a Nassau trust with no
name on it is called Salt Water; a twelve-year-old keeps her father's watch.

The draft is a full feature: 122 scenes and 1,192 storyboard frames, with editable shot directions and timed dialogue
and non-dialogue closed captions. As with Sweet Jesus, dialogue recordings, music and sound effects are **not yet
produced**, and the **Screenplay** button downloads the Fountain draft (it does not incorporate timeline edits).

Choose **Characters** while the film is open to browse the ten generated casting plates, with wardrobe and continuity
notes. Locations, props and scene keyframes are built the same way as Sweet Jesus: reference plates first, then
keyframes that stage the beat with the cast and props in the room. The nineteen location plates built so far live in
`src/data/miami-vice-locations.json`: the OCB bullpen, container yard, the St. Vitus, the warehouse and its
glass office, the Carlyle bar, Marta's office, the causeway, the thrift store, the Miramar pool, Castillo's
office, the Marin kitchen, Izzy's lot, the bookie's back room, the bank room with no name, the airstrip,
the hospital, Ocean Drive and county family services.

`docs/miami-vice-music.md` is the sound supervision note: an original synth score in the Jan Hammer register, five
licensed period songs, source music in every location, and 29 cues keyed to scene ids in
`src/data/miami-vice-music.json`.

Regenerate the compiled storyboard after editing the screenplay:

```bash
npm run build:miami-vice            # src/data/miami-vice.fountain -> src/data/miami-vice-film.json
npm run build:miami-vice-previews   # public/miami-vice/characters/*.png -> src/assets/miami-vice/portraits/*.jpg
npm run build:miami-vice-locations  # public/miami-vice/locations/*.png   -> src/assets/miami-vice/locations/*.jpg
```

## Sweet Jesus

Select **Sweet Jesus** in the film selector to open its separate 30-scene storyboard. It includes the supplied
opening, warehouse confrontation and ending, plus newly written connecting scenes, including Corn hiring Jack and
Jack's confrontation with Vera in the car. The timeline contains 429 storyboard frames with editable shot directions
and timed dialogue and non-dialogue closed captions. The 22 opening beats use seven illustrative stills; later picture
slots are blank. The captions are an editorial timing draft; they can be retimed in the CC lane and exported as SRT or
VTT. Use the timeline's scene menu or search for dialogue, a speaker, or a shot description to navigate the draft.

Dialogue recordings, music and sound effects are **not yet produced**. Sound captions describe the planned soundtrack
rather than existing recordings. Choose or upload media for each shot in the inspector; blank shots stay independent
unless their picture-hold setting is enabled. The **Screenplay** button downloads the original Fountain draft (it does
not incorporate later timeline edits).

### Character references

Choose **Characters** in the Sweet Jesus toolbar to browse the 14 voted cast portraits, wardrobe notes and story
continuity notes (which contain spoilers). **Download sheets** saves a printable 14-page PDF; each character also has an
original PNG download. These are casting references, not automatically inserted storyboard pictures. The original,
user-selected PNGs are in `public/sweet-jesus/characters/`; the PDF and optimized gallery images are embedded in the
single-file editor. Original PNG downloads require the accompanying assets folder, which the normal build copies to `dist/`.

The notes are editable in `src/data/sweet-jesus-characters.json`. After changing notes or gallery portraits, rebuild
the printable set with `npm run build:character-sheets` (requires a working Chromium, like MP4 export).

### Launderette and opening

Choose **Launderette** to browse the selected interior, exterior, table and transparent recorder-with-microphone
references, plus continuity notes. **Style sheets** downloads four landscape 16:9 design sheets; **Opening boards**
downloads a six-page guide to all 22 beats of the original draft (not later timeline edits). The gallery and both PDFs
are embedded in the single-file editor; the
full-size originals are under `public/sweet-jesus/launderette/` and `public/sweet-jesus/opening/` and are copied to
`dist/` by the normal build. Earlier selected, superseded images are preserved without pixel loss in
`public/sweet-jesus/archive/`; see its README and manifest before using them for continuity.

The seven stills are repeated across beats as editable references, not filmed or animated footage. The opening washer
two-shot composites the selected recorder into the selected image; the original is preserved. The ultrawide newspaper
image is letterboxed, not stretched or cropped. The quarters reference shows coins on the table, but the screenplay
places them on the washer. For existing browser saves, an untouched opening receives the references automatically;
if the opening has user edits, it is left alone. **Fill empty opening shots** is a separate undoable action that skips
existing pictures, intentional gaps and holds, and never changes dialogue, captions or timing.

To rebuild the optimized previews (requires ImageMagick), then the two printable PDFs (requires Chromium):

    npm run build:launderette-previews
    npm run build:launderette-sheets
    npm run build:opening-storyboard

The editable source is `src/data/sweet-jesus.fountain`; `[[CC: ...]]` notes describe sound captions and
`[[HOLD: seconds]]` notes set deliberate visual holds. After editing the source, regenerate and check the bundled
storyboard with:

    npm run build:sweet-jesus
    npm run build:sweet-jesus -- --check

Rebuilding does not overwrite an existing browser autosave. Back up and import `src/data/sweet-jesus-film.json` to
start from the newly compiled version.

## Nobody's Witness

Nobody's Witness is built into the app (`src/data/nobodys-witness-film.json`), so it opens with no server. It comes
from Scarlet Reel, `sigooding/scarlett-witness`. When the film changes there, import it again and rebuild:

    npm run import:film                              # from ../scarlett-witness
    npm run import:film -- /path/to/scarlett-witness

The import reads that repository's `src/data/nobodysWitnessFilm.ts` and `src/film/studio-edits.json` (the music
beat-sync comes from it). A project already open in your browser is kept (autosave). To see a newly imported film
there, use Import with `src/data/nobodys-witness-film.json`.

## Nobody's Witness pictures and sound

That film's pictures, voices and sounds stay in Scarlet Reel; this repository doesn't copy them. Click **Link folder**
and pick scarlett-witness's `public` folder; then every picture in it is in the picture browser. The link is forgotten
when the page reloads.

## Making MP4 export faster

Export is **CPU-bound, not GPU-bound**, which is why a fast GPU sits at a few per cent while it works. Each frame is
painted on the GPU, then read back and encoded to PNG/JPEG **by the CPU**, piped to FFmpeg, decoded there **by the
CPU**, and only then handed to the hardware H.264 encoder. Filling GPU memory cannot help; the levers are parallelism
and per-frame capture cost.

1. **Use several workers.** `--workers 3`–`4` (or **Workers** in the export dialog, which now starts at a value based on
   your CPU count) runs that whole pipeline in parallel, one headless Chromium plus FFmpeg per worker. It is the single
   biggest win — near-linear until the CPU saturates — and costs about 300–600 MB of RAM per worker.
2. **Capture JPEG when PNG is overkill for the pass.** `--capture jpeg` (UI: **Capture: JPEG fast**) encodes each frame
   as JPEG q97 instead of lossless PNG. Capture and FFmpeg's decode both get much cheaper and the pipe carries roughly a
   fifth of the bytes; use `--capture-quality` to taste. Leave it on `auto` (PNG for Master) when you are making the
   archive master and do not want any capture-side generation loss.
3. **Render a slice while you iterate.** `--from`/`--to` (or From/To scene in the dialog) plus `--draft` (720p JPEG) is
   the fast review loop; only the final pass needs Master.
4. **Check the summary line.** Every export now prints per-frame timings — `setFrame`, `capture`, `pipe/write` — and a
   suggestion if it ran with one worker. If `capture` dominates, switch to JPEG capture; if `setFrame` dominates, add
   workers.

Example: a 1080p master with four workers and JPEG capture is typically several times faster than a single worker with
PNG capture:

    npm run export -- --from 0 --to 2879 --workers 4 --capture jpeg --capture-quality 97

## Captions

A beat's text becomes proper closed-caption cues, not one paragraph: at most two lines of 42 characters per cue, broken at
sentence ends, then clauses, then the word nearest the middle (never inside a word, not between the parts of a name), with
two-line cues balanced. Cues are timed across the words as they are spoken (the scene slate before the first line is
skipped), in proportion to their length. Cues already authored in a cut that are too long are split across their own span.
The CC lane, the viewer, the .srt/.vtt files and the MP4 burn-in all use the same cues. Code: `src/core/captionCues.ts`.

**Who a caption is credited to.** In the Clip tab's Caption section the top row is the *shot's* speaker (from the voice line).
Each caption below has its own **Speaker** field: type a name or choose one (the story's characters and NARRATOR), press Enter,
and only that caption is credited to them in the viewer and the MP4 burn-in; clear the field, or type the shot's own speaker, to
follow the shot again. **ALL** gives every caption of the shot the same speaker. **Narration** shows a caption in italics:
NARRATOR turns it on, and a person speaking in a narration shot turns it off. Names are kept upper case, as the story shows them.
Every change is one undo step. Code: `setCaptionSpeaker`, `setAllCaptionSpeakers`, `setCaptionNarration` in `src/core/captions.ts`.

## Track effects (reverb, delay, echo)

Each audio track (Voice, SFX, Music, Ambience) has an **FX** button on its header. The panel has a preset list (Small room,
Stairwell, Large hall, Slapback, Echo, Tape delay), **Reverb** (mix, size, pre-delay, damping) and **Delay / Echo** (mix, time,
repeats, tone). It plays live and is part of the MP4 export (the export renders the tails across its chunk boundaries). The
settings are remembered in this browser. The reverb room is generated, not a sound file. Code: `src/core/audioFx.ts`.

## MP4 export

Use the MP4 export button while the editor is running — `npm run serve` (recommended: the frames render from
the production build) or `npm run dev` — or run a short CLI export:

    npm run export -- --from 0 --to 47 --draft --workers 6

The exporter uploads the project to the editor's own `/__api/export/start` endpoint, which both the dev and
the preview server provide. When `npm run serve` is running, the CLI renders from it
(`http://127.0.0.1:4173`, or `--url <address>`); with no server running it starts its own Vite server.

GPU acceleration is enabled by default (`--gpu`, or disable with `--no-gpu`): Chromium renders WebGL depth parallax,
2D canvas overlays, and compositing on the hardware GPU, and FFmpeg automatically probes hardware H.264 encoders
(`h264_nvenc`, `h264_videotoolbox`, `h264_amf`, `h264_qsv`, `h264_vaapi`) across up to 6 parallel segment workers
before falling back to `libx264` when no hardware encoder is available. Install a system `ffmpeg` (for example via
`winget`, Homebrew, or `apt`) if you want hardware H.264 encoding instead of the minimal bundled `@ffmpeg-installer`
binary; you can also force a specific encoder with `--encoder <auto|nvenc|videotoolbox|amf|qsv|vaapi|libx264>`.

The exporter looks for Playwright's Chromium, then an installed Google Chrome or Microsoft Edge. The bundled
serverless Chromium is used only on Linux x64. If no browser can be started, install Playwright's browser and
retry:

    npx playwright install chromium

Alternatively, point the exporter at a Chromium-based browser. For example, in Windows PowerShell:

    $env:PLAYWRIGHT_CHROMIUM_PATH = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
    npm run dev

Use the executable's actual location on your computer. Restart the dev server after setting or clearing this
variable so its export process receives the updated value. FFmpeg is taken from the system or the bundled installer.
