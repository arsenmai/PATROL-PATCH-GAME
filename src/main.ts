import './style.css';
import { LabScene, MOVE_MS } from './render/scene';
import { LAB_LEVEL } from './sim/level';
import { PatchSystem } from './sim/patch';
import { ReplayRecorder, compareReplays } from './sim/replay';
import { createInitialState, step } from './sim/simulation';
import type { Action, GameState } from './sim/types';
import { AIEditor } from './ui/AIEditor';
import { CompareView } from './ui/CompareView';
import { GameUI } from './ui/GameUI';
import { sfx } from './ui/sfx';

type Phase = 'MENU' | 'BRIEFING' | 'HACK' | 'PLAY' | 'RESULT' | 'COMPARE';

const KEYS: Record<string, Action> = {
  KeyW: 'N',
  ArrowUp: 'N',
  KeyS: 'S',
  ArrowDown: 'S',
  KeyA: 'W',
  ArrowLeft: 'W',
  KeyD: 'E',
  ArrowRight: 'E',
  Space: 'WAIT',
  KeyE: 'INTERACT',
};

/**
 * Application controller: owns the phase machine and wires input → simulation → presentation.
 * All game rules live in src/sim; this file never decides an outcome.
 */
class Game {
  private readonly level = LAB_LEVEL;
  private readonly patches = new PatchSystem(this.level);
  private readonly recorder = new ReplayRecorder();
  private readonly scene: LabScene;
  private readonly editor: AIEditor;
  private readonly ui: GameUI;
  private state: GameState = createInitialState(this.level);
  private phase: Phase = 'MENU';
  private compareView: CompareView | null = null;
  private resultTimer = 0;
  /** One buffered input, so quick typing during a move tween is not lost. */
  private queued: Action | null = null;

  constructor(root: HTMLElement) {
    const stage = root.querySelector<HTMLElement>('#stage')!;
    const panel = root.querySelector<HTMLElement>('#panel')!;

    this.scene = new LabScene(stage, this.level);
    this.editor = new AIEditor(this.level, this.patches, {
      onSelectGuard: (id) => this.phase === 'HACK' && this.scene.setSelectedGuard(id),
      onPatchChanged: () => this.resetWorld(),
    });
    this.ui = new GameUI(root, this.level, stage, panel, this.editor.el, {
      onStart: () => this.setPhase('BRIEFING'),
      onBriefingDone: () => this.setPhase('HACK'),
      onInfiltrate: () => this.setPhase('PLAY'),
      onRestart: () => {
        this.patches.reset();
        this.setPhase('HACK');
      },
      onRetry: () => this.setPhase('PLAY'),
      onCompare: () => this.setPhase('COMPARE'),
      onMute: () => sfx.toggleMute(),
    });

    window.addEventListener('keydown', this.onKey);
    this.resetWorld();
    this.setPhase('MENU');
  }

  /** Fresh world using whatever patch is currently applied. */
  private resetWorld(): void {
    this.state = createInitialState(this.level, this.patches.current);
    this.scene.setState(this.state, true);
    this.ui.update(this.state);
  }

  private setPhase(phase: Phase): void {
    window.clearTimeout(this.resultTimer);
    this.queued = null;
    this.compareView?.destroy();
    this.compareView = null;
    this.phase = phase;

    switch (phase) {
      case 'MENU':
        this.ui.setPhase('IDLE');
        this.ui.showMenu();
        break;

      case 'BRIEFING':
        sfx.click();
        this.ui.showBriefing();
        break;

      case 'HACK':
        sfx.click();
        this.ui.setOverlay(null);
        this.ui.setPhase('HACK');
        this.ui.clearLog();
        this.ui.log('Uplink established. Guard firmware is writable.');
        this.ui.update(this.state);
        this.editor.setLiveState(null);
        this.editor.setLocked(false);
        this.scene.setSelectedGuard(this.editor.selectedGuard);
        this.resetWorld();
        break;

      case 'PLAY': {
        sfx.click();
        this.ui.setOverlay(null);
        this.ui.setPhase('PLAY');
        this.ui.clearLog();
        const p = this.patches.current;
        this.ui.log(p ? `Patch live: ${p.guardId}.${p.slot} = ${p.value}` : 'No patch applied. Guards run factory AI.');
        this.recorder.clear();
        this.resetWorld();
        this.editor.setLocked(true);
        this.editor.setLiveState(this.state);
        this.scene.setSelectedGuard(null);
        break;
      }

      case 'RESULT':
        this.ui.showResult(this.state);
        break;

      case 'COMPARE': {
        sfx.click();
        const comparison = compareReplays(this.level, this.recorder.actions, this.patches.current);
        this.compareView = new CompareView(this.level, comparison, this.patches.current, this.recorder.actions.length, () =>
          this.setPhase('RESULT'),
        );
        this.ui.setOverlay(this.compareView.el);
        break;
      }
    }
  }

  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.repeat && e.code === 'KeyE') return;
    if (this.phase === 'PLAY' && e.code === 'KeyR') {
      this.patches.reset();
      this.setPhase('HACK');
      return;
    }
    const action = KEYS[e.code];
    if (!action || this.phase !== 'PLAY') return;
    e.preventDefault();
    if (this.state.status !== 'PLAYING') return;
    if (this.scene.isAnimating) this.queued = action;
    else this.act(action);
  };

  private act(action: Action): void {
    const before = this.state;
    const result = step(this.level, before, action);
    if (!result.advanced) {
      sfx.blocked();
      return;
    }

    this.recorder.record(action);
    this.state = result.state;
    this.scene.setState(this.state);
    this.ui.update(this.state);
    this.ui.log(result.events);
    this.editor.setLiveState(this.state);

    const happened = (kind: string) => result.events.some((ev) => ev.kind === kind);
    if (this.state.status === 'ESCAPED') sfx.success();
    else if (this.state.status !== 'PLAYING') sfx.caught();
    else if (happened('DETECTED')) sfx.detected();
    else if (happened('LOOT')) {
      sfx.loot();
      if (happened('CURSE')) sfx.curse();
    } else sfx.step();

    if (happened('LOOT')) {
      const stolen = this.level.artifacts.find((a) => a.id === this.state.taken[this.state.taken.length - 1]);
      if (stolen) this.ui.toastArtifact(stolen);
    }

    if (this.state.status !== 'PLAYING') {
      this.resultTimer = window.setTimeout(() => this.setPhase('RESULT'), 900);
      return;
    }
    window.setTimeout(() => {
      const next = this.queued;
      this.queued = null;
      if (next && this.phase === 'PLAY' && this.state.status === 'PLAYING') this.act(next);
    }, MOVE_MS + 10);
  }
}

new Game(document.querySelector<HTMLElement>('#app')!);
