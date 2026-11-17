import type { GuardRules, Level, Patch, RuleSlot } from './types';

export const DEFAULT_RULES: Readonly<GuardRules> = {
  onDetect: 'CHASE',
  onLostSight: 'INVESTIGATE',
  onInvestigateEnd: 'RETURN',
};

export interface RuleOption {
  value: string;
  summary: string;
}

export interface RuleSpec {
  slot: RuleSlot;
  trigger: string;
  options: RuleOption[];
}

/** The rule table shown in the Guard AI Editor. The first option of each slot is the factory default. */
export const RULE_SPECS: readonly RuleSpec[] = [
  {
    slot: 'onDetect',
    trigger: 'WHEN PLAYER DETECTED',
    options: [
      { value: 'CHASE', summary: 'Sprint (2 tiles/turn) at the intruder, tracking them live.' },
      { value: 'INVESTIGATE', summary: 'Walk to the spot where the intruder was first seen. Target is not updated.' },
    ],
  },
  {
    slot: 'onLostSight',
    trigger: 'WHEN SIGHT IS LOST',
    options: [
      { value: 'INVESTIGATE', summary: 'Walk to the last known position.' },
      { value: 'RETURN', summary: 'Give up at once and head back to the patrol route.' },
    ],
  },
  {
    slot: 'onInvestigateEnd',
    trigger: 'WHEN INVESTIGATION ENDS',
    options: [
      { value: 'RETURN', summary: 'Head back to the patrol route.' },
      { value: 'SWEEP', summary: 'Hold position and scan all four directions before returning.' },
    ],
  },
];

export function isValidPatch(level: Level, patch: Patch): boolean {
  const spec = RULE_SPECS.find((s) => s.slot === patch.slot);
  return (
    level.guards.some((g) => g.id === patch.guardId) &&
    !!spec &&
    spec.options.some((o) => o.value === patch.value) &&
    DEFAULT_RULES[patch.slot] !== patch.value
  );
}

/** Rules a guard runs with, given the (optional) active patch. */
export function rulesFor(guardId: string, patch: Patch | null): GuardRules {
  const rules: GuardRules = { ...DEFAULT_RULES };
  if (patch && patch.guardId === guardId) {
    (rules as unknown as Record<string, string>)[patch.slot] = patch.value;
  }
  return rules;
}

/** Every legal single patch for a level. Used by the solver tests. */
export function allPatches(level: Level): Patch[] {
  const out: Patch[] = [];
  for (const g of level.guards) {
    for (const spec of RULE_SPECS) {
      for (const o of spec.options.slice(1)) out.push({ guardId: g.id, slot: spec.slot, value: o.value });
    }
  }
  return out;
}

export type ApplyResult = { ok: true } | { ok: false; reason: string };

/**
 * Holds the player's hacking budget: exactly one rule on one guard per attempt.
 */
export class PatchSystem {
  static readonly BUDGET = 1;
  private patch: Patch | null = null;

  constructor(private readonly level: Level) {}

  get current(): Patch | null {
    return this.patch;
  }

  get remaining(): number {
    return this.patch ? 0 : PatchSystem.BUDGET;
  }

  apply(patch: Patch): ApplyResult {
    if (this.patch) return { ok: false, reason: 'Patch budget exhausted. Revert the active patch first.' };
    if (!isValidPatch(this.level, patch)) return { ok: false, reason: 'Unknown guard or rule value.' };
    this.patch = { ...patch };
    return { ok: true };
  }

  /** Restores factory configuration on every guard. */
  reset(): void {
    this.patch = null;
  }
}
