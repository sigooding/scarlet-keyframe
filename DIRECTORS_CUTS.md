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

## Future Optional Asset Notes
All four selectable cuts currently use 100% existing linked plates and audio with **zero missing-frame gaps**. If bespoke period or movement assets are desired in a future pass, the following optional replacements can be swapped in cleanly without structural changes:
1. **1950s Studio Leader (`nw_logo` in `"noir-1950s"`)**: Currently grades the existing `/film/video/scarlet-reel-logo.mp4` through `.cin-grade-noir-1950s` (`grayscale(1) contrast(1.38) brightness(0.91)`). A future bespoke 1950s monochrome searchlight/crest leader (`/film/video/scarlet-reel-1950s-bw.mp4`, `1920x1080`, 24 fps) could be referenced exclusively in `populateZeroBeatScenes(story, "noir-1950s")`.
2. **1950s Subdued Horn/Clarinet Cue (`nw_title` in `"noir-1950s"`)**: Currently uses the existing opening score cue mixed at a restrained `<= 0.40` gain with `3.2s` fade-ins. A future solo muted-trumpet / upright-bass cue (`/film/audio/opening-noir-1950s.mp3`) could be assigned on `nw_title` for the 1950s cut.
