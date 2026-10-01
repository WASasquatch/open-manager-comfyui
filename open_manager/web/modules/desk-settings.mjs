import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import { API, ICON_PROGRAM, ICON_DESKTOP } from "./base.mjs";
import { el, toast, liveTip, notify, openRowMenu, countNote } from "./ui.mjs";
import { windowSize, applyWindowLook, BAR_PAINTS, barPaint, readColour, createFloatingPanel, floatingPanel } from "./windows.mjs";
import { panelSetting } from "./settings.mjs";
import { whenText } from "./installed.mjs";
import { dlPost, bytesText } from "./downloads.mjs";
import { remountTopbar } from "./topbar.mjs";
import { deskGates, programIconArt } from "./programs.mjs";
import { TAB_HEX } from "./tab-marks.mjs";
import { taskBar, omIcon, taskbarShow, taskbarSync } from "./taskbar.mjs";
import { deskProgramsOff, deskLayer, deskCanvasBox, deskFitNow, deskFocus, deskPosition, deskPaperUrl, deskNumber, applyDeskLook, deskPapers, deskCells, authorColours, windowColour, setWindowColour, setProgramOn, repaintLooks } from "./desktop.mjs";
import { deskRows, paintDeskIcons } from "./desk-icons.mjs";

const DESKSET_SCALE = 0.26;

function deskRealRect() {
  const box = deskCanvasBox()?.getBoundingClientRect();
  if (!box || !box.width || !box.height) {
    return { width: window.innerWidth, height: window.innerHeight };
  }
  const floor = taskBar?.isConnected
    ? taskBar.getBoundingClientRect().top
    : window.innerHeight;
  return { width: box.width, height: Math.max(80, Math.min(box.bottom, floor) - box.top) };
}

function deskSetPreview(screen) {
  const real = deskRealRect();
  screen.style.aspectRatio = `${Math.round(real.width)} / ${Math.round(real.height)}`;
  const shown = screen.getBoundingClientRect();
  const scale = shown.width > 0 ? shown.width / real.width : DESKSET_SCALE;
  const url = deskPaperUrl(panelSetting("openManager.desktopWallpaper", ""));
  const fit = deskFitNow();
  screen.style.backgroundImage = url ? `url("${url}")` : "";
  screen.style.backgroundSize = fit.size === "auto" ? "auto" : fit.size;
  screen.style.backgroundRepeat = fit.repeat;
  screen.style.backgroundPosition = deskPosition(fit);
  screen.style.cursor = url && fit.movable ? "grab" : "default";
  const icon = deskNumber("openManager.desktopIconSize", 44, 28, 96) * scale;
  const label = deskNumber("openManager.desktopLabelSize", 12, 9, 18) * scale;
  const step = { wide: (88 + 12) * scale, tall: (109 + 12) * scale };
  const inset = { left: 73 * scale, top: 48 * scale };
  const cells = deskRows().map((row, at) => {
    const spot = deskCells[row.key] || { col: 0, row: Number(row.desk.at) || at };
    const cell = el("div", "om-deskset-cell");
    cell.style.left = `${inset.left + spot.col * step.wide}px`;
    cell.style.top = `${inset.top + spot.row * step.tall}px`;
    cell.style.width = `${Math.max(8, step.wide - 4)}px`;
    const art = omIcon({ kind: row.desk.kind, url: row.desk.art },
                       { name: row.desk.label, cls: "om-desk-art", img: "om-desk-img" });
    art.style.width = `${Math.max(6, icon)}px`;
    art.style.height = `${Math.max(6, icon)}px`;
    cell.appendChild(art);
    const name = el("span", null, row.desk.label);
    name.style.fontSize = `${Math.max(3, label)}px`;
    cell.appendChild(name);
    return cell;
  });
  screen.replaceChildren(...cells);
}

