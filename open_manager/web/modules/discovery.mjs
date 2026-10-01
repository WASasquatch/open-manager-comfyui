import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import { API, ICON_TAB } from "./base.mjs";
import { el, openUrl, closeOn, toast, notify, askText, confirmAction } from "./ui.mjs";
import { remindRestart, restartServer, makeInstallControl, installFromRepo, uninstall } from "./installs.mjs";
import { asWindow, windowSize, createFloatingPanel, floatingPanel, closeFloatingPanel } from "./windows.mjs";
import { openRepoPack } from "./packs.mjs";
import { packIcon } from "./results.mjs";
import { renderInstalled } from "./installed.mjs";
import { renderMissing, sinceText, renderRegistry } from "./registry.mjs";
import { managerDestinations } from "./topbar.mjs";
import { lastMissingTypes } from "./extension.mjs";

function collectMissingNodeTypes() {
  const registered = window.LiteGraph?.registered_node_types || {};
  const types = new Set();
  for (const type of lastMissingTypes || []) {
    if (type && !registered[type]) types.add(type);
  }
  for (const node of app.graph?._nodes || []) {
    const type = node.type;
    if (type && !registered[type]) types.add(type);
  }
  return [...types];
}

let viewGeneration = 0;

function beginView() {
  return ++viewGeneration;
}

function viewIsCurrent(generation) {
  return generation === viewGeneration;
}

function refreshInstalledIfActive() {
  const active = document.querySelector(".om-nav-btn.active");
  const content = document.querySelector(".om-content");
  if (active && content && active.textContent === "Installed") renderInstalled(content);
}

function refreshMissingIfActive() {
  const active = document.querySelector(".om-nav-btn.active");
  const content = document.querySelector(".om-content");
  if (active && content && active.textContent === "Missing") renderMissing(content);
}

function openPanelWindow(view) {
  if (asWindow("manager")) {
    const panel = createFloatingPanel({
      key: "manager", title: "Node Discovery", ...windowSize("manager"), centred: true,
    });
    panel.setMaskIcon(ICON_TAB);
    const host = panel.body.querySelector(".om-side")
      || panel.body.appendChild(el("div"));
    renderSidebar(host, view);
    panel.raise();
    return panel.el;
  }

  const existing = document.querySelector(".om-backdrop .om-panel-window");
  if (existing) return existing;
  const backdrop = el("div", "om-backdrop");
  const dialog = el("div", "om-dialog om-panel-window");
  const close = el("button", "om-x", "×");
  close.title = "Close";
  close.onclick = () => backdrop.remove();
  dialog.appendChild(close);
  const host = el("div");
  dialog.appendChild(host);
  backdrop.appendChild(dialog);
  document.body.appendChild(backdrop);
  closeOn(backdrop);
  renderSidebar(host, view);
  return dialog;
}

function togglePanelWindow(view) {
  const shown = floatingPanel("manager");
  if (shown?.isMinimised?.()) { shown.present(); return shown.el; }
  if (shown) { closeFloatingPanel("manager"); return null; }
  const existing = document.querySelector(".om-backdrop .om-panel-window");
  if (existing) {
    existing.closest(".om-backdrop").remove();
    return null;
  }
  return openPanelWindow(view);
}

const HUB_MAIN = [["registry", "missing", "downloads", "library", "github"], ["installed"]];

const HUB_TOOLS = ["memory", "environment", "scan", "keys"];

const HUB_SIDE = ["about"];

const HUB_CHOICES = [
  { id: "openManager.managerEntry", prefix: "Extensions opens", options: ["auto", "panel", "classic"], fallback: "auto" },
  { id: "openManager.trustMode", prefix: "Trust", options: ["author", "action"], fallback: "author" },
  { id: "openManager.installPolicy", prefix: "Install policy", options: ["new", "upgrade", "downgrade", "all"], fallback: "new" },
];

