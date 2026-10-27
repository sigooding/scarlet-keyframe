// Renders Nobody's Witness (the film on this engine) to an MP4 animatic: the pictures with every effect and the depth
// camera as the game draws them, the sound as the game plays it, the spoken lines burned in as subtitles and the
// narration and scene headings as descriptions; plus an .srt of the same captions and a chapter per scene.
// See docs/animatic-export.md.
//
//   npm run export:animatic                                  # the whole film, titles to credits
//   npm run export:animatic -- --from nw_s65 --to nw_s66     # some scenes
//   options: --out <dir> (default exports/animatics/whole-film, or <from>-<to>)  --size 1280x720 | 1920x1080  --fps 24
//            --no-subs  --no-desc  --no-marks (no scene/beat/picture label in the corner)  --pace 1 (0.8 brisker, 1.25 slower)  --url <a running dev server>
//            --gpu (use the graphics card instead of software rendering)  --progress-json (one JSON line per update)
//            --debug (also writes debug.json: every caption, scene change, sound and ambience event the page logged)
//            --keep-parts (keep picture.mp4 and sound.wav, which are otherwise deleted once animatic.mp4 is made)
//            --parts N (render N stretches of the film at once, each in its own browser, and join them: tools/animatic-parts.mjs)
//   needs ffmpeg (on the PATH, or FFMPEG=<path>) and Playwright's Chromium (or PLAYWRIGHT_CHROMIUM_PATH)
//
// How: the real game runs in headless Chromium on a test clock, in animatic mode (?animatic=1: hands-off, captions drawn
// by the game). For every frame the clock moves on 1/fps of a second, CSS animations and videos are set to that moment,
// and a screenshot goes to ffmpeg, so the picture is exact however slow the machine is. Sound cannot be recorded that
// way, so the page's <audio> elements play on the same clock (each ends after its file's length) and every play, pause,
// seek and volume change is logged, with each change of the ambience and each synthesised sound the engine makes; the
// mix is rebuilt from that log afterwards (tools/animatic-mix.mjs) and muxed in.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { ambientLayers, makeDecoder, mediaSegments, synthEvents, writeMix } from "./animatic-mix.mjs";
import { nvencWorks, planParts, runParts, safeStarts, srtText } from "./animatic-parts.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FILM_ID = "nobodys-witness-film";

/* ------------------------------ options ------------------------------ */
const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < argv.length && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};
const has = (name) => argv.includes(`--${name}`);
const film = loadFilm();
const order = filmOrder(film);
const from = opt("from", order[0]);
const to = opt("to", null);
const [W, H] = (opt("size", "1280x720").match(/^(\d+)x(\d+)$/) ?? [0, 1280, 720]).slice(1).map(Number);
const fps = Math.max(1, Math.min(60, Number(opt("fps", "24")) || 24));
const pace = Number(opt("pace", "1")) || 1;
const subs = !has("no-subs"), desc = !has("no-desc"), marks = !has("no-marks");
const whole = from === order[0] && !to;
const outDir = resolve(opt("out", join(ROOT, "exports/animatics", whole ? "whole-film" : `${from}-${to ?? "end"}`)));
const json = has("progress-json");
const FFMPEG = process.env.FFMPEG || "ffmpeg";
const maxSeconds = Number(opt("max-seconds", String(6 * 3600)));
const gpu = has("gpu");
const parts = Math.max(1, Math.min(8, Math.round(Number(opt("parts", "1")) || 1)));
// a part of a --parts render: no sound fade at its end, no final file of its own, and it stops if its parent goes
const child = has("child");
const parentPid = Number(opt("parent", "0"));
if (child && parentPid) setInterval(() => { try { process.kill(parentPid, 0); } catch { process.exit(1); } }, 3000).unref();

const say = (msg) => (json ? console.log(JSON.stringify({ type: "log", message: msg })) : console.log(msg));
let stopServer = () => {};
const fail = (msg) => {
  if (json) console.log(JSON.stringify({ type: "error", message: msg }));
  else console.error(`export-animatic: ${msg}`);
  try { stopServer(); } catch { /* already gone */ }
  process.exit(1);
};
// a render runs for hours: anything that goes wrong on the way ends it with a message, not a stack trace
process.on("unhandledRejection", (e) => fail(`stopped: ${String(e?.message ?? e).split("\n")[0]}`));
process.on("uncaughtException", (e) => fail(`stopped: ${String(e?.message ?? e).split("\n")[0]}`));

