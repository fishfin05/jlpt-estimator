"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { QuizEngine } from "@/lib/quiz-engine";
import { convertRomajiInput, getAcceptedReadings } from "@/lib/romaji";
import {
  LEVELS,
  LEVEL_COLORS,
  type Dictionary,
  type Mode,
  type Level,
  type QuizItem,
  type GradeResult,
  type ResultsSummary,
} from "@/lib/types";
import { saveSession, type AttemptPayload } from "@/lib/actions/save-session";

type View = "input" | "feedback" | "results";

interface FeedbackState {
  result: GradeResult;
  skipped: boolean;
  userMeaning: string;
  userReading: string;
  acceptedMeanings: string;
  acceptedReadings: string;
  isLast: boolean;
}

export default function Quiz({
  dictionary,
  mode,
  totalQuestions,
}: {
  dictionary: Dictionary;
  mode: Mode;
  totalQuestions: number;
}) {
  const router = useRouter();
  const engineRef = useRef<QuizEngine | null>(null);

  const [view, setView] = useState<View>("input");
  const [item, setItem] = useState<QuizItem | null>(null);
  const [level, setLevel] = useState<Level | null>(null);
  const [qNum, setQNum] = useState(1);
  const [meaning, setMeaning] = useState("");
  const [reading, setReading] = useState("");
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [challenged, setChallenged] = useState(false);
  const [results, setResults] = useState<ResultsSummary | null>(null);
  const [barsReady, setBarsReady] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const meaningRef = useRef<HTMLInputElement>(null);
  const readingRef = useRef<HTMLInputElement>(null);

  // ── Init ────────────────────────────────────────────────
  useEffect(() => {
    const engine = new QuizEngine(dictionary, mode, totalQuestions);
    engineRef.current = engine;
    const first = engine.loadNext();
    setItem(first);
    setLevel(engine.currentLevel);
    setQNum(1);
    setView("input");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Focus the meaning field whenever a fresh input view appears.
  useEffect(() => {
    if (view === "input" && item) {
      const t = setTimeout(() => meaningRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [view, item]);

  // ── Persistence ─────────────────────────────────────────
  const persist = useCallback(async (engine: QuizEngine, res: ResultsSummary) => {
    setSaveState("saving");
    const levelsSnapshot: Record<string, unknown> = {};
    for (const l of LEVELS) {
      const r = res.levelResults[l];
      if (r.tested) {
        levelsSnapshot[l] = {
          correct: r.correct,
          total: r.total,
          accuracy: Math.round((r.accuracy ?? 0) * 100),
        };
      }
    }
    const attempts: AttemptPayload[] = engine.answers.map((a) => ({
      item_type: a.item._type,
      item: a.item._type === "kanji" ? a.item.kanji : a.item.word,
      level: a.level,
      meaning_given: a.meaningAnswer,
      reading_given: a.readingAnswer,
      meaning_correct: a.result.meaningCorrect,
      reading_correct: a.result.readingCorrect,
      correct: a.result.correct,
      skipped: a.skipped,
      challenged: a.challenged,
    }));

    const out = await saveSession({
      mode,
      totalQuestions: engine.currentQuestion,
      result: res.overallLevel,
      levels: levelsSnapshot,
      attempts,
    });
    setSaveState(out.ok ? "saved" : "error");
  }, [mode]);

  const finish = useCallback(() => {
    const engine = engineRef.current!;
    const res = engine.getResults();
    setResults(res);
    setView("results");
    setBarsReady(false);
    requestAnimationFrame(() => requestAnimationFrame(() => setBarsReady(true)));
    void persist(engine, res);
  }, [persist]);

  // ── Actions ─────────────────────────────────────────────
  const doSkip = useCallback(() => {
    const engine = engineRef.current!;
    if (engine.phase !== "input") return;
    const cur = engine.currentItem!;
    engine.skip();
    setChallenged(false);
    setFeedback({
      result: { meaningCorrect: false, readingCorrect: false, correct: false, score: 0 },
      skipped: true,
      userMeaning: "(skipped)",
      userReading: "(skipped)",
      acceptedMeanings: (cur.meanings || []).join(", ") || "—",
      acceptedReadings: getAcceptedReadings(cur),
      isLast: engine.isLastQuestion(),
    });
    setView("feedback");
  }, []);

  const handleSubmit = useCallback(() => {
    const engine = engineRef.current!;
    if (engine.phase !== "input") return;
    const m = meaning.trim();
    const r = reading.trim();
    if (!m && !r) {
      doSkip();
      return;
    }
    const cur = engine.currentItem!;
    const { result } = engine.submit(m, r);
    setChallenged(false);
    setFeedback({
      result,
      skipped: false,
      userMeaning: m || "(blank)",
      userReading: r || "(blank)",
      acceptedMeanings: (cur.meanings || []).join(", ") || "—",
      acceptedReadings: getAcceptedReadings(cur),
      isLast: engine.isLastQuestion(),
    });
    setView("feedback");
  }, [meaning, reading, doSkip]);

  const handleNext = useCallback(() => {
    const engine = engineRef.current!;
    if (engine.phase !== "feedback") return;
    const done = engine.advance();
    if (done) {
      finish();
      return;
    }
    const nextItem = engine.loadNext();
    if (!nextItem) {
      finish();
      return;
    }
    setItem(nextItem);
    setLevel(engine.currentLevel);
    setQNum(engine.currentQuestion + 1);
    setMeaning("");
    setReading("");
    setView("input");
  }, [finish]);

  const handleChallenge = useCallback(() => {
    const engine = engineRef.current!;
    engine.challenge();
    setChallenged(true);
    setFeedback((f) =>
      f
        ? { ...f, result: { meaningCorrect: true, readingCorrect: true, correct: true, score: 1 } }
        : f,
    );
  }, []);

  const handleExtend = useCallback(() => {
    const engine = engineRef.current!;
    engine.extend(10);
    const nextItem = engine.loadNext();
    if (!nextItem) return;
    setItem(nextItem);
    setLevel(engine.currentLevel);
    setQNum(engine.currentQuestion + 1);
    setMeaning("");
    setReading("");
    setResults(null);
    setSaveState("idle");
    setView("input");
  }, []);

  const goHome = useCallback(() => {
    const engine = engineRef.current;
    if (!engine || engine.currentQuestion === 0 ||
        window.confirm("Go back to the home screen? Your current session will be lost.")) {
      router.push("/");
    }
  }, [router]);

  // ── Keyboard ────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Enter") return;
      if (view === "input") {
        e.preventDefault();
        if (document.activeElement === meaningRef.current) {
          readingRef.current?.focus();
        } else {
          handleSubmit();
        }
      } else if (view === "feedback") {
        e.preventDefault();
        handleNext();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, handleSubmit, handleNext]);

  // ── Reading IME ─────────────────────────────────────────
  function onReadingChange(e: React.ChangeEvent<HTMLInputElement>) {
    const converted = convertRomajiInput(e.target.value);
    setReading(converted);
    requestAnimationFrame(() => {
      const el = readingRef.current;
      if (el) el.setSelectionRange(converted.length, converted.length);
    });
  }

  // ── Render: results ─────────────────────────────────────
  if (view === "results" && results) {
    return (
      <ResultsView
        results={results}
        mode={mode}
        engine={engineRef.current!}
        barsReady={barsReady}
        saveState={saveState}
        onExtend={handleExtend}
        onRestart={() => router.push("/")}
      />
    );
  }

  // ── Render: quiz ────────────────────────────────────────
  const engine = engineRef.current;
  const progressPct = engine ? (engine.currentQuestion / engine.totalQuestions) * 100 : 0;
  const total = engine?.totalQuestions ?? totalQuestions;
  const fb = feedback;

  return (
    <main className="page-quiz">
      <div className="quiz-header">
        <button className="home-btn" onClick={goHome} type="button">
          ← Home
        </button>
        <div className="progress-wrap">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
          <span className="q-number">
            {qNum} / {total}
          </span>
        </div>
        <span
          className="level-badge"
          style={
            level
              ? {
                  borderColor: LEVEL_COLORS[level],
                  color: LEVEL_COLORS[level],
                  background: `${LEVEL_COLORS[level]}22`,
                }
              : undefined
          }
        >
          {level ?? "—"}
        </span>
      </div>

      <div className="question-area">
        <div className="item-type-label">{item?._type === "kanji" ? "Kanji" : "Vocabulary"}</div>
        <div className="question-display" key={item ? (item._type === "kanji" ? item.kanji : item.word) : "x"}>
          {item ? (item._type === "kanji" ? item.kanji : item.word) : ""}
        </div>
      </div>

      {view === "input" && (
        <div className="input-section">
          <div className="input-group">
            <label htmlFor="meaning-input">Meaning</label>
            <input
              id="meaning-input"
              ref={meaningRef}
              type="text"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="e.g. day, sun"
              value={meaning}
              onChange={(e) => setMeaning(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Tab") {
                  e.preventDefault();
                  readingRef.current?.focus();
                }
              }}
            />
          </div>
          <div className="input-group">
            <label htmlFor="reading-input">Reading</label>
            <input
              id="reading-input"
              ref={readingRef}
              type="text"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="romaji converts live: nichi → にち"
              value={reading}
              onChange={onReadingChange}
            />
          </div>
          <button className="primary-btn" onClick={handleSubmit} type="button">
            Submit <kbd>Enter</kbd>
          </button>
        </div>
      )}

      {view === "feedback" && fb && (
        <div className="feedback-section">
          <div
            className={
              "feedback-result " +
              (fb.skipped
                ? "skipped"
                : fb.result.meaningCorrect && fb.result.readingCorrect
                  ? "correct"
                  : fb.result.meaningCorrect || fb.result.readingCorrect
                    ? "partial"
                    : "incorrect")
            }
          >
            {fb.skipped
              ? "— Skipped"
              : challenged
                ? "✓ Correct (challenged)"
                : fb.result.meaningCorrect && fb.result.readingCorrect
                  ? "✓ Correct"
                  : fb.result.meaningCorrect
                    ? "△ Meaning correct — reading was off"
                    : fb.result.readingCorrect
                      ? "△ Reading correct — meaning was off"
                      : "✗ Incorrect"}
          </div>

          <div className="answer-details">
            <div className="answer-row">
              <span className="answer-label">Your meaning:</span>
              <span className="user-answer">{fb.userMeaning}</span>
              <span className={"verdict " + (fb.result.meaningCorrect ? "correct" : "incorrect")}>
                {fb.skipped ? "" : fb.result.meaningCorrect ? "✓" : "✗"}
              </span>
            </div>
            <div className="answer-row">
              <span className="answer-label">Your reading:</span>
              <span className="user-answer">{fb.userReading}</span>
              <span className={"verdict " + (fb.result.readingCorrect ? "correct" : "incorrect")}>
                {fb.skipped ? "" : fb.result.readingCorrect ? "✓" : "✗"}
              </span>
            </div>
            <div className="accepted-wrap">
              <span className="answer-label">Accepted meanings:</span>
              <span className="accepted-list">{fb.acceptedMeanings}</span>
            </div>
            <div className="accepted-wrap">
              <span className="answer-label">Accepted readings:</span>
              <span className="accepted-list">{fb.acceptedReadings}</span>
            </div>
          </div>

          <div className="feedback-actions">
            {!fb.skipped && !challenged && !(fb.result.meaningCorrect && fb.result.readingCorrect) && (
              <button className="secondary-btn" onClick={handleChallenge} type="button">
                Challenge — I got it right
              </button>
            )}
            <button className="primary-btn" onClick={handleNext} type="button">
              {fb.isLast ? "See Results" : "Next"} <kbd>Enter</kbd>
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

// ============================================================
// Results view
// ============================================================

function ResultsView({
  results,
  mode,
  engine,
  barsReady,
  saveState,
  onExtend,
  onRestart,
}: {
  results: ResultsSummary;
  mode: Mode;
  engine: QuizEngine;
  barsReady: boolean;
  saveState: "idle" | "saving" | "saved" | "error";
  onExtend: () => void;
  onRestart: () => void;
}) {
  const { levelResults, overallLevel } = results;
  const tested = LEVELS.filter((l) => levelResults[l].tested);
  const totalAnswered = tested.reduce((s, l) => s + (levelResults[l].total ?? 0), 0);
  const label = mode === "kanji" ? "kanji" : mode === "vocab" ? "words" : "items";

  const lr = overallLevel !== "Below N5" ? levelResults[overallLevel as Level] : null;
  const overallNote =
    lr && lr.tested
      ? `${Math.round((lr.accuracy ?? 0) * 100)}% accuracy at ${overallLevel} · ${lr.correct}/${lr.total} questions`
      : "Not enough data to determine level — try more questions";

  const questionWord = mode === "kanji" ? "kanji" : mode === "vocab" ? "vocabulary" : "kanji/vocabulary";

  return (
    <main className="page-results">
      <div className="results-inner">
        <h2>Your Results</h2>

        <div className="card overall-card">
          <div className="overall-label">Estimated Level</div>
          <div className="overall-level-value">{overallLevel}</div>
          <div className="overall-note">{overallNote}</div>
          <div className="overall-note" style={{ marginTop: 6, fontSize: "0.75rem" }}>
            {saveState === "saving" && "Saving to your history…"}
            {saveState === "saved" && "✓ Saved to your history"}
            {saveState === "error" && "⚠ Could not save this session"}
          </div>
        </div>

        <div className="card">
          <h3 className="section-label">Breakdown by JLPT Level</h3>
          <div className="level-breakdown">
            {LEVELS.map((l) => {
              const r = levelResults[l];
              if (!r.tested) {
                return (
                  <div className="level-row" key={l}>
                    <div className="level-row-header">
                      <span className={`level-tag ${l}`}>{l}</span>
                      <span className="level-stats" style={{ color: "var(--text-dim)" }}>
                        Not tested
                      </span>
                    </div>
                  </div>
                );
              }
              const pct = Math.round((r.accuracy ?? 0) * 100);
              return (
                <div className="level-row" key={l}>
                  <div className="level-row-header">
                    <span className={`level-tag ${l}`}>{l}</span>
                    <span className="level-stats">
                      <span className="highlight">{pct}%</span> known · {r.correct}/{r.total} tested
                      {!r.reliable && <span className="low-confidence"> (low confidence)</span>}
                    </span>
                  </div>
                  <div className="level-bar-wrap">
                    <div className={`level-bar-fill ${l}`} style={{ width: barsReady ? `${pct}%` : "0%" }} />
                  </div>
                  <div className="level-estimate">
                    Est. <strong>{(r.estimated ?? 0).toLocaleString()}</strong> {label} (range:{" "}
                    {(r.estimatedLow ?? 0).toLocaleString()}–{(r.estimatedHigh ?? 0).toLocaleString()} of{" "}
                    {(r.totalForLevel ?? 0).toLocaleString()} total)
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card">
          <h3 className="section-label">Methodology Note</h3>
          <p className="method-note">
            Estimates are based on {totalAnswered} {questionWord} samples across JLPT levels. Accuracy at
            each level is used to extrapolate how many total {questionWord} from that level you likely
            know. Wilson score confidence intervals (95%) set the estimated range.
          </p>
          <p className="method-note">
            Results marked <span className="low-confidence">low confidence</span> are based on fewer than 5
            questions at that level — extend the quiz for better accuracy.
          </p>
        </div>

        <div className="results-actions">
          {engine.hasMoreItems() && (
            <button className="secondary-btn" onClick={onExtend} type="button">
              +10 More Questions
            </button>
          )}
          <button className="primary-btn" onClick={onRestart} type="button">
            Start Over
          </button>
        </div>
      </div>
    </main>
  );
}
