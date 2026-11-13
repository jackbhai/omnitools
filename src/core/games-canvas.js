/**
 * Canvas game state machines for the mini-games arcade — no DOM, no React.
 *
 * Every reflex/arcade game is a plain state object plus a step function
 * on a fixed 340x340 logical field (the screens scale it with DPR), so a
 * script can drive spawn -> update -> collide -> score -> game-over
 * headlessly, exactly like core/games.js does for Snake. Renderers read
 * state; they never own rules.
 */
import { clamp, ri } from './games2.js';

export const GW = 340, GH = 340;
const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/* ------------------------------------------------------------------ flappy */
export function flNew(rng = Math.random) {
  return { y: 170, vy: 0, pipes: [{ x: 372, gap: 110 + rng() * 130 }], spawnT: 1.45, score: 0, alive: true, rng };
}
export function flStep(st, flap, dt) {
  const ev = { scored: false, died: false };
  if (!st.alive) return ev;
  if (flap) st.vy = -445;
  st.vy += 1500 * dt;
  st.y += st.vy * dt;
  st.spawnT -= dt;
  if (st.spawnT <= 0) { st.pipes.push({ x: 356, gap: 100 + st.rng() * 150 }); st.spawnT = 1.45; }
  for (const p of st.pipes) {
    p.x -= 138 * dt;
    if (!p.passed && p.x + 46 < 59) { p.passed = true; st.score++; ev.scored = true; }
  }
  st.pipes = st.pipes.filter((p) => p.x > -52);
  const bird = { x: 59, y: st.y - 11, w: 22, h: 22 };
  if (st.y > GH - 11 || st.y < 11) { st.alive = false; ev.died = true; return ev; }
  for (const p of st.pipes) {
    if (p.x < 81 && p.x + 46 > bird.x) {
      if (st.y - 11 < p.gap - 52 || st.y + 11 > p.gap + 52) { st.alive = false; ev.died = true; }
    }
  }
  return ev;
}

/* -------------------------------------------------------------------- dino */
export function dnNew(rng = Math.random) {
  return { y: 0, vy: 0, obs: [], spawnT: 0.9, speed: 215, dist: 0, score: 0, alive: true, rng };
}
export function dnStep(st, jump, dt) {
  const ev = { died: false };
  if (!st.alive) return ev;
  if (jump && st.y === 0) st.vy = 660;
  if (st.y > 0 || st.vy > 0) {
    st.vy -= 1750 * dt;
    st.y = Math.max(0, st.y + st.vy * dt);
    if (st.y === 0) st.vy = 0;
  }
  st.speed += 3.2 * dt;
  st.dist += st.speed * dt;
  st.score = Math.floor(st.dist / 12);
  st.spawnT -= dt;
  if (st.spawnT <= 0) {
    st.obs.push({ x: 356, w: 15 + st.rng() * 16, h: 22 + st.rng() * 24 });
    st.spawnT = 0.75 + st.rng() * 0.9;
  }
  for (const o of st.obs) o.x -= st.speed * dt;
  st.obs = st.obs.filter((o) => o.x > -40);
  const dino = { x: 42, y: GH - 46 - st.y, w: 32, h: 34 };
  for (const o of st.obs) {
    if (hit(dino, { x: o.x, y: GH - 12 - o.h, w: o.w, h: o.h })) { st.alive = false; ev.died = true; }
  }
  return ev;
}
export const dnGround = GH - 46;

