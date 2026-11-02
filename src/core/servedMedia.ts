/**
 * Decides whether the editor can read film pictures, depth maps and audio from
 * the page's own server.
 *
 * - `npm run dev` (http://127.0.0.1:5173) and `npm run serve`
 *   (http://127.0.0.1:4173) serve `public/` themselves, so `/film/img/…` is a
 *   local, instant request.
 * - The single-file build opened from disk (`file:`) has no server, so those
 *   paths must come from the Scarlett Reel repository instead.
 *
 * This is a protocol check rather than Vite's `import.meta.env.DEV` so that the
 * production build served over http also uses the local media — that is what
 * makes MP4 export from `npm run serve` fast and works offline.
 */
export function servesLocalMedia(): boolean {
  if (typeof window === "undefined" || !window.location) return false;
  const protocol = window.location.protocol;
  return protocol === "http:" || protocol === "https:";
}
