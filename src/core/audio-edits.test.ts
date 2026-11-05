import { describe, expect, it } from "vitest";
import { buildTimelineClips, type TimelineClip } from "../sequence/animate";
import {
  evaluateClipGainAtElapsedMs,
  MIN_AUDIO_CLIP_MS,
  resolveAudioClips,
  volumeScaleAtMs,
  type AudioClip,
  type ResolvedAudioClip,
} from "./audioClips";
import {
  crossfadeAudioClips,
  duplicateAudioClip,
  fitAudioClipToSpanMs,
  nextClipOnLane,
  plainAudioClip,
  splitAudioClipAtMs,
  splitVolumeKeys,
  trimAudioClipEdgeToMs,
} from "./audioEdits";
import { buildKeyframes, createProjectState, parseImportPayload, type ProjectState } from "./model";

// Three shots of 2 s, 3 s and 5 s, so the timeline is 10 s long and every millisecond below is easy to read.
function makeFixture(): { project: ProjectState; clips: TimelineClip[] } {
  const rawStory = {
    id: "audio-edits-fixture",
    title: "Audio edits fixture",
    startSceneId: "sc1",
    scenes: [
      {
        id: "sc1",
        title: "Scene One",
        autoAdvanceTargetSceneId: "sc2",
        background: "/film/img/sc1.png",
        dialogueBeats: [
          { id: "b1", text: "One.", durationFrames: 48 }, // 0 – 2,000 ms
          { id: "b2", text: "Two.", durationFrames: 72 }, // 2,000 – 5,000 ms
        ],
      },
      {
        id: "sc2",
        title: "Scene Two",
        background: "/film/img/sc2.png",
        dialogueBeats: [{ id: "b3", text: "Three.", durationFrames: 120 }], // 5,000 – 10,000 ms
      },
    ],
  };
  const imported = parseImportPayload(rawStory, "audio-edits-fixture.json");
  const project = createProjectState(imported, []);
  const { clips } = buildTimelineClips(buildKeyframes(project.story), new Map());
  return { project, clips };
}

const { clips: TIMELINE } = makeFixture();

function cue(patch: Partial<AudioClip> = {}): AudioClip {
  return {
    id: "ac-music-1",
    lane: "music",
    src: "/film/audio/theme.mp3",
    anchorId: "b1",
    offsetMs: 0,
    inMs: 0,
    durationMs: 8000,
    gain: 0.7,
    fadeInMs: 0,
    fadeOutMs: 0,
    ...patch,
  };
}

function resolve(...audio: AudioClip[]): ResolvedAudioClip[] {
  return resolveAudioClips(audio, TIMELINE);
}
const one = (clip: AudioClip): ResolvedAudioClip => resolve(clip)[0];

