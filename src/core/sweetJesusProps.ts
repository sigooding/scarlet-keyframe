import propData from "../data/sweet-jesus-props.json";
import cashEnvelope from "../assets/sweet-jesus/props/cash-envelope.jpg?inline";
import coinBox from "../assets/sweet-jesus/props/coin-box.jpg?inline";
import glassineNote from "../assets/sweet-jesus/props/glassine-note.jpg?inline";
import hearse from "../assets/sweet-jesus/props/hearse.jpg?inline";
import laundryReceipt from "../assets/sweet-jesus/props/laundry-receipt.jpg?inline";
import ledger from "../assets/sweet-jesus/props/ledger.jpg?inline";
import pinballMachine from "../assets/sweet-jesus/props/pinball-machine.jpg?inline";
import stamp from "../assets/sweet-jesus/props/stamp.jpg?inline";
import tapeLoop from "../assets/sweet-jesus/props/tape-loop.jpg?inline";
import transferSlip from "../assets/sweet-jesus/props/transfer-slip.jpg?inline";

export interface PropReference {
  id: string;
  title: string;
  kicker: string;
  subtitle: string;
  alt: string;
  summary: string;
  design: string;
  continuity: string;
  scenes: string[];
  original: string;
  preview: string;
}

const previews: Record<string, string> = {
  "cash-envelope": cashEnvelope,
  "coin-box": coinBox,
  "glassine-note": glassineNote,
  hearse,
  "laundry-receipt": laundryReceipt,
  ledger,
  "pinball-machine": pinballMachine,
  stamp,
  "tape-loop": tapeLoop,
  "transfer-slip": transferSlip,
};

export const SWEET_JESUS_PROP_REFERENCES: PropReference[] = propData.map((ref) => {
  const preview = previews[ref.id];
  if (!preview) throw new Error(`Missing bundled prop preview: ${ref.id}`);
  return {
    ...ref,
    preview,
    // The full-size sheets travel with the editor when its assets folder is available.
    original: `./sweet-jesus/props/${ref.original}`,
  };
});

/** Every prop sheet that appears in a scene, by scene id. */
export const PROPS_BY_SCENE: Record<string, PropReference[]> = Object.fromEntries(
  [...new Set(SWEET_JESUS_PROP_REFERENCES.flatMap((ref) => ref.scenes))].map((sceneId) => [
    sceneId,
    SWEET_JESUS_PROP_REFERENCES.filter((ref) => ref.scenes.includes(sceneId)),
  ]),
);
