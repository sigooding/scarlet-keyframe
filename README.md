# Scarlet Keyframe

The animatic and keyframe editor for **Nobody's Witness** and **Sweet Jesus**: each film is a timeline of keyframes,
with editable pictures, camera, effects, audio and captions. Use the film selector beside FRAME/24 to switch projects.
Each film (including imported projects) is saved separately in this browser; the current project is saved before
switching. Existing single-project autosaves are preserved.

    npm ci
    npm run dev          # the editor, at the address it prints
    npm run build        # one self-contained page, dist/index.html, that opens from disk
    npm test

## Sweet Jesus

Select **Sweet Jesus** in the film selector to open its separate 30-scene storyboard. It includes the supplied
opening, warehouse confrontation and ending, plus newly written connecting scenes, including Corn hiring Jack and
Jack's confrontation with Vera in the car. The timeline contains 429 storyboard frames with editable shot directions,
blank picture slots, and timed dialogue and non-dialogue closed captions. The captions are an editorial timing draft; they can be retimed
in the CC lane and exported as SRT or VTT. Use the timeline's scene menu or search for dialogue, a speaker, or a
shot description to navigate the draft.

The storyboard pictures, dialogue recordings, music and sound effects are **not yet produced**. The sound captions describe the
planned soundtrack rather than existing recordings. Choose or upload media for each shot in the inspector; blank shots
stay independent unless their picture-hold setting is enabled. The **Screenplay** button downloads the original
Fountain draft (it does not incorporate later timeline edits).

### Character references

Choose **Characters** in the Sweet Jesus toolbar to browse the 14 voted cast portraits, wardrobe notes and story
continuity notes (which contain spoilers). **Download sheets** saves a printable 14-page PDF; each character also has an
original PNG download. These are casting references, not automatically inserted storyboard pictures. The original,
user-selected PNGs are in `public/sweet-jesus/characters/`; the PDF and optimized gallery images are embedded in the
single-file editor. Original PNG downloads require the accompanying assets folder, which the normal build copies to `dist/`.

The notes are editable in `src/data/sweet-jesus-characters.json`. After changing notes or gallery portraits, rebuild
the printable set with `npm run build:character-sheets` (requires a working Chromium, like MP4 export).

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
