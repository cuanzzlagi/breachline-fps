// rounds.js — the match itself: phases (buy, live, over), the round clock,
// the breach charge (carry, drop, plant, defuse, detonate), win checks,
// economy payouts and the half-time side swap. It owns G.phase, G.score and
// G.charge; combat.js reports kills through G.onKill, which lands here.

import { RULES } from './config.js';
import { SITES, SPAWNS } from './map.js';
import { botBuy, planRound } from './bots.js';
import { damage, gunState } from './combat.js';

export function otherSide(side) { return side === 'atk' ? 'def' : 'atk'; }

export function setupMatch(G) {
  G.score = { J: 0, B: 0 };
  G.round = 0;
  G.lossStreak = { atk: 0, def: 0 };
  G.charge = freshCharge();
  for (const c of G.combatants) {
    c.money = RULES.startMoney;
    resetLoadout(c);
  }
}

function freshCharge() {
  return { carrier: null, planted: false, x: 0, z: 0, site: null, plantedAt: 0, drop: null, lastBeep: 0 };
}

function resetLoadout(c) {
  c.weapons.primary = null;
  c.weapons.sidearm = gunState('sparrow');
  c.weapons.current = 'sidearm';
  c.nades = { flash: 0, smoke: 0, frag: 0 };
  c.armor = 0;
}

export function startRound(G) {
  G.round++;
  G.phase = 'buy';
  G.phaseT = RULES.buyTime;
  G.roundClock = RULES.roundTime;
  G.charge = freshCharge();
  G.noise.length = 0;
  const bySide = { atk: 0, def: 0 };
  for (const c of G.combatants) {
    const idx = bySide[c.team]++;
    const sp = SPAWNS[c.team][idx % SPAWNS[c.team].length];
    c.pos.set(sp[0], 0, sp[1]);
    c.vel.set(0, 0, 0);
    c.yaw = c.team === 'atk' ? 0 : Math.PI; // attackers face north (-z), defenders south
    c.pitch = 0;
    c.hp = 100; c.alive = true; c.crouch = false;
    c.channel = null; c.blindUntil = 0; c.hasCharge = false;
    c.bloom = 0; c.reloadUntil = 0;
  }
  // the charge goes to the player on their first attacking round of a half,
  // otherwise to a random attacking bot
  const attackers = G.combatants.filter((c) => c.team === 'atk');
  const playerAtk = attackers.find((c) => c.isPlayer);
  let carrier;
  if (playerAtk && !G.playerCarriedHalf) { carrier = playerAtk; G.playerCarriedHalf = true; }
  else {
    const bots = attackers.filter((c) => !c.isPlayer);
    carrier = bots[Math.floor(G.rng() * bots.length)] || attackers[0];
  }
  carrier.hasCharge = true;
  G.charge.carrier = carrier;
  planRound(G);
  for (const c of G.combatants) if (!c.isPlayer) botBuy(c, G.rng);
  G.onRoundStart();
}

export function endRound(G, winnerSide, reason) {
  if (G.phase !== 'live') return;
  G.phase = 'over';
  G.phaseT = RULES.roundEndTime;
  const winnerOrg = G.combatants.find((c) => c.team === winnerSide).org;
  G.score[winnerOrg]++;
  const loserSide = otherSide(winnerSide);
  const objective = reason === 'detonation' || reason === 'defuse' || reason === 'time';
  for (const c of G.combatants) {
    if (c.team === winnerSide) c.money += objective ? RULES.payWinObjective : RULES.payWinElim;
    else c.money += RULES.payLossBase + RULES.payLossStep * Math.min(3, G.lossStreak[loserSide]);
    c.money = Math.min(RULES.maxMoney, c.money);
    c.channel = null;
    if (!c.alive) { // the dead come back next round on a fresh sidearm
      c.weapons.primary = null;
      c.weapons.sidearm = gunState('sparrow');
      c.weapons.current = 'sidearm';
      c.armor = 0;
      c.nades = { flash: 0, smoke: 0, frag: 0 };
    }
  }
  G.lossStreak[winnerSide] = 0;
  G.lossStreak[loserSide]++;
  G.onRoundEnd(winnerSide, reason);
}

export function onKill(G, victim, attacker, head) {
  G.onKillFeed(victim, attacker, head);
  if (victim.hasCharge) {
    victim.hasCharge = false;
    G.charge.carrier = null;
    G.charge.drop = { x: victim.pos.x, z: victim.pos.z };
  }
  if (G.phase !== 'live' || G.detonating) return;
  const alive = { atk: 0, def: 0 };
  for (const c of G.combatants) if (c.alive) alive[c.team]++;
  if (G.charge.planted) {
    if (alive.def === 0) endRound(G, 'atk', 'elimination');
    // attackers all dead after the plant: the round plays on — defuse or boom
  } else if (alive.atk === 0) endRound(G, 'def', 'elimination');
  else if (alive.def === 0) endRound(G, 'atk', 'elimination');
}

