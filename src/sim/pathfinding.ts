import { DELTA, DIRS, add, eq, isWalkable } from './grid';
import type { Level, Vec } from './types';

/**
 * Breadth-first search on the tile grid.
 * Returns the tiles to walk through (excluding `from`, including `to`),
 * an empty array when already there, or null when unreachable.
 * Neighbours are expanded in a fixed N, E, S, W order so the result is deterministic.
 */
export function findPath(level: Level, from: Vec, to: Vec): Vec[] | null {
  if (eq(from, to)) return [];
  if (!isWalkable(level, to) || !isWalkable(level, from)) return null;

  const key = (p: Vec) => p.y * level.width + p.x;
  const cameFrom = new Map<number, Vec | null>([[key(from), null]]);
  const queue: Vec[] = [from];

  for (let head = 0; head < queue.length; head++) {
    const current = queue[head];
    if (eq(current, to)) {
      const path: Vec[] = [];
      let node: Vec | null = current;
      while (node && !eq(node, from)) {
        path.push(node);
        node = cameFrom.get(key(node)) ?? null;
      }
      return path.reverse();
    }
    for (const d of DIRS) {
      const next = add(current, DELTA[d]);
      if (!isWalkable(level, next) || cameFrom.has(key(next))) continue;
      cameFrom.set(key(next), current);
      queue.push(next);
    }
  }
  return null;
}

const stepCache = new WeakMap<Level, Map<number, Vec | null>>();

/**
 * First tile on the shortest path, or null if there is nowhere to go.
 * Levels are immutable, so answers are memoised per (from, to) pair; the solver calls this millions of times.
 */
export function nextStep(level: Level, from: Vec, to: Vec): Vec | null {
  let cache = stepCache.get(level);
  if (!cache) stepCache.set(level, (cache = new Map()));
  const size = level.width * level.height;
  const key = (from.y * level.width + from.x) * size + to.y * level.width + to.x;
  let next = cache.get(key);
  if (next === undefined) {
    const path = findPath(level, from, to);
    next = path && path.length > 0 ? path[0] : null;
    cache.set(key, next);
  }
  return next;
}
