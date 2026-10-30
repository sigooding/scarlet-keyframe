# service_new — Mara's service (scene 97A), fresh set

A new, self-contained set of images for **Mara's service** (*Nobody's Witness*, scene 97A,
PlayFrame shots 556–569). **Nothing was replaced:** the film still plays the fourteen
pictures in `public/film/img/s97a/`; `src/film/story.json`, `src/film/studio-edits.json`
and `art/mara-service/` are untouched. Everything new lives here, **under the same
fourteen shot numbers and filenames as `s97a/`**, so any picture can be dropped into the
cut one-for-one.

Loosely scripted, tuned for visual sense: the staging follows the screenplay's stage
directions where they read, and fixes them where they fight the room — Kaneko is in her
own room, the memorial photograph is Mara's face and never changes, the rice-ball parcel
is newspaper-wrapped (as scene 68 set up), the bow keeps all seven mourners, and the
script's "her mother stays behind with the photograph" finally has its picture (569).
The full reasoning is in `style-sheets/continuity.md`.

Character consistency comes **from the original shipped scenes only** — `sheets/vera-face.jpg`,
`thehiveescape/style-sheets/`, and Kaneko's, Okada's and Mara's shipped film frames. No
`_new` folder was used as an identity reference.

## Style sheets

| Sheet | Locks down |
|---|---|
| `style-sheets/vera-mother.jpg` | **Vera's mother** — new sheet: early 60s American, Vera's bone structure, silver-blonde hair loosely pinned, long black coat over black dress, pearl studs, gold band |
| `style-sheets/mara-memorial-photo.jpg` | The memorial photograph: Mara's smiling portrait in the light-wood frame — the same object in every shot |
| `style-sheets/service-neighbours.jpg` | The three Hive neighbours: cane man (80s), stocky man (70s), shawl woman (70s) |
| `style-sheets/loc-service-room.jpg` | Kaneko's tatami room: table set-up, lamp on the left chest, window on the back wall, shoji corner, umbrella stand by the door, six cushions |
| `style-sheets/loc-lane-and-door.jpg` | The lane: ONE doorway on the left wall with step, eave and umbrella rack; viaduct crossing the far end |

The set's face authorities stay the shipped ones: Vera `../sheets/vera-face.jpg`, Jack
`../thehiveescape/style-sheets/jack.jpg`, Kaneko `../thehiveescape/style-sheets/kaneko-and-counter.jpg`,
Okada `../s81/100-the-bar-in-daylight.jpg`, Mara `../s69/279-her-sisters-smile.jpg`.

## Shots

### Arrival in the rain (556–559)
| File | Beat |
|---|---|
| `556-the-lane-from-above.jpg` | The lane from above: mourners gathered at the lit doorway, the one blue umbrella among the black, viaduct over the far end |
| `557-the-umbrellas.jpg` | Six black umbrellas crowd the doorway, beaded with rain; the blue one comes last |
| `558-the-blue-umbrella.jpg` | Vera closes the blue umbrella and stands it in the rack with the black ones |
| `559-shoes-at-the-step.jpg` | Shoes in a row below the step; stockinged feet on the old wood |

### The service (560–566)
| File | Beat |
|---|---|
| `560-jack-at-the-door.jpg` | Jack, last one in, stops at the door and looks back at the rain |
| `561-the-small-service.jpg` | The room, all seven: Vera, her mother, Jack on one side; the three neighbours on the other; Kaneko at the foot, her room |
| `562-kanekos-parcel.jpg` | Kaneko sets a newspaper-wrapped parcel (rice balls) by the photograph |
| `563-the-saved-drawing.jpg` | Jack straightens the photograph; Kaneko's hand steadies the frame, beside Mara's drawing of the arches in the rain |
| `564-the-room-from-above.jpg` | Overhead: the whole room around the table, seating matching 561; the incense goes straight up |
| `565-they-bow.jpg` | Vera and Jack bow at the table; the room bows with them — all seven in frame |
| `566-her-mothers-hand.jpg` | Her mother's hand finds Vera's on the table and holds it; Vera lets her |

