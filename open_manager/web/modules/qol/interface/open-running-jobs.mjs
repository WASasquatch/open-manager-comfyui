import { api } from "../../../../../scripts/api.js";

const UNFINISHED = new Set(["pending", "in_progress"]);

const unfinished = new Map();

let original = null;

let chain = Promise.resolve();

async function queuedWorkflow(id) {
  const answer = await api.fetchApi("/queue", { cache: "no-store" });
  if (!answer.ok) return null;
  const queue = await answer.json();
  const items = [...(queue.queue_running || []), ...(queue.queue_pending || [])];
  const item = items.find((one) => String(one?.[1]) === id);
  return item ? { prompt: item[2], extra_data: item[3] } : null;
}

async function refreshFinished() {
  for (const [id, held] of [...unfinished]) {
    if (!original) return;
    const fresh = await original.call(api, id);
    if (!fresh) {
      unfinished.delete(id);
      continue;
    }
    if (UNFINISHED.has(fresh.status)) continue;
    for (const detail of held) {
      for (const name of Object.keys(detail)) {
        if (!(name in fresh)) delete detail[name];
      }
      Object.assign(detail, fresh);
    }
    unfinished.delete(id);
  }
}

function onStatus() {
  if (!unfinished.size) return;
  chain = chain.then(refreshFinished).catch((error) => {
    console.warn("[Open Manager] Running jobs open as workflows: details not refreshed", error);
  });
}

function wrap(before) {
  return async function getJobDetail(jobId, ...rest) {
    const detail = await before.call(this, jobId, ...rest);
    if (!detail || !UNFINISHED.has(detail.status)) return detail;
    const id = String(jobId);
    if (!detail.workflow) {
      try {
        const workflow = await queuedWorkflow(id);
        if (workflow) detail.workflow = workflow;
      } catch (error) {
        console.warn("[Open Manager] Running jobs open as workflows: queue not read", error);
      }
    }
    if (!unfinished.has(id)) unfinished.set(id, new Set());
    unfinished.get(id).add(detail);
    return detail;
  };
}

export default {
  key: "qolOpenRunningJobs",
  name: "Running and waiting jobs open as workflows",
  tooltip: "ComfyUI's job details leave out the workflow until a job finishes, so Open as "
    + "workflow in new tab does nothing on a running or waiting job, and still does nothing on "
    + "that job after it finishes. On, the workflow comes from the queue, and the job's details "
    + "are brought up to date when it finishes.",
  issues: ["Comfy-Org/ComfyUI#14995", "Comfy-Org/ComfyUI_frontend#9101"],
  defaultValue: true,
  verified: "1.53.6",
  check() {
    if (typeof api?.getJobDetail !== "function") return "ComfyUI's job details are not reachable";
    if (typeof api?.addEventListener !== "function") return "ComfyUI's api is not reachable";
    return "";
  },
  on(track) {
    const own = Object.hasOwn(api, "getJobDetail");
    const before = api.getJobDetail;
    const mine = wrap(before);
    original = before;
    api.getJobDetail = mine;
    api.addEventListener("status", onStatus);
    track(() => {
      api.removeEventListener("status", onStatus);
      if (api.getJobDetail === mine) {
        if (own) api.getJobDetail = before;
        else delete api.getJobDetail;
      }
      original = null;
      unfinished.clear();
    });
  },
};
