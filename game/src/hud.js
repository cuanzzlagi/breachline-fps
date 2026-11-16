// hud.js — everything drawn over the 3D view: top bar, vitals, weapon box,
// killfeed, banners, buy menu, scoreboard, minimap, and the feedback overlays
// (damage vignette and direction, flash, sniper scope). It also owns the
// G.on* event callbacks the simulation fires, so rounds.js and combat.js
// never touch the DOM themselves.

import { WEAPONS, NADES, ARMOR_PRICE, BUY_MENU, RULES } from './config.js';
import { currentGun, spreadFor, buyWeapon, buyArmor, buyNade } from './weapons.js';
import { BOXES, SITES, BOUNDS } from './map.js';
import { fmtTime, clamp } from './util.js';

const $ = (id) => document.getElementById(id);
const els = {};
let G = null;
let lastVals = {};
let bannerUntil = 0, hitUntil = 0, dmgVinUntil = 0, boardAt = 0;
let buyOpen = false;
const mapPings = [];

export function bindHud(game) {
  G = game;
  for (const id of ['hud', 'topbar', 'scoreAtk', 'scoreDef', 'timer', 'roundLbl', 'youTag', 'chargeTag', 'chargeTime',
    'killfeed', 'xhair', 'hitmark', 'banner', 'bannerBig', 'bannerSmall', 'interact', 'interactLbl', 'progFill',
    'hpFill', 'hpText', 'armorFill', 'armorText', 'money', 'weapName', 'ammo', 'nades',
    'buyMenu', 'buyGrid', 'buyMoney', 'board', 'boardBody', 'dmgVin', 'dmgDir', 'flashFx', 'scopeFx',
    'menu', 'endScreen', 'endTitle', 'endSub', 'endStats', 'minimap']) els[id] = $(id);
  buildBuyMenu();

  G.onRoundStart = () => {
    showBanner(`ROUND ${G.round}`, sideMission(), 2.6);
    buyOpen = true;
    refreshBuy();
  };
  G.onPhaseLive = () => { buyOpen = false; };
  G.onSwap = () => { G.playerCarriedHalf = false; showBanner('SIDES SWAP', 'NEW HALF — FRESH ECONOMY', 3); };
  G.onRoundEnd = (winnerSide, reason) => {
    const winnerOrg = G.combatants.find((c) => c.team === winnerSide).org;
    const mine = G.player.team === winnerSide;
    const reasons = {
      elimination: 'TEAM ELIMINATED', detonation: 'CHARGE DETONATED',
      defuse: 'CHARGE DEFUSED', time: 'TIME EXPIRED — BASTION HOLDS',
    };
    showBanner(winnerOrg === 'J' ? 'JACKALS TAKE THE ROUND' : 'BASTION TAKES THE ROUND', reasons[reason] || '', 4.2);
    G.audio.stinger(mine);
    buyOpen = false;
  };
  G.onPlanted = (site) => {
    showBanner('CHARGE PLANTED', `SITE ${site.id} — ${RULES.chargeTime} SECONDS`, 2.6);
  };
  G.onKillFeed = (victim, attacker, head) => addFeed(victim, attacker, head);
  G.onPlayerHit = (victim, head, killed) => {
    G.audio.hit(head);
    els.hitmark.style.opacity = 1;
    els.hitmark.className = killed ? 'kill' : '';
    hitUntil = G.now + (killed ? 0.34 : 0.16);
  };
  G.onPlayerHurt = (attacker) => {
    G.audio.hurt();
    dmgVinUntil = G.now + 0.55;
    G.shake = Math.min(0.4, G.shake + 0.12);
    if (attacker) {
      const dx = attacker.pos.x - G.player.pos.x, dz = attacker.pos.z - G.player.pos.z;
      const world = Math.atan2(dx, dz);
      const rel = world - (-G.player.yaw) + Math.PI;
      els.dmgDir.style.transform = `rotate(${rel}rad)`;
      els.dmgDir.style.opacity = 1;
    }
  };
  G.onPlayerFlashed = (dur) => { G.flashUntil = G.now + dur; };
  G.onLockChange = (locked) => {
    if (!locked && (G.phase === 'live' || G.phase === 'buy') && !G.shotMode) {
      showBanner('CLICK TO AIM', 'MOUSE RELEASED', 1.2);
    }
  };
  G.onMatchEnd = (winnerOrg) => {
    const p = G.player;
    const won = p.org === winnerOrg;
    els.endTitle.textContent = won ? 'VICTORY' : 'DEFEAT';
    els.endTitle.style.color = won ? 'var(--good)' : 'var(--bad)';
    els.endSub.textContent = winnerOrg === 'J' ? 'JACKALS TAKE THE YARD' : 'BASTION HOLDS THE YARD';
    els.endStats.innerHTML =
      `FINAL SCORE — JACKALS <b>${G.score.J}</b> · BASTION <b>${G.score.B}</b><br>` +
      `YOU — <b>${p.stats.k}</b> KILLS · <b>${p.stats.d}</b> DEATHS · <b>${p.stats.plants}</b> PLANTS · <b>${p.stats.defuses}</b> DEFUSES`;
    els.endScreen.classList.remove('hidden');
    document.exitPointerLock?.();
  };

  document.addEventListener('keydown', (e) => {
    if (!buyOpen || G.phase !== 'buy') return;
    const idx = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8'].indexOf(e.code);
    if (idx >= 0 && BUY_MENU[idx]) doBuy(BUY_MENU[idx]);
  });
}