describe("cutting a music cue in two", () => {
  it("cuts at the playhead: the second half plays the recording on from where the first stopped", () => {
    const music = one(cue({ inMs: 1500, durationMs: 6000 })); // 0 – 6,000 ms on the timeline
    const split = splitAudioClipAtMs(music, 2500, TIMELINE, { newId: "ac-music-2" })!;
    expect(split).not.toBeNull();

    expect(split.left.id).toBe("ac-music-1");
    expect(split.left.inMs).toBe(1500);
    expect(split.left.durationMs).toBe(2500);

    expect(split.right.id).toBe("ac-music-2");
    expect(split.right.inMs).toBe(4000); // 1,500 into the file, plus the 2,500 the first half played
    expect(split.right.durationMs).toBe(3500);

    const [left, right] = resolve(split.left, split.right);
    expect(left.startMs).toBe(0);
    expect(left.endMs).toBe(2500);
    expect(right.startMs).toBe(2500); // no gap and no overlap: the music carries straight on
    expect(right.endMs).toBe(6000);
    expect(right.src).toBe(music.src);
    expect(right.lane).toBe("music");
    expect(right.gain).toBe(music.gain);
  });

  it("re-anchors the second half to the shot it now starts under", () => {
    const music = one(cue({ durationMs: 9000 }));
    const split = splitAudioClipAtMs(music, 6000, TIMELINE, { newId: "ac-b" })!;
    expect(split.right.anchorId).toBe("b3"); // 6,000 ms is inside the third shot (5,000 – 10,000)
    expect(split.right.offsetMs).toBe(1000);
    expect(resolve(split.right)[0].startMs).toBe(6000);
  });

  it("keeps the cue's fade-in on the first half and its fade-out on the second, and never fades at the cut", () => {
    const music = one(cue({ durationMs: 8000, fadeInMs: 1000, fadeOutMs: 2000 }));
    const split = splitAudioClipAtMs(music, 4000, TIMELINE)!;
    expect(split.left.fadeInMs).toBe(1000);
    expect(split.left.fadeOutMs).toBe(0);
    expect(split.right.fadeInMs).toBe(0);
    expect(split.right.fadeOutMs).toBe(2000);
    // the join plays at full level on both sides: the cut is a cut, not a dip
    expect(evaluateClipGainAtElapsedMs(split.left, split.left.durationMs)).toBeCloseTo(0.7, 6);
    expect(evaluateClipGainAtElapsedMs(split.right, 0)).toBeCloseTo(0.7, 6);
  });

  it("shortens a fade that the cut lands inside, rather than leaving it hanging over the join", () => {
    const music = one(cue({ durationMs: 8000, fadeInMs: 3000, fadeOutMs: 3000 }));
    const split = splitAudioClipAtMs(music, 1000, TIMELINE)!;
    expect(split.left.durationMs).toBe(1000);
    expect(split.left.fadeInMs).toBe(1000); // clamped to what is left of the clip
    expect(split.left.fadeInMs + split.left.fadeOutMs).toBeLessThanOrEqual(split.left.durationMs);
    expect(split.right.fadeInMs + split.right.fadeOutMs).toBeLessThanOrEqual(split.right.durationMs);
  });

  it("splits the volume curve so neither half's shape changes", () => {
    const keys = [
      { atMs: 0, gain: 0.2 },
      { atMs: 2000, gain: 1 },
      { atMs: 6000, gain: 0.4 },
    ];
    const music = one(cue({ durationMs: 8000, volumeKeys: keys }));
    const split = splitAudioClipAtMs(music, 4000, TIMELINE)!;
    expect(split.left.volumeKeys).toBeDefined();
    expect(split.right.volumeKeys).toBeDefined();
    // the same curve, read through the two halves, at every 250 ms
    for (let t = 0; t <= 8000; t += 250) {
      const before = volumeScaleAtMs(music, t);
      const after =
        t <= 4000
          ? volumeScaleAtMs(split.left, t)
          : volumeScaleAtMs(split.right, t - 4000);
      expect(after, `${t} ms`).toBeCloseTo(before, 6);
    }
    expect(split.right.volumeKeys![0]).toEqual({ atMs: 0, gain: volumeScaleAtMs(music, 4000) });
  });

  it("leaves a cue without a curve without one", () => {
    const split = splitAudioClipAtMs(one(cue()), 3000, TIMELINE)!;
    expect(split.left.volumeKeys).toBeUndefined();
    expect(split.right.volumeKeys).toBeUndefined();
    expect(splitVolumeKeys({ durationMs: 8000 }, 1000)).toEqual({});
  });

  it("wraps a looping cue's in-point around the end of the recording", () => {
    const music = one(cue({ loop: true, inMs: 9000, durationMs: 8000 }));
    const split = splitAudioClipAtMs(music, 5000, TIMELINE, { fileDurationMs: 12000 })!;
    expect(split.right.inMs).toBe(2000); // 9,000 + 5,000 is 2,000 past the end of a 12 s recording
    expect(split.right.loop).toBe(true);
  });

  it("refuses a cut that is not inside the cue, or that would leave a sliver", () => {
    const music = one(cue({ durationMs: 4000 }));
    expect(splitAudioClipAtMs(music, 0, TIMELINE)).toBeNull();
    expect(splitAudioClipAtMs(music, 4000, TIMELINE)).toBeNull();
    expect(splitAudioClipAtMs(music, -500, TIMELINE)).toBeNull();
    expect(splitAudioClipAtMs(music, 9000, TIMELINE)).toBeNull();
    expect(splitAudioClipAtMs(music, MIN_AUDIO_CLIP_MS / 2, TIMELINE)).toBeNull();
    expect(splitAudioClipAtMs(music, MIN_AUDIO_CLIP_MS, TIMELINE)).not.toBeNull();
  });

  it("changes nothing about the clip it was given", () => {
    const stored = cue({ durationMs: 6000, volumeKeys: [{ atMs: 0, gain: 1 }] });
    const before = JSON.stringify(stored);
    splitAudioClipAtMs(one(stored), 3000, TIMELINE);
    expect(JSON.stringify(stored)).toBe(before);
  });
});

