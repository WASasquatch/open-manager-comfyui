import { piniaStores } from "../shared.mjs";
import { nodeTags, typesTagged, organizeNode, watchOrganizer } from "../../organizer.mjs";

const TREE = "TreeExplorerV2";

const ROW = "TreeExplorerV2Node";

const MENU = "MenuItems";

const OWN = "__omNodeTags";

const TICK = "__omNodeTagsTick";

const MARK = "om-ntag";

const END = "om-ntag-end";

const ATTR = "data-om-tags";

const LOOK_UP = 48;

const PROPS_FLAG = 8;

const TAG_CSS = `.${MARK}::after { content: attr(${ATTR}); order: 1; flex: 0 1 auto; min-width: 0;
  max-width: 45%; margin-left: 4px; padding: 0 6px; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; border-radius: 999px; font-size: 10px; line-height: 16px;
  color: var(--muted-foreground, #a1a1aa);
  background: color-mix(in srgb, var(--om-host-accent, #388bfd) 14%, transparent);
  border: 1px solid color-mix(in srgb, var(--om-host-accent, #388bfd) 35%, transparent); }
.${END} { order: 2; }`;

let active = false;

let mixin = null;

let sheet = null;

let shapeSeen = false;

let shapeWarned = false;

function vueApp() {
  return document.querySelector("#vue-app")?.__vue_app__ || null;
}

function settingStore() {
  return piniaStores()?.get("setting") || null;
}

function searchService() {
  return piniaStores()?.get("nodeDef")?.nodeSearchService || null;
}

function nativeTags() {
  const book = piniaStores()?.get("nodeBookmark");
  if (book && ("tags" in book || "nodeTags" in book || "tagNode" in book)) return true;
  const known = settingStore()?.settingsById;
  return !!known && typeof known === "object" && Object.keys(known)
    .some((id) => id.startsWith("Comfy.NodeLibrary.") && /tag/i.test(id));
}

function bump() {
  const store = settingStore();
  if (store) store[TICK] = (store[TICK] || 0) + 1;
}

function tick() {
  const store = settingStore();
  return store ? store[TICK] : 0;
}

function nameOf(instance) {
  return instance?.type?.__name || instance?.type?.name || "";
}

function splitTags(query) {
  const tags = [];
  const words = [];
  for (const word of String(query ?? "").split(/\s+/)) {
    if (!word) continue;
    if (word.startsWith("#")) {
      if (word.length > 1) tags.push(word.slice(1).toLowerCase());
    } else {
      words.push(word);
    }
  }
  return { tags, rest: words.join(" ") };
}

function passes(filters, def) {
  try {
    return (filters || []).every(({ filterDef, value }) => filterDef.matches(def, value));
  } catch {
    return true;
  }
}

let byName = { data: null, map: new Map() };

function defsNamed(service, names) {
  const data = service?.nodeFuseSearch?.data;
  if (!Array.isArray(data)) return [];
  if (byName.data !== data) {
    const map = new Map();
    for (const def of data) if (def?.name && !map.has(def.name)) map.set(def.name, def);
    byName = { data, map };
  }
  const found = [];
  for (const name of names) {
    const def = byName.map.get(name);
    if (def) found.push(def);
  }
  return found;
}

function everything(found) {
  return Object.hasOwn(found, "filter") ? found.filter(() => true) : found;
}

function shaped(list, limit) {
  if (!limit || list.length <= limit) return list;
  const shown = list.slice(0, limit);
  Object.defineProperty(shown, "filter", {
    configurable: true,
    writable: true,
    value(predicate, thisArg) {
      return list.filter(predicate, thisArg);
    },
  });
  return shown;
}

function tagged(tags) {
  let names = null;
  for (const tag of tags) {
    const found = typesTagged(tag);
    names = names ? new Set([...names].filter((one) => found.has(one))) : found;
    if (!names.size) break;
  }
  return names || new Set();
}

function searchWith(before) {
  return function searchNode(query, filters, options, ...rest) {
    if (!active) return before.call(this, query, filters, options, ...rest);
    const { tags, rest: words } = splitTags(query);
    const limit = options?.limit || 0;
    if (tags.length) {
      const names = tagged(tags);
      if (!names.size) return [];
      if (words) {
        const found = before.call(this, words, filters, { ...options, limit: 0 }, ...rest);
        return shaped(everything(found).filter((def) => names.has(def?.name)), limit);
      }
      const list = defsNamed(this, names).filter((def) => passes(filters, def))
        .sort((a, b) => String(a.display_name).localeCompare(String(b.display_name)));
      return shaped(list, limit);
    }
    const found = before.call(this, query, filters, options, ...rest);
    const want = String(query ?? "").trim().toLowerCase();
    if (want.length < 2 || !Array.isArray(found)) return found;
    const names = typesTagged(want);
    if (!names.size) return found;
    const first = defsNamed(this, names).filter((def) => passes(filters, def));
    if (!first.length) return found;
    const seen = new Set(first.map((def) => def.name));
    const all = everything(found);
    return shaped([...first, ...all.filter((def) => !seen.has(def?.name))], limit);
  };
}

function contextOf(instance) {
  let at = instance.parent;
  for (let depth = 0; at && depth < LOOK_UP; depth += 1) {
    const name = nameOf(at);
    if (name === MENU) return null;
    if (name === TREE) {
      const given = at.provides || {};
      for (const key of Object.getOwnPropertySymbols(given)) {
        const value = given[key];
        if (value?.__v_isRef) return value;
      }
      return null;
    }
    at = at.parent;
  }
  return null;
}

