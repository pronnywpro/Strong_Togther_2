import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Layers, Plus, Send, Trash2, UserMinus, UserPlus, Users } from "lucide-react";
import { uid, useStore } from "@/lib/store";
import { Input } from "@/components/ui/input";
import { cloneBlock } from "@/lib/clone";
import { AppHeader } from "@/components/AppHeader";
import { EmptyState, ProgressBar } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/coach/group/$groupId")({
  component: GroupPage,
});

function GroupPage() {
  const { groupId } = Route.useParams();
  const { state, user, hydrated, addGroupMember, removeGroupMember, deleteGroup, createBlocks, createBlock } =
    useStore();
  const navigate = useNavigate();
  const [addTraineeId, setAddTraineeId] = useState("");
  const [sourceBlockId, setSourceBlockId] = useState("");
  const [confirmSend, setConfirmSend] = useState(false);
  const [sending, setSending] = useState(false);
  const [newBlockOpen, setNewBlockOpen] = useState(false);
  const [newBlockName, setNewBlockName] = useState("");
  const [newBlockWeeks, setNewBlockWeeks] = useState("4");
  const [newBlockPerWeek, setNewBlockPerWeek] = useState("3");

  useEffect(() => {
    if (hydrated && !user) navigate({ to: "/" });
  }, [hydrated, user, navigate]);

  if (!hydrated) return <div className="min-h-screen bg-background" />;

  const group = state.groups.find((g) => g.id === groupId);
  if (!user || !group) {
    return (
      <div className="min-h-screen bg-background p-6 text-foreground">
        <p>הקבוצה לא נמצאה.</p>
        <Link to="/coach" className="text-primary underline">
          חזרה
        </Link>
      </div>
    );
  }

  const myTrainees = state.users.filter((u) => u.role === "trainee" && u.coachId === user.id);
  const members = myTrainees.filter((t) => group.memberIds.includes(t.id));
  const addable = myTrainees.filter((t) => !group.memberIds.includes(t.id));
  // A trainee is in at most one group, so anyone already grouped elsewhere can't be added here.
  const groupOf = (traineeId: string) => state.groups.find((g) => g.memberIds.includes(traineeId));
  const myBlocks = state.blocks.filter((b) => b.coachId === user.id);
  const sourceBlock = myBlocks.find((b) => b.id === sourceBlockId);

  const addMember = async () => {
    if (!addTraineeId) return;
    const ok = await addGroupMember(group.id, addTraineeId);
    if (!ok) {
      toast.error("ההוספה נכשלה");
      return;
    }
    setAddTraineeId("");
    toast.success("המתאמן נוסף לקבוצה");
  };

  const removeMember = async (traineeId: string, name: string) => {
    if (!window.confirm(`להסיר את ${name} מהקבוצה? הבלוקים שלו יישארו.`)) return;
    await removeGroupMember(traineeId);
    toast.success("המתאמן הוסר מהקבוצה");
  };

  // A draft block with no trainee yet: the coach builds it in the block editor, then sends it to
  // the group from here. Sending creates one independent copy per member.
  const createNewBlock = async () => {
    const name = newBlockName.trim();
    if (!name) {
      toast.error("יש להזין שם לבלוק");
      return;
    }
    const totalWeeks = Math.max(1, Number(newBlockWeeks) || 1);
    const perWeek = Math.max(1, Number(newBlockPerWeek) || 1);
    const blockId = await createBlock({
      coachId: user.id,
      traineeId: null,
      name,
      totalWeeks,
      workoutsPerWeek: perWeek,
      currentWeek: 1,
      weeks: [
        {
          weekNumber: 1,
          published: false,
          reviewed: false,
          workouts: Array.from({ length: perWeek }, (_, i) => ({
            id: uid(),
            title: `אימון ${i + 1}`,
            exercises: [],
          })),
        },
      ],
    });
    if (!blockId) {
      toast.error("יצירת הבלוק נכשלה");
      return;
    }
    setNewBlockOpen(false);
    setNewBlockName("");
    toast.success("הבלוק נוצר — בנה אותו ואז שלח לקבוצה");
    navigate({ to: "/coach/block/$blockId", params: { blockId } });
  };

  const sendToGroup = async () => {
    if (!sourceBlock || members.length === 0) return;
    setSending(true);
    // Each member gets an independent copy (cloneBlock makes fresh ids), so their starting
    // weights can be adjusted individually without touching the others or the source block.
    const rows = members.map((t) => ({
      coachId: sourceBlock.coachId,
      traineeId: t.id,
      name: sourceBlock.name,
      totalWeeks: sourceBlock.totalWeeks,
      workoutsPerWeek: sourceBlock.workoutsPerWeek,
      currentWeek: 1,
      completedAt: null,
      ...cloneBlock(sourceBlock),
    }));
    const sent = await createBlocks(rows);
    setSending(false);
    setConfirmSend(false);
    if (sent === 0) {
      toast.error("השליחה נכשלה");
      return;
    }
    toast.success(`הבלוק נשלח ל-${sent} מתאמנים`);
  };

  const deleteGroupNow = async () => {
    if (!window.confirm(`למחוק את הקבוצה "${group.name}"? המתאמנים וכל הבלוקים שלהם יישארו.`)) return;
    await deleteGroup(group.id);
    toast.success("הקבוצה נמחקה");
    navigate({ to: "/coach" });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader subtitle={`קבוצה: ${group.name}`} />
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Link to="/coach" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowRight className="size-4" /> חזרה ללוח המאמן
        </Link>
        <h1 className="mb-1 text-2xl font-bold sm:text-3xl">{group.name}</h1>
        <p className="mb-6 text-sm text-muted-foreground">{members.length} מתאמנים בקבוצה</p>

        <section className="surface-card mb-6 space-y-4 rounded-2xl p-4">
          <h2 className="text-lg font-bold">מתאמנים</h2>
          {members.length === 0 ? (
            <EmptyState
              icon={Users}
              title="אין מתאמנים בקבוצה"
              description="הוסף מתאמנים שכבר מחוברים אליך כדי לשלוח להם בלוק משותף."
            />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {members.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
                  <p className="truncate font-semibold">{t.name}</p>
                  <Button size="sm" variant="ghost" onClick={() => void removeMember(t.id, t.name)} aria-label={`הסר את ${t.name}`}>
                    <UserMinus className="size-4" /> הסרה
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <Label>הוספת מתאמן</Label>
            <div className="flex gap-2">
              <Select value={addTraineeId} onValueChange={setAddTraineeId}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="בחר מתאמן" />
                </SelectTrigger>
                <SelectContent>
                  {addable.map((t) => {
                    const other = groupOf(t.id);
                    return (
                      <SelectItem key={t.id} value={t.id} disabled={!!other}>
                        {t.name}
                        {other ? ` · בקבוצה "${other.name}"` : ""}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <Button variant="outline" disabled={!addTraineeId} onClick={() => void addMember()}>
                <UserPlus className="size-4" /> הוסף
              </Button>
            </div>
          </div>
        </section>

        <section className="surface-card mb-6 space-y-4 rounded-2xl p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-bold">שליחת בלוק לקבוצה</h2>
            <Button size="sm" variant="outline" onClick={() => setNewBlockOpen(true)}>
              <Plus className="size-4" /> צור בלוק חדש
            </Button>
          </div>
          <div className="space-y-2">
            <Label>בחר בלוק לשליחה (קיים או טיוטה)</Label>
            <Select value={sourceBlockId} onValueChange={setSourceBlockId}>
              <SelectTrigger>
                <SelectValue placeholder="בחר בלוק" />
              </SelectTrigger>
              <SelectContent>
                {myBlocks.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name} · {b.totalWeeks} שבועות
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              לכל מתאמן ייווצר עותק משלו. בלוקים קיימים של המתאמנים לא ישתנו.
            </p>
          </div>
          <Button disabled={!sourceBlock || members.length === 0} onClick={() => setConfirmSend(true)}>
            <Send className="size-4" /> שלח לכל הקבוצה
          </Button>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold">הבלוקים הפעילים של המתאמנים</h2>
          <p className="text-xs text-muted-foreground">
            כאן אפשר לפתוח כל עותק ולשנות אותו אישית, למשל משקל התחלתי.
          </p>
          {members.length === 0 && <p className="text-sm text-muted-foreground">אין מתאמנים בקבוצה.</p>}
          {members.map((t) => {
            const active = state.blocks.filter((b) => b.traineeId === t.id && !b.completedAt);
            return (
              <div key={t.id} className="surface-card rounded-2xl p-3">
                <p className="mb-2 font-semibold">{t.name}</p>
                {active.length === 0 ? (
                  <p className="text-sm text-muted-foreground">אין בלוק פעיל.</p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {active.map((b) => (
                      <Link
                        key={b.id}
                        to="/coach/block/$blockId"
                        params={{ blockId: b.id }}
                        className="lift rounded-xl border border-border p-3"
                      >
                        <p className="truncate text-sm font-semibold">
                          <Layers className="mr-1 inline size-4" /> {b.name}
                        </p>
                        <p className="mb-2 text-xs text-muted-foreground">
                          שבוע {b.currentWeek}/{b.totalWeeks}
                        </p>
                        <ProgressBar value={(b.currentWeek / Math.max(1, b.totalWeeks)) * 100} />
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </section>

        <div className="mt-8">
          <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => void deleteGroupNow()}>
            <Trash2 className="size-4" /> מחק קבוצה
          </Button>
        </div>
      </main>

      <Dialog open={newBlockOpen} onOpenChange={setNewBlockOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>בלוק חדש לקבוצה</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>שם הבלוק</Label>
              <Input value={newBlockName} onChange={(e) => setNewBlockName(e.target.value)} placeholder="לדוגמה: הכנה לקיץ" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>מספר שבועות</Label>
                <Input type="number" min={1} value={newBlockWeeks} onChange={(e) => setNewBlockWeeks(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>אימונים בשבוע</Label>
                <Input type="number" min={1} value={newBlockPerWeek} onChange={(e) => setNewBlockPerWeek(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setNewBlockOpen(false)}>
              ביטול
            </Button>
            <Button onClick={() => void createNewBlock()}>יצירה ועריכה</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmSend} onOpenChange={(o) => !o && setConfirmSend(false)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>לשלוח לכל הקבוצה?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            ייווצרו {members.length} בלוקים חדשים מ-"{sourceBlock?.name}", אחד לכל מתאמן.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmSend(false)} disabled={sending}>
              ביטול
            </Button>
            <Button onClick={() => void sendToGroup()} disabled={sending}>
              שליחה
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
