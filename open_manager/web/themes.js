// Colour palettes for ComfyUI, spanning light and dark, each with a grid-aligned canvas
// background, registered into ComfyUI's own palette system.

import { app } from "../../scripts/app.js";

// Wire colours by socket type, bright enough to read on a dark canvas.
const SLOTS_DARK = {
  CLIP: "#ffd500", CLIP_VISION: "#a8dadc", CLIP_VISION_OUTPUT: "#ad7452",
  CONDITIONING: "#ffa931", CONTROL_NET: "#6ee7b7", IMAGE: "#64b5f6", LATENT: "#ff9cf9",
  MASK: "#81c784", MODEL: "#b39ddb", STYLE_MODEL: "#c2ffae", VAE: "#ff6e6e", TAESD: "#dcc274",
  PIPE_LINE: "#7737aa", INT: "#29699c", XYPLOT: "#74da5d", SAMPLING: "#60a5fa",
};

// The same sockets in deeper tones, for a light canvas.
const SLOTS_LIGHT = {
  CLIP: "#a8780a", CLIP_VISION: "#2f7d8c", CLIP_VISION_OUTPUT: "#7a4a34",
  CONDITIONING: "#c2620a", CONTROL_NET: "#12805a", IMAGE: "#1565c0", LATENT: "#a3229c",
  MASK: "#37762c", MODEL: "#5a34a8", STYLE_MODEL: "#5f8a1f", VAE: "#c02b2b", TAESD: "#96701a",
  PIPE_LINE: "#5a2a80", INT: "#1b4f72", XYPLOT: "#3a8a2a", SAMPLING: "#1565c0",
};

// Brand sockets for the Comfy themes, drawn from plum, mauve and yellow.
const SLOTS_BRAND = {
  CLIP: "#f2ff59", CLIP_VISION: "#9d8ad6", CLIP_VISION_OUTPUT: "#b08a6a",
  CONDITIONING: "#e0b83a", CONTROL_NET: "#6fc9a8", IMAGE: "#7aa2f7", LATENT: "#c79be8",
  MASK: "#8fd18a", MODEL: "#a08fd4", STYLE_MODEL: "#cfe07a", VAE: "#e0736f", TAESD: "#c9a24a",
  PIPE_LINE: "#4d3762", INT: "#49378b", XYPLOT: "#8fd18a", SAMPLING: "#a08fd4",
};

// Brand sockets deepened for a light canvas.
const SLOTS_BRAND_LIGHT = {
  CLIP: "#8a7a12", CLIP_VISION: "#5a4a9e", CLIP_VISION_OUTPUT: "#7a5a3a",
  CONDITIONING: "#a8770f", CONTROL_NET: "#1f7d63", IMAGE: "#3355b5", LATENT: "#7a3f9e",
  MASK: "#3f7d3a", MODEL: "#49378b", STYLE_MODEL: "#6a7f2a", VAE: "#b03a36", TAESD: "#8a6a1f",
  PIPE_LINE: "#4d3762", INT: "#3a2f6a", XYPLOT: "#3f7d3a", SAMPLING: "#49378b",
};

