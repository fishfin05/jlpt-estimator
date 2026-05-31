// ============================================================
// Romaji → Hiragana conversion, live IME, and answer grading.
// Ported verbatim (logic-identical) from the validated app.js.
// ============================================================

import type { QuizItem, GradeResult } from "./types";

// ─── Romaji table ───────────────────────────────────────────

export const ROMAJI_TABLE: Record<string, string> = (() => {
  const t: Record<string, string> = {};
  const add = (r: string, h: string) => {
    t[r] = h;
  };

  // 4-char sequences (checked before 3-char)
  add("shya", "しゃ"); add("shyu", "しゅ"); add("shyo", "しょ");
  add("chya", "ちゃ"); add("chyu", "ちゅ"); add("chyo", "ちょ");
  add("xtsu", "っ");   add("ltsu", "っ");

  // 3-char compounds
  add("sha", "しゃ"); add("shi", "し"); add("shu", "しゅ"); add("she", "しぇ"); add("sho", "しょ");
  add("chi", "ち"); add("cha", "ちゃ"); add("chu", "ちゅ"); add("che", "ちぇ"); add("cho", "ちょ");
  add("tsu", "つ"); add("tsa", "つぁ");
  add("kya", "きゃ"); add("kyu", "きゅ"); add("kyo", "きょ");
  add("nya", "にゃ"); add("nyu", "にゅ"); add("nyo", "にょ");
  add("hya", "ひゃ"); add("hyu", "ひゅ"); add("hyo", "ひょ");
  add("mya", "みゃ"); add("myu", "みゅ"); add("myo", "みょ");
  add("rya", "りゃ"); add("ryu", "りゅ"); add("ryo", "りょ");
  add("gya", "ぎゃ"); add("gyu", "ぎゅ"); add("gyo", "ぎょ");
  add("ja", "じゃ"); add("ji", "じ"); add("ju", "じゅ"); add("je", "じぇ"); add("jo", "じょ");
  add("jya", "じゃ"); add("jyu", "じゅ"); add("jyo", "じょ");
  add("bya", "びゃ"); add("byu", "びゅ"); add("byo", "びょ");
  add("pya", "ぴゃ"); add("pyu", "ぴゅ"); add("pyo", "ぴょ");
  add("dya", "ぢゃ"); add("dyu", "ぢゅ"); add("dyo", "ぢょ");
  add("tya", "ちゃ"); add("tyi", "ちぃ"); add("tyu", "ちゅ"); add("tye", "ちぇ"); add("tyo", "ちょ");
  add("xya", "ゃ"); add("xyu", "ゅ"); add("xyo", "ょ");
  add("lya", "ゃ"); add("lyu", "ゅ"); add("lyo", "ょ");
  add("xtu", "っ"); add("ltu", "っ");
  add("fa", "ふぁ"); add("fi", "ふぃ"); add("fe", "ふぇ"); add("fo", "ふぉ");
  add("wi", "うぃ"); add("we", "うぇ");

  const simple: [string, string][] = [
    ["ka", "か"], ["ki", "き"], ["ku", "く"], ["ke", "け"], ["ko", "こ"],
    ["sa", "さ"], ["si", "し"], ["su", "す"], ["se", "せ"], ["so", "そ"],
    ["ta", "た"], ["ti", "ち"], ["tu", "つ"], ["te", "て"], ["to", "と"],
    ["na", "な"], ["ni", "に"], ["nu", "ぬ"], ["ne", "ね"], ["no", "の"],
    ["ha", "は"], ["hi", "ひ"], ["fu", "ふ"], ["hu", "ふ"], ["he", "へ"], ["ho", "ほ"],
    ["ma", "ま"], ["mi", "み"], ["mu", "む"], ["me", "め"], ["mo", "も"],
    ["ya", "や"], ["yu", "ゆ"], ["yo", "よ"],
    ["ra", "ら"], ["ri", "り"], ["ru", "る"], ["re", "れ"], ["ro", "ろ"],
    ["wa", "わ"], ["wo", "を"],
    ["ga", "が"], ["gi", "ぎ"], ["gu", "ぐ"], ["ge", "げ"], ["go", "ご"],
    ["za", "ざ"], ["zi", "じ"], ["zu", "ず"], ["ze", "ぜ"], ["zo", "ぞ"],
    ["da", "だ"], ["di", "ぢ"], ["du", "づ"], ["de", "で"], ["do", "ど"],
    ["ba", "ば"], ["bi", "び"], ["bu", "ぶ"], ["be", "べ"], ["bo", "ぼ"],
    ["pa", "ぱ"], ["pi", "ぴ"], ["pu", "ぷ"], ["pe", "ぺ"], ["po", "ぽ"],
    ["a", "あ"], ["i", "い"], ["u", "う"], ["e", "え"], ["o", "お"],
    ["xa", "ぁ"], ["xi", "ぃ"], ["xu", "ぅ"], ["xe", "ぇ"], ["xo", "ぉ"],
    ["la", "ぁ"], ["li", "ぃ"], ["lu", "ぅ"], ["le", "ぇ"], ["lo", "ぉ"],
  ];
  for (const [r, h] of simple) add(r, h);

  return t;
})();

