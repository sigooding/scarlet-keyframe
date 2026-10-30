# s1_new: scene 1, "The backstreet", reshot from scratch

This folder is a new set of pictures for scene 1 of *Nobody's Witness* (EXT. BACKSTREET, KANDA – NIGHT). The
scene's 23 shots were all generated again from nothing, using a new set of style sheets for continuity.

- **Nothing was replaced.** `public/film/img/s1/`, `src/film/story.json`, `src/film/studio-edits.json` and the
  depth maps are unchanged, so the film still plays the old pictures.
- **Same filenames as `s1/`.** You can compare or swap the sets one for one.
- **`377-the-hive-remembered.jpg` is not here.** It sits in `s1/` but is the prologue/credits backdrop, not an
  alley shot.
- **House format.** Every shot is 1920×1080 sRGB JPEG at quality 92, the same as `s1/`. Since 17 October 2026 that is
  the smallest size, not a target: retakes go in with `tools/install-film-picture.mjs`, which never downscales.

## Shots

| # | File | Beat |
|---|------|------|
| 1 | `01-backstreet.jpg` | A narrow street of shuttered shops (master plate A, from the road) |
| 2 | `02-vending.jpg` | A vending machine hums on the corner; one lit window high up |
| 3 | `03-mara-walks.jpg` | Mara walks fast, arms folded, soaked, no umbrella |
| 4 | `04-mara-phone.jpg` | Her phone lights up: VERA |
| 5 | `05-phone-off.jpg` | She declines it |
| 6 | `328-the-scrap.jpg` | The note: "1.00 Sakai", an address, "just listen." underlined twice |
| 7 | `329-the-lane-the-watch.jpg` | Down the lane to the bar sign; her watch reads 12:45 |
| 8 | `06-barbershop-doorway.jpg` | She slips into the barbershop doorway, behind the scooter and crates |
| 9 | `383-the-empty-lane.jpg` | A crossing chimes for an empty intersection (master plate B, toward the road) |
| 10 | `07-old-man.jpg` | The old man comes in from the road, hand to his side, looking back |
| 11 | `330-the-red-clip.jpg` | She leans out; the red bird clip catches the light |
| 12 | `09-old-man-stops.jpg` | He sees it and stops six metres short; his face changes |
| 13 | `331-he-refuses.jpg` | He shakes his head and turns his back on her to face the road |
| 14 | `332-the-sedan-blocks-the-lane.jpg` | A black sedan blocks the mouth; high beams down the lane |
| 15 | `333-the-white-light.jpg` | Two masked men walk in; he stands in the white light |
| 16 | `10-the-shot.jpg` | A suppressed shot; he folds onto the street |
| 17 | `12-masked-man-radio.jpg` | "First position done. Moving to second." |
| 18 | `13-taillights-gone.jpg` | They drive off the long way round; tail-lights gone |
| 19 | `14-she-kneels.jpg` | She runs to him; her bag spills across the street |
| 20 | `15-the-grip.jpg` | He presses something brass into her palm |
| 21 | `16-the-key.jpg` | A small brass key on a tag stamped 114 |
| 22 | `17-she-runs.jpg` | She runs for the amber glow of the bar |
| 23 | `18-the-flashlight.jpg` | Her bag, open in the rain |

`contact-sheet.jpg` shows all 23 in story order, for a quick read of the cut.

## Style sheets (`style-sheets/`)

| Sheet | What it locks down |
|-------|--------------------|
| `mara-voss.jpg` | **v2, 17 October 2026: the face of the Hive scenes** (golden-blonde hair, light-blue eyes, soft oval face), from the director's references in `refs_v2/` (`mara-front.jpg`, `mara-face.jpg`, `mara-face-close.jpg`); attach those with every Mara shot. Wet hair, red enamel bird clip (left temple), denim jacket, grey tee, black jeans, white sneakers, gold watch on a thin brown strap (left wrist), brown leather Boston bag on a long strap (left shoulder). `refs/mara-*` and the first sheet (`archive/s1_new/style-sheets/mara-voss--v1.jpg`) are the earlier, darker-haired face |
| `old-man-sakai.jpg` | Mr. Sakai's face, grey tweed flat cap, cheap putty-beige vinyl raincoat, white shirt and grey cardigan, the hand pressed to his side |
| `masked-men-and-sedan.jpg` | Exactly two men: the earpiece leader (black suit, open overcoat, suppressed pistol) and the second man. Also the one black late-1990s executive saloon |
| `location-kanda-backstreet.jpg` | Master plates A (from the road) and B (toward the road), a plan of the lane with every story position, the geography rules and the look/palette |
| `props.jpg` | The hero props, cropped from the finished frames: the brass key and its 114 tag, the scrap, the red bird clip, the bag with its torn strap, the watch and the VERA phone. It also notes where each one turns up later in the film |

