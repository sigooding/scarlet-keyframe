# Editorial Cuts — Project Notes (`Nobody's Witness`)

Scarlet Keyframe Studio provides four non-destructive selectable film versions via the topbar cut selector dropdown (`data-testid="topbar-directors-cut-btn"`). Every cut is constructed deterministically from `project.originalStory` without mutating any underlying `beat.text`, story dialogue, or existing snapshots, and switching between cuts preserves undo/redo history as well as the current narrative beat/scene under the playhead.

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

## 3. 1950s Noir Director’s Cut (`"noir-1950s"`)
- **Editorial Vision**: Cohesive classical 1950s silver-gelatin black-and-white noir (*Touch of Evil*, *The Big Combo*, *Stray Dog*) — high-contrast lighting, deep shadows, deliberate studio pacing, and restrained nocturnal sound without novelty effects.
- **Silver-Gelatin Monochrome Visual Treatment**:
  - `.cin-grade-noir-1950s` panchromatic B&W optical curve (`grayscale(1) contrast(1.38) brightness(0.91)` + neutral silver-selenium `NOIR_1950S_WASH`, `gradeStrength: 1.0`) applied uniformly across **100% of shots**, including `<video>` studio leaders (`nw_intro`, `nw_logo`), WebGL/2D depth-parallax plates, and foreground cutouts.
  - Colored point-light and colored lens-flare overlays (`lights`, `lightSource`, `lightColor`, `lensFlare`, `flares`) are stripped from `beat.cinematic` so no chromatic tint bleeds over the monochrome frame.
  - Rich panchromatic Tri-X 35mm grain (`0.068`), deep spherical lens vignette (`0.48–0.55`), `motes` `0.35`, `2.35:1` letterbox bars with monochrome silver speaker labels (`.cin-caption.is-monochrome`), and classic centered monochrome studio intertitles (`A SCARLET REEL PICTURE / NOBODY’S WITNESS`, `THREE DAYS LATER`, `FIVE DAYS LATER`, `WEEKS LATER`, `THE END`).
- **Period-Inspired Pacing, Camera & Optical Transitions**:
  - Weighty 1950s dramatic rhythm (`+1.05s` noir, `+1.35s` contemplative, `+1.60s` scene-closing curtain holds; `84f` establishing holds; `152f` opening-title plates; `468f` hold on `nw_b1296` leaving a `2.0s` silent hold after *"Everyone is allowed one."*; `180f` slow fade-to-black `THE END` card).
  - Zero modern `speedRamp`s; ~76% locked classical studio tripod compositions and ~24% unhurried studio dolly pushes (`1.012 -> 1.044`, `ease-in-out`), strictly edge-clamped.
  - Classical optical laboratory `dissolve`s (`speed: 0.68`) across day/night & location shifts and curtain `dip-to-black`s (`speed: 0.72`) at act boundaries.
- **Restrained Atmospheric Sound**:
  - Classical straight dialogue cuts (gentle `-80 ms` breath softening only when `>= 800 ms` silence precedes; zero voice overlaps).
  - Hushed, moody period score (`gain <= 0.40`, `3,200 ms` fade-in / `3,600 ms` fade-out), quiet rain and room-tone beds (`gain <= 0.26`), and understated diegetic foley (`gain <= 0.48`).

---

## 4. Original Uncut Import (`"uncut"`)
- Restores the raw `1,584`-beat source assembly from `project.originalStory` prior to editorial consolidation, camera authoring, or optical grading.

---

## Selectable Cut, Mastering & Screening Options
Every period craft, mastering, and editorial workflow enhancement is exposed as an independent, non-destructive selectable option (via the Topbar **Cut & Screening Options** menu, the viewer **Compare (`\`)** toolbar, and the **Export MP4** modal / CLI):

### 1. Visual & Period Craft
- **Aspect Gate (`2.35:1 Scope` · `1.37:1 Academy` · `16:9 Open`)**: Switch between `2.35:1` Scope letterbox bars, classic `1.37:1` Academy (`4:3`) side pillarboxing (`11.33%` matte bars with automatic title-card and caption safe insets), or open `16:9`.
- **2.5D Depth Maps on 9 New Shots (`s12` / `77A` / `s78`)**: Optional greyscale depth maps (`/film/depth/{s12,s77a,s78}/*-depth.jpg`) driving edge-clamped WebGL 2.5D parallax on all nine newly generated plates without shifting any frame timings.
- **Bespoke 1950s Monochrome Studio Crest Leader**: Optional `1920x1080` silver-gelatin Art Deco studio crest (`/film/img/leaders/scarlet-reel-1950s-crest.jpg`) on `nw_logo` with frame-driven fade-in/out over the exact `9.9s` (`238f`) leader slot so zero downstream shots or audio cues shift.

### 2. Sound & Mastering
- **Warm 1950s Optical-Print EQ (`85 Hz – 7.8 kHz`)**: Optional 3-stage Web Audio `BiquadFilterNode` chain (`85 Hz` high-pass, `+1.8 dB` @ `1.8 kHz` `Q=1.1` presence peak, `7.8 kHz` low-pass) shared across live `webAudioEngine` playback and `OfflineAudioContext` MP4 export (`--optical-eq` / `--no-optical-eq`).
- **Selectable Loudness Mastering (`Off` · `-16 LUFS` Theatrical · `-14 LUFS` Streaming)**: ITU-R BS.1770-4 K-weighted integrated loudness normalization with `-1.5 dBTP` (`-16 LUFS`) or `-1.0 dBTP` (`-14 LUFS`) lookahead peak ceiling (`--loudnorm off|-16|-14`).

### 3. Editorial & Screening UX
- **Per-Cut Saved Working State + Factory Reset**: Optional `Remember custom edits per cut when switching` stashes custom trims, keyframes, notes, and `audioClips` per cut slot (`savedCutStates`) across cut switches, paired with a one-click `Reset <Cut> to factory` control.
- **Instant Cut-Compare (`\` Hold / Toggle)**: Hold `\` (or click `Compare (\)` in the viewer) to preview the exact matching beat and normalized shot progress in any selectable reference cut (`Neo-Noir`, `Creative`, `1950s B&W`, or `Uncut`) without mutating the active project, timeline, or undo stack.
- **Embedded MP4 Chapter Markers (`FFMETADATA1`)**: Selectable `Embed MP4 chapters` (`--chapters` / `--no-chapters`) muxes timeline chapter/part markers (with scene-boundary fallback) directly into the `.mp4` container for QuickTime, VLC, and Apple TV scrub-bar navigation.

