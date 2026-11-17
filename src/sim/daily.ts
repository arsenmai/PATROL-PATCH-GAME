import { DELTA, DIRS, add, eq } from './grid';
import { LAB_LEVEL } from './level';
import { findPath } from './pathfinding';
import type { ArtifactDef, Dir, Level, Vec } from './types';
import { DAILY_HEISTS } from './daily-data';

/**
 * "Heist of the day": the same museum, re-dressed from a seed.
 *
 * A variant decides which artifact is locked in the sealed gallery, where the other two stand,
 * and which way (and from where) the hall guard starts its round. Nothing is random at play time:
 * a variant is plain data, so the simulation, the replay and the solver work on it unchanged.
 */
export interface Variant {
  /** Index into ARTIFACT_KINDS of the artifact in the sealed case. */
  sealed: number;
  /** Indices into FLOOR_SLOTS for the two remaining artifacts, in ARTIFACT_KINDS order. */
  slots: [number, number];
  /** Hall guard walks its loop the other way round. */
  reverse: boolean;
  /** Hall guard starts this many waypoints further along its loop. */
  offset: number;
}

/** What the exhaustive solver proved about a level. Shown to the player as the score to beat. */
export interface Par {
  /** Most loot that can be carried out with factory guard AI. */
  withoutPatch: number;
  /** Most loot that can be carried out with the best single patch. */
  withBestPatch: number;
  /** Fewest turns in which `withBestPatch` can be achieved. */
  bestTurns: number;
}

export interface DailyHeist {
  seed: number;
  variant: Variant;
  turnLimit: number;
  par: Par;
}

export const ARTIFACT_KINDS: readonly Omit<ArtifactDef, 'pos' | 'sealed'>[] = LAB_LEVEL.artifacts.map(
  ({ id, name, value, curse }) => ({ id, name, value, curse }),
);

/** Floor tiles an artifact may stand on. None of them lies on the hall guard's loop. */
export const FLOOR_SLOTS: readonly Vec[] = [
  { x: 1, y: 6 },
  { x: 10, y: 5 },
  { x: 3, y: 3 },
  { x: 10, y: 10 },
  { x: 1, y: 1 },
  { x: 10, y: 7 },
];

/** Small deterministic PRNG (mulberry32). Used only to turn a seed into a Variant. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function variantFromSeed(seed: number): Variant {
  const rnd = mulberry32(seed);
  const pick = (n: number) => Math.floor(rnd() * n);
  const sealed = pick(ARTIFACT_KINDS.length);
  const first = pick(FLOOR_SLOTS.length);
  let second = pick(FLOOR_SLOTS.length - 1);
  if (second >= first) second++;
  return { sealed, slots: [first, second], reverse: rnd() < 0.5, offset: pick(8) };
}

/** Applies a variant to the base museum. Pure: returns a new Level and never touches the base. */
export function buildVariant(variant: Variant, turnLimit: number, base: Level = LAB_LEVEL): Level {
  const loose = ARTIFACT_KINDS.filter((_, i) => i !== variant.sealed);
  const artifacts: ArtifactDef[] = [
    ...loose.map((kind, i) => ({ ...kind, pos: { ...FLOOR_SLOTS[variant.slots[i]] } })),
    { ...ARTIFACT_KINDS[variant.sealed], pos: { ...base.terminal }, sealed: true },
  ];

  const guards = base.guards.map((def) => {
    if (def.route.length < 2) return def;
    const loop = variant.reverse ? [...def.route].reverse() : [...def.route];
    const n = loop.length;
    const route = loop.map((_, i) => loop[(i + variant.offset) % n]);
    const start = route[n - 1];
    const firstStep = findPath(base, start, route[0])?.[0] ?? start;
    const facing: Dir = DIRS.find((d) => eq(add(start, DELTA[d]), firstStep)) ?? def.facing;
    return { ...def, route, start: { x: start.x, y: start.y }, facing };
  });

  return { ...base, artifacts, guards, turnLimit };
}

export const buildDaily = (heist: DailyHeist): Level => ({
  ...buildVariant(heist.variant, heist.turnLimit),
  name: `HEIST OF THE DAY #${heist.seed}`,
});

/** Which pre-validated heist is on show on a given date (UTC). The rotation repeats when it runs out. */
export function dailyFor(date: Date): DailyHeist {
  const day = Math.floor(date.getTime() / 86_400_000);
  return DAILY_HEISTS[((day % DAILY_HEISTS.length) + DAILY_HEISTS.length) % DAILY_HEISTS.length];
}