function slideWallpaper(screen, after) {
  screen.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    if (!deskFitNow().movable) return;
    if (!String(panelSetting("openManager.desktopWallpaper", "")).trim()) return;
    const box = screen.getBoundingClientRect();
    const start = deskFocus();
    const from = { x: event.clientX, y: event.clientY };
    let moved = false;
    let spot = start;
    try { screen.setPointerCapture(event.pointerId); } catch {}
    screen.style.cursor = "grabbing";

    const onMove = (move) => {
      const dx = (move.clientX - from.x) / Math.max(1, box.width) * 100;
      const dy = (move.clientY - from.y) / Math.max(1, box.height) * 100;
      if (!moved && Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      moved = true;
      spot = {
        x: Math.round(Math.max(0, Math.min(100, start.x - dx))),
        y: Math.round(Math.max(0, Math.min(100, start.y - dy))),
      };
      screen.style.backgroundPosition = `${spot.x}% ${spot.y}%`;
      if (deskLayer) deskLayer.style.backgroundPosition = `${spot.x}% ${spot.y}%`;
    };

    const onUp = async () => {
      try { screen.releasePointerCapture?.(event.pointerId); } catch {}
      screen.removeEventListener("pointermove", onMove);
      screen.removeEventListener("pointerup", onUp);
      screen.removeEventListener("pointercancel", onUp);
      screen.style.cursor = "grab";
      if (!moved) return;
      await app.extensionManager.setting.set("openManager.desktopFocusX", spot.x);
      await app.extensionManager.setting.set("openManager.desktopFocusY", spot.y);
      after?.(spot);
    };

    screen.addEventListener("pointermove", onMove);
    screen.addEventListener("pointerup", onUp);
    screen.addEventListener("pointercancel", onUp);
  });
}

function deskSetPapers(box, screen) {
  deskPapers().then((answer) => {
    if (!box.isConnected) return;
    const held = String(panelSetting("openManager.desktopWallpaper", ""));
    const found = answer.wallpapers || [];
    if (!found.length) {
      box.replaceChildren(el("div", "om-deskset-note", "No wallpapers yet."));
      return;
    }
    box.replaceChildren(...found.map((one) => {
      const pick = el("button", "om-deskset-paper");
      pick.type = "button";
      pick.style.backgroundImage = `url("${deskPaperUrl(one.name)}")`;
      pick.classList.toggle("om-deskset-paper-on", one.name === held);
      liveTip(pick, () => ({
        lead: one.name,
        facts: one.builtin
          ? [["Size", bytesText(one.size)], ["Source", "Came with Open Manager"]]
          : [["Size", bytesText(one.size)], ["Added", whenText(new Date(one.at * 1000))]],
        lines: one.builtin ? [] : ["Middle-click deletes it."],
      }));
      pick.onclick = async () => {
        await app.extensionManager.setting.set("openManager.desktopWallpaper", one.name);
        applyDeskLook();
        deskSetPreview(screen);
        deskSetPapers(box, screen);
      };
      pick.addEventListener("auxclick", async (event) => {
        if (event.button !== 1 || one.builtin) return;
        event.preventDefault();
        const answer2 = await dlPost("/wallpaper/remove", { name: one.name }).catch(() => null);
        if (!answer2?.ok) { notify("Not removed", answer2?.reason || "It could not be removed."); return; }
        if (one.name === held) {
          await app.extensionManager.setting.set("openManager.desktopWallpaper", "");
          applyDeskLook();
          deskSetPreview(screen);
        }
        deskSetPapers(box, screen);
      });
      return pick;
    }));
  }).catch(() => {});
}

function deskHeading(title) {
  const head = el("div", "om-deskset-head");
  head.appendChild(el("span", null, title));
  return head;
}

function windowPalette() {
  const box = el("div", "om-deskset-palette");
  const row = el("div", "om-deskset-palette-row");
  const custom = el("div", "om-deskset-custom");
  custom.hidden = true;
  const pair = { from: el("input"), to: el("input") };
  const paint = () => {
    row.replaceChildren();
    const held = windowColour();
    const named = readColour(held);
    for (const name of Object.keys(BAR_PAINTS)) {
      const dot = el("button", "om-tab-swatch om-deskset-swatch");
      dot.type = "button";
      dot.title = name === "plain" ? "The theme's own bar" : name;
      dot.style.background = name === "plain"
        ? "var(--om-surface)"
        : `var(--om-surface) ${barPaint({ tint: name }, { over: "var(--om-surface)" })}`;
      dot.style.backgroundBlendMode = "normal";
      dot.classList.toggle("om-tab-swatch-on", held === name || (!held && name === "plain"));
      dot.onclick = () => {
        custom.hidden = true;
        setWindowColour(name === "plain" ? "" : name).then(paint);
      };
      row.appendChild(dot);
    }
    const mine = el("button", "om-tab-swatch om-deskset-swatch om-tab-swatch-pick", "+");
    mine.type = "button";
    mine.title = "A colour, or a gradient, of your own";
    const own = named && !Object.hasOwn(BAR_PAINTS, held);
    if (own) {
      mine.textContent = "";
      mine.style.background =
        `var(--om-surface) ${barPaint(named, { over: "var(--om-surface)" })}`;
    }
    mine.classList.toggle("om-tab-swatch-on", !!own);
    mine.onclick = () => {
      custom.hidden = !custom.hidden;
      if (custom.hidden) return;
      pair.from.value = TAB_HEX.test(named?.from || named?.tint || "")
        ? (named.from || named.tint) : "#58a6ff";
      pair.to.value = TAB_HEX.test(named?.to || "") ? named.to : pair.from.value;
    };
    row.appendChild(mine);
  };

  const apply = () => {
    const from = pair.from.value;
    const to = pair.to.value;
    setWindowColour(from === to ? from : `${from},${to}`).then(paint);
  };
  for (const [side, field] of Object.entries(pair)) {
    field.type = "color";
    field.className = "om-deskset-dip";
    field.title = side === "from" ? "Left of the bar" : "Right of the bar";
    field.addEventListener("change", apply);
  }
  custom.appendChild(el("span", "om-deskset-dip-label", "From"));
  custom.appendChild(pair.from);
  custom.appendChild(el("span", "om-deskset-dip-label", "to"));
  custom.appendChild(pair.to);

  box.appendChild(el("span", "om-deskset-paint-name", "Window colour"));
  box.appendChild(row);
  box.appendChild(custom);
  box._omPaint = paint;
  paint();
  return box;
}

