// bots.js — the nine AI fighters. Each bot runs a small state machine over the
// shared combatant record: deploy along the waypoint graph to a job (hold a
// site, lurk mid, carry the charge), hold angles, engage with stop-and-burst
// fire discipline, and react to what the team learns — deaths, gunfire noise
// events, the plant. Perception is honest: vision cones, line of sight,
// smoke and hearing radii, never the true game state.

import * as THREE from 'three';
import { TEAMS } from './config.js';
import { currentGun, tryFire, startReload, buyWeapon, buyArmor, buyNade, buildGunMesh } from './weapons.js';
import { eyePos, chestPos, visionClear, throwGrenade } from './combat.js';
import { findPath } from './nav.js';
import { SITES, HOLDS, collideCircle } from './map.js';
import { clamp, angDiff } from './util.js';

const faceYaw = (dx, dz) => Math.atan2(-dx, -dz);
const RANGE_WANT = { sparrow: 11, mule: 7, jackal: 12, kestrel: 19, longbow: 30 };

export function makeBotView(team) {
  const g = new THREE.Group();
  const suit = new THREE.MeshStandardMaterial({ color: 0x2e3138, roughness: .85 });
  const vest = new THREE.MeshStandardMaterial({ color: TEAMS[team].color, roughness: .7 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc9a184, roughness: .8 });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.78, 0.2), suit); legL.position.set(-0.11, 0.39, 0);
  const legR = legL.clone(); legR.position.x = 0.11;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.62, 0.26), vest); torso.position.y = 1.09;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.52, 0.13), suit); armL.position.set(-0.3, 1.12, -0.05); armL.rotation.x = -0.7;
  const armR = armL.clone(); armR.position.x = 0.3;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.155, 12, 10), skin); head.position.y = 1.6;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.165, 0.17, 0.09, 12), suit); cap.position.y = 1.71;
  const gunPivot = new THREE.Group(); gunPivot.position.set(0.14, 1.32, -0.1);
  g.add(legL, legR, torso, armL, armR, head, cap, gunPivot);
  g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  return { group: g, gunPivot, gunId: null, legL, legR, deadT: 0 };
}

export function setBotGun(c) {
  const v = c.view;
  const id = currentGun(c).id;
  if (v.gunId === id) return;
  v.gunId = id;
  while (v.gunPivot.children.length) v.gunPivot.remove(v.gunPivot.children[0]);
  const gun = buildGunMesh(id);
  gun.scale.setScalar(1.15);
  v.gunPivot.add(gun);
}

function newBrain() {
  return {
    state: 'deploy', path: null, pathI: 0, job: null, jobPos: null, holdYaw: 0,
    enemy: null, lastSeenAt: -9, lastKnown: null, reactAt: 0, trackTime: 0,
    burstUntil: 0, pauseUntil: 0, thinkAt: Math.random() * 0.2, perceptAt: Math.random() * 0.12,
    strafeDir: 1, strafeUntil: 0, stuckAt: 0, stuckX: 0, stuckZ: 0, sidestepUntil: 0,
    threwFlash: false, threwFrag: false, crouchHold: false, repathAt: 0,
  };
}

// Assign the round's jobs. Attackers split entry / lurk / flank around one
// chosen site; defenders take hold points, two a site and one in mid.
export function planRound(G) {
  const rng = G.rng;
  const site = rng() < 0.52 ? SITES[0] : SITES[1];
  G.planSite = site;
  const atk = G.combatants.filter((c) => c.team === 'atk' && !c.isPlayer);
  const def = G.combatants.filter((c) => c.team === 'def' && !c.isPlayer);
  const holdsA = [...HOLDS.defA], holdsB = [...HOLDS.defB], holdsM = [...HOLDS.defMid];
  def.forEach((c, i) => {
    const b = c.brain = newBrain();
    const pool = i % 2 === 0 ? (site.id === 'A' ? holdsB : holdsA) : (site.id === 'A' ? holdsA : holdsB);
    const h = (i === 4 ? holdsM : pool)[Math.floor(rng() * (i === 4 ? holdsM.length : pool.length))];
    b.job = 'hold'; b.jobPos = { x: h.x, z: h.z }; b.holdYaw = h.yaw;
    b.crouchHold = rng() < 0.35;
  });
  atk.forEach((c, i) => {
    const b = c.brain = newBrain();
    if (c.hasCharge) { b.job = 'carry'; b.jobPos = { x: site.x, z: site.z }; }
    else if (i === atk.length - 1) { b.job = 'lurk'; b.jobPos = { x: site.id === 'A' ? 14 : -14, z: -6 }; b.lurkSite = site; }
    else { b.job = 'entry'; b.jobPos = { x: site.x + (rng() - 0.5) * 5, z: site.z + (rng() - 0.5) * 5 }; }
  });
  // a defending or lurking player simply plays their own game
}

