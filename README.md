# Scarlet Keyframe

The animatic and keyframe editor for Nobody's Witness: the whole film as one timeline of keyframes, one picture per
beat. For each keyframe, choose or upload its picture, edit its camera and effects, and play the film as an animatic.

    npm ci
    npm run dev          # the editor, at the address it prints
    npm run build        # one self-contained page, dist/index.html, that opens from disk
    npm test

## The film

Nobody's Witness is built into the app (`src/data/nobodys-witness-film.json`), so it opens with no server. It comes
from Scarlet Reel, `sigooding/scarlett-witness`. When the film changes there, import it again and rebuild:

    npm run import:film                              # from ../scarlett-witness
    npm run import:film -- /path/to/scarlett-witness

The import reads that repository's `src/data/nobodysWitnessFilm.ts` and `src/film/studio-edits.json` (the music
beat-sync comes from it). A project already open in your browser is kept (autosave). To see a newly imported film
there, use Import with `src/data/nobodys-witness-film.json`.

## Pictures and sound

The film's pictures, voices and sounds stay in Scarlet Reel; this repository doesn't copy them. Click **Link folder**
and pick scarlett-witness's `public` folder; then every picture in it is in the picture browser. The link is forgotten
when the page reloads.

## MP4 export

Use the MP4 export button while the editor is running with `npm run dev`, or run a short CLI export:

    npm run export -- --from 0 --to 47 --draft

The exporter looks for Playwright's Chromium, then an installed Google Chrome or Microsoft Edge. The bundled
serverless Chromium is used only on Linux x64. If no browser can be started, install Playwright's browser and
retry:

    npx playwright install chromium

Alternatively, point the exporter at a Chromium-based browser. For example, in Windows PowerShell:

    $env:PLAYWRIGHT_CHROMIUM_PATH = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
    npm run dev

Use the executable's actual location on your computer. Restart the dev server after setting or clearing this
variable so its export process receives the updated value. FFmpeg is taken from the system or the bundled installer.
