import { app } from "../../../scripts/app.js";
import { el, toast, liveTip, askText } from "./ui.mjs";
import { panelSetting } from "./settings.mjs";
import { loadDeskDocs, makeFlowLink } from "./desk-docs.mjs";
import { paintDeskIcons } from "./desk-icons.mjs";
import { activeWorkflow, openWorkflows, savedWorkflows } from "./workflows.mjs";

const TAB_MARK_KEY = "om-tab-marks";

const TAB_TINTS = [
  ["Red", "#f85149"], ["Amber", "#d29922"], ["Green", "#3fb950"], ["Teal", "#39c5cf"],
  ["Blue", "#58a6ff"], ["Purple", "#a371f7"], ["Pink", "#db61a2"], ["Grey", "#8b949e"],
];

const TAB_HEX = /^#[0-9a-fA-F]{6}$/;

const TAB_MENU_PICK = '[role="menuitem"], li.p-contextmenu-item, [data-reka-collection-item]';

const TAB_MENU_WAIT = 1500;

const TAB_TITLE_CAP = 80;

let tabMarks = null;
let tabSeenKey = "";
let tabWatching = false;

function tabMarksAll() {
  if (tabMarks) return tabMarks;
  try {
    const held = JSON.parse(localStorage.getItem(TAB_MARK_KEY) || "{}");
    tabMarks = held && typeof held === "object" ? held : {};
  } catch {
    tabMarks = {};
  }
  return tabMarks;
}

const TAB_SCRATCH_NAME = /(^|\/)Unsaved Workflow( \(\d+\))?\.json$/i;

function tabMarksTidy() {
  const all = tabMarksAll();
  const saved = new Set(savedWorkflows().map((one) => tabKeyOf(one)));
  let gone = 0;
  for (const key of Object.keys(all)) {
    if (!TAB_SCRATCH_NAME.test(key) || saved.has(key)) continue;
    delete all[key];
    gone += 1;
  }
  if (gone) tabMarksSave();
  return gone;
}

function tabMarksSave() {
  try { localStorage.setItem(TAB_MARK_KEY, JSON.stringify(tabMarksAll())); } catch {}
}

function tabKeyOf(workflow) {
  return String(workflow?.path || workflow?.key || "");
}

const tabTemp = new WeakMap();

function tabScratch(workflow) {
  return !!workflow && workflow.isTemporary === true;
}

function tabMarkOf(workflow) {
  if (!workflow) return null;
  if (tabScratch(workflow)) return tabTemp.get(workflow) || null;
  return tabMarksAll()[tabKeyOf(workflow)] || null;
}

function tabTint(value) {
  const text = String(value || "").trim();
  return TAB_HEX.test(text) ? text : "";
}

function tabStrip() {
  return document.querySelector(".workflow-tabs");
}

function tabMarksOn() {
  return panelSetting("openManager.tabMarks", true) !== false;
}

function tabExtrasWrite(workflow, mark) {
  const active = activeWorkflow();
  if (!active || active.key !== workflow?.key) return;
  const extra = app.graph?.extra;
  if (!extra) return;
  if (mark.title) extra.om_custom_title = mark.title;
  else delete extra.om_custom_title;
  if (mark.colour) extra.om_tab_color = mark.colour;
  else delete extra.om_tab_color;
}

function tabExtrasRead() {
  const active = activeWorkflow();
  const extra = app.graph?.extra;
  if (!active || !extra) return;
  const title = String(extra.om_custom_title || "").trim().slice(0, TAB_TITLE_CAP);
  const colour = tabTint(extra.om_tab_color);
  if (!title && !colour) return;
  if (tabScratch(active)) {
    const held = { ...(tabTemp.get(active) || {}) };
    if (title) held.title = title;
    if (colour) held.colour = colour;
    tabTemp.set(active, held);
    return;
  }
  const all = tabMarksAll();
  const key = tabKeyOf(active);
  const now = { ...(all[key] || {}) };
  if (title) now.title = title;
  if (colour) now.colour = colour;
  all[key] = now;
  tabMarksSave();
}

