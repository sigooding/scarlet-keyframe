# The Witness Cut without narration: the cue audit and the new pictures, 11 November 2026

The Witness Cut no longer shows the screenplay's description (the narrator beats Original Uncut plays as italic
captions): 1,031 captions are gone and the picture has to tell what they told. This folder records what each
of those lines told the audience that it needs, which picture tells it now, the three pictures that had to be
made because no picture in the film did, a fourth made from a prop sheet, and what the cut showed when it was
watched on screen.

Code: `WITNESS_CUES` in `src/core/witnessCut.ts`. Tests: `src/core/witness-cut.test.ts`.

## New pictures

623, 624 and 625 were each chosen by the director from a 2-option vote, per the standing rule. 626 was not
generated and not voted: it is the film's own prop sheet of the letter with a grade (below). New file names,
nothing overwritten, nothing downscaled, both media indexes updated. They are used by the Witness Cut only: the
film JSON and every other cut are unchanged.

| Picture | Used on | Vote | Voted original | Installed | sha256 |
|---|---|---|---|---|---|
| `s4/623-the-sign-behind-them.jpg` | `nw_b81`, `nw_b260`, `nw_b357` | option 2 of 2 | 2048×1152 (`vote-623-the-sign-behind-them.jpg`) | 2144×1206, JPEG q90: the voted picture at its own size, set lower in a larger frame for the 2.35:1 gate (below) | `984fbabb0b98fdcbe610874db6cb84a75257f5b565e3ed813c7bcf994b429400` |
| `s11/624-the-same-sign.jpg` | `nw_b285`–`nw_b287`, `nw_b360` | option 1 of 2 | 1536×1024 (`vote-624-the-same-sign.jpg`) | centre-cropped to 1536×864, Lanczos to 1920×1080, JPEG q90 | `0d6cff896a62832730f19623c278d35079af442fc0d9c754b4d3543904e9f735` |
| `s27a/625-the-journalists-card.jpg` | `nw_b712` | option 2 of 2 | 1672×941 (`vote-625-the-journalists-card.jpg`) | centre-cropped to 1664×936, Lanczos to 1920×1080, JPEG q90 | `4015cd2d6d2aa929285189735c39431b3a971820eb04a316fd13200abdf61b9c` |
| `s18/626-the-letter-under-the-lamp.jpg` | `nw_b483`, `nw_b484` | none: not generated | `props/sakai-letter.jpg`, 1920×1080 | 1920×1080, JPEG q90: the prop sheet with a warm tint and a pool of light (below) | `37b03f430bc6f7178dce6a81d60cb237abc9fa4850fa750cc1694f88261dd131` |

The `vote-*.jpg` files here are the voted originals re-saved as JPEG q92 at their own size (the PNGs were
3.3–3.7 MB each). The unselected options were not kept.

### Why these three

