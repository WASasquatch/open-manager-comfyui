import { api } from "../../../../../scripts/api.js";
import { API } from "../../base.mjs";
import { piniaStores, whenSwitchedOff } from "../shared.mjs";

const KEY = "qolAssetGenerationTime";

const CHANNEL = "open_manager.generation";

const REASONS = {
  native: "ComfyUI now records generation time on assets itself",
  changed: "ComfyUI's execution has changed",
};

let active = false;

function flatOutputs() {
  let list = piniaStores()?.get("assets")?.outputAssets;
  while (list?.childList) list = list.childList;
  const items = list?.items;
  return Array.isArray(items) ? items : null;
}

function written(event) {
  const assets = event?.detail?.assets;
  if (!active || !assets || typeof assets !== "object") return;
  for (const item of flatOutputs() || []) {
    const details = assets[item?.id];
    if (details) item.user_metadata = { ...details, ...(item.user_metadata || {}) };
  }
}

api.addEventListener(CHANNEL, written);

async function serverState() {
  return (await api.fetchApi(`${API}/generation`)).json();
}

async function switchServer(on) {
  await api.fetchApi(`${API}/generation`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ on }),
  });
}

async function start(standDown) {
  try {
    const now = await serverState();
    if (REASONS[now?.reason]) {
      standDown(REASONS[now.reason]);
      return;
    }
    if (now?.on !== true) await switchServer(true);
  } catch (error) {
    console.warn("[Open Manager] Media Assets keep generation time: server not reached", error);
  }
}

export default {
  key: KEY,
  name: "Media Assets keep generation time",
  tooltip: "Runs write their generation time, node and subfolder onto their assets.",
  issues: ["Comfy-Org/ComfyUI_frontend#20862"],
  defaultValue: true,
  verified: "1.55.17",
  check() {
    if (typeof api?.fetchApi !== "function") return "ComfyUI's api is not reachable";
    return "";
  },
  on(track, standDown) {
    active = true;
    void start(standDown);
    track(() => {
      active = false;
      whenSwitchedOff(KEY, () => {
        switchServer(false).catch(() => {});
      });
    });
  },
};