/* ------------------------------------------------------- vertical hopper */
export function hpNew(rng = Math.random) {
  const plats = [];
  for (let i = 0; i < 9; i++) plats.push({ x: rng() * 270, y: 320 - i * 52, w: 64 });
  plats[0] = { x: 130, y: 322, w: 76 };
  return { x: 152, y: 288, vx: 0, vy: 0, plats, camY: 0, best: 0, score: 0, alive: true, rng };
}
export function hpStep(st, dir, dt) {
  const ev = { died: false };
  if (!st.alive) return ev;
  st.vx = dir * 205;
  st.x += st.vx * dt;
  if (st.x < -16) st.x += GW + 32;
  if (st.x > GW + 16) st.x -= GW + 32;
  st.vy += 1250 * dt;
  const prevFeet = st.y + 14;
  st.y += st.vy * dt;
  if (st.vy > 0) {
    for (const p of st.plats) {
      if (st.x + 13 > p.x && st.x - 13 < p.x + p.w && prevFeet <= p.y + 1 && st.y + 14 >= p.y) {
        st.vy = -575; st.y = p.y - 14;
        break;
      }
    }
  }
  if (st.y - 40 < st.camY) st.camY = st.y - 40;
  st.best = Math.max(st.best, -st.camY);
  st.score = Math.floor(st.best / 10);
  const top = st.camY - 60;
  st.plats = st.plats.filter((p) => p.y < st.camY + GH + 30);
  let highest = st.plats.length ? Math.min(...st.plats.map((p) => p.y)) : st.camY - 40;
  let guard = 0;
  while (highest > top && guard++ < 40) {
    highest -= 46 + st.rng() * 26;
    st.plats.push({ x: st.rng() * 272, y: highest, w: 62 });
  }
  if (st.y - 14 > st.camY + GH) { st.alive = false; ev.died = true; }
  return ev;
}

/* --------------------------------------------------------------- car dodge */
export function cdNew(rng = Math.random) {
  return { px: 155, tx: 155, foes: [], spawnT: 0.6, speed: 175, dist: 0, score: 0, alive: true, rng };
}
export function cdStep(st, dt) {
  const ev = { died: false };
  if (!st.alive) return ev;
  st.px += clamp(st.tx - st.px, -340 * dt, 340 * dt);
  st.speed += 2.4 * dt;
  st.dist += st.speed * dt;
  st.score = Math.floor(st.dist / 14);
  st.spawnT -= dt;
  if (st.spawnT <= 0) {
    st.foes.push({ x: 18 + st.rng() * 262, y: -58, sp: 26 + st.rng() * 42 });
    st.spawnT = Math.max(0.5, 1.05 - st.speed / 620);
  }
  for (const f of st.foes) f.y += (st.speed * 0.62 + f.sp) * dt;
  st.foes = st.foes.filter((f) => f.y < GH + 62);
  const car = { x: st.px, y: GH - 66, w: 30, h: 50 };
  for (const f of st.foes) {
    if (hit({ x: car.x + 3, y: car.y + 3, w: 24, h: 44 }, { x: f.x + 3, y: f.y + 3, w: 24, h: 44 })) { st.alive = false; ev.died = true; }
  }
  return ev;
}

/* -------------------------------------------------------------- helicopter */
export function heNew(rng = Math.random) {
  return { y: 168, vy: 0, pillars: [{ x: 372, gap: 105 + rng() * 130 }], spawnT: 1.5, score: 0, alive: true, rng };
}
export function heStep(st, hold, dt) {
  const ev = { scored: false, died: false };
  if (!st.alive) return ev;
  st.vy += (hold ? -2050 : 1420) * dt;
  st.vy = clamp(st.vy, -335, 335);
  st.y += st.vy * dt;
  st.spawnT -= dt;
  if (st.spawnT <= 0) { st.pillars.push({ x: 356, gap: 98 + st.rng() * 146 }); st.spawnT = 1.5; }
  for (const p of st.pillars) {
    p.x -= 132 * dt;
    if (!p.passed && p.x + 40 < 66) { p.passed = true; st.score++; ev.scored = true; }
  }
  st.pillars = st.pillars.filter((p) => p.x > -46);
  if (st.y > GH - 10 || st.y < 10) { st.alive = false; ev.died = true; return ev; }
  for (const p of st.pillars) {
    if (p.x < 84 && p.x + 40 > 48 && (st.y - 10 < p.gap - 56 || st.y + 10 > p.gap + 56)) { st.alive = false; ev.died = true; }
  }
  return ev;
}

