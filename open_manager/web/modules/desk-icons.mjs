import { ICON_BRAND, ICON_PROGRAM, ICON_FOLDER, ICON_BIN } from "./base.mjs";
import { el, liveTip, notify, openRowMenu } from "./ui.mjs";
import { installedIndex, foldId } from "./installs.mjs";
import { floatingPanel } from "./windows.mjs";
import { openPack } from "./packs.mjs";
import { managerDestinations } from "./topbar.mjs";
import { programOff } from "./programs.mjs";
import { omIcon } from "./taskbar.mjs";
import { deskLayer, deskCells, deskPinned, deskUnpinned, deskTaken, placeDeskCells, saveDeskCells, saveDeskPins, deskGrid, dragDeskCell } from "./desktop.mjs";
import { deskDocs, docKey, refreshDocs, FILE_DRAG_TYPE, carriedDoc, carriedHost, docsPathOf, openDoc, emptyWastebasket, openWastebasket, renameDocIn, removeDoc, buildDocCell } from "./desk-docs.mjs";
import { openFileBrowser, FILE_MOVE_TYPE, filePinParts } from "./files.mjs";
import { workflowMissing } from "./workflows.mjs";

const PROGRAM_ID = /^[a-z0-9][a-z0-9-]{0,31}$/;

function packPinnable(id) {
  return installedIndex.has(foldId(id));
}

function deskRowFor(key) {
  const found = managerDestinations().find((one) => one.key === key);
  if (found) {
    return found.desk ? found : { ...found, desk: {
      at: 50, label: found.short || found.label, art: ICON_BRAND, kind: "src",
      window: `panel:${found.key}`,
    } };
  }
  if (key.startsWith("pack:")) {
    const id = key.slice(5);
    if (!id || !packPinnable(id)) return null;
    return {
      key, kind: "program", label: id, hint: `The page for ${id}`,
      desk: { at: 60, label: id, art: ICON_BRAND, kind: "src", window: key },
      open: () => openPack(id),
    };
  }
  const pinned = filePinParts(key);
  if (pinned) {
    const where = pinned.place.split(":")[1] || pinned.place;
    const label = pinned.path ? pinned.path.split("/").pop() : where;
    return {
      key, kind: "program", label,
      hint: `${where}${pinned.path ? `/${pinned.path}` : ""}`,
      revisit: true,
      desk: { at: 70, label, art: ICON_FOLDER, kind: "mask", window: "files" },
      open: () => openFileBrowser(pinned.place, pinned.path),
    };
  }
  if (!programOff(key) && PROGRAM_ID.test(key)) {
    return {
      key, kind: "program", label: key, gone: true,
      hint: `${key} is not in this install any more.`,
      desk: { at: 60, label: key, art: ICON_PROGRAM, kind: "mask", window: "" },
      open: () => notify("Not installed",
        `The program ${key} is not in this install any more.`),
    };
  }
  return null;
}

function deskRows() {
  const built = managerDestinations()
    .filter((row) => row.desk && (!row.available || row.available()))
    .filter((row) => !row.desk.off || deskPinned.includes(row.key))
    .filter((row) => !deskUnpinned.includes(row.key))
    .sort((a, b) => a.desk.at - b.desk.at);
  const seen = new Set(built.map((one) => one.key));
  for (const key of deskPinned) {
    if (seen.has(key)) continue;
    const row = deskRowFor(key);
    if (!row) continue;
    seen.add(key);
    built.push(row);
  }
  return built;
}

function pinnedOn(key) {
  return deskRows().some((one) => one.key === key);
}

function pinDesk(key) {
  const away = deskUnpinned.indexOf(key);
  if (away >= 0) deskUnpinned.splice(away, 1);
  else if (!deskPinned.includes(key)) deskPinned.push(key);
  const spot = deskCells[key];
  const grid = deskGrid();
  if (spot && grid && deskTaken(grid, null).has(`${spot.col},${spot.row}`)) {
    delete deskCells[key];
    saveDeskCells();
  }
  saveDeskPins();
  paintDeskIcons();
}

