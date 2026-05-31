#!/usr/bin/env node
// Inspects the jmdict-simplified word structure so we can fix tag detection.
// Run: node debug-structure.js
'use strict';
const https  = require('https');
const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const { execSync } = require('child_process');

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, { headers: { 'User-Agent': 'jlpt-quiz/1.0' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location)
        return resolve(httpGet(res.headers.location));
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
    mod.get(url, { headers: { 'User-Agent': 'jlpt-quiz/1.0' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close(); try { fs.unlinkSync(dest); } catch(_) {}
        return resolve(httpDownload(res.headers.location, dest));
      }
      const total = parseInt(res.headers['content-length'] || '0', 10);
      let received = 0;
      res.on('data', chunk => {
        received += chunk.length;
        process.stdout.write(`\r  ${(received/1e6).toFixed(1)} / ${(total/1e6).toFixed(1)} MB  `);
      });
      res.pipe(file);
      file.on('finish', () => { process.stdout.write('\n'); file.close(resolve); });
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function main() {
  const tmp = path.join(__dirname, '.debug-tmp');
  fs.mkdirSync(tmp, { recursive: true });

  try {
    process.stdout.write('Fetching release info... ');
    const release = JSON.parse(await httpGet(
      'https://api.github.com/repos/scriptin/jmdict-simplified/releases/latest'
    ));
    console.log(release.tag_name);

    const vocabAsset = (release.assets || []).find(a => /jmdict-eng?.*\.zip$/i.test(a.name));
    if (!vocabAsset) throw new Error('No jmdict asset found. Assets: ' + release.assets.map(a=>a.name).join(', '));

    console.log(`Downloading ${vocabAsset.name}...`);
    const zip = path.join(tmp, 'vocab.zip');
    await httpDownload(vocabAsset.browser_download_url, zip);

    console.log('Extracting...');
    execSync(`powershell -Command "Expand-Archive -Path '${zip}' -DestinationPath '${tmp}' -Force"`, { stdio: 'inherit' });

    const jsonFile = fs.readdirSync(tmp).find(f => /jmdict.*\.json$/i.test(f));
    if (!jsonFile) throw new Error('JSON not found after extraction: ' + fs.readdirSync(tmp).join(', '));

    console.log(`\nParsing ${jsonFile}...`);
    const data = JSON.parse(fs.readFileSync(path.join(tmp, jsonFile), 'utf8'));

    console.log('\n=== TOP-LEVEL KEYS ===');
    console.log(Object.keys(data));

    if (data.tags) {
      console.log('\n=== TAGS SAMPLE (first 30) ===');
      const entries = Object.entries(data.tags).slice(0, 30);
      entries.forEach(([k, v]) => console.log(`  "${k}": "${v}"`));
      const jlptTags = Object.entries(data.tags).filter(([k]) => /jlpt/i.test(k) || /jlpt/i.test(String(v)));
      if (jlptTags.length) {
        console.log('\n=== JLPT-RELATED TAGS ===');
        jlptTags.forEach(([k, v]) => console.log(`  "${k}": "${v}"`));
      } else {
        console.log('\n(no jlpt-related tags found in tags dict)');
      }
    }

    if (data.words && data.words.length) {
      console.log('\n=== FIRST WORD ===');
      console.log(JSON.stringify(data.words[0], null, 2));

      console.log('\n=== FIRST 5 WORDS — tags field only ===');
      data.words.slice(0, 5).forEach((w, i) => {
        console.log(`word[${i}] tags:`, JSON.stringify(w.tags));
      });

      // Search for any word that might have JLPT info anywhere
      const jlptWord = data.words.find(w => /jlpt/i.test(JSON.stringify(w)));
      if (jlptWord) {
        console.log('\n=== FIRST WORD CONTAINING "jlpt" ===');
        console.log(JSON.stringify(jlptWord, null, 2));
      } else {
        console.log('\n(no word found containing the string "jlpt")');
        // Look in senses/misc
        const miscWord = data.words.find(w => w.sense && w.sense.some(s => s.misc && s.misc.length));
        if (miscWord) {
          console.log('\n=== FIRST WORD WITH sense.misc ===');
          console.log(JSON.stringify(miscWord, null, 2));
        }
      }
    }

  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch(_) {}
  }
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
