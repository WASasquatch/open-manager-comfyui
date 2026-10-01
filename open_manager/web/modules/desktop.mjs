import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import { API, ICON_BRAND, ICON_PROGRAM, ICON_DESKTOP } from "./base.mjs";
import { el, safeArt, toast, liveTip, openRowMenu } from "./ui.mjs";
import { floatPanels, readColour } from "./windows.mjs";
import { panelSetting } from "./settings.mjs";
import { dlPost } from "./downloads.mjs";
import { managerDestinations } from "./topbar.mjs";
import { deskGates, loadPrograms } from "./programs.mjs";
import { taskBar, taskbarSync } from "./taskbar.mjs";
import { docKey, DOC_DESKTOP, loadDeskDocs, FILE_DRAG_TYPE, dropDocsInto, newDeskFlow, openWastebasket, newDeskNote, newDeskFolder } from "./desk-docs.mjs";
import { deskSelect, onDeskKey, paintDeskIcons } from "./desk-icons.mjs";
import { sessionReady, sessionKeep } from "./session.mjs";
import { openDesktopSettings } from "./desk-settings.mjs";
import { activePath } from "./workflows.mjs";

let deskProgramsOff = [];

const DESK_TAB_ID = "om-desk-tab";

const START_ART = {
  Programs: ICON_PROGRAM,
  Settings: ICON_DESKTOP,
  Games: ICON_BRAND,
};

const DESK_STRIP = '[data-testid="topbar-workflow-tabs"] .workflow-tabs-container';

let deskLayer = null;
let deskTab = null;
let deskShown = false;
let deskWatcher = null;
let deskChromeWatcher = null;
let deskRoom = null;
let deskWired = false;
let deskWatchTimer = 0;
let deskSeenPath = "";
let deskArmAt = 0;

const DESK_HASH = "#desktop";

let deskHashBefore = null;

function deskHashOn() {
  try {
    return location.hash === DESK_HASH;
  } catch {
    return false;
  }
}

let deskHashWanted = deskHashOn();

function deskHashAsked() {
  return deskHashWanted || deskHashOn();
}

function setDeskHash(on) {
  try {
    if (on) {
      if (deskHashOn()) return;
      deskHashBefore = location.hash || "";
      history.replaceState(null, "", DESK_HASH);
      return;
    }
    if (!deskHashOn()) return;
    history.replaceState(null, "",
      deskHashBefore || `${location.pathname}${location.search}`);
    deskHashBefore = null;
  } catch {
  }
}
let deskSideRoom = null;

function desktopOn() {
  return deskGates.desktop !== false
    && panelSetting("openManager.desktop", false) === true;
}

function deskStrip() {
  return document.querySelector(DESK_STRIP);
}

function deskCanvasBox() {
  return document.getElementById("graph-canvas-container");
}

function deskFreeBox() {
  return document.querySelector(".graph-canvas-panel") || deskCanvasBox();
}

const DESK_DRAWER_MIN = 40;

let deskGutter = 8;

function deskRoomBox() {
  let outer = null;
  for (let split = deskFreeBox()?.closest(".p-splitter"); split;
    split = split.parentElement?.closest(".p-splitter")) {
    outer = split;
  }
  return outer;
}

function deskAsked() {
  const query = new URLSearchParams(window.location.search);
  return query.has("share") || query.has("template");
}

function deskFit() {
  if (!deskLayer) return;
  const box = deskCanvasBox()?.getBoundingClientRect();
  if (!box || !box.width || !box.height) return;
  const floor = taskBar?.isConnected
    ? taskBar.getBoundingClientRect().top
    : window.innerHeight;
  const bottom = Math.min(box.bottom, floor);
  const tall = Math.max(80, bottom - box.top);
  deskLayer.style.left = `${Math.round(box.left)}px`;
  deskLayer.style.top = `${Math.round(box.top)}px`;
  deskLayer.style.width = `${Math.round(box.width)}px`;
  deskLayer.style.height = `${Math.round(tall)}px`;
  const grid = deskLayer.querySelector(".om-desk-grid");
  if (!grid) return;
  const free = deskFreeBox()?.getBoundingClientRect();
  if (!free || !free.width) return;
  const room = deskRoomBox()?.getBoundingClientRect() || free;
  if (free.left - room.left < DESK_DRAWER_MIN) {
    deskGutter = Math.max(0, Math.round(free.left - room.left));
  }
  const strip = document.querySelector('[data-testid="topbar-workflow-tabs"]')
    ?.getBoundingClientRect();
  const ceiling = strip && strip.height ? Math.max(strip.bottom, box.top) : room.top;
  const gap = (value) => Math.max(10, Math.round(value));
  deskInset.left = gap(room.left + deskGutter - box.left + 10);
  deskInset.top = gap(ceiling - box.top + 10);
  deskInset.right = gap(box.right - (room.right - deskGutter) + 10);
  deskInset.bottom = gap(Math.min(box.bottom, floor) - (room.bottom - deskGutter) + 10);
  placeDeskCells();
}

