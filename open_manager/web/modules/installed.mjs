import { api } from "../../../scripts/api.js";
import { API } from "./base.mjs";
import { el, toast, notify, chooseAction } from "./ui.mjs";
import { remindRestart, makeInstallControl, foldId, indexInstalled, updateTarget, packName, installedMenu, enqueueInstall, install, byTrustedAuthor } from "./installs.mjs";
import { openPack, openRepoPack } from "./packs.mjs";
import { loadingBlock } from "./markdown.mjs";
import { loadSelfInfo, selfUpdateTarget, openAboutDialog, vtReady, vtRemaining, panelSetting } from "./settings.mjs";
import { packIcon, starCount } from "./results.mjs";
import { viewGeneration, viewIsCurrent, refreshInstalledIfActive } from "./discovery.mjs";
import { dropdown } from "./registry.mjs";
import { dlPost } from "./downloads.mjs";

function isRelease(v) {
  return /^\d+(\.\d+)*$/.test((v || "").trim());
}

function updateInstalled(pack, row, control) {
  install({
    packId: pack.registry_id,
    entry: { version: pack.latest, status: "active", name: pack.registry_id || pack.id },
    control,
    rowsRoot: row,
    overwrite: true,
  });
}

async function renderInstalled(container) {
  const generation = viewGeneration;
  container.replaceChildren();
  const status = el("div", "om-side-status");
  status.appendChild(loadingBlock("Reading installed packs"));
  const list = el("div", "om-side-list");
  container.appendChild(status);
  container.appendChild(list);
  let data;
  try {
    const answer = await api.fetchApi(`${API}/installed`);
    data = await answer.json();
    if (!answer.ok) throw new Error(`HTTP ${answer.status}`);
  } catch (error) {
    status.textContent = `Could not read installed packs: ${error.message}`;
    return;
  }
  if (!viewIsCurrent(generation)) return;
  const packs = data.packs;
  indexInstalled(packs);

  const [timings] = await Promise.all([loadStartupTimes(), loadHolds(), loadSelfInfo(true)]);
  if (!viewIsCurrent(generation)) return;
  if (timings?.ok && timings.packs?.length) {
    const worst = timings.packs[0];
    const line = el("div", "om-side-status om-cost-line");
    line.textContent = (timings.stale ? "Last run: " : "")
      + `${timings.total.toFixed(1)}s importing ${timings.packs.length} packs`
      + (worst ? ` · slowest ${worst.name} at ${worst.seconds.toFixed(2)}s` : "");
    line.classList.toggle("om-cost-stale", !!timings.stale);
    line.title = timings.stale
      ? timings.reason
      : "Read from ComfyUI's own log, for the run that is loaded now.";
    container.insertBefore(line, list);
  }

  const controls = el("div", "om-side-controls");
  const search = el("input", "om-search");
  search.type = "search";
  search.placeholder = "Search installed packs";
  search.spellcheck = false;
  const sortSel = dropdown("om-installed-sort", "name", [
    ["name", "Name A-Z"],
    ["status", "Status first"],
    ["updatable", "Updatable first"],
    ["stars", "Most stars"],
    ["slowest", "Slowest to load"],
    ["newest", "Newest installed"],
    ["oldest", "Oldest installed"],
    ["trusted", "Trusted authors first"],
  ]);
  const filterSel = dropdown("om-installed-filter", "all", [
    ["all", "All installed"],
    ["updates", "Updates available"],
    ["flagged", "Flagged or banned"],
    ["registry", "Registry"],
    ["github", "GitHub (from repo)"],
    ["disk", "Disk (local)"],
    ["off-registry", "Not on registry"],
  ]);
  controls.appendChild(sortSel);
  controls.appendChild(filterSel);
  const trustedOnly = el("label", "om-side-filter");
  const trustedBox = el("input");
  trustedBox.type = "checkbox";
  trustedOnly.appendChild(trustedBox);
  trustedOnly.appendChild(document.createTextNode("Trusted authors"));
  trustedOnly.title = "Only packs whose author you have trusted.";
  controls.appendChild(trustedOnly);
  container.insertBefore(search, list);
  container.insertBefore(controls, list);
  const count = el("div", "om-side-status", "");
  container.insertBefore(count, list);

  const updatableCount = packs.filter(isInstalledUpdatable).length;
  if (updatableCount) {
    const all = el("button", "om-btn om-go om-side-updateall",
                   `Update all (${updatableCount})`);
    all.title = "Updates every pack with a newer registry version, except held packs.";
    all.onclick = () => updateEveryPack(packs.filter(isInstalledUpdatable));
    controls.appendChild(all);
  }

  const cost = (pack) =>
    (pack.disabled ? null : startupCost.get(foldId(pack.dir)))?.seconds ?? -1;
  const age = (pack) => Number(pack.installed_at) || 0;

  const apply = () => {
    const mode = filterSel.value;
    const wanted = search.value.trim().toLowerCase();
    const rows = packs.filter((pack) => {
      if (mode === "updates" && !isInstalledUpdatable(pack)) return false;
      if (mode === "flagged" && !["flagged", "banned"].includes((pack.status || "").toLowerCase())) return false;
      if (mode === "off-registry" && pack.registry_id) return false;
      if (["registry", "github", "disk"].includes(mode) && pack.source !== mode) return false;
      if (trustedBox.checked && !byTrustedAuthor(pack)) return false;
      if (wanted && !`${pack.id} ${pack.dir} ${pack.repository || ""}`.toLowerCase().includes(wanted)) {
        return false;
      }
      return true;
    });
    const rank = (pack) => (pack.status === "banned" ? 0 : pack.status === "flagged" ? 1 : 2);
    const sorters = {
      name: (a, b) => a.id.localeCompare(b.id),
      status: (a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id),
      updatable: (a, b) => (isInstalledUpdatable(b) - isInstalledUpdatable(a)) || a.id.localeCompare(b.id),
      stars: (a, b) => (b.stars || 0) - (a.stars || 0) || a.id.localeCompare(b.id),
      slowest: (a, b) => cost(b) - cost(a) || a.id.localeCompare(b.id),
      newest: (a, b) => (age(b) || -Infinity) - (age(a) || -Infinity) || a.id.localeCompare(b.id),
      oldest: (a, b) => (age(a) || Infinity) - (age(b) || Infinity) || a.id.localeCompare(b.id),
      trusted: (a, b) => (byTrustedAuthor(b) - byTrustedAuthor(a)) || a.id.localeCompare(b.id),
    };
    rows.sort(sorters[sortSel.value] || sorters.name);
    list.replaceChildren();
    for (const pack of rows) list.appendChild(buildInstalledRow(pack));
    count.textContent = rows.length === packs.length
      ? `${rows.length} shown`
      : `${rows.length} of ${packs.length} shown`;
  };
  sortSel.addEventListener("change", () => { localStorage.setItem("om-installed-sort", sortSel.value); apply(); });
  filterSel.addEventListener("change", () => { localStorage.setItem("om-installed-filter", filterSel.value); apply(); });
  trustedBox.addEventListener("change", apply);
  const slowest = [...sortSel.options].find((one) => one.value === "slowest");
  if (slowest) slowest.disabled = !startupCost.size;
  if (slowest?.disabled && sortSel.value === "slowest") sortSel.value = "name";
  let searchTimer = 0;
  search.addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(apply, 150); });
  apply();

  const alerts = packs.filter((p) => !p.disabled && ["flagged", "banned"].includes((p.status || "").toLowerCase()));
  if (alerts.length) {
    const signature = alerts.map((p) => `${p.id}:${(p.status || "").toLowerCase()}`).sort().join("|");
    let dismissed = "";
    try { dismissed = localStorage.getItem(ALERTS_KEY) || ""; } catch {}
    if (dismissed !== signature) {
      const banner = buildInstalledAlert(alerts, () => {
        try { localStorage.setItem(ALERTS_KEY, signature); } catch {}
        banner.remove();
      });
      container.insertBefore(banner, container.firstChild);
    }
  }

  status.textContent = updatableCount
    ? `${packs.length} installed · ${updatableCount} update(s) available`
    : `${packs.length} installed`;

  renderCollisions(container, generation).catch(() => {});
}

