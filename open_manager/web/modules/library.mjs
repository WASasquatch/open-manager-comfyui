import { api } from "../../../scripts/api.js";
import { API, ICON_LIBRARY } from "./base.mjs";
import { el, safeUrl, toast, notify, chooseAction, openRowMenu } from "./ui.mjs";
import { asWindow, windowSize, createFloatingPanel, floatingPanel, closeFloatingPanel } from "./windows.mjs";
import { panelSetting } from "./settings.mjs";
import { sinceText, dropdown } from "./registry.mjs";
import { bytesText, formatsOf, confirmDownloadTrust, confirmDiskRoom, queueModel, dlRemember, dlRecall, openDownloadManager, dirOf, modelRoots, preferredRoot } from "./downloads.mjs";
import { workflowChoices, workflowGraph, openWorkflow } from "./workflows.mjs";

const LIB_MAX_ROWS = 300;

let libIndex = null;
let libRefs = null;
const libWantedPicked = new Set();
let libDupes = null;
let libStorage = null;
let libDiscover = null;
let libDiscoverSynced = false;
const libDiscoverPicked = new Set();

async function libGet(path) {
  return (await api.fetchApi(`${API}${path}`)).json();
}

function openWorkflowDocuments() {
  const found = [];
  for (const choice of workflowChoices()) {
    const flow = choice.workflow;
    const document = workflowGraph(flow, choice.active);
    const label = flow?.path || choice.label;
    if (document && label) {
      found.push({ workflow: label, document,
                   saved: !flow?.isTemporary, modified: !!flow?.isModified });
    }
  }
  return found;
}

