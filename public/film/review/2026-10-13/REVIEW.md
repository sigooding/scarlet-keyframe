# Review — today's work (13 October 2026), Nobody's Witness

What this is: a check of everything `docs/handoff-2026-10-13-film-notes.md` claims, done on the
branch this session works on (`arena/eb61d9bb-scarlett-witness`, off `af26581` = the merged
handoff). Every picture named in the handoff was opened and looked at; the film data was rebuilt
from the committed sources and the checks were run.

**Nothing was deleted.** Every picture is where it was. The new takes made for the shots that did
not look right are in `fresh/` next to this file, together with the contact sheets (`01`–`12`) that
put each one beside the picture it would replace and the reference it was matched to.

## The two things you asked for

### 1. The scene-1 song — found and fixed

*The song in scene 1 loops through the whole movie but should end after scene 2.*

The song is **Glimmering Haze** (61 s), set on scenes 1 and 2 only
(`src/film/studio-edits.json` → `scenes.nw_s1` / `nw_s2`, `musicMode: track`, `musicLoop: true`).
The film data is correct: the scene after them sets the title song, and nothing in scenes 3–201
starts Glimmering Haze. So the cue itself is right — **the engine was letting the looping song
outlive its scene.**

**Why it happened.** A music fade in `src/game/Game.tsx` was a `requestAnimationFrame` loop on the
element's `.volume`. Frames only run while the page draws, so in a hidden tab, a minimised window or
a locked screen the ramp *stopped halfway* and never finished — and the music code hangs "pause the
old track and release it" on the ramp finishing. Frames are also called back at a lower rate (or not
at all) on a machine that is busy, which is exactly when a slow computer is involved. The song that
was supposed to be crossfaded out kept playing under everything that followed, in a loop, until
another cue replaced it.

**The fix** (new `src/game/audioFade.ts`; `Game.tsx` now uses it):

* every fade gets a wall-clock deadline as well as frames — a ramp always lands even if no frame is
  ever drawn;
* `document.visibilitychange` settles every ramp in flight the moment the page is hidden;
* the equal-power crossfade curves, the mixer behaviour and the Studio's fade fields are unchanged.

It would also have shown up as a **second** symptom: the *new* track never reached its level when the
page was hidden, because its fade-up never finished either.

**Proof.** `scripts/.tmp-music-trace/` (throwaway harness, mounts the real player on the real film):

| run | what happened |
|---|---|
| frames running | reached the titles; Glimmering Haze **paused**, title song playing |
| frames stopped from the start (hidden-tab emulation), **before** the fix | the song was still `playing` under the titles **and** the title song's fade-up stuck at volume 0.00 |
| frames stopped, **after** the fix | the song is **paused** at the hand-off and the title song is up at full level |

`npm run test:engine` gained six checks ("Music fades land without a frame"): a ramp with no frames,
the hidden-page settle, a frame-driven ramp, and a cancelled ramp. Remove the deadline line and the
suite goes red — the checks are not just reading the source.

### 2. The slow backend engine

Measured first, so the guesswork is out of it:

| what | measured |
|---|---|
| the whole app's JS after `npm run build` | **3.5 MB single-file HTML** (836 KB gzipped) — every story, every picture list, the Studio |
| the film's data (`nobodysWitnessFilm.ts`) | 733 KB; importing it **~20 ms**, JSON clone 6 ms, the media walker 4 ms, resolving its 1,810 media fields 27 ms |
| the film's media | `public/film` **381 MB**: pictures 175 MB, audio 107 MB, voice 45 MB, depth 30 MB, sfx 29 MB — plus `public/reels` 65 MB |
| the depth camera | redraws the full frame *every* animation frame (a 5-tap inverse warp in the fragment shader) for 88 shots |
| the documented export rate | ~4× the film's length at 24 fps **without** a graphics card (≈8 h for the whole film) |

So the engine's own compute is not the bottleneck — the media and the per-frame depth camera are.
On a machine where the browser draws with a software renderer (no hardware acceleration) every depth
shot is paid for on the CPU, and that is the most likely "slow" you are feeling. Two ways to tell
in five seconds:

