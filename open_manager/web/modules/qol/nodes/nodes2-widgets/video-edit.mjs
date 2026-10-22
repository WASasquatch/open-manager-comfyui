import {
  GAP, MARGIN, button, comboPointer, commit, contain, contains, drawCombo, drawNumber, fitText, font, gesture,
  local, numberPointer, redraw, rowHeight, screenScale, sized, skeleton, theme,
} from "./kit.mjs";
import { CUSTOM, RATIO_LABELS, RATIO_VALUES, TURN, bound, lockIcon, ratioIndex, shade } from "./crop-box.mjs";
import {
  filmIcon, loaderIcon, maximizeIcon, pauseIcon, playIcon, videoOffIcon, volumeIcon,
} from "./video-edit-icons.mjs";
import { createMedia, forget, sourceMemo, videoUrl } from "./video-edit-media.mjs";
import {
  HANDLE_WIDTH, THUMB, canLock, tidyValue, cropOf, dragCrop, endFrameOf, reshape, secondsText,
  bytesText, rateText, clockText, handleValue, lastFrame, scrubFrame, sliderValue, startFrameOf,
  toFrame, toTime, withCrop, withEnd, withStart,
} from "./video-edit-model.mjs";

const PANEL_GAP = 8;

const GRID_GAP = 4;

const CONTROLS = 32;

const BUTTON = 24;

const ICON = 16;

const CONTROL_PAD = 4;

const CONTROL_GAP = 8;

const FILM = 64;

const STRIP_INSET = 8;

const STRIP = 48;

const BAR = 8;

const GRIP = 16;

const PLAYHEAD_HIT = 12;

const PREVIEW_MIN = 96;

const EMPTY_MIN = 96;

const RADIUS = 8;

const CROP_PAD = 6;

const CORNER = 10;

const CORNER_RADIUS = 4;

const EDGE = 8;

const BORDER = 2;

const META_GAP = 8;

const META_PAD = 8;

const META_ROW = 16;

const META_ROW_GAP = 2;

const META_LABELS = ["Dimensions", "Duration", "Frame Rate", "Number of Frames", "File Size"];

const META_BLOCK = META_GAP + 1 + META_PAD * 2 + META_LABELS.length * META_ROW
  + (META_LABELS.length - 1) * META_ROW_GAP;

const CROP_LABELS = ["X", "Y", "Width", "Height"];

const CROP_KEYS = ["x", "y", "width", "height"];

const MIN_WIDTH = 205;

const TILE_ASPECT = 16 / 9;

const TIP_PAD = 10;

const TIP_HEIGHT = 24;

const TIP_ARROW = 5;

const TIP_GAP = 4;

const LINE = 16;

const MESSAGE_ICON = 24;

const MESSAGE_GAP = 4;

const RETRY_PAD = 12;

const SWEEP_MS = 2000;

const DIMMED = 0.5;

const TRACK_ALPHA = 0.2;

const SELECTION = "#ffd500";

const PLAYHEAD = "#f0513b";

const WHITE = "#ffffff";

const CORNER_FILL = "rgba(255, 255, 255, 0.8)";

const DIM = "rgba(0, 0, 0, 0.5)";

const EMPTY_TEXT = "Select or connect a video to preview and edit";

const LOADING_TEXT = "Loading video preview";

const FAILED_TEXT = "Failed to load video";

const UNAVAILABLE_TEXT = "Failed to render video preview";

const RETRY_TEXT = "Retry";

const DASH = [4, 4];

const SOLID = [];

const LEFT_RADII = [RADIUS, 0, 0, RADIUS];

const RIGHT_RADII = [0, RADIUS, RADIUS, 0];

const EMPTY_VALUE = Object.freeze({});

const RESOLVED = Promise.resolve();

const ON = Object.freeze({ active: true });

const OFF = Object.freeze({ active: false });

const ON_DISABLED = Object.freeze({ active: true, disabled: true });

const OFF_DISABLED = Object.freeze({ active: false, disabled: true });

const ENABLED = Object.freeze({ disabled: false });

const DISABLED = Object.freeze({ disabled: true });

const editors = new Set();

const faces = { size: 0, family: "", value: "", bold: "" };

let sweeper = 0;

function typeface() {
  const graph = window.LiteGraph;
  if (faces.size !== graph.NODE_SUBTEXT_SIZE || faces.family !== graph.NODE_FONT) {
    faces.size = graph.NODE_SUBTEXT_SIZE;
    faces.family = graph.NODE_FONT;
    faces.value = font();
    faces.bold = font(undefined, "600");
  }
  return faces.value;
}

function sweep() {
  for (const editor of [...editors]) {
    if (!editor.node?.graph) editor.drop();
  }
  if (!editors.size && sweeper) {
    clearInterval(sweeper);
    sweeper = 0;
  }
}

function enlist(editor) {
  editors.add(editor);
  if (!sweeper) sweeper = setInterval(sweep, SWEEP_MS);
}

function release() {
  for (const editor of [...editors]) editor.drop();
  editors.clear();
  if (sweeper) clearInterval(sweeper);
  sweeper = 0;
}

function gridHeight(trim, crop, row) {
  let total = META_BLOCK;
  let items = 1;
  if (trim) {
    total += FILM + row * 2;
    items += 3;
  }
  if (crop) {
    total += row * 5;
    items += 5;
  }
  return total + GRID_GAP * (items - 1);
}

function place(rect, x, y, w, h) {
  rect[0] = x;
  rect[1] = y;
  rect[2] = w;
  rect[3] = h;
  return rect;
}

