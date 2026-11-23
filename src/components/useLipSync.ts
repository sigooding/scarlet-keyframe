import { useCallback, useEffect, useRef, useState } from "react";
import { DepthApiFailure, cancelDepthJob, fetchDepthJob, fetchDepthReady, startLipSyncJob } from "../core/depthMaker";
import type { DepthJobView } from "../core/depthApiTypes";
import type { LipSyncJob, LipSyncLine, LipSyncState } from "../core/lipSync";

const POLL_MS = 1500;

/** Puts a finished clip into its shot. Says whether it did, and why not otherwise. */
export type ApplyLipSync = (job: LipSyncJob & { video: string; duration: number }) => { applied: true } | { applied: false; reason: string };

/**
 * The Make lip sync button's job: asks the editor's server whether lip sync is set up, starts one job, follows it, and
 * puts the clip into the shot it was started for. Lives for the whole session (choosing another shot does not lose it).
 * The job is kept in a ref and copied into state, so nothing with side effects (the edit) runs inside a state updater.
 */
export function useLipSync(apply: ApplyLipSync) {
  const [state, setState] = useState<LipSyncState>({ ready: null, job: null });
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const jobRef = useRef<LipSyncJob | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);

  const setJob = useCallback((job: LipSyncJob | null) => {
    jobRef.current = job;
    setState((s) => ({ ...s, job }));
  }, []);

  const check = useCallback(async (fresh = false) => {
    const ready = await fetchDepthReady(fetch, fresh);
    if (!alive.current) return;
    setState((s) => ({ ...s, ready: ready?.lipsync ?? (ready ? { ready: false, missing: ["a newer editor server (restart npm run dev)"], setupCommand: "npm run dev" } : "unavailable") }));
  }, []);

  useEffect(() => {
    alive.current = true;
    if (typeof window === "undefined" || window.location.protocol === "file:") setState((s) => ({ ...s, ready: "unavailable" }));
    else void check();
    return () => {
      alive.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [check]);

  const fail = useCallback(
    (message: string, cancelled = false) => {
      const job = jobRef.current;
      if (job) setJob({ ...job, status: cancelled ? "cancelled" : "error", message });
    },
    [setJob],
  );

  const follow = useCallback(
    (view: DepthJobView) => {
      const job = jobRef.current;
      if (!job || !alive.current) return;
      const next: LipSyncJob = { ...job, id: view.id, current: view.current ?? view.log[view.log.length - 1] ?? job.current };
      if (view.status === "running") {
        setJob({ ...next, status: "running" });
        if (view.id) {
          const id = view.id;
          timer.current = setTimeout(() => {
            fetchDepthJob(id).then(follow, (error: unknown) => fail(error instanceof Error ? error.message : String(error)));
          }, POLL_MS);
        }
        return;
      }
      if (view.status === "done" && view.result?.video) {
        const video = view.result.video;
        const duration = view.result.duration ?? (job.line.to - job.line.from) / 24;
        const done: LipSyncJob = { ...next, status: "done", video, duration };
        const outcome = applyRef.current({ ...done, video, duration });
        setJob({ ...done, applied: outcome.applied, note: outcome.applied ? null : outcome.reason });
        return;
      }
      fail(view.message ?? "It stopped.", view.status === "cancelled");
    },
    [fail, setJob],
  );

  const start = useCallback(
    (frameId: string, picture: string, line: LipSyncLine, totalFrames: number) => {
      if (timer.current) clearTimeout(timer.current);
      setJob({ frameId, totalFrames, picture, line, status: "starting", id: null, current: "Starting…", message: null, video: null, duration: null, applied: false, note: null });
      startLipSyncJob(picture, line.audio).then(follow, (error: unknown) => {
        fail(error instanceof Error ? error.message : String(error));
        if (error instanceof DepthApiFailure && error.kind === "setup-needed") void check(true);
      });
    },
    [check, fail, follow, setJob],
  );

  const cancel = useCallback(() => {
    const id = jobRef.current?.id;
    if (!id) return;
    if (timer.current) clearTimeout(timer.current);
    void cancelDepthJob(id).then(follow, () => undefined);
  }, [follow]);

  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setJob(null);
  }, [setJob]);

  return { state, check, start, cancel, dismiss };
}
