const WINDOW_MS = 400;

const MIDDLE = 4;

const NOT_TEXT = new Set([
  "button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit",
]);

const POINTER_EVENTS = ["pointerdown", "pointerup", "pointermove", "pointercancel"];

let held = false;

let releasedAt = -Infinity;

let keyedAt = -Infinity;

function editable(target) {
  return target instanceof HTMLTextAreaElement
    || (target instanceof HTMLElement && target.isContentEditable)
    || (target instanceof HTMLInputElement && !NOT_TEXT.has(target.type));
}

function onPointer(event) {
  if ((event.buttons & MIDDLE) !== 0) {
    held = true;
  } else if (held || (event.type === "pointerup" && event.button === 1)) {
    held = false;
    releasedAt = performance.now();
  }
}

function onAuxClick(event) {
  if (event.button === 1) releasedAt = performance.now();
}

function onKey(event) {
  const key = String(event.key || "").toLowerCase();
  if (((event.ctrlKey || event.metaKey) && key === "v") || (event.shiftKey && key === "insert")) {
    keyedAt = performance.now();
  }
}

function onPaste(event) {
  if (editable(event.target)) return;
  const now = performance.now();
  if (!held && now - releasedAt > WINDOW_MS) return;
  if (keyedAt >= releasedAt && now - keyedAt <= WINDOW_MS) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}

export default {
  key: "qolMiddleClickPaste",
  name: "Middle-click does not paste",
  tooltip: "On Linux, a middle click pastes the system selection, and ComfyUI turns any paste "
    + "that is not a workflow or an image into the last copied nodes, so panning with the middle "
    + "button drops copies on the canvas. On, a paste that comes from a middle click is ignored "
    + "outside text fields.",
  issues: [
    "Comfy-Org/ComfyUI_frontend#6435",
    "Comfy-Org/ComfyUI_frontend#2409",
    "Comfy-Org/ComfyUI#9863",
  ],
  defaultValue: true,
  verified: "1.54.8",
  check() {
    return "";
  },
  on(track) {
    for (const type of POINTER_EVENTS) window.addEventListener(type, onPointer, true);
    window.addEventListener("auxclick", onAuxClick, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("paste", onPaste, true);
    track(() => {
      for (const type of POINTER_EVENTS) window.removeEventListener(type, onPointer, true);
      window.removeEventListener("auxclick", onAuxClick, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("paste", onPaste, true);
      held = false;
      releasedAt = -Infinity;
      keyedAt = -Infinity;
    });
  },
};
