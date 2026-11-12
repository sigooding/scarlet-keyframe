import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import bundledAudioDurations from "../data/audio-durations.json";
import bundledMediaIndex from "../data/media-index.json";
import bundledFilm from "../data/nobodys-witness-film.json";
import bundledEdits from "../data/studio-edits.json";
import {
  buildTimelineClips,
  clampPoseToPictureEdges,
  clipAtFrame,
  evaluate,
  minZoomForRotation,
} from "../sequence/animate";
import { resolveAudioClips } from "./audioClips";
import { resolveTimelineCaptions } from "./captions";
import { buildDirectorsCutById, DIRECTORS_CUT_OPTIONS } from "./directorsCut";
import { applyWitnessTreatment, classifyWitnessScene, isWitnessNarration, WITNESS_CUES } from "./witnessCut";
import { applyStudioMusicSync, buildKeyframes, createProjectState, parseImportPayload, runningSceneIds } from "./model";
import { extractKnownMusicDurations, resolveMusicSpans } from "./previewAudio";

const voiceMap = new Map(Object.entries(bundledAudioDurations as Record<string, number>));
const imported = parseImportPayload(bundledFilm, "film.json", { voiceDurations: voiceMap });
const baseProject = createProjectState(
  { ...imported, story: applyStudioMusicSync(imported.story, bundledEdits) },
  [],
  bundledEdits,
);
const musicMap = extractKnownMusicDurations(bundledEdits);

const uncut = buildDirectorsCutById(baseProject, "uncut", voiceMap, musicMap);
const witness = buildDirectorsCutById(baseProject, "witness", voiceMap, musicMap);
// The same cut one beat per frame (before same-picture beats are merged into one shot): timing, camera and
// light are checked per line here; the merge itself is checked against it below.
const witnessBeats = applyWitnessTreatment(uncut, voiceMap, musicMap, { mergeSamePictures: false }).project;

const picturesOf = (story: typeof uncut.story) =>
  new Set(buildKeyframes(story).map((f) => f.picture).filter((p): p is string => Boolean(p)));
const soundsOf = (p: typeof uncut) => {
  const out = new Set<string>();
  for (const c of p.audioClips ?? []) out.add(c.src);
  for (const s of p.story.scenes) {
    for (const part of String(s.ambientAudio ?? "").split("+")) if (part) out.add(part.replace(/^file:/, ""));
    if (s.musicUrl) out.add(String(s.musicUrl));
    for (const b of s.dialogueBeats ?? []) {
      if (b.audioUrl) out.add(String(b.audioUrl));
      if (b.sfxUrl) out.add(String(b.sfxUrl));
    }
  }
  return out;
};

/** Width and height of a JPEG, read from its frame header. */
function jpegSize(bytes: Uint8Array): { width: number; height: number } {
  let at = 2; // after the start-of-image marker
  while (at + 9 < bytes.length) {
    if (bytes[at] !== 0xff) throw new Error("not a JPEG marker");
    const marker = bytes[at + 1];
    const length = (bytes[at + 2] << 8) | bytes[at + 3];
    const startOfFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (startOfFrame) {
      return { height: (bytes[at + 5] << 8) | bytes[at + 6], width: (bytes[at + 7] << 8) | bytes[at + 8] };
    }
    at += 2 + length;
  }
  throw new Error("no JPEG frame header");
}

