import {
  GAP, MARGIN, button, centreText, comboPointer, commit, contain, contains, drawCombo, gesture, image,
  imageFailed, local, redraw, rowHeight, theme,
} from "./kit.mjs";
import { CUSTOM, RATIO_LABELS, RATIO_VALUES, TURN, lockIcon, ratioIndex, shade } from "./crop-box.mjs";
import { fitToRatio, heightOf, widthOf, ratioOf, shiftCrop, stretchCrop } from "./image-crop-math.mjs";
import { nodeImageUrl } from "./media-source.mjs";

const EMPTY_HEIGHT = 76;

const MIN_AREA = 128;

const ROW_GAP = 4;

const RADIUS = 5;

const ICON = 48;

const ICON_GAP = 8;

const LINE = 20;

const EDGE = 8;

const CORNER = 16;

const DOT = 4.5;

const BORDER = 1;

const MIN_WIDTH = 120;

const DIMMED = 0.6;

const WHITE = "#ffffff";

const DOT_FILL = "rgba(255, 255, 255, 0.8)";

const DEFAULT_BOUNDS = Object.freeze({ x: 0, y: 0, width: 512, height: 512 });

const LOCKED = Object.freeze({ active: true });

const UNLOCKED = Object.freeze({ active: false });

function inputSource(node) {
  let source = node.getInputNode?.(0);
  if (!source) return null;
  if (source.isSubgraphNode?.()) {
    const link = node.getInputLink(0);
    if (!link) return null;
    source = source.resolveSubgraphOutputLink?.(link.origin_slot)?.outputNode ?? null;
  }
  return source;
}

function imageIcon(ctx, cx, cy, size, colour) {
  const unit = size / 24;
  const left = cx - size / 2;
  const top = cy - size / 2;
  ctx.strokeStyle = colour;
  ctx.lineWidth = unit * 2;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.roundRect(left + unit * 3, top + unit * 3, unit * 18, unit * 18, unit * 2);
  ctx.moveTo(left + unit * 11, top + unit * 9);
  ctx.arc(left + unit * 9, top + unit * 9, unit * 2, 0, TURN);
  ctx.moveTo(left + unit * 21, top + unit * 15);
  ctx.lineTo(left + unit * 16.5, top + unit * 10.5);
  ctx.lineTo(left + unit * 6, top + unit * 21);
  ctx.stroke();
  ctx.lineWidth = 1;
}

function handleAt(px, py, box, locked) {
  const x = box[0];
  const y = box[1];
  const w = box[2];
  const h = box[3];
  const half = CORNER / 2;
  const nearX = x - BORDER / 2 - half;
  const farX = x + w + BORDER / 2 - half;
  const nearY = y - BORDER / 2 - half;
  const farY = y + h + BORDER / 2 - half;
  if (contains(farX, farY, CORNER, CORNER, px, py)) return "se";
  if (contains(nearX, farY, CORNER, CORNER, px, py)) return "sw";
  if (contains(farX, nearY, CORNER, CORNER, px, py)) return "ne";
  if (contains(nearX, nearY, CORNER, CORNER, px, py)) return "nw";
  if (!locked) {
    const across = Math.max(0, w - EDGE * 2);
    const down = Math.max(0, h - EDGE * 2);
    if (contains(x + w - EDGE / 2, y + EDGE, EDGE, down, px, py)) return "right";
    if (contains(x - EDGE / 2, y + EDGE, EDGE, down, px, py)) return "left";
    if (contains(x + EDGE, y + h - EDGE / 2, across, EDGE, px, py)) return "bottom";
    if (contains(x + EDGE, y - EDGE / 2, across, EDGE, px, py)) return "top";
  }
  if (contains(x - BORDER, y - BORDER, w + BORDER * 2, h + BORDER * 2, px, py)) return "move";
  return null;
}