function hubSetting(id, fallback) {
  try {
    const value = app.extensionManager?.setting?.get?.(id);
    return value === undefined || value === null ? fallback : value;
  } catch {
    return fallback;
  }
}

function hubStore(id, value) {
  try { app.extensionManager?.setting?.set?.(id, value); } catch {}
}

function hubChoice(choice) {
  const select = el("select", "om-hub-select");
  const now = String(hubSetting(choice.id, choice.fallback));
  for (const value of choice.options) {
    const option = el("option", null, `${choice.prefix}: ${value}`);
    option.value = value;
    option.selected = value === now;
    select.appendChild(option);
  }
  select.onchange = () => hubStore(choice.id, select.value);
  return select;
}

function hubCheck(id, label, fallback) {
  const row = el("label", "om-hub-check");
  const box = el("input");
  box.type = "checkbox";
  box.checked = hubSetting(id, fallback) !== false;
  box.onchange = () => hubStore(id, box.checked);
  row.appendChild(box);
  row.appendChild(el("span", null, label));
  return row;
}

function hubGroup(tag, buttons) {
  const group = el("div", "om-hub-group");
  group.appendChild(el("div", "om-hub-tag", tag));
  for (const button of buttons) group.appendChild(button);
  return group;
}

function openManagerMenu() {
  const existing = document.querySelector(".om-backdrop .om-hub");
  if (existing) { existing.closest(".om-backdrop").remove(); return null; }

  const backdrop = el("div", "om-backdrop");
  const dialog = el("div", "om-dialog om-hub");
  dialog.appendChild(el("div", "om-hub-title", "Open Manager Menu"));

  const destinations = managerDestinations();
  const byKey = new Map(destinations.map((one) => [one.key, one]));
  const placed = new Set();
  const button = (one) => {
    placed.add(one.key);
    const node = el("button", "om-hub-btn", one.label);
    if (one.hint) node.title = one.hint;
    node.onclick = () => { backdrop.remove(); one.open(); };
    return node;
  };
  const buttons = (keys) => keys.filter((key) => byKey.has(key)).map((key) => button(byKey.get(key)));

  const left = el("div", "om-hub-col");
  left.appendChild(hubCheck("openManager.windowManager", "Pack manager as a window", true));
  for (const choice of HUB_CHOICES) left.appendChild(hubChoice(choice));
  const tools = buttons(HUB_TOOLS);
  if (tools.length) left.appendChild(hubGroup("TOOLS", tools));

  const middle = el("div", "om-hub-col");
  for (const keys of HUB_MAIN) {
    const block = el("div", "om-hub-stack");
    for (const node of buttons(keys)) block.appendChild(node);
    if (block.childElementCount) middle.appendChild(block);
  }
  const restart = el("button", "om-hub-btn om-hub-danger", "Restart");
  restart.title = "Restart ComfyUI";
  restart.onclick = () => restartServer(restart);
  middle.appendChild(restart);

  const right = el("div", "om-hub-col");
  for (const node of buttons(HUB_SIDE)) right.appendChild(node);
  const programs = destinations.filter((one) => !placed.has(one.key)).map(button);
  if (programs.length) {
    const group = hubGroup("PROGRAMS", programs);
    group.classList.toggle("om-hub-group-pair", programs.length > 6);
    right.appendChild(group);
  }
  const status = el("div", "om-hub-status", "Reading the registry cache...");
  right.appendChild(status);

  const body = el("div", "om-hub-body");
  body.appendChild(left);
  body.appendChild(middle);
  body.appendChild(right);
  dialog.appendChild(body);

  const close = el("button", "om-hub-close", "Close");
  close.onclick = () => backdrop.remove();
  dialog.appendChild(close);

  backdrop.appendChild(dialog);
  document.body.appendChild(backdrop);
  closeOn(backdrop);

  (async () => {
    try {
      const info = await (await api.fetchApi(`${API}/catalog/state`)).json();
      status.textContent = info.cached
        ? `${(info.count || 0).toLocaleString()} packs · synced ${sinceText(info.fetched_at)}`
        : "No registry cache yet · open Custom Nodes Manager to sync";
    } catch {
      status.textContent = "The registry cache could not be read";
    }
  })();
  return dialog;
}

