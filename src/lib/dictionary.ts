import 'server-only'
import { getSql } from './auth-server'
import { LEVELS, type Level, type Mode, type Dictionary, type KanjiItem, type VocabItem } from './types'

const PER_LEVEL = 70

async function fetchKanjiWindow(level: Level): Promise<KanjiItem[]> {
  const sql = getSql()
  const [{ count }] = (await sql`SELECT COUNT(*) FROM kanji WHERE level = ${level}`) as { count: string }[]
  const total = parseInt(count ?? '0')
  const from = total > PER_LEVEL ? Math.floor(Math.random() * (total - PER_LEVEL)) : 0
  const rows = (await sql`
    SELECT literal, meanings, onyomi, kunyomi FROM kanji WHERE level = ${level}
    LIMIT ${PER_LEVEL} OFFSET ${from}
  `) as { literal: string; meanings: string[]; onyomi: string[]; kunyomi: string[] }[]
  return rows.map((r) => ({
    kanji: r.literal,
    meanings: r.meanings ?? [],
    onyomi: r.onyomi ?? [],
    kunyomi: r.kunyomi ?? [],
  }))
}

async function fetchVocabWindow(level: Level): Promise<VocabItem[]> {
  const sql = getSql()
  const [{ count }] = (await sql`SELECT COUNT(*) FROM vocab WHERE level = ${level}`) as { count: string }[]
  const total = parseInt(count ?? '0')
  const from = total > PER_LEVEL ? Math.floor(Math.random() * (total - PER_LEVEL)) : 0
  const rows = (await sql`
    SELECT word, reading, meanings FROM vocab WHERE level = ${level}
    LIMIT ${PER_LEVEL} OFFSET ${from}
  `) as { word: string; reading: string; meanings: string[] }[]
  return rows.map((r) => ({
    word: r.word,
    reading: r.reading,
    meanings: r.meanings ?? [],
  }))
}

export async function loadDictionary(mode: Mode): Promise<Dictionary> {
  const dict: Dictionary = {
    kanji: { N5: [], N4: [], N3: [], N2: [], N1: [] },
    vocab: { N5: [], N4: [], N3: [], N2: [], N1: [] },
  }

  const needKanji = mode === 'kanji' || mode === 'both'
  const needVocab = mode === 'vocab' || mode === 'both'

  await Promise.all(
    LEVELS.flatMap((level) => {
      const jobs: Promise<void>[] = []
      if (needKanji) {
        jobs.push(fetchKanjiWindow(level).then((rows) => { dict.kanji[level] = rows }))
      }
      if (needVocab) {
        jobs.push(fetchVocabWindow(level).then((rows) => { dict.vocab[level] = rows }))
      }
      return jobs
    }),
  )

  return dict
}

export async function dictionaryIsSeeded(): Promise<boolean> {
  const sql = getSql()
  const [{ count }] = (await sql`SELECT COUNT(*) FROM kanji`) as { count: string }[]
  return parseInt(count ?? '0') > 0
}
