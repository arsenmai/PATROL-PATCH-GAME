import { sightMultiplier } from '../sim/curses';
import { visibleTiles } from '../sim/detection';
import { DELTA } from '../sim/grid';
import type { Comparison, Replay } from '../sim/replay';
import type { GameState, Level, Patch } from '../sim/types';
import { COLORS, CURSE_COLOR, STATE_COLOR, css } from '../render/palette';
import { h } from './dom';

const TILE = 30;

/** Draws one world state as a top-down schematic. Shared by both sides of the comparison. */
function drawMap(canvas: HTMLCanvasElement, level: Level, state: GameState): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = level.width * TILE;
  const hgt = level.height * TILE;
  if (canvas.width !== w * dpr) {
    canvas.width = w * dpr;
    canvas.height = hgt * dpr;
  }
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#070b14';
  ctx.fillRect(0, 0, w, hgt);

  for (let y = 0; y < level.height; y++) {
    for (let x = 0; x < level.width; x++) {
      const c = level.tiles[y][x];
      ctx.fillStyle = c === '#' ? '#1d2740' : '#0f1626';
      ctx.fillRect(x * TILE + 1, y * TILE + 1, TILE - 2, TILE - 2);
    }
  }

  const centre = (p: { x: number; y: number }) => [p.x * TILE + TILE / 2, p.y * TILE + TILE / 2] as const;

  if (level.door) {
    ctx.strokeStyle = css(COLORS.magenta);
    ctx.lineWidth = 2;
    ctx.strokeRect(level.door.x * TILE + 3, level.door.y * TILE + 3, TILE - 6, TILE - 6);
  }

  const [ex, ey] = centre(level.start);
  ctx.strokeStyle = css(COLORS.green);
  ctx.lineWidth = 1.5;
  ctx.setLineDash([3, 3]);
  ctx.strokeRect(ex - 11, ey - 11, 22, 22);
  ctx.setLineDash([]);

  for (const a of level.artifacts) {
    const stolen = state.taken.includes(a.id);
    if (stolen) continue;
    const [ax, ay] = centre(a.pos);
    const r = a.sealed ? 9 : 6;
    ctx.fillStyle = css(CURSE_COLOR[a.curse ?? 'NONE']);
    ctx.beginPath();
    ctx.moveTo(ax, ay - r);
    ctx.lineTo(ax + r, ay);
    ctx.lineTo(ax, ay + r);
    ctx.lineTo(ax - r, ay);
    ctx.closePath();
    ctx.fill();
  }

  const rangeMultiplier = sightMultiplier(state);
  state.guards.forEach((g, i) => {
    const colour = css(g.seesPlayer ? COLORS.red : STATE_COLOR[g.state]);
    ctx.globalAlpha = g.seesPlayer ? 0.4 : 0.2;
    ctx.fillStyle = colour;
    for (const t of visibleTiles(level, g.pos, g.facing, level.guards[i].range * rangeMultiplier)) {
      ctx.fillRect(t.x * TILE + 2, t.y * TILE + 2, TILE - 4, TILE - 4);
    }
    ctx.globalAlpha = 1;
  });

  state.guards.forEach((g, i) => {
    const [gx, gy] = centre(g.pos);
    const colour = css(STATE_COLOR[g.state]);
    ctx.fillStyle = '#0b1020';
    ctx.strokeStyle = colour;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(gx, gy, 9.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    const d = DELTA[g.facing];
    ctx.beginPath();
    ctx.moveTo(gx + d.x * 6, gy + d.y * 6);
    ctx.lineTo(gx + d.x * 14, gy + d.y * 14);
    ctx.stroke();
    ctx.fillStyle = colour;
    ctx.font = 'bold 10px ui-monospace, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), gx, gy + 0.5);
    if (g.hacked) {
      ctx.fillStyle = css(COLORS.green);
      ctx.fillRect(gx + 7, gy - 13, 6, 6);
    }
  });

  const [px, py] = centre(state.player);
  const lost = state.status === 'CAUGHT' || state.status === 'TIMEOUT';
  ctx.fillStyle = css(lost ? COLORS.red : COLORS.green);
  ctx.beginPath();
  ctx.arc(px, py, 6.5, 0, Math.PI * 2);
  ctx.fill();
  if (lost) {
    ctx.strokeStyle = css(COLORS.red);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(px - 12, py - 12);
    ctx.lineTo(px + 12, py + 12);
    ctx.moveTo(px + 12, py - 12);
    ctx.lineTo(px - 12, py + 12);
    ctx.stroke();
  }
}

const OUTCOME: Record<GameState['status'], string> = {
  PLAYING: 'IN PROGRESS',
  CAUGHT: 'CAPTURED — LOOT LOST',
  TIMEOUT: 'OUT OF TIME — LOOT LOST',
  ESCAPED: 'ESCAPED',
};

/**
 * COMPARE AI BEHAVIOUR — the same recorded inputs replayed through two simulations,
 * scrubbed together turn by turn.
 */
export class CompareView {
  readonly el: HTMLElement;
  private turn = 0;
  private timer: number | null = null;
  private readonly canvases: HTMLCanvasElement[] = [];
  private readonly infos: HTMLElement[] = [];
  private readonly slider: HTMLInputElement;
  private readonly turnLabel: HTMLElement;
  private readonly playBtn: HTMLButtonElement;

