const UP = 1;
const DOWN = 2;
const LEFT = 3;
const RIGHT = 4;

const STRAIGHT = 0;
const LINEAR = 1;
const SPLINE = 2;

const STRAIGHT_LEAD = 10;
const LINEAR_LEAD = 15;
const SPLINE_PULL = 0.25;

const SAMPLE_UNITS = 6;
const MIN_SAMPLES = 8;
const MAX_SAMPLES = 160;

const SLOTS = 8;
const INPUTS = 12;
const SAME = 1e-6;
const FLATTEST = 0.5;

const tracks = new WeakMap();
const loose = [];
const asked = new Float64Array(INPUTS);

function nudge(x, y, dir, by) {
  if (dir === LEFT) return [x - by, y];
  if (dir === RIGHT) return [x + by, y];
  if (dir === UP) return [x, y - by];
  if (dir === DOWN) return [x, y + by];
  return [x, y];
}

function corners(mode, a, b, sd, ed) {
  const lead = mode === LINEAR ? LINEAR_LEAD : STRAIGHT_LEAD;
  const out = nudge(a[0], a[1], sd, lead);
  const into = nudge(b[0], b[1], ed, lead);
  if (mode === LINEAR) return [a[0], a[1], out[0], out[1], into[0], into[1], b[0], b[1]];
  const middle = (out[0] + into[0]) / 2;
  return [a[0], a[1], out[0], out[1], middle, out[1], middle, into[1], into[0], into[1], b[0], b[1]];
}

function curve(a, b, sd, ed, sc, ec) {
  const reach = Math.hypot(b[0] - a[0], b[1] - a[1]) * SPLINE_PULL;
  const c1 = sc ? [a[0] + (sc[0] || 0), a[1] + (sc[1] || 0)] : nudge(a[0], a[1], sd, reach);
  const c2 = ec ? [b[0] + (ec[0] || 0), b[1] + (ec[1] || 0)] : nudge(b[0], b[1], ed, reach);
  const rough = (Math.hypot(c1[0] - a[0], c1[1] - a[1]) + Math.hypot(c2[0] - c1[0], c2[1] - c1[1])
    + Math.hypot(b[0] - c2[0], b[1] - c2[1]) + Math.hypot(b[0] - a[0], b[1] - a[1])) / 2;
  const steps = Math.max(MIN_SAMPLES, Math.min(MAX_SAMPLES, Math.ceil(rough / SAMPLE_UNITS)));
  const flat = new Array((steps + 1) * 2);
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const u = 1 - t;
    const w0 = u * u * u;
    const w1 = 3 * u * u * t;
    const w2 = 3 * u * t * t;
    const w3 = t * t * t;
    flat[i * 2] = w0 * a[0] + w1 * c1[0] + w2 * c2[0] + w3 * b[0];
    flat[i * 2 + 1] = w0 * a[1] + w1 * c1[1] + w2 * c2[1] + w3 * b[1];
  }
  return flat;
}

function build(flat) {
  const xs = [];
  const ys = [];
  for (let i = 0; i < flat.length; i += 2) {
    const x = flat[i];
    const y = flat[i + 1];
    const last = xs.length - 1;
    if (last >= 0 && Math.abs(xs[last] - x) < SAME && Math.abs(ys[last] - y) < SAME) continue;
    xs.push(x);
    ys.push(y);
  }
  const n = xs.length;
  const at = new Float64Array(n);
  for (let i = 1; i < n; i += 1) at[i] = at[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]);
  return {
    n,
    xs: Float64Array.from(xs),
    ys: Float64Array.from(ys),
    at,
    length: n ? at[n - 1] : 0,
    line: null,
    mid: null,
    memo: new Map(),
  };
}

function fill(mode, a, b, sd, ed, sc, ec) {
  asked[0] = mode;
  asked[1] = a[0];
  asked[2] = a[1];
  asked[3] = b[0];
  asked[4] = b[1];
  asked[5] = sd;
  asked[6] = ed;
  const curved = mode !== STRAIGHT && mode !== LINEAR;
  asked[7] = curved && sc ? sc[0] || 0 : 0;
  asked[8] = curved && sc ? sc[1] || 0 : 0;
  asked[9] = curved && ec ? ec[0] || 0 : 0;
  asked[10] = curved && ec ? ec[1] || 0 : 0;
  asked[11] = curved ? (sc ? 1 : 0) + (ec ? 2 : 0) : 0;
}

function matches(key) {
  for (let i = 0; i < INPUTS; i += 1) if (key[i] !== asked[i]) return false;
  return true;
}

