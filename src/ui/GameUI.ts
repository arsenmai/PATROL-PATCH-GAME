import { CURSES, turnsLeft, turnsToSurge } from '../sim/curses';
import type { ArtifactDef, GameEvent, GameState, Level } from '../sim/types';
import type { Stage } from '../main';
import { CURSE_COLOR, css } from '../render/palette';
import { h } from './dom';

export interface UICallbacks {
  onStart(mode: 'daily' | 'classic'): void;
  onBriefingDone(): void;
  onInfiltrate(): void;
  onRestart(): void;
  onRetry(): void;
  onCompare(): void;
  onMenu(): void;
  onMute(): boolean;
}

/** HUD, overlays, toasts and the event log. Holds no game rules. */
export class GameUI {
  private readonly timeEl = h('strong', {}, '0');
  private readonly lootEl = h('strong', {}, '0');
  private readonly countEl = h('strong', {}, '0/0');
  private readonly alarmEl = h('div', { class: 'alarm' });
  private readonly timeBox = h('div', { class: 'hud-box small' }, h('span', {}, 'TURNS LEFT'), this.timeEl);
  private readonly objectiveEl = h('strong', {}, '');
  private readonly cursesEl = h('div', { class: 'hud-curses' });
  private readonly toastEl = h('div', { class: 'toast' });
  private readonly logEl = h('ul', { class: 'log' });
  private readonly alertEl = h('div', { class: 'alert-banner' }, '⚠ DETECTED');
  private readonly vignette = h('div', { class: 'vignette' });
  private readonly hintEl = h('div', { class: 'hint' });
  private readonly primaryBtn: HTMLButtonElement;
  private readonly restartBtn: HTMLButtonElement;
  private overlay: HTMLElement | null = null;
  private toastTimer = 0;
  private readonly editorSlot = h('div', {});
  private readonly placeEl = h('p', {}, '');
  private stage!: Stage;
  private todaySeed = 0;

  private get level(): Level {
    return this.stage.level;
  }

  constructor(
    private readonly root: HTMLElement,
    stage: HTMLElement,
    panel: HTMLElement,
    private readonly cb: UICallbacks,
  ) {
    this.probeTitleArt();
    this.primaryBtn = h('button', { class: 'btn primary wide', onclick: () => cb.onInfiltrate() }, 'START HEIST ▸');
    this.restartBtn = h('button', { class: 'btn ghost wide', onclick: () => cb.onRestart() }, '↺ RESTART / RE-HACK');
    const muteBtn = h('button', { class: 'icon-btn', title: 'Toggle sound' }, '♪');
    muteBtn.addEventListener('click', () => muteBtn.classList.toggle('off', cb.onMute()));

    stage.append(
      this.vignette,
      this.alertEl,
      this.toastEl,
      h(
        'div',
        { class: 'hud-top' },
        h(
          'div',
          { class: 'hud-row' },
          h('div', { class: 'hud-box' }, h('span', {}, 'OBJECTIVE'), this.objectiveEl),
          this.timeBox,
          h('div', { class: 'hud-box small loot' }, h('span', {}, 'LOOT'), this.lootEl),
          h('div', { class: 'hud-box small' }, h('span', {}, 'ARTIFACTS'), this.countEl),
          h('div', { class: 'hud-box small' }, h('span', {}, 'ALARM'), this.alarmEl),
        ),
        this.cursesEl,
      ),
      this.hintEl,
    );

    panel.append(
      h('header', { class: 'brand' }, h('div', {}, h('h1', {}, 'RULE', h('em', {}, 'HEIST')), this.placeEl), muteBtn),
      this.editorSlot,
      h('div', { class: 'panel-actions' }, this.primaryBtn, this.restartBtn),
      h('section', { class: 'log-wrap' }, h('header', { class: 'panel-title' }, h('span', {}, 'EVENT LOG')), this.logEl),
    );
  }

  /** Points the UI at a museum. Called once at start-up and again whenever the player switches mode. */
  setStage(stage: Stage, editorEl: HTMLElement, todaySeed: number): void {
    this.stage = stage;
    this.todaySeed = todaySeed;
    this.placeEl.textContent = stage.level.name;
    this.editorSlot.replaceChildren(editorEl);
  }

  setPhase(phase: 'HACK' | 'PLAY' | 'IDLE'): void {
    this.primaryBtn.style.display = phase === 'HACK' ? '' : 'none';
    this.restartBtn.style.display = phase === 'PLAY' ? '' : 'none';
    this.hintEl.innerHTML =
      phase === 'PLAY'
        ? '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move · <kbd>Space</kbd> wait · <kbd>E</kbd> steal / extract · <kbd>R</kbd> retry · scroll to zoom'
        : phase === 'HACK'
          ? 'Pick a guard, stage one rule change, apply it, then start the heist. Each tag shows an artifact’s value and its curse.'
          : '';
  }

