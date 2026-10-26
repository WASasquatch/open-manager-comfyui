import { app } from "../../../../../scripts/app.js";
import { piniaStores, linkReveal } from "../shared.mjs";

const SPLINE = 2;

let live = false;
let lastVisible = null;
let selection = "";

function canvasProto() {
  return window.LGraphCanvas?.prototype || null;
}

function presentationStore() {
  const store = piniaStores()?.get("linkPresentation");
  return typeof store?.graphHiddenLinkIds === "function" ? store : null;
}

function hiddenMode(canvas) {
  return canvas.links_render_mode === (window.LiteGraph?.HIDDEN_LINK ?? -1);
}

function selectedNodes(canvas) {
  const found = [];
  if (canvas.selectedItems?.size) {
    for (const item of canvas.selectedItems) {
      if (item?.id != null && (Array.isArray(item.inputs) || Array.isArray(item.outputs))) {
        found.push(item);
      }
    }
  } else if (canvas.selected_nodes) {
    found.push(...Object.values(canvas.selected_nodes));
  }
  return found;
}

function collect(canvas) {
  linkReveal.links.clear();
  for (const node of selectedNodes(canvas)) {
    for (const input of node.inputs || []) {
      if (input?.link != null) linkReveal.links.add(input.link);
    }
    for (const output of node.outputs || []) {
      for (const id of output?.links || []) linkReveal.links.add(id);
    }
  }
}

function install() {
  const proto = canvasProto();
  const draw = proto.draw;
  const drawConnections = proto.drawConnections;
  const renderSegments = proto._renderAllLinkSegments;
  const renderLink = proto.renderLink;
  const store = presentationStore();
  const hiddenIds = store?.graphHiddenLinkIds;

  proto.draw = function (...args) {
    if (live && this === app.canvas) {
      const now = selectedNodes(this).map((node) => node.id).join(",");
      if (now !== selection) {
        selection = now;
        this.setDirty?.(false, true);
      }
    }
    return draw.apply(this, args);
  };

  proto.drawConnections = function (ctx, ...rest) {
    if (!live || this !== app.canvas || !this.graph) return drawConnections.call(this, ctx, ...rest);
    collect(this);
    const hidden = hiddenMode(this);
    if (!hidden) lastVisible = this.links_render_mode;
    const result = drawConnections.call(this, ctx, ...rest);
    if (hidden && linkReveal.links.size) {
      const mode = this.links_render_mode;
      linkReveal.drawing = true;
      this.links_render_mode = lastVisible ?? window.LiteGraph?.SPLINE_LINK ?? SPLINE;
      try {
        drawConnections.call(this, ctx, ...rest);
      } finally {
        this.links_render_mode = mode;
        linkReveal.drawing = false;
      }
    }
    return result;
  };

  proto._renderAllLinkSegments = function (ctx, link, ...rest) {
    if (linkReveal.drawing && !(link && linkReveal.links.has(link.id))) return undefined;
    return renderSegments.call(this, ctx, link, ...rest);
  };

  proto.renderLink = function (ctx, a, b, link) {
    if (linkReveal.drawing && !(link && linkReveal.links.has(link.id))) return undefined;
    return renderLink.apply(this, arguments);
  };

  if (store) {
    store.graphHiddenLinkIds = function (scope) {
      const ids = hiddenIds.call(this, scope);
      if (!live || !linkReveal.links.size || !ids?.length) return ids;
      return ids.filter((id) => !linkReveal.links.has(id));
    };
  }

  const ours = {
    draw: proto.draw, drawConnections: proto.drawConnections,
    renderSegments: proto._renderAllLinkSegments, renderLink: proto.renderLink,
    hiddenIds: store?.graphHiddenLinkIds,
  };
  return () => {
    if (proto.draw === ours.draw) proto.draw = draw;
    if (proto.drawConnections === ours.drawConnections) proto.drawConnections = drawConnections;
    if (proto._renderAllLinkSegments === ours.renderSegments) proto._renderAllLinkSegments = renderSegments;
    if (proto.renderLink === ours.renderLink) proto.renderLink = renderLink;
    if (store && store.graphHiddenLinkIds === ours.hiddenIds) store.graphHiddenLinkIds = hiddenIds;
  };
}

export default {
  key: "qolRevealSelectedLinks",
  name: "Selected nodes show their hidden links",
  tooltip: "Hidden links between the selected nodes and the nodes they connect to are drawn while "
    + "the nodes are selected.",
  issues: [],
  defaultValue: true,
  verified: "1.55.18",
  check() {
    const proto = canvasProto();
    if (typeof proto?.draw !== "function" || typeof proto?.drawConnections !== "function"
      || typeof proto?._renderAllLinkSegments !== "function"
      || typeof proto?.renderLink !== "function") {
      return "ComfyUI's link drawing has changed";
    }
    if (app.canvas && !(app.canvas.selectedItems instanceof Set) && !app.canvas.selected_nodes) {
      return "ComfyUI's selection has changed";
    }
    return "";
  },
  on(track) {
    const undo = install();
    live = true;
    app.canvas?.setDirty?.(true, true);
    track(() => {
      live = false;
      linkReveal.drawing = false;
      linkReveal.links.clear();
      selection = "";
      undo();
      app.canvas?.setDirty?.(true, true);
    });
  },
};
