import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import { API } from "./base.mjs";
import { el, toast, notify, openRowMenu } from "./ui.mjs";
import { panelSetting } from "./settings.mjs";
import { dlPost, bytesText } from "./downloads.mjs";
import { workflowGraph, workflowGraphById, workflowOfJob, openWorkflowByPath } from "./workflows.mjs";

const pauseState = {
  running: false, busy: false, fixed: null, queued: new Set(), wired: false, resumable: null,
};

const RUN_MENU_WAIT = 1500;

function pauseOn() {
  return panelSetting("openManager.pauseButton", true) !== false;
}

function liveOn() {
  return panelSetting("openManager.pauseLive", false) === true;
}

function resumeOn() {
  return pauseOn() || liveOn();
}

function pauseTemplate(type) {
  try {
    return (LiteGraph.createNode(type)?.widgets || []).map((widget) => ({
      name: widget.name,
      control: (widget.linkedWidgets || []).find((one) => one.name === "control_after_generate")
        ? true : false,
    }));
  } catch {
    return null;
  }
}

function controlledFromState(state) {
  const found = [];
  const definitions = new Map(
    (state?.definitions?.subgraphs || []).map((one) => [String(one.id), one]));
  const templates = new Map();
  const walk = (nodes, prefix, depth) => {
    if (depth > 8) return;
    for (const node of nodes || []) {
      const inner = definitions.get(String(node.type));
      if (inner) {
        walk(inner.nodes, `${prefix}${node.id}:`, depth + 1);
        continue;
      }
      const values = node.widgets_values;
      if (!Array.isArray(values)) continue;
      if (!templates.has(node.type)) templates.set(node.type, pauseTemplate(node.type));
      const template = templates.get(node.type);
      if (!template || template.length !== values.length) continue;
      template.forEach((widget, index) => {
        if (!widget.control) return;
        found.push({ node: `${prefix}${node.id}`, widget: widget.name,
                     canvas: values[index], control: String(values[index + 1] ?? "") });
      });
    }
  };
  walk(state?.nodes, "", 0);
  return found;
}

function liveWidget(executionId, name) {
  const parts = String(executionId).split(":");
  let graph = app.graph;
  let node = null;
  for (let index = 0; index < parts.length; index++) {
    node = graph?.getNodeById?.(Number(parts[index])) ?? graph?.getNodeById?.(parts[index]);
    if (!node) return null;
    if (index < parts.length - 1) graph = node.subgraph;
  }
  return (node?.widgets || []).find((one) => one.name === name) || null;
}

function pauseKey(record) {
  return `${record.workflow_id}:${record.created_at}`;
}

function restorePausedWidgets(record) {
  if (!record?.widgets?.length || String(app.graph?.id || "") !== record.workflow_id) return;
  if (pauseState.queued.has(pauseKey(record))) return;
  const before = app.extensionManager?.setting?.get?.("Comfy.WidgetControlMode") === "before";
  const fixed = [];
  let changed = false;
  for (const item of record.widgets) {
    const widget = liveWidget(item.node, item.widget);
    if (!widget || widget.value != item.canvas) continue;
    if (widget.value !== item.run) {
      widget.value = item.run;
      changed = true;
    }
    const control = (widget.linkedWidgets || []).find((one) => one.name === "control_after_generate");
    if (before && control && control.value !== "fixed") {
      fixed.push({ control, value: control.value });
      control.value = "fixed";
      changed = true;
    }
  }
  pauseState.fixed = fixed.length ? { key: pauseKey(record), workflow: record.workflow_id, fixed }
                                   : pauseState.fixed;
  pauseState.pendingKey = pauseKey(record);
  pauseState.pendingWorkflow = record.workflow_id;
  if (changed) app.graph.setDirtyCanvas(true, true);
}

async function readPause(workflowId) {
  try {
    const answer = await (await api.fetchApi(
      `${API}/pause?workflow=${encodeURIComponent(workflowId)}`)).json();
    return answer?.pause || null;
  } catch {
    return undefined;
  }
}

async function refreshResume() {
  const workflowId = String(app.graph?.id || "");
  const record = resumeOn() && workflowId ? await readPause(workflowId) : null;
  if (record === undefined) return null;
  if (String(app.graph?.id || "") !== workflowId) return null;
  pauseState.resumable = record;
  paintResume();
  return record;
}

async function restorePauseForGraph() {
  const record = await refreshResume();
  if (record) restorePausedWidgets(record);
}

