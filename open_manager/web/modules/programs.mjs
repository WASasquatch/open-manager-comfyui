import { api } from "../../../scripts/api.js";
import { API, ICON_PROGRAM } from "./base.mjs";
import { el, safeArt, toast, liveTip, notify, askText, confirmAction, openRowMenu, countNote } from "./ui.mjs";
import { WINDOW_SIZES, windowSize, createFloatingPanel, floatingPanel } from "./windows.mjs";
import { panelSetting } from "./settings.mjs";
import { whenText } from "./installed.mjs";
import { dlPost, bytesText } from "./downloads.mjs";
import { addNodeAt, canvasCentre, graphNodes, nodeDragFrom } from "./node-drag.mjs";
import { TASK_GROUP_NAMES } from "./taskbar.mjs";
import { deskProgramsOff, hideDesk } from "./desktop.mjs";
import { loadWorkflow, openWorkflow } from "./workflows.mjs";

const PROGRAM_BASE = new URL("./programs/", new URL("../", import.meta.url)).href;

const ENTRY_FILE = "program.mjs";

let deskGates = { files: false, writes: false, desktop: false };

async function loadGates() {
  try {
    const answer = await (await api.fetchApi(`${API}/gates`)).json();
    if (answer?.ok) deskGates = { ...deskGates, ...answer };
  } catch {}
  return deskGates;
}

function filesOn() {
  return deskGates.files !== false
    && panelSetting("openManager.fileBrowser", false) === true;
}

function filesWritable() {
  return filesOn() && deskGates.writes === true;
}

const PROGRAM_WAIT = 6000;

let programRows = [];

const programModules = new Map();

function programOff(id) {
  return deskProgramsOff.includes(id);
}

function programIconArt(entry) {
  const plain = { kind: "mask", url: ICON_PROGRAM };
  if (!entry.icon) return plain;
  const url = safeArt(`${PROGRAM_BASE}${entry.id}/${entry.icon}?v=${entry.stamp || 0}`);
  if (!url) return plain;
  return { kind: /\.svg($|\?)/i.test(entry.icon) ? "mask" : "src", url };
}

function programRow(entry) {
  const art = programIconArt(entry);
  return {
    key: entry.id,
    kind: "program",
    label: entry.name,
    hint: entry.hint || `${entry.name}, a program this install ships`,
    program: entry,
    desk: {
      at: 40,
      label: entry.name,
      art: art.url,
      kind: art.kind,
      window: `${entry.id}:main`,
      off: !entry.surfaces?.desktop,
      look: entry.look && (entry.look.tint || entry.look.from) ? entry.look : null,
    },
    open: () => runProgram(entry),
  };
}

async function importProgram(entry) {
  if (programModules.has(entry.id)) return programModules.get(entry.id);
  const url = `${PROGRAM_BASE}${entry.id}/${ENTRY_FILE}?v=${entry.stamp || entry.version || 0}`;
  const waited = new Promise((_settle, fail) => {
    setTimeout(() => fail(new Error("took too long to load")), PROGRAM_WAIT);
  });
  const held = await Promise.race([import( url), waited]);
  const made = held?.program || held?.default || null;
  if (!made || typeof made.open !== "function") {
    throw new Error("exports no program with an open function");
  }
  programModules.set(entry.id, made);
  return made;
}

const PROGRAM_VIEWS = 12;

function programView(entry) {
  if (!entry.multiple || panelSetting("openManager.programWindows", false) !== true) {
    return "main";
  }
  for (let at = 1; at <= PROGRAM_VIEWS; at += 1) {
    if (!floatingPanel(`${entry.id}:${at}`)) return String(at);
  }
  const held = [];
  for (let at = 1; at <= PROGRAM_VIEWS; at += 1) {
    const found = floatingPanel(`${entry.id}:${at}`);
    if (found) held.push([Number(found.el.style.zIndex) || 0, String(at)]);
  }
  held.sort((a, b) => a[0] - b[0]);
  return held.length ? held[0][1] : "main";
}

async function runProgram(entry, carried, wanted = "") {
  const view = wanted || programView(entry);
  const open = floatingPanel(`${entry.id}:${view}`);
  if (open) {
    open.present();
    if (carried !== undefined && typeof open._omCarry === "function") open._omCarry(carried);
    return open;
  }
  let made = null;
  try {
    made = await importProgram(entry);
  } catch (error) {
    notify(`${entry.name} did not load`, `${entry.name} could not be started: ${error.message}`);
    return null;
  }
  try {
    return made.open(programApi(entry, view), carried);
  } catch (error) {
    notify(`${entry.name} stopped`, `${entry.name} failed while opening: ${error.message}`);
    return null;
  }
}

