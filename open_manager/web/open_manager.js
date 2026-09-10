import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { registerThemes, watchThemeExtras } from "./themes.js";

const API = "/open_manager/v1/api";

// Sidebar tab icons served beside this module. The light artwork reads on a dark theme, the
// dark artwork on a light theme.
const ICON_LIGHT = new URL("./open-manager-light.svg", import.meta.url).href;
const ICON_DARK = new URL("./open-manager-dark.svg", import.meta.url).href;

const STATUS_COLOUR = {
  active: "#3fb950",
  pending: "#d29922",
  flagged: "#d29922",
  banned: "#f85149",
  deleted: "#8b949e",
  unknown: "#8b949e",
};

const SEVERITY_COLOUR = {
  critical: "#f85149",
  caution: "#d29922",
  note: "#8b949e",
};

const style = document.createElement("style");
style.textContent = `
/* Chrome follows the active ComfyUI theme; status and licence colours stay fixed. */
:root {
  --om-bg: var(--comfy-menu-bg, #16181d);
  --om-surface: var(--comfy-input-bg, #1b1f24);
  --om-input: var(--comfy-input-bg, #0d1117);
  --om-border: var(--border-color, #30363d);
  --om-hover: var(--content-hover-bg, #30363d);
  --om-text: var(--fg-color, #e6edf3);
  --om-text-2: var(--input-text, #adbac7);
  --om-muted: var(--descrip-text, #8b949e);
}
.om-backdrop {
  position: fixed; inset: 0; background: rgba(0,0,0,.65);
  display: flex; align-items: center; justify-content: center; z-index: 10000;
}
/* Width and height follow the viewport rather than a fixed breakpoint. */
.om-dialog {
  position: relative;
  width: min(75vw, 2200px); height: min(84vh, 1500px);
  background: var(--om-bg); color: var(--om-text); border: 1px solid var(--om-border); border-radius: 10px;
  display: flex; flex-direction: column; overflow: hidden;
  font: 13px/1.5 system-ui, sans-serif;
}
.om-x { position: absolute; top: 8px; right: 12px; z-index: 2;
  background: none; border: none; color: var(--om-muted); font-size: 26px; line-height: 1;
  cursor: pointer; padding: 2px 6px; }
.om-x:hover { color: var(--om-text); }
/* Banner left, metadata inline to its right. Registry banners run from wide to portrait,
   so the whole banner is fit inside its box rather than cropped. */
.om-hero { display: flex; gap: 18px; padding: 16px 20px; border-bottom: 1px solid var(--om-border);
  align-items: flex-start; }
.om-banner { flex: none; width: 460px; max-width: 40%; height: 200px;
  object-fit: contain; object-position: left center; display: block;
  background: var(--om-input); border-radius: 8px; }
.om-hero-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 12px; }
.om-title-row { display: flex; gap: 12px; align-items: center; padding-right: 30px; }
.om-head { padding: 16px 20px; border-bottom: 1px solid var(--om-border); display: flex;
  gap: 12px; align-items: center; }
.om-blocked { padding: 2px 9px; border-radius: 999px; font-size: 11px; font-weight: 600;
  text-transform: uppercase; color: var(--om-muted); border: 1px solid var(--om-border); }
.om-icon { width: 44px; height: 44px; border-radius: 8px; object-fit: cover; background: var(--om-input); flex: none; }
.om-title { font-size: 19px; font-weight: 600; }
.om-sub { color: var(--om-muted); }
.om-stats { display: flex; gap: 22px; }
.om-stat b { display: block; font-size: 16px; }
.om-stat span { color: var(--om-muted); font-size: 11px; text-transform: uppercase; }
.om-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%;
  margin-left: 6px; vertical-align: middle; }
.om-btn.installing { background: #1f6feb; border-color: #388bfd; color: #fff; }
.om-btn.installed { background: #238636; border-color: #2ea043; color: #fff; }
.om-btn.flagged { background: #9e6a00; border-color: #d29922; color: #fff; }
.om-btn.banned { background: #a5261d; border-color: #f85149; color: #fff; }
.om-btn.om-star.om-starred { background: #3a2d00; border-color: #d29922; color: #f0c14b; }
.om-toasts { position: fixed; right: 16px; bottom: 16px; z-index: 10001;
  display: flex; flex-direction: column; gap: 8px; align-items: flex-end; }
.om-toast { background: var(--om-surface); color: var(--om-text); border: 1px solid var(--om-border);
  border-left: 3px solid #388bfd; border-radius: 8px; padding: 10px 14px;
  font: 13px/1.4 system-ui, sans-serif; max-width: 420px; box-shadow: 0 6px 20px rgba(0,0,0,.4); }
.om-toast-ok { border-left-color: #2ea043; }
.om-toast-warn { border-left-color: #d29922; }
.om-restart { display: flex; gap: 12px; align-items: center; }
.om-restart .om-btn { flex: none; }
.om-note { background: var(--om-bg); color: var(--om-text); border: 1px solid var(--om-border); border-radius: 10px;
  padding: 18px 20px; width: min(90vw, 460px); font: 13px/1.5 system-ui, sans-serif;
  display: flex; flex-direction: column; gap: 12px; }
.om-note-title { font-size: 15px; font-weight: 600; }
.om-note-body { color: var(--om-text-2); white-space: pre-wrap; }
.om-note-foot { display: flex; gap: 10px; justify-content: flex-end; }
/* Main button and caret read as one control: the button keeps its status colour and rounds
   only on the left, the caret is a neutral surface and rounds only on the right. */
.om-ictl { display: inline-flex; align-items: stretch; }
.om-ictl > .om-btn:not(:last-child) { border-top-right-radius: 0; border-bottom-right-radius: 0;
  border-right: none; }
/* border-left follows border-color, which would otherwise reset the divider it sets. */
.om-ictl .om-btn.om-caret { margin-left: 0; padding: 6px 9px; font-size: 11px; line-height: 1;
  border-top-left-radius: 0; border-bottom-left-radius: 0;
  background: var(--om-border); border-color: var(--om-border); color: var(--om-text-2);
  border-left: 1px solid rgba(1, 4, 9, .4); }
.om-ictl .om-btn.om-caret:hover { background: var(--om-hover); }
/* Hover fills both halves with one colour, so the divider takes the control's accent to
   stay visible. */
.om-ictl:hover > .om-btn.om-caret { border-left-color: var(--om-muted); }
.om-ictl:hover > .om-btn.om-caret.installed { border-left-color: #2ea043; }
.om-ictl:hover > .om-btn.om-caret.installing { border-left-color: #388bfd; }
.om-ictl:hover > .om-btn.om-caret.flagged { border-left-color: #d29922; }
.om-ictl:hover > .om-btn.om-caret.banned { border-left-color: #f85149; }
.om-menu { position: fixed; z-index: 10002; min-width: 150px; background: var(--om-surface);
  border: 1px solid var(--om-border); border-radius: 8px; padding: 4px;
  box-shadow: 0 8px 24px rgba(0,0,0,.5); font: 13px/1.5 system-ui, sans-serif; }
.om-menu-item { padding: 7px 12px; border-radius: 6px; cursor: pointer; color: var(--om-text); }
.om-menu-item:hover { background: var(--om-border); }
.om-menu-danger { color: #f85149; }
.om-side-ictl .om-btn { padding: 5px 12px; font-size: 12px; }
.om-body { flex: 1; min-height: 0; overflow: auto; padding: 16px 20px; }
.om-notice { border-left: 3px solid #d29922; background: #1c1a12; padding: 10px 14px; margin-bottom: 14px; }
.om-release { border-left: 3px solid #388bfd; background: var(--om-surface); padding: 10px 14px;
  margin-bottom: 14px; border-radius: 0 7px 7px 0; }
.om-release-body { color: var(--om-text-2); margin-top: 4px; white-space: pre-wrap;
  overflow-wrap: anywhere; }
.om-actions { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.om-chips { display: flex; gap: 8px; flex-wrap: wrap; }
.om-chip { font-size: 11px; color: var(--om-text-2); background: var(--om-surface); border: 1px solid var(--om-border);
  border-radius: 999px; padding: 2px 10px; }
.om-chip b { color: var(--om-muted); font-weight: 600; }
.om-tags { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.om-tag { font-size: 11px; line-height: 18px; height: 18px; color: #539bf5; background: #12253d;
  border-radius: 4px; padding: 0 8px; display: inline-flex; align-items: center; }
.om-readme { margin-top: 16px; border-top: 1px solid var(--om-border); padding-top: 14px; }
.om-readme .om-chips { margin-bottom: 8px; }
.om-readme .om-tags { margin-bottom: 14px; }
.om-readme-status { color: var(--om-muted); }
.om-readme-body { line-height: 1.6; overflow-wrap: anywhere; }
.om-readme-body img { max-width: 100%; height: auto; }
.om-readme-body pre { background: var(--om-input); padding: 10px; border-radius: 6px; overflow: auto; }
.om-readme-body h1, .om-readme-body h2 { border-bottom: 1px solid var(--om-border); padding-bottom: 4px; }
.om-readme-body a { color: #539bf5; }
.om-row {
  display: grid; grid-template-columns: 150px 110px 200px 1fr auto;
  gap: 12px; align-items: center; padding: 10px 12px;
  border: 1px solid var(--om-border); border-radius: 8px; margin-bottom: 8px; background: var(--om-surface);
}
.om-versions { border: 1px solid var(--om-border); border-radius: 8px; max-height: 42vh; overflow-y: auto; background: var(--om-bg); }
.om-versions .om-row { border: none; border-bottom: 1px solid var(--om-surface); border-radius: 0; margin: 0; background: transparent; }
.om-versions .om-row:last-child { border-bottom: none; }
.om-ver { font-weight: 600; font-family: ui-monospace, monospace; }
.om-badge { padding: 2px 9px; border-radius: 999px; font-size: 11px; font-weight: 600;
  text-transform: uppercase; color: var(--om-input); display: inline-block; }
.om-why { color: var(--om-muted); }
.om-btn { background: var(--om-surface); color: var(--om-text); border: 1px solid var(--om-border);
  border-radius: 6px; padding: 6px 16px; cursor: pointer; font-size: 13px; }
.om-btn:hover { background: var(--om-border); }
.om-btn.om-go { background: #238636; border-color: #2ea043; }
.om-btn.om-danger { background: #a5261d; border-color: #f85149; }
.om-close { margin-left: auto; }
.om-foot { padding: 12px 20px; border-top: 1px solid var(--om-border); display: flex;
  gap: 10px; align-items: center; color: var(--om-muted); }
.om-find { border: 1px solid var(--om-border); border-radius: 8px; padding: 12px 14px; margin-bottom: 10px; }
.om-find h4 { margin: 0 0 4px; font-size: 14px; }
.om-ev { font-family: ui-monospace, monospace; font-size: 11px; color: var(--om-muted); margin-top: 6px; }
.om-ack { border-left: 3px solid #f85149; background: #1c1214; padding: 12px 14px; margin: 12px 0; }
.om-state { display: flex; gap: 8px; align-items: center; padding: 9px 14px; margin: 4px 0;
  border: 1px solid var(--om-border); border-left: 3px solid #3fb950; border-radius: 8px;
  background: #131a14; font-weight: 600; }
.om-state-mark { color: #3fb950; font-weight: 700; }
.om-deps { border: 1px solid var(--om-border); border-radius: 8px; margin-top: 10px; overflow: hidden; }
.om-deps-head { padding: 7px 12px; background: var(--om-surface); font-weight: 600; font-size: 12px;
  border-bottom: 1px solid var(--om-border); }
.om-dep { display: flex; justify-content: space-between; gap: 12px; padding: 5px 12px;
  border-bottom: 1px solid var(--om-surface); font-size: 12px; }
.om-dep:last-child { border-bottom: none; }
.om-dep-name { font-family: ui-monospace, monospace; color: var(--om-text-2); overflow-wrap: anywhere; }
.om-dep-status { flex: none; white-space: nowrap; }
`;
document.head.appendChild(style);

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};

