# The closing news, as two frames (`2026-11-04`)

Request: the epilogue’s television beat contradicted `IMAGE_RECOVERY.md`, which says `nw_b1678` and
`nw_b1679` must be **two sequential TV frames — Kurose first, Ishida’s police portrait second.** As shipped,
`nw_b1678` carried a single picture with both men crammed onto one screen and `nw_b1679` had no picture of its
own. The same pass also covered the on-screen Japanese signage the request called out: that frame’s broadcast
chyron (耕ニンヌ) was invented nonsense.

[Open the numbered review gallery](index.html) · [Machine-readable manifest](manifest.json)

| # | Scene | Beat | Shot | Vote | Installed |
|---:|---|---|---|---|---|
| 1 | `nw_s100` | `nw_b1678` | The evening news on the set above the door: Kurose between his lawyers, cameras flashing | 2 ✓ | `/film/img/s100/1678-the-evening-news-kurose.jpg` |
| 2 | `nw_s100` | `nw_b1679` | The broadcast cuts to a formal photograph of Ishida in uniform | 2 ✓ | `/film/img/s100/1679-the-photograph-of-ishida.jpg` |

Both plates were voted between two candidates. Each used the shop plate
(`/film/img/s100/158-the-third-stool.jpg`) for the room, shelf and wardrobe and one identity reference only for the
face: `kurose_new/03-s94-door-stands-open.jpg` for Kurose,
`jack_ishida_new/style-sheets/refs/ishida-face.jpg` for Ishida. Both were prompt-blocked against lettering —
no chyron, no captions — because the old frame’s gibberish chyron is what the request objected to.

## Timing

The two frames **split the hold `nw_b1678` already owned**; nothing was added to the film.

| Beat | Picture | Hold |
|---|---|---|
| `nw_b1678` | the evening news | 4.71 s (113 frames) |
| `nw_b1679` | the photograph of Ishida | 7.00 s (168 frames) |
| `nw_b1680` | *held* on the same picture — “Nobody looks up.” | 1.50 s (36 frames) |
| `nw_b1681` | back to the shop, `158-the-third-stool` | 4.50 s |

Total duration, the 1,618-beat Uncut running order, every other picture, caption, voice and music cue are
unchanged. The Neo-Noir cut goes from 705 to 706 clips, which is the one test constant this pass moved.

`nw_b1680` (“Nobody looks up.”) now carries the portrait frame through its own hold rather than needing a third
picture: it is the shop not reacting to the man’s photograph, and the held frame is the photograph.

## Depth cameras

Both new plates are 9:16-safe 16:9 stills with a clean near/mid/far split, so each got its own voted depth map,
traced from that plate alone (no neighbouring frames), then trimmed, converted to genuine 8-bit greyscale,
resized to 960×540 and saved as JPEG quality 88 like the film’s other maps. Deployed as
`depthMotion: "push"`, `depthAmount: 0.22`, 10 s — deliberately soft, because the set is small in frame and the
brickwork behind it would otherwise shear.

- `public/film/depth/recreated-uncut/1678-evening-news-depth.jpg` (vote 1)
- `public/film/depth/recreated-uncut/1679-ishida-photograph-depth.jpg` (vote 2)

## The chyron, and the rest of the on-screen Japanese

The request asked for “a pass over on-screen Japanese signage generally”. What that turned up:

| Frame | What the lettering was | Action |
|---|---|---|
| `s100/158-the-third-stool` (nw_b1675–1677) | invented broadcast chyron on the inset TV | repaired |
| `s100/159-she-doesnt-turn` (nw_b1687) | the same chyron, widest instance | repaired |
| `s100/160-the-clip` (nw_b1684) | the same chyron | repaired |
| `s100/161-stool-three` (nw_b1683) | the same chyron — the frame nearest the news beats | repaired |
| `s100/1676-the-kaneko-sign`, `158`, `159`, `160`, `161` shop sign | 金子 (“Kaneko”) — correct, hand-painted, consistent | left alone |
| `props/kaneko-sign-board.jpg` | 金子 sign prop | correct |
| `props/jack-investigations-card.jpg` | ジャック・探偵社 / 東京都千代田区神田1-2-3 — correct Japanese, correct address form | correct |
| `props/shiohama-cassette-label.jpg` | “SHIOHAMA” in Latin caps, as labelled by hand | correct |
| `props/daniel-voss-clipping.jpg`, `props/sakai-letter.jpg` | English / cursive English | correct |
| `s1/06-barbershop-doorway.jpg`, `s93/137-he-knows-this-car.jpg` | shutter, barber pole, blank trim — no lettering | nothing to do |
| `s100/1682`, `s100/1685` | no television in frame | nothing to do |

The four repaired frames each had their **own pixels** locally defocused inside the lettering area, through a
feathered mask: a 60% downscale and back up plus a small blur. No pixels were copied between frames, nothing was
redrawn, lettered or imported, and the rest of each picture is untouched. Prior files are archived as
`/film/img/archive/s100/<name>--v4.jpg`; before/after crops are in [`chyron/`](chyron/).

Why defocus instead of painting: the band sits on a television 130–160 px wide, already out of focus. A soft,
tone-matched band reads as an ordinary unreadable news graphic, which is exactly what the shot wants; a
regenerated plate would risk lettering it again or discarding pixels that belong to the shot.

## What was not changed

- The superseded picture `s100/320-the-news-nobody-watches.jpg` is kept on disk (archived as `--v2`) but now runs
  on no beat.
- Its depth folder (`/film/depth/s100/320-the-news-nobody-watches/`) and the `pictureLook` entry in
  `src/data/studio-edits.json` are left as they are. That look is keyed by **picture filename**, and the same
  filename would now have to cover two different beats — retargeting it would give both the same camera and
  break the point of splitting them.
- Nothing else on the `IMAGE_RECOVERY.md` “still to recreate” list was touched by this pass.

## Validation

`npm test` — 647 passed, 24 skipped. Both media indexes are sorted, unique and list every new file; all new beat
paths and depth references resolve; `git diff --check` is clean.
