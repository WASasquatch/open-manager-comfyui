import { app } from "../../../../../../scripts/app.js";
import {
  GAP, MARGIN, button, commit, contain, contains, drawField, drawSegments, font, hoverPoint, image, imageFailed,
  locator, measure, menu, prompt, redraw, rowHeight, rowText, segmentAt, source, swatchRow, theme, undoable,
  viewUrl,
} from "./kit.mjs";
import {
  TAG_HEIGHT, dragRegion, blank, regionsUnder, candidates, unit, copy, fromBoxes, gridStep, hoverBox, isBox,
  onColour, pickBox, placeTags, readable, same, snapRegion, tagAt, toBoxes, wrapLines,
} from "./bounding-boxes-geometry.mjs";

const MAX_COLOURS = 5;

const HANDLE = 8;

const DIMENSION_STEP = 16;

const DEFAULT_SIZE = 1024;

const TINY = 0.005;

const CANVAS_MIN = 128;

const BUTTON_PAD = 24;

const LABEL_GAP = 8;

const LABEL_GUESS = 80;

const STRIPE = 7;

const DIM = "rgba(0,0,0,0.75)";

const BACKDROP = "rgba(26,26,26,0.88)";

const TAG_HOVER = "rgba(255,255,255,0.25)";

const TAG_FONT = "bold 11px monospace";

const BODY_FONT = "12px monospace";

const BODY_PAD = 4;

const BODY_TOP = 27;

const BODY_LINE = 14;

const DOT_ALPHA = 0.18;

const DOT_RADIUS = 1;

const TILE_MAX = 256;

const EDGE = 0.01;

const TYPES = ["obj", "text"];

const GRID = "Grid";

const CLEAR_ALL = "Clear all";

const TEXT_LABEL = "Text";

const TEXT_PLACEHOLDER = "text to render (verbatim)";

const DESC_LABEL = "description";

const DESC_PLACEHOLDER = "description of this region";

const COLOURS = "color_palette";

const HINT = "Click a region to edit it.";

const DELETE = "Delete";

const UNSET = Symbol("unset");

const NONE = Object.freeze([]);

const tags = [];

const tagWidths = [];

const hiddenByUs = new WeakMap();

const hiddenRefs = new Set();

let measurer = null;

function measuring() {
  if (!measurer) measurer = document.createElement("canvas").getContext("2d");
  return measurer;
}

function tagText(index) {
  if (tags[index] === undefined) tags[index] = String(index + 1).padStart(2, "0");
  return tags[index];
}

function tagWidth(index) {
  if (tagWidths[index] === undefined) {
    const ctx = measuring();
    ctx.font = TAG_FONT;
    tagWidths[index] = ctx.measureText(tagText(index)).width;
  }
  return tagWidths[index];
}

function hideDimension(one, hide) {
  if (!one || one.hidden === hide) return;
  one.hidden = hide;
  const kept = hiddenByUs.get(one);
  if (hide && !kept) {
    const ref = new WeakRef(one);
    hiddenByUs.set(one, ref);
    hiddenRefs.add(ref);
  } else if (!hide && kept) {
    hiddenByUs.delete(one);
    hiddenRefs.delete(kept);
  }
}

function fileUrl(file) {
  if (!file || typeof file !== "object" || typeof file.filename !== "string") return undefined;
  return viewUrl(file) + (app.getRandParam?.() ?? "");
}

function connected(node, slot) {
  return slot >= 0 && !!node.isInputConnected?.(slot);
}

function paint(region) {
  if (region.paletteRef === region.palette) return;
  region.paletteRef = region.palette;
  const pal = [];
  for (const colour of region.palette) {
    if (colour) pal.push(colour);
  }
  const col = pal.length ? pal[0] : "#8c8c8c";
  const base = col.length > 7 ? col.slice(0, 7) : col;
  region.pal = pal;
  region.col = col;
  region.fillLow = `${base}22`;
  region.fillHigh = `${base}3a`;
  region.ink = readable(col);
  region.tagInk = onColour(col);
}

function wrapBody(region, width, ctx) {
  if (region.bodyType === region.type && region.bodyText === region.text && region.bodyDesc === region.desc
    && region.bodyWidth === width) return;
  region.bodyType = region.type;
  region.bodyText = region.text;
  region.bodyDesc = region.desc;
  region.bodyWidth = width;
  let body = region.desc || "";
  if (region.type === "text" && region.text) body = `"${region.text}"${body ? `: ${body}` : ""}`;
  region.lines = body ? wrapLines(ctx, body, width - BODY_PAD * 2) : NONE;
}