function sideMission() {
  const p = G.player;
  if (!p) return '';
  return p.team === 'atk' ? 'JACKALS ATTACK — PLANT THE CHARGE' : 'BASTION DEFENDS — HOLD THE SITES';
}

function showBanner(big, small, dur) {
  els.bannerBig.textContent = big;
  els.bannerSmall.textContent = small;
  els.banner.classList.remove('hidden');
  bannerUntil = G.now + dur;
}

function addFeed(victim, attacker, head) {
  const div = document.createElement('div');
  div.className = 'kf';
  const cls = (c) => (c.org === 'J' ? 'atk' : 'def');
  div.innerHTML = attacker && attacker !== victim
    ? `<b class="${cls(attacker)}">${attacker.isPlayer ? 'YOU' : attacker.name}</b> <span class="w">${head ? '⌖ HEADSHOT' : '▸'}</span> <b class="${cls(victim)}">${victim.isPlayer ? 'YOU' : victim.name}</b>`
    : `<b class="${cls(victim)}">${victim.isPlayer ? 'YOU' : victim.name}</b> <span class="w">☠</span>`;
  els.killfeed.prepend(div);
  while (els.killfeed.children.length > 5) els.killfeed.lastChild.remove();
  setTimeout(() => { div.style.opacity = '0.25'; }, 4200);
  setTimeout(() => div.remove(), 6000);
}

// ---------- buy menu ----------

function itemInfo(item) {
  if (item.kind === 'weapon') { const d = WEAPONS[item.id]; return { name: d.name, desc: `${d.mag} rounds · ${d.auto ? 'automatic' : 'semi'} · dmg ${d.damage}`, price: d.price }; }
  if (item.kind === 'armor') return { name: 'KEVLAR VEST', desc: 'Absorbs half of all damage while it lasts', price: ARMOR_PRICE };
  const d = NADES[item.id];
  return { name: `${d.name} GRENADE`, desc: item.id === 'flash' ? 'Blinds anyone looking at it' : item.id === 'smoke' ? 'A wall of smoke for 14 seconds' : 'High explosive, 5 m radius', price: d.price };
}

