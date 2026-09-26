import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import { API } from "./base.mjs";
import { el } from "./ui.mjs";
import { makeInstallControl, byTrustedAuthor, installFromRepo } from "./installs.mjs";
import { openPack, openRepoPack } from "./packs.mjs";
import { loadingBlock } from "./markdown.mjs";
import { panelSetting } from "./settings.mjs";
import { quickInstall } from "./pack-extras.mjs";
import { queueLicense, packIcon, buildResultRow, buildResultTableRow, buildResultCard } from "./results.mjs";
import { collectMissingNodeTypes, viewGeneration, viewIsCurrent, openPanelWindow } from "./discovery.mjs";

let onLicencesResolved = null;

async function renderMissing(container) {
  container.replaceChildren();
  const status = el("div", "om-side-status");
  status.appendChild(loadingBlock("Scanning the current graph"));
  const list = el("div", "om-side-list");
  container.appendChild(status);
  container.appendChild(list);

  const missing = collectMissingNodeTypes();
  if (!missing.length) {
    status.textContent = "No missing nodes in the current workflow.";
    return;
  }
  status.textContent = `Resolving ${missing.length} missing node type(s)...`;
  let data;
  try {
    const answer = await api.fetchApi(`${API}/resolve-nodes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ classes: missing }),
    });
    data = await answer.json();
    if (!answer.ok) throw new Error(`HTTP ${answer.status}`);
  } catch (error) {
    status.textContent = `Could not resolve missing nodes: ${error.message}`;
    return;
  }

  status.textContent = `${data.packs.length} pack(s) for ${missing.length} missing node type(s)`;
  for (const pack of data.packs) {
    const row = el("div", "om-side-row");
    row.appendChild(packIcon(pack.icon, pack.title));
    const text = el("div", "om-side-text");
    text.appendChild(el("div", "om-side-name", pack.title));
    const shown = pack.classes.slice(0, 3).join(", ") + (pack.classes.length > 3 ? "…" : "");
    text.appendChild(el("div", "om-side-meta", `${pack.classes.length} node(s): ${shown}`));
    if (pack.installable) text.onclick = () => openPack(pack.pack_id);
    else if (pack.repo) text.onclick = () => openRepoPack(pack);
    row.appendChild(text);

    if (pack.installable) {
      const control = makeInstallControl({
        packId: pack.pack_id,
        withMenu: false,
        onInstall: () => quickInstall(pack.pack_id, control),
      });
      if (pack.installed_version) control.setInstalled();
      else control.setInstall();
      row.appendChild(control.el);
    } else if (pack.repo) {
      const control = makeInstallControl({
        packId: pack.repo,
        withMenu: false,
        onInstall: () => installFromRepo(pack, control),
      });
      control.setInstall();
      control.el.title = "Not on the registry. Installs from GitHub after inspection.";
      row.appendChild(control.el);
    }
    list.appendChild(row);
  }
  if (data.unresolved.length) {
    container.appendChild(el("div", "om-side-status",
      `${data.unresolved.length} node type(s) not found in any known pack.`));
  }
}

function sinceText(ts) {
  if (!ts) return "never";
  const s = Date.now() / 1000 - ts;
  if (s < 90) return "just now";
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 129600) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

function dropdown(storageKey, fallback, options) {
  const select = el("select", "om-side-select");
  for (const [value, label] of options) {
    const option = el("option", null, label);
    option.value = value;
    select.appendChild(option);
  }
  let saved = null;
  try { saved = localStorage.getItem(storageKey); } catch {}
  select.value = options.some(([value]) => value === saved) ? saved : fallback;
  return select;
}

function allowBanned() {
  return panelSetting("openManager.allowBanned", false) === true;
}

function packQuery() {
  return new URLSearchParams({ ...licenseOptions(), allow_banned: allowBanned() });
}

function licenseOptions() {
  const get = (key, fallback) => {
    try { return app.extensionManager.setting.get(key) ?? fallback; } catch { return fallback; }
  };
  return {
    concurrency: Number(get("openManager.licenseConcurrency", 8)) || 8,
    race: get("openManager.licenseRace", false) === true,
    use_api: get("openManager.licenseUseApi", false) === true,

  };
}

function syncOptions() {
  const get = (key, fallback) => {
    try { return app.extensionManager.setting.get(key) ?? fallback; } catch { return fallback; }
  };
  return {
    parallel: get("openManager.parallelSync", true) !== false,
    concurrency: Number(get("openManager.syncConcurrency", 8)) || 8,
  };
}

const topicPacks = new Map();

const TOPIC_PREFIX = "topic:";

async function packsForTopic(topic) {
  if (topicPacks.has(topic)) return topicPacks.get(topic);
  let answer;
  try {
    const query = new URLSearchParams({ name: topic });
    answer = await (await api.fetchApi(`${API}/topic?${query}`)).json();
  } catch (error) {
    return { error: `The topic could not be looked up: ${error.message}` };
  }
  if (!answer.ok) return { error: answer.reason || "GitHub did not answer." };
  const result = { ids: new Set(answer.ids || []), found: answer.found || 0,
                   partial: Boolean(answer.partial) };
  topicPacks.set(topic, result);
  return result;
}

function topicInQuery(value) {
  const text = String(value || "").trim().toLowerCase();
  return text.startsWith(TOPIC_PREFIX) ? text.slice(TOPIC_PREFIX.length).trim() : "";
}

function browseTopic(topic) {
  const root = openPanelWindow("registry");
  let tries = 0;
  const fill = () => {
    const box = (root?.querySelector?.(".om-search"))
      || document.querySelector(".om-float .om-search, .om-panel-window .om-search");
    if (!box) {
      if (tries++ < 40) setTimeout(fill, 150);
      return;
    }
    box.value = `${TOPIC_PREFIX}${topic}`;
    box.dispatchEvent(new Event("input", { bubbles: true }));
  };
  fill();
}

function renderRegistry(container) {
  const generation = viewGeneration;
  container.replaceChildren();
  const status = el("div", "om-side-status");
  status.appendChild(loadingBlock("Loading the catalogue"));
  container.appendChild(status);

  const showSyncPrompt = () => {
    if (!viewIsCurrent(generation)) return;
    container.replaceChildren();
    const box = el("div", "om-empty");
    box.appendChild(el("div", "om-empty-title", "The registry is not synced"));
    const go = el("button", "om-btn om-go", "Sync registry");
    go.onclick = startSync;
    box.appendChild(go);
    container.appendChild(box);
  };

  const showSyncing = () => {
    if (!viewIsCurrent(generation)) return;
    container.replaceChildren();
    const box = el("div", "om-empty");
    box.appendChild(el("div", "om-empty-title", "Syncing the registry..."));
    const bar = el("div", "om-side-status", "");
    box.appendChild(bar);
    container.appendChild(box);
    const poll = async () => {
      if (!viewIsCurrent(generation)) return;
      let info;
      try { info = await (await api.fetchApi(`${API}/catalog/state`)).json(); }
      catch { bar.textContent = "connection lost"; return; }
      if (info.syncing) { bar.textContent = `${info.done}/${info.total} pages`; setTimeout(poll, 800); }
      else if (info.cached) showCatalogue(info);
      else showSyncPrompt();
    };
    poll();
  };

  const startSync = async () => {
    try {
      await api.fetchApi(`${API}/catalog/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(syncOptions()),
      });
    } catch (error) {}
    showSyncing();
  };

  const showCatalogue = async (info) => {
    if (!viewIsCurrent(generation)) return;
    let nodes;
    try {
      nodes = (await (await api.fetchApi(`${API}/catalog`)).json()).nodes || [];
    } catch (error) {
      status.textContent = `Could not load catalogue: ${error.message}`;
      return;
    }
    if (!viewIsCurrent(generation)) {
      return;
    }
    container.replaceChildren();

    const header = el("div", "om-cat-head");
    header.appendChild(el("div", "om-side-status",
      `${nodes.length.toLocaleString()} packs · synced ${sinceText(info.fetched_at)}`));
    const update = el("button", "om-btn", "Update");
    update.onclick = startSync;
    header.appendChild(update);
    container.appendChild(header);

    const search = el("input", "om-search");
    search.type = "search";
    search.placeholder = "Search the registry, or topic:name";
    search.title = "Matches a pack's name, id, description and publisher. topic:animation shows"
      + " the packs whose GitHub repository carries that topic.";
    search.spellcheck = false;
    container.appendChild(search);

    const controls = el("div", "om-side-controls");
    try { localStorage.removeItem("om-registry-view"); } catch {}
    const viewKey = container.closest(".om-panel-window, .om-float")
      ? "om-registry-view-window" : "om-registry-view-side";
    const viewSel = dropdown(viewKey, "list", [
      ["list", "List view"],
      ["cards", "Card view"],
      ["table", "Table view"],
    ]);
    const sortSel = dropdown("om-registry-sort", "downloads", [
      ["downloads", "Most downloads"],
      ["released", "Recently released"],
      ["stars", "Most stars"],
      ["name", "Name A-Z"],
      ["license", "Licence: permissive first"],
      ["trusted", "Trusted authors first"],
    ]);
    const licSel = dropdown("om-registry-license", "all", [
      ["all", "All licences"],
      ["permissive", "Permissive"],
      ["weak-copyleft", "Weak copyleft"],
      ["copyleft", "Copyleft"],
      ["community", "Community"],
      ["non-commercial", "Non-commercial"],
      ["unknown", "Unknown"],
    ]);
    const filterWrap = el("label", "om-side-filter");
    const filterBox = el("input");
    filterBox.type = "checkbox";
    filterBox.checked = (localStorage.getItem("om-registry-published") ?? "1") === "1";
    filterWrap.appendChild(filterBox);
    filterWrap.appendChild(el("span", null, "Published only"));
    const trustWrap = el("label", "om-side-filter");
    const trustBox = el("input");
    trustBox.type = "checkbox";
    trustBox.checked = localStorage.getItem("om-registry-trusted") === "1";
    trustWrap.appendChild(trustBox);
    trustWrap.appendChild(el("span", null, "Trusted authors"));
    trustWrap.title = "Only packs whose repository belongs to an author you have trusted";
    controls.appendChild(viewSel);
    controls.appendChild(sortSel);
    controls.appendChild(licSel);
    controls.appendChild(filterWrap);
    controls.appendChild(trustWrap);
    container.appendChild(controls);

    const count = el("div", "om-side-status", "");
    const list = el("div", "om-side-list om-virt-host");
    const sizer = el("div", "om-virt");
    const win = el("div", "om-virt-win");
    sizer.appendChild(win);
    list.appendChild(sizer);
    container.appendChild(count);

    const head = el("div", "om-table-head");
    for (const [cls, label] of [
      ["num", "#"], ["title", "Title"], ["ver", "Version"], ["action", "Action"],
      ["dl", "Downloads"], ["desc", "Description"], ["auth", "Author"],
      ["lic", "Licence"], ["star", "★"], ["date", "Updated"],
    ]) head.appendChild(el("div", `om-tcell om-tcell-${cls}`, label));
    container.appendChild(head);
    container.appendChild(list);

    const comparators = {
      downloads: (a, b) => (b.downloads - a.downloads),
      released: (a, b) => (b.released || "").localeCompare(a.released || "") || (b.downloads - a.downloads),
      stars: (a, b) => (b.stars - a.stars),
      name: (a, b) => (a.name || a.id).localeCompare(b.name || b.id),
      license: (a, b) => (a.license_rank - b.license_rank) || (b.downloads - a.downloads),
      trusted: (a, b) => (byTrustedAuthor(b) - byTrustedAuthor(a)) || (b.downloads - a.downloads),
    };
    const OVERSCAN = 4;
    const GAP = { list: 4, cards: 8, table: 0 };

    let filtered = [];
    let pitch = 56;
    let perRow = 1;
    let from = -1;
    let to = -1;

    const cardsOn = () => viewSel.value === "cards";
    const tableOn = () => viewSel.value === "table";
    const gapNow = () => GAP[viewSel.value] ?? GAP.list;
    const WIDE = 1000;
    const MID = 470;

    const measure = () => {
      const probe = win.firstElementChild;
      if (!probe) return false;
      const height = Math.round(probe.getBoundingClientRect().height);
      const columns = cardsOn()
        ? (getComputedStyle(win).gridTemplateColumns.split(" ").filter(Boolean).length || 1)
        : 1;
      if (height <= 0) return false;
      const changed = height + gapNow() !== pitch || columns !== perRow;
      pitch = height + gapNow();
      perRow = columns;
      return changed;
    };

    const paint = (force = false) => {
      const rows = Math.ceil(filtered.length / perRow);
      sizer.style.height = `${Math.max(0, rows * pitch - (rows ? gapNow() : 0))}px`;
      const firstRow = Math.max(0, Math.floor(list.scrollTop / pitch) - OVERSCAN);
      const rowsShown = Math.ceil(list.clientHeight / pitch) + OVERSCAN * 2;
      const start = firstRow * perRow;
      const end = Math.min(filtered.length, (firstRow + rowsShown) * perRow);
      if (!force && start === from && end === to) return;
      from = start;
      to = end;
      win.style.transform = `translateY(${firstRow * pitch}px)`;
      const build = cardsOn() ? buildResultCard : tableOn() ? buildResultTableRow : buildResultRow;
      win.replaceChildren(...filtered.slice(start, end).map((entry, i) => build(entry, start + i)));
    };

    const fitColumns = () => {
      const width = list.clientWidth;
      const want = width <= 0 || width >= WIDE ? "om-t-wide"
        : width >= MID ? "om-t-mid" : "om-t-tight";
      for (const node of [head, win]) {
        node.classList.remove("om-t-wide", "om-t-mid", "om-t-tight");
        node.classList.add(want);
      }
      if (tableOn() && head.clientWidth > 0 && list.clientWidth > 0) {
        const gutter = Math.max(0, head.clientWidth - list.clientWidth);
        head.style.paddingRight = `${8 + gutter}px`;
      }
    };

    const repaint = (force = true) => {
      fitColumns();
      paint(force);
      requestAnimationFrame(() => {
        const tier = head.className;
        fitColumns();
        if (measure() || head.className !== tier) paint(true);
      });
    };

    let settle = null;
    const queueVisibleLicences = () => {
      clearTimeout(settle);
      settle = setTimeout(() => {
        for (const node of win.children) {
          if (node._entry && node._licPill) queueLicense(node._entry, node._licPill);
        }
      }, 250);
    };

    let topicNow = "";
    let topicIds = null;

    const matches = (node) => {
      const query = search.value.trim().toLowerCase();
      const tier = licSel.value;
      if (filterBox.checked && !node.advertised) return false;
      if (trustBox.checked && !byTrustedAuthor(node)) return false;
      if (tier !== "all" && node.license_tier !== tier) return false;
      if (topicInQuery(query)) return topicIds ? topicIds.has(node.id) : false;
      if (!query) return true;
      return (node.name || "").toLowerCase().includes(query)
        || node.id.toLowerCase().includes(query)
        || (node.description || "").toLowerCase().includes(query)
        || (node.publisher || "").toLowerCase().includes(query);
    };

    const applyNow = async () => {
      const wantedTopic = topicInQuery(search.value);
      if (wantedTopic && wantedTopic !== topicNow) {
        topicNow = wantedTopic;
        topicIds = null;
        count.textContent = `Asking GitHub which packs are tagged ${wantedTopic}...`;
        const answer = await packsForTopic(wantedTopic);
        if (topicInQuery(search.value) !== wantedTopic) return;
        if (answer.error) {
          topicIds = new Set();
          count.textContent = answer.error;
          filtered = [];
          from = to = -1;
          repaint();
          return;
        }
        topicIds = answer.ids;
        topicNow = wantedTopic;
      } else if (!wantedTopic) {
        topicNow = "";
        topicIds = null;
      }

      filtered = nodes.filter(matches).sort(comparators[sortSel.value] || comparators.downloads);
      count.textContent = wantedTopic
        ? `${filtered.length.toLocaleString()} tagged ${wantedTopic}`
        : `${filtered.length.toLocaleString()} shown`;
      win.className = `om-virt-win ${
        cardsOn() ? "om-card-grid" : tableOn() ? "om-table-win" : "om-list-win"}`;
      head.style.display = tableOn() ? "" : "none";
      list.classList.toggle("om-table-list", tableOn());
      list.scrollTop = 0;
      from = to = -1;
      repaint();
      queueVisibleLicences();
    };
    const apply = () => {
      applyNow().catch((error) => {
        count.textContent = `The list could not be filtered: ${error.message}`;
      });
    };

    onLicencesResolved = () => {
      if (!viewIsCurrent(generation)) { onLicencesResolved = null; return; }
      if (licSel.value === "all") return;
      const before = filtered.length;
      const anchor = list.scrollTop;
      filtered = nodes.filter(matches).sort(comparators[sortSel.value] || comparators.downloads);
      if (filtered.length === before) return;
      count.textContent = `${filtered.length.toLocaleString()} shown`;
      const rows = Math.ceil(filtered.length / perRow);
      list.scrollTop = Math.min(anchor, Math.max(0, rows * pitch - list.clientHeight));
      from = to = -1;
      repaint();
    };

    list.addEventListener("scroll", () => { paint(); queueVisibleLicences(); }, { passive: true });
    const shape = new ResizeObserver(() => {
      if (!viewIsCurrent(generation)) { shape.disconnect(); return; }
      repaint();
    });
    shape.observe(list);
    let timer = null;
    search.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(apply, 150); });
    viewSel.addEventListener("change", () => { localStorage.setItem(viewKey, viewSel.value); apply(); });
    sortSel.addEventListener("change", () => { localStorage.setItem("om-registry-sort", sortSel.value); apply(); });
    licSel.addEventListener("change", () => { localStorage.setItem("om-registry-license", licSel.value); apply(); });
    filterBox.addEventListener("change", () => {
      localStorage.setItem("om-registry-published", filterBox.checked ? "1" : "0");
      apply();
    });
    trustBox.addEventListener("change", () => {
      localStorage.setItem("om-registry-trusted", trustBox.checked ? "1" : "0");
      apply();
    });
    apply();
  };

  (async () => {
    let info;
    try { info = await (await api.fetchApi(`${API}/catalog/state`)).json(); }
    catch (error) { status.textContent = `Backend unavailable: ${error.message}`; return; }
    if (!viewIsCurrent(generation)) return;
    if (info.syncing) showSyncing();
    else if (info.cached) showCatalogue(info);
    else showSyncPrompt();
  })();
}

export { onLicencesResolved, renderMissing, sinceText, dropdown, allowBanned, packQuery, licenseOptions, syncOptions, browseTopic, renderRegistry };
