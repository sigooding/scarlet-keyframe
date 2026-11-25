---
name: kling-video
description: Turn a Nobody's Witness / Scarlet Keyframe still into a real-motion clip with Kling (Kling 4, Kling 3 Pro, Kling 2.6 Pro), Gemini Omni Flash or LTX 2 Fast (long takes) through the ElevenLabs connector, and lay it over its Festival Cut shot. Use this whenever the user wants a shot "alive", "in video", moving or animated, image-to-video, the Hive escape or another action sequence as video, or asks about Kling, video tests or video prompting, even if they never name Kling.
---

# Kling video for the Festival Cut

## What the tests showed

Eight Hive-escape shots (Nov 2026) were made in one batch, one take each, and none needed a retake.

| Model | Settings | Cost | How it behaves |
|---|---|---|---|
| `kling-4` | 720p; 3–30 s in whole seconds; start frame (+ end frame); no negative prompt | 951 credits a second (3 s = 2,854) | The most natural and restrained. Faces hold up even in close-up motion. It softens forceful action: "strikes the pipe three times" came out as a reach and a tap. **Default for quiet, face and atmosphere shots.** |
| `kling-3-pro` | 1080p; 3–15 s; `generate_audio: false`; negative prompt | about 679 a second (3 s = 2,036) | Real force (full swings), heads turn on cue, and it's 1080p. It's also cheaper than Kling 4 at 720p. Fast moves blur. **Default for action beats.** |
| `kling-o3-pro`, `kling-omni-video` | 1080p (4K option); 3–15 s; start + end frame, reference images | 3,393 per 5 s (about 679 a second) | Untested. Same price as Kling 3 Pro. |
| `kling-2.6-pro` | 1080p; 5 or 10 s only; negative prompt | 2,121 per 5 s | The most literal and theatrical: big two-handed blows, a burst of steam. Only the cheapest when the shot itself runs about 5 or 10 s. |

**The user's review of that batch:**
- **Good:** the masked men in single file, and Kaneko's strikes. Both the Kling 3 Pro take and the Kling 4 take were liked. The Kling 4 take was preferred because its own generated sound beat the film's strike sound effect.
- **OK:** the main switch and the flashlights.
- **Failed, wardrobe (Kling 4):** Vera stood still and stepped back instead of pushing forward. A start frame alone doesn't tell Kling 4 where someone should end up.
- **Failed, laundry run (Kling 4):** it played in slow motion. Kling 4 drifts into slow motion on fast action.
- **Too hard:** Kling 2.6 Pro's strikes were over the top.

So: use Kling 3 Pro for anyone moving through space or moving fast, and say "real-time speed" (and put `slow motion` in the negative prompt). Use Kling 4 for stillness, faces and small actions. For movement that has to arrive somewhere, give an end frame.

Every clip held the locked camera, added no one new and kept everyone's identity. A light change ("a moment later every light goes out") and sweeping flashlight beams both worked without silly effects. People can run past the lens: in the laundry run, Jack pulled Vera out of frame and the shot ended on the sheets swinging closed, which was right for that shot.

**Gemini Omni Flash 1.2 (`gemini-omni-1.2-flash`)** costs about 439 credits a second at 720p (3 s = 1,304; 1080p 3 s = 1,956). That's under half of Kling 4. It does 3–15 s, start and end frames, and makes its own sound. The user upscales later, so 720p is fine. Tested on two calm shots:
- **Flashlights:** about as good as Kling 4, though the men drifted forward where they were asked to stand still.
- **Unlit lighter close-up:** exactly right, a trembling thumb and no flame.

Three things to know about Gemini:
1. `connect_from` wires a picture to its `images` port, which makes it a loose reference, not the opening frame. Add the node without `connect_from`, then wire the picture with `creative_connect_flow_nodes` and `target_port: "start_frame"` (and `"end_frame"` if needed). Start/end frames and image references can't be combined.
2. Its safety filter blocked Vera feeling her way along a dark corridor with Jack "following close behind her". A thriller beat with a woman, a man and darkness can read as a threat. Phrase such shots neutrally ("Vera and Jack move slowly along the dark corridor together") or use Kling.
3. Prompts should be short and about intent: camera, mood, light, setting, action. It also wants the sound described ("Ambient sound: …").

