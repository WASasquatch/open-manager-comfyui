import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import { API, ICON_FOLDER, ICON_NOTE, ICON_FILE, ICON_BIN, ICON_FLOW } from "./base.mjs";
import { el, closeOn, toastHost, toastShut, toast, liveTip, notify, confirmAction, openRowMenu, tabbedPanel, countNote } from "./ui.mjs";
import { windowSize, floatPanels, createFloatingPanel, floatingPanel } from "./windows.mjs";
import { whenText } from "./installed.mjs";
import { dlPost, bytesText } from "./downloads.mjs";
import { filesWritable, SHOWN_KINDS, assetThumbUrl, runProgramById } from "./programs.mjs";
import { TAB_TINTS } from "./tab-marks.mjs";
import { omIcon } from "./taskbar.mjs";
import { deskLayer, DESK_SPRING, deskCells, saveDeskCells, deskCellFor, deskSpotAt, deskArrangeAt, dragDeskCell, hideDesk } from "./desktop.mjs";
import { deskSelect, binDropInto, paintDeskIcons } from "./desk-icons.mjs";
import { FILE_WORDS, openFileBrowser, FILE_MOVE_TYPE } from "./files.mjs";
import { workflowStore, savedWorkflows, workflowMissing, workflowByPath, openWorkflow } from "./workflows.mjs";

let deskDocs = [];

function docPath(item) {
  return String(item?.path || "");
}

const DOC_KINDS = { folder: "folder", link: "link", file: "file" };

const DOC_WORDS = { folder: "Folder", link: "Shortcut", note: "Note" };

function docWord(item) {
  if (item?.kind === "file") return FILE_WORDS[item.what] || "File";
  return DOC_WORDS[item?.kind] || "Note";
}

