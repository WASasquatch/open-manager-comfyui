import { piniaStores } from "../shared.mjs";

const COMPONENT = "NodeSearchContent";

const LIST_ID = "results-list";

const MARK = "data-om-rows";

const MIN_ROWS = 150;

const BUFFER = 20;

const TICK = "__omVisibleRows";

const OPEN_WAIT = 1500;

const SPACERS = `#${LIST_ID}[${MARK}]::before, #${LIST_ID}[${MARK}]::after { content: ""; display: block; }
#${LIST_ID}[${MARK}]::before { height: var(--om-rows-above, 0px); }
#${LIST_ID}[${MARK}]::after { height: var(--om-rows-below, 0px); }`;

let active = false;

let quit = null;

let mixin = null;

let sheet = null;

let rowHeight = 56;

let frame = 0;

let created = 0;

let sawList = false;

let current = null;

const lists = new WeakMap();

function vueApp() {
  return document.querySelector("#vue-app")?.__vue_app__ || null;
}

function searchStore() {
  return piniaStores()?.get("searchBox") || null;
}

function bump() {
  const store = searchStore();
  if (store) store[TICK] = (store[TICK] || 0) + 1;
}

function listState(element) {
  if (!lists.has(element)) {
    lists.set(element, { start: 0, end: 0, total: 0, selected: -1 });
    element.addEventListener("scroll", () => onScroll(element), { passive: true });
  }
  return lists.get(element);
}

function onScroll(element) {
  if (frame || !active) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    const state = lists.get(element);
    if (!state || state.total < MIN_ROWS) return;
    const first = Math.floor(element.scrollTop / rowHeight);
    const last = first + Math.ceil(element.clientHeight / rowHeight);
    if ((state.start > 0 && first - state.start < BUFFER / 2)
      || (state.end < state.total && state.end - last < BUFFER / 2)) bump();
  });
}

function rowsOf(list) {
  const kids = Array.isArray(list.children) ? list.children : [];
  return kids.find((kid) => Array.isArray(kid?.children) && kid.children.length
    && kid.children.every((row) => row?.key != null && row.props?.role === "option")) || null;
}

function unmark(element) {
  element.removeAttribute(MARK);
  element.style.removeProperty("--om-rows-above");
  element.style.removeProperty("--om-rows-below");
}

function settle(element, start, end, total, reveal) {
  if (!element?.isConnected) return;
  const state = listState(element);
  Object.assign(state, { start, end, total });
  if (!active || total < MIN_ROWS) {
    unmark(element);
    return;
  }
  element.setAttribute(MARK, "");
  element.style.setProperty("--om-rows-above", `${start * rowHeight}px`);
  element.style.setProperty("--om-rows-below", `${(total - end) * rowHeight}px`);
  const measured = element.querySelector('[role="option"]')?.offsetHeight;
  if (measured && Math.abs(measured - rowHeight) > 0.5) {
    rowHeight = measured;
    bump();
    return;
  }
  if (reveal >= 0) document.getElementById(`result-item-${reveal}`)?.scrollIntoView({ block: "nearest" });
}

function windowRows(list) {
  const store = searchStore();
  if (!store) return;
  sawList = true;
  void store[TICK];
  const fragment = rowsOf(list);
  const rows = fragment?.children || [];
  const total = rows.length;
  const element = document.getElementById(LIST_ID);
  const state = element ? listState(element) : null;
  if (total < MIN_ROWS) {
    if (state) state.selected = -1;
    queueMicrotask(() => settle(document.getElementById(LIST_ID), 0, total, total, -1));
    return;
  }
  const shown = Math.ceil((element?.clientHeight || 800) / rowHeight);
  let first = Math.floor((element?.scrollTop || 0) / rowHeight);
  const selected = rows.findIndex((row) => row.props?.["aria-selected"] === true);
  let reveal = -1;
  if (selected >= 0 && selected !== state?.selected && (selected < first || selected >= first + shown)) {
    first = selected < first ? selected : selected - shown + 1;
    reveal = selected;
  }
  if (state) state.selected = selected;
  const start = Math.max(0, first - BUFFER);
  const end = Math.min(total, first + shown + BUFFER);
  fragment.children = rows.slice(start, end);
  queueMicrotask(() => settle(document.getElementById(LIST_ID), start, end, total, reveal));
}

