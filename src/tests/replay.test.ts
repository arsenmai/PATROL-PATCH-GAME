import { describe, expect, it } from 'vitest';
import { LAB_LEVEL } from '../sim/level';
import { ReplayRecorder, compareReplays, runReplay } from '../sim/replay';
import { solve } from '../sim/solver';
import type { Action, Patch } from '../sim/types';

const patch: Patch = { guardId: 'G2', slot: 'onDetect', value: 'INVESTIGATE' };
const route: Action[] = ['N', 'N', 'WAIT', 'N', 'E', 'E', 'E', 'E', 'N', 'N', 'E', 'N', 'N', 'E', 'N', 'E', 'E', 'INTERACT'];

describe('deterministic replay', () => {
  it('identical inputs produce identical results', () => {
    const a = runReplay(LAB_LEVEL, route, patch);
    const b = runReplay(LAB_LEVEL, route, patch);
    expect(a.frames).toEqual(b.frames);
    expect(a.events).toEqual(b.events);
  });

  it('replays recorded actions in order', () => {
    const rec = new ReplayRecorder();
    const actions: Action[] = ['N', 'N', 'E', 'WAIT'];
    actions.forEach((a) => rec.record(a));
    expect(rec.actions).toEqual(actions);

    const r = runReplay(LAB_LEVEL, rec.actions, null);
    expect(r.frames.map((f) => f.player)).toEqual([
      { x: 1, y: 10 },
      { x: 1, y: 9 },
      { x: 1, y: 8 },
      { x: 1, y: 8 }, // E is a wall here: no turn consumed, frame skipped
    ]);
    expect(r.frames.map((f) => f.turn)).toEqual([0, 1, 2, 3]);
  });

  it('original and patched simulations diverge on the same inputs', () => {
    // A vault-only heist, found by the solver on a copy of the level that has no other loot.
    const vaultOnly = { ...LAB_LEVEL, artifacts: LAB_LEVEL.artifacts.filter((a) => a.id === 'core') };
    const heist = solve(vaultOnly, patch).actions;

    const c = compareReplays(LAB_LEVEL, heist, patch);
    expect(c.original.final.status).toBe('CAUGHT');
    expect(c.original.final.taken).not.toContain('core');
    expect(c.patched.final.status).toBe('ESCAPED');
    expect(c.patched.final.loot).toBe(1000);
    expect(c.divergedAt).not.toBeNull();
    // Up to the divergence both worlds are bit-for-bit identical.
    for (let t = 0; t < c.divergedAt!; t++) {
      expect(c.original.frames[t].player).toEqual(c.patched.frames[t].player);
      expect(c.original.frames[t].guards.map((g) => g.pos)).toEqual(c.patched.frames[t].guards.map((g) => g.pos));
    }
  });

  it('without a patch both simulations are identical', () => {
    const c = compareReplays(LAB_LEVEL, route, null);
    expect(c.divergedAt).toBeNull();
    expect(c.original.frames).toEqual(c.patched.frames);
  });
});
