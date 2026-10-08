import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const SLOTS_DARK = {
  CLIP: "#ffd500", CLIP_VISION: "#a8dadc", CLIP_VISION_OUTPUT: "#ad7452",
  CONDITIONING: "#ffa931", CONTROL_NET: "#6ee7b7", IMAGE: "#64b5f6", LATENT: "#ff9cf9",
  MASK: "#81c784", MODEL: "#b39ddb", STYLE_MODEL: "#c2ffae", VAE: "#ff6e6e", TAESD: "#dcc274",
  PIPE_LINE: "#7737aa", INT: "#29699c", XYPLOT: "#74da5d", SAMPLING: "#60a5fa",
};

const SLOTS_LIGHT = {
  CLIP: "#a8780a", CLIP_VISION: "#2f7d8c", CLIP_VISION_OUTPUT: "#7a4a34",
  CONDITIONING: "#c2620a", CONTROL_NET: "#12805a", IMAGE: "#1565c0", LATENT: "#a3229c",
  MASK: "#37762c", MODEL: "#5a34a8", STYLE_MODEL: "#5f8a1f", VAE: "#c02b2b", TAESD: "#96701a",
  PIPE_LINE: "#5a2a80", INT: "#1b4f72", XYPLOT: "#3a8a2a", SAMPLING: "#1565c0",
};

const SLOTS_BRAND = {
  CLIP: "#f2ff59", CLIP_VISION: "#9d8ad6", CLIP_VISION_OUTPUT: "#b08a6a",
  CONDITIONING: "#e0b83a", CONTROL_NET: "#6fc9a8", IMAGE: "#7aa2f7", LATENT: "#c79be8",
  MASK: "#8fd18a", MODEL: "#a08fd4", STYLE_MODEL: "#cfe07a", VAE: "#e0736f", TAESD: "#c9a24a",
  PIPE_LINE: "#4d3762", INT: "#49378b", XYPLOT: "#8fd18a", SAMPLING: "#a08fd4",
};

const SLOTS_BRAND_LIGHT = {
  CLIP: "#8a7a12", CLIP_VISION: "#5a4a9e", CLIP_VISION_OUTPUT: "#7a5a3a",
  CONDITIONING: "#a8770f", CONTROL_NET: "#1f7d63", IMAGE: "#3355b5", LATENT: "#7a3f9e",
  MASK: "#3f7d3a", MODEL: "#49378b", STYLE_MODEL: "#6a7f2a", VAE: "#b03a36", TAESD: "#8a6a1f",
  PIPE_LINE: "#4d3762", INT: "#3a2f6a", XYPLOT: "#3f7d3a", SAMPLING: "#49378b",
};

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

const BRAND_HUES = {
  loaders: "#49378b", conditioning: "#f2ff59", sampling: "#6b4fa8", latent: "#9d8ad6",
  image: "#c2bfb9", mask: "#7e7c78", audio: "#d4c85a", video: "#8f6fb5",
  utils: "#5a5760", advanced: "#4d3762", model: "#3a2b6d", api: "#b09ae0",
};

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

const CATEGORY_SPREAD = {
  loaders: -55, conditioning: 35, sampling: 0, latent: 70, image: -25, mask: 110,
  audio: 55, video: 90, utils: 0, advanced: -80, model: -55, api: 70,
};

const LIGHT_LIFT = 50;

const SINK_FLOOR = 4;

function sink(hex) {
  try {
    const { h, s, l } = hexToHsl(hex);
    return hslToHex(h, s, Math.max(SINK_FLOOR, Math.min(100, l) - LIGHT_LIFT));
  } catch {
    return hex;
  }
}

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

function contrastOn(color) {
  return luminance(color) > 0.55 ? "#141418" : "#ffffff";
}

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

const INK_MIN_RATIO = 2.5;

function contrastRatio(ink, surface) {
  const one = luminance(ink) + 0.05;
  const two = luminance(surface) + 0.05;
  return one > two ? one / two : two / one;
}

function badgeInk(palette) {
  const stated = palette?.colors?.litegraph_base?.NODE_TITLE_COLOR;
  const body = window.LiteGraph?.NODE_DEFAULT_BGCOLOR;
  if (!stated || !body) return null;
  return contrastRatio(stated, body) < INK_MIN_RATIO ? contrastOn(body) : stated;
}

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

