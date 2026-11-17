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

/** A security countermeasure wired to a prototype. Stealing the prototype triggers it for the rest of the run. */
export type CurseId = 'OVERCLOCK' | 'SENSOR_BOOST' | 'ROLLBACK' | 'LOCKDOWN';

export interface ArtifactDef {
  id: string;
  name: string;
  /** Loot value in pounds. */
  value: number;
  curse: CurseId | null;
  pos: Vec;
  /** The vault terminal is solid and is hacked from an adjacent tile; other loot is grabbed from its own tile. */
  terminal?: boolean;
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
  /** Player start, which is also the extraction point. */
  start: Vec;
  terminal: Vec;
  door: Vec | null;
  guards: GuardDef[];
  artifacts: ArtifactDef[];
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

export type Status = 'PLAYING' | 'CAUGHT' | 'TRAPPED' | 'ESCAPED';

export interface GameState {
  turn: number;
  player: Vec;
  guards: Guard[];
  status: Status;
  /** Value of everything carried. Only banked by escaping. */
  loot: number;
  /** Ids of stolen artifacts, in the order they were taken. */
  taken: string[];
  /** Countermeasures triggered so far. */
  curses: CurseId[];
  /** Turn on which the exit seals, once LOCKDOWN has been triggered. */
  lockdownAt: number | null;
}

export type EventKind = 'DETECTED' | 'LOST' | 'STATE' | 'CAUGHT' | 'TRAPPED' | 'ESCAPED' | 'LOOT' | 'CURSE' | 'BLOCKED';

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