`style-sheets/refs/` holds the separate reference plates (front, back and face views, the sedan, plates A and B).
Pass them to the image model along with any new or replacement shot so it stays on model.

### The rules in one breath

- **Geography.** Looking *in* from the road, the barbershop is on the LEFT and the vending machine on the RIGHT
  corner, with Okada's amber bar sign at the far end. This matches scenes 12 and 14A. Looking *out*, the sides
  swap.
- **Positions.** Mara hides in the barbershop doorway about 12 m from the mouth. Sakai stops 6 m short of her,
  between her and the road. The sedan noses in across the mouth with its high beams down the lane.
- **Look.** Grounded contemporary Tokyo neo-noir: photographic realism, 12:45 a.m., steady cold rain, wet
  asphalt, practical light only, cool slate and blue-green shadows, restrained 35mm grain.
- **Text.** No legible signage except the story's own words: VERA, the scrap, 12:45 and 114. (The barbershop
  awning carries a faint shop name in several frames. It comes from plate B and is too small to read at frame size.)

## Before swapping any of these into the film

1. **Depth maps.** `01-backstreet`, `02-vending`, `329-the-lane-the-watch`, `332-the-sedan-blocks-the-lane` and
   `383-the-empty-lane` have depth maps (`public/film/depth/s1/…`) made from the *old* pictures. They will not fit
   the new ones. Remake them from the new picture with `tools/make-depth-layers.py` (CLAUDE.md rule 1, never a
   guessed map). Pictures with people need cut-outs and a plate (rule 2).
2. **Shot 14 lip-sync.** The lip-synced video clip was made from the old `14-she-kneels` still. A new still needs a
   new clip.
3. **Filename lookups.** Some depth tooling finds a picture by bare filename across `public/film/img/*/`, including
   `scripts/film-depth.entry.ts` (`npm run test:film-depth`) and `tools/depth-parallax-probe.py`. Because this
   folder reuses `s1/`'s names, those lookups can land on the `s1_new` copy. The test still passes, because every
   new frame is the same 1920×1080 size as the old one. Still, give the probe an explicit `s1/` picture while this
   folder exists, or delete the folder after the swap.
4. **Rebuilds.** `tools/build-film-story.mjs` copies media in additively, so a rebuild leaves this folder alone.

## How the pictures were made

- Reference plates were generated first: front, back and face views of Mara and Sakai, the two men, the sedan,
  and the two location plates.
- Every shot was then generated with the relevant plates passed in as references.
- Generator output (1672×941, or about 1376×768 when references are passed) was conformed to 1920×1080 with
  ImageMagick: a Lanczos resize to cover the frame, a centre crop and a light unsharp mask.
- The sheets were laid out in ImageMagick (crops, labels, palette chips, the plan diagram). The plan is drawn
  geometry, not generated.

### Corrections after generation

| Shot | Correction |
|------|------------|
| `04-mara-phone` | The generator wrote "VEBA" on the call screen. The B was redrawn as an R, so the screen reads VERA. |
| `329-the-lane-the-watch` | The sky came out at dusk brightness. A graduated night grade on the top half (a gamma curve, so the amber lamp keeps its highlight) brings it down to 12:45 a.m. like the master plates. |
| `330-the-red-clip` | Flopped left to right, since nothing in the frame has text. The flip puts the clip on her LEFT temple, as on every other shot, and points her eyeline at the road where the old man is. It also places the barber pole on the road side of the doorway, matching plate A. |
| `06-barbershop-doorway` | Fixed with a follow-up image edit. The first take put a vending machine on the barbershop's side of the lane, breaking the geography, and had Mara standing lit in the doorway. The edit removed the machine and pressed her back into the shadow, looking towards the road. |
| `333-the-white-light` | Fixed with a follow-up image edit. The first take had the old man side-on, facing the doorway where Mara hides. The edit turns his back to her, facing the two men, which is the protective stance the script describes. |
| `07-old-man` | Fixed with a follow-up image edit. In the first take he never looked back, so the edit turns his head to glance over his shoulder at the road. The faint lettering on the awning, larger in this frame because it is closer to camera, was softened by hand so it can't be read. |
| `10-the-shot` | The image model's content filter refused the first version (the pistol lowering as he falls). The shot is staged a beat later instead, as the original `s1` frame was: the old man down in the foreground, the two men standing in the headlights. |
| `17-she-runs`, `18-the-flashlight` | Both came out at dusk exposure. A night grade (a midtone gamma pull plus the graduated sky grade) brings them in line with the master plates; the lamps keep their highlights. |
| `18-the-flashlight` | The first take looked out to the road, so she was running the wrong way. It was regenerated using 17's view up the lane, so she runs towards the bar. |
