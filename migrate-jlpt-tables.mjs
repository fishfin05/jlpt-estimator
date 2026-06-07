// One-time migration: create Neon tables and copy data from Supabase
// Run after creating your account in the new app.
//
// Needs in .env.local:
//   DATABASE_URL          (your Neon connection string)
//   SUPABASE_URL          (from Supabase project → Settings → API)
//   SUPABASE_SERVICE_KEY  (service_role key, not anon)
//   USER_EMAIL            (your email address)
//
// Run with:
//   node --env-file=.env.local migrate-jlpt-tables.mjs

import { neon } from '@neondatabase/serverless'

const DATABASE_URL     = process.env.DATABASE_URL
const SUPABASE_URL     = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '')
const SUPABASE_SVC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
const USER_EMAIL       = process.env.USER_EMAIL || 'fgw3@humboldt.edu'

if (!DATABASE_URL || !SUPABASE_URL || !SUPABASE_SVC_KEY) {
  console.error('Missing DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const sql = neon(DATABASE_URL)

async function supaFetch(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SUPABASE_SVC_KEY,
      Authorization: `Bearer ${SUPABASE_SVC_KEY}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  })
  if (!res.ok) throw new Error(`Supabase ${path}: ${res.status} ${await res.text()}`)
  return res.json()
}

async function main() {
  // 1. Create tables
  console.log('Creating tables...')
  await sql`
    CREATE TABLE IF NOT EXISTS app_users (
      id            text PRIMARY KEY DEFAULT gen_random_uuid()::text,
      email         text NOT NULL UNIQUE,
      password_hash text NOT NULL,
      totp_secret         text,
      totp_pending_secret text,
      totp_enabled        boolean NOT NULL DEFAULT false,
      created_at    timestamptz NOT NULL DEFAULT now(),
      updated_at    timestamptz NOT NULL DEFAULT now()
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS app_sessions (
      id         text PRIMARY KEY DEFAULT gen_random_uuid()::text,
      user_id    text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      token      text NOT NULL UNIQUE,
      status     text NOT NULL DEFAULT 'active',
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS kanji (
      id       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      literal  text NOT NULL UNIQUE,
      level    text NOT NULL,
      meanings jsonb NOT NULL DEFAULT '[]',
      onyomi   jsonb NOT NULL DEFAULT '[]',
      kunyomi  jsonb NOT NULL DEFAULT '[]'
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS kanji_level_idx ON kanji (level)`
  await sql`
    CREATE TABLE IF NOT EXISTS vocab (
      id       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      word     text NOT NULL,
      reading  text NOT NULL,
      level    text NOT NULL,
      meanings jsonb NOT NULL DEFAULT '[]',
      UNIQUE (word, reading)
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS vocab_level_idx ON vocab (level)`
  await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id         text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      created_at      timestamptz NOT NULL DEFAULT now(),
      mode            text NOT NULL,
      total_questions int NOT NULL,
      result          text NOT NULL,
      levels          jsonb NOT NULL DEFAULT '{}'
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id, created_at DESC)`
  await sql`
    CREATE TABLE IF NOT EXISTS attempts (
      id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      session_id      uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      user_id         text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      created_at      timestamptz NOT NULL DEFAULT now(),
      item_type       text NOT NULL,
      item            text NOT NULL,
      level           text NOT NULL,
      meaning_given   text,
      reading_given   text,
      meaning_correct boolean NOT NULL DEFAULT false,
      reading_correct boolean NOT NULL DEFAULT false,
      correct         boolean NOT NULL DEFAULT false,
      skipped         boolean NOT NULL DEFAULT false,
      challenged      boolean NOT NULL DEFAULT false
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS attempts_user_item_idx ON attempts (user_id, item, item_type)`
  await sql`CREATE INDEX IF NOT EXISTS attempts_user_created_idx ON attempts (user_id, created_at DESC)`
  console.log('Tables ready.')

  // 2. Find Supabase user
  const authRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=1000`, {
    headers: { apikey: SUPABASE_SVC_KEY, Authorization: `Bearer ${SUPABASE_SVC_KEY}` },
  })
  if (!authRes.ok) throw new Error(`Auth lookup failed: ${authRes.status}`)
  const { users } = await authRes.json()
  const supaUser = users?.find(u => u.email === USER_EMAIL)
  if (!supaUser) throw new Error(`No Supabase user found with email ${USER_EMAIL}`)
  console.log(`Found Supabase user: ${supaUser.id}`)

  // 3. Find/check Neon user (must exist — sign up in the app first)
  const neonUsers = await sql`SELECT id FROM app_users WHERE email = ${USER_EMAIL}`
  if (!neonUsers.length) {
    console.error(`No user in Neon for ${USER_EMAIL}. Sign up in the app first, then re-run.`)
    process.exit(1)
  }
  const newUserId = neonUsers[0].id
  console.log(`Neon user ID: ${newUserId}`)

  // 4. Migrate kanji (reference data)
  console.log('Migrating kanji...')
  let kanjiPage = 0
  let totalKanji = 0
  while (true) {
    const rows = await supaFetch(`kanji?select=literal,level,meanings,onyomi,kunyomi&limit=500&offset=${kanjiPage * 500}`)
    if (!rows.length) break
    for (const r of rows) {
      await sql`
        INSERT INTO kanji (literal, level, meanings, onyomi, kunyomi)
        VALUES (${r.literal}, ${r.level}, ${JSON.stringify(r.meanings)}, ${JSON.stringify(r.onyomi)}, ${JSON.stringify(r.kunyomi)})
        ON CONFLICT (literal) DO NOTHING
      `
    }
    totalKanji += rows.length
    kanjiPage++
    if (rows.length < 500) break
  }
  console.log(`Migrated ${totalKanji} kanji entries.`)

  // 5. Migrate vocab (reference data)
  console.log('Migrating vocab...')
  let vocabPage = 0
  let totalVocab = 0
  while (true) {
    const rows = await supaFetch(`vocab?select=word,reading,level,meanings&limit=500&offset=${vocabPage * 500}`)
    if (!rows.length) break
    for (const r of rows) {
      await sql`
        INSERT INTO vocab (word, reading, level, meanings)
        VALUES (${r.word}, ${r.reading}, ${r.level}, ${JSON.stringify(r.meanings)})
        ON CONFLICT (word, reading) DO NOTHING
      `
    }
    totalVocab += rows.length
    vocabPage++
    if (rows.length < 500) break
  }
  console.log(`Migrated ${totalVocab} vocab entries.`)

  // 6. Migrate user sessions
  console.log('Migrating quiz sessions...')
  const supaSessions = await supaFetch(
    `sessions?user_id=eq.${supaUser.id}&select=id,created_at,mode,total_questions,result,levels&order=created_at.asc`
  )
  console.log(`Found ${supaSessions.length} sessions.`)
  const sessionIdMap = {}
  for (const s of supaSessions) {
    const [inserted] = await sql`
      INSERT INTO sessions (id, user_id, created_at, mode, total_questions, result, levels)
      VALUES (${s.id}, ${newUserId}, ${s.created_at}, ${s.mode}, ${s.total_questions}, ${s.result}, ${JSON.stringify(s.levels ?? {})})
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `
    if (inserted) sessionIdMap[s.id] = s.id
  }
  console.log(`Migrated ${Object.keys(sessionIdMap).length} sessions.`)

  // 7. Migrate attempts
  console.log('Migrating attempts...')
  const supaAttempts = await supaFetch(
    `attempts?user_id=eq.${supaUser.id}&select=*&order=created_at.asc&limit=50000`
  )
  console.log(`Found ${supaAttempts.length} attempts.`)
  let insertedAttempts = 0
  for (const a of supaAttempts) {
    if (!sessionIdMap[a.session_id]) continue
    await sql`
      INSERT INTO attempts (session_id, user_id, created_at, item_type, item, level, meaning_given, reading_given, meaning_correct, reading_correct, correct, skipped, challenged)
      VALUES (${a.session_id}, ${newUserId}, ${a.created_at}, ${a.item_type}, ${a.item}, ${a.level}, ${a.meaning_given ?? null}, ${a.reading_given ?? null}, ${a.meaning_correct}, ${a.reading_correct}, ${a.correct}, ${a.skipped}, ${a.challenged})
      ON CONFLICT DO NOTHING
    `
    insertedAttempts++
  }
  console.log(`Migrated ${insertedAttempts} attempts.`)

  console.log('Done! All data migrated to Neon.')
}

main().catch(err => { console.error(err.message); process.exit(1) })
