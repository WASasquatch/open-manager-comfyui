import { canWatchMounts, graphNodes, shownWidget, watchMounts } from "../shared.mjs";

const COMPONENT = "WidgetDOM";

const FIT = "om-panel-fit";

const LEAST = "--om-panel-min";

const MOST = "--om-panel-max";

const TALLEST = 100000;

const RULES = `.${FIT} { min-height: var(${LEAST}, 0px); max-height: var(${MOST}, none); }
.${FIT} > * { flex: 1 1 0px; min-height: 0; }`;

let sheet = null;

let watcher = null;

let owners = new WeakMap();

function declared(widget) {
  const options = widget?.options || {};
  return typeof options.getMinHeight === "function" || typeof options.getHeight === "function"
    || Object.hasOwn(widget, "computeLayoutSize");
}

function range(node, widget) {
  try {
    const size = widget.computeLayoutSize?.(node);
    const least = Number(size?.minHeight);
    const most = Number(size?.maxHeight);
    const floor = Number.isFinite(least) && least > 0 ? least : 0;
    const roof = Number.isFinite(most) && most >= floor && most < TALLEST ? most : null;
    return { least: floor, most: roof };
  } catch {
    return null;
  }
}

function put(box, name, value) {
  if (value === null) {
    if (box.style.getPropertyValue(name)) box.style.removeProperty(name);
  } else if (box.style.getPropertyValue(name) !== value) {
    box.style.setProperty(name, value);
  }
}

function follow(node, box) {
  const root = box.closest(".lg-node");
  if (!root || !watcher || owners.get(root) === node) return;
  owners.set(root, node);
  watcher.observe(root);
}

function fit(node, widget) {
  const box = widget?.element?.parentElement;
  if (!box || !box.classList.contains("*:flex-1") || !declared(widget)) return;
  const span = range(node, widget);
  if (!span) return;
  if (!box.classList.contains(FIT)) box.classList.add(FIT);
  put(box, LEAST, `${span.least}px`);
  put(box, MOST, span.most === null ? null : `${span.most}px`);
  follow(node, box);
}

function refit(entries) {
  for (const { target } of entries) {
    const node = owners.get(target);
    if (!node || !target.isConnected) {
      watcher?.unobserve(target);
      owners.delete(target);
      continue;
    }
    for (const widget of node.widgets || []) fit(node, widget);
  }
}

function unfit(box) {
  box.classList.remove(FIT);
  box.style.removeProperty(LEAST);
  box.style.removeProperty(MOST);
}

function shown(instance) {
  const found = shownWidget(instance);
  if (found) fit(found.node, found.widget);
}

export default {
  key: "qolPanelWidgetHeight",
  name: "Panels fit their node and scroll",
  tooltip: "On Nodes 2.0, ComfyUI sizes a panel widget to everything in it, so a long readout "
    + "stretches its node and cannot scroll. On, a panel that sets its own height opens at it, "
    + "grows and shrinks with its node, and scrolls.",
  issues: [],
  defaultValue: true,
  verified: "1.57.4",
  check() {
    if (!window.LiteGraph) return "the canvas is not ready";
    if (!canWatchMounts()) return "ComfyUI's Vue app changed";
    if (typeof ResizeObserver !== "function") return "this browser cannot watch node sizes";
    return "";
  },
  on(track) {
    sheet = document.createElement("style");
    sheet.textContent = RULES;
    document.head.appendChild(sheet);
    owners = new WeakMap();
    watcher = new ResizeObserver(refit);
    const stop = watchMounts(COMPONENT, shown);
    for (const node of graphNodes()) {
      for (const widget of node.widgets || []) fit(node, widget);
    }
    track(() => {
      stop();
      watcher?.disconnect();
      watcher = null;
      for (const box of document.querySelectorAll(`.${FIT}`)) unfit(box);
      sheet?.remove();
      sheet = null;
    });
  },
};