function unpinDesk(key) {
  const held = deskPinned.indexOf(key);
  if (held >= 0) deskPinned.splice(held, 1);
  else if (!deskUnpinned.includes(key)) deskUnpinned.push(key);
  if (deskCells[key]) {
    delete deskCells[key];
    saveDeskCells();
  }
  saveDeskPins();
  paintDeskIcons();
}

function deskOpenRow(row) {
  if (!row) return;
  const held = row.desk?.window ? floatingPanel(row.desk.window) : null;
  if (held && !row.revisit) { held.present(); return; }
  row.open?.();
}

function deskSelect(cell) {
  if (!deskLayer) return;
  for (const one of deskLayer.querySelectorAll(".om-desk-cell")) {
    const want = one === cell;
    one.classList.toggle("om-desk-cell-on", want);
    one.tabIndex = want ? 0 : -1;
    one.setAttribute("aria-selected", want ? "true" : "false");
  }
}

function paintDeskLive() {
  if (!deskLayer) return;
  for (const cell of deskLayer.querySelectorAll(".om-desk-cell")) {
    const held = floatingPanel(cell.dataset.omDeskWindow);
    cell.classList.toggle("om-desk-cell-live", !!held);
    if (!Object.hasOwn(cell.dataset, "omFlowTarget")) continue;
    cell.classList.toggle("om-desk-cell-lost", workflowMissing(cell.dataset.omFlowTarget));
  }
}

function onDeskKey(event) {
  const cell = event.target instanceof Element
    ? event.target.closest(".om-desk-cell") : null;
  if (!cell || !deskLayer) return;
  const cells = [...deskLayer.querySelectorAll(".om-desk-cell")];
  const at = cells.indexOf(cell);
  const go = (to) => {
    const next = cells[Math.max(0, Math.min(cells.length - 1, to))];
    if (!next) return;
    deskSelect(next);
    next.focus();
  };
  if (event.key === "ArrowDown" || event.key === "ArrowRight") {
    event.preventDefault();
    go(at + 1);
  } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
    event.preventDefault();
    go(at - 1);
  } else if (event.key === "Home") {
    event.preventDefault();
    go(0);
  } else if (event.key === "End") {
    event.preventDefault();
    go(cells.length - 1);
  } else if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    if (cell._omDoc) openDoc(cell._omDoc);
    else if (cell._omOpen) cell._omOpen();
    else if (cell._omRow) deskOpenRow(cell._omRow);
  } else if (event.key === "F2" && cell._omDoc) {
    event.preventDefault();
    renameDocIn(cell, cell._omDoc, refreshDocs);
  } else if (event.key === "Delete" && cell._omDoc) {
    event.preventDefault();
    removeDoc(cell._omDoc, refreshDocs);
  }
}

function buildDeskCell(row) {
  const cell = el("div", "om-desk-cell");
  cell._omRow = row;
  cell.dataset.omDeskKey = row.key;
  cell.dataset.omDeskWindow = row.desk.window || "";
  cell.tabIndex = -1;
  cell.setAttribute("role", "option");
  cell.setAttribute("aria-selected", "false");
  cell.appendChild(omIcon({ kind: row.desk.kind, url: row.desk.art },
                          { name: row.desk.label, cls: "om-desk-art", img: "om-desk-img" }));
  cell.appendChild(el("span", "om-desk-name", row.desk.label));
  cell.appendChild(el("span", "om-desk-live"));
  cell.classList.toggle("om-desk-cell-lost", !!row.gone);
  liveTip(cell, () => ({
    lead: row.desk.label,
    lines: [row.gone || !floatingPanel(row.desk.window)
      ? row.hint
      : "Its window is open."],
  }));
  cell.onclick = () => deskSelect(cell);
  cell.ondblclick = () => deskOpenRow(row);
  cell.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    event.stopPropagation();
    deskSelect(cell);
    openRowMenu(cell, {
      items: [
        row.gone ? null : { label: `Open ${row.desk.label}`, fn: () => deskOpenRow(row) },
        { label: "Remove from the desktop", fn: () => unpinDesk(row.key) },
      ].filter(Boolean),
      align: "left",
    });
  });
  dragDeskCell(cell);
  return cell;
}

