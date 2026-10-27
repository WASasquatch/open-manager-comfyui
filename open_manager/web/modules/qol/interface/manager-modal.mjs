const MODAL_CSS = `
[role="dialog"]:has(> .manager-dialog) {
  width: max-content; max-width: none; height: auto; max-height: none;
}`;

function hostCapsFrame() {
  const probe = document.createElement("div");
  probe.className = "manager-dialog";
  probe.style.cssText = "position: absolute; visibility: hidden; pointer-events: none;";
  document.body.appendChild(probe);
  const cap = getComputedStyle(probe).maxWidth;
  probe.remove();
  return cap !== "none";
}

export default {
  key: "qolManagerModal",
  name: "Nodes Manager fits its contents",
  tooltip: "ComfyUI's Nodes Manager frame stops at 1724px while its contents grow to 2200px "
    + "on screens 3000px wide and over, which cuts off its right side, close button and "
    + "filters. On, the frame is sized to its contents.",
  issues: ["Comfy-Org/ComfyUI_frontend#14590"],
  defaultValue: true,
  verified: "1.57.4",
  check() {
    return "";
  },
  on(track, standDown) {
    if (!hostCapsFrame()) {
      standDown("the Nodes Manager frame already fits its contents");
      return;
    }
    const tag = document.createElement("style");
    tag.id = "om-qol-manager-modal";
    tag.textContent = MODAL_CSS;
    document.head.appendChild(tag);
    track(() => tag.remove());
  },
};
