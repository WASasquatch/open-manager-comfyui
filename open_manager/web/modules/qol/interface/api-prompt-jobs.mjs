import { api } from "../../../../../scripts/api.js";

const UNFINISHED = new Set(["pending", "in_progress"]);

let active = false;

function unwrap(value) {
  if (value && typeof value === "object" && !Array.isArray(value) && "__value__" in value
    && (value.__type__ === "CURVE" || Array.isArray(value.__value__))) return value.__value__;
  return value;
}

function localIds(ids) {
  const taken = new Set(ids.filter((id) => !id.includes(":")));
  const local = new Map();
  for (const id of ids) {
    if (!id.includes(":")) {
      local.set(id, String(Number(id)) === id ? Number(id) : id);
      continue;
    }
    let candidate = id.replaceAll(":", "_");
    while (taken.has(candidate)) candidate += "_";
    taken.add(candidate);
    local.set(id, candidate);
  }
  return local;
}

function linkInput(graph, local, target, name, [fromId, fromSlot]) {
  const from = graph.getNodeById(local.get(String(fromId)));
  if (!from?.outputs?.[fromSlot]) return false;
  let slot = target.inputs?.findIndex((input) => input.name === name) ?? -1;
  if (slot === -1) {
    const widget = target.widgets?.find((one) => one.name === name);
    try {
      if (widget && target.convertWidgetToInput?.(widget)) {
        slot = target.inputs.findIndex((input) => input.name === name);
      }
    } catch {}
  }
  if (slot === -1) return false;
  from.connect(fromSlot, target, slot);
  return true;
}

function setWidget(target, name, value) {
  const widget = target.widgets?.find((one) => one.name === name);
  if (!widget) return false;
  const plain = unwrap(value);
  widget.value = plain;
  try {
    widget.callback?.(plain);
  } catch {}
  return true;
}

function toWorkflow(prompt) {
  const ids = Object.keys(prompt);
  const local = localIds(ids);
  const graph = new window.LiteGraph.LGraph();
  try {
    for (const id of ids) {
      const data = prompt[id];
      const node = data?.class_type ? window.LiteGraph.createNode(data.class_type) : null;
      if (!node) return null;
      node.id = local.get(id);
      if (data._meta?.title) node.title = data._meta.title;
      graph.add(node);
    }
    let waiting = [];
    for (const id of ids) {
      const target = graph.getNodeById(local.get(id));
      for (const [name, value] of Object.entries(prompt[id].inputs || {})) {
        const apply = Array.isArray(value)
          ? () => linkInput(graph, local, target, name, value)
          : () => setWidget(target, name, value);
        if (!apply()) waiting.push(apply);
      }
    }
    while (waiting.length) {
      const left = waiting.filter((apply) => !apply());
      if (left.length === waiting.length) break;
      waiting = left;
    }
    graph.arrange();
    return graph.serialize();
  } catch (error) {
    console.warn("[Open Manager] API prompt not converted", error);
    return null;
  } finally {
    try {
      graph.clear();
    } catch {}
  }
}

function lazyWorkflow(pnginfo, prompt) {
  let done = false;
  let value = null;
  Object.defineProperty(pnginfo, "workflow", {
    configurable: true,
    enumerable: true,
    get() {
      if (!done) {
        done = true;
        value = active ? toWorkflow(prompt) : null;
      }
      return value;
    },
    set(next) {
      done = true;
      value = next;
    },
  });
}

async function queuedPrompt(id) {
  const queue = await (await api.fetchApi("/queue", { cache: "no-store" })).json();
  const item = [...(queue.queue_running || []), ...(queue.queue_pending || [])]
    .find((one) => String(one?.[1]) === id);
  return item ? { prompt: item[2], extra: item[3] || {} } : null;
}

async function fill(detail, id) {
  if (!detail.workflow && UNFINISHED.has(detail.status)) {
    const queued = await queuedPrompt(id);
    if (queued?.prompt && !queued.extra?.extra_pnginfo?.workflow) {
      detail.workflow = { prompt: queued.prompt, extra_data: { ...queued.extra } };
    }
  }
  const container = detail.workflow;
  if (!container?.prompt || typeof container.prompt !== "object"
    || container.extra_data?.extra_pnginfo?.workflow) return;
  const pnginfo = { ...(container.extra_data?.extra_pnginfo || {}) };
  container.extra_data = { ...(container.extra_data || {}), extra_pnginfo: pnginfo };
  lazyWorkflow(pnginfo, container.prompt);
}

function wrap(before) {
  return async function getJobDetail(jobId, ...rest) {
    const detail = await before.call(this, jobId, ...rest);
    if (!active || !detail || typeof detail !== "object") return detail;
    try {
      await fill(detail, String(jobId));
    } catch (error) {
      console.warn("[Open Manager] API prompt jobs: queue not read", error);
    }
    return detail;
  };
}

export default {
  key: "qolApiPromptJobs",
  name: "API jobs open as workflows",
  tooltip: "Jobs queued with only an API prompt open as a laid-out workflow.",
  issues: [],
  defaultValue: true,
  verified: "1.57.4",
  check() {
    if (typeof api?.getJobDetail !== "function") return "ComfyUI's job details are not reachable";
    if (typeof window.LiteGraph?.LGraph !== "function"
      || typeof window.LiteGraph?.createNode !== "function") return "ComfyUI's graph changed";
    return "";
  },
  on(track) {
    const own = Object.hasOwn(api, "getJobDetail");
    const before = api.getJobDetail;
    const mine = wrap(before);
    active = true;
    api.getJobDetail = mine;
    track(() => {
      active = false;
      if (api.getJobDetail !== mine) return;
      if (own) api.getJobDetail = before;
      else delete api.getJobDetail;
    });
  },
};