function keySafe(text) {
  return encodeURIComponent(String(text || ""))
    .replace(/[!'()*~]/g, (one) => `%${one.charCodeAt(0).toString(16).toUpperCase()}`);
}

function awayFromDocs(item) {
  const place = String(item?.place || "");
  return place && !place.startsWith("docs:") ? place : "";
}

function docKey(item) {
  const kind = DOC_KINDS[item?.kind] || "note";
  if (item.id) return `${kind}:${item.id}`;
  const away = awayFromDocs(item);
  return `${kind}:${keySafe(away ? `${away}/${docPath(item)}` : docPath(item))}`;
}

function placeDoc(place, path, name) {
  return { id: "", place, path, name, kind: "file", what: "text", edits: true,
           size: 0, at: 0, icon: "", colour: "", target: "" };
}

function docReadOnly(doc) {
  return !!awayFromDocs(doc) && !filesWritable();
}

async function readDocText(doc) {
  const away = awayFromDocs(doc);
  const where = away
    ? `${API}/assets/text?${new URLSearchParams({ root: away, path: docPath(doc) })}`
    : `${API}/docs/note?path=${encodeURIComponent(docPath(doc))}`;
  try {
    return await (await api.fetchApi(where)).json();
  } catch {
    return { ok: false, reason: "It could not be read." };
  }
}

function writeDocText(doc, body) {
  const away = awayFromDocs(doc);
  return away
    ? dlPost("/assets/text", { root: away, path: docPath(doc), body })
    : dlPost("/docs/write", { path: docPath(doc), body });
}

const NEW_NOTE_NAME = "New Document";

let noteDrafts = 0;

const NEW_FOLDER_NAME = "New Folder";

function editInPlace(node, was, commit) {
  if (node._omEditing) return;
  node._omEditing = true;
  node.textContent = was;
  node.contentEditable = "plaintext-only";
  if (node.contentEditable !== "plaintext-only") node.contentEditable = "true";
  node.spellcheck = false;
  node.classList.add("om-rename");
  const range = document.createRange();
  range.selectNodeContents(node);
  const picked = window.getSelection();
  picked?.removeAllRanges();
  picked?.addRange(range);
  node.focus();
  let settled = false;
  const finish = async (keep) => {
    if (settled) return;
    settled = true;
    const asked = (node.textContent || "").trim();
    node._omEditing = false;
    node.contentEditable = "false";
    node.classList.remove("om-rename");
    node.removeEventListener("keydown", onKey, true);
    node.removeEventListener("paste", onPaste, true);
    node.removeEventListener("blur", onBlur);
    if (!keep || !asked || asked === was) { node.textContent = was; return; }
    const got = await commit(asked);
    node.textContent = typeof got === "string" && got ? got : was;
  };
  const onKey = (event) => {
    event.stopPropagation();
    if (event.key === "Enter") { event.preventDefault(); finish(true); }
    else if (event.key === "Escape") { event.preventDefault(); finish(false); }
  };
  const onPaste = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const text = (event.clipboardData?.getData("text/plain") || "").replace(/\s+/g, " ");
    document.execCommand("insertText", false, text);
  };
  const onBlur = () => finish(true);
  node.addEventListener("keydown", onKey, true);
  node.addEventListener("paste", onPaste, true);
  node.addEventListener("blur", onBlur);
}

async function docsIn(path) {
  try {
    const answer = await (await api.fetchApi(
      `${API}/docs?path=${encodeURIComponent(path || "")}`)).json();
    return { ok: answer?.ok === true, items: answer?.ok ? (answer.items || []) : [] };
  } catch {
    return { ok: false, items: [] };
  }
}

const DOC_DESKTOP = "Desktop";

const DOC_DOCUMENTS = "Documents";

async function loadDeskDocs() {
  const answer = await docsIn(DOC_DESKTOP);
  if (answer.ok) deskDocs = answer.items;
}

function mediaUrl(name) {
  return `${API}/docs/media?name=${encodeURIComponent(name)}`;
}

function docIconUrl(item) {
  return item?.icon ? `${API}/docs/icon?name=${encodeURIComponent(item.icon)}` : "";
}

const PLAIN_ART = { folder: ICON_FOLDER, link: ICON_FLOW, file: ICON_FILE };

function docThumbUrl(item) {
  if (item?.kind !== "file" || (item.what !== "image" && item.what !== "video")) return "";
  const where = docsWhere(docPath(item));
  return assetThumbUrl({
    name: where.path.split("/").pop(), sub: parentOf(where.path),
    at: item.at, size: item.size,
  }, { root: where.place, edge: 128 });
}

function docArt(item) {
  const plain = { kind: "mask", url: PLAIN_ART[item?.kind] || ICON_NOTE,
                  tint: item?.colour || "" };
  const url = docIconUrl(item) || docThumbUrl(item);
  return url ? { kind: "src", url, fallback: plain } : plain;
}

function applyDocIcon(panel, item) {
  const url = docIconUrl(item);
  if (url) panel.setIcon(url);
  else panel.setMaskIcon(PLAIN_ART[item?.kind] || ICON_NOTE, { tint: item?.colour || "" });
}

function noteSrcOk(raw) {
  const text = String(raw || "");
  if (/^data:image\//i.test(text)) return true;
  if (/^https?:\/\//i.test(text)) return true;
  try {
    const at = new URL(text, window.location.href);
    return at.origin === window.location.origin && at.pathname === `${API}/docs/media`;
  } catch {
    return false;
  }
}

function scrubNoteView(view) {
  for (const node of view.querySelectorAll("script, iframe, object, embed")) node.remove();
  for (const img of view.querySelectorAll("img")) {
    if (!noteSrcOk(img.getAttribute("src"))) img.removeAttribute("src");
  }
  for (const link of view.querySelectorAll("a[href]")) {
    if (/^\s*javascript:/i.test(link.getAttribute("href") || "")) {
      link.removeAttribute("href");
      continue;
    }
    link.target = "_blank";
    link.rel = "noreferrer noopener";
  }
}

async function renderNoteInto(view, text) {
  try {
    const html = await app.extensionManager.renderMarkdownToHtml(String(text || ""));
    view.innerHTML = typeof html === "string" ? html : "";
    scrubNoteView(view);
  } catch {
    view.replaceChildren();
    const pre = el("pre");
    pre.textContent = String(text || "");
    view.appendChild(pre);
  }
}

async function keepNoteImage(file) {
  try {
    const answer = await (await api.fetchApi(`${API}/docs/media`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: await file.arrayBuffer(),
    })).json();
    return answer?.ok ? answer.name : "";
  } catch {
    return "";
  }
}

async function docFind(id) {
  if (!id) return null;
  try {
    const answer = await (await api.fetchApi(
      `${API}/docs/find?id=${encodeURIComponent(id)}`)).json();
    return answer?.ok ? answer.item : null;
  } catch {
    return null;
  }
}

function refreshDocs() {
  loadDeskDocs().then(() => paintDeskIcons()).catch(() => {});
  for (const [key, held] of floatPanels) {
    if (!held.el.isConnected) continue;
    if (key.startsWith("props:") || key === "wastebasket") {
      held._omFill?.();
    }
  }
}

async function renameDoc(item, name) {
  const away = awayFromDocs(item);
  if (away) {
    const done = await dlPost("/files/rename",
                              { place: away, path: docPath(item), name }).catch(() => null);
    if (!done?.ok) {
      notify("Not renamed", done?.reason || "It could not be renamed.");
      return null;
    }
    return { ...item, name: done.name, path: parentOf(docPath(item))
      ? `${parentOf(docPath(item))}/${done.name}` : done.name };
  }
  const answer = await dlPost("/docs/rename", { path: docPath(item), name }).catch(() => null);
  if (!answer?.ok) {
    notify("Not renamed", answer?.reason || "It could not be renamed.");
    return null;
  }
  floatingPanel(docKey(item))?._omDocSet?.(answer.item);
  refreshDocs();
  return answer.item;
}

function draftNote() {
  return { kind: "note", id: "", path: "", name: NEW_NOTE_NAME, size: 0, icon: "",
           at: Math.floor(Date.now() / 1000) };
}

function openNote(item) {
  const key = item.id || docPath(item)
    ? docKey(item)
    : `note:draft-${++noteDrafts}`;
  const held = floatingPanel(key);
  if (held) { held.present(); return held; }
  let doc = item;
  let dirty = false;
  const panel = createFloatingPanel({
    key, title: item.name || "Note", ...windowSize("note"), modal: false,
  });
  applyDocIcon(panel, doc);
  const onDisk = () => !!docPath(doc);

  const wrap = el("div", "om-pad");
  const tools = el("div", "om-pad-tools");
  const state = el("span", "om-pad-state", "");
  const edit = el("textarea", "om-pad-edit");
  edit.spellcheck = true;
  const view = el("div", "om-pad-view");

  const heading = panel.bar.querySelector(".om-float-title");
  heading?.classList.add("om-float-title-name");
  let pressed = null;
  heading?.addEventListener("pointerdown", (event) => {
    pressed = { x: event.clientX, y: event.clientY };
  });
  heading?.addEventListener("click", (event) => {
    const from = pressed;
    pressed = null;
    if (!from) return;
    if (Math.abs(event.clientX - from.x) > 3 || Math.abs(event.clientY - from.y) > 3) return;
    editInPlace(heading, doc.name || "", async (name) => {
      if (!onDisk()) {
        doc = { ...doc, name };
        return name;
      }
      const next = await renameDoc(doc, name);
      if (!next) return "";
      doc = next;
      return doc.name;
    });
  });

  const tabs = tabbedPanel({ remember: "om-note-tab", collapsible: false });
  tabs.root.classList.add("om-pad-tabs");
  let saveDue = 0;
  const sealed = docReadOnly(doc);
  if (sealed) {
    edit.readOnly = true;
    tools.classList.add("om-pad-tools-quiet");
  }

  panel._omDocSet = (next) => {
    doc = next;
    panel.setTitle(next.name || "Note");
    applyDocIcon(panel, next);
  };

  const saveAs = async ({ copy = false } = {}) => {
    const where = await askSaveTarget(parentOf(docPath(doc)), doc.name || NEW_NOTE_NAME);
    if (!where) return false;
    clearTimeout(saveDue);
    const answer = await dlPost("/docs/new",
      { parent: where.parent, name: where.name, body: edit.value }).catch(() => null);
    if (!answer?.ok) {
      state.textContent = answer?.reason || "Not saved";
      notify("Not saved", answer?.reason || "It could not be saved.");
      return false;
    }
    doc = answer.item;
    dirty = false;
    panel.setTitle(doc.name || "Note");
    panel.rekey(`note:${doc.id}`);
    state.textContent = copy ? "Saved as a copy" : "Saved";
    refreshDocs();
    return true;
  };

  let saving = null;

  const save = async () => {
    clearTimeout(saveDue);
    if (saving) return saving;
    saving = saveNow();
    try {
      return await saving;
    } finally {
      saving = null;
    }
  };

  const saveNow = async () => {
    if (!onDisk()) return saveAs();
    state.textContent = "Saving";
    let answer = await writeDocText(doc, edit.value).catch(() => null);
    if (!answer?.ok && !awayFromDocs(doc)) {
      const found = await docFind(doc.id);
      if (found) {
        doc = found;
        panel.setTitle(doc.name || "Note");
        answer = await writeDocText(doc, edit.value).catch(() => null);
      }
    }
    if (answer?.ok) dirty = false;
    state.textContent = answer?.ok ? "Saved" : (answer?.reason || "Not saved");
    return !!answer?.ok;
  };
  wrap.addEventListener("keydown", (event) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key !== "s") return;
    event.preventDefault();
    event.stopPropagation();
    if (sealed && !event.shiftKey) {
      state.textContent = "Read-only";
      return;
    }
    void (event.shiftKey ? saveAs() : save());
  });

  const keep = () => {
    clearTimeout(saveDue);
    if (sealed) {
      state.textContent = "Read-only";
      return;
    }
    dirty = true;
    if (!onDisk()) {
      state.textContent = "Not saved yet";
      return;
    }
    state.textContent = "Editing";
    saveDue = setTimeout(save, 900);
  };

  const wrapSelection = (before, after) => {
    const start = edit.selectionStart;
    const end = edit.selectionEnd;
    const held2 = edit.value.slice(start, end);
    edit.focus();
    document.execCommand("insertText", false, `${before}${held2}${after}`);
    if (!held2) edit.setSelectionRange(start + before.length, start + before.length);
    keep();
  };

  for (const [label, before, after, hint] of [
    ["B", "**", "**", "Bold"],
    ["I", "*", "*", "Italic"],
    ["#", "## ", "", "Heading"],
    ["•", "- ", "", "List item"],
    ["“", "> ", "", "Quote"],
    ["</>", "`", "`", "Code"],
    ["⚓", "[", "](https://)", "Link"],
  ]) {
    const button = el("button", "om-pad-tool", label);
    button.type = "button";
    liveTip(button, () => hint);
    button.onclick = () => wrapSelection(before, after);
    tools.appendChild(button);
  }
  const fileMenu = el("button", "om-pad-tool om-pad-file", "File ▾");
  fileMenu.type = "button";
  fileMenu.onclick = () => openRowMenu(fileMenu, {
    items: [
      { label: "New", fn: () => openNote(draftNote()) },
      !sealed && { label: "Save", fn: () => save() },
      { label: "Save As", fn: () => saveAs({ copy: onDisk() }) },
      { label: "Export", fn: () => (onDisk()
        ? exportDoc(doc)
        : exportText(`${doc.name || NEW_NOTE_NAME}.md`, edit.value)) },
    ].filter(Boolean),
    align: "left",
  });
  tools.insertBefore(el("span", "om-pad-split"), tools.firstChild);
  tools.insertBefore(fileMenu, tools.firstChild);
  tools.appendChild(state);

  edit.oninput = keep;
  edit.onkeydown = (event) => {
    if (!event.ctrlKey && !event.metaKey) return;
    const key2 = event.key.toLowerCase();
    if (key2 === "b") { event.preventDefault(); wrapSelection("**", "**"); }
    else if (key2 === "i") { event.preventDefault(); wrapSelection("*", "*"); }
    else if (key2 === "k") { event.preventDefault(); wrapSelection("[", "](https://)"); }
    else if (key2 === "s") { event.preventDefault(); clearTimeout(saveDue); save(); }
  };

  const carried = (event) => [...(event.clipboardData?.files || [])]
    .filter((one) => one.type.startsWith("image/"));

  edit.addEventListener("paste", async (event) => {
    const images = carried(event);
    if (!images.length) return;
    event.preventDefault();
    event.stopPropagation();
    for (const file of images) {
      state.textContent = "Adding the image";
      const name = await keepNoteImage(file);
      if (!name) { state.textContent = "The image was not kept"; continue; }
      edit.focus();
      document.execCommand("insertText", false, `\n![](${mediaUrl(name)})\n`);
      keep();
    }
  });

  const editor = el("div", "om-pad-pane");
  editor.appendChild(edit);

  tabs.add({
    id: "editor",
    title: "Editor",
    order: 10,
    pane: editor,
    onShow: () => tools.classList.toggle("om-pad-tools-quiet", sealed),
  });
  tabs.add({
    id: "view", title: "View", order: 20, pane: view,
    onShow: () => {
      tools.classList.add("om-pad-tools-quiet");
      renderNoteInto(view, edit.value);
    },
  });
  wrap.appendChild(tools);
  wrap.appendChild(tabs.root);
  panel.body.appendChild(wrap);

  panel.confirmClose = () => (dirty && !onDisk()
    ? confirmAction(`${doc.name} has not been saved`,
                    "Closing this window now loses what is in it.", "Close anyway", true)
    : true);

  if (!onDisk()) {
    tabs.start();
    tabs.show("editor");
    state.textContent = "Not saved yet";
    edit.focus();
    return panel;
  }

  readDocText(doc)
    .then((answer) => {
      if (!answer?.ok) { state.textContent = answer?.reason || "Could not be read"; return; }
      edit.value = answer.body || "";
      if (sealed) state.textContent = "Read-only";
      panel.setTitle(answer.name || doc.name || "Note");
      tabs.start();
      tabs.show(item.openAt === "view" ? "view" : "editor");
      if (item.openAt === "view") renderNoteInto(view, edit.value);
      else edit.focus();
    })
    .catch(() => { state.textContent = "Could not be read"; });

  return panel;
}

