# Original Uncut: ten-shot review

The no-vote generation service returned HTTP 403 on the original attempt and retry. At the user’s request, the batch then used voting: **nine images were selected and installed**, and image **3 was skipped** and left unchanged.

[Open the numbered image review gallery](index.html) · [Machine-readable manifest](manifest.json)

The gallery shows each selected image alongside the original preceding and following frames. Full-resolution voted JPEGs are preserved under `images/`; full-frame downsized JPEGs are bundled for Original Uncut. The pictures shown under `context/` are small previews of the original reference frames, not replacements.

The nine insertions use the existing beat boundaries. Timing, captions, audio, original source stills and other cuts are not changed. Saved or stashed Uncut edits are upgraded only when the original picture and safe carry conditions still match; user images, explicit holds and shot-specific layers are preserved.

| # | Scene | Target beat | Shot | Vote result |
|---:|---|---|---|---|
| 1 | `nw_s94` | `nw_b1562` | The open sedan door | [Option 2 selected](images/01-nw-b1562-sedan-door.jpg) |
| 2 | `nw_s8` | `nw_b199` | Vera asks about Mara | [Option 2 selected](images/02-nw-b199-asking-about-mara.jpg) |
| 3 | `nw_s4` | `nw_b87` | Vera makes the call | **Skipped** — unchanged |
| 4 | `nw_s83` | `nw_b1439` | The tiny plaza | [Option 1 selected](images/04-nw-b1439-plaza-miniatures.jpg) |
| 5 | `nw_s79` | `nw_b1332` | Vera reads the notebook | [Option 1 selected](images/05-nw-b1332-reading-notebook.jpg) |
| 6 | `nw_s17` | `nw_b465` | Kaneko at the counter | [Option 1 selected](images/06-nw-b465-kaneko-at-counter.jpg) |
| 7 | `nw_s84` | `nw_b1464` | Vera in the storeroom | [Option 2 selected](images/07-nw-b1464-vera-storeroom.jpg) |
| 8 | `nw_s61` | `nw_b1007` | Ishida behind the wheel | [Option 2 selected](images/08-nw-b1007-ishida-drives.jpg) |
| 9 | `nw_s11` | `nw_b288` | Jack studies the photograph | [Option 2 selected](images/09-nw-b288-jack-remembers.jpg) |
| 10 | `nw_s77a` | `nw_b1302` | The shadowed car window | [Option 2 selected](images/10-nw-b1302-black-sedan-window.jpg) |

## Exact prompts and ordered reference frames

### 1. The open sedan door — `nw_b1562`

Target text: “Its rear door stands open: warm amber light, leather.”

Result: **option 2 selected**; original `reviews/uncut-no-vote-20261030/images/01-nw-b1562-sedan-door.jpg`; inline `src/assets/recreated-uncut/1562-sedan-door.jpg`.

Reference order:
1. Preceding shared still: `/film/img/s94/139-only-tea.jpg` (workspace copy: `/home/user/uncut-review-refs-20261030/nw_b1562-before.jpg`)
2. Following still: `/film/img/s94/140-where-are-we-going.jpg` (workspace copy: `/home/user/uncut-review-refs-20261030/nw_b1562-after.jpg`)

Prompt:

> Create one horizontal 16:9 photorealistic film still for Nobody's Witness at beat nw_b1562. Use both neighbouring reference images for the same rain-soaked black sedan, beige leather interior and warm amber cabin light. Show a distinct closer three-quarter view from the wet pavement of the open rear door and the inviting empty seat nearest the door. The same silver-haired older Japanese man in a dark suit remains quietly seated on the far side, as in the first reference; the driver is only a dim silhouette. Match the real car's black bodywork, rain droplets, leather and lighting. Ishida has not yet entered this shot; do not add another person beside the car. Restrained Tokyo-noir photographic realism, natural proportions, no captions, titles, readable added text, logos or watermark. A complete wide landscape frame, not a square or a tight crop.

### 2. Vera asks about Mara — `nw_b199`

Target text: “My sister. Four nights ago. Was she here?”

Result: **option 2 selected**; original `reviews/uncut-no-vote-20261030/images/02-nw-b199-asking-about-mara.jpg`; inline `src/assets/recreated-uncut/199-asking-about-mara.jpg`.

