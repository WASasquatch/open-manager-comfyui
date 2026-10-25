const LABEL = '[data-testid="widget-layout-field-label"]';

const SWIPE = ".cursor-ew-resize";

let live = false;

function swipeFor(label) {
  const swipe = label.nextElementSibling?.querySelector(SWIPE);
  return swipe && swipe.getClientRects().length ? swipe : null;
}

function onDown(event) {
  if (event.button !== 0 || !event.isTrusted || !document.documentElement.hasAttribute("data-om-nodes")) {
    return;
  }
  const label = event.target instanceof Element ? event.target.closest(LABEL) : null;
  if (!label?.closest(".lg-node")) return;
  const swipe = swipeFor(label);
  if (!swipe) return;
  event.preventDefault();
  event.stopPropagation();
  swipe.dispatchEvent(new PointerEvent("pointerdown", {
    bubbles: true,
    cancelable: true,
    composed: true,
    pointerId: event.pointerId,
    pointerType: event.pointerType,
    isPrimary: event.isPrimary,
    clientX: event.clientX,
    clientY: event.clientY,
    screenX: event.screenX,
    screenY: event.screenY,
    button: event.button,
    buttons: event.buttons,
    pressure: event.pressure,
    width: event.width,
    height: event.height,
    ctrlKey: event.ctrlKey,
    shiftKey: event.shiftKey,
    altKey: event.altKey,
    metaKey: event.metaKey,
  }));
}

export function startScrub() {
  if (live) return;
  live = true;
  document.addEventListener("pointerdown", onDown, true);
}

export function stopScrub() {
  if (!live) return;
  live = false;
  document.removeEventListener("pointerdown", onDown, true);
}
