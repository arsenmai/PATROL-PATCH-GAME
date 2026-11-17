import { canSee } from './detection';
import { dirBetween, eq, rotateCW } from './grid';
import { nextStep } from './pathfinding';
import type { GameEvent, Guard, GuardDef, GuardState, Level, Vec } from './types';

/** Guards sprint while chasing; every other state moves one tile per turn. */
export const CHASE_SPEED = 2;
/** Turns spent scanning when the SWEEP rule is active (one full rotation). */
export const SWEEP_TURNS = 4;

function setState(g: Guard, next: GuardState, turn: number, events: GameEvent[], why: string): void {
  if (g.state === next) return;
  events.push({ turn, kind: 'STATE', guardId: g.id, text: `${g.id}: ${g.state} → ${next} (${why})` });
  g.state = next;
}

function stepToward(level: Level, g: Guard, target: Vec): void {
  const next = nextStep(level, g.pos, target);
  if (!next) return;
  g.facing = dirBetween(g.pos, next) ?? g.facing;
  g.pos = next;
}

function faceToward(g: Guard, target: Vec): void {
  const dx = target.x - g.pos.x;
  const dy = target.y - g.pos.y;
  if (dx === 0 && dy === 0) return;
  if (Math.abs(dx) >= Math.abs(dy)) g.facing = dx > 0 ? 'E' : 'W';
  else g.facing = dy > 0 ? 'S' : 'N';
}

function beginInvestigation(g: Guard, at: Vec): void {
  g.target = { ...at };
  g.sweepLeft = g.rules.onInvestigateEnd === 'SWEEP' ? SWEEP_TURNS : 0;
}

export interface GuardMods {
  /** Extra tiles per turn in every state (OVERCLOCK). */
  speedBonus: number;
  /** Extra detection range (SENSOR_BOOST). */
  rangeBonus: number;
}

export const NO_MODS: GuardMods = { speedBonus: 0, rangeBonus: 0 };

/** One tile of movement (or one beat of waiting) in the current state. Returns false when the turn is over for this guard. */
function act(level: Level, def: GuardDef, g: Guard, player: Vec, range: number, turn: number, events: GameEvent[]): boolean {
  const route = def.route;

  switch (g.state) {
    case 'PATROL': {
      if (eq(g.pos, route[g.routeIndex])) {
        if (route.length === 1) {
          if (route[0].face) g.facing = route[0].face;
          return false;
        }
        g.routeIndex = (g.routeIndex + 1) % route.length;
      }
      stepToward(level, g, route[g.routeIndex]);
      const wp = route[g.routeIndex];
      if (eq(g.pos, wp) && wp.face) g.facing = wp.face;
      return true;
    }

    case 'CHASE': {
      // Live tracking: while the intruder is in view, the target follows them step by step.
      if (canSee(level, g.pos, g.facing, range, player)) g.lastKnown = { ...player };
      if (g.lastKnown) stepToward(level, g, g.lastKnown);
      return true;
    }

    case 'INVESTIGATE': {
      if (g.target && !eq(g.pos, g.target)) {
        stepToward(level, g, g.target);
        return true;
      }
      if (g.sweepLeft > 0) {
        g.facing = rotateCW(g.facing);
        g.sweepLeft--;
      } else {
        g.target = null;
        setState(g, 'RETURN', turn, events, 'investigation over');
      }
      return false;
    }

    case 'RETURN': {
      const wp = route[g.routeIndex];
      stepToward(level, g, wp);
      if (eq(g.pos, wp)) {
        if (wp.face) g.facing = wp.face;
        setState(g, 'PATROL', turn, events, 'back on route');
        return false;
      }
      return true;
    }
  }
}

/**
 * Movement phase of the FSM. Mutates `g` (callers pass a fresh copy).
 * Returns true if the guard stepped onto the player.
 */
export function moveGuard(
  level: Level,
  def: GuardDef,
  g: Guard,
  player: Vec,
  turn: number,
  events: GameEvent[],
  mods: GuardMods = NO_MODS,
): boolean {
  const chasing = g.state === 'CHASE';
  const speed = (chasing ? CHASE_SPEED : 1) + mods.speedBonus;
  const range = def.range + mods.rangeBonus;

  for (let i = 0; i < speed; i++) {
    const keepGoing = act(level, def, g, player, range, turn, events);
    if (eq(g.pos, player)) return true;
    if (!keepGoing) break;
  }
  // A chasing guard keeps its sensors pointed at its target instead of its direction of travel.
  if (chasing && g.lastKnown) faceToward(g, g.lastKnown);
  return false;
}

/**
 * Perception phase of the FSM: decides transitions using the guard's (possibly patched) rules.
 */
export function senseGuard(
  level: Level,
  def: GuardDef,
  g: Guard,
  player: Vec,
  turn: number,
  events: GameEvent[],
  mods: GuardMods = NO_MODS,
): void {
  const sees = canSee(level, g.pos, g.facing, def.range + mods.rangeBonus, player);

  if (sees && !g.seesPlayer) events.push({ turn, kind: 'DETECTED', guardId: g.id, text: `${g.id} spotted the intruder` });
  if (!sees && g.seesPlayer) events.push({ turn, kind: 'LOST', guardId: g.id, text: `${g.id} lost visual contact` });
  g.seesPlayer = sees;

  if (sees) {
    if (g.state === 'CHASE') {
      g.lastKnown = { ...player };
    } else if (g.rules.onDetect === 'CHASE') {
      g.lastKnown = { ...player };
      g.target = null;
      setState(g, 'CHASE', turn, events, 'rule: on detect');
    } else if (g.state !== 'INVESTIGATE') {
      // Patched behaviour: remember where the intruder was *at this moment* and never refresh it.
      g.lastKnown = { ...player };
      beginInvestigation(g, player);
      setState(g, 'INVESTIGATE', turn, events, 'rule: on detect');
    }
  } else if (g.state === 'CHASE') {
    if (g.rules.onLostSight === 'INVESTIGATE' && g.lastKnown) {
      beginInvestigation(g, g.lastKnown);
      setState(g, 'INVESTIGATE', turn, events, 'rule: on lost sight');
    } else {
      setState(g, 'RETURN', turn, events, 'rule: on lost sight');
    }
  }
}
