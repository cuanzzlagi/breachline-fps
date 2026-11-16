// combat.js — the shared body of every fighter: the combatant record the
// player and the bots both use, hit resolution (hitscan against the map and
// against head/chest spheres), damage with armor absorption, and grenades as
// simulated projectiles with flash / smoke / frag effects. Round rules live
// in rounds.js; this file only answers "who got hit, how hard, and what did
// the grenade do".

import * as THREE from 'three';
import { WEAPONS, RULES } from './config.js';
import { raySphere, segmentSphere } from './util.js';
import { raycastMap, losClear } from './map.js';

export function gunState(id) {
  const def = WEAPONS[id];
  return { id, def, mag: def.mag, reserve: def.reserve };
}

export function makeCombatant(id, name, team, isPlayer) {
  return {
    id, name, team, isPlayer,
    alive: true, hp: 100, armor: 0, money: 0,
    pos: new THREE.Vector3(), vel: new THREE.Vector3(),
    yaw: 0, pitch: 0, crouch: false, onGround: true,
    radius: 0.35, walk: false,
    weapons: { primary: null, sidearm: gunState('sparrow'), current: 'sidearm' },
    nades: { flash: 0, smoke: 0, frag: 0 },
    hasCharge: false,
    bloom: 0, lastShotAt: -9, nextShotAt: 0, reloadUntil: 0, switchUntil: 0,
    blindUntil: 0, deafUntil: 0,
    stepAcc: 0, lastHurtAt: -9, lastAttacker: null,
    stats: { k: 0, d: 0, plants: 0, defuses: 0 },
    brain: null, view: null,
  };
}

export const eyeHeight = (c) => (c.crouch ? 1.16 : 1.62);
export function eyePos(c, out) {
  return out.set(c.pos.x, c.pos.y + eyeHeight(c), c.pos.z);
}
export function chestPos(c, out) {
  return out.set(c.pos.x, c.pos.y + (c.crouch ? 0.74 : 1.06), c.pos.z);
}
export function headPos(c, out) {
  return out.set(c.pos.x, c.pos.y + (c.crouch ? 1.24 : 1.68), c.pos.z);
}

const _v = new THREE.Vector3();

// True when a sight line is usable: no wall and no smoke cloud in the way.
export function visionClear(G, x1, y1, z1, x2, y2, z2) {
  if (!losClear(x1, y1, z1, x2, y2, z2)) return false;
  for (const s of G.fx.smokes) {
    if (segmentSphere(x1, y1, z1, x2, y2, z2, s.x, s.y, s.z, s.r)) return false;
  }
  return true;
}

// One hitscan pellet from (o) along unit (d). Returns a hit record or null.
export function traceShot(G, shooter, o, d, maxDist = 140) {
  const mapT = raycastMap(o.x, o.y, o.z, d.x, d.y, d.z, maxDist);
  let best = null;
  for (const c of G.combatants) {
    if (!c.alive || c === shooter || c.team === shooter.team) continue;
    headPos(c, _v);
    let t = raySphere(o.x, o.y, o.z, d.x, d.y, d.z, _v.x, _v.y, _v.z, 0.21);
    if (t >= 0 && (mapT < 0 || t < mapT) && (!best || t < best.t)) best = { c, t, head: true };
    chestPos(c, _v);
    t = raySphere(o.x, o.y, o.z, d.x, d.y, d.z, _v.x, _v.y, _v.z, 0.44);
    if (t >= 0 && (mapT < 0 || t < mapT) && (!best || t < best.t)) best = { c, t, head: false };
  }
  if (best) {
    best.x = o.x + d.x * best.t; best.y = o.y + d.y * best.t; best.z = o.z + d.z * best.t;
    return best;
  }
  if (mapT >= 0) {
    return { wall: true, t: mapT, x: o.x + d.x * mapT, y: o.y + d.y * mapT, z: o.z + d.z * mapT };
  }
  return null;
}

export function damage(G, victim, amount, attacker, head) {
  if (!victim.alive || amount <= 0) return false;
  let rest = amount;
  if (victim.armor > 0) {
    const absorbed = Math.min(victim.armor, Math.ceil(amount * 0.5));
    victim.armor -= absorbed;
    rest = amount - absorbed;
  }
  victim.hp -= rest;
  victim.lastHurtAt = G.now;
  victim.lastAttacker = attacker;
  if (victim.isPlayer) G.onPlayerHurt(attacker, amount);
  else if (attacker) G.onBotHurt(victim, attacker);
  if (victim.hp <= 0) {
    victim.hp = 0;
    victim.alive = false;
    victim.stats.d++;
    if (attacker && attacker !== victim) {
      attacker.stats.k++;
      attacker.money = Math.min(RULES.maxMoney, attacker.money + RULES.payKill);
    }
    G.onKill(victim, attacker, head);
    return true;
  }
  return false;
}

// ---------- grenades ----------

