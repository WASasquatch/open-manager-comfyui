const TAB = ".workflow-tabs-container .workflow-tabs > :is(.p-togglebutton, .workflow-tab)";

const ON = ':is(.p-togglebutton-checked, :has(> [role="tab"][aria-selected="true"]))';

const FACE = ':is(.p-togglebutton-content, [role="tab"])';

const LINE = "var(--interface-stroke, var(--border-color, #2b2b2b))";

const TABS_CSS = `
.workflow-tabs-container .workflow-tabs { gap: 0 !important; align-items: stretch !important; }
${TAB} { height: 100%; border-radius: 0 !important; border-right: 1px solid ${LINE} !important; }
${TAB}:first-child { border-left: 1px solid ${LINE} !important; }
${TAB}:not([data-om-tint]) { background: transparent !important; }
${TAB}:not([data-om-tint]):hover {
  background: color-mix(in srgb, var(--fg-color, #fff) 5%, transparent) !important; }
${TAB}${ON}:not([data-om-tint]) {
  background: color-mix(in srgb, var(--fg-color, #fff) 9%, transparent) !important; }
${TAB}${ON}::after { content: ""; position: absolute; left: 0; right: 0; top: 0;
  height: 2px; background: var(--p-button-text-primary-color, var(--p-primary-color, #388bfd));
  pointer-events: none; }
${TAB} > ${FACE} { height: 100%; border-radius: 0 !important;
  background: transparent !important; box-shadow: none !important; }
${TAB} .workflow-tab { height: 100%; }
body.om-desk-open ${TAB}${ON}::after { display: none; }
body.om-desk-open ${TAB}${ON}:not([data-om-tint]) {
  background: transparent !important; }`;

function flat(node) {
  return !node || getComputedStyle(node).borderTopLeftRadius === "0px";
}

export default {
  key: "qolClassicTabs",
  name: "Workflow tabs look like tabs",
  tooltip: "Flat tabs side by side with a line between each, the open one marked along its top, "
    + "in place of rounded buttons.",
  issues: [],
  defaultValue: true,
  verified: "1.57.4",
  check() {
    const tab = document.querySelector(TAB);
    if (tab && flat(tab) && flat(tab.querySelector(`:scope > ${FACE}`))
        && getComputedStyle(tab).borderRightWidth !== "0px") {
      return "the workflow tabs are already flat";
    }
    return "";
  },
  on(track) {
    const tag = document.createElement("style");
    tag.id = "om-qol-classic-tabs";
    tag.textContent = TABS_CSS;
    document.head.appendChild(tag);
    track(() => tag.remove());
  },
};
