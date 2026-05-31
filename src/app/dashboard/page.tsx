import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import TopNav from "@/components/TopNav";
import ProgressChart, { type SessionPoint } from "@/components/ProgressChart";
import { LEVELS } from "@/lib/types";

export const dynamic = "force-dynamic";

interface AttemptRow {
  item_type: "kanji" | "vocab";
  item: string;
  level: string;
  correct: boolean;
  skipped: boolean;
  created_at: string;
}

interface SessionRow {
  created_at: string;
  mode: string;
  total_questions: number;
  result: string;
  levels: Record<string, { correct?: number; total?: number }> | null;
}

const LEVEL_NUM: Record<string, number> = {
  "Below N5": 0,
  N5: 1,
  N4: 2,
  N3: 3,
  N2: 4,
  N1: 5,
};

function sessionAccuracy(levels: SessionRow["levels"]): number | null {
  if (!levels) return null;
  let correct = 0;
  let total = 0;
  for (const v of Object.values(levels)) {
    correct += v?.correct ?? 0;
    total += v?.total ?? 0;
  }
  return total > 0 ? Math.round((correct / total) * 100) : null;
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Counts
  const [{ count: sessionCount }, { count: attemptCount }] = await Promise.all([
    supabase.from("sessions").select("*", { count: "exact", head: true }),
    supabase.from("attempts").select("*", { count: "exact", head: true }),
  ]);

  // Sessions (newest first). Used for the recent-sessions table and, reversed,
  // for the progress-over-time chart.
  const { data: sessions } = await supabase
    .from("sessions")
    .select("created_at, mode, total_questions, result, levels")
    .order("created_at", { ascending: false })
    .limit(100);

  const sessionRows = (sessions ?? []) as SessionRow[];
  const chartPoints: SessionPoint[] = [...sessionRows]
    .reverse()
    .map((s) => ({
      date: s.created_at,
      level: s.result,
      levelNum: LEVEL_NUM[s.result] ?? 0,
      accuracy: sessionAccuracy(s.levels),
    }));
  const recentSessions = sessionRows.slice(0, 15);

  // Recent attempts for aggregation (bounded for performance)
  const { data: attempts } = await supabase
    .from("attempts")
    .select("item_type, item, level, correct, skipped, created_at")
    .order("created_at", { ascending: false })
    .limit(1500);

  const rows = (attempts ?? []) as AttemptRow[];

  // Per-level accuracy
  const perLevel: Record<string, { total: number; correct: number }> = {};
  for (const l of LEVELS) perLevel[l] = { total: 0, correct: 0 };
  for (const a of rows) {
    if (!perLevel[a.level]) perLevel[a.level] = { total: 0, correct: 0 };
    perLevel[a.level].total++;
    if (a.correct) perLevel[a.level].correct++;
  }

  const overallTotal = rows.length;
  const overallCorrect = rows.filter((a) => a.correct).length;
  const overallAcc = overallTotal ? Math.round((overallCorrect / overallTotal) * 100) : 0;

  const hasData = (sessionCount ?? 0) > 0;

  return (
    <>
      <TopNav email={user?.email} />
      <main className="page-results">
        <div className="dash-inner">
          <h2 style={{ fontSize: "1.5rem", fontWeight: 700, textAlign: "center" }}>Your Progress</h2>

          {!hasData ? (
            <div className="card">
              <p className="empty-hint">
                No quizzes yet. <Link href="/" style={{ color: "var(--primary)" }}>Take your first quiz →</Link>
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
                  <div className="stat-value">{recentSessions[0]?.result ?? "—"}</div>
                  <div className="stat-label">Latest level</div>
                </div>
              </div>

              <ProgressChart points={chartPoints} />

              <div className="card">
                <h3 className="section-label">Accuracy by Level (recent {overallTotal} answers)</h3>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Level</th>
                      <th>Answered</th>
                      <th>Correct</th>
                      <th>Accuracy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {LEVELS.map((l) => {
                      const s = perLevel[l];
                      const acc = s.total ? Math.round((s.correct / s.total) * 100) : null;
                      return (
                        <tr key={l}>
                          <td><span className={`level-tag ${l}`}>{l}</span></td>
                          <td>{s.total || <span className="muted">—</span>}</td>
                          <td>{s.total ? s.correct : <span className="muted">—</span>}</td>
                          <td>{acc === null ? <span className="muted">—</span> : `${acc}%`}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="card">
                <h3 className="section-label">Recent Sessions</h3>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Mode</th>
                      <th>Questions</th>
                      <th>Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentSessions.map((s, i) => (
                      <tr key={i}>
                        <td className="muted">{new Date(s.created_at).toLocaleString()}</td>
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
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <a href="/api/export" className="secondary-btn" download>
                    Download JSON (complete)
                  </a>
                  <a href="/api/export?format=csv" className="secondary-btn" download>
                    Download CSV (spreadsheet)
                  </a>
                </div>
              </div>
            </>
          )}

          <div className="results-actions">
            <Link href="/" className="primary-btn" style={{ textAlign: "center" }}>
              Take another quiz
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
