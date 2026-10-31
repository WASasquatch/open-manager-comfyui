import { api } from "../../../../../../scripts/api.js";
import { API, ICON_FOLDER } from "../../../base.mjs";
import { piniaStores } from "../../shared.mjs";
import { tick, bump, nameOf, rawProps, override, ancestorNamed, addMixin } from "./vue.mjs";

const MENU = "FormDropdownMenu";

const PICKER = "WidgetSelectDropdown";

const GRID = "VirtualGrid";

const TILE = "FormDropdownMenuItem";

const ACTIONS = "FormDropdownMenuActions";

const TYPES = { image: "image", video: "video", audio: "audio,video" };

const ROOTS = { all: ["input", "output"], inputs: ["input"], outputs: ["output"] };

const OUTPUT = " [output]";

const ANNOTATION = /\s\[(input|output|temp)\]$/;

const HASHED = /^[a-z0-9]+:[0-9a-f]{16,}$/i;

const NEEDED = ["items", "canLoadMore", "loadingMore", "onLoadMore", "filterSelected",
  "searchQuery", "sortSelected", "filterOptions"];

const THUMB_EDGE = 256;

const MARK = "__omMediaPicker";

const EMPTY = Object.freeze([]);

const RULES = `.om-media-crumbs { display: flex; flex-wrap: wrap; align-items: center; gap: 2px;
  margin-top: 8px; padding: 0 16px; font-size: 12px; line-height: 20px;
  color: var(--color-muted-foreground, #8a8a8a); }
.om-media-crumbs button { all: unset; box-sizing: border-box; cursor: pointer; padding: 0 4px;
  border-radius: 4px; max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.om-media-crumbs button:hover, .om-media-crumbs button:focus-visible {
  color: var(--color-base-foreground, #fff); background: color-mix(in srgb, currentColor 12%, transparent); }
.om-media-crumbs .om-media-up { display: inline-flex; align-items: center; justify-content: center;
  width: 20px; padding: 0; font-size: 16px; }
.om-media-crumbs .om-media-here { padding: 0 4px; color: var(--color-base-foreground, #fff);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 220px; }
.om-media-crumbs .om-media-sep { opacity: 0.5; }
.om-media-folder [data-testid="dropdown-item-media-placeholder"] { position: relative;
  background: color-mix(in srgb, currentColor 8%, transparent); }
.om-media-folder [data-testid="dropdown-item-media-placeholder"]::after { content: ""; position: absolute;
  inset: 24%; background: currentColor; opacity: 0.65;
  -webkit-mask: url("${ICON_FOLDER}") center / contain no-repeat; mask: url("${ICON_FOLDER}") center / contain no-repeat; }
.om-media-folder[data-om-count] { counter-reset: om-count var(--om-count); }
.om-media-folder[data-om-count] > :last-child::after { content: counter(om-count); display: block;
  font-size: 12px; color: var(--color-muted-foreground, #8a8a8a); }
.om-media-row > :last-child > span:first-child::before { content: ""; display: inline-block; width: 1.1em;
  height: 1.1em; margin-right: 0.45em; vertical-align: -0.2em; background: currentColor; opacity: 0.7;
  -webkit-mask: url("${ICON_FOLDER}") center / contain no-repeat; mask: url("${ICON_FOLDER}") center / contain no-repeat; }
.om-media-thumb span.text-muted-foreground { display: none; }`;

let serial = 0;

const fixed = new WeakSet();

function whereOf(value) {
  let text = typeof value === "string" ? value : "";
  let root = "input";
  const marked = ANNOTATION.exec(text);
  if (marked) {
    root = marked[1];
    text = text.slice(0, -marked[0].length);
  }
  const at = text.lastIndexOf("/");
  if (root === "temp" || at <= 0) return { root: null, path: "" };
  return { root, path: text.slice(0, at) };
}

function fixOutputs(given) {
  if (!Array.isArray(given) || fixed.has(given)) return given;
  fixed.add(given);
  for (const item of given) {
    const name = item?.name;
    if (typeof name !== "string" || !name.endsWith(OUTPUT) || !String(item.id).startsWith("output-")) continue;
    const bare = name.slice(0, -OUTPUT.length);
    if (bare.includes("/") || HASHED.test(bare) || !item.preview_url) continue;
    let sub = "";
    try {
      sub = new URL(item.preview_url, location.origin).searchParams.get("subfolder") || "";
    } catch {
      continue;
    }
    if (sub) item.name = `${sub}/${bare}${OUTPUT}`;
  }
  return given;
}

