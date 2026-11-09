import { app } from "../../../../scripts/app.js";
import { selectedNodes } from "../selection.mjs";

const COMPONENT = "ImagePreview";
const MARK = "__omGallery";
const PREVIEW = "image-preview";
const ROW = "data-om-thumbs";
const THUMB = "data-om-thumb";
const NAV = "om-image-nav";
const THUMB_FORMAT = "webp;75";
const ARROWS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]);
const WALK_CAP = 200000;

let live = false;
let mixin = null;
let queued = false;
let sizes = null;
let watched = new WeakSet();
const pending = new Set();
const revealed = new WeakMap();

function vueApp() {
  return document.querySelector("#vue-app")?.__vue_app__ || null;
}

function thumbUrl(url) {
  if (typeof url !== "string" || !url) return "";
  let parsed;
  try {
    parsed = new URL(url, location.origin);
  } catch {
    return url;
  }
  if (!parsed.pathname.endsWith("/view") || parsed.searchParams.has("preview")) return url;
  if ((parsed.searchParams.get("filename") || "").toLowerCase().endsWith(".svg")) return url;
  parsed.searchParams.set("preview", THUMB_FORMAT);
  return /^https?:/i.test(url) ? parsed.href : `${parsed.pathname}${parsed.search}`;
}

function dotRow(root) {
  for (const child of root.children) {
    if (child.tagName === "DIV" && child.querySelector(':scope > button[aria-current="true"]')) {
      return child;
    }
  }
  return null;
}

function dotsOf(row) {
  return [...row.children].filter((one) => one.tagName === "BUTTON" && !one.firstElementChild);
}

function currentOf(dots) {
  return dots.findIndex((dot) => dot.getAttribute("aria-current") === "true");
}

function step(root, by) {
  const row = root ? dotRow(root) : null;
  const dots = row ? dotsOf(row) : [];
  if (dots.length < 2) return false;
  const at = Math.max(0, currentOf(dots));
  dots[(at + by + dots.length) % dots.length].click();
  return true;
}

function onNav(event) {
  event.stopPropagation();
  const button = event.currentTarget;
  step(button.closest(`.${PREVIEW}`), button.dataset.omNav === "prev" ? -1 : 1);
}

function navButton(way) {
  const button = document.createElement("button");
  const label = way === "prev" ? "Previous image" : "Next image";
  button.type = "button";
  button.className = NAV;
  button.dataset.omNav = way;
  button.title = label;
  button.setAttribute("aria-label", label);
  button.addEventListener("click", onNav);
  return button;
}

function navButtons(panel, many) {
  const had = panel.querySelectorAll(`:scope > .${NAV}`);
  if (!many) {
    for (const button of had) button.remove();
    return;
  }
  if (had.length === 2) return;
  for (const button of had) button.remove();
  panel.append(navButton("prev"), navButton("next"));
}

function reveal(row, dots) {
  const at = currentOf(dots);
  if (at < 0 || revealed.get(row) === at) return;
  revealed.set(row, at);
  if (row.scrollWidth <= row.clientWidth + 1) return;
  const dot = dots[at];
  row.scrollLeft = Math.max(0, dot.offsetLeft + dot.offsetWidth / 2 - row.clientWidth / 2);
}

function resized(entries) {
  for (const { target } of entries) {
    if (!target.isConnected || !target.hasAttribute(ROW)) {
      sizes?.unobserve(target);
      watched.delete(target);
      continue;
    }
    revealed.delete(target);
    reveal(target, dotsOf(target));
  }
}

function watchSize(row) {
  if (watched.has(row) || typeof ResizeObserver !== "function") return;
  sizes ??= new ResizeObserver(resized);
  watched.add(row);
  sizes.observe(row);
}

function strip(row, urls) {
  const dots = dotsOf(row);
  if (dots.length !== urls.length) return;
  if (!row.hasAttribute(ROW)) row.setAttribute(ROW, "");
  watchSize(row);
  dots.forEach((dot, index) => {
    const url = thumbUrl(urls[index]);
    if (dot.getAttribute(THUMB) === url) return;
    dot.setAttribute(THUMB, url);
    dot.style.setProperty("--omn-thumb", url ? `url(${JSON.stringify(url)})` : "none");
  });
  reveal(row, dots);
}

function decorate(instance) {
  if (!live || instance.isUnmounted) return;
  const root = instance.subTree?.el;
  if (!(root instanceof HTMLElement) || !root.classList.contains(PREVIEW) || !root.closest(".lg-node")) {
    return;
  }
  const urls = Array.isArray(instance.props?.imageUrls) ? instance.props.imageUrls : [];
  const panel = root.querySelector(':scope > [role="region"]');
  if (panel) navButtons(panel, urls.length > 1);
  const row = dotRow(root);
  if (row) strip(row, urls);
}

