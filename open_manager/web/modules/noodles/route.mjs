import { trackOf } from "./track.mjs";

const UP = 1;
const DOWN = 2;
const LEFT = 3;
const RIGHT = 4;

const MIN_PITCH = 8;
const PAD = 10;
const STUB = 14;
const CHAMFER = 7;
const EXIT_CELLS = 6;
const MARGIN_UNITS = 160;
const WINDOW_UNITS = 300;
const WIDE_UNITS = 1000;
const MAX_CELLS = 1200000;
const FULL_LIMIT = 250000;
const BEND = 4;
const TAKEN = 40;
const CROSS = 2.5;
const NEAR = 0.3;
const PULL = 0.45;
const PULL_REACH = 3;
const GREED = 0.85;
const SETTLE_MS = 90;
const SLICE_MS = 7;
const FORGET_MS = 60000;
const MATCH = 2;

const STEPS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

const state = {
  graph: null,
  frame: 0,
  version: 0,
  tags: new WeakMap(),
  nextTag: 1,
  requests: new Map(),
  routes: new Map(),
  spacing: 0,
  timer: 0,
  job: null,
  redraw: null,
};

const scratch = { size: 0, g: null, from: null, seen: null, done: null, search: 0, heapS: [], heapF: [] };

function tagOf(owner) {
  let tag = state.tags.get(owner);
  if (!tag) {
    tag = state.nextTag;
    state.nextTag += 1;
    state.tags.set(owner, tag);
  }
  return tag;
}

function boundsOf(node) {
  const rect = node?.boundingRect;
  if (rect && rect.length >= 4 && Number.isFinite(rect[0])) return [rect[0], rect[1], rect[2], rect[3]];
  if (!node?.pos || !node?.size) return null;
  const title = window.LiteGraph?.NODE_TITLE_HEIGHT ?? 30;
  return [node.pos[0], node.pos[1] - title, node.size[0], node.size[1] + title];
}

function nodesOf(graph) {
  return graph?._nodes ?? graph?.nodes ?? [];
}

function versionOf(graph) {
  let hash = 17;
  for (const node of nodesOf(graph)) {
    const rect = boundsOf(node);
    if (!rect) continue;
    for (const value of rect) hash = (Math.imul(hash, 31) + Math.round(value)) | 0;
  }
  return hash;
}

function outward(dir, control) {
  if (control) {
    const length = Math.hypot(control[0], control[1]);
    if (length > 1e-6) return [control[0] / length, control[1] / length];
  }
  if (dir === RIGHT) return [1, 0];
  if (dir === LEFT) return [-1, 0];
  if (dir === UP) return [0, -1];
  if (dir === DOWN) return [0, 1];
  return null;
}

function headingOf(vector, fallback) {
  if (!vector) return fallback;
  if (Math.abs(vector[0]) >= Math.abs(vector[1])) return vector[0] >= 0 ? 0 : 2;
  return vector[1] >= 0 ? 1 : 3;
}

function stubOf(point, vector) {
  return vector ? [point[0] + vector[0] * STUB, point[1] + vector[1] * STUB] : [point[0], point[1]];
}

function close(p, q) {
  return Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) < MATCH;
}

function find(list, a, b) {
  if (!list) return null;
  for (const entry of list) if (close(entry.a, a) && close(entry.b, b)) return entry;
  return null;
}

function schedule() {
  if (state.job) state.job.stale = true;
  clearTimeout(state.timer);
  state.timer = setTimeout(begin, SETTLE_MS);
}

export function setCircuitRedraw(fn) {
  state.redraw = fn;
}

export function circuitFrame(graph, spacing) {
  state.frame += 1;
  if (graph !== state.graph) {
    state.graph = graph;
    state.requests = new Map();
    state.routes = new Map();
    state.version = 0;
    if (state.job) state.job.stale = true;
  }
  const version = versionOf(graph);
  if (version !== state.version || spacing !== state.spacing) {
    state.version = version;
    state.spacing = spacing;
    schedule();
  }
}

