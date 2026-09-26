import { api } from "../../../scripts/api.js";
import { API } from "./base.mjs";
import { el, tipWith, liveTip } from "./ui.mjs";
import { floatingPanel } from "./windows.mjs";
import { panelSetting } from "./settings.mjs";
import { bytesText } from "./downloads.mjs";
import { mountTopbar, monitorStrip } from "./topbar.mjs";
import { readingAge, readingQuiet, quietText, recordReading, openMemoryPanel } from "./memory.mjs";

const MONITOR_CLIENT = `om-${Math.random().toString(36).slice(2, 10)}`;

let monitorTimer = 0;

function monitorInterval() {
  const asked = Number(panelSetting("openManager.monitorInterval", 2));
  return Number.isFinite(asked) ? Math.max(1, Math.min(10, asked)) : 2;
}

const LINK_QUIET = 12000;
const LINK_WOKE = 8000;
const LINK_DEADLINE = 8000;
const LINK_VERIFY = 10000;
const LINK_TRY_BASE = 15000;
const LINK_TRY_CAP = 240000;
const LINK_POLL_BASE = 3000;
const LINK_POLL_CAP = 30000;
const LINK_STRIKES = 3;

const link = {
  pushAt: 0, pullAt: 0, failAt: 0, fail: "", status: 0, every: 0, running: false,
  strikes: 0, tries: 0, nextTryAt: 0, verifyUntil: 0, socketSeen: null,
  nextPostAt: 0, pollStep: 0, hiddenAt: 0, hiddenFor: 0,
};

const readingHooks = new Set();

const monitorFlight = new Set();

function monitorDeadline(ms) {
  const stop = new AbortController();
  const timer = setTimeout(
    () => stop.abort(new DOMException("timed out", "TimeoutError")), ms || LINK_DEADLINE);
  stop.done = () => { clearTimeout(timer); monitorFlight.delete(stop); };
  monitorFlight.add(stop);
  return stop;
}

function dropMonitorCalls() {
  for (const stop of [...monitorFlight]) {
    stop.dropped = true;
    stop.abort(new DOMException("dropped", "AbortError"));
    stop.done();
  }
}

function linkEvery() {
  return Math.max(1, link.every || monitorInterval());
}

function linkReached() {
  link.pullAt = Date.now();
  link.fail = "";
  link.status = 0;
  link.pollStep = 0;
  link.nextPostAt = 0;
}

function linkLeased(answer) {
  link.running = !!answer?.running;
  const every = Number(answer?.reading?.every || answer?.interval);
  if (Number.isFinite(every) && every > 0) link.every = every;
}

function linkFailed(why, status) {
  link.failAt = Date.now();
  link.fail = why;
  link.status = status || 0;
  link.pollStep = Math.min(link.pollStep + 1, 4);
  const base = Math.min(LINK_POLL_CAP, LINK_POLL_BASE * (2 ** link.pollStep));
  link.nextPostAt = Date.now() + LINK_POLL_BASE + Math.round(Math.random() * base);
}

function linkMayPost() {
  return Date.now() >= link.nextPostAt;
}

async function monFetch(path, options, ms) {
  const stop = monitorDeadline(ms);
  let answer;
  try {
    answer = await api.fetchApi(`${API}${path}`, { ...options, signal: stop.signal });
  } catch (wrong) {
    if (!stop.dropped) linkFailed(wrong?.name === "TimeoutError" ? "slow" : "cut");
    throw wrong;
  } finally {
    stop.done();
  }
  if (!answer.ok) {
    linkFailed("refused", answer.status);
    throw new Error(`HTTP ${answer.status}`);
  }
  linkReached();
  return answer.json();
}

function monPost(path, body, ms) {
  return monFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  }, ms);
}

function monGet(path, ms) {
  return monFetch(path, {}, ms);
}

function monRelease(client) {
  const stop = monitorDeadline(4000);
  api.fetchApi(`${API}/monitor`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client, release: true }),
    signal: stop.signal,
  }).catch(() => {}).finally(() => stop.done());
}

function pushStale() {
  const since = link.pushAt || link.pullAt;
  if (!since) return false;
  return Date.now() - since > Math.max(LINK_QUIET, linkEvery() * 3000 + 4000);
}

function httpAlive() {
  if (!link.pullAt && !link.failAt) return true;
  return !!link.pullAt && link.pullAt >= link.failAt;
}

function linkAsleep() {
  return document.hidden || (!!link.hiddenAt && Date.now() - link.hiddenAt < LINK_WOKE);
}

