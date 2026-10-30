# Original Uncut: ten-shot directory batch 2 (`2026-10-30`)

Single-model no-vote generation (`offer_options: false` via `google-genai / gemini-3.1-flash-image`) returned **HTTP 403 `PERMISSION_DENIED`** on both reference-guided and text-only checks. At the user’s explicit direction, the prepared 10-shot batch was run via voting and **saved only to this directory** (`cutModified: false`, `src/core/recreatedUncut.ts` untouched): **seven images were selected and saved under `images/`**, and **three shots (`06`, `08`, `09`) were skipped**.

[Open the numbered image review gallery](index.html) · [Machine-readable manifest](manifest.json)

| # | Scene | Target beat | Shot | Vote result |
|---:|---|---|---|---|
| 1 | `nw_s99a` | `nw_b1669` | The small crowd at the barrier | [Option 2 selected](images/01-nw-b1669-small-crowd.jpg) (`2730x1536`) |
| 2 | `nw_s22` | `nw_b561` | The cups tremble | [Option 2 selected](images/02-nw-b561-cups-tremble.jpg) (`1536x1024`) |
| 3 | `nw_s25` | `nw_b606` | Jack looks down at his hands | [Option 2 selected](images/03-nw-b606-jack-looks-at-hands.jpg) (`2848x1600`) |
| 4 | `nw_s29` | `nw_b735` | Jack looks up from receipt 114 | [Option 2 selected](images/04-nw-b735-jack-looks-up.jpg) (`1360x768`) |
| 5 | `nw_s58` | `nw_b965` | Yes. Bring her. | [Option 2 selected](images/05-nw-b965-bring-her.jpg) (`2048x1152`) |
| 6 | `nw_s61` | `nw_b1003` | The widow's file | **Skipped** — no image saved |
| 7 | `nw_s9` | `nw_b212` | Vera stops breathing | [Option 1 selected](images/07-nw-b212-vera-stops-breathing.jpg) (`1672x941`) |
| 8 | `nw_s14a` | `nw_b416` | He walks past the car | **Skipped** — no image saved |
| 9 | `nw_s83` | `nw_b1438` | Vera stops at the scale model | **Skipped** — no image saved |
| 10 | `nw_s62` | `nw_b1026` | Tell you properly | [Option 2 selected](images/10-nw-b1026-tell-you-properly.jpg) (`1536x1024`) |

## Exact prompts and ordered reference frames

### 1. The small crowd at the barrier — `nw_b1669` (`nw_s99a`)

Target text: “At the barrier on the street, a small crowd watches. The radio repairman. The family. The girl with the violin case.”

Hold split if installed later: `10.42s -> 4.33s + 6.08s`

Result: **option 2 selected**; saved to `reviews/uncut-no-vote-20261030-batch2/images/01-nw-b1669-small-crowd.jpg` (`2730x1536`, uninstalled).

Reference order:
1. Preceding shared still: `/film/img/s99a/531-six-old-stools.jpg`
2. Following still: `/film/img/s99/157-the-sign.jpg`

Prompt:

> Create ONE horizontal widescreen 16:9 photorealistic cinematic film still for the Tokyo noir drama Nobody's Witness at beat nw_b1669, bridging the two supplied consecutive demolition-site references. At the wire-mesh street barrier across from the half-demolished Hive apartment block and yellow excavator under overcast winter sky, compose a medium-wide angle from slightly behind and to the side of the small quiet neighbourhood crowd watching the demolition: the older bespectacled radio repairman in his grey work jacket, the young Japanese mother and father holding their small son's hand, and the teenage schoolgirl in her tan duffle coat holding her black violin case at her side, matching their exact faces, coats and positions from the second reference. Focus on the repairman, family and schoolgirl watching the rubble and dust across the fence before the next shot centres on Kaneko holding her wooden shop sign. Muted grey winter daylight, grounded Ozu-inspired 35mm film photography, natural proportions and hands, full 16:9 landscape frame with comfortable headroom. No captions, subtitles, overlaid text or watermarks.

### 2. The cups tremble — `nw_b561` (`nw_s22`)

Target text: “A train. The cups tremble.”

