const LEFT = 1;

const RIGHT = 2;

const TOP = 4;

const BOTTOM = 8;

const MOVES = {
  draw: RIGHT | BOTTOM,
  nw: LEFT | TOP,
  ne: RIGHT | TOP,
  sw: LEFT | BOTTOM,
  se: RIGHT | BOTTOM,
  n: TOP,
  s: BOTTOM,
  w: LEFT,
  e: RIGHT,
};

const SNAPS = {
  draw: LEFT | RIGHT | TOP | BOTTOM,
  nw: LEFT | TOP,
  ne: RIGHT | TOP,
  sw: LEFT | BOTTOM,
  se: RIGHT | BOTTOM,
  n: TOP,
  s: BOTTOM,
  w: LEFT,
  e: RIGHT,
};

const GRID_CELL = 32;

const GRID_CELLS = 64;

const TAG_HEIGHT = 14;

const TAG_PAD = 8;

const GREY = "#8c8c8c";

function unit(value) {
  return Math.max(0, Math.min(1, value));
}

function region(x, y, w, h, type, text, desc, palette) {
  return {
    x, y, w, h, type, text, desc, palette,
    paletteRef: null, pal: null, col: GREY, fillLow: "", fillHigh: "", ink: "", tagInk: "",
    bodyType: "", bodyText: null, bodyDesc: null, bodyWidth: -1, lines: null,
    tagX: 0, tagY: 0, tagW: 0, clip: false,
  };
}

function blank(x, y) {
  return region(x, y, 0, 0, "obj", "", "", []);
}

function isBox(box) {
  return !!box && typeof box === "object" && typeof box.x === "number" && typeof box.y === "number"
    && typeof box.width === "number" && typeof box.height === "number";
}

function hexColour(colour) {
  if (typeof colour !== "string") return null;
  const hex = colour.trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(hex)) return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  return /^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/.test(hex) ? hex : null;
}

function paletteOf(palette) {
  const out = [];
  if (!Array.isArray(palette)) return out;
  for (const colour of palette) {
    const hex = hexColour(colour);
    if (hex !== null) out.push(hex);
  }
  return out;
}

function fromBoxes(boxes, width, height) {
  const w = width || 1;
  const h = height || 1;
  const out = [];
  if (!Array.isArray(boxes)) return out;
  for (const box of boxes) {
    if (!isBox(box)) continue;
    const meta = box.metadata && typeof box.metadata === "object" ? box.metadata : {};
    out.push(region(box.x / w, box.y / h, box.width / w, box.height / h,
      meta.type === "text" ? "text" : "obj",
      typeof meta.text === "string" ? meta.text : "",
      typeof meta.desc === "string" ? meta.desc : "",
      paletteOf(meta.palette)));
  }
  return out;
}

function toBoxes(regions, width, height) {
  const out = new Array(regions.length);
  for (let index = 0; index < regions.length; index += 1) {
    const one = regions[index];
    out[index] = {
      x: Math.round(one.x * width),
      y: Math.round(one.y * height),
      width: Math.round(one.w * width),
      height: Math.round(one.h * height),
      metadata: { type: one.type, text: one.text, desc: one.desc, palette: one.palette.slice() },
    };
  }
  return out;
}

function gridStep(size) {
  return Math.max(GRID_CELL, Math.ceil(size / GRID_CELLS)) / size;
}

function snapTo(value, step) {
  return step > 0 ? unit(Math.round(value / step) * step) : value;
}

