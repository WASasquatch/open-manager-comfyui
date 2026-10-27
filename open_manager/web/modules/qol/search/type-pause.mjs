const FIELD = 'input[role="combobox"][aria-controls="results-list"]';

const KEYS = new Set(["Enter", "ArrowDown", "ArrowUp"]);

const SLOW_MS = 50;

const SHORTEST = 80;

const LONGEST = 250;

const ours = new WeakSet();

let cost = 0;

let timer = 0;

let held = null;

let field = null;

let skip = false;

let measuring = false;

function measure(start) {
  if (measuring) return;
  measuring = true;
  requestAnimationFrame(() => {
    measuring = false;
    if (skip) {
      skip = false;
      return;
    }
    const spent = performance.now() - start;
    cost = cost ? cost * 0.6 + spent * 0.4 : spent;
  });
}

function release() {
  clearTimeout(timer);
  timer = 0;
  const target = held;
  held = null;
  if (!target?.isConnected) return;
  const event = new Event("input", { bubbles: true });
  ours.add(event);
  measure(performance.now());
  target.dispatchEvent(event);
}

function onInput(event) {
  if (ours.has(event) || event.isComposing) return;
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || !target.matches(FIELD)) return;
  if (target !== field) {
    field = target;
    skip = true;
  }
  if (held !== target && cost < SLOW_MS) {
    measure(performance.now());
    return;
  }
  event.stopImmediatePropagation();
  held = target;
  clearTimeout(timer);
  timer = setTimeout(release, Math.min(LONGEST, Math.max(SHORTEST, Math.round(cost * 1.5))));
}

function onPointer() {
  if (held) release();
}

function onKey(event) {
  if (ours.has(event) || !held || event.target !== held || !KEYS.has(event.key)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const target = held;
  release();
  setTimeout(() => {
    const again = new KeyboardEvent("keydown", {
      key: event.key, code: event.code, bubbles: true, cancelable: true,
      shiftKey: event.shiftKey, ctrlKey: event.ctrlKey, altKey: event.altKey, metaKey: event.metaKey,
    });
    ours.add(again);
    target.dispatchEvent(again);
  }, 0);
}

export default {
  key: "qolSearchTypePause",
  name: "Node search waits for a pause in typing",
  tooltip: "Slow searches run once typing pauses.",
  issues: [],
  defaultValue: true,
  verified: "1.57.4",
  check() {
    if (typeof requestAnimationFrame !== "function") return "no animation frames";
    return "";
  },
  on(track) {
    window.addEventListener("input", onInput, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onPointer, true);
    track(() => {
      window.removeEventListener("input", onInput, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onPointer, true);
      if (held) release();
    });
  },
};
