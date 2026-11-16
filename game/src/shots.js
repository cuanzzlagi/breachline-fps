// shots.js — staged, deterministic scenes for the entry's screenshots
// (shots.json names them: ?shot=start, ?shot=play, ?shot=end, each &seed=1).
// They are real renders of the live game state — combatants, HUD values,
// killfeed and effects are all set through the same code paths a real match
// uses, then the simulation is left frozen so any captured frame is the
// composed scene.

import { giveWeapon } from './weapons.js';
import { SITES } from './map.js';

function place(c, x, z, yaw) {
  c.pos.set(x, 0, z); c.yaw = yaw; c.vel.set(0, 0, 0);
}

export function stageShot(G, name) {
  const [player, ...bots] = G.combatants;
  const J = bots.filter((c) => c.org === 'J');
  const B = bots.filter((c) => c.org === 'B');
  if (name === 'start') {
    G.phase = 'buy'; G.phaseT = 13; G.round = 1;
    giveWeapon(player, 'kestrel');
    player.money = 800;
    place(player, 0, 18.5, 0);
    J.forEach((c, i) => place(c, -6 + i * 3.4, 19.5 - (i % 2), 0));
    B.forEach((c, i) => place(c, -6 + i * 3, -18.5, Math.PI));
    G.onRoundStart();
    return;
  }
  if (name === 'play') {
    G.phase = 'live'; G.round = 4; G.roundClock = 47;
    G.score.J = 2; G.score.B = 1;
    giveWeapon(player, 'kestrel');
    const gun = player.weapons.primary; gun.mag = 18; gun.reserve = 90;
    player.hp = 72; player.armor = 55; player.money = 3400;
    place(player, -12.5, -4.2, 0.72);
    place(J[0], -18.6, -9.8, 2.5); J[0].crouch = false;
    place(J[1], -5.5, -1.5, 2.9); J[1].hasCharge = true; G.charge.carrier = J[1];
    J[2].alive = false; place(J[2], -10.5, -9.5, 2.2);
    place(J[3], -19, 6.5, 2.8);
    place(B[0], -16.8, -16.8, 2.2);
    place(B[1], -12.2, -12.6, -1.9);
    place(B[2], 1.8, -6.2, 3.1);
    place(B[3], 21, -9, -0.7);
    place(B[4], 16.8, -16.6, -2.2);
    G.onKillFeed(J[2], B[1], false);
    G.onKillFeed(B[4], J[0], true);
    // a frozen exchange of fire across the A approach
    G.fx.tracer(-18.2, 1.35, -10, -12.6, 1.1, -12.2);
    G.fx.tracer(-12.4, 1.3, -12.4, -17.9, 1.42, -10.3);
    G.fx.muzzle(-18.2, 1.35, -10);
    G.fx.impact(-12.6, 1.1, -12.2, 7);
    return;
  }
  // end: the charge went off on A; the Jackals hold the crater
  G.phase = 'over'; G.round = 5;
  G.score.J = 3; G.score.B = 1;
  const A = SITES[0];
  G.fx.spawnSmoke(A.x, A.z, G.now - 3, 9999);
  G.fx.impact(A.x + 1, 0.3, A.z + 1, 30);
  place(player, A.x + 7.5, A.z + 6.5, -2.2);
  place(J[0], A.x - 2, A.z + 2, 0.7);
  place(J[1], A.x + 3.4, A.z - 1.5, -0.6); J[1].crouch = true;
  place(J[2], A.x - 5, A.z - 3, 1.2);
  J[3].alive = false; place(J[3], A.x + 1, A.z + 5, 0);
  B.forEach((c, i) => { c.alive = false; place(c, A.x - 3 + i * 2.6, A.z - 6 + (i % 2) * 2, 2.6); });
  for (const c of G.combatants) if (!c.alive && c.view) c.view.deadT = 1;
  G.onRoundEnd('atk', 'detonation');
}

// Camera for a staged scene: first person for start/play, a slow orbit of
// the site for end. elapsed is seconds since the page loaded.
export function shotCamera(G, name, elapsed, camera) {
  if (name === 'end') {
    const A = SITES[0];
    const a = 0.65 + elapsed * 0.03;
    camera.position.set(A.x + Math.sin(a) * 11.5, 5.2, A.z + Math.cos(a) * 11.5);
    camera.lookAt(A.x, 0.8, A.z);
    camera.fov = 55; camera.updateProjectionMatrix();
    return false; // no viewmodel in the orbit shot
  }
  return true; // first person: main places the camera at the player's eye
}
