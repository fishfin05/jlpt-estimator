// Per-item proficiency engine.
//
// From a user's raw attempt history this derives, for every kanji/vocab item:
//   - a recency-weighted accuracy (recent attempts count more than old ones),
//   - a "threat" score used to rank the Most Wanted (Kill List),
//   - a proficiency tag (Solid / Shaky / Weak / New).
// It also produces rank-movement for the Kill List by comparing the current
// ranking to the ranking as it stood *before* the most recent quiz — no extra
// storage needed, just a replay of history.

export interface AttemptLite {
  item_type: "kanji" | "vocab";
  item: string;
  level: string;
  correct: boolean;
  created_at: string;
}

export type ProfTag = "Solid" | "Shaky" | "Weak" | "New";

export interface ItemStat {
  key: string;
  item: string;
  type: "kanji" | "vocab";
  level: string;
  seen: number;
  missed: number;
  recentAccuracy: number; // 0..1, recency-weighted
  threat: number; // 0..1, higher = more wanted
  tag: ProfTag;
}

export interface KillListEntry extends ItemStat {
  rank: number; // 1 = most wanted
  movement:
    | { dir: "new" }
    | { dir: "same" }
    | { dir: "up"; delta: number } // climbed toward #1 (getting worse)
    | { dir: "down"; delta: number }; // slid down (improving)
}

// How fast older attempts fade. 0.6 → most recent attempt counts most, the one
// before it ~60% as much, etc.
const DECAY = 0.6;

interface RawStat {
  item: string;
  type: "kanji" | "vocab";
  level: string;
  seen: number;
  missed: number;
  weightedMissRate: number;
}

function groupByItem(attempts: AttemptLite[]): Map<string, AttemptLite[]> {
  const groups = new Map<string, AttemptLite[]>();
  for (const a of attempts) {
    const key = `${a.item_type}:${a.item}`;
    const list = groups.get(key) ?? [];
    list.push(a);
    groups.set(key, list);
  }
  return groups;
}

function rawStat(attempts: AttemptLite[]): RawStat {
  // Newest first for recency weighting.
  const ordered = [...attempts].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  let wSum = 0;
  let wMiss = 0;
  let missed = 0;
  ordered.forEach((a, idx) => {
    const w = Math.pow(DECAY, idx);
    wSum += w;
    if (!a.correct) {
      wMiss += w;
      missed++;
    }
  });
  const last = ordered[0];
  return {
    item: last.item,
    type: last.item_type,
    level: last.level,
    seen: ordered.length,
    missed,
    weightedMissRate: wSum ? wMiss / wSum : 0,
  };
}

function threatOf(s: RawStat): number {
  if (s.missed === 0) return 0;
  // Confidence grows with exposure so a single fluke miss doesn't top the board.
  const confidence = s.seen / (s.seen + 1);
  return s.weightedMissRate * confidence;
}

function tagOf(s: RawStat): ProfTag {
  if (s.seen < 2) return "New";
  const acc = 1 - s.weightedMissRate;
  if (acc >= 0.8) return "Solid";
  if (acc >= 0.5) return "Shaky";
  return "Weak";
}

function toItemStat(key: string, s: RawStat): ItemStat {
  return {
    key,
    item: s.item,
    type: s.type,
    level: s.level,
    seen: s.seen,
    missed: s.missed,
    recentAccuracy: 1 - s.weightedMissRate,
    threat: threatOf(s),
    tag: tagOf(s),
  };
}

// Ranking of all missed items by threat (1-based). Returns key → rank.
function rankMap(attempts: AttemptLite[]): Map<string, number> {
  const ranked = [...groupByItem(attempts).entries()]
    .map(([key, list]) => ({ key, s: rawStat(list) }))
    .filter((x) => x.s.missed > 0)
    .sort((a, b) => threatOf(b.s) - threatOf(a.s) || b.s.seen - a.s.seen);
  const map = new Map<string, number>();
  ranked.forEach((x, i) => map.set(x.key, i + 1));
  return map;
}

export interface ProficiencyResult {
  /** Every item the user has encountered, for the knowledge table. */
  all: ItemStat[];
  /** Top-N most wanted, with rank movement vs. before the latest quiz. */
  killList: KillListEntry[];
}

export function buildProficiency(
  attempts: AttemptLite[],
  cutoffISO: string | null,
  topN = 10,
): ProficiencyResult {
  const groups = groupByItem(attempts);

  const all: ItemStat[] = [...groups.entries()].map(([key, list]) =>
    toItemStat(key, rawStat(list)),
  );

  // Current ranking and the ranking as of before the most recent session.
  const nowRank = rankMap(attempts);
  const beforeRank = cutoffISO
    ? rankMap(attempts.filter((a) => new Date(a.created_at).getTime() < new Date(cutoffISO).getTime()))
    : new Map<string, number>();

  const statByKey = new Map(all.map((s) => [s.key, s]));

  const killList: KillListEntry[] = [...nowRank.entries()]
    .sort((a, b) => a[1] - b[1])
    .slice(0, topN)
    .map(([key, rank]) => {
      const stat = statByKey.get(key)!;
      const prev = beforeRank.get(key);
      let movement: KillListEntry["movement"];
      if (prev === undefined) {
        movement = { dir: "new" };
      } else {
        const delta = prev - rank; // >0 climbed toward #1 (worse)
        if (delta > 0) movement = { dir: "up", delta };
        else if (delta < 0) movement = { dir: "down", delta: -delta };
        else movement = { dir: "same" };
      }
      return { ...stat, rank, movement };
    });

  return { all, killList };
}
