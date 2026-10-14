import { api } from "../../../../scripts/api.js";

const CHANNELS = ["started", "progress", "fast_complete", "enrich_complete", "completed", "cancelled",
  "error", "paused", "resumed"].map((name) => `assets.seed.${name}`).concat("open_manager.monitor");

const claimed = new Set();

const handlers = new Map();

if (api?._registered instanceof Set) {
  for (const type of CHANNELS) {
    if (api._registered.has(type)) continue;
    claimed.add(type);
    api.addEventListener(type, (event) => handlers.get(type)?.(event));
  }
}

function onEarly(type, handler) {
  if (!claimed.has(type)) return false;
  handlers.set(type, handler);
  return true;
}

function offEarly(type) {
  handlers.delete(type);
}

export { onEarly, offEarly };
