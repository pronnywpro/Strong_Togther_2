import { useState } from "react";
import { theoreticalWeight } from "@/lib/progression";
import type { AccessoryConfig, AccessoryGroupConfig, PrimaryConfig, ProgressionKind } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const KIND_OPTIONS: { value: ProgressionKind; label: string }[] = [
  { value: "weight", label: "משקל" },
  { value: "reps", label: "חזרות" },
  { value: "none", label: "ללא קידום אוטומטי" },
];

export function emptyPrimaryConfig(progressionId: string, exerciseName: string, totalWeeks: number): PrimaryConfig {
  return {
    progressionId,
    exerciseName,
    kind: "none",
    oneRepMax: null,
    fixedValue: null,
    targetWeek: null,
    targetValue: null,
    progressionPattern: Array.from({ length: Math.max(0, totalWeeks - 1) }, () => 0),
    expectedRpe: Array.from({ length: totalWeeks }, () => null),
  };
}

export function emptyAccessoryConfig(progressionId: string, exerciseName: string, totalWeeks: number): AccessoryConfig {
  return {
    progressionId,
    exerciseName,
    kind: "none",
    fixedValue: null,
    progressionPattern: Array.from({ length: Math.max(0, totalWeeks - 1) }, () => 0),
  };
}

export function emptyAccessoryGroup(totalWeeks: number): AccessoryGroupConfig {
  return { kind: "none", progressionPattern: Array.from({ length: Math.max(0, totalWeeks - 1) }, () => 0) };
}

/**
 * Signed step input: a +/− toggle plus a plain magnitude field. Typing a minus into a number
 * field doesn't work on iPhone (the numeric keypad has no minus key, and a lone "-" gets
 * cleared), so the sign is a button instead.
 */
function DeltaInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [negative, setNegative] = useState(value < 0);
  const magnitude = Math.abs(value);
  const apply = (mag: number, neg: boolean) => onChange(neg ? -mag : mag);
  return (
    <div className="flex items-center gap-1" dir="ltr">
      <button
        type="button"
        aria-label={negative ? "שינוי שלילי" : "שינוי חיובי"}
        onClick={() => {
          setNegative((n) => !n);
          apply(magnitude, !negative);
        }}
        className="grid size-9 shrink-0 place-items-center rounded-lg border border-border font-bold transition-colors hover:bg-muted"
      >
        {negative ? "−" : "+"}
      </button>
      <Input
        type="number"
        inputMode="decimal"
        min={0}
        step="any"
        className="font-mono"
        placeholder="0"
        value={magnitude === 0 ? "" : magnitude}
        onChange={(e) => apply(e.target.value === "" ? 0 : Math.abs(Number(e.target.value)) || 0, negative)}
      />
    </div>
  );
}

