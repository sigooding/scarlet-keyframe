# reshoot-1080 — fresh plates for the film's sub-HD pictures

**Not wired in.** The originals are untouched and no scene data points here. This folder is a staging area
before a swap (see `docs/nobodys-witness-improvement-suggestions.md`, item 3).

**All eighteen are made** (18 of 18 — 16 October 2026, two passes; `_contact-sheet.jpg` shows the set).

Eighteen pictures in the film are not 1920×1080 (fifteen at 1365/1376×768, three newsroom inserts at odd
shapes). Per the director, 16 October 2026, these are **recreations, not upscales** — the originals looked
soft or off. Each file is named after the picture it replaces, so wiring one in is:

    cp public/film/img/reshoot-1080/<name>.jpg public/film/img/<folder>/<name>.jpg
    node tools/build-film-story.mjs

## How these were made

* **Fresh generations.** The film's own 1920×1080 sibling plates from the same scene were used as continuity
  references (cast, wardrobe, rooms, the car); the original low-res picture was added as a second reference
  where the staging is hard to guess (the balcony gap, the storeroom, the night exteriors).
* **Look:** the film's established treatment — grounded contemporary Tokyo neo-noir, cinematic photographic
  realism, restrained 35mm grain, practical fluorescent/tungsten light, wet city, natural exposure.
* **Size:** the generator returns 1376×768, so each is stored at 1920×1080 — Lanczos-upscaled from the
  1376×768 master with light unsharp masking. They are recreations; the detail is not natively 1080p.

## The plates

| File here | Replace | Scene | The beat it illustrates |
|---|---|---|---|
| `346-the-bulb-hums.jpg` | `public/film/img/s20/346-the-bulb-hums.jpg` | 20 Prove it | "Silence. The bulb hums." — Mara up on the futon (left), Jack low on a flour sack (right) |
| `123-fifty-years.jpg` | `public/film/img/s86/123-fifty-years.jpg` | 86 Fifty years | Kaneko takes a spanner to the old iron water pipe (the 13 Oct change) |
| `565-they-bow.jpg` | `public/film/img/s97a/565-they-bow.jpg` | 97A Mara's service | Vera goes to the table, Jack with her. They bow. |
| `381-the-plank.jpg` | `public/film/img/s90/381-the-plank.jpg` | 90 Through the rooms | A plank across the gap, hauled in after them — **staged to the director's note:** Vera on the plank, Jack behind her, **one** elderly Japanese neighbour holding the plank |
| `382-the-pipe-gallery.jpg` | `public/film/img/s90/382-the-pipe-gallery.jpg` | 90 Through the rooms | A pipe gallery, the pipes ringing softly: one rap means clear |
| `137-he-knows-this-car.jpg` | `public/film/img/s93/137-he-knows-this-car.jpg` | 93 He knows this car | Ishida stops at the kerb; the black sedan waits, wipers beating |
| `138-the-door-opens.jpg` | `public/film/img/s93/138-the-door-opens.jpg` | 93 He knows this car | Then the rear door opens from inside |
| `139-only-tea.jpg` | `public/film/img/s94/139-only-tea.jpg` | 94 The lit window | A man's clean hand holds out a cup of tea. It's only tea. |
| `140-where-are-we-going.jpg` | `public/film/img/s94/140-where-are-we-going.jpg` | 94 The lit window | Ishida in the rain, looking back at one lit window on the second floor |
| `368-the-door-closes.jpg` | `public/film/img/s94/368-the-door-closes.jpg` | 94 The lit window | Ishida gets in. The door closes. The rain is suddenly very far away. |
| `360-more-than-the-bowl-costs.jpg` | `public/film/img/s17/360-more-than-the-bowl-costs.jpg` | 17 You got old | A little more than the bowl costs, and a business card on top |
| `220-everything-is-still-there.jpg` | `public/film/img/s54/220-everything-is-still-there.jpg` | 54 Everything is still there | The tobacconist at the kiosk window, the old photograph held up to the glass |
| `393-run.jpg` | `public/film/img/s70/393-run.jpg` | 70 Position | Jack shoves Mara back toward the Hive door |
| `396-five-metres-three.jpg` | `public/film/img/s70/396-five-metres-three.jpg` | 70 Position | Mara breaks for the door. Five metres. Three. |
| `70-not-elegantly-badly.jpg` | `public/film/img/s73/70-not-elegantly-badly.jpg` | 73 Vera runs | Not elegantly. Badly. In heels, in the red dress, no coat, no umbrella |
| `new-jack-walks-in-1.jpg` | `public/film/img/s82/new-jack-walks-in-1.jpg` | 82 Start with my part | Jack walks in through the glass doors, determined |
| `new-jack-walks-in-2.jpg` | `public/film/img/s82/new-jack-walks-in-2.jpg` | 82 | He comes down the aisle between the desks, eyes on the glass office |
| `new-jack-walks-in-3.jpg` | `public/film/img/s82/new-jack-walks-in-3.jpg` | 82 | Nobody stops him. |

## Known issues — look at these before a swap

1. **`140-where-are-we-going` shows what reads as two sedans in one frame** (one at the left kerb, one with
   its door open at the right). Scene 94 has one car. It needs a re-render with a single sedan before it is
   used. The staging is otherwise right (Ishida in the rain, the lit window on the second floor).
2. **Legible signage.** The original brief keeps generated text out of frame
   (`FILM-montage-image-brief.md`). The new set is mostly defocused, but `70-not-elegantly-badly` carries two
   real drink brands on the vending machine (Kirin, Asahi) and `360` / `220` / `123` carry small Japanese
   signage. If that matters for clearance, they can be re-rendered to blur it.
3. **`346-the-bulb-hums` is a depth shot.** Its map, plate and two cut-outs in
   `public/film/depth/s20/346-the-bulb-hums/` were cut from the *old* art and already do not match it
   (`docs/handoff-2026-10-13-film-notes.md`). If the new plate is used, re-cut the layers from it with
   `tools/make-depth-layers.py` in the same pass, or the 2.5D camera will move the wrong shape. `382` and the
   rest have no depth rig, so they are a straight swap.
4. **Continuity to check across the car scenes** (`137`, `138`, `139`, `368`): the sedan reads as one car
   across 93–95 (the film's master car is `138`; `141-he-drinks` is the interior reference). `140` is the
   exception above.
5. **`396` keeps Jack in frame** — he crouches behind the dumpster while Mara runs; the line it illustrates
   ("Mara breaks for the Hive door. Five metres. Three.") is about her, so if the shot should be hers alone,
   say so and it will be re-rendered without him.
6. **The newsroom three are 16:9** as required (the originals were 1.79:1 / 1.85:1 / 1.78:1 and were being
   cropped). Cast: Jack is the same grey-haired man across the three; Harada is behind the glass.
7. **Nobody has watched these in sequence.** They were reviewed as a set (the contact sheet) and individually
   for cast, staging and lighting, but not against the shots on either side of them in the cut.
