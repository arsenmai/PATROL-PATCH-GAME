import { describe, expect, it } from 'vitest';
import { LOCKDOWN_TURNS, guardMods, lockdownRemaining } from '../sim/curses';
import { LAB_LEVEL, parseLevel } from '../sim/level';
import { DEFAULT_RULES } from '../sim/patch';
import { createInitialState, step } from '../sim/simulation';
import type { Action, Level } from '../sim/types';
import { run, teleport } from './helpers';

const at = (id: string) => LAB_LEVEL.artifacts.find((a) => a.id === id)!.pos;

/** A corridor with a terminal and no guards, to test the lockdown clock in isolation. */
const VAULTLET: Level = parseLevel('VAULTLET', ['#####', '#P.T#', '#####'], [], [], [], {
  id: 'core',
  name: 'CORE DATA',
  value: 1000,
  curse: 'LOCKDOWN',
});

describe('loot and countermeasures', () => {
  it('stealing takes a turn, adds loot and cannot be repeated', () => {
    const s0 = teleport(createInitialState(LAB_LEVEL), at('shard'));
    const r = step(LAB_LEVEL, s0, 'INTERACT');
    expect(r.advanced).toBe(true);
    expect(r.state.turn).toBe(1);
    expect(r.state.loot).toBe(100);
    expect(r.state.taken).toEqual(['shard']);
    expect(r.state.curses).toEqual([]);
    expect(step(LAB_LEVEL, r.state, 'INTERACT').advanced).toBe(false);
  });

  it('OVERCLOCK: patrolling guards cover two tiles per turn', () => {
    const before = createInitialState(LAB_LEVEL);
    const normal = step(LAB_LEVEL, before, 'WAIT').state.guards[0].pos;
    expect(normal).toEqual({ x: 5, y: 6 });

    const stolen = step(LAB_LEVEL, teleport(before, at('servo')), 'INTERACT').state;
    expect(stolen.curses).toEqual(['OVERCLOCK']);
    expect(guardMods(stolen).speedBonus).toBe(1);
    expect(stolen.guards[0].pos).toEqual({ x: 5, y: 7 }); // already applies on the turn of the theft
  });

  it('SENSOR BOOST: a player just out of range becomes visible', () => {
    // GUARD_02 looks east from (5,2) with range 5; (10,3) is ~5.1 tiles away.
    const spot = { x: 10, y: 3 };
    const calm = step(LAB_LEVEL, teleport(createInitialState(LAB_LEVEL), spot), 'WAIT').state;
    expect(calm.guards[1].seesPlayer).toBe(false);

    const boosted = { ...teleport(createInitialState(LAB_LEVEL), spot), curses: ['SENSOR_BOOST' as const] };
    expect(step(LAB_LEVEL, boosted, 'WAIT').state.guards[1].seesPlayer).toBe(true);
  });

  it('ROLLBACK: erases the active patch on every guard', () => {
    const patch = { guardId: 'G2', slot: 'onDetect', value: 'INVESTIGATE' } as const;
    const s0 = teleport(createInitialState(LAB_LEVEL, patch), at('key'));
    expect(s0.guards[1].rules.onDetect).toBe('INVESTIGATE');
    const s1 = step(LAB_LEVEL, s0, 'INTERACT').state;
    expect(s1.curses).toContain('ROLLBACK');
    for (const g of s1.guards) {
      expect(g.rules).toEqual(DEFAULT_RULES);
      expect(g.hacked).toBe(false);
    }
  });

  it('LOCKDOWN: the exit seals when the timer runs out', () => {
    let s = run(VAULTLET, createInitialState(VAULTLET), ['E', 'INTERACT']);
    expect(s.loot).toBe(1000);
    expect(lockdownRemaining(s)).toBe(LOCKDOWN_TURNS);
    const waits: Action[] = Array(LOCKDOWN_TURNS - 1).fill('WAIT');
    s = run(VAULTLET, s, waits);
    expect(s.status).toBe('PLAYING');
    expect(lockdownRemaining(s)).toBe(1);
    s = step(VAULTLET, s, 'WAIT').state;
    expect(s.status).toBe('TRAPPED');
  });

  it('escaping in time banks the loot', () => {
    const s = run(VAULTLET, createInitialState(VAULTLET), ['E', 'INTERACT', 'W', 'INTERACT']);
    expect(s.status).toBe('ESCAPED');
    expect(s.loot).toBe(1000);
  });

  it('the terminal is hacked from an adjacent tile, loose loot from its own tile', () => {
    const beside = teleport(createInitialState(LAB_LEVEL), { x: 1, y: 7 }); // next to the shard, not on it
    expect(step(LAB_LEVEL, beside, 'INTERACT').advanced).toBe(false);
    const nearTerminal = teleport(createInitialState(LAB_LEVEL), { x: 10, y: 3 });
    expect(step(LAB_LEVEL, nearTerminal, 'INTERACT').state.taken).toEqual(['core']);
  });
});
