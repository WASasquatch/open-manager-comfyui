import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import { notify } from "./ui.mjs";
import { panelSetting } from "./settings.mjs";
import { activeWorkflow, workflowGraph, loadWorkflow } from "./workflows.mjs";

const SNAP_ROOT = "open_manager/snapshots";

const SNAP_PATHS = `${SNAP_ROOT}/paths.json`;

const SNAP_NAME_CAP = 80;

const SNAP_CAP = 100;

const SNAP_SUMMARY_CAP = 160;

const SNAP_TAGS_KEPT = 64;

const SNAP_TAG_WAIT = 1500;

const SNAP_ID = /^[0-9a-f]{8,32}$/;

const SNAP_AUTO = new Set(["auto", "save", "run"]);

const SNAP_ORIGINS = new Set(["manual", ...SNAP_AUTO]);

const SNAP_ORIGIN_NAMES = { auto: "Auto", save: "Saved", run: "Run" };

const SNAP_HELD_EXTRA = ["ds", "om_custom_title", "om_tab_color", "om_node_presets"];

const CONTROL_MODES = new Set(["fixed", "increment", "decrement", "randomize"]);

const MODE_NAMES = { 0: "Always", 1: "On event", 2: "Never", 3: "On trigger", 4: "Bypass" };

const FIELD_MODE = "\u0000mode";

const FIELD_LINKS = "\u0000links";

const STORE_OPTIONS = { overwrite: true, stringify: true, throwOnError: true, full_info: false };

let pathMap = null;

let pathLoad = null;

let pathQueue = Promise.resolve();

const books = new WeakMap();

const bookWatchers = new Set();

const runTags = new Map();

const liveNames = new Map();

function snapId() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function snapKeep() {
  const asked = Number(panelSetting("openManager.snapshotKeep", 20));
  return Math.max(1, Math.min(SNAP_CAP, Number.isFinite(asked) ? Math.round(asked) : 20));
}

function hashText(text) {
  let one = 0xdeadbeef ^ text.length;
  let two = 0x41c6ce57 ^ text.length;
  for (let at = 0; at < text.length; at += 1) {
    const code = text.charCodeAt(at);
    one = Math.imul(one ^ code, 2654435761);
    two = Math.imul(two ^ code, 1597334677);
  }
  one = Math.imul(one ^ (one >>> 16), 2246822507) ^ Math.imul(two ^ (two >>> 13), 3266489909);
  two = Math.imul(two ^ (two >>> 16), 2246822507) ^ Math.imul(one ^ (one >>> 13), 3266489909);
  return (two >>> 0).toString(16).padStart(8, "0") + (one >>> 0).toString(16).padStart(8, "0");
}

function plainCopy(value) {
  return JSON.parse(JSON.stringify(value));
}

function cleanGraph(graph) {
  const data = plainCopy(graph);
  if (data.extra && typeof data.extra === "object") delete data.extra.ds;
  return data;
}

function steadyValues(node) {
  const named = node?.widgets_values_named;
  if (named && typeof named === "object" && !Array.isArray(named)) {
    const keys = Object.keys(named);
    const out = {};
    keys.forEach((key, at) => {
      const next = keys[at + 1];
      if (next && /control_after_generate$/.test(next) && named[next] !== "fixed") return;
      out[key] = named[key];
    });
    return out;
  }
  const list = node?.widgets_values;
  if (!Array.isArray(list)) return list ?? null;
  return list.map((value, at) => (typeof value === "number" && CONTROL_MODES.has(list[at + 1])
    && list[at + 1] !== "fixed" ? null : value));
}

function linkSources(list) {
  const sources = new Map();
  for (const link of Array.isArray(list) ? list : []) {
    if (Array.isArray(link)) sources.set(link[0], [link[1], link[2]]);
    else if (link && typeof link === "object") sources.set(link.id, [link.origin_id, link.origin_slot]);
  }
  return sources;
}

function wiringOf(node, sources) {
  const wired = [];
  for (const input of Array.isArray(node?.inputs) ? node.inputs : []) {
    if (input?.link === null || input?.link === undefined) continue;
    const from = sources.get(input.link);
    if (from) wired.push(`${input.name || "input"} ← #${from[0]}:${from[1]}`);
  }
  return wired;
}

