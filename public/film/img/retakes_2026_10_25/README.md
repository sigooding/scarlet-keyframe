# Retakes 25 October 2026 — director-voted batch (brief §§2–4, partial)

Made to `docs/image-brief-2026-10-25.md`, each picture chosen by the director from a 2-option vote.
**Not wired into the film** (no `src/` changes), per the brief: the maintainer swaps them in after review.
Nothing was overwritten or deleted; rejected versions are kept beside their picture as `--altN`.
Files are saved at the size the generator produced them and were never downscaled. Several are below
1920 wide or not exact 16:9 (1376×768, 1672×941, 1344×768): the agent sandbox had no ffmpeg, so run
`tools/install-film-picture.mjs` (crop to 16:9 / enlarge to 1920×1080) when swapping them in.

## Made (director's picks)

- `montage18-01-r1.jpg` (2a) 1376×768 — desk in room-master orientation, Jack at right end, no window
  reflection. Flag: the open sketchbook reads as a large ledger with faint unreadable scribbles.
- `271-not-yet-r1.jpg` (2b) 1376×768 — desk and hand-on-closed-sketchbook correct. Flags: Vera standing
  at the left end rather than seated; one mug instead of two paper coffee cups; reads as night, brief
  asks flat grey day.
- `194-he-holds-it-without-drinking-r1.jpg` (2d) 2096×1184 — redone after first pick lost Jack's desk:
  the broad walnut desk and green lamp are back (edited from room master 164), grey daylight, both paper
  cups, closed sketchbook. Flag: Vera's empty chair is cropped at the bottom-left edge.
  `194-...--alt1.jpg` = rejected first pick (slim table, no lamp).
- `249-the-line-r1.jpg` (2e) 1672×941 — receiver at ear at the correct (right) end of the desk. Clean.
- `204-the-tea-she-does-not-want-to-pour-r1.jpg` (3a) 2848×1600 — altar on the RIGHT, Mrs Sakai left,
  Jack right with back to altar. Flags: Jack's back is square to camera; a second teapot sits on the kotatsu.
- `354-the-altar-photograph-r1.jpg` (3b) 1376×768 — Jack added kneeling right, altar/TV right. Flag:
  her gaze lands on Jack more than clearly past him to the photograph.
