import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Dir } from '../sim/types';
import { COLORS } from './palette';

/** Models face +Z (south) at rotation 0. */
export const FACING_ANGLE: Record<Dir, number> = { S: 0, E: Math.PI / 2, N: Math.PI, W: -Math.PI / 2 };

const metal = new THREE.MeshStandardMaterial({ color: 0xaab9e0, metalness: 0.55, roughness: 0.35 });
const dark = new THREE.MeshStandardMaterial({ color: 0x3a4568, metalness: 0.6, roughness: 0.5 });
const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false });
const shadowGeo = new THREE.CircleGeometry(0.34, 20);

function blobShadow(): THREE.Mesh {
  const s = new THREE.Mesh(shadowGeo, shadowMat);
  s.rotation.x = -Math.PI / 2;
  s.position.y = 0.011;
  return s;
}

export interface GuardModel {
  root: THREE.Group;
  /** Emissive accent; recoloured to show the FSM state. */
  accent: THREE.MeshStandardMaterial;
  hackGlyph: THREE.Mesh;
  body: THREE.Group;
}

export function createGuardModel(): GuardModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  const accent = new THREE.MeshStandardMaterial({ color: 0x05070d, emissive: COLORS.cyan, emissiveIntensity: 2.2 });

  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 0.16, 8), dark);
  skirt.position.y = 0.14;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.018, 6, 20), accent);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.08;
  ring.name = 'state-ring';
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.24, 0.38, 6), metal);
  torso.position.y = 0.42;
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.02), accent);
  chest.position.set(0, 0.46, 0.2);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.06, 6), dark);
  neck.position.y = 0.64;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.2, 0.28), metal);
  head.position.y = 0.77;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.06, 0.03), accent);
  visor.position.set(0, 0.78, 0.14);
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.2, 4), dark);
  antenna.position.set(0.1, 0.96, -0.06);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), accent);
  tip.position.set(0.1, 1.07, -0.06);
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.26, 0.1), dark);
    arm.position.set(side * 0.27, 0.42, 0);
    body.add(arm);
  }
  body.add(skirt, ring, torso, chest, neck, head, visor, antenna, tip);

  const hackGlyph = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.11, 0),
    new THREE.MeshStandardMaterial({ color: 0x05070d, emissive: COLORS.green, emissiveIntensity: 3, wireframe: true }),
  );
  hackGlyph.position.y = 1.62;
  hackGlyph.visible = false;

  body.scale.setScalar(1.3);
  root.add(blobShadow(), body, hackGlyph);
  return { root, accent, hackGlyph, body };
}

/** Target height of a guard model in world units (one tile is 1). */
const GUARD_HEIGHT = 1.05;
let guardTemplate: Promise<THREE.Object3D | null> | null = null;

/**
 * Optional authored robot: public/models/guard.glb. Resolves to null when the file is missing or broken,
 * in which case the procedural robot stays. Loaded once and shared by every scene.
 */
export function loadGuardTemplate(): Promise<THREE.Object3D | null> {
  guardTemplate ??= new Promise((resolve) => {
    new GLTFLoader().load(
      'models/guard.glb',
      (gltf) => {
        const model = gltf.scene;
        // Normalise: feet on the floor, centred on the tile, a fixed height whatever the source scale was.
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const scale = GUARD_HEIGHT / Math.max(size.y, 1e-6);
        const centre = box.getCenter(new THREE.Vector3());
        model.position.set(-centre.x * scale, -box.min.y * scale, -centre.z * scale);
        model.scale.setScalar(scale);
        const wrapper = new THREE.Group();
        wrapper.add(model);
        resolve(wrapper);
      },
      undefined,
      () => resolve(null),
    );
  });
  return guardTemplate;
}

/** Swaps the primitive robot body for the authored one. The state ring and hack glyph are kept. */
export function applyGuardTemplate(guard: GuardModel, template: THREE.Object3D): void {
  const ring = guard.body.children.find((c) => c.name === 'state-ring');
  guard.body.clear();
  guard.body.scale.setScalar(1);
  if (ring) {
    ring.scale.setScalar(1.3);
    guard.body.add(ring);
  }
  guard.body.add(template.clone(true));
  guard.hackGlyph.position.y = GUARD_HEIGHT + 0.35;
}

export interface PlayerModel {
  root: THREE.Group;
  body: THREE.Group;
  accent: THREE.MeshStandardMaterial;
}

export function createPlayerModel(): PlayerModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  const accent = new THREE.MeshStandardMaterial({ color: 0x05070d, emissive: COLORS.green, emissiveIntensity: 2.4 });
  const cloth = new THREE.MeshStandardMaterial({ color: 0xe8eeff, roughness: 0.6, metalness: 0.1 });

  const coat = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.21, 0.46, 7), cloth);
  coat.position.y = 0.25;
  const hood = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, 0), cloth);
  hood.position.y = 0.58;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.035, 0.03), accent);
  visor.position.set(0, 0.59, 0.13);
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.08), dark);
  pack.position.set(0, 0.34, -0.15);
  const packLight = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.03, 0.01), accent);
  packLight.position.set(0, 0.38, -0.195);
  body.add(coat, hood, visor, pack, packLight);

  const ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.34, 28), accent);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.014;

  body.scale.setScalar(1.35);
  const beacon = new THREE.PointLight(COLORS.green, 2.5, 2.2, 1.5);
  beacon.position.y = 0.9;
  root.add(blobShadow(), ring, body, beacon);
  return { root, body, accent };
}
