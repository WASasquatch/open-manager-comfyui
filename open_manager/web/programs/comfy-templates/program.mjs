const CORE_INDEX = "/templates/index.json";

const CUSTOM_LIST = "/api/workflow_templates";

const CUSTOM_GROUP = "Custom Nodes";

const ALL = "\u0000all";

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
    const state = { groups: [], chosen: ALL, find: "", busy: false };

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
    const grid = api.el("div", "tpl-grid");
    const status = api.el("div", "tpl-status", "Reading the template list...");
    main.appendChild(grid);
    main.appendChild(status);
    wrap.appendChild(side);
    wrap.appendChild(main);
    win.body.appendChild(wrap);

    const everything = () => state.groups.flatMap((one) => one.templates);

    const matches = (one) => {
      if (state.chosen !== ALL && one.group !== state.chosen) return false;
      const term = state.find.trim().toLowerCase();
      if (!term) return true;
      const hay = (`${one.title} ${one.name} ${one.note} ${one.tags.join(" ")} `
        + `${one.models.join(" ")}`).toLowerCase();
      return term.split(/\s+/).every((word) => hay.includes(word));
    };

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
        const { app } = await import("/scripts/app.js");
        if (typeof app?.loadGraphData !== "function") {
          throw new Error("this ComfyUI cannot load a workflow from here");
        }
        await app.loadGraphData(data, true, true, one.title);
        api.graph?.show?.();
        api.toast(`Opened ${one.title}`, { kind: "ok" });
        tally(everything().filter(matches));
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
      const shown = everything().filter(matches);
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
      draw();
    };

    find.addEventListener("input", () => { state.find = find.value; draw(); });
    again.onclick = () => { void fill(); };

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