- **The sign in the old photographs (623, 624).** The clue that takes Jack to Kaneko's counter is a sign: 金子 on a
  wooden board with a bowl of noodles. The sketchbook (`s14/183`, `s14/362`), the counter itself (`s16/248`,
  `s55/221`, `s56/223`, `s100/1676`) and `props/kaneko-sign-board.jpg` all show it. The two old photographs do not:
  `s4/35-the-photograph` (and the same print in `s10/165-face-up`) shows a red awning and a menu board, and
  `s11/167-two-men-laughing` shows a different sign. Five narration lines covered for that ("Behind them, the
  sign of a noodle shop", "the same noodle shop sign", "He has seen this sign. Twice this week"). Without them
  the link was not on screen at all.
- **The journalist's card (625).** Okada says "He left it the week before" and Vera later walks into the
  newspaper with "Kondo's card", but the only picture of the card in the film is its back
  (`s53a/299-the-card-on-the-desk`). The line that put it on the counter, and said what was printed on it, was
  narration.

### 623 and the 2.35:1 gate

The cut is screened behind the 2.35:1 bars unless the screening options say otherwise: 12% of the height is
covered at the top and 12% at the bottom. In the voted picture the board hangs against the top edge, so on
screen the bar covered 金 and left half a character and the bowl. That was found by watching the cut (see
"Watched on screen"), not on the 16:9 contact sheets the cue points were first checked on.

The installed file is the voted picture, unscaled, set 107 px lower in a 2144×1206 frame:

- the 44 rows above the board (the rope and the out-of-focus street) are stretched to 151 rows;
- the 64 columns at the right edge (out-of-focus street) are stretched to 160;
- the bottom 53 rows are dropped (the lowest strip of the picture, under the bar in 2.35:1 in any case).

Nothing of the board, the three people or the menu stand is resampled. Behind the bars the whole board is in
view with the three faces under it, from the first frame of the push to the last. In the 16:9 and 1.37:1 gates
the picture is the same with a longer rope above the board (looked at in both after the change).

```sh
V=vote-623-the-sign-behind-them.jpg   # ImageMagick 6
convert $V -crop 2048x44+0+0 +repage -filter Mitchell -resize '2048x151!' top.png
convert $V -crop 2048x1055+0+44 +repage body.png
convert top.png body.png -append tall.png
convert tall.png -crop 1984x1206+0+0 +repage left.png
convert tall.png -crop 64x1206+1984+0 +repage -filter Mitchell -resize '160x1206!' right.png
convert left.png right.png +append -strip -quality 90 623-the-sign-behind-them.jpg
```

### 626: the letter, close

The film's picture of the letter (`s18/283-the-letter`) is the desk, wide, and the handwriting in it is
texture: not a word can be read, on screen or in the 1920×1080 file. Narration read the letter out
(`nw_b483`, `nw_b484`). The words are on screen an hour in (`s79/286-smoothed-flat`, `nw_b1317`) and Mara's
message says them near the end, but the scene in which Jack learns why Vera was written to had nothing to
read.

`props/sakai-letter.jpg` is the film's own design of that letter and its envelope, photographed flat and evenly
lit as a prop sheet (its writing is listed as correct in `reviews/tv-news-20261104`). 626 is that picture with a grade and
nothing else: red × 1.07, green × 0.98, blue × 0.80, multiplied by a pool of light centred up and left of the
letter, where the lamp stands in 283. No pixel is moved and nothing was generated, which is why there was no
vote. It plays for 6 s between the wide picture of Jack at his desk (`s18/435-the-last-page`) and 283, and 283
becomes the look at the name on the envelope.

```sh
convert -size 3400x3400 radial-gradient:white-black -evaluate Pow 0.85 rg.png
convert rg.png -crop 1920x1080+1010+1330 +repage -evaluate Multiply 0.84 -evaluate Add 20% pool.png
convert props/sakai-letter.jpg -color-matrix '1.07 0 0  0 0.98 0  0 0 0.80' warm.png
convert warm.png pool.png -compose Multiply -composite -strip -quality 90 626-the-letter-under-the-lamp.jpg
```

A retake on Jack's own desk (the lamp's base and his hand in the frame) would match 283 more closely. It would
be a generated picture and so a vote; the cut needs one line changed for it (`THE_LETTER_CLOSE` in
`witnessCut.ts`).

### Prompts and references

623, references `s4/35-the-photograph.jpg` and `props/kaneko-sign-board.jpg`:

> Create ONE photorealistic 16:9 cinematic film still for an existing Tokyo noir drama: an insert shot of an old
> colour photograph, so close that the photograph itself fills the whole frame edge to edge (no picture frame, no
> hands, no table, no border). Reference 1 shows this photograph standing in its frame: keep the same three
> people, their clothes and the faded, warm colours of a twenty-year-old print: the smiling American man in the
> rumpled grey suit and tie, holding the hands of two small blonde girls, the older one (about 9), serious, in the
> beige cardigan, and the little one (about 4) in the pink dress, laughing. This is a tighter view of the same
> snapshot: the man from the waist up in the middle, the two girls' heads and shoulders beside him, and directly
> behind them the front of a tiny old Tokyo noodle shop on a back street, steam drifting out. Hanging above the
> shop's entrance, right behind their heads, large and perfectly legible: the weathered wooden sign board from
> reference 2, with exactly the two kanji 金子 in bold black brush strokes and the small painted bowl of noodles
> with chopsticks beside them. The sign is the clearest thing in the picture. Soft grain of an old print, slightly
> faded dyes, a faint crease in one corner. No other readable writing anywhere, no caption, no watermark.

