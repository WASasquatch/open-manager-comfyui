import { ICON_BRAND, ICON_PROGRAM, ICON_DESKTOP, ICON_BIN } from "./base.mjs";
import { el, safeArt, liveTip, openRowMenu, placeRowMenu } from "./ui.mjs";
import { floatPanels, setTaskRoom, floatTakeFocus, taskbarOn, taskbarGrouped, floatingPanel } from "./windows.mjs";
import { panelSetting } from "./settings.mjs";
import { managerDestinations } from "./topbar.mjs";
import { guardWindowDrags } from "./node-drag.mjs";
import { DESK_TAB_ID, START_ART, desktopOn } from "./desktop.mjs";
import { deskDocs, loadDeskDocs, docArt, openDoc, openWastebasket } from "./desk-docs.mjs";
import { pinnedOn, pinDesk, unpinDesk, deskOpenRow } from "./desk-icons.mjs";

const TASK_GROUP_NAMES = {
  pack: "Custom nodes",
  manager: "Node Discovery",
  downloads: "Download Manager",
  library: "Model Library",
  memory: "Memory",
  desktop: "Desktop settings",
  programs: "Manage Programs",
  files: "Folders",
  note: "Notes",
  props: "Properties",
  wastebasket: "Trash",
};

const TASK_POP_IN = 180;

const TASK_POP_OUT = 260;

let taskBar = null;

let taskStart = null;

let taskStrip = null;

let startPanel = null;
let taskDue = 0;
let taskPop = null;
let taskPopFor = null;
let taskPopIn = 0;
let taskPopOut = 0;
let taskWired = false;

function taskGroupName(group) {
  const known = Object.hasOwn(TASK_GROUP_NAMES, group) ? TASK_GROUP_NAMES[group] : "";
  if (known) return known;
  const text = String(group || "Window");
  return text.length > 18 ? `${text.slice(0, 17)}…` : text;
}

function taskWindows() {
  const out = [];
  for (const [key, panel] of [...floatPanels]) {
    if (!panel.el.isConnected) { floatPanels.delete(key); continue; }
    if (panel.modal) continue;
    out.push(panel);
  }
  return out;
}

function taskEntries() {
  const open = taskWindows();
  if (!taskbarGrouped()) return open.map((panel) => ({ group: panel.group, members: [panel] }));
  const entries = [];
  const seen = new Map();
  for (const panel of open) {
    const found = seen.get(panel.group);
    if (found) { found.members.push(panel); continue; }
    const made = { group: panel.group, members: [panel] };
    seen.set(panel.group, made);
    entries.push(made);
  }
  return entries;
}

function taskbarHost() {
  const bottom = document.getElementById("comfyui-body-bottom");
  if (bottom) return { host: bottom, before: bottom.firstChild, flow: true };
  return { host: document.body, before: null, flow: false };
}

function taskTint(text) {
  let sum = 0;
  for (const ch of String(text)) sum = (sum * 31 + ch.codePointAt(0)) % 360;
  return `hsl(${sum} 42% 38%)`;
}

function taskInitial(text) {
  const label = String(text || "?").trim();
  const node = el("span", "om-task-glyph", (label[0] || "?").toUpperCase());
  node.style.background = taskTint(label);
  node.style.color = "#fff";
  return node;
}

function omIcon(art, { name = "", cls = "om-task-glyph", img = "om-task-icon" } = {}) {
  const url = safeArt(art?.url);
  if (url && art.kind === "src") {
    const node = el("img", img);
    node.alt = "";
    node.draggable = false;
    node.onerror = () => node.replaceWith(art.fallback?.kind === "mask"
      ? omIcon({ kind: "mask", url: art.fallback.url }, { name, cls, img })
      : taskInitial(name));
    node.src = url;
    return node;
  }
  if (url && art.kind === "mask") {
    const node = el("span", cls);
    node.style.backgroundColor = art.tint || "currentColor";
    node.style.setProperty("-webkit-mask", `center / contain no-repeat url("${url}")`);
    node.style.setProperty("mask", `center / contain no-repeat url("${url}")`);
    return node;
  }
  return taskInitial(name);
}

