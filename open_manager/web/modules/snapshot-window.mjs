import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import { API, ICON_SNAPSHOTS } from "./base.mjs";
import { el, toast, notify, askText, confirmAction, openRowMenu, liveTip } from "./ui.mjs";
import { createFloatingPanel, floatingPanel, windowSize } from "./windows.mjs";
import { activeWorkflow, watchActiveWorkflow, workflowGraph, loadWorkflow } from "./workflows.mjs";
import { programRows, runProgramById } from "./programs.mjs";
import { SNAP_NAME_CAP, SNAP_ORIGIN_NAMES, openBook, takeSnapshot, applySnapshot, openSnapshotTab, renameSnapshot, deleteSnapshot, snapshotGraph, compareGraphs, cleanGraph, liveSig, watchBooks, agoText } from "./snapshot-store.mjs";

const WIN_KEY = "snapshots";

const CURRENT = "current";

const COLUMNS_CAP = 6;

const ROWS_CAP = 1500;

const TIMER_CHANNEL = "open_manager.timer";

const MODE_VALUES = { Always: 0, "On event": 1, Never: 2, "On trigger": 3, Bypass: 4 };

const view = {
  panel: null, workflow: null, book: null, picked: [CURRENT], only: true, filter: "",
  runs: new Map(), ticket: 0, due: 0, runsDue: 0, stops: [], parts: null,
};

function span(seconds) {
  const value = Math.max(0, Number(seconds) || 0);
  if (value < 0.9995) return `${Math.round(value * 1000)}ms`;
  if (value < 59.95) return `${value.toFixed(value < 9.995 ? 2 : 1)}s`;
  const whole = Math.floor(value);
  const minutes = Math.floor(whole / 60);
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
  return `${minutes}m ${String(whole % 60).padStart(2, "0")}s`;
}

function textOf(value) {
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}

function timerHere() {
  return programRows.some((one) => one.key === "timer");
}

async function readRuns() {
  const runs = new Map();
  try {
    const answer = await (await api.fetchApi(`${API}/timer`)).json();
    for (const run of answer?.ok ? answer.runs || [] : []) {
      const id = String(run?.snapshot?.id || "");
      if (!id) continue;
      const held = runs.get(id) || { count: 0, last: null, ids: [] };
      held.count += 1;
      held.ids.push(String(run.id));
      if (run.state === "done" && (!held.last || run.started > held.last.started)) held.last = run;
      runs.set(id, held);
    }
  } catch {
  }
  return runs;
}

function refreshRuns() {
  clearTimeout(view.runsDue);
  view.runsDue = setTimeout(async () => {
    if (!view.panel?.el.isConnected) return;
    view.runs = await readRuns();
    paintSide();
    void paintTable();
  }, 600);
}

function runLine(id) {
  const held = view.runs.get(id);
  if (!held) return "";
  const runs = `${held.count} run${held.count === 1 ? "" : "s"}`;
  return held.last ? `${runs} · ${span(held.last.elapsed)}` : runs;
}

function markChanged() {
  try { app.graph?.change?.(); } catch {}
  try { activeWorkflow()?.changeTracker?.captureCanvasState?.(); } catch {}
  try { app.canvas?.setDirty?.(true, true); } catch {}
}

function liveNode(row) {
  const root = app.rootGraph || app.graph;
  const graph = row.scope ? root?.subgraphs?.get?.(row.scope) : root;
  return graph?.getNodeById?.(row.id) || null;
}

function comboAllows(widget, value) {
  if (widget.type !== "combo") return true;
  let options = widget.options?.values;
  if (typeof options === "function") {
    try { options = options(widget, widget.node); } catch { return true; }
  }
  return !Array.isArray(options) || options.includes(value);
}

function putField(node, field, value) {
  if (field.kind === "mode") {
    if (!Object.hasOwn(MODE_VALUES, value)) return false;
    node.mode = MODE_VALUES[value];
    return true;
  }
  if (field.kind !== "widget" || value === undefined) return false;
  const widget = (node.widgets || []).find((one) => one?.name === field.name);
  if (!widget || !comboAllows(widget, value)) return false;
  widget.value = JSON.parse(JSON.stringify(value));
  try { widget.callback?.(widget.value, app.canvas, node, undefined, undefined); } catch {}
  return true;
}

