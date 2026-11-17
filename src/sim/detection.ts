import { DELTA, blocksSight, isWalkable } from './grid';
import type { Dir, Level, Vec } from './types';

/**
 * Grid raycast (Bresenham). Tiles strictly between `a` and `b` must not block sight.
 */
export function hasLineOfSight(level: Level, a: Vec, b: Vec): boolean {
  let x = a.x;
  let y = a.y;
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y);
  const sx = a.x < b.x ? 1 : -1;
  const sy = a.y < b.y ? 1 : -1;
  let err = dx - dy;

  while (x !== b.x || y !== b.y) {
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
    if (x === b.x && y === b.y) break;
    if (blocksSight(level, { x, y })) return false;
  }
  return true;
}

/** 90-degree cone in front of the guard, limited by euclidean range. */
export function inCone(pos: Vec, facing: Dir, target: Vec, range: number): boolean {
  const dx = target.x - pos.x;
  const dy = target.y - pos.y;
  if (dx === 0 && dy === 0) return true;
  if (dx * dx + dy * dy > range * range) return false;
  const f = DELTA[facing];
  const forward = dx * f.x + dy * f.y;
  const sideways = Math.abs(dx * f.y - dy * f.x);
  return forward > 0 && sideways <= forward;
}

/** The three detection conditions: range, field of view, unobstructed line of sight. */
export function canSee(level: Level, pos: Vec, facing: Dir, range: number, target: Vec): boolean {
  return inCone(pos, facing, target, range) && hasLineOfSight(level, pos, target);
}

/** All floor tiles a guard can currently see. Used by renderers to draw the cone. */
export function visibleTiles(level: Level, pos: Vec, facing: Dir, range: number): Vec[] {
  const out: Vec[] = [];
  const r = Math.ceil(range);
  for (let y = pos.y - r; y <= pos.y + r; y++) {
    for (let x = pos.x - r; x <= pos.x + r; x++) {
      const p = { x, y };
      if (x === pos.x && y === pos.y) continue;
      if (isWalkable(level, p) && canSee(level, pos, facing, range, p)) out.push(p);
    }
  }
  return out;
}
