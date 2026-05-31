'use strict';

// =============================================
// Constants
// =============================================

const LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1'];

const LEVEL_COLORS = { N5: '#3b82f6', N4: '#10b981', N3: '#f59e0b', N2: '#f97316', N1: '#ef4444' };

// Approximate total counts per level (for extrapolation)
const TOTAL_KANJI = { N5: 80, N4: 170, N3: 370, N2: 380, N1: 1000 };
const TOTAL_VOCAB = { N5: 800, N4: 1500, N3: 3750, N2: 6000, N1: 10000 };

// =============================================
// App Data & State
// =============================================

let DB = { kanji: {}, vocab: {} };

let state = {
  mode: 'kanji',
  totalQuestions: 30,
  currentQuestion: 0,
  answers: [],
  levelData: initLevelData(),
  currentItem: null,
  currentLevel: null,
  usedKeys: new Set(),
  phase: 'input', // 'input' | 'feedback'
  extending: false,
};

function initLevelData() {
  const d = {};
  for (const l of LEVELS) d[l] = { correct: 0, meaningCorrect: 0, readingCorrect: 0, total: 0 };
  return d;
}

// =============================================
// Data Loading
// =============================================

async function loadData() {
  try {
    const [kanjiRes, vocabRes] = await Promise.all([
      fetch('data/kanji.json'),
      fetch('data/vocab.json'),
    ]);
    DB.kanji = await kanjiRes.json();
    DB.vocab = await vocabRes.json();
  } catch (e) {
    alert('Could not load quiz data. Make sure you are serving the files from a local server (e.g. Live Server in VS Code), not opening index.html directly.');
    console.error(e);
  }
}

// =============================================
// Adaptive Sampling
// =============================================

const MIN_PER_LEVEL = 3;  // minimum questions per level before refinement
const SATURATE_MIN = 6;   // questions needed before a level can be saturated
const SATURATE_LO  = 0.38; // clearly don't know this level (raised from 0.22)
const SATURATE_HI  = 0.80; // clearly know this level

function isSaturated(level) {
  const d = state.levelData[level];
  if (d.total < SATURATE_MIN) return false;
  const acc = d.correct / d.total;
  return acc < SATURATE_LO || acc > SATURATE_HI;
}

function levelNeedsMinimum(level) {
  return state.levelData[level].total < MIN_PER_LEVEL &&
         getAvailablePool(level).length > 0;
}

function selectNextLevel() {
  // Phase 1 — ensure every level gets a minimum sample before refinement.
  // This prevents the "Below N5 / N3" flip caused by 0-or-1 samples at key levels.
  if (LEVELS.some(levelNeedsMinimum)) {
    const weights = {};
    for (const l of LEVELS) {
      weights[l] = levelNeedsMinimum(l) ? 5 : 0.5;
    }
    return weightedRandom(weights);
  }

  // Phase 2 — refinement: focus on the boundary, but stop wasting questions
  // on levels that are already confidently high or low (saturated).
  const boundary = findBoundary();
  const bIdx = LEVELS.indexOf(boundary);

  const weights = {};
  for (const l of LEVELS) {
    weights[l] = isSaturated(l) ? 0 : 0.3;
  }
  // Boundary level and its immediate neighbors get priority,
  // unless they are saturated (in which case we move on).
  weights[boundary]                        = isSaturated(boundary)                        ? 0.5 : 5;
  if (bIdx > 0) weights[LEVELS[bIdx - 1]] = isSaturated(LEVELS[bIdx - 1])                ? 0.5 : 2;
  if (bIdx < LEVELS.length - 1)
    weights[LEVELS[bIdx + 1]]              = isSaturated(LEVELS[bIdx + 1])                ? 0.5 : 2;

  return weightedRandom(weights);
}

function findBoundary() {
  // Use raw accuracy (not Wilson lower bound) so that 3-question samples
  // can still signal the boundary. Wilson CI is too wide with <6 samples
  // to be useful here — it caused the algorithm to ignore N5 entirely for
  // N5-level learners and default to N3 every time.
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    const d = state.levelData[LEVELS[i]];
    if (d.total < 3) continue;
    if (d.correct / d.total >= 0.55) {
      return LEVELS[Math.min(i + 1, LEVELS.length - 1)];
    }
  }
  return 'N3';
}

function weightedRandom(weights) {
  // Only include levels with positive weight AND available items.
  // Excluding weight-0 prevents saturated levels from being chosen as the
  // fallback when Math.random() * total lands exactly on 0.
  const avail = {};
  for (const [level, w] of Object.entries(weights)) {
    if (w > 0 && getAvailablePool(level).length > 0) avail[level] = w;
  }
  // If all preferred levels are blocked, fall back to anything with items.
  if (Object.keys(avail).length === 0) {
    for (const level of LEVELS) {
      if (getAvailablePool(level).length > 0) avail[level] = 1;
    }
  }
  if (Object.keys(avail).length === 0) return null;

  const total = Object.values(avail).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (const [level, w] of Object.entries(avail)) {
    r -= w;
    if (r <= 0) return level;
  }
  return Object.keys(avail)[Object.keys(avail).length - 1];
}