const FILE_DRAG_TYPE = "application/x-om-file";

function carriedDoc(event) {
  return [...(event.dataTransfer?.types || [])].includes(FILE_DRAG_TYPE);
}

function carriedHost(event) {
  return [...(event.dataTransfer?.types || [])].includes(FILE_MOVE_TYPE);
}

function docKindOf(name, folder) {
  if (folder) return "folder";
  if (name.endsWith(".omlink")) return "link";
  return name.endsWith(".md") ? "note" : "file";
}

function docsPathOf(place, path) {
  const home = place === "docs:documents" ? DOC_DOCUMENTS : DOC_DESKTOP;
  return path ? `${home}/${path}` : home;
}

function parentOf(path) {
  const at = String(path || "").lastIndexOf("/");
  return at < 0 ? "" : path.slice(0, at);
}

function dragDocFrom(node, item) {
  node.dataset.omDrag = "1";
  node.draggable = true;
  node.addEventListener("dragstart", (event) => {
    event.dataTransfer.setData(FILE_DRAG_TYPE, JSON.stringify({
      path: docPath(item), id: item.id, kind: item.kind, name: item.name,
    }));
    const where = docsWhere(docPath(item));
    event.dataTransfer.setData(FILE_MOVE_TYPE, JSON.stringify({
      place: where.place, path: where.path, name: item.name, kind: item.kind,
    }));
    event.dataTransfer.effectAllowed = "copyMove";
    requestAnimationFrame(() => node.classList.add("om-fold-lift"));
  });
  node.addEventListener("dragend", () => node.classList.remove("om-fold-lift"));
}