function scopesOf(graph) {
  const scopes = [{ id: "", name: "", nodes: graph?.nodes, links: graph?.links }];
  for (const sub of Array.isArray(graph?.definitions?.subgraphs) ? graph.definitions.subgraphs : []) {
    if (!sub || typeof sub !== "object") continue;
    scopes.push({ id: String(sub.id || ""), name: String(sub.name || sub.id || ""),
                  nodes: sub.nodes, links: sub.links });
  }
  return scopes;
}

function graphSig(graph) {
  if (!graph || typeof graph !== "object") return "";
  const shape = scopesOf(graph).map((scope) => {
    const sources = linkSources(scope.links);
    const nodes = (Array.isArray(scope.nodes) ? scope.nodes : [])
      .map((node) => [String(node?.id), String(node?.type || ""), Number(node?.mode) || 0,
                      steadyValues(node), wiringOf(node, sources)])
      .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
    return [scope.id, nodes];
  });
  return hashText(JSON.stringify(shape));
}

function sameGraph(one, two) {
  const host = window.comfyAPI?.changeTracker?.ChangeTracker?.graphEqual;
  if (typeof host === "function") {
    try { return host(one, two); } catch {}
  }
  try { return JSON.stringify(cleanGraph(one)) === JSON.stringify(cleanGraph(two)); } catch { return false; }
}

function liveWidgetNames(type) {
  if (liveNames.has(type)) return liveNames.get(type);
  const root = app.rootGraph || app.graph;
  const graphs = [root, ...(root?.subgraphs?.values?.() || [])].filter(Boolean);
  for (const graph of graphs) {
    const node = (graph._nodes || graph.nodes || []).find((one) => one?.type === type
      && Array.isArray(one.widgets));
    if (!node) continue;
    const names = node.widgets.filter((widget) => widget?.serialize !== false)
      .map((widget) => String(widget.name || ""));
    liveNames.set(type, names);
    return names;
  }
  return null;
}

function widgetEntries(node) {
  const named = node?.widgets_values_named;
  if (named && typeof named === "object" && !Array.isArray(named)) return Object.entries(named);
  const values = node?.widgets_values;
  if (values && typeof values === "object" && !Array.isArray(values)) return Object.entries(values);
  if (!Array.isArray(values)) return [];
  const names = liveWidgetNames(String(node.type || ""));
  return values.map((value, at) => [names?.[at] || `#${at + 1}`, value]);
}

function nodeTable(graph) {
  const table = new Map();
  for (const scope of scopesOf(graph)) {
    const sources = linkSources(scope.links);
    for (const node of Array.isArray(scope.nodes) ? scope.nodes : []) {
      if (!node || node.id === undefined) continue;
      const key = scope.id ? `${scope.id}:${node.id}` : String(node.id);
      const fields = new Map();
      fields.set(FIELD_MODE, { label: "Mode", kind: "mode",
                               value: MODE_NAMES[Number(node.mode) || 0] || String(node.mode) });
      for (const [name, value] of widgetEntries(node)) {
        let field = name;
        let again = 2;
        while (fields.has(field)) field = `${name} (${again++})`;
        fields.set(field, { label: field, kind: "widget", name, value });
      }
      fields.set(FIELD_LINKS, { label: "Inputs", kind: "links",
                                value: wiringOf(node, sources).join("\n") });
      table.set(key, {
        key, id: node.id, scope: scope.id, scopeName: scope.name,
        type: String(node.type || ""), title: String(node.title || ""), fields,
      });
    }
  }
  return table;
}

function valueKey(value) {
  if (value === undefined) return "\u0000none";
  try { return JSON.stringify(value); } catch { return String(value); }
}

function nodeOrder(one, two) {
  if (one.scope !== two.scope) {
    if (!one.scope) return -1;
    if (!two.scope) return 1;
    return one.scopeName.localeCompare(two.scopeName);
  }
  return String(one.id).localeCompare(String(two.id), undefined, { numeric: true });
}

