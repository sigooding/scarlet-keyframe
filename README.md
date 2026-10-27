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
