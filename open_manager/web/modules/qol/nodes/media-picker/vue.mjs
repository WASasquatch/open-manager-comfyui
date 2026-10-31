import { piniaStores } from "../../shared.mjs";

const TICK = "__omMediaPicker";

const WALK_CAP = 200000;

function vueApp() {
  return document.querySelector("#vue-app")?.__vue_app__ || null;
}

function tickStore() {
  return piniaStores()?.get("setting") || null;
}

function tick() {
  const store = tickStore();
  return store ? store[TICK] : 0;
}

function bump() {
  const store = tickStore();
  if (store) store[TICK] = (store[TICK] || 0) + 1;
}

function readyTick() {
  const store = tickStore();
  if (!store) return false;
  if (!(TICK in store)) store[TICK] = 0;
  return true;
}

function nameOf(instance) {
  return instance?.type?.__name || instance?.type?.name || "";
}

function rawProps(instance) {
  const raw = instance?.props?.__v_raw;
  return raw && typeof raw === "object" ? raw : null;
}

function override(instance, key, view) {
  const raw = rawProps(instance);
  if (!raw || !Object.hasOwn(raw, key)) return null;
  const was = Object.getOwnPropertyDescriptor(raw, key);
  if (!was || was.get || was.set || !was.configurable) return null;
  let given = raw[key];
  Object.defineProperty(raw, key, {
    configurable: true,
    enumerable: was.enumerable,
    get() {
      return view(given);
    },
    set(value) {
      given = value;
    },
  });
  return {
    given: () => given,
    undo() {
      const now = Object.getOwnPropertyDescriptor(raw, key);
      if (!now?.get) return;
      Object.defineProperty(raw, key, {
        configurable: true, enumerable: was.enumerable, writable: true, value: given,
      });
    },
  };
}

function instancesNamed(names) {
  const root = document.querySelector("#vue-app")?._vnode;
  const found = [];
  const stack = root ? [root] : [];
  let steps = 0;
  while (stack.length && steps < WALK_CAP) {
    steps += 1;
    const vnode = stack.pop();
    if (!vnode || typeof vnode !== "object") continue;
    const instance = vnode.component;
    if (instance) {
      if (names.has(nameOf(instance))) found.push(instance);
      if (instance.subTree) stack.push(instance.subTree);
      continue;
    }
    if (vnode.suspense?.activeBranch) stack.push(vnode.suspense.activeBranch);
    const kids = vnode.children;
    if (!Array.isArray(kids)) continue;
    for (const kid of kids) if (kid && typeof kid === "object") stack.push(kid);
  }
  return found;
}

function ancestorNamed(instance, name, limit = 40) {
  let at = instance?.parent;
  for (let step = 0; at && step < limit; step += 1) {
    if (nameOf(at) === name) return at;
    at = at.parent;
  }
  return null;
}

function addMixin(mixin) {
  const vue = vueApp();
  vue.mixin(mixin);
  vue._context.optionsCache = new WeakMap();
  return () => {
    const mixins = vue._context?.mixins;
    const at = Array.isArray(mixins) ? mixins.indexOf(mixin) : -1;
    if (at >= 0) mixins.splice(at, 1);
    vue._context.optionsCache = new WeakMap();
  };
}

function canMix() {
  const vue = vueApp();
  return typeof vue?.mixin === "function" && Array.isArray(vue._context?.mixins);
}

export { tick, bump, readyTick, nameOf, rawProps, override, instancesNamed, ancestorNamed,
         addMixin, canMix };
