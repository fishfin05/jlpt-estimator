#!/usr/bin/env node
/**
 * fetch-data.js
 *
 * Downloads JMdict + KANJIDIC2 from jmdict-simplified and converts them
 * to the quiz format used by data/kanji.json and data/vocab.json.
 *
 * Sources (both open-license):
 *   JMdict    — © Electronic Dictionary Research and Development Group
 *               https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project
 *   KANJIDIC2 — same group, same license (CC BY-SA 4.0)
 *   Packaged as JSON by: https://github.com/scriptin/jmdict-simplified
 *
 * Run once with:  node fetch-data.js
 *
 * Downloads ~100 MB total. Overwrites data/kanji.json and data/vocab.json
 * only on success — existing files are untouched if anything fails.
 *
 * KANJIDIC2 uses the pre-2010 4-level JLPT system:
 *   old level 4 → N5 | 3 → N4 | 2 → N3 | 1 → N2
 *
 * JMdict no longer includes JLPT tags (removed upstream ~2024).
 * Vocabulary level is inferred from the hardest JLPT kanji in each word.
 * Words with kanji outside the tagged set are treated as N1.
 * Pure-kana words that are marked "common" in JMdict are assigned N4.
 */

'use strict';

const https  = require('https');
const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const { execSync } = require('child_process');

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, { headers: { 'User-Agent': 'jlpt-quiz-fetcher/1.0' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(httpGet(res.headers.location));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function httpDownload(url, dest) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(dest);
    mod.get(url, { headers: { 'User-Agent': 'jlpt-quiz-fetcher/1.0' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        try { fs.unlinkSync(dest); } catch (_) {}
        return resolve(httpDownload(res.headers.location, dest));
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const total = parseInt(res.headers['content-length'] || '0', 10);
      let received = 0;
      res.on('data', chunk => {
        received += chunk.length;
        const mb = (received / 1e6).toFixed(1);
        if (total > 0) {
          const pct = Math.round(received / total * 100);
          const tot = (total / 1e6).toFixed(1);
          process.stdout.write(`\r    ${pct}%  ${mb} / ${tot} MB  `);
        } else {
          process.stdout.write(`\r    ${mb} MB downloaded  `);
        }
      });
      res.pipe(file);
      file.on('finish', () => { process.stdout.write('\n'); file.close(resolve); });
      res.on('error', reject);
    }).on('error', reject);
  });
}

// ─── Kana helpers ─────────────────────────────────────────────────────────────

function katakanaToHiragana(str) {
  // KANJIDIC2 stores on'yomi in katakana
  return str.replace(/[ァ-ヶ]/g, c =>
    String.fromCharCode(c.charCodeAt(0) - 0x60));
}

// ─── KANJIDIC2 processing ─────────────────────────────────────────────────────

// JLPT no longer publishes an official kanji list, and KANJIDIC2's `jlptLevel`
// only encodes the OLD pre-2010 4-level system (so it can never yield N1).
// Instead we map by Japanese school grade (kyōiku/jōyō), which covers all five
// levels — including N1 — and lines up closely with the commonly cited JLPT
// kanji counts (~80 / 170 / 370 / 380 / 1000 for N5→N1).
//   grade 1   → N5   (1st-year kyōiku, ~80 kanji)
//   grade 2   → N4   (~160)
//   grade 3-4 → N3   (~400)
//   grade 5-6 → N2   (~366)
//   grade 8   → N1   (remaining jōyō / secondary school, ~1100)
// (There is no grade 7; grades 9-10 are jinmeiyō name kanji, excluded.)
const GRADE_LEVEL = { 1: 'N5', 2: 'N4', 3: 'N3', 4: 'N3', 5: 'N2', 6: 'N2', 8: 'N1' };
// Fallback for the rare kanji that carry an old JLPT tag but no grade.
const OLD_JLPT_LEVEL = { 4: 'N5', 3: 'N4', 2: 'N3', 1: 'N2' };

function processKanjidic(data) {
  const out    = { N5: [], N4: [], N3: [], N2: [], N1: [] };
  const levMap = new Map(); // char → 'N5'..'N1' for vocab inference

  for (const c of data.characters) {
    const grade = c.misc && c.misc.grade;
    const jlpt  = c.misc && c.misc.jlptLevel;
    const level = GRADE_LEVEL[grade] || OLD_JLPT_LEVEL[jlpt];

    // Always register every leveled kanji in the lookup map (for vocab inference)
    if (level) levMap.set(c.literal, level);

    if (!level) continue;

    const groups = (c.readingMeaning && c.readingMeaning.groups) || [];

    const meanings = groups
      .flatMap(g => (g.meanings || []).filter(m => m.lang === 'en').map(m => m.value))
      .slice(0, 5);

    if (!meanings.length) continue;

    const onyomi = groups
      .flatMap(g => (g.readings || [])
        .filter(r => r.type === 'ja_on')
        .map(r => katakanaToHiragana(r.value)));

    const kunyomi = groups
      .flatMap(g => (g.readings || [])
        .filter(r => r.type === 'ja_kun')
        .map(r => r.value.replace(/\..*/, '').replace(/[-～]$/, '')));

    out[level].push({ kanji: c.literal, meanings, onyomi, kunyomi });
  }

  return { out, levMap };
}

