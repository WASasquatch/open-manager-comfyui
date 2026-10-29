import { i18nGlobal } from "../../command-labels.mjs";

const NODE = ".lg-node[data-node-id]";

const NATIVE_KEYS = ["contextMenu.Open Video", "contextMenu.Save Video"];

let active = false;

function onVideoMenu(event) {
  event.currentTarget.removeEventListener("contextmenu", onVideoMenu);
  if (active && !event.defaultPrevented) event.stopPropagation();
}

function onMenu(event) {
  const video = event.target;
  if (video instanceof HTMLVideoElement && video.closest(NODE)) {
    video.addEventListener("contextmenu", onVideoMenu);
  }
}

function hostMenuHasVideo() {
  const i18n = i18nGlobal();
  return !!i18n && NATIVE_KEYS.some((key) => i18n.te(key, "en"));
}

export default {
  key: "qolVideoBrowserMenu",
  name: "Right-clicking a video opens the browser's menu",
  tooltip: "On Nodes 2.0, right-clicking a video opens the node's menu, which cannot save the "
    + "video or open it in a new tab. On, it opens the browser's menu for the video, as on the "
    + "classic canvas.",
  issues: ["Comfy-Org/ComfyUI_frontend#3842"],
  defaultValue: true,
  verified: "1.57.4",
  check() {
    return window.electronAPI ? "ComfyUI Desktop has no browser menu" : "";
  },
  on(track, standDown) {
    if (hostMenuHasVideo()) {
      standDown("ComfyUI's node menu saves and opens videos itself");
      return;
    }
    active = true;
    document.addEventListener("contextmenu", onMenu, true);
    track(() => {
      document.removeEventListener("contextmenu", onMenu, true);
      active = false;
    });
  },
};