- `364-the-kotatsu-r1.jpg` (3c) 1376×768 — empty room, altar right, TV on (pale glow), teacup on its side. Clean.
- `207-the-pink-payphone-r1.jpg` (4a) 1672×941 — exactly one pink handset (at his ear, cradle bare, no
  other phone) AND Mr Noda's desk restored in the right foreground as in 176, Noda asleep behind it
  (director's note in session: "the desk in the inn"). Flag: handset is held low at the mouth.
  `207-...--alt1.jpg` = rejected (second handset still hanging). `207-...--alt2.jpg` = rejected
  (one handset fixed, but desk still missing).
- `538-the-receipts-in-his-hand-r1.jpg` (4b) 1344×768 — one pink handset, receipts in the other hand, desk
  restored. Flag: framing came out as the wide lobby shot (like 207), not the original tight close-up.
- `376-the-coins-run-out-r1.jpg` (4c) 1672×941 — pink handset (no black receiver), exactly two arms, bare
  coin tray, desk restored.
- `177-behind-the-counter-r1.jpg` (4f) 2848×1600 — lobby/desk as 176, Noda dives behind desk (chair
  tipping), masked gunman fires into ceiling, plaster falling. Flag: muzzle flash makes the weapon read
  as an unsuppressed pistol.
- `210-the-third-time-r1.jpg` (4h) 2848×1600 — Jack's long wet overcoat restored; frame/glass moment kept.
- `213-clutch-each-other-r1.jpg` (4i) 2784×1504 — Mr and Mrs Noda clutch each other in the pantry doorway as Jack
  shuts the door. Flags: calmer/less tilted than "rushed"; torch beam appears to come from behind the couple.

## Not made / still to do

- §1 (1a–1g) Kurose's car / Ishida shots — **skipped at the director's request** ("they're not coming out right").
- 2c `87-he-writes-nothing`, 4d `460-parked-crooked` (twice), 4e `175-the-curtain-gap`,
  4g `178-staff-side`, 4j `462-a-finger-to-his-lips` — generated as vote pairs, director selected neither;
  need fresh attempts.
- All of §5 (5a–5u) — not reached in this session.
- Depth layers for any of these that carry them in the film today (see `docs/director-picks-2026-10-25.md`)
  have not been remade.

## Check by the film's maintainer, 25 October

Each picture was compared with the picture it replaces, the shots either side of it and its brief entry.

**Ready to swap in (9):**

| Picture | Check |
|---|---|
| `montage18-01-r1` | Desk the room master's way, no reflection, night. Good. |
| `194-...-r1` | Desk, daylight, paper cups right. One small thing: the sketchbook is dark green; it is cream in 271 and elsewhere. |
| `249-the-line-r1` | Clean. |
| `354-the-altar-photograph-r1` | Jack added, altar right. Good. |
| `364-the-kotatsu-r1` | Clean; matches 365-r1, which plays next. |
| `207-the-pink-payphone-r1` | One handset, two arms, the desk restored. Good. |
| `376-the-coins-run-out-r1` | One handset, two arms, the tray bare. Good. |
| `177-behind-the-counter-r1` | Good. One note: the gunman fires a pistol with a big flash where the script has a suppressed burst. |
| `210-the-third-time-r1` | The coat restored, nothing else changed. Good. |

**Another go needed (briefed as section 6 of `docs/image-brief-2026-10-25.md`):**
- `271-not-yet-r1`: Vera stands, though the script says "She sits"; one mug, not two paper cups; and it is night, in a day
  scene, between two day shots.
- `204-...-r1`: the altar is fixed, but Jack kneels with his back to the camera, facing the wall rather than her. (The brief's
  "his back to the altar" was ambiguous; now reworded.)
- `213-clutch-each-other-r1`: the torch beam comes from inside the pantry, behind the couple.
- `538-...-r1` (optional): right, but it came out as the same wide shot as 207 and lost its close-up on the receipts.

**When swapping in:**
- Eight are under 1920 wide. Give them the Topaz upscale the 17 small pictures had on 25 October rather than a plain enlarge:
  `montage18-01`, 271, 354, 364 and 538 are about 1376×768; 207, 249 and 376 are 1672×941.
- 354 and 364 carry depth layers in the film today (354 cut-outs, 364 a map); make them again for the new pictures.


## In the film, 25 October (later)

The director said yes to the nine above. They are in the film at their old paths, and each old picture is archived first
(`public/film/img/archive/…`).
- **Upscaled with Topaz first:** the six under 1920 wide (`montage18-01`, 354, 364, 207, 249, 376), with the same settings as
  the 17 small pictures that morning.
- **In as they were, cropped to 16:9:** 194, 177 and 210.
- **Depth:** 354's cut-outs were made again from the new picture, now one for Mrs. Sakai and one for Jack. 364's depth map was
  made again too. Both moves were recorded and checked.
- **Record:** `docs/film-picture-upscales-2026-10-25.json`, under `retakes_2026_10_25`.

## Kurose's car (section 1), tried by the film's maintainer, 25 October

The director: "the image generator had trouble doing ishida and kuroso in car do you want to try".
- **How:** GPT Image 2.5 (Sunburst) at its largest size, 3840×2160, against the brief's references, on ElevenLabs flow
  `dsQZzfGrpAo1mBCv7fCI` ("Nobody's Witness: Kurose's car (scenes 93-94)").
- **Cost:** eleven pictures, 14,144 credits. Then the account ran out, with 659 credits left. A 4K picture costs 1,100 to
  1,600, so 1b and most second takes were never made.
- **Not in the film.** The brief's sequence moves 141 and adds 94-01. These go in together once 138 and 139 exist and the
  director has seen them.

| File | Item | Check |
|---|---|---|
| `137-he-knows-this-car-r1.jpg` | 1a | The coat is gone: the charcoal jacket and grey shirt, soaked. Nothing else changed. Good. |
| `140-where-are-we-going-r1.jpg` | 1d | From the road across the car's roof. Ishida, no coat, looks up at the one lit window on the second floor, a figure at a desk in it. Good. Two notes: he stands just forward of the open door rather than in its doorway, and the split lip doesn't show at this distance. |
| `94-01-the-clean-hand-r1.jpg` | 1e | The steel cup held out across the empty seat, with steam and the black-strap watch. But Kurose's face is in full light, where the brief kept it in shadow. Usable if the director doesn't mind seeing him here. |
| `141-he-drinks-r1.jpg` | 1g | 141 with the model's watch (black leather strap) and a small split on Ishida's lip. Good. |
| `368-the-door-closes-r1.jpg` | 1f | Ishida screen-left with the cup in both hands, eyes down, the split lip. Kurose screen-right looking straight ahead, hands folded, the watch showing. The seats match 141. Good. `--alt1` is the same with Kurose's eyes lowered. |
| `139-only-tea-r1.jpg` | 1c | **Not right.** The door now hinges at its front edge and the near seat is empty, but the car is the other way round, its left side at the kerb. That puts Kurose behind the driver, on the side 141 gives Ishida. Ishida also wears a long coat again. |

**Tried and not kept** (ids on the flow):
- a second 137, the same as the first (`kqqvFOLX04LNvgkD8w4b`);
- two edits of the current 139, which kept the door hinged at its back (`vk6WsL2GC6EbcWvvuSuf`, `gFlW8wAhAE1wOWVbhZMH`);
- a second fresh 139, turned round like the one kept and with Kurose in the near seat (`KFgqqguSXU5pkyd9TDOG`).

**Kept ids:**
- 137 `SxftewwtmLfUHTsOm8pl`;
- 140 `POTqUMyvFCzK0YBwenrG`;
- 94-01 `0Q2h8ZNzXShXuYTA2k19`;
- 141 `YmGriq85Zm13cniQBms9`;
- 368 `GVc8c6hCCeu0Ox1XXPcR`, alt `rPyBRRK86juCrNDtQWYL`;
- 139 `09KusjBoEqPbfUQpn1br`.

**Still to make:** 1b (138, an edit of `137-he-knows-this-car-r1.jpg`, now that it exists) and 139 again. The next 139 should
leave the door out of frame: the generator turns the car round whenever the door is in shot. Both are briefed as 6e and 6f in
`docs/image-brief-2026-10-25.md`.

## Second batch, 25 October (evening): from-scratch car set with tinted glass, and the §6 retakes

Director's two new instructions for this batch:
1. **The car has dark tinted windows in every exterior.** The old attempts kept failing because edit models inherited the
   clear-glass look (and, for 139, the wrong door hinge / car orientation). So these were all **generated from scratch** — no
   previous car still used as a base — with only the character sheets (`sheets/ishida*.jpg`, `sheets/kurose.jpg`) attached as
   references, to hold faces and wardrobe. The tint, the seat lock and the camera side are written into every prompt.
2. **Keep character consistency:** Ishida and Kurose are matched to their sheets in every new picture.

The first, edit-based attempts from this session were rejected by the director ("images are bad … generate from scratch") and
are kept beside the new ones as `--alt1-edit.jpg`. Nothing was overwritten or deleted. Per the director, the new files are
**not cropped or resized**; they sit at the generator's native size (mostly 1376×768, so a Topaz/house upscale is still owed
at install time, as for the small 25-October pictures). None is wired into the film — no `src/` changes.

### Car set (brief §1 and §6e–6g), all with dark tinted glass on the closed windows

| File | Item | Result / flags |
|---|---|---|
| `137-he-knows-this-car-r2.jpg` | 1a, from scratch | Ishida in his sheet face/wardrobe, no coat, soaked; black saloon nose-left at the kerb, all doors shut, rear and side glass near-black and reflective. Blank number-plate panel. Station reads as the same concrete station but is a fresh design, not pixel-matched to the old still. |
| `138-the-door-opens-r1.jpg` | 1b / 6f | Same from-scratch set-up as the new 137. Every near-side door shut; faint amber behind the tint and a warm light spill under/behind the car onto the wet pavement, per "the door opens on the far side". No open door visible. |
| `139-only-tea-r2.jpg` | 1c / 6e | **The four-time failure, now right.** Open doorway fills frame, the open door itself out of shot; near half of the back seat empty (armrest down); Kurose on the far side by the far window, facing the front (right of frame), face in shadow, white hair catching amber; driver's dark silhouette at the right edge; closed glass tinted. Side-on exterior rather than a strict over-shoulder, which is what finally kept the car from turning round. |
| `94-01-the-clean-hand-r2.jpg` | 1e / 6g | Steel cup with steam held across the empty near seat, black-leather-strap watch, white cuff; Kurose's face now in deep shadow (the 6g fix), only his hair lit; closed windows tinted; rain through the doorway. |
| `140-where-are-we-going-r2.jpg` | 1d, from scratch | Across the wet roof, nose-left; windscreen and side glass tinted; open rear door only as a frame above the roofline at right with amber below it; Ishida three-quarter, looking up at the one lit second-floor window with a figure at the desk. |
| `142-taillights-r1.jpg` | new, outside the brief | The saloon driving away down the rain alley (scene 95) remade so its rear and side glass are opaque tint — no driver or interior visible — keeping the taillights and red light trails. |