describe("trimming a cue to the playhead", () => {
  it("pulls the start to the playhead and takes the in-point with it, so the music stays in step", () => {
    const music = one(cue({ inMs: 2000, durationMs: 6000 }));
    const trimmed = trimAudioClipEdgeToMs(music, "start", 1500, TIMELINE)!;
    const [resolved] = resolve(trimmed);
    expect(resolved.startMs).toBe(1500);
    expect(resolved.endMs).toBe(6000); // the end does not move
    expect(trimmed.inMs).toBe(3500); // 1.5 s of the recording is skipped
  });

  it("stops the cue at the playhead when trimming the end", () => {
    const music = one(cue({ durationMs: 6000 }));
    const trimmed = trimAudioClipEdgeToMs(music, "end", 4000, TIMELINE)!;
    const [resolved] = resolve(trimmed);
    expect(resolved.startMs).toBe(0);
    expect(resolved.endMs).toBe(4000);
    expect(trimmed.inMs).toBe(0); // trimming the end never moves the recording
  });

  it("will not pull the start before the beginning of the recording", () => {
    const music = one(cue({ anchorId: "b2", offsetMs: 0, inMs: 500, durationMs: 3000 })); // 2,000 – 5,000 ms
    const trimmed = trimAudioClipEdgeToMs(music, "start", 0, TIMELINE)!;
    const [resolved] = resolve(trimmed);
    expect(trimmed.inMs).toBe(0);
    expect(resolved.startMs).toBe(1500); // only the half second the recording had spare
  });

  it("will not let the end run past the end of the recording", () => {
    const music = one(cue({ durationMs: 4000 }));
    const trimmed = trimAudioClipEdgeToMs(music, "end", 9000, TIMELINE, 6000)!;
    expect(trimmed.durationMs).toBe(6000);
  });

  it("says no when the playhead is outside the cue or would leave a sliver", () => {
    const music = one(cue({ anchorId: "b2", durationMs: 3000 })); // 2,000 – 5,000 ms
    expect(trimAudioClipEdgeToMs(music, "start", 5000, TIMELINE)).toBeNull();
    expect(trimAudioClipEdgeToMs(music, "end", 2000, TIMELINE)).toBeNull();
    expect(trimAudioClipEdgeToMs(music, "end", 5000, TIMELINE)).toBeNull(); // already there
    expect(trimAudioClipEdgeToMs(music, "start", 2000, TIMELINE)).toBeNull(); // already there
  });
});

