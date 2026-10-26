import { el } from "./ui.mjs";

const RED_DOT = "Comfy.ConflictRedDotDismissed";

const ACCELERATORS = { CUDA: /cuda|nvidia/i, ROCm: /rocm|amd/i, Metal: /metal|mps|apple/i,
                       CPU: /\bcpu\b/i };

const CONFLICT_TEXT = {
  comfyui_version: (one) => `Needs ComfyUI ${one.required}, this is ${one.current}`,
  frontend_version: (one) => `Needs frontend ${one.required}, this is ${one.current}`,
  os: (one) => `Made for ${one.required}, this is ${one.current}`,
  accelerator: (one) => (misreadAccelerator(one)
    ? `Made for ${one.required}, which includes ${one.current}. ComfyUI's check misses the match`
    : `Made for ${one.required}, this has ${one.current}`),
  import_failed: (one) => `Failed to import: ${one.current.slice(0, 240)}`,
};

const REVIEWED = new Set(["pending", "banned"]);

const BOUND = /(<=|>=|<|>|===|==|!=|~=|\^|~)?\s*v?(\d+(?:\.\d+)*)/g;

const FLOOR = new Set([">=", ">", "===", "==", "~=", "^", "~"]);

function versionParts(text) {
  const found = String(text || "").match(/\d+(?:\.\d+)*/);
  return found ? found[0].split(".").map(Number) : null;
}

function compareParts(a, b) {
  for (let at = 0; at < Math.max(a.length, b.length); at += 1) {
    const diff = (a[at] || 0) - (b[at] || 0);
    if (diff) return diff;
  }
  return 0;
}

function floorOf(spec) {
  let best = null;
  for (const match of String(spec || "").matchAll(BOUND)) {
    if (!FLOOR.has(match[1] || "==")) continue;
    const parts = match[2].split(".").map(Number);
    if (!best || compareParts(parts, best) > 0) best = parts;
  }
  return best;
}

function newestComfyUI() {
  return versionParts(hostStores()?.get?.("release")?.recentRelease?.version);
}

function unreleasedComfyUI(one) {
  const floor = floorOf(one.required);
  const mine = versionParts(one.current);
  if (!floor || !mine) return false;
  const newest = newestComfyUI();
  if (newest) return compareParts(floor, compareParts(newest, mine) > 0 ? newest : mine) > 0;
  return floor[0] > mine[0];
}

const listeners = new Set();
let watching = false;

function hostStores() {
  return document.querySelector("#vue-app")?.__vue_app__?.config?.globalProperties?.$pinia?._s;
}

function conflictStore() {
  return hostStores()?.get?.("conflictDetection") || null;
}

function hostConflicts() {
  const raw = conflictStore()?.conflictedPackages;
  if (!Array.isArray(raw)) return [];
  const found = [];
  for (const one of raw) {
    if (!one || one.has_conflict === false) continue;
    const listed = Array.isArray(one.conflicts) ? one.conflicts : [];
    const conflicts = listed.map((item) => ({
      type: String(item?.type || ""),
      current: String(item?.current_value ?? ""),
      required: String(item?.required_value ?? ""),
    })).filter((item) => !REVIEWED.has(item.type)
      && !(item.type === "comfyui_version" && unreleasedComfyUI(item)));
    if (listed.length && !conflicts.length) continue;
    found.push({
      id: String(one.package_id || ""),
      name: String(one.package_name || one.package_id || ""),
      conflicts,
    });
  }
  return found;
}

function misreadAccelerator(one) {
  const wanted = ACCELERATORS[one.current];
  return one.type === "accelerator" && !!wanted
    && one.required.split(",").some((name) => wanted.test(name));
}

function conflictText(one) {
  return (CONFLICT_TEXT[one.type] || ((item) => `${item.type}: ${item.current}`))(one);
}

function redDotDismissed() {
  try { return localStorage.getItem(RED_DOT) === "true"; } catch { return true; }
}

function hostPipLit() {
  return !redDotDismissed() && hostConflicts().length > 0;
}

function acknowledgeHostPip() {
  if (redDotDismissed()) return;
  let before = null;
  try {
    before = localStorage.getItem(RED_DOT);
    localStorage.setItem(RED_DOT, "true");
  } catch {
    return;
  }
  window.dispatchEvent(new StorageEvent("storage",
    { key: RED_DOT, oldValue: before, newValue: "true", storageArea: localStorage }));
}

function announce() {
  for (const listener of [...listeners]) {
    try { listener(); } catch {}
  }
}

function watchHostPip(listener) {
  listeners.add(listener);
  if (!watching) {
    watching = true;
    window.addEventListener("storage", (event) => { if (event.key === RED_DOT) announce(); });
    const attach = (tries) => {
      const store = conflictStore();
      if (typeof store?.$subscribe === "function") {
        store.$subscribe(announce, { detached: true });
        announce();
      } else if (tries < 120) {
        setTimeout(() => attach(tries + 1), 1000);
      }
    };
    attach(0);
  }
  return () => listeners.delete(listener);
}

function pipMark() {
  const mark = el("span", "om-pip");
  mark.setAttribute("aria-hidden", "true");
  return mark;
}

export { hostConflicts, hostPipLit, acknowledgeHostPip, watchHostPip, conflictText, misreadAccelerator, pipMark };