function buildDesk() {
  if (deskLayer?.isConnected) return deskLayer;
  deskLayer = el("div", "om-desk");
  deskLayer.hidden = true;
  deskLayer.classList.remove("om-desk-on");
  const grid = el("div", "om-desk-grid");
  grid.setAttribute("role", "listbox");
  grid.setAttribute("aria-label", "Desktop");
  grid.addEventListener("keydown", onDeskKey);
  const deskTypes = (event) => [...(event.dataTransfer?.types || [])];
  const deskCarried = (event) => {
    const types = deskTypes(event);
    return types.includes(DESK_DRAG_TYPE) || types.includes(FILE_DRAG_TYPE);
  };
  grid.addEventListener("dragover", (event) => {
    if (!deskCarried(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const onto = event.target instanceof Element
      ? event.target.closest(".om-desk-cell[data-om-drop]") : null;
    deskGhost(onto ? null : deskSpotAt(event));
  });
  grid.addEventListener("dragleave", (event) => {
    if (event.target === grid) deskGhost(null);
  });
  grid.addEventListener("drop", (event) => {
    deskGhost(null);
    if (!deskCarried(event)) return;
    let key = event.dataTransfer.getData(DESK_DRAG_TYPE);
    if (!key) {
      try { key = docKey(JSON.parse(event.dataTransfer.getData(FILE_DRAG_TYPE))); }
      catch { return; }
    }
    deskArrangeAt(key, deskSpotAt(event));
  });
  deskLayer.appendChild(grid);
  deskLayer.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    const spot = el("span");
    spot.style.cssText = `position: fixed; left: ${event.clientX}px; top: ${event.clientY}px;`
      + " width: 1px; height: 1px;";
    document.body.appendChild(spot);
    openRowMenu(spot, {
      items: [
        { label: "New note", fn: () => newDeskNote() },
        { label: "New folder", fn: () => newDeskFolder() },
        { label: "New workflow shortcut", fn: () => newDeskFlow() },
        { label: "Trash", fn: () => openWastebasket() },
        { label: "Arrange icons", fn: () => deskArrange() },
        { label: "Desktop settings", fn: () => openDesktopSettings() },
        { label: "Leave the desktop", fn: () => hideDesk() },
      ],
      align: "left",
    });
    setTimeout(() => spot.remove(), 50);
  });
  deskLayer.addEventListener("pointerdown", (event) => {
    if (event.target === deskLayer || event.target === grid) deskSelect(null);
  });
  dropDocsInto(deskLayer, () => DOC_DESKTOP, () => {});
  document.body.appendChild(deskLayer);
  const box = deskCanvasBox();
  if (box && window.ResizeObserver) {
    deskRoom?.disconnect();
    deskRoom = new ResizeObserver(() => deskFit());
    deskRoom.observe(box);
  }
  window.addEventListener("resize", deskFit);
  deskFit();
  return deskLayer;
}

const DESK_FITS = {
  cover: { size: "cover", repeat: "no-repeat", movable: true },
  contain: { size: "contain", repeat: "no-repeat", movable: false },
  centre: { size: "auto", repeat: "no-repeat", movable: true },
  tile: { size: "auto", repeat: "repeat", movable: false },
};

function deskFitNow() {
  return DESK_FITS[String(panelSetting("openManager.desktopFit", "cover"))] || DESK_FITS.cover;
}

function deskFocus() {
  return {
    x: deskNumber("openManager.desktopFocusX", 50, 0, 100),
    y: deskNumber("openManager.desktopFocusY", 50, 0, 100),
  };
}

function deskPosition(fit) {
  if (!fit.movable) return "top left";
  const spot = deskFocus();
  return `${spot.x}% ${spot.y}%`;
}

