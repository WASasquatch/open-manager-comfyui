import { app } from "../../../../scripts/app.js";
import { panelSetting } from "../settings.mjs";

const EDGE_BAND = 8;
const CORNER_SPAN = 15;
const DOT_REACH = 7;
const FRESH_FRAMES = 40;

const CURSORS = {
  NE: "nesw-resize", SW: "nesw-resize", NW: "nwse-resize", SE: "nwse-resize",
  E: "ew-resize", W: "ew-resize", S: "ns-resize",
};

const BLOCKED = "input, textarea, select, button, a, label, [contenteditable], [role='switch'], "
  + "[role='combobox'], [role='slider'], [data-capture-wheel]";

function blocked(target, event) {
  if (target.closest(BLOCKED)) return true;
  const slot = target.closest(".lg-slot");
  if (!slot) return false;
  const dot = slot.querySelector('[data-testid="slot-dot"]');
  if (!dot) return true;
  const rect = dot.getBoundingClientRect();
  const reach = Math.max(DOT_REACH, rect.width);
  const dx = event.clientX - (rect.left + rect.width / 2);
  const dy = event.clientY - (rect.top + rect.height / 2);
  return dx * dx + dy * dy <= reach * reach;
}

const configured = new WeakSet();
const fresh = new Map();

let live = false;
let drag = null;
let hovered = null;
let freshTimer = 0;

function active() {
  return live && document.documentElement.hasAttribute("data-om-nodes");
}

function titleHeight() {
  return Number(window.LiteGraph?.NODE_TITLE_HEIGHT) || 30;
}

function scale() {
  return app.canvas?.ds?.scale || 1;
}

function currentGraph() {
  return app.canvas?.graph || app.graph || null;
}

function rootOf(node) {
  if (!node || node.id === undefined || node.id === null) return null;
  try {
    return document.querySelector(`.lg-node[data-node-id="${CSS.escape(String(node.id))}"]`);
  } catch {
    return null;
  }
}

function nodeOf(root) {
  const id = root?.getAttribute("data-node-id");
  if (!id) return null;
  try {
    return currentGraph()?.getNodeById?.(id) ?? null;
  } catch {
    return null;
  }
}

function edgeResizeOn() {
  return panelSetting("openManager.edgeResize", true) !== false;
}

function multiResizeOn() {
  return panelSetting("openManager.multiResize", true) !== false;
}

function snapping(event) {
  return !!event.shiftKey || panelSetting("pysssss.SnapToGrid", false) === true;
}

function gridSize() {
  const size = Number(panelSetting("Comfy.SnapToGrid.GridSize", 10));
  return Number.isFinite(size) && size > 0 ? size : 0;
}

function minWidth(node) {
  let computed = 0;
  try {
    computed = Number(node.computeSize?.()?.[0]) || 0;
  } catch {
    computed = 0;
  }
  return Math.max(Number(window.LiteGraph?.NODE_MIN_WIDTH) || 50, computed);
}

function contentHeight(root, width) {
  const style = root.style;
  const keptWidth = style.getPropertyValue("--node-width");
  const keptHeight = style.getPropertyValue("--node-height");
  if (width) style.setProperty("--node-width", `${width}px`);
  style.setProperty("--node-height", "0px");
  const height = root.offsetHeight;
  if (keptHeight) style.setProperty("--node-height", keptHeight);
  else style.removeProperty("--node-height");
  if (keptWidth) style.setProperty("--node-width", keptWidth);
  else style.removeProperty("--node-width");
  return Math.max(0, height - titleHeight());
}

function edgeAt(root, event) {
  const rect = root.getBoundingClientRect();
  const zoom = scale();
  const band = Math.min(12, Math.max(4, EDGE_BAND * zoom));
  const corner = CORNER_SPAN * zoom;
  const x = event.clientX;
  const y = event.clientY;
  if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return null;
  if (y > rect.top + corner && y < rect.bottom - corner) {
    if (x >= rect.right - band) return "E";
    if (x <= rect.left + band) return "W";
  }
  if (x > rect.left + corner && x < rect.right - corner && y >= rect.bottom - band) return "S";
  return null;
}

function openChange(graph) {
  try { app.canvas?.emitBeforeChange?.(); } catch {}
  try { graph?.beforeChange?.(); } catch {}
}

