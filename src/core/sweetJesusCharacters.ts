import characterData from "../data/sweet-jesus-characters.json";
import bug from "../assets/sweet-jesus/portraits/bug-ray.jpg";
import clutch from "../assets/sweet-jesus/portraits/clutch.jpg";
import corn from "../assets/sweet-jesus/portraits/corn-brandt.jpg";
import dove from "../assets/sweet-jesus/portraits/dove.jpg";
import etta from "../assets/sweet-jesus/portraits/etta-ray.jpg";
import pike from "../assets/sweet-jesus/portraits/frank-pike.jpg";
import harriett from "../assets/sweet-jesus/portraits/harriett.jpg";
import jack from "../assets/sweet-jesus/portraits/jack-monroe.jpg";
import nicky from "../assets/sweet-jesus/portraits/nicky.jpg";
import peanut from "../assets/sweet-jesus/portraits/peanut-ray.jpg";
import sal from "../assets/sweet-jesus/portraits/sal-vetrano.jpg";
import tick from "../assets/sweet-jesus/portraits/tick-lane.jpg";
import vera from "../assets/sweet-jesus/portraits/vera-voss.jpg";
import kellerman from "../assets/sweet-jesus/portraits/whitney-kellerman.jpg";
import printableSheets from "../assets/sweet-jesus/sweet-jesus-character-sheets.pdf?inline";

export interface CharacterReference {
  id: string;
  name: string;
  role: string;
  age: string;
  summary: string;
  look: string;
  continuity: string;
  preview: string;
  original: string;
}

const previews: Record<string, string> = {
  "bug-ray": bug,
  clutch,
  "corn-brandt": corn,
  dove,
  "etta-ray": etta,
  "frank-pike": pike,
  harriett,
  "jack-monroe": jack,
  nicky,
  "peanut-ray": peanut,
  "sal-vetrano": sal,
  "tick-lane": tick,
  "vera-voss": vera,
  "whitney-kellerman": kellerman,
};

export const SWEET_JESUS_CHARACTER_REFERENCES: CharacterReference[] = characterData.map((character) => ({
  ...character,
  preview: previews[character.id],
  // Public assets are relative to the editor, so they work in Vite and in dist/ opened from disk.
  original: `./sweet-jesus/characters/${character.id}.png`,
}));

// The printable set and preview images are bundled, including in the single-file editor.
export const SWEET_JESUS_CHARACTER_SHEETS_PDF = printableSheets;
