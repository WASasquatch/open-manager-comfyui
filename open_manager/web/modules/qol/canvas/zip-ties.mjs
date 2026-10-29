import { app } from "../../../../../scripts/app.js";
import { start } from "./zip-ties/canvas.mjs";

const ORIGINAL = "safzan.ZipTies";

function canvasProto() {
  return app.canvas ? Object.getPrototypeOf(app.canvas) : null;
}

export default {
  key: "qolZipTies",
  name: "Zip ties",
  tooltip: "Dragging across links with Z held ties them into a ribbon, with Shift as well into a "
    + "straight one. Dragging across a tie, or double-clicking it, removes it. A tie moves by "
    + "dragging, turns by dragging with Alt held, in 45 degree steps with Shift, and takes a "
    + "colour from its right-click menu. Links enter a tie in the order they arrive, keep it "
    + "through every tie after, and cross only past the last one. They reorder as nodes move. "
    + "Hovering a tie shows a dot for each link on its outgoing side; dragging from one connects "
    + "that link's output to another input, through the tie.",
  issues: [],
  defaultValue: true,
  verified: "1.57.4",
  check() {
    const proto = canvasProto();
    if (typeof proto?.drawConnections !== "function" || typeof proto?.renderLink !== "function") {
      return "ComfyUI's link drawing has changed";
    }
    if (typeof app.canvas?.ds?.convertCanvasToOffset !== "function") {
      return "ComfyUI's canvas has changed";
    }
    if ((app.extensions || []).some((one) => one?.name === ORIGINAL)) {
      return "comfyui-zip-ties draws the ties";
    }
    return "";
  },
  on(track) {
    track(start());
  },
};
