# Editorial Cuts — Project Notes (`Nobody's Witness`)

Scarlet Keyframe Studio provides non-destructive selectable film versions via the topbar cut selector dropdown (`data-testid="topbar-directors-cut-btn"`). Every cut is constructed deterministically from `project.originalStory` without mutating any underlying `beat.text`, story dialogue, or existing snapshots, and switching between cuts preserves undo/redo history as well as the current narrative beat/scene under the playhead.

---

## 1. Neo-Noir Director’s Cut (`"neo-noir"`) — Default Baseline
- **Editorial Vision**: Contemporary Tokyo neo-noir paired with Yasujirō Ozu contemplative stillness.
- **Structure & Pacing**: Chronological cold open (`nw_intro -> nw_logo -> nw_s1 -> nw_s2 -> nw_title -> nw_prologue -> nw_s3`), `256` scenes consolidated into `690` continuous shots (~`55m 20s` at 24 fps) with balanced post-dialogue breathing room (`+0.62s` noir, `+0.92s` contemplative, `+1.25s` scene closes).
- **Visual & Camera Grammar**: `.cin-grade-tokyo-noir` cool slate-teal shadows and restrained warmth (`gradeStrength` `0.82–0.88`, `0.042` 35mm grain, `0.31–0.42` vignette, `motes` `0.35`, `2.35:1` letterbox with in-bar subtitles). ~58% tripod stillness; ~42% slow bezier push/pull/lateral camera moves strictly clamped inside picture borders.
- **Sound Mix**: `-240 ms` dialogue J-cuts where `>= 480 ms` silence precedes, `780 ms` ambient rain/room-tone sound bridges (`gain <= 0.38`), and `850 ms` musical score pre-rolls (`gain <= 0.56`).

---

## 2. Creative Director’s Cut (`"creative"`)
- **Editorial Vision**: Memory-framed psychological thriller structured in five explicit movements, contrasting taut investigative momentum against lingering elegiac stillness.
- **Structural Re-Ordering & Five-Act Architecture**:
  - **Cold-Open Memory Frame**: Re-routes `nw_logo -> nw_prologue -> nw_s1 -> nw_s2 -> nw_title -> nw_s3` (keeping all `256` scenes reachable with `0` running-order diagnostics). Kaneko's voiced memory of the Hive emerges out of darkness first, cutting directly from *"before the night in Kanda"* into the rain-slicked murder in `nw_s1`, followed by an expanded 10-plate lower-left dossier title sequence (`nw_title`).
  - **Five Movement Intertitles & Timeline Chapter Markers** (`align: "lower-left"` + `#c678dd` ruler markers):
    1. `PART I · THREE DAYS LATER` — **THE TORN STRAP** (`nw_s3`)
    2. `PART II · NORTH OF THE CITY` — **TWENTY YEARS OF JANUARIES** (`nw_s30`)
    3. `PART III · UNDER THE EXPRESSWAY` — **NINE O’CLOCK** (`nw_s61`)
    4. `PART IV · BEFORE DAWN` — **THE BLACK GLASS** (`nw_s77a`)
    5. `PART V · FIVE DAYS LATER` — **AFTER THE RAIN** (`nw_s98`)
