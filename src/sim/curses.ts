import type { GuardMods } from './guard';
import type { CurseId, GameState } from './types';

/** Turns between triggering LOCKDOWN and the exit sealing. */
export const LOCKDOWN_TURNS = 22;

export interface CurseSpec {
  id: CurseId;
  name: string;
  summary: string;
}

export const CURSES: Record<CurseId, CurseSpec> = {
  OVERCLOCK: { id: 'OVERCLOCK', name: 'OVERCLOCK', summary: 'Every guard moves +1 tile per turn.' },
  SENSOR_BOOST: { id: 'SENSOR_BOOST', name: 'SENSOR BOOST', summary: 'Every guard sees +2 tiles further.' },
  ROLLBACK: { id: 'ROLLBACK', name: 'ROLLBACK', summary: 'Guard firmware is restored: your patch is erased.' },
  LOCKDOWN: { id: 'LOCKDOWN', name: 'LOCKDOWN', summary: `The exit seals ${LOCKDOWN_TURNS} turns from now.` },
};

/** How the triggered countermeasures change guard behaviour. Pure data read by the FSM. */
export function guardMods(state: Pick<GameState, 'curses'>): GuardMods {
  return {
    speedBonus: state.curses.includes('OVERCLOCK') ? 1 : 0,
    rangeBonus: state.curses.includes('SENSOR_BOOST') ? 2 : 0,
  };
}

/** Turns left before the exit seals, or null when no lockdown is running. */
export const lockdownRemaining = (state: GameState): number | null =>
  state.lockdownAt === null ? null : Math.max(0, state.lockdownAt - state.turn);
