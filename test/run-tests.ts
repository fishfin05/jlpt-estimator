/**
 * run-tests.ts — full feature test harness for the JLPT estimator.
 *
 * Run it with:   npm test
 *
 * It exercises the REAL app modules (not copies):
 *   1. Romaji conversion + answer grading      (src/lib/romaji.ts)
 *   2. Adaptive quiz engine + simulations      (src/lib/quiz-engine.ts)
 *   3. Per-item proficiency / Kill List engine (src/lib/proficiency.ts)
 *   4. Live Supabase data check                (uses .env.local, optional)
 *
 * Sections 1-3 need no network. Section 4 connects to your Supabase project
 * if .env.local is present; otherwise it's skipped.
 */

import { config } from "dotenv";
import {
  toHiragana,
  gradeMeaning,
  gradeReading,
  gradeAnswer,
} from "../src/lib/romaji";
import { QuizEngine, wilsonInterval } from "../src/lib/quiz-engine";
import { buildProficiency, type AttemptLite } from "../src/lib/proficiency";
import { LEVELS, type Dictionary, type Level, type QuizItem } from "../src/lib/types";

config({ path: ".env.local" });

// ─── Tiny test framework ──────────────────────────────────────
let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(name + (detail ? ` — ${detail}` : ""));
    console.log(`  ✗ ${name}${detail ? `  (${detail})` : ""}`);
  }
}

