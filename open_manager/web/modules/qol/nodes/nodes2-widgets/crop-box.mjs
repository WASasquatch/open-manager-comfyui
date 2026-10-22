const RATIO_VALUES = [1, 3 / 4, 4 / 3, 16 / 9, 9 / 16, null];

const RATIO_LABELS = ["1:1", "3:4", "4:3", "16:9", "9:16", "Custom"];

const CUSTOM = RATIO_VALUES.length - 1;

const SHADE = "rgba(0, 0, 0, 0.5)";

const TURN = Math.PI * 2;

function bound(value, low, high) {
  return Math.min(Math.max(value, low), high);
}

function ratioIndex(locked) {
  if (locked == null) return CUSTOM;
  for (let index = 0; index < CUSTOM; index += 1) {
    if (RATIO_VALUES[index] === locked) return index;
  }
  return CUSTOM;
}

function shade(ctx, x, y, w, h, holeX, holeY, holeW, holeH) {
  ctx.fillStyle = SHADE;
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.rect(holeX, holeY, holeW, holeH);
  ctx.fill("evenodd");
}

function lockIcon(ctx, cx, cy, size, open, colour) {
  const unit = size / 24;
  const left = cx - size / 2;
  const top = cy - size / 2;
  ctx.strokeStyle = colour;
  ctx.lineWidth = Math.max(1, unit * 2);
  ctx.beginPath();
  ctx.roundRect(left + unit * 3, top + unit * 11, unit * 18, unit * 11, unit * 2);
  ctx.moveTo(left + unit * 7, top + unit * 11);
  ctx.lineTo(left + unit * 7, top + unit * 7);
  ctx.arc(left + unit * 12, top + unit * 7, unit * 5, Math.PI, open ? Math.PI * 1.85 : TURN);
  if (!open) ctx.lineTo(left + unit * 17, top + unit * 11);
  ctx.stroke();
  ctx.lineWidth = 1;
}

export { CUSTOM, RATIO_LABELS, RATIO_VALUES, TURN, bound, lockIcon, ratioIndex, shade };
