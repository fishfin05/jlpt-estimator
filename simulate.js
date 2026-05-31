#!/usr/bin/env node
/**
 * simulate.js — Verify the adaptive quiz algorithm without touching a browser.
 *
 * Runs many simulated quiz sessions for a set of user profiles (fake learners
 * with known accuracy at each JLPT level) and reports whether the algorithm
 * correctly identifies their level, how it distributes questions, and how
 * stable the results are across runs.
 *
 * Usage:
 *   node simulate.js                 — default 300 runs × 30 questions
 *   node simulate.js 500 50          — 500 runs × 50 questions
 *   node simulate.js 100 30 N3       — 100 runs × 30 questions, N3 profile only
 */

'use strict';

// ── Configuration ─────────────────────────────────────────────────────────────

const RUNS_PER_PROFILE = parseInt(process.argv[2]) || 300;
const QUESTIONS        = parseInt(process.argv[3]) || 30;
const ONLY_PROFILE     = process.argv[4] || null;

// ── Constants (must match app.js) ─────────────────────────────────────────────

const LEVELS       = ['N5', 'N4', 'N3', 'N2', 'N1'];
const MIN_PER_LEVEL = 3;
const SATURATE_MIN  = 6;
const SATURATE_LO   = 0.38;
const SATURATE_HI   = 0.80;

// ── Algorithm (mirrors app.js exactly) ───────────────────────────────────────

function wilsonInterval(correct, total) {
  if (total === 0) return { lower: 0, upper: 1, mid: 0.5 };
  const z = 1.96, p = correct / total, n = total;
  const c = (p + z*z/(2*n)) / (1 + z*z/n);
  const m = z * Math.sqrt(p*(1-p)/n + z*z/(4*n*n)) / (1 + z*z/n);
  return { lower: Math.max(0, c-m), upper: Math.min(1, c+m), mid: p };
}

function isSaturated(level, ld) {
  const d = ld[level];
  if (d.total < SATURATE_MIN) return false;
  const acc = d.correct / d.total;
  return acc < SATURATE_LO || acc > SATURATE_HI;
}

function needsMinimum(level, ld) {
  return ld[level].total < MIN_PER_LEVEL;
}

function findBoundary(ld) {
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    const d = ld[LEVELS[i]];
    if (d.total < 3) continue;
    if (d.correct / d.total >= 0.55)
      return LEVELS[Math.min(i + 1, LEVELS.length - 1)];
  }
  return 'N3';
}

function weightedRandom(weights) {
  const avail = Object.fromEntries(
    Object.entries(weights).filter(([, w]) => w > 0)
  );
  if (!Object.keys(avail).length) return 'N3';
  const total = Object.values(avail).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (const [level, w] of Object.entries(avail)) {
    r -= w;
    if (r <= 0) return level;
  }
  return Object.keys(avail).at(-1);
}

function selectNextLevel(ld) {
  if (LEVELS.some(l => needsMinimum(l, ld))) {
    return weightedRandom(
      Object.fromEntries(LEVELS.map(l => [l, needsMinimum(l, ld) ? 5 : 0.5]))
    );
  }
  const boundary = findBoundary(ld);
  const bIdx = LEVELS.indexOf(boundary);
  const weights = Object.fromEntries(
    LEVELS.map(l => [l, isSaturated(l, ld) ? 0 : 0.3])
  );
  weights[boundary]                          = isSaturated(boundary, ld)                          ? 0.5 : 5;
  if (bIdx > 0) weights[LEVELS[bIdx - 1]]   = isSaturated(LEVELS[bIdx - 1], ld)                  ? 0.5 : 2;
  if (bIdx < 4) weights[LEVELS[bIdx + 1]]   = isSaturated(LEVELS[bIdx + 1], ld)                  ? 0.5 : 2;
  return weightedRandom(weights);
}

function estimateLevel(ld) {
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    const d = ld[LEVELS[i]];
    if (d.total >= 3 && wilsonInterval(d.correct, d.total).lower >= 0.35)
      return LEVELS[i];
  }
  return 'Below N5';
}

// ── Simulation ────────────────────────────────────────────────────────────────

