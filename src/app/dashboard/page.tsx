import Link from 'next/link'
import { getUser, getSql } from '@/lib/auth-server'
import { redirect } from 'next/navigation'
import ProgressChart, { type SessionPoint } from '@/components/ProgressChart'
import StreakCalendar from '@/components/StreakCalendar'
import PendingResultSaver from '@/components/PendingResultSaver'
import LocalTime from '@/components/LocalTime'
import { buildProficiency, type KillListEntry } from '@/lib/proficiency'
import { LEVELS } from '@/lib/types'

export const dynamic = 'force-dynamic'

interface AttemptRow {
  item_type: 'kanji' | 'vocab'
  item: string
  level: string
  correct: boolean
  skipped: boolean
  created_at: string
  session_id: string
}

interface SessionRow {
  id: string
  created_at: string
  mode: string
  total_questions: number
  result: string
  levels: Record<string, { correct?: number; total?: number }> | null
}

function Trend({ t }: { t: KillListEntry['trend'] }) {
  if (t === 'new')
    return <span style={{ color: 'var(--primary)', fontWeight: 700, fontSize: '0.72rem' }}>★ new</span>
  if (t === 'same') return <span className="muted">—</span>
  if (t === 'up')
    return <span style={{ color: 'var(--error)', fontWeight: 600, fontSize: '0.78rem' }} title="getting worse">▲ worse</span>
  return <span style={{ color: 'var(--success)', fontWeight: 600, fontSize: '0.78rem' }} title="improving">▼ better</span>
}

const LEVEL_NUM: Record<string, number> = {
  'Below N5': 0, N5: 1, N4: 2, N3: 3, N2: 4, N1: 5,
}

function sessionAccuracy(levels: SessionRow['levels']): number | null {
  if (!levels) return null
  let correct = 0, total = 0
  for (const v of Object.values(levels)) {
    correct += v?.correct ?? 0
    total += v?.total ?? 0
  }
  return total > 0 ? Math.round((correct / total) * 100) : null
}

function continuousLevel(levels: SessionRow['levels']): number | null {
  if (!levels) return null
  const acc: (number | null)[] = LEVELS.map((l) => {
    const v = levels[l]
    if (!v || !v.total) return null
    return (v.correct ?? 0) / v.total
  })
  const tested = acc.map((a, i) => (a !== null ? i : -1)).filter((i) => i >= 0)
  if (tested.length === 0) return null
  const first = tested[0]
  const last = tested[tested.length - 1]
  let sum = 0
  for (let i = 0; i < LEVELS.length; i++) {
    if (acc[i] !== null) {
      sum += acc[i] as number
    } else if (i < first) {
      sum += 1
    } else if (i > last) {
      sum += 0
    } else {
      let lo = i, hi = i
      while (acc[lo] === null) lo--
      while (acc[hi] === null) hi++
      const t = (i - lo) / (hi - lo)
      sum += (acc[lo] as number) * (1 - t) + (acc[hi] as number) * t
    }
  }
  return sum
}

