# Nobody’s Witness: voted depth maps (`2026-10-31`)

Three **real depth maps** for recreated Original Uncut stills that had a picture but no 2.5D camera. Each was generated from its own plate, voted between two candidates, and only the chosen option was kept. All three votes were accepted.

[Open the numbered review gallery](index.html) · [Machine-readable manifest](manifest.json)

| # | Scene | Beat | Shot | Vote | Depth map |
|---:|---|---|---|---|---|
| 1 | `nw_s94` | `nw_b1562` | Its rear door stands open: warm amber light, leather. | Option 2 accepted | `/film/depth/recreated-uncut/1562-sedan-door-depth.jpg` |
| 2 | `nw_s17` | `nw_b465` | Everything is going. We are just slower. | Option 1 accepted | `/film/depth/recreated-uncut/465-kaneko-counter-depth.jpg` |
| 3 | `nw_s79` | `nw_b1316` | Careful, laborious English handwriting… | Option 1 accepted | `/film/depth/recreated-uncut/1316-vera-reads-letter-depth.jpg` |

The three plates were chosen for three different depth problems: a night car interior with a seated figure, a warm cluttered noodle counter with two standing figures and a camera-left profile, and a rainy apartment room with a foreground table. Every other recreated plate keeps whatever camera it already had.

## What counts as a depth map here

A depth map is *not* a grey copy of the picture. These are pure luminance renders: near-white for the closest surfaces, near-black for the sky and distant glass, smooth per-object gradients, crisp occlusion edges, and no texture, lighting, colour, grain or lettering. That is what the WebGL 2.5D shader (`FrameDepthParallax`, `/film/depth/...`) expects, and it is the same format as the existing maps such as `/film/depth/s77a/1296-everyone-is-allowed-one-depth.jpg`.

## Generation

The generator was run with `offer_options: true`, so both candidates arrived as one vote; the choice and the prompt are recorded per shot. The only image supplied as a reference was the plate itself, because a depth map has to trace that exact framing — no neighbouring frames, no character sheets.

After the vote, each accepted PNG was trimmed of the generator’s 1–3 px margin, converted to genuine 8-bit greyscale, resized to **960×540** and saved as JPEG quality 88, matching the size and encoding of the film’s other depth maps. Nothing was blurred, inverted, relit or otherwise reinterpreted. The full-size voted PNG of each is kept unchanged under `images/`; the 960×540 film copies are in `public/film/depth/recreated-uncut/` and are also bundled inline from `src/assets/recreated-uncut/depth/`.

## Exact prompts and votes

### 1. Its rear door stands open — `nw_b1562` (`nw_s94`, 94 — Only tea)

Plate: `/film/img/s94/139-only-tea.jpg` (bundled as `duplicate-uncut-1562`, `src/assets/recreated-uncut/1562-sedan-door.jpg`).

Result: **option 2 accepted**.

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

### 3. Vera reads the letter — `nw_b1316` (`nw_s79`, 79 — Grey light)

Plate: `/film/img/s79/91-grey-light.jpg` (bundled as `duplicate-uncut-1316`, `src/assets/recreated-uncut/1316-vera-reads-letter.jpg`).

Result: **option 1 accepted**.

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

## How it is wired

`RECREATED_DEPTH_MAP_BY_BEAT` in `src/core/recreatedUncut.ts` maps each beat to its bundled depth asset, plate asset and authored amount. Upgrade version **17** applies them to an already-saved Original Uncut, active or stashed, when:

- the beat still shows the recreated bundled plate, and
- the shot has no `depthMap`, `depthPlate` or `depthCutouts` of its own, and
- the user has not saved a different picture there.

The shot then gets `mode: "static"`, `depthMotion: "push"`, the authored `depthAmount` (0.28 / 0.26 / 0.26) and `depthSeconds: 8`. A `dolly` preset is re-based to `static` because a dolly travels across an oversized plate and cannot be combined with a depth camera; its focal point, grade and timing are untouched. Picture, dialogue, captions, audio and total duration are unchanged — that is asserted in `src/core/recreated-uncut.test.ts`, together with the on-disk 960×540 greyscale files and both media indexes.

Regenerate this page’s manifest after any change with:

    python3 reviews/depth-maps-20261031/build-manifest.py

## Continuation

The other recreated Uncut plates still have no depth camera. Next candidates with strong parallax potential: `nw_b038` (sedan departing down the wet lane), `nw_b716` (sea-wall road receding to the horizon), `nw_b1073` (Vera holding the dress at the rainy window) and `nw_b1358` (Jack over Ishida in the office). Prompt each from its own plate only, vote, and add the accepted map to `RECREATED_DEPTH_MAP_BY_BEAT`; bump `DEPTH_VERSION` when adding more.
