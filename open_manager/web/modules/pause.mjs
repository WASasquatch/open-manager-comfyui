import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import { API } from "./base.mjs";
import { el, toast, notify, openRowMenu } from "./ui.mjs";
import { panelSetting } from "./settings.mjs";
import { dlPost, bytesText } from "./downloads.mjs";
import { workflowGraphById } from "./workflows.mjs";

const pauseState = { running: false, busy: false, fixed: null, queued: new Set(), wired: false };

function pauseOn() {
  return panelSetting("openManager.pauseButton", true) !== false;
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

async function restorePauseForGraph() {
  if (!pauseOn()) return;
  const workflowId = String(app.graph?.id || "");
  if (!workflowId) return;
  try {
    const answer = await (await api.fetchApi(
      `${API}/pause?workflow=${encodeURIComponent(workflowId)}`)).json();
    if (answer?.pause) restorePausedWidgets(answer.pause);
  } catch {
  }
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
    if (record?.pause) restorePausedWidgets(record.pause);
  } catch (error) {
    notify("Not paused", error.message || "The run could not be paused.");
  } finally {
    pauseState.busy = false;
    paintPause();
  }
}

function paintPause() {
  const box = document.querySelector(".om-pause");
  if (!box) return;
  box.style.display = pauseState.running || pauseState.busy ? "" : "none";
  const go = box.querySelector(".om-pause-go");
  go.disabled = pauseState.busy;
  go.querySelector(".om-pause-text").textContent = pauseState.busy ? "Pausing" : "Pause";
  box.querySelector(".om-pause-more").disabled = pauseState.busy;
}

function buildPauseButton() {
  const box = el("div", "om-pause");
  const go = el("button", "om-pause-go");
  go.title = "Pause";
  go.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">'
    + '<rect x="3.5" y="2.5" width="3" height="11" rx="1" fill="currentColor"/>'
    + '<rect x="9.5" y="2.5" width="3" height="11" rx="1" fill="currentColor"/></svg>';
  go.appendChild(el("span", "om-pause-text", "Pause"));
  go.onclick = () => pauseRun("boundary");
  const more = el("button", "om-pause-more", "▾");
  more.title = "Pause options";
  more.onclick = (event) => {
    event.stopPropagation();
    openRowMenu(more, { align: "right", items: [
      { label: "Pause after this node", fn: () => pauseRun("boundary") },
      { label: "Pause now", fn: () => pauseRun("now") },
    ] });
  };
  box.appendChild(go);
  box.appendChild(more);
  return box;
}

function mountPauseButton() {
  const present = document.querySelector(".om-pause");
  if (!pauseOn()) {
    present?.remove();
    return false;
  }
  const group = document.querySelector(".queue-button-group");
  if (!group?.parentElement) return false;
  if (present && present.previousElementSibling === group) {
    paintPause();
    return true;
  }
  present?.remove();
  group.parentElement.insertBefore(buildPauseButton(), group.nextSibling);
  paintPause();
  return true;
}

function wirePause() {
  if (pauseState.wired) return;
  pauseState.wired = true;
  const settle = (running) => {
    pauseState.running = running;
    mountPauseButton();
  };
  api.addEventListener("execution_start", () => settle(true));
  api.addEventListener("execution_success", () => settle(false));
  api.addEventListener("execution_error", () => settle(false));
  api.addEventListener("execution_interrupted", () => settle(false));
  api.addEventListener("status", (event) => {
    if (event.detail?.exec_info?.queue_remaining === 0) settle(false);
  });
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
