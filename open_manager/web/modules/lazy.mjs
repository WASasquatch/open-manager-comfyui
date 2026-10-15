import { notify } from "./ui.mjs";

const loading = new Map();

let busy = 0;

function load(name) {
  if (!loading.has(name)) {
    busy += 1;
    document.documentElement.classList.add("om-fetching");
    const settle = () => {
      busy -= 1;
      if (!busy) document.documentElement.classList.remove("om-fetching");
    };
    const pending = import(`./${name}.mjs`);
    pending.then(settle, () => {
      settle();
      loading.delete(name);
    });
    loading.set(name, pending);
  }
  return loading.get(name);
}

function later(name, method) {
  return (...args) => load(name).then(
    (module) => module[method](...args),
    (error) => {
      notify("Not loaded", error?.message || String(error));
      return null;
    });
}

const openModelLibrary = later("library", "openModelLibrary");
const openMemoryPanel = later("memory", "openMemoryPanel");
const openFileBrowser = later("files", "openFileBrowser");
const openDesktopSettings = later("desk-settings", "openDesktopSettings");
const openManagePrograms = later("desk-settings", "openManagePrograms");
const openSnapshotWindow = later("snapshot-window", "openSnapshotWindow");
const openDownloadManager = later("downloads", "openDownloadManager");
const downloadNodeModels = later("downloads", "downloadNodeModels");
const addModelUrlToNode = later("downloads", "addModelUrlToNode");

export { load, openModelLibrary, openMemoryPanel, openFileBrowser, openDesktopSettings,
  openManagePrograms, openSnapshotWindow, openDownloadManager, downloadNodeModels,
  addModelUrlToNode };