async function onCanvas() {
  if (activeWorkflow() !== view.workflow) await loadWorkflow(view.workflow);
  return activeWorkflow() === view.workflow;
}

async function applyField(row, field, value) {
  if (!(await onCanvas())) return;
  const node = liveNode(row);
  if (!node) { toast(`#${row.id} is not in the current graph.`); return; }
  if (!putField(node, field, value)) { toast(`${field.label} is not available here.`); return; }
  node.setDirtyCanvas?.(true, true);
  markChanged();
  toast(`Applied ${field.label}.`, { kind: "ok" });
}

async function applyNode(row, column) {
  if (!(await onCanvas())) return;
  const node = liveNode(row);
  if (!node) { toast(`#${row.id} is not in the current graph.`); return; }
  const missed = [];
  for (const field of row.fields) {
    if (field.kind === "links") continue;
    const value = field.values[column];
    if (value === undefined) continue;
    if (!putField(node, field, value)) missed.push(field.label);
  }
  node.setDirtyCanvas?.(true, true);
  markChanged();
  if (missed.length) {
    notify(`Applied ${row.title}`, `Not available here, left as they were: ${missed.join(", ")}.`);
    return;
  }
  toast(`Applied ${row.title}.`, { kind: "ok" });
}

function copyText(label, text) {
  const writing = navigator.clipboard?.writeText?.(text);
  if (!writing) { notify("Not copied", "The clipboard is not available here."); return; }
  writing.then(() => toast(`${label} copied.`, { kind: "ok" }))
    .catch(() => notify("Not copied", "The clipboard is not available here."));
}

function itemOf(id) {
  return view.book?.items.find((one) => one.id === id) || null;
}

function pickedIds() {
  return view.picked.filter((id) => id === CURRENT || itemOf(id));
}

function togglePick(id) {
  const now = pickedIds();
  if (now.includes(id)) {
    view.picked = now.filter((one) => one !== id);
  } else {
    if (now.length >= COLUMNS_CAP) { toast(`${COLUMNS_CAP} columns at most.`); return; }
    view.picked = [...now, id];
  }
  paintSide();
  void paintTable();
}

async function loadSnapshot(id) {
  const item = itemOf(id);
  if (!item) return;
  try {
    if (await applySnapshot(view.workflow, id)) toast(`Loaded ${item.name}.`, { kind: "ok" });
  } catch (error) {
    notify("Snapshot not loaded", `${item.name} could not be loaded: ${error.message}`);
  }
}

function snapshotMenu(anchor, id) {
  const item = itemOf(id);
  if (!item) return;
  openRowMenu(anchor, {
    align: "right",
    items: [
      { label: "Rename", fn: async () => {
        const asked = await askText("Rename snapshot", item.name, "Rename");
        if (asked) await renameSnapshot(view.book, id, asked.slice(0, SNAP_NAME_CAP));
      } },
      { label: "Open in new tab", fn: () => {
        openSnapshotTab(view.workflow, id).catch((error) => {
          notify("Not opened", `${item.name} could not be opened: ${error.message}`);
        });
      } },
      { label: "Delete", danger: true, fn: async () => {
        if (!(await confirmAction(`Delete "${item.name}"?`, "", "Delete", true))) return;
        await deleteSnapshot(view.book, id);
      } },
    ],
  });
}

async function takeFromWindow(input) {
  if (!view.workflow) return;
  try {
    const item = await takeSnapshot(view.workflow, { name: input.value });
    if (!item) return;
    input.value = "";
    if (!view.picked.includes(item.id) && pickedIds().length < COLUMNS_CAP) {
      view.picked = [...pickedIds(), item.id];
    }
    toast(`Took ${item.name}.`, { kind: "ok" });
  } catch {
    notify("Snapshot not taken", "The snapshot store could not be read.");
  }
}