function colourSwitch() {
  const row = el("label", "om-deskset-row om-deskset-switch");
  const box = el("input");
  box.type = "checkbox";
  box.checked = authorColours();
  box.onchange = async () => {
    try {
      await app.extensionManager.setting.set("openManager.programColours", box.checked);
    } catch {}
    repaintLooks();
  };
  row.appendChild(box);
  row.appendChild(el("span", null, "Let programs colour their window bar"));
  return row;
}

function openProgramProps(entry) {
  const key = `props:program:${entry.id}`;
  const held = floatingPanel(key);
  if (held) { held.present(); return held; }
  const panel = createFloatingPanel({
    key, title: `${entry.name} properties`, ...windowSize("props"), modal: false,
  });
  const art = programIconArt(entry);
  if (art.kind === "mask") panel.setMaskIcon(art.url);
  else panel.setIcon(art.url);

  const wrap = el("div", "om-props");
  const head = el("div", "om-props-head");
  const face = el("div", "om-props-face");
  face.appendChild(omIcon({ kind: art.kind, url: art.url },
                          { name: entry.name, cls: "om-props-art", img: "om-props-img" }));
  head.appendChild(face);
  const titles = el("div");
  titles.appendChild(el("div", "om-props-name", entry.name));
  titles.appendChild(el("div", "om-props-sub", entry.hint || ""));
  head.appendChild(titles);
  wrap.appendChild(head);

  const rows = el("div", "om-props-rows");
  const row = (label, value) => {
    const one = el("div", "om-props-row");
    one.appendChild(el("span", "om-props-key", label));
    one.appendChild(el("span", "om-props-value", value));
    rows.appendChild(one);
    return one;
  };
  const surfaces = [];
  if (entry.surfaces?.desktop) surfaces.push("desktop");
  if (entry.surfaces?.start !== false) surfaces.push("start menu");
  row("Name", entry.name);
  row("Id", entry.id);
  row("Author", entry.author || "unstated");
  row("Version", entry.version || "unstated");
  row("Windows", entry.multiple ? "several at once" : "one at a time");
  row("Appears in", surfaces.join(", ") || "nowhere on its own");
  row("State", deskProgramsOff.includes(entry.id) ? "Switched off" : "Switched on");
  wrap.appendChild(rows);

  if ((entry.tags || []).length) {
    wrap.appendChild(el("div", "om-props-head2", "Keywords"));
    const keys = el("div", "om-props-keys");
    for (const tag of entry.tags) keys.appendChild(el("span", "om-props-key-chip", tag));
    wrap.appendChild(keys);
  }

  wrap.appendChild(el("div", "om-props-head2", "Declared"));
  const caps = el("div", "om-props-keys");
  const held2 = entry.capabilities || [];
  if (!held2.length) caps.appendChild(el("span", "om-props-note", "Nothing."));
  for (const one of held2) caps.appendChild(el("span", "om-props-key-chip", one));
  wrap.appendChild(caps);
  wrap.appendChild(el("div", "om-props-note",
    "Declared by the author and not verified. A program ships with Open Manager and runs "
    + "with everything this page has."));

  panel.body.appendChild(wrap);
  return panel;
}

