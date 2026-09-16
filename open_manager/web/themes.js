// Colour palettes for ComfyUI, spanning light and dark, each with a grid-aligned canvas
// background, registered into ComfyUI's own palette system.

import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

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

function texture(kind, rgb, alpha) {
  const paint = `rgba(${rgb},${alpha})`;
  let inner = "";
  if (kind === "weave") {
    inner = `<path d='M0 0L16 16M16 0L0 16' stroke='${paint}' stroke-width='1' fill='none'/>`;
  } else if (kind === "grain") {
    inner = [[3, 4], [11, 2], [6, 9], [14, 11], [2, 13], [9, 14]]
      .map(([x, y]) => `<rect x='${x}' y='${y}' width='1' height='1' fill='${paint}'/>`).join("");
  } else if (kind === "rings") {
    inner = `<circle cx='8' cy='8' r='6' stroke='${paint}' stroke-width='1' fill='none'/>`;
  } else {
    inner = `<path d='M0 8H16' stroke='${paint}' stroke-width='1' fill='none'/>`;
  }
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16'>${inner}</svg>`;
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
//: How much lightness ComfyUI adds to every node colour under a palette marked
//: `light_theme`. It sets `LiteGraph.nodeLightness = 0.5` and the node getter adds that to
//: the colour's own lightness, clamped at 100. A light palette therefore has to state its
//: header colours this much darker than it wants them, or everything arrives white.
const LIGHT_LIFT = 50;

//: Lightness floor for a sunk colour. Zero is black, and black has no hue to lift, so any
//: colour already darker than the lift collapsed to grey: purple loaders came back at
//: rgb(142,142,142). A few points above zero keeps the hue and saturation, which the lift
//: carries through.
const SINK_FLOOR = 4;

// The colour to state so that a light palette renders the one that was wanted.
function sink(hex) {
  try {
    const { h, s, l } = hexToHsl(hex);
    return hslToHex(h, s, Math.max(SINK_FLOOR, Math.min(100, l) - LIGHT_LIFT));
  } catch {
    return hex;
  }
}

// The colour ComfyUI would render a stated one as, which is the stated one under every palette
// but a light one. Needed wherever this module draws something ComfyUI would otherwise have
// drawn itself, so the two agree.
function asRendered(colour) {
  const amount = Number(window.LiteGraph?.nodeLightness);
  if (!Number.isFinite(amount) || amount <= 0) return colour;
  try {
    const hex = `#${channels(colour).map((one) => one.toString(16).padStart(2, "0")).join("")}`;
    const { h, s, l } = hexToHsl(hex);
    return hslToHex(h, s, Math.max(0, Math.min(100, l + amount * 100)));
  } catch {
    return colour;
  }
}

function categoryColours(dark, accent, hues) {
  const out = {};
  if (hues) {
    for (const [name, hue] of Object.entries(hues)) {
      out[name] = dark ? mix(hue, "#000000", 0.28) : sink(mix(hue, "#ffffff", 0.18));
    }
    return out;
  }
  const base = hexToHsl(accent);
  for (const [name, shift] of Object.entries(CATEGORY_SPREAD)) {
    const hue = (base.h + shift + 360) % 360;
    const sat = name === "utils" ? Math.max(6, base.s * 0.3) : Math.min(68, Math.max(32, base.s));
    out[name] = hslToHex(hue, sat, dark ? 27 : 76 - LIGHT_LIFT);
  }
  return out;
}

// Text that reads on a given background.
function contrastOn(color) {
  return luminance(color) > 0.55 ? "#141418" : "#ffffff";
}

// Relative luminance of any CSS colour, 0 to 1.
function luminance(color) {
  const [r, g, b] = channels(color);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

let colourPen = null;
const colourSeen = new Map();
const COLOUR_CAP = 500;

function colourReader() {
  if (!colourPen) colourPen = document.createElement("canvas").getContext("2d");
  return colourPen;
}

// Any CSS colour as its three channels, for compositing a scrim over a backdrop image.
function channels(color) {
  const key = String(color);
  const known = colourSeen.get(key);
  if (known) return known;
  let made = [0, 0, 0];
  try {
    const ctx = colourReader();
    ctx.fillStyle = "#000000";
    ctx.fillStyle = color;
    const value = ctx.fillStyle;
    if (value[0] === "#") {
      made = [
        parseInt(value.slice(1, 3), 16),
        parseInt(value.slice(3, 5), 16),
        parseInt(value.slice(5, 7), 16),
      ];
    } else {
      const match = value.match(/(\d+)\D+(\d+)\D+(\d+)/);
      if (match) made = match.slice(1, 4).map(Number);
    }
  } catch {
    made = [0, 0, 0];
  }
  if (colourSeen.size >= COLOUR_CAP) colourSeen.clear();
  colourSeen.set(key, made);
  return made;
}

//: Contrast below which ink is treated as unreadable on a surface, as a WCAG-style ratio.
const INK_MIN_RATIO = 2.5;

function contrastRatio(ink, surface) {
  const one = luminance(ink) + 0.05;
  const two = luminance(surface) + 0.05;
  return one > two ? one / two : two / one;
}

// The colour to leave in `LiteGraph.NODE_TITLE_COLOR` while a theme is active.
//
// Nothing in ComfyUI draws a node title from it. Titles come from `canvas.node_title_color`,
// which this module sets per node, and setting the global to red changed no title and only
// the execution time badge that comfyui-easy-use draws. That badge fills itself with
// `NODE_DEFAULT_BGCOLOR` and then writes this colour on top, so a palette with light headers
// states a dark title colour and the badge arrives black on black. Where the stated colour
// cannot be read on the node body, the global is pointed at one that can, which is what its
// only reader is actually compositing against.
function badgeInk(palette) {
  const stated = palette?.colors?.litegraph_base?.NODE_TITLE_COLOR;
  const body = window.LiteGraph?.NODE_DEFAULT_BGCOLOR;
  if (!stated || !body) return null;
  return contrastRatio(stated, body) < INK_MIN_RATIO ? contrastOn(body) : stated;
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
function theme({ id, name, dark, format, bg, surface, title, text, subtext, border, accent, neon, widget, link, slots, hues, art, icon, shadow }) {
  const glow = neon || accent;
  const header = title || accent;
  const sockets = slots || (dark ? SLOTS_DARK : SLOTS_LIGHT);
  return {
    id,
    name,
    // Bump this whenever anything below changes. `registerThemes` only replaces a reader's
    // stored copy when the shipped version is higher, so an edit left at the old number
    // reaches new installs only and silently does nothing for everyone who already has it.
    version: 18,
    ...(dark ? {} : { light_theme: true }),
    // Read by Open Manager; ComfyUI's own loader ignores it.
    extras: {
      shape: { radius: 10, titleHeight: 28, slotHeight: 20 },
      links: { mode: "spline", border: false },
      categories: categoryColours(dark, accent, hues),
      glow: { selected: glow, blur: dark ? 16 : 10, replaceShadow: true },
      ...(shadow ? { shadow } : {}),
      ...(art ? { body: { image: texture(art.kind, dark ? "255,255,255" : "20,22,28",
                                         art.alpha ?? (dark ? 0.06 : 0.05)),
                          fit: "tile", opacity: art.opacity ?? 0.9,
                          blend: art.blend || "source-over" } } : {}),
      ...(icon ? { icon } : {}),
    },
    colors: {
      node_slot: sockets,
      litegraph_base: {
        BACKGROUND_IMAGE: background(format, dark),
        CLEAR_BACKGROUND_COLOR: bg,
        NODE_TITLE_COLOR: contrastOn(dark ? header : mix(header, "#ffffff", 0.5)),
        NODE_SELECTED_TITLE_COLOR: dark ? "#ffffff" : "#000000",
        NODE_TEXT_SIZE: 14,
        NODE_TEXT_COLOR: text,
        NODE_SUBTEXT_SIZE: 12,
        NODE_DEFAULT_COLOR: dark ? header : sink(header),
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
const keysSeen = new Map();
const KEYS_CAP = 600;

function categoryKeys(node) {
  const raw = String(node?.constructor?.category ?? node?.category ?? "").trim().toLowerCase();
  const known = keysSeen.get(raw);
  if (known) return known;
  const parts = raw.split("/").filter(Boolean);
  const keys = [];
  if (parts.length) {
    keys.push(parts.join("/"));
    if (parts[0] === "model" && parts.length > 1) keys.push(parts[1]);
    for (let i = parts.length - 1; i > 0; i--) keys.push(parts.slice(0, i).join("/"));
  }
  if (keysSeen.size >= KEYS_CAP) keysSeen.clear();
  keysSeen.set(raw, keys);
  return keys;
}

// The colour a category table gives a node, or undefined.
function categoryColour(categories, node) {
  if (!categories) return undefined;
  for (const key of categoryKeys(node)) {
    const found = categories[key];
    if (typeof found === "string") return found;
    if (found?.gradient) return gradientAnchor(found.gradient);
    if (typeof found?.color === "string") return found.color;
  }
  return undefined;
}

function facetFor(extras, node, name) {
  const rule = extras.nodes?.[node?.type];
  if (rule && typeof rule === "object" && rule[name] !== undefined) return rule[name];
  const categories = extras.categories;
  if (categories) {
    for (const key of categoryKeys(node)) {
      const found = categories[key];
      if (found && typeof found === "object" && found[name] !== undefined) return found[name];
    }
  }
  return extras[name];
}

function categoryGradient(categories, node) {
  if (!categories) return undefined;
  for (const key of categoryKeys(node)) {
    const found = categories[key];
    if (found?.gradient) return found.gradient;
    if (typeof found === "string") return undefined;
  }
  return undefined;
}

//: Link shapes a theme may ask for.
const LINK_MODES = new Set(["straight", "linear", "spline"]);

// The colour the active palette would give a node, for anything outside the canvas that wants
// to speak the same language. The precedence is the draw hook's, so a progress bar and the
// node it is reporting on never disagree: a colour set on the node, then a rule for its
// class, then its category. Empty where the palette has nothing to say, which is the caller's
// cue to fall back rather than to paint something grey.
export function nodeTint(node) {
  if (node?.color) return node.color;
  const extras = activeExtras;
  if (!extras) return "";
  const rule = extras.nodes?.[node?.type];
  if (rule?.gradient) return gradientAnchor(rule.gradient);
  const ruleColor = typeof rule === "string" ? rule : rule?.color;
  return ruleColor || categoryColour(extras.categories, node) || "";
}

const GRADIENT_STOPS = 8;

function sanitiseGradient(raw) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.stops)) return null;
  const stops = [];
  for (const entry of raw.stops.slice(0, GRADIENT_STOPS)) {
    const [at, colour] = Array.isArray(entry) ? entry : [entry?.at, entry?.color];
    const offset = Number(at);
    if (!Number.isFinite(offset) || offset < 0 || offset > 1) continue;
    if (typeof colour !== "string" || !colour.trim()) continue;
    stops.push([offset, colour.trim().slice(0, 60)]);
  }
  if (stops.length < 2) return null;
  stops.sort((a, b) => a[0] - b[0]);
  const angle = Number(raw.angle);
  return { angle: Number.isFinite(angle) ? ((angle % 360) + 360) % 360 : 0, stops };
}

// The stop a title has to stay legible against: the lightest, because white text fails there
// first. A gradient reading as one colour for contrast is the point.
const anchorSeen = new WeakMap();

function gradientAnchor(grade) {
  const known = anchorSeen.get(grade);
  if (known) return known;
  let best = grade.stops[0][1];
  let high = -1;
  for (const [, colour] of grade.stops) {
    const value = luminance(colour);
    if (value > high) { high = value; best = colour; }
  }
  anchorSeen.set(grade, best);
  return best;
}

// A CanvasGradient across a node's title bar, cached per width and spec.
function titleGradient(ctx, node, grade, width, height) {
  const key = `${grade.angle}|${width}|${grade.stops.map((s) => s.join(":")).join(",")}`;
  if (node._omGradientKey === key && node._omGradient) return node._omGradient;
  const radians = (grade.angle * Math.PI) / 180;
  const x = Math.cos(radians) * width / 2;
  const y = Math.sin(radians) * height / 2;
  const midY = -height / 2;
  const made = ctx.createLinearGradient(width / 2 - x, midY - y, width / 2 + x, midY + y);
  for (const [at, colour] of grade.stops) {
    try { made.addColorStop(at, colour); } catch { /* a colour the browser will not take */ }
  }
  node._omGradientKey = key;
  node._omGradient = made;
  return made;
}

function paintGradientTitle(node, grade) {
  return function (ctx, height, size) {
    const lg = window.LiteGraph;
    const shapes = lg?.NodeShape ?? lg ?? {};
    const shape = node.renderingShape ?? node.shape ?? shapes.ROUND_SHAPE;
    const radius = lg?.ROUND_RADIUS ?? 8;
    ctx.fillStyle = titleGradient(ctx, node, grade, size[0], height);
    ctx.beginPath();
    if (shape === shapes.BOX_SHAPE || shape === shapes.BOX) {
      ctx.rect(0, -height, size[0], height);
    } else {
      ctx.roundRect(0, -height, size[0], height,
        node.collapsed ? [radius] : [radius, radius, 0, 0]);
    }
    ctx.fill();
  };
}

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
    // A theme may name a link shape. It is applied to the canvas while that theme is in
    // use and taken back when it is not; the reader's own setting is never written.
    if (LINK_MODES.has(raw.links.mode)) links.mode = raw.links.mode;
    if (typeof raw.links.border === "boolean") links.border = raw.links.border;
    if (Object.keys(links).length) out.links = links;
  }

  if (raw.canvas && typeof raw.canvas === "object") {
    const surface = {};
    if (raw.canvas.tileAlpha === "flat") surface.tileAlpha = "flat";
    const backdrop = themeImage(raw.canvas.image, "canvas");
    if (backdrop) {
      surface.image = backdrop;
      surface.fit = FIT_MODES.has(raw.canvas.fit) ? raw.canvas.fit : "cover";
      const strength = Number(raw.canvas.opacity);
      surface.opacity = Number.isFinite(strength) && strength >= 0 && strength <= 1
        ? strength
        : 1;
      const spot = String(raw.canvas.position || "").trim().toLowerCase();
      if (BACKDROP_SPOTS.has(spot)) surface.position = spot;
    }
    // `false` hides the ruler, an image replaces it, absent leaves the palette's own.
    if (raw.canvas.grid === false) {
      surface.grid = false;
    } else {
      const ruler = themeImage(raw.canvas.grid, "canvas");
      if (ruler) surface.grid = ruler;
    }
    if (Object.keys(surface).length) out.canvas = surface;
  }

  if (raw.categories && typeof raw.categories === "object") {
    const categories = {};
    for (const [name, colour] of Object.entries(raw.categories)) {
      if (typeof colour === "string") categories[name] = colour;
      else if (colour && typeof colour === "object") {
        const kept = {};
        if (typeof colour.color === "string") kept.color = colour.color;
        const grade = sanitiseGradient(colour.gradient);
        if (grade) kept.gradient = grade;
        if (typeof colour.shadow === "string") kept.shadow = colour.shadow.slice(0, 60);
        const ownBody = sanitiseFacet(colour.body, "body");
        if (ownBody) kept.body = ownBody;
        const ownIcon = sanitiseFacet(colour.icon, "icon");
        if (ownIcon) kept.icon = ownIcon;
        if (Object.keys(kept).length) categories[name] = kept;
      }
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
        const grade = sanitiseGradient(rule.gradient);
        if (grade) kept.gradient = grade;
        if (typeof rule.shadow === "string") kept.shadow = rule.shadow.slice(0, 60);
        const ownBody = sanitiseFacet(rule.body, "body");
        if (ownBody) kept.body = ownBody;
        const ownIcon = sanitiseFacet(rule.icon, "icon");
        if (ownIcon) kept.icon = ownIcon;
        if (typeof rule.title === "string") kept.title = rule.title.slice(0, 60);
        if (Object.keys(kept).length) nodes[type] = kept;
      }
    }
    if (Object.keys(nodes).length) out.nodes = nodes;
  }

  if (typeof raw.shadow === "string") out.shadow = raw.shadow.slice(0, 60);

  const body = sanitiseFacet(raw.body, "body");
  if (body && body !== "none") out.body = body;
  const icon = sanitiseFacet(raw.icon, "icon");
  if (icon && icon !== "none") out.icon = icon;


  const solidity = Number(raw.nodeOpacity);
  if (Number.isFinite(solidity) && solidity >= 0 && solidity <= 1) out.nodeOpacity = solidity;

  if (raw.glow && typeof raw.glow === "object" && typeof raw.glow.selected === "string") {
    out.glow = {
      selected: raw.glow.selected.slice(0, 60),
      blur: number(raw.glow.blur, 40) ?? 12,
      replaceShadow: raw.glow.replaceShadow === true,
    };
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

const IMAGE_DATA = /^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$/;
const IMAGE_NAME = /^[A-Za-z0-9._-]+\.(png|jpg|jpeg|webp|gif|svg)$/;
const IMAGE_VIEW = /^\/api\/view\?[A-Za-z0-9._~%&=+-]+$/;
const IMAGE_PACK = /^\/open_manager\/v1\/api\/pack-asset\?[A-Za-z0-9._~%&=+-]+$/;
const IMAGE_PATH = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+){0,5}\.(png|jpg|jpeg|webp|gif|svg)$/i;
const IMAGE_BAD = /["'()\\\s<>]/;
const IMAGE_CAP = { body: 96_000, icon: 24_000, canvas: 96_000 };
const IMAGE_BUDGET = 192_000;
const IMAGE_SOURCES = 8;
const ART_PIXELS = { body: 2048, icon: 2048, canvas: 8192 };
const BLEND_MODES = new Set([
  "source-over", "multiply", "screen", "overlay", "soft-light",
]);
const FIT_MODES = new Set(["tile", "cover"]);
const BACKDROP_SPOTS = new Set([
  "center", "top", "bottom", "left", "right",
  "top left", "top right", "bottom left", "bottom right",
]);

let imageBudget = 0;
let imageCount = 0;

// Sources already accepted this palette, so the cap counts distinct images rather than
// references to them. A theme naming one texture across sixty categories spent sixty of the
// eight it is allowed, and whatever was read last, the graph backdrop included, was refused.
const imageSeen = new Map();

function themeImage(raw, slot) {
  const text = String(raw || "").trim();
  if (!text || IMAGE_BAD.test(text)) return "";
  if (imageSeen.has(text)) return imageSeen.get(text);
  if (imageCount >= IMAGE_SOURCES) return "";
  const accept = (value) => {
    imageSeen.set(text, value);
    return value;
  };
  if (IMAGE_DATA.test(text)) {
    if (text.length > (IMAGE_CAP[slot] || IMAGE_CAP.icon)) return "";
    if (imageBudget + text.length > IMAGE_BUDGET) return "";
    imageBudget += text.length;
    imageCount += 1;
    return accept(text);
  }
  if (IMAGE_VIEW.test(text) || IMAGE_PACK.test(text)) {
    imageCount += 1;
    return accept(text);
  }
  if (text.startsWith("theme:")) {
    const rel = text.slice(6);
    if (!rel || rel.includes("..") || rel.startsWith("/") || !IMAGE_PATH.test(rel)) return "";
    imageCount += 1;
    return accept(`/open_manager/v1/api/theme-asset?path=${encodeURIComponent(rel)}`);
  }
  if (IMAGE_NAME.test(text) && !text.includes("..")) {
    imageCount += 1;
    try {
      return accept(new URL(text, import.meta.url).href);
    } catch {
      return "";
    }
  }
  return "";
}


const artCache = new Map();
const patternCache = new Map();

function artFor(src, slot) {
  let entry = artCache.get(src);
  if (!entry) {
    entry = { image: new Image(), ready: false, failed: false };
    entry.image.onload = () => {
      const limit = ART_PIXELS[slot] || ART_PIXELS.icon;
      if (entry.image.naturalWidth > limit || entry.image.naturalHeight > limit) {
        entry.failed = true;
        console.warn(`[Open Manager] theme image ${src.slice(0, 80)} is `
          + `${entry.image.naturalWidth}x${entry.image.naturalHeight}, over the ${limit}px limit`);
      } else {
        entry.ready = true;
      }
      try { app.canvas?.setDirty(true, false); } catch { /* no canvas yet */ }
      // Vue nodes are not redrawn by the canvas, so they need telling separately: the first
      // paint of a node happens before its icon has decoded and would otherwise show nothing.
      try { scheduleVuePaint(); } catch { /* the Vue path is not in use */ }
    };
    entry.image.onerror = () => {
      entry.failed = true;
      console.warn(`[Open Manager] theme image could not be loaded: ${src.slice(0, 80)}`);
      try { scheduleVuePaint(); } catch { /* the Vue path is not in use */ }
    };
    entry.image.src = src;
    artCache.set(src, entry);
  }
  if (entry.failed || !entry.ready) return null;
  return entry.image;
}

const RASTER_EDGE = 128;

const rasterCache = new Map();

function artRaster(src, image) {
  if (!image) return null;
  const known = rasterCache.get(src);
  if (known !== undefined) return known;
  let made = null;
  const wide = image.naturalWidth || image.width || RASTER_EDGE;
  const tall = image.naturalHeight || image.height || RASTER_EDGE;
  if (wide > 0 && tall > 0) {
    const ratio = RASTER_EDGE / Math.max(wide, tall);
    try {
      const pad = document.createElement("canvas");
      pad.width = Math.max(1, Math.round(wide * ratio));
      pad.height = Math.max(1, Math.round(tall * ratio));
      pad.getContext("2d").drawImage(image, 0, 0, pad.width, pad.height);
      made = pad;
    } catch {
      made = null;
    }
  }
  rasterCache.set(src, made);
  return made;
}

function artPattern(ctx, src, image) {
  let made = patternCache.get(src);
  if (!made) {
    made = ctx.createPattern(image, "repeat");
    if (!made) return null;
    patternCache.set(src, made);
  }
  return made;
}

function forgetArt() {
  artCache.clear();
  patternCache.clear();
  rasterCache.clear();
  imageSeen.clear();
  imageBudget = 0;
  imageCount = 0;
}

function sanitiseFacet(raw, slot) {
  if (raw === "none") return "none";
  if (typeof raw === "string") {
    const src = themeImage(raw, slot);
    return src ? { image: src } : undefined;
  }
  if (!raw || typeof raw !== "object") return undefined;
  const kept = {};
  const src = themeImage(raw.image, slot);
  if (src) kept.image = src;
  if (slot === "icon") {
    const glyph = String(raw.glyph || "").trim();
    if (glyph && [...glyph].length <= 2) kept.glyph = glyph;
    if (typeof raw.color === "string") kept.color = raw.color.slice(0, 60);
    const size = Number(raw.size);
    if (Number.isFinite(size) && size >= 4 && size <= 64) kept.size = size;
    const prefixes = sanitisePrefixes(raw.node_class_prefix);
    if (prefixes) kept.prefixes = prefixes;
  } else {
    if (FIT_MODES.has(raw.fit)) kept.fit = raw.fit;
    const opacity = Number(raw.opacity);
    if (Number.isFinite(opacity) && opacity >= 0 && opacity <= 1) kept.opacity = opacity;
    if (BLEND_MODES.has(raw.blend)) kept.blend = raw.blend;
  }
  return kept.image || kept.glyph ? kept : undefined;
}

// A trailing space in a class prefix carries meaning, so it is kept.
//
// WAS Node Suite names many of its classes with spaces, as in `Image Blank` and `Text String`.
// Trimming turned the prefix `Image ` into `Image`, which then matched 176 registered classes
// instead of 75, putting the pack's icon on core nodes such as `ImageScale` and `ImageInvert`.
// Leading whitespace is still dropped, because no class name begins with one, and a prefix
// that is nothing but whitespace is refused rather than matching everything.
function sanitisePrefixes(raw) {
  const list = Array.isArray(raw) ? raw : [raw];
  const kept = [];
  for (const one of list.slice(0, 8)) {
    if (typeof one !== "string") continue;
    const text = one.replace(/^\s+/, "").slice(0, 60);
    if (text.trim()) kept.push(text.toLowerCase());
  }
  return kept.length ? kept : null;
}

function iconApplies(icon, node) {
  if (!icon.prefixes) return true;
  const type = String(node?.type || "").toLowerCase();
  return icon.prefixes.some((one) => type.startsWith(one));
}

function paintTitleIcon(icon, image) {
  return function (ctx, titleHeight) {
    const size = Math.min(icon.size ?? 10, Math.max(4, titleHeight - 6));
    const cx = titleHeight * 0.5;
    const cy = -titleHeight * 0.5;
    const savedShadow = ctx.shadowColor;
    ctx.shadowColor = "transparent";
    if (image) {
      const iw = image.naturalWidth || image.width || size;
      const ih = image.naturalHeight || image.height || size;
      const ratio = Math.min(size / iw, size / ih) || 1;
      const dw = iw * ratio;
      const dh = ih * ratio;
      ctx.drawImage(image, cx - dw / 2, cy - dh / 2, dw, dh);
    } else {
      ctx.fillStyle = icon.color || this.renderingBoxColor || "#999";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `${size}px PrimeIcons, system-ui, sans-serif`;
      ctx.fillText(icon.glyph, cx, cy);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
    }
    ctx.shadowColor = savedShadow;
  };
}

// The body fill LiteGraph would have drawn, drawn here instead so it can carry alpha.
//
// `node.bgcolor` is set to transparent for the draw, because LiteGraph re-emits whatever
// colour it is given without the alpha channel: an `rgba()` body colour comes out solid. The
// title bar and the widgets are drawn from their own colours and are left alone, so only the
// body goes see-through and the readable parts stay readable.
function paintBodyWash(colour, alpha, next) {
  return function (ctx) {
    if (!this.flags?.collapsed) {
      const size = this.renderingSize || this.size;
      const w = size?.[0] || 0;
      const h = size?.[1] || 0;
      if (w > 0 && h > 0) {
        const radius = window.LiteGraph?.ROUND_RADIUS ?? 8;
        ctx.save();
        ctx.beginPath();
        if (radius > 0 && typeof ctx.roundRect === "function") {
          ctx.roundRect(0, 0, w, h, [0, 0, radius, radius]);
        } else {
          ctx.rect(0, 0, w, h);
        }
        ctx.globalAlpha *= alpha;
        ctx.fillStyle = colour;
        ctx.fill();
        ctx.restore();
      }
    }
    if (next) {
      try { next.call(this, ctx); } catch { /* the painter below this one */ }
    }
  };
}

function bodyColour(node) {
  const lg = window.LiteGraph;
  const stated = node.bgcolor || node.constructor?.bgcolor || lg?.NODE_DEFAULT_BGCOLOR
    || "#171b16";
  return asRendered(stated);
}

function paintNodeBody(spec, image, alpha, inherited) {
  return function (ctx) {
    if (inherited) {
      try { inherited.call(this, ctx); } catch { /* the host's own handler */ }
    }
    if (this.flags?.collapsed) return;
    const size = this.renderingSize;
    const w = size?.[0] || 0;
    const h = size?.[1] || 0;
    if (!(w > 0) || !(h > 0) || alpha <= 0) return;
    const radius = window.LiteGraph?.ROUND_RADIUS ?? 8;
    ctx.save();
    ctx.beginPath();
    if (radius > 0 && typeof ctx.roundRect === "function") {
      ctx.roundRect(0, 0, w, h, [0, 0, radius, radius]);
    } else {
      ctx.rect(0, 0, w, h);
    }
    ctx.clip();
    ctx.globalAlpha *= alpha;
    if (spec.blend) ctx.globalCompositeOperation = spec.blend;
    if (spec.fit === "cover") {
      const ratio = Math.max(w / image.naturalWidth, h / image.naturalHeight);
      const dw = image.naturalWidth * ratio;
      const dh = image.naturalHeight * ratio;
      ctx.drawImage(image, (w - dw) / 2, (h - dh) / 2, dw, dh);
    } else {
      const pattern = artPattern(ctx, spec.image, image);
      if (pattern) {
        ctx.fillStyle = pattern;
        ctx.fillRect(0, 0, w, h);
      }
    }
    ctx.restore();
  };
}

function nodeArea(node) {
  const rect = node.boundingRect;
  if (!rect || rect.length < 4) return null;
  const w = rect[2];
  const h = rect[3];
  if (!(w > 0) || !(h > 0)) return null;
  return { x: rect[0] - node.pos[0], y: rect[1] - node.pos[1], w, h };
}

function silhouette(ctx, area, radius) {
  ctx.beginPath();
  if (radius > 0 && typeof ctx.roundRect === "function") {
    ctx.roundRect(area.x, area.y, area.w, area.h, [radius]);
  } else {
    ctx.rect(area.x, area.y, area.w, area.h);
  }
}

function paintGlow(ctx, node, glow, scale) {
  const area = nodeArea(node);
  if (!area) return;
  const blur = Math.max(1, (glow.blur ?? 12) * scale);
  const pad = blur * 2 + 4;
  const radius = window.LiteGraph?.ROUND_RADIUS ?? 8;
  ctx.save();
  ctx.beginPath();
  ctx.rect(area.x - pad, area.y - pad, area.w + pad * 2, area.h + pad * 2);
  if (radius > 0 && typeof ctx.roundRect === "function") {
    ctx.roundRect(area.x, area.y, area.w, area.h, [radius]);
  } else {
    ctx.rect(area.x, area.y, area.w, area.h);
  }
  ctx.clip("evenodd");
  ctx.shadowColor = glow.selected;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = glow.selected;
  silhouette(ctx, area, radius);
  ctx.fill();
  ctx.restore();
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

    // Vue renders the nodes, so none of the per-node drawing below reaches the screen.
    // Assigning node.color and node.title anyway is not free: both are instrumented, their
    // setters have no equality guard, and each one rebuilds this node's reactive record and
    // invalidates the list feeding every node on screen. That was two invalidations per node
    // per frame buying nothing. The selection glow is the exception: it is drawn on the canvas
    // under the node elements, so it still lands.
    if (window.LiteGraph?.vueNodesMode) {
      const halo = extras.glow;
      if (halo?.selected && node.selected && !this.low_quality && readerGates().glow) {
        paintGlow(ctx, node, halo, this.ds?.scale || 1);
      }
      return original.call(this, node, ctx, ...rest);
    }

    // Precedence: a colour set on the node, then a rule for its class, then the category
    // tint. A rule is a colour, or {color, title} to relabel the class.
    const rule = extras.nodes?.[node.type];
    const ruleColor = typeof rule === "string" ? rule : rule?.color;
    const chosen = node.color ? null : (ruleColor ?? categoryColour(extras.categories, node));
    const grade = node.color ? null : (rule?.gradient ?? categoryGradient(extras.categories, node));
    const tint = grade ? gradientAnchor(grade) : chosen;
    const savedColor = node.color;
    const savedTitle = node.title;
    const savedTitleColor = this.node_title_color;
    const savedPainter = node.onDrawTitleBar;
    if (tint) {
      node.color = tint;
      this.node_title_color = contrastOn(tint);
    } else if (node.color) {
      // A colour the reader set on a node still wins, but the palette's own title colour is
      // stated against the palette's header, not against theirs. Under a light-header theme
      // that is a dark ink, and a node they coloured dark arrived with a title that could not
      // be read. Their colour is untouched; only the ink over it is answered to.
      this.node_title_color = contrastOn(asRendered(node.color));
    }
    if (grade) node.onDrawTitleBar = paintGradientTitle(node, grade);
    if (rule?.title) node.title = rule.title;

    const glow = extras.glow;
    const lit = !!(glow?.selected && node.selected && !this.low_quality && readerGates().glow);
    const scale = this.ds?.scale || 1;
    if (lit) paintGlow(ctx, node, glow, scale);

    const lg = window.LiteGraph;
    const shadow = facetFor(extras, node, "shadow");
    const savedShadow = lg?.DEFAULT_SHADOW_COLOR;
    const savedShadows = this.render_shadows;
    if (lg && typeof shadow === "string") {
      lg.DEFAULT_SHADOW_COLOR = shadow === "none" ? "transparent" : shadow;
    }
    if (lit && glow.replaceShadow) this.render_shadows = false;

    const gates = readerGates();
    const savedIcon = node.onDrawTitleBox;
    let hadIcon = false;
    let paintedIcon = false;
    const iconSpec = gates.titleIcons ? facetFor(extras, node, "icon") : undefined;
    if (iconSpec && iconSpec !== "none" && !this.low_quality && !node.boxcolor
        && !node.isSubgraphNode?.() && iconApplies(iconSpec, node)) {
      const art = iconSpec.image
        ? artRaster(iconSpec.image, artFor(iconSpec.image, "icon"))
        : null;
      if (art || iconSpec.glyph) {
        hadIcon = Object.prototype.hasOwnProperty.call(node, "onDrawTitleBox");
        node.onDrawTitleBox = paintTitleIcon(iconSpec, art);
        paintedIcon = true;
      }
    }

    const savedBody = node.onDrawBackground;
    let painter = savedBody;
    const bodySpec = gates.nodeArt ? facetFor(extras, node, "body") : undefined;
    if (bodySpec && bodySpec !== "none" && !this.low_quality && bodySpec.image) {
      const art = artFor(bodySpec.image, "body");
      if (art) {
        const strength = (bodySpec.opacity ?? 0.5) * gates.artStrength;
        painter = paintNodeBody(bodySpec, art, strength, savedBody);
      }
    }

    // A see-through body is only drawn for nodes ComfyUI draws normally. A muted or bypassed
    // node takes its body colour from LiteGraph rather than from the node, and washing it in
    // the node's own colour would erase the one signal that it is not going to run.
    const solidity = bodySolidity(extras);
    const savedBg = node.bgcolor;
    const hadBg = Object.prototype.hasOwnProperty.call(node, "bgcolor");
    const washed = solidity < 1 && !this.low_quality && !node.flags?.collapsed
      && (node.mode === undefined || node.mode === 0);
    if (washed) {
      painter = paintBodyWash(bodyColour(node), solidity, painter);
      node.bgcolor = "transparent";
    }
    const paintedBody = painter !== savedBody;
    const hadBody = paintedBody
      && Object.prototype.hasOwnProperty.call(node, "onDrawBackground");
    if (paintedBody) node.onDrawBackground = painter;

    try {
      return original.call(this, node, ctx, ...rest);
    } finally {
      this.render_shadows = savedShadows;
      if (lg && typeof shadow === "string") lg.DEFAULT_SHADOW_COLOR = savedShadow;
      if (tint) node.color = savedColor;
      if (rule?.title) node.title = savedTitle;
      this.node_title_color = savedTitleColor;
      if (grade) {
        if (savedPainter) node.onDrawTitleBar = savedPainter;
        else delete node.onDrawTitleBar;
      }
      if (paintedIcon) {
        if (hadIcon) node.onDrawTitleBox = savedIcon;
        else delete node.onDrawTitleBox;
      }
      if (paintedBody) {
        if (hadBody) node.onDrawBackground = savedBody;
        else delete node.onDrawBackground;
      }
      if (washed) {
        if (hadBg) node.bgcolor = savedBg;
        else delete node.bgcolor;
      }
    }
  };
  hookInstalled = true;
}

//: Bumped only if this ever has to run again for a different reason. A reader who has been
//: through it carries this number, so it happens once and not on every load.
const LINK_REPAIR = 1;

//: Where that is recorded. Registered as a hidden setting so it lives with the reader's
//: account rather than in one browser: repairing again in a second browser would overwrite a
//: choice they had already put back.
const LINK_REPAIR_KEY = "openManager.linkModeRepair";

// Put back the link shape an earlier version of this extension took away.
//
// That version assigned `LiteGraph.LINK_RENDER_MODE` on every palette load, including
// ComfyUI's own palettes, and restored it from a snapshot taken when the value was undefined.
// The result was global and persisted: readers who had never chosen linear were left on it,
// on every theme, with ComfyUI's setting reporting linear as though they had asked for it.
// Nothing distinguishes that from a deliberate choice of linear, so this corrects exactly
// that one value, once, and says so rather than doing it quietly.
//
// Returns:
//   `{from, to}` where a setting was corrected, otherwise null.
export async function repairLinkMode() {
  const setting = app.extensionManager?.setting;
  if (!setting) return null;

  let done = 0;
  try { done = Number(setting.get(LINK_REPAIR_KEY)) || 0; } catch { return null; }
  if (done >= LINK_REPAIR) return null;

  let corrected = null;
  try {
    const current = Number(setting.get("Comfy.LinkRenderMode"));
    const fixed = defaultLinkMode();
    if (current === (window.LiteGraph?.LINEAR_LINK ?? 1) && current !== fixed) {
      await setting.set("Comfy.LinkRenderMode", fixed);
      corrected = { from: "linear", to: fixed === 2 ? "spline" : String(fixed) };
    }
    // Recorded either way. A reader who was never affected should not be asked again, and a
    // reader who was must not be corrected a second time after putting it back.
    await setting.set(LINK_REPAIR_KEY, LINK_REPAIR);
  } catch {
    return null;
  }
  return corrected;
}

//: The shapes ComfyUI's own setting offers. A value outside this is not a link mode, and
//: restoring one would leave the canvas drawing nothing recognisable.
const LINK_VALUES = new Set([0, 1, 2, 3]);

// What ComfyUI registered as the default for the link shape, which is spline. Read from the
// setting's own definition rather than assumed, so a future ComfyUI that changes its mind is
// followed rather than contradicted. The constant is the last resort, for a frontend that
// keeps its definitions somewhere this does not know to look.
function defaultLinkMode() {
  try {
    const setting = app.extensionManager?.setting;
    const store = setting?.settingStore || setting;
    for (const key of ["settingsById", "settings", "settingTree"]) {
      const table = store?.[key];
      if (!table) continue;
      const entry = table instanceof Map
        ? table.get("Comfy.LinkRenderMode")
        : table["Comfy.LinkRenderMode"];
      const value = Number(entry?.defaultValue);
      if (LINK_VALUES.has(value)) return value;
    }
  } catch {
    // Falls through to the constant.
  }
  return window.LiteGraph?.SPLINE_LINK ?? 2;
}

// The link shape to go back to when no theme is asking for one.
//
// The reader's setting comes first: it is the record of what they chose, we never write it,
// and reading it live means a change made while a theme was overriding is respected rather
// than undone. Where it holds nothing usable the answer is ComfyUI's own default, because
// that is what the canvas would draw if Open Manager were not installed.
let gateCache = {
  nodeArt: true, artStrength: 1, titleIcons: true, glow: true, backdrop: true, bodyOpacity: 1,
};

function readGate(id, fallback) {
  try {
    const value = app.extensionManager?.setting?.get(id);
    return value === undefined || value === null ? fallback : value;
  } catch {
    return fallback;
  }
}

function refreshGates() {
  gateCache = {
    nodeArt: readGate("openManager.themeNodeArt", true) !== false,
    artStrength: Math.max(0, Math.min(1, Number(readGate("openManager.themeNodeArtOpacity", 1)))),
    titleIcons: readGate("openManager.themeTitleIcons", true) !== false,
    glow: readGate("openManager.themeGlow", true) !== false,
    backdrop: readGate("openManager.themeBackdrop", true) !== false,
    bodyOpacity: Math.max(0, Math.min(1, Number(readGate("openManager.themeNodeOpacity", 1)))),
  };
  if (!Number.isFinite(gateCache.artStrength)) gateCache.artStrength = 1;
  if (!Number.isFinite(gateCache.bodyOpacity)) gateCache.bodyOpacity = 1;
  return gateCache;
}

// How solid a node body is drawn, blending what the theme asks for with how much of that the
// reader wants. One is fully solid, which is what ComfyUI draws on its own.
function bodySolidity(extras) {
  const chosen = readerGates().bodyOpacity;
  if (chosen < 1) return chosen;
  const asked = extras?.nodeOpacity;
  if (!Number.isFinite(asked) || asked >= 1) return 1;
  return Math.max(0, asked);
}

function readerGates() {
  return gateCache;
}

function readerLinkMode() {
  try {
    const chosen = Number(app.extensionManager?.setting?.get("Comfy.LinkRenderMode"));
    if (LINK_VALUES.has(chosen)) return chosen;
  } catch {
    // Falls through to the default.
  }
  return defaultLinkMode();
}

//: What this module has actually changed. Restoring something never changed is how a value
//: the reader chose gets replaced by whatever happened to be set when a theme first loaded.
let changed = {
  shape: false, border: false, linkMode: false, zoomAlpha: false, backdrop: false, grid: false,
};

// Put a theme's backdrop behind the graph.
//
// The image is set on the canvas element rather than drawn into it, so the browser composites
// it and nothing has to be redrawn when the graph is. For it to be visible at all the colour
// LiteGraph clears the canvas to has to go: that fill is opaque and sits over anything behind
// the element. Everything LiteGraph draws, the dot grid included, still lands on top.
// The colour the palette being applied clears its canvas to.
//
// Read from the palette every time rather than snapshotted at the first override. A snapshot
// belongs to whichever theme happened to be on when a backdrop first appeared, so putting it
// back on the way out painted the next theme's canvas in the previous theme's colour: leaving
// WAS Node Suite, whose canvas is #0d0f0d, turned every plain theme black until a second
// switch cleared the flag.
function canvasColour(palette, canvas) {
  const stated = palette?.colors?.litegraph_base?.CLEAR_BACKGROUND_COLOR;
  if (typeof stated === "string" && stated) return stated;
  const live = canvas?.clear_background_color;
  if (typeof live === "string" && live && live !== "transparent") return live;
  return baseShape?.clearColor || "#000000";
}

function applyBackdrop(canvas, surface, palette) {
  const element = canvas?.canvas;
  if (!element) return;
  const base = canvasColour(palette, canvas);
  const wanted = readerGates().backdrop ? surface?.image : "";
  if (wanted) {
    baseShape = { ...(baseShape || {}), clearColor: base };
    changed.backdrop = true;
    const dim = 1 - (surface.opacity ?? 1);
    const tile = surface.fit === "tile";
    const [red, green, blue] = channels(base);
    const wash = `rgba(${red},${green},${blue},${dim})`;
    const scrim = dim > 0 ? `linear-gradient(${wash}, ${wash}), ` : "";
    element.style.backgroundColor = base;
    element.style.backgroundImage = `${scrim}url("${wanted}")`;
    element.style.backgroundRepeat = tile ? "repeat" : "no-repeat";
    element.style.backgroundSize = tile ? "auto" : "cover";
    element.style.backgroundPosition = surface.position || "center";
    canvas.clear_background_color = "transparent";
  } else if (changed.backdrop) {
    for (const property of ["backgroundColor", "backgroundImage", "backgroundRepeat",
      "backgroundSize", "backgroundPosition"]) {
      element.style[property] = "";
    }
    canvas.clear_background_color = base;
    changed.backdrop = false;
  }
}

//: How long to wait after the DOM changes before repainting Vue nodes, so a burst of node
//: mounts costs one pass.
const VUE_SWEEP = 150;

//: Properties ComfyUI fills from the palette for its Vue node components.
const VUE_LIFTED = ["--node-component-header-surface", "--component-node-background"];

let vueObserver = null;
let vueTimer = 0;
let vuePane = null;
let vueModeSeen = null;

function vueNodesOn() {
  try {
    return app.extensionManager?.setting?.get("Comfy.VueNodes.Enabled") === true;
  } catch {
    return false;
  }
}

function cssGradient(grade) {
  const stops = grade.stops.map(([at, colour]) => `${colour} ${Math.round(at * 100)}%`);
  return `linear-gradient(${grade.angle}deg, ${stops.join(", ")})`;
}

// Correct the node colours ComfyUI hands its Vue components.
//
// On the canvas path ComfyUI adds `nodeLightness` to every node colour, so a light palette has
// to state its colours that much darker to arrive at what it wants. The Vue path copies the
// stated colour into a CSS custom property verbatim and never applies the lift, so those sunk
// values arrive raw: a light theme's node bodies came out the near-black they were stated as.
// This puts the lifted value back, which is the colour the palette was written to produce.
function liftVueProperties(palette) {
  const root = document.documentElement;
  const lift = Number(window.LiteGraph?.nodeLightness);
  if (!vueNodesOn() || !Number.isFinite(lift) || lift <= 0) {
    for (const prop of VUE_LIFTED) root.style.removeProperty(prop);
    return;
  }
  const base = palette?.colors?.litegraph_base || {};
  for (const [prop, stated] of [["--node-component-header-surface", base.NODE_DEFAULT_COLOR],
                                ["--component-node-background", base.NODE_DEFAULT_BGCOLOR]]) {
    if (typeof stated === "string" && stated) root.style.setProperty(prop, asRendered(stated));
    else root.style.removeProperty(prop);
  }
}

function vueHeaderOf(root) {
  return root.querySelector(".lg-node-header");
}

function vueBodyOf(root) {
  return root.querySelector("[data-testid^='node-body-']");
}

function stripVueNode(root) {
  root.style.removeProperty("--node-component-header-surface");
  root.style.removeProperty("--component-node-background");
  for (const part of root.querySelectorAll('[class*="footer"]')) {
    part.style.backgroundImage = "";
  }
  const header = vueHeaderOf(root);
  if (header) {
    header.style.removeProperty("--node-component-slot-text");
    header.style.backgroundImage = "";
  }
  root.style.removeProperty("filter");
  root.removeAttribute("data-om-glyph");
  const title = root.querySelector('[data-testid="node-title"]');
  if (title) {
    for (const prop of ["--om-icon", "--om-icon-w", "--om-icon-h", "column-gap"]) {
      title.style.removeProperty(prop);
    }
    title.removeAttribute("data-om-icon");
    title.style.backgroundImage = "";
    title.style.backgroundRepeat = "";
    title.style.backgroundPosition = "";
    title.style.backgroundSize = "";
    title.style.paddingLeft = "";
  }
  const body = vueBodyOf(root);
  if (body) {
    body.style.backgroundImage = "";
    body.style.backgroundRepeat = "";
    body.style.backgroundSize = "";
    body.style.backgroundBlendMode = "";
  }
}

// The same header tint, gradient and body art the canvas hook paints, applied to one Vue node.
//
// The node is found from `data-node-id` on the element, so the precedence is the one the
// canvas path uses: a colour the reader set wins, then a rule for the class, then the category.
function paintVueNode(root, extras) {
  const node = app.graph?.getNodeById?.(Number(root.getAttribute("data-node-id")));
  if (!node) return;
  const rule = extras.nodes?.[node.type];
  const ruleColor = typeof rule === "string" ? rule : rule?.color;
  const chosen = node.color ? null : (ruleColor ?? categoryColour(extras.categories, node));
  const grade = node.color ? null : (rule?.gradient ?? categoryGradient(extras.categories, node));
  // A gradient's stops are stated at the colour they are meant to show, because this module
  // paints them itself and ComfyUI never lifts them. A flat colour goes the other way: it
  // reaches the canvas through `node.color`, so a light palette states it sunk and it has to
  // be lifted here to arrive at the same place. Lifting an anchor taken from the stops instead
  // pushed every light header to white.
  const shown = grade ? gradientAnchor(grade) : (chosen ? asRendered(chosen) : null);
  const header = vueHeaderOf(root);
  if (shown) {
    root.style.setProperty("--node-component-header-surface", shown);
    // Scoped to the header. This token also inks input and output slot labels, widget field
    // labels and the footer tabs, so setting it on the node root gave every label the ink
    // chosen to read against the header, over a body of a different colour entirely.
    if (header) header.style.setProperty("--node-component-slot-text", contrastOn(shown));
  } else {
    root.style.removeProperty("--node-component-header-surface");
    if (header) header.style.removeProperty("--node-component-slot-text");
  }
  if (header) header.style.backgroundImage = grade ? cssGradient(grade) : "";

  // A see-through body, which takes two writes rather than one. The body's own colour is easy,
  // but behind it sits the wrapper painted with the header surface, so an alpha body would
  // reveal the header colour and never the graph. The wrapper goes transparent too and the
  // header band is painted on the header element instead, which is otherwise unpainted. A node
  // the reader gave its own body colour is left alone: the component writes that inline and
  // would shadow this anyway.
  const solidity = bodySolidity(extras);
  const washable = solidity < 1 && !node.flags?.collapsed && !node.bgcolor
    && (node.mode === undefined || node.mode === 0);
  if (washable) {
    const [red, green, blue] = channels(asRendered(bodyColour(node)));
    root.style.setProperty("--component-node-background",
      `rgba(${red},${green},${blue},${solidity})`);
    root.style.setProperty("--node-component-header-surface", "transparent");
    if (header && !header.style.backgroundImage) {
      const flat = shown
        || asRendered(node.color || window.LiteGraph?.NODE_DEFAULT_COLOR || "#333333");
      header.style.backgroundImage = `linear-gradient(${flat}, ${flat})`;
    }
    const band = header ? header.style.backgroundImage : "";
    for (const part of root.querySelectorAll('[class*="footer"]')) {
      part.style.backgroundImage = band;
    }
  } else {
    root.style.removeProperty("--component-node-background");
  }

  // A per-node drop shadow. Inline style beats the element's `drop-shadow-*` utilities, and
  // the component binds no `filter` of its own, so this is not patched away on the next tick.
  const shade = facetFor(extras, node, "shadow");
  if (typeof shade === "string" && shade !== "none") {
    root.style.filter = `drop-shadow(0 2px 3px ${shade})`;
  } else if (shade === "none") {
    root.style.filter = "none";
  } else {
    root.style.removeProperty("filter");
  }

  paintVueIcon(root, extras, node);

  const body = vueBodyOf(root);
  if (!body) return;
  const gates = readerGates();
  const spec = gates.nodeArt ? facetFor(extras, node, "body") : undefined;
  if (spec && spec !== "none" && spec.image) {
    const tile = spec.fit !== "cover";
    const strength = Math.max(0, Math.min(1, (spec.opacity ?? 0.5) * gates.artStrength));
    // Quietened with a scrim in the palette's own body colour rather than by fading the
    // element, which would take the widgets and their text with it.
    const [red, green, blue] = channels(asRendered(bodyColour(node)));
    const wash = `rgba(${red},${green},${blue},${1 - strength})`;
    const scrim = strength < 1 ? `linear-gradient(${wash}, ${wash}), ` : "";
    body.style.backgroundImage = `${scrim}url("${spec.image}")`;
    body.style.backgroundRepeat = tile ? "repeat" : "no-repeat";
    body.style.backgroundSize = tile ? "auto" : "cover";
    body.style.backgroundBlendMode = spec.blend && spec.blend !== "source-over"
      ? spec.blend
      : "";
  } else {
    body.style.backgroundImage = "";
    body.style.backgroundBlendMode = "";
  }
}

//: Glyph rules injected once each, because `content` cannot be set from an inline style.
//: One stylesheet for everything the title pseudo-element needs. The icon rule is static and
//: fed by inline custom properties, so it is written once however many icons a theme carries.
//: Glyphs still need a rule each, because `content` cannot come from a custom property.
const VUE_GLYPH_STYLE = "om-vue-title";
const vueGlyphRules = new Map();

//: The title is a 16px line box. An icon taller than that would grow the header, so this is
//: the ceiling whatever size a theme asks for.
const VUE_TITLE_LINE = 16;

function vueSheet() {
  let sheet = document.getElementById(VUE_GLYPH_STYLE);
  if (sheet) return sheet;
  sheet = document.createElement("style");
  sheet.id = VUE_GLYPH_STYLE;
  // A real flex item in the title row, rather than a background painted behind the text.
  // The title is `flex min-w-0 flex-1 items-center gap-2` holding one truncating child, so a
  // pseudo-element reserves its own width by layout, is centred by `items-center`, and the
  // text shrinks around it. Overlap stops being two numbers that have to agree. `flex:0 0 auto`
  // matters because the whole chain is `min-w-0` and a narrow node would otherwise squash it.
  // The attribute gate matters because an empty `content` is still a flex item, and the row's
  // gap would indent every title in the graph.
  sheet.textContent = '.lg-node [data-testid="node-title"][data-om-icon]::before{'
    + 'content:"";flex:0 0 auto;width:var(--om-icon-w);height:var(--om-icon-h);'
    + 'background-image:var(--om-icon);background-repeat:no-repeat;'
    + 'background-position:center;background-size:contain;}';
  document.head.appendChild(sheet);
  return sheet;
}

function vueGlyphKey(glyph) {
  let key = vueGlyphRules.get(glyph);
  if (key) return key;
  key = `g${vueGlyphRules.size + 1}`;
  vueGlyphRules.set(glyph, key);
  vueSheet().textContent += `.lg-node[data-om-glyph="${key}"] [data-testid="node-title"]`
    + `::before{content:"${glyph}";flex:0 0 auto;}`;
  return key;
}

function artPending(src) {
  const entry = artCache.get(src);
  return !!entry && !entry.ready && !entry.failed;
}

// A theme's title icon, beside the title rather than in place of the round box.
//
// There is no round box in a Vue node: that position is the collapse button, and the header
// component offers no slot to sit in. So the icon becomes a pseudo-element at the head of the
// title row, which is the closest honest equivalent.
function paintVueIcon(root, extras, node) {
  const title = root.querySelector('[data-testid="node-title"]');
  if (!title) return;
  const clear = () => {
    for (const prop of ["--om-icon", "--om-icon-w", "--om-icon-h", "column-gap"]) {
      title.style.removeProperty(prop);
    }
    title.removeAttribute("data-om-icon");
    root.removeAttribute("data-om-glyph");
  };
  const spec = readerGates().titleIcons ? facetFor(extras, node, "icon") : undefined;
  if (!spec || spec === "none" || !iconApplies(spec, node) || node.boxcolor) {
    clear();
    return;
  }
  const size = Math.max(8, Math.min(32, spec.size ?? 13));
  if (spec.image) {
    // The box is reserved before the image has decoded, and at the same width it will end up
    // with: fitting inside a square leaves a wide or square icon exactly `cap` across, so only
    // its height changes when the real proportions arrive and the title text never moves.
    // Leaving the image unset for that one pass also means an icon this later refuses for
    // being too large never appears at all.
    const cap = Math.min(size, VUE_TITLE_LINE);
    const art = artFor(spec.image, "icon");
    let boxWide = cap;
    let boxTall = cap;
    if (art) {
      const wide = art.naturalWidth || cap;
      const tall = art.naturalHeight || cap;
      const ratio = Math.min(cap / wide, cap / tall) || 1;
      boxWide = Math.round(wide * ratio);
      boxTall = Math.round(tall * ratio);
    } else if (!artPending(spec.image)) {
      clear();
      return;
    }
    vueSheet();
    root.removeAttribute("data-om-glyph");
    // Unset while decoding. An invalid `var()` leaves background-image at none, which is what
    // makes the reservation show as empty space rather than a broken image.
    if (art) title.style.setProperty("--om-icon", `url("${spec.image}")`);
    else title.style.removeProperty("--om-icon");
    title.style.setProperty("--om-icon-w", `${boxWide}px`);
    title.style.setProperty("--om-icon-h", `${boxTall}px`);
    // The row's own gap is 8px, which is too wide beside a mark this small. The title holds
    // one other child, so narrowing it affects nothing else.
    title.style.setProperty("column-gap", "4px");
    title.setAttribute("data-om-icon", "");
    return;
  }
  if (spec.glyph) {
    for (const prop of ["--om-icon", "--om-icon-w", "--om-icon-h"]) {
      title.style.removeProperty(prop);
    }
    title.removeAttribute("data-om-icon");
    title.style.setProperty("column-gap", "4px");
    root.setAttribute("data-om-glyph", vueGlyphKey(spec.glyph));
    return;
  }
  clear();
}

function paintVueNodes() {
  if (!vueNodesOn()) return;
  let roots = [];
  try { roots = document.querySelectorAll(".lg-node[data-node-id]"); } catch { return; }
  for (const root of roots) {
    try {
      if (activeExtras) paintVueNode(root, activeExtras);
      else stripVueNode(root);
    } catch { /* one node that would not take a colour */ }
  }
}

function scheduleVuePaint() {
  if (vueTimer) return;
  vueTimer = setTimeout(() => {
    vueTimer = 0;
    try { paintVueNodes(); } catch { /* the DOM moved under us */ }
  }, VUE_SWEEP);
}

// Watch for Vue nodes mounting, so a node dragged in is themed like the rest.
function dropVueObserver() {
  if (vueObserver) vueObserver.disconnect();
  vueObserver = null;
  vuePane = null;
}

// Watch the pane the node elements live in, so a menu or a toast opening does not schedule a
// sweep of every node.
//
// The pane is destroyed and rebuilt when the renderer is switched, so an observer held from a
// previous switch is watching an element no longer in the document and will never fire again.
// Switching Nodes 2.0 off and back on left exactly that: new nodes, a dead observer, and no
// theme on any of them until something else happened to reload the palette.
export function watchVueNodes() {
  if (typeof MutationObserver !== "function") return;
  if (!vueNodesOn()) {
    dropVueObserver();
    return;
  }
  if (vueObserver && vuePane && vuePane.isConnected) return;
  dropVueObserver();
  const pane = document.querySelector(".lg-node[data-node-id]")?.parentElement;
  if (!pane) {
    scheduleVuePaint();
    return;
  }
  vuePane = pane;
  vueObserver = new MutationObserver(scheduleVuePaint);
  vueObserver.observe(pane, { childList: true, subtree: true });
  scheduleVuePaint();
}

// Notice the renderer being switched, and re-apply everything when it is.
//
// A repaint of the node elements is not enough on its own: the document level colour
// corrections, the geometry globals and the per-node styles each belong to one renderer or the
// other, and none of them are revisited by a palette that has not changed.
function watchVueMode() {
  const on = vueNodesOn();
  if (vueModeSeen === null) {
    vueModeSeen = on;
    return;
  }
  if (on === vueModeSeen) return;
  vueModeSeen = on;
  dropVueObserver();
  try { refreshExtras(); } catch { /* no palette to read yet */ }
}

// Apply a palette's extras: geometry, link border, link shape, and the data the draw hook reads.
//
// Everything here is undone when a palette without extras is loaded, so a theme's choices last
// exactly as long as the theme does. Nothing is written to `Comfy.LinkRenderMode`: that setting
// is the reader's, and a theme writing over it leaves the settings panel showing one thing and
// the canvas drawing another, with no hint as to why.
export function applyExtras(palette) {
  const lg = window.LiteGraph;
  if (!lg) return;
  forgetArt();
  const extras = extrasFor(palette);
  refreshGates();
  activeExtras = extras;

  if (extras) {
    const ink = badgeInk(palette);
    if (ink) lg.NODE_TITLE_COLOR = ink;
  }

  const shape = extras?.shape;
  if (shape) {
    // Captured as it is now, at the moment of the first override, so what goes back is what
    // was actually displaced.
    if (!changed.shape) {
      baseShape = {
        radius: lg.ROUND_RADIUS,
        titleHeight: lg.NODE_TITLE_HEIGHT,
        slotHeight: lg.NODE_SLOT_HEIGHT,
      };
      changed.shape = true;
    }
    // Vue nodes round their corners in CSS and size their header from padding, so neither of
    // the first two is read. NODE_TITLE_HEIGHT is worse than ignored there: it still offsets
    // the node transform and --node-height, so a theme asking for a shorter header mis-sized
    // every node without shortening anything.
    if (!window.LiteGraph?.vueNodesMode) {
      lg.ROUND_RADIUS = shape.radius ?? baseShape.radius;
      lg.NODE_TITLE_HEIGHT = shape.titleHeight ?? baseShape.titleHeight;
    }
    lg.NODE_SLOT_HEIGHT = shape.slotHeight ?? baseShape.slotHeight;
  } else if (changed.shape) {
    lg.ROUND_RADIUS = baseShape.radius;
    lg.NODE_TITLE_HEIGHT = baseShape.titleHeight;
    lg.NODE_SLOT_HEIGHT = baseShape.slotHeight;
    changed.shape = false;
  }

  const canvas = app.canvas;
  const border = extras?.links?.border;
  if (canvas) {
    if (typeof border === "boolean") {
      if (!changed.border) {
        baseShape = { ...(baseShape || {}), linkBorder: canvas.render_connections_border };
        changed.border = true;
      }
      canvas.render_connections_border = border;
    } else if (changed.border) {
      canvas.render_connections_border = baseShape.linkBorder;
      changed.border = false;
    }

    // A theme may choose how links are drawn while it is the theme in use. Two things are
    // never touched: `Comfy.LinkRenderMode`, which is the reader's own stored preference, and
    // `LiteGraph.LINK_RENDER_MODE`, which is global. Issue #21 was the global one being
    // written, so a shape one theme asked for became every theme's shape and outlived the
    // session. The canvas property is per-canvas and unpersisted, so the choice lasts exactly
    // as long as the theme does.
    const flat = extras?.canvas?.tileAlpha === "flat";
    if (flat) {
      if (!changed.zoomAlpha) {
        baseShape = { ...(baseShape || {}), zoomAlpha: canvas.zoom_modify_alpha };
        changed.zoomAlpha = true;
      }
      canvas.zoom_modify_alpha = false;
    } else if (changed.zoomAlpha) {
      canvas.zoom_modify_alpha = baseShape.zoomAlpha;
      changed.zoomAlpha = false;
    }

    applyBackdrop(canvas, extras?.canvas, palette);

    // The dot grid is LiteGraph's own tiled background image. A theme supplying a backdrop may
    // ask for it to be left off, which is the one case where hiding it is what was intended.
    // The ruler is LiteGraph's own tiled background image. A theme may hide it, or replace it
    // with a file of its own, which the palette's BACKGROUND_IMAGE cannot do because that key
    // only ever holds an inline data URI. LiteGraph caches the decoded image and its pattern
    // against the previous value, so both have to be dropped or the old ruler keeps drawing.
    const statedGrid = palette?.colors?.litegraph_base?.BACKGROUND_IMAGE;
    const asked = readerGates().backdrop ? extras?.canvas?.grid : undefined;
    const ownRuler = typeof asked === "string" ? asked : null;
    if (asked === false || ownRuler) {
      if (!changed.grid) {
        baseShape = { ...(baseShape || {}), grid: statedGrid ?? canvas.background_image };
      }
      changed.grid = true;
      canvas.background_image = ownRuler || "";
      canvas._pattern = null;
    } else if (changed.grid) {
      canvas.background_image = statedGrid ?? baseShape.grid;
      canvas._pattern = null;
      changed.grid = false;
    }

    const modes = { straight: lg.STRAIGHT_LINK, linear: lg.LINEAR_LINK, spline: lg.SPLINE_LINK };
    const mode = modes[extras?.links?.mode];
    if (mode !== undefined) {
      changed.linkMode = true;
      canvas.links_render_mode = mode;
    } else if (changed.linkMode) {
      // Back to what ComfyUI would draw on its own: the reader's setting, or its registered
      // default where that says nothing usable. Deliberately not the snapshot taken at first
      // override, which goes stale the moment they change the setting while a theme is on.
      canvas.links_render_mode = readerLinkMode();
      changed.linkMode = false;
    }
  }

  // The hook goes in only for a theme declaring extras. Every other palette is drawn by
  // ComfyUI untouched.
  if (extras) installDrawHook();
  liftVueProperties(palette);
  watchVueNodes();
  scheduleVuePaint();
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
  // The palette asked for, not the one the service reports. `getActiveColorPalette` still
  // answers with the previous palette when the load resolves, so reading it here applied the
  // extras of whatever was on screen a moment ago and every switch lagged by one.
  const asked = (args) => {
    const first = args[0];
    const id = typeof first === "string" ? first : first?.id;
    if (!id) return null;
    if (first && typeof first === "object" && first.extras) return first;
    try {
      const store = app.extensionManager?.setting?.get("Comfy.CustomColorPalettes") || {};
      return store[id] || null;
    } catch {
      return null;
    }
  };
  service.loadColorPalette = async (...args) => {
    const result = await original(...args);
    try { applyExtras(asked(args) ?? service.getActiveColorPalette?.()); } catch {}
    return result;
  };
  service.__omExtrasHook = true;

  // The palette is not ready the moment this runs, and a fixed delay meant every node was
  // drawn in the default header colour until it expired: a second of the brand yellow on
  // everything, then the category colours arriving all at once. Poll briefly instead and
  // apply the moment there is something to apply, then redraw so the canvas is not left
  // showing what it painted before.
  // Wrapping `loadColorPalette` is not enough. Settings switches the theme by writing
  // `Comfy.ColorPalette`, and the palette is loaded internally without that method being
  // called, so a theme picked in the UI left the previous theme's categories on the canvas.
  // Watching which palette is active catches every route into a change, including startup.
  let waited = 0;
  let applied = null;
  const settle = () => {
    let palette = null;
    try { palette = service.getActiveColorPalette?.(); } catch { palette = null; }
    if (palette && palette.id !== applied) {
      applied = palette.id;
      try { applyExtras(palette); } catch {}
      try { app.canvas?.setDirty(true, true); } catch {}
    }
    watchVueMode();
    watchVueNodes();
    waited += waited < EXTRAS_WAIT ? EXTRAS_POLL : EXTRAS_IDLE;
    setTimeout(settle, waited < EXTRAS_WAIT ? EXTRAS_POLL : EXTRAS_IDLE);
  };
  settle();
}

//: How often to look for the active palette while the page is starting, how long that close
//: watch lasts, and the slower interval kept up afterwards for a theme picked in Settings.
const EXTRAS_POLL = 60;
const EXTRAS_WAIT = 8000;
const EXTRAS_IDLE = 400;

// Ids replaced by the themes below, dropped from the palette store on load.
const RETIRED = ["om_tokyo_night", "om_catppuccin_mocha", "om_catppuccin_latte", "om_rose_pine_dawn"];

// Two dark, two light; warm and vibrant, one background format each.
export const THEMES = [
  theme({
    id: "om_ember", name: "Ember", dark: true, format: "dots",
    art: { kind: "weave", alpha: 0.07 }, shadow: "#2a0f00", icon: { glyph: "◆", size: 11 },
    bg: "#150e0a", surface: "#241710", text: "#f5e2cf", subtext: "#ad917a",
    border: "#422b1d", accent: "#e2762f", neon: "#ff9b45", widget: "#1d130d", link: "#e0a15e",
  }),
  theme({
    id: "om_verdant", name: "Verdant", dark: true, format: "graph",
    art: { kind: "grain", alpha: 0.10 }, shadow: "#001b10", icon: { glyph: "▲", size: 10 },
    bg: "#06120d", surface: "#0e2018", text: "#d6f2e0", subtext: "#7ba894",
    border: "#1c3a2b", accent: "#24b981", neon: "#5ff2ad", widget: "#0a1a12", link: "#6fd9bd",
  }),
  theme({
    id: "om_sandstone", name: "Sandstone", dark: false, format: "crosshair",
    art: { kind: "rings", alpha: 0.05 }, shadow: "#b8a68e", icon: { glyph: "■", size: 9 },
    bg: "#e7dac3", surface: "#f2e9d8", text: "#46372a", subtext: "#7d6a55",
    border: "#cbb695", accent: "#b3622a", widget: "#ddcdb2", link: "#4f7a63",
  }),
  theme({
    id: "om_coral", name: "Coral", dark: false, format: "blueprint",
    art: { kind: "lines", alpha: 0.05 }, shadow: "#c99184", icon: { glyph: "●", size: 9 },
    bg: "#f4e2da", surface: "#fceee8", text: "#57332c", subtext: "#8e685e",
    border: "#e0bfb2", accent: "#e0553f", widget: "#eddad1", link: "#2f7f7a",
  }),
  // ComfyUI brand colours: Ink, Plum, Yellow, Canvas, Warm White, Warm Gray.
  theme({
    id: "om_comfy_dark", name: "Comfy Dark", dark: true, format: "graph", slots: SLOTS_BRAND, hues: BRAND_HUES,
    art: { kind: "weave", alpha: 0.05 }, icon: { image: "comfy-logomark-yellow.svg", size: 13 },
    title: "#f2ff59", bg: "#211927", surface: "#2e2438", text: "#f0efed", subtext: "#918c99",
    border: "#3f3350", accent: "#49378b", neon: "#f2ff59", widget: "#1a1420", link: "#a08fd4",
  }),
  theme({
    id: "om_comfy_light", name: "Comfy Light", dark: false, format: "crosshair", slots: SLOTS_BRAND_LIGHT, hues: BRAND_HUES,
    art: { kind: "rings", alpha: 0.04 }, icon: { image: "comfy-logomark-yellow.svg", size: 13 },
    title: "#f2ff59", bg: "#c2bfb9", surface: "#f0efed", text: "#211927", subtext: "#7e7c78",
    border: "#a8a49c", accent: "#49378b", widget: "#d9d6d0", link: "#4d3762",
  }),
];

// Merge the themes into the palette store. Only palettes named here are written; a changed
// definition takes effect on the next load.
const USER_THEME_API = "/open_manager/v1/api/user-themes";

// The reader's own themes, from `user/open_manager/themes/*.json`.
//
// The file wins over the stored copy every time, because the file is what the reader edits.
// A palette tweaked in ComfyUI's own editor and also present as a file is therefore replaced
// on the next load, which is the behaviour a file-backed theme has to have.
async function userThemes() {
  try {
    const answer = await api.fetchApi(USER_THEME_API);
    if (!answer.ok) return { themes: [], problems: [] };
    const data = await answer.json();
    return { themes: data?.themes || [], problems: data?.problems || [] };
  } catch {
    return { themes: [], problems: [] };
  }
}

export async function registerThemes() {
  const setting = app.extensionManager?.setting;
  const service = app.extensionManager?.colorPalette;
  if (!setting) return;

  // Read before written, because writing a store that could not be read would replace
  // whatever palettes the reader has with only ours. An empty store is not that case: it is
  // what a fresh ComfyUI holds, and bailing on it meant a new install never received a single
  // bundled theme. Only a read that actually failed stops this.
  let store = {};
  let readable = false;
  try {
    store = setting.get("Comfy.CustomColorPalettes") || {};
    readable = true;
  } catch {
    readable = false;
  }
  if (!readable || typeof store !== "object") return;

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
  const own = await userThemes();
  for (const palette of own.themes) {
    if (!palette?.id?.startsWith("user_")) continue;
    const before = merged[palette.id];
    if (JSON.stringify(before) !== JSON.stringify(palette)) {
      merged[palette.id] = palette;
      changed = true;
    }
  }
  for (const problem of own.problems) {
    console.warn(`[Open Manager] theme ${problem.file || "directory"} ${problem.reason}`);
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
