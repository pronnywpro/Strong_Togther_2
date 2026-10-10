import { uid } from "./store";
import type { AccessoryConfig, AccessoryGroupConfig, Block, PrimaryConfig, Week } from "./types";

/**
 * Duplicates a week's structure for the next week. Targets are seeded from what the trainee
 * actually did (not the coach's old planned targets) so the new week reflects real progression;
 * sets the trainee never logged fall back to their previous target. Flagged fields (needsUpdate)
 * still need the coach's review before the week is sent.
 */
export function cloneWeek(week: Week, weekNumber: number, flagUpdate = true): Week {
  return {
    weekNumber,
    published: false,
    reviewed: false,
    workouts: week.workouts.map((w) => ({
      ...w,
      id: uid(),
      completedAt: null,
      exercises: w.exercises.map((e) => ({
        ...e,
        id: uid(),
        skipped: false,
        skipReason: "",
        sets: e.sets.map((s) => {
          const weight = s.actualWeight ?? s.weightMin;
          const reps = s.actualReps ?? s.repsMin;
          const rpe = s.actualRpe ?? s.rpeMin;
          return {
            ...s,
            id: uid(),
            weightMin: s.hasWeight ? weight : s.weightMin,
            weightMax: s.hasWeight ? weight : s.weightMax,
            repsMin: s.hasReps ? reps : s.repsMin,
            repsMax: s.hasReps ? reps : s.repsMax,
            rpeMin: s.hasRpe ? rpe : s.rpeMin,
            rpeMax: s.hasRpe ? rpe : s.rpeMax,
            actualReps: null,
            actualWeight: null,
            actualRpe: null,
            videoId: null,
            note: "",
            skipped: false,
            skipReason: "",
            needsUpdate: flagUpdate,
          };
        }),
      })),
    })),
  };
}

/**
 * Structural copy of a week that does NOT seed targets from any trainee's actual performance —
 * used when duplicating a whole block as a fresh, reusable starting point (see cloneBlock), where
 * baking one specific trainee's logged numbers into what should be a clean copy would be wrong.
 * Unlike cloneWeek, every id is regenerated but `progressionId` is preserved unchanged so the
 * copy's exercises stay linked to the copied primary/accessory configs.
 */
function cloneWeekAsIs(week: Week, weekNumber: number): Week {
  return {
    weekNumber,
    published: false,
    reviewed: false,
    workouts: week.workouts.map((w) => ({
      ...w,
      id: uid(),
      completedAt: null,
      exercises: w.exercises.map((e) => ({
        ...e,
        id: uid(),
        skipped: false,
        skipReason: "",
        sets: e.sets.map((s) => ({
          ...s,
          id: uid(),
          actualReps: null,
          actualWeight: null,
          actualRpe: null,
          videoId: null,
          note: "",
          skipped: false,
          skipReason: "",
          needsUpdate: false,
        })),
      })),
    })),
  };
}

/**
 * Deep-copies a whole block's weeks + progression configs into a fresh, independent starting
 * point (spec: "selecting an existing block must create a COPY; the original must never be
 * modified"). Arrays inside each config are copied too, so editing the copy can never mutate the
 * source block's config by reference.
 */
export function cloneBlock(
  source: Block,
): Pick<Block, "weeks" | "primaryConfigs" | "secondaryConfigs" | "accessoryConfigs" | "accessoryGroup"> {
  const clonePrimaryLike = (configs: Record<string, PrimaryConfig> | undefined) =>
    Object.fromEntries(
      Object.entries(configs ?? {}).map(([k, c]): [string, PrimaryConfig] => [
        k,
        { ...c, progressionPattern: [...c.progressionPattern], expectedRpe: [...c.expectedRpe] },
      ]),
    );
  return {
    weeks: source.weeks.map((w) => cloneWeekAsIs(w, w.weekNumber)),
    primaryConfigs: clonePrimaryLike(source.primaryConfigs),
    secondaryConfigs: clonePrimaryLike(source.secondaryConfigs),
    accessoryConfigs: Object.fromEntries(
      Object.entries(source.accessoryConfigs ?? {}).map(([k, c]): [string, AccessoryConfig] => [
        k,
        { ...c, progressionPattern: [...c.progressionPattern] },
      ]),
    ),
    accessoryGroup: source.accessoryGroup
      ? ({ ...source.accessoryGroup, progressionPattern: [...source.accessoryGroup.progressionPattern] } as AccessoryGroupConfig)
      : (source.accessoryGroup ?? null),
  };
}
