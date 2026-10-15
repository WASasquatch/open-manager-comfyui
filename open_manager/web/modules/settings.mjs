import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import { API } from "./base.mjs";
import { el, closeOn, toast, notify } from "./ui.mjs";
import { foldId } from "./installs.mjs";
import { openPack } from "./packs.mjs";

const keysHeld = { huggingface: false, github: false, virustotal: false };

async function loadKeys() {
  try {
    const found = await (await api.fetchApi(`${API}/keys`)).json();
    for (const [name, entry] of Object.entries(found.keys || {})) {
      keysHeld[name] = !!entry.set;
    }
    return found;
  } catch {
    return null;
  }
}

async function migrateKeys() {
  const legacy = [
    ["openManager.virusTotalKey", "VIRUS_TOTAL_KEY"],
    ["openManager.githubToken", "GITHUB_TOKEN"],
  ];
  const cleared = [];
  for (const [id, variable] of legacy) {
    let value = "";
    try { value = String(app.extensionManager.setting.get(id) || "").trim(); } catch { continue; }
    if (!value) continue;
    try { await app.extensionManager.setting.set(id, ""); } catch { continue; }
    cleared.push(variable);
  }
  if (cleared.length) {
    toast(`Keys removed from ComfyUI's settings. Set ${cleared.join(" and ")} instead.`,
          { kind: "warn", sticky: true });
  }
}

function migrateEntryMode() {
  let old;
  try { old = app.extensionManager.setting.get("openManager.classicMenu"); } catch { return; }
  if (old === undefined || old === null) return;
  try {
    const asked = app.extensionManager.setting.get("openManager.managerEntry");
    if (asked && asked !== "auto") return;
    app.extensionManager.setting.set("openManager.managerEntry", old === false ? "panel" : "classic");
    app.extensionManager.setting.set("openManager.classicMenu", null);
  } catch {
  }
}

let selfInfo = null;

async function loadSelfInfo(check = false) {
  if (selfInfo && !check) return selfInfo;
  try {
    const answer = await api.fetchApi(`${API}/self${check ? "?check=1" : ""}`);
    if (answer.ok) selfInfo = await answer.json();
  } catch {
  }
  return selfInfo;
}

function selfUpdateTarget(pack) {
  const id = foldId(pack.registry_id || pack.id || "");
  if (!selfInfo || !id || id !== foldId(selfInfo.node_id || "")) return "";
  return selfInfo.behind ? String(selfInfo.newest || "") : "";
}

async function openAboutDialog() {
  let info = null;
  try {
    const answer = await api.fetchApi(`${API}/self?check=1`);
    if (answer.ok) { info = await answer.json(); selfInfo = info; }
  } catch {
  }

  const backdrop = el("div", "om-backdrop");
  const box = el("div", "om-note om-note-wide");
  box.appendChild(el("div", "om-note-title", "Open Manager"));

  if (!info) {
    box.appendChild(el("div", "om-dl-note",
      "The server did not answer, so how this copy is installed is unknown."));
  } else {
    const packaged = info.mode === "package";
    const facts = el("div", "om-keys-row");
    const head = el("div", "om-dl-top");
    head.appendChild(el("span", "om-dl-name", `Version ${info.version}`));
    head.appendChild(el("span", "om-dl-src",
      packaged ? "installed as a package" : "installed as a custom node"));
    if (info.behind && info.newest) {
      head.appendChild(el("span", "om-upd", `update → ${info.newest}`));
    } else if (info.newest) {
      head.appendChild(el("span", "om-dl-src", "up to date"));
    }
    facts.appendChild(head);
    facts.appendChild(el("div", "om-dl-note", info.path));
    box.appendChild(facts);

    if (packaged) {
      box.appendChild(el("div", "om-dl-note",
        "Open Manager is installed in site-packages in place of ComfyUI Manager and cannot "
        + "update itself from here."));
      for (const step of info.steps || []) {
        const row = el("div", "om-keys-row");
        row.appendChild(el("div", "om-dl-note", step.label));
        const line = el("div", "om-keys-line");
        const field = el("div", "om-cmd", step.command);
        line.appendChild(field);
        const copy = el("button", "om-btn", "Copy");
        copy.onclick = () => {
          navigator.clipboard?.writeText(step.command)
            .then(() => toast("Command copied.", { kind: "ok" }))
            .catch(() => notify("Not copied", "The clipboard is not available here."));
        };
        line.appendChild(copy);
        row.appendChild(line);
        box.appendChild(row);
      }
      if (info.note) box.appendChild(el("div", "om-dl-note", info.note));
    } else {
      box.appendChild(el("div", "om-dl-note",
        "Open Manager is a pack in custom_nodes and updates from its page."));
      const line = el("div", "om-keys-line");
      const go = el("button", "om-btn om-go", "Open its page");
      go.onclick = () => { backdrop.remove(); openPack(info.node_id); };
      line.appendChild(go);
      box.appendChild(line);
      if (info.from_git) {
        box.appendChild(el("div", "om-dl-note",
          "This one is a git working copy. Installing over it replaces the directory, so "
          + "commit or stash anything you have changed there first."));
      }
    }
  }

  const foot = el("div", "om-note-foot");
  const close = el("button", "om-btn", "Close");
  close.onclick = () => backdrop.remove();
  foot.appendChild(close);
  box.appendChild(foot);
  backdrop.appendChild(box);
  document.body.appendChild(backdrop);
  closeOn(backdrop);
}

