'use server'

import { revalidatePath } from 'next/cache'
import { getUser, getSql } from '@/lib/auth-server'
import type { Mode } from '@/lib/types'

export interface AttemptPayload {
  item_type: 'kanji' | 'vocab'
  item: string
  level: string
  meaning_given: string
  reading_given: string
  meaning_correct: boolean
  reading_correct: boolean
  correct: boolean
  skipped: boolean
  challenged: boolean
}

export interface SessionPayload {
  mode: Mode
  totalQuestions: number
  result: string
  levels: Record<string, unknown>
  attempts: AttemptPayload[]
  replaceSessionId?: string
}

export async function saveSession(
  payload: SessionPayload,
): Promise<{ ok: true; sessionId: string } | { ok: false; error: string }> {
  const user = await getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  const sql = getSql()

  if (payload.replaceSessionId) {
    await sql`DELETE FROM sessions WHERE id = ${payload.replaceSessionId} AND user_id = ${user.id}`
  }

  const [session] = (await sql`
    INSERT INTO sessions (id, user_id, mode, total_questions, result, levels, created_at)
    VALUES (gen_random_uuid(), ${user.id}, ${payload.mode}, ${payload.totalQuestions}, ${payload.result}, ${JSON.stringify(payload.levels)}, now())
    RETURNING id
  `) as { id: string }[]

  if (!session) return { ok: false, error: 'Could not save session.' }

  if (payload.attempts.length > 0) {
    const sql2 = getSql()
    await sql2.transaction(
      payload.attempts.map((a) =>
        sql2`
          INSERT INTO attempts (session_id, user_id, item_type, item, level, meaning_given, reading_given, meaning_correct, reading_correct, correct, skipped, challenged, created_at)
          VALUES (${session.id}, ${user.id}, ${a.item_type}, ${a.item}, ${a.level}, ${a.meaning_given ?? null}, ${a.reading_given ?? null}, ${a.meaning_correct}, ${a.reading_correct}, ${a.correct}, ${a.skipped}, ${a.challenged}, now())
        `,
      ),
    )
  }

  revalidatePath('/dashboard')
  return { ok: true, sessionId: session.id }
}