function walk(node, depth = 0) {
  if (!node || depth > 60) return;
  if (Array.isArray(node)) {
    for (const child of node) walk(child, depth + 1);
    return;
  }
  if (typeof node !== "object") return;
  if (node.props?.id === LIST_ID) {
    windowRows(node);
    return;
  }
  const children = node.children;
  if (Array.isArray(children)) {
    for (const child of children) walk(child, depth + 1);
  } else if (children && typeof children === "object") {
    for (const name of Object.keys(children)) {
      if (typeof children[name] === "function") children[name] = wrapSlot(children[name]);
    }
  }
}

function look(tree) {
  if (!active) return;
  try {
    walk(tree);
  } catch (error) {
    quit?.(error);
  }
}

function wrapSlot(slot) {
  if (slot.__omVisibleRows) return slot;
  const mine = function visibleRowsSlot(...args) {
    const out = slot.apply(this, args);
    look(out);
    return out;
  };
  Object.assign(mine, slot);
  mine.__omVisibleRows = true;
  return mine;
}

function wrapRender(instance) {
  if (typeof instance.render !== "function" || instance.render.__omVisibleRows) return;
  const before = instance.render;
  const mine = function visibleRowsRender(...args) {
    const tree = before.apply(this, args);
    look(tree);
    return tree;
  };
  mine.__omVisibleRows = true;
  instance.render = mine;
  current = { instance, before };
  setTimeout(() => {
    if (active && current?.instance === instance && instance.isMounted && !sawList) {
      quit?.("ComfyUI's node search list changed");
    }
  }, 0);
}

function unwrapRender() {
  if (current?.instance.render?.__omVisibleRows) current.instance.render = current.before;
  current = null;
}

function watchOpen(store) {
  let shown = !!store.visible;
  return store.$subscribe((_mutation, state) => {
    const now = !!state?.visible;
    if (now === shown) return;
    shown = now;
    if (!now || !store.useSearchBoxV2) return;
    const opened = Date.now();
    setTimeout(() => {
      if (!active || created >= opened || !document.getElementById(LIST_ID)) return;
      quit?.("ComfyUI's node search changed");
    }, OPEN_WAIT);
  }, { detached: true });
}

export default {
  key: "qolSearchVisibleRows",
  name: "Node search draws only the rows in view",
  tooltip: "Results build as they scroll into view.",
  issues: [],
  defaultValue: true,
  verified: "1.57.4",
  check() {
    const app = vueApp();
    if (typeof app?.mixin !== "function" || !Array.isArray(app._context?.mixins)) {
      return "ComfyUI's Vue app changed";
    }
    if (typeof searchStore()?.$subscribe !== "function") return "ComfyUI's search box changed";
    return "";
  },
  on(track, standDown) {
    const app = vueApp();
    const store = searchStore();
    active = true;
    quit = standDown;
    if (!(TICK in store)) store[TICK] = 0;
    mixin = {
      created() {
        if (!active || this.$?.type?.__name !== COMPONENT) return;
        created = Date.now();
        sawList = false;
        wrapRender(this.$);
      },
    };
    app.mixin(mixin);
    app._context.optionsCache = new WeakMap();
    sheet = document.createElement("style");
    sheet.textContent = SPACERS;
    document.head.appendChild(sheet);
    const unwatch = watchOpen(store);
    track(() => {
      active = false;
      quit = null;
      unwatch();
      const mixins = app._context.mixins;
      const at = mixins.indexOf(mixin);
      if (at >= 0) mixins.splice(at, 1);
      app._context.optionsCache = new WeakMap();
      unwrapRender();
      for (const element of document.querySelectorAll(`#${LIST_ID}`)) unmark(element);
      sheet?.remove();
      sheet = null;
      mixin = null;
      bump();
    });
  },
};
