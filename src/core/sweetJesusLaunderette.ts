import referenceData from "../data/sweet-jesus-launderette.json";
import interior from "../assets/sweet-jesus/launderette/interior.jpg?inline";
import exterior from "../assets/sweet-jesus/launderette/exterior.jpg?inline";
import table from "../assets/sweet-jesus/launderette/folding-table.jpg?inline";
import recorder from "../assets/sweet-jesus/launderette/cassette-with-mic.png?inline";
import styleSheets from "../assets/sweet-jesus/sweet-jesus-launderette-sheets.pdf?inline";
import openingSheets from "../assets/sweet-jesus/sweet-jesus-opening-storyboard.pdf?inline";

export interface LaunderetteReference {
  id: string;
  title: string;
  kicker: string;
  subtitle: string;
  alt: string;
  summary: string;
  design: string;
  continuity: string;
  original: string;
  preview: string;
}

const previews: Record<string, string> = {
  interior,
  exterior,
  "folding-table": table,
  "cassette-with-mic": recorder,
};

export const SWEET_JESUS_LAUNDERETTE_REFERENCES: LaunderetteReference[] = referenceData.map((ref) => ({
  ...ref,
  preview: previews[ref.id],
  // The selected full-size references accompany the editor when its assets folder is available.
  original: `./sweet-jesus/launderette/${ref.original}`,
}));
export const SWEET_JESUS_LAUNDERETTE_SHEETS_PDF = styleSheets;
export const SWEET_JESUS_OPENING_STORYBOARD_PDF = openingSheets;