function linkState() {
  if (linkAsleep()) return "asleep";
  if (Date.now() < link.verifyUntil) return "reviving";
  if (!httpAlive()) return link.fail || "cut";
  if (!pushStale()) return "live";
  return link.running ? "feed" : "idle";
}

function linkDown() {
  const state = linkState();
  return state !== "live" && state !== "feed";
}

function takeReading(reading) {
  recordReading(reading);
  paintMonitor(reading);
  for (const hook of [...readingHooks]) hook(reading);
}

function linkTick() {
  if (linkAsleep()) { link.strikes = 0; return; }
  if (!pushStale()) {
    link.strikes = 0;
    link.tries = 0;
    link.nextTryAt = 0;
    link.verifyUntil = 0;
    return;
  }
  if (!httpAlive() || !link.running) return;
  link.strikes += 1;
  if (link.strikes < LINK_STRIKES) return;
  reviveSocket(false);
}

function reviveSocket(asked) {
  const now = Date.now();
  if (now < link.verifyUntil) return;
  if (!asked && now < link.nextTryAt) return;
  let socket;
  try { socket = api.socket; } catch { return; }
  if (socket === undefined) return;
  const hold = (ms) => { link.verifyUntil = now + ms; link.strikes = 0; };
  if (socket === null) { hold(2000); return; }
  if (socket.readyState === WebSocket.CLOSING || socket.readyState === WebSocket.CLOSED) {
    hold(2000);
    return;
  }
  if (socket.readyState === WebSocket.CONNECTING && socket !== link.socketSeen) {
    link.socketSeen = socket;
    hold(LINK_VERIFY);
    return;
  }
  const wedged = socket === link.socketSeen && link.tries >= 2;
  link.strikes = 0;
  link.tries += 1;
  link.socketSeen = socket;
  link.verifyUntil = now + LINK_VERIFY;
  link.nextTryAt = link.verifyUntil
    + Math.round(Math.random() * Math.min(LINK_TRY_CAP, LINK_TRY_BASE * (2 ** link.tries)));
  if (!window.name && api.clientId) window.name = api.clientId;
  if (!wedged) {
    try { socket.close(); } catch {}
    return;
  }
  api.socket = null;
  try { socket.close(); } catch {}
  api.init();
}

const LINK_SAY = {
  asleep: {
    short: "paused while hidden",
    line: "Paused while this window is not on screen.",
    lead: "Paused while hidden",
    tip: "Readings start again when the window comes back.",
  },
  reviving: {
    short: "reconnecting",
    line: "Rebuilding the connection to the server.",
    lead: "Reconnecting",
    tip: "Readings in the gap are lost.",
  },
  slow: {
    short: "the server is not answering",
    line: "The server is not answering this tab.",
    lead: "Not answering",
    tip: "Heavy graph work stops the server answering.",
  },
  cut: {
    short: "cannot reach the server",
    line: "This tab cannot reach the server.",
    lead: "Out of reach",
  },
  refused: {
    short: "the request was refused",
    line: "The server refused the request.",
    lead: "Refused",
  },
  feed: {
    short: "the live connection is quiet",
    line: "The live connection is quiet. These readings are the check every few seconds.",
    lead: "Live connection quiet",
  },
  idle: {
    short: "the server is not sampling",
    line: "The server is not sampling.",
    lead: "Not sampling",
    tip: "The server answered but is not measuring; it starts again when something asks.",
  },
};

function linkFacts() {
  const age = readingAge();
  const next = link.nextPostAt - Date.now();
  return [
    ["Last reading", Number.isFinite(age) ? `${Math.round(age / 1000)}s ago` : "none yet"],
    ["Failed tries", link.tries ? String(link.tries) : ""],
    ["Next try", next > 0 ? `in ${Math.max(1, Math.round(next / 1000))}s` : ""],
  ];
}

function linkText() {
  const say = LINK_SAY[linkState()];
  if (!say) return "";
  const left = link.nextPostAt - Date.now();
  return left > 0
    ? `${say.line} Trying again in ${Math.max(1, Math.round(left / 1000))} seconds.`
    : say.line;
}

