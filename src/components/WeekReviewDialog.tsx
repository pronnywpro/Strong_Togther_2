import { useState } from "react";
import { generateNextWeek, rpeFlag } from "@/lib/progression";
import { targetText } from "@/lib/format";
import type { Block, Week } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function WeekReviewDialog({
  block,
  completedWeek,
  onClose,
  onSave,
}: {
  block: Block;
  completedWeek: Week;
  onClose: () => void;
  onSave: (nextWeek: Week) => void;
}) {
  const nextWeekNumber = completedWeek.weekNumber + 1;
  const existing = block.weeks.find((w) => w.weekNumber === nextWeekNumber);
  const [draft, setDraft] = useState<Week>(
    () => existing ?? generateNextWeek(block, completedWeek, nextWeekNumber),
  );

  const patchDraftSet = (wi: number, ei: number, si: number, patch: { weightMin?: number; repsMin?: number }) => {
    setDraft((d) => ({
      ...d,
      workouts: d.workouts.map((w, wi2) =>
        wi2 !== wi
          ? w
          : {
              ...w,
              exercises: w.exercises.map((ex, ei2) =>
                ei2 !== ei
                  ? ex
                  : {
                      ...ex,
                      sets: ex.sets.map((s, si2) =>
                        si2 !== si
                          ? s
                          : {
                              ...s,
                              weightMin: patch.weightMin ?? s.weightMin,
                              weightMax: patch.weightMin ?? s.weightMax,
                              repsMin: patch.repsMin ?? s.repsMin,
                              repsMax: patch.repsMin ?? s.repsMax,
                            },
                      ),
                    },
              ),
            },
      ),
    }));
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-[95vw] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            סקירת שבוע {completedWeek.weekNumber} ותכנון שבוע {nextWeekNumber}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {draft.workouts.map((wo, wi) => {
            const srcWo = completedWeek.workouts[wi];
            return (
              <div key={wo.id} className="rounded-xl border border-border p-3">
                <p className="mb-2 text-sm font-semibold">{wo.title}</p>
                <div className="space-y-3">
                  {wo.exercises.map((ex, ei) => {
                    const srcEx = srcWo?.exercises[ei];
                    const cfg = srcEx?.progressionId
                      ? (block.primaryConfigs?.[srcEx.progressionId] ?? block.secondaryConfigs?.[srcEx.progressionId] ?? null)
                      : null;
                    const expected = cfg?.expectedRpe[completedWeek.weekNumber - 1] ?? null;
                    const actualMax =
                      srcEx?.sets.reduce<number | null>(
                        (max, s) => (s.actualRpe != null ? Math.max(max ?? -Infinity, s.actualRpe) : max),
                        null,
                      ) ?? null;
                    const flag = rpeFlag(expected, actualMax);
                    return (
                      <div key={ex.id} className="rounded-lg border border-border p-2">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold">{ex.name}</p>
                          {flag === "above" && (
                            <Badge variant="destructive">
                              ⚠️ RPE {actualMax} גבוה מהצפוי ({expected})
                            </Badge>
                          )}
                          {flag === "below" && (
                            <Badge variant="outline">RPE {actualMax} נמוך מהצפוי ({expected})</Badge>
                          )}
                        </div>
                        <div className="space-y-2">
                          {ex.sets.map((s, si) => (
                            <div key={s.id} className="grid grid-cols-2 gap-2">
                              {s.hasWeight && (
                                <div className="space-y-1">
                                  <Label className="text-[10px] text-muted-foreground">משקל (ק"ג)</Label>
                                  <Input
                                    type="number"
                                    inputMode="decimal"
                                    className="font-mono"
                                    value={s.weightMin ?? ""}
                                    onChange={(e) =>
                                      patchDraftSet(wi, ei, si, {
                                        weightMin: e.target.value === "" ? undefined : Number(e.target.value),
                                      })
                                    }
                                  />
                                </div>
                              )}
                              {s.hasReps && (
                                <div className="space-y-1">
                                  <Label className="text-[10px] text-muted-foreground">חזרות</Label>
                                  <Input
                                    type="number"
                                    inputMode="decimal"
                                    className="font-mono"
                                    value={s.repsMin ?? ""}
                                    onChange={(e) =>
                                      patchDraftSet(wi, ei, si, {
                                        repsMin: e.target.value === "" ? undefined : Number(e.target.value),
                                      })
                                    }
                                  />
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                        {srcEx && (
                          <p className="mt-2 font-mono text-xs text-muted-foreground">
                            בפועל בשבוע {completedWeek.weekNumber}:{" "}
                            {srcEx.sets.map((s, i) => (
                              <span key={s.id}>
                                {i > 0 && " · "}
                                משקל {targetText(s, "weight")}→{s.actualWeight ?? "—"}, חזרות{" "}
                                {targetText(s, "reps")}→{s.actualReps ?? "—"}, RPE {s.actualRpe ?? "—"}
                              </span>
                            ))}
                          </p>
                        )}
                      </div>
                    );
                  })}
                  {wo.exercises.length === 0 && <p className="text-xs text-muted-foreground">אין תרגילים.</p>}
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            ביטול
          </Button>
          <Button onClick={() => onSave(draft)}>שמור שבוע {nextWeekNumber}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
