# Nobody’s Witness: voted depth maps (`2026-10-31`)

**Real depth maps** for recreated Original Uncut stills that had a picture but no 2.5D camera. Each was generated from its own plate, voted between two candidates, and only the accepted option was kept. Eleven were accepted; two were rejected and are recorded here with their prompts.

[Open the numbered review gallery](index.html) · [Machine-readable manifest](manifest.json)

| # | Scene | Beat | Shot | Vote | Depth map |
|---:|---|---|---|---|---|
| 1 | `nw_s94` | `nw_b1562` | Its rear door stands open: warm amber light, leather. | 2 ✓ | `/film/depth/recreated-uncut/1562-sedan-door-depth.jpg` |
| 2 | `nw_s17` | `nw_b465` | Everything is going. We are just slower. | 1 ✓ | `/film/depth/recreated-uncut/465-kaneko-counter-depth.jpg` |
| 3 | `nw_s79` | `nw_b1316` | Vera reads the letter. | 1 ✓ | `/film/depth/recreated-uncut/1316-vera-reads-letter-depth.jpg` |
| 4 | `nw_s1` | `nw_b17` | Mara hidden: the empty lane before the sedan. | 2 ✓ | `/film/depth/recreated-uncut/017-hidden-depth.jpg` |
| 5 | `nw_s1` | `nw_b27` | Headlights; two men walk in. | 1 ✓ | `/film/depth/recreated-uncut/027-headlights-depth.jpg` |
| 6 | `nw_s1` | `nw_b38` | The sedan departs. | 1 ✓ | `/film/depth/recreated-uncut/038-sedan-departs-depth.jpg` |
| 7 | `nw_s28` | `nw_b716` | The sea-wall road. | 1 ✓ | `/film/depth/recreated-uncut/716-sea-wall-road-depth.jpg` |
| 8 | `nw_s63a` | `nw_b1054` | Jack watches the sedan from the alley door. | 2 ✓ | `/film/depth/recreated-uncut/1054-the-sedan-depth.jpg` |
| 9 | `nw_s65` | `nw_b1073` | Vera takes out the wine-red dress. | 1 ✓ | `/film/depth/recreated-uncut/1073-wine-red-dress-depth.jpg` |
| 10 | `nw_s80` | `nw_b1351` | Was that you? | 1 ✓ | `/film/depth/recreated-uncut/1351-was-that-you-depth.jpg` |
| 11 | `nw_s84` | `nw_b1464` | Vera in the storeroom. | 1 ✓ | `/film/depth/recreated-uncut/1464-vera-storeroom-depth.jpg` |
| — | `nw_s80` | `nw_b1349` | You told me yourself, Jack. | ✗ | *skipped, nothing installed* |
| — | `nw_s80` | `nw_b1358` | Jack stands over Ishida. | ✗ | *skipped, nothing installed* |

The plates were chosen to cover different depth problems: a night car interior with a seated figure, a warm cluttered noodle counter with two standing figures, a rainy apartment room, a wet lane with a foreground pole, figures walking into a headlight, a receding sea-wall road, a brick alley with stacked air-conditioners, and two bright-ceiling office interiors. Every other recreated plate keeps whatever camera it already had.

### Rejected: `nw_b1349` and `nw_b1358`

Neither candidate for `nw_b1349` (Ishida answers Jack) was usable, and `nw_b1358` failed three times: twice with the standard prompt and once with a rewritten prompt that spelled out that the ceiling is the farthest surface and must stay near-black. Every candidate copied the room's fluorescent ceiling tubes into the map as a bright band, which would have made the ceiling parallax like a near surface. Both beats keep their existing camera; their prompts are stored in the manifest for a later retry.

### Post-processing on `nw_b1351`

The accepted `nw_b1351` vote still copied the ceiling tubes into the map. Because the ceiling is the farthest surface, the top of that map was flattened — a vertically graded mask darkens and flattens everything above the tube line, and nothing below it was touched: the seated detective, the desks, the floor, the back wall and the clock keep their exact depth. The raw vote is kept at `rejected/12-nw_b1351-was-that-you-depth-raw-ceiling-strips.png`.

## What counts as a depth map here

A depth map is *not* a grey copy of the picture. These are pure luminance renders: near-white for the closest surfaces, near-black for the sky and distant glass, smooth per-object gradients, crisp occlusion edges, and no texture, lighting, colour, grain or lettering. That is what the WebGL 2.5D shader (`FrameDepthParallax`, `/film/depth/...`) expects, and it is the same format as the existing maps such as `/film/depth/s77a/1296-everyone-is-allowed-one-depth.jpg`.

