// Driving the camera while the film plays: the editor's state for it. The work itself is in cameraDrive.ts.
//
// Armed, the viewer stops being a picture and becomes a camera: the drag moves it, Alt rolls it, the wheel pushes
// in. Every frame that goes by while playing is recorded. Stop, and the take is fitted to keyframes on each shot
// it touched — one undo step. Nothing is written until then, so a take you do not like costs nothing.

import { useCallback, useMemo, useRef, useState } from "react";
import {
  addOffsets,
  addSample,
  commitRecording,
  NO_OFFSET,
  offsetFromDrag,
  sampleDrive,
  zoomFromWheel,
  type DriveOffset,
  type DrivePose,
  type DriveRecording,
  type DrivenShot,
} from "./cameraDrive";
import type { BeatAnimation } from "./model";

export interface CameraDriveBinding {
  armed: boolean;
  /** True once the hand has moved in this take: the viewer says so, and stopping will write something. */
  live: boolean;
  offset: DriveOffset;
  smooth: number;
  /** "add" keeps the shot's own move under the hand; "replace" throws it away. */
  mode: "add" | "replace";
  /** How many frames have been recorded in this take, over how many shots. */
  recorded: { frames: number; shots: number };
  arm: (on: boolean) => void;
  setSmooth: (value: number) => void;
  setMode: (mode: "add" | "replace") => void;
  /** The viewer reports a drag: pixels since the pointer went down, and the viewer's size. */
  onDrag: (drag: { dx: number; dy: number; width: number; height: number; roll?: boolean } | null) => void;
  /** The viewer reports the wheel. */
  onWheel: (deltaY: number) => void;
  /** Called for each frame that plays: records where the camera is. */
  sample: (frameId: string, localFrame: number, basePose: DrivePose) => void;
  /** Throws the take away without writing anything. */
  clear: () => void;
  /** The take as keyframes, shot by shot. Empty when the hand did nothing. */
  take: (baseFor: (frameId: string) => BeatAnimation | undefined) => DrivenShot[];
}

export function useCameraDrive(): CameraDriveBinding {
  const [armed, setArmed] = useState(false);
  const [smooth, setSmooth] = useState(0.5);
  const [mode, setMode] = useState<"add" | "replace">("add");
  const [offset, setOffset] = useState<DriveOffset>(NO_OFFSET);
  const [recorded, setRecorded] = useState({ frames: 0, shots: 0 });

  // The hand's position has to be readable from the playback tick without re-rendering on every frame.
  const offsetRef = useRef<DriveOffset>(NO_OFFSET);
  /** What the hand had done before this drag started: a drag leaves the camera where it let go. */
  const restingRef = useRef<DriveOffset>(NO_OFFSET);
  const recordingRef = useRef<DriveRecording>(new Map());
  const liveRef = useRef(false);
  const [live, setLive] = useState(false);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const put = useCallback((next: DriveOffset) => {
    offsetRef.current = next;
    setOffset(next);
    if (!liveRef.current) {
      liveRef.current = true;
      setLive(true);
    }
  }, []);

  const clear = useCallback(() => {
    offsetRef.current = NO_OFFSET;
    restingRef.current = NO_OFFSET;
    recordingRef.current = new Map();
    liveRef.current = false;
    setOffset(NO_OFFSET);
    setLive(false);
    setRecorded({ frames: 0, shots: 0 });
  }, []);

  const arm = useCallback(
    (on: boolean) => {
      setArmed(on);
      if (!on) clear();
    },
    [clear],
  );

  const onDrag = useCallback(
    (drag: { dx: number; dy: number; width: number; height: number; roll?: boolean } | null) => {
      if (!drag) {
        // The pointer went up: the camera stays where the hand left it.
        restingRef.current = offsetRef.current;
        return;
      }
      put(addOffsets(restingRef.current, offsetFromDrag(drag)));
    },
    [put],
  );

  const onWheel = useCallback(
    (deltaY: number) => {
      const next = addOffsets(offsetRef.current, { ...NO_OFFSET, zoom: zoomFromWheel(deltaY) });
      restingRef.current = next;
      put(next);
    },
    [put],
  );

  const sample = useCallback((frameId: string, localFrame: number, basePose: DrivePose) => {
    if (!liveRef.current) return; // nothing has been touched yet: do not stamp the shot's own move back onto it
    const under = modeRef.current === "replace" ? { zoom: 1, x: 0, y: 0, rotation: 0 } : basePose;
    addSample(recordingRef.current, frameId, {
      frame: Math.max(0, Math.round(localFrame)),
      pose: sampleDrive(under, offsetRef.current),
    });
    let frames = 0;
    for (const samples of recordingRef.current.values()) frames += samples.length;
    setRecorded({ frames, shots: recordingRef.current.size });
  }, []);

  const take = useCallback(
    (baseFor: (frameId: string) => BeatAnimation | undefined): DrivenShot[] => {
      const shots = new Map<string, { base?: BeatAnimation }>();
      for (const frameId of recordingRef.current.keys()) {
        shots.set(frameId, { base: modeRef.current === "replace" ? undefined : baseFor(frameId) });
      }
      return commitRecording(recordingRef.current, shots, smooth);
    },
    [smooth],
  );

  return useMemo(
    () => ({ armed, live, offset, smooth, mode, recorded, arm, setSmooth, setMode, onDrag, onWheel, sample, clear, take }),
    [armed, live, offset, smooth, mode, recorded, arm, onDrag, onWheel, sample, clear, take],
  );
}
