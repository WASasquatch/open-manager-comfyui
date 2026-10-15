const STRIP = ".workflow-tabs-scroll";

const STRIP_CSS = `
.workflow-tabs-container .workflow-tabs-scroll { scrollbar-width: none; }
.workflow-tabs-container .workflow-tabs-scroll::-webkit-scrollbar { display: none; }`;

const LINE_PX = 16;

export default {
  key: "qolTabScrollbar",
  name: "Workflow tabs without a scrollbar",
  tooltip: "The tab strip drops its scrollbar. Its arrows and the mouse wheel scroll it.",
  issues: [],
  defaultValue: true,
  verified: "1.55.17",
  check() {
    const strip = document.querySelector(STRIP);
    if (strip && getComputedStyle(strip).scrollbarWidth === "none") {
      return "the tab strip has no scrollbar";
    }
    return "";
  },
  on(track) {
    const tag = document.createElement("style");
    tag.id = "om-qol-tab-scrollbar";
    tag.textContent = STRIP_CSS;
    document.head.appendChild(tag);
    track(() => tag.remove());

    const onWheel = (event) => {
      if (event.deltaX || !event.deltaY || event.ctrlKey) return;
      const strip = event.target instanceof Element ? event.target.closest(STRIP) : null;
      if (!strip || strip.scrollWidth <= strip.clientWidth) return;
      const before = strip.scrollLeft;
      const by = event.deltaMode === 1 ? event.deltaY * LINE_PX : event.deltaY;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (strip.isConnected && strip.scrollLeft === before) strip.scrollLeft = before + by;
      }));
    };
    document.addEventListener("wheel", onWheel, { capture: true, passive: true });
    track(() => document.removeEventListener("wheel", onWheel, { capture: true }));
  },
};
