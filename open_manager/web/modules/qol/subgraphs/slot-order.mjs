import { app } from "../../../../../scripts/app.js";
import { piniaStores } from "../shared.mjs";

const OPTIONS = "_getSlotMenuOptions";

const ACTION = "_onSlotMenuAction";

const UP = "om-slot-move-up";

const DOWN = "om-slot-move-down";

const NATIVE_MENU = /reorder|move ?up|move ?down/i;

const PARKED = 1000000;

const NATIVE = "ComfyUI reorders subgraph inputs and outputs itself";

let owner = null;

function ownerOf(ioNode) {
  for (let proto = Object.getPrototypeOf(ioNode); proto; proto = Object.getPrototypeOf(proto)) {
    if (Object.hasOwn(proto, OPTIONS) && Object.hasOwn(proto, ACTION)) return proto;
  }
  return null;
}

function nativeReorder(subgraph) {
  return typeof subgraph?.reorderInput === "function" || typeof subgraph?.reorderOutput === "function";
}

function sideOf(ioNode) {
  const subgraph = ioNode?.subgraph;
  if (!subgraph) return null;
  if (subgraph.inputNode === ioNode && Array.isArray(subgraph.inputs)) return "inputs";
  if (subgraph.outputNode === ioNode && Array.isArray(subgraph.outputs)) return "outputs";
  return null;
}

function hostsOf(subgraph) {
  const root = subgraph.rootGraph || app.rootGraph || app.graph;
  const graphs = root ? [root, ...(root.subgraphs?.values?.() || [])] : [];
  return graphs.flatMap((graph) => graph?.nodes || graph?._nodes || [])
    .filter((node) => node?.subgraph === subgraph && node.isSubgraphNode?.());
}

function linksOf(graph) {
  const found = [];
  for (const links of [graph?.links, graph?.floatingLinks]) {
    if (!links) continue;
    for (const link of typeof links.values === "function" ? links.values() : Object.values(links)) {
      if (link) found.push(link);
    }
  }
  return found;
}

function relink(graph, nodeId, end, newIndexOf) {
  const idKey = `${end}_id`;
  const slotKey = `${end}_slot`;
  const moves = [];
  for (const link of linksOf(graph)) {
    if (String(link[idKey]) !== String(nodeId)) continue;
    const to = newIndexOf.get(link[slotKey]);
    if (to !== undefined && to !== link[slotKey]) moves.push([link, to]);
  }
  moves.forEach(([link], at) => {
    link[slotKey] = PARKED + at;
  });
  for (const [link, to] of moves) link[slotKey] = to;
  return moves.every(([link, to]) => link[slotKey] === to);
}

function permute(list, order) {
  const before = [...list];
  list.splice(0, list.length, ...order.map((index) => before[index]));
}

function syncWidgetOrder(host) {
  const store = piniaStores()?.get("widgetValue");
  const rootId = host.rootGraph?.id;
  if (typeof store?.setNodeWidgetOrder !== "function" || !rootId) return;
  store.setNodeWidgetOrder(rootId, host.id,
    host.inputs.flatMap((input) => (input.widgetId ? [input.widgetId] : [])));
}

function reorder(subgraph, side, order) {
  const hosts = hostsOf(subgraph);
  if (hosts.some((host) => host[side]?.length !== subgraph[side].length)) {
    console.warn(`[Open Manager] Subgraph slot order: a node using "${subgraph.name}" has other ${side}; nothing moved`);
    return;
  }
  const inputs = side === "inputs";
  const ioNode = inputs ? subgraph.inputNode : subgraph.outputNode;
  const newIndexOf = new Map(order.map((from, to) => [from, to]));
  const oldOrder = subgraph[side].map((slot) => slot.id);
  let linked = true;
  app.canvas?.emitBeforeChange?.();
  try {
    linked = relink(subgraph, ioNode.id, inputs ? "origin" : "target", newIndexOf) && linked;
    permute(subgraph[side], order);
    for (const host of hosts) {
      if (host.graph) linked = relink(host.graph, host.id, inputs ? "target" : "origin", newIndexOf) && linked;
      permute(host[side], order);
      if (inputs) syncWidgetOrder(host);
      host._setConcreteSlots?.();
      host.setDirtyCanvas?.(true, true);
    }
    if (inputs) {
      subgraph.events?.dispatch?.("inputs-reordered", {
        subgraph, oldOrder, newOrder: subgraph.inputs.map((slot) => slot.id),
      });
    }
  } finally {
    app.canvas?.emitAfterChange?.();
  }
  if (!linked) console.warn(`[Open Manager] Subgraph slot order: a link in "${subgraph.name}" kept its old slot`);
}

