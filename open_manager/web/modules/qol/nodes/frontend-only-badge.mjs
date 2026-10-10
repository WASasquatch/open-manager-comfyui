import { app } from "../../../../../scripts/app.js";
import { piniaStores } from "../shared.mjs";

const MODULE = "custom_nodes.frontend_only";

const cleared = new Map();

function defStore() {
  const store = piniaStores()?.get("nodeDef");
  return store?.nodeDefsByName && typeof store.nodeDefsByName === "object"
    && typeof store.$onAction === "function"
    ? store
    : null;
}

function clearBadges(store) {
  let changed = false;
  for (const def of Object.values(store.nodeDefsByName)) {
    if (def?.python_module !== MODULE) continue;
    const source = def.nodeSource;
    if (!source?.badgeText || cleared.has(source)) continue;
    cleared.set(source, source.badgeText);
    source.badgeText = "";
    changed = true;
  }
  if (changed) app.canvas?.setDirty?.(true, true);
}

function restoreBadges() {
  for (const [source, text] of cleared) {
    try { source.badgeText = text; } catch {}
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
  verified: "1.54.8",
  check() {
    if (!defStore()) return "ComfyUI's nodeDef store has changed";
    return "";
  },
  on(track, standDown) {
    const store = defStore();
    const sweep = () => {
      try {
        clearBadges(store);
      } catch (error) {
        standDown(error);
      }
    };
    const stop = store.$onAction(({ name, after }) => {
      if (/nodedef/i.test(String(name))) after(sweep);
    });
    track(() => {
      stop?.();
      restoreBadges();
    });
    sweep();
  },
};
