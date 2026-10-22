import { MARGIN, font, measure, pill, rowText, theme } from "./kit.mjs";

const RATIO = /^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)/;

function roundHalfEven(value) {
  const floor = Math.floor(value);
  const rest = value - floor;
  if (rest !== 0.5) return Math.round(value);
  return floor % 2 === 0 ? floor : floor + 1;
}

function resolve(ratio, megapixels, multiple) {
  const match = typeof ratio === "string" ? RATIO.exec(ratio) : null;
  if (!match || typeof megapixels !== "number" || !Number.isFinite(megapixels) || megapixels <= 0) return null;
  if (typeof multiple !== "number" || !(multiple > 0)) return null;
  const wide = Number(match[1]);
  const tall = Number(match[2]);
  if (!(wide > 0) || !(tall > 0)) return null;
  const scale = Math.sqrt((megapixels * 1024 * 1024) / (wide * tall));
  const width = roundHalfEven((wide * scale) / multiple) * multiple;
  const height = roundHalfEven((tall * scale) / multiple) * multiple;
  if (!width || !height) return null;
  return { size: `${width} × ${height}`, mp: `${((width * height) / (1024 * 1024)).toFixed(2)} MP` };
}

function make(widget) {
  const found = { ratio: null, megapixels: null, multiple: null };
  const memo = { ratio: undefined, megapixels: undefined, multiple: undefined, result: null };

  function sibling(node, key, fallback) {
    const name = widget.options?.[key] || fallback;
    const kept = found[key];
    if (kept && kept.name === name && node.widgets?.[kept.at] === kept.widget) return kept.widget.value;
    const at = node.widgets?.findIndex((one) => one.name === name) ?? -1;
    found[key] = at >= 0 ? { name, at, widget: node.widgets[at] } : null;
    return at >= 0 ? node.widgets[at].value : undefined;
  }

  function result(node) {
    const ratio = sibling(node, "ratio_widget", "aspect_ratio");
    const megapixels = sibling(node, "megapixels_widget", "megapixels");
    const multiple = sibling(node, "multiple_widget", "multiple");
    if (memo.ratio !== ratio || memo.megapixels !== megapixels || memo.multiple !== multiple) {
      memo.ratio = ratio;
      memo.megapixels = megapixels;
      memo.multiple = multiple;
      memo.result = resolve(ratio, megapixels, multiple);
    }
    return memo.result;
  }

  return {
    draw(ctx, node, width, y, height, low) {
      const w = width - MARGIN * 2;
      pill(ctx, MARGIN, y, w, height, low, true);
      if (low) return;
      const colours = theme();
      const answer = result(node);
      if (!answer) {
        rowText(ctx, "-", width / 2, y, height, "center", colours.secondary);
        return;
      }
      ctx.font = font();
      const sizeWidth = measure(ctx, answer.size);
      const mpWidth = measure(ctx, answer.mp);
      const left = width / 2 - (sizeWidth + 8 + mpWidth) / 2;
      rowText(ctx, answer.size, left, y, height, "left", colours.text);
      rowText(ctx, answer.mp, left + sizeWidth + 8, y, height, "left", colours.secondary);
    },
  };
}

export { make };
