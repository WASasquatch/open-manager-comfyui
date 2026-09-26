import { ICON_MEMORY } from "./base.mjs";
import { el, toast, liveTip, notify, chooseAction } from "./ui.mjs";
import { asWindow, windowSize, createFloatingPanel, floatingPanel, closeFloatingPanel } from "./windows.mjs";
import { dlPost, bytesText, dlRemember, dlRecall } from "./downloads.mjs";
import { monitorInterval, LINK_DEADLINE, link, readingHooks, dropMonitorCalls, linkLeased, linkMayPost, monPost, monGet, monRelease, pushStale, linkState, takeReading, linkTick, reviveSocket, LINK_SAY, buildLinkRow, meterText, MEMORY_CLIENT } from "./monitor.mjs";
import { libGet } from "./library.mjs";

const MEMORY_HISTORY = 240;

const memoryHistory = { cpu: [], ram: [], vram: [] };

const READING_QUIET = 6000;

let lastReadingAt = 0;

function readingAge() {
  if (!lastReadingAt) return Infinity;
  const hidden = link.hiddenFor + (link.hiddenAt ? Date.now() - link.hiddenAt : 0);
  return Math.max(0, Date.now() - lastReadingAt - hidden);
}

function readingQuiet() {
  return readingAge() > Math.max(READING_QUIET, monitorInterval() * 3000);
}

function quietText(age) {
  if (!Number.isFinite(age)) return "nothing since the panel opened";
  const seconds = Math.round(age / 1000);
  if (seconds < 90) return `no reading for ${seconds} seconds`;
  const minutes = Math.round(seconds / 60);
  return `no reading for ${minutes} minute${minutes === 1 ? "" : "s"}`;
}

function recordReading(reading) {
  lastReadingAt = Date.now();
  link.hiddenFor = 0;
  link.hiddenAt = document.hidden ? Date.now() : 0;
  const push = (key, value) => {
    if (typeof value !== "number" || Number.isNaN(value)) return;
    const series = memoryHistory[key];
    series.push(value);
    if (series.length > MEMORY_HISTORY) series.shift();
  };
  push("cpu", reading.cpu);
  if (reading.ram?.total) push("ram", (reading.ram.used / reading.ram.total) * 100);
  if (reading.vram?.total) push("vram", (reading.vram.used / reading.vram.total) * 100);
}

function drawGraph(canvas, series, colour) {
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || 260;
  const height = canvas.clientHeight || 54;
  if (canvas.width !== width * ratio || canvas.height !== height * ratio) {
    canvas.width = width * ratio;
    canvas.height = height * ratio;
  }
  const pen = canvas.getContext("2d");
  pen.setTransform(ratio, 0, 0, ratio, 0, 0);
  pen.clearRect(0, 0, width, height);

  const style = getComputedStyle(canvas);
  pen.strokeStyle = style.getPropertyValue("--om-border") || "#30363d";
  pen.lineWidth = 1;
  for (let line = 1; line < 4; line += 1) {
    const y = (height / 4) * line;
    pen.beginPath();
    pen.moveTo(0, y + 0.5);
    pen.lineTo(width, y + 0.5);
    pen.stroke();
  }
  if (!series.length) return;

  const step = width / (MEMORY_HISTORY - 1);
  const at = (index) => ({
    x: width - (series.length - 1 - index) * step,
    y: height - (Math.max(0, Math.min(100, series[index])) / 100) * height,
  });
  pen.beginPath();
  pen.moveTo(at(0).x, height);
  for (let index = 0; index < series.length; index += 1) {
    const point = at(index);
    pen.lineTo(point.x, point.y);
  }
  pen.lineTo(at(series.length - 1).x, height);
  pen.closePath();
  pen.fillStyle = `${colour}33`;
  pen.fill();

  pen.beginPath();
  for (let index = 0; index < series.length; index += 1) {
    const point = at(index);
    if (index === 0) pen.moveTo(point.x, point.y);
    else pen.lineTo(point.x, point.y);
  }
  pen.strokeStyle = colour;
  pen.lineWidth = 1.5;
  pen.stroke();
}