function buildBinCell() {
  const cell = el("div", "om-desk-cell");
  cell.dataset.omDeskKey = "wastebasket";
  cell.dataset.omDeskWindow = "wastebasket";
  cell.tabIndex = -1;
  cell.setAttribute("role", "option");
  cell.setAttribute("aria-selected", "false");
  cell._omOpen = () => openWastebasket();
  cell.appendChild(omIcon({ kind: "mask", url: ICON_BIN },
                          { name: "Trash", cls: "om-desk-art", img: "om-desk-img" }));
  cell.appendChild(el("span", "om-desk-name", "Trash"));
  cell.appendChild(el("span", "om-desk-live"));
  liveTip(cell, () => ({ lead: "Trash" }));
  cell.onclick = () => deskSelect(cell);
  cell.ondblclick = () => openWastebasket();
  cell.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    event.stopPropagation();
    deskSelect(cell);
    openRowMenu(cell, {
      items: [
        { label: "Open Trash", fn: () => openWastebasket() },
        { label: "Empty Trash", danger: true, fn: () => emptyWastebasket() },
      ],
      align: "left",
    });
  });
  binDropInto(cell);
  dragDeskCell(cell);
  return cell;
}

function binDropInto(node, after = null) {
  node.dataset.omDrop = "bin";
  node.addEventListener("dragover", (event) => {
    if (!carriedDoc(event) && !carriedHost(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    node.classList.add("om-fold-over");
  });
  node.addEventListener("dragleave", () => node.classList.remove("om-fold-over"));
  node.addEventListener("drop", async (event) => {
    if (!carriedDoc(event) && !carriedHost(event)) return;
    event.preventDefault();
    event.stopPropagation();
    node.classList.remove("om-fold-over");
    const sent = carriedDoc(event)
      ? readDrag(event, FILE_DRAG_TYPE)
      : binnable(readDrag(event, FILE_MOVE_TYPE));
    if (!sent?.path) return;
    await removeDoc(sent, () => {});
    after?.();
  });
}

function readDrag(event, type) {
  try { return JSON.parse(event.dataTransfer.getData(type)); } catch { return null; }
}

function binnable(sent) {
  if (!sent?.path) return null;
  if (!String(sent.place || "").startsWith("docs:")) {
    notify(sent.name || "Not binned",
           "Only items in Desktop and Documents can go to the Trash.");
    return null;
  }
  return { ...sent, path: docsPathOf(sent.place, sent.path) };
}

function paintDeskIcons() {
  if (!deskLayer) return;
  const grid = deskLayer.querySelector(".om-desk-grid");
  if (!grid) return;
  const rows = deskRows();
  const shape = [...rows.map((one) => one.key), "wastebasket",
                 ...deskDocs.map((one) => `${docKey(one)}=${one.name}=${one.icon || ""}`
                   + `=${one.target || ""}=${one.colour || ""}`)]
                 .join("|");
  if (grid._shape === shape) { paintDeskLive(); return; }
  grid._shape = shape;
  grid.replaceChildren(...rows.map(buildDeskCell), buildBinCell(),
                       ...deskDocs.map(buildDocCell));
  const first = grid.firstElementChild;
  if (first) first.tabIndex = 0;
  placeDeskCells();
  paintDeskLive();
}

export { deskRows, pinnedOn, pinDesk, unpinDesk, deskOpenRow, deskSelect, paintDeskLive, onDeskKey, binDropInto, paintDeskIcons };