export default async function DashboardPage() {
  const user = await getUser()
  if (!user) redirect('/login?next=/dashboard')

  const sql = getSql()

  const [
    [{ count: sessionCount }],
    [{ count: attemptCount }],
    sessions,
    sessionDates,
    attempts,
  ] = await Promise.all([
    sql`SELECT COUNT(*) FROM sessions WHERE user_id = ${user.id}` as Promise<{ count: string }[]>,
    sql`SELECT COUNT(*) FROM attempts WHERE user_id = ${user.id}` as Promise<{ count: string }[]>,
    sql`SELECT id, created_at, mode, total_questions, result, levels FROM sessions WHERE user_id = ${user.id} ORDER BY created_at DESC LIMIT 100` as Promise<SessionRow[]>,
    sql`SELECT created_at FROM sessions WHERE user_id = ${user.id} ORDER BY created_at ASC LIMIT 2000` as Promise<{ created_at: string }[]>,
    sql`SELECT item_type, item, level, correct, skipped, created_at, session_id FROM attempts WHERE user_id = ${user.id} ORDER BY created_at DESC LIMIT 1500` as Promise<AttemptRow[]>,
  ])

  const sessionRows = sessions as SessionRow[]
  const recentSessions = sessionRows.slice(0, 15)
  const allDates = sessionDates.map((s) => s.created_at)
  const rows = attempts as AttemptRow[]

  const attemptsBySession = new Map<string, AttemptRow[]>()
  for (const a of rows) {
    const list = attemptsBySession.get(a.session_id) ?? []
    list.push(a)
    attemptsBySession.set(a.session_id, list)
  }
  const cumulative: AttemptRow[] = []
  const chartPoints: SessionPoint[] = [...sessionRows].reverse().map((s) => {
    cumulative.push(...(attemptsBySession.get(s.id) ?? []))
    const snapshot =
      cumulative.length > 0
        ? buildProficiency(cumulative).killList.sort(
            (a, b) =>
              LEVELS.indexOf(a.level as (typeof LEVELS)[number]) -
                LEVELS.indexOf(b.level as (typeof LEVELS)[number]) || b.missed - a.missed,
          )
        : null
    return {
      date: s.created_at,
      level: s.result,
      levelNum: continuousLevel(s.levels) ?? LEVEL_NUM[s.result] ?? 0,
      accuracy: sessionAccuracy(s.levels),
      killList: snapshot,
    }
  })

  const perLevel: Record<string, { total: number; correct: number }> = {}
  for (const l of LEVELS) perLevel[l] = { total: 0, correct: 0 }
  for (const a of rows) {
    if (!perLevel[a.level]) perLevel[a.level] = { total: 0, correct: 0 }
    perLevel[a.level].total++
    if (a.correct) perLevel[a.level].correct++
  }

  const { all: knowledge, killList } = buildProficiency(rows)
  const killListSorted = [...killList].sort(
    (a, b) =>
      LEVELS.indexOf(a.level as (typeof LEVELS)[number]) -
        LEVELS.indexOf(b.level as (typeof LEVELS)[number]) ||
      b.missed - a.missed || b.seen - a.seen,
  )
  const tagOrder: Record<string, number> = { Weak: 0, Shaky: 1, New: 2, Solid: 3 }
  const knowledgeSorted = [...knowledge].sort(
    (a, b) =>
      tagOrder[a.tag] - tagOrder[b.tag] ||
      LEVELS.indexOf(a.level as (typeof LEVELS)[number]) -
        LEVELS.indexOf(b.level as (typeof LEVELS)[number]) ||
      b.seen - a.seen,
  )

  const overallTotal = rows.length
  const overallCorrect = rows.filter((a) => a.correct).length
  const overallAcc = overallTotal ? Math.round((overallCorrect / overallTotal) * 100) : 0
  const hasData = parseInt(sessionCount ?? '0') > 0

  return (
    <main className="page-results">
      <div className="dash-inner">
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, textAlign: 'center' }}>Your Progress</h2>

        <PendingResultSaver />

        {!hasData ? (
          <div className="card">
            <p className="empty-hint">
              No quizzes yet.{' '}
              <Link href="/" style={{ color: 'var(--primary)' }}>Take your first quiz →</Link>
            </p>
          </div>
        ) : (
          <>
            <div className="dash-grid">
              <div className="stat-card">
                <div className="stat-value">{sessionCount}</div>
                <div className="stat-label">Quizzes taken</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{attemptCount}</div>
                <div className="stat-label">Total answers</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{overallAcc}%</div>
                <div className="stat-label">Recent accuracy</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{recentSessions[0]?.result ?? '—'}</div>
                <div className="stat-label">Latest level</div>
              </div>
            </div>

            <StreakCalendar dates={allDates} />
            <ProgressChart points={chartPoints} />

            <div className="dash-cols">
              <div className="card">
                <h3 className="section-label">Accuracy by Level (recent {overallTotal} answers)</h3>
                <table className="table">
                  <thead>
                    <tr><th>Level</th><th>Answered</th><th>Correct</th><th>Accuracy</th></tr>
                  </thead>
                  <tbody>
                    {LEVELS.map((l) => {
                      const s = perLevel[l]
                      const acc = s.total ? Math.round((s.correct / s.total) * 100) : null
                      return (
                        <tr key={l}>
                          <td><span className={`level-tag ${l}`}>{l}</span></td>
                          <td>{s.total || <span className="muted">—</span>}</td>
                          <td>{s.total ? s.correct : <span className="muted">—</span>}</td>
                          <td>{acc === null ? <span className="muted">—</span> : `${acc}%`}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="card">
                <h3 className="section-label">Kill List — your most-missed, easiest first</h3>
                {killList.length === 0 ? (
                  <p className="empty-hint">Nothing missed yet.</p>
                ) : (
                  <table className="table">
                    <thead>
                      <tr><th>Item</th><th>Level</th><th>Trend</th><th>Missed</th><th>Seen</th></tr>
                    </thead>
                    <tbody>
                      {killListSorted.map((s) => (
                        <tr key={`${s.type}:${s.item}`}>
                          <td style={{ fontFamily: "'Noto Sans JP', sans-serif", fontSize: '1.1rem' }}>{s.item}</td>
                          <td><span className={`level-tag ${s.level}`}>{s.level}</span></td>
                          <td><Trend t={s.trend} /></td>
                          <td className="badge-wrong">{s.missed}</td>
                          <td className="muted">{s.seen}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {knowledgeSorted.length > 0 && (
              <details className="card">
                <summary style={{ cursor: 'pointer', listStyle: 'revert' }}>
                  <span className="section-label" style={{ margin: 0 }}>
                    Everything you&apos;ve been tested on ({knowledgeSorted.length} items) — click to view
                  </span>
                </summary>
                <div className="scroll-table" style={{ marginTop: 14 }}>
                  <table className="table">
                    <thead>
                      <tr><th>Item</th><th>Type</th><th>Level</th><th>Seen</th><th>Recent accuracy</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                      {knowledgeSorted.map((s) => (
                        <tr key={s.key}>
                          <td style={{ fontFamily: "'Noto Sans JP', sans-serif", fontSize: '1.1rem' }}>{s.item}</td>
                          <td className="muted">{s.type}</td>
                          <td><span className={`level-tag ${s.level}`}>{s.level}</span></td>
                          <td className="muted">{s.seen}</td>
                          <td>{Math.round(s.recentAccuracy * 100)}%</td>
                          <td><span className={`prof-tag prof-${s.tag}`}>{s.tag}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}

            <div className="dash-cols">
              <div className="card">
                <h3 className="section-label">Recent Sessions</h3>
                <table className="table">
                  <thead>
                    <tr><th>Date</th><th>Mode</th><th>Questions</th><th>Result</th></tr>
                  </thead>
                  <tbody>
                    {recentSessions.map((s, i) => (
                      <tr key={i}>
                        <td className="muted"><LocalTime iso={s.created_at} /></td>
                        <td>{s.mode}</td>
                        <td>{s.total_questions}</td>
                        <td><strong>{s.result}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="card">
                <h3 className="section-label">Export Your Data</h3>
                <p className="method-note" style={{ marginTop: 0 }}>
                  Download your full history — every session and every answer
                  (item, level, meaning/reading given, passed/missed, dates).
                </p>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <a href="/api/export" className="secondary-btn" download>Download JSON (complete)</a>
                  <a href="/api/export?format=csv" className="secondary-btn" download>Download CSV (spreadsheet)</a>
                </div>
              </div>
            </div>
          </>
        )}

        <div className="results-actions">
          <Link href="/" className="primary-btn" style={{ textAlign: 'center' }}>
            Take another quiz
          </Link>
        </div>
      </div>
    </main>
  )
}
