export interface HoldAuditClip {
  id: string;
  scene: string;
  picture?: string;
  text: string;
  durationFrames: number;
  isImage: boolean;
}

interface HoldAuditBeat {
  id: string;
  scene: string;
  text: string;
  durationFrames: number;
}

interface PictureRun {
  scene: string;
  scenes: string[];
  picture?: string;
  isImage: boolean;
  durationFrames: number;
  beats: HoldAuditBeat[];
}

export interface LongPictureHold extends PictureRun {
  seconds: number;
  nextScene?: string;
  nextPicture?: string;
  nextBeat?: HoldAuditBeat;
}

export interface AdjacentImagePair {
  picture: string;
  first: HoldAuditClip;
  second: HoldAuditClip;
  before?: HoldAuditClip;
  after?: HoldAuditClip;
}

/** Find every adjacent pair sharing a still image, irrespective of its duration. */
export function auditAdjacentImagePairs(clips: readonly HoldAuditClip[]): AdjacentImagePair[] {
  const pairs: AdjacentImagePair[] = [];
  for (let i = 1; i < clips.length; i += 1) {
    const first = clips[i - 1];
    const second = clips[i];
    if (!first.isImage || !second.isImage || !first.picture || first.picture !== second.picture) continue;
    pairs.push({ picture: first.picture, first, second, before: clips[i - 2], after: clips[i + 1] });
  }
  return pairs;
}

/** Inspect still-image holds without modifying the source timeline. */
export function auditPictureHolds(
  clips: readonly HoldAuditClip[],
  fps: number,
  groupAcrossScenes: boolean,
): LongPictureHold[] {
  const runs: PictureRun[] = [];
  for (const clip of clips) {
    let run = runs[runs.length - 1];
    if (!run || !clip.picture || run.picture !== clip.picture || run.isImage !== clip.isImage ||
        (!groupAcrossScenes && run.scene !== clip.scene)) {
      run = { scene: clip.scene, scenes: [], picture: clip.picture, isImage: clip.isImage, durationFrames: 0, beats: [] };
      runs.push(run);
    }
    if (!run.scenes.includes(clip.scene)) run.scenes.push(clip.scene);
    run.durationFrames += clip.durationFrames;
    run.beats.push({ id: clip.id, scene: clip.scene, text: clip.text, durationFrames: clip.durationFrames });
  }
  return runs.flatMap((run, index) => {
    if (!run.picture || !run.isImage || run.durationFrames <= 7 * fps) return [];
    const next = runs[index + 1];
    return [{ ...run, seconds: run.durationFrames / fps, nextScene: next?.scene, nextPicture: next?.picture, nextBeat: next?.beats[0] }];
  });
}
