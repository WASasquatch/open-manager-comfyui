import { app } from "../../../../../../scripts/app.js";
import { api } from "../../../../../../scripts/api.js";
import { el, toastHost, toastShut } from "../../../ui.mjs";
import { bytesText } from "../../../net.mjs";
import { piniaStores } from "../../shared.mjs";
import { loaderNames, liveNames, prepareDocument, missingRows, fetchMedia } from "../../../template-media.mjs";

const CHANGED = "ComfyUI's template catalog names its media another way";

const URLISH = /^(https?:)?\/\//i;

const REVISION = /^[a-f0-9]{40}$/;

const DONE_MS = 6000;

const FAILED_MS = 12000;

const claims = new Set();

const stripped = new Map();

const declared = new Set();

let hooks = null;

let offer = null;

let changed = false;

function ready() {
  if (typeof api.getCoreWorkflowTemplates !== "function") return "ComfyUI has no template catalog";
  if (typeof app.loadGraphData !== "function") return "ComfyUI loads workflows another way";
  return "";
}

function later(fn) {
  setTimeout(() => {
    try {
      fn();
    } catch (error) {
      console.warn("[Open Manager] Template media", error);
    }
  }, 0);
}

function readSetting(id) {
  try {
    return app.extensionManager?.setting?.get?.(id);
  } catch {
    return undefined;
  }
}

function writeSetting(id, value) {
  try {
    Promise.resolve(app.extensionManager?.setting?.set?.(id, value)).catch((error) => {
      console.warn(`[Open Manager] Template media: ${id} not saved`, error);
    });
  } catch (error) {
    console.warn(`[Open Manager] Template media: ${id} not saved`, error);
  }
}

function asking() {
  for (const one of claims) if (one.mode === "ask") return true;
  return false;
}

function raw(value) {
  return value?.__v_raw || value;
}

function take(entry) {
  const input = raw(entry);
  if (!input || typeof input !== "object") return;
  if (typeof input.file === "string") declared.add(input.file);
  if (typeof input.sourceRevision === "string") {
    stripped.set(input, input.sourceRevision);
    delete input.sourceRevision;
    return;
  }
  if (stripped.has(input)) return;
  for (const [key, value] of Object.entries(input)) {
    if (key !== "file" && typeof value === "string" && (URLISH.test(value) || REVISION.test(value))) {
      changed = true;
    }
  }
}

function stripTemplates(templates) {
  for (const template of templates) {
    const inputs = raw(raw(raw(template)?.io)?.inputs);
    if (Array.isArray(inputs)) for (const input of inputs) take(input);
  }
}

function stripCatalog(groups) {
  if (!Array.isArray(groups)) return;
  for (const group of groups) {
    const templates = raw(raw(group)?.templates);
    if (Array.isArray(templates)) stripTemplates(templates);
  }
}

function stripLoaded() {
  const list = raw(piniaStores()?.get("workflowTemplates")?.enhancedTemplates);
  if (Array.isArray(list)) stripTemplates(list);
}

function restore() {
  for (const [input, revision] of stripped) input.sourceRevision = revision;
  stripped.clear();
}

function noticeChange() {
  if (!changed) return;
  for (const one of [...claims]) one.standDown(CHANGED);
}

function touches(document) {
  if (!declared.size) return false;
  return loaderNames(document).some((name) => declared.has(name));
}