if (!order.includes(from)) fail(`no scene "${from}" in the film`);
if (to && !order.includes(to)) fail(`no scene "${to}" in the film`);
if (to && order.indexOf(to) < order.indexOf(from)) fail(`"${to}" comes before "${from}" in the film`);
if (spawnSync(FFMPEG, ["-version"]).status !== 0) fail("ffmpeg not found: install it or set FFMPEG=<path to ffmpeg>");
mkdirSync(outDir, { recursive: true });

/* ------------------------------ the film ------------------------------ */
function loadFilm() {
  const t = readFileSync(join(ROOT, "src/data/nobodysWitnessFilm.ts"), "utf8");
  return JSON.parse(t.slice(t.indexOf("= {") + 2).replace(/\}\s*as unknown as Story[\s\S]*$/, "}"));
}
/** Scene ids in play order, following each scene's exit from the start. */
function filmOrder(story) {
  const by = new Map(story.scenes.map((s) => [s.id, s]));
  const next = (s) => {
    const b = s.dialogueBeats ?? [];
    return b[b.length - 1]?.afterBeatTargetSceneId || s.autoAdvanceTargetSceneId || s.choices?.[0]?.targetSceneId;
  };
  const out = [];
  for (let id = story.startSceneId; id && by.has(id) && !out.includes(id); id = next(by.get(id))) out.push(id);
  return out;
}

/** About how long the film runs from `from` to the end of `to` in animatic mode, with the same holds as
 *  src/game/animatic.tsx (a scene heading 2.4 s, a silent line its reading time, a recorded line its length and 0.7 s,
 *  a scene's last line before its cut), the titles and montages for their set time and the end credits for their song.
 *  Sent with the progress, so the dialog can say how long the render has left. */
