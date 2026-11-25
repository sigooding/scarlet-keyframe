---
name: whole-shot-lipsync
description: Make lip-sync video for a Nobody's Witness / Scarlet Keyframe shot as ONE clip covering the whole shot, so the shot never cuts. Use this whenever the user asks for lip sync, a talking shot, a character speaking on camera, Aurora / HeyGen / MiniMax / OmniHuman / Seedance lip sync, "make them talk", or dialogue video, and above all when one actor stays on camera while another person also speaks in the shot, or one picture runs over several beats, or the user asks about silence or timing in a lip sync, even if the user never says "whole shot".
---

# Whole-shot lip sync

## The rule

When a shot stays on one actor while someone else also speaks in it, make **one** lip-sync clip for that actor's whole shot:

- the voice track runs the shot's exact length;
- it holds only the on-camera actor's lines, each at the moment it is spoken in the film;
- every other voice is taken out, and its gap keeps the scene's own room tone (silence only where the scene has none), so the timing is kept;
- where the model takes a prompt, it says the actor stops and listens through those gaps, and can time one clear gesture.

Why: a clip per line forces cuts or freezes inside the shot. One take with the pauses kept reads as one continuous performance, and it stays in step with the film, whose mix still plays the other actor's voice.

## The method (the user's choice from Nov 2026)

The passport-shot test settled it. The user found the result good, and better quality than before.
1. **Track:** the speaker's lines at their film times, with the scene's room tone in the gaps. This is the track script's default. Silence works too: the eight earlier HeyGen clips all had silent gaps, including the 10/10 one. No shot has been made both ways, so neither is proven better. Room tone is the default because it's the scene's real sound and the user liked the result.
2. **Model:** HeyGen Avatar 6 Turbo. It's the best quality of every model tried (the user scored it 10/10), and also the cheapest.
3. **Prompt:** the performance, plus at most one clear gesture timed in clip seconds (*"at about 5 seconds she glances down at the table, then back up"*).
4. **Speaker not in the picture:** cut to their close-up for the line, and let the shot's own picture or clip play before it.
5. **Check:** `mouth_check.py` should give a ratio of 5 or more and a lag within ±120 ms. `cue_check.py` shows whether the gesture landed.

## Steps

