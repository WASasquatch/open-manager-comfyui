import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import { API } from "./base.mjs";
import { dlPost } from "./net.mjs";
import { piniaStores, graphNodes } from "./qol/shared.mjs";
import { confirmDownloadTrust, confirmDiskRoom, formatsOf, dlWorkers } from "./downloads.mjs";

const LOADERS = { LoadImage: "image", LoadImageMask: "image", LoadVideo: "file", LoadAudio: "audio" };

const INPUT = "input";

const CACHE = "temp";

const WATCH_MS = 1000;

const WATCH_LIMIT_MS = 30 * 60 * 1000;

const SETTLED = new Set(["done", "failed", "cancelled", "paused"]);

let keepOn = false;

function keeping() {
  return keepOn;
}

function setKeeping(value) {
  keepOn = value === true;
}

function baseName(value) {
  const text = String(value ?? "");
  for (const mark of [" [input]", " [temp]"]) {
    if (text.endsWith(mark)) return text.slice(0, -mark.length);
  }
  return text;
}

function cacheRef(name) {
  return `${name} [temp]`;
}

function sameRef(value, target) {
  const plain = (text) => (String(text).endsWith(" [input]") ? String(text).slice(0, -8) : String(text));
  return plain(value) === plain(target);
}

function documentLoaders(document) {
  if (!document || typeof document !== "object") return [];
  const nodes = Array.isArray(document.nodes) ? [...document.nodes] : [];
  const subgraphs = document.definitions?.subgraphs;
  for (const graph of Array.isArray(subgraphs) ? subgraphs : []) {
    if (Array.isArray(graph?.nodes)) nodes.push(...graph.nodes);
  }
  return nodes.filter((node) => node && typeof node === "object" && LOADERS[node.type]);
}

function documentValues(node) {
  const widget = LOADERS[node.type];
  const found = [];
  const values = node.widgets_values;
  if (Array.isArray(values)) {
    if (typeof values[0] === "string") found.push(values[0]);
  } else if (values && typeof values[widget] === "string") {
    found.push(values[widget]);
  }
  const named = node.widgets_values_named;
  if (named && typeof named[widget] === "string") found.push(named[widget]);
  return found;
}

function loaderDocument(document) {
  return {
    nodes: documentLoaders(document).flatMap((node) => documentValues(node)
      .map((value) => ({ id: node.id, type: node.type, widgets_values: [value] }))),
  };
}

function loaderNames(document) {
  return documentLoaders(document).flatMap((node) => documentValues(node).map(baseName));
}

function liveLoaders() {
  const found = [];
  for (const node of graphNodes()) {
    const name = LOADERS[node?.type];
    if (!name) continue;
    const widget = node.widgets?.find((one) => one?.name === name);
    if (widget && typeof widget.value === "string") found.push({ node, widget });
  }
  return found;
}

function liveNames() {
  return new Set(liveLoaders().map(({ widget }) => baseName(widget.value)));
}

function liveDocument() {
  return {
    nodes: liveLoaders().map(({ node, widget }) => ({
      id: node.id, type: node.type, widgets_values: [widget.value],
    })),
  };
}

async function scanMedia(document) {
  if (!document?.nodes?.length) return [];
  try {
    const answer = await dlPost("/media/in-workflow", { workflow: document });
    return Array.isArray(answer?.media) ? answer.media : [];
  } catch {
    return [];
  }
}

async function keepCached(names) {
  if (!names.length) return {};
  try {
    const answer = await dlPost("/media/keep", { names });
    for (const problem of answer?.problems || []) {
      console.warn(`[Open Manager] Template media: ${problem}`);
    }
    return answer?.kept || {};
  } catch {
    return {};
  }
}

async function placeRows(rows) {
  const cached = keeping() ? rows.filter((row) => !row.input && row.temp).map((row) => row.name) : [];
  const kept = await keepCached(cached);
  const targets = new Map();
  const arrived = new Set();
  for (const row of rows) {
    if (kept[row.name]) {
      row.input = kept[row.name];
      row.temp = "";
      targets.set(row.name, kept[row.name]);
      arrived.add(row.name);
    } else if (row.input) {
      targets.set(row.name, row.name);
    } else if (row.temp) {
      targets.set(row.name, cacheRef(row.name));
    }
  }
  return { targets, arrived };
}

