import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectState } from "./model";

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  getItem(key: string) { return this.data.get(key) ?? null; }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string) { this.data.delete(key); }
  setItem(key: string, value: string) { this.data.set(key, String(value)); }
}

function project(id: string, detail: string): ProjectState {
  const story = { id, title: id, startSceneId: "s", scenes: [{ id: "s", dialogueBeats: [{ id: "b", text: detail }] }] };
  return { id, title: id, sourceName: `${id}.json`, story, originalStory: story, assets: [], missing: [], importedMissing: [], snapshots: [], createdAt: 1, updatedAt: 1 };
}

async function seedLegacy(record: ProjectState) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("frame24-projects", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("projects", { keyPath: "key" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("projects", "readwrite");
    tx.objectStore("projects").put({ key: "active-project", project: record });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("IDBKeyRange", IDBKeyRange);
  vi.stubGlobal("localStorage", new MemoryStorage());
});
afterEach(() => vi.unstubAllGlobals());

describe("independent browser film saves", () => {
  it("preserves each project and its uploaded blobs while changing the active project", async () => {
    const store = await import("./storage");
    const old = project("nobodys-witness-film", "my old edit");
    old.assets.push({ id: "upload", name: "photo.jpg", type: "image", size: 3, source: "upload", blob: new Blob(["abc"]) });
    const fresh = project("sweet-jesus-film", "my new edit");
    await store.saveActiveProject(old);
    await store.saveActiveProject(fresh);
    expect((await store.loadActiveProject())?.id).toBe(fresh.id);
    const restored = await store.loadSavedProject(old.id);
    expect(restored?.story.scenes[0].dialogueBeats?.[0].text).toBe("my old edit");
    expect(restored?.assets[0].blob?.size).toBe(3);
    expect((await store.listSavedProjects()).map((entry) => entry.id)).toEqual([fresh.id, old.id]);
    // A fresh module simulates reloading the editor.
    vi.resetModules();
    const reloaded = await import("./storage");
    expect((await reloaded.loadActiveProject())?.id).toBe(fresh.id);
    expect((await reloaded.loadSavedProject(old.id))?.assets[0].blob?.size).toBe(3);
  });

  it("serializes competing autosaves in request order", async () => {
    const store = await import("./storage");
    const a = project("first", "A");
    const b = project("second", "B");
    await Promise.all([store.saveActiveProject(a), store.saveActiveProject(b)]);
    expect((await store.loadActiveProject())?.id).toBe("second");
    expect((await store.loadSavedProject("first"))?.story.scenes[0].dialogueBeats?.[0].text).toBe("A");
  });

  it("reads the previous single-project format and keeps it when the user switches", async () => {
    const legacy = project("legacy", "keep me");
    await seedLegacy(legacy);
    const store = await import("./storage");
    expect((await store.loadActiveProject())?.id).toBe("legacy");
    await store.saveActiveProject((await store.loadActiveProject())!);
    await store.saveActiveProject(project("new", "new film"));
    expect((await store.loadSavedProject("legacy"))?.story.scenes[0].dialogueBeats?.[0].text).toBe("keep me");
    expect((await store.loadActiveProject())?.id).toBe("new");
  });

  it("lists legacy projects that predate lightweight catalog summaries", async () => {
    await seedLegacy(project("legacy-active", "A"));
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("frame24-projects", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("projects", "readwrite");
      tx.objectStore("projects").put({ key: "project:older-slot", project: project("older-slot", "B") });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    const store = await import("./storage");
    expect((await store.listSavedProjects()).map((entry) => entry.id).sort()).toEqual(["legacy-active", "older-slot"]);
  });

  it("migrates the legacy localStorage active project without losing it", async () => {
    vi.stubGlobal("indexedDB", undefined);
    localStorage.setItem("frame24-fallback", JSON.stringify(project("legacy-fallback", "original edit")));
    const store = await import("./storage");
    expect((await store.loadActiveProject())?.id).toBe("legacy-fallback");
    await store.saveActiveProject((await store.loadActiveProject())!);
    await store.saveActiveProject(project("new", "new edit"));
    expect((await store.loadSavedProject("legacy-fallback"))?.story.scenes[0].dialogueBeats?.[0].text).toBe("original edit");
  });

  it("supports isolated localStorage fallback but refuses to discard an uploaded blob", async () => {
    vi.stubGlobal("indexedDB", undefined);
    const store = await import("./storage");
    await store.saveActiveProject(project("first", "A"));
    await store.saveActiveProject(project("second", "B"));
    expect((await store.loadSavedProject("first"))?.story.scenes[0].dialogueBeats?.[0].text).toBe("A");
    expect((await store.loadActiveProject())?.id).toBe("second");
    const withBlob = project("third", "C");
    withBlob.assets.push({ id: "upload", name: "x.jpg", type: "image", size: 1, source: "upload", blob: new Blob(["x"]) });
    await expect(store.saveActiveProject(withBlob)).rejects.toThrow(/cannot be saved safely/i);
    expect((await store.loadActiveProject())?.id).toBe("second");
    await store.saveActiveProject(project("fourth", "D")); // Failed writes don't poison the queue.
    expect((await store.loadActiveProject())?.id).toBe("fourth");
  });
});
