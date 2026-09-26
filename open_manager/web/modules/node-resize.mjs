import { app } from "../../../scripts/app.js";
import { panelSetting } from "./settings.mjs";

const EDGE_BAND = 8;
const EDGE_CORNER = { E: "SE", S: "SE", W: "SW" };
const EDGE_CURSOR = { E: "ew-resize", S: "ns-resize", W: "ew-resize" };

let sizing = null;

function edgeResizeOn() {
  return panelSetting("openManager.edgeResize", true) !== false;
}

function multiResizeOn() {
  return panelSetting("openManager.multiResize", true) !== false;
}

function cornerSize() {
  return window.LiteGraph?.LGraphNode?.resizeHandleSize || 15;
}

function edgeUnder(node, x, y) {
  const rect = node.boundingRect;
  if (!rect?.containsXy?.(x, y)) return null;
  const corner = cornerSize();
  if (y > rect.y + corner && y < rect.bottom - corner) {
    if (x >= rect.right - EDGE_BAND) return "E";
    if (x <= rect.x + EDGE_BAND) return "W";
  }
  if (x > rect.x + corner && x < rect.right - corner && y >= rect.bottom - EDGE_BAND) return "S";
  return null;
}

function sizingArm(node, dir, edge) {
  sizing = {
    node,
    dir,
    edge,
    pos: [node.pos[0], node.pos[1]],
    size: [node.size[0], node.size[1]],
    others: null,
  };
}

function sizingMirror(node, drag) {
  if (!multiResizeOn()) return;
  const picked = Object.values(app.canvas?.selected_nodes || {});
  if (picked.length < 2 || !picked.includes(node)) return;
  if (!drag.others) {
    drag.others = picked.filter((one) => one !== node).map((one) => ({
      node: one,
      pos: [one.pos[0], one.pos[1]],
      size: [one.size[0], one.size[1]],
    }));
  }
  const dx = node.pos[0] - drag.pos[0];
  const dy = node.pos[1] - drag.pos[1];
  const dw = node.size[0] - drag.size[0];
  const dh = node.size[1] - drag.size[1];
  for (const other of drag.others) {
    const min = other.node.computeSize();
    other.node.pos[0] = other.pos[0] + dx;
    other.node.pos[1] = other.pos[1] + dy;
    other.node.setSize([
      Math.max(min[0], other.size[0] + dw),
      Math.max(min[1], other.size[1] + dh),
    ]);
  }
}

function patchResize() {
  const NodeClass = window.LiteGraph?.LGraphNode;
  const CanvasClass = window.LGraphCanvas;
  if (!NodeClass?.prototype || !CanvasClass?.prototype) {
    setTimeout(patchResize, 500);
    return;
  }
  if (NodeClass.prototype.omResizePatched) return;
  NodeClass.prototype.omResizePatched = true;

  const findResize = NodeClass.prototype.findResizeDirection;
  NodeClass.prototype.findResizeDirection = function (x, y) {
    const corner = findResize.call(this, x, y);
    if (corner) {
      sizingArm(this, corner, null);
      return corner;
    }
    if (!edgeResizeOn() || this.resizable === false || this.flags?.collapsed) return corner;
    const edge = edgeUnder(this, x, y);
    if (!edge) return corner;
    sizingArm(this, EDGE_CORNER[edge], edge);
    return EDGE_CORNER[edge];
  };

  const setSize = NodeClass.prototype.setSize;
  NodeClass.prototype.setSize = function (size) {
    const drag = sizing?.node === this && app.canvas?.resizing_node === this ? sizing : null;
    if (drag?.edge) {
      if (drag.edge === "S") size[0] = drag.size[0];
      else size[1] = drag.size[1];
    }
    setSize.call(this, size);
    if (drag) sizingMirror(this, drag);
  };

  const updateCursor = CanvasClass.prototype._updateCursorStyle;
  if (typeof updateCursor !== "function") return;
  CanvasClass.prototype._updateCursorStyle = function () {
    updateCursor.call(this);
    if (this.state?.shouldSetCursor === false || !edgeResizeOn()) return;
    const dir = this.pointer?.resizeDirection;
    if (!dir || !sizing?.edge || sizing.dir !== dir) return;
    this.canvas.style.cursor = EDGE_CURSOR[sizing.edge];
  };
}

export { patchResize };