/* -------------------------------------------------------------- road cross */
export const RC_COLS = 10, RC_ROWS = 10, RC_CELL = 34;
export function rcNew(level = 1, rng = Math.random) {
  const lanes = [];
  for (let r = 1; r <= 8; r++) {
    if (r === 5) continue; /* median */
    const dir = r % 2 ? 1 : -1;
    const speed = (34 + rng() * 34 + level * 7) * dir;
    const cars = [];
    let x = rng() * 120;
    const n = 2 + ri(rng, 2);
    for (let i = 0; i < n; i++) { cars.push({ x, len: 1.5 + rng() * 0.9 }); x += 130 + rng() * 90; }
    lanes.push({ row: r, speed, cars });
  }
  return { px: 4, py: 9, lanes, level, score: (level - 1) * 100, alive: true, won: false, rng };
}
export function rcHop(st, dx, dy) {
  if (!st.alive || st.won) return st;
  st.px = clamp(st.px + dx, 0, RC_COLS - 1);
  st.py = clamp(st.py + dy, 0, RC_ROWS - 1);
  if (st.py === 0) st.won = true;
  return st;
}
export function rcStep(st, dt) {
  const ev = { died: false };
  if (!st.alive || st.won) return ev;
  for (const lane of st.lanes) {
    for (const car of lane.cars) {
      car.x += lane.speed * dt;
      const wpx = car.len * RC_CELL;
      if (lane.speed > 0 && car.x > GW) car.x = -wpx;
      if (lane.speed < 0 && car.x + wpx < 0) car.x = GW;
    }
    if (lane.row === st.py) {
      const px = st.px * RC_CELL;
      for (const car of lane.cars) {
        if (px + 26 > car.x + 3 && px + 8 < car.x + car.len * RC_CELL - 3) { st.alive = false; ev.died = true; }
      }
    }
  }
  return ev;
}

/* ------------------------------------------------------------ gravity flip */
export function gfNew(rng = Math.random) {
  return { y: GH - 52, vy: 0, ceil: false, spikes: [], spawnT: 1, speed: 208, dist: 0, score: 0, alive: true, rng };
}
export function gfFlip(st) { if (st.alive) st.ceil = !st.ceil; return st; }
export function gfStep(st, dt) {
  const ev = { died: false };
  if (!st.alive) return ev;
  const target = st.ceil ? 52 : GH - 52;
  st.vy = clamp((target - st.y) * 14, -560, 560);
  st.y += st.vy * dt;
  if (Math.abs(target - st.y) < 3) st.y = target;
  st.speed += 2 * dt;
  st.dist += st.speed * dt;
  st.score = Math.floor(st.dist / 13);
  st.spawnT -= dt;
  if (st.spawnT <= 0) {
    st.spikes.push({ x: 356, ceil: st.rng() < 0.5 });
    st.spawnT = 0.85 + st.rng() * 0.8;
  }
  for (const s of st.spikes) s.x -= st.speed * dt;
  st.spikes = st.spikes.filter((s) => s.x > -30);
  const settled = Math.abs(st.y - target) < 4;
  for (const s of st.spikes) {
    if (s.x < 78 && s.x + 22 > 56 && settled && s.ceil === st.ceil) { st.alive = false; ev.died = true; }
  }
  return ev;
}

/* -------------------------------------------------------------- stack tower */
export function stNew() {
  return { layers: [{ x: 95, w: 150 }], cur: { x: 0, w: 150, dir: 1 }, speed: 128, score: 0, alive: true, perfect: 0 };
}
export function stStep(st, dt) {
  if (!st.alive) return st;
  st.cur.x += st.cur.dir * st.speed * dt;
  if (st.cur.x > GW - 6) { st.cur.x = GW - 6; st.cur.dir = -1; }
  if (st.cur.x < -st.cur.w + 6) { st.cur.x = -st.cur.w + 6; st.cur.dir = 1; }
  return st;
}
export function stDrop(st) {
  if (!st.alive) return { ok: false, perfect: false };
  const below = st.layers[st.layers.length - 1];
  const x1 = Math.max(st.cur.x, below.x);
  const x2 = Math.min(st.cur.x + st.cur.w, below.x + below.w);
  if (x2 <= x1) { st.alive = false; return { ok: false, perfect: false }; }
  const perfect = Math.abs(st.cur.x - below.x) < 3;
  const nx = perfect ? below.x : x1;
  const nw = perfect ? below.w : x2 - x1;
  st.layers.push({ x: nx, w: nw });
  st.score = st.layers.length - 1;
  st.perfect = perfect ? st.perfect + 1 : 0;
  st.speed = Math.min(300, st.speed * 1.055);
  st.cur = { x: st.cur.dir > 0 ? -nw + 6 : GW - 6, w: nw, dir: st.cur.dir };
  return { ok: true, perfect };
}