function taskIcon(panel) {
  return omIcon(panel.icon?.(), { name: panel.title?.() || panel.key });
}

function taskOneMenu(panel) {
  const items = [panel.isMinimised()
    ? { label: "Restore", fn: () => panel.present() }
    : { label: "Minimise", fn: () => panel.minimise() },
    { label: "Close", danger: true, fn: () => panel.destroy() }];
  const rest = taskWindows().filter((one) => one !== panel);
  if (rest.length) {
    items.push({
      label: `Close ${rest.length} other window${rest.length === 1 ? "" : "s"}`,
      danger: true,
      fn: () => { for (const one of rest) one.destroy(); },
    });
  }
  return items;
}

function taskGroupMenu(entry) {
  const items = [];
  const away = entry.members.filter((one) => one.isMinimised());
  const live = entry.members.filter((one) => !one.isMinimised());
  if (away.length) {
    items.push({ label: "Restore all", fn: () => { for (const one of away) one.present(); } });
  }
  if (live.length) {
    items.push({ label: "Minimise all", fn: () => { for (const one of live) one.minimise(); } });
  }
  items.push({
    label: `Close these ${entry.members.length} windows`,
    danger: true,
    fn: () => { for (const one of [...entry.members]) one.destroy(); },
  });
  return items;
}

function buildTaskRow(panel) {
  const row = el("div", "om-task-row");
  row.setAttribute("role", "menuitem");
  row.tabIndex = -1;
  row.appendChild(taskIcon(panel));
  const name = panel.title?.() || panel.key;
  row.appendChild(el("span", "om-task-row-name", name));
  const minimised = panel.isMinimised();
  const front = !minimised && panel.el.classList.contains("om-float-active");
  row.appendChild(el("span", "om-task-row-state",
    minimised ? "Minimised" : (front ? "In front" : "")));
  const shut = el("button", "om-task-shut", "×");
  shut.type = "button";
  shut.tabIndex = -1;
  shut.setAttribute("aria-hidden", "true");
  shut.onclick = (event) => { event.stopPropagation(); panel.destroy(); };
  row.appendChild(shut);
  row.onclick = () => { panel.present(); closeTaskPop(false); };
  row.addEventListener("auxclick", (event) => {
    if (event.button !== 1) return;
    event.preventDefault();
    panel.destroy();
  });
  return row;
}

function fillTaskPop(entry) {
  if (!taskPop) return;
  taskPop.replaceChildren(...entry.members.map(buildTaskRow));
  placeRowMenu(taskPop, taskPopFor, "left");
}

function taskPopLater() {
  clearTimeout(taskPopOut);
  taskPopOut = setTimeout(() => closeTaskPop(false), TASK_POP_OUT);
}

function closeTaskPop(back) {
  clearTimeout(taskPopIn);
  clearTimeout(taskPopOut);
  taskPopIn = 0;
  taskPopOut = 0;
  taskPop?.remove();
  taskPop = null;
  const was = taskPopFor;
  taskPopFor = null;
  if (was) {
    was.setAttribute("aria-expanded", "false");
    was.removeAttribute("aria-controls");
    if (back && was.isConnected) was.focus();
  }
}

function openTaskPop(item, entry, intoIt) {
  if (taskPopFor === item && taskPop) {
    if (intoIt) taskPop.querySelector(".om-task-row")?.focus();
    return;
  }
  closeTaskPop(false);
  taskPop = el("div", "om-task-pop");
  taskPop.id = `om-task-pop-${String(entry.group).replace(/[^a-z0-9_-]/gi, "-")}`;
  taskPop.setAttribute("role", "menu");
  taskPop.setAttribute("aria-label", `${taskGroupName(entry.group)} windows`);
  taskPop.addEventListener("pointerenter", () => { clearTimeout(taskPopOut); taskPopOut = 0; });
  taskPop.addEventListener("pointerleave", taskPopLater);
  taskPop.addEventListener("keydown", onTaskPopKey);
  document.body.appendChild(taskPop);
  taskPopFor = item;
  fillTaskPop(entry);
  requestAnimationFrame(() => taskPop?.classList.add("om-task-pop-on"));
  item.setAttribute("aria-expanded", "true");
  item.setAttribute("aria-controls", taskPop.id);
  if (intoIt) taskPop.querySelector(".om-task-row")?.focus();
}