// A tiling background as an SVG data URI on a 100-unit tile, ten snap-grid cells wide. Fine
// marks sit every 10 or 20 units and a heavier mark every 100. Interior marks are held
// clear of the tile edge and lines run flush to it. ``format`` selects the pattern and
// ``dark`` sets the tone.
function background(format, dark) {
  const c = dark ? "255,255,255" : "20,22,28";
  const minor = dark ? 0.05 : 0.07;
  const major = dark ? 0.10 : 0.13;
  const mark = dark ? 0.13 : 0.17;
  const anchor = dark ? 0.22 : 0.26;
  const rect = (x, y, w, h, a) => `<rect x='${x}' y='${y}' width='${w}' height='${h}' fill='rgba(${c},${a})'/>`;
  const dot = (x, y, r, a) => `<circle cx='${x}' cy='${y}' r='${r}' fill='rgba(${c},${a})'/>`;
  const lattice = [10, 30, 50, 70, 90];
  let inner = "";

  if (format === "dots") {
    for (const x of lattice) for (const y of lattice) inner += dot(x, y, 1, mark);
    inner += dot(50, 50, 2.1, anchor);
  } else if (format === "crosshair") {
    for (const x of lattice) {
      for (const y of lattice) inner += rect(x - 0.5, y - 2.5, 1, 5, mark) + rect(x - 2.5, y - 0.5, 5, 1, mark);
    }
    inner += rect(49.5, 43, 1, 14, anchor) + rect(43, 49.5, 14, 1, anchor);
  } else if (format === "blueprint") {
    for (let p = 10; p < 100; p += 10) inner += rect(p, 0, 1, 100, minor) + rect(0, p, 100, 1, minor);
    inner += rect(0, 0, 1, 100, major) + rect(0, 0, 100, 1, major);
  } else {
    for (const p of [20, 40, 60, 80]) inner += rect(p, 0, 1, 100, minor) + rect(0, p, 100, 1, minor);
    inner += rect(0, 0, 1, 100, major) + rect(0, 0, 100, 1, major);
  }

  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'>${inner}</svg>`;
  return "data:image/svg+xml;base64," + btoa(svg);
}

// Category hues drawn from the Comfy brand: plum, mauve, yellow, canvas, warm gray.
const BRAND_HUES = {
  loaders: "#49378b", conditioning: "#f2ff59", sampling: "#6b4fa8", latent: "#9d8ad6",
  image: "#c2bfb9", mask: "#7e7c78", audio: "#d4c85a", video: "#8f6fb5",
  utils: "#5a5760", advanced: "#4d3762", model: "#3a2b6d", api: "#b09ae0",
};

// Blend two hex colours; ``t`` is how much of ``b`` to take.
function mix(a, b, t) {
  const cut = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  try {
    const [ar, ag, ab] = cut(a);
    const [br, bg, bb] = cut(b);
    const to = (x, y) => Math.round(x + (y - x) * t).toString(16).padStart(2, "0");
    return `#${to(ar, br)}${to(ag, bg)}${to(ab, bb)}`;
  } catch {
    return a;
  }
}

// Hex to HSL and back.
function hexToHsl(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const span = max - min;
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (span) {
    s = l > 0.5 ? span / (2 - max - min) : span / (max + min);
    if (max === r) h = (g - b) / span + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / span + 2;
    else h = (r - g) / span + 4;
    h *= 60;
  }
  return { h, s: s * 100, l: l * 100 };
}

function hslToHex(h, s, l) {
  const sat = s / 100;
  const lum = l / 100;
  const k = (n) => (n + h / 30) % 12;
  const a = sat * Math.min(lum, 1 - lum);
  const f = (n) => lum - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const to = (x) => Math.round(x * 255).toString(16).padStart(2, "0");
  return `#${to(f(0))}${to(f(8))}${to(f(4))}`;
}

// How far each category sits from the theme's accent, in degrees.
const CATEGORY_SPREAD = {
  loaders: -55, conditioning: 35, sampling: 0, latent: 70, image: -25, mask: 110,
  audio: 55, video: 90, utils: 0, advanced: -80, model: -55, api: 70,
};

// Header colours per category. An explicit hue table is used as given; otherwise each hue is
// turned around the theme's own accent.
function categoryColours(dark, accent, hues) {
  const out = {};
  if (hues) {
    for (const [name, hue] of Object.entries(hues)) {
      out[name] = dark ? mix(hue, "#000000", 0.28) : mix(hue, "#ffffff", 0.18);
    }
    return out;
  }
  const base = hexToHsl(accent);
  for (const [name, shift] of Object.entries(CATEGORY_SPREAD)) {
    const hue = (base.h + shift + 360) % 360;
    const sat = name === "utils" ? Math.max(6, base.s * 0.3) : Math.min(68, Math.max(32, base.s));
    out[name] = hslToHex(hue, sat, dark ? 27 : 76);
  }
  return out;
}

