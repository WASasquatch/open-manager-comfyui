import { app } from "../../../../../../scripts/app.js";
import {
  KEY, BAR, snap, tiesOf, linkOf, prune, layout, route, tieAt, cut, outletOf, outletAt, reachOf,
} from "./model.mjs";
import { linkGirth, drawnLines } from "../../../noodles.mjs";

const NO_MARKER = 0;

const HIDDEN_LINK = -1;

const MARGIN = 20;

const OUTLET_DOT = 3;

const LANE_DOT = 0.42;

const OUTLET_LIT = 1.35;

const UP = 1;

const DOWN = 2;

const LEFT = 3;

const RIGHT = 4;

const DOUBLE_MS = 350;

const HIT_PX = 6;

const PLAIN = "#8c8c94";

const OUTLINE = "rgba(0, 0, 0, 0.6)";

const CUT_COLOUR = "#ff3b3b";

const TURN_PATH = "M18.5 12a6.5 6.5 0 1 1-1.9-4.6M16.6 3.4V7.4H12.6";

const TURN_SVG = "<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'>"
  + "<g fill='none' stroke-linecap='round' stroke-linejoin='round'>"
  + `<path d='${TURN_PATH}' stroke='#000' stroke-width='4'/>`
  + `<path d='${TURN_PATH}' stroke='#fff' stroke-width='2'/></g></svg>`;

const TURN = `url("data:image/svg+xml,${encodeURIComponent(TURN_SVG)}") 12 12, crosshair`;

const TURN_FROM_PX = 6;

const state = {
  live: false,
  zHeld: false,
  hovered: null,
  drag: null,
  slice: null,
  lastDown: { tie: null, at: 0 },
  quietMenu: false,
  nested: false,
  graph: null,
  index: new Map(),
  ends: new Map(),
  frame: null,
  sequence: new Map(),
  plans: new Map(),
  overlay: null,
  standIn: null,
  outlet: null,
  tap: null,
};

function gap(canvas) {
  return Math.max(canvas.connections_width ?? 3, linkGirth(canvas)) + 2.5;
}

function commit(canvas) {
  canvas.setDirty?.(true, true);
  const tracker = app.extensionManager?.workflow?.activeWorkflow?.changeTracker;
  try {
    (tracker?.captureCanvasState ?? tracker?.checkState)?.call(tracker);
  } catch {}
}

function wantsAll() {
  return state.zHeld || !!state.slice;
}

function moved(before, after) {
  if (!before || !after) return before !== after;
  return Math.abs(before.a[0] - after.a[0]) > 0.5 || Math.abs(before.a[1] - after.a[1]) > 0.5
    || Math.abs(before.b[0] - after.b[0]) > 0.5 || Math.abs(before.b[1] - after.b[1]) > 0.5;
}

const LIFT = "rgba(255, 255, 255, 0.45)";

function laneColour(canvas, link) {
  if (typeof link?.color === "string" && link.color) return link.color;
  const types = window.LGraphCanvas?.link_type_colors || {};
  return types[link?.type] || canvas.default_link_color || "#9a9";
}

function paintOutlets(ctx, canvas, tie, plan) {
  const radius = Math.max(1.5, Math.min(OUTLET_DOT, (plan.gap || OUTLET_DOT * 2) * LANE_DOT));
  for (const id of plan.order) {
    const [x, y] = outletOf(tie, plan, id);
    const lit = state.outlet?.tie === tie && state.outlet.id === id;
    ctx.beginPath();
    ctx.arc(x, y, lit ? radius * OUTLET_LIT : radius, 0, Math.PI * 2);
    ctx.fillStyle = laneColour(canvas, linkOf(canvas.graph, id));
    ctx.fill();
    ctx.stroke();
  }
}

