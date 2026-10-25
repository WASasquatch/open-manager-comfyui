import { app } from "../../../../../../scripts/app.js";
import { KEY, BAR, snap, tiesOf, prune, layout, route, tieAt, cut } from "./model.mjs";

const NO_MARKER = 0;

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
};

function gap(canvas) {
  return (canvas.connections_width ?? 3) + 2.5;
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

function paintTies(ctx, ties) {
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
  }
  ctx.restore();
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
      try { paintTies(ctx, ties); } catch {}
      if (shifted) requestAnimationFrame(() => this.setDirty?.(true, true));
    }
    return result;
  };

  proto.renderLink = function (ctx, a, b, link, skipBorder, flow, colour, sd, ed, options) {
    if (!state.live || state.nested || !state.frame || !link || link.parentId != null
        || this !== app.canvas
        || (options && (options.reroute || options.startControl || options.endControl))) {
      return renderLink.apply(this, arguments);
    }
    const tied = state.index.has(link.id);
    if (tied || wantsAll()) state.frame.set(link.id, { a: [a[0], a[1]], b: [b[0], b[1]], sd, ed });
    if (!tied || !state.sequence.get(link.id)?.length) return renderLink.apply(this, arguments);

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

  const ourDraw = proto.drawConnections;
  const ourLink = proto.renderLink;
  return () => {
    if (proto.drawConnections === ourDraw) proto.drawConnections = drawConnections;
    if (proto.renderLink === ourLink) proto.renderLink = renderLink;
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
    const tie = tieAt(state, tiesOf(graph), point, HIT_PX / (canvas.ds?.scale || 1));
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
      if (state.hovered) hovered(canvas, null);
      return;
    }
    const tie = tieAt(state, ties, graphPoint(canvas, event), HIT_PX / (canvas.ds?.scale || 1));
    hovered(canvas, tie);
    if (tie) {
      const cursor = event.altKey ? TURN : "grab";
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
      const made = cut(state, graph, state.ends, canvas.links_render_mode, slice.start, end);
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
  state.live = true;
  canvas.setDirty?.(true, true);
  return () => {
    state.live = false;
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
