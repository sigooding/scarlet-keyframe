# Scarlet Keyframe: notes for Claude sessions

This repo is the Scarlet Keyframe animatic editor and the film "Nobody's Witness". It has two cuts:
- **The Director's Export** is pictures only. It's the original; leave it as it is.
- **The Festival Cut** adds video, lip sync and fixes, set in `src/data/festival-cut.json`.

## Video work: read the skill first

Before generating or installing any video, read the skill that fits. Each holds the user's tested method, the scores, the
prices and the install scripts:
- **Lip sync, talking shots, dialogue:** `.claude/skills/whole-shot-lipsync/SKILL.md`. Follow its "The method" section: the scene's room tone in the gaps, HeyGen Avatar 6 Turbo, one timed gesture, a close-up cut when the speaker isn't in the picture, then the mouth and cue checks.
- **Motion clips (Kling, LTX, Gemini, MiniMax), a clip's own sound, one clip over several shots:** `.claude/skills/kling-video/SKILL.md`.

## Rules that hold across sessions

- **Credits.** Generations spend the user's ElevenLabs credits. Price first with `estimate_only`, make one take per shot, and never call a generation again to retry. When testing models, give each a different scene, so every test clip can go into the film.
- **Sync.** Lip-sync clips play muted over the film's own voice clips, and each clip's line timing is recorded in `lipSyncTimings`. If the festival test "keeps every lip sync in step with its voice" fails, an edit has moved a line under a lip sync. Put the line back, or remake that lip sync.
- **Before a PR.** Run `npm run build:festival-cut` and `npx vitest run`.
