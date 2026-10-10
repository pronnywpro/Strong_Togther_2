import { formatPerformance } from "@/lib/blockSummary";
import type { BlockSummary, BlockSummaryRow } from "@/lib/types";

function ProgressCell({ value }: { value: number | null }) {
  if (value == null) return <span className="text-xs text-muted-foreground">—</span>;
  const tone = value > 0 ? "text-success" : value < 0 ? "text-destructive" : "text-muted-foreground";
  const dot = value > 0 ? "🟢" : value < 0 ? "🔴" : "⚪";
  const sign = value > 0 ? "+" : "";
  return (
    <span className={`font-semibold ${tone}`}>
      {dot} {sign}
      {value.toFixed(1)}%
    </span>
  );
}

function CurrentCell({ row }: { row: BlockSummaryRow }) {
  const text = formatPerformance(row.current);
  const easier =
    row.previous?.rpe != null && row.current.rpe != null && row.current.rpe < row.previous.rpe && (row.progressVsPrevious ?? 0) > 0;
  const harder =
    row.previous?.rpe != null && row.current.rpe != null && row.current.rpe > row.previous.rpe && (row.progressVsPrevious ?? 0) > 0;
  return (
    <span className="font-semibold text-foreground">
      {text}
      {easier && <span title="שיפור בביצוע עם RPE נמוך יותר — סימן חיובי במיוחד"> ✨</span>}
      {harder && <span title="שיפור בביצוע אך במאמץ גבוה יותר"> ⚠️</span>}
    </span>
  );
}

export function BlockSummaryTable({ summary }: { summary: BlockSummary }) {
  if (summary.rows.length === 0) {
    return <p className="text-sm text-muted-foreground">אין נתוני ביצוע לבלוק הזה.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-right text-xs text-muted-foreground">
            <th className="p-2">תרגיל</th>
            <th className="p-2">בלוק קודם</th>
            <th className="p-2">בלוק נוכחי</th>
            <th className="p-2">6 חודשים אחרונים</th>
            <th className="p-2">שינוי מול בלוק קודם</th>
            <th className="p-2">שינוי מול 6 חודשים</th>
          </tr>
        </thead>
        <tbody>
          {summary.rows.map((row) => (
            <tr key={row.exerciseName} className="border-b border-border/60 last:border-0">
              <td className="p-2 font-semibold">{row.exerciseName}</td>
              <td className="p-2 font-mono text-muted-foreground">
                {row.previous ? formatPerformance(row.previous) : <span className="text-xs italic">תרגיל חדש</span>}
              </td>
              <td className="p-2 font-mono">
                <CurrentCell row={row} />
              </td>
              <td className="p-2 font-mono text-muted-foreground">
                {row.sixMonth ? formatPerformance(row.sixMonth) : <span className="text-xs italic">אין נתונים היסטוריים</span>}
              </td>
              <td className="p-2">
                <ProgressCell value={row.progressVsPrevious} />
              </td>
              <td className="p-2">
                <ProgressCell value={row.progressVsSixMonth} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
