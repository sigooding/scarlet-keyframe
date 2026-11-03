/**
 * The editor's "Make depth map" button: talks to the depth API (vite-plugins/depth-api.ts), keeps one job going, and
 * says what the row in the Clip tab should show.
 *
 * Three parts, none of which needs React:
 *   - the API client (`fetchDepthReady`, `startDepthJob`, ...),
 *   - `createDepthMaker`, a small controller that owns the job. It lives for the whole session, not in the Inspector, so
 *     choosing another shot while a map is being made does not lose it, and the finished map goes to the shot it was
 *     started for (if that shot still has that picture),
 *   - `depthRowView`, what the row should show for a shot, as plain data.
 */
import { DEPTH_API, type DepthApiError, type DepthJobView, type DepthMakeResult, type DepthReady } from "./depthApiTypes";

export type { DepthJobView, DepthMakeResult, DepthReady } from "./depthApiTypes";

const PICTURE_ROOT = "/film/img/";
const DEPTH_ROOT = "/film/depth/";
const PICTURE_EXT = /\.(?:jpe?g|png|webp)$/i;

/** The command to run once, in the project folder, before depth maps can be made. */
export const DEPTH_SETUP_COMMAND = "npm run depth:setup";

/** `/film/img/a/b.jpg?x#y` -> `/film/img/a/b.jpg` */
export function plainPictureRef(ref: string): string {
  return ref.split("?")[0].split("#")[0];
}

/** Depth maps can be made for the film's own pictures: `/film/img/....jpg|png|webp` (what the depth command accepts). */
export function pictureCanHaveDepthMap(ref: string | undefined | null): boolean {
  if (!ref) return false;
  const clean = plainPictureRef(ref);
  return (
    clean.startsWith(PICTURE_ROOT) &&
    PICTURE_EXT.test(clean) &&
    !clean.includes("\\") &&
    !clean.split("/").some((part) => part === ".." || part === ".")
  );
}

/** `/film/img/montage/m4-railway-rain.jpg` -> `/film/depth/montage/m4-railway-rain/depth.png` (the film's own layout). */
export function depthMapRefForPicture(ref: string): string {
  const clean = plainPictureRef(ref);
  return `${DEPTH_ROOT}${clean.slice(PICTURE_ROOT.length).replace(PICTURE_EXT, "")}/depth.png`;
}

// ---------------------------------------------------------------------------------------------------------------------
// The API client
// ---------------------------------------------------------------------------------------------------------------------

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** The server said no, or could not be reached. `kind` is the API's error, or "network". */
export class DepthApiFailure extends Error {
  constructor(
    readonly kind: DepthApiError["error"] | "network",
    message: string,
    readonly id?: string,
  ) {
    super(message);
    this.name = "DepthApiFailure";
  }
}

