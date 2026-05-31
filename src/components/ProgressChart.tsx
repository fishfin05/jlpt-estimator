"use client";

import { useState, useEffect } from "react";
import type { KillListEntry } from "@/lib/proficiency";

export interface SessionPoint {
  date: string; // ISO timestamp
  level: string; // result label, e.g. "N4" or "Below N5"
  levelNum: number; // continuous 0 = Below N5 … 5 = N1 (levels mastered)
  accuracy: number | null; // 0–100, or null if unknown
  killList: KillListEntry[] | null; // running kill list as of this quiz; null = unavailable
}

const LEVEL_LABELS = ["<N5", "N5", "N4", "N3", "N2", "N1"];

function TrendCell({ t }: { t: KillListEntry["trend"] }) {
  if (t === "new") return <span style={{ color: "var(--primary)", fontSize: "0.72rem" }}>★</span>;
  if (t === "same") return <span className="muted">—</span>;
  if (t === "up") return <span style={{ color: "var(--error)" }} title="getting worse">▲</span>;
  return <span style={{ color: "var(--success)" }} title="improving">▼</span>;
}

type Metric = "level" | "accuracy";

// SVG viewBox geometry.
const W = 640;
const H = 240;
const PAD_L = 44;
const PAD_R = 16;
const PAD_T = 18;
const PAD_B = 34;

