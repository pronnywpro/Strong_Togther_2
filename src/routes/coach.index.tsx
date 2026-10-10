import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Activity, CheckCircle2, Copy, History, Plus, Trash2, User, UserPlus, Users, Layers } from "lucide-react";
import { useStore, uid } from "@/lib/store";
import { cloneBlock } from "@/lib/clone";
import { coachRemoveTrainee } from "@/lib/admin-actions";
import { AppHeader } from "@/components/AppHeader";
import { EmptyState, ProgressBar, StatCard } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { User as AppUser, Week } from "@/lib/types";

export const Route = createFileRoute("/coach/")({
  component: CoachHome,
});

function CoachHome() {
  const { state, createBlock, createGroup, user, hydrated, createInviteCode, coachApp, refresh } = useStore();
  const navigate = useNavigate();
  const [toRemove, setToRemove] = useState<AppUser | null>(null);
  const [open, setOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [name, setName] = useState("");
  const [weeks, setWeeks] = useState("4");
  const [perWeek, setPerWeek] = useState("3");
  const [traineeId, setTraineeId] = useState("");
  const [sourceBlockId, setSourceBlockId] = useState("none");
  const [groupOpen, setGroupOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const goStat = (metric: "trainees" | "blocks" | "workouts" | "completion") =>
    navigate({ to: "/coach/stats/$metric", params: { metric } });

  useEffect(() => {
    if (!hydrated) return;
    if (!user) navigate({ to: "/" });
    else if (user.role !== "coach") navigate({ to: "/trainee" });
    else if (coachApp?.status !== "approved") navigate({ to: "/coach/apply" });
  }, [hydrated, user, coachApp, navigate]);

  if (!user || user.role !== "coach" || coachApp?.status !== "approved") return null;

  const confirmRemove = async () => {
    if (!toRemove) return;
    const res = await coachRemoveTrainee(toRemove.id);
    if (!res.ok) {
      toast.error("ההסרה נכשלה");
    } else {
      await refresh();
      toast.success("המתאמן הוסר");
    }
    setToRemove(null);
  };

  const trainees = state.users.filter((u) => u.role === "trainee" && u.coachId === user.id);
  // RLS lets an admin read every coach's blocks, so scope this dashboard to the coach's own.
  const coachBlocks = state.blocks.filter((b) => b.coachId === user.id);

  const createGroupNow = async () => {
    const trimmed = groupName.trim();
    if (!trimmed) {
      toast.error("יש להזין שם לקבוצה");
      return;
    }
    const groupId = await createGroup(trimmed);
    if (!groupId) {
      toast.error("יצירת הקבוצה נכשלה");
      return;
    }
    setGroupOpen(false);
    setGroupName("");
    toast.success("הקבוצה נוצרה");
    navigate({ to: "/coach/group/$groupId", params: { groupId } });
  };

  const allWorkouts = coachBlocks.flatMap((b) =>
    b.weeks
      .filter((w) => w.weekNumber === b.currentWeek)
      .flatMap((w) => w.workouts.map((wo) => ({ workout: wo, block: b, week: w }))),
  );
  const completedWorkouts = allWorkouts.filter((x) => x.workout.completedAt).length;
  const completionRate = allWorkouts.length
    ? Math.round((completedWorkouts / allWorkouts.length) * 100)
    : 0;

  const openInvite = async () => {
    setInviteOpen(true);
    setInviteCode("");
    const code = await createInviteCode();
    if (!code) {
      toast.error("יצירת הקוד נכשלה");
      return;
    }
    setInviteCode(code);
  };

  const create = async () => {
    const w = Number(weeks);
    const p = Number(perWeek);
    if (!name.trim() || w < 1 || p < 1) {
      toast.error("יש למלא שם בלוק, מספר שבועות ואימונים בשבוע");
      return;
    }
    const source = coachBlocks.find((b) => b.id === sourceBlockId);
    const cloned = source ? cloneBlock(source) : null;
    const week: Week = {
      weekNumber: 1,
      published: false,
      workouts: Array.from({ length: p }, (_, i) => ({
        id: uid(),
        title: `אימון ${i + 1}`,
        exercises: [],
      })),
    };
    const blockId = await createBlock({
      coachId: user.id,
      traineeId: traineeId || null,
      name: name.trim(),
      totalWeeks: cloned ? source!.totalWeeks : w,
      workoutsPerWeek: cloned ? source!.workoutsPerWeek : p,
      currentWeek: 1,
      weeks: cloned ? cloned.weeks : [week],
      primaryConfigs: cloned?.primaryConfigs ?? {},
      secondaryConfigs: cloned?.secondaryConfigs ?? {},
      accessoryConfigs: cloned?.accessoryConfigs ?? {},
      accessoryGroup: cloned?.accessoryGroup ?? null,
    });
    if (!blockId) {
      toast.error("יצירת הבלוק נכשלה");
      return;
    }
    setOpen(false);
    setName("");
    setSourceBlockId("none");
    toast.success(cloned ? `הבלוק נוצר כעותק של "${source!.name}"` : "הבלוק נוצר");
    navigate({ to: "/coach/block/$blockId", params: { blockId } });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader subtitle={`מאמן · ${user.name}`} />
      <main className="mx-auto max-w-5xl px-4 py-6 pb-16">
        <div className="mb-5 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-widest text-primary uppercase">לוח מאמן</p>
            <h1 className="truncate text-2xl font-bold sm:text-3xl">שלום, {user.name}</h1>
          </div>
          <div className="flex items-center gap-2">
          <Button variant="outline" className="min-h-11" onClick={() => void openInvite()}>
            <UserPlus className="size-4" /> הזמן מתאמן
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="min-h-11">
                <Plus className="size-4" /> בלוק חדש
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>בלוק חדש</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>מתאמן (אופציונלי)</Label>
                  <Select value={traineeId} onValueChange={setTraineeId}>
                    <SelectTrigger>
                      <SelectValue placeholder="ללא מתאמן (תבנית)" />
                    </SelectTrigger>
                    <SelectContent>
                      {trainees.map((t) => (
                        <SelectItem key={t.id} value={String(t.id)}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    אפשר להשאיר ריק וליצור בלוק כתבנית ללא מתאמן, ולשייך מאוחר יותר מתוך "ערוך בלוק".
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>שם הבלוק</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="לדוגמה: הכנה לקיץ" />
                </div>
                <div className="space-y-2">
                  <Label>התחל מבלוק קיים (שכפול מלא, אופציונלי)</Label>
                  <Select value={sourceBlockId} onValueChange={setSourceBlockId}>
                    <SelectTrigger>
                      <SelectValue placeholder="התחל מאפס" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">התחל מאפס</SelectItem>
                      {coachBlocks
                        .filter((b) => !traineeId || b.traineeId === traineeId || !b.traineeId)
                        .map((b) => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.name} · שבוע {b.weeks.length}
                            {!b.traineeId && " (תבנית)"}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    כל שבועות הבלוק המקורי (כולל הגדרות התקדמות) יועתקו לבלוק חדש. הבלוק המקורי לא ישתנה.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>מספר שבועות</Label>
                    <Input type="number" min={1} value={weeks} onChange={(e) => setWeeks(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>אימונים בשבוע</Label>
                    <Input type="number" min={1} value={perWeek} onChange={(e) => setPerWeek(e.target.value)} />
                  </div>
                </div>
              </div>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setOpen(false)}>
                  ביטול
                </Button>
                <Button onClick={() => void create()}>המשך</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          </div>
        </div>

        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>קוד הזמנה למתאמן</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              שלח את הקוד למתאמן. לאחר שייכנס לאפליקציה ויזין אותו, הוא יתחבר אליך אוטומטית.
            </p>
            <div className="surface-card rounded-2xl p-5 text-center">
              <span dir="ltr" className="text-3xl font-bold tracking-[0.3em] text-primary">
                {inviteCode || "······"}
              </span>
            </div>
            <DialogFooter>
              <Button
                className="w-full"
                disabled={!inviteCode}
                onClick={() => {
                  void navigator.clipboard.writeText(inviteCode);
                  toast.success("הקוד הועתק");
                }}
              >
                <Copy className="size-4" /> העתק קוד
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            icon={Users}
            label="מתאמנים פעילים"
            value={trainees.length}
            index={0}
            onClick={() => goStat("trainees")}
          />
          <StatCard
            icon={Layers}
            label="בלוקים פעילים"
            value={coachBlocks.length}
            tone="neutral"
            index={1}
            onClick={() => goStat("blocks")}
          />
          <StatCard
            icon={Activity}
            label="אימונים השבוע"
            value={allWorkouts.length}
            tone="warning"
            index={2}
            onClick={() => goStat("workouts")}
          />
          <StatCard
            icon={CheckCircle2}
            label="אחוז השלמה"
            value={`${completionRate}%`}
            hint={`${completedWorkouts} מתוך ${allWorkouts.length}`}
            trend={completionRate >= 50 ? "up" : "down"}
            tone="success"
            index={3}
            onClick={() => goStat("completion")}
          />
        </div>

        <h2 className="mb-3 text-lg font-bold">ניהול מתאמנים</h2>
        <div className="mb-6 grid gap-2 sm:grid-cols-2">
          {trainees.map((t) => (
            <div key={t.id} className="surface-card flex items-center justify-between gap-3 rounded-2xl p-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">{t.name}</p>
                <p dir="ltr" className="truncate text-right text-xs text-muted-foreground">
                  {t.email}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button size="sm" variant="outline" asChild>
                  <Link to="/coach/trainee/$traineeId" params={{ traineeId: t.id }}>
                    <History className="size-4" /> היסטוריית בלוקים
                  </Link>
                </Button>
                <Button size="sm" variant="outline" onClick={() => setToRemove(t)}>
                  <Trash2 className="size-4" /> הסרה
                </Button>
              </div>
            </div>
          ))}
          {trainees.length === 0 && (
            <p className="text-sm text-muted-foreground">אין מתאמנים מחוברים. שלח קוד הזמנה כדי להוסיף.</p>
          )}
        </div>

        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold">קבוצות</h2>
          <Button size="sm" variant="outline" onClick={() => setGroupOpen(true)}>
            <Plus className="size-4" /> קבוצה חדשה
          </Button>
        </div>
        <div className="mb-6 grid gap-2 sm:grid-cols-2">
          {state.groups.map((g) => (
            <Link
              key={g.id}
              to="/coach/group/$groupId"
              params={{ groupId: g.id }}
              className="surface-card lift flex items-center gap-3 rounded-2xl p-3"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                <Users className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate font-semibold">{g.name}</p>
                <p className="text-xs text-muted-foreground">{g.memberIds.length} מתאמנים</p>
              </div>
            </Link>
          ))}
          {state.groups.length === 0 && (
            <p className="text-sm text-muted-foreground">
              אין קבוצות עדיין. צור קבוצה והוסף אליה מתאמנים כדי לשלוח להם בלוק משותף בלחיצה אחת.
            </p>
          )}
        </div>

        <Dialog open={groupOpen} onOpenChange={setGroupOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>קבוצה חדשה</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <Label>שם הקבוצה</Label>
              <Input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="לדוגמה: קבוצת ערב"
              />
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setGroupOpen(false)}>
                ביטול
              </Button>
              <Button onClick={() => void createGroupNow()}>יצירה</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <h2 className="mb-3 text-lg font-bold">הבלוקים שלי</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {coachBlocks.map((b) => {
            const trainee = state.users.find((u) => u.id === b.traineeId);
            const weekProgress = (b.currentWeek / Math.max(1, b.totalWeeks)) * 100;
            return (
              <Link
                key={b.id}
                to="/coach/block/$blockId"
                params={{ blockId: b.id }}
                className="surface-card lift animate-fade-up rounded-2xl p-4"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                    <User className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold">
                      {b.traineeId ? (trainee?.name ?? "מתאמן") : "ללא מתאמן (תבנית)"}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      בלוק "{b.name}" · שבוע {b.currentWeek}/{b.totalWeeks}
                    </p>
                  </div>
                </div>
                <ProgressBar value={weekProgress} className="mt-4" />
              </Link>
            );
          })}
          {coachBlocks.length === 0 && (
            <EmptyState
              icon={Layers}
              title="אין עדיין בלוקים"
              description="צור בלוק אימונים ראשון כדי להתחיל לתכנן שבועות ולעקוב אחרי המתאמנים שלך."
              action={
                <Button onClick={() => setOpen(true)}>
                  <Plus className="size-4" /> בלוק חדש
                </Button>
              }
            />
          )}
        </div>
      </main>

      <AlertDialog open={!!toRemove} onOpenChange={(o) => !o && setToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>להסיר את {toRemove?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              המתאמן ינותק ממך וכל בלוקי האימונים שיצרת עבורו יימחקו לצמיתות.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmRemove()}>הסרה</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
