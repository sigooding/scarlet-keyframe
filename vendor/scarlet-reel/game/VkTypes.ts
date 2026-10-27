import type { Consequences } from "../types";

export interface VkQuestion {
  id: string;
  prompt: string;
  type: "baseline" | "empathy" | "replicant";
  /** How much pupil dilation / heart rate spike this question induces in a Replicant (0-100) */
  replicantTensionDelta: number;
  /** How much pupil dilation / heart rate spike this question induces in a Human (0-100) */
  humanTensionDelta: number;
  /** Response text from subject when Human */
  humanResponse: string;
  /** Response text from subject when Replicant */
  replicantResponse: string;
}

export interface VkConfig {
  title?: string;
  subjectName: string;
  subjectIsReplicant: boolean;
  eyeImage?: string;
  questions: VkQuestion[];
  /** Tension threshold to confirm Replicant (default 60) */
  tensionThreshold?: number;
  rewardConsequences?: Consequences;
  targetSceneId?: string;
  replicantTargetSceneId?: string;
  humanTargetSceneId?: string;
  replicantFlagSet?: string;
  humanFlagSet?: string;
}
