# Storyboard Frames — *Nobody’s Witness* (Director’s Cut v4 — All 9 Gaps Filled)

All **9 previously missing storyboard slots** in the Neo-Noir / *Tokyo Story* Director’s Cut (`DIRECTORS_CUT_VERSION = 4`) have now been generated using the film's canonical character, prop, and location style sheets, conformed to exact `16:9` (`>= 1920×1080` Lanczos, zero downscaling), installed under `public/film/img/`, indexed in `src/data/media-index.json`, and wired directly into `src/core/directorsCut.ts` (`SHOT 01`..`SHOT 09` timeline ruler markers).

| Slot | Timeline Marker | Scene | Beat ID | Frames (`24 fps`) | Timecode | Duration | Installed Plate (`public/film/img/...`) | Resolution |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **01** | `SHOT 01 · S12 Coin` | `nw_s12` (*12 — The strap*) | `nw_b307` | `21386 – 21461` | `14:51:02` | `76f` (`3.17s`) | `/film/img/s12/307-vending-coffee-can.jpg` | `1920×1080` |
| **02** | `SHOT 02 · S12 Shutter` | `nw_s12` (*12 — The strap*) | `nw_b325` | `22360 – 22423` | `15:31:16` | `64f` (`2.67s`) | `/film/img/s12/325-barber-shutter-closing.jpg` | `2816×1584` |
| **03** | `SHOT 03 · 77A Avenue` | `nw_s77a` (*77 — The black glass*) | `nw_b1290` | `83155 – 83256` | `57:44:19` | `102f` (`4.25s`) | `/film/img/s77a/1290-predawn-avenue.jpg` | `1920×1080` |
| **04** | `SHOT 04 · 77A Sedan` | `nw_s77a` (*77 — The black glass*) | `nw_b1293` | `83257 – 83340` | `57:49:01` | `84f` (`3.50s`) | `/film/img/s77a/1293-sedan-keeps-pace.jpg` | `1920×1080` |
| **05** | `SHOT 05 · 77A Window` | `nw_s77a` (*77 — The black glass*) | `nw_b1294` | `83341 – 83418` | `57:52:13` | `78f` (`3.25s`) | `/film/img/s77a/1294-hand-and-watch-on-sill.jpg` | `2730×1536` |
| **06** | `SHOT 06 · 77A Exchange` | `nw_s77a` (*77 — The black glass*) | `nw_b1296` | `83419 – 83842` | `57:55:19` | `424f` (`17.67s`) | `/film/img/s77a/1296-everyone-is-allowed-one.jpg` | `1920×1080` |
| **07** | `SHOT 07 · 77A Glass` | `nw_s77a` (*77 — The black glass*) | `nw_b1303` | `83843 – 83920` | `58:13:11` | `78f` (`3.25s`) | `/film/img/s77a/1303-reflection-in-black-glass.jpg` | `1920×1080` |
| **08** | `SHOT 08 · 77A Taillights` | `nw_s77a` (*77 — The black glass*) | `nw_b1304` | `83921 – 84028` | `58:16:17` | `108f` (`4.50s`) | `/film/img/s77a/1304-sedan-turns-off.jpg` | `2844×1600` |
| **09** | `SHOT 09 · S78 Door` | `nw_s78` (*78 — No name*) | `nw_b1309` | `84250 – 84327` | `58:30:10` | `78f` (`3.25s`) | `/film/img/s78/1309-vera-opens-door-dawn.jpg` | `2844×1600` |

---

## Detailed Shot Specifications

### 1. `GAP 01` — `nw_s12` / `nw_b307` (`14:51:02`, `76f`)
- **Shot Size & Lens**: Close-up tactile insert (`50mm` lens, locked Ozu tripod).
- **Action**: Jack’s weathered hand feeds a `¥100` coin into a rain-streaked corner vending machine (`温かい` warm-drink buttons glowing amber-red); a steel coffee can clunks into the pickup slot below.
- **Sound Sync**: Anchored directly to `/film/sfx/vending-coin-can.mp3`.
- **Lighting & Palette**: Cold cyan-slate street rain in the background out of focus; warm practical glow from the vending display catching wet knuckles and brushed steel.

### 2. `GAP 02` — `nw_s12` / `nw_b325` (`15:31:16`, `64f`)
- **Shot Size & Lens**: Medium-long low angle (`35mm`) from the wet lane looking up at the second-storey window above the closed barbershop.
- **Action**: An elderly barber in striped cotton pajamas gives a small, apologetic shrug and pulls the corrugated metal storm shutter halfway down across the warm window frame.
- **Sound Sync**: Anchored directly to `/film/sfx/shutter-pull-down.mp3`.
- **Lighting & Palette**: Tungsten household bulb inside the upstairs room slicing narrowing horizontal light across wet exterior tile as the shutter descends.

