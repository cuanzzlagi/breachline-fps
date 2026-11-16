// BREACHLINE — entry program for make.fun's threejs-fps-02 bounty (Node 22,
// standard library only). The game itself is the static site under game/:
// plain ES modules, three.js 0.187.0 vendored beside them, no build step and
// no network calls, playable offline against bots in a desktop browser.
//
// This program's whole job is the hand-in: copy game/ and screenshots/ from
// this repository into the output directory, then write dossier.json with
// the kit's buildDossier library (vendor/makefun-threejs.ts, unchanged), so
// the dossier the judge reads is exactly the one the sealed gate rebuilds
// and compares byte for byte. The run is pure file copying plus that one
// library call, so two runs write identical bytes.
//
// Locally:  mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Play it:  node serve.ts   (then open http://localhost:8080)

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The caps below are the scorer's own (reference/gate.json): the dossier text
// the judge reads is capped at 160 KiB, screenshots at 4 files of 256 KiB,
// and game/ at 993 entries and 48 MiB. BREACHLINE sits well inside all three.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
  }),
);