async function hostDropInto(event, parent) {
  let sent = null;
  try { sent = JSON.parse(event.dataTransfer.getData(FILE_MOVE_TYPE)); } catch { return; }
  if (!sent?.path) return;
  const into = docsWhere(parent);
  const keep = event.ctrlKey;
  const spot = parent === DOC_DESKTOP ? deskSpotAt(event) : null;
  if (sent.place === into.place
      && (sent.path === into.path || parentOf(sent.path) === into.path)) return;
  const answer = await dlPost(keep ? "/files/copy" : "/files/move",
                              { place: sent.place, path: sent.path,
                                into: into.path, intoPlace: into.place }).catch(() => null);
  if (!answer?.ok) {
    notify(keep ? "Not copied" : "Not moved",
           answer?.reason || (keep ? "It could not be copied." : "It could not be moved."));
    return;
  }
  await loadDeskDocs().catch(() => {});
  if (spot) {
    const landed = deskDocs.find((one) => docPath(one) === `${DOC_DESKTOP}/${answer.name}`);
    if (landed) deskArrangeAt(docKey(landed), spot);
  }
  refreshDocs();
  toast(keep ? `Copied ${sent.name}` : `Moved ${sent.name}`);
}

function dropDocsInto(node, where, after, { spring = null } = {}) {
  node.dataset.omDrop = "1";
  let springDue = 0;
  const restSpring = () => { clearTimeout(springDue); springDue = 0; };
  node.addEventListener("dragover", (event) => {
    if (!carriedDoc(event) && !carriedHost(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = !carriedDoc(event) && event.ctrlKey ? "copy" : "move";
    node.classList.add("om-fold-over");
    if (spring && !springDue) {
      springDue = setTimeout(() => { springDue = 0; spring(); }, DESK_SPRING);
    }
  });
  node.addEventListener("dragleave", () => {
    node.classList.remove("om-fold-over");
    restSpring();
  });
  node.addEventListener("drop", async (event) => {
    if (!carriedDoc(event) && !carriedHost(event)) return;
    event.preventDefault();
    event.stopPropagation();
    node.classList.remove("om-fold-over");
    restSpring();
    if (!carriedDoc(event)) {
      await hostDropInto(event, where());
      after?.();
      return;
    }
    let sent = null;
    try { sent = JSON.parse(event.dataTransfer.getData(FILE_DRAG_TYPE)); } catch { return; }
    if (!sent?.path) return;
    const parent = where();
    if (sent.path === parent || parentOf(sent.path) === parent) return;
    const answer = await dlPost("/docs/move", { path: sent.path, parent }).catch(() => null);
    if (!answer?.ok) { notify("Not moved", answer?.reason || "It could not be moved."); return; }
    const gone = docKey(sent);
    if (parent && deskCells[gone]) {
      delete deskCells[gone];
      saveDeskCells();
    }
    floatingPanel(gone)?._omDocSet?.(answer.item);
    refreshDocs();
    after?.();
  });
}

function sortDocs(items, way) {
  const by = {
    name: (a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
    edited: (a, b) => (b.at || 0) - (a.at || 0),
    size: (a, b) => (b.size || 0) - (a.size || 0),
  }[way] || (() => 0);
  return [...items].sort((a, b) =>
    (a.kind !== "folder") - (b.kind !== "folder") || by(a, b));
}

function docsWhere(path) {
  const whole = String(path || "");
  const at = whole.indexOf("/");
  const home = (at < 0 ? whole : whole.slice(0, at)).toLowerCase();
  return {
    place: home === DOC_DOCUMENTS.toLowerCase() ? "docs:documents" : "docs:desktop",
    path: at < 0 ? "" : whole.slice(at + 1),
  };
}

function openFolder(item) {
  const where = docsWhere(docPath(item));
  return openFileBrowser(where.place, where.path);
}

async function openFlowLink(item) {
  const target = String(item?.target || "");
  if (!target) {
    notify("Nothing to open", "This shortcut names no workflow.");
    return false;
  }
  return openWorkflow(target, { after: hideDesk });
}

async function relinkFlow(item, after) {
  const chosen = await askWorkflow();
  if (!chosen) return;
  const answer = await dlPost("/docs/link/target",
                              { path: docPath(item), target: chosen.path || chosen })
    .catch(() => null);
  if (!answer?.ok) {
    notify("Not pointed", answer?.reason || "The shortcut could not be pointed at that.");
    return;
  }
  floatingPanel(docKey(item))?._omDocSet?.(answer.item);
  refreshDocs();
  after?.();
}

function openDoc(item) {
  if (item.kind === "folder") return openFolder(item);
  if (item.kind === "link") return openFlowLink(item);
  if (item.kind === "file" && !item.edits) return openDocFile(item);
  return openNote(item);
}

function openDocFile(item) {
  const kind = SHOWN_KINDS[item.what] || "";
  if (!kind) {
    notify(item.name, `There is no viewer here for ${docWord(item).toLowerCase()} files.`);
    return null;
  }
  const where = docsWhere(docPath(item));
  const sub = parentOf(where.path);
  const beside = deskDocs.some((one) => docPath(one) === docPath(item))
    ? deskDocs.filter((one) => SHOWN_KINDS[one.what] === kind)
    : [item];
  runProgramById(kind === "still" ? "viewer" : "player", {
    items: beside.map((one) => ({
      name: docsWhere(docPath(one)).path.split("/").pop(),
      sub, kind, size: one.size, at: one.at,
    })),
    name: where.path.split("/").pop(),
    root: where.place,
  });
  return null;
}

function askWorkflow() {
  return new Promise((settle) => {
    const backdrop = el("div", "om-backdrop");
    const box = el("div", "om-note om-note-wide om-save");
    box.appendChild(el("div", "om-note-title", "Which workflow?"));
    const find = el("input", "om-search");
    find.placeholder = "Filter by name";
    find.spellcheck = false;
    const list = el("div", "om-fold-list om-save-list");
    const foot = el("div", "om-note-foot");
    const cancel = el("button", "om-btn", "Cancel");
    const add = el("button", "om-btn om-go", "Choose");
    add.disabled = true;
    foot.appendChild(cancel);
    foot.appendChild(add);
    box.appendChild(find);
    box.appendChild(list);
    box.appendChild(foot);
    backdrop.appendChild(box);
    document.body.appendChild(backdrop);

    let chosen = null;
    const done = (answer) => { backdrop.remove(); settle(answer); };

    const fill = () => {
      const want = find.value.trim().toLowerCase();
      const all = savedWorkflows()
        .filter((one) => !want || String(one.filename || one.path).toLowerCase().includes(want))
        .sort((a, b) => String(a.filename || a.path).toLowerCase()
          .localeCompare(String(b.filename || b.path).toLowerCase()));
      if (!all.length) {
        list.replaceChildren(el("div", "om-fold-empty", "No saved workflows match"));
        return;
      }
      list.replaceChildren(...all.slice(0, 400).map((one) => {
        const row = el("div", "om-fold-row");
        row.appendChild(omIcon({ kind: "mask", url: ICON_FLOW },
                               { name: one.filename, cls: "om-fold-art", img: "om-fold-img" }));
        row.appendChild(el("span", "om-fold-name", one.filename || one.path));
        const where = String(one.directory || "").replace(/^workflows\/?/, "");
        if (where) row.appendChild(el("span", "om-fold-meta", where));
        row.onclick = () => {
          chosen = one;
          add.disabled = false;
          for (const other of list.querySelectorAll(".om-fold-row")) {
            other.classList.toggle("om-fold-row-on", other === row);
          }
        };
        row.ondblclick = () => { chosen = one; add.click(); };
        return row;
      }));
    };

    cancel.onclick = () => done(null);
    add.onclick = () => (chosen ? done(chosen) : find.focus());
    find.addEventListener("input", fill);
    find.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && chosen) { event.preventDefault(); add.click(); }
    });
    closeOn(backdrop, () => done(null));
    Promise.resolve(workflowStore()?.loadWorkflows?.()).catch(() => {}).then(() => {
      if (backdrop.isConnected) fill();
    });
    fill();
    find.focus();
  });
}