export function circuitTrack(owner, a, b, sd, ed, sc, ec) {
  if (!owner || typeof owner !== "object") return null;
  const tag = tagOf(owner);
  const now = performance.now();
  let asked = state.requests.get(tag);
  if (!asked) {
    asked = [];
    state.requests.set(tag, asked);
  }
  const known = find(asked, a, b);
  if (known) {
    known.seen = now;
    known.frame = state.frame;
    known.a = [a[0], a[1]];
    known.b = [b[0], b[1]];
  } else {
    asked.push({ tag, owner, a: [a[0], a[1]], b: [b[0], b[1]], sd, ed,
                 sc: sc ? [sc[0], sc[1]] : null, ec: ec ? [ec[0], ec[1]] : null, seen: now,
                 frame: state.frame });
    schedule();
  }
  const route = find(state.routes.get(tag), a, b);
  if (!route) return null;
  if (!route.track || route.track.ends[0] !== a[0] || route.track.ends[1] !== a[1]
      || route.track.ends[2] !== b[0] || route.track.ends[3] !== b[1]) {
    const flat = route.points.slice();
    flat[0] = a[0];
    flat[1] = a[1];
    flat[flat.length - 2] = b[0];
    flat[flat.length - 1] = b[1];
    route.track = trackOf(flat);
    route.track.ends = [a[0], a[1], b[0], b[1]];
  }
  return route.track;
}

function gridFor(graph, items, spacing) {
  const rects = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const grow = (x, y) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };
  for (const node of nodesOf(graph)) {
    const rect = boundsOf(node);
    if (!rect) continue;
    const box = [rect[0] - PAD, rect[1] - PAD, rect[0] + rect[2] + PAD, rect[1] + rect[3] + PAD];
    rects.push(box);
    grow(box[0], box[1]);
    grow(box[2], box[3]);
  }
  for (const item of items) {
    grow(item.a[0], item.a[1]);
    grow(item.b[0], item.b[1]);
  }
  let pitch = Math.max(MIN_PITCH, spacing);
  const spanX = maxX - minX + MARGIN_UNITS * 2;
  const spanY = maxY - minY + MARGIN_UNITS * 2;
  while ((spanX / pitch) * (spanY / pitch) > MAX_CELLS) pitch *= 1.25;
  const x0 = minX - MARGIN_UNITS;
  const y0 = minY - MARGIN_UNITS;
  const cols = Math.ceil(spanX / pitch) + 1;
  const rows = Math.ceil(spanY / pitch) + 1;
  const size = cols * rows;
  const blocked = new Uint8Array(size);
  for (const box of rects) {
    const c0 = Math.max(0, Math.ceil((box[0] - x0) / pitch - 0.5));
    const c1 = Math.min(cols - 1, Math.floor((box[2] - x0) / pitch - 0.5));
    const r0 = Math.max(0, Math.ceil((box[1] - y0) / pitch - 0.5));
    const r1 = Math.min(rows - 1, Math.floor((box[3] - y0) / pitch - 0.5));
    if (c1 < c0) continue;
    for (let r = r0; r <= r1; r += 1) blocked.fill(1, r * cols + c0, r * cols + c1 + 1);
  }
  const near = new Uint8Array(size);
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      if (!blocked[r * cols + c]) continue;
      for (let dr = -1; dr <= 1; dr += 1) {
        for (let dc = -1; dc <= 1; dc += 1) {
          const rr = r + dr;
          const cc = c + dc;
          if (rr >= 0 && rr < rows && cc >= 0 && cc < cols) near[rr * cols + cc] = 1;
        }
      }
    }
  }
  return {
    x0, y0, pitch, cols, rows, blocked, near,
    used: [new Uint8Array(size), new Uint8Array(size)],
    pull: [new Float32Array(size), new Float32Array(size)],
  };
}

