import { describe, expect, it } from 'vitest';
import { isWalkable } from '../sim/grid';
import { LAB_LEVEL } from '../sim/level';
import { findPath, nextStep } from '../sim/pathfinding';
import { createInitialState, step } from '../sim/simulation';
import { ARENA } from './helpers';

describe('pathfinding', () => {
  it('walks around obstacles and never through walls', () => {
    const path = findPath(ARENA, { x: 1, y: 3 }, { x: 5, y: 1 })!;
    expect(path).not.toBeNull();
    expect(path.length).toBe(6); // up the open column x=1, then east along the corridor
    let prev = { x: 1, y: 3 };
    for (const p of path) {
      expect(isWalkable(ARENA, p)).toBe(true);
      expect(Math.abs(p.x - prev.x) + Math.abs(p.y - prev.y)).toBe(1);
      prev = p;
    }
    expect(prev).toEqual({ x: 5, y: 1 });
  });

  it('returns null for unreachable or solid targets', () => {
    expect(findPath(ARENA, { x: 1, y: 1 }, { x: 2, y: 2 })).toBeNull();
    expect(nextStep(ARENA, { x: 1, y: 1 }, { x: 1, y: 1 })).toBeNull();
  });

  it('is deterministic', () => {
    const a = findPath(LAB_LEVEL, { x: 1, y: 10 }, { x: 9, y: 2 });
    const b = findPath(LAB_LEVEL, { x: 1, y: 10 }, { x: 9, y: 2 });
    expect(a).toEqual(b);
  });
});

describe('player movement', () => {
  it('rejects moves into walls without consuming a turn', () => {
    const s0 = createInitialState(LAB_LEVEL);
    const r = step(LAB_LEVEL, s0, 'W');
    expect(r.advanced).toBe(false);
    expect(r.state).toBe(s0);
    expect(r.events[0].kind).toBe('BLOCKED');
  });

  it('advances exactly one turn per valid move or wait', () => {
    const s0 = createInitialState(LAB_LEVEL);
    const moved = step(LAB_LEVEL, s0, 'N');
    expect(moved.state.turn).toBe(1);
    expect(moved.state.player).toEqual({ x: 1, y: 9 });
    expect(step(LAB_LEVEL, moved.state, 'WAIT').state.turn).toBe(2);
  });

  it('rejects INTERACT when there is nothing to interact with', () => {
    const s1 = step(LAB_LEVEL, createInitialState(LAB_LEVEL), 'N').state;
    const r = step(LAB_LEVEL, s1, 'INTERACT');
    expect(r.advanced).toBe(false);
    expect(r.state).toBe(s1);
  });
});