async function makeFlowLink(parent, flow) {
  const answer = await dlPost("/docs/link", {
    parent: parent || DOC_DESKTOP, name: flow.filename || flow.key || "Workflow",
    target: flow.path,
  }).catch(() => null);
  if (!answer?.ok) {
    notify("Not created", answer?.reason || "The shortcut could not be created.");
    return null;
  }
  refreshDocs();
  return answer.item;
}

async function newDeskFlow() {
  const flow = await askWorkflow();
  if (!flow) return;
  const made = await makeFlowLink("", flow);
  if (!made) return;
  await loadDeskDocs();
  paintDeskIcons();
  const cell = deskCellFor(docKey(made));
  if (cell) deskSelect(cell);
}

function askSaveTarget(startAt, startName) {
  return new Promise((settle) => {
    const backdrop = el("div", "om-backdrop");
    const box = el("div", "om-note om-note-wide om-save");
    box.appendChild(el("div", "om-note-title", "Save as"));
    const trail = el("div", "om-save-trail");
    const list = el("div", "om-fold-list om-save-list");
    const field = el("input", "om-search");
    field.value = startName || NEW_NOTE_NAME;
    field.spellcheck = false;
    const foot = el("div", "om-note-foot");
    const folder = el("button", "om-btn", "New folder");
    const cancel = el("button", "om-btn", "Cancel");
    const keep = el("button", "om-btn om-go", "Save");
    foot.appendChild(folder);
    foot.appendChild(cancel);
    foot.appendChild(keep);
    box.appendChild(trail);
    box.appendChild(list);
    box.appendChild(field);
    box.appendChild(foot);
    backdrop.appendChild(box);
    document.body.appendChild(backdrop);

    let here = String(startAt || "");
    let chosen = "";

    const done = (answer) => { backdrop.remove(); settle(answer); };

    const paintTrail = () => {
      const steps = here ? here.split("/") : [];
      trail.replaceChildren();
      const step = (label, to) => {
        const hop = el("button", "om-save-step", label);
        hop.onclick = () => { here = to; chosen = ""; fill(); };
        trail.appendChild(hop);
      };
      step("Desktop", "");
      let walked = "";
      for (const part of steps) {
        walked = walked ? `${walked}/${part}` : part;
        trail.appendChild(el("span", "om-save-sep", "›"));
        step(part.split("~")[0], walked);
      }
    };

    const fill = async () => {
      paintTrail();
      const answer = await docsIn(here);
      if (!backdrop.isConnected) return;
      if (!answer.ok) { here = ""; fill(); return; }
      const rows = sortDocs(answer.items, "name").map((one) => {
        const row = el("div", "om-fold-row");
        if (one.kind !== "folder") row.classList.add("om-save-dim");
        row.appendChild(omIcon(docArt(one),
                               { name: one.name, cls: "om-fold-art", img: "om-fold-img" }));
        row.appendChild(el("span", "om-fold-name", one.name));
        if (one.kind === "folder") {
          row.onclick = () => {
            chosen = docPath(one);
            for (const other of list.querySelectorAll(".om-fold-row")) {
              other.classList.toggle("om-fold-row-on", other === row);
            }
          };
          row.ondblclick = () => { here = docPath(one); chosen = ""; fill(); };
        } else {
          row.onclick = () => { field.value = one.name; };
        }
        return row;
      });
      list.replaceChildren(...rows);
    };

    folder.onclick = async () => {
      const answer = await dlPost("/docs/folder", { parent: here, name: NEW_FOLDER_NAME })
        .catch(() => null);
      if (!answer?.ok) {
        notify("Not created", answer?.reason || "It could not be created.");
        return;
      }
      here = docPath(answer.item);
      chosen = "";
      refreshDocs();
      fill();
    };
    cancel.onclick = () => done(null);
    keep.onclick = () => {
      const name = field.value.trim();
      if (!name) { field.focus(); return; }
      done({ parent: chosen || here, name });
    };
    field.addEventListener("keydown", (event) => {
      if (event.key === "Enter") { event.preventDefault(); keep.click(); }
    });
    closeOn(backdrop, () => done(null));
    fill();
    field.focus();
    field.select();
  });
}