function theme({ id, name, dark, format, bg, surface, title, text, subtext, border, accent, neon, widget, link, slots, hues, art, icon, shadow }) {
  const glow = neon || accent;
  const header = title || accent;
  const sockets = slots || (dark ? SLOTS_DARK : SLOTS_LIGHT);
  return {
    id,
    name,
    version: 18,
    ...(dark ? {} : { light_theme: true }),
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

let baseShape = null;
let activeExtras = null;
let hookInstalled = false;

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

const LINK_MODES = new Set(["straight", "linear", "spline"]);

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

function titleGradient(ctx, node, grade, width, height) {
  const key = `${grade.angle}|${width}|${grade.stops.map((s) => s.join(":")).join(",")}`;
  if (node._omGradientKey === key && node._omGradient) return node._omGradient;
  const radians = (grade.angle * Math.PI) / 180;
  const x = Math.cos(radians) * width / 2;
  const y = Math.sin(radians) * height / 2;
  const midY = -height / 2;
  const made = ctx.createLinearGradient(width / 2 - x, midY - y, width / 2 + x, midY + y);
  for (const [at, colour] of grade.stops) {
    try { made.addColorStop(at, colour); } catch {}
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
      try { app.canvas?.setDirty(true, false); } catch {}
      try { scheduleVuePaint(); } catch {}
    };
    entry.image.onerror = () => {
      entry.failed = true;
      console.warn(`[Open Manager] theme image could not be loaded: ${src.slice(0, 80)}`);
      try { scheduleVuePaint(); } catch {}
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
      try { next.call(this, ctx); } catch {}
    }
  };
}

function bodyColour(node) {
  const lg = window.LiteGraph;
  const own = node.bgcolor && node.bgcolor !== "transparent" ? node.bgcolor : "";
  const stated = own || lg?.NODE_DEFAULT_BGCOLOR || node.constructor?.bgcolor || "#171b16";
  return asRendered(stated);
}

export function mendNodeBodies(graph) {
  const pairs = new Map(Object.values(window.LGraphCanvas?.node_colors || {})
    .map((option) => [option?.color, option?.bgcolor]));
  const groups = [graph?.nodes, ...(graph?.definitions?.subgraphs || []).map((sub) => sub?.nodes)];
  for (const nodes of groups) {
    if (!Array.isArray(nodes)) continue;
    for (const node of nodes) {
      if (node?.bgcolor !== "transparent") continue;
      const paired = pairs.get(node.color);
      if (paired) node.bgcolor = paired;
      else delete node.bgcolor;
    }
  }
}

function paintNodeBody(spec, image, alpha, inherited) {
  return function (ctx) {
    if (inherited) {
      try { inherited.call(this, ctx); } catch {}
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

function installDrawHook() {
  const proto = window.LGraphCanvas?.prototype;
  if (!proto || hookInstalled || typeof proto.drawNode !== "function") return;
  const original = proto.drawNode;
  proto.drawNode = function (node, ctx, ...rest) {
    const extras = activeExtras;
    if (!extras) return original.call(this, node, ctx, ...rest);

    if (window.LiteGraph?.vueNodesMode) {
      const halo = extras.glow;
      if (halo?.selected && node.selected && !this.low_quality && readerGates().glow) {
        paintGlow(ctx, node, halo, this.ds?.scale || 1);
      }
      return original.call(this, node, ctx, ...rest);
    }

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

    const solidity = bodySolidity(extras);
    const ownFill = Object.getOwnPropertyDescriptor(node, "renderingBgColor");
    const washed = solidity < 1 && !this.low_quality && !node.flags?.collapsed
      && (node.mode === undefined || node.mode === 0) && ownFill?.configurable !== false;
    if (washed) {
      painter = paintBodyWash(bodyColour(node), solidity, painter);
      Object.defineProperty(node, "renderingBgColor", { value: "transparent", configurable: true });
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
        if (ownFill) Object.defineProperty(node, "renderingBgColor", ownFill);
        else delete node.renderingBgColor;
      }
    }
  };
  hookInstalled = true;
}

const LINK_REPAIR = 1;

const LINK_REPAIR_KEY = "openManager.linkModeRepair";

export async function repairLinkMode() {
  const setting = app.extensionManager?.setting;
  if (!setting) return null;

  if (!await settingsReady()) return null;

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
    await setting.set(LINK_REPAIR_KEY, LINK_REPAIR);
  } catch {
    return null;
  }
  return corrected;
}

const LINK_VALUES = new Set([0, 1, 2, 3]);

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
  }
  return window.LiteGraph?.SPLINE_LINK ?? 2;
}