function runOnce(profile, numQuestions) {
  const ld = Object.fromEntries(LEVELS.map(l => [l, { correct: 0, total: 0 }]));
  const dist = Object.fromEntries(LEVELS.map(l => [l, 0]));

  for (let q = 0; q < numQuestions; q++) {
    const level = selectNextLevel(ld);
    dist[level]++;
    ld[level].total++;
    if (Math.random() < profile[level]) ld[level].correct++;
  }

  return { estimated: estimateLevel(ld), dist, ld };
}

// ── User profiles ─────────────────────────────────────────────────────────────
// Each value is the probability of answering a question correctly at that level.

const PROFILES = {
  'Beginner':       { expected: 'Below N5', N5: 0.15, N4: 0.08, N3: 0.04, N2: 0.02, N1: 0.01 },
  'Weak N5':        { expected: 'N5',       N5: 0.72, N4: 0.30, N3: 0.12, N2: 0.04, N1: 0.01 },
  'Solid N5':       { expected: 'N5',       N5: 0.92, N4: 0.38, N3: 0.14, N2: 0.05, N1: 0.01 },
  'N4':             { expected: 'N4',       N5: 0.96, N4: 0.78, N3: 0.32, N2: 0.09, N1: 0.02 },
  'N3-N4 border':   { expected: 'N4',       N5: 0.97, N4: 0.82, N3: 0.56, N2: 0.18, N1: 0.05 },
  'Weak N3':        { expected: 'N3',       N5: 0.97, N4: 0.88, N3: 0.65, N2: 0.25, N1: 0.07 },
  'Solid N3':       { expected: 'N3',       N5: 0.98, N4: 0.92, N3: 0.78, N2: 0.32, N1: 0.10 },
  'N2-N3 border':   { expected: 'N3',       N5: 0.99, N4: 0.94, N3: 0.82, N2: 0.55, N1: 0.18 },
  'N2':             { expected: 'N2',       N5: 0.99, N4: 0.96, N3: 0.90, N2: 0.72, N1: 0.28 },
  'N1':             { expected: 'N1',       N5: 0.99, N4: 0.98, N3: 0.96, N2: 0.90, N1: 0.74 },
};

// ── Run all profiles ──────────────────────────────────────────────────────────

const pad = (s, n, r = false) => {
  s = String(s);
  return r ? s.padStart(n) : s.padEnd(n);
};