function compareGraphs(graphs) {
  const tables = graphs.map((graph) => (graph ? nodeTable(graph) : new Map()));
  const nodes = new Map();
  for (const table of tables) {
    for (const [key, node] of table) if (!nodes.has(key)) nodes.set(key, node);
  }
  const rows = [];
  for (const node of [...nodes.values()].sort(nodeOrder)) {
    const present = tables.map((table) => table.has(node.key));
    const names = [];
    for (const table of tables) {
      for (const field of table.get(node.key)?.fields.keys() || []) {
        if (!names.includes(field)) names.push(field);
      }
    }
    names.sort((a, b) => (a === FIELD_MODE ? -1 : b === FIELD_MODE ? 1
      : a === FIELD_LINKS ? 1 : b === FIELD_LINKS ? -1 : 0));
    const fields = names.map((field) => {
      const cells = tables.map((table) => table.get(node.key)?.fields.get(field));
      const first = cells.find(Boolean);
      const values = cells.map((cell) => cell?.value);
      const keys = values.map(valueKey);
      return { key: field, label: first?.label || field, kind: first?.kind || "widget",
               name: first?.name || "", values, same: keys.every((one) => one === keys[0]) };
    });
    const titles = tables.map((table) => table.get(node.key)?.title).filter(Boolean);
    rows.push({
      key: node.key, id: node.id, scope: node.scope, scopeName: node.scopeName, type: node.type,
      title: titles[0] || node.type, present,
      same: present.every(Boolean) && fields.every((field) => field.same),
      fields,
    });
  }
  return rows;
}

function shortValue(value) {
  const text = typeof value === "string" ? value : valueKey(value);
  const flat = text.replace(/\s+/g, " ");
  return flat.length > 24 ? `${flat.slice(0, 21)}...` : flat;
}

function changeSummary(rows) {
  const parts = [];
  let added = 0;
  let gone = 0;
  let wired = false;
  const changed = [];
  for (const row of rows) {
    if (!row.present[0] && row.present[1]) { added += 1; continue; }
    if (row.present[0] && !row.present[1]) { gone += 1; continue; }
    for (const field of row.fields) {
      if (field.same) continue;
      if (field.kind === "links") { wired = true; continue; }
      changed.push(field);
    }
  }
  for (const field of changed.slice(0, 3)) {
    parts.push(`${field.label} ${shortValue(field.values[0])} → ${shortValue(field.values[1])}`);
  }
  if (changed.length > 3) parts.push(`${changed.length - 3} more`);
  if (added) parts.push(`+${added} node${added === 1 ? "" : "s"}`);
  if (gone) parts.push(`−${gone} node${gone === 1 ? "" : "s"}`);
  if (wired) parts.push("links");
  const text = parts.join(" · ");
  return text.length > SNAP_SUMMARY_CAP ? `${text.slice(0, SNAP_SUMMARY_CAP - 3)}...` : text;
}

async function readPaths() {
  const answer = await api.getUserData(SNAP_PATHS);
  if (answer.status === 404) return {};
  if (!answer.ok) throw new Error(`status ${answer.status}`);
  const held = await answer.json();
  const dirs = {};
  for (const [path, dir] of Object.entries(held?.dirs || {})) {
    if (path && SNAP_ID.test(String(dir))) dirs[path] = String(dir);
  }
  return dirs;
}

async function loadPaths() {
  if (pathMap) return pathMap;
  if (!pathLoad) {
    pathLoad = readPaths().then((dirs) => {
      pathMap = dirs;
      return dirs;
    }).finally(() => { pathLoad = null; });
  }
  return pathLoad;
}

function editPaths(change) {
  const run = async () => {
    const dirs = await loadPaths();
    if (change(dirs) === false) return true;
    await api.storeUserData(SNAP_PATHS, { v: 1, dirs }, STORE_OPTIONS);
    return true;
  };
  pathQueue = pathQueue.then(run, run);
  return pathQueue;
}

function indexFile(dir) {
  return `${SNAP_ROOT}/${dir}.json`;
}

function graphFile(dir, id) {
  return `${SNAP_ROOT}/${dir}-${id}.json`;
}

function cleanItem(raw) {
  if (!raw || typeof raw !== "object" || !SNAP_ID.test(String(raw.id || ""))) return null;
  const name = String(raw.name ?? "").trim().slice(0, SNAP_NAME_CAP);
  if (!name) return null;
  const item = {
    id: String(raw.id),
    name,
    at: Number(raw.at) || 0,
    origin: SNAP_ORIGINS.has(raw.origin) ? raw.origin : "manual",
    sig: /^[0-9a-f]{16}$/.test(String(raw.sig || "")) ? String(raw.sig) : "",
    summary: String(raw.summary || "").slice(0, SNAP_SUMMARY_CAP),
  };
  if (raw.kept === true) item.kept = true;
  return item;
}