async function openKeysDialog() {
  const backdrop = el("div", "om-backdrop");
  const box = el("div", "om-note om-note-wide");
  const body = el("div", "om-keys-body");
  const foot = el("div", "om-note-foot");
  const close = el("button", "om-btn", "Close");
  close.onclick = () => backdrop.remove();
  foot.appendChild(close);
  box.append(el("div", "om-note-title", "Access keys"), body, foot);
  backdrop.appendChild(box);
  document.body.appendChild(backdrop);
  closeOn(backdrop);
  body.appendChild(el("div", "om-dl-note", "Reading"));

  const found = await loadKeys();
  if (!found?.keys) {
    body.replaceChildren(el("div", "om-dl-note", "The server did not answer."));
    return;
  }
  const parts = [
    el("div", "om-dl-note",
      "Keys come from environment variables. Set one in the file that starts ComfyUI, "
      + "then restart it."),
    el("div", "om-cmd", "Windows: set NAME=value    Linux and macOS: export NAME=value"),
  ];
  const rows = el("div", "om-keys");
  for (const [name, entry] of Object.entries(found.keys)) {
    const row = el("div", "om-keys-row");
    const head = el("div", "om-dl-top");
    head.appendChild(el("span", "om-dl-name", entry.label || name));
    head.appendChild(el("span", "om-dl-src",
      entry.set ? `Set by ${entry.env} ${entry.hint}` : "Not set"));
    row.appendChild(head);
    if (entry.purpose) row.appendChild(el("div", "om-dl-note", entry.purpose));
    if (!entry.set && entry.env_names?.length) {
      row.appendChild(el("div", "om-dl-note", `Variable: ${entry.env_names.join(", ")}`));
    }
    rows.appendChild(row);
  }
  parts.push(rows);
  body.replaceChildren(...parts);
}

function vtKey() {
  return keysHeld.virustotal ? "set" : "";
}

function vtReady() {
  return vtKey().length > 0;
}

async function vtRemaining() {
  try {
    const s = await (await api.fetchApi(`${API}/scan/state`)).json();
    return Math.max(0, (s.budget || 0) - (s.budget_used || 0));
  } catch {
    return null;
  }
}


function panelSetting(key, fallback) {
  try {
    const value = app.extensionManager.setting.get(key);
    return value === undefined || value === null ? fallback : value;
  } catch {
    return fallback;
  }
}

export { keysHeld, loadKeys, migrateKeys, migrateEntryMode, loadSelfInfo, selfUpdateTarget, openAboutDialog, openKeysDialog, vtReady, vtRemaining, panelSetting };
