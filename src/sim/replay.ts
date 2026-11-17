import { createInitialState, step } from './simulation';
import type { Action, GameEvent, GameState, Level, Patch } from './types';

export interface Replay {
  /** frames[t] is the world after t turns; frames[0] is the initial state. */
  frames: GameState[];
  /** events[t] are the events produced while reaching frames[t]. */
  events: GameEvent[][];
  final: GameState;
}

/** Re-runs a recorded action list through the shared `step` function. */
export function runReplay(level: Level, actions: readonly Action[], patch: Patch | null): Replay {
  let state = createInitialState(level, patch);
  const frames = [state];
  const events: GameEvent[][] = [[]];

  for (const action of actions) {
    if (state.status !== 'PLAYING') break;
    const result = step(level, state, action);
    if (!result.advanced) continue;
    state = result.state;
    frames.push(state);
    events.push(result.events);
  }
  return { frames, events, final: state };
}

export interface Comparison {
  original: Replay;
  patched: Replay;
  /** First turn at which the two worlds differ, or null if they never do. */
  divergedAt: number | null;
  turns: number;
}

const fingerprint = (s: GameState): string =>
  `${s.status}|${s.player.x},${s.player.y}|` + s.guards.map((g) => `${g.pos.x},${g.pos.y},${g.facing},${g.state}`).join('|');

/**
 * Counterfactual replay: same level, same inputs, the patch is the only difference.
 */
export function compareReplays(level: Level, actions: readonly Action[], patch: Patch | null): Comparison {
  const original = runReplay(level, actions, null);
  const patched = runReplay(level, actions, patch);
  const turns = Math.max(original.frames.length, patched.frames.length) - 1;

  let divergedAt: number | null = null;
  for (let t = 0; t <= turns; t++) {
    const a = original.frames[Math.min(t, original.frames.length - 1)];
    const b = patched.frames[Math.min(t, patched.frames.length - 1)];
    if (fingerprint(a) !== fingerprint(b)) {
      divergedAt = t;
      break;
    }
  }
  return { original, patched, divergedAt, turns };
}

/** Records the actions that actually consumed a turn. */
export class ReplayRecorder {
  private log: Action[] = [];
  record(action: Action): void {
    this.log.push(action);
  }
  get actions(): readonly Action[] {
    return this.log;
  }
  clear(): void {
    this.log = [];
  }
}