async function libPost(path, body) {
  const answer = await api.fetchApi(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  return answer.json();
}

const LIB_TABS = [
  { key: "all", title: "All",
    empty: "No model files found in the registered folders." },
  { key: "duplicates", title: "Duplicates",
    empty: "No file is held in more than one place." },
  { key: "unreferenced", title: "No reference found",
    empty: "Every model is referenced by a workflow." },
  { key: "absent", title: "Not downloaded",
    empty: "Every model a workflow asks for is on disk." },
  { key: "discover", title: "Discover",
    empty: "No model list held yet." },
  { key: "storage", title: "Storage",
    empty: "Nothing indexed yet." },
];

function libFolderOf(path) {
  return dirOf(path);
}

function buildLibraryRow(file, refresh, { note = "" } = {}) {
  const row = el("div", "om-lib-row");

  const top = el("div", "om-dl-top");
  top.appendChild(el("span", "om-dl-name", file.name));
  top.appendChild(el("span", "om-lib-size", bytesText(file.size)));
  row.appendChild(top);

  const where = el("div", "om-dl-where");
  where.appendChild(el("span", null, file.directory));
  const place = el("span", "om-dl-src", libFolderOf(file.path));
  place.title = file.path;
  where.appendChild(place);
  if (file.mtime) where.appendChild(el("span", "om-dl-src", sinceText(file.mtime)));
  row.appendChild(where);

  if (note) row.appendChild(el("div", "om-dl-note", note));

  const foot = el("div", "om-dl-foot");
  const digest = el("span", "om-dl-size", file.sha256 ? `SHA256 ${file.sha256}` : "");
  foot.appendChild(digest);
  const acts = el("span", "om-dl-acts");
  const manage = el("button", "om-btn om-dl-btn om-caret", "Manage ▾");
  manage.onclick = (event) => {
    event.stopPropagation();
    openRowMenu(manage, { items: libraryMenu(file, digest, refresh), align: "right" });
  };
  acts.appendChild(manage);
  foot.appendChild(acts);
  row.appendChild(foot);
  return row;
}

function mayHash() {
  return panelSetting("openManager.hashOnDemand", true) !== false;
}

function libraryMenu(file, digest, refresh) {
  if (!mayHash()) {
    return [
      { label: "Where it came from", fn: () => showProvenance(file) },
      { label: "Copy path", fn: () => {
          navigator.clipboard?.writeText(file.path)
            .then(() => toast("Path copied.", { kind: "ok" }))
            .catch(() => notify("Not copied", "The clipboard is not available here."));
        } },
      { label: "Delete file", danger: true, fn: () => confirmLibraryDelete(file, refresh) },
    ];
  }
  return [
    { label: file.sha256 ? "Re-hash" : "Hash", fn: async () => {
        const note = toast(`Hashing ${file.name}...`, { sticky: true });
        const answer = await libPost("/library/hash", { path: file.path, force: !!file.sha256 });
        note.remove();
        if (!answer.ok) { notify("Not hashed", answer.reason || "The file could not be read."); return; }
        file.sha256 = answer.sha256;
        digest.textContent = `SHA256 ${answer.sha256}`;
        toast("Hashed.", { kind: "ok" });
      } },
    { label: "Where it came from", fn: () => showProvenance(file) },
    { label: "Copy path", fn: () => {
        navigator.clipboard?.writeText(file.path)
          .then(() => toast("Path copied.", { kind: "ok" }))
          .catch(() => notify("Not copied", "The clipboard is not available here."));
      } },
    { label: "Copy hash", fn: async () => {
        const value = file.sha256 || (await libPost("/library/hash", { path: file.path })).sha256;
        if (!value) { notify("No hash", "The file could not be read."); return; }
        file.sha256 = value;
        digest.textContent = `SHA256 ${value}`;
        navigator.clipboard?.writeText(value)
          .then(() => toast("Hash copied.", { kind: "ok" }))
          .catch(() => notify("Not copied", "The clipboard is not available here."));
      } },
    { label: "Delete file", danger: true, fn: () => confirmLibraryDelete(file, refresh) },
  ];
}

async function confirmLibraryDelete(file, refresh) {
  const go = await chooseAction(`Delete ${file.name}?`, "",
    [{ key: "go", label: "Delete file", primary: true }],
    { wide: true, facts: [
      ["File", file.path],
      ["Folder", file.directory],
      ["Size", bytesText(file.size)],
      ["Recoverable", "No. This removes it from disk."],
    ] });
  if (!go) return;
  const answer = await libPost("/library/delete", { path: file.path });
  if (answer.ok) { toast(`${file.name} deleted.`, { kind: "ok" }); refresh(true); }
  else notify("Not deleted", answer.reason || "The file could not be deleted.");
}

async function showProvenance(file) {
  const note = toast("Looking...", { sticky: true });
  let found;
  try {
    found = await libPost("/library/provenance", { path: file.path });
  } finally {
    note.remove();
  }
  if (!found?.ok) {
    notify("Nothing to show", found?.reason || "That file could not be read.");
    return;
  }
  const facts = [
    ["File", found.name],
    ["Where", found.path],
    ["Size", bytesText(found.size)],
    ["Last changed", found.modified ? sinceText(found.modified) : ""],
  ];
  const from = found.download || {};
  if (from.url) {
    facts.push(["Downloaded", from.at ? sinceText(from.at) : "by the Download Manager"]);
    facts.push(["From", from.url]);
    if (from.owner) facts.push(["Account", from.owner]);
    if (from.source) facts.push(["Added", from.source]);
    if (from.hash) facts.push([`Expected ${(from.hash_type || "sha256").toUpperCase()}`, from.hash]);
  } else {
    facts.push(["Downloaded", "Not by Open Manager"]);
  }
  facts.push(["SHA256", found.sha256 || "Not hashed"]);
  const used = found.workflows || [];
  facts.push([
    "Used by",
    used.length ? used.slice(0, 12).join(", ") + (used.length > 12 ? ` and ${used.length - 12} more` : "")
                : `No saved workflow names it (${found.searched} searched)`,
  ]);
  await chooseAction(`Where ${found.name} came from`, "", [], { wide: true, facts });
}

function buildWantedSection(entries, refresh) {
  const parts = [];
  const workflows = new Set(entries.flatMap((one) => one.workflows));
  const lead = el("div", "om-lib-lead");
  lead.textContent =
    `${entries.length} model${entries.length === 1 ? "" : "s"} that `
    + `${workflows.size === 1 ? "a workflow asks" : `${workflows.size} workflows ask`}`
    + " for and cannot find.";
  parts.push(lead);

  const boxes = new Map();
  const bar = el("div", "om-lib-actions");
  const summary = el("span", "om-dl-summary", "");
  const all = el("button", "om-btn", "Select all");
  const go = el("button", "om-btn om-go", "Download");
  const keyOf = (entry) => (entry.model.name || "").toLowerCase();
  const picked = () => entries.filter((_, index) => boxes.get(index)?.checked);
  const retally = () => {
    const chosen = picked();
    summary.textContent = chosen.length
      ? `${chosen.length} of ${entries.length} selected`
      : "Nothing selected";
    go.disabled = !chosen.length;
    all.textContent = chosen.length === entries.length ? "Select none" : "Select all";
  };
  all.onclick = () => {
    const turnOn = picked().length !== entries.length;
    for (const box of boxes.values()) box.checked = turnOn;
    for (const entry of entries) {
      if (turnOn) libWantedPicked.add(keyOf(entry));
      else libWantedPicked.delete(keyOf(entry));
    }
    retally();
  };
  go.onclick = async () => {
    const chosen = picked();
    if (!chosen.length) return;
    go.disabled = true;
    try {
      await fetchWanted(chosen, refresh);
    } finally {
      go.disabled = false;
      retally();
    }
  };
  bar.appendChild(summary);
  bar.appendChild(all);
  bar.appendChild(go);
  parts.push(bar);

  entries.forEach((entry, index) => {
    const row = el("label", "om-dl-model");
    const box = el("input", "om-dl-check");
    box.type = "checkbox";
    box.checked = libWantedPicked.has(keyOf(entry));
    box.onchange = () => {
      if (box.checked) libWantedPicked.add(keyOf(entry));
      else libWantedPicked.delete(keyOf(entry));
      retally();
    };
    boxes.set(index, box);
    row.appendChild(box);

    const text = el("div", "om-dl-modeltext");
    text.appendChild(el("div", "om-dl-name", entry.model.name));
    const meta = el("div", "om-dl-where");
    meta.appendChild(el("span", null, entry.model.directory || "?"));
    if (entry.model.owner) meta.appendChild(el("span", "om-dl-owner", entry.model.owner));
    text.appendChild(meta);
    text.appendChild(buildWantedSources(entry.sources));
    row.appendChild(text);
    parts.push(row);
  });

  retally();
  return parts;
}

const WANTED_SOURCES_SHOWN = 4;

function buildWantedSources(sources) {
  const box = el("div", "om-lib-sources");
  const ordered = [...sources].sort((a, b) =>
    (b.open - a.open) || a.workflow.localeCompare(b.workflow));
  const line = (source) => {
    const one = el("div", "om-lib-source");
    const leaf = source.workflow.split("/").pop();
    const title = el("button", "om-lib-source-title",
                     leaf.toLowerCase().endsWith(".json") ? leaf.slice(0, -5) : leaf);
    title.title = `Open ${source.workflow}`;
    title.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      openWorkflow(source.workflow);
    };
    one.appendChild(title);
    const state = source.open
      ? (!source.path ? "Open, never saved" : source.modified ? "Open, unsaved changes" : "Open")
      : "Saved";
    one.appendChild(el("span", "om-dl-src", state));
    for (const node of source.nodes) one.appendChild(el("span", "om-dl-src", node));
    if (source.path) {
      const where = el("span", "om-lib-source-path", source.path);
      where.title = source.path;
      one.appendChild(where);
    }
    return one;
  };
  ordered.slice(0, WANTED_SOURCES_SHOWN).forEach((source) => box.appendChild(line(source)));
  const rest = ordered.slice(WANTED_SOURCES_SHOWN);
  if (rest.length) {
    const more = el("button", "om-lib-source-more", `${rest.length} more`);
    more.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      more.replaceWith(...rest.map(line));
    };
    box.appendChild(more);
  }
  return box;
}

