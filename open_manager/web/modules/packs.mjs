import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import { API, STATUS_COLOUR, LOADING_GRACE } from "./base.mjs";
import { el, safeUrl, openUrl, badge, closeOn, stateRow, notify, confirmAction, tabbedPanel, panel, collapsible, countNote } from "./ui.mjs";
import { compareVersions, versionSwitch, makeInstallControl, installedPack, packName, versionFacts, installedMenu, installFromRepo, uninstall, repoOwnerName, makeStarButton, tagChip } from "./installs.mjs";
import { asWindow, windowSize, floatPanels, createFloatingPanel, floatingPanel } from "./windows.mjs";
import { loadingBlock, renderMarkdownInto, paintPackBody } from "./markdown.mjs";
import { panelSetting } from "./settings.mjs";
import { galleryUrl, buildGallery } from "./gallery.mjs";
import { fillThemeTitles, addPackTheme, loadExampleWorkflow } from "./pack-extras.mjs";
import { repoButton, registryButton } from "./results.mjs";
import { installedText } from "./installed.mjs";
import { packQuery } from "./registry.mjs";
import { nodeDragFrom } from "./node-drag.mjs";

function packRoot(node) {
  return node?.closest(".om-dialog, .om-float") || null;
}

async function openPack(packId) {
  const already = floatingPanel(`pack:${packId}`);
  if (already) { already.present(); return already; }
  const showing = document.querySelector(".om-backdrop[data-om-pack]");
  if (showing?.dataset.omPack === packId) return;

  const backdrop = el("div", "om-backdrop");
  backdrop.dataset.omPack = packId;
  const dialog = el("div", "om-dialog");
  dialog.appendChild(el("div", "om-body", `Reading ${packId} from the registry...`));
  backdrop.appendChild(dialog);
  closeOn(backdrop);

  let waiting = null;
  const showWaiting = () => {
    if (waiting !== "shown") {
      for (const other of document.querySelectorAll(".om-backdrop[data-om-pack]")) other.remove();
      document.body.appendChild(backdrop);
    }
    waiting = "shown";
  };
  const timer = setTimeout(() => { if (waiting === null) showWaiting(); }, LOADING_GRACE);
  const doneWaiting = () => { clearTimeout(timer); if (waiting === null) waiting = "skipped"; };

  let data;
  try {
    const answer = await api.fetchApi(
      `${API}/pack/${encodeURIComponent(packId)}?${packQuery()}`);
    data = await answer.json();
    if (!answer.ok) throw new Error(registryReason(data, answer.status));
    doneWaiting();
  } catch (error) {
    doneWaiting();
    const local = await localPack(packId);
    if (local) {
      if (asWindow("packs")) {
        backdrop.remove();
        showLocalPackWindow(packId, local);
      } else {
        dialog.replaceChildren();
        const close = el("button", "om-x", "×");
        close.title = "Close";
        close.onclick = () => backdrop.remove();
        dialog.appendChild(close);
        buildLocalPackBody(dialog, local);
        showWaiting();
      }
      return;
    }
    dialog.replaceChildren(packProblem(`Could not read ${packId}`, error, backdrop));
    showWaiting();
    return;
  }

  const { pack, resolution, versions } = data;
  dialog.replaceChildren();

  const close = el("button", "om-x", "×");
  close.title = "Close";
  close.onclick = () => backdrop.remove();
  dialog.appendChild(close);

  if (asWindow("packs")) {
    backdrop.remove();
    showPackWindow(packId, { pack, resolution, versions });
    return;
  }

  try {
    buildPackBody(dialog, { pack, resolution, versions });
  } catch (error) {
    dialog.replaceChildren(close, packProblem(`Could not show ${packId}`, error, backdrop));
  }
  showWaiting();
}

function showPackWindow(packId, data) {
  const panel = createFloatingPanel({
    key: `pack:${packId}`,
    title: data.pack?.name || packId,
    ...windowSize("pack"),
    centred: true,
  });
  panel.setIcon(data.pack?.icon || "");
  if (panel.body.childElementCount) return panel;
  try {
    buildPackBody(panel.body, data);
  } catch (error) {
    panel.body.replaceChildren(
      packProblem(`Could not show ${packId}`, error, { remove: panel.destroy }));
  }
  return panel;
}

async function localPack(packId) {
  try {
    const answer = await api.fetchApi(`${API}/local/${encodeURIComponent(packId)}`);
    const found = await answer.json();
    return found?.ok ? found : null;
  } catch {
    return null;
  }
}

function showLocalPackWindow(packId, info) {
  const panel = createFloatingPanel({
    key: `pack:${packId}`,
    title: info.pyproject?.display_name || info.pyproject?.name || packId,
    ...windowSize("pack"),
    centred: true,
  });
  panel.setIcon(info.pyproject?.icon || "");
  if (panel.body.childElementCount) return panel;
  buildLocalPackBody(panel.body, info);
  return panel;
}

function remoteToUrl(remote) {
  const text = String(remote || "").trim();
  if (!text) return "";
  const ssh = text.match(/^(?:ssh:\/\/)?git@([^:/]+)[:/](.+?)(?:\.git)?$/);
  if (ssh) return `https://${ssh[1]}/${ssh[2]}`;
  return safeUrl(text.replace(/\.git$/, "")) || "";
}