function memoryBar(label) {
  const bar = el("div", "om-mem-bar");
  bar.appendChild(el("span", "om-mem-bar-label", label));
  const value = el("span", "om-mem-bar-value", "");
  bar.appendChild(value);
  return { bar, value };
}

function buildGraphBlock(key, label, colour) {
  const box = el("div", "om-mem-graph");
  const head = memoryBar(label);
  head.value.textContent = "-";
  head.bar.classList.add("om-mem-bar-toggle");
  const chevron = el("span", "om-mem-bar-fold", "▾");
  head.bar.insertBefore(chevron, head.bar.firstChild);
  box.appendChild(head.bar);
  const canvas = el("canvas", "om-mem-canvas");
  box.appendChild(canvas);
  const detail = el("div", "om-mem-graph-detail", "");
  box.appendChild(detail);

  const setFolded = (folded) => {
    box.classList.toggle("om-mem-folded", folded);
    chevron.textContent = folded ? "▸" : "▾";
    head.bar.title = folded ? `Show the ${label} graph` : `Hide the ${label} graph`;
    dlRemember(`om-mem-fold-${key}`, folded ? "1" : "0");
  };
  head.bar.onclick = () => setFolded(!box.classList.contains("om-mem-folded"));
  setFolded(dlRecall(`om-mem-fold-${key}`, "0") === "1");

  return { box, canvas, value: head.value, detail, key, colour,
           folded: () => box.classList.contains("om-mem-folded") };
}

const BLOCK_COLOURS = ["#a371f7", "#3fb950", "#58a6ff", "#d29922", "#db61a2", "#39c5cf"];

function keyItem(device, seat) {
  const item = el("span", "om-mem-key-item");
  const swatch = el("span", "om-mem-swatch");
  swatch.style.background = blockColour(seat);
  item.appendChild(swatch);
  item.appendChild(el("span", null, `${device.device} · ${bytesText(device.bytes)}`));
  return item;
}

function heatKeyItem() {
  const item = el("span", "om-mem-key-item om-mem-key-hot");
  const swatch = el("span", "om-mem-swatch");
  swatch.style.background = `rgba(${BLOCK_HOT}, .8)`;
  item.appendChild(swatch);
  item.appendChild(el("span", null, "in use now"));
  item.title = "Pages the run has just faulted in, fading as they go quiet.";
  return item;
}

function blockColour(seat) {
  return seat < 0 ? "transparent" : BLOCK_COLOURS[seat % BLOCK_COLOURS.length];
}

const BLOCK_GAP = 1;

const BLOCK_CELL_MAX = 14;

const BLOCK_ROWS_LIMIT = 10;

function blockGrid(canvas, count) {
  const width = canvas.clientWidth;
  if (!width || !count) return null;
  const ratio = window.devicePixelRatio || 1;
  const gap = Math.max(1, Math.round(BLOCK_GAP * ratio));
  const deviceWidth = Math.max(1, Math.round(width * ratio));
  const pick = (rows) => {
    const columns = Math.max(1, Math.ceil(count / rows));
    return { rows, columns, step: deviceWidth / columns };
  };
  let best = pick(1);
  for (let rows = 2; rows <= BLOCK_ROWS_LIMIT; rows += 1) {
    const candidate = pick(rows);
    if (candidate.step > BLOCK_CELL_MAX * ratio) break;
    best = candidate;
  }
  const step = Math.min(best.step, BLOCK_CELL_MAX * ratio);
  const deviceHeight = Math.max(1, Math.round(best.rows * step));
  return { width, ratio, gap, step, columns: best.columns, rows: best.rows,
           deviceWidth, deviceHeight, height: Math.round(deviceHeight / ratio) };
}

function blockRect(grid, index) {
  const column = index % grid.columns;
  const row = Math.floor(index / grid.columns);
  const left = Math.round(column * grid.step);
  const top = Math.round(row * grid.step);
  return [left, top,
          Math.max(1, Math.round((column + 1) * grid.step) - left - grid.gap),
          Math.max(1, Math.round((row + 1) * grid.step) - top - grid.gap)];
}

