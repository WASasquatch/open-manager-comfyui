import { API } from "./base.mjs";
import { el, collapsible, countNote } from "./ui.mjs";
import { panelSetting } from "./settings.mjs";

function galleryUrl(entry, meta) {
  const lower = entry.toLowerCase();
  if (lower.startsWith("http://") || lower.startsWith("https://")) return entry;
  const query = new URLSearchParams({
    repo: meta.repository || "",
    branch: meta.default_branch || "",
    path: entry,
  });
  return `${API}/gallery-image?${query}`;
}

function buildGallery(meta, entries) {
  const thumb = Math.max(80, Math.min(320, Math.round(Number(panelSetting("openManager.galleryThumb", 120)) || 120)));
  const box = collapsible("Gallery", entries, (entry) => {
    const cell = el("button", "om-gal-cell");
    cell.type = "button";
    cell.title = entry;
    cell._url = galleryUrl(entry, meta);
    cell._label = entry.split("/").pop() || entry;
    const moving = isMovingMedia(entry);
    const img = moving ? el("video", "om-gal-img") : el("img", "om-gal-img");
    if (moving) {
      img.muted = true;
      img.loop = true;
      img.playsInline = true;
      img.preload = "metadata";
      cell.onmouseenter = () => { img.play?.().catch(() => {}); };
      cell.onmouseleave = () => { try { img.pause(); img.currentTime = 0; } catch {} };
    } else {
      img.loading = "lazy";
      img.decoding = "async";
      img.alt = cell._label;
    }
    img.src = cell._url;
    img.onerror = () => {
      cell.classList.add("om-gal-dead");
      const fold = cell.closest("details");
      const shown = fold?.querySelectorAll(".om-gal-cell:not(.om-gal-dead)").length ?? 0;
      const said = fold?.querySelector(".om-panel-note");
      if (said) said.textContent = countNote(shown, "image");
    };
    cell.appendChild(img);
    cell.onclick = () => {
      const fold = cell.closest("details");
      const live = [...fold.querySelectorAll(".om-gal-cell:not(.om-gal-dead)")];
      openLightbox(live.map((c) => ({ url: c._url, label: c._label })), Math.max(0, live.indexOf(cell)));
    };
    return cell;
  }, { listClass: "om-gal", note: countNote(entries.length, "image"),
       open: panelSetting("openManager.galleryExpanded", false) === true });
  box.querySelector(".om-gal").style.setProperty("--om-gal-thumb", `${thumb}px`);
  return box;
}

function isMovingMedia(url) {
  return /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(String(url || ""));
}

function openLightbox(items, index) {
  if (!items.length) return;
  let at = index;
  const back = el("div", "om-lb");
  const figure = el("figure", "om-lb-fig");
  const caption = el("figcaption", "om-lb-cap");
  let media = el("img", "om-lb-img");
  figure.appendChild(media);
  figure.appendChild(caption);
  back.appendChild(figure);

  const show = (to) => {
    at = (to + items.length) % items.length;
    const url = items[at].url;
    const moving = isMovingMedia(url);
    if (moving !== (media.tagName === "VIDEO")) {
      const next = moving ? el("video", "om-lb-img") : el("img", "om-lb-img");
      if (media.tagName === "VIDEO") { try { media.pause(); } catch {} }
      media.replaceWith(next);
      media = next;
    }
    if (moving) {
      media.controls = true;
      media.loop = true;
      media.playsInline = true;
      media.preload = "metadata";
    } else {
      media.alt = items[at].label;
    }
    media.src = url;
    if (moving) media.play?.().catch(() => {});
    caption.textContent = items.length > 1
      ? `${items[at].label} · ${at + 1} of ${items.length}`
      : items[at].label;
  };

  const previous = document.activeElement;
  const close = () => {
    document.removeEventListener("keydown", onKey, true);
    if (media.tagName === "VIDEO") { try { media.pause(); } catch {} }
    back.remove();
    try { previous?.focus(); } catch {}
  };
  const onKey = (event) => {
    if (event.key === "Escape") close();
    else if (event.key === "ArrowRight" && items.length > 1) show(at + 1);
    else if (event.key === "ArrowLeft" && items.length > 1) show(at - 1);
    else return;
    event.preventDefault();
    event.stopPropagation();
  };
  document.addEventListener("keydown", onKey, true);

  const button = (cls, text, fn) => {
    const b = el("button", `om-lb-nav ${cls}`, text);
    b.type = "button";
    b.onclick = (event) => { event.stopPropagation(); fn(); };
    back.appendChild(b);
    return b;
  };
  if (items.length > 1) {
    button("om-lb-prev", "‹", () => show(at - 1));
    button("om-lb-next", "›", () => show(at + 1));
  }
  const closer = button("om-lb-close", "×", close);
  closer.title = "Close (Esc)";

  back.onclick = (event) => { if (event.target === back || event.target === figure) close(); };
  document.body.appendChild(back);
  show(index);
  closer.focus();
}

export { galleryUrl, buildGallery };
