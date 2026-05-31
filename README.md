# JLPT Level Estimator

An adaptive Japanese **kanji & vocabulary** level estimator. Type the meaning and
reading of randomly drawn words; an adaptive sampling algorithm (validated against
10 simulated learner profiles) estimates your JLPT level (N5–N1), breaks it down per
level, and tracks your progress over time.

Built with **Next.js (App Router) + TypeScript + Supabase** (Postgres + Auth),
deployable on **Vercel**.

---

## What's in here

```
src/
  app/
    page.tsx                  Home / quiz launcher
    login/                    Magic-link sign-in
    auth/callback             Magic-link redirect handler
    auth/signout              Sign out
    quiz/                     The quiz (server loads dictionary → <Quiz/>)
    dashboard/                Progress analytics
    api/cron/update-data/     Weekly KANJIDIC2 refresh (Vercel Cron)
  components/                 Quiz, QuizLauncher, TopNav
  lib/
    quiz-engine.ts            The validated adaptive algorithm (TS port)
    romaji.ts                 Live romaji→hiragana IME + answer grading
    dictionary.ts             Loads dictionary from Supabase
    supabase/                 Browser/server/middleware clients
    actions/save-session.ts   Persists a completed quiz
supabase/schema.sql           Database schema + row-level security
scripts/seed-dictionary.mjs   Loads data/*.json into Supabase
data/                         kanji.json / vocab.json (source dictionary)
fetch-data.js, simulate.js    Dev tools (regenerate data / validate algorithm)
legacy/                       The original static prototype (kept for reference)
```

---

## One-time setup

### 1. Create a Supabase project (via Vercel)

1. Go to your **Vercel dashboard → Storage → Create Database → Supabase**
   (or the [Supabase integration](https://vercel.com/marketplace/supabase)).
2. Create the project. Vercel will auto-sync `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` to the linked Vercel project's env vars.

> Prefer plain Supabase? Create a project at supabase.com and grab the keys from
> **Project Settings → API**. Either way works.

### 2. Local env vars

```bash
cp .env.local.example .env.local
```

Fill in from Supabase **Project Settings → API**:

| Variable | Where to find it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `anon` / public key |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role` secret (seed + cron only) |
| `CRON_SECRET` | any long random string you make up |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` for dev |

### 3. Create the database tables

In Supabase: **SQL Editor → New query**, paste the contents of
[`supabase/schema.sql`](supabase/schema.sql), and run it.

### 4. Seed the dictionary

```bash
npm install
npm run seed
```

This loads `data/kanji.json` and `data/vocab.json` into the `kanji`/`vocab` tables.

### 5. Configure auth redirect URLs

In Supabase: **Authentication → URL Configuration**, add to **Redirect URLs**:

```
http://localhost:3000/auth/callback
https://YOUR-PRODUCTION-DOMAIN/auth/callback
```

### 6. Run it

```bash
npm run dev
```

Open http://localhost:3000, sign in with your email (magic link), and take a quiz.

---

## Deploying to Vercel

1. Push this repo to GitHub.
2. In Vercel: **Add New → Project**, import the repo.
3. Ensure the env vars from step 2 exist in **Project Settings → Environment Variables**
   (the Supabase ones are auto-added if you used the Marketplace integration; add
   `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, and set `NEXT_PUBLIC_SITE_URL` to your
   production URL).
4. Deploy. The weekly cron in `vercel.json` is registered automatically.

---

## Auto-updating the dictionary

- **Kanji (automatic):** `vercel.json` runs `/api/cron/update-data` every Monday,
  which pulls the latest **KANJIDIC2** release and upserts the `kanji` table.
- **Vocabulary (manual / occasional):** the full JMdict file is too large to process
  in a Hobby-tier serverless function, so refresh it locally when you want:

  ```bash
  npm run fetch-data   # regenerates data/kanji.json + data/vocab.json from source
  npm run seed         # pushes them to Supabase
  ```

---

## Validating the algorithm

The adaptive engine has a standalone simulator (no browser needed):

```bash
npm run simulate            # 300 runs × 30 questions across 10 learner profiles
npm run simulate 500 50     # custom: runs, questions
```

It reports per-profile hit rates, question distribution, and stability checks.
The shipped tuning passes 10/10 profiles at ~78% stability.

---

## Data sources & license

- **Kanji:** KANJIDIC2 — © Electronic Dictionary Research and Development Group (CC BY-SA 4.0)
- **Vocabulary:** JMdict — same group, same license
- Packaged as JSON by [jmdict-simplified](https://github.com/scriptin/jmdict-simplified)

Vocabulary JLPT levels are **inferred from kanji difficulty** (a word's level = its
hardest kanji's JLPT level), since the JLPT does not publish official word lists.