function onTaskPopKey(event) {
  if (!taskPop) return;
  const rows = [...taskPop.querySelectorAll(".om-task-row")];
  const here = event.target instanceof Element ? event.target.closest(".om-task-row") : null;
  const at = rows.indexOf(here);
  if (event.key === "ArrowDown") {
    event.preventDefault();
    rows[Math.min(rows.length - 1, at + 1)]?.focus();
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    (at <= 0 ? rows[0] : rows[at - 1])?.focus();
  } else if (event.key === "Home") {
    event.preventDefault();
    rows[0]?.focus();
  } else if (event.key === "End") {
    event.preventDefault();
    rows[rows.length - 1]?.focus();
  } else if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    here?.click();
  } else if (event.key === "Delete") {
    event.preventDefault();
    here?.querySelector(".om-task-shut")?.click();
  } else if (event.key === "Escape") {
    event.preventDefault();
    closeTaskPop(true);
  } else if (event.key === "Tab") {
    closeTaskPop(false);
  }
}

function buildTaskOne(panel) {
  const item = el("button", "om-task-item");
  item.type = "button";
  item.dataset.omTask = panel.key;
  const name = panel.title?.() || panel.key;
  const minimised = panel.isMinimised();
  const front = !minimised && panel.el.classList.contains("om-float-active");
  if (!minimised) item.classList.add("om-task-on");
  if (front) {
    item.classList.add("om-task-front");
    item.setAttribute("aria-current", "true");
  }
  item.appendChild(taskIcon(panel));
  item.appendChild(el("span", "om-task-text", name));
  const shut = el("span", "om-task-x", "×");
  shut.title = "Close";
  shut.setAttribute("aria-hidden", "true");
  shut.addEventListener("pointerdown", (event) => event.stopPropagation());
  shut.addEventListener("click", (event) => {
    event.stopPropagation();
    event.preventDefault();
    panel.destroy();
  });
  item.appendChild(shut);
  item.setAttribute("aria-label", minimised ? `${name}, minimised` : name);
  liveTip(item, () => ({
    lead: name,
    facts: [
      ["State", panel.isMinimised() ? "Minimised"
        : (panel.el.classList.contains("om-float-active") ? "In front" : "Open")],
      ["Group", taskGroupName(panel.group)],
    ],
  }));
  item.onclick = () => {
    if (panel.isMinimised()) { panel.present(); return; }
    if (panel.el.classList.contains("om-float-active")) { panel.minimise(); return; }
    panel.present();
  };
  item.addEventListener("pointerdown", (event) => {
    if (event.button === 1) event.preventDefault();
  });
  item.addEventListener("auxclick", (event) => {
    if (event.button !== 1) return;
    event.preventDefault();
    panel.destroy();
  });
  item.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    closeTaskPop(false);
    openRowMenu(item, { items: taskOneMenu(panel), align: "left" });
  });
  return item;
}

function buildTaskGroup(entry) {
  const item = el("button", "om-task-item");
  item.type = "button";
  item.dataset.omGroup = entry.group;
  item._omEntry = entry;
  const label = taskGroupName(entry.group);
  const live = entry.members.filter((one) => !one.isMinimised());
  const front = entry.members.some((one) => !one.isMinimised()
    && one.el.classList.contains("om-float-active"));
  if (live.length) item.classList.add("om-task-on");
  if (front) {
    item.classList.add("om-task-front");
    item.setAttribute("aria-current", "true");
  }
  item.appendChild(entry.group === "pack"
    ? el("span", "om-task-glyph", "▤")
    : taskInitial(label));
  item.appendChild(el("span", "om-task-text", label));
  item.appendChild(el("span", "om-task-count", String(entry.members.length)));
  item.setAttribute("aria-haspopup", "menu");
  item.setAttribute("aria-expanded", "false");
  item.setAttribute("aria-label", `${label}, ${entry.members.length} windows`);
  item.addEventListener("pointerenter", (event) => {
    if (event.pointerType === "touch") return;
    clearTimeout(taskPopOut);
    taskPopOut = 0;
    clearTimeout(taskPopIn);
    taskPopIn = setTimeout(() => openTaskPop(item, entry, false), taskPop ? 0 : TASK_POP_IN);
  });
  item.addEventListener("pointerleave", () => {
    clearTimeout(taskPopIn);
    taskPopIn = 0;
    taskPopLater();
  });
  item.onclick = () => {
    if (taskPopFor === item) closeTaskPop(false);
    else openTaskPop(item, entry, false);
  };
  item.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    closeTaskPop(false);
    openRowMenu(item, { items: taskGroupMenu(entry), align: "left" });
  });
  return item;
}

