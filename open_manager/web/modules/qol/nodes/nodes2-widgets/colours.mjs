import { MARGIN, commit, font, measure, rowHeight, rowText, swatchRow, theme } from "./kit.mjs";

const MAX_COLOURS = 16;

const LABEL_X = MARGIN * 2 + 5;

const LABEL_GAP = 8;

const NONE = Object.freeze([]);

const measurer = document.createElement("canvas").getContext("2d");

function labelWidth(ctx, text) {
  ctx.font = font();
  return text ? measure(ctx, text) : 0;
}

function make(widget) {
  const row = swatchRow(MAX_COLOURS);
  let rowX = 0;
  let rowWidth = 0;

  const values = () => (Array.isArray(widget.value) ? widget.value : NONE);
  const label = () => widget.label || widget.name || "";

  function place(ctx, width) {
    const text = label();
    const used = labelWidth(ctx, text);
    rowX = LABEL_X + (used ? used + LABEL_GAP : 0);
    rowWidth = Math.max(0, width - MARGIN - rowX);
    return used;
  }

  return {
    minSize(node) {
      place(measurer, node.size[0]);
      const height = Math.max(rowHeight(), row.height(rowWidth, values().length));
      return { minHeight: height, maxHeight: height, minWidth: 0 };
    },

    draw(ctx, node, width, y, height, low) {
      const list = values();
      const used = place(ctx, width);
      const block = row.height(rowWidth, list.length);
      row.layout(rowX, y + Math.max(0, (height - block) / 2), rowWidth, list.length);
      if (!low && used) rowText(ctx, label(), LABEL_X, y + (height - rowHeight()) / 2, rowHeight(), "left", theme().secondary, used);
      row.draw(ctx, list, low);
    },

    pointerDown(pointer, node) {
      if (widget.computedDisabled) return false;
      return row.pointerDown(pointer, node, values(), (next) => commit(node, widget, next));
    },

    contextMenu(_event, node, point) {
      if (widget.computedDisabled) return false;
      return row.contextMenu(point, values(), (next) => commit(node, widget, next));
    },
  };
}

export { make };
