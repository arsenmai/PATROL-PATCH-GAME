import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { CURSES, sightMultiplier } from '../sim/curses';
import { visibleTiles } from '../sim/detection';
import type { GameState, Level } from '../sim/types';
import { FACING_ANGLE, createGuardModel, createPlayerModel, type GuardModel, type PlayerModel } from './characters';
import { buildEnvironment, tileToWorld, type Environment } from './environment';
import { COLORS, CURSE_COLOR, STATE_COLOR, css } from './palette';

/** Duration of the move tween. Purely cosmetic: the simulation has already advanced. */
export const MOVE_MS = 170;
const MAX_CONE_TILES = 72;

interface Tween {
  from: THREE.Vector3;
  to: THREE.Vector3;
  fromAngle: number;
  toAngle: number;
}

const shortestAngle = (from: number, to: number): number => {
  const d = ((to - from + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return from + d;
};

/**
 * Presentation layer. It only ever *reads* GameState; nothing in here can change a simulation outcome.
 */
export class LabScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  private readonly env: Environment;
  private readonly player: PlayerModel;
  private readonly guards: GuardModel[] = [];
  private readonly cones: { tiles: THREE.Mesh[]; material: THREE.MeshBasicMaterial }[] = [];
  private readonly labels: HTMLDivElement[] = [];
  private readonly pins: { el: HTMLDivElement; at: THREE.Vector3; id: string | null; below: boolean }[] = [];
  private readonly labelLayer: HTMLDivElement;
  private readonly selection: THREE.Mesh;
  private readonly clock = new THREE.Clock();
  private readonly resizeObserver: ResizeObserver;

  private tweens: Tween[] = [];
  private tweenStart = 0;
  private animating = false;
  private state: GameState | null = null;
  private selectedGuard: string | null = null;
  private zoom = 1;
  private frame = 0;
  private disposed = false;

  constructor(private readonly container: HTMLElement, private readonly level: Level) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(COLORS.bg);
    container.appendChild(this.renderer.domElement);

    this.labelLayer = document.createElement('div');
    this.labelLayer.className = 'label-layer';
    container.appendChild(this.labelLayer);

    this.scene.background = new THREE.Color(COLORS.bg);
    this.camera.position.set(1.4, 15, 10.5);
    this.camera.lookAt(0, 0, 0.2);

    this.env = buildEnvironment(level);
    this.scene.add(this.env.group);

    // Detection cones: a small pool of flat tiles per guard, re-positioned whenever the state changes.
    const coneGeo = new THREE.PlaneGeometry(0.9, 0.9);
    for (const def of level.guards) {
      const material = new THREE.MeshBasicMaterial({ color: COLORS.cyan, transparent: true, opacity: 0.2, depthWrite: false });
      const tiles: THREE.Mesh[] = [];
      for (let i = 0; i < MAX_CONE_TILES; i++) {
        const m = new THREE.Mesh(coneGeo, material);
        m.rotation.x = -Math.PI / 2;
        m.visible = false;
        this.scene.add(m);
        tiles.push(m);
      }
      this.cones.push({ tiles, material });

      const model = createGuardModel();
      this.scene.add(model.root);
      this.guards.push(model);

      const label = document.createElement('div');
      label.className = 'guard-label';
      label.dataset.guard = def.id;
      this.labelLayer.appendChild(label);
      this.labels.push(label);
    }

    // Static pins: one price tag per prototype, plus the exit.
    for (const a of level.artifacts) {
      const el = document.createElement('div');
      el.className = 'loot-label';
      el.style.setProperty('--c', css(CURSE_COLOR[a.curse ?? 'NONE']));
      el.innerHTML = `<b>${a.name} · ${a.value}</b>${a.curse ? `<span>⚠ ${CURSES[a.curse].short}</span>` : '<span>no curse</span>'}`;
      this.labelLayer.appendChild(el);
      this.pins.push({ el, at: tileToWorld(level, a.pos, a.sealed ? 1.45 : 1.0), id: a.id, below: false });
    }
    const exitEl = document.createElement('div');
    exitEl.className = 'loot-label exit';
    exitEl.innerHTML = '<b>EXTRACTION</b>';
    this.labelLayer.appendChild(exitEl);
    this.pins.push({ el: exitEl, at: tileToWorld(level, level.start, 0), id: null, below: true });

    this.selection = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.47, 32),
      new THREE.MeshBasicMaterial({ color: COLORS.green, transparent: true, opacity: 0.9 }),
    );
    this.selection.rotation.x = -Math.PI / 2;
    this.selection.visible = false;
    this.scene.add(this.selection);

    this.player = createPlayerModel();
    this.scene.add(this.player.root);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.45, 0.25, 0.75);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.renderer.domElement.addEventListener('wheel', this.onWheel, { passive: false });
    this.resize();
    this.loop();
  }

  /** Time-based on purpose: a slow frame rate must never make the game swallow key presses. */
  get isAnimating(): boolean {
    return this.animating && performance.now() - this.tweenStart < MOVE_MS;
  }

  /** Shows a simulation state. With `instant` the tween is skipped (restart, phase change). */
  setState(state: GameState, instant = false): void {
    const prev = this.state;
    this.state = state;

    const actors = [this.player.root, ...this.guards.map((g) => g.root)];
    const targets = [
      { pos: tileToWorld(this.level, state.player), angle: this.facingOfPlayer(prev, state) },
      ...state.guards.map((g) => ({ pos: tileToWorld(this.level, g.pos), angle: FACING_ANGLE[g.facing] })),
    ];

    this.tweens = actors.map((actor, i) => ({
      from: instant ? targets[i].pos.clone() : actor.position.clone(),
      to: targets[i].pos,
      fromAngle: instant ? targets[i].angle : actor.rotation.y,
      toAngle: instant ? targets[i].angle : shortestAngle(actor.rotation.y, targets[i].angle),
    }));
    this.tweenStart = performance.now();
    this.animating = !instant;
    if (instant) this.applyTweens(1);

    const detected = state.guards.some((g) => g.seesPlayer) || state.status === 'CAUGHT' || state.status === 'TIMEOUT';
    this.player.accent.emissive.setHex(detected ? COLORS.red : COLORS.green);
    this.env.setTaken(state.taken);
    this.env.setAlarm(state.curses.length);
    for (const pin of this.pins) pin.el.classList.toggle('gone', pin.id !== null && state.taken.includes(pin.id));
    const rangeMultiplier = sightMultiplier(state);

    state.guards.forEach((g, i) => {
      const def = this.level.guards[i];
      const color = STATE_COLOR[g.state];
      this.guards[i].accent.emissive.setHex(color);
      this.guards[i].hackGlyph.visible = g.hacked;

      const cone = this.cones[i];
      cone.material.color.setHex(g.seesPlayer ? COLORS.red : color);
      cone.material.opacity = g.seesPlayer ? 0.42 : 0.2;
      const tiles = visibleTiles(this.level, g.pos, g.facing, def.range * rangeMultiplier);
      cone.tiles.forEach((mesh, t) => {
        mesh.visible = t < tiles.length;
        if (mesh.visible) mesh.position.copy(tileToWorld(this.level, tiles[t], 0.02 + i * 0.004));
      });

      const label = this.labels[i];
      label.textContent = `${def.name} · ${g.state}`;
      label.style.setProperty('--c', css(color));
      label.classList.toggle('hacked', g.hacked);
    });
  }

  /** Highlights a guard while it is selected in the AI editor. */
  setSelectedGuard(id: string | null): void {
    this.selectedGuard = id;
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.renderer.domElement.removeEventListener('wheel', this.onWheel);
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      mesh.geometry?.dispose();
      const mat = mesh.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose();
    });
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labelLayer.remove();
  }

  private facingOfPlayer(prev: GameState | null, next: GameState): number {
    if (!prev) return FACING_ANGLE.N;
    const dx = next.player.x - prev.player.x;
    const dy = next.player.y - prev.player.y;
    if (dx === 0 && dy === 0) return this.player.root.rotation.y;
    return Math.atan2(dx, dy);
  }

  private readonly onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.zoom = THREE.MathUtils.clamp(this.zoom * (e.deltaY > 0 ? 0.92 : 1.08), 0.8, 1.9);
    this.resize();
  };

  private resize(): void {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    const aspect = w / h;
    // Fit the whole lab on screen at zoom 1, whatever the aspect ratio.
    const halfH = Math.max(6.6, 7.4 / aspect) / this.zoom;
    this.camera.left = -halfH * aspect;
    this.camera.right = halfH * aspect;
    this.camera.top = halfH;
    this.camera.bottom = -halfH;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w, h);
  }

  private applyTweens(k: number): void {
    const eased = k * k * (3 - 2 * k);
    const actors = [this.player.root, ...this.guards.map((g) => g.root)];
    this.tweens.forEach((tw, i) => {
      actors[i].position.lerpVectors(tw.from, tw.to, eased);
      actors[i].rotation.y = tw.fromAngle + (tw.toAngle - tw.fromAngle) * eased;
    });
  }

  private readonly loop = (): void => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.loop);
    const time = this.clock.getElapsedTime();

    if (this.animating) {
      const k = Math.min(1, (performance.now() - this.tweenStart) / MOVE_MS);
      this.applyTweens(k);
      if (k >= 1) this.animating = false;
    }

    this.env.update(time);
    this.player.body.position.y = Math.sin(time * 3) * 0.015;
    this.guards.forEach((g, i) => {
      g.body.position.y = 0.04 + Math.sin(time * 2.4 + i * 2) * 0.025;
      g.hackGlyph.rotation.y = time * 2.5;
      g.hackGlyph.rotation.x = time * 1.3;
    });

    const selectedIndex = this.level.guards.findIndex((g) => g.id === this.selectedGuard);
    this.selection.visible = selectedIndex >= 0;
    if (selectedIndex >= 0) {
      this.selection.position.copy(this.guards[selectedIndex].root.position).setY(0.03);
      this.selection.scale.setScalar(1 + Math.sin(time * 5) * 0.07);
    }

    this.updateLabels();
    this.composer.render();
  };

  private readonly projected = new THREE.Vector3();

  private updateLabels(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.guards.forEach((g, i) => {
      this.projected.copy(g.root.position).setY(1.75).project(this.camera);
      const x = (this.projected.x * 0.5 + 0.5) * w;
      const y = (-this.projected.y * 0.5 + 0.5) * h;
      this.labels[i].style.transform = `translate(-50%, -100%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    });
    for (const pin of this.pins) {
      this.projected.copy(pin.at).project(this.camera);
      const x = (this.projected.x * 0.5 + 0.5) * w;
      const y = (-this.projected.y * 0.5 + 0.5) * h;
      pin.el.style.transform = `translate(-50%, ${pin.below ? '14px' : '-100%'}) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    }
  }
}