const HEAVY_OR_CONFESS =
  /\b(dead|died|kill(ed|ing)?|murder(ed)?|sorry|forgive|alone|afraid|scared|goodbye|ashes|funeral|never came (back|home)|my (son|daughter|wife|husband|brother|sister)|i lied|i knew|i saw|i did it|i was there|i paid|the truth is|i'?m sorry|confess|admit(ted)?|it was me)\b/i;

describe("The Witness Cut", () => {
  it("is selectable and builds on Original Uncut with the same beats in the same order", () => {
    expect(DIRECTORS_CUT_OPTIONS.map((o) => o.id)).toContain("witness");
    expect(witness.directorsCutId).toBe("witness");
    const a = buildKeyframes(uncut.story);
    const b = buildKeyframes(witnessBeats.story);
    expect(b.length).toBe(a.length);
    expect(b.map((f) => f.id)).toEqual(a.map((f) => f.id));
    // Merged: every Uncut beat is still there, in order, either as a shot or folded into the shot before it.
    const merged = buildKeyframes(witness.story).flatMap((f) => [
      f.id,
      ...((f.beat.mergedBeatIds as string[] | undefined) ?? []),
    ]);
    expect(merged).toEqual(a.map((f) => f.id));
  });

  it("shows no narration: the screenplay's description is never a caption, and every line still is", () => {
    const captionsOf = (p: typeof uncut) => {
      const frames = buildKeyframes(p.story);
      const beatOf = new Map(frames.map((f) => [f.id, f.beat]));
      const all = resolveTimelineCaptions(buildTimelineClips(frames, voiceMap).clips);
      const narration = all.filter((c) => isWitnessNarration(beatOf.get(c.frameId)!));
      return { narration, lines: all.filter((c) => !narration.includes(c)).map((c) => `${c.speaker}: ${c.text}`) };
    };
    const before = captionsOf(uncut);
    const after = captionsOf(witnessBeats);
    expect(before.narration.length).toBeGreaterThan(900); // what Original Uncut shows in italics
    expect(after.narration).toEqual([]);
    expect(after.lines.length).toBeGreaterThan(500);
    expect(after.lines).toEqual(before.lines); // spoken lines, and dialogue that was never recorded
    // In the cut as it plays (same-picture beats merged), nothing a narrator beat said is on screen either.
    const narrated = new Set(
      buildKeyframes(uncut.story)
        .filter((f) => isWitnessNarration(f.beat) && String(f.beat.text ?? "").trim().length > 12)
        .map((f) => String(f.beat.text).trim()),
    );
    const shown = resolveTimelineCaptions(buildTimelineClips(buildKeyframes(witness.story), voiceMap).clips);
    expect(shown.filter((c) => narrated.has(c.text.trim()))).toEqual([]);
    const { report } = applyWitnessTreatment(uncut, voiceMap, musicMap);
    expect(report.narrationRemoved).toBeGreaterThan(1000);
    expect(report.missingCues).toEqual([]);
  });

  it("keeps every narrator beat for what it carries: its picture and its sound effect", () => {
    const cuePictures = new Set(WITNESS_CUES.map((c) => c.picture).filter((p): p is string => Boolean(p)));
    const a = buildKeyframes(uncut.story);
    const b = buildKeyframes(witnessBeats.story);
    let cutIn = 0;
    b.forEach((frame, i) => {
      expect(frame.beat.sfxUrl, `${frame.id} keeps its sound effect`).toBe(a[i].beat.sfxUrl);
      if (frame.picture === a[i].picture) return;
      // A different picture from the film's is a cue picture, on its beat or held after it.
      expect(cuePictures.has(String(frame.picture)), `${frame.id} shows ${frame.picture}`).toBe(true);
      cutIn += 1;
    });
    expect(cutIn).toBeGreaterThanOrEqual(cuePictures.size);
  });

  it("uses a picture the film does not show there only for a cue, and adds no new sounds", () => {
    const cuePictures = new Set(WITNESS_CUES.map((c) => c.picture).filter((p): p is string => Boolean(p)));
    const newPics = [...picturesOf(witness.story)].filter((p) => !picturesOf(uncut.story).has(p));
    for (const pic of newPics) expect(cuePictures.has(pic), `${pic} is listed in WITNESS_CUES`).toBe(true);
    // Every cue picture is a file the editor knows: on disk, 16:9 source in the media index.
    const index = new Set(bundledMediaIndex as string[]);
    for (const pic of cuePictures) {
      expect(index.has(pic), `${pic} is in the media index`).toBe(true);
      expect(existsSync(join(process.cwd(), "public", pic)), `${pic} exists`).toBe(true);
    }
    const known = soundsOf(uncut);
    const fresh = [...soundsOf(witness)].filter((s) => !known.has(s));
    expect(fresh).toEqual([]);
  });

  it("frames every cue for the gate the cut is screened in", () => {
    // The cut plays behind the 2.35:1 bars (12% of the height each) unless the screening options say
    // otherwise, and the 1.37:1 gate hides 11.5% of the width on each side. What a cue points at is seen in
    // all of them.
    for (const cue of WITNESS_CUES) {
      if (!cue.focus) continue;
      const [fx, fy] = cue.focus.split(" ").map((part) => Number.parseFloat(part));
      expect(fy, `${cue.beatId} is clear of the 2.35:1 bars`).toBeGreaterThan(14);
      expect(fy, `${cue.beatId} is clear of the 2.35:1 bars`).toBeLessThan(86);
      expect(fx, `${cue.beatId} is clear of the 1.37:1 pillars`).toBeGreaterThan(14);
      expect(fx, `${cue.beatId} is clear of the 1.37:1 pillars`).toBeLessThan(86);
    }
    // A picture cut in for a cue fills the frame like every picture of the film: 16:9, 1920 wide or more.
    const cutIn = new Set(WITNESS_CUES.map((c) => c.picture).filter((p): p is string => Boolean(p)));
    expect(cutIn.size).toBe(7);
    for (const pic of cutIn) {
      const { width, height } = jpegSize(readFileSync(join(process.cwd(), "public", pic)));
      expect(Math.abs(width / height - 16 / 9), `${pic} is ${width}×${height}`).toBeLessThan(0.005);
      expect(width, `${pic} is ${width}×${height}`).toBeGreaterThanOrEqual(1920);
    }
  });

  it("gives each cue the time to be read, cuts a memory in as a flash and titles a jump in time", () => {
    const frames = buildKeyframes(witnessBeats.story);
    const film = buildKeyframes(uncut.story);
    const { clips } = buildTimelineClips(frames, voiceMap);
    const at = new Map(frames.map((f, i) => [f.id, i]));
    for (const cue of WITNESS_CUES) {
      const i = at.get(cue.beatId);
      expect(i, `${cue.beatId} is a beat of the film`).toBeDefined();
      const clip = clips[i!];
      expect(isWitnessNarration(clip.keyframe.beat), `${cue.beatId} was a narration line`).toBe(true);
      if (cue.read) expect(clip.durationFrames).toBeGreaterThanOrEqual(Math.round(cue.read * 24));
      if (cue.hold) expect(clip.durationFrames).toBe(Math.round(cue.hold * 24));
      if (cue.picture) expect(clip.keyframe.picture).toBe(cue.picture);
      if (cue.title) {
        expect(clip.keyframe.beat.titleCard?.title).toBe(cue.title);
        expect(clip.durationFrames).toBe(4 * 24);
      }
      if (cue.dissolve) expect(clip.keyframe.beat.backgroundTransition).toBe("dissolve");
      if (cue.insert) {
        // cut in for its beat only: the next beat shows what the film shows there
        const next = frames[i! + 1];
        const cueNext = WITNESS_CUES.some((c) => c.beatId === next.id && c.picture);
        if (next.sceneId === clip.keyframe.sceneId && !cueNext) expect(next.picture).toBe(film[i! + 1].picture);
      }
    }
    expect(WITNESS_CUES.filter((c) => c.title).length).toBe(3);
  });

  it("gives every scene a setting and grades with the restrained adult palette only", () => {
    const { report } = applyWitnessTreatment(uncut, voiceMap, musicMap);
    const total = Object.values(report.scenesBySetting).reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(200);
    for (const setting of ["danger", "night-ext", "interior", "daylight"] as const)
      expect(report.scenesBySetting[setting]).toBeGreaterThan(3);
    const grades = new Set(["tokyo-noir", "midnight-teal", "nolan-imax"]);
    const graded = buildKeyframes(witnessBeats.story).filter((f) => f.beat.cinematic?.colorGrade);
    expect(graded.length).toBeGreaterThan(1000);
    for (const f of graded)
      expect(grades.has(String(f.beat.cinematic!.colorGrade)) || f.sceneId === "nw_logo").toBe(true);
  });

  it("classifies scenes from what they carry", () => {
    expect(classifyWitnessScene({ id: "x_raid", title: "raid", dialogueBeats: [] } as never).setting).toBe("danger");
    expect(classifyWitnessScene({ id: "a", title: "Breakfast", dialogueBeats: [] } as never).setting).toBe("daylight");
    expect(
      classifyWitnessScene({ id: "b", title: "Lane", ambientAudio: "file:/film/sfx/rain.mp3", dialogueBeats: [] } as never)
        .setting,
    ).toBe("night-ext");
    expect(
      classifyWitnessScene({ id: "c", title: "Room", ambientAudio: "file:/film/sfx/amb-office.mp3", dialogueBeats: [] } as never)
        .setting,
    ).toBe("interior");
    expect(classifyWitnessScene({ id: "d", title: "The funeral", dialogueBeats: [] } as never).elegiac).toBe(true);
  });

  it("uses only motivated transitions: dissolves and dips to black, never wipes", () => {
    const { report } = applyWitnessTreatment(uncut, voiceMap, musicMap);
    expect(report.dissolves).toBeGreaterThan(3);
    expect(report.dips).toBeGreaterThan(0);
    // The film's crossfade into every narrated picture is a hard cut outside the sequences cut to music.
    expect(report.hardCuts).toBeGreaterThan(400);
    for (const scene of witness.story.scenes) {
      if (/^nw_(song|cut|intro|logo|title|credits|end)/.test(scene.id)) continue;
      for (const beat of scene.dialogueBeats ?? []) expect(beat.backgroundTransition ?? "").not.toBe("crossfade");
    }
    // Only the transitions this cut ADDS are checked: the film's own transitions stay untouched.
    const beforeByBeat = new Map(
      uncut.story.scenes.flatMap((s) => (s.dialogueBeats ?? []).map((b) => [String(b.id), String(b.backgroundTransition ?? "")] as const)),
    );
    for (const scene of witness.story.scenes) {
      for (const beat of scene.dialogueBeats ?? []) {
        const t = String(beat.backgroundTransition ?? "");
        if (t && t !== beforeByBeat.get(String(beat.id))) expect(["dissolve", "dip-to-black"]).toContain(t);
      }
    }
  });

  it("gives each still shot one slow move, keeps the film's camera in the sequences cut to music, and never makes tiny clips", () => {
    const { report } = applyWitnessTreatment(uncut, voiceMap, musicMap);
    expect(Object.values(report.shotMoves).reduce((a, b) => a + b, 0)).toBeGreaterThan(450);
    expect(report.pushIns).toBeGreaterThan(30);
    expect(report.drifts).toBeGreaterThan(5);
    expect(report.impactBeats).toBeGreaterThan(3);
    expect(report.cuePushes).toBeGreaterThan(15);

    const before = new Map(buildKeyframes(uncut.story).map((f) => [f.id, JSON.stringify(f.beat.animation ?? null)]));
    const frames = buildKeyframes(witnessBeats.story);
    const toMusic = frames.filter((f) => /^nw_(song|cut)_/.test(f.sceneId));
    const kept = toMusic.filter((f) => JSON.stringify(f.beat.animation ?? null) === before.get(f.id)).length;
    expect(kept / toMusic.length).toBeGreaterThan(0.8); // only a line that earns a move changes one there

    const { clips } = buildTimelineClips(frames, voiceMap);
    expect(Math.min(...clips.filter((c) => !c.keyframe.beat.gap).map((c) => c.durationFrames))).toBeGreaterThan(0);

    // As it plays: patient (speeds per second of screen time), cants under 2 degrees and covered by the zoom,
    // and a flat picture never shows its edge.
    const violent = /suppressed-shot|smg-burst|bullets|ricochets|door-pounding-shots|shot2|windscreen-crack|glass-case-shatter|gate-smash|body-fall|punches/;
    // The impact settle on a violent beat and the step back on the beat after it are the deliberate exceptions.
    const aroundViolence = new Set<string>();
    frames.forEach((f, i) => {
      if (!violent.test(String(f.beat.sfxUrl ?? ""))) return;
      aroundViolence.add(f.id);
      if (frames[i + 1]) aroundViolence.add(frames[i + 1].id);
    });
    const shots = buildTimelineClips(buildKeyframes(witness.story), voiceMap).clips;
    let patient = 0;
    for (const clip of shots) {
      const kf = clip.keyframe;
      const pic = String(kf.picture ?? "");
      if (!pic || pic.startsWith("video:") || pic.startsWith("gradient:")) continue;
      if (/^nw_(song|cut|intro|logo|title|credits|end)/.test(kf.sceneId)) continue; // the film's own camera
      const cin = (kf.beat.cinematic ?? kf.cinematic ?? {}) as Record<string, unknown>;
      const reprojected = Boolean(cin.depthMap) && String(cin.mode ?? "pan") !== "dolly";
      const jolt = [kf.id, ...((kf.beat.mergedBeatIds as string[] | undefined) ?? [])].some((id) => aroundViolence.has(id));
      if (!jolt) patient += 1;
      let prev = evaluate(clip, 0);
      for (let f = 0; f < clip.durationFrames; f += 12) {
        const pose = evaluate(clip, f);
        expect(Math.abs(pose.rotation)).toBeLessThan(2.3);
        expect(pose.zoom).toBeGreaterThanOrEqual(minZoomForRotation(pose.rotation) - 1e-3);
        if (!reprojected) expect(clampPoseToPictureEdges(pose).clamped, `${kf.id} shows the picture's edge`).toBe(false);
        if (f > 0 && !jolt) {
          expect(Math.abs(pose.zoom - prev.zoom) * 2, `${kf.id} zooms slowly`).toBeLessThan(0.06);
          expect(Math.hypot(pose.x - prev.x, pose.y - prev.y) * 2, `${kf.id} slides slowly`).toBeLessThan(2.5);
        }
        prev = pose;
      }
    }

    expect(patient).toBeGreaterThan(500);

    // The push toward a cue ends closer than it began, and has arrived before the shot is over.
    for (const cue of WITNESS_CUES) {
      if (!cue.focus) continue;
      const shot = shots.find(
        (c) => c.keyframe.id === cue.beatId || ((c.keyframe.beat.mergedBeatIds as string[] | undefined) ?? []).includes(cue.beatId),
      )!;
      const last = shot.durationFrames - 1;
      expect(evaluate(shot, last).zoom, `${cue.beatId} pushes in`).toBeGreaterThan(evaluate(shot, 0).zoom + 0.01);
      expect(evaluate(shot, last).zoom - evaluate(shot, Math.max(0, last - 6)).zoom).toBeLessThan(0.004);
    }
  });

  const tailsOf = (p: typeof uncut) => {
    const { clips, totalFrames } = buildTimelineClips(buildKeyframes(p.story), voiceMap);
    const plain: number[] = [];
    const heavy: number[] = [];
    clips.forEach((c, i) => {
      const beat = c.keyframe.beat;
      if (!beat.audioUrl || c.voiceFrames <= 0) return;
      const isLast = i + 1 >= clips.length || clips[i + 1].keyframe.sceneId !== c.keyframe.sceneId;
      if (isLast) return;
      const tail = (c.durationFrames - (c.voiceInFrame + c.voiceFrames)) / 24;
      (HEAVY_OR_CONFESS.test(String(beat.text ?? "")) ? heavy : plain).push(tail);
    });
    const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
    return { plain: median(plain), heavy: median(heavy), minutes: totalFrames / 24 / 60 };
  };

  it("is fast through procedure and slow through consequence: tight plain tails, held heavy lines", () => {
    const before = tailsOf(uncut);
    const after = tailsOf(witnessBeats);
    expect(before.plain).toBeGreaterThan(0.5);
    expect(after.plain).toBeLessThan(0.4); // ordinary lines cut sooner than the Uncut's 0.54 s
    expect(after.heavy).toBeGreaterThan(1.0); // heavy lines hold for the reaction
    expect(after.heavy - after.plain).toBeGreaterThan(0.6);
    expect(before.minutes - after.minutes).toBeGreaterThan(20); // no caption to wait for
  });

  it("holds a silent picture for what is in it, not for the time its caption took to read", () => {
    const film = buildTimelineClips(buildKeyframes(uncut.story), voiceMap).clips;
    const { clips } = buildTimelineClips(buildKeyframes(witnessBeats.story), voiceMap);
    const cueBeats = new Set(WITNESS_CUES.map((c) => c.beatId));
    // A stretch of silence: consecutive narrator beats of a scene on one picture.
    const retimed: number[] = [];
    let i = 0;
    while (i < clips.length) {
      const first = clips[i].keyframe;
      if (!isWitnessNarration(first.beat) || first.beat.gap) {
        i += 1;
        continue;
      }
      let j = i;
      while (
        j + 1 < clips.length &&
        isWitnessNarration(clips[j + 1].keyframe.beat) &&
        clips[j + 1].keyframe.sceneId === first.sceneId &&
        clips[j + 1].keyframe.picture === first.picture
      )
        j += 1;
      const run = clips.slice(i, j + 1);
      const frames = run.reduce((n, c) => n + c.durationFrames, 0);
      const was = film.slice(i, j + 1).reduce((n, c) => n + c.durationFrames, 0);
      for (const c of run) expect(c.durationFrames, `${c.keyframe.id} is long enough to be seen`).toBeGreaterThanOrEqual(10);
      // Only what this cut timed: the sequences cut to music and the film's hand-set lengths are left as they are.
      if (frames !== was && !run.some((c) => cueBeats.has(c.keyframe.id))) retimed.push(frames / 24);
      i = j + 1;
    }
    expect(retimed.length).toBeGreaterThan(450);
    const sorted = [...retimed].sort((a, b) => a - b);
    expect(sorted[sorted.length - 1]).toBeLessThan(9); // Original Uncut holds one picture for 28 s of captions
    const opening = (c: (typeof clips)[number], k: number) =>
      isWitnessNarration(c.keyframe.beat) && (k === 0 || clips[k - 1].keyframe.picture !== c.keyframe.picture);
    const shots = clips
      .map((c, k) => (opening(c, k) && !/^nw_(song|cut|intro|logo|title|credits|end)/.test(c.keyframe.sceneId) ? k : -1))
      .filter((k) => k >= 0)
      .map((k) => {
        let end = k;
        while (
          end + 1 < clips.length &&
          isWitnessNarration(clips[end + 1].keyframe.beat) &&
          clips[end + 1].keyframe.sceneId === clips[k].keyframe.sceneId &&
          clips[end + 1].keyframe.picture === clips[k].keyframe.picture
        )
          end += 1;
        const voiceNext = clips[end + 1];
        const runsOn = voiceNext && voiceNext.keyframe.picture === clips[k].keyframe.picture;
        return { seconds: clips.slice(k, end + 1).reduce((n, c) => n + c.durationFrames, 0) / 24, runsOn };
      });
    // A new picture nobody speaks over gets a couple of seconds at least, and a median a shot can be read in.
    const alone = shots.filter((s) => !s.runsOn).map((s) => s.seconds).sort((a, b) => a - b);
    expect(alone.length).toBeGreaterThan(250);
    expect(alone[Math.floor(alone.length / 2)]).toBeGreaterThan(2.8);
    expect(alone[Math.floor(alone.length / 2)]).toBeLessThan(4.5);
    expect(alone[Math.floor(alone.length * 0.05)]).toBeGreaterThan(1.5);
  });

  it("keeps a sequence the film cut to a song on its music: every length in it is the film's", () => {
    const film = buildTimelineClips(buildKeyframes(uncut.story), voiceMap).clips;
    const { clips } = buildTimelineClips(buildKeyframes(witnessBeats.story), voiceMap);
    let checked = 0;
    clips.forEach((c, k) => {
      if (!/^nw_(song|cut)_/.test(c.keyframe.sceneId)) return;
      expect(c.durationFrames, `${c.keyframe.id} keeps its length`).toBe(film[k].durationFrames);
      checked += 1;
    });
    expect(checked).toBeGreaterThan(150);
  });

  it("cuts to a new picture on the beat of the song where a scene carries its tempo", () => {
    const { report } = applyWitnessTreatment(uncut, voiceMap, musicMap);
    expect(report.cutsOnBeat).toBeGreaterThan(20);
    const frames = buildKeyframes(witnessBeats.story);
    const { clips, totalFrames } = buildTimelineClips(frames, voiceMap);
    const span = resolveMusicSpans(clips, totalFrames, musicMap).find((s) => s.url.endsWith("glimmering-haze.mp3"))!;
    expect(span).toBeDefined();
    let onBeat = 0;
    for (let k = 1; k < clips.length; k += 1) {
      const kf = clips[k].keyframe;
      const sync = kf.scene.musicSync as { bpm: number; firstBeat: number } | undefined;
      if (!sync || kf.sceneId !== clips[k - 1].keyframe.sceneId || kf.picture === clips[k - 1].keyframe.picture) continue;
      const seconds = (clips[k].startFrame - span.startFrame) / 24;
      if (seconds <= 0 || seconds > 45) continue; // the first pass of the song, where its beat is steady
      const beats = (seconds - sync.firstBeat) / (60 / sync.bpm);
      expect(Math.abs(beats - Math.round(beats)) * (60 / sync.bpm), `${kf.id} at ${seconds.toFixed(2)} s`).toBeLessThan(0.03);
      onBeat += 1;
    }
    expect(onBeat).toBeGreaterThan(8);
    // A spoken line is never shortened to reach a beat.
    const film = buildTimelineClips(buildKeyframes(uncut.story), voiceMap).clips;
    clips.forEach((c, k) => {
      if (!c.keyframe.scene.musicSync || !c.keyframe.beat.audioUrl) return;
      expect(c.durationFrames - (c.voiceInFrame + c.voiceFrames)).toBeGreaterThanOrEqual(5);
      expect(film[k].keyframe.id).toBe(c.keyframe.id);
    });
  });

  it("never clips the last words of a line", () => {
    const { clips } = buildTimelineClips(buildKeyframes(witnessBeats.story), voiceMap);
    for (const c of clips) {
      if (!c.keyframe.beat.audioUrl || c.voiceFrames <= 0) continue;
      expect(c.durationFrames).toBeGreaterThanOrEqual(12);
      expect(c.durationFrames - (c.voiceInFrame + c.voiceFrames)).toBeGreaterThanOrEqual(5);
    }
  });

  it("holds before and after violence", () => {
    const { report } = applyWitnessTreatment(uncut, voiceMap, musicMap);
    expect(report.dreadHolds).toBeGreaterThan(0);
    expect(report.aftermathHolds).toBeGreaterThan(0);
  });

  it("never lets two spoken lines overlap and adds no echo or fabricated sound", () => {
    const frames = buildKeyframes(witness.story);
    const { clips } = buildTimelineClips(frames, voiceMap);
    const resolved = resolveAudioClips(witness.audioClips, clips);
    const voices = resolved.filter((c) => c.lane === "voice").sort((x, y) => x.startMs - y.startMs);
    for (let i = 1; i < voices.length; i += 1) expect(voices[i].startMs).toBeGreaterThanOrEqual(voices[i - 1].endMs - 5);
    expect(resolved.some((c) => c.id.includes("_echo"))).toBe(false);
    const uncutIds = new Set((uncut.audioClips ?? []).map((c) => c.id));
    for (const c of witness.audioClips ?? []) expect(uncutIds.has(c.id)).toBe(true);
  });

  it("never dips the music: each clip is the Uncut clip at 90% with longer fades and untouched volume keys", () => {
    const before = new Map((uncut.audioClips ?? []).filter((c) => c.lane === "music").map((c) => [c.id, c]));
    const music = (witness.audioClips ?? []).filter((c) => c.lane === "music");
    expect(music.length).toBeGreaterThan(0);
    for (const c of music) {
      const was = before.get(c.id);
      expect(was, `music ${c.id} exists in Original Uncut`).toBeDefined();
      expect(c.src).toBe(was!.src);
      expect(c.volumeKeys ?? []).toEqual(was!.volumeKeys ?? []);
      expect(c.gain).toBeCloseTo(was!.gain * 0.9, 6);
      expect(Number(c.fadeInMs)).toBeGreaterThanOrEqual(1200);
      expect(Number(c.fadeOutMs)).toBeGreaterThanOrEqual(1800);
    }
  });

  it("leads some lines with a 200 ms J-cut only where there is clear air", () => {
    const { report } = applyWitnessTreatment(uncut, voiceMap, musicMap);
    expect(report.jCuts).toBeGreaterThan(20);
  });

  describe("one shot per picture", () => {
    const beats = buildTimelineClips(buildKeyframes(witnessBeats.story), voiceMap);
    const shots = buildTimelineClips(buildKeyframes(witness.story), voiceMap);

    it("merges consecutive beats of a scene that show the same picture into one frame", () => {
      const { report } = applyWitnessTreatment(uncut, voiceMap, musicMap);
      expect(report.mergedShots).toBeGreaterThan(200);
      expect(report.absorbedBeats).toBeGreaterThan(500);
      expect(shots.clips.length).toBe(beats.clips.length - report.absorbedBeats);
      for (let i = 1; i < shots.clips.length; i += 1) {
        const a = shots.clips[i - 1].keyframe;
        const b = shots.clips[i].keyframe;
        if (a.sceneId !== b.sceneId || a.beat.gap || b.beat.gap || a.beat.titleCard || b.beat.titleCard) continue;
        if (String(a.picture ?? "").startsWith("video:")) continue;
        expect(b.picture === a.picture && Boolean(a.picture), `${a.id} -> ${b.id} show the same picture`).toBe(false);
      }
      expect(runningSceneIds(witness.story)).toEqual(runningSceneIds(witnessBeats.story));
    });

    it("moves nothing in time: same length, same picture at every frame", () => {
      expect(shots.totalFrames).toBe(beats.totalFrames);
      for (let f = 0; f < beats.totalFrames; f += 1) {
        if (clipAtFrame(shots.clips, f)!.keyframe.picture !== clipAtFrame(beats.clips, f)!.keyframe.picture)
          throw new Error(`picture differs at frame ${f}`);
      }
    });

    it("keeps every sound at the same millisecond and every caption on the same frames", () => {
      const before = new Map(resolveAudioClips(witnessBeats.audioClips, beats.clips).map((c) => [c.id, c]));
      const after = resolveAudioClips(witness.audioClips, shots.clips);
      expect(after.length).toBe(before.size);
      for (const c of after) expect(Math.abs(c.startMs - before.get(c.id)!.startMs)).toBeLessThan(0.01);
      const cue = (c: ReturnType<typeof resolveTimelineCaptions>[number]) =>
        `${c.globalInFrame}-${c.globalOutFrame}|${c.speaker}|${c.isNarration}|${c.text}`;
      expect(resolveTimelineCaptions(shots.clips).map(cue)).toEqual(resolveTimelineCaptions(beats.clips).map(cue));
    });

    it("runs the camera on as one move: no resets inside a shot, no picture edge shown", () => {
      let jumps = 0;
      for (const clip of shots.clips) {
        if (!clip.keyframe.beat.mergedBeatIds) continue;
        let prev = evaluate(clip, 0);
        expect(prev.zoom).toBeGreaterThanOrEqual(minZoomForRotation(prev.rotation) - 1e-3);
        for (let f = 1; f < clip.durationFrames; f += 1) {
          const pose = evaluate(clip, f);
          expect(pose.zoom).toBeGreaterThanOrEqual(minZoomForRotation(pose.rotation) - 1e-3);
          const step = Math.abs(pose.zoom - prev.zoom) + Math.abs(pose.x - prev.x) / 100 + Math.abs(pose.rotation - prev.rotation) / 50;
          if (step > 0.02) jumps += 1;
          prev = pose;
        }
      }
      // The impact settle on a violent beat is the only deliberate jolt.
      const { report } = applyWitnessTreatment(uncut, voiceMap, musicMap);
      expect(jumps).toBeLessThanOrEqual(report.impactBeats);
    });

    it("can be switched off", () => {
      const { report } = applyWitnessTreatment(uncut, voiceMap, musicMap, { mergeSamePictures: false });
      expect(report.mergedShots).toBe(0);
      expect(buildKeyframes(witnessBeats.story).length).toBe(buildKeyframes(uncut.story).length);
    });
  });

  it("leaves Original Uncut itself untouched", () => {
    expect(uncut.directorsCutId).toBe("uncut");
    expect(buildKeyframes(uncut.story).some((f) => f.beat.cinematic?.hitchcockLighting === "eye-light")).toBe(false);
  });
});