async function trashHolds() {
  try {
    const answer = await (await api.fetchApi(`${API}/docs/trash`)).json();
    return answer?.ok ? (answer.items || []) : [];
  } catch {
    return [];
  }
}

async function emptyWastebasket() {
  const items = await trashHolds();
  if (!items.length) {
    toast("The Trash is already empty.", { kind: "ok" });
    return false;
  }
  const sure = await confirmAction("Empty the Trash",
    `${countNote(items.length, "item")} will be deleted from disk. This cannot be undone.`,
    "Empty", true);
  if (!sure) return false;
  const answer = await dlPost("/docs/trash/empty", {}).catch(() => null);
  if (!answer?.ok) {
    notify("Not emptied", answer?.reason || "It could not be emptied.");
    return false;
  }
  refreshDocs();
  return true;
}

function openWastebasket() {
  const key = "wastebasket";
  const held = floatingPanel(key);
  if (held) { held.present(); return held; }
  const panel = createFloatingPanel({
    key, title: "Trash", ...windowSize("folder"), modal: false,
  });
  panel.setMaskIcon(ICON_BIN);

  const list = el("div", "om-fold-list");
  const drain = el("button", "om-btn om-danger", "Empty Trash");
  panel.tools.appendChild(drain);

  const fill = async () => {
    const items = await trashHolds();
    if (!panel.el.isConnected) return;
    drain.disabled = !items.length;
    panel.setBadge(items.length ? countNote(items.length, "item") : "");
    if (!items.length) {
      list.replaceChildren();
      return;
    }
    list.replaceChildren(...items.map((one) => buildTrashRow(one, fill)));
  };

  panel._omFill = fill;

  drain.onclick = () => emptyWastebasket().then((done) => { if (done) fill(); });

  binDropInto(panel.body, fill);

  panel.body.appendChild(list);
  fill();
  return panel;
}

function buildTrashRow(entry, after) {
  const row = el("div", "om-trash-row");
  const art = el("span", "om-fold-art");
  const url = entry.kind === "folder" ? ICON_FOLDER : ICON_NOTE;
  art.style.setProperty("-webkit-mask", `center / contain no-repeat url("${url}")`);
  art.style.setProperty("mask", `center / contain no-repeat url("${url}")`);
  row.appendChild(art);
  row.appendChild(el("span", "om-fold-name", entry.name));
  row.appendChild(el("span", "om-trash-when", whenText(new Date(entry.at * 1000))));
  const back = el("button", "om-btn", "Restore");
  back.onclick = async () => {
    back.disabled = true;
    const answer = await dlPost("/docs/restore", { token: entry.token }).catch(() => null);
    if (!answer?.ok) {
      back.disabled = false;
      notify("Not restored", answer?.reason || "It could not be restored.");
      return;
    }
    refreshDocs();
    after?.();
  };
  row.appendChild(back);
  return row;
}

const ICON_TYPES = ".ico,.png,.webp,image/x-icon,image/vnd.microsoft.icon,image/png,image/webp";

function propsKey(item) {
  return `props:${docKey(item)}`;
}

function propsRow(label, value) {
  const row = el("div", "om-props-row");
  row.appendChild(el("span", "om-props-key", label));
  row.appendChild(el("span", "om-props-value", value));
  return row;
}

async function docMeasure(path) {
  try {
    const answer = await (await api.fetchApi(
      `${API}/docs/measure?path=${encodeURIComponent(path || "")}`)).json();
    return answer?.ok ? answer : null;
  } catch {
    return null;
  }
}

function drawable(file) {
  return new Promise((settle) => {
    const url = URL.createObjectURL(file);
    const probe = new Image();
    probe.onload = () => { URL.revokeObjectURL(url); settle(true); };
    probe.onerror = () => { URL.revokeObjectURL(url); settle(false); };
    probe.src = url;
  });
}

