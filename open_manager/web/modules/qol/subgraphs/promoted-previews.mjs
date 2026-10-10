import { app } from "../../../../../scripts/app.js";
import { api } from "../../../../../scripts/api.js";
import { piniaStores } from "../shared.mjs";

const PREVIEW_NAME = "$$canvas-image-preview";

const PREVIEW_MIN = 180;

const PREVIEW_PAD = 6;

const NEST_LIMIT = 8;

const IMAGE_CACHE_MAX = 64;

let active = false;

const images = new Map();

const WIDGET_NAME = "om_subgraph_preview";

const hosts = new Map();

let states = new WeakMap();

const started = new Map();

let sequence = 0;

const STORE_SHAPES = {
  previewExposure: ["getExposures", "addExposure", "removeExposure"],
  nodeOutput: ["getNodeImageUrls"],
};

const warned = new Set();

function frontendStore(id) {
  const store = piniaStores()?.get(id);
  if (!store) return null;
  if (STORE_SHAPES[id].every((name) => typeof store[name] === "function")) return store;
  if (!warned.has(id)) {
    warned.add(id);
    console.info(`[Open Manager] Subgraph nodes show promoted previews: standing down, ComfyUI's ${id} store has changed`);
  }
  return null;
}

function rootOf(node) {
  return node.rootGraph || app.rootGraph;
}

function hostLocator(host) {
  return host.graph?.isRootGraph ? String(host.id) : `${host.graph?.id}:${host.id}`;
}

function exposuresOn(exposures, host) {
  const root = rootOf(host);
  if (!root?.id) return [];
  return exposures.getExposures(root.id, hostLocator(host)) || [];
}

function sourcesOf(exposures, host, hostExecution, only, depth) {
  const found = [];
  for (const exposure of exposuresOn(exposures, host)) {
    if (only && exposure.name !== only) continue;
    const inner = host.subgraph?.getNodeById?.(exposure.sourceNodeId);
    if (!inner) continue;
    const execution = hostExecution ? `${hostExecution}:${inner.id}` : null;
    if (inner.isSubgraphNode?.()) {
      if (depth < NEST_LIMIT) {
        found.push(...sourcesOf(exposures, inner, execution, exposure.sourcePreviewName, depth + 1));
      }
      continue;
    }
    found.push({ node: inner, execution });
  }
  return found;
}

function stateOf(host) {
  let state = states.get(host);
  if (!state) {
    state = { seen: new Map(), active: null, held: [] };
    states.set(host, state);
  }
  return state;
}

function onExecuting(event) {
  if (event.detail != null) started.set(String(event.detail), ++sequence);
}

function sourceUrls(outputs, source) {
  const byRun = source.execution
    ? outputs.getNodeImageUrlsByExecutionId?.(source.execution, source.node)
    : null;
  return (byRun?.length ? byRun : outputs.getNodeImageUrls(source.node)) || [];
}

function previewUrls(host, state) {
  const exposures = frontendStore("previewExposure");
  const outputs = frontendStore("nodeOutput");
  if (!exposures || !outputs) return [];
  const hostExecution = host.graph?.isRootGraph ? String(host.id) : null;
  const current = new Map();
  let fresh = null;
  for (const source of sourcesOf(exposures, host, hostExecution, null, 0)) {
    const key = source.execution || `${source.node.graph?.id}:${source.node.id}`;
    const urls = sourceUrls(outputs, source);
    const signature = urls.map(imageKey).join("\n");
    if (signature && state.seen.get(key) !== signature
      && (!fresh || (started.get(key) || 0) >= (started.get(fresh) || 0))) fresh = key;
    current.set(key, urls);
    state.seen.set(key, signature);
  }
  for (const key of state.seen.keys()) {
    if (!current.has(key)) state.seen.delete(key);
  }
  if (fresh) state.active = fresh;
  if (!current.has(state.active)) {
    state.active = [...current.keys()].findLast((key) => current.get(key).length) ?? null;
    state.held = [];
  }
  return current.get(state.active) || [];
}