function paintBlockMap(canvas, cells) {
  const grid = blockGrid(canvas, cells.length);
  if (!grid) return;
  canvas.style.height = `${grid.height}px`;
  canvas.width = grid.deviceWidth;
  canvas.height = grid.deviceHeight;
  const pen = canvas.getContext("2d");
  pen.setTransform(1, 0, 0, 1, 0, 0);
  pen.clearRect(0, 0, grid.deviceWidth, grid.deviceHeight);

  cells.forEach((seat, index) => {
    pen.fillStyle = blockColour(seat);
    pen.fillRect(...blockRect(grid, index));
  });
  canvas._omGrid = grid;
}

const BLOCK_HOT = "255, 255, 255";

const HEAT_FRAME = 60;

const HEAT_FADE = 2500;

function paintBlockHeat(canvas, heat, at) {
  const grid = canvas._omGrid;
  if (!grid || !heat?.length) return false;
  const base = canvas._omBase;
  if (!base) return false;
  const pen = canvas.getContext("2d");
  pen.setTransform(1, 0, 0, 1, 0, 0);
  pen.drawImage(base, 0, 0);
  const fade = Math.max(0, 1 - (performance.now() - at) / HEAT_FADE);
  if (!fade) return false;
  let lit = false;
  for (let index = 0; index < heat.length; index += 1) {
    const value = heat[index];
    if (!value) continue;
    lit = true;
    pen.fillStyle = `rgba(${BLOCK_HOT}, ${(value / 100) * 0.75 * fade})`;
    pen.fillRect(...blockRect(grid, index));
  }
  return lit;
}

function buildBlockMap(map) {
  const box = el("div", "om-mem-map");
  const frame = el("div", "om-mem-grid-frame");
  const canvas = el("canvas", "om-mem-grid");
  frame.appendChild(canvas);
  box.appendChild(frame);
  let cells = map.cells || [];
  let heat = map.heat || [];
  let heatAt = 0;
  let beating = 0;

  const snapshot = () => {
    if (!canvas.width || !canvas.height) return;
    let base = canvas._omBase;
    if (!base) { base = document.createElement("canvas"); canvas._omBase = base; }
    if (base.width !== canvas.width || base.height !== canvas.height) {
      base.width = canvas.width;
      base.height = canvas.height;
    }
    const pen = base.getContext("2d");
    pen.setTransform(1, 0, 0, 1, 0, 0);
    pen.clearRect(0, 0, base.width, base.height);
    pen.drawImage(canvas, 0, 0);
  };

  const draw = () => { paintBlockMap(canvas, cells); snapshot(); };

  const beat = () => {
    beating = 0;
    if (!canvas.isConnected || document.hidden) return;
    if (paintBlockHeat(canvas, heat, heatAt)) {
      beating = setTimeout(() => requestAnimationFrame(beat), HEAT_FRAME);
    } else {
      draw();
    }
  };
  const warm = () => {
    if (beating || !heat.some(Boolean)) return;
    beating = setTimeout(() => requestAnimationFrame(beat), HEAT_FRAME);
  };

  const watcher = new ResizeObserver(draw);
  watcher.observe(canvas);
  box._redraw = draw;

  const key = el("div", "om-mem-key");
  for (const [seat, device] of (map.devices || []).entries()) {
    key.appendChild(keyItem(device, seat));
  }
  const hot = heatKeyItem();
  hot.hidden = !map.heat;
  key.appendChild(hot);
  const note = el("span", "om-mem-key-note", `${map.modules} ${map.unit || "blocks"}`);
  note.title = (map.source === "pages"
    ? "Read from the streaming library, a page at a time. The shares here step in whole "
      + "pages and differ slightly from the byte figure above."
    : "Read from the model's own modules.")
    + (map.heat ? " A square lights when the run faults that page in, and fades as it goes "
                  + "quiet."
                : "");
  key.appendChild(note);
  box.appendChild(key);

  return {
    el: box,
    update: (next) => {
      const shape = (next.cells || []).join(",");
      const moved = shape !== cells.join(",");
      cells = next.cells || [];
      heat = next.heat || [];
      heatAt = performance.now();
      if (moved || !canvas._omBase) draw();
      warm();
      const rate = Number.isFinite(next.faults)
        ? ` · ${Math.round(next.faults)} faults/s`
          + (next.refaults >= 1 ? `, ${Math.round(next.refaults)} back` : "")
        : "";
      note.textContent = `${next.modules} ${next.unit || "blocks"}${rate}`;
      hot.hidden = !next.heat;
      const items = [...key.querySelectorAll(".om-mem-key-item:not(.om-mem-key-hot)")];
      const devices = next.devices || [];
      if (items.length !== devices.length) {
        key.replaceChildren(...devices.map((device, seat) => keyItem(device, seat)), hot, note);
      } else {
        devices.forEach((device, seat) => {
          items[seat].lastChild.textContent = `${device.device} · ${bytesText(device.bytes)}`;
          items[seat].firstChild.style.background = blockColour(seat);
        });
      }
    },
  };
}