const badge = (status) => {
  const node = el("span", "om-badge", status);
  node.style.background = STATUS_COLOUR[status] || STATUS_COLOUR.unknown;
  return node;
};

function closeOn(backdrop) {
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) backdrop.remove();
  });
  const onKey = (event) => {
    if (event.key === "Escape") {
      backdrop.remove();
      window.removeEventListener("keydown", onKey);
    }
  };
  window.addEventListener("keydown", onKey);
}

// A clean state, asserted with a checkmark rather than a sentence.
const stateRow = (label) => {
  const row = el("div", "om-state");
  row.appendChild(el("span", "om-state-mark", "✓"));
  row.appendChild(el("span", null, label));
  return row;
};

const findingCard = (finding) => {
  const card = el("div", "om-find");
  card.style.borderLeft = `3px solid ${SEVERITY_COLOUR[finding.severity] || "var(--om-muted)"}`;
  const title = el("h4", null, finding.title);
  title.style.color = SEVERITY_COLOUR[finding.severity] || "var(--om-text)";
  card.appendChild(title);
  card.appendChild(el("div", null, finding.detail));
  if (finding.evidence?.length) {
    for (const line of finding.evidence) {
      card.appendChild(el("div", "om-ev", line));
    }
  }
  if (finding.reference) {
    const link = el("a", null, finding.reference);
    link.href = finding.reference;
    link.target = "_blank";
    link.style.cssText = "color:#58a6ff;font-size:11px";
    card.appendChild(link);
  }
  return card;
};

// What the version would change in this environment. The pip dry run is server-side and
// is fetched after the dialog is on screen.
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
  // A core downgrade or an ABI-breaking major change relabels the confirmation.
  const replacements = report.replacements || [];
  if (replacements.some((item) => item.abi)) {
    gate.textContent = "Install anyway (breaks binary packages)";
    gate.className = "om-btn om-danger";
  } else if (replacements.some((item) => item.core && item.direction === "downgrade")) {
    gate.textContent = "Downgrade dependencies and install";
    gate.className = "om-btn om-danger";
  }
}

// The pack's declared requirements, each checked against the environment and ComfyUI.
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

// Compares two dotted version strings numerically, falling back to string order.
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

// Describes moving from an installed version to a chosen one, or null when there is no
// installed version or it is the same.
function versionSwitch(installed, chosen) {
  if (!installed || installed === "present" || installed === chosen) return null;
  const cmp = compareVersions(chosen, installed);
  return { from: installed, to: chosen, direction: cmp < 0 ? "downgrade" : cmp > 0 ? "upgrade" : "reinstall" };
}

// Confirmation. Findings are shown in full; both buttons are always present.
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

    // A version switch replaces what is installed, and a downgrade is stated as one.
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
    cancel.onclick = () => { backdrop.remove(); resolve(false); };
    go.onclick = () => { backdrop.remove(); resolve(true); };
    foot.appendChild(cancel);
    foot.appendChild(go);
    dialog.appendChild(foot);

    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);
    closeOn(backdrop);

    appendImpact(packId, entry.version, impactSlot, go);
  });
}

// --- toasts -------------------------------------------------------------------------

function toastHost() {
  let host = document.querySelector(".om-toasts");
  if (!host) { host = el("div", "om-toasts"); document.body.appendChild(host); }
  return host;
}

function toast(message, opts = {}) {
  const node = el("div", `om-toast${opts.kind ? " om-toast-" + opts.kind : ""}`, message);
  toastHost().appendChild(node);
  let timer = opts.sticky ? 0 : setTimeout(() => node.remove(), opts.duration || 4000);
  return {
    set: (text) => { node.textContent = text; },
    kind: (k) => { node.className = `om-toast om-toast-${k}`; },
    settle: (text, kind, duration = 6000) => {
      node.textContent = text;
      node.className = `om-toast om-toast-${kind}`;
      clearTimeout(timer);
      timer = setTimeout(() => node.remove(), duration);
    },
    remove: () => { clearTimeout(timer); node.remove(); },
  };
}

// --- restart reminder ---------------------------------------------------------------

let restartToast = null;

// A sticky toast, shown once after files change, offering to restart the server. Installing,
// removing or switching a pack only takes effect after ComfyUI reloads.
function remindRestart() {
  if (restartToast) return;
  const node = el("div", "om-toast om-toast-warn om-restart");
  node.appendChild(el("span", null, "Restart to load the changes."));
  const button = el("button", "om-btn om-go", "Restart server");
  button.onclick = () => restartServer(button);
  node.appendChild(button);
  toastHost().appendChild(node);
  restartToast = node;
}

async function restartServer(button) {
  button.disabled = true;
  button.textContent = "Restarting...";
  try {
    await api.fetchApi(`${API}/reboot`, { method: "POST" });
  } catch (error) {
    // The connection drops as the server goes down.
  }
  const started = Date.now();
  const waitForUp = async () => {
    try {
      const answer = await api.fetchApi("/system_stats", { cache: "no-store" });
      if (answer.ok) { location.reload(); return; }
    } catch (error) {
      // still down
    }
    if (Date.now() - started < 180000) {
      setTimeout(waitForUp, 1500);
    } else {
      button.disabled = false;
      button.textContent = "Restart server";
      notify("Restart timed out", "The server did not come back within three minutes. Restart it by hand.");
    }
  };
  // Give the server a moment to actually go down before polling for it to return.
  setTimeout(waitForUp, 3000);
}

// --- modal (replaces window.alert / window.prompt) ----------------------------------

function notify(title, message) {
  const backdrop = el("div", "om-backdrop");
  const box = el("div", "om-note");
  box.appendChild(el("div", "om-note-title", title));
  if (message) box.appendChild(el("div", "om-note-body", message));
  const foot = el("div", "om-note-foot");
  const ok = el("button", "om-btn om-go", "OK");
  ok.onclick = () => backdrop.remove();
  foot.appendChild(ok);
  box.appendChild(foot);
  backdrop.appendChild(box);
  document.body.appendChild(backdrop);
  closeOn(backdrop);
  ok.focus();
}

function askText(title, value = "", actionLabel = "Open") {
  return new Promise((resolve) => {
    const backdrop = el("div", "om-backdrop");
    const box = el("div", "om-note");
    box.appendChild(el("div", "om-note-title", title));
    const input = el("input", "om-search");
    input.value = value;
    input.spellcheck = false;
    box.appendChild(input);
    const foot = el("div", "om-note-foot");
    const cancel = el("button", "om-btn", "Cancel");
    const ok = el("button", "om-btn om-go", actionLabel);
    cancel.onclick = () => { backdrop.remove(); resolve(null); };
    ok.onclick = () => { const v = input.value.trim(); backdrop.remove(); resolve(v || null); };
    foot.appendChild(cancel);
    foot.appendChild(ok);
    box.appendChild(foot);
    backdrop.appendChild(box);
    document.body.appendChild(backdrop);
    closeOn(backdrop);
    input.focus();
    input.addEventListener("keydown", (event) => { if (event.key === "Enter") ok.click(); });
  });
}

function confirmAction(title, message, actionLabel, danger) {
  return new Promise((resolve) => {
    const backdrop = el("div", "om-backdrop");
    const box = el("div", "om-note");
    box.appendChild(el("div", "om-note-title", title));
    if (message) box.appendChild(el("div", "om-note-body", message));
    const foot = el("div", "om-note-foot");
    const cancel = el("button", "om-btn", "Cancel");
    const ok = el("button", `om-btn ${danger ? "om-danger" : "om-go"}`, actionLabel || "OK");
    cancel.onclick = () => { backdrop.remove(); resolve(false); };
    ok.onclick = () => { backdrop.remove(); resolve(true); };
    foot.appendChild(cancel);
    foot.appendChild(ok);
    box.appendChild(foot);
    backdrop.appendChild(box);
    document.body.appendChild(backdrop);
    closeOn(backdrop);
  });
}

// --- install control ----------------------------------------------------------------

