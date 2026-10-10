import { useState } from "react";
import { uid } from "@/lib/store";
import { tierOf } from "@/lib/progression";
import {
  AccessoryExceptionEditor,
  AccessoryGroupEditor,
  PrimaryLikeConfigEditor,
  emptyAccessoryConfig,
  emptyAccessoryGroup,
  emptyPrimaryConfig,
} from "@/components/ProgressionConfigEditor";
import type {
  AccessoryConfig,
  AccessoryGroupConfig,
  Block,
  Exercise,
  ExerciseTier,
  PrimaryConfig,
  Week,
  Workout,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const TIER_LABEL: Record<ExerciseTier, string> = { primary: "פריימרי", secondary: "סקנדרי", accessory: "אקססורי" };
const TIERS: ExerciseTier[] = ["primary", "secondary", "accessory"];

export interface ProgressionTablePatch {
  week1: Week;
  primaryConfigs: Record<string, PrimaryConfig>;
  secondaryConfigs: Record<string, PrimaryConfig>;
  accessoryConfigs: Record<string, AccessoryConfig>;
  accessoryGroup: AccessoryGroupConfig | null;
}

export function ProgressionTable({
  block,
  onClose,
  onSave,
}: {
  block: Block;
  onClose: () => void;
  onSave: (patch: ProgressionTablePatch) => void;
}) {
  const week1 = block.weeks.find((w) => w.weekNumber === 1) ?? block.weeks[0] ?? null;
  const [workouts, setWorkouts] = useState<Workout[]>(week1?.workouts ?? []);
  const [primaryConfigs, setPrimaryConfigs] = useState<Record<string, PrimaryConfig>>(block.primaryConfigs ?? {});
  const [secondaryConfigs, setSecondaryConfigs] = useState<Record<string, PrimaryConfig>>(block.secondaryConfigs ?? {});
  const [accessoryConfigs, setAccessoryConfigs] = useState<Record<string, AccessoryConfig>>(block.accessoryConfigs ?? {});
  const [accessoryGroup, setAccessoryGroup] = useState<AccessoryGroupConfig | null>(block.accessoryGroup ?? null);
  const [selected, setSelected] = useState<{ workoutId: string; exerciseId: string } | null>(null);

  if (!week1) {
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>פריימרי / סקנדרי / אקססורי</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">אין עדיין שבוע 1 בבלוק הזה.</p>
          <DialogFooter>
            <Button onClick={onClose}>סגור</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  const selectExercise = (workoutId: string, exerciseId: string) => {
    setWorkouts((ws) =>
      ws.map((w) =>
        w.id !== workoutId
          ? w
          : {
              ...w,
              exercises: w.exercises.map((e) => (e.id === exerciseId && !e.progressionId ? { ...e, progressionId: uid() } : e)),
            },
      ),
    );
    setSelected({ workoutId, exerciseId });
  };

  const setExerciseTier = (workoutId: string, exerciseId: string, tier: ExerciseTier) => {
    setWorkouts((ws) =>
      ws.map((w) =>
        w.id !== workoutId
          ? w
          : { ...w, exercises: w.exercises.map((e) => (e.id === exerciseId ? { ...e, tier } : e)) },
      ),
    );
  };

  const selectedWorkout = selected ? workouts.find((w) => w.id === selected.workoutId) : undefined;
  const selectedIdx = selected ? (selectedWorkout?.exercises.findIndex((e) => e.id === selected.exerciseId) ?? -1) : -1;
  const selectedEx: Exercise | undefined = selectedIdx >= 0 ? selectedWorkout?.exercises[selectedIdx] : undefined;
  const selectedTier = selectedEx && selectedIdx >= 0 ? tierOf(selectedEx, selectedIdx) : null;

  const patchPrimaryLike = (tier: "primary" | "secondary", ex: Exercise, patch: Partial<PrimaryConfig>) => {
    const pid = ex.progressionId;
    if (!pid) return;
    const configs = tier === "primary" ? primaryConfigs : secondaryConfigs;
    const setter = tier === "primary" ? setPrimaryConfigs : setSecondaryConfigs;
    const current = configs[pid] ?? emptyPrimaryConfig(pid, ex.name, block.totalWeeks);
    setter({ ...configs, [pid]: { ...current, ...patch } });
  };

  const patchAccessoryException = (ex: Exercise, patch: Partial<AccessoryConfig>) => {
    const pid = ex.progressionId;
    if (!pid) return;
    const current = accessoryConfigs[pid] ?? emptyAccessoryConfig(pid, ex.name, block.totalWeeks);
    setAccessoryConfigs({ ...accessoryConfigs, [pid]: { ...current, ...patch } });
  };

  const makeException = (ex: Exercise) => {
    const pid = ex.progressionId;
    if (!pid) return;
    const seed: AccessoryConfig = accessoryGroup
      ? { ...emptyAccessoryConfig(pid, ex.name, block.totalWeeks), kind: accessoryGroup.kind, progressionPattern: [...accessoryGroup.progressionPattern] }
      : emptyAccessoryConfig(pid, ex.name, block.totalWeeks);
    setAccessoryConfigs({ ...accessoryConfigs, [pid]: seed });
  };

  const removeException = (ex: Exercise) => {
    const pid = ex.progressionId;
    if (!pid) return;
    const next = { ...accessoryConfigs };
    delete next[pid];
    setAccessoryConfigs(next);
  };

  const save = () => {
    onSave({ week1: { ...week1, workouts }, primaryConfigs, secondaryConfigs, accessoryConfigs, accessoryGroup });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-[95vw] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>פריימרי / סקנדרי / אקססורי — שבוע 1</DialogTitle>
        </DialogHeader>
        <p className="-mt-2 text-xs text-muted-foreground">
          קובע איך שבוע 1 מסווג לתרגילי פריימרי/סקנדרי/אקססורי ואיך כל אחד מתקדם. שבועות 2 ואילך נבנים אוטומטית לפי החוקים.
        </p>

        <div className="rounded-xl border border-border p-3">
          <p className="mb-2 text-sm font-semibold">חוק משותף לכל האקססוריז</p>
          <AccessoryGroupEditor
            config={accessoryGroup ?? emptyAccessoryGroup(block.totalWeeks)}
            onChange={(patch) => setAccessoryGroup({ ...(accessoryGroup ?? emptyAccessoryGroup(block.totalWeeks)), ...patch })}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="p-2 text-right text-xs text-muted-foreground">אימון</th>
                {TIERS.map((t) => (
                  <th key={t} className="p-2 text-right text-xs text-muted-foreground">
                    {TIER_LABEL[t]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {workouts.map((w) => (
                <tr key={w.id} className="border-t border-border align-top">
                  <td className="p-2 font-semibold">{w.title}</td>
                  {TIERS.map((tier) => (
                    <td key={tier} className="p-2">
                      <div className="flex flex-col gap-1">
                        {w.exercises
                          .map((ex, idx) => ({ ex, exTier: tierOf(ex, idx) }))
                          .filter((x) => x.exTier === tier)
                          .map(({ ex }) => (
                            <button
                              key={ex.id}
                              type="button"
                              onClick={() => selectExercise(w.id, ex.id)}
                              className={`rounded-lg border px-2 py-1 text-right text-xs transition ${
                                selected?.exerciseId === ex.id
                                  ? "border-primary bg-accent"
                                  : "border-border hover:bg-muted"
                              }`}
                            >
                              {ex.name}
                            </button>
                          ))}
                        {w.exercises.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {selectedEx && selectedTier && (
          <div className="rounded-xl border border-border p-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">{selectedEx.name}</p>
              <div className="flex gap-1">
                {TIERS.map((t) => (
                  <Button
                    key={t}
                    size="sm"
                    variant={selectedTier === t ? "default" : "outline"}
                    onClick={() => setExerciseTier(selectedWorkout!.id, selectedEx.id, t)}
                  >
                    {TIER_LABEL[t]}
                  </Button>
                ))}
              </div>
            </div>

            {(selectedTier === "primary" || selectedTier === "secondary") && (
              <PrimaryLikeConfigEditor
                config={
                  (selectedTier === "primary" ? primaryConfigs : secondaryConfigs)[selectedEx.progressionId ?? ""] ??
                  emptyPrimaryConfig(selectedEx.progressionId ?? uid(), selectedEx.name, block.totalWeeks)
                }
                totalWeeks={block.totalWeeks}
                onChange={(patch) => patchPrimaryLike(selectedTier, selectedEx, patch)}
              />
            )}

            {selectedTier === "accessory" &&
              (accessoryConfigs[selectedEx.progressionId ?? ""] ? (
                <div className="space-y-2">
                  <AccessoryExceptionEditor
                    config={accessoryConfigs[selectedEx.progressionId ?? ""]}
                    onChange={(patch) => patchAccessoryException(selectedEx, patch)}
                  />
                  <Button size="sm" variant="ghost" onClick={() => removeException(selectedEx)}>
                    חזור לחוק המשותף
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">מונחה כרגע לפי החוק המשותף לאקססוריז.</p>
                  <Button size="sm" variant="outline" onClick={() => makeException(selectedEx)}>
                    יוצא מהכלל — קבע חוק אישי
                  </Button>
                </div>
              ))}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            ביטול
          </Button>
          <Button onClick={save}>שמור</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
