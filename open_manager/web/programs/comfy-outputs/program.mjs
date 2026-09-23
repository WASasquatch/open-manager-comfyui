const HISTORY = "/api/history";

const STILL = new Set(["png", "jpg", "jpeg", "webp", "gif", "bmp", "avif"]);

const MOVING = new Set(["mp4", "webm", "mkv", "mov", "m4v"]);

const SOUND = new Set(["mp3", "wav", "flac", "ogg", "m4a"]);

function suffixOf(name) {
  const at = String(name || "").lastIndexOf(".");
  return at < 0 ? "" : String(name).slice(at + 1).toLowerCase();
}

function kindOf(name) {
  const suffix = suffixOf(name);
  if (STILL.has(suffix)) return "still";
  if (MOVING.has(suffix)) return "video";
  if (SOUND.has(suffix)) return "audio";
  return "other";
}

function viewUrl(one) {
  const query = new URLSearchParams({
    filename: one.filename || "",
    subfolder: one.subfolder || "",
    type: one.type || "output",
  });
  return `/api/view?${query}`;
}

function stamp(run) {
  for (const [name, held] of run?.status?.messages || []) {
    if (name === "execution_success" || name === "execution_start") {
      const at = Number(held?.timestamp);
      if (Number.isFinite(at)) return at;
    }
  }
  return 0;
}

function itemsOf(outputs) {
  const found = [];
  for (const [node, held] of Object.entries(outputs || {})) {
    for (const carried of Object.values(held || {})) {
      if (!Array.isArray(carried)) continue;
      for (const one of carried) {
        if (!one || typeof one !== "object" || !one.filename) continue;
        found.push({ node, filename: one.filename, subfolder: one.subfolder || "",
                     type: one.type || "output", kind: kindOf(one.filename) });
      }
    }
  }
  return found;
}