function taskNodeFor(key) {
  if (!taskBar || !key) return null;
  const direct = taskBar.querySelector(`[data-om-task="${CSS.escape(key)}"]`);
  if (direct) return direct;
  const panel = floatPanels.get(key);
  return panel ? taskBar.querySelector(`[data-om-group="${CSS.escape(panel.group)}"]`) : null;
}

function onTaskKey(event) {
  const item = event.target instanceof Element
    ? event.target.closest(".om-task-item") : null;
  if (!item || !taskBar) return;
  const items = taskWalk();
  const at = items.indexOf(item);
  const go = (to) => {
    const next = items[Math.max(0, Math.min(items.length - 1, to))];
    if (!next) return;
    for (const one of items) one.tabIndex = one === next ? 0 : -1;
    next.focus();
    next.scrollIntoView({ block: "nearest", inline: "nearest" });
  };
  if (event.key === "ArrowRight") { event.preventDefault(); go(at + 1); return; }
  if (event.key === "ArrowLeft") { event.preventDefault(); go(at - 1); return; }
  if (event.key === "Home") { event.preventDefault(); go(0); return; }
  if (event.key === "End") { event.preventDefault(); go(items.length - 1); return; }
  if (event.key === "Escape") { closeTaskPop(true); return; }
  if (event.key === "Delete") {
    const panel = item.dataset.omTask ? floatingPanel(item.dataset.omTask) : null;
    if (panel) { event.preventDefault(); panel.destroy(); }
    return;
  }
  if (item._omEntry && (event.key === "Enter" || event.key === " " || event.key === "ArrowUp")) {
    event.preventDefault();
    openTaskPop(item, item._omEntry, true);
  }
}

function closeStart(back) {
  if (!startPanel) return;
  startPanel.remove();
  closeStartPop();
  startPanel = null;
  taskStart?.setAttribute("aria-expanded", "false");
  taskStart?.removeAttribute("aria-controls");
  if (back) taskStart?.focus();
}

function startRow(art, label, { pin = null, pinned = false, open }) {
  const row = el("div", "om-start-row");
  row.tabIndex = -1;
  row.setAttribute("role", "menuitem");
  row.appendChild(omIcon(art, { name: label, cls: "om-start-art", img: "om-start-img" }));
  row.appendChild(el("span", "om-start-name", label));
  if (pin) {
    const mark = el("button", "om-start-pin", pinned ? "On the desktop" : "Pin");
    mark.type = "button";
    mark.onclick = (event) => {
      event.stopPropagation();
      pin(!pinned);
      closeStart(false);
    };
    row.appendChild(mark);
  }
  row.addEventListener("pointerenter", () => {
    if (!row.closest(".om-start-pop")) closeStartPop();
  });
  row.onclick = () => { closeStart(false); open(); };
  row.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    closeStart(false);
    open();
  });
  return row;
}

let startPop = null;

function closeStartPop() {
  startPop?.remove();
  startPop = null;
}

const START_SETTINGS = new Set(["desksettings", "programs"]);

function startGroupOf(row) {
  const said = String(row.program?.group || "").trim();
  if (said) return said;
  return START_SETTINGS.has(row.key) ? "Settings" : "Programs";
}

