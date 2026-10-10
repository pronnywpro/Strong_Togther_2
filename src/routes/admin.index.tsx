import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Layers, Loader2, Search, ShieldCheck, ShieldOff, ShieldX, Trash2, UserCheck, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useStore, toCoachApp } from "@/lib/store";
import { adminDeleteUser } from "@/lib/admin-actions";
import { AppHeader } from "@/components/AppHeader";
import { EmptyState, StatCard } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import type { CoachApplication, CoachStatus, Role } from "@/lib/types";

export const Route = createFileRoute("/admin/")({
  component: AdminHome,
});

type AdminPanel = "users" | "coaches" | "blocks" | null;

const LABEL: Record<CoachStatus, string> = {
  pending: "ממתין",
  approved: "מאושר",
  rejected: "נדחה",
  blocked: "חסום",
};

function AdminHome() {
  const { user, hydrated, loading, isAdmin } = useStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (!hydrated || loading) return;
    if (!user) navigate({ to: "/" });
  }, [hydrated, loading, user, navigate]);

  if (!user) return null;

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <AppHeader />
        <main className="mx-auto max-w-sm px-4 py-16 text-center">
          <span className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-muted text-muted-foreground">
            <ShieldOff className="size-6" />
          </span>
          <h1 className="text-xl font-bold">אין לך גישה</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            פאנל הניהול פתוח רק לחשבון המנהל של המערכת.
          </p>
        </main>
      </div>
    );
  }

  return <AdminDashboard />;
}

