const SHEETS = ["om-nodes-skin", "om-nodes-palette", "om-nodes-theme"];

const ROOT = "html[data-om-nodes]";

const COLOUR = { kind: "colour" };

const px = (min, max) => ({ kind: "px", min, max });

const OM_TOKENS = {
  "node-radius": px(0, 24),
  "widget-radius": px(0, 20),
  "widget-height": px(14, 40),
  "widget-gap": px(0, 12),
  "widget-inset": px(0, 40),
  "widget-pad": px(8, 40),
  "slot-height": px(14, 40),
  "title-size": px(8, 28),
  "text-size": px(8, 20),
  "title-weight": { kind: "weight" },
  "font": { kind: "font" },
  "dot-size": px(4, 16),
  "outline-width": px(0, 6),
  "outline-gap": px(0, 8),
  "shadow-x": px(-20, 20),
  "shadow-y": px(-20, 20),
  "shadow-blur": px(0, 40),
  "shadow-color": COLOUR,
  "title-ink": COLOUR,
  "title-ink-selected": COLOUR,
  "slot-ink": COLOUR,
  "box": COLOUR,
  "header": COLOUR,
  "body": COLOUR,
  "widget-bg": COLOUR,
  "widget-bg-hover": COLOUR,
  "widget-outline": COLOUR,
  "widget-outline-advanced": COLOUR,
  "widget-label": COLOUR,
  "widget-value": COLOUR,
  "widget-disabled": COLOUR,
  "accent": COLOUR,
  "selection": COLOUR,
  "running": COLOUR,
  "progress": COLOUR,
  "progress-height": px(1, 8),
  "drop": COLOUR,
  "error": COLOUR,
};

const SURFACES = {
  header: ["--node-component-header-surface", "--node-header"],
  body: ["--component-node-background", "--node"],
};

const PALETTE = [
  ["title-height", "NODE_TITLE_HEIGHT", "px"],
  ["slot-height", "NODE_SLOT_HEIGHT", "px"],
  ["widget-height", "NODE_WIDGET_HEIGHT", "px"],
  ["node-radius", "ROUND_RADIUS", "px"],
  ["title-size", "NODE_TEXT_SIZE", "px"],
  ["text-size", "NODE_SUBTEXT_SIZE", "px"],
  ["font", "NODE_FONT", "font"],
  ["title-ink", "NODE_TITLE_COLOR", "colour"],
  ["title-ink-selected", "NODE_SELECTED_TITLE_COLOR", "colour"],
  ["slot-ink", "NODE_TEXT_COLOR", "colour"],
  ["selection", "NODE_BOX_OUTLINE_COLOR", "colour"],
  ["widget-bg", "WIDGET_BGCOLOR", "colour"],
  ["widget-outline", "WIDGET_OUTLINE_COLOR", "colour"],
  ["widget-outline-advanced", "WIDGET_ADVANCED_OUTLINE_COLOR", "colour"],
  ["widget-value", "WIDGET_TEXT_COLOR", "colour"],
  ["widget-label", "WIDGET_SECONDARY_TEXT_COLOR", "colour"],
  ["widget-disabled", "WIDGET_DISABLED_TEXT_COLOR", "colour"],
  ["shadow-color", "DEFAULT_SHADOW_COLOR", "colour"],
  ["error", "NODE_ERROR_COLOUR", "colour"],
];

const NODE_PARTS = {
  node: ".lg-node",
  selected: ".lg-node:is(.outline-node-component-outline, .outline-foreground)",
  running: ".lg-node:is(.outline-node-stroke-executing, .outline-primary)",
  collapsed: ".lg-node[data-collapsed]",
  bypassed: '.lg-node:has(> [data-testid="node-inner-wrapper"][class*="before:bg-bypass"])',
  muted: '.lg-node:has(> [data-testid="node-inner-wrapper"][class*="before:inset-0"]'
    + ':not([class*="before:bg-bypass"]))',
  errored: '.lg-node:has(> [data-testid="node-inner-wrapper"]:is([class*="ring-destructive"], '
    + '[class*="ring-warning"]))',
};

