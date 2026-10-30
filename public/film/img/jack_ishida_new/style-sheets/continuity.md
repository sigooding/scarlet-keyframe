# Scene 61 "Nine o'clock" (Jack and Ishida in the car): continuity lock

Fresh set for *Nobody's Witness* on the Scarlet Reel. **Nothing in the shipped film is replaced:**
`public/film/img/s61/`, `src/film/story.json` and `src/film/studio-edits.json` are untouched. All
new work lives in `public/film/img/jack_ishida_new/`.

Use this file with `car-seating-plan.jpg` whenever a frame for this scene is made or fixed.

## 1. The seat lock (never changes between cuts)

```
                         ▲  the way the car faces
                .-------------------------.
                |         bonnet          |
   pillars,     |  [====  windscreen ===] |     open
   guardrail,   |  dash ......[gauges]... |     service
   kerb         |             ( WHEEL )   |     road
   (Jack's      |  [ JACK  ]  |  [ISHIDA] |     (Ishida's
    side)       |  passenger  |   driver  |      side)
                |  - - - - - - - - - - - -|- - -  180° line
                |   [ rear seats: empty ] |
                '-------------------------'
```

* **Japanese right-hand drive.** **ISHIDA** drives from the **RIGHT** front seat, behind the wheel.
  **JACK** sits in the **LEFT** front seat, with bare dashboard in front of him. The rear seats are
  always empty. Nobody changes seats, and the doors stay shut all scene.
* **From the front** (through the windscreen or from the dash), **Ishida is always screen-LEFT and
  Jack always screen-RIGHT.**
* **Eyelines:**
  * Ishida looks **screen-RIGHT** to Jack.
  * Jack looks **screen-LEFT** to Ishida.
  * Looking ahead at the rain means looking toward the lens (in front shots).
