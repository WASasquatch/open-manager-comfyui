import { app } from "../../../../../../scripts/app.js";
import { tick, bump, nameOf, override, instancesNamed, addMixin } from "./vue.mjs";

const SELECT = "WidgetSelect";

const FLAGS = ["image_upload", "animated_image_upload", "video_upload", "audio_upload"];

const UPLOAD = "upload";

const views = new WeakMap();

function mediaSpec(widget) {
  const spec = widget?.spec;
  return !!spec && typeof spec === "object" && FLAGS.some((flag) => spec[flag]);
}

function plainView(widget) {
  if (!mediaSpec(widget)) return widget;
  let view = views.get(widget);
  if (!view) {
    const spec = { ...widget.spec };
    for (const flag of FLAGS) delete spec[flag];
    view = { ...widget, spec };
    views.set(widget, view);
  }
  return view;
}

function nodeOf(instance) {
  const el = instance.subTree?.el;
  const host = el?.nodeType === 1 ? el : el?.parentElement;
  const id = host?.closest?.(".lg-node[data-node-id]")?.getAttribute("data-node-id");
  if (id == null) return null;
  const graph = app.canvas?.graph ?? app.graph;
  return graph?.getNodeById?.(id) ?? graph?.getNodeById?.(Number(id)) ?? null;
}

function startPlain(quit) {
  const held = new Map();
  const shown = new Set();
  let live = true;

  function adopt(instance) {
    if (held.has(instance)) return true;
    const hook = override(instance, "widget", (given) => {
      tick();
      return live ? plainView(given) : given;
    });
    if (!hook) return false;
    held.set(instance, hook);
    return true;
  }

  function reveal(instance) {
    const hook = held.get(instance);
    if (!hook || !mediaSpec(hook.given())) return;
    const button = nodeOf(instance)?.widgets?.find((one) => one?.type === "button" && one.name === UPLOAD);
    const surfaces = button?.visibility?.surfaces;
    if (!surfaces || surfaces.vueNode !== "never") return;
    surfaces.vueNode = "shown";
    shown.add(surfaces);
  }

  function prune() {
    for (const instance of held.keys()) if (instance.isUnmounted) held.delete(instance);
  }

  const unmix = addMixin({
    created() {
      if (!live || nameOf(this.$) !== SELECT || !mediaSpec(this.$.props?.widget)) return;
      prune();
      if (!adopt(this.$)) quit("ComfyUI's combo widget changed");
    },
    mounted() {
      if (!live || nameOf(this.$) !== SELECT) return;
      try {
        reveal(this.$);
      } catch (error) {
        quit(error);
      }
    },
  });

  const existing = instancesNamed(new Set([SELECT]))
    .filter((instance) => !instance.isUnmounted && mediaSpec(instance.props?.widget));
  for (const instance of existing) {
    if (!adopt(instance)) {
      quit("ComfyUI's combo widget changed");
      break;
    }
    instance.props.widget = held.get(instance).given();
  }
  bump();
  setTimeout(() => {
    if (!live) return;
    for (const instance of existing) {
      if (instance.isMounted && !instance.isUnmounted) reveal(instance);
    }
  }, 0);

  return () => {
    live = false;
    unmix();
    for (const hook of held.values()) hook.undo();
    held.clear();
    for (const surfaces of shown) if (surfaces.vueNode === "shown") surfaces.vueNode = "never";
    shown.clear();
    bump();
  };
}

export { startPlain };
