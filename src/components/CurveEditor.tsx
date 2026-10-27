import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  ANIM_PROP_META,
  ANIM_PROPS,
  clampPropValue,
  defaultValueForProp,
  evaluateChannel,
  resolveKeyBezier,
  setKeyBezierAtFrame,
  setKeyEasingAtFrame,
  toggleKeyAtFrame,
  updateKeyPointAtFrame,
  type AnimProp,
  type BeatAnimation,
  type CubicBezierTuple,
  type KeyEasing,
  type TimelineClip,
} from "../sequence/animate";

export interface CurveEditorProps {
  clip: TimelineClip;
  prop: AnimProp;
  localFrame: number;
  onChangeProp: (prop: AnimProp) => void;
  onClose: () => void;
  onScrubLocalFrame: (localFrame: number) => void;
  onSetAnimation: (animation: BeatAnimation | undefined, label: string) => void;
  onPreviewAnimation: (animation: BeatAnimation | undefined) => void;
  onDragStart: () => void;
  onDragEnd: (label: string) => void;
}

const PAD_LEFT = 54;
const PAD_RIGHT = 20;
const PAD_TOP = 18;
const PAD_BOTTOM = 24;
const SVG_HEIGHT = 176;

const PRESETS: ReadonlyArray<{ easing: KeyEasing; label: string; testId: string }> = [
  { easing: "linear", label: "Linear", testId: "curve-preset-linear" },
  { easing: "ease-in", label: "Ease in", testId: "curve-preset-ease-in" },
  { easing: "ease-out", label: "Ease out", testId: "curve-preset-ease-out" },
  { easing: "ease-in-out", label: "Ease in-out", testId: "curve-preset-ease-in-out" },
  { easing: "hold", label: "Hold", testId: "curve-preset-hold" },
];

