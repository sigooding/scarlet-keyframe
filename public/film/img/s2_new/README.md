# s2_new: scene 2, "The small bar", reshot from scratch

A new set of pictures for scene 2 of *Nobody's Witness* (INT. SMALL BAR, KANDA – CONTINUOUS). Every shot is
generated again from nothing, on a new set of style sheets for continuity.

- **Nothing was replaced.** `public/film/img/s2/`, `src/film/story.json`, `src/film/studio-edits.json` and the
  depth map are unchanged, so the film still plays the old pictures.
- **Same filenames as `s2/`.** You can compare or swap the sets one for one.
- **House format.** Every shot is 1920×1080 sRGB JPEG at quality 92, the same as `s2/`.
- **She sees him, then runs in, then hides.** The scene plays: she is outside in the rain, sees the
  journalist through the glass, comes in and gets down under the near end of the counter before the two men
  arrive; they take him and go. See *The scene, start to finish* below.
- **Mara is the `s1_new` Mara.** This set does not restate her: her sheet and her reference plates live in
  `../s1_new/style-sheets/` and were passed into every shot of her, together with `../s1_new/04-mara-phone.jpg`
  (her likeness held up to the light, in the rain), so she is the same woman in scene 1 and scene 2 — same
  jacket, hair, clip, key and hands. Her plates are **not** copied into this folder.
- **One new character**, the Journalist, who appears only in this scene. He had no sheet anywhere in the repo,
  so one was made: `style-sheets/the-journalist.jpg`.

## Shots

| # | File | Beat |
|---|------|------|
| 1 | `19-the-bar.jpg` | The room she looks into from the street, empty: counter, stools, the bottle shelves, the till waiting on the counter |
| 2 | `20-the-journalist.jpg` | A man in a raincoat on the far stool, a notebook beside a beer gone flat |
| 3 | `21-mara-bursts-in.jpg` | She comes in out of the rain, the key in her fist |
| 4 | `22-not-his-business.jpg` | He knows her name |
| 5 | `23-behind-the-counter.jpg` | She is down under the near end of the counter — under the till — before she knows she's moved |
| 6 | `24-from-the-floor.jpg` | From the floor: "Where is he?" |
| 7 | `25-two-pairs-of-shoes.jpg` | The door opens behind her. Rain noise |
| 8 | `26-the-variety-show.jpg` | Two shots. On the high shelf, the television audience laughs |
| 9 | `27-the-notebook.jpg` | He takes one step toward the counter. A voice in his earpiece: one word |
| 10 | `308-clip-under-the-shelf.jpg` | A hair clip slides out of her wet hair and skitters under the shelf |
| 11 | `28-the-blue-glow.jpg` | They go, the till with them. The door swings shut. The television laughs again |

All eleven, in story order: `contact-sheet.jpg`.

## The scene, start to finish

The script is used loosely; these are the parts the pictures keep.

1. **She is outside in the rain** with Sakai's key and sees the journalist through the glass of the bar
   (19: the room empty, counter left of frame, glass right, the till on the counter at the near end).
2. **She runs in** — "Miss Voss?" — (21) and goes down on the floor **under the near end of the counter,
   under the till, before the door opens again** (23, 308).
3. **The two men come in** and go the length of the room to him at the far end (25, 24, 26). She never leaves
   the hiding place and is never seen there; the **bird clip**, on the wet floor, is the only thing of hers
   they ever see (308).
4. **They take what they came for and leave.** On the way out a gloved hand comes over the near end of the
   counter — **the till** (27, 28).
5. **The door swings shut; the television laughs.** She is alone on the floor with the key (28).

## Style sheets (`style-sheets/`)