function paintResume() {
  const group = document.querySelector(".queue-button-group");
  const record = pauseState.resumable;
  const on = !!record && resumeOn() && !pauseState.running && !pauseState.busy
    && record.workflow_id === String(app.graph?.id || "");
  for (const other of document.querySelectorAll(".om-resume")) {
    if (other !== group) other.classList.remove("om-resume");
  }
  group?.classList.toggle("om-resume", on);
}

async function forgetPause() {
  const record = pauseState.resumable;
  if (!record) return false;
  const answer = await dlPost("/pause/discard", { workflow: record.workflow_id }).catch(() => null);
  if (!answer?.ok) {
    notify("Not discarded", answer?.reason || "The pause could not be discarded.");
    return false;
  }
  const fixed = pauseState.fixed;
  if (fixed && fixed.workflow === record.workflow_id) {
    for (const one of fixed.fixed) one.control.value = one.value;
    pauseState.fixed = null;
    app.graph?.setDirtyCanvas(true, true);
  }
  if (pauseState.pendingWorkflow === record.workflow_id) pauseState.pendingWorkflow = null;
  pauseState.queued.add(pauseKey(record));
  pauseState.resumable = null;
  paintResume();
  return true;
}

async function startFresh() {
  if (!(await forgetPause())) return;
  await app.extensionManager?.command?.execute?.("Comfy.QueuePrompt");
}

function closeRunMenu() {
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
}

function injectRunMenu(menu) {
  if (menu.querySelector(".om-run-item")) return;
  const items = [...menu.querySelectorAll('[role="menuitem"]')];
  const model = items.find((one) => !one.className.includes("bg-primary-background")) || items[0];
  if (!model) return;
  const row = (label, act) => {
    const item = model.cloneNode(true);
    for (const name of ["id", "data-reka-collection-item", "data-highlighted", "data-state"]) {
      item.removeAttribute(name);
    }
    item.classList.add("om-run-item");
    item.textContent = label;
    item.tabIndex = -1;
    item.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeRunMenu();
      act();
    });
    return item;
  };
  const split = el("div", "om-run-split");
  split.setAttribute("role", "separator");
  const host = model.parentElement === menu ? menu : model.parentElement?.parentElement || menu;
  host.append(split, row("Start fresh", startFresh), row("Discard pause", forgetPause));
}

function awaitRunMenu(trigger) {
  let timer = 0;
  const pick = (node) => {
    if (!(node instanceof Element)) return null;
    const menu = node.matches('[role="menu"]') ? node : node.querySelector('[role="menu"]');
    if (!menu) return null;
    const by = menu.getAttribute("aria-labelledby");
    return !by || !trigger.id || by === trigger.id ? menu : null;
  };
  const watcher = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        const menu = pick(node);
        if (!menu) continue;
        watcher.disconnect();
        clearTimeout(timer);
        injectRunMenu(menu);
        return;
      }
    }
  });
  watcher.observe(document.body, { childList: true, subtree: true });
  timer = setTimeout(() => watcher.disconnect(), RUN_MENU_WAIT);
}

function wireRunMenu() {
  const opening = (event) => {
    const trigger = event.target?.closest?.('.om-resume > [data-testid="queue-mode-menu-trigger"]');
    if (!trigger) return;
    if (event.type === "keydown" && !["Enter", " ", "ArrowDown"].includes(event.key)) return;
    awaitRunMenu(trigger);
  };
  document.addEventListener("pointerdown", opening, true);
  document.addEventListener("keydown", opening, true);
}

async function runningWorkflowId() {
  try {
    const queue = await (await api.fetchApi("/queue")).json();
    const item = (queue.queue_running || [])[0];
    return String(item?.[3]?.extra_pnginfo?.workflow?.id || "");
  } catch {
    return "";
  }
}

function jobGraph(promptId) {
  const flow = workflowOfJob(promptId);
  const open = flow ? openWorkflowByPath(flow.path) : null;
  return open ? workflowGraph(open) : null;
}

async function recordLiveWidgets(promptId) {
  if (!liveOn() || !promptId) return;
  const state = jobGraph(promptId) || workflowGraphById(await runningWorkflowId());
  const widgets = state ? controlledFromState(state) : [];
  if (!widgets.length) return;
  await dlPost("/pause/live", { prompt: promptId, widgets }).catch(() => null);
}

