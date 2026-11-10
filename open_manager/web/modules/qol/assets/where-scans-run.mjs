import { app } from "../../../../../scripts/app.js";
import { api } from "../../../../../scripts/api.js";
import { API } from "../../base.mjs";

const KEY = "qolAssetScans";

const ALONGSIDE = "Alongside the server";

const MODES = {
  [ALONGSIDE]: "thread",
  "Before the server starts": "before",
  "In their own process": "process",
};

const REASONS = {
  native: "ComfyUI runs asset scans in a process of their own itself",
  changed: "ComfyUI's asset scanner has changed",
};

function chosen() {
  try {
    return app.extensionManager?.setting?.get?.(`openManager.${KEY}`);
  } catch {
    return undefined;
  }
}

async function send(mode) {
  await api.fetchApi(`${API}/asset-scans`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode }),
  });
}

async function start(mode, standDown) {
  try {
    const now = await (await api.fetchApi(`${API}/asset-scans`)).json();
    if (REASONS[now?.reason]) {
      standDown(REASONS[now.reason]);
      return;
    }
    if (now?.mode !== mode) await send(mode);
  } catch (error) {
    console.warn("[Open Manager] Asset scans: server not reached", error);
  }
}

export default {
  key: KEY,
  name: "Asset scans",
  tooltip: "Alongside the server: as ComfyUI runs them. Before the server starts: ComfyUI opens "
    + "once the startup scan ends. In their own process: every scan runs in a separate process.",
  issues: [],
  options: ["Alongside the server", "Before the server starts", "In their own process"],
  defaultValue: "In their own process",
  verified: "1.58.5",
  check() {
    if (typeof api?.fetchApi !== "function") return "ComfyUI's api is not reachable";
    return "";
  },
  on(track, standDown, choice) {
    void start(MODES[choice], standDown);
    track(() => setTimeout(() => {
      if (chosen() === ALONGSIDE) send(MODES[ALONGSIDE]).catch(() => {});
    }, 0));
  },
};
