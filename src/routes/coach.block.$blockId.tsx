import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Check, Copy, Pencil, Plus, Send, Trash2, Rocket } from "lucide-react";
import { emptyExercise, newSet, uid, useStore } from "@/lib/store";
import { cloneWeek } from "@/lib/clone";
import { syncConfigArrayLengths, tierOf } from "@/lib/progression";
import { computeBlockSummaryRows } from "@/lib/blockSummary";
import { saveBlockSummary } from "@/lib/blockSummaries";
import { AppHeader } from "@/components/AppHeader";
import { ProgressionTable } from "@/components/ProgressionTable";
import { WeekReviewDialog } from "@/components/WeekReviewDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SetVideoPlayer } from "@/components/SetVideo";
import type { WorkoutSet } from "@/lib/types";
import { targetText } from "@/lib/format";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Block, ExerciseTier, Week, Workout } from "@/lib/types";
import { EXERCISE_CATEGORIES, useExerciseLibrary } from "@/lib/exerciseLibrary";

export const Route = createFileRoute("/coach/block/$blockId")({
  component: BlockPage,
});

function BlockPage() {
  const { blockId } = Route.useParams();
  const { state, deleteBlock: removeBlock, createBlock, user, updateBlock, notify, hydrated } = useStore();
  const navigate = useNavigate();
  const [editing, setEditing] = useState<{ week: number; workoutId: string } | null>(null);
  const [editBlockOpen, setEditBlockOpen] = useState(false);
  const [newFromWeek, setNewFromWeek] = useState<Week | null>(null);
  const [reviewingWeek, setReviewingWeek] = useState<Week | null>(null);
  const [tableOpen, setTableOpen] = useState(false);

  useEffect(() => {
    if (hydrated && !user) navigate({ to: "/" });
  }, [hydrated, user, navigate]);

  const block = state.blocks.find((b) => b.id === blockId);
  const trainee = state.users.find((u) => u.id === block?.traineeId);

  const editingWorkout = useMemo(() => {
    if (!block || !editing) return null;
    return (
      block.weeks.find((w) => w.weekNumber === editing.week)?.workouts.find((w) => w.id === editing.workoutId) ??
      null
    );
  }, [block, editing]);

  if (!hydrated) return <div className="min-h-screen bg-background" />;

  if (!block) {
    return (
      <div className="min-h-screen bg-background p-6 text-foreground">
        <p>הבלוק לא נמצא.</p>
        <Link to="/coach" className="text-primary underline">
          חזרה
        </Link>
      </div>
    );
  }

  const duplicateWeek = (week: Week) => {
    if (block.weeks.length >= block.totalWeeks) {
      toast.error("הגעת למספר השבועות של הבלוק");
      return;
    }
    const copy = cloneWeek(week, block.weeks.length + 1);
    updateBlock(block.id, (b) => ({ ...b, weeks: [...b.weeks, copy] }));
    toast.success(`שבוע ${copy.weekNumber} שוכפל — עדכן את השדות המסומנים באדום`);
  };

  const addWeek = () => {
    const next = block.weeks.length + 1;
    updateBlock(block.id, (b) => {
      const totalWeeks = Math.max(b.totalWeeks, next);
      const synced = syncConfigArrayLengths(b, totalWeeks);
      return {
        ...b,
        ...synced,
        totalWeeks,
        weeks: [...b.weeks, { weekNumber: next, published: false, reviewed: false, workouts: [] }],
      };
    });
    toast.success(`שבוע ${next} נוסף`);
  };

  const deleteWeek = (week: Week) => {
    if (!window.confirm(`למחוק את שבוע ${week.weekNumber}? הפעולה אינה הפיכה.`)) return;
    updateBlock(block.id, (b) => {
      const weeks = b.weeks
        .filter((w) => w.weekNumber !== week.weekNumber)
        .map((w, i) => ({ ...w, weekNumber: i + 1 }));
      const idx = week.weekNumber - 1;
      const splicePattern = <T,>(arr: T[]) => arr.filter((_, j) => j !== Math.max(0, idx - 1));
      const primaryConfigs = Object.fromEntries(
        Object.entries(b.primaryConfigs ?? {}).map(([k, c]) => [
          k,
          {
            ...c,
            expectedRpe: idx < c.expectedRpe.length ? c.expectedRpe.filter((_, j) => j !== idx) : c.expectedRpe,
            progressionPattern: splicePattern(c.progressionPattern),
          },
        ]),
      );
      const secondaryConfigs = Object.fromEntries(
        Object.entries(b.secondaryConfigs ?? {}).map(([k, c]) => [
          k,
          {
            ...c,
            expectedRpe: idx < c.expectedRpe.length ? c.expectedRpe.filter((_, j) => j !== idx) : c.expectedRpe,
            progressionPattern: splicePattern(c.progressionPattern),
          },
        ]),
      );
      const accessoryConfigs = Object.fromEntries(
        Object.entries(b.accessoryConfigs ?? {}).map(([k, c]) => [
          k,
          { ...c, progressionPattern: splicePattern(c.progressionPattern) },
        ]),
      );
      const accessoryGroup = b.accessoryGroup
        ? { ...b.accessoryGroup, progressionPattern: splicePattern(b.accessoryGroup.progressionPattern) }
        : b.accessoryGroup;
      return {
        ...b,
        weeks,
        primaryConfigs,
        secondaryConfigs,
        accessoryConfigs,
        accessoryGroup,
        currentWeek: Math.min(Math.max(b.currentWeek, 1), Math.max(weeks.length, 1)),
      };
    });
    toast.success("השבוע נמחק");
  };

  const publishWeek = (week: Week) => {
    updateBlock(block.id, (b) => ({
      ...b,
      currentWeek: week.weekNumber,
      weeks: b.weeks.map((w) => (w.weekNumber === week.weekNumber ? { ...w, published: true } : w)),
    }));
    notify("trainee", `שבוע ${week.weekNumber} בבלוק "${block.name}" נשלח אליך`, block.traineeId ?? undefined, block.coachId);
    toast.success(`שבוע ${week.weekNumber} נשלח ל${trainee?.name ?? "מתאמן"}`);
  };

  const markReviewed = (week: Week) => {
    updateBlock(block.id, (b) => ({
      ...b,
      weeks: b.weeks.map((w) => (w.weekNumber === week.weekNumber ? { ...w, reviewed: true } : w)),
    }));
    notify("trainee", `המאמן סקר את שבוע ${week.weekNumber}`, block.traineeId ?? undefined, block.coachId);
    toast.success("סומן כנסקר");
  };

  const saveWorkout = (weekNumber: number, workout: Workout) => {
    updateBlock(block.id, (b) => ({
      ...b,
      weeks: b.weeks.map((w) =>
        w.weekNumber === weekNumber
          ? { ...w, workouts: w.workouts.map((x) => (x.id === workout.id ? workout : x)) }
          : w,
      ),
    }));
    setEditing(null);
    toast.success("האימון נשמר");
  };

  const addWorkout = (weekNumber: number) => {
    updateBlock(block.id, (b) => ({
      ...b,
      weeks: b.weeks.map((w) =>
        w.weekNumber === weekNumber
          ? {
              ...w,
              workouts: [...w.workouts, { id: uid(), title: `אימון ${w.workouts.length + 1}`, exercises: [] }],
            }
          : w,
      ),
    }));
  };

  const deleteWorkout = (weekNumber: number, workout: Workout) => {
    if (!window.confirm(`למחוק את האימון "${workout.title}"?`)) return;
    updateBlock(block.id, (b) => ({
      ...b,
      weeks: b.weeks.map((w) =>
        w.weekNumber === weekNumber
          ? { ...w, workouts: w.workouts.filter((x) => x.id !== workout.id) }
          : w,
      ),
    }));
    toast.success("האימון נמחק");
  };

  const startNewBlockFrom = async (week: Week, name: string) => {
    const first = cloneWeek(week, 1);
    const newId = await createBlock({
      coachId: block.coachId,
      traineeId: block.traineeId,
      name,
      totalWeeks: block.totalWeeks,
      workoutsPerWeek: block.workoutsPerWeek,
      currentWeek: 1,
      weeks: [first],
    });
    if (!newId) {
      toast.error("יצירת הבלוק נכשלה");
      return;
    }
    setNewFromWeek(null);
    toast.success("בלוק חדש נוצר — עדכן משקלים בשדות האדומים");
    navigate({ to: "/coach/block/$blockId", params: { blockId: newId } });
  };

  const deleteBlock = () => {
    if (!window.confirm(`למחוק את הבלוק "${block.name}"? הפעולה אינה הפיכה.`)) return;
    void removeBlock(block.id);
    toast.success("הבלוק נמחק");
    navigate({ to: "/coach" });
  };

  const finishBlock = () => {
    if (!window.confirm(`לסיים את הבלוק "${block.name}"?`)) return;
    const completedAt = Date.now();
    const traineeId = block.traineeId;
    updateBlock(block.id, (b) => ({ ...b, completedAt }));
    notify("trainee", `הבלוק "${block.name}" הסתיים — כל הכבוד!`, traineeId ?? undefined, block.coachId);

    if (traineeId) {
      const otherBlocks = state.blocks.filter((b) => b.traineeId === traineeId && b.id !== block.id);
      const previousBlock = otherBlocks
        .filter((b): b is Block & { completedAt: number } => b.completedAt != null && b.completedAt < completedAt)
        .reduce<(Block & { completedAt: number }) | null>(
          (latest, b) => (!latest || b.completedAt > latest.completedAt ? b : latest),
          null,
        );
      const rows = computeBlockSummaryRows({ ...block, completedAt }, previousBlock, otherBlocks);
      void saveBlockSummary({
        blockId: block.id,
        coachId: block.coachId,
        traineeId,
        blockName: block.name,
        completedAt,
        rows,
      });
    }

    toast.success(traineeId ? "הבלוק הסתיים — הסיכום נשמר בהיסטוריה" : "הבלוק הסתיים");
  };

  const reopenBlock = () => {
    updateBlock(block.id, (b) => ({ ...b, completedAt: null }));
    toast.success("הבלוק נפתח מחדש");
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader subtitle={`בלוק: ${block.name} · ${trainee?.name ?? ""}`} />
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Link to="/coach" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowRight className="size-4" /> חזרה לרשימת המתאמנים
        </Link>
        <h1 className="mb-1 text-2xl font-bold sm:text-3xl">{block.name}</h1>
        <p className="mb-3 text-sm text-muted-foreground">
          {block.totalWeeks} שבועות · {block.workoutsPerWeek} אימונים בשבוע · שבוע נוכחי {block.currentWeek}
        </p>
        <div className="mb-6 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setEditBlockOpen(true)}>
            <Pencil className="size-4" /> ערוך בלוק
          </Button>
          <Button size="sm" variant="outline" onClick={() => setTableOpen(true)}>
            <Pencil className="size-4" /> פריימרי / סקנדרי / אקססורי
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={deleteBlock}
          >
            <Trash2 className="size-4" /> מחק בלוק
          </Button>
        </div>

        {!block.traineeId && (
          <p className="mb-4 rounded-xl border border-dashed border-border p-3 text-sm text-muted-foreground">
            בלוק ללא מתאמן משויך (תבנית) — אפשר לבנות את התוכנית במלואה, ולשייך מתאמן מאוחר יותר דרך "ערוך בלוק".
          </p>
        )}

        <div className="space-y-4">
          {block.weeks.map((week) => {
            const needsUpdate = week.workouts.some((w) =>
              w.exercises.some((e) => e.sets.some((s) => s.needsUpdate)),
            );
            const allDone = week.workouts.length > 0 && week.workouts.every((w) => w.completedAt);
            return (
              <section key={week.weekNumber} className="surface-card rounded-2xl p-4">
                <div className="mb-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                  <h2 className="truncate text-lg font-bold">
                    שבוע {week.weekNumber}{" "}
                    {allDone && <span className="text-success">✓ הושלם</span>}
                  </h2>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {!week.published && block.traineeId && (
                      <Button size="sm" onClick={() => publishWeek(week)}>
                        <Send className="size-4" /> שלח למתאמן
                      </Button>
                    )}
                    {allDone && !week.reviewed && (
                      <Button size="sm" variant="secondary" onClick={() => markReviewed(week)}>
                        <Check className="size-4" /> סיימתי לסקור
                      </Button>
                    )}
                    {allDone && (
                      <Button size="sm" variant="outline" onClick={() => setReviewingWeek(week)}>
                        <Rocket className="size-4" /> סקור ותכנן שבוע הבא
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => duplicateWeek(week)}>
                      <Copy className="size-4" /> הכפל שבוע
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setNewFromWeek(week)}>
                      <Rocket className="size-4" /> שכפל והתחל בלוק חדש
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => deleteWeek(week)}
                      aria-label={`מחק שבוע ${week.weekNumber}`}
                    >
                      <Trash2 className="size-4" /> מחק שבוע
                    </Button>
                  </div>
                </div>
                {needsUpdate && (
                  <p className="mb-3 text-sm text-destructive">שדות אדומים = חובה עדכון לפני שליחה</p>
                )}
                <div className="grid gap-3 md:grid-cols-2">
                  {week.workouts.map((wo) => {
                    const totalSets = wo.exercises.reduce((n, e) => n + e.sets.length, 0);
                    const needsUpdate = wo.exercises.some((e) => e.sets.some((s) => s.needsUpdate));
                    return (
                      <button
                        key={wo.id}
                        type="button"
                        onClick={() => setEditing({ week: week.weekNumber, workoutId: wo.id })}
                        className="lift rounded-xl border border-border p-3 text-right"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold">{wo.title}</p>
                          {wo.completedAt ? (
                            <Badge className="bg-success text-success-foreground">בוצע</Badge>
                          ) : needsUpdate ? (
                            <Badge variant="destructive">לעדכן</Badge>
                          ) : null}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {wo.exercises.length} תרגילים · {totalSets} סטים
                        </p>
                        {wo.exercises.some((e) => e.sets.some((s) => s.actualRpe != null || s.note || s.skipped)) && (
                          <p className="mt-1 text-xs text-warning">יש עדכוני מתאמן לצפייה</p>
                        )}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => addWorkout(week.weekNumber)}
                    className="grid place-items-center rounded-xl border border-dashed border-border p-3 text-sm text-muted-foreground transition hover:border-primary hover:text-foreground"
                  >
                    <Plus className="mb-1 size-4" /> הוסף אימון
                  </button>
                </div>
                {week.workouts.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {week.workouts.map((wo) => (
                      <Button
                        key={wo.id}
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => deleteWorkout(week.weekNumber, wo)}
                      >
                        <Trash2 className="size-3.5" /> מחק "{wo.title}"
                      </Button>
                    ))}
                  </div>
                )}
              </section>
            );
          })}

          {block.weeks.length < block.totalWeeks && (
            <Button variant="outline" onClick={addWeek} className="w-full">
              <Plus className="size-4" /> הוסף שבוע
            </Button>
          )}

          {!block.completedAt ? (
            <Button variant="secondary" className="w-full" onClick={finishBlock}>
              <Check className="size-4" /> סיים בלוק
            </Button>
          ) : (
            <Button variant="secondary" className="w-full" onClick={reopenBlock}>
              פתח בלוק מחדש
            </Button>
          )}
        </div>
      </main>

      {editing && editingWorkout && (
        <WorkoutEditor
          key={editingWorkout.id}
          workout={editingWorkout}
          traineeId={block.traineeId}
          onClose={() => setEditing(null)}
          onSave={(w) => saveWorkout(editing.week, w)}
        />
      )}

      {tableOpen && (
        <ProgressionTable
          block={block}
          onClose={() => setTableOpen(false)}
          onSave={(patch) => {
            updateBlock(block.id, (b) => ({
              ...b,
              primaryConfigs: patch.primaryConfigs,
              secondaryConfigs: patch.secondaryConfigs,
              accessoryConfigs: patch.accessoryConfigs,
              accessoryGroup: patch.accessoryGroup,
              weeks: b.weeks.map((w) => (w.weekNumber === patch.week1.weekNumber ? patch.week1 : w)),
            }));
            toast.success("ההגדרות נשמרו");
          }}
        />
      )}

      {reviewingWeek && (
        <WeekReviewDialog
          block={block}
          completedWeek={reviewingWeek}
          onClose={() => setReviewingWeek(null)}
          onSave={(nextWeek) => {
            updateBlock(block.id, (b) => {
              const exists = b.weeks.some((w) => w.weekNumber === nextWeek.weekNumber);
              return {
                ...b,
                totalWeeks: Math.max(b.totalWeeks, nextWeek.weekNumber),
                weeks: exists
                  ? b.weeks.map((w) => (w.weekNumber === nextWeek.weekNumber ? nextWeek : w))
                  : [...b.weeks, nextWeek],
              };
            });
            setReviewingWeek(null);
            toast.success(`שבוע ${nextWeek.weekNumber} נשמר`);
          }}
        />
      )}

      {editBlockOpen && (
        <BlockSettingsDialog
          block={block}
          trainees={state.users.filter((u) => u.role === "trainee" && u.coachId === user?.id)}
          onClose={() => setEditBlockOpen(false)}
          onSave={(patch) => {
            updateBlock(block.id, (b) => {
              const totalWeeks = patch.totalWeeks ?? b.totalWeeks;
              return { ...b, ...patch, ...syncConfigArrayLengths(b, totalWeeks) };
            });
            setEditBlockOpen(false);
            toast.success("הבלוק עודכן");
          }}
        />
      )}

      <Dialog open={!!newFromWeek} onOpenChange={(o) => !o && setNewFromWeek(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>בלוק חדש משבוע {newFromWeek?.weekNumber}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            ייווצר בלוק חדש שמתחיל משבוע {newFromWeek?.weekNumber} של הבלוק הנוכחי. שדות המשקל יסומנו לעדכון.
          </p>
          <NewBlockNameForm
            defaultName={`${block.name} — המשך`}
            onSubmit={(name) => newFromWeek && void startNewBlockFrom(newFromWeek, name)}
            onCancel={() => setNewFromWeek(null)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NewBlockNameForm({
  defaultName,
  onSubmit,
  onCancel,
}: {
  defaultName: string;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(defaultName);
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>שם הבלוק החדש</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <DialogFooter className="gap-2">
        <Button variant="outline" onClick={onCancel}>
          ביטול
        </Button>
        <Button onClick={() => name.trim() && onSubmit(name.trim())}>יצירה</Button>
      </DialogFooter>
    </div>
  );
}

function BlockSettingsDialog({
  block,
  trainees,
  onClose,
  onSave,
}: {
  block: Block;
  trainees: { id: string; name: string }[];
  onClose: () => void;
  onSave: (patch: Partial<Block>) => void;
}) {
  const [name, setName] = useState(block.name);
  const [totalWeeks, setTotalWeeks] = useState(String(block.totalWeeks));
  const [perWeek, setPerWeek] = useState(String(block.workoutsPerWeek));
  const [currentWeek, setCurrentWeek] = useState(String(block.currentWeek));
  const [traineeId, setTraineeId] = useState(block.traineeId ?? "none");

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>עריכת בלוק</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>שם הבלוק</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>מתאמן</Label>
            <Select value={traineeId} onValueChange={setTraineeId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">ללא מתאמן (תבנית)</SelectItem>
                {trainees.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>שבועות</Label>
              <Input type="number" min={1} value={totalWeeks} onChange={(e) => setTotalWeeks(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>אימונים/שבוע</Label>
              <Input type="number" min={1} value={perWeek} onChange={(e) => setPerWeek(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>שבוע נוכחי</Label>
              <Input type="number" min={1} value={currentWeek} onChange={(e) => setCurrentWeek(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            ביטול
          </Button>
          <Button
            onClick={() =>
              onSave({
                name: name.trim() || block.name,
                totalWeeks: Math.max(1, Number(totalWeeks) || block.totalWeeks),
                workoutsPerWeek: Math.max(1, Number(perWeek) || block.workoutsPerWeek),
                currentWeek: Math.max(1, Number(currentWeek) || block.currentWeek),
                traineeId: traineeId === "none" ? null : traineeId,
              })
            }
          >
            שמור
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const FIELDS = [
  { key: "weight", label: 'משקל (ק"ג)', has: "hasWeight", min: "weightMin", max: "weightMax" },
  { key: "reps", label: "חזרות", has: "hasReps", min: "repsMin", max: "repsMax" },
  { key: "rpe", label: "RPE (1-10)", has: "hasRpe", min: "rpeMin", max: "rpeMax" },
] as const;

type FieldMode = "range" | "single" | "off";

const MODES: { value: FieldMode; label: string }[] = [
  { value: "range", label: "טווח" },
  { value: "single", label: "ערך יחיד" },
  { value: "off", label: "לא רלוונטי" },
];

function SetEditorRow({
  set,
  index,
  traineeId,
  onPatch,
  onDuplicate,
  onDelete,
}: {
  set: WorkoutSet;
  index: number;
  traineeId: string | null;
  onPatch: (patch: Partial<WorkoutSet>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [modeOverride, setModeOverride] = useState<Record<string, FieldMode | undefined>>({});
  return (
    <div className="rounded-xl border border-border p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">סט {index + 1}</p>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={onDuplicate} aria-label="שכפל סט">
            <Copy className="size-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={onDelete} aria-label="מחק סט">
            <Trash2 className="size-4 text-destructive" />
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {FIELDS.map((f) => {
          const enabled = set[f.has];
          const min = set[f.min];
          const max = set[f.max];
          const derived: FieldMode = !enabled ? "off" : min === max ? "single" : "range";
          const override = modeOverride[f.key];
          const mode: FieldMode = !enabled ? "off" : (override && override !== "off" ? override : derived);
          const setMode = (m: FieldMode) => {
            setModeOverride((prev) => ({ ...prev, [f.key]: m }));
            if (m === "off") {
              onPatch({ [f.has]: false } as Partial<WorkoutSet>);
            } else if (m === "single") {
              const v = min ?? max ?? null;
              onPatch({ [f.has]: true, [f.min]: v, [f.max]: v, needsUpdate: false } as Partial<WorkoutSet>);
            } else {
              const v = min ?? max ?? null;
              onPatch({ [f.has]: true, [f.min]: v, [f.max]: v == null ? null : v } as Partial<WorkoutSet>);
            }
          };
          return (
            <div key={f.key} className="space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium">{f.label}</span>
                <div className="flex overflow-hidden rounded-lg border border-border">
                  {MODES.map((m) => (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => setMode(m.value)}
                      className={`px-2 py-1 text-[11px] transition-colors ${
                        mode === m.value
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
              {mode === "single" ? (
                <Input
                  type="number"
                  inputMode="decimal"
                  className={`font-mono ${set.needsUpdate ? "border-destructive text-destructive" : ""}`}
                  value={min ?? ""}
                  onChange={(e) => {
                    const v = e.target.value === "" ? null : Number(e.target.value);
                    onPatch({ [f.min]: v, [f.max]: v, needsUpdate: false } as Partial<WorkoutSet>);
                  }}
                />
              ) : mode === "range" ? (
                <div className="grid grid-cols-2 gap-2">
                  {([f.min, f.max] as const).map((k, idx) => (
                    <div key={k} className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">
                        {idx === 0 ? "מינימום" : "מקסימום"}
                      </Label>
                      <Input
                        type="number"
                        inputMode="decimal"
                        className={`font-mono ${set.needsUpdate ? "border-destructive text-destructive" : ""}`}
                        value={set[k] ?? ""}
                        onChange={(e) =>
                          onPatch({
                            [k]: e.target.value === "" ? null : Number(e.target.value),
                            needsUpdate: false,
                          } as Partial<WorkoutSet>)
                        }
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="font-mono text-muted-foreground">————</p>
              )}
            </div>
          );
        })}
      </div>

      {(set.skipped || set.actualReps != null || set.actualWeight != null || set.actualRpe != null || set.note || set.videoId) && (
        <div className="mt-3 rounded-lg bg-muted/50 p-2 text-xs">
          {set.skipped ? (
            <p className="text-destructive">המתאמן דילג: {set.skipReason}</p>
          ) : (
            <p className="font-mono text-warning">
              בפועל — משקל: {set.actualWeight ?? "—"} · חזרות: {set.actualReps ?? "—"} · RPE: {set.actualRpe ?? "—"}
            </p>
          )}
          {set.note && <p className="text-muted-foreground">"{set.note}"</p>}
          <SetVideoPlayer traineeId={traineeId} videoId={set.videoId} />
        </div>
      )}
    </div>
  );
}

function WorkoutEditor({
  workout,
  traineeId,
  onClose,
  onSave,
}: {
  workout: Workout;
  traineeId: string | null;
  onClose: () => void;
  onSave: (w: Workout) => void;
}) {
  if (workout.completedAt) return <CompletedWorkoutView workout={workout} traineeId={traineeId} onClose={onClose} />;
  return <WorkoutEditorInner workout={workout} traineeId={traineeId} onClose={onClose} onSave={onSave} />;
}

const TIER_BADGE_LABEL: Record<ExerciseTier, string> = { primary: "פריימרי", secondary: "סקנדרי", accessory: "אקססורי" };

function CompletedWorkoutView({
  workout,
  traineeId,
  onClose,
}: {
  workout: Workout;
  traineeId: string | null;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{workout.title} — בוצע ✓</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {workout.exercises.map((ex) => (
            <section
              key={ex.id}
              className={`rounded-xl border border-border p-3 ${ex.skipped ? "opacity-60" : ""}`}
            >
              <p className={`font-semibold ${ex.skipped ? "line-through" : ""}`}>{ex.name}</p>
              {ex.coachNotes && <p className="mt-1 text-xs text-warning">הערת מאמן: {ex.coachNotes}</p>}
              {ex.skipped && <p className="mt-1 text-xs text-destructive">המתאמן דילג: {ex.skipReason}</p>}
              <div className="mt-2 space-y-2">
                {ex.sets.map((s, i) => (
                  <div key={s.id} className="rounded-lg border border-border p-2 text-sm">
                    <p className="mb-1 text-xs font-semibold">סט {i + 1}</p>
                    {s.skipped ? (
                      <p className="text-destructive">דילוג: {s.skipReason}</p>
                    ) : (
                      <div className="grid gap-1 font-mono text-xs sm:grid-cols-3">
                        <p>
                          משקל: <span className="text-muted-foreground">{targetText(s, "weight")}</span> →{" "}
                          <span className="text-accent-foreground">{s.actualWeight ?? "—"}</span>
                        </p>
                        <p>
                          חזרות: <span className="text-muted-foreground">{targetText(s, "reps")}</span> →{" "}
                          <span className="text-accent-foreground">{s.actualReps ?? "—"}</span>
                        </p>
                        <p>
                          RPE: <span className="text-muted-foreground">{targetText(s, "rpe")}</span> →{" "}
                          <span className="text-accent-foreground">{s.actualRpe ?? "—"}</span>
                        </p>
                      </div>
                    )}
                    {s.note && <p className="mt-1 text-xs text-muted-foreground">"{s.note}"</p>}
                    <SetVideoPlayer traineeId={traineeId} videoId={s.videoId} />
                  </div>
                ))}
              </div>
            </section>
          ))}
          {workout.exercises.length === 0 && <p className="text-muted-foreground">אין תרגילים באימון זה.</p>}
        </div>
        <DialogFooter>
          <Button onClick={onClose}>סגור</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WorkoutEditorInner({
  workout,
  traineeId,
  onClose,
  onSave,
}: {
  workout: Workout;
  traineeId: string | null;
  onClose: () => void;
  onSave: (w: Workout) => void;
}) {
  const [draft, setDraft] = useState<Workout>(workout);
  const [newExercise, setNewExercise] = useState("");
  const [customExercise, setCustomExercise] = useState("");
  const { byCategory: libraryByCategory } = useExerciseLibrary();

  const update = (fn: (w: Workout) => Workout) => setDraft((d) => fn(d));

  if (workout.completedAt) return <CompletedWorkoutView workout={workout} traineeId={traineeId} onClose={onClose} />;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>בניית אימון</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>כותרת אימון</Label>
            <Input
              value={draft.title}
              placeholder="לדוגמה: רגליים"
              onChange={(e) => update((w) => ({ ...w, title: e.target.value }))}
            />
          </div>

          {draft.exercises.map((ex, exIdx) => (
            <div key={ex.id} className={`rounded-xl border border-border p-3 ${ex.skipped ? "opacity-50" : ""}`}>
              <div className="mb-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <p className={`truncate font-semibold ${ex.skipped ? "line-through" : ""}`}>
                    תרגיל {exIdx + 1}: {ex.name}
                  </p>
                  <Badge variant="outline" className="shrink-0">
                    {TIER_BADGE_LABEL[tierOf(ex, exIdx)]}
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="מחק תרגיל"
                  onClick={() => update((w) => ({ ...w, exercises: w.exercises.filter((e) => e.id !== ex.id) }))}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
              {ex.skipReason && <p className="mb-2 text-xs text-warning">המתאמן דילג: {ex.skipReason}</p>}

              <div className="mt-2 space-y-2">
                {ex.sets.map((s, i) => (
                  <SetEditorRow
                    key={s.id}
                    set={s}
                    index={i}
                    traineeId={traineeId}
                    onPatch={(patch) =>
                      update((w) => ({
                        ...w,
                        exercises: w.exercises.map((x) =>
                          x.id === ex.id
                            ? { ...x, sets: x.sets.map((y) => (y.id === s.id ? { ...y, ...patch } : y)) }
                            : x,
                        ),
                      }))
                    }
                    onDuplicate={() =>
                      update((w) => ({
                        ...w,
                        exercises: w.exercises.map((x) =>
                          x.id === ex.id
                            ? {
                                ...x,
                                sets: [
                                  ...x.sets,
                                  {
                                    ...s,
                                    id: uid(),
                                    actualReps: null,
                                    actualWeight: null,
                                    actualRpe: null,
                                    videoId: null,
                                    note: "",
                                    skipped: false,
                                    skipReason: "",
                                  },
                                ],
                              }
                            : x,
                        ),
                      }))
                    }
                    onDelete={() =>
                      update((w) => ({
                        ...w,
                        exercises: w.exercises.map((x) =>
                          x.id === ex.id ? { ...x, sets: x.sets.filter((y) => y.id !== s.id) } : x,
                        ),
                      }))
                    }
                  />
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    update((w) => ({
                      ...w,
                      exercises: w.exercises.map((x) => (x.id === ex.id ? { ...x, sets: [...x.sets, newSet()] } : x)),
                    }))
                  }
                >
                  <Plus className="size-4" /> הוסף סט
                </Button>
              </div>
            </div>
          ))}

          <div className="space-y-2">
            <Label>הוסף תרגיל</Label>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-1">
                <p className="text-[11px] font-medium text-muted-foreground">מהמאגר</p>
                <Select
                  value={newExercise}
                  onValueChange={(v) => {
                    setNewExercise(v);
                    setCustomExercise("");
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="בחרו תרגיל לפי קטגוריה" />
                  </SelectTrigger>
                  <SelectContent className="min-w-[22rem]">
                    {EXERCISE_CATEGORIES.map((cat, i) => {
                      const items = libraryByCategory[cat] ?? [];
                      if (items.length === 0) return null;
                      return (
                        <SelectGroup key={cat}>
                          {i > 0 && <SelectSeparator />}
                          <SelectLabel className="sticky top-0 z-10 -mx-1 bg-popover/95 px-3 text-[11px] font-semibold uppercase tracking-wide text-primary backdrop-blur">
                            {cat}
                          </SelectLabel>
                          {items.map((ex) => (
                            <SelectItem key={ex.id} value={ex.name}>
                              {ex.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 space-y-1">
                <p className="text-[11px] font-medium text-muted-foreground">או תרגיל מותאם אישית</p>
                <Input
                  placeholder="הקלידו שם תרגיל"
                  value={customExercise}
                  onChange={(e) => {
                    setCustomExercise(e.target.value);
                    setNewExercise(e.target.value);
                  }}
                />
              </div>
              <Button
                variant="outline"
                disabled={!newExercise}
                onClick={() => {
                  update((w) => {
                    const idx = w.exercises.length;
                    const tier: ExerciseTier = idx === 0 ? "primary" : idx === 1 ? "secondary" : "accessory";
                    const ex = { ...emptyExercise(newExercise), tier, progressionId: uid() };
                    return { ...w, exercises: [...w.exercises, ex] };
                  });
                  setNewExercise("");
                  setCustomExercise("");
                }}
              >
                <Plus className="size-4" /> הוסף
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            ביטול
          </Button>
          <Button onClick={() => onSave(draft)}>שמור אימון</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
