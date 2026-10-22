import { app } from "../../../../../scripts/app.js";

const EDITORS = {
  curve: "curve",
  imagecompare: "image-compare",
  imagecrop: "image-crop",
  boundingboxes: "bounding-boxes",
  colors: "colours",
  resolutionpreview: "resolution",
  videoedit: "video-edit",
  dynamic_group_row: "group-row",
};

const HOSTING = "hosted";

const HOSTED = new Set(["painter", "compositor", "lightinfo"]);

const GROUP_INPUT = "COMFY_DYNAMICGROUP_V3";

const GROUP_NOTICE = "dynamic_group_notice";

const COMPANION = "Nynxz.Nodes2Classic";

const GAP = 4;

const IMPORT_TRIES = 3;

const RETRY_MS = 1500;

const HELD = Symbol("omNodes2Widget");

const HOST_KEYS = new Set(["pos", "size", "setDirtyCanvas", "selected", "mouseOver", "onWidgetChanged",
  "flags", "collapsed"]);

const NESTING = 8;

const NO_GROUPS = new Map();

const modules = new Map();

const groups = new WeakMap();

const shapes = new WeakMap();

const native = new Set();

let active = false;

let painting = null;

let hovered = null;

let seen = new WeakMap();

let marked = new WeakSet();

let looked = new WeakSet();

function classic() {
  return !window.LiteGraph?.vueNodesMode;
}

function redraw() {
  app.canvas?.setDirty?.(true, true);
}

function companionInstalled() {
  try {
    return (app.extensions || []).some((extension) => extension?.name === COMPANION);
  } catch {
    return false;
  }
}

function placeholder(widget) {
  const drawWidget = widget.drawWidget;
  if (typeof drawWidget !== "function") return false;
  let found = shapes.get(drawWidget);
  if (found === undefined) {
    const source = Function.prototype.toString.call(drawWidget);
    found = source.includes("drawVueOnlyWarning") || /\bthis\.draw\b/.test(source)
      || /^[^{]*\{\s*\}$/.test(source);
    shapes.set(drawWidget, found);
  }
  return found;
}

function templateFields(spec) {
  const fields = new Map();
  const template = Array.isArray(spec) ? spec[1]?.template : spec?.template;
  for (const section of [template?.required, template?.optional]) {
    for (const [field, entry] of Object.entries(section || {})) {
      fields.set(field, (Array.isArray(entry) ? entry[1]?.display_name : entry?.display_name) || field);
    }
  }
  return fields;
}

function groupsOf(node) {
  const type = node?.constructor;
  if (typeof type !== "function") return NO_GROUPS;
  let found = groups.get(type);
  if (found) return found;
  found = new Map();
  const data = type.nodeData;
  for (const section of [data?.input?.required, data?.input?.optional]) {
    for (const [name, spec] of Object.entries(section || {})) {
      if (Array.isArray(spec) && spec[0] === GROUP_INPUT) found.set(name, templateFields(spec));
    }
  }
  if (!found.size && data?.inputs && typeof data.inputs === "object") {
    for (const [name, spec] of Object.entries(data.inputs)) {
      if (spec?.type === GROUP_INPUT) found.set(spec.name || name, templateFields(spec));
    }
  }
  groups.set(type, found.size ? found : NO_GROUPS);
  return found;
}

function groupOf(node, widget) {
  const found = groupsOf(node);
  if (!found.size || typeof widget.name !== "string") return null;
  for (const name of found.keys()) {
    if (widget.name.startsWith(`${name}.`)) return name;
  }
  return null;
}

function inherited(object, key) {
  for (let at = object; at; at = Object.getPrototypeOf(at)) {
    const descriptor = Object.getOwnPropertyDescriptor(at, key);
    if (descriptor) return descriptor;
  }
  return undefined;
}

function claim(held, key, ours) {
  const { widget } = held;
  const slot = { own: Object.getOwnPropertyDescriptor(widget, key) };
  const read = () => {
    const kept = slot.own;
    if (!kept) return Reflect.get(Object.getPrototypeOf(widget), key, widget);
    return kept.get ? kept.get.call(widget) : kept.value;
  };
  Object.defineProperty(widget, key, {
    configurable: true,
    enumerable: slot.own ? slot.own.enumerable : true,
    get() {
      const mine = ours();
      return mine === undefined ? read() : mine;
    },
    set(value) {
      const kept = slot.own;
      if (kept?.set) {
        kept.set.call(widget, value);
      } else if (kept && !kept.get) {
        kept.value = value;
      } else if (!kept) {
        const above = inherited(Object.getPrototypeOf(widget), key);
        if (above?.set) above.set.call(widget, value);
        else slot.own = { value, writable: true, enumerable: true, configurable: true };
      }
    },
  });
  held.claims.set(key, slot);
  return read;
}

function release(held) {
  const { widget } = held;
  try {
    held.editor?.unmount?.();
  } catch {}
  for (const [key, slot] of held.claims) {
    try {
      if (slot.own) Object.defineProperty(widget, key, slot.own);
      else delete widget[key];
    } catch {}
  }
  held.claims.clear();
  delete widget[HELD];
}

function fail(held, error) {
  if (held.broken) return;
  held.broken = true;
  console.warn(`[Open Manager] Nodes 2.0 widgets on the classic canvas: ${held.widget.type} `
    + "fell back to ComfyUI's own drawing", error);
  redraw();
}

function usable(held) {
  return active && !held.broken && !!held.editor && classic();
}

function build(held) {
  const entry = modules.get(held.file);
  if (!entry?.module || held.editor || held.broken) return;
  try {
    held.editor = entry.module.make(held.widget);
  } catch (error) {
    fail(held, error);
  }
  redraw();
}

async function importEditor(file) {
  let last = null;
  for (let attempt = 0; attempt < IMPORT_TRIES; attempt += 1) {
    try {
      return await import(attempt
        ? `./nodes2-widgets/${file}.mjs?retry=${attempt}`
        : `./nodes2-widgets/${file}.mjs`);
    } catch (error) {
      last = error;
      if (attempt + 1 < IMPORT_TRIES) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_MS * (attempt + 1)));
      }
    }
  }
  throw last;
}

