-- Strong Together — full schema for a fresh Supabase project.
-- Run this once in the Supabase Dashboard → SQL Editor (paste and Run).
-- Safe to re-run: every statement is idempotent (CREATE ... IF NOT EXISTS / DROP ... IF EXISTS first).

-- ============================================================
-- profiles + roles
-- ============================================================

DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('coach', 'trainee');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  role public.app_role NOT NULL DEFAULT 'trainee',
  coach_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE TYPE public.system_role AS ENUM ('admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.system_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_system_role(_user_id uuid, _role public.system_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;
REVOKE ALL ON FUNCTION public.has_system_role(uuid, public.system_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_system_role(uuid, public.system_role) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.my_coach_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coach_id FROM public.profiles WHERE id = auth.uid()
$$;
REVOKE ALL ON FUNCTION public.my_coach_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_coach_id() TO authenticated;

DROP POLICY IF EXISTS "profiles_select_related" ON public.profiles;
CREATE POLICY "profiles_select_related" ON public.profiles FOR SELECT TO authenticated
USING (
  id = auth.uid()
  OR coach_id = auth.uid()
  OR id = public.my_coach_id()
  OR public.has_system_role(auth.uid(), 'admin')
);
DROP POLICY IF EXISTS "profiles_insert_self" ON public.profiles;
CREATE POLICY "profiles_insert_self" ON public.profiles FOR INSERT TO authenticated
WITH CHECK (id = auth.uid());
DROP POLICY IF EXISTS "profiles_update_self" ON public.profiles;
CREATE POLICY "profiles_update_self" ON public.profiles FOR UPDATE TO authenticated
USING (id = auth.uid()) WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS user_roles_select_self_or_admin ON public.user_roles;
CREATE POLICY user_roles_select_self_or_admin ON public.user_roles FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_system_role(auth.uid(), 'admin'));

-- The manager account: auto-granted the admin role the moment they first sign in.
-- Change this email if the manager's Google account is different.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', split_part(COALESCE(NEW.email,''), '@', 1)),
    COALESCE(NEW.email, ''),
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'role',''), 'trainee')::public.app_role
  )
  ON CONFLICT (id) DO NOTHING;

  IF NEW.email = 'YOUR_EMAIL@example.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- invite codes (trainee <-> coach connection)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.invite_codes (
  code text PRIMARY KEY,
  coach_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  used_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.invite_codes TO authenticated;
GRANT ALL ON public.invite_codes TO service_role;
ALTER TABLE public.invite_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "invites_coach_all" ON public.invite_codes;
CREATE POLICY "invites_coach_all" ON public.invite_codes FOR SELECT TO authenticated USING (coach_id = auth.uid());
DROP POLICY IF EXISTS "invites_coach_insert" ON public.invite_codes;
CREATE POLICY "invites_coach_insert" ON public.invite_codes FOR INSERT TO authenticated WITH CHECK (coach_id = auth.uid());
DROP POLICY IF EXISTS "invites_coach_delete" ON public.invite_codes;
CREATE POLICY "invites_coach_delete" ON public.invite_codes FOR DELETE TO authenticated USING (coach_id = auth.uid());

