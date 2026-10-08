import { api } from "../../../scripts/api.js";
import { el, toast, notify, askText, confirmAction, openRowMenu, liveTip } from "./ui.mjs";
import { panelSetting } from "./settings.mjs";
import { activeWorkflow, openWorkflows, workflowStore } from "./workflows.mjs";
import { SNAP_NAME_CAP, SNAP_ORIGIN_NAMES, bookOf, openBook, syncBook, takeSnapshot, applySnapshot, openSnapshotTab, renameSnapshot, deleteSnapshot, clearBook, liveSig, tagFor, noteRunTag, watchBooks, renamedWorkflow, deletedWorkflow, agoText } from "./snapshot-store.mjs";
import { openSnapshotWindow } from "./snapshot-window.mjs";

const SNAP_TAKE_COMMAND = "openmanager.snapshotTake";

const SNAP_WINDOW_COMMAND = "openmanager.snapshots";

const SAVE_COMMANDS = new Set(["Comfy.SaveWorkflow", "Comfy.SaveWorkflowAs"]);

const AUTO_BEAT = 30000;

const PICK_ART = '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">'
  + '<path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.8" '
  + 'stroke-linecap="round" stroke-linejoin="round"/></svg>';

let menu = null;

let tabWatching = false;

let started = false;

function snapshotsOn() {
  return panelSetting("openManager.snapshots", true) !== false;
}

function piniaStores() {
  return document.querySelector("#vue-app")?.__vue_app__?.config?.globalProperties?.$pinia?._s
    || null;
}

function tabStrip() {
  return document.querySelector(".workflow-tabs");
}

function shield(node) {
  for (const type of ["pointerdown", "mousedown", "mouseup", "dblclick", "auxclick"]) {
    node.addEventListener(type, (event) => event.stopPropagation());
  }
}

function pickFor(tab) {
  const held = tab.querySelector(":scope > .om-snap-pick");
  if (held) return held;
  const pick = el("span", "om-snap-pick");
  pick.setAttribute("role", "button");
  pick.setAttribute("aria-haspopup", "menu");
  pick.setAttribute("aria-expanded", "false");
  pick.tabIndex = 0;
  pick.appendChild(el("span", "om-snap-count"));
  pick.insertAdjacentHTML("beforeend", PICK_ART);
  shield(pick);
  pick.addEventListener("click", (event) => {
    event.stopPropagation();
    event.preventDefault();
    if (pick.__omFlow) void toggleMenu(pick, pick.__omFlow);
  });
  pick.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.stopPropagation();
    event.preventDefault();
    if (pick.__omFlow) void toggleMenu(pick, pick.__omFlow);
  });
  liveTip(pick, () => {
    const book = pick.__omFlow ? bookOf(pick.__omFlow) : null;
    const count = book?.items.length || 0;
    return count ? `Snapshots: ${count}` : "Snapshots";
  });
  return pick;
}

function paintPick(tab, workflow) {
  const label = tab.querySelector(":scope > .workflow-label");
  if (!label) return;
  const pick = pickFor(tab);
  if (label.nextElementSibling !== pick) label.after(pick);
  pick.__omFlow = workflow;
  const book = bookOf(workflow);
  void syncBook(book).catch(() => {});
  if (!book.loaded && !book.loading && !book.failed) void openBook(workflow).catch(() => {});
  const count = book.items.length;
  const text = count ? String(count) : "";
  const shown = pick.firstElementChild;
  if (shown.textContent !== text) shown.textContent = text;
  if (pick.classList.contains("om-snap-pick-idle") !== !count) {
    pick.classList.toggle("om-snap-pick-idle", !count);
  }
}

function paintSnapTabs() {
  const strip = tabStrip();
  if (!strip) return;
  const on = snapshotsOn();
  const open = openWorkflows();
  [...strip.children].forEach((child, index) => {
    const tab = child.matches?.(".workflow-tab") ? child : child.querySelector?.(".workflow-tab");
    if (!tab) return;
    const workflow = on ? open[index] : null;
    if (!workflow) {
      tab.querySelector(":scope > .om-snap-pick")?.remove();
      return;
    }
    paintPick(tab, workflow);
  });
  if (menu && (!on || !menu.anchor.isConnected)) closeMenu();
}