function cloned(document) {
  try {
    return structuredClone(document);
  } catch {
    return JSON.parse(JSON.stringify(document));
  }
}

function rewriteDocument(document, targets) {
  if (!targets.size) return document;
  const wanted = (value) => {
    const target = targets.get(baseName(value));
    return target !== undefined && !sameRef(value, target) ? target : null;
  };
  const needed = documentLoaders(document)
    .some((node) => documentValues(node).some((value) => wanted(value) !== null));
  if (!needed) return document;
  const copy = cloned(document);
  for (const node of documentLoaders(copy)) {
    const widget = LOADERS[node.type];
    const values = node.widgets_values;
    if (Array.isArray(values)) {
      if (typeof values[0] === "string" && wanted(values[0]) !== null) values[0] = wanted(values[0]);
    } else if (values && typeof values[widget] === "string" && wanted(values[widget]) !== null) {
      values[widget] = wanted(values[widget]);
    }
    const named = node.widgets_values_named;
    if (named && typeof named[widget] === "string" && wanted(named[widget]) !== null) {
      named[widget] = wanted(named[widget]);
    }
  }
  return copy;
}

function rebindLive(targets) {
  let changed = 0;
  for (const { node, widget } of liveLoaders()) {
    const target = targets.get(baseName(widget.value));
    if (target === undefined || sameRef(widget.value, target)) continue;
    widget.value = target;
    try {
      widget.callback?.(target, undefined, node);
    } catch (error) {
      console.warn("[Open Manager] Template media: a node did not take its file", error);
    }
    changed += 1;
  }
  if (changed) app.graph?.setDirtyCanvas?.(true, true);
  return changed;
}

async function reloadInputs() {
  const stores = piniaStores();
  try {
    await stores?.get("assets")?.inputAssets?.invalidate?.();
  } catch {}
  try {
    await app.reloadNodeDefs?.();
  } catch (error) {
    console.warn("[Open Manager] Template media: node definitions not reloaded", error);
  }
}

function clearMissing(names) {
  const missing = piniaStores()?.get("missingMedia");
  const candidates = missing?.missingMediaCandidates;
  if (!Array.isArray(candidates) || typeof missing.removeMissingMediaByWidget !== "function") return;
  for (const candidate of [...candidates]) {
    if (names.has(baseName(candidate?.name))) {
      missing.removeMissingMediaByWidget(String(candidate.nodeId), candidate.widgetName);
    }
  }
}

async function applyTargets(targets, arrived) {
  if (arrived.size) await reloadInputs();
  rebindLive(targets);
  clearMissing(new Set(targets.keys()));
}

async function prepareDocument(document) {
  const rows = await scanMedia(loaderDocument(document));
  if (!rows.length) return { document, rows };
  const { targets, arrived } = await placeRows(rows);
  if (arrived.size) await reloadInputs();
  return { document: rewriteDocument(document, targets), rows };
}

async function keepOpenWorkflow() {
  const rows = await scanMedia(liveDocument());
  if (!rows.length) return;
  const { targets, arrived } = await placeRows(rows);
  if (targets.size) await applyTargets(targets, arrived);
}

function directoryFor(row) {
  if (row.directory === INPUT || row.directory === CACHE) return row.directory;
  return row.input || keeping() ? INPUT : CACHE;
}

function mediaRow(row) {
  const directory = directoryFor(row);
  return {
    ...row,
    media: true,
    directory,
    installed: directory === INPUT ? row.input || "" : row.temp || "",
    cached: directory === INPUT && !row.input && !!row.temp,
  };
}

function missingRows(rows) {
  return rows.filter((row) => row.allowed !== false && !row.input && !row.temp);
}

