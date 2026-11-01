# Editorial Cuts — Project Notes (`Nobody's Witness`)

Scarlet Keyframe Studio provides six non-destructive selectable film versions via the topbar cut selector dropdown (`data-testid="topbar-directors-cut-btn"`). Every cut is constructed deterministically from `project.originalStory` without mutating any underlying `beat.text`, story dialogue, or existing snapshots, and switching between cuts preserves undo/redo history as well as the current narrative beat/scene under the playhead.

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

## 6. Jack's Noir — Narrated Cut (`"jack-noir"`)
- **Source**: Original Uncut in full (all 1,584 beats, running order and recreated coverage), built non-destructively from `project.originalStory`. **No new pictures and no new sounds**: every picture and sound file it uses already exists in the film (`src/core/jack-noir-cut.test.ts` checks this). Code: `src/core/jackNoirCut.ts`.
- **Colour & contrast**: each scene gets a mood from what it carries (title, heading, ambience, effects): `blue` midnight-teal (loneliness, cold rain), `amber` sodium (artificial light), `red` neon-noir with a red point light (danger: the inn raid and the shootings), `green` cool grade with a sickly green light (police, interview, newsroom, Kurose, Harada), `muted` desaturated (bleak daylight, aftermath). Neon scenes add magenta/cyan points. Close emotional lines get a stronger vignette.
- **Camera** (keyframes, the film's only camera): slow Dutch tilts on tense beats (1.6–3.1 degrees, zoom raised so no edge shows), push-ins on fear / suspicion / guilt lines, a slow tilt for Kurose (power) and for Vera / Mara when afraid, a sideways drift on reflection beats (mirror, puddle, glass, window). Only treated beats get their camera replaced; every other beat keeps the film's own move. Real low/high angles cannot be made from existing pictures: the tilts are an approximation.
- **Lighting**: existing overlays only: venetian blinds (offices, interview rooms, hotel, apartments), backlight rim (wet streets), key slash (raid), eye light (emotive close lines), neon points.
- **Sound** (existing files only): music drops out for 2.4 s after gunfire (silence) and steps back under voice-over; distant sirens on one wet night; echo is a faint slap-back made from copies of the same clip (footsteps in stairwells, viaducts, rooftops and the Hive, and Jack's voice-over); J-cuts lead the picture where there is room; L-cuts cut away up to 0.8 s before a voice-over line ends, 0.35 s on a few others, only into a silent beat of the same scene.
- **Pacing**: Original Uncut leaves 0.54 s of silence after every spoken line and about 1.75 s after a scene's last line (`AFTER_VOICE_SECONDS` plus the scene transition). Jack's Noir cuts that to 0.25 s and about 1.15 s (room for the transition is kept); the last words are never clipped. Runtime 105.7 to about 101.9 minutes. Silent narrator beats keep their reading time.
- **Voice-over**: Jack's own recorded reflective lines (long lines and "I promised", "twenty years", "I'm sorry", "my statement"...) are treated as voice-over: they lead and trail the picture, carry the echo and the music ducks under them. This is not a narration track: a real narration needs new recordings.

