import type { ProjectState } from "./model";

const DB_NAME = "frame24-projects";
const DB_VERSION = 1;
const STORE = "projects";
const ACTIVE_KEY = "active-project";
const PROJECT_PREFIX = "project:";
const SUMMARY_PREFIX = "summary:";
const FALLBACK_KEY = "frame24-fallback";
const FALLBACK_PROJECT_PREFIX = "frame24-project:";

export interface SavedProjectSummary {
  id: string;
  title: string;
  updatedAt: number;
}

let dbPromise: Promise<IDBDatabase> | undefined;
let saveQueue: Promise<void> = Promise.resolve();
let lastSaveTime = 0;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB is unavailable."));
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open the project database."));
  });
  return dbPromise;
}

async function readDbRecord(key: string): Promise<any> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function readFallback(key: string): any {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

function newest(a: ProjectState | undefined, b: ProjectState | undefined): ProjectState | undefined {
  if (!a) return b;
  if (!b) return a;
  // Prefer IndexedDB on ties: it retains uploaded Blob assets.
  return (b.updatedAt || 0) > (a.updatedAt || 0) ? b : a;
}

async function readDbActive(): Promise<ProjectState | undefined> {
  const active = await readDbRecord(ACTIVE_KEY);
  // Older versions stored the complete project under the active key.
  if (active?.project?.story) return active.project as ProjectState;
  if (typeof active?.projectId !== "string") return undefined;
  return (await readDbRecord(`${PROJECT_PREFIX}${active.projectId}`))?.project as ProjectState | undefined;
}

function readFallbackActive(): ProjectState | undefined {
  const active = readFallback(FALLBACK_KEY);
  if (active?.story) return active as ProjectState; // Legacy fallback.
  if (typeof active?.projectId !== "string") return undefined;
  return readFallback(`${FALLBACK_PROJECT_PREFIX}${active.projectId}`) as ProjectState | undefined;
}

export async function loadActiveProject(): Promise<ProjectState | undefined> {
  let fromDb: ProjectState | undefined;
  try { fromDb = await readDbActive(); } catch { /* Try the browser fallback. */ }
  return newest(fromDb, readFallbackActive());
}

export async function loadSavedProject(id: string): Promise<ProjectState | undefined> {
  let fromDb: ProjectState | undefined;
  try {
    fromDb = (await readDbRecord(`${PROJECT_PREFIX}${id}`))?.project as ProjectState | undefined;
    if (!fromDb) {
      const legacy = await readDbActive();
      if (legacy?.id === id) fromDb = legacy;
    }
  } catch { /* Try the browser fallback. */ }
  const slot = readFallback(`${FALLBACK_PROJECT_PREFIX}${id}`) as ProjectState | undefined;
  const legacy = readFallbackActive();
  return newest(fromDb, newest(slot, legacy?.id === id ? legacy : undefined));
}

export async function listSavedProjects(): Promise<SavedProjectSummary[]> {
  const summaries = new Map<string, SavedProjectSummary>();
  const addSummary = (row: SavedProjectSummary | undefined) => {
    if (!row?.id) return;
    const old = summaries.get(row.id);
    if (!old || row.updatedAt > old.updatedAt) summaries.set(row.id, row);
  };
  const add = (project: ProjectState | undefined) => {
    if (!project?.id || !project.story) return;
    addSummary({ id: project.id, title: project.title || project.story.title || "Untitled film", updatedAt: project.updatedAt || 0 });
  };
  try {
    const db = await openDb();
    const rows = await new Promise<any[]>((resolve, reject) => {
      const range = IDBKeyRange.bound(SUMMARY_PREFIX, `${SUMMARY_PREFIX}\uffff`);
      const request = db.transaction(STORE, "readonly").objectStore(STORE).getAll(range);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    rows.forEach((row) => addSummary(row?.summary));
    // Older saves have no summaries. Inspect keys first and load only those
    // legacy records, rather than cloning every project's uploaded media.
    const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).getAllKeys();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    for (const key of keys) {
      if (typeof key === "string" && key.startsWith(PROJECT_PREFIX) && !summaries.has(key.slice(PROJECT_PREFIX.length))) {
        add((await readDbRecord(key))?.project as ProjectState | undefined);
      }
    }
    const active = await readDbRecord(ACTIVE_KEY);
    if (active?.project) add(active.project as ProjectState); // Original single-project format.
  } catch { /* IndexedDB is optional. */ }
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key?.startsWith(FALLBACK_PROJECT_PREFIX)) add(readFallback(key));
    }
    add(readFallbackActive());
  } catch { /* Storage may be unavailable entirely. */ }
  return [...summaries.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

async function persistActiveProject(snapshot: ProjectState): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      // One copy of the project, plus an active pointer, committed atomically.
      store.put({ key: `${PROJECT_PREFIX}${snapshot.id}`, project: snapshot });
      store.put({
        key: `${SUMMARY_PREFIX}${snapshot.id}`,
        summary: { id: snapshot.id, title: snapshot.title, updatedAt: snapshot.updatedAt },
      });
      store.put({ key: ACTIVE_KEY, projectId: snapshot.id });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("Project autosave failed."));
      tx.onabort = () => reject(tx.error || new Error("Project autosave was aborted."));
    });
  } catch (error) {
    try {
      // Never silently discard uploaded media when the IndexedDB write fails.
      if (snapshot.assets.some((asset) => asset.blob && !asset.dataUrl)) {
        throw new Error("IndexedDB is unavailable; uploaded media cannot be saved safely. Export a bundle or restore browser storage before switching films.");
      }
      const fallback = {
        ...snapshot,
        assets: snapshot.assets.map(({ blob: _blob, ...asset }) => asset),
      };
      localStorage.setItem(`${FALLBACK_PROJECT_PREFIX}${snapshot.id}`, JSON.stringify(fallback));
      localStorage.setItem(FALLBACK_KEY, JSON.stringify({ projectId: snapshot.id, updatedAt: snapshot.updatedAt }));
    } catch (fallbackError) {
      throw fallbackError instanceof Error ? fallbackError : error instanceof Error ? error : new Error("Project autosave failed.");
    }
  }
}

export function saveActiveProject(project: ProjectState): Promise<void> {
  // Serialize writes so a slow save of the previous film cannot become active
  // after the newly selected film. A failed save must not block later retries.
  lastSaveTime = Math.max(Date.now(), lastSaveTime + 1);
  const snapshot = { ...project, updatedAt: lastSaveTime };
  const operation = saveQueue.catch(() => undefined).then(() => persistActiveProject(snapshot));
  saveQueue = operation;
  return operation;
}