function KindSelect({ value, onChange }: { value: ProgressionKind; onChange: (v: ProgressionKind) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">סוג קידום</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {KIND_OPTIONS.map((k) => (
            <SelectItem key={k.value} value={k.value}>
              {k.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function FixedValueInput({
  kind,
  value,
  onChange,
}: {
  kind: ProgressionKind;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  if (kind === "none") return null;
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">{kind === "weight" ? "חזרות קבועות" : 'משקל קבוע (ק"ג)'}</Label>
      <Input
        type="number"
        inputMode="decimal"
        className="font-mono"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      />
    </div>
  );
}

function PatternEditor({
  kind,
  pattern,
  onChange,
}: {
  kind: ProgressionKind;
  pattern: number[];
  onChange: (pattern: number[]) => void;
}) {
  if (kind === "none") return null;
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">תבנית קידום (שינוי בין שבועות)</Label>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {pattern.map((delta, i) => (
          <div key={i} className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">{`שבוע ${i + 1}→${i + 2}`}</Label>
            <DeltaInput
              value={delta}
              onChange={(v) => onChange(pattern.map((d, j) => (j === i ? v : d)))}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Rich per-exercise editor for Primary and Secondary tiers (identical shape/behavior). */
export function PrimaryLikeConfigEditor({
  config,
  totalWeeks,
  onChange,
}: {
  config: PrimaryConfig;
  totalWeeks: number;
  onChange: (patch: Partial<PrimaryConfig>) => void;
}) {
  const hint =
    config.kind === "weight" && config.oneRepMax && config.fixedValue
      ? `המשקל התיאורטי ל-${config.fixedValue} חזרות לפי 1RM זה: ${theoreticalWeight(config.oneRepMax, config.fixedValue)} ק"ג`
      : null;

  return (
    <div className="space-y-3">
      <KindSelect value={config.kind} onChange={(v) => onChange({ kind: v })} />
      <div className="space-y-1">
        <Label className="text-[11px] text-muted-foreground">1RM תיאורטי (ק"ג)</Label>
        <Input
          type="number"
          inputMode="decimal"
          className="font-mono"
          value={config.oneRepMax ?? ""}
          onChange={(e) => onChange({ oneRepMax: e.target.value === "" ? null : Number(e.target.value) })}
        />
      </div>
      <FixedValueInput kind={config.kind} value={config.fixedValue} onChange={(v) => onChange({ fixedValue: v })} />
      {hint && <p className="text-xs text-accent-foreground">{hint}</p>}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">שבוע יעד</Label>
          <Input
            type="number"
            min={1}
            max={totalWeeks}
            className="font-mono"
            value={config.targetWeek ?? ""}
            onChange={(e) => onChange({ targetWeek: e.target.value === "" ? null : Number(e.target.value) })}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">ערך יעד</Label>
          <Input
            type="number"
            inputMode="decimal"
            className="font-mono"
            value={config.targetValue ?? ""}
            onChange={(e) => onChange({ targetValue: e.target.value === "" ? null : Number(e.target.value) })}
          />
        </div>
      </div>
      <PatternEditor kind={config.kind} pattern={config.progressionPattern} onChange={(p) => onChange({ progressionPattern: p })} />
      <div className="space-y-1">
        <Label className="text-[11px] text-muted-foreground">RPE צפוי לכל שבוע (למאמן בלבד — המתאמן לא רואה זאת)</Label>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {config.expectedRpe.map((rpe, i) => (
            <div key={i} className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">שבוע {i + 1}</Label>
              <Input
                type="number"
                step={0.5}
                min={1}
                max={10}
                className="font-mono"
                value={rpe ?? ""}
                onChange={(e) => {
                  const v = e.target.value === "" ? null : Number(e.target.value);
                  onChange({ expectedRpe: config.expectedRpe.map((r, j) => (j === i ? v : r)) });
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Lightweight per-exercise editor for an accessory exception — no 1RM/target/RPE. */
export function AccessoryExceptionEditor({
  config,
  onChange,
}: {
  config: AccessoryConfig;
  onChange: (patch: Partial<AccessoryConfig>) => void;
}) {
  return (
    <div className="space-y-3">
      <KindSelect value={config.kind} onChange={(v) => onChange({ kind: v })} />
      <FixedValueInput kind={config.kind} value={config.fixedValue} onChange={(v) => onChange({ fixedValue: v })} />
      <PatternEditor kind={config.kind} pattern={config.progressionPattern} onChange={(p) => onChange({ progressionPattern: p })} />
    </div>
  );
}

/** The one shared rule for every accessory exercise without its own exception — no fixedValue,
 * since each exercise's own current value stays fixed for whichever dimension doesn't progress. */
export function AccessoryGroupEditor({
  config,
  onChange,
}: {
  config: AccessoryGroupConfig;
  onChange: (patch: Partial<AccessoryGroupConfig>) => void;
}) {
  return (
    <div className="space-y-3">
      <KindSelect value={config.kind} onChange={(v) => onChange({ kind: v })} />
      <PatternEditor kind={config.kind} pattern={config.progressionPattern} onChange={(p) => onChange({ progressionPattern: p })} />
    </div>
  );
}