function deskPaperUrl(asked) {
  const text = String(asked || "").trim();
  if (!text) return "";
  if (/^https?:\/\//i.test(text) || text.startsWith("/")) return safeArt(text);
  return `${API}/wallpaper?name=${encodeURIComponent(text)}`;
}

function deskNumber(key, fallback, low, high) {
  const asked = Number(panelSetting(key, fallback));
  if (!Number.isFinite(asked)) return fallback;
  return Math.max(low, Math.min(high, Math.round(asked)));
}

function applyDeskLook() {
  if (!deskLayer) return;
  const url = deskPaperUrl(panelSetting("openManager.desktopWallpaper", ""));
  const fit = deskFitNow();
  if (url) {
    const test = new Image();
    test.onload = () => {
      if (!deskLayer) return;
      deskLayer.style.backgroundImage = `url("${url}")`;
      deskLayer.style.backgroundSize = fit.size;
      deskLayer.style.backgroundRepeat = fit.repeat;
      deskLayer.style.backgroundPosition = deskPosition(fit);
    };
    test.onerror = () => {
      if (!deskLayer) return;
      deskLayer.style.backgroundImage = "";
      toast("That wallpaper could not be read, so the desktop is plain.", { kind: "warn" });
    };
    test.src = url;
  } else {
    deskLayer.style.backgroundImage = "";
  }
  const grid = deskLayer.querySelector(".om-desk-grid");
  if (!grid) return;
  grid.style.setProperty("--om-desk-icon",
    `${deskNumber("openManager.desktopIconSize", 44, 28, 96)}px`);
  grid.style.setProperty("--om-desk-label",
    `${deskNumber("openManager.desktopLabelSize", 12, 9, 18)}px`);
  placeDeskCells();
}

async function deskPapers() {
  try {
    return await (await api.fetchApi(`${API}/wallpapers`)).json();
  } catch {
    return { ok: false, wallpapers: [] };
  }
}

const DESK_SNAP_SLACK = 4;

const DESK_DRAG_TYPE = "application/x-om-desk";

const DESK_SPRING = 900;

const DESK_GAP = 3;

const DESK_CELL_KEEP = 300;

let deskCarry = null;

let deskCells = {};

const deskInset = { left: 10, top: 10, right: 10, bottom: 10 };

let deskSaveDue = 0;

let deskPinDue = 0;

let deskOffDue = 0;

let deskWriting = Promise.resolve();

let deskPinned = [];

let deskUnpinned = [];

function deskStep(grid) {
  const icon = deskNumber("openManager.desktopIconSize", 44, 28, 96);
  const label = deskNumber("openManager.desktopLabelSize", 12, 9, 18);
  const probe = grid.querySelector(".om-desk-cell");
  const wide = probe?.offsetWidth || icon + 28;
  const tall = probe?.offsetHeight || Math.round(icon + label * 2.7 + 17);
  return { wide: wide + DESK_GAP, tall: tall + DESK_GAP, cell: { wide, tall } };
}

function deskCapacity(grid) {
  const step = deskStep(grid);
  const room = {
    wide: grid.clientWidth - deskInset.left - deskInset.right,
    tall: grid.clientHeight - deskInset.top - deskInset.bottom,
  };
  const cols = Math.max(1, Math.floor((room.wide + DESK_GAP) / step.wide));
  const rows = Math.max(1, Math.floor((room.tall + DESK_GAP) / step.tall));
  return { cols, rows, step: { wide: step.wide, tall: step.tall, cell: step.cell } };
}

function deskTaken(grid, except) {
  const held = new Set();
  for (const cell of grid.querySelectorAll(".om-desk-cell")) {
    if (cell === except) continue;
    const spot = deskCells[cell.dataset.omDeskKey];
    if (spot) held.add(`${spot.col},${spot.row}`);
  }
  return held;
}

function deskFreeSpot(grid, want, except) {
  const { cols, rows } = deskCapacity(grid);
  const held = deskTaken(grid, except);
  const col = Math.max(0, Math.min(cols - 1, want.col));
  const row = Math.max(0, Math.min(rows - 1, want.row));
  if (!held.has(`${col},${row}`)) return { col, row };
  for (let ring = 1; ring < cols + rows; ring += 1) {
    for (let dc = -ring; dc <= ring; dc += 1) {
      for (let dr = -ring; dr <= ring; dr += 1) {
        if (Math.abs(dc) !== ring && Math.abs(dr) !== ring) continue;
        const tryCol = col + dc;
        const tryRow = row + dr;
        if (tryCol < 0 || tryRow < 0 || tryCol >= cols || tryRow >= rows) continue;
        if (!held.has(`${tryCol},${tryRow}`)) return { col: tryCol, row: tryRow };
      }
    }
  }
  return { col, row };
}

function placeDeskCells() {
  if (!deskLayer) return;
  const grid = deskLayer.querySelector(".om-desk-grid");
  if (!grid || !grid.clientWidth || !grid.clientHeight) return;
  const { cols, rows, step } = deskCapacity(grid);
  let next = 0;
  for (const cell of grid.querySelectorAll(".om-desk-cell")) {
    const key = cell.dataset.omDeskKey;
    let spot = deskCells[key];
    if (!spot) {
      spot = deskFreeSpot(grid, { col: Math.floor(next / rows) % cols, row: next % rows }, cell);
      deskCells[key] = spot;
    }
    next += 1;
    cell.style.left = `${deskInset.left + spot.col * step.wide}px`;
    cell.style.top = `${deskInset.top + spot.row * step.tall}px`;
  }
}

function keepDesk(body) {
  deskWriting = deskWriting
    .catch(() => {})
    .then(() => dlPost("/desktop-layout", body).catch(() => {}));
  return deskWriting;
}

function sweepDeskCells() {
  const keys = Object.keys(deskCells);
  if (keys.length <= DESK_CELL_KEEP) return;
  const grid = deskGrid();
  const live = new Set([...(grid ? grid.querySelectorAll(".om-desk-cell") : [])]
    .map((one) => one.dataset.omDeskKey));
  for (const key of keys) {
    if (!live.has(key) && Object.keys(deskCells).length > DESK_CELL_KEEP) {
      delete deskCells[key];
    }
  }
}

function saveDeskCells() {
  clearTimeout(deskSaveDue);
  deskSaveDue = setTimeout(() => {
    sweepDeskCells();
    keepDesk({ cells: deskCells });
  }, 400);
}

function authorColours() {
  return panelSetting("openManager.programColours", true) !== false;
}

function windowColour() {
  return String(panelSetting("openManager.windowColour", "") || "").trim().toLowerCase();
}

function deskLook(key) {
  const row = managerDestinations().find((one) => one.desk?.window === key);
  const author = authorColours() ? row?.desk?.look : null;
  if (author?.tint || author?.from) return author;
  return readColour(windowColour());
}

async function setWindowColour(tint) {
  try {
    await app.extensionManager.setting.set("openManager.windowColour", tint);
  } catch {}
  repaintLooks();
}

function saveProgramsOff() {
  clearTimeout(deskOffDue);
  deskOffDue = setTimeout(() => keepDesk({ off: deskProgramsOff }), 400);
}

async function setProgramOn(id, on) {
  const at = deskProgramsOff.indexOf(id);
  if (on && at >= 0) deskProgramsOff.splice(at, 1);
  if (!on && at < 0) deskProgramsOff.push(id);
  saveProgramsOff();
  await loadPrograms();
  paintDeskIcons();
}

function saveDeskPins() {
  clearTimeout(deskPinDue);
  deskPinDue = setTimeout(() => keepDesk({
    pinned: deskPinned, unpinned: deskUnpinned,
  }), 400);
}

async function loadDeskCells() {
  try {
    const answer = await (await api.fetchApi(`${API}/desktop-layout`)).json();
    if (answer?.cells && typeof answer.cells === "object") deskCells = answer.cells;
    if (Array.isArray(answer?.pinned)) deskPinned = answer.pinned;
    if (Array.isArray(answer?.unpinned)) deskUnpinned = answer.unpinned;
    if (Array.isArray(answer?.off)) deskProgramsOff = answer.off;
  } catch {
    deskCells = {};
  }
  repaintLooks();
}

function repaintLooks() {
  for (const [key, held] of floatPanels) {
    if (held.el.isConnected) held.setLook?.(deskLook(key));
  }
  document.querySelector(".om-deskset-palette")?._omPaint?.();
}

function deskGrid() {
  return deskLayer?.querySelector(".om-desk-grid") || null;
}

function deskCellFor(key) {
  return deskLayer?.querySelector(`[data-om-desk-key="${CSS.escape(key)}"]`) || null;
}

function deskGhost(spot) {
  const grid = deskGrid();
  if (!grid) return;
  let ghost = grid.querySelector(".om-desk-ghost");
  if (!spot) { ghost?.remove(); return; }
  const probe = grid.querySelector(".om-desk-cell");
  const { step } = deskCapacity(grid);
  if (!ghost) {
    ghost = el("div", "om-desk-ghost");
    grid.appendChild(ghost);
  }
  ghost.style.width = `${probe?.offsetWidth || step.wide - 12}px`;
  ghost.style.height = `${probe?.offsetHeight || step.tall - 12}px`;
  ghost.style.left = `${deskInset.left + spot.col * step.wide}px`;
  ghost.style.top = `${deskInset.top + spot.row * step.tall}px`;
}

function deskSpotAt(event) {
  const grid = deskGrid();
  if (!grid) return null;
  const box = grid.getBoundingClientRect();
  const { cols, rows, step } = deskCapacity(grid);
  const left = event.clientX - box.left - (deskCarry ? deskCarry.grabX : step.wide / 2);
  const top = event.clientY - box.top - (deskCarry ? deskCarry.grabY : step.tall / 2);
  const want = {
    col: Math.max(0, Math.min(cols - 1, Math.round((left - deskInset.left) / step.wide))),
    row: Math.max(0, Math.min(rows - 1, Math.round((top - deskInset.top) / step.tall))),
  };
  return deskFreeSpot(grid, want, deskCarry ? deskCellFor(deskCarry.key) : null);
}

function deskArrangeAt(key, spot) {
  if (!key || !spot) return;
  deskCells[key] = spot;
  saveDeskCells();
  placeDeskCells();
}

function dragDeskByPointer(cell, event) {
  const grid = cell.parentElement;
  if (!grid) return;
  const start = { x: event.clientX, y: event.clientY };
  const from = { left: cell.offsetLeft, top: cell.offsetTop };
  const { step, cols, rows } = deskCapacity(grid);
  let moved = false;
  let spot = null;
  try { cell.setPointerCapture(event.pointerId); } catch {}

  const onMove = (move) => {
    const dx = move.clientX - start.x;
    const dy = move.clientY - start.y;
    if (!moved && Math.abs(dx) < DESK_SNAP_SLACK && Math.abs(dy) < DESK_SNAP_SLACK) return;
    if (!moved) {
      moved = true;
      cell.classList.add("om-desk-dragging");
    }
    cell.style.left = `${from.left + dx}px`;
    cell.style.top = `${from.top + dy}px`;
    spot = deskFreeSpot(grid, {
      col: Math.max(0, Math.min(cols - 1,
        Math.round((from.left + dx - deskInset.left) / step.wide))),
      row: Math.max(0, Math.min(rows - 1,
        Math.round((from.top + dy - deskInset.top) / step.tall))),
    }, cell);
    deskGhost(spot);
  };

  const onUp = () => {
    try { cell.releasePointerCapture?.(event.pointerId); } catch {}
    cell.removeEventListener("pointermove", onMove);
    cell.removeEventListener("pointerup", onUp);
    cell.removeEventListener("pointercancel", onUp);
    if (!moved) return;
    cell.classList.remove("om-desk-dragging");
    deskGhost(null);
    if (spot) deskArrangeAt(cell.dataset.omDeskKey, spot);
    else placeDeskCells();
  };

  cell.addEventListener("pointermove", onMove);
  cell.addEventListener("pointerup", onUp);
  cell.addEventListener("pointercancel", onUp);
}

function dragDeskCell(cell) {
  cell.draggable = true;
  cell.dataset.omDrag = "1";
  cell.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    deskSelect(cell);
    if (event.pointerType !== "mouse") dragDeskByPointer(cell, event);
  });
  cell.addEventListener("dragstart", (event) => {
    const box = cell.getBoundingClientRect();
    deskCarry = {
      key: cell.dataset.omDeskKey,
      grabX: event.clientX - box.left,
      grabY: event.clientY - box.top,
    };
    event.dataTransfer.setData(DESK_DRAG_TYPE, cell.dataset.omDeskKey);
    event.dataTransfer.effectAllowed = "move";
    requestAnimationFrame(() => cell.classList.add("om-desk-dragging"));
  });
  cell.addEventListener("dragend", () => {
    cell.classList.remove("om-desk-dragging");
    deskCarry = null;
    deskGhost(null);
  });
}