const INNER_PARTS = {
  frame: '[data-testid="node-inner-wrapper"]',
  header: ".lg-node-header",
  collapse: '[data-testid="node-collapse-button"]',
  title: '[data-testid="node-title"]',
  body: '[data-testid^="node-body-"]',
  slot: ".lg-slot:not(.lg-slot--dot-only)",
  input: ".lg-slot--input:not(.lg-slot--dot-only)",
  output: ".lg-slot--output",
  "slot-label": ".lg-slot span.truncate",
  dot: '[data-testid="slot-dot"]',
  widgets: '[data-testid="node-widgets"]',
  widget: '[data-testid="node-widget"]',
  field: '[data-testid="node-widget"]:has(> .col-span-2 > [data-testid="widget-layout-field-label"], '
    + '> .col-span-2 > .col-span-2 > [data-testid="widget-layout-field-label"], '
    + '> .col-span-2 > .col-span-2 > .col-span-2 > [data-testid="widget-layout-field-label"])',
  label: '[data-testid="widget-layout-field-label"]',
  value: '[data-testid="widget-layout-field-label"] + .min-w-0',
  stepper: ':is([data-testid="decrement"], [data-testid="increment"])',
  textarea: "textarea",
  badges: '[data-testid^="node-body-"] > .mt-auto',
  tabs: '.box-border.isolate > :is([data-testid="advanced-inputs-button"], '
    + '[data-testid="subgraph-enter-button"], '
    + "button:is(.bg-destructive-background, .bg-destructive, .bg-warning))",
  outline: '[data-testid="node-state-outline-overlay"]',
  resize: "[data-corner]",
};

const PART = /%([a-z][a-z-]*)/g;
const PLACEHOLDER = /om-part-([a-z][a-z-]*)/g;
const IMAGE_NAME = /^[a-z][a-z0-9-]{0,31}$/;
const FONT = /^[A-Za-z0-9 ,"'_-]{1,120}$/;
const UNSAFE_VALUE = /url\s*\(|image-set\s*\(|expression\s*\(|javascript:|@import|\\/i;
const UNSAFE_NAME = /^(-[a-z]+-)?(animation|transition|behavior|binding)/i;
const CSS_LIMIT = 48_000;
const RULE_LIMIT = 600;
const IMAGE_LIMIT = 8;

function sheet(id) {
  let node = document.getElementById(id);
  if (node) return node;
  for (const name of SHEETS) {
    if (document.getElementById(name)) continue;
    const made = document.createElement("style");
    made.id = name;
    document.head.appendChild(made);
  }
  return document.getElementById(id);
}

export function mountSheets(skin) {
  const node = sheet("om-nodes-skin");
  if (node.textContent !== skin) node.textContent = skin;
}

export function omActive() {
  return document.documentElement.hasAttribute("data-om-nodes");
}

function colour(value) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > 80 || /[;{}<>\\]/.test(text) || UNSAFE_VALUE.test(text)) return null;
  try {
    return CSS.supports("color", text) ? text : null;
  } catch {
    return null;
  }
}

function font(value) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!FONT.test(text)) return null;
  try {
    return CSS.supports("font-family", text) ? text : null;
  } catch {
    return null;
  }
}

function tokenValue(spec, raw) {
  if (spec.kind === "colour") return colour(raw);
  if (spec.kind === "font") return font(raw);
  if (spec.kind === "weight") {
    if (raw === "normal" || raw === "bold") return raw;
    const weight = Number(raw);
    return Number.isInteger(weight) && weight >= 100 && weight <= 900 ? String(weight) : null;
  }
  const number = Number(raw);
  return Number.isFinite(number) && number >= spec.min && number <= spec.max ? `${number}px` : null;
}

