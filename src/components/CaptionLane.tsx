import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  addCaptionInGap,
  captionMetrics,
  dragCaptionEdge,
  effectiveCaptionsForBeat,
  splitCaptionAtCursor,
  updateCaptionText,
  type BeatCaption,
} from "../core/captions";
import type { TimelineClip } from "../sequence/animate";
import { snapFrame, type SnapTarget } from "../sequence/snap";

export interface SelectedCaptionState {
  frameId: string;
  indices: number[];
}

export interface CaptionLaneProps {
  visibleClips: TimelineClip[];
  pxPerFrame: number;
  playheadFrame: number;
  snapEnabled: boolean;
  selectedFrameId: string;
  selectedCaption: SelectedCaptionState | null;
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
  onDragStart: () => void;
  onDragEnd: (label: string) => void;
}

export function CaptionLane({
  visibleClips,
  pxPerFrame,
  playheadFrame,
  snapEnabled,
  selectedFrameId,
  selectedCaption,
  rawFrameFromClientX,
  onSetSnapGuide,
  onSelectCaption,
  onClearCaptionSelection,
  onCommitCaptions,
  onCaptionPreview,
  onDragStart,
  onDragEnd,
}: CaptionLaneProps) {
  const [editing, setEditing] = useState<{
    frameId: string;
    index: number;
    draft: string;
  } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const closedByKeyRef = useRef(false);

  const edgeDragRef = useRef<{
    frameId: string;
    clipStartFrame: number;
    clipDurationFrames: number;
    index: number;
    side: "in" | "out";
    targets: SnapTarget[];
  } | null>(null);

  useEffect(() => {
    if (editing && textareaRef.current) {
      const el = textareaRef.current;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, [editing?.frameId, editing?.index]);

  function buildCaptionSnapTargets(
    clip: TimelineClip,
    captions: BeatCaption[],
    activeIndex: number,
  ): SnapTarget[] {
    const targets: SnapTarget[] = [
      { frame: playheadFrame, kind: "playhead" },
      { frame: clip.startFrame, kind: "clip-edge" },
      { frame: clip.endFrame, kind: "clip-edge" },
    ];
    if (clip.keyframe.beat.audioUrl) {
      targets.push({ frame: clip.startFrame + clip.voiceInFrame, kind: "clip-edge" });
      if (clip.voiceOutFrame > clip.voiceInFrame) {
        targets.push({ frame: clip.startFrame + clip.voiceOutFrame, kind: "clip-edge" });
      }
    }
    captions.forEach((cap, idx) => {
      if (idx === activeIndex) return;
      targets.push({ frame: clip.startFrame + cap.inFrame, kind: "clip-edge" });
      targets.push({ frame: clip.startFrame + cap.outFrame, kind: "clip-edge" });
    });
    return targets;
  }

  function handleLaneDoubleClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return;
    const rawGlobal = Math.round(rawFrameFromClientX(e.clientX));
    const clip = visibleClips.find(
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

  return (
    <div
      className="timeline-captions-lane"
      data-testid="lane-captions"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClearCaptionSelection();
      }}
      onDoubleClick={handleLaneDoubleClick}
    >
      {visibleClips.map((clip) => {
        const kf = clip.keyframe;
        const caps = effectiveCaptionsForBeat(kf.beat, clip.durationFrames);
        const clipLeft = clip.startFrame * pxPerFrame;
        const clipWidth = Math.max(2, clip.durationFrames * pxPerFrame);

        return (
          <div
            key={`cap-slot-${kf.sceneId}:${kf.id}:${clip.index}`}
            className={`caption-clip-guide ${selectedFrameId === kf.id ? "is-clip-selected" : ""}`}
            style={{ left: clipLeft, width: clipWidth }}
          >
            {caps.map((cap, capIdx) => {
              const globalIn = clip.startFrame + cap.inFrame;
              const globalOut = clip.startFrame + cap.outFrame;
              const left = cap.inFrame * pxPerFrame;
              const width = Math.max(10, (cap.outFrame - cap.inFrame) * pxPerFrame);
              const metrics = captionMetrics(cap);
              const isCapSelected =
                selectedCaption?.frameId === kf.id &&
                selectedCaption.indices.includes(capIdx);
              const isEditingThis =
                editing?.frameId === kf.id && editing.index === capIdx;

              const beginEdgeDrag = (
                e: ReactPointerEvent<HTMLSpanElement>,
                side: "in" | "out",
              ) => {
                e.preventDefault();
                e.stopPropagation();
                e.currentTarget.setPointerCapture(e.pointerId);
                onSelectCaption(kf.id, capIdx, false);
                edgeDragRef.current = {
                  frameId: kf.id,
                  clipStartFrame: clip.startFrame,
                  clipDurationFrames: clip.durationFrames,
                  index: capIdx,
                  side,
                  targets: buildCaptionSnapTargets(clip, caps, capIdx),
                };
                onDragStart();
              };

              const moveEdgeDrag = (e: ReactPointerEvent<HTMLSpanElement>) => {
                const session = edgeDragRef.current;
                if (!session) return;
                const rawGlobal = rawFrameFromClientX(e.clientX);
                const snapped = snapFrame(
                  rawGlobal,
                  session.targets,
                  pxPerFrame,
                  snapEnabled,
                );
                onSetSnapGuide(snapped.snapped ? snapped.frame : null);
                const targetLocal = Math.round(snapped.frame) - session.clipStartFrame;
                const nextCaps = dragCaptionEdge(
                  kf.beat,
                  session.clipDurationFrames,
                  session.index,
                  session.side,
                  targetLocal,
                );
                onCaptionPreview(session.frameId, nextCaps, session.clipDurationFrames);
              };

              const endEdgeDrag = (e: ReactPointerEvent<HTMLSpanElement>) => {
                e.stopPropagation();
                if (!edgeDragRef.current) return;
                edgeDragRef.current = null;
                onSetSnapGuide(null);
                onDragEnd("Caption timing adjusted");
              };

              const cancelEdgeDrag = () => {
                if (!edgeDragRef.current) return;
                edgeDragRef.current = null;
                onSetSnapGuide(null);
                onDragEnd("");
              };

              const commitInlineEdit = (draftValue: string) => {
                const nextCaps = updateCaptionText(
                  kf.beat,
                  clip.durationFrames,
                  capIdx,
                  draftValue,
                );
                setEditing(null);
                if (draftValue !== cap.text || !Array.isArray(kf.beat.captions)) {
                  onCommitCaptions(
                    kf.id,
                    nextCaps,
                    clip.durationFrames,
                    "Caption edited",
                    [capIdx],
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
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  closedByKeyRef.current = true;
                  const cursor = e.currentTarget.selectionStart ?? editing!.draft.length;
                  const result = splitCaptionAtCursor(
                    kf.beat,
                    clip.durationFrames,
                    capIdx,
                    cursor,
                    editing!.draft,
                  );
                  setEditing(null);
                  onCommitCaptions(
                    kf.id,
                    result.captions,
                    clip.durationFrames,
                    result.didSplit ? "Caption split" : "Caption edited",
                    result.didSplit ? [capIdx + 1] : [capIdx],
                  );
                  return;
                }
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  closedByKeyRef.current = true;
                  commitInlineEdit(editing!.draft);
                }
              };

              const tooltipParts = [
                `CC (${kf.mark}/${kf.number} #${capIdx + 1}): "${cap.text.replace(/\s+/g, " ").trim()}"`,
                `Clip frames ${cap.inFrame}..${cap.outFrame} (${metrics.durationSeconds.toFixed(2)}s)`,
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
                  key={`cap-${kf.id}-${capIdx}`}
                  className={[
                    "caption-block",
                    isCapSelected ? "is-selected" : "",
                    metrics.tooFast ? "is-too-fast" : "",
                    metrics.overTwoLines ? "is-multiline-warn" : "",
                    isEditingThis ? "is-editing" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  data-testid={`caption-block-${kf.id}-${capIdx}`}
                  data-frame-id={kf.id}
                  data-caption-index={capIdx}
                  data-in-frame={cap.inFrame}
                  data-out-frame={cap.outFrame}
                  data-global-in={globalIn}
                  data-global-out={globalOut}
                  data-too-fast={metrics.tooFast ? "true" : "false"}
                  data-over-two-lines={metrics.overTwoLines ? "true" : "false"}
                  style={{ left, width }}
                  title={tooltipParts.join(" · ")}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isEditingThis) return;
                    const extend = e.shiftKey || e.ctrlKey || e.metaKey;
                    const jumpFrame =
                      playheadFrame >= globalIn && playheadFrame < globalOut
                        ? undefined
                        : globalIn;
                    onSelectCaption(kf.id, capIdx, extend, jumpFrame);
                  }}
                  onDoubleClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    closedByKeyRef.current = false;
                    onSelectCaption(kf.id, capIdx, false);
                    setEditing({ frameId: kf.id, index: capIdx, draft: cap.text });
                  }}
                >
                  {!isEditingThis && (
                    <span
                      className="caption-edge edge-left"
                      data-testid={`caption-edge-left-${kf.id}-${capIdx}`}
                      onPointerDown={(e) => beginEdgeDrag(e, "in")}
                      onPointerMove={moveEdgeDrag}
                      onPointerUp={endEdgeDrag}
                      onPointerCancel={cancelEdgeDrag}
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
                        {cap.text.replace(/\r?\n/g, " ↵ ")}
                      </span>
                      {(metrics.overTwoLines || metrics.tooFast) && (
                        <span className="caption-block-flags">
                          {metrics.overTwoLines && (
                            <b
                              className="caption-flag is-lines"
                              data-testid={`caption-flag-lines-${kf.id}-${capIdx}`}
                            >
                              {metrics.lineCount}L
                            </b>
                          )}
                          {metrics.tooFast && (
                            <b
                              className="caption-flag is-cps"
                              data-testid={`caption-flag-cps-${kf.id}-${capIdx}`}
                            >
                              {Math.round(metrics.cps)}c/s
                            </b>
                          )}
                        </span>
                      )}
                    </>
                  )}

                  {!isEditingThis && (
                    <span
                      className="caption-edge edge-right"
                      data-testid={`caption-edge-right-${kf.id}-${capIdx}`}
                      onPointerDown={(e) => beginEdgeDrag(e, "out")}
                      onPointerMove={moveEdgeDrag}
                      onPointerUp={endEdgeDrag}
                      onPointerCancel={cancelEdgeDrag}
                    />
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
