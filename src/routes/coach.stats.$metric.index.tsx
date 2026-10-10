import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { ArrowRight, Activity, CheckCircle2, Layers, Users } from "lucide-react";
import { useStore } from "@/lib/store";
import { AppHeader } from "@/components/AppHeader";
import { EmptyState, ProgressBar } from "@/components/StatCard";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Button } from "@/components/ui/button";
import { METRIC_META } from "@/lib/stats-meta";

export const Route = createFileRoute("/coach/stats/$metric/")({
  component: CoachStatsList,
});

function CoachStatsList() {
  const { metric } = Route.useParams();
  const { state, user, hydrated } = useStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (!hydrated) return;
    if (!user) navigate({ to: "/" });
    else if (user.role !== "coach") navigate({ to: "/trainee" });
  }, [hydrated, user, navigate]);

  if (!user || user.role !== "coach") return null;
  // RLS lets an admin read every coach's blocks; keep stats to this coach's own.
  const coachBlocks = state.blocks.filter((b) => b.coachId === user.id);

  const trainees = state.users.filter((u) => u.role === "trainee");
  const allWorkouts = coachBlocks.flatMap((b) =>
    b.weeks
      .filter((w) => w.weekNumber === b.currentWeek)
      .flatMap((w) => w.workouts.map((wo) => ({ workout: wo, block: b, week: w }))),
  );
  const completed = allWorkouts.filter((x) => x.workout.completedAt);
  const rate = allWorkouts.length ? Math.round((completed.length / allWorkouts.length) * 100) : 0;
  const meta = METRIC_META[metric] ?? { title: "נתונים", desc: "" };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader subtitle={`מאמן · ${user.name}`} />
      <main className="mx-auto max-w-3xl px-4 py-6 pb-16">
        <Breadcrumbs items={[{ label: "לוח מאמן", to: "/coach" }, { label: meta.title }]} />
        <Button asChild variant="ghost" className="mb-3 -mr-2">
          <Link to="/coach">
            <ArrowRight className="size-4" /> חזרה ללוח המאמן
          </Link>
        </Button>
        <h1 className="text-2xl font-bold sm:text-3xl">{meta.title}</h1>
        <p className="mb-5 text-sm text-muted-foreground">{meta.desc}</p>

        {metric === "completion" && allWorkouts.length > 0 && (
          <div className="surface-card mb-5 rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {completed.length} מתוך {allWorkouts.length} אימונים הושלמו
              </span>
              <span className="text-2xl font-bold">{rate}%</span>
            </div>
            <ProgressBar value={rate} className="mt-3" />
          </div>
        )}

        <div className="space-y-3">
          {metric === "trainees" &&
            trainees.map((t) => {
              const b = coachBlocks.find((x) => x.traineeId === t.id);
              return (
                <Link
                  key={t.id}
                  to="/coach/stats/$metric/$itemId"
                  params={{ metric, itemId: String(t.id) }}
                  className="surface-card lift animate-fade-up block rounded-2xl p-4"
                >
                  <p className="font-semibold">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.email}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {b ? `בלוק "${b.name}" · שבוע ${b.currentWeek}/${b.totalWeeks}` : "אין בלוק פעיל"}
                  </p>
                </Link>
              );
            })}

          {metric === "blocks" &&
            coachBlocks.map((b) => (
              <Link
                key={b.id}
                to="/coach/stats/$metric/$itemId"
                params={{ metric, itemId: b.id }}
                className="surface-card lift animate-fade-up block rounded-2xl p-4"
              >
                <p className="font-semibold">{b.name}</p>
                <p className="text-xs text-muted-foreground">
                  {state.users.find((u) => u.id === b.traineeId)?.name} · שבוע {b.currentWeek}/
                  {b.totalWeeks} · {b.workoutsPerWeek} אימונים בשבוע
                </p>
                <ProgressBar value={(b.currentWeek / Math.max(1, b.totalWeeks)) * 100} className="mt-3" />
              </Link>
            ))}

          {(metric === "workouts" || metric === "completion") &&
            allWorkouts.map(({ workout, block, week }) => (
              <Link
                key={workout.id}
                to="/coach/stats/$metric/$itemId"
                params={{ metric, itemId: workout.id }}
                className="surface-card lift animate-fade-up block rounded-2xl p-4"
              >
                <p className="font-semibold">{workout.title}</p>
                <p className="text-xs text-muted-foreground">
                  {block.name} · שבוע {week.weekNumber} · {workout.exercises.length} תרגילים ·{" "}
                  {workout.completedAt ? "הושלם" : "טרם הושלם"}
                </p>
              </Link>
            ))}

          {((metric === "trainees" && trainees.length === 0) ||
            (metric === "blocks" && coachBlocks.length === 0) ||
            ((metric === "workouts" || metric === "completion") && allWorkouts.length === 0)) && (
            <EmptyState
              icon={
                metric === "trainees"
                  ? Users
                  : metric === "blocks"
                    ? Layers
                    : metric === "workouts"
                      ? Activity
                      : CheckCircle2
              }
              title="אין נתונים להצגה"
              description="ברגע שיהיו נתונים רלוונטיים הם יופיעו כאן."
            />
          )}
        </div>
      </main>
    </div>
  );
}
