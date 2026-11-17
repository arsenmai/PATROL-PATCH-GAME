import { describe, expect, it } from 'vitest';
import { LAB_LEVEL } from '../sim/level';
import { DEFAULT_RULES, PatchSystem, allPatches } from '../sim/patch';
import { createInitialState } from '../sim/simulation';
import type { Patch } from '../sim/types';

const patch: Patch = { guardId: 'G2', slot: 'onDetect', value: 'INVESTIGATE' };

describe('patch system', () => {
  it('applies one patch to exactly one guard', () => {
    const ps = new PatchSystem(LAB_LEVEL);
    expect(ps.remaining).toBe(1);
    expect(ps.apply(patch)).toEqual({ ok: true });
    expect(ps.remaining).toBe(0);

    const s = createInitialState(LAB_LEVEL, ps.current);
    const [g1, g2] = s.guards;
    expect(g2.rules.onDetect).toBe('INVESTIGATE');
    expect(g2.hacked).toBe(true);
    expect(g1.rules).toEqual(DEFAULT_RULES);
    expect(g1.hacked).toBe(false);
  });

  it('enforces the one-patch limit', () => {
    const ps = new PatchSystem(LAB_LEVEL);
    ps.apply(patch);
    const second = ps.apply({ guardId: 'G1', slot: 'onLostSight', value: 'RETURN' });
    expect(second.ok).toBe(false);
    expect(ps.current).toEqual(patch);
  });

  it('rejects unknown guards, unknown values and no-op patches', () => {
    const ps = new PatchSystem(LAB_LEVEL);
    expect(ps.apply({ guardId: 'G9', slot: 'onDetect', value: 'INVESTIGATE' }).ok).toBe(false);
    expect(ps.apply({ guardId: 'G1', slot: 'onDetect', value: 'SLEEP' }).ok).toBe(false);
    expect(ps.apply({ guardId: 'G1', slot: 'onDetect', value: 'CHASE' }).ok).toBe(false);
    expect(ps.current).toBeNull();
  });

  it('reset restores the factory configuration', () => {
    const ps = new PatchSystem(LAB_LEVEL);
    ps.apply(patch);
    ps.reset();
    expect(ps.current).toBeNull();
    expect(ps.remaining).toBe(1);
    for (const g of createInitialState(LAB_LEVEL, ps.current).guards) expect(g.rules).toEqual(DEFAULT_RULES);
  });

  it('offers six distinct single patches on the lab level', () => {
    expect(allPatches(LAB_LEVEL)).toHaveLength(6);
  });
});
