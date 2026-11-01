import locationData from "../data/sweet-jesus-locations.json";
import auctionOffice from "../assets/sweet-jesus/locations/auction-office.jpg?inline";
import backOffice from "../assets/sweet-jesus/locations/back-office.jpg?inline";
import bugRoom from "../assets/sweet-jesus/locations/bug-room.jpg?inline";
import churchBasement from "../assets/sweet-jesus/locations/church-basement.jpg?inline";
import churchKitchen from "../assets/sweet-jesus/locations/church-kitchen.jpg?inline";
import churchYard from "../assets/sweet-jesus/locations/church-yard.jpg?inline";
import clinic from "../assets/sweet-jesus/locations/clinic.jpg?inline";
import coffeeShop from "../assets/sweet-jesus/locations/coffee-shop.jpg?inline";
import diner from "../assets/sweet-jesus/locations/diner.jpg?inline";
import jackOffice from "../assets/sweet-jesus/locations/jack-office.jpg?inline";
import morgue from "../assets/sweet-jesus/locations/morgue.jpg?inline";
import navyGate from "../assets/sweet-jesus/locations/navy-gate.jpg?inline";
import payphone from "../assets/sweet-jesus/locations/payphone.jpg?inline";
import pikeCar from "../assets/sweet-jesus/locations/pike-car.jpg?inline";
import poolHall from "../assets/sweet-jesus/locations/pool-hall.jpg?inline";
import propertyOffice from "../assets/sweet-jesus/locations/property-office.jpg?inline";
import rayFlat from "../assets/sweet-jesus/locations/ray-flat.jpg?inline";
import rayStoop from "../assets/sweet-jesus/locations/ray-stoop.jpg?inline";
import veraCar from "../assets/sweet-jesus/locations/vera-car.jpg?inline";
import warehouse from "../assets/sweet-jesus/locations/warehouse.jpg?inline";

export interface LocationReference {
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
  "auction-office": auctionOffice,
  "back-office": backOffice,
  "bug-room": bugRoom,
  "church-basement": churchBasement,
  "church-kitchen": churchKitchen,
  "church-yard": churchYard,
  clinic,
  "coffee-shop": coffeeShop,
  diner,
  "jack-office": jackOffice,
  morgue,
  "navy-gate": navyGate,
  payphone,
  "pike-car": pikeCar,
  "pool-hall": poolHall,
  "property-office": propertyOffice,
  "ray-flat": rayFlat,
  "ray-stoop": rayStoop,
  "vera-car": veraCar,
  warehouse,
};

export const SWEET_JESUS_LOCATION_REFERENCES: LocationReference[] = locationData.map((ref) => {
  const preview = previews[ref.id];
  if (!preview) throw new Error(`Missing bundled location preview: ${ref.id}`);
  return {
    ...ref,
    preview,
    // The full-size plates travel with the editor when its assets folder is available.
    original: `./sweet-jesus/locations/${ref.original}`,
  };
});

/** Every location sheet that a scene can be keyed to, by scene id. */
export const LOCATION_BY_SCENE: Record<string, LocationReference> = Object.fromEntries(
  SWEET_JESUS_LOCATION_REFERENCES.flatMap((ref) => ref.scenes.map((sceneId) => [sceneId, ref])),
);
