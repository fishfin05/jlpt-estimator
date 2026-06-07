import { NextResponse, type NextRequest } from 'next/server'
import { unzipSync, strFromU8 } from 'fflate'
import { getSql } from '@/lib/auth-server'

export const maxDuration = 60

const GRADE_LEVEL: Record<number, string> = { 1: 'N5', 2: 'N4', 3: 'N3', 4: 'N3', 5: 'N2', 6: 'N2', 8: 'N1' }
const OLD_JLPT_LEVEL: Record<number, string> = { 4: 'N5', 3: 'N4', 2: 'N3', 1: 'N2' }

function katakanaToHiragana(str: string): string {
  return str.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
}

interface KdChar {
  literal: string
  misc?: { jlptLevel?: number; grade?: number }
  readingMeaning?: {
    groups?: {
      meanings?: { lang: string; value: string }[]
      readings?: { type: string; value: string }[]
    }[]
  }
}

function processKanjidic(data: { characters: KdChar[] }) {
  const rows: { literal: string; level: string; meanings: string[]; onyomi: string[]; kunyomi: string[] }[] = []
  for (const c of data.characters) {
    const level = GRADE_LEVEL[c.misc?.grade ?? -1] ?? OLD_JLPT_LEVEL[c.misc?.jlptLevel ?? -1]
    if (!level) continue
    const groups = c.readingMeaning?.groups ?? []
    const meanings = groups
      .flatMap((g) => (g.meanings ?? []).filter((m) => m.lang === 'en').map((m) => m.value))
      .slice(0, 5)
    if (!meanings.length) continue
    const onyomi = groups.flatMap((g) =>
      (g.readings ?? []).filter((r) => r.type === 'ja_on').map((r) => katakanaToHiragana(r.value)),
    )
    const kunyomi = groups.flatMap((g) =>
      (g.readings ?? [])
        .filter((r) => r.type === 'ja_kun')
        .map((r) => r.value.replace(/\..*/, '').replace(/[-～]$/, '')),
    )
    rows.push({ literal: c.literal, level, meanings, onyomi, kunyomi })
  }
  return rows
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const releaseRes = await fetch(
      'https://api.github.com/repos/scriptin/jmdict-simplified/releases/latest',
      { headers: { 'User-Agent': 'jlpt-quiz' }, next: { revalidate: 0 } },
    )
    const release = await releaseRes.json()
    const asset = (release.assets ?? []).find((a: { name: string }) =>
      /kanjidic2-all.*\.zip$/i.test(a.name),
    )
    if (!asset) {
      return NextResponse.json({ ok: false, error: 'kanjidic2 asset not found' }, { status: 502 })
    }

    const zipRes = await fetch(asset.browser_download_url, { headers: { 'User-Agent': 'jlpt-quiz' } })
    const zipBuf = new Uint8Array(await zipRes.arrayBuffer())
    const files = unzipSync(zipBuf)
    const jsonName = Object.keys(files).find((n) => /kanjidic2.*\.json$/i.test(n))
    if (!jsonName) {
      return NextResponse.json({ ok: false, error: 'json not found in zip' }, { status: 502 })
    }

    const data = JSON.parse(strFromU8(files[jsonName]))
    const rows = processKanjidic(data)

    const sql = getSql()
    let upserted = 0
    for (let i = 0; i < rows.length; i += 200) {
      const batch = rows.slice(i, i + 200)
      await sql.transaction(
        batch.map((row) =>
          sql`
            INSERT INTO kanji (literal, level, meanings, onyomi, kunyomi)
            VALUES (${row.literal}, ${row.level}, ${JSON.stringify(row.meanings)}, ${JSON.stringify(row.onyomi)}, ${JSON.stringify(row.kunyomi)})
            ON CONFLICT (literal) DO UPDATE SET
              level = EXCLUDED.level,
              meanings = EXCLUDED.meanings,
              onyomi = EXCLUDED.onyomi,
              kunyomi = EXCLUDED.kunyomi
          `,
        ),
      )
      upserted += batch.length
    }

    return NextResponse.json({
      ok: true,
      release: release.tag_name,
      kanjiUpserted: upserted,
      updatedAt: new Date().toISOString(),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