function repaintBlockMaps(root) {
  for (const map of root.querySelectorAll(".om-mem-map")) map._redraw?.();
}

const BLOCK_CELLS_FIRST = 240;

const BLOCK_CELLS_MAX = 1024;

function buildMemoryModelRow(model, refresh) {
  const row = el("div", "om-mem-model");

  const top = el("div", "om-dl-top");
  const name = el("span", "om-dl-name", model.name);
  const size = el("span", "om-lib-size", bytesText(model.total));
  top.appendChild(name);
  top.appendChild(size);
  const drop = el("button", "om-btn om-mem-drop", "Unload");
  drop.title = "Unload this model and its clones. ComfyUI loads it again when a prompt needs "
    + "it. Refused while a prompt is running.";
  drop.onclick = async () => {
    const go = await chooseAction(`Unload ${row._name}?`,
      `This unloads ${row._name} regardless of what is holding it.`,
      [{ key: "go", label: "Unload", primary: true }],
      { wide: true, facts: [
        ["Frees", bytesText(row._total || 0)],
        ["Also unloads", "Any clone of this model, meaning a second copy made for another device"],
        ["Costs", "The next prompt that needs it loads it again"],
        ["While a prompt is running", "Refused"],
      ] });
    if (!go) return;
    drop.disabled = true;
    let answer;
    try {
      answer = await dlPost("/monitor/unload", { id: row._id, name: row._name });
    } catch (error) {
      answer = { ok: false, reason: error.message };
    }
    drop.disabled = false;
    if (!answer?.ok) {
      notify("Not unloaded", answer?.reason || "ComfyUI would not unload it.");
      return;
    }
    toast(`${answer.name || row._name} unloaded${answer.freed ? `, ${bytesText(answer.freed)} freed` : ""}.`,
          { kind: "ok" });
    refresh?.();
  };
  top.appendChild(drop);
  row.appendChild(top);

  const bar = el("div", "om-mem-split");
  const resident = el("div", "om-mem-resident");
  bar.appendChild(resident);
  liveTip(bar, () => bar._say || "");
  row.appendChild(bar);

  const meta = el("div", "om-dl-where");
  row.appendChild(meta);

  const slot = el("div", "om-mem-map-slot");
  row.appendChild(slot);

  let drawn = null;

  const tell = (model) => {
    name.textContent = model.name;
    size.textContent = bytesText(model.total);
    row._id = model.id;
    row._name = model.name;
    row._total = model.total;
    resident.style.width = `${Math.max(0, Math.min(100, model.share))}%`;
    bar._say = `${bytesText(model.resident)} on ${model.device}`
      + (model.offloaded ? `\n${bytesText(model.offloaded)} offloaded to host memory` : "");

    const tags = [model.device, `${bytesText(model.resident)} resident`];
    if (model.offloaded) tags.push(`${bytesText(model.offloaded)} offloaded`);
    if (model.in_use) tags.push("in use");
    if (model.pins?.pinned_bytes) tags.push(`${bytesText(model.pins.pinned_bytes)} pinned`);
    const parts = tags.map((text, index) =>
      el("span", index ? "om-dl-src" : null, text));
    if (model.streaming) {
      const tag = el("span", "om-dl-src om-mem-stream", "weights stream in blocks");
      tag.title = "This model's weights move between host and device while it runs, a block "
        + "at a time, so what is resident changes as it works.";
      parts.splice(model.offloaded ? 3 : 2, 0, tag);
    }
    if (model.pins?.failed) parts.push(el("span", "om-dl-src om-dl-bad", "pinning failed"));
    meta.replaceChildren(...parts);

    row._index = model.index;
    row._streaming = !!model.streaming;
  };

  let asking = false;
  row._blocks = () => {
    if (asking || !slot.isConnected || document.hidden || row._inView === false) return;
    asking = true;
    libGet(`/monitor/blocks?index=${row._index}&cells=${row._cells || BLOCK_CELLS_FIRST}`)
      .then((found) => {
        asking = false;
        if (!slot.isConnected) return;
        if (!found?.ok) {
          drawn = null;
          slot.replaceChildren(el("div", "om-dl-note", found?.reason || "No block map."));
          return;
        }
        if (drawn) drawn.update(found);
        else {
          drawn = buildBlockMap(found);
          slot.replaceChildren(drawn.el);
        }
        if (found.modules) row._cells = Math.min(found.modules, BLOCK_CELLS_MAX);
        row._busy = Number.isFinite(found.faults) && found.faults > 0;
      })
      .catch(() => { asking = false; });
  };

  tell(model);
  row._blocks();
  row._update = tell;
  return row;
}