The tint cannot apply to the interior two-shots `141-he-drinks-r1` and `368-the-door-closes-r1` (the camera is inside the
car); they already pass their checks and keep clear glass, which is correct for an in-car viewpoint.

### §6 second attempts

| File | Item | Result |
|---|---|---|
| `271-not-yet-r2.jpg` | 6a | Now grey DAY (no lamp lit, daylight train through the blinds), Vera **seated** at the desk's left end in her dark coat and cream knit, Jack at the right end with his hand on the closed sketchbook, **two paper cups**, one each. Face matches the Vera sheet. |
| `204-the-tea-she-does-not-want-to-pour-r2.jpg` | 6b | Same room/altar-right composition; Jack now kneels upright at the right of the kotatsu in right profile, facing Mrs. Sakai across it (as 273 has him), not facing the wall. |
| `213-clutch-each-other-r2.jpg` | 6c | Pantry behind the couple now black, no torch inside; the torch beam enters from off-frame behind the camera (corridor side) across the kitchen wall and Jack's shoulder; the couple clutch each other. |
| `538-the-receipts-in-his-hand-r2.jpg` | 6d | Tight close-up restored (receipts fanned in his hand, pink phone, coin tray); one pink handset at his ear on its coiled cord, empty cradle, no second receiver. |

## Third batch, 25 October (night): third attempts, for review only — nothing installed

Another from-scratch round addressing the weaknesses left in the second batch. All seven are saved beside the earlier
takes, not cropped or resized (native 1376×768; 213-r3 is exact 16:9 at 1376×768), and nothing under `src/` changed. The
director reviews and picks before any install.

| File | Item | Result / flags |
|---|---|---|
| `137-he-knows-this-car-r3.jpg` | 1a, third attempt | Wider street view, fully opaque black tint on every window, all car doors shut, Ishida sheet-consistent and soaked. **Flag: the station's own glass entrance door is standing open** (no car door is). The r2 keeps the entrance shut and may be the safer pick; r3 is the stronger car/tint. |
| `138-the-door-opens-r2.jpg` | 1b/6f, second attempt | Fixes r1's interior bleed: the glass is now solid black with nothing visible through it; the "door opens on the far side" reads only as an amber pool on the wet road around the rear of the car. All near doors shut. |
| `139-only-tea-r3.jpg` | 1c/6e, third attempt | Tighter, more cinematic crop of the same correct geography: doorway fills frame, no door panel, empty near seat with armrest down, Kurose far side facing the front (right), face in shadow, driver silhouette at right, opaque tint on the closed glass. No new faults seen. |
| `94-01-the-clean-hand-r3.jpg` | 1e/6g, third attempt | Stronger shadow on the face, black-strap watch and steaming steel cup clear, empty near seat, opaque tint. **Flag: he reads as half-risen/crouching at the doorway rather than seated leaning across, and the open door's edge intrudes at the bottom-right corner.** r2 keeps him seated and door-free; r3 has the better mood and watch. |
| `140-where-are-we-going-r3.jpg` | 1d, third attempt | Fixes r2's hatch-like raised panel: the open door now stays below the roofline and reads only as a warm amber rectangle low at frame right; tint fully opaque; Ishida three-quarter looking up at the one lit window, figure at the desk visible. |
| `142-taillights-r2.jpg` | scene 95, second attempt | Fixes r1's over-saturated stylized grade and busy signage: muted film-still colour, blank unreadable lanterns and neon, neutral vending machine, opaque rear/side glass, same taillights and red trails. |
| `213-clutch-each-other-r3.jpg` | 6c, third attempt | Fixes the beam direction decisively: the pantry behind the couple is pitch black and a torch cone now enters head-on from off-frame behind the camera, lighting the door frame and the couple's shoulders; they clutch each other, Jack is mid-shove with the coat swinging. **Flags: the torch body peeks into the very bottom-left edge (brief said keep the torch itself out of frame), and a small dark cylindrical wall fitting behind Jack's head could misread — check at review.** |

### Recommendation for the review (not a decision)

- Prefer **137-r2** (shut entrance) unless the wider street of r3 is wanted; **138-r2**, **139-r3**, **140-r3**, **142-r2** and
  **213-r3** are the strongest of their sets; for **94-01** choose r2 for seating/door correctness or r3 for mood.
- The second-batch §6 retakes **271-r2, 204-r2, 538-r2** had no identified faults and were not regenerated.

### Still open after this batch

- Director's review/vote on the from-scratch car pictures (now r1–r3 where they exist) and the §6 retakes before any are installed.

## Fourth batch, 25 October (night): brief §5, the remaining retakes — part 1 (5a–5j)

Made from the briefs in `docs/image-brief-2026-10-25.md` §5, character sheets attached for faces, native sizes, nothing
installed. The per-turn image limit cut the batch at ten pictures; 5k (469) and 5l (231) did not generate and lead part 2.