function browsing(state) {
  if (!state.live || state.failed) return false;
  const query = state.instance.props.searchQuery;
  return !(typeof query === "string" && query.trim());
}

function need(state, root, path, sort) {
  const key = `${root}|${path}|${sort}`;
  const kept = state.lists.get(key);
  if (kept) return kept;
  serial += 1;
  const held = { id: serial, data: null };
  state.lists.set(key, held);
  const query = new URLSearchParams({ root, path, types: state.types, sort });
  api.fetchApi(`${API}/assets/loadable?${query}`)
    .then(async (answer) => {
      if (answer.status === 404 && !String(answer.headers.get("content-type")).includes("json")) {
        state.failed = true;
        state.quit("Open Manager's server has no folder listing for loaders");
        return;
      }
      const body = await answer.json().catch(() => null);
      held.data = body?.ok ? body : { folders: [], items: [] };
    })
    .catch(() => {
      held.data = { folders: [], items: [] };
    })
    .finally(() => {
      if (state.live) bump();
    });
  return held;
}

function previewOf(state, root, item, rel) {
  if (state.kind === "image" && item.thumb && item.kind === "still") {
    const query = new URLSearchParams({
      root, path: rel, edge: String(THUMB_EDGE), v: `${item.at || 0}-${item.size || 0}`,
    });
    return api.apiURL(`${API}/assets/thumb?${query}`);
  }
  if (state.kind === "image" ? item.kind !== "other" : state.kind !== "video") return "";
  const at = rel.lastIndexOf("/");
  const query = new URLSearchParams({ filename: at >= 0 ? rel.slice(at + 1) : rel, type: root });
  if (at >= 0) query.set("subfolder", rel.slice(0, at));
  return api.apiURL(`/view?${query}`);
}

function build(state, levels, lists, tab) {
  const folders = [];
  const files = [];
  const mixed = tab === "all" && !state.root;
  levels.forEach((level, at) => {
    const data = lists[at].data;
    for (const folder of data?.folders || []) {
      const rel = level.path ? `${level.path}/${folder.name}` : folder.name;
      folders.push({
        id: `om:${level.root}:d:${rel}`,
        name: rel,
        label: mixed && level.root === "output" ? `${folder.name}${OUTPUT}` : folder.name,
        preview_url: "",
        omEntry: { folder: true, root: level.root, path: rel, count: folder.count },
      });
    }
    for (const item of data?.items || []) {
      const rel = item.sub ? `${item.sub}/${item.name}` : item.name;
      const value = level.root === "output" ? `${rel}${OUTPUT}` : rel;
      files.push({
        id: `om:${level.root}:f:${rel}`,
        name: value,
        label: level.root === "output" ? `${item.name}${OUTPUT}` : item.name,
        preview_url: previewOf(state, level.root, item, rel),
        omEntry: { value, still: state.kind === "image" && item.kind === "still" && !!item.thumb },
      });
    }
  });
  return [...folders, ...files];
}

function view(state) {
  const props = state.instance.props;
  const tab = ROOTS[props.filterSelected] ? props.filterSelected : "all";
  if (state.tab !== tab) {
    if (state.tab !== null || (state.root && !ROOTS[tab].includes(state.root))) {
      state.root = null;
      state.path = "";
      state.scrollTop = true;
    }
    state.tab = tab;
  }
  const byName = props.sortSelected === "name-asc";
  const levels = state.root
    ? [{ root: state.root, path: state.path }]
    : ROOTS[tab].map((root) => ({ root, path: "" }));
  const lists = levels.map((level) =>
    need(state, level.root, level.path, byName || level.root === "input" ? "name" : "new"));
  state.waiting = lists.some((held) => !held.data);
  if (state.waiting) return state.built || EMPTY;
  const key = `${tab}|${state.root}|${state.path}|${lists.map((held) => held.id).join(",")}`;
  if (state.builtKey !== key) {
    state.built = build(state, levels, lists, tab);
    state.builtKey = key;
  }
  return state.built;
}

