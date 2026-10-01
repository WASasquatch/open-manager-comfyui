import { api } from "../../../scripts/api.js";
import { API } from "./base.mjs";
import { el, openUrl, badge, closeOn, stateRow, findingCard, toastHost, toastShut, toast, notify, confirmAction, chooseAction, openRowMenu, panel, countNote } from "./ui.mjs";
import { scanThenFinish, openScanDialog } from "./packs.mjs";
import { loadingBlock } from "./markdown.mjs";
import { keysHeld, openAboutDialog, vtReady, vtRemaining, panelSetting } from "./settings.mjs";
import { quickInstall } from "./pack-extras.mjs";
import { countText, dayText } from "./results.mjs";
import { refreshInstalledIfActive } from "./discovery.mjs";
import { isRelease, updateInstalled, isHeld, toggleHold, isInstalledUpdatable, togglePack } from "./installed.mjs";
import { sinceText, allowBanned, browseTopic } from "./registry.mjs";
import { dlPost } from "./downloads.mjs";

async function appendImpact(packId, version, slot, gate) {
  slot.replaceChildren(el("div", "om-why", "Checking dependencies..."));
  let report;
  try {
    const answer = await api.fetchApi(
      `${API}/impact/${encodeURIComponent(packId)}/${encodeURIComponent(version)}`
    );
    report = await answer.json();
    if (!answer.ok) throw new Error(report.detail || `HTTP ${answer.status}`);
  } catch (error) {
    slot.replaceChildren(el("div", "om-why", `Dependency impact unavailable: ${error.message}`));
    return;
  }

  slot.replaceChildren();
  if (report.additive_only) {
    slot.appendChild(stateRow("No dependency changes"));
  } else {
    for (const finding of report.findings || []) slot.appendChild(findingCard(finding));
  }
  if (report.dependencies?.length) slot.appendChild(dependencyList(report.dependencies));
  const replacements = report.replacements || [];
  if (replacements.some((item) => item.abi)) {
    gate.textContent = "Install anyway (breaks binary packages)";
    gate.className = "om-btn om-danger";
  } else if (replacements.some((item) => item.core && item.direction === "downgrade")) {
    gate.textContent = "Downgrade dependencies and install";
    gate.className = "om-btn om-danger";
  }
}

const DEP_STATE = {
  satisfied: { label: "installed", color: "#3fb950" },
  missing: { label: "not installed", color: "var(--om-muted)" },
  conflict: { label: "conflict", color: "#f85149" },
  vcs: { label: "from git URL", color: "#d29922" },
  unparsed: { label: "unreadable", color: "var(--om-muted)" },
};

function dependencyList(dependencies) {
  const wrap = el("div", "om-deps");
  wrap.appendChild(el("div", "om-deps-head", `Requirements (${dependencies.length})`));
  for (const dep of dependencies) {
    const state = DEP_STATE[dep.status] || DEP_STATE.unparsed;
    const row = el("div", "om-dep");
    row.appendChild(el("span", "om-dep-name", dep.name + (dep.spec ? " " + dep.spec : "")));
    const right = el("span", "om-dep-status");
    let text = state.label;
    if (dep.status === "satisfied" || dep.status === "conflict") text = `have ${dep.installed} · ${state.label}`;
    if (dep.status === "conflict" && dep.core) text += " with ComfyUI";
    right.textContent = text;
    right.style.color = (dep.status === "conflict" && dep.core) ? "#f85149" : state.color;
    row.appendChild(right);
    wrap.appendChild(row);
  }
  return wrap;
}

