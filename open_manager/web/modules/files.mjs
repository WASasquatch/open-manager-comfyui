import { api } from "../../../scripts/api.js";
import { API, ICON_FOLDER } from "./base.mjs";
import { el, closeOn, toast, notify, askText, confirmAction, openRowMenu, countNote } from "./ui.mjs";
import { windowSize, floatPanels, createFloatingPanel } from "./windows.mjs";
import { dlPost, bytesText } from "./downloads.mjs";
import { SHOWN_KINDS, EDITS_HERE, suffixOf, viewRootOf, runProgramById } from "./programs.mjs";
import { omIcon } from "./taskbar.mjs";
import { docPath, placeDoc, NEW_NOTE_NAME, docsIn, DOC_DESKTOP, DOC_DOCUMENTS, refreshDocs, openNote, docKindOf, docsPathOf, parentOf, openDoc, removeDoc } from "./desk-docs.mjs";
import { pinDesk } from "./desk-icons.mjs";

const FILE_WORDS = {
  image: "Image", video: "Video", audio: "Audio", model: "Model", text: "Text",
  other: "File",
};

let fileWindows = 0;

function openFileBrowser(start = "", at = "") {
  const wanted = `${start}|${at || ""}`;
  for (const [key, one] of floatPanels) {
    if (!key.startsWith("files:")) continue;
    if (start ? one._omAt?.() === wanted : true) {
      one.present();
      return one;
    }
  }
  const panel = createFloatingPanel({
    key: `files:${++fileWindows}`, title: "Folders", ...windowSize("folder"), modal: false,
  });
  panel.setMaskIcon(ICON_FOLDER);

  const state = { places: [], place: start, path: at || "", writable: false, heavy: false,
                  folders: [], items: [], marks: {} };

  const placeWritable = (held) => !!state.places.find((one) => one.id === held)?.writable;

  const wrap = el("div", "om-files");
  const tree = el("div", "om-files-tree");
  const right = el("div", "om-files-right");
  const trail = el("div", "om-files-trail");
  const list = el("div", "om-files-list");
  list.tabIndex = 0;
  right.appendChild(trail);
  right.appendChild(list);
  const grip = el("div", "om-files-grip");
  grip.title = "Resize";
  wrap.appendChild(tree);
  wrap.appendChild(grip);
  wrap.appendChild(right);

  const TREE_KEY = "om-files-tree-width";
  const TREE_MIN = 150;
  const TREE_MAX = 560;

  const setTree = (width) => {
    const held = Math.max(TREE_MIN, Math.min(TREE_MAX, Math.round(width)));
    tree.style.width = `${held}px`;
    return held;
  };

  try {
    setTree(Number(localStorage.getItem(TREE_KEY)) || 212);
  } catch {
    setTree(212);
  }

  grip.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    try {
      grip.setPointerCapture(event.pointerId);
    } catch {
    }
    const from = { x: event.clientX, width: tree.offsetWidth };
    const move = (held) => setTree(from.width + (held.clientX - from.x));
    const done = () => {
      grip.removeEventListener("pointermove", move);
      grip.removeEventListener("pointerup", done);
      grip.removeEventListener("pointercancel", done);
      try { localStorage.setItem(TREE_KEY, String(tree.offsetWidth)); } catch {}
    };
    grip.addEventListener("pointermove", move);
    grip.addEventListener("pointerup", done);
    grip.addEventListener("pointercancel", done);
  });
  panel.body.appendChild(wrap);

  const here = (name) => (state.path ? `${state.path}/${name}` : name);

  let chosen = "";
  let order = [];

  const rowFor = (name) => list.querySelector(`[data-om-name="${CSS.escape(name)}"]`);

  const mark = (name, { scroll = false } = {}) => {
    chosen = name || "";
    for (const row of list.querySelectorAll(".om-files-row")) {
      row.classList.toggle("om-files-row-on", row.dataset.omName === chosen);
    }
    if (scroll) rowFor(chosen)?.scrollIntoView({ block: "nearest" });
  };

  const step = (by) => {
    if (!order.length) return;
    const at = order.indexOf(chosen);
    const to = at < 0
      ? (by > 0 ? 0 : order.length - 1)
      : Math.max(0, Math.min(order.length - 1, at + by));
    mark(order[to], { scroll: true });
  };

  const markOf = (place, path) => state.marks[`${place}|${path || ""}`] || null;

  const markArt = (place, path, name) => {
    const mark = markOf(place, path);
    if (mark?.icon) {
      return omIcon(
        { kind: "src", url: `${API}/marks/icon?name=${encodeURIComponent(mark.icon)}`,
          fallback: { kind: "mask", url: ICON_FOLDER } },
        { name, cls: "om-fold-art", img: "om-fold-img" });
    }
    return omIcon({ kind: "mask", url: ICON_FOLDER, tint: mark?.colour || "" },
                  { name, cls: "om-fold-art", img: "om-fold-img" });
  };

  const readMarks = async () => {
    try {
      const answer = await (await api.fetchApi(`${API}/marks`)).json();
      state.marks = answer?.ok ? (answer.marks || {}) : {};
    } catch {
      state.marks = {};
    }
  };

  const ask = async (place, path) => {
    const query = new URLSearchParams({ place, path: path || "" });
    try {
      return await (await api.fetchApi(`${API}/files?${query}`)).json();
    } catch {
      return { ok: false, reason: "That directory could not be read." };
    }
  };

  const post = async (where, body) => {
    try {
      return await dlPost(where, body);
    } catch {
      return { ok: false, reason: "The server did not answer." };
    }
  };

  const drawTrail = () => {
    trail.replaceChildren();
    const place = state.places.find((one) => one.id === state.place);
    if (!place) return;
    const step = (label, to, last) => {
      const crumb = el("button", `gal-step${last ? " gal-step-here" : ""}`, label);
      crumb.onclick = () => go(state.place, to);
      trail.appendChild(crumb);
    };
    const parts = state.path ? state.path.split("/") : [];
    step(place.label, "", !parts.length);
    let walked = "";
    parts.forEach((part, at) => {
      walked = walked ? `${walked}/${part}` : part;
      trail.appendChild(el("span", "gal-sep", "›"));
      step(shownName(part), walked, at === parts.length - 1);
    });
    if (!state.writable) trail.appendChild(el("span", "om-files-readonly", "Read-only"));
  };

  const tintFolder = (path) => {
    const field = el("input");
    field.type = "color";
    field.value = markOf(state.place, path)?.colour || "#3fb950";
    field.style.position = "fixed";
    field.style.left = "-9999px";
    document.body.appendChild(field);
    field.addEventListener("change", async () => {
      const picked = field.value;
      field.remove();
      const answer = await post("/marks/colour",
                                { place: state.place, path, colour: picked });
      if (!answer?.ok) {
        notify("Not coloured", answer?.reason || "The colour could not be kept.");
        return;
      }
      await readMarks();
      drawTree();
      fill();
    });
    field.click();
  };

  const iconFolder = (path) => {
    const field = el("input");
    field.type = "file";
    field.accept = ".png,.webp,.ico,image/png,image/webp,image/x-icon";
    field.style.display = "none";
    document.body.appendChild(field);
    field.addEventListener("change", async () => {
      const file = field.files?.[0];
      field.remove();
      if (!file) return;
      const at = file.name.lastIndexOf(".");
      const suffix = at < 0 ? "" : file.name.slice(at).toLowerCase();
      const held = await file.arrayBuffer();
      let raw = "";
      const bytes = new Uint8Array(held);
      for (let i = 0; i < bytes.length; i += 1) raw += String.fromCharCode(bytes[i]);
      const answer = await post("/marks/icon",
                                { place: state.place, path, suffix, data: btoa(raw) });
      if (!answer?.ok) {
        notify("Not set", answer?.reason || "The icon could not be kept.");
        return;
      }
      await readMarks();
      drawTree();
      fill();
    });
    field.click();
  };

  const shownName = (part) => (state.place.startsWith("docs:")
    ? String(part || "").replace(/~[0-9a-z]{8}(\.[A-Za-z0-9]+)?$/, "")
    : part);


  const openFileAt = async (one) => {
    const kind = SHOWN_KINDS[one.kind] || "";
    if (kind) {
      const beside = state.items
        .filter((other) => SHOWN_KINDS[other.kind] === kind)
        .map((other) => ({ name: other.name, sub: state.path || "", kind,
                           size: other.size, at: other.at }));
      runProgramById(kind === "still" ? "viewer" : "player",
                     { items: beside, name: one.name, root: viewRootOf(state.place) });
      return;
    }
    if (state.place.startsWith("docs:")) {
      const here = docsPathHere();
      const want = here ? `${here}/${one.name}` : one.name;
      const answer = await docsIn(here);
      const item = (answer.items || []).find((other) => docPath(other) === want);
      if (item) { openDoc(item); return; }
    }
    if (EDITS_HERE.has(suffixOf(one.name))) {
      openNote(placeDoc(state.place, here(one.name), one.label || one.name));
      return;
    }
    notify(one.label || one.name, "No viewer for this kind of file.");
  };

  const newFolder = el("button", "om-btn", "New folder");
  newFolder.onclick = async () => {
    const asked = await askText("New folder", "Untitled", "Make");
    if (asked === null) return;
    const answer = await post("/files/folder",
                              { place: state.place, path: state.path, name: String(asked) });
    if (!answer?.ok) {
      notify("Not made", answer?.reason || "It could not be made.");
      return;
    }
    under.delete(branch(state.place, state.path));
    await readInto(state.place, state.path);
    drawTree();
    fill();
  };

  const docsPathHere = () => {
    const home = state.place === "docs:documents" ? DOC_DOCUMENTS : DOC_DESKTOP;
    return state.path ? `${home}/${state.path}` : home;
  };

  const newNote = el("button", "om-btn om-go", "New note");
  newNote.onclick = async () => {
    const answer = await dlPost("/docs/new",
                                { parent: docsPathHere(), name: NEW_NOTE_NAME })
      .catch(() => null);
    if (!answer?.ok) {
      notify("Not made", answer?.reason || "It could not be made.");
      return;
    }
    fill();
    openDoc(answer.item);
  };

  panel.tools.appendChild(newNote);
  panel.tools.appendChild(newFolder);

  const drawTools = () => {
    newFolder.hidden = !state.writable;
    newNote.hidden = !(state.writable && state.place.startsWith("docs:"));
  };

  const pickTarget = (title) => new Promise((settle) => {
    const backdrop = el("div", "om-backdrop");
    const box = el("div", "om-note om-note-wide om-save");
    box.appendChild(el("div", "om-note-title", title));
    const trail = el("div", "om-save-trail");
    const list = el("div", "om-fold-list om-save-list");
    const foot = el("div", "om-note-foot");
    const cancel = el("button", "om-btn", "Cancel");
    const choose = el("button", "om-btn om-go", "Choose this folder");
    foot.appendChild(cancel);
    foot.appendChild(choose);
    box.appendChild(trail);
    box.appendChild(list);
    box.appendChild(foot);
    backdrop.appendChild(box);
    document.body.appendChild(backdrop);

    let atPlace = "";
    let atPath = "";

    const done = (answer) => { backdrop.remove(); settle(answer); };
    cancel.onclick = () => done(null);
    choose.onclick = () => done(atPlace ? { place: atPlace, path: atPath } : null);
    closeOn(backdrop, () => done(null));

    const step = (label, fn, last) => {
      const crumb = el("button", `gal-step${last ? " gal-step-here" : ""}`, label);
      crumb.onclick = fn;
      trail.appendChild(crumb);
    };

    const show = async () => {
      trail.replaceChildren();
      list.replaceChildren();
      choose.disabled = !atPlace;
      if (!atPlace) {
        step("Everywhere", () => {}, true);
        let group = "";
        for (const one of state.places) {
          if (one.group !== group) {
            group = one.group;
            list.appendChild(el("div", "om-files-group", group));
          }
          const row = el("div", "om-fold-row");
          row.appendChild(omIcon({ kind: "mask", url: ICON_FOLDER },
                                 { name: one.label, cls: "om-fold-art", img: "om-fold-img" }));
          row.appendChild(el("span", "om-fold-name", one.label));
          if (one.note) row.appendChild(el("span", "om-files-where", one.note));
          row.onclick = () => { atPlace = one.id; atPath = ""; void show(); };
          list.appendChild(row);
        }
        return;
      }
      const place = state.places.find((one) => one.id === atPlace);
      step("Everywhere", () => { atPlace = ""; atPath = ""; void show(); }, false);
      trail.appendChild(el("span", "gal-sep", "›"));
      const parts = atPath ? atPath.split("/") : [];
      step(place?.label || atPlace, () => { atPath = ""; void show(); }, !parts.length);
      let walked = "";
      parts.forEach((part, at) => {
        walked = walked ? `${walked}/${part}` : part;
        const to = walked;
        trail.appendChild(el("span", "gal-sep", "›"));
        step(shownName(part), () => { atPath = to; void show(); }, at === parts.length - 1);
      });
      const answer = await ask(atPlace, atPath);
      if (!backdrop.isConnected) return;
      const folders = answer?.ok ? (answer.folders || []) : [];
      if (!folders.length) {
        list.replaceChildren(el("div", "om-fold-empty", "No folders in here."));
        return;
      }
      list.replaceChildren();
      for (const one of folders) {
        const row = el("div", "om-fold-row");
        row.appendChild(omIcon({ kind: "mask", url: ICON_FOLDER },
                               { name: one.name, cls: "om-fold-art", img: "om-fold-img" }));
        row.appendChild(el("span", "om-fold-name", one.label || one.name));
        row.onclick = () => {
          atPath = atPath ? `${atPath}/${one.name}` : one.name;
          void show();
        };
        list.appendChild(row);
      }
    };
    void show();
  });

  const sendTo = async (name, keep) => {
    const wanted = await pickTarget(keep ? "Copy to" : "Move to");
    if (!wanted) return;
    const answer = await post(keep ? "/files/copy" : "/files/move", {
      place: state.place, path: here(name), into: wanted.path, intoPlace: wanted.place,
    });
    if (!answer?.ok) {
      notify(keep ? "Not copied" : "Not moved", answer?.reason || "It could not be sent there.");
      return;
    }
    under.delete(branch(wanted.place, wanted.path));
    drawTree();
    fill();
    if (String(wanted.place).startsWith("docs:") || state.place.startsWith("docs:")) {
      refreshDocs();
    }
    toast(keep ? `Copied ${name}` : `Moved ${name}`);
  };

  const rowMenu = (name, folder) => {
    const path = here(name);
    const items = [
      folder
        ? { label: "Open", fn: () => go(state.place, path) }
        : { label: "Open", fn: () => {
            const one = state.items.find((other) => other.name === name);
            if (one) void openFileAt(one);
          } },
      folder
        ? { label: "Shortcut on the desktop",
            fn: () => makeFolderShortcut(state.place, path, name) }
        : null,
    ];
    if (state.writable) {
      items.push({ label: "Move to...", fn: () => sendTo(name, false) });
      items.push({ label: "Copy to...", fn: () => sendTo(name, true) });
      items.push({ label: "Rename", fn: async () => {
        const asked = await askText("Rename", name, "Rename");
        if (asked === null) return;
        const answer = await post("/files/rename",
                                  { place: state.place, path, name: String(asked) });
        if (!answer?.ok) {
          notify("Not renamed", answer?.reason || "It could not be renamed.");
          return;
        }
        fill();
      } });
      if (folder) {
        items.push({ label: "Colour...", fn: () => tintFolder(path) });
        items.push({ label: "Icon...", fn: () => iconFolder(path) });
        if (markOf(state.place, path)) {
          items.push({ label: "Plain folder", fn: async () => {
            await post("/marks/clear", { place: state.place, path });
            await readMarks();
            drawTree();
            fill();
          } });
        }
      }
      items.push({ label: "Delete", danger: true, fn: async () => {
        if (state.place.startsWith("docs:")) {
          await removeDoc({ name, path: docsPathOf(state.place, path),
                            kind: docKindOf(name, folder) }, fill);
          return;
        }
        const sure = await confirmAction(`Delete ${name}?`,
          state.heavy
            ? "It is deleted from disk, not moved to the Trash. Getting it back means "
              + "downloading it again."
            : "It is deleted from disk, not moved to the Trash.",
          "Delete", true);
        if (!sure) return;
        const answer = await post("/files/remove", { place: state.place, path });
        if (!answer?.ok) {
          notify("Not deleted", answer?.reason || "It could not be deleted.");
          return;
        }
        fill();
      } });
    }
    return items.filter(Boolean);
  };

  const drawList = () => {
    list.replaceChildren();
    if (!state.folders.length && !state.items.length) {
      list.appendChild(el("div", "om-fold-empty", "Nothing here."));
      return;
    }
    for (const one of state.folders) {
      const row = el("div", "om-files-row om-files-folder");
      row.dataset.omName = one.name;
      row.onclick = () => mark(one.name);
      row.appendChild(markArt(state.place, here(one.name), one.name));
      row.appendChild(el("span", "om-fold-name", one.label || one.name));
      row.appendChild(el("span", "om-fold-meta", "Folder"));
      row.ondblclick = () => go(state.place, here(one.name));
      row.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        mark(one.name);
        openRowMenu(row, { items: rowMenu(one.name, true), align: "left" });
      });
      if (state.writable) dropFileInto(row, () => here(one.name));
      if (state.writable) dragFileFrom(row, one.name, true);
      list.appendChild(row);
    }
    for (const one of state.items) {
      const row = el("div", "om-files-row");
      row.dataset.omName = one.name;
      row.onclick = () => mark(one.name);
      row.appendChild(el("span", "om-files-kind", FILE_WORDS[one.kind] || "File"));
      row.appendChild(el("span", "om-fold-name", one.label || one.name));
      row.appendChild(el("span", "om-fold-meta", bytesText(one.size)));
      row.ondblclick = () => { void openFileAt(one); };
      row.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        mark(one.name);
        openRowMenu(row, { items: rowMenu(one.name, false), align: "left" });
      });
      if (state.writable) dragFileFrom(row, one.name);
      list.appendChild(row);
    }
  };

  const dragFileFrom = (row, name, folder) => {
    row.draggable = true;
    row.dataset.omDrag = "1";
    row.addEventListener("dragstart", (event) => {
      event.dataTransfer.setData(FILE_MOVE_TYPE, JSON.stringify({
        place: state.place, path: here(name), name, kind: docKindOf(name, folder),
      }));
      event.dataTransfer.effectAllowed = "copyMove";
    });
  };

  const dropFileInto = (node, into, place = null, unless = null) => {
    node.addEventListener("dragover", (event) => {
      if (unless?.(event)) return;
      if (![...(event.dataTransfer?.types || [])].includes(FILE_MOVE_TYPE)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = event.ctrlKey ? "copy" : "move";
      node.classList.add("om-fold-over");
    });
    node.addEventListener("dragleave", () => node.classList.remove("om-fold-over"));
    node.addEventListener("drop", async (event) => {
      node.classList.remove("om-fold-over");
      if (unless?.(event)) return;
      if (![...(event.dataTransfer?.types || [])].includes(FILE_MOVE_TYPE)) return;
      event.preventDefault();
      event.stopPropagation();
      let sent = null;
      try { sent = JSON.parse(event.dataTransfer.getData(FILE_MOVE_TYPE)); } catch { return; }
      if (!sent?.path) return;
      const wanted = (typeof place === "function" ? place() : place) || state.place;
      const keep = event.ctrlKey;
      const target = into();
      if (sent.place === wanted
          && (sent.path === target || parentOf(sent.path) === target)) return;
      const answer = await post(keep ? "/files/copy" : "/files/move",
                                { place: sent.place, path: sent.path,
                                  into: target, intoPlace: wanted });
      if (!answer?.ok) {
        notify(keep ? "Not copied" : "Not moved",
               answer?.reason || (keep ? "It could not be copied." : "It could not be moved."));
        return;
      }
      under.delete(branch(wanted, target));
      if (!keep) under.delete(branch(sent.place, parentOf(sent.path)));
      drawTree();
      fill();
      if (String(wanted).startsWith("docs:")
          || (!keep && String(sent.place || "").startsWith("docs:"))) refreshDocs();
    });
  };

  dropFileInto(list, () => state.path, null,
               (event) => !state.writable || !!event.target?.closest?.(".om-files-folder"));

  const opened = new Set();
  const under = new Map();

  const branch = (place, path) => `${place}|${path || ""}`;

  const readInto = async (place, path) => {
    const key = branch(place, path);
    if (under.has(key)) return under.get(key);
    const answer = await ask(place, path);
    const found = answer?.ok ? (answer.folders || []) : [];
    under.set(key, found);
    return found;
  };

  const openTo = async (place, path) => {
    opened.add(branch(place, ""));
    await readInto(place, "");
    const parts = String(path || "").split("/").filter(Boolean);
    let walked = "";
    for (const part of parts) {
      opened.add(branch(place, walked));
      await readInto(place, walked);
      walked = walked ? `${walked}/${part}` : part;
    }
    drawTree();
  };

  const treeRow = (place, path, label, depth, whole, note = "") => {
    const key = branch(place, path);
    const here = place === state.place && (path || "") === (state.path || "");
    const row = el("div", `om-files-node${here ? " om-files-node-on" : ""}`);
    row.style.paddingLeft = `${4 + depth * 13}px`;
    const twist = el("button", "om-files-twist", opened.has(key) ? "▼" : "▶");
    twist.title = opened.has(key) ? "Collapse" : "Expand";
    twist.onclick = async (event) => {
      event.stopPropagation();
      if (opened.has(key)) {
        opened.delete(key);
        drawTree();
        return;
      }
      opened.add(key);
      await readInto(place, path);
      drawTree();
    };
    const art = markArt(place, path, label);
    const name = el("button", "om-files-place", label);
    name.title = whole || label;
    name.onclick = async () => {
      if (!opened.has(key)) {
        opened.add(key);
        await readInto(place, path);
      }
      go(place, path);
    };
    if (placeWritable(place)) dropFileInto(row, () => path, place);
    row.appendChild(twist);
    row.appendChild(art);
    row.appendChild(name);
    if (note) {
      const where = el("span", "om-files-where", note);
      where.title = whole || note;
      row.appendChild(where);
    }
    return row;
  };

  const growTree = (place, path, depth, into) => {
    if (!opened.has(branch(place, path))) return;
    for (const one of under.get(branch(place, path)) || []) {
      const below = path ? `${path}/${one.name}` : one.name;
      into.appendChild(treeRow(place, below, one.label || one.name, depth, below));
      growTree(place, below, depth + 1, into);
    }
  };

  list.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") { event.preventDefault(); step(1); }
    else if (event.key === "ArrowUp") { event.preventDefault(); step(-1); }
    else if (event.key === "Home") { event.preventDefault(); mark(order[0] || "", { scroll: true }); }
    else if (event.key === "End") {
      event.preventDefault();
      mark(order[order.length - 1] || "", { scroll: true });
    } else if (event.key === "Enter" && chosen) {
      event.preventDefault();
      if (state.folders.some((one) => one.name === chosen)) { go(state.place, here(chosen)); return; }
      const one = state.items.find((other) => other.name === chosen);
      if (one) void openFileAt(one);
    } else if (event.key === "Escape") {
      mark("");
    }
  });

  const GROUPS_KEY = "om-files-shut-groups";

  const readShut = () => {
    try {
      const held = JSON.parse(localStorage.getItem(GROUPS_KEY) || "[]");
      return new Set(Array.isArray(held) ? held.filter((one) => typeof one === "string") : []);
    } catch {
      return new Set();
    }
  };

  let shutGroups = readShut();

  const keepShut = () => {
    try {
      localStorage.setItem(GROUPS_KEY, JSON.stringify([...shutGroups]));
    } catch {
    }
  };

  const groupRow = (name, count) => {
    const shut = shutGroups.has(name);
    const row = el("button", `om-files-group${shut ? " om-files-group-shut" : ""}`);
    row.type = "button";
    row.setAttribute("aria-expanded", shut ? "false" : "true");
    row.appendChild(el("span", "om-files-group-mark", shut ? "▶" : "▼"));
    row.appendChild(el("span", "om-files-group-name", name));
    if (shut) row.appendChild(el("span", "om-files-group-count", String(count)));
    row.onclick = () => {
      if (shutGroups.has(name)) shutGroups.delete(name);
      else shutGroups.add(name);
      keepShut();
      drawTree();
    };
    return row;
  };

  const drawTree = () => {
    tree.replaceChildren();
    const order = [];
    const byGroup = new Map();
    for (const one of state.places) {
      if (!byGroup.has(one.group)) { byGroup.set(one.group, []); order.push(one.group); }
      byGroup.get(one.group).push(one);
    }
    for (const name of order) {
      const held = byGroup.get(name) || [];
      tree.appendChild(groupRow(name, held.length));
      if (shutGroups.has(name)) continue;
      for (const one of held) {
        tree.appendChild(treeRow(one.id, "", one.label, 0, one.path, one.note));
        growTree(one.id, "", 1, tree);
      }
    }
  };

  const fill = async () => {
    const answer = await ask(state.place, state.path);
    if (!panel.el.isConnected) return;
    if (!answer.ok) {
      state.folders = [];
      state.items = [];
      state.writable = false;
      drawTrail();
      list.replaceChildren(el("div", "om-fold-empty",
                              answer.reason || "That could not be read."));
      return;
    }
    state.folders = answer.folders || [];
    state.items = answer.items || [];
    state.writable = !!answer.writable;
    drawTools();
    state.heavy = !!answer.heavy;
    panel.setBadge(countNote(state.items.length, "file"));
    drawTrail();
    drawList();
    order = [...state.folders.map((one) => one.name),
             ...state.items.map((one) => one.name)];
    mark(order.includes(chosen) ? chosen : "");
  };

  const go = (place, path) => {
    state.place = place;
    state.path = String(path || "");
    drawTree();
    fill();
    void openTo(place, state.path);
  };

  (async () => {
    let answer = null;
    await readMarks();
    try {
      answer = await (await api.fetchApi(`${API}/files/places`)).json();
    } catch {
      answer = null;
    }
    if (!panel.el.isConnected) return;
    if (!answer?.ok) {
      wrap.replaceChildren(el("div", "om-fold-empty",
        answer?.reason || "The file browser is not available."));
      return;
    }
    state.places = answer.places || [];
    go(state.place || state.places[0]?.id || "", state.path);
  })();

  panel._omFill = fill;
  panel._omAt = () => `${state.place}|${state.path || ""}`;
  return panel;
}

const FILE_MOVE_TYPE = "application/x-om-hostfile";

function makeFolderShortcut(place, path, name) {
  pinDesk(filePinKey(place, path));
  toast(`Shortcut to ${name} added.`, { kind: "ok" });
}

const FILE_PIN = "files:";

function filePinKey(place, path) {
  return `${FILE_PIN}${encodeURIComponent(`${place}|${path || ""}`)}`;
}

function filePinParts(key) {
  if (!key.startsWith(FILE_PIN)) return null;
  let text = "";
  try {
    text = decodeURIComponent(key.slice(FILE_PIN.length));
  } catch {
    return null;
  }
  const at = text.lastIndexOf("|");
  if (at < 0) return null;
  return { place: text.slice(0, at), path: text.slice(at + 1) };
}

export { FILE_WORDS, openFileBrowser, FILE_MOVE_TYPE, filePinParts };
