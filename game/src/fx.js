// fx.js — every transient visual: tracers, muzzle flashes, impact dust, smoke
// clouds, flash bursts and the charge's blink. Everything is pooled and
// recycled; the update loop writes into preallocated objects, so a firefight
// allocates nothing per frame. Active smoke volumes are registered here and
// double as the vision blockers the bots' line-of-sight checks consult.

import * as THREE from 'three';

const MAX_TRACERS = 56, MAX_PUFFS = 260, MAX_SMOKES = 6;

export class FX {
  constructor(scene) {
    this.scene = scene;
    // tracers: thin additive boxes stretched between two points
    this.tracerGeo = new THREE.BoxGeometry(0.03, 0.03, 1);
    this.tracerMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    this.tracers = [];
    for (let i = 0; i < MAX_TRACERS; i++) {
      const m = new THREE.Mesh(this.tracerGeo, this.tracerMat);
      m.visible = false; scene.add(m);
      this.tracers.push({ mesh: m, life: 0 });
    }
    this.tracerIdx = 0;
    // muzzle flash: one shared light + a star sprite reused by every shot
    this.flashLight = new THREE.PointLight(0xffc37a, 0, 13, 1.8);
    scene.add(this.flashLight);
    this.flashSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      color: 0xffcf8a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.flashSprite.scale.set(0.55, 0.55, 1);
    scene.add(this.flashSprite);
    this.flashLife = 0;
    // impact dust: one Points cloud, ring-buffered
    this.puffPos = new Float32Array(MAX_PUFFS * 3);
    this.puffVel = new Float32Array(MAX_PUFFS * 3);
    this.puffLife = new Float32Array(MAX_PUFFS);
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(this.puffPos, 3));
    this.puffs = new THREE.Points(pg, new THREE.PointsMaterial({
      color: 0xcbb89a, size: 0.13, transparent: true, opacity: 0.75, depthWrite: false,
    }));
    this.puffs.frustumCulled = false;
    scene.add(this.puffs);
    this.puffIdx = 0;
    for (let i = 0; i < MAX_PUFFS; i++) this.puffPos[i * 3 + 1] = -50;
    // smoke clouds
    this.smokes = []; // {x,y,z,r,until,group}
    this.smokeMat = new THREE.MeshStandardMaterial({ color: 0xb9bec4, transparent: true, opacity: 0.34, roughness: 1, depthWrite: false });
    // the planted charge: a breaching pack with a blinking beacon
    this.chargeMesh = new THREE.Group();
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.2, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: .6, metalness: .3 }));
    pack.position.y = 0.1;
    this.chargeLamp = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xff4030 }));
    this.chargeLamp.position.y = 0.24;
    this.chargeMesh.add(pack, this.chargeLamp);
    this.chargeMesh.visible = false;
    scene.add(this.chargeMesh);
    // explosion flash
    this.boomSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      color: 0xffa050, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    scene.add(this.boomSprite);
    this.boomLife = 0;
    this.time = 0;
  }

  tracer(x1, y1, z1, x2, y2, z2) {
    const t = this.tracers[this.tracerIdx++ % MAX_TRACERS];
    const m = t.mesh;
    const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1;
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.5) return;
    m.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
    m.scale.set(1, 1, len);
    m.lookAt(x2, y2, z2);
    m.visible = true;
    t.life = 0.055;
  }

  muzzle(x, y, z, bright = 1) {
    this.flashLight.position.set(x, y, z);
    this.flashLight.intensity = 26 * bright;
    this.flashSprite.position.set(x, y, z);
    this.flashSprite.material.opacity = 0.85 * bright;
    this.flashSprite.material.rotation = Math.random() * Math.PI;
    this.flashLife = 0.045;
  }

  impact(x, y, z, n = 5) {
    for (let k = 0; k < n; k++) {
      const i = this.puffIdx++ % MAX_PUFFS;
      this.puffPos[i * 3] = x; this.puffPos[i * 3 + 1] = y; this.puffPos[i * 3 + 2] = z;
      this.puffVel[i * 3] = (Math.random() - 0.5) * 1.3;
      this.puffVel[i * 3 + 1] = Math.random() * 1.5 + 0.3;
      this.puffVel[i * 3 + 2] = (Math.random() - 0.5) * 1.3;
      this.puffLife[i] = 0.4 + Math.random() * 0.3;
    }
  }

  spawnSmoke(x, z, now, duration = 14) {
    if (this.smokes.length >= MAX_SMOKES) {
      const old = this.smokes.shift();
      this.scene.remove(old.group);
    }
    const group = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(1.5 + Math.random() * 1.1, 10, 8), this.smokeMat);
      s.position.set((Math.random() - 0.5) * 2.6, 1 + Math.random() * 1.1, (Math.random() - 0.5) * 2.6);
      group.add(s);
    }
    group.position.set(x, 0, z);
    group.scale.setScalar(0.3);
    this.scene.add(group);
    this.smokes.push({ x, y: 1.5, z, r: 3.3, until: now + duration, born: now, group });
  }

  flashBurst(x, y, z) {
    this.boomSprite.position.set(x, y, z);
    this.boomSprite.material.color.set(0xffffff);
    this.boomSprite.scale.set(3.4, 3.4, 1);
    this.boomSprite.material.opacity = 0.95;
    this.boomLife = 0.14;
  }

  explosionFx(x, z) {
    this.boomSprite.position.set(x, 1.2, z);
    this.boomSprite.material.color.set(0xffa050);
    this.boomSprite.scale.set(11, 11, 1);
    this.boomSprite.material.opacity = 1;
    this.boomLife = 0.5;
    this.flashLight.position.set(x, 1.6, z);
    this.flashLight.intensity = 300;
    this.impact(x, 0.4, z, 40);
  }

  update(dt, now) {
    this.time = now;
    for (const t of this.tracers) {
      if (t.life > 0) { t.life -= dt; if (t.life <= 0) t.mesh.visible = false; }
    }
    if (this.flashLife > 0) {
      this.flashLife -= dt;
      if (this.flashLife <= 0) { this.flashLight.intensity = 0; this.flashSprite.material.opacity = 0; }
    } else if (this.flashLight.intensity > 0 && this.boomLife <= 0) this.flashLight.intensity = 0;
    if (this.boomLife > 0) {
      this.boomLife -= dt;
      this.boomSprite.material.opacity = Math.max(0, this.boomLife / 0.5);
      if (this.boomLife <= 0) this.boomSprite.material.opacity = 0;
    }
    for (let i = 0; i < MAX_PUFFS; i++) {
      if (this.puffLife[i] <= 0) continue;
      this.puffLife[i] -= dt;
      if (this.puffLife[i] <= 0) { this.puffPos[i * 3 + 1] = -50; continue; }
      this.puffPos[i * 3] += this.puffVel[i * 3] * dt;
      this.puffPos[i * 3 + 1] += this.puffVel[i * 3 + 1] * dt;
      this.puffPos[i * 3 + 2] += this.puffVel[i * 3 + 2] * dt;
      this.puffVel[i * 3 + 1] -= 1.6 * dt;
    }
    this.puffs.geometry.attributes.position.needsUpdate = true;
    for (let i = this.smokes.length - 1; i >= 0; i--) {
      const s = this.smokes[i];
      const age = now - s.born;
      const target = age < 1.2 ? 0.3 + (age / 1.2) * 0.7 : 1;
      s.group.scale.setScalar(target);
      if (now > s.until) { this.scene.remove(s.group); this.smokes.splice(i, 1); }
    }
    if (this.chargeMesh.visible) {
      const blink = (now % 0.9) < 0.12;
      this.chargeLamp.material.color.set(blink ? 0xff5040 : 0x571d16);
    }
  }
}
