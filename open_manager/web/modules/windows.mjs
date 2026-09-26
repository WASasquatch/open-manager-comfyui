import { FLOAT_Z, FLOAT_Z_TOP } from "./base.mjs";
import { el, safeArt, closeOn } from "./ui.mjs";
import { panelSetting } from "./settings.mjs";
import { TAB_HEX } from "./tab-marks.mjs";
import { taskBar } from "./taskbar.mjs";
import { deskFit, deskLook } from "./desktop.mjs";

const WINDOW_SETTINGS = {
  manager: "openManager.windowManager",
  packs: "openManager.windowPacks",
  downloads: "openManager.windowDownloads",
  library: "openManager.windowLibrary",
  memory: "openManager.windowMemory",
};

function asWindow(surface) {
  return panelSetting(WINDOW_SETTINGS[surface], true) !== false;
}

const WINDOW_SCALE = { compact: 0.8, standard: 1, large: 1.25 };

const WINDOW_SIZES = {
  manager: { vw: 0.66, vh: 0.70, min: [420, 320], max: [1600, 1200] },
  pack: { vw: 0.72, vh: 0.74, min: [420, 340], max: [1800, 1300] },
  downloads: { vw: 0.56, vh: 0.50, min: [380, 280], max: [1300, 900] },
  library: { vw: 0.62, vh: 0.58, min: [420, 320], max: [1500, 1000] },
  memory: { vw: 0.44, vh: 0.60, min: [340, 320], max: [1000, 1000] },
  desktop: { vw: 0.34, vh: 0.62, min: [360, 420], max: [720, 1000] },
  folder: { vw: 0.34, vh: 0.46, min: [300, 240], max: [760, 900] },
  note: { vw: 0.40, vh: 0.56, min: [340, 280], max: [900, 1100] },
  props: { vw: 0.24, vh: 0.44, min: [280, 260], max: [520, 760] },
};

const WINDOW_ROOM = { width: 0.94, height: 0.88 };

function windowSize(name) {
  const spec = Object.hasOwn(WINDOW_SIZES, name) ? WINDOW_SIZES[name] : WINDOW_SIZES.manager;
  const scale = windowScale();
  const pick = (share, extent, low, high, room) => Math.round(
    Math.max(low, Math.min(high, extent * room, extent * share * scale)));
  const tall = pick(spec.vh, workHeight(), spec.min[1], spec.max[1], WINDOW_ROOM.height);
  return {
    width: pick(spec.vw, window.innerWidth, spec.min[0], spec.max[0], WINDOW_ROOM.width),
    height: Math.max(120, tall - headerHeight()),
  };
}

function windowScale() {
  const asked = String(panelSetting("openManager.windowSize", "standard") || "standard");
  return WINDOW_SCALE[asked] ?? 1;
}

const TEXT_LIMITS = { title: [10, 28], body: [10, 22] };

function applyWindowLook() {
  const clamp = ([low, high], value, fallback) =>
    Math.min(high, Math.max(low, Number(value) || fallback));
  const root = document.documentElement;
  root.style.setProperty("--om-title-size",
    `${clamp(TEXT_LIMITS.title, panelSetting("openManager.windowTitleSize", 15), 15)}px`);
  root.style.setProperty("--om-text-size",
    `${clamp(TEXT_LIMITS.body, panelSetting("openManager.windowTextSize", 13), 13)}px`);
  root.style.setProperty("--om-shadow",
    panelSetting("openManager.windowShadow", true) !== false
      ? "0 10px 40px rgba(0,0,0,.5)"
      : "none");
  document.body.classList.toggle("om-blur-inactive",
    panelSetting("openManager.blurInactive", false) !== false);
  root.style.setProperty("--om-blur-back",
    `${clamp([1, 12], panelSetting("openManager.blurAmount", 3), 3)}px`);
  applyAero();
  for (const panel of floatPanels.values()) panel.refreshIcon?.();
}

