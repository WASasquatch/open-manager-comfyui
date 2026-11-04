import { canWatchMounts, watchMounts } from "../shared.mjs";

const COMPONENT = "NodeContent";

const MEDIA = "lg-node-content";

const WIDGETS = ".lg-node-widgets";

const MARK = "data-om-steady";

const RULES = `.lg-node .${MEDIA}[${MARK}] { content-visibility: visible; }`;

function grows(element) {
  return Number.parseFloat(getComputedStyle(element).flexGrow) > 0;
}

function shares(media) {
  const share = media.parentElement;
  const widgets = media.closest(".lg-node")?.querySelector(WIDGETS);
  return !!share && !!widgets && grows(share) && grows(widgets);
}

export default {
  key: "qolSteadyPreviews",
  name: "Previews hold still at the canvas edge",
  tooltip: "On Nodes 2.0 in Firefox, a node with both a panel widget and an image preview "
    + "flickers between two layouts while the preview meets the canvas edge. On, it holds still.",
  issues: [],
  defaultValue: true,
  verified: "1.58.5",
  check() {
    if (!canWatchMounts()) return "ComfyUI's Vue app changed";
    if (!globalThis.CSS?.supports?.("content-visibility", "auto")) {
      return "this browser draws every preview";
    }
    return document.head ? "" : "the page is not ready";
  },
  on(track, standDown) {
    let down = false;
    const sheet = document.createElement("style");
    sheet.id = "om-qol-steady-previews";
    sheet.textContent = RULES;
    document.head.appendChild(sheet);
    track(() => {
      sheet.remove();
      for (const media of document.querySelectorAll(`[${MARK}]`)) media.removeAttribute(MARK);
    });
    const steady = (media) => {
      if (down || !(media instanceof HTMLElement) || !media.isConnected
        || !media.classList.contains(MEDIA) || media.hasAttribute(MARK)) return;
      if (getComputedStyle(media).contentVisibility !== "auto") {
        down = true;
        standDown("ComfyUI draws node previews off screen itself");
        return;
      }
      if (shares(media)) media.setAttribute(MARK, "");
    };
    track(watchMounts(COMPONENT, (instance) => steady(instance.$el)));
    for (const media of document.querySelectorAll(`.lg-node .${MEDIA}`)) steady(media);
  },
};
