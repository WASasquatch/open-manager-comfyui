import { api } from "../../../../../../scripts/api.js";
import { redraw, viewUrl } from "./kit.mjs";
import { annotated, nodeImageUrl, outputsOf, previewsOf, withoutRand } from "./media-source.mjs";
import { DEFAULT_FPS, EMPTY_META } from "./video-edit-model.mjs";

const METADATA_TIMEOUT = 15000;

const SEEK_TIMEOUT = 5000;

const DECODE_TIMEOUT = 5000;

const DECODE_STEP = 250;

const RETRY_DELAYS = [500, 1000, 2000, 4000, 8000];

const THUMB_HEIGHT = 96;

const THUMB_WIDTH = 384;

const STILL_SIZE = 1280;

const META_LIMIT = 64;

const PLACEHOLDER = "Loading...";

const ROUTE = "/open_manager/v1/api/qol/video-meta";

const ABORTED = Symbol("aborted");

const TIMED_OUT = Symbol("timed out");

const FAILED = Symbol("failed");

const NONE = Symbol("none");

const RESOLVED = Promise.resolve();

const FULL_STYLE = {
  position: "fixed", left: "0", top: "0", width: "100vw", height: "100vh", background: "#000",
  zIndex: "2147483647",
};

const known = new Map();

function waitFor(target, name, timeout, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(ABORTED);
      return;
    }
    let timer = 0;
    function done() {
      clearTimeout(timer);
      target.removeEventListener(name, arrived);
      target.removeEventListener("error", broke);
      signal.removeEventListener("abort", stopped);
    }
    function arrived() {
      done();
      resolve();
    }
    function broke() {
      done();
      reject(FAILED);
    }
    function stopped() {
      done();
      reject(ABORTED);
    }
    timer = setTimeout(() => {
      done();
      reject(TIMED_OUT);
    }, timeout);
    target.addEventListener(name, arrived, { once: true });
    target.addEventListener("error", broke, { once: true });
    signal.addEventListener("abort", stopped, { once: true });
  });
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(ABORTED);
      return;
    }
    function stopped() {
      clearTimeout(timer);
      reject(ABORTED);
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", stopped);
      resolve();
    }, ms);
    signal.addEventListener("abort", stopped, { once: true });
  });
}

async function settle(video, name, timeout, signal) {
  try {
    await waitFor(video, name, timeout, signal);
  } catch (reason) {
    if (reason !== TIMED_OUT) throw reason;
  }
}

function trusted(address) {
  if (address.origin === window.location.origin) return true;
  try {
    return address.origin === new URL(api.apiURL(""), window.location.origin).origin;
  } catch {
    return false;
  }
}

function viewAddress(url) {
  let address;
  try {
    address = new URL(url, window.location.origin);
  } catch {
    return null;
  }
  if (address.protocol !== "http:" && address.protocol !== "https:") return null;
  if (!trusted(address) || !address.pathname.endsWith("/view")) return null;
  if (address.searchParams.get("filename") === null) return null;
  return address;
}

function readMeta(answer) {
  if (!answer?.ok) return undefined;
  const { fps, duration, width, height, size } = answer;
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) return undefined;
  return {
    fps: Number.isFinite(fps) && fps > 0 ? fps : null,
    duration: Number.isFinite(duration) && duration >= 0 ? duration : null,
    width,
    height,
    size: Number.isFinite(size) && size >= 0 ? size : null,
  };
}

function fetchMeta(url) {
  const address = viewAddress(url);
  if (!address) return RESOLVED;
  const found = address.searchParams;
  const query = new URLSearchParams({
    filename: found.get("filename"), subfolder: found.get("subfolder") ?? "",
  });
  if (found.has("type")) query.set("type", found.get("type"));
  const key = `${address.origin}${address.pathname}?${query}`;
  const cached = known.get(key);
  if (cached) {
    known.delete(key);
    known.set(key, cached);
    return cached;
  }
  const pending = api.fetchApi(`${ROUTE}?${query}`)
    .then((response) => response.json())
    .then(readMeta)
    .catch(() => undefined);
  known.set(key, pending);
  if (known.size > META_LIMIT) known.delete(known.keys().next().value);
  pending.then((meta) => {
    if (!meta && known.get(key) === pending) known.delete(key);
  });
  return pending;
}