function compareVersions(a, b) {
  const pa = String(a).split(".");
  const pb = String(b).split(".");
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const x = parseInt(pa[i] ?? "0", 10);
    const y = parseInt(pb[i] ?? "0", 10);
    if (Number.isNaN(x) || Number.isNaN(y)) return String(a).localeCompare(String(b));
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

function versionSwitch(installed, chosen) {
  if (!installed || installed === "present" || installed === chosen) return null;
  const cmp = compareVersions(chosen, installed);
  return { from: installed, to: chosen, direction: cmp < 0 ? "downgrade" : cmp > 0 ? "upgrade" : "reinstall" };
}

const INSTALL_POLICIES = [
  ["new", "Skip anything that would change an installed package"],
  ["upgrade", "Allow upgrades, skip downgrades"],
  ["downgrade", "Allow downgrades, skip upgrades"],
  ["all", "Install everything the pack asks for"],
];

function installPolicyDefault() {
  const held = String(panelSetting("openManager.installPolicy", "new") || "new");
  return INSTALL_POLICIES.some(([value]) => value === held) ? held : "new";
}

function confirmInstall(packId, entry, change) {
  return new Promise((resolve) => {
    const backdrop = el("div", "om-backdrop");
    const dialog = el("div", "om-dialog");
    dialog.style.width = "min(90vw, 900px)";
    dialog.style.height = "auto";
    dialog.style.maxHeight = "90vh";

    const head = el("div", "om-head");
    head.appendChild(el("div", "om-title", `Install ${packId} ${entry.version}`));
    head.appendChild(badge(entry.status));
    dialog.appendChild(head);

    const body = el("div", "om-body");
    const assessment = entry.assessment || { findings: [], acknowledgement: "" };

    if (change) {
      const banner = el("div", change.direction === "downgrade" ? "om-ack" : "om-notice");
      const verb = { downgrade: "Downgrade", upgrade: "Upgrade", reinstall: "Reinstall" }[change.direction];
      banner.appendChild(el("b", null, `${verb} from ${change.from} to ${change.to}`));
      banner.appendChild(el("div", null, `The installed version ${change.from} is removed first, then ${change.to} is installed.`));
      body.appendChild(banner);
    }

    if (!assessment.findings.length) {
      body.appendChild(stateRow("All clear"));
    }
    for (const finding of assessment.findings) {
      body.appendChild(findingCard(finding));
    }

    body.appendChild(el("h4", null, "What this would change here"));
    const impactSlot = el("div");
    body.appendChild(impactSlot);

    const policyRow = el("div", "om-policy");
    const policyPick = el("select", "om-side-select om-policy-pick");
    for (const [value, label] of INSTALL_POLICIES) {
      const option = el("option", null, label);
      option.value = value;
      policyPick.appendChild(option);
    }
    policyPick.value = installPolicyDefault();
    policyRow.appendChild(el("span", "om-policy-label", "Requirements"));
    policyRow.appendChild(policyPick);
    body.appendChild(policyRow);

    if (assessment.acknowledgement) {
      body.appendChild(el("div", "om-ack", assessment.acknowledgement));
    }
    dialog.appendChild(body);

    const label = change
      ? { downgrade: "Downgrade and install", upgrade: "Upgrade", reinstall: "Reinstall" }[change.direction]
      : (assessment.findings.length ? "Install anyway" : "Install");
    const danger = change?.direction === "downgrade" || assessment.severity === "critical";
    const foot = el("div", "om-foot");
    const cancel = el("button", "om-btn", "Cancel");
    const go = el("button", `om-btn ${danger ? "om-danger" : "om-go"}`, label);
    cancel.onclick = () => { backdrop.remove(); resolve(null); };
    go.onclick = () => { backdrop.remove(); resolve(policyPick.value); };
    foot.appendChild(cancel);
    foot.appendChild(go);
    dialog.appendChild(foot);

    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);
    closeOn(backdrop, () => { backdrop.remove(); resolve(null); });

    appendImpact(packId, entry.version, impactSlot, go);
  });
}

let restartToast = null;

function remindRestart() {
  if (restartToast) return;
  const node = el("div", "om-toast om-toast-warn om-restart");
  node.appendChild(el("span", "om-toast-text", "Restart to load the changes."));
  const button = el("button", "om-btn om-go", "Restart server");
  button.onclick = () => restartServer(button);
  node.appendChild(button);
  toastShut(node, () => { if (restartToast === node) restartToast = null; });
  toastHost().appendChild(node);
  restartToast = node;
}

async function restartServer(button) {
  button.disabled = true;
  button.textContent = "Restarting...";
  try {
    await api.fetchApi(`${API}/reboot`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
    });
  } catch (error) {
  }
  const started = Date.now();
  const waitForUp = async () => {
    try {
      const answer = await api.fetchApi("/system_stats", { cache: "no-store" });
      if (answer.ok) { location.reload(); return; }
    } catch (error) {
    }
    if (Date.now() - started < 180000) {
      setTimeout(waitForUp, 1500);
    } else {
      button.disabled = false;
      button.textContent = "Restart server";
      notify("Restart timed out", "The server did not come back within three minutes.");
    }
  };
  setTimeout(waitForUp, 3000);
}

function makeInstallControl({ packId, entry, rowsRoot, withMenu, onInstall, items }) {
  const wrap = el("span", "om-ictl");
  const control = { el: wrap };
  wrap._control = control;

  const button = (text, cls, onclick) => {
    const b = el("button", cls, text);
    if (onclick) b.onclick = onclick;
    else b.disabled = true;
    return b;
  };
  const caretFor = (cls) => {
    const caret = el("button", `om-btn ${cls} om-caret`, "▾");
    caret.title = "Options";
    caret.onclick = (event) => {
      event.stopPropagation();
      openRowMenu(caret, { packId, entry, control, rowsRoot, items });
    };
    return caret;
  };

  control.setInstall = (verb) => {
    const label = button(verb || "Install", "om-btn",
      onInstall || (() => install({ packId, entry, control, rowsRoot })));
    if (verb) label.title = `${verb} to ${entry?.version || ""}`.trim();
    if (!withMenu || !items?.length) { wrap.replaceChildren(label); return; }
    wrap.replaceChildren(label, caretFor(""));
  };
  control.setQueued = () => wrap.replaceChildren(button("Queued", "om-btn"));
  control.setInstalling = () => wrap.replaceChildren(button("Installing", "om-btn installing"));
  control.setInstalled = () => {
    const label = button("Installed", "om-btn installed");
    if (!withMenu) { wrap.replaceChildren(label); return; }
    wrap.replaceChildren(label, caretFor("installed"));
  };
  control.setUpdate = (target, onUpdate) => {
    const label = button("Update", "om-btn installing", onUpdate);
    label.title = `Update to ${target}`;
    if (!withMenu) { wrap.replaceChildren(label); return; }
    wrap.replaceChildren(label, caretFor("installing"));
  };
  control.setStatusInstalled = (status) => {
    const cls = status === "banned" ? "banned" : status === "flagged" ? "flagged" : "installed";
    const label = button("Installed", `om-btn ${cls}`);
    label.title = `The installed version is ${status} by the registry`;
    if (!withMenu) { wrap.replaceChildren(label); return; }
    wrap.replaceChildren(label, caretFor(cls));
  };
  return control;
}

