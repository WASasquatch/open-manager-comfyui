const ALL = "\u0000all";

function piniaStore(name) {
  const host = [...document.querySelectorAll("*")].find((one) => one.__vue_app__);
  const pinia = host?.__vue_app__?._context?.config?.globalProperties?.$pinia;
  return pinia?._s?.get(name) || null;
}

function topOf(def) {
  if (Array.isArray(def.category) && def.category.length) return String(def.category[0]);
  if (typeof def.category === "string" && def.category) return def.category;
  const at = String(def.id || "").indexOf(".");
  return at < 0 ? "Other" : String(def.id).slice(0, at);
}

function sectionOf(def) {
  if (Array.isArray(def.category) && def.category.length > 2) return String(def.category[1]);
  return "";
}

function labelOf(def) {
  if (def.name) return String(def.name);
  if (Array.isArray(def.category) && def.category.length) {
    return String(def.category[def.category.length - 1]);
  }
  return String(def.id || "");
}

function choicesOf(def, held) {
  let held_options = def.options;
  if (typeof held_options === "function") {
    try { held_options = held_options(held); } catch { held_options = []; }
  }
  if (!Array.isArray(held_options)) return [];
  return held_options.map((one) => (one && typeof one === "object"
    ? { value: one.value, text: String(one.text ?? one.value) }
    : { value: one, text: String(one) }));
}

