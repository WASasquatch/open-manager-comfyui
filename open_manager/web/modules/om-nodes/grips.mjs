import { app } from "../../../../scripts/app.js";
import { gripClamp, gripHeld, gripPin, gripSave, gripUnpin, gripWidgets, gripsOn } from "../grips.mjs";
import { closeChange, contentHeight, currentGraph, nodeOf, openChange, rootOf, scale } from "./resize.mjs";

const GRID = '[data-testid="node-widgets"]';
const SECTION = "grid-rows-subgrid";
const GRIP = "om-row-grip";
const MARK = "data-om-rows";
const RIGID = "data-om-rigid";

const grids = new WeakMap();
const floors = new WeakMap();
const seen = new WeakMap();
const watched = new WeakSet();
let observer = null;
let live = false;
let hooked = false;
let drag = null;
let hoveredRoot = null;

function active() {
  return live && document.documentElement.hasAttribute("data-om-nodes");
}

function rowsOf(grid) {
  const rows = [];
  for (const child of grid.children) {
    if (child.classList.contains(SECTION)) rows.push(...child.children);
    else rows.push(child);
  }
  return rows;
}

function linked(node, widget) {
  const input = node.inputs?.find((one) => one?.widget?.name === widget.name);
  return input?.link !== undefined && input?.link !== null;
}

function boxesOf(node, rows) {
  const list = gripWidgets(node);
  if (!list.length) return [];
  const found = [];
  const loose = [];
  rows.forEach((row, index) => {
    const box = row.querySelector("textarea");
    if (!box) return;
    const named = row.getAttribute("data-widget-name");
    if (named) {
      const widget = list.find((one) => one.name === named);
      if (widget) found.push({ row, box, index, widget });
      return;
    }
    const label = box.parentElement?.querySelector(":scope > label")?.textContent?.trim();
    const hits = label ? list.filter((one) => (one.label || one.name) === label) : [];
    if (hits.length === 1) found.push({ row, box, index, widget: hits[0] });
    else loose.push({ row, box, index });
  });
  if (!loose.length) return found;
  const shown = list.filter((one) => !linked(node, one));
  const all = [...found, ...loose].sort((a, b) => a.index - b.index);
  if (shown.length !== all.length) return found;
  return all.map((entry, at) => ({ ...entry, widget: shown[at] }));
}

function pinned(node, widget) {
  if (typeof widget.omHeight !== "number") {
    const held = gripHeld(node)?.[widget.name];
    if (typeof held !== "number") return null;
    gripPin(widget, gripClamp(held));
  }
  return widget.omHeight;
}

function floorOf(box) {
  let floor = floors.get(box);
  if (floor === undefined) {
    floor = Math.ceil(parseFloat(getComputedStyle(box).minHeight) || 0);
    floors.set(box, floor);
  }
  return floor;
}

function observe(grid) {
  if (watched.has(grid)) return;
  watched.add(grid);
  observer ||= new MutationObserver((records) => {
    for (const record of records) {
      const root = record.target.closest?.(".lg-node[data-node-id]");
      const node = nodeOf(root);
      if (node && root) layout(node, root);
    }
  });
  observer.observe(grid, { attributes: true, attributeFilter: ["style"] });
}

function layout(node, root) {
  const grid = root.querySelector(GRID);
  if (!grid) return null;
  const current = grid.style.gridTemplateRows;
  let state = grids.get(grid);
  if (!state || current !== state.mine) {
    state = { vue: current, mine: current };
    grids.set(grid, state);
  }
  const rows = rowsOf(grid);
  const tokens = state.vue.split(/\s+/).filter(Boolean);
  const boxes = tokens.length === rows.length ? boxesOf(node, rows) : [];
  let pins = 0;
  if (active() && gripsOn()) {
    for (const entry of boxes) {
      if (tokens[entry.index] !== "auto") continue;
      const height = pinned(node, entry.widget);
      if (height === null) continue;
      tokens[entry.index] = `${Math.max(height, floorOf(entry.box))}px`;
      pins += 1;
    }
  }
  const mine = pins ? tokens.join(" ") : state.vue;
  if (mine !== current) grid.style.gridTemplateRows = mine;
  state.mine = grid.style.gridTemplateRows;
  if (pins) {
    grid.setAttribute(MARK, "");
    observe(grid);
  } else {
    grid.removeAttribute(MARK);
  }
  const rigid = pins > 0 && state.vue.includes("auto") && !tokens.includes("auto")
    && !root.querySelector(".lg-node-content");
  if (rigid) grid.setAttribute(RIGID, "");
  else grid.removeAttribute(RIGID);
  return { grid, boxes };
}

function attach(root) {
  const node = nodeOf(root);
  if (!node || root.getAttribute("data-collapsed") !== null) return;
  const found = layout(node, root);
  if (!found) return;
  for (const { box } of found.boxes) {
    const wrapper = box.parentElement;
    if (!wrapper || wrapper.querySelector(`:scope > .${GRIP}`)) continue;
    const grip = document.createElement("div");
    grip.className = GRIP;
    wrapper.appendChild(grip);
  }
}

function entryOf(grip) {
  const root = grip.closest(".lg-node[data-node-id]");
  const node = nodeOf(root);
  if (!node) return null;
  const found = layout(node, root);
  const box = grip.parentElement?.querySelector(":scope > textarea");
  const entry = found?.boxes.find((one) => one.box === box);
  return entry ? { ...entry, node, root } : null;
}

