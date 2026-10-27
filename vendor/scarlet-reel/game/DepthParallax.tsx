import { useEffect, useRef, useState } from "react";
import type { CinematicSettings, DepthCutout } from "../types";
import { assetBackground, assetUrl } from "../assetPath";

/* ------------------------------------------------------------------ */
/*  depth-map camera (2.5D camera move on a still picture)             */
/* ------------------------------------------------------------------ */

/* How far each move goes at `depthAmount` 1. Push: the farthest plane ends
 * this much larger (PUSH_FAR) and the nearest this much (PUSH_NEAR); the
 * default amount 0.4 ends at about 1.05x far and 1.14x near, a slow dolly in.
 * Truck/drift: a plane one unit of depth from the still plane slides this
 * fraction of the frame width. */
const PUSH_FAR = 0.12;
const PUSH_NEAR = 0.36;
const TRUCK = 0.08;
const MAX_CUTOUTS = 4;

const VERTEX = `
attribute vec2 aPos;
varying vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

/* A point of the picture at depth d (0 far, 1 near) lands at
 *   centre + (p - centre) * zoom(d) + shift * (d - focus)
 * so near things grow and slide more than far ones. The background plate
 * (the picture with its cut-outs painted out) is drawn through its smoothed
 * depth map, the loop inverting that mapping per pixel; each cut-out is one
 * solid layer at a single depth, so a person never stretches, and the plate
 * shows behind them as they move. Cut-outs are premultiplied and sorted far
 * to near on the CPU. Plate and cut-outs are pre-scaled to the canvas, so the
 * picture is only ever enlarged, never shrunk without filtering. */
const FRAGMENT = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uPlate;
uniform sampler2D uDepth;
uniform sampler2D uCut0;
uniform sampler2D uCut1;
uniform sampler2D uCut2;
uniform sampler2D uCut3;
uniform vec4 uCutDepth;
uniform int uCuts;
uniform vec2 uCenter;
uniform vec2 uZoom;
uniform vec2 uShift;
uniform float uFocus;
uniform vec2 uDepthScale;
varying vec2 vUv;
vec2 source(vec2 uv, float d) { return uCenter + (uv - uShift * (d - uFocus) - uCenter) / mix(uZoom.x, uZoom.y, d); }
float depthAt(vec2 p) { return texture2D(uDepth, clamp((p - 0.5) * uDepthScale + 0.5, 0.0, 1.0)).r; }
vec4 cutout(sampler2D tex, float d, vec2 uv) {
  vec2 p = source(uv, d);
  vec2 inside = step(vec2(0.0), p) * step(p, vec2(1.0));
  return texture2D(tex, clamp(p, 0.0, 1.0)) * inside.x * inside.y;
}
void main() {
  vec2 p = vUv;
  for (int i = 0; i < 5; i++) { p = source(vUv, depthAt(p)); }
  vec4 col = texture2D(uPlate, clamp(p, 0.0, 1.0));
  vec4 c;
  if (uCuts > 0) { c = cutout(uCut0, uCutDepth.x, vUv); col = c + col * (1.0 - c.a); }
  if (uCuts > 1) { c = cutout(uCut1, uCutDepth.y, vUv); col = c + col * (1.0 - c.a); }
  if (uCuts > 2) { c = cutout(uCut2, uCutDepth.z, vUv); col = c + col * (1.0 - c.a); }
  if (uCuts > 3) { c = cutout(uCut3, uCutDepth.w, vUv); col = c + col * (1.0 - c.a); }
  gl_FragColor = vec4(col.rgb, 1.0);
}`;

const unresolved = (v?: string) => !!v && v.startsWith("asset:");

