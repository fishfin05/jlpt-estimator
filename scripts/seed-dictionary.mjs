#!/usr/bin/env node
/**
 * seed-dictionary.mjs
 *
 * Loads data/kanji.json and data/vocab.json into the Supabase `kanji` and
 * `vocab` tables using the service-role key (bypasses RLS).
 *
 * Run once after creating the database schema:
 *   npm run seed
 *
 * Requires in .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
const LEVELS = ["N5", "N4", "N3", "N2", "N1"];

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function upsertAll(table, rows, onConflict) {
  let inserted = 0;
  for (const batch of chunk(rows, 500)) {
    const { error } = await supabase.from(table).upsert(batch, { onConflict });
    if (error) throw new Error(`${table}: ${error.message}`);
    inserted += batch.length;
    process.stdout.write(`\r  ${table}: ${inserted}/${rows.length}  `);
  }
  process.stdout.write("\n");
}

async function main() {
  console.log("Reading data files...");
  const kanjiData = JSON.parse(readFileSync(join(root, "data", "kanji.json"), "utf8"));
  const vocabData = JSON.parse(readFileSync(join(root, "data", "vocab.json"), "utf8"));

  const kanjiRows = [];
  for (const level of LEVELS) {
    for (const k of kanjiData[level] || []) {
      kanjiRows.push({
        literal: k.kanji,
        level,
        meanings: k.meanings || [],
        onyomi: k.onyomi || [],
        kunyomi: k.kunyomi || [],
      });
    }
  }

  const vocabRows = [];
  const seen = new Set();
  for (const level of LEVELS) {
    for (const v of vocabData[level] || []) {
      const key = `${v.word}|${v.reading}`;
      if (seen.has(key)) continue; // table has unique(word, reading)
      seen.add(key);
      vocabRows.push({
        word: v.word,
        reading: v.reading,
        level,
        meanings: v.meanings || [],
      });
    }
  }

  console.log(`Seeding ${kanjiRows.length} kanji and ${vocabRows.length} vocab rows...`);
  await upsertAll("kanji", kanjiRows, "literal");
  await upsertAll("vocab", vocabRows, "word,reading");

  console.log("\nDone. Dictionary is seeded.");
}

main().catch((e) => {
  console.error("\nSeed failed:", e.message);
  process.exit(1);
});
