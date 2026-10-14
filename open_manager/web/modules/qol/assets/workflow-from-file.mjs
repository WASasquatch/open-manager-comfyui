import { api } from "../../../../../scripts/api.js";
import { API } from "../../base.mjs";

const FIRST = /\.(png|webp|avif|flac|json)$/i;

const TRIES = 4;

const MAX_BYTES = 256 * 1024 * 1024;

const found = new Map();

let active = false;

function reader() {
  return window.comfyAPI?.parser?.getWorkflowDataFromFile || null;
}

function asObject(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function fromFiles(jobId) {
  const answer = await api.fetchApi(`${API}/media-assets/job-files?job=${encodeURIComponent(jobId)}`);
  if (!answer.ok) return undefined;
  const seen = new Set();
  const files = ((await answer.json())?.files || []).filter((one) => {
    const where = `${one.type}/${one.subfolder}/${one.name}`;
    if (one.size > MAX_BYTES || seen.has(where)) return false;
    seen.add(where);
    return true;
  });
  const ordered = [...files.filter((one) => FIRST.test(one.name)),
    ...files.filter((one) => !FIRST.test(one.name))];
  const read = reader();
  for (const file of ordered.slice(0, TRIES)) {
    const query = new URLSearchParams({ filename: file.name, type: file.type, subfolder: file.subfolder || "" });
    const response = await api.fetchApi(`/view?${query}`);
    if (!response.ok) continue;
    const blob = await response.blob();
    const data = await read(new File([blob], file.name, { type: file.mime || blob.type }));
    const workflow = asObject(data?.workflow);
    const prompt = asObject(data?.prompt);
    if (!workflow && !prompt) continue;
    return { id: jobId, status: "completed",
             workflow: { prompt, extra_data: { extra_pnginfo: { workflow } } } };
  }
  return undefined;
}

function wrap(before) {
  return async function getJobDetail(jobId, ...rest) {
    const detail = await before.call(this, jobId, ...rest);
    if (detail || !active || !jobId) return detail;
    const id = String(jobId);
    if (!found.has(id)) {
      found.set(id, fromFiles(id).catch((error) => {
        console.warn("[Open Manager] Workflow from file: not read", error);
        found.delete(id);
        return undefined;
      }));
    }
    return found.get(id);
  };
}

export default {
  key: "qolAssetWorkflowFromFile",
  name: "Media Assets open workflows from files",
  tooltip: "A job no longer in history opens the workflow saved in its file.",
  issues: [],
  defaultValue: true,
  verified: "1.55.17",
  check() {
    if (typeof api?.getJobDetail !== "function") return "ComfyUI's job details are not reachable";
    if (typeof reader() !== "function") return "ComfyUI's file reader is not reachable";
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
      found.clear();
      if (api.getJobDetail !== mine) return;
      if (own) api.getJobDetail = before;
      else delete api.getJobDetail;
    });
  },
};
