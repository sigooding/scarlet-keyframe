# Changes in this branch

- A selected caption can be split at the playhead with S or Split CC without splitting its picture or audio clip. The cue text is divided at an estimated word boundary and can be edited afterwards; single-word cues cannot be divided this way. With no caption selected, Split continues to split the picture clip.
- The marker name editor is positioned above the timeline toolbar controls so its buttons remain accessible.
- Original imported source images remain unchanged.

## Recovery limitation

The workspace was reset to the base checkout during this session. The previously generated and voted images and other earlier uncommitted work (including Directed Uncut and character cutout) were not available in this checkout. Image recreation is underway; see IMAGE_RECOVERY.md for what has been recreated and what remains. The other earlier features have not been restored.

## MP4 export browser selection

- On Windows and macOS, MP4 export can use an installed Chrome or Edge when Playwright's Chromium is not installed. The serverless Chromium package is used only on its supported Linux x64 platform. If no browser can launch, export now explains how to install one or configure `PLAYWRIGHT_CHROMIUM_PATH`.

## Original Uncut long-hold coverage

- Fourteen separately voted intermediate stills (`v7–v11` and `v16`) have been added at existing beat boundaries; the original source pictures, dialogue, captions, audio and total timing remain intact. Existing Uncut saves are upgraded only where their current pictures still match the original; custom active and stashed pictures are preserved. Other cuts are unchanged.
- The reproducible audit in `scripts/audit-uncut-holds.ts` reports both scene-bounded and continuous still-image holds, including pictures carried over scene boundaries. Its current normal-playback result is 300 continuous holds over seven seconds (295 scene-bounded), so this work remains incomplete. See `IMAGE_RECOVERY.md` for accepted and rejected votes, exact prompts, the continuation prompt and remaining earlier recreations.

## Original Uncut adjacent duplicate images

- Twenty randomly selected duplicate pairs (`v12–v16`) have separately voted replacements at their existing beat boundaries. The original stills, dialogue, audio, captions and timeline duration remain intact; guarded v12–v16 migrations preserve direct and carried custom pictures in active or stashed saves. V15–v16 also protect explicit holds and shot-specific edits and roll back changes that would affect another frame's effective picture or look. Other cuts are unchanged.
- At the user's request Harada's initial tight crop was replaced with a separately voted wide newsroom shot. The earlier selected image remains saved; the v13 migration changes the previous bundled shot only where other pictures and effective looks remain intact.
- `scripts/audit-uncut-duplicates.ts` reports adjacent stills sharing the same effective image reference, including short holds and cross-scene pairs. The factory cut went from 914 to 894 pairs; this is incomplete and does not detect differently named files with identical pixels. See `IMAGE_RECOVERY.md` for exact prompts, votes and continuation instructions.

## Ten-shot voting fallback

- The no-vote image provider returned HTTP 403 on retry, so the user requested voting instead. Nine selected images were installed; `nw_b87` was skipped and remains unchanged. The selected originals, numbered review gallery, reference previews and exact prompts are in `reviews/uncut-no-vote-20261030/`.

## Select and grade image frames

- Use Ctrl+A (Cmd+A on Mac), or **Select all images** in the timeline, to select all still-image frames. Text fields keep their normal Select All shortcut; videos, gaps, gradients and other non-image frames are excluded.
- In the Clip inspector, expand **Camera & effects → Grade & texture** and change a setting. It applies to every selected image frame in one undoable edit; camera, timing, audio and other effects are preserved. Other effect groups still affect only the current frame.