Reference order:
1. Preceding shared still: `/film/img/s8/160-were-closed.jpg` (workspace copy: `/home/user/uncut-review-refs-20261030/nw_b199-before.jpg`)
2. Following still: `/film/img/s8/410-exactly-one-second.jpg` (workspace copy: `/home/user/uncut-review-refs-20261030/nw_b199-after.jpg`)
3. Vera identity: `/film/img/s6/58-why-kanda.jpg` (workspace copy: `/home/user/uncut-review-refs-20261030/nw_b199-vera-identity.jpg`)

Prompt:

> Create one horizontal 16:9 photorealistic film still for Nobody's Witness at beat nw_b199. The first two references establish the same narrow, dim Kanda bar, elderly owner Okada in a dark apron and white shirt, and Vera holding up a phone; the third reference identifies Vera's face and clothes only. Show a distinct medium two-shot of the same blonde Vera in her dark coat and cream turtleneck politely asking Okada about her missing sister while holding her phone toward him. The back of the phone faces the camera, so its picture is not invented or readable. Okada looks at her before the following close-up. Keep the same wet windows, bottles, bar stools and subdued rainy daylight. Natural hands, quiet tension, no new foreground people, no captions, subtitles, added readable words or watermark. Wide landscape composition with comfortable headroom.

### 3. Vera makes the call — `nw_b87`

Target text: “Her phone lies face up in front of her. She calls. Waits.”

Result: **skipped**; no selected image was saved or installed. Retry with an improved prompt later.

Reference order:
1. Preceding shared still: `/film/img/s4/385-the-empty-place.jpg` (workspace copy: `/home/user/uncut-review-refs-20261030/nw_b87-before.jpg`)
2. Following still: `/film/img/s4/37-the-answerphone.jpg` (workspace copy: `/home/user/uncut-review-refs-20261030/nw_b87-after.jpg`)

Prompt:

> Create one horizontal 16:9 photorealistic film still for Nobody's Witness at beat nw_b87. Use both neighbouring images for the SAME blonde Vera, cream knit turtleneck, low wooden table, two pale cups, rainy window, television and apartment. Show a distinct medium-wide view of Vera seated at that table, having picked up the black smartphone and holding it to her ear as she waits for her sister to answer. One cup contains cold tea and the second remains empty. Match the quiet grey daylight and warm interior hints, her recognisable face and subdued worried expression. No other people, phone-screen text, subtitles, titles or watermark; natural hands and restrained realistic cinematic photography. A complete landscape 16:9 frame, not a square or extreme close-up.

### 4. The tiny plaza — `nw_b1439`

Target text: “Tiny painted people cross it.”

Result: **option 1 selected**; original `reviews/uncut-no-vote-20261030/images/04-nw-b1439-plaza-miniatures.jpg`; inline `src/assets/recreated-uncut/1439-plaza-miniatures.jpg`.

Reference order:
1. Preceding shared still: `/film/img/retakes_2026_10_20/112-every-page-r1.jpg` (workspace copy: `/home/user/uncut-review-refs-20261030/nw_b1439-before.jpg`)
2. Following still: `/film/img/s83/113-very-clean.jpg` (workspace copy: `/home/user/uncut-review-refs-20261030/nw_b1439-after.jpg`)

Prompt:

> Create one horizontal 16:9 photorealistic film still for Nobody's Witness at beat nw_b1439. Use both references for Kurose's pale high-rise office and especially the architectural scale model under its glass cover. Make a distinct close view of the actual miniature model: an immaculate white paved plaza with a round fountain, small pale model trees, geometric green patches and a handful of tiny painted model people. The miniature figures should clearly be small scale-model objects, not full-size live people. Match the towers and orderly layout from the second reference, with soft overcast daylight and a hint of the glass case. No new buildings, readable writing, subtitles, graphic overlays or watermark. Restrained realistic cinematic photography, true wide landscape framing.

### 5. Vera reads the notebook — `nw_b1332`

Target text: “I'll go on alone. I've done it before.”

Result: **option 1 selected**; original `reviews/uncut-no-vote-20261030/images/05-nw-b1332-reading-notebook.jpg`; inline `src/assets/recreated-uncut/1332-reading-notebook.jpg`.

Reference order:
1. Preceding shared still: `/film/img/s79/92-underlined-twice.jpg` (workspace copy: `/home/user/uncut-review-refs-20261030/nw_b1332-before.jpg`)
2. Following still: `/film/img/s79/508-almost-unrecognisable.jpg` (workspace copy: `/home/user/uncut-review-refs-20261030/nw_b1332-after.jpg`)
3. Vera identity and apartment: `/film/img/s79/91-grey-light.jpg` (workspace copy: `/home/user/uncut-review-refs-20261030/nw_b1332-vera-identity.jpg`)

