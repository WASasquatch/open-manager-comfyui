const KEY = "zipTies";

const SPLINE = 0.25;

const SAMPLES = 32;

const BAR = 3;

const PAD = 4;

const OUTLET = 4.5;

const SPLINE_MODE = 2;

const LINEAR_MODE = 1;

const STRAIGHT_MODE = 0;

const LINEAR_LEAD = 15;

const STRAIGHT_LEAD = 10;

const CENTER = 5;

const DIRECTIONS = { 1: [0, -1], 2: [0, 1], 3: [-1, 0], 4: [1, 0] };

const SAME = 1e-9;

const PASSES = 10;

const PAIR_SAMPLES = 16;

const PAIR_SAMPLES_CROWDED = 10;

const CROWD = 20;

const MEMO_KEYS = 6;

const winsMemo = new WeakMap();

const STEP = Math.PI / 4;

function snap(angle) {
  return Math.round(Math.atan2(Math.sin(angle), Math.cos(angle)) / STEP) * STEP;
}

function heading(tie, tx, ty) {
  const flow = Math.hypot(tx, ty) > 1e-6;
  const stored = Number(tie.angle);
  if (!tie.fixed || !Number.isFinite(stored)) return flow ? Math.atan2(ty, tx) : stored || 0;
  return flow && Math.cos(stored) * tx + Math.sin(stored) * ty < 0 ? stored + Math.PI : stored;
}

function tiesOf(graph, make = false) {
  if (!graph) return [];
  if (!graph.extra && !make) return [];
  graph.extra ??= {};
  let ties = graph.extra[KEY];
  if (!Array.isArray(ties)) {
    if (!make) return [];
    ties = graph.extra[KEY] = [];
  }
  return ties;
}

function linkOf(graph, id) {
  if (typeof graph?.getLink === "function") return graph.getLink(id);
  const links = graph?.links;
  return links instanceof Map ? links.get(id) : links?.[id];
}

function linksOf(graph) {
  const links = graph?.links;
  if (!links) return [];
  return links instanceof Map ? [...links.values()] : Object.values(links);
}

function nextId(ties) {
  let id = 1;
  for (const tie of ties) id = Math.max(id, (Number(tie.id) || 0) + 1);
  return id;
}

function prune(graph) {
  const index = new Map();
  const ties = tiesOf(graph);
  if (!ties.length) return index;
  for (let at = ties.length - 1; at >= 0; at -= 1) {
    const tie = ties[at];
    if (!tie || !Array.isArray(tie.links) || !Array.isArray(tie.pos)) {
      ties.splice(at, 1);
      continue;
    }
    tie.links = tie.links.filter((id) => {
      const link = linkOf(graph, id);
      return link && link.parentId == null;
    });
    if (!tie.links.length) ties.splice(at, 1);
  }
  for (const tie of ties) {
    for (const id of tie.links) {
      const held = index.get(id);
      if (held) held.push(tie);
      else index.set(id, [tie]);
    }
  }
  if (!ties.length && graph.extra) delete graph.extra[KEY];
  return index;
}

function ranks(graph, index) {
  const order = new Map();
  const nodes = graph?._nodes || graph?.nodes || [];
  nodes.forEach((node, at) => order.set(node.id, at));
  const ranked = new Map();
  for (const id of index.keys()) {
    const link = linkOf(graph, id);
    if (!link) continue;
    const from = order.get(link.origin_id) ?? nodes.length;
    const into = order.get(link.target_id) ?? nodes.length;
    ranked.set(id, ((from * 4096 + (link.origin_slot ?? 0)) * 65536 + into) * 4096
      + (link.target_slot ?? 0));
  }
  return ranked;
}

function along(tie, end) {
  const dx = end.b[0] - end.a[0];
  const dy = end.b[1] - end.a[1];
  return (tie.pos[0] - end.a[0]) * dx + (tie.pos[1] - end.a[1]) * dy;
}

function differ(left, right) {
  const gap = left - right;
  return Math.abs(gap) <= SAME * Math.max(1, Math.abs(left), Math.abs(right)) ? 0 : gap;
}

function approach(stop, tie, n) {
  if (!stop) return 0;
  const dx = stop.p[0] - tie.pos[0];
  const dy = stop.p[1] - tie.pos[1];
  const reach = Math.hypot(dx, dy) * SPLINE;
  const lean = stop.dir ? (stop.dir[0] * n[0] + stop.dir[1] * n[1]) * reach : 0;
  const side = dx * n[0] + dy * n[1] + lean;
  return reach > 1e-6 ? side / (reach * reach) : side;
}