function imageKey(url) {
  return String(url).replace(/([?&])rand=[^&]*&?/, "$1").replace(/[?&]$/, "");
}

function imageFor(url) {
  const key = imageKey(url);
  let image = images.get(key);
  if (image) return image;
  image = new Image();
  image.onload = () => app.graph?.setDirtyCanvas(true, false);
  image.src = url;
  images.set(key, image);
  if (images.size > IMAGE_CACHE_MAX) images.delete(images.keys().next().value);
  return image;
}

function gridFor(count, width, height, aspect) {
  let best = { columns: 1, rows: count, fit: 0 };
  for (let columns = 1; columns <= count; columns += 1) {
    const rows = Math.ceil(count / columns);
    const fit = Math.min(width / columns, (height / rows) * aspect);
    if (fit > best.fit) best = { columns, rows, fit };
  }
  return best;
}

function nativelyDrawn(host, mine) {
  return (host.widgets || []).some((widget) => widget !== mine
    && String(widget?.name || "").startsWith("$$"));
}

function loadedPreviews(host) {
  const state = stateOf(host);
  const wanted = previewUrls(host, state).map(imageFor);
  const ready = wanted.filter((image) => image.complete && image.naturalWidth > 0);
  if (ready.length && (ready.length === wanted.length || !state.held.length)) state.held = ready;
  return state.held;
}

function drawGrid(ctx, shown, left, top, width, height) {
  if (!shown.length || width <= 0 || height <= 0) return;
  const aspect = shown[0].naturalWidth / shown[0].naturalHeight;
  const grid = gridFor(shown.length, width, height, aspect);
  const cellWidth = width / grid.columns;
  const cellHeight = height / grid.rows;
  shown.forEach((image, index) => {
    const scale = Math.min(cellWidth / image.naturalWidth, cellHeight / image.naturalHeight);
    const drawWidth = image.naturalWidth * scale;
    const drawHeight = image.naturalHeight * scale;
    const column = index % grid.columns;
    const row = Math.floor(index / grid.columns);
    ctx.drawImage(image,
      left + column * cellWidth + (cellWidth - drawWidth) / 2,
      top + row * cellHeight + (cellHeight - drawHeight) / 2,
      drawWidth, drawHeight);
  });
}

function previewWidget() {
  return {
    name: WIDGET_NAME,
    type: "om-subgraph-preview",
    value: null,
    serialize: false,
    options: { serialize: false },
    hidden: true,
    computeLayoutSize: () => ({ minHeight: PREVIEW_MIN, minWidth: 0 }),
    draw(ctx, node, width, y) {
      try {
        drawGrid(ctx, loadedPreviews(node), PREVIEW_PAD, y,
          width - PREVIEW_PAD * 2, (this.computedHeight ?? PREVIEW_MIN) - PREVIEW_PAD);
      } catch (error) {
        console.warn("[Open Manager] subgraph preview not drawn", error);
      }
    },
  };
}

function detachHost(host) {
  const widget = hosts.get(host);
  hosts.delete(host);
  if (widget && host.widgets?.includes(widget)) host.removeWidget(widget);
  host.setDirtyCanvas?.(true, true);
}

function syncHost(host) {
  let widget = hosts.get(host);
  const exposures = frontendStore("previewExposure");
  const wanted = !window.LiteGraph?.vueNodesMode && !!exposures
    && exposuresOn(exposures, host).length > 0;
  if (!widget && !wanted) return;
  if (!wanted || nativelyDrawn(host, widget)) {
    if (widget) detachHost(host);
    return;
  }
  if (!widget) {
    widget = host.addCustomWidget(previewWidget());
    hosts.set(host, widget);
  }
  const show = loadedPreviews(host).length > 0;
  if (widget.hidden === !show) return;
  widget.hidden = !show;
  if (show) host.setSize([host.size[0], Math.max(host.size[1], host.computeSize()[1])]);
  host.setDirtyCanvas?.(true, true);
}

