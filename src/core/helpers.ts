export function slug(value: string): string {
  const cleaned = String(value || "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "animatic";
}

export function downloadText(content: string, filename: string, mime = "text/plain"): void {
  const type = mime.includes("charset") ? mime : `${mime};charset=utf-8`;
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function measureAudioDuration(
  src: string,
  cache?: Map<string, number>,
): Promise<number | undefined> {
  if (!src) return Promise.resolve(undefined);
  const cached = cache?.get(src);
  if (cached !== undefined && Number.isFinite(cached) && cached > 0) {
    return Promise.resolve(cached);
  }
  if (typeof Audio === "undefined") return Promise.resolve(undefined);

  return new Promise((resolve) => {
    const element = new Audio();
    element.preload = "metadata";
    let settled = false;

    const finish = (seconds: number | undefined) => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timer);
      element.removeEventListener("loadedmetadata", onLoaded);
      element.removeEventListener("durationchange", onLoaded);
      element.removeEventListener("error", onError);
      try {
        element.pause();
        element.removeAttribute("src");
        element.load();
      } catch {
        // Ignore cleanup errors on detached audio elements.
      }
      if (seconds !== undefined && Number.isFinite(seconds) && seconds > 0) {
        cache?.set(src, seconds);
        resolve(seconds);
      } else {
        resolve(undefined);
      }
    };

    const onLoaded = () => {
      if (Number.isFinite(element.duration) && element.duration > 0) {
        finish(element.duration);
      }
    };

    const onError = () => finish(undefined);

    const timer = globalThis.setTimeout(() => {
      finish(Number.isFinite(element.duration) && element.duration > 0 ? element.duration : undefined);
    }, 1500);

    element.addEventListener("loadedmetadata", onLoaded);
    element.addEventListener("durationchange", onLoaded);
    element.addEventListener("error", onError);
    element.src = src;
    if (Number.isFinite(element.duration) && element.duration > 0) {
      finish(element.duration);
    }
  });
}

export function storyboardGradient(picture: string): string {
  if (!picture) return "gradient:linear-gradient(135deg,#111518,#07090b)";
  let hash = 2166136261;
  for (let i = 0; i < picture.length; i += 1) {
    hash = Math.imul(hash ^ picture.charCodeAt(i), 16777619);
  }
  const hueA = Math.abs(hash) % 360;
  const hueB = (hueA + 42) % 360;
  const angle = 115 + (Math.abs(hash >> 8) % 50);
  return `gradient:linear-gradient(${angle}deg, hsl(${hueA} 24% 18%) 0%, hsl(${hueB} 28% 10%) 58%, #07090d 100%)`;
}

