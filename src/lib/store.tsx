import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type {
  AppNotification,
  AppState,
  Block,
  CoachApplication,
  CoachStatus,
  Exercise,
  Role,
  User,
  WorkoutSet,
} from "./types";

const THEME_KEY = "st_theme_v1";

export const uid = () => Math.random().toString(36).slice(2, 10);

function mkSet(
  repsMin: number | null,
  repsMax: number | null,
  weightMin: number | null,
  weightMax: number | null,
  rpeMin: number | null,
  rpeMax: number | null,
): WorkoutSet {
  return {
    id: uid(),
    hasReps: repsMin != null || repsMax != null,
    repsMin,
    repsMax,
    hasWeight: weightMin != null || weightMax != null,
    weightMin,
    weightMax,
    hasRpe: rpeMin != null || rpeMax != null,
    rpeMin,
    rpeMax,
    actualReps: null,
    actualWeight: null,
    actualRpe: null,
    videoId: null,
  };
}

/* ---------- row mappers ---------- */

type BlockRow = {
  id: string;
  coach_id: string;
  trainee_id: string | null;
  name: string;
  total_weeks: number;
  workouts_per_week: number;
  current_week: number;
  completed_at: number | null;
  weeks: unknown;
  primary_configs: unknown;
  accessory_configs: unknown;
  secondary_configs: unknown;
  accessory_group: unknown;
  created_at: string;
};

const toBlock = (r: BlockRow): Block => ({
  id: r.id,
  coachId: r.coach_id,
  traineeId: r.trainee_id,
  name: r.name,
  totalWeeks: r.total_weeks,
  workoutsPerWeek: r.workouts_per_week,
  currentWeek: r.current_week,
  completedAt: r.completed_at ?? null,
  weeks: (Array.isArray(r.weeks) ? r.weeks : []) as Block["weeks"],
  primaryConfigs: (r.primary_configs ?? {}) as Block["primaryConfigs"],
  accessoryConfigs: (r.accessory_configs ?? {}) as Block["accessoryConfigs"],
  secondaryConfigs: (r.secondary_configs ?? {}) as Block["secondaryConfigs"],
  accessoryGroup: (r.accessory_group ?? null) as Block["accessoryGroup"],
  createdAt: new Date(r.created_at).getTime(),
});

const fromBlock = (b: Block) => ({
  id: b.id,
  coach_id: b.coachId,
  trainee_id: b.traineeId,
  name: b.name,
  total_weeks: b.totalWeeks,
  workouts_per_week: b.workoutsPerWeek,
  current_week: b.currentWeek,
  completed_at: b.completedAt ?? null,
  weeks: b.weeks as unknown as Json,
  primary_configs: (b.primaryConfigs ?? {}) as unknown as Json,
  accessory_configs: (b.accessoryConfigs ?? {}) as unknown as Json,
  secondary_configs: (b.secondaryConfigs ?? {}) as unknown as Json,
  accessory_group: (b.accessoryGroup ?? null) as unknown as Json,
});

type ProfileRow = { id: string; name: string; email: string; role: Role; coach_id: string | null };
type GroupRow = { id: string; coach_id: string; name: string };

/** Single source of truth for the blocks insert payload, shared by createBlock and createBlocks. */
const toBlockInsert = (b: Omit<Block, "id">) => ({
  coach_id: b.coachId,
  trainee_id: b.traineeId,
  name: b.name,
  total_weeks: b.totalWeeks,
  workouts_per_week: b.workoutsPerWeek,
  current_week: b.currentWeek,
  weeks: b.weeks as unknown as Json,
  primary_configs: (b.primaryConfigs ?? {}) as unknown as Json,
  accessory_configs: (b.accessoryConfigs ?? {}) as unknown as Json,
  secondary_configs: (b.secondaryConfigs ?? {}) as unknown as Json,
  accessory_group: (b.accessoryGroup ?? null) as unknown as Json,
});

const toUser = (p: ProfileRow): User => ({
  id: p.id,
  name: p.name || p.email,
  email: p.email,
  role: p.role,
  coachId: p.coach_id,
});

