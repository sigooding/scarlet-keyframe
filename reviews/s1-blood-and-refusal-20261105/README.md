# Scene 1 — Sakai's refusal and the blood (TODO-FILM §1), 5 November 2026

Every picture below was chosen by the director from a 2-option vote, per the standing rule.
Installed with the house rules: nothing overwritten without an archive, nothing downscaled,
new pictures get new file names, both media indexes updated.

## Installed

| Picture | Beat | Vote | sha256 |
|---|---|---|---|
| `s1/384-he-half-turns.jpg` (new) | `nw_b25` | option 1 of 2 | `2dc991c3…ae0a68` |
| `s1/385-he-turns-the-other-way.jpg` (new) | `nw_b1722` (inserted) | option 1 of 2, second pair | `dd6032d4…55730b` |
| `s1/15-the-grip.jpg` (retake, stream of blood in the water) | `nw_b42` | option 1 of 2 | `8f4d20ea…1db5b17f…` → `8f4d20eaebe372c4a6af5c9163e1db5b95942805b4f9d4132eda94d3d875855730b` |
| `s1/386-the-puddle-leaking-blood.jpg` (new) | `nw_b1724` (inserted after `nw_b46`) | option 1 of 2, fourth pair (ground-level framing per director) | `db054ff0…6fe17` |
| `s1/14-she-kneels.jpg` (retake, dye under Mara's hand) | `nw_b39` | option 1 of 2 on the palm crop | `62397f22…bc5614d9` |

Full digests are in the commit; the table above is abbreviated.

## Beat wiring (scene 1)

- `nw_b25` now plays `384` with "Then he shakes his head. Barely."; inserted `nw_b1722` plays `385`
  with "A man refusing a stranger."; inserted `nw_b1723` carries the old wide `331-he-refuses`
  (with its existing depth camera) and "And he turns his back on her, slowly, to face the road."
  The two close frames cut together read as the shake the director asked for; the old line is
  only split at sentence boundaries, no words changed.
- Inserted `nw_b1724` after `nw_b46` (the key): "On the pavement: a puddle of rainwater, leaking
  blood." — the director's own words, picture 23 in their count, pushing she-runs and the open
  bag to 24/25.
- New beats carry no depth map (so no cut-outs were needed for them, per `docs/depth-camera.md`
  rule as recorded in TODO-FILM).

## The knees retake, and why it is a composite

Eight full-frame or crop edit attempts on `14-she-kneels` failed on every model ("red dye",
"scarlet dye", "dark thick red liquid", paint-packet phrasing, 2730×1536 and 1920×1080 sources,
face-free crops). The colourless prompt "the hand is leaking dye" passed on a palm-only crop
(`crop-14-palm.jpg`), and the director voted option 1 (`vote-14-she-kneels-palm.jpg`). The dye
came out glossy black; a hue-shifted scarlet variant was built for comparison and rejected by
the director ("never mind i like the black one").

Because the edit re-rendered the crop's folds, only the dye itself was transferred: a strict
luminance mask (threshold 10 %, negated, closed, boxed to the stain, feathered) lifted the dye
pixels from the voted take onto the original coat under her palm, pasted back with a feathered
box. The full frame is otherwise pixel-identical to the picture it replaces.

Depth: `nw_b39` keeps its depth camera. `depth/s1/14-she-kneels/plate.jpg` and `cutout-1.png`
were updated with the same stain through a difference mask against the archived picture, split
by the cut-out's alpha (plate gets the stain where no cut-out covers, cut-out where it does);
`depth.png` is unchanged because the geometry is unchanged. Old layers archived under
`public/film/depth/archive/s1/14-she-kneels/` as `plate--v1.jpg` / `cutout-1--v1.png`.

## Archives made

- `archive/s1/15-the-grip--v4.jpg` — the picture the grip retake replaces (v1–v3 are older takes;
  an earlier command in this session briefly clobbered the historic `--v1` of both pictures and
  it was restored from git before archiving continued).
- `archive/s1/14-she-kneels--v5.jpg` — the picture the knees retake replaces.
- `depth/archive/s1/14-she-kneels/plate--v1.jpg`, `cutout-1--v1.png`.
- `331-he-refuses.jpg` still plays (on `nw_b1723`), so it was neither overwritten nor archived.

## Votes log

1. `384` head half-turn — pair offered, option 1 picked.
2. `15-the-grip` blood stream — pair offered, option 1 picked.
3. puddle — three pairs skipped; director set the framing by question (ground-level, low) and
   the phrasing ("dark thick red liquid"); fourth pair, option 1 picked.
4. `385` head the other way — first pair skipped, second pair (near-profile, other side) option 1 picked.
5. knees palm dye — colourless "dye" pair, option 1 picked; scarlet hue-shift variant rejected in chat.

## Validation

`npx vitest run` green after updating three count pins (1618→1621 uncut frames, 706→709 Neo-Noir
clips) in `turn21`/`turn28`/`turn32`; both media indexes sorted, unique and listing every new
picture and archive; thumbnails regenerated with `npm run thumbs`.