export default function ProgressChart({ points }: { points: SessionPoint[] }) {
  const [metric, setMetric] = useState<Metric>("level");
  const [active, setActive] = useState<number>(points.length - 1);
  // Dates are formatted in the viewer's timezone, which only exists on the
  // client — wait for mount so server (UTC) and client markup don't mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (points.length === 0) return null;

  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  const n = points.length;
  const xAt = (i: number) => (n === 1 ? PAD_L + innerW / 2 : PAD_L + (i / (n - 1)) * innerW);

  const isLevel = metric === "level";
  const yMax = isLevel ? 5 : 100;
  const yAt = (v: number) => PAD_T + innerH - (v / yMax) * innerH;

  const valueOf = (p: SessionPoint): number | null =>
    isLevel ? p.levelNum : p.accuracy;

  // Gridlines / y ticks.
  const yTicks = isLevel
    ? [0, 1, 2, 3, 4, 5].map((v) => ({ v, label: LEVEL_LABELS[v] }))
    : [0, 25, 50, 75, 100].map((v) => ({ v, label: `${v}%` }));

  // Build the line, skipping null accuracy points.
  const drawn = points
    .map((p, i) => ({ i, v: valueOf(p) }))
    .filter((d): d is { i: number; v: number } => d.v !== null);

  const linePath = drawn
    .map((d, k) => `${k === 0 ? "M" : "L"} ${xAt(d.i).toFixed(1)} ${yAt(d.v).toFixed(1)}`)
    .join(" ");

  // Trailing moving-average trend line (smooths out noisy quiz-to-quiz swings).
  const MA_WINDOW = 3;
  const maPath =
    drawn.length >= MA_WINDOW
      ? drawn
          .map((d, k) => {
            const slice = drawn.slice(Math.max(0, k - MA_WINDOW + 1), k + 1);
            const avg = slice.reduce((s, x) => s + x.v, 0) / slice.length;
            return `${k === 0 ? "M" : "L"} ${xAt(d.i).toFixed(1)} ${yAt(avg).toFixed(1)}`;
          })
          .join(" ")
      : "";

  // Only label a handful of x ticks to avoid crowding.
  const xTickIdx = (() => {
    if (n <= 6) return points.map((_, i) => i);
    const step = (n - 1) / 5;
    return Array.from({ length: 6 }, (_, k) => Math.round(k * step));
  })();

  // Label each tick with a date the first time that day appears, and the
  // time-of-day otherwise — so multiple quizzes on one day don't all read
  // "May 31". Formatted client-side (local timezone) once mounted.
  const xLabels = (() => {
    let lastDay = "";
    return xTickIdx.map((i) => {
      if (!mounted) return { i, label: "" };
      const d = new Date(points[i].date);
      const day = d.toLocaleDateString();
      if (day !== lastDay) {
        lastDay = day;
        return { i, label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) };
      }
      return { i, label: d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) };
    });
  })();

  return (
    <div className="card">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <h3 className="section-label" style={{ margin: 0 }}>
          Progress Over Time
        </h3>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            className={isLevel ? "primary-btn" : "secondary-btn"}
            style={{ padding: "4px 12px", fontSize: "0.8rem" }}
            onClick={() => setMetric("level")}
          >
            Level
          </button>
          <button
            type="button"
            className={!isLevel ? "primary-btn" : "secondary-btn"}
            style={{ padding: "4px 12px", fontSize: "0.8rem" }}
            onClick={() => setMetric("accuracy")}
          >
            Accuracy
          </button>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={`${isLevel ? "Estimated level" : "Overall accuracy"} over time`}
        style={{ marginTop: 12, overflow: "visible" }}
      >
        {/* Y gridlines + labels */}
        {yTicks.map((t) => {
          const y = yAt(t.v);
          return (
            <g key={t.v}>
              <line
                x1={PAD_L}
                x2={W - PAD_R}
                y1={y}
                y2={y}
                stroke="var(--border, #2a2a3a)"
                strokeWidth={1}
                opacity={0.5}
              />
              <text
                x={PAD_L - 8}
                y={y + 4}
                textAnchor="end"
                fontSize={11}
                fill="var(--text-muted, #888)"
              >
                {t.label}
              </text>
            </g>
          );
        })}

        {/* Moving-average trend line (drawn under the raw line) */}
        {maPath && (
          <path
            d={maPath}
            fill="none"
            stroke="var(--warning, #f59e0b)"
            strokeWidth={2}
            strokeDasharray="5 4"
            opacity={0.9}
          />
        )}

        {/* The line */}
        {linePath && (
          <path d={linePath} fill="none" stroke="var(--primary, #6c8cff)" strokeWidth={2.5} />
        )}

        {/* Points (with enlarged invisible hit area for hover/click) */}
        {points.map((p, i) => {
          const v = valueOf(p);
          if (v === null) return null;
          const isActive = i === active;
          return (
            <g key={i} style={{ cursor: "pointer" }} onMouseEnter={() => setActive(i)} onClick={() => setActive(i)}>
              <circle cx={xAt(i)} cy={yAt(v)} r={11} fill="transparent" />
              <circle
                cx={xAt(i)}
                cy={yAt(v)}
                r={isActive ? 6 : 4}
                fill="var(--primary, #6c8cff)"
                stroke={isActive ? "var(--text, #fff)" : "var(--bg, #11111a)"}
                strokeWidth={isActive ? 2 : 1.5}
              />
            </g>
          );
        })}

        {/* X labels */}
        {xLabels.map(({ i, label }) => (
          <text
            key={i}
            x={xAt(i)}
            y={H - PAD_B + 18}
            textAnchor="middle"
            fontSize={11}
            fill="var(--text-muted, #888)"
            suppressHydrationWarning
          >
            {label}
          </text>
        ))}
      </svg>

      <p className="method-note" style={{ marginTop: 4, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 16, height: 2.5, background: "var(--primary)", display: "inline-block" }} />
          {isLevel ? "Level per quiz" : "Accuracy per quiz"}
        </span>
        {maPath && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 16, height: 0, borderTop: "2px dashed var(--warning)", display: "inline-block" }} />
            {MA_WINDOW}-quiz trend
          </span>
        )}
      </p>

      {/* Detail panel for the hovered/selected point: the running Kill List then */}
      {(() => {
        const p = points[active] ?? points[points.length - 1];
        const when = mounted
          ? new Date(p.date).toLocaleString(undefined, {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })
          : "";
        return (
          <div
            style={{
              marginTop: 10,
              padding: "12px 14px",
              background: "var(--bg2)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
            }}
          >
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
              <span suppressHydrationWarning style={{ color: "var(--text)", fontWeight: 600 }}>{when}</span>
              <span className="muted" style={{ fontSize: "0.82rem" }}>
                Result {p.level}
                {p.accuracy !== null ? ` · ${p.accuracy}% accuracy` : ""}
              </span>
            </div>
            <div style={{ marginTop: 8 }}>
              {p.killList === null ? (
                <span className="muted" style={{ fontSize: "0.8rem" }}>
                  Detail isn&apos;t available this far back.
                </span>
              ) : p.killList.length === 0 ? (
                <span style={{ fontSize: "0.85rem", color: "var(--success)" }}>
                  Nothing on the kill list yet.
                </span>
              ) : (
                <>
                  <span className="muted" style={{ fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Kill list after this quiz
                  </span>
                  <div className="scroll-table" style={{ maxHeight: 220, marginTop: 6 }}>
                    <table className="table" style={{ fontSize: "0.8rem" }}>
                      <thead>
                        <tr>
                          <th>Item</th>
                          <th>Level</th>
                          <th>Trend</th>
                          <th>Missed</th>
                          <th>Seen</th>
                        </tr>
                      </thead>
                      <tbody>
                        {p.killList.map((m) => (
                          <tr key={m.key}>
                            <td style={{ fontFamily: "'Noto Sans JP', sans-serif", fontSize: "1rem" }}>{m.item}</td>
                            <td><span className={`level-tag ${m.level}`}>{m.level}</span></td>
                            <td><TrendCell t={m.trend} /></td>
                            <td className="badge-wrong">{m.missed}</td>
                            <td className="muted">{m.seen}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
            <p className="method-note" style={{ marginTop: 8, fontSize: "0.75rem" }}>
              Hover or tap a point to see the kill list as it stood after that quiz.
            </p>
          </div>
        );
      })()}
    </div>
  );
}
