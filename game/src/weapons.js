// weapons.js — inventory, buying, reloads, the firing model, and the meshes
// for guns (the player's viewmodel and the simple gun a bot carries).
// The firing model is the game's thesis: spread is a cone whose size comes
// from the shooter's state — moving, airborne or spraying all bloom it, a
// settled crouched first shot is nearly exact — so stopping to aim pays.

import * as THREE from 'three';
import { WEAPONS, NADES, ARMOR_PRICE } from './config.js';
import { gunState, eyePos, traceShot, damage } from './combat.js';
import { clamp } from './util.js';

export const currentGun = (c) => c.weapons[c.weapons.current];

export function equip(c, slot, now) {
  if (!c.weapons[slot] || c.weapons.current === slot) return;
  c.weapons.current = slot;
  c.reloadUntil = 0;
  c.switchUntil = now + (slot === 'sidearm' ? 0.28 : 0.45);
}

export function giveWeapon(c, id) {
  const g = gunState(id);
  if (g.def.slot === 'primary') { c.weapons.primary = g; c.weapons.current = 'primary'; }
  else { c.weapons.sidearm = g; c.weapons.current = 'sidearm'; }
}

export function buyWeapon(c, id) {
  const def = WEAPONS[id];
  if (!def || c.money < def.price) return false;
  if (def.slot === 'primary' && c.weapons.primary?.id === id) return false;
  if (def.slot === 'sidearm' && c.weapons.sidearm?.id === id) return false;
  c.money -= def.price;
  giveWeapon(c, id);
  return true;
}

export function buyArmor(c) {
  if (c.armor >= 100 || c.money < ARMOR_PRICE) return false;
  c.money -= ARMOR_PRICE;
  c.armor = 100;
  return true;
}

export function buyNade(c, kind) {
  const def = NADES[kind];
  if (!def || c.money < def.price || c.nades[kind] >= 1) return false;
  c.money -= def.price;
  c.nades[kind]++;
  return true;
}

export function startReload(G, c) {
  const g = currentGun(c);
  if (c.reloadUntil > 0 || g.mag >= g.def.mag || g.reserve <= 0) return;
  c.reloadUntil = G.now + g.def.reload;
  c.reloadGun = g;
  if (c.isPlayer) G.audio.reload();
}

export function stepWeapon(G, c) {
  if (c.reloadUntil > 0 && G.now >= c.reloadUntil) {
    const g = c.reloadGun;
    c.reloadUntil = 0;
    if (g && c.weapons[c.weapons.current] === g || g === c.weapons.primary || g === c.weapons.sidearm) {
      const need = g.def.mag - g.mag;
      const take = Math.min(need, g.reserve);
      g.mag += take; g.reserve -= take;
    }
  }
  // bloom (spray inaccuracy) recovers when not firing
  if (G.now - c.lastShotAt > 0.12) c.bloom = Math.max(0, c.bloom - G.dt * 2.6);
}

// Current shot-cone half-angle in degrees for this combatant and gun.
export function spreadFor(G, c, g) {
  const def = g.def;
  const hs = Math.hypot(c.vel.x, c.vel.z);
  const moveMult = 1 + clamp(hs / 4.6, 0, 1.15) * (def.moveSpread - 1);
  let s = def.spread * moveMult;
  if (!c.onGround) s *= 3.4;
  if (c.crouch) s *= 0.7;
  if (c.walk) s *= 0.82;
  s += c.bloom;
  if (G.now - c.lastShotAt > 0.85) s *= 0.42; // settled first shot
  if (c.scoped) s *= 0.25;
  return s;
}

const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _r = new THREE.Vector3();

// Fire one shot (all pellets) if the gun is ready. dir is the shooter's aim
// direction (unit). Returns true when a round actually left the barrel.
export function tryFire(G, c, dir) {
  const now = G.now;
  const g = currentGun(c);
  if (!g || now < c.nextShotAt || now < c.switchUntil || c.reloadUntil > 0 || !c.alive) return false;
  if (g.mag <= 0) {
    if (c.isPlayer && now - (c.lastDryAt || 0) > 0.3) { G.audio.dryFire(); c.lastDryAt = now; startReload(G, c); }
    c.nextShotAt = now + 0.25;
    return false;
  }
  const def = g.def;
  g.mag--;
  c.lastShotAt = now;
  c.nextShotAt = now + 60 / def.rpm;
  c.bloom = Math.min(3.4, c.bloom + def.bloom);
  eyePos(c, _o);
  _r.set(-dir.z, 0, dir.x); // right vector on the ground plane
  const mx = _o.x + dir.x * 0.5 + _r.x * 0.16, my = _o.y - 0.14, mz = _o.z + dir.z * 0.5 + _r.z * 0.16;
  G.fx.muzzle(mx, my, mz, c.isPlayer ? 1 : 0.8);
  G.audio.shot(def.snd, c.pos.x, c.pos.z, G.listener, c.isPlayer);
  G.noise.push({ x: c.pos.x, z: c.pos.z, r: 27, team: c.team, at: now, kind: 'shot' });
  const spreadRad = spreadFor(G, c, g) * Math.PI / 180;
  for (let p = 0; p < def.pellets; p++) {
    // random point in the spread cone, built on an orthonormal basis
    // around the aim direction: u = normalize(cross(dir, up)), v = cross(dir, u)
    const a = G.rng() * Math.PI * 2, rr = Math.sqrt(G.rng()) * spreadRad;
    _d.copy(dir);
    let uxv = dir.z, uyv = 0, uzv = -dir.x;
    const ul = Math.hypot(uxv, uyv, uzv) || 1; uxv /= ul; uyv /= ul; uzv /= ul;
    const vx = dir.y * uzv - dir.z * uyv, vy = dir.z * uxv - dir.x * uzv, vz = dir.x * uyv - dir.y * uxv;
    const ca = Math.cos(rr), sa = Math.sin(rr);
    _d.set(
      dir.x * ca + (uxv * Math.cos(a) + vx * Math.sin(a)) * sa,
      dir.y * ca + (uyv * Math.cos(a) + vy * Math.sin(a)) * sa,
      dir.z * ca + (uzv * Math.cos(a) + vz * Math.sin(a)) * sa,
    ).normalize();
    const hit = traceShot(G, c, _o, _d);
    const ex = hit ? hit.x : _o.x + _d.x * 90, ey = hit ? hit.y : _o.y + _d.y * 90, ez = hit ? hit.z : _o.z + _d.z * 90;
    G.fx.tracer(mx, my, mz, ex, ey, ez);
    if (!hit) continue;
    if (hit.wall) { G.fx.impact(ex, ey, ez, 3); continue; }
    let dmg = def.damage;
    const t = hit.t;
    if (t > def.range0) dmg *= t >= def.range1 ? def.falloffMin : 1 - (1 - def.falloffMin) * ((t - def.range0) / (def.range1 - def.range0));
    if (hit.head) dmg *= def.headMult;
    dmg = Math.max(1, Math.round(dmg));
    const killed = damage(G, hit.c, dmg, c, hit.head);
    if (c.isPlayer) G.onPlayerHit(hit.c, hit.head, killed);
    G.fx.impact(ex, ey, ez, hit.head ? 6 : 4);
  }
  // recoil: the player's camera takes the kick (player.js recovers it);
  // a bot's aim point wanders the same way, which is what bloom models.
  if (c.isPlayer) G.kickPitch += def.kick * 0.012;
  if (g.mag === 0) startReload(G, c);
  return true;
}