## Generation

The generator was run with `offer_options: true`, so both candidates arrived as one vote; the choice and the prompt are recorded per shot. The only image supplied as a reference was the plate itself, because a depth map has to trace that exact framing — no neighbouring frames, no character sheets.

After the vote, each accepted PNG was trimmed of the generator’s 1–3 px margin, converted to genuine 8-bit greyscale, resized to **960×540** and saved as JPEG quality 88, matching the size and encoding of the film’s other depth maps. Nothing was blurred, inverted, relit or otherwise reinterpreted. The full-size voted PNG of each is kept unchanged under `images/`; the 960×540 film copies are in `public/film/depth/recreated-uncut/` and are also bundled inline from `src/assets/recreated-uncut/depth/`.

## Exact prompts and votes

Every prompt below was the only instruction given, with the plate as the only reference image. Votes are recorded per shot in `manifest.json`.

### 1. Its rear door stands open: warm amber light, leather. — `nw_b1562` (`nw_s94`, 94 — Only tea)

Plate: `/film/img/s94/139-only-tea.jpg` (bundled as `duplicate-uncut-1562`, `src/assets/recreated-uncut/1562-sedan-door.jpg`).

Result: **option 2 accepted**.

Installed: `public/film/depth/recreated-uncut/1562-sedan-door-depth.jpg` · cinematic `static · push · 0.28 · 8 s`.

> Create a pure greyscale DEPTH MAP (a Z-pass render) for the supplied 16:9 cinematic film still — not a photograph, not a shaded render. Use the reference only to trace exactly what is where: keep the identical framing, crop and 16:9 aspect, and align every silhouette edge precisely to the reference with clean, crisp, unfeathered boundaries. Luminance encodes distance only: no texture, no colour, no lighting, no highlights, no rain streaks, no grain, no vignette, no border, no text, no signature.
>
> Nearest surfaces, near-white (about 0.92-0.98): the wet black car bodywork and its open rear door frame across the right and lower right of frame, the front door pillar and window glass at the far right edge, and the wet curb/asphalt strip in the bottom-left foreground.
>
> Second nearest, light grey (about 0.72-0.85): the open car door's inner trim and window sill, the wheel arch and rear wheel in the lower left, the door step plate and carpeted sill.
>
> Mid-ground, mid grey (about 0.45-0.62): the pale beige leather rear seat cushions and backrest, the centre armrest, and the seated silver-haired older man in a dark suit — his head, shoulders, torso and legs each a smooth slightly-lighter-on-near-face gradient, still one continuous mid-grey mass clearly readable as the seated figure.
>
> Farther, dark grey (about 0.22-0.38): the far side of the interior, the window frames and headliner of the car, the door light on the headliner, and the parked white blinds of the opposite windows.
>
> Background, near-black (about 0.04-0.14): the rain-soaked night street beyond the car — the wet road with reflected light pools as small soft mid-dark patches, the dark building facades and tree line, and the distant out-of-focus bokeh lights as small soft mid-grey dots. Sky at the very top darkest.
>
> Every surface must be a smooth continuous gradient across the object, each object marginally lighter toward its near edge, with hard clean separation where one object occludes another. Single flat greyscale depth map, full-bleed 16:9, no colour anywhere.

### 2. Everything is going. We are just slower. — `nw_b465` (`nw_s17`, 17 — You got old)

Plate: `/film/img/s17/434-i-was-already-old.jpg` (bundled as `duplicate-uncut-465`, `src/assets/recreated-uncut/465-kaneko-at-counter.jpg`).

Result: **option 1 accepted**.

Installed: `public/film/depth/recreated-uncut/465-kaneko-counter-depth.jpg` · cinematic `static · push · 0.26 · 8 s`.

