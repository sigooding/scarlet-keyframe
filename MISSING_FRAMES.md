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
- **Action**: Grey dawn light leaks around the doorframe as Vera, sleepless in last night’s dark dress with the red bird clip still in her hair, opens the door partway and pauses before her gaze drops toward the doormat.
- **Sound Sync**: Quiet latch click and morning corridor room tone.
- **Lighting & Palette**: Soft, cool grey dawn spill against shadowy interior wood and plaster, selective muted crimson accent on her hair clip.

---

## User-Voted Narrative & Epilogue Gap Frames (`SHOT 10` .. `SHOT 16`)

Seven additional narrative, prop-insert, and epilogue story beats were generated against the canonical character/prop/location reference sheets from `sigooding/scarlett-witness` (`sheets/jack.jpg`, `sheets/jack-face.jpg`, `sheets/vera.jpg`, `sheets/vera-face.jpg`, `sheets/Vera Grey Coat.jpeg`, `sheets/kaneko.jpg`, `s53/219-pink-water.jpg`, `s78/316-squared-to-the-door.jpg`, `s100/158-the-third-stool.jpg`, `s100/160-the-clip.jpg`, `s100/161-stool-three.jpg`), voted side-by-side (`offer_options: true`), conformed to exact `16:9` (`>= 1920×1080` Lanczos, zero downscaling), paired with custom `960×540` grayscale depth maps (`public/film/depth/...`), and wired across all four cuts (`VOTED_GAP_FRAME_SPECS` + `VOTED_GAP_DEPTH_MAP_BY_BEAT_ID`):

| Slot | Timeline Marker | Scene | Beat ID | Neo-Noir Duration | Installed Plate (`public/film/img/...`) | Depth Map (`public/film/depth/...`) | Resolution |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **10** | `SHOT 10 · S53 Cloth` | `nw_s53` (*53 — Pink water*) | `nw_b883` | `80f` (`3.33s`) | `/film/img/s53/883-she-wrings-the-cloth.jpg` | `/film/depth/s53/883-she-wrings-the-cloth-depth.jpg` | `1920×1080` |
| **11** | `SHOT 11 · 77A Envelope` | `nw_s77a` (*77 — The black glass*) | `nw_b1292` | `80f` (`3.33s`) | `/film/img/s77a/1299-the-envelope.jpg` | `/film/depth/s77a/1299-the-envelope-depth.jpg` | `1920×1080` |
| **12** | `SHOT 12 · S78 Knock` | `nw_s78` (*78 — No name*) | `nw_b1307` | `88f` (`3.67s`) | `/film/img/s78/1307-jack-knocks-once.jpg` | `/film/depth/s78/1307-jack-knocks-once-depth.jpg` | `2048×1152` |
| **13** | `SHOT 13 · S78 Daniel Voss` | `nw_s78` (*78 — No name*) | `nw_b1313` | `67f` (`2.79s`) | `/film/img/s78/1313-daniel-voss-inside-cover.jpg` | `/film/depth/s78/1313-daniel-voss-inside-cover-depth.jpg` | `1920×1080` |
| **14** | `SHOT 14 · S100 Kaneko Sign` | `nw_s100` (*100 — Epilogue*) | `nw_b1675` | `158f` (`6.58s`) | `/film/img/s100/1676-the-kaneko-sign.jpg` | `/film/depth/s100/1676-the-kaneko-sign-depth.jpg` | `2844×1600` |
| **15** | `SHOT 15 · S100 Bird Clip` | `nw_s100` (*100 — Epilogue*) | `nw_b1682` | `88f` (`3.67s`) | `/film/img/s100/1682-the-curtain-moves.jpg` | `/film/depth/s100/1682-the-curtain-moves-depth.jpg` | `1920×1080` |
| **16** | `SHOT 16 · S100 Money` | `nw_s100` (*100 — Epilogue*) | `nw_b1685` | `100f` (`4.17s`) | `/film/img/s100/1685-money-on-the-counter.jpg` | `/film/depth/s100/1685-money-on-the-counter-depth.jpg` | `1920×1080` |

---

## User-Voted Dialogue Close-Up Coverage (`SHOT 17` .. `SHOT 22`)

Six cinematically motivated `85mm` speaker close-ups were generated with `offer_options: true` from `sigooding/scarlett-witness` character sheets (`vera-face.jpg`, `mara-face.jpg`, `ishida-face.jpg`, `jack-face.jpg`) and each scene's original master plate. **No original frames were deleted**: each preceding wide/two-shot/insert master plate remains on its opening beat(s) and is resized shorter so the new speaker close-up fits seamlessly immediately after it (`VOTED_CLOSEUP_FRAME_SPECS` + `VOTED_CLOSEUP_DEPTH_MAP_BY_BEAT_ID`):

| Slot | Timeline Marker | Scene | Resized Original Frame | New Close-Up Beat & Duration | Installed Plate (`public/film/img/...`) | Depth Map (`public/film/depth/...`) |
| --- | --- | --- | --- | --- | --- | --- |
| **17** | `SHOT 17 · S6 Vera CU` | `nw_s6` (*6 — The interview room*) | `nw_b155` `/film/img/s6/58-why-kanda.jpg` (`98f`) | `nw_b157` (`374f` / `15.58s`) | `/film/img/s6/157-the-shootings-in-kanda.jpg` | `/film/depth/s6/157-the-shootings-in-kanda-depth.jpg` |
| **18** | `SHOT 18 · S20 Mara CU` | `nw_s20_b` (*20 — Prove it*) | `nw_b521` `/film/img/s20/371-the-coward-line.jpg` (`117f`) | `nw_b523` (`583f` / `24.29s`) | `/film/img/s20/523-they-have-my-passport.jpg` | `/film/depth/s20/523-they-have-my-passport-depth.jpg` |
| **19** | `SHOT 19 · S25 Jack CU` | `nw_s25` (*25 — Locker 114*) | `nw_b615` `/film/img/s25/370-the-tag-114.jpg` (`397f`) | `nw_b622` (`241f` / `10.04s`) | `/film/img/s25/622-keep-it.jpg` | `/film/depth/s25/622-keep-it-depth.jpg` |
| **20** | `SHOT 20 · S61 Ishida CU` | `nw_s61` (*61 — Nine o'clock*) | `nw_b1008` `/film/img/s61/482-just-you.jpg` (`271f`) | `nw_b1012` (`264f` / `11.00s`) | `/film/img/s61/1012-nine-oclock.jpg` | `/film/depth/s61/1012-nine-oclock-depth.jpg` |
| **21** | `SHOT 21 · S62 Jack CU` | `nw_s62` (*62 — Like a date*) | `nw_b1019` `/film/img/s62/485-the-signal-is-red.jpg` (`318f`) | `nw_b1025` (`215f` / `8.96s`) | `/film/img/s62/1025-something-to-tell-you.jpg` | `/film/depth/s62/1025-something-to-tell-you-depth.jpg` |
| **22** | `SHOT 22 · S98 Jack CU` | `nw_s98` (*98 — The rain has stopped*) | `nw_b1617` `/film/img/s98/524-the-only-eyewitness.jpg` (`318f`) | `nw_b1622` (`573f` / `23.88s`) | `/film/img/s98/1622-my-statement.jpg` | `/film/depth/s98/1622-my-statement-depth.jpg` |