function buildLocalPackBody(container, info) {
  const project = info.pyproject || {};
  const git = info.git || {};
  const body = el("div", "om-body");

  const hero = el("div", "om-hero");
  const infoBox = el("div", "om-hero-info");
  infoBox.appendChild(el("div", "om-title", project.display_name || project.name || info.id));
  if (project.description) {
    infoBox.appendChild(el("div", "om-sub", project.description));
  }
  infoBox.appendChild(el("div", "om-sub", info.path));

  const actions = el("div", "om-actions om-hero-actions");
  const remote = remoteToUrl(git.remote) || safeUrl(project.urls?.repository)
    || safeUrl(project.urls?.source) || safeUrl(project.urls?.homepage);
  if (remote) {
    const button = repoButton(remote, `Open ${remote}`);
    if (button) actions.appendChild(button);
  }

  const chips = el("div", "om-chips");
  const chip = (label, value) => {
    if (!value) return;
    const node = el("span", "om-chip");
    node.appendChild(el("b", null, label));
    node.appendChild(document.createTextNode(" " + value));
    chips.appendChild(node);
  };
  chip("version", info.version && info.version !== "present" ? info.version : project.version);
  chip("licence", project.license);
  chip("python", project.requires_python);
  chip("publisher", project.publisher);
  chip("directory", info.dir);
  if (git.branch) chip("branch", git.branch + (git.commit ? ` @ ${git.commit.slice(0, 7)}` : ""));
  if (info.installed_at) {
    chip("installed", new Date(info.installed_at * 1000).toISOString().slice(0, 10));
  }
  if (info.disabled) chip("state", "switched off");
  actions.appendChild(chips);
  infoBox.appendChild(actions);
  hero.appendChild(infoBox);
  body.appendChild(hero);

  const notice = el("div", "om-notice");
  notice.appendChild(el("b", null, "Not in the Comfy Registry"));
  notice.appendChild(document.createTextNode(
    " Read from the files in this directory. No published versions, registry status or "
    + "findings."));
  body.appendChild(notice);

  if (info.classes?.length) {
    const nodes = panel("Nodes", countNote(info.classes.length, "node"), { open: false });
    const list = el("div", "om-chg");
    for (const name of info.classes) {
      const item = el("div", "om-nodelist-item");
      item.appendChild(el("div", "om-node-name", name));
      list.appendChild(item);
    }
    nodes.body.appendChild(list);
    body.appendChild(nodes);
  } else {
    const nodes = panel("Nodes", "none registered", { open: false });
    nodes.body.appendChild(el("div", "om-side-status",
      info.disabled
        ? "This pack is switched off."
        : "ComfyUI lists no nodes from this pack."));
    body.appendChild(nodes);
  }

  if (info.requirements?.length) {
    const reqs = panel("Requirements", countNote(info.requirements.length, "requirement"),
      { open: false });
    const text = el("div", "om-chg-text");
    text.textContent = info.requirements.join("\n");
    reqs.body.appendChild(text);
    body.appendChild(reqs);
  }

  if (info.readme?.text) {
    const readme = el("div", "om-readme");
    readme.appendChild(loadingBlock("Reading the README"));
    body.appendChild(readme);
    const view = el("div", "om-readme-body");
    renderMarkdownInto(view, info.readme.text, { repository: remote || "" }, git.branch || "",
      "").then(() => readme.replaceChildren(view)).catch(() => {
        readme.replaceChildren(el("div", "om-side-status", "The README could not be rendered."));
      });
  }

  container.appendChild(body);
}

function packProblem(title, error, backdrop) {
  const box = el("div", "om-body");
  box.appendChild(el("div", "om-empty-title", title));
  box.appendChild(el("div", "om-side-status", String(error?.message || error)));
  const foot = el("div", "om-note-foot");
  const close = el("button", "om-btn", "Close");
  close.onclick = () => backdrop.remove();
  foot.appendChild(close);
  box.appendChild(foot);
  return box;
}

function registryReason(data, status) {
  const detail = data?.detail ?? data?.reason ?? "";
  if (typeof detail === "string" && detail.trim().startsWith("{")) {
    try {
      const inner = JSON.parse(detail);
      const said = inner.message || inner.error;
      if (said) return `the registry says: ${said}`;
    } catch {
    }
  }
  if (data?.status === 404 || status === 404) return "the registry has no entry for it";
  return String(detail || `HTTP ${status}`);
}