| File | Item | Result / flags |
|---|---|---|
| `m1-neon-backstreet-r1.jpg` | 5a | Crisp empty rain-soaked Kanda alley, vending machine right, lanterns/neon with no readable writing, deep perspective. Clean. |
| `384-the-room-too-big-r1.jpg` | 5b | Normal-lens lived-in room, Vera at the low table, cabinet/lamp/photo/umbrella left, CRT right. **Flag: a black smartphone lies on the table — period-anachronistic; remove at review/next pass.** Two cups present. |
| `419-twenty-years-r1.jpg` | 5c | Face/hair rebuilt to the Jack sheet (grey-streaked swept-back hair, stubble), office/lamp/phone/rain window kept. Clean. |
| `246-the-can-r1.jpg` | 5d | The dropped can is now a short dark-brown/cream steel coffee can, unopened, no label; everything else kept. Clean. |
| `285-the-inside-pocket-r1.jpg` | 5e | Correct counter end by the ticket machine, cook and tile arch, Vera soft at frame edge. **Flag: his hand is up at his chest/lapel rather than resting on the counter near it; close to the "doesn't touch the pocket" intent but worth a look.** Some menu sheets carry faint unreadable print. |
| `349-paid-to-listen-r1.jpg` | 5f | Same seat, turned to Vera in the near foreground, bowl and cup on the counter, cook behind. Clean. |
| `445-exactly-where-it-was-r1.jpg` | 5g | Jack now photographic, not painted; storeroom/bulb/flour sacks/scoop kept. Checked against `s84/520-excuse-me.jpg`: the drawing's "EXCUSE ME" caption and the sack's "FLOUR" stencil both exist in the in-film reference, so they match. **Only flag: an added "1:07" on the drawing that 520 does not have.** |
| `289-for-making-me-r1.jpg` | 5h | Note count reduced to a small folded pair. **Flag: the notes read as US dollar bills, not Japanese yen.** |
| `374-the-dead-television-r1.jpg` | 5i | Vera crouched among beer crates looking up at the high shelf CRT; screen dark grey, switched off, no reflection of her face. Clean. |
| `montage53-05b-light-off-r1.jpg` | 5j | The one lit window is now dark like every window of the building; rain and framing kept. Clean. |

## Fifth batch, 25 October (night): brief §5 part 2 (5k–5u) — §5 now complete

**Orientation fix.** The director reported portrait outputs. Those were the *rejected* options of the two-option votes and
were discarded; every saved file was re-measured and is landscape, 1.77–1.79:1. From this batch on every prompt opens with
"WIDE 16:9 HORIZONTAL LANDSCAPE FILM FRAME — strictly horizontal, never portrait or square". 469, 231 and 232 were made as
votes; the director picked 469 option 1, 231 option 1, 232 option 2. Rejected alternatives are not kept on disk.

| File | Item | Result / flags |
|---|---|---|
| `469-what-they-are-told-r1.jpg` | 5k, voted | No glasses on her face; the pair is held in her hand at chin level. **Flag: the frame is a wider newsroom set-up with wall TVs, not the original desk close-up.** |
| `231-the-box-r1.jpg` | 5l, voted then superseded | Director: "tape and book too small". Kept as the small-alt. `231-the-box-r2.jpg` is the working take: the SHIOHAMA cassette in its cracked case and the plain black notebook now dominate the frame on the perforated bench, torn padded envelope in his hands, no cardboard box. |
| `232-the-wine-red-dress-r1.jpg` | 5m, voted | Held, not worn: the wine-red slip hangs over her cream knit by its straps, knit collar/sleeves visible; mirror framing, bed/box/window/lamp behind. Clean. |
| `70-the-call-r1.jpg` | 5n, superseded | Face/dress consistent, but chest-up and reads seated. `70-the-call-r2.jpg` is the working take: wide, she is mid-rise off the bar stool, receiver to ear, one hand on the bar; the phone is now a period corded bar phone (no mobile), pianist/clock/bottles kept. |
| `73-09-she-cannot-breathe-r1.jpg` | 5o | Original rain-street frame and pose kept exactly; the black mascara streaks are gone, only faint under-eye smudges. Clean. |
| `88-the-walkway-r1.jpg` | 5p | Last door closed, bare doormat, nobody in frame; dawn walkway, dripping rail, rail lines beyond. Clean. |
| `106-play-r1.jpg` | 5q | Same silver-grey portable recorder as 105/509 (tape window left, round speaker right, red piano key), white cuff pressing PLAY, journalist photo frame beside it. Clean. |
| `512-he-hasnt-stopped-r1.jpg` | 5r | Harada and Vera both turned to the glass office, where Jack talks with a moving hand. Note: Harada keeps her glasses here — the no-glasses note applies only to 469. |
| `519-not-all-right-r1.jpg` | 5s | Hair in a low loose bun with loose strands, white collared shirt under the dark coat, storeroom/bulb/drawings/cloth bag kept. Clean. |
| `303-he-left-a-statement-r1.jpg` | 5t | Same room language as 143: windows right, serving hatch/clock back wall, steel desks; young detective with receiver, open box and radio on the desk. Clean. |
| `161-stool-three-r1.jpg` | 5u | Exactly two natural legs; Vera lowering onto the stool on Jack's LEFT (between him and Kaneko), red bird clip in place. Kaneko matches her sheet (elderly woman, cardigan/apron). **Flag: the location's hand-painted kanji sign is legible, as it is in the s100 plates; confirm that stays.** |

### Remaining after §5

- The five unchosen retakes, fresh attempts: 2c `87-he-writes-nothing-r1`, 4d `460-parked-crooked-r1`, 4e `175-the-curtain-gap-r1`,
  4g `178-staff-side-r1`, 4j `462-a-finger-to-his-lips-r1`.
- Small faults in pictures already in the film (no scene rebuilds): 194 cream sketchbook, 177 suppressed burst without flash,
  207 handset up at the ear, 354 Mrs. Sakai's gaze past Jack to the altar photo.
- Director's review of all parked takes before any install; then upscale + `install-film-picture.mjs`, depth remakes (374,
  73-09, 512, 460), and the story.json/lamp-glow wiring from the 25-October handoff.

## Sixth batch, 25 October (night): first three unchosen retakes, director-voted

Made as two-option votes; rejected options were discarded by the vote tool and are not on disk. All three saved files
verified landscape 16:9.

| File | Item | Vote / flags |
|---|---|---|
| `87-he-writes-nothing-r1.jpg` | 2c | Director picked option 2 (2848×1600). Correct room-master layout: Jack side-on at the desk's right end facing left, green lamp at the left end, rotary phone, CRT on the filing cabinet, railway through rainy blinds, blood in his knuckles. **Flags: the notebook on the kraft envelope is dark green — same cream-sketchbook issue noted for 194; and the pen tip nearly touches the paper where the brief has it held still above, not writing.** |
| `460-parked-crooked-r1.jpg` | 4d | Director picked option 1 (1376×768). Both characters restored: Jack in the back doorway in his long coat, back three-quarters, head shaking; Mrs. Noda on the step offering the cigarette pack; muddy yard, farm-track gate, old pickup parked crooked under the pole lamp in rain. Clean. (Maintainer: move its quote to "She offers the pack anyway.") |
| `175-the-curtain-gap-r1.jpg` | 4e | Director picked option 1 (1672×941). Curtain edge and fingertips in the foreground, four black saloons in an arc facing the inn with headlights glaring, rain only inside the beams, eight masked men stepping out and splitting up, nothing beyond but darkness and the highway. Clean. |

