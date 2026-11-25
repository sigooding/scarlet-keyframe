---
name: kling-video
description: Turn a Nobody's Witness / Scarlet Keyframe still into a real-motion clip with Kling (Kling 4, Kling 3 Pro, Kling 2.6 Pro) through the ElevenLabs connector, and lay it over its Festival Cut shot. Use this whenever the user wants a shot "alive", "in video", moving or animated, image-to-video, the Hive escape or another action sequence as video, or asks about Kling, video tests or video prompting, even if they never name Kling.
---

# Kling video for the Festival Cut

## What the tests showed

Eight Hive-escape shots (Nov 2026) were made in one batch, one take each, and none needed a retake.

| Model | Settings | Cost | How it behaves |
|---|---|---|---|
| `kling-4` | 720p; 3–30 s in whole seconds; start frame (+ end frame); no negative prompt | 951 credits a second (3 s = 2,854) | The most natural and restrained. Faces hold up even in close-up motion. It softens forceful action: "strikes the pipe three times" came out as a reach and a tap. **Default for quiet, face and atmosphere shots.** |
| `kling-3-pro` | 1080p; 3–15 s; `generate_audio: false`; negative prompt | about 679 a second (3 s = 2,036) | Real force (full swings), heads turn on cue, and it's 1080p. It's also cheaper than Kling 4 at 720p. Fast moves blur. **Default for action beats.** |
| `kling-2.6-pro` | 1080p; 5 or 10 s only; negative prompt | 2,121 per 5 s | The most literal and theatrical: big two-handed blows, a burst of steam. Only the cheapest when the shot itself runs about 5 or 10 s. |

Every clip held the locked camera, added no one new and kept everyone's identity. A light change ("a moment later every light goes out") and sweeping flashlight beams both worked without silly effects. People can run past the lens: in the laundry run, Jack pulled Vera out of frame and the shot ended on the sheets swinging closed, which was right for that shot.

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

## Gotchas

- Generate whole seconds that cover the shot. A 3.1 s shot gets 3 s, and the installer holds the last frame for the remainder.
- The aspect follows the picture: one came back 1292×724. The installer crops to 1920×1080.
- Dialogue shots go through `whole-shot-lipsync`, because Kling invents its own voices.
- Video clips go in the Festival Cut only. The Director's Export stays pictures-only.
- The user is happy for generated images (ElevenLabs image models) to fill gaps, for example an end frame so one shot flows into the next. This hasn't been tried yet.
