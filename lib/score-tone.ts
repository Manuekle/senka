// Shared score language: one tone per value, same thresholds in every
// gauge (ScoreRing, ScoreGauge badge + dot). Thresholds are coarse on
// purpose — a score is a verdict first, a number second.

export type ScoreTone = "green" | "blue" | "purple" | "red";

export function toneForScore(fraction: number): ScoreTone {
  if (fraction >= 0.8) return "green";
  if (fraction >= 0.6) return "blue";
  if (fraction >= 0.4) return "purple";
  return "red";
}

/** Flat stroke/dot colors, one per tone. */
export const SCORE_TONE_SOLID: Record<ScoreTone, string> = {
  green: "#10b981",
  blue: "#129FEA",
  purple: "#8b5cf6",
  red: "#e11d48",
};
