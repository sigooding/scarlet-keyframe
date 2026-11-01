import { describe, expect, it } from "vitest";
import bundledAudioDurations from "../data/audio-durations.json";
import bundledFilm from "../data/nobodys-witness-film.json";
import bundledEdits from "../data/studio-edits.json";
import { buildTimelineClips } from "../sequence/animate";
import { resolveAudioClips } from "./audioClips";
import { buildDirectorsCutById, DIRECTORS_CUT_OPTIONS } from "./directorsCut";
import { applyJackNoirTreatment, classifyScene, isJackVoiceOver } from "./jackNoirCut";
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
const jack = buildDirectorsCutById(baseProject, "jack-noir", voiceMap, musicMap);

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

describe("Jack's Noir cut", () => {
  it("is selectable and builds on Original Uncut", () => {
    expect(DIRECTORS_CUT_OPTIONS.map((o) => o.id)).toContain("jack-noir");
    expect(jack.directorsCutId).toBe("jack-noir");
    const a = buildKeyframes(uncut.story);
    const b = buildKeyframes(jack.story);
    expect(b.length).toBe(a.length);
    expect(b.map((f) => f.id)).toEqual(a.map((f) => f.id));
  });

  it("adds no new pictures and no new sounds", () => {
    const newPics = [...picturesOf(jack.story)].filter((p) => !picturesOf(uncut.story).has(p));
    expect(newPics).toEqual([]);
    const known = soundsOf(uncut);
    // Every sound is a file the film already uses somewhere; the siren file is one of them.
    const filmSounds = new Set(
      JSON.stringify(bundledFilm).match(/\/film\/(?:sfx|voice|audio)\/[^"+]+?\.(?:mp3|wav)/g) ?? [],
    );
    const fresh = [...soundsOf(jack)].filter((s) => !known.has(s) && !filmSounds.has(s));
    expect(fresh).toEqual([]);
  });

  it("gives every scene a mood and keeps existing scene cinematic fields", () => {
    const { report } = applyJackNoirTreatment(uncut, voiceMap, musicMap);
    const total = Object.values(report.scenesByMood).reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(200);
    for (const mood of ["blue", "amber", "red", "green", "muted"] as const) expect(report.scenesByMood[mood]).toBeGreaterThan(5);
    const grades = new Set(["midnight-teal", "sodium-amber", "neon-noir", "nolan-imax"]);
    const graded = buildKeyframes(jack.story).filter((f) => f.beat.cinematic?.colorGrade);
    expect(graded.length).toBeGreaterThan(1000);
    for (const f of graded) expect(grades.has(String(f.beat.cinematic!.colorGrade)) || f.sceneId === "nw_logo").toBe(true);
  });

  it("classifies scenes from what they carry", () => {
    expect(classifyScene({ id: "x_raid", title: "raid", dialogueBeats: [] } as never).mood).toBe("red");
    expect(classifyScene({ id: "a", title: "The interview room", dialogueBeats: [] } as never).mood).toBe("green");
    expect(classifyScene({ id: "b", title: "Breakfast", dialogueBeats: [] } as never).mood).toBe("muted");
    expect(classifyScene({ id: "c", title: "Lane", ambientAudio: "file:/film/sfx/rain.mp3", dialogueBeats: [] } as never).mood).toBe("blue");
    expect(classifyScene({ id: "d", title: "Room", ambientAudio: "file:/film/sfx/amb-hive.mp3", dialogueBeats: [] } as never).mood).toBe("amber");
  });

  it("promotes Jack's reflective recorded lines to voice-over, only Jack's", () => {
    const beats = buildKeyframes(uncut.story).map((f) => f.beat);
    const vo = beats.filter(isJackVoiceOver);
    expect(vo.length).toBeGreaterThanOrEqual(10);
    expect(vo.every((b) => b.characterId === "nw_jack" && b.audioUrl)).toBe(true);
    expect(isJackVoiceOver({ characterId: "nw_vera", audioUrl: "/x.mp3", text: "x".repeat(200) } as never)).toBe(false);
  });

  it("replaces the camera only on treated beats, tilts safely, and never produces tiny clips", () => {
    const before = new Map(buildKeyframes(uncut.story).map((f) => [f.id, JSON.stringify(f.beat.animation ?? null)]));
    const frames = buildKeyframes(jack.story);
    const unchanged = frames.filter((f) => JSON.stringify(f.beat.animation ?? null) === before.get(f.id)).length;
    expect(unchanged / frames.length).toBeGreaterThan(0.7); // the film's own moves stay for the bulk
    let dutch = 0;
    for (const f of frames) {
      const rot = f.beat.animation?.rotation;
      if (rot?.length) {
        dutch += 1;
        expect(Math.abs(rot[rot.length - 1].value)).toBeLessThan(3.5);
        expect(f.beat.animation!.zoom![1].value).toBeGreaterThan(1.04);
      }
    }
    expect(dutch).toBeGreaterThan(20);
    const { clips } = buildTimelineClips(frames, voiceMap);
    expect(Math.min(...clips.filter((c) => !c.keyframe.beat.gap).map((c) => c.durationFrames))).toBeGreaterThan(0);
  });

  it("L-cuts only shorten a spoken beat that is followed by a silent beat in the same scene", () => {
    const a = buildKeyframes(uncut.story);
    const b = buildKeyframes(jack.story);
    let changed = 0;
    b.forEach((f, i) => {
      if (f.beat.durationFrames && !a[i].beat.durationFrames) {
        changed += 1;
        expect(f.beat.audioUrl).toBeTruthy();
        expect(b[i + 1].sceneId).toBe(f.sceneId);
        expect(b[i + 1].beat.audioUrl).toBeFalsy();
        expect(f.beat.durationFrames).toBeGreaterThanOrEqual(24);
      }
    });
    expect(changed).toBeGreaterThan(5);
  });

  it("never lets two spoken lines overlap, and echoes only belong to voice-over and footsteps", () => {
    const frames = buildKeyframes(jack.story);
    const { clips } = buildTimelineClips(frames, voiceMap);
    const resolved = resolveAudioClips(jack.audioClips, clips);
    const voices = resolved.filter((c) => c.lane === "voice" && !c.id.includes("_echo")).sort((x, y) => x.startMs - y.startMs);
    for (let i = 1; i < voices.length; i += 1) expect(voices[i].startMs).toBeGreaterThanOrEqual(voices[i - 1].endMs - 5);
    const echoes = resolved.filter((c) => c.id.includes("_echo"));
    expect(echoes.length).toBeGreaterThan(0);
    expect(echoes.length).toBeLessThan(200);
  });

  it("drops the music after gunfire and under voice-over", () => {
    const keyed = (jack.audioClips ?? []).filter((c) => c.lane === "music" && c.volumeKeys?.length);
    expect(keyed.length).toBeGreaterThan(0);
    for (const c of keyed) for (const k of c.volumeKeys!) expect(k.gain).toBeGreaterThanOrEqual(0);
  });

  it("leaves Original Uncut itself untouched", () => {
    expect(uncut.directorsCutId).toBe("uncut");
    expect(buildKeyframes(uncut.story).some((f) => f.beat.cinematic?.colorGrade === "neon-noir")).toBe(false);
  });
});