Prompt:

> Create one horizontal 16:9 photorealistic film still for Nobody's Witness at beat nw_b1332. The first two references show the same open old notebook on Vera's low wooden table and its later increasingly disordered handwriting; the third establishes Vera's face, wine-red sleeveless dress and rainy dawn apartment. Show a distinct medium three-quarter view of the SAME blonde Vera reading the open notebook, one hand resting near the page, her face quietly affected by what she is learning about her father. Preserve the two pale cups, table, window and restrained cold morning light. The notebook is a physical object with indistinct handwriting; do not invent legible words or add captions. No other people, subtitles or watermark. Natural hands and grounded cinematic realism, a full landscape frame with headroom.

### 6. Kaneko at the counter — `nw_b465`

Target text: “Everything is going. We are just slower.”

Result: **option 1 selected**; original `reviews/uncut-no-vote-20261030/images/06-nw-b465-kaneko-at-counter.jpg`; inline `src/assets/recreated-uncut/465-kaneko-at-counter.jpg`.

Reference order:
1. Preceding shared still: `/film/img/s17/434-i-was-already-old.jpg` (workspace copy: `/home/user/uncut-review-refs-20261030/nw_b465-before.jpg`)
2. Following still: `/film/img/s17/358-the-empty-third-stool.jpg` (workspace copy: `/home/user/uncut-review-refs-20261030/nw_b465-after.jpg`)

Prompt:

> Create one horizontal 16:9 photorealistic film still for Nobody's Witness at beat nw_b465. Use both neighbouring references for Kaneko's small noodle shop: the same elderly Japanese woman with grey hair, brown cardigan and blue apron works behind the steaming pot; Jack sits at the wooden counter in a dark coat. Show a distinct medium-wide side angle of the two: Kaneko speaks with quiet warmth while tending the pot with long chopsticks, and the same dark-haired Jack listens from his stool. Match their faces, positions, counter, crockery, curtain, steam and low warm lights. Natural human proportions and understated feeling, realistic Tokyo-noir cinematography. No invented foreground people, captions, subtitles, added readable text or watermark. Complete widescreen frame with room around both heads.

### 7. Vera in the storeroom — `nw_b1464`

Target text: “Ishida called me before it was on any news. He knew exactly where she was.”

Result: **option 2 selected**; original `reviews/uncut-no-vote-20261030/images/07-nw-b1464-vera-storeroom.jpg`; inline `src/assets/recreated-uncut/1464-vera-storeroom.jpg`.

Reference order:
1. Preceding shared still: `/film/img/s84/117-both-wrong.jpg` (workspace copy: `/home/user/uncut-review-refs-20261030/nw_b1464-before.jpg`)
2. Following still: `/film/img/s84/518-thats-mine.jpg` (workspace copy: `/home/user/uncut-review-refs-20261030/nw_b1464-after.jpg`)
3. Vera identity in the storeroom: `/film/img/s84/519-not-all-right.jpg` (workspace copy: `/home/user/uncut-review-refs-20261030/nw_b1464-vera.jpg`)

Prompt:

> Create one horizontal 16:9 photorealistic film still for Nobody's Witness at beat nw_b1464. Use the first two images for the cramped noodle-shop storeroom and Jack, and the third for Vera's exact face, tied-back blonde hair and dark coat over a pale shirt. Show a distinct medium shot of the SAME Vera standing near the curtain and taped sketches, speaking seriously toward Jack across the room; he may appear only as a blurred shoulder in the foreground. Keep the same bare bulb, worn walls, flour sacks and warm dim light from the references. Preserve their distance and the quiet, difficult emotional tone; no new people or objects, no captions, subtitles, overlaid words or watermark. Natural anatomy and grounded cinematic realism, complete landscape framing with headroom.

### 8. Ishida behind the wheel — `nw_b1007`

Target text: “The sister.”

Result: **option 2 selected**; original `reviews/uncut-no-vote-20261030/images/08-nw-b1007-ishida-drives.jpg`; inline `src/assets/recreated-uncut/1007-ishida-drives.jpg`.

Reference order:
1. Preceding shared still: `/film/img/s61/481-the-side-of-his-face.jpg` (workspace copy: `/home/user/uncut-review-refs-20261030/nw_b1007-before.jpg`)
2. Following still: `/film/img/s61/482-just-you.jpg` (workspace copy: `/home/user/uncut-review-refs-20261030/nw_b1007-after.jpg`)