type NotifRow = {
  id: string;
  to_user_id: string;
  from_user_id: string | null;
  to_role: Role;
  text: string;
  read: boolean;
  dismissed: boolean;
  created_at: string;
};
const toNotif = (n: NotifRow): AppNotification => ({
  id: n.id,
  to: n.to_role,
  toUserId: n.to_user_id,
  fromUserId: n.from_user_id ?? undefined,
  text: n.text,
  createdAt: new Date(n.created_at).getTime(),
  read: n.read,
  dismissed: n.dismissed,
});

type CoachAppRow = {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  specialty: string;
  applicant_notes: string;
  status: CoachStatus;
  admin_notes: string;
  rejection_reason: string | null;
  reviewed_at: string | null;
  created_at: string;
};

export const toCoachApp = (r: CoachAppRow): CoachApplication => ({
  id: r.id,
  userId: r.user_id,
  fullName: r.full_name,
  email: r.email,
  specialty: r.specialty,
  applicantNotes: r.applicant_notes,
  status: r.status,
  adminNotes: r.admin_notes,
  rejectionReason: r.rejection_reason,
  reviewedAt: r.reviewed_at,
  createdAt: r.created_at,
});

/* ---------- context ---------- */

interface Ctx {
  hydrated: boolean;
  loading: boolean;
  state: AppState;
  user: User | null;
  isAdmin: boolean;
  coachApp: CoachApplication | null;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  theme: "dark" | "light";
  toggleTheme: () => void;
  updateBlock: (blockId: string, fn: (b: Block) => Block) => void;
  createBlock: (b: Omit<Block, "id">) => Promise<string | null>;
  createBlocks: (blocks: Omit<Block, "id">[]) => Promise<number>;
  deleteBlock: (blockId: string) => Promise<void>;
  notify: (to: Role, text: string, toUserId?: string, fromUserId?: string) => void;
  markNotificationsRead: (userId: string) => void;
  dismissNotification: (id: string) => void;
  createInviteCode: () => Promise<string | null>;
  redeemInviteCode: (code: string) => Promise<{ error?: string }>;
  updateProfile: (patch: { name?: string; role?: Role }) => Promise<void>;
  createGroup: (name: string) => Promise<string | null>;
  deleteGroup: (groupId: string) => Promise<void>;
  addGroupMember: (groupId: string, traineeId: string) => Promise<boolean>;
  removeGroupMember: (traineeId: string) => Promise<void>;
}

