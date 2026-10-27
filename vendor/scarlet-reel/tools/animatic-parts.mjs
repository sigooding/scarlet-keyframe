// The animatic exporter's --parts N (tools/export-animatic.mjs): renders N stretches of the film at once, each in its own
// browser, then joins their pictures, sound, captions and chapters into one MP4. A machine with several cores (and a
// graphics card) renders the film several times faster this way. See docs/animatic-export.md.
//
// The film is only cut where a part can start cleanly: at an ordinary scene that sets its own music (or comes when none
// is playing) and its own room sound, so no song or bed that carries over from an earlier scene is lost at a seam.
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** "HH:MM:SS,mmm" */
export const stamp = (s) => {
  const ms = Math.max(0, Math.round(s * 1000));
  const p = (n, w = 2) => String(n).padStart(w, "0");
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};
/** Captions [{ a, b, text }] (seconds) as an .srt; a blank line inside a caption would end it, so none is kept. */
export const srtText = (entries) =>
  entries.map((e, i) => `${i + 1}\n${stamp(e.a)} --> ${stamp(e.b)}\n${String(e.text).replace(/\n\s*\n/g, "\n")}\n`).join("\n");

/** Scenes where a part may begin: an ordinary scene with its own room sound that starts its own music or comes when no
 *  music is playing (walking the whole film from its start, so the music carried into each scene is known). */
export function safeStarts(film, order) {
  const by = new Map(film.scenes.map((s) => [s.id, s]));
  const out = new Set();
  let playing = false;
  for (const id of order) {
    const s = by.get(id);
    if (!s) continue;
    if (/^nw_s\d+[a-z]?$/.test(id) && s.ambientAudio !== undefined && (s.musicMode === "track" || s.musicMode === "none" || !playing)) out.add(id);
    if (s.musicMode === "track") playing = true;
    else if (s.musicMode === "none") playing = false;
  }
  return out;
}

/** Splits `ids` (the nodes to render, in order, with `secondsOf(id)`) into up to `n` parts of about equal length, each
 *  beginning at a safe start. Returns [{ from, to, seconds }]; the last part's `to` is the export's own (null: the end). */
export function planParts(ids, secondsOf, safe, n, lastTo) {
  const starts = [0];
  const total = ids.reduce((t, id) => t + secondsOf(id), 0);
  let at = 0;
  const startAt = ids.map((id) => { const t = at; at += secondsOf(id); return t; });
  for (let k = 1; k < n; k++) {
    const want = (k * total) / n;
    let best = -1;
    ids.forEach((id, i) => {
      if (i <= starts[starts.length - 1] || !safe.has(id)) return;
      if (best < 0 || Math.abs(startAt[i] - want) < Math.abs(startAt[best] - want)) best = i;
    });
    if (best > 0 && !starts.includes(best)) starts.push(best);
  }
  starts.sort((a, b) => a - b);
  return starts.map((s, k) => {
    const end = k + 1 < starts.length ? starts[k + 1] : ids.length;
    const seconds = ids.slice(s, end).reduce((t, id) => t + secondsOf(id), 0);
    return { from: ids[s], to: k + 1 < starts.length ? ids[end - 1] : lastTo, seconds };
  });
}

/**
 * Runs the parts (each a child exporter writing picture.mp4, sound.wav, captions.json and report.json into
 * <outDir>/parts/<k>), reports their combined progress, and joins them. Resolves with the joined report.
 */