function editorFor(held) {
  let entry = modules.get(held.file);
  if (!entry) {
    entry = { module: null, waiting: [], failed: false };
    modules.set(held.file, entry);
    importEditor(held.file).then((module) => {
      entry.module = module;
      for (const one of entry.waiting.splice(0)) build(one);
    }, (error) => {
      entry.failed = true;
      entry.waiting.length = 0;
      console.warn(`[Open Manager] Nodes 2.0 widgets on the classic canvas: ${held.file} did not load`,
        error);
    });
  }
  if (entry.module) build(held);
  else if (!entry.failed) entry.waiting.push(held);
}

function drawEditor(held) {
  return function drawOnCanvas(ctx, node, width, y, rowHeight, lowQuality) {
    const room = (held.widget.computedHeight ?? rowHeight + GAP) - GAP;
    const height = Math.min(room, node.size[1] - y);
    if (height <= 0) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, y, width, height);
    ctx.clip();
    try {
      held.editor.draw(ctx, held.data ?? node, width, y, height, !!lowQuality);
    } catch (error) {
      fail(held, error);
    } finally {
      ctx.restore();
    }
  };
}

function sizeEditor(held) {
  const size = { minHeight: 0, minWidth: 0, maxHeight: undefined };
  return function computeLayoutSizeOnCanvas() {
    try {
      const wanted = held.editor.minSize(held.data ?? held.node);
      size.minHeight = Math.ceil(wanted.minHeight || 0);
      size.minWidth = Math.ceil(wanted.minWidth || 0);
      size.maxHeight = wanted.maxHeight === undefined ? undefined : Math.ceil(wanted.maxHeight);
    } catch (error) {
      fail(held, error);
      size.minHeight = window.LiteGraph.NODE_WIDGET_HEIGHT;
      size.minWidth = 0;
      size.maxHeight = size.minHeight;
    }
    return size;
  };
}

function pointEditor(held) {
  return function pointerDownOnCanvas(pointer, node) {
    if (!held.editor.pointerDown) return false;
    try {
      return held.editor.pointerDown(pointer, held.data ?? node) === true;
    } catch (error) {
      fail(held, error);
      return false;
    }
  };
}

function surfaceView(original, hide) {
  const surfaces = {
    get canvas() {
      const real = original().surfaces;
      if (hide) return "never";
      return real.canvas === "never" && real.vueNode !== "never" ? real.vueNode : real.canvas;
    },
    set canvas(value) {
      original().surfaces.canvas = value;
    },
    get vueNode() {
      return original().surfaces.vueNode;
    },
    set vueNode(value) {
      original().surfaces.vueNode = value;
    },
    get panel() {
      return original().surfaces.panel;
    },
    set panel(value) {
      original().surfaces.panel = value;
    },
  };
  return {
    surfaces,
    get suppression() {
      return original().suppression;
    },
  };
}

function shortLabel(held, label) {
  if (typeof label !== "string") return undefined;
  const { node, widget } = held;
  if (held.name !== widget.name) {
    held.name = widget.name;
    const match = /^(\d+)\.([^.]+)$/.exec(widget.name.slice(held.group.length + 1));
    held.row = match ? `${held.group}.${match[1]}` : null;
    held.field = match ? groupsOf(node).get(held.group)?.get(match[2]) || match[2] : null;
    held.header = null;
  }
  if (!held.field) return undefined;
  if (held.header?.name !== held.row) {
    held.header = node.widgets?.find((one) => one.name === held.row) ?? null;
  }
  const header = held.header?.label;
  return typeof header === "string" && label === `${header} ${held.field}` ? held.field : undefined;
}