function buildPackBody(dialog, { pack, resolution, versions }) {

  const hero = el("div", "om-hero");
  if (pack.banner) {
    const banner = el("img", "om-banner");
    banner.src = pack.banner;
    banner.onerror = () => { banner.remove(); hero.classList.add("om-hero-bare"); };
    hero.appendChild(banner);
  } else {
    hero.classList.add("om-hero-bare");
  }

  const info = el("div", "om-hero-info");
  const titleRow = el("div", "om-title-row");
  if (pack.icon) {
    const icon = el("img", "om-icon");
    icon.src = pack.icon;
    icon.onerror = () => icon.remove();
    titleRow.appendChild(icon);
  }
  const titles = el("div");
  titles.appendChild(packName(pack.name || pack.id, "om-title"));
  titles.appendChild(el("div", "om-sub", pack.description || ""));
  titles.appendChild(el("div", "om-sub", pack.id));
  titleRow.appendChild(titles);
  info.appendChild(titleRow);

  const stats = el("div", "om-stats");
  for (const [label, value] of [
    ["downloads", pack.downloads.toLocaleString()],
    ["versions", String(versions.length)],
  ]) {
    const stat = el("div", "om-stat");
    stat.appendChild(el("b", null, value));
    stat.appendChild(el("span", null, label));
    stats.appendChild(stat);
  }
  info.appendChild(stats);

  const actions = el("div", "om-actions om-hero-actions");
  const registry = registryButton(pack.id);
  if (registry) actions.appendChild(registry);
  if (pack.repository) {
    const repo = repoButton(pack.repository, `Open ${pack.repository}`);
    if (repo) actions.appendChild(repo);
    if (repoOwnerName(pack.repository)) actions.appendChild(makeStarButton(pack.repository, pack.stars));
  }
  const chips = el("div", "om-chips");
  const chip = (label, value) => {
    if (!value) return;
    const node = el("span", "om-chip");
    node.appendChild(el("b", null, label));
    node.appendChild(document.createTextNode(" " + value));
    chips.appendChild(node);
  };
  const statusChip = (label, value, status, hint = "") => {
    if (!value) return;
    const node = el("span", "om-chip");
    node.appendChild(el("b", null, label));
    node.appendChild(document.createTextNode(" " + value));
    const dot = el("span", "om-dot");
    dot.style.background = STATUS_COLOUR[status] || STATUS_COLOUR.unknown;
    dot.title = status;
    node.appendChild(dot);
    if (hint) node.title = hint;
    chips.appendChild(node);
  };
  statusChip("publisher", pack.publisher_name || pack.publisher, pack.publisher_status,
    pack.publisher_name && pack.publisher_name !== pack.publisher
      ? `Publisher account: ${pack.publisher}`
      : "");
  statusChip("registry", pack.status, pack.status);
  if (pack.license) {
    const node = el("span", "om-chip");
    node.appendChild(el("b", null, "license"));
    node.appendChild(document.createTextNode(" " + pack.license));
    const dot = el("span", "om-dot");
    dot.style.background = pack.license_color || "var(--om-muted)";
    dot.title = pack.license_tier || "unknown";
    node.appendChild(dot);
    chips.appendChild(node);
  }
  chip("category", pack.category);
  const members = pack.publisher_members || [];
  chip("author", pack.author || members.join(", "));
  const declaring = versions.find((entry) => entry.compatibility?.declared);
  if (declaring) {
    const node = el("span", "om-chip");
    node.appendChild(el("b", null, "requires"));
    node.appendChild(document.createTextNode(" "
      + declaring.compatibility.notes.map((n) => `${n.label} ${n.declared}`).join(" · ")));
    if (declaring.compatibility.state === "differs") node.classList.add("om-chip-differs");
    node.title = `Declared by version ${declaring.version}.`;
    chips.appendChild(node);
  }
  chip("first published", (pack.created_at || "").slice(0, 10));
  actions.appendChild(chips);
  info.appendChild(actions);

  if (pack.tags.length) {
    const tags = el("div", "om-tags");
    for (const tag of pack.tags) tags.appendChild(tagChip(tag));
    info.appendChild(tags);
  }

  hero.appendChild(info);

  const body = el("div", "om-body");
  body.appendChild(hero);
  body.appendChild(el("div", "om-release-slot"));

  if (resolution.newest_is_hidden) {
    const notice = el("div", "om-notice");
    notice.appendChild(el("b", null,
      `Registry latest ${resolution.registry_advertises || "none"} · newest published ${resolution.newest}`));
    body.appendChild(notice);
  }

  const versionsBox = el("div", "om-versions");
  versionsBox._installedVersion = pack.installed_version || "";
  for (const entry of versions) {
    const row = el("div", "om-row");
    row.title = versionFacts(entry);
    if (entry.deprecated) row.classList.add("om-row-deprecated");
    const number = el("div", "om-ver", entry.version);
    if (entry.compatibility?.state === "differs") {
      const flag = el("span", "om-ver-flag", "!");
      flag.title = entry.compatibility.notes
        .filter((n) => n.state === "differs")
        .map((n) => `Declares ${n.label} ${n.declared}; this install reports ${n.yours}.`)
        .join("\n")
        + "\nIt installs either way.";
      number.appendChild(flag);
    }
    row.appendChild(number);
    const marks = el("div", "om-marks");
    const mark = badge(entry.status);
    mark.dataset.version = entry.version;
    mark.title = `Status: ${entry.status}`;
    marks.appendChild(mark);
    row.appendChild(marks);
    row.appendChild(el("div", "om-why", (entry.created_at || "").slice(0, 10)));

    const worst = entry.assessment?.findings?.[0];
    row.appendChild(el("div", "om-why", worst ? worst.title : "no findings"));

    if (entry.installable === false) {
      const blocked = el("span", "om-blocked", "Blocked");
      blocked.title = entry.blocked_reason || "Blocked by policy";
      row.appendChild(blocked);
    } else {
      const isInstalledRow = Boolean(pack.installed_version)
        && entry.version === pack.installed_version;
      const onDisk = isInstalledRow ? installedPack(pack.id) : null;
      let control;
      control = makeInstallControl({
        packId: pack.id,
        entry: { ...entry, name: pack.name || pack.id },
        rowsRoot: versionsBox,
        withMenu: Boolean(onDisk),
        items: onDisk
          ? installedMenu(onDisk, { ...entry, name: pack.name || pack.id },
                          () => control, versionsBox)
          : undefined,
      });
      if (isInstalledRow) {
        control.setInstalled();
      } else {
        const change = versionSwitch(pack.installed_version || "", entry.version);
        control.setInstall(change
          ? { downgrade: "Downgrade", upgrade: "Upgrade", reinstall: "Reinstall" }[change.direction]
          : "");
      }
      row.appendChild(control.el);
    }
    versionsBox.appendChild(row);
  }
  const localVersion = pack.installed_version || installedPack(pack.id)?.version || "";
  if (localVersion && !versions.some((one) => one.version === localVersion)) {
    const record = installedPack(pack.id);
    const row = el("div", "om-row om-row-local");
    row.title = `${localVersion} is installed here and not published on the registry.`;
    row.appendChild(el("div", "om-ver", localVersion));
    const marks = el("div", "om-marks");
    const chip = el("span", "om-badge om-badge-local", "local");
    chip.title = "Installed here, and not a version the registry publishes.";
    marks.appendChild(chip);
    row.appendChild(marks);
    row.appendChild(el("div", "om-why", record?.installed_at
      ? installedText(new Date(Number(record.installed_at) * 1000))
      : "on disk"));
    row.appendChild(el("div", "om-why",
      record?.from_git ? "from a repository" : "not assessed"));
    let control;
    control = makeInstallControl({
      packId: pack.id,
      entry: { version: localVersion, status: "active", name: pack.name || pack.id },
      rowsRoot: versionsBox,
      withMenu: Boolean(record),
      items: record
        ? installedMenu(record, { version: localVersion, name: pack.name || pack.id },
                        () => control, versionsBox)
        : undefined,
    });
    control.setInstalled();
    row.appendChild(control.el);
    versionsBox.insertBefore(row, versionsBox.firstChild);
  }
  const versionNote = [`${versions.length} published`];
  if (pack.installed_version) {
    versionNote.push(`installed ${pack.installed_version}`
      + (versions.some((one) => one.version === pack.installed_version) ? "" : " (local)"));
  }
  else if (resolution.newest) versionNote.push(`newest ${resolution.newest}`);
  const tabs = tabbedPanel({ remember: "om-pack-tab" });
  body.appendChild(tabs.root);
  tabs.add({
    id: "versions",
    title: "Versions",
    note: versionNote.join(" · "),
    order: 10,
    pane: versionsBox,
  });
  attachStatusReasons(pack.id, versionsBox, versions);

  const shownVersion = pack.installed_version
    || (installedPack(pack.id)?.version || (installedPack(pack.id) ? "installed" : ""))
    || resolution.newest || versions[0]?.version;
  if (shownVersion) {
    const nodesPane = el("div", "om-tabpane");

    let atVersion = shownVersion;
    let held = [];
    let source = "";
    let term = "";
    let group = "";
    let installedHere = "";

    const pickable = versions.map((entry) => entry.version);
    const onDisk = installedPack(pack.id);
    const mineVersion = pack.installed_version || onDisk?.version || "";
    const picker = el("select", "om-side-select om-nodes-at");
    const option = (version, label) => {
      const made = el("option", null, label || version);
      made.value = version;
      if (version === shownVersion) made.selected = true;
      return made;
    };
    for (const version of pickable) {
      picker.appendChild(option(version,
        version === mineVersion ? `${version} (Installed)` : version));
    }
    if (mineVersion && !pickable.includes(mineVersion)) {
      const mine = option(mineVersion, `${mineVersion} (Installed)`);
      const after = [...picker.options]
        .find((one) => compareVersions(mineVersion, one.value) > 0);
      picker.insertBefore(mine, after || null);
    } else if (!mineVersion && onDisk) {
      picker.insertBefore(option("installed", "Installed copy"), picker.firstChild);
    }
    picker.title = "Which version's node list to show";
    picker.onclick = (event) => event.stopPropagation();

    const finder = el("input", "om-search om-nodes-find");
    finder.type = "search";
    finder.placeholder = "Filter by name, category or description";
    finder.spellcheck = false;
    finder.onclick = (event) => event.stopPropagation();
    const groups = el("select", "om-side-select om-nodes-group");
    groups.onclick = (event) => event.stopPropagation();
    groups.title = "Show one category only";

    const bar = el("div", "om-nodes-bar");
    bar.appendChild(el("span", "om-ref-label", "version"));
    bar.appendChild(picker);
    bar.appendChild(finder);
    bar.appendChild(groups);
    const nodesBar = () => bar;

    let loaded = false;
    const fill = async (wantIndex = false) => {
      if (loaded && !wantIndex) return;
      loaded = true;
      nodesPane.replaceChildren(loadingBlock("Reading the node list"));
      let data;
      try {
        const query = new URLSearchParams({ version: atVersion, repo: pack.repository || "" });
        if (wantIndex) query.set("index", "1");
        const answer = await api.fetchApi(
          `${API}/comfy-nodes/${encodeURIComponent(pack.id)}?${query}`);
        data = await answer.json();
        if (!data.ok) throw new Error(data.reason || `HTTP ${answer.status}`);
      } catch (error) {
        loaded = false;
        nodesPane.replaceChildren(nodesBar(), el("div", "om-side-status",
          `The node list could not be read: ${error.message}`));
        return;
      }
      if (!data.known) {
        const empty = el("div", "om-nodelist");
        empty.appendChild(el("div", "om-side-status",
          installedHere && installedHere !== atVersion
            ? `No node list published for ${atVersion}. Version ${installedHere} is installed here.`
            : `No node list published for ${atVersion}.`));
        if (data.indexable) {
          const ask = el("button", "om-btn", "Look in the community index");
          ask.title = "Class names the repository registers, tied to no version.";
          ask.onclick = () => fill(true);
          const row = el("div", "om-actions");
          row.appendChild(ask);
          empty.appendChild(row);
        }
        nodesPane.replaceChildren(nodesBar(), empty);
        nodesTab.note("no list");
        return;
      }
      held = data.nodes;
      source = data.source || "";
      installedHere = data.installed || "";
      const seen = [...new Set(held.map((one) => one.category || "").filter(Boolean))].sort();
      groups.replaceChildren(el("option", null, "Every category"));
      groups.firstChild.value = "";
      for (const name of seen) {
        const option = el("option", null, name);
        option.value = name;
        groups.appendChild(option);
      }
      groups.style.display = seen.length > 1 ? "" : "none";
      group = seen.includes(group) ? group : "";
      groups.value = group;
      nodesTab.note(`${countNote(held.length, "node")}`
        + (source === "registry" ? ` in ${atVersion}`
          : source === "install"
            ? (atVersion === "installed" ? " in the installed copy" : ` in ${atVersion}, as installed`)
            : " from the index, no version"));
      render();
    };

    const matches = (one) => {
      if (group && (one.category || "") !== group) return false;
      if (!term) return true;
      const hay = (`${one.name} ${one.display_name || ""} ${one.category || ""} `
        + `${one.description || ""}`).toLowerCase();
      return term.split(/\s+/).every((word) => hay.includes(word));
    };

    const render = () => {
      const list = el("div", "om-nodelist");
      if (source && source !== "registry") {
        const from = el("div", "om-side-status om-nodelist-from",
          source === "install"
            ? (atVersion === "installed"
              ? "From the installed copy, which states no version."
              : `From the installed copy. The registry publishes no list for ${atVersion}.`)
            : `From the community index: the pack as last indexed, not ${atVersion}.`);
        list.appendChild(from);
      }
      const shown = held.filter(matches);
      if (!shown.length) {
        list.appendChild(el("div", "om-side-status",
          `Nothing matches${term ? ` "${finder.value.trim()}"` : ""}`
          + `${group ? ` in ${group}` : ""}. ${held.length} in the list.`));
        nodesPane.replaceChildren(nodesBar(), list);
        return;
      }
      for (const one of shown) {
        const item = el("div", "om-nodelist-item");
        const head = el("div", "om-chg-head");
        head.appendChild(el("div", "om-node-name", one.display_name || one.name));
        if (one.display_name && one.display_name !== one.name) {
          head.appendChild(el("div", "om-why", one.name));
        }
        if (one.deprecated) head.appendChild(el("span", "om-chg-here", "deprecated"));
        if (one.experimental) head.appendChild(el("span", "om-chg-here", "experimental"));
        if (one.category) head.appendChild(el("div", "om-why", one.category));
        item.appendChild(head);
        if (one.description) {
          const note = el("div", "om-chg-text");
          note.textContent = one.description;
          item.appendChild(note);
        }
        const ports = [];
        const inputs = one.inputs || {};
        if (inputs.required) ports.push(countNote(inputs.required, "required input"));
        if (inputs.optional) ports.push(`${inputs.optional} optional`);
        if (one.outputs?.length) ports.push(`outputs ${one.outputs.join(", ")}`);
        if (ports.length) item.appendChild(el("div", "om-why", ports.join(" · ")));
        nodeDragFrom(item, one);
        list.appendChild(item);
      }
      if (shown.length !== held.length) {
        list.appendChild(el("div", "om-side-status om-nodelist-from",
          `${shown.length} of ${held.length} shown.`));
      }
      nodesPane.replaceChildren(nodesBar(), list);
    };

    finder.oninput = () => { term = finder.value.trim().toLowerCase(); render(); };
    groups.onchange = () => { group = groups.value; render(); };

    picker.onchange = () => {
      atVersion = picker.value;
      loaded = false;
      fill();
    };
    const nodesTab = tabs.add({
      id: "nodes",
      title: "Nodes",
      order: 30,
      pane: nodesPane,
      onShow: fill,
    });
  }

  const noted = versions.filter((entry) => entry.changelog);
  {
    const list = el("div", "om-chg");
    if (!noted.length) {
      list.appendChild(el("div", "om-side-status", "No changelog published."));
    }
    for (const entry of noted) {
      const item = el("div", "om-chg-item");
      const head = el("div", "om-chg-head");
      head.appendChild(el("div", "om-ver", entry.version));
      if (pack.installed_version && entry.version === pack.installed_version) {
        head.appendChild(el("span", "om-chg-here", "installed"));
      }
      head.appendChild(el("div", "om-why", (entry.created_at || "").slice(0, 10)));
      item.appendChild(head);
      const note = el("div", "om-chg-text");
      note.textContent = entry.changelog;
      item.appendChild(note);
      list.appendChild(item);
    }
    tabs.add({
      id: "changelog",
      title: "Changelog",
      note: noted.length ? countNote(noted.length, "version") : "none",
      order: 20,
      pane: list,
    });
    tabs.start();
  }

  if (app.extensionManager.setting.get("openManager.enrichMetadata")) {
    const readme = el("div", "om-readme");
    readme.appendChild(loadingBlock("Reading the repository"));
    body.appendChild(readme);
    appendReadme(pack.id, readme);
  }

  dialog.appendChild(body);
}