function setTabMark(workflow, patch) {
  if (!workflow) return;
  const tidy = (held) => {
    const now = { ...held, ...patch };
    if (!now.colour) delete now.colour;
    if (!now.title) delete now.title;
    return now;
  };
  if (tabScratch(workflow)) {
    const now = tidy(tabTemp.get(workflow) || {});
    if (Object.keys(now).length) tabTemp.set(workflow, now);
    else tabTemp.delete(workflow);
    tabExtrasWrite(workflow, now);
    paintTabs();
    return;
  }
  const key = tabKeyOf(workflow);
  if (!key) return;
  const all = tabMarksAll();
  const now = tidy(all[key] || {});
  if (Object.keys(now).length) all[key] = now;
  else delete all[key];
  tabMarksSave();
  tabExtrasWrite(workflow, now);
  paintTabs();
}

function paintTab(tab, mark) {
  const tint = mark?.colour || "";
  if (tab.style.getPropertyValue("--om-tab-tint") !== tint) {
    if (tint) tab.style.setProperty("--om-tab-tint", tint);
    else tab.style.removeProperty("--om-tab-tint");
  }
  if ((tab.getAttribute("data-om-tint") || "") !== tint) {
    if (tint) tab.setAttribute("data-om-tint", tint);
    else tab.removeAttribute("data-om-tint");
  }

  const label = tab.querySelector(".workflow-label");
  if (!label) return;
  const wanted = mark?.title || "";
  const own = tab.querySelector(".om-tab-title");
  if (!wanted) {
    if (own) own.remove();
    tab.removeAttribute("data-om-titled");
    return;
  }
  if (tab.getAttribute("data-om-titled") !== "1") tab.setAttribute("data-om-titled", "1");
  if (own) {
    if (own.textContent !== wanted) own.textContent = wanted;
    return;
  }
  const shown = el("span", "om-tab-title", wanted);
  liveTip(shown, () => `${wanted}
${label.textContent.trim()}`);
  label.parentElement.insertBefore(shown, label);
}

function paintTabs() {
  const strip = tabStrip();
  if (!strip) return;
  const off = !tabMarksOn();
  const open = openWorkflows();
  [...strip.children].forEach((tab, index) => {
    paintTab(tab, off ? null : tabMarkOf(open[index]));
  });
}

function tabUnderlay() {
  const root = document.documentElement;
  const now = getComputedStyle(root).getPropertyValue("--comfy-menu-bg").trim();
  if (!now || now === root.style.getPropertyValue("--om-tab-under")) return;
  root.style.setProperty("--om-tab-under", now);
}

function tabTick() {
  tabUnderlay();
  const active = activeWorkflow();
  const key = active ? tabKeyOf(active) : "";
  if (key && key !== tabSeenKey) {
    tabSeenKey = key;
    tabExtrasRead();
  }
  paintTabs();
}

function tabAt(event) {
  const strip = tabStrip();
  if (!strip || !(event.target instanceof Element)) return null;
  const tabs = [...strip.children];
  const tab = tabs.find((one) => one.contains(event.target));
  if (!tab) return null;
  return openWorkflows()[tabs.indexOf(tab)] || null;
}

function awaitTabMenu(workflow) {
  let timer = 0;
  const watcher = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        const item = node.matches?.(TAB_MENU_PICK) ? node : node.querySelector?.(TAB_MENU_PICK);
        if (!item) continue;
        watcher.disconnect();
        clearTimeout(timer);
        injectTabMenu(item, workflow);
        return;
      }
    }
  });
  watcher.observe(document.body, { childList: true, subtree: true });
  timer = setTimeout(() => watcher.disconnect(), TAB_MENU_WAIT);
}

function closeHostMenu() {
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
}

function pickTabColour(workflow) {
  const field = el("input", "om-tab-picker");
  field.type = "color";
  field.value = tabMarkOf(workflow)?.colour || "#58a6ff";
  document.body.appendChild(field);
  field.addEventListener("change", () => {
    setTabMark(workflow, { colour: tabTint(field.value) });
    field.remove();
  });
  field.click();
}