function openDocProps(item) {
  const key = propsKey(item);
  const held = floatingPanel(key);
  if (held) { held.present(); return held; }
  let doc = item;
  const panel = createFloatingPanel({
    key, title: `${item.name} properties`, ...windowSize("props"), modal: false,
  });
  applyDocIcon(panel, doc);

  const wrap = el("div", "om-props");
  const head = el("div", "om-props-head");
  const face = el("div", "om-props-face");
  const named = el("div", "om-props-name", doc.name);
  head.appendChild(face);
  head.appendChild(named);
  const rows = el("div", "om-props-rows");
  const tools = el("div", "om-props-tools");
  wrap.appendChild(head);
  wrap.appendChild(rows);
  wrap.appendChild(tools);
  panel.body.appendChild(wrap);

  const shades = el("div", "om-props-shades");
  const swatches = el("span", "om-tab-swatches");
  shades.appendChild(el("span", "om-props-key", "Colour"));
  shades.appendChild(swatches);
  wrap.insertBefore(shades, tools);

  const paintShades = () => {
    swatches.replaceChildren();
    const plain = el("button", "om-tab-swatch om-props-plain");
    plain.type = "button";
    plain.title = "Default";
    plain.classList.toggle("om-tab-swatch-on", !doc.colour);
    plain.onclick = () => tintDoc("");
    swatches.appendChild(plain);
    for (const [name, value] of TAB_TINTS) {
      const dot = el("button", "om-tab-swatch");
      dot.type = "button";
      dot.style.background = value;
      dot.title = name;
      dot.classList.toggle("om-tab-swatch-on", doc.colour === value);
      dot.onclick = () => tintDoc(value);
      swatches.appendChild(dot);
    }
    const custom = el("button", "om-tab-swatch om-tab-swatch-pick", "+");
    custom.type = "button";
    custom.title = "Custom colour";
    custom.onclick = () => {
      const field = el("input");
      field.type = "color";
      field.value = doc.colour || "#58a6ff";
      field.style.cssText = "position: fixed; left: -100px; top: 0; opacity: 0;";
      document.body.appendChild(field);
      field.addEventListener("change", () => {
        const picked = field.value;
        field.remove();
        tintDoc(picked);
      });
      field.click();
    };
    swatches.appendChild(custom);
  };

  const tintDoc = async (colour) => {
    const answer = await dlPost("/docs/colour", { path: docPath(doc), colour }).catch(() => null);
    if (!answer?.ok) {
      notify("Not coloured", answer?.reason || "The colour could not be kept.");
      return;
    }
    took(answer.item);
  };

  const pickIcon = el("button", "om-btn", "Choose icon");
  const dropIcon = el("button", "om-btn", "Use the plain folder");
  const file = el("input");
  file.type = "file";
  file.accept = ICON_TYPES;
  file.hidden = true;
  tools.appendChild(pickIcon);
  tools.appendChild(dropIcon);
  tools.appendChild(file);

  const paint = () => {
    panel.setTitle(`${doc.name} properties`);
    applyDocIcon(panel, doc);
    named.textContent = doc.name;
    face.replaceChildren(omIcon(docArt(doc),
                                { name: doc.name, cls: "om-props-art", img: "om-props-img" }));
    const where = parentOf(docPath(doc));
    rows.replaceChildren(
      propsRow("Kind", docWord(doc)),
      propsRow("Where", where ? where.split("/").map((one) => one.split("~")[0]).join(" / ")
                              : "Desktop"),
      propsRow("Edited", whenText(new Date(doc.at * 1000))),
      propsRow("Id", doc.id || "none"),
    );
    if (doc.colour) rows.appendChild(propsRow("Colour", doc.colour));
    if (doc.kind === "folder") rows.appendChild(propsRow("Holds", countNote(doc.holds || 0, "item")));
    else if (doc.kind !== "link") rows.appendChild(propsRow("Size", bytesText(doc.size)));
    if (doc.kind === "link") {
      rows.appendChild(propsRow("Opens", doc.target || "nothing"));
      const found = propsRow("Workflow", "looking");
      rows.appendChild(found);
      const said = found.querySelector(".om-props-value");
      workflowByPath(doc.target).then((flow) => {
        if (!panel.el.isConnected) return;
        said.textContent = flow ? "here" : "no longer in this ComfyUI";
        found.classList.toggle("om-props-gone", !flow);
      });
    } else {
      const total = propsRow(doc.kind === "folder" ? "Total" : "Words", "counting");
      rows.appendChild(total);
      const spot = total.querySelector(".om-props-value");
      docMeasure(docPath(doc)).then((got) => {
        if (!panel.el.isConnected) return;
        if (!got) { spot.textContent = "could not be counted"; return; }
        spot.textContent = doc.kind === "folder"
          ? `${bytesText(got.bytes)} in ${countNote(got.files, "file")}`
            + `${got.folders ? `, ${countNote(got.folders, "folder")}` : ""}`
            + `${got.capped ? ", partial count" : ""}`
          : `${got.words} in ${countNote(got.lines, "line")}`;
      });
    }
    const folderish = doc.kind === "folder";
    pickIcon.hidden = !folderish;
    dropIcon.hidden = !folderish || !doc.icon;
    paintShades();
    shades.classList.toggle("om-props-muted", !!doc.icon);
    shades.title = doc.icon
      ? "A colour does not show while the folder has its own icon."
      : "";
  };

  const took = (next) => {
    doc = next;
    floatingPanel(docKey(next))?._omDocSet?.(next);
    refreshDocs();
    paint();
  };

  named.addEventListener("click", () => {
    editInPlace(named, doc.name || "", async (name) => {
      const next = await renameDoc(doc, name);
      if (!next) return "";
      doc = next;
      paint();
      return doc.name;
    });
  });

  pickIcon.onclick = () => file.click();
  file.onchange = async () => {
    const chosen = file.files?.[0];
    file.value = "";
    if (!chosen) return;
    if (!await drawable(chosen)) {
      notify("Not kept", "That file could not be decoded as an image, so it was not kept.");
      return;
    }
    let answer = null;
    try {
      answer = await (await api.fetchApi(
        `${API}/docs/icon?path=${encodeURIComponent(docPath(doc))}`,
        { method: "POST", headers: { "Content-Type": "application/octet-stream" },
          body: await chosen.arrayBuffer() },
      )).json();
    } catch {
      answer = null;
    }
    if (!answer?.ok) {
      notify("Not kept", answer?.reason || "That icon could not be kept.");
      return;
    }
    took(answer.item);
  };
  dropIcon.onclick = async () => {
    const answer = await dlPost("/docs/icon/clear", { path: docPath(doc) }).catch(() => null);
    if (!answer?.ok) {
      notify("Not cleared", answer?.reason || "The icon could not be cleared.");
      return;
    }
    took(answer.item);
  };

  panel._omDocSet = (next) => { doc = next; paint(); };
  panel._omFill = async () => {
    const found = await docFind(doc.id);
    if (!panel.el.isConnected) return;
    if (!found) { panel.destroy(); return; }
    doc = found;
    paint();
  };

  paint();
  return panel;
}

