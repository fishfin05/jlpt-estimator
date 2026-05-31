"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Mode } from "@/lib/types";

export interface AttemptPayload {
  item_type: "kanji" | "vocab";
  item: string;
  level: string;
  meaning_given: string;
  reading_given: string;
  meaning_correct: boolean;
  reading_correct: boolean;
  correct: boolean;
  skipped: boolean;
  challenged: boolean;
}

export interface SessionPayload {
  mode: Mode;
  totalQuestions: number;
  result: string;
  levels: Record<string, unknown>;
  attempts: AttemptPayload[];
  // When set, this is a continuation of an earlier-saved session (e.g. after
  // "+10 more questions"). The previous session row is replaced so the run
  // shows up as a single session rather than two.
  replaceSessionId?: string;
}

export async function saveSession(
  payload: SessionPayload,
): Promise<{ ok: true; sessionId: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "Not signed in." };

  // If this run continues a previously-saved session, remove the old row first
  // (its attempts cascade-delete) so we re-insert one combined session.
  if (payload.replaceSessionId) {
    await supabase
      .from("sessions")
      .delete()
      .eq("id", payload.replaceSessionId)
      .eq("user_id", user.id);
  }

  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .insert({
      user_id: user.id,
      mode: payload.mode,
      total_questions: payload.totalQuestions,
      result: payload.result,
      levels: payload.levels,
    })
    .select("id")
    .single();

  if (sessionError || !session) {
    return { ok: false, error: sessionError?.message ?? "Could not save session." };
  }

  if (payload.attempts.length > 0) {
    const rows = payload.attempts.map((a) => ({
      session_id: session.id,
      user_id: user.id,
      ...a,
    }));
    const { error: attemptsError } = await supabase.from("attempts").insert(rows);
    if (attemptsError) {
      return { ok: false, error: attemptsError.message };
    }
  }

  // Invalidate the cached dashboard so a new quiz shows up without a refresh.
  revalidatePath("/dashboard");

  return { ok: true, sessionId: session.id as string };
}
