import { app } from "../../../../../scripts/app.js";
import { piniaStores, linkReveal } from "../shared.mjs";

const NUB = 5;
const NUB_VUE = 8;
const PILL_GAP = 14;
const PILL_HEIGHT = 18;
const PILL_STEP = 22;
const PILL_PAD = 6;
const PILL_FONT = "11px sans-serif";
const OUTLINE = "rgba(0, 0, 0, 0.55)";

let live = false;
let fault = null;
let drawing = null;
let hidden = new Set();
let native = new Set();
let ends = new Map();
let nubs = [];
let shown = new Set();
let called = false;
let measurer = null;

function presentationStore() {
  const store = piniaStores()?.get("linkPresentation");
  return typeof store?.graphHiddenLinkIds === "function" && typeof store?.getPresentation === "function"
    ? store
    : null;
}

function canvasProto() {
  return window.LGraphCanvas?.prototype || null;
}

function scopeOf(graph) {
  return { rootGraphId: graph.rootGraph?.id ?? graph.id, owningGraphId: graph.id };
}

function endsOf(graph, link) {
  const from = graph.getNodeById?.(link.origin_id);
  const to = graph.getNodeById?.(link.target_id);
  if (!from || !to) return null;
  const out = from.getOutputPos?.(link.origin_slot);
  const into = to.getInputPos?.(link.target_slot);
  if (!out || !into) return null;
  const width = from.renderingSize?.[0] ?? from.size?.[0] ?? 0;
  return {
    out: [from.flags?.collapsed ? out[0] : Math.max(out[0], from.pos[0] + width), out[1]],
    into: [to.flags?.collapsed ? into[0] : Math.min(into[0], to.pos[0]), into[1]],
    socketOut: [out[0], out[1]],
    socketIn: [into[0], into[1]],
  };
}

function colourOf(canvas, link) {
  if (typeof link.color === "string" && link.color) return link.color;
  const types = window.LGraphCanvas?.link_type_colors || {};
  return types[link.type] || canvas.default_link_color || "#9a9";
}

function textOf(store, graph, link) {
  const label = store.getPresentation(scopeOf(graph), link.id)?.label?.trim();
  if (label) return label;
  return typeof link.type === "string" && link.type ? link.type : "*";
}

function pillWidth(text) {
  if (!measurer) measurer = document.createElement("canvas").getContext("2d");
  measurer.font = PILL_FONT;
  return measurer.measureText(text).width + PILL_PAD * 2;
}

function filterHidden(original) {
  return function (scope) {
    const ids = original.call(this, scope);
    const canvas = drawing;
    if (!canvas || !ids?.length || !canvas.graph) return ids;
    called = true;
    const graph = canvas.graph;
    const keep = [];
    for (const id of ids) {
      if (linkReveal.links.has(id)) continue;
      hidden.add(id);
      const link = graph.getLink?.(id);
      const where = link ? endsOf(graph, link) : null;
      if (where) ends.set(id, where);
      if (!where || shown.has(id)) {
        native.add(id);
        keep.push(id);
      }
    }
    return keep;
  };
}

function inView(point, area) {
  if (!area) return true;
  return point[0] > area[0] - 20 && point[0] < area[0] + area[2] + 20
    && point[1] > area[1] - 20 && point[1] < area[1] + area[3] + 20;
}

