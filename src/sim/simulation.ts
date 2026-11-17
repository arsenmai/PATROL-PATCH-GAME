import { CURSES, guardMods } from './curses';
import { DELTA, add, eq, isWalkable, manhattan } from './grid';
import { moveGuard, senseGuard } from './guard';
import { rulesFor } from './patch';
import type { Action, ArtifactDef, GameEvent, GameState, Guard, Level, Patch, StepResult } from './types';

export function createInitialState(level: Level, patch: Patch | null = null): GameState {
  return {
    turn: 0,
    player: { ...level.start },
    status: 'PLAYING',
    loot: 0,
    taken: [],
    curses: [],
    deadline: level.turnLimit,
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

export type Interaction = { kind: 'STEAL'; artifact: ArtifactDef } | { kind: 'EXIT' };

/**
 * What pressing E would do right now: grab the artifact under the player, open the sealed case next to them,
 * or leave through the extraction point (only with at least one artifact in the bag).
 * Null when there is nothing to interact with.
 */
export function interactionAt(level: Level, state: GameState): Interaction | null {
  for (const artifact of level.artifacts) {
    if (state.taken.includes(artifact.id)) continue;
    const reachable = artifact.sealed ? manhattan(state.player, artifact.pos) === 1 : eq(state.player, artifact.pos);
    if (reachable) return { kind: 'STEAL', artifact };
  }
  return eq(state.player, level.start) && state.taken.length > 0 ? { kind: 'EXIT' } : null;
}

/**
 * The single source of truth for game rules. Pure: never mutates its input,
 * uses no randomness and no clock, so (state, action) always yields the same result.
 *
 * Turn order:
 *   1. player acts (invalid actions consume no turn); stealing triggers the artifact's curse immediately
 *   2. guards move in id order, capture is checked after every step
 *   3. guards perceive and switch FSM state
 *   4. the museum locks down when the mission clock runs out
 */
export function step(level: Level, state: GameState, action: Action): StepResult {
  if (state.status !== 'PLAYING') return { state, events: [], advanced: false };

  const turn = state.turn + 1;
  const events: GameEvent[] = [];
  let player = state.player;
  let { loot, taken, curses, deadline } = state;

  if (action === 'INTERACT') {
    const interaction = interactionAt(level, state);
    if (!interaction) {
      return { state, events: [{ turn: state.turn, kind: 'BLOCKED', text: 'Nothing to interact with here' }], advanced: false };
    }
    if (interaction.kind === 'EXIT') {
      events.push({ turn, kind: 'ESCAPED', text: `Extracted with ${loot} loot` });
      return { state: { ...state, turn, status: 'ESCAPED' }, events, advanced: true };
    }

    const { artifact } = interaction;
    loot += artifact.value;
    taken = [...taken, artifact.id];
    events.push({ turn, kind: 'LOOT', text: `Stole ${artifact.name} (+${artifact.value})` });

    // A curse can only ever be applied once, even if two artifacts were to share it.
    if (artifact.curse && !curses.includes(artifact.curse)) {
      const curse = CURSES[artifact.curse];
      curses = [...curses, artifact.curse];
      deadline -= curse.turnPenalty ?? 0;
      events.push({ turn, kind: 'CURSE', text: `${curse.name}: ${curse.summary}` });
    }
  } else if (action !== 'WAIT') {
    const next = add(player, DELTA[action]);
    if (!isWalkable(level, next)) {
      return { state, events: [{ turn: state.turn, kind: 'BLOCKED', text: 'Path blocked' }], advanced: false };
    }
    player = next;
  }

  const mods = guardMods(curses, turn);
  const moved = state.guards.map(cloneGuard);
  let caughtBy = moved.find((g) => eq(g.pos, player))?.id ?? null;

  if (!caughtBy) {
    for (let i = 0; i < moved.length; i++) {
      if (moveGuard(level, level.guards[i], moved[i], player, turn, events, mods)) {
        caughtBy = moved[i].id;
        break;
      }
    }
  }

  const base = { turn, player, guards: moved, loot, taken, curses, deadline };

  if (caughtBy) {
    events.push({ turn, kind: 'CAUGHT', guardId: caughtBy, text: `${caughtBy} apprehended the intruder` });
    return { state: { ...base, status: 'CAUGHT' }, events, advanced: true };
  }

  moved.forEach((g, i) => senseGuard(level, level.guards[i], g, player, turn, events, mods));

  if (turn >= deadline) {
    events.push({ turn, kind: 'TIMEOUT', text: 'Time is up — the museum is locked down' });
    return { state: { ...base, status: 'TIMEOUT' }, events, advanced: true };
  }

  return { state: { ...base, status: 'PLAYING' }, events, advanced: true };
}