// ─── JMdict processing ────────────────────────────────────────────────────────

const LEVEL_ORDER = ['N5', 'N4', 'N3', 'N2', 'N1'];
const CJK_RE = /[一-鿿㐀-䶿]/; // CJK unified + extension A

// Infer the difficulty level of a word from the JLPT levels of its kanji.
// The hardest kanji in the word determines the word's level.
// A kanji not in the KANJIDIC2 JLPT set is treated as N1 (post-JLPT level).
function inferLevel(word, levMap) {
  const kanjiForm = (word.kanji || [])[0];
  const kanaForm  = (word.kana  || [])[0];
  const text = kanjiForm ? kanjiForm.text : (kanaForm ? kanaForm.text : '');

  let hardest = -1;
  let hasKanji = false;

  for (const ch of text) {
    if (!CJK_RE.test(ch)) continue;
    hasKanji = true;
    const lv = levMap.get(ch);
    if (!lv) {
      // Unknown kanji — harder than anything in the JLPT-tagged set
      return 'N1';
    }
    const idx = LEVEL_ORDER.indexOf(lv);
    if (idx > hardest) hardest = idx;
  }

  if (hasKanji) return hardest >= 0 ? LEVEL_ORDER[hardest] : null;

  // Pure kana word: only keep ones marked "common" in JMdict, assign N4.
  // These are everyday words like あいさつ, ありがとう, etc.
  const isCommon = kanaForm?.common || kanjiForm?.common;
  return isCommon ? 'N4' : null;
}

// Per-level caps that roughly track the real JLPT vocab distribution
// (more words at higher levels) instead of a flat number. The most useful
// (JMdict-"common") words are kept first, so each level's pool is the highest-
// frequency vocabulary available at that difficulty.
const LEVEL_CAP = { N5: 1500, N4: 2500, N3: 5000, N2: 7000, N1: 10000 };