const BAR_CHARS = '▏▎▍▌▋▊▉█';
function bar(pct, width = 20) {
  const filled = Math.round(pct / 100 * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

console.log('\n' + '═'.repeat(80));
console.log(` JLPT Quiz Algorithm Simulation`);
console.log(` ${RUNS_PER_PROFILE} runs × ${QUESTIONS} questions per run`);
console.log('═'.repeat(80));

const allResults = {};

for (const [name, profileDef] of Object.entries(PROFILES)) {
  if (ONLY_PROFILE && !name.toLowerCase().includes(ONLY_PROFILE.toLowerCase())) continue;

  const { expected, ...profile } = profileDef;

  // Accumulate results
  const estimatedCounts = {};
  const distSums   = Object.fromEntries(LEVELS.map(l => [l, 0]));
  const correctSums = Object.fromEntries(LEVELS.map(l => [l, 0]));
  const totalSums   = Object.fromEntries(LEVELS.map(l => [l, 0]));

  for (let i = 0; i < RUNS_PER_PROFILE; i++) {
    const run = runOnce(profile, QUESTIONS);
    estimatedCounts[run.estimated] = (estimatedCounts[run.estimated] || 0) + 1;
    for (const l of LEVELS) {
      distSums[l]    += run.dist[l];
      correctSums[l] += run.ld[l].correct;
      totalSums[l]   += run.ld[l].total;
    }
  }

  // Most common result
  const sorted = Object.entries(estimatedCounts).sort((a, b) => b[1] - a[1]);
  const [topLevel, topCount] = sorted[0];
  const topPct = Math.round(topCount / RUNS_PER_PROFILE * 100);

  // Did we hit the expected level most often?
  const expectedCount = estimatedCounts[expected] || 0;
  const expectedPct   = Math.round(expectedCount / RUNS_PER_PROFILE * 100);
  const correct       = topLevel === expected;

  allResults[name] = { expected, topLevel, topPct, expectedPct, correct };

  console.log('\n' + '─'.repeat(80));
  console.log(` Profile: ${name}`);
  console.log(` True accuracy: ${LEVELS.map(l => `${l}=${Math.round(profile[l]*100)}%`).join('  ')}`);
  console.log(` Expected level: ${expected}   Most common result: ${topLevel} (${topPct}%)   ${correct ? '✓ CORRECT' : '✗ WRONG'}`);

  // Result distribution bar chart
  console.log('\n Result distribution across all runs:');
  const allLevels = ['Below N5', ...LEVELS];
  for (const level of allLevels) {
    const count = estimatedCounts[level] || 0;
    const pct   = Math.round(count / RUNS_PER_PROFILE * 100);
    const mark  = level === expected ? ' ← expected' : '';
    console.log(`   ${pad(level, 10)} ${bar(pct, 30)} ${pad(pct, 3, true)}%  (${count}/${RUNS_PER_PROFILE})${mark}`);
  }

  // Questions per level (avg)
  console.log('\n Avg questions per level:');
  for (const l of LEVELS) {
    const avgQ    = (distSums[l] / RUNS_PER_PROFILE).toFixed(1);
    const avgAcc  = totalSums[l] > 0
      ? Math.round(correctSums[l] / totalSums[l] * 100)
      : 0;
    const trueAcc = Math.round(profile[l] * 100);
    const drift   = Math.abs(avgAcc - trueAcc) <= 5 ? '' : ` ← drift: observed ${avgAcc}% vs true ${trueAcc}%`;
    console.log(`   ${l}  ${pad(avgQ, 5, true)} q   observed ${pad(avgAcc, 3, true)}%  true ${pad(trueAcc, 3, true)}%${drift}`);
  }
}

// ── Summary table ─────────────────────────────────────────────────────────────

console.log('\n\n' + '═'.repeat(80));
console.log(' Summary');
console.log('═'.repeat(80));
console.log(pad('Profile', 20) + pad('Expected', 12) + pad('Got', 12) + pad('Hit%', 8) + 'Pass?');
console.log('─'.repeat(80));

let passed = 0;
for (const [name, r] of Object.entries(allResults)) {
  const passStr = r.correct ? '✓' : '✗';
  if (r.correct) passed++;
  console.log(
    pad(name, 20) +
    pad(r.expected, 12) +
    pad(r.topLevel, 12) +
    pad(r.expectedPct + '%', 8) +
    passStr
  );
}

console.log('─'.repeat(80));
console.log(` ${passed}/${Object.keys(allResults).length} profiles correctly identified\n`);

// ── Specific checks ───────────────────────────────────────────────────────────

console.log('Algorithm health checks:');

// Check 1: N5/N4 never undersampled
const n5n4Check = (() => {
  let pass = 0;
  for (let i = 0; i < 200; i++) {
    const run = runOnce(PROFILES['Solid N3'], QUESTIONS);
    if (run.dist.N5 >= MIN_PER_LEVEL && run.dist.N4 >= MIN_PER_LEVEL) pass++;
  }
  return Math.round(pass / 200 * 100);
})();
console.log(`  Minimum coverage (N5+N4 ≥${MIN_PER_LEVEL} questions): ${n5n4Check}% of N3-profile runs  ${n5n4Check >= 95 ? '✓' : '✗'}`);

// Check 2: No level over-dominates in a 30-question quiz (no level > 60%)
const overloadCheck = (() => {
  let pass = 0;
  for (let i = 0; i < 200; i++) {
    const run = runOnce(PROFILES['Solid N3'], QUESTIONS);
    const max = Math.max(...LEVELS.map(l => run.dist[l]));
    if (max <= QUESTIONS * 0.60) pass++;
  }
  return Math.round(pass / 200 * 100);
})();
console.log(`  No single level takes >60% of questions: ${overloadCheck}% of N3-profile runs  ${overloadCheck >= 85 ? '✓' : '✗'}`);

// Check 3: Stability — same profile should give same level across runs
const stabilityCheck = (() => {
  const counts = {};
  for (let i = 0; i < 200; i++) {
    const run = runOnce(PROFILES['Solid N3'], QUESTIONS);
    counts[run.estimated] = (counts[run.estimated] || 0) + 1;
  }
  const top = Math.max(...Object.values(counts));
  return Math.round(top / 200 * 100);
})();
console.log(`  Stability (N3 profile gives same level): ${stabilityCheck}% of runs agree  ${stabilityCheck >= 70 ? '✓' : '✗'}`);

console.log('\n' + '═'.repeat(80) + '\n');
