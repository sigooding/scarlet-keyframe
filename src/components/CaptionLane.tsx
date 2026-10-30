import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  addCaptionInGap,
  captionMetrics,
  resolveTimelineCaptions,
  splitCaptionAtCursor,
  updateCaptionText,
  type BeatCaption,
  type ResolvedTimelineCaption,
} from "../core/captions";
import { FPS } from "../core/timing";
import type { TimelineClip } from "../sequence/animate";
import { snapFrame, type SnapTarget } from "../sequence/snap";

export interface SelectedCaptionState {
  frameId: string;
  indices: number[];
}

export interface CaptionLaneProps {
  laneRef?: (el: HTMLDivElement | null) => void;
  height?: number;
  allClips?: TimelineClip[];
  visibleClips: TimelineClip[];
  resolvedCaptions?: ResolvedTimelineCaption[];
  totalFrames?: number;
  pxPerFrame: number;
  playheadFrame: number;
  snapEnabled: boolean;
  selectedFrameId: string;
  selectedCaption: SelectedCaptionState | null;
  multiSelectedCaptions?: ReadonlyArray<{ frameId: string; index: number }>;
  multiSelectionTotalCount?: number;
  rawFrameFromClientX: (clientX: number) => number;
  onSetSnapGuide: (frame: number | null) => void;
  onSelectCaption: (
    frameId: string,
    captionIndex: number,
    extendNeighbour: boolean,
    targetFrame?: number,
  ) => void;
  onClearCaptionSelection: () => void;
  onCommitCaptions: (
    frameId: string,
    captions: BeatCaption[],
    clipDurationFrames: number,
    label: string,
    nextSelectedIndices?: number[],
  ) => void;
  onCaptionPreview: (
    frameId: string,
    captions: BeatCaption[],
    clipDurationFrames: number,
  ) => void;
  onBeginFreeCaptionDrag?: () => void;
  onPreviewFreeCaptionMove?: (
    sourceFrameId: string,
    captionIndex: number,
    targetGlobalInFrame: number,
    targetGlobalOutFrame: number,
    copy: boolean,
  ) => void;
  onCommitFreeCaptionMove?: (label: string) => void;
  onCancelFreeCaptionMove?: () => void;
  onBeginMultiDrag?: () => void;
  onPreviewMultiDrag?: (deltaMs: number, copy: boolean) => void;
  onCommitMultiDrag?: (copy: boolean) => void;
  onCancelMultiDrag?: () => void;
  onDragStart: () => void;
  onDragEnd: (label: string) => void;
}

interface ActiveCaptionDrag {
  mode: "move" | "trim-in" | "trim-out" | "multi";
  pointerId: number;
  startClientX: number;
  startRawFrame: number;
  sourceFrameId: string;
  captionIndex: number;
  origGlobalIn: number;
  origGlobalOut: number;
  targets: SnapTarget[];
  moved: boolean;
  copy: boolean;
}