function estimator(durations) {
  const by = new Map(film.scenes.map((s) => [s.id, s]));
  const lengthOf = (url) => durations[decodeURIComponent(String(url).split(/[?#]/)[0])];
  // the same timings and joined action lines as src/game/animatic.tsx (readingSeconds, AFTER_VOICE_SECONDS, joinActionLines)
  const read = (t, k = 1) => Math.min(7, Math.max(1.5, 0.3 + String(t ?? "").replace(/\s+/g, " ").trim().length / 20)) * k * pace;
  const lone = (b) => !b.audioUrl && b.silent && b.text && b.text !== "·";
  const join = (beats) => beats.reduce((out, b) => {
    const prev = out[out.length - 1];
    const plain = Object.keys(b).every((k) => ["id", "characterId", "text", "silent"].includes(k));
    if (prev && lone(prev) && lone(b) && plain && prev.characterId === b.characterId && `${prev.text} ${b.text}`.length <= 200) out[out.length - 1] = { ...prev, text: `${prev.text} ${b.text}` };
    else out.push(b);
    return out;
  }, []);
  const inTo = (id) => !!to && (id === to || id.startsWith(`${to}_`));
  const ids = [];
  let reached = false;
  for (const id of order.slice(order.indexOf(from))) {
    if (inTo(id)) reached = true;
    else if (reached) break;
    if (!by.get(id) || by.get(id).isEnding) break;
    ids.push(id);
  }
  const secondsOf = (id) => {
    const s = by.get(id);
    let total = 0;
    if (s.nodeType === "credits") {
      // the titles and montages run for their set time; the end credits for their cards (measured: 32 cards of 3.2 s, 110 s)
      return s.autoAdvanceDelaySeconds ?? (s.credits?.lines?.length ?? 10) * (s.credits?.cardSeconds ?? 3) + 7;
    }
    const prose = (s.prose ?? "").trim();
    if (prose) total += /^(INT|EXT|I\/E)[./\s]/i.test(prose) ? 1.6 * pace : read(prose);
    const beats = join(s.dialogueBeats ?? []), k = s.animaticReadPace ?? 1;
    beats.forEach((b, i) => {
      const last = i === beats.length - 1, delay = b.afterBeatDelaySeconds;
      if (b.audioUrl) total += (lengthOf(b.audioUrl) ?? 3) + (last ? delay ?? 1 : 0.45) + 0.1;
      else total += last ? (delay === 1 || delay == null ? Math.max(1, read(b.text, k)) : delay) : read(b.text, k) + 0.05;
    });
    return total + Math.min(2.4, Number(s.transitionSpeed) || 1.1);
  };
  return { ids, secondsOf, total: Math.round(ids.reduce((t, id) => t + secondsOf(id), 0)) };
}

/* ------------------------------ audio file lengths ------------------------------ */
function audioFiles(dir, base = "") {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const rel = `${base}/${e.name}`;
    if (e.isDirectory()) out.push(...audioFiles(join(dir, e.name), rel));
    else if (/\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(e.name)) out.push(rel);
  }
  return out;
}
async function audioDurations() {
  const cacheFile = join(ROOT, "exports/animatics/.durations.json");
  let cache = {};
  try { cache = JSON.parse(readFileSync(cacheFile, "utf8")); } catch { /* first run */ }
  const files = audioFiles(join(ROOT, "public"));
  const out = {}, todo = [];
  for (const rel of files) {
    const st = statSync(join(ROOT, "public", rel));
    const key = `${st.size}:${Math.round(st.mtimeMs)}`;
    if (cache[rel]?.key === key) out[rel] = cache[rel].seconds;
    else todo.push({ rel, key });
  }
  const probe = ({ rel }) => new Promise((done) => {
    const p = spawn(FFMPEG, ["-nostdin", "-hide_banner", "-i", join(ROOT, "public", rel)]);
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("close", () => {
      const m = err.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
      done(m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null);
    });
  });
  for (let i = 0; i < todo.length; i += 8) {
    const batch = todo.slice(i, i + 8);
    const secs = await Promise.all(batch.map(probe));
    batch.forEach((f, k) => {
      if (secs[k] != null) {
        out[f.rel] = secs[k];
        cache[f.rel] = { key: f.key, seconds: secs[k] };
      }
    });
  }
  // only when something was measured (the parts of a --parts render all start at once and find everything measured)
  if (todo.length) {
    mkdirSync(dirname(cacheFile), { recursive: true });
    writeFileSync(cacheFile, JSON.stringify(cache));
  }
  return out;
}

/* ------------------------------ a dev server ------------------------------ */
const freePort = () => new Promise((done) => {
  const s = createServer();
  s.listen(0, () => {
    const { port } = s.address();
    s.close(() => done(port));
  });
});
async function startServer() {
  const port = await freePort();
  // vite's own script run by this Node (Windows refuses to spawn npx.cmd directly: "spawn EINVAL")
  const proc = spawn(process.execPath, [join(ROOT, "node_modules/vite/bin/vite.js"), "--port", String(port), "--strictPort"], { cwd: ROOT, stdio: "ignore" });
  const url = `http://localhost:${port}`;
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) {
        stopServer = () => proc.kill();
        return { url, stop: () => proc.kill() };
      }
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  proc.kill();
  fail("the dev server did not start");
}

/* ------------------------------ in the page ------------------------------ */
// Installed before the app: <audio> on the page clock with a log; the sound engine's ambience and synthesised sounds
// logged; CSS animations and videos set to the page clock before each frame.
function pageSetup(durations) {
  window.__animaticAutostart = true;
  // A render can take hours: the dev server's live reload must not restart the film when a file is edited meanwhile.
  // The page keeps its connection to Vite but never hears an update, a reload or a lost connection.
  const NativeSocket = window.WebSocket;
  window.WebSocket = class extends NativeSocket {
    constructor(url, protocols) {
      super(url, protocols);
      if (![].concat(protocols ?? []).includes("vite-hmr")) return;
      const add = this.addEventListener.bind(this);
      this.addEventListener = (type, fn, opts) => {
        if (type === "close") return undefined;
        if (type !== "message") return add(type, fn, opts);
        return add(type, (e) => {
          try {
            if (["update", "full-reload", "prune"].includes(JSON.parse(e.data).type)) return;
          } catch { /* not JSON: pass it on */ }
          fn(e);
        }, opts);
      };
    }
  };
  const DUR = durations;
  const now = () => performance.now();
  const path = (src) => {
    try { return decodeURIComponent(new URL(src, location.href).pathname); } catch { return String(src); }
  };
  const media = (window.__animaticMedia = []);
  const ids = new WeakMap();
  let nextId = 1;
  const idOf = (el) => {
    let i = ids.get(el);
    if (!i) ids.set(el, (i = nextId++));
    return i;
  };
  const P = HTMLMediaElement.prototype;
  const d = (n) => Object.getOwnPropertyDescriptor(P, n);
  const nPlay = P.play, nPause = P.pause, nLoad = P.load;
  const dCur = d("currentTime"), dVol = d("volume"), dLoop = d("loop"), dPaused = d("paused"), dEnded = d("ended"), dDur = d("duration"), dSrc = d("src"), dMuted = d("muted");
  const isAudio = (el) => el instanceof HTMLAudioElement;
  const V = new WeakMap();
  const st = (el) => {
    let s = V.get(el);
    if (!s) V.set(el, (s = { playing: false, t0: 0, pos0: 0, pos: 0, ended: false, timer: 0 }));
    return s;
  };
  const srcOf = (el) => path(dSrc.get.call(el) || el.currentSrc || "");
  const lengthOf = (el) => {
    const known = DUR[srcOf(el)];
    if (typeof known === "number") return known;
    const n = dDur.get.call(el);
    return Number.isFinite(n) ? n : NaN;
  };
  const pos = (el, s) => {
    if (!s.playing) return s.pos;
    let p = s.pos0 + (now() - s.t0) / 1000;
    const len = lengthOf(el);
    if (Number.isFinite(len) && len > 0) p = dLoop.get.call(el) ? p % len : Math.min(p, len);
    return p;
  };
  const fire = (el, ...names) => queueMicrotask(() => names.forEach((n) => el.dispatchEvent(new Event(n))));
  const arm = (el, s) => {
    clearTimeout(s.timer);
    if (!s.playing || dLoop.get.call(el)) return;
    const len = lengthOf(el);
    if (!Number.isFinite(len)) return;
    s.timer = setTimeout(() => {
      if (!s.playing) return;
      s.pos = len;
      s.playing = false;
      s.ended = true;
      media.push({ t: now(), id: idOf(el), ev: "ended" });
      fire(el, "pause", "ended");
    }, Math.max(0, len - pos(el, s)) * 1000);
  };
  const stop = (el, s) => {
    if (!s.playing) return;
    s.pos = pos(el, s);
    s.playing = false;
    clearTimeout(s.timer);
    media.push({ t: now(), id: idOf(el), ev: "pause" });
  };
  P.play = function () {
    if (!isAudio(this)) return nPlay.call(this);
    const s = st(this);
    if (s.playing) return Promise.resolve();
    if (s.ended) { s.pos = 0; s.ended = false; }
    s.playing = true;
    s.t0 = now();
    s.pos0 = s.pos;
    media.push({ t: s.t0, id: idOf(this), ev: "play", src: srcOf(this), pos: s.pos, vol: dVol.get.call(this), loop: dLoop.get.call(this), muted: dMuted.get.call(this) });
    arm(this, s);
    fire(this, "play", "playing");
    return Promise.resolve();
  };
  P.pause = function () {
    if (!isAudio(this)) return nPause.call(this);
    const s = st(this);
    if (!s.playing) return;
    stop(this, s);
    fire(this, "pause");
  };
  P.load = function () {
    if (isAudio(this)) {
      const s = st(this);
      stop(this, s);
      s.pos = 0;
      s.ended = false;
    }
    return nLoad.call(this);
  };
  const def = (name, get, set) => Object.defineProperty(P, name, { configurable: true, get, set });
  def("paused", function () { return isAudio(this) ? !st(this).playing : dPaused.get.call(this); });
  def("ended", function () { return isAudio(this) ? st(this).ended : dEnded.get.call(this); });
  def("duration", function () { return isAudio(this) ? lengthOf(this) : dDur.get.call(this); });
  def("currentTime", function () { return isAudio(this) ? pos(this, st(this)) : dCur.get.call(this); }, function (v) {
    if (!isAudio(this)) return dCur.set.call(this, v);
    const s = st(this), p = Math.max(0, Number(v) || 0);
    if (s.playing) { s.t0 = now(); s.pos0 = p; } else s.pos = p;
    s.ended = false;
    media.push({ t: now(), id: idOf(this), ev: "seek", pos: p });
    arm(this, s);
  });
  def("volume", function () { return dVol.get.call(this); }, function (v) {
    const before = dVol.get.call(this);
    dVol.set.call(this, v);
    const after = dVol.get.call(this);
    if (isAudio(this) && after !== before) media.push({ t: now(), id: idOf(this), ev: "vol", vol: after });
  });
  def("loop", function () { return dLoop.get.call(this); }, function (v) {
    dLoop.set.call(this, v);
    if (isAudio(this)) { media.push({ t: now(), id: idOf(this), ev: "loop", loop: !!v }); arm(this, st(this)); }
  });
  def("muted", function () { return dMuted.get.call(this); }, function (v) {
    dMuted.set.call(this, v);
    if (isAudio(this)) media.push({ t: now(), id: idOf(this), ev: "muted", muted: !!v });
  });
  def("src", function () { return dSrc.get.call(this); }, function (v) {
    if (isAudio(this)) {
      const s = st(this);
      stop(this, s);
      s.pos = 0;
      s.ended = false;
    }
    dSrc.set.call(this, v);
  });

  // The sound engine announces itself on window.__sw_audio (src/game/animatic.tsx); log its ambience and synthesised
  // one-shots, and keep the originals for rendering them offline afterwards.
  const engine = (window.__animaticEngine = []);
  const originals = (window.__animaticOriginals = {});
  let sw;
  Object.defineProperty(window, "__sw_audio", {
    configurable: true,
    get: () => sw,
    set(a) {
      sw = a;
      const wrap = (name, kind) => {
        if (typeof a[name] !== "function") return;
        const orig = (originals[name] = a[name].bind(a));
        a[name] = (...args) => {
          engine.push({ t: now(), kind, name, args: JSON.parse(JSON.stringify(args ?? [])), vol: { ...a.volumes } });
          return orig(...args);
        };
      };
      wrap("setAmbient", "ambient");
      // (not the UI's click: it answers a reader's press, which an animatic has none of)
      for (const n of ["transitionSfx", "stinger", "success", "fail", "heartbeat", "thunder", "pickup", "combine", "press", "steady", "unlockClunk"]) wrap(n, "synth");
      try { a.unlock(); } catch { /* no audio device: the log is all we need */ }
    },
  });

  // Before each frame: every CSS animation and transition, and every video, set to the page clock.
  const animStart = new WeakMap();
  const videoStart = new WeakMap();
  window.__animaticSync = () => {
    const t = now();
    for (const a of document.getAnimations()) {
      if (!animStart.has(a)) animStart.set(a, t);
      try {
        a.pause();
        a.currentTime = t - animStart.get(a);
      } catch { /* finished or detached */ }
    }
    const seeks = [];
    for (const v of document.querySelectorAll("video")) {
      if (!videoStart.has(v)) {
        if (dPaused.get.call(v) && !v.autoplay) continue;
        videoStart.set(v, t);
      }
      nPause.call(v);
      const len = dDur.get.call(v);
      const want = Math.min((t - videoStart.get(v)) / 1000, Number.isFinite(len) ? Math.max(0, len - 0.05) : Infinity);
      if (Math.abs(dCur.get.call(v) - want) > 0.02) {
        seeks.push(new Promise((done) => v.addEventListener("seeked", () => done(), { once: true })));
        dCur.set.call(v, want);
      }
    }
    return Promise.all(seeks).then(() => seeks.length);
  };
}

/* ------------------------------ run ------------------------------ */
const durations = await audioDurations();
say(`${Object.keys(durations).length} audio files measured`);
const est = estimator(durations);
const estimate = est.total;
say(`${whole ? "the whole film" : `${from} to ${to ?? "the end"}`}: about ${Math.round(estimate / 60)} min of film`);
const server = opt("url", null) ? { url: opt("url"), stop: () => {} } : await startServer();
// H.264 on the graphics card when it can (NVIDIA's NVENC), else on the processor; every part of a --parts render
// uses the same, so they join without re-encoding
const encoder = opt("encoder", null) ?? (gpu && nvencWorks(FFMPEG) ? "nvenc" : "x264");
if (!child) say(`encoding with ${encoder === "nvenc" ? "the graphics card (NVENC)" : "the processor (x264)"}`);

if (parts > 1 && !child) {
  const plan = planParts(est.ids, est.secondsOf, safeStarts(film, order), parts, to);
  say(`in ${plan.length} parts at once: ${plan.map((p) => `${p.from} to ${p.to ?? "the end"} (about ${Math.round(p.seconds / 60)} min)`).join(", ")}`);
  const forward = ["--size", `${W}x${H}`, "--fps", String(fps), "--pace", String(pace), "--url", server.url, "--encoder", encoder,
    ...(subs ? [] : ["--no-subs"]), ...(desc ? [] : ["--no-desc"]), ...(marks ? [] : ["--no-marks"]), ...(gpu ? ["--gpu"] : [])];
  let joined;
  try {
    joined = await runParts({
      plan, script: fileURLToPath(import.meta.url), forward, outDir, ffmpeg: FFMPEG, estimate, keep: has("keep-parts"), say,
      onProgress: (m) => (json ? console.log(JSON.stringify({ type: "progress", ...m })) : process.stdout.write(`\r${(m.seconds / 60).toFixed(1)} of about ${Math.round(estimate / 60)} min of film`.padEnd(60))),
    });
  } catch (e) {
    fail(String(e?.message ?? e));
  }
  if (!json) process.stdout.write("\n");
  const report = finish({ seconds: joined.seconds, chapters: joined.chapters, captions: joined.captions, picture: joined.picture, sound: joined.sound, fadeOut: !!to,
    extra: { frames: joined.frames, sound: joined.sound, renderer: joined.renderer, encoder, parts: joined.parts, renderMinutes: joined.renderMinutes, pageErrors: joined.pageErrors, warnings: joined.warnings } });
  server.stop();
  if (json) console.log(JSON.stringify({ type: "done", ...report }));
  else console.log(`${report.seconds.toFixed(1)} s in ${joined.parts.length} parts, ${report.captions} captions → ${join(outDir, "animatic.mp4")}`);
  process.exit(0);
}

// --gpu: the full Chromium (its new headless mode draws with the graphics card; the slim headless shell does not)
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
  ...(gpu && !process.env.PLAYWRIGHT_CHROMIUM_PATH ? { channel: "chromium" } : {}),
  args: [
    "--autoplay-policy=no-user-gesture-required",
    ...(gpu ? ["--ignore-gpu-blocklist", "--enable-gpu", "--enable-gpu-rasterization", "--enable-zero-copy"] : ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]),
  ],
});
const cleanup = async () => {
  await browser.close().catch(() => {});
  server.stop();
};
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 300)));
// in-flight requests the frame may still be waiting for (a picture, a depth map, a recorded loop), not streaming media
let pending = 0;
const watched = (r) => !["media", "websocket", "eventsource"].includes(r.resourceType()) && !r.url().includes("/@vite/") && !r.url().includes("hot-update");
page.on("request", (r) => { if (watched(r)) pending++; });
const settle = (r) => { if (watched(r)) pending = Math.max(0, pending - 1); };
page.on("requestfinished", settle);
page.on("requestfailed", settle);
await page.addInitScript(pageSetup, durations);
await page.clock.install();
const q = new URLSearchParams({ story: FILM_ID, scene: from, animatic: "1", subs: subs ? "1" : "0", desc: desc ? "1" : "0", marks: marks ? "1" : "0", pace: String(pace) });
if (to) q.set("to", to);
await page.goto(`${server.url}/?${q}`, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
const renderer = await page.evaluate(() => {
  const gl = document.createElement("canvas").getContext("webgl");
  const info = gl?.getExtension("WEBGL_debug_renderer_info");
  return gl ? String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) : "no WebGL";
});
say(`drawing with ${renderer}`);
// the film must play through once: a reload would start it again from the first scene
let reloads = 0;
page.on("load", () => reloads++);
// An installed clock still follows the wall clock; paused, the page's time moves only when the exporter moves it, one
// frame at a time, so a slow screenshot cannot let the film run on unseen.
// (the margin is generous and retried: on a busy machine the clock can pass a closer mark before the pause arrives)
for (let margin = 1000; ; margin *= 2) {
  try {
    await page.clock.pauseAt(await page.evaluate((m) => Date.now() + m, margin));
    break;
  } catch (e) {
    if (margin >= 16000 || !/past/i.test(String(e))) throw e;
  }
}

const realSleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Up to 15 s for a frame's pictures to arrive; after a frame that never settled, 2 s, until one does again.
let patience = 15000;
async function settled() {
  const until = Date.now() + patience;
  await page.evaluate(() => document.body.getBoundingClientRect());
  while (Date.now() < until) {
    const ready = await page.evaluate(() => [...document.querySelectorAll("canvas.depth-parallax")].every((c) => c.dataset.depthReady === "1"));
    if (pending === 0 && ready) {
      patience = 15000;
      return true;
    }
    await realSleep(40);
  }
  patience = 2000;
  return false;
}
// the game is up: its first scene is on window.__animatic
for (let i = 0; i < 400; i++) {
  if (await page.evaluate(() => !!window.__animatic?.sceneId)) break;
  await page.clock.runFor(50);
  await realSleep(25);
}

const outVideo = join(outDir, "picture.mp4");
const enc = spawn(FFMPEG, ["-nostdin", "-y", "-v", "error", "-f", "image2pipe", "-c:v", "mjpeg", "-framerate", String(fps), "-i", "-",
  ...(encoder === "nvenc" ? ["-c:v", "h264_nvenc", "-preset", "p5", "-rc", "vbr", "-cq", "19", "-b:v", "0"] : ["-c:v", "libx264", "-preset", "medium", "-crf", "18"]),
  "-pix_fmt", "yuv420p", "-r", String(fps), outVideo], { stdio: ["pipe", "ignore", "pipe"] });
