import { app } from "../../../../../scripts/app.js";

function adapterProto() {
  const adapter = app.canvas?.linkRenderer;
  return adapter ? Object.getPrototypeOf(adapter) : null;
}

export default {
  key: "qolLinkColoursPerFrame",
  name: "Links share one colour table per frame",
  tooltip: "ComfyUI copies the colour of every link type, from every installed pack, once for "
    + "each link it draws on every frame. On, the copy is made once per frame.",
  issues: [],
  defaultValue: true,
  verified: "1.57.4",
  check() {
    return typeof adapterProto()?.convertColorMap === "function" ? "" : "ComfyUI's link renderer changed";
  },
  on(track) {
    const proto = adapterProto();
    const original = proto.convertColorMap;
    let source = null;
    let frame = -1;
    let held = null;
    const convertColorMap = function (colors) {
      const now = app.canvas?.frame;
      if (held && colors === source && now === frame) return held;
      held = original.call(this, colors);
      source = colors;
      frame = now;
      return held;
    };
    proto.convertColorMap = convertColorMap;
    track(() => {
      if (proto.convertColorMap === convertColorMap) proto.convertColorMap = original;
      held = null;
      source = null;
    });
  },
};
