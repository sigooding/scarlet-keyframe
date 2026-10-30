# Changes in this branch

- A selected caption can be split at the playhead with S or Split CC without splitting its picture or audio clip. The cue text is divided at an estimated word boundary and can be edited afterwards; single-word cues cannot be divided this way. With no caption selected, Split continues to split the picture clip.
- The marker name editor is positioned above the timeline toolbar controls so its buttons remain accessible.
- No existing images were removed or replaced.

## Recovery limitation

The workspace was reset to the base checkout during this session. The previously generated and voted images and other earlier uncommitted work (including Directed Uncut and character cutout) were not available in this checkout. Image recreation is underway; see IMAGE_RECOVERY.md for what has been recreated and what remains. The other earlier features have not been restored.

## Original Uncut long-hold coverage

- Ten separately voted intermediate stills have been added at existing beat boundaries; the original source pictures, dialogue, captions, audio and total timing remain intact. Existing Uncut saves are upgraded only where their current pictures still match the original; custom active and stashed pictures are preserved. Other cuts are unchanged.
- The reproducible audit in `scripts/audit-uncut-holds.ts` reports both scene-bounded and continuous still-image holds, including pictures carried over scene boundaries. Its current normal-playback result is 307 continuous holds over seven seconds, so this work remains incomplete. See `IMAGE_RECOVERY.md` for accepted and rejected votes, exact prompts, the continuation prompt and remaining earlier recreations.

## Select and grade image frames

- Use Ctrl+A (Cmd+A on Mac), or **Select all images** in the timeline, to select all still-image frames. Text fields keep their normal Select All shortcut; videos, gaps, gradients and other non-image frames are excluded.
- In the Clip inspector, expand **Camera & effects → Grade & texture** and change a setting. It applies to every selected image frame in one undoable edit; camera, timing, audio and other effects are preserved. Other effect groups still affect only the current frame.
