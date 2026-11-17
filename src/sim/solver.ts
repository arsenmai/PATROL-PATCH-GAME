import { eq } from './grid';
import { createInitialState, interactionAt, step } from './simulation';
import type { Action, Dir, GameState, GuardState, Level, Patch, Vec } from './types';

const ACTIONS: readonly Action[] = ['N', 'E', 'S', 'W', 'WAIT', 'INTERACT'];
const FACING: Record<Dir, number> = { N: 0, E: 1, S: 2, W: 3 };
const FSM: Record<GuardState, number> = { PATROL: 0, INVESTIGATE: 1, CHASE: 2, RETURN: 3 };

/**
 * Compact fingerprint of everything that can influence the future of a state, except the lockdown timer
 * (handled separately by dominance) and the absolute turn number.
 */
export function stateKey(level: Level, s: GameState): string {
  const cell = (p: Vec | null): number => (p ? p.y * level.width + p.x + 1 : 0);
  let mask = 0;
  level.artifacts.forEach((a, i) => {
    if (s.taken.includes(a.id)) mask |= 1 << i;
  });
  const codes: number[] = [cell(s.player), mask];
  for (const g of s.guards) {
    codes.push(
      cell(g.pos),
      FACING[g.facing] | (FSM[g.state] << 2) | (g.sweepLeft << 4) | ((g.hacked ? 1 : 0) << 7) | (g.routeIndex << 8),
      cell(g.target),
      g.state === 'CHASE' ? cell(g.lastKnown) : 0,
    );
  }
  return String.fromCharCode(...codes);
}

export interface Solution {
  /** Loot carried out through the exit. */
  loot: number;
  /** Ids of the stolen artifacts, in order. */
  taken: string[];
  /** Shortest action sequence found that achieves `loot`, ending with the extraction. */
  actions: Action[];
  explored: number;
}

/**
 * Exhaustive breadth-first search over the full game state space, driven by the real `step` function.
 * Returns the richest possible escape. Leaving at once with £0 is always possible.
 *
 * Two things keep it tractable:
 *  - states are deduplicated by a compact fingerprint;
 *  - a state with a running lockdown is only revisited if it has strictly more time left than before
 *    (more time is never worse, so the slower copy is dominated).
 */
export function solve(level: Level, patch: Patch | null, maxTurns = 150): Solution {
  const start = createInitialState(level, patch);
  const parents: number[] = [-1];
  const via: number[] = [-1];
  const states: (GameState | null)[] = [start];
  const timeLeft = (s: GameState): number => (s.lockdownAt === null ? 1e9 : s.lockdownAt - s.turn);
  const seen = new Map<string, number>([[stateKey(level, start), timeLeft(start)]]);
  let best = { index: 0, loot: 0, taken: [] as string[] };

  for (let head = 0; head < states.length; head++) {
    const state = states[head] as GameState;
    states[head] = null; // expanded: release it, only the frontier stays in memory
    if (eq(state.player, level.start) && state.loot > best.loot) best = { index: head, loot: state.loot, taken: state.taken };
    if (state.turn >= maxTurns) continue;

    const canSteal = interactionAt(level, state)?.kind === 'STEAL';
    for (let a = 0; a < ACTIONS.length; a++) {
      if (ACTIONS[a] === 'INTERACT' && !canSteal) continue;
      const result = step(level, state, ACTIONS[a]);
      if (!result.advanced || result.state.status !== 'PLAYING') continue;
      const key = stateKey(level, result.state);
      const left = timeLeft(result.state);
      const known = seen.get(key);
      if (known !== undefined && known >= left) continue;
      seen.set(key, left);
      parents.push(head);
      via.push(a);
      states.push(result.state);
    }
  }

  const actions: Action[] = ['INTERACT'];
  for (let i = best.index; parents[i] >= 0; i = parents[i]) actions.push(ACTIONS[via[i]]);
  return { loot: best.loot, taken: best.taken, actions: actions.reverse(), explored: parents.length };
}
