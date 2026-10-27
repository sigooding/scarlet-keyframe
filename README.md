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

## The editor

The keyframe list is a small video editor over one Picture track, cut in whole frames at 24 fps (timecode MM:SS:FF).

- **Length.** Each beat is one clip. Its length is the beat's new `durationFrames` when set, otherwise
  `keyframeDuration()` converted to frames (never shorter than 6 frames). Clip starts are the sum of the clips
  before, so every edit ripples.
- **Timeline.** Ruler with timecode, clips as wide as their duration, a thin bar for the voice take, a red outline
  when the picture ends before the voice. Zoom with `+` / `−` or Ctrl/Cmd + scroll. Click the ruler or drag the
  playhead to scrub; the viewer shows exactly that frame.
- **Editing.** Drag a clip's right edge to trim, `S` splits the clip at the playhead, `Delete` removes the selected
  clip, and the search box / scene filter double as "Go to". Each drag is one undo step.
- **Animation.** A beat may carry `animation: { zoom?, x?, y? }`, each an array of
  `{ frame, value, easing }` keys measured from the clip's own start. The inspector's Animation section has a slider
  and a diamond for each: the diamond adds or removes a key at the playhead, a slider moves the value (writing the
  key at the playhead or adding one once the property is animated), and the dropdown sets the key's easing
  (`linear`, `ease-in-out`, `hold`). `src/sequence/animate.ts` evaluates the transform; `CinematicPreview` applies it
  as a plain `translate() scale()` with no CSS animation, so scrubbing and playback show the same frame. A clip with
  keys does not also run its Scarlet Reel camera preset.
- **Playback.** Space plays/pauses from the playhead at 24 fps, `←`/`→` step one frame, `Shift` + `←`/`→` one
  second. Voices and sound cues start as the playhead enters each clip, as before.

`docs/verification/` holds the screenshots from the end-to-end checks (scrubbing scene 77, trimming, splitting,
animation keys, reload).
