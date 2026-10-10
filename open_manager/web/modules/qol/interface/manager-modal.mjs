const MODAL_CSS = `
[role="dialog"]:has(> .manager-dialog) {
  width: max-content; max-width: none; height: auto; max-height: none;
}`;

export default {
  key: "qolManagerModal",
  name: "Nodes Manager fits its contents",
  tooltip: "ComfyUI's Nodes Manager frame stops at 1724px while its contents grow to 2200px "
    + "on screens 3000px wide and over, which cuts off its right side, close button and "
    + "filters. On, the frame is sized to its contents.",
  issues: ["Comfy-Org/ComfyUI_frontend#14590"],
  defaultValue: true,
  verified: "1.53.6",
  check() {
    return "";
  },
  on(track) {
    const tag = document.createElement("style");
    tag.id = "om-qol-manager-modal";
    tag.textContent = MODAL_CSS;
    document.head.appendChild(tag);
    track(() => tag.remove());
  },
};
