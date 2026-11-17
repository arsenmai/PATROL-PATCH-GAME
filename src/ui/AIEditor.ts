import { DEFAULT_RULES, PatchSystem, RULE_SPECS } from '../sim/patch';
import type { GameState, Level, Patch } from '../sim/types';
import { STATE_COLOR, css } from '../render/palette';
import { h } from './dom';
import { sfx } from './sfx';

export interface EditorCallbacks {
  onSelectGuard(id: string): void;
  onPatchChanged(): void;
}

/**
 * GUARD AI EDITOR — a block-style view of each guard's three decision rules.
 * It talks to PatchSystem only; the simulation reads the resulting patch when a mission starts.
 */
export class AIEditor {
  readonly el = h('section', { class: 'editor' });
  private selected: string;
  private pending: Patch | null = null;
  private message = '';
  private locked = false;
  private live: GameState | null = null;
  private justPatched = false;

  constructor(
    private readonly level: Level,
    private readonly patches: PatchSystem,
    private readonly callbacks: EditorCallbacks,
  ) {
    this.selected = level.guards[0].id;
    this.render();
  }

  get selectedGuard(): string {
    return this.selected;
  }

  /** Locked = mission in progress: rules are read-only and live FSM states are shown. */
  setLocked(locked: boolean): void {
    this.locked = locked;
    this.pending = null;
    this.message = '';
    this.render();
  }

  setLiveState(state: GameState | null): void {
    this.live = state;
    this.render();
  }

  refresh(): void {
    this.pending = null;
    this.message = '';
    this.render();
  }

  private choose(slot: Patch['slot'], value: string): void {
    if (this.locked) return;
    sfx.click();
    const active = this.patches.current;
    if (DEFAULT_RULES[slot] === value) {
      this.pending = null;
      this.message = '';
    } else if (active) {
      this.message = 'Patch budget exhausted — revert the active patch to try another rule.';
    } else {
      this.pending = { guardId: this.selected, slot, value };
      this.message = '';
    }
    this.render();
  }

  private apply(): void {
    if (!this.pending) return;
    const result = this.patches.apply(this.pending);
    if (result.ok) {
      sfx.patch();
      this.pending = null;
      this.message = '';
      this.justPatched = true;
      this.callbacks.onPatchChanged();
    } else {
      this.message = result.reason;
    }
    this.render();
  }

  private revert(): void {
    sfx.click();
    this.patches.reset();
    this.pending = null;
    this.message = '';
    this.callbacks.onPatchChanged();
    this.render();
  }

  private render(): void {
    const active = this.patches.current;
    const guardDef = this.level.guards.find((g) => g.id === this.selected)!;

    const tabs = h(
      'div',
      { class: 'tabs' },
      ...this.level.guards.map((g) => {
        const liveGuard = this.live?.guards.find((x) => x.id === g.id);
        return h(
          'button',
          {
            class: `tab${g.id === this.selected ? ' active' : ''}${active?.guardId === g.id ? ' hacked' : ''}`,
            onclick: () => {
              sfx.click();
              this.selected = g.id;
              if (this.pending && this.pending.guardId !== g.id) this.pending = null;
              this.callbacks.onSelectGuard(g.id);
              this.render();
            },
          },
          h('span', { class: 'tab-name' }, g.name),
          liveGuard
            ? h('span', { class: 'chip', style: `--c:${css(STATE_COLOR[liveGuard.state])}` }, liveGuard.state)
            : h('span', { class: 'chip dim' }, g.route.length > 1 ? 'PATROL UNIT' : 'SENTRY UNIT'),
        );
      }),
    );

    const rules = RULE_SPECS.map((spec) => {
      const patchedHere = active && active.guardId === this.selected && active.slot === spec.slot ? active.value : null;
      const pendingHere = this.pending && this.pending.slot === spec.slot ? this.pending.value : null;
      const current = pendingHere ?? patchedHere ?? DEFAULT_RULES[spec.slot];
      const chosen = spec.options.find((o) => o.value === current)!;

      return h(
        'div',
        { class: `rule${patchedHere ? ' patched' : ''}${pendingHere ? ' pending' : ''}${patchedHere && this.justPatched ? ' flash' : ''}` },
        h(
          'div',
          { class: 'rule-head' },
          h('span', { class: 'kw' }, 'IF'),
          h('span', { class: 'trigger' }, spec.trigger.replace('WHEN ', '')),
          patchedHere ? h('span', { class: 'badge ok' }, 'PATCHED') : pendingHere ? h('span', { class: 'badge warn' }, 'STAGED') : null,
        ),
        h(
          'div',
          { class: 'rule-body' },
          h('span', { class: 'kw' }, 'DO'),
          ...spec.options.map((o, i) =>
            h(
              'button',
              {
                class: `opt${o.value === current ? ' on' : ''}`,
                disabled: this.locked,
                title: o.summary,
                onclick: () => this.choose(spec.slot, o.value),
              },
              o.value,
              i === 0 ? h('small', {}, 'factory') : null,
            ),
          ),
        ),
        h('p', { class: 'rule-desc' }, chosen.summary),
      );
    });
    this.justPatched = false;

    const budget = h(
      'div',
      { class: 'budget' },
      h('span', {}, 'PATCHES AVAILABLE'),
      h('strong', { class: this.patches.remaining ? 'ok' : 'spent' }, `${this.patches.remaining} / ${PatchSystem.BUDGET}`),
    );

    const actions = this.locked
      ? null
      : h(
          'div',
          { class: 'editor-actions' },
          h('button', { class: 'btn primary', disabled: !this.pending, onclick: () => this.apply() }, '⚡ APPLY PATCH'),
          h('button', { class: 'btn ghost', disabled: !active, onclick: () => this.revert() }, 'REVERT'),
        );

    const parts: (HTMLElement | null)[] = [
      h(
        'header',
        { class: 'panel-title' },
        h('span', {}, 'GUARD AI EDITOR'),
        this.locked ? h('span', { class: active ? 'badge ok' : 'badge' }, active ? 'HACK ACTIVE' : 'NO HACK') : null,
      ),
      budget,
      tabs,
      h('div', { class: 'unit-line' }, `${guardDef.name}.behaviour  //  range ${guardDef.range}, fov 90°`),
      ...rules,
      this.message ? h('p', { class: 'editor-msg' }, this.message) : null,
      actions,
    ];
    this.el.replaceChildren(...parts.filter((p): p is HTMLElement => p !== null));
  }
}
