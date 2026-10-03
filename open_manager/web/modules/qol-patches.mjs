import { app } from "../../../scripts/app.js";
import managerModal from "./qol-manager-modal.mjs";
import subgraphPreviews from "./qol-subgraph-previews.mjs";
import widgetWidth from "./qol-widget-width.mjs";
import partnerNodes from "./qol-partner-nodes.mjs";
import stillWhileRunning from "./qol-still-while-running.mjs";
import goToNode from "./qol-go-to-node.mjs";
import middleClickPaste from "./qol-middle-click-paste.mjs";
import frontendOnlyBadge from "./qol-frontend-only-badge.mjs";
import nameBox from "./qol-name-box.mjs";
import { el } from "./ui.mjs";

const QOL_PATCHES = [
  managerModal, subgraphPreviews, widgetWidth, partnerNodes,
  stillWhileRunning, goToNode, middleClickPaste, frontendOnlyBadge, nameBox,
];

const wanted = new Map();

const running = new Map();

let started = false;

function settingId(patch) {
  return `openManager.${patch.key}`;
}

function patchWanted(patch) {
  if (wanted.has(patch.key)) return wanted.get(patch.key) !== false;
  try {
    const value = app.extensionManager?.setting?.get?.(settingId(patch));
    return value === undefined || value === null ? patch.defaultValue : value !== false;
  } catch {
    return patch.defaultValue;
  }
}

function stopPatch(patch) {
  const undo = running.get(patch.key);
  if (!undo) return;
  running.delete(patch.key);
  for (const step of undo.reverse()) {
    try {
      step();
    } catch (error) {
      console.warn(`[Open Manager] ${patch.name}: a part could not be removed`, error);
    }
  }
}

function standDown(patch, undo, reason) {
  if (running.get(patch.key) !== undo) return;
  console.info(`[Open Manager] ${patch.name}: stood down, ${reason?.message || reason}`);
  queueMicrotask(() => {
    if (running.get(patch.key) === undo) stopPatch(patch);
  });
}

function startPatch(patch) {
  if (running.has(patch.key)) return;
  let reason = "";
  try {
    reason = patch.check() || "";
  } catch (error) {
    reason = error?.message || String(error);
  }
  if (reason) {
    console.info(`[Open Manager] ${patch.name}: not applied, ${reason}`);
    return;
  }
  const undo = [];
  running.set(patch.key, undo);
  try {
    patch.on((step) => undo.push(step), (why) => standDown(patch, undo, why));
  } catch (error) {
    console.warn(`[Open Manager] ${patch.name}: failed and was removed`, error);
    stopPatch(patch);
  }
}

function setQolPatch(patch, value) {
  wanted.set(patch.key, value);
  if (!started) return;
  if (value === false) stopPatch(patch);
  else startPatch(patch);
}

function qolSettings() {
  return QOL_PATCHES.map((patch) => ({
    id: settingId(patch),
    name: patch.name,
    category: ["Open Manager", "Quality of Life Patches", patch.key],
    type: "boolean",
    defaultValue: patch.defaultValue,
    onChange: (value) => setQolPatch(patch, value),
    tooltip: patch.tooltip,
  }));
}

function issueLink(issue) {
  const [repo, number] = issue.split("#");
  const link = el("a", "om-qol-issue", `#${number}`);
  link.href = `https://github.com/${repo}/issues/${number}`;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.title = issue;
  link.addEventListener("click", (event) => event.stopPropagation());
  return link;
}

function linkIssues() {
  for (const patch of QOL_PATCHES) {
    if (!patch.issues?.length) continue;
    const label = document.getElementById(`${settingId(patch)}-label`);
    if (!label || label.querySelector(".om-qol-issue")) continue;
    for (const issue of patch.issues) label.appendChild(issueLink(issue));
  }
}

function watchIssueLinks() {
  let due = 0;
  new MutationObserver(() => {
    if (due) return;
    due = requestAnimationFrame(() => {
      due = 0;
      if (document.querySelector('[data-setting-id^="openManager.qol"]')) linkIssues();
    });
  }).observe(document.body, { childList: true, subtree: true });
}

function startQolPatches() {
  started = true;
  watchIssueLinks();
  for (const patch of QOL_PATCHES) {
    if (patchWanted(patch)) startPatch(patch);
  }
}

function menuItems(hook, target) {
  const items = [];
  for (const patch of QOL_PATCHES) {
    if (!running.has(patch.key) || typeof patch[hook] !== "function") continue;
    try {
      items.push(...(patch[hook](target) || []));
    } catch (error) {
      console.warn(`[Open Manager] ${patch.name}: menu failed`, error);
    }
  }
  return items;
}

function qolNodeMenuItems(node) {
  return menuItems("menu", node);
}

function qolCanvasMenuItems(canvas) {
  return menuItems("canvasMenu", canvas);
}

export { qolSettings, startQolPatches, qolNodeMenuItems, qolCanvasMenuItems };
