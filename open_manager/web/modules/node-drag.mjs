import { app } from "../../../scripts/app.js";
import { el, toast, liveTip, notify } from "./ui.mjs";
import { activeWorkflow } from "./workflows.mjs";

const NODE_DRAG_TYPE = "application/x-om-node";

const nodeDropHosts = new Set();

let dragGuardReady = false;

function nodeTypeHere(entry) {
  const types = window.LiteGraph?.registered_node_types;
  const name = entry?.name ? String(entry.name) : "";
  if (!types || !name) return "";
  return Object.prototype.hasOwnProperty.call(types, name) ? name : "";
}

function shownGraph() {
  return app.canvas?.graph || app.graph || null;
}

function addNodeAt(type, at) {
  const lg = window.LiteGraph;
  if (!nodeTypeHere({ name: type })) {
    notify("Not added", `${type} is not registered in this ComfyUI, so it cannot be created.`);
    return null;
  }
  const canvas = app.canvas;
  const graph = shownGraph();
  if (!canvas || !graph) return null;
  let where = [0, 0];
  try {
    where = canvas.convertEventToCanvasOffset(at);
  } catch {
    where = [0, 0];
  }
  const made = lg.createNode(type, undefined, {
    pos: [Math.round(where[0]), Math.round(where[1])],
  });
  if (!made) {
    notify("Not added", `${type} could not be created.`);
    return null;
  }
  canvas.emitBeforeChange?.();
  try {
    graph.add(made);
  } finally {
    canvas.emitAfterChange?.();
  }
  try {
    activeWorkflow()?.changeTracker?.captureCanvasState?.();
  } catch {
  }
  graph.setDirtyCanvas?.(true, true);
  toast(`${made.title || type} added to the graph.`, { kind: "ok" });
  return made;
}

function canvasCentre() {
  const canvas = app.canvas?.canvas;
  const rect = canvas?.getBoundingClientRect();
  if (!rect) return { clientX: 0, clientY: 0 };
  return { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
}

function mountNodeDrop() {
  const canvas = app.canvas?.canvas;
  if (!canvas) return;
  const carried = (event) => [...(event.dataTransfer?.types || [])].includes(NODE_DRAG_TYPE);
  for (const host of [canvas.parentElement, canvas]) {
    if (!host || nodeDropHosts.has(host)) continue;
    nodeDropHosts.add(host);
    host.addEventListener("dragover", (event) => {
      if (!carried(event)) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    }, true);
    host.addEventListener("drop", (event) => {
      if (!carried(event)) return;
      const type = event.dataTransfer.getData(NODE_DRAG_TYPE);
      event.preventDefault();
      event.stopPropagation();
      if (type) addNodeAt(type, event);
    }, true);
  }
}

function guardWindowDrags() {
  if (dragGuardReady) return;
  dragGuardReady = true;
  document.addEventListener("dragstart", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target?.closest(".om-float, .om-dialog, .om-lb, .om-backdrop, .om-task, "
      + ".om-task-pop")) return;
    if (target.closest("[data-om-drag]")) return;
    event.preventDefault();
  }, true);
}

const GHOST_ROW = 15;

const GHOST_ROWS_MAX = 7;

function nodeGhost(entry, type) {
  const lg = window.LiteGraph || {};
  const inputs = entry?.inputs || {};
  const ins = Number(inputs.required || 0) + Number(inputs.optional || 0);
  const outs = (entry?.outputs || []).length;
  const rows = Math.max(1, Math.min(GHOST_ROWS_MAX, Math.max(ins, outs)));
  const ghost = el("div", "om-node-ghost");
  ghost.style.setProperty("--om-ghost-title", lg.NODE_DEFAULT_COLOR || "#333");
  ghost.style.setProperty("--om-ghost-body", lg.NODE_DEFAULT_BGCOLOR || "#353535");
  ghost.style.setProperty("--om-ghost-text", lg.NODE_TITLE_COLOR || "#e6edf3");
  ghost.appendChild(el("div", "om-node-ghost-bar", entry?.display_name || type));
  const body = el("div", "om-node-ghost-body");
  body.style.height = `${rows * GHOST_ROW + 10}px`;
  const dot = (side, at) => {
    const slot = el("span", "om-node-ghost-slot");
    slot.style[side] = "5px";
    slot.style.top = `${at * GHOST_ROW + 8}px`;
    body.appendChild(slot);
  };
  for (let at = 0; at < Math.min(rows, ins); at += 1) dot("left", at);
  for (let at = 0; at < Math.min(rows, outs); at += 1) dot("right", at);
  ghost.appendChild(body);
  return ghost;
}

function carryNode(event, type, entry) {
  if (!event.dataTransfer) return;
  event.dataTransfer.setData(NODE_DRAG_TYPE, type);
  event.dataTransfer.effectAllowed = "copy";
  const ghost = nodeGhost(entry, type);
  document.body.appendChild(ghost);
  try {
    event.dataTransfer.setDragImage(ghost, 14, 12);
  } catch {
  }
  requestAnimationFrame(() => ghost.remove());
}

function graphNodes() {
  const types = window.LiteGraph?.registered_node_types || {};
  const made = [];
  for (const [type, held] of Object.entries(types)) {
    const def = held?.nodeData;
    const ports = def?.inputs && typeof def.inputs === "object" ? Object.values(def.inputs) : [];
    made.push({
      name: type,
      display_name: def?.display_name || held?.title || type,
      category: def?.category || held?.category || "",
      module: def?.python_module || "",
      description: def?.description || "",
      deprecated: def?.deprecated === true,
      experimental: def?.experimental === true,
      inputs: {
        required: ports.filter((one) => one && !one.isOptional).length,
        optional: ports.filter((one) => one && one.isOptional).length,
      },
      takes: ports.map((one) => ({ name: String(one?.name || ""),
                                   type: String(one?.type || ""),
                                   optional: one?.isOptional === true })),
      outputs: (def?.outputs || []).map((one) => String(one?.type || one?.name || "")),
    });
  }
  return made;
}

function nodeDragFrom(item, entry) {
  const type = nodeTypeHere(entry);
  if (!type) {
    item.classList.add("om-node-absent");
    liveTip(item, () => `${entry.name}\nNot registered in this ComfyUI.`);
    return;
  }
  mountNodeDrop();
  guardWindowDrags();
  const dialogued = () => !!item.closest(".om-backdrop");
  liveTip(item, () => ({ lead: type, lines: [dialogued() ? "" : "Drag node to graph"] }));
  item.classList.add("om-node-here");
  item.dataset.omDrag = "1";
  item.draggable = true;
  item.addEventListener("dragstart", (event) => {
    if (event.target instanceof Element && event.target.closest("a")) {
      event.preventDefault();
      return;
    }
    if (dialogued()) {
      event.preventDefault();
      return;
    }
    carryNode(event, type, entry);
  });
  item.ondblclick = (event) => {
    event.stopPropagation();
    addNodeAt(type, canvasCentre());
  };
}

export { addNodeAt, canvasCentre, guardWindowDrags, graphNodes, nodeDragFrom };