function closeMenu() {
  if (!menu) return;
  const held = menu;
  menu = null;
  held.node.remove();
  document.body.classList.remove("om-snap-open");
  held.anchor.setAttribute("aria-expanded", "false");
  document.removeEventListener("pointerdown", held.away, true);
  window.removeEventListener("keydown", held.key, true);
  window.removeEventListener("resize", held.place);
  held.stop();
}

function placeMenu() {
  if (!menu) return;
  const host = menu.anchor.closest(".p-togglebutton") || menu.anchor.closest(".workflow-tab")
    || menu.anchor;
  const rect = host.getBoundingClientRect();
  const width = menu.node.offsetWidth;
  const height = menu.node.offsetHeight;
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
  let top = rect.bottom + 4;
  if (top + height > window.innerHeight - 8) top = Math.max(8, window.innerHeight - height - 8);
  menu.node.style.left = `${Math.round(left)}px`;
  menu.node.style.top = `${Math.round(top)}px`;
}

async function takeFromMenu(workflow, input) {
  try {
    const item = await takeSnapshot(workflow, { name: input.value });
    if (!item) return;
    input.value = "";
    toast(`Took ${item.name}.`, { kind: "ok" });
  } catch {
    notify("Snapshot not taken", "The snapshot store could not be read.");
  }
}

async function loadFromMenu(workflow, item) {
  closeMenu();
  try {
    if (await applySnapshot(workflow, item.id)) toast(`Loaded ${item.name}.`, { kind: "ok" });
  } catch (error) {
    notify("Snapshot not loaded", `${item.name} could not be loaded: ${error.message}`);
  }
}

function rowMenu(anchor, workflow, item) {
  const book = bookOf(workflow);
  openRowMenu(anchor, {
    align: "right",
    items: [
      { label: "Rename", fn: async () => {
        closeMenu();
        const asked = await askText("Rename snapshot", item.name, "Rename");
        if (asked) await renameSnapshot(book, item.id, asked.slice(0, SNAP_NAME_CAP));
      } },
      { label: "Compare with current", fn: () => {
        closeMenu();
        void openSnapshotWindow(workflow, { pick: [item.id] });
      } },
      { label: "Open in new tab", fn: () => {
        closeMenu();
        openSnapshotTab(workflow, item.id).catch((error) => {
          notify("Not opened", `${item.name} could not be opened: ${error.message}`);
        });
      } },
      { label: "Delete", danger: true, fn: async () => {
        closeMenu();
        if (!(await confirmAction(`Delete "${item.name}"?`, "", "Delete", true))) return;
        await deleteSnapshot(book, item.id);
      } },
    ],
  });
}

function menuRow(workflow, item, sig) {
  const row = el("div", "om-snap-item");
  row.setAttribute("role", "menuitem");
  row.tabIndex = 0;
  const text = el("div", "om-snap-text");
  const head = el("div", "om-snap-name");
  if (sig && item.sig === sig) head.appendChild(el("span", "om-snap-dot"));
  head.appendChild(el("span", "om-snap-label", item.name));
  text.appendChild(head);
  const said = [agoText(item.at)];
  if (item.origin !== "manual" && !item.name.startsWith(SNAP_ORIGIN_NAMES[item.origin])) {
    said.push(SNAP_ORIGIN_NAMES[item.origin]);
  }
  if (item.summary) said.push(item.summary);
  text.appendChild(el("div", "om-snap-meta", said.join(" · ")));
  row.appendChild(text);
  const more = el("button", "om-btn om-snap-more", "⋮");
  more.title = "More";
  more.setAttribute("aria-label", "More");
  more.onclick = (event) => {
    event.stopPropagation();
    rowMenu(more, workflow, item);
  };
  row.appendChild(more);
  row.addEventListener("click", (event) => {
    if (event.target.closest("button")) return;
    void loadFromMenu(workflow, item);
  });
  row.addEventListener("keydown", (event) => {
    if (event.target !== row) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      void loadFromMenu(workflow, item);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const next = event.key === "ArrowDown" ? row.nextElementSibling : row.previousElementSibling;
      next?.focus();
    }
  });
  return row;
}

