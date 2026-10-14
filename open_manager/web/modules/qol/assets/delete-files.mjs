import { api } from "../../../../../scripts/api.js";
import { API } from "../../base.mjs";
import { whenSwitchedOff } from "../shared.mjs";

const KEY = "qolAssetDeleteFiles";

const FLAG = "asset_deletion_enabled";

const REASONS = {
  native: "ComfyUI deletes files itself",
  changed: "ComfyUI's asset deletion changed",
  "writes closed": "needs OPEN_MANAGER_FILE_WRITES=1",
};

async function serverState() {
  return (await api.fetchApi(`${API}/media-assets`)).json();
}

async function switchServer(on) {
  return (await api.fetchApi(`${API}/media-assets`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ delete_files: on }),
  })).json();
}

function claimFlag(track) {
  const own = Object.hasOwn(api, "getServerFeature");
  const before = api.getServerFeature;
  const mine = function getServerFeature(name, ...rest) {
    return name === FLAG ? true : before.call(this, name, ...rest);
  };
  api.getServerFeature = mine;
  track(() => {
    if (api.getServerFeature !== mine) return;
    if (own) api.getServerFeature = before;
    else delete api.getServerFeature;
  });
}

let run = 0;

async function start(track, standDown, mine) {
  try {
    if (api.getServerFeature(FLAG, false) === true) {
      standDown(REASONS.native);
      return;
    }
    let now = await serverState();
    if (REASONS[now?.reason]) {
      standDown(REASONS[now.reason]);
      return;
    }
    if (now?.reason) return;
    if (now?.delete_files !== true) now = await switchServer(true);
    if (mine === run && now?.available && now.delete_files) claimFlag(track);
  } catch (error) {
    console.warn("[Open Manager] Media Assets delete files: server not reached", error);
  }
}

export default {
  key: KEY,
  name: "Media Assets delete files",
  tooltip: "Deleting an output also deletes its file. Needs OPEN_MANAGER_FILE_WRITES=1.",
  issues: [],
  defaultValue: false,
  verified: "1.55.17",
  check() {
    if (typeof api?.getServerFeature !== "function") return "ComfyUI's feature flags are not reachable";
    return "";
  },
  on(track, standDown) {
    run += 1;
    void start(track, standDown, run);
    track(() => {
      run += 1;
      whenSwitchedOff(KEY, () => {
        switchServer(false).catch(() => {});
      });
    });
  },
};