export function botBuy(c, rng) {
  const hasPrimary = !!c.weapons.primary;
  if (!hasPrimary) {
    if (c.money >= 2700) buyWeapon(c, rng() < 0.85 ? 'kestrel' : 'jackal');
    else if (c.money >= 1400) buyWeapon(c, 'jackal');
    else if (c.money >= 1100 && rng() < 0.3) buyWeapon(c, 'mule');
  }
  if (c.money >= 4800 && rng() < 0.22) buyWeapon(c, 'longbow');
  if (c.armor < 100 && c.money >= 1000 && (hasPrimary || c.money >= 2400)) buyArmor(c);
  if (!c.nades.frag && c.money >= 300 && rng() < 0.55) buyNade(c, 'frag');
  if (!c.nades.flash && c.money >= 200 && rng() < 0.5) buyNade(c, 'flash');
  if (!c.nades.smoke && c.money >= 300 && rng() < 0.3) buyNade(c, 'smoke');
}

// ---------- perception ----------

const _e = new THREE.Vector3(), _c = new THREE.Vector3();

function perceive(G, c) {
  const b = c.brain;
  const now = G.now;
  eyePos(c, _e);
  let best = null, bestD = 60;
  for (const e of G.combatants) {
    if (!e.alive || e.team === c.team) continue;
    chestPos(e, _c);
    const dx = _c.x - _e.x, dz = _c.z - _e.z;
    const dist = Math.hypot(dx, _c.y - _e.y, dz);
    if (dist > 58) continue;
    const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw);
    const dot = (fx * dx + fz * dz) / (Math.hypot(dx, dz) || 1);
    if (dot < 0.22 && dist > 3.6) continue; // outside the vision cone
    if (!visionClear(G, _e.x, _e.y, _e.z, _c.x, _c.y, _c.z)) continue;
    if (dist < bestD) { bestD = dist; best = e; }
  }
  if (best) {
    if (b.enemy !== best) { b.reactAt = now + 0.3 + G.rng() * 0.16; b.trackTime = 0; }
    b.enemy = best; b.lastSeenAt = now;
    b.lastKnown = { x: best.pos.x, z: best.pos.z };
    if (b.state !== 'engage') b.state = 'engage';
  }
  // hearing: gunfire is loud and directional enough to investigate
  for (const n of G.noise) {
    if (n.team === c.team) continue;
    const d = Math.hypot(n.x - c.pos.x, n.z - c.pos.z);
    if (d < n.r) {
      if (!b.lastKnown || now - b.lastSeenAt > 1.5) b.lastKnown = { x: n.x, z: n.z };
      if (b.state === 'hold' && d < 16) b.holdYaw = faceYaw(n.x - c.pos.x, n.z - c.pos.z);
    }
  }
}

// ---------- decisions (about 7 Hz per bot) ----------