const ACTIVITY_LOOK = {
  working: { title: "Working", legend: "The card is doing arithmetic." },
  streaming: { title: "Streaming weights", legend: "The model is larger than the card, so "
    + "weights cross the bus as they are needed." },
  stalling: { title: "Potential memory stall", legend: "Memory is nearly full and nothing has "
    + "moved for a short while." },
  stalled: { title: "Memory stalled", legend: "Quiet, memory full, and nothing has moved for "
    + "the better part of a minute." },
  hang: { title: "Possible GPU hang", legend: "Busy, memory full, nothing arriving and "
    + "nothing advancing." },
  oom: { title: "Out of memory", legend: "The last run failed for memory. ComfyUI unloaded "
    + "everything it held." },
  idle: { title: "Idle", legend: "Nothing is running. Models may still be held." },
  quiet: { title: "Not reporting", legend: "No reading has arrived. The figures shown are the "
    + "last that did." },
  thrashing: { title: "Streaming thrash", legend: "Weights are being fetched again as fast as "
    + "they are dropped." },
};

function activityLegend() {
  const list = el("dl", "om-facts");
  for (const [state, look] of Object.entries(ACTIVITY_LOOK)) {
    if (!look.legend) continue;
    const term = el("dt");
    term.appendChild(el("span", `om-orb om-orb-${state}`));
    term.appendChild(document.createTextNode(` ${look.title}`));
    list.appendChild(term);
    list.appendChild(el("dd", null, look.legend));
  }
  return list;
}

function openActivityLegend() {
  chooseAction("What the light means", "", [], { wide: true, extra: activityLegend() });
}

function buildActivityOrb() {
  const orb = el("span", "om-orb om-orb-idle");
  orb.setAttribute("role", "img");
  orb.tabIndex = 0;
  liveTip(orb, () => orb._say || "");
  orb.onclick = (event) => { event.stopPropagation(); openActivityLegend(); };
  orb.onkeydown = (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    event.stopPropagation();
    openActivityLegend();
  };
  orb.tell = (activity, quietFor = 0, state = "") => {
    const look = quietFor ? "quiet" : (ACTIVITY_LOOK[activity?.state] ? activity.state : "idle");
    const say = LINK_SAY[state];
    if (orb._state !== look) {
      orb._state = look;
      orb.className = `om-orb om-orb-${look}`;
    }
    const label = quietFor
      ? `Not reporting: ${quietText(quietFor)}`
      : (activity?.label || ACTIVITY_LOOK[look].title);
    const detail = quietFor
      ? (say?.tip || "No reading has arrived; the figures shown are the last that did.")
      : (activity?.detail || "");
    orb._say = { lead: label, facts: quietFor ? [] : (activity?.facts || []), lines: [detail] };
    orb.setAttribute("aria-label", label);
  };
  orb.tell(null);
  return orb;
}