describe("crossfading one cue into the next", () => {
  const outgoing = () => cue({ id: "ac-a", durationMs: 4000 }); // 0 – 4,000 ms
  const incoming = () =>
    cue({ id: "ac-b", src: "/film/audio/second.mp3", anchorId: "b2", offsetMs: 2000, inMs: 3000, durationMs: 4000 }); // 4,000 – 8,000 ms

  it("holds the first cue over the start of the second and ramps one into the other", () => {
    const [a, b] = resolve(outgoing(), incoming());
    const result = crossfadeAudioClips(a, b, 1000, TIMELINE, { outgoingFileMs: 30000, incomingFileMs: 30000 })!;
    expect(result.overlapMs).toBe(1000);
    expect(result.from).toBe("tail");
    const [ra, rb] = resolve(result.outgoing, result.incoming);
    expect(ra.endMs).toBe(5000); // the first cue plays a second into the second cue
    expect(rb.startMs).toBe(4000); // which has not moved
    expect(result.outgoing.fadeOutMs).toBe(1000);
    expect(result.incoming.fadeInMs).toBe(1000);
    // halfway through the overlap the two together are near enough one cue's level
    const down = evaluateClipGainAtElapsedMs(result.outgoing, result.outgoing.durationMs - 500);
    const up = evaluateClipGainAtElapsedMs(result.incoming, 500);
    expect(down).toBeCloseTo(0.35, 6);
    expect(up).toBeCloseTo(0.35, 6);
  });

  it("closes a gap between the two cues before overlapping them", () => {
    const [a, b] = resolve(outgoing(), cue({ id: "ac-b", anchorId: "b3", offsetMs: 1000, durationMs: 3000 })); // 6,000 ms
    const result = crossfadeAudioClips(a, b, 500, TIMELINE, { outgoingFileMs: 30000 })!;
    const [ra] = resolve(result.outgoing);
    expect(ra.endMs).toBe(6500);
    expect(result.overlapMs).toBe(500);
  });

  it("pulls the second cue in early when the first recording has nothing left to give", () => {
    const [a, b] = resolve(outgoing(), incoming());
    const result = crossfadeAudioClips(a, b, 1000, TIMELINE, { outgoingFileMs: 4000, incomingFileMs: 30000 })!;
    const [ra, rb] = resolve(result.outgoing, result.incoming);
    expect(ra.endMs).toBe(4000); // the first cue is at the end of its recording
    expect(rb.startMs).toBe(3000); // so the second starts a second early instead
    expect(result.incoming.inMs).toBe(2000); // and plays a second more of its own head
    expect(result.overlapMs).toBe(1000);
    expect(result.from).toBe("head");
  });

  it("takes what it can from both when neither has a whole second spare", () => {
    const [a, b] = resolve(outgoing(), cue({ id: "ac-b", anchorId: "b2", offsetMs: 2000, inMs: 400, durationMs: 4000 }));
    const result = crossfadeAudioClips(a, b, 1000, TIMELINE, { outgoingFileMs: 4600, incomingFileMs: 30000 })!;
    expect(result.overlapMs).toBe(1000);
    expect(result.from).toBe("both");
    const [ra, rb] = resolve(result.outgoing, result.incoming);
    expect(ra.endMs).toBe(4600);
    expect(rb.startMs).toBe(3600);
  });

  it("falls back to a fade-out into a fade-in when neither recording has anything spare", () => {
    const [a, b] = resolve(outgoing(), cue({ id: "ac-b", anchorId: "b2", offsetMs: 2000, inMs: 0, durationMs: 4000 }));
    const result = crossfadeAudioClips(a, b, 800, TIMELINE, { outgoingFileMs: 4000, incomingFileMs: 30000 })!;
    expect(result.overlapMs).toBe(0);
    expect(result.from).toBe("none");
    expect(result.outgoing.fadeOutMs).toBe(800);
    expect(result.incoming.fadeInMs).toBe(800);
  });

  it("shortens the first cue when the two already overlap by more than asked", () => {
    const [a, b] = resolve(cue({ id: "ac-a", durationMs: 7000 }), incoming());
    const result = crossfadeAudioClips(a, b, 500, TIMELINE, { outgoingFileMs: 30000 })!;
    const [ra] = resolve(result.outgoing);
    expect(ra.endMs).toBe(4500);
    expect(result.overlapMs).toBe(500);
  });

  it("lets a looping cue hold as long as it needs to", () => {
    const [a, b] = resolve(cue({ id: "ac-a", loop: true, durationMs: 4000 }), incoming());
    const result = crossfadeAudioClips(a, b, 1500, TIMELINE, { outgoingFileMs: 2000 })!;
    expect(result.overlapMs).toBe(1500);
    expect(resolve(result.outgoing)[0].endMs).toBe(5500);
  });

  it("refuses a second cue that starts before the first", () => {
    const [a, b] = resolve(outgoing(), incoming());
    expect(crossfadeAudioClips(b, a, 1000, TIMELINE)).toBeNull();
    expect(crossfadeAudioClips(a, b, 0, TIMELINE)).toBeNull();
  });

  it("finds the next cue on the same lane and ignores the other lanes", () => {
    const resolved = resolve(
      cue({ id: "ac-a", durationMs: 3000 }),
      cue({ id: "ac-sfx", lane: "sfx", anchorId: "b2", offsetMs: 500, durationMs: 500 }),
      cue({ id: "ac-b", anchorId: "b2", offsetMs: 2000, durationMs: 3000 }),
    );
    const first = resolved.find((c) => c.id === "ac-a")!;
    expect(nextClipOnLane(resolved, first)?.id).toBe("ac-b");
    expect(nextClipOnLane(resolved, resolved.find((c) => c.id === "ac-b")!)).toBeUndefined();
  });
});

