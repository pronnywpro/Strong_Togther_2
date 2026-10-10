import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Bell, Dumbbell, History, LogOut, Moon, Sun, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function AppHeader({ subtitle }: { subtitle?: string }) {
  const { user, logout, theme, toggleTheme, state, isAdmin, markNotificationsRead, dismissNotification } =
    useStore();
  const navigate = useNavigate();
  const [historyOpen, setHistoryOpen] = useState(false);

  const mine = user ? state.notifications.filter((n) => n.toUserId === user.id) : [];
  const myNotifications = mine.filter((n) => !n.dismissed);
  const unreadCount = myNotifications.filter((n) => !n.read).length;
  const senderName = (id?: string) => state.users.find((u) => u.id === id)?.name;
  const fmtDate = (t: number) =>
    new Date(t).toLocaleDateString("he-IL", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="mx-auto grid max-w-5xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
        <Link to="/" className="flex min-w-0 items-center gap-2">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Dumbbell className="size-5" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-base font-bold tracking-tight text-foreground">
              Strong Together
            </span>
            {subtitle ? (
              <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
            ) : null}
          </span>
        </Link>
        <div className="flex shrink-0 items-center gap-1">
          {isAdmin ? (
            <Link
              to="/admin"
              className="rounded-lg px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/10"
            >
              ניהול
            </Link>
          ) : null}
          <DropdownMenu
            onOpenChange={(o) => {
              if (o && user) markNotificationsRead(user.id);
            }}
          >
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="התראות" className="relative">
                <Bell className="size-5" />
                {unreadCount > 0 && (
                  <Badge className="absolute top-0 left-0 h-4 min-w-4 justify-center px-1 text-[10px]">
                    {unreadCount}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72">
              <DropdownMenuLabel>התראות</DropdownMenuLabel>
              {myNotifications.length === 0 && (
                <DropdownMenuItem disabled>אין התראות חדשות</DropdownMenuItem>
              )}
              {myNotifications.slice(0, 8).map((n) => (
                <div
                  key={n.id}
                  className="flex items-start gap-2 px-2 py-1.5 text-sm whitespace-normal"
                >
                  <span className="min-w-0 flex-1">
                    {n.text}
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">
                      {senderName(n.fromUserId) ? `${senderName(n.fromUserId)} · ` : ""}
                      {fmtDate(n.createdAt)}
                    </span>
                  </span>
                  {n.read ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 shrink-0"
                      aria-label="מחק התראה"
                      onClick={(e) => {
                        e.preventDefault();
                        dismissNotification(n.id);
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  ) : null}
                </div>
              ))}
              <DropdownMenuItem onSelect={() => setHistoryOpen(true)} className="text-sm">
                <History className="size-4" /> היסטוריית הודעות
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>היסטוריית הודעות</DialogTitle>
              </DialogHeader>
              <div className="max-h-[60vh] space-y-2 overflow-y-auto">
                {mine.length === 0 && (
                  <p className="text-sm text-muted-foreground">אין הודעות בהיסטוריה</p>
                )}
                {mine.map((n) => (
                  <div key={n.id} className="surface-card rounded-xl p-3 text-sm">
                    <p className={n.dismissed ? "text-muted-foreground" : ""}>{n.text}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {senderName(n.fromUserId) ? `${senderName(n.fromUserId)} · ` : ""}
                      {fmtDate(n.createdAt)}
                      {n.dismissed ? " · נמחקה מהתיבה" : ""}
                    </p>
                  </div>
                ))}
              </div>
            </DialogContent>
          </Dialog>
          <Button variant="ghost" size="icon" aria-label="החלף מצב תצוגה" onClick={toggleTheme}>
            {theme === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}
          </Button>
          {user && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="התנתקות"
              onClick={() => {
                void logout().then(() => navigate({ to: "/" }));
              }}
            >
              <LogOut className="size-5" />
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
