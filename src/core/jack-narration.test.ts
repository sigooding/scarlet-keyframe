import { describe, expect, it } from "vitest";
import bundledAudioDurations from "../data/audio-durations.json";
import bundledFilm from "../data/nobodys-witness-film.json";
import bundledEdits from "../data/studio-edits.json";
import { buildTimelineClips } from "../sequence/animate";
import { resolveAudioClips } from "./audioClips";
import { effectiveCaptionsForBeat, isNarrationBeat, resolveTimelineCaptions, wrapCaptionLines } from "./captions";
import { buildDirectorsCutById, DIRECTORS_CUT_OPTIONS, getDirectorsCutLabel, switchDirectorsCutWithState } from "./directorsCut";
import {
  applyJackNarration,
  JACK_NARRATION,
  JACK_VO_CHARACTER_ID,
  JACK_VO_NAME,
  VO_WORDS_PER_SECOND,
  voiceOverSeconds,
  type SceneNarration,
} from "./jackNarration";
import { applyStudioMusicSync, buildKeyframes, createProjectState, parseImportPayload, type BeatLike, type StoryLike } from "./model";
import { extractKnownMusicDurations } from "./previewAudio";
import { clipFrames, FPS } from "./timing";

const voiceMap = new Map(Object.entries(bundledAudioDurations as Record<string, number>));
const imported = parseImportPayload(bundledFilm, "film.json", { voiceDurations: voiceMap });
const baseProject = createProjectState(
  { ...imported, story: applyStudioMusicSync(imported.story, bundledEdits) },
  [],
  bundledEdits,
);
const musicMap = extractKnownMusicDurations(bundledEdits);

const uncut = buildDirectorsCutById(baseProject, "uncut", voiceMap, musicMap);
const noir = buildDirectorsCutById(baseProject, "jack-noir", voiceMap, musicMap);
const narrated = buildDirectorsCutById(baseProject, "jack-narrated", voiceMap, musicMap);

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const sceneOf = (project: typeof noir, id = "nw_s10") => project.story.scenes.find((s) => s.id === id)!;
const beatOf = (project: typeof noir, beatId: string) => sceneOf(project).dialogueBeats!.find((b) => b.id === beatId)!;
const idsOf = (project: typeof noir, id = "nw_s10") => sceneOf(project, id).dialogueBeats!.map((b) => String(b.id));
const wordCount = (text: string) => text.trim().split(/\s+/).length;

// Jack's words, exactly as the director wrote them
const V1 = [
  "I'd stopped buying cigarettes years ago.",
  "Still carried the lighter.",
  "It gave me something to do while I decided what not to say.",
];
const V2 =
  "There's a lie you tell for money and a lie you tell because the truth would take too long. I'd been in business long enough to know the difference. That afternoon I was charging her for both.";
const V3 = "I said I was sorry. I was sorry. Just not about the thing she thought.";

describe("Jack's Narrated Cut: the cut", () => {
  it("is selectable, sits after Jack's Noir, and builds from Original Uncut", () => {
    const ids = DIRECTORS_CUT_OPTIONS.map((o) => o.id);
    expect(ids.indexOf("jack-narrated")).toBe(ids.indexOf("jack-noir") + 1);
    expect(getDirectorsCutLabel("jack-narrated")).toBe("Jack’s Narrated Cut");
    expect(narrated.directorsCutId).toBe("jack-narrated");
    // the snapshot of the raw import is still the raw import
    expect(narrated.snapshots.some((s) => s.id === "snapshot-uncut-original-import")).toBe(true);
    expect(JSON.stringify(narrated.snapshots.find((s) => s.id === "snapshot-uncut-original-import")!.story)).toBe(
      JSON.stringify(baseProject.originalStory),
    );
  });

  it("switches in and out like any other cut, and a switch back to it keeps the writer's edits", () => {
    const toNarrated = switchDirectorsCutWithState(noir, "jack-narrated", voiceMap, musicMap);
    expect(toNarrated.directorsCutId).toBe("jack-narrated");
    expect(idsOf(toNarrated)).toContain("nw_b248_vo");
    // an edit to the narrated cut is stashed when the writer leaves it, and comes back
    const edited = clone(toNarrated);
    beatOf(edited, "nw_b248_vo").text = "Changed by the writer.";
    const away = switchDirectorsCutWithState(edited, "jack-noir", voiceMap, musicMap);
    expect(idsOf(away)).not.toContain("nw_b248_vo");
    const back = switchDirectorsCutWithState(away, "jack-narrated", voiceMap, musicMap);
    expect(beatOf(back, "nw_b248_vo").text).toBe("Changed by the writer.");
    // a forced rebuild restores the plan
    const reset = switchDirectorsCutWithState(back, "jack-narrated", voiceMap, musicMap, { forceRebuild: true });
    expect(beatOf(reset, "nw_b248_vo").text).toBe(V2);
  });
});