const heldVersions = new Map();

async function loadHolds() {
  heldVersions.clear();
  try {
    const found = await (await api.fetchApi(`${API}/holds`)).json();
    for (const [name, held] of Object.entries(found.holds || {})) {
      heldVersions.set(foldId(name), held);
    }
  } catch {
  }
}

function holdKey(pack) {
  return String(pack.dir || pack.id || "").replace(/\.disabled$/, "");
}

function isHeld(pack) {
  return heldVersions.has(foldId(holdKey(pack))) || heldVersions.has(foldId(pack.id));
}

async function toggleHold(pack, refresh) {
  const off = isHeld(pack);
  const answer = await dlPost("/hold", {
    name: holdKey(pack), version: pack.version, off,
  });
  if (!answer.ok) {
    notify("Not changed", answer.reason || "The list of held packs could not be written.");
    return;
  }
  toast(off ? `${pack.id} will be offered updates again.`
            : `${pack.id} held at ${pack.version}.`, { kind: "ok" });
  refresh?.();
}

function isInstalledUpdatable(pack) {
  return !!pack.registry_id && !!updateTarget(pack, pack.latest);
}

const startupCost = new Map();
let startupTotal = 0;

async function loadStartupTimes() {
  startupCost.clear();
  startupTotal = 0;
  if (panelSetting("openManager.startupTimes", false) === false) return null;
  try {
    const found = await (await api.fetchApi(`${API}/startup`)).json();
    if (!found.ok) return found;
    for (const row of found.packs || []) startupCost.set(foldId(row.name), row);
    startupTotal = found.total || 0;
    return found;
  } catch {
    return null;
  }
}

