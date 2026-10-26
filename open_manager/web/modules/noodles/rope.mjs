import { trackOf } from "./track.mjs";

const UP = 1;
const DOWN = 2;
const LEFT = 3;
const RIGHT = 4;

const LEAD = 14;
const SAG = 0.14;
const SAG_MIN = 10;
const SAG_MAX = 220;
const SPACING = 22;
const MIN_POINTS = 6;
const MAX_POINTS = 40;
const GRAVITY = 1400;
const STEP = 1 / 120;
const MAX_STEPS = 8;
const MAX_GAP = 0.05;
const DAMP = 0.982;
const ITERATIONS = 10;
const CALM = 0.02;
const CALM_STEPS = 24;
const LEAP = 400;
const MOVED = 0.01;

const ropes = new WeakMap();
const DRAG = {};

function lead(point, dir, control) {
  if (control) {
    const length = Math.hypot(control[0], control[1]);
    if (length > 1e-6) return [point[0] + (control[0] / length) * LEAD, point[1] + (control[1] / length) * LEAD];
    return [point[0], point[1]];
  }
  if (dir === RIGHT) return [point[0] + LEAD, point[1]];
  if (dir === LEFT) return [point[0] - LEAD, point[1]];
  if (dir === UP) return [point[0], point[1] - LEAD];
  if (dir === DOWN) return [point[0], point[1] + LEAD];
  return [point[0], point[1]];
}

function slack(span) {
  return span + Math.min(SAG_MAX, Math.max(SAG_MIN, span * SAG));
}

function countFor(span) {
  return Math.max(MIN_POINTS, Math.min(MAX_POINTS, Math.round(slack(span) / SPACING) + 1));
}

function spanOf(rope) {
  return Math.hypot(rope.bx - rope.ax, rope.by - rope.ay);
}

function hang(rope) {
  const span = spanOf(rope);
  const drop = Math.sqrt(Math.max(0, (3 * span * (slack(span) - span)) / 8));
  const { n, x, y, px, py } = rope;
  for (let i = 0; i < n; i += 1) {
    const t = i / (n - 1);
    x[i] = rope.ax + (rope.bx - rope.ax) * t;
    y[i] = rope.ay + (rope.by - rope.ay) * t + 4 * drop * t * (1 - t);
    px[i] = x[i];
    py[i] = y[i];
  }
}

function make(n) {
  return {
    n,
    x: new Float64Array(n),
    y: new Float64Array(n),
    px: new Float64Array(n),
    py: new Float64Array(n),
    ax: 0,
    ay: 0,
    bx: 0,
    by: 0,
    last: 0,
    acc: 0,
    calm: 0,
    still: false,
    seen: 0,
    track: null,
    ends: null,
  };
}

function resample(rope, n) {
  const fresh = make(n);
  const old = rope;
  const lengths = [0];
  for (let i = 1; i < old.n; i += 1) {
    lengths.push(lengths[i - 1] + Math.hypot(old.x[i] - old.x[i - 1], old.y[i] - old.y[i - 1]));
  }
  const total = lengths[old.n - 1] || 1;
  let j = 1;
  for (let i = 0; i < n; i += 1) {
    const s = (i / (n - 1)) * total;
    while (j < old.n - 1 && lengths[j] < s) j += 1;
    const span = lengths[j] - lengths[j - 1] || 1;
    const f = Math.max(0, Math.min(1, (s - lengths[j - 1]) / span));
    const vx = old.x[j - 1] - old.px[j - 1];
    const vy = old.y[j - 1] - old.py[j - 1];
    fresh.x[i] = old.x[j - 1] + (old.x[j] - old.x[j - 1]) * f;
    fresh.y[i] = old.y[j - 1] + (old.y[j] - old.y[j - 1]) * f;
    fresh.px[i] = fresh.x[i] - vx;
    fresh.py[i] = fresh.y[i] - vy;
  }
  for (const key of ["ax", "ay", "bx", "by", "last", "acc", "seen"]) fresh[key] = old[key];
  return fresh;
}

function settle(rope) {
  const { n, x, y } = rope;
  const rest = slack(spanOf(rope)) / (n - 1);
  for (let pass = 0; pass < ITERATIONS; pass += 1) {
    for (let i = 0; i < n - 1; i += 1) {
      const dx = x[i + 1] - x[i];
      const dy = y[i + 1] - y[i];
      const length = Math.hypot(dx, dy) || 1e-6;
      const error = (length - rest) / length;
      const first = i === 0 ? 0 : 1;
      const second = i + 1 === n - 1 ? 0 : 1;
      const share = first + second;
      if (!share) continue;
      const moveX = dx * error / share;
      const moveY = dy * error / share;
      x[i] += moveX * first;
      y[i] += moveY * first;
      x[i + 1] -= moveX * second;
      y[i + 1] -= moveY * second;
    }
  }
}