1. **Check the face.** Look at the shot's picture before spending anything. The face on camera must belong to the speaker: a phone shot once showed Mara while Vera's voice played. One clear face is best; with two faces some models animate the wrong one. Some shots have no speaking face at all:
   - a point-of-view shot whose only face is a photograph (scene 6, Vera holding out Mara's passport photo; lip-synced, the photo would talk);
   - an over-the-shoulder shot with the mouth out of view (scene 14, Jack turning the sketchbook page);
   - a wide two-shot with small faces in profile (scene 6, the interview room).

   Those get a motion clip instead (the `kling-video` skill).

2. **Build the track.**
   ```bash
   npx vite-node .claude/skills/whole-shot-lipsync/scripts/shot-voice-track.ts <beatId> <speaker> <scratchpad>/track.mp3 [--bed] [--from <frame>]
   ```
   `<speaker>` is the name in the voice files (`/film/voice/<scene>/<nn>-<speaker>-<words>.mp3`), e.g. `vera`, `jack`, `kaneko`. It prints the shot's length and who speaks when; a line marked "off the track" is where the actor listens. It also writes `<track>.json` for step 5.
   - By default the scene's own room tone runs under the track (its ambience, at its film level and loop point, never another voice). The gaps then hold the real scene instead of digital silence. `--silent` leaves them silent. `--with-sfx` also lays in the scene's sound effects; that's untested, so check the result with `mouth_check.py`, because a loud effect might move the mouth.
   - `--from <frame>` starts the track part-way into the shot, for a cut (see "The speaker isn't in the picture").

3. **Give the model the track.** The ElevenLabs connector takes files by https URL (`creative_attach_reference_file`). Copy just the mp3 (not its `.json`) into `lipsync-audio/`, commit, push, and attach `https://raw.githubusercontent.com/<owner>/<repo>/<commit-sha>/lipsync-audio/<file>.mp3`. Delete the folder again before the PR is merged.

4. **Generate one clip for the whole shot.** Price it first with `estimate_only`, and never call a generation a second time to retry, because it charges again. Pick by what the shot needs:
   - `heygen-avatar6-turbo`: **the default.** It's the best quality of every model tried, at about 303 credits a second (1080p). It kept the picture's framing in the passport test from a medium close-up; give it one clear face, close or medium. Its prompt directs expression, head movement and one timed gesture.
   - `creatify-aurora`: keeps the framing exactly; 720p; about 848 credits a second. Use it only for a still that must not change at all.
   - `minimax-h3-max-lipsync`: one face only, 5 to 14.8 s of audio, no prompt.
   - `bytedance-seedance-v2.5`: picture plus audio with real action in one pass, but about 2,800 a second.

   Write the prompt from step 2's timings, e.g. *"She speaks. From 3.2 s to 5.0 s she stops and listens to him off-screen, a small nod, then answers."* Keep the camera still and the frame full 16:9: the app adds the shot's own camera move, grade and letterbox.

5. **Install it.**
   ```bash
   python3 .claude/skills/whole-shot-lipsync/scripts/install_clip.py <scratchpad>/track.mp3 <clip.mp4 or URL> <slug> [--cut-from <frame>] [--text "Vera: ..."]
   ```
   It checks the clip's voice lines up with the track, conforms it to the shot's length plus 12 held frames (a clip shorter than its shot would loop), writes `public/film/video/festival/lipsync-<slug>.mp4`, and makes it the shot's video (`videoShots` in `src/data/festival-cut.json`). A track made with `--from` goes in as a cut instead (an `inserts` entry). `--cut-from` starts that cut later than the track did, and `--text` sets the cut's caption.

6. **Finish.** Run `npm run build:festival-cut` and `npx vitest run src/core/festival-cut.test.ts`, remove `lipsync-audio/`, then open a PR and merge it. The user has said there's no need to ask before merging.

## Several beats on one picture

The film often holds one picture over several beats, each with its own line. The user's example was scene 6, beats 25–27 of the film file (b142–b144), all on the passport-photo picture. The user's idea: one video for the whole run, with silence before and after the actor's lines so the lip sync lands on time. That's what this skill already does:

- **The Director's Export joins such a run into one shot.** There, b141–b144 are one 7.9 s shot, nw_b141. The track runs the whole shot, so the run gets one clip with no cuts.
- **Only five runs are still separate shots** (Nov 2026):
  - s3 b71+b72
  - s14 b356+b358
  - s63a b1053+b1055
  - s98 b1610+b1611
  - s99a b1661+b1662 (already one LTX clip over both shots)

  None of them has a speaking face on camera.
- **A split run with a speaker on camera:** make a track for each shot and join them into one:
  ```bash
  ffmpeg -i a.mp3 -i b.mp3 -filter_complex concat=n=2:v=0:a=1 run.mp3
  ```
  Then generate one clip from it and lay it over both shots with the video skill's `install_transition_clip.py`. With no cut in the clip, it splits in proportion to the shots, so a clip exactly as long as the run plays at 1.0× and stays in sync.

## The speaker isn't in the picture

When a shot's picture doesn't show the person speaking, the Festival Cut cuts to their close-up for the line. Examples are a point-of-view shot or someone's hands. This was already done for Vera in b137 and b157. Make the close-up with this skill, from the same angle used for them elsewhere in the scene.

**The passport photo** (scene 6, beats 25–27 of the film file, joined in nw_b141) was done this way, at the user's request:
1. **Track:** `--from 32` starts 1.3 s before Vera's line, so the model begins at rest. (It was `--bed` then; room tone is now the default.) The scene's room tone (the police-station loop) fills the gaps, and Ishida's off-screen "In case." comes out of it.
2. **Clip:** HeyGen, from Vera facing camera over Ishida's shoulder (`s6_picks/55-i-speak-japanese-v1.jpg`), 2,121 credits.
3. **Install:** `--cut-from 56` drops the lead-in. The cut runs from just before her line to the shot's end, and the shot's own video (the LTX passport clip) plays before it.

So the photo stays on screen while the narration describes it. Then Vera says her line, and looks down as Ishida echoes "In case."

## Does silence time the lips right? (measured)

Yes. The models make the clip exactly as long as the track, and the mouth rests through the silences. `scripts/mouth_check.py` measured eight HeyGen Avatar 6 whole-shot clips (Nov 2026):
- **Speech against silence:** in seven clips the lips moved 9–42 times more during the lines than in the silences. In the eighth it was 3 times: the face turned and was tracked only 84% of the time.
- **Timing:** in six clips the lip movement lined up with the voice within 0–120 ms, the lips slightly ahead as in real speech.

So a line placed at its film time in a silent track plays at that time. The timing needs no prompt.

**Room tone instead of silence works just as well.** The passport cut's track had the scene's own room sound in its gaps instead of silence. The lips moved 40 times more during the line than in the room-tone gaps, the top of the silence range. They lined up with the voice at −120 ms. The model doesn't mouth room tone.

Check each new clip (the setup is in the script's header):
```bash
<venv>/bin/python -I .claude/skills/whole-shot-lipsync/scripts/mouth_check.py <face_landmarker.task> <clip.mp4>
```
A ratio under 5 means the mouth moves in the silences, so look at the clip. A download that came back without sound needs `--track <track.mp3>`.

## Timing in the prompt

HeyGen sends the prompt as a *motion* prompt: tone, energy, head movement, gestures. Its guide documents no timeline control, and the prompt can't change what is said or when. The track decides that.

So put the timing in the track (silence where the actor listens), and keep the prompt about the performance: *"She listens quietly, then answers, eyes lowered; small head movements."*

- **A timed cue landed, once.** The passport cut's prompt said *"at about 5 seconds she glances down at the table, then back up at him"*. She looked down from 4.3 to 5.4 s and back up: the eyes-down score went from 0.05 to 0.75, and the head tipped about 10°. That's within half a second of the cue, so HeyGen can place a simple gesture in time. Its own unprompted glances happen too: there was a blink-glance as she started speaking. So give one cue per clip, for a clear gesture, in clip seconds, and check it with `scripts/cue_check.py` (eyes-down and head tilt every quarter second) or by eye.
- **MiniMax H3 Max takes no prompt at all.**
- **Timed action without speech:** `ltx-audio-to-video` is documented to follow moments in an audio track ("on the first beat drop…"). Also untested.

## Keeping it in sync

**The film never plays a lip-sync clip's own sound.** HeyGen returns the clip with the exact track it was given. `install_clip.py` strips that sound, and the film's own voice clip plays at its film time over the muted clip. Nothing is re-voiced or overdubbed with a different take. The clip was made from those same voice clips at those same times, so lips and voice match when it goes in. The installer also measures and corrects any offset (0 ms on the passport cut), and `mouth_check.py` measures the lips.

**The risk is a later edit.** If a line or a shot is retimed after its lip sync is made, the lips stay where they were. So:
- each clip's line timing is recorded in `lipSyncTimings` in `src/data/festival-cut.json`;
- the installer does the recording itself, through `scripts/lipsync-timings.ts --write <clip>`;
- the festival test "keeps every lip sync in step with its voice" fails if any line moves by more than a frame;
- `lipsync-timings.ts --check` lists any drift.

If the test fails, either put the line back, or remake that lip sync (new track, new clip) and install it again. Never just re-record the timing to make the test pass: the lips would still be off. All 44 clips were recorded in step in Nov 2026.

## Two people talking in one picture

HeyGen animates **one** person from one photo and one audio track. Its prompt only steers that person's expression and movement. Writing "the man says…, then the woman says…" won't move the speech from one face to the other. With two faces in frame, lip-sync models pick one face to animate, and it can be the wrong one: MiniMax animated a man for a woman's voice.

Options, safest first:
1. **Cut to each speaker's close-up** for their lines (the method above).
2. **One clip per face, untested.** Crop each face out of the picture and lip-sync it with its own track, with the other speaker's lines left as room tone. Then lay both back into the frame.
3. **A model that acts the scene from the picture plus audio, untested here.** `bytedance-seedance-v2.5` (about 2,800 credits a second).

## Gotchas

- A whole-shot clip goes in `videoShots`, not `inserts`. Inserts skip montage shots (they have no `durationFrames`), and a one-piece insert fails the tests.
- Some shots already play as pieces (`<id>`, `<id>~fc1`, …) because a cutaway or another lip sync covers part of them; Jack's confession (nw_b1465) has two lip syncs back to back. The track script then says so and covers only that piece, and the installer adds the clip as a cut over it, keeping the other pieces. Never replace such a shot with one `videoShots` clip: the clip would be shorter than the shot and loop.
- Budget: the user tops up credits by hand. Make one take per shot, and check one frame rather than the whole clip unless something is clearly wrong.
- Lip-sync clips go in the Festival Cut only. The Director's Export (pictures only) is the original and stays untouched.