const installState = new Map();

const installedIndex = new Map();

const foldId = (value) => String(value ?? "").trim().toLowerCase().replace(/_/g, "-");

function indexInstalled(packs) {
  installedIndex.clear();
  const better = (candidate, held) => {
    if (!held) return true;
    if (Boolean(held.disabled) !== Boolean(candidate.disabled)) return !candidate.disabled;
    return compareVersions(candidate.version || "", held.version || "") > 0;
  };
  for (const pack of packs || []) {
    for (const key of [pack.registry_id, pack.id, pack.dir]) {
      const folded = foldId(key);
      if (!folded) continue;
      if (folded === foldId(pack.dir) || better(pack, installedIndex.get(folded))) {
        installedIndex.set(folded, pack);
      }
    }
  }
}

async function loadInstalledIndex() {
  try {
    const answer = await api.fetchApi(`${API}/installed`);
    const data = await answer.json();
    if (answer.ok) indexInstalled(data.packs);
  } catch {
  }
}

function installedPack(packId) {
  return installedIndex.get(foldId(packId)) || null;
}

function updateTarget(record, newest) {
  if (!record || !newest) return "";
  if (!isRelease(record.version) || !isRelease(newest)) return "";
  if (isHeld(record)) return "";
  return compareVersions(newest, record.version) > 0 ? String(newest) : "";
}

const COMFY_LEAD = /^comfy[\s_-]?ui[\s_.-]+/i;
const COMFY_TRAIL = /[\s_.-]+comfy[\s_-]?ui$/i;

const NAME_FLOOR = 4;

function shortPackName(name) {
  const text = String(name || "").trim();
  const cut = text.replace(COMFY_LEAD, "").replace(COMFY_TRAIL, "").trim();
  return cut.length >= NAME_FLOOR ? cut : text;
}

function packName(name, cls) {
  const text = String(name || "");
  const shown = shortPackName(text);
  const holder = el("span", cls, shown);
  if (shown !== text) holder.title = text;
  return holder;
}

function versionFacts(entry) {
  const when = (entry.created_at || "").slice(0, 10);
  const lines = [[entry.version, entry.status, when && `published ${when}`]
    .filter(Boolean).join(" · ")];
  if (entry.deprecated) lines.push("Deprecated by the publisher. It still installs.");
  for (const note of entry.compatibility?.notes || []) {
    if (!note.declared) continue;
    lines.push(note.state === "differs"
      ? `Declares ${note.label} ${note.declared}; this install reports ${note.yours}.`
      : `Declares ${note.label} ${note.declared}.`);
  }
  const deps = (entry.dependencies || []).length;
  if (deps) lines.push(`${deps} requirement${deps === 1 ? "" : "s"}.`);
  const tally = new Map();
  for (const found of entry.assessment?.findings || []) {
    if (/^(Marked deprecated|Declared )/.test(found.title)) continue;
    tally.set(found.title, (tally.get(found.title) || 0) + 1);
  }
  for (const [title, count] of [...tally].slice(0, 4)) {
    lines.push(count > 1 ? `${title} (×${count})` : title);
  }
  return lines.join("\n");
}

function registryControl(entry, cls) {
  if (entry.is_self) {
    const here = el("div", `om-ictl ${cls}`);
    const button = el("button", "om-btn", "About");
    button.title = "About and updates";
    button.onclick = (event) => { event.stopPropagation(); openAboutDialog(); };
    here.appendChild(button);
    return { el: here, setInstall() {}, setInstalled() {}, setQueued() {}, setInstalling() {},
             setUpdate() {}, setStatusInstalled() {} };
  }
  const onDisk = installedPack(entry.id);
  let control;
  control = makeInstallControl({
    packId: entry.id,
    entry,
    withMenu: Boolean(onDisk),
    items: onDisk ? installedMenu(onDisk, entry, () => control, null) : [],
    onInstall: () => quickInstall(entry.id, control),
  });
  restoreInstall(entry.id, control);
  const ahead = updateTarget(onDisk, entry.advertised);
  const busy = installState.get(entry.id);
  if (ahead && (!busy || busy === "installed")) {
    control.setUpdate(ahead, () => quickInstall(entry.id, control));
  }
  control.el.classList.add(cls);
  return control;
}

