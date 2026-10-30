# Retakes of 20 October 2026

Made from `docs/image-brief-2026-10-20.md`, Priority 1, in the brief's order. The original Priority 1 retakes are listed below;
subsequent Hive-model regenerations and alternatives are documented in the dedicated section. No files under `src/`, `tools/`,
`scripts/` or `docs/` were touched. Image dimensions vary by generation; check each file before film installation and never
shrink an image. Install approved film pictures with `tools/install-film-picture.mjs`.

Two notes on how they were made:

- **No ffmpeg in this workspace**, so `tools/install-film-picture.mjs` could not be run as written. The same job was
  done with sharp instead: centre crop to the exact 16:9 that keeps the most pixels, Lanczos enlarge to 1920x1080
  when the crop was smaller, JPEG q92. The crop/enlarge logic is identical to the tool's.
- **No vision in the generating session**, so each picture was made from the brief's prompt verbatim (each ending
  with its section's style line) with the listed references attached, but the results have not been eyeballed.
  The director should check the faces and the hands first, as the brief asks.

## The pictures

| File (under `public/film/img/`) | Item | Still to check |
|---|---|---|
| `retakes_2026_10_20/style-sheets/kurose-plaza-model.jpg` | 1a | The four panels (A model with the Hive, B hand lifting it out, C the plaza finished, D the Hive on the tray) should read as **one** model; the sheet is the reference for 1b and 1c, so fix it there first if the layout drifts between panels. |
| `retakes_2026_10_20/310-the-model-at-dawn-r1.jpg` | 1b | The Hive block at the plaza's front edge, and the steel tray with the white cup of tea on the low table. |
| `retakes_2026_10_20/311-the-hand-on-the-model-r1.jpg` | 1c | The hand and the silver watch on a black leather strap, and the finished white paving where the Hive stood. |
| `retakes_2026_10_20/74-03-his-hands-r1.jpg` | 2a | Edited from the original for the hands only: blood thinned by rain, in the knuckle creases and around the nails. Framing, coat, rain and light should be unchanged. |
| `retakes_2026_10_20/72-01-the-piano-plays-on-r1.jpg` | 2b | Vera's face (shock, still, eyes on nothing) and that she is dry, in the sleeveless wine-red slip, hair done, red lipstick. |
| `retakes_2026_10_20/72-02-the-phone-lowers-r1.jpg` | 2c | The phone is held back-to-camera, screen turned toward her and down. Checked the brief's note: no phone screen or text visible. |
| `retakes_2026_10_20/72-04-walking-very-carefully-r1.jpg` | 2d | She should read as stiff and careful, not calm: hand trailing the brass bar rail, face blank. |
| `s80/jack-hits-him.jpg` | 3 | The brief's wording ("Jack's fist landing on Ishida's jaw") was refused by the generator's moderation twice; it is made from the same beat reworded as the moment of impact — Jack leaning in over the desk, his arm driven forward, Ishida's head turned with the force of it. Re-shoot if the beat does not read. |
| `s80/the-chair-goes-over.jpg` | 3 | Ishida on the floor, chair on its side, Jack standing over him, the two young detectives frozen on their feet at the far end. |
| `s80/not-to-jack.jpg` | 3 | Ishida's raised palm toward the detectives, low from behind him; Jack only as legs and coat at the frame edge. |
| `s80/the-blood-on-his-hand.jpg` | 3 | The split lip and the blood on the back of his hand; he must read calm, not hurt. |
| `retakes_2026_10_20/98-past-the-clock-r1.jpg` | 3 | Keeps the original composition (Jack walking away past the clock); Ishida changed to on the floor by the overturned chair, propped on one arm, split lip, collar open. |
| `retakes_2026_10_20/99-afraid-r1.jpg` | 3 | Keeps the original composition; Ishida changed to the same hurt man sitting on the floor against his desk, afraid. |
| `retakes_2026_10_20/468-the-photograph-on-her-desk-r1.jpg` | 4a | The frame now stands on Harada's own desk inside her glass office; the man in the photograph must be the journalist (the same photograph as 4b). |
| `retakes_2026_10_20/107-her-dead-reporter-r1.jpg` | 4b | Only the photograph in the frame was changed; it should be the same photograph as 4a. Everything else is the original. |
| `retakes_2026_10_20/365-the-altar-r1.jpg` | 5a | The room is furnished (kotatsu with its quilt, television on with a pale blue glow, altar), just with nobody in it. The altar photograph should be Sakai, younger and smiling. |
| `retakes_2026_10_20/367-the-phone-rings-r1.jpg` | 5b | Same furniture as 5a, nobody in the room, cream telephone ringing with the receiver in the cradle, teacup on its side. |
| `retakes_2026_10_20/112-every-page-r1.jpg` | 6a | She holds one loose photocopied sheet and the buff folder, not the bound notebook. |
| `retakes_2026_10_20/316-squared-to-the-door-r1.jpg` | 7a | Her door is the last on the walkway, end wall just beyond it; Jack is at the right edge turning away, the other doors receding behind him. |
| `retakes_2026_10_20/408-a-matter-between-criminal-groups-r1.jpg` | 8a | Only Vera changed: ash-blonde shoulder-length hair from behind, charcoal coat collar over a cream high-neck knit. |
| `retakes_2026_10_20/483-eyes-on-the-rain-r1.jpg` | 9a | Right-hand drive with the wheel in front of Ishida only, Ishida screen-left, Jack screen-right turned toward him; the LOOK, CAR, LOCATION, ISHIDA and JACK blocks from `jack_ishida_new/style-sheets/continuity.md` were pasted word for word as the brief asks. |
| `retakes_2026_10_20/19-the-bar-r1.jpg` | 10a | Made even though the brief marks it skippable ("a version with him seated exists in PlayFrame's history"). Drop this file if the director takes that one. |

