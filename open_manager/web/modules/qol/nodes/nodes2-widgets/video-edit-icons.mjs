const QUARTER = Math.PI / 4;

const WAVE = Math.atan2(3, 4);

const SPIN = Math.PI * 1.6;

function pen(ctx, size, colour) {
  const unit = size / 24;
  ctx.strokeStyle = colour;
  ctx.lineWidth = Math.max(1, unit * 2);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  return unit;
}

function finish(ctx) {
  ctx.stroke();
  ctx.lineWidth = 1;
}

function playIcon(ctx, cx, cy, size, colour) {
  const unit = pen(ctx, size, colour);
  const left = cx - size / 2;
  const top = cy - size / 2;
  ctx.moveTo(left + unit * 6, top + unit * 3);
  ctx.lineTo(left + unit * 20, top + unit * 12);
  ctx.lineTo(left + unit * 6, top + unit * 21);
  ctx.closePath();
  finish(ctx);
}

function pauseIcon(ctx, cx, cy, size, colour) {
  const unit = pen(ctx, size, colour);
  const left = cx - size / 2;
  const top = cy - size / 2;
  ctx.roundRect(left + unit * 14, top + unit * 4, unit * 4, unit * 16, unit);
  ctx.roundRect(left + unit * 6, top + unit * 4, unit * 4, unit * 16, unit);
  finish(ctx);
}

function maximizeIcon(ctx, cx, cy, size, colour) {
  const unit = pen(ctx, size, colour);
  const left = cx - size / 2;
  const top = cy - size / 2;
  ctx.moveTo(left + unit * 8, top + unit * 3);
  ctx.lineTo(left + unit * 3, top + unit * 3);
  ctx.lineTo(left + unit * 3, top + unit * 8);
  ctx.moveTo(left + unit * 21, top + unit * 8);
  ctx.lineTo(left + unit * 21, top + unit * 3);
  ctx.lineTo(left + unit * 16, top + unit * 3);
  ctx.moveTo(left + unit * 3, top + unit * 16);
  ctx.lineTo(left + unit * 3, top + unit * 21);
  ctx.lineTo(left + unit * 8, top + unit * 21);
  ctx.moveTo(left + unit * 16, top + unit * 21);
  ctx.lineTo(left + unit * 21, top + unit * 21);
  ctx.lineTo(left + unit * 21, top + unit * 16);
  finish(ctx);
}

function volumeIcon(ctx, cx, cy, size, colour, muted) {
  const unit = pen(ctx, size, colour);
  const left = cx - size / 2;
  const top = cy - size / 2;
  ctx.moveTo(left + unit * 11, top + unit * 5);
  ctx.lineTo(left + unit * 6, top + unit * 9);
  ctx.lineTo(left + unit * 2, top + unit * 9);
  ctx.lineTo(left + unit * 2, top + unit * 15);
  ctx.lineTo(left + unit * 6, top + unit * 15);
  ctx.lineTo(left + unit * 11, top + unit * 19);
  ctx.closePath();
  if (muted) {
    ctx.moveTo(left + unit * 22, top + unit * 9);
    ctx.lineTo(left + unit * 16, top + unit * 15);
    ctx.moveTo(left + unit * 16, top + unit * 9);
    ctx.lineTo(left + unit * 22, top + unit * 15);
  } else {
    ctx.moveTo(left + unit * 16, top + unit * 9);
    ctx.arc(left + unit * 12, top + unit * 12, unit * 5, -WAVE, WAVE);
    ctx.moveTo(left + unit * (13 + 9 * Math.SQRT1_2), top + unit * (12 - 9 * Math.SQRT1_2));
    ctx.arc(left + unit * 13, top + unit * 12, unit * 9, -QUARTER, QUARTER);
  }
  finish(ctx);
}

function filmIcon(ctx, cx, cy, size, colour) {
  const unit = pen(ctx, size, colour);
  const left = cx - size / 2;
  const top = cy - size / 2;
  ctx.roundRect(left + unit * 3, top + unit * 3, unit * 18, unit * 18, unit * 2);
  ctx.moveTo(left + unit * 7, top + unit * 3);
  ctx.lineTo(left + unit * 7, top + unit * 21);
  ctx.moveTo(left + unit * 17, top + unit * 3);
  ctx.lineTo(left + unit * 17, top + unit * 21);
  ctx.moveTo(left + unit * 3, top + unit * 12);
  ctx.lineTo(left + unit * 21, top + unit * 12);
  ctx.moveTo(left + unit * 3, top + unit * 7.5);
  ctx.lineTo(left + unit * 7, top + unit * 7.5);
  ctx.moveTo(left + unit * 3, top + unit * 16.5);
  ctx.lineTo(left + unit * 7, top + unit * 16.5);
  ctx.moveTo(left + unit * 17, top + unit * 7.5);
  ctx.lineTo(left + unit * 21, top + unit * 7.5);
  ctx.moveTo(left + unit * 17, top + unit * 16.5);
  ctx.lineTo(left + unit * 21, top + unit * 16.5);
  finish(ctx);
}

function videoOffIcon(ctx, cx, cy, size, colour) {
  const unit = pen(ctx, size, colour);
  const left = cx - size / 2;
  const top = cy - size / 2;
  ctx.roundRect(left + unit * 2, top + unit * 6, unit * 14, unit * 12, unit * 2);
  ctx.moveTo(left + unit * 16, top + unit * 10);
  ctx.lineTo(left + unit * 22, top + unit * 7);
  ctx.lineTo(left + unit * 22, top + unit * 17);
  ctx.lineTo(left + unit * 16, top + unit * 14);
  ctx.moveTo(left + unit * 2, top + unit * 2);
  ctx.lineTo(left + unit * 22, top + unit * 22);
  finish(ctx);
}

function loaderIcon(ctx, cx, cy, size, colour) {
  const unit = pen(ctx, size, colour);
  ctx.moveTo(cx + unit * 9, cy);
  ctx.arc(cx, cy, unit * 9, 0, SPIN);
  finish(ctx);
}

export { filmIcon, loaderIcon, maximizeIcon, pauseIcon, playIcon, videoOffIcon, volumeIcon };
