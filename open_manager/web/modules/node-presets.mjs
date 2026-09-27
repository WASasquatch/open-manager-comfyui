import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import { el, toast, notify, askText, confirmAction, openRowMenu } from "./ui.mjs";
import { panelSetting } from "./settings.mjs";
import { createFloatingPanel, floatingPanel } from "./windows.mjs";

const PRESET_COMMAND = "openmanager.nodePresets";

const PRESET_LABEL = "Node presets";

const PRESET_ICON = "icon-[lucide--sliders-horizontal]";

const PRESET_FILE = "open_manager/node-presets.json";

const PRESET_EXTRA = "om_node_presets";

const NAME_CAP = 80;

const PRESET_BYTES = 256 * 1024;

const TYPE_PRESETS_CAP = 200;

let library = { v: 1, types: {} };

let libraryLoad = null;

let libraryQueue = Promise.resolve();

const targets = new Map();

const rolled = new Set();

const widened = new Set();

function presetsOn() {
  return panelSetting("openManager.nodePresets", true) !== false;
}

function presetKey(type) {
  return `presets:${type}`;
}

function presetId() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function plainValue(value) {
  if (value === null) return true;
  const kind = typeof value;
  if (kind === "string" || kind === "boolean") return true;
  if (kind === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(plainValue);
  if (kind === "object") {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return false;
    return Object.values(value).every(plainValue);
  }
  return false;
}

function cleanPreset(raw) {
  if (!raw || typeof raw !== "object") return null;
  const name = String(raw.name ?? "").trim().slice(0, NAME_CAP);
  const id = /^[0-9a-f]{8,32}$/.test(String(raw.id || "")) ? String(raw.id) : presetId();
  const values = raw.values;
  if (!name || !values || typeof values !== "object" || Array.isArray(values)) return null;
  const kept = {};
  for (const [key, value] of Object.entries(values)) {
    if (!key || !plainValue(value)) continue;
    kept[key.slice(0, 200)] = value;
  }
  if (!Object.keys(kept).length) return null;
  const preset = { id, name, values: kept, at: Number(raw.at) || 0 };
  if (raw.noWorkflow === true) preset.noWorkflow = true;
  try {
    if (JSON.stringify(preset).length > PRESET_BYTES) return null;
  } catch {
    return null;
  }
  return preset;
}

function cleanList(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of list.slice(0, TYPE_PRESETS_CAP)) {
    const preset = cleanPreset(raw);
    if (!preset || seen.has(preset.id)) continue;
    seen.add(preset.id);
    out.push(preset);
  }
  return out;
}

async function readLibrary() {
  const answer = await api.getUserData(PRESET_FILE);
  if (answer.status === 404) return { v: 1, types: {} };
  if (!answer.ok) throw new Error(`status ${answer.status}`);
  const held = await answer.json();
  const types = {};
  for (const [type, entry] of Object.entries(held?.types || {})) {
    if (!type || !entry || typeof entry !== "object") continue;
    const presets = cleanList(entry.presets);
    if (presets.length) types[type] = { presets };
  }
  return { v: 1, types };
}

async function loadLibrary() {
  if (libraryLoad) return libraryLoad;
  libraryLoad = readLibrary().then((fresh) => {
    library = fresh;
    return library;
  });
  try {
    return await libraryLoad;
  } finally {
    libraryLoad = null;
  }
}

function editLibrary(change) {
  const run = async () => {
    try {
      await loadLibrary();
    } catch {
      notify("Presets not saved", "The preset library could not be read.");
      return false;
    }
    if (change() === false) return false;
    try {
      await api.storeUserData(PRESET_FILE, library,
        { overwrite: true, stringify: true, throwOnError: true, full_info: false });
    } catch {
      notify("Presets not saved", "The preset library could not be written.");
      return false;
    }
    return true;
  };
  libraryQueue = libraryQueue.then(run, run);
  return libraryQueue;
}

function libraryEntry(type, make = false) {
  const held = library.types[type];
  if (held || !make) return held || null;
  library.types[type] = { presets: [] };
  return library.types[type];
}

function libraryTidy(type) {
  const held = library.types[type];
  if (held && !held.presets.length) delete library.types[type];
}

function rootGraph() {
  return app.rootGraph || app.graph || null;
}

function workflowPresets(type) {
  const extra = rootGraph()?.extra;
  const held = extra?.[PRESET_EXTRA];
  if (!held || typeof held !== "object") return [];
  return cleanList(held[type]);
}

