"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Mode } from "@/lib/types";

const MODES: { id: Mode; icon: string; label: string }[] = [
  { id: "kanji", icon: "漢", label: "Kanji" },
  { id: "vocab", icon: "語", label: "Vocabulary" },
  { id: "both", icon: "両", label: "Both" },
];

export default function QuizLauncher({ loggedIn }: { loggedIn: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("kanji");
  const [count, setCount] = useState(30);

  function start() {
    router.push(`/quiz?mode=${mode}&count=${count}`);
  }

  return (
    <div className="home-inner">
      <div className="logo-area">
        <h1>日本語レベル測定</h1>
        <p className="tagline">Japanese Level Estimator</p>
      </div>

      <div className="card">
        <h2 className="section-label">Quiz Mode</h2>
        <div className="mode-buttons">
          {MODES.map((m) => (
            <button
              key={m.id}
              className={`mode-btn ${mode === m.id ? "active" : ""}`}
              onClick={() => setMode(m.id)}
              type="button"
            >
              <span className="mode-icon">{m.icon}</span>
              <span className="mode-label">{m.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <h2 className="section-label">Questions</h2>
        <div className="slider-row">
          <input
            type="range"
            min={10}
            max={100}
            step={5}
            value={count}
            onChange={(e) => setCount(parseInt(e.target.value))}
          />
          <span className="count-display">{count}</span>
        </div>
        <p className="slider-hint">More questions = higher accuracy. 30 is a good default.</p>
      </div>

      <div className="card">
        <h2 className="section-label">How it works</h2>
        <ul className="method-list">
          <li>Questions are drawn <strong>adaptively</strong> — the quiz focuses on your boundary level.</li>
          <li>It builds a <strong>probability estimate</strong> across all JLPT levels (N5–N1) as you answer.</li>
          <li>Type both the <strong>meaning</strong> and the <strong>reading</strong>. The reading field converts romaji to hiragana live as you type.</li>
          <li><strong>Knowing</strong> a kanji = a correct meaning + at least one reading. <strong>Knowing</strong> a word = a correct meaning + the reading.</li>
        </ul>
      </div>

      <button className="primary-btn" onClick={start} type="button">
        Start Quiz
      </button>
      {!loggedIn && (
        <p className="slider-hint" style={{ textAlign: "center", marginTop: 0 }}>
          No account needed to try — sign in afterward to save your results.
        </p>
      )}
    </div>
  );
}
