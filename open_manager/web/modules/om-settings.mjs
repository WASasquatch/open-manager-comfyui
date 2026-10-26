import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import { API, ICON_SETTINGS } from "./base.mjs";
import { el, toast, notify, confirmAction } from "./ui.mjs";
import { windowSize, createFloatingPanel, floatingPanel } from "./windows.mjs";
import { dlPost } from "./net.mjs";
import { qolStatus, issueLink } from "./qol/loader.mjs";

const WINDOW_KEY = "omsettings";

const STYLE_ID = "om-settings-style";

const OVERVIEW = "\u0000overview";

const QOL_SECTION = "Quality of Life Patches";

const SECTION_ORDER = ["Interface", "Nodes", "Links", "Windows", "Desktop", "Theme", "Monitor", "Snapshots",
                       "Gallery", "Library", "Downloads", "Registry", "Scanning", "Licences",
                       QOL_SECTION];

const SWITCHES = [
  ["install", "Pack installs"],
  ["github", "GitHub repositories"],
  ["approved", "Approved versions only"],
  ["downloads", "Model downloads"],
  ["restart", "Restart"],
  ["desktop", "Desktop Mode"],
  ["files", "File browser"],
  ["writes", "File writes"],
];

const QOL_WORDS = {
  on: "On", off: "Off", down: "Stood down", skipped: "Not applied", failed: "Failed",
  waiting: "Starting",
};

const ENVIRONMENTS = {
  embedded: "portable Python", venv: "virtual environment", conda: "conda", system: "system Python",
};

const RESTART_WAIT = 180000;

const SEARCH_ART = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' "
  + "fill='none' stroke='black' stroke-width='2.4' stroke-linecap='round'%3E%3Ccircle cx='11' "
  + "cy='11' r='7'/%3E%3Cpath d='m20 20-4-4'/%3E%3C/svg%3E";

function settingsHost() {
  return app.ui?.settings || null;
}

function settingDefs() {
  return Object.values(settingsHost()?.settingsLookup || {}).filter((def) => def
    && String(def.id || "").startsWith("openManager.") && def.type !== "hidden");
}

function sectionOf(def) {
  return Array.isArray(def.category) && def.category[1] ? String(def.category[1]) : "Other";
}

function sectionRank(name) {
  const at = SECTION_ORDER.indexOf(name);
  return at < 0 ? SECTION_ORDER.length : at;
}

function bySection(a, b) {
  return sectionRank(a) - sectionRank(b) || a.localeCompare(b);
}

function labelOf(def) {
  return String(def.name || def.id);
}

function readSetting(id) {
  try {
    return app.extensionManager.setting.get(id);
  } catch {
    return undefined;
  }
}

function defaultOf(def) {
  try {
    return typeof def.defaultValue === "function" ? def.defaultValue() : def.defaultValue;
  } catch {
    return undefined;
  }
}

