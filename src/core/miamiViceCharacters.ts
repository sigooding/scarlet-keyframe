// Generated cast gallery data for the Miami Vice film. Run
// `npm run build:miami-vice-previews` after replacing the originals in
// public/miami-vice/characters.
import characterData from "../data/miami-vice-characters.json";
import ginacalabrese from "../assets/miami-vice/portraits/gina-calabrese.jpg";
import izzymoreno from "../assets/miami-vice/portraits/izzy-moreno.jpg";
import jamescrockett from "../assets/miami-vice/portraits/james-crockett.jpg";
import larryzito from "../assets/miami-vice/portraits/larry-zito.jpg";
import martaescobar from "../assets/miami-vice/portraits/marta-escobar.jpg";
import martincastillo from "../assets/miami-vice/portraits/martin-castillo.jpg";
import raycoburn from "../assets/miami-vice/portraits/ray-coburn.jpg";
import ricardotubbs from "../assets/miami-vice/portraits/ricardo-tubbs.jpg";
import stanswitek from "../assets/miami-vice/portraits/stan-switek.jpg";
import trudyjoplin from "../assets/miami-vice/portraits/trudy-joplin.jpg";

export interface MiamiViceCastReference {
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
  "gina-calabrese": ginacalabrese,
  "izzy-moreno": izzymoreno,
  "james-crockett": jamescrockett,
  "larry-zito": larryzito,
  "marta-escobar": martaescobar,
  "martin-castillo": martincastillo,
  "ray-coburn": raycoburn,
  "ricardo-tubbs": ricardotubbs,
  "stan-switek": stanswitek,
  "trudy-joplin": trudyjoplin,
};

export const MIAMI_VICE_CAST_REFERENCES: MiamiViceCastReference[] = characterData.map((character) => ({
  ...character,
  preview: previews[character.id],
  // Public assets are relative to the editor, so they work in Vite and in dist/ opened from disk.
  original: `./miami-vice/characters/${character.id}.png`,
}));

export const MIAMI_VICE_CAST_BY_ID: Record<string, MiamiViceCastReference> = Object.fromEntries(
  MIAMI_VICE_CAST_REFERENCES.map((character) => [character.id, character]),
);
