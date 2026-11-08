import { app } from "../../../scripts/app.js";
import { el, closeOn } from "./ui.mjs";
import { piniaStores } from "./qol/shared.mjs";

const SETTING = "openManager.organizer";

const BOOKMARKS = "Comfy.NodeLibrary.Bookmarks.V2";

const LOOKS = "Comfy.NodeLibrary.BookmarksCustomization";

const WATCHED = new Set([SETTING, BOOKMARKS]);

const TAG_MAX = 40;

const TAGS_EACH = 24;

const NAME_MAX = 60;

const SUGGEST = 30;

const NONE = "\u0000none";

const FRESH = "\u0000new";

const watchers = new Set();

let organized = null;

let filed = null;

let indexed = null;

let due = false;

let listening = false;

let heard = false;

const fold = (value) => String(value ?? "").trim().toLowerCase().replace(/_/g, "-");

const byName = (a, b) => a.localeCompare(b, undefined, { sensitivity: "base" });

function settingOf(id, fallback) {
  try {
    const value = app.extensionManager?.setting?.get?.(id);
    return value === undefined || value === null ? fallback : value;
  } catch {
    return fallback;
  }
}

async function store(id, value) {
  listen();
  heard = false;
  await app.extensionManager.setting.set(id, value);
  if (!heard) changed();
}