async function trusted(rows) {
  const owners = new Map();
  for (const row of rows) {
    if (!owners.has(row.owner)) owners.set(row.owner, []);
    owners.get(row.owner).push(row.name);
  }
  const allowed = new Set();
  for (const [owner, names] of owners) {
    const what = names.length === 1 ? names[0] : `${names.length} media files`;
    if (await confirmDownloadTrust(owner, what, names.length !== 1, formatsOf(names))) {
      allowed.add(owner);
    }
  }
  return rows.filter((row) => allowed.has(row.owner));
}

async function fetchMedia(rows, { askTrust = true, checkRoom = true, source = "template media" } = {}) {
  let ready = rows.filter((row) => row.allowed !== false).map((row) => ({
    ...row, directory: directoryFor(row),
  }));
  const moving = ready.filter((row) => row.directory === INPUT && !row.input && row.temp
    && !row.overwrite);
  ready = ready.filter((row) => !moving.includes(row));
  if (askTrust && ready.length) ready = await trusted(ready);
  if (!ready.length && !moving.length) return null;
  if (checkRoom && ready.length && !(await confirmDiskRoom(ready))) return null;

  const targets = new Map();
  const failed = [];
  const queued = [];
  const kept = await keepCached(moving.map((row) => row.name));
  for (const row of moving) {
    if (kept[row.name]) targets.set(row.name, kept[row.name]);
    else failed.push({ name: row.name, reason: "not moved" });
  }
  for (const row of ready) {
    let answer = null;
    try {
      answer = await dlPost("/downloads", {
        url: row.url, name: row.name, directory: row.directory, source,
        workers: dlWorkers(), overwrite: !!row.overwrite,
      });
    } catch {
      answer = null;
    }
    const ref = row.directory === INPUT ? row.name : cacheRef(row.name);
    if (answer?.ok) queued.push({ id: answer.id, name: row.name, ref });
    else if (answer?.installed) targets.set(row.name, ref);
    else failed.push({ name: row.name, reason: answer?.reason || "refused" });
  }
  return watchMedia(queued, targets, failed, Object.keys(kept).length > 0);
}

function watchMedia(queued, targets, failed, moved) {
  const listeners = new Set();
  const state = {
    total: queued.length + targets.size + failed.length,
    queued: queued.length,
    done: targets.size,
    failed,
    bytes: 0,
    size: 0,
  };
  const tell = () => {
    for (const listener of listeners) {
      try {
        listener(state);
      } catch {}
    }
  };
  const finished = (async () => {
    const open = new Map(queued.map((one) => [one.id, one]));
    let arrived = moved;
    const started = Date.now();
    while (open.size && Date.now() - started < WATCH_LIMIT_MS) {
      await new Promise((resolve) => setTimeout(resolve, WATCH_MS));
      let rows;
      try {
        const answer = await api.fetchApi(`${API}/downloads?ids=${[...open.keys()].join(",")}`);
        rows = (await answer.json())?.downloads || [];
      } catch {
        continue;
      }
      const seen = new Map(rows.map((row) => [row.id, row]));
      let bytes = 0;
      let size = 0;
      for (const [id, one] of [...open]) {
        const row = seen.get(id);
        if (row && !SETTLED.has(row.status)) {
          bytes += Number(row.bytes) || 0;
          size += Number(row.total) || 0;
          continue;
        }
        open.delete(id);
        if (row?.status === "done") {
          targets.set(one.name, one.ref);
          state.done += 1;
          arrived = true;
        } else {
          failed.push({ name: one.name, reason: row?.error || row?.status || "removed" });
        }
      }
      state.bytes = bytes;
      state.size = size;
      tell();
    }
    for (const one of open.values()) failed.push({ name: one.name, reason: "still downloading" });
    if (targets.size) {
      try {
        await applyTargets(targets, arrived ? new Set(targets.keys()) : new Set());
      } catch (error) {
        console.warn("[Open Manager] Template media: nodes not refreshed", error);
      }
    }
    tell();
    return state;
  })();
  return { state, onChange: (listener) => listeners.add(listener), finished };
}

export {
  LOADERS, keeping, setKeeping, baseName, loaderNames, loaderDocument, liveNames, liveDocument, scanMedia,
  prepareDocument, keepOpenWorkflow, mediaRow, missingRows, fetchMedia,
};