let encErr = "";
enc.stderr.on("data", (d) => (encErr += d));
const write = (buf) => new Promise((done) => (enc.stdin.write(buf) ? done() : enc.stdin.once("drain", done)));

const t0 = await page.evaluate(() => performance.now());
const chapters = [];
let frame = 0, lastScene = null, slowFrames = 0;
const maxFrames = Math.round(maxSeconds * fps);
const started = Date.now();
while (frame < maxFrames) {
  // the film ends on the frame the scene after `to` begins (the screen is black between scenes), which is not drawn
  const st = await page.evaluate(() => ({ done: window.__animatic?.done, id: window.__animatic?.sceneId, title: window.__animatic?.sceneTitle }));
  if (reloads) fail(`the page reloaded ${(frame / fps).toFixed(0)} s into the film, so the film started again; nothing was saved. Run the export again`);
  if (st.done && frame > 0) break;
  if (!(await settled())) slowFrames++;
  await Promise.race([page.evaluate(() => window.__animaticSync()), realSleep(8000)]);
  await write(await page.screenshot({ type: "jpeg", quality: 92, timeout: 180000 }));
  // one chapter a scene: its continuation parts (nw_s65_b) stay in the scene's chapter
  const sceneOf = (id) => id.replace(/_[a-h]$/, "");
  if (st.id && sceneOf(st.id) !== lastScene) {
    lastScene = sceneOf(st.id);
    chapters.push({ t: frame / fps, id: st.id, title: String(st.title ?? st.id).replace(/ \(cont\.\)$/, "") });
  }
  frame++;
  if (frame % 12 === 0) {
    const msg = { type: "progress", frame, seconds: frame / fps, estimate, scene: st.id, title: st.title, elapsed: (Date.now() - started) / 1000 };
    if (json) console.log(JSON.stringify(msg));
    else process.stdout.write(`\r${(frame / fps).toFixed(1)} s of film, ${st.title ?? ""}`.padEnd(90));
  }
  await page.clock.runFor(Math.round((frame * 1000) / fps) - Math.round(((frame - 1) * 1000) / fps));
}
enc.stdin.end();
await new Promise((done) => enc.on("close", done));
if (!json) process.stdout.write("\n");
if (!existsSync(outVideo)) {
  await cleanup();
  fail(`the picture could not be encoded: ${encErr.slice(0, 400)}`);
}
const seconds = frame / fps;
const tEnd = t0 + seconds * 1000;
// the page's own time must have moved exactly with the frames
const drift = (await page.evaluate(() => performance.now())) - t0 - seconds * 1000;

