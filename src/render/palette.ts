import type { CurseId, GuardState } from '../sim/types';

/** One palette shared by the 3D scene, the 2D comparison maps and the CSS. */
export const COLORS = {
  bg: 0x05070d,
  floor: 0x141b2b,
  floorAlt: 0x182134,
  wall: 0x2c3b63,
  wallTop: 0x40558a,
  cyan: 0x36e0ff,
  purple: 0x9b6bff,
  magenta: 0xff4fd8,
  green: 0x5dffa0,
  amber: 0xffb347,
  red: 0xff4466,
};

export const STATE_COLOR: Record<GuardState, number> = {
  PATROL: COLORS.cyan,
  INVESTIGATE: COLORS.amber,
  CHASE: COLORS.red,
  RETURN: COLORS.purple,
};

/** Colour of a prototype, by the countermeasure it is wired to. */
export const CURSE_COLOR: Record<CurseId | 'NONE', number> = {
  NONE: 0xd8f4ff,
  OVERCLOCK: COLORS.red,
  SENSOR_BOOST: COLORS.amber,
  ROLLBACK: COLORS.magenta,
  LOCKDOWN: COLORS.purple,
};

export const css = (hex: number): string => '#' + hex.toString(16).padStart(6, '0');
