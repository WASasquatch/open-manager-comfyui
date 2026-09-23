export const program = {
  open(api, carried) {
    const win = api.window({ size: "pack", title: "Video Player" });
    const state = { items: [], at: 0, root: "output" };

    const stage = api.el("div", "pl-stage");
    const play = api.el("video", "pl-video");
    play.controls = true;
    play.preload = "metadata";
    stage.appendChild(play);
    const where = api.el("div", "pl-where", "");
    win.body.appendChild(stage);
    win.body.appendChild(where);

    const button = (label, title, fn) => {
      const one = api.el("button", "om-btn pl-btn", label);
      one.title = title;
      one.onclick = fn;
      win.tools.appendChild(one);
      return one;
    };

    const draw = () => {
      const item = state.items[state.at];
      if (!item) {
        play.removeAttribute("src");
        where.textContent = "Nothing to play.";
        return;
      }
      play.src = api.assets.url({ ...item, root: state.root });
      stage.classList.toggle("pl-sound", item.kind === "audio");
      win.setTitle(item.name);
      remember();
      where.textContent = `${item.name} · ${state.at + 1} of ${state.items.length}`;
    };

    const go = (by) => {
      if (!state.items.length) return;
      state.at = (state.at + by + state.items.length) % state.items.length;
      draw();
      play.play().catch(() => {});
    };

    button("‹", "The one before", () => go(-1));
    button("›", "The next one", () => go(1));
    const loop = api.el("label", "pl-loop");
    const mark = api.el("input");
    mark.type = "checkbox";
    mark.onchange = () => { play.loop = mark.checked; };
    loop.appendChild(mark);
    loop.appendChild(api.el("span", null, "Loop"));
    win.tools.appendChild(loop);

    const save = () => {
      const item = state.items[state.at];
      if (!item) return;
      const link = api.el("a");
      link.href = api.assets.url({ ...item, root: state.root });
      link.download = item.name;
      link.style.display = "none";
      win.body.appendChild(link);
      link.click();
      setTimeout(() => link.remove(), 0);
    };

    const drop = async () => {
      const item = state.items[state.at];
      if (!item) return;
      const sure = await api.confirm(`Delete ${item.name}?`,
        "There is no undo.", "Delete");
      if (!sure) return;
      const answer = await api.assets.remove(state.root, api.assets.path(item));
      if (!answer?.ok) {
        api.notify("Not deleted", answer?.reason || "It could not be deleted.");
        return;
      }
      state.items.splice(state.at, 1);
      if (state.at >= state.items.length) state.at = 0;
      draw();
    };

    const canDrop = () =>
      api.canWrite() || api.assets.roots.includes(state.root);

    const file = api.el("button", "om-btn pl-btn pl-file om-tools-menu", "File");
    file.title = "What to do with this file";
    file.onclick = () => api.menu(file, [
      { label: "Export", fn: save },
      canDrop() && { label: "Delete", danger: true, fn: drop },
      { label: "Close", fn: () => win.close() },
    ].filter(Boolean));
    win.tools.appendChild(file);

    play.addEventListener("error", () => {
      const item = state.items[state.at];
      where.textContent = item ? `${item.name} · Unsupported format` : "Unsupported format";
    });
    play.addEventListener("ended", () => {
      if (play.loop) return;
      if (!(play.duration > 1)) return;
      go(1);
    });

    const slot = `last:${api.view || "main"}`;

    const remember = () => {
      const item = state.items[state.at];
      if (!item) return;
      api.storage.set(slot, { root: state.root, sub: item.sub || "",
                              name: item.name, kind: item.kind });
    };

    const recall = async () => {
      const held = await api.storage.get(slot, null);
      if (!held?.name || !win.isOpen()) return;
      const listing = await api.assets.list({
        root: held.root || "output", path: held.sub || "",
        kind: held.kind || "video", size: 0,
      });
      if (!win.isOpen()) return;
      const items = listing.items || [];
      if (!items.some((one) => one.name === held.name)) {
        where.textContent = `${held.name} · No longer there`;
        return;
      }
      take({ items, name: held.name, root: held.root || "output" });
    };

    const take = (payload) => {
      if (!payload) return;
      state.items = (payload.items || [])
        .filter((one) => one.kind === "video" || one.kind === "audio");
      state.root = payload.root || "output";
      const wanted = payload.name
        ? state.items.findIndex((one) => one.name === payload.name)
        : 0;
      state.at = wanted < 0 ? 0 : wanted;
      draw();
      win.present();
    };
    win.onCarry(take);

    api.style(`
      .pl-stage { flex: 1; min-height: 0; display: flex; align-items: center;
        justify-content: center; background: #0b0d0b; }
      .pl-video { width: 100%; height: 100%; object-fit: contain; }
      .pl-stage.pl-sound .pl-video { height: auto; max-height: 60px; }
      .pl-where { flex: none; padding: 6px 10px; color: var(--om-muted); font-size: 11px;
        border-top: 1px solid var(--om-border); overflow: hidden; text-overflow: ellipsis;
        white-space: nowrap; }
      .pl-btn { min-width: 30px; padding: 4px 8px; }
      .pl-loop { display: inline-flex; align-items: center; gap: 6px; color: var(--om-text-2);
        font-size: 12px; cursor: pointer; }
    `);

    if (carried) take(carried);
    else void recall();
    return win;
  },
};