function installedMenu(record, entry, getControl, rowsRoot, refresh) {
  const items = [];
  if (!record) return items;
  const again = refresh || refreshInstalledIfActive;
  const current = entry
    || { version: record.version, status: "active", name: record.registry_id || record.id };

  if (isInstalledUpdatable(record)) {
    items.push({ label: `Update to ${record.latest}`,
                 fn: () => updateInstalled(record, rowsRoot, getControl()) });
  }
  if (record.registry_id) {
    items.push({ label: "Reinstall",
                 fn: () => install({ packId: record.registry_id, entry: current,
                                     control: getControl(), rowsRoot, overwrite: true }) });
  } else if (record.repository) {
    items.push({ label: "Reinstall from GitHub",
                 fn: () => installFromRepo({ repo: record.repository, title: record.id,
                                             overwrite: true, classes: [] }, getControl()) });
  }
  if (vtReady()) items.push({ label: "Scan install", fn: () => openScanDialog(record.id) });
  if (record.registry_id) {
    items.push({ label: isHeld(record) ? "Stop holding this version"
                                       : `Hold at ${record.version}`,
                 fn: () => toggleHold(record, again) });
  }
  if (record.dir) {
    items.push({ label: record.disabled ? "Switch on" : "Switch off",
                 fn: () => togglePack(record, again) });
  }
  items.push({
    label: "Uninstall",
    danger: true,
    fn: () => uninstall({
      packId: record.id,
      entry: entry || { name: record.id },
      control: getControl(),
      rowsRoot,
      registryId: record.registry_id || entry?.id || "",
    }),
  });
  return items;
}

function rememberInstall(packId, state) {
  if (!packId) return;
  if (state) installState.set(packId, state);
  else installState.delete(packId);
}

function restoreInstall(packId, control) {
  const state = installState.get(packId);
  if (state === "queued") control.setQueued();
  else if (state === "installing") control.setInstalling();
  else if (state === "installed") control.setInstalled();
  else if (installedPack(packId)) control.setInstalled();
  else control.setInstall();
}

const installQueue = [];
let queueTotal = 0;
let queueRunning = false;

function enqueueInstall(job) {
  installQueue.push(job);
  queueTotal += 1;
  job.control?.setQueued();
  rememberInstall(job.packId, "queued");
  if (!queueRunning) runInstallQueue();
}

async function runInstallQueue() {
  queueRunning = true;
  const restoreOffers = [];
  const failures = [];
  const progress = toast("", { sticky: true });
  let done = 0;
  const issues = [];
  while (installQueue.length) {
    const job = installQueue.shift();
    done += 1;
    progress.set(`${done} of ${queueTotal}: installing ${job.name} ${job.entry.version}...`);
    job.control?.setInstalling();
    rememberInstall(job.packId, "installing");
    let result;
    try {
      const answer = await api.fetchApi(`${API}/install`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: job.packId, version: job.entry.version,
          status: job.entry.status, overwrite: !!job.overwrite,
          allow_banned: allowBanned(),
          with_deps: !job.scanFirst,
          policy: job.policy || installPolicyDefault(),
        }),
      });
      result = await answer.json();
    } catch (error) {
      result = { ok: false, reason: error.message };
    }
    if (result.ok) {
      if (job.rowsRoot) {
        job.rowsRoot._installedVersion = job.entry.version;
        job.rowsRoot.querySelectorAll(".om-ictl").forEach((w) => {
          if (w !== job.control.el && w._control) w._control.setInstall();
        });
      }
      job.control?.setInstalled();
      rememberInstall(job.packId, "installed");
      loadInstalledIndex();
      if (job.scanFirst) await scanThenFinish(job.packId);
      job.onDone?.(result);
      if (result.pip_ran && !result.pip_ok) {
        const summary = environmentSummary(result.environment);
        const first = (result.pip_errors || [])[0];
        issues.push(`${job.name}: ${first || "requirements did not install cleanly"}`);
        failures.push({ job, result, summary });
      }
    } else {
      job.control?.setInstall();
      rememberInstall(job.packId, null);
      issues.push(`${job.name} ${job.entry.version}: ${result.reason}`);
      if (result.environment_id) restoreOffers.push({ id: result.environment_id, name: job.name });
      job.onDone?.(result);
    }
  }
  queueTotal = 0;
  queueRunning = false;
  for (const failure of failures) {
    const choice = await showInstallFailure(failure.job, failure.result).catch(() => "");
    if (choice === "restore" && failure.result.environment_id) {
      await offerRestore(failure.result.environment_id, failure.job.name).catch(() => {});
    }
  }
  for (const offer of restoreOffers) {
    await offerRestore(offer.id, offer.name).catch(() => {});
  }
  if (issues.length) {
    progress.settle(`Finished with ${issues.length} issue(s).`, "warn", 9000);
    notify("Install issues", issues.join("\n"));
  } else {
    progress.settle(`${done} pack(s) installed.`, "ok", 6000);
  }
  if (done > issues.length) remindRestart();
}