function startProgramRow(row) {
  const label = row.desk?.label || row.label;
  return startRow(
    row.desk ? { kind: row.desk.kind, url: row.desk.art } : { kind: "mask", url: ICON_PROGRAM },
    label,
    {
      open: () => deskOpenRow(row),
      pinned: pinnedOn(row.key),
      pin: desktopOn() ? (on) => (on ? pinDesk(row.key) : unpinDesk(row.key)) : null,
    },
  );
}

function openStartPop(anchor, rows) {
  closeStartPop();
  if (!rows.length || !startPanel) return;
  startPop = el("div", "om-start om-start-pop");
  startPop.setAttribute("role", "menu");
  startPop.replaceChildren(...rows);
  document.body.appendChild(startPop);
  const from = anchor.getBoundingClientRect();
  const beside = startPanel.getBoundingClientRect();
  const box = startPop.getBoundingClientRect();
  const left = beside.right + box.width + 8 <= window.innerWidth
    ? beside.right + 2
    : Math.max(8, beside.left - box.width - 2);
  const top = Math.max(8, Math.min(from.top - 4, window.innerHeight - box.height - 8));
  startPop.style.left = `${Math.round(left)}px`;
  startPop.style.top = `${Math.round(top)}px`;
}

function startGroupRow(label, art, rows) {
  const row = el("div", "om-start-row om-start-group");
  row.tabIndex = -1;
  row.setAttribute("role", "menuitem");
  row.setAttribute("aria-haspopup", "menu");
  row.appendChild(omIcon(art, { name: label, cls: "om-start-art", img: "om-start-img" }));
  row.appendChild(el("span", "om-start-name", label));
  row.appendChild(el("span", "om-start-more", "›"));
  const show = () => openStartPop(row, rows);
  row.addEventListener("pointerenter", show);
  row.onclick = show;
  row.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " " || event.key === "ArrowRight") {
      event.preventDefault();
      show();
      startPop?.querySelector(".om-start-row")?.focus();
    }
  });
  return row;
}

function fillStart(list, want) {
  const text = want.trim().toLowerCase();
  const fits = (label) => !text || label.toLowerCase().includes(text);
  closeStartPop();

  const programs = managerDestinations()
    .filter((row) => row.kind === "program" && (!row.available || row.available()))
    .filter((row) => row.program?.surfaces?.start !== false);
  const docs = deskDocs.slice();
  const extras = [
    ["Trash", { kind: "mask", url: ICON_BIN }, () => openWastebasket()],
  ];

  if (text) {
    const rows = [];
    for (const row of programs.filter((one) => fits(one.desk?.label || one.label))) {
      rows.push(startProgramRow(row));
    }
    for (const one of docs.filter((one) => fits(one.name))) {
      rows.push(startRow(docArt(one), one.name, { open: () => openDoc(one) }));
    }
    for (const [label, art, open] of extras.filter(([label]) => fits(label))) {
      rows.push(startRow(art, label, { open }));
    }
    list.replaceChildren(...(rows.length
      ? rows
      : [el("div", "om-start-none", "Nothing here matches that.")]));
    return;
  }

  const drawers = new Map();
  for (const row of programs) {
    const name = startGroupOf(row);
    if (!drawers.has(name)) drawers.set(name, []);
    drawers.get(name).push(startProgramRow(row));
  }

  const rows = [];
  const named = [...drawers.keys()]
    .filter((one) => one !== "Programs" && one !== "Settings")
    .sort((a, b) => a.localeCompare(b));
  for (const name of ["Programs", ...named, "Settings"]) {
    const held = drawers.get(name);
    if (!held?.length) continue;
    rows.push(startGroupRow(name, { kind: "mask", url: START_ART[name] || ICON_PROGRAM }, held));
  }

  const deskRows = [
    ...docs.map((one) => startRow(docArt(one), one.name, { open: () => openDoc(one) })),
    ...extras.map(([label, art, open]) => startRow(art, label, { open })),
  ];
  if (deskRows.length) {
    rows.push(startGroupRow("Desktop", { kind: "mask", url: ICON_DESKTOP }, deskRows));
  }

  list.replaceChildren(...(rows.length
    ? rows
    : [el("div", "om-start-none", "Nothing here yet.")]));
}

