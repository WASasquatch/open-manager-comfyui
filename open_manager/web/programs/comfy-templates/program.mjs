const CORE_INDEX = "/templates/index.json";

const CUSTOM_LIST = "/api/workflow_templates";

const CUSTOM_GROUP = "Custom Nodes";

const ALL = "\u0000all";

const RUNS_COMFY = "ComfyUI";

const RUNS_API = "External or Remote API";

const SORTS = [
  ["default", "Default"],
  ["recommended", "Recommended"],
  ["popular", "Popular"],
  ["alphabetical", "A → Z"],
  ["newest", "Newest"],
  ["size", "Model Size (Low to High)"],
];

const TYPES = [["all", "All"], ["graph", "Node graph"], ["app", "App"]];

const RANK_SATURATION = 1000;

const RANK_DEAD_ZONE = 5;

function rankBoost(rank) {
  if (!rank || Math.abs(rank) <= RANK_DEAD_ZONE) return 0;
  const magnitude = Math.min(1,
    Math.log1p(Math.abs(rank)) / Math.log1p(RANK_SATURATION));
  return Math.sign(rank) * magnitude;
}

function freshness(date) {
  if (!date) return 0.5;
  const when = new Date(date);
  if (Number.isNaN(when.getTime())) return 0.5;
  const days = (Date.now() - when.getTime()) / 86400000;
  return Math.max(0.1, 1 / (1 + days / 90));
}

function recommended(one, largest) {
  const usage = largest ? (one.usage || 0) / largest : 0;
  return usage * 0.5 + ((rankBoost(one.rank) + 1) / 2) * 0.3 + freshness(one.date) * 0.2;
}

function byTitle(a, b) {
  const one = (a.title || a.name || "").trim();
  const two = (b.title || b.name || "").trim();
  const oneDigit = /^\d/.test(one);
  const twoDigit = /^\d/.test(two);
  if (oneDigit !== twoDigit) return oneDigit ? 1 : -1;
  return one.localeCompare(two, undefined, { numeric: true, sensitivity: "base" });
}

function coreThumb(one) {
  const kind = one.mediaSubtype || "webp";
  return `/templates/${encodeURIComponent(one.name)}-1.${kind}`;
}

function customThumb(pack, name) {
  return `${CUSTOM_LIST}/${encodeURIComponent(pack)}/${encodeURIComponent(name)}-1.webp`;
}

async function readCore() {
  const answer = await fetch(CORE_INDEX);
  if (!answer.ok) return [];
  const held = await answer.json();
  if (!Array.isArray(held)) return [];
  const groups = [];
  for (const group of held) {
    const templates = (group.templates || []).map((one) => ({
      key: `core:${one.name}`,
      name: one.name,
      title: one.title || one.name,
      note: one.description || "",
      tags: one.tags || [],
      models: one.models || [],
      tutorial: one.tutorialUrl || "",
      app: one.isApp === true,
      remote: one.openSource === false,
      usage: typeof one.usage === "number" ? one.usage : 0,
      date: one.date || "",
      size: typeof one.size === "number" ? one.size : null,
      rank: typeof one.searchRank === "number" ? one.searchRank : 0,
      thumb: coreThumb(one),
      source: `/templates/${encodeURIComponent(one.name)}.json`,
      group: group.title || group.category || group.moduleName || "Templates",
    }));
    if (templates.length) {
      groups.push({ label: group.title || group.category || group.moduleName, templates });
    }
  }
  return groups;
}

async function readCustom() {
  const answer = await fetch(CUSTOM_LIST);
  if (!answer.ok) return [];
  const held = await answer.json();
  if (!held || typeof held !== "object") return [];
  const groups = [];
  for (const [pack, names] of Object.entries(held)) {
    if (!Array.isArray(names) || !names.length) continue;
    groups.push({
      label: pack,
      pack: true,
      templates: names.map((name) => ({
        key: `${pack}:${name}`,
        name,
        title: name,
        note: "",
        tags: [],
        models: [],
        tutorial: "",
        app: false,
        remote: false,
        usage: 0,
        date: "",
        size: null,
        rank: 0,
        thumb: customThumb(pack, name),
        source: `${CUSTOM_LIST}/${encodeURIComponent(pack)}/${encodeURIComponent(name)}.json`,
        group: pack,
      })),
    });
  }
  return groups;
}