function same(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function choicesOf(def, held) {
  let options = def.options;
  if (typeof options === "function") {
    try { options = options(held); } catch { options = []; }
  }
  if (!Array.isArray(options)) return [];
  return options.map((one) => (one && typeof one === "object"
    ? { value: one.value, text: String(one.text ?? one.value) }
    : { value: one, text: String(one) }));
}

async function writeSetting(def, value) {
  try {
    await app.extensionManager.setting.set(def.id, value);
    return true;
  } catch (error) {
    notify("Not changed", `${labelOf(def)}: ${error?.message || error}`);
    return false;
  }
}

async function getJson(path) {
  try {
    const answer = await api.fetchApi(path, { cache: "no-store" });
    return answer.ok ? await answer.json() : null;
  } catch {
    return null;
  }
}

function titleCase(text) {
  const word = String(text || "");
  return word ? word[0].toUpperCase() + word.slice(1) : "";
}

function clockOf(seconds) {
  if (!seconds) return "";
  return new Date(seconds * 1000).toLocaleTimeString(undefined,
    { hour: "2-digit", minute: "2-digit" });
}

function mountStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = el("style");
  style.id = STYLE_ID;
  style.textContent = `
.oms { --oms-accent: var(--p-button-text-primary-color, #388bfd); --oms-ok: #3fb950;
  --oms-warn: #d29922; --oms-bad: #f85149;
  display: flex; flex: 1; min-height: 0; color: var(--om-text); }
.oms-nav { width: 210px; flex: none; overflow-y: auto; padding: 12px 8px; display: flex;
  flex-direction: column; gap: 2px; border-right: 1px solid var(--om-border);
  background: color-mix(in srgb, var(--om-surface) 60%, transparent); }
.oms-nav-label { padding: 14px 10px 5px; font-size: 10px; letter-spacing: .08em;
  text-transform: uppercase; color: var(--om-muted); }
.oms-place { display: flex; align-items: center; gap: 8px; padding: 7px 10px; border: 0;
  border-radius: 7px; background: transparent; color: var(--om-text-2); font: inherit;
  font-size: 13px; text-align: left; cursor: pointer; }
.oms-place:hover { background: var(--om-hover); color: var(--om-text); }
.oms-place-on, .oms-place-on:hover { color: var(--om-text); font-weight: 600;
  background: color-mix(in srgb, var(--oms-accent) 16%, transparent);
  box-shadow: inset 3px 0 0 var(--oms-accent); }
.oms-place-art { width: 16px; height: 16px; flex: none; background: currentColor;
  -webkit-mask: var(--oms-art) center / contain no-repeat;
  mask: var(--oms-art) center / contain no-repeat; }
.oms-count { margin-left: auto; font-size: 10px; color: var(--om-muted); font-weight: 400; }
.oms-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.oms-head { flex: none; display: flex; align-items: center; gap: 14px; padding: 14px 20px;
  border-bottom: 1px solid var(--om-border); }
.oms-title { flex: 1; min-width: 0; font-size: 18px; font-weight: 650; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap; }
.oms-search { position: relative; flex: 0 1 300px; min-width: 150px; }
.oms-search::before { content: ""; position: absolute; left: 10px; top: 50%; width: 14px;
  height: 14px; transform: translateY(-50%); background: currentColor; opacity: .5;
  pointer-events: none; -webkit-mask: url("${SEARCH_ART}") center / contain no-repeat;
  mask: url("${SEARCH_ART}") center / contain no-repeat; }
.oms-find { width: 100%; height: 32px; box-sizing: border-box; padding: 0 10px 0 31px;
  border: 1px solid var(--om-border); border-radius: 8px; outline: none;
  background: var(--om-input); color: var(--om-text); font: inherit; font-size: 13px; }
.oms-find:focus { border-color: var(--oms-accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--oms-accent) 22%, transparent); }
.oms-scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 16px 20px 26px; }
.oms-cards { display: grid; gap: 14px; align-items: start;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr)); }
.oms-card { min-width: 0; display: flex; flex-direction: column; gap: 10px; padding: 14px 16px;
  border: 1px solid var(--om-border); border-radius: 11px; background: var(--om-surface); }
.oms-card-wide { grid-column: 1 / -1; }
.oms-card-head { display: flex; align-items: center; gap: 10px; min-height: 22px; }
.oms-card-title { flex: 1; font-size: 11px; letter-spacing: .07em; text-transform: uppercase;
  color: var(--om-muted); font-weight: 600; }
.oms-hero { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-bottom: 8px; }
.oms-brand { width: 40px; height: 40px; flex: none; border-radius: 10px;
  background: color-mix(in srgb, var(--oms-accent) 18%, transparent); display: grid;
  place-items: center; }
.oms-brand::before { content: ""; width: 24px; height: 24px; background: var(--oms-accent);
  -webkit-mask: url("${ICON_SETTINGS}") center / contain no-repeat;
  mask: url("${ICON_SETTINGS}") center / contain no-repeat; }
.oms-version { font-size: 26px; font-weight: 700; letter-spacing: -.01em; line-height: 1.1; }
.oms-sub { font-size: 12px; color: var(--om-text-2); }
.oms-pill { flex: none; padding: 2px 10px; border-radius: 999px; font-size: 11px;
  font-weight: 600; border: 1px solid color-mix(in srgb, var(--om-muted) 45%, transparent);
  color: var(--om-muted); }
.oms-pill-ok { color: var(--oms-ok); border-color: color-mix(in srgb, var(--oms-ok) 45%, transparent);
  background: color-mix(in srgb, var(--oms-ok) 12%, transparent); }
.oms-pill-new { color: var(--oms-accent);
  border-color: color-mix(in srgb, var(--oms-accent) 50%, transparent);
  background: color-mix(in srgb, var(--oms-accent) 14%, transparent); }
.oms-pill-warn { color: var(--oms-warn);
  border-color: color-mix(in srgb, var(--oms-warn) 45%, transparent);
  background: color-mix(in srgb, var(--oms-warn) 12%, transparent); }
.oms-facts { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 6px 16px;
  margin: 0; font-size: 12px; }
.oms-facts dt { color: var(--om-muted); }
.oms-facts dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
.oms-mono { font-family: ui-monospace, Consolas, monospace; font-size: 11px; }
.oms-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.oms-actions .om-btn { padding: 6px 14px; }
.oms-reason { font-size: 12px; color: var(--om-text-2); }
.oms-step { display: flex; align-items: center; gap: 8px; }
.oms-step .oms-mono { flex: 1; min-width: 0; padding: 6px 8px; border-radius: 6px;
  background: var(--om-input); overflow-x: auto; white-space: nowrap; }
.oms-pre { max-height: 180px; overflow: auto; margin: 0; padding: 8px 10px; border-radius: 7px;
  background: var(--om-input); font-size: 11px; white-space: pre-wrap; overflow-wrap: anywhere; }
.oms-list { display: flex; flex-direction: column; }
.oms-line { display: flex; align-items: center; gap: 9px; padding: 5px 2px; font-size: 12px;
  border-radius: 6px; }
button.oms-line { border: 0; background: transparent; color: inherit; font: inherit;
  font-size: 12px; text-align: left; cursor: pointer; }
button.oms-line:hover { background: var(--om-hover); }
.oms-dot { width: 8px; height: 8px; flex: none; border-radius: 50%;
  background: color-mix(in srgb, var(--om-muted) 60%, transparent); }
.oms-dot-on { background: var(--oms-ok); }
.oms-dot-warn { background: var(--oms-warn); }
.oms-dot-bad { background: var(--oms-bad); }
.oms-line-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; }
.oms-line-state { flex: none; color: var(--om-muted); font-size: 11px; }
.oms-line-stack { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.oms-line-var { color: var(--om-muted); overflow-wrap: anywhere; }
.oms-group { padding: 10px 2px 3px; font-size: 10px; letter-spacing: .08em;
  text-transform: uppercase; color: var(--om-muted); }
.oms-group:first-child { padding-top: 0; }
.oms-summary { font-size: 13px; color: var(--om-text-2); }
.oms-section-head { padding: 18px 2px 7px; font-size: 11px; letter-spacing: .08em;
  text-transform: uppercase; color: var(--om-muted); font-weight: 600; }
.oms-section-head:first-child { padding-top: 0; }
.oms-rows { border: 1px solid var(--om-border); border-radius: 11px; overflow: hidden;
  background: var(--om-surface); }
.oms-row { display: flex; align-items: center; gap: 18px; padding: 12px 16px;
  border-bottom: 1px solid color-mix(in srgb, var(--om-border) 70%, transparent);
  transition: background .2s; }
.oms-row:last-child { border-bottom: 0; }
.oms-row:hover { background: color-mix(in srgb, var(--om-hover) 45%, transparent); }
.oms-row-flash { background: color-mix(in srgb, var(--oms-accent) 18%, transparent); }
.oms-text { flex: 1; min-width: 0; }
.oms-name { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; font-size: 13px;
  font-weight: 600; }
.oms-changed .oms-name::before { content: ""; width: 6px; height: 6px; flex: none;
  border-radius: 50%; background: var(--oms-accent); }
.oms-flag, .oms-chip { padding: 0 6px; border-radius: 4px; font-size: 10px; font-weight: 600;
  background: color-mix(in srgb, var(--om-text) 10%, transparent); color: var(--om-text-2); }
.oms-chip-warn { color: var(--oms-warn); background: color-mix(in srgb, var(--oms-warn) 14%, transparent); }
.oms-chip-bad { color: var(--oms-bad); background: color-mix(in srgb, var(--oms-bad) 14%, transparent); }
.oms-note { margin-top: 3px; font-size: 12px; line-height: 1.4; color: var(--om-text-2); }
.oms-why { margin-top: 3px; font-size: 11px; color: var(--oms-warn); }
.oms-name .om-qol-issue { font-weight: 400; }
.oms-side { flex: none; display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
.oms-reset { width: 26px; height: 26px; padding: 0; border: 0; border-radius: 6px;
  background: transparent; color: var(--om-muted); font-size: 15px; cursor: pointer; }
.oms-reset:hover { background: var(--om-hover); color: var(--om-text); }
.oms-switch { position: relative; display: inline-block; width: 38px; height: 22px; flex: none; }
.oms-switch input { position: absolute; inset: 0; z-index: 1; width: 100%; height: 100%;
  margin: 0; opacity: 0; cursor: pointer; }
.oms-knob { position: absolute; inset: 0; border-radius: 999px; transition: background .15s;
  background: color-mix(in srgb, var(--om-text) 20%, transparent); }
.oms-knob::after { content: ""; position: absolute; top: 3px; left: 3px; width: 16px;
  height: 16px; border-radius: 50%; background: #fff; transition: transform .15s;
  box-shadow: 0 1px 3px rgba(0, 0, 0, .4); }
.oms-switch input:checked + .oms-knob { background: var(--oms-accent); }
.oms-switch input:checked + .oms-knob::after { transform: translateX(16px); }
.oms-switch input:focus-visible + .oms-knob { outline: 2px solid var(--oms-accent);
  outline-offset: 2px; }
.oms-select, .oms-field { height: 30px; box-sizing: border-box; padding: 0 10px;
  border: 1px solid var(--om-border); border-radius: 7px; background: var(--om-input);
  color: var(--om-text); font: inherit; font-size: 12px; }
.oms-select { max-width: 230px; }
.oms-field { width: 92px; }
.oms-field-wide { width: 230px; }
.oms-range { width: 140px; margin: 0; accent-color: var(--oms-accent); }
.oms-colour { width: 44px; height: 28px; padding: 0; border: 0; background: none; }
.oms-empty { padding: 40px 10px; text-align: center; color: var(--om-muted); }
@media (prefers-reduced-motion: reduce) {
  .oms-knob, .oms-knob::after, .oms-row { transition: none; }
}`;
  document.head.appendChild(style);
}

