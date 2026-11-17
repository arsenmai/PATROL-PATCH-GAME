import { describe, expect, it } from 'vitest';
import { LAB_LEVEL } from '../sim/level';
import { allPatches } from '../sim/patch';
import { runReplay } from '../sim/replay';
import { solve } from '../sim/solver';

describe('puzzle validation (exhaustive solver)', () => {
  it('the level is impossible with factory guard AI', () => {
    expect(solve(LAB_LEVEL, null)).toBeNull();
  });

  it('at least one patch makes it solvable, and not every patch does', () => {
    const results = allPatches(LAB_LEVEL).map((p) => ({ p, solution: solve(LAB_LEVEL, p) }));
    const winning = results.filter((r) => r.solution);
    expect(winning.length).toBeGreaterThanOrEqual(1);
    expect(winning.length).toBeLessThan(results.length);
  });

  it('the solver route fails on original AI and succeeds on patched AI', () => {
    const patch = { guardId: 'G2', slot: 'onDetect', value: 'INVESTIGATE' } as const;
    const solution = solve(LAB_LEVEL, patch)!;
    expect(solution).not.toBeNull();
    expect(solution.actions).toContain('WAIT'); // GUARD_01 forces a timing decision
    expect(runReplay(LAB_LEVEL, solution.actions, patch).final.status).toBe('SUCCESS');
    expect(runReplay(LAB_LEVEL, solution.actions, null).final.status).toBe('CAUGHT');
  });

  it('rushing the shortest path gets the player caught even with the winning patch', () => {
    const patch = { guardId: 'G2', slot: 'onDetect', value: 'INVESTIGATE' } as const;
    const solution = solve(LAB_LEVEL, patch)!;
    const rushed = solution.actions.filter((a) => a !== 'WAIT');
    expect(runReplay(LAB_LEVEL, rushed, patch).final.status).not.toBe('SUCCESS');
  });
});
