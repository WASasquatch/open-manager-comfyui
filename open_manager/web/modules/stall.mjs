import { api } from "../../../scripts/api.js";
import { API } from "./base.mjs";
import { el, toast, toastHost, toastShut, notify, chooseAction } from "./ui.mjs";
import { panelSetting } from "./settings.mjs";

const CHANNEL = "open_manager.stall";

const UP_WAIT = 900000;

const UP_EVERY = 1500;

const REQUEUE_TRIES = 40;

const ANSWER_WAIT = 5000;

const UP_ANSWER_WAIT = 10000;

const LOCAL_HOSTS = ["127.0.0.1", "localhost", "[::1]"];

let watching = false;

let lastShown = 0;

let lastAt = 0;

let keeper = null;

let alertToast = null;

let alertFor = "";

let pending = null;

async function stallCall(path, body, wait = 0) {
  const options = body === undefined ? {} : {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  };
  if (wait) options.signal = AbortSignal.timeout(wait);
  const answer = await api.fetchApi(`${API}/stall${path}`, options);
  return answer.json();
}

async function stallState(wait = 0) {
  const found = await stallCall("", undefined, wait);
  if (found) {
    keeper = found.keeper || null;
    if (found.last?.at) lastAt = found.last.at;
  }
  return found;
}

function pushStallConfig() {
  return stallCall("/config", {
    mode: panelSetting("openManager.stallAction", "ask"),
    minutes: panelSetting("openManager.stallMinutes", 10),
  }).catch(() => null);
}

async function tdrStatus() {
  try {
    const answer = await api.fetchApi(`${API}/monitor/tdr`);
    return answer.ok ? answer.json() : null;
  } catch {
    return null;
  }
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function minutesText(seconds) {
  return plural(Math.max(1, Math.round((seconds || 0) / 60)), "minute");
}

async function serverUp() {
  try {
    const answer = await api.fetchApi("/system_stats",
      { cache: "no-store", signal: AbortSignal.timeout(UP_ANSWER_WAIT) });
    return answer.ok;
  } catch {
    return false;
  }
}

async function awaitRequeue(note, before) {
  for (let tries = 0; tries < REQUEUE_TRIES; tries += 1) {
    if (pending !== note) return;
    let found = null;
    try {
      found = await stallState();
    } catch {
      found = null;
    }
    if (found?.last?.at && found.last.at !== before) {
      showLast(found.last);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, UP_EVERY));
  }
  if (pending !== note) return;
  pending = null;
  note.settle("ComfyUI restarted.", "ok", 8000);
}

function awaitRestart(note, before) {
  const started = Date.now();
  let down = false;
  const check = async () => {
    if (pending !== note) return;
    const up = await serverUp();
    if (!up && !down) {
      down = true;
      note.restarting();
    }
    if (up && down) {
      awaitRequeue(note, before);
      return;
    }
    if (Date.now() - started > UP_WAIT) {
      pending = null;
      note.settle("ComfyUI did not come back within fifteen minutes.", "warn", 10000);
      return;
    }
    setTimeout(check, UP_EVERY);
  };
  setTimeout(check, UP_EVERY);
}

function stopNote() {
  const node = el("div", "om-toast om-toast-warn om-stall-toast");
  const text = el("span", "om-toast-text", "Stopping the run");
  node.appendChild(text);
  let timer = 0;
  const note = {
    working() {
      text.textContent = "Still working. It stops when its current step ends.";
      if (node.querySelector(".om-stall-now")) return;
      const now = el("button", "om-btn om-stall-now", "Restart now");
      now.onclick = () => {
        note.restarting();
        stallCall("/unstick", { now: true }).catch(() => {});
      };
      node.insertBefore(now, node.querySelector(".om-toast-x"));
    },
    restarting() {
      text.textContent = "Restarting";
      node.querySelector(".om-stall-now")?.remove();
    },
    remove() {
      clearTimeout(timer);
      node.remove();
    },
    settle(message, kind, duration) {
      text.textContent = message;
      node.className = `om-toast om-toast-${kind} om-stall-toast`;
      node.querySelector(".om-stall-now")?.remove();
      clearTimeout(timer);
      timer = setTimeout(() => node.remove(), duration);
    },
  };
  toastShut(node, () => { clearTimeout(timer); if (pending === note) pending = null; });
  toastHost().appendChild(node);
  return note;
}

async function unstickNow() {
  let before = 0;
  try {
    before = (await stallState())?.last?.at || 0;
  } catch {
    before = 0;
  }
  let answer;
  try {
    answer = await stallCall("/unstick", {});
  } catch (error) {
    answer = { ok: false, reason: error?.message };
  }
  if (!answer?.ok) {
    notify("Not restarted", answer?.reason || "The server refused.");
    return;
  }
  const note = stopNote();
  pending = note;
  awaitRestart(note, before);
}

