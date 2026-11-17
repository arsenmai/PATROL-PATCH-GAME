import type { GuardMods } from './guard';
import type { CurseId, GameState } from './types';

/**
 * Data-driven curse table. A curse is nothing but a set of modifiers on shared security parameters;
 * the simulation reads these numbers and has no per-artifact code paths.
 *
 * Curses are deliberately separate from the player's AI patch: a patch rewrites one guard's decision rule,
 * a curse changes parameters every guard shares. Neither can overwrite the other.
 */
export interface CurseSpec {
  id: CurseId;
  name: string;
  /** A few words for the price tag floating over the artifact. */
  short: string;
  /** Shown in the "artifact stolen" toast. */
  headline: string;
  summary: string;
  /** Multiplies every guard's detection range. */
  rangeMultiplier?: number;
  /** Every guard takes one extra step on every Nth turn (N = 5 is +20% speed). */
  surgeEvery?: number;
  /** Turns removed from the mission clock, once. */
  turnPenalty?: number;
}

export const CURSES: Record<CurseId, CurseSpec> = {
  SIGHT: {
    id: 'SIGHT',
    name: 'CURSE OF SIGHT',
    short: '+25% guard sight',
    headline: 'GUARD DETECTION RANGE INCREASED',
    summary: 'Guards see 25% further.',
    rangeMultiplier: 1.25,
  },
  PURSUIT: {
    id: 'PURSUIT',
    name: 'CURSE OF PURSUIT',
    short: '+20% guard speed',
    headline: 'GUARD SPEED INCREASED',
    summary: 'Guards are 20% faster: an extra step every 5th turn.',
    surgeEvery: 5,
  },
  HOURGLASS: {
    id: 'HOURGLASS',
    name: 'CURSE OF THE HOURGLASS',
    short: '−10 turns',
    headline: 'MISSION TIME REDUCED',
    summary: 'The museum locks down 10 turns sooner.',
    turnPenalty: 10,
  },
};

/** Period of the speed surge, or 0 when no speed curse is active. */
export function surgePeriod(curses: readonly CurseId[]): number {
  let period = 0;
  for (const id of curses) {
    const every = CURSES[id].surgeEvery;
    if (every && (period === 0 || every < period)) period = every;
  }
  return period;
}

/** The shared security parameters in force on a given turn. */
export function guardMods(curses: readonly CurseId[], turn: number): GuardMods {
  let rangeMultiplier = 1;
  for (const id of curses) rangeMultiplier *= CURSES[id].rangeMultiplier ?? 1;
  const period = surgePeriod(curses);
  return { rangeMultiplier, speedBonus: period > 0 && turn % period === 0 ? 1 : 0 };
}

/** Parameters used to draw detection cones for a state (what guards will see with on their next sense). */
export const sightMultiplier = (state: Pick<GameState, 'curses'>): number => guardMods(state.curses, 1).rangeMultiplier;

export const turnsLeft = (state: Pick<GameState, 'deadline' | 'turn'>): number => Math.max(0, state.deadline - state.turn);

/** Turns until the next speed surge, or null when no speed curse is active. */
export function turnsToSurge(state: Pick<GameState, 'curses' | 'turn'>): number | null {
  const period = surgePeriod(state.curses);
  return period === 0 ? null : period - (state.turn % period);
}
