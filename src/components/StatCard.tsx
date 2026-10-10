import type { LucideIcon } from "lucide-react";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  trend = "flat",
  tone = "primary",
  index = 0,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  hint?: string;
  trend?: "up" | "down" | "flat";
  tone?: "primary" | "success" | "warning" | "neutral";
  index?: number;
  onClick?: () => void;
}) {
  const toneClass = {
    primary: "text-primary bg-primary/10",
    success: "text-success bg-success/10",
    warning: "text-warning bg-warning/15",
    neutral: "text-foreground bg-muted",
  }[tone];
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "surface-card lift animate-fade-up rounded-2xl p-4 text-right",
        onClick && "cursor-pointer",
      )}
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", toneClass)}>
          <Icon className="size-5" />
        </span>
        <TrendIcon
          className={cn(
            "size-4",
            trend === "up" ? "text-success" : trend === "down" ? "text-destructive" : "text-muted-foreground",
          )}
          aria-hidden="true"
        />
      </div>
      <p className="mt-3 text-2xl font-bold tracking-tight">{value}</p>
      <p className="truncate text-sm text-muted-foreground">{label}</p>
      {hint ? <p className="mt-1 truncate text-xs text-muted-foreground/80">{hint}</p> : null}
    </button>
  );
}

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="surface-card animate-fade-up col-span-full rounded-2xl p-8 text-center">
      <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
        <Icon className="size-7" />
      </span>
      <p className="mt-4 text-lg font-bold">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