// A button that moves Install -> Queued -> Installing -> Installed. Once installed and
// withMenu is set, it becomes a split control with a caret opening reinstall / uninstall.
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

  control.setInstall = () => {
    const label = button("Install", "om-btn", onInstall || (() => install({ packId, entry, control, rowsRoot })));
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
  // An update is offered: a one-click primary that installs the newer version, plus the menu.
  control.setUpdate = (target, onUpdate) => {
    const label = button("Update", "om-btn installing", onUpdate);
    label.title = `Update to ${target}`;
    if (!withMenu) { wrap.replaceChildren(label); return; }
    wrap.replaceChildren(label, caretFor("installing"));
  };
  // The installed version's registry status: labelled "Installed" like the rest, coloured
  // amber where the version is flagged and red where it is banned.
  control.setStatusInstalled = (status) => {
    const cls = status === "banned" ? "banned" : status === "flagged" ? "flagged" : "installed";
    const label = button("Installed", `om-btn ${cls}`);
    label.title = `The installed version is ${status} by the registry`;
    if (!withMenu) { wrap.replaceChildren(label); return; }
    wrap.replaceChildren(label, caretFor(cls));
  };
  return control;
}

function openRowMenu(anchor, { packId, entry, control, rowsRoot, items }) {
  const open = document.querySelector(".om-menu");
  if (open) { open.remove(); return; }
  const menu = el("div", "om-menu");
  const item = (text, danger, fn) => {
    const node = el("div", `om-menu-item${danger ? " om-menu-danger" : ""}`, text);
    node.onclick = () => { menu.remove(); fn(); };
    menu.appendChild(node);
  };
  const list = items || [
    { label: "Reinstall", fn: () => install({ packId, entry, control, rowsRoot, overwrite: true }) },
    { label: "Uninstall", danger: true, fn: () => uninstall({ packId, entry, control, rowsRoot }) },
  ];
  for (const it of list) item(it.label, it.danger, it.fn);
  document.body.appendChild(menu);
  const rect = anchor.getBoundingClientRect();
  menu.style.top = `${rect.bottom + 4}px`;
  menu.style.left = `${Math.min(rect.left, window.innerWidth - menu.offsetWidth - 8)}px`;
  const close = (event) => {
    if (!menu.contains(event.target) && event.target !== anchor) {
      menu.remove();
      document.removeEventListener("mousedown", close);
    }
  };
  setTimeout(() => document.addEventListener("mousedown", close), 0);
}

// --- install queue, driven by one progress toast ------------------------------------

const installQueue = [];
let queueTotal = 0;
let queueRunning = false;

function enqueueInstall(job) {
  installQueue.push(job);
  queueTotal += 1;
  job.control?.setQueued();
  if (!queueRunning) runInstallQueue();
}

async function runInstallQueue() {
  queueRunning = true;
  const progress = toast("", { sticky: true });
  let done = 0;
  const issues = [];
  while (installQueue.length) {
    const job = installQueue.shift();
    done += 1;
    progress.set(`${done} of ${queueTotal}: installing ${job.name} ${job.entry.version}...`);
    job.control?.setInstalling();
    let result;
    try {
      const answer = await api.fetchApi(`${API}/install`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: job.packId, version: job.entry.version,
          status: job.entry.status, overwrite: !!job.overwrite,
        }),
      });
      result = await answer.json();
    } catch (error) {
      result = { ok: false, reason: error.message };
    }
    if (result.ok) {
      // Clear any sibling still marked installed, and record the version now in place.
      if (job.rowsRoot) {
        job.rowsRoot._installedVersion = job.entry.version;
        job.rowsRoot.querySelectorAll(".om-ictl").forEach((w) => {
          if (w !== job.control.el && w._control) w._control.setInstall();
        });
      }
      job.control?.setInstalled();
      if (result.pip_ran && !result.pip_ok) {
        issues.push(`${job.name}: requirements did not install cleanly`);
      }
    } else {
      job.control?.setInstall();
      issues.push(`${job.name} ${job.entry.version}: ${result.reason}`);
    }
  }
  queueTotal = 0;
  queueRunning = false;
  if (issues.length) {
    progress.settle(`Finished with ${issues.length} issue(s).`, "warn", 9000);
    notify("Install issues", issues.join("\n"));
  } else {
    progress.settle(`${done} pack(s) installed.`, "ok", 6000);
  }
  if (done > issues.length) remindRestart();
}

async function install({ packId, entry, control, rowsRoot, overwrite }) {
  if (entry.installable === false) {
    notify(`${packId} ${entry.version} is blocked`, entry.blocked_reason || "Blocked by policy.");
    return;
  }
  // A different version already installed makes this a switch. The installed version is
  // tracked on the row container.
  const installed = rowsRoot ? rowsRoot._installedVersion : "";
  const change = versionSwitch(installed, entry.version);
  if (!(await confirmInstall(packId, entry, change))) return;
  enqueueInstall({
    packId, entry, control, rowsRoot,
    overwrite: overwrite || !!change,
    name: entry.name || packId,
  });
}