// Text that reads on a given background.
function contrastOn(color) {
  return luminance(color) > 0.55 ? "#141418" : "#ffffff";
}

// Relative luminance of any CSS colour, 0 to 1.
function luminance(color) {
  try {
    const ctx = document.createElement("canvas").getContext("2d");
    ctx.fillStyle = "#000000";
    ctx.fillStyle = color;
    const value = ctx.fillStyle;
    let r, g, b;
    if (value[0] === "#") {
      r = parseInt(value.slice(1, 3), 16);
      g = parseInt(value.slice(3, 5), 16);
      b = parseInt(value.slice(5, 7), 16);
    } else {
      const match = value.match(/(\d+)\D+(\d+)\D+(\d+)/);
      if (!match) return 0;
      [, r, g, b] = match.map(Number);
    }
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  } catch {
    return 0;
  }
}

// Mark a light palette, which the interface reads to leave dark mode.
function repairLightPalettes(palettes) {
  let repaired = false;
  for (const palette of Object.values(palettes)) {
    if (!palette || palette.light_theme) continue;
    const bg = palette.colors?.comfy_base?.["bg-color"];
    if (bg && luminance(bg) > 0.6) {
      palette.light_theme = true;
      repaired = true;
    }
  }
  return repaired;
}

// A palette from a compact spec. ``title`` colours the node header apart from its body;
// ``slots`` overrides the socket set.
function theme({ id, name, dark, format, bg, surface, title, text, subtext, border, accent, neon, widget, link, slots, hues }) {
  const glow = neon || accent;
  const header = title || accent;
  const sockets = slots || (dark ? SLOTS_DARK : SLOTS_LIGHT);
  return {
    id,
    name,
    version: 13,
    ...(dark ? {} : { light_theme: true }),
    // Read by Open Manager; ComfyUI's own loader ignores it.
    extras: {
      shape: { radius: 10, titleHeight: 28, slotHeight: 20 },
      links: { mode: "spline", border: false },
      categories: categoryColours(dark, accent, hues),
      glow: { selected: glow, blur: dark ? 16 : 10 },
    },
    colors: {
      node_slot: sockets,
      litegraph_base: {
        BACKGROUND_IMAGE: background(format, dark),
        CLEAR_BACKGROUND_COLOR: bg,
        NODE_TITLE_COLOR: contrastOn(header),
        NODE_SELECTED_TITLE_COLOR: dark ? "#ffffff" : "#000000",
        NODE_TEXT_SIZE: 14,
        NODE_TEXT_COLOR: text,
        NODE_SUBTEXT_SIZE: 12,
        NODE_DEFAULT_COLOR: header,
        NODE_DEFAULT_BGCOLOR: surface,
        NODE_DEFAULT_BOXCOLOR: accent,
        NODE_DEFAULT_SHAPE: 2,
        NODE_BOX_OUTLINE_COLOR: glow,
        NODE_BYPASS_BGCOLOR: "#ff00ff",
        NODE_ERROR_COLOUR: "#e00000",
        DEFAULT_SHADOW_COLOR: dark ? "rgba(0,0,0,0.35)" : "rgba(0,0,0,0.08)",
        DEFAULT_GROUP_FONT: 24,
        WIDGET_BGCOLOR: widget,
        WIDGET_OUTLINE_COLOR: border,
        WIDGET_TEXT_COLOR: text,
        WIDGET_SECONDARY_TEXT_COLOR: subtext,
        LINK_COLOR: link,
        EVENT_LINK_COLOR: glow,
        CONNECTING_LINK_COLOR: glow,
      },
      comfy_base: {
        "fg-color": text,
        "bg-color": bg,
        "comfy-menu-bg": surface,
        "comfy-input-bg": widget,
        "input-text": text,
        "descrip-text": subtext,
        "drag-text": subtext,
        "error-text": "#ff5555",
        "border-color": border,
        "tr-even-bg-color": surface,
        "tr-odd-bg-color": bg,
        "content-bg": surface,
        "content-fg": text,
        "content-hover-bg": border,
        "content-hover-fg": text,
      },
    },
  };
}