- **Pacing, Camera & Transitions**:
  - Tighter thriller cadence in dialogue and raids (`+0.42s` noir / `+0.22s` action post-line breath, `28f` action cuts, `52f` noir establishing beats) paired with extended elegiac holds on grief (`+1.45s` contemplative scene closes; `448f` hold on `nw_b1296` with a deeper `1.01 -> 1.064` creeping push-in; `118f` hold on `nw_b1309`).
  - ~70% active single-camera choreography (creeping push-ins, diagonal approaches, lateral tracking drifts, environmental pull-backs, and `ease-hold` / `slow-out` / `impact-ramp` speed ramps), all edge-clamped.
  - Motivated transitions: `dip-to-black` into the memory prologue and chapter curtains, `whip` transitions into raid sequences (`nw_s14a`, `nw_s39`), and `dissolve`s across memory/funeral sequences (`nw_m18`, `nw_m53`, `nw_s53`, Mara's service).
- **Visual & Sound Treatment**:
  - `.cin-grade-sodium-amber` bleach-bypass split-tone (`SODIUM_AMBER_WASH`, `gradeStrength` `0.88–0.92`, `0.056` grain, `0.40–0.48` vignette, `motes` `0.35`).
  - Deep `-360 ms` psychological pre-lap J-cuts on spoken lines (`>= 620 ms` clear lead, zero voice overlap), `1,350 ms` rain/room-tone pre-roll bridges (`gain <= 0.42`), and enveloping `1,400 ms` score swells (`gain <= 0.62`).

---

## 3. 1940s Noir Director’s Cut (`"noir-1940s"`)
- **Editorial Vision**: Classic Hollywood 1940s noir photographed on the film’s **original running order** — the uncut chronological story assembly, consolidated but never re-ordered — in the silver-print monochrome of *Double Indemnity*, *The Maltese Falcon*, *Laura*, *Mildred Pierce*, and *The Third Man*: deep-focus lock-offs, low-key carbon-arc fixtures, five titled reels joined by optical dissolves, and a hushed period score.
- **Structure & Five Reels (original running order preserved)**:
  - Chronological cold open (`nw_intro -> nw_logo -> nw_s1 -> nw_s2 -> nw_title -> nw_prologue -> nw_s3`) intact; `256` scenes split into `1,152` continuous clips (`+449` shot/reverse-shot coverage clips over Neo-Noir’s `703`; `127,689` total frames).
  - Five film reels, each headlined by an in-frame decorative intertitle card (`monochrome: true`, double-rule design) with a matching bone-silver `#dcd2b8` ruler marker:
    1. `REEL 1 · Three Days in the Rain` — **THREE DAYS IN THE RAIN** (`nw_s3`, frame `7,087`)
    2. `REEL 2 · The Number 114` — **THE NUMBER 114** (`nw_s25`, frame `48,219`)
    3. `REEL 3 · Tyres on Gravel` — **THE COASTAL INN** (`nw_cut_inn-raid_01`, frame `65,079`)
    4. `REEL 4 · Nine O’Clock` — **NINE O’CLOCK UNDER THE EXPRESSWAY** (`nw_s61`, frame `78,582`)
    5. `REEL 5 · The Fortieth Floor` — **THE FORTIETH FLOOR** (`nw_s83`, frame `107,261`)
- **Silver-Print Monochrome & Period Low-Key Lighting**:
  - `.cin-grade-noir-1940s` high-contrast silver-print optical curve applied to **100% of the `1,152` clips** at `gradeStrength: 1.0` — including the `<video>` studio leaders (`nw_intro`, `nw_logo`) — with zero picture-edge clamping.
  - Low-key carbon-arc fixtures only: `silhouette-rim`, `key-slash`, `venetian-slats`, `eye-light`, plus volumetric light shafts on `897` shots; colored point lights, lens flares, crash-exposure flashes, and speed ramps stripped entirely (zero occurrences).
- **Classical Camera Grammar**:
  - **`> 84%` locked-off single-camera compositions** (`973` still clips vs `179` slow moving); deep-focus conversational coverage punches into static `≥ 1.2x` singles on `491` clips while the camera stays on the tripod.
  - Period-appropriate moves only: `51` subtle Dutch cants (`> 0.5°`, *Third Man*-style tension angles), `46` lateral dolly tracks (`|Δx| ≥ 6`), `63` slow dolly / clue push-ins (`Δz ≥ 0.25`) — and **zero whip pull-outs, zero multi-step zoom machinery, zero exposure crashes**.
  - Optical-lab transitions: `11` slow curtain `dip-to-black`s (`speed: 0.78`) at reel heads & act curtains, `70` stately lap-`dissolve`s (`speed: 0.74`) across location and day/night shifts, **zero directional wipes**.
- **Scene 77A Period Plate**: uniform `noir-1940s` grade with explicit `rainOnLens` and zero interior cabin light in Kurose’s sedan across all `7` beats (beat-level rain preserved; eye-light on `nw_b1296`).
- **Restrained Period Sound**:
  - Classical straight dialogue cuts: gentle `-80 ms` breath softening on one-third of eligible lines only when `≥ 800 ms` clear air precedes (`172` clips pre-lapped; **zero `≤ -200 ms` deep pre-laps**, no voice overlap).
  - Hushed period score (`gain ≤ 0.42`, `3,000 ms` fade-in / `3,400 ms` fade-out, `560 ms` score pre-rolls), quiet rain/room-tone beds (`gain ≤ 0.28`), and understated diegetic foley (`gain ≤ 0.50`) — including the diegetic gravel-tyres roll on the Reel Three head.
- **Bespoke 1940s Crest Leader**: the exact `9.9s` (`238f`) `nw_logo` leader slot swaps to a purpose-built Art Deco `1920×1080` searchlight studio crest (`/film/img/leaders/scarlet-reel-1940s-crest.jpg`, *“A Motion Picture in Five Reels”*) whenever the silver-monochrome studio crest leader option is enabled — zero downstream shot or audio shifts.

---

## 4. 1950s Noir Director’s Cut (`"noir-1950s"`)
- **Editorial Vision**: Cohesive classical 1950s Alfred Hitchcock & silver-gelatin monochrome suspense (*Vertigo*, *Rear Window*, *The Wrong Man*, *Notorious*, *Dial M for Murder*) — chiaroscuro monochrome lighting, *Vertigo* contra-zooms on psychological revelations, crisp static shot/reverse-shot character zoom coverage during conversations, surgical clue pushes, deliberate studio pacing, and restrained nocturnal sound.
- **Silver-Gelatin Monochrome & Hitchcock Chiaroscuro Lighting**:
  - `.cin-grade-noir-1950s` panchromatic B&W optical curve (`grayscale(1) contrast(1.38) brightness(0.91)` + neutral silver-selenium `NOIR_1950S_WASH`, `gradeStrength: 1.0`) applied uniformly across **100% of shots**, including `<video>` studio leaders (`nw_intro`, `nw_logo`), WebGL/2D depth-parallax plates, and foreground cutouts.
  - Frame-driven monochrome Hitchcock lighting (`cinematic.hitchcockLighting` in `FrameCinematicOverlays.tsx`, zero CSS transitions/animations):
    - `"eye-light"` — horizontal feathered silver catchlight slash across the character's eye-line with darkened perimeter (`Vertigo` / `Psycho` psychological close-ups).
    - `"venetian-slats"` — Robert Burks-inspired barred window-blind shadow slats across offices, apartments, and interrogation interiors (`The Wrong Man` / `Shadow of a Doubt`).
    - `"key-slash"` — stark diagonal shaft from an unseen doorway across darkened stairwells and corridors (`Dial M for Murder` / `Notorious`).
    - `"silhouette-rim"` — overhead streetlamp pool and crushed perimeter shadow on rain-slicked avenues, bridges, and black sedans (`Rear Window` / `Strangers on a Train`).
  - Colored point-light and colored lens-flare overlays (`lights`, `lightSource`, `lightColor`, `lensFlare`, `flares`) remain stripped so zero chromatic tint bleeds over the monochrome frame.
- **Hitchcock Camera Grammar & Static Character Dialogue Coverage**:
  - **12 True WebGL *Vertigo* Dolly-Zooms (Contra-Zooms)** (`cinematic.vertigoContraZoom: "recede" | "loom"` in `FrameDepthParallax.tsx`): holds the foreground subject steady around `focalPoint` while warping background perspective away (`"recede"`) or inward (`"loom"`) on curated psychological abyss/recognition moments (`nw_b14`, `nw_b33`, `nw_b55`, `nw_b60`, `nw_b251`, `nw_b324`, `nw_b726`, `nw_b1187`, `nw_song_bad-guy_49:nw_song_b41`, `nw_b1296`, `nw_b1317`, `nw_song_raid_18:nw_song_b13`), using real depth maps where present and a deterministic smooth Gaussian focal-subject depth field on 2D plates.
  - **Static Zoom Coverage on Talking Characters**: multi-turn character conversations on shared plates split cleanly into individual speaking-turn shots (`1,146` total clips; `+456` crisp razor-cut coverage shots over `690`), punching into edge-clamped static `1.28x–1.68x` medium singles, medium close-ups, and 180°-rule opposing shot/reverse-shot singles on characters' faces while periodically returning to the wide master (`1.00x–1.02x`).
  - **Signature Hitchcock Suspense Moves**: surgical *Notorious*/*Dial M* clue-isolate pushes (`1.06x -> 1.42x`) onto watches, letters, photographs, and scraps; *Rear Window* long-lens (`1.30x`) lateral surveillance pans on exterior observation plates; slow confession pushes (`1.06x -> 1.38x`) on extended monologues; and subtle `±1.65°` psychological Dutch cants during raid sequences — all 100% edge-clamped while preserving `> 88%` locked tripod/static compositions and zero modern `speedRamp`s.
  - Classical optical laboratory `dissolve`s (`speed: 0.68`) across day/night & location shifts and curtain `dip-to-black`s (`speed: 0.72`) at act boundaries, with razor-crisp hard cuts inside intra-scene dialogue coverage.
- **Restrained Atmospheric Sound**:
  - Classical straight dialogue cuts (gentle `-80 ms` breath softening only when `>= 800 ms` silence precedes; zero voice overlaps, identical microsecond voice alignment).
  - Hushed, moody period score (`gain <= 0.40`, `3,200 ms` fade-in / `3,600 ms` fade-out), quiet rain and room-tone beds (`gain <= 0.26`), and understated diegetic foley (`gain <= 0.48`).

---

## 5. Original Uncut Import (`"uncut"`)
- **The film's opening and ending play here too** (8 November 2026). `nw_intro`, `nw_logo`, `nw_title`, `nw_credits`
  and `nw_end` carry no beats of their own in `nobodys-witness-film.json`, and a scene with no beats plays nothing:
  only the editorial cuts used to fill them, so Original Uncut — and Jack's Noir and Jack's Narrated with it — opened
  cold on scene 1, with no Black Cove, no studio logo, no main titles and no credits. They are filled for every cut
  now (`OPENING_AND_ENDING_SCENE_IDS`). The two mid-film montages (`nw_m18`, `nw_m53`) stay the editorial cuts' own:
  dropping those into the Uncut would move every shot after them.
- The main titles play **between scene 1 and the prologue**, where the film puts them, not at the very top: scene 1's
  murder is the cold open. So the story's shots sit 44 seconds later than they used to in these cuts, while keeping
  every length and every gap between them (`src/core/recreated-uncut.test.ts` checks exactly that).
- Restores the raw `1,584`-beat source assembly from `project.originalStory` prior to editorial consolidation, camera authoring, or optical grading.

---

## Selectable Cut, Mastering & Screening Options
Every period craft, mastering, and editorial workflow enhancement is exposed as an independent, non-destructive selectable option (via the Topbar **Cut & Screening Options** menu, the viewer **Compare (`\`)** toolbar, and the **Export MP4** modal / CLI):

### 1. Visual & Period Craft
- **Aspect Gate (`2.35:1 Scope` · `1.37:1 Academy` · `16:9 Open`)**: Switch between `2.35:1` Scope letterbox bars, classic `1.37:1` Academy (`4:3`) side pillarboxing (`11.33%` matte bars with automatic title-card and caption safe insets), or open `16:9`.
- **2.5D Depth Maps on 9 New Shots (`s12` / `77A` / `s78`)**: Optional greyscale depth maps (`/film/depth/{s12,s77a,s78}/*-depth.jpg`) driving edge-clamped WebGL 2.5D parallax on all nine newly generated plates without shifting any frame timings.
- **Bespoke Silver-Monochrome Studio Crest Leader (1940s / 1950s)**: Optional `1920×1080` monochrome Art Deco studio crest on `nw_logo` with frame-driven fade-in/out over the exact `9.9s` (`238f`) leader slot so zero downstream shots or audio cues shift — period-correct `scarlet-reel-1940s-crest.jpg` (searchlights, *“A Motion Picture in Five Reels”*) on the 1940s cut, silver-gelatin `scarlet-reel-1950s-crest.jpg` on the 1950s cut.

### 2. Sound & Mastering
- **Warm 1950s Optical-Print EQ (`85 Hz – 7.8 kHz`)**: Optional 3-stage Web Audio `BiquadFilterNode` chain (`85 Hz` high-pass, `+1.8 dB` @ `1.8 kHz` `Q=1.1` presence peak, `7.8 kHz` low-pass) shared across live `webAudioEngine` playback and `OfflineAudioContext` MP4 export (`--optical-eq` / `--no-optical-eq`).
- **Selectable Loudness Mastering (`Off` · `-16 LUFS` Theatrical · `-14 LUFS` Streaming)**: ITU-R BS.1770-4 K-weighted integrated loudness normalization with `-1.5 dBTP` (`-16 LUFS`) or `-1.0 dBTP` (`-14 LUFS`) lookahead peak ceiling (`--loudnorm off|-16|-14`).

### 3. Editorial & Screening UX
- **Per-Cut Saved Working State + Factory Reset**: Optional `Remember custom edits per cut when switching` stashes custom trims, keyframes, notes, and `audioClips` per cut slot (`savedCutStates`) across cut switches, paired with a one-click `Reset <Cut> to factory` control.
- **Instant Cut-Compare (`\` Hold / Toggle)**: Hold `\` (or click `Compare (\)` in the viewer) to preview the exact matching beat and normalized shot progress in any selectable reference cut (`Neo-Noir`, `Creative`, `1940s B&W`, `1950s B&W`, or `Uncut`) without mutating the active project, timeline, or undo stack.
- **Embedded MP4 Chapter Markers (`FFMETADATA1`)**: Selectable `Embed MP4 chapters` (`--chapters` / `--no-chapters`) muxes timeline chapter/part markers (with scene-boundary fallback) directly into the `.mp4` container for QuickTime, VLC, and Apple TV scrub-bar navigation.

---

## 6. Jack's Noir Cut (`"jack-noir"`)
- **Source**: Original Uncut in full (all 1,584 beats, running order and recreated coverage), built non-destructively from `project.originalStory`. **No new pictures and no new sounds**: every picture and sound file it uses already exists in the film (`src/core/jack-noir-cut.test.ts` checks this). Code: `src/core/jackNoirCut.ts`.
- **Colour & contrast**: each scene gets a mood from what it carries (title, heading, ambience, effects): `blue` midnight-teal (loneliness, cold rain), `amber` sodium (artificial light), `red` neon-noir with a red point light (danger: the inn raid and the shootings), `green` cool grade with a sickly green light (police, interview, newsroom, Kurose, Harada), `muted` desaturated (bleak daylight, aftermath). Neon scenes add magenta/cyan points. Close emotional lines get a stronger vignette.
- **Camera** (keyframes, the film's only camera): slow Dutch tilts on tense beats (1.6–3.1 degrees, zoom raised so no edge shows), push-ins on fear / suspicion / guilt lines, a slow tilt for Kurose (power) and for Vera / Mara when afraid, a sideways drift on reflection beats (mirror, puddle, glass, window). Only treated beats get their camera replaced; every other beat keeps the film's own move. Real low/high angles cannot be made from existing pictures: the tilts are an approximation.
- **Lighting**: existing overlays only: venetian blinds (offices, interview rooms, hotel, apartments), backlight rim (wet streets), key slash (raid), eye light (emotive close lines), neon points.
- **Sound** (existing files only): distant sirens on one wet night; a faint slap-back echo made from copies of the same clip on footsteps in stairwells, viaducts, rooftops and the Hive (never on voices); J-cuts lead the picture where there is room; L-cuts cut away up to 0.35 s before a line ends, only into a silent beat of the same scene. **The music is never dipped for sound effects or voice**: the only ducking is the engine's own, under spoken voice.
- **Pacing**: Original Uncut leaves 0.54 s of silence after every spoken line and about 1.75 s after a scene's last line (`AFTER_VOICE_SECONDS` plus the scene transition). Jack's Noir cuts that to 0.25 s and about 1.15 s (room for the transition is kept); the last words are never clipped. Silent narrator beats keep their reading time.
- **No narration**: an earlier version treated Jack's own recorded lines as pseudo voice-over (echo, music ducking, longer J/L cuts); that was removed. A real narration track needs new recordings and is not part of this cut. (Jack's Narrated Cut, section 7, adds Jack's voice-over as captions only.)

---

## 7. Jack's Narrated Cut (`"jack-narrated"`)
- **What it is**: Jack's Noir Cut (section 6) with Jack's own voice-over, **JACK (V.O.)**, written in place of the screenplay's description, one scene at a time. **So far only scene 10** (Jack in his office, Vera's visit). Every other scene is exactly Jack's Noir (`src/core/jack-narration.test.ts` checks that scene by scene). Code: `src/core/jackNarration.ts`; the cut is built from Original Uncut like Jack's Noir, with the narration written into the story *before* anything is timed, so the audio clips, J/L cuts and camera all see the same beats the viewer plays.
- **Recorded, no new pictures**: the voice-over is shown as italic captions credited to `JACK (V.O.)` (a character `nw_jack_vo`, "Jack (V.O.)") and spoken in Jack's voice ("Narrator Lead", ElevenLabs eleven_v4, one take per line, `public/film/voice/narrated-jack/`; each op names its `audioUrl` and `audioSeconds`, and the beat is held for the take plus half a second). Nobody has listened to the takes yet.
- **How it is written**: `JACK_NARRATION` lists, per scene, three kinds of change to the film's silent narrator beats (they carry the pictures and sounds, so they are never deleted):
  - `replace`: the beat's caption becomes a line of Jack's voice-over. The beat is held at least as long as the film held it, and long enough to say the line (about 2.3 words a second, never under 2 seconds: 37 words are about 16 seconds).
  - `silence`: no caption on that beat; its picture, length and sound play on.
  - `add`: a new silent voice-over beat after a named beat, on the picture that is showing. After a scene's *last* beat it takes over that beat's way on to the next scene and the scene's transition time (the running order follows the last beat).
- **Scene 10 today**:

  | Where | What |
  | --- | --- |
  | `nw_b229`, `nw_b230`, `nw_b231` ("JACK (48) sits at the desk…", the lighter, no cigarettes) | **V1**, one line to a beat: "I'd stopped buying cigarettes years ago." / "Still carried the lighter." / "It gave me something to do while I decided what not to say." |
  | `nw_b232`, `nw_b236`, `nw_b238` (Vera's knock and arrival, Jack putting the rice ball down, her sitting) | no narration: Vera's arrival and their opening exchange play without it |
  | after `nw_b248` ("He doesn't answer. Another train passes. The blinds shiver.") | **V2** (37 words, about 16 s): "There's a lie you tell for money and a lie you tell because the truth would take too long. I'd been in business long enough to know the difference. That afternoon I was charging her for both." |
  | after `nw_b260` ("…sets it down, face up, and squares it to the edge of the desk.") | **V3**: "I said I was sorry. I was sorry. Just not about the thing she thought." (the photograph has landed on his desk and he has recognised Daniel; Jack's spoken "I'm sorry." follows) |

  The scene's other description captions (the clip on the desk, the photographs, "A beat.", Vera at the door, "Jack sits very still.") are still the screenplay's own words.
- **Moving V3 to the end of the scene** ("After Vera leaves. Jack remains seated."): change its `after` to `"nw_b278"`. A voice-over added after the last beat moves that beat's `afterBeat*` route and the dissolve time onto itself, so the film still runs on to scene 11 (`jack-narration.test.ts` covers that case on a small story).
- **Narrating another scene**: add a `SceneNarration` to `JACK_NARRATION` with the beat ids from `src/data/nobodys-witness-film.json`. Ids that are not in the film are reported (`report.missing`) and skipped, and the test fails until the plan matches the film.

---

## 8. The Witness Cut (`"witness"`)
- **Editorial Vision**: a grown-up procedural nocturne — Lumet's procedure, Mann's city at night. The camera is a
  witness: it never anticipates, it reacts late, and it stays on consequence. Built non-destructively from
  `project.originalStory` the same way as Jack's cuts (Original Uncut in full, all beats in the original running
  order). **No narration and no new sounds**; a picture the film does not show at that point is used only where a
  cue needs it (`src/core/witness-cut.test.ts` checks all three). Code: `src/core/witnessCut.ts`.
- **No narration** (11 November 2026): the screenplay's description — the narrator beats with no recorded voice,
  which Original Uncut shows as italic captions — is not shown. `1,031` captions are gone
  (`isWitnessNarration(beat)`: the narrator, with no voice). The beats themselves stay, with `captions: []`: they
  carry the picture change, the look and the sound effect, and their text is still their label in the editor.
  Spoken lines keep their captions, and so does dialogue that was never recorded (Kurose and Jack on the avenue,
  Mara's message).
- **Cues — the picture tells what the line told**: `WITNESS_CUES` lists the `42` narration lines that told the
  audience something it needs (writing in the scene, a clock, a name, what a man is remembering, a jump in time)
  and how the picture tells it now. The whole audit, with the lines that were knowingly left, is in
  `reviews/witness-cut-cues-20261111/`.
  - **In the film's own picture** (`24` cues): the shot's camera move pushes to where the cue is (`focus`) and
    arrives before the shot ends, and the beat is given the time to read it (`read`, `2.2–4.6 s`): VERA on the
    phone, the scrap, the tag `114`, MARA VOSS on the monitor, the clipping, KUROSE DEVELOPMENT, VERA VOSS on the
    envelope, Sakai's letter smoothed flat, EXCUSE ME, the receipts, the locker-room sign, SHIOHAMA, DANIEL
    VOSS, the clocks at 10:00, 8:52 and 11:52.
  - **A picture from elsewhere in the film, cut in** (`3` beats): what Jack is counting when "only two people
    knew" is two flashes of `1.6 s` (`s23/352-the-address` on `nw_b863`, `s36/208-come-back-safe-anyway` on
    `nw_b864`), and the avenue before dawn (`s77a/1290-predawn-avenue`) is on `nw_b1290`, which the film plays on
    a black frame.
  - **Four new pictures** (`7` beats), used by this cut only. Three were voted by the director:
    `s4/623-the-sign-behind-them` (the family photograph, closer: the 金子 sign behind them) on `nw_b81`, on
    `nw_b260` when Jack looks at the print, and as a flash on `nw_b357` when he sees the same sign in the
    sketchbook; `s11/624-the-same-sign` (Jack and Daniel Voss under that sign) in place of
    `s11/167-two-men-laughing` on `nw_b285–287`, and as a flash on `nw_b360` when Vera asks why he wants the book
    and he does not answer; `s27a/625-the-journalists-card` (TOTO SHIMBUN / コンドウ) on `nw_b712`. An `insert`
    is cut in for its beat only: the next beat shows what the film shows there. The fourth was not generated:
    `s18/626-the-letter-under-the-lamp` on `nw_b483` is the film's prop sheet of Sakai's letter
    (`props/sakai-letter`) graded to the desk lamp, held `6 s`, because not a word can be read in the film's own
    picture of the letter (`s18/283`, which follows as the look at the name on the envelope).
  - **Framed for the gate**: the cut is screened behind the 2.35:1 bars unless the screening options say
    otherwise, and the bars cover `12 %` of the height at the top and at the bottom. Every cue point is clear of
    them and of the 1.37:1 pillars (test). The voted `623` had the board against the top edge, under the bar: the
    installed file sets the same picture lower in a larger frame (`2144×1206`). Two things stay under a bar in
    2.35:1 and show in the other gates: the "1:07" in the corner of Mara's drawing (`nw_b609`) and the 12 on
    the clock at 11:52 (`nw_b1174`, the hands read). All of this is from watching the cut in the app: see
    "Watched on screen" in the review folder.
  - **Time**: a title over the picture, lower left, `4 s`, on the three jumps no picture could tell (THREE DAYS
    LATER `nw_b71`, FIVE DAYS LATER `nw_b1610`, WEEKS LATER `nw_b1661`); a `dissolve` into the beats the
    screenplay marked "later" (`nw_b390`, `nw_b430`, `nw_b787`, `nw_b1076`, `nw_b1671`).
- **Timing — a silent picture is held for what is in it, not for the time its caption took to read**
  (`WITNESS_SILENCE`). Consecutive narrator beats on one picture are one stretch of silence; its length is shared
  between its beats in the film's proportions, so a sound effect still falls at the same point of the shot.
  - **A new picture**: `2.3 s`, or `3.4 s` for the first picture of a scene; `+0.045 s` for each word the
    screenplay spent on it (up to `+1.6 s`) and `+0.35 s` for each further beat; at most `5 s` (`6 s` for a scene's
    first). When the picture runs on under the next line it gets `62 %` of that. Scenes with violence in them run
    at `×0.85`, elegiac scenes at `×1.2`, scenes with no dialogue at all at `×1.15`. `+0.4 s` on a death or tears,
    `+1.0 s` where the screenplay looks "for a long time", `+0.5 s` on a scene's last silent picture.
  - **A silent beat between two lines** on a picture that is already up: `0.7 s` (plus up to `0.4 s` for what
    happens in it); `1.0 s` where the screenplay marks it ("A beat.", "He doesn't answer.", "The honest answer is
    in the pause."); `1.6 s` for "a long pause"; at most `2.6 s` in a row; `+0.4 s` after a line that carries
    weight.
  - **Never cut off**: writing that has to be read, a short sound effect (its length `+0.2 s`, up to `2 s`; a
    longer one runs on over the cut after `1.5 s`), and nothing under `10` frames.
  - **Result**: the pictures nobody speaks over (316 shots) run `20.8` min instead of `36.0`, median `3.6 s`
    (`5.3 s` in Original Uncut), nine in ten at `6 s` or under (`15.5 s`); the longest this cut times is `7.8 s`
    (Original Uncut holds one picture for `28.4 s` of captions).
  - **Spoken lines** as before: ordinary tails cut from the Uncut's `0.54 s` to `0.33 s`; **reaction holds** of
    `~1.15 s` on lines that carry weight (grief, a confession, a lie owned up to), half a second more on a heavy
    last line of a scene; the last words of a line are never clipped (`>= 5` frames of air). **Hold-then-hit
    violence**: the silent beat before a violence effect is `+0.66 s` and locked off, the violent beat cuts in
    hard, the silent beat after is `+1.0 s`.
  - **On the beat**: in scenes 1 and 2 (`scene.musicSync`, the director's note of 21 October) every cut to a new
    picture in the steady part of *Glimmering Haze* lands on a beat (`31` cuts, within half a frame), by giving or
    taking time on the silent shot before it; a line is only ever given air.
  - **Sequences cut to music keep the film's lengths** (the songs, the raid on the inn, and a scene that plays
    inside one): no tail is tightened and no hold added there, so every cut stays where the film put it on the
    song. (Before this, 19 tightened lines moved the later cuts of *Hounds*, *Bad Guy* and *Coins Measure Time* by
    `0.3–5 s`.)
  - **Running time**: `115,291` frames, 1 h 20 min 04 s (Original Uncut: `157,044`, 1 h 49 min 03 s).
- **Camera — eye-level and patient, one move per shot** (`WITNESS_CAMERA`). A shot is a run of beats on one
  picture; it gets a single continuous move sized to its length, shared by its beats, so nothing resets where a
  line begins (the film's moves were timed for narration and would not finish in a shorter shot):
  - **Toward a cue** (`31` shots): zoom about the cue at `0.022`/s up to `1.12`, arriving at `72 %` of the shot.
  - **Creep-in** on confession and grief (`45`): `0.016`/s up to `1.12`. **Cant** on a spoken threat (`3`, never
    in daylight): under `2°`, zoom raised past the frame edge (`minZoomForRotation`).
  - **Drift** on silent observation and on pictures the film gave a lateral move (`149`): at a `1.06×` standoff,
    `0.55 %` of the frame a second, up to `3.6 %`. **Pull-back** on a scene's last silent picture (`41`).
  - Otherwise the kind of move the film gave the picture, at this cut's speed: **push** `0.013`/s up to `1.10`
    (`188`), or a **breath** of `0.006`/s on pictures the film left still (`100`). A shot under `30` frames holds.
  - Pictures with a depth map are re-projected rather than scaled: far-plane push `0.012`/s within
    `0.12 × depthAmount`, parallax `0.9`/s within `8 × depthAmount`; on a cue the push is centred on the cue.
  - **Violence** keeps its three beats: a locked tripod on the silent beat before (the move stops there and goes on
    after), an impact settle (`1.05 -> 1.005` in six frames) on the violent beat, a slow pull-back
    (`1.06 -> 1.00`) after.
  - Sequences cut to music keep the film's camera, except where a line in them earns a move. No whips, no speed
    ramps: as it plays, no shot zooms faster than `0.06`/s or slides faster than `2.5 %`/s outside the impact, and
    no picture edge is shown.
- **Light & grade — motivated practicals only**, from the existing overlays, by a per-scene setting read from
  what the scene already carries (title, heading, ambience, effects): `danger` and interiors in restrained
  `tokyo-noir`, wet night exteriors in `midnight-teal` with street rim light, muted daylight aftermath in
  `nolan-imax`; venetian slats in offices, a key slash in danger, volumetric shafts where the room rings, and the
  eye light reserved for confession close-ups (with `dofOnTalk`). Grain `0.035`, vignettes `0.26–0.5`, no neon
  circus. The look is laid over what each beat already shows, so a line spoken over a held picture keeps that
  picture's depth map and focal point.
- **Transitions — nothing decorative**: hard cuts. The film's crossfade into nearly every narrated picture
  (`481` beats, `0.9 s`) reads as a page turning under a caption and as a slideshow without one, so it is not
  used outside the sequences cut to music. What is left: a `dissolve` (`0.85`) where time demonstrably passes
  (scenes that open at dawn, in the morning or "days later", and the five "later" beats), a `dip-to-black`
  (`0.8`) into the elegiac scenes, and any other transition the film itself put on a beat.
- **Sound**: `-200 ms` J-cuts lead about half the eligible lines, only where `>= 600 ms` of clear air precedes
  (zero voice overlap); the score sits at `90%` with `>= 1,200 ms` fade-ins and `>= 1,800 ms` fade-outs,
  volume keys untouched, and is **never dipped for sound effects** (the engine's own ducking under spoken voice
  is the only ducking). No echo, no fabricated sound: every audio clip is an Uncut clip, and every sound effect
  is still on the beat that carried it.
- **One shot per picture**: consecutive beats of a scene that show the same picture are merged into one frame on
  the timeline — the 1,642 beats play as **754 shots** (324 merged shots carrying 888 folded beats). The first
  beat of a run carries the whole run (`mergedBeatIds` lists the beats folded into it):
  - **Nothing moves in time.** The shot's length is the sum of its beats, so the running time is unchanged
    (`115,291` frames) and the picture at every frame is the one it was. Every voice, effect, music and ambience
    clip anchored to a folded beat is re-anchored to the shot at the same millisecond, and each line's captions
    sit on the frames it is spoken (with its own speaker), as explicit captions on the shot.
  - **The camera runs on as one move.** The beats of a shot already share one move; where two moves still meet
    (the impact settle, a sequence cut to music), the second is eased in from the first's end pose. The impact
    settle on a violent beat is kept as the one deliberate jolt. No picture edge is shown at any frame.
  - **Light**: the shot keeps its first beat's set-up; a confession anywhere in it gives the whole shot the eye
    light, and depth maps / lights carried by a later beat are kept.
  - Only beats of the **same scene** are merged (scenes stay whole for the running order); gaps, title cards and
    moving pictures (`video:`) stay on their own. The scene route (`afterBeatTargetSceneId`, …) moves onto the
    shot that now ends the scene.
  - Code: `mergeSamePictureShots` in `src/core/witnessCut.ts` (the last pass);
    `applyWitnessTreatment(..., { mergeSamePictures: false })` builds the cut one beat per frame, which the tests
    compare the merged cut against frame by frame.
- **A project that already has the Witness Cut saved** keeps the cut it saved (the editor keeps each cut's
  working state). `Reset The Witness Cut to factory` rebuilds it; a project that has never opened the cut gets the
  new one when the cut is chosen.