function openRepoPack(pack) {
  if (asWindow("packs")) return showRepoPackWindow(pack);

  const backdrop = el("div", "om-backdrop");
  const dialog = el("div", "om-dialog");
  dialog.style.height = "auto";
  dialog.style.maxHeight = "84vh";
  backdrop.appendChild(dialog);
  document.body.appendChild(backdrop);
  closeOn(backdrop);

  const close = el("button", "om-x", "×");
  close.title = "Close";
  close.onclick = () => backdrop.remove();
  dialog.appendChild(close);

  buildRepoPackBody(dialog, pack);
  return backdrop;
}

function showRepoPackWindow(pack) {
  const panel = createFloatingPanel({
    key: `pack:${pack.repo}`,
    title: pack.title || repoName(pack.repo),
    ...windowSize("pack"),
    centred: true,
  });
  if (panel.body.childElementCount) return panel;
  buildRepoPackBody(panel.body, pack);
  return panel;
}

function buildRepoPackBody(container, pack) {
  const hero = el("div", "om-hero");
  const info = el("div", "om-hero-info");
  const titleRow = el("div", "om-title-row");
  const titles = el("div");
  titles.appendChild(el("div", "om-title", pack.title || repoName(pack.repo)));
  titles.appendChild(el("div", "om-sub", pack.repo));
  titleRow.appendChild(titles);
  info.appendChild(titleRow);

  const note = el("div", "om-notice");
  note.appendChild(el("b", null, "Not on the Comfy Registry"));
  note.appendChild(el("div", null,
    "Matched from GitHub. It installs straight from the repository after inspection."));
  info.appendChild(note);

  const actions = el("div", "om-actions om-hero-actions");
  const repoBtn = repoButton(pack.repo, `Open ${pack.repo}`);
  if (repoBtn) actions.appendChild(repoBtn);
  if (repoOwnerName(pack.repo)) actions.appendChild(makeStarButton(pack.repo, null));
  const control = makeInstallControl({
    packId: pack.repo,
    withMenu: false,
    onInstall: () => installFromRepo(pack, control),
  });
  control.setInstall();
  actions.appendChild(control.el);
  info.appendChild(actions);

  if (pack.classes?.length) {
    const provides = el("div", "om-chips");
    provides.appendChild(el("span", "om-chip", `provides ${pack.classes.length} node type(s)`));
    info.appendChild(provides);
    const tags = el("div", "om-tags");
    for (const c of pack.classes) tags.appendChild(el("span", "om-tag", c));
    info.appendChild(tags);
  }

  hero.appendChild(info);

  const body = el("div", "om-body");
  body.appendChild(hero);
  body.appendChild(el("div", "om-release-slot"));
  if (app.extensionManager.setting.get("openManager.enrichMetadata")) {
    const readme = el("div", "om-readme");
    readme.appendChild(loadingBlock("Reading the repository"));
    body.appendChild(readme);
    renderMetaInto(readme, api.fetchApi(
      `${API}/repo-meta?repo=${encodeURIComponent(pack.repo)}`));
  } else {
    body.appendChild(el("div", "om-readme-status",
      "Read pack README and repository metadata is off in Settings > Open Manager > Registry."));
  }
  container.appendChild(body);
}

