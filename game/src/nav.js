// nav.js — the waypoint graph bots think with. Edges are derived once at load:
// two nodes are linked when they are close and a chest-high sight line between
// them is clear, so routes follow the lanes a player would take. Pathfinding
// is plain A* over that graph; movement then walks the path's corners.

import { NODES, BOXES, losClear } from './map.js';

// A chest-high sight line passes OVER low cover (1.1 m walls, barrels) that
// still blocks walking, so an edge also has to keep the ground segment clear
// of those footprints, grown by the combatant radius (0.35) plus a whisker —
// any fatter and the growth swallows lanes that pass a wall's corner with
// room to spare, cutting whole areas out of the graph (Liang–Barsky).
function segCrossesLowCover(ax, az, bx, bz) {
  for (const b of BOXES) {
    if ((b.y0 || 0) !== 0 || b.h >= 1.2) continue;
    const minx = b.min.x - 0.37, maxx = b.max.x + 0.37, minz = b.min.z - 0.37, maxz = b.max.z + 0.37;
    const dx = bx - ax, dz = bz - az;
    const p = [-dx, dx, -dz, dz], q = [ax - minx, maxx - ax, az - minz, maxz - az];
    let t0 = 0, t1 = 1, ok = true;
    for (let i = 0; i < 4; i++) {
      if (Math.abs(p[i]) < 1e-9) { if (q[i] < 0) { ok = false; break; } }
      else {
        const t = q[i] / p[i];
        if (p[i] < 0) { if (t > t1) { ok = false; break; } if (t > t0) t0 = t; }
        else { if (t < t0) { ok = false; break; } if (t < t1) t1 = t; }
      }
    }
    if (ok && t0 <= t1) return true;
  }
  return false;
}

const edges = NODES.map(() => []);
for (let i = 0; i < NODES.length; i++) {
  for (let j = i + 1; j < NODES.length; j++) {
    const a = NODES[i], b = NODES[j];
    const d = Math.hypot(a.x - b.x, a.z - b.z);
    if (d <= 11 && losClear(a.x, 1.2, a.z, b.x, 1.2, b.z) && !segCrossesLowCover(a.x, a.z, b.x, b.z)) {
      edges[i].push({ to: j, cost: d });
      edges[j].push({ to: i, cost: d });
    }
  }
}

export function nearestNode(x, z) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < NODES.length; i++) {
    const d = (NODES[i].x - x) ** 2 + (NODES[i].z - z) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

export function nodesByTag(tag) {
  const out = [];
  for (let i = 0; i < NODES.length; i++) if (NODES[i].t === tag) out.push(i);
  return out;
}

// A* from the node nearest (x1,z1) to the node nearest (x2,z2). Returns a
// list of {x,z} waypoints ending at the exact target, or null when cut off.
export function findPath(x1, z1, x2, z2) {
  const start = nearestNode(x1, z1), goal = nearestNode(x2, z2);
  if (start === goal) return [{ x: x2, z: z2 }];
  const open = [start];
  const came = new Map(), gScore = new Map([[start, 0]]);
  const fScore = new Map([[start, Math.hypot(NODES[start].x - x2, NODES[start].z - z2)]]);
  const closed = new Set();
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if ((fScore.get(open[i]) ?? Infinity) < (fScore.get(open[bi]) ?? Infinity)) bi = i;
    const cur = open.splice(bi, 1)[0];
    if (cur === goal) {
      const path = [];
      let n = cur;
      while (n !== undefined) { path.push({ x: NODES[n].x, z: NODES[n].z }); n = came.get(n); }
      path.reverse();
      path.push({ x: x2, z: z2 });
      return path;
    }
    closed.add(cur);
    for (const e of edges[cur]) {
      if (closed.has(e.to)) continue;
      const g = (gScore.get(cur) ?? Infinity) + e.cost;
      if (g < (gScore.get(e.to) ?? Infinity)) {
        came.set(e.to, cur); gScore.set(e.to, g);
        fScore.set(e.to, g + Math.hypot(NODES[e.to].x - x2, NODES[e.to].z - z2));
        if (!open.includes(e.to)) open.push(e.to);
      }
    }
  }
  return null;
}
