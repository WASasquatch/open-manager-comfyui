import { lineOf, walk, pointAt, offsetLine } from "./track.mjs";

const TAU = Math.PI * 2;
const WHITE = [255, 255, 255];
const BLACK = [0, 0, 0];
const SILVER = [200, 205, 213];
const RUST = [122, 64, 32];
const RUST_GLOW = [224, 160, 112];
const HEMP = [184, 146, 90];
const GREY = [136, 136, 136];

const FINE_PX = 2.2;
const KEEP = 1024;
const SPAN = 192;

const parsed = new Map();
const palettes = new Map();
let probe = null;

function hex(text) {
  const body = text.slice(1);
  const wide = body.length === 3 || body.length === 4
    ? body.split("").map((one) => one + one).join("")
    : body;
  if (wide.length !== 6 && wide.length !== 8) return null;
  const value = Number.parseInt(wide.slice(0, 6), 16);
  if (!Number.isFinite(value)) return null;
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function functional(text) {
  const found = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(text);
  return found ? [Number(found[1]), Number(found[2]), Number(found[3])] : null;
}

function readColour(text) {
  const plain = String(text ?? "").trim();
  if (/^#[0-9a-f]{3,8}$/i.test(plain)) return hex(plain);
  const listed = functional(plain);
  if (listed) return listed;
  try {
    probe ??= document.createElement("canvas").getContext("2d");
    probe.fillStyle = "#000000";
    probe.fillStyle = plain;
    const shown = String(probe.fillStyle);
    return shown.startsWith("#") ? hex(shown) : functional(shown);
  } catch {
    return null;
  }
}

function rgbOf(colour) {
  const key = String(colour ?? "");
  let known = parsed.get(key);
  if (known) return known;
  known = readColour(key) || GREY;
  if (parsed.size > KEEP) parsed.clear();
  parsed.set(key, known);
  return known;
}

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function css(rgb, alpha = 1) {
  const [r, g, b] = rgb.map((one) => Math.round(Math.max(0, Math.min(255, one))));
  return alpha >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`;
}

function paletteFor(style, colour, make) {
  const key = `${style}|${colour}`;
  let known = palettes.get(key);
  if (known) return known;
  known = make(rgbOf(colour));
  if (palettes.size > KEEP) palettes.clear();
  palettes.set(key, known);
  return known;
}

function memo(track, key, make) {
  let known = track.memo.get(key);
  if (!known) {
    known = make();
    track.memo.set(key, known);
  }
  return known;
}

function stroke(ctx, path, style, width) {
  ctx.strokeStyle = style;
  ctx.lineWidth = width;
  ctx.stroke(path);
}

function fine(look, size) {
  return size * look.scale >= FINE_PX;
}

function noise(a, b, c) {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function spansOf(track, pad) {
  const list = [];
  const { xs, ys, at, n, length } = track;
  let i = 0;
  for (let lo = 0; lo < length; lo += SPAN) {
    const hi = lo + SPAN;
    const start = pointAt(track, lo);
    const end = pointAt(track, Math.min(hi, length));
    let x0 = Math.min(start.x, end.x);
    let y0 = Math.min(start.y, end.y);
    let x1 = Math.max(start.x, end.x);
    let y1 = Math.max(start.y, end.y);
    while (i < n && at[i] < lo) i += 1;
    for (let j = i; j < n && at[j] <= hi; j += 1) {
      if (xs[j] < x0) x0 = xs[j];
      if (xs[j] > x1) x1 = xs[j];
      if (ys[j] < y0) y0 = ys[j];
      if (ys[j] > y1) y1 = ys[j];
    }
    list.push({ lo, hi, box: [x0 - pad, y0 - pad, x1 + pad, y1 + pad], parts: null });
  }
  return list;
}

function inView(box, view) {
  if (!view) return true;
  return box[2] >= view[0] && box[0] <= view[0] + view[2]
    && box[3] >= view[1] && box[1] <= view[1] + view[3];
}

function shownParts(plan, look, build) {
  const parts = [];
  for (const span of plan.spans) {
    if (!inView(span.box, look.view)) continue;
    span.parts ??= build(span);
    parts.push(span.parts);
  }
  return parts;
}

function strokeParts(ctx, parts, name, style, width) {
  ctx.strokeStyle = style;
  ctx.lineWidth = width;
  for (const part of parts) ctx.stroke(part[name]);
}

function fillParts(ctx, parts, name, style) {
  ctx.fillStyle = style;
  for (const part of parts) ctx.fill(part[name]);
}

function halo(ctx, track, look, width) {
  if (look.lit) stroke(ctx, lineOf(track), "rgba(255,255,255,0.4)", width);
}

function energy(ctx, track, look) {
  const k = look.k;
  const p = paletteFor("energy", look.colour, (c) => ({
    halo: css(c, 0.16),
    sheath: css(c, 0.45),
    core: css(mix(c, WHITE, 0.6)),
    glow: css(mix(c, WHITE, 0.45), 0.5),
    pulse: css(mix(c, WHITE, 0.88)),
  }));
  const line = lineOf(track);
  ctx.lineCap = "round";
  if (fine(look, 3 * k)) stroke(ctx, line, p.halo, 12 * k);
  stroke(ctx, line, p.sheath, 5.5 * k);
  stroke(ctx, line, p.core, 2.2 * k);
  if (!fine(look, 4 * k)) return;
  const on = 9 * k;
  const off = 27 * k;
  ctx.setLineDash([on, off]);
  ctx.lineDashOffset = -((look.time * 80 * k) % (on + off));
  stroke(ctx, line, p.glow, 7 * k);
  stroke(ctx, line, p.pulse, 2.8 * k);
  ctx.setLineDash([]);
}

function dashes(ctx, track, look) {
  const k = look.k;
  const width = 3 * k;
  const line = lineOf(track);
  const on = 9 * k;
  const off = 7 * k;
  if (!fine(look, off)) {
    stroke(ctx, line, look.colour, width);
    return;
  }
  ctx.lineCap = "butt";
  ctx.setLineDash([on, off]);
  ctx.lineDashOffset = -((look.time * 36 * k) % (on + off));
  stroke(ctx, line, "rgba(0,0,0,0.5)", width + 2 * k);
  stroke(ctx, line, look.colour, width);
  ctx.setLineDash([]);
}

function chainPlan(track, k) {
  return memo(track, `chain:${k}`, () => {
    const long = 11 * k;
    const pitch = 7.4 * k;
    const wire = 1.9 * k;
    const bar = 2.8 * k;
    const count = Math.max(1, Math.floor((track.length - long * 0.5) / pitch) + 1);
    return {
      long,
      wide: 7 * k,
      wire,
      bar,
      pitch,
      rx: (long - wire) / 2,
      ry: (7 * k - wire) / 2,
      half: long / 2 - bar / 2,
      count,
      start: (track.length - (count - 1) * pitch) / 2,
      spans: spansOf(track, long),
      rusty: null,
    };
  });
}

function chainParts(track, plan, span, seed, rusty) {
  const rings = new Path2D();
  const bars = new Path2D();
  const shine = new Path2D();
  const flakes = rusty ? new Path2D() : null;
  const pits = rusty ? new Path2D() : null;
  const { rx, ry, half, bar, long, wire } = plan;
  const speck = (x, y, size) => {
    const radius = (0.45 + size * 0.5) * wire * 0.6;
    const target = size > 0.55 ? pits : flakes;
    target.moveTo(x + radius, y);
    target.arc(x, y, radius, 0, TAU);
  };
  walk(track, plan.start, plan.pitch, (x, y, dx, dy, s, i) => {
    if (i >= plan.count) return;
    if (i % 2 === 0) {
      rings.moveTo(x + dx * rx, y + dy * rx);
      rings.ellipse(x, y, rx, ry, Math.atan2(dy, dx), 0, TAU);
      if (!rusty) return;
      for (let j = 0; j < 3; j += 1) {
        const turn = noise(seed, i, j * 2) * TAU;
        const ex = Math.cos(turn) * rx;
        const ey = Math.sin(turn) * ry;
        speck(x + dx * ex - dy * ey, y + dy * ex + dx * ey, noise(seed, i, j * 2 + 1));
      }
      return;
    }
    bars.moveTo(x - dx * half, y - dy * half);
    bars.lineTo(x + dx * half, y + dy * half);
    const lift = bar * 0.22;
    shine.moveTo(x - dx * half * 0.6 + dy * lift, y - dy * half * 0.6 - dx * lift);
    shine.lineTo(x + dx * half * 0.6 + dy * lift, y + dy * half * 0.6 - dx * lift);
    if (!rusty) return;
    const along = (noise(seed, i, 0) - 0.5) * long * 0.7;
    speck(x + dx * along, y + dy * along, noise(seed, i, 1));
  }, span.lo, span.hi);
  return { rings, bars, shine, flakes, pits };
}

function chainOf(ctx, track, look, p, rusty) {
  const k = look.k;
  const plan = chainPlan(track, k);
  ctx.lineCap = "round";
  if (!fine(look, plan.pitch * 0.5)) {
    const line = lineOf(track);
    stroke(ctx, line, p.dark, 5 * k);
    stroke(ctx, line, p.metal, 3 * k);
    return;
  }
  if (plan.rusty !== rusty) {
    for (const span of plan.spans) span.parts = null;
    plan.rusty = rusty;
  }
  const parts = shownParts(plan, look, (span) => chainParts(track, plan, span, look.seed, rusty));
  if (!parts.length) return;
  strokeParts(ctx, parts, "rings", p.dark, plan.wire + 1.5 * k);
  strokeParts(ctx, parts, "rings", p.metal, plan.wire);
  strokeParts(ctx, parts, "rings", p.light, plan.wire * 0.35);
  strokeParts(ctx, parts, "bars", p.dark, plan.bar + 1.5 * k);
  strokeParts(ctx, parts, "bars", p.metal, plan.bar);
  strokeParts(ctx, parts, "shine", p.light, plan.bar * 0.32);
  if (!rusty) return;
  fillParts(ctx, parts, "flakes", p.flake);
  fillParts(ctx, parts, "pits", p.pit);
}

function chain(ctx, track, look) {
  const p = paletteFor("chain", look.colour, (c) => {
    const metal = mix(c, SILVER, 0.35);
    return { metal: css(metal), dark: css(mix(metal, BLACK, 0.62)), light: css(mix(metal, WHITE, 0.7)) };
  });
  chainOf(ctx, track, look, p, false);
}

function rust(ctx, track, look) {
  const p = paletteFor("rust", look.colour, (c) => {
    const base = mix(RUST, c, 0.16);
    return {
      metal: css(base),
      dark: css(mix(base, BLACK, 0.6)),
      light: css(mix(base, RUST_GLOW, 0.55)),
      flake: css([196, 104, 44], 0.9),
      pit: css([52, 22, 8], 0.85),
    };
  });
  halo(ctx, track, look, 10 * look.k);
  chainOf(ctx, track, look, p, true);
}

function rim(ctx, at, lip, wide, p, k) {
  ctx.save();
  ctx.translate(at.x, at.y);
  ctx.rotate(Math.atan2(at.dy, at.dx));
  ctx.beginPath();
  ctx.roundRect(-lip / 2, -wide / 2, lip, wide, 1.6 * k);
  ctx.fillStyle = p.body;
  ctx.fill();
  ctx.fillStyle = p.shade;
  ctx.fillRect(-lip / 2, wide * 0.14, lip, wide * 0.24);
  ctx.fillStyle = p.light;
  ctx.fillRect(-lip / 2, -wide * 0.34, lip, wide * 0.14);
  ctx.lineWidth = 1.2 * k;
  ctx.strokeStyle = p.edge;
  ctx.stroke();
  ctx.restore();
}

function pipes(ctx, track, look) {
  const k = look.k;
  const bore = 10 * k;
  const p = paletteFor("pipes", look.colour, (c) => ({
    edge: css(mix(c, BLACK, 0.66)),
    body: css(c),
    shade: css(mix(c, BLACK, 0.32)),
    light: css(mix(c, WHITE, 0.5)),
    gloss: css(mix(c, WHITE, 0.85)),
  }));
  const line = lineOf(track);
  ctx.lineCap = "butt";
  if (!fine(look, bore * 0.4)) {
    stroke(ctx, line, p.edge, bore * 0.8 + 1.5 * k);
    stroke(ctx, line, p.body, bore * 0.8);
    return;
  }
  stroke(ctx, line, p.edge, bore + 2.4 * k);
  stroke(ctx, line, p.body, bore);
  stroke(ctx, offsetLine(track, bore * 0.27), p.shade, bore * 0.3);
  stroke(ctx, offsetLine(track, -bore * 0.2), p.light, bore * 0.18);
  if (fine(look, bore * 0.15)) stroke(ctx, offsetLine(track, -bore * 0.22), p.gloss, bore * 0.05);
  const lip = bore * 0.95;
  const wide = bore * 1.5;
  if (track.length < lip * 3) return;
  rim(ctx, pointAt(track, lip / 2 + 0.5), lip, wide, p, k);
  rim(ctx, pointAt(track, track.length - lip / 2 - 0.5), lip, wide, p, k);
}

function cord(ctx, track, look) {
  const k = look.k;
  const girth = 6.5 * k;
  const pitch = 3.4 * k;
  const p = paletteFor("cord", look.colour, (c) => ({
    edge: css(mix(c, BLACK, 0.6)),
    base: css(mix(c, BLACK, 0.12)),
    light: css(mix(c, WHITE, 0.42)),
    deep: css(mix(c, BLACK, 0.38)),
  }));
  const line = lineOf(track);
  ctx.lineCap = "round";
  stroke(ctx, line, p.edge, girth + 1.6 * k);
  stroke(ctx, line, p.base, girth);
  if (!fine(look, pitch)) return;
  const plan = memo(track, `cord:${k}`, () => ({ spans: spansOf(track, girth) }));
  const side = girth * 0.36;
  const back = girth * 0.3;
  const parts = shownParts(plan, look, (span) => {
    const light = new Path2D();
    const deep = new Path2D();
    walk(track, pitch, pitch, (x, y, dx, dy, s, i) => {
      if (s > track.length - pitch * 0.5) return;
      const path = i % 2 ? deep : light;
      path.moveTo(x - dx * back - dy * side, y - dy * back + dx * side);
      path.lineTo(x, y);
      path.lineTo(x - dx * back + dy * side, y - dy * back - dx * side);
    }, span.lo, span.hi);
    return { light, deep };
  });
  strokeParts(ctx, parts, "light", p.light, girth * 0.17);
  strokeParts(ctx, parts, "deep", p.deep, girth * 0.17);
}

function rope(ctx, track, look) {
  const k = look.k;
  const girth = 8 * k;
  const pitch = 4.4 * k;
  const p = paletteFor("rope", look.colour, (c) => {
    const base = mix(HEMP, c, 0.2);
    return {
      edge: css(mix(base, BLACK, 0.6)),
      base: css(base),
      groove: css(mix(base, BLACK, 0.5)),
      light: css(mix(base, WHITE, 0.38)),
    };
  });
  const line = lineOf(track);
  ctx.lineCap = "round";
  halo(ctx, track, look, girth + 5 * k);
  stroke(ctx, line, p.edge, girth + 1.6 * k);
  stroke(ctx, line, p.base, girth);
  if (!fine(look, pitch)) return;
  const plan = memo(track, `rope:${k}`, () => ({ spans: spansOf(track, girth) }));
  const side = girth * 0.47;
  const lean = girth * 0.32;
  const parts = shownParts(plan, look, (span) => {
    const grooves = new Path2D();
    const lights = new Path2D();
    walk(track, pitch * 0.5, pitch, (x, y, dx, dy) => {
      grooves.moveTo(x - dx * lean - dy * side, y - dy * lean + dx * side);
      grooves.lineTo(x + dx * lean + dy * side, y + dy * lean - dx * side);
      const cx = x + dx * pitch * 0.42;
      const cy = y + dy * pitch * 0.42;
      const short = side * 0.55;
      const tilt = lean * 0.55;
      lights.moveTo(cx - dx * tilt - dy * short, cy - dy * tilt + dx * short);
      lights.lineTo(cx + dx * tilt + dy * short, cy + dy * tilt - dx * short);
    }, span.lo, span.hi);
    return { grooves, lights };
  });
  strokeParts(ctx, parts, "grooves", p.groove, girth * 0.13);
  strokeParts(ctx, parts, "lights", p.light, girth * 0.14);
}

function beads(ctx, track, look) {
  const k = look.k;
  const radius = 3.3 * k;
  const pitch = radius * 2.45;
  const p = paletteFor("beads", look.colour, (c) => ({
    thread: css(mix(c, BLACK, 0.45)),
    body: css(c),
    edge: css(mix(c, BLACK, 0.55)),
  }));
  const line = lineOf(track);
  ctx.lineCap = "round";
  stroke(ctx, line, p.thread, 1.3 * k);
  if (!fine(look, radius)) {
    stroke(ctx, line, p.body, 2.4 * k);
    return;
  }
  const plan = memo(track, `beads:${k}`, () => {
    const count = Math.max(1, Math.floor((track.length - radius * 2) / pitch) + 1);
    return { count, start: (track.length - (count - 1) * pitch) / 2, spans: spansOf(track, radius * 2) };
  });
  const parts = shownParts(plan, look, (span) => {
    const balls = new Path2D();
    const shine = new Path2D();
    walk(track, plan.start, pitch, (x, y, dx, dy, s, i) => {
      if (i >= plan.count) return;
      balls.moveTo(x + radius, y);
      balls.arc(x, y, radius, 0, TAU);
      const sx = x - radius * 0.34;
      const sy = y - radius * 0.36;
      const glint = radius * 0.34;
      shine.moveTo(sx + glint, sy);
      shine.arc(sx, sy, glint, 0, TAU);
    }, span.lo, span.hi);
    return { balls, shine };
  });
  fillParts(ctx, parts, "balls", p.body);
  strokeParts(ctx, parts, "balls", p.edge, 0.9 * k);
  fillParts(ctx, parts, "shine", "rgba(255,255,255,0.6)");
}

function bolt(track, k, seed, beat, reach) {
  const path = new Path2D();
  const step = 9 * k;
  const length = track.length;
  walk(track, 0, step, (x, y, dx, dy, s, i) => {
    const taper = Math.sin(Math.PI * Math.min(1, s / length));
    const jolt = (noise(seed, beat, i) * 2 - 1) * reach * taper;
    const px = x - dy * jolt;
    const py = y + dx * jolt;
    if (i) path.lineTo(px, py);
    else path.moveTo(px, py);
  });
  const end = pointAt(track, length);
  path.lineTo(end.x, end.y);
  return path;
}

function arc(ctx, track, look) {
  const k = look.k;
  const p = paletteFor("arc", look.colour, (c) => ({
    base: css(c, 0.35),
    glow: css(c, 0.26),
    bolt: css(mix(c, WHITE, 0.35)),
    core: css(mix(c, WHITE, 0.9)),
    branch: css(mix(c, WHITE, 0.15), 0.7),
  }));
  const line = lineOf(track);
  ctx.lineCap = "round";
  stroke(ctx, line, p.base, 1.4 * k);
  if (!fine(look, 5.5 * k)) {
    stroke(ctx, line, p.bolt, 2 * k);
    return;
  }
  const beat = look.moving ? Math.floor(look.time * 14) : 0;
  const key = `arc:${k}`;
  let made = track.memo.get(key);
  if (!made || made.beat !== beat) {
    made = {
      beat,
      main: bolt(track, k, look.seed, beat, 5.5 * k),
      side: bolt(track, k, look.seed + 7919, beat, 3.5 * k),
    };
    track.memo.set(key, made);
  }
  stroke(ctx, made.main, p.glow, 7 * k);
  stroke(ctx, made.side, p.branch, 1.2 * k);
  stroke(ctx, made.main, p.bolt, 2.2 * k);
  stroke(ctx, made.main, p.core, 0.9 * k);
}

const PAINTERS = { energy, dashes, chain, rust, pipes, cord, rope, beads, arc };

const GIRTH = { energy: 5.5, dashes: 5, chain: 8.5, rust: 8.5, pipes: 12.4, cord: 8.1, rope: 9.6,
                beads: 7.4, arc: 5 };

export function paints(style) {
  return typeof PAINTERS[style] === "function";
}

export function paintNoodle(ctx, style, track, look) {
  const painter = PAINTERS[style];
  if (!painter) return false;
  ctx.lineJoin = "round";
  painter(ctx, track, look);
  return true;
}

export function girthOf(style, k) {
  return (GIRTH[style] || 0) * k;
}

export function paintMarker(ctx, at, angle, shape, colour) {
  ctx.beginPath();
  if (shape === 2 && Number.isFinite(angle)) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const point = (x, y) => [at[0] + x * cos - y * sin, at[1] + x * sin + y * cos];
    ctx.moveTo(...point(-3.2, -5));
    ctx.lineTo(...point(7, 0));
    ctx.lineTo(...point(-3.2, 5));
    ctx.closePath();
  } else {
    ctx.arc(at[0], at[1], 5, 0, TAU);
  }
  ctx.fillStyle = colour;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(0,0,0,0.6)";
  ctx.stroke();
}