function inbound(stop, tie, t, n, off, samples) {
  const b = [tie.pos[0] + n[0] * off, tie.pos[1] + n[1] * off];
  const a = stop.p;
  const reach = Math.hypot(b[0] - a[0], b[1] - a[1]) * SPLINE;
  const c0 = stop.dir ? [a[0] + stop.dir[0] * reach, a[1] + stop.dir[1] * reach] : a;
  const c1 = [b[0] - t[0] * reach, b[1] - t[1] * reach];
  const points = [];
  for (let step = 0; step <= samples; step += 1) {
    const u = step / samples;
    const v = 1 - u;
    const w0 = v * v * v;
    const w1 = 3 * v * v * u;
    const w2 = 3 * v * u * u;
    const w3 = u * u * u;
    points.push([w0 * a[0] + w1 * c0[0] + w2 * c1[0] + w3 * b[0],
                 w0 * a[1] + w1 * c0[1] + w2 * c1[1] + w3 * b[1]]);
  }
  return points;
}

function meets(p, q) {
  let count = 0;
  for (let i = 1; i < p.length; i += 1) {
    for (let j = 1; j < q.length; j += 1) {
      const t = crossing(p[i - 1], p[i], q[j - 1], q[j]);
      if (t !== null && t > 0 && t < 1) count += 1;
    }
  }
  return count;
}

function signature(rows, tie, t, gap) {
  const parts = [tie.pos[0].toFixed(1), tie.pos[1].toFixed(1), t[0].toFixed(4), t[1].toFixed(4), gap];
  for (const row of rows) {
    const from = row.from;
    parts.push(from
      ? `${row.id}:${from.p[0].toFixed(1)},${from.p[1].toFixed(1)},${from.dir ? from.dir.join(",") : ""}`
      : `${row.id}:`);
  }
  return parts.join("|");
}

function rankInbound(rows, tie, t, n, gap) {
  const key = signature(rows, tie, t, gap);
  let memo = winsMemo.get(tie);
  if (!memo) {
    memo = new Map();
    winsMemo.set(tie, memo);
  }
  const held = memo.get(key);
  if (held) {
    for (const row of rows) row.wins = held.get(row.id) ?? 0;
    return;
  }
  const samples = rows.length > CROWD ? PAIR_SAMPLES_CROWDED : PAIR_SAMPLES;
  const lower = rows.map((row) => (row.from ? inbound(row.from, tie, t, n, -gap / 2, samples) : null));
  const upper = rows.map((row) => (row.from ? inbound(row.from, tie, t, n, gap / 2, samples) : null));
  const wins = rows.map(() => 0);
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      if (!lower[i] || !lower[j]) continue;
      const below = meets(lower[i], upper[j]);
      const above = meets(upper[i], lower[j]);
      const pick = below === above ? differ(rows[i].into, rows[j].into) : below - above;
      if (pick < 0) wins[i] += 1;
      else if (pick > 0) wins[j] += 1;
    }
  }
  rows.forEach((row, at) => { row.wins = wins[at]; });
  memo.set(key, new Map(rows.map((row) => [row.id, row.wins])));
  while (memo.size > MEMO_KEYS) memo.delete(memo.keys().next().value);
}

function sameOrder(before, after) {
  if (before.size !== after.size) return false;
  for (const [tie, plan] of after) {
    const old = before.get(tie)?.order;
    if (!old || old.length !== plan.order.length || old.some((id, at) => id !== plan.order[at])) {
      return false;
    }
  }
  return true;
}