function noteNative(type) {
  if (native.has(type)) return;
  native.add(type);
  console.info(`[Open Manager] Nodes 2.0 widgets on the classic canvas: ${type} already draws on `
    + "the canvas; leaving it be");
}

function editorFile(widget, probe) {
  const file = EDITORS[widget.type] ?? (HOSTED.has(widget.type) ? HOSTING : undefined);
  if (!file) return undefined;
  if (typeof probe.draw === "function" || !placeholder(probe)) {
    noteNative(widget.type);
    return undefined;
  }
  return file;
}

function promotedSource(node, input, depth) {
  const subgraph = node.subgraph;
  const ids = input?._subgraphSlot?.linkIds;
  if (!subgraph || !ids || depth > NESTING) return null;
  for (const id of ids) {
    const resolved = subgraph.getLink?.(id)?.resolve?.(subgraph);
    const inner = resolved?.inputNode;
    const slot = resolved?.input;
    const found = inner && slot ? inner.getWidgetFromSlot?.(slot) : null;
    if (!found) continue;
    if (typeof found.drawWidget === "function") return { node: inner, widget: found };
    const deeper = inner.isSubgraphNode?.() ? promotedSource(inner, slot, depth + 1) : null;
    if (deeper) return deeper;
  }
  return null;
}

function promoted(node, widget) {
  for (const input of node.inputs || []) {
    if (input._widget === widget) return promotedSource(node, input, 0);
  }
  return null;
}

function dataNode(host, inner) {
  const bound = new Map();
  return new Proxy(inner, {
    get(target, key) {
      const from = HOST_KEYS.has(key) ? host : target;
      const value = Reflect.get(from, key, from);
      if (typeof value !== "function") return value;
      let kept = bound.get(key);
      if (kept?.raw !== value) bound.set(key, kept = { raw: value, call: value.bind(from) });
      return kept.call;
    },
    set(target, key, value) {
      const to = HOST_KEYS.has(key) ? host : target;
      return Reflect.set(to, key, value, to);
    },
  });
}

function decorate(node, widget) {
  if (!widget || typeof widget !== "object" || widget[HELD] || !Object.isExtensible(widget)) return;
  const projected = typeof widget.drawWidget !== "function" && !!node.isSubgraphNode?.();
  if (projected && (!EDITORS[widget.type] || widget.type === "dynamic_group_row")) return;
  const source = projected ? promoted(node, widget) : null;
  if (projected && !source) return;
  const file = editorFile(widget, source?.widget ?? widget);
  if (source && !file) return;
  const group = file === HOSTING || source ? null : groupOf(node, widget);
  if (!file && !group) return;
  const notice = !!group && widget.type === GROUP_NOTICE;
  if (notice && !placeholder(widget)) return;
  const held = {
    node, widget, file, data: source ? dataNode(node, source.node) : null, editor: null, broken: false,
    claims: new Map(),
  };
  Object.defineProperty(widget, HELD, { value: held, configurable: true });
  try {
    if (file === HOSTING) {
      held.failed = (error) => fail(held, error);
      let view;
      const original = claim(held, "visibility",
        () => (view && held.editor?.host && usable(held) && original()?.surfaces ? view : undefined));
      view = surfaceView(original, true);
      editorFor(held);
    } else if (group) {
      let view;
      const original = claim(held, "visibility",
        () => (view && active && classic() && original()?.surfaces ? view : undefined));
      view = surfaceView(original, notice);
    }
    if (group && !file && !notice) {
      held.group = group;
      const label = claim(held, "label", () => (painting === node ? shortLabel(held, label()) : undefined));
    }
    if (file && file !== HOSTING) {
      const draw = drawEditor(held);
      const size = sizeEditor(held);
      const point = pointEditor(held);
      claim(held, "draw", () => (painting === node && usable(held) ? draw : undefined));
      claim(held, "onPointerDown", () => (usable(held) ? point : undefined));
      claim(held, "computeLayoutSize", () => (usable(held) && held.editor.minSize ? size : undefined));
      editorFor(held);
    }
  } catch (error) {
    release(held);
    console.warn(`[Open Manager] Nodes 2.0 widgets on the classic canvas: ${widget.type} left as it was`,
      error);
    return;
  }
  marked.add(node);
}

function survey(node, count, widgets) {
  seen.set(node, count);
  for (const widget of widgets || []) {
    if (widget && typeof widget === "object") looked.add(widget);
    decorate(node, widget);
  }
}