function go(state, root, path) {
  state.root = root;
  state.path = root ? path : "";
  state.scrollTop = true;
  bump();
}

function goUp(state) {
  const at = state.path.lastIndexOf("/");
  if (at > 0) go(state, state.root, state.path.slice(0, at));
  else go(state, null, "");
}

function choose(state, entry) {
  state.picker.emit("update:modelValue", entry.value);
  piniaStores()?.get("workflow")?.activeWorkflow?.changeTracker?.captureCanvasState?.();
  state.instance.emit("close");
}

function tileOf(out) {
  const stack = Array.isArray(out) ? [...out] : [out];
  while (stack.length) {
    const vnode = stack.shift();
    if (!vnode || typeof vnode !== "object") continue;
    if (nameOf({ type: vnode.type }) === TILE) return vnode;
    if (Array.isArray(vnode.children)) stack.push(...vnode.children);
  }
  return null;
}

function dress(state, out, entry) {
  const tile = tileOf(out);
  if (!tile) {
    state.quit("ComfyUI's media picker tiles changed");
    return;
  }
  const props = tile.props || (tile.props = {});
  if (entry.folder) {
    props.onClick = () => go(state, entry.root, entry.path);
    props.selected = false;
    props.class = props.layout === "list-small" ? "om-media-folder om-media-row" : "om-media-folder";
    if (entry.count > 0) {
      props["data-om-count"] = String(entry.count);
      props.style = `--om-count: ${entry.count}`;
    }
    return;
  }
  props.onClick = () => choose(state, entry);
  props.selected = entry.value === state.picker.props.modelValue;
  if (entry.still) props.class = "om-media-thumb";
}

function dressSlot(state, slot) {
  if (slot[MARK]) return slot;
  const mine = function mediaPickerSlot(...args) {
    const was = slot._d;
    if ("_d" in mine) slot._d = mine._d;
    let out;
    try {
      out = slot.apply(this, args);
    } finally {
      slot._d = was;
    }
    const entry = args[0]?.item?.omEntry;
    if (entry && state.live) {
      try {
        dress(state, out, entry);
      } catch (error) {
        state.quit(error);
      }
    }
    return out;
  };
  Object.assign(mine, slot);
  mine[MARK] = true;
  return mine;
}

function look(state, tree) {
  state.grid = null;
  state.actions = null;
  const stack = [tree];
  while (stack.length) {
    const vnode = stack.pop();
    if (!vnode || typeof vnode !== "object") continue;
    if (Array.isArray(vnode)) {
      stack.push(...vnode);
      continue;
    }
    const name = nameOf({ type: vnode.type });
    if (name === GRID) {
      state.grid = vnode;
      const slots = vnode.children;
      if (slots && typeof slots === "object" && typeof slots.item === "function") {
        slots.item = dressSlot(state, slots.item);
      }
      continue;
    }
    if (name === ACTIONS) {
      state.actions = vnode;
      continue;
    }
    if (Array.isArray(vnode.children)) stack.push(...vnode.children);
  }
  if (browsing(state) && state.built?.length && !state.grid) {
    state.quit("ComfyUI's media picker changed");
    return;
  }
  queueMicrotask(() => settle(state));
}

function crumbButton(text, run) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = text;
  button.title = text;
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    run();
  });
  return button;
}

function crumbs(state, menu) {
  if (!browsing(state) || !state.root) {
    state.crumbs?.remove();
    state.crumbs = null;
    state.crumbKey = "";
    return;
  }
  if (!state.crumbs) {
    state.crumbs = document.createElement("nav");
    state.crumbs.className = "om-media-crumbs";
  }
  const key = `${state.tab}|${state.root}|${state.path}`;
  if (state.crumbKey !== key) {
    state.crumbKey = key;
    const nav = state.crumbs;
    nav.replaceChildren();
    const up = crumbButton("‹", () => goUp(state));
    up.className = "om-media-up";
    up.setAttribute("aria-label", "Back");
    up.title = "";
    const options = state.instance.props.filterOptions || [];
    const top = options.find((one) => one?.value === state.tab)?.name || state.tab;
    nav.append(up, crumbButton(top, () => go(state, null, "")));
    const parts = state.path.split("/");
    parts.forEach((part, at) => {
      const sep = document.createElement("span");
      sep.className = "om-media-sep";
      sep.textContent = "/";
      const label = at === 0 && state.root === "output" && state.tab === "all" ? `${part}${OUTPUT}` : part;
      if (at === parts.length - 1) {
        const here = document.createElement("span");
        here.className = "om-media-here";
        here.textContent = label;
        here.title = label;
        nav.append(sep, here);
      } else {
        const path = parts.slice(0, at + 1).join("/");
        nav.append(sep, crumbButton(label, () => go(state, state.root, path)));
      }
    });
  }
  const anchor = state.actions?.el;
  if (anchor?.parentNode === menu) {
    if (anchor.nextSibling !== state.crumbs) menu.insertBefore(state.crumbs, anchor.nextSibling);
  } else if (state.crumbs.parentNode !== menu) {
    const grid = state.grid?.el;
    menu.insertBefore(state.crumbs, grid?.parentNode === menu ? grid : null);
  }
}

