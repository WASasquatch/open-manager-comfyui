import { perlin } from "./noise.mjs";
import { lineOf, pointAt } from "./track.mjs";

const FADE = 90;
const FADE_STEPS = 4;
const DRIFT_STEP = 40;
const DRIFT_SCALE = 340;
const DRIFT_SPEED = 0.12;
const DRIFT_FLOOR = 0.05;
const DRIFT_RANGE = 0.35;
const DRIFT_PEAK = 0.6;
const FLICKER_SCALE = 80;
const FLICKER_SPEED = 1.3;
const FLICKER = 0.25;
const UNSEEN = 0.01;
const FLAT = 0.01;
const OFF_VERTEX = 0.05;
const MIST = [205, 230, 255];

const ghost = {
  layer: null,
  paint: null,
  mask: null,
  veil: null,
  target: null,
  used: false,
};

function canvasOf(width, height) {
  const made = document.createElement("canvas");
  made.width = width;
  made.height = height;
  return made;
}

function sized(width, height) {
  if (!ghost.layer) {
    ghost.layer = canvasOf(width, height);
    ghost.paint = ghost.layer.getContext("2d");
    ghost.mask = canvasOf(width, height);
    ghost.veil = ghost.mask.getContext("2d");
  }
  for (const made of [ghost.layer, ghost.mask]) {
    if (made.width !== width) made.width = width;
    if (made.height !== height) made.height = height;
  }
}

export function ghostBegin(ctx) {
  const target = ctx?.canvas;
  if (!target?.width || !target?.height || typeof ctx.getTransform !== "function") return false;
  sized(target.width, target.height);
  const { paint, veil } = ghost;
  for (const one of [paint, veil]) {
    one.setTransform(1, 0, 0, 1, 0, 0);
    one.globalCompositeOperation = "source-over";
    one.globalAlpha = 1;
    one.clearRect(0, 0, target.width, target.height);
    one.setTransform(ctx.getTransform());
  }
  veil.globalCompositeOperation = "lighter";
  veil.lineCap = "butt";
  veil.lineJoin = "round";
  ghost.target = ctx;
  ghost.used = false;
  return true;
}

export function ghostLayer(ctx) {
  return ghost.target && ghost.target === ctx ? ghost.paint : null;
}

export function ghostAura(ctx, track, rgb, girth) {
  const tint = [0, 1, 2].map((i) => Math.round(rgb[i] + (MIST[i] - rgb[i]) * 0.55));
  const line = lineOf(track);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = `rgba(${tint[0]},${tint[1]},${tint[2]},0.1)`;
  ctx.lineWidth = girth * 2 + 18;
  ctx.stroke(line);
  ctx.strokeStyle = `rgba(${tint[0]},${tint[1]},${tint[2]},0.18)`;
  ctx.lineWidth = girth + 7;
  ctx.stroke(line);
}

function fade(distance) {
  if (distance >= FADE) return 0;
  const t = distance / FADE;
  return 1 - t * t * (3 - 2 * t);
}

function drift(x, y, time) {
  const value = perlin(x / DRIFT_SCALE, y / DRIFT_SCALE, time * DRIFT_SPEED);
  const rise = Math.max(0, Math.min(1, (value - DRIFT_FLOOR) / DRIFT_RANGE));
  return rise * rise * (3 - 2 * rise) * DRIFT_PEAK;
}

function flicker(x, y, time) {
  return 1 - FLICKER + FLICKER * (0.5 + 0.5 * perlin(x / FLICKER_SCALE, y / FLICKER_SCALE, time * FLICKER_SPEED));
}

function stops(track, opens, closes) {
  const length = track.length;
  const marks = [0, length];
  for (let i = 1; i <= FADE_STEPS; i += 1) {
    const reach = Math.min(length, (FADE * i) / FADE_STEPS);
    if (opens) marks.push(reach);
    if (closes) marks.push(length - reach);
  }
  for (let s = DRIFT_STEP; s < length; s += DRIFT_STEP) marks.push(s);
  marks.sort((p, q) => p - q);
  const { at, n } = track;
  const kept = [];
  let i = 1;
  for (const mark of marks) {
    let s = Math.max(0, Math.min(length, mark));
    if (kept.length && s - kept[kept.length - 1] < OFF_VERTEX * 2) continue;
    while (i < n - 1 && at[i] < s) i += 1;
    const onVertex = Math.abs(at[i] - s) < OFF_VERTEX || Math.abs(at[i - 1] - s) < OFF_VERTEX;
    if (s > 0 && s < length && onVertex) s = Math.min(length, s + OFF_VERTEX * 2);
    kept.push(s);
  }
  if (kept[kept.length - 1] < length) kept.push(length);
  return kept;
}

function piece(track, from, to) {
  const path = new Path2D();
  const start = pointAt(track, from);
  path.moveTo(start.x, start.y);
  const { at, xs, ys, n } = track;
  for (let i = 0; i < n; i += 1) {
    if (at[i] <= from) continue;
    if (at[i] >= to) break;
    path.lineTo(xs[i], ys[i]);
  }
  const end = pointAt(track, to);
  path.lineTo(end.x, end.y);
  return { path, start, end };
}

export function ghostNote(track, opens, closes, lit, width, time) {
  ghost.used = true;
  const veil = ghost.veil;
  veil.lineWidth = width;
  if (lit) {
    veil.strokeStyle = "#000";
    veil.stroke(lineOf(track));
    return;
  }
  const marks = stops(track, opens, closes);
  const length = track.length;
  const alphas = marks.map((s) => {
    const at = pointAt(track, s);
    const ends = Math.max(opens ? fade(s) : 0, closes ? fade(length - s) : 0);
    return Math.min(1, Math.max(ends, drift(at.x, at.y, time)) * flicker(at.x, at.y, time));
  });
  for (let i = 1; i < marks.length; i += 1) {
    const before = alphas[i - 1];
    const after = alphas[i];
    if (before < UNSEEN && after < UNSEEN) continue;
    const { path, start, end } = piece(track, marks[i - 1], marks[i]);
    if (Math.abs(before - after) < FLAT) {
      veil.strokeStyle = `rgba(0,0,0,${(before + after) / 2})`;
    } else {
      const ramp = veil.createLinearGradient(start.x, start.y, end.x, end.y);
      ramp.addColorStop(0, `rgba(0,0,0,${before})`);
      ramp.addColorStop(1, `rgba(0,0,0,${after})`);
      veil.strokeStyle = ramp;
    }
    veil.stroke(path);
  }
}

export function ghostFlush(ctx) {
  const target = ghost.target;
  ghost.target = null;
  if (!ghost.used || target !== ctx) return;
  const { paint, layer, mask } = ghost;
  paint.save();
  paint.setTransform(1, 0, 0, 1, 0, 0);
  paint.globalAlpha = 1;
  paint.globalCompositeOperation = "destination-in";
  paint.drawImage(mask, 0, 0);
  paint.restore();
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.drawImage(layer, 0, 0);
  ctx.restore();
}
