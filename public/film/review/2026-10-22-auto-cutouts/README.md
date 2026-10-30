# Automatic cut-outs, 22 October 2026

Made unattended by `tools/auto-cutouts.py` for the pictures of scenes 1, 2 and 72–76 that had no depth move. **Nobody has
looked at them.** Each picture has a review sheet here (`<picture>.jpg`: the picture, its cut-outs on green, the plate
with the people painted out, and the depth map). Look at the flagged ones first; to take one back out, delete its entry
from `docs/film-depth-layers.json` (`pictures` and `peopleInShot`) and the depth fields from its `pictureLook` in
`src/film/studio-edits.json`, then rebuild. Each gets the suggested move: truck, 0.4, over 14 s.

The run was done in two goes (the first was stopped after 70 pictures by the session's time limit; the second made the
rest), and this table joins both.

**76 made, 52 flagged, 4 left alone.** The flags are cautious: "person-like shape(s) still
found in the plate" is U2-Net seeing something person-shaped in the painted-in picture, which may be a real leftover or a
post, a coat or a reflection.

| Picture | Cut-outs | Flags |
|---|---|---|
| [01-backstreet](01-backstreet.jpg) | 1 | cut-out 1 runs to its box edge (may be clipped); 1 person-like shape(s) still found in the plate |
| [03-mara-walks](03-mara-walks.jpg) | 1 | 2 person-like shape(s) still found in the plate |
| [04-mara-phone](04-mara-phone.jpg) | 1 | 1 person-like shape(s) still found in the plate |
| [05-phone-off](05-phone-off.jpg) | 1 | 1 person-like shape(s) still found in the plate |
| [06-barbershop-doorway](06-barbershop-doorway.jpg) | 2 | 1 person-like shape(s) still found in the plate |
| [07-old-man](07-old-man.jpg) | 1 | 1 person-like shape(s) still found in the plate |
| [10-the-shot](10-the-shot.jpg) | 2 | cut-out 1 runs to its box edge (may be clipped); 1 person-like shape(s) still found in the plate |
| [11-sakai-mid-fall](11-sakai-mid-fall.jpg) | 1 | 1 person-like shape(s) still found in the plate |
| [12-masked-man-radio](12-masked-man-radio.jpg) | 1 | 2 person-like shape(s) still found in the plate |
| [13-taillights-gone](13-taillights-gone.jpg) | 4 | cut-out 2 runs to its box edge (may be clipped); cut-out 3 runs to its box edge (may be clipped) |
| [14-she-kneels](14-she-kneels.jpg) | 1 | 1 person-like shape(s) still found in the plate |
| [15-the-grip](15-the-grip.jpg) | 1 | 1 person-like shape(s) still found in the plate |
| [16-the-key](16-the-key.jpg) | 2 | cut-out 1 nearly empty; cut-out 2 runs to its box edge (may be clipped); 1 person-like shape(s) still found in the plate |
| [17-she-runs](17-she-runs.jpg) | 1 | 1 person-like shape(s) still found in the plate |
| [18-the-flashlight](18-the-flashlight.jpg) | 1 | 1 person-like shape(s) still found in the plate |
| [20-the-journalist](20-the-journalist.jpg) | 1 | 1 person-like shape(s) still found in the plate |
| [21-mara-bursts-in-v1](21-mara-bursts-in-v1.jpg) | 1 | cut-out 1 runs to its box edge (may be clipped) |
| [22-not-his-business](22-not-his-business.jpg) | 1 | 2 person-like shape(s) still found in the plate |
| [23-behind-the-counter-s2new2](23-behind-the-counter-s2new2.jpg) | 2 | cut-out 2 runs to its box edge (may be clipped) |
| [24-from-the-floor-s2new2](24-from-the-floor-s2new2.jpg) | 2 | 1 person-like shape(s) still found in the plate |
| [25-two-pairs-of-shoes-v2](25-two-pairs-of-shoes-v2.jpg) | 2 | 1 person-like shape(s) still found in the plate |
| [26-the-variety-show-s2new2](26-the-variety-show-s2new2.jpg) | 1 | cut-out 1 runs to its box edge (may be clipped) |
| [27-the-notebook-v1](27-the-notebook-v1.jpg) | 2 | cut-out 1 runs to its box edge (may be clipped) |
| [28-the-blue-glow-s2new2](28-the-blue-glow-s2new2.jpg) | 1 | cut-out 1 runs to its box edge (may be clipped); 1 person-like shape(s) still found in the plate |
| [308-clip-under-the-shelf](308-clip-under-the-shelf.jpg) | 1 | 1 person-like shape(s) still found in the plate |
| [328-the-scrap](328-the-scrap.jpg) | 1 | 2 person-like shape(s) still found in the plate |
| [330-the-red-clip](330-the-red-clip.jpg) | 1 | 1 person-like shape(s) still found in the plate |
| [332-the-sedan-blocks-the-lane](332-the-sedan-blocks-the-lane.jpg) | 1 | 1 person-like shape(s) still found in the plate |
| [333-the-white-light](333-the-white-light.jpg) | 4 | cut-out 4 runs to its box edge (may be clipped) |
| [383-the-empty-lane](383-the-empty-lane.jpg) | 2 | cut-out 1 runs to its box edge (may be clipped) |
| [497-eleven-fifty-two](497-eleven-fifty-two.jpg) | 1 | 1 person-like shape(s) still found in the plate |
| [498-open-shut](498-open-shut.jpg) | 1 | 1 person-like shape(s) still found in the plate |
| [499-the-screen](499-the-screen.jpg) | 1 | 1 person-like shape(s) still found in the plate |
| [502-why-didnt-you-tell-me](502-why-didnt-you-tell-me.jpg) | 1 | 1 person-like shape(s) still found in the plate |
| [547-the-call-still-lit](547-the-call-still-lit.jpg) | 1 | cut-out 1 runs to its box edge (may be clipped); 2 person-like shape(s) still found in the plate |
| [69-the-wait](69-the-wait.jpg) | 2 | 1 person-like shape(s) still found in the plate |
| [72-01-the-piano-plays-on](72-01-the-piano-plays-on.jpg) | 2 | 1 person-like shape(s) still found in the plate |
| [72-02-the-phone-lowers--r1](72-02-the-phone-lowers--r1.jpg) | 1 | 2 person-like shape(s) still found in the plate |
| [72-03-the-lighter-into-the-bag](72-03-the-lighter-into-the-bag.jpg) | 1 | 1 person-like shape(s) still found in the plate |
| [72-04-walking-very-carefully--r1](72-04-walking-very-carefully--r1.jpg) | 1 | 3 person-like shape(s) still found in the plate |
| [72-05-the-umbrella-stays](72-05-the-umbrella-stays.jpg) | 2 | cut-out 2 runs to its box edge (may be clipped) |
| [72-the-lost-heel](72-the-lost-heel.jpg) | 1 | 1 person-like shape(s) still found in the plate |
| [73-07-heels-on-wet-pavement](73-07-heels-on-wet-pavement.jpg) | 1 | 1 person-like shape(s) still found in the plate |
| [73-09-she-cannot-breathe](73-09-she-cannot-breathe.jpg) | 1 | 1 person-like shape(s) still found in the plate |
| [73-10-a-car-passes](73-10-a-car-passes.jpg) | 1 | 1 person-like shape(s) still found in the plate |
| [74-08-you-knew](74-08-you-knew.jpg) | 1 | 1 person-like shape(s) still found in the plate |
| [74-15-she-pushes-him-away](74-15-she-pushes-him-away.jpg) | 1 | 1 person-like shape(s) still found in the plate |
| [76-02-the-empty-umbrella-stand](76-02-the-empty-umbrella-stand.jpg) | 1 | 1 person-like shape(s) still found in the plate |
| [76-06-the-screen-goes-dark](76-06-the-screen-goes-dark.jpg) | 1 | 1 person-like shape(s) still found in the plate |
| [76-07-the-lighter](76-07-the-lighter.jpg) | 1 | 1 person-like shape(s) still found in the plate |
| [82-on-the-floor](82-on-the-floor.jpg) | 1 | 1 person-like shape(s) still found in the plate |
| [84-cries-without-a-sound](84-cries-without-a-sound.jpg) | 1 | 3 person-like shape(s) still found in the plate |
| [02-vending](02-vending.jpg) | 1 |  |
| [09-old-man-stops](09-old-man-stops.jpg) | 1 |  |
| [315-the-number-pressed](315-the-number-pressed.jpg) | 1 |  |
| [329-the-lane-the-watch](329-the-lane-the-watch.jpg) | 1 |  |
| [331-he-refuses](331-he-refuses.jpg) | 1 |  |
| [501-one-shoe](501-one-shoe.jpg) | 1 |  |
| [503-she-holds-on](503-she-holds-on.jpg) | 1 |  |
| [504-nobody-looks-down](504-nobody-looks-down.jpg) | 2 |  |
| [69-vera-runs](69-vera-runs.jpg) | 1 |  |
| [73-03-she-runs--69-vera-runs-v2](73-03-she-runs--69-vera-runs-v2.jpg) | 1 |  |
| [73-06-her-face--70-not-elegantly-badly-playframe](73-06-her-face--70-not-elegantly-badly-playframe.jpg) | 1 |  |
| [73-08-she-slips--70-not-elegantly-badly-playframe](73-08-she-slips--70-not-elegantly-badly-playframe.jpg) | 1 |  |
| [73-11-the-vending-machine--71-the-machine-glows-v2](73-11-the-vending-machine--71-the-machine-glows-v2.jpg) | 1 |  |
| [73-13-on-red](73-13-on-red.jpg) | 1 |  |
| [74-03-his-hands--r1](74-03-his-hands--r1.jpg) | 1 |  |
| [74-06-dont](74-06-dont.jpg) | 2 |  |
| [74-09-his-silence](74-09-his-silence.jpg) | 1 |  |
| [74-13-she-folds](74-13-she-folds.jpg) | 1 |  |
| [74-17-the-reflection](74-17-the-reflection.jpg) | 2 |  |
| [74-18-she-covers-her-face](74-18-she-covers-her-face.jpg) | 1 |  |
| [75-01-the-red-shoe](75-01-the-red-shoe.jpg) | 1 |  |
| [75-03-the-hive-shut--79-the-hive-shut-v1](75-03-the-hive-shut--79-the-hive-shut-v1.jpg) | 1 |  |
| [76-01-the-walkway](76-01-the-walkway.jpg) | 1 |  |
| [76-05-vera-honey](76-05-vera-honey.jpg) | 1 |  |

## Left alone

- `70-the-call`: its camera is a dolly-zoom (chosen; the engine skips depth there)
- `74-01-no-one-else-is-here`: nobody found: left as it was, since a missed person would stretch on a depth map alone
- `75-04-the-machines-wait`: nobody found: left as it was, since a missed person would stretch on a depth map alone
- `75-05-static-in-a-window`: nobody found: left as it was, since a missed person would stretch on a depth map alone
