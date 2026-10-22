import {
  GAP, MARGIN, comboPointer, commit, contains, drawCombo, gesture, link, local, output, rowHeight,
  theme, undoable,
} from "./kit.mjs";

const INTERPOLATIONS = ["monotone_cubic", "linear"];

const LABELS = ["Smooth", "Linear"];

const SEGMENTS = 128;

const PAD = 0.04;

const HIT = 0.04;

const MIN_PLOT = 120;

const grid = buildGrid();

function buildGrid() {
  const lines = new Path2D();
  for (const at of [0.25, 0.5, 0.75]) {
    lines.moveTo(0, at);
    lines.lineTo(1, at);
    lines.moveTo(at, 0);
    lines.lineTo(at, 1);
  }
  const diagonal = new Path2D();
  diagonal.moveTo(0, 1);
  diagonal.lineTo(1, 0);
  return { lines, diagonal };
}

function isCurve(value) {
  return !!value && typeof value === "object" && !Array.isArray(value)
    && Array.isArray(value.points)
    && value.points.every((point) => Array.isArray(point) && point.length === 2
      && typeof point[0] === "number" && typeof point[1] === "number")
    && INTERPOLATIONS.includes(value.interpolation);
}

function sorted(points) {
  return points.slice().sort((a, b) => a[0] - b[0]);
}

function monotone(points) {
  const count = points.length;
  const xs = new Float64Array(count);
  const ys = new Float64Array(count);
  for (let index = 0; index < count; index += 1) {
    xs[index] = points[index][0];
    ys[index] = points[index][1];
  }
  const secants = new Float64Array(Math.max(0, count - 1));
  for (let index = 0; index < count - 1; index += 1) {
    const run = xs[index + 1] - xs[index];
    secants[index] = run === 0 ? 0 : (ys[index + 1] - ys[index]) / run;
  }
  const tangents = new Float64Array(count);
  tangents[0] = count > 1 ? secants[0] : 0;
  tangents[count - 1] = count > 1 ? secants[count - 2] : 0;
  for (let index = 1; index < count - 1; index += 1) {
    const before = secants[index - 1];
    const after = secants[index];
    tangents[index] = before * after <= 0 ? 0 : (before + after) / 2;
  }
  for (let index = 0; index < count - 1; index += 1) {
    const secant = secants[index];
    if (secant === 0) {
      tangents[index] = 0;
      tangents[index + 1] = 0;
      continue;
    }
    const a = tangents[index] / secant;
    const b = tangents[index + 1] / secant;
    const length = a * a + b * b;
    if (length > 9) {
      const scale = 3 / Math.sqrt(length);
      tangents[index] = scale * a * secant;
      tangents[index + 1] = scale * b * secant;
    }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[count - 1]) return ys[count - 1];
    let low = 0;
    let high = count - 1;
    while (high - low > 1) {
      const middle = (low + high) >> 1;
      if (xs[middle] <= x) low = middle;
      else high = middle;
    }
    const run = xs[high] - xs[low];
    if (run === 0) return ys[low];
    const t = (x - xs[low]) / run;
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[low] + (t3 - 2 * t2 + t) * run * tangents[low]
      + (-2 * t3 + 3 * t2) * ys[high] + (t3 - t2) * run * tangents[high];
  };
}

function curvePath(points, interpolation) {
  const path = new Path2D();
  if (points.length < 2) return path;
  if (interpolation === "linear") {
    path.moveTo(points[0][0], 1 - points[0][1]);
    for (let index = 1; index < points.length; index += 1) path.lineTo(points[index][0], 1 - points[index][1]);
    return path;
  }
  const evaluate = monotone(points);
  const start = points[0][0];
  const range = points[points.length - 1][0] - start;
  for (let step = 0; step <= SEGMENTS; step += 1) {
    const x = start + range * (step / SEGMENTS);
    if (step === 0) path.moveTo(x, 1 - evaluate(x));
    else path.lineTo(x, 1 - evaluate(x));
  }
  return path;
}

