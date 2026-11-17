import * as THREE from 'three';
import { DELTA, DIRS, add, isWalkable, tileAt } from '../sim/grid';
import { findPath } from '../sim/pathfinding';
import type { Level, Vec } from '../sim/types';
import { COLORS, CURSE_COLOR } from './palette';

export const WALL_H = 0.55;

export interface Environment {
  group: THREE.Group;
  /** Called every frame with elapsed seconds; drives the few ambient animations. */
  update(time: number): void;
  /** Hides stolen prototypes and marks the terminal as breached. */
  setTaken(taken: readonly string[]): void;
}

/** Converts a tile coordinate to the world-space centre of that tile. */
export const tileToWorld = (level: Level, p: Vec, y = 0): THREE.Vector3 =>
  new THREE.Vector3(p.x - level.width / 2 + 0.5, y, p.y - level.height / 2 + 0.5);

const glow = (color: number, intensity = 1.6): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color: 0x05070d, emissive: color, emissiveIntensity: intensity, roughness: 0.4 });

/** Deterministic pseudo-noise so tile tint never changes between reloads. */
const hash = (x: number, y: number): number => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

export function buildEnvironment(level: Level): Environment {
  const group = new THREE.Group();
  const dummy = new THREE.Object3D();
  const floors: Vec[] = [];
  const walls: Vec[] = [];
  for (let y = 0; y < level.height; y++) {
    for (let x = 0; x < level.width; x++) (tileAt(level, { x, y }) === '#' ? walls : floors).push({ x, y });
  }

  // Glowing sub-floor: visible only through the seams between floor plates.
  const sub = new THREE.Mesh(
    new THREE.PlaneGeometry(level.width, level.height),
    new THREE.MeshBasicMaterial({ color: 0x0b3a66 }),
  );
  sub.rotation.x = -Math.PI / 2;
  sub.position.y = -0.03;
  group.add(sub);

  // Floor plates.
  const floorMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.94, 0.08, 0.94),
    new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.75, roughness: 0.38 }),
    floors.length,
  );
  const tint = new THREE.Color();
  floors.forEach((p, i) => {
    dummy.position.copy(tileToWorld(level, p, -0.04));
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    floorMesh.setMatrixAt(i, dummy.matrix);
    tint.setHex((p.x + p.y) % 2 ? COLORS.floor : COLORS.floorAlt).offsetHSL(0, 0, (hash(p.x, p.y) - 0.5) * 0.025);
    floorMesh.setColorAt(i, tint);
  });
  group.add(floorMesh);

  // Walls.
  const wallMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, WALL_H, 1),
    new THREE.MeshStandardMaterial({ color: COLORS.wall, metalness: 0.6, roughness: 0.5 }),
    walls.length,
  );
  const capMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.86, 0.03, 0.86),
    new THREE.MeshStandardMaterial({ color: COLORS.wallTop, metalness: 0.7, roughness: 0.35 }),
    walls.length,
  );
  walls.forEach((p, i) => {
    dummy.position.copy(tileToWorld(level, p, WALL_H / 2));
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    wallMesh.setMatrixAt(i, dummy.matrix);
    dummy.position.y = WALL_H + 0.015;
    dummy.updateMatrix();
    capMesh.setMatrixAt(i, dummy.matrix);
  });
  group.add(wallMesh, capMesh);

  // Neon wall panels: one strip wherever a wall faces a walkable tile.
  const strips: { pos: THREE.Vector3; rotY: number; purple: boolean }[] = [];
  for (const w of walls) {
    for (const d of DIRS) {
      if (!isWalkable(level, add(w, DELTA[d]))) continue;
      const pos = tileToWorld(level, w, WALL_H * 0.62);
      pos.x += DELTA[d].x * 0.505;
      pos.z += DELTA[d].y * 0.505;
      strips.push({ pos, rotY: d === 'N' || d === 'S' ? 0 : Math.PI / 2, purple: hash(w.x * 3 + 1, w.y * 7 + 2) > 0.55 });
    }
  }
  const stripGeo = new THREE.BoxGeometry(0.72, 0.035, 0.02);
  const stripMats = [glow(COLORS.cyan, 1.3), glow(COLORS.purple, 1.7)];
  [false, true].forEach((purple, m) => {
    const list = strips.filter((s) => s.purple === purple);
    const mesh = new THREE.InstancedMesh(stripGeo, stripMats[m], list.length);
    list.forEach((s, i) => {
      dummy.position.copy(s.pos);
      dummy.rotation.set(0, s.rotY, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    group.add(mesh);
  });

  // Patrol routes, drawn as dashed loops on the floor.
  for (const def of level.guards) {
    if (def.route.length < 2) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.34, 0.39, 24),
        new THREE.MeshBasicMaterial({ color: COLORS.cyan, transparent: true, opacity: 0.35 }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.copy(tileToWorld(level, def.route[0], 0.012));
      group.add(ring);
      continue;
    }
    const pts: THREE.Vector3[] = [tileToWorld(level, def.route[0], 0.015)];
    def.route.forEach((wp, i) => {
      const next = def.route[(i + 1) % def.route.length];
      for (const p of findPath(level, wp, next) ?? []) pts.push(tileToWorld(level, p, 0.015));
    });
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineDashedMaterial({ color: COLORS.cyan, dashSize: 0.16, gapSize: 0.14, transparent: true, opacity: 0.4 }),
    );
    line.computeLineDistances();
    group.add(line);
  }

  // Vault door.
  const doorMat = glow(COLORS.magenta, 2.2);
  if (level.door) {
    const base = tileToWorld(level, level.door);
    const postGeo = new THREE.BoxGeometry(0.07, 0.95, 0.5);
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(postGeo, doorMat);
      post.position.set(base.x + side * 0.46, 0.475, base.z);
      group.add(post);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.99, 0.07, 0.5), doorMat);
    beam.position.set(base.x, 0.95, base.z);
    group.add(beam);
    const sill = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.012, 0.1), doorMat);
    sill.position.set(base.x, 0.008, base.z);
    group.add(sill);
  }

  // Central computer.
  const t = tileToWorld(level, level.terminal);
  const screenMat = glow(COLORS.cyan, 2.4);
  const terminal = new THREE.Group();
  terminal.position.copy(t);
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.42, 0.7, 6),
    new THREE.MeshStandardMaterial({ color: 0x232f4d, metalness: 0.8, roughness: 0.3 }),
  );
  body.position.y = 0.35;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.05, 6), screenMat);
  band.position.y = 0.72;
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), screenMat);
  core.position.y = 1.15;
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.012, 6, 32), screenMat);
  halo.position.y = 1.15;
  const terminalLight = new THREE.PointLight(COLORS.cyan, 5, 5, 1.6);
  terminalLight.position.y = 1.3;
  terminal.add(body, band, core, halo, terminalLight);
  group.add(terminal);

  // Loose prototypes: a low plinth with a floating gem, tinted by the countermeasure it is wired to.
  const gems = new Map<string, THREE.Group>();
  const plinthMat = new THREE.MeshStandardMaterial({ color: 0x2a3552, metalness: 0.8, roughness: 0.3 });
  for (const a of level.artifacts) {
    if (a.terminal) continue;
    const colour = CURSE_COLOR[a.curse ?? 'NONE'];
    const holder = new THREE.Group();
    holder.position.copy(tileToWorld(level, a.pos));
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.05, 8), plinthMat);
    plinth.position.y = 0.03;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.014, 6, 24), glow(colour, 1.8));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.06;
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.15 + a.value / 4000, 0), glow(colour, 2.2));
    gem.name = 'gem';
    gem.position.y = 0.5;
    const light = new THREE.PointLight(colour, 2.2, 2.4, 1.6);
    light.position.y = 0.6;
    holder.add(plinth, rim, gem, light);
    group.add(holder);
    gems.set(a.id, holder);
  }

  // Extraction pad on the start tile.
  const exitMat = new THREE.MeshBasicMaterial({ color: COLORS.green, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
  const exitPad = new THREE.Group();
  exitPad.position.copy(tileToWorld(level, level.start, 0.013));
  const frame = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.46, 4, 1, Math.PI / 4), exitMat);
  frame.rotation.x = -Math.PI / 2;
  exitPad.add(frame);
  group.add(exitPad);

  // Decorative props sitting on top of walls. They never affect the simulation.
  const blinkMat = glow(COLORS.red, 2.5);
  const propDark = new THREE.MeshStandardMaterial({ color: 0x2a3552, metalness: 0.7, roughness: 0.4 });
  const tankMat = new THREE.MeshStandardMaterial({
    color: 0x1a1238,
    emissive: COLORS.purple,
    emissiveIntensity: 0.8,
    transparent: true,
    opacity: 0.85,
    roughness: 0.2,
  });
  const consoleScreen = glow(COLORS.purple, 1.8);
  const cameras: THREE.Group[] = [];
  for (const d of level.decor) {
    const prop = new THREE.Group();
    prop.position.copy(tileToWorld(level, d, WALL_H + 0.03));
    if (d.type === 'camera') {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.3, 6), propDark);
      mast.position.y = 0.15;
      const head = new THREE.Group();
      head.position.y = 0.33;
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.24), propDark);
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), blinkMat);
      led.position.set(0, 0.03, 0.125);
      head.add(box, led);
      head.rotation.x = 0.35;
      prop.add(mast, head);
      cameras.push(head);
    } else if (d.type === 'console') {
      const desk = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.2, 0.4), propDark);
      desk.position.y = 0.1;
      const screen = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.26, 0.02), consoleScreen);
      screen.position.set(0, 0.34, -0.1);
      screen.rotation.x = -0.25;
      prop.add(desk, screen);
    } else {
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.5, 8), tankMat);
      tank.position.y = 0.3;
      const capGeo = new THREE.CylinderGeometry(0.23, 0.23, 0.05, 8);
      const bottom = new THREE.Mesh(capGeo, propDark);
      bottom.position.y = 0.03;
      const top = new THREE.Mesh(capGeo, propDark);
      top.position.y = 0.57;
      prop.add(tank, bottom, top);
    }
    group.add(prop);
  }

  // Lighting: cool key light plus two slowly breathing neon fills.
  group.add(new THREE.AmbientLight(0x8fa4e0, 1.1));
  const key = new THREE.DirectionalLight(0xcfe0ff, 2.2);
  key.position.set(-4, 10, 6);
  group.add(key);
  const fillA = new THREE.PointLight(COLORS.purple, 14, 11, 1.5);
  fillA.position.set(-3.5, 2.2, 2.5);
  const fillB = new THREE.PointLight(COLORS.cyan, 12, 11, 1.5);
  fillB.position.set(3.5, 2.2, -1.5);
  group.add(fillA, fillB);

  return {
    group,
    update(time) {
      core.rotation.y = time * 1.2;
      core.position.y = 1.15 + Math.sin(time * 2) * 0.04;
      halo.rotation.x = Math.PI / 2 + Math.sin(time * 0.9) * 0.5;
      halo.rotation.y = time * 0.7;
      fillA.intensity = 14 + Math.sin(time * 0.8) * 3;
      fillB.intensity = 12 + Math.sin(time * 0.6 + 2) * 3;
      doorMat.emissiveIntensity = 2.2 + Math.sin(time * 3) * 0.5;
      blinkMat.emissiveIntensity = Math.sin(time * 4) > 0.2 ? 2.8 : 0.2;
      cameras.forEach((c, i) => (c.rotation.y = Math.sin(time * 0.5 + i * 1.7) * 0.9));
      let n = 0;
      for (const holder of gems.values()) {
        const gem = holder.getObjectByName('gem');
        if (gem) {
          gem.rotation.y = time * 1.4 + n;
          gem.position.y = 0.5 + Math.sin(time * 2.2 + n) * 0.05;
        }
        n++;
      }
      exitMat.opacity = 0.45 + Math.sin(time * 3) * 0.2;
    },
    setTaken(taken) {
      for (const [id, holder] of gems) holder.visible = !taken.includes(id);
      const breached = level.artifacts.some((a) => a.terminal && taken.includes(a.id));
      const c = breached ? COLORS.green : COLORS.cyan;
      screenMat.emissive.setHex(c);
      terminalLight.color.setHex(c);
      terminalLight.intensity = breached ? 12 : 5;
    },
  };
}