function workflowWrite(type, list) {
  const graph = rootGraph();
  if (!graph) return;
  if (!graph.extra || typeof graph.extra !== "object") graph.extra = {};
  const extra = graph.extra;
  const held = extra[PRESET_EXTRA] && typeof extra[PRESET_EXTRA] === "object"
    ? extra[PRESET_EXTRA] : {};
  if (list.length) {
    held[type] = list.map(({ noWorkflow, ...one }) => structuredClone(one));
  }
  else delete held[type];
  if (Object.keys(held).length) extra[PRESET_EXTRA] = held;
  else delete extra[PRESET_EXTRA];
  markChanged();
}

function markChanged() {
  try { app.graph?.change?.(); } catch {}
  try { app.extensionManager?.workflow?.activeWorkflow?.changeTracker?.checkState?.(); } catch {}
}

function presetWidgets(node) {
  const seen = new Set();
  const out = [];
  for (const widget of node?.widgets || []) {
    const name = widget?.name;
    if (!name || seen.has(name)) continue;
    if (widget.type === "button" || widget.serialize === false) continue;
    if (widget.options?.serialize === false) continue;
    if (!plainValue(widget.value)) continue;
    seen.add(name);
    out.push(widget);
  }
  return out;
}

function nodeValues(node) {
  const values = {};
  for (const widget of presetWidgets(node)) values[widget.name] = structuredClone(widget.value);
  return values;
}

function comboAllows(widget, value) {
  if (widget.type !== "combo") return true;
  let options = widget.options?.values;
  if (typeof options === "function") {
    try { options = options(widget, widget.node); } catch { return true; }
  }
  return !Array.isArray(options) || options.includes(value);
}

function applyValues(node, values) {
  const done = new Set();
  const missing = new Set();
  for (let pass = 0; pass < 2; pass += 1) {
    for (const widget of presetWidgets(node)) {
      if (done.has(widget.name) || !Object.hasOwn(values, widget.name)) continue;
      const value = structuredClone(values[widget.name]);
      done.add(widget.name);
      if (!comboAllows(widget, value)) {
        missing.add(widget.name);
        continue;
      }
      widget.value = value;
      try { widget.callback?.(widget.value, app.canvas, node, undefined, undefined); } catch {}
    }
  }
  node.setDirtyCanvas?.(true, true);
  return [...missing];
}

function presetType(node) {
  return String(node?.comfyClass || node?.type || "");
}

function presetTitle(node, type) {
  return String(node?.constructor?.title || window.LiteGraph?.registered_node_types?.[type]?.title
    || type);
}

function selectedNodes() {
  return Object.values(app.canvas?.selected_nodes || {});
}

function presetSelection() {
  const picked = selectedNodes();
  if (!picked.length) return null;
  const type = presetType(picked[0]);
  if (!type || picked.some((node) => presetType(node) !== type)) return null;
  if (!picked.every((node) => presetWidgets(node).length)) return null;
  return { type, nodes: picked };
}

function targetNodes(type) {
  const held = targets.get(type);
  if (!held) return [];
  return held.nodes.filter((node) => node.graph && presetType(node) === type
    && node.graph.getNodeById?.(node.id) === node);
}

function mergedPresets(type) {
  const mine = libraryEntry(type)?.presets || [];
  const stored = workflowPresets(type);
  const storedIds = new Set(stored.map((one) => one.id));
  const rows = mine.map((one) => ({ preset: one, mine: true, stored: storedIds.has(one.id) }));
  const mineIds = new Set(mine.map((one) => one.id));
  for (const one of stored) {
    if (!mineIds.has(one.id)) rows.push({ preset: one, mine: false, stored: true });
  }
  return rows;
}

function workflowPut(type, preset) {
  const list = workflowPresets(type).filter((one) => one.id !== preset.id);
  list.push(preset);
  workflowWrite(type, list);
}

function workflowDrop(type, id) {
  const list = workflowPresets(type);
  const kept = list.filter((one) => one.id !== id);
  if (kept.length !== list.length) workflowWrite(type, kept);
}

function workflowReplace(type, preset) {
  const list = workflowPresets(type);
  const at = list.findIndex((one) => one.id === preset.id);
  if (at < 0) return;
  list[at] = preset;
  workflowWrite(type, list);
}

function nameTaken(type, name, except = "") {
  const want = name.toLowerCase();
  return mergedPresets(type).find((row) => row.preset.id !== except
    && row.preset.name.toLowerCase() === want) || null;
}