async function loadPrograms() {
  let answer = null;
  try {
    answer = await (await api.fetchApi(`${API}/programs`)).json();
  } catch {
    answer = null;
  }
  programRows = (answer?.programs || [])
    .filter((one) => !programOff(one.id))
    .map(programRow);
  for (const row of programRows) TASK_GROUP_NAMES[row.key] = row.label;
}

let scopeAnswer = null;

function scopesStyles() {
  if (scopeAnswer !== null) return scopeAnswer;
  scopeAnswer = false;
  try {
    const probe = el("style");
    probe.textContent =
      "@scope (.om-scope-probe) { .om-scope-target { color: rgb(1, 2, 3); } }";
    document.head.appendChild(probe);
    const outer = el("div", "om-scope-probe");
    outer.style.cssText = "position: fixed; left: -9999px; top: -9999px;";
    const inner = el("span", "om-scope-target");
    outer.appendChild(inner);
    document.body.appendChild(outer);
    scopeAnswer = getComputedStyle(inner).color === "rgb(1, 2, 3)";
    probe.remove();
    outer.remove();
  } catch {
    scopeAnswer = false;
  }
  return scopeAnswer;
}

function programScope(id) {
  return `om-scope-${id}`;
}

function programStyle(id, css) {
  const mark = `om-prog-${id}`;
  let sheet = document.getElementById(mark);
  if (!sheet) {
    sheet = el("style");
    sheet.id = mark;
    document.head.appendChild(sheet);
  }
  const text = String(css || "");
  sheet.textContent = scopesStyles()
    ? `@scope (.${programScope(id)}) {\n${text}\n}`
    : text;
}

function programStore(id) {
  return {
    get: async (name, fallback = null) => {
      try {
        const answer = await (await api.fetchApi(
          `${API}/programs/store?id=${encodeURIComponent(id)}`)).json();
        const held = answer?.ok ? (answer.data || {}) : {};
        return Object.hasOwn(held, name) ? held[name] : fallback;
      } catch {
        return fallback;
      }
    },
    set: async (name, value) => {
      try {
        const answer = await (await api.fetchApi(
          `${API}/programs/store?id=${encodeURIComponent(id)}`)).json();
        const held = answer?.ok ? (answer.data || {}) : {};
        held[name] = value;
        const kept = await dlPost("/programs/store", { id, data: held });
        return kept?.ok === true;
      } catch {
        return false;
      }
    },
  };
}

function programWindow(entry, options = {}) {
  const view = String(options.view || "main").replace(/[^a-z0-9-]/gi, "").slice(0, 24) || "main";
  const panel = createFloatingPanel({
    key: `${entry.id}:${view}`,
    title: String(options.title || entry.name).slice(0, 80),
    ...windowSize(Object.hasOwn(WINDOW_SIZES, options.size) ? options.size : "note"),
    modal: false,
  });
  panel.el.classList.add(programScope(entry.id));
  const art = programIconArt(entry);
  if (art.kind === "mask") panel.setMaskIcon(art.url);
  else panel.setIcon(art.url);
  return {
    body: panel.body,
    tools: panel.tools,
    setTitle: (text) => panel.setTitle(String(text || "").slice(0, 80)),
    setBadge: (text) => panel.setBadge(String(text || "").slice(0, 24)),
    present: () => panel.present(),
    close: () => panel.destroy(),
    isOpen: () => panel.el.isConnected,
    onClose: (fn) => { panel.el.addEventListener("om-prog-close", fn, { once: true }); },
    onCarry: (fn) => { panel._omCarry = fn; },
    onKey: (fn) => {
      panel.el.addEventListener("keydown", (event) => {
        const on = event.target;
        if (on instanceof Element
            && on.closest("input, textarea, select, [contenteditable='true']")) return;
        fn(event);
      });
    },
  };
}

function assetPath(item) {
  return item?.sub ? `${item.sub}/${item.name}` : String(item?.name || "");
}

const HOST_ROOTS = ["output", "input", "temp"];

const SHOWN_KINDS = { image: "still", still: "still", video: "video", audio: "audio" };

const EDITS_HERE = new Set([".md", ".txt", ".json", ".yaml", ".yml", ".csv", ".toml",
                            ".ini", ".cfg", ".conf", ".log", ".env", ".diff", ".patch"]);

function suffixOf(name) {
  const at = String(name || "").lastIndexOf(".");
  return at < 0 ? "" : name.slice(at).toLowerCase();
}

const PLACE_ROOTS = {
  "asset:output": "output", "asset:input": "input", "asset:temp": "temp",
};

function viewRootOf(place) {
  return PLACE_ROOTS[place] || String(place || "");
}