function hook() {
  changed = false;
  const fetchCatalog = api.getCoreWorkflowTemplates;
  const ownCatalog = Object.prototype.hasOwnProperty.call(api, "getCoreWorkflowTemplates");
  const catalog = async function (...args) {
    const found = await fetchCatalog.apply(this, args);
    if (claims.size) {
      try {
        stripCatalog(found);
      } catch (error) {
        console.warn("[Open Manager] Template media: catalog not read", error);
      }
      noticeChange();
    }
    return found;
  };

  const load = app.loadGraphData;
  const ownLoad = Object.prototype.hasOwnProperty.call(app, "loadGraphData");
  const loader = async function (graphData, ...rest) {
    if (!claims.size || !graphData || typeof graphData !== "object") {
      return load.call(this, graphData, ...rest);
    }
    const template = rest[3]?.openSource === "template";
    let given = graphData;
    let rows = [];
    if (template || touches(graphData)) {
      try {
        ({ document: given, rows } = await prepareDocument(graphData));
      } catch (error) {
        console.warn("[Open Manager] Template media: not checked", error);
        given = graphData;
        rows = [];
      }
    }
    const result = await load.call(this, given, ...rest);
    if (template && result !== false && asking()) {
      const shown = liveNames();
      offerMissing(missingRows(rows).filter((row) => shown.has(row.name)));
    }
    return result;
  };

  api.getCoreWorkflowTemplates = catalog;
  app.loadGraphData = loader;
  hooks = {
    undo() {
      if (api.getCoreWorkflowTemplates === catalog) {
        if (ownCatalog) api.getCoreWorkflowTemplates = fetchCatalog;
        else delete api.getCoreWorkflowTemplates;
      }
      if (app.loadGraphData === loader) {
        if (ownLoad) app.loadGraphData = load;
        else delete app.loadGraphData;
      }
    },
  };
  try {
    stripLoaded();
  } catch (error) {
    console.warn("[Open Manager] Template media: catalog not read", error);
  }
}

function claim(mode, standDown) {
  const token = { mode, standDown };
  claims.add(token);
  if (!hooks) hook();
  later(noticeChange);
  return () => {
    claims.delete(token);
    if (!asking()) dropOffer();
    if (claims.size || !hooks) return;
    hooks.undo();
    hooks = null;
    restore();
  };
}

function dropOffer() {
  offer?.remove();
  offer = null;
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function follow(node, text, watch) {
  node.querySelectorAll(".om-btn").forEach((button) => button.remove());
  toastShut(node);
  const show = (state) => {
    const finished = state.done + state.failed.length;
    const sized = state.size ? ` · ${bytesText(state.bytes)} of ${bytesText(state.size)}` : "";
    text.textContent = `Downloading ${finished + 1 > state.total ? state.total : finished + 1} `
      + `of ${state.total}${sized}`;
  };
  show(watch.state);
  watch.onChange(show);
  watch.finished.then((state) => {
    const failed = state.failed.length;
    if (!failed) {
      text.textContent = `${plural(state.done, "media file")} downloaded`;
      node.className = "om-toast om-toast-ok";
    } else {
      text.textContent = state.done
        ? `${state.done} of ${state.total} media files downloaded`
        : `${plural(failed, "media file")} not downloaded`;
      text.title = state.failed.map((one) => `${one.name}: ${one.reason}`).join("\n");
      node.className = "om-toast om-toast-warn";
    }
    setTimeout(() => node.remove(), failed ? FAILED_MS : DONE_MS);
  });
}

function offerMissing(rows) {
  if (!rows.length) return;
  dropOffer();
  const node = el("div", "om-toast");
  const text = el("span", "om-toast-text", `${plural(rows.length, "media file")} missing`);
  text.title = rows.map((row) => row.name).join("\n");
  const go = el("button", "om-btn om-go", "Download");
  const skip = el("button", "om-btn", "Ignore");
  node.append(text, go, skip);
  toastHost().appendChild(node);
  offer = node;
  skip.onclick = () => {
    if (offer === node) dropOffer();
    else node.remove();
  };
  go.onclick = async () => {
    go.disabled = true;
    skip.disabled = true;
    let watch = null;
    try {
      watch = await fetchMedia(rows);
    } catch (error) {
      console.warn("[Open Manager] Template media: not downloaded", error);
    }
    if (!node.isConnected) return;
    if (!watch) {
      go.disabled = false;
      skip.disabled = false;
      return;
    }
    if (offer === node) offer = null;
    follow(node, text, watch);
  };
}

export { ready, claim, later, readSetting, writeSetting };
