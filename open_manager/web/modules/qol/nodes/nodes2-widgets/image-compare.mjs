import { app } from "../../../../../../scripts/app.js";
import { api } from "../../../../../../scripts/api.js";
import {
  MARGIN, centreText, clamp, contain, contains, font, hoverPoint, image, local, measure, output,
  rowHeight, source, theme,
} from "./kit.mjs";

const SIDES = [
  { input: "image_a", output: "a_images", label: "A:" },
  { input: "image_b", output: "b_images", label: "B:" },
];

const MIN_HEIGHT = 128;

const NAV_GAP = 4;

const RING = 12;

const NONE = Object.freeze([]);

const urlLists = new WeakMap();

function urlsOf(items) {
  if (!Array.isArray(items) || !items.length) return NONE;
  let found = urlLists.get(items);
  if (!found) {
    const rand = app.getRandParam?.() || "";
    const preview = app.getPreviewFormatParam?.() || "";
    found = items.filter((item) => item && typeof item.filename === "string").map((item) => {
      const params = new URLSearchParams({
        filename: item.filename, subfolder: item.subfolder || "", type: item.type || "output",
      });
      return api.apiURL(`/view?${params}${preview}${rand}`);
    });
    urlLists.set(items, found);
  }
  return found;
}

function sideList(node, side) {
  const upstream = source(node, side.input);
  if (upstream) {
    if (upstream.imgs?.length) return upstream.imgs;
    const urls = urlsOf(output(upstream)?.images);
    if (urls.length) return urls;
  }
  return urlsOf(output(node)?.[side.output]);
}

function ready(item) {
  if (typeof item === "string") return image(item);
  return item?.complete && item.naturalWidth > 0 ? item : undefined;
}