describe("laying a cue across a span", () => {
  it("starts it at the top of the span and runs it to the end", () => {
    const music = one(cue({ durationMs: 2000 }));
    const { clip, looped, short } = fitAudioClipToSpanMs(music, 5000, 10000, TIMELINE, { fileDurationMs: 30000 });
    const [resolved] = resolve(clip);
    expect(resolved.startMs).toBe(5000);
    expect(resolved.endMs).toBe(10000);
    expect(resolved.anchorId).toBe("b3");
    expect(looped).toBe(false);
    expect(short).toBe(false);
    expect(clip.loop).toBeUndefined();
  });

  it("loops a recording that is too short to reach the end of the span", () => {
    const music = one(cue({ durationMs: 2000 }));
    const { clip, looped, short } = fitAudioClipToSpanMs(music, 0, 10000, TIMELINE, { fileDurationMs: 4000 });
    expect(looped).toBe(true);
    expect(short).toBe(false);
    expect(clip.loop).toBe(true);
    expect(clip.durationMs).toBe(10000);
  });

  it("stops where the recording stops when looping is not wanted, and says so", () => {
    const music = one(cue({ durationMs: 2000, inMs: 1000 }));
    const { clip, looped, short } = fitAudioClipToSpanMs(music, 0, 10000, TIMELINE, {
      fileDurationMs: 4000,
      allowLoop: false,
    });
    expect(looped).toBe(false);
    expect(short).toBe(true);
    expect(clip.durationMs).toBe(3000); // the 3 s of recording left after its in-point
    expect(clip.loop).toBeUndefined();
  });

  it("keeps the cue's fades, shortened to fit, unless told not to", () => {
    const music = one(cue({ durationMs: 8000, fadeInMs: 2000, fadeOutMs: 2000 }));
    const kept = fitAudioClipToSpanMs(music, 0, 3000, TIMELINE, { fileDurationMs: 30000 }).clip;
    expect(kept.fadeInMs + kept.fadeOutMs).toBeLessThanOrEqual(kept.durationMs);
    const dropped = fitAudioClipToSpanMs(music, 0, 3000, TIMELINE, { keepFades: false }).clip;
    expect(dropped.fadeInMs).toBe(0);
    expect(dropped.fadeOutMs).toBe(0);
  });
});

describe("copying a cue", () => {
  it("lays the copy down where the first one ends", () => {
    const music = one(cue({ durationMs: 3000, fadeInMs: 500 }));
    const copy = duplicateAudioClip(music, TIMELINE, { newId: "ac-copy" });
    const [resolved] = resolve(copy);
    expect(copy.id).toBe("ac-copy");
    expect(resolved.startMs).toBe(3000);
    expect(resolved.durationMs).toBe(3000);
    expect(resolved.fadeInMs).toBe(500);
    expect(resolved.src).toBe(music.src);
  });

  it("can be put anywhere instead", () => {
    const copy = duplicateAudioClip(one(cue({ durationMs: 3000 })), TIMELINE, { startMs: 7000 });
    expect(resolve(copy)[0].startMs).toBe(7000);
    expect(copy.anchorId).toBe("b3");
  });

  it("plainAudioClip drops the fields the timeline works out", () => {
    const resolved = one(cue());
    const plain = plainAudioClip(resolved) as Partial<ResolvedAudioClip>;
    expect(plain.startMs).toBeUndefined();
    expect(plain.endMs).toBeUndefined();
    expect(plain.anchorStartMs).toBeUndefined();
    expect(plain.id).toBe(resolved.id);
  });
});
