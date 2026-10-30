import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { assetBackground, assetUrl } from "../../vendor/scarlet-reel/assetPath";
import { hasDepthParallax } from "../../vendor/scarlet-reel/game/DepthParallax";
import type { CinematicSettings, DepthCutout } from "../../vendor/scarlet-reel/types";

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export const PUSH_FAR = 0.12;
export const PUSH_NEAR = 0.36;
export const PUSH_NEAR_FAR_RATIO = PUSH_NEAR / PUSH_FAR;
const MAX_CUTOUTS = 4;

export interface DepthCameraUniforms {
  uZoom: [number, number];
  uShift: [number, number];
  uFocus: number;
  uCenter: [number, number];
  amount: number;
}

export type VertigoContraZoomMode = "recede" | "loom";

export interface DepthCameraInput {
  zoom: number;
  x: number;
  y: number;
  amount?: number;
  authoredAmount?: number;
  focus?: number;
  center?: [number, number];
  vertigoContraZoom?: VertigoContraZoomMode;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function roundAttr(v: number): number {
  if (!Number.isFinite(v) || Math.abs(v) < 1e-9) return 0;
  const r = Math.round(v * 100000) / 100000;
  return Object.is(r, -0) ? 0 : r;
}

export function centreFromFocalPoint(focalPoint?: string): [number, number] {
  const [x, y] = (focalPoint ?? "50% 50%").split(/\s+/).map((v) => parseFloat(v));
  const c = (v: number) => (Number.isFinite(v) ? clamp(v, 0, 100) / 100 : 0.5);
  return [c(x), 1 - c(y)];
}

/**
 * Pure keyframe-pose-to-shader mapping for 2.5D depth shots:
 * - `x`/`y` become the parallax shift `uShift` (with `vUv` bottom-up -> `uShift.y = -y/100`)
 * - `zoom` becomes the push: far layers take `zoom`, near layers zoom more in `PUSH_NEAR / PUSH_FAR` ratio
 * - `overscan` guarantees `source(uv, d) ∈ [0, 1]²` for all `uv ∈ [0, 1]²` and `d ∈ [0, 1]` (zero edge exposure)
 */
export function computeDepthCameraUniforms(input: DepthCameraInput): DepthCameraUniforms {
  const curAmount = clamp(
    typeof input.amount === "number" && Number.isFinite(input.amount) ? input.amount : 0.4,
    0,
    1,
  );
  const baseAmount =
    typeof input.authoredAmount === "number" &&
    Number.isFinite(input.authoredAmount) &&
    input.authoredAmount > 1e-4
      ? clamp(input.authoredAmount, 0.05, 1)
      : 0.4;
  const depthScale = curAmount / baseAmount;

  const focusVal = clamp(
    typeof input.focus === "number" && Number.isFinite(input.focus) ? input.focus : 0.5,
    0,
    1,
  );
  const center: [number, number] = input.center
    ? [clamp(input.center[0], 0.1, 0.9), clamp(input.center[1], 0.1, 0.9)]
    : [0.5, 0.5];

  const reach = Math.max(focusVal, 1 - focusVal);
  const rawX = Number.isFinite(input.x) ? input.x : 0;
  const rawY = Number.isFinite(input.y) ? input.y : 0;
  const shiftX = (rawX / 100) * depthScale;
  const shiftY = -(rawY / 100) * depthScale;

  const pushFar = Math.max(1, Number.isFinite(input.zoom) ? input.zoom : 1);
  const nearRatio = 1 + (PUSH_NEAR_FAR_RATIO - 1) * depthScale;
  let farScale = pushFar;
  let nearScale = 1 + (pushFar - 1) * nearRatio;

  if (input.vertigoContraZoom === "recede" || input.vertigoContraZoom === "loom") {
    // True Hitchcock Vertigo contra-zoom (dolly-zoom):
    // Subject in foreground (d=1, nearScale) stays locked in frame size while
    // background (d=0, farScale) stretches away ("recede") or looms inward ("loom").
    const zProgress = clamp((pushFar - 1) / 0.32, 0, 1);
    const strength = clamp(curAmount / 0.4, 0.25, 1.45);
    if (input.vertigoContraZoom === "recede") {
      nearScale = 1.22 + 0.04 * zProgress;
      farScale = Math.max(1.02, 1.54 - 0.50 * zProgress * strength);
    } else {
      nearScale = 1.24 - 0.03 * zProgress;
      farScale = 1.02 + 0.50 * zProgress * strength;
    }
  }

  const minMarginX = Math.max(0.1, Math.min(center[0], 1 - center[0]));
  const minMarginY = Math.max(0.1, Math.min(center[1], 1 - center[1]));
  const normShift = Math.max(
    (reach * Math.abs(shiftX)) / minMarginX,
    (reach * Math.abs(shiftY)) / minMarginY,
  );
  const overscan = Math.max(
    1 / Math.max(0.5, 1 - normShift),
    1 + normShift,
  );

  return {
    uZoom: [farScale * overscan, nearScale * overscan],
    uShift: [shiftX, shiftY],
    uFocus: focusVal,
    uCenter: center,
    amount: curAmount,
  };
}

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

function upload(
  gl: WebGLRenderingContext,
  unit: number,
  tex: WebGLTexture,
  src: TexImageSource,
  premultiply: boolean,
) {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premultiply);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}