function sourceOf(node) {
  const inputs = node.inputs;
  let slot = -1;
  if (inputs) {
    for (let index = 0; index < inputs.length; index += 1) {
      if (inputs[index]?.name === "video") {
        slot = index;
        break;
      }
    }
  }
  if (slot < 0) return node;
  let upstream = node.getInputNode(slot);
  let link = node.getInputLink(slot);
  for (let depth = 0; upstream?.isSubgraphNode?.(); depth += 1) {
    if (!link || depth >= 16) return undefined;
    const resolved = upstream.resolveSubgraphOutputLink?.(link.origin_slot);
    if (!resolved) return undefined;
    upstream = resolved.outputNode ?? null;
    link = resolved.link;
  }
  return upstream ?? undefined;
}

function fileValue(source) {
  const widgets = source.widgets;
  if (!widgets) return undefined;
  for (let index = 0; index < widgets.length; index += 1) {
    if (widgets[index]?.name === "file") return widgets[index].value;
  }
  return undefined;
}

function fileUrl(raw) {
  if (typeof raw !== "string" || !raw || raw === PLACEHOLDER) return undefined;
  const place = annotated(raw, "input");
  const slash = place.path.lastIndexOf("/");
  const filename = slash === -1 ? place.path : place.path.slice(slash + 1);
  if (!filename) return undefined;
  return viewUrl({ filename, subfolder: slash === -1 ? "" : place.path.slice(0, slash), type: place.root });
}

function sourceMemo() {
  return { source: NONE, outputs: undefined, previews: undefined, file: undefined, url: undefined, again: false };
}

function forget(memo) {
  memo.source = NONE;
  memo.outputs = undefined;
  memo.previews = undefined;
  memo.file = undefined;
  memo.url = undefined;
  memo.again = false;
}

function videoUrl(node, memo) {
  memo.again = false;
  const source = sourceOf(node);
  if (!source) {
    memo.source = undefined;
    memo.outputs = undefined;
    memo.previews = undefined;
    memo.file = undefined;
    memo.url = undefined;
    return undefined;
  }
  const outputs = outputsOf(source);
  const previews = previewsOf(source);
  const file = fileValue(source);
  if (memo.source === source && memo.outputs === outputs && memo.previews === previews && memo.file === file) {
    return memo.url;
  }
  const rerun = memo.source !== NONE && outputs !== undefined && outputs !== memo.outputs;
  const raw = nodeImageUrl(source);
  const fromOutput = raw && withoutRand(raw);
  const fromFile = fileUrl(file);
  const url = source === node ? (fromFile ?? fromOutput) : (fromOutput ?? fromFile);
  memo.again = rerun && url !== undefined && url === memo.url;
  memo.source = source;
  memo.outputs = outputs;
  memo.previews = previews;
  memo.file = file;
  memo.url = url;
  return url;
}