function processJmdict(data, levMap) {
  const buckets = { N5: [], N4: [], N3: [], N2: [], N1: [] };

  for (const word of data.words) {
    const level = inferLevel(word, levMap);
    if (!level) continue;

    const kanaEntry  = (word.kana  || [])[0];
    const kanjiEntry = (word.kanji || [])[0];
    if (!kanaEntry) continue;

    const wordText = kanjiEntry ? kanjiEntry.text : kanaEntry.text;
    const reading  = kanaEntry.text;

    const meanings = (word.sense || [])
      .flatMap(s => (s.gloss || [])
        .filter(g => g.lang === 'eng' || g.lang === 'en')
        .map(g => g.text))
      .filter(Boolean)
      .slice(0, 4);

    if (!meanings.length) continue;

    const isCommon = !!(kanaEntry.common || (kanjiEntry && kanjiEntry.common));
    buckets[level].push({ word: wordText, reading, meanings, _common: isCommon });
  }

  // Keep common words first, then cap each level.
  for (const l of LEVEL_ORDER) {
    buckets[l].sort((a, b) => (b._common ? 1 : 0) - (a._common ? 1 : 0));
    buckets[l] = buckets[l]
      .slice(0, LEVEL_CAP[l])
      // eslint-disable-next-line no-unused-vars
      .map(({ _common, ...rest }) => rest);
  }

  return buckets;
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const dataDir = path.join(__dirname, 'data');
  const tmp     = path.join(__dirname, '.fetch-tmp');
  fs.mkdirSync(tmp, { recursive: true });

  try {
    // 1. Get latest release metadata from GitHub
    process.stdout.write('Fetching latest release info... ');
    const releaseJson = await httpGet(
      'https://api.github.com/repos/scriptin/jmdict-simplified/releases/latest'
    );
    const release = JSON.parse(releaseJson);
    if (!release.tag_name) throw new Error(`Unexpected GitHub API response:\n${releaseJson.slice(0, 300)}`);
    console.log(release.tag_name);

    const assets = release.assets || [];
    if (!assets.length) {
      throw new Error(
        'No assets found in the release. ' +
        'Check https://github.com/scriptin/jmdict-simplified/releases manually.'
      );
    }

    const kanjiAsset = assets.find(a => /kanjidic2.*\.zip$/i.test(a.name));
    const vocabAsset  = assets.find(a => /jmdict-en.*\.zip$/i.test(a.name));

    if (!kanjiAsset) {
      throw new Error(
        `Could not find a kanjidic2 ZIP in release assets.\n` +
        `Available files: ${assets.map(a => a.name).join(', ')}`
      );
    }
    if (!vocabAsset) {
      throw new Error(
        `Could not find a jmdict-en ZIP in release assets.\n` +
        `Available files: ${assets.map(a => a.name).join(', ')}`
      );
    }

    // 2. Download both ZIPs
    console.log(`\nDownloading ${kanjiAsset.name}  (${(kanjiAsset.size / 1e6).toFixed(1)} MB)...`);
    const kanjiZip = path.join(tmp, 'kanjidic2.zip');
    await httpDownload(kanjiAsset.browser_download_url, kanjiZip);

    console.log(`Downloading ${vocabAsset.name}  (${(vocabAsset.size / 1e6).toFixed(1)} MB)...`);
    const vocabZip = path.join(tmp, 'jmdict-en.zip');
    await httpDownload(vocabAsset.browser_download_url, vocabZip);

    // 3. Extract with PowerShell
    console.log('Extracting...');
    execSync(
      `powershell -Command "Expand-Archive -Path '${kanjiZip}' -DestinationPath '${tmp}' -Force"`,
      { stdio: 'inherit' }
    );
    execSync(
      `powershell -Command "Expand-Archive -Path '${vocabZip}' -DestinationPath '${tmp}' -Force"`,
      { stdio: 'inherit' }
    );

    // 4. Find extracted JSON files
    const extracted = fs.readdirSync(tmp);
    const kanjiFile = extracted.find(f => /kanjidic2.*\.json$/i.test(f));
    const vocabFile  = extracted.find(f => /jmdict-en.*\.json$/i.test(f));

    if (!kanjiFile) {
      throw new Error(
        `kanjidic2 JSON not found after extraction.\n` +
        `Files in tmp: ${extracted.join(', ')}`
      );
    }
    if (!vocabFile) {
      throw new Error(
        `jmdict-en JSON not found after extraction.\n` +
        `Files in tmp: ${extracted.join(', ')}`
      );
    }

    // 5. Parse and process
    console.log('\nParsing KANJIDIC2...');
    const kanjiRaw       = JSON.parse(fs.readFileSync(path.join(tmp, kanjiFile), 'utf8'));
    const { out: kanji, levMap } = processKanjidic(kanjiRaw);

    const levels = ['N5', 'N4', 'N3', 'N2', 'N1'];
    for (const l of levels) console.log(`  ${l}: ${kanji[l].length} kanji`);
    console.log(`  (level map: ${levMap.size} kanji indexed for vocab inference)`);

    console.log('\nParsing JMdict and inferring JLPT levels from kanji...');
    const vocabRaw = JSON.parse(fs.readFileSync(path.join(tmp, vocabFile), 'utf8'));
    const vocab    = processJmdict(vocabRaw, levMap);

    for (const l of levels) console.log(`  ${l}: ${vocab[l].length} words`);

    // 6. Sanity checks before overwriting anything
    const totalKanji = levels.reduce((s, l) => s + kanji[l].length, 0);
    const totalVocab  = levels.reduce((s, l) => s + vocab[l].length, 0);

    if (totalKanji < 200) {
      throw new Error(
        `Only ${totalKanji} kanji found — the KANJIDIC2 format may have changed.\n` +
        `Check processKanjidic() and the jlptLevel field structure.`
      );
    }
    if (totalVocab < 200) {
      throw new Error(
        `Only ${totalVocab} vocabulary words found — kanji inference produced too few results.\n` +
        `The levMap has ${levMap.size} entries. Check processJmdict() and inferLevel().`
      );
    }

    // 7. Write
    fs.writeFileSync(path.join(dataDir, 'kanji.json'), JSON.stringify(kanji, null, 2), 'utf8');
    fs.writeFileSync(path.join(dataDir, 'vocab.json'), JSON.stringify(vocab, null, 2), 'utf8');

    console.log(`\nDone.`);
    console.log(`  data/kanji.json — ${totalKanji.toLocaleString()} kanji`);
    console.log(`  data/vocab.json — ${totalVocab.toLocaleString()} words`);
    console.log(`\nNote: vocabulary levels are inferred from kanji difficulty, not official JLPT lists.`);
    console.log(`  Words whose kanji fall outside the KANJIDIC2 JLPT set are classified as N1.`);
    console.log(`  Pure-kana common words are assigned N4.`);

  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
  }
}

main().catch(err => {
  console.error('\n\nError:', err.message);
  console.error('\nIf the download worked but tag detection failed, open fetch-data.js');
  console.error('and add this after line ~130 to inspect the word structure:');
  console.error('  console.log(JSON.stringify(data.words[0], null, 2));');
  process.exit(1);
});