624, references `s11/167-two-men-laughing.jpg` and `props/kaneko-sign-board.jpg`:

> Edit reference 1, a photorealistic 16:9 film still from an existing Tokyo noir drama: an old photograph of two
> men laughing at a tiny noodle counter, lying on a yellowed newspaper clipping on a scratched wooden desk under
> a green banker's lamp. Keep everything exactly as it is: both men, their faces, suits and poses, the steam, the
> counter, the desk, the lamp, the clipping, the framing, the light and the colours. Change only one thing: the
> shop sign on the wall behind the two men inside the photograph. Replace it with the weathered wooden sign board
> from reference 2: exactly the two kanji 金子 in bold black brush strokes with the small painted bowl of noodles
> and chopsticks beside them, large enough to be read clearly at a glance, sharp, sitting naturally in the old
> photograph's own faded colours and perspective. No other new writing anywhere, no caption, no watermark.

625, references `s27a/456-the-counter-flap.jpg` and `s9/241-the-card.jpg`:

> Create ONE photorealistic 16:9 cinematic film still for an existing Tokyo noir drama: a close insert shot
> looking down at the worn dark wooden counter of a tiny old Tokyo bar in grey daylight, the same bar as in
> reference 1 (an old bartender in a white shirt and dark blue apron, a blonde woman in a charcoal wool coat). The
> old bartender's hand, the same aged hand with white shirt cuff and dark blue apron as in reference 2, has just
> set a business card down on the counter and is letting go of it. The card lies flat, facing the camera, sharp
> and perfectly legible: a plain white card, slightly worn at the corners, printed in black with exactly two
> lines: the newspaper's name TOTO SHIMBUN in small Latin capital letters, and under it, larger, a name in
> Japanese katakana: コンドウ. Nothing else is printed on the card. At the edge of the frame the woman's hand in a
> charcoal coat sleeve rests on the counter, not yet touching the card. Bottles out of focus behind, shallow depth
> of field, muted cool daylight, fine film grain. No faces in the picture. No other readable writing anywhere, no
> caption, no watermark.

### What to know about them

- **623**: the man's head covers the lower half of 子; 金 and the bowl with chopsticks are clear. It reads as the
  board of the sketchbook and the shop, but it is not the whole word. The strip above the board and the strip
  at the right edge are stretched background (above): the first lies under the top bar in 2.35:1 and shows in
  the 16:9 and 1.37:1 gates, where it reads as soft focus with a slight upward smear in the awning; the second
  is the last 7% of the width.
- **624** is a re-rendering, not a pixel edit: the photograph sits a little larger in the frame than in `167` and
  the men are redrawn. In this cut it replaces `167` on its three beats, so the two versions never meet.
- **625**: the card reads TOTO SHIMBUN / コンドウ, as the screenplay has it (the name in katakana only). The name
  is spoken later, by Harada.
- The film's own `s4/35-the-photograph` and `s10/165-face-up` still show the print without the sign. It is small
  in both, and 623 is cut in right after or between them as the closer view. A retake of those two would make the
  whole film agree; that was not done here.
