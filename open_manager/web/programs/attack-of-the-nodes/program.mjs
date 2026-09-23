const GAME = new URL("./game.html", import.meta.url).href;

const WIDE = 1280;

const TALL = 800;

export const program = {
  open(api) {
    const win = api.window({ size: "manager", title: "Attack of the Nodes" });

    const stage = api.el("div", "atn-stage");
    const frame = api.el("iframe", "atn-frame");
    frame.title = "Attack of the Nodes";
    frame.allow = "autoplay; fullscreen";
    frame.src = GAME;
    stage.appendChild(frame);
    win.body.appendChild(stage);

    const fit = () => {
      const room = stage.getBoundingClientRect();
      if (!room.width || !room.height) return;
      const scale = Math.min(room.width / WIDE, room.height / TALL);
      frame.style.width = `${WIDE}px`;
      frame.style.height = `${TALL}px`;
      frame.style.transform = `scale(${scale})`;
      frame.style.left = `${Math.round((room.width - WIDE * scale) / 2)}px`;
      frame.style.top = `${Math.round((room.height - TALL * scale) / 2)}px`;
    };

    const watcher = new ResizeObserver(() => fit());
    watcher.observe(stage);
    win.onClose?.(() => watcher.disconnect());

    const full = api.el("button", "om-btn atn-full", "Full screen");
    full.onclick = async () => {
      const already = document.fullscreenElement;
      try {
        if (already) await document.exitFullscreen();
        else await stage.requestFullscreen();
      } catch {
        api.notify("Not full screen", "The browser would not allow it.");
      }
    };
    win.tools.appendChild(full);

    const said = () => {
      const on = document.fullscreenElement === stage;
      full.textContent = on ? "Leave full screen" : "Full screen";
      stage.classList.toggle("atn-stage-full", on);
      fit();
    };
    document.addEventListener("fullscreenchange", said);
    win.onClose?.(() => document.removeEventListener("fullscreenchange", said));

    frame.addEventListener("load", () => {
      fit();
      try {
        frame.contentWindow?.focus();
      } catch {
      }
    });

    api.style(`
      .atn-stage { flex: 1; min-height: 0; position: relative; overflow: hidden;
        background: #0d0e10; }
      .atn-stage-full { background: #000; }
      .atn-frame { position: absolute; border: 0; transform-origin: top left;
        background: #0d0e10; }
      .atn-full { min-width: 108px; }
    `);

    requestAnimationFrame(fit);
    return win;
  },
};
