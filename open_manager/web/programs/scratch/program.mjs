export const program = {
  open(api) {
    const win = api.window({ size: "note", title: "Scratch" });
    const wrap = api.el("div", "scratch");
    const list = api.el("div", "scratch-list");
    const field = api.el("textarea", "scratch-field");
    field.placeholder = "New note";
    field.rows = 3;

    const keep = api.el("button", "om-btn om-go", "Keep");
    const wipe = api.el("button", "om-btn", "Forget them all");
    win.tools.appendChild(keep);
    win.tools.appendChild(wipe);

    const draw = (lines) => {
      list.replaceChildren(...lines.map((text, at) => {
        const row = api.el("div", "scratch-row");
        row.appendChild(api.el("span", "scratch-text", text));
        const drop = api.el("button", "om-btn", "Forget");
        drop.onclick = async () => {
          const held = await api.storage.get("lines", []);
          held.splice(at, 1);
          await api.storage.set("lines", held);
          draw(held);
        };
        row.appendChild(drop);
        return row;
      }));
      if (!lines.length) list.appendChild(api.el("div", "scratch-none", "Nothing kept yet."));
    };

    keep.onclick = async () => {
      const text = field.value.trim();
      if (!text) return;
      const held = await api.storage.get("lines", []);
      held.unshift(text.slice(0, 400));
      await api.storage.set("lines", held.slice(0, 50));
      field.value = "";
      draw(held.slice(0, 50));
    };

    wipe.onclick = async () => {
      if (!await api.confirm("Forget everything here?", "The notes in this window go.")) return;
      await api.storage.set("lines", []);
      draw([]);
    };

    wrap.appendChild(field);
    wrap.appendChild(list);
    win.body.appendChild(wrap);
    api.style(`
      .scratch { display: flex; flex-direction: column; gap: 10px; padding: 12px; height: 100%;
        min-height: 0; }
      .scratch-field { resize: none; border-radius: 6px; border: 1px solid var(--om-border);
        background: var(--om-input); color: var(--om-text); padding: 8px 10px;
        font: 13px/1.5 system-ui, sans-serif; }
      .scratch-list { flex: 1; min-height: 0; overflow: auto; display: flex;
        flex-direction: column; gap: 4px; }
      .scratch-row { display: flex; align-items: center; gap: 8px; padding: 6px 8px;
        border-radius: 6px; background: var(--om-input); }
      .scratch-text { flex: 1; min-width: 0; overflow-wrap: anywhere; font-size: 12px; }
      .scratch-none { color: var(--om-muted); font-size: 12px; padding: 6px 8px; }
    `);

    api.storage.get("lines", []).then(draw);
    return win;
  },
};