Use Gemini for calm shots, small gestures and close-ups. Use Kling 4 for faces in motion and anything Gemini's filter might stop.

## Long takes (12–20 s in one clip)

The cheapest model that can make a 12–15 s take is **LTX 2 Fast (`ltx-v2-fast`)**. It runs 6–20 s in even seconds, at 1080p and 25 fps. It takes a start frame only, no end frame, and `generate_audio: false` turns off its sound. Cost is about 242 credits a second (12 s = 2,909; 14 s = 3,393).

It was tried on the film's last shot before the credits (nw_b1687, "The three of them in the steam", 12.7 s) against MiniMax H3 Max (`minimax-h3-max`, 768p, 13 s = 4,726):

| Model | User's score | Pros | Cons |
|---|---|---|---|
| LTX 2 Fast | **7/10** | Better quality; adds small details that make it more real | Drifts: Kaneko wandered half out of frame, Jack moved closer |
| MiniMax H3 Max | 6/10 | Faithful to the still | A bit pixelated (768p) |

**Use LTX for long takes.** MiniMax won't take `aspect_ratio` with a start frame (it follows the picture). Neither MiniMax nor Kling 3 Pro lets `enhance_prompt` be set.

Gemini Omni Flash 1.2 (12 s at 720p = 5,109), Wan 2.6 (15 s = 9,089) and Seedance 2.0 Mini (12 s = 10,994) also make long takes, at higher cost.

## Testing models

When comparing models, give each one a **different** scene, not the same shot twice. Every clip can then go into the film, and no credits are spent on a version that will be thrown away. That's the user's rule.

