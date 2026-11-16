// map.js — Kestrel Yard: the one original map. It is data first (boxes, sites,
// spawns, waypoint nodes, hold points) and geometry second: buildWorld turns
// the same box list the collision and line-of-sight tests use into meshes, so
// what you see is exactly what blocks you. Layout intent: two sites in the
// north, a contested mid, two south lanes from the Jackals' spawn, and every
// long sightline broken by at least one container or wall.

import * as THREE from 'three';
import { PALETTE } from './config.js';
import { rayAabb } from './util.js';

// kind: concrete | crate | cont0..4 (containers) | low (1.1 m cover) | metal | barrel
// x,z = centre; w,d = footprint; h = height; y0 = base height (stacked boxes).
export const BOXES = [
  // perimeter
  { x: 0, z: -22.5, w: 67, d: 1, h: 4.6, kind: 'concrete' },
  { x: 0, z: 22.5, w: 67, d: 1, h: 4.6, kind: 'concrete' },
  { x: -32.5, z: 0, w: 1, d: 46, h: 4.6, kind: 'concrete' },
  { x: 32.5, z: 0, w: 1, d: 46, h: 4.6, kind: 'concrete' },
  // ---- Site A (west, "the Foundry") ----
  { x: -24, z: -17.5, w: 6, d: 2.6, h: 2.6, kind: 'cont0' },
  { x: -24, z: -17.5, w: 6, d: 2.6, h: 2.6, y0: 2.6, kind: 'cont3' },
  { x: -27.5, z: -9, w: 5, d: 4, h: 3.4, kind: 'concrete' },
  { x: -18, z: -11, w: 1.3, d: 1.3, h: 1.3, kind: 'crate' },
  { x: -16.6, z: -11, w: 1.3, d: 1.3, h: 1.3, kind: 'crate' },
  { x: -17.3, z: -11, w: 1.3, d: 1.3, h: 1.3, y0: 1.3, kind: 'crate' },
  { x: -14.5, z: -16, w: 4.4, d: 0.6, h: 1.1, kind: 'low' },
  { x: -20.5, z: -6.5, w: 2.6, d: 6, h: 2.6, kind: 'cont1' },
  { x: -25, z: -13.5, w: 0.95, d: 0.95, h: 1.15, kind: 'barrel' },
  { x: -9.5, z: -13, w: 1, d: 6, h: 3.4, kind: 'concrete' },
  { x: -9.5, z: -3.5, w: 1, d: 4, h: 3.4, kind: 'concrete' },
  // ---- Site B (east, "the Depot") ----
  { x: 23.5, z: -16.5, w: 6.4, d: 2.6, h: 2.6, kind: 'cont2' },
  { x: 27.5, z: -8.5, w: 5, d: 5, h: 3.6, kind: 'concrete' },
  { x: 17.5, z: -10.5, w: 1.3, d: 1.3, h: 1.3, kind: 'crate' },
  { x: 18.9, z: -10.5, w: 1.3, d: 1.3, h: 1.3, kind: 'crate' },
  { x: 14.5, z: -15, w: 4.4, d: 0.6, h: 1.1, kind: 'low' },
  { x: 19, z: -19.5, w: 4.6, d: 2, h: 2.1, kind: 'metal' },
  { x: 21, z: -5.5, w: 2.6, d: 6, h: 2.6, kind: 'cont4' },
  { x: 25.5, z: -12.5, w: 0.95, d: 0.95, h: 1.15, kind: 'barrel' },
  { x: 9.5, z: -13, w: 1, d: 6, h: 3.4, kind: 'concrete' },
  { x: 9.5, z: -3.5, w: 1, d: 4, h: 3.4, kind: 'concrete' },
  // ---- Mid ----
  { x: 0, z: -2, w: 7, d: 2.6, h: 2.6, kind: 'cont0' },
  { x: -3.2, z: 4.5, w: 1.8, d: 1.8, h: 1.8, kind: 'crate' },
  { x: 3.4, z: 5.5, w: 4, d: 0.6, h: 1.1, kind: 'low' },
  { x: 3, z: -8.5, w: 2.6, d: 5, h: 2.6, kind: 'cont3' },
  { x: -4.5, z: -8, w: 1.3, d: 1.3, h: 1.3, kind: 'crate' },
  { x: -6, z: -10.5, w: 5, d: 1, h: 3.2, kind: 'concrete' },
  { x: 6.5, z: -10.5, w: 4, d: 1, h: 3.2, kind: 'concrete' },
  // ---- South lanes (Jackals side) ----
  { x: -14, z: 8, w: 2.6, d: 7, h: 2.6, kind: 'cont1' },
  { x: -20, z: 2, w: 1.8, d: 1.8, h: 1.8, kind: 'crate' },
  { x: -8, z: 12.5, w: 4, d: 0.6, h: 1.1, kind: 'low' },
  { x: -21, z: 12, w: 6, d: 2.6, h: 2.6, kind: 'cont4' },
  { x: 14, z: 8, w: 2.6, d: 7, h: 2.6, kind: 'cont2' },
  { x: 20, z: 3, w: 1.8, d: 1.8, h: 1.8, kind: 'crate' },
  { x: 8.5, z: 13, w: 4, d: 0.6, h: 1.1, kind: 'low' },
  { x: 21, z: 12.5, w: 6, d: 2.6, h: 2.6, kind: 'cont0' },
  // ---- Spawn dressing ----
  { x: -4, z: 14.5, w: 3.4, d: 0.6, h: 1.1, kind: 'low' },
  { x: 4.5, z: 14.5, w: 3.4, d: 0.6, h: 1.1, kind: 'low' },
  { x: 0, z: 9.5, w: 1.8, d: 1.8, h: 1.8, kind: 'crate' },
  { x: -5, z: -14.5, w: 1.8, d: 1.8, h: 1.8, kind: 'crate' },
  { x: 5.5, z: -14.5, w: 1.8, d: 1.8, h: 1.8, kind: 'crate' },
  { x: -14, z: -19.5, w: 4, d: 0.6, h: 1.1, kind: 'low' },
  { x: 13, z: -20, w: 0.95, d: 0.95, h: 1.15, kind: 'barrel' },
];

