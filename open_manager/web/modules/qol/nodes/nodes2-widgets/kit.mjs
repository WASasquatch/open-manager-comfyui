import { app } from "../../../../../../scripts/app.js";
import { api } from "../../../../../../scripts/api.js";

const MARGIN = 15;

const GAP = 4;

const ARROW_MARGIN = 6;

const ARROW_WIDTH = 10;

const ARROW_HIT = 25;

const IMAGE_CACHE_MAX = 64;

const TEXT_CACHE_MAX = 512;

const DRAG_THRESHOLD = 4;

const SWATCH = 20;

const SWATCH_GAP = 4;

const ADD_WIDTH = 24;

const ELLIPSIS = "…";

const palette = { bg: "#222", outline: "#666", text: "#ddd", secondary: "#999", disabled: "#666" };

const FACE_CACHE_MAX = 32;

const DASH = [4, 4];

const SOLID = [];

const fonts = new Map();

const widths = new Map();

const fitted = new Map();

let fontFamily = "";

const images = new Map();

const locators = new WeakMap();

const mips = new WeakMap();

const MIP_MIN = 16;

const pointed = [0, 0];

let colourInput = null;

function theme() {
  const graph = window.LiteGraph;
  palette.bg = graph.WIDGET_BGCOLOR;
  palette.outline = graph.WIDGET_OUTLINE_COLOR;
  palette.text = graph.WIDGET_TEXT_COLOR;
  palette.secondary = graph.WIDGET_SECONDARY_TEXT_COLOR;
  palette.disabled = graph.WIDGET_DISABLED_TEXT_COLOR || graph.WIDGET_SECONDARY_TEXT_COLOR;
  return palette;
}

function rowHeight() {
  return window.LiteGraph.NODE_WIDGET_HEIGHT;
}

function font(size, weight) {
  const graph = window.LiteGraph;
  if (graph.NODE_FONT !== fontFamily) {
    fontFamily = graph.NODE_FONT;
    fonts.clear();
  }
  const px = size || graph.NODE_SUBTEXT_SIZE;
  const style = weight || "normal";
  let sized = fonts.get(px);
  if (!sized) {
    sized = new Map();
    fonts.set(px, sized);
  }
  let found = sized.get(style);
  if (!found) {
    found = `${style} ${px}px ${fontFamily}`;
    sized.set(style, found);
  }
  return found;
}

function tableFor(store, face) {
  let table = store.get(face);
  if (!table) {
    if (store.size >= FACE_CACHE_MAX) store.clear();
    table = new Map();
    store.set(face, table);
  }
  return table;
}

function measure(ctx, text) {
  const table = tableFor(widths, ctx.font);
  let width = table.get(text);
  if (width === undefined) {
    if (table.size >= TEXT_CACHE_MAX) table.clear();
    width = ctx.measureText(text).width;
    table.set(text, width);
  }
  return width;
}

function fitText(ctx, text, maxWidth) {
  if (!text || maxWidth <= 0) return "";
  if (measure(ctx, text) <= maxWidth) return text;
  const limit = Math.floor(maxWidth);
  const table = tableFor(fitted, ctx.font);
  let kept = table.get(text);
  if (kept && kept.limit === limit) return kept.out;
  let low = 0;
  let high = text.length;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (ctx.measureText(text.slice(0, middle) + ELLIPSIS).width <= maxWidth) low = middle;
    else high = middle - 1;
  }
  const out = low ? text.slice(0, low) + ELLIPSIS : "";
  if (!kept) {
    if (table.size >= TEXT_CACHE_MAX) table.clear();
    kept = { limit, out };
    table.set(text, kept);
  } else {
    kept.limit = limit;
    kept.out = out;
  }
  return out;
}

function rowText(ctx, text, x, rowY, height, align, colour, maxWidth) {
  ctx.font = font();
  ctx.fillStyle = colour;
  ctx.textAlign = align || "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(maxWidth ? fitText(ctx, text, maxWidth) : text, x, rowY + height * 0.7);
}

function centreText(ctx, text, x, y, colour, size, align, maxWidth) {
  ctx.font = font(size);
  ctx.fillStyle = colour;
  ctx.textAlign = align || "center";
  ctx.textBaseline = "middle";
  ctx.fillText(maxWidth ? fitText(ctx, text, maxWidth) : text, x, y);
}

function roundRect(ctx, x, y, w, h, radius) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
}

