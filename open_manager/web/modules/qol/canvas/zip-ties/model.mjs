const KEY = "zipTies";

const SPLINE = 0.25;

const SAMPLES = 32;

const BAR = 3;

const PAD = 4;

const SPLINE_MODE = 2;

const CENTER = 5;

const DIRECTIONS = { 1: [0, -1], 2: [0, 1], 3: [-1, 0], 4: [1, 0] };

const SAME = 0.5;

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
  return Math.abs(left - right) < SAME ? 0 : left - right;
}

function layout(graph, index, ends, gap) {
  const sequence = new Map();
  for (const [id, held] of index) {
    const end = ends.get(id);
    sequence.set(id, end ? [...held].sort((p, q) => along(p, end) - along(q, end)) : [...held]);
  }
  const ranked = ranks(graph, index);
  const plans = new Map();
  const ties = tiesOf(graph);

  for (let pass = 0; pass < 2; pass += 1) {
    const pointOf = (tie, id) => {
      const plan = plans.get(tie);
      return plan ? strand(tie, plan, id) : tie.pos;
    };
    const neighbour = (id, tie, step) => {
      const list = sequence.get(id) || [];
      const other = list[list.indexOf(tie) + step];
      if (other) return pointOf(other, id);
      const end = ends.get(id);
      return end ? (step < 0 ? end.a : end.b) : null;
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
        const dx = row.to[0] - row.from[0];
        const dy = row.to[1] - row.from[1];
        const length = Math.hypot(dx, dy) || 1;
        tx += dx / length;
        ty += dy / length;
      }
      const angle = heading(tie, tx, ty);
      const t = [Math.cos(angle), Math.sin(angle)];
      const n = [-t[1], t[0]];
      let near = 0;
      let far = 0;
      for (const row of rows) {
        row.into = row.from ? (row.from[0] - tie.pos[0]) * n[0] + (row.from[1] - tie.pos[1]) * n[1] : 0;
        row.out = row.to ? (row.to[0] - tie.pos[0]) * n[0] + (row.to[1] - tie.pos[1]) * n[1] : 0;
        if (row.from) near += Math.hypot(row.from[0] - tie.pos[0], row.from[1] - tie.pos[1]);
        if (row.to) far += Math.hypot(row.to[0] - tie.pos[0], row.to[1] - tie.pos[1]);
        row.rank = ranked.get(row.id) ?? 0;
      }
      const entry = near <= far;
      rows.sort((p, q) => (entry
        ? differ(p.into, q.into) || differ(p.out, q.out)
        : differ(p.out, q.out) || differ(p.into, q.into)) || p.rank - q.rank);
      const offset = new Map();
      rows.forEach((row, at) => offset.set(row.id, (at - (rows.length - 1) / 2) * gap));
      next.set(tie, { t, n, angle, order: rows.map((row) => row.id), offset,
                      half: ((rows.length - 1) * gap) / 2 + PAD });
    }
    plans.clear();
    for (const [tie, plan] of next) plans.set(tie, plan);
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

function cut(state, graph, ends, mode, p, q) {
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
    for (const part of route(state, link.id, end.a, end.b, end.sd, end.ed)) {
      const points = polyline(mode, part);
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

export { KEY, BAR, snap, tiesOf, linkOf, prune, layout, route, tieAt, cut, nextId };