function cleanTag(text) {
  return String(text ?? "").replace(/[#,]/g, " ").trim().replace(/\s+/g, "-").slice(0, TAG_MAX);
}

function cleanTags(list) {
  const seen = new Set();
  const out = [];
  for (const one of Array.isArray(list) ? list : []) {
    const tag = cleanTag(one);
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= TAGS_EACH) break;
  }
  return out;
}

function cleanFolder(text) {
  return String(text ?? "").replace(/\//g, " ").replace(/\s+/g, " ").trim().slice(0, NAME_MAX);
}

function cleanPath(text) {
  return String(text ?? "").split("/").map(cleanFolder).filter(Boolean).join("/");
}

function organizer() {
  if (organized) return organized;
  const raw = settingOf(SETTING, {});
  const packs = new Map();
  const nodes = new Map();
  if (raw && typeof raw === "object") {
    for (const [key, one] of Object.entries(raw.packs || {})) {
      if (!one || typeof one !== "object") continue;
      const folder = cleanFolder(one.folder);
      const tags = cleanTags(one.tags);
      if (folder || tags.length) packs.set(key, { folder, tags });
    }
    for (const [type, list] of Object.entries(raw.nodes || {})) {
      const tags = cleanTags(list);
      if (tags.length) nodes.set(type, tags);
    }
  }
  organized = { packs, nodes };
  return organized;
}

function saved(packs, nodes) {
  const out = { v: 1, packs: {}, nodes: {} };
  for (const [key, one] of packs) {
    const entry = {};
    if (one.folder) entry.folder = one.folder;
    if (one.tags.length) entry.tags = one.tags;
    if (Object.keys(entry).length) out.packs[key] = entry;
  }
  for (const [type, tags] of nodes) if (tags.length) out.nodes[type] = tags;
  return out;
}

function changed() {
  organized = null;
  filed = null;
  indexed = null;
  if (due) return;
  due = true;
  queueMicrotask(() => {
    due = false;
    for (const fn of [...watchers]) {
      try {
        fn();
      } catch (error) {
        console.warn("[Open Manager] folders and tags", error);
      }
    }
  });
}

function listen() {
  if (listening) return;
  listening = true;
  const hook = piniaStores()?.get("setting")?.onSettingChanged;
  if (typeof hook === "function") {
    hook(({ id }) => {
      if (!WATCHED.has(id)) return;
      heard = true;
      changed();
    });
    return;
  }
  const heardIt = () => {
    heard = true;
    changed();
  };
  for (const id of WATCHED) {
    try { app.ui.settings.addEventListener(`${id}.change`, heardIt); } catch {}
  }
}

function watchOrganizer(fn) {
  listen();
  watchers.add(fn);
  return () => watchers.delete(fn);
}

function packKey(pack) {
  return fold(String(pack?.dir || pack?.id || "").replace(/\.disabled$/, ""));
}

function packMarks(pack) {
  return organizer().packs.get(packKey(pack)) || { folder: "", tags: [] };
}

function packFolders() {
  const found = new Set();
  for (const one of organizer().packs.values()) if (one.folder) found.add(one.folder);
  return [...found].sort(byName);
}

function knownTags() {
  const found = new Map();
  const { packs, nodes } = organizer();
  for (const one of packs.values()) for (const tag of one.tags) found.set(tag.toLowerCase(), tag);
  for (const tags of nodes.values()) for (const tag of tags) found.set(tag.toLowerCase(), tag);
  return [...found.values()].sort(byName);
}

async function setPackMarks(pack, { folder, tags }) {
  const { packs, nodes } = organizer();
  const next = new Map(packs);
  const entry = { folder: cleanFolder(folder), tags: cleanTags(tags) };
  if (entry.folder || entry.tags.length) next.set(packKey(pack), entry);
  else next.delete(packKey(pack));
  await store(SETTING, saved(next, nodes));
}

function nodeTags(type) {
  return organizer().nodes.get(type) || [];
}

function nodeTagMap() {
  return organizer().nodes;
}

function tagIndex() {
  if (indexed) return indexed;
  indexed = new Map();
  for (const [type, tags] of organizer().nodes) {
    for (const tag of tags) {
      const key = tag.toLowerCase();
      if (!indexed.has(key)) indexed.set(key, new Set());
      indexed.get(key).add(type);
    }
  }
  return indexed;
}

function typesTagged(prefix) {
  const want = String(prefix || "").toLowerCase();
  const found = new Set();
  for (const [tag, types] of tagIndex()) {
    if (!tag.startsWith(want)) continue;
    for (const type of types) found.add(type);
  }
  return found;
}

async function setNodeTags(type, tags) {
  const { packs, nodes } = organizer();
  const next = new Map(nodes);
  const clean = cleanTags(tags);
  if (clean.length) next.set(type, clean);
  else next.delete(type);
  await store(SETTING, saved(packs, next));
}

function bookmarks() {
  const list = settingOf(BOOKMARKS, []);
  return Array.isArray(list) ? list.filter((one) => typeof one === "string" && one) : [];
}

function lastPart(entry) {
  const at = entry.lastIndexOf("/");
  return at < 0 ? entry : entry.slice(at + 1);
}

function favourites() {
  if (filed) return filed;
  const byType = new Map();
  const folders = new Set();
  const chain = (path) => {
    const parts = path.split("/").filter(Boolean);
    for (let at = 1; at <= parts.length; at += 1) folders.add(parts.slice(0, at).join("/"));
  };
  for (const entry of bookmarks()) {
    if (entry.endsWith("/")) {
      chain(entry.slice(0, -1));
      continue;
    }
    const at = entry.lastIndexOf("/");
    const folder = at < 0 ? "" : entry.slice(0, at);
    if (folder) chain(folder);
    const type = lastPart(entry);
    if (!byType.has(type)) byType.set(type, folder);
  }
  filed = { byType, folders: [...folders].sort(byName) };
  return filed;
}

function favouriteFolder(type) {
  const found = favourites().byType;
  return found.has(type) ? found.get(type) : null;
}

async function fileNode(type, folder) {
  const kept = bookmarks().filter((entry) => entry.endsWith("/") || lastPart(entry) !== type);
  if (folder !== null && folder !== undefined) {
    const path = cleanPath(folder);
    if (path && !favourites().folders.includes(path)) kept.push(`${path}/`);
    kept.push(path ? `${path}/${type}` : type);
  }
  await store(BOOKMARKS, kept);
}

async function relook(from, to) {
  const looks = settingOf(LOOKS, {});
  if (!looks || typeof looks !== "object") return;
  const next = {};
  let moved = false;
  for (const [key, value] of Object.entries(looks)) {
    if (value === undefined || value === null) continue;
    if (key.startsWith(from)) {
      moved = true;
      if (to) next[to + key.slice(from.length)] = value;
    } else {
      next[key] = value;
    }
  }
  if (moved) await app.extensionManager.setting.set(LOOKS, next);
}

async function renameNodeFolder(path, name) {
  const from = `${cleanPath(path)}/`;
  const clean = cleanFolder(name);
  if (from === "/" || !clean) return false;
  const parent = from.slice(0, -1).split("/").slice(0, -1);
  const to = `${[...parent, clean].join("/")}/`;
  if (to === from) return true;
  const list = bookmarks();
  if (list.some((entry) => entry.startsWith(to))) return false;
  await store(BOOKMARKS, list.map((entry) => (entry.startsWith(from)
    ? to + entry.slice(from.length) : entry)));
  await relook(from, to);
  return true;
}

function folderHolds(path) {
  const from = `${cleanPath(path)}/`;
  return bookmarks().filter((entry) => entry.startsWith(from) && !entry.endsWith("/")).length;
}

async function deleteNodeFolder(path) {
  const from = `${cleanPath(path)}/`;
  if (from === "/") return;
  await store(BOOKMARKS, bookmarks().filter((entry) => !entry.startsWith(from)));
  await relook(from, "");
}

function parseQuery(text) {
  const tags = [];
  const words = [];
  for (const word of String(text || "").toLowerCase().split(/\s+/)) {
    if (!word) continue;
    if (word.startsWith("#")) {
      if (word.length > 1) tags.push(word.slice(1));
    } else {
      words.push(word);
    }
  }
  return { tags, text: words.join(" ") };
}

function hasTags(tags, wanted) {
  return wanted.every((want) => tags.some((tag) => tag.toLowerCase().startsWith(want)));
}

function tagPill(tag, onPick) {
  const pill = el(onPick ? "button" : "span", "om-tag", tag);
  if (onPick) {
    pill.type = "button";
    pill.onclick = (event) => {
      event.stopPropagation();
      onPick(tag);
    };
  }
  return pill;
}

function folderChoices(kind, folders) {
  if (kind === "node") {
    return [
      [NONE, "Not a favourite"],
      ["", "Favourites"],
      ...folders.map((path) => [path, `Favourites / ${path.split("/").join(" / ")}`]),
      [FRESH, "New folder..."],
    ];
  }
  return [["", "No folder"], ...folders.map((name) => [name, name]), [FRESH, "New folder..."]];
}

function organizeDialog({ title, kind, folder, folders, tags, known }) {
  return new Promise((resolve) => {
    const backdrop = el("div", "om-backdrop");
    const box = el("div", "om-note om-org");
    box.appendChild(el("div", "om-note-title", title));

    const where = el("label", "om-org-field");
    where.appendChild(el("span", "om-org-label", "Folder"));
    const select = el("select", "om-side-select om-org-select");
    for (const [value, label] of folderChoices(kind, folders)) {
      const option = el("option", null, label);
      option.value = value;
      select.appendChild(option);
    }
    select.value = folder === null ? NONE : folder;
    const fresh = el("input", "om-search om-org-new");
    fresh.placeholder = "Folder name";
    fresh.spellcheck = false;
    fresh.hidden = true;
    select.addEventListener("change", () => {
      fresh.hidden = select.value !== FRESH;
      if (!fresh.hidden) fresh.focus();
    });
    where.append(select, fresh);
    box.appendChild(where);

    const chosen = cleanTags(tags);
    const field = el("div", "om-org-field");
    field.appendChild(el("span", "om-org-label", "Tags"));
    const holder = el("div", "om-org-tags");
    const input = el("input", "om-org-tag-input");
    input.placeholder = "Add a tag";
    input.spellcheck = false;
    const offers = el("div", "om-org-offers");
    field.append(holder, offers);
    box.appendChild(field);

    const add = (text) => {
      const tag = cleanTag(text);
      if (!tag || chosen.some((one) => one.toLowerCase() === tag.toLowerCase())) return;
      if (chosen.length >= TAGS_EACH) return;
      chosen.push(tag);
    };
    const draw = () => {
      const chips = chosen.map((tag, at) => {
        const chip = el("span", "om-tag om-org-chip", tag);
        const drop = el("button", "om-org-drop", "×");
        drop.type = "button";
        drop.setAttribute("aria-label", `Remove ${tag}`);
        drop.onclick = () => {
          chosen.splice(at, 1);
          draw();
          input.focus();
        };
        chip.appendChild(drop);
        return chip;
      });
      holder.replaceChildren(...chips, input);
      const typed = cleanTag(input.value).toLowerCase();
      const have = new Set(chosen.map((one) => one.toLowerCase()));
      const picks = known.filter((tag) => !have.has(tag.toLowerCase())
        && (!typed || tag.toLowerCase().startsWith(typed))).slice(0, SUGGEST);
      offers.replaceChildren(...picks.map((tag) => tagPill(tag, () => {
        add(tag);
        input.value = "";
        draw();
        input.focus();
      })));
    };
    holder.addEventListener("click", (event) => {
      if (event.target === holder) input.focus();
    });
    input.addEventListener("input", () => {
      if (!input.value.includes(",")) {
        draw();
        input.focus();
        return;
      }
      const parts = input.value.split(",");
      input.value = parts.pop();
      for (const part of parts) add(part);
      draw();
      input.focus();
    });

    const foot = el("div", "om-note-foot");
    const cancel = el("button", "om-btn", "Cancel");
    const ok = el("button", "om-btn om-go", "Save");
    const finish = (answer) => {
      backdrop.remove();
      resolve(answer);
    };
    cancel.onclick = () => finish(null);
    ok.onclick = () => {
      if (input.value.trim()) add(input.value);
      let place = select.value;
      if (place === FRESH) {
        place = kind === "node" ? cleanPath(fresh.value) : cleanFolder(fresh.value);
        if (!place) {
          fresh.focus();
          return;
        }
      }
      finish({ folder: place === NONE ? null : place, tags: [...chosen] });
    };
    input.addEventListener("keydown", (event) => {
      if (event.isComposing) return;
      if (event.key === "Enter") {
        event.preventDefault();
        if (input.value.trim()) {
          add(input.value);
          input.value = "";
          draw();
          input.focus();
        } else {
          ok.click();
        }
      } else if (event.key === "Backspace" && !input.value && chosen.length) {
        chosen.pop();
        draw();
        input.focus();
      }
    });
    fresh.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.isComposing) ok.click();
    });
    foot.append(cancel, ok);
    box.appendChild(foot);
    backdrop.appendChild(box);
    document.body.appendChild(backdrop);
    closeOn(backdrop, () => finish(null));
    draw();
    input.focus();
  });
}