export async function runParts({ plan, script, forward, outDir, ffmpeg, estimate, onProgress, say, keep }) {
  const partsDir = join(outDir, "parts");
  mkdirSync(partsDir, { recursive: true });
  const started = Date.now();
  const state = plan.map(() => ({ seconds: 0, title: "", done: null, error: null }));
  const children = [];
  const killAll = () => children.forEach((c) => { try { c.kill(); } catch { /* gone */ } });
  process.on("exit", killAll);
  const results = await new Promise((resolve, reject) => {
    let finished = 0;
    plan.forEach((p, k) => {
      const out = join(partsDir, String(k + 1));
      const args = [script, "--from", p.from, ...(p.to ? ["--to", p.to] : []), "--out", out, "--child", "--parent", String(process.pid), "--progress-json", ...forward];
      const c = spawn(process.execPath, args, { stdio: ["ignore", "pipe", "pipe"] });
      children.push(c);
      let buf = "", tail = "";
      c.stdout.on("data", (d) => {
        buf += d;
        let i;
        while ((i = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          if (!line.startsWith("{")) continue;
          try {
            const m = JSON.parse(line);
            if (m.type === "progress") Object.assign(state[k], { seconds: m.seconds, title: m.title ?? "" });
            else if (m.type === "done") state[k].done = m;
            else if (m.type === "error") state[k].error = m.message;
            else if (m.type === "log" && /drawing with|encoding with/.test(m.message) && k === 0) say(m.message);
          } catch { /* not ours */ }
        }
      });
      c.stderr.on("data", (d) => (tail = (tail + d).slice(-1500)));
      c.on("close", (code) => {
        if (code !== 0 || !state[k].done) {
          killAll();
          reject(new Error(`part ${k + 1} (${p.from}…) stopped: ${state[k].error ?? (tail.trim().split("\n").pop() || `code ${code}`)}`));
          return;
        }
        if (++finished === plan.length) resolve(state.map((s, j) => ({ ...s.done, dir: join(partsDir, String(j + 1)) })));
      });
    });
    const tick = setInterval(() => {
      if (finished === plan.length) return clearInterval(tick);
      onProgress({
        seconds: state.reduce((t, s) => t + s.seconds, 0),
        estimate,
        title: state.map((s, k) => `${k + 1}: ${s.done ? "done" : s.title || "starting"}`).join(" · "),
        elapsed: (Date.now() - started) / 1000,
      });
    }, 2000);
  });

  // join: the pictures and the sound end to end (the parts were made with the same settings), captions and chapters moved
  // on by the length of the parts before them
  const list = (name) => {
    const f = join(partsDir, `${name}.txt`);
    writeFileSync(f, results.map((r) => `file '${join(r.dir, name).replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n"));
    return f;
  };
  const picture = join(outDir, "picture.mp4"), sound = join(outDir, "sound.wav");
  for (const [name, outFile] of [["picture.mp4", picture], ["sound.wav", sound]]) {
    const r = spawnSync(ffmpeg, ["-nostdin", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", list(name), "-c", "copy", outFile]);
    if (r.status !== 0) throw new Error(`the parts' ${name} could not be joined: ${String(r.stderr).slice(0, 300)}`);
  }
  let offset = 0;
  const captions = [], chapters = [], warnings = [], pageErrors = [];
  for (const r of results) {
    for (const c of JSON.parse(readFileSync(join(r.dir, "captions.json"), "utf8"))) captions.push({ ...c, a: c.a + offset, b: c.b + offset });
    for (const c of r.chapters ?? []) if (chapters[chapters.length - 1]?.title !== c.title) chapters.push({ ...c, t: c.t + offset });
    warnings.push(...(r.warnings ?? []).map((w) => `part ${results.indexOf(r) + 1}: ${w}`));
    pageErrors.push(...(r.pageErrors ?? []));
    offset += r.seconds;
  }
  if (!keep) rmSync(partsDir, { recursive: true, force: true });
  return {
    seconds: offset, frames: results.reduce((t, r) => t + r.frames, 0), captions, chapters, warnings, pageErrors,
    sound: { peak: Math.max(...results.map((r) => r.sound?.peak ?? 0)), missing: [...new Set(results.flatMap((r) => r.sound?.missing ?? []))] },
    renderer: results[0]?.renderer, encoder: results[0]?.encoder,
    parts: results.map((r, k) => ({ from: plan[k].from, to: plan[k].to, seconds: r.seconds, renderMinutes: r.renderMinutes })),
    renderMinutes: Number(((Date.now() - started) / 60000).toFixed(1)),
    picture, sound,
  };
}

/** True if this ffmpeg can encode H.264 on an NVIDIA card here (it has h264_nvenc and the driver lets it start). */
export function nvencWorks(ffmpeg) {
  const r = spawnSync(ffmpeg, ["-nostdin", "-v", "error", "-f", "lavfi", "-i", "color=c=black:s=256x144:d=0.2", "-c:v", "h264_nvenc", "-f", "null", "-"]);
  return r.status === 0;
}

