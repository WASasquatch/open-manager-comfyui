import { api } from "../../../scripts/api.js";
import { ICON_TAB, ICON_PROGRAM, ICON_MEMORY, ICON_DOWNLOADS, ICON_LIBRARY, ICON_DESKTOP, ICON_FOLDER, ICON_NOTE } from "./base.mjs";
import { el } from "./ui.mjs";
import { openEnvironmentDialog } from "./installs.mjs";
import { openAboutDialog, openKeysDialog, vtReady, panelSetting } from "./settings.mjs";
import { openPanelWindow } from "./discovery.mjs";
import { openDownloadManager } from "./downloads.mjs";
import { filesOn, programRows } from "./programs.mjs";
import { buildMonitorStrip, startMonitor, stopMonitor } from "./monitor.mjs";
import { mountTabMarks } from "./tab-marks.mjs";
import { mountSnapshotTabs } from "./snapshots.mjs";
import { taskbarSync } from "./taskbar.mjs";
import { draftNote, openNote } from "./desk-docs.mjs";
import { runBar, mountRunBar } from "./runbar.mjs";
import { mountPauseButton, wirePause } from "./pause.mjs";
import { openMemoryPanel } from "./memory.mjs";
import { openManagePrograms, openDesktopSettings } from "./desk-settings.mjs";
import { openFileBrowser } from "./files.mjs";
import { openModelLibrary } from "./library.mjs";
import { topbarReady } from "./extension.mjs";

function topbarSlot() {
  const strip = document.querySelector(".workflow-tabs-container.pointer-events-auto")?.firstElementChild;
  if (!strip) return null;
  if (!strip.classList.contains("workflow-tabs-container")) {
    return [...strip.children].find((child) => !String(child.className).includes("workflow-tabs-container"))
      || null;
  }
  return strip.querySelector(":scope > .new-blank-workflow-button")?.nextElementSibling?.firstElementChild
    || null;
}

function buttonHost(slot) {
  if (panelSetting("openManager.buttonPlacement", "topbar") === "control") {
    const bar = document.querySelector(".actionbar-container");
    if (bar) {
      const group = bar.querySelector(".flex.gap-2") || bar.firstElementChild || bar;
      return { host: group, before: group.firstChild, icons: true };
    }
  }
  return slot ? { host: slot, before: slot.firstChild, icons: false } : null;
}

let legacyUi = false;

async function readLegacyUi() {
  try {
    const stats = await (await api.fetchApi("/system_stats")).json();
    const argv = stats?.system?.argv || [];
    legacyUi = argv.some((one) => String(one).includes("enable-manager-legacy-ui"));
  } catch {
    legacyUi = false;
  }
  return legacyUi;
}

function managerEntry() {
  const asked = String(panelSetting("openManager.managerEntry", "auto") || "auto");
  if (asked === "classic" || asked === "panel") return asked;
  return legacyUi ? "classic" : "panel";
}

