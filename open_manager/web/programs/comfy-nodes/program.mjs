const ALL = "\u0000all";

const SOURCES = [["all", "All"], ["core", "Core"], ["partner", "Partner"], ["custom", "Custom"]];

const SLOW_SEARCH = 24;

const TYPE_PAUSE = 140;

const ROW_SPARE = 8;

const ROW_GAP = 2;

const ROW_GUESS = 60;

const SEARCH_ART = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' "
  + "fill='none' stroke='black' stroke-width='2.4' stroke-linecap='round'%3E%3Ccircle cx='11' "
  + "cy='11' r='7'/%3E%3Cpath d='m20 20-4-4'/%3E%3C/svg%3E";

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

const LEAD = /^[^\p{L}\p{N}]+/u;

const prepared = new WeakMap();

function preparedOf(one) {
  let item = prepared.get(one);
  if (!item) {
    item = prepare(one);
    prepared.set(one, item);
  }
  return item;
}

function prepare(one) {
  const shown = one.display_name.toLowerCase().replace(LEAD, "");
  const type = one.name.toLowerCase();
  const name = `${shown} ${type}`;
  return {
    one,
    shown,
    type,
    name,
    top: topOf(one.category),
    hay: `${name} ${one.category} ${one.description} ${one.module} ${one.pack || ""}`.toLowerCase(),
    off: one.deprecated || one.experimental,
  };
}

function rank(items, words, phrase) {
  if (!words.length) return { matched: items, shown: items };
  const matched = [];
  const tiers = [[], [], [], [], []];
  for (const item of items) {
    if (!words.every((word) => item.hay.includes(word))) continue;
    matched.push(item);
    if (item.shown === phrase || item.type === phrase) tiers[0].push(item);
    else if (item.shown.startsWith(phrase)) tiers[1].push(item);
    else if (item.type.startsWith(phrase)) tiers[2].push(item);
    else if (words.every((word) => item.name.includes(word))) tiers[3].push(item);
    else tiers[4].push(item);
  }
  return { matched, shown: tiers.flat() };
}