function dotsPath(points) {
  const path = new Path2D();
  for (const [x, y] of points) {
    path.moveTo(x + 0.02, 1 - y);
    path.arc(x, 1 - y, 0.02, 0, Math.PI * 2);
  }
  return path;
}

function histogramPath(bins) {
  const count = bins.length;
  const roots = new Float64Array(count);
  for (let index = 0; index < count; index += 1) roots[index] = Math.sqrt(Math.max(0, Number(bins[index]) || 0));
  const ranked = Float64Array.from(roots).sort();
  const peak = ranked[Math.floor((count - 1) * 0.995)];
  if (!(peak > 0)) return null;
  const path = new Path2D();
  path.moveTo(0, 1);
  const last = count - 1;
  for (let index = 0; index < count; index += 1) {
    path.lineTo(last === 0 ? 0.5 : index / last, 1 - Math.min(1, roots[index] / peak));
  }
  path.lineTo(1, 1);
  path.closePath();
  return path;
}

function make(widget) {
  const plot = { x: 0, y: 0, size: 0, scale: 0, originX: 0, originY: 0 };
  const header = { x: 0, y: 0, w: 0, h: 0 };
  let shapes = { value: null, points: null, curve: null, dots: null };
  let bars = { bins: null, path: null };
  let upstream = null;

  function current() {
    return isCurve(widget.value) ? widget.value : null;
  }

  function shapesFor(value) {
    if (shapes.value === value) return shapes;
    const points = sorted(value.points);
    shapes = { value, points, curve: curvePath(points, value.interpolation), dots: dotsPath(points) };
    return shapes;
  }

  function barsFor(node) {
    const bins = output(node)?.histogram;
    if (!Array.isArray(bins) || !bins.length) return null;
    if (bars.bins !== bins) bars = { bins, path: histogramPath(bins) };
    return bars.path;
  }

  function layout(width, y, height, disabled) {
    const row = rowHeight();
    header.x = MARGIN;
    header.y = y;
    header.w = width - MARGIN * 2;
    header.h = disabled ? 0 : row;
    const top = disabled ? y : y + row + GAP;
    const size = Math.max(0, Math.min(width - MARGIN * 2, y + height - top));
    plot.size = size;
    plot.x = (width - size) / 2;
    plot.y = top;
    plot.scale = size / (1 + PAD * 2);
    plot.originX = plot.x + PAD * plot.scale;
    plot.originY = plot.y + PAD * plot.scale;
  }

  function toUnit(px, py) {
    return [
      Math.max(0, Math.min(1, (px - plot.originX) / plot.scale)),
      Math.max(0, Math.min(1, 1 - (py - plot.originY) / plot.scale)),
    ];
  }

  function nearest(points, x, y) {
    let found = -1;
    let best = HIT * HIT;
    for (let index = 0; index < points.length; index += 1) {
      const dx = points[index][0] - x;
      const dy = points[index][1] - y;
      const distance = dx * dx + dy * dy;
      if (distance < best) {
        best = distance;
        found = index;
      }
    }
    return found;
  }

  function insidePlot(px, py) {
    return plot.size > 0 && contains(plot.x, plot.y, plot.size, plot.size, px, py);
  }

  function remove(node, value, index) {
    if (value.points.length <= 2) return;
    const points = value.points.slice();
    points.splice(index, 1);
    undoable(() => commit(node, widget, { ...value, points }));
  }

  return {
    minSize(node) {
      const disabled = !!widget.computedDisabled;
      const side = Math.max(MIN_PLOT, node.size[0] - MARGIN * 2);
      return { minHeight: (disabled ? 0 : rowHeight() + GAP) + side, minWidth: MIN_PLOT };
    },

    draw(ctx, node, width, y, height, low) {
      const value = current();
      const disabled = !!widget.computedDisabled;
      layout(width, y, height, disabled);
      const colours = theme();
      if (!disabled && header.h) {
        const index = value ? INTERPOLATIONS.indexOf(value.interpolation) : 0;
        drawCombo(ctx, header.x, header.y, header.w, header.h, widget.label || widget.name,
          LABELS[Math.max(0, index)], low, null);
      }
      if (plot.size <= 0) return;
      ctx.fillStyle = colours.bg;
      ctx.beginPath();
      ctx.roundRect(plot.x, plot.y, plot.size, plot.size, low ? 0 : 5);
      ctx.fill();
      const saved = ctx.globalAlpha;
      ctx.save();
      ctx.translate(plot.originX, plot.originY);
      ctx.scale(plot.scale, plot.scale);
      if (!low) {
        ctx.lineWidth = 0.003;
        ctx.strokeStyle = colours.text;
        ctx.globalAlpha = saved * 0.1;
        ctx.stroke(grid.lines);
        ctx.globalAlpha = saved * 0.15;
        ctx.stroke(grid.diagonal);
        const bins = barsFor(node);
        if (bins) {
          ctx.fillStyle = "#ffffff";
          ctx.fill(bins);
        }
      }
      if (value) {
        const { curve, dots } = shapesFor(value);
        ctx.globalAlpha = saved * (disabled ? 0.5 : 1);
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 0.008;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke(curve);
        if (!disabled && !low) {
          ctx.globalAlpha = saved;
          ctx.fillStyle = "#ffffff";
          ctx.fill(dots);
          ctx.lineWidth = 0.004;
          ctx.stroke(dots);
        }
      }
      ctx.restore();
    },

    pointerDown(pointer, node) {
      if (widget.computedDisabled) return false;
      const value = current();
      if (!value) return false;
      const [px, py] = local(pointer.eDown, node);
      if (header.h && contains(header.x, header.y, header.w, header.h, px, py)) {
        return comboPointer(pointer, node, header.x, header.y, header.w, header.h, {
          items: LABELS,
          index: Math.max(0, INTERPOLATIONS.indexOf(value.interpolation)),
          choose: (index) => {
            const now = current();
            if (now && now.interpolation !== INTERPOLATIONS[index]) {
              commit(node, widget, { ...now, interpolation: INTERPOLATIONS[index] });
            }
          },
        });
      }
      if (!insidePlot(px, py)) return false;
      const [x, y] = toUnit(px, py);
      const hit = nearest(value.points, x, y);
      const ctrl = !!pointer.eDown.ctrlKey;
      pointer.onClick = () => {};
      if (hit >= 0 && ctrl) {
        remove(node, value, hit);
        return true;
      }
      if (hit < 0 && ctrl) return true;
      gesture(pointer);
      let dragged;
      let points;
      if (hit >= 0) {
        points = value.points.slice();
        dragged = points[hit];
      } else {
        dragged = [x, y];
        points = sorted([...value.points, dragged]);
        commit(node, widget, { ...value, points });
      }
      pointer.onDrag = (event) => {
        const [lx, ly] = local(event, node);
        const moved = toUnit(lx, ly);
        const at = points.indexOf(dragged);
        if (at < 0) return;
        points = points.slice();
        points[at] = moved;
        points.sort((a, b) => a[0] - b[0]);
        dragged = moved;
        const now = current() || value;
        commit(node, widget, { ...now, points });
      };
      return true;
    },

    contextMenu(_event, node, point) {
      if (!insidePlot(point[0], point[1])) return false;
      const value = current();
      if (!value || widget.computedDisabled) return true;
      const [x, y] = toUnit(point[0], point[1]);
      const hit = nearest(value.points, x, y);
      if (hit >= 0) remove(node, value, hit);
      return true;
    },

    linked(node) {
      const edge = link(node, widget.name);
      if (!edge) return;
      const name = edge.node.outputs?.[edge.slot]?.name;
      let found;
      let only;
      let count = 0;
      for (const one of edge.node.widgets || []) {
        if (!isCurve(one.value)) continue;
        if (name && one.name === name) {
          found = one.value;
          break;
        }
        count += 1;
        only = one.value;
      }
      if (!found && count === 1) found = only;
      if (!found || found === upstream) return;
      upstream = found;
      if (widget.value !== found) commit(node, widget, found);
    },
  };
}

export { make };
