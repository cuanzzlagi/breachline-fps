// config.js — every tunable number of BREACHLINE lives here: weapons, grenades,
// economy, round rules, teams and the art palette. One place for game state
// constants, so balancing never means hunting through the simulation.

export const TEAMS = {
  atk: { id: 'atk', name: 'JACKALS', color: 0xffb454, css: '#ffb454' },
  def: { id: 'def', name: 'BASTION', color: 0x5fd8c7, css: '#5fd8c7' },
};

export const BOT_NAMES = {
  atk: ['Vex', 'Rook', 'Sable', 'Milo'],
  def: ['Havoc', 'Petra', 'Onyx', 'Bruno', 'Kite'],
};

// Weapon table. spread is the half-angle of the shot cone in degrees for a
// settled, standing first shot; moveSpread multiplies it at full run speed.
// falloff: full damage to range0 metres, then linear down to falloffMin.
export const WEAPONS = {
  sparrow: {
    id: 'sparrow', name: 'P9 SPARROW', slot: 'sidearm', price: 0, auto: false,
    rpm: 380, damage: 34, headMult: 3.4, pellets: 1, mag: 12, reserve: 48,
    reload: 1.5, spread: 0.55, moveSpread: 2.6, bloom: 0.55, kick: 0.55,
    range0: 18, range1: 46, falloffMin: 0.5, speed: 5.0, zoom: 1.0,
    len: 0.34, snd: 'pistol',
  },
  mule: {
    id: 'mule', name: 'MULE 590', slot: 'primary', price: 1100, auto: false,
    rpm: 68, damage: 13, headMult: 2.2, pellets: 8, mag: 6, reserve: 24,
    reload: 2.6, spread: 2.6, moveSpread: 1.7, bloom: 1.4, kick: 2.4,
    range0: 7, range1: 20, falloffMin: 0.25, speed: 4.7, zoom: 1.0,
    len: 0.78, snd: 'shotgun',
  },
  jackal: {
    id: 'jackal', name: 'VK-7 JACKAL', slot: 'primary', price: 1400, auto: true,
    rpm: 780, damage: 24, headMult: 3.2, pellets: 1, mag: 30, reserve: 90,
    reload: 2.1, spread: 0.95, moveSpread: 3.0, bloom: 0.5, kick: 0.5,
    range0: 16, range1: 40, falloffMin: 0.55, speed: 4.9, zoom: 1.0,
    len: 0.62, snd: 'smg',
  },
  kestrel: {
    id: 'kestrel', name: 'AR-4 KESTREL', slot: 'primary', price: 2700, auto: true,
    rpm: 640, damage: 33, headMult: 4.0, pellets: 1, mag: 30, reserve: 90,
    reload: 2.3, spread: 0.62, moveSpread: 3.4, bloom: 0.62, kick: 0.85,
    range0: 30, range1: 70, falloffMin: 0.62, speed: 4.6, zoom: 1.0,
    len: 0.86, snd: 'rifle',
  },
  longbow: {
    id: 'longbow', name: 'LONGBOW-12', slot: 'primary', price: 4300, auto: false,
    rpm: 42, damage: 108, headMult: 2.0, pellets: 1, mag: 5, reserve: 20,
    reload: 3.1, spread: 0.06, moveSpread: 6.0, bloom: 2.2, kick: 3.2,
    range0: 60, range1: 120, falloffMin: 0.9, speed: 4.3, zoom: 4.0,
    len: 1.12, snd: 'sniper',
  },
};

export const NADES = {
  flash: { id: 'flash', name: 'FLASH', price: 200, key: '4' },
  smoke: { id: 'smoke', name: 'SMOKE', price: 300, key: '5' },
  frag: { id: 'frag', name: 'FRAG', price: 300, key: '6' },
};

export const ARMOR_PRICE = 1000;

export const BUY_MENU = [
  { kind: 'weapon', id: 'mule' }, { kind: 'weapon', id: 'jackal' },
  { kind: 'weapon', id: 'kestrel' }, { kind: 'weapon', id: 'longbow' },
  { kind: 'armor' },
  { kind: 'nade', id: 'flash' }, { kind: 'nade', id: 'smoke' }, { kind: 'nade', id: 'frag' },
];

export const RULES = {
  teamSize: 5,
  winTarget: 7,          // rounds to win the match
  swapAfter: 6,          // sides swap once this many rounds are played
  buyTime: 15,           // seconds of buy phase, players frozen in spawn
  roundTime: 100,        // seconds on the round clock
  roundEndTime: 5.5,     // banner / slow time between rounds
  plantTime: 3.0,        // channel to plant the charge
  defuseTime: 5.0,       // channel to defuse it
  chargeTime: 35,        // seconds from plant to detonation
  startMoney: 800,
  maxMoney: 16000,
  payKill: 300,
  payPlant: 300,
  payDefuse: 300,
  payWinElim: 2900,
  payWinObjective: 3250,
  payLossBase: 1900,
  payLossStep: 500,      // extra loss pay per consecutive loss, capped x3
};

export const PALETTE = {
  sky: 0x2e4258, horizon: 0xd9905f, fog: 0x6b5a49,
  ground: 0x3d4148, groundLine: 0x565d66,
  concrete: 0x8b8f94, concreteDark: 0x62666c,
  crate: 0x9a7648, crateDark: 0x77572f,
  metal: 0x707880,
  containers: [0xa34a38, 0x2f6f6a, 0xb07a2e, 0x46617e, 0x74553a],
  siteA: 0xffcf5c, siteB: 0xc792ff,
  sun: 0xffd9a8, hemiSky: 0xbdd3e6, hemiGround: 0x54493a,
};