function stepChannels(G, dt) {
  const now = G.now;
  for (const c of G.combatants) {
    const ch = c.channel;
    if (!ch) continue;
    if (!c.alive) { c.channel = null; continue; }
    if (ch.kind === 'plant') {
      if (Math.hypot(c.vel.x, c.vel.z) > 0.6) { c.channel = null; continue; }
      if (now - ch.t0 >= ch.dur) {
        c.channel = null;
        c.hasCharge = false;
        G.charge.planted = true;
        G.charge.x = c.pos.x; G.charge.z = c.pos.z;
        G.charge.site = ch.site; G.charge.plantedAt = now;
        G.charge.carrier = null;
        c.stats.plants++;
        c.money = Math.min(RULES.maxMoney, c.money + RULES.payPlant);
        G.fx.chargeMesh.position.set(c.pos.x, 0, c.pos.z);
        G.fx.chargeMesh.visible = true;
        G.audio.plantDone();
        G.onPlanted(ch.site);
      }
    } else if (ch.kind === 'defuse') {
      if (Math.hypot(c.pos.x - G.charge.x, c.pos.z - G.charge.z) > 2.8) { c.channel = null; continue; }
      if (now - ch.t0 >= ch.dur) {
        c.channel = null;
        c.stats.defuses++;
        c.money = Math.min(RULES.maxMoney, c.money + RULES.payDefuse);
        G.fx.chargeMesh.visible = false;
        endRound(G, 'def', 'defuse');
      }
    }
  }
  // the player's own channel starts from the interact key
  const p = G.player;
  if (G.phase === 'live' && p.alive && !p.channel && G.input.interact) {
    if (p.team === 'atk' && p.hasCharge && !G.charge.planted) {
      const site = SITES.find((s) => Math.hypot(p.pos.x - s.x, p.pos.z - s.z) < s.r);
      if (site) p.channel = { kind: 'plant', t0: now, dur: RULES.plantTime, site };
    } else if (p.team === 'def' && G.charge.planted) {
      if (Math.hypot(p.pos.x - G.charge.x, p.pos.z - G.charge.z) < 2.6) {
        p.channel = { kind: 'defuse', t0: now, dur: RULES.defuseTime };
      }
    }
  }
  if (p.channel && !G.input.interact && p.isPlayer) p.channel = null;
}

export function stepRounds(G, dt) {
  const now = G.now;
  if (G.phase === 'buy') {
    G.phaseT -= dt;
    if (G.phaseT <= 0) {
      G.phase = 'live';
      G.onPhaseLive();
    }
    return;
  }
  if (G.phase === 'over') {
    G.phaseT -= dt;
    if (G.phaseT <= 0) {
      if (G.score.J >= RULES.winTarget || G.score.B >= RULES.winTarget) {
        G.phase = 'matchover';
        G.onMatchEnd(G.score.J > G.score.B ? 'J' : 'B');
        return;
      }
      if (G.round === RULES.swapAfter) {
        for (const c of G.combatants) {
          c.team = otherSide(c.team);
          c.money = RULES.startMoney;
          c.weapons.primary = null;
          c.weapons.sidearm = gunState('sparrow');
          c.weapons.current = 'sidearm';
          c.armor = 0;
          c.nades = { flash: 0, smoke: 0, frag: 0 };
        }
        G.lossStreak = { atk: 0, def: 0 };
        G.playerCarriedHalf = false;
        G.onSwap();
      }
      startRound(G);
    }
    return;
  }
  if (G.phase !== 'live') return;

  stepChannels(G, dt);

  // dropped charge: the nearest living attacker bot is sent to fetch it,
  // and anyone on the attacking side picks it up by walking over it
  const ch = G.charge;
  if (ch.drop && !ch.planted) {
    for (const c of G.combatants) {
      if (c.alive && c.team === 'atk' && Math.hypot(c.pos.x - ch.drop.x, c.pos.z - ch.drop.z) < 1.0) {
        c.hasCharge = true; ch.carrier = c; ch.drop = null;
        break;
      }
    }
    if (ch.drop) {
      let best = null, bd = 1e9;
      for (const c of G.combatants) {
        if (!c.alive || c.isPlayer || c.team !== 'atk' || !c.brain) continue;
        const d = Math.hypot(c.pos.x - ch.drop.x, c.pos.z - ch.drop.z);
        if (d < bd) { bd = d; best = c; }
      }
      if (best && best.brain.job !== 'fetch') { best.brain.job = 'fetch'; best.brain.jobPos = { x: ch.drop.x, z: ch.drop.z }; }
    }
  }

  if (ch.planted) {
    const left = RULES.chargeTime - (now - ch.plantedAt);
    const interval = left < 8 ? 0.24 : left < 18 ? 0.5 : 0.9;
    if (now - ch.lastBeep > interval) { ch.lastBeep = now; G.audio.beep(left < 8); }
    if (left <= 0) {
      G.detonating = true; // blast kills must not re-decide the round first
      G.fx.explosionFx(ch.x, ch.z);
      G.audio.explosion();
      G.fx.chargeMesh.visible = false;
      for (const c of G.combatants) {
        if (!c.alive) continue;
        const d = Math.hypot(c.pos.x - ch.x, c.pos.z - ch.z);
        if (d < 3.6) damage(G, c, 500, null, false);
      }
      G.detonating = false;
      endRound(G, 'atk', 'detonation');
    }
    return;
  }

  G.roundClock -= dt;
  if (G.roundClock <= 0) {
    G.roundClock = 0;
    endRound(G, 'def', 'time');
  }
}