function deskArrange() {
  deskCells = {};
  placeDeskCells();
  saveDeskCells();
  toast("Icons arranged.", { kind: "ok" });
}

function deskChrome() {
  const found = [];
  const bar = document.querySelector(".actionbar-container");
  const cluster = bar?.closest(".mx-1") || bar?.parentElement || bar;
  if (cluster) found.push(cluster);
  const crumb = document.querySelector(".subgraph-breadcrumb");
  if (crumb) found.push(crumb);
  const panel = deskFreeBox();
  const room = panel?.getBoundingClientRect();
  for (const group of panel?.querySelectorAll(".p-buttongroup") || []) {
    const box = group.getBoundingClientRect();
    if (!box.height || !room) continue;
    if (box.bottom > room.bottom - 160) found.push(group);
  }
  return found;
}

function slideChrome(away) {
  const room = deskFreeBox()?.getBoundingClientRect();
  for (const node of deskChrome()) {
    const box = node.getBoundingClientRect();
    node.classList.add("om-desk-chrome");
    if (room && box.height) {
      node.classList.toggle("om-desk-under", box.top > room.top + room.height / 2);
    }
    node.classList.toggle("om-desk-away", away);
  }
}

function chromeHost() {
  const bar = document.querySelector(".actionbar-container");
  return bar?.closest(".p-splitterpanel") || document.body;
}

