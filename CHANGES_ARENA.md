# Changes in this branch

- A selected caption can be split at the playhead with S or Split CC without splitting its picture or audio clip. The cue text is divided at an estimated word boundary and can be edited afterwards; single-word cues cannot be divided this way. With no caption selected, Split continues to split the picture clip.
- The marker name editor is positioned above the timeline toolbar controls so its buttons remain accessible.
- Original imported source images remain unchanged.

## Recovery limitation

The workspace was reset to the base checkout during this session. The previously generated and voted images and other earlier uncommitted work (including Directed Uncut and character cutout) were not available in this checkout. Image recreation is underway; see IMAGE_RECOVERY.md for what has been recreated and what remains. The other earlier features have not been restored.

## MP4 export browser selection & GPU acceleration

- On Windows and macOS, MP4 export can use an installed Chrome or Edge when Playwright's Chromium is not installed. The serverless Chromium package is used only on its supported Linux x64 platform. If no browser can launch, export now explains how to install one or configure `PLAYWRIGHT_CHROMIUM_PATH`.
- MP4 export now enables hardware GPU acceleration by default (`--gpu`, with `--no-gpu` CPU override and an in-app **GPU acceleration** toggle): Chromium launches with hardware WebGL, 2D canvas, and OOP GPU rasterization (with automatic SwiftShader fallback if hardware GPU init fails), and FFmpeg probes hardware H.264 encoders (`h264_nvenc`, `h264_videotoolbox`, `h264_amf`, `h264_qsv`, `h264_vaapi`) with automatic `libx264` fallback and concurrent session-cap staging.
- Export supports up to 6 parallel Chromium + FFmpeg segment workers (`1..6` in the Export Modal and `--workers 1..6` on the CLI), launching worker browsers concurrently.

## Original Uncut long-hold coverage

- Fourteen separately voted intermediate stills (`v7–v11` and `v16`) have been added at existing beat boundaries; the original source pictures, dialogue, captions, audio and total timing remain intact. Existing Uncut saves are upgraded only where their current pictures still match the original; custom active and stashed pictures are preserved. Other cuts are unchanged.
- The reproducible audit in `scripts/audit-uncut-holds.ts` reports both scene-bounded and continuous still-image holds, including pictures carried over scene boundaries. Its current normal-playback result is 300 continuous holds over seven seconds (295 scene-bounded), so this work remains incomplete. See `IMAGE_RECOVERY.md` for accepted and rejected votes, exact prompts, the continuation prompt and remaining earlier recreations.

## Original Uncut adjacent duplicate images

- Twenty randomly selected duplicate pairs (`v12–v16`) have separately voted replacements at their existing beat boundaries. The original stills, dialogue, audio, captions and timeline duration remain intact; guarded v12–v16 migrations preserve direct and carried custom pictures in active or stashed saves. V15–v16 also protect explicit holds and shot-specific edits and roll back changes that would affect another frame's effective picture or look. Other cuts are unchanged.
- At the user's request Harada's initial tight crop was replaced with a separately voted wide newsroom shot. The earlier selected image remains saved; the v13 migration changes the previous bundled shot only where other pictures and effective looks remain intact.
- `scripts/audit-uncut-duplicates.ts` reports adjacent stills sharing the same effective image reference, including short holds and cross-scene pairs. The factory cut went from 914 to 894 pairs; this is incomplete and does not detect differently named files with identical pixels. See `IMAGE_RECOVERY.md` for exact prompts, votes and continuation instructions.

## Ten-shot voting fallback

- The no-vote image provider returned HTTP 403 on retry, so the user requested voting instead. Nine selected images were installed; `nw_b87` was skipped and remains unchanged. The selected originals, numbered review gallery, reference previews and exact prompts are in `reviews/uncut-no-vote-20261030/`.
- Three additional directory-only ten-shot review batches (`reviews/uncut-no-vote-20261030-batch2/`, `-batch3/`, and `-batch4/`, saving 7, 8, and 6 voted frames respectively) are preserved with their manifests and side-by-side galleries without modifying any cut (`cutModified: false`).
- Directory-only batch 5 (`reviews/uncut-no-vote-20261030-batch5/`) saves ten more randomly chosen hold targets — `nw_b963`, `nw_b658`, `nw_b40`, `nw_b1371`, `nw_b730`, `nw_b504`, `nw_b349`, `nw_b1441`, `nw_b1167` and `nw_b1078` — each chosen between two candidates and recorded with its exact prompt, reference previews and hold split. The first unvoted burst returned HTTP 403 for nine of the ten prompts; retrying them as two-candidate votes succeeded for every shot, so voting is the working generation path. No cut was modified (`cutModified: false`); the selected frames are saved under `images/` only.

- Directory-only batch 6 (`reviews/uncut-no-vote-20261030-batch6/`) saves six more randomly chosen hold targets — `nw_b1335`, `nw_b93`, `nw_b1102`, `nw_b614`, `nw_b1299` and `nw_b51` — each voted between two candidates. All six are saved exactly as generated (no crop, resize or re-encode) and the original source pictures are untouched; nothing was installed, so no cut changed (`cutModified: false`).
- Directory-only batch 7 (`reviews/uncut-no-vote-20261030-batch7/`) votes six more randomly chosen hold targets — `nw_b634`, `nw_b363`, `nw_b703`, `nw_b1123`, `nw_b1452` and `nw_b1639`. Five were selected and saved exactly as generated; `nw_b363` was skipped twice and left unsaved with both prompts recorded. Originals are untouched (no crop, resize or re-encode) and no cut changed (`cutModified: false`).
- Directory-only batch 8 (`reviews/uncut-no-vote-20261030-batch8/`) votes three final randomly chosen hold targets — `nw_b932`, `nw_b470` and `nw_b414`. All three candidate pairs were rejected, so nothing was saved; the prompts, reference previews and gallery are kept for a later retry. Originals untouched and no cut changed (`cutModified: false`).
## Select and grade image frames

- Use Ctrl+A (Cmd+A on Mac), or **Select all images** in the timeline, to select all still-image frames. Text fields keep their normal Select All shortcut; videos, gaps, gradients and other non-image frames are excluded.
- In the Clip inspector, expand **Camera & effects → Grade & texture** and change a setting. It applies to every selected image frame in one undoable edit; camera, timing, audio and other effects are preserved. Other effect groups still affect only the current frame.
