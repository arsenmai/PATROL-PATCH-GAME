import { describe, expect, it } from 'vitest';
import { canSee, hasLineOfSight, visibleTiles } from '../sim/detection';
import { isWalkable } from '../sim/grid';
import { ARENA } from './helpers';

const sentry = { x: 8, y: 1 };

describe('detection', () => {
  it('sees a player inside range and field of view', () => {
    expect(canSee(ARENA, sentry, 'W', 4, { x: 5, y: 1 })).toBe(true);
  });

  it('does not see behind itself or to the side', () => {
    expect(canSee(ARENA, { x: 5, y: 1 }, 'W', 4, { x: 7, y: 1 })).toBe(false);
    expect(canSee(ARENA, { x: 6, y: 1 }, 'W', 4, { x: 6, y: 3 })).toBe(false);
  });

  it('does not see beyond its range', () => {
    expect(canSee(ARENA, sentry, 'W', 4, { x: 3, y: 1 })).toBe(false);
  });

  it('does not see through walls', () => {
    // (8,3) is two tiles south of the sentry post but row 2 has a wall at x=7 and the terminal column is solid.
    expect(hasLineOfSight(ARENA, { x: 6, y: 1 }, { x: 4, y: 3 })).toBe(false);
    expect(canSee(ARENA, { x: 4, y: 1 }, 'S', 4, { x: 4, y: 3 })).toBe(false);
    expect(canSee(ARENA, { x: 6, y: 1 }, 'S', 4, { x: 6, y: 3 })).toBe(true);
  });

  it('only lists walkable tiles in the cone', () => {
    const tiles = visibleTiles(ARENA, sentry, 'W', 4);
    expect(tiles.length).toBeGreaterThan(0);
    for (const t of tiles) expect(isWalkable(ARENA, t)).toBe(true);
  });
});