function paintTies(ctx, ties, canvas) {
  if (!ties.length) return;
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = OUTLINE;
  for (const tie of ties) {
    const plan = state.plans.get(tie);
    if (!plan) continue;
    const active = tie === state.hovered || state.drag?.tie === tie;
    const colour = typeof tie.color === "string" && tie.color ? tie.color : PLAIN;
    ctx.save();
    ctx.translate(tie.pos[0], tie.pos[1]);
    ctx.rotate(plan.angle);
    ctx.beginPath();
    ctx.roundRect(-BAR, -plan.half, BAR * 2, plan.half * 2, BAR);
    ctx.fillStyle = colour;
    ctx.fill();
    if (active) {
      ctx.fillStyle = LIFT;
      ctx.fill();
    }
    ctx.stroke();
    ctx.restore();
    if (active && !state.drag && tapsOn(canvas)) paintOutlets(ctx, canvas, tie, plan);
  }
  ctx.restore();
}

function boxOf(points) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of points) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return [x0, y0, x1 - x0, y1 - y0];
}

function overlaps(box, area) {
  return box[0] <= area[0] + area[2] && box[0] + box[2] >= area[0]
    && box[1] <= area[1] + area[3] && box[1] + box[3] >= area[1];
}

function standInFor(canvas, id, a, b) {
  const view = canvas.visible_area;
  if (!view || !state.index.has(id)) return null;
  const area = [view[0] - MARGIN, view[1] - MARGIN, view[2] + MARGIN * 2, view[3] + MARGIN * 2];
  if (overlaps(boxOf([a, b]), area)) return null;
  const reach = reachOf(state, id);
  if (!reach || !overlaps(boxOf([a, b, ...reach]), area)) return null;
  return [area[0] + area[2] / 2, area[1] + area[3] / 2];
}

function wrapDrawing(proto) {
  const drawConnections = proto.drawConnections;
  const renderLink = proto.renderLink;

  proto.drawConnections = function (ctx, ...rest) {
    const graph = this.graph;
    if (!state.live || this !== app.canvas || !graph) return drawConnections.call(this, ctx, ...rest);
    if (state.graph !== graph) {
      state.graph = graph;
      state.ends = new Map();
      state.hovered = null;
    }
    state.index = prune(graph);
    const ties = tiesOf(graph);
    if (!ties.length && !wantsAll()) {
      state.sequence = new Map();
      state.plans = new Map();
      state.frame = null;
      return drawConnections.call(this, ctx, ...rest);
    }
    const planned = layout(graph, state.index, state.ends, gap(this));
    state.sequence = planned.sequence;
    state.plans = planned.plans;
    state.frame = new Map();
    let result;
    try {
      result = drawConnections.call(this, ctx, ...rest);
    } finally {
      const frame = state.frame;
      state.frame = null;
      let shifted = false;
      for (const id of state.index.keys()) {
        const after = frame.get(id);
        if (after && moved(state.ends.get(id), after)) { shifted = true; break; }
      }
      if (wantsAll()) state.ends = frame;
      else {
        for (const [id, end] of frame) state.ends.set(id, end);
        for (const id of [...state.ends.keys()]) if (!state.index.has(id)) state.ends.delete(id);
      }
      try { paintTies(ctx, ties, this); } catch {}
      if (shifted) requestAnimationFrame(() => this.setDirty?.(true, true));
    }
    return result;
  };

  proto.renderLink = function (ctx, a, b, link, skipBorder, flow, colour, sd, ed, options, ...more) {
    const standIn = state.standIn;
    if (standIn && link === standIn.link && !state.nested) {
      a = standIn.a;
      b = standIn.b;
    }
    const plain = () => renderLink.call(this, ctx, a, b, link, skipBorder, flow, colour, sd, ed,
      options, ...more);
    if (!state.live || state.nested || !state.frame || !link || link.parentId != null
        || this !== app.canvas
        || (options && (options.reroute || options.startControl || options.endControl))) {
      return plain();
    }
    const tied = state.index.has(link.id);
    if (tied || wantsAll()) state.frame.set(link.id, { a: [a[0], a[1]], b: [b[0], b[1]], sd, ed });
    if (!tied || !state.sequence.get(link.id)?.length) return plain();

    const held = state.index.get(link.id);
    const active = held.some((tie) => tie === state.hovered || state.drag?.tie === tie);
    const tint = colour ?? (active ? "#ffffff" : null);
    const parts = route(state, link.id, a, b, sd, ed);
    const marker = this.linkMarkerShape;
    state.nested = true;
    try {
      this.linkMarkerShape = NO_MARKER;
      for (let at = 1; at < parts.length; at += 1) {
        const part = parts[at];
        renderLink.call(this, ctx, part.a, part.b, link, skipBorder, flow, tint, part.sd, part.ed,
          { ...options, startControl: part.startControl, endControl: part.endControl });
      }
      this.linkMarkerShape = marker;
      const first = parts[0];
      renderLink.call(this, ctx, first.a, first.b, link, skipBorder, flow, tint, first.sd, first.ed,
        { ...options, startControl: first.startControl, endControl: first.endControl });
    } finally {
      this.linkMarkerShape = marker;
      state.nested = false;
    }
    return undefined;
  };

  const segments = proto._renderAllLinkSegments;
  if (typeof segments === "function") {
    proto._renderAllLinkSegments = function (ctx, link, startPos, endPos, ...rest) {
      const stand = state.live && !state.nested && state.frame && this === app.canvas && link
        && link.parentId == null && startPos && endPos
        ? standInFor(this, link.id, startPos, endPos)
        : null;
      if (!stand) return segments.call(this, ctx, link, startPos, endPos, ...rest);
      state.standIn = { link, a: startPos, b: endPos };
      try {
        return segments.call(this, ctx, link, stand, stand, ...rest);
      } finally {
        state.standIn = null;
      }
    };
  }

  const ourDraw = proto.drawConnections;
  const ourLink = proto.renderLink;
  const ourSegments = proto._renderAllLinkSegments;
  return () => {
    if (proto.drawConnections === ourDraw) proto.drawConnections = drawConnections;
    if (proto.renderLink === ourLink) proto.renderLink = renderLink;
    if (segments && proto._renderAllLinkSegments === ourSegments) {
      proto._renderAllLinkSegments = segments;
    }
  };
}