CREATE OR REPLACE FUNCTION public.redeem_invite_code(_code text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _coach uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT coach_id INTO _coach FROM public.invite_codes
  WHERE upper(code) = upper(trim(_code)) AND used_by IS NULL;
  IF _coach IS NULL THEN RAISE EXCEPTION 'invalid_code'; END IF;
  IF _coach = auth.uid() THEN RAISE EXCEPTION 'own_code'; END IF;

  UPDATE public.invite_codes SET used_by = auth.uid(), used_at = now()
  WHERE upper(code) = upper(trim(_code));

  UPDATE public.profiles SET coach_id = _coach, role = 'trainee', updated_at = now()
  WHERE id = auth.uid();

  RETURN _coach;
END;
$$;
REVOKE ALL ON FUNCTION public.redeem_invite_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_invite_code(text) TO authenticated;

-- ============================================================
-- coach verification
-- ============================================================

DO $$ BEGIN
  CREATE TYPE public.coach_status AS ENUM ('pending', 'approved', 'rejected', 'blocked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.coach_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  specialty text NOT NULL DEFAULT '',
  applicant_notes text NOT NULL DEFAULT '',
  status public.coach_status NOT NULL DEFAULT 'pending',
  admin_notes text NOT NULL DEFAULT '',
  rejection_reason text,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.coach_applications DROP COLUMN IF EXISTS years_experience;
ALTER TABLE public.coach_applications DROP COLUMN IF EXISTS bio;
ALTER TABLE public.coach_applications DROP COLUMN IF EXISTS credential_path;
GRANT SELECT, INSERT, UPDATE ON public.coach_applications TO authenticated;
GRANT ALL ON public.coach_applications TO service_role;
ALTER TABLE public.coach_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS coach_app_select ON public.coach_applications;
CREATE POLICY coach_app_select ON public.coach_applications FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_system_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS coach_app_insert_self ON public.coach_applications;
CREATE POLICY coach_app_insert_self ON public.coach_applications FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS coach_app_update_self_pending ON public.coach_applications;
CREATE POLICY coach_app_update_self_pending ON public.coach_applications FOR UPDATE TO authenticated
USING (user_id = auth.uid() AND status = 'pending')
WITH CHECK (user_id = auth.uid() AND status = 'pending');
DROP POLICY IF EXISTS coach_app_update_admin ON public.coach_applications;
CREATE POLICY coach_app_update_admin ON public.coach_applications FOR UPDATE TO authenticated
USING (public.has_system_role(auth.uid(), 'admin'))
WITH CHECK (public.has_system_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS coach_applications_updated_at ON public.coach_applications;
CREATE TRIGGER coach_applications_updated_at BEFORE UPDATE ON public.coach_applications
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.is_approved_coach(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.coach_applications
    WHERE user_id = _user_id AND status = 'approved'
  )
$$;
REVOKE ALL ON FUNCTION public.is_approved_coach(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_approved_coach(uuid) TO authenticated, service_role;

-- ============================================================
-- exercise library (global reference data, grouped by body part —
-- coaches pick from this when adding an exercise, or type a custom name)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.exercise_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  category text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.exercise_library TO authenticated;
GRANT ALL ON public.exercise_library TO service_role;
ALTER TABLE public.exercise_library ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS exercise_library_select_all ON public.exercise_library;
CREATE POLICY exercise_library_select_all ON public.exercise_library FOR SELECT TO authenticated USING (true);

-- Reseeded with English (Hebrew) names — clears any earlier Hebrew-only seed data
-- from a previous run so the table doesn't end up with duplicate entries.
TRUNCATE public.exercise_library;

INSERT INTO public.exercise_library (name, category) VALUES
  ('Barbell Bench Press (לחיצת חזה במוט)', 'חזה'),
  ('Incline Bench Press (לחיצת חזה בשיפוע חיובי)', 'חזה'),
  ('Decline Bench Press (לחיצת חזה בשיפוע שלילי)', 'חזה'),
  ('Dumbbell Bench Press (לחיצת חזה בדאמבלים)', 'חזה'),
  ('Dumbbell Fly (פרפר בדאמבלים)', 'חזה'),
  ('Cable Crossover (פרפר בפולי)', 'חזה'),
  ('Chest Press Machine (מכונת לחיצת חזה)', 'חזה'),
  ('Pec Deck Machine (מכונת פרפר / פק דק)', 'חזה'),
  ('Push-Up (שכיבות סמיכה)', 'חזה'),
  ('Chest Dips (מקבילים לחזה)', 'חזה'),

  ('Pull-Up (מתח)', 'גב'),
  ('Chin-Up (מתח באחיזה הפוכה)', 'גב'),
  ('Seated Cable Row (חתירה בפולי תחתון)', 'גב'),
  ('T-Bar Row (חתירה בטי-בר)', 'גב'),
  ('Bent-Over Barbell Row (חתירה בבר חופשי)', 'גב'),
  ('Incline Dumbbell Row (חתירה בדאמבל בשיפוע)', 'גב'),
  ('Lat Pulldown (פולי עליון)', 'גב'),
  ('Back Extension (פשיטת גב / היפר-אקסטנשן)', 'גב'),
  ('Conventional Deadlift (דדליפט קלאסי)', 'גב'),
  ('Wide-Stance Deadlift (דדליפט בתפיסה רחבה)', 'גב'),

  ('Barbell Overhead Press (לחיצת כתפיים בבר)', 'כתפיים'),
  ('Dumbbell Shoulder Press (לחיצת כתפיים בדאמבלים)', 'כתפיים'),
  ('Arnold Press (ארנולד פרס)', 'כתפיים'),
  ('Lateral Raise (הרחקת כתפיים לצד)', 'כתפיים'),
  ('Front Raise (הרחקת כתפיים לפנים)', 'כתפיים'),
  ('Reverse Fly (פרפר הפוך / ריר דלט)', 'כתפיים'),
  ('Cable Rear Delt Fly (כתף אחורית בפולי)', 'כתפיים'),
  ('Shrugs (שראגס)', 'כתפיים'),

  ('Barbell Curl (כפיפת מרפקים במוט)', 'יד קדמית'),
  ('Dumbbell Curl (כפיפת מרפקים בדאמבלים)', 'יד קדמית'),
  ('Hammer Curl (כפיפת פטיש)', 'יד קדמית'),
  ('Preacher Curl (כפיפת מרפקים בספסל סקוט)', 'יד קדמית'),
  ('Cable Curl (כפיפת מרפקים בפולי תחתון)', 'יד קדמית'),
  ('Concentration Curl (כפיפת קונצנטרציה)', 'יד קדמית'),
  ('Machine Curl (כפיפת מרפקים במכונה)', 'יד קדמית'),

  ('Rope Triceps Pushdown (פשיטת מרפקים בפולי - חבל)', 'יד אחורית'),
  ('Bar Triceps Pushdown (פשיטת מרפקים בפולי - מוט)', 'יד אחורית'),
  ('Overhead Dumbbell Triceps Extension (פשיטת מרפקים מעל הראש בדאמבל)', 'יד אחורית'),
  ('Skull Crusher (דחיקה צרפתית / סקאל קראשר)', 'יד אחורית'),
  ('Triceps Dips (מקבילים לטריצפס)', 'יד אחורית'),
  ('Close-Grip Bench Press (לחיצת חזה צרה)', 'יד אחורית'),
  ('Machine Triceps Extension (פשיטת מרפקים במכונה)', 'יד אחורית'),

  ('Free Squat (סקוואט חופשי)', 'רגליים'),
  ('Smith Machine Squat (סקוואט בסמית'')', 'רגליים'),
  ('Front Squat (סקוואט קדמי)', 'רגליים'),
  ('Leg Press (לחיצת רגליים)', 'רגליים'),
  ('Leg Extension (מכונת פשיטת ברך)', 'רגליים'),
  ('Leg Curl (מכונת כפיפת ברך)', 'רגליים'),
  ('Lunges (לאנג''ים)', 'רגליים'),
  ('Bulgarian Split Squat (ספליט סקוואט בולגרי)', 'רגליים'),
  ('Hack Squat (הק סקוואט)', 'רגליים'),
  ('Romanian Deadlift (דדליפט רומני)', 'רגליים'),

  ('Hip Thrust (היפ ת''ראסט)', 'ישבן'),
  ('Glute Bridge (גשר ישבן)', 'ישבן'),
  ('Cable Kickback (קיק בק בכבל)', 'ישבן'),
  ('Hip Abductor Machine (הרחקת ירך במכונה)', 'ישבן'),
  ('Sumo Deadlift (דדליפט סומו)', 'ישבן'),

  ('Standing Calf Raise (עליה על קצות אצבעות בעמידה)', 'שוקיים'),
  ('Seated Calf Raise (עליה על קצות אצבעות בישיבה)', 'שוקיים'),
  ('Leg Press Calf Raise (עליה על קצות אצבעות בלג פרס)', 'שוקיים'),

  ('Crunch (כפיפות בטן)', 'בטן / core'),
  ('Hanging Leg Raise (הרמת רגליים תלויה)', 'בטן / core'),
  ('Plank (פלאנק)', 'בטן / core'),
  ('Ab Wheel Rollout (גלגלת בטן)', 'בטן / core'),
  ('Side Crunch (כפיפות צד - בטן אלכסונית)', 'בטן / core'),
  ('Ab Crunch Machine (מכונת בטן)', 'בטן / core'),
  ('Hanging Knee Raise (הרמת ברכיים תלויה)', 'בטן / core'),

  ('Treadmill (הליכון)', 'אירובי'),
  ('Stationary Bike (אופניים נייחים)', 'אירובי'),
  ('Rowing Machine (חתירה - רואינג מכונה)', 'אירובי'),
  ('Elliptical (אליפטיקל)', 'אירובי'),
  ('Jump Rope (קפיצות חבל)', 'אירובי'),

  ('Stretching (מתיחות)', 'אחר'),
  ('General Warm-Up (חימום כללי)', 'אחר')
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- admin logs
-- ============================================================

CREATE TABLE IF NOT EXISTS public.admin_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  target_user_id uuid,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.admin_logs TO authenticated;
GRANT ALL ON public.admin_logs TO service_role;
ALTER TABLE public.admin_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_logs_select_admin ON public.admin_logs;
CREATE POLICY admin_logs_select_admin ON public.admin_logs FOR SELECT TO authenticated
USING (public.has_system_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS admin_logs_insert_admin ON public.admin_logs;
CREATE POLICY admin_logs_insert_admin ON public.admin_logs FOR INSERT TO authenticated
WITH CHECK (admin_id = auth.uid() AND public.has_system_role(auth.uid(), 'admin'));

-- ============================================================
-- training blocks
-- ============================================================

CREATE TABLE IF NOT EXISTS public.blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  trainee_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  total_weeks int NOT NULL DEFAULT 4,
  workouts_per_week int NOT NULL DEFAULT 3,
  current_week int NOT NULL DEFAULT 1,
  completed_at bigint,
  weeks jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.blocks ADD COLUMN IF NOT EXISTS primary_configs jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.blocks ADD COLUMN IF NOT EXISTS accessory_configs jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.blocks ADD COLUMN IF NOT EXISTS secondary_configs jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.blocks ADD COLUMN IF NOT EXISTS accessory_group jsonb;
-- A block can be created without a trainee yet (template/draft), assigned later.
ALTER TABLE public.blocks ALTER COLUMN trainee_id DROP NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blocks TO authenticated;
GRANT ALL ON public.blocks TO service_role;
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "blocks_select" ON public.blocks;
CREATE POLICY "blocks_select" ON public.blocks FOR SELECT TO authenticated
USING (coach_id = auth.uid() OR trainee_id = auth.uid() OR public.has_system_role(auth.uid(), 'admin'));
-- A coach may only attach a block to a trainee who is theirs (or leave it unassigned as a draft).
DROP POLICY IF EXISTS "blocks_coach_insert" ON public.blocks;
CREATE POLICY "blocks_coach_insert" ON public.blocks FOR INSERT TO authenticated
WITH CHECK (
  coach_id = auth.uid()
  AND (trainee_id IS NULL OR EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = trainee_id AND p.coach_id = auth.uid()
  ))
);
DROP POLICY IF EXISTS "blocks_update" ON public.blocks;
CREATE POLICY "blocks_update" ON public.blocks FOR UPDATE TO authenticated
USING (coach_id = auth.uid() OR trainee_id = auth.uid())
WITH CHECK (
  (coach_id = auth.uid() AND (trainee_id IS NULL OR EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = trainee_id AND p.coach_id = auth.uid()
  )))
  OR trainee_id = auth.uid()
);

-- Ownership columns are frozen for anyone but the coach who owns the block: a trainee's client
-- saves the whole row (weights/actuals), but must never be able to change coach_id or trainee_id.
CREATE OR REPLACE FUNCTION public.guard_block_ownership()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF auth.uid() IS DISTINCT FROM OLD.coach_id
     AND (NEW.coach_id IS DISTINCT FROM OLD.coach_id OR NEW.trainee_id IS DISTINCT FROM OLD.trainee_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_block_ownership() FROM PUBLIC, anon;
DROP TRIGGER IF EXISTS blocks_guard_ownership ON public.blocks;
CREATE TRIGGER blocks_guard_ownership BEFORE UPDATE ON public.blocks
FOR EACH ROW EXECUTE FUNCTION public.guard_block_ownership();
DROP POLICY IF EXISTS "blocks_coach_delete" ON public.blocks;
CREATE POLICY "blocks_coach_delete" ON public.blocks FOR DELETE TO authenticated
USING (coach_id = auth.uid());

-- ============================================================
-- block summaries (permanent historical snapshots — see spec "Block Summary &
-- Progress Tracking". Generated once when a block is completed; no UPDATE/DELETE
-- grant to authenticated at all, so a saved summary can never be altered or
-- overwritten by later programming/1RM changes or later blocks.)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.block_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id uuid NOT NULL UNIQUE REFERENCES public.blocks(id) ON DELETE CASCADE,
  coach_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  trainee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  block_name text NOT NULL DEFAULT '',
  completed_at bigint NOT NULL,
  rows jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.block_summaries TO authenticated;
GRANT ALL ON public.block_summaries TO service_role;
ALTER TABLE public.block_summaries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS block_summaries_select ON public.block_summaries;
CREATE POLICY block_summaries_select ON public.block_summaries FOR SELECT TO authenticated
USING (coach_id = auth.uid() OR trainee_id = auth.uid() OR public.has_system_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS block_summaries_insert ON public.block_summaries;
CREATE POLICY block_summaries_insert ON public.block_summaries FOR INSERT TO authenticated
WITH CHECK (coach_id = auth.uid());

-- ============================================================
-- notifications
-- ============================================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  to_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  from_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  to_role public.app_role NOT NULL DEFAULT 'trainee',
  text text NOT NULL,
  read boolean NOT NULL DEFAULT false,
  dismissed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notif_select" ON public.notifications;
CREATE POLICY "notif_select" ON public.notifications FOR SELECT TO authenticated
USING (to_user_id = auth.uid() OR from_user_id = auth.uid());
DROP POLICY IF EXISTS "notif_insert" ON public.notifications;
CREATE POLICY "notif_insert" ON public.notifications FOR INSERT TO authenticated
WITH CHECK (from_user_id = auth.uid());
DROP POLICY IF EXISTS "notif_update_recipient" ON public.notifications;
CREATE POLICY "notif_update_recipient" ON public.notifications FOR UPDATE TO authenticated
USING (to_user_id = auth.uid()) WITH CHECK (to_user_id = auth.uid());

-- ============================================================
-- trainee groups (a coach groups their own trainees and sends one block to all of them;
-- each member gets their own copy, so starting weights can still be adjusted individually)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.groups TO authenticated;
GRANT ALL ON public.groups TO service_role;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS groups_coach_all ON public.groups;
CREATE POLICY groups_coach_all ON public.groups FOR ALL TO authenticated
USING (coach_id = auth.uid())
WITH CHECK (coach_id = auth.uid());

-- PK on trainee_id = a trainee belongs to at most one group. A join table (not a column on
-- profiles) because profiles_update_self lets a trainee edit their own row — a profile column
-- would let trainees assign themselves to groups.
CREATE TABLE IF NOT EXISTS public.group_members (
  trainee_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.group_members TO authenticated;
GRANT ALL ON public.group_members TO service_role;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS group_members_select ON public.group_members;
CREATE POLICY group_members_select ON public.group_members FOR SELECT TO authenticated
USING (
  trainee_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.groups g WHERE g.id = group_id AND g.coach_id = auth.uid())
  OR public.has_system_role(auth.uid(), 'admin')
);
DROP POLICY IF EXISTS group_members_insert ON public.group_members;
CREATE POLICY group_members_insert ON public.group_members FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.groups g WHERE g.id = group_id AND g.coach_id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = trainee_id AND p.coach_id = auth.uid())
);
DROP POLICY IF EXISTS group_members_delete ON public.group_members;
CREATE POLICY group_members_delete ON public.group_members FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.groups g WHERE g.id = group_id AND g.coach_id = auth.uid()));

-- ============================================================
-- privileged actions as SECURITY DEFINER RPCs — no service-role key needed anywhere
-- ============================================================

-- Coach-only: removes one of their own trainees and deletes that trainee's training data.
CREATE OR REPLACE FUNCTION public.coach_remove_trainee(_trainee_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _coach_id uuid := auth.uid();
  _trainee_coach uuid;
BEGIN
  IF _coach_id IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT coach_id INTO _trainee_coach FROM public.profiles WHERE id = _trainee_id;
  IF _trainee_coach IS NULL OR _trainee_coach <> _coach_id THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  DELETE FROM public.blocks WHERE coach_id = _coach_id AND trainee_id = _trainee_id;
  DELETE FROM public.group_members WHERE trainee_id = _trainee_id;
  UPDATE public.profiles SET coach_id = NULL WHERE id = _trainee_id;
  INSERT INTO public.notifications (to_user_id, from_user_id, to_role, text)
  VALUES (_trainee_id, _coach_id, 'trainee', 'המאמן שלך הסיר אותך מהמערכת. כל האימונים איתו נמחקו.');
END;
$$;
REVOKE ALL ON FUNCTION public.coach_remove_trainee(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.coach_remove_trainee(uuid) TO authenticated;


-- Admin-only: permanently deletes a user account and all of their data.
-- Deleting straight from auth.users cascades to profiles/coach_applications
-- via the ON DELETE CASCADE foreign keys above — no Admin API needed.
CREATE OR REPLACE FUNCTION public.admin_delete_user(_target_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _admin_id uuid := auth.uid();
BEGIN
  IF _admin_id IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public.has_system_role(_admin_id, 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF _target_user_id = _admin_id THEN RAISE EXCEPTION 'cannot_delete_self'; END IF;

  DELETE FROM public.blocks WHERE coach_id = _target_user_id OR trainee_id = _target_user_id;
  UPDATE public.profiles SET coach_id = NULL WHERE coach_id = _target_user_id;
  INSERT INTO public.admin_logs (admin_id, action, target_user_id, notes)
  VALUES (_admin_id, 'delete', _target_user_id, 'מחיקת חשבון');

  DELETE FROM auth.users WHERE id = _target_user_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_delete_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;

-- ============================================================
-- storage buckets
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('set-videos', 'set-videos', false, 104857600, ARRAY['video/mp4', 'video/webm', 'video/quicktime'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS coach_creds_insert_own ON storage.objects;
DROP POLICY IF EXISTS coach_creds_select_own ON storage.objects;
DROP POLICY IF EXISTS coach_creds_update_own ON storage.objects;
DROP POLICY IF EXISTS coach_creds_select_admin ON storage.objects;
-- Storage protects storage.objects/storage.buckets from direct SQL DELETE.
-- To remove the coach-credentials bucket and its files, use the Dashboard:
-- Storage → coach-credentials → Empty bucket, then delete the bucket.

DROP POLICY IF EXISTS set_videos_insert_own ON storage.objects;
CREATE POLICY set_videos_insert_own ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'set-videos' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS set_videos_select_own ON storage.objects;
CREATE POLICY set_videos_select_own ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'set-videos' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS set_videos_update_own ON storage.objects;
CREATE POLICY set_videos_update_own ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'set-videos' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS set_videos_delete_own ON storage.objects;
CREATE POLICY set_videos_delete_own ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'set-videos' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS set_videos_select_coach ON storage.objects;
CREATE POLICY set_videos_select_coach ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'set-videos'
  AND EXISTS (
    SELECT 1 FROM public.blocks
    WHERE trainee_id::text = (storage.foldername(name))[1]
      AND coach_id = auth.uid()
  )
);