function getAvailablePool(level) {
  const kanji = (DB.kanji[level] || []).map(k => ({ ...k, _type: 'kanji' }));
  const vocab = (DB.vocab[level] || []).map(v => ({ ...v, _type: 'vocab' }));

  let pool;
  if (state.mode === 'kanji') pool = kanji;
  else if (state.mode === 'vocab') pool = vocab;
  else pool = [...kanji, ...vocab];

  return pool.filter(item => !state.usedKeys.has(itemKey(item)));
}

function pickItem(level) {
  const pool = getAvailablePool(level);
  if (pool.length === 0) return null;
  const item = pool[Math.floor(Math.random() * pool.length)];
  state.usedKeys.add(itemKey(item));
  return item;
}

function itemKey(item) {
  return (item.kanji || item.word) + ':' + item._type;
}

// =============================================
// Romaji → Hiragana Converter
// =============================================

const ROMAJI_TABLE = (() => {
  const t = {};
  const add = (r, h) => { t[r] = h; };

  // 4-char sequences (must be checked before 3-char)
  add('shya','しゃ'); add('shyu','しゅ'); add('shyo','しょ');
  add('chya','ちゃ'); add('chyu','ちゅ'); add('chyo','ちょ');
  add('xtsu','っ');   add('ltsu','っ');

  // 3-char compounds
  add('sha','しゃ'); add('shi','し'); add('shu','しゅ'); add('she','しぇ'); add('sho','しょ');
  add('chi','ち'); add('cha','ちゃ'); add('chu','ちゅ'); add('che','ちぇ'); add('cho','ちょ');
  add('tsu','つ'); add('tsa','つぁ');
  add('kya','きゃ'); add('kyu','きゅ'); add('kyo','きょ');
  add('nya','にゃ'); add('nyu','にゅ'); add('nyo','にょ');
  add('hya','ひゃ'); add('hyu','ひゅ'); add('hyo','ひょ');
  add('mya','みゃ'); add('myu','みゅ'); add('myo','みょ');
  add('rya','りゃ'); add('ryu','りゅ'); add('ryo','りょ');
  add('gya','ぎゃ'); add('gyu','ぎゅ'); add('gyo','ぎょ');
  add('ja', 'じゃ'); add('ji', 'じ'); add('ju', 'じゅ'); add('je', 'じぇ'); add('jo', 'じょ');
  add('jya','じゃ'); add('jyu','じゅ'); add('jyo','じょ');
  add('bya','びゃ'); add('byu','びゅ'); add('byo','びょ');
  add('pya','ぴゃ'); add('pyu','ぴゅ'); add('pyo','ぴょ');
  add('dya','ぢゃ'); add('dyu','ぢゅ'); add('dyo','ぢょ');
  // Alternative spellings for ち row
  add('tya','ちゃ'); add('tyi','ちぃ'); add('tyu','ちゅ'); add('tye','ちぇ'); add('tyo','ちょ');
  // x/l prefix — small kana typed individually
  add('xya','ゃ'); add('xyu','ゅ'); add('xyo','ょ');
  add('lya','ゃ'); add('lyu','ゅ'); add('lyo','ょ');
  add('xtu','っ');  add('ltu','っ');
  // f- sounds
  add('fa','ふぁ'); add('fi','ふぃ'); add('fe','ふぇ'); add('fo','ふぉ');
  // w- sounds
  add('wi','うぃ'); add('we','うぇ');

  // Simple kana
  const simple = [
    ['ka','か'],['ki','き'],['ku','く'],['ke','け'],['ko','こ'],
    ['sa','さ'],['si','し'],['su','す'],['se','せ'],['so','そ'],
    ['ta','た'],['ti','ち'],['tu','つ'],['te','て'],['to','と'],
    ['na','な'],['ni','に'],['nu','ぬ'],['ne','ね'],['no','の'],
    ['ha','は'],['hi','ひ'],['fu','ふ'],['hu','ふ'],['he','へ'],['ho','ほ'],
    ['ma','ま'],['mi','み'],['mu','む'],['me','め'],['mo','も'],
    ['ya','や'],['yu','ゆ'],['yo','よ'],
    ['ra','ら'],['ri','り'],['ru','る'],['re','れ'],['ro','ろ'],
    ['wa','わ'],['wo','を'],
    ['ga','が'],['gi','ぎ'],['gu','ぐ'],['ge','げ'],['go','ご'],
    ['za','ざ'],['zi','じ'],['zu','ず'],['ze','ぜ'],['zo','ぞ'],
    ['da','だ'],['di','ぢ'],['du','づ'],['de','で'],['do','ど'],
    ['ba','ば'],['bi','び'],['bu','ぶ'],['be','べ'],['bo','ぼ'],
    ['pa','ぱ'],['pi','ぴ'],['pu','ぷ'],['pe','ぺ'],['po','ぽ'],
    ['a','あ'],['i','い'],['u','う'],['e','え'],['o','お'],
    // x/l prefix — standalone small kana
    ['xa','ぁ'],['xi','ぃ'],['xu','ぅ'],['xe','ぇ'],['xo','ぉ'],
    ['la','ぁ'],['li','ぃ'],['lu','ぅ'],['le','ぇ'],['lo','ぉ'],
  ];
  for (const [r, h] of simple) add(r, h);

  return t;
})();