function buildBuyMenu() {
  els.buyGrid.innerHTML = '';
  BUY_MENU.forEach((item, i) => {
    const info = itemInfo(item);
    const div = document.createElement('div');
    div.className = 'buyItem';
    div.dataset.idx = i;
    div.innerHTML = `<span class="k">${i + 1}</span><div class="n">${info.name}</div><div class="d">${info.desc}</div><div class="p">¤${info.price}</div>`;
    div.addEventListener('click', () => doBuy(item));
    els.buyGrid.appendChild(div);
  });
}

function owned(item) {
  const p = G.player;
  if (item.kind === 'weapon') {
    const d = WEAPONS[item.id];
    return (d.slot === 'primary' ? p.weapons.primary : p.weapons.sidearm)?.id === item.id;
  }
  if (item.kind === 'armor') return p.armor >= 100;
  return p.nades[item.id] >= 1;
}

function doBuy(item) {
  const p = G.player;
  let ok = false;
  if (item.kind === 'weapon') ok = buyWeapon(p, item.id);
  else if (item.kind === 'armor') ok = buyArmor(p);
  else ok = buyNade(p, item.id);
  if (ok) G.audio.buy(); else G.audio.deny();
  refreshBuy();
}

function refreshBuy() {
  if (!els.buyGrid) return;
  const p = G.player;
  els.buyMoney.textContent = `CREDITS ¤${p.money}`;
  [...els.buyGrid.children].forEach((div, i) => {
    const item = BUY_MENU[i];
    div.classList.toggle('owned', owned(item));
    div.classList.toggle('poor', !owned(item) && p.money < itemInfo(item).price);
  });
}

// ---------- per-frame ----------

function setText(key, el, txt) {
  if (lastVals[key] !== txt) { lastVals[key] = txt; el.textContent = txt; }
}

