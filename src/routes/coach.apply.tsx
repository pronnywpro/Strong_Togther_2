import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { AlertTriangle, BadgeCheck, CheckCircle2, Clock, Loader2, ShieldX } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/lib/store";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { COACH_SPECIALTIES } from "@/lib/types";

export const Route = createFileRoute("/coach/apply")({
  component: CoachApplyPage,
});

const schema = z.object({
  fullName: z.string().trim().min(2, "שם מלא חייב להכיל לפחות 2 תווים").max(80),
  email: z.string().trim().email("אימייל לא תקין").max(255),
  specialty: z.string().trim().min(1, "יש לבחור התמחות"),
  applicantNotes: z.string().trim().max(500),
});

function CoachApplyPage() {
  const { user, hydrated, loading, coachApp, refresh } = useStore();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    specialty: "",
    applicantNotes: "",
  });

  useEffect(() => {
    if (!hydrated || loading) return;
    if (!user) navigate({ to: "/" });
    else if (user.role !== "coach") navigate({ to: "/trainee" });
  }, [hydrated, loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    setForm((f) => ({
      ...f,
      fullName: f.fullName || coachApp?.fullName || user.name,
      email: f.email || coachApp?.email || user.email,
      specialty: f.specialty || coachApp?.specialty || "",
      applicantNotes: f.applicantNotes || coachApp?.applicantNotes || "",
    }));
  }, [user, coachApp]);

  const parsed = useMemo(() => schema.safeParse(form), [form]);

  const submit = async () => {
    if (!user) return;
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "יש למלא את כל השדות");
      return;
    }
    setBusy(true);
    const row = {
      user_id: user.id,
      full_name: parsed.data.fullName,
      email: parsed.data.email,
      specialty: parsed.data.specialty,
      applicant_notes: parsed.data.applicantNotes,
      status: "pending" as const,
      rejection_reason: null,
    };
    const { error } = await supabase.from("coach_applications").upsert(row, { onConflict: "user_id" });
    setBusy(false);
    if (error) {
      toast.error("שליחת הבקשה נכשלה");
      return;
    }
    await refresh();
    toast.success("הבקשה נשלחה לאישור מנהל");
  };

  if (!user) return null;

  if (coachApp && (coachApp.status === "pending" || coachApp.status === "blocked" || coachApp.status === "approved")) {
    return <StatusScreen />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader />
      <main className="mx-auto max-w-lg px-4 py-8">
        <div className="animate-fade-up mb-6 text-center">
          <span className="mx-auto mb-3 grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground">
            <BadgeCheck className="size-6" />
          </span>
          <h1 className="text-2xl font-bold sm:text-3xl">אימות מאמן</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            כדי לאמן מתאמנים במערכת יש להשלים אימות ולקבל אישור מנהל.
          </p>
        </div>

        {coachApp?.status === "rejected" && (
          <div className="mb-4 rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
            <p className="flex items-center gap-2 font-semibold text-destructive">
              <ShieldX className="size-4" /> הבקשה הקודמת נדחתה
            </p>
            {coachApp.rejectionReason && <p className="mt-1 text-muted-foreground">{coachApp.rejectionReason}</p>}
            <p className="mt-1 text-muted-foreground">ניתן לתקן את הפרטים ולשלוח שוב.</p>
          </div>
        )}

        <div className="surface-card animate-fade-up space-y-4 rounded-2xl p-5">
          <div className="space-y-2">
            <Label htmlFor="fullName">שם מלא</Label>
            <Input
              id="fullName"
              value={form.fullName}
              maxLength={80}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cemail">אימייל ליצירת קשר</Label>
            <Input
              id="cemail"
              type="email"
              dir="ltr"
              value={form.email}
              maxLength={255}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>תחום התמחות</Label>
            <Select value={form.specialty} onValueChange={(v) => setForm({ ...form, specialty: v })}>
              <SelectTrigger>
                <SelectValue placeholder="בחר התמחות" />
              </SelectTrigger>
              <SelectContent>
                {COACH_SPECIALTIES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">הערות למנהל (אופציונלי)</Label>
            <Textarea
              id="notes"
              rows={3}
              maxLength={500}
              value={form.applicantNotes}
              onChange={(e) => setForm({ ...form, applicantNotes: e.target.value })}
            />
          </div>

          {!parsed.success && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <AlertTriangle className="size-3.5" /> יש למלא שם, אימייל תקין והתמחות לפני שליחה.
            </p>
          )}

          <Button className="w-full" onClick={() => void submit()} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : "שליחת הבקשה"}
          </Button>
        </div>
      </main>
    </div>
  );
}

function StatusScreen() {
  const { coachApp } = useStore();
  const navigate = useNavigate();
  if (!coachApp) return null;

  const map = {
    pending: {
      icon: <Clock className="size-6" />,
      title: "הבקשה ממתינה לאישור",
      text: "מנהל המערכת יבדוק את הפרטים שלך. תקבל התראה כשהבקשה תאושר.",
    },
    approved: {
      icon: <CheckCircle2 className="size-6" />,
      title: "החשבון אומת",
      text: "אתה מאמן מאומת ויכול להתחיל לבנות בלוקים למתאמנים שלך.",
    },
    blocked: {
      icon: <ShieldX className="size-6" />,
      title: "החשבון חסום",
      text: coachApp.rejectionReason ?? "החשבון נחסם על ידי מנהל המערכת.",
    },
    rejected: { icon: <ShieldX className="size-6" />, title: "", text: "" },
  } as const;
  const s = map[coachApp.status];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader />
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <span className="mx-auto mb-4 grid size-16 place-items-center rounded-2xl bg-primary text-primary-foreground">
          {s.icon}
        </span>
        <h1 className="text-2xl font-bold">{s.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{s.text}</p>
        {coachApp.status === "approved" && (
          <Button className="mt-6" size="lg" onClick={() => navigate({ to: "/coach" })}>
            מעבר ללוח המאמן
          </Button>
        )}
      </main>
    </div>
  );
}