export const program = {
  open(api) {
    const win = api.window({ size: "manager", title: "Nodes" });
    const place = (one) => {
      if (api.graph.place(one.name)) win.minimise?.();
    };
    const state = {
      all: [], pool: null, matched: [], shown: [], last: "",
      chosen: ALL, source: "all", term: "", hidden: false,
      at: -1, open: false, cost: 0,
    };

    const top = api.el("div", "nod-top");
    const search = api.el("div", "nod-search");
    const find = api.el("input", "nod-find");
    find.type = "text";
    find.placeholder = "Search nodes";
    find.spellcheck = false;
    find.autocomplete = "off";
    find.setAttribute("aria-label", "Search nodes");
    const clear = api.el("button", "nod-clear", "×");
    clear.type = "button";
    clear.hidden = true;
    clear.setAttribute("aria-label", "Clear");
    search.append(find, clear);

    const filters = api.el("div", "nod-filters");
    const chips = api.el("div", "nod-chips");
    chips.setAttribute("role", "group");
    chips.setAttribute("aria-label", "Source");
    for (const [key, label] of SOURCES) {
      const chip = api.el("button", "nod-chip", label);
      chip.type = "button";
      chip.dataset.source = key;
      chip.setAttribute("aria-pressed", key === state.source ? "true" : "false");
      chips.appendChild(chip);
    }
    const hidden = api.el("label", "nod-toggle");
    const hiddenMark = api.el("input");
    hiddenMark.type = "checkbox";
    hidden.title = "Deprecated and experimental node types";
    hidden.appendChild(hiddenMark);
    hidden.appendChild(api.el("span", null, "Deprecated"));
    const again = api.el("button", "om-btn nod-again", "Reload");
    again.type = "button";
    filters.append(chips, hidden, again);
    top.append(search, filters);

    const wrap = api.el("div", "nod");
    const side = api.el("div", "nod-side");
    const main = api.el("div", "nod-main");
    const list = api.el("div", "nod-list");
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", "Node types");
    const room = api.el("div", "nod-room");
    list.appendChild(room);
    const status = api.el("div", "nod-status", "Reading the node types...");
    main.append(list);

    const drawer = api.el("aside", "nod-drawer");
    drawer.setAttribute("aria-label", "Node");
    drawer.inert = true;
    const drawerHead = api.el("div", "nod-drawer-head");
    const add = api.el("button", "om-btn nod-add", "Add to graph");
    add.type = "button";
    const shut = api.el("button", "nod-shut", "×");
    shut.type = "button";
    shut.setAttribute("aria-label", "Close");
    drawerHead.append(add, shut);
    const drawerBody = api.el("div", "nod-drawer-body");
    drawer.append(drawerHead, drawerBody);

    wrap.append(side, main, drawer);
    const shell = api.el("div", "nod-shell");
    shell.append(top, wrap, status);
    win.body.appendChild(shell);

    const built = new Map();
    let step = 0;
    let paintDue = 0;
    let searchDue = 0;
    let searchTimer = 0;

    const rowShell = (one) => {
      const item = api.el("div", "nod-row");
      const head = api.el("div", "nod-head");
      head.appendChild(api.el("span", "nod-name", one.display_name));
      if (one.display_name !== one.name) head.appendChild(api.el("span", "nod-type", one.name));
      if (one.deprecated) head.appendChild(api.el("span", "nod-flag", "deprecated"));
      if (one.experimental) head.appendChild(api.el("span", "nod-flag", "experimental"));
      item.appendChild(head);
      const under = api.el("div", "nod-under");
      under.appendChild(api.el("span", "nod-cat", one.category || ""));
      const ports = portsNote(one);
      if (ports) under.appendChild(api.el("span", "nod-ports", ports));
      item.appendChild(under);
      item.appendChild(api.el("div", "nod-note", one.description || ""));
      return item;
    };

    const measure = () => {
      if (step) return step;
      const probe = rowShell({ display_name: "Wg", name: "Wg", category: "Wg", description: "Wg",
                               outputs: ["Wg"], inputs: { required: 1 } });
      probe.style.visibility = "hidden";
      room.appendChild(probe);
      const tall = probe.offsetHeight;
      probe.remove();
      if (!tall) return ROW_GUESS + ROW_GAP;
      step = tall + ROW_GAP;
      room.style.setProperty("--nod-row-h", `${tall}px`);
      for (const node of built.values()) node.remove();
      built.clear();
      return step;
    };

    const markAt = () => {
      for (const [index, node] of built) {
        const on = index === state.at;
        node.classList.toggle("nod-row-at", on);
        node.setAttribute("aria-selected", on ? "true" : "false");
      }
    };

    const paint = () => {
      paintDue = 0;
      const gap = measure();
      const total = state.shown.length;
      room.style.height = `${total * gap}px`;
      const first = Math.max(0, Math.floor(list.scrollTop / gap) - ROW_SPARE);
      const last = Math.min(total, Math.ceil((list.scrollTop + list.clientHeight) / gap) + ROW_SPARE);
      for (const [index, node] of built) {
        if (index >= first && index < last) continue;
        node.remove();
        built.delete(index);
      }
      for (let index = first; index < last; index += 1) {
        if (built.has(index)) continue;
        const one = state.shown[index].one;
        const node = rowShell(one);
        node.dataset.at = String(index);
        node.setAttribute("role", "option");
        node.style.top = `${index * gap}px`;
        api.graph.drag(node, one, { add: () => place(one) });
        room.appendChild(node);
        built.set(index, node);
      }
      markAt();
    };

    const paintSoon = () => {
      if (!paintDue) paintDue = requestAnimationFrame(paint);
    };

    const repaint = () => {
      for (const node of built.values()) node.remove();
      built.clear();
      list.scrollTop = 0;
      paint();
    };

    const reveal = () => {
      if (state.at < 0) return;
      const gap = measure();
      const top = state.at * gap;
      if (top < list.scrollTop) list.scrollTop = top;
      else if (top + gap > list.scrollTop + list.clientHeight) {
        list.scrollTop = top + gap - list.clientHeight;
      }
      paint();
    };

    const closeDrawer = () => {
      state.open = false;
      wrap.classList.remove("nod-drawer-open");
      drawer.inert = true;
    };

    const showDrawer = (one) => {
      state.open = true;
      const card = api.graph.card(one);
      api.graph.drag(card, one, { add: () => place(one) });
      const parts = [card];
      if (one.description) parts.push(api.el("p", "nod-desc", one.description));
      const facts = api.el("dl", "nod-facts");
      const fact = (label, value) => {
        if (!value) return;
        facts.append(api.el("dt", null, label), api.el("dd", null, value));
      };
      fact("Type", one.name);
      fact("Category", one.category);
      fact("Pack", one.pack);
      parts.push(facts);
      drawerBody.replaceChildren(...parts);
      drawerBody.scrollTop = 0;
      add.onclick = () => place(one);
      wrap.classList.add("nod-drawer-open");
      drawer.inert = false;
    };

    const pick = (index, { toggle = false } = {}) => {
      if (index < 0 || index >= state.shown.length) return;
      if (toggle && index === state.at && state.open) {
        closeDrawer();
        return;
      }
      state.at = index;
      reveal();
      showDrawer(state.shown[index].one);
    };

    const sayCount = () => {
      if (!state.all.length) {
        status.textContent = "No node types are registered in this ComfyUI yet.";
        return;
      }
      status.textContent = `${state.shown.length} of ${state.all.length} node types.`;
    };

    const poolNow = () => {
      if (state.pool) return state.pool;
      state.pool = state.all.filter((item) => (state.hidden || !item.off)
        && (state.source === "all" || item.one.source === state.source)
        && (state.chosen === ALL || item.top === state.chosen));
      state.last = "";
      return state.pool;
    };

    const runSearch = () => {
      cancelAnimationFrame(searchDue);
      clearTimeout(searchTimer);
      searchDue = 0;
      searchTimer = 0;
      const began = performance.now();
      const phrase = state.term.trim().toLowerCase().replace(/\s+/g, " ");
      const words = phrase ? phrase.split(" ") : [];
      const pool = poolNow();
      const from = state.last && phrase.startsWith(state.last) ? state.matched : pool;
      const found = rank(from, words, phrase);
      state.matched = found.matched;
      state.shown = found.shown;
      state.last = phrase;
      state.at = words.length && state.shown.length ? 0 : -1;
      closeDrawer();
      repaint();
      room.classList.toggle("nod-room-none", !state.shown.length && !!state.all.length);
      sayCount();
      state.cost = state.cost * 0.6 + (performance.now() - began) * 0.4;
    };

    const searchSoon = () => {
      cancelAnimationFrame(searchDue);
      clearTimeout(searchTimer);
      if (state.cost > SLOW_SEARCH) searchTimer = setTimeout(runSearch, TYPE_PAUSE);
      else searchDue = requestAnimationFrame(runSearch);
    };

    const settle = () => {
      if (searchDue || searchTimer) runSearch();
    };

    const drawSide = () => {
      const counts = new Map();
      for (const item of state.all) {
        if (!state.hidden && item.off) continue;
        if (state.source !== "all" && item.one.source !== state.source) continue;
        counts.set(item.top, (counts.get(item.top) || 0) + 1);
      }
      if (state.chosen !== ALL && !counts.has(state.chosen)) state.chosen = ALL;
      const names = [...counts.keys()].sort((a, b) => a.localeCompare(b));
      const all = api.el("button", "nod-place", "Everything");
      all.dataset.top = ALL;
      const places = [all];
      for (const name of names) {
        const place = api.el("button", "nod-place", name);
        place.dataset.top = name;
        place.appendChild(api.el("span", "nod-count", String(counts.get(name))));
        places.push(place);
      }
      for (const place of places) {
        place.type = "button";
        place.classList.toggle("nod-place-on", place.dataset.top === state.chosen);
      }
      side.replaceChildren(...places);
    };

    const refilter = () => {
      state.pool = null;
      runSearch();
    };

    const fill = () => {
      state.all = api.graph.nodes()
        .filter((one) => !String(one.category || "").startsWith("__hidden__"))
        .map(preparedOf)
        .sort((a, b) => (a.shown < b.shown ? -1 : a.shown > b.shown ? 1 : 0));
      drawSide();
      refilter();
    };

    find.addEventListener("input", () => {
      state.term = find.value;
      clear.hidden = !find.value;
      searchSoon();
    });
    find.addEventListener("keydown", (event) => {
      if (event.isComposing) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        settle();
        if (!state.shown.length) return;
        const next = state.at < 0 ? 0
          : !state.open ? state.at
            : state.at + (event.key === "ArrowDown" ? 1 : -1);
        pick(Math.max(0, Math.min(state.shown.length - 1, next)));
      } else if (event.key === "Enter") {
        event.preventDefault();
        settle();
        const item = state.at >= 0 ? state.shown[state.at] : null;
        if (item) place(item.one);
      } else if (event.key === "Escape") {
        if (state.open) closeDrawer();
        else if (find.value) {
          find.value = "";
          state.term = "";
          clear.hidden = true;
          runSearch();
        } else return;
        event.preventDefault();
        event.stopPropagation();
      }
    });
    clear.onclick = () => {
      find.value = "";
      state.term = "";
      clear.hidden = true;
      runSearch();
      find.focus();
    };
    chips.addEventListener("click", (event) => {
      const chip = event.target instanceof Element ? event.target.closest(".nod-chip") : null;
      if (!chip || chip.dataset.source === state.source) return;
      state.source = chip.dataset.source;
      for (const one of chips.children) {
        one.setAttribute("aria-pressed", one === chip ? "true" : "false");
      }
      drawSide();
      refilter();
    });
    hiddenMark.addEventListener("change", () => {
      state.hidden = hiddenMark.checked;
      drawSide();
      refilter();
    });
    side.addEventListener("click", (event) => {
      const place = event.target instanceof Element ? event.target.closest(".nod-place") : null;
      if (!place || place.dataset.top === state.chosen) return;
      state.chosen = place.dataset.top;
      for (const one of side.children) {
        one.classList.toggle("nod-place-on", one === place);
      }
      refilter();
    });
    room.addEventListener("click", (event) => {
      const node = event.target instanceof Element ? event.target.closest(".nod-row") : null;
      if (node) pick(Number(node.dataset.at), { toggle: true });
    });
    shut.onclick = () => closeDrawer();
    drawer.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      closeDrawer();
      find.focus();
    });
    again.onclick = () => fill();
    list.addEventListener("scroll", paintSoon, { passive: true });
    const sized = new ResizeObserver(paintSoon);
    sized.observe(list);
    win.onClose(() => {
      sized.disconnect();
      cancelAnimationFrame(paintDue);
      cancelAnimationFrame(searchDue);
      clearTimeout(searchTimer);
    });

    api.style(`
      .nod-shell { display: flex; flex-direction: column; flex: 1; min-height: 0; }
      .nod-top { flex: none; display: flex; flex-direction: column; gap: 8px;
        padding: 10px 12px 9px; border-bottom: 1px solid var(--om-border); }
      .nod-search { position: relative; }
      .nod-search::before { content: ""; position: absolute; left: 12px; top: 50%;
        width: 15px; height: 15px; transform: translateY(-50%); pointer-events: none;
        background: currentColor; opacity: .5;
        -webkit-mask: url("${SEARCH_ART}") center / contain no-repeat;
        mask: url("${SEARCH_ART}") center / contain no-repeat; }
      .nod-find { width: 100%; height: 38px; box-sizing: border-box; padding: 0 38px 0 36px;
        border: 1px solid var(--om-border); border-radius: 8px; outline: none;
        background: var(--om-input); color: var(--om-text); font: inherit; font-size: 15px; }
      .nod-find:focus { border-color: var(--p-button-text-primary-color, #388bfd);
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--p-button-text-primary-color, #388bfd) 22%,
          transparent); }
      .nod-clear, .nod-shut { width: 26px; height: 26px; padding: 0; border: 0; border-radius: 6px;
        background: transparent; color: var(--om-muted); font-size: 17px; line-height: 1;
        cursor: pointer; }
      .nod-clear { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); }
      .nod-clear:hover, .nod-shut:hover { background: var(--om-hover); color: var(--om-text); }
      .nod-filters { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 12px;
        font-size: 12px; }
      .nod-chips { display: flex; gap: 4px; }
      .nod-chip { padding: 3px 11px; border: 1px solid var(--om-border); border-radius: 999px;
        background: transparent; color: var(--om-muted); font: inherit; cursor: pointer; }
      .nod-chip:hover { background: var(--om-hover); color: var(--om-text); }
      .nod-chip[aria-pressed="true"] { color: var(--om-text);
        background: color-mix(in srgb, var(--om-text) 12%, transparent);
        border-color: color-mix(in srgb, var(--om-text) 32%, transparent); }
      .nod-toggle { display: flex; align-items: center; gap: 5px; color: var(--om-muted);
        cursor: pointer; }
      .nod-again { margin-left: auto; }
      .nod { position: relative; display: flex; flex: 1; min-height: 0; overflow: hidden;
        container-type: inline-size; }
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
      .nod-main { flex: 1; min-width: 0; display: flex; flex-direction: column;
        transition: margin-right .2s cubic-bezier(.2, .8, .2, 1); }
      .nod-list { flex: 1; min-height: 0; overflow-y: auto; }
      .nod-room { position: relative; margin: 6px; }
      .nod-room-none::after { content: "Nothing matches that."; position: absolute; inset: 0 0 auto;
        padding: 24px; text-align: center; opacity: .6; }
      .nod-row { position: absolute; left: 0; right: 0; box-sizing: border-box;
        height: var(--nod-row-h, auto); padding: 6px 8px; overflow: hidden; border-radius: 6px;
        border: 1px solid transparent; cursor: grab; }
      .nod-row:hover { background: var(--om-hover); border-color: var(--om-border); }
      .nod-row-at, .nod-row-at:hover {
        background: color-mix(in srgb, var(--p-button-text-primary-color, #388bfd) 15%, transparent);
        border-color: color-mix(in srgb, var(--p-button-text-primary-color, #388bfd) 45%,
          transparent); }
      .nod-head { display: flex; align-items: baseline; gap: 7px; white-space: nowrap;
        overflow: hidden; }
      .nod-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; font-weight: 600;
        font-size: 12px; }
      .nod-type { min-width: 0; overflow: hidden; text-overflow: ellipsis; font-size: 11px;
        opacity: .5; }
      .nod-flag { flex: none; font-size: 10px; padding: 0 4px; border-radius: 3px;
        background: color-mix(in srgb, var(--om-text) 10%, transparent); opacity: .75; }
      .nod-under { display: flex; gap: 10px; margin-top: 1px; white-space: nowrap; overflow: hidden;
        font-size: 11px; opacity: .55; }
      .nod-cat { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
      .nod-ports { margin-left: auto; flex: none; }
      .nod-note { min-height: 1.35em; margin-top: 2px; overflow: hidden; text-overflow: ellipsis;
        white-space: nowrap; font-size: 11px; line-height: 1.35; opacity: .6; }
      .nod-status { flex: none; padding: 5px 10px; font-size: 11px; opacity: .65;
        border-top: 1px solid var(--om-border); }
      .nod-drawer { position: absolute; top: 0; right: 0; bottom: 0; z-index: 2;
        width: min(330px, 88%); display: flex; flex-direction: column;
        background: var(--om-bg); border-left: 1px solid var(--om-border);
        box-shadow: -10px 0 24px rgba(0, 0, 0, .35); visibility: hidden;
        transform: translateX(105%);
        transition: transform .2s cubic-bezier(.2, .8, .2, 1), visibility 0s linear .2s; }
      .nod-drawer-open .nod-drawer { visibility: visible; transform: none;
        transition: transform .2s cubic-bezier(.2, .8, .2, 1); }
      @container (min-width: 760px) {
        .nod-drawer-open .nod-main { margin-right: 330px; }
      }
      .nod-drawer-head { flex: none; display: flex; align-items: center; justify-content: space-between;
        gap: 8px; padding: 8px 10px; border-bottom: 1px solid var(--om-border); }
      .nod-drawer-body { flex: 1; min-height: 0; overflow-y: auto; display: flex;
        flex-direction: column; gap: 12px; padding: 12px; }
      .nod-drawer-body .om-node-card { flex: none; cursor: grab; }
      .nod-desc { margin: 0; font-size: 12px; line-height: 1.45; white-space: pre-wrap;
        overflow-wrap: anywhere; color: var(--om-text-2); }
      .nod-facts { display: grid; grid-template-columns: auto 1fr; gap: 4px 10px; margin: 0;
        font-size: 11px; }
      .nod-facts dt { color: var(--om-muted); }
      .nod-facts dd { margin: 0; overflow-wrap: anywhere; }
      @media (prefers-reduced-motion: reduce) {
        .nod-main, .nod-drawer, .nod-drawer-open .nod-drawer { transition: none; }
      }
    `);

    win.autofocus?.(find);
    requestAnimationFrame(() => setTimeout(fill, 0));
    return win;
  },
};