### Okada, and out into the rain (567–569)
| File | Beat |
|---|---|
| `567-okada-at-the-door.jpg` | Okada at the door in a black suit, late, umbrella planted like a cane; he doesn't come in |
| `568-kaneko-and-okada.jpg` | Kaneko goes to him; they sit together by the lamp; his hand rests on hers, once |
| `569-after-the-service.jpg` | The walkers move off under the umbrellas (one blue), a train crossing the viaduct above; in the lit doorway behind them, Vera's mother stays a moment with the photograph |

### Extras — the mother (`extras/`)

Close-ups of Vera's mother, beyond the fourteen cut shots, for style and coverage:

| File | Beat |
|---|---|
| `extras/mom-01-her-face-at-the-table.jpg` | Her face at the table: held-back tears that do not fall |
| `extras/mom-02-mother-and-daughter.jpg` | Two-shot: her hand over Vera's; Vera lets it stay |
| `extras/mom-03-what-she-wears-home.jpg` | Full-length: black coat over black dress, pearls, gold band, leaving |
| `extras/mom-04-the-photograph-while-they-go.jpg` | She stays with the photograph while they go, the blue umbrella walking away under the viaduct |

`contact-sheet.jpg` shows all fourteen cut shots in order.

## Status

**Complete.** 5 style sheets, 14 cut shots (556–569, same filenames as `s97a/`), 4 mother
extras, contact sheet. Nothing outside `public/film/img/service_new/` was touched.

**Mara fix:** the first memorial-photo sheet aged Mara wrong; it was regenerated against
her shipped frame `../s2/21-mara-bursts-in.jpg` (early twenties, soft round face, large
blue-grey eyes, long wavy golden-blonde hair), and every shot holding the photo (561–564,
569, `extras/mom-04`) uses that face.

## Look

Photorealistic contemporary Japanese neo-noir, 16:9 film stills. Cold slate / teal-blue-green
shadows and rain, warm amber practicals only, wet reflective surfaces outside, restrained
35mm grain, natural exposure, subtle highlight halation. No film grade, no volumetric light
shafts, no legible signage or text, no logos, number plates, watermarks or borders.

## The 34-shot cut (17 October 2026)

The director asked for more shots so each still holds less of the song, then whether the cut made logical and visual
sense. The film plays this set through `tools/service-cut.mjs`, which rewrites scene 97A in `src/film/story.json` and the
"service" soundtrack's captions. Any shot not yet on disk is left out. Upload a picture under its filename here, run
`node tools/service-cut.mjs` and then `FILM_SRC=/nonexistent node tools/build-film-story.mjs`, and it slots in. With the
15 pictures present each still plays about 12.6 s; with all 34, about 5.6 s.