function openManagePrograms() {
  const held = floatingPanel("programs");
  if (held) { held.present(); return held; }
  const panel = createFloatingPanel({
    key: "programs", title: "Manage Programs", ...windowSize("folder"), modal: false,
  });
  panel.setMaskIcon(ICON_PROGRAM);

  const find = el("input", "om-search");
  find.placeholder = "Search by name, author or keyword";
  find.spellcheck = false;
  panel.tools.appendChild(find);
  const list = el("div", "om-mgr-list");
  panel.body.appendChild(list);

  const state = { all: [], problems: [], find: "" };

  const matches = (one) => {
    const want = state.find.trim().toLowerCase();
    if (!want) return true;
    return [one.name, one.id, one.author, one.hint, ...(one.tags || [])]
      .filter(Boolean).some((text) => String(text).toLowerCase().includes(want));
  };

  const draw = () => {
    const shown = state.all.filter(matches);
    list.replaceChildren();
    if (!shown.length) {
      list.appendChild(el("div", "om-fold-empty",
        state.all.length ? "Nothing matches that." : "No programs are installed."));
    }
    for (const one of shown) {
      const row = el("div", "om-mgr-row");
      const art = programIconArt(one);
      row.appendChild(omIcon({ kind: art.kind, url: art.url },
                             { name: one.name, cls: "om-mgr-art", img: "om-mgr-shot" }));
      const text = el("div", "om-mgr-text");
      const head = el("div", "om-mgr-name", one.name);
      if (one.author) head.appendChild(el("span", "om-mgr-by", one.author));
      text.appendChild(head);
      text.appendChild(el("div", "om-mgr-hint", one.hint || ""));
      if ((one.tags || []).length) {
        text.appendChild(el("div", "om-mgr-keys", one.tags.join("  ·  ")));
      }
      row.appendChild(text);
      const mark = el("label", "om-mgr-switch");
      const box = el("input");
      box.type = "checkbox";
      box.checked = !deskProgramsOff.includes(one.id);
      box.onchange = () => { setProgramOn(one.id, box.checked); };
      mark.appendChild(box);
      row.appendChild(mark);
      row.ondblclick = () => openProgramProps(one);
      row.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        openRowMenu(row, { items: [
          { label: "Properties", fn: () => openProgramProps(one) },
          { label: deskProgramsOff.includes(one.id) ? "Switch on" : "Switch off",
            fn: () => { setProgramOn(one.id, deskProgramsOff.includes(one.id)); draw(); } },
        ], align: "left" });
      });
      liveTip(row, () => ({
        lead: one.name,
        facts: [
          ["Version", one.version || "unstated"],
          ["Windows", one.multiple ? "several allowed" : "one"],
        ],
        lines: [one.hint || ""],
      }));
      list.appendChild(row);
    }
    for (const problem of state.problems) {
      list.appendChild(el("div", "om-deskset-note", problem));
    }
  };

  const fill = async () => {
    try {
      const answer = await (await api.fetchApi(`${API}/programs`)).json();
      state.all = answer?.programs || [];
      state.problems = answer?.problems || [];
    } catch {
      state.all = [];
      state.problems = ["The programs could not be read."];
    }
    if (!panel.el.isConnected) return;
    panel.setBadge(countNote(state.all.length, "program"));
    draw();
  };

  let typing = 0;
  find.oninput = () => {
    clearTimeout(typing);
    typing = setTimeout(() => { state.find = find.value; draw(); }, 200);
  };
  panel._omFill = fill;
  fill();
  return panel;
}

function filesSwitch() {
  const row = el("label", "om-deskset-row om-deskset-switch");
  const box = el("input");
  box.type = "checkbox";
  box.checked = panelSetting("openManager.fileBrowser", false) === true;
  box.onchange = async () => {
    try {
      await app.extensionManager.setting.set("openManager.fileBrowser", box.checked);
    } catch {}
    remountTopbar();
    if (deskLayer) paintDeskIcons();
  };
  row.appendChild(box);
  row.appendChild(el("span", null, "ComfyUI file browser"));
  const note = el("span", "om-deskset-by",
    deskGates.writes ? "writing allowed" : "read-only");
  row.appendChild(note);
  return row;
}

