import type { GameEvent, GameState } from '../sim/types';
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
  private readonly logEl = h('ul', { class: 'log' });
  private readonly alertEl = h('div', { class: 'alert-banner' }, '⚠ DETECTED');
  private readonly vignette = h('div', { class: 'vignette' });
  private readonly hintEl = h('div', { class: 'hint' });
  private readonly primaryBtn: HTMLButtonElement;
  private readonly restartBtn: HTMLButtonElement;
  private overlay: HTMLElement | null = null;

  constructor(
    private readonly root: HTMLElement,
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
        h('div', { class: 'hud-box' }, h('span', {}, 'OBJECTIVE'), h('strong', {}, 'Reach the vault terminal and press E')),
        h('div', { class: 'hud-box small' }, h('span', {}, 'TURN'), this.turnEl),
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
        ? '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move · <kbd>Space</kbd> wait · <kbd>E</kbd> hack terminal · <kbd>R</kbd> restart · scroll to zoom'
        : phase === 'HACK'
          ? 'Pick a guard, stage one rule change, apply it, then start the infiltration.'
          : '';
  }

  update(state: GameState): void {
    this.turnEl.textContent = String(state.turn);
    const detected = state.status === 'PLAYING' && state.guards.some((g) => g.seesPlayer);
    this.alertEl.classList.toggle('on', detected);
    this.vignette.classList.toggle('on', detected || state.status === 'CAUGHT');
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
          h('p', { class: 'eyebrow' }, 'A STEALTH PUZZLE ABOUT REWRITING ENEMY AI'),
          h('h1', { class: 'logo' }, 'PATROL', h('em', {}, 'PATCH')),
          h('p', { class: 'tagline' }, "Don't outrun the guards. Out-think their code."),
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
          h('h2', {}, 'Access the classified terminal'),
          h(
            'p',
            {},
            'Your objective is to access the classified terminal. The facility is protected by autonomous security robots. You can modify one guard’s AI behaviour before infiltration.',
          ),
          h(
            'ol',
            { class: 'steps' },
            h('li', {}, h('b', {}, 'Hack. '), 'Each guard runs three IF → DO rules. You may rewrite exactly one rule on one guard.'),
            h('li', {}, h('b', {}, 'Infiltrate. '), 'The lab is turn-based: guards only act when you do. Coloured tiles show what each guard can see.'),
            h('li', {}, h('b', {}, 'Compare. '), 'Afterwards, replay your exact moves against the original AI and see where the timelines split.'),
          ),
          h('p', { class: 'warn-line' }, 'Intel: with factory AI the vault is provably impossible to breach. Chasing guards move twice as fast as you.'),
          h('button', { class: 'btn primary big', onclick: () => this.cb.onBriefingDone() }, 'OPEN GUARD AI EDITOR ▸'),
        ),
      ),
    );
  }

  showResult(state: GameState, patched: boolean): void {
    const win = state.status === 'SUCCESS';
    this.setOverlay(
      h(
        'div',
        { class: `overlay result ${win ? 'win' : 'lose'}` },
        h(
          'div',
          { class: 'card' },
          h('p', { class: 'eyebrow' }, win ? 'ACCESS GRANTED' : 'SECURITY ALERT'),
          h('h2', {}, win ? 'Classified data extracted' : 'Intruder apprehended'),
          win ? h('div', { class: 'download' }, h('i', {})) : null,
          h(
            'p',
            {},
            win
              ? `Terminal breached in ${state.turn} turns. Now see what the original AI would have done with the very same moves.`
              : patched
                ? `Caught on turn ${state.turn}. Compare the timelines to see whether your patch changed anything, then try another rule or route.`
                : `Caught on turn ${state.turn}. You went in without a patch — the stock AI cannot be beaten on foot.`,
          ),
          h(
            'div',
            { class: 'row' },
            h('button', { class: 'btn primary', onclick: () => this.cb.onCompare() }, '⇄ COMPARE AI BEHAVIOUR'),
            h('button', { class: 'btn ghost', onclick: () => this.cb.onRetry() }, 'RETRY ROUTE'),
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
