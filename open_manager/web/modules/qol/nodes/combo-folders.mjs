const OVERLAY = '[data-testid="widget-select-default-overlay"]';

const VIEWPORT = '[data-testid="widget-select-default-viewport"]';

const SEARCH = '[data-testid="widget-select-default-search-input"]';

const WRAPPER = "[data-reka-popper-content-wrapper]";

const OPTIONS = ':scope > [role="option"]';

const MODE = "data-om-folders";

const SPLIT = /[\\/]+/;

const FILE = /\.[A-Za-z0-9]{1,12}$/;

const OPEN_DELAY = 90;

const CLOSE_DELAY = 220;

const GAP = 2;

const EDGE = 8;

const WAIT_FRAMES = 10;

const KEYS = new Set(["ArrowDown", "ArrowUp", "ArrowRight", "ArrowLeft", "Enter"]);

const RULES = `[${MODE}] > [role="option"], [${MODE}] > [role="status"] { display: none !important; }
.om-combo-tree { display: contents; }
.om-combo-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.om-combo-side { flex: none; display: flex; align-items: center; gap: 6px; opacity: 0.6; }
.om-combo-fly { position: fixed; z-index: 3001; display: flex; flex-direction: column;
  max-width: min(560px, 50vw); }
.om-combo-fly > .om-combo-menu { overflow-y: auto; }`;

let sheet = null;

let watcher = null;

let open = null;

function labelOf(option) {
  return option.getAttribute("textvalue") ?? option.textContent.trim();
}

function optionsOf(viewport) {
  return [...viewport.querySelectorAll(OPTIONS)].map((el) => ({
    el,
    label: labelOf(el),
    checked: el.getAttribute("data-state") === "checked",
  }));
}

function foldered(options) {
  return options.some((one) => SPLIT.test(one.label)) && options.some((one) => FILE.test(one.label));
}

function build(options) {
  const root = { name: "", entries: [], folders: new Map(), size: 0, holds: false };
  for (const option of options) {
    const parts = option.label.split(SPLIT).filter(Boolean);
    let at = root;
    for (const part of parts.slice(0, -1)) {
      let next = at.folders.get(part);
      if (!next) {
        next = { name: part, entries: [], folders: new Map(), size: 0, holds: false };
        at.folders.set(part, next);
        at.entries.push({ folder: next });
      }
      at = next;
      at.size += 1;
      if (option.checked) at.holds = true;
    }
    at.entries.push({ option, name: parts.at(-1) || option.label });
  }
  arrange(root);
  return root;
}

function rank(entry) {
  if (entry.folder) return 1;
  return FILE.test(entry.name) ? 2 : 0;
}

function arrange(folder) {
  folder.entries.sort((a, b) => rank(a) - rank(b));
  for (const child of folder.folders.values()) arrange(child);
}

function later(session, run, delay) {
  const timer = setTimeout(() => {
    session.timers.delete(timer);
    if (open === session) run();
  }, delay);
  session.timers.add(timer);
}

function hush(session) {
  for (const timer of session.timers) clearTimeout(timer);
  session.timers.clear();
}

function highlight(session, depth, row) {
  const menu = session.menus[depth];
  if (!menu) return;
  for (const one of menu.rows) {
    if (one === row) one.setAttribute("data-highlighted", "");
    else one.removeAttribute("data-highlighted");
  }
  menu.at = menu.rows.indexOf(row);
  session.focus = depth;
}

function closeFrom(session, depth) {
  const from = Math.max(1, depth);
  for (let at = session.menus.length - 1; at >= from; at -= 1) session.menus[at].el.remove();
  if (session.menus.length > from) session.menus.length = from;
  if (session.focus >= from) session.focus = from - 1;
}

function pick(session, label) {
  const target = optionsOf(session.viewport).find((one) => one.label === label);
  if (!target) return;
  closeFrom(session, 1);
  target.el.click();
}

