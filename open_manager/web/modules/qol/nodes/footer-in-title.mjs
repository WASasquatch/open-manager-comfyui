import { app } from "../../../../../scripts/app.js";

const ROOT = "html[data-om-footer-in-title]:not([data-om-nodes])";

const NODE = `${ROOT} .lg-node`;

const FOOT = `${NODE} > .box-border.isolate`;

const TAB = `${FOOT} > button`;

const ERROR_TAB = `${FOOT} > button:is(.bg-destructive-background, .bg-destructive, .bg-warning)`;

const ATTR = "data-om-footer-in-title";

const ROW = "--om-footer-row";

const TOP = "--om-footer-top";

const CSS = `
${FOOT} {
  position: absolute !important;
  top: var(${TOP}, 0px);
  right: 6px;
  z-index: 2 !important;
  display: flex !important;
  align-items: center;
  gap: 2px;
  width: auto !important;
  height: var(${ROW}, 32px);
  margin: 0 !important;
  padding: 0 !important;
  clip-path: none !important;
  isolation: auto !important;
}
${TAB} {
  width: 24px !important;
  height: 24px !important;
  min-width: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
  border-radius: 6px !important;
  background: transparent !important;
  box-shadow: none !important;
}
${TAB}:hover {
  background: color-mix(in srgb, currentColor 18%, transparent) !important;
}
${ERROR_TAB} {
  color: var(--destructive-background, #e5484d) !important;
}
${TAB} span {
  display: none !important;
}
${TAB} > div {
  gap: 0 !important;
}
${TAB} i {
  width: 15px !important;
  height: 15px !important;
}
${NODE}:has(> .box-border.isolate > button) .lg-node-header {
  padding-right: 34px !important;
}
${NODE}:has(> .box-border.isolate > button + button) .lg-node-header {
  padding-right: 60px !important;
}
`;

const TABS = ":scope > .box-border.isolate > button, .lg-node > .box-border.isolate > button";

function measure() {
  const header = document.querySelector(".lg-node .lg-node-header");
  const node = header?.closest(".lg-node");
  if (!header || !node || !header.offsetHeight) return false;
  const style = document.documentElement.style;
  const top = header.getBoundingClientRect().top - node.getBoundingClientRect().top;
  const scale = node.getBoundingClientRect().height / (node.offsetHeight || 1) || 1;
  style.setProperty(ROW, `${header.offsetHeight}px`);
  style.setProperty(TOP, `${Math.max(0, Math.round(top / scale))}px`);
  return true;
}

function label(scope) {
  for (const tab of scope.querySelectorAll(TABS)) {
    const text = tab.querySelector("span")?.textContent?.trim();
    if (text && tab.title !== text) tab.title = text;
  }
}

const KEPT = ':scope > .box-border.isolate > :is([data-testid="subgraph-enter-button"], '
  + '[data-testid="advanced-inputs-button"])';

const FOOT_ROOM = [6, 32];

const fitted = new WeakSet();

function fit(root) {
  const page = document.documentElement;
  if (!page.hasAttribute(ATTR) || page.hasAttribute("data-om-nodes")) return;
  if (!root.querySelector(KEPT)) return;
  const graph = app.canvas?.graph;
  const id = root.dataset.nodeId;
  const node = graph?.getNodeById?.(Number(id)) ?? graph?.getNodeById?.(id);
  if (!node || fitted.has(node)) return;
  fitted.add(node);
  if (!node.size || node.flags?.collapsed || typeof node.setSize !== "function") return;
  const held = root.style.minHeight;
  root.style.minHeight = "0px";
  const natural = root.offsetHeight;
  root.style.minHeight = held;
  const room = root.offsetHeight - natural;
  if (room < FOOT_ROOM[0] || room > FOOT_ROOM[1]) return;
  node.setSize([node.size[0], Math.max(0, node.size[1] - room)]);
  app.canvas?.setDirty?.(true, true);
}

function nodesIn(records, into) {
  for (const record of records) {
    const target = record.target instanceof Element ? record.target : record.target?.parentElement;
    const node = target?.closest?.(".lg-node");
    if (node) {
      into.add(node);
      continue;
    }
    for (const added of record.addedNodes || []) {
      if (!(added instanceof Element)) continue;
      if (added.matches(".lg-node")) into.add(added);
      else for (const inner of added.querySelectorAll(".lg-node")) into.add(inner);
    }
  }
}

export default {
  key: "qolFooterInTitle",
  name: "Node error and Enter buttons in the title bar",
  tooltip: "On Nodes 2.0, the Error, Enter subgraph and advanced inputs buttons sit in the node's "
    + "title bar in place of tabs hanging below the node.",
  issues: [],
  defaultValue: true,
  verified: "1.55.18",
  check() {
    return typeof MutationObserver === "function" ? "" : "this browser cannot watch the nodes";
  },
  on(track) {
    const tag = document.createElement("style");
    tag.id = "om-qol-footer-in-title";
    tag.textContent = CSS;
    document.head.appendChild(tag);
    document.documentElement.setAttribute(ATTR, "");

    let measured = false;
    let queued = 0;
    const touched = new Set();
    const sweep = () => {
      queued = 0;
      if (!measured) measured = measure();
      for (const node of touched) {
        if (!node.isConnected) continue;
        label(node);
        fit(node);
      }
      touched.clear();
    };
    const observer = new MutationObserver((records) => {
      nodesIn(records, touched);
      if (touched.size && !queued) queued = requestAnimationFrame(sweep);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    measured = measure();
    label(document);
    for (const node of document.querySelectorAll(".lg-node")) fit(node);

    track(() => {
      observer.disconnect();
      if (queued) cancelAnimationFrame(queued);
      tag.remove();
      document.documentElement.removeAttribute(ATTR);
      document.documentElement.style.removeProperty(ROW);
      document.documentElement.style.removeProperty(TOP);
    });
  },
};
