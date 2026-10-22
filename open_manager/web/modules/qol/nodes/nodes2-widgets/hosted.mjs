import { api } from "../../../../../../scripts/api.js";
import { piniaStores } from "../../shared.mjs";
import { commit, redraw } from "./kit.mjs";

const ROUTE = "/open_manager/v1/api/qol/frontend-chunks";

const PARTS = {
  painter: { chunk: "WidgetPainter", height: 436, measured: true },
  compositor: { chunk: "WidgetCompositor", height: 200, measured: true },
  lightinfo: { chunk: "LightInfo", height: 320, measured: false },
};

const SURFACES = { canvas: "shown", vueNode: "never", panel: "never" };

const SUFFIX = ".$om";

const MARK = "data-om-host";

const FLEX_MIN = 128;

const MARGIN = 10;

const TRIES = 3;

const RETRY_MS = 1500;

const components = new Map();

const listening = [];

let byNode = new WeakMap();

let watched = new WeakSet();

let paths = null;

let tokens = 0;

function pause(attempt) {
  return new Promise((resolve) => setTimeout(resolve, RETRY_MS * (attempt + 1)));
}

async function retrying(work) {
  let last = null;
  for (let attempt = 0; attempt < TRIES; attempt += 1) {
    try {
      return await work(attempt);
    } catch (error) {
      last = error;
      if (attempt + 1 < TRIES) await pause(attempt);
    }
  }
  throw last;
}

function chunkPaths() {
  if (!paths) {
    paths = retrying(async () => {
      const names = Object.values(PARTS).map((part) => part.chunk).join(",");
      const response = await api.fetchApi(`${ROUTE}?names=${names}`);
      const answer = await response.json();
      if (!answer?.ok) throw new Error(answer?.reason || `the server answered ${response.status}`);
      return answer.chunks || {};
    });
    paths.catch(() => {
      paths = null;
    });
  }
  return paths;
}

function component(type) {
  const { chunk } = PARTS[type];
  let found = components.get(chunk);
  if (!found) {
    found = chunkPaths().then((chunks) => {
      const path = chunks[chunk];
      if (!path) throw new Error(`${chunk} is not part of this frontend`);
      const url = new URL(path, document.baseURI).href;
      return retrying((attempt) => import(attempt ? `${url}?retry=${attempt}` : url));
    }).then((module) => {
      if (!module?.default) throw new Error(`${chunk} has no component`);
      return module.default;
    });
    found.catch(() => components.delete(chunk));
    components.set(chunk, found);
  }
  return found;
}

function domStore() {
  return piniaStores()?.get("domWidget") || null;
}

function onRemoved(event) {
  const node = event?.detail?.node;
  const held = node ? byNode.get(node) : null;
  if (!held) return;
  for (const detach of [...held]) detach();
}

function watch(graph) {
  const events = graph?.events;
  if (!events?.addEventListener || watched.has(events)) return;
  watched.add(events);
  events.addEventListener("node:before-removed", onRemoved);
  listening.push(new WeakRef(events));
}

function track(node, detach) {
  let held = byNode.get(node);
  if (!held) byNode.set(node, held = new Set());
  held.add(detach);
}

function untrack(node, detach) {
  const held = byNode.get(node);
  held?.delete(detach);
  if (held && !held.size) byNode.delete(node);
}

function fixedHeight(root, margin) {
  const gap = parseFloat(getComputedStyle(root).rowGap) || 0;
  let total = 0;
  let count = 0;
  for (const child of root.children) {
    total += parseFloat(getComputedStyle(child).flexGrow) > 0 ? FLEX_MIN : child.offsetHeight;
    count += 1;
  }
  return Math.ceil(total + gap * Math.max(0, count - 1) + margin * 2);
}

function hostFor(node, widget, view, state) {
  const ComponentWidget = window.comfyAPI?.domWidget?.ComponentWidgetImpl;
  if (typeof ComponentWidget !== "function") throw new Error("ComfyUI has no component widgets");
  const host = new ComponentWidget({
    node,
    name: `${widget.name}${SUFFIX}`,
    component: view,
    inputSpec: { name: widget.name, type: widget.type },
    props: { nodeId: node.id, [MARK]: state.token },
    options: {
      surfaces: SURFACES,
      serialize: false,
      hideOnZoom: true,
      getValue: () => widget.value,
      setValue: (value) => commit(node, widget, value),
      getMinHeight: () => state.min,
    },
  });
  host.serialize = false;
  return host;
}

function make(widget) {
  const part = PARTS[widget.type];
  const state = {
    node: null, host: null, loading: false, stopped: false, token: `om-${tokens += 1}`,
    min: part.height, root: null, sizes: null,
  };
  const measure = () => {
    const { root, host } = state;
    if (!root?.isConnected || !root.offsetHeight) return;
    const min = fixedHeight(root, host?.margin ?? MARGIN);
    if (min === state.min) return;
    state.min = min;
    redraw();
  };
  const look = () => {
    const root = document.querySelector(`[${MARK}="${state.token}"]`);
    if (!root || root === state.root) return;
    state.sizes?.disconnect();
    state.root = root;
    state.sizes = new ResizeObserver(measure);
    state.sizes.observe(root);
    for (const child of root.children) state.sizes.observe(child);
    measure();
  };
  const detach = () => {
    const { node, host } = state;
    state.host = null;
    state.sizes?.disconnect();
    state.sizes = null;
    state.root = null;
    if (!node || !host) return;
    untrack(node, detach);
    try {
      if (node.widgets?.includes(host)) node.removeWidget(host);
      else host.onRemove?.();
    } catch {
      domStore()?.unregisterWidget?.(host.id);
    }
  };
  const attach = (node, view) => {
    const store = domStore();
    if (!store?.registerWidget) throw new Error("ComfyUI's widget store is not ready");
    const widgets = node.widgets;
    const at = widgets ? widgets.indexOf(widget) : -1;
    if (at < 0) return;
    const host = hostFor(node, widget, view, state);
    widgets.splice(at + 1, 0, host);
    store.registerWidget(host);
    state.node = node;
    state.host = host;
    track(node, detach);
    watch(node.graph);
    redraw();
  };
  return {
    get host() {
      return state.host;
    },
    frame(node, failed) {
      if (state.host) {
        if (part.measured && !state.root?.isConnected) look();
        return;
      }
      if (state.loading || state.stopped) return;
      state.loading = true;
      component(widget.type).then((view) => {
        state.loading = false;
        if (!state.stopped && node.graph) attach(node, view);
      }).catch((error) => {
        state.loading = false;
        failed(error);
      });
    },
    unmount() {
      state.stopped = true;
      detach();
      redraw();
    },
  };
}

function release() {
  for (const ref of listening.splice(0)) {
    ref.deref()?.removeEventListener("node:before-removed", onRemoved);
  }
  byNode = new WeakMap();
  watched = new WeakSet();
}

export { make, release };
