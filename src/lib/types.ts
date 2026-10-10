export type Role = "coach" | "trainee";

export type CoachStatus = "pending" | "approved" | "rejected" | "blocked";

export interface CoachApplication {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  specialty: string;
  applicantNotes: string;
  status: CoachStatus;
  adminNotes: string;
  rejectionReason: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export const COACH_SPECIALTIES = [
  "כוח ופאוורליפטינג",
  "בניית שריר",
  "כושר גופני כללי",
  "אתלטיקה וספורט תחרותי",
  "שיקום ופציעות",
  "אימון נשים",
] as const;

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  coachId?: string | null;
}

export interface WorkoutSet {
  id: string;
  hasReps: boolean;
  repsMin: number | null;
  repsMax: number | null;
  hasWeight: boolean;
  weightMin: number | null;
  weightMax: number | null;
  hasRpe: boolean;
  rpeMin: number | null;
  rpeMax: number | null;
  actualReps?: number | null;
  actualWeight?: number | null;
  actualRpe?: number | null;
  videoId?: string | null;
  note?: string;
  skipped?: boolean;
  skipReason?: string;
  needsUpdate?: boolean;
}

export type ExerciseTier = "primary" | "secondary" | "accessory";

export interface Exercise {
  id: string;
  name: string;
  coachNotes?: string;
  skipped?: boolean;
  skipReason?: string;
  sets: WorkoutSet[];
  /** Stable across weeks (preserved by cloneWeek/generateNextWeek, unlike `id`). Links this
   * exercise to its Block-level config entry (primary/secondary/accessory-exception), if any. */
  progressionId?: string;
  /** Assigned automatically on creation (1st exercise in a workout -> primary, 2nd -> secondary,
   * rest -> accessory) and reassignable afterward. Undefined only for pre-existing legacy
   * exercises created before this field existed — see progression.ts's tierOf() fallback. */
  tier?: ExerciseTier;
}

export type ProgressionKind = "weight" | "reps" | "none";

export interface PrimaryConfig {
  progressionId: string;
  /** Display convenience only, not a lookup key. */
  exerciseName: string;
  kind: ProgressionKind;
  oneRepMax: number | null;
  /** Fixed reps (kind="weight") or fixed weight (kind="reps"). */
  fixedValue: number | null;
  /** Informational only (spec §9D) — not auto-solved against progressionPattern. */
  targetWeek: number | null;
  targetValue: number | null;
  /** progressionPattern[i] = delta applied going week (i+1) -> week (i+2). Length = totalWeeks-1. */
  progressionPattern: number[];
  /** expectedRpe[i] = expected max RPE for week (i+1). Length = totalWeeks. Coach-only — never shown to the trainee. */
  expectedRpe: (number | null)[];
}

export interface AccessoryConfig {
  progressionId: string;
  exerciseName: string;
  kind: ProgressionKind;
  fixedValue: number | null;
  progressionPattern: number[];
}

/** The one shared rule applied to every accessory exercise that doesn't have its own exception
 * entry in Block.accessoryConfigs. No fixedValue — each exercise's own current set value stays
 * as-is for whichever dimension isn't the one progressing (see progression.ts). */
export interface AccessoryGroupConfig {
  kind: ProgressionKind;
  progressionPattern: number[];
}

export interface Workout {
  id: string;
  title: string;
  exercises: Exercise[];
  completedAt?: number | null;
}

export interface Week {
  weekNumber: number;
  published?: boolean;
  reviewed?: boolean;
  workouts: Workout[];
}

export interface Block {
  id: string;
  coachId: string;
  /** Null until the coach assigns a trainee — a block can be created and built out as a
   * draft/template first (spec: block creation shouldn't depend on picking a trainee upfront). */
  traineeId: string | null;
  name: string;
  totalWeeks: number;
  workoutsPerWeek: number;
  currentWeek: number;
  /** Creation time (ms). Used to order blocks chronologically in progress charts. */
  createdAt?: number;
  completedAt?: number | null;
  weeks: Week[];
  /** Keyed by Exercise.progressionId. Which dict (if any) applies is determined by the
   * exercise's tier — see progression.ts's resolveConfig(). */
  primaryConfigs?: Record<string, PrimaryConfig>;
  secondaryConfigs?: Record<string, PrimaryConfig>;
  /** Per-exercise overrides ("exceptions") for accessory exercises that opt out of accessoryGroup. */
  accessoryConfigs?: Record<string, AccessoryConfig>;
  /** The default rule for every accessory exercise without an entry in accessoryConfigs. */
  accessoryGroup?: AccessoryGroupConfig | null;
}

/** A single performance value, always displayed compactly as "weight × reps @ rpe" (spec: Block
 * Summary §4) rather than split into separate columns. `weight`/`reps` null when that dimension
 * isn't tracked for the exercise; `rpe` null when not logged. */
export interface PerformanceSnapshot {
  weight: number | null;
  reps: number | null;
  rpe: number | null;
}

export interface BlockSummaryRow {
  exerciseName: string;
  /** null = exercise didn't exist (by name) in the previous completed block -> "New Exercise". */
  previous: PerformanceSnapshot | null;
  current: PerformanceSnapshot;
  /** null = no matching performance logged in the 6 months before this block completed. */
  sixMonth: PerformanceSnapshot | null;
  /** Percent, based on theoretical-1RM-equivalent (never adjusted for RPE). Null iff `previous` is null. */
  progressVsPrevious: number | null;
  /** Percent, vs the best matching performance in the 6-month window. Null iff `sixMonth` is null. */
  progressVsSixMonth: number | null;
}

/** Frozen historical snapshot, generated once when a block is marked complete and never
 * recomputed or overwritten afterward (spec: Block Summary §3/§18) — later changes to the
 * athlete's program, 1RMs, or later blocks must not alter it. */
export interface BlockSummary {
  id: string;
  blockId: string;
  coachId: string;
  traineeId: string;
  blockName: string;
  completedAt: number;
  rows: BlockSummaryRow[];
  createdAt: string;
}

export interface AppNotification {
  id: string;
  to: Role;
  toUserId?: string | undefined;
  fromUserId?: string | undefined;
  text: string;
  createdAt: number;
  read?: boolean;
  dismissed?: boolean;
}

export interface AppState {
  users: User[];
  blocks: Block[];
  notifications: AppNotification[];
  groups: Group[];
}

/** A coach's named set of their own trainees. A trainee belongs to at most one group
 * (enforced by the group_members primary key). */
export interface Group {
  id: string;
  coachId: string;
  name: string;
  memberIds: string[];
}

export const WORKOUT_TITLES = ["Legs", "Upper Body", "Chest", "Back", "Arms", "Shoulders"];

// The flat hardcoded exercise list that used to live here has been replaced by the
// `exercise_library` Supabase table (seeded in supabase/schema.sql, grouped by body
// part). See src/lib/exerciseLibrary.ts for the categories and the loader hook.
