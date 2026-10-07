import { app } from "../../../scripts/app.js";

function rootGraph() {
  const graph = app.canvas?.graph;
  return graph?.rootGraph || app.rootGraph || app.graph;
}

function parseNodePath(text) {
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

function locateNode(parts) {
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

async function revealNode({ node, hosts }) {
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

export { rootGraph, parseNodePath, locateNode, revealNode, nextFrame };