async function forceRestart() {
  const before = lastAt;
  let answer;
  try {
    const reply = await fetch(`http://127.0.0.1:${keeper.port}/restart`,
      { method: "POST", body: keeper.token, signal: AbortSignal.timeout(ANSWER_WAIT) });
    answer = await reply.json();
  } catch {
    answer = { ok: false, reason: "" };
  }
  if (!answer?.ok) {
    notify("Not restarted", answer?.reason || "");
    return;
  }
  const note = stopNote();
  note.restarting();
  pending = note;
  awaitRestart(note, before);
}

async function restartAndRequeue() {
  let current = null;
  try {
    current = await stallState(ANSWER_WAIT);
  } catch {
    current = null;
  }
  if (current && current.can_restart === false) {
    notify("Restart is switched off", "This machine is set not to restart from Open Manager.");
    return;
  }
  if (!current && keeper && LOCAL_HOSTS.includes(location.hostname)) {
    const force = await chooseAction("ComfyUI is not answering", "",
      [{ key: "go", label: "Restart and requeue", primary: true }], {
        wide: true,
        facts: [
          ["First", "Ends ComfyUI's process and starts it again"],
          ["Then", "Queues the running job and every waiting job again"],
        ],
      });
    if (force) forceRestart();
    return;
  }
  const go = await chooseAction("Restart and requeue?", "",
    [{ key: "go", label: "Restart and requeue", primary: true }], {
      wide: true,
      facts: [
        ["First", "Interrupts the running job"],
        ["If it is stuck", "Ends ComfyUI's process and starts it again"],
        ["If it is still working", "Waits for it to stop, up to ten minutes"],
        ["Then", "Queues the running job and every waiting job again"],
      ],
    });
  if (go) unstickNow();
}

function showAlert(alert) {
  if (!alert?.prompt_id) {
    alertToast?.remove();
    alertToast = null;
    alertFor = "";
    return;
  }
  if (alertFor === alert.prompt_id && alertToast?.isConnected) return;
  alertToast?.remove();
  alertFor = alert.prompt_id;
  const node = el("div", "om-toast om-toast-warn om-stall-toast");
  node.appendChild(el("span", "om-toast-text",
    `${alert.node || "The run"}: no progress for ${minutesText(alert.quiet)}.`));
  const go = el("button", "om-btn om-go", "Restart and requeue");
  go.onclick = () => { node.remove(); alertToast = null; unstickNow(); };
  const leave = el("button", "om-btn", "Leave it");
  leave.onclick = () => {
    node.remove();
    alertToast = null;
    stallCall("/dismiss", { prompt_id: alert.prompt_id }).catch(() => {});
  };
  node.appendChild(go);
  node.appendChild(leave);
  toastShut(node, () => { if (alertToast === node) alertToast = null; });
  toastHost().appendChild(node);
  alertToast = node;
}

function showLast(last) {
  if (!last?.at || last.at === lastShown) return;
  lastShown = last.at;
  const note = pending;
  pending = null;
  if (last.seen) {
    note?.settle("ComfyUI restarted.", "ok", 8000);
    return;
  }
  note?.remove();
  const said = [`ComfyUI restarted. ${plural(last.requeued || 0, "job")} queued again.`];
  const skipped = last.skipped?.length || 0;
  const failed = last.failed?.length || 0;
  if (skipped) said.push(`${plural(skipped, "job")} left out: ${last.skipped[0]}.`);
  if (failed) said.push(`${plural(failed, "job")} not queued: ${last.failed[0]}.`);
  toast(said.join(" "), { kind: skipped || failed ? "warn" : "ok", sticky: true });
  stallCall("/seen", {}).catch(() => {});
}

function showUnstuck(unstuck) {
  const note = pending;
  pending = null;
  const failed = unstuck.failed?.length || 0;
  const text = failed
    ? `The run stopped, but it was not queued again: ${unstuck.failed[0]}.`
    : "The run stopped and was queued again.";
  if (note) note.settle(text, failed ? "warn" : "ok", 8000);
  else toast(text, { kind: failed ? "warn" : "ok", duration: 8000 });
}

function watchStalls() {
  if (watching) return;
  watching = true;
  pushStallConfig();
  api.addEventListener(CHANNEL, (event) => {
    const data = event?.detail || {};
    if ("alert" in data) showAlert(data.alert);
    if (data.last) showLast(data.last);
    if (data.unstuck) showUnstuck(data.unstuck);
    if (data.unsticking?.working) pending?.working();
  });
  const refresh = () => stallState().then((found) => {
    if (found?.alert?.prompt_id) showAlert(found.alert);
    if (found?.last) showLast(found.last);
  }).catch(() => {});
  api.addEventListener("reconnected", refresh);
  refresh();
}

export { pushStallConfig, restartAndRequeue, tdrStatus, watchStalls };
