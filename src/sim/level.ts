import type { ArtifactDef, Decor, GuardDef, Level, Vec } from './types';

/**
 * Parses an ASCII map.
 * '#' wall, '.' floor, 'P' entrance / extraction point, 'T' sealed display case (solid), 'D' gallery door (floor).
 */
export function parseLevel(
  name: string,
  rows: string[],
  guards: GuardDef[],
  loot: Omit<ArtifactDef, 'sealed'>[] = [],
  decor: Decor[] = [],
  sealedLoot: Omit<ArtifactDef, 'pos' | 'sealed'> | null = null,
  turnLimit = 999,
): Level {
  const width = rows[0].length;
  let start: Vec | null = null;
  let terminal: Vec | null = null;
  let door: Vec | null = null;

  const tiles = rows.map((row, y) => {
    if (row.length !== width) throw new Error(`Row ${y} has length ${row.length}, expected ${width}`);
    let out = '';
    for (let x = 0; x < width; x++) {
      const c = row[x];
      if (c === 'P') start = { x, y };
      if (c === 'T') terminal = { x, y };
      if (c === 'D') door = { x, y };
      out += c === 'P' || c === 'D' ? '.' : c;
    }
    return out;
  });

  if (!start || !terminal) throw new Error('Level needs a player start (P) and a terminal (T)');
  const artifacts: ArtifactDef[] = [...loot];
  if (sealedLoot) artifacts.push({ ...sealedLoot, pos: terminal, sealed: true });
  return { name, width, height: rows.length, tiles, start, terminal, door, guards, artifacts, decor, turnLimit };
}

/** Length of a heist in turns. The perfect heist needs 55 turns and loses 10 to the Hourglass. */
export const MISSION_TURNS = 72;

/**
 * THE HALCYON MUSEUM — the single handcrafted level.
 *
 * GUARD_01 walks a loop through the central hall and makes every approach a timing problem.
 * GUARD_02 is a sentry inside the sealed gallery, watching its only door.
 * Three cursed artifacts: one near the entrance, one across the hall, one in the gallery.
 * The solver tests prove how much can be carried out with and without a patch.
 */
export const LAB_LEVEL: Level = parseLevel(
  'THE HALCYON MUSEUM // NIGHT SHIFT',
  [
    '############',
    '#...#......#',
    '#.#.#.....T#',
    '#.#.#......#',
    '#.#.##D#####',
    '#.#......#.#',
    '#.###.##.#.#',
    '#.....#....#',
    '#.##.##.##.#',
    '#.##....##.#',
    '#P...##....#',
    '############',
  ],
  [
    {
      id: 'G1',
      name: 'GUARD_01',
      start: { x: 5, y: 5 },
      facing: 'S',
      range: 4,
      route: [
        { x: 5, y: 7 },
        { x: 4, y: 7 },
        { x: 4, y: 9 },
        { x: 7, y: 9 },
        { x: 7, y: 7 },
        { x: 8, y: 7 },
        { x: 8, y: 5 },
        { x: 5, y: 5 },
      ],
    },
    {
      id: 'G2',
      name: 'GUARD_02',
      start: { x: 5, y: 2 },
      facing: 'E',
      range: 5,
      route: [{ x: 5, y: 2, face: 'E' }],
    },
  ],
  [
    { id: 'crown', name: 'CROWN OF SIGHT', value: 100, curse: 'SIGHT', pos: { x: 1, y: 6 } },
    { id: 'mask', name: 'MASK OF PURSUIT', value: 200, curse: 'PURSUIT', pos: { x: 10, y: 5 } },
  ],
  [
    { type: 'camera', x: 4, y: 4 },
    { type: 'camera', x: 11, y: 4 },
    { type: 'camera', x: 0, y: 11 },
    { type: 'camera', x: 6, y: 7 },
    { type: 'console', x: 10, y: 4 },
    { type: 'console', x: 2, y: 3 },
    { type: 'console', x: 5, y: 10 },
    { type: 'tank', x: 2, y: 9 },
    { type: 'tank', x: 3, y: 8 },
    { type: 'tank', x: 8, y: 8 },
    { type: 'tank', x: 9, y: 6 },
    { type: 'tank', x: 4, y: 1 },
  ],
  { id: 'hourglass', name: 'CURSED HOURGLASS', value: 300, curse: 'HOURGLASS' },
  MISSION_TURNS,
);

/**
 * Results of the exhaustive solver for LAB_LEVEL, asserted by the test suite so they can never drift.
 * Shown to the player on the result screen.
 */
export const LAB_PROVEN = { withoutPatch: 300, withBestPatch: 600, bestTurns: 55 } as const;

export const totalLoot = (level: Level): number => level.artifacts.reduce((sum, a) => sum + a.value, 0);
