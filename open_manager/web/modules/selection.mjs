import { app } from "../../../scripts/app.js";

function nodeClass() {
  const found = window.LiteGraph?.LGraphNode ?? window.LGraphNode;
  return typeof found === "function" ? found : null;
}

function selectedNodes(canvas = app.canvas) {
  const items = canvas?.selectedItems;
  const Node = nodeClass();
  if (items instanceof Set && Node) {
    const found = [];
    for (const item of items) if (item instanceof Node) found.push(item);
    return found;
  }
  return Object.values(canvas?.selected_nodes || {});
}

function isSelected(node, canvas = app.canvas) {
  const items = canvas?.selectedItems;
  if (items instanceof Set) return items.has(node);
  return !!canvas?.selected_nodes?.[node?.id];
}

export { selectedNodes, isSelected };
