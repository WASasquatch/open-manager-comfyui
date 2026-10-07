const ORDERS = [
  ["workflow", "Workflow order"],
  ["longest", "Longest first"],
  ["shortest", "Shortest first"],
  ["change", "Largest difference"],
];

const SERIES = ["#58a6ff", "#f0883e", "#bc8cff", "#39c5cf", "#f778ba", "#d29922"];

const KEEP = 48;

const PAINT_EVERY = 30;

const MINUS = "−";

function clock() {
  return performance.now() / 1000;
}

function span(seconds) {
  const value = Math.max(0, Number(seconds) || 0);
  if (value < 0.0005) return "<1ms";
  if (value < 0.9995) return `${Math.round(value * 1000)}ms`;
  if (value < 59.95) return `${value.toFixed(value < 9.995 ? 2 : 1)}s`;
  const whole = Math.floor(value);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  if (hours) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  return `${minutes}m ${String(whole % 60).padStart(2, "0")}s`;
}

function signed(diff) {
  if (Math.abs(diff) < 0.0005) return "±0";
  return `${diff < 0 ? MINUS : "+"}${span(Math.abs(diff))}`;
}

function idParts(id) {
  return String(id).split(":").map((part) => (/^\d+$/.test(part) ? Number(part) : part));
}

function byParts(left, right) {
  for (let at = 0; at < Math.max(left.length, right.length); at += 1) {
    const one = left[at];
    const two = right[at];
    if (one === undefined) return -1;
    if (two === undefined) return 1;
    if (one === two) continue;
    if (typeof one === "number" && typeof two === "number") return one - two;
    if (typeof one === "number") return -1;
    if (typeof two === "number") return 1;
    return String(one).localeCompare(String(two));
  }
  return 0;
}