export const program = {
  open(api) {
    const win = api.window({ size: "manager", title: "Outputs" });
    const state = { runs: [], kind: "all", watching: null, seen: new Set() };

    const kind = api.el("select", "om-side-select out-pick");
    for (const [value, label] of [["all", "Everything"], ["still", "Images"],
                                  ["video", "Videos"], ["audio", "Audio"]]) {
      const option = api.el("option", null, label);
      option.value = value;
      kind.appendChild(option);
    }
    const again = api.el("button", "om-btn", "Reload");
    again.title = "Read the run history again.";
    win.tools.appendChild(kind);
    win.tools.appendChild(again);

    const grid = api.el("div", "out-grid");
    const status = api.el("div", "out-status", "Reading what this ComfyUI has made...");
    win.body.appendChild(grid);
    win.body.appendChild(status);

    const shownRuns = () => state.runs
      .map((run) => ({ ...run, items: run.items.filter((one) => state.kind === "all"
        || one.kind === state.kind) }))
      .filter((run) => run.items.length);

    const openItem = (run, one) => {
      const beside = run.items.filter((other) => other.kind === one.kind);
      api.run(one.kind === "video" || one.kind === "audio" ? "player" : "viewer", {
        items: beside.map((other) => ({ name: other.filename, sub: other.subfolder,
                                        kind: other.kind })),
        name: one.filename,
        root: one.type,
      });
    };

    const cellFor = (run, one) => {
      const cell = api.el("div", `out-cell out-${one.kind}`);
      cell.tabIndex = 0;
      if (one.kind === "still") {
        const art = api.el("img", "out-art");
        art.loading = "lazy";
        art.alt = one.filename;
        art.src = viewUrl(one);
        cell.appendChild(art);
      } else if (one.kind === "video") {
        const art = api.el("video", "out-art");
        art.src = viewUrl(one);
        art.muted = true;
        art.preload = "metadata";
        cell.appendChild(art);
      } else {
        cell.appendChild(api.el("div", "out-glyph", one.kind === "audio" ? "♪" : "▤"));
      }
      cell.appendChild(api.el("div", "out-name", one.filename));
      api.tip(cell, () => ({
        lead: one.filename,
        facts: [
          ["From", `node ${one.node}`],
          ["Where", one.type + (one.subfolder ? `/${one.subfolder}` : "")],
          run.at ? ["Made", api.when(new Date(run.at))] : null,
        ].filter(Boolean),
      }));
      cell.onclick = () => openItem(run, one);
      cell.onkeydown = (event) => {
        if (event.key === "Enter") { event.preventDefault(); openItem(run, one); }
      };
      return cell;
    };

    const draw = () => {
      const runs = shownRuns();
      grid.replaceChildren();
      let count = 0;
      for (const run of runs) {
        const head = api.el("div", "out-head");
        head.appendChild(api.el("span", "out-when",
          run.at ? api.when(new Date(run.at)) : "Just now"));
        head.appendChild(api.el("span", "out-count",
          `${run.items.length} file${run.items.length === 1 ? "" : "s"}`));
        if (run.live) head.appendChild(api.el("span", "out-live", "this session"));
        grid.appendChild(head);
        const row = api.el("div", "out-row");
        for (const one of run.items) { row.appendChild(cellFor(run, one)); count += 1; }
        grid.appendChild(row);
      }
      if (!count) {
        grid.appendChild(api.el("div", "out-none",
          state.runs.length
            ? "Nothing of that kind yet."
            : "Nothing yet."));
      }
      status.textContent = `${count} file${count === 1 ? "" : "s"} `
        + `over ${runs.length} run${runs.length === 1 ? "" : "s"}.`;
    };

    const fill = async () => {
      try {
        const answer = await fetch(HISTORY);
        if (!answer.ok) throw new Error(`the server answered ${answer.status}`);
        const held = await answer.json();
        const runs = [];
        for (const [id, run] of Object.entries(held || {})) {
          const items = itemsOf(run?.outputs);
          if (!items.length) continue;
          runs.push({ id, at: stamp(run), items, live: state.seen.has(id) });
        }
        runs.sort((a, b) => (b.at || 0) - (a.at || 0));
        state.runs = runs;
        draw();
      } catch (error) {
        status.textContent = `The run history could not be read: ${error.message}`;
      }
    };

    const carry = (detail) => {
      const id = String(detail?.prompt_id || "");
      const items = itemsOf({ [String(detail?.node ?? "?")]: detail?.output || {} });
      if (!items.length) return;
      state.seen.add(id);
      const found = state.runs.find((one) => one.id === id);
      if (found) {
        for (const one of items) {
          if (!found.items.some((other) => other.filename === one.filename
              && other.subfolder === one.subfolder)) found.items.push(one);
        }
        found.live = true;
      } else {
        state.runs.unshift({ id, at: Date.now(), items, live: true });
      }
      draw();
    };

    kind.addEventListener("change", () => { state.kind = kind.value; draw(); });
    again.onclick = () => { void fill(); };

    void (async () => {
      const { api: comfyApi } = await import("/scripts/api.js");
      const onDone = (event) => carry(event.detail);
      comfyApi.addEventListener("executed", onDone);
      state.watching = () => comfyApi.removeEventListener("executed", onDone);
      win.onClose?.(() => { state.watching?.(); state.watching = null; });
    })();

    api.style(`
      .out-grid { flex: 1; min-height: 0; overflow-y: auto; padding: 8px 10px 14px; }
      .out-head { display: flex; align-items: baseline; gap: 8px; padding: 12px 2px 6px;
        font-size: 11px; opacity: .6; }
      .out-when { font-weight: 600; }
      .out-count { opacity: .7; }
      .out-live { margin-left: auto; padding: 0 5px; border-radius: 3px;
        background: color-mix(in srgb, var(--om-text) 10%, transparent); }
      .out-row { display: grid; gap: 8px; grid-auto-rows: max-content;
        grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); }
      .out-cell { border: 1px solid var(--om-border); border-radius: 7px;
        cursor: pointer; display: flex; flex-direction: column;
        background: color-mix(in srgb, var(--om-text) 3%, transparent); }
      .out-cell:hover, .out-cell:focus-visible {
        border-color: var(--p-button-text-primary-color, #388bfd); outline: none; }
      .out-art { width: 100%; aspect-ratio: 1 / 1; object-fit: cover; display: block;
        border-radius: 6px 6px 0 0; background: rgba(0, 0, 0, .3); }
      .out-glyph { width: 100%; aspect-ratio: 1 / 1; display: flex; align-items: center;
        justify-content: center; font-size: 26px; opacity: .45;
        background: rgba(0, 0, 0, .3); border-radius: 6px 6px 0 0; }
      .out-name { padding: 5px 7px 6px; font-size: 10px; opacity: .7; overflow: hidden;
        text-overflow: ellipsis; white-space: nowrap; }
      .out-none { padding: 26px; text-align: center; opacity: .6; font-size: 12px; }
      .out-status { flex: none; padding: 5px 10px; font-size: 11px; opacity: .65;
        border-top: 1px solid var(--om-border); }
      .out-pick { min-width: 130px; }
    `);

    void fill();
    return win;
  },
};
