# Original Uncut image recovery

The earlier generated images were lost in a workspace reset. These are **new generations**, not exact copies. Originals, timing, captions and audio are kept in the source snapshot. Selected plates are only added to Original Uncut, with guarded upgrades for existing Uncut saves; custom pictures are not replaced.

## Recreated and selected

| Beat | Image |
|---|---|
| nw_b17 | Mara hidden |
| nw_b27 | Headlights |
| nw_b28 | Men approach |
| nw_b31 | After twenty years |
| nw_b38 | Sedan departs |
| nw_b148 | How did she seem? |
| nw_b716 | Sea-wall road |
| nw_b1020 | Dinner with me |
| nw_b1177 | No messages |
| nw_b1037 | The notebook |
| nw_b1054 | The sedan |
| nw_b1351 | Was that you? |
| nw_b1467 | Promised a car |
| nw_b1573 | Empty chair |
| nw_b1637 | Vera goes still |
| nw_b1671 | Winter light |

## Still to recreate

Quality-rejected options (do not install, retry with improved prompts): nw_b1157, nw_b997, nw_b1322, nw_b16, nw_b19, nw_b727, nw_b745. Other earlier selected images still to recreate: nw_b918, nw_b900, nw_b1678, nw_b1679. The last two must be separate sequential TV frames: Kurose first, Ishida's police portrait second; Kaneko and Jack are present in the shop, Vera arrives afterwards.

## Continuation prompt

> Continue recreating the missing Original Uncut images listed in IMAGE_RECOVERY.md. For each image, use the original neighbouring frames and character references, offer a vote, and install only the chosen option. A skip means the quality was not good enough: leave the current image untouched and retry with an improved prompt. Choose ordinary batch targets at random; keep the kiss and the two final-TV shots at their requested beats. Preserve the original pictures in the source snapshot, narrative, captions, audio, timing, running order, and saved custom picture edits. Include the prompts used, update the recovery list and tests, and commit the selected images as work progresses.

## Long-hold coverage (Original Uncut)

Audit consecutive identical pictures within each scene with `npx vite-node scripts/audit-uncut-holds.ts > uncut-holds.json`. It uses the bundled voice durations and normal playback pace; actual saved edits or different measured durations can change the results. The audit initially found 314 holds longer than seven seconds and now finds 308. Scene boundaries are treated as boundaries; also manually inspect any picture carried across a scene boundary and cases with no following image. A single beat over seven seconds needs a picture-only split that preserves voice and captions; do not split the audio or silently change the total duration. Do not replace a user's saved picture. Other cuts are unaffected.

Six randomly selected holds were shortened at existing beat boundaries, without adding or shortening beats:

- `nw_b99`: Vera hesitates in her apartment before taking the umbrella (`nw_b98` → `nw_b100`). Prompt: "Create ONE photorealistic 16:9 cinematic film still to bridge two existing shots of a Tokyo noir drama. The first reference is Vera's quiet apartment with the blue umbrella in its stand, rain-streaked window, table, cups and warm lamp; the second shows Vera taking the umbrella. Between these moments, show the same blonde Vera, face and clothes matching the second reference, now wearing her dark coat and cream turtleneck, standing and hesitating at the door before she reaches for the blue umbrella, which is still in its stand untouched. Keep the same apartment, furnishings, rainy daylight and subdued warm color; contemplative realistic human expression, film cinematography, no text or subtitles."
- `nw_b1358`: Jack stands over Ishida after the fight (`nw_b1357` → `nw_b1359`). Prompt: "Create ONE photorealistic 16:9 cinematic film still bridging the two supplied neighboring shots in a Tokyo noir police office; use the third image only to identify Jack. Immediately after a fight, Jack, the dark-haired Western man in the dark coat from the third reference, stands breathing hard over Ishida, the Japanese detective lying on the floor in the second reference. Jack's knuckles are lightly bloodied; he is no longer striking. Ishida remains on the floor, conscious. The two young detectives seen in the first reference stay at a distance. Match faces, clothes, fluorescent police office, desks, grey daylight and sober cinematic realism, a medium-wide angle. No gore, text or subtitles."
- `nw_b1565`: Kurose reassures Ishida about the tea (`nw_b1564` → `nw_b1566`). Prompt: "Create ONE photorealistic 16:9 cinematic film still to bridge the two supplied adjacent shots in a Tokyo noir drama. Match the same rain-wet night, beige leather sedan interior, warm interior lamps and the same two men's faces and clothing. Kurose, the older Japanese man with neatly swept-back silver hair and dark formal suit on the right, calmly reassures the dark-haired detective Ishida about the cup of tea, a subtle expression of restrained power; Ishida watches the small metal cup warily as it passes to him. Compose a natural closer reverse angle that belongs between the given references, preserving the cup and Kurose's wristwatch. Subdued cinematic realism, no text, no subtitles."

