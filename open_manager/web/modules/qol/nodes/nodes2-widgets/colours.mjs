import {
  MARGIN, commit, drawHistory, font, history, historyPointer, historyWidth, measure, ownHistory, rowHeight,
  rowText, swatchRow, theme,
} from "./kit.mjs";

const MAX_COLOURS = 16;

const LABEL_X = MARGIN * 2 + 5;

const LABEL_GAP = 8;

const NONE = Object.freeze([]);

const IDLE = Object.freeze({ undo: false, redo: false });

const measurer = document.createElement("canvas").getContext("2d");

function labelWidth(ctx, text) {
  ctx.font = font();
  return text ? measure(ctx, text) : 0;
}

function isColourList(value) {
  return Array.isArray(value) && value.every((one) => typeof one === "string");
}

function editedAt(before, after) {
  if (before.length !== after.length) return -1;
  let found = -1;
  for (let index = 0; index < after.length; index += 1) {
    if (before[index] === after[index]) continue;
    if (found >= 0) return -1;
    found = index;
  }
  return found;
}

function make(widget) {
  const row = swatchRow(MAX_COLOURS);
  let rowX = 0;
  let rowWidth = 0;
  let historyX = -1;
  let historyY = 0;
  let seen;
  const kept = history(widget, () => widget.value, (node, value) => {
    if (!isColourList(value)) return;
    commit(node, widget, value);
    seen = widget.value;
  });

  const values = () => (Array.isArray(widget.value) ? widget.value : NONE);
  const label = () => widget.label || widget.name || "";

  function place(ctx, width) {
    const text = label();
    const used = labelWidth(ctx, text);
    rowX = LABEL_X + (used ? used + LABEL_GAP : 0);
    const right = width - MARGIN;
    const room = historyWidth();
    historyX = ownHistory() && right - rowX - room - LABEL_GAP >= room ? right - room : -1;
    rowWidth = Math.max(0, (historyX >= 0 ? historyX - LABEL_GAP : right) - rowX);
    return used;
  }

  function change(node, next) {
    const before = values();
    commit(node, widget, next);
    if (!ownHistory()) return;
    const at = editedAt(before, isColourList(next) ? next : NONE);
    kept.record(node, at >= 0 ? `color:${at}` : undefined);
    seen = widget.value;
  }

  return {
    minSize(node) {
      place(measurer, node.size[0]);
      const height = Math.max(rowHeight(), row.height(rowWidth, values().length));
      return { minHeight: height, maxHeight: height, minWidth: 0 };
    },

    draw(ctx, node, width, y, height, low) {
      if (widget.value !== seen && ownHistory()) {
        seen = widget.value;
        kept.adopt(node);
      }
      const list = values();
      const used = place(ctx, width);
      const block = row.height(rowWidth, list.length);
      row.layout(rowX, y + Math.max(0, (height - block) / 2), rowWidth, list.length);
      if (!low && used) rowText(ctx, label(), LABEL_X, y + (height - rowHeight()) / 2, rowHeight(), "left", theme().secondary, used);
      row.draw(ctx, list, low);
      if (historyX >= 0) {
        historyY = y + (height - rowHeight()) / 2;
        drawHistory(ctx, historyX, historyY, rowHeight(), widget.computedDisabled ? IDLE : kept.state(node), low);
      }
    },

    pointerDown(pointer, node) {
      if (widget.computedDisabled) return false;
      if (historyX >= 0 && historyPointer(pointer, node, historyX, historyY, rowHeight(), kept)) return true;
      return row.pointerDown(pointer, node, values(), (next) => change(node, next));
    },

    contextMenu(_event, node, point) {
      if (widget.computedDisabled) return false;
      return row.contextMenu(point, values(), (next) => change(node, next));
    },
  };
}

export { make };