function think(G, c) {
  const b = c.brain, now = G.now;
  const blind = now < c.blindUntil;
  if (!c.alive || blind) return;
  const charge = G.charge;
  // the plant rewrites everyone's job
  if (charge.planted) {
    // stale targets end here: tracking a dead or long-lost enemy must not
    // keep a bot out of its post-plant job
    if (b.enemy && (!b.enemy.alive || now - b.lastSeenAt > 1.4)) {
      b.enemy = null;
      if (b.state === 'engage') b.state = 'deploy';
    }
    if (c.team === 'def') {
      const d = Math.hypot(c.pos.x - charge.x, c.pos.z - charge.z);
      const defuser = G.combatants.filter((x) => x.team === 'def' && x.alive && !x.isPlayer)
        .sort((a, z) => Math.hypot(a.pos.x - charge.x, a.pos.z - charge.z) - Math.hypot(z.pos.x - charge.x, z.pos.z - charge.z))[0];
      if (c === defuser) { b.job = 'defuse'; b.jobPos = { x: charge.x, z: charge.z }; }
      else { b.job = 'cover'; b.jobPos = { x: charge.x + (c.pos.x > charge.x ? 6 : -6), z: charge.z + 5 }; }
      if (b.state !== 'engage') b.state = 'deploy';
    } else if (c.team === 'atk') {
      const holds = charge.site.id === 'A' ? HOLDS.postA : HOLDS.postB;
      const h = holds[c.id % holds.length];
      b.job = 'hold'; b.jobPos = { x: h.x, z: h.z }; b.holdYaw = h.yaw;
      if (b.state !== 'engage') b.state = 'deploy';
    }
    return;
  }
  if (b.state === 'engage') {
    if (!b.enemy || !b.enemy.alive) { b.enemy = null; b.state = b.lastKnown ? 'hunt' : 'deploy'; }
    else if (now - b.lastSeenAt > 1.4) b.state = 'hunt';
    return;
  }
  if (b.state === 'hunt') {
    if (!b.lastKnown || Math.hypot(c.pos.x - b.lastKnown.x, c.pos.z - b.lastKnown.z) < 1.6) {
      b.lastKnown = null; b.state = 'deploy';
    }
    return;
  }
  // deploy / hold upkeep
  if (b.job === 'carry' || b.job === 'entry') {
    const site = G.planSite;
    const inSite = Math.hypot(c.pos.x - site.x, c.pos.z - site.z) < site.r - 1;
    if (b.job === 'carry' && inSite && !charge.planted && !c.channel) {
      c.channel = { kind: 'plant', t0: now, dur: 3.0, site };
      b.state = 'task';
    }
    // entry flash over the site threshold, once
    if (b.job === 'entry' && !b.threwFlash && c.nades.flash > 0) {
      const d = Math.hypot(c.pos.x - site.x, c.pos.z - site.z);
      if (d < 13 && d > 6) {
        b.threwFlash = true;
        throwGrenade(G, c, 'flash', new THREE.Vector3((site.x - c.pos.x) / d, 0.32, (site.z - c.pos.z) / d).normalize());
      }
    }
  }
  if (b.job === 'lurk' && b.lurkSite) {
    const d = Math.hypot(c.pos.x - b.jobPos.x, c.pos.z - b.jobPos.z);
    if (d < 2) { b.jobPos = { x: b.lurkSite.x, z: b.lurkSite.z }; b.job = 'entry'; }
  }
  // late-round urgency: attackers must move to the site
  if (c.team === 'atk' && G.phase === 'live' && G.roundClock < 26 && !charge.planted) {
    const site = G.planSite;
    if (b.job !== 'carry') { b.job = 'entry'; b.jobPos = { x: site.x, z: site.z }; }
  }
  // a frag for an enemy we can place but not see
  if (!b.threwFrag && c.nades.frag > 0 && b.lastKnown && now - b.lastSeenAt > 0.8 && now - b.lastSeenAt < 3) {
    const d = Math.hypot(c.pos.x - b.lastKnown.x, c.pos.z - b.lastKnown.z);
    if (d > 5 && d < 13 && G.rng() < 0.5) {
      b.threwFrag = true;
      throwGrenade(G, c, 'frag', new THREE.Vector3((b.lastKnown.x - c.pos.x) / d, 0.38, (b.lastKnown.z - c.pos.z) / d).normalize());
    }
  }
}

// ---------- per-step behaviour ----------

