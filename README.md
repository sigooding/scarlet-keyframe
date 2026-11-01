# Scarlet Keyframe

The animatic and keyframe editor for **Nobody's Witness** and **Sweet Jesus**: each film is a timeline of keyframes,
with editable pictures, camera, effects, audio and captions. Use the film selector beside FRAME/24 to switch projects.
Each film (including imported projects) is saved separately in this browser; the current project is saved before
switching. Existing single-project autosaves are preserved.

    npm ci
    npm run dev          # the editor, at the address it prints
    npm run build        # one self-contained page, dist/index.html, that opens from disk
    npm test

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

## Track effects (reverb, delay, echo)

Each audio track (Voice, SFX, Music, Ambience) has an **FX** button on its header. The panel has a preset list (Small room,
Stairwell, Large hall, Slapback, Echo, Tape delay), **Reverb** (mix, size, pre-delay, damping) and **Delay / Echo** (mix, time,
repeats, tone). It plays live and is part of the MP4 export (the export renders the tails across its chunk boundaries). The
settings are remembered in this browser. The reverb room is generated, not a sound file. Code: `src/core/audioFx.ts`.

## MP4 export

Use the MP4 export button while the editor is running with `npm run dev`, or run a short CLI export:

    npm run export -- --from 0 --to 47 --draft --workers 6

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