function openStart() {
  if (!taskBar?.isConnected) return null;
  closeTaskPop(false);
  closeStart(false);
  startPanel = el("div", "om-start");
  startPanel.setAttribute("role", "menu");
  startPanel.setAttribute("aria-label", "Start");
  startPanel.id = `om-start-${Math.random().toString(36).slice(2, 8)}`;
  const find = el("input", "om-search om-start-find");
  find.placeholder = "Search";
  find.spellcheck = false;
  const list = el("div", "om-start-list");
  startPanel.appendChild(find);
  startPanel.appendChild(list);
  document.body.appendChild(startPanel);
  fillStart(list, "");
  placeRowMenu(startPanel, taskStart, "left");
  taskStart.setAttribute("aria-expanded", "true");
  taskStart.setAttribute("aria-controls", startPanel.id);
  find.addEventListener("input", () => {
    fillStart(list, find.value);
    placeRowMenu(startPanel, taskStart, "left");
  });
  startPanel.addEventListener("keydown", (event) => {
    const rows = [...list.querySelectorAll(".om-start-row")];
    const at = rows.indexOf(document.activeElement);
    if (event.key === "Escape") { event.preventDefault(); closeStart(true); return; }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      (rows[at + 1] || rows[0])?.focus();
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      (at <= 0 ? rows[rows.length - 1] : rows[at - 1])?.focus();
    }
  });
  if (desktopOn() && !deskDocs.length) {
    loadDeskDocs().then(() => { if (startPanel) fillStart(list, find.value); }).catch(() => {});
  }
  find.focus();
  return startPanel;
}

function taskWalk() {
  return [taskStart, ...(taskStrip ? taskStrip.children : [])].filter(Boolean);
}

function onTaskAway(event) {
  const target = event.target instanceof Element ? event.target : null;
  if (startPanel && !(target && (startPanel.contains(target) || startPop?.contains(target)
      || taskStart?.contains(target)))) {
    closeStart(false);
  }
  if (!taskPop) return;
  if (target && (taskPop.contains(target) || taskPopFor?.contains(target))) return;
  closeTaskPop(false);
}

function dropTaskbar() {
  closeTaskPop(false);
  closeStart(false);
  taskBar?.remove();
  taskBar = null;
  taskStart = null;
  taskStrip = null;
  setTaskRoom(0);
}

function mountTaskbar() {
  if (taskBar?.isConnected) return;
  const where = taskbarHost();
  taskBar = el("div", `om-task${where.flow ? "" : " om-task-pinned"}`);
  taskBar.setAttribute("role", "toolbar");
  taskBar.setAttribute("aria-label", "Open Manager windows");
  taskBar.setAttribute("aria-orientation", "horizontal");
  taskBar.addEventListener("keydown", onTaskKey);
  taskStart = el("button", "om-task-item om-task-start");
  taskStart.type = "button";
  taskStart.setAttribute("aria-label", "Start");
  taskStart.setAttribute("aria-haspopup", "menu");
  taskStart.setAttribute("aria-expanded", "false");
  taskStart.tabIndex = -1;
  taskStart.appendChild(omIcon({ kind: "src", url: ICON_BRAND },
                               { name: "Start", cls: "om-task-glyph", img: "om-task-icon" }));
  const startWord = el("span", "om-task-text", "Start");
  startWord.hidden = panelSetting("openManager.startLabel", false) !== true;
  taskStart.classList.toggle("om-task-start-bare", startWord.hidden);
  taskStart.appendChild(startWord);
  taskStart.onclick = () => (startPanel ? closeStart(true) : openStart());
  taskBar.appendChild(taskStart);
  taskStrip = el("div", "om-task-strip");
  taskBar.appendChild(taskStrip);
  taskStrip.addEventListener("wheel", (event) => {
    if (!event.deltaY || event.deltaX) return;
    event.preventDefault();
    taskStrip.scrollLeft += event.deltaY;
  }, { passive: false });
  where.host.insertBefore(taskBar, where.before);
  guardWindowDrags();
  watchTaskbarEdge();
  taskbarShow(!taskbarHides());
  matchStartWidth();
  if (taskWired) return;
  taskWired = true;
  document.addEventListener("pointerdown", onTaskAway, true);
  window.addEventListener("resize", () => { closeTaskPop(false); closeStart(false); });
}