> Create a pure greyscale DEPTH MAP (a Z-pass render) for the supplied 16:9 cinematic film still — not a photograph, not a shaded render. Use the reference only to trace what is where: identical framing and 16:9 crop, every silhouette edge crisp and aligned to the reference, no feathering. Luminance encodes distance only: no wood grain, no texture, no colour, no lamp glow, no steam shading, no grain, no vignette, no border, no text.
>
> Nearest surfaces, near-white (about 0.92-0.98): the worn wooden counter edge running along the bottom-left to centre foreground, the chopstick holder and small condiment bottles standing on it at the left, and the bottom of the near wooden stool at the lower right.
>
> Light grey, second nearest (about 0.70-0.85): the counter top surface receding toward the right, the near stool seat, the tall chopstick cylinders and bowls further along the counter, and the right-hand wooden wall and coat hooks at frame right.
>
> Mid-ground, mid grey (about 0.45-0.62): the elderly woman in the brown cardigan and dark apron behind the counter at the left — head, shoulders, arms and hands each a smooth gradient, one readable mid-grey mass; the two older customers seated at the far end of the counter as clearly darker mid-grey silhouettes; and the dark-haired greying man in the dark coat standing at the right of the counter, his head, shoulder, arm and hand a single continuous mid-grey figure with a slightly lighter near edge.
>
> Farther, dark grey (about 0.22-0.36): the metal shelving and steam hood behind the counter, the hanging pendant lamp shade and its stem as a mid-dark shape, the dark blue noren curtains in the doorway and the back kitchen doorway.
>
> Background, near-black (about 0.04-0.14): the rear kitchen interior, the far wall with posters and the framed sign, and the recesses behind the shelves. Ceiling and deep corners darkest.
>
> Every surface a smooth continuous gradient, each object marginally lighter at its near edge, with clean hard separation at every occlusion boundary. Single flat greyscale depth map, full-bleed 16:9, no colour anywhere.

### 3. Careful, laborious English handwriting. "Miss Voss. Your father did not kill himself. I can prove it." — `nw_b1316` (`nw_s79`, 79 — Grey light)

Plate: `/film/img/s79/91-grey-light.jpg` (bundled as `duplicate-uncut-1316`, `src/assets/recreated-uncut/1316-vera-reads-letter.jpg`).

Result: **option 1 accepted**.

Installed: `public/film/depth/recreated-uncut/1316-vera-reads-letter-depth.jpg` · cinematic `static · push · 0.26 · 8 s`.

> Create a pure greyscale DEPTH MAP (a Z-pass render) for the supplied 16:9 cinematic film still — not a photograph, not a shaded render. Use the reference only to trace what is where: identical framing and 16:9 crop, crisp silhouette edges aligned exactly to the reference, no feathering. Luminance encodes distance only: no texture, no handwriting, no colour, no lighting, no grain, no vignette, no border, no text.
>
> Nearest surfaces, near-white (about 0.92-0.98): the low wooden table top filling the bottom centre and right foreground, the two pale cups standing on it, and the open notebook lying on it slightly farther, plus the very bottom edge of the woman's dark skirt at the lower left.
>
> Light grey, second nearest (about 0.70-0.85): the sheet of paper held in the woman's hands, her hands and forearms, her bare shoulders, and the left-hand wooden sideboard with its drawers and the small framed photo on it.
>
> Mid-ground, mid grey (about 0.45-0.62): the blonde woman's head, face and torso — one continuous readable figure mass with a smooth gradient that is marginally lighter toward her near side — and the tall lamp shade on the left, the dark CRT television on its stand at the right and the armchair back at the extreme lower right.
>
> Farther, dark grey (about 0.22-0.36): the curtains at both window edges and along the base, and the balcony rail and outer window frame.
>
> Background, near-black (about 0.04-0.16): the rain-streaked window glass and the blurred apartment block beyond it, plus the pale sky visible outside as a slightly lighter dark patch. The deepest interior shadows stay darkest.
>
> Every surface a smooth continuous gradient, each object marginally lighter at its near edge, clean hard separation at every occlusion boundary. Single flat greyscale depth map, full-bleed 16:9, no colour anywhere.

### 4. Mara hidden: the empty rain-soaked lane before the sedan arrives. — `nw_b17` (`nw_s1`, 1 — The barbershop lane)

Plate: `/film/img/s1/06-barbershop-doorway.jpg` (bundled as `recreated-uncut-017`, `src/assets/recreated-uncut/017-hidden.jpg`).

Result: **option 2 accepted**.

Installed: `public/film/depth/recreated-uncut/017-hidden-depth.jpg` · cinematic `static · push · 0.3 · 8 s`.

