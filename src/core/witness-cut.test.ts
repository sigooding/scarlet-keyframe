import { describe, expect, it } from "vitest";
import bundledAudioDurations from "../data/audio-durations.json";
import bundledFilm from "../data/nobodys-witness-film.json";
import bundledEdits from "../data/studio-edits.json";
import { buildTimelineClips } from "../sequence/animate";
import { resolveAudioClips } from "./audioClips";
import { buildDirectorsCutById, DIRECTORS_CUT_OPTIONS } from "./directorsCut";
import { applyWitnessTreatment, classifyWitnessScene } from "./witnessCut";
import { applyStudioMusicSync, buildKeyframes, createProjectState, parseImportPayload } from "./model";
import { extractKnownMusicDurations } from "./previewAudio";

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

const HEAVY_OR_CONFESS =
  /\b(dead|died|kill(ed|ing)?|murder(ed)?|sorry|forgive|alone|afraid|scared|goodbye|ashes|funeral|never came (back|home)|my (son|daughter|wife|husband|brother|sister)|i lied|i knew|i saw|i did it|i was there|i paid|the truth is|i'?m sorry|confess|admit(ted)?|it was me)\b/i;

describe("The Witness Cut", () => {
  it("is selectable and builds on Original Uncut with the same beats in the same order", () => {
    expect(DIRECTORS_CUT_OPTIONS.map((o) => o.id)).toContain("witness");
    expect(witness.directorsCutId).toBe("witness");
    const a = buildKeyframes(uncut.story);
    const b = buildKeyframes(witness.story);
    expect(b.length).toBe(a.length);
    expect(b.map((f) => f.id)).toEqual(a.map((f) => f.id));
  });

  it("adds no new pictures and no new sounds", () => {
    const newPics = [...picturesOf(witness.story)].filter((p) => !picturesOf(uncut.story).has(p));
    expect(newPics).toEqual([]);
    const known = soundsOf(uncut);
    const fresh = [...soundsOf(witness)].filter((s) => !known.has(s));
    expect(fresh).toEqual([]);
  });

  it("gives every scene a setting and grades with the restrained adult palette only", () => {
    const { report } = applyWitnessTreatment(uncut, voiceMap, musicMap);
    const total = Object.values(report.scenesBySetting).reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(200);
    for (const setting of ["danger", "night-ext", "interior", "daylight"] as const)
      expect(report.scenesBySetting[setting]).toBeGreaterThan(3);
    const grades = new Set(["tokyo-noir", "midnight-teal", "nolan-imax"]);
    const graded = buildKeyframes(witness.story).filter((f) => f.beat.cinematic?.colorGrade);
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

  it("replaces the camera only on treated beats, cants under 2 degrees, and never makes tiny clips", () => {
    const before = new Map(buildKeyframes(uncut.story).map((f) => [f.id, JSON.stringify(f.beat.animation ?? null)]));
    const frames = buildKeyframes(witness.story);
    const unchanged = frames.filter((f) => JSON.stringify(f.beat.animation ?? null) === before.get(f.id)).length;
    expect(unchanged / frames.length).toBeGreaterThan(0.6); // the film's own moves stay for the bulk
    for (const f of frames) {
      const rot = f.beat.animation?.rotation;
      if (rot?.length) {
        expect(Math.abs(rot[rot.length - 1].value)).toBeLessThan(2.3);
        expect(f.beat.animation!.zoom![1].value).toBeGreaterThan(1.03);
      }
    }
    const { report } = applyWitnessTreatment(uncut, voiceMap, musicMap);
    expect(report.pushIns).toBeGreaterThan(30);
    expect(report.drifts).toBeGreaterThan(5);
    expect(report.impactBeats).toBeGreaterThan(3);
    const { clips } = buildTimelineClips(frames, voiceMap);
    expect(Math.min(...clips.filter((c) => !c.keyframe.beat.gap).map((c) => c.durationFrames))).toBeGreaterThan(0);
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
    const after = tailsOf(witness);
    expect(before.plain).toBeGreaterThan(0.5);
    expect(after.plain).toBeLessThan(0.4); // ordinary lines cut sooner than the Uncut's 0.54 s
    expect(after.heavy).toBeGreaterThan(1.0); // heavy lines hold for the reaction
    expect(after.heavy - after.plain).toBeGreaterThan(0.6);
    expect(before.minutes - after.minutes).toBeGreaterThan(1); // tighter overall despite the holds
  });

  it("never clips the last words of a line", () => {
    const { clips } = buildTimelineClips(buildKeyframes(witness.story), voiceMap);
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
    const keyOf = (c: { src: string; anchorId: string }) => `${c.src}@${c.anchorId}`;
    const before = new Map((uncut.audioClips ?? []).filter((c) => c.lane === "music").map((c) => [keyOf(c), c]));
    const music = (witness.audioClips ?? []).filter((c) => c.lane === "music");
    expect(music.length).toBeGreaterThan(0);
    for (const c of music) {
      const was = before.get(keyOf(c));
      expect(was, `music ${keyOf(c)} exists in Original Uncut`).toBeDefined();
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

  it("leaves Original Uncut itself untouched", () => {
    expect(uncut.directorsCutId).toBe("uncut");
    expect(buildKeyframes(uncut.story).some((f) => f.beat.cinematic?.hitchcockLighting === "eye-light")).toBe(false);
  });
});