async function openEnvironmentDialog() {
  const backdrop = el("div", "om-backdrop");
  const box = el("div", "om-note om-note-wide");
  box.appendChild(el("div", "om-note-title", "Environment changes"));
  box.appendChild(el("div", "om-dl-note",
    "Installs that changed packages, newest first. Restoring needs a restart."));
  const list = el("div", "om-keys");
  list.appendChild(loadingBlock("Reading the record"));
  box.appendChild(list);

  const foot = el("div", "om-note-foot");
  const close = el("button", "om-btn", "Close");
  close.onclick = () => backdrop.remove();
  foot.appendChild(close);
  box.appendChild(foot);
  backdrop.appendChild(box);
  document.body.appendChild(backdrop);
  closeOn(backdrop);

  const paint = async () => {
    let data;
    try {
      data = await (await api.fetchApi(`${API}/environment`)).json();
    } catch (error) {
      list.replaceChildren(el("div", "om-side-status",
        `The record could not be read: ${error.message}`));
      return;
    }
    const entries = data?.entries || [];
    if (!entries.length) {
      list.replaceChildren(el("div", "om-side-status",
        "No package changes recorded."));
      return;
    }
    list.replaceChildren();
    for (const entry of entries) {
      const row = el("div", "om-keys-row");
      const head = el("div", "om-dl-top");
      head.appendChild(el("span", "om-dl-name", `${entry.pack} ${entry.version}`));
      head.appendChild(el("span", "om-dl-src", sinceText(entry.at)));
      row.appendChild(head);
      row.appendChild(el("div", "om-dl-note", environmentSummary(entry.diff) || "no change"));

      const changed = [...(entry.diff?.changed || [])]
        .map((c) => `${c.name} ${c.was} \u2192 ${c.now}`);
      const added = (entry.diff?.added || []).map((a) => `${a.name} ${a.version}`);
      const removed = (entry.diff?.removed || []).map((r) => `${r.name} ${r.version}`);
      const detail = panel("What changed",
        countNote((entry.diff?.total) || 0, "package"), { open: false });
      const body = el("div", "om-chg");
      for (const [label, items] of [["Changed", changed], ["Added", added],
                                    ["Removed", removed]]) {
        if (!items.length) continue;
        const part = el("div", "om-chg-item");
        part.appendChild(el("div", "om-node-name", label));
        part.appendChild(el("div", "om-chg-text", items.join("\n")));
        body.appendChild(part);
      }
      detail.body.appendChild(body);
      row.appendChild(detail);

      const line = el("div", "om-keys-line");
      const undo = el("button", "om-btn om-danger", "Restore packages");
      undo.title = "Put these packages back as they were before this install";
      undo.onclick = async () => {
        backdrop.remove();
        await offerRestore(entry.id, `${entry.pack} ${entry.version}`);
      };
      line.appendChild(undo);
      const drop = el("button", "om-btn", "Forget");
      drop.title = "Remove this record. Nothing is uninstalled.";
      drop.onclick = async () => {
        await dlPost("/environment/forget", { id: entry.id });
        await paint();
      };
      line.appendChild(drop);
      row.appendChild(line);
      list.appendChild(row);
    }
  };
  paint();
}

async function showInstallFailure(job, result) {
  const backdrop = el("div", "om-backdrop");
  const box = el("div", "om-note om-note-wide");
  box.appendChild(el("div", "om-note-title",
    `${job.name}: requirements did not install`));
  box.appendChild(el("div", "om-dl-note",
    "The pack is on disk but may not load, or may load with parts missing."));

  const ran = result.installer === "uv" ? "uv" : "pip";
  const errors = result.pip_errors || [];
  if (errors.length) {
    const why = el("div", "om-keys-row");
    why.appendChild(el("div", "om-dl-name", `What ${ran} said`));
    const lines = el("div", "om-chg-text om-pip-errors");
    lines.textContent = errors.join("\n");
    why.appendChild(lines);
    box.appendChild(why);
  }

  const asked = result.pip_requirements || [];
  if (asked.length) {
    const what = panel("What it asked for", countNote(asked.length, "requirement"),
      { open: false });
    const body = el("div", "om-chg-text");
    body.textContent = asked.join("\n");
    what.body.appendChild(body);
    box.appendChild(what);
  }

  if (result.pip_output) {
    const log = panel(`${ran} output`, "the last of it", { open: !errors.length });
    const body = el("div", "om-chg-text");
    body.textContent = result.pip_output;
    log.body.appendChild(body);
    box.appendChild(log);
  }

  const summary = environmentSummary(result.environment);
  box.appendChild(el("div", "om-dl-note", summary
    ? `Python environment changed: ${summary}.`
    : "Nothing in your Python environment was changed."));

  const foot = el("div", "om-note-foot");
  let choice = "";
  const copy = el("button", "om-btn", "Copy output");
  copy.onclick = () => {
    const all = [errors.join("\n"), result.pip_output].filter(Boolean).join("\n\n");
    navigator.clipboard?.writeText(all)
      .then(() => toast("Output copied.", { kind: "ok" }))
      .catch(() => notify("Not copied", "The clipboard is not available here."));
  };
  foot.appendChild(copy);
  if (result.environment_id && summary) {
    const undo = el("button", "om-btn om-danger", "Restore packages");
    undo.title = "Put the packages back as they were before this install";
    undo.onclick = () => { choice = "restore"; backdrop.remove(); };
    foot.appendChild(undo);
  }
  const keep = el("button", "om-btn om-go", "Leave it");
  keep.onclick = () => { choice = "keep"; backdrop.remove(); };
  foot.appendChild(keep);
  box.appendChild(foot);
  backdrop.appendChild(box);
  document.body.appendChild(backdrop);
  closeOn(backdrop);

  await new Promise((resolve) => {
    const watch = new MutationObserver(() => {
      if (!backdrop.isConnected) { watch.disconnect(); resolve(); }
    });
    watch.observe(document.body, { childList: true });
  });
  return choice;
}

