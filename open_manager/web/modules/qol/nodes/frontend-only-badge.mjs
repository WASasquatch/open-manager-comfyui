import { app } from "../../../../../scripts/app.js";
import { piniaStores } from "../shared.mjs";

const MODULE = "custom_nodes.frontend_only";

const ADDS = new Set(["updateNodeDefs", "addNodeDef"]);

const cleared = new Map();

function defStore() {
  const store = piniaStores()?.get("nodeDef");
  return store?.nodeDefsByName && typeof store.nodeDefsByName === "object"
    && typeof store.$onAction === "function"
    && [...ADDS].every((name) => typeof store[name] === "function")
    ? store
    : null;
}

function clearBadges(store) {
  const defs = store.nodeDefsByName;
  const raw = defs.__v_raw || defs;
  let changed = false;
  for (const name of Object.keys(raw)) {
    const source = raw[name]?.python_module === MODULE ? raw[name].nodeSource : null;
    if (!source?.badgeText || cleared.has(source)) continue;
    const shown = defs[name].nodeSource;
    cleared.set(source, [shown, source.badgeText]);
    shown.badgeText = "";
    changed = true;
  }
  if (changed) app.canvas?.setDirty?.(true, true);
}

function restoreBadges() {
  for (const [shown, text] of cleared.values()) {
    try { shown.badgeText = text; } catch {}
  }
  cleared.clear();
  app.canvas?.setDirty?.(true, true);
}

export default {
  key: "qolFrontendOnlyBadge",
  name: "No frontend_only badge",
  tooltip: "ComfyUI labels nodes that exist only in the browser, such as a pack's "
    + "JavaScript-only nodes, with a frontend_only source badge, even when built-in badges are "
    + "hidden. On, those nodes carry no source badge.",
  issues: ["Comfy-Org/ComfyUI_frontend#7618"],
  defaultValue: true,
  verified: "1.57.4",
  check() {
    if (!defStore()) return "ComfyUI's nodeDef store has changed";
    return "";
  },
  on(track, standDown) {
    const store = defStore();
    let due = false;
    const sweep = () => {
      due = false;
      try {
        clearBadges(store);
      } catch (error) {
        standDown(error);
      }
    };
    const stop = store.$onAction(({ name, after }) => {
      if (!ADDS.has(name)) return;
      after(() => {
        if (due) return;
        due = true;
        queueMicrotask(sweep);
      });
    });
    track(() => {
      stop?.();
      restoreBadges();
    });
    sweep();
  },
};
