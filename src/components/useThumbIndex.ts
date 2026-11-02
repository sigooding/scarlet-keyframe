import { useEffect, useState } from "react";
import { subscribeThumbIndex } from "../core/thumbs";

/**
 * Re-renders a list when `public/thumbs/index.json` finishes loading, so rows
 * that were already painted with full-size pictures switch to the small ones
 * without a reload. Thumbnails are optional: with no index nothing happens.
 */
export function useThumbIndex(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => subscribeThumbIndex(() => setVersion((current) => current + 1)), []);
  return version;
}