function control(def) {
  const kind = typeof def.type === "function" ? "custom" : String(def.type || "text");
  if (kind === "custom") {
    return { node: el("span", "oms-line-state", "In ComfyUI's settings"), sync: () => {} };
  }
  if (kind === "boolean") {
    const host = el("label", "oms-switch");
    const box = el("input");
    box.type = "checkbox";
    box.setAttribute("role", "switch");
    box.setAttribute("aria-label", labelOf(def));
    host.append(box, el("span", "oms-knob"));
    const sync = () => { box.checked = readSetting(def.id) === true; };
    box.onchange = async () => { if (!await writeSetting(def, box.checked)) sync(); };
    return { node: host, sync };
  }
  if (kind === "combo" || kind === "radio") {
    const pick = el("select", "oms-select");
    pick.setAttribute("aria-label", labelOf(def));
    let choices = [];
    const sync = () => {
      const held = readSetting(def.id);
      choices = choicesOf(def, held);
      pick.replaceChildren();
      if (held !== undefined && !choices.some((one) => same(one.value, held))) {
        choices = [{ value: held, text: String(held) }, ...choices];
      }
      choices.forEach((one, at) => {
        const option = el("option", null, one.text);
        option.value = String(at);
        pick.appendChild(option);
      });
      const at = choices.findIndex((one) => same(one.value, held));
      pick.value = String(Math.max(0, at));
    };
    pick.onchange = async () => {
      const found = choices[Number(pick.value)];
      if (found && !await writeSetting(def, found.value)) sync();
    };
    return { node: pick, sync };
  }
  if (kind === "slider" || kind === "number") {
    const attrs = def.attrs || {};
    const line = el("div", "oms-side");
    const field = el("input", "oms-field");
    field.type = "number";
    field.setAttribute("aria-label", labelOf(def));
    for (const name of ["min", "max", "step"]) {
      if (attrs[name] !== undefined) field[name] = String(attrs[name]);
    }
    let slider = null;
    if (kind === "slider" && attrs.min !== undefined && attrs.max !== undefined) {
      slider = el("input", "oms-range");
      slider.type = "range";
      slider.min = String(attrs.min);
      slider.max = String(attrs.max);
      slider.step = String(attrs.step ?? 1);
      slider.setAttribute("aria-label", labelOf(def));
      slider.addEventListener("input", () => { field.value = slider.value; });
      slider.addEventListener("change", async () => {
        if (!await writeSetting(def, Number(slider.value))) sync();
      });
      line.appendChild(slider);
    }
    line.appendChild(field);
    const sync = () => {
      const held = readSetting(def.id);
      field.value = held === undefined || held === null ? "" : String(held);
      if (slider) slider.value = String(held ?? attrs.min);
    };
    field.addEventListener("change", async () => {
      let asked = Number(field.value);
      if (field.value === "" || Number.isNaN(asked)) { sync(); return; }
      if (attrs.min !== undefined) asked = Math.max(Number(attrs.min), asked);
      if (attrs.max !== undefined) asked = Math.min(Number(attrs.max), asked);
      if (!await writeSetting(def, asked)) { sync(); return; }
      sync();
    });
    return { node: line, sync };
  }
  if (kind === "color") {
    const field = el("input", "oms-colour");
    field.type = "color";
    field.setAttribute("aria-label", labelOf(def));
    const sync = () => {
      const held = String(readSetting(def.id) || "");
      field.value = /^#?[0-9a-f]{6}$/i.test(held) ? (held.startsWith("#") ? held : `#${held}`)
        : "#000000";
    };
    field.addEventListener("change", async () => {
      if (!await writeSetting(def, field.value)) sync();
    });
    return { node: field, sync };
  }
  const field = el("input", "oms-field oms-field-wide");
  field.type = "text";
  field.spellcheck = false;
  field.setAttribute("aria-label", labelOf(def));
  const sync = () => {
    const held = readSetting(def.id);
    field.value = held === undefined || held === null ? "" : String(held);
  };
  field.addEventListener("change", async () => {
    if (!await writeSetting(def, field.value)) sync();
  });
  return { node: field, sync };
}