function dragRegion(mode, start, dx, dy, out) {
  if (mode === "move") {
    out.x = unit(Math.min(start.x + dx, 1 - start.w));
    out.y = unit(Math.min(start.y + dy, 1 - start.h));
    out.w = start.w;
    out.h = start.h;
    return out;
  }
  const edges = MOVES[mode] || 0;
  let { x, y, w, h } = start;
  if (edges & LEFT) {
    x += dx;
    w -= dx;
  }
  if (edges & RIGHT) w += dx;
  if (edges & TOP) {
    y += dy;
    h -= dy;
  }
  if (edges & BOTTOM) h += dy;
  if (w < 0) {
    x += w;
    w = -w;
  }
  if (h < 0) {
    y += h;
    h = -h;
  }
  x = unit(x);
  y = unit(y);
  out.x = x;
  out.y = y;
  out.w = Math.max(0, Math.min(w, 1 - x));
  out.h = Math.max(0, Math.min(h, 1 - y));
  return out;
}

function snapRegion(box, mode, fx, fy) {
  if (mode === "move") {
    box.x = Math.min(snapTo(box.x, fx), 1 - box.w);
    box.y = Math.min(snapTo(box.y, fy), 1 - box.h);
    return box;
  }
  const edges = SNAPS[mode] || 0;
  const left = edges & LEFT ? snapTo(box.x, fx) : box.x;
  const top = edges & TOP ? snapTo(box.y, fy) : box.y;
  const right = edges & RIGHT ? snapTo(box.x + box.w, fx) : box.x + box.w;
  const bottom = edges & BOTTOM ? snapTo(box.y + box.h, fy) : box.y + box.h;
  box.x = left;
  box.y = top;
  box.w = Math.max(0, right - left);
  box.h = Math.max(0, bottom - top);
  return box;
}

function hitMode(px, py, left, top, right, bottom, rx, ry) {
  const nearLeft = Math.abs(px - left) < rx;
  const nearRight = Math.abs(px - right) < rx;
  const nearTop = Math.abs(py - top) < ry;
  const nearBottom = Math.abs(py - bottom) < ry;
  if (nearTop && nearLeft) return "nw";
  if (nearTop && nearRight) return "ne";
  if (nearBottom && nearLeft) return "sw";
  if (nearBottom && nearRight) return "se";
  const across = px >= left && px <= right;
  const down = py >= top && py <= bottom;
  if (across && nearTop) return "n";
  if (across && nearBottom) return "s";
  if (down && nearLeft) return "w";
  if (down && nearRight) return "e";
  return across && down ? "move" : null;
}

function candidates() {
  return { count: 0, index: [], mode: [] };
}

function regionsUnder(regions, px, py, rx, ry, active, found) {
  let count = 0;
  let activeAt = -1;
  for (let index = 0; index < regions.length; index += 1) {
    const one = regions[index];
    const mode = hitMode(px, py, one.x, one.y, one.x + one.w, one.y + one.h, rx, ry);
    if (!mode) continue;
    if (index === active) activeAt = count;
    found.index[count] = index;
    found.mode[count] = mode;
    count += 1;
  }
  if (activeAt > 0) {
    const mode = found.mode[activeAt];
    for (let at = activeAt; at > 0; at -= 1) {
      found.index[at] = found.index[at - 1];
      found.mode[at] = found.mode[at - 1];
    }
    found.index[0] = active;
    found.mode[0] = mode;
  }
  found.count = count;
  return count;
}

function resizing(found, active) {
  for (let at = 0; at < found.count; at += 1) {
    if (found.index[at] === active && found.mode[at] !== "move") return at;
  }
  return -1;
}

function choose(out, index, mode) {
  out.index = index;
  out.mode = mode;
  return out;
}

function pickBox(regions, px, py, rx, ry, active, cycle, tag, found, out) {
  if (!regionsUnder(regions, px, py, rx, ry, active, found)) return null;
  const edge = resizing(found, active);
  if (!cycle) {
    if (edge >= 0) return choose(out, found.index[edge], found.mode[edge]);
    if (tag >= 0) return choose(out, tag, "move");
  } else if (found.count > 1) {
    let at = 0;
    while (at < found.count && found.index[at] !== active) at += 1;
    const next = at < found.count ? (at + 1) % found.count : 0;
    return choose(out, found.index[next], found.mode[next]);
  }
  const at = edge >= 0 ? edge : 0;
  return choose(out, found.index[at], found.mode[at]);
}