export function throwGrenade(G, c, kind, dir) {
  const def = { flash: 1, smoke: 1, frag: 1 }[kind];
  if (!def || c.nades[kind] <= 0) return;
  c.nades[kind]--;
  eyePos(c, _v);
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 8, 8),
    new THREE.MeshStandardMaterial({ color: kind === 'frag' ? 0x4a5d23 : kind === 'smoke' ? 0x707880 : 0xd8d8d8, roughness: .5 }),
  );
  mesh.position.copy(_v);
  G.scene.add(mesh);
  const speed = 17;
  G.nadesInFlight.push({
    kind, mesh, thrower: c, fuse: kind === 'smoke' ? 1.5 : 1.35,
    x: _v.x, y: _v.y, z: _v.z,
    vx: dir.x * speed, vy: dir.y * speed + 2.2, vz: dir.z * speed,
    rested: false,
  });
  G.audio.throwNade();
}

export function stepGrenades(G, dt) {
  const list = G.nadesInFlight;
  for (let i = list.length - 1; i >= 0; i--) {
    const n = list[i];
    n.fuse -= dt;
    if (!n.rested) {
      const py = n.y; // pre-step height: tells a roof landing from a side hit
      n.vy -= 16 * dt;
      n.x += n.vx * dt; n.y += n.vy * dt; n.z += n.vz * dt;
      if (n.y < 0.09) {
        n.y = 0.09;
        if (Math.abs(n.vy) > 2) { n.vy = -n.vy * 0.35; n.vx *= 0.7; n.vz *= 0.7; }
        else { n.rested = true; n.vx = n.vz = 0; n.vy = 0; }
      }
      // cheap box bounce: if the point enters a box footprint below its top,
      // push it back out along the smaller penetration axis — unless it fell
      // onto the roof, in which case it lands or bounces on top
      for (const b of G.boxes) {
        if (n.x > b.min.x && n.x < b.max.x && n.z > b.min.z && n.z < b.max.z && n.y < b.max.y) {
          if (py >= b.max.y - 0.02 && n.vy <= 0) {
            n.y = b.max.y + 0.09;
            if (Math.abs(n.vy) > 2) { n.vy = -n.vy * 0.35; n.vx *= 0.7; n.vz *= 0.7; }
            else { n.rested = true; n.vx = n.vz = 0; n.vy = 0; }
            continue;
          }
          const pl = n.x - b.min.x, pr = b.max.x - n.x, pt = n.z - b.min.z, pb = b.max.z - n.z;
          const m = Math.min(pl, pr, pt, pb);
          if (m === pl) { n.x = b.min.x - 0.02; n.vx = -Math.abs(n.vx) * 0.4; }
          else if (m === pr) { n.x = b.max.x + 0.02; n.vx = Math.abs(n.vx) * 0.4; }
          else if (m === pt) { n.z = b.min.z - 0.02; n.vz = -Math.abs(n.vz) * 0.4; }
          else { n.z = b.max.z + 0.02; n.vz = Math.abs(n.vz) * 0.4; }
        }
      }
      n.mesh.position.set(n.x, n.y, n.z);
    }
    if (n.fuse <= 0) {
      detonate(G, n);
      G.scene.remove(n.mesh);
      list.splice(i, 1);
    }
  }
}

function detonate(G, n) {
  const L = G.listener;
  if (n.kind === 'smoke') {
    G.fx.spawnSmoke(n.x, n.z, G.now);
    G.audio.step(n.x, n.z, L); // soft hiss stand-in at low gain
    return;
  }
  if (n.kind === 'flash') {
    G.fx.flashBurst(n.x, n.y, n.z);
    G.audio.flashPop(n.x, n.z, L);
    for (const c of G.combatants) {
      if (!c.alive) continue;
      eyePos(c, _v);
      const dx = n.x - _v.x, dy = n.y - _v.y, dz = n.z - _v.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > 19) continue;
      if (!losClear(_v.x, _v.y, _v.z, n.x, n.y, n.z)) continue;
      // facing: combatant look direction vs direction to the pop
      const lx = -Math.sin(c.yaw) * Math.cos(c.pitch), ly = Math.sin(c.pitch), lz = -Math.cos(c.yaw) * Math.cos(c.pitch);
      const dot = (lx * dx + ly * dy + lz * dz) / (dist || 1);
      let dur = 0;
      if (dot > 0.35) dur = 4.4 * (1 - dist / 22);
      else if (dot > -0.2) dur = 1.6 * (1 - dist / 20);
      else if (dist < 2.6) dur = 1.1;
      if (dur > 0.25) {
        c.blindUntil = Math.max(c.blindUntil, G.now + dur);
        if (c.isPlayer) G.onPlayerFlashed(dur);
      }
    }
    return;
  }
  // frag
  G.fx.explosionFx(n.x, n.z);
  G.audio.fragBoom(n.x, n.z, L);
  if (G.player) {
    const d = Math.hypot(G.player.pos.x - n.x, G.player.pos.z - n.z);
    if (d < 9) G.shake = Math.min(0.5, G.shake + (9 - d) * 0.05);
  }
  for (const c of G.combatants) {
    if (!c.alive) continue;
    chestPos(c, _v);
    const d = Math.hypot(_v.x - n.x, _v.y - n.y, _v.z - n.z);
    if (d > 4.8) continue;
    if (!losClear(n.x, n.y + 0.2, n.z, _v.x, _v.y, _v.z)) continue;
    const dmg = Math.max(5, 94 * Math.pow(1 - d / 4.8, 1.15));
    damage(G, c, dmg, n.thrower, false);
  }
}
