import { describe, expect, it } from 'vitest';
import { createInitialState, step } from '../sim/simulation';
import type { Patch } from '../sim/types';
import { ARENA, run, teleport } from './helpers';

const seenAt = { x: 5, y: 1 };
const hidden = { x: 1, y: 3 };

describe('guard FSM — factory rules', () => {
  it('PATROL → CHASE → INVESTIGATE → RETURN → PATROL', () => {
    let s = createInitialState(ARENA);
    expect(s.guards[0].state).toBe('PATROL');

    s = step(ARENA, teleport(s, seenAt), 'WAIT').state;
    expect(s.guards[0].state).toBe('CHASE');
    expect(s.guards[0].lastKnown).toEqual(seenAt);

    s = step(ARENA, teleport(s, hidden), 'WAIT').state;
    expect(s.guards[0].state).toBe('INVESTIGATE');
    expect(s.guards[0].target).toEqual(seenAt);
    expect(s.guards[0].pos).toEqual({ x: 6, y: 1 }); // sprinted two tiles

    s = run(ARENA, s, ['WAIT', 'WAIT']);
    expect(s.guards[0].state).toBe('RETURN');

    s = run(ARENA, s, ['WAIT', 'WAIT', 'WAIT']);
    expect(s.guards[0].state).toBe('PATROL');
    expect(s.guards[0].pos).toEqual({ x: 8, y: 1 });
    expect(s.guards[0].facing).toBe('W');
  });

  it('CHASE keeps updating its target while the player is visible', () => {
    let s = step(ARENA, teleport(createInitialState(ARENA), seenAt), 'WAIT').state;
    s = step(ARENA, s, 'W').state;
    expect(s.guards[0].state).toBe('CHASE');
    expect(s.guards[0].lastKnown).toEqual({ x: 4, y: 1 });
  });

  it('a chasing guard catches a fleeing player', () => {
    let s = step(ARENA, teleport(createInitialState(ARENA), seenAt), 'WAIT').state;
    s = run(ARENA, s, ['W', 'W', 'W', 'W']);
    expect(s.status).toBe('CAUGHT');
  });
});

describe('guard FSM — patched rules', () => {
  const investigate: Patch = { guardId: 'S1', slot: 'onDetect', value: 'INVESTIGATE' };

  it('onDetect=INVESTIGATE records the sighting once and walks instead of sprinting', () => {
    let s = step(ARENA, teleport(createInitialState(ARENA, investigate), seenAt), 'WAIT').state;
    expect(s.guards[0].state).toBe('INVESTIGATE');
    expect(s.guards[0].target).toEqual(seenAt);

    s = step(ARENA, s, 'W').state; // still in view, one tile further away
    expect(s.guards[0].seesPlayer).toBe(true);
    expect(s.guards[0].target).toEqual(seenAt); // not refreshed
    expect(s.guards[0].pos).toEqual({ x: 7, y: 1 }); // one tile per turn
  });

  it('a patched guard is not harmless: it still captures a player in its way', () => {
    let s = step(ARENA, teleport(createInitialState(ARENA, investigate), seenAt), 'WAIT').state;
    s = run(ARENA, s, ['WAIT', 'WAIT', 'WAIT']);
    expect(s.status).toBe('CAUGHT');
  });

  it('a patched guard returns to patrol and can detect again', () => {
    let s = step(ARENA, teleport(createInitialState(ARENA, investigate), seenAt), 'WAIT').state;
    s = run(ARENA, teleport(s, hidden), ['WAIT', 'WAIT', 'WAIT', 'WAIT', 'WAIT', 'WAIT', 'WAIT']);
    expect(s.guards[0].state).toBe('PATROL');
    s = step(ARENA, teleport(s, seenAt), 'WAIT').state;
    expect(s.guards[0].state).toBe('INVESTIGATE');
  });

  it('onLostSight=RETURN skips the investigation', () => {
    const p: Patch = { guardId: 'S1', slot: 'onLostSight', value: 'RETURN' };
    let s = step(ARENA, teleport(createInitialState(ARENA, p), seenAt), 'WAIT').state;
    s = step(ARENA, teleport(s, hidden), 'WAIT').state;
    expect(s.guards[0].state).toBe('RETURN');
  });

  it('onInvestigateEnd=SWEEP scans all four directions before returning', () => {
    const p: Patch = { guardId: 'S1', slot: 'onInvestigateEnd', value: 'SWEEP' };
    let s = step(ARENA, teleport(createInitialState(ARENA, p), seenAt), 'WAIT').state;
    s = run(ARENA, teleport(s, hidden), ['WAIT', 'WAIT']); // arrive at the sighting
    expect(s.guards[0].pos).toEqual(seenAt);
    const facings = new Set<string>();
    for (let i = 0; i < 4; i++) {
      s = step(ARENA, s, 'WAIT').state;
      expect(s.guards[0].state).toBe('INVESTIGATE');
      facings.add(s.guards[0].facing);
    }
    expect(facings.size).toBe(4);
    s = step(ARENA, s, 'WAIT').state;
    expect(s.guards[0].state).toBe('RETURN');
  });
});
