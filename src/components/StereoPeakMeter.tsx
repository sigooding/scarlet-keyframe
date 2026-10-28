import { useEffect, useRef, useState } from "react";
import { webAudioEngine } from "../core/webAudioEngine";

const MIN_DB = -48;
const MAX_DB = 0;

function dbToPct(db: number): number {
  if (!Number.isFinite(db) || db <= MIN_DB) return 0;
  if (db >= MAX_DB) return 100;
  return ((db - MIN_DB) / (MAX_DB - MIN_DB)) * 100;
}

function formatDbReadout(db: number): string {
  if (!Number.isFinite(db) || db <= -60) return "−∞";
  const rounded = Math.round(db * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(1)}`;
}

export interface StereoPeakMeterProps {
  playing: boolean;
  soundOn: boolean;
}

export function StereoPeakMeter({ playing, soundOn }: StereoPeakMeterProps) {
  const [pctL, setPctL] = useState(0);
  const [pctR, setPctR] = useState(0);
  const [holdPctL, setHoldPctL] = useState(0);
  const [holdPctR, setHoldPctR] = useState(0);
  const [maxDb, setMaxDb] = useState(-Infinity);
  const [clipped, setClipped] = useState(false);

  const holdStateRef = useRef({
    holdL: -Infinity,
    holdR: -Infinity,
    holdTimeL: 0,
    holdTimeR: 0,
    smoothL: -Infinity,
    smoothR: -Infinity,
  });

  useEffect(() => {
    if (!playing || !soundOn) {
      setPctL(0);
      setPctR(0);
      setHoldPctL(0);
      setHoldPctR(0);
      setMaxDb(-Infinity);
      setClipped(webAudioEngine.readStereoMeter().clipped);
      holdStateRef.current = {
        holdL: -Infinity,
        holdR: -Infinity,
        holdTimeL: 0,
        holdTimeR: 0,
        smoothL: -Infinity,
        smoothR: -Infinity,
      };
      return;
    }

    let rafId = 0;
    let lastTs = performance.now();

    const tick = (now: number) => {
      const dtSec = Math.max(0.001, Math.min(0.1, (now - lastTs) / 1000));
      lastTs = now;
      const reading = webAudioEngine.readStereoMeter();
      const st = holdStateRef.current;

      // Instant attack, 24 dB/sec ballistic falloff
      const falloff = 24 * dtSec;
      st.smoothL = reading.dbL >= st.smoothL ? reading.dbL : Math.max(MIN_DB - 12, st.smoothL - falloff);
      st.smoothR = reading.dbR >= st.smoothR ? reading.dbR : Math.max(MIN_DB - 12, st.smoothR - falloff);

      if (reading.dbL >= st.holdL) {
        st.holdL = reading.dbL;
        st.holdTimeL = now;
      } else if (now - st.holdTimeL > 1100) {
        st.holdL = Math.max(MIN_DB - 12, st.holdL - 16 * dtSec);
      }

      if (reading.dbR >= st.holdR) {
        st.holdR = reading.dbR;
        st.holdTimeR = now;
      } else if (now - st.holdTimeR > 1100) {
        st.holdR = Math.max(MIN_DB - 12, st.holdR - 16 * dtSec);
      }

      setPctL(Math.round(dbToPct(st.smoothL) * 10) / 10);
      setPctR(Math.round(dbToPct(st.smoothR) * 10) / 10);
      setHoldPctL(Math.round(dbToPct(st.holdL) * 10) / 10);
      setHoldPctR(Math.round(dbToPct(st.holdR) * 10) / 10);
      setMaxDb(Math.max(st.holdL, st.holdR));
      setClipped(reading.clipped);

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [playing, soundOn]);

  return (
    <div
      className={`stereo-peak-meter ${!soundOn ? "is-muted" : ""}`}
      data-testid="stereo-peak-meter"
      title={`Master stereo peak meter (${formatDbReadout(maxDb)} dBFS)${clipped ? " — CLIPPED! Click CLIP to reset" : ""}`}
    >
      <div className="stereo-meter-bars" aria-hidden="true">
        <div className="stereo-meter-row">
          <span className="stereo-meter-ch">L</span>
          <div className="stereo-meter-track">
            <span
              className="stereo-meter-fill"
              data-testid="stereo-meter-fill-l"
              style={{ width: `${pctL}%` }}
            />
            {holdPctL > 1 && (
              <i className="stereo-meter-hold" style={{ left: `${Math.min(99, holdPctL)}%` }} />
            )}
          </div>
        </div>
        <div className="stereo-meter-row">
          <span className="stereo-meter-ch">R</span>
          <div className="stereo-meter-track">
            <span
              className="stereo-meter-fill"
              data-testid="stereo-meter-fill-r"
              style={{ width: `${pctR}%` }}
            />
            {holdPctR > 1 && (
              <i className="stereo-meter-hold" style={{ left: `${Math.min(99, holdPctR)}%` }} />
            )}
          </div>
        </div>
      </div>
      <span className="stereo-meter-db" data-testid="stereo-meter-db">
        {formatDbReadout(maxDb)}
      </span>
      <button
        type="button"
        className={`stereo-meter-clip ${clipped ? "is-clipped" : ""}`}
        data-testid="stereo-meter-clip"
        title={clipped ? "Master bus clipped (> -0.1 dBFS) — click to clear" : "No clipping detected"}
        onClick={() => {
          webAudioEngine.resetClipIndicator();
          setClipped(false);
        }}
      >
        CLIP
      </button>
    </div>
  );
}