// LiteGraph geometry as it was before a theme touched it.
let baseShape = null;
let activeExtras = null;
let hookInstalled = false;

// Category keys a node answers to, most specific first: the full path, then the bucket below
// ``model/`` where core nodes nest, then each shorter path.
function categoryKeys(node) {
  const raw = String(node?.constructor?.category ?? node?.category ?? "").trim().toLowerCase();
  const parts = raw.split("/").filter(Boolean);
  if (!parts.length) return [];
  const keys = [parts.join("/")];
  if (parts[0] === "model" && parts.length > 1) keys.push(parts[1]);
  for (let i = parts.length - 1; i > 0; i--) keys.push(parts.slice(0, i).join("/"));
  return keys;
}

// The colour a category table gives a node, or undefined.
function categoryColour(categories, node) {
  if (!categories) return undefined;
  for (const key of categoryKeys(node)) {
    if (categories[key]) return categories[key];
  }
  return undefined;
}

//: Link shapes a theme may ask for.
const LINK_MODES = new Set(["straight", "linear", "spline"]);

// Reduce a theme's extras to known keys within known bounds. Nothing outside this shape
// reaches the renderer.
function sanitiseExtras(raw) {
  if (!raw || typeof raw !== "object") return null;
  const out = {};
  const number = (value, limit) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 && parsed <= limit ? parsed : undefined;
  };

  if (raw.shape && typeof raw.shape === "object") {
    const shape = {};
    for (const key of ["radius", "titleHeight", "slotHeight"]) {
      const value = number(raw.shape[key], 120);
      if (value !== undefined) shape[key] = value;
    }
    if (Object.keys(shape).length) out.shape = shape;
  }

  if (raw.links && typeof raw.links === "object") {
    const links = {};
    if (LINK_MODES.has(raw.links.mode)) links.mode = raw.links.mode;
    if (typeof raw.links.border === "boolean") links.border = raw.links.border;
    if (Object.keys(links).length) out.links = links;
  }

  if (raw.categories && typeof raw.categories === "object") {
    const categories = {};
    for (const [name, colour] of Object.entries(raw.categories)) {
      if (typeof colour === "string") categories[name] = colour;
    }
    if (Object.keys(categories).length) out.categories = categories;
  }

  if (raw.nodes && typeof raw.nodes === "object") {
    const nodes = {};
    for (const [type, rule] of Object.entries(raw.nodes)) {
      if (typeof rule === "string") nodes[type] = rule;
      else if (rule && typeof rule === "object") {
        const kept = {};
        if (typeof rule.color === "string") kept.color = rule.color;
        if (typeof rule.title === "string") kept.title = rule.title.slice(0, 60);
        if (Object.keys(kept).length) nodes[type] = kept;
      }
    }
    if (Object.keys(nodes).length) out.nodes = nodes;
  }

  if (raw.glow && typeof raw.glow === "object" && typeof raw.glow.selected === "string") {
    out.glow = { selected: raw.glow.selected, blur: number(raw.glow.blur, 40) ?? 12 };
  }

  return Object.keys(out).length ? out : null;
}

function extrasFor(palette) {
  if (palette?.extras) return sanitiseExtras(palette.extras);
  try {
    const store = app.extensionManager.setting.get("Comfy.CustomColorPalettes") || {};
    return sanitiseExtras(store[palette?.id]?.extras);
  } catch {
    return null;
  }
}

