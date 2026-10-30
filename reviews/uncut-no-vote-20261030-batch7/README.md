# Original Uncut: six-shot directory batch 7 (`2026-10-30`)

Six additional distinct-scene Original Uncut hold targets chosen at random (seed `20261101`), each voted between two candidates. **Five are saved** here and one (`nw_b363`) was skipped twice, so nothing was saved for it. No original file was altered: the source pictures in `public/film/img/` are only read as references, and each selected JPEG is stored exactly as the provider produced it (no crop, resize or re-encode). `cutModified: false` — nothing is installed into any cut.

[Open the numbered image review gallery](index.html) · [Machine-readable manifest](manifest.json)

| # | Scene | Target beat | Shot | Vote result |
|---:|---|---|---|---|
| 1 | `nw_s25a` | `nw_b634` | The day has started without her | Option 2 of 2 selected · [image](images/01-nw-b634-the-day-has-started.jpg) (`2848x1600`) |
| 2 | `nw_s14` | `nw_b363` | He takes both | **Skipped** — both pairs rejected, retry with a new angle |
| 3 | `nw_s27a` | `nw_b703` | Through the counter flap | Option 1 of 2 selected · [image](images/03-nw-b703-through-the-flap.jpg) (`1672x941`) |
| 4 | `nw_s69` | `nw_b1123` | They walk on | Option 1 of 2 selected · [image](images/04-nw-b1123-they-walk-on.jpg) (`2730x1536`) |
| 5 | `nw_s84` | `nw_b1452` | The frayed strap | Option 2 of 2 selected · [image](images/05-nw-b1452-the-frayed-strap.jpg) (`1344x768`) |
| 6 | `nw_s98` | `nw_b1639` | She understands | Option 2 of 2 selected · [image](images/06-nw-b1639-she-understands.jpg) (`1344x768`) |

## Exact prompts and ordered reference frames

Each target uses the immediately preceding shared still and the following still as references, in that order. Hold splits show what the frame would cover if it is installed later at its beat boundary.

### 1. The day has started without her — `nw_b634` (`nw_s25a`, 25 — Breakfast)

Target text: “Vera sits with her coat still on and her phone face up beside her, already looking at the door as though the day has started without her.”

Hold split if installed later: `20.42s -> 10.42s + 10.00s`

Result: **option 2 of 2 selected**; saved to `reviews/uncut-no-vote-20261030-batch7/images/01-nw-b634-the-day-has-started.jpg` (`2848x1600`, uninstalled, unmodified).

Reference order:
1. Preceding shared still: `/film/img/s25a/287-breakfast.jpg`
2. Following still: `/film/img/s25a/448-breakfast-nobody-asked-for.jpg`

Prompt:

> Create ONE horizontal widescreen 16:9 photorealistic cinematic film still for the Tokyo noir drama Nobody's Witness, bridging the two supplied adjacent reference frames inside a narrow Tokyo coffee counter at breakfast. Keep the same place and people: pale wooden counter, six stools, glass siphon coffee brewer bubbling over a flame, CRT on the shelf showing a morning cooking show, windows fogged from inside, blonde Vera in her dark overcoat over a cream turtleneck, and the middle-aged cook in apron behind the pass. Compose a medium shot along the counter: Vera sits with her coat still buttoned, her phone face up on the wood beside a paper cup, her head already turned toward the fogged door as though the day has started without her; the thickening steam of the siphon and a cutting board of thick toast anchor the counter in front of her. Soft grey morning light through fogged glass, warm interior tungsten, restrained realistic noir cinematography, natural hands and proportions, full 16:9 landscape frame with headroom. No other customers, no captions, subtitles, readable invented text or watermarks.

### 2. He takes both — `nw_b363` (`nw_s14`, 14 — Someone who meant to come back)

Target text: “He takes both.”

Hold split if installed later: `14.04s -> 7.71s + 6.33s`

Result: **skipped twice — both pairs rejected, left unsaved**; no file saved.

Reference order:
1. Preceding shared still: `/film/img/s14/363-the-clip-on-the-sketchbook.jpg`
2. Following still: `/film/img/s14a/334-the-mirror.jpg`

Prompt:

> Create ONE horizontal widescreen 16:9 photorealistic cinematic film still for the Tokyo noir drama Nobody's Witness, bridging the two supplied adjacent reference frames at a low table in a cramped tatami apartment. Keep the same room and props: charcoal-and-watercolour train sketches taped to the pale wall, two cups, pencils, the open soft-covered sketchbook and the small red bird hair clip. Compose a natural medium close two-shot: dark-haired greying Jack in his dark coat has picked up the red bird clip in one hand and is closing the sketchbook with the other, taking both as she offered them; blonde Vera in her cream turtleneck and charcoal coat watches him do it, her nod still forming, her hands loose on the table. Soft overcast window light, muted green-grey palette, restrained quiet noir cinematography, natural hands and realistic anatomy, full 16:9 landscape frame with headroom. No other people, no captions, subtitles, readable invented text or watermarks.

Improved retry prompt (also rejected, unsaved):

> Create ONE horizontal widescreen 16:9 photorealistic cinematic film still for the Tokyo noir drama Nobody's Witness, bridging the two supplied adjacent reference frames. Use the first image for the room, table, sketchbook and red hair clip; use the second only to match the same man's identity and the red bird clip's shape and colour. In the cramped tatami apartment, compose a clean two-shot over Vera's shoulder from her side of the low table: dark-haired greying Jack, seated opposite in his dark coat, has just closed the thick soft-covered sketchbook and now holds it closed against his chest under one arm, while the small red bird hair clip rests in the open palm of his other hand, which he is looking down at. Blonde Vera in her cream turtleneck and charcoal coat sits in the near foreground, softly out of focus, turned toward him with her nod just finished. Only two people, two natural hands each, no extra limbs. Soft overcast window light, muted green-grey palette, restrained quiet noir cinematography, full 16:9 landscape frame with headroom. No captions, subtitles, readable invented text or watermarks.

### 3. Through the counter flap — `nw_b703` (`nw_s27a`, 27 — She was here)

Target text: “She goes through. Crouches behind the far end, between the crates and the shelves, exactly where Mara hid.”

Hold split if installed later: `16.79s -> 3.96s + 12.83s`

Result: **option 1 of 2 selected**; saved to `reviews/uncut-no-vote-20261030-batch7/images/03-nw-b703-through-the-flap.jpg` (`1672x941`, uninstalled, unmodified).

Reference order:
1. Preceding shared still: `/film/img/s27a/456-the-counter-flap.jpg`
2. Following still: `/film/img/s27a/292-she-was-here.jpg`

Prompt:

> Create ONE horizontal widescreen 16:9 photorealistic cinematic film still for the Tokyo noir drama Nobody's Witness, bridging the two supplied adjacent reference frames inside a dim old Tokyo bar in daylight. Keep the same bar and people: worn dark wooden counter, shelves of bottles, stacked red plastic crates of empty beer bottles, ice bin, dark floorboards, grey light from the street door, elderly Okada in his apron behind the counter and blonde Vera in her charcoal overcoat and cream turtleneck. Compose a low medium shot from the customer side of the counter: Vera has just slipped through the lifted counter flap and is crouching down behind the far end between the bottle crates and the shelving, one hand on the counter leg for balance, looking along the floor into the gap where someone hid; Okada's hands and apron are visible over the counter above her. Day-lit gloom, dust in the air, restrained realistic noir cinematography, natural hands and proportions, full 16:9 landscape frame with headroom. No other people, no captions, subtitles, overlaid text or watermarks.

### 4. They walk on — `nw_b1123` (`nw_s69`, 69 — Vera would love this)

Target text: “It is. It's fine. It's good. She deserves someone who looks for things.”

Hold split if installed later: `21.75s -> 10.88s + 10.88s`

Result: **option 1 of 2 selected**; saved to `reviews/uncut-no-vote-20261030-batch7/images/04-nw-b1123-they-walk-on.jpg` (`2730x1536`, uninstalled, unmodified).

Reference order:
1. Preceding shared still: `/film/img/s69/279-her-sisters-smile.jpg`
2. Following still: `/film/img/s70/389-out-of-the-back-door.jpg`

Prompt:

> Create ONE horizontal widescreen 16:9 photorealistic cinematic film still for the Tokyo noir drama Nobody's Witness, bridging the two supplied adjacent reference frames in a narrow rain-wet Tokyo back alley at night. Keep the same alley and people: dark wooden shopfronts, warm paper lanterns and vending-machine glow, wet flagstones reflecting light, young blonde Mara in her long dark coat and dark-haired greying Jack in his dark overcoat. Compose a medium tracking shot from slightly ahead: the two of them walk on side by side away from the noodle-shop doorway, Mara still smiling her sister's real smile as she talks, one hand around the strap of her cloth bag; Jack walks beside her with his head lowered, listening, not quite able to answer. Steam and drizzle in the lamplight, restrained realistic noir cinematography, natural hands and proportions, full 16:9 landscape frame with headroom. No other people, no captions, subtitles, overlaid text or watermarks.

### 5. The frayed strap — `nw_b1452` (`nw_s84`, 84 — Three feet away)

Target text: “In her hands, a small cloth bag with one strap frayed. Kaneko put it there at the door.”

Hold split if installed later: `13.50s -> 8.83s + 4.67s`

Result: **option 2 of 2 selected**; saved to `reviews/uncut-no-vote-20261030-batch7/images/05-nw-b1452-the-frayed-strap.jpg` (`1344x768`, uninstalled, unmodified).

Reference order:
1. Preceding shared still: `/film/img/s84/517-neither-moves.jpg`
2. Following still: `/film/img/s84/115-the-storeroom.jpg`

Prompt:

> Create ONE horizontal widescreen 16:9 photorealistic cinematic film still for the Tokyo noir drama Nobody's Witness, bridging the two supplied adjacent reference frames in the storeroom behind a noodle shop. Keep the same room and people: bare hanging bulb, pale plaster walls with a few taped pencil drawings, stacked flour sacks and bedding, crates and shelving, blonde Vera in her charcoal overcoat, and dark-haired greying Jack standing a few feet away in his dark coat. Compose a closer medium shot on Vera: she has stopped a few steps inside and is looking down at a small cloth bag held in both hands, its thin strap frayed and coming apart, the way Kaneko pressed it into her hands at the door. Jack stays soft and out of focus at the right edge. Single warm bulb against cold shadow, restrained realistic noir cinematography, natural hands and realistic anatomy, full 16:9 landscape frame with headroom. No other people, no captions, subtitles, readable invented text or watermarks.

### 6. She understands — `nw_b1639` (`nw_s98`, 98 — The rain has stopped)

Target text: “Everything Vera has carried since the first scene, Mara was carrying too. They were both sorry, and neither of them said it.”

Hold split if installed later: `11.83s -> 5.33s + 6.50s`

Result: **option 2 of 2 selected**; saved to `reviews/uncut-no-vote-20261030-batch7/images/06-nw-b1639-she-understands.jpg` (`1344x768`, uninstalled, unmodified).

Reference order:
1. Preceding shared still: `/film/img/s98/526-at-the-end.jpg`
2. Following still: `/film/img/s98/155-close-enough.jpg`

Prompt:

> Create ONE horizontal widescreen 16:9 photorealistic cinematic film still for the Tokyo noir drama Nobody's Witness, bridging the two supplied adjacent reference frames on a rooftop balcony above the railway in grey daylight. Keep the same place and people: pale concrete parapet with a metal railing, potted plants, overhead cables and a passing commuter train beyond, overcast white sky, blonde Vera in her pale coat and dark-haired greying Jack in his dark overcoat behind her. Compose a closer medium shot on Vera at the railing: she has stopped speaking as the meaning of it reaches her, her hands still on the cold rail, her face open and unguarded in the flat daylight as she looks out at the tracks; Jack stands slightly behind her shoulder, watching her. The train smears past out of focus behind. Restrained, quiet, realistic film photography, natural hands and proportions, full 16:9 landscape frame with headroom. No other people, no captions, subtitles, overlaid text or watermarks.

## Continuation

`nw_b363` needs a different angle before another vote: the two rejected prompts both asked for the clip and the sketchbook in one frame at the small table, which invited duplicated hands. Try instead a single on Jack turning the clip in his fingers, or a close insert of the closed sketchbook with the clip on top. Batches 1-7 remain a review backlog; install only what is wanted by copying the chosen JPEG into `src/assets/recreated-uncut/` and registering it in `src/core/recreatedUncut.ts` as the earlier plates do.
