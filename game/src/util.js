// util.js — small shared helpers: a seeded RNG (so staged scenes and bot
// behaviour are reproducible), scalar math, and the ray-vs-AABB test every
// line-of-sight and bullet query in the game is built on.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));
export const TAU = Math.PI * 2;

// Shortest signed angular difference a-b, in (-PI, PI].
export function angDiff(a, b) {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

// Ray (origin o, unit direction d) against an axis-aligned box given by min/max
// THREE.Vector3s. Returns the entry distance, or -1 for no hit. Slab method.
export function rayAabb(ox, oy, oz, dx, dy, dz, min, max) {
  let tmin = 0, tmax = Infinity;
  if (Math.abs(dx) < 1e-9) { if (ox < min.x || ox > max.x) return -1; }
  else {
    let t1 = (min.x - ox) / dx, t2 = (max.x - ox) / dx;
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return -1;
  }
  if (Math.abs(dy) < 1e-9) { if (oy < min.y || oy > max.y) return -1; }
  else {
    let t1 = (min.y - oy) / dy, t2 = (max.y - oy) / dy;
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return -1;
  }
  if (Math.abs(dz) < 1e-9) { if (oz < min.z || oz > max.z) return -1; }
  else {
    let t1 = (min.z - oz) / dz, t2 = (max.z - oz) / dz;
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return -1;
  }
  return tmin;
}

// Ray against a sphere; returns entry distance or -1.
export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = cx - ox, ly = cy - oy, lz = cz - oz;
  const r2 = r * r;
  const l2 = lx * lx + ly * ly + lz * lz;
  if (l2 < r2) return 0; // origin inside the sphere: a point-blank hit
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca < 0) return -1;
  const d2 = l2 - tca * tca;
  if (d2 > r2) return -1;
  return tca - Math.sqrt(r2 - d2);
}

// Segment (a->b) against a sphere; true when the segment passes through it.
// Used for smoke: a sight line that crosses a smoke cloud is blocked.
export function segmentSphere(ax, ay, az, bx, by, bz, cx, cy, cz, r) {
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const len2 = abx * abx + aby * aby + abz * abz;
  let t = len2 > 0 ? ((cx - ax) * abx + (cy - ay) * aby + (cz - az) * abz) / len2 : 0;
  t = clamp(t, 0, 1);
  const px = ax + abx * t - cx, py = ay + aby * t - cy, pz = az + abz * t - cz;
  return px * px + py * py + pz * pz < r * r;
}

export function fmtTime(sec) {
  sec = Math.max(0, Math.ceil(sec));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}
