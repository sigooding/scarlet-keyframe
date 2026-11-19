import { splitAnimation, type TimelineClip } from "../sequence/animate";
import { frameToMs, msToFrameFloat, resolveAudioClips, roundMicros, type AudioClip } from "./audioClips";
import { plainAudioClip, splitAudioClipAtMs } from "./audioEdits";
import type { BeatLike, ProjectState } from "./model";

const LINES = [
  [1689, 1698, "its-me"],
  [1690, 1699, "answers-about-dad"],
  [1692, 1701, "dad-didnt-kill-himself"],
  [1693, 1702, "coming-home"],
  [1695, 1704, "im-sor"],
] as const;
const BEEP = "/film/sfx/answerphone-beep.mp3";

/** An opt-in conform for the Director's Export that played Mara's message twice. Never rebuild a saved cut. */
export function cutMaraCall(project: ProjectState, timeline: readonly TimelineClip[]) {
  if (project.directorsCutId !== "director-export" || project.story.id !== "nobodys-witness-film" || !project.audioClips) return;
  const i = timeline.findIndex((c) => c.keyframe.id === "nw_b1688" && c.keyframe.sceneId === "nw_s68");
  const phone = timeline[i], hall = timeline[i + 1];
  const shot = phone?.keyframe.beat, next = hall?.keyframe.beat;
  const caps = shot?.captions ?? [];
  const jackCap = caps.find((c) => c.speaker === "JACK" && c.text === "It's time.");
  if (shot?.id !== "nw_b1688" || !jackCap || caps.length !== 9 || caps.filter((c) => c.speaker === "MARA").length !== 8 ||
      !shot.silent || shot.audioUrl || shot.afterBeatTargetSceneId !== "nw_s69" || next?.id !== "nw_b1109" ||
      hall.keyframe.sceneId !== "nw_s69" || !next.silent || next.captions?.length || next.audioUrl) return;

  const audio = resolveAudioClips(project.audioClips, timeline);
  const onPhone = audio.filter((c) => c.anchorId === shot.id);
  const jack = onPhone.find((c) => c.lane === "voice" && c.src === "/film/voice/s68/237-jack-it-s-time.mp3");
  const dry = onPhone.filter((c) => c !== jack && c.lane === "voice").sort((a, b) => a.startMs - b.startMs);
  if (!jack || onPhone.length !== 6 || dry.length !== LINES.length ||
      !dry.every((c, n) => c.src === `/film/voice/s68/nw_b${LINES[n][0]}-mara-${LINES[n][2]}.mp3`)) return;
  const play = timeline.filter((c) => c.keyframe.sceneId === "nw_s76_maras_message");
  if (play.length !== 3 || play[0].keyframe.id !== "nw_b1697" || play[0].startFrame <= hall.startFrame) return;
  const machine = audio.filter((c) => c.lane === "voice" && play.some((p) => p.keyframe.id === c.anchorId))
    .sort((a, b) => a.startMs - b.startMs);
  if (machine.length !== LINES.length ||
      !machine.every((c, n) => c.src === `/film/voice/s76/nw_b${LINES[n][1]}-machine-${LINES[n][2]}.mp3`)) return;

  // End the handset shot on the record tone, not on a word. Jack's off-screen exit line goes on the corridor cut.
  const keep = Math.floor(msToFrameFloat(dry[0].offsetMs) + 1e-6);
  const newCut = phone.startFrame + keep, removed = hall.startFrame - newCut;
  const cutMs = frameToMs(newCut), oldCutMs = frameToMs(hall.startFrame), overlap = frameToMs(8);
  const exitIn = 6, exitOut = exitIn + jackCap.outFrame - jackCap.inFrame;
  if (keep < 12 || removed <= 0 || exitOut > hall.durationFrames ||
      dry.some((c) => c.startMs < cutMs - 0.01 || c.endMs > oldCutMs) ||
      audio.some((c) => c.lane === "voice" && !onPhone.includes(c) && c.endMs > oldCutMs && c.startMs < oldCutMs + frameToMs(exitOut))) return;
  const replacement = new Map<string, AudioClip[]>();
  for (const c of dry) replacement.set(c.id, []);
  replacement.set(jack.id, [{ ...plainAudioClip(jack), anchorId: next.id,
    offsetMs: frameToMs(exitIn), gain: roundMicros(jack.gain * 0.8) }]);

  // At the edit, crossfade the two sides of each continuous bed. After the cut the score and room are at
  // precisely the same source positions relative to the corridor (and the rest of the film) as before.
  for (const bed of audio.filter((c) => !replacement.has(c.id) && c.startMs < oldCutMs && c.endMs > cutMs + 0.01)) {
    if (bed.lane !== "music" && bed.lane !== "ambience") return; // don't cut through someone else's edit
    const head = splitAudioClipAtMs(bed, cutMs, timeline)?.left;
    const tail = splitAudioClipAtMs(bed, oldCutMs - overlap, timeline, { newId: `${bed.id}-after-handset` })?.right;
    if (!head || !tail || bed.endMs <= oldCutMs || head.durationMs < overlap || audio.some((c) => c.id === tail.id)) return;
    const continuation = { ...tail, anchorId: next.id, offsetMs: -overlap, fadeInMs: overlap };
    // The piano is louder on the far side of the splice. Ride it under “It's time”, not the whole corridor.
    if (bed.src === "/film/audio/bad-guy-piano.mp3" && !bed.volumeKeys?.length) {
      const release = roundMicros(overlap + frameToMs(exitIn) + jack.durationMs);
      if (release + 800 < tail.durationMs) continuation.volumeKeys = [
        { atMs: release, gain: 0.6 }, { atMs: roundMicros(release + 800), gain: 1 },
      ];
    }
    replacement.set(bed.id, [{ ...head, fadeOutMs: overlap }, continuation]);
  }

  // Use the levelled prints of the SAME five filtered takes. The words, in-points, pauses and clip fades stay put.
  for (const c of machine) {
    replacement.set(c.id, [{ ...plainAudioClip(c), src: c.src.replace(/\.mp3$/, "-print.wav") }]);
  }
  const first = machine[0], last = machine[4];
  const song = audio.find((c) => c.lane === "music" && c.src === "/film/audio/bad-guy.mp3" &&
    c.startMs <= frameToMs(play[0].startFrame) && c.endMs >= first.endMs);
  if (!song || song.volumeKeys?.length || first.startMs - 200 <= frameToMs(play[0].startFrame) ||
      last.anchorId !== play[2].keyframe.id || last.endMs + frameToMs(10) > frameToMs(play[2].endFrame)) return;
  const keys = [
    { atMs: roundMicros(frameToMs(play[0].startFrame) - song.startMs), gain: 1 },
    { atMs: roundMicros(first.startMs - song.startMs - 200), gain: 0.24 },
  ];
  // The factory cue already fades to silence on the last word. If a saved cue continues, bring it back up.
  if (last.endMs < song.endMs - song.fadeOutMs) keys.push(
    { atMs: roundMicros(last.endMs - song.startMs), gain: 0.24 },
    { atMs: roundMicros(Math.min(song.durationMs, last.endMs - song.startMs + 1000)), gain: 1 },
  );
  replacement.set(song.id, [{ ...plainAudioClip(song), volumeKeys: keys }]);

  const tone = (id: string, anchorId: string, offsetMs: number): AudioClip => ({
    id, lane: "sfx", src: BEEP, anchorId, offsetMs, inMs: 0, durationMs: overlap,
    gain: 0.12, fadeInMs: 8, fadeOutMs: 24, loop: false,
  });
  const tones = [tone("ac_sfx_mara_record", shot.id, frameToMs(keep - 8)),
    tone("ac_sfx_mara_stop", last.anchorId, frameToMs(Math.ceil(msToFrameFloat(last.offsetMs + last.durationMs)) + 1))];
  if (tones.some((t) => audio.some((a) => a.id === t.id || (a.anchorId === t.anchorId && a.src === BEEP)))) return;

  const shots = new Map<string, BeatLike>([
    [shot.id, { ...shot, durationFrames: keep, captions: [], mergedBeatIds: [], animation: splitAnimation(shot.animation, keep - 1)[0] }],
    [next.id, { ...next, captions: [{ ...jackCap, inFrame: exitIn, outFrame: exitOut }], mergedBeatIds: ["nw_b1108", ...(next.mergedBeatIds ?? [])] }],
  ]);
  const lead = timeline[i - 1]?.keyframe.id === "nw_b1719" ? timeline[i - 1] : phone;
  return {
    firstShotId: lead.keyframe.id,
    startFrame: lead.startFrame,
    project: {
      ...project,
      audioClips: [...project.audioClips.flatMap((c) => replacement.get(c.id) ?? [c]), ...tones],
      story: {
        ...project.story,
        scenes: project.story.scenes.map((s) => s.id === "nw_s68" || s.id === "nw_s69"
          ? { ...s, dialogueBeats: s.dialogueBeats!.map((b) => shots.get(b.id ?? "") ?? b) } : s),
        ...(project.story.markers && { markers: project.story.markers.map((m) =>
          m.frame < newCut ? m : { ...m, frame: Math.max(newCut, m.frame - removed) }) }),
      },
    } satisfies ProjectState,
  };
}