/* ------------------------------------------------------------ catch basket */
export function cbNew(rng = Math.random) {
  return { bx: 155, tx: 155, items: [], spawnT: 0.4, lives: 3, score: 0, over: false, rng };
}
export function cbStep(st, dt) {
  const ev = { caught: false, hurt: false };
  if (st.over) return ev;
  st.bx += clamp(st.tx - st.bx, -430 * dt, 430 * dt);
  st.spawnT -= dt;
  if (st.spawnT <= 0) {
    st.items.push({ x: 16 + st.rng() * 308, y: -14, vy: 128 + st.rng() * 90, bomb: st.rng() < 0.2 });
    st.spawnT = 0.55 + st.rng() * 0.5;
  }
  const kept = [];
  for (const it of st.items) {
    it.y += it.vy * dt;
    if (it.y >= GH - 34 && it.y < GH - 8) {
      if (Math.abs(it.x - (st.bx + 15)) < 40) {
        if (it.bomb) { st.lives--; ev.hurt = true; } else { st.score += 10; ev.caught = true; }
        continue;
      }
    }
    if (it.y >= GH - 6) {
      if (!it.bomb) { st.lives--; ev.hurt = true; }
      continue;
    }
    kept.push(it);
  }
  st.items = kept;
  if (st.lives <= 0) st.over = true;
  return ev;
}

/* --------------------------------------------------------------- bubbles */
export function bbNew(rng = Math.random) {
  return { bubbles: [], spawnT: 0, score: 0, time: 60, over: false, rng };
}
export function bbStep(st, dt) {
  if (st.over) return st;
  st.time -= dt;
  if (st.time <= 0) { st.time = 0; st.over = true; return st; }
  st.spawnT -= dt;
  if (st.spawnT <= 0 && st.bubbles.length < 9) {
    const r = 13 + st.rng() * 17;
    st.bubbles.push({ x: r + st.rng() * (GW - r * 2), y: GH + r, r, vy: 42 + st.rng() * 55, ph: st.rng() * 6.28 });
    st.spawnT = 0.34;
  }
  for (const b of st.bubbles) { b.y -= b.vy * dt; b.ph += dt * 2; }
  st.bubbles = st.bubbles.filter((b) => b.y > -b.r - 2);
  return st;
}
export function bbPop(st, x, y) {
  for (let i = st.bubbles.length - 1; i >= 0; i--) {
    const b = st.bubbles[i];
    if ((x - b.x) ** 2 + (y - b.y) ** 2 <= b.r * b.r) {
      st.bubbles.splice(i, 1);
      const pts = Math.max(2, Math.round(340 / b.r));
      st.score += pts;
      return pts;
    }
  }
  return 0;
}

