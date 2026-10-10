import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { BlockSummary, BlockSummaryRow } from "./types";

type BlockSummaryRowDb = {
  id: string;
  block_id: string;
  coach_id: string;
  trainee_id: string;
  block_name: string;
  completed_at: number;
  rows: unknown;
  created_at: string;
};

const toBlockSummary = (r: BlockSummaryRowDb): BlockSummary => ({
  id: r.id,
  blockId: r.block_id,
  coachId: r.coach_id,
  traineeId: r.trainee_id,
  blockName: r.block_name,
  completedAt: r.completed_at,
  rows: (Array.isArray(r.rows) ? r.rows : []) as BlockSummaryRow[],
  createdAt: r.created_at,
});

/**
 * Saves a block's frozen summary once, at completion time. Idempotent: `block_id` is UNIQUE, so a
 * second attempt (e.g. re-finishing a reopened block) just no-ops instead of erroring — the first
 * saved snapshot stays the permanent one (spec §3/§18).
 */
export async function saveBlockSummary(
  summary: Omit<BlockSummary, "id" | "createdAt">,
): Promise<BlockSummary | null> {
  const { data, error } = await supabase
    .from("block_summaries")
    .insert({
      block_id: summary.blockId,
      coach_id: summary.coachId,
      trainee_id: summary.traineeId,
      block_name: summary.blockName,
      completed_at: summary.completedAt,
      rows: summary.rows as unknown as Json,
    })
    .select("*")
    .single();
  if (error) {
    if (error.code !== "23505") console.error("failed to save block summary", error);
    return null;
  }
  return toBlockSummary(data as unknown as BlockSummaryRowDb);
}

export function useBlockSummaries(traineeId: string | undefined) {
  const [summaries, setSummaries] = useState<BlockSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!traineeId) {
      setSummaries([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("block_summaries")
      .select("*")
      .eq("trainee_id", traineeId)
      .order("completed_at", { ascending: false });
    if (error) {
      console.error("failed to load block summaries", error);
      setSummaries([]);
    } else {
      setSummaries(((data ?? []) as BlockSummaryRowDb[]).map(toBlockSummary));
    }
    setLoading(false);
  }, [traineeId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { summaries, loading, refresh };
}
