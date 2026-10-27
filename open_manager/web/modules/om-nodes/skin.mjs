const ROOT = "html[data-om-nodes]";
const NODE = `${ROOT} .lg-node`;
const GRID = `${NODE} .lg-node-widgets`;
const SECTION = ".grid-rows-subgrid";
const ROW = `:is(${GRID} > [data-testid="node-widget"], ${GRID} > ${SECTION} > [data-testid="node-widget"])`;
const PLAIN_ROW = `:is(${GRID}, ${GRID} > ${SECTION}) > .col-span-full:not(.lg-node-widget):not(${SECTION})`;
const LABEL = '[data-testid="widget-layout-field-label"]';
const SPAN = ["> .col-span-2", "> .col-span-2 > .col-span-2", "> .col-span-2 > .col-span-2 > .col-span-2"];
const HAS_LABEL = SPAN.map((path) => `${path} > ${LABEL}`).join(", ");
const LEGACY = ':is([class*="mx-["], .-mx-3)';
const HAS_BUTTON = SPAN.slice(0, 2).map((path) => `${path}.flex-col.gap-1`).join(", ");
const HAS_LEGACY = SPAN.slice(0, 2).map((path) => `${path}${LEGACY}`).join(", ");
const FIELD = `${ROW}:has(${HAS_LABEL})`;
const ROOTS = SPAN.map((path) => `${ROW} ${path}`);
const LABELS = ROOTS.map((root) => `${root} > ${LABEL}`);
const CELLS = LABELS.map((label) => `${label} + .min-w-0`);
const BODY = '[data-testid^="node-body-"]';
const WRAP = '[data-testid="node-inner-wrapper"]';
const RING = '[data-testid="node-state-outline-overlay"]';
const FOOT = ".box-border.isolate";
const ERROR_TAB = "button:is(.bg-destructive-background, .bg-destructive, .bg-warning-background, .bg-warning)";
const TABS = `:is([data-testid="advanced-inputs-button"], [data-testid="subgraph-enter-button"], ${ERROR_TAB})`;
const NAMED = ':is([data-testid="advanced-inputs-button"], [data-testid="subgraph-enter-button"])';
const STEP = ':is([data-testid="decrement"], [data-testid="increment"])';
const TRIGGER = '[data-testid="widget-select-default-trigger"]';
const SELECTED = ":is(.outline-node-component-outline, .outline-foreground)";
const PROGRESS = ":is(.bg-primary-500, .bg-primary)";
const BADGE = ":is(.bg-node-component-surface, .bg-node)";
const SLOT_ERROR = ":is(.text-error, .text-destructive)";
const LIST_DOT = '[data-testid="slot-dot"][class*="rounded-[1px]"]';
const LIST_CELLS = ["right", "bottom"].map((way) => `linear-gradient(to ${way}, #000 0 25%, `
  + "transparent 25% 37.5%, #000 37.5% 62.5%, transparent 62.5% 75%, #000 75% 100%)").join(", ");
const BUTTONS = SPAN.slice(0, 2).map((path) => `${ROW} ${path}.flex-col.gap-1 > button`).join(",\n");
const LEGACIES = SPAN.slice(0, 2).map((path) => `${ROW} ${path}${LEGACY}`).join(",\n");
const TEXTAREAS = SPAN.slice(0, 2).map((path) => `${ROW} ${path}`);
const OTHER = `${ROW}:not(:has(${HAS_LABEL})):not(:has(${HAS_BUTTON})):not(:has(${HAS_LEGACY})) > .col-span-2`;
const BYPASSED = `${NODE}:has(> ${WRAP}[class*="before:bg-bypass"])`;
const MUTED = `${NODE}:has(> ${WRAP}[class*="before:inset-0"]:not([class*="before:bg-bypass"]))`;
const STATUS = `:is(${BYPASSED}, ${MUTED})`;
const svg = (body) => `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="#000" `
  + `stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`,
)}")`;
const BYPASS_ICON = svg('<path d="M2.5 10a5.5 5.5 0 0 1 10.3-2.7"/><path d="M13.3 3.6v3.8H9.5"/>'
  + '<circle cx="8" cy="12.6" r="1.3" fill="#000" stroke="none"/>');
