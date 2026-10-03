import { app } from "../../../scripts/app.js";
import { askText, toast } from "./ui.mjs";

const COMMAND_ID = "openManager.goToNode";

const NATIVE_ID = "Comfy.Canvas.GoToNode";

const LABEL = "Go to Node";

let enabled = false;

let fault = null;

function piniaStores() {
  return document.querySelector("#vue-app")?.__vue_app__?.config?.globalProperties?.$pinia?._s
    || null;
}

function commandStore() {
  const store = piniaStores()?.get("command");
  return typeof store?.registerCommand === "function" && typeof store?.isRegistered === "function"
    ? store
    : null;
}

function rootGraph() {
  const graph = app.canvas?.graph;
  return graph?.rootGraph || app.rootGraph || app.graph;
}

function parse(text) {
  const parts = String(text ?? "").trim().replace(/^#/, "").split(":").map((part) => part.trim());
  return parts.length && parts.every((part) => /^[\w-]+$/.test(part)) ? parts : null;
}

function byPath(parts) {
  let graph = rootGraph();
  const hosts = [];
  for (const [index, part] of parts.entries()) {
    const node = graph?.getNodeById?.(part);
    if (!node) return null;
    if (index === parts.length - 1) return { node, hosts };
    if (!node.isSubgraphNode?.() || !node.subgraph) return null;
    hosts.push(node);
    graph = node.subgraph;
  }
  return null;
}

function bySearch(id) {
  const here = app.canvas?.graph?.getNodeById?.(id);
  if (here) return { node: here, hosts: null };
  const seen = new Set();
  const queue = [{ graph: rootGraph(), hosts: [] }];
  while (queue.length) {
    const { graph, hosts } = queue.shift();
    if (!graph || seen.has(graph)) continue;
    seen.add(graph);
    const node = graph.getNodeById?.(id);
    if (node) return { node, hosts };
    for (const host of graph.nodes || graph._nodes || []) {
      if (host.isSubgraphNode?.() && host.subgraph) {
        queue.push({ graph: host.subgraph, hosts: [...hosts, host] });
      }
    }
  }
  return null;
}

function locate(parts) {
  return parts.length > 1 ? byPath(parts) : bySearch(parts[0]);
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function frameNode(canvas, node) {
  canvas.deselectAll?.();
  canvas.selectNode?.(node);
  if (typeof canvas.animateToBounds === "function") canvas.animateToBounds(node.boundingRect);
  else canvas.centerOnNode?.(node);
  canvas.setDirty?.(true, true);
}

async function reveal({ node, hosts }) {
  const canvas = app.canvas;
  if (!hosts) {
    frameNode(canvas, node);
    return;
  }
  const root = rootGraph();
  if (canvas.graph !== root) canvas.setGraph(root);
  for (const host of hosts) canvas.openSubgraph(host.subgraph, host);
  await nextFrame();
  await nextFrame();
  frameNode(canvas, node);
  await nextFrame();
  if (!canvas.selected_nodes?.[node.id]) frameNode(canvas, node);
}

function focusPrompt() {
  let tries = 0;
  const look = () => {
    const box = [...document.querySelectorAll("[role=\"dialog\"], .p-dialog")]
      .reverse().find((one) => one.textContent.includes(LABEL));
    const input = box?.querySelector("input");
    if (input) {
      if (document.activeElement !== input) input.focus();
      return;
    }
    tries += 1;
    if (tries < 20) requestAnimationFrame(look);
  };
  requestAnimationFrame(look);
}

async function ask() {
  const dialog = app.extensionManager?.dialog;
  if (typeof dialog?.prompt === "function") {
    const answer = dialog.prompt({ title: LABEL, message: "Node ID", defaultValue: "" });
    focusPrompt();
    return answer;
  }
  return askText(LABEL, "", "Go");
}

function report(text) {
  const message = `No node ${text}`;
  const toasts = app.extensionManager?.toast;
  if (typeof toasts?.add === "function") {
    toasts.add({ severity: "warn", summary: LABEL, detail: message, life: 3000 });
  } else {
    toast(message, { kind: "warn" });
  }
}

async function goToNode(metadata) {
  if (!enabled || !app.canvas) return;
  try {
    const typed = metadata?.nodeId ?? await ask();
    if (typed === null || typed === undefined || String(typed).trim() === "") return;
    const parts = parse(typed);
    const found = parts ? locate(parts) : null;
    if (!found) {
      report(String(typed).trim());
      return;
    }
    await reveal(found);
  } catch (error) {
    fault?.(error);
  }
}

export default {
  key: "qolGoToNode",
  name: "Go to Node by ID",
  tooltip: "Adds Go to Node to the canvas menu and to the keybinding list. It takes a node ID, "
    + "or a path such as 12:5 for a node inside subgraph node 12, and opens and frames that node.",
  issues: ["Comfy-Org/ComfyUI_frontend#4089", "Comfy-Org/ComfyUI_frontend#12754"],
  defaultValue: true,
  verified: "1.54.8",
  check() {
    const store = commandStore();
    if (!store) return "ComfyUI's command store has changed";
    if (store.isRegistered(NATIVE_ID)) return "ComfyUI now has its own Go to Node";
    if (!window.LiteGraph || !app.canvas) return "the canvas is not ready";
    return "";
  },
  on(track, standDown) {
    const store = commandStore();
    if (!store.isRegistered(COMMAND_ID)) {
      store.registerCommand({
        id: COMMAND_ID,
        label: LABEL,
        icon: "pi pi-search",
        source: "Open Manager",
        function: goToNode,
      });
    }
    enabled = true;
    fault = standDown;
    track(() => {
      enabled = false;
      fault = null;
    });
  },
  canvasMenu() {
    return [null, { content: LABEL, callback: () => { goToNode(); } }];
  },
};
