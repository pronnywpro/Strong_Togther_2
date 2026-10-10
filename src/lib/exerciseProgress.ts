import { bestSetPerformance, equivalentOneRepMax } from "./blockSummary";
import type { Block } from "./types";

/** One x-axis point: a training week. Each exercise name maps to that week's value (or is absent). */
export interface ProgressPoint {
  label: string;
  [exerciseName: string]: string | number | undefined;
}

/**
 * Weekly progress per exercise. Each week contributes one point per exercise: its best logged set,
 * expressed as a theoretical 1RM (the same measure the block summary uses). Weeks with nothing
 * logged for an exercise simply have no value for it, so the line shows a gap there.
 *
 * Blocks are ordered by creation time, and weeks by week number, so the x-axis runs continuously
 * across blocks.
 */
export function buildProgressSeries(blocks: Block[], exerciseNames: string[]): ProgressPoint[] {
  const wanted = new Set(exerciseNames);
  const ordered = [...blocks].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
  const points: ProgressPoint[] = [];

  for (const block of ordered) {
    const weeks = [...block.weeks].sort((a, b) => a.weekNumber - b.weekNumber);
    for (const week of weeks) {
      const point: ProgressPoint = { label: `${block.name} · ש${week.weekNumber}` };
      for (const workout of week.workouts) {
        for (const ex of workout.exercises) {
          if (!wanted.has(ex.name)) continue;
          const best = bestSetPerformance(ex);
          if (!best || best.weight == null || best.reps == null) continue;
          const value = Math.round(equivalentOneRepMax(best.weight, best.reps) * 10) / 10;
          // Keep the best value across workouts that share a week for the same exercise.
          const current = point[ex.name];
          if (typeof current !== "number" || value > current) point[ex.name] = value;
        }
      }
      points.push(point);
    }
  }
  return points;
}

/** Every exercise name a trainee has logged or planned across their blocks (for the picker). */
export function exerciseNamesIn(blocks: Block[]): string[] {
  const names = new Set<string>();
  for (const block of blocks) {
    for (const week of block.weeks) {
      for (const workout of week.workouts) {
        for (const ex of workout.exercises) names.add(ex.name);
      }
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}
