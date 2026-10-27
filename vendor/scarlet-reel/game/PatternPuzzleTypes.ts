import type { Consequences } from "../types";

export interface PatternRow {
  id: string;
  /** the label shown on the left — e.g. "Aug 6" */
  date: string;
  /** the description — e.g. "Blackwood First Nat'l — Main Br." */
  description: string;
  /** the amount shown on the right — e.g. "-$9,800" */
  amount: string;
  /** whether this row is part of the correct pattern */
  isAnswer: boolean;
}

export interface PatternPuzzleConfig {
  title: string;
  instruction: string;
  rows: PatternRow[];
  targetCount: number;
  payoffText: string;
  rewardConsequences?: Consequences;
  wrongSubmissionConsequences?: Consequences;
  allowRetry?: boolean;
  wrongMessage?: string;
  targetSceneId?: string;
  wrongTargetSceneId?: string;
}
