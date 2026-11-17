import type { Dir, Level, Vec } from './types';

/** Fixed neighbour order. Pathfinding ties are broken by this order, which keeps the game deterministic. */
export const DIRS: readonly Dir[] = ['N', 'E', 'S', 'W'];

export const DELTA: Record<Dir, Vec> = {
  N: { x: 0, y: -1 },
  E: { x: 1, y: 0 },
  S: { x: 0, y: 1 },
  W: { x: -1, y: 0 },
};

export const eq = (a: Vec, b: Vec): boolean => a.x === b.x && a.y === b.y;
export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
export const manhattan = (a: Vec, b: Vec): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

export function tileAt(level: Level, p: Vec): string {
  if (p.x < 0 || p.y < 0 || p.x >= level.width || p.y >= level.height) return '#';
  return level.tiles[p.y][p.x];
}

export const isWalkable = (level: Level, p: Vec): boolean => tileAt(level, p) === '.';
export const blocksSight = (level: Level, p: Vec): boolean => tileAt(level, p) !== '.';

export function dirBetween(from: Vec, to: Vec): Dir | null {
  for (const d of DIRS) if (eq(add(from, DELTA[d]), to)) return d;
  return null;
}

export const rotateCW = (d: Dir): Dir => DIRS[(DIRS.indexOf(d) + 1) % 4];