describe("Jack's Narrated Cut: scene 10, Jack at his desk", () => {
  it("applies the whole plan to the real film: every beat it names exists", () => {
    const report = applyJackNarration(clone(baseProject.originalStory));
    expect(report.missing).toEqual([]);
    expect(report).toMatchObject({ replaced: 3, silenced: 3, added: 2 });
  });

  it("puts Jack's three opening lines where the description of Jack at the desk was, one to a beat", () => {
    const [a, b, c] = ["nw_b229", "nw_b230", "nw_b231"].map((id) => beatOf(narrated, id));
    expect([a.text, b.text, c.text]).toEqual(V1);
    for (const beat of [a, b, c]) {
      expect(beat.characterId).toBe(JACK_VO_CHARACTER_ID);
      expect(beat.silent).toBe(true);
      expect(beat.audioUrl).toBeUndefined(); // text only: nothing has been recorded
      expect(isNarrationBeat(beat)).toBe(true); // so it is shown as italic narration
    }
    // the picture, the lighter's sound and its volume stay exactly where the film had them
    const was = (id: string) => beatOf(noir, id);
    expect(a.background).toBe(was("nw_b229").background);
    expect(b.sfxUrl).toBe("/film/sfx/lighter-flick.mp3");
    expect(b.sfxUrl).toBe(was("nw_b230").sfxUrl);
    expect(b.sfxVolume).toBe(was("nw_b230").sfxVolume);
  });

  it("is credited to JACK (V.O.), in italics, on the captions", () => {
    expect(narrated.story.characters.find((c: { id: string }) => c.id === JACK_VO_CHARACTER_ID)).toMatchObject({ name: JACK_VO_NAME });
    expect(narrated.story.characters.filter((c: { id: string }) => c.id === JACK_VO_CHARACTER_ID)).toHaveLength(1);
    const { clips } = buildTimelineClips(buildKeyframes(narrated.story), voiceMap);
    const captions = resolveTimelineCaptions(clips).filter((c) => c.frameId.startsWith("nw_b2") && ["nw_b229", "nw_b230", "nw_b231", "nw_b248_vo", "nw_b260_vo"].includes(c.frameId));
    expect(new Set(captions.map((c) => c.frameId))).toEqual(new Set(["nw_b229", "nw_b230", "nw_b231", "nw_b248_vo", "nw_b260_vo"]));
    for (const cap of captions) {
      expect(cap.speaker).toBe("JACK (V.O.)");
      expect(cap.isNarration).toBe(true);
    }
    expect(narrated.story.captionStyle).toMatchObject({ showSpeaker: true, italicNarration: true });
  });

  it("lets Vera's arrival and their opening exchange play without narration", () => {
    const { clips } = buildTimelineClips(buildKeyframes(narrated.story), voiceMap);
    for (const id of ["nw_b232", "nw_b236", "nw_b238"]) {
      const beat = beatOf(narrated, id);
      expect(beat.captions).toEqual([]);
      const clip = clips.find((c) => c.keyframe.id === id)!;
      expect(effectiveCaptionsForBeat(beat, clip.durationFrames)).toEqual([]);
      // the beat itself stays: its picture, its knock on the glass, its length
      expect(beat.text).toBe(beatOf(noir, id).text);
      expect(beat.background).toBe(beatOf(noir, id).background);
      expect(beat.sfxUrl).toBe(beatOf(noir, id).sfxUrl);
      expect(clip.durationFrames).toBe(clips.find((c) => c.keyframe.id === id)!.durationFrames);
    }
    // the exchange itself is untouched: Vera's and Jack's recorded lines still play, with their captions
    for (const id of ["nw_b233", "nw_b234", "nw_b235", "nw_b237"]) {
      expect(beatOf(narrated, id)).toEqual(beatOf(noir, id));
    }
  });

  it("adds V2 after 'He doesn't answer. Another train passes. The blinds shiver.'", () => {
    const ids = idsOf(narrated);
    expect(ids[ids.indexOf("nw_b248") + 1]).toBe("nw_b248_vo");
    expect(ids[ids.indexOf("nw_b248_vo") + 1]).toBe("nw_b249");
    const vo = beatOf(narrated, "nw_b248_vo");
    expect(vo.text).toBe(V2);
    expect(wordCount(V2)).toBe(37);
    expect(vo.characterId).toBe(JACK_VO_CHARACTER_ID);
    expect(vo.silent).toBe(true);
    expect(vo.durationFrames).toBe(Math.round(16 * FPS)); // 37 words, about 16 seconds
    // the train's sound stays on the beat it was on
    expect(beatOf(narrated, "nw_b248").sfxUrl).toBe("/film/sfx/train-inside-2.mp3");
    expect(vo.sfxUrl).toBeUndefined();
  });

  it("adds V3 after the photograph is set down on the desk, before 'I'm sorry.'", () => {
    const ids = idsOf(narrated);
    expect(ids[ids.indexOf("nw_b260") + 1]).toBe("nw_b260_vo");
    expect(ids[ids.indexOf("nw_b260_vo") + 1]).toBe("nw_b261");
    expect(beatOf(narrated, "nw_b260").text).toMatch(/squares it to the edge of the desk\.$/);
    const vo = beatOf(narrated, "nw_b260_vo");
    expect(vo.text).toBe(V3);
    expect(vo.durationFrames).toBe(Math.round(voiceOverSeconds(V3) * FPS));
    // the scene still runs on to the next scene from its last beat, as it did
    const last = sceneOf(narrated).dialogueBeats!.at(-1)!;
    expect(last.id).toBe("nw_b278");
    expect(last.afterBeatTargetSceneId).toBe("nw_s11");
    expect(last.afterBeatMode).toBe("auto");
  });

  it("holds each replaced beat at least as long as the film did, and long enough to read Jack's words", () => {
    const framesOf = (project: typeof noir, id: string) =>
      buildTimelineClips(buildKeyframes(project.story), voiceMap).clips.find((c) => c.keyframe.id === id)!.durationFrames;
    for (const [i, id] of ["nw_b229", "nw_b230", "nw_b231"].entries()) {
      expect(framesOf(narrated, id)).toBeGreaterThanOrEqual(framesOf(noir, id));
      expect(framesOf(narrated, id)).toBeGreaterThanOrEqual(Math.round(voiceOverSeconds(V1[i]) * FPS));
    }
    for (const id of ["nw_b248_vo", "nw_b260_vo"]) {
      const text = String(beatOf(narrated, id).text);
      expect(framesOf(narrated, id) / FPS).toBeGreaterThanOrEqual(voiceOverSeconds(text) - 0.05);
    }
  });

  it("shows each voice-over in captions that fit two lines and lose no word", () => {
    const { clips } = buildTimelineClips(buildKeyframes(narrated.story), voiceMap);
    for (const [id, text] of [["nw_b248_vo", V2], ["nw_b260_vo", V3], ["nw_b229", V1[0]], ["nw_b231", V1[2]]] as const) {
      const clip = clips.find((c) => c.keyframe.id === id)!;
      const caps = effectiveCaptionsForBeat(clip.keyframe.beat, clip.durationFrames);
      expect(caps.length).toBeGreaterThan(0);
      for (const cap of caps) {
        expect(wrapCaptionLines(cap.text, 42).length).toBeLessThanOrEqual(2);
        expect(cap.outFrame).toBeGreaterThan(cap.inFrame);
        expect(cap.outFrame).toBeLessThanOrEqual(clip.durationFrames);
      }
      expect(caps.map((c) => c.text).join(" ").replace(/\s+/g, " ")).toBe(text);
    }
  });
});

