import type { Decor, GuardDef, Level, Vec } from './types';

/**
 * Parses an ASCII map.
 * '#' wall, '.' floor, 'P' player start, 'T' terminal (solid), 'D' vault door (floor).
 */
export function parseLevel(name: string, rows: string[], guards: GuardDef[], decor: Decor[] = []): Level {
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
  return { name, width, height: rows.length, tiles, start, terminal, door, guards, decor };
}

/**
 * SECTOR 7 — the single handcrafted level.
 *
 * GUARD_01 walks a loop through the central lab and makes the approach a timing problem.
 * GUARD_02 is a sentry inside the vault, watching the only door.
 * The solver test proves the vault cannot be cracked with stock guard AI.
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
);