function watchDeskChrome() {
  if (deskChromeWatcher) return;
  let due = 0;
  deskChromeWatcher = new MutationObserver(() => {
    if (due) return;
    due = requestAnimationFrame(() => { due = 0; slideChrome(deskShown); });
  });
  deskChromeWatcher.observe(chromeHost(), { childList: true, subtree: true });
}

function deskSidebar() {
  return document.querySelector(".side-tool-bar-container");
}

function fitDeskTab() {
  if (!deskTab?.isConnected) return;
  const side = deskSidebar()?.getBoundingClientRect();
  const wide = side && side.width >= 24 ? Math.round(side.width) : 38;
  deskTab.style.width = `${wide}px`;
}

function watchDeskTabWidth() {
  const side = deskSidebar();
  if (!side || !window.ResizeObserver) return;
  deskSideRoom?.disconnect();
  deskSideRoom = new ResizeObserver(() => { fitDeskTab(); deskFit(); });
  deskSideRoom.observe(side);
}

function paintDeskTab() {
  if (!deskTab) return;
  deskTab.classList.toggle("om-desk-tab-on", deskShown);
  deskTab.setAttribute("aria-pressed", deskShown ? "true" : "false");
}

function showDesk() {
  if (!desktopOn()) return;
  loadDeskDocs().then(() => paintDeskIcons()).catch(() => {});
  buildDesk();
  paintDeskIcons();
  applyDeskLook();
  deskFit();
  deskLayer.hidden = false;
  deskLayer.classList.add("om-desk-on");
  requestAnimationFrame(() => { deskFit(); placeDeskCells(); });
  deskShown = true;
  deskSeenPath = activePath();
  deskArmAt = Date.now() + (sessionReady ? 1200 : 8000);
  document.body.classList.add("om-desk-open");
  setDeskHash(true);
  slideChrome(true);
  paintDeskTab();
  taskbarSync();
  sessionKeep();
}