function make(widget) {
  const swatches = swatchRow(MAX_COLOURS);
  const sizer = swatchRow(MAX_COLOURS);
  const found = candidates();
  const picked = { index: -1, mode: "" };
  const start = { x: 0, y: 0, w: 0, h: 0 };
  const rect = [0, 0, 0, 0];
  const size = { minHeight: 0, minWidth: 0, maxHeight: undefined };
  const gridState = { active: false, disabled: false };
  const clearState = { active: false, disabled: false };
  const shift = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  const layout = {
    ready: false, width: -1, y: 0, height: -1, dimW: 0, dimH: 0, kind: -1, text: false, count: -1,
    x: 0, w: 0, gridW: 0, clearX: 0, clearW: 0, segY: -1, textY: -1, descY: -1, palY: -1, labelW: 0,
    hintY: -1,
  };

  let regions = [];
  let active = -1;
  let held = UNSET;
  let seen = false;
  let width = DEFAULT_SIZE;
  let height = DEFAULT_SIZE;
  let syncedW = 0;
  let syncedH = 0;
  let grid = true;
  let version = 0;
  let dragging = false;
  let mode = "";
  let target = null;
  let downX = 0;
  let downY = 0;
  let pointX = 0;
  let pointY = 0;
  let focusClick = -1;

  let widgetList = null;
  let widgetCount = -1;
  let widthWidget = null;
  let heightWidget = null;
  let lastWidget = null;

  let dimsHidden;
  let inputList = null;
  let inputCount = -1;
  let backgroundSlot = -1;
  let boxesSlot = -1;

  let ownId;
  let ownGraph;
  let ownLocator = "";

  let backgroundLink;
  let backgroundNode = null;
  let backgroundLocator = "";
  let savedRef;
  let savedSource = null;
  let keySource = null;
  let keyPreviews;
  let keyOutputs;
  let keySaved;
  let keySavedSource = null;
  let resolved;

  let url;
  let loading = false;
  let wasLoading = false;
  let applied = false;
  let shown = null;

  let incomingRaw;
  let incomingConnected = false;
  let incomingValid;
  let incomingRef;
  let pending = false;

  let renderVersion = -1;
  let renderW = -1;
  let renderH = -1;

  let hoverX = NaN;
  let hoverY = NaN;
  let hoverVersion = -1;
  let hoverIndex = -1;
  let hoverTag = -1;

  let tile = null;
  let tileW = 0;
  let tileH = 0;
  let tileK = 0;
  let tileColour = "";
  let pattern = null;
  let patternCtx = null;
  let patternX = NaN;
  let patternY = NaN;
  let patternSx = NaN;
  let patternSy = NaN;

  function changed() {
    version += 1;
  }

  function lookWidgets(node) {
    const list = node.widgets;
    const count = list?.length ?? -1;
    if (list === widgetList && count === widgetCount) return;
    widgetList = list;
    widgetCount = count;
    widthWidget = null;
    heightWidget = null;
    lastWidget = null;
    for (const one of list || NONE) {
      if (!widthWidget && one.name === "width") widthWidget = one;
      else if (!heightWidget && one.name === "height") heightWidget = one;
      else if (!lastWidget && one.name === "last_incoming") lastWidget = one;
    }
  }

  function readDims(node) {
    lookWidgets(node);
    const w = widthWidget?.value;
    const h = heightWidget?.value;
    width = typeof w === "number" && w > 0 ? w : DEFAULT_SIZE;
    height = typeof h === "number" && h > 0 ? h : DEFAULT_SIZE;
  }

  function lookInputs(node) {
    const list = node.inputs;
    const count = list?.length ?? -1;
    if (list === inputList && count === inputCount) return;
    inputList = list;
    inputCount = count;
    backgroundSlot = node.findInputSlot?.("background") ?? -1;
    boxesSlot = node.findInputSlot?.("bboxes") ?? -1;
    backgroundLink = undefined;
  }

  function ownOutputs(node) {
    if (node.id !== ownId || node.graph !== ownGraph) {
      ownId = node.id;
      ownGraph = node.graph;
      ownLocator = locator(node);
    }
    return ownLocator ? app.nodeOutputs?.[ownLocator] : undefined;
  }

  function sync(node) {
    readDims(node);
    commit(node, widget, toBoxes(regions, width, height));
    held = widget.value;
    syncedW = width;
    syncedH = height;
    changed();
  }

  function syncValue(node) {
    const value = widget.value;
    if (value === held || dragging) return;
    readDims(node);
    regions = fromBoxes(value, width, height);
    active = regions.length ? 0 : -1;
    held = value;
    syncedW = width;
    syncedH = height;
    changed();
  }

  function removeAt(index) {
    regions.splice(index, 1);
    if (!regions.length) active = -1;
    else if (index <= active) active = Math.max(0, active - 1);
    changed();
  }

  function setLastIncoming(node, boxes) {
    if (lastWidget) commit(node, lastWidget, copy(boxes));
  }

  function appliedIncoming() {
    const value = lastWidget?.value;
    return Array.isArray(value) && value.every(isBox) ? value : NONE;
  }

  function applyIncoming(node, incoming, apply) {
    if (!incoming || dragging) return;
    const before = appliedIncoming();
    if (same(incoming, before)) return;
    if (!apply) {
      if (!before.length && regions.length) setLastIncoming(node, incoming);
      return;
    }
    readDims(node);
    regions = fromBoxes(incoming, width, height);
    active = regions.length ? 0 : -1;
    setLastIncoming(node, incoming);
    sync(node);
  }

  function incomingNow(node, own) {
    const linked = connected(node, boxesSlot);
    const raw = linked ? own?.input_bboxes : undefined;
    if (raw !== incomingRaw || linked !== incomingConnected) {
      incomingRaw = raw;
      incomingConnected = linked;
      incomingValid = Array.isArray(raw) && raw.length && raw.every(isBox) ? raw : undefined;
    }
    return incomingValid;
  }

  function backgroundSource(node) {
    if (!connected(node, backgroundSlot)) {
      backgroundLink = undefined;
      backgroundNode = null;
      backgroundLocator = "";
      return null;
    }
    const link = node.inputs[backgroundSlot]?.link;
    if (link !== backgroundLink) {
      backgroundLink = link;
      backgroundNode = source(node, "background");
      backgroundLocator = locator(backgroundNode);
    }
    return backgroundNode;
  }

  function backgroundUrl(node, own) {
    const from = backgroundSource(node);
    const saved = own?.background_images;
    if (saved !== savedRef) {
      savedRef = saved;
      savedSource = from;
    }
    const previews = from && backgroundLocator ? app.nodePreviewImages?.[backgroundLocator] : undefined;
    const outputs = from && backgroundLocator ? app.nodeOutputs?.[backgroundLocator] : undefined;
    if (from === keySource && previews === keyPreviews && outputs === keyOutputs && saved === keySaved
      && savedSource === keySavedSource) return resolved;
    keySource = from;
    keyPreviews = previews;
    keyOutputs = outputs;
    keySaved = saved;
    keySavedSource = savedSource;
    if (!from) resolved = undefined;
    else if (Array.isArray(previews) && previews.length) resolved = previews[0];
    else if (Array.isArray(outputs?.images) && outputs.images.length) resolved = fileUrl(outputs.images[0]);
    else if (savedSource === from && Array.isArray(saved)) resolved = fileUrl(saved[0]);
    else resolved = undefined;
    return resolved;
  }

  function fitDims(node, naturalWidth, naturalHeight) {
    const snap = (value) => Math.max(DIMENSION_STEP, Math.round(value / DIMENSION_STEP) * DIMENSION_STEP);
    const w = snap(naturalWidth);
    const h = snap(naturalHeight);
    lookWidgets(node);
    if (widthWidget && widthWidget.value !== w) commit(node, widthWidget, w);
    if (heightWidget && heightWidget.value !== h) commit(node, heightWidget, h);
    readDims(node);
  }

  function backgroundPhase(node, own) {
    const next = backgroundUrl(node, own);
    if (next !== url) {
      url = next;
      loading = !!next;
      applied = false;
      if (!next) shown = null;
    }
    if (!url || applied) return;
    const ready = image(url);
    if (!ready) {
      if (imageFailed(url)) {
        applied = true;
        loading = false;
        shown = null;
      }
      return;
    }
    shown = ready;
    applied = true;
    fitDims(node, ready.naturalWidth, ready.naturalHeight);
    loading = false;
  }

  function update(node) {
    syncValue(node);
    readDims(node);
    lookInputs(node);
    const backed = connected(node, backgroundSlot);
    if (backed !== dimsHidden) {
      dimsHidden = backed;
      hideDimension(widthWidget, backed);
      hideDimension(heightWidget, backed);
      node.setDirtyCanvas?.(true, true);
    }
    const own = ownOutputs(node);
    const first = !seen;
    if (first) {
      seen = true;
      const stored = node.properties?.bboxGrid;
      if (typeof stored === "boolean") grid = stored;
      savedRef = own?.background_images;
      savedSource = backgroundSource(node);
    }
    backgroundPhase(node, own);
    if (first) {
      incomingRef = incomingNow(node, own);
      applyIncoming(node, incomingRef, false);
    }
    const ended = wasLoading && !loading;
    wasLoading = loading;
    if (width !== syncedW || height !== syncedH) sync(node);
    const incoming = incomingNow(node, own);
    if (incoming !== incomingRef) {
      incomingRef = incoming;
      if (loading) pending = true;
      else applyIncoming(node, incoming, true);
    }
    if (ended && pending) {
      pending = false;
      applyIncoming(node, incoming, true);
    }
  }

  function panelOf() {
    const one = regions[active];
    if (one) return 2;
    return regions.length ? 1 : 0;
  }

  function paletteHeight(row, w, count) {
    return Math.max(rowHeight(), row.height(w, count));
  }

  function panelHeight(kind, isText, palette) {
    const row = rowHeight();
    if (kind === 1) return row;
    if (kind !== 2) return 0;
    return row + GAP + (isText ? row + GAP : 0) + row + GAP + palette;
  }

  function arrange(ctx, nodeWidth, y, room) {
    if (layout.ready && dragging) return;
    const one = regions[active];
    const kind = panelOf();
    const isText = kind === 2 && one.type === "text";
    const count = kind === 2 ? one.palette.length : 0;
    if (layout.ready && layout.width === nodeWidth && layout.y === y && layout.height === room
      && layout.dimW === width && layout.dimH === height && layout.kind === kind && layout.text === isText
      && layout.count === count) return;
    const row = rowHeight();
    const x = MARGIN;
    const w = Math.max(0, nodeWidth - MARGIN * 2);
    layout.width = nodeWidth;
    layout.y = y;
    layout.height = room;
    layout.dimW = width;
    layout.dimH = height;
    layout.kind = kind;
    layout.text = isText;
    layout.count = count;
    layout.x = x;
    layout.w = w;
    ctx.font = font();
    const half = Math.max(0, (w - GAP) / 2);
    layout.gridW = Math.min(measure(ctx, GRID) + BUTTON_PAD, half);
    layout.clearW = Math.min(measure(ctx, CLEAR_ALL) + BUTTON_PAD, half);
    layout.clearX = x + w - layout.clearW;
    layout.labelW = Math.min(measure(ctx, COLOURS), w * 0.5);
    const swatchX = x + layout.labelW + LABEL_GAP;
    const swatchW = Math.max(0, w - layout.labelW - LABEL_GAP);
    const palette = kind === 2 ? paletteHeight(sizer, swatchW, count) : 0;
    const panel = panelHeight(kind, isText, palette);
    let at = y + room - panel;
    layout.segY = -1;
    layout.textY = -1;
    layout.descY = -1;
    layout.palY = -1;
    layout.hintY = -1;
    if (kind === 2) {
      layout.segY = at;
      at += row + GAP;
      if (isText) {
        layout.textY = at;
        at += row + GAP;
      }
      layout.descY = at;
      at += row + GAP;
      layout.palY = at;
      swatches.layout(swatchX, at, swatchW, count);
    } else if (kind === 1) {
      layout.hintY = at;
    }
    const top = y + row + GAP;
    const bottom = panel ? y + room - panel - GAP : y + room;
    contain(width, height, x, top, w, Math.max(0, bottom - top), rect);
    layout.ready = true;
  }

  function ensureRender() {
    const cw = rect[2];
    const ch = rect[3];
    if (renderVersion === version && renderW === cw && renderH === ch) return;
    renderVersion = version;
    renderW = cw;
    renderH = ch;
    placeTags(regions, cw, ch, tagWidth);
    const ctx = measuring();
    ctx.font = BODY_FONT;
    for (const one of regions) {
      paint(one);
      const left = one.x * cw;
      const top = one.y * ch;
      const right = (one.x + one.w) * cw;
      const bottom = (one.y + one.h) * ch;
      wrapBody(one, right - left, ctx);
      one.clip = one.lines.length > 0 || one.tagX < left - EDGE || one.tagY < top - EDGE
        || one.tagX + one.tagW > right + EDGE || one.tagY + TAG_HEIGHT > bottom + EDGE;
    }
  }

  function trackHover(node) {
    const point = dragging ? null : hoverPoint(node, widget);
    const cx = rect[0];
    const cy = rect[1];
    const cw = rect[2];
    const ch = rect[3];
    if (!point || !contains(cx, cy, cw, ch, point[0], point[1])) {
      hoverIndex = -1;
      hoverTag = -1;
      hoverX = NaN;
      return;
    }
    if (point[0] === hoverX && point[1] === hoverY && hoverVersion === version) return;
    hoverX = point[0];
    hoverY = point[1];
    hoverVersion = version;
    const nx = unit((hoverX - cx) / cw);
    const ny = unit((hoverY - cy) / ch);
    hoverTag = tagAt(regions, nx * cw, ny * ch);
    hoverIndex = hoverBox(regions, nx, ny, HANDLE / Math.max(1, cw), HANDLE / Math.max(1, ch), active, hoverTag,
      found);
  }

  function buildTile(w, h, k, colour) {
    if (!tile) tile = document.createElement("canvas");
    tile.width = w;
    tile.height = h;
    const ctx = tile.getContext("2d");
    const radius = DOT_RADIUS * k;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = colour;
    ctx.beginPath();
    for (let corner = 0; corner < 4; corner += 1) {
      const px = corner & 1 ? w : 0;
      const py = corner & 2 ? h : 0;
      ctx.moveTo(px + radius, py);
      ctx.arc(px, py, radius, 0, Math.PI * 2);
    }
    ctx.fill();
    tileW = w;
    tileH = h;
    tileK = k;
    tileColour = colour;
    pattern = null;
  }

  function edgeStrip(ctx, dx, dy, x, y, w, h) {
    ctx.translate(dx, dy);
    ctx.fillRect(x - dx, y - dy, w, h);
    ctx.translate(-dx, -dy);
  }

  function dots(ctx, colour) {
    const cx = rect[0];
    const cy = rect[1];
    const cw = rect[2];
    const ch = rect[3];
    const fx = gridStep(width);
    const fy = gridStep(height);
    if (!(fx > 0 && fy > 0)) return;
    const sx = fx * cw;
    const sy = fy * ch;
    const zoom = (app.canvas?.ds?.scale || 1) * (window.devicePixelRatio || 1);
    let k = zoom > 2 ? 4 : zoom > 1 ? 2 : 1;
    const longest = Math.max(sx, sy);
    if (longest * k > TILE_MAX) k = TILE_MAX / longest;
    const w = Math.max(1, Math.round(sx * k));
    const h = Math.max(1, Math.round(sy * k));
    if (!tile || w !== tileW || h !== tileH || k !== tileK || colour !== tileColour) buildTile(w, h, k, colour);
    if (!pattern || patternCtx !== ctx) {
      pattern = ctx.createPattern(tile, "repeat");
      patternCtx = ctx;
      patternX = NaN;
      if (!pattern) return;
    }
    if (cx !== patternX || cy !== patternY || sx !== patternSx || sy !== patternSy) {
      shift.a = sx / w;
      shift.d = sy / h;
      shift.e = cx;
      shift.f = cy;
      pattern.setTransform?.(shift);
      patternX = cx;
      patternY = cy;
      patternSx = sx;
      patternSy = sy;
    }
    ctx.globalAlpha *= DOT_ALPHA;
    ctx.fillStyle = pattern;
    ctx.fillRect(cx, cy, cw, ch);
    const cols = Math.round(1 / fx);
    const rows = Math.round(1 / fy);
    const extraCol = cols * fx > 1 + 1e-9;
    const extraRow = rows * fy > 1 + 1e-9;
    const dx = extraCol ? cw - (cols - 1) * sx : 0;
    const dy = extraRow ? ch - (rows - 1) * sy : 0;
    if (extraCol) edgeStrip(ctx, dx, 0, cx + cw - DOT_RADIUS, cy, DOT_RADIUS, ch);
    if (extraRow) edgeStrip(ctx, 0, dy, cx, cy + ch - DOT_RADIUS, cw, DOT_RADIUS);
    if (extraCol && extraRow) edgeStrip(ctx, dx, dy, cx + cw - DOT_RADIUS, cy + ch - DOT_RADIUS, DOT_RADIUS, DOT_RADIUS);
    ctx.globalAlpha /= DOT_ALPHA;
  }

  function drawBox(ctx, index, lit, low) {
    const one = regions[index];
    const cx = rect[0];
    const cy = rect[1];
    const left = cx + one.x * rect[2];
    const top = cy + one.y * rect[3];
    const w = cx + (one.x + one.w) * rect[2] - left;
    const h = cy + (one.y + one.h) * rect[3] - top;
    const raised = lit || index === hoverIndex;
    if (lit) {
      ctx.fillStyle = BACKDROP;
      ctx.fillRect(left, top, w, h);
    }
    ctx.fillStyle = raised ? one.fillHigh : one.fillLow;
    ctx.fillRect(left, top, w, h);
    const line = lit ? 2 : raised ? 1.5 : 1;
    ctx.strokeStyle = one.col;
    ctx.lineWidth = line;
    ctx.strokeRect(left + line / 2, top + line / 2, w - line, h - line);
    const pal = one.pal;
    if (pal.length) {
      const each = w / pal.length;
      for (let at = 0; at < pal.length; at += 1) {
        const from = left + Math.round(at * each);
        ctx.fillStyle = pal[at];
        ctx.fillRect(from, top, left + Math.round((at + 1) * each) - from, STRIPE);
      }
    }
    if (low) return;
    if (one.clip) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(left, top, w, h);
      ctx.clip();
    }
    const lines = one.lines;
    if (lines.length) {
      ctx.font = BODY_FONT;
      ctx.fillStyle = one.ink;
      let base = top + BODY_TOP;
      for (let at = 0; at < lines.length && base <= top + h; at += 1) {
        ctx.fillText(lines[at], left + BODY_PAD, base);
        base += BODY_LINE;
      }
    }
    const tx = cx + one.tagX;
    const ty = cy + one.tagY;
    ctx.fillStyle = one.col;
    ctx.fillRect(tx, ty, one.tagW, TAG_HEIGHT);
    if (index === hoverTag) {
      ctx.fillStyle = TAG_HOVER;
      ctx.fillRect(tx, ty, one.tagW, TAG_HEIGHT);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1;
      ctx.strokeRect(tx + 0.5, ty + 0.5, one.tagW - 1, TAG_HEIGHT - 1);
    }
    ctx.font = TAG_FONT;
    ctx.fillStyle = one.tagInk;
    ctx.fillText(tagText(index), tx + 4, ty + 11);
    if (one.clip) ctx.restore();
  }

  function drawCanvas(ctx, node, colours, low) {
    const cx = rect[0];
    const cy = rect[1];
    const cw = rect[2];
    const ch = rect[3];
    ensureRender();
    trackHover(node);
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx, cy, cw, ch);
    ctx.clip();
    if (shown) {
      ctx.drawImage(shown, cx, cy, cw, ch);
      ctx.fillStyle = DIM;
    } else {
      ctx.fillStyle = colours.bg;
    }
    ctx.fillRect(cx, cy, cw, ch);
    if (grid && !low) dots(ctx, colours.text);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    const lit = node.selected || dragging || focusClick === app.canvas?.last_mouseclick ? active : -1;
    for (let index = regions.length - 1; index >= 0; index -= 1) {
      if (index !== lit) drawBox(ctx, index, false, low);
    }
    if (lit >= 0 && lit < regions.length) drawBox(ctx, lit, true, low);
    ctx.restore();
    if (low) return;
    ctx.strokeStyle = colours.outline;
    ctx.lineWidth = 1;
    ctx.strokeRect(cx + 0.5, cy + 0.5, cw - 1, ch - 1);
  }

  function drawPanel(ctx, colours, low, disabled) {
    const row = rowHeight();
    const x = layout.x;
    const w = layout.w;
    if (layout.kind === 1) {
      if (!low && !regions[active] && regions.length) rowText(ctx, HINT, x, layout.hintY, row, "left", colours.secondary, w);
      return;
    }
    const one = regions[active];
    if (layout.kind !== 2 || !one || one.palette.length !== layout.count || (one.type === "text") !== layout.text) {
      return;
    }
    drawSegments(ctx, x, layout.segY, w, row, TYPES, one.type === "text" ? 1 : 0, low, disabled);
    if (layout.textY >= 0) {
      drawField(ctx, x, layout.textY, w, row, TEXT_LABEL, one.text, TEXT_PLACEHOLDER, low, disabled);
    }
    drawField(ctx, x, layout.descY, w, row, DESC_LABEL, one.desc, DESC_PLACEHOLDER, low, disabled);
    if (!low) rowText(ctx, COLOURS, x, layout.palY, row, "left", colours.secondary, layout.labelW);
    swatches.draw(ctx, one.palette, low);
  }

  function finish(node) {
    if (!dragging) return;
    dragging = false;
    focusClick = app.canvas?.last_mouseclick ?? -1;
    const one = regions[active];
    if (one && (one.w < TINY || one.h < TINY)) removeAt(active);
    sync(node);
  }

  function pointAt(event, node) {
    pointX = unit((event.canvasX - node.pos[0] - rect[0]) / rect[2]);
    pointY = unit((event.canvasY - node.pos[1] - rect[1]) / rect[3]);
  }

  function drag(event, node) {
    if (!dragging) return;
    pointAt(event, node);
    dragRegion(mode, start, pointX - downX, pointY - downY, target);
    if (grid) snapRegion(target, mode, gridStep(width), gridStep(height));
    changed();
    node.setDirtyCanvas?.(true, false);
  }

  function describeAt(event, node) {
    pointAt(event, node);
    const rx = HANDLE / Math.max(1, rect[2]);
    const ry = HANDLE / Math.max(1, rect[3]);
    if (!regionsUnder(regions, pointX, pointY, rx, ry, active, found)) return;
    let at = 0;
    while (at < found.count && found.index[at] !== active) at += 1;
    const index = found.index[at < found.count ? at : 0];
    const one = regions[index];
    active = index;
    changed();
    redraw();
    prompt(event, DESC_LABEL, one.desc, (text) => undoable(() => {
      one.desc = String(text ?? "");
      sync(node);
    }), true);
  }

  function startGesture(pointer, node, px, py) {
    const cw = rect[2];
    const ch = rect[3];
    const nx = unit((px - rect[0]) / cw);
    const ny = unit((py - rect[1]) / ch);
    const down = pointer.eDown;
    ensureRender();
    const tag = tagAt(regions, nx * cw, ny * ch);
    const hit = pickBox(regions, nx, ny, HANDLE / Math.max(1, cw), HANDLE / Math.max(1, ch), active,
      !!(down.altKey || down.shiftKey), tag, found, picked);
    app.canvas.emitBeforeChange();
    if (hit) {
      active = hit.index;
      mode = hit.mode;
    } else {
      regions.push(blank(nx, ny));
      active = regions.length - 1;
      mode = "draw";
    }
    target = regions[active];
    start.x = target.x;
    start.y = target.y;
    start.w = target.w;
    start.h = target.h;
    downX = nx;
    downY = ny;
    dragging = true;
    hoverIndex = -1;
    hoverTag = -1;
    changed();
    redraw();
    pointer.onDrag = (event) => drag(event, node);
    pointer.onClick = () => finish(node);
    pointer.onDragEnd = () => finish(node);
    pointer.onDoubleClick = (event) => {
      finish(node);
      describeAt(event, node);
    };
    pointer.finally = () => {
      try {
        finish(node);
      } finally {
        app.canvas.emitAfterChange();
      }
    };
    return true;
  }

  function toggleGrid(node) {
    undoable(() => {
      grid = !grid;
      if (node.properties) node.properties.bboxGrid = grid;
    });
    redraw();
  }

  function clearAll(node) {
    undoable(() => {
      regions = [];
      active = -1;
      pending = false;
      setLastIncoming(node, NONE);
      sync(node);
    });
  }

  function setType(node, one, type) {
    undoable(() => {
      one.type = type;
      sync(node);
    });
  }

  function editField(event, node, one, key, title) {
    prompt(event, title, one[key], (text) => {
      const next = String(text ?? "");
      if (one[key] === next) return;
      undoable(() => {
        one[key] = next;
        sync(node);
      });
    }, true);
  }

  function paletteSetter(node, one) {
    return (next) => {
      one.palette = next;
      sync(node);
    };
  }

  function removeBox(node, one) {
    const index = regions.indexOf(one);
    if (index < 0) return;
    undoable(() => {
      removeAt(index);
      sync(node);
    });
  }

  return {
    hover: true,

    minSize(node) {
      syncValue(node);
      const row = rowHeight();
      size.minWidth = 0;
      if (widget.connectionSuppressed) {
        size.minHeight = row;
        size.maxHeight = row;
        return size;
      }
      const kind = panelOf();
      const one = regions[active];
      let palette = 0;
      if (kind === 2) {
        const label = layout.ready ? layout.labelW : LABEL_GUESS;
        palette = paletteHeight(sizer, Math.max(0, node.size[0] - MARGIN * 2 - label - LABEL_GAP), one.palette.length);
      }
      const panel = panelHeight(kind, kind === 2 && one.type === "text", palette);
      size.minHeight = row + GAP + CANVAS_MIN + (panel ? GAP + panel : 0);
      size.maxHeight = undefined;
      return size;
    },

    draw(ctx, node, nodeWidth, y, room, low) {
      update(node);
      arrange(ctx, nodeWidth, y, room);
      const colours = theme();
      const disabled = !!widget.computedDisabled;
      const row = rowHeight();
      gridState.active = grid;
      gridState.disabled = disabled;
      clearState.disabled = disabled;
      button(ctx, layout.x, y, layout.gridW, row, GRID, low, gridState);
      button(ctx, layout.clearX, y, layout.clearW, row, CLEAR_ALL, low, clearState);
      if (rect[2] > 0 && rect[3] > 0) drawCanvas(ctx, node, colours, low);
      drawPanel(ctx, colours, low, disabled);
    },

    pointerDown(pointer, node) {
      if (widget.computedDisabled || !layout.ready) return false;
      update(node);
      const down = pointer.eDown;
      const px = down.canvasX - node.pos[0];
      const py = down.canvasY - node.pos[1];
      const row = rowHeight();
      if (contains(layout.x, layout.y, layout.gridW, row, px, py)) {
        pointer.onClick = () => toggleGrid(node);
        return true;
      }
      if (contains(layout.clearX, layout.y, layout.clearW, row, px, py)) {
        pointer.onClick = () => clearAll(node);
        return true;
      }
      if (rect[2] > 0 && rect[3] > 0 && contains(rect[0], rect[1], rect[2], rect[3], px, py)) {
        return startGesture(pointer, node, px, py);
      }
      const one = regions[active];
      if (layout.kind !== 2 || !one) return false;
      const x = layout.x;
      const w = layout.w;
      if (contains(x, layout.segY, w, row, px, py)) {
        const at = segmentAt(x, w, TYPES.length, px);
        if (at >= 0) pointer.onClick = () => setType(node, one, TYPES[at]);
        return true;
      }
      if (layout.textY >= 0 && one.type === "text" && contains(x, layout.textY, w, row, px, py)) {
        pointer.onClick = (event) => editField(event, node, one, "text", TEXT_LABEL);
        return true;
      }
      if (contains(x, layout.descY, w, row, px, py)) {
        pointer.onClick = (event) => editField(event, node, one, "desc", DESC_LABEL);
        return true;
      }
      return swatches.pointerDown(pointer, node, one.palette, paletteSetter(node, one));
    },

    contextMenu(event, node, point) {
      if (widget.computedDisabled || !layout.ready || dragging) return false;
      update(node);
      const one = regions[active];
      if (layout.kind === 2 && one && swatches.contextMenu(point, one.palette, paletteSetter(node, one))) return true;
      const cw = rect[2];
      const ch = rect[3];
      if (!(cw > 0 && ch > 0) || !contains(rect[0], rect[1], cw, ch, point[0], point[1])) return false;
      ensureRender();
      const nx = unit((point[0] - rect[0]) / cw);
      const ny = unit((point[1] - rect[1]) / ch);
      const index = hoverBox(regions, nx, ny, HANDLE / Math.max(1, cw), HANDLE / Math.max(1, ch), active,
        tagAt(regions, nx * cw, ny * ch), found);
      if (index < 0) return false;
      const chosen = regions[index];
      active = index;
      changed();
      redraw();
      menu(event, [[DELETE, () => removeBox(node, chosen)]]);
      return true;
    },
  };
}

function release() {
  for (const ref of hiddenRefs) {
    const one = ref.deref();
    if (one) {
      one.hidden = false;
      hiddenByUs.delete(one);
    }
  }
  hiddenRefs.clear();
  measurer = null;
  tags.length = 0;
  tagWidths.length = 0;
}

export { make, release };