async function pauseRun(mode) {
  if (pauseState.busy) return;
  pauseState.busy = true;
  paintPause();
  try {
    const workflowId = await runningWorkflowId();
    const state = workflowGraphById(workflowId);
    const widgets = state ? controlledFromState(state) : [];
    const answer = await dlPost("/pause", { mode, widgets });
    if (answer?.finished) {
      toast("Finished before pausing.");
      return;
    }
    if (!answer?.ok) {
      notify("Not paused", answer?.reason || "The run could not be paused.");
      return;
    }
    toast(`Paused: ${answer.nodes} node${answer.nodes === 1 ? "" : "s"}, `
          + `${bytesText(answer.bytes)}.`, { kind: "ok" });
    const record = await (await api.fetchApi(
      `${API}/pause?workflow=${encodeURIComponent(answer.workflow_id)}`)).json().catch(() => null);
    if (record?.pause) {
      if (record.pause.workflow_id === String(app.graph?.id || "")) pauseState.resumable = record.pause;
      restorePausedWidgets(record.pause);
    }
  } catch (error) {
    notify("Not paused", error.message || "The run could not be paused.");
  } finally {
    pauseState.busy = false;
    paintPause();
  }
}

function paintPause() {
  const button = document.querySelector(".om-pause");
  if (!button) return;
  const out = !(pauseState.running || pauseState.busy);
  button.classList.toggle("om-pause-out", out);
  button.parentElement?.classList.toggle("om-pause-on", !out);
  button.setAttribute("aria-hidden", out ? "true" : "false");
  button.tabIndex = out ? -1 : 0;
  button.disabled = out || pauseState.busy;
  button.classList.toggle("om-pause-busy", pauseState.busy);
  button.title = pauseState.busy ? "Pausing" : "Pause";
  paintResume();
}

function buildPauseButton() {
  const button = el("button", "om-pause om-pause-out");
  button.type = "button";
  button.setAttribute("aria-label", "Pause");
  button.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">'
    + '<rect x="3.5" y="2.5" width="3" height="11" rx="1" fill="currentColor"/>'
    + '<rect x="9.5" y="2.5" width="3" height="11" rx="1" fill="currentColor"/></svg>';
  button.onclick = () => pauseRun("boundary");
  button.oncontextmenu = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (pauseState.busy) return;
    openRowMenu(button, { align: "right", items: [
      { label: "Pause after this node", fn: () => pauseRun("boundary") },
      { label: "Pause now", fn: () => pauseRun("now") },
    ] });
  };
  return button;
}

function pauseSpot(group) {
  const trigger = group.querySelector(':scope > [data-testid="queue-mode-menu-trigger"]');
  if (trigger) return trigger;
  return group.querySelector(':scope > [data-testid="queue-button"]')?.nextElementSibling || null;
}

function mountPauseButton() {
  const present = document.querySelector(".om-pause");
  for (const group of document.querySelectorAll(".om-pause-on")) {
    if (group !== present?.parentElement) group.classList.remove("om-pause-on");
  }
  if (!pauseOn()) {
    present?.parentElement?.classList.remove("om-pause-on");
    present?.remove();
    return false;
  }
  const group = document.querySelector(".queue-button-group");
  if (!group) return false;
  const before = pauseSpot(group);
  if (present && present.parentElement === group && present.nextElementSibling === before) {
    paintPause();
    return true;
  }
  present?.parentElement?.classList.remove("om-pause-on");
  present?.remove();
  group.insertBefore(buildPauseButton(), before);
  paintPause();
  return true;
}

function wirePause() {
  if (pauseState.wired) return;
  pauseState.wired = true;
  wireRunMenu();
  const settle = (running) => {
    const ended = pauseState.running && !running;
    pauseState.running = running;
    mountPauseButton();
    if (ended) refreshResume();
  };
  api.addEventListener("execution_start", (event) => {
    settle(true);
    void recordLiveWidgets(String(event.detail?.prompt_id || ""));
  });
  api.addEventListener("execution_success", () => settle(false));
  api.addEventListener("execution_error", () => settle(false));
  api.addEventListener("execution_interrupted", () => settle(false));
  api.addEventListener("status", (event) => {
    if (event.detail?.exec_info?.queue_remaining !== 0) return;
    settle(false);
    if (liveOn()) restorePauseForGraph();
  });
  api.addEventListener("reconnected", () => restorePauseForGraph());
  api.addEventListener("promptQueued", () => {
    const workflowId = String(app.graph?.id || "");
    if (pauseState.pendingWorkflow && pauseState.pendingWorkflow === workflowId) {
      pauseState.queued.add(pauseState.pendingKey);
      pauseState.pendingWorkflow = null;
    }
    const fixed = pauseState.fixed;
    if (fixed && fixed.workflow === workflowId) {
      for (const one of fixed.fixed) one.control.value = one.value;
      pauseState.fixed = null;
      app.graph.setDirtyCanvas(true, true);
    }
  });
  api.fetchApi("/queue").then((answer) => answer.json()).then((queue) => {
    settle((queue.queue_running || []).length > 0);
  }).catch(() => {});
}

export { restorePauseForGraph, mountPauseButton, wirePause };
