import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import { API, ICON_DOWNLOADS } from "./base.mjs";
import { el, closeOn, toast, liveTip, notify, askText, factList, chooseAction, openRowMenu } from "./ui.mjs";
import { asWindow, windowSize, createFloatingPanel, floatingPanel, closeFloatingPanel } from "./windows.mjs";
import { panelSetting } from "./settings.mjs";
import { plusMark } from "./results.mjs";
import { workflowChoices, workflowDocument } from "./workflows.mjs";

const DL_POLL_BUSY = 900;
const DL_POLL_IDLE = 4000;

let dlTimer = 0;
let dlFolders = null;

function dlWorkers() {
  const asked = Number(panelSetting("openManager.downloadWorkers", 2));
  return Number.isFinite(asked) ? Math.max(1, Math.min(8, Math.round(asked))) : 2;
}

async function dlPost(path, body) {
  const answer = await api.fetchApi(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  return answer.json();
}

async function modelFolders() {
  if (dlFolders) return dlFolders;
  try {
    dlFolders = await (await api.fetchApi(`${API}/models/folders`)).json();
  } catch {
    dlFolders = { folders: [], formats: [], media_formats: [], hosts: [] };
  }
  return dlFolders;
}

const dlRoots = new Map();

async function modelRoots(directory) {
  if (!directory) return [];
  if (!dlRoots.has(directory)) {
    try {
      const answer = await (await api.fetchApi(
        `${API}/models/roots?directory=${encodeURIComponent(directory)}`)).json();
      dlRoots.set(directory, answer.roots || []);
    } catch {
      dlRoots.set(directory, []);
    }
  }
  return dlRoots.get(directory);
}

function rootUsable(root) {
  return !!root && root.writable && root.total > 0;
}

function preferredRoot(roots) {
  const usable = (roots || []).filter(rootUsable);
  if (!usable.length) return "";
  if (panelSetting("openManager.downloadLocation", "default") !== "most-free") return "";
  return usable.reduce((best, one) => (one.free > best.free ? one : best)).path;
}

function shortPath(text, cap = 48) {
  const value = String(text || "");
  if (value.length <= cap) return value;
  const head = Math.ceil((cap - 3) * 0.42);
  return `${value.slice(0, head)}...${value.slice(value.length - (cap - 3 - head))}`;
}

function rootLabel(root, isDefault) {
  const space = root.total ? `${bytesText(root.free)} free` : "drive not available";
  return `${shortPath(root.path)} - ${space}${isDefault ? " (default)" : ""}`;
}

function rootSelect(roots, chosen) {
  const select = el("select", "om-side-select om-dl-root");
  roots.forEach((root, index) => {
    const option = el("option", null, rootLabel(root, index === 0));
    option.value = root.path;
    option.title = root.path;
    option.disabled = !rootUsable(root);
    select.appendChild(option);
  });
  const wanted = chosen || preferredRoot(roots);
  if (wanted && roots.some((root) => root.path === wanted && rootUsable(root))) {
    select.value = wanted;
  } else {
    const first = roots.find(rootUsable);
    if (first) select.value = first.path;
  }
  return select;
}

function bytesText(value) {
  const count = Number(value) || 0;
  if (count < 1024) return `${count} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let size = count / 1024;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) { size /= 1024; unit += 1; }
  return `${size < 10 ? size.toFixed(1) : Math.round(size)} ${units[unit]}`;
}

function formatsOf(names) {
  const seen = [];
  for (const name of names) {
    const text = String(name || "");
    const cut = text.lastIndexOf(".");
    const suffix = cut > 0 ? text.slice(cut).toLowerCase() : "";
    if (suffix && !seen.includes(suffix)) seen.push(suffix);
  }
  return seen;
}

async function confirmDownloadTrust(owner, what, plural = false, formats = []) {
  if (!owner) return true;
  const byAuthor = panelSetting("openManager.trustMode", "author") !== "action";
  if (byAuthor) {
    try {
      const answer = await api.fetchApi(
        `${API}/trust?kind=downloads&owner=${encodeURIComponent(owner)}`);
      if ((await answer.json()).trusted === true) return true;
    } catch {
    }
  }
  const host = owner.split("/")[0];
  const account = owner.slice(host.length + 1) || host;
  const choices = byAuthor
    ? [{ key: "always", label: `Trust ${owner}`, primary: true,
         hint: `Stops asking for anything ${account} hosts` },
       { key: "once", label: "This time only", hint: "Nothing is remembered" }]
    : [{ key: "once", label: "Download", primary: true }];

  const how = await chooseAction(`Download from ${owner}?`, "", choices, {
    wide: true,
    facts: [
      ["Host", host],
      ["Account", account],
      ["Trusted", byAuthor ? "No" : "Not tracked, asked every time"],
      [plural ? "Files" : "File", what],
      [formats.length === 1 ? "Format" : "Formats", formats.join(", ")],
      ["Trust covers", byAuthor ? "Downloads only, not packs" : ""],
    ],
  });
  if (!how) return false;
  if (how === "always") {
    try {
      await dlPost("/trust", { owner, kind: "downloads", trusted: true });
    } catch {
      toast(`Could not remember ${owner}.`, { kind: "warn" });
    }
  }
  return true;
}

async function confirmDiskRoom(items) {
  if (!items.length) return true;
  let report;
  try {
    report = await dlPost("/downloads/plan", {
      items: items.map((one) => ({
        url: one.url, name: one.name, directory: one.directory, root: one.root || "",
        subfolder: one.subfolder || "", repo: !!one.repo,
      })),
    });
  } catch {
    return true;
  }
  const short = (report?.drives || []).filter((drive) => drive.short);
  if (!short.length) return true;
  const facts = [];
  for (const drive of short) {
    facts.push([drive.path, `${bytesText(drive.free)} free of ${bytesText(drive.total)}`]);
    facts.push(["Downloading",
                `${bytesText(drive.adding)} in ${drive.files} file${drive.files === 1 ? "" : "s"}`]);
    if (drive.queued) {
      facts.push(["Already queued", `${bytesText(drive.queued)} still to arrive`]);
    }
    facts.push(["Short by", bytesText(Math.max(0, drive.needed - drive.free))]);
  }
  if (report.unknown) {
    facts.push(["Not measured",
                `${report.unknown} file${report.unknown === 1 ? "" : "s"} the host gave no size `
                + "for, so the real figure is higher"]);
  }
  facts.push(["If queued", "Each download stops when the drive fills, keeping what arrived"]);
  const go = await chooseAction(
    short.length === 1 ? `There is not room on ${short[0].path}`
                       : "Not enough room on these drives",
    "", [{ key: "go", label: "Queue anyway", primary: true }], { wide: true, facts });
  return !!go;
}

function samePlace(left, right) {
  const fold = (value) => String(value || "").replace(/[\\/]+/g, "/").replace(/\/$/, "").toLowerCase();
  return !!left && fold(left) === fold(right);
}

async function queueModel(model, { source = "", askTrust = true } = {}) {
  if (askTrust && !(await confirmDownloadTrust(
      model.owner, model.name || "This model", false, formatsOf([model.name])))) {
    return false;
  }
  const body = {
    url: model.url, name: model.name, directory: model.directory, source,
    hash: model.hash || "", hash_type: model.hash_type || "",
    workers: dlWorkers(), overwrite: !!model.overwrite, root: model.root || "",
    subfolder: model.subfolder || "", repo: !!model.repo,
  };
  let result = await dlPost("/downloads", body);
  if (!result.ok && result.installed && !model.overwrite) {
    const into = model.root && [model.root, model.subfolder].filter(Boolean).join("/");
    const elsewhere = into && !samePlace(result.installed, `${into}/${model.name}`);
    const replace = await chooseAction(
      elsewhere ? `Store a second copy of ${model.name}?` : `Replace ${model.name}?`,
      "",
      [{ key: "go", label: elsewhere ? "Download anyway" : "Download again", primary: true }],
      { wide: true,
        facts: [
          ["On disk", result.installed],
          ["Downloading to", elsewhere ? into : result.installed],
          ["Result", elsewhere
            ? "Second copy. The one on disk stays."
            : "Replaced once the new file arrives whole."],
        ] });
    if (!replace) return false;
    result = await dlPost("/downloads", { ...body, overwrite: true });
  }
  if (!result.ok) {
    notify("Not downloaded", result.reason || "The download was refused.");
    return false;
  }
  return true;
}


function dlStatusText(row) {
  if (row.status === "downloading") {
    return row.total ? `${bytesText(row.bytes)} of ${bytesText(row.total)}` : bytesText(row.bytes);
  }
  if (row.status === "pausing") return "Stopping...";
  if (row.status === "done") {
    const size = bytesText(row.bytes || row.total);
    return row.on_disk === false ? `${size} - no longer on disk` : size;
  }
  if (row.status === "failed") return row.error || "Failed";
  if (row.status === "paused") {
    return row.total ? `Paused at ${bytesText(row.bytes)} of ${bytesText(row.total)}`
                     : "Paused";
  }
  if (row.status === "cancelled") return "Cancelled";
  return "Waiting";
}

const DL_VIEWS = [
  {
    key: "transfers",
    title: "Transfers",
    tabs: [
      { key: "downloading", title: "Downloading",
        holds: (row) => ["queued", "downloading", "pausing"].includes(row.status),
        empty: "Nothing is transferring.", clearable: false },
      { key: "suspended", title: "Suspended",
        holds: (row) => ["paused", "failed", "cancelled"].includes(row.status),
        empty: "Nothing is paused or waiting to be retried." },
      { key: "finished", title: "Finished",
        holds: (row) => row.status === "done",
        empty: "No transfer has completed yet." },
    ],
  },
  {
    key: "downloaded",
    title: "Downloaded",
    tabs: [
      { key: "on-disk", title: "On Disk",
        holds: (row) => row.on_disk === true,
        empty: "No downloaded file is on disk.", clearable: false },
      { key: "archive", title: "Archive",
        holds: (row) => row.on_disk === false,
        empty: "Nothing downloaded here has been deleted." },
    ],
  },
];

const DL_VIEW_KEY = "om-dl-view";

function dlRemember(key, value) {
  try { localStorage.setItem(key, value); } catch {}
}

function dlRecall(key, fallback) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}

function buildDownloadRow(row, refresh) {
  const item = el("div",
    `om-dl-row om-dl-${row.status}${row.on_disk === false ? " om-dl-gone" : ""}`);

  const top = el("div", "om-dl-top");
  top.appendChild(el("span", "om-dl-name", row.name || "(unnamed)"));
  top.appendChild(el("span", "om-dl-state", row.status));
  item.appendChild(top);

  const where = el("div", "om-dl-where");
  where.appendChild(el("span", null,
    [row.directory || "?", row.subfolder].filter(Boolean).join("/")));
  if (row.owner) {
    const from = el("span", "om-dl-owner", row.owner);
    from.title = row.url;
    where.appendChild(from);
  }
  if (row.source) where.appendChild(el("span", "om-dl-src", row.source));
  if (row.path) {
    const at = el("span", "om-dl-src", dirOf(row.path));
    at.title = row.path;
    where.appendChild(at);
  }
  item.appendChild(where);

  const bar = el("div", "om-dl-bar");
  const fill = el("div", "om-dl-fill");
  const share = row.total ? Math.min(100, (row.bytes / row.total) * 100) : 0;
  fill.style.width = `${row.status === "done" ? 100 : share}%`;
  bar.appendChild(fill);
  item.appendChild(bar);

  const digest = row.sha256 || row.declared_hash || row.hash || row.sha256_observed;
  if (digest) {
    const line = el("div", "om-dl-hash");
    line.appendChild(el("span", "om-dl-hash-label", "SHA256"));
    const value = el("code", "om-dl-hash-value", digest);
    value.title = `${digest}\nClick to copy`;
    value.onclick = () => {
      navigator.clipboard?.writeText(digest)
        .then(() => toast("Hash copied.", { kind: "ok" }))
        .catch(() => notify("Not copied", "The clipboard is not available here."));
    };
    line.appendChild(value);
    item.appendChild(line);
  }

  const foot = el("div", "om-dl-foot");
  foot.appendChild(el("span", "om-dl-size", dlStatusText(row)));
  const acts = el("span", "om-dl-acts");
  const act = (label, action, { primary = false, hint = "" } = {}) => {
    const button = el("button", `om-btn om-dl-btn${primary ? " om-go" : ""}`, label);
    if (hint) button.title = hint;
    button.onclick = async () => {
      button.disabled = true;
      await dlPost("/downloads/action", { action, id: row.id, workers: dlWorkers() });
      refresh();
    };
    acts.appendChild(button);
  };
  const moving = row.status === "queued" || row.status === "downloading";
  if (moving) {
    act("Pause", "pause", { hint: "Stops here. The bytes already fetched are kept." });
    act("Cancel", "cancel");
  }
  if (row.status === "paused") {
    act("Resume", "retry", { primary: true, hint: "Carries on from where it stopped" });
  }
  if (row.status === "failed" || row.status === "cancelled") act("Retry", "retry", { primary: true });
  if (row.on_disk === false) {
    act("Download again", "retry", { primary: true, hint: "The file is no longer on disk" });
  }
  if (row.on_disk === true) {
    const manage = el("button", "om-btn om-dl-btn om-caret", "Manage ▾");
    manage.onclick = (event) => {
      event.stopPropagation();
      openRowMenu(manage, { items: fileMenu(row, refresh), align: "right" });
    };
    acts.appendChild(manage);
  } else if (!moving && row.status !== "pausing") {
    act("Remove", "remove", { hint: "Removes this entry. Any file on disk is left alone." });
  }
  foot.appendChild(acts);
  item.appendChild(foot);

  if (row.error && row.status === "failed") item.title = row.error;
  return item;
}

function fileMenu(row, refresh) {
  const send = async (action) => {
    const answer = await dlPost("/downloads/action", { action, id: row.id, workers: dlWorkers() });
    refresh();
    return answer;
  };
  return [
    { label: "Verify hash", fn: async () => {
        const note = toast(`Hashing ${row.name}...`, { sticky: true });
        const answer = await send("verify");
        note.remove();
        if (!answer.ok) { notify("Not verified", answer.reason || "The file could not be read."); return; }
        const facts = [
          ["File", row.name],
          ["On disk now", answer.sha256],
          ["Expected", answer.expected || "Nothing to compare against"],
          ["Expected from", answer.expected_from || ""],
          ["Match", answer.matches === null ? "Cannot say" : answer.matches ? "Yes" : "No"],
        ];
        await chooseAction(answer.matches === false ? "Hash does not match" : "Hash checked",
                           "", [], { wide: true, facts });
      } },
    { label: "Re-download", fn: async () => {
        const go = await chooseAction(`Re-download ${row.name}?`, "",
          [{ key: "go", label: "Re-download", primary: true }],
          { wide: true, facts: [
            ["File", row.path || row.name],
            ["Source", row.owner],
            ["Result", "Replaced once the new file has arrived whole"],
          ] });
        if (go) await send("redownload");
      } },
    { label: "Copy URL", fn: () => {
        navigator.clipboard?.writeText(row.url)
          .then(() => toast("URL copied.", { kind: "ok" }))
          .catch(() => notify("Not copied", "The clipboard is not available here."));
      } },
    { label: "Remove from list", fn: async () => {
        const go = await chooseAction(`Remove ${row.name} from the list?`, "",
          [{ key: "go", label: "Remove entry", primary: true }],
          { wide: true, facts: [["Entry", "Removed"], ["File on disk", "Kept"]] });
        if (go) await send("remove");
      } },
    { label: "Delete file", danger: true, fn: async () => {
        const go = await chooseAction(`Delete ${row.name}?`, "",
          [{ key: "go", label: "Delete file", primary: true }],
          { wide: true, facts: [
            ["File", row.path || row.name],
            ["Size", bytesText(row.bytes || row.total)],
            ["Kept", "The record, so it can be fetched again from Archive"],
          ] });
        if (!go) return;
        const answer = await send("delete");
        if (answer.ok) toast(`${row.name} deleted.`, { kind: "ok" });
        else notify("Not deleted", answer.reason || "The file could not be deleted.");
      } },
  ];
}

function openDownloadManager() {
  const shown = floatingPanel("downloads");
  if (shown?.isMinimised?.()) { shown.present(); return shown; }
  if (shown) { closeFloatingPanel("downloads"); return null; }

  const panel = createFloatingPanel({
    key: "downloads", title: "Download Manager", ...windowSize("downloads"),
    modal: !asWindow("downloads"),
    onClose: stopDownloadPolling,
  });
  panel.setMaskIcon(ICON_DOWNLOADS);
  const dialog = panel.el;
  const summary = el("div", "om-dl-summary", "Reading...");
  panel.bar.querySelector(".om-float-badge").appendChild(summary);
  const barEnd = el("span", "om-dl-bar-end");
  const add = el("button", "om-btn om-go om-dl-plus");
  add.appendChild(plusMark(14));
  add.setAttribute("aria-label", "Add a download");
  liveTip(add, () => "Add a download. A URL, or a model a workflow is missing.");
  add.onclick = () => addModel(refresh);
  barEnd.appendChild(add);
  const clear = el("button", "om-btn", "Clear");
  let showing = [];
  clear.onclick = async () => {
    if (!showing.length) return;
    const count = showing.length;
    const go = await chooseAction(`Clear ${tab.title}?`, "",
      [{ key: "go", label: `Remove ${count} entr${count === 1 ? "y" : "ies"}`, primary: true }],
      { wide: true,
        facts: [
          ["Tab", `${view.title} / ${tab.title}`],
          ["Entries", String(count)],
          ["Files on disk", "Not touched"],
        ] });
    if (!go) return;
    await dlPost("/downloads/action", { action: "remove-many", ids: showing.map((row) => row.id) });
    refresh();
  };
  barEnd.appendChild(clear);

  let view = DL_VIEWS.find((one) => one.key === dlRecall(DL_VIEW_KEY, "")) || DL_VIEWS[0];
  let tab = view.tabs.find((one) => one.key === dlRecall(`${DL_VIEW_KEY}-${view.key}`, "")) || view.tabs[0];

  const viewBar = el("div", "om-dl-views");
  const tabBar = el("div", "om-dl-tabs");
  panel.body.appendChild(viewBar);
  panel.body.appendChild(tabBar);

  const body = el("div", "om-dl-body");
  const list = el("div", "om-dl-list");
  body.appendChild(list);
  panel.body.appendChild(body);

  const badges = new Map();

  const buildViewBar = () => {
    const buttons = DL_VIEWS.map((one) => {
      const button = el("button", `om-dl-view${one === view ? " om-dl-on" : ""}`, one.title);
      button.onclick = () => {
        if (one === view) return;
        view = one;
        tab = view.tabs.find((each) => each.key === dlRecall(`${DL_VIEW_KEY}-${view.key}`, ""))
              || view.tabs[0];
        dlRemember(DL_VIEW_KEY, view.key);
        buildViewBar();
        buildTabBar();
        refresh();
      };
      return button;
    });
    viewBar.replaceChildren(...buttons, barEnd);
  };

  const buildTabBar = () => {
    badges.clear();
    tabBar.replaceChildren(...view.tabs.map((one) => {
      const button = el("button", `om-dl-tab${one === tab ? " om-dl-on" : ""}`);
      button.appendChild(el("span", null, one.title));
      const badge = el("span", "om-dl-tab-count", "0");
      badges.set(one.key, badge);
      button.appendChild(badge);
      button.onclick = () => {
        if (one === tab) return;
        tab = one;
        dlRemember(`${DL_VIEW_KEY}-${view.key}`, tab.key);
        buildTabBar();
        refresh();
      };
      return button;
    }));
  };

  buildViewBar();
  buildTabBar();

  const refresh = async () => {
    if (!dialog.isConnected || panel.isMinimised?.()) { stopDownloadPolling(); return; }
    let state;
    try {
      state = await (await api.fetchApi(`${API}/downloads`)).json();
    } catch {
      summary.textContent = "The download list could not be read";
      return;
    }
    if (!dialog.isConnected || panel.isMinimised?.()) { stopDownloadPolling(); return; }
    const rows = state.downloads || [];
    noteFinishedDownloads(rows);
    const busy = (state.running || 0) + (state.queued || 0);
    summary.textContent = busy
      ? `${state.running} running, ${state.queued} queued`
      : (rows.length ? `${rows.length} download${rows.length === 1 ? "" : "s"}` : "");
    for (const one of view.tabs) {
      const badge = badges.get(one.key);
      if (badge) badge.textContent = String(rows.filter(one.holds).length);
    }
    const mine = rows.filter(tab.holds);
    showing = mine;
    clear.textContent = `Clear ${tab.title}`;
    clear.title = `Removes the ${tab.title} entries from this list. Files on disk are left alone.`;
    clear.disabled = tab.clearable === false || !mine.length;
    clear.style.display = tab.clearable === false ? "none" : "";
    if (mine.length) {
      list.replaceChildren(...mine.map((row) => buildDownloadRow(row, refresh)));
    } else {
      const box = el("div", "om-empty");
      box.appendChild(el("div", "om-empty-title", tab.empty));
      list.replaceChildren(box);
    }
    clearTimeout(dlTimer);
    const settling = rows.some((row) => row.status === "pausing");
    dlTimer = setTimeout(refresh, busy || settling ? DL_POLL_BUSY : DL_POLL_IDLE);
  };

  panel.el.addEventListener("om-win:minimise", stopDownloadPolling);
  panel.el.addEventListener("om-win:restore", () => refresh());
  refresh();
  return panel;
}

let dlDoneSeen = null;

function noteFinishedDownloads(rows) {
  const done = rows.filter((row) => row.status === "done").map((row) => row.id);
  const fresh = dlDoneSeen ? done.filter((id) => !dlDoneSeen.has(id)) : [];
  dlDoneSeen = new Set(done);
  if (fresh.length) window.dispatchEvent(new CustomEvent("om-downloads-finished"));
}

function stopDownloadPolling() {
  clearTimeout(dlTimer);
  dlTimer = 0;
}


async function addModel(refresh) {
  const how = await chooseAction("Add a download", "",
    [{ key: "workflow", label: "From a workflow", primary: true,
       hint: "Lists the models an open workflow names" },
     { key: "url", label: "From a URL", hint: "Paste a Hugging Face or GitHub link" }]);
  if (how === "url") await addModelByUrl(refresh);
  if (how === "workflow") await addModelsFromWorkflow(refresh);
}

async function addModelByUrl(refresh) {
  const { folders } = await modelFolders();
  const backdrop = el("div", "om-backdrop");
  const box = el("div", "om-note om-dl-add");
  box.appendChild(el("div", "om-note-title", "Add by URL"));

  const field = (label, node) => {
    const wrap = el("label", "om-dl-field");
    wrap.appendChild(el("span", null, label));
    wrap.appendChild(node);
    box.appendChild(wrap);
    return node;
  };

  const url = field("URL", el("input", "om-search"));
  url.spellcheck = false;
  url.placeholder = "https://huggingface.co/account/repo/resolve/main/file.safetensors";
  const name = field("Save as", el("input", "om-search"));
  name.spellcheck = false;
  const folder = field("Folder", el("select", "om-side-select"));
  const blank = el("option", null, "Choose a folder");
  blank.value = "";
  folder.appendChild(blank);
  for (const key of folders) {
    const option = el("option", null, key);
    option.value = key;
    folder.appendChild(option);
  }
  const where = el("label", "om-dl-field om-dl-where-field");
  where.appendChild(el("span", null, "Store in"));
  where.style.display = "none";
  box.appendChild(where);
  let placeSelect = null;
  const showLocations = async () => {
    const roots = await modelRoots(folder.value);
    where.replaceChildren(el("span", null, "Store in"));
    placeSelect = null;
    if (roots.length < 2) { where.style.display = "none"; return; }
    placeSelect = rootSelect(roots);
    placeSelect.addEventListener("change", recheck);
    where.appendChild(placeSelect);
    where.style.display = "";
  };

  const idle = "Hugging Face and GitHub.";
  const note = el("div", "om-dl-note", idle);
  box.appendChild(note);

  const foot = el("div", "om-note-foot");
  const cancel = el("button", "om-btn", "Cancel");
  const ok = el("button", "om-btn om-go", "Download");
  cancel.onclick = () => backdrop.remove();
  foot.appendChild(cancel);
  foot.appendChild(ok);
  box.appendChild(foot);
  backdrop.appendChild(box);
  document.body.appendChild(backdrop);
  closeOn(backdrop);
  url.focus();

  let checked = null;
  let latest = 0;
  let debounce = 0;
  let ownName = false;
  const recheck = async () => {
    const typed = url.value.trim();
    if (!typed) {
      note.textContent = idle;
      note.className = "om-dl-note";
      checked = null;
      return;
    }
    const mine = ++latest;
    const answer = await dlPost("/models/check", {
      url: typed, name: ownName ? name.value.trim() : "", directory: folder.value,
      root: placeSelect?.value || "",
    });
    if (mine !== latest || !backdrop.isConnected) return;
    checked = answer;
    if (!ownName && answer.name) name.value = answer.name;
    if (!folder.value && answer.suggested_directory) {
      folder.value = answer.suggested_directory;
      await showLocations();
      return recheck();
    }
    const from = `From ${answer.owner}.`;
    if (answer.ok) {
      note.textContent = answer.installed ? `${from} Already on disk; downloading replaces it.` : from;
      note.className = "om-dl-note om-dl-ok";
    } else if (answer.needs_directory) {
      note.textContent = `${from} Choose the folder it belongs in.`;
      note.className = "om-dl-note";
    } else {
      note.textContent = answer.reason || "That URL cannot be downloaded.";
      note.className = "om-dl-note om-dl-bad";
    }
  };
  url.addEventListener("input", () => {
    clearTimeout(debounce);
    debounce = setTimeout(recheck, 350);
  });
  name.addEventListener("input", () => { ownName = true; });
  name.addEventListener("change", recheck);
  folder.addEventListener("change", async () => { await showLocations(); recheck(); });

  ok.onclick = async () => {
    if (!url.value.trim()) { url.focus(); return; }
    if (!folder.value) {
      note.textContent = "Choose the folder it belongs in.";
      note.className = "om-dl-note om-dl-bad";
      folder.focus();
      return;
    }
    ok.disabled = true;
    clearTimeout(debounce);
    await recheck();
    ok.disabled = false;
    if (!checked?.ok) return;
    backdrop.remove();
    const model = { url: checked.url, name: checked.name, directory: folder.value,
                    owner: checked.owner, root: placeSelect?.value || "" };
    if (!(await confirmDownloadTrust(model.owner, model.name, false, formatsOf([model.name])))) {
      return;
    }
    if (!(await confirmDiskRoom([model]))) return;
    const queued = await queueModel(model, { source: "added by URL", askTrust: false });
    if (queued) { toast(`Queued ${checked.name}.`, { kind: "ok" }); refresh?.(); }
  };
}

async function addModelsFromWorkflow(refresh) {
  const choices = workflowChoices();
  if (!choices.length) {
    notify("No workflows open");
    return;
  }

  const backdrop = el("div", "om-backdrop");
  const dialog = el("div", "om-dialog om-dl-pick");
  const close = el("button", "om-x", "×");
  close.title = "Close";
  close.onclick = () => backdrop.remove();
  dialog.appendChild(close);

  const head = el("div", "om-head");
  head.appendChild(el("div", "om-title", "Models in a workflow"));
  const picker = el("select", "om-side-select om-dl-wf");
  choices.forEach((choice, index) => {
    const option = el("option", null, choice.active ? `${choice.label} (current)` : choice.label);
    option.value = String(index);
    picker.appendChild(option);
  });
  const activeIndex = choices.findIndex((choice) => choice.active);
  picker.value = String(activeIndex >= 0 ? activeIndex : 0);
  head.appendChild(picker);
  dialog.appendChild(head);

  const body = el("div", "om-body om-dl-body");
  const list = el("div", "om-dl-models");
  body.appendChild(list);
  dialog.appendChild(body);

  const foot = el("div", "om-dl-pickfoot");
  const summary = el("span", "om-dl-summary", "");
  const download = el("button", "om-btn om-go", "Download selected");
  foot.appendChild(summary);
  foot.appendChild(download);
  dialog.appendChild(foot);

  backdrop.appendChild(dialog);
  document.body.appendChild(backdrop);
  closeOn(backdrop);

  let rows = [];
  const boxes = new Map();
  const chosen = new Map();

  const selected = () => [...boxes.entries()]
    .filter(([, box]) => box.checked)
    .map(([index]) => ({ ...rows[index], root: chosen.get(index) || "" }));
  const updateSummary = () => {
    const picked = selected().length;
    const have = rows.filter((row) => row.installed).length;
    summary.textContent = rows.length
      ? `${picked} of ${rows.length} selected` + (have ? ` · ${have} already on disk` : "")
      : "";
    download.disabled = picked === 0;
  };

  const load = async () => {
    list.replaceChildren(el("div", "om-empty", "Reading the workflow..."));
    boxes.clear();
    rows = [];
    const choice = choices[Number(picker.value)] || choices[0];
    const doc = await workflowDocument(choice.workflow, choice.active);
    if (!backdrop.isConnected) return;
    if (!doc) {
      list.replaceChildren(el("div", "om-empty", "That workflow could not be read."));
      updateSummary();
      return;
    }
    let answer;
    try {
      answer = await dlPost("/models/in-workflow", { workflow: doc });
    } catch {
      list.replaceChildren(el("div", "om-empty", "The workflow could not be scanned."));
      updateSummary();
      return;
    }
    if (!backdrop.isConnected) return;
    rows = answer.models || [];
    if (!rows.length) {
      list.replaceChildren(el("div", "om-empty", "This workflow does not name any model downloads."));
    } else {
      const places = await Promise.all(rows.map((model) => modelRoots(model.directory)));
      if (!backdrop.isConnected) return;
      list.replaceChildren(...rows.map((model, index) =>
        buildModelRow(model, index, boxes, updateSummary, places[index], chosen)));
    }
    updateSummary();
  };

  picker.onchange = load;

  download.onclick = async () => {
    const picked = selected();
    backdrop.remove();
    const perOwner = new Map();
    for (const model of picked) {
      if (!perOwner.has(model.owner)) perOwner.set(model.owner, []);
      perOwner.get(model.owner).push(model.name);
    }
    const answered = new Map();
    const ready = [];
    for (const model of picked) {
      if (!answered.has(model.owner)) {
        const names = perOwner.get(model.owner) || [model.name];
        answered.set(model.owner, await confirmDownloadTrust(
          model.owner,
          names.length === 1 ? `${model.name} in this workflow`
                             : `${names.length} models in this workflow`,
          names.length !== 1,
          formatsOf(names)));
      }
      if (!answered.get(model.owner)) continue;
      ready.push({ ...model, overwrite: !!model.installed, root: model.root || "" });
    }
    if (!ready.length || !(await confirmDiskRoom(ready))) { refresh?.(); return; }
    let queued = 0;
    for (const model of ready) {
      if (await queueModel(model, { source: "from a workflow", askTrust: false })) queued += 1;
    }
    if (queued) toast(`Queued ${queued} model${queued === 1 ? "" : "s"}.`, { kind: "ok" });
    refresh?.();
  };

  load();
}

function dirOf(path) {
  const value = String(path || "");
  const cut = Math.max(value.lastIndexOf("\\"), value.lastIndexOf("/"));
  return cut > 0 ? value.slice(0, cut) : "";
}

function buildModelRow(model, index, boxes, onChange, roots, chosen) {
  const row = el("label",
    `om-dl-model${model.installed ? " om-dl-have" : ""}${model.allowed ? "" : " om-dl-refused"}`);
  const box = el("input", "om-dl-check");
  box.type = "checkbox";
  box.disabled = !model.allowed;
  box.checked = model.allowed && !model.installed;
  box.onchange = onChange;
  boxes.set(index, box);
  row.appendChild(box);

  const text = el("div", "om-dl-modeltext");
  text.appendChild(el("div", "om-dl-name", model.name || model.url));
  const meta = el("div", "om-dl-where");
  meta.appendChild(el("span", null, model.directory || "?"));
  if (model.owner) meta.appendChild(el("span", "om-dl-owner", model.owner));
  if (model.node) meta.appendChild(el("span", "om-dl-src", model.node));
  text.appendChild(meta);
  if (!model.allowed) {
    text.appendChild(el("div", "om-dl-note om-dl-bad", model.reason || "Not allowed."));
  } else if (model.installed) {
    const have = el("div", "om-dl-note", "On disk. Select to replace.");
    have.title = model.installed;
    text.appendChild(have);
  }
  if (model.allowed && (roots || []).length > 1) {
    const place = el("div", "om-dl-place");
    place.appendChild(el("span", null, "Store in"));
    const select = rootSelect(roots, model.installed ? dirOf(model.installed) : "");
    select.onclick = (event) => event.preventDefault();
    select.onchange = () => chosen.set(index, select.value);
    chosen.set(index, select.value);
    place.appendChild(select);
    text.appendChild(place);
  }
  row.appendChild(text);
  return row;
}

function nodeModels(node) {
  const declared = node?.properties?.models;
  return Array.isArray(declared) ? declared : [];
}

async function addModelUrlToNode(node) {
  const { folders } = await modelFolders();
  if (!folders.length) {
    notify("No model folders", "ComfyUI did not report any model folders to save into.");
    return;
  }
  const typed = await askText("Model URL for this node", "", "Check");
  if (!typed) return;
  const answer = await dlPost("/models/check", { url: typed, directory: "" });
  if (!answer.needs_directory) {
    notify("Not added", answer.reason || "That is not a URL this can use.");
    return;
  }
  const folder = await pickFolder(folders, answer.name);
  if (!folder) return;
  const confirmed = await dlPost("/models/check", {
    url: answer.url, name: answer.name, directory: folder,
  });
  if (!confirmed.ok) {
    notify("Not added", confirmed.reason || "That URL cannot be used.");
    return;
  }
  node.properties = node.properties || {};
  const models = nodeModels(node).filter((item) => item?.url !== confirmed.url);
  models.push({ name: confirmed.name, url: confirmed.url, directory: folder });
  node.properties.models = models;
  app.graph.setDirtyCanvas(true, true);
  toast(`${confirmed.name} added to this node.`, { kind: "ok" });
}

function pickFolder(folders, name) {
  return new Promise((resolve) => {
    const backdrop = el("div", "om-backdrop");
    const box = el("div", "om-note");
    box.appendChild(el("div", "om-note-title", "Which folder?"));
    box.appendChild(factList([["Model", name || "This model"],
                              ["Loaded from", "A ComfyUI model folder"]]));
    const select = el("select", "om-side-select");
    for (const key of folders) {
      const option = el("option", null, key);
      option.value = key;
      select.appendChild(option);
    }
    if (folders.includes("checkpoints")) select.value = "checkpoints";
    box.appendChild(select);
    const foot = el("div", "om-note-foot");
    const cancel = el("button", "om-btn", "Cancel");
    const ok = el("button", "om-btn om-go", "Use this folder");
    cancel.onclick = () => { backdrop.remove(); resolve(""); };
    ok.onclick = () => { const value = select.value; backdrop.remove(); resolve(value); };
    foot.appendChild(cancel);
    foot.appendChild(ok);
    box.appendChild(foot);
    backdrop.appendChild(box);
    document.body.appendChild(backdrop);
    closeOn(backdrop, () => { backdrop.remove(); resolve(""); });
  });
}

async function downloadNodeModels(node) {
  const models = nodeModels(node);
  if (!models.length) return;
  const answered = new Map();
  const ready = [];
  for (const declared of models) {
    const answer = await dlPost("/models/check", {
      url: declared.url || "", name: declared.name || "", directory: declared.directory || "",
    });
    if (!answer.ok) {
      notify(`Skipped ${declared.name || declared.url}`, answer.reason || "Not allowed.");
      continue;
    }
    if (!answered.has(answer.owner)) {
      answered.set(answer.owner, await confirmDownloadTrust(
        answer.owner, answer.name, false, formatsOf([answer.name])));
    }
    if (!answered.get(answer.owner)) continue;
    ready.push({
      url: answer.url, name: answer.name, directory: declared.directory, owner: answer.owner,
      hash: declared.hash, hash_type: declared.hash_type, overwrite: !!answer.installed,
    });
  }
  if (!ready.length || !(await confirmDiskRoom(ready))) return;
  let queued = 0;
  for (const model of ready) {
    if (await queueModel(model, { source: `node ${node.type || ""}`.trim(), askTrust: false })) {
      queued += 1;
    }
  }
  if (queued) {
    toast(`Queued ${queued} model${queued === 1 ? "" : "s"}.`, { kind: "ok" });
    if (!floatingPanel("downloads")) openDownloadManager();
  }
}

export { dlPost, bytesText, formatsOf, confirmDownloadTrust, confirmDiskRoom, queueModel, dlRemember, dlRecall, openDownloadManager, dirOf, nodeModels, addModelUrlToNode, downloadNodeModels, modelRoots, preferredRoot };
