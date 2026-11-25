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
- **Same picture, one clip.** Before making any video, check `sameRun` in `shot-info.ts`. Neighbouring shots on the same picture are merged into ONE clip, laid across them with `install_run_clip.py`, never a clip per shot.
- **Pauses.** Never cut away the moment someone finishes talking. Hold about half a second after a line, unless the next person speaks sooner (see "A breath after the line" in the lip-sync skill).
- **Storage.** The repo is about 2.2 GB on GitHub (Nov 2026; recommended under 1 GB, strongly under 5 GB; 100 MB per file). Every re-encoded clip or picture adds a new copy to history, so don't re-commit large media without need. Keep `exports/nobodys-witness.reel.json` (71 MB): the Director's Export is rebuilt from it (`npm run hardwire:export`) and tests read it. Deleting it wouldn't shrink the history anyway.
- **Before a PR.** Run `npm run build:festival-cut` and `npx vitest run`.