function hoverBox(regions, px, py, rx, ry, active, tag, found) {
  if (tag >= 0) return tag;
  if (!regionsUnder(regions, px, py, rx, ry, active, found)) return -1;
  const edge = resizing(found, active);
  return found.index[edge >= 0 ? edge : 0];
}

function overlaps(regions, count, x, y, w) {
  for (let index = 0; index < count; index += 1) {
    const other = regions[index];
    if (x < other.tagX + other.tagW && x + w > other.tagX && y < other.tagY + TAG_HEIGHT
      && y + TAG_HEIGHT > other.tagY) return true;
  }
  return false;
}

function placeTags(regions, width, height, tagWidth) {
  for (let index = 0; index < regions.length; index += 1) {
    const one = regions[index];
    const left = one.x * width;
    const top = one.y * height;
    const right = (one.x + one.w) * width;
    const bottom = (one.y + one.h) * height;
    const w = tagWidth(index) + TAG_PAD;
    let x = left;
    let y = top;
    if (overlaps(regions, index, left, top, w)) {
      if (!overlaps(regions, index, right - w, top, w)) {
        x = right - w;
      } else if (!overlaps(regions, index, right - w, bottom - TAG_HEIGHT, w)) {
        x = right - w;
        y = bottom - TAG_HEIGHT;
      } else if (!overlaps(regions, index, left, bottom - TAG_HEIGHT, w)) {
        y = bottom - TAG_HEIGHT;
      }
    }
    one.tagX = x;
    one.tagY = y;
    one.tagW = w;
  }
}

function tagAt(regions, px, py) {
  for (let index = regions.length - 1; index >= 0; index -= 1) {
    const one = regions[index];
    if (px >= one.tagX && px <= one.tagX + one.tagW && py >= one.tagY && py <= one.tagY + TAG_HEIGHT) {
      return index;
    }
  }
  return -1;
}

function rgbOf(hex) {
  const long = hex.length === 7 || hex.length === 9;
  const short = hex.length === 4 || hex.length === 5;
  if (!long && !short) return [0, 0, 0];
  const channel = (at) => (long ? parseInt(hex.slice(1 + at * 2, 3 + at * 2), 16)
    : parseInt(hex[1 + at] + hex[1 + at], 16));
  return [channel(0), channel(1), channel(2)];
}

function brightness(rgb) {
  return 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
}

function readable(hex) {
  const rgb = rgbOf(hex);
  const level = brightness(rgb);
  if (level < 130) {
    const lift = (130 - level) / (255 - level);
    for (let at = 0; at < 3; at += 1) rgb[at] = Math.round(rgb[at] + (255 - rgb[at]) * lift);
  }
  return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
}

function onColour(hex) {
  return brightness(rgbOf(hex)) > 140 ? "#000" : "#fff";
}

function wrapLines(ctx, text, maxWidth) {
  const lines = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      if (!word) continue;
      const longer = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(longer).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = longer;
      }
    }
    lines.push(line);
  }
  return lines;
}

function same(a, b) {
  if (a === b) return true;
  if (typeof a === "number" && typeof b === "number") return a !== a && b !== b;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  const list = Array.isArray(a);
  if (list !== Array.isArray(b)) return false;
  if (list) {
    if (a.length !== b.length) return false;
    for (let index = 0; index < a.length; index += 1) {
      if (!same(a[index], b[index])) return false;
    }
    return true;
  }
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(b, key) || !same(a[key], b[key])) return false;
  }
  return true;
}

function copy(value) {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(copy);
  const out = {};
  for (const key of Object.keys(value)) out[key] = copy(value[key]);
  return out;
}

export {
  TAG_HEIGHT, unit, region, blank, isBox, fromBoxes, toBoxes, gridStep, dragRegion, snapRegion,
  candidates, regionsUnder, pickBox, hoverBox, placeTags, tagAt, readable, onColour, wrapLines, same, copy,
};
