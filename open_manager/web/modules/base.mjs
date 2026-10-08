const API = "/open_manager/v1/api";

const OM_BUILD = "0.2.0-desktop";

const iconUrl = (name) =>
  `${new URL(name, new URL("../", import.meta.url)).href}?v=${encodeURIComponent(OM_BUILD)}`;

const ICON_TAB = iconUrl("./discovery.svg");

const ICON_BRAND = iconUrl("./open-manager.svg");

const ICON_PROGRAM = iconUrl("./program.svg");

const ICON_MEMORY = iconUrl("./memory.svg");

const ICON_DOWNLOADS = iconUrl("./downloads.svg");

const ICON_LIBRARY = iconUrl("./library.svg");

const ICON_DESKTOP = iconUrl("./desktop.svg");

const ICON_FOLDER = iconUrl("./folder.svg");

const ICON_NOTE = iconUrl("./note.svg");

const ICON_FILE = iconUrl("./file.svg");

const ICON_BIN = iconUrl("./bin.svg");

const ICON_FLOW = iconUrl("./workflow.svg");

const ICON_SNAPSHOTS = iconUrl("./snapshots.svg");

const STATUS_COLOUR = {
  active: "#3fb950",
  pending: "#d29922",
  flagged: "#d29922",
  banned: "#f85149",
  deleted: "#8b949e",
  unknown: "#8b949e",
};

const SEVERITY_COLOUR = {
  critical: "#f85149",
  caution: "#d29922",
  note: "#8b949e",
};

const FLOAT_Z = 1300;
const FLOAT_Z_TOP = 1398;
const TASKBAR_Z = 1399;

const DESK_Z = 900;

const MODAL_Z = 1400;
const MENU_Z = 1450;
const HOST_MENU_Z = 1900;

const LOADING_GRACE = 180;

export { API, ICON_TAB, ICON_BRAND, ICON_PROGRAM, ICON_MEMORY, ICON_DOWNLOADS, ICON_LIBRARY, ICON_DESKTOP, ICON_FOLDER, ICON_NOTE, ICON_FILE, ICON_BIN, ICON_FLOW, ICON_SNAPSHOTS, STATUS_COLOUR, SEVERITY_COLOUR, FLOAT_Z, FLOAT_Z_TOP, TASKBAR_Z, DESK_Z, MODAL_Z, MENU_Z, HOST_MENU_Z, LOADING_GRACE };
