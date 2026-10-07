import { app } from "../../../scripts/app.js";
import { askText, toast } from "./ui.mjs";
import { parseNodePath, locateNode, revealNode } from "./node-focus.mjs";

const COMMAND_ID = "openManager.goToNode";

const NATIVE_ID = "Comfy.Canvas.GoToNode";

const LABEL = "Go to Node";

let enabled = false;

let fault = null;

function piniaStores() {
  return document.querySelector("#vue-app")?.__vue_app__?.config?.globalProperties?.$pinia?._s
    || null;
}

function commandStore() {
  const store = piniaStores()?.get("command");
  return typeof store?.registerCommand === "function" && typeof store?.isRegistered === "function"
    ? store
    : null;
}

function focusPrompt() {
  let tries = 0;
  const look = () => {
    const box = [...document.querySelectorAll("[role=\"dialog\"], .p-dialog")]
      .reverse().find((one) => one.textContent.includes(LABEL));
    const input = box?.querySelector("input");
    if (input) {
      if (document.activeElement !== input) input.focus();
      return;
    }
    tries += 1;
    if (tries < 20) requestAnimationFrame(look);
  };
  requestAnimationFrame(look);
}

async function ask() {
  const dialog = app.extensionManager?.dialog;
  if (typeof dialog?.prompt === "function") {
    const answer = dialog.prompt({ title: LABEL, message: "Node ID", defaultValue: "" });
    focusPrompt();
    return answer;
  }
  return askText(LABEL, "", "Go");
}

function report(text) {
  const message = `No node ${text}`;
  const toasts = app.extensionManager?.toast;
  if (typeof toasts?.add === "function") {
    toasts.add({ severity: "warn", summary: LABEL, detail: message, life: 3000 });
  } else {
    toast(message, { kind: "warn" });
  }
}

async function goToNode(metadata) {
  if (!enabled || !app.canvas) return;
  try {
    const typed = metadata?.nodeId ?? await ask();
    if (typed === null || typed === undefined || String(typed).trim() === "") return;
    const parts = parseNodePath(typed);
    const found = parts ? locateNode(parts) : null;
    if (!found) {
      report(String(typed).trim());
      return;
    }
    await revealNode(found);
  } catch (error) {
    fault?.(error);
  }
}

export default {
  key: "qolGoToNode",
  name: "Go to Node by ID",
  tooltip: "Adds Go to Node to the canvas menu and to the keybinding list. It takes a node ID, "
    + "or a path such as 12:5 for a node inside subgraph node 12, and opens and frames that node.",
  issues: ["Comfy-Org/ComfyUI_frontend#4089", "Comfy-Org/ComfyUI_frontend#12754"],
  defaultValue: true,
  verified: "1.54.8",
  check() {
    const store = commandStore();
    if (!store) return "ComfyUI's command store has changed";
    if (store.isRegistered(NATIVE_ID)) return "ComfyUI now has its own Go to Node";
    if (!window.LiteGraph || !app.canvas) return "the canvas is not ready";
    return "";
  },
  on(track, standDown) {
    const store = commandStore();
    if (!store.isRegistered(COMMAND_ID)) {
      store.registerCommand({
        id: COMMAND_ID,
        label: LABEL,
        icon: "pi pi-search",
        source: "Open Manager",
        function: goToNode,
      });
    }
    enabled = true;
    fault = standDown;
    track(() => {
      enabled = false;
      fault = null;
    });
  },
  canvasMenu() {
    return [null, { content: LABEL, callback: () => { goToNode(); } }];
  },
};