function qolChip(patch) {
  if (!patch || patch.state === "on" || patch.state === "off") return null;
  const tone = patch.state === "failed" ? " oms-chip-bad"
    : patch.state === "down" || patch.state === "skipped" ? " oms-chip-warn" : "";
  return el("span", `oms-chip${tone}`, QOL_WORDS[patch.state] || patch.state);
}

function dotFor(state) {
  if (state === "on") return "oms-dot oms-dot-on";
  if (state === "failed") return "oms-dot oms-dot-bad";
  if (state === "down" || state === "skipped") return "oms-dot oms-dot-warn";
  return "oms-dot";
}

function stacked(label, detail) {
  const host = el("span", "oms-line-stack");
  host.appendChild(el("span", null, label));
  if (detail) host.appendChild(el("span", "oms-line-var oms-mono", detail));
  return host;
}

function card(title, wide = false) {
  const box = el("section", `oms-card${wide ? " oms-card-wide" : ""}`);
  const head = el("div", "oms-card-head");
  head.appendChild(el("div", "oms-card-title", title));
  box.appendChild(head);
  const body = el("div", "oms-list");
  body.appendChild(el("div", "oms-line-state", "Reading"));
  box.appendChild(body);
  return { box, head, body };
}

function facts(pairs) {
  const list = el("dl", "oms-facts");
  for (const [label, value, mono] of pairs) {
    if (value === undefined || value === null || value === "") continue;
    list.appendChild(el("dt", null, label));
    const held = el("dd", mono ? "oms-mono" : null, String(value));
    if (mono) held.title = String(value);
    list.appendChild(held);
  }
  return list;
}

