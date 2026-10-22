import { MARGIN, centreText, contains, font, local, measure, rowText, theme } from "./kit.mjs";

const REMOVE = 24;

function make(widget) {
  const remove = [0, 0, 0, 0];

  return {
    draw(ctx, _node, width, y, height, low) {
      const colours = theme();
      const middle = y + height / 2;
      remove[0] = width - MARGIN - REMOVE;
      remove[1] = y;
      remove[2] = REMOVE;
      remove[3] = height;
      const label = widget.label ?? widget.name ?? "";
      let lineEnd = remove[0] - 8;
      if (!low && label) {
        ctx.font = font();
        const room = Math.max(0, remove[0] - MARGIN - 40);
        const used = Math.min(measure(ctx, label), room);
        rowText(ctx, label, remove[0] - 4, y, height, "right", colours.secondary, room);
        lineEnd = remove[0] - 4 - used - 8;
      }
      ctx.fillStyle = colours.outline;
      ctx.fillRect(MARGIN, Math.round(middle) - 0.5, Math.max(0, lineEnd - MARGIN), 1);
      if (low) return;
      centreText(ctx, "✕", remove[0] + REMOVE / 2, middle, widget.options?.disabled ? colours.disabled : colours.text, 13);
    },

    pointerDown(pointer, node) {
      if (widget.options?.disabled || widget.computedDisabled) return false;
      const [px, py] = local(pointer.eDown, node);
      if (!contains(remove[0], remove[1], remove[2], remove[3], px, py)) return false;
      pointer.onClick = () => widget.callback?.(undefined);
      return true;
    },
  };
}

export { make };