function paintNubs(canvas, ctx) {
  if (linkReveal.drawing) return;
  nubs = [];
  if (!hidden.size || canvas.links_render_mode === window.LiteGraph?.HIDDEN_LINK) return;
  const graph = canvas.graph;
  const radius = window.LiteGraph?.vueNodesMode ? NUB_VUE : NUB;
  const drawn = new Set();
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = OUTLINE;
  for (const id of hidden) {
    const where = ends.get(id);
    if (!where) continue;
    const link = graph.getLink?.(id);
    if (!link) continue;
    for (const [point, side] of [[where.out, 1], [where.into, -1]]) {
      nubs.push({ id, x: point[0], y: point[1], side });
      if (native.has(id)) continue;
      const key = `${Math.round(point[0])}:${Math.round(point[1])}:${side}`;
      if (drawn.has(key) || !inView(point, canvas.visible_area)) continue;
      drawn.add(key);
      ctx.fillStyle = colourOf(canvas, link);
      ctx.beginPath();
      ctx.arc(point[0], point[1], radius, -Math.PI / 2, Math.PI / 2, side < 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }
  ctx.restore();
}

function hoverZone(store, graph, id, x, y) {
  const where = ends.get(id);
  const link = graph.getLink?.(id);
  if (!where || !link) return false;
  const width = pillWidth(textOf(store, graph, link));
  const stack = Math.max(1, shown.size) * PILL_STEP;
  const half = PILL_HEIGHT / 2;
  const outLeft = Math.min(where.out[0], where.socketOut[0]) - NUB_VUE;
  const outRight = where.socketOut[0] + PILL_GAP + width + 4;
  if (x >= outLeft && x <= outRight && y >= where.out[1] - half - 2 && y <= where.out[1] - half + stack) {
    return true;
  }
  const inRight = Math.max(where.into[0], where.socketIn[0]) + NUB_VUE;
  const inLeft = where.socketIn[0] - PILL_GAP - width - 4;
  return x >= inLeft && x <= inRight && y >= where.into[1] - half - 2 && y <= where.into[1] - half + stack;
}

function onMove(event) {
  if (!live || (!nubs.length && !shown.size)) return;
  const canvas = app.canvas;
  const element = canvas?.canvas;
  const graph = canvas?.graph;
  const store = presentationStore();
  if (!element || !graph || !store) return;
  const rect = element.getBoundingClientRect();
  const scale = canvas.ds?.scale || 1;
  const offset = canvas.ds?.offset || [0, 0];
  const x = (event.clientX - rect.left) / scale - offset[0];
  const y = (event.clientY - rect.top) / scale - offset[1];
  const reach = Math.max(NUB_VUE + 2, 9 / scale);
  let next = null;
  const hit = nubs.find((nub) => (nub.x - x) ** 2 + (nub.y - y) ** 2 <= reach * reach);
  if (hit) {
    next = new Set(nubs.filter((nub) => nub.side === hit.side
      && Math.abs(nub.x - hit.x) < 1 && Math.abs(nub.y - hit.y) < 1).map((nub) => nub.id));
  } else if (shown.size && [...shown].some((id) => hoverZone(store, graph, id, x, y))) {
    return;
  } else {
    next = new Set();
  }
  if (next.size === shown.size && [...next].every((id) => shown.has(id))) return;
  shown = next;
  canvas.setDirty?.(false, true);
}

function install(store) {
  const proto = canvasProto();
  const drawConnections = proto.drawConnections;
  const renderSegments = proto._renderAllLinkSegments;
  const hiddenIds = store.graphHiddenLinkIds;
  proto.drawConnections = function (ctx, ...rest) {
    if (!live || this !== app.canvas) return drawConnections.call(this, ctx, ...rest);
    drawing = this;
    hidden = new Set();
    native = new Set();
    ends = new Map();
    called = false;
    try {
      return drawConnections.call(this, ctx, ...rest);
    } finally {
      drawing = null;
      try { paintNubs(this, ctx); } catch {}
      if (!called && this.graph && this.links_render_mode !== window.LiteGraph?.HIDDEN_LINK) {
        let pending = [];
        try { pending = hiddenIds.call(store, scopeOf(this.graph)) || []; } catch {}
        if (pending.length) fault?.("ComfyUI changed how hidden links are drawn");
      }
    }
  };
  proto._renderAllLinkSegments = function (ctx, link, ...rest) {
    if (drawing && link && hidden.has(link.id) && !native.has(link.id)) return undefined;
    return renderSegments.call(this, ctx, link, ...rest);
  };
  store.graphHiddenLinkIds = filterHidden(hiddenIds);
  document.addEventListener("pointermove", onMove, { capture: true, passive: true });
  return () => {
    proto.drawConnections = drawConnections;
    proto._renderAllLinkSegments = renderSegments;
    store.graphHiddenLinkIds = hiddenIds;
    document.removeEventListener("pointermove", onMove, { capture: true });
  };
}

export default {
  key: "qolHiddenLinkNubs",
  name: "Hidden links as nubs",
  tooltip: "A hidden link shows a small nub on each node's edge. Its type label appears on hover.",
  issues: [],
  defaultValue: true,
  verified: "1.55.18",
  check() {
    const proto = canvasProto();
    if (typeof proto?.drawConnections !== "function"
      || typeof proto?._renderAllLinkSegments !== "function") {
      return "ComfyUI's link drawing has changed";
    }
    if (!presentationStore()) return "ComfyUI has no hidden links store";
    return "";
  },
  on(track, standDown) {
    const store = presentationStore();
    const undo = install(store);
    live = true;
    fault = (reason) => {
      if (!live) return;
      live = false;
      standDown(reason);
    };
    app.canvas?.setDirty?.(true, true);
    track(() => {
      live = false;
      fault = null;
      shown = new Set();
      nubs = [];
      undo();
      app.canvas?.setDirty?.(true, true);
    });
  },
};