1. `?story=nobodys-witness-film&animatic=1` in the browser — the start card prints the graphics
   renderer, and says so in words when it is software ("on, but drawn in software: turn on the
   browser's hardware acceleration").
2. `chrome://gpu` → if the WebGL renderer says **SwiftShader**, hardware acceleration is off.

Quick wins: turn hardware acceleration on (Chrome → Settings → System → "Use graphics acceleration
when available"); for an export use `--gpu`, `--fps 12` or `--parts N`; a smaller window costs less
per frame. If it is still slow with the GPU on, it is worth a separate pass to let a depth shot keep
its move but drop to a lower internal resolution on slow machines — that is a picture-quality
decision, so it needs your ok first.

## What the handoff got right (checked, one by one)

| handoff claim | verdict |
|---|---|
| No black transitions anywhere (every `fade-black` is `fade`, no black picture beats) | **yes** — 0 `fade-black`, 0 black gradient backdrops in the built film |
| Kaneko's pipe strikes quieter (0.9 → 0.3 on the raid, 0.4 → 0.12 on the pipe gallery) | **yes**, in `studio-edits.json` |
| The answerphone beep (scene 4) is wired to the BEEP beat, 0.6 | **yes**, file on disk |
| Scene 14A's two lines show the new text | **yes** — but the **voice takes are still the old words** (the handoff's own caveat); the subtitles and the sound disagree until they are re-recorded |
| Scene 17's money is "a little more than the bowl costs" with one note and a few coins | **yes** (`s17/360`) |
| Scene 54: Vera holds a loose photo, not a framed one | **yes** (`s54/220`) |
| Scene 70: the car is behind Mara and off to the side, the puddle has no reflection | **yes** (`s70/391`, `393`) |
| Scene 97A: Jack stands apart from Vera at the table | **yes** (`s97a/565`) |
| Hive escape: 381 shows a plank across the gap, 382 an iron pipe gallery | **yes** (`03-hive-escape-90-91.jpg`) |
| The shake is off those nine Hive-escape shots (128, 129, 131, 132, 133, 378, 379, 381, 382) | **yes — but see the note below**: only the `pictureLook` copy is off; the shots' own inline camera still shakes |
| Scenes 93–94: 137/138/139 share one car | **yes for the car; no for the frame.** See the notes |
| Scene 82's three new lines and three new pictures | **yes**, and there is a **fourth** beat the handoff does not mention (see notes) |
| Rebuilding from the committed sources reproduces `nobodysWitnessFilm.ts` | **yes** — a rebuild on the untouched tree produced a byte-identical file |
| `npm test`, `test:film-backend`, the browser spec, a preview had not been run | **run now**: `test:film-backend` was **RED** (see changes); everything else passes except the Black Mass Bride media checks, which need files that are not in this checkout (ignoring, as asked) |

## Changes made in this session

1. **`src/film/studio-edits.json`: `nw_s98` is now `{}`** (was `musicMode: track` +
   `what-made-you-you.mp3`). `npm run test:film-backend` was failing on today's build — 93 of 94
   checks passed, and the failure was exactly this: the film declared *What Made You, You* on the
   rooftop scene as well as on Mara's service, so the song starts twice, and the test
   ("the song starts once, on the run's first node") is red. Wiping the edit hands the decision back
   to the builder, which is what writes "the rooftop fades it out". **This is the point to overrule
   in one line if you want the song to carry into the rooftop** (keep the Scene-98 entry; then the
   test's expectation, not the film, is what changes).
2. **The fade fix** (`src/game/audioFade.ts`, `src/game/Game.tsx`) and its engine tests, above.
3. `src/data/nobodysWitnessFilm.ts` rebuilt from (1) — only the scene-98 music fields changed.
4. This review, the twelve contact sheets and the three fresh takes in `fresh/`.
5. `FILM.md` and the handoff note carry the fade fix and the checks above.

## Fresh takes (in `fresh/`, nothing in `img/` was touched)

Generated with today's master car (`s93/138`, `s93/137`) and the video-novel Kurose/Ishida as
references; 1376×768 like the pictures they stand beside.

| take | why | verdict of the new take |
|---|---|---|
| `s94-139-only-tea--fresh-take.jpg` | the master car in one shot, further along the same kerb | the same sedan, kerb and open rear door — a genuinely closer match than the current 139 |
| `s94-141-he-drinks--fresh-take.jpg` | today's note is that scene 94's **interior** does not match the exterior sedan; this is the crossing-frame take | the sedan door is right (red lamp, cream seats, wet chrome) and both men are in the shot — **but the older man is on the left now**, which swaps him with the 138/368 seat |
| `s94-368-the-door-closes--fresh-take.jpg` | the current 368 has Ishida's body passing through the seat and door pillar | the seat and pillar break are gone, Ishida is up on the edge of the bench — **but its cabin is darker and its glass shape is further from the reference than the current 368** |

See `11-car-takes-old-vs-fresh.jpg` for the side-by-side. **None of the three is an obvious
improvement to accept blind** — the current 137/138 exterior master is a different body shape from
the 93/94 interior because the interior was not generated from it, and that is a decision to make
with your eye on the sheet, not mine. If you pick 139 (or a mix), the next step is the depth rig
(below) and a re-check of the seat order across 137, 138, 139, 140, 141 and 368.

## Things the handoff does not say, or says differently

1. **`s132/132-the-gap.jpg` does not exist.** The picture is **`s90/132-the-gap.jpg`** (scene 90,
   inside the raid run). Scene 132 is scene 132, a different scene, and has no such picture.
   `s91/133-inches-apart.jpg` is right. Logged so the next pass is not sent to a folder that is not
   there. (Both are in `03-hive-escape-90-91.jpg`; the walkway picture the handoff worries about is
   `s91/132-the-rails-sing`, which reads fine.)
2. **The shake is off in two places only — one of them does nothing.** The picture's look
   (`pictureLook`) no longer shakes for those nine shots, but the film data has its **own inline
   camera** on every beat background, and that is what the player reads for those shots. 128, 129,
   131, 133, 378, 379, 381 and 382 still play with a shake (`shakeAmount` 0.1–0.35). `132-the-gap`
   is the only one where the shake is genuinely gone. If "shake cam off in the Hive escape" means all
   of them, that is a five-minute edit — say the word and it becomes all nine (and the same for the
   inn raid, which the handoff deliberately left shaking).
3. **Scene 82 has four new narration lines, not three.** "Jack walks in through the glass doors,
   determined. He doesn't stop.", "He comes down the aisle between the desks, eyes on the glass
   office at the back.", "Nobody stops him." and — from the old beat — "Nobody stops him." appears
   twice. Worth a look at the wording against the screenplay.
4. **The spanner line is in the screenplay, and that is where it lives now.**
   `src/film/story.json` scene 86 reads "Kaneko takes a spanner to the old iron water pipe by the
   stove. Three strikes were all it took: the alarm the Hive has kept for fifty years." The built
   film shows that line as the **raid caption for `123-fifty-years`** — but the raid's caption table
   in `studio-edits.json` has **no entry for that picture**, so the caption shown is a fallback.
   Worth making explicit so the next caption pass does not silently change it.
5. **A build warning, all by itself: `studio-edits: nw_s73 "over her own breath" already had
   /film/sfx/car-pass.mp3`.** The scene-73 `sfx` edit collides with the cue the Bad Guy run already
   gives that beat. Harmless, but it means one of the two was not needed (the handoff's own note says
   the car-pass plays right after the heels — that is the run's, not the edit's).
6. **`s20/346-the-bulb-hums.jpg` keeps its depth camera, and the camera is now showing the wrong
   picture.** The picture was regenerated (Mara's look), but the shot's `pictureLook` still carries
   the depth rig cut from **the old art**: the plate the camera draws has nobody in it, while the
   cut-out is old Mara. The moving version of that shot is visibly not the still. See
   `09-depth-rig-vs-new-picture-346.jpg`. **The same regeneration problem will apply to every
   picture regenerated since its depth rig was cut** — this is the new rule's edge case, not a
   mistake in today's work.
7. **`s93/137`, `s93/138` and `s94/139` are 1365×768**, not 1920×1080; the rest of that run is
   1920×1080. On a 1080p screen they are 30% softer than the shots around them, and the run cuts
   between them and 140/141/368. `s20/346-the-bulb-hums` has the same 1365×768 size.
8. **Two takes still to re-record** (the handoff's own note, unchanged): `s14a/342` says "I think
   it's a plate number" over the text "We have a plate number.", and `s14a/343` says "Call me when
   you go somewhere" over "Call me if you plan on going somewhere next time."
9. **Nobody has watched scene 97A or scene 98 in sequence**, and the new newsroom pictures have not
   been through a preview. `npm run test:film-backend:browser` needs Playwright's Chromium
   (`npx playwright install chromium`, or `PLAYWRIGHT_CHROMIUM_PATH=...`); it has not been run here.

## The filmmaker's own list, still open

* Mara's storeroom look still splits the scene three ways: **346** (new, pale blonde, dark navy
  jacket) joins 344/345/191/192/309/436/437 (pale blonde, oatmeal cardigan, grey-green jeans), while
  284/371/372 are the **older dark-haired** Mara — and 344/345/191 are **wider** than the rest, so
  the storeroom changes size from shot to shot. If 346 is accepted, 284/371/372 are the three that
  visibly do not belong (`04-scene-20-storeroom.jpg`).
* Scene 25A's "Too much" money is not in `287`/`288`/`448` — the till is not framed and no money is
  readable (`08-25a-breakfast-money.jpg`, bottom row).
* Scene 73 and 69 read as two Maras: Vera's run is **dark-plum dress, reddish hair** (69, 70, 387,
  388, 72) against her own dark-blonde hair and olive coat elsewhere; and 69/70 are the older
  dark-haired Mara while 236/279/496 are the pale-blonde one. `05-scene-73-and-69.jpg`.
* New (not in the handoff): the tavern in **`s69/496-meeting-her-at-ten`** differs from **236/279**
  in the same scene — a different table, bowl and coat on Jack.
* Scene 100 is consistent and unmistakable (one arch, one counter, one TV with the news) — the 6
  October pass holds; nothing needed.