export const program = {
  open(api) {
    const win = api.window({ size: "manager", title: "ComfyUI Settings" });
    const state = { defs: [], chosen: ALL, find: "" };
    const store = piniaStore("setting");

    const find = api.el("input", "om-search set-find");
    find.placeholder = "Search settings by name or id";
    find.spellcheck = false;
    win.tools.appendChild(find);

    const wrap = api.el("div", "set");
    const side = api.el("div", "set-side");
    const main = api.el("div", "set-main");
    const list = api.el("div", "set-list");
    const status = api.el("div", "set-status", "Reading the settings...");
    main.appendChild(list);
    main.appendChild(status);
    wrap.appendChild(side);
    wrap.appendChild(main);
    win.body.appendChild(wrap);

    const read = (id) => {
      try { return store.get(id); } catch { return undefined; }
    };

    const write = (def, value) => {
      try {
        store.set(def.id, value);
        return true;
      } catch (error) {
        api.notify("Not changed", `${labelOf(def)} could not be changed: ${error.message}`);
        return false;
      }
    };

    const matches = (def) => {
      if (state.chosen !== ALL && topOf(def) !== state.chosen) return false;
      const term = state.find.trim().toLowerCase();
      if (!term) return true;
      const cat = Array.isArray(def.category) ? def.category.join(" ") : String(def.category || "");
      const hay = (`${def.id} ${labelOf(def)} ${cat} ${def.tooltip || ""}`).toLowerCase();
      return term.split(/\s+/).every((word) => hay.includes(word));
    };

    const control = (def) => {
      const held = read(def.id);
      const kind = typeof def.type === "function" ? "custom" : String(def.type || "text");

      if (kind === "custom") {
        return api.el("span", "set-custom", "Only in ComfyUI's own settings");
      }

      if (kind === "boolean") {
        const box = api.el("input", "set-check");
        box.type = "checkbox";
        box.checked = held === true;
        box.addEventListener("change", () => {
          if (!write(def, box.checked)) box.checked = held === true;
        });
        return box;
      }

      if (kind === "combo" || kind === "radio") {
        const pick = api.el("select", "om-side-select set-pick");
        const choices = choicesOf(def, held);
        const known = choices.some((one) => one.value === held);
        if (!known && held !== undefined) {
          const spare = api.el("option", null, String(held));
          spare.value = String(held);
          pick.appendChild(spare);
        }
        for (const one of choices) {
          const option = api.el("option", null, one.text);
          option.value = String(one.value);
          pick.appendChild(option);
        }
        pick.value = String(held);
        pick.addEventListener("change", () => {
          const found = choices.find((one) => String(one.value) === pick.value);
          write(def, found ? found.value : pick.value);
        });
        return pick;
      }

      if (kind === "slider" || kind === "number") {
        const line = api.el("div", "set-num");
        const attrs = def.attrs || {};
        const field = api.el("input", "set-field");
        field.type = "number";
        if (attrs.min !== undefined) field.min = String(attrs.min);
        if (attrs.max !== undefined) field.max = String(attrs.max);
        if (attrs.step !== undefined) field.step = String(attrs.step);
        field.value = held === undefined ? "" : String(held);
        let slider = null;
        if (kind === "slider" && attrs.min !== undefined && attrs.max !== undefined) {
          slider = api.el("input", "set-slide");
          slider.type = "range";
          slider.min = String(attrs.min);
          slider.max = String(attrs.max);
          slider.step = String(attrs.step ?? 1);
          slider.value = String(held ?? attrs.min);
          slider.addEventListener("input", () => {
            field.value = slider.value;
            write(def, Number(slider.value));
          });
          line.appendChild(slider);
        }
        field.addEventListener("change", () => {
          const asked = Number(field.value);
          if (Number.isNaN(asked)) { field.value = String(read(def.id) ?? ""); return; }
          if (write(def, asked) && slider) slider.value = String(asked);
        });
        line.appendChild(field);
        return line;
      }

      if (kind === "color") {
        const field = api.el("input", "set-colour");
        field.type = "color";
        field.value = /^#[0-9a-f]{6}$/i.test(String(held || "")) ? String(held) : "#000000";
        field.addEventListener("change", () => write(def, field.value));
        return field;
      }

      const field = api.el("input", "set-field set-wide");
      field.type = "text";
      field.value = held === undefined || held === null ? "" : String(held);
      field.addEventListener("change", () => write(def, field.value));
      return field;
    };

    const rowFor = (def) => {
      const row = api.el("div", "set-row");
      const left = api.el("div", "set-left");
      const name = api.el("div", "set-name", labelOf(def));
      left.appendChild(name);
      const marks = [];
      if (def.experimental) marks.push("experimental");
      if (def.deprecated) marks.push("deprecated");
      if (marks.length) {
        for (const mark of marks) name.appendChild(api.el("span", "set-flag", mark));
      }
      left.appendChild(api.el("div", "set-id", def.id));
      if (def.tooltip) {
        const note = api.el("div", "set-note");
        note.textContent = def.tooltip;
        left.appendChild(note);
      }
      row.appendChild(left);
      const right = api.el("div", "set-right");
      right.appendChild(control(def));
      row.appendChild(right);
      row.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        api.menu(row, [{
          label: "Reset to default",
          fn: () => {
            if (write(def, def.defaultValue)) { draw(); api.toast(`${labelOf(def)} reset`); }
          },
        }]);
      });
      return row;
    };

    const drawSide = () => {
      const counts = new Map();
      for (const def of state.defs) {
        const top = topOf(def);
        counts.set(top, (counts.get(top) || 0) + 1);
      }
      const names = [...counts.keys()].sort((a, b) => a.localeCompare(b));
      side.replaceChildren();
      const all = api.el("button",
        `set-place${state.chosen === ALL ? " set-place-on" : ""}`, "Everything");
      all.onclick = () => { state.chosen = ALL; draw(); };
      side.appendChild(all);
      for (const name of names) {
        const place = api.el("button",
          `set-place${state.chosen === name ? " set-place-on" : ""}`, name);
        place.appendChild(api.el("span", "set-count", String(counts.get(name))));
        place.onclick = () => { state.chosen = name; draw(); };
        side.appendChild(place);
      }
    };

    const draw = () => {
      drawSide();
      const shown = state.defs.filter(matches);
      const sections = new Map();
      for (const def of shown) {
        const head = sectionOf(def) || topOf(def);
        if (!sections.has(head)) sections.set(head, []);
        sections.get(head).push(def);
      }
      list.replaceChildren();
      for (const [head, defs] of [...sections.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))) {
        list.appendChild(api.el("div", "set-head", head));
        for (const def of defs.sort((a, b) => labelOf(a).localeCompare(labelOf(b)))) {
          list.appendChild(rowFor(def));
        }
      }
      list.scrollTop = 0;
      if (!shown.length) {
        list.appendChild(api.el("div", "set-empty", "Nothing matches that."));
      }
      status.textContent = shown.length === state.defs.length
        ? `${state.defs.length} settings.`
        : `${shown.length} of ${state.defs.length} settings.`;
    };

    const fill = () => {
      if (!store) {
        status.textContent = "This ComfyUI does not expose its settings.";
        return;
      }
      const lookup = window.app?.ui?.settings?.settingsLookup || {};
      state.defs = Object.values(lookup).filter((def) => def && def.type !== "hidden");
      draw();
    };

    find.addEventListener("input", () => { state.find = find.value; draw(); });

    api.style(`
      .set { display: flex; flex: 1; min-height: 0; }
      .set-side { width: 180px; flex: none; overflow-y: auto; padding: 6px;
        border-right: 1px solid var(--om-border); display: flex; flex-direction: column;
        gap: 2px; }
      .set-place { display: flex; align-items: center; gap: 6px; text-align: left;
        padding: 5px 8px; border: 0; border-radius: 5px; background: transparent;
        color: inherit; font: inherit; cursor: pointer; }
      .set-place:hover { background: var(--om-hover); }
      .set-place-on { background: color-mix(in srgb, var(--om-text) 12%, transparent);
        font-weight: 600; }
      .set-count { margin-left: auto; font-size: 10px; opacity: .5; }
      .set-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
      .set-list { flex: 1; min-height: 0; overflow-y: auto; padding: 4px 8px 12px; }
      .set-head { font-size: 11px; text-transform: uppercase; letter-spacing: .06em;
        opacity: .55; padding: 14px 2px 5px; position: sticky; top: 0;
        background: var(--om-bg); }
      .set-row { display: flex; gap: 14px; align-items: flex-start; padding: 7px 2px;
        border-bottom: 1px solid color-mix(in srgb, var(--om-text) 6%, transparent); }
      .set-left { flex: 1; min-width: 0; }
      .set-name { font-size: 12px; font-weight: 600; display: flex; gap: 6px;
        align-items: baseline; flex-wrap: wrap; }
      .set-flag { font-size: 10px; font-weight: 400; padding: 0 4px; border-radius: 3px;
        background: color-mix(in srgb, var(--om-text) 10%, transparent); opacity: .75; }
      .set-id { font-size: 10px; opacity: .4; margin-top: 1px; }
      .set-note { font-size: 11px; opacity: .6; margin-top: 3px; line-height: 1.35; }
      .set-right { flex: none; display: flex; align-items: center; justify-content: flex-end;
        min-width: 180px; padding-top: 2px; }
      .set-num { display: flex; align-items: center; gap: 8px; }
      .set-slide { width: 110px; }
      .set-field { width: 88px; background: color-mix(in srgb, var(--om-text) 6%, transparent);
        border: 1px solid var(--om-border); border-radius: 5px; color: inherit;
        font: inherit; font-size: 12px; padding: 3px 6px; }
      .set-wide { width: 180px; }
      .set-pick { max-width: 190px; }
      .set-check { width: 15px; height: 15px; }
      .set-colour { width: 44px; height: 24px; background: none; border: 0; padding: 0; }
      .set-custom { font-size: 11px; opacity: .5; font-style: italic; }
      .set-empty { padding: 24px; text-align: center; opacity: .6; }
      .set-status { flex: none; padding: 5px 10px; font-size: 11px; opacity: .65;
        border-top: 1px solid var(--om-border); }
      .set-find { min-width: 240px; }
    `);

    fill();
    return win;
  },
};
