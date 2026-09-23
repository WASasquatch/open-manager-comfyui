const STEPS = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8];

const RATIOS = [
  ["free", "Free", -1],
  ["1:1", "Square 1:1", 1],
  ["4:3", "Landscape 4:3", 4 / 3],
  ["3:2", "Landscape 3:2", 3 / 2],
  ["16:9", "Landscape 16:9", 16 / 9],
  ["3:4", "Portrait 3:4", 3 / 4],
  ["2:3", "Portrait 2:3", 2 / 3],
  ["9:16", "Portrait 9:16", 9 / 16],
];

const TYPES = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
};

const GRIPS = [
  ["nw", -1, -1], ["n", 0, -1], ["ne", 1, -1],
  ["w", -1, 0], ["e", 1, 0],
  ["sw", -1, 1], ["s", 0, 1], ["se", 1, 1],
];

const MIN = 0.04;

export const program = {
  open(api, carried) {
    const win = api.window({ size: "pack", title: "Image Viewer" });
    const state = { items: [], at: 0, root: "output", zoom: 0, fit: true, turn: 0,
                    pan: { x: 0, y: 0 }, ratio: "free", box: null, cropping: false,
                    edit: null };

    const stage = api.el("div", "vw-stage");
    const shot = api.el("img", "vw-shot");
    shot.alt = "";
    stage.appendChild(shot);

    const veil = api.el("div", "vw-veil");
    const box = api.el("div", "vw-box");
    for (const [side] of GRIPS) box.appendChild(api.el("span", `vw-grip vw-grip-${side}`));
    veil.appendChild(box);
    veil.hidden = true;
    stage.appendChild(veil);

    const where = api.el("div", "vw-where", "");
    win.body.appendChild(stage);
    win.body.appendChild(where);

    const button = (label, title, fn) => {
      const one = api.el("button", "om-btn vw-btn", label);
      one.title = title;
      one.onclick = fn;
      win.tools.appendChild(one);
      return one;
    };

    const item = () => state.items[state.at];

    const ratioOf = () => (RATIOS.find((one) => one[0] === state.ratio) || RATIOS[0])[2];

    const showCropTools = () => {
      for (const one of viewTools) one.hidden = state.cropping;
      for (const one of cropTools) one.hidden = !state.cropping;
    };

    const enterCrop = () => {
      state.cropping = true;
      state.fit = true;
      state.pan = { x: 0, y: 0 };
      seedBox();
      showCropTools();
      apply();
      say();
    };

    const leaveCrop = () => {
      state.cropping = false;
      state.box = null;
      showCropTools();
      apply();
      say();
    };

    const applyCrop = () => {
      const made = canvas();
      if (!made) return;
      state.edit = { url: made.toDataURL("image/png"), w: made.width, h: made.height };
      state.turn = 0;
      state.cropping = false;
      state.box = null;
      showCropTools();
      shot.src = state.edit.url;
      say();
    };

    const revert = () => {
      const one = item();
      if (!one) return;
      state.edit = null;
      state.turn = 0;
      state.cropping = false;
      state.box = null;
      showCropTools();
      shot.src = api.assets.url({ ...one, root: state.root });
      apply();
      say();
    };

    const visual = () => {
      const wide = shot.clientWidth;
      const tall = shot.clientHeight;
      if (!wide || !tall) return null;
      const room = stage.getBoundingClientRect();
      const swap = state.turn % 180 !== 0;
      const shown = swap ? { w: tall, h: wide } : { w: wide, h: tall };
      const shrink = swap ? Math.min(room.width / tall, room.height / wide, 1) : 1;
      const w = shown.w * shrink;
      const h = shown.h * shrink;
      return { left: (room.width - w) / 2, top: (room.height - h) / 2, w, h, shrink };
    };

    const apply = () => {
      const scale = state.fit ? 1 : STEPS[state.zoom];
      shot.classList.toggle("vw-fit", state.fit);
      const seen = state.fit ? visual() : null;
      const trim = seen ? seen.shrink : 1;
      shot.style.transform = state.fit
        ? `rotate(${state.turn}deg) scale(${trim})`
        : `translate(${state.pan.x}px, ${state.pan.y}px) scale(${scale}) rotate(${state.turn}deg)`;
      size.textContent = state.fit ? "Fit" : `${Math.round(scale * 100)}%`;
      drawBox();
    };

    const cropping = () => state.cropping && !!state.box;

    const edited = () => !!state.edit || state.turn % 360 !== 0;

    const drawBox = () => {
      veil.hidden = !cropping();
      if (!cropping()) return;
      const seen = visual();
      if (!seen) return;
      veil.style.left = `${seen.left}px`;
      veil.style.top = `${seen.top}px`;
      veil.style.width = `${seen.w}px`;
      veil.style.height = `${seen.h}px`;
      const held = state.box;
      box.style.left = `${held.x * 100}%`;
      box.style.top = `${held.y * 100}%`;
      box.style.width = `${held.w * 100}%`;
      box.style.height = `${held.h * 100}%`;
    };

    const seedBox = () => {
      const want = ratioOf();
      const seen = visual();
      if (!seen) { state.box = null; return; }
      if (want < 0) { state.box = { x: 0.1, y: 0.1, w: 0.8, h: 0.8 }; return; }
      const frame = seen.w / seen.h;
      let w = 0.8;
      let h = 0.8;
      if (want > frame) h = (frame / want) * 0.8;
      else w = (want / frame) * 0.8;
      state.box = { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
    };

    const setRatio = (name) => {
      state.ratio = name;
      if (!state.cropping) return;
      seedBox();
      apply();
      say();
    };

    const draw = () => {
      const one = item();
      if (!one) {
        shot.removeAttribute("src");
        state.box = null;
        veil.hidden = true;
        where.textContent = "Nothing to show.";
        return;
      }
      if (!state.edit) shot.src = api.assets.url({ ...one, root: state.root });
      win.setTitle(one.name);
      remember();
      apply();
      say();
    };

    const say = () => {
      const one = item();
      if (!one) return;
      let held = "";
      if (cropping() && shot.naturalWidth) {
        held = ` · crop ${Math.round(state.box.w * outW())} x ${Math.round(state.box.h * outH())}`;
      } else if (state.edit) {
        held = ` · edited ${state.edit.w} x ${state.edit.h}, not saved`;
      } else if (state.turn % 360 !== 0) {
        held = " · turned, not saved";
      }
      where.textContent = `${one.name} · ${state.at + 1} of ${state.items.length}${held}`;
    };

    const outW = () => (state.turn % 180 !== 0 ? shot.naturalHeight : shot.naturalWidth);
    const outH = () => (state.turn % 180 !== 0 ? shot.naturalWidth : shot.naturalHeight);

    const step = (by) => {
      if (cropping()) return;
      state.fit = false;
      state.zoom = Math.max(0, Math.min(STEPS.length - 1, state.zoom + by));
      apply();
    };

    const go = async (by) => {
      if (!state.items.length) return;
      if (edited()) {
        const sure = await api.confirm("Leave this picture?",
          "Unsaved changes are discarded.", "Discard");
        if (!sure) return;
      }
      state.edit = null;
      state.cropping = false;
      state.box = null;
      showCropTools();
      state.at = (state.at + by + state.items.length) % state.items.length;
      state.pan = { x: 0, y: 0 };
      state.turn = 0;
      state.fit = true;
      draw();
    };

    const grab = (event, side) => {
      if (!cropping() || event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const seen = visual();
      if (!seen) return;
      const from = { x: event.clientX, y: event.clientY, box: { ...state.box } };
      const want = ratioOf();
      try {
        veil.setPointerCapture(event.pointerId);
      } catch {
      }

      const move = (held) => {
        const dx = (held.clientX - from.x) / seen.w;
        const dy = (held.clientY - from.y) / seen.h;
        const was = from.box;
        if (!side) {
          state.box = {
            ...was,
            x: Math.min(Math.max(0, was.x + dx), 1 - was.w),
            y: Math.min(Math.max(0, was.y + dy), 1 - was.h),
          };
          drawBox();
          say();
          return;
        }
        const [, ax, ay] = GRIPS.find((one) => one[0] === side);
        let left = was.x;
        let top = was.y;
        let w = was.w;
        let h = was.h;
        if (ax < 0) { left = was.x + dx; w = was.w - dx; }
        if (ax > 0) { w = was.w + dx; }
        if (ay < 0) { top = was.y + dy; h = was.h - dy; }
        if (ay > 0) { h = was.h + dy; }
        if (want > 0) {
          const frame = seen.w / seen.h;
          if (ax !== 0) h = (w * frame) / want;
          else w = (h * want) / frame;
          if (ay < 0) top = was.y + was.h - h;
          else if (ax !== 0 && ay === 0) top = was.y + (was.h - h) / 2;
          if (ax < 0) left = was.x + was.w - w;
          else if (ay !== 0 && ax === 0) left = was.x + (was.w - w) / 2;
        }
        if (w < MIN || h < MIN) return;
        if (left < 0 || top < 0 || left + w > 1 || top + h > 1) return;
        state.box = { x: left, y: top, w, h };
        drawBox();
        say();
      };

      const done = () => {
        veil.removeEventListener("pointermove", move);
        veil.removeEventListener("pointerup", done);
        veil.removeEventListener("pointercancel", done);
      };
      veil.addEventListener("pointermove", move);
      veil.addEventListener("pointerup", done);
      veil.addEventListener("pointercancel", done);
    };

    box.addEventListener("pointerdown", (event) => {
      const grip = event.target instanceof Element ? event.target.closest(".vw-grip") : null;
      const side = grip
        ? (GRIPS.find((one) => grip.classList.contains(`vw-grip-${one[0]}`)) || [])[0]
        : "";
      grab(event, side || "");
    });

    const canvas = () => {
      const nw = shot.naturalWidth;
      const nh = shot.naturalHeight;
      if (!nw || !nh) return null;
      const wide = outW();
      const tall = outH();
      const whole = document.createElement("canvas");
      whole.width = wide;
      whole.height = tall;
      const ink = whole.getContext("2d");
      ink.translate(wide / 2, tall / 2);
      ink.rotate((state.turn * Math.PI) / 180);
      ink.drawImage(shot, -nw / 2, -nh / 2);
      if (!cropping()) return whole;
      const held = state.box;
      const x = Math.max(0, Math.round(held.x * wide));
      const y = Math.max(0, Math.round(held.y * tall));
      const w = Math.max(1, Math.min(wide - x, Math.round(held.w * wide)));
      const h = Math.max(1, Math.min(tall - y, Math.round(held.h * tall)));
      const cut = document.createElement("canvas");
      cut.width = w;
      cut.height = h;
      cut.getContext("2d").drawImage(whole, x, y, w, h, 0, 0, w, h);
      return cut;
    };

    const encoded = (made, suffix) => new Promise((settle) => {
      const type = TYPES[suffix] || "image/png";
      made.toBlob((blob) => {
        if (!blob) { settle(null); return; }
        const reader = new FileReader();
        reader.onload = () => {
          const text = String(reader.result || "");
          settle(text.slice(text.indexOf(",") + 1));
        };
        reader.onerror = () => settle(null);
        reader.readAsDataURL(blob);
      }, type, type === "image/png" ? undefined : 0.95);
    });

    const endOf = (name) => {
      const at = String(name || "").lastIndexOf(".");
      return at < 0 ? "" : String(name).slice(at).toLowerCase();
    };

    const suffixOf = (name) => (TYPES[endOf(name)] ? endOf(name) : ".png");

    const overWritable = () => !!TYPES[endOf(item()?.name)];

    const put = async (path, replace) => {
      const one = item();
      if (!one) return false;
      const made = canvas();
      if (!made) {
        api.notify("Not saved", "The picture is not loaded yet.");
        return false;
      }
      const data = await encoded(made, suffixOf(path));
      if (!data) {
        api.notify("Not saved", "The picture could not be encoded.");
        return false;
      }
      const answer = await api.assets.write(state.root, path, data, replace);
      if (!answer?.ok) {
        api.notify("Not saved", answer?.reason || "It could not be written.");
        return false;
      }
      return answer;
    };

    const saveOver = async () => {
      const one = item();
      if (!one) return;
      const sure = await api.confirm(`Write over ${one.name}?`,
        "The picture on disk is replaced by what is on screen. There is no undo.", "Replace");
      if (!sure) return;
      const path = api.assets.path(one);
      const answer = await put(path, true);
      if (!answer) return;
      state.turn = 0;
      state.edit = null;
      state.cropping = false;
      state.box = null;
      showCropTools();
      shot.src = `${api.assets.url({ ...one, root: state.root })}&om=${Date.now()}`;
      api.toast(`Saved ${one.name}`);
    };

    const settleOn = (answer) => {
      const from = item();
      state.edit = null;
      state.turn = 0;
      state.cropping = false;
      state.box = null;
      state.fit = true;
      state.pan = { x: 0, y: 0 };
      showCropTools();
      const made = { name: answer.name, sub: answer.sub || "", kind: "still",
                     size: answer.bytes || 0, at: Math.floor(Date.now() / 1000), thumb: true };
      const already = state.items.findIndex(
        (one) => one.name === made.name && (one.sub || "") === made.sub);
      if (already >= 0) {
        state.items[already] = made;
        state.at = already;
      } else if (made.sub === String(from?.sub || "")) {
        state.items.splice(state.at + 1, 0, made);
        state.at += 1;
      } else {
        apply();
        say();
        return;
      }
      win.setTitle(made.name);
      remember();
      shot.src = `${api.assets.url({ ...made, root: state.root })}&om=${Date.now()}`;
      say();
    };

    const saveCopy = async () => {
      const one = item();
      if (!one) return;
      const suffix = suffixOf(one.name);
      const at = one.name.lastIndexOf(".");
      const stem = at > 0 ? one.name.slice(0, at) : one.name;
      const here = one.sub ? `${one.sub}/` : "";
      const asked = await api.ask("Save a copy as", `${here}${stem}-crop${suffix}`, "Save");
      if (!asked) return;
      let answer = await put(asked, false);
      if (!answer && String(asked).trim()) {
        const again = await api.confirm("Already one of that name",
          "Write over the file that is there?", "Replace");
        if (!again) return;
        answer = await put(asked, true);
      }
      if (!answer) return;
      settleOn(answer);
      api.toast(`Saved ${answer.name}`);
    };

    const exportOut = () => {
      const one = item();
      if (!one) return;
      const link = api.el("a");
      link.href = api.assets.url({ ...one, root: state.root });
      link.download = one.name;
      link.style.display = "none";
      win.body.appendChild(link);
      link.click();
      setTimeout(() => link.remove(), 0);
    };

    const drop = async () => {
      const one = item();
      if (!one) return;
      const sure = await api.confirm(`Delete ${one.name}?`,
        "There is no undo.", "Delete");
      if (!sure) return;
      const answer = await api.assets.remove(state.root, api.assets.path(one));
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

    const file = api.el("button", "om-btn vw-btn om-tools-menu", "File");
    file.title = "What to do with this file";
    file.onclick = () => api.menu(file, [
      api.canWrite() && edited() && overWritable() && { label: "Save", fn: saveOver },
      api.canWrite() && { label: "Save a copy...", fn: saveCopy },
      edited() && { label: "Revert", fn: revert },
      { label: "Export", fn: exportOut },
      canDrop() && { label: "Delete", danger: true, fn: drop },
      { label: "Close", fn: () => win.close() },
    ].filter(Boolean));
    win.tools.appendChild(file);

    const back = button("‹", "The one before", () => go(-1));
    const next = button("›", "The next one", () => go(1));
    const out = button("−", "Zoom out", () => step(-1));
    const size = api.el("span", "vw-size", "Fit");
    win.tools.appendChild(size);
    const inn = button("+", "Zoom in", () => step(1));
    const fit = button("Fit", "Fit the window", () => {
      state.fit = true;
      state.pan = { x: 0, y: 0 };
      apply();
    });
    const full = button("100%", "Actual size", () => {
      state.fit = false;
      state.zoom = STEPS.indexOf(1);
      state.pan = { x: 0, y: 0 };
      apply();
    });
    const turn = button("⟳", "Turn it a quarter", () => {
      state.turn = (state.turn + 90) % 360;
      if (cropping()) seedBox();
      apply();
      say();
    });
    const crop = button("Crop", "Cut the picture to a shape", enterCrop);

    const shape = api.el("select", "om-side-select vw-shape");
    for (const [name, label] of RATIOS) {
      const choice = api.el("option", null, label);
      choice.value = name;
      shape.appendChild(choice);
    }
    shape.value = "free";
    shape.title = "What shape to cut to";
    shape.onchange = () => setRatio(shape.value);
    win.tools.appendChild(shape);

    const cropGo = button("Apply", "Cut the picture to the box", applyCrop);
    cropGo.classList.add("om-go");
    const cropStop = button("Cancel", "Leave the picture as it is", leaveCrop);

    const viewTools = [back, next, out, size, inn, fit, full, turn, crop];
    const cropTools = [shape, cropGo, cropStop];
    showCropTools();

    shot.addEventListener("load", () => { if (cropping()) seedBox(); apply(); say(); });

    const watcher = new ResizeObserver(() => { apply(); });
    watcher.observe(stage);

    stage.addEventListener("wheel", (event) => {
      if (!event.deltaY || cropping()) return;
      event.preventDefault();
      step(event.deltaY < 0 ? 1 : -1);
    }, { passive: false });

    stage.addEventListener("pointerdown", (event) => {
      if (state.fit || cropping() || event.button !== 0) return;
      event.preventDefault();
      const from = { x: event.clientX, y: event.clientY, pan: { ...state.pan } };
      stage.setPointerCapture(event.pointerId);
      const move = (held) => {
        state.pan = {
          x: from.pan.x + (held.clientX - from.x),
          y: from.pan.y + (held.clientY - from.y),
        };
        apply();
      };
      const done = () => {
        stage.removeEventListener("pointermove", move);
        stage.removeEventListener("pointerup", done);
        stage.removeEventListener("pointercancel", done);
      };
      stage.addEventListener("pointermove", move);
      stage.addEventListener("pointerup", done);
      stage.addEventListener("pointercancel", done);
    });

    stage.tabIndex = 0;
    win.onKey((event) => {
      if (event.key === "ArrowRight") { event.preventDefault(); go(1); }
      else if (event.key === "ArrowLeft") { event.preventDefault(); go(-1); }
      else if (event.key === "+" || event.key === "=") { event.preventDefault(); step(1); }
      else if (event.key === "-") { event.preventDefault(); step(-1); }
      else if (event.key === "Escape" && state.cropping) {
        event.preventDefault();
        leaveCrop();
      }
    });

    const mark = `last:${api.view || "main"}`;

    const remember = () => {
      const one = item();
      if (!one) return;
      api.storage.set(mark, { root: state.root, sub: one.sub || "",
                              name: one.name, kind: one.kind });
    };

    const recall = async () => {
      const held = await api.storage.get(mark, null);
      if (!held?.name || !win.isOpen()) return;
      const listing = await api.assets.list({
        root: held.root || "output", path: held.sub || "",
        kind: held.kind || "still", size: 0,
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
      state.items = (payload.items || []).filter((one) => one.kind === "still");
      state.root = payload.root || "output";
      const wanted = payload.name
        ? state.items.findIndex((one) => one.name === payload.name)
        : 0;
      state.at = wanted < 0 ? 0 : wanted;
      state.fit = true;
      state.turn = 0;
      state.pan = { x: 0, y: 0 };
      state.box = null;
      state.cropping = false;
      state.edit = null;
      showCropTools();
      draw();
      win.present();
      stage.focus({ preventScroll: true });
    };
    win.onCarry(take);
    win.onClose?.(() => watcher.disconnect());

    api.style(`
      .vw-stage { flex: 1; min-height: 0; overflow: hidden; display: flex;
        align-items: center; justify-content: center; background: #0b0d0b; outline: none;
        position: relative; }
      .vw-shot { max-width: none; transform-origin: center; }
      .vw-shot.vw-fit { max-width: 100%; max-height: 100%; }
      .vw-where { flex: none; padding: 6px 10px; color: var(--om-muted); font-size: 11px;
        border-top: 1px solid var(--om-border); overflow: hidden; text-overflow: ellipsis;
        white-space: nowrap; }
      .vw-btn { min-width: 30px; padding: 4px 8px; }
      .vw-size { min-width: 42px; text-align: center; color: var(--om-muted);
        font-size: 11px; }
      .vw-shape { max-width: 150px; }
      .vw-veil { position: absolute; overflow: hidden; z-index: 2; }
      .vw-box { position: absolute; cursor: move; outline: 1px solid rgba(255,255,255,.95);
        box-shadow: 0 0 0 9999px rgba(0,0,0,.55); }
      .vw-box::before, .vw-box::after { content: ""; position: absolute; inset: 0;
        pointer-events: none; }
      .vw-box::before { background:
        linear-gradient(to right, transparent 33.33%, rgba(255,255,255,.35) 33.33%,
          rgba(255,255,255,.35) calc(33.33% + 1px), transparent calc(33.33% + 1px),
          transparent 66.66%, rgba(255,255,255,.35) 66.66%,
          rgba(255,255,255,.35) calc(66.66% + 1px), transparent calc(66.66% + 1px)); }
      .vw-box::after { background:
        linear-gradient(to bottom, transparent 33.33%, rgba(255,255,255,.35) 33.33%,
          rgba(255,255,255,.35) calc(33.33% + 1px), transparent calc(33.33% + 1px),
          transparent 66.66%, rgba(255,255,255,.35) 66.66%,
          rgba(255,255,255,.35) calc(66.66% + 1px), transparent calc(66.66% + 1px)); }
      .vw-grip { position: absolute; width: 12px; height: 12px; z-index: 1;
        background: #fff; border: 1px solid rgba(0,0,0,.65); border-radius: 2px; }
      .vw-grip-nw { left: -6px; top: -6px; cursor: nwse-resize; }
      .vw-grip-n { left: calc(50% - 6px); top: -6px; cursor: ns-resize; }
      .vw-grip-ne { right: -6px; top: -6px; cursor: nesw-resize; }
      .vw-grip-w { left: -6px; top: calc(50% - 6px); cursor: ew-resize; }
      .vw-grip-e { right: -6px; top: calc(50% - 6px); cursor: ew-resize; }
      .vw-grip-sw { left: -6px; bottom: -6px; cursor: nesw-resize; }
      .vw-grip-s { left: calc(50% - 6px); bottom: -6px; cursor: ns-resize; }
      .vw-grip-se { right: -6px; bottom: -6px; cursor: nwse-resize; }
    `);

    if (carried) take(carried);
    else void recall();
    return win;
  },
};
