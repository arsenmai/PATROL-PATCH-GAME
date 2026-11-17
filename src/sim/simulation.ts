import { CURSES, LOCKDOWN_TURNS, guardMods } from './curses';
import { DELTA, add, eq, isWalkable, manhattan } from './grid';
import { moveGuard, senseGuard } from './guard';
import { DEFAULT_RULES, rulesFor } from './patch';
import type { Action, ArtifactDef, GameEvent, GameState, Guard, Level, Patch, StepResult } from './types';

export function createInitialState(level: Level, patch: Patch | null = null): GameState {
  return {
    turn: 0,
    player: { ...level.start },
    status: 'PLAYING',
    loot: 0,
    taken: [],
    curses: [],
    lockdownAt: null,
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
 * What pressing E would do right now: grab loot under the player, hack the terminal next to them,
 * or leave through the exit. Null when there is nothing to interact with.
 */
export function interactionAt(level: Level, state: GameState): Interaction | null {
  for (const artifact of level.artifacts) {
    if (state.taken.includes(artifact.id)) continue;
    const reachable = artifact.terminal ? manhattan(state.player, artifact.pos) === 1 : eq(state.player, artifact.pos);
    if (reachable) return { kind: 'STEAL', artifact };
  }
  return eq(state.player, level.start) ? { kind: 'EXIT' } : null;
}

/**
 * The single source of truth for game rules. Pure: never mutates its input,
 * uses no randomness and no clock, so (state, action) always yields the same result.
 *
 * Turn order:
 *   1. player acts (invalid actions consume no turn); stealing triggers its countermeasure immediately
 *   2. guards move in id order, capture is checked after every step
 *   3. guards perceive and switch FSM state
 *   4. a running lockdown seals the exit when its timer runs out
 */
export function step(level: Level, state: GameState, action: Action): StepResult {
  if (state.status !== 'PLAYING') return { state, events: [], advanced: false };

  const turn = state.turn + 1;
  const events: GameEvent[] = [];
  let player = state.player;
  let { loot, taken, curses, lockdownAt } = state;
  let guards = state.guards;

  if (action === 'INTERACT') {
    const interaction = interactionAt(level, state);
    if (!interaction) {
      return { state, events: [{ turn: state.turn, kind: 'BLOCKED', text: 'Nothing to interact with here' }], advanced: false };
    }
    if (interaction.kind === 'EXIT') {
      events.push({ turn, kind: 'ESCAPED', text: loot > 0 ? `Extracted with £${loot}` : 'Extracted empty-handed' });
      return { state: { ...state, turn, status: 'ESCAPED' }, events, advanced: true };
    }

    const { artifact } = interaction;
    loot += artifact.value;
    taken = [...taken, artifact.id];
    events.push({ turn, kind: 'LOOT', text: `Stole ${artifact.name} (+£${artifact.value})` });

    if (artifact.curse) {
      curses = [...curses, artifact.curse];
      events.push({ turn, kind: 'CURSE', text: `${CURSES[artifact.curse].name}: ${CURSES[artifact.curse].summary}` });
      if (artifact.curse === 'LOCKDOWN') lockdownAt = turn + LOCKDOWN_TURNS;
      if (artifact.curse === 'ROLLBACK') {
        guards = guards.map((g) => ({ ...g, rules: { ...DEFAULT_RULES }, hacked: false }));
      }
    }
  } else if (action !== 'WAIT') {
    const next = add(player, DELTA[action]);
    if (!isWalkable(level, next)) {
      return { state, events: [{ turn: state.turn, kind: 'BLOCKED', text: 'Path blocked' }], advanced: false };
    }
    player = next;
  }

  const mods = guardMods({ curses });
  const moved = guards.map(cloneGuard);
  let caughtBy = moved.find((g) => eq(g.pos, player))?.id ?? null;

  if (!caughtBy) {
    for (let i = 0; i < moved.length; i++) {
      if (moveGuard(level, level.guards[i], moved[i], player, turn, events, mods)) {
        caughtBy = moved[i].id;
        break;
      }
    }
  }

  const base = { turn, player, guards: moved, loot, taken, curses, lockdownAt };

  if (caughtBy) {
    events.push({ turn, kind: 'CAUGHT', guardId: caughtBy, text: `${caughtBy} apprehended the intruder` });
    return { state: { ...base, status: 'CAUGHT' }, events, advanced: true };
  }

  moved.forEach((g, i) => senseGuard(level, level.guards[i], g, player, turn, events, mods));

  if (lockdownAt !== null && turn >= lockdownAt) {
    events.push({ turn, kind: 'TRAPPED', text: 'Lockdown complete — the exit is sealed' });
    return { state: { ...base, status: 'TRAPPED' }, events, advanced: true };
  }

  return { state: { ...base, status: 'PLAYING' }, events, advanced: true };
}
