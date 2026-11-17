import { describe, expect, it } from 'vitest';
import { CURSES } from '../sim/curses';
import { ARTIFACT_KINDS, FLOOR_SLOTS, buildDaily, buildVariant, dailyFor, variantFromSeed } from '../sim/daily';
import { DAILY_HEISTS } from '../sim/daily-data';
import { eq, isWalkable } from '../sim/grid';
import { LAB_LEVEL, totalLoot } from '../sim/level';
import { allPatches } from '../sim/patch';
import { findPath } from '../sim/pathfinding';
import { solve } from '../sim/solver';

describe('seeded variants', () => {
  it('the same seed always gives the same variant', () => {
    expect(variantFromSeed(42)).toEqual(variantFromSeed(42));
    const distinct = new Set(Array.from({ length: 30 }, (_, i) => JSON.stringify(variantFromSeed(i + 1))));
    expect(distinct.size).toBeGreaterThan(20);
  });

  it('building a variant never mutates the base museum', () => {
    const before = JSON.stringify(LAB_LEVEL);
    buildVariant(variantFromSeed(7), 80);
    expect(JSON.stringify(LAB_LEVEL)).toBe(before);
  });

  it('every variant is a well-formed level', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const level = buildVariant(variantFromSeed(seed), 80);
      expect(level.artifacts.map((a) => a.id).sort()).toEqual(ARTIFACT_KINDS.map((a) => a.id).sort());
      expect(totalLoot(level)).toBe(totalLoot(LAB_LEVEL));

      const loose = level.artifacts.filter((a) => !a.sealed);
      expect(level.artifacts.filter((a) => a.sealed)).toHaveLength(1);
      expect(eq(loose[0].pos, loose[1].pos)).toBe(false);
      for (const a of loose) {
        expect(isWalkable(level, a.pos)).toBe(true);
        expect(findPath(level, level.start, a.pos)).not.toBeNull();
      }

      const hall = level.guards[0];
      expect(eq(hall.start, hall.route[hall.route.length - 1])).toBe(true);
      expect(hall.route).toHaveLength(LAB_LEVEL.guards[0].route.length);
      expect(level.guards[1]).toBe(LAB_LEVEL.guards[1]); // the sentry is untouched
    }
  });

  it('no artifact slot lies on the hall guard route', () => {
    const route = LAB_LEVEL.guards[0].route;
    const onRoute = new Set<string>();
    route.forEach((wp, i) => {
      onRoute.add(`${wp.x},${wp.y}`);
      for (const p of findPath(LAB_LEVEL, wp, route[(i + 1) % route.length]) ?? []) onRoute.add(`${p.x},${p.y}`);
    });
    for (const slot of FLOOR_SLOTS) expect(onRoute.has(`${slot.x},${slot.y}`)).toBe(false);
  });
});

describe('heist of the day', () => {
  it('ships a rotation of pre-validated heists with consistent data', () => {
    expect(DAILY_HEISTS.length).toBeGreaterThanOrEqual(7);
    for (const heist of DAILY_HEISTS) {
      expect(heist.variant).toEqual(variantFromSeed(heist.seed));
      expect(heist.par.withBestPatch).toBe(totalLoot(LAB_LEVEL));
      expect(heist.par.withoutPatch).toBeGreaterThan(0);
      expect(heist.par.withoutPatch).toBeLessThan(heist.par.withBestPatch);
      expect(heist.turnLimit).toBe(heist.par.bestTurns + CURSES.HOURGLASS.turnPenalty! + 7);
      expect(buildDaily(heist).turnLimit).toBe(heist.turnLimit);
    }
  });

  it('the stored par of a heist matches what the solver finds', () => {
    const heist = DAILY_HEISTS[0];
    const level = buildDaily(heist);
    expect(solve(level, null).loot).toBe(heist.par.withoutPatch);
    const best = Math.max(...allPatches(level).map((p) => solve(level, p).loot));
    expect(best).toBe(heist.par.withBestPatch);
  }, 120_000);

  it('picks one heist per UTC day and cycles through the rotation', () => {
    const day = (n: number) => new Date(Date.UTC(2026, 10, 17 + n, 12));
    expect(dailyFor(day(0))).toBe(dailyFor(new Date(Date.UTC(2026, 10, 17, 23, 59))));
    expect(dailyFor(day(1))).not.toBe(dailyFor(day(0)));
    expect(dailyFor(day(DAILY_HEISTS.length))).toBe(dailyFor(day(0)));
    const seen = new Set(Array.from({ length: DAILY_HEISTS.length }, (_, i) => dailyFor(day(i)).seed));
    expect(seen.size).toBe(DAILY_HEISTS.length);
  });
});