function assetUrl(item, { preview = false, root = "output" } = {}) {
  const where = String(item?.root || root);
  if (!HOST_ROOTS.includes(where)) {
    const ours = new URLSearchParams({
      root: where, path: assetPath(item), v: `${item?.at || 0}-${item?.size || 0}`,
    });
    return `${API}/assets/view?${ours.toString()}`;
  }
  const query = new URLSearchParams({
    filename: String(item?.name || ""),
    subfolder: String(item?.sub || ""),
    type: where,
  });
  if (preview) query.set("preview", "webp;70");
  return `/api/view?${query.toString()}`;
}

function assetThumbUrl(item, { root = "output", edge = 0 } = {}) {
  const query = new URLSearchParams({
    root: String(item?.root || root),
    path: assetPath(item),
    v: `${item?.at || 0}-${item?.size || 0}`,
  });
  if (edge) query.set("edge", String(Math.max(64, Math.min(1024, Math.round(edge)))));
  return `${API}/assets/thumb?${query.toString()}`;
}

async function assetFile(item, root) {
  const answer = await fetch(assetUrl(item, { root }));
  if (!answer.ok) throw new Error(`${item.name} could not be read`);
  const blob = await answer.blob();
  return new File([blob], item.name, { type: blob.type || "application/octet-stream" });
}

async function assetWorkflow(item, root) {
  const readers = window.comfyAPI || {};
  const tail = String(item?.name || "").toLowerCase().split(".").pop();
  const read = {
    png: readers.png?.getFromPngFile,
    webp: readers.webp?.getFromWebpFile,
    mp4: readers.isobmff?.getFromIsobmffFile,
    mov: readers.isobmff?.getFromIsobmffFile,
    m4v: readers.isobmff?.getFromIsobmffFile,
    webm: readers.ebml?.getFromWebmFile,
    flac: readers.flac?.getFromFlacFile,
    avif: readers.avif?.getFromAvifFile,
  }[tail];
  if (typeof read !== "function") return null;
  let held = null;
  try {
    held = await read(await assetFile(item, root));
  } catch {
    return null;
  }
  if (!held) return null;
  const flow = held.workflow || held.Workflow || null;
  const prompt = held.prompt || held.Prompt || null;
  if (!flow && !prompt) return null;
  return { workflow: flow || "", prompt: prompt || "" };
}

async function loadAssetWorkflow(item, root) {
  return openWorkflow(assetFile(item, root), { label: item.name });
}

const ASSET_DRAG_TYPE = "application/x-om-asset";

let assetDropWired = false;

function assetCarried(event) {
  return [...(event.dataTransfer?.types || [])].includes(ASSET_DRAG_TYPE);
}

function tabDropZone(event) {
  const at = event.target instanceof Element ? event.target : null;
  return at?.closest('.workflow-tabs, [data-testid="topbar-workflow-tabs"]') || null;
}

function markTabDrop(zone) {
  for (const old of document.querySelectorAll(".om-tab-drop")) {
    if (old !== zone) old.classList.remove("om-tab-drop");
  }
  zone?.classList.add("om-tab-drop");
}

function mountAssetDrop() {
  if (assetDropWired) return;
  assetDropWired = true;
  document.addEventListener("dragover", (event) => {
    if (!assetCarried(event)) return;
    const zone = tabDropZone(event);
    if (!zone) { markTabDrop(null); return; }
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    markTabDrop(zone);
  }, true);
  document.addEventListener("dragleave", (event) => {
    if (assetCarried(event) && !tabDropZone(event)) markTabDrop(null);
  }, true);
  document.addEventListener("dragend", () => markTabDrop(null), true);
  document.addEventListener("drop", async (event) => {
    if (!assetCarried(event)) return;
    const zone = tabDropZone(event);
    markTabDrop(null);
    if (!zone) return;
    event.preventDefault();
    event.stopPropagation();
    let sent = null;
    try { sent = JSON.parse(event.dataTransfer.getData(ASSET_DRAG_TYPE)); } catch { return; }
    if (!sent?.name) return;
    await loadAssetWorkflow(sent, sent.root || "output");
  }, true);
}

function assetDraggable(node, item, root) {
  if (!(node instanceof Element) || !item?.name) return;
  mountAssetDrop();
  node.draggable = true;
  node.addEventListener("dragstart", (event) => {
    event.dataTransfer.setData(ASSET_DRAG_TYPE, JSON.stringify({
      name: String(item.name), sub: String(item.sub || ""), root: String(root || "output"),
    }));
    event.dataTransfer.effectAllowed = "copy";
  });
}

