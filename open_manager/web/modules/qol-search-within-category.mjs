function piniaStores() {
  return document.querySelector("#vue-app")?.__vue_app__?.config?.globalProperties?.$pinia?._s
    || null;
}

function searchService() {
  return piniaStores()?.get("nodeDef")?.nodeSearchService || null;
}

function dialogOpen() {
  const box = piniaStores()?.get("searchBox");
  return !!box?.visible && !!box.useSearchBoxV2;
}

function narrowsEveryMatch(shown, all) {
  Object.defineProperty(shown, "filter", {
    configurable: true,
    writable: true,
    value(predicate, thisArg) {
      return all.filter(predicate, thisArg);
    },
  });
  return shown;
}

export default {
  key: "qolSearchWithinCategory",
  name: "Node search narrows every match",
  tooltip: "The node search box keeps its top 64 matches, then narrows those to the selected "
    + "category or the Comfy, Partner or Extensions filter, so a lower-ranked node never "
    + "appears there. On, the selection narrows every match.",
  issues: ["Comfy-Org/ComfyUI_frontend#20696"],
  defaultValue: true,
  verified: "1.53.6",
  check() {
    if (!piniaStores()?.get("searchBox")) return "ComfyUI's search box is not reachable";
    const service = searchService();
    if (!service) return "ComfyUI's node search is not ready";
    if (!Object.hasOwn(Object.getPrototypeOf(service), "searchNode")) {
      return "ComfyUI's node search has changed";
    }
    return "";
  },
  on(track) {
    const proto = Object.getPrototypeOf(searchService());
    const before = proto.searchNode;
    const mine = function searchNode(query, filters, options, ...rest) {
      if (!options?.limit || !dialogOpen()) return before.call(this, query, filters, options, ...rest);
      const all = before.call(this, query, filters, { ...options, limit: 0 }, ...rest);
      return narrowsEveryMatch(all.slice(0, options.limit), all);
    };
    proto.searchNode = mine;
    track(() => {
      if (proto.searchNode === mine) proto.searchNode = before;
    });
  },
};