const emptyState: AppState = { users: [], blocks: [], notifications: [], groups: [] };
const StoreContext = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setRaw] = useState<AppState>(emptyState);
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [coachApp, setCoachApp] = useState<CoachApplication | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [hydrated, setHydrated] = useState(false);
  const [loading, setLoading] = useState(true);
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const loadState = useCallback(async () => {
    // getSession (not getUser): it waits for the OAuth redirect's URL tokens to be stored first.
    // getUser() ran too early after the Google redirect, saw "no user", and the login screen
    // showed again until a second sign-in attempt.
    const { data: sessionData } = await supabase.auth.getSession();
    const authUser = sessionData.session?.user ?? null;
    if (!authUser) {
      setUser(null);
      setIsAdmin(false);
      setCoachApp(null);
      setRaw(emptyState);
      setLoading(false);
      setHydrated(true);
      return;
    }

    const [
      { data: profiles },
      { data: blocks },
      { data: notifs },
      { data: roles },
      { data: app },
      { data: groups },
      { data: groupMembers },
    ] = await Promise.all([
      supabase.from("profiles").select("id,name,email,role,coach_id"),
      supabase.from("blocks").select("*"),
      supabase.from("notifications").select("*").order("created_at", { ascending: false }),
      supabase.from("user_roles").select("role").eq("user_id", authUser.id),
      supabase.from("coach_applications").select("*").eq("user_id", authUser.id).maybeSingle(),
      supabase.from("groups").select("id,coach_id,name"),
      supabase.from("group_members").select("trainee_id,group_id"),
    ]);

    const users = ((profiles ?? []) as ProfileRow[]).map(toUser);
    const memberRows = (groupMembers ?? []) as { trainee_id: string; group_id: string }[];
    setUser(users.find((u) => u.id === authUser.id) ?? null);
    setIsAdmin(((roles ?? []) as { role: string }[]).some((r) => r.role === "admin"));
    setCoachApp(app ? toCoachApp(app as unknown as CoachAppRow) : null);
    setRaw({
      users,
      blocks: ((blocks ?? []) as BlockRow[]).map(toBlock),
      notifications: ((notifs ?? []) as NotifRow[]).map(toNotif),
      groups: ((groups ?? []) as GroupRow[]).map((g) => ({
        id: g.id,
        coachId: g.coach_id,
        name: g.name,
        memberIds: memberRows.filter((m) => m.group_id === g.id).map((m) => m.trainee_id),
      })),
    });

  }, []);

  // Always finish loading, even if a query throws — otherwise the app (and the login screen) can
  // stay stuck waiting forever.
  const load = useCallback(async () => {
    try {
      await loadState();
    } catch (err) {
      console.error("failed to load session data", err);
    } finally {
      setLoading(false);
      setHydrated(true);
    }
  }, [loadState]);

  useEffect(() => {
    const t = typeof window !== "undefined" ? (localStorage.getItem(THEME_KEY) as "dark" | "light" | null) : null;
    if (t) setTheme(t);
    void load();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") void load();
    });
    return () => sub.subscription.unsubscribe();
  }, [load]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.lang = "he";
    document.documentElement.dir = "rtl";
    if (hydrated) localStorage.setItem(THEME_KEY, theme);
  }, [theme, hydrated]);

  const persistBlock = useCallback((b: Block) => {
    const timers = saveTimers.current;
    const existing = timers[b.id];
    if (existing) clearTimeout(existing);
    timers[b.id] = setTimeout(() => {
      void (async () => {
        const { error } = await supabase.from("blocks").update(fromBlock(b)).eq("id", b.id);
        if (error) console.error("block save failed", error);
      })();
    }, 400);
  }, []);

  const updateBlock = useCallback(
    (blockId: string, fn: (b: Block) => Block) =>
      setRaw((s) => {
        let updated: Block | null = null;
        const blocks = s.blocks.map((b) => {
          if (b.id !== blockId) return b;
          updated = fn(b);
          return updated;
        });
        if (updated) persistBlock(updated);
        return { ...s, blocks };
      }),
    [persistBlock],
  );

  const createBlock = useCallback(async (b: Omit<Block, "id">) => {
    const { data, error } = await supabase.from("blocks").insert(toBlockInsert(b)).select("*").single();
    if (error || !data) return null;
    const created = toBlock(data as unknown as BlockRow);
    setRaw((s) => ({ ...s, blocks: [...s.blocks, created] }));
    return created.id;

  }, []);

  const deleteBlock = useCallback(async (blockId: string) => {
    setRaw((s) => ({ ...s, blocks: s.blocks.filter((b) => b.id !== blockId) }));
    await supabase.from("blocks").delete().eq("id", blockId);
  }, []);

  /** Batch insert, one row per block (e.g. one copy per group member). Returns how many were created. */
  const createBlocks = useCallback(async (blocks: Omit<Block, "id">[]) => {
    if (blocks.length === 0) return 0;
    const { data, error } = await supabase
      .from("blocks")
      .insert(blocks.map(toBlockInsert))
      .select("*");
    if (error || !data) return 0;
    const created = (data as unknown as BlockRow[]).map(toBlock);
    setRaw((s) => ({ ...s, blocks: [...s.blocks, ...created] }));
    return created.length;
  }, []);

  const createGroup = useCallback(
    async (name: string) => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("groups")
        .insert({ coach_id: user.id, name })
        .select("id")
        .single();
      if (error || !data) return null;
      setRaw((s) => ({
        ...s,
        groups: [...s.groups, { id: data.id, coachId: user.id, name, memberIds: [] }],
      }));
      return data.id;
    },
    [user],
  );

  const deleteGroup = useCallback(async (groupId: string) => {
    setRaw((s) => ({ ...s, groups: s.groups.filter((g) => g.id !== groupId) }));
    await supabase.from("groups").delete().eq("id", groupId);
  }, []);

  /** Returns false if the trainee already belongs to a group (the DB enforces one group per trainee). */
  const addGroupMember = useCallback(async (groupId: string, traineeId: string) => {
    const { error } = await supabase.from("group_members").insert({ group_id: groupId, trainee_id: traineeId });
    if (error) return false;
    setRaw((s) => ({
      ...s,
      groups: s.groups.map((g) =>
        g.id === groupId ? { ...g, memberIds: [...g.memberIds, traineeId] } : g,
      ),
    }));
    return true;
  }, []);

  const removeGroupMember = useCallback(async (traineeId: string) => {
    setRaw((s) => ({
      ...s,
      groups: s.groups.map((g) => ({ ...g, memberIds: g.memberIds.filter((id) => id !== traineeId) })),
    }));
    await supabase.from("group_members").delete().eq("trainee_id", traineeId);
  }, []);

  const notify = useCallback(
    (to: Role, text: string, toUserId?: string, fromUserId?: string) => {
      if (!toUserId || !fromUserId) return;
      void (async () => {
        const { data } = await supabase
          .from("notifications")
          .insert({ to_role: to, text, to_user_id: toUserId, from_user_id: fromUserId })
          .select("*")
          .single();
        if (data) {
          const n = toNotif(data as unknown as NotifRow);
          setRaw((s) => ({ ...s, notifications: [n, ...s.notifications] }));
        }
      })();
    },
    [],
  );

  const markNotificationsRead = useCallback((userId: string) => {
    setRaw((s) => ({
      ...s,
      notifications: s.notifications.map((n) =>
        n.toUserId === userId && !n.read ? { ...n, read: true } : n,
      ),
    }));
    void (async () => {
      await supabase.from("notifications").update({ read: true }).eq("to_user_id", userId).eq("read", false);
    })();
  }, []);

  const dismissNotification = useCallback((id: string) => {
    setRaw((s) => ({
      ...s,
      notifications: s.notifications.map((n) => (n.id === id ? { ...n, dismissed: true } : n)),
    }));
    void (async () => {
      await supabase.from("notifications").update({ dismissed: true }).eq("id", id);
    })();
  }, []);

  const createInviteCode = useCallback(async () => {
    if (!user) return null;
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const code = Array.from({ length: 6 }, () =>
      alphabet[Math.floor(Math.random() * alphabet.length)],
    ).join("");
    const { error } = await supabase.from("invite_codes").insert({ code, coach_id: user.id });
    return error ? null : code;
  }, [user]);

  const redeemInviteCode = useCallback(
    async (code: string) => {
      const { error } = await supabase.rpc("redeem_invite_code", { _code: code });
      if (error) {
        if (error.message.includes("own_code")) return { error: "זה הקוד שלך" };
        return { error: "קוד לא תקין או שכבר נוצל" };
      }
      await load();
      return {};
    },
    [load],
  );

  const updateProfile = useCallback(
    async (patch: { name?: string; role?: Role }) => {
      if (!user) return;
      const row: { name?: string; role?: Role } = {};
      if (patch.name !== undefined) row.name = patch.name;
      if (patch.role !== undefined) row.role = patch.role;
      await supabase.from("profiles").update(row).eq("id", user.id);
      await load();
    },
    [user, load],
  );

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setIsAdmin(false);
    setCoachApp(null);
    setRaw(emptyState);
  }, []);

  const value = useMemo(
    () => ({
      hydrated,
      loading,
      state,
      user,
      isAdmin,
      coachApp,
      refresh: load,
      logout,
      theme,
      toggleTheme: () => setTheme((t) => (t === "dark" ? "light" : "dark")),
      updateBlock,
      createBlock,
      createBlocks,
      deleteBlock,
      notify,
      markNotificationsRead,
      dismissNotification,
      createInviteCode,
      redeemInviteCode,
      updateProfile,
      createGroup,
      deleteGroup,
      addGroupMember,
      removeGroupMember,
    }),
    [
      hydrated,
      loading,
      state,
      user,
      isAdmin,
      coachApp,
      load,
      logout,
      theme,
      updateBlock,
      createBlock,
      createBlocks,
      deleteBlock,
      notify,
      markNotificationsRead,
      dismissNotification,
      createInviteCode,
      redeemInviteCode,
      updateProfile,
      createGroup,
      deleteGroup,
      addGroupMember,
      removeGroupMember,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside StoreProvider");
  return ctx;
}

export function emptyExercise(name: string): Exercise {
  return { id: uid(), name, coachNotes: "", sets: [mkSet(8, 12, 40, 50, 7, 8)] };
}

export function newSet(): WorkoutSet {
  return mkSet(8, 12, 40, 50, 7, 8);
}