async function callApi<T>(fetchImpl: FetchLike, method: "GET" | "POST", route: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetchImpl(`${DEPTH_API}/${route}`, {
      method,
      cache: "no-store",
      ...(body !== undefined ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new DepthApiFailure("network", "Could not reach the editor's server. Is it still running?");
  }
  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }
  if (!response.ok) {
    const error = (json ?? {}) as Partial<DepthApiError>;
    throw new DepthApiFailure(error.error ?? "failed", error.message ?? `The server answered ${response.status}.`, error.id);
  }
  return json as T;
}

/** What this computer can do, or null when there is no depth API to ask (a page opened from disk, a plain static host). */
export async function fetchDepthReady(fetchImpl: FetchLike = fetch, fresh = false): Promise<DepthReady | null> {
  try {
    const json = await callApi<DepthReady>(fetchImpl, "GET", `ready${fresh ? "?fresh=1" : ""}`);
    return json && json.ok === true ? json : null;
  } catch {
    return null;
  }
}

export const startDepthJob = (picture: string, fetchImpl: FetchLike = fetch) => callApi<DepthJobView>(fetchImpl, "POST", "make", { picture });
export const fetchDepthJob = (id: string, fetchImpl: FetchLike = fetch) =>
  callApi<DepthJobView>(fetchImpl, "GET", `status?id=${encodeURIComponent(id)}`);
export const cancelDepthJob = (id: string, fetchImpl: FetchLike = fetch) => callApi<DepthJobView>(fetchImpl, "POST", "cancel", { id });

// ---------------------------------------------------------------------------------------------------------------------
// The controller
// ---------------------------------------------------------------------------------------------------------------------

export interface DepthMakerJob {
  /** The shot the map is for, and the picture it was started for. */
  frameId: string;
  picture: string;
  /** "starting" is the moment between the click and the server's first answer. */
  status: "starting" | "running" | "done" | "error" | "cancelled";
  /** The server's id for it; null before the server answered, and when the map was already there. */
  id: string | null;
  percent: number | null;
  log: string[];
  message: string | null;
  result: DepthMakeResult | null;
  /** The map was already on disk, so nothing was made. */
  existing: boolean;
  startedAt: number;
  /** A finished map is put on the shot; `applied` says it was, `note` why not when it was not. */
  applied: boolean;
  note: string | null;
}

export interface DepthMakerState {
  /** null before the first answer; "unavailable" when there is no server to ask. */
  ready: DepthReady | "unavailable" | null;
  job: DepthMakerJob | null;
}

/** Puts the made map on the shot. Says whether it did, and why not otherwise. */
export type ApplyDepthMap = (frameId: string, picture: string, mapRef: string) => { applied: true } | { applied: false; reason: string };

export interface DepthMakerDeps {
  apply: ApplyDepthMap;
  fetch?: FetchLike;
  setTimeout?: (fn: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
  now?: () => number;
  /** How often to ask how the job is going. */
  pollMs?: number;
}

export interface DepthMakerController {
  getState(): DepthMakerState;
  subscribe(listener: () => void): () => void;
  /** Ask what this computer can do. Does nothing when that is already known, unless `fresh`. */
  checkReady(fresh?: boolean): Promise<void>;
  /** Make the depth map of this shot's picture. */
  start(frameId: string, picture: string): Promise<void>;
  cancel(): Promise<void>;
  /** Forget a finished job (its message goes away). */
  dismiss(): void;
}

const MAX_POLL_FAILURES = 5;

export function createDepthMaker(deps: DepthMakerDeps): DepthMakerController {
  const fetchImpl: FetchLike = deps.fetch ?? ((input, init) => fetch(input, init));
  const schedule = deps.setTimeout ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const unschedule = deps.clearTimeout ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  const now = deps.now ?? Date.now;
  const pollMs = deps.pollMs ?? 700;

  let state: DepthMakerState = { ready: null, job: null };
  let timer: unknown = null;
  let readyRequest: Promise<void> | null = null;
  const listeners = new Set<() => void>();

  const set = (next: Partial<DepthMakerState>) => {
    state = { ...state, ...next };
    for (const listener of [...listeners]) listener();
  };
  const patchJob = (patch: Partial<DepthMakerJob>) => {
    if (state.job) set({ job: { ...state.job, ...patch } });
  };
  const stopPolling = () => {
    if (timer !== null) unschedule(timer);
    timer = null;
  };

  /** The server's view of the job, folded into ours; when it has ended, the map goes onto the shot. */
  const absorb = (view: DepthJobView) => {
    if (!state.job) return;
    const base: Partial<DepthMakerJob> = {
      id: view.id,
      percent: view.percent,
      log: view.log,
      message: view.message,
      result: view.result,
      existing: Boolean(view.existing),
    };
    if (view.status === "running") {
      patchJob({ ...base, status: "running" });
      return;
    }
    stopPolling();
    if (view.status === "done" && view.result?.ok) {
      const job = state.job;
      const outcome = deps.apply(job.frameId, job.picture, view.result.map ?? view.map);
      patchJob({
        ...base,
        status: "done",
        applied: outcome.applied,
        note: outcome.applied ? null : `${outcome.reason} The map is saved at ${view.result.map ?? view.map}.`,
      });
      return;
    }
    patchJob({ ...base, status: view.status === "cancelled" ? "cancelled" : "error", message: view.message ?? "The depth map could not be made." });
  };

  const poll = (id: string, failures = 0) => {
    stopPolling();
    timer = schedule(async () => {
      timer = null;
      if (!state.job || state.job.id !== id || state.job.status !== "running") return;
      try {
        absorb(await fetchDepthJob(id, fetchImpl));
        if (state.job?.status === "running") poll(id);
      } catch (error) {
        const unknownJob = error instanceof DepthApiFailure && error.kind === "not-found";
        if (unknownJob || failures + 1 >= MAX_POLL_FAILURES) {
          patchJob({
            status: "error",
            message: unknownJob
              ? "The editor's server no longer knows this job (it was restarted). Try again."
              : error instanceof Error
                ? error.message
                : "Lost contact with the editor's server.",
          });
        } else {
          poll(id, failures + 1);
        }
      }
    }, pollMs);
  };

  const controller: DepthMakerController = {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    checkReady(fresh = false) {
      if (!fresh && state.ready !== null) return Promise.resolve();
      if (readyRequest) return readyRequest;
      readyRequest = fetchDepthReady(fetchImpl, fresh)
        .then((ready) => set({ ready: ready ?? "unavailable" }))
        .finally(() => {
          readyRequest = null;
        });
      return readyRequest;
    },

    async start(frameId, picture) {
      if (state.job && (state.job.status === "starting" || state.job.status === "running")) return;
      const clean = plainPictureRef(picture);
      set({
        job: {
          frameId,
          picture: clean,
          status: "starting",
          id: null,
          percent: null,
          log: [],
          message: null,
          result: null,
          existing: false,
          startedAt: now(),
          applied: false,
          note: null,
        },
      });
      try {
        const view = await startDepthJob(clean, fetchImpl);
        absorb(view);
        if (view.id && state.job?.status === "running") poll(view.id);
      } catch (error) {
        patchJob({
          status: "error",
          message: error instanceof Error ? error.message : "The depth map could not be started.",
        });
        // a refusal that says the machine is not set up (or is busy) changes what the row should offer
        if (error instanceof DepthApiFailure && (error.kind === "setup-needed" || error.kind === "busy")) {
          void controller.checkReady(true);
        }
      }
    },

    async cancel() {
      const job = state.job;
      if (!job || job.status !== "running" || !job.id) return;
      try {
        absorb(await cancelDepthJob(job.id, fetchImpl));
      } catch (error) {
        patchJob({ message: error instanceof Error ? error.message : "Could not cancel." });
      }
    },

    dismiss() {
      if (!state.job || state.job.status === "starting" || state.job.status === "running") return;
      set({ job: null });
    },
  };
  return controller;
}

// ---------------------------------------------------------------------------------------------------------------------
// What the row shows
// ---------------------------------------------------------------------------------------------------------------------

export type DepthRowView =
  /** Nothing to offer: no suitable picture, or the shot already has a depth map. */
  | { kind: "hidden" }
  /** Asking the server what this computer can do. */
  | { kind: "checking" }
  /** No server to ask (the page was opened from disk): depth maps are made by `npm run depth`, or the app must be served. */
  | { kind: "unavailable" }
  /** Python or its packages are missing: one command to run once. */
  | { kind: "setup-needed"; command: string }
  /** The button can be pressed. `note` says what will happen. */
  | { kind: "ready"; note: string }
  /** A map is being made for another shot (or by another page): one at a time. */
  | { kind: "busy"; note: string }
  | { kind: "running"; percent: number | null; phase: string; cancellable: boolean }
  | { kind: "failed"; message: string }
  | { kind: "done"; text: string; caution: string | null; note: string | null };

/** What the row in the Clip tab shows for this shot. Pure: `now` is passed in so the elapsed time can be tested. */
export function depthRowView(input: {
  frameId: string;
  picture: string | undefined;
  hasDepthMap: boolean;
  state: DepthMakerState;
  now?: number;
}): DepthRowView {
  const { frameId, picture, hasDepthMap, state } = input;
  const job = state.job;

  if (job && job.frameId === frameId) {
    if (job.status === "starting" || job.status === "running") {
      const seconds = Math.max(0, Math.round(((input.now ?? Date.now()) - job.startedAt) / 1000));
      const downloading = job.percent !== null && job.percent < 100 && job.log.some((line) => /^Downloading /i.test(line) || /download/i.test(line));
      const phase =
        job.status === "starting"
          ? "Starting…"
          : downloading
            ? `Downloading the model (once)… ${job.percent}%`
            : `Making the depth map… ${seconds} s`;
      return { kind: "running", percent: downloading ? job.percent : null, phase, cancellable: job.status === "running" && Boolean(job.id) };
    }
    if (job.status === "error" || job.status === "cancelled") {
      // The server refused because Python is not set up: say what to run, with the buttons for it, not just the error.
      if (job.status === "error" && typeof state.ready === "object" && state.ready !== null && (!state.ready.python || !state.ready.packages)) {
        return { kind: "setup-needed", command: DEPTH_SETUP_COMMAND };
      }
      return { kind: "failed", message: job.message ?? (job.status === "cancelled" ? "Cancelled." : "The depth map could not be made.") };
    }
    // done
    const result = job.result;
    const size = result?.width && result?.height ? `${result.width}×${result.height}` : null;
    const how = result?.provider ? ` on the ${result.provider === "gpu" ? "GPU" : "CPU"}` : "";
    const took = typeof result?.seconds === "number" ? `, ${result.seconds} s${how}` : "";
    const made = `Depth map made${size ? ` (${size}${took})` : ""}.`;
    return {
      kind: "done",
      text: job.existing
        ? job.applied
          ? "This picture already had a depth map. It is now this shot's."
          : "This picture already has a depth map."
        : job.applied
          ? `${made} Turn on MAP in the Depth Maps lane to see it.`
          : made,
      caution: job.applied ? "If people are in this picture they will stretch when the camera moves. Add a cut-out layer for each (More effects > Depth & parallax)." : null,
      note: job.note,
    };
  }

  if (!pictureCanHaveDepthMap(picture) || hasDepthMap) return { kind: "hidden" };

  if (job && (job.status === "starting" || job.status === "running")) {
    return { kind: "busy", note: "A depth map is being made for another shot. One at a time." };
  }
  const ready = state.ready;
  if (ready === null) return { kind: "checking" };
  if (ready === "unavailable") return { kind: "unavailable" };
  if (!ready.python || !ready.packages) return { kind: "setup-needed", command: DEPTH_SETUP_COMMAND };
  if (ready.busy) return { kind: "busy", note: "A depth map is already being made (started from another page). One at a time." };

  const model = ready.model.custom
    ? ready.model.cached
      ? "Made on this computer from this picture, with your model file."
      : "The model file you chose (SCARLET_KEYFRAME_DEPTH_MODEL_FILE) was not found, so this will fail."
    : ready.model.cached
      ? "Made on this computer from this picture."
      : `Made on this computer from this picture. The first one downloads a ${ready.model.mb} MB model, once.`;
  return { kind: "ready", note: `${model}${ready.gpu ? " Uses your graphics card." : ""}` };
}
