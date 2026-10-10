import { piniaStores } from "../shared.mjs";

const FILTER_ID = "openManager.hidePartnerNodes";

const PARTNER_NAV = "partner-nodes";

const PARTNER_CSS = `
[data-testid="login-button"] { display: none !important; }`;

function isPartnerNode(def) {
  return def?.api_node === true || String(def?.python_module || "").startsWith("comfy_api_nodes");
}

function isPartner(template) {
  return template?.isPartnerNode === true;
}

function withoutPartnerNav(items) {
  return items
    .filter((item) => item?.id !== PARTNER_NAV)
    .map((item) => (Array.isArray(item?.items) ? { ...item, items: withoutPartnerNav(item.items) } : item));
}

function narrowRef(raw, key, narrow, track) {
  const source = raw[key];
  if (!source?.__v_isRef) return;
  let seen = null;
  let kept = null;
  raw[key] = {
    __v_isRef: true,
    get value() {
      const all = source.value;
      if (all !== seen) {
        seen = all;
        kept = Array.isArray(all) ? narrow(all) : all;
      }
      return kept;
    },
  };
  track(() => { raw[key] = source; });
}

function hideTemplates(track) {
  const raw = piniaStores()?.get("workflowTemplates")?.__v_raw;
  if (!raw) return;
  narrowRef(raw, "enhancedTemplates", (all) => all.filter((one) => !isPartner(one)), track);
  narrowRef(raw, "navGroupedTemplates", withoutPartnerNav, track);
  const pick = raw.filterTemplatesByCategory;
  if (typeof pick === "function") {
    raw.filterTemplatesByCategory = function filterWithoutPartners(...args) {
      const found = pick.apply(this, args);
      return Array.isArray(found) ? found.filter((one) => !isPartner(one)) : found;
    };
    track(() => { raw.filterTemplatesByCategory = pick; });
  }
}

export default {
  key: "qolHidePartnerNodes",
  name: "Hide Partner nodes",
  tooltip: "Removes the paid Partner (API) nodes from node search and the node library, their "
    + "workflows from Templates, and the Login button. Partner nodes already in a workflow "
    + "still load and run.",
  issues: ["Comfy-Org/ComfyUI_frontend#6168", "Comfy-Org/ComfyUI_frontend#4785"],
  defaultValue: false,
  verified: "1.54.8",
  check() {
    const defs = piniaStores()?.get("nodeDef");
    if (typeof defs?.registerNodeDefFilter !== "function"
      || typeof defs?.unregisterNodeDefFilter !== "function") {
      return "ComfyUI's nodeDef store has changed";
    }
    return "";
  },
  on(track) {
    const defs = piniaStores().get("nodeDef");
    defs.registerNodeDefFilter({
      id: FILTER_ID,
      name: "Hide Partner nodes",
      description: "Open Manager: Partner (API) nodes are hidden",
      predicate: (def) => !isPartnerNode(def),
    });
    track(() => defs.unregisterNodeDefFilter(FILTER_ID));
    const tag = document.createElement("style");
    tag.id = "om-qol-partner-nodes";
    tag.textContent = PARTNER_CSS;
    document.head.appendChild(tag);
    track(() => tag.remove());
    hideTemplates(track);
  },
};