function settle(state) {
  if (!state.live || state.instance.isUnmounted) return;
  const menu = state.instance.subTree?.el;
  if (!menu || menu.nodeType !== 1) return;
  if (state.scrollTop && !state.waiting) {
    const box = state.grid?.el;
    if (box?.nodeType === 1) box.scrollTop = 0;
    state.scrollTop = false;
  }
  crumbs(state, menu);
}

function attach(instance, quit) {
  const picker = ancestorNamed(instance, PICKER);
  if (!picker || picker.props?.isAssetMode) return null;
  const kind = picker.props?.assetKind;
  const types = TYPES[kind];
  if (!types) return null;
  const raw = rawProps(instance);
  if (!raw || NEEDED.some((key) => !Object.hasOwn(raw, key)) || typeof instance.render !== "function") {
    quit("ComfyUI's media picker changed");
    return null;
  }
  if (Object.keys(raw).some((key) => /folder/i.test(key))) {
    quit("ComfyUI's media picker shows folders itself");
    return null;
  }
  const start = whereOf(picker.props.modelValue);
  const state = {
    instance, picker, kind, types, quit, live: true, failed: false,
    tab: null, root: start.root, path: start.path, lists: new Map(),
    built: null, builtKey: "", waiting: false, scrollTop: false,
    grid: null, actions: null, crumbs: null, crumbKey: "", hooks: [], unwrap: null,
  };
  const views = {
    items: (given) => (browsing(state) ? (fixOutputs(given), view(state)) : fixOutputs(given)),
    canLoadMore: (given) => (browsing(state) ? false : given),
    loadingMore: (given) => (browsing(state) ? (view(state), state.waiting) : given),
    onLoadMore: (given) => (browsing(state) ? undefined : given),
  };
  for (const [key, shape] of Object.entries(views)) {
    const hook = override(instance, key, (given) => {
      tick();
      return shape(given);
    });
    if (!hook) {
      release(state);
      quit("ComfyUI's media picker changed");
      return null;
    }
    state.hooks.push(hook);
  }
  const before = instance.render;
  const mine = function mediaPickerRender(...args) {
    const tree = before.apply(this, args);
    if (state.live) {
      try {
        look(state, tree);
      } catch (error) {
        quit(error);
      }
    }
    return tree;
  };
  instance.render = mine;
  state.unwrap = () => {
    if (instance.render === mine) instance.render = before;
  };
  if (browsing(state)) view(state);
  return state;
}

function release(state) {
  state.live = false;
  for (const hook of state.hooks) hook.undo();
  state.hooks = [];
  state.unwrap?.();
  state.crumbs?.remove();
  state.crumbs = null;
}

function startFolders(quit) {
  let live = true;
  const states = new Set();
  const sheet = document.createElement("style");
  sheet.textContent = RULES;
  document.head.appendChild(sheet);
  const unmix = addMixin({
    created() {
      if (!live || nameOf(this.$) !== MENU) return;
      for (const one of states) if (one.instance.isUnmounted) states.delete(one);
      try {
        const state = attach(this.$, quit);
        if (state) states.add(state);
      } catch (error) {
        quit(error);
      }
    },
  });
  return () => {
    live = false;
    unmix();
    for (const state of states) release(state);
    states.clear();
    sheet.remove();
    bump();
  };
}

export { startFolders };