function openMemoryPanel() {
  const shown = floatingPanel("memory");
  if (shown?.isMinimised?.()) { shown.present(); return shown; }
  if (shown) { closeFloatingPanel("memory"); return null; }

  let latest = null;
  const panel = createFloatingPanel({
    key: "memory", title: "Memory", ...windowSize("memory"),
    modal: !asWindow("memory"),
    onClose: () => shutDown(),
  });
  panel.setMaskIcon(ICON_MEMORY, { bar: false });
  const summary = el("div", "om-dl-summary", "");
  panel.bar.querySelector(".om-float-badge").appendChild(summary);

  const orb = buildActivityOrb();
  orb.classList.add("om-orb-mark");
  panel.bar.insertBefore(orb, panel.bar.querySelector(".om-float-title"));

  const freeing = async (what) => {
    const running = latest?.activity?.state && latest.activity.state !== "idle";
    const facts = [...what.facts];
    if (running) {
      facts.push(["Running right now", latest.activity.detail || "A prompt is going through."]);
    }
    const go = await chooseAction(what.ask, what.warning,
      [{ key: "go", label: what.action, primary: true }], { wide: true, facts });
    if (!go) return;
    const answer = await dlPost("/monitor/free", what.body);
    if (!answer?.ok) {
      notify("Not freed", answer?.reason || "ComfyUI would not take the request.");
      return;
    }
    toast(answer.did || "Asked ComfyUI to free memory.", { kind: "ok" });
    setTimeout(() => loadModels(), 1200);
  };

  const tools = panel.tools;
  const clearVram = el("button", "om-btn om-dl-btn", "Clear VRAM");
  clearVram.title = "Unload every model on the card. They load again when a prompt needs them.";
  clearVram.onclick = () => freeing({
    ask: "Clear VRAM?",
    warning: "This clears VRAM regardless of what is using it.",
    action: "Clear VRAM",
    body: { vram: true },
    facts: [
      ["Unloads", "Every model ComfyUI is holding, in use or not"],
      ["A run in progress", "May fail, or stall while it loads what it needs again"],
      ["Keeps", "The cached results of the last run"],
    ],
  });
  tools.appendChild(clearVram);

  const clearRam = el("button", "om-btn om-dl-btn", "Clear RAM");
  clearRam.title = "Clear the cached results of the last run and unload every model.";
  clearRam.onclick = () => freeing({
    ask: "Clear RAM?",
    warning: "This clears RAM regardless of what is using it, and takes the models with it.",
    action: "Clear RAM",
    body: { ram: true },
    facts: [
      ["Clears", "The cached results of the last run, in use or not"],
      ["Also unloads", "Every model"],
      ["A run in progress", "May fail, or repeat work it had kept"],
    ],
  });
  tools.appendChild(clearRam);

  const body = el("div", "om-dl-body om-mem-body");

  const linkRow = buildLinkRow(() => relink());
  body.appendChild(linkRow);

  const relink = async () => {
    linkRow.working("Asking the server...");
    dropMonitorCalls();
    let answer = null;
    try {
      answer = await monPost("/monitor",
        { client: MEMORY_CLIENT, interval: 1, watch: true }, LINK_DEADLINE);
    } catch {
      answer = null;
    }
    if (answer) {
      linkLeased(answer);
      if (answer.reading) takeReading(answer.reading);
      loadModels();
    }
    if (answer && !pushStale()) {
      linkRow.settled("Reconnected.", false);
      return;
    }
    reviveSocket(true);
    linkRow.free();
    paint();
  };

  const graphs = [
    buildGraphBlock("cpu", "CPU", "#58a6ff"),
    buildGraphBlock("ram", "System memory", "#3fb950"),
    buildGraphBlock("vram", "Graphics memory", "#a371f7"),
  ];
  for (const one of graphs) body.appendChild(one.box);

  body.appendChild(memoryBar("Models held").bar);
  const modelList = el("div", "om-dl-list om-mem-models");
  body.appendChild(modelList);
  panel.body.appendChild(body);

  const showEmpty = () => {
    if (modelList._got) return;
    const say = LINK_SAY[linkState()];
    const line = say ? say.line : "Reading what is in memory";
    if (modelList._line === line) return;
    modelList._line = line;
    modelList.replaceChildren(el("div", "om-mem-empty", line));
  };
  showEmpty();

  const paint = () => {
    if (!panel.el.isConnected) return;
    for (const one of graphs) {
      const series = memoryHistory[one.key];
      if (!one.folded()) drawGraph(one.canvas, series, one.colour);
      one.value.textContent = series.length ? `${Math.round(series[series.length - 1])}%` : "-";
    }
    const state = linkState();
    linkRow.tell(state);
    showEmpty();
    const quietFor = readingQuiet() ? readingAge() : 0;
    body.classList.toggle("om-mem-quiet", !!quietFor);
    if (quietFor) {
      orb.tell(latest?.activity, quietFor, state);
      const say = LINK_SAY[state];
      graphs[0].detail.textContent = say
        ? `${quietText(quietFor)}: ${say.short}`
        : quietText(quietFor);
      return;
    }
    if (!latest) return;
    if (latest.ram?.total) {
      graphs[1].detail.textContent =
        `${bytesText(latest.ram.used)} of ${bytesText(latest.ram.total)} · ${bytesText(latest.ram.free)} free`;
    }
    if (latest.vram?.total) {
      const busy = typeof latest.vram.util === "number"
        ? ` · ${latest.vram.util}% busy`
          + (typeof latest.vram.mem_util === "number"
            ? `, ${latest.vram.mem_util}% memory traffic` : "")
        : "";
      const hot = typeof latest.vram.temp === "number" ? ` · ${latest.vram.temp}°C` : "";
      const others = (latest.devices || []).slice(1)
        .map((one) => `GPU${one.index} ${meterText(one.used, one.total)}`
                      + (typeof one.temp === "number" ? ` ${one.temp}°` : ""))
        .join(" · ");
      graphs[2].detail.textContent =
        `${bytesText(latest.vram.used)} of ${bytesText(latest.vram.total)}${busy}${hot} · ${latest.vram.name}`
        + (others ? `. Also ${others}` : "");
    }
    orb.tell(latest.activity);
    const cores = latest.cores?.length;
    const hottest = (latest.cpu_temps || [])[0];
    graphs[0].detail.textContent = [
      cores ? `${cores} logical processors` : "",
      cores ? `busiest ${Math.round(Math.max(...latest.cores))}%` : "",
      hottest ? `${hottest.label} ${hottest.temp}°C` : "",
    ].filter(Boolean).join(" · ");
  };

  panel.el.addEventListener("om-float-resize", () => { paint(); repaintBlockMaps(panel.el); });

  const onReading = (reading) => {
    latest = reading;
    paint();
  };
  readingHooks.add(onReading);

  async function loadModels() {
    if (!panel.el.isConnected || panel._loading) return;
    panel._loading = true;
    let found;
    try {
      found = await monGet("/monitor/models", LINK_DEADLINE);
    } catch {
      if (panel.el.isConnected) showEmpty();
      return;
    } finally {
      panel._loading = false;
    }
    if (!panel.el.isConnected) return;
    try {
      const rows = found.models || [];
      const totals = found.totals || {};
      modelList._got = true;
      summary.textContent = rows.length
        ? `${rows.length} held · ${bytesText(totals.resident || 0)} resident of ${bytesText(totals.total || 0)}`
        : "";
      if (!rows.length) {
        modelList._shape = "";
        modelList.replaceChildren(el("div", "om-mem-empty", "No managed models in memory"));
        return;
      }
      const shape = rows.map((one) => one.name).join("|");
      if (modelList._shape !== shape) {
        modelList._shape = shape;
        const built = rows.map((one, position) =>
          buildMemoryModelRow({ ...one, index: position }, loadModels));
        for (const row of built) watchRow(row);
        modelList.replaceChildren(...built, ...releasedRows(rows));
      } else {
        const built = [...modelList.children].filter((node) => !node._released);
        rows.forEach((one, position) =>
          built[position]?._update?.({ ...one, index: position }));
      }
    } catch {
      modelList._got = true;
      modelList.replaceChildren(
        el("div", "om-dl-note om-dl-bad", "Could not draw the models held."));
    }
  }

  const released = new Map();
  const releasedRows = (live) => {
    const names = new Set(live.map((one) => one.name));
    for (const node of [...modelList.children]) {
      if (node._released || !node._name || names.has(node._name)) continue;
      node._released = true;
      node.classList.add("om-mem-gone");
      node.querySelector(".om-mem-split")?.classList.add("om-mem-gone-bar");
      const drop = node.querySelector(".om-mem-drop");
      if (drop) {
        drop.textContent = "Dismiss";
        drop.title = "Remove this card. The model is already gone.";
        drop.onclick = () => { released.delete(node._name); node.remove(); };
      }
      node.querySelector(".om-dl-where")?.appendChild(
        el("span", "om-dl-src om-dl-bad", "released"));
      released.set(node._name, node);
    }
    for (const [name, node] of released) {
      if (names.has(name)) { released.delete(name); node.remove(); }
    }
    return [...released.values()];
  };

  const watching = new IntersectionObserver((entries) => {
    for (const entry of entries) entry.target._inView = entry.isIntersecting;
  }, { root: modelList, rootMargin: "40px" });
  const watchRow = (row) => { row._inView = true; watching.observe(row); };
  const asleep = () => document.hidden || panel.isMinimised?.() === true;

  const heatTick = () => {
    if (!panel.el.isConnected || asleep()) return;
    for (const row of modelList.children) {
      if (row._released || !row._inView) continue;
      if (row._streaming || row._busy) row._blocks?.();
    }
  };

  const renew = () => {
    if (!panel.el.isConnected) return;
    if (asleep()) {
      if (!panel._asleep) {
        panel._asleep = true;
        monRelease(MEMORY_CLIENT);
      }
      return;
    }
    panel._asleep = false;
    if (panel._renewing || !linkMayPost()) return;
    panel._renewing = true;
    monPost("/monitor", { client: MEMORY_CLIENT, interval: 1, watch: true }, LINK_DEADLINE)
      .then((answer) => {
        linkLeased(answer);
        if (answer?.reading) takeReading(answer.reading);
      })
      .catch(() => { paint(); })
      .finally(() => { panel._renewing = false; linkTick(); });
  };
  panel._tick = setInterval(() => {
    renew();
    if (!asleep()) loadModels();
    paint();
  }, 3000);
  panel._heat = setInterval(heatTick, 1000);
  const wake = () => {
    if (asleep()) return;
    renew();
    loadModels();
    paint();
  };
  document.addEventListener("visibilitychange", wake);
  panel.el.addEventListener("om-win:minimise", () => renew());
  panel.el.addEventListener("om-win:restore", () => {
    wake();
    repaintBlockMaps(panel.el);
  });
  renew();
  loadModels();
  paint();

  const shutDown = () => {
    readingHooks.delete(onReading);
    document.removeEventListener("visibilitychange", wake);
    clearInterval(panel._tick);
    clearInterval(panel._heat);
    clearInterval(watcher);
    watching.disconnect();
    monRelease(MEMORY_CLIENT);
  };
  const stopWatching = () => {
    if (panel.el.isConnected) return;
    shutDown();
  };
  const watcher = setInterval(stopWatching, 2000);
  return panel;
}

export { readingAge, readingQuiet, quietText, recordReading, openMemoryPanel };