export const BOUNDS = { minX: -31.8, maxX: 31.8, minZ: -21.8, maxZ: 21.8 };

export const SITES = [
  { id: 'A', x: -21, z: -13.5, r: 6.2, color: PALETTE.siteA },
  { id: 'B', x: 21, z: -13, r: 6.2, color: PALETTE.siteB },
];

export const SPAWNS = {
  atk: [[-6, 18.5], [-3, 19.5], [0, 18.5], [3, 19.5], [6, 18.5]],
  def: [[-6, -18.5], [-3, -19.5], [0, -18.5], [3, -19.5], [6, -18.5]],
};

// Waypoint graph nodes; edges are derived at load (near + line of sight).
export const NODES = [
  { x: -4, z: 17, t: 'spawnA' }, { x: 4, z: 17, t: 'spawnA' }, { x: 0, z: 13, t: 'lane' },
  { x: -9, z: 9, t: 'lane' }, { x: 9, z: 9.5, t: 'lane' }, { x: -16, z: 13, t: 'lane' },
  { x: 16.5, z: 13.5, t: 'lane' }, { x: -12, z: 3, t: 'lane' }, { x: 12, z: 3.5, t: 'lane' },
  { x: -19, z: 6.5, t: 'lane' }, { x: 19.5, z: 7, t: 'lane' }, { x: -6, z: -1, t: 'mid' },
  { x: 6, z: 0, t: 'mid' }, { x: 0, z: 6.5, t: 'mid' }, { x: -1.5, z: -6, t: 'mid' },
  { x: 5.5, z: -6.5, t: 'mid' }, { x: -12, z: -7.5, t: 'lane' }, { x: 12.5, z: -7, t: 'lane' },
  { x: -6, z: -12.5, t: 'lane' }, { x: 6, z: -12.5, t: 'lane' }, { x: -13, z: -11, t: 'siteA' },
  { x: -22.5, z: -10.5, t: 'siteA' }, { x: -24, z: -13, t: 'siteA' }, { x: -16.5, z: -17, t: 'siteA' },
  { x: 13.5, z: -10.5, t: 'siteB' }, { x: 21, z: -9, t: 'siteB' }, { x: 23.5, z: -13, t: 'siteB' },
  { x: 16.5, z: -17.5, t: 'siteB' }, { x: -4, z: -17, t: 'spawnD' }, { x: 4, z: -17, t: 'spawnD' },
  { x: -11, z: -18.5, t: 'lane' }, { x: 11, z: -18.5, t: 'lane' },
  // lane links south of the long containers: without them the outer-lane
  // nodes pair off into islands the graph cannot route out of
  { x: -16, z: 2.5, t: 'lane' }, { x: 16, z: 2.5, t: 'lane' },
];