function repoName(url) {
  const match = /github\.com[:/]+[^/]+\/([^/#?]+)/i.exec(url || "");
  return match ? match[1].replace(/\.git$/, "") : (url || "repository");
}

async function appendReadme(packId, slot) {
  return renderMetaInto(slot, api.fetchApi(
    `${API}/readme/${encodeURIComponent(packId)}`));
}

async function renderMetaInto(slot, fetchPromise) {
  let meta;
  try {
    const answer = await fetchPromise;
    meta = await answer.json();
    if (!answer.ok) throw new Error(meta.detail || `HTTP ${answer.status}`);
  } catch (error) {
    slot.replaceChildren(el("div", "om-readme-status", `Repository unavailable: ${error.message}`));
    return;
  }
  slot.replaceChildren();

  const heroActions = packRoot(slot)?.querySelector(".om-hero-actions");
  let facts = heroActions?.querySelector(".om-chips");
  if (heroActions && !facts) {
    facts = el("div", "om-chips");
    heroActions.appendChild(facts);
  }
  const inHeader = Boolean(facts);
  if (!facts) facts = el("div", "om-chips");
  const already = new Set([...facts.querySelectorAll(".om-chip b")]
    .map((b) => b.textContent.trim().toLowerCase()));
  const fact = (label, value) => {
    if (!value || already.has(label)) return;
    already.add(label);
    const node = el("span", "om-chip");
    node.appendChild(el("b", null, label));
    node.appendChild(document.createTextNode(" " + value));
    facts.appendChild(node);
  };
  if (meta.license && !already.has("license")) {
    already.add("license");
    const node = el("span", "om-chip");
    node.appendChild(el("b", null, "license"));
    node.appendChild(document.createTextNode(" " + meta.license));
    if (meta.license_tier) {
      const dot = el("span", "om-dot");
      dot.style.background = meta.license_color || "var(--om-muted)";
      dot.title = meta.license_tier;
      node.appendChild(dot);
    }
    facts.appendChild(node);
  }
  fact("python", meta.requires_python);
  fact("comfyui", meta.requires_comfyui);
  if (meta.stars) {
    const star = packRoot(slot)?.querySelector(".om-star");
    const label = star?.lastChild;
    if (label && !star.classList.contains("om-starred")) {
      label.textContent = `★ ${Number(meta.stars).toLocaleString()}`;
      star.title = `Star on GitHub (${Number(meta.stars).toLocaleString()} stars)`;
    }
  }
  fact("open issues", String(meta.open_issues));
  if (meta.open_prs) fact("open PRs", String(meta.open_prs));
  fact("last push", (meta.pushed_at || "").slice(0, 10));
  if (!inHeader && facts.children.length) slot.appendChild(facts);
  if (meta.topics?.length) {
    const tags = el("div", "om-tags");
    for (const t of meta.topics) tags.appendChild(tagChip(t));
    (heroActions || slot).appendChild(tags);
  }

  const body = el("div", "om-at-ref");
  const picker = buildRefPicker(meta, body);
  if (picker.firstChild) (heroActions || slot).appendChild(picker);
  slot.appendChild(body);
  await paintPackBody(body, meta, meta);
}

function buildRefInstallRow(meta, ref, caption) {
  const isSha = /^[0-9a-f]{7,40}$/i.test(ref);
  const repoName = (meta.repository || "").replace(/\/+$/, "").split("/").pop() || ref;
  const row = el("div", "om-row om-ref-row");
  row.appendChild(el("div", "om-ver", isSha ? ref.slice(0, 7) : ref));
  const kind = el("span", "om-badge", isSha ? "commit" : "branch");
  kind.style.background = "#8957e5";
  row.appendChild(kind);
  row.appendChild(el("div", "om-why", isSha ? "from GitHub" : "branch head"));
  row.appendChild(el("div", "om-why", caption || "not registry-scanned"));
  const control = makeInstallControl({
    packId: repoName,
    entry: { name: repoName, version: ref },
    withMenu: false,
    onInstall: () => installFromRepo(
      { repo: meta.repository, title: repoName, ref, overwrite: true }, control),
  });
  control.setInstall();
  row.appendChild(control.el);
  return row;
}

function buildRefPicker(meta, host) {
  const bar = el("div", "om-refbar");
  const repo = meta.repository || "";
  if (!repo.toLowerCase().includes("github.com")) return bar;
  const publishedVersions = () => new Set(
    [...(packRoot(host)?.querySelectorAll(".om-versions .om-ver") || [])]
      .map((n) => n.firstChild?.textContent?.trim() || n.textContent.trim()));

  const current = meta.default_branch || "main";
  const select = el("select", "om-side-select om-ref-select");
  const first = el("option", null, current);
  first.value = current;
  select.appendChild(first);
  const status = el("span", "om-side-status", "");

  const probe = el("span", "om-ref-probe");
  const fitToSelection = () => {
    const chosen = select.options[select.selectedIndex];
    if (!chosen) return;
    probe.style.font = getComputedStyle(select).font;
    probe.textContent = chosen.textContent;
    const text = Math.ceil(probe.getBoundingClientRect().width);
    select.style.width = `${Math.min(280, Math.max(88, text + 36))}px`;
    select.title = chosen.title || chosen.textContent;
  };

  let loaded = false;
  const loadRefs = async () => {
    if (loaded) return;
    loaded = true;
    status.textContent = "reading branches...";
    try {
      const query = new URLSearchParams({ repo });
      const data = await (await api.fetchApi(`${API}/refs?${query}`)).json();
      if (!data.ok) { status.textContent = data.reason || "refs unavailable"; return; }
      status.textContent = "";
      const seen = new Set([current]);
      const group = (label, options) => {
        if (!options.length) return;
        const box = el("optgroup");
        box.label = label;
        for (const option of options) box.appendChild(option);
        select.appendChild(box);
      };
      group("Branches", (data.branches || []).filter((b) => !seen.has(b.name) && seen.add(b.name))
        .map((b) => { const o = el("option", null, b.name); o.value = b.name; return o; }));
      const known = publishedVersions();
      group("Tags", (data.tags || []).filter((t) => !seen.has(t.name) && seen.add(t.name))
        .map((t) => {
          const published = known.has(t.name.replace(/^v/, ""));
          const o = el("option", null, published ? `${t.name} · published` : t.name);
          o.value = t.name;
          o.title = published
            ? `${t.name}: the registry publishes this version`
            : `${t.name} (${t.sha})`;
          return o;
        }));
      group("Recent commits", (data.commits || []).map((c) => {
        const subject = (c.message || "(no message)").slice(0, 44);
        const o = el("option", null, `${c.short} · ${subject}`);
        o.value = c.sha;
        o.title = `${c.short} ${c.date ? c.date.slice(0, 10) : ""} ${c.message || ""}`.trim();
        return o;
      }));
      fitToSelection();
    } catch (error) {
      status.textContent = "refs unavailable";
    }
  };
  select.addEventListener("mousedown", loadRefs, { once: true });
  select.addEventListener("focus", loadRefs, { once: true });

  select.addEventListener("change", async () => {
    const ref = select.value;
    status.textContent = "reading...";
    try {
      const query = new URLSearchParams({ repo, ref });
      const data = await (await api.fetchApi(`${API}/readme-at?${query}`)).json();
      if (!data.ok) { status.textContent = data.reason || "could not read that ref"; return; }
      status.textContent = "";
      fitToSelection();
      await paintPackBody(host, meta, data);
      markRef(ref, select.options[select.selectedIndex]?.textContent || ref);
      offerRef(ref, select.options[select.selectedIndex]?.textContent || "");
    } catch (error) {
      status.textContent = "could not read that ref";
    }
  });

function shortRef(ref) {
  const text = String(ref || "");
  return /^[0-9a-f]{40}$/i.test(text) ? text.slice(0, 7) : text;
}

  const markRef = (ref, caption) => {
    const page = packRoot(host) || host;
    page.querySelector(".om-ref-note")?.remove();
    const holder = page.classList?.contains("om-float") ? page : null;
    if (holder) {
      const handle = [...floatPanels.values()].find((one) => one.el === holder);
      const base = handle?._baseTitle
        || (handle ? (handle._baseTitle = handle.title?.() || "") : "");
      handle?.setTitle?.(ref && ref !== current ? `${base} @ ${shortRef(ref)}` : base);
    }
    if (!ref || ref === current) return;
    const note = el("div", "om-notice om-ref-note");
    note.appendChild(el("b", null, `Showing ${caption}`));
    note.appendChild(document.createTextNode(
      " The README, gallery, themes and example workflows below are read from the repository "
      + "at this ref, not from the default branch. Versions and registry data are unchanged."));
    const back = el("button", "om-btn om-ref-back", `Back to ${current}`);
    back.onclick = () => {
      select.value = current;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    };
    note.appendChild(back);
    const readme = page.querySelector(".om-readme");
    if (readme) readme.parentNode.insertBefore(note, readme);
    else page.appendChild(note);
  };

  const offerRef = (ref, caption) => {
    const versions = packRoot(host)?.querySelector(".om-versions");
    if (!versions) return;
    versions.querySelector(".om-ref-row")?.remove();
    if (!ref || ref === current) return;
    versions.prepend(buildRefInstallRow(meta, ref, caption));
    versions.closest("details")?.setAttribute("open", "");
  };

  bar.appendChild(el("span", "om-ref-label", "ref"));
  bar.appendChild(select);
  bar.appendChild(status);
  bar.appendChild(probe);
  fitToSelection();
  return bar;
}

async function attachStatusReasons(packId, versionsBox, versions) {
  if (!packId || !(versions || []).some((v) => (v.status || "").toLowerCase() !== "active")) return;
  let reasons;
  try {
    const answer = await api.fetchApi(`${API}/status-reasons/${encodeURIComponent(packId)}`);
    const data = await answer.json();
    if (!data.ok) return;
    reasons = data.reasons || {};
  } catch {
    return;
  }
  for (const mark of versionsBox.querySelectorAll(".om-badge[data-version]")) {
    const why = reasons[mark.dataset.version];
    if (why) mark.title = why;
  }
}

async function scanThenFinish(packId) {
  await new Promise((resolve) => {
    openScanDialog(packId, {
      onDone: async (state) => {
        if (!state) { resolve(); return; }
        const flagged = state.flagged || [];
        if (flagged.length) {
          const keep = await confirmAction(
            `${flagged.length} file(s) flagged in ${packId}`,
            flagged.map((f) => `${f.file}: ${f.malicious} of ${f.engines} engines`).join("\n")
            + "\n\nInstall its requirements anyway, or remove the pack?",
            "Install requirements anyway",
          );
          if (!keep) {
            await uninstall({ packId, entry: { name: packId } });
            resolve();
            return;
          }
        }
        try {
          const answer = await api.fetchApi(`${API}/install-requirements`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: packId }),
          });
          const done = await answer.json();
          if (!done.ok) notify("Requirements", done.output || done.reason || "did not install cleanly");
        } catch (error) {
          notify("Requirements", error.message);
        }
        resolve();
      },
    });
  });
}