function addMenuItem(instance) {
  const context = contextOf(instance);
  const raw = instance.props?.__v_raw;
  if (!context || !raw || !Object.hasOwn(raw, "items")) return;
  const extra = {
    key: "om-folder-and-tags",
    label: "Folder and tags...",
    icon: "icon-[lucide--tag]",
    visible: () => active && context.value?.type === "node" && !!context.value?.data?.name,
    command: () => {
      const def = context.value?.data;
      if (def?.name) void organizeNode(def.name, def.display_name || def.name);
    },
  };
  let given = raw.items;
  let made = null;
  Object.defineProperty(raw, "items", {
    configurable: true,
    enumerable: true,
    get() {
      if (!Array.isArray(given)) return given;
      if (made?.from !== given) made = { from: given, list: [...given, extra] };
      return made.list;
    },
    set(value) {
      given = value;
    },
  });
}

function rowOf(out) {
  const list = Array.isArray(out) ? out : [out];
  return list.find((one) => one && one.type === "div" && one.props?.draggable === "true") || null;
}

function markRow(out, instance) {
  const row = rowOf(out);
  if (!row) return;
  shapeSeen = true;
  void tick();
  const name = instance.props?.item?.value?.data?.name;
  const tags = name ? nodeTags(name) : [];
  const props = { ...row.props, [ATTR]: tags.length ? tags.join(" · ") : null };
  if (tags.length) props.class = `${props.class || ""} ${MARK}`;
  row.props = props;
  row.dynamicProps = [...(row.dynamicProps || []).filter((key) => key !== ATTR), ATTR];
  if (row.patchFlag > 0) row.patchFlag |= PROPS_FLAG;
  const kids = Array.isArray(row.children) ? row.children : [];
  const end = kids[kids.length - 1];
  if (end && end.type === "div" && end.props && !String(end.props.class || "").includes(END)) {
    end.props = { ...end.props, class: `${end.props.class || ""} ${END}` };
  }
}

function wrapSlot(slot, instance) {
  if (slot[OWN]) return slot;
  const mine = function nodeTagsSlot(...args) {
    slot._d = mine._d;
    const out = slot.apply(this, args);
    if (active) {
      try {
        markRow(out, instance);
      } catch (error) {
        console.warn("[Open Manager] node tags", error);
      }
    }
    return out;
  };
  Object.assign(mine, slot);
  mine[OWN] = true;
  return mine;
}

function wrapRow(instance) {
  if (typeof instance.render !== "function" || instance.render[OWN]) return;
  const before = instance.render;
  const mine = function nodeTagsRender(...args) {
    const tree = before.apply(this, args);
    if (!active) return tree;
    const kids = Array.isArray(tree?.children) ? tree.children : [tree];
    for (const kid of kids) {
      const slots = kid?.children;
      if (slots && typeof slots === "object" && !Array.isArray(slots) && typeof slots.default === "function") {
        slots.default = wrapSlot(slots.default, instance);
      }
    }
    return tree;
  };
  mine[OWN] = true;
  instance.render = mine;
  if (shapeSeen || shapeWarned) return;
  setTimeout(() => {
    if (!active || shapeSeen || shapeWarned || !instance.isMounted) return;
    shapeWarned = true;
    console.info("[Open Manager] Node folders and tags: ComfyUI's Node Library rows changed; "
      + "tags show in search only");
  }, 0);
}

export default {
  key: "qolNodeFoldersTags",
  name: "Node folders and tags",
  tooltip: "Folder and tags in the Node Library's right-click menu and the node menu, tags beside "
    + "node names, and #tag in node search.",
  issues: ["WASasquatch/open-manager-comfyui#34"],
  defaultValue: true,
  verified: "1.58.5",
  check() {
    const app = vueApp();
    if (typeof app?.mixin !== "function" || !Array.isArray(app._context?.mixins)) {
      return "ComfyUI's Vue app changed";
    }
    if (!settingStore()) return "ComfyUI's settings are not reachable";
    const service = searchService();
    if (!service) return "ComfyUI's node search is not ready";
    if (!Object.hasOwn(Object.getPrototypeOf(service), "searchNode")) {
      return "ComfyUI's node search has changed";
    }
    return "";
  },
  on(track, standDown) {
    if (nativeTags()) {
      standDown("ComfyUI tags nodes itself");
      return;
    }
    const app = vueApp();
    const store = settingStore();
    if (!(TICK in store)) store[TICK] = 0;
    active = true;
    const proto = Object.getPrototypeOf(searchService());
    const before = proto.searchNode;
    const search = searchWith(before);
    proto.searchNode = search;
    mixin = {
      created() {
        if (!active) return;
        const name = nameOf(this.$);
        if (name === ROW) wrapRow(this.$);
        else if (name === MENU) addMenuItem(this.$);
      },
    };
    app.mixin(mixin);
    app._context.optionsCache = new WeakMap();
    sheet = document.createElement("style");
    sheet.textContent = TAG_CSS;
    document.head.appendChild(sheet);
    const unwatch = watchOrganizer(bump);
    track(() => {
      active = false;
      unwatch();
      if (proto.searchNode === search) proto.searchNode = before;
      byName = { data: null, map: new Map() };
      const mixins = app._context.mixins;
      const at = mixins.indexOf(mixin);
      if (at >= 0) mixins.splice(at, 1);
      app._context.optionsCache = new WeakMap();
      mixin = null;
      sheet?.remove();
      sheet = null;
      bump();
    });
  },
  menu(node) {
    const type = node?.type;
    const def = type ? piniaStores()?.get("nodeDef")?.nodeDefsByName?.[type] : null;
    if (!active || !def) return [];
    return [{
      content: "Folder and tags...",
      callback: () => { void organizeNode(type, def.display_name || type); },
    }];
  },
};