export const program = {
  open(api) {
    const win = api.window({ size: "memory", title: "Timer" });
    const state = {
      available: true,
      failed: false,
      runs: new Map(),
      order: "workflow",
      follow: true,
      chosen: [],
      browse: null,
      active: api.graph.workflow(),
    };
    const view = { rows: new Map(), groups: new Map(), chips: new Map(), keys: [], series: [],
                   model: [], order: [], status: "", shown: "", painted: 0 };
    let dirty = true;
    let frame = 0;
    let queue = null;
    let loads = 0;

    const order = api.el("select", "om-side-select tm-order");
    for (const [value, label] of ORDERS) {
      const option = api.el("option", null, label);
      option.value = value;
      order.appendChild(option);
    }
    const changeOption = order.querySelector("option[value=\"change\"]");
    const follow = api.el("button", "om-btn tm-follow", "Follow");
    follow.type = "button";
    follow.title = "Show the workflow open on the graph.";
    win.tools.appendChild(order);
    win.tools.appendChild(follow);

    const wrap = api.el("div", "tm");
    const tabs = api.el("div", "tm-tabs");
    tabs.setAttribute("role", "tablist");
    const strip = api.el("div", "tm-runs");
    strip.setAttribute("role", "tablist");
    strip.setAttribute("aria-multiselectable", "true");
    const legend = api.el("div", "tm-legend");
    const list = api.el("div", "tm-list");
    const none = api.el("div", "tm-none");
    const status = api.el("div", "tm-status");
    wrap.append(tabs, strip, legend, list, status);
    win.body.appendChild(wrap);

    const elapsedOf = (run) => (run.state === "running" ? clock() - run.anchor : run.elapsed);

    const timeOf = (run, entry) => {
      if (!entry || (entry.state === "cached" && !entry.runs)) return null;
      if (entry.open === null || run.state !== "running") return entry.spent;
      return entry.spent + Math.max(0, elapsedOf(run) - entry.open);
    };

    const groupOf = (run) => run.path || (run.workflow ? `id\u0000${run.workflow}` : "");

    const nameOf = (run) => run.name || (run.workflow ? "Workflow" : "API");

    const runsOf = (group) => [...state.runs.values()].filter((run) => groupOf(run) === group)
      .sort((a, b) => a.started - b.started);

    const groupsOf = () => {
      const groups = new Map();
      for (const run of state.runs.values()) {
        const key = groupOf(run);
        if (!groups.has(key)) groups.set(key, { key, runs: [] });
        groups.get(key).runs.push(run);
      }
      for (const group of groups.values()) group.runs.sort((a, b) => a.started - b.started);
      return [...groups.values()].sort((a, b) => (a.runs[0].started - b.runs[0].started)
        || a.key.localeCompare(b.key));
    };

    const numberOf = (run) => runsOf(groupOf(run)).indexOf(run) + 1;

    const labelOf = (run) => `${nameOf(run)} #${numberOf(run)}`;

    const isActive = (run) => {
      if (run.path) return run.path === state.active.path;
      return !!run.workflow && run.workflow === state.active.id;
    };

    const shownKeys = () => {
      if (state.follow) {
        const latest = [...state.runs.values()].filter(isActive)
          .sort((a, b) => b.started - a.started)[0];
        return latest ? [latest.id] : [];
      }
      return state.chosen.filter((key) => state.runs.has(key));
    };

    const wake = () => {
      if (!frame) frame = requestAnimationFrame(tick);
    };

    const take = (header, nodes) => {
      if (!header || typeof header !== "object" || !header.id) return;
      const key = String(header.id);
      let run = state.runs.get(key);
      if (!run) {
        run = { id: key, workflow: "", path: "", name: "", started: Number(header.started) || 0,
                state: "running", elapsed: 0, anchor: clock(), seq: -1, nodes: new Map() };
        state.runs.set(key, run);
      }
      if ((Number(header.seq) || 0) >= run.seq) {
        run.seq = Number(header.seq) || 0;
        run.workflow = String(header.workflow || "");
        run.path = String(header.path || "");
        run.name = String(header.name || "");
        run.state = String(header.state || "done");
        run.elapsed = Number(header.elapsed) || 0;
        run.anchor = clock() - run.elapsed;
      }
      for (const entry of Array.isArray(nodes) ? nodes : []) {
        const id = String(entry?.id ?? "");
        if (!id) continue;
        const held = run.nodes.get(id);
        if (held && (Number(entry.seq) || 0) < held.seq) continue;
        run.nodes.set(id, {
          id,
          type: String(entry.type || ""),
          title: String(entry.title || ""),
          state: String(entry.state || ""),
          spent: Number(entry.spent) || 0,
          open: entry.open === null || entry.open === undefined ? null : Number(entry.open),
          runs: Number(entry.runs) || 0,
          seq: Number(entry.seq) || 0,
        });
      }
      if (state.runs.size > KEEP) {
        const idle = [...state.runs.values()].filter((one) => one.state !== "running")
          .sort((a, b) => a.started - b.started);
        while (state.runs.size > KEEP && idle.length) state.runs.delete(idle.shift().id);
      }
    };

    const drop = (key) => {
      state.runs.delete(key);
      if (state.chosen.includes(key)) {
        state.chosen = state.chosen.filter((one) => one !== key);
        if (!state.chosen.length) state.follow = true;
      }
      if (state.browse !== null && !runsOf(state.browse).length) state.browse = null;
      dirty = true;
      wake();
    };

    const load = async () => {
      const ticket = ++loads;
      queue = [];
      const answer = await api.timing.read();
      if (ticket !== loads) return;
      const waiting = queue;
      queue = null;
      state.failed = answer.ok === false;
      state.available = answer.available !== false;
      state.runs = new Map();
      for (const run of answer.runs || []) take(run, run.nodes);
      for (const detail of waiting) apply(detail);
      dirty = true;
      wake();
    };

    const apply = (detail) => {
      if (detail === null) {
        void load();
        return;
      }
      if (!detail || typeof detail !== "object") return;
      if (queue) {
        queue.push(detail);
        return;
      }
      if (Object.hasOwn(detail, "forgot")) {
        drop(String(detail.forgot || ""));
        return;
      }
      take(detail.run, detail.nodes);
      dirty = true;
      wake();
    };

    const focusNode = async (key, id) => {
      const run = state.runs.get(key);
      if (!run) return;
      const outcome = await api.graph.focus(id, { path: run.path, workflow: run.workflow });
      if (outcome === "closed") api.toast(`${nameOf(run)} is not open.`, { kind: "warn" });
      else if (outcome === "missing") api.toast(`No node #${id} in ${nameOf(run)}.`, { kind: "warn" });
    };

    const forget = async (key) => {
      if (await api.timing.forget(key)) drop(key);
    };

    const forgetGroup = async (group) => {
      for (const run of runsOf(group)) {
        if (run.state !== "running") await forget(run.id);
      }
    };

    const pickRun = (key, add) => {
      const run = state.runs.get(key);
      if (!run) return;
      state.browse = groupOf(run);
      if (add) {
        const base = shownKeys();
        state.chosen = base.includes(key) ? base.filter((one) => one !== key) : [...base, key];
        state.follow = !state.chosen.length;
      } else {
        state.chosen = [key];
        state.follow = false;
      }
      dirty = true;
      wake();
    };

    const pickGroup = (group, add) => {
      const runs = runsOf(group);
      if (!runs.length) return;
      const latest = runs[runs.length - 1].id;
      const base = shownKeys();
      state.browse = group;
      if (add) {
        const mine = base.filter((key) => groupOf(state.runs.get(key)) === group);
        state.chosen = mine.length ? base.filter((key) => !mine.includes(key)) : [...base, latest];
      } else {
        state.chosen = base.length > 1 ? base : [latest];
      }
      state.follow = !state.chosen.length;
      dirty = true;
      wake();
    };

    const browsedOf = (series) => {
      if (series.length > 1 && state.browse !== null && runsOf(state.browse).length) {
        return state.browse;
      }
      const last = series[series.length - 1]?.run;
      return last ? groupOf(last) : null;
    };

    const tipOf = (row) => {
      if (!row) return null;
      const many = view.series.length > 1;
      const facts = [["Type", row.type || "unknown"], ["Node", `#${row.id}`]];
      view.series.forEach((one, at) => {
        const entry = row.cells[at];
        const value = row.values[at];
        const said = !entry ? "not run" : value === null ? "cached" : span(value);
        facts.push([many ? labelOf(one.run) : "Time", said]);
        if (!many && entry?.runs > 1) facts.push(["Runs", String(entry.runs)]);
      });
      return { lead: row.title || row.type || `Node ${row.id}`, facts };
    };

    const makeRow = () => {
      const box = api.el("div", "tm-row");
      box.tabIndex = 0;
      box.setAttribute("role", "button");
      const head = api.el("div", "tm-head");
      const id = api.el("span", "tm-id");
      const name = api.el("span", "tm-name");
      const note = api.el("span", "tm-note");
      head.append(id, name, note);
      box.appendChild(head);
      const held = { box, id, name, note, lines: [], row: null };
      api.tip(box, () => tipOf(held.row));
      return held;
    };

    const makeLine = () => {
      const line = api.el("div", "tm-line");
      const track = api.el("div", "tm-track");
      const fill = api.el("div", "tm-fill");
      track.appendChild(fill);
      const time = api.el("span", "tm-time");
      const extra = api.el("span", "tm-extra");
      line.append(track, time, extra);
      return { line, fill, time, extra, width: -1, text: "", more: "", tone: "", lean: "" };
    };

    const reveal = (row, item) => {
      const left = item.offsetLeft;
      const right = left + item.offsetWidth;
      if (left < row.scrollLeft) row.scrollLeft = Math.max(0, left - 6);
      else if (right > row.scrollLeft + row.clientWidth) {
        row.scrollLeft = right - row.clientWidth + 6;
      }
    };

    const keyed = (host, held, wanted, make) => {
      for (const [key, one] of held) {
        if (wanted.has(key)) continue;
        one.node.remove();
        held.delete(key);
      }
      let at = 0;
      for (const key of wanted.keys()) {
        if (!held.has(key)) held.set(key, make(key));
        const node = held.get(key).node;
        if (host.children[at] !== node) host.insertBefore(node, host.children[at] || null);
        at += 1;
      }
    };

    const runTip = (key) => () => {
      const run = state.runs.get(key);
      if (!run) return null;
      return {
        lead: labelOf(run),
        facts: [
          ["Started", new Date(run.started * 1000).toLocaleTimeString()],
          ["Took", span(elapsedOf(run))],
          ["Nodes", String(run.nodes.size)],
          run.state === "done" ? null : ["State", run.state],
        ].filter(Boolean),
      };
    };

    const makeGroup = (key) => {
      const node = api.el("div", "tm-tab");
      node.setAttribute("role", "tab");
      node.tabIndex = 0;
      node.dataset.key = key;
      const dot = api.el("span", "tm-dot");
      const name = api.el("span", "tm-tab-name");
      const count = api.el("span", "tm-tab-count");
      const shut = api.el("button", "tm-tab-x", "×");
      shut.type = "button";
      shut.tabIndex = -1;
      node.append(dot, name, count, shut);
      api.tip(node, () => {
        const runs = runsOf(key);
        if (!runs.length) return null;
        const latest = runs[runs.length - 1];
        return {
          lead: nameOf(latest),
          facts: [
            latest.path ? ["Workflow", latest.path] : null,
            ["Runs", String(runs.length)],
            ["Latest", span(elapsedOf(latest))],
          ].filter(Boolean),
        };
      });
      return { node, name, count, shut };
    };

    const makeChip = (key) => {
      const node = api.el("div", "tm-run");
      node.setAttribute("role", "tab");
      node.tabIndex = 0;
      node.dataset.key = key;
      const dot = api.el("span", "tm-dot");
      const number = api.el("span", "tm-run-number");
      const time = api.el("span", "tm-run-time");
      const shut = api.el("button", "tm-tab-x", "×");
      shut.type = "button";
      shut.tabIndex = -1;
      node.append(dot, number, time, shut);
      api.tip(node, runTip(key));
      return { node, number, time, shut, text: "" };
    };

    const drawTabs = (series, browsed) => {
      const compare = series.length > 1;
      const picked = new Map(series.map((one) => [one.key, one]));
      const tinted = new Map();
      for (const one of series) {
        const group = groupOf(one.run);
        if (!tinted.has(group)) tinted.set(group, one.colour);
      }
      const groups = groupsOf();
      keyed(tabs, view.groups, new Map(groups.map((group) => [group.key, group])), makeGroup);
      for (const group of groups) {
        const held = view.groups.get(group.key);
        const latest = group.runs[group.runs.length - 1];
        const name = nameOf(latest);
        if (held.name.textContent !== name) held.name.textContent = name;
        const count = group.runs.length > 1 ? String(group.runs.length) : "";
        if (held.count.textContent !== count) held.count.textContent = count;
        const live = group.runs.some((run) => run.state === "running");
        held.shut.title = `Forget ${name}`;
        held.shut.setAttribute("aria-label", `Forget ${name}`);
        held.shut.hidden = live;
        held.node.classList.toggle("tm-tab-on", group.key === browsed);
        held.node.classList.toggle("tm-tab-picked", tinted.has(group.key));
        held.node.classList.toggle("tm-tab-live", live);
        held.node.classList.toggle("tm-tab-bad", latest.state === "error");
        held.node.setAttribute("aria-selected", group.key === browsed ? "true" : "false");
        if (compare && tinted.has(group.key)) held.node.style.setProperty("--tm-c", tinted.get(group.key));
        else held.node.style.removeProperty("--tm-c");
      }
      tabs.hidden = !groups.length;

      const runs = browsed === null ? [] : runsOf(browsed);
      keyed(strip, view.chips, new Map(runs.map((run) => [run.id, run])), makeChip);
      runs.forEach((run, at) => {
        const held = view.chips.get(run.id);
        const number = `#${at + 1}`;
        if (held.number.textContent !== number) held.number.textContent = number;
        held.shut.title = `Forget ${labelOf(run)}`;
        held.shut.setAttribute("aria-label", `Forget ${labelOf(run)}`);
        held.shut.hidden = run.state === "running";
        const one = picked.get(run.id);
        held.node.classList.toggle("tm-run-on", !!one);
        held.node.classList.toggle("tm-run-live", run.state === "running");
        held.node.classList.toggle("tm-run-bad", run.state === "error");
        held.node.setAttribute("aria-selected", one ? "true" : "false");
        if (one && compare) held.node.style.setProperty("--tm-c", one.colour);
        else held.node.style.removeProperty("--tm-c");
      });
      strip.hidden = !runs.length;

      const shown = `${browsed}\u0000${series.map((one) => one.key).join("\u0000")}`;
      if (shown !== view.shown) {
        view.shown = shown;
        const tab = browsed === null ? null : view.groups.get(browsed)?.node;
        const chip = series.length ? view.chips.get(series[series.length - 1].key)?.node : null;
        requestAnimationFrame(() => {
          if (tab) reveal(tabs, tab);
          if (chip) reveal(strip, chip);
        });
      }
    };

    const drawLegend = (series) => {
      legend.replaceChildren();
      view.keys = [];
      if (series.length < 2) return;
      for (const one of series) {
        const key = api.el("div", "tm-key");
        key.style.setProperty("--tm-c", one.colour);
        const total = api.el("span", "tm-key-time");
        const delta = api.el("span", "tm-key-delta");
        key.append(api.el("span", "tm-swatch"), api.el("span", "tm-key-name", labelOf(one.run)),
                   total, delta);
        legend.appendChild(key);
        view.keys.push({ one, total, delta, text: "", more: "", lean: "" });
      }
    };

    const modelOf = (series) => {
      const compare = series.length > 1;
      const rows = new Map();
      series.forEach((one, at) => {
        for (const entry of one.run.nodes.values()) {
          const key = compare ? `${entry.id}\u0000${entry.type}` : entry.id;
          let row = rows.get(key);
          if (!row) {
            row = { key, id: entry.id, type: entry.type, title: entry.title,
                    parts: idParts(entry.id), cells: series.map(() => null),
                    values: series.map(() => null), rank: null };
            rows.set(key, row);
          }
          if (!row.title && entry.title) row.title = entry.title;
          row.cells[at] = entry;
        }
      });
      return [...rows.values()];
    };

    const toneOf = (run, entry) => {
      if (!entry) return "none";
      if (entry.open !== null && run.state === "running") return "live";
      if (entry.state === "error") return "error";
      if (entry.state === "stopped") return "stopped";
      if (entry.state === "cached" && !entry.runs) return "cached";
      return "";
    };

    const drawNone = (series) => {
      let text = "";
      if (state.failed) text = "The timings could not be read.";
      else if (!state.available) text = "Node timing is not available in this ComfyUI.";
      else if (!state.runs.size) text = "No runs yet.";
      else if (!series.length) text = "Not run yet.";
      none.textContent = text;
      if (text) list.appendChild(none);
      else none.remove();
    };

    const build = () => {
      dirty = false;
      if (!state.follow && !state.chosen.some((key) => state.runs.has(key))) {
        state.follow = true;
        state.chosen = [];
      }
      const series = shownKeys().map((key, at) => ({
        key, run: state.runs.get(key), colour: SERIES[at % SERIES.length],
      }));
      const compare = series.length > 1;
      view.series = series;
      wrap.classList.toggle("tm-compare", compare);
      follow.setAttribute("aria-pressed", state.follow ? "true" : "false");
      follow.classList.toggle("tm-follow-on", state.follow);
      changeOption.hidden = !compare;
      changeOption.disabled = !compare;
      if (!compare && state.order === "change") state.order = "longest";
      if (order.value !== state.order) order.value = state.order;
      drawTabs(series, browsedOf(series));
      drawLegend(series);
      view.model = modelOf(series);
      const seen = new Set();
      for (const row of view.model) {
        let held = view.rows.get(row.key);
        if (!held) {
          held = makeRow();
          view.rows.set(row.key, held);
        }
        seen.add(row.key);
        held.row = row;
        held.box.dataset.key = row.key;
        const idText = `#${row.id}`;
        if (held.id.textContent !== idText) held.id.textContent = idText;
        const name = row.title || row.type || `Node ${row.id}`;
        if (held.name.textContent !== name) held.name.textContent = name;
        let note = "";
        if (!compare) {
          const entry = row.cells[0];
          if (entry.state === "error") note = "failed";
          else if (entry.state === "stopped") note = "stopped";
          else if (entry.runs > 1) note = `×${entry.runs}`;
        }
        if (held.note.textContent !== note) held.note.textContent = note;
        held.note.classList.toggle("tm-note-bad", note === "failed");
        while (held.lines.length < series.length) {
          const line = makeLine();
          held.lines.push(line);
          held.box.appendChild(line.line);
        }
        while (held.lines.length > series.length) held.lines.pop().line.remove();
        held.lines.forEach((line, at) => {
          line.line.dataset.at = String(at);
          if (compare) line.line.style.setProperty("--tm-c", series[at].colour);
          else line.line.style.removeProperty("--tm-c");
          const tone = toneOf(series[at].run, row.cells[at]);
          if (tone !== line.tone) {
            line.line.className = `tm-line${tone ? ` tm-line-${tone}` : ""}`;
            line.tone = tone;
          }
        });
      }
      for (const [key, held] of view.rows) {
        if (seen.has(key)) continue;
        held.box.remove();
        view.rows.delete(key);
      }
      view.order = [];
      drawNone(series);
    };

    const rankOf = (row) => {
      const present = row.values.filter((value) => value !== null);
      if (!present.length) return null;
      if (state.order === "shortest") return Math.min(...present);
      if (state.order === "change") {
        const base = row.values[0];
        const rest = row.values.slice(1).filter((value) => value !== null);
        if (base === null || !rest.length) return null;
        return Math.max(...rest.map((value) => Math.abs(value - base)));
      }
      return Math.max(...present);
    };

    const compareRows = (a, b) => {
      if (state.order !== "workflow") {
        if (a.rank === null && b.rank !== null) return 1;
        if (b.rank === null && a.rank !== null) return -1;
        if (a.rank !== null && b.rank !== null && a.rank !== b.rank) {
          return state.order === "shortest" ? a.rank - b.rank : b.rank - a.rank;
        }
      }
      return byParts(a.parts, b.parts) || a.type.localeCompare(b.type);
    };

    const sideOf = (diff) => (Math.abs(diff) < 0.0005 ? "" : diff < 0 ? "faster" : "slower");

    const lean = (held, node, side) => {
      if (side === held.lean) return;
      node.classList.toggle("tm-faster", side === "faster");
      node.classList.toggle("tm-slower", side === "slower");
      held.lean = side;
    };

    const paint = () => {
      const series = view.series;
      const compare = series.length > 1;
      let top = 0;
      for (const row of view.model) {
        series.forEach((one, at) => {
          const value = timeOf(one.run, row.cells[at]);
          row.values[at] = value;
          if (value !== null && value > top) top = value;
        });
        row.rank = rankOf(row);
      }
      const total = series.length === 1 ? elapsedOf(series[0].run) : 0;
      for (const row of view.model) {
        const held = view.rows.get(row.key);
        if (!held) continue;
        held.lines.forEach((line, at) => {
          const value = row.values[at];
          const width = value !== null && top > 0 ? (value / top) * 100 : 0;
          if (Math.abs(width - line.width) >= 0.05) {
            line.fill.style.width = `${width.toFixed(2)}%`;
            line.width = width;
          }
          const text = value !== null ? span(value) : row.cells[at] ? "cached" : "not run";
          if (text !== line.text) {
            line.time.textContent = text;
            line.text = text;
          }
          let more = "";
          let side = "";
          if (!compare) {
            if (value !== null && total > 0) {
              const share = (value / total) * 100;
              more = share < 1 ? "<1%" : `${Math.round(share)}%`;
            }
          } else if (at > 0 && value !== null && row.values[0] !== null) {
            const diff = value - row.values[0];
            more = signed(diff);
            side = sideOf(diff);
          }
          if (more !== line.more) {
            line.extra.textContent = more;
            line.more = more;
          }
          lean(line, line.extra, side);
        });
      }
      const sorted = [...view.model].sort(compareRows).map((row) => row.key);
      if (sorted.length !== view.order.length
          || sorted.some((key, at) => key !== view.order[at])) {
        sorted.forEach((key, at) => {
          const box = view.rows.get(key).box;
          if (list.children[at] !== box) list.insertBefore(box, list.children[at] || null);
        });
        view.order = sorted;
      }
      for (const [key, held] of view.chips) {
        const run = state.runs.get(key);
        if (!run) continue;
        const text = span(elapsedOf(run));
        if (text !== held.text) {
          held.time.textContent = text;
          held.text = text;
        }
      }
      const base = view.keys.length ? elapsedOf(view.keys[0].one.run) : 0;
      view.keys.forEach((key, at) => {
        const spent = elapsedOf(key.one.run);
        const text = span(spent);
        if (text !== key.text) {
          key.total.textContent = text;
          key.text = text;
        }
        let more = "";
        let side = "";
        if (at > 0 && base > 0) {
          const diff = spent - base;
          const share = Math.round((Math.abs(diff) / base) * 100);
          more = `${signed(diff)} (${diff < 0 ? MINUS : "+"}${share}%)`;
          side = sideOf(diff);
        }
        if (more !== key.more) {
          key.delta.textContent = more;
          key.more = more;
        }
        lean(key, key.delta, side);
      });
      let said = "";
      if (series.length === 1) {
        const run = series[0].run;
        let ran = 0;
        let cached = 0;
        for (const entry of run.nodes.values()) {
          if (entry.state === "cached" && !entry.runs) cached += 1;
          else ran += 1;
        }
        const parts = [api.count(ran, "node")];
        if (cached) parts.push(`${cached} cached`);
        parts.push(span(total));
        if (run.state === "error") parts.push("failed");
        if (run.state === "stopped") parts.push("stopped");
        said = parts.join(" · ");
      } else if (series.length > 1) {
        said = `${series.length} runs`;
      }
      if (said !== view.status) {
        status.textContent = said;
        view.status = said;
      }
      status.hidden = !said;
    };

    const live = () => [...state.runs.values()].some((run) => run.state === "running");

    function tick(now) {
      frame = 0;
      if (!win.isOpen()) return;
      if (dirty || now - view.painted >= PAINT_EVERY) {
        if (dirty) build();
        paint();
        view.painted = now;
      }
      if (live()) wake();
    }

    order.addEventListener("change", () => {
      state.order = order.value;
      void api.storage.set("order", state.order);
      dirty = true;
      wake();
    });

    follow.onclick = () => {
      state.follow = true;
      state.chosen = [];
      state.browse = null;
      dirty = true;
      wake();
    };

    const adding = (event) => event.shiftKey || event.ctrlKey || event.metaKey;

    const wire = (host, selector, choose, drop) => {
      host.addEventListener("mousedown", (event) => {
        if (event.shiftKey) event.preventDefault();
      });
      host.addEventListener("click", (event) => {
        const item = event.target instanceof Element ? event.target.closest(selector) : null;
        if (!item) return;
        const key = item.dataset.key ?? "";
        if (event.target.closest(".tm-tab-x")) {
          void drop(key);
          return;
        }
        choose(key, adding(event));
      });
      host.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        const item = event.target instanceof Element ? event.target.closest(selector) : null;
        if (!item || event.target !== item) return;
        event.preventDefault();
        choose(item.dataset.key ?? "", adding(event));
      });
    };

    wire(tabs, ".tm-tab", pickGroup, forgetGroup);
    wire(strip, ".tm-run", pickRun, forget);

    const focusRow = (box, at) => {
      const row = view.rows.get(box.dataset.key)?.row;
      if (!row) return;
      const index = at >= 0 && row.cells[at] ? at : row.cells.findIndex(Boolean);
      const one = view.series[index];
      if (one) void focusNode(one.key, row.id);
    };

    list.addEventListener("click", (event) => {
      const box = event.target instanceof Element ? event.target.closest(".tm-row") : null;
      if (!box) return;
      const line = event.target.closest(".tm-line");
      focusRow(box, line ? Number(line.dataset.at) : -1);
    });

    list.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const box = event.target instanceof Element ? event.target.closest(".tm-row") : null;
      if (!box || event.target !== box) return;
      event.preventDefault();
      focusRow(box, -1);
    });

    const unwatchTiming = api.timing.watch(apply);
    const unwatchFlow = api.graph.watchWorkflow((place) => {
      state.active = place;
      if (!state.follow) return;
      dirty = true;
      wake();
    });

    win.onClose(() => {
      unwatchTiming();
      unwatchFlow();
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    });

    api.style(`
      .tm, .tm-follow { --tm-accent: var(--p-button-text-primary-color, #388bfd); }
      .tm { display: flex; flex-direction: column; flex: 1; min-height: 0; }
      .om-float-tools .om-btn.tm-follow-on { color: var(--tm-accent); border-color: var(--tm-accent);
        background: color-mix(in srgb, var(--tm-accent) 14%, var(--om-input)); }
      .tm-order { min-width: 150px; }
      .tm-tabs { position: relative; display: flex; gap: 2px; flex: none; overflow-x: auto;
        padding: 5px 6px 0; border-bottom: 1px solid var(--om-border); scrollbar-width: thin; }
      .tm-tab { display: inline-flex; align-items: center; gap: 6px; flex: none; max-width: 230px;
        padding: 5px 4px 5px 10px; border-radius: 6px 6px 0 0; cursor: pointer;
        font-size: 12px; color: var(--om-muted); user-select: none;
        border-bottom: 2px solid transparent; }
      .tm-tab:hover { background: var(--om-hover); color: var(--om-text); }
      .tm-tab:focus-visible { outline: 2px solid var(--tm-accent); outline-offset: -2px; }
      .tm-tab-on { color: var(--om-text); font-weight: 600;
        background: color-mix(in srgb, var(--om-text) 7%, transparent); }
      .tm-tab-picked { border-bottom-color: var(--tm-c, var(--tm-accent)); }
      .tm-tab-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .tm-tab-count { flex: none; min-width: 16px; padding: 0 5px; border-radius: 8px;
        font-size: 10px; font-weight: 600; line-height: 15px; text-align: center;
        background: color-mix(in srgb, var(--om-text) 12%, transparent); }
      .tm-tab-count:empty { display: none; }
      .tm-dot { display: none; flex: none; width: 6px; height: 6px; border-radius: 50%;
        background: var(--tm-accent); }
      .tm-tab-live .tm-dot, .tm-run-live .tm-dot { display: inline-block; }
      .tm-tab-x { flex: none; width: 18px; height: 18px; padding: 0; border: 0;
        border-radius: 4px; background: transparent; color: inherit; font: inherit;
        font-size: 13px; line-height: 1; cursor: pointer; opacity: 0; }
      .tm-tab:hover .tm-tab-x, .tm-tab-on .tm-tab-x,
      .tm-run:hover .tm-tab-x, .tm-run-on .tm-tab-x { opacity: .55; }
      .tm-tab-x:hover { opacity: 1; background: var(--om-hover); }
      .tm-tab-x[hidden] { display: none; }
      .tm-runs { position: relative; display: flex; gap: 5px; flex: none; overflow-x: auto;
        padding: 6px 8px; border-bottom: 1px solid var(--om-border); scrollbar-width: thin; }
      .tm-runs[hidden] { display: none; }
      .tm-run { display: inline-flex; align-items: center; gap: 5px; flex: none;
        padding: 2px 3px 2px 9px; border: 1px solid var(--om-border); border-radius: 11px;
        font-size: 11px; color: var(--om-muted); cursor: pointer; user-select: none; }
      .tm-run:hover { background: var(--om-hover); color: var(--om-text); }
      .tm-run:focus-visible { outline: 2px solid var(--tm-accent); outline-offset: 1px; }
      .tm-run-on { color: var(--om-text); border-color: var(--tm-c, var(--tm-accent));
        background: color-mix(in srgb, var(--tm-c, var(--tm-accent)) 16%, transparent); }
      .tm-run-number { font-weight: 600; }
      .tm-run-time { opacity: .8; font-variant-numeric: tabular-nums; white-space: nowrap; }
      .tm-run-bad .tm-run-time { color: #f85149; opacity: 1; }
      .tm-run .tm-tab-x { width: 16px; height: 16px; border-radius: 8px; font-size: 12px; }
      .tm-legend { display: none; flex-wrap: wrap; gap: 4px 16px; flex: none; padding: 7px 12px;
        border-bottom: 1px solid var(--om-border); font-size: 11px; }
      .tm-compare .tm-legend { display: flex; }
      .tm-key { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
      .tm-swatch { width: 10px; height: 10px; flex: none; border-radius: 3px;
        background: var(--tm-c); }
      .tm-key-name { max-width: 180px; overflow: hidden; text-overflow: ellipsis;
        white-space: nowrap; font-weight: 600; }
      .tm-key-time, .tm-key-delta { font-variant-numeric: tabular-nums; white-space: nowrap; }
      .tm-key-time { opacity: .75; }
      .tm-list { flex: 1; min-height: 0; overflow-y: auto; padding: 4px 6px 8px; }
      .tm-row { padding: 5px 8px 6px; border: 1px solid transparent; border-radius: 6px;
        cursor: pointer; }
      .tm-row:hover { background: var(--om-hover); }
      .tm-row:focus-visible { outline: none; border-color: var(--tm-accent); }
      .tm-head { display: flex; align-items: baseline; gap: 6px; min-width: 0; font-size: 12px; }
      .tm-id { flex: none; font-size: 10px; opacity: .5; font-variant-numeric: tabular-nums; }
      .tm-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        font-weight: 600; }
      .tm-note { flex: none; font-size: 10px; opacity: .6; }
      .tm-note-bad { color: #f85149; opacity: 1; }
      .tm-line { display: grid; grid-template-columns: minmax(0, 1fr) 58px 38px; gap: 8px;
        align-items: center; margin-top: 4px; }
      .tm-compare .tm-line { grid-template-columns: minmax(0, 1fr) 58px 64px; margin-top: 3px; }
      .tm-track { height: 6px; overflow: hidden; border-radius: 3px;
        background: color-mix(in srgb, var(--om-text) 9%, transparent); }
      .tm-fill { width: 0; height: 100%; border-radius: 3px;
        background: var(--tm-c, var(--tm-accent)); }
      .tm-line-live .tm-fill { background: linear-gradient(90deg, var(--tm-c, var(--tm-accent)) 0%,
        var(--tm-c, var(--tm-accent)) calc(100% - 22px),
        color-mix(in srgb, var(--tm-c, var(--tm-accent)) 35%, #fff) 100%); }
      .tm-line-live .tm-time { color: var(--tm-c, var(--tm-accent)); font-weight: 600; }
      .tm-line-error .tm-fill { background: #f85149; }
      .tm-line-stopped .tm-fill { opacity: .45; }
      .tm-line-none .tm-track { background: transparent;
        outline: 1px dashed color-mix(in srgb, var(--om-text) 18%, transparent);
        outline-offset: -1px; }
      .tm-time { font-size: 11px; text-align: right; white-space: nowrap;
        font-variant-numeric: tabular-nums; }
      .tm-line-cached .tm-time, .tm-line-none .tm-time { opacity: .5; }
      .tm-extra { font-size: 10px; text-align: right; white-space: nowrap; opacity: .6;
        font-variant-numeric: tabular-nums; }
      .tm-faster { color: #3fb950; opacity: 1; }
      .tm-slower { color: #f85149; opacity: 1; }
      .tm-none { padding: 26px; text-align: center; font-size: 12px; opacity: .6; }
      .tm-status { flex: none; padding: 5px 10px; font-size: 11px; opacity: .65;
        border-top: 1px solid var(--om-border); font-variant-numeric: tabular-nums; }
      .tm-status[hidden], .tm-tabs[hidden] { display: none; }
    `);

    void (async () => {
      const kept = await api.storage.get("order", "workflow");
      if (ORDERS.some(([value]) => value === kept) && kept !== "change") state.order = kept;
      dirty = true;
      wake();
    })();
    void load();
    wake();
    return win;
  },
};
