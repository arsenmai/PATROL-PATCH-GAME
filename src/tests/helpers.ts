import { parseLevel } from '../sim/level';
import type { Action, GameState, Level, Vec } from '../sim/types';
import { step } from '../sim/simulation';

/**
 * Small test arena. A sentry stands at (8,1) looking west down the top corridor.
 * Row 3 is hidden from the sentry by the wall in row 2.
 */
export const ARENA: Level = parseLevel(
  'ARENA',
  ['##########', '#P.......#', '#.####.#.#', '#......#T#', '##########'],
  [{ id: 'S1', name: 'SENTRY', start: { x: 8, y: 1 }, facing: 'W', range: 4, route: [{ x: 8, y: 1, face: 'W' }] }],
);

/** Moves the player without consuming a turn. Only used to set up scenarios. */
export const teleport = (state: GameState, to: Vec): GameState => ({ ...state, player: { ...to } });

export function run(level: Level, state: GameState, actions: Action[]): GameState {
  for (const a of actions) state = step(level, state, a).state;
  return state;
}