### 3. `GAP 03` — `nw_s77a` / `nw_b1290` (`57:44:19`, `102f`)
- **Shot Size & Lens**: Wide architectural Ozu master (`28mm`, low-set tripod).
- **Action**: Pre-dawn Tokyo financial avenue in fine misting rain. Shuttered stone and glass bank facades on both sides, black mirror asphalt, white overhead streetlamps. Jack walks alone away from camera in his dark coat, left hand tucked inside his lapel holding Daniel’s envelope.
- **Sound Sync**: Wet rain foley + distant avenue room tone bridging out of Scene 77.
- **Lighting & Palette**: Deep slate-charcoal shadows, cold sodium/mercury streetlamps reflected vertically in wet asphalt, zero neon clutter.

### 4. `GAP 04` — `nw_s77a` / `nw_b1293` (`57:49:01`, `84f`)
- **Shot Size & Lens**: Medium-long telephoto compression (`75mm`, three-quarter rear-profile).
- **Action**: Twin warm-white headlights materialize softly out of the rain mist behind Jack; a long, spotless black executive sedan eases up beside the curb and matches his walking pace without braking.
- **Sound Sync**: Low wet-tyre hiss and muffled V8 idle entering on the SFX lane.
- **Lighting & Palette**: Specular headlight halation in mist, wet chrome trim glinting against deep obsidian bodywork.

### 5. `GAP 05` — `nw_s77a` / `nw_b1294` (`57:52:13`, `78f`)
- **Shot Size & Lens**: Tight insert (`50mm`) on the rear passenger door of the moving black sedan.
- **Action**: Tinted black window glass glides silently halfway down. Inside the dark rear cabin, Kurose’s face remains completely veiled in shadow; only a tailored charcoal cuff, a pale hand, and a thin silver dress watch rest calmly on the wet window sill.
- **Sound Sync**: Soft electric window motor + rain patter against glass.
- **Lighting & Palette**: Passing streetlamp catchlight on wet glass edge and watch bezel; cavernous interior black (`#07090d`).

### 6. `GAP 06` — `nw_s77a` / `nw_b1296` (`57:55:19`, `424f`)
- **Shot Size & Lens**: Composed medium two-plane frame (`40mm`) moving at walking pace alongside the curb.
- **Action**: Foreground silhouette edge of the open rear sedan window framing Jack in medium-close profile walking steadily in the rain, looking straight ahead rather than down into the car, right hand still guarding the envelope inside his coat during the entire six-line exchange (*“Detective.” / “Not any more.” … “Everyone is allowed one.”*).
- **Sound Sync**: Carries all 6 timed subtitle cues (`KUROSE` / `JACK`) across `17.67s` over steady rain and wet tyres.
- **Lighting & Palette**: Cold pre-dawn rain key on Jack’s wet temple and coat collar; deep black foreground frame of the car roof and B-pillar.

### 7. `GAP 07` — `nw_s77a` / `nw_b1303` (`58:13:11`, `78f`)
- **Shot Size & Lens**: Extreme close-up (`65mm`) straight onto the rear passenger window.
- **Action**: The dark tinted glass rises smoothly to the top seal; Kurose vanishes into black and Jack is left staring at his own dim, rain-streaked reflection in the glass.
- **Sound Sync**: Quiet rubber seal thud as the window closes.
- **Lighting & Palette**: Ghosted double reflection of wet streetlamps and Jack’s eyes across black glass.

### 8. `GAP 08` — `nw_s77a` / `nw_b1304` (`58:16:17`, `108f`)
- **Shot Size & Lens**: Locked Ozu tail shot (`35mm`, low camera height, dead-level horizon).
- **Action**: Jack pauses one beat on the empty sidewalk in foreground silhouette as the black sedan’s red taillights glide unhurriedly to the far intersection and turn off into the dark; Jack resumes walking.
- **Sound Sync**: Muffled tyre wash fading into dawn quiet, bridging cleanly into Scene 78.
- **Lighting & Palette**: Two muted crimson taillight reflections stretching across wet black asphalt — the scene’s sole selective warm-red accent.

### 9. `GAP 09` — `nw_s78` / `nw_b1309` (`58:30:10`, `78f`)
- **Shot Size & Lens**: Low tatami-height doorway composition (`35mm`, inspired by *Tokyo Story* hallway framing) looking from inside Vera’s dim apartment entryway toward the front door.
- **Action**: Grey dawn light leaks around the doorframe as Vera, sleepless in last night’s dark dress with the red bird clip still in her hair, opens the door partway and pauses before her gaze drops toward the doormat (cutting directly to existing insert `/film/img/s78/130-on-the-mat.jpg`).
- **Sound Sync**: Quiet latch click and morning corridor room tone.
- **Lighting & Palette**: Soft, cool grey dawn spill against shadowy interior wood and plaster, selective muted crimson accent on her hair clip.