function addLegacyMenuButton() {
  try {
    const menu = app.ui?.menuContainer;
    if (!menu || menu.querySelector(".om-legacy-btn")) return false;
    const button = el("button", "om-legacy-btn", "Open Manager");
    button.title = "Browse the registry";
    button.onclick = openPanelWindow;
    menu.appendChild(button);
    return true;
  } catch {
    return false;
  }
}

const DRAWER_SHARE = 23;

const DRAWER_KEY = "om-drawer-share";

async function sizeDrawer(root) {
  let panel = null;
  let splitter = null;
  for (let attempt = 0; attempt < 40; attempt++) {
    panel = root.closest(".p-splitterpanel");
    splitter = panel?.closest(".p-splitter");
    if (panel && splitter && splitter.getBoundingClientRect().width > 0) break;
    if (!root.isConnected && attempt > 20) return;
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  if (!panel || !splitter) return;

  let saved = null;
  try { saved = parseFloat(localStorage.getItem(DRAWER_KEY)); } catch {}
  const share = Number.isFinite(saved) && saved > 0
    ? Math.min(90, Math.max(5, saved))
    : DRAWER_SHARE;
  panel.style.flexBasis = `calc(${share}% - 4px)`;

  let timer = null;
  const remember = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const found = /(-?[\d.]+)%/.exec(panel.style.flexBasis || "");
      const pct = found ? parseFloat(found[1]) : NaN;
      if (!Number.isFinite(pct) || pct <= 0) return;
      try { localStorage.setItem(DRAWER_KEY, String(pct)); } catch {}
    }, 300);
  };
  const watch = new MutationObserver(() => {
    if (!root.isConnected) { watch.disconnect(); return; }
    remember();
  });
  watch.observe(panel, { attributes: true, attributeFilter: ["style"] });
}

function renderSidebar(root, initial) {
  root.replaceChildren();
  root.className = "om-side";

  const nav = el("div", "om-nav");
  const content = el("div", "om-content");
  root.appendChild(nav);
  root.appendChild(content);
  sizeDrawer(root);

  const views = {
    registry: { label: "Registry", render: () => renderRegistry(content) },
    installed: { label: "Installed", render: () => renderInstalled(content) },
    github: { label: "GitHub", render: () => renderGithub(content) },
    missing: { label: "Missing", render: () => renderMissing(content) },
  };
  const buttons = {};
  const select = (key) => {
    for (const other of Object.keys(buttons)) buttons[other].classList.toggle("active", other === key);
    beginView();
    views[key].render();
  };
  for (const [key, view] of Object.entries(views)) {
    const button = el("button", "om-nav-btn", view.label);
    button.onclick = () => select(key);
    buttons[key] = button;
    nav.appendChild(button);
  }

  const more = el("button", "om-nav-btn om-nav-more", "\u22ef");
  more.title = "Open Manager Menu";
  more.onclick = () => openManagerMenu();
  nav.appendChild(more);
  select(Object.hasOwn(views, initial ?? "") ? initial : "registry");
}

async function renderGithub(container) {
  const generation = viewGeneration;
  container.replaceChildren();

  const controls = el("div", "om-side-controls");
  const addButton = el("button", "om-btn om-go", "Add repository");
  addButton.title = "Add a GitHub repository to this list";
  addButton.onclick = () => addGithubSource(container);
  controls.appendChild(addButton);
  container.appendChild(controls);

  const status = el("div", "om-side-status", "Reading your repositories...");
  const list = el("div", "om-side-list");
  container.appendChild(status);
  container.appendChild(list);

  let data;
  try {
    const answer = await api.fetchApi(`${API}/github`);
    data = await answer.json();
    if (!answer.ok) throw new Error(`HTTP ${answer.status}`);
  } catch (error) {
    status.textContent = `Could not read your repositories: ${error.message}`;
    return;
  }
  if (!viewIsCurrent(generation)) return;

  const repos = data.repos || [];
  if (!repos.length) {
    status.textContent = "No repositories yet.";
    return;
  }
  status.textContent = `${repos.length} repositor${repos.length === 1 ? "y" : "ies"}`;
  for (const repo of repos) list.appendChild(buildGithubRow(repo, container));
}