function toHiragana(str) {
  str = str.toLowerCase().trim();
  // Already kana — return as-is
  if (/^[぀-ヿ一-龯\s]+$/.test(str)) return str;

  // Handle double consonants → っ (e.g. kk, tt, ss but not nn)
  str = str.replace(/([bcdfghjklmnprstvwxyz])\1/g, (_, c) => c === 'n' ? 'ん' + c : 'っ' + c);

  // nn → ん
  str = str.replace(/nn/g, 'ん');

  let result = '';
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
      // 'n' before non-vowel/non-n → ん
      if (str[i] === 'n' && i + 1 < str.length && !'aeiouny'.includes(str[i + 1])) {
        result += 'ん';
      } else {
        result += str[i];
      }
      i++;
    }
  }
  // Trailing n → ん
  result = result.replace(/n$/, 'ん');
  return result;
}

// =============================================
// Live Romaji → Hiragana IME
// =============================================

function convertRomajiInput(str) {
  let result = '';
  let i = 0;

  while (i < str.length) {
    const ch = str[i];
    const remaining = str.length - i;

    // Pass through non-ASCII characters (existing kana, kanji, etc.)
    if (ch.charCodeAt(0) > 127) {
      result += ch;
      i++;
      continue;
    }

    // nn → ん
    if (str.slice(i, i + 2).toLowerCase() === 'nn') {
      result += 'ん';
      i += 2;
      continue;
    }

    // Double consonant (not n, not vowel) → っ, keep second char for next iteration
    if (remaining >= 2) {
      const a = ch.toLowerCase();
      const b = str[i + 1].toLowerCase();
      if (a === b && !'aeioun'.includes(a) && /[a-z]/.test(a)) {
        result += 'っ';
        i++;
        continue;
      }
    }

    // Try 4-char match (e.g. shyo→しょ, xtsu→っ)
    if (remaining >= 4) {
      const c4 = str.slice(i, i + 4).toLowerCase();
      if (ROMAJI_TABLE[c4]) {
        result += ROMAJI_TABLE[c4];
        i += 4;
        continue;
      }
    }

    // Try 3-char match
    if (remaining >= 3) {
      const c3 = str.slice(i, i + 3).toLowerCase();
      if (ROMAJI_TABLE[c3]) {
        // At end: hold if this 3-char could be a prefix of a 4-char entry
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

    // Try 2-char match
    if (remaining >= 2) {
      const c2 = str.slice(i, i + 2).toLowerCase();
      if (ROMAJI_TABLE[c2]) {
        // At end: hold if this 2-char could be a prefix of a 3 or 4-char entry
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

    // Special 'n' handling
    const lower = ch.toLowerCase();
    if (lower === 'n') {
      if (i + 1 >= str.length) {
        result += 'n'; // trailing n — user may type a vowel next
      } else {
        const next = str[i + 1].toLowerCase();
        if ('aeiouny'.includes(next)) {
          result += 'n'; // na/ni/nu/ne/no/nya/nyu/nyo — wait for full syllable
        } else {
          result += 'ん'; // n before consonant — commit
        }
      }
      i++;
      continue;
    }

    // At end of string: if single ASCII char is a valid romaji prefix, hold it
    if (i + 1 === str.length && /[a-z]/.test(lower)) {
      let isPrefix = false;
      for (const key of Object.keys(ROMAJI_TABLE)) {
        if (key.length > 1 && key.startsWith(lower)) { isPrefix = true; break; }
      }
      if (isPrefix) { result += ch; i++; continue; }
    }

    // 1-char match (vowels a/i/u/e/o)
    if (ROMAJI_TABLE[lower]) {
      result += ROMAJI_TABLE[lower];
      i++;
      continue;
    }

    // Pass through anything else unchanged
    result += ch;
    i++;
  }

  return result;
}

function setupRomajiIME(inputEl) {
  inputEl.addEventListener('input', function () {
    const val = this.value;
    if (!val) return;
    const converted = convertRomajiInput(val);
    if (converted !== val) {
      this.value = converted;
      this.setSelectionRange(converted.length, converted.length);
    }
  });
}

// =============================================
// Levenshtein Distance (for fuzzy meaning match)
// =============================================

function levenshtein(a, b) {
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp = Array.from({ length: b.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= a.length; j++) dp[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      dp[i][j] = b[i-1] === a[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[b.length][a.length];
}

// =============================================
// Answer Grading
// =============================================

function normalizeMeaning(s) {
  return s.toLowerCase()
    .trim()
    .replace(/\b(to |the |a |an )\b/g, '')
    .replace(/[.,!?;:]/g, '')
    .trim();
}

function gradeMeaning(item, answer) {
  if (!answer || !answer.trim()) return false;
  const user = normalizeMeaning(answer);
  if (!user) return false;

  for (const m of (item.meanings || [])) {
    const norm = normalizeMeaning(m);
    if (norm === user) return true;
    // Substring match (both directions, min 3 chars)
    if (user.length >= 3 && norm.includes(user)) return true;
    if (norm.length >= 3 && user.includes(norm)) return true;
    // Fuzzy: allow 1 edit for short words, 2 for longer
    const threshold = norm.length <= 5 ? 1 : 2;
    if (levenshtein(norm, user) <= threshold) return true;
  }
  return false;
}

function gradeReading(item, answer) {
  if (!answer || !answer.trim()) return false;

  const userHira = toHiragana(answer.trim());

  // Collect valid readings
  const readings = [];
  if (item.onyomi) readings.push(...item.onyomi);
  if (item.kunyomi) readings.push(...item.kunyomi);
  if (item.reading) readings.push(item.reading);

  for (const r of readings) {
    if (!r) continue;
    // Exact match
    if (r === userHira) return true;
    // Allow trailing okurigana mismatch (user types stem only)
    // e.g. user types "たべ" for "たべる" — accept if first part matches and stem >= 2 chars
    if (r.startsWith(userHira) && userHira.length >= 2) return true;
    if (userHira.startsWith(r) && r.length >= 2) return true;
    // Strip common verb endings before comparing
    const stripEnding = s => s.replace(/[るいうえおくすぐつぬぶむ]$/, '');
    if (stripEnding(r) === stripEnding(userHira) && stripEnding(r).length >= 2) return true;
    // Furigana may include rendaku — allow 1-char difference
    if (levenshtein(r, userHira) <= 1 && r.length >= 2) return true;
  }
  return false;
}

function gradeAnswer(item, meaningAnswer, readingAnswer) {
  const mc = gradeMeaning(item, meaningAnswer);
  const rc = gradeReading(item, readingAnswer);
  // "Correct" if meaning is right (reading is also tested but meaning is primary)
  const correct = mc;
  const score = mc && rc ? 1.0 : mc ? 0.7 : rc ? 0.3 : 0.0;
  return { meaningCorrect: mc, readingCorrect: rc, correct, score };
}

function getAcceptedReadings(item) {
  const r = [];
  if (item.onyomi?.length) r.push(`on: ${item.onyomi.join('、')}`);
  if (item.kunyomi?.length) r.push(`kun: ${item.kunyomi.join('、')}`);
  if (item.reading) r.push(item.reading);
  return r.join(' / ') || '—';
}

// =============================================
// Results Calculation
// =============================================

function wilsonInterval(correct, total) {
  if (total === 0) return { lower: 0, upper: 1, mid: 0.5 };
  const z = 1.96;
  const p = correct / total;
  const n = total;
  const center = (p + z * z / (2 * n)) / (1 + z * z / n);
  const margin = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / (1 + z * z / n);
  return {
    lower: Math.max(0, center - margin),
    upper: Math.min(1, center + margin),
    mid: p,
  };
}

function calculateResults() {
  const levelResults = {};
  const totals = state.mode === 'kanji' ? TOTAL_KANJI : state.mode === 'vocab' ? TOTAL_VOCAB : null;

  for (const level of LEVELS) {
    const d = state.levelData[level];
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

  // Overall level: highest level where the Wilson lower bound is >= 0.35.
  // 0.45 was too strict — with 30 questions total the CI is wide, and demanding
  // a high lower bound caused genuine N5/Weak-N3 users to be classified as
  // "Below N5" or one level down. 0.35 still rejects noise (a lucky 2/3 run
  // has a lower bound of ~0.10) while accepting real but uncertain knowledge.
  let overallLevel = 'Below N5';
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    const r = levelResults[LEVELS[i]];
    if (r.tested && r.total >= 3 && r.lower >= 0.35) {
      overallLevel = LEVELS[i];
      break;
    }
  }

  return { levelResults, overallLevel };
}

// =============================================
// UI
// =============================================

const $ = id => document.getElementById(id);

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(`screen-${name}`).classList.add('active');
}

function updateLevelBadge(level) {
  const badge = $('level-badge');
  badge.textContent = level || '—';
  badge.style.borderColor = LEVEL_COLORS[level] || '#7c3aed';
  badge.style.color = LEVEL_COLORS[level] || '#7c3aed';
  badge.style.background = (LEVEL_COLORS[level] || '#7c3aed') + '22';
}

function renderQuestion() {
  const level = selectNextLevel();
  if (!level) {
    finishQuiz();
    return;
  }

  const item = pickItem(level);
  if (!item) {
    finishQuiz();
    return;
  }

  state.currentItem = item;
  state.currentLevel = level;
  state.phase = 'input';

  // Header
  const pct = (state.currentQuestion / state.totalQuestions) * 100;
  $('progress-fill').style.width = pct + '%';
  $('q-number').textContent = `${state.currentQuestion + 1} / ${state.totalQuestions}`;
  updateLevelBadge(level);

  // Question
  $('item-type-label').textContent = item._type === 'kanji' ? 'Kanji' : 'Vocabulary';
  $('question-display').textContent = item.kanji || item.word;

  // Inputs
  $('meaning-input').value = '';
  $('reading-input').value = '';
  $('meaning-input').className = '';
  $('reading-input').className = '';

  $('input-section').classList.remove('hidden');
  $('feedback-section').classList.add('hidden');
  $('challenge-btn').classList.add('hidden');

  // Focus meaning input
  setTimeout(() => $('meaning-input').focus(), 50);
}

function submitAnswer() {
  if (state.phase !== 'input') return;

  const meaningAnswer = $('meaning-input').value.trim();
  const readingAnswer = $('reading-input').value.trim();

  if (!meaningAnswer && !readingAnswer) {
    skipQuestion();
    return;
  }

  const result = gradeAnswer(state.currentItem, meaningAnswer, readingAnswer);
  state.phase = 'feedback';

  // Update level stats
  const ld = state.levelData[state.currentLevel];
  ld.total++;
  if (result.meaningCorrect) ld.meaningCorrect++;
  if (result.readingCorrect) ld.readingCorrect++;
  if (result.correct) ld.correct++;

  // Record answer
  state.answers.push({
    item: state.currentItem,
    level: state.currentLevel,
    meaningAnswer,
    readingAnswer,
    result,
    challenged: false,
  });

  // Apply input colors
  $('meaning-input').className = result.meaningCorrect ? 'correct' : 'incorrect';
  $('reading-input').className = result.readingCorrect ? 'correct' : 'incorrect';

  // Show feedback
  const fbResult = $('feedback-result');
  if (result.meaningCorrect && result.readingCorrect) {
    fbResult.textContent = '✓ Correct';
    fbResult.className = 'feedback-result correct';
  } else if (result.meaningCorrect) {
    fbResult.textContent = '△ Meaning correct — reading was off';
    fbResult.className = 'feedback-result partial';
  } else if (result.readingCorrect) {
    fbResult.textContent = '△ Reading correct — meaning was off';
    fbResult.className = 'feedback-result partial';
  } else {
    fbResult.textContent = '✗ Incorrect';
    fbResult.className = 'feedback-result incorrect';
  }

  $('user-meaning-display').textContent = meaningAnswer || '(blank)';
  $('user-reading-display').textContent = readingAnswer || '(blank)';
  $('meaning-verdict').textContent = result.meaningCorrect ? '✓' : '✗';
  $('meaning-verdict').className = 'verdict ' + (result.meaningCorrect ? 'correct' : 'incorrect');
  $('reading-verdict').textContent = result.readingCorrect ? '✓' : '✗';
  $('reading-verdict').className = 'verdict ' + (result.readingCorrect ? 'correct' : 'incorrect');

  $('accepted-meanings').textContent = (state.currentItem.meanings || []).join(', ') || '—';
  $('accepted-readings').textContent = getAcceptedReadings(state.currentItem);

  // Show challenge button if not fully correct
  if (!result.meaningCorrect || !result.readingCorrect) {
    $('challenge-btn').classList.remove('hidden');
  }

  $('input-section').classList.add('hidden');
  $('feedback-section').classList.remove('hidden');

  const isLast = state.currentQuestion + 1 >= state.totalQuestions;
  $('next-btn').textContent = isLast ? 'See Results' : 'Next';
  $('next-btn').focus();
}

function challengeAnswer() {
  // Mark the most recent answer as fully correct
  const last = state.answers[state.answers.length - 1];
  if (!last || last.challenged) return;

  const ld = state.levelData[last.level];

  // Undo the original scoring
  if (last.result.meaningCorrect) ld.meaningCorrect--;
  if (last.result.readingCorrect) ld.readingCorrect--;
  if (last.result.correct) ld.correct--;

  // Apply full credit
  last.result.meaningCorrect = true;
  last.result.readingCorrect = true;
  last.result.correct = true;
  last.challenged = true;

  ld.meaningCorrect++;
  ld.readingCorrect++;
  ld.correct++;

  // Update UI
  $('feedback-result').textContent = '✓ Correct (challenged)';
  $('feedback-result').className = 'feedback-result correct';
  $('meaning-verdict').textContent = '✓';
  $('meaning-verdict').className = 'verdict correct';
  $('reading-verdict').textContent = '✓';
  $('reading-verdict').className = 'verdict correct';
  $('meaning-input').className = 'correct';
  $('reading-input').className = 'correct';
  $('challenge-btn').classList.add('hidden');
}

function skipQuestion() {
  if (state.phase !== 'input') return;

  const ld = state.levelData[state.currentLevel];
  ld.total++;
  state.answers.push({
    item: state.currentItem,
    level: state.currentLevel,
    meaningAnswer: '',
    readingAnswer: '',
    result: { meaningCorrect: false, readingCorrect: false, correct: false, score: 0 },
    skipped: true,
    challenged: false,
  });

  // Show the card with correct answers (same feedback panel as a wrong answer)
  // so the user learns the word. nextQuestion() handles advancing.
  state.phase = 'feedback';

  const fbResult = $('feedback-result');
  fbResult.textContent = '— Skipped';
  fbResult.className = 'feedback-result skipped';

  $('user-meaning-display').textContent = '(skipped)';
  $('user-reading-display').textContent = '(skipped)';
  $('meaning-verdict').textContent = '';
  $('meaning-verdict').className = 'verdict';
  $('reading-verdict').textContent = '';
  $('reading-verdict').className = 'verdict';

  $('accepted-meanings').textContent = (state.currentItem.meanings || []).join(', ') || '—';
  $('accepted-readings').textContent = getAcceptedReadings(state.currentItem);

  $('challenge-btn').classList.add('hidden');
  $('input-section').classList.add('hidden');
  $('feedback-section').classList.remove('hidden');

  const isLast = state.currentQuestion + 1 >= state.totalQuestions;
  $('next-btn').textContent = isLast ? 'See Results' : 'Next';
  $('next-btn').focus();
}

function nextQuestion() {
  if (state.phase !== 'feedback') return;
  $('next-btn').textContent = 'Next';
  state.currentQuestion++;

  if (state.currentQuestion >= state.totalQuestions) {
    finishQuiz();
  } else {
    renderQuestion();
  }
}

function finishQuiz() {
  state.phase = 'done';
  saveAndLogSession();
  try {
    renderResults();
  } catch (e) {
    console.error('renderResults error:', e);
  }
  showScreen('results');
}

// =============================================
// Results Rendering
// =============================================

function renderResults() {
  const { levelResults, overallLevel } = calculateResults();

  $('overall-level-display').textContent = overallLevel;

  const lr = levelResults[overallLevel];
  if (overallLevel !== 'Below N5' && lr?.tested) {
    $('overall-note').textContent =
      `${Math.round(lr.accuracy * 100)}% accuracy at ${overallLevel} · ${lr.correct}/${lr.total} questions`;
  } else {
    $('overall-note').textContent = 'Not enough data to determine level — try more questions';
  }

  // Level breakdown
  const breakdown = $('level-breakdown');
  breakdown.innerHTML = '';
  for (const level of LEVELS) {
    const r = levelResults[level];
    const row = document.createElement('div');
    row.className = 'level-row';

    if (!r.tested) {
      row.innerHTML = `
        <div class="level-row-header">
          <span class="level-tag ${level}">${level}</span>
          <span class="level-stats" style="color:var(--text-dim)">Not tested</span>
        </div>`;
    } else {
      const pct = Math.round(r.accuracy * 100);
      const conf = r.reliable ? '' : ' <span class="low-confidence">(low confidence)</span>';
      const label = state.mode === 'kanji' ? 'kanji' : state.mode === 'vocab' ? 'words' : 'items';
      row.innerHTML = `
        <div class="level-row-header">
          <span class="level-tag ${level}">${level}</span>
          <span class="level-stats">
            <span class="highlight">${pct}%</span> known
            · ${r.correct}/${r.total} tested${conf}
          </span>
        </div>
        <div class="level-bar-wrap">
          <div class="level-bar-fill ${level}" style="width:0%"></div>
        </div>
        <div class="level-estimate">
          Est. <strong>${r.estimated.toLocaleString()}</strong> ${label}
          (range: ${r.estimatedLow.toLocaleString()}–${r.estimatedHigh.toLocaleString()} of ${r.totalForLevel.toLocaleString()} total)
        </div>`;
    }
    breakdown.appendChild(row);

    // Animate bar after paint
    if (r.tested) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const fill = row.querySelector('.level-bar-fill');
          if (fill) fill.style.width = Math.round(r.accuracy * 100) + '%';
        });
      });
    }
  }

  // Methodology note
  const questionWord = state.mode === 'kanji' ? 'kanji' : state.mode === 'vocab' ? 'vocabulary' : 'kanji/vocabulary';
  $('methodology-note').textContent =
    `Estimates are based on ${totalAnswered} ${questionWord} samples across JLPT levels. ` +
    `Accuracy at each level is used to extrapolate how many total ${questionWord} from that level you likely know. ` +
    `Wilson score confidence intervals (95%) set the estimated range.`;

  // Extend button: only show if more items available
  const hasMore = LEVELS.some(l => getAvailablePool(l).length > 0);
  $('extend-btn').style.display = hasMore ? '' : 'none';
}

function extendQuiz() {
  state.totalQuestions += 10;
  state.extending = true;
  renderQuestion();
  showScreen('quiz');
}

// =============================================
// Keyboard Handling
// =============================================

document.addEventListener('keydown', e => {
  if ($('screen-quiz').classList.contains('active')) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (state.phase === 'input') {
        // If focus is on meaning input, move to reading
        if (document.activeElement === $('meaning-input') && !$('reading-input').classList.contains('hidden')) {
          $('reading-input').focus();
        } else {
          submitAnswer();
        }
      } else if (state.phase === 'feedback') {
        nextQuestion();
      }
    }
  }
});

