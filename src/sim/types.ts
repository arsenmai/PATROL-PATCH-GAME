/** Core data types for the PATROL PATCH simulation. No rendering imports allowed here. */

export interface Vec {
  x: number;
  y: number;
}

export type Dir = 'N' | 'E' | 'S' | 'W';

/** Everything the player can do in one turn. */
export type Action = Dir | 'WAIT' | 'INTERACT';

export type GuardState = 'PATROL' | 'INVESTIGATE' | 'CHASE' | 'RETURN';

/** The three patchable decision rules of a guard. */
export interface GuardRules {
  /** What to do the moment the player becomes visible. */
  onDetect: 'CHASE' | 'INVESTIGATE';
  /** What to do when a chased player drops out of sight. */
  onLostSight: 'INVESTIGATE' | 'RETURN';
  /** What to do after reaching the investigation point. */
  onInvestigateEnd: 'RETURN' | 'SWEEP';
}

export type RuleSlot = keyof GuardRules;

export interface Patch {
  guardId: string;
  slot: RuleSlot;
  value: string;
}

export interface Waypoint extends Vec {
  /** Facing the guard snaps to when it arrives here (used for sentry posts). */
  face?: Dir;
}

export interface GuardDef {
  id: string;
  name: string;
  start: Vec;
  facing: Dir;
  route: Waypoint[];
  /** Detection range in tiles (euclidean). Field of view is always 90 degrees. */
  range: number;
}

export interface Decor {
  type: 'camera' | 'console' | 'tank';
  x: number;
  y: number;
}

export interface Level {
  name: string;
  width: number;
  height: number;
  /** Normalised rows: '#' wall, '.' floor, 'T' terminal. */
  tiles: string[];
  start: Vec;
  terminal: Vec;
  door: Vec | null;
  guards: GuardDef[];
  decor: Decor[];
}

export interface Guard {
  id: string;
  pos: Vec;
  facing: Dir;
  state: GuardState;
  /** Index of the waypoint the guard is currently walking to. */
  routeIndex: number;
  /** Fixed destination of the current investigation. */
  target: Vec | null;
  /** Live player position while chasing. */
  lastKnown: Vec | null;
  sweepLeft: number;
  seesPlayer: boolean;
  rules: GuardRules;
  hacked: boolean;
}

export type Status = 'PLAYING' | 'CAUGHT' | 'SUCCESS';

export interface GameState {
  turn: number;
  player: Vec;
  guards: Guard[];
  status: Status;
}

export type EventKind = 'DETECTED' | 'LOST' | 'STATE' | 'CAUGHT' | 'SUCCESS' | 'BLOCKED';

export interface GameEvent {
  turn: number;
  kind: EventKind;
  guardId?: string;
  text: string;
}

export interface StepResult {
  state: GameState;
  events: GameEvent[];
  /** False when the action was invalid and no turn was consumed. */
  advanced: boolean;
}