function paintMenu() {
  if (!menu) return;
  const { workflow, list, foot } = menu;
  const held = bookOf(workflow);
  const sig = held.items.length ? liveSig(workflow) : "";
  list.replaceChildren(...held.items.map((item) => menuRow(workflow, item, sig)));
  if (held.failed) list.appendChild(el("div", "om-snap-empty", "Snapshots could not be read."));
  else if (held.loaded && !held.items.length) list.appendChild(el("div", "om-snap-empty", "No snapshots"));
  list.hidden = !list.childElementCount;
  foot.replaceChildren();
  const compare = el("button", "om-btn om-snap-foot-btn", "Compare");
  compare.onclick = () => {
    closeMenu();
    void openSnapshotWindow(workflow);
  };
  foot.appendChild(compare);
  if (held.items.length) {
    const clear = el("button", "om-btn om-danger om-snap-foot-btn", "Delete all");
    clear.onclick = async () => {
      const count = held.items.length;
      closeMenu();
      const ok = await confirmAction(`Delete ${count} snapshot${count === 1 ? "" : "s"}?`,
                                     String(workflow.filename || ""), "Delete", true);
      if (ok) await clearBook(held);
    };
    foot.appendChild(clear);
  }
  placeMenu();
}

async function toggleMenu(anchor, workflow) {
  if (menu?.anchor === anchor) { closeMenu(); return; }
  closeMenu();
  const node = el("div", "om-snap-menu");
  node.setAttribute("role", "menu");
  const take = el("div", "om-snap-take");
  const input = el("input", "om-search");
  input.placeholder = "Snapshot name";
  input.maxLength = SNAP_NAME_CAP;
  input.spellcheck = false;
  const go = el("button", "om-btn om-go", "Take");
  go.onclick = () => takeFromMenu(workflow, input);
  input.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Enter") go.click();
    if (event.key === "ArrowDown") {
      event.preventDefault();
      list.firstElementChild?.focus();
    }
  });
  take.append(input, go);
  const list = el("div", "om-snap-menu-list");
  const foot = el("div", "om-snap-menu-foot");
  node.append(take, list, foot);
  const away = (event) => {
    const on = event.target;
    if (!(on instanceof Element)) return;
    if (node.contains(on) || anchor.contains(on) || on.closest(".om-menu, .om-backdrop")) return;
    closeMenu();
  };
  const key = (event) => {
    if (event.key !== "Escape" || document.querySelector(".om-backdrop")) return;
    event.stopPropagation();
    closeMenu();
  };
  const stop = watchBooks((changed) => {
    if (menu?.node === node && changed === bookOf(workflow)) paintMenu();
  });
  menu = { node, anchor, workflow, list, foot, away, key, place: placeMenu, stop };
  document.body.appendChild(node);
  document.body.classList.add("om-snap-open");
  anchor.setAttribute("aria-expanded", "true");
  document.addEventListener("pointerdown", away, true);
  window.addEventListener("keydown", key, true);
  window.addEventListener("resize", placeMenu);
  paintMenu();
  input.focus({ preventScroll: true });
  try {
    await openBook(workflow);
  } catch {
  }
  if (menu?.node === node) paintMenu();
}

function mountSnapshotTabs() {
  if (tabWatching) { paintSnapTabs(); return; }
  const strip = tabStrip();
  if (!strip) return;
  tabWatching = true;
  let due = 0;
  const watcher = new MutationObserver(() => {
    if (due) return;
    due = requestAnimationFrame(() => { due = 0; paintSnapTabs(); });
  });
  watcher.observe(strip, { childList: true, subtree: true, characterData: true,
                           attributes: true, attributeFilter: ["class"] });
  watchBooks(() => {
    if (due) return;
    due = requestAnimationFrame(() => { due = 0; paintSnapTabs(); });
  });
  paintSnapTabs();
}

