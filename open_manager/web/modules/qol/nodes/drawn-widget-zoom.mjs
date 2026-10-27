import { app } from "../../../../../scripts/app.js";
import { canWatchMounts, graphNodes, shownWidget, watchMounts } from "../shared.mjs";

const COMPONENT = "WidgetLegacy";

const SLACK = 1;

const ZOOMED = 2;

const NATIVE = "ComfyUI draws these widgets at their node's width itself";

const HELD = Symbol("omLayoutDraw");

let active = false;

let backOff = null;

function relayout(ctx, width) {
  const surface = ctx?.canvas;
  if (!active || !surface || surface === app.canvas?.canvas || !(width > 0)) return 0;
  const layout = surface.offsetWidth;
  if (!layout) return 0;
  if (Math.abs(layout - width) <= SLACK) {
    if (backOff && Math.abs(surface.getBoundingClientRect().width - layout) > ZOOMED) backOff();
    return 0;
  }
  const factor = surface.width / width;
  if (!(factor > 0)) return 0;
  surface.width = Math.round(layout * factor);
  ctx.setTransform(factor, 0, 0, factor, 0, 0);
  return layout;
}

function wrap(widget) {
  if (!widget || widget[HELD] || typeof widget.draw !== "function") return false;
  const own = Object.getOwnPropertyDescriptor(widget, "draw");
  const draw = widget.draw;
  const atLayout = function (ctx, node, width, ...rest) {
    const layout = relayout(ctx, width);
    if (!layout) return draw.call(this, ctx, node, width, ...rest);
    this.width = layout;
    return draw.call(this, ctx, node, layout, ...rest);
  };
  widget.draw = atLayout;
  widget[HELD] = { own, atLayout };
  return true;
}

function unwrap(widget) {
  const held = widget[HELD];
  if (!held) return false;
  delete widget[HELD];
  if (widget.draw !== held.atLayout) return false;
  if (held.own) Object.defineProperty(widget, "draw", held.own);
  else delete widget.draw;
  return true;
}

function redraw(widget) {
  try {
    widget.triggerDraw?.();
  } catch {}
}

function shown(instance) {
  const found = shownWidget(instance);
  if (found && wrap(found.widget)) redraw(found.widget);
}

export default {
  key: "qolDrawnWidgetZoom",
  name: "Self-drawn widgets keep their size when zoomed",
  tooltip: "On Nodes 2.0, ComfyUI sizes a widget that draws itself from the zoomed width, so "
    + "one that appears while zoomed out draws too large and spills over the next row. On, it "
    + "draws at its node's own width.",
  issues: [],
  defaultValue: true,
  verified: "1.57.4",
  check() {
    if (!window.LiteGraph) return "the canvas is not ready";
    if (!canWatchMounts()) return "ComfyUI's Vue app changed";
    return "";
  },
  on(track, standDown) {
    active = true;
    backOff = () => {
      backOff = null;
      standDown(NATIVE);
    };
    const stop = watchMounts(COMPONENT, shown);
    for (const node of graphNodes()) {
      for (const widget of node.widgets || []) {
        if (typeof widget?.triggerDraw === "function" && wrap(widget)) redraw(widget);
      }
    }
    track(() => {
      active = false;
      backOff = null;
      stop();
      for (const node of graphNodes()) {
        for (const widget of node.widgets || []) {
          if (unwrap(widget)) redraw(widget);
        }
      }
    });
  },
};