| Sheet | What it locks down |
|-------|--------------------|
| `location-small-bar-kanda.jpg` | Master plates A (from the door) and B (from the serving side), the room looking down with every story position — including where Mara hides — drawn the way the film shoots it and **not mirrored**, which way each camera in the scene faces and which way round it reads, the look, the geography rules and the palette |
| `the-journalist.jpg` | His face, wet receding hair, wire-rimmed glasses, the olive-grey open raincoat over a pale blue shirt, the notebook and the flat beer, and which stool he is on |
| `props.jpg` | The props this scene turns on, cropped from these frames: the bottle-shelf back bar, the brass key and its 114 tag, the bird clip on Mara and on the boards, the notebook and pen, the flat beer, the CRT television, the two men — and **the till**, on the counter at the near end and again over her head at 23. It also fixes that the **only legible words in the scene are the 114** |

`style-sheets/refs/` holds the separate reference plates — bar masters A and B, the journalist front / face /
at his stool / **seated** (a full-length profile of his posture on the stool, feet on the foot-ring, which
every shot of him sitting down should be matched against). Pass them to the image model with any new or
replacement shot so it stays on model. Mara's own plates are in `../s1_new/style-sheets/refs/`.

### The rules in one breath

- **Geography.** One long, narrow room about 3 m wide: the counter and its six stools down one side, the glass
  shopfront down the other, the back-bar shelves and bottles on the wall behind the counter. **The mirror law:**
  looking *into* the room the glass is on the camera's right and the **counter on the LEFT** of frame; looking
  *out* of the room the glass is on the camera's left. The counter and the glass are never on the same side of a
  frame twice in the same direction, and the bottles are always behind the counter. `location-small-bar-kanda.jpg`
  draws the room the way the film shoots it, loose and not mirrored.
