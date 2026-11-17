import { beforeAll, describe, expect, it } from 'vitest';
import { LAB_LEVEL, LAB_PROVEN, totalLoot } from '../sim/level';
import { allPatches } from '../sim/patch';
import { runReplay } from '../sim/replay';
import { solve, type Solution } from '../sim/solver';
import type { Patch } from '../sim/types';

const WINNING: Patch = { guardId: 'G2', slot: 'onDetect', value: 'INVESTIGATE' };
const same = (a: Patch, b: Patch) => a.guardId === b.guardId && a.slot === b.slot && a.value === b.value;

describe('puzzle validation (exhaustive solver)', () => {
  let stock: Solution;
  let patched: { patch: Patch; solution: Solution }[];

  beforeAll(() => {
    stock = solve(LAB_LEVEL, null);
    patched = allPatches(LAB_LEVEL).map((patch) => ({ patch, solution: solve(LAB_LEVEL, patch) }));
  }, 180_000);

  it('with factory AI the vault is out of reach: best haul is the loose loot only', () => {
    expect(stock.loot).toBe(LAB_PROVEN.withoutPatch);
    expect(stock.taken).not.toContain('core');
    expect(stock.taken).not.toContain('key');
  });

  it('exactly one of the six patches opens the vault', () => {
    const openers = patched.filter((p) => p.solution.taken.includes('core'));
    expect(openers).toHaveLength(1);
    expect(same(openers[0].patch, WINNING)).toBe(true);
    for (const p of patched) {
      if (!same(p.patch, WINNING)) expect(p.solution.loot).toBe(LAB_PROVEN.withoutPatch);
    }
  });

  it('greed has a price: even the perfect heist cannot take everything', () => {
    const best = patched.find((p) => same(p.patch, WINNING))!.solution;
    expect(best.loot).toBe(LAB_PROVEN.withBestPatch);
    expect(best.loot).toBeLessThan(totalLoot(LAB_LEVEL));
    expect(best.taken).not.toContain('servo'); // OVERCLOCK makes the vault run impossible
  });

  it('the perfect heist replays to an escape with the patch and fails without it', () => {
    const best = patched.find((p) => same(p.patch, WINNING))!.solution;
    const withPatch = runReplay(LAB_LEVEL, best.actions, WINNING).final;
    expect(withPatch.status).toBe('ESCAPED');
    expect(withPatch.loot).toBe(LAB_PROVEN.withBestPatch);

    const without = runReplay(LAB_LEVEL, best.actions, null).final;
    expect(without.status).toBe('CAUGHT');
  });

  it('walking straight out is always possible, for £0', () => {
    const r = runReplay(LAB_LEVEL, ['INTERACT'], null).final;
    expect(r.status).toBe('ESCAPED');
    expect(r.loot).toBe(0);
  });
});