function buildLinkRow(retry) {
  const row = el("div", "om-mem-link");
  const text = el("span", "om-mem-link-text", "");
  const act = el("button", "om-btn om-dl-btn", "Reconnect");
  row.appendChild(text);
  row.appendChild(act);
  liveTip(row, () => (row._say ? { ...row._say, facts: linkFacts() } : ""));
  act.onclick = () => retry();
  row.tell = (state) => {
    if (row._busy || Date.now() < (row._until || 0)) return;
    const say = LINK_SAY[state];
    row.hidden = !say;
    if (!say) return;
    row.classList.toggle("om-mem-link-bad", state !== "asleep" && state !== "feed");
    text.textContent = linkText();
    row._say = { lead: say.lead, lines: [say.tip] };
    act.hidden = state === "asleep";
    act.disabled = state === "reviving";
  };
  row.working = (line) => {
    row._busy = true;
    row.hidden = false;
    row.classList.add("om-mem-link-bad");
    text.textContent = line;
    act.hidden = false;
    act.disabled = true;
  };
  row.settled = (line, bad) => {
    row._busy = false;
    row._until = Date.now() + 5000;
    row.hidden = false;
    row.classList.toggle("om-mem-link-bad", !!bad);
    text.textContent = line;
    act.hidden = false;
    act.disabled = false;
  };
  row.free = () => { row._busy = false; row._until = 0; };
  row.tell("live");
  return row;
}

function monitorWants(key) {
  return panelSetting(`openManager.monitor${key}`, true) !== false;
}

function meterText(used, total) {
  if (!total) return "-";
  return `${Math.round((used / total) * 100)}%`;
}

const TEMP_FLOOR = 30;
const TEMP_CEILING = 95;

function tempShare(degrees) {
  const span = TEMP_CEILING - TEMP_FLOOR;
  return Math.max(0, Math.min(100, ((degrees - TEMP_FLOOR) / span) * 100));
}

const TEMP_WARM = 70;
const TEMP_HOT = 84;

function tempColour(degrees) {
  if (degrees >= TEMP_HOT) return "#f85149";
  if (degrees >= TEMP_WARM) return "#d29922";
  return "#3fb950";
}

const MONITOR_STYLES = [
  "mixed", "mixed-compact", "horizontal", "horizontal-compact", "vertical", "vertical-compact",
];

function monitorStyle() {
  const asked = String(panelSetting("openManager.monitorStyle", "mixed") || "mixed");
  return MONITOR_STYLES.includes(asked) ? asked : "mixed";
}

function monitorShape(kind) {
  const style = monitorStyle();
  const compact = style.endsWith("-compact");
  const base = compact ? style.slice(0, -"-compact".length) : style;
  const axis = base === "mixed" ? (kind === "thermo" ? "v" : "h") : base[0];
  return { axis, compact, base };
}

function monitorCell(kind, key, label, title) {
  const { axis, compact, base } = monitorShape(kind);
  const box = el("span",
    `om-mon-cell om-mon-${key} om-mon-${axis}${compact ? " om-mon-compact" : ""}`);
  box._say = title;
  liveTip(box, () => tipWith(box._say,
    linkText() || (readingQuiet() ? quietText(readingAge()) : "")));
  const track = el("span", axis === "v" ? "om-mon-tube" : "om-mon-bar");
  const fill = el("span", "om-mon-fill");
  track.appendChild(fill);
  const name = el("span", "om-mon-label", label);
  const value = el("span", `om-mon-value${kind === "thermo" ? " om-mon-degrees" : ""}`, "-");

  if (compact && base === "vertical") {
    track.appendChild(value);
    box.appendChild(name);
    box.appendChild(track);
  } else if (compact) {
    const both = el("span", "om-mon-both");
    both.appendChild(name);
    both.appendChild(value);
    box.appendChild(track);
    box.appendChild(both);
  } else {
    box.appendChild(name);
    box.appendChild(track);
    box.appendChild(value);
  }
  return { box, fill, value, axis };
}

function monitorMeter(key, label, title) {
  return monitorCell("meter", key, label, title);
}

function monitorThermo(label, title) {
  const parts = monitorCell("thermo", "thermo", label, title);
  return { ...parts, mercury: parts.fill };
}

function buildMonitorStrip() {
  const strip = el("div", `om-mon om-mon-style-${monitorStyle()}`);
  liveTip(strip, () => ["Open the Memory panel",
    linkText()
      || (readingQuiet()
        ? `${quietText(readingAge())}. These figures are the last that arrived.`
        : "")]
    .filter(Boolean).join("\n"));
  strip.onclick = () => openMemoryPanel();
  strip._cells = {
    cpu: monitorMeter("cpu", "CPU", "Processor load since the last reading"),
    ram: monitorMeter("ram", "RAM", "System memory in use"),
  };
  strip.appendChild(strip._cells.cpu.box);
  strip.appendChild(strip._cells.ram.box);
  if (!monitorWants("Cpu")) strip._cells.cpu.box.style.display = "none";
  if (!monitorWants("Ram")) strip._cells.ram.box.style.display = "none";
  strip._dynamic = el("span", "om-mon-dynamic");
  strip.appendChild(strip._dynamic);
  strip._shape = "";
  strip._parts = [];
  return strip;
}