export function stepBot(G, c, dt) {
  const b = c.brain;
  if (!b) return;
  const now = G.now;
  setBotGun(c);
  if (!c.alive) return;
  if (now >= b.perceptAt) { b.perceptAt = now + 0.12; if (G.phase === 'live') perceive(G, c); }
  if (now >= b.thinkAt) { b.thinkAt = now + 0.15; if (G.phase === 'live') think(G, c); }

  const blind = now < c.blindUntil;
  let moveX = 0, moveZ = 0, wantSpeed = 0, faceTarget = null, firing = false;

  if (blind) {
    c.crouch = true;
  } else if (c.channel) {
    // hands busy planting / defusing: stand (or crouch) still
    c.crouch = c.channel.kind === 'defuse';
  } else if (b.state === 'engage' && b.enemy) {
    const e = b.enemy;
    chestPos(e, _c);
    const dx = _c.x - c.pos.x, dz = _c.z - c.pos.z;
    const dist = Math.hypot(dx, dz);
    faceTarget = { x: _c.x, y: _c.y, z: _c.z };
    const gun = currentGun(c);
    const want = RANGE_WANT[gun.id] || 14;
    // burst discipline: plant the feet to shoot, strafe between bursts
    if (now >= b.pauseUntil && now >= b.reactAt) {
      if (b.burstUntil === 0) b.burstUntil = now + 0.32 + G.rng() * 0.3;
      firing = now < b.burstUntil;
      if (!firing && now >= b.burstUntil) { b.pauseUntil = now + 0.3 + G.rng() * 0.35; b.burstUntil = 0; }
    }
    if (!firing) {
      if (now >= b.strafeUntil) { b.strafeDir = G.rng() < 0.5 ? -1 : 1; b.strafeUntil = now + 0.6 + G.rng() * 0.8; }
      const px = -dz / (dist || 1) * b.strafeDir, pz = dx / (dist || 1) * b.strafeDir;
      let radial = 0;
      if (dist > want + 5) radial = 0.75; else if (dist < want - 4) radial = -0.6;
      moveX = px * 0.8 + (dx / (dist || 1)) * radial;
      moveZ = pz * 0.8 + (dz / (dist || 1)) * radial;
      wantSpeed = 3.4;
    }
    if (gun.mag === 0 && c.reloadUntil === 0) startReload(G, c);
    b.trackTime += dt;
  } else if (b.state === 'hunt' && b.lastKnown) {
    moveToward(G, c, b.lastKnown.x, b.lastKnown.z, dt);
    const p = b.moveVec; moveX = p.x; moveZ = p.z; wantSpeed = p.speed;
    faceTarget = { x: b.lastKnown.x, y: 1.2, z: b.lastKnown.z };
  } else {
    // deploy toward the job position, then hold it
    const jp = b.jobPos;
    if (jp) {
      const d = Math.hypot(c.pos.x - jp.x, c.pos.z - jp.z);
      if (d > 1.1) {
        moveToward(G, c, jp.x, jp.z, dt);
        const p = b.moveVec; moveX = p.x; moveZ = p.z; wantSpeed = p.speed;
        if (b.state !== 'deploy') b.state = 'deploy';
      } else {
        b.state = 'hold';
        c.crouch = b.crouchHold && b.job === 'hold';
        faceTarget = null;
        c.yaw = turnToward(c.yaw, b.holdYaw + Math.sin(now * 0.35 + c.id * 2.1) * 0.35, 2.2 * dt);
      }
    }
  }

  // defuse job: walk the last metres and channel
  if (!blind && !c.channel && b.job === 'defuse' && G.charge.planted) {
    const d = Math.hypot(c.pos.x - G.charge.x, c.pos.z - G.charge.z);
    if (d < 2.1) {
      if (c.nades.smoke > 0 && !b.smokedDefuse) {
        b.smokedDefuse = true;
        throwGrenade(G, c, 'smoke', new THREE.Vector3(0.1, 0.5, 0.1).normalize());
      }
      c.channel = { kind: 'defuse', t0: now, dur: 5.0 };
      moveX = moveZ = 0; wantSpeed = 0;
    }
  }

  // apply facing
  if (faceTarget) {
    const dx = faceTarget.x - c.pos.x, dz = faceTarget.z - c.pos.z;
    const targetYaw = faceYaw(dx, dz);
    c.yaw = turnToward(c.yaw, targetYaw, (b.state === 'engage' ? 8.5 : 4.5) * dt);
    const hd = Math.hypot(dx, dz) || 1;
    const targetPitch = Math.atan2(faceTarget.y - (c.pos.y + 1.55), hd);
    c.pitch += clamp(targetPitch - c.pitch, -3 * dt, 3 * dt);
  } else if ((moveX || moveZ) && b.state !== 'hold') {
    c.yaw = turnToward(c.yaw, faceYaw(moveX, moveZ), 5 * dt);
    c.pitch *= Math.exp(-4 * dt);
  }

  // apply movement with the same acceleration model as the player
  const ml = Math.hypot(moveX, moveZ);
  if (ml > 0.01 && wantSpeed > 0) { moveX = moveX / ml * wantSpeed; moveZ = moveZ / ml * wantSpeed; }
  else { moveX = 0; moveZ = 0; }
  // unstick: if we want to move but barely do, sidestep briefly
  if (wantSpeed > 0.5) {
    if (Math.hypot(c.pos.x - b.stuckX, c.pos.z - b.stuckZ) < 0.25) {
      if (now - b.stuckAt > 1.1) { b.sidestepUntil = now + 0.45; b.path = null; b.stuckAt = now; }
    } else { b.stuckX = c.pos.x; b.stuckZ = c.pos.z; b.stuckAt = now; }
  }
  if (now < b.sidestepUntil) { const px = -moveZ, pz = moveX; moveX = px; moveZ = pz; }
  const accel = c.onGround ? 10 : 1.2;
  c.vel.x += (moveX - c.vel.x) * Math.min(1, accel * dt);
  c.vel.z += (moveZ - c.vel.z) * Math.min(1, accel * dt);
  c.vel.y -= 13.5 * dt;
  c.pos.x += c.vel.x * dt; c.pos.z += c.vel.z * dt; c.pos.y += c.vel.y * dt;
  if (c.pos.y <= 0) { c.pos.y = 0; c.vel.y = 0; c.onGround = true; }
  collideCircle(c.pos, c.radius);

  // fire, with an aim error that shrinks while tracking the same target
  if (firing && b.enemy && now >= b.reactAt) {
    const e = b.enemy;
    chestPos(e, _c);
    const err = Math.max(0.014, 0.075 - b.trackTime * 0.055) * (now - c.lastHurtAt < 0.4 ? 1.7 : 1);
    const a = G.rng() * Math.PI * 2, r = Math.sqrt(G.rng()) * err;
    _c.x += Math.cos(a) * r * 10 * 0.1; _c.y += Math.sin(a) * r * 4; _c.z += Math.sin(a) * r * 10 * 0.1;
    eyePos(c, _e);
    const dir = new THREE.Vector3(_c.x - _e.x, _c.y - _e.y, _c.z - _e.z).normalize();
    tryFire(G, c, dir);
  }
}