/* ------------------------------------------------------------------- fruit */
export function frNew(rng = Math.random) {
  return { fruits: [], spawnT: 0.5, score: 0, lives: 3, over: false, rng };
}
export function frStep(st, dt) {
  const ev = { missed: false };
  if (st.over) return ev;
  st.spawnT -= dt;
  if (st.spawnT <= 0) {
    const fromLeft = st.rng() < 0.5;
    st.fruits.push({
      x: fromLeft ? 30 + st.rng() * 60 : 250 + st.rng() * 60, y: GH + 16,
      vx: (fromLeft ? 55 : -55) + (st.rng() - 0.5) * 40, vy: -(615 + st.rng() * 150),
      r: 15, bomb: st.rng() < 0.16, sliced: false, rot: st.rng() * 6.28,
    });
    st.spawnT = 0.75 + st.rng() * 0.6;
  }
  const kept = [];
  for (const f of st.fruits) {
    f.vy += 905 * dt;
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    f.rot += dt * 2.4;
    if (f.y > GH + 30) {
      if (!f.sliced && !f.bomb) { st.lives--; ev.missed = true; }
      continue;
    }
    kept.push(f);
  }
  st.fruits = kept;
  if (st.lives <= 0) st.over = true;
  return ev;
}
function segCircle(x1, y1, x2, y2, cx, cy, r) {
  const dx = x2 - x1, dy = y2 - y1;
  const l2 = dx * dx + dy * dy || 1;
  let t = ((cx - x1) * dx + (cy - y1) * dy) / l2;
  t = clamp(t, 0, 1);
  const px = x1 + t * dx, py = y1 + t * dy;
  return (cx - px) ** 2 + (cy - py) ** 2 <= r * r;
}
export function frSlice(st, trail) {
  let hits = 0;
  for (const f of st.fruits) {
    if (f.sliced) continue;
    for (let i = 1; i < trail.length; i++) {
      if (segCircle(trail[i - 1].x, trail[i - 1].y, trail[i].x, trail[i].y, f.x, f.y, f.r + 3)) {
        f.sliced = true;
        if (f.bomb) { st.over = true; st.bombed = true; return hits; }
        st.score += 10;
        hits++;
        break;
      }
    }
  }
  return hits;
}

/* -------------------------------------------------------------- space dodge */
export function spNew(rng = Math.random) {
  return { px: 170, tx: 170, rocks: [], spawnT: 0.5, t: 0, score: 0, alive: true, rng };
}
export function spStep(st, dt) {
  const ev = { died: false };
  if (!st.alive) return ev;
  st.t += dt;
  st.score = Math.floor(st.t * 10);
  st.px += clamp(st.tx - st.px, -390 * dt, 390 * dt);
  st.spawnT -= dt;
  if (st.spawnT <= 0) {
    st.rocks.push({ x: 14 + st.rng() * 312, y: -18, r: 9 + st.rng() * 13, vy: 105 + st.rng() * 95 + st.t * 2.2, vx: (st.rng() - 0.5) * 34 });
    st.spawnT = Math.max(0.3, 0.78 - st.t * 0.008);
  }
  for (const r of st.rocks) { r.y += r.vy * dt; r.x += r.vx * dt; }
  st.rocks = st.rocks.filter((r) => r.y < GH + 24);
  for (const r of st.rocks) {
    const d2 = (r.x - st.px) ** 2 + (r.y - (GH - 30)) ** 2;
    if (d2 < (r.r + 11) ** 2) { st.alive = false; ev.died = true; }
  }
  return ev;
}

/* ---------------------------------------------------------------- breakout */
export function bkNew(fast = 1) {
  const bricks = [];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 8; c++) bricks.push(1);
  return {
    ball: { x: 170, y: 250, vx: 128 * fast, vy: -168 * fast },
    paddle: { x: 138, w: 66 }, bricks, lives: 3, score: 0, over: false, cleared: false, fast,
  };
}
export function bkStep(st, dt) {
  const ev = { brick: false, lost: false, bounced: false };
  if (st.over || st.cleared) return ev;
  const b = st.ball;
  b.x += b.vx * dt; b.y += b.vy * dt;
  if (b.x < 8) { b.x = 8; b.vx = Math.abs(b.vx); }
  if (b.x > GW - 8) { b.x = GW - 8; b.vx = -Math.abs(b.vx); }
  if (b.y < 8) { b.y = 8; b.vy = Math.abs(b.vy); }
  if (b.y > GH + 12) {
    st.lives--;
    ev.lost = true;
    if (st.lives <= 0) { st.over = true; return ev; }
    st.ball = { x: st.paddle.x + st.paddle.w / 2, y: 250, vx: 128 * st.fast, vy: -168 * st.fast };
    return ev;
  }
  if (b.vy > 0 && b.y + 8 >= GH - 26 && b.y < GH - 12 && b.x >= st.paddle.x - 8 && b.x <= st.paddle.x + st.paddle.w + 8) {
    const off = (b.x - (st.paddle.x + st.paddle.w / 2)) / (st.paddle.w / 2);
    const sp = Math.hypot(b.vx, b.vy);
    b.vx = clamp(off, -1, 1) * sp * 0.86;
    b.vy = -Math.sqrt(Math.max(60 ** 2, sp * sp - b.vx * b.vx));
    b.y = GH - 34;
    ev.bounced = true;
  }
  const bw = (GW - 16) / 8, bh = 15;
  for (let i = 0; i < st.bricks.length; i++) {
    if (!st.bricks[i]) continue;
    const r = Math.floor(i / 8), c = i % 8;
    const bx = 8 + c * bw, by = 42 + r * (bh + 5);
    if (b.x + 7 > bx && b.x - 7 < bx + bw - 3 && b.y + 7 > by && b.y - 7 < by + bh) {
      st.bricks[i] = 0;
      st.score += 10;
      b.vy = -b.vy;
      ev.brick = true;
      break;
    }
  }
  if (st.bricks.every((v) => !v)) st.cleared = true;
  return ev;
}

