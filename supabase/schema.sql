-- ============================================================
-- JLPT Level Estimator — database schema
-- Run this once in the Supabase SQL Editor (Dashboard → SQL → New query).
-- Safe to re-run: uses IF NOT EXISTS / OR REPLACE throughout.
-- ============================================================

-- ─── Dictionary tables (read-only reference data) ───────────
-- Populated by the seed script / cron route using the service role.

create table if not exists public.kanji (
  id        bigint generated always as identity primary key,
  literal   text not null unique,
  level     text not null check (level in ('N5','N4','N3','N2','N1')),
  meanings  jsonb not null default '[]'::jsonb,
  onyomi    jsonb not null default '[]'::jsonb,
  kunyomi   jsonb not null default '[]'::jsonb
);
create index if not exists kanji_level_idx on public.kanji (level);

create table if not exists public.vocab (
  id        bigint generated always as identity primary key,
  word      text not null,
  reading   text not null,
  level     text not null check (level in ('N5','N4','N3','N2','N1')),
  meanings  jsonb not null default '[]'::jsonb,
  unique (word, reading)
);
create index if not exists vocab_level_idx on public.vocab (level);

-- ─── User data tables ───────────────────────────────────────

create table if not exists public.sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  created_at       timestamptz not null default now(),
  mode             text not null check (mode in ('kanji','vocab','both')),
  total_questions  int  not null,
  result           text not null,            -- e.g. 'N3' or 'Below N5'
  levels           jsonb not null default '{}'::jsonb  -- per-level snapshot
);
create index if not exists sessions_user_idx on public.sessions (user_id, created_at desc);

create table if not exists public.attempts (
  id              bigint generated always as identity primary key,
  session_id      uuid not null references public.sessions(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  created_at      timestamptz not null default now(),
  item_type       text not null check (item_type in ('kanji','vocab')),
  item            text not null,             -- the kanji char or vocab word
  level           text not null,
  meaning_given   text,
  reading_given   text,
  meaning_correct boolean not null default false,
  reading_correct boolean not null default false,
  correct         boolean not null default false,
  skipped         boolean not null default false,
  challenged      boolean not null default false
);
create index if not exists attempts_user_item_idx on public.attempts (user_id, item, item_type);
create index if not exists attempts_user_created_idx on public.attempts (user_id, created_at desc);

-- ─── Row Level Security ─────────────────────────────────────

alter table public.kanji    enable row level security;
alter table public.vocab    enable row level security;
alter table public.sessions enable row level security;
alter table public.attempts enable row level security;

-- Dictionary: anyone (even anonymous) may read; writes only via service role.
drop policy if exists "kanji readable by all" on public.kanji;
create policy "kanji readable by all" on public.kanji
  for select using (true);

drop policy if exists "vocab readable by all" on public.vocab;
create policy "vocab readable by all" on public.vocab
  for select using (true);

-- Sessions: each user sees and writes only their own rows.
drop policy if exists "own sessions select" on public.sessions;
create policy "own sessions select" on public.sessions
  for select using (auth.uid() = user_id);

drop policy if exists "own sessions insert" on public.sessions;
create policy "own sessions insert" on public.sessions
  for insert with check (auth.uid() = user_id);

drop policy if exists "own sessions delete" on public.sessions;
create policy "own sessions delete" on public.sessions
  for delete using (auth.uid() = user_id);

-- Attempts: same ownership rules.
drop policy if exists "own attempts select" on public.attempts;
create policy "own attempts select" on public.attempts
  for select using (auth.uid() = user_id);

drop policy if exists "own attempts insert" on public.attempts;
create policy "own attempts insert" on public.attempts
  for insert with check (auth.uid() = user_id);

drop policy if exists "own attempts delete" on public.attempts;
create policy "own attempts delete" on public.attempts
  for delete using (auth.uid() = user_id);