// ─── Full-string conversion (used by the grader) ────────────

export function toHiragana(str: string): string {
  str = str.toLowerCase().trim();
  if (/^[぀-ヿ一-龯\s]+$/.test(str)) return str;

  str = str.replace(/([bcdfghjklmnprstvwxyz])\1/g, (_, c) =>
    c === "n" ? "ん" + c : "っ" + c,
  );
  str = str.replace(/nn/g, "ん");

  let result = "";
  let i = 0;
  while (i < str.length) {
    let matched = false;
    for (const len of [4, 3, 2, 1]) {
      const chunk = str.slice(i, i + len);
      if (ROMAJI_TABLE[chunk]) {
        result += ROMAJI_TABLE[chunk];
        i += len;
        matched = true;
        break;
      }
    }
    if (!matched) {
      if (str[i] === "n" && i + 1 < str.length && !"aeiouny".includes(str[i + 1])) {
        result += "ん";
      } else {
        result += str[i];
      }
      i++;
    }
  }
  result = result.replace(/n$/, "ん");
  return result;
}

// ─── Live IME conversion (called on each input event) ───────

export function convertRomajiInput(str: string): string {
  let result = "";
  let i = 0;

  while (i < str.length) {
    const ch = str[i];
    const remaining = str.length - i;

    if (ch.charCodeAt(0) > 127) {
      result += ch;
      i++;
      continue;
    }

    if (str.slice(i, i + 2).toLowerCase() === "nn") {
      result += "ん";
      i += 2;
      continue;
    }

    if (remaining >= 2) {
      const a = ch.toLowerCase();
      const b = str[i + 1].toLowerCase();
      if (a === b && !"aeioun".includes(a) && /[a-z]/.test(a)) {
        result += "っ";
        i++;
        continue;
      }
    }

    if (remaining >= 4) {
      const c4 = str.slice(i, i + 4).toLowerCase();
      if (ROMAJI_TABLE[c4]) {
        result += ROMAJI_TABLE[c4];
        i += 4;
        continue;
      }
    }

    if (remaining >= 3) {
      const c3 = str.slice(i, i + 3).toLowerCase();
      if (ROMAJI_TABLE[c3]) {
        if (i + 3 === str.length) {
          let isPrefix = false;
          for (const key of Object.keys(ROMAJI_TABLE)) {
            if (key.length === 4 && key.startsWith(c3)) { isPrefix = true; break; }
          }
          if (isPrefix) { result += str.slice(i); return result; }
        }
        result += ROMAJI_TABLE[c3];
        i += 3;
        continue;
      }
    }

    if (remaining >= 2) {
      const c2 = str.slice(i, i + 2).toLowerCase();
      if (ROMAJI_TABLE[c2]) {
        if (i + 2 === str.length) {
          let isPrefix = false;
          for (const key of Object.keys(ROMAJI_TABLE)) {
            if ((key.length === 3 || key.length === 4) && key.startsWith(c2)) { isPrefix = true; break; }
          }
          if (isPrefix) { result += str.slice(i); return result; }
        }
        result += ROMAJI_TABLE[c2];
        i += 2;
        continue;
      }
    }

    const lower = ch.toLowerCase();
    if (lower === "n") {
      if (i + 1 >= str.length) {
        result += "n";
      } else {
        const next = str[i + 1].toLowerCase();
        if ("aeiouny".includes(next)) {
          result += "n";
        } else {
          result += "ん";
        }
      }
      i++;
      continue;
    }

    if (i + 1 === str.length && /[a-z]/.test(lower)) {
      let isPrefix = false;
      for (const key of Object.keys(ROMAJI_TABLE)) {
        if (key.length > 1 && key.startsWith(lower)) { isPrefix = true; break; }
      }
      if (isPrefix) { result += ch; i++; continue; }
    }

    if (ROMAJI_TABLE[lower]) {
      result += ROMAJI_TABLE[lower];
      i++;
      continue;
    }

    result += ch;
    i++;
  }

  return result;
}

