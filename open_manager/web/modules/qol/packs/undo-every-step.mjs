import { app } from "../../../../../scripts/app.js";

const LOADER = "loadGraphDataNow";

const CHANGED = "ComfyUI's graph loader has changed";

export default {
  key: "qolUndoEveryStep",
  name: "Undo steps back through every change",
  tooltip: "Use Everywhere, and any pack that wraps ComfyUI's graph loader without passing on "
    + "what it returns, makes ComfyUI take each undo as failed, so Ctrl+Z stops after one step. "
    + "On, ComfyUI gets that result back.",
  issues: [],
  defaultValue: true,
  verified: "1.58.5",
  check() {
    const proto = Object.getPrototypeOf(app);
    return typeof proto?.[LOADER] === "function" && typeof app.loadGraphData === "function"
      ? "" : CHANGED;
  },
  on(track) {
    const proto = Object.getPrototypeOf(app);
    const loadNow = proto[LOADER];
    const runs = new WeakMap();
    const layers = new Map();
    let count = 0;
    let last = null;
    let live = true;

    const runSince = (graphData, from) => {
      const run = (graphData && typeof graphData === "object" && runs.get(graphData))
        || (count === from + 1 ? last : null);
      return run && run.n > from ? run : null;
    };

    const lift = () => {
      const below = app.loadGraphData;
      if (!live || typeof below !== "function" || layers.has(below)) return;
      const keeper = async function loadGraphData(graphData, ...rest) {
        const from = count;
        const result = await below.call(this, graphData, ...rest);
        if (result !== undefined || !live) return result;
        return runSince(graphData, from)?.result;
      };
      layers.set(keeper, [below, Object.hasOwn(app, "loadGraphData")]);
      app.loadGraphData = keeper;
    };

    const loadGraphDataNow = async function loadGraphDataNow(graphData, ...rest) {
      const run = { n: ++count, result: undefined };
      last = run;
      if (graphData && typeof graphData === "object") runs.set(graphData, run);
      run.result = await loadNow.call(this, graphData, ...rest);
      lift();
      return run.result;
    };

    proto[LOADER] = loadGraphDataNow;
    lift();
    track(() => {
      live = false;
      if (proto[LOADER] === loadGraphDataNow) proto[LOADER] = loadNow;
      for (let top = app.loadGraphData; layers.has(top); top = app.loadGraphData) {
        const [below, own] = layers.get(top);
        if (own) app.loadGraphData = below;
        else delete app.loadGraphData;
      }
      layers.clear();
      last = null;
    });
  },
};