export function trackFor(owner, mode, a, b, sd, ed, sc, ec) {
  fill(mode, a, b, sd, ed, sc, ec);
  let list = owner && typeof owner === "object" ? tracks.get(owner) : loose;
  if (!list) {
    list = [];
    tracks.set(owner, list);
  }
  for (let i = 0; i < list.length; i += 1) {
    if (!matches(list[i].key)) continue;
    const hit = list[i];
    if (i) {
      list.splice(i, 1);
      list.unshift(hit);
    }
    return hit.track;
  }
  const flat = mode === STRAIGHT || mode === LINEAR
    ? corners(mode, a, b, sd, ed)
    : curve(a, b, sd, ed, sc, ec);
  const track = build(flat);
  list.unshift({ key: Float64Array.from(asked), track });
  if (list.length > SLOTS) list.length = SLOTS;
  return track;
}

export function trackOf(flat) {
  return build(flat);
}

export function midOf(track) {
  if (track.mid) return track.mid;
  const at = pointAt(track, track.length / 2);
  track.mid = { pos: [at.x, at.y], angle: Math.atan2(at.dy, at.dx) };
  return track.mid;
}

export function pointsOf(track) {
  const points = [];
  for (let i = 0; i < track.n; i += 1) points.push([track.xs[i], track.ys[i]]);
  return points;
}

export function lineOf(track) {
  if (track.line) return track.line;
  const path = new Path2D();
  path.moveTo(track.xs[0], track.ys[0]);
  for (let i = 1; i < track.n; i += 1) path.lineTo(track.xs[i], track.ys[i]);
  track.line = path;
  return path;
}

function segmentAt(at, n, s) {
  let low = 1;
  let high = n - 1;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (at[mid] < s) low = mid + 1;
    else high = mid;
  }
  return Math.max(1, low);
}

export function walk(track, from, step, visit, lo = -Infinity, hi = Infinity) {
  const { xs, ys, at, n, length } = track;
  if (n < 2 || !(step > 0)) return;
  const first = (edge) => (edge > from ? Math.max(0, Math.ceil((edge - from) / step - SAME)) : 0);
  const stop = hi === Infinity ? Infinity : first(hi);
  let k = first(lo);
  let i = segmentAt(at, n, from + k * step);
  for (; k < stop; k += 1) {
    const s = from + k * step;
    if (s > length + SAME) break;
    while (i < n - 1 && at[i] < s) i += 1;
    const span = at[i] - at[i - 1] || 1;
    const f = Math.max(0, Math.min(1, (s - at[i - 1]) / span));
    const dx = (xs[i] - xs[i - 1]) / span;
    const dy = (ys[i] - ys[i - 1]) / span;
    visit(xs[i - 1] + (xs[i] - xs[i - 1]) * f, ys[i - 1] + (ys[i] - ys[i - 1]) * f, dx, dy, s, k);
  }
}

export function pointAt(track, s) {
  const { xs, ys, at, n } = track;
  const i = segmentAt(at, n, s);
  const span = at[i] - at[i - 1] || 1;
  const f = Math.max(0, Math.min(1, (s - at[i - 1]) / span));
  return {
    x: xs[i - 1] + (xs[i] - xs[i - 1]) * f,
    y: ys[i - 1] + (ys[i] - ys[i - 1]) * f,
    dx: (xs[i] - xs[i - 1]) / span,
    dy: (ys[i] - ys[i - 1]) / span,
  };
}

export function offsetLine(track, by) {
  const key = `offset:${by}`;
  const known = track.memo.get(key);
  if (known) return known;
  const { xs, ys, n } = track;
  const path = new Path2D();
  for (let i = 0; i < n; i += 1) {
    const p = Math.max(0, i - 1);
    const q = Math.min(n - 1, i + 1);
    let ax = xs[i] - xs[p];
    let ay = ys[i] - ys[p];
    let bx = xs[q] - xs[i];
    let by2 = ys[q] - ys[i];
    const la = Math.hypot(ax, ay);
    const lb = Math.hypot(bx, by2);
    if (la) { ax /= la; ay /= la; } else { ax = bx / (lb || 1); ay = by2 / (lb || 1); }
    if (lb) { bx /= lb; by2 /= lb; } else { bx = ax; by2 = ay; }
    let tx = ax + bx;
    let ty = ay + by2;
    const lt = Math.hypot(tx, ty);
    if (lt < SAME) { tx = bx; ty = by2; } else { tx /= lt; ty /= lt; }
    const cos = Math.max(FLATTEST, tx * bx + ty * by2);
    const reach = by / cos;
    const x = xs[i] - ty * reach;
    const y = ys[i] + tx * reach;
    if (i) path.lineTo(x, y);
    else path.moveTo(x, y);
  }
  track.memo.set(key, path);
  return path;
}

export { SPLINE, STRAIGHT, LINEAR, LEFT, RIGHT };
