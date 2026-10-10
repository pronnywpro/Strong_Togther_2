import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dumbbell, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppHeader } from "@/components/AppHeader";

export const Route = createFileRoute("/")({
  component: LoginPage,
});

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="size-4" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2.5 24 .5 14.6.5 6.5 5.9 2.6 13.7l7.8 6c1.9-5.6 7.2-10.2 13.6-10.2z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.6-4.9 7.3l7.6 5.9c4.4-4.1 7.1-10.2 7.1-17.7z" />
      <path fill="#FBBC05" d="M10.4 28.3a14.8 14.8 0 0 1 0-8.6l-7.8-6a23.5 23.5 0 0 0 0 20.6l7.8-6z" />
      <path fill="#34A853" d="M24 47.5c6.2 0 11.5-2 15.4-5.6l-7.6-5.9c-2.1 1.4-4.8 2.3-7.8 2.3-6.4 0-11.7-4.6-13.6-10.2l-7.8 6C6.5 42.1 14.6 47.5 24 47.5z" />
    </svg>
  );
}

function LoginPage() {
  const { user, hydrated, loading, coachApp } = useStore();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"coach" | "trainee">("trainee");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!hydrated || loading || !user) return;
    if (user.role === "coach")
      navigate({ to: coachApp?.status === "approved" ? "/coach" : "/coach/apply" });
    else if (!user.coachId) navigate({ to: "/connect" });
    else navigate({ to: "/trainee" });
  }, [hydrated, loading, user, coachApp, navigate]);

  const oauth = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      setBusy(false);
      toast.error("ההתחברות נכשלה, נסה שוב");
    }
  };

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) {
      toast.error("אימייל או סיסמה שגויים");
      return;
    }
    toast.success("ברוך הבא!");
  };

  const signUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("סיסמה חייבת להכיל לפחות 6 תווים");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { name: name.trim() || email.split("@")[0], role },
      },
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (!data.session) toast.success("נשלח אליך מייל אימות — אשר אותו כדי להיכנס");
    else toast.success("החשבון נוצר!");
  };

  // Between clicking Google and landing in the app there's a redirect round-trip (and the session
  // is still loading). Show a waiting state instead of the form so it doesn't look stuck.
  // Only wait while actually returning from Google (or signing in); a failed load must never trap
  // the page on this screen.
  const returningFromAuth =
    typeof window !== "undefined" && /access_token=|code=/.test(window.location.hash + window.location.search);
  const waitingForSignIn = busy || !!user || (returningFromAuth && (!hydrated || loading));
  if (waitingForSignIn) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center text-foreground">
        <Loader2 className="size-8 animate-spin text-primary" />
        <p className="text-lg font-semibold">{busy && !user ? "מעביר לחשבון Google…" : "מתחבר…"}</p>
        <p className="text-sm text-muted-foreground">זה יכול לקחת כמה שניות</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader />
      <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-12">
        <div className="animate-fade-up text-center">
          <span className="mx-auto mb-4 grid size-16 place-items-center rounded-2xl bg-primary text-primary-foreground">
            <Dumbbell className="size-7" />
          </span>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">התחברות</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            מאמנים בונים בלוקים, מתאמנים מבצעים אימונים.
          </p>
        </div>

        <div className="surface-card animate-fade-up space-y-3 rounded-2xl p-5">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full gap-2"
            disabled={busy}
            onClick={() => void oauth()}
          >
            <GoogleIcon /> המשך עם Google
          </Button>

          <div className="flex items-center gap-3 py-1 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            או באמצעות אימייל
            <span className="h-px flex-1 bg-border" />
          </div>

          <Tabs defaultValue="signin">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">כניסה</TabsTrigger>
              <TabsTrigger value="signup">הרשמה</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <form onSubmit={signIn} className="space-y-3 pt-3">
                <div className="space-y-2">
                  <Label htmlFor="email">אימייל</Label>
                  <Input id="email" type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">סיסמה</Label>
                  <Input id="password" type="password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} required />
                </div>
                <Button type="submit" size="lg" className="w-full" disabled={busy}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : "כניסה"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={signUp} className="space-y-3 pt-3">
                <div className="space-y-2">
                  <Label htmlFor="su-name">שם מלא</Label>
                  <Input id="su-name" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="su-email">אימייל</Label>
                  <Input id="su-email" type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="su-password">סיסמה</Label>
                  <Input id="su-password" type="password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>אני נרשם בתור</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button type="button" variant={role === "trainee" ? "default" : "outline"} onClick={() => setRole("trainee")}>
                      מתאמן
                    </Button>
                    <Button type="button" variant={role === "coach" ? "default" : "outline"} onClick={() => setRole("coach")}>
                      מאמן
                    </Button>
                  </div>
                </div>
                <Button type="submit" size="lg" className="w-full" disabled={busy}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : "יצירת חשבון"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>

        <p className="animate-fade-up text-center text-xs text-muted-foreground">
          מתאמן חדש? לאחר ההתחברות תתבקש להזין את קוד ההזמנה שקיבלת מהמאמן.
          <br />
          מאמן חדש? לאחר ההרשמה תעבור תהליך אימות קצר ואישור מנהל.
        </p>
      </main>
    </div>
  );
}