function syncMonitorDevices(reading) {
  const devices = monitorWants("Vram") ? (reading.devices || []) : [];
  const temps = monitorWants("Temp") ? (reading.cpu_temps || []) : [];
  const wantThermo = monitorWants("Temp");
  const shape = JSON.stringify([
    devices.map((one) => [one.index, one.name, "temp" in one]),
    temps.map((one) => one.label),
    wantThermo,
  ]);
  if (monitorStrip._shape === shape) return;
  monitorStrip._shape = shape;
  monitorStrip._parts = [];
  monitorStrip._dynamic.replaceChildren();

  const sensors = new Map();
  for (const one of temps) {
    const base = one.label.slice(0, 8);
    sensors.set(base, (sensors.get(base) || 0) + 1);
  }
  for (const [at, one] of temps.entries()) {
    const base = one.label.slice(0, 8);
    const thermo = monitorThermo(sensors.get(base) > 1 ? `${base}:${at}` : base,
                                 `${one.label} temperature`);
    monitorStrip._dynamic.appendChild(thermo.box);
    monitorStrip._parts.push({ kind: "cpu-temp", label: one.label, at, thermo });
  }
  for (const device of devices) {
    const many = devices.length > 1;
    const label = many ? `VRAM:${device.index}` : "VRAM";
    const meter = monitorMeter("vram", label, device.name);
    monitorStrip._dynamic.appendChild(meter.box);
    monitorStrip._parts.push({ kind: "vram", index: device.index, meter });
    if (wantThermo && "temp" in device) {
      const thermo = monitorThermo(many ? `GPU:${device.index}` : "GPU",
                                   `${device.name} temperature`);
      monitorStrip._dynamic.appendChild(thermo.box);
      monitorStrip._parts.push({ kind: "gpu-temp", index: device.index, thermo });
    }
  }
}


function paintMonitor(reading) {
  if (!monitorStrip?.isConnected) return;
  syncMonitorDevices(reading);
  const cells = monitorStrip._cells;
  const fillTo = (parts, share) => {
    const held = `${Math.max(0, Math.min(100, share))}%`;
    if (parts.axis === "v") { parts.fill.style.height = held; parts.fill.style.width = ""; }
    else { parts.fill.style.width = held; parts.fill.style.height = ""; }
  };
  const setMeter = (parts, share, text, said) => {
    parts.value.textContent = text;
    fillTo(parts, share);
    parts.fill.classList.toggle("om-mon-hot", share >= 90);
    parts.box._say = said;
  };
  const setThermo = (parts, degrees, name) => {
    parts.value.textContent = `${Math.round(degrees)}°`;
    fillTo(parts, tempShare(degrees));
    parts.fill.style.background = tempColour(degrees);
    if (!name) return;
    parts.box._say = { lead: name, facts: [
      ["Temperature", `${Math.round(degrees)} °C`],
      ["Warm above", `${TEMP_WARM} °C`],
      ["Hot above", `${TEMP_HOT} °C`],
    ] };
  };

  if (typeof reading.cpu === "number") {
    const cores = reading.cores || [];
    const hottest = (reading.cpu_temps || [])[0];
    setMeter(cells.cpu, reading.cpu, `${Math.round(reading.cpu)}%`, { lead: "Processor", facts: [
      ["Load", `${Math.round(reading.cpu)}%`],
      ["Busiest core", cores.length ? `${Math.round(Math.max(...cores))}%` : ""],
      ["Processors", cores.length ? `${cores.length} logical` : ""],
      ["Temperature", hottest ? `${Math.round(hottest.temp)} °C` : ""],
    ] });
  }
  if (reading.ram?.total) {
    const share = (reading.ram.used / reading.ram.total) * 100;
    setMeter(cells.ram, share, meterText(reading.ram.used, reading.ram.total), {
      lead: "System memory",
      facts: [
        ["In use", `${bytesText(reading.ram.used)} of ${bytesText(reading.ram.total)}`],
        ["Share", `${Math.round(share)}%`],
        ["Free", reading.ram.free ? bytesText(reading.ram.free) : ""],
      ],
      lines: [share >= 90 ? "Nearly full." : ""],
    });
  }

  const byIndex = new Map((reading.devices || []).map((one) => [one.index, one]));
  for (const part of monitorStrip._parts) {
    if (part.kind === "vram") {
      const device = byIndex.get(part.index);
      if (!device?.total) continue;
      const share = (device.used / device.total) * 100;
      setMeter(part.meter, share, meterText(device.used, device.total), {
        lead: device.name,
        facts: [
          ["In use", `${bytesText(device.used)} of ${bytesText(device.total)}`],
          ["Share", `${Math.round(share)}%`],
          ["Utilisation", typeof device.util === "number" ? `${device.util}%` : ""],
          ["Memory traffic", typeof device.mem_util === "number" ? `${device.mem_util}%` : ""],
          ["Power", device.watts == null ? ""
            : `${Math.round(device.watts)} W${device.watt_limit
              ? ` of ${Math.round(device.watt_limit)} W` : ""}`],
          ["Temperature",
           typeof device.temp === "number" ? `${Math.round(device.temp)} °C` : ""],
        ],
        lines: [share >= 90 ? "Nearly full." : ""],
      });
    } else if (part.kind === "gpu-temp") {
      const device = byIndex.get(part.index);
      if (device && typeof device.temp === "number") {
        setThermo(part.thermo, device.temp, device.name);
      }
    } else if (part.kind === "cpu-temp") {
      const sensors = reading.cpu_temps || [];
      const found = sensors[part.at]?.label === part.label
        ? sensors[part.at]
        : sensors.find((one) => one.label === part.label);
      if (found) setThermo(part.thermo, found.temp, found.label);
    }
  }
}