> Create a pure greyscale DEPTH MAP (a Z-pass render) for the supplied 16:9 cinematic film still — not a photograph, not a shaded render. Use the reference only to trace what is where: identical framing and 16:9 crop, every silhouette edge crisp and aligned exactly to the reference, no feathering or glow. Luminance encodes distance only: no texture, no wet reflections, no rain streaks, no colour, no lamp light, no grain, no vignette, no border, no text.
>
> Nearest surfaces, near-white (about 0.92-0.98): the utility pole rising vertically just left of centre, the corrugated roller shutters and doorway of the building at the far left edge, the corner of the shuttered shop and the black awning overhead at the right edge, and the wet road surface in the bottom 15% of frame.
>
> Light grey, second nearest (about 0.72-0.86): the white drinks vending machine standing under the left building with its wire basket and the kerb beside it, the yellow stacked beer crates and the parked scooter against the right building, and the low white guard rail across the far side of the crossing.
>
> Mid-ground, mid grey (about 0.45-0.62): the crossing road surface with its white zebra stripes as flat slightly darker shapes, the shorter second pole and the traffic signal on it just left of centre, and the low buildings and wall behind them.
>
> Farther, dark grey (about 0.24-0.38): the tall street lamp and its hood near the top left, the further street lamp and its pole in the centre background, and the dark block of buildings and fence behind the crossing.
>
> Background, near-black (about 0.03-0.13): the empty sky at the top and the far street receding between the buildings, with the distant small light sources as tiny soft mid-grey dots only.
>
> Every surface a smooth continuous gradient, each object marginally lighter at its near edge, hard clean separation at every occlusion boundary and at the rooflines. Single flat greyscale depth map, full-bleed 16:9, no colour anywhere.

### 5. The headlights come up the lane; two men walk in. — `nw_b27` (`nw_s1`, 1 — The barbershop lane)

Plate: `/film/img/s1/332-the-sedan-blocks-the-lane.jpg` (bundled as `recreated-uncut-027`, `src/assets/recreated-uncut/027-headlights.jpg`).

Result: **option 1 accepted**.

Installed: `public/film/depth/recreated-uncut/027-headlights-depth.jpg` · cinematic `static · push · 0.32 · 8 s`.

> Create a pure greyscale DEPTH MAP (a Z-pass render) for the supplied 16:9 cinematic film still — not a photograph, not a shaded render. Use the reference only to trace what is where: identical framing and 16:9 crop, every silhouette edge crisp and readable against the bright background, no feathering and no bloom around the light. Luminance encodes distance only: no texture, no wet reflections, no rain, no colour, no headlamp glare, no grain, no vignette, no border, no text.
>
> Nearest surfaces, near-white (about 0.92-0.98): the wet road filling the bottom third of frame, with the paint marking at the lower left, and the utility pole standing just left of centre.
>
> Light grey, second nearest (about 0.72-0.86): the corrugated shutters and shopfront of the left building, the white vending machine beside it with its wire basket, the kerb line, and the right-hand shop front with its black awning, door and the yellow stacked beer crates plus scooter at the lower right.
>
> Mid-ground, mid grey (about 0.42-0.60): the three standing figures, each one continuous readable mass — the older man in the pale long coat on the left, seen from behind and slightly nearer, then the two masked men in dark coats walking toward camera in the centre, the left one marginally darker than the right. Keep their silhouettes exact, including the umbrella the left masked man carries.
>
> Farther, dark grey (about 0.22-0.36): the dark car parked at the right of the lane behind the two masked men, its roof and window line, and the taller building blocks above the shop fronts on both sides.
>
> Background, near-black (about 0.03-0.13): the bright headlight area between the figures as the deepest, most distant plane, the street lamp and signal beyond, the far building silhouettes and the black sky at the top.
>
> Every surface a smooth continuous gradient, each object marginally lighter at its near edge, hard clean separation at every occlusion boundary including around the figures against the light. Single flat greyscale depth map, full-bleed 16:9, no colour anywhere.

### 6. The sedan departs. — `nw_b38` (`nw_s1`, 1 — The barbershop lane)

Plate: `/film/img/s1/13-taillights-gone.jpg` (bundled as `gap-uncut-038`, `src/assets/recreated-uncut/038-sedan-departs.jpg`).

Result: **option 1 accepted**.

Installed: `public/film/depth/recreated-uncut/038-sedan-departs-depth.jpg` · cinematic `static · push · 0.3 · 8 s`.

