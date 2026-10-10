import { useMemo, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useExerciseLibrary } from "@/lib/exerciseLibrary";
import { buildProgressSeries, exerciseNamesIn } from "@/lib/exerciseProgress";
import type { Block } from "@/lib/types";
import { Button } from "@/components/ui/button";

const LINE_COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899", "#84cc16", "#8b5cf6"];
const UNCATEGORIZED = "אחר";

/**
 * Weekly progress per exercise, from the trainee's blocks. The coach picks exercises either by
 * body-part category (chip = select/clear all exercises in that category) or one at a time.
 */
export function ExerciseProgressChart({ blocks }: { blocks: Block[] }) {
  const { items, loading } = useExerciseLibrary();
  const [selected, setSelected] = useState<string[]>([]);

  const names = useMemo(() => exerciseNamesIn(blocks), [blocks]);

  // Library names map to their body-part category; custom exercise names fall under "אחר".
  const categoryOf = useMemo(() => {
    const byName = new Map(items.map((i) => [i.name, i.category]));
    return (name: string) => byName.get(name) ?? UNCATEGORIZED;
  }, [items]);

  const groups = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const name of names) {
      const cat = categoryOf(name);
      map.set(cat, [...(map.get(cat) ?? []), name]);
    }
    return [...map.entries()];
  }, [names, categoryOf]);

  const points = useMemo(
    () => buildProgressSeries(blocks, selected).filter((p) => selected.some((n) => p[n] != null)),
    [blocks, selected],
  );

  const toggleOne = (name: string) =>
    setSelected((s) => (s.includes(name) ? s.filter((n) => n !== name) : [...s, name]));

  const toggleCategory = (names: string[]) =>
    setSelected((s) => {
      const allOn = names.every((n) => s.includes(n));
      return allOn ? s.filter((n) => !names.includes(n)) : [...new Set([...s, ...names])];
    });

  if (names.length === 0) {
    return <p className="text-sm text-muted-foreground">אין עדיין תרגילים בבלוקים של המתאמן.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {groups.map(([cat, catNames]) => {
          const on = catNames.every((n) => selected.includes(n));
          return (
            <Button
              key={cat}
              size="sm"
              variant={on ? "default" : "outline"}
              onClick={() => toggleCategory(catNames)}
              aria-pressed={on}
            >
              {cat}
            </Button>
          );
        })}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {groups.flatMap(([cat, catNames]) =>
          catNames.map((name) => (
            <label
              key={name}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted/50"
            >
              <input
                type="checkbox"
                className="size-4 accent-[var(--primary)]"
                checked={selected.includes(name)}
                onChange={() => toggleOne(name)}
              />
              <span className="truncate">{name}</span>
              <span className="ms-auto shrink-0 text-xs text-muted-foreground">{cat}</span>
            </label>
          )),
        )}
      </div>

      {selected.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {loading ? "טוען…" : "בחר קטגוריה או תרגילים כדי לראות את ההתקדמות השבועית."}
        </p>
      ) : points.length === 0 ? (
        <p className="text-sm text-muted-foreground">אין עדיין ביצועים מתועדים לתרגילים שנבחרו.</p>
      ) : (
        <div className="h-80 w-full" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 8, right: 16, bottom: 56, left: 8 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis
                dataKey="label"
                angle={-35}
                textAnchor="end"
                interval={0}
                height={70}
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              />
              <YAxis
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                label={{ value: 'ק"ג (1RM תיאורטי)', angle: -90, position: "insideLeft", fill: "var(--muted-foreground)" }}
                domain={["auto", "auto"]}
              />
              <Tooltip
                contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12 }}
                labelStyle={{ color: "var(--foreground)" }}
              />
              <Legend />
              {selected.map((name, i) => (
                <Line
                  key={name}
                  type="monotone"
                  dataKey={name}
                  stroke={LINE_COLORS[i % LINE_COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls
                  name={name}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