Hold split if installed later: `5.04s -> 3.83s + 1.21s`

Result: **option 2 selected**; saved to `reviews/uncut-no-vote-20261030-batch2/images/02-nw-b561-cups-tremble.jpg` (`1536x1024`, uninstalled).

Reference order:
1. Preceding shared still: `/film/img/s22/285-the-inside-pocket.jpg`
2. Following still: `/film/img/s22/348-easy-to-talk-to.jpg`

Prompt:

> Create ONE horizontal widescreen 16:9 photorealistic cinematic film still for the Tokyo noir drama Nobody's Witness at beat nw_b561, bridging the two supplied consecutive noodle-counter references. Compose an intimate tabletop close-up on the pale Formica counter inside the brick-arched railway diner: the cream ceramic mug, paper cups and white ceramic noodle bowls with wooden chopsticks from the references tremble slightly from an overhead passing train, delicate concentric ripples shimmering across the hot tea surface. Softly blurred green-tiled walls, warm amber wall lights, and the dark coat sleeves of Vera and Jack at the edges anchor the shot without showing faces. Grounded 35mm film photography, true 16:9 landscape framing. No captions, subtitles, added readable text or watermarks.

### 3. Jack looks down at his hands — `nw_b606` (`nw_s25`)

Target text: “Jack looks down at his hands.”

Hold split if installed later: `11.25s -> 9.92s + 1.33s`

Result: **option 2 selected**; saved to `reviews/uncut-no-vote-20261030-batch2/images/03-nw-b606-jack-looks-at-hands.jpg` (`2848x1600`, uninstalled).

Reference order:
1. Preceding shared still: `/film/img/s25/444-he-knew-me.jpg`
2. Following still: `/film/img/s25/369-the-drawing.jpg`
3. Character identity reference: `/film/img/s14a/341-reflex.jpg`

Prompt:

> Create ONE horizontal widescreen 16:9 photorealistic cinematic film still for the Tokyo noir drama Nobody's Witness at beat nw_b606, bridging the first two cramped storeroom references; use the third image only to match Jack's exact face, greying dark hair, light stubble, dark grey overcoat and open-collar cream shirt. Seated quietly near the stacked brown paper flour sacks under the single warm bare overhead bulb in the narrow storeroom, Jack bows his head and looks down at his clasped hands resting on his knees in silent reckoning after hearing Mara's account. Keep Mara out of frame or only a blurred edge of the futon at the side, and do not focus on the pencil drawing yet as the next shot reveals it. Warm dim tungsten shadows, natural hands and anatomy, grounded 35mm film cinematography, full 16:9 landscape frame with headroom. No captions, subtitles, overlaid text or watermarks.

### 4. Jack looks up from receipt 114 — `nw_b735` (`nw_s29`)

Target text: “He looks up. She is watching him with an expression he can't read. Grief, maybe. Or relief.”

Hold split if installed later: `6.67s -> 3.04s + 3.63s`

Result: **option 2 selected**; saved to `reviews/uncut-no-vote-20261030-batch2/images/04-nw-b735-jack-looks-up.jpg` (`1360x768`, uninstalled).

Reference order:
1. Preceding shared still: `/film/img/s29/356-the-stamp-114.jpg`
2. Following still: `/film/img/s29/357-heavier-than-me.jpg`
3. Character identity reference: `/film/img/s14a/341-reflex.jpg`

Prompt:

> Create ONE horizontal widescreen 16:9 photorealistic cinematic film still for the Tokyo noir drama Nobody's Witness at beat nw_b735, bridging the first two tatami-room references; use the third image only to identify Jack's exact face and dark grey coat. Seated at the low wooden kotatsu table with the stack of yellowed receipts, brown clay teapot and teacups from the first reference, Jack lowers the unfolded receipt slightly and looks up across the table toward elderly grey-haired Mrs. Sakai in her dark indigo kimono cardigan from the second reference, who watches him quietly with unreadable grief and relief. Compose a calm Ozu-height medium side two-shot showing both of them across the low table in soft grey window light. Natural hands, restrained 35mm film realism, full 16:9 landscape frame with headroom. No captions, subtitles, invented readable text or watermarks.