const MUTE_ICON = svg('<circle cx="8" cy="8" r="5.6"/><path d="M4.1 4.1l7.8 7.8"/>');
const RADIUS = "var(--omn-widget-radius, calc(var(--omn-widget-height) / 2))";
const HOVER = "var(--omn-widget-bg-hover, color-mix(in srgb, var(--omn-widget-bg) 88%, #fff))";
const SHADOW = "var(--omn-shadow-x) var(--omn-shadow-y) var(--omn-shadow-blur) var(--omn-shadow-color)";

const each = (list, tail) => list.map((one) => `${one}${tail}`).join(",\n");
const cell = (tail = "") => each(CELLS, tail ? ` ${tail}` : "");

export const SKIN = `
${ROOT} {
  --omn-title-height: 30px;
  --omn-slot-height: 20px;
  --omn-widget-height: 20px;
  --omn-widget-gap: 4px;
  --omn-widget-inset: 15px;
  --omn-widget-pad: 20px;
  --omn-node-radius: 8px;
  --omn-title-size: 14px;
  --omn-title-weight: 400;
  --omn-text-size: 12px;
  --omn-font: Inter, Arial, sans-serif;
  --omn-dot-size: 8px;
  --omn-outline-width: 2px;
  --omn-outline-gap: 2px;
  --omn-shadow-x: 2px;
  --omn-shadow-y: 2px;
  --omn-shadow-blur: 3px;
  --omn-shadow-color: rgba(0, 0, 0, 0.5);
  --omn-title-ink: #999;
  --omn-title-ink-selected: #fff;
  --omn-slot-ink: #aaa;
  --omn-widget-bg: #222;
  --omn-widget-outline: #666;
  --omn-widget-outline-advanced: rgba(56, 139, 253, 0.8);
  --omn-widget-label: #999;
  --omn-widget-value: #ddd;
  --omn-widget-disabled: #666;
  --omn-accent: var(--primary, var(--primary-background, #0b8ce9));
  --omn-selection: #fff;
  --omn-running: #0f0;
  --omn-progress: green;
  --omn-drop: dodgerblue;
  --omn-progress-height: 3px;
  --omn-status-fade: 0.5;
  --omn-error: var(--destructive, var(--destructive-background, #e00));
}
${NODE} {
  --radius-xl: var(--omn-node-radius);
  --min-node-width: 0px !important;
  font-family: var(--omn-font);
  filter: none;
}
${NODE} > ${WRAP} {
  box-shadow: var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), ${SHADOW};
}
${NODE} > ${WRAP}.ring-4 {
  --tw-ring-shadow: 0 0 0 2px var(--tw-ring-color, currentcolor);
}
${NODE} > ${WRAP}:is(.ring-destructive-background, .ring-destructive) {
  --tw-ring-color: var(--omn-error);
}
${NODE} > ${WRAP}:is(.ring-primary-500, .ring-primary) {
  --tw-ring-color: var(--omn-drop);
  background-color: color-mix(in srgb, var(--omn-drop) 10%, transparent);
}
${NODE} > ${WRAP}::before {
  border-radius: inherit;
}
${NODE} > ${WRAP} > .relative > ${PROGRESS} {
  top: 0;
  z-index: 1;
  height: var(--omn-progress-height);
  border-radius: 0;
  background: var(--omn-progress);
  transform: none;
  translate: none;
}
${NODE} > ${WRAP} > ${PROGRESS} {
  bottom: 0;
  left: var(--omn-node-radius);
  right: auto;
  max-width: calc(100% - 2 * var(--omn-node-radius));
  height: var(--omn-progress-height);
  border-radius: 0;
  background: var(--omn-progress);
  transform: none;
  translate: none;
}
${NODE} > ${RING} {
  border-width: var(--omn-outline-width);
  inset: calc(-1 * (var(--omn-outline-width) + var(--omn-outline-gap)));
}
${NODE} > ${RING}[class*="rounded-["] {
  border-radius: calc(var(--omn-node-radius) + var(--omn-outline-width) + var(--omn-outline-gap));
}
${NODE} > ${RING}[class*="rounded-tl-["] {
  border-radius: calc(var(--omn-node-radius) + var(--omn-outline-width) + var(--omn-outline-gap)) 0;
}
${NODE} > ${RING}:is(.border-node-component-outline, .border-foreground) {
  border-color: var(--omn-selection);
}
${NODE} > ${RING}:is(.border-node-stroke-executing, .border-primary) {
  border-color: var(--omn-running);
}
${NODE} .lg-node-header {
  display: flex;
  align-items: center;
  height: var(--omn-title-height);
  padding: 0 8px 0 0;
  color: var(--omn-title-ink);
  font-size: var(--omn-title-size);
  font-weight: var(--omn-title-weight);
  line-height: 1.2;
}
${NODE}${SELECTED} .lg-node-header {
  color: var(--omn-title-ink-selected);
}
${NODE} .lg-node-header > div {
  width: 100%;
  height: 100%;
}
${NODE} .lg-node-header > div > .mr-auto {
  height: 100%;
  gap: 0;
}
${NODE} .lg-node-header .shrink-0.px-0\\.5 {
  height: 100%;
  padding: 0;
}
${NODE} [data-testid="node-collapse-button"] {
  width: var(--omn-title-height);
  height: 100%;
  min-width: 0;
  padding: 0;
  border-radius: 0;
  color: inherit;
}
${NODE} > :is([data-corner="NW"], [data-corner="NE"]) {
  width: 10px;
  height: 10px;
}
${NODE} [data-testid="node-collapse-button"] i {
  width: 14px;
  height: 14px;
  color: var(--omn-box, currentColor);
  opacity: 0.75;
}
${NODE} [data-testid="node-collapse-button"]:hover i {
  opacity: 1;
}
${NODE} [data-testid="node-title"] {
  height: 100%;
}
${NODE} [data-testid="node-pin-indicator"] {
  flex-shrink: 0;
}
${NODE}:has(> ${FOOT} > ${NAMED}) .lg-node-header,
${NODE}:has(> ${FOOT} > ${ERROR_TAB}) .lg-node-header {
  padding-right: 30px;
}
${NODE}:has(> ${FOOT} > ${ERROR_TAB}):has(> ${FOOT} > ${NAMED}) .lg-node-header {
  padding-right: 54px;
}
${NODE} > ${FOOT} {
  position: absolute;
  top: 0;
  right: 4px;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 2px;
  width: auto;
  height: var(--omn-title-height);
  margin: 0;
  padding: 0;
}
${NODE} > ${FOOT} > ${TABS} {
  width: 22px;
  height: 22px;
  margin: 0;
  padding: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--omn-title-ink);
  box-shadow: none;
}
${STATUS} {
  --omn-status-foot: 0px;
  --omn-status-pin: 0px;
  opacity: 1 !important;
}
${STATUS} > ${WRAP},
${STATUS} > ${FOOT} {
  opacity: var(--omn-status-fade);
}
${STATUS}:has(> ${FOOT} > ${NAMED}),
${STATUS}:has(> ${FOOT} > ${ERROR_TAB}) {
  --omn-status-foot: 22px;
}
${STATUS}:has(> ${FOOT} > ${ERROR_TAB}):has(> ${FOOT} > ${NAMED}) {
  --omn-status-foot: 46px;
}
${STATUS}:has([data-testid="node-pin-indicator"]) {
  --omn-status-pin: 20px;
}
${STATUS} .lg-node-header > div > ${BADGE} {
  visibility: hidden;
}
${STATUS}::after {
  position: absolute;
  top: calc((var(--omn-title-height) - 18px) / 2);
  right: calc(8px + var(--omn-status-foot) + var(--omn-status-pin));
  z-index: 3;
  height: 18px;
  padding: 0 21px 0 6px;
  border-radius: 4px;
  background: var(--omn-widget-bg);
  outline: 1px solid var(--omn-widget-outline);
  outline-offset: -1px;
  color: var(--omn-widget-value);
  font: 11px/18px var(--omn-font);
  white-space: nowrap;
  pointer-events: none;
}
${STATUS}::before {
  content: "";
  position: absolute;
  top: calc((var(--omn-title-height) - 12px) / 2);
  right: calc(14px + var(--omn-status-foot) + var(--omn-status-pin));
  z-index: 4;
  width: 12px;
  height: 12px;
  background: var(--omn-widget-value);
  -webkit-mask: var(--omn-status-icon) center / contain no-repeat;
  mask: var(--omn-status-icon) center / contain no-repeat;
  pointer-events: none;
}
${BYPASSED} {
  --omn-status-icon: ${BYPASS_ICON};
}
${BYPASSED}::after {
  content: "Bypassed";
}
${MUTED} {
  --omn-status-icon: ${MUTE_ICON};
}
${MUTED}::after {
  content: "Muted";
}
${NODE} > ${FOOT} > ${TABS}:hover {
  background: color-mix(in srgb, currentColor 18%, transparent);
}
${NODE} > ${FOOT} > button:is(.bg-destructive-background, .bg-destructive) {
  color: var(--omn-error);
}
${NODE} > ${FOOT} > button:is(.bg-warning-background, .bg-warning) {
  color: var(--warning, var(--warning-background));
}
${NODE} > ${FOOT} > ${TABS} span {
  display: none;
}
${NODE} > ${FOOT} > ${TABS} i {
  width: 14px;
  height: 14px;
}
${NODE} ${BODY} {
  padding: 4px 0 2px;
  row-gap: 2px !important;
}
${NODE} ${BODY}:has(> [data-testid="node-widgets"]) {
  padding-bottom: 12px;
}
${NODE} ${BODY}:has(> .flex-col > .lg-node-content > .image-preview) > :is(img.min-h-55, .mt-1.text-center, .size-full.text-center) {
  display: none;
}
${NODE} ${BODY} > .mt-auto {
  position: absolute;
  right: 0;
  bottom: calc(100% + 2px);
  width: auto;
  height: auto;
  padding: 0;
  gap: 2px;
}
${NODE} .lg-slot:not(.lg-slot--dot-only) {
  height: var(--omn-slot-height);
}
${NODE} .lg-slot--input:not(.lg-slot--dot-only) {
  padding-right: 4px;
}
${NODE} .lg-slot--output:not(.lg-slot--dot-only) {
  padding-left: 4px;
}
${NODE} .lg-slot span.truncate {
  color: var(--omn-slot-ink);
  font-size: var(--omn-text-size);
}
${NODE} .lg-slot span${SLOT_ERROR} {
  color: var(--omn-error);
}
${NODE} [data-testid="slot-dot"] {
  width: var(--omn-dot-size);
  height: var(--omn-dot-size);
}
${NODE} ${LIST_DOT} {
  border: 0;
  border-radius: 0;
  -webkit-mask-image: ${LIST_CELLS};
  -webkit-mask-composite: source-in;
  mask-image: ${LIST_CELLS};
  mask-composite: intersect;
}
${GRID} {
  grid-template-columns: 0 0 minmax(0, 1fr);
  row-gap: var(--omn-widget-gap);
  padding: 0 var(--omn-widget-inset);
  font-size: var(--omn-text-size);
}
${PLAIN_ROW} {
  margin-left: calc(-1 * var(--omn-widget-inset));
}
${PLAIN_ROW} .lg-slot--input > [data-testid="slot-connection-dot"] + div {
  padding-left: calc(var(--omn-widget-inset) + var(--omn-widget-pad) - 12px);
}
${PLAIN_ROW} .lg-slot--input span.truncate:not(${SLOT_ERROR}) {
  color: var(--omn-widget-label);
}
${ROW} {
  position: relative;
}
${ROW} > .z-10 {
  position: absolute;
  top: 0;
  left: calc(-1 * var(--omn-widget-inset));
  width: 0;
  height: var(--omn-widget-height);
  overflow: visible;
}
${ROW} > .z-10 [data-testid="slot-connection-dot"] {
  height: var(--omn-widget-height);
}
${ROW} > .col-span-2 {
  grid-column: 2 / -1;
}
${OTHER} {
  margin-inline: min(0px, calc(10px - var(--omn-widget-inset)));
}
${LEGACIES} {
  width: calc(100% + 2 * var(--omn-widget-inset));
  margin-inline: calc(-1 * var(--omn-widget-inset));
}
${FIELD} {
  min-height: var(--omn-widget-height);
  border-radius: ${RADIUS};
  background: var(--omn-widget-bg);
  outline: 1px solid var(--omn-widget-outline);
  outline-offset: -1px;
  font-size: var(--omn-text-size);
}
${FIELD}:hover {
  background: ${HOVER};
}
${FIELD}:has(:is(.ring-component-node-widget-advanced, .ring-primary)) {
  outline-color: var(--omn-widget-outline-advanced);
}
${FIELD}:focus-within {
  outline-color: var(--omn-accent);
}
${each(ROOTS, `:has(> ${LABEL})`)} {
  display: flex;
  align-items: center;
  column-gap: 0;
  min-width: 0;
}
${each(LABELS, "")} {
  flex: 0 100 auto;
  min-width: 0;
  height: var(--omn-widget-height);
  padding: 0 6px 0 var(--omn-widget-pad);
  color: var(--omn-widget-label);
  line-height: var(--omn-widget-height);
}
${each(LABELS, ":has(+ .min-w-0 .cursor-ew-resize)")} {
  cursor: ew-resize;
}
${cell()} {
  position: static;
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  min-width: 0;
  height: var(--omn-widget-height);
}
${cell("> .cursor-default")} {
  position: static;
  display: flex;
  align-items: center;
  width: 100%;
  height: 100%;
  border-radius: 0;
  box-shadow: none;
}
${cell("> .cursor-default > div")} {
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
}
${cell("> .cursor-default > .w-fit")} {
  flex: 0 0 auto;
}
${cell(":is(.bg-component-node-widget-background, .bg-input, .bg-secondary)")},
${cell(":is(.not-disabled\\:bg-component-node-widget-background, .not-disabled\\:bg-input)")},
${cell(":is(.hover\\:bg-component-node-widget-background-hovered, .hover\\:bg-muted):hover")} {
  background-color: transparent;
}
${cell(".ring")},
${cell(".focus-within\\:ring")} {
  --tw-ring-shadow: 0 0 #0000;
}
${cell(".h-6")},
${cell(".h-8")} {
  height: var(--omn-widget-height);
}
${cell(".overflow-hidden.grow")} {
  position: static;
  overflow: visible;
  height: 100%;
}
${cell(".overflow-hidden.grow > .pointer-events-none")} {
  inset: 0;
  width: auto;
  height: auto;
  border-radius: ${RADIUS};
}
${cell(".overflow-hidden.grow > .flex-1")} {
  height: 100%;
  margin: 0;
  padding: 0;
}
${cell('[data-testid="decrement"]')} {
  order: 1;
  border-radius: 0;
}
${cell('[data-testid="increment"]')} {
  order: 1;
  border-radius: 0 ${RADIUS} ${RADIUS} 0;
}
${cell(STEP)} {
  width: var(--omn-widget-pad);
  height: 100%;
  aspect-ratio: auto;
  color: var(--omn-widget-label);
  opacity: 0.7;
}
${cell(`${STEP}:hover`)} {
  opacity: 1;
}
${cell(`${STEP} i`)} {
  width: 10px;
  height: 10px;
}
${cell("input")} {
  padding: 0 4px;
  color: var(--omn-widget-value);
  font-size: var(--omn-text-size);
  text-align: right;
}
${cell("input:disabled")} {
  color: var(--omn-widget-disabled);
}
${cell('[data-testid="value-control"]')} {
  width: 22px;
  height: 14px;
  margin: 0 2px;
  border-radius: 7px;
}
${cell(`${TRIGGER} > span`)} {
  padding: 0 2px 0 4px;
  color: var(--omn-widget-value);
  font-size: var(--omn-text-size);
  text-align: right;
}
${cell(`${TRIGGER} ~ button`)} {
  width: var(--omn-widget-pad);
  height: 100%;
}
${cell(`${TRIGGER} ~ button i`)},
${cell("button.h-8 > i")},
${cell("label.size-8 i")} {
  width: 12px;
  height: 12px;
}
${cell(".text-base.leading-none")} {
  height: 100%;
  font-size: var(--omn-text-size);
}
${cell("button.h-8")} {
  padding: 0;
  border-radius: 0 ${RADIUS} ${RADIUS} 0;
}
${cell("button.h-8.rounded-l-lg")} {
  border-radius: 0;
}
${cell("button.h-8 > span")} {
  padding: 0 2px 0 4px;
  color: var(--omn-widget-value);
  text-align: right;
}
${cell("button.h-8 > i")} {
  margin: 0 6px 0 2px;
}
${cell("label.size-8")} {
  width: 24px;
  height: 100%;
  border-left: 1px solid var(--omn-widget-outline);
  border-radius: 0 ${RADIUS} ${RADIUS} 0;
}
${cell("input:is(.p-inputtext, .appearance-none)")} {
  field-sizing: content;
  min-width: 2ch;
  height: var(--omn-widget-height);
  padding: 0 10px 0 4px;
  border: 0;
  background: transparent;
  box-shadow: none;
}
${cell(".w-fit.rounded-full")} {
  height: 100%;
  margin: 0 6px 0 auto;
  padding: 0;
  box-shadow: none;
}
${cell('[role="switch"]')} {
  width: 28px;
  height: 100%;
}
${cell('[role="switch"] > span')} {
  width: 26px;
  height: 14px;
  padding: 0 2px;
}
${cell('[role="switch"] > span > span')} {
  width: 10px;
  height: 10px;
  translate: 0 0;
}
${cell('[role="switch"] > span > span[data-state="checked"]')} {
  translate: 12px 0;
}
${cell('[role="group"]')} {
  height: 100%;
  gap: 2px;
  padding: 2px;
}
${cell('[role="group"]')} {
  min-width: 0;
}
${cell('[role="group"] > button')} {
  display: block;
  flex: 0 1 auto;
  min-width: 0;
  height: 100%;
  padding: 0 8px;
  overflow: hidden;
  font-size: var(--omn-text-size);
  text-overflow: ellipsis;
  white-space: nowrap;
}
${BUTTONS} {
  height: var(--omn-widget-height);
  min-height: 0;
  padding: 0 8px;
  border-radius: ${RADIUS};
  background: var(--omn-widget-bg);
  outline: 1px solid var(--omn-widget-outline);
  outline-offset: -1px;
  color: var(--omn-widget-value);
  font-size: var(--omn-text-size);
}
${each(BUTTONS.split(",\n"), ":hover")} {
  background: ${HOVER};
}
${each(TEXTAREAS, " > textarea")} {
  padding: 4px 6px;
  border-radius: 6px;
  background: var(--omn-widget-bg);
  outline: 1px solid var(--omn-widget-outline);
  outline-offset: -1px;
  color: var(--omn-widget-value);
}
${each(TEXTAREAS, " > textarea:focus")} {
  outline-color: var(--omn-accent);
}
${each(TEXTAREAS, " > label:has(+ textarea)")} {
  top: 4px;
  left: 7px;
  color: var(--omn-widget-label);
}
${each(TEXTAREAS, " > label:has(+ textarea:not(:placeholder-shown))")} {
  display: none;
}
${NODE} .om-row-grip {
  position: absolute;
  left: 0;
  right: 0;
  bottom: -6px;
  height: 8px;
  cursor: ns-resize;
  touch-action: none;
  z-index: 2;
}
${NODE} .om-row-grip::after {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  width: 24px;
  height: 2px;
  margin: -1px 0 0 -12px;
  border-radius: 1px;
  background: var(--omn-widget-label);
  opacity: 0;
}
${NODE}:hover .om-row-grip::after {
  opacity: .35;
}
${NODE} .om-row-grip:hover::after,
${NODE} .om-row-grip[data-om-held]::after {
  opacity: .95;
}
`;