function copyValue(key, text) {
  const writing = navigator.clipboard?.writeText?.(text);
  if (!writing) { notify("Not copied", "The clipboard is not available here."); return; }
  writing
    .then(() => toast(`${key} copied.`, { kind: "ok" }))
    .catch(() => notify("Not copied", "The clipboard is not available here."));
}

function valueLine(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
}

function libraryPut(type, preset) {
  const entry = libraryEntry(type, true);
  const at = entry.presets.findIndex((one) => one.id === preset.id);
  if (at >= 0) entry.presets[at] = { ...entry.presets[at], ...preset };
  else if (preset.values) entry.presets.push(preset);
  else return false;
  return true;
}

async function savePreset(type, name) {
  const nodes = targetNodes(type);
  if (!nodes.length) { toast("The node is no longer in this graph."); return false; }
  const values = nodeValues(nodes[0]);
  if (!Object.keys(values).length) { toast("This node has no values to keep."); return false; }
  const clash = nameTaken(type, name);
  if (clash) {
    const replace = await confirmAction(`Replace "${clash.preset.name}"?`, "", "Replace", true);
    if (!replace) return false;
    return updatePreset(type, clash, nodes[0], name);
  }
  const preset = { id: presetId(), name, values, at: Date.now() };
  if (!(await editLibrary(() => { libraryPut(type, preset); }))) return false;
  workflowPut(type, preset);
  toast(`Saved ${name}.`, { kind: "ok" });
  return true;
}

async function updatePreset(type, row, node, name = row.preset.name) {
  const values = nodeValues(node);
  if (!Object.keys(values).length) { toast("This node has no values to keep."); return false; }
  const { noWorkflow, ...base } = row.preset;
  const preset = { ...base, name, values, at: Date.now() };
  if (row.mine && !(await editLibrary(() => libraryPut(type, preset)))) return false;
  if (row.stored) workflowReplace(type, preset);
  toast(`Updated ${name}.`, { kind: "ok" });
  return true;
}

function applyPreset(type, row, only = "") {
  const nodes = targetNodes(type);
  if (!nodes.length) { toast("The node is no longer in this graph."); return; }
  const values = only ? { [only]: row.preset.values[only] } : row.preset.values;
  const what = only || row.preset.name;
  const missing = new Set();
  const absent = new Set();
  for (const node of nodes) {
    for (const name of applyValues(node, values)) missing.add(name);
    if (only && !presetWidgets(node).some((widget) => widget.name === only)) absent.add(node.id);
  }
  markChanged();
  app.canvas?.setDirty?.(true, true);
  if (absent.size === nodes.length) { toast(`This node has no ${only} widget.`); return; }
  if (missing.size) {
    notify(`Applied ${what}`,
      `Not available here, left as they were: ${[...missing].join(", ")}.`);
    return;
  }
  toast(`Applied ${what}${nodes.length > 1 ? ` to ${nodes.length} nodes` : ""}.`,
    { kind: "ok" });
}

async function renamePreset(type, row) {
  const asked = await askText("Rename preset", row.preset.name, "Rename");
  const name = String(asked || "").trim().slice(0, NAME_CAP);
  if (!name || name === row.preset.name) return false;
  if (nameTaken(type, name, row.preset.id)) { toast(`${name} is already a preset here.`); return false; }
  if (row.mine && !(await editLibrary(() => libraryPut(type, { id: row.preset.id, name })))) {
    return false;
  }
  if (row.stored) {
    const { noWorkflow, ...base } = row.preset;
    workflowReplace(type, { ...base, name });
  }
  return true;
}

async function keepPreset(type, row) {
  const { noWorkflow, ...base } = row.preset;
  if (!(await editLibrary(() => { libraryPut(type, structuredClone(base)); }))) return false;
  toast(`Kept ${row.preset.name}.`, { kind: "ok" });
  return true;
}

async function deletePreset(type, row) {
  const ok = await confirmAction(`Delete "${row.preset.name}"?`, "", "Delete", true);
  if (!ok) return false;
  if (row.mine) {
    const done = await editLibrary(() => {
      const entry = libraryEntry(type);
      if (entry) entry.presets = entry.presets.filter((one) => one.id !== row.preset.id);
      libraryTidy(type);
    });
    if (!done) return false;
  }
  if (row.stored) workflowDrop(type, row.preset.id);
  return true;
}

async function setStoreOff(type, row, off) {
  let held = null;
  const done = await editLibrary(() => {
    held = libraryEntry(type)?.presets.find((one) => one.id === row.preset.id) || null;
    if (!held) return false;
    if (off) held.noWorkflow = true;
    else delete held.noWorkflow;
    return true;
  });
  if (!done || !held) return false;
  if (off) workflowDrop(type, held.id);
  else workflowPut(type, held);
  return true;
}

