import { app } from "../../../../../scripts/app.js";

const METHOD = "_applyPromotedWidgetValues";

const READS_QUARANTINE = "_readQuarantineHostValuesByName";

const QUARANTINE = "proxyWidgetErrorQuarantine";

let owner = null;

function ownerOf(node) {
  for (let proto = Object.getPrototypeOf(node); proto; proto = Object.getPrototypeOf(proto)) {
    if (Object.hasOwn(proto, METHOD)) return proto;
  }
  return null;
}

function savedInputs(node, values) {
  const saved = new Set();
  if (!Array.isArray(values)) return saved;
  let index = 0;
  for (const input of node.inputs || []) {
    if (!input?.widgetId) continue;
    if (values[index] !== undefined) saved.add(input.name);
    index += 1;
  }
  return saved;
}

function shadows(entry, saved) {
  const [source, name] = entry?.originalEntry || [];
  return String(source) === "-1" && entry.hostValue !== undefined && saved.has(name);
}

function dropShadowing(node, values) {
  const properties = node.properties;
  const quarantine = properties?.[QUARANTINE];
  if (!Array.isArray(quarantine) || properties.proxyWidgets !== undefined) return;
  const saved = savedInputs(node, values);
  const kept = quarantine.filter((entry) => !shadows(entry, saved));
  if (kept.length === quarantine.length) return;
  if (kept.length) properties[QUARANTINE] = kept;
  else delete properties[QUARANTINE];
}

function subgraphNodes() {
  const root = app.rootGraph || app.graph;
  const graphs = root ? [root, ...(root.subgraphs?.values?.() || [])] : [];
  return graphs.flatMap((graph) => graph?.nodes || graph?._nodes || [])
    .filter((node) => node?.isSubgraphNode?.());
}

function install(proto, track, standDown) {
  const before = proto[METHOD];
  if (!String(before).includes(READS_QUARANTINE)) {
    standDown("saved subgraph values are no longer overridden on load");
    return;
  }
  owner = proto;
  const mine = function applyPromotedWidgetValues(values, ...rest) {
    try {
      dropShadowing(this, values);
    } catch (error) {
      console.warn("[Open Manager] Subgraph values: quarantine not checked", error);
    }
    return before.call(this, values, ...rest);
  };
  proto[METHOD] = mine;
  track(() => {
    if (proto[METHOD] === mine) proto[METHOD] = before;
    owner = null;
  });
}

function discover(node, track, standDown) {
  const proto = ownerOf(node);
  if (proto) install(proto, track, standDown);
  else standDown("subgraph nodes no longer restore their values the way this patch expects");
}

export default {
  key: "qolSubgraphValues",
  name: "Subgraph nodes keep their saved values",
  tooltip: "A subgraph node whose promoted widgets ComfyUI migrated keeps the values they had "
    + "then, and ComfyUI puts those back over the saved values every time the workflow loads. "
    + "On, the saved values are used and the old copies are removed.",
  issues: ["WASasquatch/open-manager-comfyui#31"],
  defaultValue: true,
  verified: "1.53.6",
  check() {
    const proto = window.LiteGraph?.LGraphNode?.prototype;
    if (typeof proto?.configure !== "function") return "the canvas is not ready";
    return "";
  },
  on(track, standDown) {
    const existing = subgraphNodes()[0];
    if (existing) {
      discover(existing, track, standDown);
      return;
    }
    const base = window.LiteGraph.LGraphNode.prototype;
    const configure = base.configure;
    let watching = true;
    const watch = function (...args) {
      if (watching && !owner && this?.isSubgraphNode?.()) {
        watching = false;
        if (base.configure === watch) base.configure = configure;
        discover(this, track, standDown);
      }
      return configure.apply(this, args);
    };
    base.configure = watch;
    track(() => {
      watching = false;
      if (base.configure === watch) base.configure = configure;
    });
  },
};