export const program = {
  open(api) {
    const win = api.window({ size: "manager", title: "Templates" });
    const state = {
      groups: [], chosen: ALL, find: "", busy: false, type: "all", sort: "default",
      models: new Set(), tasks: new Set(), runs: new Set(),
    };

    const find = api.el("input", "om-search tpl-find");
    find.placeholder = "Search templates by name, description or tag";
    find.spellcheck = false;
    const again = api.el("button", "om-btn", "Reload");
    again.title = "Read the template list again.";
    win.tools.appendChild(find);
    win.tools.appendChild(again);

    const wrap = api.el("div", "tpl");
    const side = api.el("div", "tpl-side");
    const main = api.el("div", "tpl-main");
    const bar = api.el("div", "tpl-bar");
    const tabs = api.el("div", "tpl-tabs");
    const filters = api.el("div", "tpl-filters");
    const grid = api.el("div", "tpl-grid");
    const status = api.el("div", "tpl-status", "Reading the template list...");
    bar.appendChild(tabs);
    bar.appendChild(filters);
    main.appendChild(bar);
    main.appendChild(grid);
    main.appendChild(status);
    wrap.appendChild(side);
    wrap.appendChild(main);
    win.body.appendChild(wrap);

    const everything = () => state.groups.flatMap((one) => one.templates);

    const modelNames = () =>
      [...new Set(everything().flatMap((one) => one.models))].sort();
    const taskNames = () =>
      [...new Set(everything().flatMap((one) => one.tags))].sort();

    const matches = (one) => {
      if (state.chosen !== ALL && one.group !== state.chosen) return false;
      if (state.type === "graph" && one.app) return false;
      if (state.type === "app" && !one.app) return false;
      if (state.models.size && !one.models.some((name) => state.models.has(name))) return false;
      if (state.tasks.size && !one.tags.some((tag) => state.tasks.has(tag))) return false;
      if (state.runs.size && !state.runs.has(one.remote ? RUNS_API : RUNS_COMFY)) return false;
      const term = state.find.trim().toLowerCase();
      if (!term) return true;
      const hay = (`${one.title} ${one.name} ${one.note} ${one.tags.join(" ")} `
        + `${one.models.join(" ")}`).toLowerCase();
      return term.split(/\s+/).every((word) => hay.includes(word));
    };

    const arrange = (list) => {
      const out = [...list];
      if (state.sort === "popular") return out.sort((a, b) => (b.usage || 0) - (a.usage || 0));
      if (state.sort === "alphabetical") return out.sort(byTitle);
      if (state.sort === "newest") {
        return out.sort((a, b) => new Date(b.date || "1970-01-01").getTime()
          - new Date(a.date || "1970-01-01").getTime());
      }
      if (state.sort === "size") {
        return out.sort((a, b) => (a.size ?? Infinity) - (b.size ?? Infinity));
      }
      if (state.sort === "recommended") {
        const largest = out.reduce((most, one) => Math.max(most, one.usage || 0), 0);
        return out.sort((a, b) => recommended(b, largest) - recommended(a, largest));
      }
      return out;
    };

    const anyFilter = () => state.type !== "all" || state.models.size || state.tasks.size
      || state.runs.size || state.sort !== "default";

    const tally = (shown) => {
      const total = everything().length;
      if (!total) {
        status.textContent = "No templates are installed in this ComfyUI.";
        return;
      }
      status.textContent = shown.length === total
        ? `${total} templates.`
        : `${shown.length} of ${total} templates.`;
    };

    const load = async (one) => {
      if (state.busy) return;
      state.busy = true;
      status.textContent = `Opening ${one.title}...`;
      try {
        const answer = await fetch(one.source);
        if (!answer.ok) throw new Error(`the server answered ${answer.status}`);
        const data = await answer.json();
        if (typeof api.graph?.open !== "function") {
          throw new Error("this ComfyUI cannot load a workflow from here");
        }
        await api.graph.open(data, one.title);
        api.graph?.show?.();
        api.toast(`Opened ${one.title}`, { kind: "ok" });
        tally(arrange(everything().filter(matches)));
      } catch (error) {
        api.notify("Not opened", `${one.title} could not be opened: ${error.message}`);
        status.textContent = `${one.title} could not be opened.`;
      }
      state.busy = false;
    };

    const card = (one) => {
      const cell = api.el("div", "tpl-cell");
      cell.tabIndex = 0;
      const shot = api.el("div", "tpl-shot");
      const art = api.el("img", "tpl-img");
      art.loading = "lazy";
      art.alt = "";
      art.src = one.thumb;
      art.addEventListener("error", () => {
        art.remove();
        shot.classList.add("tpl-shot-bare");
        shot.textContent = one.title.slice(0, 2).toUpperCase();
      }, { once: true });
      shot.appendChild(art);
      cell.appendChild(shot);
      const name = api.el("div", "tpl-name", one.title);
      cell.appendChild(name);
      if (one.note) cell.appendChild(api.el("div", "tpl-note", one.note));
      if (one.tags.length) {
        const tags = api.el("div", "tpl-tags");
        for (const tag of one.tags.slice(0, 4)) tags.appendChild(api.el("span", "tpl-tag", tag));
        cell.appendChild(tags);
      }
      api.tip(cell, () => ({
        lead: one.title,
        facts: [
          ["From", one.group],
          ["Opens as", one.app ? "App" : "Node graph"],
          ["Runs on", one.remote ? RUNS_API : RUNS_COMFY],
          one.models.length ? ["Models", one.models.join(", ")] : null,
          one.tags.length ? ["Tagged", one.tags.join(", ")] : null,
        ].filter(Boolean),
        lines: [one.note],
      }));
      cell.ondblclick = () => { void load(one); };
      cell.onkeydown = (event) => {
        if (event.key === "Enter") { event.preventDefault(); void load(one); }
      };
      cell.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        const items = [{ label: "Open", fn: () => load(one) }];
        if (one.tutorial) {
          items.push({ label: "Read the guide", fn: () => window.open(one.tutorial, "_blank") });
        }
        api.menu(cell, items);
      });
      return cell;
    };

    const pickers = [];

    const picker = (name, plural, list, chosen, seekable) => {
      const root = api.el("div", "tpl-pick");
      const button = api.el("button", "tpl-pick-btn");
      const text = api.el("span", "tpl-pick-text", name);
      button.appendChild(text);
      button.appendChild(api.el("span", "tpl-pick-caret", "▾"));
      root.appendChild(button);
      const pop = api.el("div", "tpl-pop");
      const seek = api.el("input", "om-search tpl-pop-find");
      seek.placeholder = "Search";
      seek.spellcheck = false;
      const rows = api.el("div", "tpl-pop-rows");
      const foot = api.el("div", "tpl-pop-foot");
      const clear = api.el("button", "om-btn", "Clear");
      foot.appendChild(clear);
      if (seekable) pop.appendChild(seek);
      pop.appendChild(rows);
      pop.appendChild(foot);
      root.appendChild(pop);

      const show = () => {
        text.textContent = chosen.size ? `${chosen.size} ${plural}` : name;
        button.classList.toggle("tpl-pick-set", chosen.size > 0);
      };
      const paint = () => {
        const term = seekable ? seek.value.trim().toLowerCase() : "";
        const values = list().filter((one) => !term || one.toLowerCase().includes(term));
        rows.replaceChildren(...values.map((value) => {
          const row = api.el("label", "tpl-pop-row");
          const mark = api.el("input");
          mark.type = "checkbox";
          mark.checked = chosen.has(value);
          mark.onchange = () => {
            if (mark.checked) chosen.add(value);
            else chosen.delete(value);
            show();
            draw();
          };
          row.appendChild(mark);
          row.appendChild(api.el("span", "tpl-pop-name", value));
          return row;
        }));
      };
      let watcher = null;
      const close = () => {
        root.classList.remove("tpl-pick-open");
        if (watcher) document.removeEventListener("mousedown", watcher);
        watcher = null;
      };
      const open = () => {
        for (const other of pickers) if (other.root !== root) other.close();
        paint();
        root.classList.add("tpl-pick-open");
        watcher = (event) => {
          if (!root.isConnected || !root.contains(event.target)) close();
        };
        setTimeout(() => document.addEventListener("mousedown", watcher), 0);
        if (seekable) seek.focus();
      };
      button.onclick = () => {
        if (root.classList.contains("tpl-pick-open")) close();
        else open();
      };
      clear.onclick = () => { chosen.clear(); show(); paint(); draw(); };
      seek.addEventListener("input", paint);
      const handle = { root, close, show, prune: (values) => {
        const kept = new Set(values);
        for (const value of [...chosen]) if (!kept.has(value)) chosen.delete(value);
        show();
      } };
      pickers.push(handle);
      filters.appendChild(root);
      return handle;
    };

    for (const [value, label] of TYPES) {
      const tab = api.el("button", "tpl-tab", label);
      tab.dataset.type = value;
      tab.onclick = () => { state.type = value; draw(); };
      tabs.appendChild(tab);
    }

    const models = picker("Model Filter", "Models", modelNames, state.models, true);
    const tasks = picker("Tasks", "Tasks", taskNames, state.tasks, true);
    const runs = picker("Runs on", "Runs On", () => [RUNS_COMFY, RUNS_API], state.runs, false);

    const sort = api.el("select", "om-side-select tpl-sort");
    for (const [value, label] of SORTS) {
      const option = api.el("option", null, label);
      option.value = value;
      sort.appendChild(option);
    }
    sort.onchange = () => { state.sort = sort.value; draw(); };
    filters.appendChild(sort);

    const wipe = api.el("button", "om-btn tpl-wipe", "Clear filters");
    wipe.onclick = () => {
      state.type = "all";
      state.sort = "default";
      state.models.clear();
      state.tasks.clear();
      state.runs.clear();
      sort.value = "default";
      for (const one of pickers) one.show();
      draw();
    };
    filters.appendChild(wipe);

    const drawSide = () => {
      side.replaceChildren();
      const all = api.el("button",
        `tpl-place${state.chosen === ALL ? " tpl-place-on" : ""}`, "Everything");
      all.onclick = () => { state.chosen = ALL; draw(); };
      side.appendChild(all);
      for (const group of state.groups) {
        if (group.pack && !side.querySelector(".tpl-head-packs")) {
          side.appendChild(api.el("div", "tpl-head tpl-head-packs", CUSTOM_GROUP));
        }
        const row = api.el("button",
          `tpl-place${state.chosen === group.label ? " tpl-place-on" : ""}`, group.label);
        row.title = `${group.templates.length} template${group.templates.length === 1 ? "" : "s"}`;
        row.onclick = () => { state.chosen = group.label; draw(); };
        side.appendChild(row);
      }
    };

    const draw = () => {
      drawSide();
      for (const tab of tabs.children) {
        tab.classList.toggle("tpl-tab-on", tab.dataset.type === state.type);
      }
      wipe.classList.toggle("tpl-wipe-on", Boolean(anyFilter()));
      const shown = arrange(everything().filter(matches));
      grid.replaceChildren(...shown.map(card));
      tally(shown);
      if (!shown.length && everything().length) {
        grid.appendChild(api.el("div", "tpl-empty", "Nothing matches that."));
      }
    };

    const fill = async () => {
      status.textContent = "Reading the template list...";
      const [core, custom] = await Promise.all([
        readCore().catch(() => []),
        readCustom().catch(() => []),
      ]);
      state.groups = [...core, ...custom];
      models.prune(modelNames());
      tasks.prune(taskNames());
      runs.prune([RUNS_COMFY, RUNS_API]);
      draw();
    };

    find.addEventListener("input", () => { state.find = find.value; draw(); });
    again.onclick = () => { void fill(); };
    win.onClose(() => { for (const one of pickers) one.close(); });

    api.style(`
      .tpl { display: flex; flex: 1; min-height: 0; }
      .tpl-side { width: 176px; flex: none; overflow-y: auto; padding: 6px;
        border-right: 1px solid var(--om-border); display: flex; flex-direction: column;
        gap: 2px; }
      .tpl-head { font-size: 11px; text-transform: uppercase; letter-spacing: .06em;
        opacity: .55; padding: 10px 6px 4px; }
      .tpl-place { text-align: left; padding: 5px 8px; border: 0; border-radius: 5px;
        background: transparent; color: inherit; font: inherit; cursor: pointer;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .tpl-place:hover { background: var(--om-hover); }
      .tpl-place-on { background: color-mix(in srgb, var(--om-text) 12%, transparent);
        font-weight: 600; }
      .tpl-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
      .tpl-bar { flex: none; display: flex; align-items: center; gap: 8px; padding: 8px 10px;
        border-bottom: 1px solid var(--om-border); flex-wrap: wrap; }
      .tpl-tabs { display: flex; gap: 2px; padding: 2px; border-radius: 6px;
        background: color-mix(in srgb, var(--om-text) 7%, transparent); }
      .tpl-tab { border: 0; border-radius: 4px; background: transparent; color: inherit;
        font: inherit; font-size: 12px; padding: 4px 10px; cursor: pointer; }
      .tpl-tab:hover { background: var(--om-hover); }
      .tpl-tab-on { background: var(--om-text); color: var(--om-bg); font-weight: 600; }
      .tpl-filters { display: flex; align-items: center; gap: 6px; margin-left: auto;
        flex-wrap: wrap; }
      .tpl-pick { position: relative; }
      .tpl-pick-btn { display: flex; align-items: center; gap: 6px; font: inherit;
        font-size: 12px; padding: 4px 9px; border-radius: 6px; cursor: pointer;
        border: 1px solid var(--om-border); background: var(--om-input); color: inherit; }
      .tpl-pick-btn:hover { background: var(--om-hover); }
      .tpl-pick-set { border-color: color-mix(in srgb, var(--om-text) 45%, transparent);
        font-weight: 600; }
      .tpl-pick-caret { opacity: .6; font-size: 10px; }
      .tpl-pop { display: none; position: absolute; right: 0; top: calc(100% + 4px);
        z-index: 40; min-width: 230px; max-width: 320px; padding: 6px;
        border: 1px solid var(--om-border); border-radius: 8px; background: var(--om-bg);
        box-shadow: 0 10px 28px rgba(0, 0, 0, .45); }
      .tpl-pick-open .tpl-pop { display: block; }
      .tpl-pop-find { width: 100%; margin-bottom: 6px; }
      .tpl-pop-rows { max-height: 280px; overflow-y: auto; display: flex;
        flex-direction: column; }
      .tpl-pop-row { display: flex; align-items: center; gap: 7px; padding: 4px 6px;
        border-radius: 5px; cursor: pointer; font-size: 12px; }
      .tpl-pop-row:hover { background: var(--om-hover); }
      .tpl-pop-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .tpl-pop-foot { display: flex; justify-content: flex-end; padding-top: 6px;
        margin-top: 4px; border-top: 1px solid var(--om-border); }
      .tpl-sort { font-size: 12px; }
      .tpl-wipe { display: none; }
      .tpl-wipe-on { display: inline-flex; }
      .tpl-grid { flex: 1; min-height: 0; overflow-y: auto; padding: 10px; display: grid;
        gap: 10px; align-content: start; grid-auto-rows: max-content;
        grid-template-columns: repeat(auto-fill, minmax(168px, 1fr)); }
      .tpl-cell { border: 1px solid var(--om-border); border-radius: 7px;
        cursor: pointer; display: flex; flex-direction: column;
        background: color-mix(in srgb, var(--om-text) 3%, transparent); }
      .tpl-cell:hover, .tpl-cell:focus-visible {
        border-color: var(--p-button-text-primary-color, #388bfd); outline: none; }
      .tpl-shot { aspect-ratio: 16 / 10; background: rgba(0, 0, 0, .28); display: flex;
        align-items: center; justify-content: center; overflow: hidden; flex: none;
        border-radius: 6px 6px 0 0; }
      .tpl-shot-bare { font-size: 22px; font-weight: 600; opacity: .4; }
      .tpl-img { width: 100%; height: 100%; object-fit: cover; display: block; }
      .tpl-name { padding: 6px 8px 0; font-weight: 600; font-size: 12px; line-height: 1.3; }
      .tpl-note { padding: 3px 8px 0; font-size: 11px; opacity: .65; line-height: 1.35;
        display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
        overflow: hidden; }
      .tpl-tags { padding: 6px 8px 8px; display: flex; flex-wrap: wrap; gap: 3px; }
      .tpl-tag { font-size: 10px; padding: 1px 5px; border-radius: 3px;
        background: color-mix(in srgb, var(--om-text) 8%, transparent); opacity: .8; }
      .tpl-empty { grid-column: 1 / -1; padding: 24px; text-align: center; opacity: .6; }
      .tpl-status { flex: none; padding: 5px 10px; font-size: 11px; opacity: .65;
        border-top: 1px solid var(--om-border); }
      .tpl-find { min-width: 240px; }
    `);

    void fill();
    return win;
  },
};
