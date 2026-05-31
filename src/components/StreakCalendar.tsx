const DAY_MS = 86_400_000;

function ymd(d: Date): string {
  // Local-date key (YYYY-MM-DD), so quizzes bucket into the user's own days.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Streak summary: current run, longest run, and total active days.
 * `dates` are ISO timestamps of every saved session.
 */
export default function StreakCalendar({ dates }: { dates: string[] }) {
  const activeDays = new Set(dates.map((iso) => ymd(new Date(iso))));

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Current streak: consecutive active days ending today (or yesterday, so the
  // streak doesn't read 0 until a full day has lapsed).
  let currentStreak = 0;
  let cursor = new Date(today);
  if (!activeDays.has(ymd(cursor))) cursor = new Date(cursor.getTime() - DAY_MS);
  while (activeDays.has(ymd(cursor))) {
    currentStreak++;
    cursor = new Date(cursor.getTime() - DAY_MS);
  }

  // Longest streak across all recorded days.
  const sortedDays = [...activeDays].sort();
  let longestStreak = 0;
  let run = 0;
  let prev: Date | null = null;
  for (const key of sortedDays) {
    const d = new Date(key + "T00:00:00");
    if (prev && d.getTime() - prev.getTime() === DAY_MS) {
      run++;
    } else {
      run = 1;
    }
    if (run > longestStreak) longestStreak = run;
    prev = d;
  }

  const stats = [
    { value: currentStreak, label: `day${currentStreak === 1 ? "" : "s"} current`, accent: true },
    { value: longestStreak, label: "longest streak", accent: false },
    { value: activeDays.size, label: "active days", accent: false },
  ];

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: "2rem", lineHeight: 1 }}>🔥</span>
          <div>
            <div style={{ fontSize: "2rem", fontWeight: 700, color: "var(--primary)", lineHeight: 1 }}>
              {currentStreak}
            </div>
            <div className="stat-label">day{currentStreak === 1 ? "" : "s"} in a row</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 28, marginLeft: "auto" }}>
          {stats.slice(1).map((s) => (
            <div key={s.label}>
              <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--text)" }}>{s.value}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
      <p className="method-note" style={{ marginTop: 12 }}>
        {currentStreak === 0
          ? "Take a quiz today to start a streak."
          : "Take at least one quiz a day to keep the streak alive."}
      </p>
    </div>
  );
}
