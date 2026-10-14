import { onEarly, offEarly } from "../early-events.mjs";
import { piniaStores } from "../shared.mjs";

const COMPLETED = "assets.seed.completed";

function completed(event) {
  if (!(Number(event?.detail?.created) > 0)) return;
  const stores = piniaStores();
  if (stores?.get("sidebarTab")?.activeSidebarTabId !== "assets") return;
  const assets = stores.get("assets");
  for (const list of [assets?.outputAssets, assets?.inputAssets]) {
    if (typeof list?.loadNew === "function") list.loadNew().catch(() => {});
  }
}

export default {
  key: "qolAssetScanEvents",
  name: "Media Assets show files found by scans",
  tooltip: "Files an asset scan adds appear in Media Assets.",
  issues: [],
  defaultValue: true,
  verified: "1.55.17",
  check() {
    return "";
  },
  on(track, standDown) {
    if (!onEarly(COMPLETED, completed)) {
      standDown("ComfyUI handles asset scans");
      return;
    }
    track(() => offEarly(COMPLETED));
  },
};
