import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Activity, CheckCircle2, CalendarDays, Dumbbell, Flame, Layers } from "lucide-react";
import { useStore } from "@/lib/store";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { EmptyState, ProgressBar, StatCard } from "@/components/StatCard";

export const Route = createFileRoute("/trainee/")({
  component: TraineeHome,
});

function TraineeHome() {
  const { state, user, hydrated } = useStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (!hydrated) return;
    if (!user) navigate({ to: "/" });
    else if (user.role !== "trainee") navigate({ to: "/coach" });
  }, [hydrated, user, navigate]);

  if (!user || user.role !== "trainee") return null;

  const myBlocks = state.blocks.filter((b) => b.traineeId === user.id);
  const activeBlocks = myBlocks.filter((b) => !b.completedAt);
  const hasPublishedWeek = (b: (typeof myBlocks)[number]) =>
    b.weeks.some((w) => w.weekNumber === b.currentWeek && w.published);
  const block =
    activeBlocks.find(hasPublishedWeek) ??
    activeBlocks[activeBlocks.length - 1] ??
    myBlocks.find(hasPublishedWeek) ??
    myBlocks[myBlocks.length - 1];
  const week = block?.weeks.find((w) => w.weekNumber === block.currentWeek && w.published);
  const workouts = week?.workouts ?? [];
  const done = workouts.filter((w) => w.completedAt).length;
  const totalSets = workouts.reduce(
    (n, w) => n + w.exercises.reduce((m, e) => m + e.sets.length, 0),
    0,
  );
  const pct = workouts.length ? (done / workouts.length) * 100 : 0;
  const nextWorkout = workouts.find((w) => !w.completedAt);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader subtitle={`מתאמן · ${user.name}`} />
      <main className="mx-auto max-w-3xl px-4 py-6 pb-16">
        {!block || !week ? (
          <EmptyState
            icon={CalendarDays}
            title="אין כרגע שבוע פעיל"
            description="המאמן שלך עדיין לא פרסם שבוע אימונים. תקבל התראה ברגע שיהיה משהו חדש."
          />
        ) : (
          <>
            <section className="surface-card animate-fade-up rounded-2xl p-5">
              <p className="text-xs font-semibold tracking-widest text-primary uppercase">
                השבוע שלי
              </p>
              <h1 className="mt-1 text-2xl font-bold sm:text-3xl">
                שבוע {week.weekNumber} · בלוק "{block.name}"
              </h1>
              <div className="mt-4 flex items-center gap-3">
                <ProgressBar value={pct} />
                <span className="shrink-0 text-sm font-bold">{Math.round(pct)}%</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {done}/{workouts.length} אימונים הושלמו
                {nextWorkout ? ` · הבא בתור: ${nextWorkout.title}` : " · כל הכבוד, סיימת!"}
              </p>
            </section>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <StatCard icon={Layers} label="אימונים בשבוע" value={workouts.length} index={0} />
              <StatCard icon={Activity} label="סה״כ סטים" value={totalSets} tone="neutral" index={1} />
              <StatCard
                icon={Flame}
                label="שבוע בבלוק"
                value={`${block.currentWeek}/${block.totalWeeks}`}
                tone="warning"
                index={2}
              />
            </div>

            <div className="my-6 h-px bg-border" />

            <div className="space-y-3">
              {week.workouts.map((w, i) => (
                <div
                  key={w.id}
                  className="surface-card lift animate-fade-up grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl p-4"
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-muted">
                      {w.completedAt ? (
                        <CheckCircle2 className="size-5 text-success" />
                      ) : (
                        <Dumbbell className="size-5 text-primary" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="flex min-w-0 items-center gap-2 truncate font-semibold">
                        <span className="truncate">
                          אימון {i + 1} · {w.title}
                        </span>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            w.completedAt
                              ? "bg-success/15 text-success"
                              : "bg-primary/15 text-primary"
                          }`}
                        >
                          {w.completedAt ? "הושלם" : "ממתין"}
                        </span>
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {w.exercises.length} תרגילים · {w.exercises.reduce((n, e) => n + e.sets.length, 0)} סטים
                      </p>
                    </div>
                  </div>
                  <Button asChild variant={w.completedAt ? "outline" : "default"} className="min-h-11">
                    <Link to="/trainee/workout/$workoutId" params={{ workoutId: w.id }}>
                      {w.completedAt ? "צפה / שנה" : "התחל אימון"}
                    </Link>
                  </Button>
                </div>
              ))}
            </div>

            {week.workouts.every((w) => w.completedAt) && (
              <div className="animate-scale-in mt-6 rounded-2xl border border-primary/40 bg-primary/10 p-4 text-center">
                <p className="font-semibold">
                  {week.reviewed ? "המאמן ראה את האימונים" : "סיימת את השבוע! ההערות נשלחו למאמן"}
                </p>
                <p className="text-sm text-muted-foreground">חכה לעדכון השבוע הבא</p>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