function inside(rect, px, py) {
  return contains(rect[0], rect[1], rect[2], rect[3], px, py);
}

function rect() {
  return [0, 0, 0, 0];
}

function slot() {
  return { text: "", width: -1, face: "", value: "" };
}

function fitInto(entry, ctx, text, width, face) {
  const room = Math.floor(width);
  if (entry.text !== text || entry.width !== room || entry.face !== face) {
    entry.text = text;
    entry.width = room;
    entry.face = face;
    entry.value = room > 0 ? fitText(ctx, text, room) : "";
  }
  return entry.value;
}

function wrapInto(entry, ctx, text, width, face) {
  const room = Math.floor(width);
  if (entry.text === text && entry.width === room && entry.face === face) return entry.lines;
  entry.text = text;
  entry.width = room;
  entry.face = face;
  entry.lines = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > room) {
      entry.lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) entry.lines.push(line);
  return entry.lines;
}

function say(ctx, text, x, y, colour, align) {
  ctx.fillStyle = colour;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y);
}

function sameCrop(a, b) {
  return !!a && !!b && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

function make(widget) {
  const memo = sourceMemo();
  const frames = {
    value: undefined, meta: undefined, version: 0, start: 0, end: 0, frameMax: 0,
    crop: { x: 0, y: 0, width: 0, height: 0 },
  };
  const view = {
    node: null, playhead: 0, playing: false, frame: 0, seenStart: undefined, seenEnd: undefined,
    checked: undefined, locked: null, drag: null, dragEvent: null, pointer: null, kind: "empty",
    loading: false, cropShown: false, retryShown: false, canLock: false,
  };
  const rects = {
    preview: rect(), shown: rect(), box: rect(), retry: rect(), play: rect(), fullscreen: rect(),
    mute: rect(), slider: rect(), film: rect(), start: rect(), end: rect(), combo: rect(), lock: rect(),
    crop: [rect(), rect(), rect(), rect()],
  };
  const texts = {
    version: -1, trim: null, intrinsicWidth: -1, intrinsicHeight: -1, wide: -1, face: "",
    start: "", end: "", crop: ["", "", "", ""], values: ["", "", "", "", ""], shown: ["", "", "", "", ""],
    labels: ["", "", "", "", ""], playhead: -1, meta: null, timeFace: "", timecode: "", timeWidth: 0,
    retryFace: "", retryWidth: 0,
  };
  const fits = { loading: slot(), failed: slot() };
  const wrapped = { text: "", width: -1, face: "", lines: [] };
  const states = {
    start: { disabled: false, canDecrease: true, canIncrease: true },
    end: { disabled: false, canDecrease: true, canIncrease: true },
    crop: CROP_KEYS.map(() => ({ disabled: false, canDecrease: true, canIncrease: true })),
  };
  const wanted = { minHeight: 0, minWidth: MIN_WIDTH, maxHeight: undefined };
  const owner = { node: null, drop };
  const media = createMedia({ ready, reset, ended, entered, left, attached: () => enlist(owner) });

  function trimOn() {
    const list = widget.options?.features;
    return list ? list.includes("trim") : true;
  }

  function cropOn() {
    const list = widget.options?.features;
    return list ? list.includes("crop") : true;
  }

  function current() {
    const value = widget.value;
    return value && typeof value === "object" ? value : EMPTY_VALUE;
  }

  function busy() {
    return media.status !== "failed" && (media.loading || media.status === "retrying");
  }

  function errorKind() {
    if (media.error === "canvas-unavailable") return media.error;
    return media.status === "failed" ? "load-failed" : null;
  }

  function kindOf() {
    if (!media.url) return "empty";
    return media.status === "failed" ? "failed" : "full";
  }

  function read() {
    const value = current();
    const meta = media.meta;
    if (frames.value === value && frames.meta === meta) return frames;
    frames.value = value;
    frames.meta = meta;
    frames.version += 1;
    frames.frameMax = lastFrame(meta);
    frames.start = startFrameOf(value, meta);
    frames.end = endFrameOf(value, meta);
    cropOf(value, meta, frames.crop);
    return frames;
  }

  function seekFrame(frame) {
    if (!media.video || !Number.isFinite(frame)) return RESOLVED;
    const meta = media.meta;
    const target = bound(frame, 0, lastFrame(meta));
    const time = toTime(meta, target);
    if (!Number.isFinite(time)) return RESOLVED;
    view.playhead = target;
    return media.seek(time);
  }

  function collide(state) {
    const previous = view.playhead;
    if (previous < state.start) view.playhead = state.start;
    else if (previous > state.end) view.playhead = state.end;
    if (view.playhead !== previous) seekFrame(view.playhead);
  }

  function sync() {
    const state = read();
    if (state.start !== view.seenStart || state.end !== view.seenEnd) {
      const first = view.seenStart === undefined;
      view.seenStart = state.start;
      view.seenEnd = state.end;
      if (!first) collide(state);
    }
    return state;
  }

  function startTick() {
    if (!view.frame) view.frame = requestAnimationFrame(tick);
  }

  function stopTick() {
    if (view.frame) cancelAnimationFrame(view.frame);
    view.frame = 0;
  }

  function tick() {
    view.frame = 0;
    if (!view.playing) return;
    if (!view.node?.graph) {
      drop();
      return;
    }
    const video = media.video;
    if (video && !media.seeking && !media.fullscreen) {
      const state = read();
      const frame = toFrame(media.meta, video.currentTime);
      view.playhead = bound(frame, state.start, state.end);
      if (state.frameMax > 0 && frame >= state.end) {
        setPlaying(false);
        seekFrame(state.end);
        return;
      }
    }
    redraw();
    view.frame = requestAnimationFrame(tick);
  }

  async function begin(video) {
    const state = read();
    const from = view.playhead >= state.end ? state.start : bound(view.playhead, state.start, state.end);
    await seekFrame(from);
    if (!view.playing || media.video !== video) return;
    try {
      await video.play();
    } catch {
      if (view.playing && media.video === video) {
        view.playing = false;
        media.playing = false;
        redraw();
      }
      return;
    }
    if (!view.playing || media.video !== video) {
      video.pause();
      return;
    }
    startTick();
  }

  function setPlaying(next) {
    if (view.playing === next) return;
    view.playing = next;
    media.playing = next;
    redraw();
    const video = media.video;
    if (!video) return;
    if (next) {
      begin(video);
      return;
    }
    stopTick();
    video.pause();
  }

  function scrub(frame) {
    setPlaying(false);
    seekFrame(frame);
    redraw();
  }

  function ready() {
    sync();
    seekFrame(view.playhead);
  }

  function reset() {
    const state = read();
    view.playhead = trimOn() ? state.start : 0;
    view.seenStart = state.start;
    view.seenEnd = state.end;
    setPlaying(false);
  }

  function ended() {
    setPlaying(false);
  }

  function entered() {
    stopTick();
    media.video?.pause();
  }

  function left(time, running) {
    if (running && !view.playing) {
      setPlaying(true);
      return;
    }
    if (!running) setPlaying(false);
    media.seek(time).then(() => {
      const video = media.video;
      if (!running || !view.playing || !video) return;
      video.play().then(startTick, () => setPlaying(false));
    });
  }

  function drop() {
    stopTick();
    view.playing = false;
    view.playhead = 0;
    view.seenStart = undefined;
    view.seenEnd = undefined;
    view.checked = undefined;
    forget(memo);
    media.release();
    editors.delete(owner);
  }

  function inspect(node) {
    const value = widget.value;
    if (value === view.checked) return;
    view.checked = value;
    if (!value || typeof value !== "object") return;
    const next = tidyValue(value);
    if (next === value || tidyValue(next) !== next) return;
    queueMicrotask(() => {
      if (widget.value === value) commit(node, widget, next);
    });
  }

  function attach(node) {
    view.node = node;
    owner.node = node;
    const url = videoUrl(node, memo);
    if (url !== media.url) media.bind(url);
    else if (memo.again) media.retry();
    inspect(node);
  }

  function save(next) {
    commit(view.node, widget, next);
  }

  const startField = {
    title: "Value",
    step: 1,
    round: true,
    min: 0,
    get value() {
      return read().start;
    },
    get max() {
      return Math.max(read().end - 1, 0);
    },
    set(next) {
      save(withStart(current(), media.meta, next));
    },
  };

  const endField = {
    title: "Value",
    step: 1,
    round: true,
    get value() {
      return read().end;
    },
    get min() {
      return Math.min(read().start + 1, Math.max(media.meta.totalFrames, 1) - 1);
    },
    get max() {
      return Math.max(Math.max(media.meta.totalFrames, 1) - 1, 0);
    },
    set(next) {
      save(withEnd(current(), media.meta, next));
    },
  };

  const cropFields = CROP_KEYS.map((key, index) => ({
    title: "Value",
    step: 1,
    round: true,
    min: index < 2 ? 0 : 1,
    max: Number.MAX_VALUE,
    get value() {
      return read().crop[key];
    },
    set(next) {
      const crop = read().crop;
      const bounds = { x: crop.x, y: crop.y, width: crop.width, height: crop.height };
      bounds[key] = next;
      save(withCrop(current(), media.meta, bounds));
    },
  }));

  const choice = {
    items: RATIO_LABELS,
    get index() {
      return ratioIndex(view.locked);
    },
    choose(index) {
      if (index === ratioIndex(view.locked)) return;
      if (index === CUSTOM) {
        view.locked = null;
        redraw();
        return;
      }
      const crop = read().crop;
      const meta = media.meta;
      if (!canLock(crop, meta.width, meta.height)) return;
      view.locked = RATIO_VALUES[index];
      save(withCrop(current(), meta, reshape(crop, view.locked, meta.width, meta.height)));
    },
  };

  function toggleLock() {
    if (view.locked != null) {
      view.locked = null;
    } else {
      const crop = read().crop;
      const meta = media.meta;
      if (!canLock(crop, meta.width, meta.height)) return;
      view.locked = crop.width / crop.height;
    }
    redraw();
  }

  function refresh(ctx, state, trim, width, face) {
    const meta = media.meta;
    if (texts.version !== state.version || texts.trim !== trim || texts.intrinsicWidth !== media.intrinsicWidth
      || texts.intrinsicHeight !== media.intrinsicHeight) {
      texts.version = state.version;
      texts.trim = trim;
      texts.intrinsicWidth = media.intrinsicWidth;
      texts.intrinsicHeight = media.intrinsicHeight;
      texts.start = String(state.start);
      texts.end = String(state.end);
      for (let index = 0; index < CROP_KEYS.length; index += 1) {
        texts.crop[index] = String(state.crop[CROP_KEYS[index]]);
      }
      const shownWidth = meta.width || media.intrinsicWidth;
      const shownHeight = meta.height || media.intrinsicHeight;
      const total = Math.max(meta.totalFrames, 1);
      const values = texts.values;
      values[0] = shownWidth && shownHeight ? `${shownWidth} × ${shownHeight}` : "-";
      if (trim) {
        const selected = Math.max(toTime(meta, state.end + 1) - toTime(meta, state.start), 0);
        values[1] = `${secondsText(selected)} / ${secondsText(meta.duration)}`;
        values[3] = `${Math.max(state.end - state.start + 1, 0)} / ${total}`;
      } else {
        values[1] = secondsText(meta.duration);
        values[3] = String(total);
      }
      values[2] = rateText(meta.fps);
      values[4] = bytesText(meta.size);
      texts.wide = -1;
    }
    const wide = Math.floor(width);
    if (texts.wide !== wide || texts.face !== face) {
      texts.wide = wide;
      texts.face = face;
      for (let index = 0; index < META_LABELS.length; index += 1) {
        const value = fitText(ctx, texts.values[index], wide);
        texts.shown[index] = value;
        texts.labels[index] = fitText(ctx, META_LABELS[index], Math.max(0, wide - ctx.measureText(value).width - 8));
      }
    }
    if (texts.playhead !== view.playhead || texts.meta !== meta || texts.timeFace !== face) {
      texts.playhead = view.playhead;
      texts.meta = meta;
      texts.timeFace = face;
      texts.timecode = `${clockText(toTime(meta, view.playhead))} / ${clockText(meta.duration)}`;
      texts.timeWidth = ctx.measureText(texts.timecode).width;
    }
  }

  function drawEmpty(ctx, x, y, w, h, colours, face, low) {
    place(rects.preview, x, y, w, h);
    ctx.fillStyle = colours.bg;
    ctx.beginPath();
    if (low) ctx.rect(x, y, w, h);
    else ctx.roundRect(x, y, w, h, RADIUS);
    ctx.fill();
    ctx.strokeStyle = colours.outline;
    if (low) {
      ctx.strokeRect(x, y, w, h);
      return;
    }
    ctx.setLineDash(DASH);
    ctx.beginPath();
    ctx.roundRect(x + 0.5, y + 0.5, Math.max(0, w - 1), Math.max(0, h - 1), RADIUS);
    ctx.stroke();
    ctx.setLineDash(SOLID);
    const lines = wrapInto(wrapped, ctx, EMPTY_TEXT, w - 32, face);
    const middle = x + w / 2;
    let top = y + (h - MESSAGE_ICON - MESSAGE_GAP - lines.length * LINE) / 2;
    filmIcon(ctx, middle, top + MESSAGE_ICON / 2, MESSAGE_ICON, colours.secondary);
    top += MESSAGE_ICON + MESSAGE_GAP;
    for (let index = 0; index < lines.length; index += 1) {
      say(ctx, lines[index], middle, top + LINE / 2, colours.secondary, "center");
      top += LINE;
    }
  }

  function drawBox(ctx, crop, meta, low) {
    const preview = rects.preview;
    const shown = rects.shown;
    const box = rects.box;
    const scaleX = shown[2] / meta.width;
    const scaleY = shown[3] / meta.height;
    box[0] = shown[0] + crop.x * scaleX;
    box[1] = shown[1] + crop.y * scaleY;
    box[2] = crop.width * scaleX;
    box[3] = crop.height * scaleY;
    ctx.save();
    ctx.beginPath();
    ctx.rect(preview[0], preview[1], preview[2], preview[3]);
    ctx.clip();
    shade(ctx, preview[0], preview[1], preview[2], preview[3], box[0] - BORDER, box[1] - BORDER,
      box[2] + BORDER * 2, box[3] + BORDER * 2);
    ctx.strokeStyle = WHITE;
    ctx.lineWidth = BORDER;
    ctx.strokeRect(box[0] - BORDER / 2, box[1] - BORDER / 2, box[2] + BORDER, box[3] + BORDER);
    if (!low) {
      const half = CORNER / 2;
      ctx.fillStyle = CORNER_FILL;
      ctx.beginPath();
      ctx.roundRect(box[0] - half, box[1] - half, CORNER, CORNER, CORNER_RADIUS);
      ctx.roundRect(box[0] + box[2] - half, box[1] - half, CORNER, CORNER, CORNER_RADIUS);
      ctx.roundRect(box[0] + box[2] - half, box[1] + box[3] - half, CORNER, CORNER, CORNER_RADIUS);
      ctx.roundRect(box[0] - half, box[1] + box[3] - half, CORNER, CORNER, CORNER_RADIUS);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPreview(ctx, x, y, w, h, state, crop, colours, face, low) {
    place(rects.preview, x, y, w, h);
    ctx.fillStyle = colours.bg;
    ctx.beginPath();
    if (low) ctx.rect(x, y, w, h);
    else ctx.roundRect(x, y, w, h, RADIUS);
    ctx.fill();
    const pad = crop ? CROP_PAD : 0;
    const innerW = Math.max(0, w - pad * 2);
    const innerH = Math.max(0, h - pad * 2);
    const meta = media.meta;
    const aspectW = meta.width || media.intrinsicWidth;
    const aspectH = meta.height || media.intrinsicHeight;
    const shown = aspectW && aspectH
      ? contain(aspectW, aspectH, x + pad, y + pad, innerW, innerH, rects.shown)
      : contain(16, 9, x + pad, y + pad, innerW, innerH, rects.shown);
    const loading = busy();
    const error = errorKind();
    view.loading = loading;
    view.retryShown = !loading && !!error;
    view.cropShown = crop && !loading && !error && meta.width > 0 && meta.height > 0;
    if (!loading && !error) {
      const video = media.video;
      if (view.playing && !media.fullscreen && video && video.readyState >= 2) {
        ctx.drawImage(video, shown[0], shown[1], shown[2], shown[3]);
      } else if (media.stillReady && media.still) {
        const still = sized(media.still, media.stillVersion, shown[2] * screenScale());
        ctx.drawImage(still, shown[0], shown[1], shown[2], shown[3]);
      }
    }
    if (view.cropShown) drawBox(ctx, state.crop, meta, low);
    if (low) return;
    const middle = x + w / 2;
    if (loading) {
      const top = y + (h - MESSAGE_ICON - LINE) / 2;
      loaderIcon(ctx, middle, top + MESSAGE_ICON / 2, MESSAGE_ICON, colours.secondary);
      say(ctx, fitInto(fits.loading, ctx, LOADING_TEXT, w - 16, face), middle, top + MESSAGE_ICON + LINE / 2,
        colours.secondary, "center");
    } else if (error) {
      const row = rowHeight();
      let top = y + (h - MESSAGE_ICON - MESSAGE_GAP - LINE - PANEL_GAP - row) / 2;
      videoOffIcon(ctx, middle, top + MESSAGE_ICON / 2, MESSAGE_ICON, colours.secondary);
      top += MESSAGE_ICON + MESSAGE_GAP;
      say(ctx, fitInto(fits.failed, ctx, error === "canvas-unavailable" ? UNAVAILABLE_TEXT : FAILED_TEXT, w - 16,
        face), middle, top + LINE / 2, colours.secondary, "center");
      top += LINE + PANEL_GAP;
      if (texts.retryFace !== face) {
        texts.retryFace = face;
        texts.retryWidth = ctx.measureText(RETRY_TEXT).width + RETRY_PAD * 2;
      }
      const retry = place(rects.retry, middle - texts.retryWidth / 2, top, texts.retryWidth, row);
      button(ctx, retry[0], retry[1], retry[2], retry[3], RETRY_TEXT, low);
    }
  }

  function drawControls(ctx, x, y, w, state, colours, face, low) {
    const middle = y + CONTROLS / 2;
    const playX = x + CONTROL_PAD;
    const muteX = x + w - CONTROL_PAD - BUTTON;
    const fullX = muteX - CONTROL_GAP - BUTTON;
    const timeX = playX + BUTTON + CONTROL_GAP;
    const sliderX = timeX + texts.timeWidth + CONTROL_GAP;
    const sliderW = Math.max(0, fullX - CONTROL_GAP - sliderX);
    place(rects.play, playX, middle - BUTTON / 2, BUTTON, BUTTON);
    place(rects.fullscreen, fullX, middle - BUTTON / 2, BUTTON, BUTTON);
    place(rects.mute, muteX, middle - BUTTON / 2, BUTTON, BUTTON);
    place(rects.slider, sliderX, y, sliderW, CONTROLS);
    const alpha = ctx.globalAlpha;
    const base = view.loading || state.frameMax <= 0 ? alpha * DIMMED : alpha;
    const fraction = bound(view.playhead / Math.max(state.frameMax, 1), 0, 1);
    ctx.fillStyle = colours.secondary;
    ctx.globalAlpha = base * TRACK_ALPHA;
    ctx.fillRect(sliderX, middle - 1, sliderW, 2);
    ctx.globalAlpha = base;
    ctx.fillRect(sliderX, middle - 1, fraction * sliderW, 2);
    if (!low && sliderW > THUMB) {
      ctx.beginPath();
      ctx.arc(sliderX + THUMB / 2 + fraction * (sliderW - THUMB), middle, THUMB / 2, 0, TURN);
      ctx.fill();
    }
    ctx.globalAlpha = alpha;
    if (low) return;
    if (view.loading) ctx.globalAlpha = alpha * DIMMED;
    if (view.playing) pauseIcon(ctx, playX + BUTTON / 2, middle, ICON, colours.text);
    else playIcon(ctx, playX + BUTTON / 2, middle, ICON, colours.text);
    ctx.globalAlpha = alpha;
    ctx.font = face;
    say(ctx, texts.timecode, timeX, middle, colours.secondary, "left");
    maximizeIcon(ctx, fullX + BUTTON / 2, middle, ICON, colours.secondary);
    volumeIcon(ctx, muteX + BUTTON / 2, middle, ICON, colours.secondary, media.muted);
  }

  function drawTip(ctx, x, y, w, state, colours) {
    const frameMax = state.frameMax;
    let frame;
    let norm;
    if (view.drag === "scrub") {
      frame = view.playhead;
      norm = frameMax <= 0 ? 0 : view.playhead / frameMax;
    } else if (view.drag === "min") {
      frame = state.start;
      norm = frameMax <= 0 ? 0 : state.start / frameMax;
    } else if (view.drag === "max") {
      frame = state.end;
      norm = frameMax <= 0 ? 1 : state.end / frameMax;
    } else {
      return;
    }
    const centre = x + norm * Math.max(0, w - HANDLE_WIDTH * 2) + HANDLE_WIDTH;
    const text = String(frame);
    ctx.font = faces.bold;
    const tipW = ctx.measureText(text).width + TIP_PAD * 2;
    const bottom = y - TIP_GAP;
    ctx.fillStyle = colours.bg;
    ctx.strokeStyle = colours.outline;
    ctx.beginPath();
    ctx.roundRect(centre - tipW / 2, bottom - TIP_ARROW - TIP_HEIGHT, tipW, TIP_HEIGHT, RADIUS);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(centre - TIP_ARROW, bottom - TIP_ARROW);
    ctx.lineTo(centre + TIP_ARROW, bottom - TIP_ARROW);
    ctx.lineTo(centre, bottom);
    ctx.closePath();
    ctx.fill();
    say(ctx, text, centre, bottom - TIP_ARROW - TIP_HEIGHT / 2, colours.text, "center");
    ctx.font = faces.value;
  }

  function drawFilm(ctx, x, y, w, state, colours, low) {
    place(rects.film, x, y, w, FILM);
    const meta = media.meta;
    const span = Math.max(0, w - HANDLE_WIDTH * 2);
    const stripX = x + HANDLE_WIDTH;
    const stripY = y + STRIP_INSET;
    const pending = view.loading && !media.thumbReady;
    ctx.fillStyle = colours.bg;
    ctx.beginPath();
    if (low) ctx.rect(x, y, w, FILM);
    else ctx.roundRect(x, y, w, FILM, RADIUS);
    ctx.fill();
    if (!low && span > 0) {
      if (media.thumbReady && media.thumb) {
        const aspect = meta.width > 0 && meta.height > 0 ? meta.width / meta.height : TILE_ASPECT;
        const tile = Math.max(Math.round(STRIP * (Number.isFinite(aspect) && aspect > 0 ? aspect : TILE_ASPECT)), 1);
        ctx.save();
        ctx.beginPath();
        ctx.rect(stripX, stripY, span, STRIP);
        ctx.clip();
        for (let left = stripX; left < stripX + span; left += tile) {
          ctx.drawImage(media.thumb, left, stripY, tile, STRIP);
        }
        ctx.restore();
      } else if (pending) {
        skeleton(ctx, stripX, stripY, span, STRIP, 1);
      }
    }
    const frameMax = state.frameMax;
    const startNorm = frameMax <= 0 ? 0 : state.start / frameMax;
    const endNorm = frameMax <= 0 ? 1 : state.end / frameMax;
    ctx.fillStyle = DIM;
    if (startNorm > 0) ctx.fillRect(x, y, startNorm * span, FILM);
    if (endNorm < 1) ctx.fillRect(x + w - (1 - endNorm) * span, y, (1 - endNorm) * span, FILM);
    const selX = x + startNorm * span;
    const selW = (endNorm - startNorm) * span + HANDLE_WIDTH * 2;
    const handles = meta.totalFrames > 1;
    const midX = handles ? selX + HANDLE_WIDTH : selX;
    const midW = handles ? selW - HANDLE_WIDTH * 2 : selW;
    ctx.fillStyle = pending ? colours.bg : SELECTION;
    ctx.fillRect(midX, y, midW, BAR);
    ctx.fillRect(midX, y + FILM - BAR, midW, BAR);
    if (handles) {
      const endX = selX + selW - HANDLE_WIDTH;
      ctx.fillStyle = SELECTION;
      ctx.beginPath();
      if (low) {
        ctx.rect(selX, y, HANDLE_WIDTH, FILM);
        ctx.rect(endX, y, HANDLE_WIDTH, FILM);
      } else {
        ctx.roundRect(selX, y, HANDLE_WIDTH, FILM, LEFT_RADII);
        ctx.roundRect(endX, y, HANDLE_WIDTH, FILM, RIGHT_RADII);
      }
      ctx.fill();
      if (!low) {
        ctx.fillStyle = colours.bg;
        ctx.fillRect(selX + HANDLE_WIDTH / 2 - 0.5, y + (FILM - GRIP) / 2, 1, GRIP);
        ctx.fillRect(endX + HANDLE_WIDTH / 2 - 0.5, y + (FILM - GRIP) / 2, 1, GRIP);
      }
    }
    ctx.fillStyle = PLAYHEAD;
    ctx.fillRect(x + (frameMax <= 0 ? 0 : view.playhead / frameMax) * span + HANDLE_WIDTH - 1, stripY, 2, STRIP);
    if (!low && view.drag) drawTip(ctx, x, y, w, state, colours);
  }

  function drawRatio(ctx, x, y, w, row, state, colours, low) {
    const meta = media.meta;
    const able = canLock(state.crop, meta.width, meta.height);
    view.canLock = able;
    const combo = place(rects.combo, x, y, Math.max(0, w - row - GRID_GAP), row);
    const lock = place(rects.lock, x + w - row, y, row, row);
    const locked = view.locked != null;
    drawCombo(ctx, combo[0], y, combo[2], row, "Ratio", RATIO_LABELS[ratioIndex(view.locked)], low,
      able ? ENABLED : DISABLED);
    let look = locked ? ON_DISABLED : OFF_DISABLED;
    if (able) look = locked ? ON : OFF;
    button(ctx, lock[0], y, row, row, "", low, look);
    if (low) return;
    const alpha = ctx.globalAlpha;
    if (!able) ctx.globalAlpha = alpha * DIMMED;
    lockIcon(ctx, lock[0] + row / 2, y + row / 2, row * 0.6, !locked, colours.text);
    ctx.globalAlpha = alpha;
  }

  function drawMeta(ctx, x, y, w, colours, face, low) {
    const line = y + META_GAP;
    ctx.fillStyle = colours.outline;
    ctx.fillRect(x, line, w, 1);
    if (low) return;
    ctx.font = face;
    let top = line + 1 + META_PAD;
    for (let index = 0; index < META_LABELS.length; index += 1) {
      const middle = top + META_ROW / 2;
      say(ctx, texts.labels[index], x, middle, colours.secondary, "left");
      say(ctx, texts.shown[index], x + w, middle, colours.text, "right");
      top += META_ROW + META_ROW_GAP;
    }
  }

  function minSize(node) {
    attach(node);
    const kind = kindOf();
    let height = EMPTY_MIN;
    if (kind === "failed") height = PREVIEW_MIN;
    else if (kind === "full") {
      height = PREVIEW_MIN + PANEL_GAP * 2 + CONTROLS + gridHeight(trimOn(), cropOn(), rowHeight());
    }
    wanted.minHeight = height + GAP;
    return wanted;
  }

  function draw(ctx, node, width, y, height, low) {
    attach(node);
    const colours = theme();
    const trim = trimOn();
    const crop = cropOn();
    const state = sync();
    if (view.drag && view.pointer?.eDown !== view.dragEvent) view.drag = null;
    const x = MARGIN;
    const w = Math.max(0, width - MARGIN * 2);
    const kind = kindOf();
    view.kind = kind;
    const face = typeface();
    ctx.font = face;
    if (kind === "empty") {
      drawEmpty(ctx, x, y, w, height, colours, face, low);
      return;
    }
    const row = rowHeight();
    const full = kind === "full";
    const previewHeight = full
      ? Math.max(0, height - gridHeight(trim, crop, row) - CONTROLS - PANEL_GAP * 2)
      : height;
    refresh(ctx, state, trim, w, face);
    drawPreview(ctx, x, y, w, previewHeight, state, crop, colours, face, low);
    if (!full) return;
    let top = y + previewHeight + PANEL_GAP;
    drawControls(ctx, x, top, w, state, colours, face, low);
    top += CONTROLS + PANEL_GAP;
    const loading = view.loading;
    if (trim) {
      drawFilm(ctx, x, top, w, state, colours, low);
      top += FILM + GRID_GAP;
      const total = Math.max(media.meta.totalFrames, 1);
      const start = states.start;
      start.disabled = loading;
      start.canDecrease = state.start > 0;
      start.canIncrease = state.start < Math.max(state.end - 1, 0);
      drawNumber(ctx, x, top, w, row, "Start Frame", texts.start, low, start);
      place(rects.start, x, top, w, row);
      top += row + GRID_GAP;
      const end = states.end;
      end.disabled = loading;
      end.canDecrease = state.end > Math.min(state.start + 1, total - 1);
      end.canIncrease = state.end < Math.max(total - 1, 0);
      drawNumber(ctx, x, top, w, row, "End Frame", texts.end, low, end);
      place(rects.end, x, top, w, row);
      top += row + GRID_GAP;
    }
    if (crop) {
      drawRatio(ctx, x, top, w, row, state, colours, low);
      top += row + GRID_GAP;
      const off = loading || media.meta.width <= 0;
      for (let index = 0; index < CROP_KEYS.length; index += 1) {
        const field = states.crop[index];
        field.disabled = off;
        field.canDecrease = state.crop[CROP_KEYS[index]] > cropFields[index].min;
        drawNumber(ctx, x, top, w, row, CROP_LABELS[index], texts.crop[index], low, field);
        place(rects.crop[index], x, top, w, row);
        top += row + GRID_GAP;
      }
    }
    drawMeta(ctx, x, top, w, colours, face, low);
  }

  function cropModeAt(px, py) {
    const box = rects.box;
    const x = box[0];
    const y = box[1];
    const w = box[2];
    const h = box[3];
    const half = CORNER / 2;
    if (contains(x - half, y + h - half, CORNER, CORNER, px, py)) return "sw";
    if (contains(x + w - half, y + h - half, CORNER, CORNER, px, py)) return "se";
    if (contains(x + w - half, y - half, CORNER, CORNER, px, py)) return "ne";
    if (contains(x - half, y - half, CORNER, CORNER, px, py)) return "nw";
    if (view.locked == null) {
      if (contains(x - EDGE / 2, y, EDGE, h, px, py)) return "w";
      if (contains(x, y + h - EDGE / 2, w, EDGE, px, py)) return "s";
      if (contains(x + w - EDGE / 2, y, EDGE, h, px, py)) return "e";
      if (contains(x, y - EDGE / 2, w, EDGE, px, py)) return "n";
    }
    if (contains(x - BORDER, y - BORDER, w + BORDER * 2, h + BORDER * 2, px, py)) return "move";
    return null;
  }

  function previewDown(pointer, px, py) {
    if (view.retryShown) {
      if (!inside(rects.retry, px, py)) return false;
      pointer.onClick = () => media.retry();
      return true;
    }
    if (!view.cropShown) return false;
    const mode = cropModeAt(px, py);
    const shown = rects.shown;
    if (!mode || !(shown[2] > 0 && shown[3] > 0)) return false;
    const meta = media.meta;
    const scaleX = meta.width / shown[2];
    const scaleY = meta.height / shown[3];
    const crop = read().crop;
    const start = { x: crop.x, y: crop.y, width: crop.width, height: crop.height };
    const ratio = view.locked;
    const downX = pointer.eDown.canvasX;
    const downY = pointer.eDown.canvasY;
    let grouped = false;
    pointer.onDrag = (event) => {
      const box = dragCrop(mode, start, (event.canvasX - downX) * scaleX, (event.canvasY - downY) * scaleY, ratio,
        meta.width, meta.height);
      const next = withCrop(current(), media.meta, box);
      if (sameCrop(next.crop, current().crop)) return;
      if (!grouped) {
        grouped = true;
        gesture(pointer);
      }
      save(next);
    };
    return true;
  }

  function sliderDown(pointer, node, px) {
    const state = read();
    if (view.loading || state.frameMax <= 0) return false;
    const slider = rects.slider;
    const left = slider[0];
    const width = slider[2];
    const max = Math.max(state.frameMax, 1);
    let offset = 0;
    function seekTo(position) {
      const frame = sliderValue(position, width, max);
      if (frame === view.playhead) return;
      const now = read();
      const trim = trimOn();
      scrub(bound(frame, trim ? now.start : 0, trim ? now.end : now.frameMax));
    }
    seekTo(px - left - THUMB / 2);
    pointer.onDrag = (event) => {
      const at = event.canvasX - node.pos[0];
      if (!offset) offset = at - (left + bound(view.playhead / max, 0, 1) * (width - THUMB));
      seekTo(at - left - offset);
    };
    return true;
  }

  function scrubTo(frame, force) {
    const state = read();
    const target = bound(frame, state.start, state.end);
    if (!force && target === view.playhead) return;
    view.playhead = target;
    scrub(target);
  }

  function trimDown(pointer, node, handle) {
    const film = rects.film;
    view.drag = handle;
    view.dragEvent = pointer.eDown;
    view.pointer = pointer;
    let grouped = false;
    pointer.onDrag = (event) => {
      const state = read();
      const meta = media.meta;
      const value = bound(handleValue(event.canvasX - node.pos[0], film[0], film[2], state.frameMax, handle), 0,
        state.frameMax);
      let next = null;
      if (handle === "min") {
        const frame = Math.round(Math.min(value, state.end));
        if (frame !== state.start) next = withStart(current(), meta, frame);
      } else {
        const frame = Math.round(Math.max(value, state.start));
        if (frame !== state.end) next = withEnd(current(), meta, frame);
      }
      if (!next) return;
      if (!grouped) {
        grouped = true;
        gesture(pointer);
      }
      save(next);
    };
    redraw();
    return true;
  }

  function filmDown(pointer, node, px, py) {
    const state = read();
    const film = rects.film;
    const left = film[0];
    const top = film[1];
    const width = film[2];
    const total = media.meta.totalFrames;
    const frameMax = state.frameMax;
    const span = Math.max(0, width - HANDLE_WIDTH * 2);
    const playX = left + (frameMax <= 0 ? 0 : view.playhead / frameMax) * span + HANDLE_WIDTH;
    const onPlayhead = contains(playX - PLAYHEAD_HIT / 2, top + STRIP_INSET, PLAYHEAD_HIT, STRIP, px, py);
    if (!onPlayhead && total > 1) {
      const startNorm = frameMax <= 0 ? 0 : state.start / frameMax;
      const endNorm = frameMax <= 0 ? 1 : state.end / frameMax;
      const selX = left + startNorm * span;
      const selW = (endNorm - startNorm) * span + HANDLE_WIDTH * 2;
      if (contains(selX + selW - HANDLE_WIDTH, top, HANDLE_WIDTH, FILM, px, py)) return trimDown(pointer, node, "max");
      if (contains(selX, top, HANDLE_WIDTH, FILM, px, py)) return trimDown(pointer, node, "min");
    }
    if (total <= 1) return false;
    view.drag = "scrub";
    view.dragEvent = pointer.eDown;
    view.pointer = pointer;
    scrubTo(scrubFrame(px, left, width, frameMax), true);
    pointer.onDrag = (event) => {
      scrubTo(scrubFrame(event.canvasX - node.pos[0], left, width, read().frameMax), false);
    };
    return true;
  }

  function fieldDown(pointer, node, area, field, off) {
    if (off) return false;
    return numberPointer(pointer, node, area[0], area[1], area[2], area[3], field);
  }

  function pointerDown(pointer, node) {
    if (widget.computedDisabled || view.kind === "empty") return false;
    attach(node);
    const point = local(pointer.eDown, node);
    const px = point[0];
    const py = point[1];
    if (inside(rects.preview, px, py)) return previewDown(pointer, px, py);
    if (view.kind !== "full") return false;
    if (inside(rects.play, px, py)) {
      if (view.loading) return false;
      pointer.onClick = () => setPlaying(!view.playing);
      return true;
    }
    if (inside(rects.fullscreen, px, py)) {
      pointer.onClick = () => media.openFullscreen();
      return true;
    }
    if (inside(rects.mute, px, py)) {
      pointer.onClick = () => media.setMuted(!media.muted);
      return true;
    }
    if (inside(rects.slider, px, py)) return sliderDown(pointer, node, px);
    if (trimOn()) {
      if (inside(rects.film, px, py)) return filmDown(pointer, node, px, py);
      if (inside(rects.start, px, py)) return fieldDown(pointer, node, rects.start, startField, view.loading);
      if (inside(rects.end, px, py)) return fieldDown(pointer, node, rects.end, endField, view.loading);
    }
    if (cropOn()) {
      if (inside(rects.combo, px, py)) {
        const combo = rects.combo;
        return view.canLock && comboPointer(pointer, node, combo[0], combo[1], combo[2], combo[3], choice);
      }
      if (inside(rects.lock, px, py)) {
        if (!view.canLock) return false;
        pointer.onClick = toggleLock;
        return true;
      }
      const off = view.loading || media.meta.width <= 0;
      for (let index = 0; index < CROP_KEYS.length; index += 1) {
        if (inside(rects.crop[index], px, py)) return fieldDown(pointer, node, rects.crop[index], cropFields[index], off);
      }
    }
    return false;
  }

  function contextMenu(event, node, point) {
    if (view.kind !== "full" || !trimOn()) return false;
    return inside(rects.film, point[0], point[1]);
  }

  function linked() {
    if (view.playing) setPlaying(false);
  }

  return { minSize, draw, pointerDown, contextMenu, linked };
}

export { make, release };