function make(widget) {
  const state = {
    node: null,
    imageWidth: 0,
    imageHeight: 0,
    locked: null,
    ready: false,
    scale: 1,
    controls: false,
    area: [0, 0, 0, 0],
    shown: [0, 0, 0, 0],
    box: [0, 0, 0, 0],
    combo: [0, 0, 0, 0],
    lock: [0, 0, 0, 0],
  };
  const wanted = { minHeight: 0, minWidth: MIN_WIDTH, maxHeight: undefined };

  function bounds() {
    const value = widget.value;
    return value && typeof value === "object" ? value : DEFAULT_BOUNDS;
  }

  function write(fields) {
    const value = bounds();
    for (const key in fields) {
      if (value[key] !== fields[key]) {
        commit(state.node, widget, { ...value, ...fields });
        return;
      }
    }
  }

  function chooseRatio(index) {
    if (index === ratioIndex(state.locked)) return;
    if (index === CUSTOM) {
      state.locked = null;
      redraw();
      return;
    }
    state.locked = RATIO_VALUES[index];
    write(fitToRatio(bounds(), state.locked, state.imageHeight));
    redraw();
  }

  const choice = {
    items: RATIO_LABELS,
    get index() {
      return ratioIndex(state.locked);
    },
    choose: chooseRatio,
  };

  function toggleLock() {
    state.locked = state.locked == null ? ratioOf(bounds()) : null;
    redraw();
  }

  function minSize() {
    wanted.minHeight = MIN_AREA + GAP + (widget.computedDisabled ? 0 : rowHeight() + ROW_GAP);
    return wanted;
  }

  function drawEmpty(ctx, colours) {
    const area = state.area;
    const middle = area[0] + area[2] / 2;
    const withIcon = area[3] >= EMPTY_HEIGHT;
    const total = withIcon ? ICON + ICON_GAP + LINE : LINE;
    const top = area[1] + (area[3] - total) / 2;
    if (withIcon) imageIcon(ctx, middle, top + ICON / 2, ICON, colours.text);
    centreText(ctx, "No input image connected", middle, top + total - LINE / 2, colours.text, null, "center",
      area[2] - 16);
  }

  function drawBox(ctx, picture, disabled, low) {
    const area = state.area;
    const shown = contain(picture.naturalWidth, picture.naturalHeight, area[0], area[1], area[2], area[3],
      state.shown);
    state.imageWidth = picture.naturalWidth;
    state.imageHeight = picture.naturalHeight;
    ctx.drawImage(picture, shown[0], shown[1], shown[2], shown[3]);
    const scale = shown[2] / picture.naturalWidth;
    state.scale = scale;
    const value = bounds();
    const box = state.box;
    box[0] = shown[0] + value.x * scale;
    box[1] = shown[1] + value.y * scale;
    box[2] = widthOf(value) * scale;
    box[3] = heightOf(value) * scale;
    ctx.save();
    ctx.beginPath();
    ctx.rect(area[0], area[1], area[2], area[3]);
    ctx.clip();
    if (disabled) ctx.globalAlpha *= DIMMED;
    shade(ctx, area[0], area[1], area[2], area[3], box[0] - BORDER, box[1] - BORDER, box[2] + BORDER * 2,
      box[3] + BORDER * 2);
    ctx.strokeStyle = WHITE;
    ctx.lineWidth = BORDER;
    ctx.strokeRect(box[0] - BORDER / 2, box[1] - BORDER / 2, box[2] + BORDER, box[3] + BORDER);
    if (!low) {
      const left = box[0] - BORDER / 2;
      const right = box[0] + box[2] + BORDER / 2;
      const top = box[1] - BORDER / 2;
      const bottom = box[1] + box[3] + BORDER / 2;
      ctx.fillStyle = DOT_FILL;
      ctx.beginPath();
      ctx.moveTo(left + DOT, top);
      ctx.arc(left, top, DOT, 0, TURN);
      ctx.moveTo(right + DOT, top);
      ctx.arc(right, top, DOT, 0, TURN);
      ctx.moveTo(left + DOT, bottom);
      ctx.arc(left, bottom, DOT, 0, TURN);
      ctx.moveTo(right + DOT, bottom);
      ctx.arc(right, bottom, DOT, 0, TURN);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawRatio(ctx, x, y, w, row, colours, low) {
    const combo = state.combo;
    const lock = state.lock;
    combo[0] = x;
    combo[1] = y;
    combo[2] = Math.max(0, w - row - ROW_GAP);
    combo[3] = row;
    lock[0] = x + w - row;
    lock[1] = y;
    lock[2] = row;
    lock[3] = row;
    const locked = state.locked != null;
    drawCombo(ctx, combo[0], y, combo[2], row, "Ratio", RATIO_LABELS[ratioIndex(state.locked)], low);
    button(ctx, lock[0], y, row, row, "", low, locked ? LOCKED : UNLOCKED);
    if (!low) lockIcon(ctx, lock[0] + row / 2, y + row / 2, row * 0.6, !locked, colours.text);
  }

  function draw(ctx, node, width, y, height, low) {
    state.node = node;
    const colours = theme();
    const disabled = !!widget.computedDisabled;
    const row = rowHeight();
    const x = MARGIN;
    const w = Math.max(0, width - MARGIN * 2);
    const areaHeight = disabled ? height : Math.max(0, height - row - ROW_GAP);
    const area = state.area;
    area[0] = x;
    area[1] = y;
    area[2] = w;
    area[3] = areaHeight;
    ctx.fillStyle = colours.bg;
    ctx.beginPath();
    if (low) ctx.rect(x, y, w, areaHeight);
    else ctx.roundRect(x, y, w, areaHeight, RADIUS);
    ctx.fill();
    const url = nodeImageUrl(inputSource(node));
    const picture = url ? image(url) : undefined;
    state.ready = !!picture;
    if (picture) drawBox(ctx, picture, disabled, low);
    else if (!low && url && !imageFailed(url)) centreText(ctx, "Loading...", x + w / 2, y + areaHeight / 2, colours.text);
    else if (!low) drawEmpty(ctx, colours);
    state.controls = !disabled;
    if (!disabled) drawRatio(ctx, x, y + areaHeight + ROW_GAP, w, row, colours, low);
  }

  function pointerDown(pointer, node) {
    if (widget.computedDisabled) return false;
    state.node = node;
    const [px, py] = local(pointer.eDown, node);
    if (state.controls) {
      const combo = state.combo;
      const lock = state.lock;
      if (contains(combo[0], combo[1], combo[2], combo[3], px, py)) {
        return comboPointer(pointer, node, combo[0], combo[1], combo[2], combo[3], choice);
      }
      if (contains(lock[0], lock[1], lock[2], lock[3], px, py)) {
        pointer.onClick = toggleLock;
        return true;
      }
    }
    const area = state.area;
    if (!state.ready || !contains(area[0], area[1], area[2], area[3], px, py)) return false;
    const mode = handleAt(px, py, state.box, state.locked != null);
    if (!mode) return false;
    const value = bounds();
    const start = { x: value.x, y: value.y, width: widthOf(value), height: heightOf(value) };
    const downX = pointer.eDown.canvasX;
    const downY = pointer.eDown.canvasY;
    let grouped = false;
    pointer.onDrag = (event) => {
      const scale = state.scale;
      if (!(scale > 0)) return;
      const dx = (event.canvasX - downX) / scale;
      const dy = (event.canvasY - downY) / scale;
      const current = bounds();
      const fields = mode === "move"
        ? shiftCrop(start.x, start.y, widthOf(current), heightOf(current), dx, dy, state.imageWidth,
          state.imageHeight)
        : stretchCrop(mode, start, dx, dy, state.imageWidth, state.imageHeight, state.locked);
      if (!grouped) {
        grouped = true;
        gesture(pointer);
      }
      write(fields);
    };
    return true;
  }

  return { minSize, draw, pointerDown };
}

export { make };
