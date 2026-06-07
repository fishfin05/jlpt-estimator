#!/usr/bin/env node
/**
 * seed-dictionary.mjs
 *
 * Loads data/kanji.json and data/vocab.json into the Neon `kanji` and
 * `vocab` tables.
 *
 * Run once after creating the database tables:
 *   npm run seed
 *
 * Requires in .env.local:
 *   DATABASE_URL
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { config } from 'dotenv'
import { neon } from '@neondatabase/serverless'

config({ path: '.env.local' })

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL in .env.local')
  process.exit(1)
}

const sql = neon(DATABASE_URL)
const LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1']

async function main() {
  console.log('Reading data files...')
  const kanjiData = JSON.parse(readFileSync(join(root, 'data', 'kanji.json'), 'utf8'))
  const vocabData = JSON.parse(readFileSync(join(root, 'data', 'vocab.json'), 'utf8'))

  const kanjiRows = []
  for (const level of LEVELS) {
    for (const k of kanjiData[level] || []) {
      kanjiRows.push({ literal: k.kanji, level, meanings: k.meanings || [], onyomi: k.onyomi || [], kunyomi: k.kunyomi || [] })
    }
  }

  const vocabRows = []
  const seen = new Set()
  for (const level of LEVELS) {
    for (const v of vocabData[level] || []) {
      const key = `${v.word}|${v.reading}`
      if (seen.has(key)) continue
      seen.add(key)
      vocabRows.push({ word: v.word, reading: v.reading, level, meanings: v.meanings || [] })
    }
  }

  console.log(`Seeding ${kanjiRows.length} kanji...`)
  for (let i = 0; i < kanjiRows.length; i += 200) {
    const batch = kanjiRows.slice(i, i + 200)
    await sql.transaction(batch.map(r =>
      sql`INSERT INTO kanji (literal, level, meanings, onyomi, kunyomi)
          VALUES (${r.literal}, ${r.level}, ${JSON.stringify(r.meanings)}, ${JSON.stringify(r.onyomi)}, ${JSON.stringify(r.kunyomi)})
          ON CONFLICT (literal) DO UPDATE SET level=EXCLUDED.level, meanings=EXCLUDED.meanings, onyomi=EXCLUDED.onyomi, kunyomi=EXCLUDED.kunyomi`
    ))
    process.stdout.write(`\r  kanji: ${Math.min(i + 200, kanjiRows.length)}/${kanjiRows.length}  `)
  }
  process.stdout.write('\n')

  console.log(`Seeding ${vocabRows.length} vocab...`)
  for (let i = 0; i < vocabRows.length; i += 200) {
    const batch = vocabRows.slice(i, i + 200)
    await sql.transaction(batch.map(r =>
      sql`INSERT INTO vocab (word, reading, level, meanings)
          VALUES (${r.word}, ${r.reading}, ${r.level}, ${JSON.stringify(r.meanings)})
          ON CONFLICT (word, reading) DO UPDATE SET level=EXCLUDED.level, meanings=EXCLUDED.meanings`
    ))
    process.stdout.write(`\r  vocab: ${Math.min(i + 200, vocabRows.length)}/${vocabRows.length}  `)
  }
  process.stdout.write('\n')

  console.log('\nDone. Dictionary is seeded.')
}

main().catch(e => { console.error('\nSeed failed:', e.message); process.exit(1) })