function hideDesk() {
  if (!deskShown) return;
  deskShown = false;
  deskHashWanted = false;
  if (deskLayer) {
    deskLayer.hidden = true;
    deskLayer.classList.remove("om-desk-on");
  }
  document.body.classList.remove("om-desk-open");
  setDeskHash(false);
  slideChrome(false);
  paintDeskTab();
  taskbarSync();
  sessionKeep();
}

function deskShowing() {
  return deskShown;
}

function mountDeskTab() {
  if (!desktopOn()) return;
  const strip = deskStrip();
  if (!strip) return;
  const held = document.getElementById(DESK_TAB_ID);
  if (held && held.parentElement === strip && strip.firstChild === held) return;
  held?.remove();
  deskTab = el("button", "om-desk-tab");
  deskTab.id = DESK_TAB_ID;
  deskTab.type = "button";
  deskTab.setAttribute("aria-label", "Desktop");
  const mark = el("span", "om-desk-mark");
  mark.style.setProperty("-webkit-mask", `center / contain no-repeat url("${ICON_DESKTOP}")`);
  mark.style.setProperty("mask", `center / contain no-repeat url("${ICON_DESKTOP}")`);
  deskTab.appendChild(mark);
  liveTip(deskTab, () => ({
    lead: "Desktop",
    lines: [deskShown ? "Hide the desktop" : "Show the desktop"],
  }));
  deskTab.onclick = () => { if (deskShown) hideDesk(); else showDesk(); };
  strip.insertBefore(deskTab, strip.firstChild);
  fitDeskTab();
  watchDeskTabWidth();
  paintDeskTab();
}