async function togglePack(pack, refresh) {
  const off = !pack.disabled;
  const shown = pack.dir.replace(/\.disabled$/, "");
  const go = await chooseAction(off ? `Switch off ${shown}?` : `Switch on ${shown}?`, "",
    [{ key: "go", label: off ? "Switch off" : "Switch on", primary: true }],
    { wide: true, facts: [
      ["Pack", shown],
      ["Directory", off ? `${pack.dir} → ${pack.dir}.disabled` : `${pack.dir} → ${shown}`],
      ["Files", "Kept. Nothing is deleted."],
      ["Takes effect", "After ComfyUI restarts"],
    ] });
  if (!go) return;
  const answer = await dlPost("/pack/toggle", { name: pack.dir, off });
  if (!answer.ok) { notify("Not changed", answer.reason || "The directory could not be renamed."); return; }
  toast(`${shown} switched ${off ? "off" : "on"}.`, { kind: "ok" });
  if (answer.restart) remindRestart();
  refresh?.();
}

function installedText(when) {
  const days = Math.floor((Date.now() - when.getTime()) / 86400000);
  if (!Number.isFinite(days) || days < 0) return "installed";
  if (days < 1) return "installed today";
  if (days < 30) return `installed ${days}d ago`;
  if (days < 365) return `installed ${Math.floor(days / 30)}mo ago`;
  const years = Math.floor(days / 365);
  return `installed ${years}y ago`;
}