> Create a pure greyscale DEPTH MAP (a Z-pass render) for the supplied 16:9 cinematic film still — not a photograph, not a shaded render. Use the reference only to trace what is where: identical framing and 16:9 crop, every silhouette edge crisp and aligned exactly to the reference, no feathering. Luminance encodes distance only: no brick or shutter texture, no wet reflections, no rain, no colour, no lamp light, no car tail-light glow, no grain, no vignette, no border, no text.
>
> Nearest surfaces, near-white (about 0.92-0.98): the rain-soaked road and white lane paint filling the bottom third of frame, brightest at the very bottom edge, and the thick utility pole standing just left of centre.
>
> Light grey, second nearest (about 0.74-0.88): the elderly man in the pale coat lying on the road at the lower centre, clearly readable as a figure, and the shuttered shop fronts, vending machine with wire basket on the left, and the black awning, scooter and yellow beer crates on the right.
>
> Mid-ground, mid grey (about 0.45-0.64): the black sedan crossing the lane in the centre at a distance, readable as a car with its roof, windows and wheels; the zebra crossing on the road; and the small signal-light pole near it.
>
> Farther, dark grey (about 0.24-0.38): the low buildings and fence behind the crossing, the barber's pole on the right frontage, and the walls above the shop fronts on both sides.
>
> Background, near-black (about 0.03-0.13): the tall street lamps and their poles overhead, the far building silhouettes, and the black rainy sky at the top with its thin cable lines only faintly lighter.
>
> Every surface a smooth continuous gradient, each object marginally lighter at its near edge, hard clean separation at every occlusion boundary and roofline. Single flat greyscale depth map, full-bleed 16:9, no colour anywhere.

### 7. The sea-wall road. — `nw_b716` (`nw_s28`, 28 — The sea wall)

Plate: `/film/img/s28/203-the-sea-wall-steps.jpg` (bundled as `recreated-uncut-716`, `src/assets/recreated-uncut/716-sea-wall-road.jpg`).

Result: **option 1 accepted**.

Installed: `public/film/depth/recreated-uncut/716-sea-wall-road-depth.jpg` · cinematic `static · push · 0.34 · 8 s`.

> Create a pure greyscale DEPTH MAP (a Z-pass render) for the supplied 16:9 cinematic film still — not a photograph, not a shaded render. Use the reference only to trace what is where: keep the identical framing and 16:9 crop, aligning every silhouette edge to the reference, no feathering. Luminance encodes distance only: no roof-tile or paint texture, no colour, no daylight, no cloud shading, no grain, no vignette, no border, no text.
>
> Nearest surfaces, near-white (about 0.92-0.98): the pale asphalt road sweeping from the bottom of frame up the centre, the grass and kerb strip along its left, and the low concrete sea wall running along the right side.
>
> Light grey, second nearest (about 0.72-0.88): the two rows of single-storey Japanese houses — the row along the left receding into the distance, each house a separate block that steps progressively darker, and the single house at the far right beyond the sea wall.
>
> Mid-ground, mid grey (about 0.45-0.64): the rocky shoreline and low fence beyond the sea wall, and the nearest section of road, kerb and wall further up the lane.
>
> Farther, dark grey (about 0.22-0.36): the sea surface filling the right background, smooth with gentle tonal variation and darker toward the horizon, and the distant headland and far houses where the road curves.
>
> Background, near-black (about 0.03-0.14): the whole cloudy sky across the top two-fifths of the frame, darkest at the top edge, and the far end of the road at the horizon.
>
> Every surface a smooth continuous gradient, each object marginally lighter at its near edge, clean hard separation at every roofline, kerb and wall edge. Single flat greyscale depth map, full-bleed 16:9, no colour anywhere.

### 8. Jack watches the sedan from the alley door. — `nw_b1054` (`nw_s63a`, 63 — They give up)

Plate: `/film/img/s63a/295-they-give-up.jpg` (bundled as `recreated-uncut-1054`, `src/assets/recreated-uncut/1054-the-sedan.jpg`).

Result: **option 2 accepted**.

Installed: `public/film/depth/recreated-uncut/1054-the-sedan-depth.jpg` · cinematic `static · push · 0.34 · 8 s`.