// Wraps node drawing once. The header tint and selection glow are applied for the draw and
// undone straight after, leaving the saved workflow unchanged.
function installDrawHook() {
  const proto = window.LGraphCanvas?.prototype;
  if (!proto || hookInstalled || typeof proto.drawNode !== "function") return;
  const original = proto.drawNode;
  proto.drawNode = function (node, ctx, ...rest) {
    const extras = activeExtras;
    if (!extras) return original.call(this, node, ctx, ...rest);

    // Precedence: a colour set on the node, then a rule for its class, then the category
    // tint. A rule is a colour, or {color, title} to relabel the class.
    const rule = extras.nodes?.[node.type];
    const ruleColor = typeof rule === "string" ? rule : rule?.color;
    const tint = node.color ? null : (ruleColor ?? categoryColour(extras.categories, node));
    const savedColor = node.color;
    const savedTitle = node.title;
    const savedTitleColor = this.node_title_color;
    if (tint) {
      node.color = tint;
      this.node_title_color = contrastOn(tint);
    }
    if (rule?.title) node.title = rule.title;

    const glow = extras.glow;
    const selected = !!(this.selected_nodes && this.selected_nodes[node.id]);
    const lit = glow?.selected && selected;
    if (lit) {
      ctx.save();
      ctx.shadowColor = glow.selected;
      ctx.shadowBlur = glow.blur || 12;
    }
    try {
      return original.call(this, node, ctx, ...rest);
    } finally {
      if (lit) ctx.restore();
      node.color = savedColor;
      node.title = savedTitle;
      this.node_title_color = savedTitleColor;
    }
  };
  hookInstalled = true;
}

// Apply a palette's extras: geometry, link shape, and the data the draw hook reads. A
// palette without extras restores LiteGraph's starting values.
export function applyExtras(palette) {
  const lg = window.LiteGraph;
  if (!lg) return;
  if (!baseShape) {
    baseShape = {
      radius: lg.ROUND_RADIUS,
      titleHeight: lg.NODE_TITLE_HEIGHT,
      slotHeight: lg.NODE_SLOT_HEIGHT,
      linkMode: lg.LINK_RENDER_MODE,
    };
  }
  const extras = extrasFor(palette);
  activeExtras = extras;

  const shape = extras?.shape;
  lg.ROUND_RADIUS = shape?.radius ?? baseShape.radius;
  lg.NODE_TITLE_HEIGHT = shape?.titleHeight ?? baseShape.titleHeight;
  lg.NODE_SLOT_HEIGHT = shape?.slotHeight ?? baseShape.slotHeight;

  const modes = { straight: lg.STRAIGHT_LINK, linear: lg.LINEAR_LINK, spline: lg.SPLINE_LINK };
  const mode = modes[extras?.links?.mode];
  lg.LINK_RENDER_MODE = mode === undefined ? baseShape.linkMode : mode;

  const canvas = app.canvas;
  if (canvas) {
    if (baseShape.linkBorder === undefined) baseShape.linkBorder = canvas.render_connections_border;
    canvas.render_connections_border = extras?.links?.border ?? baseShape.linkBorder;
    // The canvas holds its own copy, taken from the link render setting.
    if (baseShape.canvasLinkMode === undefined) baseShape.canvasLinkMode = canvas.links_render_mode;
    canvas.links_render_mode = mode === undefined ? baseShape.canvasLinkMode : mode;
  }

  // The hook goes in only for a theme declaring extras. Every other palette is drawn by
  // ComfyUI untouched.
  if (extras) installDrawHook();
  app.canvas?.setDirty(true, true);
}

// Re-read the active palette's extras, for when a setting changes.
export function refreshExtras() {
  try { applyExtras(app.extensionManager?.colorPalette?.getActiveColorPalette?.()); } catch {}
}

// Keep extras in step with the palette, however it is chosen.
export function watchThemeExtras() {
  const service = app.extensionManager?.colorPalette;
  if (!service?.loadColorPalette || service.__omExtrasHook) return;
  const original = service.loadColorPalette.bind(service);
  service.loadColorPalette = async (...args) => {
    const result = await original(...args);
    try { applyExtras(service.getActiveColorPalette?.()); } catch {}
    return result;
  };
  service.__omExtrasHook = true;
  const settle = () => { try { applyExtras(service.getActiveColorPalette?.()); } catch {} };
  settle();
  setTimeout(settle, 1200);
}

