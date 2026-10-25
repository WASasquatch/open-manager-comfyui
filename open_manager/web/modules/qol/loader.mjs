import { app } from "../../../../scripts/app.js";
import { api } from "../../../../scripts/api.js";
import { API } from "../base.mjs";
import { el } from "../ui.mjs";
import { piniaStores } from "./shared.mjs";
import "./early-events.mjs";

const PATCH_FILE = /^[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*\.mjs$/;

const PATCH_KEY = /^qol[A-Za-z0-9]{1,60}$/;

const SETUP_WAIT_MS = 10000;

const STATUS_WAIT_MS = 3000;

const IMPORT_TRIES = 3;

const RETRY_MS = 1500;

const LISTING_KEY = "om-qol-listing";

const patches = new Map();

const byFile = new Map();

const failed = new Map();

const notes = new Map();

const wanted = new Map();

const running = new Map();

let started = false;

function declared(meta) {
  if (!meta || typeof meta.key !== "string" || !PATCH_KEY.test(meta.key)
    || typeof meta.name !== "string" || meta.name === "") return false;
  const options = meta.options;
  if (options === undefined) return typeof meta.defaultValue === "boolean";
  return Array.isArray(options) && options.length > 1
    && options.every((one) => typeof one === "string" && one !== "")
    && new Set(options).size === options.length && options.includes(meta.defaultValue);
}

function metaOf(module) {
  const options = Array.isArray(module?.options) ? module.options : undefined;
  const meta = {
    key: module?.key, name: module?.name, tooltip: String(module?.tooltip || ""),
    issues: Array.isArray(module?.issues) ? module.issues : [],
    defaultValue: options ? module?.defaultValue : module?.defaultValue === true,
    verified: String(module?.verified || ""),
  };
  if (options) meta.options = options;
  return declared(meta) ? meta : null;
}

function acts(module) {
  return typeof module?.check === "function" && typeof module.on === "function";
}

async function listing() {
  try {
    const answer = await (await api.fetchApi(`${API}/qol`)).json();
    if (Array.isArray(answer?.patches)) {
      for (const problem of answer.problems || []) {
        console.warn(`[Open Manager] Quality of Life patch: ${problem}`);
      }
      try {
        localStorage.setItem(LISTING_KEY,
          JSON.stringify({ patches: answer.patches, meta: answer.meta || {} }));
      } catch {}
      return answer;
    }
  } catch (error) {
    console.warn("[Open Manager] Quality of Life patches could not be listed", error);
  }
  try {
    const kept = JSON.parse(localStorage.getItem(LISTING_KEY) || "null");
    if (Array.isArray(kept?.patches)) return kept;
  } catch {}
  return { patches: [], meta: {} };
}

function settingId(held) {
  return `openManager.${held.key}`;
}

function choiceOf(held) {
  const options = held.meta.options;
  let value;
  if (wanted.has(held.key)) {
    value = wanted.get(held.key);
  } else {
    try {
      value = app.extensionManager?.setting?.get?.(settingId(held));
    } catch {
      value = undefined;
    }
  }
  return options.includes(value) ? value : held.meta.defaultValue;
}

function patchWanted(held) {
  if (held.meta.options) return choiceOf(held) !== held.meta.options[0];
  if (wanted.has(held.key)) return wanted.get(held.key) !== false;
  try {
    const value = app.extensionManager?.setting?.get?.(settingId(held));
    return value === undefined || value === null ? held.meta.defaultValue : value !== false;
  } catch {
    return held.meta.defaultValue;
  }
}

function stopPatch(held) {
  const undo = running.get(held.key);
  if (!undo) return;
  running.delete(held.key);
  for (const step of undo.reverse()) {
    try {
      step();
    } catch (error) {
      console.warn(`[Open Manager] ${held.meta.name}: a part could not be removed`, error);
    }
  }
}

function standDown(held, undo, reason) {
  if (running.get(held.key) !== undo) return;
  console.info(`[Open Manager] ${held.meta.name}: stood down, ${reason?.message || reason}`);
  notes.set(held.key, { state: "down", reason: String(reason?.message || reason || "") });
  queueMicrotask(() => {
    if (running.get(held.key) === undo) stopPatch(held);
  });
}

function startPatch(held) {
  if (!held.module || running.has(held.key)) return;
  let reason = "";
  try {
    reason = held.module.check() || "";
  } catch (error) {
    reason = error?.message || String(error);
  }
  if (reason) {
    console.info(`[Open Manager] ${held.meta.name}: not applied, ${reason}`);
    notes.set(held.key, { state: "skipped", reason: String(reason) });
    return;
  }
  notes.delete(held.key);
  const undo = [];
  running.set(held.key, undo);
  const given = [(step) => undo.push(step), (why) => standDown(held, undo, why)];
  if (held.meta.options) given.push(choiceOf(held));
  try {
    held.module.on(...given);
  } catch (error) {
    console.warn(`[Open Manager] ${held.meta.name}: failed and was removed`, error);
    notes.set(held.key, { state: "failed", reason: String(error?.message || error || "") });
    stopPatch(held);
  }
}

function setQolPatch(held, value) {
  wanted.set(held.key, value);
  if (!started) return;
  if (held.meta.options) {
    stopPatch(held);
    if (patchWanted(held)) startPatch(held);
    return;
  }
  if (value === false) stopPatch(held);
  else startPatch(held);
}

let unreachable = false;

function register(held) {
  const store = piniaStores()?.get("setting");
  if (typeof store?.addSetting !== "function") {
    if (!unreachable) {
      unreachable = true;
      console.warn("[Open Manager] Quality of Life patches: ComfyUI's settings are not "
        + "reachable, so each patch runs at its default");
    }
    return;
  }
  try {
    store.addSetting({
      id: settingId(held),
      name: held.meta.name,
      category: ["Open Manager", "Quality of Life Patches", held.key],
      type: held.meta.options ? "combo" : "boolean",
      ...(held.meta.options ? { options: held.meta.options } : {}),
      defaultValue: held.meta.defaultValue,
      onChange: (value) => setQolPatch(held, value),
      tooltip: held.meta.tooltip,
    });
  } catch (error) {
    console.warn(`[Open Manager] ${held.meta.name}: setting not registered`, error);
  }
}

function record(file, meta) {
  if (patches.has(meta.key)) {
    console.warn(`[Open Manager] Quality of Life patch skipped: ${meta.key} is used twice`);
    failed.set(file, `${meta.key} is used twice`);
    return null;
  }
  const held = { key: meta.key, file, meta, module: null, folder: file.split("/")[0] };
  patches.set(held.key, held);
  byFile.set(file, held);
  register(held);
  return held;
}

function arrive(file, module) {
  let held = byFile.get(file);
  if (!held) {
    const meta = metaOf(module);
    if (!meta) {
      failed.set(file, "does not export key, name and defaultValue");
      console.warn(`[Open Manager] Quality of Life patch skipped: ${file} does not export key, `
        + "name and defaultValue");
      return;
    }
    held = record(file, meta);
    if (!held) return;
  }
  if (!acts(module)) {
    notes.set(held.key, { state: "failed", reason: "does not export check and on" });
    console.warn(`[Open Manager] Quality of Life patch skipped: ${file} does not export check `
      + "and on");
    return;
  }
  held.module = module;
  if (started && patchWanted(held)) startPatch(held);
}

async function importPatch(file) {
  let last = null;
  for (let attempt = 0; attempt < IMPORT_TRIES; attempt += 1) {
    try {
      const module = await import(attempt ? `./${file}?retry=${attempt}` : `./${file}`);
      arrive(file, module.default);
      return;
    } catch (error) {
      last = error;
      if (attempt + 1 < IMPORT_TRIES) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_MS * (attempt + 1)));
      }
    }
  }
  const reason = String(last?.message || last || "failed to load");
  const held = byFile.get(file);
  if (held) notes.set(held.key, { state: "failed", reason });
  else failed.set(file, reason);
  console.warn(`[Open Manager] Quality of Life patch not loaded: ${file}`, last);
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
  for (const held of patches.values()) {
    if (!held.meta.issues?.length) continue;
    const label = document.getElementById(`${settingId(held)}-label`);
    if (!label || label.querySelector(".om-qol-issue")) continue;
    for (const issue of held.meta.issues) label.appendChild(issueLink(issue));
  }
}

