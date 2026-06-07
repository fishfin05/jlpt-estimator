import { NextResponse, type NextRequest } from 'next/server'
import { getSessionUser, getSql } from '@/lib/auth-server'

export const dynamic = 'force-dynamic'

interface AttemptRow {
  session_id: string
  created_at: string
  item_type: string
  item: string
  level: string
  meaning_given: string | null
  reading_given: string | null
  meaning_correct: boolean
  reading_correct: boolean
  correct: boolean
  skipped: boolean
  challenged: boolean
}

interface SessionRow {
  id: string
  created_at: string
  mode: string
  total_questions: number
  result: string
  levels: Record<string, unknown>
}

function csvField(value: unknown): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export async function GET(request: NextRequest) {
  const user = await getSessionUser(request)
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }

  const sql = getSql()
  const [sessions, attempts] = await Promise.all([
    sql`SELECT id, created_at, mode, total_questions, result, levels FROM sessions WHERE user_id = ${user.id} ORDER BY created_at ASC` as unknown as Promise<SessionRow[]>,
    sql`SELECT session_id, created_at, item_type, item, level, meaning_given, reading_given, meaning_correct, reading_correct, correct, skipped, challenged FROM attempts WHERE user_id = ${user.id} ORDER BY created_at ASC` as unknown as Promise<AttemptRow[]>,
  ])

  const sessionRows = sessions ?? []
  const attemptRows = attempts ?? []

  const format = request.nextUrl.searchParams.get('format')
  const stamp = new Date().toISOString().slice(0, 10)

  if (format === 'csv') {
    const sessionDate = new Map(sessionRows.map((s) => [s.id, s.created_at]))
    const header = [
      'session_id', 'session_date', 'answered_at', 'type', 'item', 'level',
      'meaning_given', 'reading_given', 'meaning_correct', 'reading_correct',
      'passed', 'skipped', 'challenged',
    ]
    const lines = [header.join(',')]
    for (const a of attemptRows) {
      lines.push(
        [
          a.session_id, sessionDate.get(a.session_id) ?? '', a.created_at,
          a.item_type, a.item, a.level, a.meaning_given, a.reading_given,
          a.meaning_correct, a.reading_correct, a.correct, a.skipped, a.challenged,
        ]
          .map(csvField)
          .join(','),
      )
    }
    return new NextResponse(lines.join('\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="jlpt-data-${stamp}.csv"`,
      },
    })
  }

  const bySession = new Map<string, AttemptRow[]>()
  for (const a of attemptRows) {
    const list = bySession.get(a.session_id) ?? []
    list.push(a)
    bySession.set(a.session_id, list)
  }

  const payload = {
    exported_at: new Date().toISOString(),
    user: { id: user.id, email: user.email },
    session_count: sessionRows.length,
    attempt_count: attemptRows.length,
    sessions: sessionRows.map((s) => ({ ...s, attempts: bySession.get(s.id) ?? [] })),
  }

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="jlpt-data-${stamp}.json"`,
    },
  })
}