function move(ioNode, slot, step) {
  const side = sideOf(ioNode);
  if (!side) return;
  const slots = ioNode.subgraph[side];
  const from = slots.indexOf(slot);
  const to = from + step;
  if (from < 0 || to < 0 || to >= slots.length) return;
  const order = slots.map((_, index) => index);
  order.splice(to, 0, ...order.splice(from, 1));
  reorder(ioNode.subgraph, side, order);
}

function addMoves(ioNode, slot, items, standDown) {
  const side = sideOf(ioNode);
  if (!side || !Array.isArray(items)) return;
  if (nativeReorder(ioNode.subgraph)) {
    standDown(NATIVE);
    return;
  }
  if (items.some((item) => item?.value === UP || item?.value === DOWN)) return;
  const slots = ioNode.subgraph[side];
  const index = slots.indexOf(slot);
  if (index < 0 || slots.length < 2) return;
  const moves = [];
  if (index > 0) moves.push({ content: "Move Up", value: UP });
  if (index < slots.length - 1) moves.push({ content: "Move Down", value: DOWN });
  const separator = items.indexOf(null);
  items.splice(separator < 0 ? items.length : separator, 0, ...moves);
}

function install(proto, track, standDown) {
  const options = proto[OPTIONS];
  const action = proto[ACTION];
  if (typeof options !== "function" || typeof action !== "function") {
    standDown("subgraph slot menus are no longer built the way this patch expects");
    return;
  }
  if (NATIVE_MENU.test(String(options))) {
    standDown(NATIVE);
    return;
  }
  owner = proto;
  const withMoves = function getSlotMenuOptions(slot, ...rest) {
    const items = options.call(this, slot, ...rest);
    try {
      addMoves(this, slot, items, standDown);
    } catch (error) {
      console.warn("[Open Manager] Subgraph slot order: menu left as it was", error);
    }
    return items;
  };
  const onAction = function onSlotMenuAction(item, slot, ...rest) {
    const step = item?.value === UP ? -1 : item?.value === DOWN ? 1 : 0;
    if (!step) return action.call(this, item, slot, ...rest);
    try {
      move(this, slot, step);
    } catch (error) {
      console.warn("[Open Manager] Subgraph slot order: move failed", error);
    }
    this.subgraph?.setDirtyCanvas?.(true, true);
  };
  proto[OPTIONS] = withMoves;
  proto[ACTION] = onAction;
  track(() => {
    if (proto[OPTIONS] === withMoves) proto[OPTIONS] = options;
    if (proto[ACTION] === onAction) proto[ACTION] = action;
    owner = null;
  });
}

function discover(ioNode, track, standDown) {
  if (nativeReorder(ioNode.subgraph)) {
    standDown(NATIVE);
    return;
  }
  const proto = ownerOf(ioNode);
  if (proto) install(proto, track, standDown);
  else standDown("subgraph slot menus are no longer built the way this patch expects");
}

function shownIoNode() {
  const shown = app.canvas?.graph;
  if (shown?.inputNode) return shown.inputNode;
  const root = app.rootGraph || app.graph;
  for (const subgraph of root?.subgraphs?.values?.() || []) {
    if (subgraph?.inputNode) return subgraph.inputNode;
  }
  return null;
}

export default {
  key: "qolSubgraphSlotOrder",
  name: "Subgraph inputs and outputs move up and down",
  tooltip: "An input or output's menu inside a subgraph has Move Up and Move Down. Every node "
    + "using the subgraph takes the new order and keeps its links.",
  issues: ["Comfy-Org/ComfyUI_frontend#4195"],
  defaultValue: true,
  verified: "1.58.5",
  check() {
    if (!app.canvas?.canvas?.addEventListener) return "the canvas is not ready";
    return "";
  },
  on(track, standDown) {
    const found = shownIoNode();
    if (found) {
      discover(found, track, standDown);
      return;
    }
    const element = app.canvas.canvas;
    const onGraph = (event) => {
      const ioNode = event?.detail?.newGraph?.inputNode;
      if (!ioNode || owner) return;
      element.removeEventListener("litegraph:set-graph", onGraph);
      discover(ioNode, track, standDown);
    };
    element.addEventListener("litegraph:set-graph", onGraph);
    track(() => element.removeEventListener("litegraph:set-graph", onGraph));
  },
};