function closeChange(graph) {
  try { graph?.afterChange?.(); } catch {}
  try { app.canvas?.emitAfterChange?.(); } catch {}
}

function resizable(node, root) {
  return !!node && !!root && root.getAttribute("data-collapsed") === null && node.type !== "Reroute"
    && !node.flags?.collapsed && !node.flags?.pinned && !node.pinned && node.resizable !== false;
}

function sides(dir) {
  return {
    west: dir.includes("W"),
    east: dir.includes("E"),
    north: dir.includes("N"),
    south: dir.includes("S"),
  };
}

function companions(node) {
  if (!multiResizeOn()) return [];
  const picked = Object.values(app.canvas?.selected_nodes || {});
  if (picked.length < 2 || !picked.includes(node)) return [];
  return picked.filter((one) => one !== node && !one.flags?.collapsed && !one.flags?.pinned
    && one.resizable !== false).map((one) => {
    const root = rootOf(one);
    return {
      node: one,
      pos: [one.pos[0], one.pos[1]],
      size: [root ? root.offsetWidth : one.size[0], one.size[1]],
      minWidth: minWidth(one),
      minHeight: root ? contentHeight(root) : 0,
    };
  });
}

function begin(event, root, node, dir) {
  const target = event.target;
  drag = {
    node,
    root,
    dir,
    ...sides(dir),
    target,
    pointer: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    pos: [node.pos[0], node.pos[1]],
    size: [root.offsetWidth, node.size[1]],
    minWidth: minWidth(node),
    others: companions(node),
  };
  openChange(node.graph);
  try { target.setPointerCapture?.(event.pointerId); } catch {}
  document.body.style.setProperty("cursor", CURSORS[dir] || "default", "important");
  window.addEventListener("pointermove", move, true);
  window.addEventListener("pointerup", end, true);
  window.addEventListener("pointercancel", end, true);
}

function move(event) {
  if (!drag || event.pointerId !== drag.pointer) return;
  const zoom = scale();
  const dx = (event.clientX - drag.x) / zoom;
  const dy = (event.clientY - drag.y) / zoom;
  let [x, y] = drag.pos;
  let [width, height] = drag.size;
  if (drag.east) width += dx;
  if (drag.west) { width -= dx; x += dx; }
  if (drag.south) height += dy;
  if (drag.north) { height -= dy; y += dy; }
  const grid = snapping(event) ? gridSize() : 0;
  if (grid) {
    if (drag.west) { const snapped = Math.round(x / grid) * grid; width += x - snapped; x = snapped; }
    if (drag.north) { const snapped = Math.round(y / grid) * grid; height += y - snapped; y = snapped; }
    if (drag.east || drag.west) width = Math.ceil(width / grid) * grid;
    if (drag.north || drag.south) height = Math.ceil(height / grid) * grid;
  }
  if (width < drag.minWidth) {
    if (drag.west) x -= drag.minWidth - width;
    width = drag.minWidth;
  }
  const least = contentHeight(drag.root, width);
  if (height < least) {
    if (drag.north) y -= least - height;
    height = least;
  }
  const node = drag.node;
  node.setSize([width, height]);
  if (drag.west || drag.north) node.pos = [x, y];
  const grow = [width - drag.size[0], height - drag.size[1]];
  const shift = [x - drag.pos[0], y - drag.pos[1]];
  for (const other of drag.others) {
    other.node.setSize([
      Math.max(other.minWidth, other.size[0] + grow[0]),
      Math.max(other.minHeight, other.size[1] + grow[1]),
    ]);
    if (drag.west || drag.north) other.node.pos = [other.pos[0] + shift[0], other.pos[1] + shift[1]];
  }
  app.canvas?.setDirty?.(true, true);
}

function end(event) {
  if (!drag || (event.pointerId !== undefined && event.pointerId !== drag.pointer)) return;
  const done = drag;
  drag = null;
  window.removeEventListener("pointermove", move, true);
  window.removeEventListener("pointerup", end, true);
  window.removeEventListener("pointercancel", end, true);
  try { done.target.releasePointerCapture?.(done.pointer); } catch {}
  document.body.style.removeProperty("cursor");
  closeChange(done.node.graph);
  app.canvas?.setDirty?.(true, true);
}