export function updateHud() {
  if (!G || !G.player) return;
  const p = G.player, now = G.now;
  // clock: buy counts the buy timer, live counts the round, planted counts the charge
  let clock = G.roundClock, low = false;
  if (G.phase === 'buy') clock = G.phaseT;
  if (G.charge.planted) { clock = Math.max(0, RULES.chargeTime - (now - G.charge.plantedAt)); low = clock < 10; }
  else if (G.phase === 'live') low = clock < 15;
  setText('timer', els.timer, fmtTime(clock));
  els.timer.classList.toggle('low', low);
  setText('roundLbl', els.roundLbl, `ROUND ${G.round} · FIRST TO ${RULES.winTarget}`);
  setText('scoreAtk', els.scoreAtk, String(G.score.J));
  setText('scoreDef', els.scoreDef, String(G.score.B));
  const youTxt = `YOU — <b>${p.org === 'J' ? 'JACKALS' : 'BASTION'}</b> · ${p.team === 'atk' ? 'ATTACKING' : 'DEFENDING'}${p.hasCharge ? ' · <b>YOU CARRY THE CHARGE</b>' : ''}${G.phase === 'buy' ? ' · BUY PHASE' : ''}`;
  if (lastVals.you !== youTxt) { lastVals.you = youTxt; els.youTag.innerHTML = youTxt; }
  els.chargeTag.classList.toggle('hidden', !G.charge.planted);
  if (G.charge.planted) setText('chargeTime', els.chargeTime, fmtTime(RULES.chargeTime - (now - G.charge.plantedAt)));
  // vitals
  els.hpFill.style.width = `${clamp(p.hp, 0, 100)}%`;
  els.hpFill.style.background = p.hp < 30 ? 'var(--bad)' : 'var(--good)';
  setText('hp', els.hpText, String(Math.ceil(p.hp)));
  els.armorFill.style.width = `${clamp(p.armor, 0, 100)}%`;
  setText('armor', els.armorText, String(Math.ceil(p.armor)));
  // weapon box
  const gun = currentGun(p);
  setText('money', els.money, `¤${p.money}`);
  setText('weap', els.weapName, gun ? gun.def.name : '—');
  const ammoTxt = gun ? `${gun.mag}<span class="res"> / ${gun.reserve}</span>` : '';
  if (lastVals.ammo !== ammoTxt) { lastVals.ammo = ammoTxt; els.ammo.innerHTML = ammoTxt; }
  els.ammo.classList.toggle('low', !!gun && gun.mag <= Math.ceil(gun.def.mag * 0.25));
  const nadeTxt = `FLASH <b>${p.nades.flash}</b>|SMOKE <b>${p.nades.smoke}</b>|FRAG <b>${p.nades.frag}</b>`;
  if (lastVals.nades !== nadeTxt) {
    lastVals.nades = nadeTxt;
    els.nades.innerHTML = `<span>4 FLASH <b>${p.nades.flash}</b></span><span>5 SMOKE <b>${p.nades.smoke}</b></span><span>6 FRAG <b>${p.nades.frag}</b></span>`;
  }
  // crosshair follows the true spread cone
  if (gun) els.xhair.style.setProperty('--sp', `${3 + spreadFor(G, p, gun) * 6.5}px`);
  els.xhair.style.opacity = p.alive && !p.scoped ? 1 : 0;
  els.scopeFx.classList.toggle('hidden', !p.scoped);
  if (now > hitUntil) els.hitmark.style.opacity = 0;
  if (now > bannerUntil) els.banner.classList.add('hidden');
  els.dmgVin.style.opacity = now < dmgVinUntil ? 0.85 : Math.max(0, (+els.dmgVin.style.opacity || 0) - 0.03);
  if (now > dmgVinUntil + 0.4) els.dmgDir.style.opacity = 0;
  const blindLeft = (G.flashUntil || 0) - now;
  els.flashFx.style.opacity = blindLeft > 0 ? clamp(blindLeft / 1.6, 0, 1) : 0;
  // interact prompt / channel progress
  const ch = p.channel;
  if (ch) {
    els.interact.classList.remove('hidden');
    els.interactLbl.textContent = ch.kind === 'plant' ? 'PLANTING THE CHARGE…' : 'DEFUSING…';
    els.progFill.style.width = `${clamp((now - ch.t0) / ch.dur * 100, 0, 100)}%`;
    els.progFill.style.background = ch.kind === 'plant' ? 'var(--amber)' : 'var(--teal)';
  } else if (G.phase === 'live' && p.alive && p.team === 'atk' && p.hasCharge && !G.charge.planted &&
    SITES.some((s) => Math.hypot(p.pos.x - s.x, p.pos.z - s.z) < s.r)) {
    els.interact.classList.remove('hidden');
    els.interactLbl.textContent = 'HOLD E TO PLANT THE CHARGE';
    els.progFill.style.width = '0%';
  } else if (G.phase === 'live' && p.alive && p.team === 'def' && G.charge.planted &&
    Math.hypot(p.pos.x - G.charge.x, p.pos.z - G.charge.z) < 2.6) {
    els.interact.classList.remove('hidden');
    els.interactLbl.textContent = 'HOLD E TO DEFUSE';
    els.progFill.style.width = '0%';
  } else els.interact.classList.add('hidden');
  // buy menu
  if (G.input.buyToggle) { G.input.buyToggle = false; if (G.phase === 'buy') { buyOpen = !buyOpen; if (buyOpen) refreshBuy(); } }
  const showBuy = buyOpen && G.phase === 'buy' && p.alive;
  els.buyMenu.classList.toggle('hidden', !showBuy);
  if (showBuy && Math.floor(now * 2) !== Math.floor((now - 0.02) * 2)) refreshBuy();
  // scoreboard
  const showBoard = !!G.input.board;
  els.board.classList.toggle('hidden', !showBoard);
  if (showBoard && now - boardAt > 0.25) { boardAt = now; renderBoard(); }
  drawMinimap();
}