function deskChoice(key, label, choices, fallback, after = null) {
  const row = el("div", "om-deskset-row");
  row.appendChild(el("label", null, label));
  const pick = el("select", "om-side-select");
  for (const one of choices) {
    const option = el("option", null, one[0].toUpperCase() + one.slice(1));
    option.value = one;
    pick.appendChild(option);
  }
  const held = panelSetting(key, fallback);
  pick.value = choices.includes(held) ? held : fallback;
  pick.addEventListener("change", async () => {
    try {
      await app.extensionManager.setting.set(key, pick.value);
    } catch {}
    after?.(pick.value);
  });
  row.appendChild(pick);
  return row;
}

function deskSwitch(key, label, { fallback = false, after = null } = {}) {
  const row = el("label", "om-deskset-row om-deskset-switch");
  const box = el("input");
  box.type = "checkbox";
  box.checked = panelSetting(key, fallback) === true;
  box.onchange = async () => {
    try {
      await app.extensionManager.setting.set(key, box.checked);
    } catch {}
    after?.(box.checked);
  };
  row.appendChild(box);
  row.appendChild(el("span", null, label));
  return row;
}

function aeroSwitch() {
  const row = el("label", "om-deskset-row om-deskset-switch");
  const box = el("input");
  box.type = "checkbox";
  box.checked = panelSetting("openManager.aero", false) === true;
  box.onchange = async () => {
    try {
      await app.extensionManager.setting.set("openManager.aero", box.checked);
    } catch {}
    applyWindowLook();
  };
  row.appendChild(box);
  row.appendChild(el("span", null, "Aero windows"));
  return row;
}

function manySwitch() {
  const row = el("label", "om-deskset-row om-deskset-switch");
  const box = el("input");
  box.type = "checkbox";
  box.checked = panelSetting("openManager.programWindows", false) === true;
  box.onchange = async () => {
    try {
      await app.extensionManager.setting.set("openManager.programWindows", box.checked);
    } catch {}
  };
  row.appendChild(box);
  row.appendChild(el("span", null, "Open a window each time, for programs that allow it"));
  return row;
}