function presetRow(type, row, redraw) {
  const open = rolled.has(row.preset.id);
  const node = el("div", `om-preset-row${open ? " om-preset-open" : ""}`);
  const head = el("div", "om-preset-head");
  const fold = el("button", "om-preset-fold", open ? "▾" : "▸");
  fold.title = open ? "Collapse" : "Expand";
  fold.setAttribute("aria-expanded", String(open));
  const roll = () => {
    if (rolled.has(row.preset.id)) rolled.delete(row.preset.id);
    else rolled.add(row.preset.id);
    redraw();
  };
  fold.onclick = roll;
  head.appendChild(fold);
  const title = el("span", "om-preset-name", row.preset.name);
  title.onclick = roll;
  head.appendChild(title);
  const marks = el("span", "om-preset-marks");
  if (row.mine) marks.appendChild(el("span", "om-chip", "Library"));
  if (row.stored) marks.appendChild(el("span", "om-chip", "Workflow"));
  head.appendChild(marks);
  const apply = el("button", "om-btn om-go", "Apply");
  apply.onclick = () => applyPreset(type, row);
  head.appendChild(apply);
  const more = el("button", "om-btn om-preset-more", "⋮");
  more.title = "More";
  more.setAttribute("aria-label", "More");
  const act = (fn) => async () => { if (await fn()) redraw(); };
  more.onclick = () => {
    const items = [
      {
        label: "Update from node",
        fn: act(() => {
          const nodes = targetNodes(type);
          if (!nodes.length) { toast("The node is no longer in this graph."); return false; }
          return updatePreset(type, row, nodes[0]);
        }),
      },
      { label: "Rename", fn: act(() => renamePreset(type, row)) },
    ];
    if (!row.mine) items.push({ label: "Keep in library", fn: act(() => keepPreset(type, row)) });
    items.push({ label: "Delete", danger: true, fn: act(() => deletePreset(type, row)) });
    openRowMenu(more, { items, align: "right" });
  };
  head.appendChild(more);
  node.appendChild(head);
  const entries = Object.entries(row.preset.values);
  const meta = el("div", "om-preset-meta");
  if (!open) {
    const summary = entries.slice(0, 4).map(([key, value]) => `${key}: ${valueLine(value)}`);
    if (entries.length > 4) summary.push(`+${entries.length - 4}`);
    meta.appendChild(el("div", "om-preset-values", summary.join("  ·  ")));
    node.title = entries.map(([key, value]) => `${key}: ${valueLine(value)}`).join("\n");
  }
  if (row.mine) {
    const toggle = el("label", "om-deskset-switch om-preset-store");
    const box = el("input");
    box.type = "checkbox";
    box.checked = row.preset.noWorkflow === true;
    box.onchange = async () => {
      if (!(await setStoreOff(type, row, box.checked))) box.checked = !box.checked;
      redraw();
    };
    toggle.appendChild(box);
    toggle.appendChild(el("span", null, "No Workflow Store"));
    meta.appendChild(toggle);
  }
  if (meta.childNodes.length) node.appendChild(meta);
  if (!open) return node;
  const fields = el("div", "om-preset-fields");
  const fieldsHead = el("div", "om-preset-fields-head");
  fieldsHead.appendChild(el("span", "om-preset-count",
    `${entries.length} value${entries.length === 1 ? "" : "s"}`));
  const listing = el("div", "om-preset-field-list");
  const shown = [];
  for (const [key, value] of entries) {
    const text = typeof value === "string" ? value : JSON.stringify(value);
    const field = el("div", "om-preset-field");
    const mark = `${row.preset.id}:${key}`;
    const long = text.length > 90 || text.includes("\n");
    const keyNode = el("span", "om-preset-key", key);
    keyNode.title = key;
    field.appendChild(keyNode);
    const full = el("div", "om-preset-full", text === "" ? "(empty)" : text);
    if (text === "") full.classList.add("om-preset-blank");
    if (long) {
      field.classList.add("om-preset-long");
      field.classList.toggle("om-preset-field-open", widened.has(mark));
      full.title = widened.has(mark) ? "Collapse" : "Expand";
      full.onclick = () => {
        if (window.getSelection?.()?.toString()) return;
        const on = !widened.has(mark);
        if (on) widened.add(mark);
        else widened.delete(mark);
        field.classList.toggle("om-preset-field-open", on);
        full.title = on ? "Collapse" : "Expand";
      };
    }
    field.appendChild(full);
    const acts = el("span", "om-preset-acts");
    const copy = el("button", "om-btn om-preset-use", "Copy");
    copy.title = `Copy ${key}`;
    copy.onclick = () => copyValue(key, text);
    acts.appendChild(copy);
    const use = el("button", "om-btn om-preset-use", "Apply");
    use.title = `Apply ${key}`;
    use.onclick = () => applyPreset(type, row, key);
    acts.appendChild(use);
    field.appendChild(acts);
    listing.appendChild(field);
    shown.push({ field, hay: `${key}\n${text}`.toLowerCase() });
  }
  if (entries.length > 8) {
    const filter = el("input", "om-search om-preset-filter");
    filter.placeholder = "Filter";
    filter.spellcheck = false;
    filter.oninput = () => {
      const want = filter.value.trim().toLowerCase();
      for (const one of shown) one.field.hidden = !!want && !one.hay.includes(want);
    };
    fieldsHead.appendChild(filter);
  }
  fields.appendChild(fieldsHead);
  fields.appendChild(listing);
  node.appendChild(fields);
  return node;
}

