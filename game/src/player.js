// player.js — the human's body: pointer-lock mouse look, WASD movement with
// acceleration and friction (run, walk, crouch, jump), collision against the
// yard, and the trigger / reload / grenade / interact inputs. It writes the
// shared input record G.input and moves G.player; rounds.js and hud.js read
// the same record, so input has exactly one owner.

import * as THREE from 'three';
import { currentGun, tryFire, startReload, equip } from './weapons.js';
import { eyeHeight, throwGrenade } from './combat.js';
import { collideCircle } from './map.js';
import { clamp } from './util.js';

export class PlayerController {
  constructor(G, canvas) {
    this.G = G;
    this.canvas = canvas;
    this.keys = new Set();
    this.locked = false;
    this.mouseDown = false;
    this.mouseWasDown = false;
    this.adsHeld = false;
    this.adsAmount = 0;
    this.bobT = 0;
    G.input = { interact: false, buyToggle: false, board: false };

    document.addEventListener('keydown', (e) => this.onKey(e, true));
    document.addEventListener('keyup', (e) => this.onKey(e, false));
    document.addEventListener('mousemove', (e) => this.onMouse(e));
    document.addEventListener('mousedown', (e) => { if (e.button === 0) this.mouseDown = true; if (e.button === 2) this.adsHeld = true; });
    document.addEventListener('mouseup', (e) => { if (e.button === 0) this.mouseDown = false; if (e.button === 2) this.adsHeld = false; });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) { this.mouseDown = false; this.adsHeld = false; }
      G.onLockChange(this.locked);
    });
    canvas.addEventListener('click', () => {
      if (!this.locked && G.phase === 'live' || !this.locked && G.phase === 'buy') canvas.requestPointerLock();
    });
  }

  lock() { this.canvas.requestPointerLock(); }

  onKey(e, down) {
    const G = this.G, c = G.player;
    if (e.code === 'Tab') { e.preventDefault(); G.input.board = down; return; }
    if (down) {
      this.keys.add(e.code);
      if (!c) return;
      if (e.code === 'KeyR') startReload(G, c);
      if (e.code === 'Digit1' && G.phase === 'live') equip(c, 'primary', G.now);
      if (e.code === 'Digit2' && G.phase === 'live') equip(c, 'sidearm', G.now);
      if (e.code === 'KeyB' && G.phase === 'buy') G.input.buyToggle = true;
      if (e.code === 'Digit4') this.throwNade('flash');
      if (e.code === 'Digit5') this.throwNade('smoke');
      if (e.code === 'Digit6') this.throwNade('frag');
    } else this.keys.delete(e.code);
    G.input.interact = this.keys.has('KeyE');
  }

  throwNade(kind) {
    const G = this.G, c = G.player;
    if (!c.alive || G.phase !== 'live' || c.nades[kind] <= 0) return;
    const dir = new THREE.Vector3(
      -Math.sin(c.yaw) * Math.cos(c.pitch), Math.sin(c.pitch) + 0.12, -Math.cos(c.yaw) * Math.cos(c.pitch),
    ).normalize();
    throwGrenade(G, c, kind, dir);
    c.switchUntil = G.now + 0.45;
  }

  onMouse(e) {
    if (!this.locked) return;
    const c = this.G.player;
    if (!c) return;
    const sens = 0.0021 * (1 - this.adsAmount * 0.55);
    c.yaw -= e.movementX * sens;
    c.pitch = clamp(c.pitch - e.movementY * sens, -1.45, 1.45);
  }

  aimDir(c, out) {
    return out.set(
      -Math.sin(c.yaw) * Math.cos(c.pitch),
      Math.sin(c.pitch),
      -Math.cos(c.yaw) * Math.cos(c.pitch),
    );
  }

  // One fixed simulation step for the player body and trigger.
  step(dt) {
    const G = this.G, c = G.player;
    if (!c) return;
    const live = G.phase === 'live' && c.alive && !G.shotMode;
    const gun = currentGun(c);
    // --- movement ---
    let wx = 0, wz = 0;
    if (live && !c.channel) {
      const f = (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0);
      const s = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);
      const sy = Math.sin(c.yaw), cy = Math.cos(c.yaw);
      wx = (-sy * f + cy * s); wz = (-cy * f - sy * s);
      const l = Math.hypot(wx, wz) || 1;
      wx /= l; wz /= l;
      if (!f && !s) { wx = 0; wz = 0; }
    }
    c.crouch = live && (this.keys.has('ControlLeft') || this.keys.has('KeyC'));
    c.walk = live && this.keys.has('ShiftLeft');
    let maxSpeed = gun ? gun.def.speed : 5;
    if (c.crouch) maxSpeed *= 0.55;
    if (c.walk) maxSpeed *= 0.52;
    if (c.scoped) maxSpeed *= 0.5;
    const accel = c.onGround ? 11 : 1.4;
    c.vel.x += (wx * maxSpeed - c.vel.x) * Math.min(1, accel * dt);
    c.vel.z += (wz * maxSpeed - c.vel.z) * Math.min(1, accel * dt);
    if (live && this.keys.has('Space') && c.onGround && !c.channel) {
      c.vel.y = 4.5; c.onGround = false;
    }
    c.vel.y -= 13.5 * dt;
    c.pos.x += c.vel.x * dt;
    c.pos.z += c.vel.z * dt;
    c.pos.y += c.vel.y * dt;
    if (c.pos.y <= 0) { c.pos.y = 0; c.vel.y = 0; c.onGround = true; }
    collideCircle(c.pos, c.radius);
    // footsteps: audible steps while running give the bots something to hear
    const hSpeed = Math.hypot(c.vel.x, c.vel.z);
    if (c.onGround && hSpeed > 1) {
      c.stepAcc += hSpeed * dt;
      if (c.stepAcc > 2.4) {
        c.stepAcc = 0;
        G.audio.step(c.pos.x, c.pos.z, G.listener, true);
        if (!c.walk && !c.crouch) G.noise.push({ x: c.pos.x, z: c.pos.z, r: 8, team: c.team, at: G.now, kind: 'step' });
      }
    }
    // --- aiming / firing ---
    const wantAds = live && this.adsHeld && gun && G.phase === 'live';
    this.adsAmount += ((wantAds ? 1 : 0) - this.adsAmount) * Math.min(1, dt * 10);
    c.scoped = !!(gun && gun.def.zoom > 1 && this.adsAmount > 0.72);
    if (live && this.mouseDown && !c.channel) {
      if (gun.def.auto || !this.mouseWasDown) {
        const dir = this.aimDir(c, _dir);
        if (tryFire(G, c, dir) && gun.def.zoom > 1) {
          // a bolt-action shot breaks the scope picture for a beat
          this.adsAmount = 0.2;
        }
      }
    }
    this.mouseWasDown = this.mouseDown;
  }

  // Per-frame camera placement (render side; the simulation already ran).
  placeCamera(camera, dt) {
    const G = this.G, c = G.player;
    if (!c) return;
    const hSpeed = Math.hypot(c.vel.x, c.vel.z);
    this.bobT += dt * (c.onGround ? hSpeed * 1.6 : 0);
    const bobY = c.onGround && c.alive ? Math.sin(this.bobT * 2) * 0.016 * Math.min(1, hSpeed / 4) : 0;
    G.kickPitch *= Math.exp(-7.5 * dt);
    camera.position.set(
      c.pos.x + (Math.random() - 0.5) * G.shake * 0.14,
      c.pos.y + eyeHeight(c) + bobY + (Math.random() - 0.5) * G.shake * 0.14,
      c.pos.z,
    );
    camera.rotation.order = 'YXZ';
    camera.rotation.y = c.yaw;
    camera.rotation.x = c.pitch + G.kickPitch;
    camera.rotation.z = 0;
    const gun = currentGun(c);
    const baseFov = 74;
    let fov = baseFov - this.adsAmount * 15;
    if (gun && gun.def.zoom > 1) fov = baseFov + (baseFov / gun.def.zoom - baseFov) * this.adsAmount;
    if (Math.abs(camera.fov - fov) > 0.1) { camera.fov = fov; camera.updateProjectionMatrix(); }
    G.shake = Math.max(0, G.shake - dt * 1.6);
  }
}

const _dir = new THREE.Vector3();
