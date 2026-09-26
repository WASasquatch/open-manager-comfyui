import { app } from "../../../scripts/app.js";
import { el, openRowMenu } from "./ui.mjs";
import { panelSetting } from "./settings.mjs";

const SOCKET_REACH = 12;

const JUMP_MS = 220;

let jumpAt = 0;

function socketJumpOn() {
  return panelSetting("openManager.socketJump", true) !== false;
}

function graphPoint(event) {
  const canvas = app.canvas;
  const sheet = canvas?.canvas;
  if (!sheet) return null;
  const rect = sheet.getBoundingClientRect();
  const scale = canvas.ds?.scale || 1;
  const offset = canvas.ds?.offset || [0, 0];
  return [
    (event.clientX - rect.left) / scale - offset[0],
    (event.clientY - rect.top) / scale - offset[1],
  ];
}

function socketAt(x, y) {
  const nodes = app.canvas?.visible_nodes || [];
  const near = (at) => at
    && Math.abs(x - at[0]) <= SOCKET_REACH
    && Math.abs(y - at[1]) <= SOCKET_REACH;
  for (let i = nodes.length - 1; i >= 0; i -= 1) {
    const node = nodes[i];
    if (node.flags?.collapsed) continue;
    const inputs = node.inputs || [];
    for (let slot = 0; slot < inputs.length; slot += 1) {
      if (near(node.getInputPos?.(slot))) return { node, slot, out: false };
    }
    const outputs = node.outputs || [];
    for (let slot = 0; slot < outputs.length; slot += 1) {
      if (near(node.getOutputPos?.(slot))) return { node, slot, out: true };
    }
  }
  return null;
}

function jumpGraph(node) {
  return node?.graph || app.canvas?.graph || app.graph || null;
}

function linkById(graph, id) {
  const links = graph?.links;
  if (!links || id === null || id === undefined) return null;
  return (typeof links.get === "function" ? links.get(id) : links[id]) || null;
}

function endNode(graph, id) {
  const found = graph?.getNodeById?.(id);
  if (found) return found;
  if (graph?.inputNode && String(graph.inputNode.id) === String(id)) return graph.inputNode;
  if (graph?.outputNode && String(graph.outputNode.id) === String(id)) return graph.outputNode;
  return null;
}

function endName(graph, node, slot) {
  if (node === graph?.inputNode) return "Subgraph inputs";
  if (node === graph?.outputNode) return "Subgraph outputs";
  const head = node.title || node.type || "Node";
  return slot?.name ? `${head} › ${slot.name}` : head;
}

function jumpTargets(found) {
  const node = found.node;
  const graph = jumpGraph(node);
  const ends = [];
  if (found.out) {
    const held = node.outputs?.[found.slot]?.links || [];
    for (const id of held) {
      const link = linkById(graph, id);
      const other = link ? endNode(graph, link.target_id) : null;
      if (other) {
        ends.push({ node: other, graph, slot: other.inputs?.[link.target_slot] });
      }
    }
    return ends;
  }
  const link = linkById(graph, node.inputs?.[found.slot]?.link);
  const other = link ? endNode(graph, link.origin_id) : null;
  if (other) ends.push({ node: other, graph, slot: other.outputs?.[link.origin_slot] });
  return ends;
}

function jumpToNode(node) {
  const canvas = app.canvas;
  const rect = node?.boundingRect;
  if (!canvas || !rect) return;
  try { canvas.selectNode?.(node); } catch { }
  const bounds = [rect[0], rect[1], rect[2], rect[3]];
  const busy = Date.now() - jumpAt < JUMP_MS;
  jumpAt = Date.now();
  if (!busy && typeof canvas.animateToBounds === "function") {
    canvas.animateToBounds(bounds, { zoom: 0, duration: JUMP_MS });
  } else {
    canvas.centerOnNode?.(node);
  }
  canvas.setDirty?.(true, true);
}

function jumpAnchor(event) {
  const anchor = el("div", "om-jump-anchor");
  anchor.style.cssText = `position: fixed; width: 0; height: 0; `
    + `left: ${event.clientX}px; top: ${event.clientY}px;`;
  document.body.appendChild(anchor);
  return anchor;
}

function linkedSocket(event) {
  const spot = graphPoint(event);
  if (!spot) return null;
  const found = socketAt(spot[0], spot[1]);
  if (!found) return null;
  const ends = jumpTargets(found);
  return ends.length ? ends : null;
}

function followSocket(ends, event) {
  if (ends.length === 1) {
    jumpToNode(ends[0].node);
    return;
  }
  const labels = ends.map((end) => endName(end.graph, end.node, end.slot));
  const tally = new Map();
  for (const label of labels) tally.set(label, (tally.get(label) || 0) + 1);
  const anchor = jumpAnchor(event);
  openRowMenu(anchor, {
    align: "left",
    items: ends.map((end, at) => ({
      label: tally.get(labels[at]) > 1 ? `${labels[at]} #${end.node.id}` : labels[at],
      fn: () => jumpToNode(end.node),
    })),
  });
  setTimeout(() => anchor.remove(), 0);
}

function watchJump() {
  const sheet = app.canvas?.canvas;
  if (!sheet) {
    setTimeout(watchJump, 500);
    return;
  }
  document.addEventListener("pointerdown", (event) => {
    if (event.button !== 1 || event.target !== sheet || !socketJumpOn()) return;
    let ends = null;
    try { ends = linkedSocket(event); } catch { return; }
    if (!ends) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    try { followSocket(ends, event); } catch { }
  }, true);
}

export { watchJump };
