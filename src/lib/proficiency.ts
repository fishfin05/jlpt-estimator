// Per-item proficiency engine.
//
// From a user's raw attempt history this derives, for every kanji/vocab item:
//   - a recency-weighted accuracy (recent attempts count more than old ones),
//   - a "threat" score used to pick the Most Wanted (Kill List),
//   - a proficiency tag (Solid / Shaky / Weak / New),
//   - a per-item trend (are you getting this item better or worse lately?).

export interface AttemptLite {
  item_type: "kanji" | "vocab";
  item: string;
  level: string;
  correct: boolean;
  created_at: string;
}

export type ProfTag = "Solid" | "Shaky" | "Weak" | "New";
export type Trend = "up" | "down" | "same" | "new"; // up = worse, down = better

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
  trend: Trend;
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
  weightedMissRate: number; // recency-weighted
  flatMissRate: number; // simple missed/seen
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
    flatMissRate: ordered.length ? missed / ordered.length : 0,
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

// Trend: is recent performance better or worse than this item's overall average?
// Recency-weighted miss rate vs. the flat miss rate — no cross-item ranking, so
// no tie-shuffling noise.
function trendOf(s: RawStat): Trend {
  if (s.seen < 2) return "new";
  const eps = 0.05;
  if (s.weightedMissRate < s.flatMissRate - eps) return "down"; // recent better
  if (s.weightedMissRate > s.flatMissRate + eps) return "up"; // recent worse
  return "same";
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

export interface ProficiencyResult {
  /** Every item the user has encountered, for the knowledge table. */
  all: ItemStat[];
  /** The worst N items (selected by threat), each with a per-item trend. */
  killList: KillListEntry[];
}

export function buildProficiency(attempts: AttemptLite[], topN = 10): ProficiencyResult {
  const groups = groupByItem(attempts);

  const raw = [...groups.entries()].map(([key, list]) => ({ key, s: rawStat(list) }));

  const all: ItemStat[] = raw.map(({ key, s }) => toItemStat(key, s));

  const killList: KillListEntry[] = raw
    .filter(({ s }) => s.missed > 0)
    .sort((a, b) => threatOf(b.s) - threatOf(a.s) || b.s.seen - a.s.seen)
    .slice(0, topN)
    .map(({ key, s }) => ({ ...toItemStat(key, s), trend: trendOf(s) }));

  return { all, killList };
}
