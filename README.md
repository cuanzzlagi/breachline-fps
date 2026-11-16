# breachline-fps

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/cuanzzlagi/breachline-fps/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/cuanzzlagi/breachline-fps/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

**BREACHLINE** is a complete round-based tactical FPS for the browser, in the
style Counter-Strike made famous — but with its own map, teams, weapons and
voice. Two five-player teams fight over Kestrel Yard, an original container
yard with two objective sites: the Jackals carry a breach charge to Site A
or B and defend it for 35 seconds; Bastion holds the sites, runs the clock,
or defuses. Between rounds an economy pays for kills, plants and wins, and a
buy menu sells four more weapons, kevlar and three grenades (flash, smoke,
frag). First to 7 rounds; sides swap at the half.

Gunplay is built around one idea: accuracy is earned. Spread blooms when you
run, jump or spray, and a settled, crouched first shot lands where the
crosshair sits — counter-strafing and tap fire beat holding the trigger. The
nine bots play the same rules: they follow routes through a waypoint graph,
hold angles, stop to shoot in bursts, react to sight, gunfire noise and
teammate deaths, rotate on the plant, smoke their own defuse, and never see
through walls or smoke.

Everything runs from static files with no build step and no network request:
three.js 0.187.0 is vendored under `game/vendor/`, all sound is synthesized
with WebAudio, and the whole game is hand-written ES modules under
`game/src/` — one job per module, a fixed-step simulation kept apart from
rendering. `main.ts` is the make.fun hand-in program: it copies `game/` and
`screenshots/` to the output directory and writes the judge's dossier.

## Run it

```sh
node serve.ts
# then open http://localhost:8080 in a desktop browser
```

Any static file server pointed at `game/` works just as well. Click DEPLOY,
then click the game to capture the mouse. WASD moves, Shift walks, Ctrl
crouches, E plants/defuses, B buys during the buy phase, Tab shows scores.

## Layout

- `game/index.html` — the page, HUD and menus
- `game/src/` — the game: `config` (all tuning), `map` (Kestrel Yard),
  `nav` (waypoint A*), `combat` (bodies, hits, grenades), `weapons` (firing
  model), `bots` (the AI), `player`, `rounds` (match flow and economy),
  `hud`, `fx`, `audio` (synth SFX), `shots` (screenshot scenes), `main`
- `screenshots/` — three staged renders of the game (see `shots.json`)
- `vendor/makefun-threejs.ts` — the kit's dossier library, unchanged
- `main.ts` — the entry program described above

MIT licensed — see `LICENSE`. Use it as a base for your own web FPS.

---
<sub>Entered on [make.fun](https://make.fun/?ref=kunen-sita&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>