// =============================================
// Event Wiring
// =============================================

function wireEvents() {
  // Mode buttons
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.mode = btn.dataset.mode;
    });
  });

  // Question count slider
  const slider = $('q-count');
  const display = $('q-count-display');
  slider.addEventListener('input', () => {
    display.textContent = slider.value;
    state.totalQuestions = parseInt(slider.value);
  });

  // Start button
  $('start-btn').addEventListener('click', startQuiz);

  // Submit button
  $('submit-btn').addEventListener('click', submitAnswer);

  // Next button
  $('next-btn').addEventListener('click', nextQuestion);

  // Challenge button
  $('challenge-btn').addEventListener('click', challengeAnswer);

  // Extend
  $('extend-btn').addEventListener('click', extendQuiz);

  // Home button (mid-quiz)
  $('home-btn').addEventListener('click', () => {
    if (state.currentQuestion === 0 ||
        confirm('Go back to the home screen? Your current session will be lost.')) {
      resetState();
      showScreen('home');
    }
  });

  // Restart
  $('restart-btn').addEventListener('click', () => {
    resetState();
    showScreen('home');
  });

  // Tab within quiz: meaning → reading
  $('meaning-input').addEventListener('keydown', e => {
    if (e.key === 'Tab') {
      e.preventDefault();
      $('reading-input').focus();
    }
  });

  // Live romaji → hiragana IME on reading input
  setupRomajiIME($('reading-input'));
}