export function CurveEditor({
  clip,
  prop,
  localFrame,
  onChangeProp,
  onClose,
  onScrubLocalFrame,
  onSetAnimation,
  onPreviewAnimation,
  onDragStart,
  onDragEnd,
}: CurveEditorProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [svgWidth, setSvgWidth] = useState(720);
  const [fitRange, setFitRange] = useState(true);
  const [selectedKeyFrame, setSelectedKeyFrame] = useState<number | null>(null);

  const meta = ANIM_PROP_META[prop];
  const anim = clip.keyframe.beat.animation;
  const keys = useMemo(
    () => [...(anim?.[prop] ?? [])].sort((a, b) => a.frame - b.frame),
    [anim, prop],
  );
  const fallbackVal = defaultValueForProp(prop, clip);
  const maxFrame = Math.max(1, clip.durationFrames - 1);
  const clampedLocal = Math.max(0, Math.min(maxFrame, localFrame));
  const currentVal = evaluateChannel(keys, clampedLocal, fallbackVal);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const update = () => {
      if (el.clientWidth > 120) setSvgWidth(el.clientWidth);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Determine active segment index (0 .. keys.length - 2) for bezier handles & presets
  const activeSegmentIndex = useMemo(() => {
    if (keys.length === 0) return -1;
    if (keys.length === 1) return 0;
    if (selectedKeyFrame !== null) {
      const idx = keys.findIndex((k) => k.frame === selectedKeyFrame);
      if (idx >= 0) return Math.min(idx, keys.length - 2);
    }
    for (let i = keys.length - 2; i >= 0; i -= 1) {
      if (clampedLocal >= keys[i].frame) return i;
    }
    return 0;
  }, [clampedLocal, keys, selectedKeyFrame]);

  const activeSegmentKey = activeSegmentIndex >= 0 ? keys[activeSegmentIndex] : undefined;
  const nextSegmentKey =
    activeSegmentIndex >= 0 && activeSegmentIndex + 1 < keys.length
      ? keys[activeSegmentIndex + 1]
      : undefined;

  // Compute Y-axis range
  const [yMin, yMax] = useMemo((): [number, number] => {
    const isUnitProp =
      prop === "opacity" || prop === "gradeStrength" || prop === "depthAmount";
    if (!fitRange || keys.length === 0 || isUnitProp) {
      return [meta.min, meta.max];
    }
    let lo = Infinity;
    let hi = -Infinity;
    for (const k of keys) {
      if (k.value < lo) lo = k.value;
      if (k.value > hi) hi = k.value;
    }
    const span = hi - lo;
    const minSpan = Math.max(meta.step * 4, Math.min(2, (meta.max - meta.min) * 0.02));
    const effSpan = Math.max(span, minSpan);
    const pad = effSpan * 0.25;
    const fitLo = Math.max(meta.min, lo - pad);
    const fitHi = Math.min(meta.max, hi + pad);
    if (fitHi - fitLo < minSpan * 0.5) {
      return [meta.min, meta.max];
    }
    return [fitLo, fitHi];
  }, [fitRange, keys, meta.max, meta.min, meta.step, prop]);

  const plotW = Math.max(80, svgWidth - PAD_LEFT - PAD_RIGHT);
  const plotH = SVG_HEIGHT - PAD_TOP - PAD_BOTTOM;

  const frameToX = (f: number) => PAD_LEFT + (Math.max(0, Math.min(maxFrame, f)) / maxFrame) * plotW;
  const xToFrame = (px: number) => {
    const ratio = (px - PAD_LEFT) / plotW;
    return Math.max(0, Math.min(maxFrame, Math.round(ratio * maxFrame)));
  };
  const valToY = (v: number) => {
    const denom = yMax - yMin || 1;
    const norm = (v - yMin) / denom;
    return PAD_TOP + (1 - norm) * plotH;
  };
  const yToVal = (py: number) => {
    const norm = 1 - (py - PAD_TOP) / plotH;
    return yMin + norm * (yMax - yMin);
  };

  // Sample exact curve path across 0 .. maxFrame
  const curvePathD = useMemo(() => {
    const samples = Math.min(320, Math.max(64, maxFrame * 4));
    const parts: string[] = [];
    for (let i = 0; i <= samples; i += 1) {
      const f = (i / samples) * maxFrame;
      const v = evaluateChannel(keys, f, fallbackVal);
      const sx = PAD_LEFT + (f / maxFrame) * plotW;
      const sy = Math.max(2, Math.min(SVG_HEIGHT - 4, valToY(v)));
      parts.push(`${i === 0 ? "M" : "L"}${sx.toFixed(2)},${sy.toFixed(2)}`);
    }
    return parts.join(" ");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys, fallbackVal, maxFrame, plotW, yMin, yMax]);

  // Bezier handle positions for activeSegmentKey -> nextSegmentKey
  const bezierHandles = useMemo(() => {
    if (!activeSegmentKey || !nextSegmentKey) return null;
    if (activeSegmentKey.easing === "hold") return null;
    if (nextSegmentKey.frame <= activeSegmentKey.frame) return null;
    const p0x = frameToX(activeSegmentKey.frame);
    const p0y = valToY(activeSegmentKey.value);
    const p3x = frameToX(nextSegmentKey.frame);
    const p3y = valToY(nextSegmentKey.value);
    const dx = p3x - p0x;
    const rawDy = p3y - p0y;
    // When both keyframes share the same value, provide a virtual 60px vertical scale so handles can still shape an arch
    const dy = Math.abs(rawDy) < 6 ? -60 : rawDy;
    const [x1, y1, x2, y2] = resolveKeyBezier(activeSegmentKey);
    return {
      p0x,
      p0y,
      p3x,
      p3y,
      dx,
      dy,
      x1,
      y1,
      x2,
      y2,
      h1x: p0x + x1 * dx,
      h1y: p0y + y1 * dy,
      h2x: p0x + x2 * dx,
      h2y: p0y + y2 * dy,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSegmentKey, nextSegmentKey, plotW, yMin, yMax, maxFrame]);

  const dragSession = useRef<
    | {
        kind: "point";
        initialFrame: number;
        lastFrame: number;
        initialAnim: BeatAnimation | undefined;
      }
    | {
        kind: "handle-out" | "handle-in";
        segFrame: number;
        p0x: number;
        p0y: number;
        dx: number;
        dy: number;
        initialBezier: CubicBezierTuple;
        initialAnim: BeatAnimation | undefined;
      }
    | {
        kind: "scrub";
      }
    | null
  >(null);

  const clientToSvgPoint = (clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const handlePointerMoveCoords = (clientX: number, clientY: number) => {
    const session = dragSession.current;
    if (!session) return;
    const pt = clientToSvgPoint(clientX, clientY);

    if (session.kind === "scrub") {
      onScrubLocalFrame(xToFrame(pt.x));
      return;
    }

    if (session.kind === "point") {
      const nextFrame = xToFrame(pt.x);
      const nextVal = clampPropValue(prop, yToVal(pt.y));
      session.lastFrame = nextFrame;
      setSelectedKeyFrame(nextFrame);
      const updated = updateKeyPointAtFrame(
        session.initialAnim,
        prop,
        session.initialFrame,
        nextFrame,
        nextVal,
        maxFrame,
      );
      onPreviewAnimation(updated);
      return;
    }

    if (session.kind === "handle-out" || session.kind === "handle-in") {
      const relX = Math.max(0, Math.min(1, (pt.x - session.p0x) / Math.max(1, session.dx)));
      const relY = Math.max(-2, Math.min(3, (pt.y - session.p0y) / session.dy));
      const [bx1, by1, bx2, by2] = session.initialBezier;
      const nextTuple: CubicBezierTuple =
        session.kind === "handle-out"
          ? [
              Math.round(relX * 1000) / 1000,
              Math.round(relY * 1000) / 1000,
              bx2,
              by2,
            ]
          : [
              bx1,
              by1,
              Math.round(relX * 1000) / 1000,
              Math.round(relY * 1000) / 1000,
            ];
      const updated = setKeyBezierAtFrame(
        session.initialAnim,
        prop,
        session.segFrame,
        nextTuple,
      );
      onPreviewAnimation(updated);
    }
  };

  const handleSvgPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    handlePointerMoveCoords(e.clientX, e.clientY);
  };

  const handleSvgPointerUp = () => {
    const session = dragSession.current;
    dragSession.current = null;
    if (!session || session.kind === "scrub") return;
    onDragEnd(
      session.kind === "point"
        ? `${meta.label} keyframe adjusted`
        : `${meta.label} bezier curve adjusted`,
    );
  };

  useEffect(() => {
    const onWinMove = (ev: PointerEvent) => {
      if (!dragSession.current) return;
      handlePointerMoveCoords(ev.clientX, ev.clientY);
    };
    const onWinUp = () => {
      if (!dragSession.current) return;
      handleSvgPointerUp();
    };
    window.addEventListener("pointermove", onWinMove);
    window.addEventListener("pointerup", onWinUp);
    return () => {
      window.removeEventListener("pointermove", onWinMove);
      window.removeEventListener("pointerup", onWinUp);
    };
  });

  const applyPreset = (easing: KeyEasing) => {
    if (!activeSegmentKey) return;
    const updated = setKeyEasingAtFrame(anim, prop, activeSegmentKey.frame, easing);
    onSetAnimation(updated, `${meta.label} easing set to ${easing}`);
  };

  const playheadX = frameToX(clampedLocal);
  const playheadY = Math.max(4, Math.min(SVG_HEIGHT - 4, valToY(currentVal)));
  const activeBezierTuple = activeSegmentKey ? resolveKeyBezier(activeSegmentKey) : null;

  const yTicks = [yMax, (yMin + yMax) / 2, yMin];
  const frameStep = Math.max(1, Math.ceil(maxFrame / 8));
  const xTicks: number[] = [];
  for (let f = 0; f <= maxFrame; f += frameStep) xTicks.push(f);
  if (xTicks[xTicks.length - 1] !== maxFrame) xTicks.push(maxFrame);

  return (
    <section
      ref={wrapRef}
      className="curve-editor-panel"
      data-testid="curve-editor"
      aria-label={`${meta.label} curve editor`}
    >
      <header className="curve-editor-header">
        <div className="curve-editor-title">
          <span className="curve-editor-dot" style={{ background: meta.color }} />
          <strong>CURVE EDITOR</strong>
          <span className="curve-clip-badge">
            SC {clip.keyframe.mark}/{String(clip.keyframe.number).padStart(2, "0")}
          </span>
          <select
            className="curve-prop-select"
            data-testid="curve-prop-select"
            aria-label="Curve property"
            value={prop}
            onChange={(e) => onChangeProp(e.target.value as AnimProp)}
          >
            {ANIM_PROPS.map((p) => {
              const count = anim?.[p]?.length ?? 0;
              return (
                <option key={p} value={p}>
                  {ANIM_PROP_META[p].label}
                  {count > 0 ? ` (${count})` : ""}
                </option>
              );
            })}
          </select>
          <output className="curve-live-readout" data-testid="curve-live-readout">
            +{clampedLocal}f · {currentVal.toFixed(meta.decimals)}
            {meta.suffix}
          </output>
          {activeSegmentKey && activeBezierTuple && activeSegmentKey.easing !== "hold" && (
            <code className="curve-bezier-readout" data-testid="curve-bezier-readout">
              cubic-bezier({activeBezierTuple.map((n) => Number(n.toFixed(2))).join(", ")})
            </code>
          )}
        </div>

        <div className="curve-editor-actions">
          <div className="curve-preset-group" role="group" aria-label="Easing presets">
            {PRESETS.map((p) => (
              <button
                key={p.easing}
                type="button"
                data-testid={p.testId}
                disabled={!activeSegmentKey}
                className={`curve-preset-btn ${activeSegmentKey?.easing === p.easing ? "is-active" : ""}`}
                onClick={() => applyPreset(p.easing)}
              >
                {p.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="curve-tool-btn"
            data-testid="curve-add-key-btn"
            onClick={() =>
              onSetAnimation(
                toggleKeyAtFrame(anim, prop, clampedLocal, currentVal, "linear"),
                `${meta.label} keyframe toggled at +${clampedLocal}f`,
              )
            }
            title={`Toggle ${meta.label} keyframe at +${clampedLocal}f`}
          >
            + Key
          </button>

          <button
            type="button"
            className={`curve-tool-btn ${fitRange ? "is-active" : ""}`}
            data-testid="curve-fit-btn"
            onClick={() => setFitRange((v) => !v)}
            title="Toggle auto-fit vertical range vs full property range"
          >
            {fitRange ? "Fit Y" : "Full Y"}
          </button>

          <button
            type="button"
            className="curve-close-btn"
            data-testid="curve-editor-close"
            aria-label="Close curve editor"
            onClick={onClose}
          >
            ×
          </button>
        </div>
      </header>

      <svg
        ref={svgRef}
        className="curve-editor-svg"
        data-testid="curve-editor-svg"
        width={svgWidth}
        height={SVG_HEIGHT}
        viewBox={`0 0 ${svgWidth} ${SVG_HEIGHT}`}
        onPointerDown={(e) => {
          const target = e.target as Element | null;
          if (target?.closest("[data-curve-interactive='true']")) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          dragSession.current = { kind: "scrub" };
          const pt = clientToSvgPoint(e.clientX, e.clientY);
          onScrubLocalFrame(xToFrame(pt.x));
        }}
        onPointerMove={handleSvgPointerMove}
        onPointerUp={handleSvgPointerUp}
        onPointerCancel={handleSvgPointerUp}
        onDoubleClick={(e) => {
          const pt = clientToSvgPoint(e.clientX, e.clientY);
          const f = xToFrame(pt.x);
          const v = clampPropValue(prop, yToVal(pt.y));
          const updated = toggleKeyAtFrame(anim, prop, f, v, "linear");
          setSelectedKeyFrame(f);
          onSetAnimation(updated, `${meta.label} keyframe added at +${f}f`);
        }}
      >
        <rect
          x={PAD_LEFT}
          y={PAD_TOP}
          width={plotW}
          height={plotH}
          className="curve-plot-bg"
          rx={4}
        />

        {/* Horizontal Y gridlines */}
        {yTicks.map((yv, idx) => {
          const py = valToY(yv);
          return (
            <g key={`y-${idx}`}>
              <line
                x1={PAD_LEFT}
                y1={py}
                x2={PAD_LEFT + plotW}
                y2={py}
                className="curve-grid-line"
              />
              <text x={PAD_LEFT - 6} y={py + 3.5} textAnchor="end" className="curve-axis-label">
                {yv.toFixed(meta.decimals)}
              </text>
            </g>
          );
        })}

        {/* Vertical frame gridlines */}
        {xTicks.map((f) => {
          const px = frameToX(f);
          return (
            <g key={`x-${f}`}>
              <line
                x1={px}
                y1={PAD_TOP}
                x2={px}
                y2={PAD_TOP + plotH}
                className="curve-grid-line is-vertical"
              />
              <text
                x={px}
                y={SVG_HEIGHT - 6}
                textAnchor="middle"
                className="curve-axis-label"
              >
                +{f}f
              </text>
            </g>
          );
        })}

        {/* Sampled interpolated value curve */}
        <path
          d={curvePathD}
          fill="none"
          stroke={meta.color}
          strokeWidth={2.25}
          data-testid="curve-editor-path"
        />

        {/* Playhead vertical marker + dot on curve */}
        <line
          x1={playheadX}
          y1={PAD_TOP - 4}
          x2={playheadX}
          y2={PAD_TOP + plotH + 2}
          className="curve-playhead-line"
        />
        <circle
          cx={playheadX}
          cy={playheadY}
          r={4}
          fill="#ff5c5c"
          stroke="#0a0d12"
          strokeWidth={1.5}
          pointerEvents="none"
        />

        {/* Draggable keyframe points */}
        {keys.map((k, idx) => {
          const kx = frameToX(k.frame);
          const ky = Math.max(6, Math.min(SVG_HEIGHT - 8, valToY(k.value)));
          const isSelected =
            selectedKeyFrame === k.frame || idx === activeSegmentIndex;
          return (
            <g
              key={`kp-${k.frame}-${idx}`}
              transform={`translate(${kx}, ${ky})`}
              className={`curve-key-node ${isSelected ? "is-selected" : ""}`}
              data-testid={`curve-point-${idx}`}
              data-key-frame={k.frame}
              data-curve-interactive="true"
              onPointerDown={(e) => {
                e.stopPropagation();
                setSelectedKeyFrame(k.frame);
                onDragStart();
                dragSession.current = {
                  kind: "point",
                  initialFrame: k.frame,
                  lastFrame: k.frame,
                  initialAnim: anim ? (JSON.parse(JSON.stringify(anim)) as BeatAnimation) : undefined,
                };
              }}
            >
              <rect
                x={-5.5}
                y={-5.5}
                width={11}
                height={11}
                transform="rotate(45)"
                fill={isSelected ? "#ffffff" : meta.color}
                stroke="#090c10"
                strokeWidth={1.5}
              />
              <title>
                {meta.label}: {k.value.toFixed(meta.decimals)}
                {meta.suffix} @ +{k.frame}f ({k.easing}) — drag in time &amp; value
              </title>
            </g>
          );
        })}

        {/* Bezier tangent lines & draggable handles (rendered on top so (0,0) / (1,1) handles remain grabbable) */}
        {bezierHandles && (
          <g className="curve-bezier-handles">
            <line
              x1={bezierHandles.p0x}
              y1={bezierHandles.p0y}
              x2={bezierHandles.h1x}
              y2={bezierHandles.h1y}
              className="curve-tangent-line"
            />
            <line
              x1={bezierHandles.p3x}
              y1={bezierHandles.p3y}
              x2={bezierHandles.h2x}
              y2={bezierHandles.h2y}
              className="curve-tangent-line"
            />
            <circle
              cx={bezierHandles.h1x}
              cy={bezierHandles.h1y}
              r={6}
              className="curve-bezier-handle is-out"
              data-testid="curve-handle-out"
              data-curve-interactive="true"
              onPointerDown={(e) => {
                e.stopPropagation();
                onDragStart();
                dragSession.current = {
                  kind: "handle-out",
                  segFrame: activeSegmentKey!.frame,
                  p0x: bezierHandles.p0x,
                  p0y: bezierHandles.p0y,
                  dx: bezierHandles.dx,
                  dy: bezierHandles.dy,
                  initialBezier: resolveKeyBezier(activeSegmentKey!),
                  initialAnim: anim ? (JSON.parse(JSON.stringify(anim)) as BeatAnimation) : undefined,
                };
              }}
            >
              <title>Drag outgoing bezier handle (x1, y1)</title>
            </circle>
            <circle
              cx={bezierHandles.h2x}
              cy={bezierHandles.h2y}
              r={6}
              className="curve-bezier-handle is-in"
              data-testid="curve-handle-in"
              data-curve-interactive="true"
              onPointerDown={(e) => {
                e.stopPropagation();
                onDragStart();
                dragSession.current = {
                  kind: "handle-in",
                  segFrame: activeSegmentKey!.frame,
                  p0x: bezierHandles.p0x,
                  p0y: bezierHandles.p0y,
                  dx: bezierHandles.dx,
                  dy: bezierHandles.dy,
                  initialBezier: resolveKeyBezier(activeSegmentKey!),
                  initialAnim: anim ? (JSON.parse(JSON.stringify(anim)) as BeatAnimation) : undefined,
                };
              }}
            >
              <title>Drag incoming bezier handle (x2, y2)</title>
            </circle>
          </g>
        )}
      </svg>
    </section>
  );
}