function programAssets() {
  return {
    roots: [...HOST_ROOTS],
    list: async (options = {}) => {
      const query = new URLSearchParams({
        root: options.root || "output",
        path: options.path || "",
        page: String(options.page ?? 0),
        size: String(options.size ?? 120),
        sort: options.sort || "new",
        kind: options.kind || "all",
        q: options.find || "",
      });
      try {
        const answer = await (await api.fetchApi(`${API}/assets?${query}`)).json();
        return answer?.ok ? answer : { ok: false, items: [], folders: [], total: 0 };
      } catch {
        return { ok: false, items: [], folders: [], total: 0 };
      }
    },
    search: async (options = {}) => {
      const query = new URLSearchParams({
        root: options.root || "output",
        path: options.path || "",
        q: options.find || "",
        size: String(options.size ?? 120),
      });
      try {
        const answer = await (await api.fetchApi(`${API}/assets/search?${query}`)).json();
        return answer?.ok ? answer : { ok: false, items: [], read: 0, capped: false };
      } catch {
        return { ok: false, items: [], read: 0, capped: false };
      }
    },
    url: (item, root) => assetUrl(item, { root }),
    preview: (item, root, edge) => assetThumbUrl(item, { root, edge }),
    hostPreview: (item, root) => assetUrl(item, { preview: true, root }),
    peek: async (root, path, count = 4) => {
      const query = new URLSearchParams({
        root: root || "output", path: path || "", count: String(count),
      });
      try {
        const answer = await (await api.fetchApi(`${API}/assets/peek?${query}`)).json();
        return answer?.ok ? answer : { ok: false, items: [] };
      } catch {
        return { ok: false, items: [] };
      }
    },
    path: (item) => assetPath(item),
    remove: (root, path) => dlPost("/assets/remove", { root, path }),
    write: (root, path, data, replace = false) =>
      dlPost("/assets/write", { root, path, data, replace: !!replace }),
    workflow: (item, root) => assetWorkflow(item, root),
    carries: async (root, path) => {
      try {
        const query = new URLSearchParams({ root: root || "output", path: path || "" });
        const answer = await (await api.fetchApi(`${API}/assets/workflow?${query}`)).json();
        return answer?.ok ? answer : { ok: false, keys: [], kind: "" };
      } catch {
        return { ok: false, keys: [], kind: "" };
      }
    },
    strip: (root, path) => dlPost("/assets/workflow/remove", { root, path }),
    load: (item, root) => loadAssetWorkflow(item, root),
    drag: (node, item, root) => assetDraggable(node, item, root),
  };
}

async function runProgramById(id, carried) {
  const row = programRows.find((one) => one.key === id);
  if (!row) {
    notify("Not here", `No program called ${id} is loaded.`);
    return null;
  }
  return runProgram(row.program, carried);
}

function programApi(entry, view = "main") {
  return {
    id: entry.id,
    name: entry.name,
    view,
    run: (id, carried) => runProgramById(String(id || ""), carried),
    el: (tag, cls, text) => el(tag, cls, text),
    window: (options = {}) => programWindow(entry, { view, ...options }),
    style: (css) => programStyle(entry.id, css),
    storage: programStore(entry.id),
    assets: programAssets(),
    toast: (text, options) => toast(String(text || "").slice(0, 300), options),
    notify: (title, text) => notify(String(title || entry.name).slice(0, 80),
                                    String(text || "").slice(0, 600)),
    confirm: (title, text, label) => confirmAction(String(title || "").slice(0, 80),
                                                   String(text || "").slice(0, 600),
                                                   String(label || "Yes").slice(0, 24), false),
    ask: (title, value, label) => askText(String(title || "").slice(0, 80), value, label),
    menu: (anchor, items) => openRowMenu(anchor, { items, align: "left" }),
    tip: (host, say) => liveTip(host, say),
    setting: (name, fallback = null) => (String(name || "").startsWith("openManager.")
      ? panelSetting(String(name), fallback)
      : fallback),
    bytes: (value) => bytesText(value),
    count: (value, noun) => countNote(value, noun),
    when: (date) => whenText(date),
    canWrite: () => deskGates.writes === true,
    graph: {
      nodes: () => graphNodes(),
      drag: (node, entry) => nodeDragFrom(node, entry),
      add: (type) => addNodeAt(String(type || ""), canvasCentre()),
      show: () => hideDesk(),
      open: (source, title) => loadWorkflow(source, { title: title ? String(title) : null }),
    },
  };
}

export { deskGates, loadGates, filesOn, filesWritable, programRows, programOff, programIconArt, runProgram, loadPrograms, SHOWN_KINDS, EDITS_HERE, suffixOf, viewRootOf, assetThumbUrl, runProgramById };