> Create a pure greyscale DEPTH MAP (a Z-pass render) for the supplied 16:9 cinematic film still — not a photograph, not a shaded render. Use the reference only to trace what is where: identical framing and 16:9 crop, every silhouette edge crisp and aligned exactly to the reference, no feathering. Luminance encodes distance only: no brick texture, no wet reflections, no rain, no colour, no lamp light, no grain, no vignette, no border, no text.
>
> Nearest surfaces, near-white (about 0.92-0.98): the dark door frame and door edge at the far right of frame, and the rain-wet alley paving filling the bottom third, brightest at the very bottom edge.
>
> Light grey, second nearest (about 0.72-0.88): the man in the dark coat standing in the doorway at the right — head, shoulders and arm one continuous readable mass, marginally lighter toward his near shoulder — and the low ground-mounted air-conditioning units at the lower left corner.
>
> Mid-ground, mid grey (about 0.45-0.64): the two brick alley walls, running left and right toward the street, each with its wall-mounted air-conditioning boxes as slightly lighter blocks that step progressively darker with distance, and the horizontal pipe crossing the alley overhead.
>
> Farther, dark grey (about 0.24-0.38): the parked black sedan across the far end of the alley, clearly readable as a car with its kerb and wheels, the shuttered garage beside it, and the taller building faces and windows beyond the alley mouth.
>
> Background, near-black (about 0.03-0.14): the sky above the street lamps, the deepest recesses of both alley walls, and the far dark street surface beyond the car.
>
> Every surface a smooth continuous gradient, each object marginally lighter at its near edge, clean hard separation at every occlusion boundary. Single flat greyscale depth map, full-bleed 16:9, no colour anywhere.

### 9. Vera takes the wine-red dress out of its box. — `nw_b1073` (`nw_s65`, 65 — The wine-red dress)

Plate: `/film/img/s65/488-wine-red-silk.jpg` (bundled as `gap-uncut-1073`, `src/assets/recreated-uncut/1073-wine-red-dress.jpg`).

Result: **option 1 accepted**.

Installed: `public/film/depth/recreated-uncut/1073-wine-red-dress-depth.jpg` · cinematic `static · push · 0.28 · 8 s`.

> Create a pure greyscale DEPTH MAP (a Z-pass render) for the supplied 16:9 cinematic film still — not a photograph, not a shaded render. Use the reference only to trace what is where: identical framing and 16:9 crop, crisp silhouette edges aligned to the reference, no feathering. Luminance encodes distance only: no knit or silk texture, no colour, no window light, no bedside lamp glow, no grain, no vignette, no border, no text.
>
> Nearest surfaces, near-white (about 0.92-0.98): the dark door frame and door edge along the far left of frame, and the near edge of the bed and deep-blue bedding across the bottom of frame.
>
> Light grey, second nearest (about 0.74-0.88): the open cardboard box with its tissue paper, lying on the bed at the lower left, and the wine-red dress held up in the woman's hands — a single continuous readable shape where the fabric hangs in soft folds.
>
> Mid-ground, mid grey (about 0.45-0.66): the blonde woman standing in the centre — head, hair, shoulders, cream turtleneck, both arms and hands one continuous, clearly readable figure mass, marginally lighter along her near shoulder; plus the wooden headboard behind her to the left.
>
> Farther, dark grey (about 0.24-0.38): the curtains at the left and right of the window, the curtain rail, and the narrow warm lamp and small bedside table at the right.
>
> Background, near-black (about 0.03-0.16): the rain-beaded window panes and the blurred dark city beyond them, darkest in the upper panes, with the distant window lights only the faintest soft grey dots.
>
> Every surface a smooth continuous gradient, each object marginally lighter at its near edge, clean hard separation at every occlusion boundary around her silhouette. Single flat greyscale depth map, full-bleed 16:9, no colour anywhere.

### 10. Was that you? — `nw_b1351` (`nw_s80`, 80 — Was that you)

Plate: `/film/img/s80/96-hands-close.jpg` (bundled as `recreated-uncut-1351`, `src/assets/recreated-uncut/1351-was-that-you.jpg`).

Result: **option 1 accepted**.

Installed: `public/film/depth/recreated-uncut/1351-was-that-you-depth.jpg` · cinematic `static · push · 0.26 · 8 s`.

Post-processing: The accepted vote copied the room's bright fluorescent ceiling tubes into the map as white bars. Because the ceiling is the farthest surface in the room, those bars were flattened by compositing a vertically graded mask over the top of the frame (darkened and flattened above the tube line, untouched below); the figures, desks, floor and back wall are unchanged. The raw vote is kept at rejected/12-nw_b1351-was-that-you-depth-raw-ceiling-strips.png.