Continue at random, offer a separate vote for each image, and install only selected results. A skip means the quality was not good enough. Regenerate the audit after each accepted batch; not every >7-second hold can be solved with one image, and the thresholds apply to the resulting picture runs, not just individual dialogue clips.

- `nw_b38`: the sedan departs (`nw_b37` → `nw_b39`), a successful improved retry of a prior rejected recovery. Prompt: "Create ONE photorealistic 16:9 Tokyo noir film still bridging the two supplied adjacent reference frames. Match the exact rain-soaked barbershop lane at night, wet reflections, vending machine, road and elderly man in pale coat lying where he fell, unchanged. The same black sedan from the first reference has driven away down the cross street, its red tail lights receding and its headlights sweeping off the lane as it goes round the block. Mara remains hidden and is not yet in the street; no other people visible. Compose a distinct cinematic angle emphasizing the departing car and the quiet aftermath; realistic restrained lighting, no invented text, no subtitles, no gore."
- `nw_b893`: Vera asks Jack what is wrong (`nw_b892` → `nw_b894`). Prompt: "Create ONE photorealistic 16:9 cinematic film still to bridge these two adjacent frames in a Tokyo noir drama. Match the exact white-tiled bathroom, soft daylight, the same blonde Vera in cream turtleneck and injured dark-haired Jack in a dark shirt. Vera pauses tending Jack's injuries, looking directly at him, frightened and asking urgently what is wrong; Jack watches her in silence. Her cloth remains lightly stained and the injuries remain as in the references, without extra gore. Compose a natural medium two-shot from another angle while preserving both actors' faces, clothes and scene continuity. No text or subtitles."
- `nw_b1014`: skipped; leave it unchanged and retry later. Prompt: "Create ONE photorealistic 16:9 cinematic film still for a Tokyo noir drama, bridging the supplied two adjacent references. In the same car beneath the rain-soaked elevated road at night, Ishida, the middle-aged Japanese driver shown in the first image, quietly speaks while keeping his eyes on the wet road; Jack, the Western passenger from that image, listens, taken aback. Their exact faces, clothes, positions and car interior must match the references, with the rain-streaked windscreen, restrained amber and teal night lighting. Compose an intimate natural passenger-side angle, before the next reference close-up of Ishida's hands on the steering wheel. No text or subtitles."


### Next random batch

- Selected `nw_b1073`, Vera takes the wine-red dress from its box (`nw_b1072` → `nw_b1074`). Prompt: "Create ONE photorealistic 16:9 cinematic film still bridging the two supplied neighboring reference images in a Tokyo noir drama. In the same dim bedroom, the blonde woman Vera in the same cream knit turtleneck slowly lifts a wine-red silk evening dress from its cardboard box and yellowed tissue paper on the bed, considering its age and elegance. Keep her face, the dress's simple thin straps and deep wine-red color, the rainy window, blue bedding and soft bedside light consistent with the references. Show this moment before she holds the dress up to herself in the mirror; natural medium shot, quiet wistful mood, no invented text or subtitles."
- Skipped `nw_b240` (Jack's missing-persons conversation); retry with an improved prompt. Prompt: "Create ONE photorealistic 16:9 cinematic film still for an existing Tokyo noir film, a new intermediate shot bridging the two supplied reference images. Match the first image's dim private detective office with rainy window, green banker's lamp, wooden desk, dark coat and cream turtleneck worn by blonde Vera, and Jack's dark jacket and white shirt. The same dark-haired, middle-aged Jack is seated across the desk from Vera, explaining with wary reserve that he does not take missing-person cases, while Vera listens intently. Frame a natural closer reverse angle concentrating on Jack's face and Vera listening at the edge of frame, consistent with their identities and positions; his small steel lighter is in his hand. The little red bird clip is not yet on the desk, as the second reference shows that happens next. Restrained moody film lighting, no added text, no subtitles."
- Skipped `nw_b1046` (Jack emerges from locker room); retry with an improved prompt. Prompt: "Create ONE photorealistic 16:9 cinematic film still for an existing Tokyo noir story, bridging the supplied adjacent references. In the same rain-soaked street of brick railway arches and shuttered shops at night, the same dark-haired Western man Jack emerges from the locker room and carefully buttons his dark coat over a hidden notebook and flat item. Match his face and coat, brickwork, rain and amber streetlight reflections from the references; use a distinct medium shot, closer than the existing street wide shot. The ominous black sedan can remain indistinct in the far distance, as the following frame reveals it. Realistic restrained suspense, no extra people, no text or subtitles."
