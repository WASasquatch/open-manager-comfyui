import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import { nodeTint } from "../themes.js";
import { el } from "./ui.mjs";
import { panelSetting } from "./settings.mjs";

const runBar = {
  el: null,
  promptId: "",
  total: 0,
  submitted: 0,
  done: new Set(),
  seen: new Set(),
  active: null,
  iteration: 0,
  loopAnchor: null,
  expanded: false,
  error: "",
  types: new Map(),
};

const BRAND_BLUE = "#84bbe7";
const BRAND_YELLOW = "#f9f276";

const GREY_AT = 22;

function runHex(colour) {
  const text = String(colour || "").trim();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(text);
  if (short) return [1, 2, 3].map((i) => parseInt(short[i] + short[i], 16));
  const full = /^#([0-9a-f]{6})$/i.exec(text);
  if (full) {
    const value = parseInt(full[1], 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  }
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(text);
  if (rgb) {
    const parts = rgb[1].split(",").map((one) => parseFloat(one));
    if (parts.length >= 3 && parts.every((one) => Number.isFinite(one))) return parts.slice(0, 3);
  }
  return null;
}

function runIsGrey(colour) {
  const rgb = runHex(colour);
  if (!rgb) return true;
  return Math.max(...rgb) - Math.min(...rgb) <= GREY_AT;
}

function runShade(colour, amount) {
  const rgb = runHex(colour) || runHex(BRAND_BLUE);
  const moved = rgb.map((one) => (amount >= 0
    ? one + (255 - one) * amount
    : one * (1 + amount)));
  return `rgb(${moved.map((one) => Math.round(Math.max(0, Math.min(255, one)))).join(", ")})`;
}

function runAlpha(colour, alpha) {
  const rgb = runHex(colour) || runHex(BRAND_BLUE);
  return `rgba(${rgb.map((one) => Math.round(one)).join(", ")}, ${alpha})`;
}

function runMainColour() {
  const header = String(window.LiteGraph?.NODE_DEFAULT_COLOR || "");
  return !runIsGrey(header) ? header : BRAND_BLUE;
}

function runNodeColour(nodeId, type) {
  let node = null;
  try {
    node = app.graph?.getNodeById?.(Number(nodeId)) || null;
  } catch {
    node = null;
  }
  if (!node && type) {
    const category = window.LiteGraph?.registered_node_types?.[type]?.category || "";
    node = { type, category };
  }
  const tint = node ? nodeTint(node) : "";
  return tint && !runIsGrey(tint) ? tint : BRAND_YELLOW;
}

function buildRunBar() {
  const bar = el("div", "om-prog");
  const track = el("div", "om-prog-track");
  const sub = el("div", "om-prog-sub");
  const main = el("div", "om-prog-main");
  track.appendChild(sub);
  track.appendChild(main);
  bar.appendChild(track);
  const text = el("div", "om-prog-text", "");
  bar.appendChild(text);
  bar.parts = { track, sub, main, text };
  return bar;
}

function runNodeLabel(nodeId) {
  const id = String(nodeId);
  try {
    const node = app.graph?.getNodeById?.(Number(id));
    if (node?.title || node?.type) return node.title || node.type;
  } catch {
  }
  return runBar.types.get(id) || `node ${id}`;
}

async function runTotalFor(promptId) {
  try {
    const queue = await (await api.fetchApi("/queue")).json();
    const running = (queue.queue_running || []).find((item) => item?.[1] === promptId);
    const prompt = running?.[2];
    if (!prompt || typeof prompt !== "object") return 0;
    runBar.types = new Map(Object.entries(prompt)
      .map(([id, node]) => [String(id), String(node?.class_type || "")])
      .filter(([, type]) => type));
    return Object.keys(prompt).length;
  } catch {
    return 0;
  }
}

function runBarReset(promptId) {
  runBar.promptId = promptId || "";
  runBar.total = 0;
  runBar.submitted = 0;
  runBar.done.clear();
  runBar.seen.clear();
  runBar.active = null;
  runBar.iteration = 0;
  runBar.loopAnchor = null;
  runBar.expanded = false;
  runBar.error = "";
  runBar.types = new Map();
}

function paintRunBar() {
  const bar = runBar.el;
  if (!bar?.isConnected) return;
  const { sub, main, text } = bar.parts;
  const total = Math.max(runBar.total, runBar.done.size, 1);
  const finished = Math.min(runBar.done.size, total);
  const share = (finished / total) * 100;
  const slice = 100 / total;

  if (!runBar.error) {
    const lead = runMainColour();
    bar.style.setProperty("--om-prog-from", runShade(lead, -0.4));
    bar.style.setProperty("--om-prog-to", lead);
    bar.style.setProperty("--om-prog-cap", runShade(lead, 0.6));
    bar.style.setProperty("--om-prog-glow", runAlpha(lead, 0.85));
    bar.style.setProperty("--om-prog-halo", runAlpha(lead, 0.45));
    const tint = runBar.active
      ? runNodeColour(runBar.active.id, runBar.types.get(String(runBar.active.id)))
      : BRAND_YELLOW;
    bar.style.setProperty("--om-prog-sub", runShade(tint, -0.42));
  }

  main.style.width = `${share}%`;
  const node = runBar.active;
  const within = node && node.max > 0 ? Math.min(1, node.value / node.max) : 0;
  sub.style.left = `${share}%`;
  sub.style.width = `${node ? Math.min(slice * within, 100 - share) : 0}%`;

  bar.classList.toggle("om-prog-error", !!runBar.error);
  const percent = Math.min(100, Math.round(((finished + within) / total) * 100));
  const parts = [`${percent}%`, `${finished}/${total} nodes`];
  if (runBar.expanded) parts[1] += "+";
  if (runBar.iteration > 1) parts.push(`iteration ${runBar.iteration}`);
  if (node) {
    parts.push(node.max > 1
      ? `${node.label} ${node.value}/${node.max}`
      : node.label);
  }
  if (runBar.error) parts.push(runBar.error);
  text.textContent = parts.join(" · ");
  bar.title = runBar.expanded
    ? "A node expanded into more nodes than the prompt held, so the total grew."
    : "Graph progress over the running node's own.";
}

function runBarShow(on) {
  const bar = runBar.el;
  if (!bar) return;
  bar.classList.toggle("om-prog-on", on);
}

function onProgressState(detail) {
  if (!runBar.el) return;
  const nodes = detail?.nodes || {};
  if (detail?.prompt_id && detail.prompt_id !== runBar.promptId) runBarReset(detail.prompt_id);

  let active = null;
  for (const [id, entry] of Object.entries(nodes)) {
    const state = entry?.state;
    if (state === "running" && runBar.done.has(id)) {
      runBar.done.delete(id);
      if (runBar.loopAnchor === null) {
        runBar.loopAnchor = id;
        runBar.iteration = 2;
      } else if (id === runBar.loopAnchor) {
        runBar.iteration += 1;
      }
    }
    runBar.seen.add(id);
    if (state === "finished") runBar.done.add(id);
    if (state === "error") runBar.error = `error in ${runNodeLabel(entry.display_node_id || id)}`;
    if (state === "running") {
      active = {
        id,
        value: Number(entry.value) || 0,
        max: Number(entry.max) || 0,
        label: runNodeLabel(entry.display_node_id || entry.real_node_id || id),
      };
    }
  }
  runBar.active = active;
  if (runBar.submitted && runBar.seen.size > runBar.submitted) {
    runBar.expanded = true;
    runBar.total = Math.max(runBar.total, runBar.seen.size);
  }
  paintRunBar();
}

function runBarHost() {
  const top = document.querySelector(".comfyui-body-top");
  if (top) return { host: top, before: top.firstChild, flow: true };
  return { host: document.body, before: null, flow: false };
}

function mountRunBar() {
  if (panelSetting("openManager.runBar", false) === false) return false;
  if (document.querySelector(".om-prog")) return true;
  const where = runBarHost();
  runBar.el = buildRunBar();
  runBar.el.classList.add(where.flow ? "om-prog-flow" : "om-prog-pinned");
  where.host.insertBefore(runBar.el, where.before);
  paintRunBar();
  return true;
}

function wireRunBar() {
  api.addEventListener("execution_start", async (event) => {
    if (!runBar.el) return;
    runBarReset(event.detail?.prompt_id || "");
    runBarShow(true);
    paintRunBar();
    const total = await runTotalFor(runBar.promptId);
    if (total) {
      runBar.submitted = total;
      runBar.total = Math.max(runBar.total, total);
      paintRunBar();
    }
  });
  api.addEventListener("execution_cached", (event) => {
    if (!runBar.el) return;
    for (const id of event.detail?.nodes || []) {
      runBar.done.add(String(id));
      runBar.seen.add(String(id));
    }
    paintRunBar();
  });
  api.addEventListener("progress_state", (event) => onProgressState(event.detail));
  api.addEventListener("execution_error", (event) => {
    if (!runBar.el) return;
    runBar.error = String(event.detail?.exception_type || "failed").split(".").pop();
    runBar.active = null;
    paintRunBar();
    setTimeout(() => runBarShow(false), 6000);
  });
  api.addEventListener("execution_success", () => {
    if (!runBar.el) return;
    runBar.active = null;
    if (runBar.total) runBar.done = new Set([...runBar.seen]);
    paintRunBar();
    setTimeout(() => { if (!runBar.active) runBarShow(false); }, 1400);
  });
  api.addEventListener("executing", (event) => {
    if (!runBar.el) return;
    if (event.detail?.node == null && event.detail !== null) return;
    if (event.detail === null || event.detail?.node === null) {
      runBar.active = null;
      paintRunBar();
      setTimeout(() => { if (!runBar.active) runBarShow(false); }, 1400);
    }
  });
}

export { runBar, mountRunBar, wireRunBar };
