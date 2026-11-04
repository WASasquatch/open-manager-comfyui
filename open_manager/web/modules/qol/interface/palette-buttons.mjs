import { app } from "../../../../../scripts/app.js";

const SWITCHING = "data-palette-switching";

const TOKEN = "--secondary";

const SHARE = 95;

function palettes() {
  const service = app.extensionManager?.colorPalette;
  return typeof service?.getActiveColorPalette === "function" ? service : null;
}

function shade(palette) {
  const base = palette?.colors?.comfy_base || {};
  const surface = base["interface-panel-surface"] ?? base["comfy-menu-bg"];
  if (!surface) return "";
  const contrast = base["contrast-mix-color"] ?? "#fff";
  return `color-mix(in srgb, ${surface} ${SHARE}%, ${contrast})`;
}

export default {
  key: "qolPaletteButtons",
  name: "Custom palettes keep readable buttons",
  tooltip: "From frontend 1.58, a colour palette without its own theme colours paints buttons and "
    + "fields in its node header colour, which can leave their text unreadable. On, they take a "
    + "shade of the palette's panel colour.",
  issues: [],
  defaultValue: true,
  verified: "1.58.5",
  check() {
    if (!palettes()) return "ComfyUI's colour palettes are not reachable";
    return typeof MutationObserver === "function" ? "" : "the page is not ready";
  },
  on(track, standDown) {
    const root = document.documentElement;
    let mine = "";
    let theirs = "";
    let down = false;
    const fix = () => {
      if (down) return;
      const now = root.style.getPropertyValue(TOKEN).trim();
      if (mine && now === mine) return;
      mine = "";
      theirs = "";
      if (!now) return;
      const palette = palettes()?.getActiveColorPalette();
      const header = palette?.colors?.litegraph_base?.NODE_DEFAULT_COLOR;
      if (!header || palette.colors.theme?.secondary) return;
      if (now !== header) {
        down = true;
        standDown("ComfyUI shades palette buttons itself");
        return;
      }
      const value = shade(palette);
      if (!value) return;
      theirs = now;
      mine = value;
      root.style.setProperty(TOKEN, value);
    };
    const watcher = new MutationObserver(fix);
    watcher.observe(root, { attributes: true, attributeFilter: [SWITCHING] });
    track(() => {
      watcher.disconnect();
      if (mine && root.style.getPropertyValue(TOKEN).trim() === mine) {
        root.style.setProperty(TOKEN, theirs);
      }
      mine = "";
      theirs = "";
    });
    fix();
  },
};
