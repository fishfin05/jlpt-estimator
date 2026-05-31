import "server-only";
import { createClient } from "./supabase/server";
import { LEVELS, type Level, type Mode, type Dictionary, type KanjiItem, type VocabItem } from "./types";

// How many items to load per level. The adaptive quiz never needs more than
// this many at one level in a single session; a random window gives variety
// across sessions without shipping the whole dictionary to the browser.
const PER_LEVEL = 70;

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

async function fetchWindow(
  supabase: SupabaseClient,
  table: "kanji" | "vocab",
  level: Level,
  columns: string,
): Promise<Record<string, unknown>[]> {
  const { count } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("level", level);

  const total = count ?? 0;
  let from = 0;
  if (total > PER_LEVEL) from = Math.floor(Math.random() * (total - PER_LEVEL));

  const { data, error } = await supabase
    .from(table)
    .select(columns)
    .eq("level", level)
    .range(from, from + PER_LEVEL - 1);

  if (error) throw new Error(`Failed loading ${table}/${level}: ${error.message}`);
  return (data as unknown as Record<string, unknown>[]) ?? [];
}

export async function loadDictionary(mode: Mode): Promise<Dictionary> {
  const supabase = await createClient();

  const dict: Dictionary = {
    kanji: { N5: [], N4: [], N3: [], N2: [], N1: [] },
    vocab: { N5: [], N4: [], N3: [], N2: [], N1: [] },
  };

  const needKanji = mode === "kanji" || mode === "both";
  const needVocab = mode === "vocab" || mode === "both";

  await Promise.all(
    LEVELS.flatMap((level) => {
      const jobs: Promise<void>[] = [];
      if (needKanji) {
        jobs.push(
          fetchWindow(supabase, "kanji", level, "literal, meanings, onyomi, kunyomi").then((rows) => {
            dict.kanji[level] = rows.map(
              (r): KanjiItem => ({
                kanji: r.literal as string,
                meanings: (r.meanings as string[]) ?? [],
                onyomi: (r.onyomi as string[]) ?? [],
                kunyomi: (r.kunyomi as string[]) ?? [],
              }),
            );
          }),
        );
      }
      if (needVocab) {
        jobs.push(
          fetchWindow(supabase, "vocab", level, "word, reading, meanings").then((rows) => {
            dict.vocab[level] = rows.map(
              (r): VocabItem => ({
                word: r.word as string,
                reading: r.reading as string,
                meanings: (r.meanings as string[]) ?? [],
              }),
            );
          }),
        );
      }
      return jobs;
    }),
  );

  return dict;
}

/** Quick check used by the quiz page to detect an unseeded database. */
export async function dictionaryIsSeeded(): Promise<boolean> {
  const supabase = await createClient();
  const { count } = await supabase.from("kanji").select("*", { count: "exact", head: true });
  return (count ?? 0) > 0;
}
