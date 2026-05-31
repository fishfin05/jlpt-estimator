import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import TopNav from "@/components/TopNav";
import { LEVELS, type Level } from "@/lib/types";

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

  // Recent sessions
  const { data: sessions } = await supabase
    .from("sessions")
    .select("created_at, mode, total_questions, result")
    .order("created_at", { ascending: false })
    .limit(15);

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

  // Weakest items: group by item+type, rank by miss count (seen >= 2)
  const itemStats = new Map<
    string,
    { item: string; type: string; level: string; seen: number; missed: number }
  >();
  for (const a of rows) {
    const key = `${a.item_type}:${a.item}`;
    const s = itemStats.get(key) ?? {
      item: a.item,
      type: a.item_type,
      level: a.level,
      seen: 0,
      missed: 0,
    };
    s.seen++;
    if (!a.correct) s.missed++;
    itemStats.set(key, s);
  }
  const weakest = [...itemStats.values()]
    .filter((s) => s.missed > 0)
    .sort((a, b) => b.missed - a.missed || b.seen - a.seen)
    .slice(0, 12);

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
                  <div className="stat-value">{sessions?.[0]?.result ?? "—"}</div>
                  <div className="stat-label">Latest level</div>
                </div>
              </div>

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
                <h3 className="section-label">Words & Kanji You Miss Most</h3>
                {weakest.length === 0 ? (
                  <p className="empty-hint">Nothing missed yet — nice.</p>
                ) : (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>Type</th>
                        <th>Level</th>
                        <th>Missed</th>
                        <th>Seen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {weakest.map((s) => (
                        <tr key={`${s.type}:${s.item}`}>
                          <td style={{ fontFamily: "'Noto Sans JP', sans-serif", fontSize: "1.1rem" }}>{s.item}</td>
                          <td className="muted">{s.type}</td>
                          <td><span className={`level-tag ${s.level}`}>{s.level}</span></td>
                          <td className="badge-wrong">{s.missed}</td>
                          <td className="muted">{s.seen}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
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
                    {(sessions as SessionRow[] | null)?.map((s, i) => (
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
