const DAY_MS = 86_400_000;

function ymd(d: Date): string {
  // Local-date key (YYYY-MM-DD), so quizzes bucket into the user's own days.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function intensity(count: number): string {
  if (count <= 0) return "var(--bg2)";
  if (count === 1) return "rgba(124,58,237,0.35)";
  if (count === 2) return "rgba(124,58,237,0.6)";
  if (count <= 4) return "rgba(124,58,237,0.8)";
  return "var(--primary)";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * A GitHub-style activity heatmap of quiz days, plus current/longest streaks.
 * `dates` are ISO timestamps of every saved session.
 */
export default function StreakCalendar({
  dates,
  weeks = 53,
}: {
  dates: string[];
  weeks?: number;
}) {
  // Bucket sessions by local day.
  const counts = new Map<string, number>();
  for (const iso of dates) {
    const key = ymd(new Date(iso));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayDow = today.getDay(); // 0 = Sunday

  // Grid start = the Sunday that begins the leftmost column.
  const start = new Date(today.getTime() - (todayDow + (weeks - 1) * 7) * DAY_MS);

  // Build columns (weeks) × 7 rows (Sun→Sat).
  const columns: { date: Date | null; key: string; count: number }[][] = [];
  const monthLabels: { col: number; label: string }[] = [];
  let lastMonth = -1;

  for (let col = 0; col < weeks; col++) {
    const colCells: { date: Date | null; key: string; count: number }[] = [];
    for (let row = 0; row < 7; row++) {
      const d = new Date(start.getTime() + (col * 7 + row) * DAY_MS);
      if (d.getTime() > today.getTime()) {
        colCells.push({ date: null, key: `empty-${col}-${row}`, count: 0 });
        continue;
      }
      const key = ymd(d);
      colCells.push({ date: d, key, count: counts.get(key) ?? 0 });
      // Label a column with the month name when its first row starts a new month.
      if (row === 0 && d.getMonth() !== lastMonth) {
        lastMonth = d.getMonth();
        monthLabels.push({ col, label: MONTHS[d.getMonth()] });
      }
    }
    columns.push(colCells);
  }

  // Streaks.
  const activeDays = new Set([...counts.entries()].filter(([, c]) => c > 0).map(([k]) => k));
  let currentStreak = 0;
  for (let d = new Date(today); activeDays.has(ymd(d)); d = new Date(d.getTime() - DAY_MS)) {
    currentStreak++;
  }
  let longestStreak = 0;
  let run = 0;
  for (let d = new Date(start); d.getTime() <= today.getTime(); d = new Date(d.getTime() + DAY_MS)) {
    if (activeDays.has(ymd(d))) {
      run++;
      if (run > longestStreak) longestStreak = run;
    } else {
      run = 0;
    }
  }
  const totalDays = activeDays.size;

  const CELL = 13;
  const GAP = 3;

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 10 }}>
        <h3 className="section-label" style={{ margin: 0 }}>
          🔥 Study Streak
        </h3>
        <div style={{ display: "flex", gap: 18, fontSize: "0.8rem" }}>
          <span>
            <strong style={{ color: "var(--primary)" }}>{currentStreak}</strong>
            <span className="muted"> day{currentStreak === 1 ? "" : "s"} current</span>
          </span>
          <span>
            <strong style={{ color: "var(--text)" }}>{longestStreak}</strong>
            <span className="muted"> longest</span>
          </span>
          <span>
            <strong style={{ color: "var(--text)" }}>{totalDays}</strong>
            <span className="muted"> active days</span>
          </span>
        </div>
      </div>

      <div style={{ overflowX: "auto", marginTop: 14, paddingBottom: 4 }}>
        <div style={{ display: "inline-flex", flexDirection: "column", gap: 4 }}>
          {/* Month labels */}
          <div style={{ position: "relative", height: 12, marginLeft: 0 }}>
            {monthLabels.map((m) => (
              <span
                key={`${m.col}-${m.label}`}
                style={{
                  position: "absolute",
                  left: m.col * (CELL + GAP),
                  fontSize: 10,
                  color: "var(--text-muted)",
                }}
              >
                {m.label}
              </span>
            ))}
          </div>
          {/* Heatmap */}
          <div style={{ display: "flex", gap: GAP }}>
            {columns.map((colCells, ci) => (
              <div key={ci} style={{ display: "flex", flexDirection: "column", gap: GAP }}>
                {colCells.map((cell) => (
                  <div
                    key={cell.key}
                    title={cell.date ? `${cell.key}: ${cell.count} quiz${cell.count === 1 ? "" : "zes"}` : ""}
                    style={{
                      width: CELL,
                      height: CELL,
                      borderRadius: 3,
                      background: cell.date ? intensity(cell.count) : "transparent",
                      border: cell.date ? "1px solid var(--border)" : "none",
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="method-note" style={{ marginTop: 10 }}>
        Each square is a day; brighter means more quizzes. Keep the streak alive
        by taking at least one quiz a day.
      </p>
    </div>
  );
}
