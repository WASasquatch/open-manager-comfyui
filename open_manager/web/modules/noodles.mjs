import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import { themeLinkStyle } from "../themes.js";
import { LINK_STYLES, LINK_PATHS, MOVING_STYLES } from "./noodles/names.mjs";
import { trackFor, lineOf, midOf, pointsOf, LEFT, RIGHT, STRAIGHT } from "./noodles/track.mjs";
import { paints, paintNoodle, paintMarker, girthOf, rgbOf } from "./noodles/paint.mjs";
import { circuitFrame, circuitTrack, setCircuitRedraw } from "./noodles/route.mjs";
import { ropeTrack } from "./noodles/rope.mjs";
import { ghostBegin, ghostLayer, ghostNote, ghostAura, ghostFlush } from "./noodles/ghost.mjs";

const STYLE_KEY = "openManager.linkStyle";
const PATH_KEY = "openManager.linkPath";
const GHOST_KEY = "openManager.linkGhost";
const MOTION_KEY = "openManager.linkMotion";

const FROM_THEME = "theme";
const SOLID = "solid";
const COMFY = "comfy";
const CIRCUIT = "circuit";
const PHYSICS = "physics";

const HIDDEN_LINK = -1;
const NO_MARKER = 0;
const MARKER_ZOOM = 0.6;
const BASE_WIDTH = 3;
const FLOATING_ALPHA = 0.55;
const LANE_GAP = 2;
const SHOWN_EXTRA = 22;

const FRAME_MS = 1000 / 30;
const SLOWEST_MS = 250;
const IDLE_MS = 500;
const SHARE = 0.25;

const READY_TRIES = 120;

const state = {
  style: FROM_THEME,
  path: COMFY,
  ghost: false,
  motion: "always",
  running: false,
  installed: false,
  quiet: true,
  broken: false,
  loop: 0,
  kicked: 0,
  gap: FRAME_MS,
  spent: 0,
  painted: 0,
  busy: 0,
  busyFrame: -1,
  drawn: new Map(),
  drawnFrame: -1,
};

function readSetting(id, fallback) {
  try {
    return app.extensionManager?.setting?.get(id) ?? fallback;
  } catch {
    return fallback;
  }
}

function chosenStyle() {
  if (state.broken) return SOLID;
  const picked = state.style === FROM_THEME ? themeLinkStyle() || SOLID : state.style;
  return paints(picked) ? picked : SOLID;
}

function motionOn() {
  return state.motion === "always" || (state.motion === "running" && state.running);
}

function moving() {
  const canvas = app.canvas;
  if (!canvas || canvas.links_render_mode === HIDDEN_LINK || !motionOn() || state.broken) return false;
  return MOVING_STYLES.has(chosenStyle()) || state.ghost || (state.path === PHYSICS && state.busy > 0);
}

function tick(now) {
  state.loop = 0;
  if (!moving()) return;
  state.loop = requestAnimationFrame(tick);
  if (document.hidden || now - state.kicked < state.gap) return;
  if (state.kicked) {
    state.gap = state.painted
      ? Math.min(SLOWEST_MS, Math.max(FRAME_MS, state.spent / SHARE))
      : IDLE_MS;
  }
  state.spent = 0;
  state.painted = 0;
  state.kicked = now;
  app.canvas?.setDirty?.(false, true);
}

function arm() {
  if (state.loop || !moving()) return;
  state.kicked = 0;
  state.gap = FRAME_MS;
  state.loop = requestAnimationFrame(tick);
}

function restyle() {
  state.style = readSetting(STYLE_KEY, FROM_THEME);
  state.path = readSetting(PATH_KEY, COMFY);
  state.ghost = readSetting(GHOST_KEY, false) === true;
  state.motion = readSetting(MOTION_KEY, "always");
  app.canvas?.setDirty?.(true, true);
  arm();
}

function noop() {}

function quietContext() {
  const quiet = {};
  const proto = window.CanvasRenderingContext2D?.prototype;
  if (proto) {
    for (const name of Object.getOwnPropertyNames(proto)) {
      const held = Object.getOwnPropertyDescriptor(proto, name);
      if (typeof held?.value === "function" && name !== "constructor") quiet[name] = noop;
    }
  }
  const identity = typeof DOMMatrix === "function" ? new DOMMatrix() : null;
  const gradient = { addColorStop: noop };
  Object.assign(quiet, {
    getTransform: () => identity,
    getLineDash: () => [],
    measureText: () => ({ width: 0 }),
    isPointInPath: () => false,
    isPointInStroke: () => false,
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    createConicGradient: () => gradient,
    createPattern: () => null,
  });
  return quiet;
}

let QUIET = null;