function environmentSummary(diff) {
  if (!diff?.total) return "";
  const parts = [];
  if (diff.added.length) parts.push(countNote(diff.added.length, "package") + " added");
  const down = diff.changed.filter((c) => c.direction === "downgraded").length;
  if (diff.changed.length) {
    parts.push(`${diff.changed.length} changed${down ? ` (${down} downgraded)` : ""}`);
  }
  if (diff.removed.length) parts.push(`${diff.removed.length} removed`);
  return parts.join(", ");
}

async function offerRestore(entryId, packName) {
  let preview;
  try {
    preview = await dlPost("/environment/restore", { id: entryId });
  } catch (error) {
    notify("Could not read the record", error.message);
    return;
  }
  if (!preview?.ok) {
    notify("Could not read the record", preview?.reason || "");
    return;
  }
  const plan = preview.plan || {};
  const facts = [];
  if (plan.uninstall?.length) facts.push(["Uninstall", plan.uninstall.join(", ")]);
  if (plan.install?.length) facts.push(["Put back", plan.install.join(", ")]);
  for (const one of plan.refused || []) {
    facts.push([`Left alone: ${one.name}`, one.reason]);
  }
  facts.push(["Afterwards", "ComfyUI needs a restart."]);
  if (!plan.uninstall?.length && !plan.install?.length) {
    notify("Nothing to put back",
      "Everything this install changed is left alone: pip or ComfyUI depends on it.");
    return;
  }

  const go = await chooseAction(`Restore packages to before ${packName}?`,
    "Packs installed since may depend on these packages.",
    [{ key: "go", label: "Restore packages", primary: true, danger: true }],
    { wide: true, facts });
  if (!go) return;

  const progress = toast("Restoring packages...", { sticky: true });
  const outcome = await dlPost("/environment/restore", { id: entryId, confirm: true });
  const failed = (outcome?.steps || []).filter((step) => !step.ok);
  if (outcome?.ok) {
    progress.settle("Packages restored.", "ok", 7000);
  } else {
    progress.settle("The restore did not finish.", "warn", 9000);
    notify("Restore incomplete",
      "The environment is part way between the two states. What failed:\n\n"
      + failed.map((step) => `${step.action}: ${step.output}`).join("\n\n"));
  }
  if (outcome?.restart_required) remindRestart();
}

async function install({ packId, entry, control, rowsRoot, overwrite,
                         installedVersion = "", onDone = null }) {
  if (entry.installable === false) {
    notify(`${packId} ${entry.version} is blocked`,
      entry.blocked_reason
      || "Blocked by policy. Open Manager's settings decide whether banned versions install.");
    return false;
  }
  const installed = rowsRoot ? rowsRoot._installedVersion : installedVersion;
  const change = versionSwitch(installed, entry.version);
  if (panelSetting("openManager.trustRegistry", false) === true) {
    const repository = await repositoryForPack(packId, entry, rowsRoot);
    const parts = repoOwnerName(repository);
    if (parts && !(await confirmAuthorTrust(parts.owner, repository, "install a pack"))) return false;
  }
  const policy = await confirmInstall(packId, entry, change);
  if (!policy) return false;

  let scanFirst = vtReady() && panelSetting("openManager.scanOnInstall", false) === true;
  if (scanFirst && (await vtRemaining()) === 0) {
    const go = await confirmAction(
      "VirusTotal allowance spent",
      `${packId} cannot be scanned before it installs. Install without scanning?`,
      "Skip scan and install",
    );
    if (!go) return false;
    scanFirst = false;
  }

  enqueueInstall({
    packId, entry, control, rowsRoot,
    overwrite: overwrite || !!change,
    name: entry.name || packId,
    scanFirst,
    policy,
    onDone,
  });
  return true;
}

const trustedAuthors = new Set();

async function loadTrustedAuthors() {
  try {
    const answer = await api.fetchApi(`${API}/trust`);
    const authors = (await answer.json()).authors || [];
    trustedAuthors.clear();
    for (const row of authors) trustedAuthors.add(foldId(row.owner));
  } catch {
  }
}

function byTrustedAuthor(entry) {
  const parts = repoOwnerName(entry?.repository || "");
  return !!parts && trustedAuthors.has(foldId(parts.owner));
}

function trustBadge(entry) {
  if (!byTrustedAuthor(entry)) return null;
  const parts = repoOwnerName(entry.repository);
  const pill = el("span", "om-trusted", "✓ trusted");
  pill.title = `You trust ${parts.owner}`;
  return pill;
}

async function repositoryForPack(packId, entry, rowsRoot) {
  const known = entry?.repository || rowsRoot?._repository || installedPack(packId)?.repository;
  if (known) return known;
  try {
    const answer = await api.fetchApi(`${API}/pack-for-repo?id=${encodeURIComponent(packId)}`);
    return (await answer.json()).repository || "";
  } catch {
    return "";
  }
}