// Confirmation for a GitHub install: a prominent unvetted-source warning, plus the archive
// inspection and dependency dry run loaded in place.
function confirmRepoInstall(pack) {
  return new Promise((resolve) => {
    const backdrop = el("div", "om-backdrop");
    const dialog = el("div", "om-dialog");
    dialog.style.width = "min(90vw, 900px)";
    dialog.style.height = "auto";
    dialog.style.maxHeight = "90vh";

    const head = el("div", "om-head");
    head.appendChild(el("div", "om-title", `Install ${pack.title} from GitHub`));
    dialog.appendChild(head);

    const body = el("div", "om-body");
    const warn = el("div", "om-ack");
    warn.appendChild(el("b", null, "Not on the Comfy Registry. Installed straight from GitHub."));
    warn.appendChild(el("div", null,
      "This source is not registry-scanned. A custom node runs with ComfyUI's privileges. "
      + "Review what it contains and changes below before installing."));
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
    closeOn(backdrop);

    (async () => {
      let data;
      try {
        const answer = await api.fetchApi(`${API}/inspect-repo`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ repo: pack.repo }),
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
  if (!(await confirmRepoInstall(pack))) return;
  control?.setInstalling?.();
  const progress = toast(`Installing ${pack.title} from GitHub...`, { sticky: true });
  let result;
  try {
    const answer = await api.fetchApi(`${API}/install-repo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo: pack.repo }),
    });
    result = await answer.json();
  } catch (error) {
    result = { ok: false, reason: error.message };
  }
  if (result.ok) {
    control?.setInstalled?.();
    progress.settle(`Installed ${pack.title}.`, "ok", 6000);
    if (result.pip_ran && !result.pip_ok) notify("Requirements", result.pip_output || "did not install cleanly");
    remindRestart();
  } else {
    control?.setInstall?.();
    progress.remove();
    notify("Install failed", result.reason);
  }
}

async function uninstall({ packId, entry, control, rowsRoot }) {
  const name = entry.name || packId;
  const ok = await confirmAction(
    `Uninstall ${name}`,
    `This removes ${packId} from custom_nodes. Other packs are untouched.`,
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
    progress.settle(`Uninstalled ${name}.`, "ok", 6000);
    remindRestart();
  } else {
    progress.remove();
    notify("Uninstall failed", result.reason);
  }
}

// Owner and repo from a GitHub URL, or null.
function repoOwnerName(url) {
  const match = /github\.com[/:]+([^/]+)\/([^/#?]+)/i.exec(url || "");
  return match ? { owner: match[1], repo: match[2].replace(/\.git$/, "") } : null;
}

// A Star button. Without a configured token it opens the repository on GitHub; with one it
// stars in place.
function makeStarButton(repository, stars) {
  const button = el("button", "om-btn om-star");
  button.appendChild(document.createTextNode(stars != null ? `★ ${stars.toLocaleString()}` : "☆ Star"));
  button.title = "Star on GitHub";
  button.onclick = () => starRepo(repository, button);
  reflectStar(repository, button);
  return button;
}

async function reflectStar(repository, button) {
  const parts = repoOwnerName(repository);
  const token = (app.extensionManager.setting.get("openManager.githubToken") || "").trim();
  if (!parts || !token) return;
  try {
    const answer = await fetch(`https://api.github.com/user/starred/${parts.owner}/${parts.repo}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    });
    if (answer.status === 204) { button.classList.add("om-starred"); button.firstChild.textContent = "★ Starred"; }
  } catch {}
}

async function starRepo(repository, button) {
  const parts = repoOwnerName(repository);
  if (!parts) { if (repository) window.open(repository, "_blank"); return; }
  const openRepo = () => window.open(`https://github.com/${parts.owner}/${parts.repo}`, "_blank");
  const token = (app.extensionManager.setting.get("openManager.githubToken") || "").trim();
  if (!token) { openRepo(); return; }
  const starred = button.classList.contains("om-starred");
  try {
    const answer = await fetch(`https://api.github.com/user/starred/${parts.owner}/${parts.repo}`, {
      method: starred ? "DELETE" : "PUT",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    });
    if (answer.status !== 204) throw new Error(`HTTP ${answer.status}`);
    button.classList.toggle("om-starred");
    button.firstChild.textContent = button.classList.contains("om-starred") ? "★ Starred" : "☆ Star";
    toast(starred ? "Unstarred on GitHub." : "Starred on GitHub.", { kind: "ok" });
  } catch (error) {
    notify("Could not star", `${error.message}. Opening the repository instead.`);
    openRepo();
  }
}

async function openPack(packId) {
  const backdrop = el("div", "om-backdrop");
  const dialog = el("div", "om-dialog");
  dialog.appendChild(el("div", "om-body", `Reading ${packId} from the registry...`));
  backdrop.appendChild(dialog);
  document.body.appendChild(backdrop);
  closeOn(backdrop);

  let data;
  try {
    const answer = await api.fetchApi(`${API}/pack/${encodeURIComponent(packId)}`);
    data = await answer.json();
    if (!answer.ok) throw new Error(data.detail || `HTTP ${answer.status}`);
  } catch (error) {
    dialog.replaceChildren(el("div", "om-body", `Could not read the registry: ${error.message}`));
    return;
  }

  const { pack, resolution, versions } = data;
  dialog.replaceChildren();

  // Borderless close, top-right of the modal.
  const close = el("button", "om-x", "×");
  close.title = "Close";
  close.onclick = () => backdrop.remove();
  dialog.appendChild(close);

  // Banner left, all metadata inline to its right.
  const hero = el("div", "om-hero");
  if (pack.banner) {
    const banner = el("img", "om-banner");
    banner.src = pack.banner;
    banner.onerror = () => banner.remove();
    hero.appendChild(banner);
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
  titles.appendChild(el("div", "om-title", pack.name || pack.id));
  titles.appendChild(el("div", "om-sub", pack.description || ""));
  titles.appendChild(el("div", "om-sub", pack.id));
  titleRow.appendChild(titles);
  info.appendChild(titleRow);

  const stats = el("div", "om-stats");
  for (const [label, value] of [
    ["downloads", pack.downloads.toLocaleString()],
    ["stars", pack.stars.toLocaleString()],
    ["versions", String(versions.length)],
  ]) {
    const stat = el("div", "om-stat");
    stat.appendChild(el("b", null, value));
    stat.appendChild(el("span", null, label));
    stats.appendChild(stat);
  }
  info.appendChild(stats);

  // Actions and metadata chips. Status is a colour, not a word.
  const actions = el("div", "om-actions om-hero-actions");
  if (pack.repository) {
    const repo = el("button", "om-btn", "View on GitHub");
    repo.title = "Open the repository";
    repo.onclick = () => window.open(pack.repository, "_blank");
    actions.appendChild(repo);
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
  // A chip whose value is a registry status, shown as a colour-coded dot.
  const statusChip = (label, value, status) => {
    if (!value) return;
    const node = el("span", "om-chip");
    node.appendChild(el("b", null, label));
    node.appendChild(document.createTextNode(" " + value));
    const dot = el("span", "om-dot");
    dot.style.background = STATUS_COLOUR[status] || STATUS_COLOUR.unknown;
    dot.title = status;
    node.appendChild(dot);
    chips.appendChild(node);
  };
  statusChip("publisher", pack.publisher, pack.publisher_status);
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
  chip("author", pack.author);
  chip("comfyui", pack.supported_comfyui);
  if (pack.supported_os.length) chip("os", pack.supported_os.join(", "));
  if (pack.supported_accelerators.length) chip("accel", pack.supported_accelerators.join(", "));
  chip("first published", (pack.created_at || "").slice(0, 10));
  actions.appendChild(chips);
  info.appendChild(actions);

  if (pack.tags.length) {
    const tags = el("div", "om-tags");
    for (const tag of pack.tags) tags.appendChild(el("span", "om-tag", tag));
    info.appendChild(tags);
  }

  hero.appendChild(info);
  dialog.appendChild(hero);

  const body = el("div", "om-body");
  body.appendChild(el("div", "om-release-slot"));

  // The registry advertises only an active release. Where a newer one is published, the
  // gap is stated as fact.
  if (resolution.newest_is_hidden) {
    const notice = el("div", "om-notice");
    notice.appendChild(el("b", null,
      `Registry latest ${resolution.registry_advertises || "none"} · newest published ${resolution.newest}`));
    body.appendChild(notice);
  }

  // Versions live in their own bordered, scrolling box.
  const versionsBox = el("div", "om-versions");
  versionsBox._installedVersion = pack.installed_version || "";
  for (const entry of versions) {
    const row = el("div", "om-row");
    row.appendChild(el("div", "om-ver", entry.version));
    row.appendChild(badge(entry.status));
    row.appendChild(el("div", "om-why", (entry.created_at || "").slice(0, 10)));

    const worst = entry.assessment?.findings?.[0];
    row.appendChild(el("div", "om-why", worst ? worst.title : "no findings"));

    // A banned version is blocked, not offered. Everything else installs after its warning.
    if (entry.installable === false) {
      const blocked = el("span", "om-blocked", "Blocked");
      blocked.title = entry.blocked_reason || "Blocked by policy";
      row.appendChild(blocked);
    } else {
      const control = makeInstallControl({
        packId: pack.id,
        entry: { ...entry, name: pack.name || pack.id },
        rowsRoot: versionsBox,
        withMenu: true,
      });
      if (pack.installed_version && entry.version === pack.installed_version) control.setInstalled();
      else control.setInstall();
      row.appendChild(control.el);
    }
    versionsBox.appendChild(row);
  }
  body.appendChild(versionsBox);

  // README, below the version list, only when enrichment is enabled.
  if (app.extensionManager.setting.get("openManager.enrichMetadata")) {
    const readme = el("div", "om-readme");
    readme.appendChild(el("div", "om-readme-status", "Reading the repository..."));
    body.appendChild(readme);
    appendReadme(pack.id, readme);
  }

  dialog.appendChild(body);
}

// A pack matched from GitHub but not on the registry. A bare page: the repository, the node
// types it provides, its README, and the same GitHub install the row offers.
function openRepoPack(pack) {
  const backdrop = el("div", "om-backdrop");
  const dialog = el("div", "om-dialog");
  // Full width like the registry pack page, with height following content.
  dialog.style.height = "auto";
  dialog.style.maxHeight = "84vh";
  backdrop.appendChild(dialog);
  document.body.appendChild(backdrop);
  closeOn(backdrop);

  const close = el("button", "om-x", "×");
  close.title = "Close";
  close.onclick = () => backdrop.remove();
  dialog.appendChild(close);

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

  const actions = el("div", "om-actions");
  const repoBtn = el("button", "om-btn", "View on GitHub");
  repoBtn.onclick = () => window.open(pack.repo, "_blank");
  actions.appendChild(repoBtn);
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
  dialog.appendChild(hero);

  const body = el("div", "om-body");
  body.appendChild(el("div", "om-release-slot"));
  // The README is read from GitHub behind the same enrichment setting the registry page uses.
  if (app.extensionManager.setting.get("openManager.enrichMetadata")) {
    const readme = el("div", "om-readme");
    readme.appendChild(el("div", "om-readme-status", "Reading the repository..."));
    body.appendChild(readme);
    renderMetaInto(readme, api.fetchApi(`${API}/repo-meta?repo=${encodeURIComponent(pack.repo)}`));
  } else {
    body.appendChild(el("div", "om-readme-status",
      "Enable README enrichment in Open Manager settings to read the repository here."));
  }
  dialog.appendChild(body);
}

// The repository name from a GitHub URL, for a title where none was matched.
function repoName(url) {
  const match = /github\.com[:/]+[^/]+\/([^/#?]+)/i.exec(url || "");
  return match ? match[1].replace(/\.git$/, "") : (url || "repository");
}

// Fetches and renders the pack README below the version list. The scrape is cached
// server-side by version signature.
async function appendReadme(packId, slot) {
  return renderMetaInto(slot, api.fetchApi(`${API}/readme/${encodeURIComponent(packId)}`));
}

// Renders repository facts and the README into a slot from a metadata fetch. Shared by the
// registry pack page and the not-on-registry repository page.
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

  const facts = el("div", "om-chips");
  const fact = (label, value) => {
    if (!value) return;
    const node = el("span", "om-chip");
    node.appendChild(el("b", null, label));
    node.appendChild(document.createTextNode(" " + value));
    facts.appendChild(node);
  };
  if (meta.license) {
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
  fact("open issues", String(meta.open_issues));
  if (meta.open_prs) fact("open PRs", String(meta.open_prs));
  fact("last push", (meta.pushed_at || "").slice(0, 10));
  if (facts.children.length) slot.appendChild(facts);
  if (meta.topics?.length) {
    const tags = el("div", "om-tags");
    for (const t of meta.topics) tags.appendChild(el("span", "om-tag", t));
    slot.appendChild(tags);
  }

  appendDeveloperBlock(slot, meta);

  if (!meta.readme) {
    slot.appendChild(el("div", "om-readme-status", "No README in the repository."));
    return;
  }
  const view = el("div", "om-readme-body");
  try {
    const html = await app.extensionManager.renderMarkdownToHtml(meta.readme);
    view.innerHTML = typeof html === "string" ? html : "";
    absolutiseLinks(view, meta.repository, meta.default_branch);
  } catch {
    const pre = el("pre");
    pre.textContent = meta.readme;
    view.appendChild(pre);
  }
  slot.appendChild(view);
}

// The pack's [tool.open_manager] declarations: matched incompatibilities, a source
// preference, links, and example workflows that load into the graph on click.
function appendDeveloperBlock(slot, meta) {
  const dev = meta.developer || {};
  const matched = (meta.incompatible || []).filter((entry) => entry.matched);
  const workflows = dev.example_workflows || [];
  const themes = dev.themes || [];

  // The author's note on the current release, placed above the version list.
  const releaseSlot = slot.closest(".om-dialog")?.querySelector(".om-release-slot");
  if (dev.release_note && releaseSlot) {
    releaseSlot.replaceChildren();
    const note = el("div", "om-release");
    note.appendChild(el("b", null, "From the developer"));
    note.appendChild(el("div", "om-release-body", dev.release_note));
    releaseSlot.appendChild(note);
  }

  if (!matched.length && !dev.source && !dev.docs && !dev.funding && !workflows.length && !themes.length) return;

  const block = el("div", "om-dev");

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
      b.onclick = () => window.open(dev.docs, "_blank");
      links.appendChild(b);
    }
    if (dev.funding) {
      const b = el("button", "om-btn", "Funding");
      b.title = dev.funding;
      b.onclick = () => window.open(dev.funding, "_blank");
      links.appendChild(b);
    }
    const hero = slot.closest(".om-dialog")?.querySelector(".om-hero-actions");
    if (hero) for (const b of [...links.children]) hero.appendChild(b);
    else block.appendChild(links);
  }

  if (themes.length) {
    block.appendChild(collapsible("Themes", themes, (path) => {
      const item = el("button", "om-wf-item");
      item.appendChild(el("span", "om-wf-name", path.split("/").pop().replace(/\.json$/, "")));
      item.appendChild(el("span", "om-wf-path", path));
      item.title = `Add ${path} to your themes`;
      item.onclick = () => addPackTheme(meta.repository, meta.default_branch, path, item);
      return item;
    }));
  }

  if (workflows.length) {
    block.appendChild(collapsible("Example workflows", workflows, (path) => {
      const item = el("button", "om-wf-item");
      item.appendChild(el("span", "om-wf-name", path.split("/").pop()));
      item.appendChild(el("span", "om-wf-path", path));
      item.title = `Load ${path}`;
      item.onclick = () => loadExampleWorkflow(meta.repository, meta.default_branch, path);
      return item;
    }));
  }

  slot.appendChild(block);
}

// A closed section holding a scrolling list of paths.
function collapsible(title, paths, build) {
  const box = el("details", "om-fold");
  const head = el("summary", "om-dev-head");
  head.appendChild(document.createTextNode(title));
  head.appendChild(el("span", "om-fold-count", String(paths.length)));
  box.appendChild(head);
  const list = el("div", "om-wf-list");
  for (const path of paths) list.appendChild(build(path));
  box.appendChild(list);
  return box;
}

// Downloads a theme a pack ships and merges it into the palette store, leaving every other
// palette untouched. It appears in the theme picker after a reload.
async function addPackTheme(repository, branch, path, button) {
  let data;
  try {
    const query = new URLSearchParams({ repo: repository || "", branch: branch || "", path });
    const answer = await api.fetchApi(`${API}/theme?${query.toString()}`);
    data = await answer.json();
    if (!answer.ok || !data.ok) throw new Error(data.reason || `HTTP ${answer.status}`);
  } catch (error) {
    notify("Could not read theme", error.message);
    return;
  }
  const theme = data.theme;
  const name = theme.name || theme.id;
  if (!(await confirmAction("Add theme", `Add "${name}" to your themes?`, "Add"))) return;
  try {
    const setting = app.extensionManager.setting;
    const store = setting.get("Comfy.CustomColorPalettes") || {};
    await setting.set("Comfy.CustomColorPalettes", { ...store, [theme.id]: theme });
    button.classList.add("om-wf-added");
    toast(`Added ${name}. Reload to use it.`, { kind: "ok" });
  } catch (error) {
    notify("Could not add theme", error.message);
  }
}

// Downloads a declared example workflow, and loads it into the graph once it is confirmed and
// the server has verified it parses as a workflow.
async function loadExampleWorkflow(repository, branch, path) {
  const name = path.split("/").pop();
  const progress = toast(`Fetching ${name}...`, { sticky: true });
  let data;
  try {
    const query = new URLSearchParams({ repo: repository || "", branch: branch || "", path });
    const answer = await api.fetchApi(`${API}/workflow?${query.toString()}`);
    data = await answer.json();
    if (!answer.ok || !data.ok) throw new Error(data.reason || `HTTP ${answer.status}`);
  } catch (error) {
    progress.remove();
    notify("Could not fetch workflow", error.message);
    return;
  }
  progress.remove();
  if (!(await confirmAction("Load example workflow", `This replaces the current graph with "${path}".`, "Load"))) return;
  try {
    const workflow = data.workflow.nodes ? data.workflow : (data.workflow.workflow || data.workflow);
    await app.loadGraphData(workflow);
    toast(`Loaded ${name}.`, { kind: "ok" });
  } catch (error) {
    notify("Could not load workflow", error.message);
  }
}

// Rewrites a README's relative paths to absolute URLs on the repository.
function absolutiseLinks(view, repository, branch) {
  const match = /github\.com[:/]+([^/]+)\/([^/#?]+)/i.exec(repository || "");
  if (!match) return;
  const owner = match[1];
  const repo = match[2].replace(/\.git$/, "");
  const ref = branch || "main";
  const absolute = (url) => /^[a-z][a-z0-9+.-]*:\/\//i.test(url) || url.startsWith("data:") || url.startsWith("mailto:");
  const relative = (url) => url.replace(/^\.\//, "").replace(/^\//, "");

  for (const img of view.querySelectorAll("img[src]")) {
    const src = img.getAttribute("src");
    if (!src || absolute(src) || src.startsWith("#")) continue;
    img.src = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${relative(src)}`;
  }
  for (const anchor of view.querySelectorAll("a[href]")) {
    const href = anchor.getAttribute("href");
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    if (!href || absolute(href)) continue;
    if (href.startsWith("#")) {
      anchor.href = `https://github.com/${owner}/${repo}${href}`;
    } else {
      anchor.href = `https://github.com/${owner}/${repo}/blob/${ref}/${relative(href)}`;
    }
  }
}

// Resolves a pack's newest version, then routes it through the same confirm and queue as
// the version list. Drives the row's control while it resolves.
async function quickInstall(packId, control) {
  control.setInstalling();
  let data;
  try {
    const answer = await api.fetchApi(`${API}/pack/${encodeURIComponent(packId)}`);
    data = await answer.json();
    if (!answer.ok) throw new Error(data.detail || `HTTP ${answer.status}`);
  } catch (error) {
    control.setInstall();
    notify(`Could not read ${packId}`, error.message);
    return;
  }
  const wanted = data.resolution.newest || data.resolution.latest_active;
  const entry = data.versions.find((item) => item.version === wanted);
  if (!entry) {
    control.setInstall();
    notify(`Nothing to install for ${packId}`, "No installable version was found.");
    return;
  }
  control.setInstall();
  await install({ packId, entry: { ...entry, name: data.pack.name || packId }, control, rowsRoot: null });
}

// Licence resolution for rows the registry left unnamed. A row's repository is read for its
// licence file, batched across a render and cached on the server.
const licJobs = new Map();
let licTimer = 0;

function paintLicense(pill, entry) {
  pill.textContent = entry.license || "unlicensed";
  pill.style.color = entry.license_color || "var(--om-muted)";
  pill.style.borderColor = entry.license_color || "var(--om-muted)";
  pill.title = `licence: ${entry.license_tier || "unknown"}`;
}

function queueLicense(entry, pill) {
  if (!entry || !entry.repository || entry._licResolved) return;
  if (entry.license_tier && entry.license_tier !== "unknown") return;
  let job = licJobs.get(entry.id);
  if (!job) { job = { entry, pills: new Set() }; licJobs.set(entry.id, job); }
  job.pills.add(pill);
  if (!licTimer) licTimer = setTimeout(flushLicenses, 250);
}

async function flushLicenses() {
  licTimer = 0;
  const jobs = [...licJobs.values()];
  licJobs.clear();
  if (!jobs.length) return;
  let res;
  try {
    const answer = await api.fetchApi(`${API}/licenses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: jobs.map((j) => ({ id: j.entry.id, repository: j.entry.repository })) }),
    });
    // An error response leaves the rows unresolved.
    if (!answer.ok) return;
    res = (await answer.json()).licenses || {};
  } catch {
    return;
  }
  for (const job of jobs) {
    job.entry._licResolved = true;
    const info = res[job.entry.id];
    if (!info || !info.name) continue;
    Object.assign(job.entry, {
      license: info.name, license_tier: info.tier,
      license_rank: info.rank, license_color: info.color,
    });
    for (const pill of job.pills) paintLicense(pill, job.entry);
  }
}

// A list row's artwork, falling back to a tile carrying the pack's initial.
function packIcon(url, name, extra) {
  const initial = (String(name || "?").replace(/^[^a-z0-9]+/i, "") || "?")[0].toUpperCase();
  const letter = el("div", "om-side-icon om-side-initial", initial);
  if (extra) letter.classList.add(extra);
  if (!url) return letter;
  const icon = el("img", "om-side-icon");
  if (extra) icon.classList.add(extra);
  icon.src = url;
  // The fallback keeps the caller's extra class, so a broken image still sizes correctly.
  icon.onerror = () => icon.replaceWith(letter);
  return icon;
}

// Large counts read better abbreviated; smaller ones are left exact. The unit is chosen
// from the value after rounding, so 999,999 reads "1.0M" rather than "1000k", and the
// decimal is dropped past 100 of a unit to keep the text about four characters wide.
function countText(value) {
  const n = Number(value) || 0;
  if (n < 1e4) return n.toLocaleString();
  const scale = (size, suffix) => {
    const v = n / size;
    return (v >= 99.95 ? String(Math.round(v)) : v.toFixed(1)) + suffix;
  };
  return n >= 999500 ? scale(1e6, "M") : scale(1e3, "k");
}

// A pack's GitHub stars. Null where the registry records none, so callers can leave the
// metadata line uncluttered rather than printing a zero.
function starCount(stars) {
  const n = Number(stars) || 0;
  if (!n) return null;
  const pill = el("span", "om-stars", `★ ${countText(n)}`);
  pill.title = `${n.toLocaleString()} GitHub stars`;
  return pill;
}

function buildResultRow(entry) {
  const row = el("div", "om-side-row");
  row.appendChild(packIcon(entry.icon, entry.name || entry.id));
  const text = el("div", "om-side-text");
  text.appendChild(el("div", "om-side-name", entry.name || entry.id));
  const meta = el("div", "om-side-meta");
  meta.appendChild(document.createTextNode(
    `${entry.advertised || "no version"} · ${entry.downloads.toLocaleString()} downloads`));
  const stars = starCount(entry.stars);
  if (stars) meta.appendChild(stars);
  const lic = el("span", "om-lic");
  paintLicense(lic, entry);
  queueLicense(entry, lic);
  meta.appendChild(lic);
  text.appendChild(meta);
  text.onclick = () => openPack(entry.id);
  row.appendChild(text);
  const control = makeInstallControl({
    packId: entry.id,
    withMenu: false,
    onInstall: () => quickInstall(entry.id, control),
  });
  control.setInstall();
  control.el.classList.add("om-side-ictl");
  row.appendChild(control.el);
  return row;
}

// The same catalogue entry drawn as a card: a larger icon, the publisher, and the
// description, for the grid view. The metadata line carries whatever fits on one row.
function buildResultCard(entry) {
  const card = el("div", "om-card");
  const head = el("div", "om-card-head");
  head.appendChild(packIcon(entry.icon, entry.name || entry.id, "om-card-icon"));
  const title = el("div", "om-card-title");
  title.appendChild(el("div", "om-side-name", entry.name || entry.id));
  if (entry.publisher) title.appendChild(el("div", "om-card-pub", entry.publisher));
  head.appendChild(title);
  head.onclick = () => openPack(entry.id);
  card.appendChild(head);

  const desc = el("div", "om-card-desc", entry.description || "No description published.");
  desc.onclick = () => openPack(entry.id);
  card.appendChild(desc);

  const meta = el("div", "om-side-meta");
  meta.appendChild(document.createTextNode(
    `${entry.advertised || "no version"} · ${countText(entry.downloads)} ↓`));
  const stars = starCount(entry.stars);
  if (stars) meta.appendChild(stars);
  const lic = el("span", "om-lic");
  paintLicense(lic, entry);
  queueLicense(entry, lic);
  meta.appendChild(lic);
  card.appendChild(meta);

  const control = makeInstallControl({
    packId: entry.id,
    withMenu: false,
    onInstall: () => quickInstall(entry.id, control),
  });
  control.setInstall();
  control.el.classList.add("om-card-ictl");
  card.appendChild(control.el);
  return card;
}

// The node types in the open graph that ComfyUI has no registered class for. ComfyUI reports
// these to afterConfigureGraph on load; that list is preferred, with a live scan as fallback.
let lastMissingTypes = null;

function collectMissingNodeTypes() {
  const registered = window.LiteGraph?.registered_node_types || {};
  const types = new Set();
  // What ComfyUI reported unregistered at the last load, still unregistered now.
  for (const type of lastMissingTypes || []) {
    if (type && !registered[type]) types.add(type);
  }
  // Plus anything in the current graph without a registered class (catches later edits).
  for (const node of app.graph?._nodes || []) {
    const type = node.type;
    if (type && !registered[type]) types.add(type);
  }
  return [...types];
}

// A view render is async and the tab can change while one is in flight. Each render
// captures the generation it began in and stops where the panel has moved on.
let viewGeneration = 0;

function beginView() {
  return ++viewGeneration;
}

function viewIsCurrent(generation) {
  return generation === viewGeneration;
}

// Re-render the Missing view if it is the active tab. Called when a workflow loads.
function refreshMissingIfActive() {
  const active = document.querySelector(".om-nav-btn.active");
  const content = document.querySelector(".om-content");
  if (active && content && active.textContent === "Missing") renderMissing(content);
}

// The sidebar tab: a category nav over the registry browser, the installed list, and the
// packs that would supply nodes missing from the current graph.
function renderSidebar(root) {
  root.replaceChildren();
  root.className = "om-side";

  const nav = el("div", "om-nav");
  const content = el("div", "om-content");
  root.appendChild(nav);
  root.appendChild(content);

  const views = {
    registry: { label: "Registry", render: () => renderRegistry(content) },
    installed: { label: "Installed", render: () => renderInstalled(content) },
    github: { label: "GitHub", render: () => renderGithub(content) },
    missing: { label: "Missing", render: () => renderMissing(content) },
  };
  const buttons = {};
  const select = (key) => {
    for (const other of Object.keys(buttons)) buttons[other].classList.toggle("active", other === key);
    beginView();
    views[key].render();
  };
  for (const [key, view] of Object.entries(views)) {
    const button = el("button", "om-nav-btn", view.label);
    button.onclick = () => select(key);
    buttons[key] = button;
    nav.appendChild(button);
  }
  select("registry");
}

// Repositories the user added by hand, held in ComfyUI's user directory. Each row installs,
// manages and opens like a registry pack. Uninstalling leaves the row; Remove takes it off
// the list and uninstalls in one step.
async function renderGithub(container) {
  const generation = viewGeneration;
  container.replaceChildren();

  const controls = el("div", "om-side-controls");
  const addButton = el("button", "om-btn om-go", "Add repository");
  addButton.title = "Add a GitHub repository to this list";
  addButton.onclick = () => addGithubSource(container);
  controls.appendChild(addButton);
  container.appendChild(controls);

  const status = el("div", "om-side-status", "Reading your repositories...");
  const list = el("div", "om-side-list");
  container.appendChild(status);
  container.appendChild(list);

  let data;
  try {
    const answer = await api.fetchApi(`${API}/github`);
    data = await answer.json();
    if (!answer.ok) throw new Error(`HTTP ${answer.status}`);
  } catch (error) {
    status.textContent = `Could not read your repositories: ${error.message}`;
    return;
  }
  if (!viewIsCurrent(generation)) return;

  const repos = data.repos || [];
  if (!repos.length) {
    status.textContent = "No repositories yet. Add one to install it from GitHub.";
    return;
  }
  status.textContent = `${repos.length} repositor${repos.length === 1 ? "y" : "ies"}`;
  for (const repo of repos) list.appendChild(buildGithubRow(repo, container));
}

// One added-repository row: owner, installed version, and a control whose menu carries
// Remove alongside the usual reinstall and uninstall.
function buildGithubRow(repo, container) {
  const row = el("div", "om-side-row");
  row.appendChild(packIcon("", repo.name));

  const text = el("div", "om-side-text");
  text.appendChild(el("div", "om-side-name", repo.name));
  const meta = el("div", "om-side-meta");
  meta.appendChild(document.createTextNode(`${repo.owner}/${repo.name}`));
  if (repo.installed_version) {
    meta.appendChild(el("span", "om-upd", repo.installed_version));
    if (repo.dir && repo.dir !== repo.name) meta.appendChild(el("span", "om-disabled", repo.dir));
  }
  text.appendChild(meta);
  const pack = { repo: repo.url, title: repo.name, classes: [] };
  text.onclick = () => openRepoPack(pack);
  row.appendChild(text);

  const items = [
    { label: "Open on GitHub", fn: () => window.open(repo.url, "_blank") },
    { label: "Remove from list", danger: true, fn: () => removeGithubSource(repo, container) },
  ];
  if (repo.installed_version) {
    items.unshift({ label: "Reinstall", fn: () => installFromRepo(pack, control) });
    items.unshift({
      label: "Uninstall",
      danger: true,
      fn: () => uninstall({
        packId: repo.dir || repo.name,
        entry: { name: repo.name },
        control,
        rowsRoot: row,
      }),
    });
  }
  const control = makeInstallControl({
    packId: repo.name,
    entry: { name: repo.name },
    rowsRoot: row,
    withMenu: true,
    items,
    onInstall: () => installFromRepo(pack, control),
  });
  if (repo.installed_version) control.setInstalled();
  else control.setInstall();
  control.el.classList.add("om-side-ictl");
  row.appendChild(control.el);
  return row;
}

// Asks for a repository URL and puts it on the list.
async function addGithubSource(container) {
  const url = await askText("Add a GitHub repository", "", "Add");
  if (!url) return;
  let result;
  try {
    const answer = await api.fetchApi(`${API}/github`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    result = await answer.json();
  } catch (error) {
    result = { ok: false, reason: error.message };
  }
  if (!result.ok) { notify("Could not add the repository", result.reason); return; }
  toast(`Added ${result.repo.owner}/${result.repo.name}.`, { kind: "ok" });
  renderGithub(container);
}

// Takes a repository off the list and uninstalls it in the same step.
async function removeGithubSource(repo, container) {
  const installed = !!repo.installed_version;
  const ok = await confirmAction(
    `Remove ${repo.name}`,
    installed
      ? `This takes ${repo.owner}/${repo.name} off your list and uninstalls it from custom_nodes.`
      : `This takes ${repo.owner}/${repo.name} off your list. Nothing is installed to remove.`,
    "Remove", true);
  if (!ok) return;
  const progress = toast(`Removing ${repo.name}...`, { sticky: true });
  let result;
  try {
    const answer = await api.fetchApi(`${API}/github/remove`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: repo.url }),
    });
    result = await answer.json();
  } catch (error) {
    result = { ok: false, reason: error.message };
  }
  if (!result.ok) { progress.remove(); notify("Could not remove the repository", result.reason); return; }
  progress.settle(
    result.uninstalled ? `Removed and uninstalled ${repo.name}.` : `Removed ${repo.name}.`, "ok", 6000);
  if (result.reason) notify("Uninstall failed", result.reason);
  if (result.uninstalled) remindRestart();
  renderGithub(container);
}

// Whether a version string is an orderable release rather than "present" or a git ref.
function isRelease(v) {
  return /^\d+(\.\d+)*$/.test((v || "").trim());
}

// Installs a pack's newest published version over the installed one, through the confirm and
// queue the version list uses.
function updateInstalled(pack, row, control) {
  install({
    packId: pack.registry_id,
    entry: { version: pack.latest, status: "active", name: pack.registry_id || pack.id },
    control,
    rowsRoot: row,
    overwrite: true,
  });
}

// Packs already in custom_nodes, each with a management control and an update flag where the
// registry advertises a newer version. A row opens the pack page.
async function renderInstalled(container) {
  const generation = viewGeneration;
  container.replaceChildren();
  const status = el("div", "om-side-status", "Reading installed packs...");
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

  const controls = el("div", "om-side-controls");
  const sortSel = dropdown("om-installed-sort", "name", [
    ["name", "Name A–Z"],
    ["status", "Status first"],
    ["updatable", "Updatable first"],
  ]);
  const filterSel = dropdown("om-installed-filter", "all", [
    ["all", "All installed"],
    ["updates", "Updates available"],
    ["flagged", "Flagged or banned"],
    ["off-registry", "Not on registry"],
  ]);
  controls.appendChild(sortSel);
  controls.appendChild(filterSel);
  container.insertBefore(controls, list);
  const count = el("div", "om-side-status", "");
  container.insertBefore(count, list);

  const updatableCount = packs.filter(isInstalledUpdatable).length;

  const apply = () => {
    const mode = filterSel.value;
    const rows = packs.filter((pack) => {
      if (mode === "updates") return isInstalledUpdatable(pack);
      if (mode === "flagged") return ["flagged", "banned"].includes((pack.status || "").toLowerCase());
      if (mode === "off-registry") return !pack.registry_id;
      return true;
    });
    const rank = (pack) => (pack.status === "banned" ? 0 : pack.status === "flagged" ? 1 : 2);
    const sorters = {
      name: (a, b) => a.id.localeCompare(b.id),
      status: (a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id),
      updatable: (a, b) => (isInstalledUpdatable(b) - isInstalledUpdatable(a)) || a.id.localeCompare(b.id),
    };
    rows.sort(sorters[sortSel.value] || sorters.name);
    list.replaceChildren();
    for (const pack of rows) list.appendChild(buildInstalledRow(pack));
    count.textContent = `${rows.length} shown`;
  };
  sortSel.addEventListener("change", () => { localStorage.setItem("om-installed-sort", sortSel.value); apply(); });
  filterSel.addEventListener("change", () => { localStorage.setItem("om-installed-filter", filterSel.value); apply(); });
  apply();

  // A dismissible alert where an installed version is flagged or banned. Dismissal is
  // remembered until the set of flagged or banned packs changes.
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
}

// Whether the registry advertises a newer version than the one installed.
function isInstalledUpdatable(pack) {
  return !!pack.registry_id && isRelease(pack.version) && isRelease(pack.latest)
    && compareVersions(pack.latest, pack.version) > 0;
}

// One installed-pack row: version, an update badge, a status-coloured management control, and
// a menu of Update, Reinstall and Uninstall scoped to what the pack is.
function buildInstalledRow(pack) {
  const updatable = isInstalledUpdatable(pack);
  const row = el("div", "om-side-row");
  row._installedVersion = pack.version;
  row.appendChild(packIcon(pack.icon, pack.id));

  const text = el("div", "om-side-text");
  text.appendChild(el("div", "om-side-name", pack.id));
  const meta = el("div", "om-side-meta");
  const shownDir = pack.disabled ? pack.dir.replace(/\.disabled$/, "") : pack.dir;
  meta.appendChild(document.createTextNode(`${pack.version}${shownDir !== pack.id ? " · " + shownDir : ""}`));
  const istars = starCount(pack.stars);
  if (istars) meta.appendChild(istars);
  if (pack.disabled) meta.appendChild(el("span", "om-disabled", "disabled"));
  if (updatable) meta.appendChild(el("span", "om-upd", `update → ${pack.latest}`));
  text.appendChild(meta);
  if (pack.registry_id) text.onclick = () => openPack(pack.registry_id);
  else if (pack.repository) text.onclick = () => openRepoPack({ repo: pack.repository, title: pack.id, classes: [] });
  row.appendChild(text);

  const current = { version: pack.version, status: "active", name: pack.registry_id || pack.id };
  const items = [];
  if (updatable) items.push({ label: `Update to ${pack.latest}`, fn: () => updateInstalled(pack, row, control) });
  if (pack.registry_id) {
    items.push({ label: "Reinstall", fn: () => install({ packId: pack.registry_id, entry: current, control, rowsRoot: row, overwrite: true }) });
  }
  items.push({ label: "Uninstall", danger: true, fn: () => uninstall({ packId: pack.id, entry: { name: pack.id }, control, rowsRoot: row }) });

  const control = makeInstallControl({
    packId: pack.registry_id || pack.id,
    entry: current,
    rowsRoot: row,
    withMenu: true,
    items,
  });
  const vstatus = (pack.status || "").toLowerCase();
  if (vstatus === "banned" || vstatus === "flagged") control.setStatusInstalled(vstatus);
  else if (updatable) control.setUpdate(pack.latest, () => updateInstalled(pack, row, control));
  else control.setInstalled();
  control.el.classList.add("om-side-ictl");
  row.appendChild(control.el);
  return row;
}

const ALERTS_KEY = "openManager.installedAlertsDismissed";

// A banner naming the installed packs whose version the registry flagged or banned, with a
// dismiss control.
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

// Packs that provide the node types missing from the open graph, each installable in place.
async function renderMissing(container) {
  container.replaceChildren();
  const status = el("div", "om-side-status", "Scanning the current graph...");
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
      // Not on the registry. Installable from GitHub after inspection and a clear warning.
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

// The registry browser: search, the published-only filter, and the windowed result list.
function sinceText(ts) {
  if (!ts) return "never";
  const s = Date.now() / 1000 - ts;
  if (s < 90) return "just now";
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 129600) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

// A styled select whose choice is remembered under a storage key. Options are [value, label].
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

// How a sync should read the catalogue, from the panel's settings. The backend clamps the
// count, so a mistyped preference cannot turn the sync into a flood.
function syncOptions() {
  const get = (key, fallback) => {
    try { return app.extensionManager.setting.get(key) ?? fallback; } catch { return fallback; }
  };
  return {
    parallel: get("openManager.parallelSync", true) !== false,
    concurrency: Number(get("openManager.syncConcurrency", 8)) || 8,
  };
}

// The registry browser over the cached catalogue: search, a chosen sort, and a licence
// filter. Only a sync, an update or an install reaches the network.
function renderRegistry(container) {
  const generation = viewGeneration;
  container.replaceChildren();
  const status = el("div", "om-side-status", "Loading catalogue...");
  container.appendChild(status);

  const showSyncPrompt = () => {
    if (!viewIsCurrent(generation)) return;
    container.replaceChildren();
    const box = el("div", "om-empty");
    box.appendChild(el("div", "om-empty-title", "The registry is not synced"));
    box.appendChild(el("div", "om-side-status",
      "Sync once to browse offline. Only a sync, an update or an install uses the network."));
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
    search.placeholder = "Search the registry";
    search.spellcheck = false;
    container.appendChild(search);

    const controls = el("div", "om-side-controls");
    const viewSel = dropdown("om-registry-view", "list", [
      ["list", "List view"],
      ["cards", "Card view"],
    ]);
    const sortSel = dropdown("om-registry-sort", "downloads", [
      ["downloads", "Most downloads"],
      ["released", "Recently released"],
      ["stars", "Most stars"],
      ["name", "Name A–Z"],
      ["license", "Licence: permissive first"],
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
    controls.appendChild(viewSel);
    controls.appendChild(sortSel);
    controls.appendChild(licSel);
    controls.appendChild(filterWrap);
    container.appendChild(controls);

    const count = el("div", "om-side-status", "");
    const list = el("div", "om-side-list");
    container.appendChild(count);
    container.appendChild(list);

    const comparators = {
      downloads: (a, b) => (b.downloads - a.downloads),
      released: (a, b) => (b.released || "").localeCompare(a.released || "") || (b.downloads - a.downloads),
      stars: (a, b) => (b.stars - a.stars),
      name: (a, b) => (a.name || a.id).localeCompare(b.name || b.id),
      license: (a, b) => (a.license_rank - b.license_rank) || (b.downloads - a.downloads),
    };
    const CHUNK = 80;
    let filtered = [];
    let rendered = 0;

    const more = () => {
      const build = viewSel.value === "cards" ? buildResultCard : buildResultRow;
      const slice = filtered.slice(rendered, rendered + CHUNK);
      for (const entry of slice) list.appendChild(build(entry));
      rendered += slice.length;
    };
    const apply = () => {
      const query = search.value.trim().toLowerCase();
      const tier = licSel.value;
      filtered = nodes.filter((node) => {
        if (filterBox.checked && !node.advertised) return false;
        if (tier !== "all" && node.license_tier !== tier) return false;
        if (!query) return true;
        return (node.name || "").toLowerCase().includes(query)
          || node.id.toLowerCase().includes(query)
          || (node.description || "").toLowerCase().includes(query)
          || (node.publisher || "").toLowerCase().includes(query);
      }).sort(comparators[sortSel.value] || comparators.downloads);
      count.textContent = `${filtered.length.toLocaleString()} shown`;
      // The grid lays columns out to the sidebar's width; the list stays a single column.
      list.classList.toggle("om-card-grid", viewSel.value === "cards");
      list.replaceChildren();
      rendered = 0;
      more();
    };

    list.addEventListener("scroll", () => {
      if (rendered < filtered.length
        && list.scrollHeight - (list.scrollTop + list.clientHeight) < list.clientHeight) more();
    });
    let timer = null;
    search.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(apply, 150); });
    viewSel.addEventListener("change", () => { localStorage.setItem("om-registry-view", viewSel.value); apply(); });
    sortSel.addEventListener("change", () => { localStorage.setItem("om-registry-sort", sortSel.value); apply(); });
    licSel.addEventListener("change", () => { localStorage.setItem("om-registry-license", licSel.value); apply(); });
    filterBox.addEventListener("change", () => {
      localStorage.setItem("om-registry-published", filterBox.checked ? "1" : "0");
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
const sidebarStyle = document.createElement("style");
sidebarStyle.textContent = `
.om-side { display: flex; flex-direction: column; height: 100%; padding: 10px; gap: 8px;
  font: 13px/1.5 system-ui, sans-serif; color: var(--om-text); box-sizing: border-box; }
.om-nav { display: flex; gap: 4px; flex: none; }
.om-nav-btn { flex: 1; padding: 6px 4px; background: var(--om-surface); border: 1px solid var(--om-border);
  border-radius: 6px; color: var(--om-muted); cursor: pointer; font-size: 12px; }
.om-nav-btn:hover { background: var(--om-hover); }
.om-nav-btn.active { background: var(--om-border); color: var(--om-text); border-color: var(--om-border); }
.om-content { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 8px; }
.om-cat-head { display: flex; gap: 8px; align-items: center; justify-content: space-between; }
.om-cat-head .om-btn { flex: none; padding: 5px 12px; font-size: 12px; }
.om-empty { display: flex; flex-direction: column; gap: 12px; align-items: flex-start;
  padding: 20px 4px; }
.om-empty-title { font-size: 15px; font-weight: 600; }
.om-search { width: 100%; padding: 7px 10px; border-radius: 6px; box-sizing: border-box;
  background: var(--om-input); color: var(--om-text); border: 1px solid var(--om-border); }
.om-side-status { color: var(--om-muted); font-size: 11px; }
.om-side-list { flex: 1; overflow-y: auto; overflow-x: hidden; display: flex;
  flex-direction: column; gap: 4px; }
/* A thin, unobtrusive scrollbar for the scrolling areas. */
.om-side-list, .om-body, .om-readme-body, .om-versions {
  scrollbar-width: thin; scrollbar-color: var(--om-border) transparent;
}
.om-side-list::-webkit-scrollbar, .om-body::-webkit-scrollbar,
.om-readme-body::-webkit-scrollbar, .om-versions::-webkit-scrollbar { width: 8px; height: 8px; }
.om-side-list::-webkit-scrollbar-track, .om-body::-webkit-scrollbar-track,
.om-readme-body::-webkit-scrollbar-track, .om-versions::-webkit-scrollbar-track { background: transparent; }
.om-side-list::-webkit-scrollbar-thumb, .om-body::-webkit-scrollbar-thumb,
.om-readme-body::-webkit-scrollbar-thumb, .om-versions::-webkit-scrollbar-thumb { background: var(--om-border); border-radius: 4px; }
.om-side-list::-webkit-scrollbar-thumb:hover, .om-body::-webkit-scrollbar-thumb:hover,
.om-readme-body::-webkit-scrollbar-thumb:hover, .om-versions::-webkit-scrollbar-thumb:hover { background: #484f58; }
.om-page { display: flex; flex-direction: column; gap: 4px; }
.om-spacer { flex: none; }
.om-side-row { display: flex; gap: 9px; align-items: center; padding: 7px 8px;
  border: 1px solid var(--om-border); border-radius: 7px; background: var(--om-surface); }
.om-side-row:hover { background: var(--om-hover); }
.om-side-icon { width: 30px; height: 30px; border-radius: 5px; object-fit: cover; flex: none; }
.om-side-initial { display: flex; align-items: center; justify-content: center; font-weight: 700;
  font-size: 13px; color: var(--om-muted); background: var(--om-input);
  border: 1px solid var(--om-border); }
.om-side-text { flex: 1; min-width: 0; cursor: pointer; }
.om-side-name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.om-side-meta { color: var(--om-muted); font-size: 11px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.om-lic { font-size: 10px; font-weight: 600; padding: 0 6px; border: 1px solid var(--om-muted);
  border-radius: 4px; line-height: 15px; }
.om-upd { font-size: 10px; font-weight: 600; padding: 0 6px; margin-left: 6px;
  border: 1px solid #1f6feb; color: #58a6ff; border-radius: 999px; line-height: 15px; }
.om-disabled { font-size: 10px; font-weight: 600; padding: 0 6px; margin-left: 6px;
  border: 1px solid var(--om-border); color: var(--om-muted); border-radius: 999px; line-height: 15px; }
.om-side-ictl { flex: none; }
.om-stars { color: var(--om-muted); font-size: 11px; white-space: nowrap; }
/* Card view. The column count follows the sidebar's width rather than a fixed breakpoint,
   so widening the panel packs more cards per row instead of stretching them. */
.om-card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 8px; align-content: start; }
.om-card { display: flex; flex-direction: column; gap: 7px; min-width: 0; padding: 10px;
  border: 1px solid var(--om-border); border-radius: 9px; background: var(--om-surface); }
.om-card:hover { background: var(--om-hover); }
.om-card-head { display: flex; gap: 9px; align-items: center; min-width: 0; cursor: pointer; }
.om-card-icon { width: 44px; height: 44px; border-radius: 8px; font-size: 18px; }
.om-card-title { flex: 1; min-width: 0; }
.om-card-pub { color: var(--om-muted); font-size: 11px; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap; }
/* Three lines of description, clipped rather than wrapped, so cards stay the same height. */
.om-card-desc { color: var(--om-text-2); font-size: 11px; line-height: 1.45; cursor: pointer;
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; }
/* Pushed to the bottom so the button lines up across cards of unequal text length. */
.om-card-ictl { margin-top: auto; }
.om-card-ictl .om-btn { width: 100%; padding: 6px 12px; font-size: 12px; }
.om-alert { display: flex; gap: 10px; align-items: flex-start; margin-bottom: 10px;
  background: #2b2412; border: 1px solid #9e6a00; border-left-width: 3px; border-radius: 8px;
  padding: 10px 12px; color: var(--om-text); }
.om-alert.om-alert-danger { background: #2b1615; border-color: #b62324; border-left-color: #f85149; }
.om-alert-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.om-alert-names { color: var(--om-text-2); font-size: 12px; overflow-wrap: anywhere; }
.om-alert-x { background: none; border: none; color: var(--om-muted); font-size: 18px; line-height: 1;
  cursor: pointer; padding: 0 2px; flex: none; }
.om-alert-x:hover { color: var(--om-text); }
.om-dev { margin-top: 14px; display: flex; flex-direction: column; gap: 10px; }
.om-dev-head { font-size: 12px; font-weight: 600; color: var(--om-muted); text-transform: uppercase;
  letter-spacing: .04em; }
.om-wf-list { display: flex; flex-direction: column; gap: 6px;
  max-height: 40vh; overflow-y: auto; padding: 2px 2px 2px 0; }
.om-fold > summary { cursor: pointer; list-style: none; display: flex; align-items: center; gap: 8px; }
.om-fold > summary::-webkit-details-marker { display: none; }
.om-fold > summary::before { content: "▸"; font-size: 10px; color: var(--om-muted); }
.om-fold[open] > summary::before { content: "▾"; }
.om-fold > summary + .om-wf-list { margin-top: 8px; }
.om-fold-count { font-weight: 600; color: var(--om-text-2); border: 1px solid var(--om-border);
  border-radius: 999px; padding: 0 6px; line-height: 15px; font-size: 10px; }
.om-wf-item { display: flex; align-items: baseline; gap: 10px; text-align: left;
  background: var(--om-surface); border: 1px solid var(--om-border); border-radius: 8px; padding: 8px 12px;
  color: var(--om-text); cursor: pointer; font: inherit; }
.om-wf-item:hover { border-color: #388bfd; background: #1c2230; }
.om-wf-name { font-weight: 600; }
.om-wf-path { color: var(--om-muted); font-size: 11px; }
.om-side-controls { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.om-side-select { flex: 1 1 130px; min-width: 120px; padding: 5px 8px; border-radius: 6px;
  background: var(--om-input); color: var(--om-text); border: 1px solid var(--om-border); font-size: 12px; }
.om-side-filter { display: flex; gap: 5px; align-items: center; color: var(--om-muted); font-size: 12px; }
`;
document.head.appendChild(sidebarStyle);

// The sidebar tab icon swaps with the theme: the light artwork by default, the dark artwork
// whenever the frontend is not in a dark theme.
const iconStyle = document.createElement("style");
iconStyle.textContent = `
.om-tab-icon { display: inline-block; width: 1.25em; height: 1.25em;
  background: center / contain no-repeat url("${ICON_LIGHT}"); }
html:not(.dark-theme) .om-tab-icon { background-image: url("${ICON_DARK}"); }
`;
document.head.appendChild(iconStyle);

app.registerExtension({
  name: "openmanager.browser",
  settings: [
    {
      id: "openManager.enrichMetadata",
      name: "Open Manager: read pack README and repository metadata",
      type: "boolean",
      defaultValue: false,
      tooltip: "When on, a pack page reads its README from the repository. Cached until the pack's versions change.",
    },
    {
      id: "openManager.autoRenew",
      name: "Open Manager: renew the offline registry",
      type: "combo",
      options: [
        { text: "Off (manual only)", value: "off" },
        { text: "On every start", value: "startup" },
        { text: "When stale", value: "stale" },
      ],
      defaultValue: "startup",
      tooltip: "When the panel loads, refresh the cached registry in the background: never, once per launch, or only when older than the stale threshold.",
    },
    {
      id: "openManager.staleDays",
      name: "Open Manager: days before the registry is stale",
      type: "number",
      defaultValue: 7,
      tooltip: "Used by the 'When stale' renewal policy.",
    },
    {
      id: "openManager.parallelSync",
      name: "Open Manager: sync the registry in parallel",
      type: "boolean",
      defaultValue: true,
      tooltip: "Read several catalogue pages at once. Much faster on a broadband link; turn it off to read one page at a time.",
    },
    {
      id: "openManager.syncConcurrency",
      name: "Open Manager: catalogue pages read at once",
      type: "number",
      defaultValue: 8,
      tooltip: "How many pages a parallel sync keeps in flight. Clamped to 1-16; higher is not always faster and risks the registry rate-limiting you.",
    },
    {
      id: "openManager.githubToken",
      name: "Open Manager: GitHub token for one-click starring (optional)",
      type: "text",
      defaultValue: "",
      tooltip: "A GitHub token with starring permission lets the Star button star a repository in place. Without it, Star opens the repository on GitHub.",
    },
  ],
  commands: [
    {
      id: "openmanager.open",
      label: "Open Manager: browse a pack",
      function: async () => {
        const packId = await askText("Registry pack id", "was-node-suite-comfyui");
        if (packId) await openPack(packId);
      },
    },
  ],
  // ComfyUI reports the graph's missing node types here on every workflow load.
  afterConfigureGraph(missingNodeTypes) {
    lastMissingTypes = Array.isArray(missingNodeTypes)
      ? missingNodeTypes.map((m) => (typeof m === "string" ? m : m?.type || m?.name)).filter(Boolean)
      : null;
    refreshMissingIfActive();
  },
  setup() {
    app.extensionManager.registerSidebarTab({
      id: "openmanager",
      icon: "om-tab-icon",
      title: "Open Manager",
      tooltip: "Open Manager: browse the registry",
      type: "custom",
      render: renderSidebar,
    });
    // Themes registered beside the built-ins, each carrying its grid background and its light
    // or dark UI mode.
    registerThemes().catch(() => {});
    watchThemeExtras();
    // Renew the offline registry per the configured policy. The backend guards against
    // running more than once per server session.
    const policy = app.extensionManager.setting.get("openManager.autoRenew") ?? "startup";
    const staleDays = app.extensionManager.setting.get("openManager.staleDays") ?? 7;
    api.fetchApi(`${API}/catalog/auto-sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ policy, stale_days: staleDays, ...syncOptions() }),
    }).catch(() => {});
  },
});

window.openManager = { openPack };
