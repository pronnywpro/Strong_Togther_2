import type { WorkoutSet } from "./types";

export const DASH = "————";

export function rangeText(min: number | null, max: number | null, suffix = ""): string {
  if (min == null && max == null) return "חופשי";
  if (min != null && max != null && min !== max) return `${min}-${max}${suffix}`;
  return `${min ?? max}${suffix}`;
}

export function targetText(set: WorkoutSet, field: "reps" | "weight" | "rpe"): string {
  if (field === "reps") return set.hasReps ? rangeText(set.repsMin, set.repsMax) : DASH;
  if (field === "weight") return set.hasWeight ? rangeText(set.weightMin, set.weightMax, ' ק"ג') : DASH;
  return set.hasRpe ? rangeText(set.rpeMin, set.rpeMax) : DASH;
}
