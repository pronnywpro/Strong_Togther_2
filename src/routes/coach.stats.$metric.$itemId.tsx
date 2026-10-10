import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { ArrowRight, CheckCircle2, Pencil, SearchX } from "lucide-react";
import { useStore } from "@/lib/store";
import { AppHeader } from "@/components/AppHeader";
import { EmptyState, ProgressBar } from "@/components/StatCard";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Button } from "@/components/ui/button";
import { METRIC_META } from "@/lib/stats-meta";
import { targetText } from "@/lib/format";

export const Route = createFileRoute("/coach/stats/$metric/$itemId")({
  component: StatDetail,
});

function StatDetail() {
  const { metric, itemId } = Route.useParams();
  const { state, user, hydrated } = useStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (!hydrated) return;
    if (!user) navigate({ to: "/" });
    else if (user.role !== "coach") navigate({ to: "/trainee" });
  }, [hydrated, user, navigate]);

  if (!user || user.role !== "coach") return null;

  const meta = METRIC_META[metric] ?? { title: "נתונים", desc: "" };

  let heading = "פירוט";
  let body: React.ReactNode = null;

  if (metric === "trainees") {
    const trainee = state.users.find((u) => String(u.id) === itemId);
    const blocks = trainee ? state.blocks.filter((b) => b.traineeId === trainee.id) : [];
    heading = trainee?.name ?? "מתאמן";
    body = trainee ? (
      <div className="space-y-3">
        <div className="surface-card animate-fade-up rounded-2xl p-4">
          <p className="text-sm text-muted-foreground">{trainee.email}</p>
          <p className="mt-1 text-sm">{blocks.length} בלוקים</p>
        </div>
        {blocks.map((b) => {
          const week = b.weeks.find((w) => w.weekNumber === b.currentWeek);
          const done = week?.workouts.filter((w) => w.completedAt).length ?? 0;
          const total = week?.workouts.length ?? 0;
          return (
            <div key={b.id} className="surface-card animate-fade-up rounded-2xl p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-semibold">{b.name}</p>
                  <p className="text-xs text-muted-foreground">
                    שבוע {b.currentWeek}/{b.totalWeeks} · {done}/{total} אימונים הושלמו השבוע
                  </p>
                </div>
                <Button asChild size="sm" variant="secondary">
                  <Link to="/coach/block/$blockId" params={{ blockId: b.id }}>
                    <Pencil className="size-4" /> עריכה
                  </Link>
                </Button>
              </div>
              <ProgressBar value={total ? (done / total) * 100 : 0} className="mt-3" />
            </div>
          );
        })}
      </div>
    ) : null;
  } else if (metric === "blocks") {
    const block = state.blocks.find((b) => b.id === itemId);
    const trainee = state.users.find((u) => u.id === block?.traineeId);
    heading = block?.name ?? "בלוק";
    body = block ? (
      <div className="space-y-3">
        <div className="surface-card animate-fade-up rounded-2xl p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm text-muted-foreground">מתאמן: {trainee?.name ?? "—"}</p>
              <p className="text-sm text-muted-foreground">
                שבוע {block.currentWeek}/{block.totalWeeks} · {block.workoutsPerWeek} אימונים בשבוע
              </p>
            </div>
            <Button asChild size="sm">
              <Link to="/coach/block/$blockId" params={{ blockId: block.id }}>
                <Pencil className="size-4" /> ערוך בלוק
              </Link>
            </Button>
          </div>
          <ProgressBar
            value={(block.currentWeek / Math.max(1, block.totalWeeks)) * 100}
            className="mt-3"
          />
        </div>
        {block.weeks.map((w) => (
          <div key={w.weekNumber} className="surface-card animate-fade-up rounded-2xl p-4">
            <p className="font-semibold">
              שבוע {w.weekNumber}
              {w.weekNumber === block.currentWeek ? " · נוכחי" : ""}
            </p>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {w.workouts.length === 0 && <li>אין אימונים</li>}
              {w.workouts.map((wo) => (
                <li key={wo.id} className="flex items-center justify-between gap-2">
                  <span>
                    {wo.title} · {wo.exercises.length} תרגילים
                  </span>
                  <span className={wo.completedAt ? "text-success" : ""}>
                    {wo.completedAt ? "הושלם" : "טרם הושלם"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    ) : null;
  } else {
    const found = state.blocks
      .flatMap((b) => b.weeks.flatMap((w) => w.workouts.map((wo) => ({ wo, w, b }))))
      .find((x) => x.wo.id === itemId);
    heading = found?.wo.title ?? "אימון";
    body = found ? (
      <div className="space-y-3">
        <div className="surface-card animate-fade-up rounded-2xl p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm text-muted-foreground">
                {found.b.name} · שבוע {found.w.weekNumber} ·{" "}
                {state.users.find((u) => u.id === found.b.traineeId)?.name}
              </p>
              <p
                className={`mt-1 text-sm font-semibold ${found.wo.completedAt ? "text-success" : "text-muted-foreground"}`}
              >
                {found.wo.completedAt ? "הושלם" : "טרם הושלם"}
              </p>
            </div>
            <Button asChild size="sm" variant="secondary">
              <Link to="/coach/block/$blockId" params={{ blockId: found.b.id }}>
                <Pencil className="size-4" /> פתח בבלוק
              </Link>
            </Button>
          </div>
        </div>
        {found.wo.exercises.map((ex) => (
          <div key={ex.id} className="surface-card animate-fade-up rounded-2xl p-4">
            <p className="font-semibold">{ex.name}</p>
            {ex.coachNotes ? <p className="text-xs text-muted-foreground">{ex.coachNotes}</p> : null}
            <div className="mt-2 space-y-1 text-sm">
              {ex.sets.map((s, i) => (
                <div key={s.id} className="flex flex-wrap items-center gap-2 text-muted-foreground">
                  <span className="font-semibold text-foreground">סט {i + 1}:</span>
                  <span>משקל {targetText(s, "weight")}</span>
                  <span>· חזרות {targetText(s, "reps")}</span>
                  <span>· RPE {targetText(s, "rpe")}</span>
                  {s.actualWeight != null || s.actualReps != null || s.actualRpe != null ? (
                    <span className="text-success">
                      ← בוצע: {s.actualWeight ?? "—"} ק"ג / {s.actualReps ?? "—"} / RPE{" "}
                      {s.actualRpe ?? "—"}
                    </span>
                  ) : null}
                  {s.skipped ? <span className="text-destructive">· דולג</span> : null}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    ) : null;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader subtitle={`מאמן · ${user.name}`} />
      <main className="mx-auto max-w-3xl px-4 py-6 pb-16">
        <Breadcrumbs
          items={[
            { label: "לוח מאמן", to: "/coach" },
            { label: meta.title, to: "/coach/stats/$metric", params: { metric } },
            { label: heading },
          ]}
        />
        <Button asChild variant="ghost" className="mb-3 -mr-2">
          <Link to="/coach/stats/$metric" params={{ metric }}>
            <ArrowRight className="size-4" /> חזרה ל{meta.title}
          </Link>
        </Button>
        <h1 className="mb-5 flex items-center gap-2 text-2xl font-bold sm:text-3xl">
          <CheckCircle2 className="size-6 text-primary" aria-hidden="true" />
          {heading}
        </h1>
        {body ?? (
          <EmptyState
            icon={SearchX}
            title="הפריט לא נמצא"
            description="ייתכן שהנתון נמחק. חזור לרשימה ובחר פריט אחר."
          />
        )}
      </main>
    </div>
  );
}
