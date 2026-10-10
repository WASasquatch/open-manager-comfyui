import { app } from "../../../../../scripts/app.js";

const HELD = Symbol("omHostHeight");

const GUARD = Symbol("omWidgetGeometry");

const POINTER_EVENTS = ["pointerdown", "pointermove", "pointerup"];

let hosting = null;

let pointing = null;

const lent = new Set();

const guarded = new Set();

const hosts = new WeakMap();

function classic() {
  return !window.LiteGraph?.vueNodesMode;
}

function close() {
  hosting = null;
  for (const geometry of lent) {
    geometry.lent.width = undefined;
    geometry.lent.y = undefined;
  }
  lent.clear();
}

function open(node) {
  if (!hosting) queueMicrotask(close);
  hosting = node;
}

function guard(node, widget) {
  if (widget[GUARD]) return;
  const geometry = {
    node,
    widget,
    kept: { width: widget.width, y: widget.y },
    lent: { width: undefined, y: undefined },
    own: { draw: Object.getOwnPropertyDescriptor(widget, "draw") },
  };
  for (const key of ["width", "y"]) {
    geometry.own[key] = Object.getOwnPropertyDescriptor(widget, key);
    Object.defineProperty(widget, key, {
      configurable: true,
      enumerable: true,
      get() {
        if (pointing?.widget === widget) return key === "width" ? pointing.width : 0;
        if (hosting === node && geometry.lent[key] !== undefined) return geometry.lent[key];
        return geometry.kept[key];
      },
      set(value) {
        if (hosting === node && classic()) {
          geometry.lent[key] = value;
          lent.add(geometry);
        } else {
          geometry.kept[key] = value;
        }
      },
    });
  }
  const draw = widget.draw;
  if (typeof draw === "function") {
    widget.draw = function drawInHost(ctx, owner, width, ...rest) {
      const surface = ctx?.canvas;
      if (hosting === node && surface && surface !== app.canvas?.canvas) {
        hosts.set(surface, { widget, width });
      }
      return draw.call(this, ctx, owner, width, ...rest);
    };
  }
  widget[GUARD] = geometry;
  guarded.add(geometry);
}

function unguard(geometry) {
  const { widget } = geometry;
  for (const key of ["width", "y"]) {
    const own = geometry.own[key];
    if (own && !("value" in own)) Object.defineProperty(widget, key, own);
    else Object.defineProperty(widget, key, {
      configurable: true, enumerable: true, writable: true, value: geometry.kept[key],
    });
  }
  if (geometry.own.draw) Object.defineProperty(widget, "draw", geometry.own.draw);
  else delete widget.draw;
  delete widget[GUARD];
}

function onPointer(event) {
  const entry = hosts.get(event.target);
  if (!entry || !classic()) return;
  pointing = entry;
  event.target.addEventListener(event.type, () => { pointing = null; }, { once: true });
}

function graphsOf(root) {
  const graphs = root ? [root] : [];
  for (const sub of root?.subgraphs?.values?.() || []) graphs.push(sub);
  return graphs;
}

function cleanHeld(node) {
  if (!Object.hasOwn(node, "canvasHeight")) return;
  const height = node.canvasHeight;
  delete node.canvasHeight;
  node[HELD] = height;
  if (!classic()) return;
  for (const widget of node.widgets || []) widget.width = undefined;
}

export default {
  key: "qolWidgetWidth",
  name: "Custom widgets follow their node's width",
  tooltip: "On the classic canvas, ComfyUI gives custom and DOM widgets the width of the "
    + "properties panel once a node is shown there, so they stop following the node when it "
    + "is resized. On, the panel's width stays in the panel.",
  issues: [
    "Comfy-Org/ComfyUI_frontend#12443",
    "Comfy-Org/ComfyUI_frontend#13068",
    "Comfy-Org/ComfyUI_frontend#19548",
  ],
  defaultValue: true,
  verified: "1.54.8",
  check() {
    const proto = window.LiteGraph?.LGraphNode?.prototype;
    if (!proto) return "the canvas is not ready";
    if (Object.getOwnPropertyDescriptor(proto, "canvasHeight")) {
      return "ComfyUI now defines canvasHeight itself";
    }
    return "";
  },
  on(track) {
    const proto = window.LiteGraph.LGraphNode.prototype;
    Object.defineProperty(proto, "canvasHeight", {
      configurable: true,
      get() {
        return this[HELD];
      },
      set(value) {
        this[HELD] = value;
        if (!classic()) return;
        for (const widget of this.widgets || []) guard(this, widget);
        open(this);
      },
    });
    track(() => { delete proto.canvasHeight; });
    for (const graph of graphsOf(app.rootGraph || app.graph)) {
      for (const node of graph.nodes || graph._nodes || []) cleanHeld(node);
    }
    for (const type of POINTER_EVENTS) window.addEventListener(type, onPointer, true);
    track(() => {
      for (const type of POINTER_EVENTS) window.removeEventListener(type, onPointer, true);
      pointing = null;
      close();
      for (const geometry of guarded) unguard(geometry);
      guarded.clear();
    });
  },
};
