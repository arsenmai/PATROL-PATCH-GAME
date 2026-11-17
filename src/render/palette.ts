import type { CurseId, GuardState } from '../sim/types';

/** One palette shared by the 3D scene, the 2D comparison maps and the CSS. */
export const COLORS = {
  bg: 0x05070d,
  // Museum: dark polished marble underfoot, pale stone walls, brass trim.
  floor: 0x17141f,
  floorAlt: 0x211c2b,
  wall: 0x4a4560,
  wallTop: 0x6b6585,
  brass: 0xffc65c,
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

/** Colour of an artifact, by the curse bound to it. */
export const CURSE_COLOR: Record<CurseId | 'NONE', number> = {
  NONE: 0xd8f4ff,
  SIGHT: 0xffd166,
  PURSUIT: COLORS.red,
  HOURGLASS: COLORS.purple,
};

export const css = (hex: number): string => '#' + hex.toString(16).padStart(6, '0');