function colourOf(colour, link, context, lit) {
  if (lit) return "#FFF";
  if (colour !== null && colour !== undefined) return String(colour);
  const typed = link?.type !== undefined ? context.linkTypeColors?.[String(link.type)] : undefined;
  return String(typed || context.defaultLinkColor || "#9A9");
}

function scaleOf(width) {
  return width / BASE_WIDTH;
}

function spacingFor(canvas) {
  const width = Number(canvas?.connections_width) || BASE_WIDTH;
  return Math.max(width, girthOf(chosenStyle(), scaleOf(width))) + LANE_GAP;
}

function claim(segment, track) {
  if (!segment) return;
  segment.path = lineOf(track);
  const mid = midOf(track);
  if (segment._pos && segment._pos.length >= 2) {
    segment._pos[0] = mid.pos[0];
    segment._pos[1] = mid.pos[1];
  } else {
    segment._pos = [mid.pos[0], mid.pos[1]];
  }
  segment._centreAngle = mid.angle;
}

function remember(link, extras, track) {
  if (!link || extras?.reroute) return;
  const frame = app.canvas?.frame;
  if (frame !== state.drawnFrame) {
    state.drawn = new Map();
    state.drawnFrame = frame;
  }
  let list = state.drawn.get(link.id);
  if (!list) {
    list = [];
    state.drawn.set(link.id, list);
  }
  list.push(track);
}

function shapeFor(segment, context, a, b, sd, ed, sc, ec, now, live) {
  if (state.path === CIRCUIT) {
    return circuitTrack(segment, a, b, sd, ed, sc, ec)
      ?? trackFor(segment, STRAIGHT, a, b, sd, ed, sc, ec);
  }
  if (state.path === PHYSICS) {
    const hung = ropeTrack(segment, a, b, sd, ed, sc, ec, now, live);
    if (hung.busy) state.busy += 1;
    return hung.track;
  }
  return trackFor(segment, context.renderMode, a, b, sd, ed, sc, ec);
}

function wrapAdapter(proto) {
  const original = proto.renderLinkDirect;
  const styled = function (ctx, a, b, link, skipBorder, flow, colour, sd, ed, context, extras) {
    if (!context || !a || !b || !ctx || ctx === QUIET) return original.apply(this, arguments);
    const style = chosenStyle();
    const layer = state.ghost && !state.broken ? ghostLayer(ctx) : null;
    if (style === SOLID && state.path === COMFY && !layer) return original.apply(this, arguments);
    const begun = performance.now();
    let traced = false;
    if (state.quiet) {
      try {
        QUIET ??= quietContext();
        original.call(this, QUIET, a, b, link, skipBorder, flow, colour, sd, ed, context, extras);
        traced = true;
      } catch {
        state.quiet = false;
      }
    }
    if (!traced) {
      const alpha = ctx.globalAlpha;
      ctx.globalAlpha = 0;
      try {
        original.apply(this, arguments);
      } finally {
        ctx.globalAlpha = alpha;
      }
    }
    const segment = extras?.reroute ?? link ?? null;
    const lit = !!link && !!context.highlightedLinks?.has?.(String(link.id));
    const shown = colourOf(colour, link, context, lit);
    const move = motionOn();
    const target = layer ?? ctx;
    target.save();
    try {
      if (layer) layer.globalAlpha = ctx.globalAlpha;
      target.shadowColor = "rgba(0,0,0,0)";
      if (extras?.disabled) target.globalAlpha *= FLOATING_ALPHA;
      const now = performance.now();
      const track = shapeFor(segment, context, a, b, sd || RIGHT, ed || LEFT,
        extras?.startControl, extras?.endControl, now, move);
      if (state.path !== COMFY) {
        claim(segment, track);
        remember(link, extras, track);
      }
      const width = Number(context.connectionWidth) || BASE_WIDTH;
      const k = scaleOf(width);
      if (track.length > 0.5) {
        const girth = Math.max(width, girthOf(style, k));
        if (layer) ghostAura(target, track, rgbOf(shown), girth);
        paintNoodle(target, style, track, {
          colour: shown,
          lit,
          k,
          width,
          border: !!context.renderBorder,
          low: !!context.lowQuality,
          scale: Number(context.scale) || 1,
          time: move ? now / 1000 : 0,
          moving: move,
          view: app.canvas?.visible_area,
          seed: ((Number(link?.id) || 0) * 31 + (Number(extras?.reroute?.id) || 0)) | 0,
        });
        if (layer) {
          ghostNote(track, !extras?.startControl, !extras?.endControl && !extras?.reroute, lit,
            girth * 2 + SHOWN_EXTRA, move ? now / 1000 : 0);
        }
      }
      if (segment?._pos && context.linkMarkerShape !== NO_MARKER && context.highQualityRender
          && Number(context.scale) >= MARKER_ZOOM) {
        paintMarker(target, segment._pos, segment._centreAngle, context.linkMarkerShape, shown);
      }
    } catch (error) {
      state.broken = true;
      console.warn("[Open Manager] Link styles: stood down, drawing failed", error);
      target.restore();
      target.save();
      original.apply(this, arguments);
    } finally {
      target.restore();
    }
    state.spent += performance.now() - begun;
    state.painted += 1;
    if (move && !state.loop && MOVING_STYLES.has(style)) arm();
    return undefined;
  };
  proto.renderLinkDirect = styled;
}