function advance(rope, now) {
  const gap = rope.last ? Math.min(MAX_GAP, (now - rope.last) / 1000) : 0;
  rope.last = now;
  if (rope.still) return;
  rope.acc += gap;
  const steps = Math.min(MAX_STEPS, Math.floor(rope.acc / STEP));
  rope.acc = Math.min(STEP, rope.acc - steps * STEP);
  const { n, x, y, px, py } = rope;
  const fall = GRAVITY * STEP * STEP;
  for (let s = 0; s < steps; s += 1) {
    let moved = 0;
    for (let i = 1; i < n - 1; i += 1) {
      const vx = (x[i] - px[i]) * DAMP;
      const vy = (y[i] - py[i]) * DAMP;
      px[i] = x[i];
      py[i] = y[i];
      x[i] += vx;
      y[i] += vy + fall;
      moved = Math.max(moved, Math.abs(vx) + Math.abs(vy));
    }
    x[0] = rope.ax;
    y[0] = rope.ay;
    x[n - 1] = rope.bx;
    y[n - 1] = rope.by;
    px[0] = x[0];
    py[0] = y[0];
    px[n - 1] = x[n - 1];
    py[n - 1] = y[n - 1];
    settle(rope);
    rope.calm = moved < CALM ? rope.calm + 1 : 0;
    if (rope.calm > CALM_STEPS) {
      rope.still = true;
      break;
    }
  }
}

function slotOf(key, frame) {
  let held = ropes.get(key);
  if (!held) {
    held = { list: [], frame, next: 0 };
    ropes.set(key, held);
  }
  if (held.frame !== frame) {
    if (held.next && held.list.length > held.next) held.list.length = held.next;
    held.frame = frame;
    held.next = 0;
  }
  const index = held.next;
  held.next += 1;
  return { list: held.list, index };
}

function carry(rope, ax, ay, bx, by) {
  const leap = Math.max(Math.hypot(ax - rope.ax, ay - rope.ay), Math.hypot(bx - rope.bx, by - rope.by));
  if (leap < LEAP) return;
  const dx = (ax - rope.ax + bx - rope.bx) / 2;
  const dy = (ay - rope.ay + by - rope.by) / 2;
  for (let i = 0; i < rope.n; i += 1) {
    rope.x[i] += dx;
    rope.y[i] += dy;
    rope.px[i] += dx;
    rope.py[i] += dy;
  }
}

export function ropeTrack(owner, a, b, sd, ed, sc, ec, now, live, frame) {
  const key = owner && typeof owner === "object" ? owner : DRAG;
  const { list, index } = slotOf(key, frame);
  const [ax, ay] = lead(a, sd, sc);
  const [bx, by] = lead(b, ed, ec);
  let rope = list[index];
  const span = Math.hypot(bx - ax, by - ay);
  if (!rope) {
    rope = make(countFor(span));
    Object.assign(rope, { ax, ay, bx, by, seen: now, last: now });
    hang(rope);
    list[index] = rope;
  }
  carry(rope, ax, ay, bx, by);
  const shifted = Math.abs(rope.ax - ax) > MOVED || Math.abs(rope.ay - ay) > MOVED
    || Math.abs(rope.bx - bx) > MOVED || Math.abs(rope.by - by) > MOVED;
  rope.ax = ax;
  rope.ay = ay;
  rope.bx = bx;
  rope.by = by;
  rope.seen = now;
  const wanted = countFor(span);
  if (Math.abs(wanted - rope.n) > Math.max(2, rope.n * 0.3)) {
    rope = resample(rope, wanted);
    list[index] = rope;
    rope.still = false;
    rope.track = null;
  }
  if (shifted) {
    rope.still = false;
    rope.calm = 0;
  }
  if (!live) {
    if (shifted || !rope.track) hang(rope);
    rope.still = true;
  } else {
    advance(rope, now);
  }
  const ends = rope.ends;
  const sameEnds = ends && ends[0] === a[0] && ends[1] === a[1] && ends[2] === b[0] && ends[3] === b[1];
  if (rope.still && rope.track && sameEnds) return { track: rope.track, busy: false };
  const flat = [a[0], a[1]];
  for (let i = 0; i < rope.n; i += 1) flat.push(rope.x[i], rope.y[i]);
  flat.push(b[0], b[1]);
  rope.track = trackOf(flat);
  rope.ends = [a[0], a[1], b[0], b[1]];
  return { track: rope.track, busy: !rope.still };
}