function watchDeskTab() {
  if (deskWatcher) return;
  const host = document.querySelector('[data-testid="topbar-workflow-tabs"]')
    || document.body;
  let due = 0;
  deskWatcher = new MutationObserver(() => {
    if (due) return;
    due = requestAnimationFrame(() => { due = 0; mountDeskTab(); });
  });
  deskWatcher.observe(host, { childList: true, subtree: true });
}

function watchDeskWork() {
  clearInterval(deskWatchTimer);
  deskSeenPath = activePath();
  let deskChromeAway = null;
  deskWatchTimer = setInterval(() => {
    const open = deskShown && !!deskLayer && !deskLayer.hidden;
    if (deskLayer && !deskShown) deskLayer.classList.remove("om-desk-on");
    document.body.classList.toggle("om-desk-open", open);
    if (open || deskChromeAway !== false) {
      slideChrome(open);
      deskChromeAway = open;
    }
    if (!deskShown) return;
    const now = activePath();
    if (!now) return;
    if (!deskSeenPath || Date.now() < deskArmAt) { deskSeenPath = now; return; }
    if (now !== deskSeenPath) {
      deskSeenPath = now;
      hideDesk();
    }
  }, 250);
}

function leaveDeskOnWork() {
  if (deskWired) return;
  deskWired = true;
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !deskShown) return;
    if (document.querySelector(".om-backdrop, .om-menu, .om-lb, .om-task-pop, .om-start")) return;
    const on = event.target;
    if (on instanceof Element
        && on.closest(".om-float input, .om-float textarea, .om-float select, "
          + ".om-float [contenteditable='true']")) return;
    hideDesk();
  }, true);
  document.addEventListener("pointerdown", (event) => {
    if (!deskShown) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest(`#${DESK_TAB_ID}`) || target.closest(".om-desk")) return;
    if (target.closest(".p-togglebutton") || target.closest(".new-blank-workflow-button")) {
      hideDesk();
    }
  }, true);
}

function applyDesktop() {
  const on = desktopOn();
  if (!on) {
    hideDesk();
    document.body.classList.remove("om-desk-open");
    slideChrome(false);
    document.getElementById(DESK_TAB_ID)?.remove();
    deskTab = null;
    deskWatcher?.disconnect();
    deskWatcher = null;
    deskChromeWatcher?.disconnect();
    deskChromeWatcher = null;
    deskSideRoom?.disconnect();
    deskSideRoom = null;
    clearInterval(deskWatchTimer);
    deskWatchTimer = 0;
    deskRoom?.disconnect();
    deskRoom = null;
    deskLayer?.remove();
    deskLayer = null;
    taskbarSync();
    return;
  }
  mountDeskTab();
  watchDeskTab();
  watchDeskChrome();
  leaveDeskOnWork();
  watchDeskWork();
  buildDesk();
  paintDeskIcons();
  applyDeskLook();
  taskbarSync();
}

export { deskProgramsOff, DESK_TAB_ID, START_ART, deskLayer, deskShown, deskHashAsked, desktopOn, deskCanvasBox, deskAsked, deskFit, deskFitNow, deskFocus, deskPosition, deskPaperUrl, deskNumber, applyDeskLook, deskPapers, DESK_SPRING, deskCells, deskPinned, deskUnpinned, deskTaken, placeDeskCells, saveDeskCells, authorColours, windowColour, deskLook, setWindowColour, setProgramOn, saveDeskPins, loadDeskCells, repaintLooks, deskGrid, deskCellFor, deskSpotAt, deskArrangeAt, dragDeskCell, showDesk, hideDesk, deskShowing, applyDesktop };