function createMedia(hooks) {
  const media = {
    url: undefined,
    status: "idle",
    loading: false,
    error: null,
    meta: EMPTY_META,
    intrinsicWidth: 0,
    intrinsicHeight: 0,
    video: null,
    thumb: null,
    thumbReady: false,
    still: null,
    stillReady: false,
    stillVersion: 0,
    seeking: false,
    playing: false,
    muted: false,
    fullscreen: false,
    bind,
    retry,
    seek,
    setMuted,
    openFullscreen,
    release,
  };
  const waiters = [];
  let retries = 0;
  let retryTimer = 0;
  let seekTimer = 0;
  let loadId = 0;
  let controller = null;
  let busy = false;
  let thumbContext;
  let stillContext;
  let full = null;

  function capture() {
    const video = media.video;
    if (!video || busy || (media.playing && !media.fullscreen) || video.readyState < 2) return;
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (width <= 0 || height <= 0) return;
    if (stillContext === undefined) {
      const canvas = document.createElement("canvas");
      stillContext = canvas.getContext("2d") || null;
      media.still = stillContext ? canvas : null;
    }
    if (!stillContext) return;
    const scale = Math.min(1, STILL_SIZE / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    const canvas = stillContext.canvas;
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    stillContext.drawImage(video, 0, 0, w, h);
    media.stillReady = true;
    media.stillVersion += 1;
    redraw();
  }

  function finishSeek() {
    clearTimeout(seekTimer);
    seekTimer = 0;
    media.seeking = false;
    capture();
    if (waiters.length) {
      const pending = waiters.splice(0);
      for (let index = 0; index < pending.length; index += 1) pending[index]();
    }
    redraw();
  }

  function onError() {
    if (media.seeking) finishSeek();
    if (!busy) failed();
  }

  function onEnded() {
    hooks.ended();
  }

  function onPause() {
    if (!media.seeking) capture();
  }

  function element() {
    if (media.video) return media.video;
    const video = document.createElement("video");
    video.preload = "metadata";
    video.playsInline = true;
    video.crossOrigin = "anonymous";
    video.muted = media.muted;
    video.addEventListener("seeked", finishSeek);
    video.addEventListener("error", onError);
    video.addEventListener("ended", onEnded);
    video.addEventListener("pause", onPause);
    media.video = video;
    hooks.attached();
    return video;
  }

  function thumbnailContext() {
    if (thumbContext === undefined) {
      const canvas = document.createElement("canvas");
      thumbContext = canvas.getContext("2d") || null;
      media.thumb = thumbContext ? canvas : null;
    }
    return thumbContext;
  }

  function grabThumb(video) {
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (width <= 0 || height <= 0 || video.readyState < 2) return false;
    const scale = Math.min(THUMB_HEIGHT / height, THUMB_WIDTH / width, 1);
    const canvas = thumbContext.canvas;
    canvas.width = Math.max(Math.round(width * scale), 1);
    canvas.height = Math.max(Math.round(height * scale), 1);
    thumbContext.drawImage(video, 0, 0, canvas.width, canvas.height);
    media.thumbReady = true;
    return true;
  }

  async function thumbnail(video, duration, signal) {
    const target = Number.isFinite(duration) && duration > 0 ? Math.min(1, duration * 0.1) : 0;
    if (video.readyState < 2 || Math.abs(video.currentTime - target) > 0.001) {
      video.currentTime = target;
      await settle(video, "seeked", SEEK_TIMEOUT, signal);
    }
    if (grabThumb(video)) return;
    const deadline = Date.now() + DECODE_TIMEOUT;
    while (Date.now() < deadline) {
      await sleep(DECODE_STEP, signal);
      if (grabThumb(video)) return;
    }
  }

  async function knownDuration(video, signal) {
    if (Number.isFinite(video.duration)) return video.duration;
    video.currentTime = Number.MAX_SAFE_INTEGER;
    await settle(video, "seeked", SEEK_TIMEOUT, signal);
    return Number.isFinite(video.duration) ? video.duration : 0;
  }

  function stale(id, url) {
    return id !== loadId || media.url !== url;
  }

  async function load(url) {
    controller?.abort();
    const own = new AbortController();
    controller = own;
    const signal = own.signal;
    loadId += 1;
    const id = loadId;
    media.loading = true;
    media.error = null;
    media.thumbReady = false;
    redraw();
    if (!thumbnailContext()) {
      media.loading = false;
      media.error = "canvas-unavailable";
      media.meta = EMPTY_META;
      if (controller === own) controller = null;
      redraw();
      return;
    }
    const video = element();
    busy = true;
    let ready = false;
    try {
      video.src = url;
      await waitFor(video, "loadedmetadata", METADATA_TIMEOUT, signal);
      if (stale(id, url)) return;
      if (video.videoWidth && video.videoHeight) {
        media.intrinsicWidth = video.videoWidth;
        media.intrinsicHeight = video.videoHeight;
      }
      const duration = await knownDuration(video, signal);
      if (stale(id, url)) return;
      const info = await fetchMeta(url);
      if (stale(id, url)) return;
      const length = info?.duration ?? duration;
      const fps = info?.fps ?? DEFAULT_FPS;
      media.meta = {
        duration: length,
        totalFrames: Math.max(Math.round(length * fps), 1),
        fps,
        width: info?.width ?? video.videoWidth,
        height: info?.height ?? video.videoHeight,
        size: info?.size ?? undefined,
      };
      redraw();
      await thumbnail(video, length, signal);
      if (stale(id, url)) return;
      ready = true;
    } catch (reason) {
      if (reason === ABORTED || stale(id, url)) return;
      media.error = "load-failed";
      media.meta = EMPTY_META;
    } finally {
      if (id === loadId) {
        media.loading = false;
        busy = false;
      }
      if (controller === own) controller = null;
      redraw();
    }
    if (ready) hooks.ready();
    else if (media.error === "load-failed") failed();
  }

  function cancel() {
    loadId += 1;
    controller?.abort();
    controller = null;
    busy = false;
    media.loading = false;
    media.error = null;
    media.meta = EMPTY_META;
    media.thumbReady = false;
  }

  function unload() {
    const video = media.video;
    if (!video) return;
    video.pause();
    video.removeAttribute("src");
    video.load();
    media.stillReady = false;
  }

  function reload() {
    retryTimer = 0;
    cancel();
    media.intrinsicWidth = 0;
    media.intrinsicHeight = 0;
    hooks.reset();
    if (!media.url) return;
    media.status = "loading";
    load(media.url);
  }

  function failed() {
    if (media.status !== "loading") return;
    if (retries >= RETRY_DELAYS.length) {
      media.status = "failed";
      redraw();
      return;
    }
    const delay = RETRY_DELAYS[retries];
    retries += 1;
    media.status = "retrying";
    clearTimeout(retryTimer);
    retryTimer = setTimeout(reload, delay);
    redraw();
  }

  function retry() {
    if (media.status === "idle") return;
    clearTimeout(retryTimer);
    retries = 0;
    media.status = "retrying";
    reload();
  }

  function bind(url) {
    if (url === media.url) return;
    clearTimeout(retryTimer);
    retryTimer = 0;
    retries = 0;
    const had = media.url;
    media.url = url;
    media.status = url ? "loading" : "idle";
    media.intrinsicWidth = 0;
    media.intrinsicHeight = 0;
    if (!url || !had) cancel();
    hooks.reset();
    if (url) load(url);
    else unload();
  }

  function seek(time) {
    const video = media.video;
    if (!video || !media.url) return RESOLVED;
    const end = video.duration;
    const target = !Number.isFinite(end) || end <= 0
      ? Math.max(time, 0)
      : Math.min(Math.max(time, 0), Math.max(end - 0.001, 0));
    if (Math.abs(video.currentTime - target) <= 0.0001) return RESOLVED;
    media.seeking = true;
    video.currentTime = target;
    clearTimeout(seekTimer);
    seekTimer = setTimeout(finishSeek, SEEK_TIMEOUT);
    return new Promise((resolve) => {
      waiters.push(resolve);
    });
  }

  function setMuted(muted) {
    media.muted = muted;
    if (media.video) media.video.muted = muted;
    if (full) full.view.muted = muted;
    redraw();
  }

  function openFullscreen() {
    const url = media.url;
    if (!url || full) return;
    const view = document.createElement("video");
    Object.assign(view.style, FULL_STYLE);
    view.controls = true;
    view.playsInline = true;
    view.crossOrigin = "anonymous";
    view.muted = media.muted;
    view.preload = "auto";
    view.src = url;
    view.currentTime = media.video ? media.video.currentTime : 0;
    const playing = media.playing;
    let entered = false;
    const record = { view, close };
    function changed() {
      if (document.fullscreenElement === view) {
        if (entered) return;
        entered = true;
        media.fullscreen = true;
        hooks.entered();
        if (playing) view.play().catch(() => {});
        return;
      }
      if (entered) close(true);
    }
    function close(sync) {
      if (full !== record) return;
      full = null;
      document.removeEventListener("fullscreenchange", changed);
      const time = view.currentTime;
      const running = !view.paused;
      view.pause();
      view.removeAttribute("src");
      view.load();
      view.remove();
      media.fullscreen = false;
      if (sync && entered) hooks.left(time, running);
      redraw();
    }
    full = record;
    document.addEventListener("fullscreenchange", changed);
    document.body.appendChild(view);
    let request;
    try {
      request = view.requestFullscreen();
    } catch {
      close(false);
      return;
    }
    request?.catch?.(() => close(false));
  }

  function release() {
    loadId += 1;
    controller?.abort();
    controller = null;
    busy = false;
    clearTimeout(retryTimer);
    retryTimer = 0;
    clearTimeout(seekTimer);
    seekTimer = 0;
    retries = 0;
    if (full) {
      if (document.fullscreenElement === full.view) document.exitFullscreen?.()?.catch?.(() => {});
      full.close(false);
    }
    const video = media.video;
    if (video) {
      video.removeEventListener("seeked", finishSeek);
      video.removeEventListener("error", onError);
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("pause", onPause);
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
    if (media.thumb) media.thumb.width = 0;
    if (media.still) media.still.width = 0;
    thumbContext = undefined;
    stillContext = undefined;
    Object.assign(media, {
      url: undefined, status: "idle", loading: false, error: null, meta: EMPTY_META, intrinsicWidth: 0,
      intrinsicHeight: 0, video: null, thumb: null, thumbReady: false, still: null, stillReady: false,
      seeking: false, playing: false, fullscreen: false,
    });
    if (waiters.length) {
      const pending = waiters.splice(0);
      for (let index = 0; index < pending.length; index += 1) pending[index]();
    }
  }

  return media;
}

export { createMedia, forget, sourceMemo, videoUrl };
