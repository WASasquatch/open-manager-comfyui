import { api } from "../../../scripts/api.js";
import { app } from "../../../scripts/app.js";
import { toast } from "./ui.mjs";

const MODULE = /\/ue_nodes2\.js$/;

const SLOW_LOOKUP = "div[data-node-id='";

const PATCH_SETTING = "openManager.qolUseEverywhereLookups";

const SEEN_KEY = "om-use-everywhere-warned";

const WARN_AFTER_MS = 4000;

let found = null;

function slowUseEverywhere() {
  found ??= (async () => {
    try {
      const listed = await (await api.fetchApi("/extensions")).json();
      const url = (Array.isArray(listed) ? listed : []).find((one) => MODULE.test(String(one)));
      if (!url) return { installed: false, slow: false, mark: "" };
      const text = await (await fetch(api.fileURL ? api.fileURL(url) : url)).text();
      return { installed: true, slow: text.includes(SLOW_LOOKUP), mark: `${url}:${text.length}` };
    } catch {
      return { installed: false, slow: false, mark: "" };
    }
  })();
  return found;
}

function patchOn() {
  try {
    return app.extensionManager?.setting?.get?.(PATCH_SETTING) !== false;
  } catch {
    return true;
  }
}

function seen(mark) {
  try { return localStorage.getItem(SEEN_KEY) === mark; } catch { return false; }
}

function remember(mark) {
  try { localStorage.setItem(SEEN_KEY, mark); } catch {}
}

function warnUseEverywhere() {
  setTimeout(async () => {
    if (!window.LiteGraph?.vueNodesMode) return;
    const { slow, mark } = await slowUseEverywhere();
    if (!slow || seen(mark)) return;
    remember(mark);
    toast(patchOn()
      ? "Use Everywhere 8 slows Nodes 2.0 by searching the page for every node on every frame. "
        + "Open Manager speeds up those searches; the rest stays until Use Everywhere fixes it."
      : "Use Everywhere 8 slows Nodes 2.0 by searching the page for every node on every frame. "
        + "Quality of Life Patches > Use Everywhere finds nodes quickly takes most of that back.",
    { kind: "warn", sticky: true });
  }, WARN_AFTER_MS);
}

export { slowUseEverywhere, warnUseEverywhere };