async function authorStanding(owner, repo, consultList) {
  const standing = { owner, trusted: false, stars: null, created: null, pushed: null, packs: 0 };
  if (consultList) {
    try {
      const answer = await api.fetchApi(`${API}/trust?owner=${encodeURIComponent(owner)}`);
      standing.trusted = (await answer.json()).trusted === true;
    } catch {
    }
    if (standing.trusted) return standing;
  }
  try {
    const answer = await api.fetchApi(`${API}/repo-meta?repo=${encodeURIComponent(repo)}`);
    const meta = await answer.json();
    standing.stars = meta.stars ?? null;
    standing.pushed = meta.pushed_at || null;
  } catch {}
  try {
    const answer = await api.fetchApi(`${API}/installed`);
    const packs = (await answer.json()).packs || [];
    standing.packs = packs.filter((pack) => {
      const url = (pack.repository || "").toLowerCase();
      return url.includes(`github.com/${owner.toLowerCase()}/`);
    }).length;
  } catch {}
  return standing;
}

async function confirmAuthorTrust(owner, repo, what) {
  const byAuthor = panelSetting("openManager.trustMode", "author") !== "action";
  const standing = await authorStanding(owner, repo, byAuthor);
  if (byAuthor && standing.trusted) return true;

  const choices = byAuthor
    ? [{ key: "always", label: `Trust ${owner}`, primary: true,
         hint: `Stops asking for anything published by ${owner}` },
       { key: "once", label: "This time only", hint: "Nothing is remembered" }]
    : [{ key: "once", label: "Continue", primary: true }];

  const how = await chooseAction(`Do you trust ${owner}?`, "", choices, {
    wide: true,
    facts: [
      ["Author", owner],
      ["Trusted", byAuthor ? "No" : "Not tracked, asked every time"],
      ["Action", what || "Install this"],
      ["Runs as", "ComfyUI. Full privileges."],
      ["Stars", standing.stars != null ? countText(standing.stars) : ""],
      ["Last push", standing.pushed ? dayText(standing.pushed) : ""],
      ["Installed", standing.packs
        ? `${standing.packs} of their pack${standing.packs === 1 ? "" : "s"}`
        : "None of theirs"],
      ["Trust covers", byAuthor ? "All their packs, not downloads" : ""],
      ["Findings", "Shown either way"],
    ],
  });
  if (!how) return false;
  if (how === "always") {
    try {
      await api.fetchApi(`${API}/trust`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner, trusted: true }),
      });
      trustedAuthors.add(foldId(owner));
    } catch {
      toast(`Could not remember ${owner}.`, { kind: "warn" });
    }
  }
  return true;
}

function confirmRepoInstall(pack) {
  return new Promise((resolve) => {
    const backdrop = el("div", "om-backdrop");
    const dialog = el("div", "om-dialog");
    dialog.style.width = "min(90vw, 900px)";
    dialog.style.height = "auto";
    dialog.style.maxHeight = "90vh";

    const head = el("div", "om-head");
    head.appendChild(el("div", "om-title",
      pack.ref ? `Install ${pack.title} at ${pack.ref} from GitHub` : `Install ${pack.title} from GitHub`));
    dialog.appendChild(head);

    const body = el("div", "om-body");
    const warn = el("div", "om-ack");
    warn.appendChild(el("b", null, "Not on the Comfy Registry. Installed straight from GitHub."));
    warn.appendChild(el("div", null,
      "Not scanned by the registry. A pack runs with ComfyUI's privileges."));
    if (pack.overwrite) {
      warn.appendChild(el("div", null,
        "The copy already in custom_nodes is removed first and replaced by this one."));
    }
    body.appendChild(warn);
    body.appendChild(el("div", "om-side-meta", pack.repo));
    body.appendChild(el("h4", null, "What this contains and would change"));
    const slot = el("div");
    slot.appendChild(el("div", "om-why", "Inspecting the repository..."));
    body.appendChild(slot);
    dialog.appendChild(body);

    const foot = el("div", "om-foot");
    const cancel = el("button", "om-btn", "Cancel");
    const go = el("button", "om-btn om-danger", "Install from GitHub");
    go.disabled = true;
    cancel.onclick = () => { backdrop.remove(); resolve(false); };
    go.onclick = () => { backdrop.remove(); resolve(true); };
    foot.appendChild(cancel);
    foot.appendChild(go);
    dialog.appendChild(foot);

    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);
    closeOn(backdrop, () => { backdrop.remove(); resolve(false); });

    (async () => {
      let data;
      try {
        const answer = await api.fetchApi(`${API}/inspect-repo`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ repo: pack.repo, ref: pack.ref || "" }),
        });
        data = await answer.json();
      } catch (error) {
        slot.replaceChildren(el("div", "om-why", `Inspection failed: ${error.message}`));
        go.disabled = false;
        return;
      }
      slot.replaceChildren();
      if (!data.ok) {
        slot.appendChild(el("div", "om-why", data.reason || "could not inspect the repository"));
        go.disabled = false;
        return;
      }
      if (!data.findings.length) slot.appendChild(stateRow("Nothing notable in the archive"));
      for (const finding of data.findings) slot.appendChild(findingCard(finding));
      if (data.dependencies?.length) slot.appendChild(dependencyList(data.dependencies));
      if ((data.impact.replacements || []).some((r) => r.core && r.direction === "downgrade")) {
        go.textContent = "Downgrade dependencies and install from GitHub";
      }
      go.disabled = false;
    })();
  });
}

