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

### Moving clips, rolling, snapping, markers and transitions

- **Move.** Drag a clip onto another clip to move it there, in this scene or another one. The picture, voice take,
  sound effect and caption all travel with it; `src/core/edits.ts` rewrites the story's beat lists and hands the
  running order on if the beat carried the scene's route. Alt+drag copies instead of moving.
- **Select several.** Shift-click or Ctrl/Cmd-click a clip, or drag a box over empty track space. Move, delete and
  copy act on the whole selection.
- **Roll.** Drag the little cut handle between two clips: the left clip grows by exactly the frames the right one
  loses, so the sequence keeps its length.
- **Snapping.** `N` toggles it (on at start). Clip edges, the playhead, keyframes and markers pull within 8 pixels,
  and a thin line shows what the edge snapped to.
- **Markers.** Every scene's first clip gets a marker on the ruler (77, 77A, 78…) — click to jump. `M` drops a named
  note marker at the playhead; note markers are saved with the project and follow their clip when the track ripples.
  Double-click a note marker to remove it.
- **Copy / paste.** Ctrl/Cmd+C copies the selected clips, Ctrl/Cmd+V inserts them at the playhead — splitting the clip
  under the playhead first when it lands inside one.
- **Transitions.** Each cut with a transition shows a box centred on the cut, as long as the transition; drag its
  edges to change the length in frames, double-click it (or the clip that starts on the cut) to pick cut, dissolve,
  dip to black, wipe left or wipe right — so a plain cut can get a transition too.
  `src/sequence/transitions.ts` maps the film's own values (`crossfade`/`dissolve` → dissolve, `zoom` → dissolve,
  scene `fade` → dip to black, `cut` → cut) and its `backgroundTransitionSpeed` seconds into frames. The viewer draws
  both pictures on two layers and computes opacity/clip-path from the frame number (`p = (frame − start) / length`),
  with no CSS transition, so scrubbing shows every step of the transition.
- **Undo.** A whole drag is one step, however many frames it passed through.

`docs/verification/` holds the screenshots from the round-one end-to-end checks (scrubbing scene 77, trimming,
splitting, animation keys, reload); `docs/verification-edit/` holds the round-two ones (moving a clip into 77A, a
10-frame roll, a snapped trim, a 12-frame dissolve scrubbed frame by frame, copy and paste, markers).