export function CaptionLane({
  laneRef,
  height,
  allClips,
  visibleClips,
  resolvedCaptions: resolvedCaptionsProp,
  totalFrames,
  pxPerFrame,
  playheadFrame,
  snapEnabled,
  selectedFrameId,
  selectedCaption,
  multiSelectedCaptions,
  multiSelectionTotalCount = 0,
  rawFrameFromClientX,
  onSetSnapGuide,
  onSelectCaption,
  onClearCaptionSelection,
  onCommitCaptions,
  onBeginFreeCaptionDrag,
  onPreviewFreeCaptionMove,
  onCommitFreeCaptionMove,
  onCancelFreeCaptionMove,
  onBeginMultiDrag,
  onPreviewMultiDrag,
  onCommitMultiDrag,
  onCancelMultiDrag,
  onDragStart,
  onDragEnd,
}: CaptionLaneProps) {
  const [editing, setEditing] = useState<{
    frameId: string;
    index: number;
    draft: string;
  } | null>(null);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const closedByKeyRef = useRef(false);
  const suppressClickRef = useRef(false);
  const dragSessionRef = useRef<ActiveCaptionDrag | null>(null);

  // Keep latest callbacks in refs for window pointer listeners
  const latestRef = useRef({
    pxPerFrame,
    snapEnabled,
    totalFrames:
      totalFrames ??
      (allClips?.length
        ? allClips[allClips.length - 1].endFrame
        : visibleClips.length
          ? visibleClips[visibleClips.length - 1].endFrame
          : 1),
    rawFrameFromClientX,
    onSetSnapGuide,
    onBeginFreeCaptionDrag,
    onPreviewFreeCaptionMove,
    onCommitFreeCaptionMove,
    onCancelFreeCaptionMove,
    onBeginMultiDrag,
    onPreviewMultiDrag,
    onCommitMultiDrag,
    onCancelMultiDrag,
    onDragStart,
    onDragEnd,
  });
  latestRef.current = {
    pxPerFrame,
    snapEnabled,
    totalFrames:
      totalFrames ??
      (allClips?.length
        ? allClips[allClips.length - 1].endFrame
        : visibleClips.length
          ? visibleClips[visibleClips.length - 1].endFrame
          : 1),
    rawFrameFromClientX,
    onSetSnapGuide,
    onBeginFreeCaptionDrag,
    onPreviewFreeCaptionMove,
    onCommitFreeCaptionMove,
    onCancelFreeCaptionMove,
    onBeginMultiDrag,
    onPreviewMultiDrag,
    onCommitMultiDrag,
    onCancelMultiDrag,
    onDragStart,
    onDragEnd,
  };

  const clipsPool = allClips ?? visibleClips;
  const clipById = useMemo(
    () => new Map(clipsPool.map((c) => [c.keyframe.id, c])),
    [clipsPool],
  );

  const allResolved = useMemo(
    () => resolvedCaptionsProp ?? resolveTimelineCaptions(clipsPool),
    [resolvedCaptionsProp, clipsPool],
  );

  const visibleResolved = useMemo(() => {
    if (!visibleClips.length) return [];
    const minFrame = visibleClips[0].startFrame;
    const maxFrame = visibleClips[visibleClips.length - 1].endFrame;
    return allResolved.filter(
      (rc) =>
        (rc.globalOutFrame >= minFrame && rc.globalInFrame <= maxFrame) ||
        draggingKey === rc.id,
    );
  }, [allResolved, visibleClips, draggingKey]);

  useEffect(() => {
    if (editing && textareaRef.current) {
      const el = textareaRef.current;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, [editing?.frameId, editing?.index]);

  useEffect(() => {
    const handleWindowPointerMove = (e: PointerEvent) => {
      const session = dragSessionRef.current;
      if (!session || e.pointerId !== session.pointerId) return;
      const latest = latestRef.current;
      const dxPx = e.clientX - session.startClientX;

      if (!session.moved) {
        if (Math.abs(dxPx) < 3) return;
        session.moved = true;
        suppressClickRef.current = true;
        setDraggingKey(`${session.sourceFrameId}:${session.captionIndex}`);
        if (session.mode === "multi") {
          latest.onBeginMultiDrag?.();
        } else if (latest.onBeginFreeCaptionDrag) {
          latest.onBeginFreeCaptionDrag();
        } else {
          latest.onDragStart();
        }
      }

      const rawCurrentFrame = latest.rawFrameFromClientX(e.clientX);
      const bypassSnap = e.ctrlKey || e.metaKey;
      const effectiveSnap = latest.snapEnabled && !bypassSnap;
      const copy = session.mode === "move" || session.mode === "multi" ? e.altKey : false;
      session.copy = copy;

      if (session.mode === "multi") {
        const deltaFrames = Math.round(rawCurrentFrame - session.startRawFrame);
        const candStart = Math.max(0, session.origGlobalIn + deltaFrames);
        const snapped = snapFrame(candStart, session.targets, latest.pxPerFrame, effectiveSnap);
        latest.onSetSnapGuide(snapped.snapped ? snapped.frame : null);
        const finalDeltaFrames = Math.round(snapped.frame) - session.origGlobalIn;
        latest.onPreviewMultiDrag?.((finalDeltaFrames * 1000) / FPS, copy);
        return;
      }

      const maxTimeline = Math.max(1, latest.totalFrames);

      if (session.mode === "move") {
        const len = Math.max(1, session.origGlobalOut - session.origGlobalIn);
        const rawDelta = rawCurrentFrame - session.startRawFrame;
        let nextIn = Math.max(
          0,
          Math.min(Math.max(0, maxTimeline - 1), Math.round(session.origGlobalIn + rawDelta)),
        );
        let nextOut = nextIn + len;

        const snapIn = snapFrame(nextIn, session.targets, latest.pxPerFrame, effectiveSnap);
        const snapOut = snapFrame(nextOut, session.targets, latest.pxPerFrame, effectiveSnap);
        if (snapIn.snapped) {
          nextIn = Math.max(0, Math.round(snapIn.frame));
          nextOut = nextIn + len;
          latest.onSetSnapGuide(nextIn);
        } else if (snapOut.snapped && Math.round(snapOut.frame) - len >= 0) {
          nextOut = Math.round(snapOut.frame);
          nextIn = nextOut - len;
          latest.onSetSnapGuide(nextOut);
        } else {
          latest.onSetSnapGuide(null);
        }

        latest.onPreviewFreeCaptionMove?.(
          session.sourceFrameId,
          session.captionIndex,
          nextIn,
          nextOut,
          copy,
        );
        return;
      }

      if (session.mode === "trim-in") {
        const snapped = snapFrame(rawCurrentFrame, session.targets, latest.pxPerFrame, effectiveSnap);
        latest.onSetSnapGuide(snapped.snapped ? snapped.frame : null);
        const nextIn = Math.max(
          0,
          Math.min(session.origGlobalOut - 1, Math.round(snapped.frame)),
        );
        latest.onPreviewFreeCaptionMove?.(
          session.sourceFrameId,
          session.captionIndex,
          nextIn,
          session.origGlobalOut,
          false,
        );
        return;
      }

      if (session.mode === "trim-out") {
        const snapped = snapFrame(rawCurrentFrame, session.targets, latest.pxPerFrame, effectiveSnap);
        latest.onSetSnapGuide(snapped.snapped ? snapped.frame : null);
        const nextOut = Math.max(session.origGlobalIn + 1, Math.round(snapped.frame));
        latest.onPreviewFreeCaptionMove?.(
          session.sourceFrameId,
          session.captionIndex,
          session.origGlobalIn,
          nextOut,
          false,
        );
      }
    };

    const finishDrag = (e: PointerEvent, cancelled: boolean) => {
      const session = dragSessionRef.current;
      if (!session || e.pointerId !== session.pointerId) return;
      dragSessionRef.current = null;
      setDraggingKey(null);
      const latest = latestRef.current;
      latest.onSetSnapGuide(null);

      if (!session.moved) return;

      if (cancelled) {
        if (session.mode === "multi") latest.onCancelMultiDrag?.();
        else if (latest.onCancelFreeCaptionMove) latest.onCancelFreeCaptionMove();
        else latest.onDragEnd("");
        return;
      }

      if (session.mode === "multi") {
        latest.onCommitMultiDrag?.(session.copy);
      } else if (latest.onCommitFreeCaptionMove) {
        const label =
          session.mode === "move"
            ? session.copy
              ? "Caption duplicated"
              : "Caption moved"
            : "Caption timing adjusted";
        latest.onCommitFreeCaptionMove(label);
      } else {
        latest.onDragEnd("Caption timing adjusted");
      }
    };

    const handleWindowPointerUp = (e: PointerEvent) => finishDrag(e, false);
    const handleWindowPointerCancel = (e: PointerEvent) => finishDrag(e, true);

    window.addEventListener("pointermove", handleWindowPointerMove);
    window.addEventListener("pointerup", handleWindowPointerUp);
    window.addEventListener("pointercancel", handleWindowPointerCancel);
    return () => {
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("pointerup", handleWindowPointerUp);
      window.removeEventListener("pointercancel", handleWindowPointerCancel);
    };
  }, []);

  function buildSnapTargets(excludeId: string): SnapTarget[] {
    const targets: SnapTarget[] = [{ frame: playheadFrame, kind: "playhead" }];
    for (const clip of visibleClips) {
      targets.push({ frame: clip.startFrame, kind: "clip-edge" });
      targets.push({ frame: clip.endFrame, kind: "clip-edge" });
      if (clip.keyframe.beat.audioUrl) {
        targets.push({ frame: clip.startFrame + clip.voiceInFrame, kind: "clip-edge" });
        if (clip.voiceOutFrame > clip.voiceInFrame) {
          targets.push({ frame: clip.startFrame + clip.voiceOutFrame, kind: "clip-edge" });
        }
      }
    }
    for (const rc of visibleResolved) {
      if (rc.id === excludeId) continue;
      targets.push({ frame: rc.globalInFrame, kind: "clip-edge" });
      targets.push({ frame: rc.globalOutFrame, kind: "clip-edge" });
    }
    return targets;
  }

  function handleLaneDoubleClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return;
    const rawGlobal = Math.round(rawFrameFromClientX(e.clientX));
    const clip = clipsPool.find(
      (c) => rawGlobal >= c.startFrame && rawGlobal < c.endFrame,
    );
    if (!clip) return;
    const localFrame = rawGlobal - clip.startFrame;
    const next = addCaptionInGap(clip.keyframe.beat, clip.durationFrames, localFrame);
    if (!next) return;
    const addedIdx = Math.max(
      0,
      next.findIndex((c) => localFrame >= c.inFrame && localFrame < c.outFrame),
    );
    onCommitCaptions(
      clip.keyframe.id,
      next,
      clip.durationFrames,
      "Caption added",
      [addedIdx],
    );
  }

  function startCaptionPointerDrag(
    e: ReactPointerEvent<HTMLElement>,
    rc: ResolvedTimelineCaption,
    mode: "move" | "trim-in" | "trim-out",
  ) {
    if (e.button !== 0) return;
    e.stopPropagation();

    const isInMulti = Boolean(
      multiSelectedCaptions?.some(
        (item) => item.frameId === rc.frameId && item.index === rc.captionIndex,
      ),
    );
    const effectiveMode: ActiveCaptionDrag["mode"] =
      mode === "move" &&
      isInMulti &&
      multiSelectionTotalCount > 1 &&
      Boolean(onPreviewMultiDrag) &&
      !e.shiftKey
        ? "multi"
        : mode;

    if (mode !== "move") {
      onSelectCaption(rc.frameId, rc.captionIndex, false);
    }

    dragSessionRef.current = {
      mode: effectiveMode,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startRawFrame: rawFrameFromClientX(e.clientX),
      sourceFrameId: rc.frameId,
      captionIndex: rc.captionIndex,
      origGlobalIn: rc.globalInFrame,
      origGlobalOut: rc.globalOutFrame,
      targets: buildSnapTargets(rc.id),
      moved: false,
      copy: e.altKey,
    };
  }

  return (
    <div
      ref={laneRef}
      className="timeline-captions-lane"
      data-testid="lane-captions"
      style={
        height !== undefined
          ? { height, minHeight: height, maxHeight: height }
          : undefined
      }
      onClick={(e) => {
        if (suppressClickRef.current) {
          suppressClickRef.current = false;
          return;
        }
        if (e.target === e.currentTarget) onClearCaptionSelection();
      }}
      onDoubleClick={handleLaneDoubleClick}
    >
      {visibleClips.map((clip) => {
        const kf = clip.keyframe;
        const clipLeft = clip.startFrame * pxPerFrame;
        const clipWidth = Math.max(2, clip.durationFrames * pxPerFrame);
        return (
          <div
            key={`cap-slot-${kf.sceneId}:${kf.id}:${clip.index}`}
            className={`caption-clip-guide ${selectedFrameId === kf.id ? "is-clip-selected" : ""}`}
            style={{ left: clipLeft, width: clipWidth }}
          />
        );
      })}

      {visibleResolved.map((rc) => {
        const anchorClip = clipById.get(rc.frameId);
        const kf = anchorClip?.keyframe;
        const globalIn = rc.globalInFrame;
        const globalOut = rc.globalOutFrame;
        const left = globalIn * pxPerFrame;
        const width = Math.max(10, (globalOut - globalIn) * pxPerFrame);
        const metrics = captionMetrics({
          text: rc.text,
          inFrame: rc.inFrame,
          outFrame: rc.outFrame,
        });
        const isCapSelected =
          (selectedCaption?.frameId === rc.frameId &&
            selectedCaption.indices.includes(rc.captionIndex)) ||
          Boolean(
            multiSelectedCaptions?.some(
              (item) => item.frameId === rc.frameId && item.index === rc.captionIndex,
            ),
          );
        const isEditingThis =
          editing?.frameId === rc.frameId && editing.index === rc.captionIndex;
        const isDraggingThis = draggingKey === rc.id;

        const commitInlineEdit = (draftValue: string) => {
          if (!kf || !anchorClip) {
            setEditing(null);
            return;
          }
          const nextCaps = updateCaptionText(
            kf.beat,
            anchorClip.durationFrames,
            rc.captionIndex,
            draftValue,
          );
          setEditing(null);
          if (draftValue !== rc.text || !Array.isArray(kf.beat.captions)) {
            onCommitCaptions(
              kf.id,
              nextCaps,
              anchorClip.durationFrames,
              "Caption edited",
              [rc.captionIndex],
            );
          }
        };

        const handleEditorKeyDown = (
          e: ReactKeyboardEvent<HTMLTextAreaElement>,
        ) => {
          e.stopPropagation();
          if (e.key === "Escape") {
            e.preventDefault();
            closedByKeyRef.current = true;
            setEditing(null);
            return;
          }
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && kf && anchorClip) {
            e.preventDefault();
            closedByKeyRef.current = true;
            const cursor = e.currentTarget.selectionStart ?? editing!.draft.length;
            const result = splitCaptionAtCursor(
              kf.beat,
              anchorClip.durationFrames,
              rc.captionIndex,
              cursor,
              editing!.draft,
            );
            setEditing(null);
            onCommitCaptions(
              kf.id,
              result.captions,
              anchorClip.durationFrames,
              result.didSplit ? "Caption split" : "Caption edited",
              result.didSplit ? [rc.captionIndex + 1] : [rc.captionIndex],
            );
            return;
          }
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            closedByKeyRef.current = true;
            commitInlineEdit(editing!.draft);
          }
        };

        const markLabel = kf ? `${kf.mark}/${kf.number}` : rc.frameId;
        const tooltipParts = [
          `CC (${markLabel} #${rc.captionIndex + 1}): "${rc.text.replace(/\s+/g, " ").trim()}"`,
          `Timeline frames ${globalIn}..${globalOut} (${metrics.durationSeconds.toFixed(2)}s)`,
          "Drag to move freely across cuts (Alt+Drag to duplicate, drag edges to trim)",
        ];
        if (metrics.overTwoLines) {
          tooltipParts.push(`⚠ ${metrics.lineCount} lines (> 2 lines at ~42 chars)`);
        }
        if (metrics.tooFast) {
          tooltipParts.push(
            `⚠ ${metrics.cps.toFixed(1)} chars/s (> 17 chars/s — too fast to read)`,
          );
        }
        tooltipParts.push(
          "Double-click to edit (Enter saves, Shift+Enter newline, Ctrl/Cmd+Enter split)",
        );

        return (
          <div
            key={`cap-${rc.frameId}-${rc.captionIndex}`}
            className={[
              "caption-block",
              isCapSelected ? "is-selected" : "",
              isDraggingThis ? "is-dragging" : "",
              rc.free ? "is-free" : "",
              metrics.tooFast ? "is-too-fast" : "",
              metrics.overTwoLines ? "is-multiline-warn" : "",
              isEditingThis ? "is-editing" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            data-testid={`caption-block-${rc.frameId}-${rc.captionIndex}`}
            data-frame-id={rc.frameId}
            data-caption-index={rc.captionIndex}
            data-in-frame={rc.inFrame}
            data-out-frame={rc.outFrame}
            data-global-in={globalIn}
            data-global-out={globalOut}
            data-free={rc.free ? "true" : "false"}
            data-too-fast={metrics.tooFast ? "true" : "false"}
            data-over-two-lines={metrics.overTwoLines ? "true" : "false"}
            style={{ left, width }}
            title={tooltipParts.join(" · ")}
            onPointerDown={(e) => {
              if (isEditingThis) {
                e.stopPropagation();
                return;
              }
              startCaptionPointerDrag(e, rc, "move");
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (suppressClickRef.current) {
                suppressClickRef.current = false;
                return;
              }
              if (isEditingThis) return;
              const extend = e.shiftKey || e.ctrlKey || e.metaKey;
              const jumpFrame =
                playheadFrame >= globalIn && playheadFrame < globalOut
                  ? undefined
                  : globalIn;
              onSelectCaption(rc.frameId, rc.captionIndex, extend, jumpFrame);
            }}
            onDoubleClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              closedByKeyRef.current = false;
              onSelectCaption(rc.frameId, rc.captionIndex, false);
              setEditing({ frameId: rc.frameId, index: rc.captionIndex, draft: rc.text });
            }}
          >
            {!isEditingThis && (width >= 24 || (isCapSelected && width >= 16)) && (
              <span
                className="caption-edge edge-left"
                data-testid={`caption-edge-left-${rc.frameId}-${rc.captionIndex}`}
                style={width < 36 ? { width: width < 24 ? 3 : 4 } : undefined}
                onPointerDown={(e) => startCaptionPointerDrag(e, rc, "trim-in")}
              />
            )}

            {isEditingThis ? (
              <textarea
                ref={textareaRef}
                className="caption-inline-editor"
                data-testid="caption-inline-editor"
                aria-label="Edit caption text"
                value={editing.draft}
                onClick={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onChange={(e) =>
                  setEditing((prev) =>
                    prev ? { ...prev, draft: e.target.value } : null,
                  )
                }
                onKeyDown={handleEditorKeyDown}
                onBlur={() => {
                  if (closedByKeyRef.current) {
                    closedByKeyRef.current = false;
                    return;
                  }
                  if (editing) commitInlineEdit(editing.draft);
                }}
              />
            ) : (
              <>
                <span className="caption-block-text">
                  {rc.text.replace(/\r?\n/g, " ↵ ")}
                </span>
                {(metrics.overTwoLines || metrics.tooFast) && (
                  <span className="caption-block-flags">
                    {metrics.overTwoLines && (
                      <b
                        className="caption-flag is-lines"
                        data-testid={`caption-flag-lines-${rc.frameId}-${rc.captionIndex}`}
                      >
                        {metrics.lineCount}L
                      </b>
                    )}
                    {metrics.tooFast && (
                      <b
                        className="caption-flag is-cps"
                        data-testid={`caption-flag-cps-${rc.frameId}-${rc.captionIndex}`}
                      >
                        {Math.round(metrics.cps)}c/s
                      </b>
                    )}
                  </span>
                )}
              </>
            )}

            {!isEditingThis && (width >= 24 || (isCapSelected && width >= 16)) && (
              <span
                className="caption-edge edge-right"
                data-testid={`caption-edge-right-${rc.frameId}-${rc.captionIndex}`}
                style={width < 36 ? { width: width < 24 ? 3 : 4 } : undefined}
                onPointerDown={(e) => startCaptionPointerDrag(e, rc, "trim-out")}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