function tapsOn(canvas) {
  return !!canvas && typeof canvas.linkConnector?.dragNewFromOutput === "function"
    && !canvas.read_only && canvas.links_render_mode !== HIDDEN_LINK;
}

function directionOf(t) {
  if (Math.abs(t[0]) >= Math.abs(t[1])) return t[0] >= 0 ? RIGHT : LEFT;
  return t[1] >= 0 ? DOWN : UP;
}

function pointAt(canvas, outlet) {
  const before = state.outlet;
  if (before?.tie === outlet?.tie && before?.id === outlet?.id) return;
  state.outlet = outlet;
  canvas.setDirty?.(true, true);
}

function tap(canvas, event) {
  if (!state.live || canvas !== app.canvas || event.button !== 0 || state.zHeld || state.drag
      || state.slice || event.ctrlKey || event.metaKey || event.altKey || canvas.pointer?.isDouble
      || !tapsOn(canvas)) {
    return false;
  }
  const graph = canvas.graph;
  const point = [event.canvasX, event.canvasY];
  if (!graph || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) return false;
  const hit = outletAt(state, tiesOf(graph), point, HIT_PX / (canvas.ds?.scale || 1));
  if (!hit) return false;
  const link = linkOf(graph, hit.id);
  const node = link ? graph.getNodeById?.(link.origin_id) : null;
  const output = node?.outputs?.[link.origin_slot];
  const connector = canvas.linkConnector;
  if (!output || connector.isConnecting) return false;
  const list = state.sequence.get(hit.id) || [];
  const upto = list.indexOf(hit.tie);
  const plan = state.plans.get(hit.tie);
  connector.dragNewFromOutput(graph, node, output);
  try {
    const made = connector.renderLinks?.at?.(-1) ?? null;
    if (made && plan) {
      made.fromPos = hit.at;
      made.fromDirection = directionOf(plan.t);
    }
    if (typeof canvas._linkConnectorDrop === "function") canvas._linkConnectorDrop();
    else {
      canvas.pointer.onDragEnd = (up) => connector.dropLinks(graph, up);
      canvas.pointer.finally = () => connector.reset(true);
    }
    state.tap = { graph, render: made, origin: link.origin_id, slot: link.origin_slot,
                  ties: upto >= 0 ? list.slice(0, upto + 1) : [hit.tie] };
  } catch (error) {
    connector.reset?.(true);
    throw error;
  }
  event.preventDefault?.();
  event.stopPropagation?.();
  canvas.setDirty?.(true, true);
  return true;
}