### 5. Yes. Bring her. — `nw_b965` (`nw_s58`)

Target text: “Yes. Bring her.”

Hold split if installed later: `6.25s -> 3.50s + 2.75s`

Result: **option 2 selected**; saved to `reviews/uncut-no-vote-20261030-batch2/images/05-nw-b965-bring-her.jpg` (`2048x1152`, uninstalled).

Reference order:
1. Preceding shared still: `/film/img/s58/475-the-chopsticks-stop.jpg`
2. Following still: `/film/img/s58/476-too-much.jpg`

Prompt:

> Create ONE horizontal widescreen 16:9 photorealistic cinematic film still for the Tokyo noir drama Nobody's Witness at beat nw_b965, bridging the two supplied consecutive noodle-shop references. Compose a closer, slightly side-on medium portrait of elderly Japanese shopkeeper Kaneko in her brown knit cardigan and dark indigo apron standing behind the steaming stainless-steel pot against the green corrugated wall. Her long wooden chopsticks remain completely still in the pot, her eyes lowered into the rising steam as she speaks two quiet words of consent without looking up. Keep Vera out of frame or only a soft cream-sweater blur at the far left edge, before the next close-up of money placed on the wooden counter. Warm bare-bulb tungsten light, natural hands, grounded 35mm film photography, full 16:9 landscape framing with headroom. No captions, subtitles, overlaid text or watermarks.

### 6. The widow's file — `nw_b1003` (`nw_s61`)

Target text: “The inn. I heard this morning. Thank God. The widow's file went through the department the day I pulled it. Someone read it. I am looking for him.”

Hold split if installed later: `14.92s -> 4.29s + 10.63s`

Result: **skipped**; no candidate saved.

Reference order:
1. Preceding shared still: `/film/img/jack_ishida_new/61-02-neither-looks.jpg`
2. Following still: `/film/img/s61/481-the-side-of-his-face.jpg`

Prompt:

> Create ONE horizontal widescreen 16:9 photorealistic cinematic film still for the Tokyo noir drama Nobody's Witness at beat nw_b1003, bridging the two supplied rainy-night car references. Inside the same dark sedan driving beneath amber-lit elevated expressway pillars in the rain, compose an angled medium interior two-shot from the passenger dashboard side: older Japanese detective Ishida in his grey suit jacket and pale shirt speaks quietly while keeping both hands on the steering wheel and eyes fixed ahead on the wet road, while Western detective Jack in his dark coat sits beside him beginning to turn his gaze slightly toward Ishida. Match both actors' exact faces, green dashboard instrument glow, rain-beaded glass and warm sodium reflections. Grounded 35mm film cinematography, natural hands, full 16:9 widescreen composition. No captions, subtitles, added text or watermarks.

### 7. Vera stops breathing — `nw_b212` (`nw_s9`)

Target text: “Vera stops breathing.”

Hold split if installed later: `4.79s -> 3.67s + 1.13s`

Result: **option 1 selected**; saved to `reviews/uncut-no-vote-20261030-batch2/images/07-nw-b212-vera-stops-breathing.jpg` (`1672x941`, uninstalled).

Reference order:
1. Preceding shared still: `/film/img/s9/163-behind-the-counter.jpg`
2. Following still: `/film/img/s9/411-it-was-mine.jpg`

Prompt:

> Create ONE horizontal widescreen 16:9 photorealistic cinematic film still for the Tokyo noir drama Nobody's Witness at beat nw_b212, bridging the two supplied rainy daytime Kanda alley references. Compose a medium two-shot in the wet shuttered lane: elderly bar owner Okada on the right in his white shirt and dark apron holds his open wet palm steady with the tiny red enamel bird hair-clip resting on it, while rain-dampened blonde Vera on the left in her charcoal overcoat and cream turtleneck pulls her hand back half an inch and freezes in silent shock staring down at the red bird clip, before the tighter close-up in the second reference. Preserve both exact faces, wet hair, grey rainy daylight, metal shutters and pale blue umbrellas in the background. Natural hands, restrained 35mm film photography, full 16:9 landscape frame with headroom. No captions, subtitles, overlaid text or watermarks.