function openDesktopSettings() {
  const held = floatingPanel("desktop");
  if (held) { held.present(); return held; }
  const panel = createFloatingPanel({
    key: "desktop", title: "Desktop Settings", ...windowSize("desktop"), modal: false,
  });
  panel.setMaskIcon(ICON_DESKTOP);

  const body = el("div", "om-deskset");
  const screen = el("div", "om-deskset-screen");
  body.appendChild(screen);
  body.appendChild(el("div", "om-deskset-stand"));

  const redraw = () => { applyDeskLook(); applyWindowLook(); deskSetPreview(screen); };
  slideWallpaper(screen, () => redraw());
  panel.el.addEventListener("om-float-resize", () => deskSetPreview(screen));
  window.addEventListener("resize", () => {
    if (panel.el.isConnected) deskSetPreview(screen);
  });

  body.appendChild(deskHeading("Wallpaper"));

  const fitRow = el("div", "om-deskset-row");
  fitRow.appendChild(el("label", null, "Wallpaper fit"));
  const fit = el("select", "om-side-select");
  for (const [value, label] of [["cover", "Cover"], ["contain", "Contain"],
                                ["centre", "Centre"], ["tile", "Tile"]]) {
    const option = el("option", null, label);
    option.value = value;
    fit.appendChild(option);
  }
  fit.value = String(panelSetting("openManager.desktopFit", "cover"));
  fit.onchange = async () => {
    await app.extensionManager.setting.set("openManager.desktopFit", fit.value);
    redraw();
  };
  fitRow.appendChild(fit);
  body.appendChild(fitRow);

  const slider = (label, key, low, high, fallback, unit = "px") => {
    const row = el("div", "om-deskset-row");
    row.appendChild(el("label", null, label));
    const range = el("input", null);
    range.type = "range";
    range.min = String(low);
    range.max = String(high);
    range.step = "1";
    range.value = String(deskNumber(key, fallback, low, high));
    const figure = el("span", "om-deskset-figure", `${range.value}${unit}`);
    range.oninput = () => { figure.textContent = `${range.value}${unit}`; };
    range.onchange = async () => {
      await app.extensionManager.setting.set(key, Number(range.value));
      redraw();
    };
    row.appendChild(range);
    row.appendChild(figure);
    return row;
  };
  body.appendChild(slider("Wallpaper across", "openManager.desktopFocusX", 0, 100, 50, "%"));
  body.appendChild(slider("Wallpaper down", "openManager.desktopFocusY", 0, 100, 50, "%"));

  const papers = el("div", "om-deskset-papers");
  body.appendChild(papers);
  deskSetPapers(papers, screen);

  const tools = el("div", "om-deskset-row");
  const add = el("button", "om-btn om-go", "Add a wallpaper");
  const file = el("input", null);
  file.type = "file";
  file.accept = Object.keys({ ".png": 1, ".jpg": 1, ".jpeg": 1, ".webp": 1, ".gif": 1 })
    .join(",");
  file.style.display = "none";
  file.onchange = async () => {
    const chosen = file.files?.[0];
    file.value = "";
    if (!chosen) return;
    const name = chosen.name.replace(/[^A-Za-z0-9._ -]+/g, "-").slice(-120);
    const payload = await chosen.arrayBuffer();
    let answer = null;
    try {
      answer = await (await api.fetchApi(
        `${API}/wallpaper/save?name=${encodeURIComponent(name)}`,
        { method: "POST", body: payload },
      )).json();
    } catch {
      answer = null;
    }
    if (!answer?.ok) {
      notify("Not kept", answer?.reason || "That image could not be kept.");
      return;
    }
    await app.extensionManager.setting.set("openManager.desktopWallpaper", answer.name);
    redraw();
    deskSetPapers(papers, screen);
    toast(`${answer.name} is now the wallpaper.`, { kind: "ok" });
  };
  add.onclick = () => file.click();
  const clear = el("button", "om-btn", "No wallpaper");
  clear.onclick = async () => {
    await app.extensionManager.setting.set("openManager.desktopWallpaper", "");
    redraw();
    deskSetPapers(papers, screen);
  };
  tools.appendChild(add);
  tools.appendChild(clear);
  tools.appendChild(file);
  body.appendChild(tools);

  body.appendChild(deskHeading("Icons"));
  body.appendChild(slider("Icon size", "openManager.desktopIconSize", 28, 96, 44));
  body.appendChild(slider("Label size", "openManager.desktopLabelSize", 9, 18, 12));

  body.appendChild(deskHeading("Windows"));
  body.appendChild(windowPalette());
  body.appendChild(colourSwitch());
  body.appendChild(aeroSwitch());
  body.appendChild(slider("Aero opacity", "openManager.aeroAlpha", 10, 100, 55, "%"));
  body.appendChild(slider("Aero darkening", "openManager.aeroDark", 0, 70, 18, "%"));
  body.appendChild(slider("Aero blur", "openManager.aeroBlur", 0, 40, 12));
  body.appendChild(deskSwitch("openManager.blurInactive", "Blur inactive windows",
                              { after: () => applyWindowLook() }));
  body.appendChild(slider("Inactive blur", "openManager.blurAmount", 1, 12, 3));
  body.appendChild(deskSwitch("openManager.windowShadow", "Drop shadow",
                              { fallback: true, after: () => applyWindowLook() }));
  body.appendChild(deskSwitch("openManager.windowIcons", "Show an icon in each window title",
                              { fallback: true }));
  body.appendChild(slider("Title text size", "openManager.windowTitleSize", 10, 28, 15));
  body.appendChild(slider("Content text size", "openManager.windowTextSize", 10, 22, 13));
  body.appendChild(slider("Header height", "openManager.panelHeaders", 30, 64, 44));
  body.appendChild(deskChoice("openManager.windowSize", "Default window size",
                              ["compact", "standard", "large"], "large"));

  body.appendChild(deskHeading("Taskbar"));
  body.appendChild(deskSwitch("openManager.taskbar", "Show the taskbar",
                              { fallback: true, after: () => taskbarSync() }));
  body.appendChild(deskSwitch("openManager.taskbarGroups",
                              "Group windows of the same kind",
                              { after: () => taskbarSync() }));
  body.appendChild(deskSwitch("openManager.taskbarHide",
                              "Hide it until the pointer nears the bottom",
                              { after: (on) => { taskbarSync(); taskbarShow(!on); } }));
  body.appendChild(deskSwitch("openManager.startLabel", "Write Start on the Start button",
                              { after: () => taskbarSync() }));

  if (deskGates.files !== false) {
    body.appendChild(deskHeading("Files"));
    body.appendChild(filesSwitch());
  }

  body.appendChild(deskHeading("Programs"));
  body.appendChild(manySwitch());
  const manage = el("div", "om-deskset-row");
  const go = el("button", "om-btn", "Manage programs");
  go.onclick = () => openManagePrograms();
  manage.appendChild(go);
  body.appendChild(manage);


  panel.body.appendChild(body);
  deskSetPreview(screen);
  return panel;
}

export { openManagePrograms, openDesktopSettings };