function pill(ctx, x, y, w, h, low, disabled) {
  const colours = theme();
  ctx.fillStyle = colours.bg;
  ctx.strokeStyle = colours.outline;
  ctx.beginPath();
  if (low) ctx.rect(x, y, w, h);
  else ctx.roundRect(x, y, w, h, h * 0.5);
  ctx.fill();
  if (!low && !disabled) ctx.stroke();
}

function arrows(ctx, x, y, w, h, canDecrease, canIncrease) {
  const colours = palette;
  const tip = x + ARROW_MARGIN;
  const inner = tip + ARROW_WIDTH;
  ctx.fillStyle = canDecrease ? colours.text : colours.disabled;
  ctx.beginPath();
  ctx.moveTo(inner, y + 5);
  ctx.lineTo(tip, y + h * 0.5);
  ctx.lineTo(inner, y + h - 5);
  ctx.fill();
  const right = x + w;
  ctx.fillStyle = canIncrease ? colours.text : colours.disabled;
  ctx.beginPath();
  ctx.moveTo(right - (inner - x), y + 5);
  ctx.lineTo(right - (tip - x), y + h * 0.5);
  ctx.lineTo(right - (inner - x), y + h - 5);
  ctx.fill();
}

function button(ctx, x, y, w, h, label, low, state) {
  const colours = theme();
  ctx.fillStyle = state?.active ? colours.outline : colours.bg;
  ctx.fillRect(x, y, w, h);
  if (!low && !state?.disabled) {
    ctx.strokeStyle = colours.outline;
    ctx.strokeRect(x, y, w, h);
  }
  if (low || !label) return;
  rowText(ctx, label, x + w / 2, y, h, "center",
    state?.disabled ? colours.disabled : colours.text, w - 8);
}

function card(ctx, x, y, w, h, message, low) {
  const colours = theme();
  ctx.strokeStyle = colours.outline;
  if (low) {
    ctx.strokeRect(x, y, w, h);
    return;
  }
  ctx.setLineDash(DASH);
  roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 6);
  ctx.stroke();
  ctx.setLineDash(SOLID);
  if (message) centreText(ctx, message, x + w / 2, y + h / 2, colours.secondary, null, "center", w - 16);
}

function skeleton(ctx, x, y, w, h, radius) {
  const colours = theme();
  ctx.globalAlpha *= 0.35;
  ctx.fillStyle = colours.outline;
  roundRect(ctx, x, y, w, h, radius ?? 4);
  ctx.fill();
  ctx.globalAlpha /= 0.35;
}

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

function contains(x, y, w, h, px, py) {
  return px >= x && px <= x + w && py >= y && py <= y + h;
}

function contain(width, height, x, y, w, h, out) {
  const target = out || [0, 0, 0, 0];
  if (!(width > 0 && height > 0 && w > 0 && h > 0)) {
    target[0] = x;
    target[1] = y;
    target[2] = 0;
    target[3] = 0;
    return target;
  }
  const scale = Math.min(w / width, h / height);
  target[2] = width * scale;
  target[3] = height * scale;
  target[0] = x + (w - target[2]) / 2;
  target[1] = y + (h - target[3]) / 2;
  return target;
}

function local(event, node) {
  return [event.canvasX - node.pos[0], event.canvasY - node.pos[1]];
}

function hoverPoint(node, widget) {
  if (node.mouseOver?.overWidget !== widget) return null;
  const mouse = app.canvas?.graph_mouse;
  if (!mouse) return null;
  pointed[0] = mouse[0] - node.pos[0];
  pointed[1] = mouse[1] - node.pos[1];
  return pointed;
}

function redraw() {
  app.canvas?.setDirty?.(true, false);
}

function commit(node, widget, value) {
  const canvas = app.canvas;
  if (typeof widget.setValue === "function" && canvas) {
    widget.setValue(value, { e: undefined, node, canvas });
  } else {
    const previous = widget.value;
    widget.value = value;
    widget.callback?.(value, canvas, node);
    node.onWidgetChanged?.(widget.name, value, previous, widget);
    node.graph?.incrementVersion?.();
  }
  node.setDirtyCanvas?.(true, false);
}

function gesture(pointer) {
  const canvas = app.canvas;
  canvas.emitBeforeChange();
  pointer.finally = () => canvas.emitAfterChange();
}

function undoable(change) {
  const canvas = app.canvas;
  canvas.emitBeforeChange();
  try {
    change();
  } finally {
    canvas.emitAfterChange();
  }
}

