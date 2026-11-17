import { describe, expect, it } from 'vitest';
import { CURSES, guardMods, turnsLeft } from '../sim/curses';
import { LAB_LEVEL, MISSION_TURNS, parseLevel } from '../sim/level';
import { DEFAULT_RULES } from '../sim/patch';
import { createInitialState, step } from '../sim/simulation';
import type { Action, CurseId, GameState, Level } from '../sim/types';
import { run, teleport } from './helpers';

const at = (id: string) => LAB_LEVEL.artifacts.find((a) => a.id === id)!.pos;

/** A corridor with a sealed case and no guards, to test the mission clock in isolation. */
const CLOSET: Level = parseLevel(
  'CLOSET',
  ['#####', '#P.T#', '#####'],
  [],
  [],
  [],
  { id: 'hourglass', name: 'CURSED HOURGLASS', value: 300, curse: 'HOURGLASS' },
  20,
);

describe('artifacts', () => {
  it('stealing takes a turn, adds loot and cannot be repeated', () => {
    const s0 = teleport(createInitialState(LAB_LEVEL), at('crown'));
    const r = step(LAB_LEVEL, s0, 'INTERACT');
    expect(r.advanced).toBe(true);
    expect(r.state.turn).toBe(1);
    expect(r.state.loot).toBe(100);
    expect(r.state.taken).toEqual(['crown']);
    expect(step(LAB_LEVEL, r.state, 'INTERACT').advanced).toBe(false);
  });

  it('a sealed case is opened from an adjacent tile, other artifacts from their own tile', () => {
    const beside = teleport(createInitialState(LAB_LEVEL), { x: 1, y: 7 }); // next to the crown, not on it
    expect(step(LAB_LEVEL, beside, 'INTERACT').advanced).toBe(false);
    const nearCase = teleport(createInitialState(LAB_LEVEL), { x: 10, y: 3 });
    expect(step(LAB_LEVEL, nearCase, 'INTERACT').state.taken).toEqual(['hourglass']);
  });

  it('extraction needs at least one artifact', () => {
    const s0 = createInitialState(LAB_LEVEL);
    expect(step(LAB_LEVEL, s0, 'INTERACT').advanced).toBe(false);
  });
});

describe('curses', () => {
  it('SIGHT: detection range grows by 25% and changes real detection', () => {
    // GUARD_02 looks east from (5,2) with range 5; (10,3) is ~5.1 tiles away.
    const spot = { x: 10, y: 3 };
    const calm = step(LAB_LEVEL, teleport(createInitialState(LAB_LEVEL), spot), 'WAIT').state;
    expect(calm.guards[1].seesPlayer).toBe(false);

    const cursed = { ...teleport(createInitialState(LAB_LEVEL), spot), curses: ['SIGHT' as const] };
    expect(guardMods(cursed.curses, 1).rangeMultiplier).toBe(1.25);
    expect(step(LAB_LEVEL, cursed, 'WAIT').state.guards[1].seesPlayer).toBe(true);
  });

  it('PURSUIT: guards take one extra step on every 5th turn (+20%)', () => {
    const tilesMoved = (curses: CurseId[]) => {
      let s: GameState = { ...createInitialState(LAB_LEVEL), curses };
      let total = 0;
      for (let i = 0; i < 10; i++) {
        const before = s.guards[0].pos;
        s = step(LAB_LEVEL, s, 'WAIT').state;
        total += Math.abs(s.guards[0].pos.x - before.x) + Math.abs(s.guards[0].pos.y - before.y);
      }
      return total;
    };
    expect(tilesMoved([])).toBe(10);
    expect(tilesMoved(['PURSUIT'])).toBe(12);
  });

  it('HOURGLASS: pulls the deadline closer, once', () => {
    const s = run(CLOSET, createInitialState(CLOSET), ['E', 'INTERACT']);
    expect(s.loot).toBe(300);
    expect(s.deadline).toBe(20 - CURSES.HOURGLASS.turnPenalty!);
    expect(turnsLeft(s)).toBe(8);
  });

  it('curses stack, and the same curse is never applied twice', () => {
    const twice = { ...teleport(createInitialState(LAB_LEVEL), at('crown')), curses: ['SIGHT' as const] };
    const s = step(LAB_LEVEL, twice, 'INTERACT').state;
    expect(s.curses).toEqual(['SIGHT']);
    expect(guardMods(['SIGHT', 'PURSUIT'], 5)).toEqual({ rangeMultiplier: 1.25, speedBonus: 1 });
  });

  it('curses never touch guard rules: the patch survives every theft', () => {
    const patch = { guardId: 'G2', slot: 'onDetect', value: 'INVESTIGATE' } as const;
    let s = createInitialState(LAB_LEVEL, patch);
    for (const id of ['crown', 'mask']) s = step(LAB_LEVEL, teleport(s, at(id)), 'INTERACT').state;
    expect(s.curses).toEqual(['SIGHT', 'PURSUIT']);
    expect(s.guards[1].rules.onDetect).toBe('INVESTIGATE');
    expect(s.guards[1].hacked).toBe(true);
    expect(s.guards[0].rules).toEqual(DEFAULT_RULES);
  });
});

describe('mission clock', () => {
  it('starts at the level limit', () => {
    expect(turnsLeft(createInitialState(LAB_LEVEL))).toBe(MISSION_TURNS);
  });

  it('running out of time loses the loot', () => {
    let s = run(CLOSET, createInitialState(CLOSET), ['E', 'INTERACT']);
    const waits: Action[] = Array(7).fill('WAIT');
    s = run(CLOSET, s, waits);
    expect(s.status).toBe('PLAYING');
    expect(turnsLeft(s)).toBe(1);
    s = step(CLOSET, s, 'WAIT').state;
    expect(s.status).toBe('TIMEOUT');
  });

  it('escaping in time banks the loot', () => {
    const s = run(CLOSET, createInitialState(CLOSET), ['E', 'INTERACT', 'W', 'INTERACT']);
    expect(s.status).toBe('ESCAPED');
    expect(s.loot).toBe(300);
  });
});