/* ------------------------------ the sound ------------------------------ */
const logs = await page.evaluate(() => ({ media: window.__animaticMedia, engine: window.__animaticEngine, cues: window.__animatic?.cues ?? [], scenes: window.__animatic?.scenes ?? [], doneAt: window.__animatic?.doneAt ?? null }));
if (has("debug")) writeFileSync(join(outDir, "debug.json"), JSON.stringify({ t0, ...logs }, null, 1));
const segments = mediaSegments(logs.media, tEnd);
const layers = ambientLayers(logs.engine);
const synths = synthEvents(logs.engine);
// The engine renders its own synthesised sounds (in the page, offline): the ambience presets and each one-shot.
const renders = new Map();
const fromB64 = (b64) => {
  const buf = Buffer.from(b64, "base64");
  return new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
};
const pageRender = (kind, name, args, secs) => page.evaluate(async ([kind, name, args, secs]) => {
  const a = window.__sw_audio;
  const o = window.__animaticOriginals;
  const buf = kind === "ambient"
    ? await a.renderAmbient(name, secs)
    : await a.renderOffline(secs, () => o[name](...args));
  const l = buf.getChannelData(0), r = buf.numberOfChannels > 1 ? buf.getChannelData(1) : l;
  const out = new Float32Array(l.length * 2);
  for (let i = 0; i < l.length; i++) { out[i * 2] = l[i]; out[i * 2 + 1] = r[i]; }
  const bytes = new Uint8Array(out.buffer);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}, [kind, name, args, secs]);