// Ids replaced by the themes below, dropped from the palette store on load.
const RETIRED = ["om_tokyo_night", "om_catppuccin_mocha", "om_catppuccin_latte", "om_rose_pine_dawn"];

// Two dark, two light; warm and vibrant, one background format each.
export const THEMES = [
  theme({
    id: "om_ember", name: "Ember", dark: true, format: "dots",
    bg: "#150e0a", surface: "#241710", text: "#f5e2cf", subtext: "#ad917a",
    border: "#422b1d", accent: "#e2762f", neon: "#ff9b45", widget: "#1d130d", link: "#e0a15e",
  }),
  theme({
    id: "om_verdant", name: "Verdant", dark: true, format: "graph",
    bg: "#06120d", surface: "#0e2018", text: "#d6f2e0", subtext: "#7ba894",
    border: "#1c3a2b", accent: "#24b981", neon: "#5ff2ad", widget: "#0a1a12", link: "#6fd9bd",
  }),
  theme({
    id: "om_sandstone", name: "Sandstone", dark: false, format: "crosshair",
    bg: "#e7dac3", surface: "#f2e9d8", text: "#46372a", subtext: "#7d6a55",
    border: "#cbb695", accent: "#b3622a", widget: "#ddcdb2", link: "#4f7a63",
  }),
  theme({
    id: "om_coral", name: "Coral", dark: false, format: "blueprint",
    bg: "#f4e2da", surface: "#fceee8", text: "#57332c", subtext: "#8e685e",
    border: "#e0bfb2", accent: "#e0553f", widget: "#eddad1", link: "#2f7f7a",
  }),
  // ComfyUI brand colours: Ink, Plum, Yellow, Canvas, Warm White, Warm Gray.
  theme({
    id: "om_comfy_dark", name: "Comfy Dark", dark: true, format: "graph", slots: SLOTS_BRAND, hues: BRAND_HUES,
    title: "#f2ff59", bg: "#211927", surface: "#2e2438", text: "#f0efed", subtext: "#918c99",
    border: "#3f3350", accent: "#49378b", neon: "#f2ff59", widget: "#1a1420", link: "#a08fd4",
  }),
  theme({
    id: "om_comfy_light", name: "Comfy Light", dark: false, format: "crosshair", slots: SLOTS_BRAND_LIGHT, hues: BRAND_HUES,
    title: "#f2ff59", bg: "#c2bfb9", surface: "#f0efed", text: "#211927", subtext: "#7e7c78",
    border: "#a8a49c", accent: "#49378b", widget: "#d9d6d0", link: "#4d3762",
  }),
];

// Merge the themes into the palette store. Only palettes named here are written; a changed
// definition takes effect on the next load.
export async function registerThemes() {
  const setting = app.extensionManager?.setting;
  const service = app.extensionManager?.colorPalette;
  if (!setting) return;

  let store = {};
  try { store = setting.get("Comfy.CustomColorPalettes") || {}; } catch {}
  if (!Object.keys(store).length) return;

  const merged = {};
  let changed = false;
  for (const [id, palette] of Object.entries(store)) {
    if (RETIRED.includes(id)) { changed = true; continue; }
    merged[id] = palette;
  }
  for (const palette of THEMES) {
    const stored = merged[palette.id];
    if (!stored || (stored.version || 0) < palette.version) {
      merged[palette.id] = palette;
      changed = true;
    }
  }
  if (repairLightPalettes(merged)) changed = true;
  if (!changed) return;

  try { setting.set("Comfy.CustomColorPalettes", merged); } catch {}
  // A retired theme is no longer in the store; step onto a built-in.
  const active = service?.getActiveColorPalette?.()?.id;
  if (RETIRED.includes(active)) {
    try { await service.loadColorPalette("dark"); } catch {}
  }
}