  update(state: GameState): void {
    const total = this.level.artifacts.length;
    const left = turnsLeft(state);
    this.timeEl.textContent = String(left);
    this.timeBox.classList.toggle('danger', left <= 10 && state.status === 'PLAYING');
    this.lootEl.textContent = String(state.loot);
    this.countEl.textContent = `${state.taken.length}/${total}`;
    this.objectiveEl.textContent =
      state.taken.length === 0
        ? 'Steal at least one artifact'
        : state.taken.length === total
          ? 'You have everything — get to the EXTRACTION point'
          : 'Extract now with your loot — or steal more';

    this.alarmEl.replaceChildren(...Array.from({ length: total }, (_, i) => h('i', { class: i < state.curses.length ? 'on' : '' })));

    const surge = turnsToSurge(state);
    this.cursesEl.replaceChildren(
      ...state.curses.map((id) =>
        h(
          'span',
          { class: 'curse-chip', style: `--c:${css(CURSE_COLOR[id])}` },
          `⚠ ${CURSES[id].name}`,
          h('small', {}, id === 'PURSUIT' && surge !== null ? `${CURSES[id].summary} Next surge in ${surge}.` : CURSES[id].summary),
        ),
      ),
    );

    const detected = state.status === 'PLAYING' && state.guards.some((g) => g.seesPlayer);
    this.alertEl.classList.toggle('on', detected);
    this.vignette.classList.toggle('on', detected || state.status === 'CAUGHT' || state.status === 'TIMEOUT');
  }

