import { panelSetting } from "./settings.mjs";
import { openPanelWindow, openManagerMenu } from "./discovery.mjs";
import { managerEntry } from "./topbar.mjs";
import { openPack } from "./packs.mjs";

const CORE_DIALOG = "global-manager";

const TAB_VIEW = {
  all: "registry",
  notInstalled: "registry",
  allInstalled: "installed",
  updateAvailable: "installed",
  conflicting: "installed",
  workflow: "missing",
  missing: "missing",
  unresolved: "missing",
};

function coreManagerOn() {
  return panelSetting("openManager.coreManagerUi", false) === true;
}

function dialogStore() {
  let vue = null;
  try { vue = document.getElementById("vue-app")?.__vue_app__; } catch {}
  return vue?.config?.globalProperties?.$pinia?._s?.get("dialog") || null;
}

function openInstead(props) {
  const packId = String(props?.initialPackId || "").trim();
  if (packId) {
    openPack(packId).catch(() => openPanelWindow("registry"));
    return;
  }
  if (managerEntry() === "classic") {
    openManagerMenu();
    return;
  }
  openPanelWindow(TAB_VIEW[props?.initialTab] || "registry");
}

function watchCoreManager(tries = 0) {
  const store = dialogStore();
  if (typeof store?.showDialog !== "function") {
    if (tries < 120) setTimeout(() => watchCoreManager(tries + 1), 500);
    return;
  }
  if (store.showDialog.omCoreManager) return;
  const shown = store.showDialog;
  const routed = function (options) {
    if (options?.key === CORE_DIALOG && !coreManagerOn()) {
      try { openInstead(options.props); } catch {}
      return null;
    }
    return shown.call(this, options);
  };
  routed.omCoreManager = true;
  store.showDialog = routed;
}

export { watchCoreManager };