function markMonitorQuiet() {
  if (!monitorStrip?.isConnected) return;
  monitorStrip.classList.toggle("om-mon-quiet", linkDown() || readingQuiet());
}

let monitorBusy = false;

async function renewMonitorLease() {
  if (!monitorStrip?.isConnected) return;
  markMonitorQuiet();
  if (document.hidden || monitorBusy || !linkMayPost()) return;
  monitorBusy = true;
  try {
    const answer = await monPost("/monitor",
      { client: MONITOR_CLIENT, interval: monitorInterval() },
      Math.max(LINK_DEADLINE, monitorInterval() * 2000));
    linkLeased(answer);
    if (answer?.reading) takeReading(answer.reading);
  } catch {
  } finally {
    monitorBusy = false;
  }
  markMonitorQuiet();
  linkTick();
}

function startMonitor() {
  clearInterval(monitorTimer);
  monitorTimer = setInterval(renewMonitorLease, Math.max(1000, monitorInterval() * 1000));
  renewMonitorLease();
}

function wireMonitorLink() {
  api.addEventListener("open_manager.monitor", (event) => {
    link.pushAt = Date.now();
    link.strikes = 0;
    link.tries = 0;
    link.verifyUntil = 0;
    takeReading(event.detail || {});
  });
  api.addEventListener("reconnecting", () => {
    link.verifyUntil = Date.now() + LINK_VERIFY;
  });
  api.addEventListener("reconnected", () => {
    link.verifyUntil = 0;
    link.tries = 0;
    link.strikes = 0;
    link.nextTryAt = 0;
    renewMonitorLease();
  });
  window.addEventListener("online", () => {
    link.nextPostAt = 0;
    link.pollStep = 0;
    link.nextTryAt = 0;
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      link.hiddenAt = Date.now();
      if (monitorTimer) stopMonitor();
      return;
    }
    if (link.hiddenAt) link.hiddenFor += Date.now() - link.hiddenAt;
    link.hiddenAt = 0;
    link.strikes = 0;
    link.nextPostAt = 0;
    if (monitorStrip?.isConnected) startMonitor();
    else if (panelSetting("openManager.monitor", false) !== false) mountTopbar();
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted && monitorStrip?.isConnected) startMonitor();
  });
  window.addEventListener("pagehide", () => {
    if (monitorTimer) stopMonitor();
    if (floatingPanel("memory")) monRelease(MEMORY_CLIENT);
  });
}

function stopMonitor() {
  clearInterval(monitorTimer);
  monitorTimer = 0;
  monRelease(MONITOR_CLIENT);
}

const MEMORY_CLIENT = `${MONITOR_CLIENT}-panel`;

export { monitorInterval, LINK_DEADLINE, link, readingHooks, dropMonitorCalls, linkLeased, linkMayPost, monPost, monGet, monRelease, pushStale, linkState, takeReading, linkTick, reviveSocket, LINK_SAY, buildLinkRow, meterText, MONITOR_STYLES, buildMonitorStrip, startMonitor, wireMonitorLink, stopMonitor, MEMORY_CLIENT };