function paintPresets(panel, type) {
  const body = panel.body;
  body.replaceChildren();
  const wrap = el("div", "om-presets");

  const saveRow = el("div", "om-preset-save");
  const input = el("input", "om-search");
  input.placeholder = "Preset name";
  input.maxLength = NAME_CAP;
  input.spellcheck = false;
  const save = el("button", "om-btn om-go", "Save");
  const redraw = () => paintPresets(panel, type);
  save.onclick = async () => {
    const name = input.value.trim().slice(0, NAME_CAP);
    if (!name) { input.focus(); return; }
    if (await savePreset(type, name)) redraw();
  };
  input.addEventListener("keydown", (event) => { if (event.key === "Enter") save.click(); });
  saveRow.appendChild(input);
  saveRow.appendChild(save);
  wrap.appendChild(saveRow);


  const rows = mergedPresets(type);
  const list = el("div", "om-preset-list");
  if (!rows.length) list.appendChild(el("div", "om-preset-empty", "No presets"));
  for (const row of rows) list.appendChild(presetRow(type, row, redraw));
  wrap.appendChild(list);
  body.appendChild(wrap);

  const nodes = targetNodes(type);
  panel.setBadge(nodes.length > 1 ? `${nodes.length} nodes`
    : nodes.length ? `#${nodes[0].id}` : "");
}

async function openPresets(selection = presetSelection()) {
  if (!selection) { toast("Select nodes of one type."); return null; }
  const { type, nodes } = selection;
  targets.set(type, { nodes });
  try {
    await loadLibrary();
  } catch {
    notify("Presets not loaded", "The preset library could not be read.");
  }
  const key = presetKey(type);
  let panel = floatingPanel(key);
  if (!panel) {
    panel = createFloatingPanel({
      key,
      title: `Presets: ${presetTitle(nodes[0], type)}`,
      width: 420,
      height: 460,
      modal: false,
      onClose: () => targets.delete(type),
    });
  }
  panel.present();
  paintPresets(panel, type);
  return panel;
}

function presetLabels() {
  let vue = null;
  try { vue = document.getElementById("vue-app")?.__vue_app__; } catch {}
  const i18n = vue?._context?.provides?.[vue?.__VUE_I18N_SYMBOL__]?.global;
  if (typeof i18n?.mergeLocaleMessage !== "function") return false;
  const key = PRESET_COMMAND.replace(/\./g, "_");
  const locale = typeof i18n.locale === "string" ? i18n.locale : i18n.locale?.value;
  for (const one of new Set(["en", locale].filter(Boolean))) {
    try { i18n.mergeLocaleMessage(one, { commands: { [key]: { label: PRESET_LABEL } } }); } catch {}
  }
  return true;
}

function watchPresetLabels(tries = 0) {
  if (presetLabels() || tries >= 40) return;
  setTimeout(() => watchPresetLabels(tries + 1), 500);
}

const presetCommand = {
  id: PRESET_COMMAND,
  label: PRESET_LABEL,
  icon: PRESET_ICON,
  function: () => { openPresets().catch(() => {}); },
};

function presetToolboxCommands(item) {
  if (!presetsOn() || !item || !Array.isArray(item.widgets)) return [];
  return presetSelection() ? [PRESET_COMMAND] : [];
}

export { presetCommand, presetToolboxCommands, watchPresetLabels, openPresets };