function undoToast(message, label, fn) {
  const node = el("div", "om-toast om-toast-ok");
  node.appendChild(el("span", "om-toast-text", message));
  const button = el("button", "om-btn om-go", label);
  button.onclick = async () => {
    button.disabled = true;
    await fn();
    node.remove();
  };
  node.appendChild(button);
  const timer = setTimeout(() => node.remove(), 9000);
  toastShut(node, () => clearTimeout(timer));
  toastHost().appendChild(node);
}

function pullDown(url, name) {
  const link = el("a");
  link.href = url;
  link.download = name || "";
  link.rel = "noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function exportDoc(item) {
  pullDown(`${API}/docs/export?path=${encodeURIComponent(docPath(item))}`);
}

function exportText(name, text) {
  const blob = new Blob([String(text ?? "")], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  pullDown(url, name);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function renameDocIn(node, item, after) {
  const label = node?.querySelector(".om-fold-name, .om-desk-name");
  if (!label) return;
  editInPlace(label, item.name || "", async (name) => {
    const next = await renameDoc(item, name);
    after?.();
    return next?.name || "";
  });
}

async function removeDoc(item, after) {
  const answer = await dlPost("/docs/remove", { path: docPath(item) }).catch(() => null);
  if (!answer?.ok) {
    notify("Not deleted", answer?.reason || "It could not be deleted.");
    return;
  }
  floatingPanel(docKey(item))?.destroy?.();
  if (deskCells[docKey(item)]) {
    delete deskCells[docKey(item)];
    saveDeskCells();
  }
  refreshDocs();
  after?.();
  undoToast(`${item.name} moved to the Trash.`, "Undo", async () => {
    await dlPost("/docs/restore", { token: answer.token }).catch(() => {});
    refreshDocs();
    after?.();
  });
}

const OPEN_WORDS = { folder: "Open folder", link: "Open workflow", file: "Open" };

function docMenuItems(item, after, node) {
  return [
    { label: OPEN_WORDS[item.kind] || "Open note", fn: () => openDoc(item) },
    item.kind === "note" || (item.kind === "file" && item.edits)
      ? { label: "Open in View", fn: () => openDoc({ ...item, openAt: "view" }) }
      : null,
    { label: "Rename", fn: () => renameDocIn(node, item, after) },
    item.kind === "link"
      ? { label: workflowMissing(item.target) ? "Locate workflow" : "Point at another workflow",
          fn: () => relinkFlow(item, after) }
      : null,
    item.kind === "link" ? null : { label: "Export", fn: () => exportDoc(item) },
    { label: "Properties", fn: () => openDocProps(item) },
    { label: "Delete", danger: true, fn: () => removeDoc(item, after) },
  ].filter(Boolean);
}

async function newDeskNote() {
  const answer = await dlPost("/docs/new", { parent: DOC_DESKTOP, name: NEW_NOTE_NAME })
    .catch(() => null);
  if (!answer?.ok) {
    notify("Not created", answer?.reason || "It could not be created.");
    return;
  }
  await loadDeskDocs();
  paintDeskIcons();
  openNote(answer.item);
}

async function newDeskFolder() {
  const answer = await dlPost("/docs/folder", { parent: DOC_DESKTOP, name: NEW_FOLDER_NAME })
    .catch(() => null);
  if (!answer?.ok) {
    notify("Not created", answer?.reason || "It could not be created.");
    return;
  }
  await loadDeskDocs();
  paintDeskIcons();
  const cell = deskLayer?.querySelector(
    `[data-om-desk-key="${CSS.escape(docKey(answer.item))}"]`);
  if (cell) {
    deskSelect(cell);
    renameDocIn(cell, answer.item, async () => { await loadDeskDocs(); paintDeskIcons(); });
  }
}

function buildDocCell(item) {
  const cell = el("div", "om-desk-cell");
  cell._omDoc = item;
  cell.dataset.omDeskKey = docKey(item);
  cell.dataset.omDeskWindow = docKey(item);
  cell.tabIndex = -1;
  cell.setAttribute("role", "option");
  cell.setAttribute("aria-selected", "false");
  cell.appendChild(omIcon(docArt(item),
                          { name: item.name, cls: "om-desk-art", img: "om-desk-img" }));
  cell.appendChild(el("span", "om-desk-name", item.name));
  cell.appendChild(el("span", "om-desk-live"));
  if (item.kind === "link") cell.dataset.omFlowTarget = String(item.target || "");
  liveTip(cell, () => ({
    lead: item.name,
    facts: [
      ["Kind", docWord(item)],
      item.kind === "folder"
        ? ["Holds", `${item.holds} item${item.holds === 1 ? "" : "s"}`]
        : (item.kind === "link"
          ? ["Opens", String(item.target || "").replace(/^workflows\//, "")]
          : ["Size", bytesText(item.size)]),
      ["Edited", whenText(new Date(item.at * 1000))],
    ],
    lines: item.kind === "link" && workflowMissing(item.target)
      ? ["That workflow is not in this ComfyUI any more."]
      : undefined,
  }));
  cell.onclick = () => deskSelect(cell);
  cell.ondblclick = () => openDoc(item);
  cell.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    event.stopPropagation();
    deskSelect(cell);
    openRowMenu(cell, { items: docMenuItems(item, refreshDocs, cell), align: "left" });
  });
  if (item.kind === "folder") {
    dropDocsInto(cell, () => docPath(item), refreshDocs, { spring: () => openFolder(item) });
  }
  dragDocFrom(cell, item);
  dragDeskCell(cell);
  return cell;
}

export { deskDocs, docPath, docKey, placeDoc, NEW_NOTE_NAME, docsIn, DOC_DESKTOP, DOC_DOCUMENTS, loadDeskDocs, docArt, docFind, refreshDocs, draftNote, openNote, FILE_DRAG_TYPE, carriedDoc, carriedHost, docKindOf, docsPathOf, parentOf, dropDocsInto, openDoc, makeFlowLink, newDeskFlow, emptyWastebasket, openWastebasket, renameDocIn, removeDoc, newDeskNote, newDeskFolder, buildDocCell };