function layout(graph, index, ends, gap) {
  const sequence = new Map();
  for (const [id, held] of index) {
    const end = ends.get(id);
    sequence.set(id, end ? [...held].sort((p, q) => along(p, end) - along(q, end)) : [...held]);
  }
  const ranked = ranks(graph, index);
  const ties = tiesOf(graph);
  let plans = new Map();

  const passes = Math.min(ties.length + 2, PASSES);
  for (let pass = 0; pass < passes; pass += 1) {
    const neighbour = (id, tie, step) => {
      const list = sequence.get(id) || [];
      const other = list[list.indexOf(tie) + step];
      if (other) {
        const plan = plans.get(other);
        if (!plan) return { p: other.pos, dir: null };
        const dir = step < 0 ? plan.t : [-plan.t[0], -plan.t[1]];
        return { p: strand(other, plan, id), dir };
      }
      const end = ends.get(id);
      if (!end) return null;
      const way = step < 0 ? (end.sd || 4) : (end.ed || 3);
      return { p: step < 0 ? end.a : end.b, dir: DIRECTIONS[way] || null };
    };
    const next = new Map();
    for (const tie of ties) {
      const rows = tie.links.map((id) => ({
        id, from: neighbour(id, tie, -1), to: neighbour(id, tie, 1),
      }));
      let tx = 0;
      let ty = 0;
      for (const row of rows) {
        if (!row.from || !row.to) continue;
        const dx = row.to.p[0] - row.from.p[0];
        const dy = row.to.p[1] - row.from.p[1];
        const length = Math.hypot(dx, dy) || 1;
        tx += dx / length;
        ty += dy / length;
      }
      const angle = heading(tie, tx, ty);
      const t = [Math.cos(angle), Math.sin(angle)];
      const n = [-t[1], t[0]];
      for (const row of rows) {
        row.into = approach(row.from, tie, n);
        row.out = approach(row.to, tie, n);
        row.rank = ranked.get(row.id) ?? 0;
      }
      rankInbound(rows, tie, t, n, gap);
      rows.sort((p, q) => (q.wins - p.wins) || differ(p.into, q.into) || differ(p.out, q.out)
        || p.rank - q.rank);
      const offset = new Map();
      rows.forEach((row, at) => offset.set(row.id, (at - (rows.length - 1) / 2) * gap));
      next.set(tie, { t, n, angle, order: rows.map((row) => row.id), offset, gap,
                      half: ((rows.length - 1) * gap) / 2 + PAD });
    }
    const settled = pass > 0 && sameOrder(plans, next);
    plans = next;
    if (settled) break;
  }
  return { sequence, plans };
}

function strand(tie, plan, id) {
  const off = plan.offset.get(id) ?? 0;
  return [tie.pos[0] + plan.n[0] * off, tie.pos[1] + plan.n[1] * off];
}

function route(state, id, a, b, sd, ed) {
  const list = state.sequence.get(id);
  if (!list?.length) return [{ a, b, sd, ed }];
  const stops = list.map((tie) => {
    const plan = state.plans.get(tie);
    return plan ? { p: strand(tie, plan, id), dir: plan.t } : { p: tie.pos, dir: [1, 0] };
  });
  const parts = [];
  let last = { p: a, dir: null };
  for (const stop of [...stops, { p: b, dir: null }]) {
    const reach = Math.hypot(stop.p[0] - last.p[0], stop.p[1] - last.p[1]) * SPLINE;
    const part = { a: last.p, b: stop.p, sd: last.dir ? CENTER : sd, ed: stop.dir ? CENTER : ed };
    if (last.dir) part.startControl = [last.dir[0] * reach, last.dir[1] * reach];
    if (stop.dir) part.endControl = [-stop.dir[0] * reach, -stop.dir[1] * reach];
    parts.push(part);
    last = stop;
  }
  return parts;
}

function nudge(point, direction, reach) {
  const step = DIRECTIONS[direction];
  return step ? [point[0] + step[0] * reach, point[1] + step[1] * reach] : [point[0], point[1]];
}

function polyline(mode, part) {
  const { a, b } = part;
  if (mode === LINEAR_MODE) {
    return [a, nudge(a, part.sd || 4, LINEAR_LEAD), nudge(b, part.ed || 3, LINEAR_LEAD), b];
  }
  if (mode === STRAIGHT_MODE) {
    const out = nudge(a, part.sd || 4, STRAIGHT_LEAD);
    const into = nudge(b, part.ed || 3, STRAIGHT_LEAD);
    const middle = (out[0] + into[0]) / 2;
    return [a, out, [middle, out[1]], [middle, into[1]], into, b];
  }
  if (mode !== undefined && mode !== SPLINE_MODE) return [a, b];
  const reach = Math.hypot(b[0] - a[0], b[1] - a[1]) * SPLINE;
  const c0 = part.startControl
    ? [a[0] + part.startControl[0], a[1] + part.startControl[1]]
    : nudge(a, part.sd || 4, reach);
  const c1 = part.endControl
    ? [b[0] + part.endControl[0], b[1] + part.endControl[1]]
    : nudge(b, part.ed || 3, reach);
  const points = [];
  for (let step = 0; step <= SAMPLES; step += 1) {
    const t = step / SAMPLES;
    const u = 1 - t;
    const w0 = u * u * u;
    const w1 = 3 * u * u * t;
    const w2 = 3 * u * t * t;
    const w3 = t * t * t;
    points.push([w0 * a[0] + w1 * c0[0] + w2 * c1[0] + w3 * b[0],
                 w0 * a[1] + w1 * c0[1] + w2 * c1[1] + w3 * b[1]]);
  }
  return points;
}