function unseen(node, widgets) {
  if (!widgets?.length || !node.isSubgraphNode?.()) return false;
  for (const widget of widgets) {
    if (widget && typeof widget === "object" && !looked.has(widget)) return true;
  }
  return false;
}

function framePass(node) {
  for (const widget of node.widgets) {
    const held = widget[HELD];
    const editor = held?.editor;
    if (!editor || !(editor.frame || (editor.linked && widget.connectionSuppressed && !held.data))
      || !usable(held)) {
      continue;
    }
    try {
      if (editor.frame) editor.frame(node, held.failed);
      else editor.linked(node);
    } catch (error) {
      fail(held, error);
    }
  }
}

function heldAt(node, event) {
  if (!node || !marked.has(node) || !event) return null;
  const widget = node.getWidgetOnPos?.(event.canvasX, event.canvasY, true);
  const held = widget?.[HELD];
  return held && usable(held) ? held : null;
}

function onPointerMove() {
  const canvas = app.canvas;
  const node = canvas?.node_over;
  const widget = node && marked.has(node) ? node.mouseOver?.overWidget : null;
  const held = widget?.[HELD];
  const target = held?.editor?.hover && usable(held) ? held : null;
  if (target || hovered) canvas.setDirty(true, false);
  hovered = target;
}

function graphsOf(root) {
  const graphs = root ? [root] : [];
  for (const sub of root?.subgraphs?.values?.() || []) graphs.push(sub);
  return graphs;
}

function releaseAll() {
  for (const graph of graphsOf(app.rootGraph || app.graph)) {
    for (const node of graph.nodes || graph._nodes || []) {
      for (const widget of [...(node.widgets || [])]) {
        if (widget?.[HELD]) release(widget[HELD]);
      }
    }
  }
  for (const entry of modules.values()) {
    try {
      entry.module?.release?.();
    } catch {}
  }
}

export default {
  key: "qolNodes2Widgets",
  name: "Nodes 2.0 widgets on the classic canvas",
  tooltip: "Curves, image compare and crop, video trim and crop, bounding boxes, colour palettes, "
    + "the resolution preview and LoRA stacks work on the classic canvas in place of a Nodes 2.0 "
    + "only placeholder, also when promoted to a subgraph. The painter, the compositor and light "
    + "info show ComfyUI's own editors there.",
  issues: [],
  defaultValue: true,
  verified: "1.57.1",
  check() {
    const graph = window.LiteGraph;
    if (typeof graph?.LGraphNode?.prototype?.drawWidgets !== "function") return "the canvas is not ready";
    if (typeof graph.LGraphCanvas?.prototype?.processContextMenu !== "function") {
      return "the canvas menu has changed";
    }
    if (companionInstalled()) return "ComfyUI-Nodes2Classic draws these widgets";
    return "";
  },
  on(track) {
    const nodeProto = window.LiteGraph.LGraphNode.prototype;
    const canvasProto = window.LiteGraph.LGraphCanvas.prototype;
    const drawWidgets = nodeProto.drawWidgets;
    const processContextMenu = canvasProto.processContextMenu;
    const drawn = function drawWidgetsWithEditors(...args) {
      if (!active || !classic()) return drawWidgets.apply(this, args);
      const widgets = this.widgets;
      const count = widgets?.length ?? 0;
      if (seen.get(this) !== count || unseen(this, widgets)) survey(this, count, widgets);
      if (!marked.has(this)) return drawWidgets.apply(this, args);
      framePass(this);
      const before = painting;
      painting = this;
      try {
        return drawWidgets.apply(this, args);
      } finally {
        painting = before;
      }
    };
    const menued = function processContextMenuWithEditors(node, event) {
      const held = active && classic() ? heldAt(node, event) : null;
      if (held?.editor.contextMenu && !held.widget.computedDisabled) {
        try {
          const point = [event.canvasX - node.pos[0], event.canvasY - node.pos[1]];
          if (held.editor.contextMenu(event, held.data ?? node, point) === true) return undefined;
        } catch (error) {
          fail(held, error);
        }
      }
      return processContextMenu.call(this, node, event);
    };
    nodeProto.drawWidgets = drawn;
    canvasProto.processContextMenu = menued;
    const element = app.canvas?.canvas;
    element?.addEventListener("pointermove", onPointerMove, { passive: true });
    active = true;
    redraw();
    track(() => {
      active = false;
      painting = null;
      hovered = null;
      element?.removeEventListener("pointermove", onPointerMove);
      if (nodeProto.drawWidgets === drawn) nodeProto.drawWidgets = drawWidgets;
      if (canvasProto.processContextMenu === menued) canvasProto.processContextMenu = processContextMenu;
      releaseAll();
      seen = new WeakMap();
      marked = new WeakSet();
      looked = new WeakSet();
      redraw();
    });
  },
};