function place(fly, anchor) {
  const at = anchor.getBoundingClientRect();
  const size = fly.getBoundingClientRect();
  let left = at.right + GAP;
  if (left + size.width > innerWidth - EDGE) left = Math.max(EDGE, at.left - GAP - size.width);
  const list = fly.firstElementChild;
  const inset = fly.clientTop + (parseFloat(getComputedStyle(list).paddingTop) || 0);
  let top = at.top - inset;
  if (top + size.height > innerHeight - EDGE) top = Math.max(EDGE, innerHeight - EDGE - size.height);
  fly.style.left = `${left}px`;
  fly.style.top = `${top}px`;
  fly.style.visibility = "";
}

function openFolder(session, folder, anchor, depth) {
  if (session.menus[depth]?.folder === folder) {
    closeFrom(session, depth + 1);
    return session.menus[depth];
  }
  closeFrom(session, depth);
  const fly = document.createElement("div");
  fly.className = `${session.overlay.className} om-combo-fly`;
  fly.setAttribute("data-capture-wheel", "true");
  fly.style.visibility = "hidden";
  fly.style.left = "0px";
  fly.style.top = "0px";
  const list = document.createElement("div");
  list.className = `${session.viewport.className} om-combo-menu`;
  list.style.maxHeight = `${innerHeight - EDGE * 2 - 2}px`;
  const rows = folder.entries.map((entry) => row(session, entry, depth));
  list.append(...rows);
  fly.append(list);
  fly.addEventListener("pointerdown", (event) => event.stopPropagation());
  fly.addEventListener("mousedown", (event) => event.preventDefault());
  fly.addEventListener("pointerenter", () => hush(session));
  list.addEventListener("scroll", () => closeFrom(session, depth + 1), { passive: true });
  document.body.append(fly);
  const menu = { folder, el: fly, list, rows, at: -1 };
  session.menus[depth] = menu;
  place(fly, anchor);
  return menu;
}

function row(session, entry, depth) {
  const el = document.createElement("div");
  el.className = `${session.rowClass} om-combo-row`;
  const name = document.createElement("span");
  name.className = "om-combo-name";
  name.textContent = entry.folder ? entry.folder.name : entry.name;
  el.append(name);
  if (entry.folder) {
    const side = document.createElement("span");
    side.className = "om-combo-side";
    for (const text of [String(entry.folder.size), "›"]) {
      const part = document.createElement("span");
      part.textContent = text;
      side.append(part);
    }
    el.append(side);
    if (entry.folder.holds) el.dataset.state = "checked";
  } else {
    el.title = entry.option.label;
    if (entry.option.checked) {
      el.dataset.state = "checked";
      if (session.check) el.append(session.check.cloneNode(true));
    }
  }
  el.addEventListener("mousedown", (event) => event.preventDefault());
  el.addEventListener("pointerenter", () => {
    hush(session);
    highlight(session, depth, el);
    if (entry.folder) later(session, () => openFolder(session, entry.folder, el, depth + 1), OPEN_DELAY);
    else if (session.menus.length > depth + 1) later(session, () => closeFrom(session, depth + 1), CLOSE_DELAY);
  });
  el.addEventListener("click", (event) => {
    event.stopPropagation();
    hush(session);
    if (entry.folder) openFolder(session, entry.folder, el, depth + 1);
    else pick(session, entry.option.label);
  });
  el.omEntry = entry;
  return el;
}

function clear(session) {
  hush(session);
  closeFrom(session, 1);
  session.tree?.remove();
  session.tree = null;
  session.menus = [];
  session.focus = 0;
  session.viewport.removeAttribute(MODE);
}

function refresh(session) {
  if (open !== session) return;
  clear(session);
  if (session.input?.value.trim()) return;
  const options = optionsOf(session.viewport);
  if (!options.length || !foldered(options)) return;
  session.rowClass = options[0].el.className;
  session.check = options.find((one) => one.checked)?.el.querySelector(':scope > [aria-hidden="true"]')
    ?.cloneNode(true) || null;
  const root = build(options);
  const tree = document.createElement("div");
  tree.className = "om-combo-tree";
  const rows = root.entries.map((entry) => row(session, entry, 0));
  tree.append(...rows);
  session.viewport.prepend(tree);
  session.viewport.setAttribute(MODE, "");
  session.tree = tree;
  session.menus = [{ folder: root, el: session.viewport, list: session.viewport, rows, at: -1 }];
  rows.find((one) => one.dataset.state === "checked")?.scrollIntoView({ block: "nearest" });
}