function buildGithubRow(repo, container) {
  const row = el("div", "om-side-row");
  row.appendChild(packIcon("", repo.name));

  const text = el("div", "om-side-text");
  text.appendChild(el("div", "om-side-name", repo.name));
  const meta = el("div", "om-side-meta");
  meta.appendChild(document.createTextNode(`${repo.owner}/${repo.name}`));
  if (repo.installed_version) {
    meta.appendChild(el("span", "om-upd", repo.installed_version));
    if (repo.dir && repo.dir !== repo.name) meta.appendChild(el("span", "om-disabled", repo.dir));
  }
  text.appendChild(meta);
  const pack = { repo: repo.url, title: repo.name, classes: [] };
  text.onclick = () => openRepoPack(pack);
  row.appendChild(text);

  const items = [
    { label: "Open on GitHub", fn: () => openUrl(repo.url) },
    { label: "Remove from list", danger: true, fn: () => removeGithubSource(repo, container) },
  ];
  if (repo.installed_version) {
    items.unshift({ label: "Reinstall", fn: () => installFromRepo(pack, control) });
    items.unshift({
      label: "Uninstall",
      danger: true,
      fn: () => uninstall({
        packId: repo.dir || repo.name,
        entry: { name: repo.name },
        control,
        rowsRoot: row,
      }),
    });
  }
  const control = makeInstallControl({
    packId: repo.name,
    entry: { name: repo.name },
    rowsRoot: row,
    withMenu: true,
    items,
    onInstall: () => installFromRepo(pack, control),
  });
  if (repo.installed_version) control.setInstalled();
  else control.setInstall();
  control.el.classList.add("om-side-ictl");
  row.appendChild(control.el);
  return row;
}

async function addGithubSource(container) {
  const url = await askText("Add a GitHub repository", "", "Add");
  if (!url) return;
  let result;
  try {
    const answer = await api.fetchApi(`${API}/github`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    result = await answer.json();
  } catch (error) {
    result = { ok: false, reason: error.message };
  }
  if (!result.ok) { notify("Could not add the repository", result.reason); return; }
  toast(`Added ${result.repo.owner}/${result.repo.name}.`, { kind: "ok" });
  renderGithub(container);
}

async function removeGithubSource(repo, container) {
  const installed = !!repo.installed_version;
  const ok = await confirmAction(
    `Remove ${repo.name}`,
    installed
      ? `This takes ${repo.owner}/${repo.name} off your list and uninstalls it from custom_nodes.`
      : `This takes ${repo.owner}/${repo.name} off your list.`,
    "Remove", true);
  if (!ok) return;
  const progress = toast(`Removing ${repo.name}...`, { sticky: true });
  let result;
  try {
    const answer = await api.fetchApi(`${API}/github/remove`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: repo.url }),
    });
    result = await answer.json();
  } catch (error) {
    result = { ok: false, reason: error.message };
  }
  if (!result.ok) { progress.remove(); notify("Could not remove the repository", result.reason); return; }
  progress.settle(
    result.uninstalled ? `Removed and uninstalled ${repo.name}.` : `Removed ${repo.name}.`, "ok", 6000);
  if (result.reason) notify("Uninstall failed", result.reason);
  if (result.uninstalled) remindRestart();
  renderGithub(container);
}

export { collectMissingNodeTypes, viewGeneration, viewIsCurrent, refreshInstalledIfActive, refreshMissingIfActive, openPanelWindow, togglePanelWindow, openManagerMenu, addLegacyMenuButton, renderSidebar };