function prompt(event, title, value, apply, multiline) {
  app.canvas.prompt(title, value ?? "", apply, event, !!multiline);
}

function menu(event, items) {
  new window.LiteGraph.ContextMenu(
    items.map(([content, callback, disabled]) => ({ content, callback, disabled: !!disabled })),
    { event, scale: Math.max(1, app.canvas.ds.scale) },
  );
}

function locator(node) {
  const graph = node?.graph;
  if (!graph) return "";
  let kept = locators.get(node);
  if (kept && kept.graph === graph && kept.id === node.id) return kept.key;
  const root = app.rootGraph || app.graph;
  const key = graph === root || graph.isRootGraph ? String(node.id) : `${graph.id}:${node.id}`;
  if (!kept) {
    kept = { graph, id: node.id, key };
    locators.set(node, kept);
  } else {
    kept.graph = graph;
    kept.id = node.id;
    kept.key = key;
  }
  return key;
}

function output(node) {
  const key = locator(node);
  return key && app.nodeOutputs ? app.nodeOutputs[key] : undefined;
}

function link(node, inputName) {
  const slot = node.findInputSlot?.(inputName) ?? -1;
  if (slot === -1 || !node.isInputConnected(slot)) return null;
  let source = node.getInputNode(slot);
  let edge = node.getInputLink(slot);
  let guard = 0;
  while (source?.isSubgraphNode?.() && edge && guard < 16) {
    guard += 1;
    const resolved = source.resolveSubgraphOutputLink?.(edge.origin_slot);
    source = resolved?.outputNode ?? null;
    edge = resolved?.link;
  }
  if (!source) return null;
  return { node: source, slot: edge?.origin_slot ?? -1 };
}

function source(node, inputName) {
  return link(node, inputName)?.node ?? null;
}

function sourceImage(node, inputName) {
  const image = source(node, inputName)?.imgs?.[0];
  return image?.complete && image.naturalWidth > 0 ? image : undefined;
}

function viewUrl(file) {
  const params = new URLSearchParams({
    filename: file.filename, subfolder: file.subfolder || "", type: file.type || "output",
  });
  return api.apiURL(`/view?${params}${app.getPreviewFormatParam?.() || ""}`);
}

function image(url) {
  if (!url) return undefined;
  let found = images.get(url);
  if (found) {
    images.delete(url);
  } else {
    found = new Image();
    found.decoding = "async";
    found.onload = redraw;
    found.onerror = () => {
      found.omFailed = true;
      redraw();
    };
    found.src = url;
    if (images.size >= IMAGE_CACHE_MAX) images.delete(images.keys().next().value);
  }
  images.set(url, found);
  return found.complete && found.naturalWidth > 0 ? found : undefined;
}

function imageFailed(url) {
  return !!url && images.get(url)?.omFailed === true;
}

function screenScale() {
  return (app.canvas?.ds?.scale || 1) * (window.devicePixelRatio || 1);
}

function sized(source, stamp, pixels) {
  const width = source?.width || 0;
  if (!(width > 0) || !(pixels > 0) || width / 2 < pixels) return source;
  let chain = mips.get(source);
  if (!chain || chain.stamp !== stamp) {
    chain = { stamp, levels: [] };
    mips.set(source, chain);
  }
  let level = source;
  let index = 0;
  while (level.width / 2 >= pixels && level.width / 2 >= MIP_MIN) {
    let next = chain.levels[index];
    if (!next) {
      next = document.createElement("canvas");
      next.width = Math.max(1, Math.round(level.width / 2));
      next.height = Math.max(1, Math.round(level.height / 2));
      next.getContext("2d")?.drawImage(level, 0, 0, next.width, next.height);
      chain.levels[index] = next;
    }
    level = next;
    index += 1;
  }
  return level;
}

function drawNumber(ctx, x, y, w, h, label, text, low, state) {
  const disabled = !!state?.disabled;
  pill(ctx, x, y, w, h, low, disabled);
  if (low) return;
  if (!disabled) arrows(ctx, x, y, w, h, state?.canDecrease !== false, state?.canIncrease !== false);
  ctx.font = font();
  const valueWidth = measure(ctx, text);
  const room = w - 40;
  rowText(ctx, label, x + 20, y, h, "left", palette.secondary, Math.max(0, room - valueWidth - 8));
  rowText(ctx, text, x + w - 20, y, h, "right", disabled ? palette.disabled : palette.text, room);
}