async function fetchWanted(entries, refresh) {
  const answered = new Map();
  const perOwner = new Map();
  for (const entry of entries) {
    if (!perOwner.has(entry.model.owner)) perOwner.set(entry.model.owner, []);
    perOwner.get(entry.model.owner).push(entry.model.name);
  }
  const ready = [];
  const skipped = [];
  for (const entry of entries) {
    const owner = entry.model.owner;
    if (!answered.has(owner)) {
      const names = perOwner.get(owner) || [entry.model.name];
      answered.set(owner, await confirmDownloadTrust(
        owner,
        names.length === 1 ? names[0] : `${names.length} models your workflows ask for`,
        names.length !== 1,
        formatsOf(names)));
    }
    if (!answered.get(owner)) { skipped.push(entry.model.name); continue; }
    ready.push({
      url: entry.model.url, name: entry.model.name, directory: entry.model.directory,
      owner, hash: entry.model.hash, hash_type: entry.model.hash_type,
    });
  }
  if (skipped.length) {
    toast(`Skipped ${skipped.length} model${skipped.length === 1 ? "" : "s"} from `
          + `${[...new Set(entries.filter((one) => skipped.includes(one.model.name))
                                  .map((one) => one.model.owner))].join(", ")}.`,
          { kind: "warn" });
  }
  if (!ready.length || !(await confirmDiskRoom(ready))) return;

  let queued = 0;
  for (const model of ready) {
    if (await queueModel(model, { source: "missing from a workflow", askTrust: false })) {
      queued += 1;
      libWantedPicked.delete((model.name || "").toLowerCase());
    }
  }
  if (queued) {
    toast(`Queued ${queued} model${queued === 1 ? "" : "s"}.`, { kind: "ok" });
    if (!floatingPanel("downloads")) openDownloadManager();
  }
  refresh?.(false);
}

const DISCOVER_SHOWN = [
  { key: "available", title: "Available", holds: (one) => !one.blocked && !one.on_disk },
  { key: "on-disk", title: "On disk", holds: (one) => !!one.on_disk },
  { key: "blocked", title: "Not downloadable", holds: (one) => !!one.blocked && !one.on_disk },
  { key: "all", title: "All", holds: () => true },
];

const DISCOVER_STATES = { queued: "Queued", downloading: "Downloading", pausing: "Downloading",
                          paused: "Paused" };

function discoverKey(one) {
  return `${one.url}|${one.folder}/${one.subfolder}/${one.filename}`;
}

function discoverPlace(one) {
  return one.folder ? [one.folder, one.subfolder].filter(Boolean).join("/") : one.save_path;
}

function discoverText(one) {
  return [one.name, one.filename, one.type, one.base, one.description, discoverPlace(one),
          one.owner].join(" ").toLowerCase();
}

