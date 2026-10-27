import type { ProjectState } from "./model";

const DB_NAME = "frame24-projects";
const DB_VERSION = 1;
const STORE = "projects";
const ACTIVE_KEY = "active-project";
const FALLBACK_KEY = "frame24-fallback";

let dbPromise: Promise<IDBDatabase> | undefined;

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

export async function loadActiveProject(): Promise<ProjectState | undefined> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).get(ACTIVE_KEY);
      request.onsuccess = () => resolve(request.result?.project as ProjectState | undefined);
      request.onerror = () => reject(request.error);
    });
  } catch {
    try {
      const raw = localStorage.getItem(FALLBACK_KEY);
      return raw ? JSON.parse(raw) as ProjectState : undefined;
    } catch {
      return undefined;
    }
  }
}

export async function saveActiveProject(project: ProjectState): Promise<void> {
  const snapshot = { ...project, updatedAt: Date.now() };
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ key: ACTIVE_KEY, project: snapshot });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("Project autosave failed."));
    });
  } catch (error) {
    try {
      const fallback = { ...snapshot, assets: snapshot.assets.filter((asset) => !asset.blob) };
      localStorage.setItem(FALLBACK_KEY, JSON.stringify(fallback));
    } catch {
      throw error instanceof Error ? error : new Error("Project autosave failed.");
    }
  }
}
