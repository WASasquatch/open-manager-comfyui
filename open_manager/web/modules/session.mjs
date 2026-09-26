import { floatPanels, floatingPanel } from "./windows.mjs";
import { openPack } from "./packs.mjs";
import { openPanelWindow } from "./discovery.mjs";
import { managerDestinations } from "./topbar.mjs";
import { loadGates, programRows, runProgram, loadPrograms } from "./programs.mjs";
import { deskLayer, deskShown, deskHashAsked, desktopOn, deskAsked, placeDeskCells, loadDeskCells, showDesk, applyDesktop } from "./desktop.mjs";
import { loadDeskDocs, docFind, openDoc, openWastebasket } from "./desk-docs.mjs";
import { deskOpenRow, paintDeskIcons } from "./desk-icons.mjs";
import { openDesktopSettings } from "./desk-settings.mjs";
import { openFileBrowser } from "./files.mjs";
import { openWorkflows, activePath } from "./workflows.mjs";

const SESSION_KEY = "om-session";

let sessionReady = false;

let sessionDue = 0;

function sessionRead() {
  try {
    const held = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    if (!held || typeof held !== "object") return null;
    return { desk: held.desk === true, windows: Array.isArray(held.windows) ? held.windows : [] };
  } catch {
    return null;
  }
}

function sessionWrite() {
  if (!sessionReady) return;
  const windows = [...floatPanels.values()]
    .filter((one) => one.el.isConnected && !one.modal && one.key)
    .map((one) => ({ key: one.key, away: one.isMinimised?.() === true }));
  try {
    localStorage.setItem(SESSION_KEY,
      JSON.stringify({ v: 1, desk: deskShown === true, windows }));
  } catch {
  }
}

function sessionKeep() {
  clearTimeout(sessionDue);
  sessionDue = setTimeout(sessionWrite, 300);
}

function windowOpener(key) {
  if (key === "desktop") return () => openDesktopSettings();
  if (key === "wastebasket") return () => openWastebasket();
  if (key.startsWith("pack:")) {
    const id = key.slice(5);
    return id ? () => openPack(id) : null;
  }
  if (key.startsWith("note:")) {
    const id = key.slice(key.indexOf(":") + 1);
    return async () => {
      const found = await docFind(id);
      if (found) openDoc(found);
    };
  }
  const at = key.indexOf(":");
  if (at > 0) {
    const id = key.slice(0, at);
    const view = key.slice(at + 1);
    const program = programRows.find((one) => one.key === id);
    if (program) return () => runProgram(program.program, undefined, view);
  }
  const row = managerDestinations().find((one) => one.desk?.window === key);
  if (row) return () => deskOpenRow(row);
  if (key === "manager") return () => openPanelWindow("registry");
  if (key.startsWith("files:")) return () => openFileBrowser();
  return null;
}

async function restoreSession() {
  const held = sessionRead();
  const asked = deskHashAsked();
  if (!held) {
    if (asked) showDesk();
    sessionReady = true;
    return asked;
  }
  for (const one of held.windows) {
    const key = String(one?.key || "");
    const open = windowOpener(key);
    if (!open) continue;
    try {
      await open();
    } catch {
      continue;
    }
    if (one.away) floatingPanel(key)?.minimise?.();
  }
  if (held.desk || asked) showDesk();
  sessionReady = true;
  sessionWrite();
  return true;
}

function deskNothingOpen() {
  return new Promise((settle) => {
    let tries = 0;
    const look = () => {
      tries += 1;
      if (openWorkflows().length || activePath()) { settle(false); return; }
      if (tries >= 25) { settle(true); return; }
      setTimeout(look, 200);
    };
    look();
  });
}

async function startDesktop() {
  await loadGates().catch(() => {});
  const programsReady = loadPrograms().then(() => {
    if (deskLayer) paintDeskIcons();
  }).catch(() => {});
  if (!desktopOn()) {
    programsReady.then(() => restoreSession()).catch(() => { sessionReady = true; });
    return;
  }
  loadDeskCells().then(() => placeDeskCells()).catch(() => {});
  loadDeskDocs().then(() => paintDeskIcons()).catch(() => {});
  applyDesktop();
  programsReady.then(() => restoreSession()).then((remembered) => {
    if (remembered || deskAsked()) return;
    return deskNothingOpen().then((empty) => {
      if (empty && !deskShown) showDesk();
    });
  }).catch(() => { sessionReady = true; });
}

export { sessionReady, sessionKeep, startDesktop };