function buildDiscoverRow(one, boxes, retally) {
  const key = discoverKey(one);
  const row = el("label",
    `om-dl-model${one.on_disk ? " om-dl-have" : ""}${one.blocked ? " om-dl-refused" : ""}`);
  const box = el("input", "om-dl-check");
  box.type = "checkbox";
  box.disabled = !!one.blocked;
  box.checked = !one.blocked && libDiscoverPicked.has(key);
  box.onchange = () => {
    if (box.checked) libDiscoverPicked.add(key);
    else libDiscoverPicked.delete(key);
    retally();
  };
  boxes.set(key, box);
  row.appendChild(box);

  const text = el("div", "om-dl-modeltext");
  const top = el("div", "om-dl-top");
  top.appendChild(el("span", "om-dl-name", one.name));
  if (one.size_text) top.appendChild(el("span", "om-lib-size", one.size_text));
  text.appendChild(top);

  const meta = el("div", "om-dl-where");
  meta.appendChild(el("span", null,
    `${discoverPlace(one)}/${one.filename}${one.repo ? "/" : ""}`));
  if (one.type) meta.appendChild(el("span", "om-dl-src", one.type));
  if (one.base && one.base !== one.type) meta.appendChild(el("span", "om-dl-src", one.base));
  if (one.owner) meta.appendChild(el("span", "om-dl-owner", one.owner));
  const page = safeUrl(one.reference);
  if (page) {
    const link = el("a", "om-lib-page", "Page");
    link.href = page;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.onclick = (event) => event.stopPropagation();
    meta.appendChild(link);
  }
  text.appendChild(meta);

  if (one.description) {
    const about = el("div", "om-lib-desc", one.description);
    about.title = one.description;
    text.appendChild(about);
  }
  if (one.blocked) {
    const refused = el("div", "om-dl-note om-dl-bad", one.blocked);
    if (one.enable) refused.appendChild(el("span", "om-lib-env", one.enable));
    text.appendChild(refused);
  } else if (DISCOVER_STATES[one.queued]) {
    text.appendChild(el("div", "om-dl-note", DISCOVER_STATES[one.queued]));
  } else if (one.on_disk) {
    const have = el("div", "om-dl-note", "On disk");
    have.title = one.on_disk;
    text.appendChild(have);
  }
  row.appendChild(text);
  return row;
}

