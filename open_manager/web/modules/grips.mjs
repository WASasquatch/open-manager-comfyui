import { app } from "../../../scripts/app.js";
import { el } from "./ui.mjs";
import { panelSetting } from "./settings.mjs";

const GRIP_MIN = 50;
const GRIP_MAX = 4000;
const GRIP_BAR = 10;
const GRIP_INSET = 18;
const GRIP_TRAIL = 12;
const GRIP_PROP = "om_textarea_heights";

function gripsOn() {
  return panelSetting("openManager.textareaGrips", true) !== false;
}

function gripWidgets(node) {
  return (node?.widgets || []).filter((widget) => widget?.element?.tagName === "TEXTAREA");
}

function gripGrowable(node) {
  return (node?.widgets || []).filter((widget) => typeof widget?.computeLayoutSize === "function"
    && node.isWidgetVisible?.(widget) !== false);
}

function gripHeld(node) {
  const held = node?.properties?.[GRIP_PROP];
  return held && typeof held === "object" ? held : null;
}

function gripClamp(height) {
  return Math.min(Math.max(Math.round(height), GRIP_MIN), GRIP_MAX);
}

function gripPin(widget, height) {
  if (!("omGripMin" in widget)) {
    widget.omGripMin = widget.options.getMinHeight;
    widget.omGripMax = widget.options.getMaxHeight;
  }
  widget.omHeight = height;
  const low = gripTail(widget) ? Math.max(1, height - GRIP_TRAIL) : height;
  widget.options.getMinHeight = () => low;
  widget.options.getMaxHeight = () => height;
}

function gripUnpin(widget) {
  if ("omGripMin" in widget) {
    widget.options.getMinHeight = widget.omGripMin;
    widget.options.getMaxHeight = widget.omGripMax;
    delete widget.omGripMin;
    delete widget.omGripMax;
  }
  delete widget.omHeight;
}

function gripHeightOf(widget) {
  const now = widget.computedHeight;
  if (typeof now === "number" && now > 0) return Math.round(now);
  return gripClamp(widget.computeLayoutSize?.(widget.node)?.minHeight || GRIP_MIN);
}

function gripSave(node) {
  const heights = {};
  for (const widget of gripWidgets(node)) {
    if (typeof widget.omHeight === "number") heights[widget.name] = widget.omHeight;
  }
  node.properties = node.properties || {};
  if (Object.keys(heights).length) node.properties[GRIP_PROP] = heights;
  else delete node.properties[GRIP_PROP];
}

function gripRestore(widget) {
  const height = gripHeld(widget.node)?.[widget.name];
  if (typeof height !== "number") return;
  gripPin(widget, gripClamp(height));
}

function gripFitted(node) {
  const list = gripGrowable(node);
  return list.length > 0 && list.every((widget) => typeof widget.omHeight === "number");
}

function gripGuard(node) {
  if (node.omGripGuard) return;
  node.omGripGuard = true;
  const before = node.onResize;
  node.onResize = function (size) {
    before?.call(this, size);
    if (!gripsOn() || !gripFitted(this)) return;
    const fit = this.computeSize()[1];
    if (size[1] > fit) size[1] = fit;
  };
}

function gripDrag(widget, event) {
  const node = widget.node;
  if (event.button !== 0 || !node) return;
  event.preventDefault();
  event.stopPropagation();
  const grip = event.currentTarget;
  const scale = app.canvas?.ds?.scale || 1;
  const fromY = event.clientY;
  const fromHeight = gripHeightOf(widget);
  const fromNode = node.size[1];
  let height = fromHeight;
  grip.setAttribute("data-om-held", "1");
  grip.setPointerCapture?.(event.pointerId);

  const move = (moved) => {
    const next = gripClamp(fromHeight + (moved.clientY - fromY) / scale);
    if (next === height) return;
    height = next;
    gripPin(widget, height);
    gripGuard(node);
    const fit = node.computeSize()[1];
    node.setSize([node.size[0], Math.max(fit, fromNode + (height - fromHeight))]);
    app.graph?.setDirtyCanvas(true, true);
  };
  const done = () => {
    grip.removeEventListener("pointermove", move);
    grip.removeEventListener("pointerup", done);
    grip.removeEventListener("pointercancel", done);
    grip.removeAttribute("data-om-held");
    grip.releasePointerCapture?.(event.pointerId);
    gripSave(node);
    app.graph?.setDirtyCanvas(true, true);
  };
  grip.addEventListener("pointermove", move);
  grip.addEventListener("pointerup", done);
  grip.addEventListener("pointercancel", done);
}

function gripTail(widget) {
  const node = widget.node;
  const shown = (node?.widgets || []).filter((one) => node.isWidgetVisible?.(one) !== false);
  return shown.at(-1) === widget;
}

function gripPlace(widget) {
  const tail = gripTail(widget);
  if (widget.omGripTail === tail) return;
  widget.omGripTail = tail;
  widget.omGrip.classList.toggle("om-grip-tail", tail);
  if (typeof widget.omHeight === "number") gripPin(widget, widget.omHeight);
  if (tail) widget.element.style.removeProperty("height");
  else widget.element.style.height = `calc(100% - ${GRIP_BAR}px)`;
}

function gripAttach(widget) {
  const wrapper = widget.element.parentElement;
  if (!wrapper) return;
  const grip = el("div", "om-grip");
  grip.addEventListener("pointerdown", (event) => gripDrag(widget, event));
  grip.addEventListener("dblclick", (event) => {
    event.preventDefault();
    gripUnpin(widget);
    gripSave(widget.node);
    app.graph?.setDirtyCanvas(true, true);
  });
  widget.omGrip?.remove();
  wrapper.appendChild(grip);
  widget.omGrip = grip;
  delete widget.omGripTail;
  gripPlace(widget);
  gripRestore(widget);
  gripGuard(widget.node);
}

function gripDetach(widget) {
  widget.omGrip?.remove();
  delete widget.omGrip;
  delete widget.omGripTail;
  widget.element?.style.removeProperty("height");
  gripUnpin(widget);
}

function gripTick() {
  const nodes = app.canvas?.visible_nodes;
  if (!nodes?.length) return;
  const on = gripsOn();
  for (const node of nodes) {
    for (const widget of gripWidgets(node)) {
      if (!on) {
        if (widget.omGrip || typeof widget.omHeight === "number") gripDetach(widget);
        continue;
      }
      if (!widget.element.isConnected) continue;
      if (widget.omGrip?.parentElement === widget.element.parentElement) {
        gripPlace(widget);
        continue;
      }
      gripAttach(widget);
    }
  }
}

function watchGrips() {
  const canvas = app.canvas;
  if (!canvas) {
    setTimeout(watchGrips, 500);
    return;
  }
  const before = canvas.onDrawForeground;
  canvas.onDrawForeground = function (...args) {
    before?.apply(this, args);
    try { gripTick(); } catch { }
  };
}

function applyGrips() {
  if (!gripsOn()) {
    for (const node of app.graph?._nodes || []) {
      for (const widget of gripWidgets(node)) gripDetach(widget);
    }
  }
  app.graph?.setDirtyCanvas(true, true);
}

function gripMenuItem(node) {
  if (!gripsOn()) return null;
  const held = gripHeld(node);
  if (!held || !Object.keys(held).length) return null;
  return {
    content: "Reset text box heights",
    callback: () => {
      for (const widget of gripWidgets(node)) gripUnpin(widget);
      gripSave(node);
      app.graph?.setDirtyCanvas(true, true);
    },
  };
}

export { GRIP_BAR, GRIP_INSET, watchGrips, applyGrips, gripMenuItem };