// =============================================
// Debug Logging & Session History
// =============================================

const HISTORY_KEY = 'jlpt-quiz-history';

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); }
  catch { return []; }
}

function saveAndLogSession() {
  const { levelResults, overallLevel } = calculateResults();

  // Build the session record
  const levelSnap = {};
  for (const level of LEVELS) {
    const d = state.levelData[level];
    if (!d.total) continue;
    const ci = wilsonInterval(d.correct, d.total);
    levelSnap[level] = {
      correct:  d.correct,
      total:    d.total,
      accuracy: Math.round(ci.mid   * 100),
      ciLow:    Math.round(ci.lower * 100),
      ciHigh:   Math.round(ci.upper * 100),
      reliable: d.total >= 5,
      saturated: isSaturated(level),
    };
  }

  const session = {
    id:        Date.now(),
    date:      new Date().toISOString(),
    mode:      state.mode,
    questions: state.currentQuestion,
    result:    overallLevel,
    levels:    levelSnap,
    log: state.answers.map((a, i) => ({
      q:               i + 1,
      level:           a.level,
      item:            a.item.kanji || a.item.word,
      type:            a.item._type,
      meaningGiven:    a.meaningAnswer || '',
      readingGiven:    a.readingAnswer || '',
      meaningCorrect:  a.result.meaningCorrect,
      readingCorrect:  a.result.readingCorrect,
      correct:         a.result.correct,
      skipped:         !!a.skipped,
      challenged:      !!a.challenged,
    })),
  };

  const history = loadHistory();
  history.push(session);
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); }
  catch (e) { console.warn('Could not save to localStorage:', e.message); }

  printSessionReport(session, history);
}