function watchIssueLinks() {
  let due = 0;
  let inside = null;
  const soon = () => {
    if (due) return;
    due = requestAnimationFrame(() => {
      due = 0;
      if (document.querySelector('[data-setting-id^="openManager.qol"]')) linkIssues();
    });
  };
  const look = () => {
    const dialog = document.querySelector('[data-testid="settings-dialog"]');
    if (dialog === inside?.dialog) return;
    inside?.watcher.disconnect();
    inside = null;
    if (!dialog) return;
    const watcher = new MutationObserver(soon);
    watcher.observe(dialog, { childList: true, subtree: true });
    inside = { dialog, watcher };
    soon();
  };
  new MutationObserver(look).observe(document.body, { childList: true });
  look();
}

const listed = listing().then((found) => {
  const files = (found.patches || []).filter((file) => PATCH_FILE.test(file));
  for (const file of files) {
    const meta = found.meta?.[file];
    if (declared(meta)) record(file, meta);
  }
  return files;
});

const loaded = listed.then((files) => Promise.allSettled(files.map(importPatch)));

function startQolPatches() {
  started = true;
  watchIssueLinks();
  for (const held of patches.values()) {
    if (patchWanted(held)) startPatch(held);
  }
  return Promise.race([loaded, new Promise((resolve) => setTimeout(resolve, SETUP_WAIT_MS))]);
}

function menuItems(hook, target) {
  const items = [];
  for (const held of patches.values()) {
    if (!running.has(held.key) || typeof held.module?.[hook] !== "function") continue;
    try {
      items.push(...(held.module[hook](target) || []));
    } catch (error) {
      console.warn(`[Open Manager] ${held.meta.name}: menu failed`, error);
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

async function qolStatus() {
  await listed;
  await Promise.race([loaded, new Promise((resolve) => setTimeout(resolve, STATUS_WAIT_MS))]);
  const rows = [...patches.values()].map((held) => {
    const note = notes.get(held.key);
    const on = patchWanted(held);
    const live = running.has(held.key);
    return {
      key: held.key,
      id: settingId(held),
      name: held.meta.name,
      tooltip: held.meta.tooltip || "",
      issues: held.meta.issues || [],
      folder: held.folder,
      wanted: on,
      state: !on ? "off" : live ? "on" : note?.state || "waiting",
      reason: on && !live ? note?.reason || "" : "",
    };
  });
  for (const [file, reason] of failed) {
    rows.push({ key: file, id: "", name: file, tooltip: "", issues: [],
                folder: file.split("/")[0], wanted: true, state: "failed", reason });
  }
  return rows;
}

export { startQolPatches, qolNodeMenuItems, qolCanvasMenuItems, qolStatus, issueLink };