function cellAt(grid, point) {
  const c = Math.max(0, Math.min(grid.cols - 1, Math.floor((point[0] - grid.x0) / grid.pitch)));
  const r = Math.max(0, Math.min(grid.rows - 1, Math.floor((point[1] - grid.y0) / grid.pitch)));
  return r * grid.cols + c;
}

function ensure(size) {
  if (scratch.size >= size) return;
  scratch.size = size;
  scratch.g = new Float32Array(size);
  scratch.from = new Int32Array(size);
  scratch.seen = new Uint32Array(size);
  scratch.done = new Uint32Array(size);
}

function push(entry, f) {
  const s = scratch.heapS;
  const fs = scratch.heapF;
  let i = s.length;
  s.push(entry);
  fs.push(f);
  while (i > 0) {
    const parent = (i - 1) >> 1;
    if (fs[parent] <= f) break;
    s[i] = s[parent];
    fs[i] = fs[parent];
    i = parent;
  }
  s[i] = entry;
  fs[i] = f;
}

function pop() {
  const s = scratch.heapS;
  const fs = scratch.heapF;
  const top = s[0];
  const lastS = s.pop();
  const lastF = fs.pop();
  const n = s.length;
  if (n) {
    let i = 0;
    while (true) {
      let child = i * 2 + 1;
      if (child >= n) break;
      if (child + 1 < n && fs[child + 1] < fs[child]) child += 1;
      if (fs[child] >= lastF) break;
      s[i] = s[child];
      fs[i] = fs[child];
      i = child;
    }
    s[i] = lastS;
    fs[i] = lastF;
  }
  return top;
}

function search(grid, start, startDir, goal, goalDir, window) {
  const [c0, r0, c1, r1] = window;
  const width = c1 - c0 + 1;
  const height = r1 - r0 + 1;
  ensure(width * height * 4);
  scratch.search += 1;
  const mark = scratch.search;
  const { g, from, seen, done } = scratch;
  scratch.heapS.length = 0;
  scratch.heapF.length = 0;
  const { cols, blocked, near, used, pull } = grid;
  const goalC = goal % cols;
  const goalR = Math.floor(goal / cols);
  const floor = (1 - PULL) * GREED;
  const guess = (c, r) => (Math.abs(c - goalC) + Math.abs(r - goalR)) * floor;
  const first = ((Math.floor(start / cols) - r0) * width + (start % cols) - c0) * 4 + startDir;
  g[first] = 0;
  seen[first] = mark;
  from[first] = -1;
  push(first, guess(start % cols, Math.floor(start / cols)));
  while (scratch.heapS.length) {
    const current = pop();
    if (done[current] === mark) continue;
    done[current] = mark;
    const dir = current & 3;
    const li = current >> 2;
    const c = (li % width) + c0;
    const r = Math.floor(li / width) + r0;
    const cell = r * cols + c;
    if (cell === goal) {
      const cells = [];
      let walk = current;
      while (walk !== -1) {
        const at = walk >> 2;
        const step = (Math.floor(at / width) + r0) * cols + (at % width) + c0;
        if (cells[cells.length - 1] !== step) cells.push(step);
        walk = from[walk];
      }
      return cells.reverse();
    }
    for (let next = 0; next < 4; next += 1) {
      if (next === ((dir + 2) & 3)) continue;
      const nc = c + STEPS[next][0];
      const nr = r + STEPS[next][1];
      if (nc < c0 || nc > c1 || nr < r0 || nr > r1) continue;
      const target = nr * cols + nc;
      const free = target === goal || target === start;
      if (blocked[target] && !free) continue;
      const axis = next & 1;
      let cost = 1 - PULL * pull[axis][target];
      if (!free && used[axis][target]) cost += TAKEN;
      if (!free && used[axis ^ 1][target]) cost += CROSS;
      if (near[target]) cost += NEAR;
      if (next !== dir) {
        cost += BEND;
        if (cell !== start && cell !== goal && used[axis][cell]) cost += TAKEN;
      }
      if (target === goal && next !== goalDir) cost += BEND;
      const key = ((nr - r0) * width + (nc - c0)) * 4 + next;
      const total = g[current] + cost;
      if (seen[key] === mark && g[key] <= total) continue;
      seen[key] = mark;
      g[key] = total;
      from[key] = current;
      push(key, total + guess(nc, nr));
    }
  }
  return null;
}

