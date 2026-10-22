import { bound } from "./crop-box.mjs";

const DEFAULT_FPS = 20;

const MIN_SIDE = 16;

const HANDLE_WIDTH = 16;

const THUMB = 14;

const ZERO_TRIM = Object.freeze({ start_time: 0, duration: 0 });

const EMPTY_META = Object.freeze({
  duration: 0, totalFrames: 0, fps: DEFAULT_FPS, width: 0, height: 0, size: undefined,
});

const MEGABYTE = 1024 * 1024;

function hasRate(fps) {
  return typeof fps === "number" && Number.isFinite(fps) && fps > 0;
}

function timed(meta) {
  return meta.duration > 0 && meta.totalFrames > 0;
}

function toTime(meta, frame) {
  if (timed(meta)) return meta.duration * (frame / meta.totalFrames);
  const fps = meta.fps || DEFAULT_FPS;
  return hasRate(fps) ? frame / fps : 0;
}

function toFrame(meta, time) {
  if (timed(meta)) return Math.round(meta.totalFrames * (time / meta.duration));
  const fps = meta.fps || DEFAULT_FPS;
  return hasRate(fps) ? Math.round(time * fps) : 0;
}

function millis(seconds) {
  return Math.round(seconds * 1000) / 1000;
}

function number(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function lastFrame(meta) {
  return Math.max(meta.totalFrames - 1, 0);
}

function tidyTrim(trim) {
  if (!trim) return undefined;
  const start = Math.max(number(trim.start_time), 0);
  const length = Math.max(number(trim.duration), 0);
  return start === trim.start_time && length === trim.duration ? trim : { start_time: start, duration: length };
}

function tidyCrop(crop) {
  if (!crop) return undefined;
  const { x, y, width, height } = crop;
  const usable = Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(width) && Number.isFinite(height)
    && x >= 0 && y >= 0 && width > 0 && height > 0;
  const empty = x === 0 && y === 0 && width === 0 && height === 0;
  return usable || empty ? crop : { x: 0, y: 0, width: 0, height: 0 };
}

function tidyValue(value) {
  const trim = tidyTrim(value.trim);
  const crop = tidyCrop(value.crop);
  if (trim === value.trim && crop === value.crop) return value;
  return { ...value, ...(trim && { trim }), ...(crop && { crop }) };
}

function trimOf(value) {
  return tidyTrim(value.trim) ?? ZERO_TRIM;
}

function startFrameOf(value, meta) {
  return bound(toFrame(meta, trimOf(value).start_time), 0, lastFrame(meta));
}

function endFrameOf(value, meta) {
  const { start_time: start, duration } = trimOf(value);
  const last = lastFrame(meta);
  return duration === 0 ? last : bound(toFrame(meta, start + duration) - 1, 0, last);
}

function withStart(value, meta, frame) {
  const { start_time: start, duration } = trimOf(value);
  const toEnd = duration === 0;
  const stop = toEnd ? meta.duration : start + duration;
  const begin = millis(toTime(meta, bound(frame, 0, Math.max(endFrameOf(value, meta) - 1, 0))));
  return { ...value, trim: { start_time: begin, duration: toEnd ? 0 : millis(Math.max(stop - begin, 0)) } };
}

function withEnd(value, meta, frame) {
  const { start_time: start } = trimOf(value);
  const last = lastFrame(meta);
  const end = bound(frame, bound(toFrame(meta, start) + 1, 0, last), last);
  const length = end >= last ? 0 : millis(Math.max(toTime(meta, end + 1) - start, 0));
  return { ...value, trim: { start_time: start, duration: length } };
}

function cropOf(value, meta, out) {
  const crop = tidyCrop(value.crop);
  const sourceWidth = meta.width;
  const sourceHeight = meta.height;
  if (!crop || crop.width <= 0 || crop.height <= 0) {
    out.x = 0;
    out.y = 0;
    out.width = sourceWidth;
    out.height = sourceHeight;
    return out;
  }
  const sized = sourceWidth > 0 && sourceHeight > 0;
  out.x = sized ? Math.min(crop.x, sourceWidth - 1) : crop.x;
  out.y = sized ? Math.min(crop.y, sourceHeight - 1) : crop.y;
  out.width = sized ? Math.min(crop.width, sourceWidth - out.x) : crop.width;
  out.height = sized ? Math.min(crop.height, sourceHeight - out.y) : crop.height;
  return out;
}

function withCrop(value, meta, next) {
  const sourceWidth = meta.width;
  const sourceHeight = meta.height;
  const whole = next.x <= 0 && next.y <= 0 && next.width >= sourceWidth && next.height >= sourceHeight;
  if (whole) return { ...value, crop: { x: 0, y: 0, width: 0, height: 0 } };
  const x = bound(Math.round(next.x), 0, sourceWidth);
  const y = bound(Math.round(next.y), 0, sourceHeight);
  return {
    ...value,
    crop: {
      x, y,
      width: bound(Math.round(next.width), 0, sourceWidth - x),
      height: bound(Math.round(next.height), 0, sourceHeight - y),
    },
  };
}

function pulls(mode) {
  return [
    mode.includes("w") ? -1 : mode.includes("e") ? 1 : 0,
    mode.includes("n") ? -1 : mode.includes("s") ? 1 : 0,
  ];
}

function freeSpan(low, high, delta, limit, pull) {
  if (pull < 0) return [bound(Math.round(low + delta), 0, high - MIN_SIDE), high];
  if (pull > 0) return [low, bound(Math.round(high + delta), low + MIN_SIDE, limit)];
  return [low, high];
}

function resizeFree(mode, start, dx, dy, sourceWidth, sourceHeight) {
  const [pullX, pullY] = pulls(mode);
  const [left, right] = freeSpan(start.x, start.x + start.width, dx, sourceWidth, pullX);
  const [top, bottom] = freeSpan(start.y, start.y + start.height, dy, sourceHeight, pullY);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function roomAlong(pull, position, size, limit) {
  if (pull < 0) return position + size;
  if (pull > 0) return limit - position;
  const middle = position + size / 2;
  return 2 * Math.min(middle, limit - middle);
}

function placeAlong(pull, position, size, length, limit) {
  let at = position;
  if (pull < 0) at = position + size - length;
  else if (!pull) at = Math.round(position + size / 2 - length / 2);
  return bound(at, 0, Math.max(limit - length, 0));
}

function resizeLocked(mode, start, dx, dy, ratio, sourceWidth, sourceHeight) {
  const [pullX, pullY] = pulls(mode);
  const free = resizeFree(mode, start, dx, dy, sourceWidth, sourceHeight);
  const fromHeight = free.height * ratio;
  let width = fromHeight;
  if (pullX && !pullY) width = free.width;
  else if (pullX && pullY && Math.abs(free.width - start.width) >= Math.abs(fromHeight - start.width)) {
    width = free.width;
  }
  const fit = Math.min(1, roomAlong(pullX, start.x, start.width, sourceWidth) / width,
    roomAlong(pullY, start.y, start.height, sourceHeight) / (width / ratio));
  width = Math.max(width * fit, Math.max(MIN_SIDE, MIN_SIDE * ratio));
  const height = Math.round(width / ratio);
  width = Math.round(width);
  return {
    x: placeAlong(pullX, start.x, start.width, width, sourceWidth),
    y: placeAlong(pullY, start.y, start.height, height, sourceHeight),
    width,
    height,
  };
}

function dragCrop(mode, start, dx, dy, ratio, sourceWidth, sourceHeight) {
  if (mode !== "move") {
    return ratio != null
      ? resizeLocked(mode, start, dx, dy, ratio, sourceWidth, sourceHeight)
      : resizeFree(mode, start, dx, dy, sourceWidth, sourceHeight);
  }
  return {
    x: bound(Math.round(start.x + dx), 0, Math.max(sourceWidth - start.width, 0)),
    y: bound(Math.round(start.y + dy), 0, Math.max(sourceHeight - start.height, 0)),
    width: start.width,
    height: start.height,
  };
}

function reshape(crop, ratio, sourceWidth, sourceHeight) {
  const roomX = Math.max(sourceWidth - crop.x, 0);
  const roomY = Math.max(sourceHeight - crop.y, 0);
  const scale = Math.min(1, roomX / crop.width, roomY / (crop.width / ratio));
  const width = Math.max(crop.width * scale, MIN_SIDE, MIN_SIDE * ratio);
  const height = width / ratio;
  return {
    x: Math.round(bound(crop.x, 0, Math.max(sourceWidth - width, 0))),
    y: Math.round(bound(crop.y, 0, Math.max(sourceHeight - height, 0))),
    width: Math.round(Math.min(width, sourceWidth)),
    height: Math.round(Math.min(height, sourceHeight)),
  };
}

function positive(value) {
  return Number.isFinite(value) && value > 0;
}

function canLock(crop, sourceWidth, sourceHeight) {
  return positive(sourceWidth) && positive(sourceHeight) && positive(crop.width) && positive(crop.height);
}

function scrubFrame(pointerX, trackLeft, trackWidth, frameMax) {
  const span = Math.max(trackWidth - 2 * HANDLE_WIDTH, 1);
  return Math.round(bound((pointerX - trackLeft - HANDLE_WIDTH) / span, 0, 1) * frameMax);
}

function handleValue(pointerX, trackLeft, trackWidth, frameMax, handle) {
  const inset = bound(HANDLE_WIDTH, 0, trackWidth / 2);
  const span = Math.max(trackWidth - 2 * inset, 1);
  const grab = handle === "min" ? HANDLE_WIDTH / 2 : -HANDLE_WIDTH / 2;
  return bound((pointerX + grab - trackLeft - inset) / span, 0, 1) * frameMax;
}

function sliderValue(position, trackWidth, max) {
  const span = trackWidth - THUMB;
  const raw = span === 0 || max === 0 ? 0 : (max / span) * position;
  return Math.min(max, Math.max(0, Math.round(raw)));
}

function secondsText(seconds) {
  return seconds ? `${Math.round(seconds * 10) / 10}s` : "0s";
}

function bytesText(bytes) {
  if (bytes == null) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < MEGABYTE) return `${Math.round(bytes / 1024)} KB`;
  return `${Number((bytes / MEGABYTE).toFixed(1))} MB`;
}

function clockText(seconds) {
  const whole = Number.isFinite(seconds) ? Math.max(0, Math.round(seconds)) : 0;
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

function rateText(fps) {
  return fps > 0 ? `${Math.round(fps * 100) / 100} fps` : "-";
}

export {
  DEFAULT_FPS, EMPTY_META, HANDLE_WIDTH, THUMB, bytesText, canLock, clockText, cropOf, dragCrop,
  endFrameOf, handleValue, lastFrame, rateText, reshape, scrubFrame, secondsText, sliderValue,
  startFrameOf, tidyValue, toFrame, toTime, withCrop, withEnd, withStart,
};