async function readIndex(dir) {
  const answer = await api.getUserData(indexFile(dir));
  if (answer.status === 404) return [];
  if (!answer.ok) throw new Error(`status ${answer.status}`);
  const held = await answer.json();
  const seen = new Set();
  const items = [];
  for (const raw of Array.isArray(held?.items) ? held.items : []) {
    const item = cleanItem(raw);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    items.push(item);
  }
  return items.sort((a, b) => b.at - a.at).slice(0, SNAP_CAP);
}

function tell(book) {
  for (const fn of [...bookWatchers]) {
    try { fn(book); } catch {}
  }
}

function watchBooks(fn) {
  bookWatchers.add(fn);
  return () => bookWatchers.delete(fn);
}

function bookOf(workflow) {
  if (!workflow || typeof workflow !== "object") return null;
  let book = books.get(workflow);
  if (!book) {
    const temp = workflow.isTemporary === true;
    book = {
      workflow, path: String(workflow.path || ""), temp, dir: "", items: [], graphs: new Map(),
      loaded: temp, loading: null, failed: false, current: "", queue: Promise.resolve(),
      autoAt: Date.now(),
    };
    books.set(workflow, book);
  }
  return book;
}

async function syncBook(book) {
  const workflow = book.workflow;
  const path = String(workflow.path || "");
  if (book.temp) {
    book.path = path;
    if (workflow.isTemporary === true) return;
    book.temp = false;
    const held = await loadPaths().catch(() => ({}));
    if (held[path]) await dropDir(held[path]);
    book.dir = "";
    if (book.items.length) await bookWrite(book, { graphs: book.items.map((one) => one.id) });
    else book.loaded = true;
    tell(book);
    return;
  }
  if (!path || path === book.path) return;
  const from = book.path;
  book.path = path;
  await movePath(from, path);
}

async function openBook(workflow) {
  const book = bookOf(workflow);
  if (!book) return null;
  await syncBook(book);
  if (book.loaded) return book;
  if (!book.loading) {
    book.loading = (async () => {
      const dirs = await loadPaths();
      const dir = dirs[book.path] || "";
      const items = dir ? await readIndex(dir) : [];
      book.dir = dir;
      book.items = items;
      book.loaded = true;
      book.failed = false;
      tell(book);
    })().catch((error) => {
      book.failed = true;
      throw error;
    }).finally(() => { book.loading = null; });
  }
  await book.loading;
  return book;
}

function bookWrite(book, { graphs = [], drop = [] } = {}) {
  if (book.temp) return Promise.resolve(true);
  const run = async () => {
    if (!book.dir) {
      const dirs = await loadPaths();
      book.dir = dirs[book.path] || snapId();
      if (dirs[book.path] !== book.dir) {
        const dir = book.dir;
        const path = book.path;
        await editPaths((all) => { all[path] = dir; });
      }
    }
    for (const id of graphs) {
      const graph = book.graphs.get(id);
      if (graph) await api.storeUserData(graphFile(book.dir, id), graph, STORE_OPTIONS);
    }
    await api.storeUserData(indexFile(book.dir), { v: 1, path: book.path, items: book.items },
                            STORE_OPTIONS);
    for (const id of drop) {
      try { await api.deleteUserData(graphFile(book.dir, id)); } catch {}
    }
    return true;
  };
  const guarded = () => run().catch(() => {
    notify("Snapshot not saved", "The snapshot store could not be written.");
    return false;
  });
  book.queue = book.queue.then(guarded, guarded);
  return book.queue;
}

async function dropDir(dir) {
  if (!SNAP_ID.test(String(dir || ""))) return;
  let items = [];
  try { items = await readIndex(dir); } catch {}
  for (const one of items) {
    try { await api.deleteUserData(graphFile(dir, one.id)); } catch {}
  }
  try { await api.deleteUserData(indexFile(dir)); } catch {}
}

async function movePath(from, to) {
  if (!from || !to || from === to) return;
  let orphan = "";
  try {
    await editPaths((dirs) => {
      if (!dirs[from]) return false;
      if (dirs[to] && dirs[to] !== dirs[from]) orphan = dirs[to];
      dirs[to] = dirs[from];
      delete dirs[from];
      return true;
    });
  } catch {
    return;
  }
  if (orphan) await dropDir(orphan);
}

async function forgetPath(path) {
  if (!path) return;
  let dir = "";
  try {
    await editPaths((dirs) => {
      if (!dirs[path]) return false;
      dir = dirs[path];
      delete dirs[path];
      return true;
    });
  } catch {
    return;
  }
  if (dir) await dropDir(dir);
}