**Why the order is what it is:**
- 557 (the blue umbrella still coming up the lane) plays before 556 (it has reached the door, the mourners making way).
- The incense is lit (580) before any shot that shows it burning.
- 568 shows Kaneko and Okada alone in an emptied room, so it plays at the end, after the others have gone.
- The train goes over once, when they come out (569). The opening viaduct (574) has no train.
- The cut carries the three beats of the director's stills in `../service/`:
  - Jack standing over the photograph before he kneels (570);
  - Okada standing his umbrella beside the blue one (571, the director's still itself, installed as it is);
  - the circle made whole when Okada kneels with the others (572).
  - The director's 570, 572 and 573 are in another room (and 573 has Vera in a cream sweater), so they are redone here
    with the director's stills attached for the composition.

**Out of the cut:**
- `558-the-blue-umbrella.jpg`: her mother, not Vera, closes it. `558-vera-closes-the-blue-umbrella.jpg` replaces it.
- `extras/mom-02`: another room, with shoji windows and the photograph on a chest behind them. Replaced by 576.
- `extras/mom-04`: another lane, and a different face in the photograph. 569 and 573 carry the beat.
- The first `576-onto-the-old-wood`: 559 already shows the stockinged feet on the wood. The number now belongs to "mother and daughter".

Cut order (★ = still to make): ★574, 557, ★575, 556, ★558, 559, 560, ★570, ★580, ★578, ★579, 561, ★581, mom-01, ★582,
★583, 562, 563, 564, 565, 566, ★576, ★577, 567, 571, ★585, ★572, ★584, ★587, 569, ★573, 568, ★586, ★588.

**Every prompt ends with:** *Photorealistic contemporary Japanese neo-noir film still, 16:9. Cold slate and
teal-blue-green shadows, warm amber practical light only, restrained 35mm grain, subtle highlight halation. No legible
text, signage, logos or watermarks.*

Attachments are paths under `public/film/img/`.
- **Faces:** Vera `sheets/vera-face.jpg`, her mother `service_new/style-sheets/vera-mother.jpg`, Jack
  `thehiveescape/style-sheets/jack.jpg`, Kaneko `thehiveescape/style-sheets/kaneko-and-counter.jpg`, Okada
  `s81/100-the-bar-in-daylight.jpg`, the neighbours `service_new/style-sheets/service-neighbours.jpg`, Mara's photograph
  `service_new/style-sheets/mara-memorial-photo.jpg`.
- **The two places:** `service_new/style-sheets/loc-lane-and-door.jpg` (Lane) and `loc-service-room.jpg` (Room).
- **Costumes:** Vera wears a long charcoal-black wool coat over a white shirt, blonde hair in a loose low bun. Her mother
  wears a long black coat over a black dress, silver-blonde hair loosely pinned. Jack wears a long dark overcoat, white
  shirt and black tie. Kaneko wears a black kimono-style jacket. Okada wears a black suit and tie.

| File | Attach | Prompt |
|---|---|---|
| `574-the-viaduct-at-dusk.jpg` | Lane, `service_new/557-the-umbrellas.jpg` | Wide and low in the narrow lane behind the Hive, looking toward the concrete railway viaduct that crosses its far end, against the last blue light of dusk. No train. Steady rain, wet stone. The lane is empty; one doorway on the left wall is lit under its eave. |
| `575-vera-and-her-mother-arrive.jpg` | Lane, Vera, Mother, Jack, `service_new/557-the-umbrellas.jpg` | Medium-wide at ground level, the camera near the lit doorway looking up the lane toward the viaduct. Vera and her mother walk toward camera under one pale blue umbrella, Vera holding it: the only blue in frame. Jack walks a few steps behind them under a cheap clear plastic umbrella. Composed faces, grief held in. |
| `558-vera-closes-the-blue-umbrella.jpg` | Lane, Vera, `service_new/559-shoes-at-the-step.jpg` | Medium close-up at the threshold under the eave: Vera closes the pale blue umbrella with both hands and stands it in the umbrella stand just inside the door, among the folded black ones. Her face in three-quarter, eyes down, rain on her coat shoulders, warm light from the open door on her face, cold rain behind. |
| `570-before-he-kneels.jpg` | `service/O9ceFE65TRNiGCOW0yf-uM_Uc27pS8erJSk7Rl8Mi2A.jpg` (the director's still, for the composition), Jack, Room, `service_new/561-the-small-service.jpg` | Kaneko's room. Jack, coat still on, stands at the end of the low table looking down at Mara's photograph a long moment before he kneels. The others already kneel on their cushions, soft in the foreground with their backs to camera. The lace-curtained window and the rain behind him. The incense not yet lit. |
| `580-the-incense.jpg` | Kaneko, Room, Photo | Close-up: Kaneko's small old hand, in the sleeve of a black kimono-style jacket, holds a lit match to a stick of incense in the ceramic bowl; the first thin thread of smoke rises. The photograph soft behind, warm lamp light. |
| `578-maras-photograph.jpg` | Photo, Room | Close-up on the low wooden table: Mara's memorial photograph in its simple light-wood frame (exactly the smiling portrait on the sheet, never another face), a vase of white chrysanthemums, the incense bowl with one stick sending smoke straight up, a cup of tea with a little steam. The warm lamp to the left, the room soft behind, no one in focus. |
| `579-her-drawings.jpg` | `service_new/563-the-saved-drawing.jpg`, Photo | Top-down close-up: three or four of Mara's pencil sketches on white sketch paper laid flat on the dark wood table, rippled and faintly water-stained from being wet and dried: a brick railway arch in the rain with tracks through it, the Hive's crowded passages, a noodle counter. The corner of the light-wood photo frame and a chrysanthemum petal at the edge of frame. |
| `581-veras-face.jpg` | Vera, Photo, Room | Close-up of Vera kneeling at the table, looking down at Mara's photograph off frame. Dry-eyed, jaw set, holding herself together. Warm lamp light on one side of her face, cool window light on the other, incense smoke drifting across the soft background. |
| `582-jacks-face.jpg` | Jack, Room, `service_new/561-the-small-service.jpg` | Close-up of Jack kneeling at the end of the row (Vera, her mother, then him). He looks not at the photograph but along the row, past her mother, to Vera: still, quiet concern. Warm lamp light, the window's cool light behind him. |
| `583-the-neighbours.jpg` | Neighbours, Room | Medium shot across the table: the three Hive neighbours kneeling on grey cushions on the far side. The man in his 80s with a dark cane across his knees, eyes closed; the stockier man around 70, hands folded; the small woman in her 70s in a grey dress and dark shawl, hands clasped. A chrysanthemum soft in the foreground. |
| `576-mother-and-daughter.jpg` | Vera, Mother, Room, `service_new/566-her-mothers-hand.jpg`, `service_new/extras/mom-02-mother-and-daughter.jpg` (for the expressions only) | Two-shot, kneeling side by side at the low table in Kaneko's room: her mother's hand rests on Vera's on the table. Vera looks down and lets it stay; her mother looks at her. Mara's photograph and the chrysanthemums soft beside them, the lace-curtained window and the lamp behind. |
| `577-the-window.jpg` | Room | Kaneko's window, later: pale lace curtains, the neighbouring concrete building close beyond, darker now, a few more windows lit. Rain running down the glass, the room's small amber lamp reflected in the pane. No people. |
| `585-kaneko-goes-to-him.jpg` | Kaneko, Okada, `service_new/567-okada-at-the-door.jpg`, Room | From behind Kaneko as she crosses the tatami toward the open door. In the doorway, a little out of focus, Okada stands in the rain with his umbrella planted like a cane. The mourners kneeling at the table, soft at the edges of frame. |
| `572-the-circle-is-whole.jpg` | `service/bkTX06br5N65H_Yr-9iCLToIP6GEEDVQlXu6VG2T3wE.jpg` (the director's still, for the composition), `service_new/564-the-room-from-above.jpg`, Room | Straight down from above on Kaneko's room, the same room and angle as 564: everyone kneeling round the low table, Vera, her mother and Jack on one side, the three neighbours on the other, Kaneko at the foot, and Okada now kneeling beside her. The photograph, chrysanthemums, incense, tea and drawings on the table; the newspaper parcel by the photograph. The circle is whole. |
| `584-the-tea-gone-cold.jpg` | `service_new/578-maras-photograph.jpg` (once made: the same framing), Photo | The same close-up as 578, later: the cup of tea beside Mara's photograph has no steam now, the surface still; the incense stick burned down to a short stub with a long curl of ash. |
| `587-the-blue-umbrella-opens.jpg` | Lane, Vera, Mother, Jack | Medium shot from the lane, now dusk-dark: Vera steps down from the lit doorway and opens the pale blue umbrella into the rain, Jack beside her. Her mother stays just behind in the doorway. The room's warm light behind them, the lane cold blue. |
| `573-her-mother-stays.jpg` | `service/bpwgpfVmcdULHR-pb5mEqhPsPZzMm-tYvsqbz0ArTls.jpg` (the director's still, for the composition), Mother, Photo, Room, `service_new/568-kaneko-and-okada.jpg` | Kaneko's room, the cushions empty now: Vera's mother kneels alone at the low table with one hand resting on the edge of Mara's photograph frame. Chrysanthemums, the incense burned low, the lamp, rain on the window behind. |
| `586-his-hand-on-hers.jpg` | `service_new/568-kaneko-and-okada.jpg` | Insert close-up by the lamp: Okada's weathered old hand, black suit sleeve and white cuff, rests once on the back of Kaneko's small hand on her knee. Warm amber lamp light; nothing else. |
| `588-it-rains-all-night.jpg` | Lane, `service_new/569-after-the-service.jpg` | Wide in the lane at night, the same angle as 569: the lane empty and wet, rain falling through the light of the one doorway on the left, still lit. The viaduct dark at the far end. Nobody. |