function numberPointer(pointer, node, x, y, w, h, field) {
  const start = local(pointer.eDown, node);
  if (!contains(x, y, w, h, start[0], start[1])) return false;
  const step = field.step || 1;
  const low = field.min ?? -Infinity;
  const high = field.max ?? Infinity;
  const apply = (next) => {
    const value = clamp(field.round ? Math.round(next) : next, low, high);
    if (value !== field.value) field.set(value);
  };
  pointer.onClick = (event) => {
    if (start[0] < x + ARROW_HIT) undoable(() => apply(field.value - step));
    else if (start[0] > x + w - ARROW_HIT) undoable(() => apply(field.value + step));
    else {
      prompt(event, field.title, field.value, (text) => {
        const number = Number(text);
        if (Number.isFinite(number)) undoable(() => apply(number));
      });
    }
  };
  let running = field.value;
  pointer.onDragStart = () => gesture(pointer);
  pointer.onDrag = (event) => {
    running += (event.deltaX || 0) * step;
    apply(running);
  };
  return true;
}

function drawCombo(ctx, x, y, w, h, label, text, low, state) {
  drawNumber(ctx, x, y, w, h, label, text, low, state);
}

function comboPointer(pointer, node, x, y, w, h, choice) {
  const start = local(pointer.eDown, node);
  if (!contains(x, y, w, h, start[0], start[1])) return false;
  const count = choice.items.length;
  pointer.onClick = (event) => {
    if (start[0] < x + ARROW_HIT && count) {
      undoable(() => choice.choose((choice.index - 1 + count) % count));
    } else if (start[0] > x + w - ARROW_HIT && count) {
      undoable(() => choice.choose((choice.index + 1) % count));
    } else {
      menu(event, choice.items.map((item, index) => [item, () => undoable(() => choice.choose(index))]));
    }
  };
  return true;
}

function drawSegments(ctx, x, y, w, h, labels, selected, low, disabled) {
  const colours = theme();
  const count = labels.length;
  const each = w / count;
  ctx.fillStyle = colours.bg;
  ctx.beginPath();
  if (low) ctx.rect(x, y, w, h);
  else ctx.roundRect(x, y, w, h, 4);
  ctx.fill();
  if (selected >= 0 && selected < count) {
    ctx.fillStyle = colours.outline;
    ctx.beginPath();
    if (low) ctx.rect(x + each * selected, y, each, h);
    else ctx.roundRect(x + each * selected + 2, y + 2, each - 4, h - 4, 3);
    ctx.fill();
  }
  if (low) return;
  if (!disabled) {
    ctx.strokeStyle = colours.outline;
    roundRect(ctx, x, y, w, h, 4);
    ctx.stroke();
  }
  for (let index = 0; index < count; index += 1) {
    rowText(ctx, labels[index], x + each * index + each / 2, y, h, "center",
      index === selected ? colours.text : colours.secondary, each - 8);
  }
}

function segmentAt(x, w, count, px) {
  if (px < x || px > x + w) return -1;
  return Math.min(count - 1, Math.floor(((px - x) / w) * count));
}

function drawField(ctx, x, y, w, h, label, text, placeholder, low, disabled) {
  pill(ctx, x, y, w, h, low, disabled);
  if (low) return;
  ctx.font = font();
  const shown = text || placeholder || "";
  const labelWidth = label ? Math.min(measure(ctx, label), (w - 30) * 0.45) : 0;
  if (label) rowText(ctx, label, x + 15, y, h, "left", palette.secondary, labelWidth);
  const left = x + 15 + (label ? labelWidth + 10 : 0);
  rowText(ctx, shown, x + w - 15, y, h, "right", text ? palette.text : palette.disabled,
    Math.max(0, x + w - 15 - left));
}

function pickColour(event, hex, onInput) {
  if (!colourInput) {
    colourInput = document.createElement("input");
    colourInput.type = "color";
    Object.assign(colourInput.style, {
      position: "absolute", opacity: "0", pointerEvents: "none", zIndex: "-999", width: "1px", height: "1px",
    });
    document.body.appendChild(colourInput);
  }
  const input = colourInput;
  input.value = /^#[0-9a-f]{6}/i.exec(hex || "")?.[0] ?? "#ffffff";
  input.style.left = `${event.clientX}px`;
  input.style.top = `${event.clientY}px`;
  input.oninput = () => onInput(input.value, false);
  input.onchange = () => undoable(() => onInput(input.value, true));
  requestAnimationFrame(() => {
    if (typeof input.showPicker === "function") {
      try {
        input.showPicker();
        return;
      } catch {}
    }
    input.click();
  });
}

