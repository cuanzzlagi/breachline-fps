// main.js — bootstrap and the loop. It builds the one shared game state G,
// creates the ten combatants, wires the modules together (combat reports to
// rounds, rounds and combat report to the HUD), and runs a fixed-step
// simulation (60 Hz) that is fully separate from rendering: step() advances
// the world, render() only draws it. A ?shot= URL parameter stages the
// deterministic screenshot scenes from shots.js instead of a live match.

import * as THREE from 'three';
import { BOT_NAMES } from './config.js';
import { mulberry32 } from './util.js';
import { buildWorld, BOXES } from './map.js';
import { AudioBus } from './audio.js';
import { FX } from './fx.js';
import { makeCombatant, stepGrenades } from './combat.js';
import { Viewmodel, currentGun, stepWeapon } from './weapons.js';
import { makeBotView, stepBot, updateBotViews } from './bots.js';
import { PlayerController } from './player.js';
import { setupMatch, startRound, stepRounds, onKill } from './rounds.js';
import { bindHud, updateHud } from './hud.js';
import { stageShot, shotCamera } from './shots.js';

const params = new URLSearchParams(location.search);
const shotMode = params.get('shot');
const seed = Number(params.get('seed') || (Date.now() % 2147483647));

const G = {
  now: 0, dt: 0, rng: mulberry32(seed),
  phase: 'menu', round: 0, roundClock: 0, phaseT: 0,
  score: { J: 0, B: 0 }, lossStreak: { atk: 0, def: 0 },
  charge: { carrier: null, planted: false, x: 0, z: 0, site: null, plantedAt: 0, drop: null, lastBeep: 0 },
  planSite: null, playerCarriedHalf: false,
  combatants: [], player: null, noise: [], nadesInFlight: [], boxes: BOXES,
  kickPitch: 0, shake: 0, flashUntil: 0, shotMode,
  listener: { x: 0, z: 0, yaw: 0 },
  audio: new AudioBus(),
};

// renderer / scene / camera
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;
renderer.domElement.className = 'webgl';
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(74, innerWidth / innerHeight, 0.05, 420);
scene.add(camera);
G.scene = scene; G.camera = camera;
buildWorld(scene);
G.fx = new FX(scene);

// combatants: the player leads the Jackals; nine bots fill both teams
const player = makeCombatant(0, 'YOU', 'atk', true);
player.org = 'J';
G.combatants.push(player); G.player = player;
BOT_NAMES.atk.forEach((name, i) => {
  const c = makeCombatant(1 + i, name, 'atk', false);
  c.org = 'J'; G.combatants.push(c);
});
BOT_NAMES.def.forEach((name, i) => {
  const c = makeCombatant(5 + i, name, 'def', false);
  c.org = 'B'; G.combatants.push(c);
});
for (const c of G.combatants) {
  if (c.isPlayer) continue;
  c.view = makeBotView(c.org === 'J' ? 'atk' : 'def');
  scene.add(c.view.group);
}

// event wiring: combat -> rounds -> hud
G.onKill = (victim, attacker, head) => onKill(G, victim, attacker, head);
G.onBotHurt = (victim, attacker) => {
  const b = victim.brain;
  if (!b || !attacker) return;
  b.lastKnown = { x: attacker.pos.x, z: attacker.pos.z };
  if (b.state === 'hold') b.holdYaw = Math.atan2(-(attacker.pos.x - victim.pos.x), -(attacker.pos.z - victim.pos.z));
};
bindHud(G);

const viewmodel = new Viewmodel(camera);
const controller = new PlayerController(G, renderer.domElement);

// fixed-step simulation
const STEP = 1 / 60;
function stepSim(dt) {
  G.dt = dt;
  G.now += dt;
  stepRounds(G, dt);
  controller.step(dt);
  if (G.phase === 'live') for (const c of G.combatants) if (!c.isPlayer) stepBot(G, c, dt);
  for (const c of G.combatants) if (c.alive) stepWeapon(G, c);
  stepGrenades(G, dt);
  G.noise = G.noise.filter((n) => G.now - n.at < 0.35);
}

// start flow
const menuEl = document.getElementById('menu');
const hudEl = document.getElementById('hud');
if (shotMode) {
  menuEl.classList.add('hidden');
  hudEl.classList.remove('hidden');
  stageShot(G, shotMode);
} else {
  document.getElementById('playBtn').addEventListener('click', () => {
    G.audio.unlock();
    menuEl.classList.add('hidden');
    hudEl.classList.remove('hidden');
    setupMatch(G);
    startRound(G);
    controller.lock();
  });
  document.getElementById('againBtn').addEventListener('click', () => location.reload());
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// render loop
let last = performance.now() / 1000, acc = 0;
const bootT = last;
function frame() {
  requestAnimationFrame(frame);
  const t = performance.now() / 1000;
  const ft = Math.min(0.1, t - last);
  last = t;
  if (!shotMode && G.phase !== 'menu' && G.phase !== 'matchover') {
    acc += ft;
    let n = 0;
    while (acc >= STEP && n < 5) { stepSim(STEP); acc -= STEP; n++; }
    if (n === 5) acc = 0;
  }
  // draw
  if (shotMode) {
    const firstPerson = shotCamera(G, shotMode, t - bootT, camera);
    if (firstPerson) controller.placeCamera(camera, 0);
    viewmodel.group.visible = firstPerson && shotMode !== 'end';
    G.fx.update(0, G.now); // frozen effects: tracers and flashes hold for the capture
  } else {
    controller.placeCamera(camera, ft);
    const gun = G.player ? currentGun(G.player) : null;
    if (gun) viewmodel.setGun(gun.id);
    viewmodel.group.visible = !!G.player?.alive && G.phase !== 'menu';
    viewmodel.update(ft, Math.hypot(G.player?.vel.x || 0, G.player?.vel.z || 0) > 0.6, controller.adsAmount, G.kickPitch > 0.015);
  }
  updateBotViews(G, shotMode ? 0.016 : ft);
  if (!shotMode) G.fx.update(ft, G.now);
  if (G.player) {
    G.listener.x = G.player.pos.x; G.listener.z = G.player.pos.z; G.listener.yaw = G.player.yaw;
  }
  if (G.phase !== 'menu') updateHud();
  renderer.render(scene, camera);
}
frame();
