const ALL = "\u0000all";

const SHOWN_CAP = 400;

function topOf(category) {
  const text = String(category || "").trim();
  if (!text) return "Uncategorised";
  const at = text.indexOf("/");
  return at < 0 ? text : text.slice(0, at);
}

function portsNote(entry) {
  const parts = [];
  const need = entry.inputs?.required || 0;
  const spare = entry.inputs?.optional || 0;
  if (need) parts.push(`${need} in`);
  if (spare) parts.push(`${spare} optional`);
  if (entry.outputs?.length) parts.push(`out ${entry.outputs.join(", ")}`);
  return parts.join(" · ");
}

export const program = {
  open(api) {
    const win = api.window({ size: "manager", title: "Nodes" });
    const state = { all: [], chosen: ALL, find: "", hidden: false };

    const find = api.el("input", "om-search nod-find");
    find.placeholder = "Search nodes by name, category or description";
    find.spellcheck = false;
    const hidden = api.el("label", "nod-toggle");
    const hiddenMark = api.el("input");
    hiddenMark.type = "checkbox";
    hidden.title = "Show the node types marked deprecated or experimental as well.";
    hidden.appendChild(hiddenMark);
    hidden.appendChild(api.el("span", null, "Deprecated"));
    const again = api.el("button", "om-btn", "Reload");
    again.title = "Read the registered node types again.";
    win.tools.appendChild(find);
    win.tools.appendChild(hidden);
    win.tools.appendChild(again);

    const wrap = api.el("div", "nod");
    const side = api.el("div", "nod-side");
    const main = api.el("div", "nod-main");
    const list = api.el("div", "nod-list");
    const status = api.el("div", "nod-status", "Reading the node types...");
    main.appendChild(list);
    main.appendChild(status);
    wrap.appendChild(side);
    wrap.appendChild(main);
    win.body.appendChild(wrap);

    const matches = (one) => {
      if (!state.hidden && (one.deprecated || one.experimental)) return false;
      if (state.chosen !== ALL && topOf(one.category) !== state.chosen) return false;
      const term = state.find.trim().toLowerCase();
      if (!term) return true;
      const hay = (`${one.name} ${one.display_name} ${one.category} ${one.description} `
        + `${one.module}`).toLowerCase();
      return term.split(/\s+/).every((word) => hay.includes(word));
    };

    const row = (one) => {
      const item = api.el("div", "nod-row");
      const head = api.el("div", "nod-head");
      head.appendChild(api.el("span", "nod-name", one.display_name));
      if (one.display_name !== one.name) {
        head.appendChild(api.el("span", "nod-type", one.name));
      }
      if (one.deprecated) head.appendChild(api.el("span", "nod-flag", "deprecated"));
      if (one.experimental) head.appendChild(api.el("span", "nod-flag", "experimental"));
      item.appendChild(head);
      const under = api.el("div", "nod-under");
      if (one.category) under.appendChild(api.el("span", "nod-cat", one.category));
      const ports = portsNote(one);
      if (ports) under.appendChild(api.el("span", "nod-ports", ports));
      item.appendChild(under);
      if (one.description) {
        const note = api.el("div", "nod-note");
        note.textContent = one.description;
        item.appendChild(note);
      }
      api.graph.drag(item, one);
      return item;
    };

    const drawSide = () => {
      const counts = new Map();
      for (const one of state.all) {
        if (!state.hidden && (one.deprecated || one.experimental)) continue;
        const top = topOf(one.category);
        counts.set(top, (counts.get(top) || 0) + 1);
      }
      const names = [...counts.keys()].sort((a, b) => a.localeCompare(b));
      side.replaceChildren();
      const all = api.el("button",
        `nod-place${state.chosen === ALL ? " nod-place-on" : ""}`, "Everything");
      all.onclick = () => { state.chosen = ALL; draw(); };
      side.appendChild(all);
      for (const name of names) {
        const place = api.el("button",
          `nod-place${state.chosen === name ? " nod-place-on" : ""}`, name);
        place.appendChild(api.el("span", "nod-count", String(counts.get(name))));
        place.onclick = () => { state.chosen = name; draw(); };
        side.appendChild(place);
      }
    };

    const draw = () => {
      drawSide();
      const shown = state.all.filter(matches);
      const cut = shown.slice(0, SHOWN_CAP);
      list.replaceChildren(...cut.map(row));
      list.scrollTop = 0;
      if (!state.all.length) {
        status.textContent = "No node types are registered in this ComfyUI yet.";
        return;
      }
      if (!shown.length) {
        list.appendChild(api.el("div", "nod-empty", "Nothing matches that."));
        status.textContent = `0 of ${state.all.length} node types.`;
        return;
      }
      status.textContent = shown.length > cut.length
        ? `Showing ${cut.length} of ${shown.length} matches.`
        : `${shown.length} of ${state.all.length} node types.`;
    };

    const fill = () => {
      state.all = api.graph.nodes()
        .filter((one) => !String(one.category || "").startsWith("__hidden__"))
        .sort((a, b) => a.display_name.toLowerCase().localeCompare(b.display_name.toLowerCase()));
      draw();
    };

    find.addEventListener("input", () => { state.find = find.value; draw(); });
    hiddenMark.addEventListener("change", () => { state.hidden = hiddenMark.checked; draw(); });
    again.onclick = () => fill();

    api.style(`
      .nod { display: flex; flex: 1; min-height: 0; }
      .nod-side { width: 180px; flex: none; overflow-y: auto; padding: 6px;
        border-right: 1px solid var(--om-border); display: flex; flex-direction: column;
        gap: 2px; }
      .nod-place { display: flex; align-items: center; gap: 6px; text-align: left;
        padding: 5px 8px; border: 0; border-radius: 5px; background: transparent;
        color: inherit; font: inherit; cursor: pointer; }
      .nod-place:hover { background: var(--om-hover); }
      .nod-place-on { background: color-mix(in srgb, var(--om-text) 12%, transparent);
        font-weight: 600; }
      .nod-count { margin-left: auto; font-size: 10px; opacity: .5; }
      .nod-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
      .nod-list { flex: 1; min-height: 0; overflow-y: auto; padding: 6px; }
      .nod-row { padding: 6px 8px; border-radius: 6px; cursor: grab;
        border: 1px solid transparent; }
      .nod-row:hover { background: var(--om-hover);
        border-color: var(--om-border); }
      .nod-head { display: flex; align-items: baseline; gap: 7px; flex-wrap: wrap; }
      .nod-name { font-weight: 600; font-size: 12px; }
      .nod-type { font-size: 11px; opacity: .5; }
      .nod-flag { font-size: 10px; padding: 0 4px; border-radius: 3px;
        background: color-mix(in srgb, var(--om-text) 10%, transparent); opacity: .75; }
      .nod-under { display: flex; gap: 10px; font-size: 11px; opacity: .55; margin-top: 1px; }
      .nod-ports { margin-left: auto; white-space: nowrap; }
      .nod-note { font-size: 11px; opacity: .6; margin-top: 2px; line-height: 1.35;
        display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
        overflow: hidden; }
      .nod-empty { padding: 24px; text-align: center; opacity: .6; }
      .nod-status { flex: none; padding: 5px 10px; font-size: 11px; opacity: .65;
        border-top: 1px solid var(--om-border); }
      .nod-find { min-width: 240px; }
      .nod-toggle { display: flex; align-items: center; gap: 4px; font-size: 11px; }
    `);

    fill();
    return win;
  },
};
