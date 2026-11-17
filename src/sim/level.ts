import type { ArtifactDef, Decor, GuardDef, Level, Vec } from './types';

/**
 * Parses an ASCII map.
 * '#' wall, '.' floor, 'P' player start, 'T' terminal (solid), 'D' vault door (floor).
 */
export function parseLevel(
  name: string,
  rows: string[],
  guards: GuardDef[],
  loot: Omit<ArtifactDef, 'terminal'>[] = [],
  decor: Decor[] = [],
  terminalLoot: Omit<ArtifactDef, 'pos' | 'terminal'> | null = null,
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
  if (terminalLoot) artifacts.push({ ...terminalLoot, pos: terminal, terminal: true });
  return { name, width, height: rows.length, tiles, start, terminal, door, guards, artifacts, decor };
}

/**
 * SECTOR 7 — the single handcrafted level.
 *
 * GUARD_01 walks a loop through the central lab and makes the approach a timing problem.
 * GUARD_02 is a sentry inside the vault, watching the only door.
 * Six prototypes are scattered around; four of them are wired to a countermeasure.
 * The solver tests prove how much can be carried out with and without a patch.
 */
export const LAB_LEVEL: Level = parseLevel(
  'SECTOR 7 // RESEARCH VAULT',
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
    { id: 'shard', name: 'DATA SHARD', value: 100, curse: null, pos: { x: 1, y: 6 } },
    { id: 'cryo', name: 'CRYO SAMPLE', value: 150, curse: null, pos: { x: 10, y: 5 } },
    { id: 'chip', name: 'NEURAL CHIP', value: 250, curse: 'SENSOR_BOOST', pos: { x: 10, y: 10 } },
    { id: 'servo', name: 'SERVO CORE', value: 300, curse: 'OVERCLOCK', pos: { x: 3, y: 3 } },
    { id: 'key', name: 'MASTER KEY', value: 400, curse: 'ROLLBACK', pos: { x: 10, y: 1 } },
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
  { id: 'core', name: 'CORE DATA', value: 1000, curse: 'LOCKDOWN' },
);

/**
 * Results of the exhaustive solver for LAB_LEVEL, asserted by the test suite so they can never drift.
 * Shown to the player on the result screen.
 */
export const LAB_PROVEN = { withoutPatch: 800, withBestPatch: 1900 } as const;

export const totalLoot = (level: Level): number => level.artifacts.reduce((sum, a) => sum + a.value, 0);
