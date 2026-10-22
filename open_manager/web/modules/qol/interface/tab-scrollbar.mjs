const SCROLLER = ".workflow-tabs-scroll";

const STRIP = `:is(${SCROLLER}, [data-testid="workflow-tab-strip"])`;

const BAR = ".workflow-tabs-container";

const BEFORE = `${BAR} > button:has(+ div > ${SCROLLER}):has(> i[class*="chevron-left"])`;

const AFTER = `${BAR} > div:has(> ${SCROLLER}) + button:has(> i[class*="chevron-right"])`;

const FADE = "28px";

const STRIP_CSS = `
${BAR} ${STRIP} { scrollbar-width: none; --om-fade-l: 0px; --om-fade-r: 0px;
  -webkit-mask-image: linear-gradient(to right, transparent, #000 var(--om-fade-l),
    #000 calc(100% - var(--om-fade-r)), transparent);
  mask-image: linear-gradient(to right, transparent, #000 var(--om-fade-l),
    #000 calc(100% - var(--om-fade-r)), transparent); }
${BAR} ${STRIP}::-webkit-scrollbar { display: none; }
${BAR} ${STRIP}[data-om-more~="left"] { --om-fade-l: ${FADE}; }
${BAR} ${STRIP}[data-om-more~="right"] { --om-fade-r: ${FADE}; }
${BEFORE}, ${AFTER} { align-self: stretch !important; height: auto !important; width: 28px !important;
  min-width: 28px; padding: 0 !important; border-radius: 0 !important; opacity: 1 !important;
  color: var(--fg-color, #ddd) !important; }
${BEFORE} > i, ${AFTER} > i { width: 18px !important; height: 18px !important; }
${BEFORE}:hover:not(:disabled), ${AFTER}:hover:not(:disabled) {
  background: color-mix(in srgb, var(--fg-color, #fff) 9%, transparent) !important; }
${BEFORE}:disabled, ${AFTER}:disabled { opacity: .3 !important; cursor: default; }`;

const LINE_PX = 16;

export default {
  key: "qolTabScrollbar",
  name: "Workflow tabs without a scrollbar",
  tooltip: "The tab strip drops its scrollbar. Faded edges show where more tabs are, and the mouse "
    + "wheel scrolls to them.",
  issues: [],
  defaultValue: true,
  verified: "1.57.1",
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

    const mark = (strip) => {
      const most = strip.scrollWidth - strip.clientWidth;
      const more = [];
      if (most > 1 && strip.scrollLeft > 1) more.push("left");
      if (most > 1 && strip.scrollLeft < most - 1) more.push("right");
      const said = more.join(" ");
      if ((strip.dataset.omMore || "") === said) return;
      if (said) strip.dataset.omMore = said;
      else delete strip.dataset.omMore;
    };
    const onScroll = (event) => mark(event.currentTarget);
    let watched = null;
    let due = 0;
    let hunting = false;
    const hunt = (on) => {
      if (on === hunting) return;
      hunting = on;
      if (on) seek.observe(document.body, { childList: true, subtree: true });
      else seek.disconnect();
    };
    const settle = () => {
      due = 0;
      const strip = document.querySelector(STRIP);
      hunt(!strip);
      if (strip !== watched) {
        sized.disconnect();
        watched?.removeEventListener("scroll", onScroll);
        if (watched) delete watched.dataset.omMore;
        watched = strip;
        if (strip) {
          sized.observe(strip);
          if (strip.firstElementChild) sized.observe(strip.firstElementChild);
          strip.addEventListener("scroll", onScroll, { passive: true });
        }
      }
      if (!strip) return;
      strip.dispatchEvent(new Event("scroll"));
      mark(strip);
    };
    const soon = () => {
      if (!due) due = requestAnimationFrame(settle);
    };
    const sized = new ResizeObserver(soon);
    const seek = new MutationObserver(soon);
    window.addEventListener("resize", soon);
    soon();
    track(() => {
      sized.disconnect();
      seek.disconnect();
      window.removeEventListener("resize", soon);
      if (due) cancelAnimationFrame(due);
      watched?.removeEventListener("scroll", onScroll);
      if (watched) delete watched.dataset.omMore;
    });
  },
};
