// Generated location sheets for the Miami Vice film. Run
// `npm run build:miami-vice-locations` after replacing the originals in
// public/miami-vice/locations.
import locationData from "../data/miami-vice-locations.json";
import carlylebar from "../assets/miami-vice/locations/carlyle-bar.jpg?inline";
import causeway from "../assets/miami-vice/locations/causeway.jpg?inline";
import docks from "../assets/miami-vice/locations/docks.jpg?inline";
import martaoffice from "../assets/miami-vice/locations/marta-office.jpg?inline";
import miramarpool from "../assets/miami-vice/locations/miramar-pool.jpg?inline";
import ocbbullpen from "../assets/miami-vice/locations/ocb-bullpen.jpg?inline";
import stvitus from "../assets/miami-vice/locations/st-vitus.jpg?inline";
import thriftstore from "../assets/miami-vice/locations/thrift-store.jpg?inline";
import warehouse from "../assets/miami-vice/locations/warehouse.jpg?inline";

export interface MiamiViceLocationReference {
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
  "carlyle-bar": carlylebar,
  "causeway": causeway,
  "docks": docks,
  "marta-office": martaoffice,
  "miramar-pool": miramarpool,
  "ocb-bullpen": ocbbullpen,
  "st-vitus": stvitus,
  "thrift-store": thriftstore,
  "warehouse": warehouse,
};

export const MIAMI_VICE_LOCATION_REFERENCES: MiamiViceLocationReference[] = locationData.map((ref) => {
  const preview = previews[ref.id];
  if (!preview) throw new Error(`Missing bundled Miami Vice location preview: ${ref.id}`);
  return {
    ...ref,
    preview,
    // The full-size plates travel with the editor when its assets folder is available.
    original: `./miami-vice/locations/${ref.original}`,
  };
});

/** Every location sheet a scene is keyed to, by scene id. */
export const MIAMI_VICE_LOCATION_BY_SCENE: Record<string, MiamiViceLocationReference> = Object.fromEntries(
  MIAMI_VICE_LOCATION_REFERENCES.flatMap((ref) => ref.scenes.map((sceneId) => [sceneId, ref])),
);
