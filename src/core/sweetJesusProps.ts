import propData from "../data/sweet-jesus-props.json";
import cashEnvelope from "../assets/sweet-jesus/props/cash-envelope.jpg?inline";
import coinBox from "../assets/sweet-jesus/props/coin-box.jpg?inline";
import evidenceBag from "../assets/sweet-jesus/props/evidence-bag.jpg?inline";
import glassineNote from "../assets/sweet-jesus/props/glassine-note.jpg?inline";
import handTruck from "../assets/sweet-jesus/props/hand-truck.jpg?inline";
import hearse from "../assets/sweet-jesus/props/hearse.jpg?inline";
import laundryReceipt from "../assets/sweet-jesus/props/laundry-receipt.jpg?inline";
import ledger from "../assets/sweet-jesus/props/ledger.jpg?inline";
import ledgerCopies from "../assets/sweet-jesus/props/ledger-copies.jpg?inline";
import nickyCart from "../assets/sweet-jesus/props/nicky-cart.jpg?inline";
import pikeBadge from "../assets/sweet-jesus/props/pike-badge.jpg?inline";
import pikePhoto from "../assets/sweet-jesus/props/pike-photo.jpg?inline";
import pinballMachine from "../assets/sweet-jesus/props/pinball-machine.jpg?inline";
import revolver from "../assets/sweet-jesus/props/revolver.jpg?inline";
import seedTwist from "../assets/sweet-jesus/props/seed-twist.jpg?inline";
import stamp from "../assets/sweet-jesus/props/stamp.jpg?inline";
import tapeLoop from "../assets/sweet-jesus/props/tape-loop.jpg?inline";
import transferSlip from "../assets/sweet-jesus/props/transfer-slip.jpg?inline";
import twoRecorders from "../assets/sweet-jesus/props/two-recorders.jpg?inline";
import wheelchair from "../assets/sweet-jesus/props/wheelchair.jpg?inline";

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
  "evidence-bag": evidenceBag,
  "glassine-note": glassineNote,
  "hand-truck": handTruck,
  hearse,
  "laundry-receipt": laundryReceipt,
  ledger,
  "ledger-copies": ledgerCopies,
  "nicky-cart": nickyCart,
  "pike-badge": pikeBadge,
  "pike-photo": pikePhoto,
  "pinball-machine": pinballMachine,
  revolver,
  "seed-twist": seedTwist,
  stamp,
  "tape-loop": tapeLoop,
  "transfer-slip": transferSlip,
  "two-recorders": twoRecorders,
  wheelchair,
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
