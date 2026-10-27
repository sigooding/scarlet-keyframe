import type { Consequences } from "../types";

export interface EsperRegion {
  id: string;
  label: string;
  /** Sector coordinates in percentages: x, y, w, h (0..100) */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Enhanced close-up image URL when zoomed into this sector */
  enhancedImage?: string;
  /** Text description revealed upon enhancement */
  clueText: string;
  /** Flag set when this region is enhanced */
  flagSet?: string;
  /** Item granted when this region is enhanced */
  itemGranted?: string;
  /** Is this region a key clue / target required for completion? */
  isTarget?: boolean;
}

export interface EsperConfig {
  title?: string;
  instruction?: string;
  /** Main photo image URL */
  photoImage: string;
  /** List of clickable / zoomable sectors */
  regions: EsperRegion[];
  /** Reward consequences when all targets (or key region) are enhanced */
  rewardConsequences?: Consequences;
  /** Text shown when photo analysis is completed */
  winText?: string;
  /** Optional target scene ID after successful analysis */
  targetSceneId?: string;
}
