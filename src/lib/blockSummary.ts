import { theoreticalPercent } from "./progression";
import type { Block, BlockSummaryRow, Exercise, PerformanceSnapshot, Week } from "./types";

const SIX_MONTHS_MS = 1000 * 60 * 60 * 24 * 30 * 6;

/** Theoretical 1RM-equivalent for a logged weight × reps performance (spec §7). Reuses the same
 * rep-multiplier table already driving progression planning (theoreticalPercent) — the spec's
 * 1.00/0.95/0.925/... table is exactly that formula expressed as a fraction instead of a percent. */
export function equivalentOneRepMax(weight: number, reps: number): number {
  const pct = theoreticalPercent(reps);
  if (pct <= 0) return 0;
  return weight / (pct / 100);
}

/** One set's performance, preferring what the trainee actually logged and falling back to the
 * planned value (mirrors the actual??planned convention used elsewhere, e.g. clone.ts). */
function setSnapshot(s: {
  hasWeight: boolean;
  hasReps: boolean;
  weightMin: number | null;
  repsMin: number | null;
  actualWeight?: number | null;
  actualReps?: number | null;
  actualRpe?: number | null;
  rpeMin: number | null;
}): PerformanceSnapshot {
  return {
    weight: s.hasWeight ? (s.actualWeight ?? s.weightMin ?? null) : null,
    reps: s.hasReps ? (s.actualReps ?? s.repsMin ?? null) : null,
    rpe: s.actualRpe ?? s.rpeMin ?? null,
  };
}

/**
 * The exercise's single representative performance: the set with the highest theoretical
 * 1RM-equivalent (spec §12 — "best", by 1RM-equivalent, not simply heaviest weight). Skipped
 * exercises, or ones with no weight/reps tracked at all, have no usable performance.
 */
export function bestSetPerformance(ex: Exercise): PerformanceSnapshot | null {
  if (ex.skipped) return null;
  let best: PerformanceSnapshot | null = null;
  let bestEq = -Infinity;
  for (const s of ex.sets) {
    if (s.skipped) continue;
    const snap = setSnapshot(s);
    if (snap.weight == null || snap.reps == null) continue;
    const eq = equivalentOneRepMax(snap.weight, snap.reps);
    if (eq > bestEq) {
      bestEq = eq;
      best = snap;
    }
  }
  return best;
}

function lastWeek(block: Pick<Block, "weeks">): Week | null {
  if (block.weeks.length === 0) return null;
  return block.weeks.reduce((a, b) => (b.weekNumber > a.weekNumber ? b : a));
}

/** Exercise name -> best-set performance from a block's final week (spec §5: "final completed
 * performance of each block"). Last exercise with a given name wins on rare in-block name repeats. */
export function finalWeekPerformances(block: Pick<Block, "weeks">): Map<string, PerformanceSnapshot> {
  const out = new Map<string, PerformanceSnapshot>();
  const week = lastWeek(block);
  if (!week) return out;
  for (const wo of week.workouts) {
    for (const ex of wo.exercises) {
      const perf = bestSetPerformance(ex);
      if (perf) out.set(ex.name, perf);
    }
  }
  return out;
}

/**
 * Exercise name -> best matching performance across every workout (in any of `blocks`, excluding
 * `excludeBlockId`) completed within [windowStart, windowEnd) (spec §12 — best-of-window, not the
 * performance from exactly N months ago). windowEnd is normally the block-being-summarized's own
 * completedAt, so this is frozen relative to that moment, not to "now".
 */
export function windowBestPerformances(
  blocks: Pick<Block, "id" | "weeks">[],
  excludeBlockId: string,
  windowStart: number,
  windowEnd: number,
): Map<string, PerformanceSnapshot> {
  const bestEq = new Map<string, number>();
  const out = new Map<string, PerformanceSnapshot>();
  for (const block of blocks) {
    if (block.id === excludeBlockId) continue;
    for (const week of block.weeks) {
      for (const wo of week.workouts) {
        if (!wo.completedAt || wo.completedAt < windowStart || wo.completedAt >= windowEnd) continue;
        for (const ex of wo.exercises) {
          const perf = bestSetPerformance(ex);
          if (!perf || perf.weight == null || perf.reps == null) continue;
          const eq = equivalentOneRepMax(perf.weight, perf.reps);
          if (eq > (bestEq.get(ex.name) ?? -Infinity)) {
            bestEq.set(ex.name, eq);
            out.set(ex.name, perf);
          }
        }
      }
    }
  }
  return out;
}

/** Percent change between two performances' theoretical-1RM-equivalents (spec §7/§11). Null when
 * either side has no weight/reps to compare (e.g. a pure bodyweight/hold exercise). */
function progressPercent(current: PerformanceSnapshot, reference: PerformanceSnapshot): number | null {
  if (current.weight == null || current.reps == null || reference.weight == null || reference.reps == null) {
    return null;
  }
  const curEq = equivalentOneRepMax(current.weight, current.reps);
  const refEq = equivalentOneRepMax(reference.weight, reference.reps);
  if (refEq <= 0) return null;
  return Math.round(((curEq / refEq - 1) * 100 + Number.EPSILON) * 10) / 10;
}

/**
 * Builds the frozen Block Summary rows for `currentBlock` at the moment it's completed. `history`
 * should include every other block belonging to the same trainee (previous block + everything
 * else, so the 6-month scan has enough to search) — the current block is excluded from its own
 * 6-month window automatically.
 */
export function computeBlockSummaryRows(
  currentBlock: Pick<Block, "id" | "weeks" | "completedAt">,
  previousBlock: Pick<Block, "weeks"> | null,
  history: Pick<Block, "id" | "weeks">[],
): BlockSummaryRow[] {
  const current = finalWeekPerformances(currentBlock);
  const previous = previousBlock ? finalWeekPerformances(previousBlock) : new Map<string, PerformanceSnapshot>();
  const windowEnd = currentBlock.completedAt ?? Date.now();
  const sixMonth = windowBestPerformances(history, currentBlock.id, windowEnd - SIX_MONTHS_MS, windowEnd);

  const rows: BlockSummaryRow[] = [];
  for (const [name, currentPerf] of current) {
    const prevPerf = previous.get(name) ?? null;
    const sixMonthPerf = sixMonth.get(name) ?? null;
    rows.push({
      exerciseName: name,
      previous: prevPerf,
      current: currentPerf,
      sixMonth: sixMonthPerf,
      progressVsPrevious: prevPerf ? progressPercent(currentPerf, prevPerf) : null,
      progressVsSixMonth: sixMonthPerf ? progressPercent(currentPerf, sixMonthPerf) : null,
    });
  }
  return rows;
}

/** "150 × 5 @ 7" — the single compact performance string used throughout the summary (spec §4). */
export function formatPerformance(p: PerformanceSnapshot | null): string {
  if (!p) return "—";
  const parts: string[] = [];
  if (p.weight != null) parts.push(`${p.weight}`);
  if (p.reps != null) parts.push(`× ${p.reps}`);
  const base = parts.length ? parts.join(" ") : "—";
  return p.rpe != null ? `${base} @ ${p.rpe}` : base;
}
