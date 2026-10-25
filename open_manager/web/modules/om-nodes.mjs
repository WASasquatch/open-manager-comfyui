import { app } from "../../../scripts/app.js";
import { refreshExtras } from "../themes.js";
import { toast } from "./ui.mjs";
import { SKIN } from "./om-nodes/skin.mjs";
import { mountSheets, syncOmPalette } from "./om-nodes/theme.mjs";
import {
  fitNodes, fitTargets, fitWhenShown, startResize, stopResize, watchConfigure,
} from "./om-nodes/resize.mjs";
import { refreshMenuRow, watchMenu } from "./om-nodes/menu.mjs";
import { refreshOmGrips, startOmGrips, stopOmGrips } from "./om-nodes/grips.mjs";
import { startScrub, stopScrub } from "./om-nodes/scrub.mjs";

export { refreshOmGrips };

const KEY = "openManager.omNodes";
const RESTORE = "openManager.omNodesRestore";
const VUE = "Comfy.VueNodes.Enabled";
const TOLD = "om-nodes-stood-down";
const PROBE_EVERY = 500;
const PROBE_TRIES = 240;

let started = false;
let showing = false;
let stoodDown = "";
let probeTimer = 0;
let probeTries = 0;
let probed = false;

function read(id, fallback) {
  try {
    const value = app.extensionManager?.setting?.get(id);
    return value === undefined || value === null ? fallback : value;
  } catch {
    return fallback;
  }
}

async function write(id, value) {
  try {
    await app.extensionManager.setting.set(id, value);
  } catch (error) {
    console.warn(`[Open Manager] OM Nodes: ${id} not saved`, error);
  }
}

function vueOn() {
  return read(VUE, false) === true;
}

export function omNodesOn() {
  return read(KEY, false) === true;
}

export function setOmNodes(on) {
  return write(KEY, !!on);
}

function probe() {
  const roots = document.querySelectorAll(".lg-node[data-node-id]");
  if (!roots.length) return null;
  const title = Number(window.LiteGraph?.NODE_TITLE_HEIGHT) || 30;
  for (const root of roots) {
    if (root.getAttribute("data-collapsed") !== null) continue;
    const header = root.querySelector(".lg-node-header");
    if (!header) continue;
    if (!root.querySelector(':scope > [data-testid="node-inner-wrapper"]')
      || !root.querySelector('[data-testid^="node-body-"]')) {
      return "ComfyUI changed the node layout";
    }
    if (Math.abs(header.offsetHeight - title) > 1) return "ComfyUI changed the node header";
    return "";
  }
  return null;
}

function standDown(reason) {
  stoodDown = reason;
  console.warn(`[Open Manager] OM Nodes: ${reason}; standing down`);
  const mark = `${window.__COMFYUI_FRONTEND_VERSION__ || ""}:${reason}`;
  let told = "";
  try { told = localStorage.getItem(TOLD) || ""; } catch {}
  if (told !== mark) {
    toast(`OM Nodes stood down: ${reason}.`);
    try { localStorage.setItem(TOLD, mark); } catch {}
  }
  apply();
}

function checkLayout() {
  probeTimer = 0;
  if (!showing || probed) return;
  const found = probe();
  if (found === null) {
    probeTries += 1;
    if (probeTries < PROBE_TRIES) probeTimer = setTimeout(checkLayout, PROBE_EVERY);
    return;
  }
  probed = true;
  if (found) standDown(found);
}

function scheduleProbe() {
  if (probed || probeTimer) return;
  probeTries = 0;
  probeTimer = setTimeout(checkLayout, PROBE_EVERY);
}

function apply() {
  const want = omNodesOn() && vueOn() && !stoodDown;
  const root = document.documentElement;
  if (want) {
    mountSheets(SKIN);
    syncOmPalette();
    root.setAttribute("data-om-nodes", "");
    startResize();
    startOmGrips();
    startScrub();
    scheduleProbe();
  } else {
    root.removeAttribute("data-om-nodes");
    stopResize();
    stopOmGrips();
    stopScrub();
  }
  if (want !== showing) {
    showing = want;
    try { refreshExtras(); } catch {}
    app.canvas?.setDirty?.(true, true);
  }
  refreshMenuRow();
}

async function switched(on, was) {
  if (was === undefined || on === was || !started) return;
  if (on) {
    stoodDown = "";
    probed = false;
    if (!vueOn()) {
      await write(RESTORE, true);
      mountSheets(SKIN);
      syncOmPalette();
      document.documentElement.setAttribute("data-om-nodes", "");
      await write(VUE, true);
    } else {
      await write(RESTORE, false);
    }
  } else if (read(RESTORE, false) === true) {
    await write(RESTORE, false);
    await write(VUE, false);
  }
  apply();
}

async function vueSwitched(event) {
  const on = event?.detail?.value === true;
  if (!on && omNodesOn()) {
    await write(RESTORE, false);
    await write(KEY, false);
  }
  apply();
}

export const omNodeSettings = [
  {
    id: KEY,
    name: "OM Nodes",
    category: ["Open Manager", "Nodes", "omNodes"],
    type: "boolean",
    defaultValue: false,
    tooltip: "Nodes 2.0 at classic node sizes and layout. Turns Nodes 2.0 on.",
    onChange: (value, was) => switched(value === true, was),
  },
  {
    id: RESTORE,
    name: "OM Nodes turned Nodes 2.0 on",
    category: ["Open Manager", "Internal", "omNodesRestore"],
    type: "hidden",
    defaultValue: false,
  },
];

export const omNodeCommands = [
  {
    id: "openmanager.omnodes",
    label: "Open Manager: toggle OM Nodes",
    function: () => setOmNodes(!omNodesOn()),
  },
  {
    id: "openmanager.fitnodes",
    label: "Open Manager: fit selected nodes to content",
    function: () => {
      const picked = Object.values(app.canvas?.selected_nodes || {});
      if (!showing || !picked.length) return;
      fitNodes(picked);
    },
  },
];

export function omNodeMenuItems(node) {
  if (!showing || !node || node.flags?.collapsed) return [];
  return [{ content: "Fit to content", callback: () => fitNodes(fitTargets(node)) }];
}

export function omNodeCreated(node) {
  if (showing) fitWhenShown(node);
}

export function startOmNodes() {
  if (started) return;
  started = true;
  mountSheets(SKIN);
  watchConfigure();
  watchMenu(omNodesOn, setOmNodes);
  try { app.ui.settings.addEventListener(`${VUE}.change`, vueSwitched); } catch {}
  if (omNodesOn() && !vueOn()) {
    write(RESTORE, false).then(() => write(KEY, false)).finally(apply);
    return;
  }
  apply();
}