function step(session, by) {
  const menu = session.menus[session.focus];
  if (!menu?.rows.length) return;
  const count = menu.rows.length;
  const next = menu.at < 0 ? (by > 0 ? 0 : count - 1) : (menu.at + by + count) % count;
  closeFrom(session, session.focus + 1);
  highlight(session, session.focus, menu.rows[next]);
  menu.rows[next].scrollIntoView({ block: "nearest" });
}

function enter(session) {
  const depth = session.focus;
  const menu = session.menus[depth];
  const current = menu?.rows[menu.at];
  if (!current) return false;
  const entry = current.omEntry;
  if (!entry.folder) {
    pick(session, entry.option.label);
    return true;
  }
  const child = openFolder(session, entry.folder, current, depth + 1);
  if (child?.rows.length) highlight(session, depth + 1, child.rows[0]);
  return true;
}

function key(session, event) {
  if (!session.viewport.hasAttribute(MODE) || !KEYS.has(event.key)) return;
  event.preventDefault();
  event.stopPropagation();
  hush(session);
  if (event.key === "ArrowDown") step(session, 1);
  else if (event.key === "ArrowUp") step(session, -1);
  else if (event.key === "ArrowLeft") {
    if (session.focus > 0) closeFrom(session, session.focus);
  } else {
    const menu = session.menus[session.focus];
    const current = menu?.rows[menu.at];
    if (event.key === "Enter" || current?.omEntry.folder) enter(session);
  }
}

function detach(session) {
  if (!session) return;
  clear(session);
  session.input?.removeEventListener("input", session.onInput);
  session.overlay.removeEventListener("keydown", session.onKey, true);
  if (open === session) open = null;
}

function attach(overlay) {
  const viewport = overlay.querySelector(VIEWPORT);
  if (!viewport) return;
  detach(open);
  const session = {
    overlay, viewport, input: overlay.querySelector(SEARCH), menus: [], timers: new Set(),
    focus: 0, tree: null, rowClass: "", check: null,
  };
  session.onInput = () => requestAnimationFrame(() => refresh(session));
  session.onKey = (event) => key(session, event);
  session.input?.addEventListener("input", session.onInput);
  overlay.addEventListener("keydown", session.onKey, true);
  open = session;
  refresh(session);
}

function settle(overlay, frames = 0) {
  if (!overlay.isConnected) return;
  const viewport = overlay.querySelector(VIEWPORT);
  if (viewport?.querySelector(OPTIONS) || frames >= WAIT_FRAMES) {
    attach(overlay);
    return;
  }
  requestAnimationFrame(() => settle(overlay, frames + 1));
}

function seen(records) {
  for (const record of records) {
    for (const node of record.addedNodes) {
      if (node.nodeType !== 1 || !node.matches(WRAPPER)) continue;
      const overlay = node.querySelector(OVERLAY);
      if (overlay) settle(overlay);
    }
    if (!open) continue;
    for (const node of record.removedNodes) {
      if (node.nodeType === 1 && node.contains(open.overlay)) detach(open);
    }
  }
}

export default {
  key: "qolComboFolders",
  name: "Combo lists open folders as submenus",
  tooltip: "On Nodes 2.0, a combo of files kept in folders is one long flat list. On, each folder "
    + "opens as a submenu, and typing still searches every file.",
  issues: [],
  defaultValue: true,
  verified: "1.55.18",
  check() {
    return document.body && typeof MutationObserver === "function" ? "" : "the page is not ready";
  },
  on(track) {
    sheet = document.createElement("style");
    sheet.textContent = RULES;
    document.head.appendChild(sheet);
    watcher = new MutationObserver(seen);
    watcher.observe(document.body, { childList: true });
    const already = document.querySelector(`${WRAPPER} ${OVERLAY}`);
    if (already) settle(already);
    track(() => {
      watcher?.disconnect();
      watcher = null;
      detach(open);
      sheet?.remove();
      sheet = null;
    });
  },
};
