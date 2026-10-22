const MIN_SIDE = 16;

const DEFAULT_SIDE = 512;

const PULLS = {
  left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1],
  nw: [-1, -1], ne: [1, -1], sw: [-1, 1], se: [1, 1],
};

const STILL = [0, 0];

function widthOf(value) {
  return value.width || DEFAULT_SIDE;
}

function heightOf(value) {
  return value.height || DEFAULT_SIDE;
}

function ratioOf(value) {
  return widthOf(value) / heightOf(value);
}

function within(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

function shiftCrop(startX, startY, width, height, dx, dy, imageWidth, imageHeight) {
  return {
    x: Math.round(within(startX + dx, 0, imageWidth - width)),
    y: Math.round(within(startY + dy, 0, imageHeight - height)),
  };
}

function stretchAxis(position, size, delta, limit, pull) {
  if (pull < 0) {
    const moved = within(delta, -position, size - MIN_SIDE);
    return [Math.round(position + moved), Math.round(size - moved)];
  }
  return [Math.round(position), Math.round(Math.max(MIN_SIDE, Math.min(limit - position, size + delta)))];
}

function lockedCorner(pullX, pullY, start, dx, dy, ratio, imageWidth, imageHeight) {
  const slope = 1 / ratio;
  const along = (dx * pullX + dy * pullY * slope) / (1 + slope * slope);
  const box = { x: 0, y: 0, w: Math.round(start.width + along), h: 0 };
  const fromWidth = () => {
    box.h = Math.round(box.w / ratio);
  };
  const fromHeight = () => {
    box.w = Math.round(box.h * ratio);
  };
  fromWidth();
  if (box.w < MIN_SIDE) {
    box.w = MIN_SIDE;
    fromWidth();
  }
  if (box.h < MIN_SIDE) {
    box.h = MIN_SIDE;
    fromHeight();
  }
  box.x = pullX < 0 ? start.x + start.width - box.w : start.x;
  box.y = pullY < 0 ? start.y + start.height - box.h : start.y;
  if (box.x < 0) {
    box.w += box.x;
    box.x = 0;
    fromWidth();
  }
  if (box.y < 0) {
    box.h += box.y;
    box.y = 0;
    fromHeight();
  }
  if (box.x + box.w > imageWidth) {
    box.w = imageWidth - box.x;
    fromWidth();
  }
  if (box.y + box.h > imageHeight) {
    box.h = imageHeight - box.y;
    fromHeight();
  }
  return {
    x: Math.round(box.x),
    y: Math.round(box.y),
    width: Math.max(MIN_SIDE, box.w),
    height: Math.max(MIN_SIDE, box.h),
  };
}

function stretchCrop(direction, start, dx, dy, imageWidth, imageHeight, ratio) {
  const [pullX, pullY] = PULLS[direction] || STILL;
  if (ratio != null && pullX && pullY) {
    return lockedCorner(pullX, pullY, start, dx, dy, ratio, imageWidth, imageHeight);
  }
  const fields = {};
  if (pullX) [fields.x, fields.width] = stretchAxis(start.x, start.width, dx, imageWidth, pullX);
  if (pullY) [fields.y, fields.height] = stretchAxis(start.y, start.height, dy, imageHeight, pullY);
  return fields;
}

function fitToRatio(value, ratio, imageHeight) {
  const wanted = Math.round(widthOf(value) / ratio);
  if (!(value.y + wanted > imageHeight)) return { height: Math.max(MIN_SIDE, wanted) };
  const room = imageHeight - value.y;
  return { width: Math.max(MIN_SIDE, Math.round(room * ratio)), height: Math.max(MIN_SIDE, room) };
}

export { fitToRatio, heightOf, ratioOf, shiftCrop, stretchCrop, widthOf };
