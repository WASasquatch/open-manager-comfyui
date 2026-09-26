import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import { toast, notify, chooseAction } from "./ui.mjs";
import { repoOwnerName, confirmAuthorTrust } from "./installs.mjs";

const WORKFLOW_DIR = "workflows/";

const STORE_READS = [
  () => app.extensionManager?.workflow,
  () => window.comfyAPI?.workflowStore?.useWorkflowStore?.(),
  () => app.workflowManager,
];

function* workflowStores() {
  for (const read of STORE_READS) {
    let store = null;
    try {
      store = read();
    } catch {
    }
    if (store && typeof store === "object") yield store;
  }
}

function workflowStore() {
  for (const store of workflowStores()) return store;
  return null;
}

function listOf(held) {
  if (Array.isArray(held)) return held;
  return Array.isArray(held?.value) ? held.value : [];
}

function activeWorkflow() {
  for (const store of workflowStores()) {
    try {
      const found = store.activeWorkflow;
      if (found && typeof found === "object") return found;
    } catch {
    }
  }
  return null;
}

function activePath() {
  try {
    return String(activeWorkflow()?.path || "");
  } catch {
    return "";
  }
}

function openWorkflows() {
  try {
    return listOf(workflowStore()?.openWorkflows);
  } catch {
    return [];
  }
}

function savedWorkflows() {
  try {
    return listOf(workflowStore()?.workflows).filter((one) => one && !one.isTemporary);
  } catch {
    return [];
  }
}

function workflowChoices() {
  try {
    const active = activeWorkflow();
    return openWorkflows().map((workflow) => ({
      workflow,
      label: workflow.filename || workflow.key || workflow.path,
      active: workflow === active,
    }));
  } catch {
    return [];
  }
}

function workflowPath(target) {
  const text = String(target || "");
  return !text || text.startsWith(WORKFLOW_DIR) ? text : `${WORKFLOW_DIR}${text}`;
}

function workflowMissing(target) {
  const path = workflowPath(target);
  if (!path) return true;
  const store = workflowStore();
  if (!listOf(store?.workflows).length) return false;
  return !store.getWorkflowByPath?.(path);
}

async function workflowByPath(target, { fresh = false } = {}) {
  const store = workflowStore();
  const path = workflowPath(target);
  if (!store || !path) return null;
  const known = () => openWorkflows().find((one) => one?.path === path)
    || store.getWorkflowByPath?.(path) || null;
  let found = known();
  if (!found) {
    await store.loadWorkflows?.().catch(() => {});
    found = known();
  }
  if (!found || fresh) {
    await store.syncWorkflows?.().catch(() => {});
    found = known() || found;
  }
  return found;
}

function workflowGraph(workflow, active = !!workflow && workflow === activeWorkflow()) {
  if (active) {
    try {
      const live = app.graph.serialize();
      if (live) return live;
    } catch {
    }
  }
  const state = workflow?.activeState;
  if (state && typeof state === "object") return state;
  const content = workflow?.content || workflow?.originalContent;
  if (content) {
    try { return JSON.parse(content); } catch {}
  }
  return null;
}

async function workflowDocument(workflow, active) {
  const held = workflowGraph(workflow, active);
  if (held) return held;
  const path = workflow?.path;
  if (!path) return null;
  try {
    const answer = await api.fetchApi(`/userdata/${encodeURIComponent(path)}`);
    return answer.ok ? await answer.json() : null;
  } catch {
    return null;
  }
}

function workflowGraphById(workflowId) {
  if (!workflowId) return null;
  try {
    if (String(app.graph?.id || "") === workflowId) return app.graph.serialize();
  } catch {
  }
  for (const flow of openWorkflows()) {
    const state = flow?.activeState;
    if (state && String(state.id || "") === workflowId) return state;
  }
  return null;
}

function storedWorkflow(held) {
  return !!held && typeof held === "object" && typeof held.path === "string"
    && (typeof held.load === "function" || "activeState" in held);
}

async function loadWorkflow(source, { title = null, replace = false } = {}) {
  const held = await source;
  if (typeof File === "function" && held instanceof File) {
    await app.handleFile(held);
    return "opened";
  }
  if (typeof held === "string" || storedWorkflow(held)) {
    const flow = typeof held === "string" ? await workflowByPath(held) : held;
    if (!flow) return "missing";
    if (activePath() === flow.path) return "active";
    if (!flow.isLoaded) await flow.load();
    await app.loadGraphData(flow.activeState, true, true, flow,
                            { checkForRerouteMigration: false });
    return "opened";
  }
  if (!held || typeof held !== "object") throw new Error("it is not a workflow");
  if (replace) await app.loadGraphData(held, true, true, activeWorkflow());
  else if (title) await app.loadGraphData(held, true, true, String(title));
  else await app.loadGraphData(held);
  return "opened";
}

async function askLoadWay(label, { origin = "", repository = "" } = {}) {
  const parts = repoOwnerName(repository || "");
  if (parts && !(await confirmAuthorTrust(parts.owner, repository, "load a workflow"))) return null;
  const active = activeWorkflow();
  const choices = [{ key: "tab", label: "Open in new tab", primary: true }];
  if (active) choices.push({ key: "replace", label: "Replace current graph",
                             hint: "Discards unsaved changes to the open workflow" });
  const where = origin ? `From ${origin}. ` : "";
  return chooseAction(
    "Load workflow",
    `${where}Running this workflow can download models and write files.\n\n`
    + (active
      ? `"${label}" can open alongside your work or take the place of the graph you have open.`
      : `"${label}" opens in a new tab.`),
    choices);
}

async function openWorkflow(source, { label = "", title = null, ask = null, after = null } = {}) {
  const named = String(label || (typeof source === "string" ? source : source?.name || "The workflow"));
  let replace = false;
  if (ask) {
    const how = await askLoadWay(named, ask);
    if (!how) return false;
    replace = how === "replace";
  }
  try {
    const outcome = await loadWorkflow(source, { title, replace });
    if (outcome === "missing") {
      notify("Workflow not found", `${named} is no longer in this ComfyUI.`);
      return false;
    }
  } catch (error) {
    notify("Not opened", `${named} could not be opened: ${error.message}`);
    return false;
  }
  if (ask) toast(`${replace ? "Loaded" : "Opened"} ${named.split("/").pop()}.`, { kind: "ok" });
  after?.();
  return true;
}

export { workflowStore, activeWorkflow, activePath, openWorkflows, savedWorkflows, workflowChoices, workflowMissing, workflowByPath, workflowGraph, workflowDocument, workflowGraphById, loadWorkflow, openWorkflow };