let gateCache = {
  nodeArt: true, artStrength: 1, titleIcons: true, glow: true, backdrop: true, bodyOpacity: 1,
  themeOpacity: false,
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
    themeOpacity: readGate("openManager.themeNodeOpacityFromTheme", false) === true,
  };
  if (!Number.isFinite(gateCache.artStrength)) gateCache.artStrength = 1;
  if (!Number.isFinite(gateCache.bodyOpacity)) gateCache.bodyOpacity = 1;
  return gateCache;
}

function bodySolidity(extras) {
  const chosen = readerGates().bodyOpacity;
  if (chosen < 1) return chosen;
  if (!readerGates().themeOpacity) return 1;
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
  }
  return defaultLinkMode();
}

let changed = {
  shape: false, border: false, linkMode: false, zoomAlpha: false, backdrop: false, grid: false,
};

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

const VUE_SWEEP = 150;

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

function vueInnerOf(root) {
  return root.querySelector("[data-testid='node-inner-wrapper']");
}

function stripVueNode(root) {
  root.style.removeProperty("--node-component-header-surface");
  root.style.removeProperty("--component-node-background");
  const inner = vueInnerOf(root);
  if (inner) {
    inner.style.removeProperty("--component-node-background");
    inner.style.removeProperty("background-color");
  }
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
    body.style.removeProperty("background-color");
  }
}

function paintVueNode(root, extras) {
  const node = app.graph?.getNodeById?.(Number(root.getAttribute("data-node-id")));
  if (!node) return;
  const rule = extras.nodes?.[node.type];
  const ruleColor = typeof rule === "string" ? rule : rule?.color;
  const chosen = node.color ? null : (ruleColor ?? categoryColour(extras.categories, node));
  const grade = node.color ? null : (rule?.gradient ?? categoryGradient(extras.categories, node));
  const shown = grade ? gradientAnchor(grade) : (chosen ? asRendered(chosen) : null);
  const header = vueHeaderOf(root);
  if (shown) {
    root.style.setProperty("--node-component-header-surface", shown);
    if (header) header.style.setProperty("--node-component-slot-text", contrastOn(shown));
  } else {
    root.style.removeProperty("--node-component-header-surface");
    if (header) header.style.removeProperty("--node-component-slot-text");
  }
  if (header) header.style.backgroundImage = grade ? cssGradient(grade) : "";

  const gates = readerGates();
  const artSpec = gates.nodeArt ? facetFor(extras, node, "body") : undefined;
  const arted = !!(artSpec && artSpec !== "none" && artSpec.image);
  const solidity = bodySolidity(extras);
  const washable = (solidity < 1 || arted) && !node.flags?.collapsed
    && (node.mode === undefined || node.mode === 0);
  if (washable) {
    const [red, green, blue] = channels(asRendered(bodyColour(node)));
    const wash = `rgba(${red},${green},${blue},${solidity})`;
    root.style.setProperty("--component-node-background", wash);
    root.style.setProperty("--node-component-header-surface", "transparent");
    const inner = vueInnerOf(root);
    if (inner) {
      inner.style.setProperty("--component-node-background", wash);
      inner.style.setProperty("background-color", "transparent", "important");
    }
    const painted = vueBodyOf(root);
    if (painted) painted.style.setProperty("background-color", wash, "important");
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
    const inner = vueInnerOf(root);
    if (inner) {
      inner.style.removeProperty("--component-node-background");
      inner.style.removeProperty("background-color");
    }
    const painted = vueBodyOf(root);
    if (painted) painted.style.removeProperty("background-color");
  }

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
  const spec = artSpec;
  if (arted) {
    const tile = spec.fit !== "cover";
    const strength = Math.max(0, Math.min(1, (spec.opacity ?? 0.5) * gates.artStrength));
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

const VUE_GLYPH_STYLE = "om-vue-title";
const vueGlyphRules = new Map();

const VUE_TITLE_LINE = 16;

function vueSheet() {
  let sheet = document.getElementById(VUE_GLYPH_STYLE);
  if (sheet) return sheet;
  sheet = document.createElement("style");
  sheet.id = VUE_GLYPH_STYLE;
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
    if (art) title.style.setProperty("--om-icon", `url("${spec.image}")`);
    else title.style.removeProperty("--om-icon");
    title.style.setProperty("--om-icon-w", `${boxWide}px`);
    title.style.setProperty("--om-icon-h", `${boxTall}px`);
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
    } catch {}
  }
}

