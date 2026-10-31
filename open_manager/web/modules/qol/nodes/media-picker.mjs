import { canMix, readyTick } from "./media-picker/vue.mjs";
import { startPlain } from "./media-picker/plain.mjs";
import { startFolders } from "./media-picker/folders.mjs";

const FOLDERS = "Grid with folders";

const PLAIN = "Plain list";

export default {
  key: "qolMediaPicker",
  name: "Image, video and audio pickers",
  tooltip: "On Nodes 2.0. Grid is ComfyUI's picker. Grid with folders opens the folders in "
    + "input and output. Plain list is a combo list with the upload button below it.",
  issues: [],
  options: ["Grid", "Grid with folders", "Plain list"],
  defaultValue: "Grid with folders",
  verified: "1.57.4",
  check() {
    if (!canMix()) return "ComfyUI's Vue app changed";
    if (!readyTick()) return "ComfyUI's settings store is not reachable";
    return "";
  },
  on(track, standDown, choice) {
    if (choice === FOLDERS) track(startFolders(standDown));
    else if (choice === PLAIN) track(startPlain(standDown));
  },
};