async function organizePack(pack, title) {
  const mine = packMarks(pack);
  const answer = await organizeDialog({
    title: title || pack?.id || pack?.dir || "Pack",
    kind: "pack",
    folder: mine.folder,
    folders: packFolders(),
    tags: mine.tags,
    known: knownTags(),
  });
  if (!answer) return false;
  await setPackMarks(pack, { folder: answer.folder || "", tags: answer.tags });
  return true;
}

async function organizeNode(type, title) {
  const name = String(type || "");
  if (!name) return false;
  const was = favouriteFolder(name);
  const tags = nodeTags(name);
  const answer = await organizeDialog({
    title: title || name,
    kind: "node",
    folder: was,
    folders: favourites().folders,
    tags,
    known: knownTags(),
  });
  if (!answer) return false;
  if (answer.folder !== was) await fileNode(name, answer.folder);
  if (tags.join("\u0000") !== cleanTags(answer.tags).join("\u0000")) await setNodeTags(name, answer.tags);
  return true;
}

export {
  SETTING as ORGANIZER_SETTING, changed as organizerChanged, watchOrganizer, packKey, packMarks,
  packFolders, knownTags, setPackMarks, nodeTags, nodeTagMap, typesTagged, setNodeTags,
  favourites, favouriteFolder, fileNode, renameNodeFolder, deleteNodeFolder, folderHolds,
  parseQuery, hasTags, tagPill, organizePack, organizeNode,
};