function buildDiscoverView(report, wanted, refresh, redraw) {
  const rows = report.models || [];
  const parts = [];
  parts.push(el("div", "om-lib-lead",
    `${rows.length} models in ComfyUI-Manager's list · fetched ${sinceText(report.fetched_at)}`));

  const pick = (key, fallback, options) => {
    const select = dropdown(key, fallback, options);
    select.onchange = () => { dlRemember(key, select.value); redraw(); };
    return select;
  };
  const facet = (field) => [...new Set(rows.map((one) => one[field]).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  const showPick = pick("om-lib-discover-show", "available",
    DISCOVER_SHOWN.map((one) => [one.key, `${one.title} (${rows.filter(one.holds).length})`]));
  const typePick = pick("om-lib-discover-type", "",
    [["", "All types"], ...facet("type").map((one) => [one, one])]);
  const basePick = pick("om-lib-discover-base", "",
    [["", "All bases"], ...facet("base").map((one) => [one, one])]);
  const picks = el("div", "om-lib-picks");
  picks.appendChild(showPick);
  picks.appendChild(typePick);
  picks.appendChild(basePick);
  parts.push(picks);

  const shown = DISCOVER_SHOWN.find((one) => one.key === showPick.value) || DISCOVER_SHOWN[0];
  const visible = rows
    .filter((one) => shown.holds(one)
      && (!typePick.value || one.type === typePick.value)
      && (!basePick.value || one.base === basePick.value)
      && (!wanted || discoverText(one).includes(wanted)))
    .sort((a, b) => b.id - a.id);
  const selectable = visible.filter((one) => !one.blocked);

  const boxes = new Map();
  const bar = el("div", "om-lib-actions");
  const summary = el("span", "om-dl-summary", "");
  const all = el("button", "om-btn", "Select all");
  const go = el("button", "om-btn om-go", "Download");
  const chosen = () => rows.filter((one) => !one.blocked && libDiscoverPicked.has(discoverKey(one)));
  const retally = () => {
    const picked = chosen();
    summary.textContent = picked.length ? `${picked.length} selected` : "Nothing selected";
    go.disabled = !picked.length;
    const every = selectable.length
      && selectable.every((one) => libDiscoverPicked.has(discoverKey(one)));
    all.textContent = every ? "Select none" : "Select all";
    all.disabled = !selectable.length;
  };
  all.onclick = () => {
    const turnOn = !selectable.every((one) => libDiscoverPicked.has(discoverKey(one)));
    for (const one of selectable) {
      const key = discoverKey(one);
      if (turnOn) libDiscoverPicked.add(key);
      else libDiscoverPicked.delete(key);
      const box = boxes.get(key);
      if (box) box.checked = turnOn;
    }
    retally();
  };
  go.onclick = async () => {
    const picked = chosen();
    if (!picked.length) return;
    go.disabled = true;
    try {
      await fetchDiscovered(picked, refresh);
    } finally {
      retally();
    }
  };
  bar.appendChild(summary);
  bar.appendChild(all);
  bar.appendChild(go);
  parts.push(bar);

  if (visible.length) {
    parts.push(...visible.map((one) => buildDiscoverRow(one, boxes, retally)));
  } else {
    const box = el("div", "om-empty");
    box.appendChild(el("div", "om-empty-title", "No model in the list matches."));
    parts.push(box);
  }
  retally();
  return parts;
}

async function discoverFiles(one) {
  if (!one.repo) {
    return { ok: true, files: [{ url: one.url, name: one.filename, subfolder: one.subfolder }] };
  }
  try {
    return await libPost("/library/discover/repo",
      { repo: one.repo, folder: one.folder, subfolder: one.subfolder });
  } catch {
    return { ok: false, reason: "The repository could not be read." };
  }
}

async function fetchDiscovered(chosen, refresh) {
  const expanded = [];
  const refused = [];
  for (const one of chosen) {
    const answer = await discoverFiles(one);
    if (answer.ok) expanded.push({ one, files: answer.files || [] });
    else refused.push([one.name, [answer.reason, answer.enable].filter(Boolean).join(" · ")]);
  }
  if (refused.length) {
    await chooseAction(refused.length === 1 ? `${refused[0][0]} not downloaded`
                                            : `${refused.length} not downloaded`,
      "", [], { wide: true, facts: refused });
  }

  const perOwner = new Map();
  for (const { one, files } of expanded) {
    if (!perOwner.has(one.owner)) perOwner.set(one.owner, []);
    perOwner.get(one.owner).push(...files.map((file) => file.name));
  }
  const answered = new Map();
  const skipped = new Set();
  const ready = [];
  for (const { one, files } of expanded) {
    if (!answered.has(one.owner)) {
      const names = perOwner.get(one.owner) || [one.filename];
      answered.set(one.owner, await confirmDownloadTrust(
        one.owner,
        names.length === 1 ? names[0] : `${names.length} files from ComfyUI-Manager's list`,
        names.length !== 1,
        formatsOf(names)));
    }
    if (!answered.get(one.owner)) { skipped.add(one.owner); continue; }
    const root = preferredRoot(await modelRoots(one.folder));
    for (const file of files) {
      ready.push({
        url: file.url, name: file.name, directory: one.folder, subfolder: file.subfolder,
        owner: one.owner, root, hash: file.hash || "", hash_type: file.hash ? "sha256" : "",
        repo: !!one.repo, key: discoverKey(one),
      });
    }
  }
  const dropped = expanded.filter(({ one }) => skipped.has(one.owner)).length;
  if (dropped) {
    toast(`Skipped ${dropped} model${dropped === 1 ? "" : "s"} from ${[...skipped].join(", ")}.`,
          { kind: "warn" });
  }
  if (!ready.length || !(await confirmDiskRoom(ready))) return;

  const done = new Set();
  for (const model of ready) {
    if (await queueModel(model, { source: "from ComfyUI-Manager's list", askTrust: false })) {
      done.add(model.key);
      libDiscoverPicked.delete(model.key);
    }
  }
  const queued = done.size;
  if (queued) {
    toast(`Queued ${queued} model${queued === 1 ? "" : "s"}.`, { kind: "ok" });
    if (!floatingPanel("downloads")) openDownloadManager();
  }
  refresh?.(false);
}

function buildDuplicateGroup(group, refresh) {
  const box = el("div", "om-lib-group");
  const head = el("div", "om-lib-group-head");
  head.appendChild(el("span", "om-dl-name", group.name));
  head.appendChild(el("span", "om-lib-size",
    `${group.copies.length} copies · ${bytesText(group.wasted)} reclaimable`));
  box.appendChild(head);
  if (group.state === "identical" && group.sha256) {
    const line = el("div", "om-dl-hash");
    line.appendChild(el("span", "om-dl-hash-label", "IDENTICAL"));
    line.appendChild(el("code", "om-dl-hash-value", group.sha256));
    box.appendChild(line);
  } else if (group.state === "different") {
    box.appendChild(el("div", "om-dl-note om-dl-bad",
      "Same filename, different contents. Which one loads depends on the order ComfyUI "
      + "searches its folders, so a workflow naming this file may not get the one you mean."));
  } else if (group.state === "similar") {
    box.appendChild(el("div", "om-dl-note",
      "Start and end match. Not yet confirmed identical."));
  } else {
    box.appendChild(el("div", "om-dl-note",
      "Same name and size. Nothing has been read yet."));
  }
  for (const copy of group.copies) {
    box.appendChild(buildLibraryRow({ ...copy, sha256: group.sha256 }, refresh));
  }
  return box;
}

function buildStorageRoot(root) {
  const row = el("div", "om-lib-row");
  const top = el("div", "om-dl-top");
  top.appendChild(el("span", "om-dl-name", root.root));
  top.appendChild(el("span", "om-lib-size", bytesText(root.bytes)));
  row.appendChild(top);

  if (root.total) {
    const bar = el("div", "om-mem-split");
    const used = el("div", "om-mem-resident");
    const share = ((root.total - root.free) / root.total) * 100;
    used.style.width = `${Math.max(0, Math.min(100, share))}%`;
    if (share >= 90) used.style.background = "#f85149";
    else if (share >= 75) used.style.background = "#d29922";
    bar.title = `${bytesText(root.total - root.free)} of ${bytesText(root.total)} used on this drive`;
    bar.appendChild(used);
    row.appendChild(bar);
  }

  const meta = el("div", "om-dl-where");
  meta.appendChild(el("span", null, `${root.files} file${root.files === 1 ? "" : "s"}`));
  for (const folder of root.folders.slice(0, 4)) meta.appendChild(el("span", "om-dl-src", folder));
  if (root.total) {
    meta.appendChild(el("span", "om-dl-src", `${bytesText(root.free)} free on the drive`));
  }
  row.appendChild(meta);
  return row;
}

function buildStorageView(report, refresh) {
  const parts = [];
  const lead = el("div", "om-lib-lead");
  lead.textContent = `${report.files} files · ${bytesText(report.total)} across `
    + `${report.roots.length} registered path${report.roots.length === 1 ? "" : "s"}.`;
  parts.push(lead);

  const reclaim = [];
  if (report.duplicate_bytes) {
    reclaim.push(`${bytesText(report.duplicate_bytes)} in files sharing a name and size`);
  }
  if (report.partial_bytes) {
    reclaim.push(`${bytesText(report.partial_bytes)} in unfinished downloads`);
  }
  if (reclaim.length) {
    const note = el("div", "om-lib-lead");
    note.textContent = `Possibly reclaimable: ${reclaim.join(" · ")}.`;
    parts.push(note);
  }

  parts.push(el("div", "om-mem-bar-label", "Registered paths"));
  parts.push(...report.roots.map(buildStorageRoot));

  if (report.partials?.length) {
    const head = el("div", "om-lib-row om-lib-sweep");
    const top = el("div", "om-dl-top");
    top.appendChild(el("span", "om-dl-name",
      `${report.partials.length} unfinished download${report.partials.length === 1 ? "" : "s"}`));
    top.appendChild(el("span", "om-lib-size", bytesText(report.partial_bytes)));
    head.appendChild(top);
    head.appendChild(el("div", "om-dl-note",
      "Part files of unfinished downloads, including any still in the Download Manager."));
    const foot = el("div", "om-dl-foot");
    foot.appendChild(el("span", "om-dl-size", ""));
    const acts = el("span", "om-dl-acts");
    const sweep = el("button", "om-btn om-dl-btn om-go", "Clean up");
    sweep.onclick = async () => {
      const go = await chooseAction("Delete unfinished downloads?", "",
        [{ key: "go", label: "Delete them", primary: true }],
        { wide: true, facts: [
          ["Files", `${report.partials.length} part files`],
          ["Frees", bytesText(report.partial_bytes)],
          ["Models", "Not touched. Only part files are removed."],
        ] });
      if (!go) return;
      const answer = await libPost("/library/sweep", {});
      if (answer.ok) toast(`Freed ${bytesText(answer.bytes || 0)}.`, { kind: "ok" });
      refresh(true);
    };
    acts.appendChild(sweep);
    foot.appendChild(acts);
    head.appendChild(foot);
    parts.push(el("div", "om-mem-bar-label", "Unfinished downloads"), head);
  }

  parts.push(el("div", "om-mem-bar-label", "Largest files"));
  parts.push(...(report.largest || []).map((file) => {
    const row = el("div", "om-lib-row");
    const top = el("div", "om-dl-top");
    top.appendChild(el("span", "om-dl-name", file.name));
    top.appendChild(el("span", "om-lib-size", bytesText(file.size)));
    row.appendChild(top);
    const meta = el("div", "om-dl-where");
    meta.appendChild(el("span", null, file.directory));
    const place = el("span", "om-dl-src", dirOf(file.path));
    place.title = file.path;
    meta.appendChild(place);
    row.appendChild(meta);
    return row;
  }));
  return parts;
}

function openModelLibrary() {
  const shown = floatingPanel("library");
  if (shown?.isMinimised?.()) { shown.present(); return shown; }
  if (shown) { closeFloatingPanel("library"); return null; }

  const panel = createFloatingPanel({
    key: "library", title: "Model Library", ...windowSize("library"),
    modal: !asWindow("library"),
  });
  panel.setMaskIcon(ICON_LIBRARY);
  const summary = el("div", "om-dl-summary", "Reading...");
  panel.bar.querySelector(".om-float-badge").appendChild(summary);

  let tab = LIB_TABS.find((one) => one.key === dlRecall("om-lib-tab", "")) || LIB_TABS[0];

  const filter = el("input", "om-search om-lib-filter");
  filter.placeholder = "Filter by name or folder";
  filter.spellcheck = false;
  let filterTimer = 0;
  filter.addEventListener("input", () => {
    clearTimeout(filterTimer);
    filterTimer = setTimeout(draw, 200);
  });
  panel.tools.appendChild(filter);

  const rescan = el("button", "om-btn", "Rescan");
  rescan.title = "Walk the model folders again.";
  rescan.onclick = () => refresh(true);
  panel.tools.appendChild(rescan);

  const check = el("button", "om-btn", "Quick check");
  check.title = "Reads the start and end of each candidate. Fast, and rules out name clashes.";
  check.style.display = "none";
  check.onclick = async () => {
    check.disabled = true;
    check.textContent = "Checking...";
    libDupes = await libGet("/library/duplicates?level=quick");
    check.disabled = false;
    check.textContent = "Quick check";
    draw();
  };
  panel.tools.appendChild(check);

  const confirm = el("button", "om-btn om-go", "Verify fully");
  confirm.style.display = "none";
  confirm.onclick = async () => {
    confirm.disabled = true;
    confirm.textContent = "Reading...";
    libDupes = await libGet("/library/duplicates?level=full");
    confirm.disabled = false;
    draw();
  };
  panel.tools.appendChild(confirm);

  const update = el("button", "om-btn", "Update list");
  update.title = "Fetch ComfyUI-Manager's model list again.";
  update.style.display = "none";
  let listProblem = "";
  let listFetching = false;
  const syncList = async (asked) => {
    if (listFetching) return;
    listFetching = true;
    libDiscoverSynced = true;
    update.disabled = true;
    update.textContent = "Updating...";
    let reason = "";
    try {
      const answer = await libPost("/library/discover/sync", {});
      if (answer.models) libDiscover = answer;
      reason = answer.ok ? "" : (answer.reason || "The list could not be fetched.");
    } catch {
      reason = "The list could not be fetched.";
    } finally {
      listFetching = false;
      update.disabled = false;
      update.textContent = "Update list";
    }
    listProblem = reason;
    if (reason && asked && libDiscover?.cached) notify("List not updated", reason);
    draw();
  };
  const syncIfStale = () => {
    if (tab.key === "discover" && libDiscover && libDiscover.stale && !libDiscoverSynced) {
      syncList(false);
    }
  };
  update.onclick = () => syncList(true);
  panel.tools.appendChild(update);

  const tabBar = el("div", "om-dl-tabs");
  panel.body.appendChild(tabBar);
  const body = el("div", "om-dl-body");
  const list = el("div", "om-dl-list");
  body.appendChild(list);
  panel.body.appendChild(body);

  const badges = new Map();
  const buildTabs = () => {
    badges.clear();
    tabBar.replaceChildren(...LIB_TABS.map((one) => {
      const button = el("button", `om-dl-tab${one === tab ? " om-dl-on" : ""}`);
      button.appendChild(el("span", null, one.title));
      const badge = el("span", "om-dl-tab-count", "-");
      badges.set(one.key, badge);
      button.appendChild(badge);
      button.onclick = () => {
        if (one === tab) return;
        tab = one;
        dlRemember("om-lib-tab", tab.key);
        buildTabs();
        draw();
        syncIfStale();
      };
      return button;
    }));
  };

  const counts = () => {
    const files = libIndex?.files || [];
    const referenced = new Set(libRefs?.names || []);
    const have = new Set(files.map((one) => one.name.toLowerCase()));
    return {
      all: files.length,
      duplicates: (libDupes?.groups?.length ?? 0) + (libDupes?.collisions?.length ?? 0),
      unreferenced: libRefs ? files.filter((one) => !referenced.has(one.name.toLowerCase())).length : 0,
      absent: libRefs ? [...referenced].filter((one) => !have.has(one)).length : 0,
      discover: (libDiscover?.models || []).filter((one) => !one.blocked && !one.on_disk).length,
      storage: libStorage?.roots?.length ?? 0,
    };
  };

  const draw = () => {
    if (!panel.el.isConnected) return;
    const files = libIndex?.files || [];
    const total = files.reduce((sum, one) => sum + (one.size || 0), 0);
    summary.textContent = libIndex
      ? `${files.length} files · ${bytesText(total)}`
        + (libIndex.skipped?.length ? ` · ${libIndex.skipped.length} unreachable` : "")
      : "Reading...";

    const found = counts();
    for (const [key, badge] of badges) badge.textContent = String(found[key] ?? 0);
    const onDupes = tab.key === "duplicates";
    const level = libDupes?.level || "names";
    const reading = mayHash();
    check.style.display = reading && onDupes && level === "names" ? "" : "none";
    confirm.style.display = reading && onDupes && level !== "full" ? "" : "none";
    update.style.display = tab.key === "discover" ? "" : "none";
    if (onDupes && libDupes) {
      confirm.textContent = `Verify fully (${bytesText(libDupes.candidate_bytes || 0)})`;
      confirm.title = "Reads every candidate in full to confirm which files are identical.";
    }

    const wanted = filter.value.trim().toLowerCase();
    const matches = (one) => !wanted
      || one.name.toLowerCase().includes(wanted)
      || String(one.directory).toLowerCase().includes(wanted)
      || String(one.path).toLowerCase().includes(wanted);
    const capped = (rows) => {
      if (rows.length <= LIB_MAX_ROWS) return rows.map((one) => buildLibraryRow(one, refresh));
      const head = el("div", "om-lib-lead",
        `Showing the ${LIB_MAX_ROWS} largest of ${rows.length}.`);
      return [head, ...rows.slice(0, LIB_MAX_ROWS).map((one) => buildLibraryRow(one, refresh))];
    };

    const parts = [];
    if (tab.key === "all") {
      parts.push(...capped(files.filter(matches).sort((a, b) => b.size - a.size)));
    } else if (tab.key === "duplicates") {
      const level = libDupes?.level || "names";
      const clashes = libDupes?.collisions || [];
      if (libDupes?.groups?.length || clashes.length) {
        const head = el("div", "om-lib-lead");
        head.textContent = level === "full"
          ? `${bytesText(libDupes.reclaimable)} reclaimable from confirmed identical copies.`
          : level === "quick"
            ? `${bytesText(libDupes.candidate_bytes)} in candidates. Start and end checked, `
              + "not yet confirmed identical."
            : `${bytesText(libDupes.candidate_bytes)} in files sharing a name and size. `
              + (mayHash()
                 ? "Nothing has been read."
                 : "Nothing has been read. Reading file contents is off in settings.");
        parts.push(head);
        if (clashes.length) {
          const warn = el("div", "om-lib-lead om-dl-bad");
          warn.textContent = `${clashes.length} filename${clashes.length === 1 ? "" : "s"} `
            + "used by files that are not the same. These are not duplicates.";
          parts.push(warn, ...clashes.map((one) => buildDuplicateGroup(one, refresh)));
        }
        parts.push(...(libDupes.groups || []).map((one) => buildDuplicateGroup(one, refresh)));
      }
    } else if (tab.key === "storage") {
      if (libStorage?.ok) parts.push(...buildStorageView(libStorage, refresh));
    } else if (tab.key === "unreferenced") {
      const referenced = new Set(libRefs?.names || []);
      const mine = files.filter((one) => !referenced.has(one.name.toLowerCase())).filter(matches);
      if (mine.length) {
        const head = el("div", "om-lib-lead");
        head.textContent =
          `No mention of these in ${libRefs?.workflows ?? 0} saved or open workflows. `
          + "Filenames built at run time are not seen.";
        parts.push(head, ...capped(mine.sort((a, b) => b.size - a.size)));
      }
    } else if (tab.key === "discover") {
      if (libDiscover?.cached) parts.push(...buildDiscoverView(libDiscover, wanted, refresh, draw));
    } else {
      const have = new Set(files.map((one) => one.name.toLowerCase()));
      const byName = new Map();
      for (const entry of libRefs?.declared || []) {
        for (const model of entry.models || []) {
          const folded = (model.name || "").toLowerCase();
          if (!folded || !model.url || have.has(folded)) continue;
          if (wanted && !folded.includes(wanted)) continue;
          if (!byName.has(folded)) byName.set(folded, { model, workflows: [], sources: [] });
          const slot = byName.get(folded);
          let source = slot.sources.find((one) => one.workflow === entry.workflow);
          if (!source) {
            source = { workflow: entry.workflow, path: entry.path || "",
                       open: !!entry.open, modified: !!entry.modified, nodes: [] };
            slot.sources.push(source);
            slot.workflows.push(entry.workflow);
          }
          if (model.node && !source.nodes.includes(model.node)) source.nodes.push(model.node);
        }
      }
      const fetchable = [...byName.values()].sort((a, b) =>
        b.workflows.length - a.workflows.length
        || (a.model.name || "").localeCompare(b.model.name || ""));
      const named = [...(libRefs?.names || [])]
        .filter((one) => !have.has(one) && !byName.has(one)
                         && (!wanted || one.includes(wanted)));

      if (fetchable.length) parts.push(...buildWantedSection(fetchable, refresh));
      if (named.length) {
        const head = el("div", "om-lib-lead");
        head.textContent = fetchable.length
          ? "Named by a workflow that records no source for them. These cannot be fetched from here."
          : "Asked for by a workflow, not found in any model folder.";
        parts.push(head, ...named.map((name) => {
          const row = el("div", "om-lib-row om-dl-gone");
          row.appendChild(el("div", "om-dl-name", name));
          row.appendChild(el("div", "om-dl-note",
            "Not on disk."));
          return row;
        }));
      }
    }

    if (parts.length) {
      list.replaceChildren(...parts);
    } else {
      const box = el("div", "om-empty");
      const problem = tab.key === "discover" && (listProblem || libDiscover?.error);
      box.appendChild(el("div", "om-empty-title",
        tab.key === "discover" && listFetching ? "Fetching ComfyUI-Manager's model list..."
          : problem ? "The model list could not be fetched." : tab.empty));
      if (problem && !listFetching) box.appendChild(el("div", "om-dl-note", problem));
      list.replaceChildren(box);
    }
  };

  const refresh = async (rescanNow = false) => {
    if (!panel.el.isConnected) return;
    summary.textContent = rescanNow ? "Walking the model folders..." : "Reading...";
    try {
      libIndex = await libGet(`/library${rescanNow ? "?refresh=1" : ""}`);
      if (!panel.el.isConnected) return;
      libRefs = await libPost("/library/references", { open: openWorkflowDocuments() });
      if (!panel.el.isConnected) return;
      libDupes = await libGet("/library/duplicates?level=names");
      if (!panel.el.isConnected) return;
      libStorage = await libGet("/library/storage");
      if (!panel.el.isConnected) return;
      libDiscover = await libGet("/library/discover");
    } catch {
      summary.textContent = "The model folders could not be read";
      return;
    }
    draw();
    syncIfStale();
  };

  const onFinished = () => {
    if (!panel.el.isConnected) {
      window.removeEventListener("om-downloads-finished", onFinished);
      return;
    }
    refresh(false);
  };
  window.addEventListener("om-downloads-finished", onFinished);

  buildTabs();
  refresh(false);
  return panel;
}

export { libGet, openModelLibrary };