// ─── Grading ────────────────────────────────────────────────

export function levenshtein(a: string, b: string): number {
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp: number[][] = Array.from({ length: b.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= a.length; j++) dp[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      dp[i][j] =
        b[i - 1] === a[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[b.length][a.length];
}

function normalizeMeaning(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/\b(to |the |a |an )\b/g, "")
    .replace(/[.,!?;:]/g, "")
    .trim();
}

export function gradeMeaning(item: QuizItem, answer: string): boolean {
  if (!answer || !answer.trim()) return false;
  const user = normalizeMeaning(answer);
  if (!user) return false;

  for (const m of item.meanings || []) {
    const norm = normalizeMeaning(m);
    if (norm === user) return true;
    if (user.length >= 3 && norm.includes(user)) return true;
    if (norm.length >= 3 && user.includes(norm)) return true;
    const threshold = norm.length <= 5 ? 1 : 2;
    if (levenshtein(norm, user) <= threshold) return true;
  }
  return false;
}

export function gradeReading(item: QuizItem, answer: string): boolean {
  if (!answer || !answer.trim()) return false;
  const userHira = toHiragana(answer.trim());

  const readings: string[] = [];
  if (item._type === "kanji") {
    readings.push(...(item.onyomi || []), ...(item.kunyomi || []));
  } else {
    readings.push(item.reading);
  }

  for (const r of readings) {
    if (!r) continue;
    if (r === userHira) return true;
    if (r.startsWith(userHira) && userHira.length >= 2) return true;
    if (userHira.startsWith(r) && r.length >= 2) return true;
    const stripEnding = (s: string) => s.replace(/[るいうえおくすぐつぬぶむ]$/, "");
    if (stripEnding(r) === stripEnding(userHira) && stripEnding(r).length >= 2) return true;
    if (levenshtein(r, userHira) <= 1 && r.length >= 2) return true;
  }
  return false;
}

export function gradeAnswer(
  item: QuizItem,
  meaningAnswer: string,
  readingAnswer: string,
): GradeResult {
  const mc = gradeMeaning(item, meaningAnswer);
  const rc = gradeReading(item, readingAnswer);
  const correct = mc;
  const score = mc && rc ? 1.0 : mc ? 0.7 : rc ? 0.3 : 0.0;
  return { meaningCorrect: mc, readingCorrect: rc, correct, score };
}

export function getAcceptedReadings(item: QuizItem): string {
  const r: string[] = [];
  if (item._type === "kanji") {
    if (item.onyomi?.length) r.push(`on: ${item.onyomi.join("、")}`);
    if (item.kunyomi?.length) r.push(`kun: ${item.kunyomi.join("、")}`);
  } else {
    if (item.reading) r.push(item.reading);
  }
  return r.join(" / ") || "—";
}
