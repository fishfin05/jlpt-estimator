export type Level = "N5" | "N4" | "N3" | "N2" | "N1";
export type Mode = "kanji" | "vocab" | "both";

export const LEVELS: Level[] = ["N5", "N4", "N3", "N2", "N1"];

export const LEVEL_COLORS: Record<Level, string> = {
  N5: "#3b82f6",
  N4: "#10b981",
  N3: "#f59e0b",
  N2: "#f97316",
  N1: "#ef4444",
};

export interface KanjiItem {
  kanji: string;
  meanings: string[];
  onyomi: string[];
  kunyomi: string[];
  _type?: "kanji";
}

export interface VocabItem {
  word: string;
  reading: string;
  meanings: string[];
  _type?: "vocab";
}

export type QuizItem =
  | (KanjiItem & { _type: "kanji" })
  | (VocabItem & { _type: "vocab" });

export type Dictionary = {
  kanji: Record<Level, KanjiItem[]>;
  vocab: Record<Level, VocabItem[]>;
};

export interface LevelStat {
  correct: number;
  meaningCorrect: number;
  readingCorrect: number;
  total: number;
}

export type LevelData = Record<Level, LevelStat>;

export interface GradeResult {
  meaningCorrect: boolean;
  readingCorrect: boolean;
  correct: boolean;
  score: number;
}

export interface AnswerRecord {
  item: QuizItem;
  level: Level;
  meaningAnswer: string;
  readingAnswer: string;
  result: GradeResult;
  skipped: boolean;
  challenged: boolean;
}

export interface LevelResult {
  tested: boolean;
  correct?: number;
  total?: number;
  accuracy?: number;
  lower?: number;
  upper?: number;
  reliable?: boolean;
  estimated?: number;
  estimatedLow?: number;
  estimatedHigh?: number;
  totalForLevel?: number;
}

export interface ResultsSummary {
  levelResults: Record<Level, LevelResult>;
  overallLevel: Level | "Below N5";
}
