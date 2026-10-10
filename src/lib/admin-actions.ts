import { supabase } from "@/integrations/supabase/client";

/** Coach-only: removes one of their own trainees and deletes that trainee's training data. */
export async function coachRemoveTrainee(traineeId: string): Promise<{ ok: boolean }> {
  const { error } = await supabase.rpc("coach_remove_trainee", { _trainee_id: traineeId });
  return { ok: !error };
}

/** Admin-only: permanently deletes a user account and all of their data. */
export async function adminDeleteUser(
  targetUserId: string,
): Promise<{ ok: boolean; error?: "cannot_delete_self" | "failed" }> {
  const { error } = await supabase.rpc("admin_delete_user", { _target_user_id: targetUserId });
  if (!error) return { ok: true };
  if (error.message.includes("cannot_delete_self")) return { ok: false, error: "cannot_delete_self" };
  return { ok: false, error: "failed" };
}
