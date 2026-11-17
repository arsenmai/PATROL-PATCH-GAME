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
  /** Hides stolen artifacts. */
  setTaken(taken: readonly string[]): void;
  /** 0 = calm. Each active curse raises the alarm and pushes the hall lighting towards red. */
  setAlarm(level: number): void;
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

/** Low-poly stand-ins for the three artifacts; anything else gets a generic gem. */
function buildArtifactModel(id: string, mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  if (id === 'crown') {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.08, 10, 1, true), mat);
    (band.material as THREE.Material).side = THREE.DoubleSide;
    g.add(band);
    for (let i = 0; i < 5; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.13, 4), mat);
      const angle = (i / 5) * Math.PI * 2;
      spike.position.set(Math.cos(angle) * 0.15, 0.1, Math.sin(angle) * 0.15);
      g.add(spike);
    }
  } else if (id === 'mask') {
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.17, 7, 5, 0, Math.PI), mat);
    face.scale.set(0.85, 1.15, 0.6);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x05070d });
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.03), eyeMat);
      eye.position.set(side * 0.06, 0.04, 0.095);
      g.add(eye);
    }
    g.add(face);
  } else if (id === 'hourglass') {
    const top = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.16, 8), mat);
    top.rotation.x = Math.PI;
    top.position.y = 0.08;
    const bottom = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.16, 8), mat);
    bottom.position.y = -0.08;
    const capGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.025, 8);
    const capTop = new THREE.Mesh(capGeo, mat);
    capTop.position.y = 0.17;
    const capBottom = new THREE.Mesh(capGeo, mat);
    capBottom.position.y = -0.17;
    g.add(top, bottom, capTop, capBottom);
  } else {
    g.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), mat));
  }
  return g;
}

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
    new THREE.MeshBasicMaterial({ color: 0x4a3410 }),
  );
  sub.rotation.x = -Math.PI / 2;
  sub.position.y = -0.03;
  group.add(sub);

  // Floor plates.
  const floorMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.94, 0.08, 0.94),
    new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.55, roughness: 0.22 }),
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

  // Wall dressing: a brass skirting line wherever a wall faces a walkable tile, and a framed painting on some of them.
  const faces: { pos: THREE.Vector3; rotY: number; painted: boolean; hue: number }[] = [];
  for (const w of walls) {
    for (const d of DIRS) {
      if (!isWalkable(level, add(w, DELTA[d]))) continue;
      const pos = tileToWorld(level, w, 0);
      pos.x += DELTA[d].x * 0.505;
      pos.z += DELTA[d].y * 0.505;
      const h1 = hash(w.x * 3 + DELTA[d].x, w.y * 7 + DELTA[d].y);
      faces.push({ pos, rotY: d === 'N' || d === 'S' ? 0 : Math.PI / 2, painted: h1 > 0.6, hue: hash(w.y + 11, w.x + 5) });
    }
  }
  const place = (mesh: THREE.InstancedMesh, list: typeof faces, y: number) => {
    list.forEach((f, i) => {
      dummy.position.set(f.pos.x, y, f.pos.z);
      dummy.rotation.set(0, f.rotY, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    return mesh;
  };
  const skirting = new THREE.InstancedMesh(new THREE.BoxGeometry(0.98, 0.025, 0.02), glow(COLORS.brass, 1.1), faces.length);
  group.add(place(skirting, faces, 0.07));

  const painted = faces.filter((f) => f.painted);
  const frames = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.62, 0.34, 0.03),
    new THREE.MeshStandardMaterial({ color: 0x8a6a2a, metalness: 0.9, roughness: 0.35 }),
    painted.length,
  );
  const canvases = new THREE.InstancedMesh(new THREE.BoxGeometry(0.52, 0.24, 0.045), new THREE.MeshBasicMaterial({ color: 0xffffff }), painted.length);
  const paint = new THREE.Color();
  painted.forEach((f, i) => canvases.setColorAt(i, paint.setHSL(f.hue, 0.55, 0.32)));
  group.add(place(frames, painted, 0.33), place(canvases, painted, 0.33));

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

  // Artifacts. Loose ones float over a low plinth; the sealed one sits in a glass case on a pedestal.
  const holders = new Map<string, THREE.Group>();
  const spinners: THREE.Object3D[] = [];
  const plinthMat = new THREE.MeshStandardMaterial({ color: 0x2a3552, metalness: 0.8, roughness: 0.3 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.14, roughness: 0.05, metalness: 0.2 });
  for (const a of level.artifacts) {
    const colour = CURSE_COLOR[a.curse ?? 'NONE'];
    const base = new THREE.Group();
    base.position.copy(tileToWorld(level, a.pos));
    const lift = a.sealed ? 0.55 : 0;

    if (a.sealed) {
      const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 0.55, 6), plinthMat);
      pedestal.position.y = 0.275;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.04, 6), glow(colour, 2));
      band.position.y = 0.55;
      const glass = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.5), glassMat);
      glass.position.y = 0.92;
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(glass.geometry),
        new THREE.LineBasicMaterial({ color: 0xbfe9ff, transparent: true, opacity: 0.6 }),
      );
      edges.position.copy(glass.position);
      base.add(pedestal, band, glass, edges);
    } else {
      const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.05, 8), plinthMat);
      plinth.position.y = 0.03;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.014, 6, 24), glow(colour, 1.8));
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 0.06;
      base.add(plinth, rim);
    }

    // Everything in `holder` disappears when the artifact is stolen; the furniture stays.
    const holder = new THREE.Group();
    const model = buildArtifactModel(a.id, glow(colour, 2.3));
    model.position.y = lift + 0.42;
    const light = new THREE.PointLight(colour, a.sealed ? 5 : 2.4, a.sealed ? 4.5 : 2.6, 1.6);
    light.position.y = lift + 0.6;
    holder.add(model, light);
    base.add(holder);

    // Gallery spotlight: a faint additive cone from the ceiling down onto the exhibit.
    const beam = new THREE.Mesh(
      new THREE.ConeGeometry(0.42, 2.4, 16, 1, true),
      new THREE.MeshBasicMaterial({
        color: colour,
        transparent: true,
        opacity: 0.07,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    beam.position.y = 1.25;
    base.add(beam);
    group.add(base);
    holders.set(a.id, holder);
    spinners.push(model);
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
  const marble = new THREE.MeshStandardMaterial({ color: 0xe9e4f2, roughness: 0.35, metalness: 0.05 });
  const plaqueMat = glow(COLORS.brass, 1.2);
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
      // Information plinth with a softly lit plaque.
      const desk = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.34), propDark);
      desk.position.y = 0.08;
      const plaque = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 0.02), plaqueMat);
      plaque.position.set(0, 0.28, -0.08);
      plaque.rotation.x = -0.3;
      prop.add(desk, plaque);
    } else {
      // Marble bust on a pedestal.
      const pedestal = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.28, 0.3), marble);
      pedestal.position.y = 0.14;
      const shoulders = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.17, 0.16, 6), marble);
      shoulders.position.y = 0.36;
      const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 0), marble);
      head.position.y = 0.53;
      prop.add(pedestal, shoulders, head);
    }
    group.add(prop);
  }

  // Lighting: cool key light plus two slowly breathing neon fills.
  const ambient = new THREE.AmbientLight(0x8fa4e0, 1.1);
  const alarmRed = new THREE.Color(COLORS.red);
  group.add(ambient);
  const key = new THREE.DirectionalLight(0xcfe0ff, 2.2);
  key.position.set(-4, 10, 6);
  group.add(key);
  const fillA = new THREE.PointLight(COLORS.brass, 6, 11, 1.5);
  fillA.position.set(-3.5, 2.2, 2.5);
  const fillB = new THREE.PointLight(COLORS.cyan, 12, 11, 1.5);
  fillB.position.set(3.5, 2.2, -1.5);
  group.add(fillA, fillB);

  return {
    group,
    update(time) {
      fillA.intensity = 6 + Math.sin(time * 0.8) * 1.5;
      fillB.intensity = 12 + Math.sin(time * 0.6 + 2) * 3;
      doorMat.emissiveIntensity = 2.2 + Math.sin(time * 3) * 0.5;
      blinkMat.emissiveIntensity = Math.sin(time * 4) > 0.2 ? 2.8 : 0.2;
      cameras.forEach((c, i) => (c.rotation.y = Math.sin(time * 0.5 + i * 1.7) * 0.9));
      spinners.forEach((model, n) => {
        model.rotation.y = time * 1.2 + n * 2;
        model.position.y += Math.sin(time * 2.2 + n * 2) * 0.0008;
      });
      exitMat.opacity = 0.45 + Math.sin(time * 3) * 0.2;
    },
    setTaken(taken) {
      for (const [id, holder] of holders) holder.visible = !taken.includes(id);
    },
    setAlarm(alarm) {
      const k = Math.min(1, alarm / 3);
      fillA.color.setHex(COLORS.brass).lerp(alarmRed, k);
      fillB.color.setHex(COLORS.cyan).lerp(alarmRed, k * 0.8);
      ambient.color.setHex(0x8fa4e0).lerp(alarmRed, k * 0.35);
    },
  };
}