/** True when this cinematic asks for a depth-map camera on a still picture. */
export function hasDepthParallax(c: CinematicSettings | undefined, picture: string | undefined): boolean {
  if (!c?.depthMap || !picture) return false;
  // The dolly mode oversizes the plate's picture to travel across it; the redraw would not line up with it.
  if (c.mode === "dolly") return false;
  if (/^(gradient:|video:|asset:)/.test(picture)) return false;
  return !unresolved(c.depthMap) && !unresolved(c.depthPlate) && !(c.depthCutouts ?? []).some((k) => unresolved(k.image));
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${src}`));
    img.src = src;
  });
}

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, source);
  gl.compileShader(sh);
  return gl.getShaderParameter(sh, gl.COMPILE_STATUS) ? sh : null;
}

/** Uploads `src` to texture unit `unit`, clamped and linearly filtered. */
function upload(gl: WebGLRenderingContext, unit: number, src: TexImageSource, premultiply: boolean) {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premultiply);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}

/** The picture cropped to the canvas (object-fit: cover, centred, like the plate's CSS background) and scaled to its pixel
 * size by the browser's own high-quality resampling. Sampling a texture larger than the canvas without mipmaps shimmers on
 * fine detail (roller shutters), and WebGL 1 cannot mipmap pictures that are not a power of two. */
function fitted(img: HTMLImageElement, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / scale, sh = h / scale;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, 0, 0, w, h);
  return c;
}

const easeInOut = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, Math.min(1, x)));
/** A push or truck is already moving at the cut and settles into its hold (ease-out), so the move reads in the first
 *  seconds of a shot instead of creeping in for half its length; a 0.6 s lead-in keeps the first frames from lurching. */
const settle = (t: number, seconds: number) => {
  const x = Math.max(0, Math.min(1, t / seconds));
  const lead = Math.min(1, t / 0.6);
  return (1 - (1 - x) ** 3) * lead * lead * (3 - 2 * lead);
};

/** "x% y%" (the cinematic's focal point) as canvas uv, y up. */
function centre(focalPoint?: string): [number, number] {
  const [x, y] = (focalPoint ?? "50% 50%").split(/\s+/).map((v) => parseFloat(v));
  const clamp = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(100, v)) / 100 : 0.5);
  return [clamp(x), 1 - clamp(y)];
}

/** A WebGL canvas that turns a still picture into a slow camera move with depth. The picture is paired with a grayscale
 * `depthMap` (white = near, black = far); for clean edges, also a `depthPlate` (the picture with its people painted out) and
 * `depthCutouts` (each person as a transparent PNG with the depth of the ground at their feet), made by
 * tools/make-depth-layers.py. It sits INSIDE the plate's cinematic layer, so the grade, film stock, dimming, glows and flares
 * stay on top. The plate's own CSS picture stays underneath: until every image has loaded, without WebGL, and for players who
 * ask for reduced motion, the still picture is what shows. */
export function DepthParallaxLayer({ cinematic, picture, reducedMotion }: {
  cinematic?: CinematicSettings;
  picture: string;
  reducedMotion?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [ready, setReady] = useState(false);
  const on = hasDepthParallax(cinematic, picture) && !reducedMotion;
  const depthMap = cinematic?.depthMap;
  const plate = cinematic?.depthPlate;
  const cutouts: DepthCutout[] = (cinematic?.depthCutouts ?? []).filter((k) => k.image).slice(0, MAX_CUTOUTS);
  const cutKey = cutouts.map((k) => `${k.image}@${k.depth}`).join(",");
  const amount = Math.max(0, Math.min(1, cinematic?.depthAmount ?? 0.4));
  const motion = cinematic?.depthMotion ?? "truck";
  const seconds = Math.max(2, cinematic?.depthSeconds ?? 14);
  const direction = cinematic?.depthDirection === "left" ? -1 : 1;
  // Truck and drift turn around the still plane: by default the cut-outs' depth, so the people hold and the world moves past.
  const focus = Math.max(0, Math.min(1, cinematic?.depthFocus ?? (cutouts.length ? cutouts.reduce((s, k) => s + k.depth, 0) / cutouts.length : 0.5)));
  const focal = cinematic?.focalPoint;

  useEffect(() => {
    setReady(false);
    if (!on || !depthMap) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { alpha: false, antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: false });
    if (!gl) return;
    let alive = true;
    let raf = 0;
    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
    const prog = gl.createProgram();
    if (!vs || !fs || !prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    const u = (name: string) => gl.getUniformLocation(prog, name);
    const uZoom = u("uZoom"), uShift = u("uShift"), uDepthScale = u("uDepthScale");
    gl.uniform1i(u("uPlate"), 0);
    gl.uniform1i(u("uDepth"), 1);
    ["uCut0", "uCut1", "uCut2", "uCut3"].forEach((name, i) => gl.uniform1i(u(name), 2 + i));
    gl.uniform1f(u("uFocus"), focus);
    // A push closes in on the focal point; truck and drift turn about the middle, which their edge zoom is worked out for.
    gl.uniform2f(u("uCenter"), ...(motion === "push" ? centre(focal) : ([0.5, 0.5] as [number, number])));
    const layers = [...cutouts].sort((a, b) => a.depth - b.depth);
    gl.uniform1i(u("uCuts"), layers.length);
    const depths = [0, 1, 2, 3].map((i) => Math.max(0, Math.min(1, layers[i]?.depth ?? 0)));
    gl.uniform4f(u("uCutDepth"), depths[0], depths[1], depths[2], depths[3]);

    // The largest slide any plane makes, and the zoom that keeps the frame's edges out of view for it.
    const reach = Math.max(focus, 1 - focus);
    const overscanFor = (slide: number) => 1 / Math.max(0.5, 1 - 2 * reach * Math.abs(slide));

    let images: { plate: HTMLImageElement; depth: HTMLImageElement; cuts: HTMLImageElement[] } | null = null;
    let size = "";
    const prepare = () => {
      if (!images) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (`${w}x${h}` === size) return;
      size = `${w}x${h}`;
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      upload(gl, 0, fitted(images.plate, w, h), false);
      upload(gl, 1, images.depth, false);
      images.cuts.forEach((img, i) => upload(gl, 2 + i, fitted(img, w, h), true));
      // The depth map is the whole picture; the canvas shows its cover crop.
      const ca = w / h, ia = images.plate.naturalWidth / Math.max(1, images.plate.naturalHeight);
      gl.uniform2f(uDepthScale, ca > ia ? 1 : ca / ia, ca > ia ? ia / ca : 1);
    };

    // The move starts on the first frame drawn, not when loading began: a picture that loads slowly must not open mid-move.
    let start = -1;
    let done = false;
    const frame = (now: number) => {
      if (start < 0) start = now;
      const t = (now - start) / 1000;
      let zoomFar = 1, zoomNear = 1, slide = 0;
      if (motion === "push") {
        const p = settle(t, seconds);
        zoomFar = 1 + amount * PUSH_FAR * p;
        zoomNear = 1 + amount * PUSH_NEAR * p;
        done = t >= seconds;
      } else if (motion === "truck") {
        slide = amount * TRUCK * settle(t, seconds) * direction;
        zoomFar = zoomNear = overscanFor(slide);
        done = t >= seconds;
      } else {
        // drift: a slow loop side to side, its size and the zoom that hides the edges easing in over the first two seconds
        const grow = easeInOut(t / 2);
        slide = amount * TRUCK * 0.5 * grow * Math.sin((2 * Math.PI * t) / seconds) * direction;
        zoomFar = zoomNear = overscanFor(amount * TRUCK * 0.5 * grow);
      }
      gl.uniform2f(uZoom, zoomFar, zoomNear);
      gl.uniform2f(uShift, slide, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    // A push or truck ends and holds: the loop stops there and only a resize draws again.
    const loop = (now: number) => {
      if (!alive) return;
      frame(now);
      if (!done) raf = requestAnimationFrame(loop);
    };
    const ro = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => { prepare(); if (done && alive) frame(performance.now()); })
      : null;
    ro?.observe(canvas);
    const onLost = (e: Event) => { e.preventDefault(); alive = false; cancelAnimationFrame(raf); setReady(false); };
    canvas.addEventListener("webglcontextlost", onLost);

    Promise.all([
      loadImage(assetBackground(plate || picture)),
      loadImage(assetUrl(depthMap)),
      ...layers.map((k) => loadImage(assetUrl(k.image))),
    ])
      .then(([plateImg, depthImg, ...cutImgs]) => {
        if (!alive) return;
        images = { plate: plateImg, depth: depthImg, cuts: cutImgs };
        prepare();
        raf = requestAnimationFrame((now) => { loop(now); setReady(true); });
      })
      .catch(() => { /* the still picture underneath stays */ });

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      canvas.removeEventListener("webglcontextlost", onLost);
      // Free the context once the canvas has left the page: a long film crossfades through many pictures. Not
      // while it is still mounted (React's development double-run of effects): a freed context cannot be reused.
      window.setTimeout(() => {
        if (!canvas.isConnected) gl.getExtension("WEBGL_lose_context")?.loseContext();
      }, 0);
    };
    // cutKey stands for the cut-out list (a new array on every render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, picture, depthMap, plate, cutKey, amount, focus, motion, seconds, direction, focal]);

  if (!on) return null;
  return (
    <canvas
      // A fresh canvas per setting: the old one is removed from the page and its context freed.
      key={`${picture}|${depthMap}|${plate}|${cutKey}|${amount}|${focus}|${motion}|${seconds}|${direction}|${focal}`}
      ref={canvasRef}
      className="depth-parallax"
      data-depth-ready={ready ? "1" : "0"}
      data-depth-for={picture.replace(/^.*\//, "")}
      aria-hidden
      style={{ opacity: ready ? 1 : 0 }}
    />
  );
}