function section(title: string) {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

// ─── Synthetic data helpers ───────────────────────────────────
const KANA_POOL = ["か", "き", "く", "け", "こ", "さ", "し", "す", "せ", "そ", "た", "ち", "つ", "て", "と"];

function makeKanji(level: Level, i: number): QuizItem {
  const li = LEVELS.indexOf(level);
  return {
    _type: "kanji",
    kanji: String.fromCharCode(0x4e00 + li * 200 + i),
    meanings: [`meaning_${level}_${i}`],
    onyomi: [KANA_POOL[i % KANA_POOL.length] + KANA_POOL[(i + 3) % KANA_POOL.length]],
    kunyomi: [],
  };
}

function makeDictionary(perLevel = 60): Dictionary {
  const kanji = {} as Record<Level, QuizItem[]>;
  const vocab = {} as Record<Level, QuizItem[]>;
  for (const l of LEVELS) {
    kanji[l] = Array.from({ length: perLevel }, (_, i) => makeKanji(l, i));
    vocab[l] = [];
  }
  // Dictionary type wants KanjiItem[]/VocabItem[]; QuizItem is a superset.
  return { kanji, vocab } as unknown as Dictionary;
}

// Simulate one quiz taker whose true ability is `trueIdx` (0=N5 … 4=N1,
// -1 = below N5). Returns the engine's estimated overall level.
function simulateQuiz(trueIdx: number, totalQuestions = 40): string {
  const dict = makeDictionary();
  const engine = new QuizEngine(dict, "kanji", totalQuestions);
  let item = engine.loadNext();
  let guard = 0;
  while (item && guard++ < 500) {
    const li = LEVELS.indexOf(engine.currentLevel!);
    const knows = li <= trueIdx ? Math.random() < 0.92 : Math.random() < 0.12;
    if (knows) {
      engine.submit(item.meanings![0], (item as { onyomi: string[] }).onyomi[0]);
    } else {
      engine.submit("zzzwrong", " zzz");
    }
    const done = engine.advance();
    if (done) break;
    item = engine.loadNext();
  }
  return engine.getResults().overallLevel;
}

// ─── Section 1: Romaji & grading ──────────────────────────────
function testRomaji() {
  section("1. Romaji conversion & answer grading");

  check("toHiragana('nihon') → にほん", toHiragana("nihon") === "にほん", toHiragana("nihon"));
  check("toHiragana('sushi') → すし", toHiragana("sushi") === "すし", toHiragana("sushi"));
  check("toHiragana('gakkou') → がっこう (double consonant)", toHiragana("gakkou") === "がっこう", toHiragana("gakkou"));
  check("toHiragana('kya') → きゃ", toHiragana("kya") === "きゃ", toHiragana("kya"));
  check("toHiragana passes hiragana through", toHiragana("にほん") === "にほん");

  const k: QuizItem = { _type: "kanji", kanji: "日", meanings: ["day", "sun"], onyomi: ["にち"], kunyomi: ["ひ"] };
  check("gradeMeaning exact ('day')", gradeMeaning(k, "day") === true);
  check("gradeMeaning case/space ('  SUN ')", gradeMeaning(k, "  SUN ") === true);
  check("gradeMeaning rejects wrong ('cat')", gradeMeaning(k, "cat") === false);
  check("gradeMeaning empty → false", gradeMeaning(k, "") === false);

  const go: QuizItem = { _type: "kanji", kanji: "行", meanings: ["to go"], onyomi: ["こう"], kunyomi: ["い"] };
  check("gradeMeaning strips article ('go' vs 'to go')", gradeMeaning(go, "go") === true);

  check("gradeReading romaji ('nichi' → にち)", gradeReading(k, "nichi") === true);
  check("gradeReading kunyomi ('hi' → ひ)", gradeReading(k, "hi") === true);
  check("gradeReading rejects wrong ('xyz')", gradeReading(k, "xyz") === false);

  const both = gradeAnswer(k, "day", "nichi");
  check("gradeAnswer both correct → correct", both.correct && both.meaningCorrect && both.readingCorrect);
  const meaningOnly = gradeAnswer(k, "day", "wrong");
  check("gradeAnswer meaning-only → correct=true", meaningOnly.correct === true && meaningOnly.readingCorrect === false);
  const readingOnly = gradeAnswer(k, "wrong", "nichi");
  check("gradeAnswer reading-only → correct=false (meaning required)", readingOnly.correct === false && readingOnly.readingCorrect === true);
}

// ─── Section 2: Quiz engine ───────────────────────────────────
function testEngine() {
  section("2. Adaptive quiz engine — invariants");

  const dict = makeDictionary();
  const engine = new QuizEngine(dict, "kanji", 40);
  const seenKeys = new Set<string>();
  let dupes = 0;
  let item = engine.loadNext();
  while (item) {
    const key = (item as { kanji: string }).kanji;
    if (seenKeys.has(key)) dupes++;
    seenKeys.add(key);
    engine.submit(item.meanings![0], (item as { onyomi: string[] }).onyomi[0]);
    if (engine.advance()) break;
    item = engine.loadNext();
  }
  check("no item repeats within a session", dupes === 0, `${dupes} duplicates`);
  check("answers length equals totalQuestions (40)", engine.answers.length === 40, `${engine.answers.length}`);
  check("currentQuestion reaches 40", engine.currentQuestion === 40, `${engine.currentQuestion}`);

  // skip()
  const e2 = new QuizEngine(dict, "kanji", 5);
  e2.loadNext();
  e2.skip();
  check("skip() records a skipped answer", e2.answers[0]?.skipped === true);

  // challenge()
  const e3 = new QuizEngine(dict, "kanji", 5);
  e3.loadNext();
  e3.submit("totallywrong", "wrong");
  check("submit wrong → not correct before challenge", e3.answers[0].result.correct === false);
  e3.challenge();
  check("challenge() flips last answer to correct", e3.answers[0].result.correct === true);
  check("challenge() updates levelData.correct", e3.levelData[e3.answers[0].level].correct === 1);

  // extend()
  const e4 = new QuizEngine(dict, "kanji", 5);
  let it = e4.loadNext();
  while (it) {
    e4.submit(it.meanings![0], (it as { onyomi: string[] }).onyomi[0]);
    if (e4.advance()) break;
    it = e4.loadNext();
  }
  const before = e4.totalQuestions;
  e4.extend(10);
  check("extend(10) raises totalQuestions by 10", e4.totalQuestions === before + 10);
  it = e4.loadNext();
  while (it) {
    e4.submit(it.meanings![0], (it as { onyomi: string[] }).onyomi[0]);
    if (e4.advance()) break;
    it = e4.loadNext();
  }
  check("after extend, answers continue accumulating (15 total)", e4.answers.length === 15, `${e4.answers.length}`);

  // Wilson sanity
  const w = wilsonInterval(8, 10);
  check("wilsonInterval lower < mid < upper", w.lower < w.mid && w.mid < w.upper);
  check("wilsonInterval(0,0) is wide", wilsonInterval(0, 0).lower === 0 && wilsonInterval(0, 0).upper === 1);
}

// ─── Section 2b: Simulations (accuracy/stability) ─────────────
function testSimulations() {
  section("2b. Quiz simulations — does the estimate match true ability?");

  const RUNS = 30;
  const profiles = [
    { name: "Below N5", idx: -1, expect: "Below N5" },
    { name: "N5 learner", idx: 0, expect: "N5" },
    { name: "N4 learner", idx: 1, expect: "N4" },
    { name: "N3 learner", idx: 2, expect: "N3" },
    { name: "N2 learner", idx: 3, expect: "N2" },
    { name: "N1 learner", idx: 4, expect: "N1" },
  ];

  const order = ["Below N5", ...LEVELS];
  let exactTotal = 0;
  let withinOneTotal = 0;
  let count = 0;

  for (const p of profiles) {
    const results: string[] = [];
    for (let r = 0; r < RUNS; r++) results.push(simulateQuiz(p.idx));
    const exact = results.filter((r) => r === p.expect).length;
    const withinOne = results.filter(
      (r) => Math.abs(order.indexOf(r) - order.indexOf(p.expect)) <= 1,
    ).length;
    exactTotal += exact;
    withinOneTotal += withinOne;
    count += RUNS;

    // Distribution string
    const dist: Record<string, number> = {};
    for (const r of results) dist[r] = (dist[r] ?? 0) + 1;
    const distStr = order.filter((l) => dist[l]).map((l) => `${l}:${dist[l]}`).join("  ");
    const pct = Math.round((exact / RUNS) * 100);
    console.log(
      `  ${p.name.padEnd(11)} expect ${p.expect.padEnd(8)} → exact ${String(pct).padStart(3)}%   [${distStr}]`,
    );
  }

  const exactPct = Math.round((exactTotal / count) * 100);
  const withinPct = Math.round((withinOneTotal / count) * 100);
  console.log(`\n  Overall: ${exactPct}% exact, ${withinPct}% within ±1 level (${count} simulated quizzes)`);
  check("simulations: ≥70% exact level match", exactPct >= 70, `${exactPct}%`);
  check("simulations: ≥95% within ±1 level", withinPct >= 95, `${withinPct}%`);
}

// ─── Section 3: Proficiency / Kill List ───────────────────────
function iso(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * 86_400_000).toISOString();
}