function injectTabMenu(item, workflow) {
  const host = item.parentElement;
  if (!host || host.querySelector(".om-tab-row")) return;
  const mark = (tabMarksOn() ? tabMarkOf(workflow) : null) || {};
  const shell = () => {
    const holder = el(item.tagName.toLowerCase() === "li" ? "li" : "div", null);
    holder.className = item.className;
    holder.classList.add("om-tab-row");
    return holder;
  };
  const divider = () => {
    const theirs = host.querySelector('[role="separator"], hr');
    if (theirs) {
      const copy = theirs.cloneNode(true);
      copy.classList.add("om-tab-split");
      return copy;
    }
    const made = el(item.tagName.toLowerCase() === "li" ? "li" : "div", "om-tab-split");
    made.setAttribute("role", "separator");
    return made;
  };

  const colours = shell();
  colours.appendChild(el("span", "om-tab-row-label", "Colour"));
  const swatches = el("span", "om-tab-swatches");
  for (const [name, value] of TAB_TINTS) {
    const dot = el("button", "om-tab-swatch");
    dot.style.background = value;
    dot.title = name;
    if (mark.colour === value) dot.classList.add("om-tab-swatch-on");
    dot.onclick = (event) => {
      event.stopPropagation();
      setTabMark(workflow, { colour: value });
      closeHostMenu();
    };
    swatches.appendChild(dot);
  }
  const custom = el("button", "om-tab-swatch om-tab-swatch-pick", "+");
  custom.title = "Custom colour";
  custom.onclick = (event) => {
    event.stopPropagation();
    closeHostMenu();
    pickTabColour(workflow);
  };
  swatches.appendChild(custom);
  const clear = el("button", "om-tab-swatch om-tab-swatch-off", "×");
  clear.title = "No colour";
  clear.onclick = (event) => {
    event.stopPropagation();
    setTabMark(workflow, { colour: "" });
    closeHostMenu();
  };
  swatches.appendChild(clear);
  colours.appendChild(swatches);

  const titles = shell();
  titles.appendChild(el("span", "om-tab-row-label", "Title"));
  const naming = el("span", "om-tab-swatches");
  const set = el("button", "om-tab-name", mark.title || "Set a title");
  set.title = "A label for this tab only.";
  set.onclick = async (event) => {
    event.stopPropagation();
    closeHostMenu();
    const asked = await askText("Tab title", mark.title || workflow.filename || "", "Set");
    if (asked === null) return;
    setTabMark(workflow, { title: String(asked).slice(0, TAB_TITLE_CAP) });
  };
  naming.appendChild(set);
  if (mark.title) {
    const drop = el("button", "om-tab-swatch om-tab-swatch-off", "×");
    drop.title = "Use the file's own name";
    drop.onclick = (event) => {
      event.stopPropagation();
      setTabMark(workflow, { title: "" });
      closeHostMenu();
    };
    naming.appendChild(drop);
  }
  titles.appendChild(naming);

  const sending = shell();
  sending.appendChild(el("span", "om-tab-row-label", "Desktop"));
  const sender = el("span", "om-tab-swatches");
  const send = el("button", "om-tab-name",
                  workflow.isTemporary ? "Not saved yet" : "Put a shortcut on the desktop");
  send.disabled = !!workflow.isTemporary;
  send.title = workflow.isTemporary
    ? "This tab has never been saved."
    : "A shortcut on the desktop that opens this workflow.";
  send.onclick = async (event) => {
    event.stopPropagation();
    closeHostMenu();
    const made = await makeFlowLink("", workflow);
    if (!made) return;
    await loadDeskDocs();
    paintDeskIcons();
    toast(`Made a shortcut to ${made.name}.`, { kind: "ok" });
  };
  sender.appendChild(send);
  sending.appendChild(sender);

  host.appendChild(divider());
  if (tabMarksOn()) {
    host.appendChild(colours);
    host.appendChild(titles);
  }
  host.appendChild(sending);
}

function onTabMenu(event) {
  const workflow = tabAt(event);
  if (workflow) awaitTabMenu(workflow);
}

function mountTabMarks() {
  if (tabWatching) { tabTick(); return; }
  const strip = tabStrip();
  if (!strip) return;
  tabWatching = true;
  let due = 0;
  const watcher = new MutationObserver(() => {
    if (due) return;
    due = requestAnimationFrame(() => { due = 0; tabTick(); });
  });
  watcher.observe(strip, { childList: true, subtree: true, characterData: true,
                           attributes: true, attributeFilter: ["class"] });
  document.addEventListener("contextmenu", onTabMenu, true);
  tabMarksTidy();
  tabTick();
}

export { TAB_TINTS, TAB_HEX, paintTabs, mountTabMarks };