function applyAero() {
  const root = document.documentElement;
  const on = panelSetting("openManager.aero", false) === true;
  document.body.classList.toggle("om-aero", on);
  if (!on) return;
  const held = (name, low, high, fallback) =>
    Math.min(high, Math.max(low, Number(panelSetting(name, fallback)) || fallback));
  root.style.setProperty("--om-aero-alpha",
    `${held("openManager.aeroAlpha", 10, 100, 55)}%`);
  root.style.setProperty("--om-aero-dark",
    String(held("openManager.aeroDark", 0, 70, 18) / 100));
  root.style.setProperty("--om-aero-blur",
    `${held("openManager.aeroBlur", 0, 40, 12)}px`);
}

const FLOAT_SLACK_X = 16;
const FLOAT_SLACK_Y = 16;

const DRAG_DWELL = 600;

const DRAG_GAP = 300;

const floatPanels = new Map();

let floatTop = FLOAT_Z;

let taskRoom = 0;

const floatHooks = new Set();

let floatWanted = "";

function workHeight() {
  return window.innerHeight - taskRoom;
}

function setTaskRoom(height) {
  const px = Math.max(0, Math.round(height));
  if (px === taskRoom) return;
  taskRoom = px;
  document.documentElement.style.setProperty("--om-bar-h", `${px}px`);
  for (const panel of floatPanels.values()) panel.reflow?.();
  deskFit();
}

function floatChanged() {
  for (const fn of floatHooks) {
    try { fn(); } catch {}
  }
}

function floatWantFocus(key) {
  floatWanted = String(key || "");
}

function floatTakeFocus() {
  const key = floatWanted;
  floatWanted = "";
  return key;
}

function deskReduced() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function floatGroup(key) {
  const text = String(key || "");
  const at = text.indexOf(":");
  return at > 0 ? text.slice(0, at) : (text || "window");
}

function taskbarOn() {
  return panelSetting("openManager.taskbar", false) === true;
}

function taskbarGrouped() {
  return panelSetting("openManager.taskbarGroups", false) === true;
}

const HEADER_DEFAULT = 44;

function headerHeight() {
  const asked = Number(panelSetting("openManager.panelHeaders", HEADER_DEFAULT));
  return Number.isFinite(asked) ? Math.max(24, Math.min(80, Math.round(asked))) : HEADER_DEFAULT;
}

function applyHeaderHeight() {
  const height = `${headerHeight()}px`;
  for (const panel of document.querySelectorAll(".om-float")) {
    panel.style.setProperty("--om-hdr", height);
  }
}

function floatRecall(key, fallback) {
  try {
    const saved = JSON.parse(localStorage.getItem(`om-float-${key}`) || "null");
    return saved && typeof saved === "object" ? saved : fallback;
  } catch {
    return fallback;
  }
}

function floatRemember(key, state) {
  try { localStorage.setItem(`om-float-${key}`, JSON.stringify(state)); } catch {}
}

function markActive(panel) {
  let changed = false;
  for (const other of document.querySelectorAll(".om-float:not(.om-float-away)")) {
    const want = other === panel;
    if (other.classList.contains("om-float-active") !== want) changed = true;
    other.classList.toggle("om-float-active", want);
  }
  if (changed) floatChanged();
}

const BAR_INERT = "button, input, textarea, select, [contenteditable]";

const BAR_PAINTS = {
  plain: "",
  accent: "var(--p-button-text-primary-color, #388bfd)",
  green: "#3fb950",
  amber: "#d29922",
  red: "#f85149",
  purple: "#a371f7",
  teal: "#39c5cf",
  grey: "var(--om-muted)",
};

function barTint(value) {
  const wanted = String(value || "").trim().toLowerCase();
  if (Object.hasOwn(BAR_PAINTS, wanted)) return BAR_PAINTS[wanted];
  return TAB_HEX.test(wanted) ? wanted : "";
}

function barPaint(look, { over = "transparent" } = {}) {
  const from = barTint(look?.from || look?.tint);
  if (!from) return "";
  const to = barTint(look?.to) || from;
  const near = `color-mix(in srgb, ${from} 22%, ${over})`;
  const far = `color-mix(in srgb, ${to} ${look?.to ? 22 : 6}%, ${over})`;
  return `linear-gradient(100deg, ${near}, ${far})`;
}