### 8. He walks past the car — `nw_b416` (`nw_s14a`)

Target text: “He walks past the car (both of them sink an inch in their seats) and into the lane.”

Hold split if installed later: `6.63s -> 3.29s + 3.33s`

Result: **skipped**; no candidate saved.

Reference order:
1. Preceding shared still: `/film/img/s14a/430-a-figure-at-the-road-end.jpg`
2. Following still: `/film/img/s14a/340-the-shuttered-door.jpg`
3. Character identity reference: `/film/img/s14a/341-reflex.jpg`

Prompt:

> Create ONE horizontal widescreen 16:9 photorealistic cinematic film still for the Tokyo noir drama Nobody's Witness at beat nw_b416, bridging the first two stakeout references; use the third image only to match Jack and blonde Vera inside the dark parked car. From the rear seat looking past Jack and Vera as both sink low into their seats in silence, the dark-coated man under a low-tilted black umbrella walks right past the rain-beaded driver-side window and enters the wet shuttered alley ahead, his face completely hidden beneath the umbrella rim. Match the rain-streaked car windows, wet amber-and-teal night reflections, shuttered shopfronts and tense surveillance mood of the references. Grounded 35mm film cinematography, true 16:9 widescreen composition. No captions, subtitles, overlaid text or watermarks.

### 9. Vera stops at the scale model — `nw_b1438` (`nw_s83`)

Target text: “She walks to the door. On her way out, she stops at the model. Where the Hive stood, there's only the white plaza.”

Hold split if installed later: `12.75s -> 6.75s + 6.00s`

Result: **skipped**; no candidate saved.

Reference order:
1. Preceding shared still: `/film/img/retakes_2026_10_20/112-every-page-r1.jpg`
2. Following still: `src/assets/recreated-uncut/1439-plaza-miniatures.jpg`

Prompt:

> Create ONE horizontal widescreen 16:9 photorealistic cinematic film still for the Tokyo noir drama Nobody's Witness at beat nw_b1438, bridging the two supplied high-rise office references. In Kurose's minimalist glass-walled high-rise office overlooking rainy grey Tokyo, blonde Vera in her tied-back hair, navy overcoat and pale shirt holding the manila folder has turned away from Kurose's desk on her way out and stopped beside the glass-cased white architectural scale model on the left, looking quietly down through the glass case at the miniature white plaza and towers. Silver-haired Kurose in his dark suit remains seated calmly at his wooden desk in soft background focus on the right. Cool overcast daylight, grounded 35mm film photography, natural proportions, full 16:9 landscape frame with headroom. No captions, subtitles, readable added text or watermarks.

### 10. Tell you properly — `nw_b1026` (`nw_s62`)

Target text: “There's something I need to tell you. I want to tell you properly. Not in an office. Not on a train.”

Hold split if installed later: `8.83s -> 1.50s + 7.33s`

Result: **option 2 selected**; saved to `reviews/uncut-no-vote-20261030-batch2/images/10-nw-b1026-tell-you-properly.jpg` (`1536x1024`, uninstalled).

Reference order:
1. Preceding shared still: `/film/img/s62/1025-something-to-tell-you.jpg`
2. Following still: `/film/img/s62/486-properly.jpg`

Prompt:

> Create ONE horizontal widescreen 16:9 photorealistic cinematic film still for the Tokyo noir drama Nobody's Witness at beat nw_b1026, bridging the two supplied rainy-night street-crossing close-ups. Pull back slightly to an intimate medium side two-shot beneath the shared rain-beaded clear plastic umbrella at the wet Tokyo crosswalk at night: dark-haired Jack on the right in his dark overcoat and open-collar cream shirt speaks earnestly and quietly to blonde Vera on the left in her charcoal coat and cream turtleneck, who listens intently searching his face before she smiles in the following shot. Softly blurred red pedestrian signal and wet crimson-and-cyan asphalt reflections in the background. Natural hands and proportions, grounded 35mm film cinematography, full 16:9 landscape frame with headroom. No captions, subtitles, overlaid text or watermarks.
