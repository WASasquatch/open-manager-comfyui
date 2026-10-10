import { api } from "../../../../../scripts/api.js";

const TICK_MS = 500;

const KEEP = ".om-prog, .om-orb";

let active = false;

let busy = false;

let timer = 0;

let fault = null;

const held = new Set();

function looping(animation) {
  return animation.playState === "running"
    && animation.effect?.getTiming?.().iterations === Infinity
    && !animation.effect?.target?.closest?.(KEEP);
}

function hold() {
  for (const animation of held) {
    if (!animation.effect?.target?.isConnected) held.delete(animation);
  }
  for (const animation of document.getAnimations()) {
    if (!looping(animation)) continue;
    animation.pause();
    held.add(animation);
  }
}

function release() {
  for (const animation of held) {
    try { if (animation.playState === "paused") animation.play(); } catch {}
  }
  held.clear();
}

function tick() {
  try {
    hold();
  } catch (error) {
    fault?.(error);
  }
}

function setBusy(next) {
  if (next === busy) return;
  busy = next;
  if (busy) {
    tick();
    timer = setInterval(tick, TICK_MS);
  } else {
    clearInterval(timer);
    timer = 0;
    release();
  }
}

function onStatus(event) {
  const remaining = event?.detail?.exec_info?.queue_remaining;
  if (active && typeof remaining === "number") setBusy(remaining > 0);
}

function onStart() {
  if (active) setBusy(true);
}

export default {
  key: "qolStillWhileRunning",
  name: "Looping animations hold still while a job runs",
  tooltip: "ComfyUI's running spinners and pulses keep the browser redrawing on the GPU for the "
    + "whole of a job, which slows generation when that GPU also drives the display. On, they "
    + "hold still until the queue is empty.",
  issues: ["Comfy-Org/ComfyUI_frontend#14599"],
  defaultValue: true,
  verified: "1.54.8",
  check() {
    if (typeof document.getAnimations !== "function") return "this browser cannot list animations";
    if (typeof api?.addEventListener !== "function") return "ComfyUI's api is not reachable";
    return "";
  },
  on(track, standDown) {
    fault = standDown;
    active = true;
    api.addEventListener("status", onStatus);
    api.addEventListener("execution_start", onStart);
    track(() => {
      active = false;
      api.removeEventListener("status", onStatus);
      api.removeEventListener("execution_start", onStart);
      setBusy(false);
      fault = null;
    });
    api.fetchApi("/prompt")
      .then((answer) => answer.json())
      .then((state) => onStatus({ detail: state }))
      .catch(() => {});
  },
};
