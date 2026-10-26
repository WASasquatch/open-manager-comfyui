import { app } from "../../../../scripts/app.js";

const mountHooks = new Map();

const linkReveal = { links: new Set(), drawing: false };

let mountMixin = null;

function vueApp() {
  return document.querySelector("#vue-app")?.__vue_app__ || null;
}

function piniaStores() {
  return vueApp()?.config?.globalProperties?.$pinia?._s || null;
}

function whenSwitchedOff(key, then) {
  setTimeout(() => {
    try {
      if (app.extensionManager?.setting?.get?.(`openManager.${key}`) === false) then();
    } catch {}
  }, 0);
}

function canWatchMounts() {
  const vue = vueApp();
  return typeof vue?.mixin === "function" && Array.isArray(vue._context?.mixins);
}

function watchMounts(component, hook) {
  const vue = vueApp();
  if (!mountMixin) {
    mountMixin = {
      mounted() {
        const hooks = mountHooks.get(this.$?.type?.__name);
        if (!hooks) return;
        for (const one of hooks) {
          try {
            one(this);
          } catch (error) {
            console.warn(`[Open Manager] Quality of Life patch on ${this.$.type.__name}`, error);
          }
        }
      },
    };
    vue.mixin(mountMixin);
    vue._context.optionsCache = new WeakMap();
  }
  const hooks = mountHooks.get(component) || new Set();
  hooks.add(hook);
  mountHooks.set(component, hooks);
  return () => {
    hooks.delete(hook);
    if (!hooks.size) mountHooks.delete(component);
    if (mountHooks.size || !mountMixin) return;
    const mixins = vue._context.mixins;
    const at = mixins.indexOf(mountMixin);
    if (at >= 0) mixins.splice(at, 1);
    vue._context.optionsCache = new WeakMap();
    mountMixin = null;
  };
}

function shownWidget(instance) {
  const props = instance?.$props || {};
  const node = app.canvas?.graph?.getNodeById?.(props.nodeId);
  const widget = node?.widgets?.find((one) => one?.name === props.widget?.name);
  return widget ? { node, widget } : null;
}

function graphNodes() {
  const root = app.rootGraph || app.graph;
  const graphs = root ? [root, ...(root.subgraphs?.values?.() || [])] : [];
  return graphs.flatMap((graph) => graph.nodes || graph._nodes || []);
}

export { piniaStores, whenSwitchedOff, canWatchMounts, watchMounts, shownWidget, graphNodes,
         linkReveal };
