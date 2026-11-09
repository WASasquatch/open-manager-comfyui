import { app } from "../../../../../scripts/app.js";
import { graphNodes, piniaStores } from "../shared.mjs";

const STORE = "nodeOutput";

const ACTION = "syncLegacyNodeImgs";

const CHANGED = "ComfyUI's node outputs changed";

function pinia() {
  return document.querySelector("#vue-app")?.__vue_app__?.config?.globalProperties?.$pinia || null;
}

function outputStore() {
  return piniaStores()?.get(STORE) || null;
}

function nodeFor(id) {
  const root = app.rootGraph || app.graph;
  if (!root || id === undefined || id === null || id === "") return null;
  const key = typeof id === "string" && /^-?\d+$/.test(id) ? Number(id) : id;
  for (const graph of [root, ...(root.subgraphs?.values?.() || [])]) {
    const node = graph?.getNodeById?.(key);
    if (node) return node;
  }
  return null;
}

function stranded(node) {
  const imgs = node?.imgs;
  return Array.isArray(imgs) && imgs.length === 1 && Number.isInteger(node.imageIndex)
    && node.imageIndex > 0;
}

function sweep() {
  if (!window.LiteGraph?.vueNodesMode) return;
  for (const node of graphNodes()) if (stranded(node)) node.imageIndex = 0;
}

export default {
  key: "qolImageMenuShownImage",
  name: "Image menu acts on the shown image",
  tooltip: "On Nodes 2.0, Open Image, Copy Image and Save Image in a node's menu do nothing "
    + "while the node shows any image but its first. On, they act on the image shown.",
  issues: [],
  defaultValue: true,
  verified: "1.58.5",
  check() {
    const store = outputStore();
    if (store) return typeof store[ACTION] === "function" ? "" : CHANGED;
    const host = pinia();
    return typeof host?.use === "function" && Array.isArray(host._p) ? "" : "ComfyUI's stores changed";
  },
  on(track, standDown) {
    let down = false;
    const patch = (store) => {
      const before = store[ACTION];
      if (typeof before !== "function") {
        standDown(CHANGED);
        return;
      }
      const mine = function shownImageSync(nodeId, element, ...rest) {
        const out = before.call(this, nodeId, element, ...rest);
        if (down || !(rest[0] > 0)) return out;
        try {
          const node = nodeFor(nodeId);
          if (stranded(node) && node.imgs[0] === element) {
            node.imageIndex = 0;
          } else if (Array.isArray(node?.imgs) && node.imgs.length > 1) {
            down = true;
            standDown("ComfyUI keeps every image on the node");
          }
        } catch (error) {
          console.warn("[Open Manager] Image menu acts on the shown image", error);
        }
        return out;
      };
      store[ACTION] = mine;
      track(() => {
        if (store[ACTION] === mine) store[ACTION] = before;
      });
      sweep();
    };
    const store = outputStore();
    if (store) {
      patch(store);
      return;
    }
    const host = pinia();
    let waiting = true;
    const unplug = () => {
      const at = host._p.indexOf(plugin);
      if (at >= 0) host._p.splice(at, 1);
    };
    function plugin({ store: made }) {
      if (!waiting || made?.$id !== STORE) return;
      waiting = false;
      queueMicrotask(unplug);
      patch(made);
    }
    host.use(plugin);
    track(() => {
      waiting = false;
      unplug();
    });
  },
};