function make(widget) {
  const view = { x: 0, y: 0, w: 0, h: 0 };
  const frameA = [0, 0, 0, 0];
  const frameB = [0, 0, 0, 0];
  const counts = [0, 0];
  const index = [0, 0];
  const lists = [NONE, NONE];
  const nav = [
    { prev: [0, 0, 0, 0], next: [0, 0, 0, 0], shown: false },
    { prev: [0, 0, 0, 0], next: [0, 0, 0, 0], shown: false },
  ];
  const counterKeys = [-1, -1];
  const counterTexts = ["", ""];
  let split = 0.5;
  let navHeight = 0;

  function refresh(node) {
    for (let at = 0; at < 2; at += 1) {
      const list = sideList(node, SIDES[at]);
      lists[at] = list;
      counts[at] = list.length;
      if (index[at] >= list.length) index[at] = 0;
    }
    return counts[0] > 1 || counts[1] > 1;
  }

  function drawNav(ctx, at, low) {
    const colours = theme();
    const box = nav[at];
    box.shown = counts[at] > 1;
    if (!box.shown || low) return;
    const row = navHeight - NAV_GAP;
    const middle = view.y - NAV_GAP - row / 2;
    const label = SIDES[at].label;
    const key = index[at] * 100000 + counts[at];
    if (counterKeys[at] !== key) {
      counterKeys[at] = key;
      counterTexts[at] = `${index[at] + 1} / ${counts[at]}`;
    }
    const counter = counterTexts[at];
    ctx.font = font(11);
    const labelWidth = measure(ctx, label);
    const counterWidth = measure(ctx, counter);
    const arrow = row;
    const total = labelWidth + 4 + arrow + 4 + counterWidth + 4 + arrow;
    let x = at === 0 ? view.x + 8 : view.x + view.w - 8 - total;
    centreText(ctx, label, x, middle, colours.secondary, 11, "left");
    x += labelWidth + 4;
    const canPrev = index[at] > 0;
    const canNext = index[at] < counts[at] - 1;
    centreText(ctx, "‹", x + arrow / 2, middle, canPrev ? colours.text : colours.disabled, 14);
    box.prev[0] = x;
    box.prev[1] = middle - row / 2;
    box.prev[2] = arrow;
    box.prev[3] = row;
    x += arrow + 4;
    centreText(ctx, counter, x, middle, colours.text, 11, "left");
    x += counterWidth + 4;
    centreText(ctx, "›", x + arrow / 2, middle, canNext ? colours.text : colours.disabled, 14);
    box.next[0] = x;
    box.next[1] = middle - row / 2;
    box.next[2] = arrow;
    box.next[3] = row;
  }

  function drawHandle(ctx, x) {
    const top = view.y;
    const bottom = view.y + view.h;
    const middle = view.y + view.h / 2;
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.fillRect(x - 0.5, top, 1, Math.max(0, middle - RING - top));
    ctx.fillRect(x - 0.5, middle + RING, 1, Math.max(0, bottom - middle - RING));
    ctx.beginPath();
    ctx.arc(x, middle, RING - 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.stroke();
  }

  return {
    hover: true,

    minSize(node) {
      return { minHeight: MIN_HEIGHT + (refresh(node) ? rowHeight() + NAV_GAP : 0), minWidth: 0 };
    },

    draw(ctx, node, width, y, height, low) {
      const showNav = refresh(node);
      navHeight = showNav ? rowHeight() + NAV_GAP : 0;
      view.x = MARGIN;
      view.y = y + navHeight;
      view.w = width - MARGIN * 2;
      view.h = Math.max(0, height - navHeight);
      const a = counts[0] ? ready(lists[0][index[0]]) : undefined;
      const b = counts[1] ? ready(lists[1][index[1]]) : undefined;
      if (showNav) {
        drawNav(ctx, 0, low);
        drawNav(ctx, 1, low);
      } else {
        nav[0].shown = false;
        nav[1].shown = false;
      }
      const colours = theme();
      if (!counts[0] && !counts[1]) {
        if (!low) centreText(ctx, "No images to compare", width / 2, view.y + view.h / 2, colours.secondary, null);
        return;
      }
      ctx.fillStyle = colours.bg;
      ctx.beginPath();
      ctx.roundRect(view.x, view.y, view.w, view.h, low ? 0 : 8);
      ctx.fill();
      const hovered = hoverPoint(node, widget);
      if (hovered && contains(view.x, view.y, view.w, view.h, hovered[0], hovered[1]) && view.w > 0) {
        split = clamp((hovered[0] - view.x) / view.w, 0, 1);
      }
      if (b) {
        contain(b.naturalWidth, b.naturalHeight, view.x, view.y, view.w, view.h, frameB);
        ctx.drawImage(b, frameB[0], frameB[1], frameB[2], frameB[3]);
      }
      if (a) {
        contain(a.naturalWidth, a.naturalHeight, view.x, view.y, view.w, view.h, frameA);
        if (b) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(view.x, view.y, view.w * split, view.h);
          ctx.clip();
          ctx.drawImage(a, frameA[0], frameA[1], frameA[2], frameA[3]);
          ctx.restore();
        } else {
          ctx.drawImage(a, frameA[0], frameA[1], frameA[2], frameA[3]);
        }
      }
      if (a && b && !low) drawHandle(ctx, view.x + view.w * split);
    },

    pointerDown(pointer, node) {
      const [px, py] = local(pointer.eDown, node);
      for (let at = 0; at < 2; at += 1) {
        const box = nav[at];
        if (!box.shown) continue;
        const step = contains(box.prev[0], box.prev[1], box.prev[2], box.prev[3], px, py) ? -1
          : contains(box.next[0], box.next[1], box.next[2], box.next[3], px, py) ? 1 : 0;
        if (!step) continue;
        pointer.onClick = () => {
          const next = index[at] + step;
          if (next >= 0 && next < counts[at]) {
            index[at] = next;
            node.setDirtyCanvas(true, false);
          }
        };
        return true;
      }
      if (!contains(view.x, view.y, view.w, view.h, px, py) || view.w <= 0) return false;
      const follow = (event) => {
        split = clamp((local(event, node)[0] - view.x) / view.w, 0, 1);
        node.setDirtyCanvas(true, false);
      };
      follow(pointer.eDown);
      pointer.onDrag = follow;
      pointer.onClick = () => {};
      return true;
    },
  };
}

export { make };