function crossing(p, q, r, s) {
  const d1x = q[0] - p[0];
  const d1y = q[1] - p[1];
  const d2x = s[0] - r[0];
  const d2y = s[1] - r[1];
  const den = d1x * d2y - d1y * d2x;
  if (Math.abs(den) < 1e-9) return null;
  const ex = r[0] - p[0];
  const ey = r[1] - p[1];
  const t = (ex * d2y - ey * d2x) / den;
  const u = (ex * d1y - ey * d1x) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}

function bar(tie, plan) {
  const half = plan?.half ?? PAD;
  const n = plan?.n ?? [0, 1];
  return [[tie.pos[0] - n[0] * half, tie.pos[1] - n[1] * half],
          [tie.pos[0] + n[0] * half, tie.pos[1] + n[1] * half]];
}

function tieAt(state, ties, point, pad) {
  for (let at = ties.length - 1; at >= 0; at -= 1) {
    const tie = ties[at];
    const plan = state.plans.get(tie);
    const t = plan?.t ?? [1, 0];
    const n = plan?.n ?? [0, 1];
    const dx = point[0] - tie.pos[0];
    const dy = point[1] - tie.pos[1];
    const lengthwise = Math.abs(dx * t[0] + dy * t[1]);
    const across = Math.abs(dx * n[0] + dy * n[1]);
    if (lengthwise <= BAR + 3 + pad && across <= (plan?.half ?? PAD) + 2 + pad) return tie;
  }
  return null;
}

function outletOf(tie, plan, id) {
  const [x, y] = strand(tie, plan, id);
  const reach = BAR + OUTLET;
  return [x + plan.t[0] * reach, y + plan.t[1] * reach];
}

function outletAt(state, ties, point, pad) {
  for (let at = ties.length - 1; at >= 0; at -= 1) {
    const tie = ties[at];
    const plan = state.plans.get(tie);
    if (!plan?.order.length) continue;
    const dx = point[0] - tie.pos[0];
    const dy = point[1] - tie.pos[1];
    const lengthwise = dx * plan.t[0] + dy * plan.t[1];
    const across = dx * plan.n[0] + dy * plan.n[1];
    if (lengthwise < BAR || lengthwise > BAR + OUTLET * 2 + pad) continue;
    if (Math.abs(across) > plan.half + pad) continue;
    let id = plan.order[0];
    for (const one of plan.order) {
      if (Math.abs((plan.offset.get(one) ?? 0) - across)
          < Math.abs((plan.offset.get(id) ?? 0) - across)) id = one;
    }
    return { tie, id, at: outletOf(tie, plan, id) };
  }
  return null;
}

function reachOf(state, id) {
  const list = state.sequence.get(id);
  if (!list?.length) return null;
  const points = [];
  for (const tie of list) {
    const plan = state.plans.get(tie);
    const half = plan?.half ?? PAD;
    points.push([tie.pos[0] - half, tie.pos[1] - half], [tie.pos[0] + half, tie.pos[1] + half]);
  }
  return points;
}

function cut(state, graph, ends, mode, p, q, drawn) {
  const ties = tiesOf(graph);
  const severed = ties.filter((tie) => {
    const [r, s] = bar(tie, state.plans.get(tie));
    return crossing(p, q, r, s) !== null;
  });
  if (severed.length) return { remove: severed };
  const hits = [];
  for (const link of linksOf(graph)) {
    if (!link || link.parentId != null) continue;
    const end = ends.get(link.id);
    if (!end) continue;
    let best = null;
    const lines = drawn?.(link.id)
      ?? route(state, link.id, end.a, end.b, end.sd, end.ed).map((part) => polyline(mode, part));
    for (const points of lines) {
      for (let at = 1; at < points.length; at += 1) {
        const t = crossing(p, q, points[at - 1], points[at]);
        if (t !== null && (!best || t < best)) best = t;
      }
    }
    if (best !== null) hits.push({ id: link.id, t: best });
  }
  if (!hits.length) return null;
  let x = 0;
  let y = 0;
  for (const hit of hits) {
    x += p[0] + (q[0] - p[0]) * hit.t;
    y += p[1] + (q[1] - p[1]) * hit.t;
  }
  const angle = Math.atan2(q[1] - p[1], q[0] - p[0]) - Math.PI / 2;
  return {
    add: { id: nextId(ties), pos: [x / hits.length, y / hits.length], angle,
           links: hits.sort((h1, h2) => h1.t - h2.t).map((hit) => hit.id) },
  };
}

export {
  KEY, BAR, snap, tiesOf, linkOf, prune, layout, route, tieAt, cut, nextId, outletOf, outletAt,
  reachOf,
};