  constructor(
    private readonly level: Level,
    private readonly comparison: Comparison,
    patch: Patch | null,
    actionCount: number,
    onClose: () => void,
  ) {
    const side = (title: string, sub: string, cls: string) => {
      const canvas = h('canvas', { class: 'cmp-canvas' });
      const info = h('div', { class: 'cmp-info' });
      this.canvases.push(canvas);
      this.infos.push(info);
      return h('div', { class: `cmp-side ${cls}` }, h('h3', {}, title), h('p', { class: 'cmp-sub' }, sub), canvas, info);
    };

    this.slider = h('input', {
      type: 'range',
      min: 0,
      max: comparison.turns,
      value: 0,
      oninput: () => this.show(Number(this.slider.value)),
    });
    this.turnLabel = h('span', { class: 'cmp-turn' });
    this.playBtn = h('button', { class: 'btn primary', onclick: () => this.togglePlay() }, '▶ PLAY');

    const diverge =
      comparison.divergedAt === null
        ? patch
          ? 'The patch never changed anything on this route: both worlds are identical.'
          : 'No patch was applied, so both simulations are identical.'
        : `Timelines diverge at turn ${comparison.divergedAt}.`;

    this.el = h(
      'div',
      { class: 'overlay compare' },
      h(
        'div',
        { class: 'cmp-card' },
        h(
          'header',
          { class: 'cmp-header' },
          h('div', {}, h('h2', {}, 'COUNTERFACTUAL REPLAY'), h('p', {}, `${actionCount} recorded inputs · one shared simulation function · ${diverge}`)),
          h('button', { class: 'btn ghost', onclick: onClose }, 'CLOSE ✕'),
        ),
        h(
          'div',
          { class: 'cmp-grid' },
          side('SIMULATION A — ORIGINAL AI', 'Both guards run factory rules', 'a'),
          side(
            'SIMULATION B — PATCHED AI',
            patch ? `${patch.guardId}.${patch.slot} = ${patch.value}` : 'No patch applied',
            'b',
          ),
        ),
        h(
          'div',
          { class: 'cmp-controls' },
          h('button', { class: 'btn ghost', onclick: () => this.show(this.turn - 1) }, '◀'),
          this.playBtn,
          h('button', { class: 'btn ghost', onclick: () => this.show(this.turn + 1) }, '▶'),
          this.slider,
          this.turnLabel,
          comparison.divergedAt !== null
            ? h('button', { class: 'btn ghost', onclick: () => this.show(comparison.divergedAt!) }, 'JUMP TO DIVERGENCE')
            : null,
        ),
      ),
    );
    this.show(0);
  }

  destroy(): void {
    this.stop();
    this.el.remove();
  }

  private togglePlay(): void {
    if (this.timer !== null) return this.stop();
    if (this.turn >= this.comparison.turns) this.show(0);
    this.playBtn.textContent = '❚❚ PAUSE';
    this.timer = window.setInterval(() => {
      if (this.turn >= this.comparison.turns) this.stop();
      else this.show(this.turn + 1);
    }, 420);
  }

  private stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.playBtn.textContent = '▶ PLAY';
  }

  private show(turn: number): void {
    this.turn = Math.max(0, Math.min(this.comparison.turns, turn));
    this.slider.value = String(this.turn);
    this.turnLabel.textContent = `TURN ${this.turn} / ${this.comparison.turns}`;
    [this.comparison.original, this.comparison.patched].forEach((replay, i) => this.renderSide(replay, i));
  }

  private renderSide(replay: Replay, index: number): void {
    const last = replay.frames.length - 1;
    const t = Math.min(this.turn, last);
    const state = replay.frames[t];
    drawMap(this.canvases[index], this.level, state);

    const ended = this.turn >= last && state.status !== 'PLAYING';
    const events = replay.events[t].filter((e) => e.kind !== 'BLOCKED');
    const detections = replay.events.slice(0, t + 1).flat().filter((e) => e.kind === 'DETECTED').length;

    this.infos[index].replaceChildren(
      h(
        'div',
        { class: `cmp-outcome ${state.status.toLowerCase()}` },
        ended ? `${OUTCOME[state.status]} · turn ${last}` : `${OUTCOME[state.status]}`,
      ),
      h(
        'table',
        {},
        h('tr', {}, h('th', {}, 'PLAYER'), h('td', {}, `(${state.player.x}, ${state.player.y})`)),
        h('tr', {}, h('th', {}, 'LOOT'), h('td', {}, `${state.loot}  (${state.taken.length}/${this.level.artifacts.length})${state.curses.length ? '  ·  ' + state.curses.join(', ') : ''}`)),
        ...state.guards.map((g) =>
          h(
            'tr',
            {},
            h('th', {}, g.id + (g.hacked ? ' ⚡' : '')),
            h(
              'td',
              {},
              `(${g.pos.x}, ${g.pos.y}) `,
              h('span', { class: 'chip', style: `--c:${css(STATE_COLOR[g.state])}` }, g.state),
              g.seesPlayer ? h('span', { class: 'chip', style: `--c:${css(COLORS.red)}` }, 'SEES PLAYER') : null,
            ),
          ),
        ),
        h('tr', {}, h('th', {}, 'DETECTIONS'), h('td', {}, String(detections))),
        h('tr', {}, h('th', {}, 'TURNS RUN'), h('td', {}, String(t))),
      ),
      h('ul', { class: 'cmp-events' }, ...(events.length ? events.map((e) => h('li', { class: e.kind.toLowerCase() }, e.text)) : [h('li', { class: 'dim' }, '—')])),
    );
  }
}
