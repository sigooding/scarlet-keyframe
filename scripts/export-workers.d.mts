/** Types for the shared render-worker sizing helper (plain ESM, used by the CLI too). */
export const MAX_EXPORT_WORKERS: number;
export function clampExportWorkers(raw: unknown): number;
export function suggestExportWorkers(cpuCount?: number): number;
