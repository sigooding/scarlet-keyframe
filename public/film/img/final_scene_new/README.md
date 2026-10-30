# The end, redone: Vera and Jack at the counter, then the bubbles

A non-destructive redo of the film's ending — **scene 100, INT. KANEKO'S NEW COUNTER – NIGHT** —
plus a new 8-shot dream sequence. Nothing in `s100/` or anywhere else was touched: no `story.json`,
studio-edits or code changes. This folder is a standalone set of images and notes.

**Status:** 9 of 13 shots made (01–09). Shots 10–13 (the last four alternates and the final
constellation) are fully specified in `style-sheets/continuity.md` and are next.

**The bubble look** (direction given after the first pass): the bar **warps** into a water
droplet — the set's straight lines bend into the sphere, nothing is a hard circle — each shot
pulls back a visible step (the whole group shrinks ~15 % per shot and rises), and the palette
stays muted: deep blue-black, slate, dim amber, with only a faint pale pearl sheen on the rims.

## The new ending (per direction)

**Part A — he doesn't come in.** Jack does not enter the noodle bar. He is a silhouette in the
doorway, contemplating going in; then he walks off into the rainy Tokyo street, into the distance.
Vera feels it, looks back at the doorway — there is no one there.

| File | Beat |
|---|---|
| `100-01-the-empty-stool.jpg` | The counter at night: Kaneko at the pot, steam, the bulb. Vera at the third stool, the stool beside her empty, looking out at the dark rainy street. |
| `100-02-his-silhouette-in-the-doorway.jpg` | From inside: Jack's dark figure at the threshold in the blue rain light, hand on the door frame, head bowed — contemplating going in. |
| `100-03-into-the-rain.jpg` | From behind: he walks off down the wet street under the viaduct into the distance. The counter's warm glow small at the edge of the frame. |
| `100-04-she-feels-it.jpg` *(to make)* | Close-up: Vera turns toward the doorway, teacup half-raised — the sense of someone leaving. |
| `100-05-the-empty-doorway.jpg` *(to make)* | Over her shoulder: the doorway is empty. Just the rain and the street. |

**Part B — Tokyo as a memory (8 shots).** The camera pulls out of the noodle bar. The bar slowly
becomes a **bubble**; the bubble is slowly surrounded by other bubbles, each holding an **alternate
scene — something that could have happened instead**. A continuous slow pull-back; the bubbles
never change once they appear.

| File | The frame holds |
|---|---|
| `100-06-the-bar-becomes-a-bubble.jpg` | The pull-back begins: the counter WARPS — the room bends and flows into one large soft water droplet; inside it, Vera, the empty stool, Kaneko, steam. The street dissolves to blue bokeh. |
| `100-07-the-tea-still-warm.jpg` | + the first alternate: **Mara alive** — the sisters at the low table, both tea cups steaming, mid-laugh. The group steps back. |
| `100-08-father-and-son.jpg` | + **the father alive** — the old noodle counter, Daniel Voss and a younger Jack laughing over two bowls. The group steps back. |
| `100-09-the-small-umbrella.jpg` | + **they stayed** — Jack and Vera crossing the rainy street under the small umbrella, laughing. The group steps back. |
| `100-10-youve-done-well.jpg` *(to make)* | + **Ishida lived** — under the expressway, the green car, Ishida's tired kind half-smile to Jack. |
| `100-11-the-quiet-alley.jpg` *(to make)* | + **the night with no shooting** — the quiet backstreet, just the vending machine's amber light and Mara walking home, safe. |
| `100-12-she-stays.jpg` *(to make)* | + **she stayed on the rooftop** — Vera turning back to Jack and laughing, the train passing below. |
| `100-13-the-city-as-memory.jpg` *(to make)* | The last frame: the whole constellation of bubbles drifting above all of Tokyo, soft and blurred as a memory — viaduct, street grid, faint lights, rain. |

## Characters (locked to the shipped film)

- **Vera** (`style-sheets/refs/vera-face.jpg`): late 20s, chin-length blonde bob, blue eyes; the
  **red bird clip** in her hair (returned to her in 98); cream turtleneck under a dark olive wool
  coat. Face authority: `sheets/vera-face.jpg`, `s98/525`, `s98/524`, `s100/160`.
- **Jack** (`style-sheets/refs/jack-face.png`): late 50s, lean, swept-back dark hair greying at the
  sides, grey stubble; long charcoal-black overcoat, off-white open shirt, no plaster. Same plate
  as `jack_ishida_new`.
- **Kaneko** (`style-sheets/refs/kaneko.jpg`): elderly, white hair tied back, rust-brown top, dark
  apron. Authority: `s100/158`, `s56/224`, `s99/157`.
- **Mara** (`style-sheets/refs/mara-face.jpg`): Vera's younger sister, 24, blonde, the red clip.
  Authority: `s1/04`, `s25/200`, `s69/279`, `s2/21`. She dies in the film (97A); in the bubbles she
  is alive.
- **Daniel Voss** (`style-sheets/refs/father-and-son.jpg`): Jack's father, from the in-story
  photograph `s11/167`.

## The counter (location lock)

Tiny noodle counter in a brick railway arch near the station. Night, rain outside. One warm hanging
bulb, steam, old wooden counter, a row of old stools, a small dark old television, and the small
hand-painted sign with 金子 (KANEKO) and a noodle-bowl drawing. Warm amber inside, cold blue-grey
rain light outside. It stays identical in every interior shot and inside the central bubble.

## References used (sparingly; shipped originals only)

- Part A 01–03 used only the shipped frames of the counter (`s100/158`, `s100/160`, `s100/320`),
  the rooftop Vera (`s98/524`, `s98/525`) and the Jack face plate.
- Part B will use the previous bubble frame (chained), plus one or two shipped frames per new
  alternate (`s4/36`, `s1/04`, `s11/167`, `s27/202`, `jack_ishida_new/61-10` — our own new frame,
  `s1/03`, `s1/02`, `s98/523`, `s2/19`, `s99a/531`).
- Every frame is conformed to 1920×1080 sRGB JPEG q92 (Lanczos cover-resize, centre crop, light
  unsharp).

## Before swapping these in

- **Filenames** are new and unique (`100-NN-…`), so the bare-filename lookups in
  `scripts/film-depth.entry.ts` and the depth tools can't collide with `s100/`.
- **Wiring:** this ending replaces the last four `bg` steps of scene 100 (`158`, `161`, `160`,
  `159`) and adds the dream shots. Make the change through the screenplay build; never hand-edit
  `src/data/nobodysWitnessFilm.ts`.
- **Depth maps:** none of the s100 pictures has one today; any new picture that gets one must be
  made from the new picture.
- **The bubbles** are a visual sequence (a slow pull-back); they need long holds and, ideally, a
  soft cross-fade between them in the build.

## Files

- `100-01-…jpg` to `100-05-…jpg`: Part A, the counter and the rain (01–05 made).
- `100-06-…jpg` to `100-09-…jpg`: Part B so far — the warp and the first three alternates (made,
  warp pass).
- `100-10-…jpg` to `100-13-…jpg`: Part B remainder — Ishida, the quiet alley, the rooftop, the
  final constellation (to make; they continue the same pull-back from 09).
- `style-sheets/refs/`: face and authority plates (`vera-face`, `mara-face`, `jack-face`,
  `kaneko`, `father-and-son`).
- `style-sheets/continuity.md`: the locks, the bubble language, the alternate list and the recipe
  for every shot.
