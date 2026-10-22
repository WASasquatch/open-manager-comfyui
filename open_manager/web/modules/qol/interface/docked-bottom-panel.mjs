const SPLIT = ':is(.splitter-overlay-bottom, [data-testid="graph-canvas-gutter"])';

const HANDLE = ":is(.p-splitter-gutter, [data-panel-resize-handle-id])";

const GUTTER = "var(--comfy-canvas-gutter)";

const GUTTERS = ["mb", "ml", "mr"].map((side) => `${side}-(--comfy-canvas-gutter)`);

const CONNECTED = "div:has(> .side-toolbar-container > .connected-sidebar)";

const BAR_RIGHT = `div[class~="flex-row-reverse"]:has(> .side-toolbar-container)`;

const SHOWN = `.bottom-panel:not([style*="display: none"])`;

const MAIN = `.p-splitter:has(> .p-splitterpanel > ${SPLIT} > ${SHOWN})`;

function edge(side, before = "") {
  const split = `${before}${SPLIT}[class~="${side}-(--comfy-canvas-gutter)"]`;
  return `${split} > .bottom-panel, ${split} > ${HANDLE}`;
}

const DOCK_CSS = `
${SPLIT} > .bottom-panel { max-width: none; border-radius: 0; border-width: 1px 0 0; }
${SPLIT} > ${HANDLE} { border-radius: 0; }
${SPLIT}[class~="mb-(--comfy-canvas-gutter)"] > .bottom-panel {
  margin-bottom: calc(-1 * ${GUTTER}); }
${edge("ml", `${CONNECTED} `)}, ${edge("ml", `${BAR_RIGHT} `)} { margin-left: calc(-1 * ${GUTTER}); }
${edge("mr")} { margin-right: calc(-1 * ${GUTTER}); }
${MAIN} > .p-splitter-gutter:has(+ .p-splitterpanel[style*="display: none"]) { display: none; }`;

export default {
  key: "qolDockedBottomPanel",
  name: "Bottom panel docked to the edges",
  tooltip: "The Logs and Shortcuts panel meets the sidebar and the window's edges, with square "
    + "corners, in place of floating over the canvas.",
  issues: [],
  defaultValue: true,
  verified: "1.55.17",
  check() {
    const split = document.querySelector(SPLIT);
    if (split && !GUTTERS.some((name) => split.classList.contains(name))) {
      return "the bottom panel already meets the edges";
    }
    return "";
  },
  on(track) {
    const tag = document.createElement("style");
    tag.id = "om-qol-docked-bottom-panel";
    tag.textContent = DOCK_CSS;
    document.head.appendChild(tag);
    track(() => tag.remove());
  },
};
