import { cloneWeek } from "./clone";
import type {
  AccessoryConfig,
  AccessoryGroupConfig,
  Block,
  Exercise,
  ExerciseTier,
  PrimaryConfig,
  Week,
  WorkoutSet,
} from "./types";

/**
 * Theoretical % of 1RM for a given rep count (spec: 1 rep = 100%, 2 reps = 95%, then -2.5%
 * per additional rep). Extrapolates cleanly past the 10-rep row in the spec's table.
 */
export function theoreticalPercent(reps: number): number {
  if (reps <= 1) return 100;
  return Math.max(0, 95 - 2.5 * (reps - 2));
}

/** Theoretical weight for `reps` given a 1RM, rounded to kill binary floating-point noise. */
export function theoreticalWeight(oneRepMax: number, reps: number): number {
  return Math.round(((oneRepMax * theoreticalPercent(reps)) / 100) * 100) / 100;
}

export type RpeFlag = "above" | "below" | "match" | null;

/** Coach-only feedback signal — never used to change the plan automatically (spec §10). */
export function rpeFlag(expected: number | null | undefined, actualMax: number | null | undefined): RpeFlag {
  if (expected == null || actualMax == null) return null;
  if (actualMax > expected) return "above";
  if (actualMax < expected) return "below";
  return "match";
}

/**
 * Which tier an exercise belongs to. Falls back to position-based defaults (0->primary,
 * 1->secondary, else->accessory) for legacy exercises created before `tier` existed.
 */
export function tierOf(ex: Exercise, indexInWorkout: number): ExerciseTier {
  return ex.tier ?? (indexInWorkout === 0 ? "primary" : indexInWorkout === 1 ? "secondary" : "accessory");
}

type ResolvedConfig = PrimaryConfig | AccessoryConfig | AccessoryGroupConfig;

/** Looks up the config governing one exercise: primary/secondary have their own per-exercise
 * dict; accessory checks for a per-exercise exception first, else falls back to the shared group rule. */
export function resolveConfig(
  ex: Exercise,
  tier: ExerciseTier,
  block: Pick<Block, "primaryConfigs" | "secondaryConfigs" | "accessoryConfigs" | "accessoryGroup">,
): ResolvedConfig | undefined {
  const pid = ex.progressionId;
  if (!pid) return undefined;
  if (tier === "primary") return block.primaryConfigs?.[pid];
  if (tier === "secondary") return block.secondaryConfigs?.[pid];
  return block.accessoryConfigs?.[pid] ?? block.accessoryGroup ?? undefined;
}

/**
 * Resizes every config's arrays to match a new week count — pads with 0 (progressionPattern) or
 * null (expectedRpe), or truncates. Call after any change to totalWeeks/week count (addWeek,
 * BlockSettingsDialog save, etc). deleteWeek splices explicitly instead (see coach.block route).
 */
export function syncConfigArrayLengths(
  block: Pick<Block, "primaryConfigs" | "secondaryConfigs" | "accessoryConfigs" | "accessoryGroup">,
  totalWeeks: number,
): Pick<Block, "primaryConfigs" | "secondaryConfigs" | "accessoryConfigs" | "accessoryGroup"> {
  const resize = <T,>(arr: T[], length: number, fill: T): T[] => {
    if (arr.length === length) return arr;
    if (arr.length > length) return arr.slice(0, length);
    return [...arr, ...Array.from({ length: length - arr.length }, () => fill)];
  };
  const patternLen = Math.max(0, totalWeeks - 1);
  const resizePrimaryLike = (configs: Record<string, PrimaryConfig> | undefined) =>
    Object.fromEntries(
      Object.entries(configs ?? {}).map(([k, c]) => [
        k,
        {
          ...c,
          progressionPattern: resize(c.progressionPattern, patternLen, 0),
          expectedRpe: resize(c.expectedRpe, totalWeeks, null),
        },
      ]),
    );
  return {
    primaryConfigs: resizePrimaryLike(block.primaryConfigs),
    secondaryConfigs: resizePrimaryLike(block.secondaryConfigs),
    accessoryConfigs: Object.fromEntries(
      Object.entries(block.accessoryConfigs ?? {}).map(([k, c]) => [
        k,
        { ...c, progressionPattern: resize(c.progressionPattern, patternLen, 0) },
      ]),
    ),
    accessoryGroup: block.accessoryGroup
      ? { ...block.accessoryGroup, progressionPattern: resize(block.accessoryGroup.progressionPattern, patternLen, 0) }
      : block.accessoryGroup,
  };
}

