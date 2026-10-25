const VIEWPORT = '[data-testid="widget-select-default-viewport"]';

const TALLEST = "70vh";

const CHROME = 52;

const RULES = `${VIEWPORT} {
  max-height: max(14rem, min(${TALLEST}, calc(var(--reka-combobox-content-available-height, 60vh) - ${CHROME}px)));
}`;

let sheet = null;

export default {
  key: "qolComboListHeight",
  name: "Combo lists use the room on screen",
  tooltip: "On Nodes 2.0, a combo's list shows about seven options at a time. On, it grows into "
    + "the room on screen.",
  issues: [],
  defaultValue: true,
  verified: "1.55.18",
  check() {
    return document.head ? "" : "the page is not ready";
  },
  on(track) {
    sheet = document.createElement("style");
    sheet.textContent = RULES;
    document.head.appendChild(sheet);
    track(() => {
      sheet?.remove();
      sheet = null;
    });
  },
};
