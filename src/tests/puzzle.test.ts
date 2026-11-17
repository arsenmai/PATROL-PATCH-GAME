import { beforeAll, describe, expect, it } from 'vitest';
import { LAB_LEVEL, LAB_PROVEN, totalLoot } from '../sim/level';
import { allPatches } from '../sim/patch';
import { runReplay } from '../sim/replay';
import { solve, type Solution } from '../sim/solver';
import type { Patch } from '../sim/types';

const WINNING: Patch = { guardId: 'G2', slot: 'onDetect', value: 'INVESTIGATE' };
const same = (a: Patch, b: Patch) => a.guardId === b.guardId && a.slot === b.slot && a.value === b.value;

describe('level validation (exhaustive solver)', () => {
  let stock: Solution;
  let patched: { patch: Patch; solution: Solution }[];

  beforeAll(() => {
    stock = solve(LAB_LEVEL, null);
    patched = allPatches(LAB_LEVEL).map((patch) => ({ patch, solution: solve(LAB_LEVEL, patch) }));
  }, 180_000);

  it('one artifact is easy: the crown can be stolen and carried out in a handful of turns', () => {
    const crownOnly = { ...LAB_LEVEL, artifacts: LAB_LEVEL.artifacts.filter((a) => a.id === 'crown') };
    const s = solve(crownOnly, null);
    expect(s.loot).toBe(100);
    expect(s.actions.length).toBeLessThanOrEqual(12);
  });

  it('with factory AI the sealed gallery is out of reach: two artifacts at most', () => {
    expect(stock.loot).toBe(LAB_PROVEN.withoutPatch);
    expect(stock.taken).not.toContain('hourglass');
  });

  it('exactly one of the six patches opens the gallery', () => {
    const openers = patched.filter((p) => p.solution.taken.includes('hourglass'));
    expect(openers).toHaveLength(1);
    expect(same(openers[0].patch, WINNING)).toBe(true);
  });

  it('all three artifacts are possible, but only just', () => {
    const best = patched.find((p) => same(p.patch, WINNING))!.solution;
    expect(best.loot).toBe(LAB_PROVEN.withBestPatch);
    expect(best.actions.length).toBe(LAB_PROVEN.bestTurns);
    expect(best.loot).toBe(totalLoot(LAB_LEVEL));
    // The perfect heist leaves fewer than ten turns on the clock.
    const final = runReplay(LAB_LEVEL, best.actions, WINNING).final;
    expect(final.status).toBe('ESCAPED');
    expect(final.deadline - final.turn).toBeLessThan(10);
  });

  it('a different patch has a different use: it makes the safe two-artifact run faster', () => {
    const g1 = patched.find((p) => same(p.patch, { guardId: 'G1', slot: 'onDetect', value: 'INVESTIGATE' }))!.solution;
    expect(g1.loot).toBe(stock.loot);
    expect(g1.actions.length).toBeLessThan(stock.actions.length);
  });

  it('the perfect heist fails on factory AI with the very same inputs', () => {
    const best = patched.find((p) => same(p.patch, WINNING))!.solution;
    expect(runReplay(LAB_LEVEL, best.actions, null).final.status).toBe('CAUGHT');
  });
});
