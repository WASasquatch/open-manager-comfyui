import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import { themeLinkStyle } from "../themes.js";
import { LINK_STYLES, MOVING_STYLES } from "./noodles/names.mjs";
import { trackFor, LEFT, RIGHT } from "./noodles/track.mjs";
import { paints, paintNoodle, paintMarker, girthOf } from "./noodles/paint.mjs";

const STYLE_KEY = "openManager.linkStyle";
const MOTION_KEY = "openManager.linkMotion";

const FROM_THEME = "theme";
const SOLID = "solid";

const HIDDEN_LINK = -1;
const NO_MARKER = 0;
const MARKER_ZOOM = 0.6;
const BASE_WIDTH = 3;
const FLOATING_ALPHA = 0.55;

const FRAME_MS = 1000 / 30;
const SLOWEST_MS = 250;
const IDLE_MS = 500;
const SHARE = 0.25;

const READY_TRIES = 120;

const state = {
  style: FROM_THEME,
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
  return !!canvas && canvas.links_render_mode !== HIDDEN_LINK
    && MOVING_STYLES.has(chosenStyle()) && motionOn();
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

function wrapAdapter(proto) {
  const original = proto.renderLinkDirect;
  const styled = function (ctx, a, b, link, skipBorder, flow, colour, sd, ed, context, extras) {
    const style = context && a && b && ctx && ctx !== QUIET ? chosenStyle() : SOLID;
    if (style === SOLID) return original.apply(this, arguments);
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
    ctx.save();
    try {
      ctx.shadowColor = "rgba(0,0,0,0)";
      if (extras?.disabled) ctx.globalAlpha *= FLOATING_ALPHA;
      const track = trackFor(segment, context.renderMode, a, b, sd || RIGHT, ed || LEFT,
        extras?.startControl, extras?.endControl);
      if (track.length > 0.5) {
        paintNoodle(ctx, style, track, {
          colour: shown,
          lit,
          k: (Number(context.connectionWidth) || BASE_WIDTH) / BASE_WIDTH,
          scale: Number(context.scale) || 1,
          time: move ? performance.now() / 1000 : 0,
          moving: move,
          view: app.canvas?.visible_area,
          seed: ((Number(link?.id) || 0) * 31 + (Number(extras?.reroute?.id) || 0)) | 0,
        });
      }
      if (segment?._pos && context.linkMarkerShape !== NO_MARKER && context.highQualityRender
          && Number(context.scale) >= MARKER_ZOOM) {
        paintMarker(ctx, segment._pos, segment._centreAngle, context.linkMarkerShape, shown);
      }
    } catch (error) {
      state.broken = true;
      console.warn("[Open Manager] Link styles: stood down, drawing failed", error);
      ctx.restore();
      ctx.save();
      original.apply(this, arguments);
    } finally {
      ctx.restore();
    }
    state.spent += performance.now() - begun;
    state.painted += 1;
    if (move && !state.loop && MOVING_STYLES.has(style)) arm();
    return undefined;
  };
  proto.renderLinkDirect = styled;
}

function install() {
  if (state.installed) return true;
  const renderer = app.canvas?.linkRenderer;
  const proto = renderer ? Object.getPrototypeOf(renderer) : null;
  if (typeof proto?.renderLinkDirect !== "function") return false;
  wrapAdapter(proto);
  state.installed = true;
  return true;
}

export function linkGirth(canvas) {
  const k = (Number(canvas?.connections_width) || BASE_WIDTH) / BASE_WIDTH;
  const style = state.installed ? chosenStyle() : SOLID;
  return style === SOLID ? 0 : girthOf(style, k);
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
    tooltip: "For Energy conduit, Flowing dashes and Electric arc.",
  },
];
