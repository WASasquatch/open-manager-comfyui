import { app } from "../../../scripts/app.js";

const HIDDEN = "om-qol-name-box-hidden";

const NAME_BOX_CSS = `.subgraph-breadcrumb.${HIDDEN} { display: none !important; }`;

function atRoot() {
  const graph = app.canvas?.graph;
  if (!graph) return false;
  if (typeof graph.isRootGraph === "boolean") return graph.isRootGraph;
  return graph === (app.rootGraph || app.graph);
}

function displayed(item, box) {
  for (let node = item; node && node !== box; node = node.parentElement) {
    if (getComputedStyle(node).display === "none") return false;
  }
  return true;
}

function readBox(box) {
  const items = [...box.querySelectorAll(".p-breadcrumb-item")];
  if (!items.length) return "empty";
  const shown = items.filter((item) => displayed(item, box));
  if (!shown.length) return "hostHides";
  const list = box.querySelector(".p-breadcrumb");
  const others = [...box.children].filter((child) => child !== list && displayed(child, box));
  return shown.length === 1 && !others.length ? "nameOnly" : "more";
}

export default {
  key: "qolHideNameBox",
  name: "Hide the workflow name box at the top level",
  tooltip: "Up to frontend 1.36, a box naming the open workflow sits over the canvas beside its "
    + "own tab. On, the box shows only inside a subgraph, where it carries the path back out.",
  issues: ["Comfy-Org/ComfyUI_frontend#7019", "Comfy-Org/ComfyUI_frontend#6104"],
  defaultValue: false,
  verified: "1.33.14",
  check() {
    if (!window.LiteGraph || !app.canvas) return "the canvas is not ready";
    return "";
  },
  on(track, standDown) {
    const tag = document.createElement("style");
    tag.id = "om-qol-name-box";
    tag.textContent = NAME_BOX_CSS;
    document.head.appendChild(tag);
    track(() => tag.remove());
    let due = 0;
    const sync = () => {
      due = 0;
      try {
        const root = atRoot();
        for (const box of document.querySelectorAll(".subgraph-breadcrumb")) {
          const state = readBox(box);
          if (root && state === "hostHides") {
            standDown("ComfyUI already hides the workflow name at the top level");
            return;
          }
          box.classList.toggle(HIDDEN, root && state === "nameOnly");
        }
      } catch (error) {
        standDown(error);
      }
    };
    const soon = () => {
      if (!due) due = requestAnimationFrame(sync);
    };
    const watcher = new MutationObserver(soon);
    watcher.observe(document.body, { childList: true, subtree: true });
    const surface = app.canvas.canvas;
    surface?.addEventListener("litegraph:set-graph", soon);
    track(() => {
      watcher.disconnect();
      surface?.removeEventListener("litegraph:set-graph", soon);
      if (due) cancelAnimationFrame(due);
      for (const box of document.querySelectorAll(`.${HIDDEN}`)) box.classList.remove(HIDDEN);
    });
    sync();
  },
};