Not on offer through the ElevenLabs connector (Nov 2026): Kling 4 Flash, the cheaper Kling 4 the guide describes. Kling 4's cheapest setting here is 720p. `kling-2.5-turbo` is the only "turbo", and it's an older generation. The Kling AI plugin (Kling's own connector, which spends Kling credits) may offer more.

## Steps

1. **Read the shot.**
   ```bash
   npx vite-node .claude/skills/kling-video/scripts/shot-info.ts <beatId> [<beatId> ...]
   ```
   It gives the shot's frames, the whole seconds to generate, its picture (after any festival repair), the pictures either side, and whether it's split into pieces or already a video. Look at the picture itself before writing anything.

2. **Pick the model** from the table: Kling 4 for stillness and faces, Kling 3 Pro for force.

3. **Write the prompt** with the template below.

4. **Generate in one flow.**
   - Call `creative_create_flow`.
   - Attach each picture with `creative_attach_reference_file` using its raw GitHub URL at a commit on main: `https://raw.githubusercontent.com/sigooding/scarlet-keyframe/<sha>/public/film/img/...`.
   - Add one `creative_add_flow_node` per shot: `video-generation` with `model_id`, `model_parameters` and `prompt`, plus `connect_from: [<picture node>]`, which wires the start frame.
   - Price the whole batch with `creative_run_flow_nodes` and `estimate_only`, then run it once.
   - Poll `creative_get_flow_run_status`. A batch of eight took about six minutes.
   - Never call a generation a second time to retry; it charges again.

5. **Judge.** Download each `content_url` (the master) into its own folder and look at five frames across the clip. Check the faces, the hands, any extra people and the camera. Pick the best take of a shot when there are several.

6. **Install.**
   ```bash
   python3 .claude/skills/kling-video/scripts/install_motion_clip.py <beatId> <clip.mp4 or URL> <slug> [--start S]
   ```
   It conforms the clip to 1920×1080 at 24 fps and to the shot's length plus 12 held frames (a clip shorter than its shot would loop). It drops the clip's sound and makes the clip the shot's video (`videoShots`). Use `--start` to skip into a 5 s clip used on a shorter shot.

7. **Finish.** Run `npm run build:festival-cut` and `npx vitest run src/core/festival-cut.test.ts`, then open a PR and merge it. The user has said there's no need to ask before merging.

## Prompt template

> [Who], [one action, with where it ends; hands on the objects they touch]. [What the rest of the frame does, kept small]. Locked-off static camera: the camera does not move or zoom. [Who] keep the same face, hair and clothes as in the first frame, and no one new appears. Photorealistic, natural motion, subtle film grain.

- Keep the camera locked. The app moves the camera itself with the shot's keyframes, and adds the grade and letterbox, so a moving clip would double the move.
- Describe one action and give it an end point ("…then settle", "…let them fall closed behind them"). Open-ended motion is what drifts.
- For Kling 3 Pro and 2.6 Pro, also send `negative_prompt`: `camera movement, zoom, morphing, warping, distorted hands, extra fingers, flicker, new people, text, cartoon`. Kling 4 has no negative prompt, so say what stays the same instead.
- Name the people as they are in the frame ("the old woman at the stove", "Vera and Jack at the counter"), and keep the prompt under about 80 words.

## Sound

Kling 4 always generates sound (it has no setting for it). Kling 3 Pro and 2.6 Pro make sound only with `generate_audio: true`. The installer drops a clip's sound. When a clip's own sound is better than the film's, as with Kaneko's strikes, save it as an mp3 under `public/film/sfx/`. Then point the export's sound clip for that shot at it with `clipPatches` in `src/data/festival-cut.json` (`src`, `durationMs`, and a `gain` matched to the old sound's loudness, measured in LUFS with ffmpeg's `ebur128`). Rebuild so the file enters the media index.

## Two-shot transitions (start = shot 1, end = shot 2)

This was the user's idea for smoother cuts. Use shot 1's picture as the start frame and shot 2's picture as the end frame (wire it with `creative_connect_flow_nodes`, `target_port: "end_frame"`). Generate one clip as long as the two shots together. Kling 3 Pro, 6 s, covers two 3.1 s shots.

Ask for the cut where the shots meet, with timing: *"Two shots, with a hard cut at exactly 3 seconds. Shot 1, 0 to 3 seconds: … Shot 2, 3 to 6 seconds: … Each shot has a still camera."* The action then carries across the cut.

Lay it over both shots with:
```bash
python3 .claude/skills/kling-video/scripts/install_transition_clip.py <beatA> <beatB> <clip> <slug>
```
It finds the cut, fits each half to its shot with a small speed change (6 s stretched to 6.25 s puts a 3 s cut exactly on the seam), and sets both `videoShots`.

**Results (door → candlelit kitchen, wardrobe → barber's; Kling 3 Pro, 6 s):**
- Neither clip made a hard cut. Kling hid each change behind something passing the lens: the door edge, Jack's shoulder. That reads better than a cut.
- The installer found no cut, so it split each clip halfway, and the hidden change spans the edit.
- With the barber's picture as the end frame, Vera finally pushed forward through the coats, which a start frame alone hadn't managed.
- Both stretched by under 4%.
- **The user's verdict:** wardrobe → barber's was good. Door → kitchen was rejected. The man at the table holds a bat in the kitchen picture, and in the clip Jack "produced a baseball bat". Objects held by other people in the end frame can jump to the leads. When the second picture has props, say who holds them ("only the man at the table holds the bat; Vera's and Jack's hands are empty"). Look at the end frame's props before running.
- **Preference:** the user finds Kling 4 better looking than Kling 3 Pro. Prefer Kling 4 with an end frame for movement that has to arrive somewhere, and keep Kling 3 Pro for speed (the laundry run at real-time speed was good).

A continuous camera move through to shot 2 ("the camera glides forward behind them through the doorway…", no cut) is untested. Don't assume it fails. The Kling 3 Pro node for door → candlelit kitchen is set up, unrun, on the "Hive escape Kling tests" flow.

## Gotchas

- Kling 3 Pro nodes show `enhance_prompt: true` on the canvas, but the parameter can't be set; it's rejected as unknown.

- Generate whole seconds that cover the shot. A 3.1 s shot gets 3 s, and the installer holds the last frame for the remainder.
- The aspect follows the picture: one came back 1292×724. The installer crops to 1920×1080.
- Dialogue shots go through `whole-shot-lipsync`, because Kling invents its own voices.
- Video clips go in the Festival Cut only. The Director's Export stays pictures-only.
- The user is happy for generated images (ElevenLabs image models) to fill gaps, for example an end frame so one shot flows into the next. This hasn't been tried yet.