function renamedWorkflow(workflow, from) {
  const book = workflow ? books.get(workflow) : null;
  const to = String(workflow?.path || "");
  if (book) {
    void syncBook(book).then(() => {
      if (book.loaded && book.items.length && !book.temp) return bookWrite(book);
      return null;
    }).then(() => tell(book));
    return;
  }
  void movePath(from, to);
}

function deletedWorkflow(workflow, path) {
  const book = workflow ? books.get(workflow) : null;
  if (book && !book.temp) {
    book.items = [];
    book.graphs.clear();
    book.dir = "";
    book.current = "";
    tell(book);
  }
  void forgetPath(path);
}

function nextName(book, origin) {
  if (SNAP_AUTO.has(origin)) {
    const time = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    return `${SNAP_ORIGIN_NAMES[origin]} ${time}`;
  }
  let top = 0;
  for (const one of book.items) {
    const found = /^Snapshot (\d+)$/.exec(one.name);
    if (found) top = Math.max(top, Number(found[1]));
  }
  return `Snapshot ${top + 1}`;
}

function pruneBook(book) {
  const keep = snapKeep();
  const drop = [];
  let autos = 0;
  book.items = book.items.filter((one) => {
    if (one.kept || !SNAP_AUTO.has(one.origin)) return true;
    autos += 1;
    if (autos <= keep) return true;
    drop.push(one.id);
    return false;
  });
  while (book.items.length > SNAP_CAP) drop.push(book.items.pop().id);
  for (const id of drop) book.graphs.delete(id);
  return drop;
}

async function snapshotGraph(book, id) {
  if (book.graphs.has(id)) return book.graphs.get(id);
  if (book.temp || !book.dir) throw new Error("not held");
  const answer = await api.getUserData(graphFile(book.dir, id));
  if (!answer.ok) throw new Error(`status ${answer.status}`);
  const graph = await answer.json();
  if (!graph || typeof graph !== "object" || !Array.isArray(graph.nodes)) {
    throw new Error("not a workflow");
  }
  book.graphs.set(id, graph);
  return graph;
}

async function takeSnapshot(workflow, { name = "", origin = "manual", graph = null } = {}) {
  const book = await openBook(workflow);
  if (!book) return null;
  const source = graph || workflowGraph(workflow);
  if (!source || typeof source !== "object") return null;
  const data = cleanGraph(source);
  const sig = graphSig(data);
  if (origin !== "manual") {
    const same = book.items.find((one) => one.sig === sig);
    if (same) {
      book.current = same.id;
      tell(book);
      return same;
    }
  }
  let summary = "";
  const previous = book.items[0];
  if (previous) {
    const before = await snapshotGraph(book, previous.id).catch(() => null);
    if (before) summary = changeSummary(compareGraphs([before, data]));
  }
  const item = {
    id: snapId(),
    name: String(name || "").trim().slice(0, SNAP_NAME_CAP) || nextName(book, origin),
    at: Date.now(),
    origin: SNAP_ORIGINS.has(origin) ? origin : "manual",
    sig,
    summary,
  };
  book.graphs.set(item.id, data);
  book.items.unshift(item);
  book.current = item.id;
  book.autoAt = Date.now();
  const drop = pruneBook(book);
  tell(book);
  await bookWrite(book, { graphs: [item.id], drop });
  return item;
}

async function renameSnapshot(book, id, name) {
  const item = book.items.find((one) => one.id === id);
  const text = String(name || "").trim().slice(0, SNAP_NAME_CAP);
  if (!item || !text) return false;
  item.name = text;
  item.kept = true;
  tell(book);
  return bookWrite(book);
}

async function deleteSnapshot(book, id) {
  const before = book.items.length;
  book.items = book.items.filter((one) => one.id !== id);
  if (book.items.length === before) return false;
  book.graphs.delete(id);
  if (book.current === id) book.current = "";
  tell(book);
  return bookWrite(book, { drop: [id] });
}

async function clearBook(book) {
  const ids = book.items.map((one) => one.id);
  book.items = [];
  book.graphs.clear();
  book.current = "";
  tell(book);
  if (book.temp) return true;
  const run = async () => {
    const dir = book.dir;
    const path = book.path;
    book.dir = "";
    if (!dir) return true;
    for (const id of ids) {
      try { await api.deleteUserData(graphFile(dir, id)); } catch {}
    }
    try { await api.deleteUserData(indexFile(dir)); } catch {}
    await editPaths((dirs) => {
      if (dirs[path] !== dir) return false;
      delete dirs[path];
      return true;
    });
    return true;
  };
  const guarded = () => run().catch(() => false);
  book.queue = book.queue.then(guarded, guarded);
  return book.queue;
}