function uploadSolid(gl: WebGLRenderingContext, unit: number, tex: WebGLTexture, byteVal = 0) {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    1,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    new Uint8Array([byteVal, byteVal, byteVal, 255]),
  );
}

function uploadFocalDepthField(
  gl: WebGLRenderingContext,
  unit: number,
  tex: WebGLTexture,
  cx: number,
  cy: number,
) {
  const size = 96;
  const data = new Uint8Array(size * size * 4);
  let idx = 0;
  for (let row = 0; row < size; row += 1) {
    const v = (row + 0.5) / size;
    const dy = (v - cy) / 0.30;
    for (let col = 0; col < size; col += 1) {
      const u = (col + 0.5) / size;
      const dx = (u - cx) / 0.25;
      const d = Math.exp(-0.5 * (dx * dx + dy * dy));
      const byteVal = Math.max(0, Math.min(255, Math.round(d * 255)));
      data[idx] = byteVal;
      data[idx + 1] = byteVal;
      data[idx + 2] = byteVal;
      data[idx + 3] = 255;
      idx += 4;
    }
  }
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
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

/**
 * Deterministic 24 fps 2.5D depth-map camera driven solely by the shot's keyframe pose
 * (`zoom`, `x`, `y`, and per-frame `depthAmount`), with progressive picture upload so
 * there is zero jump while depth images finish loading.
 */
export function FrameDepthParallaxLayer({
  cinematic,
  picture,
  zoom = 1,
  x = 0,
  y = 0,
  depthAmount,
  authoredDepthAmount,
  gradeClassName,
}: {
  cinematic?: CinematicSettings;
  picture: string;
  zoom?: number;
  x?: number;
  y?: number;
  depthAmount?: number;
  authoredDepthAmount?: number;
  gradeClassName?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawFrameRef = useRef<(() => void) | null>(null);

  const rawVertigo = (cinematic as Record<string, unknown> | undefined)?.vertigoContraZoom;
  const vertigoContraZoom: VertigoContraZoomMode | undefined =
    rawVertigo === "recede" || rawVertigo === "loom" ? rawVertigo : undefined;

  const on = Boolean(picture && (hasDepthParallax(cinematic, picture) || vertigoContraZoom));
  const depthMap = cinematic?.depthMap;
  const plate = cinematic?.depthPlate;
  const cutouts: DepthCutout[] = (cinematic?.depthCutouts ?? [])
    .filter((k) => k.image)
    .slice(0, MAX_CUTOUTS);
  const cutKey = cutouts.map((k) => `${k.image}@${k.depth}`).join(",");

  const effectiveAmount = clamp(
    typeof depthAmount === "number" && Number.isFinite(depthAmount)
      ? depthAmount
      : (cinematic?.depthAmount ?? 0.4),
    0,
    1,
  );
  const baseAuthoredAmount =
    typeof authoredDepthAmount === "number" && Number.isFinite(authoredDepthAmount)
      ? authoredDepthAmount
      : (cinematic?.depthAmount ?? 0.4);

  const amountRef = useRef(effectiveAmount);
  amountRef.current = effectiveAmount;

  const poseRef = useRef({ zoom, x, y, authoredAmount: baseAuthoredAmount });
  poseRef.current = { zoom, x, y, authoredAmount: baseAuthoredAmount };

  const focus = clamp(
    cinematic?.depthFocus ??
      (cutouts.length ? cutouts.reduce((s, k) => s + k.depth, 0) / cutouts.length : 0.5),
    0,
    1,
  );
  const focal = cinematic?.focalPoint;
  const useFocalCenter =
    Boolean(vertigoContraZoom) ||
    (cinematic?.depthMotion === "push" && Math.abs(x) < 1e-5 && Math.abs(y) < 1e-5);
  const center: [number, number] = useFocalCenter ? centreFromFocalPoint(focal) : [0.5, 0.5];

  const uniforms = computeDepthCameraUniforms({
    zoom,
    x,
    y,
    amount: effectiveAmount,
    authoredAmount: baseAuthoredAmount,
    focus,
    center,
    vertigoContraZoom,
  });

  const isSynchronouslyCached = (() => {
    if (!on || (!depthMap && !vertigoContraZoom) || typeof window === "undefined") return false;
    const picSrc = assetBackground(picture);
    const plateSrc = assetBackground(plate || picture);
    return Boolean(getCachedImage(picSrc) || getCachedImage(plateSrc));
  })();

  const [ready, setReady] = useState(isSynchronouslyCached);

  useIsomorphicLayoutEffect(() => {
    drawFrameRef.current = null;
    if (!on || (!depthMap && !vertigoContraZoom)) {
      setReady(false);
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
      powerPreference: "high-performance",
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

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const u = (name: string) => gl.getUniformLocation(prog, name);
    const uZoom = u("uZoom");
    const uShift = u("uShift");
    const uCenter = u("uCenter");
    const uDepthScale = u("uDepthScale");
    const uCuts = u("uCuts");
    const uCutDepth = u("uCutDepth");
    gl.uniform1i(u("uPlate"), 0);
    gl.uniform1i(u("uDepth"), 1);
    ["uCut0", "uCut1", "uCut2", "uCut3"].forEach((name, i) => gl.uniform1i(u(name), 2 + i));
    gl.uniform1f(u("uFocus"), focus);

    const plateTex = gl.createTexture();
    const depthTex = gl.createTexture();
    const cutTex = [
      gl.createTexture(),
      gl.createTexture(),
      gl.createTexture(),
      gl.createTexture(),
    ];
    if (!plateTex || !depthTex || cutTex.some((t) => !t)) return;

    // Seed flat d=0 depth immediately so the base picture draws at the exact keyframed
    // `zoom` / `x` / `y` before `depthMap` or `cutouts` arrive (zero jump when depth loads).
    uploadSolid(gl, 0, plateTex, 0);
    uploadSolid(gl, 1, depthTex, 0);
    for (let i = 0; i < MAX_CUTOUTS; i += 1) {
      uploadSolid(gl, 2 + i, cutTex[i]!, 0);
    }
    gl.uniform1i(uCuts, 0);
    gl.uniform4f(uCutDepth, 0, 0, 0, 0);

    const layers = [...cutouts].sort((a, b) => a.depth - b.depth);
    const sortedDepths = [0, 1, 2, 3].map((i) => clamp(layers[i]?.depth ?? 0, 0, 1));

    let activePlateImg: HTMLImageElement | null = null;
    let activeDepthImg: HTMLImageElement | null = null;
    let activeCutImgs: HTMLImageElement[] = [];
    let fullDepthReady = false;
    let uploadedKey = "";

    const syncTextures = () => {
      if (!activePlateImg) return false;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round((canvas.clientWidth || 960) * dpr));
      const h = Math.max(1, Math.round((canvas.clientHeight || 540) * dpr));
      const stateKey = `${w}x${h}|${activePlateImg.src}|${activeDepthImg ? "d1" : "d0"}|${activeCutImgs.length}`;
      if (stateKey === uploadedKey) return true;
      uploadedKey = stateKey;
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      upload(gl, 0, plateTex, fitted(activePlateImg, w, h), false);
      if (activeDepthImg) {
        upload(gl, 1, depthTex, activeDepthImg, false);
      } else if (vertigoContraZoom) {
        const fc = centreFromFocalPoint(focal);
        uploadFocalDepthField(gl, 1, depthTex, fc[0], fc[1]);
      } else {
        uploadSolid(gl, 1, depthTex, 0);
      }
      if (activeCutImgs.length > 0) {
        activeCutImgs.forEach((img, i) => upload(gl, 2 + i, cutTex[i]!, fitted(img, w, h), true));
        gl.uniform1i(uCuts, activeCutImgs.length);
        gl.uniform4f(uCutDepth, sortedDepths[0], sortedDepths[1], sortedDepths[2], sortedDepths[3]);
      } else {
        gl.uniform1i(uCuts, 0);
      }
      const ca = w / h;
      const ia = activePlateImg.naturalWidth / Math.max(1, activePlateImg.naturalHeight);
      gl.uniform2f(uDepthScale, ca > ia ? 1 : ca / ia, ca > ia ? ia / ca : 1);
      return true;
    };

    const drawFrame = () => {
      if (!alive || !activePlateImg) return;
      if (!syncTextures()) return;
      const curPose = poseRef.current;
      const curAmount = amountRef.current;
      const curCenter: [number, number] =
        vertigoContraZoom ||
        (cinematic?.depthMotion === "push" &&
          Math.abs(curPose.x) < 1e-5 &&
          Math.abs(curPose.y) < 1e-5)
          ? centreFromFocalPoint(focal)
          : [0.5, 0.5];
      const uni = computeDepthCameraUniforms({
        zoom: curPose.zoom,
        x: curPose.x,
        y: curPose.y,
        amount: curAmount,
        authoredAmount: curPose.authoredAmount,
        focus,
        center: curCenter,
        vertigoContraZoom,
      });
      gl.uniform2f(uCenter, uni.uCenter[0], uni.uCenter[1]);
      gl.uniform2f(uZoom, uni.uZoom[0], uni.uZoom[1]);
      gl.uniform2f(uShift, uni.uShift[0], uni.uShift[1]);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    drawFrameRef.current = drawFrame;

    const picSrc = assetBackground(picture);
    const plateSrc = assetBackground(plate || picture);
    const depthSrc = depthMap ? assetUrl(depthMap) : "";
    const cutSrcs = layers.map((k) => assetUrl(k.image));

    const cachedPlate = getCachedImage(plateSrc);
    const cachedPic = getCachedImage(picSrc);
    const cachedDepth = depthSrc ? getCachedImage(depthSrc) : undefined;
    const cachedCuts = cutSrcs.map((s) => getCachedImage(s));

    if (!depthSrc && vertigoContraZoom) {
      if (cachedPlate || cachedPic) {
        activePlateImg = (cachedPlate || cachedPic)!;
        fullDepthReady = true;
        drawFrame();
        setReady(true);
      } else {
        setReady(false);
        loadCachedImage(plateSrc || picSrc)
          .then((img) => {
            if (!alive) return;
            activePlateImg = img;
            fullDepthReady = true;
            drawFrame();
            setReady(true);
          })
          .catch(() => {});
      }
    } else if (cachedPlate && cachedDepth && cachedCuts.every(Boolean)) {
      activePlateImg = cachedPlate;
      activeDepthImg = cachedDepth;
      activeCutImgs = cachedCuts as HTMLImageElement[];
      fullDepthReady = true;
      drawFrame();
      setReady(true);
    } else {
      // Draw `picture` immediately at keyframed zoom/shift if cached or as soon as it arrives
      if (cachedPic) {
        activePlateImg = cachedPic;
        drawFrame();
        setReady(true);
      } else {
        setReady(false);
        loadCachedImage(picSrc)
          .then((picImg) => {
            if (!alive || fullDepthReady) return;
            activePlateImg = picImg;
            drawFrame();
            setReady(true);
          })
          .catch(() => {});
      }

      Promise.all([
        loadCachedImage(plateSrc),
        loadCachedImage(depthSrc),
        ...cutSrcs.map((s) => loadCachedImage(s)),
      ])
        .then(([plateImg, depthImg, ...cutImgs]) => {
          if (!alive) return;
          fullDepthReady = true;
          activePlateImg = plateImg;
          activeDepthImg = depthImg;
          activeCutImgs = cutImgs;
          drawFrame();
          setReady(true);
        })
        .catch(() => {
          /* progressive base picture or fallback plate remains visible */
        });
    }

    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            uploadedKey = "";
            if (alive) drawFrame();
          })
        : null;
    ro?.observe(canvas);

    const onLost = (e: Event) => {
      e.preventDefault();
      alive = false;
      drawFrameRef.current = null;
      setReady(false);
    };
    canvas.addEventListener("webglcontextlost", onLost);

    return () => {
      alive = false;
      drawFrameRef.current = null;
      ro?.disconnect();
      canvas.removeEventListener("webglcontextlost", onLost);
      gl.deleteTexture(plateTex);
      gl.deleteTexture(depthTex);
      for (const t of cutTex) {
        if (t) gl.deleteTexture(t);
      }
      if (buf) gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, picture, depthMap, plate, cutKey, focus, focal, vertigoContraZoom]);

  useIsomorphicLayoutEffect(() => {
    drawFrameRef.current?.();
  }, [zoom, x, y, effectiveAmount, baseAuthoredAmount]);

  if (!on) return null;
  return (
    <canvas
      key={`${picture}|${depthMap}|${plate}|${cutKey}|${focus}|${focal}|${vertigoContraZoom || ""}`}
      ref={canvasRef}
      className={`depth-parallax ${gradeClassName || ""}`.trim()}
      data-depth-ready={ready ? "1" : "0"}
      data-depth-for={picture.replace(/^.*\//, "")}
      data-depth-amount={roundAttr(uniforms.amount)}
      data-vertigo={vertigoContraZoom}
      data-u-zoom={`${roundAttr(uniforms.uZoom[0])},${roundAttr(uniforms.uZoom[1])}`}
      data-u-shift={`${roundAttr(uniforms.uShift[0])},${roundAttr(uniforms.uShift[1])}`}
      aria-hidden
      style={{
        opacity: ready ? 1 : 0,
        transform: "none",
        transition: "none",
        animation: "none",
      }}
    />
  );
}
