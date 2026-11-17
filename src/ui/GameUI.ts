import { CURSES, lockdownRemaining } from '../sim/curses';
import { LAB_PROVEN, totalLoot } from '../sim/level';
import type { GameEvent, GameState, Level } from '../sim/types';
import { CURSE_COLOR, css } from '../render/palette';
import { h } from './dom';

export interface UICallbacks {
  onStart(): void;
  onBriefingDone(): void;
  onInfiltrate(): void;
  onRestart(): void;
  onRetry(): void;
  onCompare(): void;
  onMute(): boolean;
}

/** HUD, overlays and the event log. Holds no game rules. */
export class GameUI {
  private readonly turnEl = h('strong', {}, '0');
  private readonly lootEl = h('strong', {}, '£0');
  private readonly lockEl = h('strong', {}, '');
  private readonly lockBox = h('div', { class: 'hud-box small danger' }, h('span', {}, 'EXIT SEALS IN'), this.lockEl);
  private readonly cursesEl = h('div', { class: 'hud-curses' });
  private readonly logEl = h('ul', { class: 'log' });
  private readonly alertEl = h('div', { class: 'alert-banner' }, '⚠ DETECTED');
  private readonly vignette = h('div', { class: 'vignette' });
  private readonly hintEl = h('div', { class: 'hint' });
  private readonly primaryBtn: HTMLButtonElement;
  private readonly restartBtn: HTMLButtonElement;
  private overlay: HTMLElement | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly level: Level,
    stage: HTMLElement,
    panel: HTMLElement,
    editorEl: HTMLElement,
    private readonly cb: UICallbacks,
  ) {
    this.primaryBtn = h('button', { class: 'btn primary wide', onclick: () => cb.onInfiltrate() }, 'START INFILTRATION ▸');
    this.restartBtn = h('button', { class: 'btn ghost wide', onclick: () => cb.onRestart() }, '↺ RESTART / RE-HACK');
    const muteBtn = h('button', { class: 'icon-btn', title: 'Toggle sound' }, '♪');
    muteBtn.addEventListener('click', () => muteBtn.classList.toggle('off', cb.onMute()));

    stage.append(
      this.vignette,
      this.alertEl,
      h(
        'div',
        { class: 'hud-top' },
        h(
          'div',
          { class: 'hud-row' },
          h('div', { class: 'hud-box' }, h('span', {}, 'OBJECTIVE'), h('strong', {}, 'Steal what you dare, then get back to the EXIT')),
          h('div', { class: 'hud-box small' }, h('span', {}, 'TURN'), this.turnEl),
          h('div', { class: 'hud-box small loot' }, h('span', {}, 'CARRYING'), this.lootEl),
          this.lockBox,
        ),
        this.cursesEl,
      ),
      this.hintEl,
    );

    panel.append(
      h('header', { class: 'brand' }, h('div', {}, h('h1', {}, 'PATROL', h('em', {}, 'PATCH')), h('p', {}, 'SECTOR 7 // RESEARCH VAULT')), muteBtn),
      editorEl,
      h('div', { class: 'panel-actions' }, this.primaryBtn, this.restartBtn),
      h('section', { class: 'log-wrap' }, h('header', { class: 'panel-title' }, h('span', {}, 'EVENT LOG')), this.logEl),
    );
  }

  setPhase(phase: 'HACK' | 'PLAY' | 'IDLE'): void {
    this.primaryBtn.style.display = phase === 'HACK' ? '' : 'none';
    this.restartBtn.style.display = phase === 'PLAY' ? '' : 'none';
    this.hintEl.innerHTML =
      phase === 'PLAY'
        ? '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move · <kbd>Space</kbd> wait · <kbd>E</kbd> steal / hack / exit · <kbd>R</kbd> restart · scroll to zoom'
        : phase === 'HACK'
          ? 'Pick a guard, stage one rule change, apply it, then start the infiltration. Tags show each prototype’s price and countermeasure.'
          : '';
  }

  update(state: GameState): void {
    this.turnEl.textContent = String(state.turn);
    this.lootEl.textContent = `£${state.loot}`;
    const left = lockdownRemaining(state);
    this.lockBox.style.display = left === null ? 'none' : '';
    this.lockEl.textContent = left === null ? '' : `${left} turns`;
    this.cursesEl.replaceChildren(
      ...state.curses.map((id) =>
        h('span', { class: 'curse-chip', style: `--c:${css(CURSE_COLOR[id])}`, title: CURSES[id].summary }, `⚠ ${CURSES[id].name}`, h('small', {}, CURSES[id].summary)),
      ),
    );
    const detected = state.status === 'PLAYING' && state.guards.some((g) => g.seesPlayer);
    this.alertEl.classList.toggle('on', detected);
    this.vignette.classList.toggle('on', detected || state.status === 'CAUGHT' || state.status === 'TRAPPED');
  }

  clearLog(): void {
    this.logEl.replaceChildren();
  }

  log(events: GameEvent[] | string): void {
    const items = typeof events === 'string' ? [{ turn: -1, kind: 'INFO', text: events }] : events;
    for (const e of items) {
      if (e.kind === 'BLOCKED') continue;
      this.logEl.prepend(h('li', { class: e.kind.toLowerCase() }, e.turn >= 0 ? h('span', {}, `T${String(e.turn).padStart(2, '0')}`) : null, e.text));
    }
    while (this.logEl.children.length > 40) this.logEl.lastChild?.remove();
  }

  showMenu(): void {
    this.setOverlay(
      h(
        'div',
        { class: 'overlay menu' },
        h(
          'div',
          { class: 'menu-card' },
          h('p', { class: 'eyebrow' }, 'A STEALTH HEIST ABOUT REWRITING ENEMY AI'),
          h('h1', { class: 'logo' }, 'PATROL', h('em', {}, 'PATCH')),
          h('p', { class: 'tagline' }, 'Rewrite one rule. Steal what you dare. Get out before it bites back.'),
          h('button', { class: 'btn primary big', onclick: () => this.cb.onStart() }, 'START MISSION'),
          h('p', { class: 'foot' }, 'Deterministic simulation · finite state machines · counterfactual replay'),
        ),
      ),
    );
  }

  showBriefing(): void {
    this.setOverlay(
      h(
        'div',
        { class: 'overlay' },
        h(
          'div',
          { class: 'card' },
          h('p', { class: 'eyebrow' }, 'MISSION BRIEFING'),
          h('h2', {}, `£${totalLoot(this.level)} of prototypes. How much is enough?`),
          h(
            'p',
            {},
            'The facility is protected by autonomous security robots. You can modify one guard’s AI behaviour before infiltration. Loot only counts if you walk it out through the exit.',
          ),
          h(
            'ol',
            { class: 'steps' },
            h('li', {}, h('b', {}, 'Hack. '), 'Each guard runs three IF → DO rules. You may rewrite exactly one rule on one guard.'),
            h('li', {}, h('b', {}, 'Steal. '), 'Most prototypes are wired to a countermeasure: faster guards, longer sight, a firmware rollback, a lockdown. Each tag shows the price and what it triggers.'),
            h('li', {}, h('b', {}, 'Leave — or push on. '), 'Return to the EXIT whenever you like. Get caught or locked in and you lose everything.'),
            h('li', {}, h('b', {}, 'Compare. '), 'Afterwards, replay your exact moves against the original AI and see where the timelines split.'),
          ),
          h(
            'p',
            { class: 'warn-line' },
            `Intel: the vault terminal is provably out of reach with factory AI. Proven maximum: £${LAB_PROVEN.withoutPatch} without a patch, £${LAB_PROVEN.withBestPatch} with the right one. Chasing guards are twice as fast as you.`,
          ),
          h('button', { class: 'btn primary big', onclick: () => this.cb.onBriefingDone() }, 'OPEN GUARD AI EDITOR ▸'),
        ),
      ),
    );
  }

  showResult(state: GameState, patched: boolean): void {
    const win = state.status === 'ESCAPED';
    const max = LAB_PROVEN.withBestPatch;
    const pct = Math.round((state.loot / max) * 100);

    let title: string;
    let body: string;
    if (win) {
      title = state.loot === 0 ? 'You left empty-handed' : state.loot >= max ? 'The perfect heist' : `Escaped with £${state.loot}`;
      body =
        state.loot >= max
          ? `£${max} is the proven maximum for this facility. There is nothing more to take and still get out.`
          : `That is ${pct}% of the proven maximum (£${max}). ${patched ? 'Greedier next time?' : `Without a patch the ceiling is £${LAB_PROVEN.withoutPatch}.`}`;
    } else if (state.status === 'TRAPPED') {
      title = 'Locked in';
      body = `The exit sealed with £${state.loot} still in your bag. All of it is lost.`;
    } else {
      title = 'Intruder apprehended';
      body = `Caught on turn ${state.turn} carrying £${state.loot}. All of it is lost.`;
    }

    this.setOverlay(
      h(
        'div',
        { class: `overlay result ${win && state.loot > 0 ? 'win' : win ? '' : 'lose'}` },
        h(
          'div',
          { class: 'card' },
          h('p', { class: 'eyebrow' }, win ? 'EXTRACTION COMPLETE' : 'SECURITY ALERT'),
          h('h2', {}, title),
          win ? h('div', { class: 'download' }, h('i', { style: `--w:${Math.min(100, pct)}%` })) : null,
          h('p', {}, body),
          h(
            'div',
            { class: 'row' },
            h('button', { class: 'btn primary', onclick: () => this.cb.onCompare() }, '⇄ COMPARE AI BEHAVIOUR'),
            h('button', { class: 'btn ghost', onclick: () => this.cb.onRetry() }, 'RETRY (SAME PATCH)'),
            h('button', { class: 'btn ghost', onclick: () => this.cb.onRestart() }, 'RE-HACK'),
          ),
        ),
      ),
    );
  }

  setOverlay(el: HTMLElement | null): void {
    this.overlay?.remove();
    this.overlay = el;
    if (el) this.root.append(el);
  }
}
