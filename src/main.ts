import './style.css';
import { LabScene, MOVE_MS } from './render/scene';
import { buildDaily, dailyFor, type DailyHeist, type Par } from './sim/daily';
import { LAB_LEVEL, LAB_PROVEN } from './sim/level';
import { PatchSystem } from './sim/patch';
import { ReplayRecorder, compareReplays } from './sim/replay';
import { createInitialState, step } from './sim/simulation';
import type { Action, GameState, Level } from './sim/types';
import { AIEditor } from './ui/AIEditor';
import { CompareView } from './ui/CompareView';
import { GameUI } from './ui/GameUI';
import { sfx } from './ui/sfx';

type Phase = 'MENU' | 'BRIEFING' | 'HACK' | 'PLAY' | 'RESULT' | 'COMPARE';

/** One playable museum: the level, what the solver proved about it, and a key for the local best score. */
export interface Stage {
  level: Level;
  par: Par;
  key: string;
  daily: DailyHeist | null;
}

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

const classicStage = (): Stage => ({ level: LAB_LEVEL, par: LAB_PROVEN, key: 'classic', daily: null });

function dailyStage(): Stage {
  const heist = dailyFor(new Date());
  return { level: buildDaily(heist), par: heist.par, key: `daily-${heist.seed}`, daily: heist };
}

/**
 * Application controller: owns the phase machine and wires input → simulation → presentation.
 * All game rules live in src/sim; this file never decides an outcome.
 */
class Game {
  private readonly stageEl: HTMLElement;
  private readonly ui: GameUI;
  private readonly recorder = new ReplayRecorder();
  private stage: Stage = classicStage();
  private patches = new PatchSystem(this.stage.level);
  private scene: LabScene;
  private editor: AIEditor;
  private state: GameState = createInitialState(this.stage.level);
  private phase: Phase = 'MENU';
  private compareView: CompareView | null = null;
  private resultTimer = 0;
  /** One buffered input, so quick typing during a move tween is not lost. */
  private queued: Action | null = null;

  constructor(root: HTMLElement) {
    this.stageEl = root.querySelector<HTMLElement>('#stage')!;
    const panel = root.querySelector<HTMLElement>('#panel')!;

    this.ui = new GameUI(root, this.stageEl, panel, {
      onStart: (mode) => {
        this.load(mode === 'daily' ? dailyStage() : classicStage());
        this.setPhase('BRIEFING');
      },
      onBriefingDone: () => this.setPhase('HACK'),
      onInfiltrate: () => this.setPhase('PLAY'),
      onRestart: () => {
        this.patches.reset();
        this.setPhase('HACK');
      },
      onRetry: () => this.setPhase('PLAY'),
      onCompare: () => this.setPhase('COMPARE'),
      onMenu: () => this.setPhase('MENU'),
      onMute: () => sfx.toggleMute(),
    });

    this.scene = new LabScene(this.stageEl, this.stage.level);
    this.editor = this.makeEditor();
    this.ui.setStage(this.stage, this.editor.el, dailyFor(new Date()).seed);

    window.addEventListener('keydown', this.onKey);
    this.resetWorld();
    this.setPhase('MENU');
  }

  private makeEditor(): AIEditor {
    return new AIEditor(this.stage.level, this.patches, {
      onSelectGuard: (id) => this.phase === 'HACK' && this.scene.setSelectedGuard(id),
      onPatchChanged: () => this.resetWorld(),
    });
  }

  /** Switches museum: rebuilds everything that is bound to a level, and nothing else. */
  private load(stage: Stage): void {
    if (stage.key === this.stage.key) {
      this.patches.reset();
      return;
    }
    this.scene.dispose();
    this.stage = stage;
    this.patches = new PatchSystem(stage.level);
    this.scene = new LabScene(this.stageEl, stage.level);
    this.editor = this.makeEditor();
    this.ui.setStage(stage, this.editor.el, dailyFor(new Date()).seed);
    this.resetWorld();
  }

  /** Fresh world using whatever patch is currently applied. */
  private resetWorld(): void {
    this.state = createInitialState(this.stage.level, this.patches.current);
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
        const comparison = compareReplays(this.stage.level, this.recorder.actions, this.patches.current);
        this.compareView = new CompareView(this.stage.level, comparison, this.patches.current, this.recorder.actions.length, () =>
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
      this.setPhase('PLAY');
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
    const result = step(this.stage.level, this.state, action);
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
      const stolen = this.stage.level.artifacts.find((a) => a.id === this.state.taken[this.state.taken.length - 1]);
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
