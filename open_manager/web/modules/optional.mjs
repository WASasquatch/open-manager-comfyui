import { api } from "../../../scripts/api.js";
import { API } from "./base.mjs";
import { el, closeOn, toast, panel, countNote } from "./ui.mjs";
import { loadingBlock } from "./markdown.mjs";
import { INSTALL_POLICIES, paintImpact, installPolicyDefault, showInstallFailure, offerRestore,
         remindRestart } from "./installs.mjs";

const GROUP_STATE = {
  installed: { word: "installed", cls: "om-opt-installed" },
  partial: { word: "partly installed", cls: "om-opt-partial" },
  missing: { word: "", cls: "" },
};

const PACKAGE_STATE = {
  satisfied: (entry) => `have ${entry.installed}`,
  conflict: (entry) => `have ${entry.installed} · conflict`,
  vcs: () => "from URL",
};

const RECHECK_MS = 350;

let rowSeq = 0;

async function readGroups(packId) {
  const answer = await api.fetchApi(`${API}/optional/${encodeURIComponent(packId)}`);
  const data = await answer.json();
  if (!answer.ok || !data.ok) throw new Error(data.reason || `HTTP ${answer.status}`);
  return data;
}

async function postJson(route, body) {
  const answer = await api.fetchApi(`${API}${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await answer.json();
  if (!answer.ok && !data.errors) throw new Error(data.reason || data.detail || `HTTP ${answer.status}`);
  return data;
}

function wantedOf(group) {
  return (group.packages || []).filter((entry) => !String(entry.line).startsWith("-"));
}

function packageList(group) {
  const wanted = wantedOf(group);
  const box = panel("Packages", countNote(wanted.length, "package"), { open: false });
  box.classList.add("om-opt-packages");
  const list = el("div", "om-deps");
  for (const entry of wanted) {
    const row = el("div", "om-dep");
    const name = el("span", "om-dep-name", entry.line);
    if (entry.note) name.appendChild(el("span", "om-opt-note", entry.note));
    row.appendChild(name);
    const said = PACKAGE_STATE[entry.status]?.(entry) || "";
    const state = el("span", "om-dep-status", said);
    if (entry.status === "satisfied") state.classList.add("om-opt-have");
    if (entry.status === "conflict") state.classList.add("om-opt-clash");
    row.appendChild(state);
    list.appendChild(row);
  }
  box.body.appendChild(list);
  return box;
}

function groupText(group, headFor) {
  const text = el("div", "om-dl-modeltext");
  const head = el(headFor ? "label" : "div", "om-dl-top om-opt-head");
  if (headFor) head.htmlFor = headFor;
  head.appendChild(el("span", "om-dl-name", group.name));
  const state = GROUP_STATE[group.state] || GROUP_STATE.missing;
  if (state.word) head.appendChild(el("span", "om-dl-state", state.word));
  text.appendChild(head);
  if (group.description) text.appendChild(el("div", "om-dl-note", group.description));
  const where = el("div", "om-dl-where");
  where.appendChild(el("span", "om-dl-src", group.source));
  text.appendChild(where);
  text.appendChild(packageList(group));
  return text;
}

function reviewGroups(packId, name, groups, { ticked = [], policy = "", leave = "Cancel" } = {}) {
  return new Promise((resolve) => {
    const backdrop = el("div", "om-backdrop");
    const dialog = el("div", "om-dialog om-dl-pick om-opt-pick");
    const done = (value) => { backdrop.remove(); resolve(value); };
    const close = el("button", "om-x", "×");
    close.title = "Close";
    close.onclick = () => done(null);
    dialog.appendChild(close);

    const head = el("div", "om-head");
    head.appendChild(el("div", "om-title", `${name}: optional requirements`));
    dialog.appendChild(head);

    const body = el("div", "om-body om-dl-body");
    const list = el("div", "om-dl-models");
    const boxes = [];
    for (const group of groups) {
      rowSeq += 1;
      const id = `om-opt-${rowSeq}`;
      const state = GROUP_STATE[group.state] || GROUP_STATE.missing;
      const row = el("div", `om-dl-model om-opt-group ${state.cls}`.trim());
      const box = el("input", "om-dl-check");
      box.type = "checkbox";
      box.id = id;
      box.checked = ticked.includes(group.name);
      box.onchange = () => changed();
      boxes.push([box, group]);
      row.appendChild(box);
      row.appendChild(groupText(group, id));
      list.appendChild(row);
    }
    body.appendChild(list);

    const changes = el("h4", null, "What this would change here");
    const impactSlot = el("div");
    body.appendChild(changes);
    body.appendChild(impactSlot);

    const policyRow = el("div", "om-policy");
    const policyPick = el("select", "om-side-select om-policy-pick");
    for (const [value, label] of INSTALL_POLICIES) {
      const option = el("option", null, label);
      option.value = value;
      policyPick.appendChild(option);
    }
    policyPick.value = INSTALL_POLICIES.some(([value]) => value === policy)
      ? policy : installPolicyDefault();
    policyRow.appendChild(el("span", "om-policy-label", "Requirements"));
    policyRow.appendChild(policyPick);
    body.appendChild(policyRow);
    dialog.appendChild(body);

    const foot = el("div", "om-dl-pickfoot");
    const every = el("label", "om-opt-all");
    const all = el("input", "om-dl-check");
    all.type = "checkbox";
    every.appendChild(all);
    every.appendChild(document.createTextNode("All"));
    const summary = el("span", "om-dl-summary", "");
    const skip = el("button", "om-btn", leave);
    const base = { label: "Install selected", cls: "om-btn om-go" };
    const go = el("button", base.cls, base.label);
    foot.appendChild(every);
    foot.appendChild(summary);
    foot.appendChild(skip);
    foot.appendChild(go);
    dialog.appendChild(foot);

    const picked = () => boxes.filter(([box]) => box.checked).map(([, group]) => group.name);
    let timer = 0;
    const check = () => {
      clearTimeout(timer);
      const chosen = picked();
      if (!chosen.length) {
        impactSlot._omTicket = (impactSlot._omTicket || 0) + 1;
        impactSlot.replaceChildren();
        changes.hidden = true;
        go.textContent = base.label;
        go.className = base.cls;
        return;
      }
      changes.hidden = false;
      paintImpact(impactSlot, go, base, async () => {
        const report = await postJson("/optional-impact",
          { id: packId, groups: chosen, policy: policyPick.value });
        if (report.ok === false) throw new Error(report.reason || "no answer");
        return report;
      });
    };
    const changed = () => {
      const count = picked().length;
      all.checked = count === boxes.length;
      all.indeterminate = count > 0 && count < boxes.length;
      summary.textContent = `${count} of ${countNote(boxes.length, "group")} selected`;
      go.disabled = count === 0;
      clearTimeout(timer);
      timer = setTimeout(check, RECHECK_MS);
    };
    all.onchange = () => {
      for (const [box] of boxes) box.checked = all.checked;
      changed();
    };
    policyPick.addEventListener("change", check);
    skip.onclick = () => done(null);
    go.onclick = () => done({ groups: picked(), policy: policyPick.value });
    changed();
    check();

    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);
    closeOn(backdrop, () => done(null));
  });
}

async function installGroups(packId, name, groups, policy) {
  const what = groups.join(", ");
  const progress = toast(`${name}: installing ${what}...`, { sticky: true });
  let result;
  try {
    result = await postJson("/install-optional", { id: packId, groups, policy });
  } catch (error) {
    result = { ok: false, output: error.message, errors: [error.message], requirements: [] };
  }
  if (result.ok) {
    progress.settle(`${name}: ${what} installed.`, "ok", 6000);
    if (result.restart_required) remindRestart();
    return result;
  }
  progress.settle(`${name}: ${what} did not install.`, "warn", 9000);
  const choice = await showInstallFailure({ name: `${name} ${what}` }, {
    pip_errors: result.errors || [],
    pip_requirements: result.requirements || [],
    pip_output: result.output || "",
    installer: result.installer || "",
    environment: result.environment,
    environment_id: result.environment_id,
  }).catch(() => "");
  if (choice === "restore" && result.environment_id) {
    await offerRestore(result.environment_id, `${name} ${what}`).catch(() => {});
  } else if (result.restart_required) {
    remindRestart();
  }
  return result;
}

async function reviewThenInstall(packId, name, groups, options) {
  const decided = await reviewGroups(packId, name, groups, options);
  if (!decided?.groups.length) return null;
  return installGroups(packId, name, decided.groups, decided.policy);
}

async function offerOptional(packId, name, policy) {
  let data;
  try {
    data = await readGroups(packId);
  } catch {
    return;
  }
  if (!data.groups?.length || !(data.unseen?.length || data.pending?.length)) return;
  const decided = await reviewGroups(packId, name, data.groups,
    { ticked: data.pending || [], policy, leave: "Skip" });
  if (!decided?.groups.length) {
    await postJson("/install-optional", { id: packId, groups: [], policy }).catch(() => {});
    return;
  }
  await installGroups(packId, name, decided.groups, decided.policy);
}

function optionalPane(packId, name) {
  const pane = el("div", "om-tabpane om-opt-pane");
  let groups = [];
  const paint = () => {
    const list = el("div", "om-dl-models");
    const open = groups.filter((group) => group.state !== "installed");
    if (open.length > 1) {
      const bar = el("div", "om-actions");
      const every = el("button", "om-btn", "Install all");
      every.onclick = async () => {
        await reviewThenInstall(packId, name, groups, { ticked: open.map((group) => group.name) });
        load();
      };
      bar.appendChild(every);
      list.appendChild(bar);
    }
    for (const group of groups) {
      const state = GROUP_STATE[group.state] || GROUP_STATE.missing;
      const row = el("div", `om-dl-model om-opt-group ${state.cls}`.trim());
      const text = groupText(group, "");
      const act = el("button", "om-btn om-dl-btn",
        group.state === "installed" ? "Reinstall" : "Install");
      act.onclick = async () => {
        await reviewThenInstall(packId, name, groups, { ticked: [group.name] });
        load();
      };
      text.querySelector(".om-opt-head").appendChild(act);
      row.appendChild(text);
      list.appendChild(row);
    }
    pane.replaceChildren(list);
  };
  const load = async () => {
    pane.replaceChildren(loadingBlock("Reading optional requirements"));
    try {
      const data = await readGroups(packId);
      groups = data.groups || [];
      paint();
      return data;
    } catch (error) {
      pane.replaceChildren(el("div", "om-side-status",
        `Optional requirements could not be read: ${error.message}`));
      return null;
    }
  };
  return { pane, load };
}

async function addOptionalTab(tabs, packId, name) {
  const built = optionalPane(packId, name);
  const data = await built.load();
  if (!data?.groups?.length) return;
  tabs.add({ id: "optional", title: "Optional", order: 35,
             note: countNote(data.groups.length, "group"), pane: built.pane });
}

async function addOptionalPanel(slot, packId, name) {
  const built = optionalPane(packId, name);
  const data = await built.load();
  if (!data?.groups?.length) {
    slot.remove();
    return;
  }
  const box = panel("Optional requirements", countNote(data.groups.length, "group"),
    { open: false });
  box.body.appendChild(built.pane);
  slot.replaceWith(box);
}

export { offerOptional, optionalPane, addOptionalTab, addOptionalPanel };