  /** Brief, non-blocking banner after a theft. */
  toastArtifact(artifact: ArtifactDef): void {
    const curse = artifact.curse ? CURSES[artifact.curse] : null;
    this.toastEl.style.setProperty('--c', css(CURSE_COLOR[artifact.curse ?? 'NONE']));
    this.toastEl.replaceChildren(
      h('small', {}, 'ARTIFACT STOLEN!'),
      h('b', {}, artifact.name),
      h('span', { class: 'plus' }, `+${artifact.value} LOOT`),
      h('span', { class: 'curse' }, curse ? `NEW CURSE: ${curse.headline}` : 'NO CURSE'),
    );
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth; // restart the CSS animation
    this.toastEl.classList.add('show');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), 2600);
  }

  clearLog(): void {
    this.logEl.replaceChildren();
    this.toastEl.classList.remove('show');
  }

  log(events: GameEvent[] | string): void {
    const items = typeof events === 'string' ? [{ turn: -1, kind: 'INFO', text: events }] : events;
    for (const e of items) {
      if (e.kind === 'BLOCKED') continue;
      this.logEl.prepend(h('li', { class: e.kind.toLowerCase() }, e.turn >= 0 ? h('span', {}, `T${String(e.turn).padStart(2, '0')}`) : null, e.text));
    }
    while (this.logEl.children.length > 40) this.logEl.lastChild?.remove();
  }

  /** Optional key art: public/title.jpg or title.png. Probed once; the menu looks fine without it. */
  private titleArt: string | null = null;
  private probeTitleArt(): void {
    for (const file of ['title.jpg', 'title.png']) {
      const img = new Image();
      img.onload = () => {
        this.titleArt ??= file;
        this.root.querySelector<HTMLElement>('.overlay.menu')?.style.setProperty('--art', `url(${this.titleArt})`);
      };
      img.src = file;
    }
  }

  showMenu(): void {
    this.setOverlay(
      h(
        'div',
        { class: 'overlay menu', style: this.titleArt ? `--art:url(${this.titleArt})` : undefined },
        h(
          'div',
          { class: 'menu-card' },
          h('p', { class: 'eyebrow' }, 'A STEALTH HEIST WHERE EVERYTHING YOU STEAL CHANGES THE RULES'),
          h('h1', { class: 'logo' }, 'RULE', h('em', {}, 'HEIST')),
          h('p', { class: 'tagline' }, 'Hack one guard. Steal cursed artifacts. Leave while you still can.'),
          h(
            'ul',
            { class: 'howto' },
            h('li', {}, h('b', {}, '1'), 'Rewrite one rule in one guard’s AI.'),
            h('li', {}, h('b', {}, '2'), 'Every artifact you steal curses the museum.'),
            h('li', {}, h('b', {}, '3'), 'Reach the extraction point to keep your loot.'),
          ),
          h(
            'div',
            { class: 'menu-actions' },
            h('button', { class: 'btn primary big', onclick: () => this.cb.onStart('daily') }, `HEIST OF THE DAY  #${this.todaySeed}`),
            h('button', { class: 'btn ghost big', onclick: () => this.cb.onStart('classic') }, 'CLASSIC MUSEUM'),
          ),
          h('p', { class: 'foot' }, 'WASD move · Space wait · E steal / extract'),
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
          h('p', { class: 'eyebrow' }, 'THE JOB'),
          h('h2', {}, 'Three artifacts. Three curses. One way out.'),
          h(
            'div',
            { class: 'loot-list' },
            ...this.level.artifacts.map((a) =>
              h(
                'div',
                { class: 'loot-row', style: `--c:${css(CURSE_COLOR[a.curse ?? 'NONE'])}` },
                h('b', {}, a.name),
                h('span', { class: 'val' }, `+${a.value}`),
                h('span', {}, a.curse ? CURSES[a.curse].summary : 'No curse.'),
              ),
            ),
          ),
          h(
            'p',
            {},
            `The museum is turn-based: guards only move when you do, and you have ${this.level.turnLimit} turns before lockdown. You can leave with one artifact — or stay for more. Get caught or run out of time and the loot is gone.`,
          ),
          h(
            'p',
            { class: 'warn-line' },
            `Before you go in, you may rewrite one rule in one guard’s AI. Choose well: with factory AI, ${this.stage.par.withoutPatch} is provably the most anyone can take here — the right hack makes ${this.stage.par.withBestPatch} possible.`,
          ),
          h('button', { class: 'btn primary big', onclick: () => this.cb.onBriefingDone() }, 'OPEN GUARD AI EDITOR ▸'),
        ),
      ),
    );
  }

  showResult(state: GameState): void {
    const win = state.status === 'ESCAPED';
    const total = this.level.artifacts.length;
    const { par, daily, key } = this.stage;
    const perfect = win && state.loot >= par.withBestPatch;

    // Personal best lives in this browser only; the game works the same without it.
    let best: { loot: number; turns: number } | null = null;
    let improved = false;
    try {
      best = JSON.parse(localStorage.getItem(`ruleheist:${key}`) ?? 'null');
      if (win && (!best || state.loot > best.loot || (state.loot === best.loot && state.turn < best.turns))) {
        best = { loot: state.loot, turns: state.turn };
        improved = true;
        localStorage.setItem(`ruleheist:${key}`, JSON.stringify(best));
      }
    } catch {
      best = null;
    }

    const reason =
      state.status === 'TIMEOUT' ? 'The museum locked down around you.' : state.status === 'CAUGHT' ? `Caught on turn ${state.turn}.` : '';
    const nudge = !win
      ? 'Everything you were carrying stays in the museum.'
      : perfect
        ? state.turn <= par.bestTurns
          ? 'A perfect heist at par. This is provably the best possible run.'
          : `Everything stolen. Par is ${par.bestTurns} turns — you took ${state.turn}.`
        : `${total - state.taken.length} artifact${total - state.taken.length > 1 ? 's' : ''} left behind. All ${total} is proven possible with the right hack.`;

    const share = `RULE HEIST ${daily ? '#' + daily.seed : 'classic'} — ${win ? `${state.taken.length}/${total} artifacts · ${state.loot} loot · ${state.turn} turns` : 'caught'} (par ${par.withBestPatch} in ${par.bestTurns})`;
    const shareBtn = h('button', { class: 'btn ghost' }, 'COPY RESULT');
    shareBtn.addEventListener('click', () => {
      const done = (ok: boolean) => (shareBtn.textContent = ok ? 'COPIED ✓' : share);
      try {
        navigator.clipboard.writeText(share).then(
          () => done(true),
          () => done(false),
        );
      } catch {
        done(false);
      }
    });

    this.setOverlay(
      h(
        'div',
        { class: `overlay result ${win ? 'win' : 'lose'}` },
        h(
          'div',
          { class: 'card' },
          h('p', { class: 'eyebrow' }, win ? 'EXTRACTION COMPLETE' : 'SECURITY ALERT'),
          h('h2', {}, win ? 'HEIST SUCCESSFUL' : 'HEIST FAILED'),
          h(
            'div',
            { class: 'stats' },
            h('div', {}, h('span', {}, 'ARTIFACTS STOLEN'), h('strong', {}, `${state.taken.length}/${total}`)),
            h('div', {}, h('span', {}, win ? 'TOTAL LOOT' : 'LOOT LOST'), h('strong', { class: win ? 'good' : 'bad' }, String(state.loot))),
            h('div', {}, h('span', {}, 'TURNS USED'), h('strong', {}, String(state.turn))),
          ),
          h('p', {}, [reason, nudge].filter(Boolean).join(' ')),
          h(
            'p',
            { class: 'par-line' },
            `Par: ${par.withBestPatch} loot in ${par.bestTurns} turns`,
            best ? `  ·  Your best: ${best.loot} in ${best.turns}${improved ? '  ★ new' : ''}` : '',
          ),
          h(
            'div',
            { class: 'row' },
            h('button', { class: 'btn primary', onclick: () => this.cb.onRetry() }, '↺ RETRY'),
            h('button', { class: 'btn ghost', onclick: () => this.cb.onRestart() }, 'CHANGE HACK'),
            h('button', { class: 'btn ghost', onclick: () => this.cb.onCompare() }, '⇄ COMPARE AI'),
            shareBtn,
            h('button', { class: 'btn ghost', onclick: () => this.cb.onMenu() }, 'MENU'),
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
