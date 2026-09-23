const PAGE = 90;

const ICON_FOLDER = new URL("../../folder.svg", import.meta.url).href;

const KIND_WORD = {
  still: "Image", raw: "Unsupported format", video: "Video", audio: "Audio",
  text: "Text", other: "File",
};

export const program = {
  open(api) {
    const win = api.window({ size: "manager", title: "Gallery" });
    const state = {
      root: "output", path: "", sort: "new", kind: "all", find: "", deep: false,
      items: [], total: 0, capped: false, token: null, chosen: null,
      flows: new Map(),
    };

    const root = api.el("select", "om-side-select gal-pick");
    for (const name of api.assets.roots) {
      const option = api.el("option", null, name);
      option.value = name;
      root.appendChild(option);
    }
    const sort = api.el("select", "om-side-select gal-pick");
    for (const [value, label] of [["new", "Newest first"], ["old", "Oldest first"],
                                  ["name", "Name A-Z"], ["size", "Largest first"]]) {
      const option = api.el("option", null, label);
      option.value = value;
      sort.appendChild(option);
    }
    const kind = api.el("select", "om-side-select gal-pick");
    for (const [value, label] of [["all", "Everything"], ["still", "Images"],
                                  ["video", "Videos"], ["audio", "Audio"]]) {
      const option = api.el("option", null, label);
      option.value = value;
      kind.appendChild(option);
    }
    const find = api.el("input", "om-search gal-find");
    find.placeholder = "Search this folder by name";
    find.spellcheck = false;
    const deep = api.el("label", "gal-deep");
    const deepMark = api.el("input");
    deepMark.type = "checkbox";
    deep.title = "Search the workflows embedded in this folder's images.";
    deep.appendChild(deepMark);
    deep.appendChild(api.el("span", null, "In workflows"));
    win.tools.appendChild(root);
    win.tools.appendChild(kind);
    win.tools.appendChild(sort);
    win.tools.appendChild(find);
    win.tools.appendChild(deep);

    const wrap = api.el("div", "gal");
    const left = api.el("div", "gal-left");
    const bar = api.el("div", "gal-bar");
    const nav = api.el("div", "gal-nav");
    const back = api.el("button", "gal-nav-btn", "‹");
    back.title = "Back";
    const ahead = api.el("button", "gal-nav-btn", "›");
    ahead.title = "Forward";
    const up = api.el("button", "gal-nav-btn", "↑");
    up.title = "Up one folder";
    nav.appendChild(back);
    nav.appendChild(ahead);
    nav.appendChild(up);
    const trail = api.el("div", "gal-trail");
    bar.appendChild(nav);
    bar.appendChild(trail);
    const grid = api.el("div", "gal-grid");
    const count = api.el("div", "gal-count", "");
    left.appendChild(bar);
    left.appendChild(grid);
    left.appendChild(count);
    const grip = api.el("div", "gal-grip");
    const drawer = api.el("div", "gal-drawer");
    const drawerBody = api.el("div", "gal-drawer-body");
    const drawerFoot = api.el("div", "gal-tools");
    drawer.appendChild(drawerBody);
    drawer.appendChild(drawerFoot);
    wrap.appendChild(left);
    wrap.appendChild(grip);
    wrap.appendChild(drawer);
    win.body.appendChild(wrap);

    const EDGE = Math.max(80, Math.min(320,
      Math.round(Number(api.setting("openManager.galleryThumb", 124)) || 124)));
    grid.style.setProperty("--gal-edge", `${EDGE}px`);

    const DRAWER_MIN = 180;
    const DRAWER_MAX = 720;
    const setDrawer = (width) => {
      const held = Math.max(DRAWER_MIN, Math.min(DRAWER_MAX, Math.round(width)));
      drawer.style.width = `${held}px`;
      return held;
    };
    api.storage.get("drawer", 260).then((held) => setDrawer(Number(held) || 260));
    grip.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      grip.setPointerCapture(event.pointerId);
      const from = { x: event.clientX, width: drawer.offsetWidth };
      const move = (held) => setDrawer(from.width - (held.clientX - from.x));
      const done = () => {
        grip.removeEventListener("pointermove", move);
        grip.removeEventListener("pointerup", done);
        grip.removeEventListener("pointercancel", done);
        api.storage.set("drawer", drawer.offsetWidth);
      };
      grip.addEventListener("pointermove", move);
      grip.addEventListener("pointerup", done);
      grip.addEventListener("pointercancel", done);
    });

    const paintShot = (host, item, onShown, onFail = null) => {
      const shot = api.el("img", "gal-shot");
      shot.loading = "lazy";
      shot.alt = "";
      shot.onload = () => onShown?.();
      shot.onerror = () => {
        if (onFail) { shot.remove(); onFail(); return; }
        if (shot.dataset.fell) { shot.remove(); return; }
        shot.dataset.fell = "1";
        shot.src = api.assets.hostPreview({ ...item, root: state.root });
      };
      shot.src = api.assets.preview({ ...item, root: state.root }, state.root, EDGE * 2);
      host.appendChild(shot);
      return shot;
    };

    const paintFrame = (host, item, onShown) => {
      const play = api.el("video", "gal-shot gal-frame");
      play.preload = "metadata";
      play.muted = true;
      play.playsInline = true;
      play.tabIndex = -1;
      play.onloadeddata = () => onShown?.();
      play.onerror = () => play.remove();
      play.src = `${api.assets.url({ ...item, root: state.root })}#t=0.1`;
      host.appendChild(play);
      return play;
    };

    const watcher = new IntersectionObserver((rows) => {
      for (const row of rows) {
        if (!row.isIntersecting) continue;
        const cell = row.target;
        watcher.unobserve(cell);
        cell._fill?.();
      }
    }, { root: grid, rootMargin: "300px" });

    const seen = { path: [""], at: 0 };

    const paintNav = () => {
      back.disabled = seen.at <= 0;
      ahead.disabled = seen.at < 0 || seen.at >= seen.path.length - 1;
      up.disabled = !state.path;
    };

    const goTo = (path, { record = true } = {}) => {
      const wanted = String(path || "");
      state.path = wanted;
      state.chosen = null;
      if (record) {
        seen.path = seen.path.slice(0, seen.at + 1);
        if (seen.path[seen.path.length - 1] !== wanted) seen.path.push(wanted);
        seen.at = seen.path.length - 1;
      }
      paintNav();
      drawDrawer();
      fill();
    };

    const hop = (by) => {
      const to = seen.at + by;
      if (to < 0 || to >= seen.path.length) return;
      seen.at = to;
      goTo(seen.path[to], { record: false });
    };

    back.onclick = () => hop(-1);
    ahead.onclick = () => hop(1);
    up.onclick = () => {
      if (!state.path) return;
      const parts = state.path.split("/");
      parts.pop();
      goTo(parts.join("/"));
    };

    const drawTrail = () => {
      trail.replaceChildren();
      const step = (label, to, last) => {
        const crumb = api.el("button", `gal-step${last ? " gal-step-here" : ""}`, label);
        crumb.onclick = () => goTo(to);
        trail.appendChild(crumb);
      };
      const parts = state.path ? state.path.split("/") : [];
      step(state.root, "", !parts.length);
      let walked = "";
      parts.forEach((part, at) => {
        walked = walked ? `${walked}/${part}` : part;
        trail.appendChild(api.el("span", "gal-sep", "›"));
        step(part, walked, at === parts.length - 1);
      });
      paintNav();
    };

    const drawDrawer = async () => {
      const item = state.chosen;
      if (!item) {
        drawerBody.replaceChildren(api.el("div", "gal-none", "Nothing selected."));
        drawerFoot.replaceChildren();
        return;
      }
      drawerBody.replaceChildren();
      const frame = api.el("div", "gal-show");
      if (item.kind === "still") {
        const big = api.el("img", "gal-big");
        big.src = api.assets.preview({ ...item, root: state.root });
        frame.appendChild(big);
      } else if (item.kind === "video") {
        const play = api.el("video", "gal-big");
        play.controls = true;
        play.preload = "metadata";
        play.src = api.assets.url({ ...item, root: state.root });
        frame.appendChild(play);
      } else if (item.kind === "audio") {
        const play = api.el("audio", "gal-sound");
        play.controls = true;
        play.preload = "metadata";
        play.src = api.assets.url({ ...item, root: state.root });
        frame.appendChild(play);
      } else {
        frame.appendChild(api.el("div", "gal-none", KIND_WORD[item.kind] || "File"));
      }
      drawerBody.appendChild(frame);
      drawerBody.appendChild(api.el("div", "gal-name", item.name));
      const facts = api.el("div", "gal-facts");
      const fact = (label, value) => {
        const row = api.el("div", "gal-fact");
        row.appendChild(api.el("span", "gal-fact-key", label));
        row.appendChild(api.el("span", "gal-fact-value", value));
        facts.appendChild(row);
        return row;
      };
      fact("Kind", KIND_WORD[item.kind] || "File");
      fact("Size", api.bytes(item.size));
      fact("Made", api.when(new Date(item.at * 1000)));
      if (item.sub) fact("In", item.sub);
      const flow = fact("Workflow", "Reading");
      drawerBody.appendChild(facts);

      const held = assetKey(item);
      if (state.flows.has(held)) {
        flow.querySelector(".gal-fact-value").textContent =
          state.flows.get(held) ? "Embedded" : "None";
      } else {
        const found = await api.assets.workflow({ ...item, root: state.root });
        state.flows.set(held, !!found);
        if (state.chosen === item) {
          flow.querySelector(".gal-fact-value").textContent =
            found ? "Embedded" : "None";
        }
      }
      const tools = drawerFoot;
      tools.replaceChildren();
      const open = api.el("button", "om-btn om-go", PLAYS.has(item.kind) ? "Play" : "View");
      open.disabled = !PLAYS.has(item.kind) && item.kind !== "still";
      open.onclick = () => show(item);
      tools.appendChild(open);
      const load = api.el("button", "om-btn", "Load workflow");
      load.disabled = !state.flows.get(held);
      load.onclick = () => api.assets.load({ ...item, root: state.root }, state.root);
      const save = api.el("a", "om-btn");
      save.textContent = "Download";
      save.href = api.assets.url({ ...item, root: state.root });
      save.download = item.name;
      tools.appendChild(load);
      tools.appendChild(save);
      if (isPng(item)) {
        const take = api.el("button", "om-btn om-danger", "Remove workflow");
        take.disabled = !state.flows.get(held);
        take.onclick = () => takeFlow(item);
        tools.appendChild(take);
      }
    };

    const assetKey = (item) => `${state.root}:${item.sub}/${item.name}`;

    const PLAYS = new Set(["video", "audio"]);

    const show = (item) => {
      if (!PLAYS.has(item.kind) && item.kind !== "still") {
        api.notify(item.name, "No viewer for this kind of file.");
        return;
      }
      api.run(PLAYS.has(item.kind) ? "player" : "viewer",
              { items: state.items, name: item.name, root: state.root });
    };

    const isPng = (item) => /\.png$/i.test(String(item?.name || ""));

    const takeFlow = async (item) => {
      const sure = await api.confirm(`Remove the workflow from ${item.name}?`,
        "Only the embedded workflow is removed. There is no undo.", "Remove");
      if (!sure) return;
      const answer = await api.assets.strip(state.root, api.assets.path(item));
      if (!answer?.ok) {
        api.notify("Still there", answer?.reason || "The workflow could not be removed.");
        return;
      }
      state.flows.set(assetKey(item), false);
      api.notify(item.name, answer.removed.length
        ? `Removed ${answer.removed.join(" and ")}.`
        : "There was no workflow in it after all.");
      if (state.chosen === item) drawDrawer();
    };

    const menuFor = (item) => {
      const held = assetKey(item);
      return [
        (item.kind === "still" || PLAYS.has(item.kind))
          ? { label: PLAYS.has(item.kind) ? "Play" : "View", fn: () => show(item) }
          : null,
        state.flows.get(held)
          ? { label: "Load workflow", fn: () => api.assets.load({ ...item, root: state.root }, state.root) }
          : null,
        state.flows.get(held) && isPng(item)
          ? { label: "Remove workflow", danger: true, fn: () => takeFlow(item) }
          : null,
        { label: "Delete", danger: true, fn: async () => {
          const sure = await api.confirm(`Delete ${item.name}?`,
            "There is no undo.", "Delete");
          if (!sure) return;
          const answer = await api.assets.remove(state.root, api.assets.path(item));
          if (!answer?.ok) {
            api.notify("Not deleted", answer?.reason || "It could not be deleted.");
            return;
          }
          if (state.chosen === item) { state.chosen = null; drawDrawer(); }
          fill();
        } },
      ].filter(Boolean);
    };

    const cellFor = (item) => {
      const cell = api.el("div", "gal-cell");
      const art = api.el("div", "gal-art");
      art.appendChild(api.el("span", "gal-mark", item.kind === "video" ? "▶" : ""));
      cell.appendChild(art);
      cell.appendChild(api.el("span", "gal-label", item.name));
      cell.title = item.name;
      const shown = () => cell.classList.add("gal-cell-shown");
      cell._fill = () => {
        if (!item.thumb) return;
        if (item.kind === "video") paintShot(art, item, shown, () => paintFrame(art, item, shown));
        else paintShot(art, item, shown);
      };
      cell.onclick = () => {
        for (const other of grid.querySelectorAll(".gal-cell-on")) {
          other.classList.remove("gal-cell-on");
        }
        cell.classList.add("gal-cell-on");
        state.chosen = item;
        drawDrawer();
      };
      cell.ondblclick = () => show(item);
      if (item.kind === "still" || item.kind === "video") {
        api.assets.drag(cell, item, state.root);
      }
      cell.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        cell.onclick();
        api.menu(cell, menuFor(item));
      });
      watcher.observe(cell);
      return cell;
    };

    const folderCell = (name) => {
      const cell = api.el("div", "gal-cell gal-folder");
      const art = api.el("div", "gal-art");
      const mosaic = api.el("div", "gal-mosaic");
      art.appendChild(mosaic);
      art.appendChild(api.el("span", "gal-folder-art"));
      cell.appendChild(art);
      const label = api.el("span", "gal-label gal-label-folder", name);
      cell.appendChild(label);
      cell.title = name;
      const inside = state.path ? `${state.path}/${name}` : name;
      cell._fill = async () => {
        const found = await api.assets.peek(state.root, inside, 4);
        if (!win.isOpen() || !found.items?.length) return;
        mosaic.dataset.held = String(Math.min(4, found.items.length));
        for (const one of found.items.slice(0, 4)) {
          const tile = api.el("div", "gal-tile");
          mosaic.appendChild(tile);
          paintShot(tile, one, () => cell.classList.add("gal-cell-shown"));
        }
      };
      cell.onclick = () => goTo(inside);
      watcher.observe(cell);
      return cell;
    };

    const dig = async () => {
      const answer = await api.assets.search({
        root: state.root, path: state.path, find: state.find, size: PAGE,
      });
      if (!win.isOpen()) return;
      if (!answer.ok) {
        grid.replaceChildren(api.el("div", "gal-none",
          answer.reason || "That search could not be run."));
        count.textContent = "";
        return;
      }
      state.total = answer.items.length;
      state.items = answer.items.slice();
      drawTrail();
      const cells = answer.items.map(cellFor);
      grid.replaceChildren(...(cells.length
        ? cells
        : [api.el("div", "gal-none", "No workflow in this folder mentions that.")]));
      count.textContent = `${api.count(answer.items.length, "file")} of `
        + `${api.count(answer.read, "image")} read`
        + `${answer.capped ? ", stopped before the end" : ""}`;
    };

    const tally = () => {
      const held = state.items.length;
      count.textContent = held >= state.total
        ? `${api.count(held, "file")}${state.capped ? " (partial)" : ""}`
        : `${api.count(held, "file")} of ${state.total}`;
    };

    const CHUNK = 400;

    const pour = (made) => new Promise((settle) => {
      let at = 0;
      const step = () => {
        if (!win.isOpen()) { settle(); return; }
        grid.append(...made.slice(at, at + CHUNK));
        at += CHUNK;
        if (at >= made.length) { settle(); return; }
        requestAnimationFrame(step);
      };
      step();
    });

    const DRAIN = 500;

    const drain = async (token) => {
      while (state.items.length < state.total) {
        const held = state.items.length;
        const page = Math.floor(held / DRAIN);
        const next = await api.assets.list({
          root: state.root, path: state.path, page, size: DRAIN,
          sort: state.sort, kind: state.kind, find: state.find,
        });
        if (token !== state.token || !win.isOpen()) return;
        if (!next.ok) return;
        const fresh = next.items.slice(held - page * DRAIN);
        if (!fresh.length) return;
        state.items = state.items.concat(fresh);
        await pour(fresh.map(cellFor));
        if (token !== state.token) return;
        tally();
      }
    };

    const fill = async () => {
      const token = {};
      state.token = token;
      grid.replaceChildren(api.el("div", "gal-none",
        state.deep && state.find ? "Reading the workflows" : "Reading the folder"));
      if (state.deep && state.find) return dig();
      const answer = await api.assets.list({
        root: state.root, path: state.path, page: 0, size: 0,
        sort: state.sort, kind: state.kind, find: state.find,
      });
      if (!win.isOpen() || token !== state.token) return;
      if (!answer.ok) {
        grid.replaceChildren(api.el("div", "gal-none",
          answer.reason || "That folder could not be read."));
        count.textContent = "";
        return;
      }
      state.total = answer.total;
      state.capped = !!answer.capped;
      state.items = answer.items.slice();
      drawTrail();
      grid.replaceChildren();
      await pour([...answer.folders.map(folderCell), ...answer.items.map(cellFor)]);
      if (token !== state.token) return;
      if (!grid.childElementCount) {
        grid.replaceChildren(api.el("div", "gal-none", "Nothing here."));
      }
      tally();
      void drain(token);
    };
    root.onchange = () => {
      state.root = root.value;
      seen.path = [];
      seen.at = -1;
      goTo("");
    };
    sort.onchange = () => { state.sort = sort.value; fill(); };
    kind.onchange = () => { state.kind = kind.value; fill(); };
    let typing = 0;
    find.oninput = () => {
      clearTimeout(typing);
      typing = setTimeout(() => { state.find = find.value.trim(); fill(); }, 250);
    };
    deepMark.onchange = () => {
      state.deep = deepMark.checked;
      find.placeholder = state.deep
        ? "Search the workflows in this folder"
        : "Search this folder by name";
      if (state.find) fill();
    };

    api.style(`
      .gal { display: flex; height: 100%; min-height: 0; }
      .gal-left { flex: 1; min-width: 0; display: flex; flex-direction: column; padding: 8px; }
      .gal-bar { display: flex; align-items: center; gap: 8px; flex: none; margin-bottom: 8px;
        padding: 4px 6px; border: 1px solid var(--om-border); border-radius: 6px;
        background: var(--om-input); }
      .gal-nav { display: flex; align-items: center; gap: 2px; flex: none; }
      .gal-nav-btn { width: 26px; height: 26px; flex: none; display: inline-flex;
        align-items: center; justify-content: center; padding: 0; border: 0; border-radius: 5px;
        background: transparent; color: var(--om-text-2); font-size: 15px; line-height: 1;
        cursor: pointer; }
      .gal-nav-btn:hover:not(:disabled) { background: var(--om-hover); color: var(--om-text); }
      .gal-nav-btn:disabled { opacity: .3; cursor: default; }
      .gal-trail { display: flex; align-items: center; gap: 2px; flex: 1; min-width: 0;
        flex-wrap: wrap; font-size: 13px; }
      .gal-step { padding: 3px 8px; border: 0; border-radius: 5px; background: transparent;
        color: var(--om-text-2); font: inherit; font-size: 13px; cursor: pointer;
        max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .gal-step:hover { background: var(--om-hover); color: var(--om-text); }
      .gal-step-here { color: var(--om-text); font-weight: 600; }
      .gal-sep { color: var(--om-muted); flex: none; }
      .gal-grid { flex: 1; min-height: 0; overflow: auto; display: grid; gap: 8px;
        grid-template-columns: repeat(auto-fill, minmax(var(--gal-edge, 124px), 1fr));
        grid-auto-rows: calc(var(--gal-edge, 124px) + 22px);
        align-content: start; }
      .gal-cell { display: flex; flex-direction: column; gap: 3px; height: 100%;
        min-width: 0; cursor: pointer; }
      .gal-art { position: relative; flex: 1; min-height: 0; overflow: hidden;
        border-radius: 6px; background: var(--om-input);
        border: 1px solid var(--om-border); }
      .gal-cell:hover .gal-art {
        border-color: color-mix(in srgb, var(--om-text) 30%, var(--om-border)); }
      .gal-cell-on .gal-art { outline: 2px solid var(--p-button-text-primary-color, #388bfd);
        outline-offset: -2px; }
      .gal-folder .gal-art { background: color-mix(in srgb, var(--om-text) 6%, var(--om-input)); }
      .gal-shot { position: absolute; inset: 0; width: 100%; height: 100%;
        object-fit: cover; opacity: 0; transition: opacity .15s linear; background: #000; }
      .gal-cell-shown .gal-shot { opacity: 1; }
      .gal-mark { position: absolute; top: 5px; left: 7px; font-size: 12px; z-index: 1;
        color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,.9); pointer-events: none; }
      .gal-folder-art { position: absolute; inset: 0; z-index: 2; pointer-events: none;
        display: grid; place-items: end start; padding: 0 0 2px 3px;
        background: radial-gradient(86% 68% at 0% 100%, rgba(0,0,0,.62), transparent 72%); }
      .gal-folder-art::before { content: ""; width: 40%; aspect-ratio: 1;
        background: rgba(255,255,255,.95);
        filter: drop-shadow(0 1px 4px rgba(0,0,0,.85));
        -webkit-mask: center / contain no-repeat url("${ICON_FOLDER}");
        mask: center / contain no-repeat url("${ICON_FOLDER}"); }
      .gal-mosaic { position: absolute; inset: 0; display: grid; gap: 2px;
        grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; }
      .gal-mosaic[data-held="1"] { grid-template-columns: 1fr; grid-template-rows: 1fr; }
      .gal-mosaic[data-held="2"] { grid-template-rows: 1fr; }
      .gal-mosaic[data-held="3"] .gal-tile:first-child { grid-row: span 2; }
      .gal-tile { position: relative; overflow: hidden; min-width: 0; min-height: 0; }
      .gal-label { flex: none; height: 17px; line-height: 17px; font-size: 11px;
        color: var(--om-text-2); text-align: center; padding: 0 2px;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .gal-label-folder { color: var(--om-text); font-weight: 600; }
      .gal-count { padding-top: 6px; color: var(--om-muted); font-size: 11px; }
      .gal-grip { flex: none; width: 7px; cursor: col-resize; align-self: stretch;
        border-left: 1px solid var(--om-border); }
      .gal-grip:hover { background: color-mix(in srgb, var(--om-text) 14%, transparent); }
      .gal-drawer { flex: none; width: 260px; min-width: 0;
        display: flex; flex-direction: column; min-height: 0; }
      .gal-drawer-body { flex: 1; min-height: 0; overflow: auto; padding: 10px;
        display: flex; flex-direction: column; gap: 10px; }
      .gal-show { display: flex; align-items: center; justify-content: center;
        background: var(--om-input); border-radius: 8px; min-height: 150px; overflow: hidden; }
      .gal-big { max-width: 100%; max-height: 40vh; }
      .gal-sound { width: 100%; }
      .gal-name { font-size: 13px; font-weight: 600; overflow-wrap: anywhere; }
      .gal-facts { display: flex; flex-direction: column; gap: 4px; }
      .gal-fact { display: flex; gap: 8px; font-size: 12px; }
      .gal-fact-key { flex: none; width: 66px; color: var(--om-muted); }
      .gal-fact-value { flex: 1; min-width: 0; overflow-wrap: anywhere; }
      .gal-tools { flex: none; display: flex; flex-wrap: wrap; gap: 6px; padding: 8px 10px;
        border-top: 1px solid var(--om-border); background: var(--om-surface); }
      .gal-tools > * { flex: 1 1 104px; min-width: 0; }
      .gal-tools:empty { display: none; }
      .gal-tools .om-btn { text-decoration: none; text-align: center; padding: 6px 8px;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .gal-tools .om-btn:disabled { opacity: .45; cursor: default; }
      .gal-tools .om-btn:disabled:hover { background: var(--om-surface); }
      .gal-tools .om-btn.om-danger:disabled:hover { background: #a5261d; }
      .gal-none { color: var(--om-muted); font-size: 12px; padding: 10px; }
      .gal-find { flex: 1 1 160px; min-width: 120px; }
      .gal-deep { display: inline-flex; align-items: center; gap: 6px; flex: none;
        color: var(--om-text-2); font-size: 12px; cursor: pointer; white-space: nowrap; }
      .gal-pick { flex: 0 0 auto; }
    `);

    drawDrawer();
    fill();
    return win;
  },
};