function printSessionReport(session, history) {
  const ts = new Date(session.date).toLocaleString();
  const runNum = history.length;

  // ── header ──────────────────────────────────────────────
  console.group(
    `%c 🎌 JLPT Quiz Run #${runNum} — ${session.result} — ${ts} `,
    'background:#7c3aed;color:#fff;font-weight:bold;font-size:13px;padding:2px 6px;border-radius:4px'
  );

  // ── question log ────────────────────────────────────────
  console.group('📋 Question log');
  console.table(session.log.map(q => ({
    '#':       q.q,
    'Level':   q.level,
    'Item':    q.item,
    'Type':    q.type,
    'Meaning': q.meaningGiven || '—',
    'Reading': q.readingGiven || '—',
    'Result':  q.skipped     ? '— skip'
             : q.challenged  ? '✓ challenged'
             : q.correct     ? '✓'
             : q.meaningCorrect ? '△ meaning only'
             : q.readingCorrect ? '△ reading only'
             : '✗',
  })));
  console.groupEnd();

  // ── level summary ────────────────────────────────────────
  console.group('📊 Level accuracy');
  const levelRows = {};
  for (const level of LEVELS) {
    const d = session.levels[level];
    if (!d) { levelRows[level] = { tested: false }; continue; }
    levelRows[level] = {
      'Correct / Total': `${d.correct} / ${d.total}`,
      'Accuracy':        `${d.accuracy}%`,
      'CI':              `${d.ciLow}%–${d.ciHigh}%`,
      'Reliable (≥5)':  d.reliable  ? '✓' : '⚠',
      'Saturated':       d.saturated ? '✓' : '—',
    };
  }
  console.table(levelRows);
  console.groupEnd();

  // ── sampling distribution ────────────────────────────────
  const dist = {};
  for (const level of LEVELS) dist[level] = 0;
  session.log.forEach(q => { if (dist[q.level] !== undefined) dist[q.level]++; });
  console.log(
    '🎲 Questions per level: ' +
    LEVELS.map(l => `${l}=${dist[l]}`).join('  ')
  );

  const skipped    = session.log.filter(q => q.skipped).length;
  const challenged = session.log.filter(q => q.challenged).length;
  console.log(`⏭ Skipped: ${skipped}   🏳 Challenged: ${challenged}`);

  // ── result ───────────────────────────────────────────────
  console.log(`%c✔ Estimated level: ${session.result}`, 'font-weight:bold;font-size:13px');

  // ── history trend (if more than one run) ─────────────────
  if (history.length > 1) {
    console.group(`📈 All ${history.length} runs`);
    console.table(history.map((s, i) => {
      const row = {
        '#':      i + 1,
        'Date':   new Date(s.date).toLocaleString(),
        'Mode':   s.mode,
        'Qs':     s.questions,
        'Result': s.result,
      };
      for (const l of LEVELS) {
        row[l] = s.levels[l] ? `${s.levels[l].accuracy}%` : '—';
      }
      return row;
    }));
    console.groupEnd();
  }

  console.groupEnd();

  // ── plain-text copy-paste summary ────────────────────────
  const lines = [
    `=== JLPT Quiz Run #${runNum} ===`,
    `${ts} | Mode: ${session.mode} | ${session.questions} questions`,
    `Result: ${session.result}`,
    '',
    'Level breakdown:',
    ...LEVELS.map(l => {
      const d = session.levels[l];
      if (!d) return `  ${l}  not tested`;
      const bar  = d.accurate > 80 ? '▓▓▓▓▓' : '';
      const flag = l === session.result ? '  ← estimated level' : '';
      return `  ${l}  ${String(d.correct).padStart(2)}/${d.total}  ${String(d.accuracy).padStart(3)}%  [CI ${d.ciLow}%–${d.ciHigh}%]${flag}`;
    }),
    '',
    `Questions per level: ${LEVELS.map(l => `${l}=${dist[l]}`).join(' ')}`,
    `Skipped: ${skipped}  Challenged: ${challenged}`,
    history.length > 1
      ? `Past results: [${history.map(s => s.result).join(', ')}]`
      : '',
  ].filter(l => l !== undefined);

  console.log(
    '%cCopy-paste summary (for sharing):\n\n' + lines.join('\n'),
    'font-family:monospace;font-size:11px;color:#aaa'
  );

  // ── global debug object ──────────────────────────────────
  window.jlptDebug = {
    run:     session,
    history,
    export() {
      const out = JSON.stringify({ run: session, history }, null, 2);
      console.log(out);
      return out;
    },
    exportHistory() {
      const out = JSON.stringify(history, null, 2);
      console.log(out);
      return out;
    },
    clearHistory() {
      localStorage.removeItem(HISTORY_KEY);
      console.log('History cleared.');
    },
    summary() {
      console.log(lines.join('\n'));
    },
  };

  console.log(
    '%cjlptDebug.summary() • jlptDebug.export() • jlptDebug.clearHistory()',
    'color:#666;font-size:11px'
  );
}

// =============================================
// Quiz Start / Reset
// =============================================

function startQuiz() {
  resetState();
  showScreen('quiz');
  renderQuestion();
}

function resetState() {
  state.mode = document.querySelector('.mode-btn.active')?.dataset.mode || 'kanji';
  state.totalQuestions = parseInt($('q-count').value);
  state.currentQuestion = 0;
  state.answers = [];
  state.levelData = initLevelData();
  state.currentItem = null;
  state.currentLevel = null;
  state.usedKeys = new Set();
  state.phase = 'input';
  state.extending = false;
}

// =============================================
// Init
// =============================================

(async () => {
  await loadData();
  wireEvents();
})();