function openScanDialog(packId, { onDone } = {}) {
  const backdrop = el("div", "om-backdrop");
  const dialog = el("div", "om-dialog");
  dialog.style.width = "min(90vw, 820px)";
  dialog.style.height = "auto";
  dialog.style.maxHeight = "86vh";
  const head = el("div", "om-head");
  head.appendChild(el("div", "om-title", `Scanning ${packId}`));
  dialog.appendChild(head);
  const body = el("div", "om-body");
  const status = el("div", "om-side-status", "Starting...");
  const list = el("div", "om-wf-list");
  body.appendChild(status);
  body.appendChild(list);
  dialog.appendChild(body);
  const foot = el("div", "om-foot");
  const close = el("button", "om-btn", "Close");
  close.onclick = () => { backdrop.remove(); onDone?.(null); };
  foot.appendChild(close);
  dialog.appendChild(foot);
  backdrop.appendChild(dialog);
  document.body.appendChild(backdrop);

  const draw = (state) => {
    const spent = `${state.budget_used}/${state.budget} used today`;
    status.textContent = state.scanning
      ? `${state.done} of ${state.total} checked · ${spent}`
      : (state.error
          ? `Stopped: ${state.error} · ${spent}`
          : `${state.done} file(s) checked · ${spent}`);
    list.replaceChildren();
    for (const r of state.results || []) {
      const row = el("div", "om-wf-item");
      row.appendChild(el("span", "om-wf-name", r.file));
      const note = {
        flagged: `${r.malicious} of ${r.engines} engines call this malicious`,
        known: `seen before, ${r.malicious} of ${r.engines} engines flag it`,
        unknown: "not seen by VirusTotal before",
        budget: "not checked, the day's allowance is spent",
        unreadable: "could not be read",
        error: r.detail || "lookup failed",
      }[r.state] || r.state;
      const tag = el("span", "om-wf-path", note);
      if (r.state === "flagged") tag.style.color = "#f85149";
      row.appendChild(tag);
      list.appendChild(row);
    }
    if (!state.scanning && !(state.results || []).length && !state.error) {
      list.appendChild(stateRow("Nothing in this pack needs checking"));
    }
  };

  (async () => {
    try {
      const answer = await api.fetchApi(`${API}/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: packId }),
      });
      const started = await answer.json();
      if (!started.ok) { status.textContent = started.reason || "could not start"; return; }
    } catch (error) {
      status.textContent = error.message;
      return;
    }
    for (let i = 0; i < 4000; i++) {
      let state;
      try { state = await (await api.fetchApi(`${API}/scan/state`)).json(); }
      catch { status.textContent = "connection lost"; return; }
      draw(state);
      if (!state.scanning) {
        const bad = (state.results || []).filter((r) => r.state === "flagged");
        onDone?.({ ...state, flagged: bad });
        close.textContent = "Close";
        return;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  })();
  return backdrop;
}

const CAPABILITY_LABELS = {
  filesystem: ["Filesystem read and write", "Reads or writes files outside its own folder"],
  network: ["Network access", "Contacts hosts over the network at runtime"],
  subprocess: ["Subprocess execution", "Starts other programs"],
  binaries: ["External binaries", "Ships or calls compiled executables"],
  environment: ["Environment access", "Reads or sets environment variables"],
  dynamic_code: ["Dynamic code execution", "Builds and runs code at runtime"],
  packages: ["Package and dependency changes", "Installs or changes Python packages"],
  models: ["Model downloads", "Fetches model weights"],
  credentials: ["Credentials and API keys", "Reads tokens or keys"],
  telemetry: ["Telemetry or analytics", "Reports usage off this machine"],
  compilation: ["Native or GPU compilation", "Compiles code or kernels on your machine"],
  hardware: ["Direct hardware access", "Talks to devices directly"],
};

const CAPABILITY_ICONS = {
  filesystem: [["path", "M3 7h6l2 3h10v9H3z"]],
  network: [["circle", 12, 12, 8], ["path", "M4 12h16"],
            ["path", "M12 4c3.2 3.4 3.2 12.6 0 16"], ["path", "M12 4c-3.2 3.4-3.2 12.6 0 16"]],
  subprocess: [["rect", 3, 4, 18, 16, 2], ["path", "M7.5 9.5l3 2.5-3 2.5"],
               ["path", "M13 15h4"]],
  binaries: [["path", "M12 3l8 4.5v9L12 21l-8-4.5v-9z"], ["path", "M4 7.5l8 4.5 8-4.5"],
             ["path", "M12 12v9"]],
  environment: [["path", "M4 8h16"], ["circle", 9, 8, 2.2], ["path", "M4 16h16"],
                ["circle", 15, 16, 2.2]],
  dynamic_code: [["path", "M8.5 7L3.5 12l5 5"], ["path", "M15.5 7l5 5-5 5"]],
  packages: [["rect", 3, 7, 18, 13, 2], ["path", "M12 10v6"], ["path", "M9 13l3 3 3-3"]],
  models: [["ellipse", 12, 6, 8, 3], ["path", "M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6"],
           ["path", "M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"]],
  credentials: [["circle", 8, 15.5, 3.5], ["path", "M10.5 13L20 3.5"], ["path", "M16 4h4v4"]],
  telemetry: [["path", "M4 19v-4"], ["path", "M9.3 19v-8"], ["path", "M14.7 19v-12"],
              ["path", "M20 19v-6"]],
  compilation: [["path", "M14.5 6.2a4 4 0 1 0 3.3 3.3L21 6l-3-3z"], ["path", "M12.6 11.4L4 20"]],
  hardware: [["rect", 7, 7, 10, 10, 1.5], ["path", "M10 3v4"], ["path", "M14 3v4"],
             ["path", "M10 17v4"], ["path", "M14 17v4"], ["path", "M3 10h4"],
             ["path", "M3 14h4"], ["path", "M17 10h4"], ["path", "M17 14h4"]],
};

const CAPABILITY_FALLBACK = [["path", "M12 3l9 9-9 9-9-9z"], ["path", "M12 9v4"],
                             ["path", "M12 16.2v.4"]];

function capabilityIcon(key, size = 14) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.7");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.classList.add("om-cap-icon");
  for (const shape of CAPABILITY_ICONS[key] || CAPABILITY_FALLBACK) {
    const [kind, ...rest] = shape;
    const node = document.createElementNS(ns, kind);
    if (kind === "path") node.setAttribute("d", rest[0]);
    else if (kind === "circle") {
      node.setAttribute("cx", rest[0]);
      node.setAttribute("cy", rest[1]);
      node.setAttribute("r", rest[2]);
    } else if (kind === "ellipse") {
      node.setAttribute("cx", rest[0]);
      node.setAttribute("cy", rest[1]);
      node.setAttribute("rx", rest[2]);
      node.setAttribute("ry", rest[3]);
    } else if (kind === "rect") {
      node.setAttribute("x", rest[0]);
      node.setAttribute("y", rest[1]);
      node.setAttribute("width", rest[2]);
      node.setAttribute("height", rest[3]);
      if (rest[4] != null) node.setAttribute("rx", rest[4]);
    }
    svg.appendChild(node);
  }
  return svg;
}

function capabilityTitle(key) {
  const known = CAPABILITY_LABELS[key];
  if (known) return known[0];
  return String(key).replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

function buildCapabilities(keys, refused = []) {
  const box = panel("Access and capabilities", countNote(keys.length, "declaration"),
    { open: false, remember: "om-caps-open" });
  const content = el("div", "om-caps-pane");
  box.body.appendChild(content);
  box.pane = content;
  content.appendChild(el("div", "om-caps-note", "Declared by the author, not verified."));
  if (keys.length) {
    const grid = el("div", "om-caps");
    for (const key of keys) {
      const cell = el("div", "om-cap");
      const head = el("div", "om-cap-head");
      head.appendChild(capabilityIcon(key));
      head.appendChild(el("span", "om-cap-name", capabilityTitle(key)));
      cell.appendChild(head);
      const blurb = CAPABILITY_LABELS[key]?.[1];
      if (blurb) cell.appendChild(el("span", "om-cap-what", blurb));
      grid.appendChild(cell);
    }
    content.appendChild(grid);
  }
  if (refused.length) {
    const bad = el("div", "om-caps-bad");
    bad.appendChild(el("b", null,
      `${refused.length === 1 ? "One declaration" : `${refused.length} declarations`} `
      + "not recognised"));
    bad.appendChild(el("div", "om-caps-list", refused.join(", ")));
    bad.appendChild(el("div", "om-cap-what", "Not in the accepted list, so not shown."));
    content.appendChild(bad);
  }
  return box;
}

function appendDeveloperBlock(slot, meta) {
  const dev = meta.developer || {};
  const matched = (meta.incompatible || []).filter((entry) => entry.matched);
  const workflows = dev.example_workflows || [];
  const themes = dev.themes || [];
  const gallery = panelSetting("openManager.galleryShow", true) ? (dev.gallery || []) : [];
  const capabilities = dev.capabilities || [];
  const badCapabilities = dev.capabilities_unknown || [];

  const releaseSlot = packRoot(slot)?.querySelector(".om-release-slot");
  if (dev.release_note && releaseSlot) {
    releaseSlot.replaceChildren();
    const note = el("div", "om-release");
    note.appendChild(el("b", null, "From the developer"));
    note.appendChild(el("div", "om-release-body", dev.release_note));
    releaseSlot.appendChild(note);
  }

  if (!matched.length && !dev.source && !dev.docs && !dev.funding
    && !workflows.length && !themes.length && !gallery.length && !capabilities.length
    && !badCapabilities.length) return;

  const block = el("div", "om-dev");
  const tabs = packRoot(slot)?.querySelector(".om-tabs")?.__omTabs || null;

  for (const entry of matched) {
    const card = el("div", "om-ack");
    card.appendChild(el("b", null, `Developer declares this incompatible with ${entry.spec}`));
    card.appendChild(el("div", null, `Installed ${entry.name} ${entry.installed} matches.`));
    block.appendChild(card);
  }

  if (dev.source === "github") {
    const note = el("div", "om-notice");
    note.appendChild(el("b", null,
      `Developer recommends installing from GitHub${dev.branch ? ` (branch ${dev.branch})` : ""}`));
    block.appendChild(note);
  }

  if (dev.docs || dev.funding) {
    const links = el("div", "om-actions");
    if (dev.docs) {
      const b = el("button", "om-btn", "Docs");
      b.title = dev.docs;
      b.onclick = () => openUrl(dev.docs);
      links.appendChild(b);
    }
    if (dev.funding) {
      const b = el("button", "om-btn", "Funding");
      b.title = dev.funding;
      b.onclick = () => openUrl(dev.funding);
      links.appendChild(b);
    }
    const hero = packRoot(slot)?.querySelector(".om-hero-actions");
    if (hero) for (const b of [...links.children]) hero.appendChild(b);
    else block.appendChild(links);
  }

  if (capabilities.length || badCapabilities.length) {
    const built = buildCapabilities(capabilities, badCapabilities);
    if (tabs) {
      tabs.add({ id: "capabilities", title: "Access", order: 40,
                 note: countNote(capabilities.length, "declaration"), pane: built.pane });
    } else {
      block.appendChild(built);
    }
  }

  if (gallery.length) {
    const built = buildGallery(meta, gallery);
    if (tabs && built) {
      tabs.add({ id: "gallery", title: "Gallery", order: 70,
                 note: countNote(gallery.length, "image"), pane: built.pane });
    } else if (built) {
      block.appendChild(built);
    }
  }

  if (themes.length) {
    const themeRows = [];
    const built = collapsible("Themes", themes, (path) => {
      const item = el("button", "om-wf-item");
      item.appendChild(el("span", "om-wf-name", path.split("/").pop().replace(/\.json$/, "")));
      item.appendChild(el("span", "om-wf-path", path));
      item.title = `Add ${path} to your themes`;
      item.onclick = () => addPackTheme(meta.repository, meta.default_branch, path, item);
      themeRows.push([path, item]);
      return item;
    }, { note: countNote(themes.length, "theme"), remember: "om-themes-open" });
    const titles = () => fillThemeTitles(meta.repository, meta.default_branch, themeRows);
    if (tabs) {
      tabs.add({ id: "themes", title: "Themes", order: 50,
                 note: countNote(themes.length, "theme"), pane: built.pane, onShow: titles });
    } else {
      built.addEventListener("toggle", () => { if (built.open) titles(); });
      if (built.open) titles();
      block.appendChild(built);
    }
  }

  if (workflows.length) {
    const previews = dev.example_workflow_previews || {};
    const built = collapsible("Example workflows", workflows, (path) => {
      const item = el("button", "om-wf-item");
      if (previews[path]) {
        const shot = el("img", "om-wf-shot");
        shot.loading = "lazy";
        shot.alt = "";
        shot.src = galleryUrl(previews[path], meta);
        shot.onerror = () => shot.remove();
        item.appendChild(shot);
      }
      item.appendChild(el("span", "om-wf-name", path.split("/").pop()));
      item.appendChild(el("span", "om-wf-path", path));
      item.title = `Load ${path}`;
      item.onclick = () => loadExampleWorkflow(meta.repository, meta.default_branch, path);
      return item;
    }, { note: countNote(workflows.length, "workflow"), remember: "om-workflows-open" });
    if (tabs) {
      tabs.add({ id: "workflows", title: "Workflows", order: 60,
                 note: countNote(workflows.length, "workflow"), pane: built.pane });
    } else {
      block.appendChild(built);
    }
  }

  slot.appendChild(block);
}

export { openPack, openRepoPack, repoName, scanThenFinish, openScanDialog, appendDeveloperBlock };