function onOver(event) {
  if (!active() || drag) return;
  const target = event.target;
  const root = target instanceof Element ? target.closest(".lg-node[data-node-id]") : null;
  if (root === hoveredRoot) return;
  hoveredRoot = root;
  if (root && gripsOn()) attach(root);
}

function onDown(event) {
  if (!active() || drag || event.button !== 0) return;
  const grip = event.target instanceof Element ? event.target.closest(`.${GRIP}`) : null;
  if (!grip) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const entry = entryOf(grip);
  if (!entry) return;
  const zoom = scale();
  drag = {
    ...entry,
    grip,
    pointer: event.pointerId,
    y: event.clientY,
    from: entry.row.getBoundingClientRect().height / zoom,
    size: [entry.node.size[0], entry.node.size[1]],
    floor: floorOf(entry.box),
    moved: false,
  };
  openChange(entry.node.graph);
  grip.setAttribute("data-om-held", "");
  try { grip.setPointerCapture?.(event.pointerId); } catch {}
  document.body.style.setProperty("cursor", "ns-resize", "important");
  window.addEventListener("pointermove", onMove, true);
  window.addEventListener("pointerup", onUp, true);
  window.addEventListener("pointercancel", onUp, true);
}

function onMove(event) {
  if (!drag || event.pointerId !== drag.pointer) return;
  const height = Math.max(drag.floor, gripClamp(drag.from + (event.clientY - drag.y) / scale()));
  if (height === drag.height) return;
  drag.height = height;
  drag.moved = true;
  gripPin(drag.widget, height);
  layout(drag.node, drag.root);
  const least = contentHeight(drag.root, drag.size[0]);
  const rigid = drag.root.querySelector(`[${RIGID}]`);
  const wanted = drag.size[1] + (height - drag.from);
  drag.node.setSize([drag.size[0], rigid ? least : Math.max(least, wanted)]);
  app.canvas?.setDirty?.(true, true);
}

function onUp(event) {
  if (!drag || (event.pointerId !== undefined && event.pointerId !== drag.pointer)) return;
  const done = drag;
  drag = null;
  window.removeEventListener("pointermove", onMove, true);
  window.removeEventListener("pointerup", onUp, true);
  window.removeEventListener("pointercancel", onUp, true);
  try { done.grip.releasePointerCapture?.(done.pointer); } catch {}
  done.grip.removeAttribute("data-om-held");
  document.body.style.removeProperty("cursor");
  if (done.moved) gripSave(done.node);
  closeChange(done.node.graph);
  app.canvas?.setDirty?.(true, true);
}

function onDouble(event) {
  if (!active()) return;
  const grip = event.target instanceof Element ? event.target.closest(`.${GRIP}`) : null;
  if (!grip) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const entry = entryOf(grip);
  if (!entry) return;
  openChange(entry.node.graph);
  gripUnpin(entry.widget);
  gripSave(entry.node);
  layout(entry.node, entry.root);
  closeChange(entry.node.graph);
  app.canvas?.setDirty?.(true, true);
}

function tick() {
  if (!active() || drag) return;
  const nodes = currentGraph()?._nodes;
  if (!nodes?.length) return;
  for (const node of nodes) {
    const held = gripHeld(node);
    const last = seen.get(node);
    if (!held && !last) continue;
    const root = rootOf(node);
    const grid = root?.querySelector(GRID);
    if (!grid) continue;
    const state = grids.get(grid);
    if (last && last.grid === grid && last.held === held && state
      && grid.style.gridTemplateRows === state.mine) continue;
    layout(node, root);
    if (held) seen.set(node, { grid, held });
    else seen.delete(node);
  }
}

function hook() {
  if (hooked) return;
  const canvas = app.canvas;
  if (!canvas) {
    setTimeout(hook, 500);
    return;
  }
  hooked = true;
  const before = canvas.onDrawForeground;
  canvas.onDrawForeground = function (...args) {
    const result = before?.apply(this, args);
    try { tick(); } catch {}
    return result;
  };
}

function clear() {
  for (const grip of document.querySelectorAll(`.${GRIP}`)) grip.remove();
  for (const grid of document.querySelectorAll(`[${MARK}], [${RIGID}]`)) {
    const state = grids.get(grid);
    if (state && grid.style.gridTemplateRows === state.mine) grid.style.gridTemplateRows = state.vue;
    grids.delete(grid);
    grid.removeAttribute(MARK);
    grid.removeAttribute(RIGID);
  }
  for (const node of currentGraph()?._nodes || []) seen.delete(node);
  hoveredRoot = null;
}

export function refreshOmGrips() {
  if (!live) return;
  if (!gripsOn()) {
    clear();
    return;
  }
  tick();
}

export function startOmGrips() {
  if (live) return;
  live = true;
  hook();
  document.addEventListener("pointerover", onOver, { capture: true, passive: true });
  document.addEventListener("pointerdown", onDown, true);
  document.addEventListener("dblclick", onDouble, true);
  tick();
}

export function stopOmGrips() {
  if (!live) return;
  if (drag) onUp({ pointerId: drag.pointer });
  live = false;
  document.removeEventListener("pointerover", onOver, { capture: true });
  document.removeEventListener("pointerdown", onDown, true);
  document.removeEventListener("dblclick", onDouble, true);
  clear();
}