function releaseHosts() {
  for (const host of [...hosts.keys()]) detachHost(host);
}

function findHosts() {
  for (const host of hosts.keys()) {
    if (!host.graph) hosts.delete(host);
  }
  for (const node of app.canvas?.visible_nodes || []) {
    if (node.isSubgraphNode?.()) syncHost(node);
  }
}

function hostsOf(node) {
  const graph = node.graph;
  if (!graph || graph.isRootGraph) return [];
  const root = rootOf(node);
  const graphs = [root, ...(root?.subgraphs?.values?.() || [])];
  return graphs.flatMap((one) => (one?.nodes || one?._nodes || [])
    .filter((candidate) => candidate.type === graph.id && candidate.isSubgraphNode?.()));
}

function makesPreviews(node) {
  if (node.isSubgraphNode?.()) return false;
  if (node.constructor?.nodeData?.output_node) return true;
  if ((node.outputs || []).some((output) => output?.type === "LATENT")) return true;
  return !!frontendStore("nodeOutput")?.getNodeImageUrls(node)?.length;
}

function exposedHere(exposures, host, node) {
  return exposuresOn(exposures, host)
    .filter((exposure) => String(exposure.sourceNodeId) === String(node.id));
}

function redraw(list) {
  for (const host of list) host.setDirtyCanvas?.(true, true);
  app.canvas?.setDirty?.(true, true);
}

export default {
  key: "qolSubgraphPreviews",
  name: "Subgraph nodes show promoted previews",
  tooltip: "On the classic canvas, draws the latest preview promoted to a subgraph node on that "
    + "node. Any node inside a subgraph that makes images can promote its preview from its "
    + "right-click menu.",
  issues: ["Comfy-Org/ComfyUI_frontend#9859", "Comfy-Org/ComfyUI_frontend#14597"],
  defaultValue: true,
  verified: "1.53.6",
  check() {
    if (!window.LiteGraph || !app.canvas) return "the canvas is not ready";
    if (typeof piniaStores()?.get !== "function") return "ComfyUI's stores are not reachable";
    return "";
  },
  on(track) {
    const canvas = app.canvas;
    const before = canvas.onDrawForeground;
    const mine = function (...args) {
      const result = before?.apply(this, args);
      if (active) {
        try {
          findHosts();
        } catch (error) {
          console.warn("[Open Manager] subgraph previews: host scan failed", error);
        }
      }
      return result;
    };
    canvas.onDrawForeground = mine;
    track(() => {
      if (canvas.onDrawForeground === mine) canvas.onDrawForeground = before;
    });
    api.addEventListener("executing", onExecuting);
    track(() => api.removeEventListener("executing", onExecuting));
    active = true;
    track(() => {
      active = false;
      releaseHosts();
      images.clear();
      states = new WeakMap();
      started.clear();
      app.graph?.setDirtyCanvas(true, true);
    });
    app.graph?.setDirtyCanvas(true, true);
  },
  menu(node) {
    if (!makesPreviews(node)) return [];
    const list = hostsOf(node);
    const exposures = frontendStore("previewExposure");
    if (!list.length || !exposures) return [];
    const missing = list.filter((host) => !exposedHere(exposures, host, node).length);
    if (missing.length) {
      return [{
        content: "Promote Preview",
        callback: () => {
          for (const host of missing) {
            exposures.addExposure(rootOf(host).id, hostLocator(host),
              { sourceNodeId: node.id, sourcePreviewName: PREVIEW_NAME });
          }
          redraw(list);
        },
      }];
    }
    return [{
      content: "Un-Promote Preview",
      callback: () => {
        for (const host of list) {
          for (const exposure of exposedHere(exposures, host, node)) {
            exposures.removeExposure(rootOf(host).id, hostLocator(host), exposure.name);
          }
        }
        redraw(list);
      },
    }];
  },
};