describe("Jack's Narrated Cut: everything else is Jack's Noir", () => {
  it("leaves every other scene exactly as Jack's Noir has it", () => {
    expect(narrated.story.scenes.map((s) => s.id)).toEqual(noir.story.scenes.map((s) => s.id));
    for (const scene of noir.story.scenes) {
      if (scene.id === "nw_s10") continue;
      expect(JSON.stringify(sceneOf(narrated, scene.id)), scene.id).toBe(JSON.stringify(scene));
    }
  });

  it("changes only the beats of scene 10 the plan names, and adds only the two voice-over beats", () => {
    const touched = new Set(["nw_b229", "nw_b230", "nw_b231", "nw_b232", "nw_b236", "nw_b238"]);
    const noirIds = idsOf(noir);
    expect(idsOf(narrated).filter((id) => !noirIds.includes(id))).toEqual(["nw_b248_vo", "nw_b260_vo"]);
    expect(idsOf(narrated).filter((id) => noirIds.includes(id))).toEqual(noirIds);
    for (const beat of sceneOf(noir).dialogueBeats!) {
      if (touched.has(String(beat.id))) continue;
      expect(beatOf(narrated, String(beat.id)), String(beat.id)).toEqual(beat);
    }
  });

  it("plays the same pictures in the same order, and the same recorded voices", () => {
    const picturesOf = (project: typeof noir) =>
      buildKeyframes(project.story)
        .filter((f) => !String(f.id).endsWith("_vo"))
        .map((f) => `${f.id}|${f.picture ?? ""}`);
    expect(picturesOf(narrated)).toEqual(picturesOf(noir));
    const voices = (project: typeof noir) =>
      buildKeyframes(project.story).filter((f) => f.beat.audioUrl).map((f) => `${f.id}|${f.beat.audioUrl}`);
    expect(voices(narrated)).toEqual(voices(noir));
  });

  it("adds no new pictures and no new sounds", () => {
    const picturesOf = (project: typeof noir) =>
      new Set(buildKeyframes(project.story).map((f) => f.picture).filter((p): p is string => Boolean(p)));
    expect([...picturesOf(narrated)].filter((p) => !picturesOf(uncut).has(p))).toEqual([]);
    const soundsOf = (project: typeof noir) => {
      const out = new Set<string>();
      for (const c of project.audioClips ?? []) out.add(c.src);
      for (const s of project.story.scenes) {
        for (const part of String(s.ambientAudio ?? "").split("+")) if (part) out.add(part.replace(/^file:/, ""));
        if (s.musicUrl) out.add(String(s.musicUrl));
        for (const b of s.dialogueBeats ?? []) {
          if (b.audioUrl) out.add(String(b.audioUrl));
          if (b.sfxUrl) out.add(String(b.sfxUrl));
        }
      }
      return out;
    };
    const known = soundsOf(noir);
    expect([...soundsOf(narrated)].filter((s) => !known.has(s))).toEqual([]);
  });

  it("keeps the film running scene to scene, and makes the film longer by what the voice-over adds", () => {
    const total = (project: typeof noir) => buildTimelineClips(buildKeyframes(project.story), voiceMap).totalFrames;
    const addedFrames = ["nw_b248_vo", "nw_b260_vo"].reduce((n, id) => n + Number(beatOf(narrated, id).durationFrames), 0);
    const holds = ["nw_b229", "nw_b230", "nw_b231"].reduce((n, id) => {
      const frames = (project: typeof noir) =>
        buildTimelineClips(buildKeyframes(project.story), voiceMap).clips.find((c) => c.keyframe.id === id)!.durationFrames;
      return n + (frames(narrated) - frames(noir));
    }, 0);
    expect(total(narrated) - total(noir)).toBe(addedFrames + holds);
    expect(buildKeyframes(narrated.story).map((f) => f.sceneId).filter((s, i, a) => a.indexOf(s) === i)).toEqual(
      buildKeyframes(noir.story).map((f) => f.sceneId).filter((s, i, a) => a.indexOf(s) === i),
    );
  });

  it("keeps every sound glued to its picture: nothing before scene 10 moves, everything after it moves together", () => {
    const timeline = (project: typeof noir) => buildTimelineClips(buildKeyframes(project.story), voiceMap);
    const tNoir = timeline(noir);
    const tNarrated = timeline(narrated);
    const added = tNarrated.totalFrames - tNoir.totalFrames;
    expect(added).toBeGreaterThan(0);
    const addedMs = (added * 1000) / FPS;
    const resolved = (project: typeof noir, t: typeof tNoir) => new Map(resolveAudioClips(project.audioClips, t.clips).map((c) => [c.id, c]));
    const before = resolved(noir, tNoir);
    const after = resolved(narrated, tNarrated);
    // the same sounds, and no new ones
    expect([...after.keys()]).toEqual([...before.keys()]);
    const scene10 = tNarrated.clips.find((c) => c.keyframe.sceneId === "nw_s10")!.keyframe.sceneIndex;
    const sceneIndexOf = (anchorId: string) => tNarrated.clips.find((c) => c.keyframe.id === anchorId)!.keyframe.sceneIndex;
    let untouched = 0;
    let moved = 0;
    for (const [id, clip] of after) {
      const was = before.get(id)!;
      expect(clip.src).toBe(was.src);
      expect(clip.anchorId).toBe(was.anchorId);
      expect(clip.gain).toBe(was.gain);
      const delta = clip.startMs - was.startMs;
      expect(delta, `${clip.src} must never play earlier`).toBeGreaterThanOrEqual(0);
      if (sceneIndexOf(clip.anchorId) < scene10) {
        expect(delta, `${clip.src} is before scene 10`).toBe(0);
        untouched += 1;
      } else if (sceneIndexOf(clip.anchorId) > scene10) {
        expect(delta, `${clip.src} is after scene 10`).toBeCloseTo(addedMs, 0); // the whole voice-over, to the millisecond
        moved += 1;
      }
    }
    expect(untouched).toBeGreaterThan(50);
    expect(moved).toBeGreaterThan(500);
    // the room's ambience still runs under all of scene 10, voice-over included
    const room = (clips: Map<string, { src: string; durationMs: number }>) => [...clips.values()].find((c) => c.src.endsWith("amb-office.mp3"))!;
    expect(room(after).durationMs - room(before).durationMs).toBeCloseTo(addedMs, 0);
  });
});