function onCreated(event) {
  const held = state.tap;
  const link = event?.detail;
  const canvas = app.canvas;
  if (!held || !link || link.id == null || !canvas) return;
  if (!held.render || !canvas.linkConnector?.renderLinks?.includes(held.render)) {
    state.tap = null;
    return;
  }
  if (canvas.graph !== held.graph || link.origin_id !== held.origin || link.origin_slot !== held.slot) {
    return;
  }
  const ties = tiesOf(held.graph);
  for (const tie of held.ties) {
    if (ties.includes(tie) && !tie.links.includes(link.id)) tie.links.push(link.id);
  }
  canvas.setDirty?.(true, true);
}

function hookCanvas(canvas) {
  const own = Object.hasOwn(canvas, "onMouse");
  const before = canvas.onMouse;
  const mine = function (event) {
    try {
      if (tap(this, event)) return true;
    } catch (error) {
      console.warn("[Open Manager] Zip ties: no link started from the tie", error);
    }
    return typeof before === "function" ? before.call(this, event) : undefined;
  };
  canvas.onMouse = mine;
  const events = canvas.linkConnector?.events;
  events?.addEventListener?.("link-created", onCreated);
  return () => {
    if (canvas.onMouse === mine) {
      if (own) canvas.onMouse = before;
      else delete canvas.onMouse;
    }
    events?.removeEventListener?.("link-created", onCreated);
    state.tap = null;
    state.outlet = null;
  };
}

function overlay() {
  if (state.overlay?.svg.isConnected) return state.overlay;
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;"
    + "z-index:9999;display:none";
  const line = document.createElementNS(ns, "line");
  line.setAttribute("stroke", CUT_COLOUR);
  line.setAttribute("stroke-width", "2");
  line.setAttribute("stroke-linecap", "round");
  svg.appendChild(line);
  document.body.appendChild(svg);
  state.overlay = { svg, line };
  return state.overlay;
}

function showCut(x1, y1, x2, y2) {
  const { svg, line } = overlay();
  line.setAttribute("x1", x1);
  line.setAttribute("y1", y1);
  line.setAttribute("x2", x2);
  line.setAttribute("y2", y2);
  svg.style.display = "block";
}

function hideCut() {
  if (state.overlay) state.overlay.svg.style.display = "none";
}

function toGraph(canvas, x, y) {
  const rect = canvas.canvas.getBoundingClientRect();
  return canvas.ds.convertCanvasToOffset([x - rect.left, y - rect.top]);
}

function graphPoint(canvas, event) {
  return toGraph(canvas, event.clientX, event.clientY);
}

function aim(slice) {
  const [x0, y0] = slice.client;
  const [x1, y1] = slice.last;
  if (!slice.straight) return [x1, y1];
  const angle = snap(Math.atan2(y1 - y0, x1 - x0));
  const reach = (x1 - x0) * Math.cos(angle) + (y1 - y0) * Math.sin(angle);
  return [x0 + Math.cos(angle) * reach, y0 + Math.sin(angle) * reach];
}

function drawSlice() {
  const slice = state.slice;
  if (!slice) return;
  const end = aim(slice);
  showCut(slice.client[0], slice.client[1], end[0], end[1]);
}

function turn(canvas, drag, event) {
  const point = graphPoint(canvas, event);
  const dx = point[0] - drag.tie.pos[0];
  const dy = point[1] - drag.tie.pos[1];
  if (Math.hypot(dx, dy) * (canvas.ds?.scale || 1) < TURN_FROM_PX) return;
  const angle = Math.atan2(dy, dx) - Math.PI / 2;
  drag.tie.angle = event.shiftKey ? snap(angle) : Math.atan2(Math.sin(angle), Math.cos(angle));
  drag.tie.fixed = true;
  drag.moved = true;
  canvas.setDirty?.(true, true);
}