- **Which way each camera faces.** Looking in from the street door: 19, 20, 22, 26 (and 21's own angle as shot).
  Turned round in the room, looking back at the door: 21, 28. Behind the counter, along the aisle: 23, 308, 24,
  27. Low, from the floor: 24, 25.
- **The till.** A small old cash register with no lettering on it stands on the counter at the **near end**,
  by the street door — directly over the space Mara hides in — and it is what the second man's hand comes over
  on the way out. It is in 19, 21 (behind her on the counter), 23 and 308; see the props sheet.
- **Positions.** The journalist sits alone on the **last stool**, the far one, nearest the back, with his
  notebook and flat beer in front of him. Mara comes in through the street door at the near end (21) and goes
  down on the floor **under the near end of the counter — the end by the door — before she knows she has moved**
  (23, 308, 24). The two men come in through the same door (25) and stand in the customer aisle. **Nobody is ever
  behind the counter except Mara.**
- **The shots.** By 24 there are two standing men and the journalist still up on his stool; the two shots land
  between 24 and 26, off screen, as they do now — no blood and no wounds anywhere in this set.
- **Look.** Grounded contemporary Tokyo neo-noir: photographic realism, 12.45 a.m., still raining, wet
  floorboards and wet glass, practical light only — amber bottle shelves, one shaded bulb, the CRT's cold blue,
  the blue of the open doorway. Cool slate and blue-green shadows, deep blacks, restrained 35mm grain. No sepia.
- **Keeps.** No legible signage or writing anywhere except the 114 on the key tag. No graffiti, no logos.

## Before swapping any of these into the film

1. **Depth maps.** `19-the-bar` is the only scene 2 picture with a depth camera (`nw_b48`, the opening beat). Its
   map in `public/film/depth/s2/19-the-bar/` was made from the **old** picture and will not fit the new one.
   Remake it from the new picture with `tools/make-depth-layers.py` (CLAUDE.md rule 1, never a guessed map), and
   follow rule 2 for any frame with people in it — cut the people out, paint in behind them and list the picture
   in `peopleInShot` in `docs/film-depth-layers.json`.
2. **The hiding position moved, and a till was added.** The story's line at 23 says she folds into the gap
   between the crates and the ice bin; the new frames put her under the counter's **near** end, by the door,
   with the till standing on the counter over her. `src/film/story.json` (or the PlayFrame scene) should be
   brought into line with both.
3. **The scene is reordered from the screenplay.** In the pictures she is already hiding before the
   gunmen come in, and they take the journalist and leave; the screenplay has the men arrive while she is
   still being seen. `src/film/story.json` (or the PlayFrame scene) needs the beat order changed to match —
   19, 21, 23, 308, then 25, 24, 26, 27, 28, with the till added as the thing taken on the way out.
4. **Filename lookups.** Some depth tooling finds a picture by bare filename across `public/film/img/*/`,
   including `scripts/film-depth.entry.ts` (`npm run test:film-depth`) and `tools/depth-parallax-probe.py`.
   Because this folder reuses `s2/`'s names, those lookups can land on the `s2_new` copy. Give the probe an
   explicit `s2/` picture while this folder exists, or delete the folder after the swap.
5. **Rebuilds.** `tools/build-film-story.mjs` copies media in additively, so a rebuild leaves this folder alone.
6. **No talking-shot clips to remake.** Scene 2's two lines (21 and 24) are off-screen voices; the film's only
   lip-synced clip is scene 1's. Nothing here needs a new clip.

## How the pictures were made

- Reference plates first: the two bar masters, then the journalist (front, face, at his stool). Mara is the
  `s1_new` reference set, passed in unchanged, plus `s1_new/04-mara-phone.jpg` as the likeness plate.
- Every shot was then generated with the relevant plates passed in as references.
- Generator output (1365×768 to 1672×941) was conformed to 1920×1080 with ImageMagick: a Lanczos resize to
  cover the frame, a centre crop and a light unsharp mask.
- The sheets were laid out in ImageMagick — crops, labels, palette chips and the props grid. The plan is drawn
  geometry, not generated.

### Corrections and notes

| Shot | Note |
|------|------|
| `21-mara-bursts-in` | A first take had the room's sides the wrong way round and a figure reflected in the glass frontage. Both were fixed by regenerating it as the reverse angle: counter on the right, and nobody else in the room or in any reflection. |
| `22-not-his-business` | A first take's reflection of Mara in the glass did not read as a reflection. Regenerated with the journalist twisted back over his shoulder instead, which is what the line needs. |
| `23-behind-the-counter` | She is in the gap between the stacked beer crates and the ice bin, which still matches the story's line at 23; the near-end-of-the-counter move is what `24` and `308` show. See swap note 2. |
| `24-from-the-floor` | A first take had the journalist already down on the floor. He is not shot until 26, so it was reshot: he is still up on the end stool, alive, with the two men standing over the aisle and Mara's white sneaker just readable in the dark under the counter. |
| `25-two-pairs-of-shoes` | Two takes, then a flip. The first had the second man's legs off the frame edge; the second put both pairs of boots in the frame but showed Mara's sneakers lying **empty** on the boards, like discarded shoes, which is the one thing the shot must not say. The third take has her lower legs standing in them, worn, turned away down the room. It came out mirrored — a view back at the door must read with the counter on the right, as 21 and 28 do — so it was flopped left to right (nothing in the frame has text, so the flip is safe). |
| `26-the-variety-show` | The two shots are off screen: the frame is the room after them — the stool over, the man down, the two men standing, the television still laughing. No blood and no wounds. |
| `308-clip-under-the-shelf` | The clip is face-up in a run of amber light on the wet boards; only the edge of Mara's face is lit at the left, in the dark. |
| `19-the-bar` | Retaken to put the **till** on the counter at the near end — the end by the door, the end that matters later. |
| `21-mara-bursts-in` | Retaken. A previous take had her walking **out** through the door rather than in; the take in the folder has her coming into the room off the step, and the till visible on the counter behind her. |
| `23-behind-the-counter` | Retaken so the **till sits on the counter directly over her hiding place**, its base and the counter's wet edge forming the low roof of the space she is in. The crates and ice bin at the far end were pushed back out of the story. |
| `28-the-blue-glow` | Flopped left to right (nothing in the frame has text, so the flip is safe). As generated it contradicted the plan: a view back at the door must show the counter on the right of frame, the way 21 does, and it had the counter on the left. The flip puts the counter, the bottles, the two men's line of exit and the fallen stool on the correct side. |

## Status

**All eleven shots, the three sheets, the refs and the contact sheet are here.** Nothing from `s2/` has been
touched, and nothing here is wired into the film.