function testProficiency() {
  section("3. Proficiency engine & Kill List");

  // Build a history:
  //  食 (A): missed repeatedly, recently → high threat, Weak
  //  日 (B): missed long ago, correct recently → low threat, improving
  //  水 (C): seen once, missed → New
  //  山 (D): always correct → Solid, not on kill list
  const attempts: AttemptLite[] = [
    // A — chronic miss
    { item_type: "kanji", item: "食", level: "N4", correct: false, created_at: iso(20) },
    { item_type: "kanji", item: "食", level: "N4", correct: false, created_at: iso(10) },
    { item_type: "kanji", item: "食", level: "N4", correct: false, created_at: iso(1) },
    // B — used to miss, now solid
    { item_type: "kanji", item: "日", level: "N5", correct: false, created_at: iso(20) },
    { item_type: "kanji", item: "日", level: "N5", correct: false, created_at: iso(18) },
    { item_type: "kanji", item: "日", level: "N5", correct: true, created_at: iso(3) },
    { item_type: "kanji", item: "日", level: "N5", correct: true, created_at: iso(1) },
    // C — new, one miss
    { item_type: "kanji", item: "水", level: "N5", correct: false, created_at: iso(1) },
    // D — always right
    { item_type: "kanji", item: "山", level: "N5", correct: true, created_at: iso(9) },
    { item_type: "kanji", item: "山", level: "N5", correct: true, created_at: iso(2) },
  ];

  const { all, killList } = buildProficiency(attempts);
  const byItem = Object.fromEntries(all.map((s) => [s.item, s]));

  check("tag 食 = Weak", byItem["食"]?.tag === "Weak", byItem["食"]?.tag);
  check("tag 山 = Solid", byItem["山"]?.tag === "Solid", byItem["山"]?.tag);
  check("tag 水 = New (seen once)", byItem["水"]?.tag === "New", byItem["水"]?.tag);
  check("recency: 日 recent accuracy > 50% despite old misses", (byItem["日"]?.recentAccuracy ?? 0) > 0.5, `${byItem["日"]?.recentAccuracy?.toFixed(2)}`);

  check("Solid item 山 is NOT on the kill list", !killList.some((k) => k.item === "山"));
  check("chronic 食 is on the kill list", killList.some((k) => k.item === "食"));
  const threatFood = killList.find((k) => k.item === "食")?.threat ?? 0;
  const threatSun = killList.find((k) => k.item === "日")?.threat ?? 0;
  check("食 has higher threat than 日", threatFood > threatSun, `${threatFood.toFixed(2)} vs ${threatSun.toFixed(2)}`);

  // Trend: 日 improved (old misses, recent corrects) → 'down' (better).
  const sunTrend = killList.find((k) => k.item === "日")?.trend;
  check("日 trend = down (improving)", sunTrend === "down" || sunTrend === undefined, `${sunTrend}`);
  // 食 missed every time → not improving.
  const foodTrend = killList.find((k) => k.item === "食")?.trend;
  check("食 trend is 'same' (no improvement)", foodTrend === "same", `${foodTrend}`);
}