function managerDestinations() {
  return [
    { key: "registry", kind: "program", label: "Custom Nodes Manager", icon: "\u25a4",
      hint: "Browse and install from the Comfy Registry",
      desk: { at: 0, label: "Node Discovery", art: ICON_TAB, kind: "mask", window: "manager" },
      open: () => openPanelWindow("registry") },
    { key: "missing", kind: "action", label: "Install Missing Custom Nodes", icon: "\u26a0",
      hint: "The packs supplying the node types this workflow is missing",
      open: () => openPanelWindow("missing") },
    { key: "github", kind: "action", label: "Install via Git URL", icon: "\u2325",
      hint: "Repositories you add by URL, kept across uninstalls",
      open: () => openPanelWindow("github") },
    { key: "installed", kind: "action", label: "Check for Updates", icon: "\u21bb",
      hint: "What is installed, and what has a newer version",
      open: () => openPanelWindow("installed") },
    { key: "downloads", kind: "program", label: "Download Manager", short: "Downloads", icon: "\u2b73",
      cls: "om-dl-downloads",
      hint: "Download Manager: fetch the models a workflow needs",
      desk: { at: 2, label: "Download Manager", art: ICON_DOWNLOADS, kind: "mask",
              window: "downloads" },
      open: openDownloadManager,
      button: () => panelSetting("openManager.downloadButton", true) !== false },
    { key: "library", kind: "program", label: "Model Library", short: "Models", icon: "\u25a4",
      cls: "om-lib-open",
      hint: "Model Library: what is on disk, and what is there twice",
      desk: { at: 3, label: "Model Library", art: ICON_LIBRARY, kind: "mask",
              window: "library" },
      open: openModelLibrary,
      available: () => panelSetting("openManager.modelLibrary", true) !== false,
      button: () => panelSetting("openManager.modelLibrary", true) !== false },
    { key: "notepad", kind: "program", label: "Notepad",
      icon: "✎",
      hint: "A blank note",
      desk: { at: 3, label: "Notepad", art: ICON_NOTE, kind: "mask", window: "", off: true },
      open: () => openNote(draftNote()) },
    { key: "desksettings", kind: "program", label: "Desktop Settings", icon: "⚙",
      hint: "The wallpaper, the icons, the windows and the programs",
      desk: { at: 4, label: "Desktop Settings", art: ICON_DESKTOP, kind: "mask",
              window: "desktop", off: true },
      open: () => openDesktopSettings() },
    { key: "documents", kind: "program", label: "Documents", icon: "▤",
      hint: "Somewhere of your own to keep things",
      revisit: true,
      desk: { at: 1, label: "Documents", art: ICON_FOLDER, kind: "mask", window: "files" },
      available: () => filesOn(),
      open: () => openFileBrowser("docs:documents", "") },
    { key: "files", kind: "program", label: "Folders", icon: "▧",
      hint: "Every folder: the notes, the input, output and temp directories, and the models",
      revisit: true,
      desk: { at: 6, label: "Folders", art: ICON_FOLDER, kind: "mask",
              window: "files", off: true },
      available: () => filesOn(),
      open: () => openFileBrowser() },
    { key: "programs", kind: "program", label: "Manage Programs", icon: "▦",
      hint: "Everything installed, what it declares, and whether it is switched on",
      desk: { at: 5, label: "Manage Programs", art: ICON_PROGRAM, kind: "mask",
              window: "programs", off: true },
      open: () => openManagePrograms() },
    { key: "memory", kind: "program", label: "Memory", short: "Memory", icon: "\u25a6",
      cls: "om-mem-open",
      hint: "Memory: what is loaded, what it weighs, and where it sits",
      desk: { at: 1, label: "Memory", art: ICON_MEMORY, kind: "mask", window: "memory" },
      open: openMemoryPanel,
      button: () => panelSetting("openManager.memoryButton", true) !== false },
    { key: "scan", kind: "action", label: "Scan an Install", icon: "\u2691",
      hint: "Each installed pack's menu offers a VirusTotal scan of the files it ships",
      open: () => openPanelWindow("installed"),
      available: vtReady },
    { key: "environment", kind: "action", label: "Environment changes", icon: "\u2317",
      hint: "What recent installs did to your Python packages, and how to undo one",
      open: openEnvironmentDialog },
    { key: "about", kind: "action", label: "About and updates", icon: "\u2139",
      hint: "Which Open Manager this is, and what updating it takes here",
      open: openAboutDialog },
    { key: "keys", kind: "action", label: "Access keys", icon: "\u26bf",
      hint: "Hugging Face, GitHub and VirusTotal keys",
      open: openKeysDialog },
  ].concat(programRows)
    .filter((one) => (!Object.hasOwn(one, "available") || one.available()));
}

function mountTopbar(attempt = 0) {
  const slot = topbarSlot();
  if (!slot) {
    if (attempt < 40) setTimeout(() => mountTopbar(attempt + 1), 500);
    return false;
  }
  const where = buttonHost(slot);
  const make = (cls, icon, label, title, onclick) => {
    if (document.querySelector(`.${cls}`)) return null;
    const button = el("button", `om-dl-open ${cls}${where.icons ? " om-dl-open-icons" : ""}`);
    button.title = title;
    button.appendChild(el("span", "om-dl-open-icon", icon));
    button.appendChild(el("span", "om-dl-open-text", label));
    button.onclick = onclick;
    return button;
  };

  const wanted = managerDestinations()
    .filter((one) => one.cls && one.button && one.button())
    .map((one) => make(one.cls, one.icon, one.short || one.label, one.hint, one.open));
  for (const button of wanted) {
    if (button) where.host.insertBefore(button, where.before);
  }
  mountMonitor(slot);
  mountRunBar();
  mountTabMarks();
  mountSnapshotTabs();
  wirePause();
  mountPauseButton();
  return true;
}

function remountTopbar() {
  if (!topbarReady) return;
  stopMonitor();
  monitorStrip = null;
  document.querySelectorAll(".om-dl-open, .om-mon, .om-prog, .om-pause")
    .forEach((node) => node.remove());
  runBar.el = null;
  mountTopbar();
  taskbarSync();
}

let monitorStrip = null;

function monitorHost(fallback) {
  if (panelSetting("openManager.monitorPlacement", "control") !== "topbar") {
    const beside = document.getElementById("crystools-monitors-root");
    if (beside?.parentElement) return { host: beside.parentElement, before: beside };
    const bar = document.querySelector(".actionbar-container");
    if (bar) {
      const group = bar.querySelector(".flex.gap-2") || bar.firstElementChild || bar;
      return { host: group, before: group.firstChild };
    }
  }
  const tabs = document.querySelector(".workflow-tabs-container.pointer-events-auto");
  const trailing = tabs?.querySelector(".ml-auto");
  if (trailing) return { host: trailing, before: trailing.firstChild };
  return fallback ? { host: fallback, before: fallback.firstChild } : null;
}

function mountMonitor(slot) {
  if (panelSetting("openManager.monitor", false) === false) return false;
  if (document.querySelector(".om-mon")) return true;
  const where = monitorHost(slot);
  if (!where) return false;
  monitorStrip = buildMonitorStrip();
  where.host.insertBefore(monitorStrip, where.before);
  startMonitor();
  return true;
}

export { readLegacyUi, managerEntry, managerDestinations, mountTopbar, remountTopbar, monitorStrip };
