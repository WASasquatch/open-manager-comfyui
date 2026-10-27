const HEADER = '.bottom-panel [data-slot="tabs-list"].border-b.border-solid';

const HEADER_CSS = `
${HEADER} {
  border-top-width: 0; border-left-width: 0; border-right-width: 0;
}`;

function hostFramesHeader() {
  const panel = document.createElement("div");
  panel.className = "bottom-panel";
  panel.style.cssText = "position: absolute; visibility: hidden; pointer-events: none;";
  const header = document.createElement("div");
  header.dataset.slot = "tabs-list";
  header.className = "border-b border-solid";
  panel.appendChild(header);
  document.body.appendChild(panel);
  const side = parseFloat(getComputedStyle(header).borderLeftWidth) || 0;
  panel.remove();
  return side > 0;
}

export default {
  key: "qolBottomPanelHeader",
  name: "Bottom panel header has no frame",
  tooltip: "ComfyUI draws a 3px grey border on three sides of the bottom panel's header, the "
    + "panel Logs opens in. On, only the line under the header shows.",
  issues: [],
  defaultValue: true,
  verified: "1.57.4",
  check() {
    return "";
  },
  on(track, standDown) {
    if (!hostFramesHeader()) {
      standDown("ComfyUI draws the bottom panel header without a frame itself");
      return;
    }
    const tag = document.createElement("style");
    tag.id = "om-qol-bottom-panel-header";
    tag.textContent = HEADER_CSS;
    document.head.appendChild(tag);
    track(() => tag.remove());
  },
};