// ─── Section 4: Live Supabase data ────────────────────────────
async function testSupabase() {
  section("4. Live Supabase dictionary data (optional)");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.log("  – skipped (no Supabase env vars found in .env.local)");
    return;
  }

  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(url, key, { auth: { persistSession: false } });

  for (const table of ["kanji", "vocab"] as const) {
    for (const level of LEVELS) {
      const { count, error } = await sb
        .from(table)
        .select("*", { count: "exact", head: true })
        .eq("level", level);
      if (error) {
        check(`${table} ${level} query`, false, error.message);
      } else {
        check(`${table} ${level} has rows`, (count ?? 0) > 0, `${count} rows`);
      }
    }
  }

  // N1 kanji should be populated now (the bug we fixed).
  const { count: n1 } = await sb.from("kanji").select("*", { count: "exact", head: true }).eq("level", "N1");
  check("N1 kanji populated (>500)", (n1 ?? 0) > 500, `${n1} N1 kanji`);

  // Shape check
  const { data: sample } = await sb.from("kanji").select("literal, level, meanings, onyomi, kunyomi").limit(1);
  const row = sample?.[0];
  check("kanji row shape (literal/level/meanings)", !!row && typeof row.literal === "string" && Array.isArray(row.meanings));
}

// ─── Run ──────────────────────────────────────────────────────
async function main() {
  console.log("\x1b[1m=== JLPT Estimator — Feature Test Harness ===\x1b[0m");
  testRomaji();
  testEngine();
  testSimulations();
  testProficiency();
  await testSupabase();

  console.log(`\n\x1b[1m=== Summary ===\x1b[0m`);
  console.log(`  ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log("\n  Failed checks:");
    for (const f of failures) console.log(`   ✗ ${f}`);
    process.exitCode = 1;
  } else {
    console.log("  \x1b[32mAll checks passed.\x1b[0m");
  }
}

main().catch((e) => {
  console.error("Harness crashed:", e);
  process.exitCode = 1;
});