### Still queued

- 4g `178-staff-side-r1` and 4j `462-a-finger-to-his-lips-r1` (the last two unchosen retakes).
- The four small in-film faults: 194 cream sketchbook (the same green-book issue appears in the new 87), 177 suppressed
  burst, 207 handset height, 354 gaze.
- Review, upscale, install, depth remakes and wiring as above.
- At install: upscale the sub-1920 pictures (Topaz, as the morning batch had), then `tools/install-film-picture.mjs`; the
  story.json/`studio-edits.json` wiring in the 25-October handoff still applies (94-01 new step, 141 moved onto "Ishida gets
  in. The door closes.", 368 quote trimmed, lamp glows re-placed for 139/140).
- §5 (5a–5u) and the unchosen 2c/4d/4e/4g/4j retakes remain unmade; 161's extra leg, 303's office and 519's bun among them.
- Depth remakes (374, 73-09, 512, 460, and 354/364 if their new takes change again) still wait on the final pictures.

## Tinted-window car retakes, director-voted (25 October 2026)

The director requested retakes with voting, tinted car windows, and consistent characters. Three distinct shots were
made with two-option votes; originals were not overwritten. These are review takes, **not installed in the film**.
Generator was asked for its largest landscape 16:9 output; files are preserved as delivered, without resizing.

| File | Vote | Continuity instructions / references |
|---|---|---|
| `137-he-knows-this-car-r4.jpg` | Option 2 | Edit of 137-r3, with Ishida's body and face sheets attached. Dark smoked glazing hides occupants; all doors shut; no raincoat. |
| `138-the-door-opens-r3.jpg` | Option 1 | Uses the selected 137-r4 plus Ishida's body and face sheets. Same setup and opaque tint; only far-side pavement light changes, visible doors stay shut. |
| `139-only-tea-r4.jpg` | Option 2 | Selected 137-r4 for car/look plus Ishida body/face and Kurose sheet. Close doorway crop excludes hinge/door panel; near seat empty, Kurose far rear-left; tinted background glazing. |

Remaining work: review full-resolution outputs for geometry/identity, continue the other requested retakes and car
continuity shots (140, 94-01, interiors and 142 as needed). Film installation, dimension checks/upscaling, story wiring
and any depth rebuilds remain pending. No application code or live-film assets were changed in this batch.

## Next three tinted-window continuity shots (25 October 2026)

Director requested storage only: no overwrite, deletion or installation. Saved original generator outputs at new paths:

| File | Vote | References / intended continuity |
|---|---|---|
| `140-where-are-we-going-r5.jpg` | Option 2 | Selected 137-r4 plus Ishida body/face sheets; outside looking up at station, opaque tinted glazing. |
| `94-01-the-clean-hand-r4.jpg` | Option 1 | Selected 139-r4, Kurose sheet, model-hand/watch reference; near seat empty, tea offered across it, black leather watch strap. |
| `141-he-drinks-r2.jpg` | Option 2 | Ishida body/face, Kurose sheet, selected 139-r4 cabin, watch reference; inside looking back, Ishida screen-left, Kurose screen-right, dark tinted windows. |

All prompts requested largest available landscape output. No resizing or film installation performed.
The vote tool returned selected files only; its documented “Unselected files” folder was not found under /home/user,
so unselected candidates could not be copied into the repository. Do not describe them as preserved locally.
Full-resolution quality/dimension checks and remaining retakes are pending.

## Later inn shots, director-voted (25 October 2026)

Storage only; new filenames, no overwrite, deletion, resizing or film installation. All three votes selected option 2.

| File | Brief | References / requested correction |
|---|---|---|
| `177-behind-the-counter-r2.jpg` | 4f follow-up | Existing 177-r1, lobby 176, masked-man and Mr Noda sheets. Suppressed upward burst without muzzle flash, same desk and character continuity. |
| `178-staff-side-r1.jpg` | 4g | Lobby 176, selected 177-r2, masked-man sheet. Souvenir case shattering, masked gunman advancing toward stairs, Noda hidden, CRT baseball. |
| `462-a-finger-to-his-lips-r1.jpg` | 4j | Original 462 and Jack face/body sheets. Natural vertical shushing finger, intact vending machine before later gunfire. |

Largest available landscape resolution requested; delivered files retained unchanged. Detailed visual/dimension review
remains pending. Vote tool returned selected files only, not local paths for rejected alternatives.

### 462: looser original-shot reference

`462-a-finger-to-his-lips-r3.jpg`: director selected option 1. Original s45/462 supplied only as loose framing/location/
atmosphere reference, plus Jack face/body sheets. New prompt allowed stance, head angle and framing changes and requested
fresh hand/wrist/arm anatomy rather than preserving the faulty original gesture. Stored as delivered under a new filename;
no overwrite, deletion, resizing or installation. Previous sheets-only r2 vote selected neither option and saved no file.

**Director review of 462-r3:** still has two right hands. This take is faulty, retained for review/history only,
not approved for installation. Director requested merging the stored assets as-is without further generation.

## Ten more retakes, queued (25 October 2026)

The director asked for ten further takes of the pictures already made — the ones whose last take still carried a fault.
**Nothing was generated and nothing was overwritten or deleted:** every filename below is the first free `rN` for its shot,
and no existing picture in this folder was touched. The brief for all ten, with prompts, pinned references and per-shot
checks, is `docs/retakes-2026-10-25-ten-more.md` (machine-readable: `docs/retakes-2026-10-25-ten-more.json`).

| File to make | Fixes the fault left in | Base |
|---|---|---|
| `194-he-holds-it-without-drinking-r2.jpg` | 194-r1's dark green sketchbook (cream elsewhere) | 194-r1 |
| `87-he-writes-nothing-r2.jpg` | 87-r1's green notebook, and the pen touching the paper | 87-r1 |
| `462-a-finger-to-his-lips-r4.jpg` | 462-r3's two right hands | the in-film `s45/462`, **not** r3 |
| `207-the-pink-payphone-r2.jpg` | 207-r1's handset held low at the mouth | 207-r1 |
| `538-the-receipts-in-his-hand-r3.jpg` | 538-r2's lost close-up on the receipts | 538-r2 |
| `384-the-room-too-big-r2.jpg` | 384-r1's period-wrong smartphone on the table | 384-r1 |
| `285-the-inside-pocket-r2.jpg` | 285-r1's hand up at the lapel | the in-film `s22/285` |
| `289-for-making-me-r2.jpg` | 289-r1's notes reading as US dollars | 289-r1 |
| `445-exactly-where-it-was-r2.jpg` | 445-r1's "1:07" added to the drawing | 445-r1 |
| `354-the-altar-photograph-r2.jpg` | 354-r1's gaze on Jack instead of the photograph | 354-r1 |

Character consistency comes from the right base: nine of the ten are *keep this picture exactly, change only…* edits of
the take they follow, with the actor sheets attached behind it. 462 is the exception — its r3 take is the one with the two
hands, so editing it would inherit them; that entry starts from the in-film frame instead.

To run one: edit mode (not text-to-image), base first, then the sheets, at the generator's largest landscape size; save
under the filename above; keep the delivered size. The pictures are **not** installed in the film and still need the
Topaz upscale pass where they come out under 1920 wide, then `tools/install-film-picture.mjs`.

## Ten follow-up retakes made (25 October 2026)

Generated the ten queued edits from `docs/retakes-2026-10-25-ten-more.md`. Each edit used its specified existing frame
as the first image reference, followed by the listed character/continuity references. **Storage only:** all originals and
prior takes are untouched; nothing was deleted, installed into the film, or merged to `main`.

| Stored file | Check / review note |
|---|---|
| `194-he-holds-it-without-drinking-r2.jpg` (1376×768) | Cream sketchbook; desk, lamp, cups and Jack's side-on pose retained. |
| `87-he-writes-nothing-r2.jpg` (1376×768) | Cream book. The pen/page gap is not especially clear; see `87-he-writes-nothing-r2--alt1.jpg` (1376×768), where the blank page and lifted pen are clearer. |
| `462-a-finger-to-his-lips-r4.jpg` (1376×768) | Hush gesture rebuilt with one hand visible at the lips. The vending machine still appears marked/damaged; see `462-a-finger-to-his-lips-r4--alt1.jpg` (1376×768), a tighter crop with the damaged panel out of view. |
| `207-the-pink-payphone-r2.jpg` (1376×768) | One pink handset at Jack's ear; Noda and the desk remain in frame. |
| `538-the-receipts-in-his-hand-r3.jpg` (1376×768) | Close-up restored, with the fan of receipts fully in frame and handset at ear. |
| `384-the-room-too-big-r2.jpg` (880×1196) | Kept as delivered, although it came out portrait. The landscape `384-the-room-too-big-r2--alt1.jpg` (1376×768) removes the smartphone and retains Vera, the two cups and the apartment. Prefer the alt for review. |
| `285-the-inside-pocket-r2.jpg` (1376×768) | Jack's hand is flat on the counter and away from his lapel. The generated framing shifts more than the prompt intended; compare with the scene's in-film counter position before use. |
| `289-for-making-me-r2.jpg` (1376×768) | Two folded notes; they read more like Japanese notes than US dollars, with no clear lettering. |
| `445-exactly-where-it-was-r2.jpg` (1376×768) | `1:07` removed from the drawing; the `EXCUSE ME` caption remains. |
| `354-the-altar-photograph-r2.jpg` (1376×768) | Jack and Mrs. Sakai both present. Eye-line is still subtle; `354-the-altar-photograph-r2--alt1.jpg` (1376×768) turns her gaze/head farther toward the altar portrait. |

Four additional alternatives are retained under the `--alt1` names above; none replaces its corresponding primary take.
All files are unchanged at their generated dimensions (the 1376×768 frames are below the film's 1920-pixel house width).
No upscaling, resizing, or installation was done. These are review candidates, not approved film assets.

### Item 6 / 384: vote follow-up

Ran a two-option image vote using the landscape 384-r1 base, the room reference and Vera's face sheet. The director selected
**option 2**, saved without overwriting any prior take as `384-the-room-too-big-r2--alt2.jpg` (1376×768). It keeps Vera and
the two cups, removes the smartphone, and replaces it with an open notebook. Review/storage only; no resize or film install.
The rejected option is available in the vote UI's **Unselected files** area; it was not exposed as a local file under this
repository, so it has not been copied into the retake folder.

## Six additional retakes, two-option votes (25 October 2026)

The director requested six **distinct shots**, each made with a two-option vote. Selected options are saved as new files below;
all existing takes remain untouched. Four other vote rounds (137, 138, 140 and 213) received no selection and produced no
saved takes, so they were skipped rather than installed or substituted. Selected alternatives are review-only: nothing was
installed in the film, resized, or merged to `main`.

| Shot / selected file | Vote | Continuity check / review note |
|---|---:|---|
| 139 `139-only-tea-r5.jpg` (1376×768) | Option 1 | Kurose in far-side rear seat, near seat empty, rear door open. **Check orientation:** the car nose appears screen-left, while the brief specifies screen-right for this camera. |
| 94-01 `94-01-the-clean-hand-r5.jpg` (2848×1600) | Option 1 | Kurose seated across the empty near seat, offering the tea; face kept in shadow. |
| 368 `368-the-door-closes-r2.jpg` (2048×1152) | Option 2 | Ishida screen-left with cup; Kurose screen-right, watch visible. |
| 469 `469-what-they-are-told-r2.jpg` (1344×768) | Option 1 | Harada has no glasses on her face. **Check:** glasses in her hand are not clearly visible, and framing remains wide. |
| 141 `141-he-drinks-r3.jpg` (1536×1024) | Option 1 | Interior positions and tea handoff preserved; watch strap and split lip requested. Delivered at native 3:2, not resized. |
| 285 `285-the-inside-pocket-r3.jpg` (2784×1504) | Option 2 | Jack at the counter's right end, hand flat on counter and away from lapel; Vera remains soft at the edge. |

The vote tool saves rejected alternatives in its **Unselected files** area; those files were not exposed under this repository
for copying. The six selected files above are present locally and were not altered after selection.

## Three further retakes before review (25 October 2026)

Three more requested images are stored as new files; no existing take was replaced. The two-option rounds for 87 and 354
had no selection, so those were saved as single corrective edits after review feedback. The 462 vote selected option 1.

| File | Vote / note |
|---|---|
| `87-he-writes-nothing-r3.jpg` | Single corrective edit after both vote options were rejected. Jack's base face was preserved with his actor sheets attached; cream notebook and a visible pen/page gap requested. |
| `354-the-altar-photograph-r2-jackfix.jpg` | Single corrective edit after the director noted Jack did not look like himself. Started from the existing frame and attached Jack's face/body sheets to reinforce his established identity. Review his likeness and Mrs. Sakai's eye-line before any future film use. |
| `462-a-finger-to-his-lips-r5.jpg` | Option 1 selected. Jack's face references retained; close crop keeps the vending machine out of frame, with one hush hand visible. |

These are stored for review only. No picture was installed into the film, and no application code or story wiring changed.

## Second check by the film's maintainer, 25 October (night), and a picker

The director: "done some they need a review", then "maybe a picker?".
- **What was checked:** every take added since the first check (82 pictures for 42 shots). Each was compared with the picture
  in the film, the shots either side of it and the screenplay line it plays on.
- **The picker:** https://claude.ai/artifact/FXTrEWv6UARyPtwun3xQLp ("25 October Retakes"). For each shot it shows the film's
  picture, the shots either side, every take with a note and the recommended take marked. The director's picks save in the
  page's `picks` store, one document per shot: `choice` is a take id (`r2`, `r2--alt2`…), `film` (keep the film's) or `redo`,
  plus a `note`. Read it with `ArtifactData` `list` on collection `picks`.
- **Nothing is installed until the director has picked.**
- **Left off the picker:** the five `--alt1-edit` takes the director rejected, 384-r2 (portrait) and 462-r3 (two right hands).

**Corrections to flags earlier in this file:**
- **The voted 139-r4 and 139-r5 show the car the wrong way round.**
  - Seen from the road (137, 138, 140) the car's front points left, so seen from the pavement it must point right.
  - 139-r2 and r3 point right.
  - r1 (mine), r4 and r5 point left, so the car would seem to turn round between cuts.
  - For 94-01: r5 is right (front to the right, the door hung from its front edge, Kurose's face in shadow); r2, r3 and r4
    point left; r1 points right but lights his face.
- **87's green notebook is right.** The book on the envelope is Daniel Voss's notebook, which is green in 86 and 90. Cream is
  the colour of Mara's sketchbook (194, 271). So the director's 87-r1 is the take to use; the cream r2, r2--alt1 and r3 came
  from a wrong flag. In all of them the notebook lies on the envelope, though 86 has just put it inside.
- **445's "1:07" belongs.** The drawing has it in 369, the shot just before. r1 keeps it; r2 took it off.
- **384's phone is not an anachronism.** The film's phones are mobiles (499: "The screen: ISHIDA"), and Vera holds hers in 36,
  the next shot. The director voted r2--alt2 (a notebook instead); r1 keeps the phone.
- **70-r2's corded bar phone contradicts 499**, where the call comes on her mobile. r1 keeps the mobile, but she is still seated.

**Other findings:**
- **204-r2:** Jack is fixed (in profile, facing her), but she no longer pours.
- **538-r3:** the coin tray is empty a shot before the coins run out (376). r2 keeps the coins.
- **354:** the r2 takes are near copies of the picture in the film, Jack's face included. Keeping the film's saves redoing its
  depth layers.
- **142:** the film's picture keeps the scene 1 street (barber's pole, vending machine) that its line points back to ("exactly
  like the car in the first scene of the film"). r1 and r2 are another alley.
- **462:** r5 is the clean hush. r1 has sparks at the vending machine before any gunfire, and r4 its bullet holes.
- **Interior pairs:** 141-r2 or r3 go with 368-r2; 141-r1 goes with 368-r1.

**Recommended take per shot** (marked on the picker; the director decides):

| Shots | Recommended |
|---|---|
| m1, 419, 246, 349, 445, 374, 460, 175, 178, 469, 232, 70, 73-09, 87, 88, 106, 512, 519, 303, 161, montage53-05b (new) | r1 |
| 271, 194, 289, 204, 207, 538, 177, 231, 139, 368 | r2 |
| 285, 213, 138, 141 | r3 |
| 137 | r4 |
| 462, 140, 94-01 (new) | r5 |
| 384 | r2--alt2 (the director's vote) |
| 354, 142 | keep the film's picture |

**When the picks are in:**
- **Upscale** every pick under 1920 wide with Topaz (most are 1376×768), with the settings in
  `docs/film-picture-upscales-2026-10-25.json`.
- **Install** with `tools/install-film-picture.mjs`, which also crops 138-r3 (1408×736) and 141-r2/r3 (3:2) to 16:9.
- **Remake depth** for 374, 73-09, 512 and 460, and any other pick whose film picture carries layers.
- **Wire the car sequence** as `docs/handoff-2026-10-25.md` says: 94-01 is a new step, 141 moves, 368's quote is trimmed, and
  139/140's lamp glows are re-placed.
- **montage53-05b** is a new picture: add it after `montage53/05.jpg` in the `nw_m53` montage in `src/film/studio-edits.json`.

## The director's picks, installed, 25 October (night)

The director picked all 42 shots on the picker ("done selecting") and said to leave upscaling for now.
- **Installed (33):** m1, 384-r1, 419, 246, 271-r2, 194-r2, 285-r2, 349, 445-r1, 289-r2, 204-r2, 207-r2, 538-r2, 460, 177-r2,
  178, 462-r5, 469-r1, 231-r2, 232, 70-r1, 73-09, 88, 106, 512, 519, 137-r4, 138-r3, 139-r2, 368-r1--alt1, 303 and 161, plus
  `montage53/05b.jpg`, the new light-off picture, after 05 in montage 53.
  - Each went in with `tools/install-film-picture.mjs`, which archived the old picture first.
  - No Topaz: the 27 under 1920 wide were only enlarged to 1920×1080 by the install tool. A Topaz pass can replace them later.
- **Kept as they are (5):** 354, 140, 141 and 142. 94-01 is not added, so 141 still plays on "From inside the car, a man's clean
  hand…".
- **Redo (4), with the director's notes:**
  - 374 "she has no coat on";
  - 175 "too many bad guys";
  - 213 "ignore the torch it keeps floating mid air";
  - 87 "lamp to left of him phone to right".
- **Depth, made again the same night** from the new pictures (Depth Anything V2 Small, BiRefNet or U2-Net cut-outs, LaMa
  plates), each checked with `tools/review-depth-maps.py` and its move recorded with `tools/depth-frames.mjs`:
  - **460:** now has people, so it has a cut-out each for Jack (0.514) and Mrs. Noda (0.594).
  - **73-09:** Vera at 0.825 (`"cutoutDepth": "matte"`, her feet out of shot).
  - **512:** Harada and Vera (0.364), the two men at desks (0.714, 0.549), and Jack in the glass office (0.102, his box drawn by
    hand).
- **Lamp glows:** 246's two still sit on its street lamp and vending machine, so they are back as they were. 139 has one new
  glow on the car's courtesy light.
- **The four redos** are briefed as section 7 of `docs/image-brief-2026-10-25.md`, with the faults left in the picks.

## The four redos (§7), made by 2-option vote

Each made with the image-vote option; the director selected one of two. Review-only — nothing installed
in the film, resized or upscaled. Rejected vote options live in the vote UI's Unselected files.

- `374-the-dead-television-r2.jpg` (7a, 1672×941, option 1) — Vera now wears her long dark charcoal
  coat open over the cream knit; TV high at the far end stays dark with no face in it. Clean.
- `175-the-curtain-gap-r2.jpg` (7b, 1360×768, option 2 of the first vote) — still 8 men (two per car),
  so the director asked for 5 instead; superseded by r3.
- `175-the-curtain-gap-r3.jpg` (7b again, 2729×1536, option 2) — curtain pull restored: lace curtain
  and a hand pulling it aside fill the left foreground, outside composed fresh (four cars, headlights
  in rain). **Flag: on a count only 4 walking men are visible, not the 5 asked for** — the leftmost car
  is half-hidden behind the curtain. Director to say whether to run it again for five.
- `213-clutch-each-other-r4.jpg` (7c, 1536×1024, option 2) — no torch and no beam; only the bare
  kitchen bulb, pantry black behind the couple. **Flag: 3:2, needs the install tool's 16:9 crop; a
  small dark object still sits just behind Jack's head.**
- `87-he-writes-nothing-r4.jpg` (7d, 1376×768, option 1) — built from the earlier desk pictures
  (87-r1 + room master 164 for orientation, 86 overhead for the props). Desk orientation kept as the
  master: long side to camera, Jack at the right end in profile facing left, sofa behind him. Green
  lamp at the left end, black rotary phone at the right end in the foreground, envelope bare with no
  book on top, pen held off the paper. Clean.
- Depth for 374 must be re-made if r2 is installed; 374-r2 and 87-r4 are under 1920 wide.

## Inn raid inserts (scenes 39–49), stored for review — NOT installed

Director, later on 25 October: "leave it — don't install just log them and save the images — don't
replace or delete anything. just store images for review." So: **review-only. Nothing has been
installed, wired, resized, upscaled, replaced or deleted; no `src/` or story file was touched.**
Intended slots (if the director later says install) and intended plays-on lines are noted for reference
only. Each was made with the 2-option image vote, edited from a neighbouring frame at the director's
request so rooms, light and Jack do not drift. Rejected options (fresh first attempts for all three
first beats; `raid-43-gutter` and `raid-44-corridor-low` in the second batch) were selected by neither
side and were not saved.

- `raid-39-they-split-r1.jpg` (2848×1600, option 1; edited from `175-the-curtain-gap-r3.jpg`) —
  intended for scene 39 on "They don't rush. They split without speaking." Curtain pull kept in the
  left foreground, four cars in headlights. Men are dispersed, no longer a line: 4 visible, one at the
  far right walking away round a car. Clean as a review still.
- `raid-41-corridor-r1.jpg` (1365×768, option 2; edited from `s41/177-boots-below.jpg`) — intended
  for scene 41 on "Jack at the top of the stairs. He hears boots below. He goes the other way, toward
  the bath." Same stairwell shot with the foreground gunman removed: empty stairs, Jack alone at the
  top landing turning away. Clean; under 1920 wide.
- `raid-42-first-hit-r1.jpg` (1344×768, option 1; edited from `s42/210-the-third-time.jpg`) —
  intended for scene 42 on "Once. Twice. It won't move.", before 210's third hit. Same bathroom/tub,
  window whole, corridor empty. **Flags: Jack strikes with an open hand flat on the glass rather than
  the heel of his hand on the frame, and faint crack lines are already in the glass; under 1920 wide.**
- `raid-47-behind-truck-r1.jpg` (2752×1536, option 2; edited from `s47/222-mud-and-impacts.jpg`) —
  intended for scene 47 on "Jack runs. Gunfire kicks up mud behind him. He dives behind the truck."
  Jack mid-dive for the pickup, mud impacts behind him, one gunman small at the building behind.
  **Flag: the distant gunman fires with a visible muzzle flash, reading unsuppressed.**

Not made / not saved: `raid-43-gutter` (roof slide, scene 43) and `raid-44-corridor-low` (Jack low
along the corridor, scene 44→45) — both vote pairs were passed on, so no file exists for either.

## 175-r3 in the film, 26 October 2026

The director asked for `175-the-curtain-gap-r3.jpg` (the lace curtain pulled aside, four cars, four men walking in; the redo
for "too many bad guys"). It is installed as `s39/175-the-curtain-gap.jpg`, the old picture archived as
`archive/s39/175-the-curtain-gap--v2.jpg`. Its headlight glows and lens flare were moved onto the new picture's headlights.
The other three §7 redos (374-r2, 213-r4, 87-r4) and the raid inserts are still not installed.

## 374-r2 and 213-r4 in the film; 87 is montage18-01-r1 (26 October 2026)

As the director asked: 374-r2 (with its depth move taken off) and 213-r4 are installed, and `montage18-01-r1.jpg` is now
`s77/87-he-writes-nothing.jpg` in place of 87-r4, which is not used. The raid inserts are still not installed.

## The raid inserts in the film (26 October 2026)

The director: "ok add them". raid-39, raid-41, raid-42 and raid-47 are installed as `s39/raid-39-they-split.jpg`,
`s41/raid-41-corridor.jpg`, `s42/raid-42-first-hit.jpg` and `s47/raid-47-behind-truck.jpg`, and play in the raid cutscene
(FILM.md, "The four inn-raid inserts").
