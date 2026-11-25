---
name: whole-shot-lipsync
description: Make lip-sync video for a Nobody's Witness / Scarlet Keyframe shot as ONE clip covering the whole shot, so the shot never cuts. Use this whenever the user asks for lip sync, a talking shot, a character speaking on camera, Aurora / HeyGen / MiniMax / OmniHuman / Seedance lip sync, "make them talk", or dialogue video, and above all when one actor stays on camera while another person also speaks in the shot, even if the user never says "whole shot".
---

# Whole-shot lip sync

## The rule

When a shot stays on one actor while someone else also speaks in it, make **one** lip-sync clip for that actor's whole shot:

- the voice track runs the shot's exact length;
- it holds only the on-camera actor's lines, each at the moment it is spoken in the film;
- every other voice becomes silence of the same length (the timing is kept, the voice is stripped);
- where the model takes a prompt, it says the actor stops and listens through those gaps.

Why: a clip per line forces cuts or freezes inside the shot. One take with the pauses kept reads as one continuous performance, and it stays in step with the film, whose mix still plays the other actor's voice.

## Steps

1. **Check the face.** Look at the shot's picture before spending anything. The face on camera must belong to the speaker: a phone shot once showed Mara while Vera's voice played. One clear face is best; with two faces some models animate the wrong one.

2. **Build the track.**
   ```bash
   npx vite-node .claude/skills/whole-shot-lipsync/scripts/shot-voice-track.ts <beatId> <speaker> <scratchpad>/track.mp3
   ```
   `<speaker>` is the name in the voice files (`/film/voice/<scene>/<nn>-<speaker>-<words>.mp3`), e.g. `vera`, `jack`, `kaneko`. It prints the shot's length and who speaks when; a line marked "off the track" is where the actor listens. It also writes `<track>.json` for step 5.

3. **Give the model the track.** The ElevenLabs connector takes files by https URL (`creative_attach_reference_file`). Copy just the mp3 (not its `.json`) into `lipsync-audio/`, commit, push, and attach `https://raw.githubusercontent.com/<owner>/<repo>/<commit-sha>/lipsync-audio/<file>.mp3`. Delete the folder again before the PR is merged.

4. **Generate one clip for the whole shot.** Price it first with `estimate_only`, and never call a generation a second time to retry, because it charges again. Pick by what the shot needs:
   - `creatify-aurora`: keeps the picture's framing; 720p; about 848 credits a second. The default for a still that must not change.
   - `heygen-avatar6-turbo`: cheapest (about 303 a second, 1080p) but reframes the picture. Its prompt only directs expression and head movement.
   - `minimax-h3-max-lipsync`: one face only, 5 to 14.8 s of audio, no prompt.
   - `bytedance-seedance-v2.5`: picture plus audio with real action in one pass, but about 2,800 a second.

   Write the prompt from step 2's timings, e.g. *"She speaks. From 3.2 s to 5.0 s she stops and listens to him off-screen, a small nod, then answers."* Keep the camera still and the frame full 16:9: the app adds the shot's own camera move, grade and letterbox.

5. **Install it.**
   ```bash
   python3 .claude/skills/whole-shot-lipsync/scripts/install_clip.py <scratchpad>/track.mp3 <clip.mp4 or URL> <slug>
   ```
   It checks the clip's voice lines up with the track, conforms it to the shot's length plus 12 held frames (a clip shorter than its shot would loop), writes `public/film/video/festival/lipsync-<slug>.mp4`, and makes it the shot's video (`videoShots` in `src/data/festival-cut.json`).

6. **Finish.** Run `npm run build:festival-cut` and `npx vitest run src/core/festival-cut.test.ts`, remove `lipsync-audio/`, then open a PR and merge it. The user has said there's no need to ask before merging.

## Gotchas

- A whole-shot clip always goes in `videoShots`, never `inserts`. Inserts skip montage shots (they have no `durationFrames`), and a one-piece insert fails the tests.
- Budget: the user tops up credits by hand. Make one take per shot, and check one frame rather than the whole clip unless something is clearly wrong.
- Lip-sync clips go in the Festival Cut only. The Director's Export (pictures only) is the original and stays untouched.