async function installFromRepo(pack, control) {
  const parts = repoOwnerName(pack.repo);
  if (parts && !(await confirmAuthorTrust(parts.owner, pack.repo, "install a pack"))) return false;
  if (!(await confirmRepoInstall(pack))) return false;
  control?.setInstalling?.();
  const progress = toast(`Installing ${pack.title} from GitHub...`, { sticky: true });
  let result;
  try {
    const answer = await api.fetchApi(`${API}/install-repo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        repo: pack.repo, ref: pack.ref || "", overwrite: !!pack.overwrite,
      }),
    });
    result = await answer.json();
  } catch (error) {
    result = { ok: false, reason: error.message };
  }
  if (result.ok) {
    control?.setInstalled?.();
    progress.settle(`Installed ${pack.title}.`, "ok", 6000);
    if (result.pip_ran && !result.pip_ok) {
      const choice = await showInstallFailure({ name: pack.title || pack.repo }, result);
      if (choice === "restore" && result.environment_id) {
        await offerRestore(result.environment_id, pack.title || pack.repo).catch(() => {});
      }
    }
    remindRestart();
  } else {
    control?.setInstall?.();
    progress.remove();
    notify("Install failed", result.reason);
  }
  return result;
}

async function uninstall({ packId, entry, control, rowsRoot, registryId }) {
  const name = entry.name || packId;
  const ok = await confirmAction(
    `Uninstall ${name}`,
    `This removes ${packId} from custom_nodes.`,
    "Uninstall", true);
  if (!ok) return;
  const progress = toast(`Uninstalling ${name}...`, { sticky: true });
  let result;
  try {
    const answer = await api.fetchApi(`${API}/uninstall`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: packId }),
    });
    result = await answer.json();
  } catch (error) {
    result = { ok: false, reason: error.message };
  }
  if (result.ok) {
    if (rowsRoot) rowsRoot._installedVersion = "";
    control?.setInstall();
    rememberInstall(packId, null);
    rememberInstall(registryId, null);
    loadInstalledIndex();
    progress.settle(`Uninstalled ${name}.`, "ok", 6000);
    remindRestart();
  } else {
    progress.remove();
    notify("Uninstall failed", result.reason);
  }
}

function repoOwnerName(url) {
  const match = /github\.com[/:]+([^/]+)\/([^/#?]+)/i.exec(url || "");
  return match ? { owner: match[1], repo: match[2].replace(/\.git$/, "") } : null;
}

function makeStarButton(repository, stars) {
  const button = el("button", "om-btn om-star");
  button.appendChild(document.createTextNode(stars != null ? `★ ${stars.toLocaleString()}` : "☆ Star"));
  button.title = "Star on GitHub";
  button.onclick = () => starRepo(repository, button);
  reflectStar(repository, button);
  return button;
}

async function reflectStar(repository, button) {
  if (!repoOwnerName(repository) || !keysHeld.github) return;
  try {
    const answer = await dlPost("/star", { repo: repository, action: "check" });
    if (answer?.starred) {
      button.classList.add("om-starred");
      button.firstChild.textContent = "★ Starred";
    }
  } catch {
  }
}

async function starRepo(repository, button) {
  const parts = repoOwnerName(repository);
  if (!parts) { if (repository) openUrl(repository); return; }
  const openRepo = () =>
    window.open(`https://github.com/${parts.owner}/${parts.repo}`, "_blank", "noopener,noreferrer");
  if (!keysHeld.github) { openRepo(); return; }
  const starred = button.classList.contains("om-starred");
  const answer = await dlPost("/star",
    { repo: repository, action: starred ? "unstar" : "star" }).catch((error) => ({
      ok: false, reason: error.message,
    }));
  if (!answer?.ok) {
    notify("Could not star", `${answer?.reason || "GitHub refused"}. Opening the repository instead.`);
    openRepo();
    return;
  }
  button.classList.toggle("om-starred", !!answer.starred);
  button.firstChild.textContent = answer.starred ? "★ Starred" : "☆ Star";
  toast(answer.starred ? "Starred on GitHub." : "Unstarred on GitHub.", { kind: "ok" });
}

function tagChip(tag) {
  const chip = el("button", "om-tag om-tag-go", tag);
  chip.title = `Find other packs tagged ${tag}`;
  chip.onclick = () => browseTopic(String(tag).toLowerCase());
  return chip;
}

export { compareVersions, versionSwitch, remindRestart, restartServer, makeInstallControl, installedIndex, foldId, indexInstalled, loadInstalledIndex, installedPack, updateTarget, packName, versionFacts, registryControl, installedMenu, rememberInstall, enqueueInstall, openEnvironmentDialog, install, loadTrustedAuthors, byTrustedAuthor, trustBadge, confirmAuthorTrust, installFromRepo, uninstall, repoOwnerName, makeStarButton, tagChip };
