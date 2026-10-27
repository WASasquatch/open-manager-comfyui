import { slowUseEverywhere } from "../../use-everywhere.mjs";

const PREFIX = "div[data-node-id='";

const SUFFIX = "']";

export default {
  key: "qolUseEverywhereLookups",
  name: "Use Everywhere finds nodes quickly",
  tooltip: "Use Everywhere 8 searches the whole page for each node on every frame in Nodes 2.0, "
    + "which can halve the frame rate on large workflows. On, those searches are answered from "
    + "the nodes already found.",
  issues: [],
  defaultValue: true,
  verified: "1.57.4",
  check() {
    return typeof Document.prototype.querySelector === "function" ? "" : "this browser cannot be patched";
  },
  on(track, standDown) {
    const original = Document.prototype.querySelector;
    const nodes = new Map();
    function querySelector(selectors) {
      if (this !== document || typeof selectors !== "string" || !selectors.startsWith(PREFIX)
          || !selectors.endsWith(SUFFIX)) {
        return original.call(this, selectors);
      }
      const id = selectors.slice(PREFIX.length, -SUFFIX.length);
      const held = nodes.get(id);
      if (held?.isConnected && held.getAttribute("data-node-id") === id) return held;
      const fresh = original.call(this, selectors);
      if (fresh?.classList?.contains("lg-node")) nodes.set(id, fresh);
      else nodes.delete(id);
      return fresh;
    }
    Document.prototype.querySelector = querySelector;
    track(() => {
      if (Document.prototype.querySelector === querySelector) Document.prototype.querySelector = original;
      nodes.clear();
    });
    slowUseEverywhere().then(({ installed, slow }) => {
      if (!installed) standDown("Use Everywhere is not installed");
      else if (!slow) standDown("Use Everywhere finds its nodes quickly itself");
    });
  },
};
