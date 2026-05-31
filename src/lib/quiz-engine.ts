// ============================================================
// Adaptive quiz engine — TypeScript port of the validated app.js
// algorithm (10/10 simulated profiles, 78% stability).
//
// Tuned constants are IDENTICAL to the simulated/validated version:
//   MIN_PER_LEVEL = 3, SATURATE_MIN = 6, SATURATE_LO = 0.38,
//   SATURATE_HI = 0.80, findBoundary raw-acc >= 0.55,
//   final estimate Wilson lower bound >= 0.35.
// ============================================================

import {
  LEVELS,
  type Level,
  type Mode,
  type Dictionary,
  type QuizItem,
  type LevelData,
  type AnswerRecord,
  type ResultsSummary,
  type LevelResult,
} from "./types";
import { gradeAnswer } from "./romaji";

const TOTAL_KANJI: Record<Level, number> = { N5: 80, N4: 170, N3: 370, N2: 380, N1: 1000 };
const TOTAL_VOCAB: Record<Level, number> = { N5: 800, N4: 1500, N3: 3750, N2: 6000, N1: 10000 };

const MIN_PER_LEVEL = 3;
const SATURATE_MIN = 6;
const SATURATE_LO = 0.38;
const SATURATE_HI = 0.8;

export function wilsonInterval(correct: number, total: number) {
  if (total === 0) return { lower: 0, upper: 1, mid: 0.5 };
  const z = 1.96;
  const p = correct / total;
  const n = total;
  const center = (p + (z * z) / (2 * n)) / (1 + (z * z) / n);
  const margin =
    (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / (1 + (z * z) / n);
  return { lower: Math.max(0, center - margin), upper: Math.min(1, center + margin), mid: p };
}

function emptyLevelData(): LevelData {
  return LEVELS.reduce((acc, l) => {
    acc[l] = { correct: 0, meaningCorrect: 0, readingCorrect: 0, total: 0 };
    return acc;
  }, {} as LevelData);
}

export class QuizEngine {
  readonly db: Dictionary;
  readonly mode: Mode;
  totalQuestions: number;
  currentQuestion = 0;
  answers: AnswerRecord[] = [];
  levelData: LevelData = emptyLevelData();
  currentItem: QuizItem | null = null;
  currentLevel: Level | null = null;
  phase: "input" | "feedback" | "done" = "input";
  private usedKeys = new Set<string>();

  constructor(db: Dictionary, mode: Mode, totalQuestions: number) {
    this.db = db;
    this.mode = mode;
    this.totalQuestions = totalQuestions;
  }

  // ─── Item pools ───────────────────────────────────────────

  private itemKey(item: QuizItem): string {
    return (item._type === "kanji" ? item.kanji : item.word) + ":" + item._type;
  }

  private getAvailablePool(level: Level): QuizItem[] {
    const kanji: QuizItem[] = (this.db.kanji[level] || []).map((k) => ({ ...k, _type: "kanji" as const }));
    const vocab: QuizItem[] = (this.db.vocab[level] || []).map((v) => ({ ...v, _type: "vocab" as const }));
    let pool: QuizItem[];
    if (this.mode === "kanji") pool = kanji;
    else if (this.mode === "vocab") pool = vocab;
    else pool = [...kanji, ...vocab];
    return pool.filter((item) => !this.usedKeys.has(this.itemKey(item)));
  }

  private pickItem(level: Level): QuizItem | null {
    const pool = this.getAvailablePool(level);
    if (pool.length === 0) return null;
    const item = pool[Math.floor(Math.random() * pool.length)];
    this.usedKeys.add(this.itemKey(item));
    return item;
  }

  // ─── Adaptive sampling ────────────────────────────────────

  private isSaturated(level: Level): boolean {
    const d = this.levelData[level];
    if (d.total < SATURATE_MIN) return false;
    const acc = d.correct / d.total;
    return acc < SATURATE_LO || acc > SATURATE_HI;
  }

  private levelNeedsMinimum(level: Level): boolean {
    return this.levelData[level].total < MIN_PER_LEVEL && this.getAvailablePool(level).length > 0;
  }

  private findBoundary(): Level {
    for (let i = LEVELS.length - 1; i >= 0; i--) {
      const d = this.levelData[LEVELS[i]];
      if (d.total < 3) continue;
      if (d.correct / d.total >= 0.55) {
        return LEVELS[Math.min(i + 1, LEVELS.length - 1)];
      }
    }
    return "N3";
  }

  private weightedRandom(weights: Partial<Record<Level, number>>): Level | null {
    const avail: Partial<Record<Level, number>> = {};
    for (const [level, w] of Object.entries(weights) as [Level, number][]) {
      if (w > 0 && this.getAvailablePool(level).length > 0) avail[level] = w;
    }
    if (Object.keys(avail).length === 0) {
      for (const level of LEVELS) {
        if (this.getAvailablePool(level).length > 0) avail[level] = 1;
      }
    }
    if (Object.keys(avail).length === 0) return null;

    const total = Object.values(avail).reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (const [level, w] of Object.entries(avail) as [Level, number][]) {
      r -= w;
      if (r <= 0) return level;
    }
    const keys = Object.keys(avail) as Level[];
    return keys[keys.length - 1];
  }

  private selectNextLevel(): Level | null {
    if (LEVELS.some((l) => this.levelNeedsMinimum(l))) {
      const weights = LEVELS.reduce((acc, l) => {
        acc[l] = this.levelNeedsMinimum(l) ? 5 : 0.5;
        return acc;
      }, {} as Record<Level, number>);
      return this.weightedRandom(weights);
    }

    const boundary = this.findBoundary();
    const bIdx = LEVELS.indexOf(boundary);
    const weights = LEVELS.reduce((acc, l) => {
      acc[l] = this.isSaturated(l) ? 0 : 0.3;
      return acc;
    }, {} as Record<Level, number>);
    weights[boundary] = this.isSaturated(boundary) ? 0.5 : 5;
    if (bIdx > 0) weights[LEVELS[bIdx - 1]] = this.isSaturated(LEVELS[bIdx - 1]) ? 0.5 : 2;
    if (bIdx < LEVELS.length - 1)
      weights[LEVELS[bIdx + 1]] = this.isSaturated(LEVELS[bIdx + 1]) ? 0.5 : 2;
    return this.weightedRandom(weights);
  }

  // ─── Public flow ──────────────────────────────────────────

  /** Loads the next question. Returns the item, or null if finished/exhausted. */
  loadNext(): QuizItem | null {
    const level = this.selectNextLevel();
    if (!level) {
      this.phase = "done";
      return null;
    }
    const item = this.pickItem(level);
    if (!item) {
      this.phase = "done";
      return null;
    }
    this.currentItem = item;
    this.currentLevel = level;
    this.phase = "input";
    return item;
  }

  /** Grades the typed answer, records it, switches to feedback. */
  submit(meaningAnswer: string, readingAnswer: string): GradeResultWithItem {
    const item = this.currentItem!;
    const level = this.currentLevel!;
    const result = gradeAnswer(item, meaningAnswer, readingAnswer);
    this.phase = "feedback";

    const ld = this.levelData[level];
    ld.total++;
    if (result.meaningCorrect) ld.meaningCorrect++;
    if (result.readingCorrect) ld.readingCorrect++;
    if (result.correct) ld.correct++;

    this.answers.push({
      item,
      level,
      meaningAnswer,
      readingAnswer,
      result,
      skipped: false,
      challenged: false,
    });

    return { result, item };
  }

  /** Records a skipped question (counts as incorrect, shows the card). */
  skip(): { item: QuizItem } {
    const item = this.currentItem!;
    const level = this.currentLevel!;
    const ld = this.levelData[level];
    ld.total++;
    this.answers.push({
      item,
      level,
      meaningAnswer: "",
      readingAnswer: "",
      result: { meaningCorrect: false, readingCorrect: false, correct: false, score: 0 },
      skipped: true,
      challenged: false,
    });
    this.phase = "feedback";
    return { item };
  }

  /** Marks the most recent answer fully correct (user override). */
  challenge(): void {
    const last = this.answers[this.answers.length - 1];
    if (!last || last.challenged) return;
    const ld = this.levelData[last.level];
    if (last.result.meaningCorrect) ld.meaningCorrect--;
    if (last.result.readingCorrect) ld.readingCorrect--;
    if (last.result.correct) ld.correct--;
    last.result.meaningCorrect = true;
    last.result.readingCorrect = true;
    last.result.correct = true;
    last.challenged = true;
    ld.meaningCorrect++;
    ld.readingCorrect++;
    ld.correct++;
  }

  /** Advances to the next question. Returns true if the quiz is finished. */
  advance(): boolean {
    this.currentQuestion++;
    if (this.currentQuestion >= this.totalQuestions) {
      this.phase = "done";
      return true;
    }
    return false;
  }

  /** Adds more questions (the "extend" button). */
  extend(n = 10): void {
    this.totalQuestions += n;
    this.phase = "input";
  }

  isLastQuestion(): boolean {
    return this.currentQuestion + 1 >= this.totalQuestions;
  }

  hasMoreItems(): boolean {
    return LEVELS.some((l) => this.getAvailablePool(l).length > 0);
  }

  // ─── Results ──────────────────────────────────────────────

  getResults(): ResultsSummary {
    const levelResults = {} as Record<Level, LevelResult>;
    const totals = this.mode === "kanji" ? TOTAL_KANJI : this.mode === "vocab" ? TOTAL_VOCAB : null;

    for (const level of LEVELS) {
      const d = this.levelData[level];
      if (d.total === 0) {
        levelResults[level] = { tested: false };
        continue;
      }
      const ci = wilsonInterval(d.correct, d.total);
      const totalForLevel = totals
        ? totals[level]
        : Math.round((TOTAL_KANJI[level] + TOTAL_VOCAB[level]) / 2);

      levelResults[level] = {
        tested: true,
        correct: d.correct,
        total: d.total,
        accuracy: ci.mid,
        lower: ci.lower,
        upper: ci.upper,
        reliable: d.total >= 5,
        estimated: Math.round(ci.mid * totalForLevel),
        estimatedLow: Math.round(ci.lower * totalForLevel),
        estimatedHigh: Math.round(ci.upper * totalForLevel),
        totalForLevel,
      };
    }

    let overallLevel: Level | "Below N5" = "Below N5";
    for (let i = LEVELS.length - 1; i >= 0; i--) {
      const r = levelResults[LEVELS[i]];
      if (r.tested && (r.total ?? 0) >= 3 && (r.lower ?? 0) >= 0.35) {
        overallLevel = LEVELS[i];
        break;
      }
    }

    return { levelResults, overallLevel };
  }
}

export interface GradeResultWithItem {
  result: import("./types").GradeResult;
  item: QuizItem;
}