function scheduleVuePaint() {
  if (vueTimer) return;
  vueTimer = setTimeout(() => {
    vueTimer = 0;
    try { paintVueNodes(); } catch {}
  }, VUE_SWEEP);
}

function dropVueObserver() {
  if (vueObserver) vueObserver.disconnect();
  vueObserver = null;
  vuePane = null;
}

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

function watchVueMode() {
  const on = vueNodesOn();
  if (vueModeSeen === null) {
    vueModeSeen = on;
    return;
  }
  if (on === vueModeSeen) return;
  vueModeSeen = on;
  dropVueObserver();
  try { refreshExtras(); } catch {}
}

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
    if (!changed.shape) {
      baseShape = {
        radius: lg.ROUND_RADIUS,
        titleHeight: lg.NODE_TITLE_HEIGHT,
        slotHeight: lg.NODE_SLOT_HEIGHT,
      };
      changed.shape = true;
    }
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
      canvas.links_render_mode = readerLinkMode();
      changed.linkMode = false;
    }
  }

  if (extras) installDrawHook();
  liftVueProperties(palette);
  watchVueNodes();
  scheduleVuePaint();
  app.canvas?.setDirty(true, true);
}

export function refreshExtras() {
  try { applyExtras(app.extensionManager?.colorPalette?.getActiveColorPalette?.()); } catch {}
}

export function watchThemeExtras() {
  const service = app.extensionManager?.colorPalette;
  if (!service?.loadColorPalette || service.__omExtrasHook) return;
  const original = service.loadColorPalette.bind(service);
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

const EXTRAS_POLL = 60;
const EXTRAS_WAIT = 8000;
const EXTRAS_IDLE = 400;

const RETIRED = ["om_tokyo_night", "om_catppuccin_mocha", "om_catppuccin_latte", "om_rose_pine_dawn"];

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

const USER_THEME_API = "/open_manager/v1/api/user-themes";
const SETTINGS_HEALTH_API = "/open_manager/v1/api/settings/health";

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

let diskSettings = null;

async function settingsOnDisk() {
  if (diskSettings) return diskSettings;
  try {
    const held = await (await api.fetchApi("/settings")).json();
    diskSettings = held && typeof held === "object" ? held : {};
  } catch {
    diskSettings = {};
  }
  return diskSettings;
}

let diskHealth = null;

async function settingsHealth() {
  if (diskHealth) return diskHealth;
  try {
    const held = await (await api.fetchApi(SETTINGS_HEALTH_API)).json();
    diskHealth = held && typeof held === "object" ? held : {};
  } catch {
    diskHealth = {};
  }
  return diskHealth;
}

async function settingsReady() {
  const health = await settingsHealth();
  if (health.present && health.readable === false) {
    console.warn("[Open Manager] settings file present but unreadable to ComfyUI; "
      + "not writing, to leave it recoverable");
    return false;
  }
  const disk = await settingsOnDisk();
  const keys = Object.keys(disk);
  if (!keys.length) return true;
  const setting = app.extensionManager?.setting;
  if (!setting) return false;
  const probe = keys.find((one) => disk[one] !== undefined && disk[one] !== null);
  if (!probe) return true;
  try {
    if (setting.get(probe) !== undefined) return true;
  } catch {
    return false;
  }
  console.warn(`[Open Manager] ${keys.length} settings on disk, none readable in the page yet; `
    + "not writing");
  return false;
}

export async function registerThemes() {
  const setting = app.extensionManager?.setting;
  const service = app.extensionManager?.colorPalette;
  if (!setting) return;

  let store = {};
  let readable = false;
  try {
    store = setting.get("Comfy.CustomColorPalettes") || {};
    readable = true;
  } catch {
    readable = false;
  }
  if (!readable || typeof store !== "object") return;
  if (!await settingsReady()) return;

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
  const active = service?.getActiveColorPalette?.()?.id;
  if (RETIRED.includes(active)) {
    try { await service.loadColorPalette("dark"); } catch {}
  }
}