/**
 * Returns the rule-driven target for ONE set going into the next week. Each set progresses from
 * its own planned value — sets within an exercise can carry different weights/reps and each one
 * moves independently by the same delta. The non-progressing dimension (fixedValue) is shared.
 *
 * Baseline is always the source week's live PLANNED value (weightMin/repsMin) — never
 * actualWeight/actualReps. Verified against the spec's worked examples (§18/§19): "coach says
 * repeat 150" -> next week's rule is applied to 150 (the now-current plan), not to whatever
 * RPE/actual was logged. Actual performance is feedback for the coach's decision (§10), never a
 * direct input to the formula.
 *
 * A config with no `fixedValue` (the shared accessory-group rule) leaves the non-progressing
 * dimension untouched — the target comes back undefined for it, and the caller's set-patching
 * keeps whatever was already there.
 */
function computeSetTarget(
  cfg: ResolvedConfig | undefined,
  sourceWeekNumber: number,
): ((src: WorkoutSet) => { weight?: number; reps?: number }) | null {
  if (!cfg || cfg.kind === "none") return null;
  const delta = cfg.progressionPattern[sourceWeekNumber - 1] ?? 0;
  const fixedValue = "fixedValue" in cfg ? cfg.fixedValue : null;
  return (src) => {
    if (cfg.kind === "weight") {
      const weight = Math.round(((src.weightMin ?? 0) + delta) * 100) / 100;
      return { weight, reps: fixedValue ?? undefined };
    }
    const reps = Math.round((src.repsMin ?? 0) + delta);
    return { weight: fixedValue ?? undefined, reps };
  };
}

/**
 * Rule-aware week generation. Wraps cloneWeek for the structural copy (fresh ids, blank actuals,
 * needsUpdate flag), then overwrites the sets of any exercise whose tier/progressionId resolves
 * to a config (kind !== "none") with the rule-computed target instead of cloneWeek's own
 * actual-fallback value. Plain (unconfigured) exercises are untouched.
 */
export function generateNextWeek(
  block: Pick<Block, "primaryConfigs" | "secondaryConfigs" | "accessoryConfigs" | "accessoryGroup">,
  sourceWeek: Week,
  weekNumber: number,
  flagUpdate = true,
): Week {
  const base = cloneWeek(sourceWeek, weekNumber, flagUpdate);
  return {
    ...base,
    workouts: base.workouts.map((w, wi) => ({
      ...w,
      exercises: w.exercises.map((ex, ei) => {
        const srcEx = sourceWeek.workouts[wi]?.exercises[ei];
        if (!srcEx) return ex;
        const tier = tierOf(srcEx, ei);
        const cfg = resolveConfig(srcEx, tier, block);
        const targetFor = computeSetTarget(cfg, sourceWeek.weekNumber);
        if (!targetFor) return ex;
        return {
          ...ex,
          sets: ex.sets.map((s, si) => {
            const src = srcEx.sets[si];
            if (!src) return s;
            const target = targetFor(src);
            return {
              ...s,
              weightMin: s.hasWeight && target.weight != null ? target.weight : s.weightMin,
              weightMax: s.hasWeight && target.weight != null ? target.weight : s.weightMax,
              repsMin: s.hasReps && target.reps != null ? target.reps : s.repsMin,
              repsMax: s.hasReps && target.reps != null ? target.reps : s.repsMax,
            };
          }),
        };
      }),
    })),
  };
}
