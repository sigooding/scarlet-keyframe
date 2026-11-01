/**
 * Render-worker sizing, shared by the exporter and the export dialog.
 *
 * Kept dependency-free (no Node built-ins) so the browser bundle can import the
 * same numbers the CLI uses instead of re-deriving them.
 */

export const MAX_EXPORT_WORKERS = 6;

export function clampExportWorkers(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.max(1, Math.min(MAX_EXPORT_WORKERS, Math.round(n)));
}

/**
 * How many parallel render workers this machine can actually feed.
 *
 * An export is CPU-bound, not GPU-bound: each worker paints on the GPU but does
 * its own frame capture, PNG/JPEG encoding, pipe write and (for software
 * encoding) H.264 work on the CPU. Two workers per three logical CPUs leaves
 * room for the encoder and the OS; beyond six the GPU session limit and memory
 * cost dominate. Cached segments make overshooting cheap, so this errs high.
 */
export function suggestExportWorkers(cpuCount = 4) {
  const cores = Math.max(1, Math.round(Number(cpuCount) || 1));
  if (cores <= 3) return 1;
  return Math.max(1, Math.min(MAX_EXPORT_WORKERS, Math.floor(cores / 2)));
}