function sanitiseOmTokens(raw) {
  if (!raw || typeof raw !== "object") return null;
  const out = {};
  for (const [name, value] of Object.entries(raw)) {
    const spec = OM_TOKENS[name];
    if (!spec) continue;
    const kept = tokenValue(spec, value);
    if (kept !== null) out[name] = kept;
  }
  return Object.keys(out).length ? out : null;
}

function splitSelectors(text) {
  const out = [];
  let depth = 0;
  let quote = "";
  let start = 0;
  for (let at = 0; at < text.length; at += 1) {
    const char = text[at];
    if (quote) {
      if (char === "\\") at += 1;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === "(" || char === "[") depth += 1;
    else if (char === ")" || char === "]") depth -= 1;
    else if (char === "," && depth === 0) {
      out.push(text.slice(start, at).trim());
      start = at + 1;
    }
  }
  out.push(text.slice(start).trim());
  return out.filter(Boolean);
}

function scopeSelector(selector) {
  const lead = /^om-part-([a-z][a-z-]*)/.exec(selector);
  if (!lead) return null;
  let unknown = false;
  const swap = (name, first) => {
    if (first && NODE_PARTS[name]) return NODE_PARTS[name];
    if (INNER_PARTS[name]) return first ? `.lg-node ${INNER_PARTS[name]}` : INNER_PARTS[name];
    if (NODE_PARTS[name]) return `:is(${NODE_PARTS[name]})`;
    unknown = true;
    return "";
  };
  let first = true;
  const body = selector.replace(PLACEHOLDER, (_, name) => {
    const out = swap(name, first);
    first = false;
    return out;
  });
  return unknown ? null : `${ROOT} ${body}`;
}

function declarations(style) {
  const out = [];
  for (let at = 0; at < style.length; at += 1) {
    const name = style[at];
    if (UNSAFE_NAME.test(name)) continue;
    const value = style.getPropertyValue(name);
    if (!value || UNSAFE_VALUE.test(value)) continue;
    if (name === "position" && /fixed|sticky/i.test(value)) continue;
    const priority = style.getPropertyPriority(name) ? " !important" : "";
    out.push(`${name}:${value}${priority}`);
  }
  return out;
}

function compileRules(rules, budget) {
  const out = [];
  for (const rule of rules) {
    if (budget.left <= 0) break;
    if (typeof CSSStyleRule !== "undefined" && rule instanceof CSSStyleRule) {
      const selectors = splitSelectors(rule.selectorText).map(scopeSelector).filter(Boolean);
      const body = declarations(rule.style);
      if (!selectors.length || !body.length) continue;
      budget.left -= 1;
      out.push(`${selectors.join(",")}{${body.join(";")}}`);
    } else if (typeof CSSMediaRule !== "undefined" && rule instanceof CSSMediaRule) {
      const inner = compileRules(rule.cssRules, budget);
      if (inner.length) out.push(`@media ${rule.conditionText}{${inner.join("")}}`);
    } else if (typeof CSSSupportsRule !== "undefined" && rule instanceof CSSSupportsRule) {
      const inner = compileRules(rule.cssRules, budget);
      if (inner.length) out.push(`@supports ${rule.conditionText}{${inner.join("")}}`);
    }
  }
  return out;
}

function compileOmCss(raw) {
  const text = (Array.isArray(raw) ? raw.filter((one) => typeof one === "string").join("\n") : raw);
  if (typeof text !== "string" || !text.trim() || text.length > CSS_LIMIT) return "";
  const parsed = new CSSStyleSheet();
  try {
    parsed.replaceSync(text.replace(/@import[^;]*;?/gi, "").replace(PART, "om-part-$1"));
  } catch {
    return "";
  }
  return compileRules(parsed.cssRules, { left: RULE_LIMIT }).join("\n");
}