function swatchRow(max) {
  const cells = [];
  let used = 0;
  let addCell = null;

  function cell(index) {
    if (!cells[index]) cells[index] = { x: 0, y: 0, w: 0, h: 0, index: 0 };
    return cells[index];
  }

  function place(x, y, width, count) {
    const right = x + width;
    let cx = x;
    let cy = y;
    used = 0;
    addCell = null;
    const total = count < max ? count + 1 : count;
    for (let index = 0; index < total; index += 1) {
      const isAdd = index === count;
      const w = isAdd ? ADD_WIDTH : SWATCH;
      if (cx > x && cx + w > right) {
        cx = x;
        cy += SWATCH + SWATCH_GAP;
      }
      const target = cell(used);
      target.x = cx;
      target.y = cy;
      target.w = w;
      target.h = SWATCH;
      target.index = isAdd ? -1 : index;
      if (isAdd) addCell = target;
      used += 1;
      cx += w + SWATCH_GAP;
    }
    return used ? cy + SWATCH - y : SWATCH;
  }

  function hit(px, py) {
    for (let index = 0; index < used; index += 1) {
      const target = cells[index];
      if (contains(target.x, target.y, target.w, target.h, px, py)) return target;
    }
    return null;
  }

  return {
    height(width, count) {
      return place(0, 0, width, count);
    },

    layout(x, y, width, count) {
      return place(x, y, width, count);
    },

    draw(ctx, values, low) {
      const colours = theme();
      for (let index = 0; index < used; index += 1) {
        const target = cells[index];
        if (target.index === -1) {
          ctx.fillStyle = colours.bg;
          roundRect(ctx, target.x, target.y, target.w, target.h, 2);
          ctx.fill();
          if (!low) {
            ctx.strokeStyle = colours.outline;
            ctx.stroke();
            centreText(ctx, "+", target.x + target.w / 2, target.y + target.h / 2, colours.text, 11);
          }
          continue;
        }
        ctx.fillStyle = values[target.index];
        roundRect(ctx, target.x, target.y, target.w, target.h, 2);
        ctx.fill();
        if (!low) {
          ctx.strokeStyle = colours.outline;
          ctx.stroke();
        }
      }
    },

    pointerDown(pointer, node, values, set) {
      const start = local(pointer.eDown, node);
      const target = hit(start[0], start[1]);
      if (!target) return false;
      if (target.index === -1) {
        pointer.onClick = () => {
          if (values.length < max) undoable(() => set([...values, "#ffffff"]));
        };
        return true;
      }
      const from = target.index;
      const down = pointer.eDown;
      let done = false;
      pointer.onDrag = (event) => {
        if (done) return;
        if (Math.abs(event.clientX - down.clientX) + Math.abs(event.clientY - down.clientY) < DRAG_THRESHOLD) return;
        const [px, py] = local(event, node);
        for (let index = 0; index < used; index += 1) {
          const other = cells[index];
          if (other.index === -1 || other.index === from) continue;
          if (px < other.x || px > other.x + other.w || py < other.y - 6 || py > other.y + other.h + 6) continue;
          const next = values.slice();
          const [moved] = next.splice(from, 1);
          const insertAt = px > other.x + other.w / 2 ? other.index + 1 : other.index;
          next.splice(insertAt > from ? insertAt - 1 : insertAt, 0, moved);
          done = true;
          undoable(() => set(next));
          return;
        }
      };
      pointer.onClick = (event) => {
        pickColour(event, values[from], (hex) => {
          if (values[from] === hex) return;
          const next = values.slice();
          next[from] = hex;
          values = next;
          set(next);
        });
      };
      return true;
    },

    contextMenu(local, values, set) {
      const target = hit(local[0], local[1]);
      if (!target || target.index === -1) return false;
      const next = values.slice();
      next.splice(target.index, 1);
      undoable(() => set(next));
      return true;
    },
  };
}

export {
  MARGIN, GAP, theme, rowHeight, font, measure, fitText, rowText, centreText, roundRect, pill,
  arrows, button, card, skeleton, clamp, contains, contain, local, hoverPoint, redraw, commit,
  gesture, undoable, prompt, menu, locator, output, link, source, sourceImage, viewUrl, image,
  imageFailed, screenScale, sized, drawNumber,
  numberPointer, drawCombo, comboPointer, drawSegments, segmentAt, drawField, pickColour,
  swatchRow,
};