Prompt:

> Create one horizontal 16:9 photorealistic film still for Nobody's Witness at beat nw_b1007. Use both neighbouring images for the exact two men and the same car on a rainy night: Ishida drives, Jack sits in the passenger seat. Show a distinct medium angle from near the dashboard toward the SAME older Japanese Ishida in his dark jacket and pale shirt, hands naturally on the wheel, his face composed as he briefly responds without taking his attention from the road. Keep Jack out of the foreground, but preserve the car interior, wet glass, elevated road and muted amber streetlights in the references. No new characters, phones, weapons, captions, subtitles, added writing or watermark. Restrained suspense and natural anatomy, a full landscape 16:9 composition rather than a square crop.

### 9. Jack studies the photograph — `nw_b288`

Target text: “Jack looks at it for a long time.”

Result: **option 2 selected**; original `reviews/uncut-no-vote-20261030/images/09-nw-b288-jack-remembers.jpg`; inline `src/assets/recreated-uncut/288-jack-remembers.jpg`.

Reference order:
1. Preceding shared still: `/film/img/s11/167-two-men-laughing.jpg` (workspace copy: `/home/user/uncut-review-refs-20261030/nw_b288-before.jpg`)
2. Following still: `/film/img/s11/418-it-takes-a-long-time-to-dial.jpg` (workspace copy: `/home/user/uncut-review-refs-20261030/nw_b288-after.jpg`)
3. Jack identity: `/film/img/s11/419-twenty-years.jpg` (workspace copy: `/home/user/uncut-review-refs-20261030/nw_b288-jack-identity.jpg`)

Prompt:

> Create one horizontal 16:9 photorealistic film still for Nobody's Witness at beat nw_b288. The first reference is Jack's old photograph of two laughing men on his wooden office desk; the second shows the green banker's lamp and black rotary phone he will dial next. The third identifies Jack's exact face and hair. Show a distinct medium view of the same middle-aged Western Jack in his dark coat and pale shirt, seated in the same dim rainy office and looking down at the old photograph with quiet grief. The photograph lies partly visible and softly out of focus on the desk, with the green lamp and rotary phone nearby; he has not started dialling yet. No invented readable text, extra people, subtitles or watermark. Natural anatomy and restrained, realistic noir cinematography, a complete wide landscape frame with headroom.

### 10. The shadowed car window — `nw_b1302`

Target text: “Everyone is allowed one.”

Result: **option 2 selected**; original `reviews/uncut-no-vote-20261030/images/10-nw-b1302-black-sedan-window.jpg`; inline `src/assets/recreated-uncut/1302-black-sedan-window.jpg`.

Reference order:
1. Preceding shared still: `/film/img/s77a/1296-everyone-is-allowed-one.jpg` (workspace copy: `/home/user/uncut-review-refs-20261030/nw_b1302-before.jpg`)
2. Following still: `/film/img/s77a/1303-reflection-in-black-glass.jpg` (workspace copy: `/home/user/uncut-review-refs-20261030/nw_b1302-after.jpg`)
3. Watch and hand at the lowered window: `/film/img/s77a/1294-hand-and-watch-on-sill.jpg` (workspace copy: `/home/user/uncut-review-refs-20261030/nw_b1302-hand.jpg`)

Prompt:

> Create one horizontal 16:9 photorealistic film still for Nobody's Witness at beat nw_b1302. Use all three references for the same rain-wet black sedan, empty pre-dawn avenue, Jack outside and the clean hand with wristwatch resting on the lowered rear-window sill. Show a distinct exterior medium view of that partially open rear window as the unseen passenger speaks; the watch and hand are visible, while the passenger's face remains completely hidden in the dark interior. Jack, the same dark-haired Western man in a dark coat, is visible outside the car in a restrained side view. The window is still down; the next shot will show it raised with Jack's reflection. Match the wet black bodywork, cool white streetlights and tense muted noir atmosphere. No new characters, no clear face inside the car, no captions, subtitles, overlaid words or watermark. Complete wide landscape framing.

## Continuation

> Continue Original Uncut coverage by running the duplicate and long-hold audits. Pick ordinary targets at random and inspect the story text and neighbouring reference frames. The user requested voting as the fallback when no-vote generation was blocked; install only selected options, treat skips as quality rejections, and retry `nw_b87` with an improved prompt later. Preserve the original stills, timing, audio, captions, other cuts, and user edits. Save exact prompts and selected originals, verify migrations and run the tests before committing.