function rootGraph() {
  return app.rootGraph || app.graph || null;
}

async function putGraph(workflow, graph) {
  const data = plainCopy(graph);
  const live = rootGraph();
  const extra = live?.extra && typeof live.extra === "object" ? live.extra : {};
  data.extra = data.extra && typeof data.extra === "object" ? data.extra : {};
  for (const key of SNAP_HELD_EXTRA) {
    if (Object.hasOwn(extra, key)) data.extra[key] = plainCopy(extra[key]);
    else delete data.extra[key];
  }
  if (live?.id) data.id = live.id;
  const tracker = workflow.changeTracker;
  try { tracker?.captureCanvasState?.(); } catch {}
  const before = tracker?.activeState || null;
  if (tracker) tracker._restoringState = true;
  try {
    await app.loadGraphData(data, false, false, workflow,
                            { checkForRerouteMigration: false, silentAssetErrors: true });
  } finally {
    if (tracker) tracker._restoringState = false;
  }
  if (!tracker || !before || !Array.isArray(tracker.undoQueue)) return;
  let now = null;
  try { now = plainCopy(rootGraph().serialize()); } catch { return; }
  if (sameGraph(before, now)) return;
  tracker.undoQueue.push(before);
  const cap = Number(tracker.constructor?.MAX_HISTORY) || 50;
  while (tracker.undoQueue.length > cap) tracker.undoQueue.shift();
  if (Array.isArray(tracker.redoQueue)) tracker.redoQueue.length = 0;
  tracker.activeState = now;
  try { tracker.updateModified?.(before); } catch {}
}

async function applySnapshot(workflow, id) {
  const book = await openBook(workflow);
  if (!book?.items.some((one) => one.id === id)) return false;
  const graph = await snapshotGraph(book, id);
  if (activeWorkflow() !== workflow) await loadWorkflow(workflow);
  if (activeWorkflow() !== workflow) return false;
  await putGraph(workflow, graph);
  book.current = id;
  tell(book);
  return true;
}

async function openSnapshotTab(workflow, id) {
  const book = await openBook(workflow);
  const item = book?.items.find((one) => one.id === id);
  if (!item) return false;
  const graph = plainCopy(await snapshotGraph(book, id));
  const base = String(workflow.filename || "Workflow").replace(/\.json$/i, "");
  await app.loadGraphData(graph, true, true, `${base} - ${item.name}`);
  return true;
}

function liveSig(workflow) {
  const graph = workflowGraph(workflow);
  return graph ? graphSig(cleanGraph(graph)) : "";
}

async function tagFor(workflow, graph) {
  const book = await openBook(workflow);
  if (!book?.items.length) return null;
  const sig = graphSig(cleanGraph(graph));
  const same = book.items.find((one) => one.sig === sig);
  if (same) return { id: same.id, name: same.name, edited: false };
  const base = book.items.find((one) => one.id === book.current);
  return base ? { id: base.id, name: base.name, edited: true } : null;
}

function noteRunTag(promptId, pending) {
  if (!promptId || !pending) return;
  runTags.set(promptId, Promise.resolve(pending).catch(() => null));
  while (runTags.size > SNAP_TAGS_KEPT) runTags.delete(runTags.keys().next().value);
}

function runSnapshot(promptId) {
  const held = runTags.get(String(promptId || ""));
  if (!held) return Promise.resolve(null);
  return Promise.race([held, new Promise((settle) => setTimeout(() => settle(null), SNAP_TAG_WAIT))]);
}

function agoText(at) {
  const seconds = Math.max(0, (Date.now() - Number(at || 0)) / 1000);
  if (seconds < 45) return "just now";
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  return new Date(Number(at)).toLocaleDateString([], { month: "short", day: "numeric" });
}

export { SNAP_NAME_CAP, SNAP_ORIGIN_NAMES, bookOf, openBook, takeSnapshot, applySnapshot, openSnapshotTab, renameSnapshot, deleteSnapshot, clearBook, snapshotGraph, compareGraphs, graphSig, cleanGraph, liveSig, tagFor, noteRunTag, runSnapshot, watchBooks, renamedWorkflow, deletedWorkflow, agoText, syncBook };