function autoBeat() {
  if (!snapshotsOn()) return;
  const minutes = Number(panelSetting("openManager.snapshotEvery", 0)) || 0;
  const workflow = activeWorkflow();
  if (minutes <= 0 || !workflow) return;
  const held = bookOf(workflow);
  const sig = liveSig(workflow);
  if (!held.autoSig) {
    held.autoSig = sig;
    held.autoAt = Date.now();
    return;
  }
  if (Date.now() - held.autoAt < minutes * 60000) return;
  held.autoAt = Date.now();
  if (!sig || sig === held.autoSig) return;
  held.autoSig = sig;
  takeSnapshot(workflow, { origin: "auto" }).catch(() => {});
}

async function savedNow() {
  if (!snapshotsOn() || panelSetting("openManager.snapshotOnSave", false) !== true) return;
  const workflow = activeWorkflow();
  if (!workflow || workflow.isTemporary || workflow.isModified) return;
  try {
    await syncBook(bookOf(workflow));
    await takeSnapshot(workflow, { origin: "save" });
  } catch {
  }
}

function watchSaves() {
  const store = piniaStores()?.get("command");
  if (typeof store?.$onAction !== "function") return;
  store.$onAction(({ name, args, after }) => {
    if (name !== "execute" || !SAVE_COMMANDS.has(args?.[0])) return;
    after(() => { void savedNow(); });
  });
}

function watchFileMoves() {
  const store = workflowStore();
  if (typeof store?.$onAction !== "function") return;
  store.$onAction(({ name, args, after }) => {
    const workflow = args?.[0];
    if (!workflow || typeof workflow !== "object") return;
    const path = String(workflow.path || "");
    if (name === "renameWorkflow") after(() => renamedWorkflow(workflow, path));
    else if (name === "deleteWorkflow" && !workflow.isTemporary) {
      after(() => deletedWorkflow(workflow, path));
    }
  });
}

function runTag(graph) {
  const workflow = activeWorkflow();
  if (!snapshotsOn() || !workflow || !graph || typeof graph !== "object") return null;
  if (panelSetting("openManager.snapshotOnRun", false) === true) {
    return takeSnapshot(workflow, { origin: "run", graph })
      .then((item) => (item ? { id: item.id, name: item.name, edited: false } : null));
  }
  return tagFor(workflow, graph);
}

function wrapQueue() {
  const plain = api.queuePrompt;
  if (typeof plain !== "function" || plain.__omSnap) return;
  const wrapped = async function queuePrompt(number, data, ...rest) {
    let pending = null;
    try {
      pending = runTag(data?.workflow);
      pending?.catch?.(() => {});
    } catch {
      pending = null;
    }
    const answer = await plain.call(this, number, data, ...rest);
    if (pending && answer?.prompt_id) noteRunTag(String(answer.prompt_id), pending);
    return answer;
  };
  wrapped.__omSnap = true;
  api.queuePrompt = wrapped;
}

function watchSnapshots() {
  if (started) return;
  started = true;
  wrapQueue();
  watchSaves();
  watchFileMoves();
  setInterval(autoBeat, AUTO_BEAT);
}

function applySnapshotSetting() {
  if (!snapshotsOn()) closeMenu();
  paintSnapTabs();
}

async function takeActive() {
  if (!snapshotsOn()) { toast("Workflow snapshots are switched off."); return; }
  const workflow = activeWorkflow();
  if (!workflow) { toast("No workflow is open."); return; }
  try {
    const item = await takeSnapshot(workflow);
    if (item) toast(`Took ${item.name}.`, { kind: "ok" });
  } catch {
    notify("Snapshot not taken", "The snapshot store could not be read.");
  }
}

const snapshotCommands = [
  {
    id: SNAP_TAKE_COMMAND,
    label: "Open Manager: take a snapshot of the open workflow",
    icon: "pi pi-camera",
    function: () => { void takeActive(); },
  },
  {
    id: SNAP_WINDOW_COMMAND,
    label: "Open Manager: compare snapshots",
    icon: "pi pi-clone",
    function: () => {
      if (!snapshotsOn()) { toast("Workflow snapshots are switched off."); return; }
      void openSnapshotWindow();
    },
  },
];

export { snapshotCommands, mountSnapshotTabs, watchSnapshots, applySnapshotSetting };
