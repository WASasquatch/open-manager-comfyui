import { api } from "../../../scripts/api.js";
import { API } from "./base.mjs";
import { el, toast, notify } from "./ui.mjs";
import { packIcon } from "./results.mjs";
import { openPack } from "./packs.mjs";
import { foldId, installedPack, loadInstalledIndex, packName } from "./installs.mjs";
import { rootGraph, locateNode, revealNode } from "./node-focus.mjs";

const CORE = "core";
const PARTNER = "partner";
const ABSENT = "absent";
const UNKNOWN = "unknown";
const MAX_DEPTH = 24;
const STACK_DEPTH = 40;
const EXTENSION_FRAME = /\/extensions\/([^/?#\s]+)\//;
const OWN_FOLDER = decodeURIComponent(EXTENSION_FRAME.exec(import.meta.url)?.[1] || "open_manager");

const MODES = { 2: "muted", 4: "bypassed" };

const origins = new Map();

function originOf(stack) {
  for (const line of String(stack || "").split("\n").slice(1)) {
    const hit = EXTENSION_FRAME.exec(line);
    const folder = hit ? decodeURIComponent(hit[1]) : "";
    if (folder !== OWN_FOLDER) return folder;
  }
  return "";
}

function watchNodeOrigins() {
  const graph = window.LiteGraph;
  if (!graph?.registerNodeType || graph.registerNodeType.omOrigins) return;
  const original = graph.registerNodeType;
  const wrapped = function (type, base, ...rest) {
    if (base && !base.nodeData) {
      const limit = Error.stackTraceLimit;
      Error.stackTraceLimit = STACK_DEPTH;
      origins.set(String(type), originOf(new Error().stack));
      Error.stackTraceLimit = limit;
    }
    return original.call(this, type, base, ...rest);
  };
  wrapped.omOrigins = true;
  graph.registerNodeType = wrapped;
}

function collect() {
  const found = [];
  const walk = (graph, prefix, depth) => {
    if (!graph || depth > MAX_DEPTH) return;
    for (const node of graph.nodes || graph._nodes || []) {
      const id = prefix ? `${prefix}:${node.id}` : String(node.id);
      if (node.isSubgraphNode?.() && node.subgraph) {
        walk(node.subgraph, id, depth + 1);
        continue;
      }
      found.push({ id, node });
    }
  };
  walk(rootGraph(), "", 0);
  return found;
}

function folderOf(module) {
  const text = String(module || "");
  if (!text.startsWith("custom_nodes.")) return "";
  return text.slice("custom_nodes.".length).split(".")[0].split("@")[0];
}

function packOwner(folder, fallback) {
  const held = installedPack(folder);
  const label = String(held?.id || folder || fallback || "");
  return {
    key: `pack:${foldId(label)}`,
    label,
    icon: held?.icon || "",
    packId: held?.registry_id || "",
  };
}

function propsOf(node) {
  return node.properties || node.last_serialization?.properties || {};
}

function ownerOf(node) {
  const held = window.LiteGraph?.registered_node_types?.[node.type];
  if (!held) return { key: ABSENT, label: "Not installed" };
  const def = held.nodeData;
  if (def && typeof def === "object") {
    if (def.api_node === true) return { key: PARTNER, label: "Partner nodes" };
    if (def.nodeSource?.type === "custom_nodes" || folderOf(def.python_module)) {
      return packOwner(folderOf(def.python_module), def.nodeSource?.displayText);
    }
    return { key: CORE, label: "ComfyUI core" };
  }
  const origin = origins.get(String(node.type));
  if (origin) return packOwner(origin);
  if (origin === "") return { key: CORE, label: "ComfyUI core" };
  const props = propsOf(node);
  const named = String(props.cnr_id || props.aux_id || "");
  if (named === "comfy-core") return { key: CORE, label: "ComfyUI core" };
  if (named) return { ...packOwner(named), packId: installedPack(named)?.registry_id || props.cnr_id || "" };
  return { key: UNKNOWN, label: "Unknown pack" };
}

function order(group) {
  if (group.key === ABSENT) return 0;
  if (group.key === UNKNOWN) return 2;
  if (group.key === PARTNER) return 3;
  if (group.key === CORE) return 4;
  return 1;
}

function idOrder(a, b) {
  const pa = a.split(":").map(Number);
  const pb = b.split(":").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const d = (pa[i] ?? -1) - (pb[i] ?? -1);
    if (d) return d;
  }
  return 0;
}

function groupNodes() {
  const groups = new Map();
  for (const { id, node } of collect()) {
    const owner = ownerOf(node);
    const group = groups.get(owner.key) || { ...owner, types: new Map(), ids: [], hints: {} };
    if (!group.packId && owner.packId) group.packId = owner.packId;
    if (!group.icon && owner.icon) group.icon = owner.icon;
    groups.set(owner.key, group);
    group.types.set(node.type, (group.types.get(node.type) || 0) + 1);
    group.ids.push({ id, title: node.title || node.type, type: node.type, mode: MODES[node.mode] || "" });
    if (owner.key === ABSENT && !group.hints[node.type]) {
      const props = propsOf(node);
      const cnr = typeof props.cnr_id === "string" ? props.cnr_id : "";
      const aux = typeof props.aux_id === "string" ? props.aux_id : "";
      if (cnr || aux) group.hints[node.type] = { cnr_id: cnr, aux_id: aux };
    }
  }
  const list = [...groups.values()];
  for (const group of list) group.ids.sort((a, b) => idOrder(a.id, b.id));
  list.sort((a, b) => order(a) - order(b) || a.label.localeCompare(b.label));
  return list;
}

async function nameAbsent(groups) {
  const absent = groups.find((group) => group.key === ABSENT);
  if (!absent) return;
  try {
    const answer = await api.fetchApi(`${API}/resolve-nodes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ classes: [...absent.types.keys()], hints: absent.hints }),
    });
    const data = await answer.json();
    if (answer.ok) absent.from = (data.packs || []).map((pack) => pack.title).filter(Boolean);
  } catch {
  }
}

function copyText(groups) {
  return groups.map((group) => `${group.label}: ${group.ids.map((one) => one.id).join(", ")}`).join("\n");
}

async function reveal(id) {
  const found = locateNode(id.split(":"));
  if (!found) {
    notify("Not found", `Node ${id} is no longer in this workflow.`);
    return;
  }
  await revealNode(found);
}

function groupRow(group) {
  const row = el("div", "om-side-row om-used-row");
  row.appendChild(packIcon(group.icon || "", group.label));
  const text = el("div", "om-side-text om-used-text");
  const head = group.key.startsWith("pack:")
    ? packName(group.label, "om-side-name")
    : el("div", "om-side-name", group.label);
  text.appendChild(head);
  const types = [...group.types.keys()];
  const shown = types.slice(0, 4).join(", ") + (types.length > 4 ? "…" : "");
  const count = group.ids.length;
  text.appendChild(el("div", "om-side-meta", `${count} node${count === 1 ? "" : "s"}: ${shown}`));
  if (group.from?.length) text.appendChild(el("div", "om-side-meta", `From ${group.from.join(", ")}`));
  const ids = el("div", "om-used-ids");
  for (const one of group.ids) {
    const chip = el("button", "om-used-id", one.id);
    if (one.mode) chip.classList.add("om-used-off");
    chip.title = [one.title, one.title === one.type ? "" : one.type, one.mode].filter(Boolean).join(" · ");
    chip.onclick = (event) => {
      event.stopPropagation();
      void reveal(one.id);
    };
    ids.appendChild(chip);
  }
  text.appendChild(ids);
  if (group.packId) {
    head.classList.add("om-used-link");
    head.onclick = () => openPack(group.packId);
  }
  row.appendChild(text);
  return row;
}

async function renderInUse(container) {
  container.replaceChildren();
  const controls = el("div", "om-side-controls");
  const status = el("div", "om-side-status");
  const copy = el("button", "om-btn", "Copy");
  const again = el("button", "om-btn", "Reload");
  controls.append(status, el("span", "om-used-gap"), copy, again);
  const list = el("div", "om-side-list");
  container.append(controls, list);

  const draw = async () => {
    await loadInstalledIndex();
    const groups = groupNodes();
    await nameAbsent(groups);
    if (!list.isConnected) return;
    list.replaceChildren(...groups.map(groupRow));
    const nodes = groups.reduce((sum, group) => sum + group.ids.length, 0);
    const packs = groups.filter((group) => group.key.startsWith("pack:")).length;
    status.textContent = nodes
      ? `${packs} pack${packs === 1 ? "" : "s"} · ${nodes} node${nodes === 1 ? "" : "s"}`
      : "No nodes in the current workflow.";
    copy.disabled = !nodes;
    copy.onclick = () => {
      navigator.clipboard?.writeText(copyText(groups))
        .then(() => toast("Copied.", { kind: "ok" }))
        .catch(() => notify("Not copied", "The clipboard is not available here."));
    };
  };
  again.onclick = () => { void draw(); };
  await draw();
}

export { renderInUse, groupNodes, copyText, watchNodeOrigins };