/* -------------------------------------------------------------------- pong */
export function pgNew() {
  return { ball: { x: 170, y: 170, vx: 165, vy: 92 }, py: 145, ay: 145, ps: 0, as: 0, over: false, winner: 0 };
}
export function pgStep(st, dt) {
  const ev = { point: 0 };
  if (st.over) return ev;
  const b = st.ball;
  b.x += b.vx * dt; b.y += b.vy * dt;
  if (b.y < 8) { b.y = 8; b.vy = Math.abs(b.vy); }
  if (b.y > GH - 8) { b.y = GH - 8; b.vy = -Math.abs(b.vy); }
  /* AI paddle: tracks with capped speed, so fast balls beat it. */
  const aiSpeed = 178;
  const want = b.vx > 0 ? b.y : 170 + (170 - st.ay) * 0.02;
  st.ay += clamp(want - st.ay, -aiSpeed * dt, aiSpeed * dt);
  st.ay = clamp(st.ay, 30, GH - 30);
  if (b.vx < 0 && b.x - 8 <= 26 && b.x > 12 && Math.abs(b.y - st.py) < 40) {
    b.vx = Math.abs(b.vx) * 1.03;
    b.vy += (b.y - st.py) * 2.6;
    b.x = 26;
  }
  if (b.vx > 0 && b.x + 8 >= GW - 26 && b.x < GW - 12 && Math.abs(b.y - st.ay) < 40) {
    b.vx = -Math.abs(b.vx) * 1.03;
    b.vy += (b.y - st.ay) * 2.6;
    b.x = GW - 26;
  }
  if (b.x < -14) { st.as++; ev.point = 2; }
  if (b.x > GW + 14) { st.ps++; ev.point = 1; }
  if (ev.point) {
    if (st.ps >= 5 || st.as >= 5) { st.over = true; st.winner = st.ps >= 5 ? 1 : 2; }
    else st.ball = { x: 170, y: 170, vx: (ev.point === 1 ? -165 : 165), vy: 92 * (Math.random() < 0.5 ? 1 : -1) };
  }
  return ev;
}

/* --------------------------------------------------------------- wall ball */
export function wbNew() {
  return { ball: { x: 170, y: 200, vx: 118, vy: -158 }, paddle: { x: 132, w: 76 }, hits: 0, lives: 3, score: 0, over: false };
}
export function wbStep(st, dt) {
  const ev = { hit: false, lost: false };
  if (st.over) return ev;
  const b = st.ball;
  b.x += b.vx * dt; b.y += b.vy * dt;
  if (b.x < 8) { b.x = 8; b.vx = Math.abs(b.vx); }
  if (b.x > GW - 8) { b.x = GW - 8; b.vx = -Math.abs(b.vx); }
  if (b.y < 8) { b.y = 8; b.vy = Math.abs(b.vy); }
  if (b.vy > 0 && b.y + 8 >= GH - 24 && b.y < GH - 8 && b.x >= st.paddle.x - 8 && b.x <= st.paddle.x + st.paddle.w + 8) {
    const off = (b.x - (st.paddle.x + st.paddle.w / 2)) / (st.paddle.w / 2);
    const sp = Math.min(330, Math.hypot(b.vx, b.vy) * 1.025);
    b.vx = clamp(off, -1, 1) * sp * 0.85;
    b.vy = -Math.sqrt(Math.max(70 ** 2, sp * sp - b.vx * b.vx));
    b.y = GH - 32;
    st.hits++;
    st.score = st.hits * 10;
    ev.hit = true;
  }
  if (b.y > GH + 12) {
    st.lives--;
    ev.lost = true;
    if (st.lives <= 0) { st.over = true; return ev; }
    st.ball = { x: st.paddle.x + st.paddle.w / 2, y: 200, vx: 118, vy: -158 };
  }
  return ev;
}

