"use client";

import { useState } from "react";

export interface SessionPoint {
  date: string; // ISO timestamp
  level: string; // result label, e.g. "N4" or "Below N5"
  levelNum: number; // 0 = Below N5 … 5 = N1
  accuracy: number | null; // 0–100, or null if unknown
}

const LEVEL_LABELS = ["<N5", "N5", "N4", "N3", "N2", "N1"];

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

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  // Only label a handful of x ticks to avoid crowding.
  const xTickIdx = (() => {
    if (n <= 6) return points.map((_, i) => i);
    const step = (n - 1) / 5;
    return Array.from({ length: 6 }, (_, k) => Math.round(k * step));
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

        {/* Points */}
        {points.map((p, i) => {
          const v = valueOf(p);
          if (v === null) return null;
          return (
            <g key={i}>
              <circle
                cx={xAt(i)}
                cy={yAt(v)}
                r={4}
                fill="var(--primary, #6c8cff)"
                stroke="var(--bg, #11111a)"
                strokeWidth={1.5}
              >
                <title>
                  {new Date(p.date).toLocaleString()} — {p.level}
                  {p.accuracy !== null ? ` · ${p.accuracy}% accuracy` : ""}
                </title>
              </circle>
            </g>
          );
        })}

        {/* X labels */}
        {xTickIdx.map((i) => (
          <text
            key={i}
            x={xAt(i)}
            y={H - PAD_B + 18}
            textAnchor="middle"
            fontSize={11}
            fill="var(--text-muted, #888)"
          >
            {fmtDate(points[i].date)}
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
    </div>
  );
}
