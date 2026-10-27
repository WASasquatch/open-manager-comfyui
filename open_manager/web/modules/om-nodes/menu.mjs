import { piniaStores } from "../qol/shared.mjs";

const BUTTON = '[data-testid="comfy-menu-button"]';
const NODES2 = '[data-testid="nodes-2-toggle-item"]';
const OURS = "om-nodes-toggle-item";
const ROW_ID = "om-nodes-menu-row";
const STYLE_ID = "om-nodes-menu";
const SEARCH_FRAMES = 30;
const CHECKBOX = '[role="menuitemcheckbox"]';
const LABEL = "OM Nodes";
const ITEM_KEY = "om-nodes-toggle";
const NEW_MENU_SINCE = [1, 57, 0];

const STYLE = `
ul[data-om-nodes-focus] > li.p-focus:not([data-om-nodes-row]) > .p-tieredmenu-item-content {
  background: transparent;
  color: inherit;
}
`;

let hooks = null;
let searching = 0;
const watched = new WeakSet();

function paint(row, on) {
  const state = on ? "checked" : "unchecked";
  row.setAttribute("aria-checked", String(on));
  for (const part of row.querySelectorAll("[data-state]")) part.setAttribute("data-state", state);
  for (const part of row.querySelectorAll("[aria-checked]")) part.setAttribute("aria-checked", String(on));
}

function toggle(row) {
  const next = !hooks.isOn();
  paint(row, next);
  Promise.resolve(hooks.setOn(next)).finally(() => paint(row, hooks.isOn()));
}

function focusRow(list, row, on) {
  row.classList.toggle("p-focus", on);
  if (on) {
    list.setAttribute("data-om-nodes-focus", "");
    if (!list.hasAttribute("data-om-nodes-was")) {
      list.setAttribute("data-om-nodes-was", list.getAttribute("aria-activedescendant") || "");
    }
    list.setAttribute("aria-activedescendant", ROW_ID);
    return;
  }
  list.removeAttribute("data-om-nodes-focus");
  if (list.hasAttribute("data-om-nodes-was")) {
    const was = list.getAttribute("data-om-nodes-was");
    if (was) list.setAttribute("aria-activedescendant", was);
    list.removeAttribute("data-om-nodes-was");
  }
}

function focusedItem(list) {
  return [...list.children].find((li) => li.classList.contains("p-focus")
    && !li.hasAttribute("data-om-nodes-row")) || null;
}

function nextItem(row) {
  let next = row.nextElementSibling;
  while (next && (next.getAttribute("role") === "separator" || next.classList.contains("p-tieredmenu-separator"))) {
    next = next.nextElementSibling;
  }
  return next;
}

function watchKeys(list) {
  if (watched.has(list)) return;
  watched.add(list);
  list.addEventListener("keydown", (event) => {
    const current = list.querySelector("[data-om-nodes-row]");
    if (!current) return;
    const ours = current.classList.contains("p-focus");
    const focused = focusedItem(list);
    if (ours) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        event.stopImmediatePropagation();
        toggle(current);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
      focusRow(list, current, false);
      return;
    }
    if (event.key === "ArrowDown" && focused?.querySelector(NODES2)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      focusRow(list, current, true);
      return;
    }
    if (event.key === "ArrowUp" && focused && focused === nextItem(current)) {
      setTimeout(() => {
        if (focusedItem(list)?.querySelector(NODES2)) focusRow(list, current, true);
      }, 0);
    }
  }, true);
  list.addEventListener("pointermove", () => {
    const current = list.querySelector("[data-om-nodes-row]");
    if (current?.classList.contains("p-focus")) focusRow(list, current, false);
  }, { passive: true });
}

function build(item) {
  const row = item.cloneNode(true);
  row.removeAttribute("id");
  for (const part of row.querySelectorAll("[id]")) part.removeAttribute("id");
  row.id = ROW_ID;
  row.classList.remove("p-focus");
  row.setAttribute("data-om-nodes-row", "");
  row.removeAttribute("data-p-focused");
  row.setAttribute("aria-label", "OM Nodes");
  const inner = row.querySelector(NODES2);
  if (inner) inner.setAttribute("data-testid", OURS);
  const label = row.querySelector(".p-menubar-item-label");
  if (label) label.textContent = "OM Nodes";
  row.addEventListener("mousedown", (event) => event.preventDefault());
  row.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggle(row);
  });
  paint(row, hooks.isOn());
  return row;
}

function labelled(label) {
  return [...document.querySelectorAll(CHECKBOX)].find((one) => one.getAttribute("aria-label") === label)
    || null;
}

function register() {
  const items = piniaStores()?.get("menuItem")?.menuItems;
  if (!Array.isArray(items)) return false;
  if (!items.some((item) => item?.key === ITEM_KEY)) {
    items.push({
      key: ITEM_KEY,
      label: LABEL,
      presentation: "switch",
      class: "select-none",
      checked: () => hooks.isOn(),
      command: () => {
        void hooks.setOn(!hooks.isOn());
      },
    });
  }
  return true;
}

function placeItem() {
  const anchor = labelled("Nodes 2.0");
  if (!anchor) return false;
  const row = labelled(LABEL);
  if (!row) {
    register();
    return false;
  }
  if (anchor.nextElementSibling !== row) anchor.after(row);
  return true;
}

function newMenuExpected() {
  const parts = String(window.__COMFYUI_FRONTEND_VERSION__ || "").split(".").map(Number);
  for (let i = 0; i < NEW_MENU_SINCE.length; i += 1) {
    const have = parts[i] || 0;
    if (have !== NEW_MENU_SINCE[i]) return have > NEW_MENU_SINCE[i];
  }
  return true;
}

function place() {
  const anchor = document.querySelector(NODES2);
  const item = anchor?.closest("li");
  if (!item) return placeItem();
  const next = item.nextElementSibling;
  if (next?.hasAttribute("data-om-nodes-row")) {
    paint(next, hooks.isOn());
    return true;
  }
  const row = build(item);
  item.after(row);
  const list = item.parentElement;
  if (list) watchKeys(list);
  return true;
}

function search() {
  searching += 1;
  if (place() || searching > SEARCH_FRAMES) {
    searching = 0;
    return;
  }
  requestAnimationFrame(search);
}

function onClick(event) {
  const target = event.target;
  if (!(target instanceof Element) || !target.closest(BUTTON)) return;
  if (searching) return;
  requestAnimationFrame(search);
}

export function refreshMenuRow() {
  if (!hooks) return;
  const row = document.querySelector("[data-om-nodes-row]");
  if (row) paint(row, hooks.isOn());
}

export function watchMenu(isOn, setOn) {
  if (hooks) return;
  hooks = { isOn, setOn };
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = STYLE;
    document.head.appendChild(style);
  }
  document.addEventListener("click", onClick, true);
  if (newMenuExpected()) register();
}