function readColour(text) {
  const parts = String(text || "").split(",").map((one) => one.trim().toLowerCase())
    .filter(Boolean);
  if (!parts.length) return null;
  if (parts.length > 1 && barTint(parts[0]) && barTint(parts[1])) {
    return { from: parts[0], to: parts[1] };
  }
  return barTint(parts[0]) ? { tint: parts[0] } : null;
}

function paintBar(bar, look) {
  bar.style.setProperty("--om-bar-paint", barPaint(look) || "none");
}

function createFloatingPanel({ key, title, width = 820, height = 520, onClose,
                               centred = false, modal = false } = {}) {
  const open = floatingPanel(key);
  if (open) { open.present(); return open; }

  let id = String(key);
  const saved = floatRecall(id, {});
  const fits = (asked, floor, room) => Math.max(floor, Math.min(asked, room));
  const wantsFloat = !modal && panelSetting("openManager.floatingPanels", true) !== false;
  const panel = el("div", "om-float");
  panel.tabIndex = -1;
  panel.addEventListener("keydown", (event) => {
    const on = event.target;
    if (!(on instanceof Element)) return;
    if (!on.closest("input, textarea, select, [contenteditable='true']")) return;
    event.stopPropagation();
  });
  const floating = () => wantsFloat;
  const roomy = () => window.innerWidth - panel.offsetWidth >= FLOAT_SLACK_X
    && workHeight() - panel.offsetHeight >= FLOAT_SLACK_Y;
  let placed = false;
  const anchored = () => floating() && (roomy() || placed);
  let parked = null;
  let minimised = false;
  let awayAt = 0;
  let snug = true;
  const applyMode = () => {
    const now = anchored();
    if (!now && snug && panel.style.left) {
      parked = { left: parseInt(panel.style.left, 10) || 0,
                 top: parseInt(panel.style.top, 10) || 0 };
    }
    snug = now;
    panel.classList.toggle("om-float-fixed", !floating());
  };
  panel.style.width = `${fits(saved.width || width, 280, window.innerWidth - 16)}px`;
  panel.style.setProperty("--om-hdr", `${headerHeight()}px`);

  const bar = el("div", "om-float-bar");
  const shrink = el("button", "om-float-min", "▁");
  shrink.title = "Minimise";
  shrink.setAttribute("aria-label", "Minimise");
  shrink.hidden = modal || !taskbarOn();
  const fold = el("button", "om-float-fold", "▾");
  fold.title = "Collapse";
  bar.appendChild(fold);
  const mark = el("img", "om-float-icon");
  mark.alt = "";
  mark.hidden = true;
  mark.onerror = () => { mark.hidden = true; };
  bar.appendChild(mark);
  const glyph = el("span", "om-float-glyph");
  glyph.hidden = true;
  bar.appendChild(glyph);
  const heading = el("div", "om-float-title", title);
  bar.appendChild(heading);
  const badge = el("div", "om-float-badge");
  bar.appendChild(badge);
  bar.appendChild(shrink);
  const close = el("button", "om-float-close", "×");
  close.title = "Close";
  bar.appendChild(close);
  panel.appendChild(bar);

  const tools = el("div", "om-float-tools");
  panel.appendChild(tools);

  const body = el("div", "om-float-body");
  body.style.height =
    `${fits(saved.height || height, 80, workHeight() - headerHeight() - 24)}px`;
  panel.appendChild(body);

  paintBar(bar, deskLook(id));

  const grip = el("div", "om-float-grip");
  grip.title = "Resize";
  panel.appendChild(grip);

  const backdrop = modal ? el("div", "om-backdrop om-backdrop-panel") : null;
  if (backdrop) {
    backdrop.appendChild(panel);
    document.body.appendChild(backdrop);
  } else {
    document.body.appendChild(panel);
  }

  const place = (left, top) => {
    const rect = panel.getBoundingClientRect();
    const x = Math.min(Math.max(left, 8 - rect.width + 120), window.innerWidth - 120);
    const y = Math.min(Math.max(top, 0), workHeight() - 36);
    panel.style.left = `${Math.round(x)}px`;
    panel.style.top = `${Math.round(y)}px`;
  };

  const settle = (left, top) => {
    const rect = panel.getBoundingClientRect();
    if (rect.width + 16 <= window.innerWidth) {
      left = Math.min(Math.max(left, 8), window.innerWidth - rect.width - 8);
    }
    if (rect.height + 16 <= workHeight()) {
      top = Math.min(Math.max(top, 8), workHeight() - rect.height - 8);
    }
    place(left, top);
  };
  const centre = () => place(
    Math.max(8, (window.innerWidth - panel.offsetWidth) / 2),
    Math.max(8, (workHeight() - panel.offsetHeight) / 2),
  );
  applyMode();
  if (anchored()) {
    settle(
      saved.left ?? Math.max(16, (window.innerWidth - panel.offsetWidth) / 2),
      saved.top ?? (centred
        ? Math.max(16, (workHeight() - panel.offsetHeight) / 2)
        : Math.max(56, workHeight() * 0.18)),
    );
  } else {
    centre();
  }

  const state = () => ({
    left: parseInt(panel.style.left, 10) || 0,
    top: parseInt(panel.style.top, 10) || 0,
    width: panel.offsetWidth,
    height: parseInt(body.style.height, 10) || height,
  });
  const remember = () => {
    if (minimised) return;
    const now = state();
    const { folded: _gone, ...previous } = floatRecall(id, {});
    if (!anchored()) { delete now.left; delete now.top; }
    floatRemember(id, { ...previous, ...now });
  };

  const raise = () => {
    markActive(panel);
    if (Number(panel.style.zIndex) === floatTop && floatTop > FLOAT_Z) return;
    floatTop = floatTop >= FLOAT_Z_TOP ? FLOAT_Z : floatTop + 1;
    panel.style.zIndex = String(floatTop);
  };
  panel.addEventListener("pointerdown", raise, true);
  let dwellFrom = 0;
  let dwellSeen = 0;
  panel.addEventListener("dragover", () => {
    if (panel.classList.contains("om-float-active")) return;
    const now = Date.now();
    if (!dwellFrom || now - dwellSeen > DRAG_GAP) dwellFrom = now;
    dwellSeen = now;
    if (now - dwellFrom < DRAG_DWELL) return;
    dwellFrom = 0;
    raise();
  });
  markActive(panel);
  panel.style.zIndex = String(FLOAT_Z);
  raise();
  panel.addEventListener("pointerdown", raise, true);

  const setFolded = (folded) => {
    panel.classList.toggle("om-float-folded", folded);
    requestAnimationFrame(() => {
      applyMode();
      if (anchored()) {
        settle(parseInt(panel.style.left, 10) || 0, parseInt(panel.style.top, 10) || 0);
      } else {
        centre();
      }
    });
    fold.textContent = folded ? "▸" : "▾";
    fold.title = folded ? "Expand" : "Collapse";
    remember();
  };
  const taskSeat = () => {
    const item = taskBar?.querySelector(`[data-om-task="${CSS.escape(id)}"]`)
      || taskBar?.querySelector(`[data-om-group="${CSS.escape(floatGroup(id))}"]`)
      || taskBar;
    return item?.getBoundingClientRect() || null;
  };

  const travel = (toward, after) => {
    const seat = taskSeat();
    const from = panel.getBoundingClientRect();
    if (!seat || !from.width || !from.height || deskReduced()) { after(); return; }
    const scale = Math.max(0.08, Math.min(1, seat.width / from.width));
    const dx = seat.left + seat.width / 2 - (from.left + from.width / 2);
    const dy = seat.top + seat.height / 2 - (from.top + from.height / 2);
    const shut = `translate(${Math.round(dx)}px, ${Math.round(dy)}px) scale(${scale})`;
    panel.classList.add("om-float-travel");
    if (toward === "bar") {
      panel.style.transform = shut;
      panel.style.opacity = "0";
    } else {
      panel.style.transform = shut;
      panel.style.opacity = "0";
      requestAnimationFrame(() => {
        panel.style.transform = "";
        panel.style.opacity = "";
      });
    }
    const done = () => {
      panel.removeEventListener("transitionend", done);
      clearTimeout(fallback);
      panel.classList.remove("om-float-travel");
      panel.style.transform = "";
      panel.style.opacity = "";
      after();
    };
    const fallback = setTimeout(done, 260);
    panel.addEventListener("transitionend", done);
  };

  const setMinimised = (want) => {
    if (modal || want === minimised) return;
    if (want && !taskbarOn()) return;
    minimised = want;
    if (want) {
      travel("bar", () => panel.classList.add("om-float-away"));
    } else {
      panel.classList.remove("om-float-away");
      travel("window", () => {});
    }
    if (want) {
      awayAt = Date.now();
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && panel.contains(focused)) focused.blur();
      panel.classList.remove("om-float-active");
      const rest = [...document.querySelectorAll(".om-float:not(.om-float-away)")]
        .sort((a, b) => (Number(a.style.zIndex) || 0) - (Number(b.style.zIndex) || 0));
      markActive(rest[rest.length - 1] || null);
      panel.dispatchEvent(new CustomEvent("om-win:minimise", { detail: { key: id } }));
      floatWantFocus(id);
      floatChanged();
      return;
    }
    requestAnimationFrame(() => {
      applyMode();
      if (anchored()) {
        settle(parseInt(panel.style.left, 10) || 0, parseInt(panel.style.top, 10) || 0);
      } else {
        centre();
      }
      remember();
      panel.dispatchEvent(new CustomEvent("om-float-resize"));
    });
    panel.dispatchEvent(new CustomEvent("om-win:restore", { detail: { key: id } }));
    raise();
    panel.focus({ preventScroll: true });
    floatChanged();
  };
  shrink.onclick = (event) => { event.stopPropagation(); setMinimised(true); };
  fold.onclick = (event) => { event.stopPropagation(); setFolded(!panel.classList.contains("om-float-folded")); };
  bar.addEventListener("dblclick", (event) => {
    if (event.target.closest(BAR_INERT)) return;
    setFolded(!panel.classList.contains("om-float-folded"));
  });

  const drag = (handle, onMove, allowed = () => true) => {
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target.closest(BAR_INERT) || !allowed()) return;
      event.preventDefault();
      const start = { x: event.clientX, y: event.clientY,
                      left: parseInt(panel.style.left, 10) || 0,
                      top: parseInt(panel.style.top, 10) || 0,
                      width: panel.offsetWidth,
                      height: parseInt(body.style.height, 10) || height };
      handle.setPointerCapture(event.pointerId);
      const move = (moved) => onMove(start, moved.clientX - start.x, moved.clientY - start.y);
      const done = () => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", done);
        handle.removeEventListener("pointercancel", done);
        remember();
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", done);
      handle.addEventListener("pointercancel", done);
    });
  };

  drag(bar, (start, dx, dy) => {
    placed = true;
    snug = true;
    place(start.left + dx, start.top + dy);
  }, floating);
  drag(grip, (start, dx, dy) => {
    if (panel.classList.contains("om-float-folded")) return;
    panel.style.width = `${Math.max(280, start.width + dx)}px`;
    body.style.height = `${Math.max(80, start.height + dy)}px`;
    applyMode();
    if (!anchored()) centre();
    panel.dispatchEvent(new CustomEvent("om-float-resize"));
  });

  const destroy = async () => {
    const asked = handle.confirmClose?.();
    if (asked === false) return;
    if (asked && typeof asked.then === "function" && !await asked) return;
    remember();
    (backdrop || panel).remove();
    floatPanels.delete(id);
    onClose?.();
    panel.dispatchEvent(new CustomEvent("om-prog-close"));
    const rest = [...document.querySelectorAll(".om-float:not(.om-float-away)")]
      .sort((a, b) => (Number(a.style.zIndex) || 0) - (Number(b.style.zIndex) || 0));
    if (rest.length) markActive(rest[rest.length - 1]);
    floatChanged();
  };
  if (backdrop) closeOn(backdrop, destroy);
  close.onclick = destroy;

  const onResize = () => {
    if (!panel.isConnected) { window.removeEventListener("resize", onResize); return; }
    if (minimised) return;
    applyMode();
    if (!anchored()) { centre(); return; }
    const back = parked;
    parked = null;
    settle(back?.left ?? (parseInt(panel.style.left, 10) || 0),
           back?.top ?? (parseInt(panel.style.top, 10) || 0));
  };
  window.addEventListener("resize", onResize);

  let art = null;
  const showIcon = () => {
    const shown = art?.bar === false ? null : art;
    const wanted = panelSetting("openManager.windowIcons", true) !== false ? shown : null;
    if (wanted?.kind === "src") {
      mark.src = wanted.url;
      mark.hidden = false;
    } else {
      mark.hidden = true;
      mark.removeAttribute("src");
    }
    if (wanted?.kind === "mask") {
      glyph.style.setProperty("-webkit-mask", `center / contain no-repeat url("${wanted.url}")`);
      glyph.style.setProperty("mask", `center / contain no-repeat url("${wanted.url}")`);
      glyph.style.backgroundColor = wanted.tint || "currentColor";
      glyph.hidden = false;
    } else {
      glyph.hidden = true;
    }
  };

  const handle = {
    el: panel, body, bar, tools, key: id,
    group: floatGroup(id),
    modal,
    setTitle: (text) => {
      const label = bar.querySelector(".om-float-title");
      if (label) { label.textContent = text; label.title = text; }
      floatChanged();
    },
    title: () => heading.textContent || "",
    icon: () => (art ? { ...art } : null),
    refreshIcon: showIcon,
    raise, destroy,
    rekey: (next) => {
      const want = String(next || "");
      if (!want || want === id) return id;
      floatingPanel(want)?.destroy();
      const carried = floatRecall(id, null);
      floatPanels.delete(id);
      try { localStorage.removeItem(`om-float-${id}`); } catch {}
      id = want;
      handle.key = id;
      handle.group = floatGroup(id);
      if (carried) floatRemember(id, carried);
      floatPanels.set(id, handle);
      floatChanged();
      return id;
    },
    minimise: () => setMinimised(true),
    restore: () => setMinimised(false),
    isMinimised: () => minimised,
    minimisedAt: () => awayAt,
    reflow: onResize,
    showMinimise: () => { shrink.hidden = modal || !taskbarOn(); },
    present: () => { setMinimised(false); setFolded(false); raise(); },
    setMaskIcon: (url, { bar = true, tint = "" } = {}) => {
      const text = safeArt(url);
      art = text ? { kind: "mask", url: text, bar, tint: TAB_HEX.test(tint) ? tint : "" } : null;
      showIcon();
      floatChanged();
    },
    setIcon: (url, { bar = true } = {}) => {
      const text = safeArt(url);
      art = text ? { kind: "src", url: text, bar } : null;
      showIcon();
      floatChanged();
    },
    setBadge: (text) => { badge.textContent = text || ""; },
    setLook: (look) => paintBar(bar, look),
    isFolded: () => panel.classList.contains("om-float-folded"),
  };
  floatPanels.set(id, handle);
  floatChanged();
  return handle;
}

function floatingPanel(key) {
  const found = floatPanels.get(key);
  if (found && found.el.isConnected) return found;
  if (found) floatPanels.delete(key);
  return null;
}

function closeFloatingPanel(key) {
  floatingPanel(key)?.destroy();
}

export { asWindow, WINDOW_SIZES, windowSize, applyWindowLook, floatPanels, floatHooks, setTaskRoom, floatTakeFocus, taskbarOn, taskbarGrouped, applyHeaderHeight, BAR_PAINTS, barPaint, readColour, createFloatingPanel, floatingPanel, closeFloatingPanel };
