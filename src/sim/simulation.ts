import { DELTA, add, eq, isWalkable, manhattan } from './grid';
import { moveGuard, senseGuard } from './guard';
import { rulesFor } from './patch';
import type { Action, GameEvent, GameState, Guard, Level, Patch, StepResult } from './types';

export function createInitialState(level: Level, patch: Patch | null = null): GameState {
  return {
    turn: 0,
    player: { ...level.start },
    status: 'PLAYING',
    guards: level.guards.map(
      (def): Guard => ({
        id: def.id,
        pos: { ...def.start },
        facing: def.facing,
        state: 'PATROL',
        routeIndex: 0,
        target: null,
        lastKnown: null,
        sweepLeft: 0,
        seesPlayer: false,
        rules: rulesFor(def.id, patch),
        hacked: patch?.guardId === def.id,
      }),
    ),
  };
}

const cloneGuard = (g: Guard): Guard => ({
  ...g,
  pos: { ...g.pos },
  target: g.target ? { ...g.target } : null,
  lastKnown: g.lastKnown ? { ...g.lastKnown } : null,
});

export const canInteract = (level: Level, state: GameState): boolean => manhattan(state.player, level.terminal) === 1;

/**
 * The single source of truth for game rules. Pure: never mutates its input,
 * uses no randomness and no clock, so (state, action) always yields the same result.
 *
 * Turn order:
 *   1. player acts (invalid actions consume no turn)
 *   2. guards move in id order, capture is checked after every step
 *   3. guards perceive and switch FSM state
 */
export function step(level: Level, state: GameState, action: Action): StepResult {
  if (state.status !== 'PLAYING') return { state, events: [], advanced: false };

  const turn = state.turn + 1;
  const events: GameEvent[] = [];
  let player = state.player;

  if (action === 'INTERACT') {
    if (!canInteract(level, state)) {
      return { state, events: [{ turn: state.turn, kind: 'BLOCKED', text: 'No terminal within reach' }], advanced: false };
    }
    events.push({ turn, kind: 'SUCCESS', text: 'Terminal breached — data extracted' });
    return { state: { ...state, turn, status: 'SUCCESS' }, events, advanced: true };
  }

  if (action !== 'WAIT') {
    const next = add(player, DELTA[action]);
    if (!isWalkable(level, next)) {
      return { state, events: [{ turn: state.turn, kind: 'BLOCKED', text: 'Path blocked' }], advanced: false };
    }
    player = next;
  }

  const guards = state.guards.map(cloneGuard);
  let caughtBy = guards.find((g) => eq(g.pos, player))?.id ?? null;

  if (!caughtBy) {
    for (let i = 0; i < guards.length; i++) {
      if (moveGuard(level, level.guards[i], guards[i], player, turn, events)) {
        caughtBy = guards[i].id;
        break;
      }
    }
  }

  if (caughtBy) {
    events.push({ turn, kind: 'CAUGHT', guardId: caughtBy, text: `${caughtBy} apprehended the intruder` });
    return { state: { turn, player, guards, status: 'CAUGHT' }, events, advanced: true };
  }

  guards.forEach((g, i) => senseGuard(level, level.guards[i], g, player, turn, events));
  return { state: { turn, player, guards, status: 'PLAYING' }, events, advanced: true };
}