function windowFor(grid, start, goal, units) {
  const { cols, rows } = grid;
  const pad = Math.ceil(units / grid.pitch);
  const sc = start % cols;
  const sr = Math.floor(start / cols);
  const gc = goal % cols;
  const gr = Math.floor(goal / cols);
  return [Math.max(0, Math.min(sc, gc) - pad), Math.max(0, Math.min(sr, gr) - pad),
          Math.min(cols - 1, Math.max(sc, gc) + pad), Math.min(rows - 1, Math.max(sr, gr) + pad)];
}

function claim(grid, cells) {
  const { cols, rows, used, pull } = grid;
  const axisOf = (p, q) => (Math.floor(p / cols) === Math.floor(q / cols) ? 0 : 1);
  const lay = (cell, axis) => {
    used[axis][cell] = Math.min(255, used[axis][cell] + 1);
    const c = cell % cols;
    const r = Math.floor(cell / cols);
    for (let d = 1; d <= PULL_REACH; d += 1) {
      const strength = 1 - (d - 1) / PULL_REACH;
      for (const sign of [-1, 1]) {
        const nc = axis ? c + sign * d : c;
        const nr = axis ? r : r + sign * d;
        if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
        const at = nr * cols + nc;
        if (pull[axis][at] < strength) pull[axis][at] = strength;
      }
    }
  };
  for (let i = 0; i < cells.length; i += 1) {
    const before = i > 0 ? axisOf(cells[i - 1], cells[i]) : -1;
    const after = i < cells.length - 1 ? axisOf(cells[i], cells[i + 1]) : -1;
    if (before >= 0) lay(cells[i], before);
    if (after >= 0 && after !== before) lay(cells[i], after);
  }
}

function exit(grid, point, vector) {
  const stub = stubOf(point, vector);
  if (!vector) return { cell: cellAt(grid, stub), stub };
  const { blocked, pitch } = grid;
  for (let reach = STUB; reach <= STUB + pitch * EXIT_CELLS; reach += pitch / 2) {
    const probe = [point[0] + vector[0] * reach, point[1] + vector[1] * reach];
    const cell = cellAt(grid, probe);
    if (!blocked[cell]) return { cell, stub: probe };
  }
  return { cell: cellAt(grid, stub), stub };
}

function routeOne(job, item) {
  const { grid } = job;
  const out = outward(item.sd, item.sc);
  const back = outward(item.ed, item.ec);
  const leave = exit(grid, item.a, out);
  const reach = exit(grid, item.b, back);
  item.sa = leave.stub;
  item.sb = reach.stub;
  const startDir = headingOf(out, 0);
  const goalDir = back ? headingOf([-back[0], -back[1]], 0) : 0;
  const start = leave.cell;
  const goal = reach.cell;
  if (start === goal) return;
  let cells = search(grid, start, startDir, goal, goalDir, windowFor(grid, start, goal, WINDOW_UNITS));
  if (!cells) cells = search(grid, start, startDir, goal, goalDir, windowFor(grid, start, goal, WIDE_UNITS));
  if (!cells && grid.cols * grid.rows <= FULL_LIMIT) {
    cells = search(grid, start, startDir, goal, goalDir, [0, 0, grid.cols - 1, grid.rows - 1]);
  }
  if (!cells || cells.length < 2) return;
  claim(grid, cells);
  item.cells = cells;
}