function renderBoard() {
  const rows = [...G.combatants].sort((a, b) => (a.org > b.org ? 1 : -1) || b.stats.k - a.stats.k);
  let html = '<table><tr><th>PLAYER</th><th>TEAM</th><th>SIDE</th><th>K</th><th>D</th><th>CREDITS</th></tr>';
  for (const c of rows) {
    html += `<tr class="${c.alive ? '' : 'dead'} ${c.isPlayer ? 'me' : ''}"><td>${c.isPlayer ? 'YOU' : c.name}</td>` +
      `<td>${c.org === 'J' ? 'Jackals' : 'Bastion'}</td><td>${c.team === 'atk' ? 'ATK' : 'DEF'}</td>` +
      `<td>${c.stats.k}</td><td>${c.stats.d}</td><td>¤${c.money}</td></tr>`;
  }
  els.boardBody.innerHTML = html + '</table>';
}

// ---------- minimap ----------

function drawMinimap() {
  const cv = els.minimap;
  if (!cv) return;
  const g = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  const sx = (x) => (x - BOUNDS.minX) / (BOUNDS.maxX - BOUNDS.minX) * W;
  const sz = (z) => (z - BOUNDS.minZ) / (BOUNDS.maxZ - BOUNDS.minZ) * H;
  g.fillStyle = '#12161c'; g.fillRect(0, 0, W, H);
  for (const s of SITES) {
    g.strokeStyle = `#${s.color.toString(16).padStart(6, '0')}`;
    g.lineWidth = 2;
    g.beginPath(); g.arc(sx(s.x), sz(s.z), s.r / 64 * W, 0, Math.PI * 2); g.stroke();
    g.fillStyle = g.strokeStyle; g.font = '700 15px system-ui'; g.textAlign = 'center';
    g.fillText(s.id, sx(s.x), sz(s.z) + 5);
  }
  g.fillStyle = '#4a5260';
  for (const b of BOXES) {
    if (b.kind === 'barrel') continue;
    g.fillRect(sx(b.min.x), sz(b.min.z), (b.max.x - b.min.x) / 64 * W, (b.max.z - b.min.z) / 44 * H);
  }
  const now = G.now;
  for (const n of G.noise) {
    if (n.kind === 'shot' && n.team !== G.player.team) mapPings.push({ x: n.x, z: n.z, until: now + 1.4 });
  }
  for (let i = mapPings.length - 1; i >= 0; i--) {
    const pg = mapPings[i];
    if (now > pg.until) { mapPings.splice(i, 1); continue; }
    g.fillStyle = 'rgba(255,90,70,.85)';
    g.beginPath(); g.arc(sx(pg.x), sz(pg.z), 4, 0, Math.PI * 2); g.fill();
  }
  if (G.charge.planted) {
    g.fillStyle = (now % 0.6) < 0.3 ? '#ff4030' : '#7a1610';
    g.beginPath(); g.arc(sx(G.charge.x), sz(G.charge.z), 5, 0, Math.PI * 2); g.fill();
  } else if (G.charge.drop) {
    g.fillStyle = '#ffb454';
    g.beginPath(); g.arc(sx(G.charge.drop.x), sz(G.charge.drop.z), 4, 0, Math.PI * 2); g.fill();
  }
  for (const c of G.combatants) {
    if (!c.alive || c.isPlayer || c.team !== G.player.team) continue;
    g.fillStyle = '#e8edf2';
    g.beginPath(); g.arc(sx(c.pos.x), sz(c.pos.z), 3.4, 0, Math.PI * 2); g.fill();
  }
  const p = G.player;
  g.save();
  g.translate(sx(p.pos.x), sz(p.pos.z));
  g.rotate(Math.atan2(-Math.cos(p.yaw), -Math.sin(p.yaw)) + Math.PI / 2);
  g.fillStyle = '#ffd76a';
  g.beginPath(); g.moveTo(0, -6); g.lineTo(4.4, 5); g.lineTo(-4.4, 5); g.closePath(); g.fill();
  g.restore();
}