> Create a pure greyscale DEPTH MAP (a Z-pass render) for the supplied 16:9 cinematic film still — not a photograph, not a shaded render. Trace only where things are: identical framing and 16:9 crop, crisp silhouette edges, no feathering. Luminance encodes distance only.
>
> CRITICAL — this frame contains bright fluorescent tubes on the ceiling and a bright window. Do NOT copy their brightness into the depth map. The ceiling is the farthest surface in the room, so render it near-black (about 0.02-0.08) with NO bright strips, bars, halos or glow. The windows at the right are far away: dark grey (about 0.12-0.22), never white. No lamp glare, reflection, texture, colour, grain, vignette, border or text anywhere.
>
> Nearest surfaces, near-white (about 0.92-0.98): the out-of-focus standing man's dark suit edge along the left side of frame, cropping the picture from top to bottom, soft-edged but clearly the nearest plane, and the desk surface and stacked papers running along the bottom edge.
>
> Light grey, second nearest (about 0.74-0.88): the seated older Japanese detective with grey-streaked hair, seen from mid-chest up — his head, face, shoulders, jacket, collar, tie-less shirt, pen in hand and watch, one continuous clearly readable figure mass, marginally lighter across his nearer shoulder — plus the stacked trays and file piles on his desk at the lower left and right.
>
> Mid-ground, mid grey (about 0.45-0.64): the nearer rows of grey office desks with their paperwork and folders, and the blurred seated colleagues behind him at the left.
>
> Farther, dark grey (about 0.24-0.38): the back office wall with the wall clock, the doorway and the noticeboard, and the filing cabinets and shelving along the right.
>
> Background, near-black (about 0.02-0.16): the entire ceiling, and the tall windows on the right showing a washed-out sky as flat dark grey without any bright panes.
>
> Every surface a smooth continuous gradient, each object marginally lighter at its near edge, clean hard separation at every occlusion boundary. Single flat greyscale depth map, full-bleed 16:9, no colour anywhere, no bright ceiling.

### 11. Vera in the storeroom. — `nw_b1464` (`nw_s84`, 84 — Both wrong)

Plate: `/film/img/s84/117-both-wrong.jpg` (bundled as `duplicate-uncut-1464`, `src/assets/recreated-uncut/1464-vera-storeroom.jpg`).

Result: **option 1 accepted**.

Installed: `public/film/depth/recreated-uncut/1464-vera-storeroom-depth.jpg` · cinematic `static · push · 0.28 · 8 s`.

> Create a pure greyscale DEPTH MAP (a Z-pass render) for the supplied 16:9 cinematic film still — not a photograph, not a shaded render. Use the reference only to trace what is where: identical framing and 16:9 crop, every silhouette edge crisp and aligned exactly to the reference, no feathering. Luminance encodes distance only: no shelf or wood texture, no colour, no bulb glow or window light, no grain, no vignette, no border, no text.
>
> Nearest surfaces, near-white (about 0.92-0.98): the bare floorboards and the near edge of the door frame or shelving at the very bottom and outer edges of the picture.
>
> Light grey, second nearest (about 0.72-0.88): the tall storage shelves, stacked boxes and crates standing along the left and right of the room, each a separate block that steps darker with distance, and any near foreground furniture.
>
> Mid-ground, mid grey (about 0.45-0.66): the blonde woman standing in the room — head, hair, shoulders, coat and arms one continuous clearly readable figure mass, marginally lighter along her near shoulder — holding or facing the object she has come to find, kept as one solid shape.
>
> Farther, dark grey (about 0.24-0.38): the back wall of the storeroom, its door, hanging coats and higher shelves, and the far corner of the room.
>
> Background, near-black (about 0.03-0.15): the ceiling, the deepest recesses and any doorway leading to a darker room beyond, all flat and without light patches.
>
> Every surface a smooth continuous gradient, each object marginally lighter at its near edge, clean hard separation at every occlusion boundary. Single flat greyscale depth map, full-bleed 16:9, no colour anywhere.

### 12. You told me yourself, Jack. You always tell the wrong person. — `nw_b1349` (`nw_s80`, 80 — Was that you)

Plate: `/film/img/s80/95-ishida-doesnt-look-up.jpg` (bundled as `duplicate-uncut-1349`, `src/assets/recreated-uncut/1349-ishidas-answer.jpg`).

Result: **skipped — no candidate accepted, nothing saved**.

>

### 13. Jack stands over Ishida after the fight. — `nw_b1358` (`nw_s80`, 80 — Was that you)

Plate: `/film/img/s80/not-to-jack.jpg` (bundled as `gap-uncut-1358`, `src/assets/recreated-uncut/1358-jack-stands.jpg`).