function turnToward(yaw, target, maxStep) {
  const d = angDiff(target, yaw);
  return yaw + clamp(d, -maxStep, maxStep);
}

// Steer along an A* path to (tx,tz); writes b.moveVec {x,z,speed}.
function moveToward(G, c, tx, tz, dt) {
  const b = c.brain, now = G.now;
  if (!b.path || now >= b.repathAt) {
    b.path = findPath(c.pos.x, c.pos.z, tx, tz);
    b.pathI = 0;
    b.repathAt = now + 3.5;
    b.pathGoal = { x: tx, z: tz };
  }
  if (b.pathGoal && Math.hypot(b.pathGoal.x - tx, b.pathGoal.z - tz) > 2) {
    b.path = findPath(c.pos.x, c.pos.z, tx, tz);
    b.pathI = 0; b.pathGoal = { x: tx, z: tz };
  }
  let gx = tx, gz = tz;
  if (b.path && b.pathI < b.path.length) {
    gx = b.path[b.pathI].x; gz = b.path[b.pathI].z;
    if (Math.hypot(c.pos.x - gx, c.pos.z - gz) < 0.85) { b.pathI++; }
  }
  const dx = gx - c.pos.x, dz = gz - c.pos.z;
  const d = Math.hypot(dx, dz) || 1;
  const nearEnd = Math.hypot(c.pos.x - tx, c.pos.z - tz) < 3.2;
  b.moveVec = { x: dx / d, z: dz / d, speed: nearEnd ? 2.5 : 4.35 };
}

// Render-side: pose the bot meshes from the simulation state.
export function updateBotViews(G, dt) {
  for (const c of G.combatants) {
    if (c.isPlayer || !c.view) continue;
    const v = c.view, g = v.group;
    g.position.copy(c.pos);
    g.rotation.y = c.yaw;
    if (!c.alive) {
      v.deadT = Math.min(1, v.deadT + dt * 2.4);
      g.rotation.x = -v.deadT * Math.PI / 2 * 0.92;
      g.position.y = c.pos.y + v.deadT * 0.25;
      continue;
    }
    v.deadT = 0; g.rotation.x = 0;
    const sp = Math.hypot(c.vel.x, c.vel.z);
    const sw = Math.min(1, sp / 4) * Math.sin(G.now * 11 + c.id * 3);
    v.legL.rotation.x = sw * 0.6; v.legR.rotation.x = -sw * 0.6;
    g.position.y = c.pos.y + Math.abs(Math.sin(G.now * 11 + c.id * 3)) * 0.03 * Math.min(1, sp / 4) - (c.crouch ? 0.34 : 0);
    g.scale.y = c.crouch ? 0.82 : 1;
    v.gunPivot.rotation.x = c.pitch;
  }
}
