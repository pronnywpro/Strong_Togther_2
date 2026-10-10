import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Fixed display order for exercise categories (body parts). Matches the
 * `category` values seeded into `exercise_library` in supabase/schema.sql.
 */
export const EXERCISE_CATEGORIES = [
  "חזה",
  "גב",
  "כתפיים",
  "יד קדמית",
  "יד אחורית",
  "רגליים",
  "ישבן",
  "שוקיים",
  "בטן / core",
  "אירובי",
  "אחר",
] as const;

export type ExerciseCategory = (typeof EXERCISE_CATEGORIES)[number];

export interface LibraryExercise {
  id: string;
  name: string;
  category: string;
}

/**
 * Loads the global exercise library (shared across all coaches, seeded in
 * schema.sql and grouped by body part) once and caches it in module scope —
 * the data is static reference data, not per-user state, so it doesn't need
 * to live in the main store/context.
 */
let cache: LibraryExercise[] | null = null;
let inflight: Promise<LibraryExercise[]> | null = null;

async function fetchLibrary(): Promise<LibraryExercise[]> {
  if (cache) return cache;
  if (!inflight) {
    inflight = (async () => {
      const { data, error } = await supabase
        .from("exercise_library")
        .select("id,name,category")
        .order("name", { ascending: true });
      inflight = null;
      if (error) {
        console.error("failed to load exercise_library", error);
        return [];
      }
      cache = (data ?? []) as LibraryExercise[];
      return cache;
    })();
  }
  return inflight;
}

export function useExerciseLibrary() {
  const [items, setItems] = useState<LibraryExercise[]>(cache ?? []);
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    if (cache) return;
    let cancelled = false;
    void fetchLibrary().then((data) => {
      if (!cancelled) {
        setItems(data);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const byCategory: Record<string, LibraryExercise[]> = {};
  for (const ex of items) {
    (byCategory[ex.category] ??= []).push(ex);
  }

  return { items, byCategory, loading };
}