function wrapCanvas(proto) {
  const inner = proto.drawConnections;
  if (typeof inner !== "function") return;
  proto.drawConnections = function (ctx, ...rest) {
    if (this !== app.canvas || !state.installed || state.broken) return inner.call(this, ctx, ...rest);
    if (this.frame !== state.busyFrame) {
      state.busy = 0;
      state.busyFrame = this.frame;
    }
    if (state.path === CIRCUIT && this.graph) circuitFrame(this.graph, spacingFor(this));
    const layered = state.ghost && this.links_render_mode !== HIDDEN_LINK && ghostBegin(ctx);
    try {
      return inner.call(this, ctx, ...rest);
    } finally {
      if (layered) {
        try {
          ghostFlush(ctx);
        } catch (error) {
          console.warn("[Open Manager] Ghost links: drawing failed", error);
        }
      }
      if (state.busy) arm();
    }
  };
}

function install() {
  if (state.installed) return true;
  const canvas = app.canvas;
  const renderer = canvas?.linkRenderer;
  const proto = renderer ? Object.getPrototypeOf(renderer) : null;
  if (typeof proto?.renderLinkDirect !== "function") return false;
  wrapAdapter(proto);
  wrapCanvas(Object.getPrototypeOf(canvas));
  setCircuitRedraw(() => app.canvas?.setDirty?.(false, true));
  state.installed = true;
  return true;
}

export function linkGirth(canvas) {
  const k = scaleOf(Number(canvas?.connections_width) || BASE_WIDTH);
  const style = state.installed ? chosenStyle() : SOLID;
  return style === SOLID ? 0 : girthOf(style, k);
}

export function drawnLines(id) {
  if (!state.installed || state.path === COMFY || state.broken) return null;
  const list = state.drawn.get(id);
  return list?.length ? list.map(pointsOf) : null;
}

export function startNoodles() {
  let tries = 0;
  const attempt = () => {
    if (install()) {
      restyle();
      return;
    }
    tries += 1;
    if (tries < READY_TRIES && !app.canvas?.graph) {
      requestAnimationFrame(attempt);
      return;
    }
    console.info("[Open Manager] Link styles: stood down, this ComfyUI draws links without its link adapter");
  };
  attempt();
  try {
    api.addEventListener("status", (event) => {
      const running = (Number(event?.detail?.exec_info?.queue_remaining) || 0) > 0;
      if (running === state.running) return;
      state.running = running;
      if (state.motion === "running") {
        app.canvas?.setDirty?.(false, true);
        arm();
      }
    });
  } catch {}
}

export const noodleSettings = [
  {
    id: STYLE_KEY,
    name: "Link style",
    category: ["Open Manager", "Links", "linkStyle"],
    type: "combo",
    options: [{ value: FROM_THEME, text: "From the theme" }, ...LINK_STYLES],
    defaultValue: FROM_THEME,
    onChange: () => restyle(),
    tooltip: "From the theme uses the active theme's style, or Solid.",
  },
  {
    id: PATH_KEY,
    name: "Link path",
    category: ["Open Manager", "Links", "linkPath"],
    type: "combo",
    options: LINK_PATHS,
    defaultValue: COMFY,
    onChange: () => restyle(),
    tooltip: "Circuit board runs links around nodes and each other, gathering nearby links side by "
      + "side. Physics hangs links under gravity.",
  },
  {
    id: GHOST_KEY,
    name: "Ghost links",
    category: ["Open Manager", "Links", "linkGhost"],
    type: "boolean",
    defaultValue: false,
    onChange: () => restyle(),
    tooltip: "Links fade along their length a short way from their slots, under a drifting glow. "
      + "A selected node's links show in full.",
  },
  {
    id: MOTION_KEY,
    name: "Link motion",
    category: ["Open Manager", "Links", "linkMotion"],
    type: "combo",
    options: [
      { value: "always", text: "Always" },
      { value: "running", text: "While a workflow runs" },
      { value: "never", text: "Never" },
    ],
    defaultValue: "always",
    onChange: () => restyle(),
    tooltip: "For Energy conduit, Flowing dashes, Electric arc, Physics and Ghost links.",
  },
];