function whenText(when) {
  const days = Math.floor((Date.now() - when.getTime()) / 86400000);
  if (!Number.isFinite(days) || days < 0) return "";
  if (days < 1) return "today";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function buildInstalledRow(pack) {
  const updatable = isInstalledUpdatable(pack);
  const row = el("div", "om-side-row");
  row._installedVersion = pack.version;
  row.appendChild(packIcon(pack.icon, pack.id));

  const text = el("div", "om-side-text");
  text.appendChild(packName(pack.id, "om-side-name"));
  const meta = el("div", "om-side-meta");
  const shownDir = pack.disabled ? pack.dir.replace(/\.disabled$/, "") : pack.dir;
  meta.appendChild(document.createTextNode(`${pack.version}${shownDir !== pack.id ? " · " + shownDir : ""}`));
  const istars = starCount(pack.stars);
  if (istars) meta.appendChild(istars);
  const SOURCES = {
    github: ["from a repository", "cloned or installed from a Git URL; it updates from there"],
    registry: ["from the registry", "installed from the Comfy Registry"],
    disk: ["on disk only", "placed by hand: no registry entry and no repository to update "
           + "from"],
  };
  const origin = SOURCES[pack.source];
  if (origin) {
    const mark = el("span", `om-src om-src-${pack.source}`, origin[0]);
    mark.title = origin[1];
    meta.appendChild(mark);
  }
  if (pack.installed_at) {
    const when = new Date(pack.installed_at * 1000);
    const since = el("span", "om-side-when", installedText(when));
    since.title = `Installed ${when.toLocaleString()}.`;
    meta.appendChild(since);
  }
  if (pack.disabled) meta.appendChild(el("span", "om-disabled", "disabled"));
  if (isHeld(pack)) {
    const badge = el("span", "om-held", `held at ${pack.version}`);
    badge.title = "No update is offered for this pack until the hold is lifted.";
    meta.appendChild(badge);
  }
  const cost = pack.disabled ? null : startupCost.get(foldId(pack.dir));
  if (cost) {
    const badge = el("span", "om-cost", `${cost.seconds.toFixed(2)}s`);
    badge.title = startupTotal
      ? `Took ${cost.seconds.toFixed(2)}s of the ${startupTotal.toFixed(1)}s ComfyUI spent importing packs`
      : `Took ${cost.seconds.toFixed(2)}s to import`;
    if (startupTotal && cost.seconds >= startupTotal * 0.2) badge.classList.add("om-cost-high");
    meta.appendChild(badge);
  }
  if (cost?.failed) meta.appendChild(el("span", "om-upd om-cost-failed", "import failed"));
  if (updatable) meta.appendChild(el("span", "om-upd", `update → ${pack.latest}`));
  else if (selfUpdateTarget(pack)) {
    meta.appendChild(el("span", "om-upd", `update → ${selfUpdateTarget(pack)}`));
  }
  text.appendChild(meta);
  if (pack.registry_id) text.onclick = () => openPack(pack.registry_id);
  else if (pack.repository) text.onclick = () => openRepoPack({ repo: pack.repository, title: pack.id, classes: [] });
  row.appendChild(text);

  const current = { version: pack.version, status: "active",
                    name: pack.registry_id || pack.id };
  const items = installedMenu(pack, null, () => control, row,
    () => refreshInstalledIfActive());

  const control = makeInstallControl({
    packId: pack.registry_id || pack.id,
    entry: current,
    rowsRoot: row,
    withMenu: true,
    items,
  });
  const vstatus = (pack.status || "").toLowerCase();
  const mine = selfUpdateTarget(pack);
  if (mine) {
    control.setUpdate(mine, () => openAboutDialog());
    control.el.querySelector(".om-btn").title =
      `Version ${mine} is published. Open Manager updates from About and updates.`;
  } else if (vstatus === "banned" || vstatus === "flagged") {
    control.setStatusInstalled(vstatus);
  } else if (updatable) {
    control.setUpdate(pack.latest, () => updateInstalled(pack, row, control));
  } else {
    control.setInstalled();
  }
  control.el.classList.add("om-side-ictl");
  row.appendChild(control.el);
  return row;
}

async function updateEveryPack(packs) {
  if (!packs.length) return;
  const facts = packs.slice(0, 24).map((pack) => [pack.id, `${pack.version} -> ${pack.latest}`]);
  if (packs.length > facts.length) {
    facts.push(["And more", `${packs.length - facts.length} others`]);
  }
  facts.push(["One at a time", "Each finishes before the next starts."]);
  facts.push(["Dependencies", "Each pack installs its own requirements."]);
  facts.push(["Held packs", "Left alone"]);
  facts.push(["Takes effect", "After ComfyUI restarts"]);
  const go = await chooseAction(`Update ${packs.length} pack${packs.length === 1 ? "" : "s"}?`,
    "", [{ key: "go", label: "Update them", primary: true }], { wide: true, facts });
  if (!go) return;

  const scanFirst = vtReady() && panelSetting("openManager.scanOnInstall", false) === true
                    && (await vtRemaining()) > 0;
  for (const pack of packs) {
    enqueueInstall({
      packId: pack.registry_id,
      entry: { version: pack.latest, status: "active", name: pack.registry_id || pack.id },
      overwrite: true,
      name: pack.id,
      scanFirst,
    });
  }
}

const ALERTS_KEY = "openManager.installedAlertsDismissed";
const COLLIDE_KEY = "openManager.collisionsDismissed";

async function renderCollisions(container, generation) {
  let found;
  try {
    found = await (await api.fetchApi(`${API}/collisions`)).json();
  } catch {
    return;
  }
  if (!viewIsCurrent(generation)) return;
  const groups = found?.ok ? (found.groups || []) : [];
  if (!groups.length) return;
  const signature = groups.map((one) => `${one.node}:${one.packs.join(",")}`).sort().join("|");
  let dismissed = "";
  try { dismissed = localStorage.getItem(COLLIDE_KEY) || ""; } catch {}
  if (dismissed === signature) return;

  const banner = el("div", "om-alert");
  const body = el("div", "om-alert-body");
  body.appendChild(el("b", null,
    `${groups.length} node name${groups.length === 1 ? " is" : "s are"} claimed by more than `
    + "one pack"));
  const names = [...new Set(groups.flatMap((one) => one.packs))];
  body.appendChild(el("div", "om-alert-names", names.join(", ")));
  const more = el("button", "om-btn om-dl-btn om-alert-more", "What collides");
  more.onclick = () => showCollisions(groups);
  body.appendChild(more);
  banner.appendChild(body);
  const dismiss = el("button", "om-alert-x", "×");
  dismiss.title = "Dismiss until this changes";
  dismiss.onclick = () => {
    try { localStorage.setItem(COLLIDE_KEY, signature); } catch {}
    banner.remove();
  };
  banner.appendChild(dismiss);
  container.insertBefore(banner, container.firstChild);
}

function showCollisions(groups) {
  const facts = groups.slice(0, 40).map((one) => [
    one.node,
    one.loaded
      ? `${one.packs.join(", ")} - ${one.loaded} is the one in use`
      : one.packs.join(", "),
  ]);
  if (groups.length > facts.length) {
    facts.push(["And more", `${groups.length - facts.length} others`]);
  }
  facts.push(["Effect", "A graph saved with another pack's node loads the one in use."]);
  chooseAction("Node names claimed twice", "", [], { wide: true, facts });
}

function buildInstalledAlert(list, onDismiss) {
  const banned = list.filter((p) => (p.status || "").toLowerCase() === "banned").length;
  const flagged = list.length - banned;
  const plural = (n) => (n === 1 ? "" : "s");
  let headline;
  if (banned && flagged) headline = `${list.length} installed packs flagged or banned by the registry`;
  else if (banned) headline = `${banned} installed pack${plural(banned)} banned by the registry`;
  else headline = `${flagged} installed pack${plural(flagged)} flagged by the registry`;

  const banner = el("div", `om-alert${banned ? " om-alert-danger" : ""}`);
  const body = el("div", "om-alert-body");
  body.appendChild(el("b", null, headline));
  const names = [...new Set(list.map((p) => p.dir || p.id))];
  body.appendChild(el("div", "om-alert-names", names.join(", ")));
  banner.appendChild(body);
  const dismiss = el("button", "om-alert-x", "×");
  dismiss.title = "Dismiss until this changes";
  dismiss.onclick = onDismiss;
  banner.appendChild(dismiss);
  return banner;
}

export { isRelease, updateInstalled, renderInstalled, isHeld, toggleHold, isInstalledUpdatable, togglePack, installedText, whenText };