function sideRow(id, { name, meta = "", match = false, runs = "" }) {
  const on = view.picked.includes(id);
  const row = el("div", `om-snap-row${on ? " om-snap-row-on" : ""}`);
  row.tabIndex = 0;
  row.setAttribute("role", "checkbox");
  row.setAttribute("aria-checked", on ? "true" : "false");
  const box = el("span", "om-snap-check", on ? "✓" : "");
  row.appendChild(box);
  const text = el("div", "om-snap-text");
  const head = el("div", "om-snap-name");
  if (match) head.appendChild(el("span", "om-snap-dot"));
  head.appendChild(el("span", "om-snap-label", name));
  text.appendChild(head);
  if (meta) text.appendChild(el("div", "om-snap-meta", meta));
  if (runs) text.appendChild(el("div", "om-snap-runs", runs));
  row.appendChild(text);
  row.addEventListener("click", (event) => {
    if (event.target.closest("button")) return;
    togglePick(id);
  });
  row.addEventListener("keydown", (event) => {
    if (event.target !== row || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    togglePick(id);
  });
  if (id !== CURRENT) {
    const acts = el("span", "om-snap-acts");
    const load = el("button", "om-btn om-snap-load", "Load");
    load.onclick = () => loadSnapshot(id);
    acts.appendChild(load);
    const more = el("button", "om-btn om-snap-more", "⋮");
    more.title = "More";
    more.setAttribute("aria-label", "More");
    more.onclick = () => snapshotMenu(more, id);
    acts.appendChild(more);
    row.appendChild(acts);
  }
  return row;
}

function paintSide() {
  const parts = view.parts;
  if (!parts || !view.book) return;
  const sig = liveSig(view.workflow);
  const rows = [sideRow(CURRENT, { name: "Current" })];
  for (const item of view.book.items) {
    const said = [agoText(item.at)];
    if (item.origin !== "manual" && !item.name.startsWith(SNAP_ORIGIN_NAMES[item.origin])) {
      said.push(SNAP_ORIGIN_NAMES[item.origin]);
    }
    if (item.summary) said.push(item.summary);
    rows.push(sideRow(item.id, { name: item.name, meta: said.join(" · "),
                                 match: !!sig && item.sig === sig, runs: runLine(item.id) }));
  }
  parts.list.replaceChildren(...rows);
  if (!view.book.items.length) parts.list.appendChild(el("div", "om-snap-empty", "No snapshots"));
  const runnable = pickedIds().some((id) => view.runs.get(id)?.last);
  parts.runs.hidden = !timerHere();
  parts.runs.disabled = !runnable;
  view.panel?.setBadge(String(view.workflow?.filename || ""));
}

function headCell(id, at) {
  const cell = el("th", "om-snap-col");
  const top = el("div", "om-snap-col-top");
  const item = itemOf(id);
  top.appendChild(el("span", "om-snap-col-name", item ? item.name : "Current"));
  const drop = el("button", "om-snap-col-x", "×");
  drop.title = "Remove column";
  drop.setAttribute("aria-label", "Remove column");
  drop.onclick = () => togglePick(id);
  top.appendChild(drop);
  cell.appendChild(top);
  if (item) {
    cell.appendChild(el("div", "om-snap-col-meta", agoText(item.at)));
    const runs = runLine(id);
    if (runs) cell.appendChild(el("div", "om-snap-col-runs", runs));
    const load = el("button", "om-btn om-snap-col-load", "Load");
    load.onclick = () => loadSnapshot(id);
    cell.appendChild(load);
  } else if (view.workflow?.isModified) {
    cell.appendChild(el("div", "om-snap-col-meta", "Unsaved changes"));
  }
  if (at === 0) cell.classList.add("om-snap-col-base");
  return cell;
}

function valueCell(row, field, column, ids) {
  const value = field.values[column];
  const cell = el("td", "om-snap-cell");
  if (value === undefined) {
    cell.classList.add("om-snap-none");
    cell.appendChild(el("span", "om-snap-value", "none"));
    return cell;
  }
  const base = field.values[0];
  if (column > 0 && textOf(value) !== textOf(base)) cell.classList.add("om-snap-diff");
  const text = textOf(value);
  const shown = el("div", "om-snap-value", text === "" ? "(empty)" : text);
  if (text === "") shown.classList.add("om-snap-blank");
  if (text.length > 120 || text.includes("\n")) {
    shown.classList.add("om-snap-long");
    shown.onclick = () => {
      if (window.getSelection?.()?.toString()) return;
      shown.classList.toggle("om-snap-open");
    };
  }
  cell.appendChild(shown);
  const acts = el("span", "om-snap-cell-acts");
  const copy = el("button", "om-btn om-snap-use", "Copy");
  copy.onclick = () => copyText(field.label, text);
  acts.appendChild(copy);
  const current = ids.indexOf(CURRENT);
  const held = current >= 0 && textOf(field.values[current]) === text;
  if (ids[column] !== CURRENT && field.kind !== "links" && !held) {
    const use = el("button", "om-btn om-snap-use", "Apply");
    use.onclick = () => applyField(row, field, value);
    acts.appendChild(use);
  }
  cell.appendChild(acts);
  return cell;
}

function nodeCell(row, column, ids) {
  const cell = el("td", "om-snap-cell om-snap-node-cell");
  if (!row.present[column]) {
    cell.classList.add("om-snap-none");
    cell.appendChild(el("span", "om-snap-value", "none"));
    return cell;
  }
  const current = ids.indexOf(CURRENT);
  const held = current >= 0 && row.present[current] && row.fields.every((field) => (
    field.kind === "links" || textOf(field.values[column]) === textOf(field.values[current])));
  if (ids[column] !== CURRENT && !held) {
    const use = el("button", "om-btn om-snap-use", "Apply node");
    use.onclick = () => applyNode(row, column);
    cell.appendChild(use);
  }
  return cell;
}

function rowWanted(row, want) {
  if (!want) return true;
  const hay = `#${row.id} ${row.title} ${row.type} ${row.scopeName}`.toLowerCase();
  return hay.includes(want);
}

async function paintTable() {
  const parts = view.parts;
  if (!parts || !view.book || !view.workflow) return;
  const ticket = ++view.ticket;
  const ids = pickedIds();
  const graphs = await Promise.all(ids.map(async (id) => {
    if (id === CURRENT) return workflowGraph(view.workflow);
    try { return await snapshotGraph(view.book, id); } catch { return null; }
  }));
  if (ticket !== view.ticket || !parts.table.isConnected) return;
  parts.table.replaceChildren();
  parts.wrap.hidden = !ids.length;
  if (!ids.length) {
    parts.note.textContent = "";
    return;
  }
  const rows = compareGraphs(graphs.map((graph) => (graph ? cleanGraph(graph) : null)));
  const only = view.only && ids.length > 1;
  const want = view.filter.trim().toLowerCase();
  const head = el("thead");
  const headRow = el("tr");
  headRow.appendChild(el("th", "om-snap-corner", "Node"));
  ids.forEach((id, at) => headRow.appendChild(headCell(id, at)));
  head.appendChild(headRow);
  const body = el("tbody");
  let drawn = 0;
  let differ = 0;
  let total = 0;
  for (const row of rows) {
    if (!row.same) differ += 1;
    if (only && row.same) continue;
    const named = rowWanted(row, want);
    const fields = row.fields.filter((field) => (!only || !field.same)
      && (named || field.label.toLowerCase().includes(want)));
    if (!named && !fields.length) continue;
    total += 1 + fields.length;
    if (drawn >= ROWS_CAP) continue;
    const nodeRow = el("tr", "om-snap-node");
    const label = el("th", "om-snap-node-name");
    label.appendChild(el("span", "om-snap-node-id", `#${row.id}`));
    label.appendChild(el("span", "om-snap-node-title",
                         row.scopeName ? `${row.scopeName} › ${row.title}` : row.title));
    liveTip(label, () => ({ lead: row.title, facts: [["Type", row.type], ["Node", `#${row.id}`],
                                                       ["Subgraph", row.scopeName]] }));
    nodeRow.appendChild(label);
    ids.forEach((_, at) => nodeRow.appendChild(nodeCell(row, at, ids)));
    body.appendChild(nodeRow);
    drawn += 1;
    for (const field of fields) {
      if (drawn >= ROWS_CAP) break;
      const line = el("tr", `om-snap-field${field.same ? "" : " om-snap-field-diff"}`);
      line.appendChild(el("th", "om-snap-field-name", field.label));
      ids.forEach((_, at) => line.appendChild(valueCell(row, field, at, ids)));
      body.appendChild(line);
      drawn += 1;
    }
  }
  parts.table.append(head, body);
  const notes = [];
  if (ids.length > 1) notes.push(differ ? `${differ} of ${rows.length} nodes differ` : "No differences");
  else notes.push(`${rows.length} node${rows.length === 1 ? "" : "s"}`);
  if (total > drawn) notes.push(`${drawn} of ${total} rows`);
  parts.note.textContent = notes.join(" · ");
}

function repaintSoon() {
  clearTimeout(view.due);
  view.due = setTimeout(() => {
    if (!view.panel?.el.isConnected) return;
    paintSide();
    void paintTable();
  }, 250);
}

function buildParts(panel) {
  const tools = panel.tools;
  tools.replaceChildren();
  const only = el("label", "om-deskset-switch om-snap-only");
  const box = el("input");
  box.type = "checkbox";
  box.checked = view.only;
  box.onchange = () => { view.only = box.checked; void paintTable(); };
  only.append(box, el("span", null, "Differences only"));
  const filter = el("input", "om-search om-snap-filter");
  filter.placeholder = "Filter";
  filter.spellcheck = false;
  filter.value = view.filter;
  filter.oninput = () => { view.filter = filter.value; void paintTable(); };
  const runs = el("button", "om-btn om-snap-compare-runs", "Compare runs");
  runs.onclick = () => {
    const chosen = pickedIds().map((id) => view.runs.get(id)?.last?.id).filter(Boolean);
    if (!chosen.length) return;
    runProgramById("timer", { runs: chosen.map(String) });
  };
  tools.append(only, filter, runs);

  const wrapAll = el("div", "om-snap-win");
  const side = el("div", "om-snap-side");
  const take = el("div", "om-snap-take");
  const input = el("input", "om-search");
  input.placeholder = "Snapshot name";
  input.maxLength = SNAP_NAME_CAP;
  input.spellcheck = false;
  const go = el("button", "om-btn om-go", "Take");
  go.onclick = () => takeFromWindow(input);
  input.addEventListener("keydown", (event) => { if (event.key === "Enter") go.click(); });
  take.append(input, go);
  const list = el("div", "om-snap-list");
  side.append(take, list);
  const main = el("div", "om-snap-main");
  const note = el("div", "om-snap-note");
  const wrap = el("div", "om-snap-table-wrap");
  const table = el("table", "om-snap-table");
  wrap.appendChild(table);
  main.append(note, wrap);
  wrapAll.append(side, main);
  panel.body.replaceChildren(wrapAll);
  view.parts = { list, note, wrap, table, runs };
}

async function showWorkflow(workflow, pick) {
  view.workflow = workflow;
  view.book = null;
  try {
    view.book = await openBook(workflow);
  } catch {
    notify("Snapshots not loaded", "The snapshot store could not be read.");
    return;
  }
  if (view.workflow !== workflow) return;
  const newest = view.book.items[0]?.id;
  view.picked = pick?.length ? [CURRENT, ...pick] : newest ? [CURRENT, newest] : [CURRENT];
  paintSide();
  void paintTable();
}

function stopWatching() {
  for (const stop of view.stops.splice(0)) {
    try { stop(); } catch {}
  }
  clearTimeout(view.due);
  clearTimeout(view.runsDue);
  view.panel = null;
  view.parts = null;
  view.workflow = null;
  view.book = null;
}

function startWatching() {
  view.stops.push(watchBooks((book) => {
    if (book === view.book) repaintSoon();
  }));
  view.stops.push(watchActiveWorkflow(() => {
    const now = activeWorkflow();
    if (now && now !== view.workflow) void showWorkflow(now);
  }));
  const changed = () => repaintSoon();
  api.addEventListener("graphChanged", changed);
  view.stops.push(() => api.removeEventListener("graphChanged", changed));
  const timed = () => refreshRuns();
  api.addEventListener(TIMER_CHANNEL, timed);
  view.stops.push(() => api.removeEventListener(TIMER_CHANNEL, timed));
}

async function openSnapshotWindow(workflow = activeWorkflow(), { pick = [] } = {}) {
  if (!workflow) { toast("No workflow is open."); return null; }
  let panel = floatingPanel(WIN_KEY);
  if (!panel) {
    panel = createFloatingPanel({
      key: WIN_KEY,
      title: "Snapshots",
      ...windowSize("library"),
      modal: false,
      onClose: stopWatching,
    });
    panel.setMaskIcon(ICON_SNAPSHOTS);
    view.panel = panel;
    buildParts(panel);
    startWatching();
  }
  view.panel = panel;
  panel.present();
  view.runs = await readRuns();
  await showWorkflow(workflow, pick);
  return panel;
}

export { openSnapshotWindow };