function paintTaskbar() {
  if (!taskbarOn()) { dropTaskbar(); return; }
  const entries = taskEntries();
  const had = taskBar?.contains(document.activeElement)
    ? (document.activeElement.dataset.omTask || document.activeElement.dataset.omGroup || "")
    : "";
  const popped = taskPopFor?.dataset.omGroup || "";
  mountTaskbar();
  taskStrip.replaceChildren(...entries.map((entry) => (entry.members.length > 1
    ? buildTaskGroup(entry)
    : buildTaskOne(entry.members[0]))));
  setTaskRoom(taskBar.getBoundingClientRect().height);
  const front = taskStrip.querySelector('[aria-current="true"]')
    || taskStrip.firstElementChild || taskStart;
  for (const one of taskWalk()) one.tabIndex = one === front ? 0 : -1;
  const wanted = floatTakeFocus();
  const target = (wanted && taskNodeFor(wanted))
    || (had && (taskStrip.querySelector(`[data-om-task="${CSS.escape(had)}"]`)
      || taskStrip.querySelector(`[data-om-group="${CSS.escape(had)}"]`)));
  if (target) {
    for (const one of taskWalk()) one.tabIndex = one === target ? 0 : -1;
    target.focus();
    target.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  if (!popped) return;
  const again = entries.find((one) => one.group === popped && one.members.length > 1);
  const button = again && taskStrip.querySelector(`[data-om-group="${CSS.escape(popped)}"]`);
  if (!again || !button) { closeTaskPop(false); return; }
  taskPopFor = button;
  button.setAttribute("aria-expanded", "true");
  if (taskPop) button.setAttribute("aria-controls", taskPop.id);
  fillTaskPop(again);
}

let taskHideWired = false;

function matchStartWidth(tries = 12) {
  if (!taskStart) return;
  const tab = document.getElementById(DESK_TAB_ID);
  const wide = Math.round(tab?.getBoundingClientRect().width || 0);
  if (wide >= 24) {
    taskStart.style.setProperty("--om-start-wide", `${wide}px`);
    return;
  }
  if (tries > 0) requestAnimationFrame(() => matchStartWidth(tries - 1));
}

function taskbarHides() {
  return panelSetting("openManager.taskbarHide", false) === true;
}

function taskbarShow(on) {
  if (!taskBar) return;
  taskBar.classList.toggle("om-task-hidden", taskbarHides() && !on);
}

function watchTaskbarEdge() {
  if (taskHideWired) return;
  taskHideWired = true;
  let over = false;
  const near = (event) => {
    if (!taskBar || !taskbarHides()) return;
    const bar = taskBar.getBoundingClientRect();
    const reach = Math.max(28, bar.height);
    over = event.clientY >= window.innerHeight - reach;
    taskbarShow(over || !!startPanel);
  };
  document.addEventListener("pointermove", near, { passive: true });
  document.addEventListener("pointerleave", () => {
    over = false;
    if (!startPanel) taskbarShow(false);
  });
}

function taskbarSync() {
  matchStartWidth();
  if (taskDue) return;
  taskDue = requestAnimationFrame(() => { taskDue = 0; paintTaskbar(); });
}

function applyTaskbar() {
  const on = taskbarOn();
  closeTaskPop(false);
  if (!on) {
    const back = [...floatPanels.values()]
      .filter((one) => one.el.isConnected && one.isMinimised?.())
      .sort((a, b) => a.minimisedAt() - b.minimisedAt());
    for (const one of back) one.restore();
  }
  for (const button of document.querySelectorAll(".om-float-min")) {
    button.hidden = !on || !!button.closest(".om-backdrop");
  }
  paintTaskbar();
}

export { TASK_GROUP_NAMES, taskBar, startPanel, omIcon, closeStart, openStart, paintTaskbar, taskbarShow, taskbarSync, applyTaskbar };
