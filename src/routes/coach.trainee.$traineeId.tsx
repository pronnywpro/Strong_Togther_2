import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, History, Sparkles } from "lucide-react";
import { useStore } from "@/lib/store";
import { computeBlockSummaryRows } from "@/lib/blockSummary";
import { saveBlockSummary, useBlockSummaries } from "@/lib/blockSummaries";
import { AppHeader } from "@/components/AppHeader";
import { BlockSummaryTable } from "@/components/BlockSummaryTable";
import { Button } from "@/components/ui/button";
import { ExerciseProgressChart } from "@/components/ExerciseProgressChart";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Block, BlockSummary } from "@/lib/types";

export const Route = createFileRoute("/coach/trainee/$traineeId")({
  component: TraineeBlockHistory,
});

function TraineeBlockHistory() {
  const { traineeId } = Route.useParams();
  const { state, user, hydrated } = useStore();
  const navigate = useNavigate();
  const { summaries, loading, refresh } = useBlockSummaries(traineeId);
  const [viewing, setViewing] = useState<BlockSummary | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);

  useEffect(() => {
    if (!hydrated) return;
    if (!user) navigate({ to: "/" });
    else if (user.role !== "coach") navigate({ to: "/trainee" });
  }, [hydrated, user, navigate]);

  if (!user || user.role !== "coach") return null;

  const trainee = state.users.find((u) => u.id === traineeId);
  const blocks = state.blocks.filter(
    (b): b is Block & { traineeId: string } => b.traineeId === traineeId,
  );
  const completedBlocks = blocks
    .filter((b): b is Block & { traineeId: string; completedAt: number } => b.completedAt != null)
    .sort((a, b) => b.completedAt - a.completedAt);

  const generateNow = async (block: Block & { traineeId: string; completedAt: number }) => {
    setGenerating(block.id);
    const otherBlocks = blocks.filter((b) => b.id !== block.id);
    const previousBlock = otherBlocks
      .filter(
        (b): b is Block & { traineeId: string; completedAt: number } =>
          b.completedAt != null && b.completedAt < block.completedAt,
      )
      .reduce<(Block & { traineeId: string; completedAt: number }) | null>(
        (latest, b) => (!latest || b.completedAt > latest.completedAt ? b : latest),
        null,
      );
    const rows = computeBlockSummaryRows(block, previousBlock, otherBlocks);
    const saved = await saveBlockSummary({
      blockId: block.id,
      coachId: block.coachId,
      traineeId: block.traineeId,
      blockName: block.name,
      completedAt: block.completedAt,
      rows,
    });
    setGenerating(null);
    if (!saved) {
      toast.error("יצירת הסיכום נכשלה");
      return;
    }
    await refresh();
    setViewing(saved);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader subtitle={`היסטוריית בלוקים · ${trainee?.name ?? ""}`} />
      <main className="mx-auto max-w-3xl px-4 py-6">
        <Link to="/coach" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowRight className="size-4" /> חזרה לרשימת המתאמנים
        </Link>
        <h1 className="mb-1 flex items-center gap-2 text-2xl font-bold sm:text-3xl">
          <History className="size-6 text-primary" /> {trainee?.name ?? "מתאמן"}
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">כל הבלוקים שהושלמו, עם סיכום קבוע לכל בלוק.</p>

        {loading ? (
          <p className="text-sm text-muted-foreground">טוען...</p>
        ) : completedBlocks.length === 0 ? (
          <p className="text-sm text-muted-foreground">עדיין אין בלוקים שהושלמו למתאמן הזה.</p>
        ) : (
          <div className="space-y-2">
            {completedBlocks.map((b) => {
              const summary = summaries.find((s) => s.blockId === b.id) ?? null;
              return (
                <div key={b.id} className="surface-card flex items-center justify-between gap-3 rounded-2xl p-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{b.name}</p>
                    <p className="text-xs text-muted-foreground">
                      הושלם ב-{new Date(b.completedAt).toLocaleDateString("he-IL")}
                    </p>
                  </div>
                  {summary ? (
                    <Button size="sm" variant="outline" onClick={() => setViewing(summary)}>
                      <Sparkles className="size-4" /> צפה בסיכום
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" disabled={generating === b.id} onClick={() => void generateNow(b)}>
                      {generating === b.id ? "יוצר..." : "צור סיכום עכשיו"}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <section className="surface-card mt-8 space-y-4 rounded-2xl p-4">
          <h2 className="text-lg font-bold">התקדמות לפי תרגיל</h2>
          <p className="text-xs text-muted-foreground">
            כל נקודה היא השבוע: הסט הטוב ביותר שנרשם, כ-1RM תיאורטי.
          </p>
          <ExerciseProgressChart blocks={blocks} />
        </section>
      </main>

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-h-[90vh] max-w-[95vw] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>סיכום בלוק — {viewing?.blockName}</DialogTitle>
          </DialogHeader>
          {viewing && (
            <>
              <p className="-mt-2 text-xs text-muted-foreground">
                הושלם ב-{new Date(viewing.completedAt).toLocaleDateString("he-IL")} · תמונת מצב קבועה, לא משתנה עם עדכונים עתידיים.
              </p>
              <BlockSummaryTable summary={viewing} />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