// Defender hold points and attacker post-plant spots: position + facing yaw.
export const HOLDS = {
  defA: [
    { x: -24, z: -11.2, yaw: 2.6 }, { x: -16.8, z: -16.8, yaw: 2.2 }, { x: -12.2, z: -12.6, yaw: -1.9 },
  ],
  defB: [
    { x: 24, z: -10.8, yaw: -2.6 }, { x: 16.8, z: -16.6, yaw: -2.2 }, { x: 12.8, z: -12.2, yaw: 1.9 },
  ],
  defMid: [{ x: 1.8, z: -6.2, yaw: 3.1 }, { x: -5.8, z: -11.8, yaw: 2.8 }],
  postA: [
    { x: -25.5, z: -10, yaw: 0.7 }, { x: -17, z: -8.6, yaw: -0.5 }, { x: -13.5, z: -15, yaw: -2.4 },
  ],
  postB: [
    { x: 25.5, z: -9.5, yaw: -0.7 }, { x: 17.5, z: -8.2, yaw: 0.5 }, { x: 14, z: -14.5, yaw: 2.4 },
  ],
};

// Precomputed three.js bounds per box, shared by every spatial query.
for (const b of BOXES) {
  const y0 = b.y0 || 0;
  b.min = new THREE.Vector3(b.x - b.w / 2, y0, b.z - b.d / 2);
  b.max = new THREE.Vector3(b.x + b.w / 2, y0 + b.h, b.z + b.d / 2);
}

// Circle (x,z,r) vs the yard: pushes the circle out of every box it overlaps
// and clamps it inside the perimeter. Mutates and returns the {x,z} object.
export function collideCircle(p, r) {
  p.x = Math.max(BOUNDS.minX + r, Math.min(BOUNDS.maxX - r, p.x));
  p.z = Math.max(BOUNDS.minZ + r, Math.min(BOUNDS.maxZ - r, p.z));
  for (const b of BOXES) {
    if (b.h < 0.9) continue;
    const nx = Math.max(b.min.x, Math.min(b.max.x, p.x));
    const nz = Math.max(b.min.z, Math.min(b.max.z, p.z));
    const dx = p.x - nx, dz = p.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        p.x = nx + (dx / d) * r; p.z = nz + (dz / d) * r;
      } else {
        // centre inside the box: leave by the shallowest face
        const l = p.x - b.min.x, rt = b.max.x - p.x, tp = p.z - b.min.z, bt = b.max.z - p.z;
        const m = Math.min(l, rt, tp, bt);
        if (m === l) p.x = b.min.x - r; else if (m === rt) p.x = b.max.x + r;
        else if (m === tp) p.z = b.min.z - r; else p.z = b.max.z + r;
      }
    }
  }
  return p;
}

// Does the straight 3D segment o->o+d*maxT hit any box first? Returns the
// nearest hit distance, or -1. Barrels and low cover count: they stop bullets.
export function raycastMap(ox, oy, oz, dx, dy, dz, maxT) {
  let best = -1;
  for (const b of BOXES) {
    const t = rayAabb(ox, oy, oz, dx, dy, dz, b.min, b.max);
    if (t >= 0 && t <= maxT && (best < 0 || t < best)) best = t;
  }
  // the floor
  if (dy < -1e-6) {
    const t = -oy / dy;
    if (t >= 0 && t <= maxT && (best < 0 || t < best)) best = t;
  }
  return best;
}

export function losClear(x1, y1, z1, x2, y2, z2) {
  const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 0.01) return true;
  const t = raycastMap(x1, y1, z1, dx / dist, dy / dist, dz / dist, dist - 0.05);
  return t < 0;
}

// ---------- geometry ----------

function groundTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 704;
  const g = c.getContext('2d');
  g.fillStyle = '#3d4148'; g.fillRect(0, 0, 1024, 704);
  // asphalt noise
  for (let i = 0; i < 5200; i++) {
    g.fillStyle = `rgba(${20 + Math.random() * 40 | 0},${22 + Math.random() * 40 | 0},${26 + Math.random() * 40 | 0},.25)`;
    g.fillRect(Math.random() * 1024, Math.random() * 704, 2, 2);
  }
  const px = (x) => (x + 32.5) / 65 * 1024, pz = (z) => (z + 22.5) / 45 * 704;
  // lane paint
  g.strokeStyle = 'rgba(214,205,178,.5)'; g.lineWidth = 3; g.setLineDash([16, 12]);
  g.beginPath(); g.moveTo(px(0), pz(21)); g.lineTo(px(0), pz(-21)); g.stroke();
  g.beginPath(); g.moveTo(px(-28), pz(6)); g.lineTo(px(28), pz(6)); g.stroke();
  g.setLineDash([]);
  // site zones
  for (const s of SITES) {
    g.strokeStyle = `#${s.color.toString(16).padStart(6, '0')}`;
    g.fillStyle = `#${s.color.toString(16).padStart(6, '0')}22`;
    g.lineWidth = 5;
    g.beginPath(); g.arc(px(s.x), pz(s.z), s.r / 65 * 1024, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = `#${s.color.toString(16).padStart(6, '0')}`;
    g.font = '900 64px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(s.id, px(s.x), pz(s.z));
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const KIND_STYLE = {
  concrete: () => new THREE.MeshStandardMaterial({ color: PALETTE.concrete, roughness: .95 }),
  crate: () => new THREE.MeshStandardMaterial({ color: PALETTE.crate, roughness: .9 }),
  low: () => new THREE.MeshStandardMaterial({ color: PALETTE.concreteDark, roughness: .95 }),
  metal: () => new THREE.MeshStandardMaterial({ color: PALETTE.metal, roughness: .55, metalness: .55 }),
  barrel: () => new THREE.MeshStandardMaterial({ color: 0x7a4a2c, roughness: .7, metalness: .3 }),
};

export function buildWorld(scene) {
  // sky dome with a painted dusk gradient
  const sc = document.createElement('canvas');
  sc.width = 4; sc.height = 256;
  const sg = sc.getContext('2d');
  const grad = sg.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#22374e'); grad.addColorStop(0.55, '#51606e');
  grad.addColorStop(0.78, '#c98a5a'); grad.addColorStop(1, '#e8a869');
  sg.fillStyle = grad; sg.fillRect(0, 0, 4, 256);
  const skyTex = new THREE.CanvasTexture(sc);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(220, 24, 12),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }),
  );
  scene.add(sky);
  scene.fog = new THREE.Fog(PALETTE.fog, 55, 165);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(65, 45),
    new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // lights: low warm sun + sky bounce
  const sun = new THREE.DirectionalLight(PALETTE.sun, 2.6);
  sun.position.set(-38, 42, 26);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -45; sun.shadow.camera.right = 45;
  sun.shadow.camera.top = 45; sun.shadow.camera.bottom = -45;
  sun.shadow.camera.far = 140; sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 0.85));

  // boxes, with a darker edge line on crates and containers for readability
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x14161a, transparent: true, opacity: .35 });
  for (const b of BOXES) {
    let mesh;
    if (b.kind === 'barrel') {
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.47, b.h, 12),
        KIND_STYLE.barrel());
      mesh.position.set(b.x, (b.y0 || 0) + b.h / 2, b.z);
    } else {
      const style = b.kind.startsWith('cont')
        ? new THREE.MeshStandardMaterial({ color: PALETTE.containers[+b.kind.slice(4)], roughness: .62, metalness: .35 })
        : KIND_STYLE[b.kind]();
      mesh = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), style);
      mesh.position.set(b.x, (b.y0 || 0) + b.h / 2, b.z);
      if (b.kind === 'crate' || b.kind.startsWith('cont')) {
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), edgeMat);
        mesh.add(edges);
      }
    }
    mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh);
  }

  // skyline silhouettes outside the walls, for depth at the horizon
  const silMat = new THREE.MeshBasicMaterial({ color: 0x27313d, fog: false });
  const silGeo = new THREE.BoxGeometry(1, 1, 1);
  const silSpots = [
    [-70, -60, 26, 34], [-30, -75, 18, 22], [15, -70, 30, 40], [60, -62, 22, 28],
    [-75, 10, 20, 26], [75, 20, 24, 30], [-55, 65, 28, 20], [40, 70, 20, 24], [80, -20, 16, 36],
  ];
  for (const [x, z, w, h] of silSpots) {
    const m = new THREE.Mesh(silGeo, silMat);
    m.scale.set(w, h, w * 0.7); m.position.set(x, h / 2 - 1, z);
    scene.add(m);
  }
  return { sun };
}