- **626**: the first two lines, the signature and the name on the envelope are writing. The body of the letter
  is texture, as it is in every picture of this letter in the film. What it said ("I can prove it. I have kept
  his papers for twenty years") Mara says soon after (`nw_b517`): "He said he had Dad's papers."
- None of the four has a depth map (people would need cut-outs first, `docs/depth-camera.md`): the camera on
  them is the flat push toward the cue.
- Thumbnails are derived files: run `npm run thumbs` for the four new ones.

## Every cue, and the picture that tells it

Times are in the new cut. "Push to x% y%" is where in the frame the cue is: the shot's one camera move goes
there and arrives before the shot ends. "At least" is the time the beat is given so the writing can be read.

| Beat | At | What the line told | The picture that tells it | How |
|---|---|---|---|---|
| `nw_b10` | 0:26 | Her phone lights up: VERA. | `s1/04-mara-phone.jpg` | push to 75% 58%; at least 2.2 s |
| `nw_b13` | 0:33 | The scrap: 1.00 Sakai, an address, “just listen.” | `s1/328-the-scrap.jpg` | push to 50% 47%; at least 4.2 s |
| `nw_b46` | 1:53 | A small brass key on a stamped number tag (114). | `s1/16-the-key.jpg` | push to 48% 57%; at least 2.6 s |
| `nw_b71` | 4:14 | THREE DAYS LATER | `s3/29-apartment-block.jpg` | title “THREE DAYS LATER”, 4 s |
| `nw_b81` | 4:41 | Behind them, the sign of a noodle shop. | `s4/623-the-sign-behind-them.jpg` (new) | shown from this beat; push to 49% 25%; at least 3 s |
| `nw_b111` | 6:14 | On the monitor: MARA VOSS. | `s5/46-mara-voss-on-screen.jpg` | push to 46% 44%; at least 2.4 s |
| `nw_b142` | 7:45 | A passport photo: Mara. | `s6/324-the-passport-photo.jpg` | push to 50% 42%; at least 2.4 s |
| `nw_b189` | 10:14 | In the drawer: Mara's purse and the torn strap, in an evidence bag. | `s7/65-the-evidence-bag.jpg` | push to 50% 62%; at least 3.2 s |
| `nw_b223` | 11:34 | The card: JACK. INVESTIGATIONS. | `s9/241-the-card.jpg` | push to 53% 56%; at least 3.4 s |
| `nw_b260` | 12:52 | He looks a moment too long at the noodle shop sign. | `s4/623-the-sign-behind-them.jpg` (new) | cut in for this beat; push to 49% 25%; 2.6 s exactly |
| `nw_b283` | 13:45 | The clipping: AMERICAN INSURANCE INVESTIGATOR FOUND DEAD - POLICE RULE SUICIDE. | `s11/244-daniel-voss-41.jpg` | push to 47% 45%; at least 4.6 s |
| `nw_b284` | 13:49 | The caption: DANIEL VOSS, 41. | `bundled gap-uncut-284` | push to 55% 60%; at least 3 s |
| `nw_b285` | 13:52 | One more photograph: Daniel Voss and a much younger Jack at a noodle counter. Behind them, the same sign. | `s11/624-the-same-sign.jpg` (new) | shown from this beat; push to 64% 30%; at least 3.2 s |
| `nw_b357` | 17:04 | He has seen this sign: in the photograph from Vera's shelf. | `s4/623-the-sign-behind-them.jpg` (new) | cut in for this beat; push to 49% 25%; 1.6 s exactly |
| `nw_b360` | 17:08 | And in a box in his own cupboard. He doesn't answer. | `s11/624-the-same-sign.jpg` (new) | cut in for this beat; push to 64% 30%; 1.6 s exactly |
| `nw_b390` | 18:17 | LATER. | `s14a/337-engine-off.jpg` | dissolve |
| `nw_b430` | 19:53 | 3:40 a.m. | `s14a/533-the-amber-sign-goes-dark.jpg` | dissolve |
| `nw_b440` | 20:14 | The hoarding: KUROSE DEVELOPMENT. | `s15/184-a-gap-in-someones-teeth.jpg` | push to 51% 72%; at least 3.2 s |
| `nw_b483` | 21:56 | The letter: “Miss Voss. Your father did not kill himself.” T. SAKAI. | `s18/626-the-letter-under-the-lamp.jpg` (new: the letter prop, lit) | shown from this beat; push to 40% 27%; at least 5.6 s |
| `nw_b485` | 22:02 | The envelope folded inside it is addressed to VERA VOSS. | `s18/283-the-letter.jpg` | push to 67% 52%; at least 3 s |
| `nw_b609` | 29:22 | Mara's drawing of the bar from the floor: 1:07, EXCUSE ME. | `s25/369-the-drawing.jpg` | push to 60% 64%; at least 3 s |
| `nw_b615` | 29:51 | The coin-locker key: 114. | `s25/370-the-tag-114.jpg` | push to 59% 54%; at least 2.4 s |
| `nw_b712` | 34:27 | Okada sets a card on the counter: TOTO SHIMBUN. The journalist's name in katakana: KONDO. | `s27a/625-the-journalists-card.jpg` (new) | cut in for this beat; push to 48% 60%; at least 3 s |
| `nw_b734` | 36:09 | The receipt: No. 114. Paid in full. | `s29/356-the-stamp-114.jpg` | push to 50% 52%; at least 3.2 s |
| `nw_b759` | 37:28 | KATO RENTAL LOCKERS - UENO. No. 114. | `s34/173-no-114.jpg` | push to 50% 42%; at least 3.6 s |
| `nw_b787` | 38:46 | Later. 2 a.m. | `roadside/s38/38-01-headlights-on-the-highway.jpg` | dissolve |
| `nw_b863` | 40:39 | Ishida. He asked Ishida for the widow's address. | `s23/352-the-address.jpg` (from elsewhere in the film) | cut in for this beat; 1.6 s exactly |
| `nw_b864` | 40:41 | And Vera. He called her and told her it was just an inn. | `s36/208-come-back-safe-anyway.jpg` (from elsewhere in the film) | cut in for this beat; 1.6 s exactly |
| `nw_b1034` | 48:24 | The sign: MONTHLY. YEARLY. NO QUESTIONS. | `s63/63-00-the-locker-room.jpg` | push to 49% 33%; at least 2.6 s |
| `nw_b1038` | 48:36 | A cassette, labelled in a shaking hand: SHIOHAMA. | `s63/231-the-box.jpg` | push to 47% 52%; at least 3 s |
| `nw_b1039` | 48:40 | On the flyleaf: DANIEL VOSS. | `s63/312-daniel-voss-flyleaf.jpg` | push to 60% 46%; at least 3 s |
| `nw_b1076` | 50:07 | LATER: | `bundled duplicate-uncut-1076` | dissolve |
| `nw_b1095` | 50:43 | The clock: 10:00. | `s66/278-the-clock-reads-ten.jpg` | push to 50% 50%; at least 2.2 s |
| `nw_b1096` | 50:46 | Earlier: a different clock, 8:52. | `s67/234-a-different-clock.jpg` | push to 50% 41%; at least 3.2 s |
| `nw_b1174` | 54:14 | The clock above the bar: 11:52. | `s72/497-eleven-fifty-two.jpg` | push to 36% 24%; at least 2.4 s |
| `nw_b1290` | 59:58 | Before dawn. A wide, empty avenue; white streetlights in a long straight row. | `s77a/1290-predawn-avenue.jpg` (from elsewhere in the film) | shown from this beat |
| `nw_b1313` | 60:57 | Inside the cover: DANIEL VOSS. | `s78/1313-daniel-voss-inside-cover.jpg` | push to 38% 45%; at least 2.8 s |
| `nw_b1317` | 61:08 | The letter she threw away, smoothed flat: “Your father did not kill himself.” | `s79/286-smoothed-flat.jpg` | push to 48% 32%; at least 4.2 s |
| `nw_b1472` | 69:12 | The drawing: EXCUSE ME. | `s84/520-excuse-me.jpg` | push to 64% 66%; at least 3 s |
| `nw_b1610` | 75:43 | FIVE DAYS LATER | `s98/153-the-rain-has-stopped.jpg` | title “FIVE DAYS LATER”, 4 s |
| `nw_b1661` | 77:43 | Weeks later. | `s99/156-cut-open.jpg` | title “WEEKS LATER”, 4 s |
| `nw_b1671` | 78:03 | Months later. | `bundled recreated-uncut-1671` | dissolve |

## Watched on screen

The cut was watched in the app itself, not only measured: the production build (`npm run serve`) in the bundled
Chromium, The Witness Cut chosen from the cut menu, the playhead set through `window.__frame24`. Every cue was
looked at behind the 2.35:1 bars at the first frames of its beat and at the last frames of its shot (the push
has arrived by then). Four were also looked at in the 16:9 and 1.37:1 gates, and the stretch with the two
flashes (`nw_b356` to `nw_b361`) was played in real time.

What it showed:

- **The bars.** The cue points had been checked on 16:9 sheets. Behind the bars the board of 623 lost 金: fixed
  in the picture (above). A test now keeps every cue point clear of the bars and of the 1.37:1 pillars.
- **The letter.** Not a word of `s18/283` can be read: fixed with 626 (above).
- **`nw_b609`, "1:07".** The time is written in the lower left corner of the drawing and lies under the bottom
  bar. It shows in the 16:9 and 1.37:1 gates. EXCUSE ME reads in all three. A push aimed at that corner was
  tried and taken out: the camera never shows past a picture's edge, so it cannot lift something that close to
  the bottom edge clear of the bar. The push stays on EXCUSE ME.
- **`nw_b1174`, 11:52.** The top of the clock is under the top bar: the 12 is half covered when the shot begins
  and covered when it ends, with the 11 and the 1 at the edge of the bar. Both hands are in view and the time
  reads. In the other two gates the whole clock shows. The picture has a depth map, and moving the cue point up
  the clock did not change what the bar covers (tried, put back).
- **`nw_b863`.** The flash is Ishida and Jack at the stall with the slip of paper on the table between them,
  in view just above the bottom bar. Its writing is too small to read at 1.6 s; the line it replaces only
  recalled the moment ("He asked Ishida for the widow's address").
- The other cues read as listed, at the size the app showed them (a picture 1,448 px wide): the writing is
  legible, the three titles stand clear of the bar and read against their pictures, the dissolves are in
  mid-mix at the cue, no narration caption appeared on any of the frames looked at and dialogue captions sit in
  the bottom bar.
- Played: `s14/362` → 623 for 1.6 s → `s14/362` under "Can I borrow this?" and "Why?" → 624 for 1.6 s →
  `s14/363`, at 24 frames a second, with no missing media and no page errors.

Not checked on screen: the rest of the film shot by shot (its timing and camera rules are pinned by the
tests, and so is the absence of narration captions), the sound (nothing was listened to) and the MP4 export.

## Lines the picture does not tell, and why they were left

- `nw_b1183` "The screen: ISHIDA." `s72/499-the-screen` shows the back of her phone. The caller speaks a moment
  later, and his line carries his name as its speaker label (ISHIDA).
- `nw_b198` the photo of Mara on Vera's phone: the next line is "My sister. Four nights ago. Was she here?"
- `nw_b252` "The noodle shop sign behind them" (the print on Jack's desk): the sign is shown on `nw_b260`, when he
  looks at it.
- `nw_b1070` the box marked TOKYO in her mother's hand: the lettering is not visible in `s65/487`. Nothing later
  depends on it.
- `nw_b1088` the clock at 9:58 and `nw_b546` 11:40 p.m.: the clock is in the wide picture itself (`s66/491`,
  `s22/195`), small. No push was added: nothing depends on the minute, and "Last night she had noodles" is
  spoken.
- `nw_b430` 3:40 a.m. and `nw_b787` 2 a.m.: there is no clock in the picture. The dissolve says that time has
  passed, not how much. (The clocks the plot depends on, 10:00, 8:52 and 11:52, are in the table.)
- `nw_b1132` "The voice from the floor of the bar": Mara says it herself in the next lines ("That's him." "The
  bar. His voice.").
- `nw_b609` "In the corner, small: 1:07": under the bottom bar in the 2.35:1 gate (see "Watched on screen").
  Nothing refers to the minute again; the hour is spoken ("come to the bar at one o'clock").
- `nw_b483`, `nw_b484` the rest of the letter ("I can prove it. I have kept his papers for twenty years. I am
  old and I am ill and I do not want to carry them any more. Please telephone."): the body of the letter is
  not writing in any picture of it. Mara says what matters of it soon after (`nw_b517`).
- What a character thinks and nobody says (`nw_b711`, `nw_b1318`–`nw_b1319`, `nw_b1336`, `nw_b1338`,
  `nw_b1638`–`nw_b1639` and the like) is not replaced by anything. The picture holds on the face.
