const SEEK_STEP = 5;

const AFTERS = new Set(["stop", "loop", "next"]);

const ICONS = {
  play: "<path d='M8 5v14l11-7z'/>",
  pause: "<path d='M6 5h4v14H6zm8 0h4v14h-4z'/>",
  sound: "<path d='M4 9v6h4l5 4V5L8 9H4z'/><path d='M16 8.5a4.5 4.5 0 0 1 0 7' fill='none' "
    + "stroke='black' stroke-width='2' stroke-linecap='round'/>",
  muted: "<path d='M4 9v6h4l5 4V5L8 9H4z'/><path d='M16 9.5l5 5m0-5l-5 5' stroke='black' "
    + "stroke-width='2' stroke-linecap='round'/>",
  full: "<path d='M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5' fill='none' stroke='black' "
    + "stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/>",
};

function icon(name) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'>${ICONS[name]}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

function clock(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = String(whole % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
}

export const program = {
  open(api, carried) {
    const win = api.window({ size: "pack", title: "Video Player" });
    const state = { items: [], at: 0, root: "output", after: "stop", seeking: false };

    const stage = api.el("div", "pl-stage");
    const screen = api.el("div", "pl-screen");
    const play = api.el("video", "pl-video");
    play.preload = "metadata";
    play.playsInline = true;
    screen.appendChild(play);

    const bar = api.el("div", "pl-bar");
    const control = (cls, label) => {
      const one = api.el("button", `pl-ctl ${cls}`);
      one.type = "button";
      one.setAttribute("aria-label", label);
      one.title = label;
      return one;
    };
    const toggle = control("pl-toggle", "Play");
    const seek = api.el("input", "pl-seek");
    seek.type = "range";
    seek.min = "0";
    seek.max = "0";
    seek.step = "any";
    seek.value = "0";
    seek.setAttribute("aria-label", "Seek");
    const time = api.el("span", "pl-time", "0:00 / 0:00");
    const mute = control("pl-mute", "Mute");
    const volume = api.el("input", "pl-volume");
    volume.type = "range";
    volume.min = "0";
    volume.max = "1";
    volume.step = "0.05";
    volume.value = "1";
    volume.setAttribute("aria-label", "Volume");
    const full = control("pl-full", "Full screen");
    bar.append(toggle, seek, time, mute, volume, full);
    stage.append(screen, bar);
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

    const paintTime = () => {
      const shown = state.seeking ? Number(seek.value) : play.currentTime;
      time.textContent = `${clock(shown)} / ${clock(play.duration)}`;
      if (!state.seeking) seek.value = String(play.currentTime || 0);
    };

    const paintPlaying = () => {
      const going = !play.paused && !play.ended;
      stage.classList.toggle("pl-playing", going);
      toggle.setAttribute("aria-label", going ? "Pause" : "Play");
      toggle.title = going ? "Pause" : "Play";
    };

    const paintSound = () => {
      const silent = play.muted || play.volume === 0;
      stage.classList.toggle("pl-silent", silent);
      mute.setAttribute("aria-label", silent ? "Unmute" : "Mute");
      mute.title = silent ? "Unmute" : "Mute";
      volume.value = String(play.muted ? 0 : play.volume);
    };

    const start = () => { play.play().catch(() => {}); };

    const flip = () => {
      if (!play.currentSrc) return;
      if (play.paused || play.ended) start();
      else play.pause();
    };

    const fullScreen = () => {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      else stage.requestFullscreen?.().catch(() => {});
    };

    const draw = () => {
      const item = state.items[state.at];
      seek.max = "0";
      seek.value = "0";
      if (!item) {
        play.removeAttribute("src");
        play.load();
        where.textContent = "Nothing to play.";
        paintTime();
        return;
      }
      play.src = api.assets.url({ ...item, root: state.root });
      stage.classList.toggle("pl-sound", item.kind === "audio");
      win.setTitle(item.name);
      remember();
      where.textContent = `${item.name} · ${state.at + 1} of ${state.items.length}`;
      paintTime();
    };

    const go = (by) => {
      if (!state.items.length) return;
      state.at = (state.at + by + state.items.length) % state.items.length;
      draw();
      start();
    };

    button("‹", "The one before", () => go(-1));
    button("›", "The next one", () => go(1));

    const switchFor = (label) => {
      const host = api.el("label", "pl-loop");
      const mark = api.el("input");
      mark.type = "checkbox";
      host.appendChild(mark);
      host.appendChild(api.el("span", null, label));
      win.tools.appendChild(host);
      return mark;
    };
    const loopMark = switchFor("Loop");
    const nextMark = switchFor("Play next");

    const setAfter = (value, keep = true) => {
      state.after = AFTERS.has(value) ? value : "stop";
      loopMark.checked = state.after === "loop";
      nextMark.checked = state.after === "next";
      play.loop = state.after === "loop";
      if (keep) api.storage.set("after", state.after);
    };
    loopMark.onchange = () => setAfter(loopMark.checked ? "loop" : "stop");
    nextMark.onchange = () => setAfter(nextMark.checked ? "next" : "stop");

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

    toggle.onclick = flip;
    screen.onclick = flip;
    screen.ondblclick = fullScreen;
    full.onclick = fullScreen;
    mute.onclick = () => {
      if (play.muted || play.volume === 0) {
        play.muted = false;
        if (play.volume === 0) play.volume = 1;
      } else {
        play.muted = true;
      }
    };
    volume.addEventListener("input", () => {
      play.volume = Number(volume.value);
      play.muted = play.volume === 0;
    });
    seek.addEventListener("input", () => {
      state.seeking = true;
      play.currentTime = Number(seek.value);
      paintTime();
    });
    seek.addEventListener("change", () => {
      state.seeking = false;
      paintTime();
    });
    seek.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const by = event.key === "ArrowRight" ? SEEK_STEP : -SEEK_STEP;
      const end = Number.isFinite(play.duration) ? play.duration : 0;
      play.currentTime = Math.max(0, Math.min(end, play.currentTime + by));
    });

    play.addEventListener("loadedmetadata", () => {
      seek.max = String(Number.isFinite(play.duration) ? play.duration : 0);
      paintTime();
    });
    play.addEventListener("durationchange", () => {
      seek.max = String(Number.isFinite(play.duration) ? play.duration : 0);
      paintTime();
    });
    play.addEventListener("timeupdate", paintTime);
    play.addEventListener("seeked", paintTime);
    play.addEventListener("play", paintPlaying);
    play.addEventListener("pause", paintPlaying);
    play.addEventListener("ended", () => {
      paintPlaying();
      if (state.after !== "next") return;
      if (!(play.duration > 1)) return;
      if (state.at >= state.items.length - 1) return;
      go(1);
    });
    play.addEventListener("volumechange", paintSound);
    play.addEventListener("error", () => {
      const item = state.items[state.at];
      where.textContent = item ? `${item.name} · Unsupported format` : "Unsupported format";
    });

    win.onKey((event) => {
      if (event.key === "ArrowRight") { event.preventDefault(); go(1); }
      else if (event.key === "ArrowLeft") { event.preventDefault(); go(-1); }
      else if (event.key === " " && !(event.target instanceof Element
                                      && event.target.closest("button, a"))) {
        event.preventDefault();
        flip();
      }
    });

    const slot = `last:${api.view || "main"}`;

    const remember = () => {
      const item = state.items[state.at];
      if (!item) return;
      api.storage.set(slot, { root: state.root, sub: item.sub || "",
                              name: item.name, kind: item.kind });
    };

    const take = (payload, { begin = true } = {}) => {
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
      if (begin) start();
    };
    win.onCarry((payload) => take(payload));

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
      take({ items, name: held.name, root: held.root || "output" }, { begin: false });
    };

    api.storage.get("after", "stop").then((held) => {
      if (win.isOpen()) setAfter(held, false);
    });

    api.style(`
      .pl-stage { flex: 1; min-height: 0; display: flex; flex-direction: column;
        background: #0b0d0b; }
      .pl-screen { flex: 1; min-height: 0; display: flex; align-items: center;
        justify-content: center; cursor: pointer; }
      .pl-video { width: 100%; height: 100%; object-fit: contain; }
      .pl-stage.pl-sound .pl-video { visibility: hidden; height: 0; }
      .pl-bar { flex: none; display: flex; align-items: center; gap: 8px; padding: 6px 10px;
        background: color-mix(in srgb, #0b0d0b 70%, var(--om-surface)); color: #e6e6e6; }
      .pl-ctl { flex: none; width: 30px; height: 28px; display: inline-grid; place-items: center;
        padding: 0; border: 0; border-radius: 5px; background: transparent; color: inherit;
        cursor: pointer; opacity: .85; }
      .pl-ctl:hover { opacity: 1; background: rgba(255, 255, 255, .1); }
      .pl-ctl:focus-visible { outline: 1px solid var(--p-button-text-primary-color, var(--p-primary-color, #388bfd)); }
      .pl-ctl::before { content: ""; width: 18px; height: 18px; background: currentColor;
        -webkit-mask: var(--pl-icon) center / contain no-repeat;
        mask: var(--pl-icon) center / contain no-repeat; }
      .pl-toggle { --pl-icon: ${icon("play")}; }
      .pl-playing .pl-toggle { --pl-icon: ${icon("pause")}; }
      .pl-mute { --pl-icon: ${icon("sound")}; }
      .pl-silent .pl-mute { --pl-icon: ${icon("muted")}; }
      .pl-full { --pl-icon: ${icon("full")}; }
      .pl-seek { flex: 1; min-width: 60px; margin: 0;
        accent-color: var(--p-button-text-primary-color, var(--p-primary-color, #388bfd)); cursor: pointer; }
      .pl-volume { flex: none; width: 80px; margin: 0;
        accent-color: var(--p-button-text-primary-color, var(--p-primary-color, #388bfd)); cursor: pointer; }
      .pl-time { flex: none; font-size: 12px; font-variant-numeric: tabular-nums; opacity: .85; }
      .pl-stage:fullscreen { background: #000; }
      .pl-where { flex: none; padding: 6px 10px; color: var(--om-muted); font-size: 11px;
        border-top: 1px solid var(--om-border); overflow: hidden; text-overflow: ellipsis;
        white-space: nowrap; }
      .pl-btn { min-width: 30px; padding: 4px 8px; }
      .pl-loop { display: inline-flex; align-items: center; gap: 6px; color: var(--om-text-2);
        font-size: 12px; cursor: pointer; }
    `);

    paintSound();
    paintPlaying();
    if (carried) take(carried);
    else void recall();
    return win;
  },
};
