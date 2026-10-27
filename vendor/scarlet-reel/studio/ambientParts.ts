/** The synth presets audio.ts builds (and the validator knows). */
export const AMBIENT_PRESETS = ["none", "rain", "jazz", "drone", "tension"];

/** A scene's ambience is one string: parts joined with "+", each a synth preset ("rain") or a recorded loop
 *  ("file:<url or asset:id>"), see audio.ts buildMix. Nobody's Witness layers a preset and up to three recorded loops. */
export function parseAmbient(value: string | undefined): { preset: string; loops: string[]; other: string[] } {
  const parts = (value ?? "").split("+").map((p) => p.trim()).filter(Boolean);
  const loops = parts.filter((p) => p.startsWith("file:")).map((p) => p.slice(5));
  const synth = parts.filter((p) => !p.startsWith("file:"));
  const preset = synth.find((p) => AMBIENT_PRESETS.includes(p)) ?? "none";
  return { preset, loops, other: synth.filter((p) => p !== preset) };
}

export function joinAmbient(preset: string, loops: string[], other: string[] = []): string {
  const parts = [...(preset && preset !== "none" ? [preset] : []), ...other, ...loops.map((l) => `file:${l}`)];
  return parts.length ? parts.join("+") : "none";
}