function onDown(event) {
  if (!active() || drag || event.button !== 0) return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  const root = target.closest(".lg-node[data-node-id]");
  if (!root) return;
  let dir = target.closest("[data-corner]")?.getAttribute("data-corner") || "";
  if (!dir) {
    if (!edgeResizeOn()) return;
    dir = edgeAt(root, event) || "";
    if (!dir || blocked(target, event)) return;
  }
  const node = nodeOf(root);
  if (!resizable(node, root)) return;
  event.preventDefault();
  event.stopPropagation();
  begin(event, root, node, dir);
}

function onHover(event) {
  if (drag) return;
  const target = event.target;
  const root = target instanceof Element ? target.closest(".lg-node[data-node-id]") : null;
  let cursor = "";
  if (root && root.getAttribute("data-collapsed") === null && edgeResizeOn()) {
    const edge = edgeAt(root, event);
    if (edge && !target.closest("[data-corner]") && !blocked(target, event)) cursor = CURSORS[edge];
  }
  if (hovered && (hovered !== root || !cursor)) {
    hovered.style.removeProperty("cursor");
    hovered = null;
  }
  if (root && cursor) {
    root.style.setProperty("cursor", cursor);
    hovered = root;
  }
}

export function startResize() {
  if (live) return;
  live = true;
  document.addEventListener("pointerdown", onDown, true);
  document.addEventListener("pointermove", onHover, { capture: true, passive: true });
}

export function stopResize() {
  if (!live) return;
  live = false;
  document.removeEventListener("pointerdown", onDown, true);
  document.removeEventListener("pointermove", onHover, { capture: true });
  if (hovered) hovered.style.removeProperty("cursor");
  hovered = null;
  if (drag) end({ pointerId: drag.pointer });
}

export function fitNodes(nodes) {
  const list = [...new Set(nodes)].filter((node) => node && !node.flags?.collapsed
    && node.type !== "Reroute");
  const graph = list[0]?.graph;
  openChange(graph);
  for (const node of list) {
    const root = rootOf(node);
    if (!root) continue;
    const width = minWidth(node);
    const height = contentHeight(root, width);
    if (height) node.setSize([width, height]);
  }
  closeChange(graph);
  app.canvas?.setDirty?.(true, true);
}

export function fitTargets(node) {
  const picked = Object.values(app.canvas?.selected_nodes || {});
  return picked.length > 1 && picked.includes(node) ? picked : [node];
}

export function watchConfigure() {
  const proto = window.LiteGraph?.LGraphNode?.prototype;
  if (!proto || proto.__omConfigureNoted || typeof proto.configure !== "function") return;
  const original = proto.configure;
  proto.configure = function (...args) {
    configured.add(this);
    return original.apply(this, args);
  };
  proto.__omConfigureNoted = true;
}

function trackerState() {
  try {
    return app.extensionManager?.workflow?.activeWorkflow?.changeTracker?.activeState || null;
  } catch {
    return null;
  }
}

function recordedNode(state, node) {
  if (!state || !node?.graph) return null;
  const rootGraph = node.graph.rootGraph || node.graph;
  let list = null;
  if (node.graph === rootGraph) list = state.nodes;
  else list = state.definitions?.subgraphs?.find((one) => one?.id === node.graph.id)?.nodes;
  if (!Array.isArray(list)) return null;
  return list.find((one) => String(one?.id) === String(node.id)) || null;
}

function settleFresh() {
  freshTimer = 0;
  for (const [node, frames] of fresh) {
    if (configured.has(node) || !node.graph || !active()) {
      fresh.delete(node);
      continue;
    }
    const root = rootOf(node);
    if (!root || !root.offsetHeight) {
      if (frames >= FRESH_FRAMES) fresh.delete(node);
      else fresh.set(node, frames + 1);
      continue;
    }
    fresh.delete(node);
    if (node.flags?.collapsed) continue;
    const height = contentHeight(root, root.offsetWidth);
    if (!height || height >= node.size[1] - 0.5) continue;
    node.setSize([node.size[0], height]);
    const saved = recordedNode(trackerState(), node);
    if (Array.isArray(saved?.size)) saved.size = [node.size[0], node.size[1]];
    app.canvas?.setDirty?.(true, true);
  }
  if (fresh.size && !freshTimer) freshTimer = requestAnimationFrame(settleFresh);
}

export function fitWhenShown(node) {
  if (!active() || !node) return;
  fresh.set(node, 0);
  if (!freshTimer) freshTimer = requestAnimationFrame(settleFresh);
}