function copyLine(command) {
  const line = el("div", "oms-step");
  line.appendChild(el("div", "oms-mono", command));
  const copy = el("button", "om-btn", "Copy");
  copy.type = "button";
  copy.onclick = () => {
    navigator.clipboard?.writeText(command)
      .then(() => toast("Copied.", { kind: "ok" }))
      .catch(() => notify("Not copied", "The clipboard is not available here."));
  };
  line.appendChild(copy);
  return line;
}

async function queuedJobs() {
  const queue = await getJson("/queue");
  return (queue?.queue_running?.length || 0) + (queue?.queue_pending?.length || 0);
}

function restartNow(button) {
  return (async () => {
    const was = button.textContent;
    button.disabled = true;
    button.textContent = "Restarting...";
    let answer = null;
    try {
      answer = await dlPost("/reboot", {});
    } catch {
      answer = null;
    }
    if (!answer?.ok) {
      button.disabled = false;
      button.textContent = was;
      notify("Not restarted", answer?.reason || "The server did not answer.");
      return;
    }
    const began = Date.now();
    const look = async () => {
      if (await getJson("/system_stats")) { location.reload(); return; }
      if (Date.now() - began < RESTART_WAIT) { setTimeout(look, 1500); return; }
      button.disabled = false;
      button.textContent = was;
      notify("Restart timed out", "The server did not come back within three minutes.");
    };
    setTimeout(look, 3000);
  })();
}