* **The camera stays on the windscreen side of the 180° line.** Only four shots sit on the line
  itself:
  * **03** (Jack's view of Ishida), where Ishida faces **screen-LEFT**, with the wheel and the green
    gauges in front of him and his door window behind;
  * **04** (Ishida's view of Jack), where Jack faces **screen-RIGHT**, with the windscreen and
    mirror at frame right;
  * **09** (Jack's eyes on the hands);
  * **11** (in through Jack's window), where Ishida is soft behind him, **screen-LEFT**.
* **No back-seat angle.** It would put Ishida screen-RIGHT and flip the scene. (The shipped `228`
  was a back-seat shot with the wheel on the left and Jack driving.)
* **Exteriors:** the car is parked at the **LEFT kerb** of the service road under the expressway
  (Japan keeps left).
  * The pillars and guardrail are on Jack's side; the open road is on Ishida's side.
  * The camera is on the road side at a front three-quarter: **nose screen-RIGHT**, with the driver
    nearest the camera.

## 2. Prompt blocks (paste these, in this wording)

**LOOK**
> Contemporary Japanese neo-noir film still, photographic realism, 16:9. Palette: warm amber sodium
> light from outside, soft green instrument glow inside, cool slate and blue-green shadows. Rain
> beading and running on every pane. Restrained 35mm film grain, natural exposure, subtle halation.
> No legible text, no logos, no number plates, no watermark, no border.

**CAR**
> Ishida's car: a dark bottle-green metallic 1990s Japanese four-door saloon, RIGHT-HAND DRIVE.
> Mouse-grey velour seats with headrests, dark grey plastic dashboard, green-backlit analogue
> speedometer and tachometer behind the steering wheel, centre stack with two vents, a small
> green-lit clock and a radio-cassette, floor automatic selector and handbrake, plain rear-view
> mirror with nothing hanging from it, nothing personal anywhere. Engine idling, headlights off,
> wipers parked.

**LOCATION**
> Parked under the outer edge of a concrete elevated expressway in Tokyo: massive grey pillars in a
> receding row, amber sodium lamps on the pillars, a steel guardrail, wet black asphalt with long
> amber reflections; run-off and rain spill past the edge of the deck onto the car.

**ISHIDA**
> Japanese police detective, mid-50s, short neatly combed salt-and-pepper hair brushed back,
> clean-shaven, lined tired face that reads as decency, calm heavy-lidded eyes; charcoal-grey
> herringbone tweed jacket, pale grey-blue shirt open at the collar, no tie; plain steel watch on
> the left wrist.

**JACK**
> Western man, late 50s, tall and lean, lined weathered face, swept-back dark hair greying at the
> sides, collar-length, short grey stubble; long charcoal-black wool overcoat over an off-white
> open-collar shirt. No plaster, no visible wound.

For the seat, always state it in **screen terms** for the camera in use (for example: "seen from
the front the driver is on the LEFT of the frame behind the steering wheel"). Generators default to
left-hand drive; say "right-hand drive" *and* where the wheel lands in the frame.

## 3. References: what to pass

* **Faces:** `refs/ishida-face.jpg`, `refs/jack-face.jpg`. These were built from shipped frames
  only (Ishida: `s23/441`, `s80/99`, `s7/66`; Jack: `s23/351`, `s59/477`, `s80/95`).
* **The car and the light:** `61-02-neither-looks.jpg` is the master. Pass it with every interior.
  Add `refs/car-interior-rhd.jpg` for layout when the dash shows.
* **Same set-up as 02** (08, 10): edit 02 itself, changing only where the men look.
* **Shipped originals:** at most one per call, for style or identity only. **Never** use any `_new`
  folder (or `roadside`, `thehiveescape`) as a reference.
* **Mirroring to fix a wrong-side frame** is allowed. It's the quickest fix when the generator draws
  left-hand drive, and these frames carry no legible text. If you mirror one, re-check that Ishida's
  watch is on his left wrist.

## 4. Shot recipes

| # | File | Camera, and who looks where | Pass |
|---|---|---|---|
| 01 | `61-01-under-the-expressway` | EXT wide, front three-quarter from the road side, nose screen-RIGHT. Two dim silhouettes, the driver nearest the camera behind the wheel. Faces are not read until 02. | (made) |
| 02 | `61-02-neither-looks` | Front two-shot through the rain-beaded windscreen. Ishida LEFT behind the wheel, Jack RIGHT. Both look ahead past the lens. | both faces, interior plate, 01 |
| 03 | `61-03-the-side-of-his-face` | From Jack's seat looking right. Ishida in left profile, facing screen-LEFT, hands on the wheel, gauges green at lower left, his door window behind. | Ishida face, 02, interior plate |
| 04 | `61-04-i-have-a-witness` | From Ishida's seat looking left. Jack in right profile, facing screen-RIGHT, speaking. His door window behind; windscreen and mirror at right; centre stack at lower right. | Jack face, 02, interior plate |
| 05 | `61-05-the-sister` | From the dash, over the wheel rim. Ishida stares dead ahead and nothing moves. Driver's door window at frame left, rear cabin at right. | Ishida face, 02 |
| 06 | `61-06-just-you` | From the dash in front of Jack. Jack RIGHT of centre, turned in his seat toward Ishida, looking screen-LEFT, earnest. His wet door window behind him at right. | Jack face, 02, 04 |
| 07 | `61-07-as-if-it-costs-him` | Through the windscreen in front of the driver's side. Ishida a slow nod, eyes lowered to his hands on the wheel; raindrops on the glass half-veil his face. Jack's soft shoulder at the right edge; Ishida's door window at left. | Ishida face, 02, 05 |
| 08 | `61-08-eyes-on-the-rain` | **Edit of 02.** Jack has turned head and shoulders to look at Ishida (screen-LEFT). Ishida still looks straight ahead at the rain, hands on the wheel. Nothing else changes. | 02 (base), both faces |
| 09 | `61-09-hands-on-the-wheel` | Jack's eyes from the left seat, looking right and down. The wheel centre-right; Ishida's hands tight at ten and two on a parked car, watch on the near (left) wrist; tweed sleeves from the right; gauges green behind the wheel; centre console soft at lower left; rain-beaded windscreen above. No face. | 03, interior plate |
| 10 | `61-10-youve-done-well` | **Edit of 02.** Ishida turns his head to Jack (screen-RIGHT), a tired, kind half-smile: the only time he looks at him. Jack looks ahead past the lens at the rain, his face easing. | 02 (base), both faces |
| 11 | `61-11-he-lets-himself-believe-it` | From outside Jack's (left) door, slightly forward, through the rain-streaked side window. Jack turned to look out at the rain, almost to camera, the first easing in twenty years. Ishida soft behind him, screen-LEFT, lit green, facing screen-LEFT. | Jack face, 04, 02 |

## 5. Check every frame before it ships

* **The seat:** the wheel is in front of Ishida, and there's no wheel in front of Jack.
* **Front shots:** Ishida is screen-LEFT and Jack screen-RIGHT.
* **Profiles:** in Jack's view (03, 09), Ishida faces LEFT. In Ishida's view (04), Jack faces RIGHT.
* **Faces:** each matches its plate. Ishida has no tie; Jack has stubble and no plaster.
* **The car:** nothing hangs from the mirror, the rear seats are empty and no back-seat angle is
  used.
* **Clean frame:** no legible text, logo or number plate. No film-grade wash and no volumetric
  light shafts.
* **Conform:** 1920×1080 sRGB JPEG q92, made with a Lanczos cover-resize, centre crop and a light
  unsharp (`-unsharp 0x0.8+0.5+0.02`).