function typing(event) {
  const target = event.target;
  return target instanceof HTMLElement
    && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

function hovered(canvas, tie) {
  if (state.hovered === tie) return;
  state.hovered = tie;
  canvas.setDirty?.(true, true);
}

function removeTies(canvas, graph, gone) {
  const kept = tiesOf(graph).filter((tie) => !gone.includes(tie));
  if (kept.length) graph.extra[KEY] = kept;
  else if (graph.extra) delete graph.extra[KEY];
  if (gone.includes(state.hovered)) state.hovered = null;
  commit(canvas);
}

function colourLabel(name) {
  const text = String(name).replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function openMenu(canvas, graph, tie, event) {
  const Menu = window.LiteGraph?.ContextMenu;
  if (typeof Menu !== "function") return;
  const swatch = (colour, label) => "<span style='display:block;padding-left:6px;"
    + `border-left:10px solid ${colour}'>${label}</span>`;
  const values = [{ value: "", content: swatch("transparent", "No colour") }];
  for (const [name, option] of Object.entries(window.LGraphCanvas?.node_colors || {})) {
    const colour = option?.groupcolor || option?.color;
    if (colour) values.push({ value: colour, content: swatch(colour, colourLabel(name)) });
  }
  values.push(null);
  if (tie.fixed) values.push({ value: "auto", content: "Auto angle" });
  values.push({ value: "remove", content: "Remove tie" });
  new Menu(values, {
    event,
    title: "Zip tie",
    callback: (picked) => {
      if (!picked) return;
      if (picked.value === "remove") { removeTies(canvas, graph, [tie]); return; }
      if (picked.value === "auto") delete tie.fixed;
      else if (picked.value) tie.color = picked.value;
      else delete tie.color;
      commit(canvas);
    },
  });
}

function onCanvas(event) {
  const canvas = app.canvas;
  return state.live && canvas?.graph && event.target === canvas.canvas ? canvas : null;
}

function listen() {
  const handlers = [];
  const on = (type, fn) => {
    window.addEventListener(type, fn, true);
    handlers.push([type, fn]);
  };

  const shifted = (event) => {
    if (event.key !== "Shift" || !state.slice) return;
    state.slice.straight = event.type === "keydown";
    drawSlice();
  };
  on("keydown", (event) => {
    shifted(event);
    if (event.code !== "KeyZ" || event.ctrlKey || event.metaKey || event.altKey || typing(event)) return;
    if (!state.zHeld) {
      state.zHeld = true;
      app.canvas?.setDirty?.(true, true);
    }
  });
  on("keyup", (event) => {
    shifted(event);
    if (event.code === "KeyZ") state.zHeld = false;
  });
  on("blur", () => { state.zHeld = false; });

  on("contextmenu", (event) => {
    if (!state.quietMenu) return;
    state.quietMenu = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  });

  on("pointerdown", (event) => {
    const canvas = onCanvas(event);
    if (!canvas) return;
    const graph = canvas.graph;
    const point = graphPoint(canvas, event);
    if (event.button === 0 && state.zHeld) {
      event.preventDefault();
      event.stopImmediatePropagation();
      state.slice = { start: point, client: [event.clientX, event.clientY], pointer: event.pointerId,
                      last: [event.clientX, event.clientY], straight: event.shiftKey };
      drawSlice();
      canvas.setDirty?.(true, true);
      return;
    }
    const pad = HIT_PX / (canvas.ds?.scale || 1);
    if (event.button === 0 && tapsOn(canvas) && outletAt(state, tiesOf(graph), point, pad)) return;
    const tie = tieAt(state, tiesOf(graph), point, pad);
    if (!tie) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.button === 2) {
      state.quietMenu = true;
      openMenu(canvas, graph, tie, event);
      return;
    }
    if (event.button !== 0) return;
    const now = performance.now();
    if (state.lastDown.tie === tie && now - state.lastDown.at < DOUBLE_MS) {
      state.lastDown = { tie: null, at: 0 };
      removeTies(canvas, graph, [tie]);
      return;
    }
    state.lastDown = { tie, at: now };
    state.drag = { tie, dx: tie.pos[0] - point[0], dy: tie.pos[1] - point[1],
                   pointer: event.pointerId, moved: false, turning: event.altKey };
    canvas.canvas.style.cursor = event.altKey ? TURN : "grabbing";
  });

  on("pointermove", (event) => {
    if (state.slice && event.pointerId === state.slice.pointer) {
      event.stopImmediatePropagation();
      state.slice.last = [event.clientX, event.clientY];
      state.slice.straight = event.shiftKey;
      drawSlice();
      return;
    }
    if (state.drag && event.pointerId === state.drag.pointer) {
      event.stopImmediatePropagation();
      const canvas = app.canvas;
      if (!canvas?.canvas) return;
      if (state.drag.turning) {
        turn(canvas, state.drag, event);
        return;
      }
      const point = graphPoint(canvas, event);
      state.drag.tie.pos = [point[0] + state.drag.dx, point[1] + state.drag.dy];
      state.drag.moved = true;
      canvas.setDirty?.(true, true);
      return;
    }
    if (event.buttons) return;
    const canvas = onCanvas(event);
    if (!canvas) return;
    const ties = tiesOf(canvas.graph);
    if (!ties.length) {
      if (state.outlet) pointAt(canvas, null);
      if (state.hovered) hovered(canvas, null);
      return;
    }
    const point = graphPoint(canvas, event);
    const pad = HIT_PX / (canvas.ds?.scale || 1);
    const outlet = tapsOn(canvas) ? outletAt(state, ties, point, pad) : null;
    const tie = outlet?.tie ?? tieAt(state, ties, point, pad);
    pointAt(canvas, outlet);
    hovered(canvas, tie);
    if (tie) {
      const cursor = outlet ? "crosshair" : event.altKey ? TURN : "grab";
      requestAnimationFrame(() => { canvas.canvas.style.cursor = cursor; });
    }
  });

  const finish = (event) => {
    const canvas = app.canvas;
    if (state.slice && event.pointerId === state.slice.pointer) {
      event.stopImmediatePropagation();
      const slice = state.slice;
      state.slice = null;
      hideCut();
      const graph = canvas?.graph;
      if (event.type !== "pointerup" || !graph) return;
      slice.last = [event.clientX, event.clientY];
      slice.straight = event.shiftKey;
      const aimed = aim(slice);
      const end = toGraph(canvas, aimed[0], aimed[1]);
      if (Math.hypot(end[0] - slice.start[0], end[1] - slice.start[1]) < 4 / (canvas.ds?.scale || 1)) {
        return;
      }
      const made = cut(state, graph, state.ends, canvas.links_render_mode, slice.start, end, drawnLines);
      if (made?.remove) removeTies(canvas, graph, made.remove);
      else if (made?.add) {
        if (slice.straight) {
          made.add.angle = snap(made.add.angle);
          made.add.fixed = true;
        }
        tiesOf(graph, true).push(made.add);
        commit(canvas);
      } else canvas.setDirty?.(true, true);
      return;
    }
    if (state.drag && event.pointerId === state.drag.pointer) {
      event.stopImmediatePropagation();
      const done = state.drag.moved;
      state.drag = null;
      if (!canvas) return;
      if (canvas.canvas) canvas.canvas.style.cursor = "";
      if (done) commit(canvas);
      else canvas.setDirty?.(true, true);
    }
  };
  on("pointerup", finish);
  on("pointercancel", finish);

  return () => {
    for (const [type, fn] of handlers) window.removeEventListener(type, fn, true);
    state.zHeld = false;
    state.slice = null;
    state.drag = null;
    hideCut();
    state.overlay?.svg.remove();
    state.overlay = null;
  };
}

function start() {
  const canvas = app.canvas;
  const proto = Object.getPrototypeOf(canvas);
  const unwrap = wrapDrawing(proto);
  const unlisten = listen();
  const unhook = hookCanvas(canvas);
  state.live = true;
  canvas.setDirty?.(true, true);
  return () => {
    state.live = false;
    unhook();
    state.hovered = null;
    state.graph = null;
    state.ends = new Map();
    state.plans = new Map();
    state.sequence = new Map();
    unlisten();
    unwrap();
    app.canvas?.setDirty?.(true, true);
  };
}

export { start };