/* -------------------------------------------------------------- pinball-lite */
export const PB_BUMPERS = [{ x: 92, y: 104, r: 17 }, { x: 248, y: 104, r: 17 }, { x: 170, y: 168, r: 15 }];
export function pbNew() {
  return {
    ball: { x: 170, y: 60, vx: 40, vy: 0 },
    flip: { a: 0.55, target: 0.55 }, balls: 3, score: 0, over: false,
    bumpHit: -1,
  };
}
export function pbStep(st, flipHeld, dt) {
  const ev = { bumper: -1, drained: false };
  if (st.over) return ev;
  st.flip.target = flipHeld ? -0.6 : 0.55;
  const prevA = st.flip.a;
  st.flip.a += clamp(st.flip.target - st.flip.a, -13 * dt, 13 * dt);
  const swinging = st.flip.a < prevA - 0.001;
  const b = st.ball;
  b.vy += 715 * dt;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  if (b.x < 9) { b.x = 9; b.vx = Math.abs(b.vx) * 0.86; }
  if (b.x > GW - 9) { b.x = GW - 9; b.vx = -Math.abs(b.vx) * 0.86; }
  if (b.y < 9) { b.y = 9; b.vy = Math.abs(b.vy) * 0.86; }
  PB_BUMPERS.forEach((bp, i) => {
    const dx = b.x - bp.x, dy = b.y - bp.y;
    const d = Math.hypot(dx, dy);
    if (d < bp.r + 8 && d > 0.01) {
      const nx = dx / d, ny = dy / d;
      const dot = b.vx * nx + b.vy * ny;
      if (dot < 0) {
        b.vx -= 2 * dot * nx; b.vy -= 2 * dot * ny;
        const sp = Math.max(215, Math.hypot(b.vx, b.vy));
        b.vx = nx * sp; b.vy = ny * sp;
        b.x = bp.x + nx * (bp.r + 8.5); b.y = bp.y + ny * (bp.r + 8.5);
        st.score += 50;
        ev.bumper = i;
      }
    }
  });
  /* Flipper: segment from the pivot, ball bounces off it; a swinging
     flipper launches the ball upward. */
  const px = 170, py = 316;
  const fx = px + Math.cos(st.flip.a) * 56, fy = py + Math.sin(st.flip.a) * 56;
  const dx = fx - px, dy = fy - py;
  const l2 = dx * dx + dy * dy;
  let t = ((b.x - px) * dx + (b.y - py) * dy) / l2;
  t = clamp(t, 0, 1);
  const cx = px + t * dx, cy = py + t * dy;
  const ddx = b.x - cx, ddy = b.y - cy;
  const dist = Math.hypot(ddx, ddy);
  if (dist < 11 && b.vy > -40) {
    if (swinging) {
      b.vy = -545 - 130 * t;
      b.vx += (t - 0.4) * 190;
      b.y = cy - 12;
      ev.launched = true;
    } else if (ddy < 0) {
      b.vy = -Math.abs(b.vy) * 0.42;
      b.y = cy - 11;
    }
  }
  if (b.y > GH + 14) {
    st.balls--;
    ev.drained = true;
    if (st.balls <= 0) { st.over = true; return ev; }
    st.ball = { x: 170, y: 60, vx: 40, vy: 0 };
  }
  return ev;
}