// ---------- gun meshes ----------

const MAT_DARK = new THREE.MeshStandardMaterial({ color: 0x23262a, roughness: .45, metalness: .6 });
const MAT_MID = new THREE.MeshStandardMaterial({ color: 0x3c4148, roughness: .5, metalness: .5 });
const MAT_ACC = new THREE.MeshStandardMaterial({ color: 0x8a5a20, roughness: .6, metalness: .2 });

function box(w, h, d, x, y, z, mat = MAT_DARK) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

// A low-poly gun silhouette per weapon, built along -Z (its muzzle).
export function buildGunMesh(id) {
  const g = new THREE.Group();
  const def = WEAPONS[id];
  const L = def.len;
  g.add(box(0.075, 0.11, L * 0.55, 0, 0, -L * 0.2, MAT_MID));            // receiver
  g.add(box(0.045, 0.045, L * 0.5, 0, 0.02, -L * 0.68, MAT_DARK));       // barrel
  g.add(box(0.06, 0.17, 0.09, 0, -0.13, -L * 0.08, MAT_DARK));           // magazine
  g.add(box(0.055, 0.13, 0.08, 0, -0.09, L * 0.16, MAT_DARK));           // grip
  if (id === 'sparrow') {
    g.add(box(0.05, 0.05, 0.05, 0, 0.085, -L * 0.3, MAT_ACC));
  } else if (id === 'longbow') {
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.24, 10), MAT_DARK);
    scope.rotation.x = Math.PI / 2; scope.position.set(0, 0.11, -L * 0.25);
    g.add(scope);
    g.add(box(0.05, 0.09, L * 0.24, 0, -0.02, L * 0.32, MAT_MID));       // stock
  } else if (id === 'mule') {
    g.add(box(0.07, 0.07, L * 0.3, 0, -0.045, -L * 0.55, MAT_ACC));      // pump
  } else {
    g.add(box(0.04, 0.07, 0.04, 0, 0.1, -L * 0.32, MAT_ACC));            // sight post
    g.add(box(0.055, 0.08, L * 0.3, 0, 0, L * 0.3, MAT_MID));            // stock
    if (id === 'kestrel') g.add(box(0.05, 0.05, 0.16, 0, 0.055, -L * 0.05, MAT_DARK)); // carry handle
  }
  return g;
}

// The player's viewmodel: the gun group plus the sway/recoil state the
// renderer eases every frame. Lives in camera space.
export class Viewmodel {
  constructor(camera) {
    this.group = new THREE.Group();
    this.group.position.set(0.24, -0.22, -0.45);
    camera.add(this.group);
    this.gun = null; this.gunId = null;
    this.kick = 0; this.bobT = 0; this.ads = 0;
  }
  setGun(id) {
    if (this.gunId === id) return;
    if (this.gun) this.group.remove(this.gun);
    this.gunId = id;
    this.gun = buildGunMesh(id);
    this.gun.traverse((m) => { m.frustumCulled = false; });
    this.group.add(this.gun);
  }
  update(dt, moving, adsTarget, fired) {
    if (fired) this.kick = Math.min(0.09, this.kick + 0.05);
    this.kick *= Math.exp(-11 * dt);
    this.ads += (adsTarget - this.ads) * Math.min(1, dt * 11);
    this.bobT += dt * (moving ? 8.5 : 2.2);
    const bob = moving ? 0.012 : 0.004;
    const hip = { x: 0.24, y: -0.22, z: -0.45 };
    const ads = { x: 0, y: -0.148, z: -0.35 };
    this.group.position.set(
      hip.x + (ads.x - hip.x) * this.ads + Math.sin(this.bobT) * bob * (1 - this.ads),
      hip.y + (ads.y - hip.y) * this.ads + Math.abs(Math.cos(this.bobT)) * bob * (1 - this.ads),
      hip.z + (ads.z - hip.z) * this.ads + this.kick,
    );
    this.group.rotation.x = this.kick * 1.6;
  }
}