export function sanitiseOm(raw, image) {
  if (!raw || typeof raw !== "object") return null;
  const out = {};
  const tokens = sanitiseOmTokens(raw.tokens);
  if (tokens) out.tokens = tokens;
  if (raw.images && typeof raw.images === "object") {
    const images = {};
    for (const [name, ref] of Object.entries(raw.images).slice(0, IMAGE_LIMIT)) {
      if (!IMAGE_NAME.test(name)) continue;
      const src = typeof image === "function" ? image(ref, "body") : "";
      if (src) images[name] = src;
    }
    if (Object.keys(images).length) out.images = images;
  }
  const css = compileOmCss(raw.css);
  if (css) out.css = css;
  return Object.keys(out).length ? out : null;
}

export function sanitiseOmRule(raw) {
  if (!raw || typeof raw !== "object") return null;
  const tokens = sanitiseOmTokens(raw.tokens);
  if (!tokens) return null;
  for (const name of Object.keys(SURFACES)) delete tokens[name];
  return Object.keys(tokens).length ? { tokens } : null;
}

export function syncOmPalette() {
  const lg = window.LiteGraph;
  if (!lg) return;
  const decl = [];
  for (const [token, key, kind] of PALETTE) {
    const raw = lg[key];
    let value = null;
    if (kind === "px") {
      const number = Number(raw);
      value = Number.isFinite(number) && number >= 0 && number <= 200 ? `${number}px` : null;
    } else if (kind === "font") {
      const family = font(String(raw || ""));
      value = family ? `${family}, Inter, Arial, sans-serif` : null;
    } else {
      value = colour(raw);
    }
    if (value) decl.push(`--omn-${token}:${value}`);
  }
  const text = decl.length ? `${ROOT}{${decl.join(";")}}` : "";
  const node = sheet("om-nodes-palette");
  if (node.textContent !== text) node.textContent = text;
}

export function applyOmTheme(extras) {
  const om = extras?.om;
  const decl = [];
  const radius = Number(extras?.shape?.radius);
  if (Number.isFinite(radius) && radius >= 0 && radius <= 120) decl.push(`--omn-node-radius:${radius}px`);
  for (const [name, value] of Object.entries(om?.tokens || {})) {
    decl.push(`--omn-${name}:${value}`);
    for (const prop of SURFACES[name] || []) decl.push(`${prop}:${value}`);
  }
  for (const [name, src] of Object.entries(om?.images || {})) {
    decl.push(`--omn-image-${name}:url("${src}")`);
  }
  let text = decl.length ? `${ROOT}{${decl.join(";")}}` : "";
  if (om?.css) text += `\n${om.css}`;
  const node = sheet("om-nodes-theme");
  if (node.textContent !== text) node.textContent = text;
}

const painted = new WeakMap();

export function paintOmNode(root, node, tokens, header, ink) {
  const before = painted.get(root);
  const now = new Set();
  if (tokens) {
    for (const [name, value] of Object.entries(tokens)) {
      const prop = `--omn-${name}`;
      now.add(prop);
      if (root.style.getPropertyValue(prop) !== value) root.style.setProperty(prop, value);
    }
  }
  if (before) {
    for (const prop of before) if (!now.has(prop)) root.style.removeProperty(prop);
  }
  if (now.size) painted.set(root, now);
  else painted.delete(root);
  const type = String(node?.type || "");
  const category = String(node?.constructor?.category || "").toLowerCase();
  if (root.getAttribute("data-om-type") !== type) root.setAttribute("data-om-type", type);
  if (category) {
    if (root.getAttribute("data-om-category") !== category) root.setAttribute("data-om-category", category);
  } else {
    root.removeAttribute("data-om-category");
  }
  if (header) {
    if (ink) header.style.setProperty("--omn-title-ink", ink);
    else header.style.removeProperty("--omn-title-ink");
  }
}

export function stripOmNode(root, header) {
  const before = painted.get(root);
  if (before) {
    for (const prop of before) root.style.removeProperty(prop);
    painted.delete(root);
  }
  root.removeAttribute("data-om-type");
  root.removeAttribute("data-om-category");
  header?.style.removeProperty("--omn-title-ink");
}
