import { canInteract, createInitialState, step } from './simulation';
import type { Action, GameState, Level, Patch } from './types';

const ACTIONS: readonly Action[] = ['N', 'E', 'S', 'W', 'WAIT'];

/** Everything that can influence the future of a state (turn number excluded on purpose). */
export function stateKey(s: GameState): string {
  let k = `${s.player.x},${s.player.y}`;
  for (const g of s.guards) {
    k += `|${g.pos.x},${g.pos.y},${g.facing},${g.state},${g.routeIndex},${g.sweepLeft}`;
    k += g.target ? `,t${g.target.x},${g.target.y}` : ',t-';
    k += g.lastKnown && g.state === 'CHASE' ? `,k${g.lastKnown.x},${g.lastKnown.y}` : ',k-';
  }
  return k;
}

export interface Solution {
  actions: Action[];
  explored: number;
}

/**
 * Exhaustive breadth-first search over the full game state space, driven by the real `step` function.
 * Returns the shortest winning action sequence, or null if the level cannot be beaten within `maxTurns`.
 */
export function solve(level: Level, patch: Patch | null, maxTurns = 80): Solution | null {
  const start = createInitialState(level, patch);
  const nodes: { state: GameState; parent: number; action: Action | null }[] = [{ state: start, parent: -1, action: null }];
  const seen = new Set<string>([stateKey(start)]);

  const unwind = (index: number, last: Action): Action[] => {
    const out: Action[] = [last];
    for (let i = index; nodes[i].action; i = nodes[i].parent) out.push(nodes[i].action as Action);
    return out.reverse();
  };

  for (let head = 0; head < nodes.length; head++) {
    const { state } = nodes[head];
    if (state.turn >= maxTurns) continue;
    if (canInteract(level, state)) return { actions: unwind(head, 'INTERACT'), explored: nodes.length };

    for (const action of ACTIONS) {
      const result = step(level, state, action);
      if (!result.advanced || result.state.status !== 'PLAYING') continue;
      const key = stateKey(result.state);
      if (seen.has(key)) continue;
      seen.add(key);
      nodes.push({ state: result.state, parent: head, action });
    }
  }
  return null;
}
