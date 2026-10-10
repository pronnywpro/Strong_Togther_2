import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { KeyRound, Loader2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AppHeader } from "@/components/AppHeader";

export const Route = createFileRoute("/connect")({
  component: ConnectPage,
});

function ConnectPage() {
  const { user, hydrated, loading, redeemInviteCode, updateProfile } = useStore();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!hydrated || loading) return;
    if (!user) navigate({ to: "/" });
    else if (user.role === "coach") navigate({ to: "/coach" });
    else if (user.coachId) navigate({ to: "/trainee" });
  }, [hydrated, loading, user, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.trim().length < 4) {
      toast.error("הזן קוד תקין");
      return;
    }
    setBusy(true);
    const { error } = await redeemInviteCode(code);
    setBusy(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success("התחברת למאמן בהצלחה!");
    navigate({ to: "/trainee" });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader subtitle="חיבור למאמן" />
      <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-12">
        <div className="animate-fade-up text-center">
          <span className="mx-auto mb-4 grid size-16 place-items-center rounded-2xl bg-primary text-primary-foreground">
            <KeyRound className="size-7" />
          </span>
          <h1 className="text-3xl font-bold tracking-tight">קוד הזמנה</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            המאמן שלך מייצר קוד בן 6 תווים ושולח לך אותו. הזן אותו כאן כדי להתחבר.
          </p>
        </div>

        <form onSubmit={submit} className="surface-card animate-fade-up space-y-4 rounded-2xl p-5">
          <div className="space-y-2">
            <Label htmlFor="code">הקוד מהמאמן</Label>
            <Input
              id="code"
              dir="ltr"
              placeholder="ABC123"
              maxLength={10}
              className="text-center text-2xl font-bold tracking-[0.4em] uppercase"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : "התחבר למאמן"}
          </Button>
        </form>

        <div className="animate-fade-up rounded-2xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
          <p className="mb-2">בעצם אתה מאמן?</p>
          <Button
            variant="outline"
            onClick={async () => {
              await updateProfile({ role: "coach" });
              toast.success("החשבון עודכן למאמן");
              navigate({ to: "/coach" });
            }}
          >
            עבור לחשבון מאמן
          </Button>
        </div>
      </main>
    </div>
  );
}