describe("applyJackNarration on a small story", () => {
  const beat = (id: string, text: string, extra: Partial<BeatLike> = {}): BeatLike => ({
    id,
    characterId: "nw_narrator",
    text,
    silent: true,
    ...extra,
  });
  const makeStory = (): StoryLike => ({
    id: "t",
    startSceneId: "a",
    characters: [{ id: "nw_narrator", name: "Narrator" }],
    scenes: [
      {
        id: "a",
        title: "A",
        background: "/p/a.jpg",
        transition: "dissolve",
        transitionSpeed: 0.9,
        dialogueBeats: [
          beat("a1", "He sits at the desk.", { cinematic: { zoom: 1.1 }, sfxUrl: "/s/lighter.mp3", sfxVolume: 0.5, captions: [{ text: "old", inFrame: 0, outFrame: 10 }] }),
          beat("a2", "Nothing happens for a while."),
          beat("a3", "The phone does not ring.", { afterBeatTargetSceneId: "b", afterBeatMode: "auto", afterBeatDelaySeconds: 1 }),
        ],
      },
      { id: "b", title: "B", dialogueBeats: [beat("b1", "Next scene.")] },
    ],
  });
  const plan = (ops: SceneNarration["ops"]): SceneNarration[] => [{ sceneId: "a", note: "test", ops }];

  it("replaces a caption, keeping the picture, the camera and the sound, and never shortening the shot", () => {
    const story = makeStory();
    const before = clipFrames(buildKeyframes(story).find((f) => f.id === "a1")!);
    const report = applyJackNarration(story, plan([{ op: "replace", beatId: "a1", text: "Short." }]));
    expect(report).toEqual({ replaced: 1, silenced: 0, added: 0, missing: [] });
    const a1 = story.scenes[0].dialogueBeats![0];
    expect(a1).toMatchObject({ text: "Short.", characterId: JACK_VO_CHARACTER_ID, silent: true, cinematic: { zoom: 1.1 }, sfxUrl: "/s/lighter.mp3", sfxVolume: 0.5 });
    expect(a1.captions).toBeUndefined(); // the old authored caption would have hidden the new words
    expect(a1.durationFrames).toBe(Math.max(before, Math.round(voiceOverSeconds("Short.") * FPS)));
    expect(a1.durationFrames!).toBeGreaterThanOrEqual(before);
  });

  it("holds a long voice-over for as long as it takes to say", () => {
    const story = makeStory();
    const long = Array.from({ length: 40 }, (_, i) => `word${i}`).join(" ");
    applyJackNarration(story, plan([{ op: "replace", beatId: "a2", text: long }]));
    expect(story.scenes[0].dialogueBeats![1].durationFrames).toBe(Math.round((40 / VO_WORDS_PER_SECOND) * FPS));
    expect(voiceOverSeconds("one two")).toBe(2); // never under two seconds
  });

  it("silences a caption without touching the beat", () => {
    const story = makeStory();
    const before = clone(story.scenes[0].dialogueBeats![1]);
    expect(applyJackNarration(story, plan([{ op: "silence", beatId: "a2" }])).silenced).toBe(1);
    expect(story.scenes[0].dialogueBeats![1]).toEqual({ ...before, captions: [] });
    const frame = buildKeyframes(story).find((f) => f.id === "a2")!;
    expect(effectiveCaptionsForBeat(frame.beat, clipFrames(frame))).toEqual([]);
  });

  it("adds a voice-over beat after a beat in the middle of a scene, on the picture that is showing", () => {
    const story = makeStory();
    applyJackNarration(story, plan([{ op: "add", after: "a1", id: "a1_vo", text: "I waited." }]));
    expect(story.scenes[0].dialogueBeats!.map((b) => b.id)).toEqual(["a1", "a1_vo", "a2", "a3"]);
    const frames = buildKeyframes(story);
    expect(frames.find((f) => f.id === "a1_vo")!.picture).toBe("/p/a.jpg");
    expect(frames.find((f) => f.id === "a1_vo")!.speaker).toBe("JACK (V.O.)");
    // the scene's last beat still leads on to the next scene
    expect(story.scenes[0].dialogueBeats!.at(-1)).toMatchObject({ id: "a3", afterBeatTargetSceneId: "b" });
    expect(buildKeyframes(story).map((f) => f.sceneId)).toContain("b");
  });

  it("hands the way on to the next scene, and the transition time, to a voice-over added after the scene's last beat", () => {
    const story = makeStory();
    const oldLast = clipFrames(buildKeyframes(story).find((f) => f.id === "a3")!);
    expect(applyJackNarration(story, plan([{ op: "add", after: "a3", id: "a3_vo", text: "I sat there." }])).added).toBe(1);
    const beats = story.scenes[0].dialogueBeats!;
    expect(beats.map((b) => b.id)).toEqual(["a1", "a2", "a3", "a3_vo"]);
    expect(beats[2].afterBeatTargetSceneId).toBeUndefined();
    expect(beats[2].afterBeatMode).toBeUndefined();
    expect(beats[3]).toMatchObject({ afterBeatTargetSceneId: "b", afterBeatMode: "auto", afterBeatDelaySeconds: 1 });
    // the film still goes a -> b, and the scene's dissolve still has its time on the new last beat
    expect(buildKeyframes(story).map((f) => f.sceneId)).toEqual(["a", "a", "a", "a", "b"]);
    const last = buildKeyframes(story).find((f) => f.id === "a3_vo")!;
    expect(clipFrames(last)).toBe(Math.round(voiceOverSeconds("I sat there.") * FPS) + Math.round(0.9 * FPS));
    // and the old last beat no longer carries the transition tail
    expect(clipFrames(buildKeyframes(story).find((f) => f.id === "a3")!)).toBeLessThan(oldLast);
  });

  it("is safe to apply twice, adds Jack's voice once, and reports what it cannot find instead of guessing", () => {
    const story = makeStory();
    const ops: SceneNarration["ops"] = [
      { op: "replace", beatId: "a1", text: "One." },
      { op: "add", after: "a2", id: "a2_vo", text: "Two." },
      { op: "replace", beatId: "gone", text: "Never." },
      { op: "add", after: "also-gone", id: "x_vo", text: "Never." },
    ];
    const first = applyJackNarration(story, plan(ops));
    expect(first).toMatchObject({ replaced: 1, added: 1, missing: ["gone", "also-gone"] });
    const once = clone(story);
    applyJackNarration(story, plan(ops));
    expect(story.scenes[0].dialogueBeats!.map((b) => b.id)).toEqual(once.scenes[0].dialogueBeats!.map((b) => b.id));
    expect((story.characters as { id: string }[]).filter((c) => c.id === JACK_VO_CHARACTER_ID)).toHaveLength(1);
    expect(applyJackNarration(makeStory(), [{ sceneId: "nowhere", note: "", ops: [] }]).missing).toEqual(["nowhere"]);
    expect(applyJackNarration(makeStory(), [])).toEqual({ replaced: 0, silenced: 0, added: 0, missing: [] });
  });
});

describe("the narration plan", () => {
  it("is written down for scene 10, in the film's order", () => {
    expect(JACK_NARRATION.map((s) => s.sceneId)).toEqual(["nw_s10"]);
    const ops = JACK_NARRATION[0].ops;
    expect(ops.filter((o) => o.op === "replace").map((o) => (o as { text: string }).text)).toEqual(V1);
    expect(ops.filter((o) => o.op === "add").map((o) => (o as { after: string }).after)).toEqual(["nw_b248", "nw_b260"]);
    // 37 words is about 16 seconds
    expect(voiceOverSeconds(V2)).toBeCloseTo(16, 5);
  });
});