function AdminDashboard() {
  const { user } = useStore();
  const [apps, setApps] = useState<CoachApplication[]>([]);
  const [stats, setStats] = useState({ users: 0, coaches: 0, blocks: 0 });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reason, setReason] = useState<Record<string, string>>({});
  const [toDelete, setToDelete] = useState<CoachApplication | null>(null);
  const [filter, setFilter] = useState<CoachStatus>("approved");
  const [panel, setPanel] = useState<AdminPanel>(null);

  // Clicking the active stat card again closes its panel.
  const togglePanel = (next: Exclude<AdminPanel, null>) => setPanel((p) => (p === next ? null : next));

  const loadApps = useCallback(async () => {
    const { data } = await supabase
      .from("coach_applications")
      .select("*")
      .order("created_at", { ascending: false });
    setApps(((data ?? []) as unknown as Parameters<typeof toCoachApp>[0][]).map(toCoachApp));
  }, []);

  useEffect(() => {
    void loadApps();
    void (async () => {
      const [u, c, b] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("coach_applications").select("id", { count: "exact", head: true }).eq("status", "approved"),
        supabase.from("blocks").select("id", { count: "exact", head: true }),
      ]);
      setStats({ users: u.count ?? 0, coaches: c.count ?? 0, blocks: b.count ?? 0 });
    })();
  }, [loadApps]);

  const pending = apps.filter((a) => a.status === "pending");
  const others = apps.filter((a) => a.status === filter);

  const review = async (app: CoachApplication, status: CoachStatus) => {
    if (!user) return;
    const why = (reason[app.id] ?? "").trim();
    if ((status === "rejected" || status === "blocked") && why.length < 5) {
      toast.error("יש לפרט סיבה (לפחות 5 תווים)");
      return;
    }
    setBusyId(app.id);
    const { error } = await supabase
      .from("coach_applications")
      .update({
        status,
        rejection_reason: status === "approved" ? null : why,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", app.id);
    if (error) {
      setBusyId(null);
      toast.error("העדכון נכשל");
      return;
    }
    await Promise.all([
      supabase.from("admin_logs").insert({
        admin_id: user.id,
        action: status,
        target_user_id: app.userId,
        notes: why,
      }),
      supabase.from("notifications").insert({
        to_user_id: app.userId,
        from_user_id: user.id,
        to_role: "coach",
        text:
          status === "approved"
            ? "בקשת האימות שלך אושרה — אפשר להתחיל לאמן!"
            : status === "rejected"
              ? `בקשת האימות נדחתה: ${why}`
              : `החשבון שלך נחסם: ${why}`,
      }),
    ]);
    setBusyId(null);
    await loadApps();
    toast.success("הבקשה עודכנה");
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setBusyId(toDelete.id);
    const res = await adminDeleteUser(toDelete.userId);
    if (!res.ok) {
      toast.error(res.error === "cannot_delete_self" ? "לא ניתן למחוק את חשבון המנהל שלך" : "המחיקה נכשלה");
    } else {
      toast.success("החשבון נמחק");
      await loadApps();
    }
    setBusyId(null);
    setToDelete(null);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader subtitle="פאנל ניהול" />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="animate-fade-up text-2xl font-bold sm:text-3xl">פאנל ניהול</h1>
        <p className="mb-6 text-sm text-muted-foreground">אישור מאמנים וסקירה כללית של המערכת.</p>

        <div className="mb-6 grid grid-cols-3 gap-3">
          <StatCard
            icon={Users}
            label="משתמשים"
            value={stats.users}
            onClick={() => togglePanel("users")}
            tone={panel === "users" ? "primary" : "neutral"}
          />
          <StatCard
            icon={UserCheck}
            label="מאמנים מאושרים"
            value={stats.coaches}
            tone={panel === "coaches" ? "primary" : "success"}
            onClick={() => togglePanel("coaches")}
          />
          <StatCard
            icon={Layers}
            label="בלוקים"
            value={stats.blocks}
            tone={panel === "blocks" ? "primary" : "neutral"}
            onClick={() => togglePanel("blocks")}
          />
        </div>

        {panel === "users" && <AllUsers />}
        {panel === "blocks" && <AllBlocks />}
        {panel === "coaches" && (
          <div className="mb-8 space-y-3">
            <Select value={filter} onValueChange={(v) => setFilter(v as CoachStatus)}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="approved">מאושרים</SelectItem>
                <SelectItem value="pending">ממתינים</SelectItem>
                <SelectItem value="rejected">נדחו</SelectItem>
                <SelectItem value="blocked">חסומים</SelectItem>
              </SelectContent>
            </Select>
            {others.length === 0 && (
              <EmptyState icon={ShieldX} title="אין מאמנים" description={`אין מאמנים בסטטוס "${LABEL[filter]}".`} />
            )}
            {others.map((app) => (
              <ApplicationCard
                key={app.id}
                app={app}
                busy={busyId === app.id}
                reason={reason[app.id] ?? ""}
                onReasonChange={(v) => setReason({ ...reason, [app.id]: v })}
                onApprove={app.status !== "approved" ? () => void review(app, "approved") : undefined}
                onReject={app.status === "pending" ? () => void review(app, "rejected") : undefined}
                onBlock={app.status !== "blocked" ? () => void review(app, "blocked") : undefined}
                onDelete={() => setToDelete(app)}
              />
            ))}
          </div>
        )}

        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">
            בקשות ממתינות לאישור
            {pending.length > 0 && (
              <span className="ms-2 rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-bold text-destructive">
                {pending.length}
              </span>
            )}
          </h2>
        </div>
        <div className="mb-8 space-y-3">
          {pending.length === 0 && (
            <EmptyState icon={ShieldCheck} title="אין בקשות ממתינות" description="כל הבקשות טופלו." />
          )}
          {pending.map((app) => (
            <ApplicationCard
              key={app.id}
              app={app}
              busy={busyId === app.id}
              reason={reason[app.id] ?? ""}
              onReasonChange={(v) => setReason({ ...reason, [app.id]: v })}
              onApprove={() => void review(app, "approved")}
              onReject={() => void review(app, "rejected")}
              onBlock={() => void review(app, "blocked")}
              onDelete={() => setToDelete(app)}
            />
          ))}
        </div>

      </main>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת חשבון המאמן?</AlertDialogTitle>
            <AlertDialogDescription>
              הפעולה תמחק לצמיתות את החשבון של {toDelete?.fullName} ואת כל בלוקי האימונים שלו. לא ניתן לשחזר.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDelete()}>מחיקה</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  role: Role;
  coachId: string | null;
  createdAt: string;
}

type RoleFilter = "all" | Role;

const ROLE_LABEL: Record<Role, string> = { coach: "מאמן", trainee: "מתאמן" };

/** Read-only list of every account. RLS lets the admin read all profiles. */
function AllUsers() {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");

  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, email, role, coach_id, created_at")
        .order("created_at", { ascending: false });
      if (error) toast.error("טעינת המשתמשים נכשלה");
      setUsers(
        (data ?? []).map((r) => ({
          id: r.id,
          name: r.name,
          email: r.email,
          role: r.role as Role,
          coachId: r.coach_id,
          createdAt: r.created_at,
        })),
      );
      setLoading(false);
    })();
  }, []);

  const coachNames = useMemo(() => new Map(users.filter((u) => u.role === "coach").map((u) => [u.id, u.name])), [users]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter(
      (u) =>
        (roleFilter === "all" || u.role === roleFilter) &&
        (!q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)),
    );
  }, [users, query, roleFilter]);

  return (
    <section className="mt-10">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-bold">כל המשתמשים</h2>
        <span className="text-sm text-muted-foreground">{users.length} סה״כ</span>
      </div>

      <div className="mb-3 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="ps-9"
            placeholder="חיפוש לפי שם או אימייל"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as RoleFilter)}>
          <SelectTrigger className="sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">הכל</SelectItem>
            <SelectItem value="coach">מאמנים</SelectItem>
            <SelectItem value="trainee">מתאמנים</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="grid place-items-center py-10">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : visible.length === 0 ? (
        <EmptyState icon={Users} title="לא נמצאו משתמשים" description="נסה לשנות את החיפוש או את הסינון." />
      ) : (
        <div className="surface-card divide-y divide-border overflow-hidden rounded-2xl">
          {visible.map((u) => (
            <div key={u.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">{u.name || "—"}</p>
                <p dir="ltr" className="truncate text-start text-xs text-muted-foreground">
                  {u.email || "—"}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1 text-xs text-muted-foreground">
                <span className="rounded-full bg-muted px-2.5 py-0.5 font-semibold text-foreground">
                  {ROLE_LABEL[u.role]}
                </span>
                {u.role === "trainee" && (
                  <span>מאמן: {u.coachId ? (coachNames.get(u.coachId) ?? "לא ידוע") : "ללא מאמן"}</span>
                )}
                <span>נוצר: {new Date(u.createdAt).toLocaleDateString("he-IL")}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

interface AdminBlockRow {
  id: string;
  name: string;
  coachId: string;
  traineeId: string | null;
  currentWeek: number;
  totalWeeks: number;
  completed: boolean;
}

/** Every block in the system, with its coach and trainee names. */
function AllBlocks() {
  const [blocks, setBlocks] = useState<AdminBlockRow[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    void (async () => {
      const [b, p] = await Promise.all([
        supabase
          .from("blocks")
          .select("id, name, coach_id, trainee_id, current_week, total_weeks, completed_at")
          .order("name"),
        supabase.from("profiles").select("id, name"),
      ]);
      if (b.error) toast.error("טעינת הבלוקים נכשלה");
      setNames(new Map((p.data ?? []).map((r) => [r.id, r.name])));
      setBlocks(
        (b.data ?? []).map((r) => ({
          id: r.id,
          name: r.name,
          coachId: r.coach_id,
          traineeId: r.trainee_id,
          currentWeek: r.current_week,
          totalWeeks: r.total_weeks,
          completed: r.completed_at != null,
        })),
      );
      setLoading(false);
    })();
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return blocks;
    return blocks.filter((b) => {
      const coach = names.get(b.coachId) ?? "";
      const trainee = b.traineeId ? (names.get(b.traineeId) ?? "") : "";
      return [b.name, coach, trainee].some((s) => s.toLowerCase().includes(q));
    });
  }, [blocks, names, query]);

  return (
    <section className="mb-8 space-y-3">
      <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
        <h2 className="text-lg font-bold">כל הבלוקים</h2>
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="ps-9"
            placeholder="חיפוש לפי בלוק, מאמן או מתאמן"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="grid place-items-center py-10">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : visible.length === 0 ? (
        <EmptyState icon={Layers} title="לא נמצאו בלוקים" description="אין בלוקים שתואמים לחיפוש." />
      ) : (
        <div className="surface-card divide-y divide-border overflow-hidden rounded-2xl">
          {visible.map((b) => (
            <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">{b.name || "—"}</p>
                <p className="truncate text-xs text-muted-foreground">
                  מאמן: {names.get(b.coachId) ?? "לא ידוע"} · מתאמן:{" "}
                  {b.traineeId ? (names.get(b.traineeId) ?? "לא ידוע") : "טיוטה (ללא מתאמן)"}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1 text-xs text-muted-foreground">
                <span
                  className={
                    b.completed
                      ? "rounded-full bg-success/15 px-2.5 py-0.5 font-semibold text-success"
                      : "rounded-full bg-muted px-2.5 py-0.5 font-semibold text-foreground"
                  }
                >
                  {b.completed ? "הושלם" : "פעיל"}
                </span>
                <span>
                  שבוע {b.currentWeek} מתוך {b.totalWeeks}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ApplicationCard({
  app,
  busy,
  reason,
  onReasonChange,
  onApprove,
  onReject,
  onBlock,
  onDelete,
}: {
  app: CoachApplication;
  busy: boolean;
  reason: string;
  onReasonChange: (v: string) => void;
  onApprove?: () => void;
  onReject?: () => void;
  onBlock?: () => void;
  onDelete: () => void;
}) {
  return (
    <article className="surface-card animate-fade-up space-y-3 rounded-2xl p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-bold">{app.fullName}</h3>
          <p dir="ltr" className="text-right text-xs text-muted-foreground">
            {app.email}
          </p>
        </div>
        <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold">{LABEL[app.status]}</span>
      </header>

      <p className="text-sm text-muted-foreground">
        התמחות: <span className="text-foreground">{app.specialty || "—"}</span>
      </p>
      {app.applicantNotes && <p className="text-xs text-muted-foreground">הערת המאמן: {app.applicantNotes}</p>}
      {app.rejectionReason && <p className="text-xs text-destructive">סיבה: {app.rejectionReason}</p>}

      {(onReject || onBlock) && (
        <Textarea
          rows={2}
          maxLength={500}
          placeholder="סיבת דחייה / חסימה"
          value={reason}
          onChange={(e) => onReasonChange(e.target.value)}
        />
      )}

      <footer className="flex flex-wrap gap-2">
        {onApprove && (
          <Button size="sm" disabled={busy} onClick={onApprove}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <UserCheck className="size-4" />}
            אישור
          </Button>
        )}
        {onReject && (
          <Button size="sm" variant="outline" disabled={busy} onClick={onReject}>
            דחייה
          </Button>
        )}
        {onBlock && (
          <Button size="sm" variant="outline" disabled={busy} onClick={onBlock}>
            <ShieldX className="size-4" /> חסימה
          </Button>
        )}
        <Button size="sm" variant="destructive" disabled={busy} onClick={onDelete}>
          <Trash2 className="size-4" /> מחיקת חשבון
        </Button>
      </footer>
    </article>
  );
}