function chamfer(points) {
  const clean = [];
  for (const point of points) {
    const last = clean[clean.length - 1];
    if (last && Math.abs(last[0] - point[0]) < 1e-6 && Math.abs(last[1] - point[1]) < 1e-6) continue;
    clean.push(point);
  }
  const straight = [clean[0]];
  for (let i = 1; i < clean.length - 1; i += 1) {
    const p = straight[straight.length - 1];
    const q = clean[i];
    const r = clean[i + 1];
    const cross = (q[0] - p[0]) * (r[1] - q[1]) - (q[1] - p[1]) * (r[0] - q[0]);
    if (Math.abs(cross) < 1e-6) continue;
    straight.push(q);
  }
  if (clean.length > 1) straight.push(clean[clean.length - 1]);
  const flat = [straight[0][0], straight[0][1]];
  for (let i = 1; i < straight.length - 1; i += 1) {
    const p = straight[i - 1];
    const q = straight[i];
    const r = straight[i + 1];
    const inLength = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const outLength = Math.hypot(r[0] - q[0], r[1] - q[1]);
    const cut = Math.min(CHAMFER, inLength / 2, outLength / 2);
    if (cut < 0.5) {
      flat.push(q[0], q[1]);
      continue;
    }
    flat.push(q[0] - ((q[0] - p[0]) / inLength) * cut, q[1] - ((q[1] - p[1]) / inLength) * cut);
    flat.push(q[0] + ((r[0] - q[0]) / outLength) * cut, q[1] + ((r[1] - q[1]) / outLength) * cut);
  }
  const end = straight[straight.length - 1];
  flat.push(end[0], end[1]);
  return flat;
}

function pointsOf(grid, item) {
  const { cols, pitch, x0, y0 } = grid;
  const centre = (cell) => [x0 + ((cell % cols) + 0.5) * pitch, y0 + (Math.floor(cell / cols) + 0.5) * pitch];
  const points = [item.a, item.sa];
  for (const cell of item.cells) points.push(centre(cell));
  points.push(item.sb, item.b);
  return chamfer(points);
}

function finish(job) {
  const routes = new Map();
  for (const item of job.items) {
    if (!item.cells) continue;
    let list = routes.get(item.tag);
    if (!list) {
      list = [];
      routes.set(item.tag, list);
    }
    list.push({ a: item.a, b: item.b, points: pointsOf(job.grid, item), track: null });
  }
  state.routes = routes;
  state.job = null;
  state.redraw?.();
}

function step(job) {
  if (job.stale || state.graph !== job.graph) return;
  const began = performance.now();
  while (job.at < job.items.length) {
    routeOne(job, job.items[job.at]);
    job.at += 1;
    if (performance.now() - began > SLICE_MS) {
      setTimeout(() => step(job), 0);
      return;
    }
  }
  finish(job);
}

function alive(graph, owner) {
  const id = owner?.id;
  return [graph.links, graph._links, graph.reroutes, graph.floatingLinks]
    .some((store) => typeof store?.get === "function" && store.get(id) === owner);
}

function begin() {
  const graph = state.graph;
  if (!graph) return;
  const now = performance.now();
  const items = [];
  for (const [tag, list] of state.requests) {
    const latest = Math.max(...list.map((one) => one.frame));
    const kept = list.filter((one) => one.frame === latest && now - one.seen < FORGET_MS
      && alive(graph, one.owner));
    if (!kept.length) {
      state.requests.delete(tag);
      continue;
    }
    state.requests.set(tag, kept);
    for (const one of kept) items.push({ ...one, cells: null });
  }
  if (!items.length) return;
  items.sort((p, q) => (Math.abs(q.b[0] - q.a[0]) + Math.abs(q.b[1] - q.a[1]))
    - (Math.abs(p.b[0] - p.a[0]) + Math.abs(p.b[1] - p.a[1])));
  const job = { graph, items, at: 0, stale: false, grid: gridFor(graph, items, state.spacing) };
  state.job = job;
  step(job);
}
