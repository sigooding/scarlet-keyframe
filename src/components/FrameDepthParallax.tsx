import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { assetBackground, assetUrl } from "../../vendor/scarlet-reel/assetPath";
import { hasDepthParallax } from "../../vendor/scarlet-reel/game/DepthParallax";
import type { CinematicSettings, DepthCutout } from "../../vendor/scarlet-reel/types";

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

const PUSH_FAR = 0.12;
const PUSH_NEAR = 0.36;
const TRUCK = 0.08;
const MAX_CUTOUTS = 4;

const VERTEX = `
attribute vec2 aPos;
varying vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

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

const decodedImageCache = new Map<string, HTMLImageElement>();
const inflightImageLoads = new Map<string, Promise<HTMLImageElement>>();

function getCachedImage(src: string): HTMLImageElement | undefined {
  const existing = decodedImageCache.get(src);
  if (existing && existing.complete && existing.naturalWidth > 0) return existing;
  return undefined;
}

function loadCachedImage(src: string): Promise<HTMLImageElement> {
  const cached = getCachedImage(src);
  if (cached) return Promise.resolve(cached);
  const inflight = inflightImageLoads.get(src);
  if (inflight) return inflight;
  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => {
      decodedImageCache.set(src, img);
      inflightImageLoads.delete(src);
      resolve(img);
    };
    img.onerror = () => {
      inflightImageLoads.delete(src);
      reject(new Error(`could not load ${src}`));
    };
    img.src = src;
  });
  inflightImageLoads.set(src, promise);
  return promise;
}

export function preloadDepthParallaxAssets(
  cinematic: CinematicSettings | undefined,
  picture: string | undefined,
): void {
  if (typeof window === "undefined" || typeof Image === "undefined") return;
  if (!picture) return;
  const picUrl = assetBackground(picture);
  if (picUrl && !/^(gradient:|video:|asset:)/.test(picture)) {
    void loadCachedImage(picUrl).catch(() => {});
  }
  if (!hasDepthParallax(cinematic, picture) || !cinematic?.depthMap) return;
  const plateSrc = assetBackground(cinematic.depthPlate || picture);
  const depthSrc = assetUrl(cinematic.depthMap);
  const cutSrcs = (cinematic.depthCutouts ?? [])
    .filter((k) => k.image)
    .slice(0, MAX_CUTOUTS)
    .map((k) => assetUrl(k.image));
  void loadCachedImage(plateSrc).catch(() => {});
  void loadCachedImage(depthSrc).catch(() => {});
  for (const s of cutSrcs) {
    void loadCachedImage(s).catch(() => {});
  }
}

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, source);
  gl.compileShader(sh);
  return gl.getShaderParameter(sh, gl.COMPILE_STATUS) ? sh : null;
}

function upload(gl: WebGLRenderingContext, unit: number, src: TexImageSource, premultiply: boolean) {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premultiply);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  gl.texParameteri(gl.TEXTURE_2D, gl.LINEAR === gl.LINEAR ? gl.TEXTURE_MIN_FILTER : gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}

function fitted(img: HTMLImageElement, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  const scale = Math.max(w / Math.max(1, img.naturalWidth), h / Math.max(1, img.naturalHeight));
  const sw = w / scale;
  const sh = h / scale;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, 0, 0, w, h);
  return c;
}

const easeInOut = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, Math.min(1, x)));
const settle = (t: number, seconds: number) => {
  const x = Math.max(0, Math.min(1, t / seconds));
  const lead = Math.min(1, t / 0.6);
  return (1 - (1 - x) ** 3) * lead * lead * (3 - 2 * lead);
};

function centre(focalPoint?: string): [number, number] {
  const [x, y] = (focalPoint ?? "50% 50%").split(/\s+/).map((v) => parseFloat(v));
  const clamp = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(100, v)) / 100 : 0.5);
  return [clamp(x), 1 - clamp(y)];
}

/**
 * Deterministic 24 fps 2.5D depth-map camera driven directly by `tSec = localFrame / 24`
 * (never wall-clock `performance.now()`), with cached decoded images so transitions and
 * scrubs draw synchronously on frame 0 without flashing or resetting camera progress.
 */
export function FrameDepthParallaxLayer({
  cinematic,
  picture,
  tSec,
}: {
  cinematic?: CinematicSettings;
  picture: string;
  tSec: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawAtTimeRef = useRef<((timeSec: number) => void) | null>(null);
  const latestTimeRef = useRef(tSec);
  latestTimeRef.current = tSec;

  const on = hasDepthParallax(cinematic, picture);
  const depthMap = cinematic?.depthMap;
  const plate = cinematic?.depthPlate;
  const cutouts: DepthCutout[] = (cinematic?.depthCutouts ?? [])
    .filter((k) => k.image)
    .slice(0, MAX_CUTOUTS);
  const cutKey = cutouts.map((k) => `${k.image}@${k.depth}`).join(",");
  const amount = Math.max(0, Math.min(1, cinematic?.depthAmount ?? 0.4));
  const amountRef = useRef(amount);
  amountRef.current = amount;
  const motion = cinematic?.depthMotion ?? "truck";
  const seconds = Math.max(2, cinematic?.depthSeconds ?? 14);
  const direction = cinematic?.depthDirection === "left" ? -1 : 1;
  const focus = Math.max(
    0,
    Math.min(
      1,
      cinematic?.depthFocus ??
        (cutouts.length ? cutouts.reduce((s, k) => s + k.depth, 0) / cutouts.length : 0.5),
    ),
  );
  const focal = cinematic?.focalPoint;

  const isSynchronouslyCached = (() => {
    if (!on || !depthMap || typeof window === "undefined") return false;
    const plateSrc = assetBackground(plate || picture);
    const depthSrc = assetUrl(depthMap);
    const cutSrcs = cutouts.map((k) => assetUrl(k.image));
    return Boolean(
      getCachedImage(plateSrc) &&
        getCachedImage(depthSrc) &&
        cutSrcs.every((s) => Boolean(getCachedImage(s))),
    );
  })();

  const [ready, setReady] = useState(isSynchronouslyCached);

  useIsomorphicLayoutEffect(() => {
    drawAtTimeRef.current = null;
    if (!on || !depthMap) {
      setReady(false);
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) return;

    let alive = true;
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
    const uZoom = u("uZoom");
    const uShift = u("uShift");
    const uDepthScale = u("uDepthScale");
    gl.uniform1i(u("uPlate"), 0);
    gl.uniform1i(u("uDepth"), 1);
    ["uCut0", "uCut1", "uCut2", "uCut3"].forEach((name, i) => gl.uniform1i(u(name), 2 + i));
    gl.uniform1f(u("uFocus"), focus);
    gl.uniform2f(
      u("uCenter"),
      ...(motion === "push" ? centre(focal) : ([0.5, 0.5] as [number, number])),
    );

    const layers = [...cutouts].sort((a, b) => a.depth - b.depth);
    gl.uniform1i(u("uCuts"), layers.length);
    const depths = [0, 1, 2, 3].map((i) => Math.max(0, Math.min(1, layers[i]?.depth ?? 0)));
    gl.uniform4f(u("uCutDepth"), depths[0], depths[1], depths[2], depths[3]);

    const reach = Math.max(focus, 1 - focus);
    const overscanFor = (slide: number) => 1 / Math.max(0.5, 1 - 2 * reach * Math.abs(slide));

    let images: { plate: HTMLImageElement; depth: HTMLImageElement; cuts: HTMLImageElement[] } | null = null;
    let size = "";

    const prepare = () => {
      if (!images) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round((canvas.clientWidth || 960) * dpr));
      const h = Math.max(1, Math.round((canvas.clientHeight || 540) * dpr));
      if (`${w}x${h}` === size) return;
      size = `${w}x${h}`;
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      upload(gl, 0, fitted(images.plate, w, h), false);
      upload(gl, 1, images.depth, false);
      images.cuts.forEach((img, i) => upload(gl, 2 + i, fitted(img, w, h), true));
      const ca = w / h;
      const ia = images.plate.naturalWidth / Math.max(1, images.plate.naturalHeight);
      gl.uniform2f(uDepthScale, ca > ia ? 1 : ca / ia, ca > ia ? ia / ca : 1);
    };

    const drawFrameAt = (timeSec: number) => {
      if (!alive || !images) return;
      prepare();
      const curAmount = amountRef.current;
      const t = Math.max(0, timeSec);
      let zoomFar = 1;
      let zoomNear = 1;
      let slide = 0;
      if (motion === "push") {
        const p = settle(t, seconds);
        zoomFar = 1 + curAmount * PUSH_FAR * p;
        zoomNear = 1 + curAmount * PUSH_NEAR * p;
      } else if (motion === "truck") {
        slide = curAmount * TRUCK * settle(t, seconds) * direction;
        zoomFar = zoomNear = overscanFor(slide);
      } else {
        const grow = easeInOut(t / 2);
        slide = curAmount * TRUCK * 0.5 * grow * Math.sin((2 * Math.PI * t) / seconds) * direction;
        zoomFar = zoomNear = overscanFor(curAmount * TRUCK * 0.5 * grow);
      }
      gl.uniform2f(uZoom, zoomFar, zoomNear);
      gl.uniform2f(uShift, slide, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    const plateSrc = assetBackground(plate || picture);
    const depthSrc = assetUrl(depthMap);
    const cutSrcs = layers.map((k) => assetUrl(k.image));

    const cachedPlate = getCachedImage(plateSrc);
    const cachedDepth = getCachedImage(depthSrc);
    const cachedCuts = cutSrcs.map((s) => getCachedImage(s));

    if (cachedPlate && cachedDepth && cachedCuts.every(Boolean)) {
      images = {
        plate: cachedPlate,
        depth: cachedDepth,
        cuts: cachedCuts as HTMLImageElement[],
      };
      drawAtTimeRef.current = drawFrameAt;
      drawFrameAt(latestTimeRef.current);
      setReady(true);
    } else {
      setReady(false);
      Promise.all([
        loadCachedImage(plateSrc),
        loadCachedImage(depthSrc),
        ...cutSrcs.map((s) => loadCachedImage(s)),
      ])
        .then(([plateImg, depthImg, ...cutImgs]) => {
          if (!alive) return;
          images = { plate: plateImg, depth: depthImg, cuts: cutImgs };
          drawAtTimeRef.current = drawFrameAt;
          drawFrameAt(latestTimeRef.current);
          setReady(true);
        })
        .catch(() => {
          /* fallback still plate remains visible underneath */
        });
    }

    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            size = "";
            if (alive && drawAtTimeRef.current) {
              drawAtTimeRef.current(latestTimeRef.current);
            }
          })
        : null;
    ro?.observe(canvas);

    const onLost = (e: Event) => {
      e.preventDefault();
      alive = false;
      drawAtTimeRef.current = null;
      setReady(false);
    };
    canvas.addEventListener("webglcontextlost", onLost);

    return () => {
      alive = false;
      drawAtTimeRef.current = null;
      ro?.disconnect();
      canvas.removeEventListener("webglcontextlost", onLost);
      window.setTimeout(() => {
        if (!canvas.isConnected) {
          gl.getExtension("WEBGL_lose_context")?.loseContext();
        }
      }, 0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, picture, depthMap, plate, cutKey, focus, motion, seconds, direction, focal]);

  useIsomorphicLayoutEffect(() => {
    if (drawAtTimeRef.current) {
      drawAtTimeRef.current(tSec);
    }
  }, [tSec, amount]);

  if (!on) return null;
  return (
    <canvas
      key={`${picture}|${depthMap}|${plate}|${cutKey}|${focus}|${motion}|${seconds}|${direction}|${focal}`}
      ref={canvasRef}
      className="depth-parallax"
      data-depth-ready={ready ? "1" : "0"}
      data-depth-for={picture.replace(/^.*\//, "")}
      aria-hidden
      style={{ opacity: ready ? 1 : 0, transition: "none", animation: "none" }}
    />
  );
}