Result: **skipped — no candidate accepted, nothing saved**.

Note: Two votes rejected, plus a third rejected after a rewritten prompt that spelled out that the ceiling is the farthest surface: every candidate copied the fluorescent ceiling tubes into the map as a bright band. Left without a depth map until a candidate stops doing that.

> Create a pure greyscale DEPTH MAP (a Z-pass render) for the supplied 16:9 cinematic film still — not a photograph, not a shaded render. Trace only where things are: identical framing and 16:9 crop, crisp silhouette edges, no feathering. Luminance encodes distance only.
>
> CRITICAL — depth is not brightness. This frame has bright light sources in it. Do NOT render them as bright shapes:
> - The fluorescent ceiling tubes are ON THE CEILING, the farthest surface in the room, so the ceiling must be near-black (about 0.02-0.08) with NO bright strips, bars, glow or halos anywhere in it. No bright band across the top of the frame at all.
> - The window at the right is far away: render it as dark grey (about 0.12-0.20), never white, with no blown-out pane.
> - No lamp, reflection, gleam, grain, colour, vignette, border or text anywhere.
>
> Nearest surfaces, near-white (about 0.90-0.98): the carpeted office floor along the bottom of the frame and the shoe of the standing man at the lower left; the floor should fade smoothly from near-white at the bottom edge to dark grey where it meets the back wall.
>
> Light grey, second nearest (about 0.72-0.86): the head and shoulders of the Japanese detective lying on his back at the lower right, his upturned face clearly readable, and the near desk edge and chair backs at the lower left and lower right corners.
>
> Mid-ground, mid grey (about 0.45-0.64): the standing Western man leaning over him — head, shoulders, torso, both arms and legs one continuous, clearly readable figure mass, marginally lighter along his nearer shoulder and coat edge — plus the two grey steel desks with their papers left and right of him.
>
> Farther, darker mid grey (about 0.26-0.40): the two young detectives in dark suits standing side by side in the centre background, each a separate darker figure, and the filing cabinets, shelves and partition behind them.
>
> Background, near-black (about 0.02-0.15): the far wall with the wall clock as a faint slightly-darker disc, the window at the right, and the whole ceiling.
>
> Every surface a smooth continuous gradient, each object marginally lighter at its near edge, clean hard separation at every occlusion boundary. Single flat greyscale depth map, full-bleed 16:9, no colour anywhere, and absolutely no bright ceiling.

## How it is wired

`RECREATED_DEPTH_MAP_BY_BEAT` in `src/core/recreatedUncut.ts` maps each beat to its bundled depth asset, plate asset and authored amount. Upgrade version **18** applies them to an already-saved Original Uncut, active or stashed, when:

- the beat still shows the recreated bundled plate, and
- the shot has no `depthMap`, `depthPlate` or `depthCutouts` of its own, and
- the user has not saved a different picture there.

Each shot then gets `mode: "static"`, `depthMotion: "push"`, its authored `depthAmount` (0.26–0.34) and `depthSeconds: 8`. A `dolly` preset is re-based to `static` because a dolly travels across an oversized plate and cannot be combined with a depth camera; its focal point, grade and timing are untouched. Picture, dialogue, captions, audio and total duration are unchanged — asserted in `src/core/recreated-uncut.test.ts`, together with the on-disk 960×540 greyscale files and both media indexes.

The maps are bundled inline (`src/assets/recreated-uncut/depth/`), so the single-file build needs no server; the film copies live in `public/film/depth/recreated-uncut/`.

Regenerate the manifest after any change, then rebuild the gallery:

    python3 reviews/depth-maps-20261031/build-manifest.py

## Continuation

The remaining recreated Uncut plates still have no depth camera. Next candidates: `nw_b028` (men approaching), `nw_b148` (how did she seem), `nw_b773` (Jack at the inn payphone), `nw_b1020` (dinner with me), `nw_b1302` (the shadowed car window), `nw_b1573` (empty chair), `nw_b1671` (winter light) and `nw_b1686` (beyond the curtain). Retry `nw_b1349` and `nw_b1358` only with a prompt that explicitly forbids bright ceiling tubes — or accept that bright practicals in frame are a known failure mode of image-model depth maps and prefer plates without them.

Prompt each from its own plate only, vote, add the accepted map to `RECREATED_DEPTH_MAP_BY_BEAT`, and bump `DEPTH_VERSION` when adding more.