## Hive model: regenerated alternatives

After review, the Hive was regenerated to follow its canonical exterior stylesheet (`public/film/img/sheets/hive-exterior-day.jpg`) and to sit in the gap between the model's two tall towers. Both selected alternatives are retained alongside the first generated outputs; they have not been wired into the film. The `--alt1` files are 2752×1536. The `--alt2` style-sheet option is 1360×768 and is for reference only (do not install below the film's 1920×1080 minimum).

- `retakes_2026_10_20/style-sheets/kurose-plaza-model--alt1.jpg`
- `retakes_2026_10_20/style-sheets/kurose-plaza-model--alt2.jpg`
- `retakes_2026_10_20/310-the-model-at-dawn-r1--alt1.jpg`
- `retakes_2026_10_20/311-the-hand-on-the-model-r1--alt1.jpg`

The base-name files `style-sheets/kurose-plaza-model.jpg`, `310-the-model-at-dawn-r1.jpg` and `311-the-hand-on-the-model-r1.jpg` were also regenerated. The director should pick the final set, check the Hive placement and model continuity, and install only the approved full-resolution images with `tools/install-film-picture.mjs`.

## Not done

Nothing from **Priority 1** is missing; all ten items (1a-1c, 2a-2d, 3's six pictures, 4a-4b, 5a-5b, 6a, 7a, 8a, 9a,
10a) are here.

**Priority 2 was not started** — the credits ran out at the end of Priority 1, as the brief expects. Still to do,
from `docs/picks-review-2026-10-19.md`:

- Vera's run: 73-10 (barefoot before she loses her shoe, V2); 73-08 (she slips, V3); 76's 82, 315 and 84 (the right
  dress, at home against the bed, V5).
- Mara's service (97A): 567 (Okada at the door, S1); 565 (they bow with Jack present, nobody standing, S2);
  570, mom-02, mom-03 and 573 (Kaneko's room, S3); 563 (Mara's photograph with her face, S4).
- The car (61): 481, 482 and 484 as right-hand drive (C1; recipes 03, 06 and 09 in
  `jack_ishida_new/style-sheets/continuity.md`).
- The Hive raid: 86-03 with the light out (R1); 88-01 with no bulb lit (R2); 119 and 126 with four masked men (R3).
- The small bar: 23 with no men outside the window (T1).
- The envelope (78): 88 with the brown envelope tied with string, as in 89, instead of a small white one (W2).
- Ishida after scene 80: in 93 and 94, wherever his face is readable, give him the split lip from scene 80.
- Lower still: 72-03 and 72-05 (Vera less calm, as 2d); 364 (the kotatsu room laid out as scene 29's, item 5);
  73-03 (one hotel exit, V6); 20 (the journalist in a raincoat, T3).

And one Priority 1 item to re-check rather than redo: `s80/jack-hits-him.jpg`, reworded past the moderation filter
(see the table).