function openManagerSettings(section = "") {
  const held = floatingPanel(WINDOW_KEY);
  if (held) {
    held.present();
    if (section) held._omGo?.(section);
    return held;
  }
  mountStyle();
  const listeners = [];
  const panel = createFloatingPanel({
    key: WINDOW_KEY, title: "Open Manager Settings", ...windowSize("manager"), modal: false,
    onClose: () => {
      for (const [type, fn] of listeners) settingsHost()?.removeEventListener?.(type, fn);
    },
  });
  panel.setMaskIcon(ICON_SETTINGS);

  const view = { at: OVERVIEW, find: "", rows: new Map(), token: 0 };
  const shell = el("div", "oms");
  const nav = el("nav", "oms-nav");
  nav.setAttribute("aria-label", "Sections");
  const main = el("div", "oms-main");
  const head = el("div", "oms-head");
  const title = el("div", "oms-title");
  const search = el("div", "oms-search");
  const find = el("input", "oms-find");
  find.type = "text";
  find.placeholder = "Search settings";
  find.spellcheck = false;
  find.setAttribute("aria-label", "Search settings");
  search.appendChild(find);
  head.append(title, search);
  const scroll = el("div", "oms-scroll");
  main.append(head, scroll);
  shell.append(nav, main);
  panel.body.appendChild(shell);

  const settingRow = (def, patch = null) => {
    const row = el("div", "oms-row");
    row.dataset.id = def.id;
    const text = el("div", "oms-text");
    const name = el("div", "oms-name", labelOf(def));
    if (def.experimental) name.appendChild(el("span", "oms-flag", "experimental"));
    if (def.deprecated) name.appendChild(el("span", "oms-flag", "deprecated"));
    const chip = qolChip(patch);
    if (chip) name.appendChild(chip);
    for (const issue of patch?.issues || []) name.appendChild(issueLink(issue));
    text.appendChild(name);
    if (def.tooltip) text.appendChild(el("div", "oms-note", String(def.tooltip)));
    if (patch?.reason) text.appendChild(el("div", "oms-why", patch.reason));
    const side = el("div", "oms-side");
    const { node, sync } = control(def);
    const reset = el("button", "oms-reset", "↺");
    reset.type = "button";
    reset.title = "Reset";
    reset.setAttribute("aria-label", `Reset ${labelOf(def)}`);
    side.append(reset, node);
    row.append(text, side);
    const refresh = () => {
      sync();
      const changed = !same(readSetting(def.id), defaultOf(def));
      row.classList.toggle("oms-changed", changed);
      reset.hidden = !changed;
    };
    reset.onclick = async () => {
      if (await writeSetting(def, defaultOf(def))) refresh();
    };
    refresh();
    view.rows.set(def.id, refresh);
    return row;
  };

  for (const def of settingDefs()) {
    const type = `${def.id}.change`;
    const fn = () => view.rows.get(def.id)?.();
    settingsHost()?.addEventListener?.(type, fn);
    listeners.push([type, fn]);
  }

  const drawNav = () => {
    const counts = new Map();
    for (const def of settingDefs()) {
      const name = sectionOf(def);
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    const places = [];
    const place = (key, label, count = null, art = "") => {
      const button = el("button", "oms-place");
      button.type = "button";
      button.dataset.key = key;
      if (art) {
        const mark = el("span", "oms-place-art");
        mark.style.setProperty("--oms-art", `url("${art}")`);
        button.appendChild(mark);
      }
      button.appendChild(el("span", null, label));
      if (count !== null) button.appendChild(el("span", "oms-count", String(count)));
      button.classList.toggle("oms-place-on", !view.find && view.at === key);
      button.onclick = () => go(key);
      places.push(button);
    };
    place(OVERVIEW, "Overview", null, ICON_SETTINGS);
    places.push(el("div", "oms-nav-label", "Settings"));
    for (const name of [...counts.keys()].sort(bySection)) place(name, name, counts.get(name));
    nav.replaceChildren(...places);
  };

  const sectionBlock = (defs, statuses) => {
    const block = el("div", "oms-rows");
    for (const def of defs) block.appendChild(settingRow(def, statuses.get(def.id) || null));
    return block;
  };

  const drawSection = async (name, token) => {
    title.textContent = name;
    const defs = settingDefs().filter((def) => sectionOf(def) === name);
    const statuses = new Map();
    if (name === QOL_SECTION) {
      for (const patch of await qolStatus()) statuses.set(patch.id, patch);
      if (token !== view.token) return;
    }
    view.rows.clear();
    const parts = [];
    if (name === QOL_SECTION) {
      const groups = new Map();
      for (const def of defs) {
        const folder = statuses.get(def.id)?.folder || "";
        if (!groups.has(folder)) groups.set(folder, []);
        groups.get(folder).push(def);
      }
      for (const folder of [...groups.keys()].sort()) {
        parts.push(el("div", "oms-section-head", titleCase(folder) || "Other"));
        parts.push(sectionBlock(groups.get(folder), statuses));
      }
    } else {
      parts.push(sectionBlock(defs, statuses));
    }
    scroll.replaceChildren(...(defs.length ? parts : [el("div", "oms-empty", "Nothing here.")]));
  };

  const drawResults = async (term, token) => {
    title.textContent = "Search";
    const words = term.toLowerCase().split(/\s+/).filter(Boolean);
    const hits = settingDefs().filter((def) => {
      const hay = `${labelOf(def)} ${def.tooltip || ""} ${def.id} ${sectionOf(def)}`.toLowerCase();
      return words.every((word) => hay.includes(word));
    });
    const statuses = new Map();
    if (hits.some((def) => sectionOf(def) === QOL_SECTION)) {
      for (const patch of await qolStatus()) statuses.set(patch.id, patch);
      if (token !== view.token) return;
    }
    view.rows.clear();
    const groups = new Map();
    for (const def of hits) {
      const name = sectionOf(def);
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(def);
    }
    const parts = [];
    for (const name of [...groups.keys()].sort(bySection)) {
      parts.push(el("div", "oms-section-head", name));
      parts.push(sectionBlock(groups.get(name), statuses));
    }
    scroll.replaceChildren(...(parts.length ? parts
      : [el("div", "oms-empty", "Nothing matches that.")]));
  };

  const versionCard = (gates) => {
    const shown = card("Open Manager", true);
    const fill = async (check = false) => {
      const [info, remote] = await Promise.all([
        getJson(`${API}/self`),
        getJson(`${API}/self/remote${check ? "?check=1" : ""}`),
      ]);
      if (!shown.box.isConnected) return;
      const parts = [];
      const hero = el("div", "oms-hero");
      hero.appendChild(el("div", "oms-brand"));
      const named = el("div");
      named.appendChild(el("div", "oms-version", info?.version || remote?.version || "Unknown"));
      const how = info ? [
        info.mode === "custom_node" ? "Custom node" : "Package",
        info.from_git ? "git" : "",
        ENVIRONMENTS[info.environment] || info.environment || "",
      ].filter(Boolean).join(", ") : "";
      if (how) named.appendChild(el("div", "oms-sub", how));
      hero.appendChild(named);
      let pill = null;
      if (remote?.behind) pill = el("span", "oms-pill oms-pill-new", `${remote.remote} available`);
      else if (remote?.remote) pill = el("span", "oms-pill oms-pill-ok", "Up to date");
      else if (remote?.error) pill = el("span", "oms-pill oms-pill-warn", "Not checked");
      if (pill) hero.appendChild(pill);
      parts.push(hero);
      parts.push(facts([
        ["Latest", remote?.remote ? `${remote.remote} on GitHub` : remote?.error || ""],
        ["Checked", clockOf(remote?.checked)],
        ["Location", info?.path || "", true],
      ]));
      const actions = el("div", "oms-actions");
      const recheck = el("button", "om-btn", "Check now");
      recheck.type = "button";
      recheck.onclick = async () => {
        recheck.disabled = true;
        recheck.textContent = "Checking...";
        await fill(true);
      };
      actions.appendChild(recheck);
      const updater = info?.updater || {};
      const output = el("pre", "oms-pre");
      output.hidden = true;
      if (remote?.behind && updater.able) {
        const go = el("button", "om-btn om-go",
          gates?.restart !== false ? "Update and restart" : "Update");
        go.type = "button";
        go.onclick = () => updateNow(go, info, remote, gates, output);
        actions.prepend(go);
      }
      if (gates?.restart !== false) {
        const again = el("button", "om-btn", "Restart ComfyUI");
        again.type = "button";
        again.onclick = async () => {
          const busy = await queuedJobs();
          const sure = await confirmAction("Restart ComfyUI",
            busy ? `${busy} queued job${busy === 1 ? "" : "s"} stop.` : "", "Restart", false);
          if (sure) restartNow(again);
        };
        actions.appendChild(again);
      }
      parts.push(actions);
      if (remote?.behind && !updater.able) {
        if (updater.reason) parts.push(el("div", "oms-reason", `Updates here: ${updater.reason}.`));
        for (const step of info?.steps || []) parts.push(copyLine(step.command));
      }
      parts.push(output);
      shown.body.replaceChildren(...parts);
    };
    fill();
    return shown.box;
  };

  const updateNow = async (button, info, remote, gates, output) => {
    const restartable = gates?.restart !== false;
    const busy = restartable ? await queuedJobs() : 0;
    const lines = [`${info.version} to ${remote.remote}, from GitHub.`];
    if (restartable) lines.push("ComfyUI restarts after.");
    if (busy) lines.push(`${busy} queued job${busy === 1 ? "" : "s"} stop.`);
    const label = restartable ? "Update and restart" : "Update";
    const sure = await confirmAction("Update Open Manager", lines.join(" "), label, false);
    if (!sure) return;
    button.disabled = true;
    button.textContent = "Updating...";
    let answer = null;
    try {
      answer = await dlPost("/self/update", {});
    } catch {
      answer = null;
    }
    if (!answer?.ok) {
      button.disabled = false;
      button.textContent = label;
      notify("Not updated", answer?.reason || "The server did not answer.");
      if (answer?.output) {
        output.textContent = answer.output;
        output.hidden = false;
      }
      return;
    }
    if (!restartable) {
      button.textContent = "Updated";
      toast(`Updated to ${answer.version}. Restart ComfyUI to load it.`, { kind: "ok", sticky: true });
      return;
    }
    restartNow(button);
  };

  const systemCard = () => {
    const shown = card("System");
    (async () => {
      const stats = await getJson("/system_stats");
      if (!shown.box.isConnected) return;
      const system = stats?.system || {};
      const device = (stats?.devices || [])[0];
      shown.body.replaceChildren(facts([
        ["ComfyUI", system.comfyui_version || ""],
        ["Frontend", window.__COMFYUI_FRONTEND_VERSION__ || ""],
        ["Python", String(system.python_version || "").split(" ")[0]],
        ["PyTorch", system.pytorch_version || ""],
        ["Device", device ? String(device.name || device.type || "").replace(/^cuda:\d+\s*/, "") : ""],
        ["System", system.os || ""],
      ]));
    })();
    return shown.box;
  };

  const switchesCard = (gates) => {
    const shown = card("Environment switches");
    if (!gates) {
      shown.body.replaceChildren(el("div", "oms-line-state", "The server did not answer."));
      return shown.box;
    }
    const lines = SWITCHES.map(([key, label]) => {
      const on = gates[key] === true;
      const line = el("div", "oms-line");
      line.appendChild(el("span", on ? "oms-dot oms-dot-on" : "oms-dot"));
      line.appendChild(stacked(label, gates.names?.[key] || ""));
      line.appendChild(el("span", "oms-line-state", on ? "On" : "Off"));
      return line;
    });
    shown.body.replaceChildren(...lines);
    return shown.box;
  };

  const qolCard = () => {
    const shown = card("Quality of Life Patches");
    (async () => {
      const patches = await qolStatus();
      if (!shown.box.isConnected) return;
      const counts = {};
      for (const patch of patches) counts[patch.state] = (counts[patch.state] || 0) + 1;
      const said = Object.keys(QOL_WORDS).filter((state) => counts[state])
        .map((state) => `${counts[state]} ${QOL_WORDS[state].toLowerCase()}`).join(", ");
      const parts = [el("div", "oms-summary", said || "None loaded.")];
      const groups = new Map();
      for (const patch of patches) {
        if (!groups.has(patch.folder)) groups.set(patch.folder, []);
        groups.get(patch.folder).push(patch);
      }
      for (const folder of [...groups.keys()].sort()) {
        parts.push(el("div", "oms-group", titleCase(folder) || "Other"));
        for (const patch of groups.get(folder)) {
          const line = el("button", "oms-line");
          line.type = "button";
          line.appendChild(el("span", dotFor(patch.state)));
          line.appendChild(el("span", "oms-line-name", patch.name));
          line.appendChild(el("span", "oms-line-state", QOL_WORDS[patch.state] || patch.state));
          if (patch.reason) line.title = patch.reason;
          line.onclick = () => go(QOL_SECTION, patch.id);
          parts.push(line);
        }
      }
      shown.body.replaceChildren(...parts);
    })();
    return shown.box;
  };

  const keysCard = () => {
    const shown = card("Access keys");
    (async () => {
      const found = await getJson(`${API}/keys`);
      if (!shown.box.isConnected) return;
      const lines = Object.values(found?.keys || {}).map((key) => {
        const line = el("div", "oms-line");
        line.appendChild(el("span", key.set ? "oms-dot oms-dot-on" : "oms-dot"));
        line.appendChild(stacked(key.label, key.env || ""));
        line.appendChild(el("span", "oms-line-state", key.set ? "Set" : "Not set"));
        return line;
      });
      shown.body.replaceChildren(...(lines.length ? lines
        : [el("div", "oms-line-state", "The server did not answer.")]));
    })();
    return shown.box;
  };

  const officialCard = (info) => {
    const held = info?.official;
    if (info?.mode !== "package" || !held?.installed) return null;
    const shown = card("ComfyUI Manager");
    const parts = [facts([
      ["Package", held.version ? `comfyui-manager ${held.version}` : ""],
      ...(held.folders || []).map((folder) => ["Folder", folder, true]),
    ])];
    const output = el("pre", "oms-pre");
    output.hidden = true;
    if (held.removable) {
      const go = el("button", "om-btn om-danger", "Uninstall ComfyUI Manager");
      go.type = "button";
      go.onclick = async () => {
        const what = [held.version ? `comfyui-manager ${held.version}` : "",
          held.folders?.length ? `${held.folders.length} folder${held.folders.length === 1 ? "" : "s"} `
            + "in custom_nodes" : ""].filter(Boolean).join(" and ");
        const sure = await confirmAction("Uninstall ComfyUI Manager",
          `Removes ${what}. Open Manager stays.`, "Uninstall", true);
        if (!sure) return;
        go.disabled = true;
        go.textContent = "Uninstalling...";
        let answer = null;
        try {
          answer = await dlPost("/self/official/uninstall", {});
        } catch {
          answer = null;
        }
        if (!answer?.ok) {
          go.disabled = false;
          go.textContent = "Uninstall ComfyUI Manager";
          notify("Not uninstalled", answer?.reason || "The server did not answer.");
          if (answer?.output) {
            output.textContent = answer.output;
            output.hidden = false;
          }
          return;
        }
        toast("ComfyUI Manager uninstalled.", { kind: "ok" });
        shown.box.remove();
      };
      const row = el("div", "oms-actions");
      row.appendChild(go);
      parts.push(row);
    } else {
      if (held.reason) parts.push(el("div", "oms-reason", `Uninstalling here: ${held.reason}.`));
      if (held.version && info.python) {
        parts.push(copyLine(`"${info.python}" -m pip uninstall comfyui-manager`));
      }
    }
    parts.push(output);
    shown.body.replaceChildren(...parts);
    return shown.box;
  };

  const drawOverview = async (token) => {
    title.textContent = "Overview";
    view.rows.clear();
    const [gates, info] = await Promise.all([getJson(`${API}/gates`), getJson(`${API}/self`)]);
    if (token !== view.token) return;
    const grid = el("div", "oms-cards");
    const official = officialCard(info);
    grid.append(versionCard(gates), ...(official ? [official] : []), systemCard(),
                switchesCard(gates), qolCard(), keysCard());
    scroll.replaceChildren(grid);
  };

  const draw = async (flash = "") => {
    view.token += 1;
    const token = view.token;
    drawNav();
    scroll.scrollTop = 0;
    if (view.find) await drawResults(view.find, token);
    else if (view.at === OVERVIEW) await drawOverview(token);
    else await drawSection(view.at, token);
    if (!flash || token !== view.token) return;
    const row = [...scroll.querySelectorAll(".oms-row")].find((one) => one.dataset.id === flash);
    if (!row) return;
    row.scrollIntoView({ block: "center" });
    row.classList.add("oms-row-flash");
    setTimeout(() => row.classList.remove("oms-row-flash"), 1200);
  };

  const go = (key, flash = "") => {
    view.at = key;
    view.find = "";
    find.value = "";
    void draw(flash);
  };

  let typing = 0;
  find.addEventListener("input", () => {
    clearTimeout(typing);
    typing = setTimeout(() => {
      view.find = find.value.trim();
      void draw();
    }, 120);
  });
  find.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !find.value) return;
    event.preventDefault();
    event.stopPropagation();
    find.value = "";
    view.find = "";
    void draw();
  });

  panel._omGo = (key) => go(key);
  go(section && section !== "overview" ? section : OVERVIEW);
  return panel;
}

export { openManagerSettings };
