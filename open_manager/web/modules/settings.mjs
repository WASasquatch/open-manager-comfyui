import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import { API } from "./base.mjs";
import { el, closeOn, toast, notify, chooseAction } from "./ui.mjs";
import { foldId } from "./installs.mjs";
import { openPack } from "./packs.mjs";
import { dlPost } from "./downloads.mjs";

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
  const moving = [
    ["openManager.virusTotalKey", "virustotal", "VirusTotal key"],
    ["openManager.githubToken", "github", "GitHub token"],
  ];
  const moved = [];
  for (const [id, name, label] of moving) {
    let value = "";
    try { value = String(app.extensionManager.setting.get(id) || "").trim(); } catch { continue; }
    if (!value) continue;
    const answer = await dlPost("/keys", { name, value });
    if (!answer?.ok) continue;
    try { await app.extensionManager.setting.set(id, ""); } catch {}
    keysHeld[name] = true;
    moved.push(label);
    if (answer.warning) {
      notify("Key stored, with a caveat", `${label}: ${answer.warning}.`);
    }
  }
  if (moved.length) {
    toast(`${moved.join(" and ")} moved from ComfyUI's settings to Access keys in the Open Manager menu.`,
          { kind: "ok", sticky: true });
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
  const found = await loadKeys();
  const backdrop = el("div", "om-backdrop");
  const box = el("div", "om-note om-note-wide");
  box.appendChild(el("div", "om-note-title", "Access keys"));
  box.appendChild(el("div", "om-dl-note",
    "Kept unencrypted in Open Manager's own file, restricted to this account and used only "
    + "by this server. Never written to ComfyUI's settings, sent in a URL or shown back."));
  box.appendChild(el("div", "om-dl-note",
    "Where an environment variable is set, it is used instead."));
  if (found?.warning) box.appendChild(el("div", "om-dl-note om-dl-bad", found.warning));

  const rows = el("div", "om-keys");
  for (const [name, entry] of Object.entries(found?.keys || {})) {
    const label = entry.label || name;
    const placeholder = entry.placeholder || "";
    const why = entry.purpose || "";
    const fromEnv = entry.source === "environment";
    const row = el("div", "om-keys-row");
    const head = el("div", "om-dl-top");
    head.appendChild(el("span", "om-dl-name", label));
    const state = el("span", "om-dl-src", entry.set
      ? `${fromEnv ? "from the environment" : "held"} ${entry.hint}` : "not set");
    if (fromEnv) state.title = `Read from ${entry.env}.`;
    head.appendChild(state);
    row.appendChild(head);
    row.appendChild(el("div", "om-dl-note", why));
    if (fromEnv) {
      row.appendChild(el("div", "om-dl-note om-dl-bad",
        `${entry.env} is set, so that is the key in use. `
        + `${entry.shadowed ? "What is stored here is" : "Anything saved here is"} ignored `
        + "until the variable is unset."));
    }

    const line = el("div", "om-keys-line");
    const input = el("input", "om-search om-keys-input");
    input.type = "password";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.placeholder = entry.set ? "Replace it: paste a new one" : (placeholder || "Paste it here");
    line.appendChild(input);

    const save = el("button", "om-btn om-go", "Save");
    save.onclick = async () => {
      const value = input.value.trim();
      if (!value) return;
      save.disabled = true;
      const answer = await dlPost("/keys", { name, value });
      input.value = "";
      save.disabled = false;
      if (!answer?.ok) { notify("Not saved", answer?.reason || "It could not be written."); return; }
      keysHeld[name] = true;
      state.textContent = fromEnv ? `from the environment ${entry.hint}` : `held ${answer.hint}`;
      forget.style.display = "";
      toast(`${label} key saved.`, { kind: "ok" });
      if (answer.warning) notify("Saved, with a caveat", `${label}: ${answer.warning}.`);
    };
    line.appendChild(save);

    const forget = el("button", "om-btn", "Forget");
    forget.style.display = entry.set ? "" : "none";
    forget.onclick = async () => {
      const go = await chooseAction(`Forget the ${label} key?`,
        "It is removed from disk. Anything that needed it stops working until another is set.",
        [{ key: "go", label: "Forget it", primary: true }], { wide: true });
      if (!go) return;
      const answer = await dlPost("/keys", { name, forget: true });
      if (!answer?.ok) { notify("Not removed", answer?.reason || "It could not be written."); return; }
      keysHeld[name] = false;
      state.textContent = "not set";
      forget.style.display = "none";
      toast(`${label} key forgotten.`, { kind: "ok" });
    };
    line.appendChild(forget);
    row.appendChild(line);
    rows.appendChild(row);
  }
  box.appendChild(rows);
  if (found?.path) {
    const where = el("div", "om-dl-note", `Stored at ${found.path}`);
    box.appendChild(where);
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