for (const preset of new Set(layers.filter((l) => l.preset).map((l) => l.preset))) {
  try { renders.set(`ambient:${preset}`, fromB64(await pageRender("ambient", preset, [], 30))); }
  catch (e) { say(`could not render the "${preset}" ambience: ${String(e).slice(0, 120)}`); }
}
for (const e of synths) {
  if (renders.has(e.key)) continue;
  const secs = e.name === "transitionSfx" ? Math.min(2.4, Math.max(0.18, Number(e.args[1]) || 0.5)) + 1.2 : 3;
  try { renders.set(e.key, fromB64(await pageRender("synth", e.name, e.args, secs))); }
  catch (err) { say(`could not render ${e.name}: ${String(err).slice(0, 120)}`); }
}
const cues = logs.cues;
const scenesSeen = await page.evaluate(() => window.__animatic?.sceneId);
await cleanup();

const pathOf = (url) => {
  const p = join(ROOT, "public", decodeURIComponent(url.split(/[?#]/)[0]).replace(/^\/+/, ""));
  return p.startsWith(join(ROOT, "public")) && existsSync(p) ? p : null;
};
const decode = makeDecoder(FFMPEG, pathOf);
const wav = join(outDir, "sound.wav");
const warnings = [];
if (Math.abs(drift) > 1000 / fps + 1) warnings.push(`the page's clock and the film differ by ${(drift / 1000).toFixed(2)} s`);
const mixed = writeMix({
  wavPath: wav, t0, seconds, segments, layers, synths, decode,
  // a part of the film ends with the sound faded out over a second, not cut off
  fadeOutSeconds: !child && (to || frame >= maxFrames) ? 1 : 0,
  synth: (key) => renders.get(key) ?? null,
  ambient: (preset) => renders.get(`ambient:${preset}`) ?? null,
  onWarn: (w) => warnings.push(w),
});

/* ------------------------------ captions, chapters, the file ------------------------------ */
// the film stops where it left the chosen scenes: the next scene's first line, drawn as it began, is not part of it
const stopAt = Math.min(tEnd, logs.doneAt ?? Infinity);
const captions = [];
cues.forEach((c, i) => {
  if (!c.text || c.t >= stopAt) return;
  const a = (c.t - t0) / 1000, b = (Math.min(cues[i + 1]?.t ?? stopAt, stopAt) - t0) / 1000;
  // under a tenth of a second is not a caption: the game drawing the scene before it has moved to the scene's first line
  if (b <= 0 || a >= seconds || b - a < 0.1) return;
  const text = c.kind === "subtitle" ? `${c.speaker ? `${c.speaker.toUpperCase()}: ` : ""}${c.text}` : c.kind === "heading" ? `[${c.text}]` : `<i>${c.text}</i>`;
  captions.push({ a: Math.max(0, a), b: Math.min(seconds, b), text });
});
const sound = { recorded: segments.length, ambience: layers.length, synthesised: synths.length, peak: Number(mixed.peak.toFixed(3)), missing: mixed.missing };
const renderMinutes = Number(((Date.now() - started) / 60000).toFixed(1));
if (child) {
  // a part: its parent joins the pictures and the sound and writes the file
  writeFileSync(join(outDir, "captions.json"), JSON.stringify(captions));
  const report = { from, to, fps, frames: frame, seconds, chapters, captions: captions.length, sound, renderer, encoder, renderMinutes, slowFrames, pageErrors, warnings };
  writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ type: "done", ...report }));
  process.exit(0);
}
const report = finish({ seconds, chapters, captions, picture: outVideo, sound: wav, fadeOut: false,
  extra: { frames: frame, lastScene: scenesSeen, sound, renderer, encoder, renderMinutes, slowFrames, pageErrors, warnings } });
if (json) console.log(JSON.stringify({ type: "done", ...report }));
else console.log(`${seconds.toFixed(1)} s, ${frame} frames, ${captions.length} captions, ${chapters.length} scenes → ${join(outDir, "animatic.mp4")}${warnings.length ? `\nwarnings: ${warnings.join("; ")}` : ""}`);

/** Writes the captions, the chapters and animatic.mp4 (the picture and the sound put together; `fadeOut` fades the
 *  sound over the last second), removes the parts unless asked to keep them, and writes report.json. */
function finish({ seconds, chapters, captions, picture, sound, fadeOut, extra }) {
  writeFileSync(join(outDir, "captions.srt"), srtText(captions));
  const meta = [";FFMETADATA1", `title=Nobody's Witness — animatic (${whole ? "the whole film" : `${from}${to ? ` to ${to}` : " to the end"}`})`];
  chapters.forEach((c, i) => {
    const end = chapters[i + 1]?.t ?? seconds;
    meta.push("[CHAPTER]", "TIMEBASE=1/1000", `START=${Math.round(c.t * 1000)}`, `END=${Math.round(end * 1000)}`, `title=${String(c.title).replace(/[=;#\\\n]/g, " ")}`);
  });
  const chaptersFile = join(outDir, "chapters.txt");
  writeFileSync(chaptersFile, `${meta.join("\n")}\n`);
  const mp4 = join(outDir, "animatic.mp4");
  const mux = spawnSync(FFMPEG, ["-nostdin", "-y", "-v", "error", "-i", picture, "-i", sound, "-f", "ffmetadata", "-i", chaptersFile,
    "-map", "0:v", "-map", "1:a", "-map_metadata", "2", "-map_chapters", "2", "-c:v", "copy",
    ...(fadeOut ? ["-af", `afade=t=out:st=${Math.max(0, seconds - 1).toFixed(3)}:d=1`] : []),
    "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", mp4]);
  if (mux.status !== 0) fail(`the sound could not be muxed: ${String(mux.stderr).slice(0, 400)}`);
  // the picture and the sound on their own are as large as the film again (the whole film: gigabytes)
  if (!has("keep-parts") && !has("debug")) for (const f of [picture, sound, chaptersFile]) rmSync(f, { force: true });
  const report = {
    from, to, whole, fps, size: `${W}x${H}`, subtitles: subs, descriptions: desc, marks, pace,
    seconds, estimate, chapters, captions: captions.length, ...extra, files: ["animatic.mp4", "captions.srt"],
  };
  writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 2));
  return report;
}