function flush() {
  queued = false;
  const batch = [...pending];
  pending.clear();
  for (const instance of batch) {
    try {
      decorate(instance);
    } catch (error) {
      console.warn("[Open Manager] OM Nodes gallery", error);
    }
  }
}

function schedule(instance) {
  pending.add(instance);
  if (queued) return;
  queued = true;
  queueMicrotask(flush);
}

function wrap(instance) {
  if (typeof instance?.render !== "function" || instance.render[MARK]) return;
  const before = instance.render;
  const mine = function omGalleryRender(...args) {
    const tree = before.apply(this, args);
    if (live) schedule(instance);
    return tree;
  };
  mine[MARK] = true;
  instance.render = mine;
}

function existing() {
  const found = [];
  const stack = [document.querySelector("#vue-app")?._vnode].filter(Boolean);
  let steps = 0;
  while (stack.length && steps < WALK_CAP) {
    steps += 1;
    const vnode = stack.pop();
    if (!vnode || typeof vnode !== "object") continue;
    const instance = vnode.component;
    if (instance) {
      if (instance.type?.__name === COMPONENT) found.push(instance);
      if (instance.subTree) stack.push(instance.subTree);
      continue;
    }
    if (vnode.suspense?.activeBranch) stack.push(vnode.suspense.activeBranch);
    if (Array.isArray(vnode.children)) {
      for (const kid of vnode.children) if (kid && typeof kid === "object") stack.push(kid);
    }
  }
  return found;
}

function editable(target) {
  return target.isContentEditable || !!target.closest("input, textarea, select");
}

function fromGraph(target) {
  if (!(target instanceof Element)) return false;
  if (target === document.body || target === document.documentElement) return true;
  if (target === app.canvas?.canvas) return true;
  return !!target.closest(".lg-node") && !target.closest(`.${PREVIEW}`) && !editable(target);
}

function previewOf(node) {
  const root = document.querySelector(`.lg-node[data-node-id="${CSS.escape(String(node.id))}"]`);
  return root?.querySelector(`.${PREVIEW}`) || null;
}

function ownerOf(target) {
  return target instanceof Element ? target.closest(`.lg-node .${PREVIEW}`) : null;
}

function swallow(event) {
  event.preventDefault();
  event.stopImmediatePropagation();
}

function onKey(event) {
  if (!ARROWS.has(event.key) || event.defaultPrevented || event.isComposing || event.altKey
    || event.ctrlKey || event.metaKey || event.shiftKey) return;
  const by = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
  const owner = ownerOf(event.target);
  if (owner) {
    if (editable(event.target)) return;
    if (by) step(owner, by);
    swallow(event);
    return;
  }
  if (!by || !fromGraph(event.target)) return;
  let moved = false;
  for (const node of selectedNodes()) {
    if (!node || node.flags?.collapsed) continue;
    if (step(previewOf(node), by)) moved = true;
  }
  if (moved) swallow(event);
}

function onClick(event) {
  const owner = ownerOf(event.target);
  if (!owner || owner.contains(document.activeElement)) return;
  owner.querySelector(':scope > [role="region"]')?.focus({ preventScroll: true });
}

export function startGallery() {
  if (live) return;
  const vue = vueApp();
  if (typeof vue?.mixin !== "function" || !Array.isArray(vue._context?.mixins)) return;
  live = true;
  mixin = {
    created() {
      if (this.$?.type?.__name === COMPONENT) wrap(this.$);
    },
  };
  vue.mixin(mixin);
  vue._context.optionsCache = new WeakMap();
  for (const instance of existing()) {
    wrap(instance);
    schedule(instance);
  }
  window.addEventListener("keydown", onKey, true);
  document.addEventListener("click", onClick, true);
}

export function stopGallery() {
  if (!live) return;
  live = false;
  window.removeEventListener("keydown", onKey, true);
  document.removeEventListener("click", onClick, true);
  const vue = vueApp();
  const mixins = vue?._context?.mixins;
  const at = Array.isArray(mixins) ? mixins.indexOf(mixin) : -1;
  if (at >= 0) mixins.splice(at, 1);
  if (vue?._context) vue._context.optionsCache = new WeakMap();
  mixin = null;
  pending.clear();
  sizes?.disconnect();
  sizes = null;
  watched = new WeakSet();
  for (const button of document.querySelectorAll(`.${NAV}`)) button.remove();
  for (const dot of document.querySelectorAll(`[${THUMB}]`)) {
    dot.removeAttribute(THUMB);
    dot.style.removeProperty("--omn-thumb");
  }
  for (const row of document.querySelectorAll(`[${ROW}]`)) row.removeAttribute(ROW);
}
