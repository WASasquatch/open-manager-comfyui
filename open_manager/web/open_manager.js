import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { nodeTint, registerThemes, repairLinkMode, watchThemeExtras } from "./themes.js";

const API = "/open_manager/v1/api";

const ICON_TAB = new URL("./discovery.svg", import.meta.url).href;

const STATUS_COLOUR = {
  active: "#3fb950",
  pending: "#d29922",
  flagged: "#d29922",
  banned: "#f85149",
  deleted: "#8b949e",
  unknown: "#8b949e",
};

const SEVERITY_COLOUR = {
  critical: "#f85149",
  caution: "#d29922",
  note: "#8b949e",
};

//: Where our surfaces sit, measured against ComfyUI's own: canvas menu 999, topbar 1001,
//: canvas controls 1200, dialogs 1701 and 1702, toasts 10000, node tooltip 99999.
//:
//: The host's dialogs win. A ComfyUI settings dialog is the reader answering ComfyUI rather
//: than us, and a window of ours over it is one they cannot get out from under. So the band
//: ends below 1701, and starts above 1200 so a window still covers the canvas controls.
const FLOAT_Z = 1300;
const FLOAT_Z_TOP = 1399;

//: Modals over windows, menus over both, all three under the host's dialogs. Toasts and the
//: lightbox stay above: ComfyUI puts its own toasts at 10000, over its settings dialog, and a
//: progress line that hides whenever a dialog opens is a progress line nobody sees.
const MODAL_Z = 1400;
const MENU_Z = 1450;

//: How long a read may take before it is worth saying so, in milliseconds.
const LOADING_GRACE = 180;

const style = document.createElement("style");
style.textContent = `
/* Chrome follows the active ComfyUI theme; status and licence colours stay fixed. */
:root {
  --om-bg: var(--comfy-menu-bg, #16181d);
  --om-surface: var(--comfy-input-bg, #1b1f24);
  --om-input: var(--comfy-input-bg, #0d1117);
  --om-border: var(--border-color, #30363d);
  --om-hover: var(--content-hover-bg, #30363d);
  --om-text: var(--fg-color, #e6edf3);
  --om-text-2: var(--input-text, #adbac7);
  --om-muted: var(--descrip-text, #8b949e);
  /* Scrollbar thumb. Follows the theme's muted text, which is chosen to read against the
     panel background, so it stays visible in light palettes as well as dark ones. */
  --om-scroll: var(--descrip-text, #8b949e);
}
.om-backdrop {
  position: fixed; inset: 0; background: rgba(0,0,0,.65);
  display: flex; align-items: center; justify-content: center; z-index: ${MODAL_Z};
}
/* Width and height follow the viewport rather than a fixed breakpoint. */
.om-dialog {
  position: relative;
  width: min(75vw, 2200px); height: min(84vh, 1500px);
  background: var(--om-bg); color: var(--om-text); border: 1px solid var(--om-border); border-radius: 10px;
  display: flex; flex-direction: column; overflow: hidden;
  box-shadow: var(--om-shadow, none);
  font: var(--om-text-size, 13px)/1.5 system-ui, sans-serif;
}
.om-x { position: absolute; top: 8px; right: 12px; z-index: 2;
  background: none; border: none; color: var(--om-muted); font-size: 26px; line-height: 1;
  cursor: pointer; padding: 2px 6px; }
.om-x:hover { color: var(--om-text); }
/* Banner left, metadata inline to its right. Registry banners run from wide to portrait,
   so the whole banner is fit inside its box rather than cropped. */
.om-hero { display: flex; gap: 18px; padding: 16px 20px; border-bottom: 1px solid var(--om-border);
  align-items: flex-start; }
.om-banner { flex: none; width: 460px; max-width: 40%; height: 200px;
  object-fit: contain; object-position: left center; display: block;
  background: var(--om-input); border-radius: 8px; }
.om-hero-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 12px; }
.om-title-row { display: flex; gap: 12px; align-items: center; padding-right: 30px; }
.om-head { padding: 16px 20px; border-bottom: 1px solid var(--om-border); display: flex;
  gap: 12px; align-items: center; }
.om-blocked { padding: 2px 9px; border-radius: 999px; font-size: 11px; font-weight: 600;
  text-transform: uppercase; color: var(--om-muted); border: 1px solid var(--om-border); }
.om-icon { width: 44px; height: 44px; border-radius: 8px; object-fit: cover; background: var(--om-input); flex: none; }
.om-title { font-size: 19px; font-weight: 600; }
.om-sub { color: var(--om-muted); }
.om-stats { display: flex; gap: 22px; }
.om-stat b { display: block; font-size: 16px; }
.om-stat span { color: var(--om-muted); font-size: 11px; text-transform: uppercase; }
.om-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%;
  margin-left: 6px; vertical-align: middle; }
.om-btn.installing { background: #1f6feb; border-color: #388bfd; color: #fff; }
.om-btn.installed { background: #238636; border-color: #2ea043; color: #fff; }
.om-btn.flagged { background: #9e6a00; border-color: #d29922; color: #fff; }
.om-btn.banned { background: #a5261d; border-color: #f85149; color: #fff; }
.om-btn.om-star.om-starred { background: #3a2d00; border-color: #d29922; color: #f0c14b; }
.om-toasts { position: fixed; right: 16px; bottom: 16px; z-index: 10001;
  display: flex; flex-direction: column; gap: 8px; align-items: flex-end; }
.om-toast { background: var(--om-surface); color: var(--om-text); border: 1px solid var(--om-border);
  border-left: 3px solid #388bfd; border-radius: 8px; padding: 10px 14px;
  font: 13px/1.4 system-ui, sans-serif; max-width: 420px; box-shadow: 0 6px 20px rgba(0,0,0,.4); }
.om-toast-ok { border-left-color: #2ea043; }
.om-toast-warn { border-left-color: #d29922; }
.om-restart { display: flex; gap: 12px; align-items: center; }
.om-restart .om-btn { flex: none; }
.om-note { background: var(--om-bg); color: var(--om-text); border: 1px solid var(--om-border); border-radius: 10px;
  padding: 18px 20px; width: min(90vw, 460px); font: 13px/1.5 system-ui, sans-serif;
  display: flex; flex-direction: column; gap: 12px; }
.om-note-title { font-size: var(--om-title-size, 15px); font-weight: 600; }
.om-note-body { color: var(--om-text-2); white-space: pre-wrap; }
.om-note-foot { display: flex; gap: 10px; justify-content: flex-end; }
/* Main button and caret read as one control: the button keeps its status colour and rounds
   only on the left, the caret is a neutral surface and rounds only on the right. */
.om-ictl { display: inline-flex; align-items: stretch; }
.om-ictl > .om-btn:not(:last-child) { border-top-right-radius: 0; border-bottom-right-radius: 0;
  border-right: none; }
/* border-left follows border-color, which would otherwise reset the divider it sets. */
.om-ictl .om-btn.om-caret { margin-left: 0; padding: 6px 9px; font-size: 11px; line-height: 1;
  border-top-left-radius: 0; border-bottom-left-radius: 0;
  background: var(--om-border); border-color: var(--om-border); color: var(--om-text-2);
  border-left: 1px solid rgba(1, 4, 9, .4); }
.om-ictl .om-btn.om-caret:hover { background: var(--om-hover); }
/* Hover fills both halves with one colour, so the divider takes the control's accent to
   stay visible. */
.om-ictl:hover > .om-btn.om-caret { border-left-color: var(--om-muted); }
.om-ictl:hover > .om-btn.om-caret.installed { border-left-color: #2ea043; }
.om-ictl:hover > .om-btn.om-caret.installing { border-left-color: #388bfd; }
.om-ictl:hover > .om-btn.om-caret.flagged { border-left-color: #d29922; }
.om-ictl:hover > .om-btn.om-caret.banned { border-left-color: #f85149; }
.om-menu { position: fixed; z-index: ${MENU_Z}; min-width: 150px; background: var(--om-surface);
  border: 1px solid var(--om-border); border-radius: 8px; padding: 4px;
  box-shadow: 0 8px 24px rgba(0,0,0,.5); font: 13px/1.5 system-ui, sans-serif; }
.om-menu-item { padding: 7px 12px; border-radius: 6px; cursor: pointer; color: var(--om-text); }
.om-menu-item:hover { background: var(--om-border); }
.om-menu-danger { color: #f85149; }
.om-side-ictl .om-btn { padding: 5px 12px; font-size: 12px; }
.om-body { flex: 1; min-height: 0; overflow: auto; padding: 16px 20px; }
/* The header sits inside the scrolling body; the negative margin pulls it back out to the
   dialog's edges so its divider still spans the full width. */
.om-body > .om-hero { margin: -16px -20px 16px; }
.om-notice { border-left: 3px solid #d29922; background: #1c1a12; padding: 10px 14px; margin-bottom: 14px; }
.om-release { border-left: 3px solid #388bfd; background: var(--om-surface); padding: 10px 14px;
  margin-bottom: 14px; border-radius: 0 7px 7px 0; }
.om-release-body { color: var(--om-text-2); margin-top: 4px; white-space: pre-wrap;
  overflow-wrap: anywhere; }
.om-actions { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.om-chips { display: flex; gap: 8px; flex-wrap: wrap; }
.om-chip { font-size: 11px; color: var(--om-text-2); background: var(--om-surface); border: 1px solid var(--om-border);
  border-radius: 999px; padding: 2px 10px; }
.om-chip b { color: var(--om-muted); font-weight: 600; }
.om-tags { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.om-tag { font-size: 11px; line-height: 18px; height: 18px; color: #539bf5; background: #12253d;
  border-radius: 4px; padding: 0 8px; display: inline-flex; align-items: center; }
.om-readme { margin-top: 16px; }
.om-readme .om-chips { margin-bottom: 8px; }
.om-readme .om-tags { margin-bottom: 14px; }
.om-tag-go { font: inherit; font-size: 11px; border: none; cursor: pointer; }
.om-tag-go:hover { filter: brightness(1.35); }
.om-readme-status { color: var(--om-muted); }
/* Centred, and set down from the top rather than pinned to it: a result that is on its way
   should look like the page is working, not like a line of text that failed to become one. */
.om-loading { display: flex; flex-direction: column; align-items: center; gap: 12px;
  padding: 48px 16px 40px; color: var(--om-muted); }
.om-loading-spin { width: 26px; height: 26px; border-radius: 50%;
  border: 2px solid var(--om-border); border-top-color: #539bf5;
  animation: om-spin .8s linear infinite; }
.om-loading-text { font-size: 13px; letter-spacing: .02em; }
.om-loading-text::after { content: ""; animation: om-ellipsis 1.6s steps(4, end) infinite; }
@keyframes om-spin { to { transform: rotate(360deg); } }
@keyframes om-ellipsis { 0% { content: ""; } 25% { content: "."; }
  50% { content: ".."; } 75% { content: "..."; } }
/* Movement is decoration here; the words carry the meaning. */
@media (prefers-reduced-motion: reduce) {
  .om-loading-spin { animation: none; border-top-color: var(--om-border); }
  .om-loading-text::after { content: "..."; animation: none; }
}
/* Capped for reading rather than filled to the dialog: a line that runs the whole width of
   a wide panel is hard to follow, which is the width GitHub settles on too. */
.om-readme-body { line-height: 1.6; overflow-wrap: anywhere; max-width: 1080px; margin-inline: auto; }
.om-readme-body img { max-width: 100%; height: auto; }
.om-readme-body pre { background: var(--om-input); padding: 10px; border-radius: 6px; overflow: auto; }
.om-readme-body h1, .om-readme-body h2 { border-bottom: 1px solid var(--om-border); padding-bottom: 4px; }
.om-readme-body a { color: #539bf5; }
/* A link that opens here rather than leaving is marked as such, so the difference is visible
   before it is clicked. */
.om-readme-body a.om-doc-link::after { content: " \\2197"; opacity: .55; font-size: .85em; }
.om-doc-trail { display: flex; align-items: center; gap: 10px; margin: 0 0 16px;
  padding-bottom: 10px; border-bottom: 1px solid var(--om-border); }
.om-doc-back { padding: 3px 10px; font-size: 12px; }
.om-doc-where { color: var(--om-muted); font-size: 12px; overflow-wrap: anywhere; }
.om-wf-shot { width: 56px; height: 32px; object-fit: cover; border-radius: 4px;
  flex: none; background: var(--om-surface); }
.om-trusted { flex: none; font-size: 10px; padding: 1px 5px; border-radius: 999px;
  color: #3fb950; border: 1px solid #3fb950; white-space: nowrap; }
.om-repo-link {
  flex: none; text-decoration: none; color: var(--om-muted); font-size: 12px;
  padding: 0 3px; border-radius: 4px; line-height: 1;
}
.om-repo-link:hover { color: var(--om-text); background: var(--om-hover); }
/* The mark takes the colour of the control it sits in, so it reads as part of the interface
   rather than as a pasted-in logo, and follows every theme without a second asset. */
.om-gh-mark { display: block; }
.om-repo-link { display: inline-flex; align-items: center; }
.om-icon-btn { display: inline-flex; align-items: center; justify-content: center;
  padding: 6px 10px; text-decoration: none; box-sizing: border-box; }
a.om-btn { text-decoration: none; color: var(--om-text); }
.om-gh-fallback { font-size: 13px; line-height: 1; }
/* The Comfy mark keeps its own colour: it is a brand asset, not an interface glyph, so it is
   the one icon here that does not follow the theme. */
.om-comfy-mark { display: block; width: 14px; height: 14px; }
.om-icon-btn .om-comfy-mark { width: 16px; height: 16px; }
.om-registry-link:hover { background: var(--om-hover); }
/* Long URLs need breaking anywhere, but the same rule inside a table breaks mid-word and
   collapses every column, which is why READMEs rendered here looked squished against
   GitHub. Tables wrap on word boundaries and scroll sideways instead. */
.om-readme-body table {
  overflow-wrap: normal; word-break: normal; border-collapse: collapse;
  display: block; width: max-content; max-width: 100%; overflow-x: auto; margin: 12px 0;
}
.om-readme-body th, .om-readme-body td {
  border: 1px solid var(--om-border); padding: 6px 10px; text-align: left;
  overflow-wrap: normal; word-break: normal;
}
.om-readme-body th { background: var(--om-surface); font-weight: 600; }
.om-readme-body tr:nth-child(even) td { background: color-mix(in srgb, var(--om-surface) 45%, transparent); }
/* Media the README linked, shown in place of the bare URL. */
.om-readme-media { max-width: 100%; height: auto; border-radius: 6px; margin: 12px 0; display: block; }
/* A link standing in for media that could not be shown, with the reason beside it. */
.om-readme-gone { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap;
  margin: 12px 0; padding: 8px 12px; border-left: 3px solid var(--om-border);
  background: var(--om-surface); border-radius: 0 6px 6px 0; }
.om-readme-gone-note { color: var(--om-muted); font-size: 12px; }
/* Honour the alignment attribute a README uses, which the markdown renderer may pass
   through but browsers no longer style on their own. */
.om-readme-body [align="center"] { text-align: center; }
.om-readme-body [align="right"] { text-align: right; }
.om-readme-body div[align="center"] > img,
.om-readme-body p[align="center"] > img { margin-inline: auto; }
.om-row {
  display: grid; grid-template-columns: 150px 110px 200px 1fr auto;
  gap: 12px; align-items: center; padding: 10px 12px;
  border: 1px solid var(--om-border); border-radius: 8px; margin-bottom: 8px; background: var(--om-surface);
}
.om-versions { border: 1px solid var(--om-border); border-radius: 8px; max-height: 42vh; overflow-y: auto; background: var(--om-bg); }
/* A section that shows only its header bar when closed. */
.om-panel { border: 1px solid var(--om-border); border-radius: 8px; background: var(--om-bg);
  overflow: hidden; margin: 12px 0; }
.om-panel-head { display: flex; align-items: center; gap: 10px; padding: 9px 12px;
  background: var(--om-surface); cursor: pointer; user-select: none; list-style: none;
  border-bottom: 1px solid transparent; }
.om-panel-head::-webkit-details-marker { display: none; }
.om-panel-head:hover { background: var(--om-hover); }
.om-panel[open] .om-panel-head { border-bottom-color: var(--om-border); }
.om-panel-title { font-weight: 600; flex: none; font-size: var(--om-title-size, 15px); }
.om-panel-note { flex: 1; min-width: 0; color: var(--om-muted); font-size: 12px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.om-panel-chevron { flex: none; color: var(--om-muted); transition: transform .15s ease; }
.om-panel[open] .om-panel-chevron { transform: rotate(180deg); }
/* The panel already draws the border, so the list inside drops its own. */
.om-panel .om-versions { border: none; border-radius: 0; background: transparent; }
.om-versions .om-row { padding-right: 10px; }
.om-versions .om-row { border: none; border-bottom: 1px solid var(--om-surface); border-radius: 0; margin: 0; background: transparent; }
.om-versions .om-row:last-child { border-bottom: none; }
/* A version the publisher no longer recommends recedes, and comes back the moment the pointer
   is on it. Nothing is disabled: a deprecated version still installs, and a reader looking
   straight at the row should read it at full strength. */
.om-versions .om-row-deprecated { opacity: .55; transition: opacity .12s ease; }
.om-versions .om-row-deprecated:hover,
.om-versions .om-row-deprecated:focus-within { opacity: 1; }
.om-ver { font-weight: 600; font-family: ui-monospace, monospace; }
.om-badge { padding: 2px 9px; border-radius: 999px; font-size: 11px; font-weight: 600;
  text-transform: uppercase; color: var(--om-input); display: inline-block; }
.om-marks { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; min-width: 0; }
/* Amber, not red: the version installs, and the declaration may well be the publisher's
   mistake rather than a real limit. */
.om-ver-flag { margin-left: 6px; color: #d29922; font-weight: 700; cursor: help; }
.om-chip.om-chip-differs { border-color: #d29922; }
.om-why { color: var(--om-muted); }
.om-btn { background: var(--om-surface); color: var(--om-text); border: 1px solid var(--om-border);
  border-radius: 6px; padding: 6px 16px; cursor: pointer; font-size: 13px; }
.om-btn:hover { background: var(--om-border); }
.om-btn.om-go { background: #238636; border-color: #2ea043; }
.om-btn.om-danger { background: #a5261d; border-color: #f85149; }
.om-close { margin-left: auto; }
.om-foot { padding: 12px 20px; border-top: 1px solid var(--om-border); display: flex;
  gap: 10px; align-items: center; color: var(--om-muted); }
.om-find { border: 1px solid var(--om-border); border-radius: 8px; padding: 12px 14px; margin-bottom: 10px; }
.om-find h4 { margin: 0 0 4px; font-size: 14px; }
/* A finding long enough to need a second paragraph gets one. Wrapping is unchanged; only a
   blank line an author wrote deliberately survives, which is what stops a six-line warning
   reading as one undifferentiated block. */
.om-find-detail { white-space: pre-line; }
.om-ev { font-family: ui-monospace, monospace; font-size: 11px; color: var(--om-muted); margin-top: 6px; }
.om-ack { border-left: 3px solid #f85149; background: #1c1214; padding: 12px 14px; margin: 12px 0; }
.om-state { display: flex; gap: 8px; align-items: center; padding: 9px 14px; margin: 4px 0;
  border: 1px solid var(--om-border); border-left: 3px solid #3fb950; border-radius: 8px;
  background: #131a14; font-weight: 600; }
.om-state-mark { color: #3fb950; font-weight: 700; }
.om-deps { border: 1px solid var(--om-border); border-radius: 8px; margin-top: 10px; overflow: hidden; }
.om-deps-head { padding: 7px 12px; background: var(--om-surface); font-weight: 600; font-size: 12px;
  border-bottom: 1px solid var(--om-border); }
.om-dep { display: flex; justify-content: space-between; gap: 12px; padding: 5px 12px;
  border-bottom: 1px solid var(--om-surface); font-size: 12px; }
.om-dep:last-child { border-bottom: none; }
.om-dep-name { font-family: ui-monospace, monospace; color: var(--om-text-2); overflow-wrap: anywhere; }
.om-dep-status { flex: none; white-space: nowrap; }
`;
document.head.appendChild(style);

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};

// Pack, registry and advisory URLs all reach here. `javascript:` passed to window.open or
// an href runs in ComfyUI's origin, so nothing is opened unchecked.
const safeUrl = (value) => {
  const text = String(value ?? "").trim();
  return /^https?:\/\//i.test(text) ? text : "";
};

const openUrl = (value) => {
  const url = safeUrl(value);
  if (url) window.open(url, "_blank", "noopener,noreferrer");
  else if (String(value ?? "").trim()) {
    notify("Link not opened", "This link is not an http(s) URL, so it was not opened.");
  }
};

const badge = (status) => {
  const node = el("span", "om-badge", status);
  node.style.background = STATUS_COLOUR[status] || STATUS_COLOUR.unknown;
  return node;
};

// `dismiss` is for a backdrop whose closing has to do more than remove the node: a panel has
// its size and place to write away and an onClose to run. Defaults to removing it, which is
// all a plain dialog needs.
function closeOn(backdrop, dismiss) {
  const shut = dismiss || (() => backdrop.remove());
  // A click is dispatched on the nearest ancestor shared by the press and the release, so a
  // drag that starts inside the dialog and finishes outside it reports the backdrop as the
  // target. Selecting text or moving a scrollbar would then shut the window. Both ends of
  // the click have to land on the backdrop for it to count as clicking away.
  let pressedAway = false;
  backdrop.addEventListener("mousedown", (event) => {
    pressedAway = event.target === backdrop;
  });
  backdrop.addEventListener("click", (event) => {
    if (pressedAway && event.target === backdrop) shut();
    pressedAway = false;
  });
  const onKey = (event) => {
    // Closed by other means, so the listener lets go rather than outliving its dialog.
    if (!backdrop.isConnected) {
      window.removeEventListener("keydown", onKey);
      return;
    }
    if (event.key === "Escape") {
      shut();
      window.removeEventListener("keydown", onKey);
    }
  };
  window.addEventListener("keydown", onKey);
}

// A clean state, asserted with a checkmark rather than a sentence.
const stateRow = (label) => {
  const row = el("div", "om-state");
  row.appendChild(el("span", "om-state-mark", "✓"));
  row.appendChild(el("span", null, label));
  return row;
};

const findingCard = (finding) => {
  const card = el("div", "om-find");
  card.style.borderLeft = `3px solid ${SEVERITY_COLOUR[finding.severity] || "var(--om-muted)"}`;
  const title = el("h4", null, finding.title);
  title.style.color = SEVERITY_COLOUR[finding.severity] || "var(--om-text)";
  card.appendChild(title);
  card.appendChild(el("div", "om-find-detail", finding.detail));
  if (finding.evidence?.length) {
    for (const line of finding.evidence) {
      card.appendChild(el("div", "om-ev", line));
    }
  }
  if (finding.reference) {
    const link = el("a", null, finding.reference);
    link.href = safeUrl(finding.reference) || "#";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.style.cssText = "color:#58a6ff;font-size:11px";
    card.appendChild(link);
  }
  return card;
};

// What the version would change in this environment. The pip dry run is server-side and
// is fetched after the dialog is on screen.
async function appendImpact(packId, version, slot, gate) {
  slot.replaceChildren(el("div", "om-why", "Checking dependencies..."));
  let report;
  try {
    const answer = await api.fetchApi(
      `${API}/impact/${encodeURIComponent(packId)}/${encodeURIComponent(version)}`
    );
    report = await answer.json();
    if (!answer.ok) throw new Error(report.detail || `HTTP ${answer.status}`);
  } catch (error) {
    slot.replaceChildren(el("div", "om-why", `Dependency impact unavailable: ${error.message}`));
    return;
  }

  slot.replaceChildren();
  if (report.additive_only) {
    slot.appendChild(stateRow("No dependency changes"));
  } else {
    for (const finding of report.findings || []) slot.appendChild(findingCard(finding));
  }
  if (report.dependencies?.length) slot.appendChild(dependencyList(report.dependencies));
  // A core downgrade or an ABI-breaking major change relabels the confirmation.
  const replacements = report.replacements || [];
  if (replacements.some((item) => item.abi)) {
    gate.textContent = "Install anyway (breaks binary packages)";
    gate.className = "om-btn om-danger";
  } else if (replacements.some((item) => item.core && item.direction === "downgrade")) {
    gate.textContent = "Downgrade dependencies and install";
    gate.className = "om-btn om-danger";
  }
}

// The pack's declared requirements, each checked against the environment and ComfyUI.
const DEP_STATE = {
  satisfied: { label: "installed", color: "#3fb950" },
  missing: { label: "not installed", color: "var(--om-muted)" },
  conflict: { label: "conflict", color: "#f85149" },
  vcs: { label: "from git URL", color: "#d29922" },
  unparsed: { label: "unreadable", color: "var(--om-muted)" },
};

function dependencyList(dependencies) {
  const wrap = el("div", "om-deps");
  wrap.appendChild(el("div", "om-deps-head", `Requirements (${dependencies.length})`));
  for (const dep of dependencies) {
    const state = DEP_STATE[dep.status] || DEP_STATE.unparsed;
    const row = el("div", "om-dep");
    row.appendChild(el("span", "om-dep-name", dep.name + (dep.spec ? " " + dep.spec : "")));
    const right = el("span", "om-dep-status");
    let text = state.label;
    if (dep.status === "satisfied" || dep.status === "conflict") text = `have ${dep.installed} · ${state.label}`;
    if (dep.status === "conflict" && dep.core) text += " with ComfyUI";
    right.textContent = text;
    right.style.color = (dep.status === "conflict" && dep.core) ? "#f85149" : state.color;
    row.appendChild(right);
    wrap.appendChild(row);
  }
  return wrap;
}

// Compares two dotted version strings numerically, falling back to string order.
function compareVersions(a, b) {
  const pa = String(a).split(".");
  const pb = String(b).split(".");
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const x = parseInt(pa[i] ?? "0", 10);
    const y = parseInt(pb[i] ?? "0", 10);
    if (Number.isNaN(x) || Number.isNaN(y)) return String(a).localeCompare(String(b));
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

// Describes moving from an installed version to a chosen one, or null when there is no
// installed version or it is the same.
function versionSwitch(installed, chosen) {
  if (!installed || installed === "present" || installed === chosen) return null;
  const cmp = compareVersions(chosen, installed);
  return { from: installed, to: chosen, direction: cmp < 0 ? "downgrade" : cmp > 0 ? "upgrade" : "reinstall" };
}

// Confirmation. Findings are shown in full; both buttons are always present.
function confirmInstall(packId, entry, change) {
  return new Promise((resolve) => {
    const backdrop = el("div", "om-backdrop");
    const dialog = el("div", "om-dialog");
    dialog.style.width = "min(90vw, 900px)";
    dialog.style.height = "auto";
    dialog.style.maxHeight = "90vh";

    const head = el("div", "om-head");
    head.appendChild(el("div", "om-title", `Install ${packId} ${entry.version}`));
    head.appendChild(badge(entry.status));
    dialog.appendChild(head);

    const body = el("div", "om-body");
    const assessment = entry.assessment || { findings: [], acknowledgement: "" };

    // A version switch replaces what is installed, and a downgrade is stated as one.
    if (change) {
      const banner = el("div", change.direction === "downgrade" ? "om-ack" : "om-notice");
      const verb = { downgrade: "Downgrade", upgrade: "Upgrade", reinstall: "Reinstall" }[change.direction];
      banner.appendChild(el("b", null, `${verb} from ${change.from} to ${change.to}`));
      banner.appendChild(el("div", null, `The installed version ${change.from} is removed first, then ${change.to} is installed.`));
      body.appendChild(banner);
    }

    if (!assessment.findings.length) {
      body.appendChild(stateRow("All clear"));
    }
    for (const finding of assessment.findings) {
      body.appendChild(findingCard(finding));
    }

    body.appendChild(el("h4", null, "What this would change here"));
    const impactSlot = el("div");
    body.appendChild(impactSlot);

    if (assessment.acknowledgement) {
      body.appendChild(el("div", "om-ack", assessment.acknowledgement));
    }
    dialog.appendChild(body);

    const label = change
      ? { downgrade: "Downgrade and install", upgrade: "Upgrade", reinstall: "Reinstall" }[change.direction]
      : (assessment.findings.length ? "Install anyway" : "Install");
    const danger = change?.direction === "downgrade" || assessment.severity === "critical";
    const foot = el("div", "om-foot");
    const cancel = el("button", "om-btn", "Cancel");
    const go = el("button", `om-btn ${danger ? "om-danger" : "om-go"}`, label);
    cancel.onclick = () => { backdrop.remove(); resolve(false); };
    go.onclick = () => { backdrop.remove(); resolve(true); };
    foot.appendChild(cancel);
    foot.appendChild(go);
    dialog.appendChild(foot);

    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);
    // Dismissing counts as cancelling. Without this the promise is never settled and
    // the caller waits for an answer that cannot arrive -- which is how a guarded
    // action stayed guarded after an Escape and refused to run again.
    closeOn(backdrop, () => { backdrop.remove(); resolve(false); });

    appendImpact(packId, entry.version, impactSlot, go);
  });
}

// --- toasts -------------------------------------------------------------------------

function toastHost() {
  let host = document.querySelector(".om-toasts");
  if (!host) { host = el("div", "om-toasts"); document.body.appendChild(host); }
  return host;
}

function toast(message, opts = {}) {
  const node = el("div", `om-toast${opts.kind ? " om-toast-" + opts.kind : ""}`, message);
  toastHost().appendChild(node);
  let timer = opts.sticky ? 0 : setTimeout(() => node.remove(), opts.duration || 4000);
  return {
    set: (text) => { node.textContent = text; },
    kind: (k) => { node.className = `om-toast om-toast-${k}`; },
    settle: (text, kind, duration = 6000) => {
      node.textContent = text;
      node.className = `om-toast om-toast-${kind}`;
      clearTimeout(timer);
      timer = setTimeout(() => node.remove(), duration);
    },
    remove: () => { clearTimeout(timer); node.remove(); },
  };
}

// --- restart reminder ---------------------------------------------------------------

let restartToast = null;

// A sticky toast, shown once after files change, offering to restart the server. Installing,
// removing or switching a pack only takes effect after ComfyUI reloads.
function remindRestart() {
  if (restartToast) return;
  const node = el("div", "om-toast om-toast-warn om-restart");
  node.appendChild(el("span", null, "Restart to load the changes."));
  const button = el("button", "om-btn om-go", "Restart server");
  button.onclick = () => restartServer(button);
  node.appendChild(button);
  toastHost().appendChild(node);
  restartToast = node;
}

async function restartServer(button) {
  button.disabled = true;
  button.textContent = "Restarting...";
  try {
    // The content type is what tells the server this came from its own page rather
    // than from another site, so it is sent even though there is nothing to say.
    await api.fetchApi(`${API}/reboot`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
    });
  } catch (error) {
    // The connection drops as the server goes down.
  }
  const started = Date.now();
  const waitForUp = async () => {
    try {
      const answer = await api.fetchApi("/system_stats", { cache: "no-store" });
      if (answer.ok) { location.reload(); return; }
    } catch (error) {
      // still down
    }
    if (Date.now() - started < 180000) {
      setTimeout(waitForUp, 1500);
    } else {
      button.disabled = false;
      button.textContent = "Restart server";
      notify("Restart timed out", "The server did not come back within three minutes. Restart it by hand.");
    }
  };
  // Give the server a moment to actually go down before polling for it to return.
  setTimeout(waitForUp, 3000);
}

// --- modal (replaces window.alert / window.prompt) ----------------------------------

function notify(title, message) {
  const backdrop = el("div", "om-backdrop");
  const box = el("div", "om-note");
  box.appendChild(el("div", "om-note-title", title));
  if (message) box.appendChild(el("div", "om-note-body", message));
  const foot = el("div", "om-note-foot");
  const ok = el("button", "om-btn om-go", "OK");
  ok.onclick = () => backdrop.remove();
  foot.appendChild(ok);
  box.appendChild(foot);
  backdrop.appendChild(box);
  document.body.appendChild(backdrop);
  closeOn(backdrop);
  ok.focus();
}

function askText(title, value = "", actionLabel = "Open") {
  return new Promise((resolve) => {
    const backdrop = el("div", "om-backdrop");
    const box = el("div", "om-note");
    box.appendChild(el("div", "om-note-title", title));
    const input = el("input", "om-search");
    input.value = value;
    input.spellcheck = false;
    box.appendChild(input);
    const foot = el("div", "om-note-foot");
    const cancel = el("button", "om-btn", "Cancel");
    const ok = el("button", "om-btn om-go", actionLabel);
    cancel.onclick = () => { backdrop.remove(); resolve(null); };
    ok.onclick = () => { const v = input.value.trim(); backdrop.remove(); resolve(v || null); };
    foot.appendChild(cancel);
    foot.appendChild(ok);
    box.appendChild(foot);
    backdrop.appendChild(box);
    document.body.appendChild(backdrop);
    // Dismissing counts as cancelling. Without this the promise is never settled and
    // the caller waits for an answer that cannot arrive -- which is how a guarded
    // action stayed guarded after an Escape and refused to run again.
    closeOn(backdrop, () => { backdrop.remove(); resolve(null); });
    input.focus();
    input.addEventListener("keydown", (event) => { if (event.key === "Enter") ok.click(); });
  });
}

function confirmAction(title, message, actionLabel, danger) {
  return new Promise((resolve) => {
    const backdrop = el("div", "om-backdrop");
    const box = el("div", "om-note");
    box.appendChild(el("div", "om-note-title", title));
    if (message) box.appendChild(el("div", "om-note-body", message));
    const foot = el("div", "om-note-foot");
    const cancel = el("button", "om-btn", "Cancel");
    const ok = el("button", `om-btn ${danger ? "om-danger" : "om-go"}`, actionLabel || "OK");
    cancel.onclick = () => { backdrop.remove(); resolve(false); };
    ok.onclick = () => { backdrop.remove(); resolve(true); };
    foot.appendChild(cancel);
    foot.appendChild(ok);
    box.appendChild(foot);
    backdrop.appendChild(box);
    document.body.appendChild(backdrop);
    // Dismissing counts as cancelling. Without this the promise is never settled and
    // the caller waits for an answer that cannot arrive -- which is how a guarded
    // action stayed guarded after an Escape and refused to run again.
    closeOn(backdrop, () => { backdrop.remove(); resolve(false); });
  });
}

// What a decision is about, stated as labelled values rather than described in a sentence.
// Rows whose value is empty are dropped, so a caller can list what it might know without
// checking each one first.
function factList(rows) {
  const list = el("dl", "om-facts");
  for (const [label, value] of rows) {
    if (!value) continue;
    list.appendChild(el("dt", null, label));
    list.appendChild(el("dd", null, value));
  }
  return list;
}

// Like confirmAction but with more than one way to say yes. Resolves the chosen action's
// key, or an empty string where the reader backed out.
function chooseAction(title, message, choices, { wide = false, facts = [] } = {}) {
  return new Promise((resolve) => {
    const backdrop = el("div", "om-backdrop");
    // A choice that names an account carries that name on its button, which does not fit
    // the width a plain yes/no needs.
    const box = el("div", `om-note${wide ? " om-note-wide" : ""}`);
    box.appendChild(el("div", "om-note-title", title));
    if (facts.length) box.appendChild(factList(facts));
    if (message) {
      const body = el("div", "om-note-body", message);
      body.style.whiteSpace = "pre-line";
      box.appendChild(body);
    }
    const foot = el("div", "om-note-foot");
    // With nothing to choose between, this dialog is telling the reader something rather
    // than asking them, and "Cancel" invites them to look for what they just cancelled.
    const cancel = el("button", "om-btn", choices.length ? "Cancel" : "Close");
    cancel.onclick = () => { backdrop.remove(); resolve(""); };
    foot.appendChild(cancel);
    for (const choice of choices) {
      const button = el("button",
        `om-btn ${choice.danger ? "om-danger" : choice.primary ? "om-go" : ""}`, choice.label);
      if (choice.hint) button.title = choice.hint;
      button.onclick = () => { backdrop.remove(); resolve(choice.key); };
      foot.appendChild(button);
    }
    box.appendChild(foot);
    backdrop.appendChild(box);
    document.body.appendChild(backdrop);
    // Dismissing counts as cancelling. Without this the promise is never settled and
    // the caller waits for an answer that cannot arrive -- which is how a guarded
    // action stayed guarded after an Escape and refused to run again.
    closeOn(backdrop, () => { backdrop.remove(); resolve(""); });
  });
}

// --- install control ----------------------------------------------------------------

// A button that moves Install -> Queued -> Installing -> Installed. Once installed and
// withMenu is set, it becomes a split control with a caret opening reinstall / uninstall.
function makeInstallControl({ packId, entry, rowsRoot, withMenu, onInstall, items }) {
  const wrap = el("span", "om-ictl");
  const control = { el: wrap };
  wrap._control = control;

  const button = (text, cls, onclick) => {
    const b = el("button", cls, text);
    if (onclick) b.onclick = onclick;
    else b.disabled = true;
    return b;
  };
  const caretFor = (cls) => {
    const caret = el("button", `om-btn ${cls} om-caret`, "▾");
    caret.title = "Options";
    caret.onclick = (event) => {
      event.stopPropagation();
      openRowMenu(caret, { packId, entry, control, rowsRoot, items });
    };
    return caret;
  };

  control.setInstall = (verb) => {
    // `verb` names the move where one is being made: installing 3.1.0 over 3.2.0 is a
    // downgrade, and calling it "Install" hides the thing worth knowing.
    const label = button(verb || "Install", "om-btn",
      onInstall || (() => install({ packId, entry, control, rowsRoot })));
    if (verb) label.title = `${verb} to ${entry?.version || ""}`.trim();
    if (!withMenu || !items?.length) { wrap.replaceChildren(label); return; }
    wrap.replaceChildren(label, caretFor(""));
  };
  control.setQueued = () => wrap.replaceChildren(button("Queued", "om-btn"));
  control.setInstalling = () => wrap.replaceChildren(button("Installing", "om-btn installing"));
  control.setInstalled = () => {
    const label = button("Installed", "om-btn installed");
    if (!withMenu) { wrap.replaceChildren(label); return; }
    wrap.replaceChildren(label, caretFor("installed"));
  };
  // An update is offered: a one-click primary that installs the newer version, plus the menu.
  control.setUpdate = (target, onUpdate) => {
    const label = button("Update", "om-btn installing", onUpdate);
    label.title = `Update to ${target}`;
    if (!withMenu) { wrap.replaceChildren(label); return; }
    wrap.replaceChildren(label, caretFor("installing"));
  };
  // The installed version's registry status: labelled "Installed" like the rest, coloured
  // amber where the version is flagged and red where it is banned.
  control.setStatusInstalled = (status) => {
    const cls = status === "banned" ? "banned" : status === "flagged" ? "flagged" : "installed";
    const label = button("Installed", `om-btn ${cls}`);
    label.title = `The installed version is ${status} by the registry`;
    if (!withMenu) { wrap.replaceChildren(label); return; }
    wrap.replaceChildren(label, caretFor(cls));
  };
  return control;
}

function openRowMenu(anchor, { packId, entry, control, rowsRoot, items, align = "left" }) {
  const open = document.querySelector(".om-menu");
  if (open) { open.remove(); return; }
  const menu = el("div", "om-menu");
  const item = (text, danger, fn) => {
    const node = el("div", `om-menu-item${danger ? " om-menu-danger" : ""}`, text);
    node.onclick = () => { menu.remove(); fn(); };
    menu.appendChild(node);
  };
  const list = items || [
    { label: "Reinstall", fn: () => install({ packId, entry, control, rowsRoot, overwrite: true }) },
    { label: "Uninstall", danger: true, fn: () => uninstall({ packId, entry, control, rowsRoot }) },
  ];
  for (const it of list) item(it.label, it.danger, it.fn);
  document.body.appendChild(menu);
  placeRowMenu(menu, anchor, align);
  const close = (event) => {
    if (!menu.contains(event.target) && event.target !== anchor) {
      menu.remove();
      document.removeEventListener("mousedown", close);
    }
  };
  setTimeout(() => document.addEventListener("mousedown", close), 0);
}

// A menu hangs below its button, which is fine until the button is at the foot of a panel at
// the foot of the window: there is nothing below to hang into. And a button pinned to the
// right of a card opening a left-aligned menu throws the menu back across the card it belongs
// to. So measure first, then flip or align as the space actually allows.
function placeRowMenu(menu, anchor, align) {
  const rect = anchor.getBoundingClientRect();
  const width = menu.offsetWidth;
  const height = menu.offsetHeight;
  const gap = 4;
  const below = window.innerHeight - rect.bottom;
  const flip = below < height + gap && rect.top > below;
  const left = align === "right" ? rect.right - width : rect.left;
  menu.style.top = `${flip ? Math.max(8, rect.top - height - gap) : rect.bottom + gap}px`;
  menu.style.left = `${Math.max(8, Math.min(left, window.innerWidth - width - 8))}px`;
}

// --- install queue, driven by one progress toast ------------------------------------

// The registry list builds and discards rows as it scrolls, so what a pack is doing belongs
// to the pack rather than to the control that started it. Without this, scrolling past an
// installing row and back would offer Install again while the install was still running.
const installState = new Map();

// What is already on disk, so a row can say so before anything is installed this session.
// installState above records what this session did; this records what it found.
const installedIndex = new Map();

const foldId = (value) => String(value ?? "").trim().toLowerCase().replace(/_/g, "-");

// Index one /installed payload. Keyed every way a row might ask: registry id, pyproject
// name and directory name, because a row only knows the registry's spelling.
// Build the lookup from pack id to the copy on disk.
//
// Several directories can carry the same id: a pack switched off keeps its pyproject, so
// `thing`, `thing.dev.disabled` and `thing.v3.disabled` all answer to `thing`. Taking the last
// one seen meant a row could report the version of a copy that is switched off, and offer to
// switch it on alongside the live one. The copy actually in use wins, and among equals the
// higher version does.
function indexInstalled(packs) {
  installedIndex.clear();
  const better = (candidate, held) => {
    if (!held) return true;
    if (Boolean(held.disabled) !== Boolean(candidate.disabled)) return !candidate.disabled;
    return compareVersions(candidate.version || "", held.version || "") > 0;
  };
  for (const pack of packs || []) {
    for (const key of [pack.registry_id, pack.id, pack.dir]) {
      const folded = foldId(key);
      if (!folded) continue;
      // A directory name is unambiguous, so it always names its own copy; the shared ids are
      // the ones that have to be judged between.
      if (folded === foldId(pack.dir) || better(pack, installedIndex.get(folded))) {
        installedIndex.set(folded, pack);
      }
    }
  }
}

async function loadInstalledIndex() {
  try {
    const answer = await api.fetchApi(`${API}/installed`);
    const data = await answer.json();
    if (answer.ok) indexInstalled(data.packs);
  } catch {
    // Rows fall back to offering Install, which is what they did before.
  }
}

function installedPack(packId) {
  return installedIndex.get(foldId(packId)) || null;
}

// The install control a registry row carries, in whichever view is on screen.
//
// The list, the table and the cards each built this themselves, nine identical lines apiece
// differing only in the class appended at the end. Three copies of a thing that has to agree
// is three chances for it to stop agreeing, which is how the menus drifted apart.
//
// Args:
//   entry: The catalogue entry the row is for.
//   cls: The view's own class for the control.
// Returns:
//   The control, already restored to whatever state its pack is actually in.
//: A leading or trailing "ComfyUI" in a pack name, however its author spelled it. Two names
//: in three carry one, and in a ComfyUI pack manager it is the one part that says nothing:
//: every entry here is a ComfyUI pack. Only the ends are matched -- a name like
//: `Diffusion_pipe_in_ComfyUI_Win` is using the word as a word, and cutting it out of the
//: middle would leave nonsense.
const COMFY_LEAD = /^comfy[\s_-]?ui[\s_.-]+/i;
const COMFY_TRAIL = /[\s_.-]+comfy[\s_-]?ui$/i;

//: What is left has to still be a name. `ComfyUI-J` shortens to "J" and `ComfyUI-988` to
//: "988", which are worse than the originals, so a remainder this short keeps its prefix.
const NAME_FLOOR = 4;

// The name a row should show: the author's, less the word that is true of every pack here.
//
// Args:
//   name: The pack name as published.
// Returns:
//   The name to display, which is the original wherever shortening it would not help.
function shortPackName(name) {
  const text = String(name || "").trim();
  const cut = text.replace(COMFY_LEAD, "").replace(COMFY_TRAIL, "").trim();
  return cut.length >= NAME_FLOOR ? cut : text;
}

// A pack name element showing the shortened name, with the published one on hover.
//
// The full name is what the reader will search for, paste into an issue and compare against
// the registry, so it stays one hover away and is never what gets stored or matched -- only
// what is drawn is shortened.
//
// Args:
//   name: The pack name as published.
//   cls: Class for the element holding it.
// Returns:
//   An element containing the name to show.
function packName(name, cls) {
  const text = String(name || "");
  const shown = shortPackName(text);
  const holder = el("span", cls, shown);
  if (shown !== text) holder.title = text;
  return holder;
}

// Everything known about one published version, as the row says it on hover.
//
// Args:
//   entry: One version from the pack route.
// Returns:
//   Lines of text, or an empty string where there is nothing beyond what the row shows.
function versionFacts(entry) {
  const when = (entry.created_at || "").slice(0, 10);
  const lines = [[entry.version, entry.status, when && `published ${when}`]
    .filter(Boolean).join(" · ")];
  if (entry.deprecated) lines.push("Deprecated by the publisher. It still installs.");
  for (const note of entry.compatibility?.notes || []) {
    if (!note.declared) continue;
    lines.push(note.state === "differs"
      ? `Declares ${note.label} ${note.declared}; this install reports ${note.yours}.`
      : `Declares ${note.label} ${note.declared}.`);
  }
  const deps = (entry.dependencies || []).length;
  if (deps) lines.push(`${deps} requirement${deps === 1 ? "" : "s"}.`);
  // Titles, not details. The findings themselves are a click away in the confirmation, and a
  // blocked row's own chip carries the reason; repeating either here makes a wall of text.
  //
  // Counted rather than repeated: one finding is raised per offending requirement, so a pack
  // with three git URLs said the same sentence three times.
  //
  // The deprecation and compatibility findings are skipped: the lines above already say both,
  // in more detail than their titles do.
  const tally = new Map();
  for (const found of entry.assessment?.findings || []) {
    if (/^(Marked deprecated|Declared )/.test(found.title)) continue;
    tally.set(found.title, (tally.get(found.title) || 0) + 1);
  }
  for (const [title, count] of [...tally].slice(0, 4)) {
    lines.push(count > 1 ? `${title} (×${count})` : title);
  }
  return lines.join("\n");
}

function registryControl(entry, cls) {
  // Open Manager's own entry is listed so it can be found and read, but a manager cannot be
  // installed through itself: the control says what it is and sends the reader to the place
  // that does know how to update it.
  if (entry.is_self) {
    const here = el("div", `om-ictl ${cls}`);
    const button = el("button", "om-btn", "About");
    button.title = "This is Open Manager. Updating it is under About and updates.";
    button.onclick = (event) => { event.stopPropagation(); openAboutDialog(); };
    here.appendChild(button);
    return { el: here, setInstall() {}, setInstalled() {}, setQueued() {}, setInstalling() {},
             setUpdate() {}, setStatusInstalled() {} };
  }
  const onDisk = installedPack(entry.id);
  let control;
  control = makeInstallControl({
    packId: entry.id,
    entry,
    withMenu: Boolean(onDisk),
    items: onDisk ? installedMenu(onDisk, entry, () => control, null) : [],
    onInstall: () => quickInstall(entry.id, control),
  });
  restoreInstall(entry.id, control);
  control.el.classList.add(cls);
  return control;
}

// Everything that can be done to a pack already on disk.
//
// There were three of these: one here for registry rows, one written inline in the Installed
// tab, and a two-item fallback inside makeInstallControl that the version rows on a pack page
// fell through to. They disagreed -- the comment on this one used to claim it matched the
// Installed tab while offering neither Reinstall, Hold nor Switch off -- so which actions you
// were given depended on which list you happened to open the menu from. One list now, with
// each entry present only where it can actually be carried out.
//
// `getControl` rather than the control itself: a caller builds these while its own
// `const control` is still being initialised, so reading it here would throw.
//
// Args:
//   record: The installed pack, as the installed index holds it. Null for a pack not on disk.
//   entry: The specific version the menu was opened against, where there is one.
//   getControl: Returns the control the actions should drive.
//   rowsRoot: The container whose sibling rows an install should update.
//   refresh: Called after an action that changes the list it was opened from.
// Returns:
//   Menu items, in the order they should read.
function installedMenu(record, entry, getControl, rowsRoot, refresh) {
  const items = [];
  if (!record) return items;
  const again = refresh || refreshInstalledIfActive;
  const current = entry
    || { version: record.version, status: "active", name: record.registry_id || record.id };

  if (isInstalledUpdatable(record)) {
    items.push({ label: `Update to ${record.latest}`,
                 fn: () => updateInstalled(record, rowsRoot, getControl()) });
  }
  // A pack can be reinstalled from wherever it came from. The registry is one source; a
  // repository is the other, and a pack that was placed by hand has neither, which is why
  // this is a question rather than an assumption.
  if (record.registry_id) {
    items.push({ label: "Reinstall",
                 fn: () => install({ packId: record.registry_id, entry: current,
                                     control: getControl(), rowsRoot, overwrite: true }) });
  } else if (record.repository) {
    items.push({ label: "Reinstall from GitHub",
                 fn: () => installFromRepo({ repo: record.repository, title: record.id,
                                             overwrite: true, classes: [] }, getControl()) });
  }
  if (vtReady()) items.push({ label: "Scan install", fn: () => openScanDialog(record.id) });
  if (record.registry_id) {
    items.push({ label: isHeld(record) ? "Stop holding this version"
                                       : `Hold at ${record.version}`,
                 fn: () => toggleHold(record, again) });
  }
  if (record.dir) {
    items.push({ label: record.disabled ? "Switch on" : "Switch off",
                 fn: () => togglePack(record, again) });
  }
  items.push({
    label: "Uninstall",
    danger: true,
    fn: () => uninstall({
      packId: record.id,
      entry: entry || { name: record.id },
      control: getControl(),
      rowsRoot,
      registryId: record.registry_id || entry?.id || "",
    }),
  });
  return items;
}

function rememberInstall(packId, state) {
  if (!packId) return;
  if (state) installState.set(packId, state);
  else installState.delete(packId);
}

// Put a freshly built control into whatever state its pack is actually in.
function restoreInstall(packId, control) {
  const state = installState.get(packId);
  if (state === "queued") control.setQueued();
  else if (state === "installing") control.setInstalling();
  else if (state === "installed") control.setInstalled();
  else if (installedPack(packId)) control.setInstalled();
  else control.setInstall();
}

const installQueue = [];
let queueTotal = 0;
let queueRunning = false;

function enqueueInstall(job) {
  installQueue.push(job);
  queueTotal += 1;
  job.control?.setQueued();
  rememberInstall(job.packId, "queued");
  if (!queueRunning) runInstallQueue();
}

async function runInstallQueue() {
  queueRunning = true;
  //: Installs that left the Python environment changed and did not finish cleanly. Collected
  //: through the run and offered once at the end.
  const restoreOffers = [];
  //: Requirements failures, shown one dialog each after the run rather than interrupting it.
  const failures = [];
  const progress = toast("", { sticky: true });
  let done = 0;
  const issues = [];
  while (installQueue.length) {
    const job = installQueue.shift();
    done += 1;
    progress.set(`${done} of ${queueTotal}: installing ${job.name} ${job.entry.version}...`);
    job.control?.setInstalling();
    rememberInstall(job.packId, "installing");
    let result;
    try {
      const answer = await api.fetchApi(`${API}/install`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: job.packId, version: job.entry.version,
          status: job.entry.status, overwrite: !!job.overwrite,
          // Read now rather than when the job was queued: the block is the reader's, and
          // the answer that counts is the one standing when the install actually runs.
          allow_banned: allowBanned(),
          // Held back so the files can be looked at before anything joins the environment.
          with_deps: !job.scanFirst,
        }),
      });
      result = await answer.json();
    } catch (error) {
      result = { ok: false, reason: error.message };
    }
    if (result.ok) {
      // Clear any sibling still marked installed, and record the version now in place.
      if (job.rowsRoot) {
        job.rowsRoot._installedVersion = job.entry.version;
        job.rowsRoot.querySelectorAll(".om-ictl").forEach((w) => {
          if (w !== job.control.el && w._control) w._control.setInstall();
        });
      }
      job.control?.setInstalled();
      rememberInstall(job.packId, "installed");
      loadInstalledIndex();
      if (job.scanFirst) await scanThenFinish(job.packId);
      if (result.pip_ran && !result.pip_ok) {
        const summary = environmentSummary(result.environment);
        const first = (result.pip_errors || [])[0];
        // The list at the end of a run is a summary; it now carries the first thing pip
        // complained about, so even the summary says something.
        issues.push(`${job.name}: ${first || "requirements did not install cleanly"}`);
        failures.push({ job, result, summary });
      }
    } else {
      job.control?.setInstall();
      rememberInstall(job.packId, null);
      issues.push(`${job.name} ${job.entry.version}: ${result.reason}`);
      if (result.environment_id) restoreOffers.push({ id: result.environment_id, name: job.name });
    }
  }
  queueTotal = 0;
  queueRunning = false;
  // Shown at the end rather than one per pack mid-queue, so a run of ten installs does not
  // stop ten times to ask.
  for (const failure of failures) {
    const choice = await showInstallFailure(failure.job, failure.result).catch(() => "");
    if (choice === "restore" && failure.result.environment_id) {
      await offerRestore(failure.result.environment_id, failure.job.name).catch(() => {});
    }
  }
  for (const offer of restoreOffers) {
    await offerRestore(offer.id, offer.name).catch(() => {});
  }
  if (issues.length) {
    progress.settle(`Finished with ${issues.length} issue(s).`, "warn", 9000);
    notify("Install issues", issues.join("\n"));
  } else {
    progress.settle(`${done} pack(s) installed.`, "ok", 6000);
  }
  if (done > issues.length) remindRestart();
}

// What recent installs did to the Python environment, and the offer to undo one.
//
// This exists because the install that breaks something is rarely the one you are watching.
// A pack installs, ComfyUI restarts a day later and something else has stopped working; the
// answer is usually a package an install moved, and without a record there is nothing to
// point at. The record survives the restart, so the question can still be asked afterwards.
async function openEnvironmentDialog() {
  const backdrop = el("div", "om-backdrop");
  const box = el("div", "om-note om-note-wide");
  box.appendChild(el("div", "om-note-title", "Environment changes"));
  box.appendChild(el("div", "om-dl-note",
    "Package lists taken either side of each install, newest first. An install that changed "
    + "nothing is not listed. Restoring runs pip and needs a restart afterwards."));
  const list = el("div", "om-keys");
  list.appendChild(loadingBlock("Reading the record"));
  box.appendChild(list);

  const foot = el("div", "om-note-foot");
  const close = el("button", "om-btn", "Close");
  close.onclick = () => backdrop.remove();
  foot.appendChild(close);
  box.appendChild(foot);
  backdrop.appendChild(box);
  document.body.appendChild(backdrop);
  closeOn(backdrop);

  const paint = async () => {
    let data;
    try {
      data = await (await api.fetchApi(`${API}/environment`)).json();
    } catch (error) {
      list.replaceChildren(el("div", "om-side-status",
        `The record could not be read: ${error.message}`));
      return;
    }
    const entries = data?.entries || [];
    if (!entries.length) {
      list.replaceChildren(el("div", "om-side-status",
        "Nothing recorded. Either no pack has been installed through Open Manager yet, or "
        + "none of them changed a package."));
      return;
    }
    list.replaceChildren();
    for (const entry of entries) {
      const row = el("div", "om-keys-row");
      const head = el("div", "om-dl-top");
      head.appendChild(el("span", "om-dl-name", `${entry.pack} ${entry.version}`));
      head.appendChild(el("span", "om-dl-src", sinceText(entry.at)));
      row.appendChild(head);
      row.appendChild(el("div", "om-dl-note", environmentSummary(entry.diff) || "no change"));

      // The detail, closed by default: a pack pulling in forty packages would otherwise bury
      // the rest of the list.
      const changed = [...(entry.diff?.changed || [])]
        .map((c) => `${c.name} ${c.was} \u2192 ${c.now}`);
      const added = (entry.diff?.added || []).map((a) => `${a.name} ${a.version}`);
      const removed = (entry.diff?.removed || []).map((r) => `${r.name} ${r.version}`);
      const detail = panel("What changed",
        countNote((entry.diff?.total) || 0, "package"), { open: false });
      const body = el("div", "om-chg");
      for (const [label, items] of [["Changed", changed], ["Added", added],
                                    ["Removed", removed]]) {
        if (!items.length) continue;
        const part = el("div", "om-chg-item");
        part.appendChild(el("div", "om-node-name", label));
        part.appendChild(el("div", "om-chg-text", items.join("\n")));
        body.appendChild(part);
      }
      detail.body.appendChild(body);
      row.appendChild(detail);

      const line = el("div", "om-keys-line");
      const undo = el("button", "om-btn om-danger", "Restore packages");
      undo.title = "Put these packages back as they were before this install";
      undo.onclick = async () => {
        backdrop.remove();
        await offerRestore(entry.id, `${entry.pack} ${entry.version}`);
      };
      line.appendChild(undo);
      const drop = el("button", "om-btn", "Forget");
      drop.title = "Remove this record. Nothing is uninstalled.";
      drop.onclick = async () => {
        await dlPost("/environment/forget", { id: entry.id });
        await paint();
      };
      line.appendChild(drop);
      row.appendChild(line);
      list.appendChild(row);
    }
  };
  paint();
}

// Why a pack's requirements did not install, with what pip said and what it left behind.
//
// The one-line "requirements did not install cleanly" that used to appear said nothing a
// reader could act on: not which requirement, not why, not whether anything was left changed.
// All of that was already coming back from the server and being discarded here.
//
// Returns the reader's choice, so the caller can offer a restore without asking twice.
async function showInstallFailure(job, result) {
  const backdrop = el("div", "om-backdrop");
  const box = el("div", "om-note om-note-wide");
  box.appendChild(el("div", "om-note-title",
    `${job.name}: requirements did not install`));
  box.appendChild(el("div", "om-dl-note",
    "The pack itself is on disk. Its Python requirements are what failed, so it may not load "
    + "or may load with parts missing until they are resolved."));

  // pip's own words for what went wrong, first, because that is the answer.
  const errors = result.pip_errors || [];
  if (errors.length) {
    const why = el("div", "om-keys-row");
    why.appendChild(el("div", "om-dl-name", "What pip said"));
    const lines = el("div", "om-chg-text om-pip-errors");
    lines.textContent = errors.join("\n");
    why.appendChild(lines);
    box.appendChild(why);
  }

  const asked = result.pip_requirements || [];
  if (asked.length) {
    const what = panel("What it asked for", countNote(asked.length, "requirement"),
      { open: false });
    const body = el("div", "om-chg-text");
    body.textContent = asked.join("\n");
    what.body.appendChild(body);
    box.appendChild(what);
  }

  if (result.pip_output) {
    const log = panel("pip output", "the last of it", { open: !errors.length });
    const body = el("div", "om-chg-text");
    body.textContent = result.pip_output;
    log.body.appendChild(body);
    box.appendChild(log);
  }

  const summary = environmentSummary(result.environment);
  box.appendChild(el("div", "om-dl-note", summary
    ? `Your Python environment changed on the way: ${summary}. That can be put back.`
    : "Nothing in your Python environment was changed."));

  const foot = el("div", "om-note-foot");
  let choice = "";
  const copy = el("button", "om-btn", "Copy output");
  copy.onclick = () => {
    const all = [errors.join("\n"), result.pip_output].filter(Boolean).join("\n\n");
    navigator.clipboard?.writeText(all)
      .then(() => toast("Output copied.", { kind: "ok" }))
      .catch(() => notify("Not copied", "The clipboard is not available here."));
  };
  foot.appendChild(copy);
  if (result.environment_id && summary) {
    const undo = el("button", "om-btn om-danger", "Restore packages");
    undo.title = "Put the packages back as they were before this install";
    undo.onclick = () => { choice = "restore"; backdrop.remove(); };
    foot.appendChild(undo);
  }
  const keep = el("button", "om-btn om-go", "Leave it");
  keep.onclick = () => { choice = "keep"; backdrop.remove(); };
  foot.appendChild(keep);
  box.appendChild(foot);
  backdrop.appendChild(box);
  document.body.appendChild(backdrop);
  closeOn(backdrop);

  await new Promise((resolve) => {
    const watch = new MutationObserver(() => {
      if (!backdrop.isConnected) { watch.disconnect(); resolve(); }
    });
    watch.observe(document.body, { childList: true });
  });
  return choice;
}

// What an install did to the Python environment, said plainly.
//
// Args:
//   diff: The `environment` block an install returns.
// Returns:
//   A sentence, or empty where nothing changed.
function environmentSummary(diff) {
  if (!diff?.total) return "";
  const parts = [];
  if (diff.added.length) parts.push(countNote(diff.added.length, "package") + " added");
  const down = diff.changed.filter((c) => c.direction === "downgraded").length;
  if (diff.changed.length) {
    parts.push(`${diff.changed.length} changed${down ? ` (${down} downgraded)` : ""}`);
  }
  if (diff.removed.length) parts.push(`${diff.removed.length} removed`);
  return parts.join(", ");
}

// Offer to put the environment back as it was before one install.
//
// Destructive, so the exact commands are shown first and the reader has to say yes to them
// rather than to a description of them. Packages the restore will not touch are named too: a
// restore that silently leaves numpy where an install moved it is not the undo it looks like.
async function offerRestore(entryId, packName) {
  let preview;
  try {
    preview = await dlPost("/environment/restore", { id: entryId });
  } catch (error) {
    notify("Could not read the record", error.message);
    return;
  }
  if (!preview?.ok) {
    notify("Could not read the record", preview?.reason || "The record could not be read.");
    return;
  }
  const plan = preview.plan || {};
  const facts = [];
  if (plan.uninstall?.length) facts.push(["Uninstall", plan.uninstall.join(", ")]);
  if (plan.install?.length) facts.push(["Put back", plan.install.join(", ")]);
  for (const one of plan.refused || []) {
    facts.push([`Left alone: ${one.name}`, one.reason]);
  }
  facts.push(["Afterwards", "ComfyUI has to restart. Packages already imported stay loaded "
    + "until it does."]);
  if (!plan.uninstall?.length && !plan.install?.length) {
    notify("Nothing to put back",
      "Everything this install changed is on the list Open Manager will not touch, because "
      + "pip or ComfyUI depends on it.");
    return;
  }

  const go = await chooseAction(`Restore packages to before ${packName}?`,
    "This runs pip with the commands below. Other packs installed since may depend on what "
    + "is about to be changed, and this does not check for that.",
    [{ key: "go", label: "Restore packages", primary: true, danger: true }],
    { wide: true, facts });
  if (!go) return;

  const progress = toast("Restoring packages...", { sticky: true });
  const outcome = await dlPost("/environment/restore", { id: entryId, confirm: true });
  const failed = (outcome?.steps || []).filter((step) => !step.ok);
  if (outcome?.ok) {
    progress.settle("Packages restored.", "ok", 7000);
  } else {
    progress.settle("The restore did not finish.", "warn", 9000);
    notify("Restore incomplete",
      "The environment is part way between the two states. What failed:\n\n"
      + failed.map((step) => `${step.action}: ${step.output}`).join("\n\n"));
  }
  if (outcome?.restart_required) remindRestart();
}

async function install({ packId, entry, control, rowsRoot, overwrite }) {
  if (entry.installable === false) {
    notify(`${packId} ${entry.version} is blocked`,
      entry.blocked_reason
      || "Blocked by policy. Open Manager's settings decide whether banned versions install.");
    return;
  }
  // A different version already installed makes this a switch. The installed version is
  // tracked on the row container.
  const installed = rowsRoot ? rowsRoot._installedVersion : "";
  const change = versionSwitch(installed, entry.version);
  // Off by default: a registry pack carries a status and a scan, which a repository does
  // not. Turned on, the same question is asked here so one answer covers both.
  if (panelSetting("openManager.trustRegistry", false) === true) {
    const repository = await repositoryForPack(packId, entry, rowsRoot);
    const parts = repoOwnerName(repository);
    if (parts && !(await confirmAuthorTrust(parts.owner, repository, "install a pack"))) return;
  }
  if (!(await confirmInstall(packId, entry, change))) return;

  // Where a scan is meant to run first, the requirements are held until it has. If the
  // day's allowance is gone the choice is offered rather than taken away.
  let scanFirst = vtReady() && panelSetting("openManager.scanOnInstall", false) === true;
  if (scanFirst && (await vtRemaining()) === 0) {
    const go = await confirmAction(
      "VirusTotal allowance spent",
      `Today's ${500} lookups are used up, so ${packId} cannot be scanned before it installs. `
      + "Install without scanning?",
      "Skip scan and install",
    );
    if (!go) return;
    scanFirst = false;
  }

  enqueueInstall({
    packId, entry, control, rowsRoot,
    overwrite: overwrite || !!change,
    name: entry.name || packId,
    scanFirst,
  });
}

// Confirmation for a GitHub install: a prominent unvetted-source warning, plus the archive
// inspection and dependency dry run loaded in place.
//: Owners the reader has trusted, folded for comparison. Filled at startup and kept in step
//: as decisions are made, so a row can say so without asking the server per row.
const trustedAuthors = new Set();

async function loadTrustedAuthors() {
  try {
    const answer = await api.fetchApi(`${API}/trust`);
    const authors = (await answer.json()).authors || [];
    trustedAuthors.clear();
    for (const row of authors) trustedAuthors.add(foldId(row.owner));
  } catch {
    // Nothing trusted, which prompts rather than assumes.
  }
}

// Whether a catalogue entry's repository belongs to a trusted author.
function byTrustedAuthor(entry) {
  const parts = repoOwnerName(entry?.repository || "");
  return !!parts && trustedAuthors.has(foldId(parts.owner));
}

// A row's mark that its author is trusted. Absent otherwise: the badge says something
// positive was decided, and no badge says nothing has been.
function trustBadge(entry) {
  if (!byTrustedAuthor(entry)) return null;
  const parts = repoOwnerName(entry.repository);
  const pill = el("span", "om-trusted", "✓ trusted");
  pill.title = `You trust ${parts.owner}`;
  return pill;
}

// A pack's repository, from whatever the caller already holds, and from the catalogue where
// it holds nothing. Install reaches here from several places carrying different data, so the
// lookup is done once here rather than threaded through each of them.
async function repositoryForPack(packId, entry, rowsRoot) {
  const known = entry?.repository || rowsRoot?._repository || installedPack(packId)?.repository;
  if (known) return known;
  try {
    const answer = await api.fetchApi(`${API}/pack-for-repo?id=${encodeURIComponent(packId)}`);
    return (await answer.json()).repository || "";
  } catch {
    return "";
  }
}

// Whether this owner has been trusted before, and what is known about them. A repository
// install has no registry status behind it, so the question that decides it is whether the
// account is trusted -- which is about the account, not this one repository.
async function authorStanding(owner, repo, consultList) {
  const standing = { owner, trusted: false, stars: null, created: null, pushed: null, packs: 0 };
  if (consultList) {
    try {
      const answer = await api.fetchApi(`${API}/trust?owner=${encodeURIComponent(owner)}`);
      standing.trusted = (await answer.json()).trusted === true;
    } catch {
      // Treated as untrusted, which asks rather than assumes.
    }
    if (standing.trusted) return standing;
  }
  // Facts worth having before deciding. All best-effort: the prompt stands without them.
  try {
    const answer = await api.fetchApi(`${API}/repo-meta?repo=${encodeURIComponent(repo)}`);
    const meta = await answer.json();
    standing.stars = meta.stars ?? null;
    standing.pushed = meta.pushed_at || null;
  } catch { /* left blank */ }
  try {
    const answer = await api.fetchApi(`${API}/installed`);
    const packs = (await answer.json()).packs || [];
    standing.packs = packs.filter((pack) => {
      const url = (pack.repository || "").toLowerCase();
      return url.includes(`github.com/${owner.toLowerCase()}/`);
    }).length;
  } catch { /* left blank */ }
  return standing;
}

// Ask before something published by a stranger is installed or loaded.
//
// The mode decides what an answer buys. "By author" remembers the account, so the question
// is asked once and covers everything they publish. "By action" asks every time, naming the
// account, and remembers nothing -- a reminder rather than a decision.
//
// Either way this gates the prompt, never the findings: an advisory or a scan result is
// about the code, not who published it, and is shown regardless.
async function confirmAuthorTrust(owner, repo, what) {
  const byAuthor = panelSetting("openManager.trustMode", "author") !== "action";
  const standing = await authorStanding(owner, repo, byAuthor);
  if (byAuthor && standing.trusted) return true;

  const choices = byAuthor
    ? [{ key: "always", label: `Trust ${owner}`, primary: true,
         hint: `Stops asking for anything published by ${owner}` },
       { key: "once", label: "This time only", hint: "Nothing is remembered" }]
    : [{ key: "once", label: "Continue", primary: true }];

  const how = await chooseAction(`Do you trust ${owner}?`, "", choices, {
    wide: true,
    facts: [
      ["Author", owner],
      ["Trusted", byAuthor ? "No" : "Not tracked, asked every time"],
      ["Action", what || "Install this"],
      ["Runs as", "ComfyUI. Full privileges."],
      ["Stars", standing.stars != null ? countText(standing.stars) : ""],
      ["Last push", standing.pushed ? dayText(standing.pushed) : ""],
      ["Installed", standing.packs
        ? `${standing.packs} of their pack${standing.packs === 1 ? "" : "s"}`
        : "None of theirs"],
      ["Trust covers", byAuthor ? "All their packs, not downloads" : ""],
      ["Findings", "Shown either way"],
    ],
  });
  if (!how) return false;
  if (how === "always") {
    try {
      await api.fetchApi(`${API}/trust`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner, trusted: true }),
      });
      trustedAuthors.add(foldId(owner));
    } catch {
      toast(`Could not remember ${owner}; continuing anyway.`, { kind: "warn" });
    }
  }
  return true;
}

function confirmRepoInstall(pack) {
  return new Promise((resolve) => {
    const backdrop = el("div", "om-backdrop");
    const dialog = el("div", "om-dialog");
    dialog.style.width = "min(90vw, 900px)";
    dialog.style.height = "auto";
    dialog.style.maxHeight = "90vh";

    const head = el("div", "om-head");
    head.appendChild(el("div", "om-title",
      pack.ref ? `Install ${pack.title} at ${pack.ref} from GitHub` : `Install ${pack.title} from GitHub`));
    dialog.appendChild(head);

    const body = el("div", "om-body");
    const warn = el("div", "om-ack");
    warn.appendChild(el("b", null, "Not on the Comfy Registry. Installed straight from GitHub."));
    warn.appendChild(el("div", null,
      "This source is not registry-scanned. A custom node runs with ComfyUI's privileges. "
      + "Review what it contains and changes below before installing."));
    if (pack.overwrite) {
      warn.appendChild(el("div", null,
        "The copy already in custom_nodes is removed first and replaced by this one."));
    }
    body.appendChild(warn);
    body.appendChild(el("div", "om-side-meta", pack.repo));
    body.appendChild(el("h4", null, "What this contains and would change"));
    const slot = el("div");
    slot.appendChild(el("div", "om-why", "Inspecting the repository..."));
    body.appendChild(slot);
    dialog.appendChild(body);

    const foot = el("div", "om-foot");
    const cancel = el("button", "om-btn", "Cancel");
    const go = el("button", "om-btn om-danger", "Install from GitHub");
    go.disabled = true;
    cancel.onclick = () => { backdrop.remove(); resolve(false); };
    go.onclick = () => { backdrop.remove(); resolve(true); };
    foot.appendChild(cancel);
    foot.appendChild(go);
    dialog.appendChild(foot);

    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);
    // Dismissing counts as cancelling. Without this the promise is never settled and
    // the caller waits for an answer that cannot arrive -- which is how a guarded
    // action stayed guarded after an Escape and refused to run again.
    closeOn(backdrop, () => { backdrop.remove(); resolve(false); });

    (async () => {
      let data;
      try {
        const answer = await api.fetchApi(`${API}/inspect-repo`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ repo: pack.repo, ref: pack.ref || "" }),
        });
        data = await answer.json();
      } catch (error) {
        slot.replaceChildren(el("div", "om-why", `Inspection failed: ${error.message}`));
        go.disabled = false;
        return;
      }
      slot.replaceChildren();
      if (!data.ok) {
        slot.appendChild(el("div", "om-why", data.reason || "could not inspect the repository"));
        go.disabled = false;
        return;
      }
      if (!data.findings.length) slot.appendChild(stateRow("Nothing notable in the archive"));
      for (const finding of data.findings) slot.appendChild(findingCard(finding));
      if (data.dependencies?.length) slot.appendChild(dependencyList(data.dependencies));
      if ((data.impact.replacements || []).some((r) => r.core && r.direction === "downgrade")) {
        go.textContent = "Downgrade dependencies and install from GitHub";
      }
      go.disabled = false;
    })();
  });
}

async function installFromRepo(pack, control) {
  const parts = repoOwnerName(pack.repo);
  if (parts && !(await confirmAuthorTrust(parts.owner, pack.repo, "install a pack"))) return;
  if (!(await confirmRepoInstall(pack))) return;
  control?.setInstalling?.();
  const progress = toast(`Installing ${pack.title} from GitHub...`, { sticky: true });
  let result;
  try {
    const answer = await api.fetchApi(`${API}/install-repo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        repo: pack.repo, ref: pack.ref || "", overwrite: !!pack.overwrite,
      }),
    });
    result = await answer.json();
  } catch (error) {
    result = { ok: false, reason: error.message };
  }
  if (result.ok) {
    control?.setInstalled?.();
    progress.settle(`Installed ${pack.title}.`, "ok", 6000);
    if (result.pip_ran && !result.pip_ok) {
      const choice = await showInstallFailure({ name: pack.title || pack.repo }, result);
      if (choice === "restore" && result.environment_id) {
        await offerRestore(result.environment_id, pack.title || pack.repo).catch(() => {});
      }
    }
    remindRestart();
  } else {
    control?.setInstall?.();
    progress.remove();
    notify("Install failed", result.reason);
  }
}

async function uninstall({ packId, entry, control, rowsRoot, registryId }) {
  const name = entry.name || packId;
  const ok = await confirmAction(
    `Uninstall ${name}`,
    `This removes ${packId} from custom_nodes. Other packs are untouched.`,
    "Uninstall", true);
  if (!ok) return;
  const progress = toast(`Uninstalling ${name}...`, { sticky: true });
  let result;
  try {
    const answer = await api.fetchApi(`${API}/uninstall`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: packId }),
    });
    result = await answer.json();
  } catch (error) {
    result = { ok: false, reason: error.message };
  }
  if (result.ok) {
    if (rowsRoot) rowsRoot._installedVersion = "";
    control?.setInstall();
    // The registry list remembers what a pack is doing so its rows survive being rebuilt
    // as it scrolls. That memory is keyed by registry id, which is not always the
    // directory the pack was installed under, so both are cleared here; leaving either
    // behind would show Installed for something that is no longer there.
    rememberInstall(packId, null);
    rememberInstall(registryId, null);
    loadInstalledIndex();
    progress.settle(`Uninstalled ${name}.`, "ok", 6000);
    remindRestart();
  } else {
    progress.remove();
    notify("Uninstall failed", result.reason);
  }
}

// Owner and repo from a GitHub URL, or null.
function repoOwnerName(url) {
  const match = /github\.com[/:]+([^/]+)\/([^/#?]+)/i.exec(url || "");
  return match ? { owner: match[1], repo: match[2].replace(/\.git$/, "") } : null;
}

// A Star button. Without a configured token it opens the repository on GitHub; with one it
// stars in place.
function makeStarButton(repository, stars) {
  const button = el("button", "om-btn om-star");
  button.appendChild(document.createTextNode(stars != null ? `★ ${stars.toLocaleString()}` : "☆ Star"));
  button.title = "Star on GitHub";
  button.onclick = () => starRepo(repository, button);
  reflectStar(repository, button);
  return button;
}

async function reflectStar(repository, button) {
  if (!repoOwnerName(repository) || !keysHeld.github) return;
  try {
    const answer = await dlPost("/star", { repo: repository, action: "check" });
    if (answer?.starred) {
      button.classList.add("om-starred");
      button.firstChild.textContent = "★ Starred";
    }
  } catch {
    // No star state is not worth saying anything about.
  }
}

async function starRepo(repository, button) {
  const parts = repoOwnerName(repository);
  if (!parts) { if (repository) openUrl(repository); return; }
  const openRepo = () =>
    window.open(`https://github.com/${parts.owner}/${parts.repo}`, "_blank", "noopener,noreferrer");
  // Without a token there is nothing to star with, so the repository is opened instead and
  // the reader can do it there.
  if (!keysHeld.github) { openRepo(); return; }
  const starred = button.classList.contains("om-starred");
  const answer = await dlPost("/star",
    { repo: repository, action: starred ? "unstar" : "star" }).catch((error) => ({
      ok: false, reason: error.message,
    }));
  if (!answer?.ok) {
    notify("Could not star", `${answer?.reason || "GitHub refused"}. Opening the repository instead.`);
    openRepo();
    return;
  }
  button.classList.toggle("om-starred", !!answer.starred);
  button.firstChild.textContent = answer.starred ? "★ Starred" : "☆ Star";
  toast(answer.starred ? "Starred on GitHub." : "Unstarred on GitHub.", { kind: "ok" });
}

// One tag, as a button that searches for it.
//
// A tag names something a pack does, and the obvious question on reading one is which other
// packs do the same. It fills the registry search with `topic:<name>`, which is a query that
// can be seen, edited and cleared, rather than putting the list into a state with no handle
// on it.
function tagChip(tag) {
  const chip = el("button", "om-tag om-tag-go", tag);
  chip.title = `Find other packs tagged ${tag}`;
  chip.onclick = () => browseTopic(String(tag).toLowerCase());
  return chip;
}

// The element a pack page was built into, whichever shape it took.
//
// The page goes into a modal's `.om-dialog` or into a window's `.om-float` depending on a
// setting, so anything reaching back out of the page for another part of it -- the header
// chips, the version list -- has to ask for both. Asking for the dialog alone is how the
// repository metadata ended up in a row of its own at the foot of the page instead of beside
// the publisher and the licence where it belongs.
function packRoot(node) {
  return node?.closest(".om-dialog, .om-float") || null;
}

async function openPack(packId) {
  // Already open: bring it forward. Checked before anything is drawn, because the loading
  // dialog below would otherwise be built and torn down again, which reads as a flicker.
  const already = floatingPanel(`pack:${packId}`);
  if (already) { already.present(); return already; }
  // The same again as a modal is the page that is already in front of the reader.
  const showing = document.querySelector(".om-backdrop[data-om-pack]");
  if (showing?.dataset.omPack === packId) return;

  const backdrop = el("div", "om-backdrop");
  backdrop.dataset.omPack = packId;
  const dialog = el("div", "om-dialog");
  dialog.appendChild(el("div", "om-body", `Reading ${packId} from the registry...`));
  backdrop.appendChild(dialog);
  closeOn(backdrop);

  // Held back rather than shown at once. A cached registry answer returns inside this, and a
  // dialog that appears for two frames reads as a fault rather than as progress.
  let waiting = null;
  const showWaiting = () => {
    if (waiting !== "shown") {
      // One pack page at a time. A README link to another pack replaces the page rather than
      // stacking a dialog over it, which left no way back but closing each in turn.
      for (const other of document.querySelectorAll(".om-backdrop[data-om-pack]")) other.remove();
      document.body.appendChild(backdrop);
    }
    waiting = "shown";
  };
  const timer = setTimeout(() => { if (waiting === null) showWaiting(); }, LOADING_GRACE);
  const doneWaiting = () => { clearTimeout(timer); if (waiting === null) waiting = "skipped"; };

  let data;
  try {
    const answer = await api.fetchApi(
      `${API}/pack/${encodeURIComponent(packId)}?${packQuery()}`);
    data = await answer.json();
    if (!answer.ok) throw new Error(registryReason(data, answer.status));
    doneWaiting();
  } catch (error) {
    doneWaiting();
    // The registry not having an entry is not the same as there being nothing to show. A
    // pack sitting in custom_nodes doing its job has a page's worth of information in it.
    const local = await localPack(packId);
    if (local) {
      if (asWindow("packs")) {
        backdrop.remove();
        showLocalPackWindow(packId, local);
      } else {
        dialog.replaceChildren();
        const close = el("button", "om-x", "×");
        close.title = "Close";
        close.onclick = () => backdrop.remove();
        dialog.appendChild(close);
        buildLocalPackBody(dialog, local);
        showWaiting();
      }
      return;
    }
    dialog.replaceChildren(packProblem(`Could not read ${packId}`, error, backdrop));
    showWaiting();
    return;
  }

  const { pack, resolution, versions } = data;
  dialog.replaceChildren();

  // Borderless close, top-right of the modal.
  const close = el("button", "om-x", "×");
  close.title = "Close";
  close.onclick = () => backdrop.remove();
  dialog.appendChild(close);

  // Everything below builds the page from whatever the registry returned. A pack with a shape
  // nothing else has -- no versions, a field the registry stopped sending -- would otherwise
  // throw partway through and leave a window containing nothing but the close button, which
  // reads as the interface being broken rather than as one pack being odd.
  // A modal is right for a quick look and wrong for reading a README while building a graph.
  // The same page goes into one of the floating windows instead, keyed per pack so several
  // can be open at once and each remembers where it was put.
  if (asWindow("packs")) {
    backdrop.remove();
    showPackWindow(packId, { pack, resolution, versions });
    return;
  }

  try {
    buildPackBody(dialog, { pack, resolution, versions });
  } catch (error) {
    dialog.replaceChildren(close, packProblem(`Could not show ${packId}`, error, backdrop));
  }
  showWaiting();
}

//: The setting behind each surface that can be either a window or a modal.
const WINDOW_SETTINGS = {
  manager: "openManager.windowManager",
  packs: "openManager.windowPacks",
  downloads: "openManager.windowDownloads",
  library: "openManager.windowLibrary",
  memory: "openManager.windowMemory",
};

// Whether one surface opens as a window. Each is asked separately because they are not used
// the same way: a Memory panel is glanced at and dismissed, while a pack README is read
// alongside the graph it is about.
function asWindow(surface) {
  return panelSetting(WINDOW_SETTINGS[surface], true) !== false;
}

//: How much bigger or smaller than its own default a window opens.
const WINDOW_SCALE = { compact: 0.8, standard: 1, large: 1.25 };

//: What each window asks for by default, as a share of the viewport rather than a count of
//: pixels: a figure that suits a laptop is a postage stamp on a 4K monitor, and one that suits
//: the monitor does not fit the laptop at all.
//:
//: `vh` is the share of the whole window, title bar included, because that is what the reader
//: sees; the body is worked out from it. The bounds keep it honest at the extremes: the floor
//: stops a window becoming unusable in a narrow browser, and the ceiling stops one spanning an
//: ultrawide, where a README set in a single line across 3,000 pixels is harder to read.
const WINDOW_SIZES = {
  manager: { vw: 0.66, vh: 0.70, min: [420, 320], max: [1600, 1200] },
  pack: { vw: 0.72, vh: 0.74, min: [420, 340], max: [1800, 1300] },
  downloads: { vw: 0.56, vh: 0.50, min: [380, 280], max: [1300, 900] },
  library: { vw: 0.62, vh: 0.58, min: [420, 320], max: [1500, 1000] },
  memory: { vw: 0.44, vh: 0.60, min: [340, 320], max: [1000, 1000] },
};

//: However large the reader asks for, this much of the screen is left showing. A window that
//: covers the graph entirely is a modal wearing a title bar, and the point of a window is
//: being able to see what it is about.
const WINDOW_ROOM = { width: 0.94, height: 0.88 };

// The size a window opens at before the reader has given it one of their own.
//
// Args:
//   name: Which window, as a key of WINDOW_SIZES.
// Returns:
//   `{width, height}` in pixels, taken from the viewport, scaled by the size setting and held
//   inside that window's bounds.
function windowSize(name) {
  const spec = WINDOW_SIZES[name] || WINDOW_SIZES.manager;
  const scale = windowScale();
  const pick = (share, extent, low, high, room) => Math.round(
    // The floor wins last, so a browser too small for the floor gets the floor and scrolls
    // rather than a window sized to nothing.
    Math.max(low, Math.min(high, extent * room, extent * share * scale)));
  const tall = pick(spec.vh, window.innerHeight, spec.min[1], spec.max[1], WINDOW_ROOM.height);
  return {
    width: pick(spec.vw, window.innerWidth, spec.min[0], spec.max[0], WINDOW_ROOM.width),
    // `height` is the body; the bar sits above it and counts towards what the reader sees.
    height: Math.max(120, tall - headerHeight()),
  };
}

// The scale a window's default size is multiplied by. Applied to each window's own figures
// rather than to a single size for all of them, so the Memory panel stays smaller than a pack
// page instead of every window becoming the same shape.
function windowScale() {
  const asked = String(panelSetting("openManager.windowSize", "standard") || "standard");
  return WINDOW_SCALE[asked] ?? 1;
}

//: Bounds for the two text settings. A window whose text is 4px or 90px is not a window.
const TEXT_LIMITS = { title: [10, 28], body: [10, 22] };

// Push the look settings out as custom properties on the document, so they reach modals and
// windows alike and take effect on what is already open rather than only on the next thing
// drawn.
function applyWindowLook() {
  const clamp = ([low, high], value, fallback) =>
    Math.min(high, Math.max(low, Number(value) || fallback));
  const root = document.documentElement;
  root.style.setProperty("--om-title-size",
    `${clamp(TEXT_LIMITS.title, panelSetting("openManager.windowTitleSize", 15), 15)}px`);
  root.style.setProperty("--om-text-size",
    `${clamp(TEXT_LIMITS.body, panelSetting("openManager.windowTextSize", 13), 13)}px`);
  root.style.setProperty("--om-shadow",
    panelSetting("openManager.windowShadow", true) !== false
      ? "0 10px 40px rgba(0,0,0,.5)"
      : "none");
  // A class rather than a property: the rule it switches on is a filter, and a filter set to
  // `none` still makes the element its own containing block, which moves fixed children.
  document.body.classList.toggle("om-blur-inactive",
    panelSetting("openManager.blurInactive", false) !== false);
}

// The same page, in a window that outlives a click on the canvas. Keyed by pack, so opening
// one that is already open raises it instead of drawing a second copy of it.
function showPackWindow(packId, data) {
  const panel = createFloatingPanel({
    key: `pack:${packId}`,
    title: data.pack?.name || packId,
    // The largest share of the screen of any of them, because this one is a page: a banner,
    // the metadata, the version list and a README.
    ...windowSize("pack"),
    centred: true,
  });
  // An already-open window comes back with its contents; only a fresh one needs filling.
  if (panel.body.childElementCount) return panel;
  try {
    buildPackBody(panel.body, data);
  } catch (error) {
    panel.body.replaceChildren(
      packProblem(`Could not show ${packId}`, error, { remove: panel.destroy }));
  }
  return panel;
}

//: What the disk knows about a pack, or null where nothing is installed under that name.
async function localPack(packId) {
  try {
    const answer = await api.fetchApi(`${API}/local/${encodeURIComponent(packId)}`);
    const found = await answer.json();
    return found?.ok ? found : null;
  } catch {
    return null;
  }
}

// The same page in a window, following the setting every other page follows.
function showLocalPackWindow(packId, info) {
  const panel = createFloatingPanel({
    key: `pack:${packId}`,
    title: info.pyproject?.display_name || info.pyproject?.name || packId,
    ...windowSize("pack"),
    centred: true,
  });
  if (panel.body.childElementCount) return panel;
  buildLocalPackBody(panel.body, info);
  return panel;
}

// A clone's remote as something a browser can open.
//
// git records `git@host:owner/repo.git` for an SSH remote, which is not a URL. Turning it
// into one is the difference between a link and a string nobody can use.
function remoteToUrl(remote) {
  const text = String(remote || "").trim();
  if (!text) return "";
  const ssh = text.match(/^(?:ssh:\/\/)?git@([^:/]+)[:/](.+?)(?:\.git)?$/);
  if (ssh) return `https://${ssh[1]}/${ssh[2]}`;
  return safeUrl(text.replace(/\.git$/, "")) || "";
}

// Build a pack page from the copy on disk.
//
// For a pack the registry has no entry for: written locally, pulled, or placed by hand. There
// is no version list and no registry status, because there is no registry entry; what there
// is comes from the pack's own files and is labelled as such, so nothing here can be mistaken
// for something the registry vouched for.
function buildLocalPackBody(container, info) {
  const project = info.pyproject || {};
  const git = info.git || {};
  const body = el("div", "om-body");

  const hero = el("div", "om-hero");
  const infoBox = el("div", "om-hero-info");
  infoBox.appendChild(el("div", "om-title", project.display_name || project.name || info.id));
  if (project.description) {
    infoBox.appendChild(el("div", "om-sub", project.description));
  }
  infoBox.appendChild(el("div", "om-sub", info.path));

  const actions = el("div", "om-actions om-hero-actions");
  const remote = remoteToUrl(git.remote) || safeUrl(project.urls?.repository)
    || safeUrl(project.urls?.source) || safeUrl(project.urls?.homepage);
  if (remote) {
    const button = repoButton(remote, `Open ${remote}`);
    if (button) actions.appendChild(button);
  }

  const chips = el("div", "om-chips");
  const chip = (label, value) => {
    if (!value) return;
    const node = el("span", "om-chip");
    node.appendChild(el("b", null, label));
    node.appendChild(document.createTextNode(" " + value));
    chips.appendChild(node);
  };
  chip("version", info.version && info.version !== "present" ? info.version : project.version);
  chip("licence", project.license);
  chip("python", project.requires_python);
  chip("publisher", project.publisher);
  chip("directory", info.dir);
  if (git.branch) chip("branch", git.branch + (git.commit ? ` @ ${git.commit.slice(0, 7)}` : ""));
  if (info.installed_at) {
    chip("installed", new Date(info.installed_at * 1000).toISOString().slice(0, 10));
  }
  if (info.disabled) chip("state", "switched off");
  actions.appendChild(chips);
  infoBox.appendChild(actions);
  hero.appendChild(infoBox);
  body.appendChild(hero);

  const notice = el("div", "om-notice");
  notice.appendChild(el("b", null, "Not in the Comfy Registry"));
  notice.appendChild(document.createTextNode(
    " Everything below is read from the files in this directory. There is no published "
    + "version list, no registry status and no findings, because there is no entry to read "
    + "them from."));
  body.appendChild(notice);

  if (info.classes?.length) {
    const nodes = panel("Nodes", countNote(info.classes.length, "node"), { open: false });
    const list = el("div", "om-chg");
    for (const name of info.classes) {
      const item = el("div", "om-nodelist-item");
      item.appendChild(el("div", "om-node-name", name));
      list.appendChild(item);
    }
    nodes.body.appendChild(list);
    body.appendChild(nodes);
  } else {
    const nodes = panel("Nodes", "none registered", { open: false });
    nodes.body.appendChild(el("div", "om-side-status",
      info.disabled
        ? "This pack is switched off, so it has registered nothing this session."
        : "ComfyUI has no node classes attributed to this pack. It may have failed to "
          + "import, or it may add something other than nodes."));
    body.appendChild(nodes);
  }

  if (info.requirements?.length) {
    const reqs = panel("Requirements", countNote(info.requirements.length, "requirement"),
      { open: false });
    const text = el("div", "om-chg-text");
    text.textContent = info.requirements.join("\n");
    reqs.body.appendChild(text);
    body.appendChild(reqs);
  }

  if (info.readme?.text) {
    const readme = el("div", "om-readme");
    readme.appendChild(loadingBlock("Reading the README"));
    body.appendChild(readme);
    const view = el("div", "om-readme-body");
    renderMarkdownInto(view, info.readme.text, { repository: remote || "" }, git.branch || "",
      "").then(() => readme.replaceChildren(view)).catch(() => {
        readme.replaceChildren(el("div", "om-side-status", "The README could not be rendered."));
      });
  }

  container.appendChild(body);
}

// The sentence a failed pack page shows, with the close button kept so the window can still be
// dismissed and the detail kept so it can be reported.
function packProblem(title, error, backdrop) {
  const box = el("div", "om-body");
  box.appendChild(el("div", "om-empty-title", title));
  box.appendChild(el("div", "om-side-status", String(error?.message || error)));
  const foot = el("div", "om-note-foot");
  const close = el("button", "om-btn", "Close");
  close.onclick = () => backdrop.remove();
  foot.appendChild(close);
  box.appendChild(foot);
  return box;
}

// What went wrong upstream, in words. The registry answers errors as JSON, and our own route
// passes that through as `detail`, so without this the reader is shown a wire payload.
function registryReason(data, status) {
  const detail = data?.detail ?? data?.reason ?? "";
  if (typeof detail === "string" && detail.trim().startsWith("{")) {
    try {
      const inner = JSON.parse(detail);
      const said = inner.message || inner.error;
      if (said) return `the registry says: ${said}`;
    } catch {
      // Not JSON after all; the raw text is still better than nothing.
    }
  }
  if (data?.status === 404 || status === 404) return "the registry has no entry for it";
  return String(detail || `HTTP ${status}`);
}

function buildPackBody(dialog, { pack, resolution, versions }) {

  // Banner left, all metadata inline to its right.
  const hero = el("div", "om-hero");
  if (pack.banner) {
    const banner = el("img", "om-banner");
    banner.src = pack.banner;
    banner.onerror = () => banner.remove();
    hero.appendChild(banner);
  }

  const info = el("div", "om-hero-info");
  const titleRow = el("div", "om-title-row");
  if (pack.icon) {
    const icon = el("img", "om-icon");
    icon.src = pack.icon;
    icon.onerror = () => icon.remove();
    titleRow.appendChild(icon);
  }
  const titles = el("div");
  titles.appendChild(packName(pack.name || pack.id, "om-title"));
  titles.appendChild(el("div", "om-sub", pack.description || ""));
  titles.appendChild(el("div", "om-sub", pack.id));
  titleRow.appendChild(titles);
  info.appendChild(titleRow);

  const stats = el("div", "om-stats");
  // Stars are not here: the star control beside these shows the same number and can change
  // it, so two readings of one figure were on screen at once. Which figure the registry
  // holds is the registry's business, not something to second-guess here.
  for (const [label, value] of [
    ["downloads", pack.downloads.toLocaleString()],
    ["versions", String(versions.length)],
  ]) {
    const stat = el("div", "om-stat");
    stat.appendChild(el("b", null, value));
    stat.appendChild(el("span", null, label));
    stats.appendChild(stat);
  }
  info.appendChild(stats);

  // Actions and metadata chips. Status is a colour, not a word.
  const actions = el("div", "om-actions om-hero-actions");
  const registry = registryButton(pack.id);
  if (registry) actions.appendChild(registry);
  if (pack.repository) {
    const repo = repoButton(pack.repository, `Open ${pack.repository}`);
    if (repo) actions.appendChild(repo);
    if (repoOwnerName(pack.repository)) actions.appendChild(makeStarButton(pack.repository, pack.stars));
  }
  const chips = el("div", "om-chips");
  const chip = (label, value) => {
    if (!value) return;
    const node = el("span", "om-chip");
    node.appendChild(el("b", null, label));
    node.appendChild(document.createTextNode(" " + value));
    chips.appendChild(node);
  };
  // A chip whose value is a registry status, shown as a colour-coded dot.
  const statusChip = (label, value, status, hint = "") => {
    if (!value) return;
    const node = el("span", "om-chip");
    node.appendChild(el("b", null, label));
    node.appendChild(document.createTextNode(" " + value));
    const dot = el("span", "om-dot");
    dot.style.background = STATUS_COLOUR[status] || STATUS_COLOUR.unknown;
    dot.title = status;
    node.appendChild(dot);
    if (hint) node.title = hint;
    chips.appendChild(node);
  };
  // The registry fills in a display name for almost every publisher and an `author` string
  // for almost none, so the name is shown and the account id kept for the tooltip: the id is
  // what Trust the author records, so it still has to be findable.
  statusChip("publisher", pack.publisher_name || pack.publisher, pack.publisher_status,
    pack.publisher_name && pack.publisher_name !== pack.publisher
      ? `Publisher account: ${pack.publisher}`
      : "");
  statusChip("registry", pack.status, pack.status);
  if (pack.license) {
    const node = el("span", "om-chip");
    node.appendChild(el("b", null, "license"));
    node.appendChild(document.createTextNode(" " + pack.license));
    const dot = el("span", "om-dot");
    dot.style.background = pack.license_color || "var(--om-muted)";
    dot.title = pack.license_tier || "unknown";
    node.appendChild(dot);
    chips.appendChild(node);
  }
  chip("category", pack.category);
  // `author` is set on about one pack in ten; the publisher's member list is set on nine, and
  // names the same people. The declared author wins where there is one.
  const members = pack.publisher_members || [];
  chip("author", pack.author || members.join(", "));
  // These are declared per version, not per pack: the registry's pack-level copies are empty
  // for every pack that fills them in. The chip therefore describes one particular version,
  // the newest that declares anything, and says so rather than implying it covers all of them.
  const declaring = versions.find((entry) => entry.compatibility?.declared);
  if (declaring) {
    const node = el("span", "om-chip");
    node.appendChild(el("b", null, "requires"));
    node.appendChild(document.createTextNode(" "
      + declaring.compatibility.notes.map((n) => `${n.label} ${n.declared}`).join(" · ")));
    if (declaring.compatibility.state === "differs") node.classList.add("om-chip-differs");
    node.title = `As declared by version ${declaring.version}. Each version declares its own; `
      + "the list below marks any that do not match this install.";
    chips.appendChild(node);
  }
  chip("first published", (pack.created_at || "").slice(0, 10));
  actions.appendChild(chips);
  info.appendChild(actions);

  if (pack.tags.length) {
    const tags = el("div", "om-tags");
    for (const tag of pack.tags) tags.appendChild(tagChip(tag));
    info.appendChild(tags);
  }

  hero.appendChild(info);

  // The header scrolls with the page rather than being pinned above it, so a long README
  // gets the whole dialog once you have read past the title.
  const body = el("div", "om-body");
  body.appendChild(hero);
  body.appendChild(el("div", "om-release-slot"));

  // The registry advertises only an active release. Where a newer one is published, the
  // gap is stated as fact.
  if (resolution.newest_is_hidden) {
    const notice = el("div", "om-notice");
    notice.appendChild(el("b", null,
      `Registry latest ${resolution.registry_advertises || "none"} · newest published ${resolution.newest}`));
    body.appendChild(notice);
  }

  // Versions live in their own bordered, scrolling box.
  const versionsBox = el("div", "om-versions");
  versionsBox._installedVersion = pack.installed_version || "";
  for (const entry of versions) {
    const row = el("div", "om-row");
    // The row carries what is known about the version, because the row has room for a date
    // and one finding and this has the rest: what it declares, what it pulls in, why it is
    // blocked. Set on the row so anywhere in it answers.
    row.title = versionFacts(entry);
    if (entry.deprecated) row.classList.add("om-row-deprecated");
    const number = el("div", "om-ver", entry.version);
    // Kept in the version cell rather than beside the status badge, so the badge cell holds
    // one thing and every row stays one line high.
    if (entry.compatibility?.state === "differs") {
      const flag = el("span", "om-ver-flag", "!");
      flag.title = entry.compatibility.notes
        .filter((n) => n.state === "differs")
        .map((n) => `Declares ${n.label} ${n.declared}; this install reports ${n.yours}.`)
        .join("\n")
        + "\nPublishers often declare a range wider or narrower than a pack needs. It installs "
        + "either way.";
      number.appendChild(flag);
    }
    row.appendChild(number);
    const marks = el("div", "om-marks");
    const mark = badge(entry.status);
    mark.dataset.version = entry.version;
    // The registry's reason arrives separately and lands here; until then the badge says
    // only what the status is, which the reader can already see.
    mark.title = `Status: ${entry.status}`;
    marks.appendChild(mark);
    // No second badge for deprecated. A version carrying both wrapped this cell onto a second
    // line and grew the row, so a handful of old versions set the height of the whole list.
    // The dimmed row says it instead, and the row's own tooltip spells it out.
    row.appendChild(marks);
    row.appendChild(el("div", "om-why", (entry.created_at || "").slice(0, 10)));

    const worst = entry.assessment?.findings?.[0];
    row.appendChild(el("div", "om-why", worst ? worst.title : "no findings"));

    // A banned version is blocked, not offered. Everything else installs after its warning.
    if (entry.installable === false) {
      const blocked = el("span", "om-blocked", "Blocked");
      blocked.title = entry.blocked_reason || "Blocked by policy";
      row.appendChild(blocked);
    } else {
      // The menu is the installed pack's -- reinstall it, hold it, switch it off, remove it --
      // so it belongs to the row of the version actually installed. On any other row it
      // described a different version than the one the row is for: "Hold at 3.2.0" sitting
      // beside 3.2.1, which is not what that row does.
      const isInstalledRow = Boolean(pack.installed_version)
        && entry.version === pack.installed_version;
      const onDisk = isInstalledRow ? installedPack(pack.id) : null;
      let control;
      control = makeInstallControl({
        packId: pack.id,
        entry: { ...entry, name: pack.name || pack.id },
        rowsRoot: versionsBox,
        withMenu: Boolean(onDisk),
        items: onDisk
          ? installedMenu(onDisk, { ...entry, name: pack.name || pack.id },
                          () => control, versionsBox)
          : undefined,
      });
      if (isInstalledRow) {
        control.setInstalled();
      } else {
        // Named for the move it makes from whatever is installed.
        const change = versionSwitch(pack.installed_version || "", entry.version);
        control.setInstall(change
          ? { downgrade: "Downgrade", upgrade: "Upgrade", reinstall: "Reinstall" }[change.direction]
          : "");
      }
      row.appendChild(control.el);
    }
    versionsBox.appendChild(row);
  }
  // What the header says when the section is closed: enough to know whether to open it.
  const versionNote = [`${versions.length} published`];
  if (pack.installed_version) versionNote.push(`installed ${pack.installed_version}`);
  else if (resolution.newest) versionNote.push(`newest ${resolution.newest}`);
  const versionsPanel = panel("Versions", versionNote.join(" · "), {
    remember: "om-versions-open",
  });
  versionsPanel.body.appendChild(versionsBox);
  body.appendChild(versionsPanel);
  attachStatusReasons(pack.id, versionsBox, versions);

  // What the pack adds to the graph. The registry records this per version and holds it for
  // roughly three packs in five, so the section is offered for every pack and says plainly
  // when the registry was never told, rather than implying the pack adds nothing.
  const shownVersion = pack.installed_version || resolution.newest || versions[0]?.version;
  if (shownVersion) {
    const nodesPanel = panel("Nodes", "", { open: false, remember: "om-nodes-open" });

    // Which version's list is on screen. The registry keeps one per version and fills it in
    // for some and not others, so the version that happens to be installed is often the one
    // with nothing in it while an earlier one has the lot. Pinning the panel to a single
    // version made that data unreachable; the ref selector above only moves GitHub branches
    // and has no bearing on what the registry holds.
    let atVersion = shownVersion;

    const picker = el("select", "om-side-select om-nodes-at");
    for (const entry of versions) {
      const option = el("option", null, entry.version);
      option.value = entry.version;
      if (entry.version === shownVersion) option.selected = true;
      picker.appendChild(option);
    }
    picker.title = "Which published version's node list to read";
    picker.onclick = (event) => event.stopPropagation();

    // Fetched when it is first opened, and again whenever the version changes: it is a
    // request per version, and most readers never look. `loaded` keeps a reopen from asking
    // for the same version twice.
    let loaded = false;
    const fill = async () => {
      if (loaded) return;
      loaded = true;
      nodesPanel.body.replaceChildren(loadingBlock("Reading the node list"));
      let data;
      try {
        const query = new URLSearchParams({ version: atVersion });
        const answer = await api.fetchApi(
          `${API}/comfy-nodes/${encodeURIComponent(pack.id)}?${query}`);
        data = await answer.json();
        if (!data.ok) throw new Error(data.reason || `HTTP ${answer.status}`);
      } catch (error) {
        loaded = false;
        nodesPanel.body.replaceChildren(nodesBar(), el("div", "om-side-status",
          `The node list could not be read: ${error.message}`));
        return;
      }
      if (!data.known) {
        const said = el("div", "om-side-status",
          `The registry holds no node list for ${atVersion}. That is common, and does not `
          + "mean the pack adds no nodes: publishing one is optional. Another version may "
          + "have one.");
        nodesPanel.body.replaceChildren(nodesBar(), said);
        nodesPanel.note("no list");
        return;
      }
      const list = el("div", "om-nodelist");
      for (const one of data.nodes) {
        const item = el("div", "om-nodelist-item");
        const head = el("div", "om-chg-head");
        head.appendChild(el("div", "om-node-name", one.name));
        if (one.deprecated) head.appendChild(el("span", "om-chg-here", "deprecated"));
        if (one.experimental) head.appendChild(el("span", "om-chg-here", "experimental"));
        if (one.category) head.appendChild(el("div", "om-why", one.category));
        item.appendChild(head);
        if (one.description) {
          // Publisher text, set as text for the same reason the changelog is.
          const note = el("div", "om-chg-text");
          note.textContent = one.description;
          item.appendChild(note);
        }
        // What the node wires up to, which is the part that decides whether it fits the
        // graph you had in mind.
        const ports = [];
        const inputs = one.inputs || {};
        if (inputs.required) ports.push(countNote(inputs.required, "required input"));
        if (inputs.optional) ports.push(`${inputs.optional} optional`);
        if (one.outputs?.length) ports.push(`outputs ${one.outputs.join(", ")}`);
        if (ports.length) item.appendChild(el("div", "om-why", ports.join(" · ")));
        list.appendChild(item);
      }
      nodesPanel.note(`${countNote(data.nodes.length, "node")} in ${atVersion}`);
      nodesPanel.body.replaceChildren(nodesBar(), list);
    };

    // The picker sits above whatever the panel is showing, so it is in the same place
    // whether the answer is a list, an emptiness or an error.
    const nodesBar = () => {
      const bar = el("div", "om-nodes-bar");
      bar.appendChild(el("span", "om-ref-label", "version"));
      bar.appendChild(picker);
      return bar;
    };
    picker.onchange = () => {
      atVersion = picker.value;
      loaded = false;
      fill();
    };
    nodesPanel.addEventListener("toggle", () => { if (nodesPanel.open) fill(); });
    if (nodesPanel.open) fill();
    body.appendChild(nodesPanel);
  }

  // The registry carries a changelog per version, which almost nothing fills in. Where it is
  // filled in it is the only place a reader can find out what an update actually did, so the
  // section appears when there is something in it and stays out of the way when there is not.
  const noted = versions.filter((entry) => entry.changelog);
  {
    const changes = panel("Changelog",
      noted.length ? countNote(noted.length, "version") : "none published",
      { open: false, remember: "om-changelog-open" });
    const list = el("div", "om-chg");
    if (!noted.length) {
      list.appendChild(el("div", "om-side-status",
        "This pack publishes no changelog. The registry keeps one per version and most "
        + "publishers leave it empty; there is nothing here to show rather than nothing to "
        + "read it with."));
    }
    for (const entry of noted) {
      const item = el("div", "om-chg-item");
      const head = el("div", "om-chg-head");
      head.appendChild(el("div", "om-ver", entry.version));
      if (pack.installed_version && entry.version === pack.installed_version) {
        head.appendChild(el("span", "om-chg-here", "installed"));
      }
      head.appendChild(el("div", "om-why", (entry.created_at || "").slice(0, 10)));
      item.appendChild(head);
      // Publisher text, set as text. The registry does not say what format it is in, and
      // guessing markdown on a field anyone can publish to is how a pack page runs script.
      const note = el("div", "om-chg-text");
      note.textContent = entry.changelog;
      item.appendChild(note);
      list.appendChild(item);
    }
    changes.body.appendChild(list);
    body.appendChild(changes);
  }

  // README, below the version list, only when enrichment is enabled.
  if (app.extensionManager.setting.get("openManager.enrichMetadata")) {
    const readme = el("div", "om-readme");
    readme.appendChild(loadingBlock("Reading the repository"));
    body.appendChild(readme);
    appendReadme(pack.id, readme);
  }

  dialog.appendChild(body);
}

// A pack matched from GitHub but not on the registry. A bare page: the repository, the node
// types it provides, its README, and the same GitHub install the row offers.
function openRepoPack(pack) {
  const backdrop = el("div", "om-backdrop");
  const dialog = el("div", "om-dialog");
  // Full width like the registry pack page, with height following content.
  dialog.style.height = "auto";
  dialog.style.maxHeight = "84vh";
  backdrop.appendChild(dialog);
  document.body.appendChild(backdrop);
  closeOn(backdrop);

  const close = el("button", "om-x", "×");
  close.title = "Close";
  close.onclick = () => backdrop.remove();
  dialog.appendChild(close);

  const hero = el("div", "om-hero");
  const info = el("div", "om-hero-info");
  const titleRow = el("div", "om-title-row");
  const titles = el("div");
  titles.appendChild(el("div", "om-title", pack.title || repoName(pack.repo)));
  titles.appendChild(el("div", "om-sub", pack.repo));
  titleRow.appendChild(titles);
  info.appendChild(titleRow);

  const note = el("div", "om-notice");
  note.appendChild(el("b", null, "Not on the Comfy Registry"));
  note.appendChild(el("div", null,
    "Matched from GitHub. It installs straight from the repository after inspection."));
  info.appendChild(note);

  const actions = el("div", "om-actions om-hero-actions");
  const repoBtn = repoButton(pack.repo, `Open ${pack.repo}`);
  if (repoBtn) actions.appendChild(repoBtn);
  if (repoOwnerName(pack.repo)) actions.appendChild(makeStarButton(pack.repo, null));
  const control = makeInstallControl({
    packId: pack.repo,
    withMenu: false,
    onInstall: () => installFromRepo(pack, control),
  });
  control.setInstall();
  actions.appendChild(control.el);
  info.appendChild(actions);

  if (pack.classes?.length) {
    const provides = el("div", "om-chips");
    provides.appendChild(el("span", "om-chip", `provides ${pack.classes.length} node type(s)`));
    info.appendChild(provides);
    const tags = el("div", "om-tags");
    for (const c of pack.classes) tags.appendChild(el("span", "om-tag", c));
    info.appendChild(tags);
  }

  hero.appendChild(info);

  // The header scrolls with the page rather than being pinned above it, so a long README
  // gets the whole dialog once you have read past the title.
  const body = el("div", "om-body");
  body.appendChild(hero);
  body.appendChild(el("div", "om-release-slot"));
  // The README is read from GitHub behind the same enrichment setting the registry page uses.
  if (app.extensionManager.setting.get("openManager.enrichMetadata")) {
    const readme = el("div", "om-readme");
    readme.appendChild(loadingBlock("Reading the repository"));
    body.appendChild(readme);
    renderMetaInto(readme, api.fetchApi(
      `${API}/repo-meta?repo=${encodeURIComponent(pack.repo)}`));
  } else {
    body.appendChild(el("div", "om-readme-status",
      "Enable README enrichment in Open Manager settings to read the repository here."));
  }
  dialog.appendChild(body);
}

// The repository name from a GitHub URL, for a title where none was matched.
function repoName(url) {
  const match = /github\.com[:/]+[^/]+\/([^/#?]+)/i.exec(url || "");
  return match ? match[1].replace(/\.git$/, "") : (url || "repository");
}

// Fetches and renders the pack README below the version list. The scrape is cached
// server-side by version signature.
async function appendReadme(packId, slot) {
  return renderMetaInto(slot, api.fetchApi(
    `${API}/readme/${encodeURIComponent(packId)}`));
}

// Renders repository facts and the README into a slot from a metadata fetch. Shared by the
// registry pack page and the not-on-registry repository page.
async function renderMetaInto(slot, fetchPromise) {
  let meta;
  try {
    const answer = await fetchPromise;
    meta = await answer.json();
    if (!answer.ok) throw new Error(meta.detail || `HTTP ${answer.status}`);
  } catch (error) {
    slot.replaceChildren(el("div", "om-readme-status", `Repository unavailable: ${error.message}`));
    return;
  }
  slot.replaceChildren();

  // Issue counts, the last push and the rest are facts about the repository, so they join
  // the header's chips rather than sitting under the version list. The metadata arrives
  // after the header is drawn, which is why they are appended to it here.
  const heroActions = packRoot(slot)?.querySelector(".om-hero-actions");
  let facts = heroActions?.querySelector(".om-chips");
  if (heroActions && !facts) {
    facts = el("div", "om-chips");
    heroActions.appendChild(facts);
  }
  const inHeader = Boolean(facts);
  if (!facts) facts = el("div", "om-chips");
  // The registry already names some of these from its own record; a second chip saying the
  // same thing under a different source would only be noise.
  const already = new Set([...facts.querySelectorAll(".om-chip b")]
    .map((b) => b.textContent.trim().toLowerCase()));
  const fact = (label, value) => {
    if (!value || already.has(label)) return;
    already.add(label);
    const node = el("span", "om-chip");
    node.appendChild(el("b", null, label));
    node.appendChild(document.createTextNode(" " + value));
    facts.appendChild(node);
  };
  if (meta.license && !already.has("license")) {
    already.add("license");
    const node = el("span", "om-chip");
    node.appendChild(el("b", null, "license"));
    node.appendChild(document.createTextNode(" " + meta.license));
    if (meta.license_tier) {
      const dot = el("span", "om-dot");
      dot.style.background = meta.license_color || "var(--om-muted)";
      dot.title = meta.license_tier;
      node.appendChild(dot);
    }
    facts.appendChild(node);
  }
  fact("python", meta.requires_python);
  fact("comfyui", meta.requires_comfyui);
  // GitHub's own count, replacing the registry's on the star control once it arrives. Shown
  // as GitHub reports it; a figure that looks wrong is the registry's to correct, and a rule
  // here for spotting one would be guessing at other people's data.
  if (meta.stars) {
    const star = packRoot(slot)?.querySelector(".om-star");
    const label = star?.lastChild;
    if (label && !star.classList.contains("om-starred")) {
      label.textContent = `★ ${Number(meta.stars).toLocaleString()}`;
      star.title = `${Number(meta.stars).toLocaleString()} stars on GitHub. Click to star.`;
    }
  }
  fact("open issues", String(meta.open_issues));
  if (meta.open_prs) fact("open PRs", String(meta.open_prs));
  fact("last push", (meta.pushed_at || "").slice(0, 10));
  if (!inHeader && facts.children.length) slot.appendChild(facts);
  if (meta.topics?.length) {
    const tags = el("div", "om-tags");
    for (const t of meta.topics) tags.appendChild(tagChip(t));
    (heroActions || slot).appendChild(tags);
  }

  // Everything the ref decides lives in one container, so switching branch or commit
  // replaces it rather than redrawing the page.
  const body = el("div", "om-at-ref");
  // The picker belongs with the header's other controls rather than above the README, so it
  // is placed there where a header exists and left in the body where one does not.
  const picker = buildRefPicker(meta, body);
  if (picker.firstChild) (heroActions || slot).appendChild(picker);
  slot.appendChild(body);
  await paintPackBody(body, meta, meta);
}

// The declared table and the README as they stand at one ref. Called first with the pack's
// own metadata, and again with whatever the picker reads.
// Something to look at while a repository is read. Centred and set down from the top, so it
// reads as the page thinking rather than as a line of text that failed to become a page.
function loadingBlock(what) {
  const box = el("div", "om-loading");
  box.appendChild(el("div", "om-loading-spin"));
  box.appendChild(el("div", "om-loading-text", what || "Loading"));
  return box;
}

// Where a document sits, so a link inside it resolves against its own folder rather than
// against the root. `docs/guide.md` linking `images.md` means `docs/images.md`.
function docFolder(path) {
  const cut = String(path || "").lastIndexOf("/");
  return cut < 0 ? "" : String(path).slice(0, cut);
}

// Resolve a relative link against a folder, honouring ./ and ../ the way a path does.
function docResolve(base, href) {
  const parts = String(base || "").split("/").filter(Boolean);
  for (const step of String(href || "").split("/")) {
    if (!step || step === ".") continue;
    if (step === "..") parts.pop();
    else parts.push(step);
  }
  return parts.join("/");
}

//: Declarations honoured from a README's inline `style`. Layout and type only. `position`,
//: `z-index`, `transform` and the offsets are left out: a README should not be able to place
//: anything over the interface around it. Nothing here can fetch, so no `background-image`
//: and no shorthand that hides a `url()`.
const STYLE_ALLOWED = new Set([
  "width", "height", "max-width", "max-height", "min-width", "min-height",
  "margin", "margin-top", "margin-right", "margin-bottom", "margin-left", "margin-inline",
  "padding", "padding-top", "padding-right", "padding-bottom", "padding-left",
  "text-align", "vertical-align", "float", "clear", "display", "gap",
  "color", "background-color", "opacity", "object-fit", "aspect-ratio",
  "font-size", "font-weight", "font-style", "font-family", "line-height",
  "letter-spacing", "text-decoration", "text-transform", "white-space",
  "border", "border-radius", "border-width", "border-style", "border-color",
]);

//: Values refused whatever the property. `url()` would let a README fetch from a third party
//: on open; the rest are ways of smuggling something that is not a value.
const STYLE_REFUSED = /url\(|image-set\(|expression\(|javascript:|@import|[<>{}]|\\/i;

//: A fenced block, an inline code span, or an HTML tag. Ordered alternation, so a tag written
//: inside an example is consumed as part of the example and stays one.
//:
//: Indented lines are deliberately not treated as code. Four-space indentation inside a
//: `<div align="center">` is how the markup in issue #15 is written, and protecting it meant
//: the one case this exists for was the one case it skipped.
const MD_SCAN = /```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]+`|<\/?[a-zA-Z][^>]*>/g;

// Carry each inline `style` past ComfyUI's sanitiser, which empties the attribute.
//
// Args:
//   text: Markdown as published.
// Returns:
//   The same markdown with style attributes renamed, to be read back by applyInlineStyle.
function carryInlineStyle(text) {
  let inCode = 0;
  return String(text || "").replace(MD_SCAN, (chunk) => {
    if (!chunk.startsWith("<")) return chunk;
    const tag = /^<(\/?)(pre|code|samp|kbd)\b/i.exec(chunk);
    if (tag) { inCode = Math.max(0, inCode + (tag[1] ? -1 : 1)); return chunk; }
    if (inCode) return chunk;
    return chunk.replace(/(\sstyle\s*=\s*)("[^"]*"|'[^']*'|[^\s>]+)/gi, " data-om-style=$2");
  });
}

// Apply what the author asked for, one declaration at a time, refusing anything not listed.
//
// Args:
//   view: The rendered markdown.
function applyInlineStyle(view) {
  for (const node of view.querySelectorAll("[data-om-style]")) {
    const asked = node.getAttribute("data-om-style") || "";
    node.removeAttribute("data-om-style");
    for (const part of asked.split(";")) {
      const at = part.indexOf(":");
      if (at < 0) continue;
      const name = part.slice(0, at).trim().toLowerCase();
      let value = part.slice(at + 1).trim();
      let priority = "";
      if (/!\s*important$/i.test(value)) {
        priority = "important";
        value = value.replace(/!\s*important$/i, "").trim();
      }
      if (!value || !STYLE_ALLOWED.has(name) || STYLE_REFUSED.test(value)) continue;
      try { node.style.setProperty(name, value, priority); } catch { /* browser said no */ }
    }
  }
}

// Render markdown into a view and wire everything that follows from it. One path, so a
// linked document behaves exactly as the README does: same sanitising, same media, same
// heading links, same workflow offers.
async function renderMarkdownInto(view, text, meta, ref, base) {
  try {
    const html = await app.extensionManager.renderMarkdownToHtml(carryInlineStyle(text));
    view.innerHTML = typeof html === "string" ? html : "";
    applyInlineStyle(view);
    view._repository = meta.repository || "";
    linkHeadings(view);
    absolutiseLinks(view, meta.repository, ref, { meta, base: base || "" });
    embedMediaLinks(view, await attachmentMedia(view, meta.repository));
    offerImageWorkflows(view);
  } catch {
    view.replaceChildren();
    const pre = el("pre");
    pre.textContent = text;
    view.appendChild(pre);
  }
}

// Open one of the pack's own documents in place. The README it came from is kept so the way
// back is the document itself rather than a reload of the page.
async function openPackDoc(view, meta, ref, path) {
  const stack = view._docStack || (view._docStack = []);
  stack.push({ text: view._docText, path: view._docPath });
  view._docText = "";
  view._docPath = path;
  view.replaceChildren(loadingBlock(`Reading ${path.split("/").pop()}`));
  let answer;
  try {
    answer = await (await api.fetchApi(
      `${API}/doc?repo=${encodeURIComponent(meta.repository || "")}`
      + `&branch=${encodeURIComponent(ref || "")}&path=${encodeURIComponent(path)}`)).json();
  } catch (error) {
    answer = { ok: false, reason: error.message };
  }
  if (!answer?.ok) {
    // Nothing to show, so the reader goes back rather than being left on an empty page, and
    // is told why the link did not open here.
    notify("Not found in the repository", `${path}: ${answer?.reason || "it could not be read"}.`);
    await backFromDoc(view, meta, ref);
    return;
  }
  view._docText = answer.text;
  await renderMarkdownInto(view, answer.text, meta, ref, docFolder(path));
  const trail = el("div", "om-doc-trail");
  const back = el("button", "om-btn om-doc-back", "Back");
  back.onclick = () => backFromDoc(view, meta, ref);
  trail.appendChild(back);
  trail.appendChild(el("span", "om-doc-where", path));
  view.insertBefore(trail, view.firstChild);
  view.scrollIntoView({ block: "start" });
}

async function backFromDoc(view, meta, ref) {
  const stack = view._docStack || [];
  const previous = stack.pop() || { text: view._readme, path: "" };
  view._docText = previous.text;
  view._docPath = previous.path;
  view.replaceChildren(loadingBlock("Going back"));
  await renderMarkdownInto(view, previous.text || view._readme || "", meta, ref,
                           docFolder(previous.path));
  if (previous.path) {
    const trail = el("div", "om-doc-trail");
    const back = el("button", "om-btn om-doc-back", "Back");
    back.onclick = () => backFromDoc(view, meta, ref);
    trail.appendChild(back);
    trail.appendChild(el("span", "om-doc-where", previous.path));
    view.insertBefore(trail, view.firstChild);
  }
}

async function paintPackBody(host, meta, source) {
  host.replaceChildren();
  appendDeveloperBlock(host, { ...meta, developer: source.developer || {} });
  if (!source.readme) {
    host.appendChild(el("div", "om-readme-status",
      source.ref ? `No README at ${source.ref}.` : "No README in the repository."));
    return;
  }
  const view = el("div", "om-readme-body");
  view._readme = source.readme;
  view._docText = source.readme;
  view._docPath = "";
  host.appendChild(view);
  await renderMarkdownInto(view, source.readme, meta, source.ref || meta.default_branch, "");
}

// A branch or commit offered for install at the top of the version list. The registry has
// no build for it, so it is fetched from GitHub, inspected like any other repository install
// and marked as replacing whatever is already in place.
function buildRefInstallRow(meta, ref, caption) {
  const isSha = /^[0-9a-f]{7,40}$/i.test(ref);
  const repoName = (meta.repository || "").replace(/\/+$/, "").split("/").pop() || ref;
  const row = el("div", "om-row om-ref-row");
  row.appendChild(el("div", "om-ver", isSha ? ref.slice(0, 7) : ref));
  const kind = el("span", "om-badge", isSha ? "commit" : "branch");
  kind.style.background = "#8957e5";
  row.appendChild(kind);
  row.appendChild(el("div", "om-why", isSha ? "from GitHub" : "branch head"));
  row.appendChild(el("div", "om-why", caption || "not registry-scanned"));
  const control = makeInstallControl({
    packId: repoName,
    entry: { name: repoName, version: ref },
    withMenu: false,
    onInstall: () => installFromRepo(
      { repo: meta.repository, title: repoName, ref, overwrite: true }, control),
  });
  control.setInstall();
  row.appendChild(control.el);
  return row;
}

// Which branch or commit the page is read at. The list costs two GitHub API calls, so it is
// fetched when the picker is first opened rather than on every pack page; reading at the
// chosen ref afterwards only touches the raw content host and costs nothing against the
// hourly limit.
function buildRefPicker(meta, host) {
  const bar = el("div", "om-refbar");
  const repo = meta.repository || "";
  if (!repo.toLowerCase().includes("github.com")) return bar;
  //: The versions the registry publishes, read from the list already on the page. Used only
  //: to mark a tag that matches one, which is the tag a reader is most likely to want.
  const publishedVersions = () => new Set(
    [...(packRoot(host)?.querySelectorAll(".om-versions .om-ver") || [])]
      .map((n) => n.firstChild?.textContent?.trim() || n.textContent.trim()));

  const current = meta.default_branch || "main";
  const select = el("select", "om-side-select om-ref-select");
  const first = el("option", null, current);
  first.value = current;
  select.appendChild(first);
  const status = el("span", "om-side-status", "");

  // Sitting among the header chips, the control takes the width of what it is showing
  // rather than of the longest branch name or commit message in the list.
  const probe = el("span", "om-ref-probe");
  const fitToSelection = () => {
    const chosen = select.options[select.selectedIndex];
    if (!chosen) return;
    probe.style.font = getComputedStyle(select).font;
    probe.textContent = chosen.textContent;
    const text = Math.ceil(probe.getBoundingClientRect().width);
    select.style.width = `${Math.min(280, Math.max(88, text + 36))}px`;
    select.title = chosen.title || chosen.textContent;
  };

  let loaded = false;
  const loadRefs = async () => {
    if (loaded) return;
    loaded = true;
    status.textContent = "reading branches...";
    try {
      const query = new URLSearchParams({ repo });
      const data = await (await api.fetchApi(`${API}/refs?${query}`)).json();
      if (!data.ok) { status.textContent = data.reason || "refs unavailable"; return; }
      status.textContent = "";
      const seen = new Set([current]);
      const group = (label, options) => {
        if (!options.length) return;
        const box = el("optgroup");
        box.label = label;
        for (const option of options) box.appendChild(option);
        select.appendChild(box);
      };
      group("Branches", (data.branches || []).filter((b) => !seen.has(b.name) && seen.add(b.name))
        .map((b) => { const o = el("option", null, b.name); o.value = b.name; return o; }));
      // Tags before commits: a tag is where a release was cut, so it is the ref a reader
      // actually wants when they are asking to see the pack "at" a version. A tag whose name
      // matches a published version says so, since that is the whole reason to pick it.
      const known = publishedVersions();
      group("Tags", (data.tags || []).filter((t) => !seen.has(t.name) && seen.add(t.name))
        .map((t) => {
          const published = known.has(t.name.replace(/^v/, ""));
          const o = el("option", null, published ? `${t.name} · published` : t.name);
          o.value = t.name;
          o.title = published
            ? `${t.name}: the registry publishes this version`
            : `${t.name} (${t.sha})`;
          return o;
        }));
      group("Recent commits", (data.commits || []).map((c) => {
        const subject = (c.message || "(no message)").slice(0, 44);
        const o = el("option", null, `${c.short} · ${subject}`);
        o.value = c.sha;
        o.title = `${c.short} ${c.date ? c.date.slice(0, 10) : ""} ${c.message || ""}`.trim();
        return o;
      }));
      fitToSelection();
    } catch (error) {
      status.textContent = "refs unavailable";
    }
  };
  select.addEventListener("mousedown", loadRefs, { once: true });
  select.addEventListener("focus", loadRefs, { once: true });

  select.addEventListener("change", async () => {
    const ref = select.value;
    status.textContent = "reading...";
    try {
      const query = new URLSearchParams({ repo, ref });
      const data = await (await api.fetchApi(`${API}/readme-at?${query}`)).json();
      if (!data.ok) { status.textContent = data.reason || "could not read that ref"; return; }
      status.textContent = "";
      fitToSelection();
      await paintPackBody(host, meta, data);
      // Switching ref repaints the README, themes, gallery and workflows in place, which
      // looks like the page simply changing its mind. This says what is being shown and
      // offers the way back, so the state is visible rather than inferred from the dropdown.
      markRef(ref, select.options[select.selectedIndex]?.textContent || ref);
      offerRef(ref, select.options[select.selectedIndex]?.textContent || "");
    } catch (error) {
      status.textContent = "could not read that ref";
    }
  });

  //: A ref short enough for a title bar. A commit sha is unreadable at full length and a
//: branch or tag name is already what the reader chose.
function shortRef(ref) {
  const text = String(ref || "");
  return /^[0-9a-f]{40}$/i.test(text) ? text.slice(0, 7) : text;
}

// A banner above the repository content naming the ref it was read at. Removed again when
  // the default branch is chosen, because that is the state that needs no explaining.
  const markRef = (ref, caption) => {
    const page = packRoot(host) || host;
    page.querySelector(".om-ref-note")?.remove();
    // In a window, the title bar is the one part always on screen, so the ref goes there too.
    const holder = page.classList?.contains("om-float") ? page : null;
    if (holder) {
      const handle = [...floatPanels.values()].find((one) => one.el === holder);
      const base = handle?._baseTitle
        || (handle ? (handle._baseTitle = holder.querySelector(".om-float-title")?.textContent
          || "") : "");
      handle?.setTitle?.(ref && ref !== current ? `${base} @ ${shortRef(ref)}` : base);
    }
    if (!ref || ref === current) return;
    const note = el("div", "om-notice om-ref-note");
    note.appendChild(el("b", null, `Showing ${caption}`));
    note.appendChild(document.createTextNode(
      " The README, gallery, themes and example workflows below are read from the repository "
      + "at this ref, not from the default branch. Versions and registry data are unchanged."));
    const back = el("button", "om-btn om-ref-back", `Back to ${current}`);
    back.onclick = () => {
      select.value = current;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    };
    note.appendChild(back);
    const readme = page.querySelector(".om-readme");
    if (readme) readme.parentNode.insertBefore(note, readme);
    else page.appendChild(note);
  };

  // The registry publishes no build for a branch or a commit, so when one is chosen it is
  // put at the top of the version list and installed from GitHub instead. Choosing the
  // default branch again takes the row away.
  const offerRef = (ref, caption) => {
    const versions = packRoot(host)?.querySelector(".om-versions");
    if (!versions) return;
    versions.querySelector(".om-ref-row")?.remove();
    if (!ref || ref === current) return;
    versions.prepend(buildRefInstallRow(meta, ref, caption));
    // No use offering it inside a section that is closed.
    versions.closest("details")?.setAttribute("open", "");
  };

  bar.appendChild(el("span", "om-ref-label", "ref"));
  bar.appendChild(select);
  bar.appendChild(status);
  bar.appendChild(probe);
  fitToSelection();
  return bar;
}

// Why the registry gave each version its status. Asked for separately because the registry
// only returns reasons on request and answers in megabytes; the backend summarises, and the
// badges pick the sentence up on hover once it lands. Only fetched when something is not
// plainly active, since that is the only time the answer is worth the round trip.
async function attachStatusReasons(packId, versionsBox, versions) {
  if (!packId || !(versions || []).some((v) => (v.status || "").toLowerCase() !== "active")) return;
  let reasons;
  try {
    const answer = await api.fetchApi(`${API}/status-reasons/${encodeURIComponent(packId)}`);
    const data = await answer.json();
    if (!data.ok) return;
    reasons = data.reasons || {};
  } catch {
    return;
  }
  for (const mark of versionsBox.querySelectorAll(".om-badge[data-version]")) {
    const why = reasons[mark.dataset.version];
    if (why) mark.title = why;
  }
}

// A pack placed but not yet wired in: its requirements are still waiting, and ComfyUI has
// not been asked to restart. The scan decides which way that goes.
async function scanThenFinish(packId) {
  await new Promise((resolve) => {
    openScanDialog(packId, {
      onDone: async (state) => {
        if (!state) { resolve(); return; }
        const flagged = state.flagged || [];
        if (flagged.length) {
          const keep = await confirmAction(
            `${flagged.length} file(s) flagged in ${packId}`,
            flagged.map((f) => `${f.file}: ${f.malicious} of ${f.engines} engines`).join("\n")
            + "\n\nInstall its requirements anyway, or remove the pack?",
            "Install requirements anyway",
          );
          if (!keep) {
            await uninstall({ packId, entry: { name: packId } });
            resolve();
            return;
          }
        }
        try {
          const answer = await api.fetchApi(`${API}/install-requirements`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: packId }),
          });
          const done = await answer.json();
          if (!done.ok) notify("Requirements", done.output || done.reason || "did not install cleanly");
        } catch (error) {
          notify("Requirements", error.message);
        }
        resolve();
      },
    });
  });
}

// A reputation scan of an installed pack. Only hashes are sent; the files stay put. The
// public allowance is four lookups a minute, so this takes a while and reports as it goes.
function openScanDialog(packId, { onDone } = {}) {
  const backdrop = el("div", "om-backdrop");
  const dialog = el("div", "om-dialog");
  dialog.style.width = "min(90vw, 820px)";
  dialog.style.height = "auto";
  dialog.style.maxHeight = "86vh";
  const head = el("div", "om-head");
  head.appendChild(el("div", "om-title", `Scanning ${packId}`));
  dialog.appendChild(head);
  const body = el("div", "om-body");
  const status = el("div", "om-side-status", "Starting...");
  const list = el("div", "om-wf-list");
  body.appendChild(status);
  body.appendChild(list);
  dialog.appendChild(body);
  const foot = el("div", "om-foot");
  const close = el("button", "om-btn", "Close");
  close.onclick = () => { backdrop.remove(); onDone?.(null); };
  foot.appendChild(close);
  dialog.appendChild(foot);
  backdrop.appendChild(dialog);
  document.body.appendChild(backdrop);

  const draw = (state) => {
    const spent = `${state.budget_used}/${state.budget} used today`;
    status.textContent = state.scanning
      ? `${state.done} of ${state.total} checked · ${spent}`
      : (state.error
          ? `Stopped: ${state.error} · ${spent}`
          : `${state.done} file(s) checked · ${spent}`);
    list.replaceChildren();
    for (const r of state.results || []) {
      const row = el("div", "om-wf-item");
      row.appendChild(el("span", "om-wf-name", r.file));
      const note = {
        flagged: `${r.malicious} of ${r.engines} engines call this malicious`,
        known: `seen before, ${r.malicious} of ${r.engines} engines flag it`,
        unknown: "not seen by VirusTotal before",
        budget: "not checked, the day's allowance is spent",
        unreadable: "could not be read",
        error: r.detail || "lookup failed",
      }[r.state] || r.state;
      const tag = el("span", "om-wf-path", note);
      if (r.state === "flagged") tag.style.color = "#f85149";
      row.appendChild(tag);
      list.appendChild(row);
    }
    if (!state.scanning && !(state.results || []).length && !state.error) {
      list.appendChild(stateRow("Nothing in this pack needs checking"));
    }
  };

  (async () => {
    try {
      const answer = await api.fetchApi(`${API}/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: packId }),
      });
      const started = await answer.json();
      if (!started.ok) { status.textContent = started.reason || "could not start"; return; }
    } catch (error) {
      status.textContent = error.message;
      return;
    }
    for (let i = 0; i < 4000; i++) {
      let state;
      try { state = await (await api.fetchApi(`${API}/scan/state`)).json(); }
      catch { status.textContent = "connection lost"; return; }
      draw(state);
      if (!state.scanning) {
        const bad = (state.results || []).filter((r) => r.state === "flagged");
        onDone?.({ ...state, flagged: bad });
        close.textContent = "Close";
        return;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  })();
  return backdrop;
}

// The pack's [tool.open_manager] declarations: matched incompatibilities, a source
// preference, links, and example workflows that load into the graph on click.
function appendDeveloperBlock(slot, meta) {
  const dev = meta.developer || {};
  const matched = (meta.incompatible || []).filter((entry) => entry.matched);
  const workflows = dev.example_workflows || [];
  const themes = dev.themes || [];
  const gallery = panelSetting("openManager.galleryShow", true) ? (dev.gallery || []) : [];

  // The author's note on the current release, placed above the version list.
  const releaseSlot = packRoot(slot)?.querySelector(".om-release-slot");
  if (dev.release_note && releaseSlot) {
    releaseSlot.replaceChildren();
    const note = el("div", "om-release");
    note.appendChild(el("b", null, "From the developer"));
    note.appendChild(el("div", "om-release-body", dev.release_note));
    releaseSlot.appendChild(note);
  }

  if (!matched.length && !dev.source && !dev.docs && !dev.funding
    && !workflows.length && !themes.length && !gallery.length) return;

  const block = el("div", "om-dev");

  for (const entry of matched) {
    const card = el("div", "om-ack");
    card.appendChild(el("b", null, `Developer declares this incompatible with ${entry.spec}`));
    card.appendChild(el("div", null, `Installed ${entry.name} ${entry.installed} matches.`));
    block.appendChild(card);
  }

  if (dev.source === "github") {
    const note = el("div", "om-notice");
    note.appendChild(el("b", null,
      `Developer recommends installing from GitHub${dev.branch ? ` (branch ${dev.branch})` : ""}`));
    block.appendChild(note);
  }

  if (dev.docs || dev.funding) {
    const links = el("div", "om-actions");
    if (dev.docs) {
      const b = el("button", "om-btn", "Docs");
      b.title = dev.docs;
      b.onclick = () => openUrl(dev.docs);
      links.appendChild(b);
    }
    if (dev.funding) {
      const b = el("button", "om-btn", "Funding");
      b.title = dev.funding;
      b.onclick = () => openUrl(dev.funding);
      links.appendChild(b);
    }
    const hero = packRoot(slot)?.querySelector(".om-hero-actions");
    if (hero) for (const b of [...links.children]) hero.appendChild(b);
    else block.appendChild(links);
  }

  if (gallery.length) block.appendChild(buildGallery(meta, gallery));

  if (themes.length) {
    block.appendChild(collapsible("Themes", themes, (path) => {
      const item = el("button", "om-wf-item");
      item.appendChild(el("span", "om-wf-name", path.split("/").pop().replace(/\.json$/, "")));
      item.appendChild(el("span", "om-wf-path", path));
      item.title = `Add ${path} to your themes`;
      item.onclick = () => addPackTheme(meta.repository, meta.default_branch, path, item);
      return item;
    }, { note: countNote(themes.length, "theme"), remember: "om-themes-open" }));
  }

  if (workflows.length) {
    const previews = dev.example_workflow_previews || {};
    block.appendChild(collapsible("Example workflows", workflows, (path) => {
      const item = el("button", "om-wf-item");
      // A preview beside the workflow, where the pack ships one. Shows what it produces
      // before it is loaded.
      if (previews[path]) {
        const shot = el("img", "om-wf-shot");
        shot.loading = "lazy";
        shot.alt = "";
        shot.src = galleryUrl(previews[path], meta);
        shot.onerror = () => shot.remove();
        item.appendChild(shot);
      }
      item.appendChild(el("span", "om-wf-name", path.split("/").pop()));
      item.appendChild(el("span", "om-wf-path", path));
      item.title = `Load ${path}`;
      item.onclick = () => loadExampleWorkflow(meta.repository, meta.default_branch, path);
      return item;
    }, { note: countNote(workflows.length, "workflow"), remember: "om-workflows-open" }));
  }

  slot.appendChild(block);
}

// A section that collapses to its header bar. `note` is all that stays visible when
// closed; `remember` keys the open state so a choice survives reopening the page.
function panel(title, note, { open = true, remember = "" } = {}) {
  const box = el("details", "om-panel");
  const head = el("summary", "om-panel-head");
  head.appendChild(el("span", "om-panel-title", title));
  head.appendChild(el("span", "om-panel-note", note || ""));
  head.appendChild(el("span", "om-panel-chevron", "▾"));
  box.appendChild(head);
  const body = el("div", "om-panel-body");
  box.appendChild(body);
  box.body = body;
  // The header note is written before the contents are known in the sections that load on
  // demand, so it has to be rewritable once they arrive.
  box.note = (text) => { head.querySelector(".om-panel-note").textContent = text; };

  let start = open;
  if (remember) {
    try {
      const saved = localStorage.getItem(remember);
      if (saved !== null) start = saved === "1";
    } catch {}
    box.addEventListener("toggle", () => {
      try { localStorage.setItem(remember, box.open ? "1" : "0"); } catch {}
    });
  }
  box.open = start;
  return box;
}

// A section holding a list of paths, in the same container the version list uses so every
// section of a pack page reads as one stack rather than as a box and some loose headings.
// `note` is what the header says while it is closed, so it has to be worth reading on its
// own. `listClass` swaps the single column for another layout, which the gallery uses for
// its grid.
function collapsible(title, paths, build, {
  listClass = "om-wf-list", open = false, remember = "", note = "",
} = {}) {
  const box = panel(title, note || String(paths.length), { open, remember });
  const list = el("div", listClass);
  for (const path of paths) list.appendChild(build(path));
  box.body.appendChild(list);
  return box;
}

// How many of a thing, said in words rather than as a bare number, because "1" beside a
// heading leaves the reader to guess what was counted.
function countNote(count, noun) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

//: Which keys are held. Filled at start-up and kept in step as they are set. Values never
//: appear here, because they never leave the server: a key is read from its store by the
//: request that needs it, so nothing has to carry one about.
const keysHeld = { huggingface: false, github: false, virustotal: false };

async function loadKeys() {
  try {
    const found = await (await api.fetchApi(`${API}/keys`)).json();
    for (const [name, entry] of Object.entries(found.keys || {})) {
      keysHeld[name] = !!entry.set;
    }
    return found;
  } catch {
    return null;
  }
}

// A key typed into ComfyUI's settings is written to comfy.settings.json, handed back in full
// by GET /settings, and shown in the box that set it. Anything found there is moved into the
// store and the setting emptied, once, and the reader is told it happened rather than left to
// notice. Nothing is moved silently.
async function migrateKeys() {
  const moving = [
    ["openManager.virusTotalKey", "virustotal", "VirusTotal key"],
    ["openManager.githubToken", "github", "GitHub token"],
  ];
  const moved = [];
  for (const [id, name, label] of moving) {
    let value = "";
    try { value = String(app.extensionManager.setting.get(id) || "").trim(); } catch { continue; }
    if (!value) continue;
    const answer = await dlPost("/keys", { name, value });
    if (!answer?.ok) continue;
    try { await app.extensionManager.setting.set(id, ""); } catch { /* left as it was */ }
    keysHeld[name] = true;
    moved.push(label);
    if (answer.warning) {
      notify("Key stored, with a caveat", `${label}: ${answer.warning}.`);
    }
  }
  if (moved.length) {
    toast(`${moved.join(" and ")} moved out of ComfyUI's settings into Open Manager's own `
          + `store. Set them from Access keys in Open Manager from now on.`,
          { kind: "ok", sticky: true });
  }
}

// The switch this replaced was a boolean that defaulted to the classic menu, which meant a
// modern install opened the old menu unless someone turned it off. Anyone who did express a
// preference keeps it; anyone who did not gets the flag followed instead.
function migrateEntryMode() {
  let old;
  try { old = app.extensionManager.setting.get("openManager.classicMenu"); } catch { return; }
  if (old === undefined || old === null) return;
  try {
    const asked = app.extensionManager.setting.get("openManager.managerEntry");
    if (asked && asked !== "auto") return;
    app.extensionManager.setting.set("openManager.managerEntry", old === false ? "panel" : "classic");
    app.extensionManager.setting.set("openManager.classicMenu", null);
  } catch {
    // Left as it was; the flag decides in the meantime.
  }
}

// Which Open Manager this is, and what updating it takes. The two install shapes update
// differently and the difference is not something a reader can see, so the server is asked
// rather than guessed at: a custom node has the ordinary pack update, a package needs a
// command in a terminal naming the interpreter that is actually running the server.
async function openAboutDialog() {
  let info = null;
  try {
    const answer = await api.fetchApi(`${API}/self`);
    if (answer.ok) info = await answer.json();
  } catch {
    // Left null; the dialog says so rather than showing nothing.
  }

  const backdrop = el("div", "om-backdrop");
  const box = el("div", "om-note om-note-wide");
  box.appendChild(el("div", "om-note-title", "Open Manager"));

  if (!info) {
    box.appendChild(el("div", "om-dl-note",
      "The server did not answer, so how this copy is installed is unknown. It is running, "
      + "so this is most likely a route that predates this panel: restart ComfyUI and try "
      + "again."));
  } else {
    const packaged = info.mode === "package";
    const facts = el("div", "om-keys-row");
    const head = el("div", "om-dl-top");
    head.appendChild(el("span", "om-dl-name", `Version ${info.version}`));
    head.appendChild(el("span", "om-dl-src",
      packaged ? "installed as a package" : "installed as a custom node"));
    facts.appendChild(head);
    facts.appendChild(el("div", "om-dl-note", info.path));
    box.appendChild(facts);

    if (packaged) {
      box.appendChild(el("div", "om-dl-note",
        "Open Manager is standing in for ComfyUI Manager, from site-packages. A running "
        + "server cannot rewrite the package it is importing, so it cannot update itself "
        + "from here. Run this instead:"));
      for (const step of info.steps || []) {
        const row = el("div", "om-keys-row");
        row.appendChild(el("div", "om-dl-note", step.label));
        const line = el("div", "om-keys-line");
        // A single-line input showed the interpreter path and hid the rest, which on a
        // portable build is the half that says what is being installed. This wraps, and a
        // click selects the whole command for anyone who would rather not use the button.
        const field = el("div", "om-cmd", step.command);
        line.appendChild(field);
        const copy = el("button", "om-btn", "Copy");
        copy.onclick = () => {
          navigator.clipboard?.writeText(step.command)
            .then(() => toast("Command copied.", { kind: "ok" }))
            .catch(() => notify("Not copied", "The clipboard is not available here."));
        };
        line.appendChild(copy);
        row.appendChild(line);
        box.appendChild(row);
      }
      if (info.note) box.appendChild(el("div", "om-dl-note", info.note));
    } else {
      box.appendChild(el("div", "om-dl-note",
        "Open Manager is a pack in custom_nodes, so it updates the way every other pack "
        + "does: open its page and install the version you want."));
      const line = el("div", "om-keys-line");
      const go = el("button", "om-btn om-go", "Open its page");
      go.onclick = () => { backdrop.remove(); openPack(info.node_id); };
      line.appendChild(go);
      box.appendChild(line);
      if (info.from_git) {
        box.appendChild(el("div", "om-dl-note",
          "This one is a git working copy. Installing over it replaces the directory, so "
          + "commit or stash anything you have changed there first."));
      }
    }
  }

  const foot = el("div", "om-note-foot");
  const close = el("button", "om-btn", "Close");
  close.onclick = () => backdrop.remove();
  foot.appendChild(close);
  box.appendChild(foot);
  backdrop.appendChild(box);
  document.body.appendChild(backdrop);
  closeOn(backdrop);
}

// Where a key is set, and the only place one is typed. The box is a password field, it is
// never filled with what is already held, and what is held is described by its last four
// characters because that is enough to tell two apart.
async function openKeysDialog() {
  const found = await loadKeys();
  const backdrop = el("div", "om-backdrop");
  const box = el("div", "om-note om-note-wide");
  box.appendChild(el("div", "om-note-title", "Access keys"));
  box.appendChild(el("div", "om-dl-note",
    "Kept in Open Manager's own file, restricted to this account, and used only by this "
    + "server. They are not written to ComfyUI's settings, not sent in a URL, and there is "
    + "no route that returns one. They are not encrypted: a key this server has to use "
    + "unattended cannot be hidden from the account it runs as, and a file that decrypts "
    + "itself is not encryption."));
  box.appendChild(el("div", "om-dl-note",
    "An environment variable is used instead where one is set, for a deployment that would "
    + "rather inject its secrets. Nothing here writes a key into the environment: this "
    + "process loads third-party packs that can read it, and pip inherits it when a pack's "
    + "requirements are installed."));
  if (found?.warning) box.appendChild(el("div", "om-dl-note om-dl-bad", found.warning));

  const rows = el("div", "om-keys");
  // Every key the server knows about, described by the server. Keeping a second list here is
  // how a key ends up settable in one place and invisible in the other.
  for (const [name, entry] of Object.entries(found?.keys || {})) {
    const label = entry.label || name;
    const placeholder = entry.placeholder || "";
    const why = entry.purpose || "";
    const fromEnv = entry.source === "environment";
    const row = el("div", "om-keys-row");
    const head = el("div", "om-dl-top");
    head.appendChild(el("span", "om-dl-name", label));
    const state = el("span", "om-dl-src", entry.set
      ? `${fromEnv ? "from the environment" : "held"} ${entry.hint}` : "not set");
    if (fromEnv) state.title = `Read from ${entry.env}.`;
    head.appendChild(state);
    row.appendChild(head);
    row.appendChild(el("div", "om-dl-note", why));
    if (fromEnv) {
      // Saving here would write a key that is never read, which is the kind of setting that
      // looks like it worked and did not.
      row.appendChild(el("div", "om-dl-note om-dl-bad",
        `${entry.env} is set, so that is the key in use. `
        + `${entry.shadowed ? "What is stored here is" : "Anything saved here is"} ignored `
        + "until the variable is unset."));
    }

    const line = el("div", "om-keys-line");
    const input = el("input", "om-search om-keys-input");
    input.type = "password";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.placeholder = entry.set ? "Replace it: paste a new one" : (placeholder || "Paste it here");
    line.appendChild(input);

    const save = el("button", "om-btn om-go", "Save");
    save.onclick = async () => {
      const value = input.value.trim();
      if (!value) return;
      save.disabled = true;
      const answer = await dlPost("/keys", { name, value });
      // Cleared whatever the answer, so a key never sits in a field waiting to be read
      // over someone's shoulder or picked up by a password manager.
      input.value = "";
      save.disabled = false;
      if (!answer?.ok) { notify("Not saved", answer?.reason || "It could not be written."); return; }
      keysHeld[name] = true;
      state.textContent = fromEnv ? `from the environment ${entry.hint}` : `held ${answer.hint}`;
      forget.style.display = "";
      toast(`${label} key saved.`, { kind: "ok" });
      if (answer.warning) notify("Saved, with a caveat", `${label}: ${answer.warning}.`);
    };
    line.appendChild(save);

    const forget = el("button", "om-btn", "Forget");
    forget.style.display = entry.set ? "" : "none";
    forget.onclick = async () => {
      const go = await chooseAction(`Forget the ${label} key?`,
        "It is removed from disk. Anything that needed it stops working until another is set.",
        [{ key: "go", label: "Forget it", primary: true }], { wide: true });
      if (!go) return;
      const answer = await dlPost("/keys", { name, forget: true });
      if (!answer?.ok) { notify("Not removed", answer?.reason || "It could not be written."); return; }
      keysHeld[name] = false;
      state.textContent = "not set";
      forget.style.display = "none";
      toast(`${label} key forgotten.`, { kind: "ok" });
    };
    line.appendChild(forget);
    row.appendChild(line);
    rows.appendChild(row);
  }
  box.appendChild(rows);
  if (found?.path) {
    const where = el("div", "om-dl-note", `Stored at ${found.path}`);
    box.appendChild(where);
  }

  const foot = el("div", "om-note-foot");
  const close = el("button", "om-btn", "Close");
  close.onclick = () => backdrop.remove();
  foot.appendChild(close);
  box.appendChild(foot);
  backdrop.appendChild(box);
  document.body.appendChild(backdrop);
  closeOn(backdrop);
}

// Whether a VirusTotal key is held. Nothing in the panel offers a scan until one is set, and
// the key itself is read by the server rather than carried here.
function vtKey() {
  return keysHeld.virustotal ? "set" : "";
}

// Whether scanning is available at all. Every entry point checks this, so the feature is
// invisible rather than present-and-broken for anyone who has not set a key up.
function vtReady() {
  return vtKey().length > 0;
}

// Today's remaining allowance, or null where it could not be read.
async function vtRemaining() {
  try {
    const s = await (await api.fetchApi(`${API}/scan/state`)).json();
    return Math.max(0, (s.budget || 0) - (s.budget_used || 0));
  } catch {
    return null;
  }
}

// The configured GitHub token, empty when none is set. Sent with the calls that read the
// API so they draw on the 5,000 an hour a token allows rather than the 60 it does not.


// A panel setting, with a fallback for when the settings store is not reachable.
function panelSetting(key, fallback) {
  try {
    const value = app.extensionManager.setting.get(key);
    return value === undefined || value === null ? fallback : value;
  } catch {
    return fallback;
  }
}

// Where one gallery entry's image lives. An absolute URL is used as the pack gave it; a
// repository path goes through the backend, which reads it from the installed copy or from
// GitHub and refuses anything whose bytes are not an image.
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

// The pack's gallery: a grid of thumbnails that open a full view. The thumbnail edge is a
// setting and the grid fills to whatever width it is given, so the same markup suits a
// narrow dialog and a wide one.
function buildGallery(meta, entries) {
  const thumb = Math.max(80, Math.min(320, Math.round(Number(panelSetting("openManager.galleryThumb", 120)) || 120)));
  const box = collapsible("Gallery", entries, (entry) => {
    const cell = el("button", "om-gal-cell");
    cell.type = "button";
    cell.title = entry;
    cell._url = galleryUrl(entry, meta);
    cell._label = entry.split("/").pop() || entry;
    // A gallery entry may be a clip. Authors list them, and a still cannot show motion.
    const moving = isMovingMedia(entry);
    const img = moving ? el("video", "om-gal-img") : el("img", "om-gal-img");
    if (moving) {
      img.muted = true;
      img.loop = true;
      img.playsInline = true;
      img.preload = "metadata";
      // Motion on hover only: a grid of autoplaying clips is noise, and a still frame is
      // enough to pick one out.
      cell.onmouseenter = () => { img.play?.().catch(() => {}); };
      cell.onmouseleave = () => { try { img.pause(); img.currentTime = 0; } catch {} };
    } else {
      img.loading = "lazy";
      img.decoding = "async";
      img.alt = cell._label;
    }
    img.src = cell._url;
    // A tile that cannot load is taken out rather than left broken, and the count follows
    // it down so the heading never promises more than is on screen. The full view is built
    // from what is left, so its paging never lands on a missing image.
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

// The full view over a gallery: one image at a time, with the keyboard, the arrows, or the
// backdrop to leave. It sits above the pack dialog and restores focus on the way out.
//: Whether a gallery entry is a clip rather than a still. One test, used by the grid and by
//: the full view, so the two cannot disagree about what they are showing.
function isMovingMedia(url) {
  return /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(String(url || ""));
}

function openLightbox(items, index) {
  if (!items.length) return;
  let at = index;
  const back = el("div", "om-lb");
  const figure = el("figure", "om-lb-fig");
  const caption = el("figcaption", "om-lb-cap");
  // The grid already knows a gallery entry may be a clip and draws a <video> for one. The
  // full view did not, so opening a clip put its URL into an <img> and showed nothing. The
  // element is chosen per item rather than once, because a gallery mixes the two.
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
      // Paused and detached first: a <video> left playing after being replaced keeps its
      // audio going with nothing on screen to stop it.
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
    // The pack dialog listens for these too, so the full view keeps them.
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

  // Only the backdrop closes, so a click on the image itself does not.
  back.onclick = (event) => { if (event.target === back || event.target === figure) close(); };
  document.body.appendChild(back);
  show(index);
  closer.focus();
}

// Downloads a theme a pack ships and merges it into the palette store, leaving every other
// palette untouched. It appears in the theme picker after a reload.
async function addPackTheme(repository, branch, path, button) {
  let data;
  try {
    const query = new URLSearchParams({ repo: repository || "", branch: branch || "", path });
    const answer = await api.fetchApi(`${API}/theme?${query.toString()}`);
    data = await answer.json();
    if (!answer.ok || !data.ok) throw new Error(data.reason || `HTTP ${answer.status}`);
  } catch (error) {
    notify("Could not read theme", error.message);
    return;
  }
  const theme = data.theme;
  const name = theme.name || theme.id;
  if (!(await confirmAction("Add theme", `Add "${name}" to your themes?`, "Add"))) return;
  try {
    const setting = app.extensionManager.setting;
    const service = app.extensionManager.colorPalette;
    const store = setting.get("Comfy.CustomColorPalettes") || {};
    const replacing = Boolean(store[theme.id]);
    await setting.set("Comfy.CustomColorPalettes", { ...store, [theme.id]: theme });
    button.classList.add("om-wf-added");

    // Writing the store is not enough when this is the palette already in use: what is on the
    // canvas was drawn from the old copy, so a pack shipping an updated theme would appear to
    // install and change nothing. Loading it again re-reads the store and re-applies extras.
    const active = service?.getActiveColorPalette?.()?.id === theme.id;
    if (active) {
      try {
        await service.loadColorPalette(theme.id);
        toast(`Updated ${name}.`, { kind: "ok" });
      } catch {
        toast(`Updated ${name}. Reload to see the change.`, { kind: "ok" });
      }
    } else {
      toast(`${replacing ? "Updated" : "Added"} ${name}. Pick it in Settings > Appearance.`,
        { kind: "ok" });
    }
  } catch (error) {
    notify("Could not add theme", error.message);
  }
}

// Downloads a declared example workflow, and loads it into the graph once it is confirmed and
// the server has verified it parses as a workflow.
async function loadExampleWorkflow(repository, branch, path) {
  const name = path.split("/").pop();
  const progress = toast(`Fetching ${name}...`, { sticky: true });
  let data;
  try {
    const query = new URLSearchParams({ repo: repository || "", branch: branch || "", path });
    const answer = await api.fetchApi(`${API}/workflow?${query.toString()}`);
    data = await answer.json();
    if (!answer.ok || !data.ok) throw new Error(data.reason || `HTTP ${answer.status}`);
  } catch (error) {
    progress.remove();
    notify("Could not fetch workflow", error.message);
    return;
  }
  progress.remove();

  const workflow = data.workflow.nodes ? data.workflow : (data.workflow.workflow || data.workflow);
  await loadWorkflowGraph(workflow, path, `the ${repoName(repository) || "pack"} repository`,
                          repository);
}

// Ask how a workflow should land, then land it that way. loadGraphData opens a new tab when
// given no workflow to load into, and replaces that workflow's graph when given one, so
// replacing is only offered where an active workflow can actually be reached.
async function loadWorkflowGraph(workflow, label, origin, repository) {
  // Loading a stranger's graph is the same question as installing their pack, so it is
  // asked the same way and one answer in author mode covers both.
  const parts = repoOwnerName(repository || "");
  if (parts && !(await confirmAuthorTrust(parts.owner, repository, "load a workflow"))) return;
  const active = activeWorkflow();
  const choices = [{ key: "tab", label: "Open in new tab", primary: true }];
  if (active) choices.push({ key: "replace", label: "Replace current graph",
                             hint: "Discards unsaved changes to the open workflow" });
  // Said plainly rather than alarmingly: drawing someone else's graph is safe, and it is
  // running it that reaches the network and the disk. A reader deciding whether to load it
  // is better served by which of those is which.
  const where = origin ? `From ${origin}. ` : "";
  const how = await chooseAction(
    "Load workflow",
    `${where}Opening only draws the graph; running it can download models and write files.

`
    + (active
      ? `"${label}" can open alongside your work or take the place of the graph you have open.`
      : `"${label}" opens in a new tab, leaving the graph you have open untouched.`),
    choices);
  if (!how) return;
  const name = String(label).split("/").pop();
  try {
    if (how === "replace") await app.loadGraphData(workflow, true, true, active);
    else await app.loadGraphData(workflow);
    toast(how === "replace" ? `Loaded ${name} into the open workflow.` : `Opened ${name} in a new tab.`,
          { kind: "ok" });
  } catch (error) {
    notify("Could not load workflow", error.message);
  }
}

// The workflow the reader has open, or null where this build of ComfyUI does not say.
// Probed rather than assumed: there is no documented accessor, and the shape has moved.
function activeWorkflow() {
  const candidates = [
    () => app.workflowManager?.activeWorkflow,
    () => app.extensionManager?.workflow?.activeWorkflow,
    () => window.comfyAPI?.workflowStore?.useWorkflowStore?.()?.activeWorkflow,
  ];
  for (const read of candidates) {
    try {
      const found = read();
      if (found && typeof found === "object") return found;
    } catch {
      // Not this one; try the next.
    }
  }
  return null;
}

// GitHub's heading slug: lowercased, punctuation dropped, spaces hyphenated. Matched here
// so a README's own "#section" links have something to point at, since the markdown
// renderer emits headings without ids.
function slugify(text) {
  return String(text || "").trim().toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-");
}

// Give every heading an id and point the README's own anchors at them. Without this a
// "#section" link is rewritten to the repository and leaves the panel for GitHub.
function linkHeadings(view) {
  const seen = new Map();
  for (const heading of view.querySelectorAll("h1, h2, h3, h4, h5, h6")) {
    const base = slugify(heading.textContent);
    if (!base) continue;
    // GitHub appends -1, -2 to repeated headings; the same rule keeps links unambiguous.
    const count = seen.get(base) || 0;
    seen.set(base, count + 1);
    heading.id = count ? `${base}-${count}` : base;
  }
}

// Turn a bare media link into the thing it points at. GitHub embeds its own attachment
// URLs and the markdown renderer here does not, so the README shows a link where GitHub
// shows a player. Runs after the scheme scrub, so only http(s) links reach it.
//
// An attachment URL carries no extension and may be either a video or an image, so the
// element is chosen by trying: video first, an image if the video will not decode, and the
// original link back if neither works. Guessing wrong and leaving a dead player would be
// worse than the link it replaced.
const ATTACHMENT_ID = /\/user-attachments\/assets\/([0-9a-f-]{36})/i;

async function attachmentMedia(view, repository) {
  if (!repository) return {};
  const wanted = [...view.querySelectorAll("a[href]")]
    .some((a) => ATTACHMENT_ID.test(a.getAttribute("href") || ""));
  if (!wanted) return {};
  try {
    const answer = await api.fetchApi(`${API}/media?repo=${encodeURIComponent(repository)}`);
    const data = await answer.json();
    return data?.media || {};
  } catch {
    return {};
  }
}

function embedMediaLinks(view, media = {}) {
  const ATTACHMENT = /^https?:\/\/(www\.)?github\.com\/user-attachments\/assets\//i;
  const VIDEO_EXT = /\.(mp4|webm|mov|m4v)(\?|#|$)/i;
  const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|bmp|svg)(\?|#|$)/i;

  for (const anchor of [...view.querySelectorAll("a[href]")]) {
    // The scrub in absolutiseLinks has already removed any other scheme, so this is belt
    // and braces: an extension says nothing about what a URL will do.
    const href = safeUrl(anchor.getAttribute("href") || "");
    if (!href) continue;
    const bare = ATTACHMENT.test(href);
    if (!bare && !VIDEO_EXT.test(href) && !IMAGE_EXT.test(href)) continue;
    const assetId = (ATTACHMENT_ID.exec(href) || [])[1];
    const signed = assetId ? media[assetId.toLowerCase()] : "";
    const source = signed || href;
    // A link with its own words reads as a link, not an embed.
    const text = (anchor.textContent || "").trim();
    if (text && text !== href) continue;

    // Neither a video nor an image. An attachment that decodes as neither is usually one
    // GitHub no longer has -- they expire, and the URL then answers a nine-byte "Not Found"
    // -- so the link comes back with a word about why, rather than as a bare URL sitting
    // where a video should be, which reads as this failing to render something that is there.
    const asDeadLink = () => {
      const holder = el("div", "om-readme-gone");
      holder.appendChild(anchor.cloneNode(true));
      holder.appendChild(el("span", "om-readme-gone-note",
        bare ? "GitHub did not serve this attachment." : "This file could not be shown."));
      return holder;
    };
    const asImage = () => {
      const image = el("img", "om-readme-media");
      image.src = source;
      // Not lazy: a deleted attachment must fail now so the link can come back. Deferred,
      // an offscreen one never errors and leaves an empty box where a link used to be.
      image.alt = "";
      image.onerror = () => image.replaceWith(asDeadLink());
      return image;
    };
    if (IMAGE_EXT.test(href)) { anchor.replaceWith(asImage()); continue; }

    const video = el("video", "om-readme-media");
    video.src = source;
    video.controls = true;
    video.preload = "metadata";
    video.playsInline = true;
    // An attachment that will not decode as video is almost always an image.
    if (bare) video.onerror = () => video.replaceWith(asImage());
    else video.onerror = () => video.replaceWith(asDeadLink());
    anchor.replaceWith(video);
  }
}

// A README often points at another pack's repository. Where the registry carries that
// repository, the link opens the pack here instead of sending the reader to GitHub. The
// lookup happens on the click, not on render: a page can hold a hundred links.
function offerPackLink(anchor, href) {
  const match = /^https?:\/\/(?:www\.)?github\.com\/([^/#?]+)\/([^/#?]+)\/?$/i.exec(href || "");
  if (!match) return;
  anchor.onclick = async (event) => {
    if (panelSetting("openManager.packLinks", true) !== true) return;
    // A modifier or the middle button means the reader asked for a tab; leave them to it.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    let found = null;
    try {
      const answer = await api.fetchApi(`${API}/pack-for-repo?repo=${encodeURIComponent(href)}`);
      found = (await answer.json()).id || null;
    } catch {
      // Fall through to the repository itself.
    }
    if (found) await openPack(found);
    else openUrl(href);
  };
}

//: Most a compressed text chunk may expand to. Comfortably above a real workflow -- the
//: largest seen in the wild is about 110 KB -- and far below what a deflate bomb wants.
const TEXT_CHUNK_CAP = 8 * 1024 * 1024;

// A PNG's text chunks, which is where ComfyUI leaves the workflow that produced an image.
// Read from the bytes rather than the decoded image: the chunks sit before the pixel data,
// so this stops as soon as it reaches it.
//
// Returns the named chunk's text, or an empty string.
async function pngText(bytes, wanted) {
  if (bytes.length < 8 || bytes[0] !== 0x89 || bytes[1] !== 0x50) return "";
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  let at = 8;
  while (at + 12 <= bytes.length) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(bytes[at + 4], bytes[at + 5], bytes[at + 6], bytes[at + 7]);
    // Only IEND ends the file. A tEXt chunk after IDAT is legal and some writers emit one,
    // so stopping at the image data was reporting "no workflow" for images that have one.
    if (type === "IEND") break;
    if (type === "tEXt" || type === "iTXt") {
      const body = bytes.subarray(at + 8, at + 8 + length);
      let split = 0;
      while (split < body.length && body[split] !== 0) split += 1;
      if (decoder.decode(body.subarray(0, split)) === wanted) {
        if (type === "tEXt") return decoder.decode(body.subarray(split + 1));
        // iTXt: a compression flag and method, then two more terminated fields.
        const compressed = body[split + 1] === 1;
        let cursor = split + 3;
        for (let field = 0; field < 2; field += 1) {
          while (cursor < body.length && body[cursor] !== 0) cursor += 1;
          cursor += 1;
        }
        const payload = body.subarray(cursor);
        if (!compressed) return decoder.decode(payload);
        try {
          // Read the stream rather than buffering it whole: a small deflate chunk can
          // expand without limit, and this runs on a file from a page being browsed.
          const reader = new Blob([payload]).stream()
            .pipeThrough(new DecompressionStream("deflate")).getReader();
          const parts = [];
          let total = 0;
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value.length;
            if (total > TEXT_CHUNK_CAP) { await reader.cancel(); return ""; }
            parts.push(value);
          }
          const joined = new Uint8Array(total);
          let at = 0;
          for (const part of parts) { joined.set(part, at); at += part.length; }
          return decoder.decode(joined);
        } catch {
          return "";
        }
      }
    }
    at += 12 + length;
  }
  return "";
}

// The workflow an image was produced by, where it carries one. Only the head of the file is
// asked for, because the chunks precede the pixels and these images run to megabytes; a
// server that will not serve a range is read in full instead.
async function workflowInImage(url) {
  const read = async (headers) => {
    const answer = await fetch(url, headers ? { headers } : undefined);
    if (!answer.ok) throw new Error(`HTTP ${answer.status}`);
    return new Uint8Array(await answer.arrayBuffer());
  };
  const scan = async (bytes) => {
    for (const key of ["workflow", "prompt"]) {
      const text = await pngText(bytes, key);
      if (!text) continue;
      try {
        const parsed = JSON.parse(text);
        // A prompt is the executed form and carries no nodes to lay out; only a workflow does.
        if (key === "workflow" || parsed.nodes) return parsed;
      } catch {
        // Truncated by the range, or not JSON. Fall through.
      }
    }
    return null;
  };

  // The first quarter of a megabyte covers the common case without pulling a 40MB screenshot
  // across the wire. It is a guess about where the metadata sits, though, and a guess that
  // misses must not be reported as an answer: an image whose workflow sits past the range, or
  // whose workflow is larger than it, would be called empty. So a miss is retried in full
  // before anything is said.
  let partial = null;
  let ranged = false;
  try {
    partial = await read({ Range: "bytes=0-262143" });
    // A server ignoring the range hands back everything, which is equally fine.
    ranged = partial.length >= 262144;
  } catch {
    partial = null;
  }
  if (partial) {
    const found = await scan(partial);
    if (found) return found;
    if (!ranged) return null;
  }
  return scan(await read(null));
}

// Right-click a README image to load the workflow it was made with. Authors publish these
// as "workflow included" screenshots, and ComfyUI writes the graph into the file.
// Nothing is fetched until asked: the images on a page run to tens of megabytes.
function offerImageWorkflows(view) {
  //: Whether a read is already running. Pulling a workflow out of an image means fetching the
  //: whole file and scanning its metadata, which for a large screenshot takes long enough to
  //: right-click again -- and each of those started another read and stacked another dialog.
  let reading = false;
  view.addEventListener("contextmenu", async (event) => {
    // Off leaves the browser's own menu alone, which is what someone who wants to copy or
    // save the image is reaching for.
    if (panelSetting("openManager.imageWorkflows", true) !== true) return;
    const image = event.target instanceof HTMLImageElement ? event.target : null;
    if (!image || !safeUrl(image.src)) return;
    event.preventDefault();
    if (reading) {
      toast("Still reading the last image.", { kind: "warn" });
      return;
    }
    reading = true;
    const progress = toast("Reading the image...", { sticky: true });
    // `finally` rather than a clear on each path out: there are four ways out of this and one
    // of them forgetting would leave the feature switched off until the page is rebuilt.
    try {
      let workflow = null;
      try {
        workflow = await workflowInImage(image.src);
      } catch (error) {
        progress.remove();
        notify("Could not read the image", error.message);
        return;
      }
      progress.remove();
      if (!workflow) {
        notify("No workflow in this image", "The file carries no workflow to load.");
        return;
      }
      await loadWorkflowGraph(workflow, image.getAttribute("alt") || "this image",
                              "an image in this README", view._repository || "");
    } finally {
      reading = false;
    }
  });
}

// Rewrites a README's relative paths to absolute URLs on the repository.
function absolutiseLinks(view, repository, branch, doc) {
  const match = /github\.com[:/]+([^/]+)\/([^/#?]+)/i.exec(repository || "");
  if (!match) return;
  const owner = match[1];
  const repo = match[2].replace(/\.git$/, "");
  const ref = branch || "main";
  const absolute = (url) => /^[a-z][a-z0-9+.-]*:\/\//i.test(url) || url.startsWith("data:") || url.startsWith("mailto:");
  const relative = (url) => url.replace(/^\.\//, "").replace(/^\//, "");

  for (const img of view.querySelectorAll("img[src]")) {
    const src = img.getAttribute("src");
    if (!src || absolute(src) || src.startsWith("#")) continue;
    img.src = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${relative(src)}`;
  }
  // Whether a link points back at this repository, and at which heading. Parsed rather
  // than matched: a repository name can carry dots, and URLs vary in trailing slashes.
  const selfHash = (url) => {
    try {
      const parsed = new URL(url);
      if (!/(^|\.)github\.com$/i.test(parsed.hostname)) return null;
      const parts = parsed.pathname.replace(/^\/|\/$/g, "").split("/");
      if (parts.length !== 2) return null;
      if (parts[0].toLowerCase() !== owner.toLowerCase()) return null;
      if (parts[1].replace(/\.git$/i, "").toLowerCase() !== repo.toLowerCase()) return null;
      return parsed.hash || "";
    } catch {
      return null;
    }
  };
  for (const anchor of view.querySelectorAll("a[href]")) {
    const href = anchor.getAttribute("href");
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    if (absolute(href || "")) {
      // A link back to this repository's own heading means "further down this page", even
      // written the long way, so it is answered here rather than sent to GitHub.
      const hash = selfHash(href || "");
      if (hash) {
        anchor.removeAttribute("target");
        anchor.onclick = (event) => {
          const target = view.querySelector(`[id="${CSS.escape(hash.slice(1))}"]`);
          if (!target) return;
          event.preventDefault();
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        };
      } else {
        offerPackLink(anchor, href);
      }
      continue;
    }
    if (!href) continue;
    if (href.startsWith("#")) {
      // The reader means "further down this page", so it is answered here.
      anchor.removeAttribute("target");
      anchor.onclick = (event) => {
        const target = view.querySelector(`[id="${CSS.escape(href.slice(1))}"]`);
        if (!target) return;
        event.preventDefault();
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      };
    } else {
      const path = doc ? docResolve(doc.base, relative(href)) : relative(href);
      anchor.href = `https://github.com/${owner}/${repo}/blob/${ref}/${path}`;
      // A link to the pack's own markdown is a page of this documentation, not a trip to
      // GitHub. The href stays, so a middle click still opens it there and a failure here
      // has somewhere to fall back to.
      if (doc && /\.(md|markdown)(\?|#|$)/i.test(path)) {
        anchor.removeAttribute("target");
        anchor.classList.add("om-doc-link");
        anchor.onclick = (event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
          event.preventDefault();
          openPackDoc(view, doc.meta, ref, path.replace(/[?#].*$/, ""));
        };
      }
    }
  }

  // ComfyUI's markdown sanitiser handles this, but its version is not pinned here, so any
  // unexpected scheme left on a link is stripped as well.
  for (const img of view.querySelectorAll("img[src]")) {
    const src = img.getAttribute("src") || "";
    if (!/^https?:\/\//i.test(src) && !/^data:image\//i.test(src)) img.removeAttribute("src");
  }
  for (const anchor of view.querySelectorAll("a[href]")) {
    const href = anchor.getAttribute("href") || "";
    if (!/^https?:\/\//i.test(href) && !/^mailto:/i.test(href) && !href.startsWith("#")) {
      anchor.removeAttribute("href");
    }
  }
}

// Resolves a pack's newest version, then routes it through the same confirm and queue as
// the version list. Drives the row's control while it resolves.
async function quickInstall(packId, control) {
  control.setInstalling();
  rememberInstall(packId, "installing");
  let data;
  try {
    const answer = await api.fetchApi(
      `${API}/pack/${encodeURIComponent(packId)}?${packQuery()}`);
    data = await answer.json();
    if (!answer.ok) throw new Error(data.detail || `HTTP ${answer.status}`);
  } catch (error) {
    control.setInstall();
    rememberInstall(packId, null);
    notify(`Could not read ${packId}`, error.message);
    return;
  }
  const wanted = data.resolution.newest || data.resolution.latest_active;
  const entry = data.versions.find((item) => item.version === wanted);
  if (!entry) {
    control.setInstall();
    rememberInstall(packId, null);
    notify(`Nothing to install for ${packId}`, "No installable version was found.");
    return;
  }
  control.setInstall();
  await install({ packId, entry: { ...entry, name: data.pack.name || packId }, control, rowsRoot: null });
}

// Licence resolution for rows the registry left unnamed. A row's repository is read for its
// licence file, batched across a render and cached on the server.
const licJobs = new Map();

// Set by the registry list while it is on screen, so a licence resolved after the list was
// filtered can put the list right. Null when no list is listening.
let onLicencesResolved = null;
let licTimer = 0;

// Repositories one licence request may ask about. This mirrors LICENSE_BATCH on the server,
// which trims anything longer: sending more would drop the overflow silently, and those rows
// would be marked resolved without ever having been looked at.
const LICENSE_BATCH = 200;

// What each tier means for the reader's own project. The colour grades how freely a pack
// can be used, so it is worth saying what the grade is about: these are obligations, not a
// judgement about the pack.
const LICENCE_MEANING = {
  "permissive": "Use, modify and ship closed-source, with attribution.",
  "weak-copyleft": "Changes to the pack's own files must stay open; your code need not.",
  "copyleft": "Strong copyleft: distributing work built on it requires releasing source "
    + "under the same terms, so it does not suit a closed-source product.",
  "community": "Free for most use, but the licence sets conditions on commercial use.",
  "non-commercial": "Commercial use is restricted or forbidden.",
  "unknown": "Nothing stated, so no permission is granted by default.",
};

function paintLicense(pill, entry) {
  pill.textContent = entry.license || "unlicensed";
  pill.style.color = entry.license_color || "var(--om-muted)";
  pill.style.borderColor = entry.license_color || "var(--om-muted)";
  const tier = entry.license_tier || "unknown";
  const meaning = LICENCE_MEANING[tier];
  // Without a name the meaning stands alone, rather than repeating "no licence stated".
  if (!meaning) pill.title = `licence: ${tier}`;
  else pill.title = entry.license ? `${entry.license}: ${meaning}` : meaning;
}

function queueLicense(entry, pill) {
  if (!entry || !entry.repository || entry._licResolved) return;
  if (entry.license_tier && entry.license_tier !== "unknown") return;
  let job = licJobs.get(entry.id);
  if (!job) { job = { entry, pills: new Set() }; licJobs.set(entry.id, job); }
  job.pills.add(pill);
  if (!licTimer) licTimer = setTimeout(flushLicenses, 250);
}

async function flushLicenses() {
  licTimer = 0;
  const jobs = [...licJobs.values()];
  licJobs.clear();
  for (let at = 0; at < jobs.length; at += LICENSE_BATCH) {
    await resolveLicenceBatch(jobs.slice(at, at + LICENSE_BATCH));
  }
}

// One request's worth. A batch that fails is left unresolved so it can be asked again.
async function resolveLicenceBatch(jobs) {
  if (!jobs.length) return;
  let res;
  try {
    const answer = await api.fetchApi(`${API}/licenses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: jobs.map((j) => ({ id: j.entry.id, repository: j.entry.repository })),
        ...licenseOptions(),
      }),
    });
    // An error response leaves the rows unresolved.
    if (!answer.ok) return;
    res = (await answer.json()).licenses || {};
  } catch {
    return;
  }
  let changed = false;
  for (const job of jobs) {
    job.entry._licResolved = true;
    const info = res[job.entry.id];
    if (!info || !info.name) continue;
    Object.assign(job.entry, {
      license: info.name, license_tier: info.tier,
      license_rank: info.rank, license_color: info.color,
    });
    for (const pill of job.pills) paintLicense(pill, job.entry);
    changed = true;
  }
  if (changed && onLicencesResolved) onLicencesResolved();
}

// A list row's artwork, falling back to a tile carrying the pack's initial.
function packIcon(url, name, extra) {
  const initial = (String(name || "?").replace(/^[^a-z0-9]+/i, "") || "?")[0].toUpperCase();
  const letter = el("div", "om-side-icon om-side-initial", initial);
  if (extra) letter.classList.add(extra);
  if (!url) return letter;
  const icon = el("img", "om-side-icon");
  if (extra) icon.classList.add(extra);
  icon.src = url;
  // The fallback keeps the caller's extra class, so a broken image still sizes correctly.
  icon.onerror = () => icon.replaceWith(letter);
  return icon;
}

// Large counts read better abbreviated; smaller ones are left exact. The unit is chosen
// from the value after rounding, so 999,999 reads "1.0M" rather than "1000k", and the
// decimal is dropped past 100 of a unit to keep the text about four characters wide.
function countText(value) {
  const n = Number(value) || 0;
  if (n < 1e4) return n.toLocaleString();
  const scale = (size, suffix) => {
    const v = n / size;
    return (v >= 99.95 ? String(Math.round(v)) : v.toFixed(1)) + suffix;
  };
  return n >= 999500 ? scale(1e6, "M") : scale(1e3, "k");
}

// A link to the pack's repository, as an anchor rather than a click handler: readers open
// many at once with the middle button or a modifier, which a handler cannot offer.
// Null where the registry names no usable repository.
//: GitHub's own mark, taken from Octicons (`mark-github-16`), which GitHub publishes under
//: the MIT licence: Copyright (c) GitHub Inc. Kept as path data rather than a file so it
//: inherits the colour of whatever it sits in and costs no extra request.
//:
//: Used only for links that really do go to github.com. It is a trademark, and putting it on
//: a GitLab or Codeberg link would be saying something untrue about where the link goes.
const GITHUB_MARK = "M6.766 11.328c-2.063-.25-3.516-1.734-3.516-3.656 0-.781.281-1.625.75-2.188-.203-.515-.172-1.609.063-2.062.625-.078 1.468.25 1.968.703.594-.187 1.219-.281 1.985-.281.765 0 1.39.094 1.953.265.484-.437 1.344-.765 1.969-.687.218.422.25 1.515.046 2.047.5.593.766 1.39.766 2.203 0 1.922-1.453 3.375-3.547 3.64.531.344.89 1.094.89 1.954v1.625c0 .468.391.734.86.547C13.781 14.359 16 11.53 16 8.03 16 3.61 12.406 0 7.984 0 3.563 0 0 3.61 0 8.031a7.88 7.88 0 0 0 5.172 7.422c.422.156.828-.125.828-.547v-1.25c-.219.094-.5.156-.75.156-1.031 0-1.64-.562-2.078-1.609-.172-.422-.36-.672-.719-.719-.187-.015-.25-.093-.25-.187 0-.188.313-.328.625-.328.453 0 .844.281 1.25.86.313.452.64.655 1.031.655s.641-.14 1-.5c.266-.265.47-.5.657-.656";

//: Whether a URL is a GitHub one, and so may carry the mark.
function isGithubUrl(url) {
  try {
    return new URL(url, window.location.href).hostname.toLowerCase()
      .replace(/^www\./, "") === "github.com";
  } catch {
    return false;
  }
}

// The mark as an inline SVG.
//
// Args:
//   size: Edge length in pixels.
// Returns:
//   An `<svg>`, hidden from assistive technology: every caller gives the control itself a
//   name, and a second reading of "github" after "Open the repository" is noise.
function githubMark(size = 15) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.classList.add("om-gh-mark");
  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", GITHUB_MARK);
  path.setAttribute("fill", "currentColor");
  svg.appendChild(path);
  return svg;
}

// A button that opens a repository, wearing the mark when the repository is on GitHub.
//
// Args:
//   url: The repository URL.
//   label: What the control is called, for the tooltip and for screen readers.
// Returns:
//   A button, or null where the URL is not one worth offering.
function repoButton(url, label) {
  const safe = safeUrl(url);
  if (!safe) return null;
  const github = isGithubUrl(safe);
  // An anchor rather than a button: middle-click, ctrl-click and the browser's own "open in
  // new tab" all work on a link and none of them work on a button. Someone researching packs
  // opens a dozen in tabs, and a button makes them click through one at a time.
  const button = el("a", `om-btn om-icon-btn${github ? " om-gh-btn" : ""}`);
  if (github) {
    button.appendChild(githubMark(16));
  } else {
    button.appendChild(el("span", "om-gh-fallback", "\u2197"));
  }
  button.href = safe;
  button.target = "_blank";
  button.rel = "noopener noreferrer";
  button.title = label;
  button.setAttribute("aria-label", label);
  return button;
}

//: Comfy's logomark, shipped beside this file. Kept as a file rather than inlined like the
//: GitHub one because it is a fixed brand colour: it should look the same on every theme,
//: which is exactly what inheriting the text colour would stop it doing.
const COMFY_MARK = "comfy-logomark-yellow.svg";

//: A pack's page on the Comfy Registry.
function registryUrl(packId) {
  return `https://registry.comfy.org/nodes/${encodeURIComponent(packId)}`;
}

// A link to a pack's registry page, wearing Comfy's mark.
//
// Only for packs the registry actually lists. Open Manager also finds packs by matching a
// GitHub repository, and for those there is no registry page to open: a link to one would be
// a guess, and the guess would be wrong often enough to matter.
//
// Args:
//   entry: The catalogue entry, or anything carrying the registry `id`.
//   extra: An extra class for the view it sits in.
// Returns:
//   An anchor, or null where the pack is not a registry one.
function registryLink(entry, extra) {
  const packId = entry?.registry_id || entry?.id || "";
  if (!packId || entry?.borrowed) return null;
  const link = el("a", `om-repo-link om-registry-link ${extra || ""}`.trim());
  const mark = el("img", "om-comfy-mark");
  mark.src = new URL(COMFY_MARK, import.meta.url).href;
  mark.alt = "";
  mark.setAttribute("aria-hidden", "true");
  link.appendChild(mark);
  link.href = registryUrl(packId);
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.title = `Open ${packId} on the Comfy Registry`;
  link.setAttribute("aria-label", link.title);
  // The row opens the pack page; this opens the registry and nothing else.
  link.onclick = (event) => event.stopPropagation();
  return link;
}

// A button opening a pack's registry page, for the pack page's header.
function registryButton(packId) {
  if (!packId) return null;
  // An anchor, for the same reason the repository control is one.
  const button = el("a", "om-btn om-icon-btn om-registry-btn");
  const mark = el("img", "om-comfy-mark");
  mark.src = new URL(COMFY_MARK, import.meta.url).href;
  mark.alt = "";
  mark.setAttribute("aria-hidden", "true");
  button.appendChild(mark);
  button.href = registryUrl(packId);
  button.target = "_blank";
  button.rel = "noopener noreferrer";
  button.title = `Open ${packId} on the Comfy Registry`;
  button.setAttribute("aria-label", button.title);
  return button;
}

function repoLink(entry, extra) {
  const url = safeUrl(entry.repository);
  if (!url) return null;
  const link = el("a", `om-repo-link ${extra || ""}`.trim());
  if (isGithubUrl(url)) link.appendChild(githubMark(14));
  else link.appendChild(el("span", "om-gh-fallback", "\u2197"));
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.title = `Open ${entry.repository} in a new tab`;
  // The row opens the pack page; this opens the repository and nothing else.
  link.onclick = (event) => event.stopPropagation();
  return link;
}

// A pack's GitHub stars. Null where the registry records none, so callers can leave the
// metadata line uncluttered rather than printing a zero.
function starCount(stars) {
  const n = Number(stars) || 0;
  if (!n) return null;
  const pill = el("span", "om-stars", `★ ${countText(n)}`);
  pill.title = `${n.toLocaleString()} GitHub stars`;
  return pill;
}

function buildResultRow(entry) {
  const row = el("div", "om-side-row");
  row.appendChild(packIcon(entry.icon, entry.name || entry.id));
  const text = el("div", "om-side-text");
  text.appendChild(packName(entry.name || entry.id, "om-side-name"));
  const meta = el("div", "om-side-meta");
  // In its own element so it is the part that gives way when the panel is narrow: the
  // version and count truncate, and the star and licence badges beside them do not.
  meta.appendChild(el("span", "om-meta-text",
    `${entry.advertised || "no version"} · ${countText(entry.downloads)} ↓`));
  const stars = starCount(entry.stars);
  if (stars) meta.appendChild(stars);
  const lic = el("span", "om-lic");
  paintLicense(lic, entry);
  // The row is queued for a licence lookup by the list once scrolling settles, rather than
  // the moment it is built: a fast scroll builds thousands of rows the reader never saw.
  row._entry = entry;
  row._licPill = lic;
  meta.appendChild(lic);
  const trusted = trustBadge(entry);
  if (trusted) meta.appendChild(trusted);
  const linkRegistry = registryLink(entry);
  if (linkRegistry) meta.appendChild(linkRegistry);
  const link = repoLink(entry);
  if (link) meta.appendChild(link);
  text.appendChild(meta);
  text.onclick = () => openPack(entry.id);
  row.appendChild(text);
  const control = registryControl(entry, "om-side-ictl");
  row.appendChild(control.el);
  return row;
}

// The day part of the registry's ISO timestamp.
function dayText(stamp) {
  const day = String(stamp || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : "-";
}

// The catalogue entry as a table row. Cells never wrap, for the reason rows and cards do
// not. The registry has no per-pack node count, so downloads takes that column.
function buildResultTableRow(entry, index) {
  const row = el("div", "om-table-row");

  row.appendChild(el("div", "om-tcell om-tcell-num", String((index ?? 0) + 1)));

  const title = el("div", "om-tcell om-tcell-title");
  title.appendChild(packIcon(entry.icon, entry.name || entry.id, "om-table-icon"));
  const name = packName(entry.name || entry.id, "om-side-name");
  title.appendChild(name);
  title.title = entry.name || entry.id;
  title.onclick = () => openPack(entry.id);
  const tableTrusted = trustBadge(entry);
  if (tableTrusted) title.appendChild(tableTrusted);
  const tableLinkRegistry = registryLink(entry);
  if (tableLinkRegistry) title.appendChild(tableLinkRegistry);
  const tableLink = repoLink(entry);
  if (tableLink) title.appendChild(tableLink);
  row.appendChild(title);

  row.appendChild(el("div", "om-tcell om-tcell-ver", entry.advertised || "-"));

  const control = registryControl(entry, "om-table-ictl");
  const action = el("div", "om-tcell om-tcell-action");
  action.appendChild(control.el);
  row.appendChild(action);

  row.appendChild(el("div", "om-tcell om-tcell-dl", `${countText(entry.downloads)} ↓`));

  const desc = el("div", "om-tcell om-tcell-desc",
    entry.description || "No description published.");
  desc.title = entry.description || "";
  desc.onclick = () => openPack(entry.id);
  row.appendChild(desc);

  row.appendChild(el("div", "om-tcell om-tcell-auth", entry.publisher || "-"));

  const lic = el("div", "om-tcell om-tcell-lic");
  const pill = el("span", "om-lic");
  paintLicense(pill, entry);
  lic.appendChild(pill);
  row._entry = entry;
  row._licPill = pill;
  row.appendChild(lic);

  row.appendChild(el("div", "om-tcell om-tcell-star",
    entry.stars ? `★ ${countText(entry.stars)}` : "-"));
  row.appendChild(el("div", "om-tcell om-tcell-date", dayText(entry.released)));
  return row;
}

// The same catalogue entry drawn as a card: a larger icon, the publisher, and the
// description, for the grid view. The metadata line carries whatever fits on one row.
function buildResultCard(entry) {
  const card = el("div", "om-card");
  const head = el("div", "om-card-head");
  head.appendChild(packIcon(entry.icon, entry.name || entry.id, "om-card-icon"));
  const title = el("div", "om-card-title");
  title.appendChild(packName(entry.name || entry.id, "om-side-name"));
  // Always present, empty or not: the windowed grid scrolls on one row pitch, so a card
  // that dropped a line would be shorter than its neighbours and put the scrollbar out of
  // step with the cards it scrolls.
  title.appendChild(el("div", "om-card-pub", entry.publisher || ""));
  head.appendChild(title);
  head.onclick = () => openPack(entry.id);
  card.appendChild(head);

  const desc = el("div", "om-card-desc", entry.description || "No description published.");
  desc.onclick = () => openPack(entry.id);
  card.appendChild(desc);

  const meta = el("div", "om-side-meta");
  meta.appendChild(el("span", "om-meta-text",
    `${entry.advertised || "no version"} · ${countText(entry.downloads)} ↓`));
  const stars = starCount(entry.stars);
  if (stars) meta.appendChild(stars);
  const lic = el("span", "om-lic");
  paintLicense(lic, entry);
  card._entry = entry;
  card._licPill = lic;
  meta.appendChild(lic);
  const cardTrusted = trustBadge(entry);
  if (cardTrusted) meta.appendChild(cardTrusted);
  const cardLinkRegistry = registryLink(entry);
  if (cardLinkRegistry) meta.appendChild(cardLinkRegistry);
  const cardLink = repoLink(entry);
  if (cardLink) meta.appendChild(cardLink);
  card.appendChild(meta);

  const control = registryControl(entry, "om-card-ictl");
  card.appendChild(control.el);
  return card;
}

// The node types in the open graph that ComfyUI has no registered class for. ComfyUI reports
// these to afterConfigureGraph on load; that list is preferred, with a live scan as fallback.
let lastMissingTypes = null;

function collectMissingNodeTypes() {
  const registered = window.LiteGraph?.registered_node_types || {};
  const types = new Set();
  // What ComfyUI reported unregistered at the last load, still unregistered now.
  for (const type of lastMissingTypes || []) {
    if (type && !registered[type]) types.add(type);
  }
  // Plus anything in the current graph without a registered class (catches later edits).
  for (const node of app.graph?._nodes || []) {
    const type = node.type;
    if (type && !registered[type]) types.add(type);
  }
  return [...types];
}

// A view render is async and the tab can change while one is in flight. Each render
// captures the generation it began in and stops where the panel has moved on.
let viewGeneration = 0;

function beginView() {
  return ++viewGeneration;
}

function viewIsCurrent(generation) {
  return generation === viewGeneration;
}

// Re-render the Installed view where it is the one being looked at.
function refreshInstalledIfActive() {
  const active = document.querySelector(".om-nav-btn.active");
  const content = document.querySelector(".om-content");
  if (active && content && active.textContent === "Installed") renderInstalled(content);
}

// Re-render the Missing view if it is the active tab. Called when a workflow loads.
function refreshMissingIfActive() {
  const active = document.querySelector(".om-nav-btn.active");
  const content = document.querySelector(".om-content");
  if (active && content && active.textContent === "Missing") renderMissing(content);
}

// The same panel as the sidebar tab, as a window. The legacy menu has no sidebar to put a
// tab in, so this is how it is reached there.
function openPanelWindow(view) {
  // The manager is a page like any other, so it follows the same setting. Its own window is
  // keyed once rather than per view: the four tabs are one browser, not four windows.
  if (asWindow("manager")) {
    const panel = createFloatingPanel({
      key: "manager", title: "Open Manager", ...windowSize("manager"), centred: true,
    });
    const host = panel.body.querySelector(".om-side")
      || panel.body.appendChild(el("div"));
    renderSidebar(host, view);
    panel.raise();
    return panel.el;
  }

  const existing = document.querySelector(".om-backdrop .om-panel-window");
  if (existing) return existing;
  const backdrop = el("div", "om-backdrop");
  const dialog = el("div", "om-dialog om-panel-window");
  const close = el("button", "om-x", "×");
  close.title = "Close";
  close.onclick = () => backdrop.remove();
  dialog.appendChild(close);
  // renderSidebar names the element it is given, so it gets its own host inside the dialog.
  const host = el("div");
  dialog.appendChild(host);
  backdrop.appendChild(dialog);
  document.body.appendChild(backdrop);
  closeOn(backdrop);
  renderSidebar(host, view);
  return dialog;
}

// Toggles, because the commands the interface dispatches are named ToggleVisibility.
function togglePanelWindow(view) {
  if (floatingPanel("manager")) { closeFloatingPanel("manager"); return null; }
  const existing = document.querySelector(".om-backdrop .om-panel-window");
  if (existing) {
    existing.closest(".om-backdrop").remove();
    return null;
  }
  return openPanelWindow(view);
}

// The hub the Extensions button opens: a menu of destinations, in the shape the manager
// this replaces used.
function openManagerMenu() {
  const existing = document.querySelector(".om-backdrop .om-hub");
  if (existing) { existing.closest(".om-backdrop").remove(); return null; }

  const backdrop = el("div", "om-backdrop");
  const dialog = el("div", "om-dialog om-hub");
  dialog.appendChild(el("div", "om-hub-title", "Open Manager Menu"));

  const body = el("div", "om-hub-body");
  const status = el("div", "om-hub-status", "Reading the registry cache...");
  body.appendChild(status);

  // Every destination, from the same table the tab strip reads. The classic interface has no
  // tab strip and no sidebar, so this menu is the only way in: anything reachable at all has
  // to be reachable here.
  const grid = el("div", "om-hub-grid");
  for (const one of managerDestinations()) {
    const button = el("button", "om-hub-btn", one.label);
    if (one.hint) button.title = one.hint;
    button.onclick = () => { backdrop.remove(); one.open(); };
    grid.appendChild(button);
  }
  body.appendChild(grid);

  const restart = el("button", "om-hub-btn om-hub-danger", "Restart ComfyUI");
  restart.onclick = () => restartServer(restart);
  body.appendChild(restart);
  dialog.appendChild(body);

  const close = el("button", "om-hub-close", "Close");
  close.onclick = () => backdrop.remove();
  dialog.appendChild(close);

  backdrop.appendChild(dialog);
  document.body.appendChild(backdrop);
  closeOn(backdrop);

  (async () => {
    try {
      const info = await (await api.fetchApi(`${API}/catalog/state`)).json();
      status.textContent = info.cached
        ? `${(info.count || 0).toLocaleString()} packs · synced ${sinceText(info.fetched_at)}`
        : "No registry cache yet · open Custom Nodes Manager to sync";
    } catch {
      status.textContent = "The registry cache could not be read";
    }
  })();
  return dialog;
}

// A way in for the legacy menu, which has no sidebar to put a tab in. Absent on the new
// interface, where the tab already exists.
function addLegacyMenuButton() {
  try {
    const menu = app.ui?.menuContainer;
    if (!menu || menu.querySelector(".om-legacy-btn")) return false;
    const button = el("button", "om-legacy-btn", "Open Manager");
    button.title = "Browse the registry";
    button.onclick = openPanelWindow;
    menu.appendChild(button);
    return true;
  } catch {
    return false;
  }
}

//: Share of the window the drawer opens at, where the reader has not chosen a width. A
//: registry row carries a name, a version, counts and two badges; ComfyUI's own default of
//: about 18% crams them on a normal screen.
const DRAWER_SHARE = 23;

//: Where the reader's own drawer width is kept. ComfyUI's splitter stores one width for
//: every sidebar tab under "unified-sidebar"; this is Open Manager's alone, so widening
//: here does not resize the other tabs or overwrite what the reader set on them.
const DRAWER_KEY = "om-drawer-share";

// Open the drawer at the reader's width, or wider than ComfyUI's default if they have not
// set one. No minimum is imposed: the splitter stays draggable in both directions, and
// whatever it lands on becomes the remembered width.
async function sizeDrawer(root) {
  // ComfyUI renders the tab before putting it in the document, so the splitter is not
  // reachable yet on the first frame. Wait for it rather than bailing silently.
  let panel = null;
  let splitter = null;
  for (let attempt = 0; attempt < 40; attempt++) {
    panel = root.closest(".p-splitterpanel");
    splitter = panel?.closest(".p-splitter");
    if (panel && splitter && splitter.getBoundingClientRect().width > 0) break;
    if (!root.isConnected && attempt > 20) return;
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  if (!panel || !splitter) return;

  let saved = null;
  try { saved = parseFloat(localStorage.getItem(DRAWER_KEY)); } catch {}
  const share = Number.isFinite(saved) && saved > 0
    ? Math.min(90, Math.max(5, saved))
    : DRAWER_SHARE;
  // The same shape the splitter writes, so it reads back as its own.
  panel.style.flexBasis = `calc(${share}% - 4px)`;

  // A drag rewrites the basis, so the basis is what gets kept -- not the rendered width.
  // Flex shrink and grow mean the two differ, and feeding a measured width back in as a
  // basis would move the drawer a little on every open.
  let timer = null;
  const remember = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const found = /(-?[\d.]+)%/.exec(panel.style.flexBasis || "");
      const pct = found ? parseFloat(found[1]) : NaN;
      if (!Number.isFinite(pct) || pct <= 0) return;
      try { localStorage.setItem(DRAWER_KEY, String(pct)); } catch {}
    }, 300);
  };
  const watch = new MutationObserver(() => {
    // Let go once the tab has been replaced, rather than watching a detached panel.
    if (!root.isConnected) { watch.disconnect(); return; }
    remember();
  });
  watch.observe(panel, { attributes: true, attributeFilter: ["style"] });
}

function renderSidebar(root, initial) {
  root.replaceChildren();
  root.className = "om-side";

  const nav = el("div", "om-nav");
  const content = el("div", "om-content");
  root.appendChild(nav);
  root.appendChild(content);
  // Only the sidebar tab sits in a splitter; the panel window sizes itself.
  sizeDrawer(root);

  const views = {
    registry: { label: "Registry", render: () => renderRegistry(content) },
    installed: { label: "Installed", render: () => renderInstalled(content) },
    github: { label: "GitHub", render: () => renderGithub(content) },
    missing: { label: "Missing", render: () => renderMissing(content) },
  };
  const buttons = {};
  const select = (key) => {
    for (const other of Object.keys(buttons)) buttons[other].classList.toggle("active", other === key);
    beginView();
    views[key].render();
  };
  for (const [key, view] of Object.entries(views)) {
    const button = el("button", "om-nav-btn", view.label);
    button.onclick = () => select(key);
    buttons[key] = button;
    nav.appendChild(button);
  }

  // Access keys and About are dialogs, not views, so they have no tab. Without this they are
  // reachable only from the classic menu, which the panel is the alternative to: the setting
  // tooltips that say "under Open Manager" would be pointing at nothing.
  const more = el("button", "om-nav-btn om-nav-more", "\u22ef");
  more.title = "Access keys, and what updating Open Manager takes";
  more.onclick = () => openManagerMenu();
  nav.appendChild(more);
  // Own keys only: "constructor" and friends are truthy on any object literal.
  select(Object.hasOwn(views, initial ?? "") ? initial : "registry");
}

// Repositories the user added by hand, held in ComfyUI's user directory. Each row installs,
// manages and opens like a registry pack. Uninstalling leaves the row; Remove takes it off
// the list and uninstalls in one step.
async function renderGithub(container) {
  const generation = viewGeneration;
  container.replaceChildren();

  const controls = el("div", "om-side-controls");
  const addButton = el("button", "om-btn om-go", "Add repository");
  addButton.title = "Add a GitHub repository to this list";
  addButton.onclick = () => addGithubSource(container);
  controls.appendChild(addButton);
  container.appendChild(controls);

  const status = el("div", "om-side-status", "Reading your repositories...");
  const list = el("div", "om-side-list");
  container.appendChild(status);
  container.appendChild(list);

  let data;
  try {
    const answer = await api.fetchApi(`${API}/github`);
    data = await answer.json();
    if (!answer.ok) throw new Error(`HTTP ${answer.status}`);
  } catch (error) {
    status.textContent = `Could not read your repositories: ${error.message}`;
    return;
  }
  if (!viewIsCurrent(generation)) return;

  const repos = data.repos || [];
  if (!repos.length) {
    status.textContent = "No repositories yet. Add one to install it from GitHub.";
    return;
  }
  status.textContent = `${repos.length} repositor${repos.length === 1 ? "y" : "ies"}`;
  for (const repo of repos) list.appendChild(buildGithubRow(repo, container));
}

// One added-repository row: owner, installed version, and a control whose menu carries
// Remove alongside the usual reinstall and uninstall.
function buildGithubRow(repo, container) {
  const row = el("div", "om-side-row");
  row.appendChild(packIcon("", repo.name));

  const text = el("div", "om-side-text");
  text.appendChild(el("div", "om-side-name", repo.name));
  const meta = el("div", "om-side-meta");
  meta.appendChild(document.createTextNode(`${repo.owner}/${repo.name}`));
  if (repo.installed_version) {
    meta.appendChild(el("span", "om-upd", repo.installed_version));
    if (repo.dir && repo.dir !== repo.name) meta.appendChild(el("span", "om-disabled", repo.dir));
  }
  text.appendChild(meta);
  const pack = { repo: repo.url, title: repo.name, classes: [] };
  text.onclick = () => openRepoPack(pack);
  row.appendChild(text);

  const items = [
    { label: "Open on GitHub", fn: () => openUrl(repo.url) },
    { label: "Remove from list", danger: true, fn: () => removeGithubSource(repo, container) },
  ];
  if (repo.installed_version) {
    items.unshift({ label: "Reinstall", fn: () => installFromRepo(pack, control) });
    items.unshift({
      label: "Uninstall",
      danger: true,
      fn: () => uninstall({
        packId: repo.dir || repo.name,
        entry: { name: repo.name },
        control,
        rowsRoot: row,
      }),
    });
  }
  const control = makeInstallControl({
    packId: repo.name,
    entry: { name: repo.name },
    rowsRoot: row,
    withMenu: true,
    items,
    onInstall: () => installFromRepo(pack, control),
  });
  if (repo.installed_version) control.setInstalled();
  else control.setInstall();
  control.el.classList.add("om-side-ictl");
  row.appendChild(control.el);
  return row;
}

// Asks for a repository URL and puts it on the list.
async function addGithubSource(container) {
  const url = await askText("Add a GitHub repository", "", "Add");
  if (!url) return;
  let result;
  try {
    const answer = await api.fetchApi(`${API}/github`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    result = await answer.json();
  } catch (error) {
    result = { ok: false, reason: error.message };
  }
  if (!result.ok) { notify("Could not add the repository", result.reason); return; }
  toast(`Added ${result.repo.owner}/${result.repo.name}.`, { kind: "ok" });
  renderGithub(container);
}

// Takes a repository off the list and uninstalls it in the same step.
async function removeGithubSource(repo, container) {
  const installed = !!repo.installed_version;
  const ok = await confirmAction(
    `Remove ${repo.name}`,
    installed
      ? `This takes ${repo.owner}/${repo.name} off your list and uninstalls it from custom_nodes.`
      : `This takes ${repo.owner}/${repo.name} off your list. Nothing is installed to remove.`,
    "Remove", true);
  if (!ok) return;
  const progress = toast(`Removing ${repo.name}...`, { sticky: true });
  let result;
  try {
    const answer = await api.fetchApi(`${API}/github/remove`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: repo.url }),
    });
    result = await answer.json();
  } catch (error) {
    result = { ok: false, reason: error.message };
  }
  if (!result.ok) { progress.remove(); notify("Could not remove the repository", result.reason); return; }
  progress.settle(
    result.uninstalled ? `Removed and uninstalled ${repo.name}.` : `Removed ${repo.name}.`, "ok", 6000);
  if (result.reason) notify("Uninstall failed", result.reason);
  if (result.uninstalled) remindRestart();
  renderGithub(container);
}

// Whether a version string is an orderable release rather than "present" or a git ref.
function isRelease(v) {
  return /^\d+(\.\d+)*$/.test((v || "").trim());
}

// Installs a pack's newest published version over the installed one, through the confirm and
// queue the version list uses.
function updateInstalled(pack, row, control) {
  install({
    packId: pack.registry_id,
    entry: { version: pack.latest, status: "active", name: pack.registry_id || pack.id },
    control,
    rowsRoot: row,
    overwrite: true,
  });
}

// Packs already in custom_nodes, each with a management control and an update flag where the
// registry advertises a newer version. A row opens the pack page.
async function renderInstalled(container) {
  const generation = viewGeneration;
  container.replaceChildren();
  // Left empty and given the indicator; whatever sets a count later replaces it.
  const status = el("div", "om-side-status");
  status.appendChild(loadingBlock("Reading installed packs"));
  const list = el("div", "om-side-list");
  container.appendChild(status);
  container.appendChild(list);
  let data;
  try {
    const answer = await api.fetchApi(`${API}/installed`);
    data = await answer.json();
    if (!answer.ok) throw new Error(`HTTP ${answer.status}`);
  } catch (error) {
    status.textContent = `Could not read installed packs: ${error.message}`;
    return;
  }
  if (!viewIsCurrent(generation)) return;
  const packs = data.packs;
  indexInstalled(packs);

  const [timings] = await Promise.all([loadStartupTimes(), loadHolds()]);
  if (!viewIsCurrent(generation)) return;
  if (timings?.ok && timings.packs?.length) {
    const worst = timings.packs[0];
    const line = el("div", "om-side-status om-cost-line");
    line.textContent = (timings.stale ? "Last run: " : "")
      + `${timings.total.toFixed(1)}s importing ${timings.packs.length} packs`
      + (worst ? ` · slowest ${worst.name} at ${worst.seconds.toFixed(2)}s` : "");
    // Presented as this run's figures only when they are this run's.
    line.classList.toggle("om-cost-stale", !!timings.stale);
    line.title = timings.stale
      ? timings.reason
      : "Read from ComfyUI's own log, for the run that is loaded now.";
    container.insertBefore(line, list);
  }

  const controls = el("div", "om-side-controls");
  // The same search the registry has. With dozens of packs installed, a list with no way to
  // find one in it is a list you scroll.
  const search = el("input", "om-search");
  search.type = "search";
  search.placeholder = "Search installed packs";
  search.spellcheck = false;
  const sortSel = dropdown("om-installed-sort", "name", [
    ["name", "Name A-Z"],
    ["status", "Status first"],
    ["updatable", "Updatable first"],
    ["stars", "Most stars"],
    ["slowest", "Slowest to load"],
    ["newest", "Newest installed"],
    ["oldest", "Oldest installed"],
    ["trusted", "Trusted authors first"],
  ]);
  const filterSel = dropdown("om-installed-filter", "all", [
    ["all", "All installed"],
    ["updates", "Updates available"],
    ["flagged", "Flagged or banned"],
    ["registry", "Registry"],
    ["github", "GitHub (from repo)"],
    ["disk", "Disk (local)"],
    ["off-registry", "Not on registry"],
  ]);
  controls.appendChild(sortSel);
  controls.appendChild(filterSel);
  const trustedOnly = el("label", "om-side-filter");
  const trustedBox = el("input");
  trustedBox.type = "checkbox";
  trustedOnly.appendChild(trustedBox);
  trustedOnly.appendChild(document.createTextNode("Trusted authors"));
  trustedOnly.title = "Only packs whose author you have trusted.";
  controls.appendChild(trustedOnly);
  container.insertBefore(search, list);
  container.insertBefore(controls, list);
  const count = el("div", "om-side-status", "");
  container.insertBefore(count, list);

  const updatableCount = packs.filter(isInstalledUpdatable).length;
  if (updatableCount) {
    const all = el("button", "om-btn om-go om-side-updateall",
                   `Update all (${updatableCount})`);
    all.title = "Updates every pack the registry advertises a newer version of, one after "
      + "another. Packs you are holding are left alone.";
    all.onclick = () => updateEveryPack(packs.filter(isInstalledUpdatable));
    controls.appendChild(all);
  }

  const cost = (pack) =>
    (pack.disabled ? null : startupCost.get(foldId(pack.dir)))?.seconds ?? -1;
  const age = (pack) => Number(pack.installed_at) || 0;

  const apply = () => {
    const mode = filterSel.value;
    const wanted = search.value.trim().toLowerCase();
    const rows = packs.filter((pack) => {
      if (mode === "updates" && !isInstalledUpdatable(pack)) return false;
      if (mode === "flagged" && !["flagged", "banned"].includes((pack.status || "").toLowerCase())) return false;
      if (mode === "off-registry" && pack.registry_id) return false;
      if (["registry", "github", "disk"].includes(mode) && pack.source !== mode) return false;
      if (trustedBox.checked && !byTrustedAuthor(pack)) return false;
      if (wanted && !`${pack.id} ${pack.dir} ${pack.repository || ""}`.toLowerCase().includes(wanted)) {
        return false;
      }
      return true;
    });
    const rank = (pack) => (pack.status === "banned" ? 0 : pack.status === "flagged" ? 1 : 2);
    const sorters = {
      name: (a, b) => a.id.localeCompare(b.id),
      status: (a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id),
      updatable: (a, b) => (isInstalledUpdatable(b) - isInstalledUpdatable(a)) || a.id.localeCompare(b.id),
      stars: (a, b) => (b.stars || 0) - (a.stars || 0) || a.id.localeCompare(b.id),
      slowest: (a, b) => cost(b) - cost(a) || a.id.localeCompare(b.id),
      // A pack the server could date nothing for sorts last either way rather than claiming
      // to be the oldest thing on disk, which is what a zero would do.
      newest: (a, b) => (age(b) || -Infinity) - (age(a) || -Infinity) || a.id.localeCompare(b.id),
      oldest: (a, b) => (age(a) || Infinity) - (age(b) || Infinity) || a.id.localeCompare(b.id),
      trusted: (a, b) => (byTrustedAuthor(b) - byTrustedAuthor(a)) || a.id.localeCompare(b.id),
    };
    rows.sort(sorters[sortSel.value] || sorters.name);
    list.replaceChildren();
    for (const pack of rows) list.appendChild(buildInstalledRow(pack));
    count.textContent = rows.length === packs.length
      ? `${rows.length} shown`
      : `${rows.length} of ${packs.length} shown`;
  };
  sortSel.addEventListener("change", () => { localStorage.setItem("om-installed-sort", sortSel.value); apply(); });
  filterSel.addEventListener("change", () => { localStorage.setItem("om-installed-filter", filterSel.value); apply(); });
  trustedBox.addEventListener("change", apply);
  const slowest = [...sortSel.options].find((one) => one.value === "slowest");
  if (slowest) slowest.disabled = !startupCost.size;
  if (slowest?.disabled && sortSel.value === "slowest") sortSel.value = "name";
  let searchTimer = 0;
  search.addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(apply, 150); });
  apply();

  // A dismissible alert where an installed version is flagged or banned. Dismissal is
  // remembered until the set of flagged or banned packs changes.
  const alerts = packs.filter((p) => !p.disabled && ["flagged", "banned"].includes((p.status || "").toLowerCase()));
  if (alerts.length) {
    const signature = alerts.map((p) => `${p.id}:${(p.status || "").toLowerCase()}`).sort().join("|");
    let dismissed = "";
    try { dismissed = localStorage.getItem(ALERTS_KEY) || ""; } catch {}
    if (dismissed !== signature) {
      const banner = buildInstalledAlert(alerts, () => {
        try { localStorage.setItem(ALERTS_KEY, signature); } catch {}
        banner.remove();
      });
      container.insertBefore(banner, container.firstChild);
    }
  }

  status.textContent = updatableCount
    ? `${packs.length} installed · ${updatableCount} update(s) available`
    : `${packs.length} installed`;

  // Fetched rather than waited for: a collision is worth knowing but not worth holding the
  // list for. It goes in above the list when the answer arrives, and only if this view is
  // still the one on screen.
  renderCollisions(container, generation).catch(() => {});
}

//: Packs the reader has asked to leave alone, keyed by directory name. Filled when the
//: installed view is drawn. A hold changes nothing on disk; it decides what is offered.
const heldVersions = new Map();

async function loadHolds() {
  heldVersions.clear();
  try {
    const found = await (await api.fetchApi(`${API}/holds`)).json();
    for (const [name, held] of Object.entries(found.holds || {})) {
      heldVersions.set(foldId(name), held);
    }
  } catch {
    // Nothing held is the safe reading: an update is offered that need not have been, which
    // the reader can decline, rather than one being hidden without their knowing.
  }
}

// Switching a pack off renames its directory, so a hold keyed on the name as it stands
// would stop applying the moment it was disabled and silently not come back. The name
// without the suffix is the one that survives both states.
function holdKey(pack) {
  return String(pack.dir || pack.id || "").replace(/\.disabled$/, "");
}

function isHeld(pack) {
  return heldVersions.has(foldId(holdKey(pack))) || heldVersions.has(foldId(pack.id));
}

// Hold a pack where it is, or let it move again. Takes effect in the list at once.
async function toggleHold(pack, refresh) {
  const off = isHeld(pack);
  const answer = await dlPost("/hold", {
    name: holdKey(pack), version: pack.version, off,
  });
  if (!answer.ok) {
    notify("Not changed", answer.reason || "The list of held packs could not be written.");
    return;
  }
  toast(off ? `${pack.id} will be offered updates again.`
            : `${pack.id} held at ${pack.version}.`, { kind: "ok" });
  refresh?.();
}

// Whether the registry advertises a newer version than the one installed. A pack being held
// is not updatable in any sense the rest of the view cares about: it is left out of the
// count, the filter, the sort and a batch update alike, which is the whole point of a hold.
function isInstalledUpdatable(pack) {
  return !!pack.registry_id && isRelease(pack.version) && isRelease(pack.latest)
    && compareVersions(pack.latest, pack.version) > 0 && !isHeld(pack);
}

// One installed-pack row: version, an update badge, a status-coloured management control, and
// a menu of Update, Reinstall and Uninstall scoped to what the pack is.
//: Directory name -> seconds it took to import, from ComfyUI's own log. Filled when the
//: installed view is drawn and left empty where the setting is off or the log says nothing.
const startupCost = new Map();
let startupTotal = 0;

async function loadStartupTimes() {
  startupCost.clear();
  startupTotal = 0;
  if (panelSetting("openManager.startupTimes", false) === false) return null;
  try {
    const found = await (await api.fetchApi(`${API}/startup`)).json();
    if (!found.ok) return found;
    for (const row of found.packs || []) startupCost.set(foldId(row.name), row);
    startupTotal = found.total || 0;
    return found;
  } catch {
    return null;
  }
}

// Switch a pack off, or back on, by renaming its directory the way ComfyUI reads it.
async function togglePack(pack, refresh) {
  const off = !pack.disabled;
  const shown = pack.dir.replace(/\.disabled$/, "");
  const go = await chooseAction(off ? `Switch off ${shown}?` : `Switch on ${shown}?`, "",
    [{ key: "go", label: off ? "Switch off" : "Switch on", primary: true }],
    { wide: true, facts: [
      ["Pack", shown],
      ["Directory", off ? `${pack.dir} → ${pack.dir}.disabled` : `${pack.dir} → ${shown}`],
      ["Files", "Kept. Nothing is deleted."],
      ["Takes effect", "After ComfyUI restarts"],
    ] });
  if (!go) return;
  const answer = await dlPost("/pack/toggle", { name: pack.dir, off });
  if (!answer.ok) { notify("Not changed", answer.reason || "The directory could not be renamed."); return; }
  toast(`${shown} switched ${off ? "off" : "on"}.`, { kind: "ok" });
  if (answer.restart) remindRestart();
  refresh?.();
}

// How long a pack has been here, in the coarsest unit that still says something. An exact
// date is in the tooltip; the list is for spotting the one that has been sat there for years.
function installedText(when) {
  const days = Math.floor((Date.now() - when.getTime()) / 86400000);
  if (!Number.isFinite(days) || days < 0) return "installed";
  if (days < 1) return "installed today";
  if (days < 30) return `installed ${days}d ago`;
  if (days < 365) return `installed ${Math.floor(days / 30)}mo ago`;
  const years = Math.floor(days / 365);
  return `installed ${years}y ago`;
}

function buildInstalledRow(pack) {
  const updatable = isInstalledUpdatable(pack);
  const row = el("div", "om-side-row");
  row._installedVersion = pack.version;
  row.appendChild(packIcon(pack.icon, pack.id));

  const text = el("div", "om-side-text");
  text.appendChild(el("div", "om-side-name", pack.id));
  const meta = el("div", "om-side-meta");
  const shownDir = pack.disabled ? pack.dir.replace(/\.disabled$/, "") : pack.dir;
  meta.appendChild(document.createTextNode(`${pack.version}${shownDir !== pack.id ? " · " + shownDir : ""}`));
  const istars = starCount(pack.stars);
  if (istars) meta.appendChild(istars);
  const SOURCES = {
    github: ["from a repository", "cloned or installed from a Git URL; it updates from there"],
    registry: ["from the registry", "installed from the Comfy Registry"],
    disk: ["on disk only", "placed by hand: no registry entry and no repository to update "
           + "from"],
  };
  const origin = SOURCES[pack.source];
  if (origin) {
    const mark = el("span", `om-src om-src-${pack.source}`, origin[0]);
    mark.title = origin[1];
    meta.appendChild(mark);
  }
  if (pack.installed_at) {
    const when = new Date(pack.installed_at * 1000);
    const since = el("span", "om-side-when", installedText(when));
    since.title = `Installed ${when.toLocaleString()}. Taken from this pack's install record `
      + "where it has one, otherwise from the directory on disk.";
    meta.appendChild(since);
  }
  if (pack.disabled) meta.appendChild(el("span", "om-disabled", "disabled"));
  if (isHeld(pack)) {
    const badge = el("span", "om-held", `held at ${pack.version}`);
    badge.title = "No update is offered for this pack until the hold is lifted. Nothing on "
      + "disk has been changed.";
    meta.appendChild(badge);
  }
  const cost = pack.disabled ? null : startupCost.get(foldId(pack.dir));
  if (cost) {
    const badge = el("span", "om-cost", `${cost.seconds.toFixed(2)}s`);
    badge.title = startupTotal
      ? `Took ${cost.seconds.toFixed(2)}s of the ${startupTotal.toFixed(1)}s ComfyUI spent importing packs`
      : `Took ${cost.seconds.toFixed(2)}s to import`;
    if (startupTotal && cost.seconds >= startupTotal * 0.2) badge.classList.add("om-cost-high");
    meta.appendChild(badge);
  }
  if (cost?.failed) meta.appendChild(el("span", "om-upd om-cost-failed", "import failed"));
  if (updatable) meta.appendChild(el("span", "om-upd", `update → ${pack.latest}`));
  text.appendChild(meta);
  if (pack.registry_id) text.onclick = () => openPack(pack.registry_id);
  else if (pack.repository) text.onclick = () => openRepoPack({ repo: pack.repository, title: pack.id, classes: [] });
  row.appendChild(text);

  const current = { version: pack.version, status: "active",
                    name: pack.registry_id || pack.id };
  const items = installedMenu(pack, null, () => control, row,
    () => refreshInstalledIfActive());

  const control = makeInstallControl({
    packId: pack.registry_id || pack.id,
    entry: current,
    rowsRoot: row,
    withMenu: true,
    items,
  });
  const vstatus = (pack.status || "").toLowerCase();
  if (vstatus === "banned" || vstatus === "flagged") control.setStatusInstalled(vstatus);
  else if (updatable) control.setUpdate(pack.latest, () => updateInstalled(pack, row, control));
  else control.setInstalled();
  control.el.classList.add("om-side-ictl");
  row.appendChild(control.el);
  return row;
}

// Update every pack that has one. The queue that already runs installs one after another
// does the work, so a batch behaves exactly like a row asked twelve times: one progress
// toast, one list of issues at the end, and each pack's own requirements installed as its
// own step. What is confirmed here is the set, once, instead of a dialog per pack.
async function updateEveryPack(packs) {
  if (!packs.length) return;
  const facts = packs.slice(0, 24).map((pack) => [pack.id, `${pack.version} -> ${pack.latest}`]);
  if (packs.length > facts.length) {
    facts.push(["And more", `${packs.length - facts.length} others`]);
  }
  facts.push(["One at a time", "Each finishes before the next starts."]);
  facts.push(["Dependencies", "Each pack installs its own requirements, as it would on its "
                              + "own. Anything that did not install cleanly is named at the end."]);
  facts.push(["Held packs", "Left alone. Holding a pack is what keeps it out of this."]);
  facts.push(["Takes effect", "After ComfyUI restarts"]);
  const go = await chooseAction(`Update ${packs.length} pack${packs.length === 1 ? "" : "s"}?`,
    "", [{ key: "go", label: "Update them", primary: true }], { wide: true, facts });
  if (!go) return;

  // The same setting the single-pack path reads. A batch does not get to skip the scan
  // someone asked for, and it does not get to impose one either.
  const scanFirst = vtReady() && panelSetting("openManager.scanOnInstall", false) === true
                    && (await vtRemaining()) > 0;
  for (const pack of packs) {
    enqueueInstall({
      packId: pack.registry_id,
      entry: { version: pack.latest, status: "active", name: pack.registry_id || pack.id },
      overwrite: true,
      name: pack.id,
      scanFirst,
    });
  }
}

const ALERTS_KEY = "openManager.installedAlertsDismissed";
const COLLIDE_KEY = "openManager.collisionsDismissed";

// Node names claimed by more than one installed pack. ComfyUI keeps one mapping for the whole
// install, so the last pack to register a name takes it and nothing is said; a graph then
// loads a node that is not the one it was saved with. Shown only when there is something to
// report, and dismissed until that set changes.
async function renderCollisions(container, generation) {
  let found;
  try {
    found = await (await api.fetchApi(`${API}/collisions`)).json();
  } catch {
    return;
  }
  if (!viewIsCurrent(generation)) return;
  const groups = found?.ok ? (found.groups || []) : [];
  if (!groups.length) return;
  const signature = groups.map((one) => `${one.node}:${one.packs.join(",")}`).sort().join("|");
  let dismissed = "";
  try { dismissed = localStorage.getItem(COLLIDE_KEY) || ""; } catch {}
  if (dismissed === signature) return;

  const banner = el("div", "om-alert");
  const body = el("div", "om-alert-body");
  body.appendChild(el("b", null,
    `${groups.length} node name${groups.length === 1 ? " is" : "s are"} claimed by more than `
    + "one pack"));
  const names = [...new Set(groups.flatMap((one) => one.packs))];
  body.appendChild(el("div", "om-alert-names", names.join(", ")));
  const more = el("button", "om-btn om-dl-btn om-alert-more", "What collides");
  more.onclick = () => showCollisions(groups);
  body.appendChild(more);
  banner.appendChild(body);
  const dismiss = el("button", "om-alert-x", "×");
  dismiss.title = "Dismiss until this changes";
  dismiss.onclick = () => {
    try { localStorage.setItem(COLLIDE_KEY, signature); } catch {}
    banner.remove();
  };
  banner.appendChild(dismiss);
  container.insertBefore(banner, container.firstChild);
}

// Each contested name, who claims it, and whose class is actually in use.
function showCollisions(groups) {
  const facts = groups.slice(0, 40).map((one) => [
    one.node,
    one.loaded
      ? `${one.packs.join(", ")} - ${one.loaded} is the one in use`
      : one.packs.join(", "),
  ]);
  if (groups.length > facts.length) {
    facts.push(["And more", `${groups.length - facts.length} others`]);
  }
  facts.push(["Why it matters", "Only one class can hold a name. A graph saved against the "
                                + "other one loads this one instead."]);
  facts.push(["What to do", "Switch one of the packs off from its row here, or keep only the "
                            + "one you use. Nothing is changed for you."]);
  chooseAction("Node names claimed twice", "", [], { wide: true, facts });
}

// A banner naming the installed packs whose version the registry flagged or banned, with a
// dismiss control.
function buildInstalledAlert(list, onDismiss) {
  const banned = list.filter((p) => (p.status || "").toLowerCase() === "banned").length;
  const flagged = list.length - banned;
  const plural = (n) => (n === 1 ? "" : "s");
  let headline;
  if (banned && flagged) headline = `${list.length} installed packs flagged or banned by the registry`;
  else if (banned) headline = `${banned} installed pack${plural(banned)} banned by the registry`;
  else headline = `${flagged} installed pack${plural(flagged)} flagged by the registry`;

  const banner = el("div", `om-alert${banned ? " om-alert-danger" : ""}`);
  const body = el("div", "om-alert-body");
  body.appendChild(el("b", null, headline));
  const names = [...new Set(list.map((p) => p.dir || p.id))];
  body.appendChild(el("div", "om-alert-names", names.join(", ")));
  banner.appendChild(body);
  const dismiss = el("button", "om-alert-x", "×");
  dismiss.title = "Dismiss until this changes";
  dismiss.onclick = onDismiss;
  banner.appendChild(dismiss);
  return banner;
}

// Packs that provide the node types missing from the open graph, each installable in place.
async function renderMissing(container) {
  container.replaceChildren();
  const status = el("div", "om-side-status");
  status.appendChild(loadingBlock("Scanning the current graph"));
  const list = el("div", "om-side-list");
  container.appendChild(status);
  container.appendChild(list);

  const missing = collectMissingNodeTypes();
  if (!missing.length) {
    status.textContent = "No missing nodes in the current workflow.";
    return;
  }
  status.textContent = `Resolving ${missing.length} missing node type(s)...`;
  let data;
  try {
    const answer = await api.fetchApi(`${API}/resolve-nodes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ classes: missing }),
    });
    data = await answer.json();
    if (!answer.ok) throw new Error(`HTTP ${answer.status}`);
  } catch (error) {
    status.textContent = `Could not resolve missing nodes: ${error.message}`;
    return;
  }

  status.textContent = `${data.packs.length} pack(s) for ${missing.length} missing node type(s)`;
  for (const pack of data.packs) {
    const row = el("div", "om-side-row");
    row.appendChild(packIcon(pack.icon, pack.title));
    const text = el("div", "om-side-text");
    text.appendChild(el("div", "om-side-name", pack.title));
    const shown = pack.classes.slice(0, 3).join(", ") + (pack.classes.length > 3 ? "…" : "");
    text.appendChild(el("div", "om-side-meta", `${pack.classes.length} node(s): ${shown}`));
    if (pack.installable) text.onclick = () => openPack(pack.pack_id);
    else if (pack.repo) text.onclick = () => openRepoPack(pack);
    row.appendChild(text);

    if (pack.installable) {
      const control = makeInstallControl({
        packId: pack.pack_id,
        withMenu: false,
        onInstall: () => quickInstall(pack.pack_id, control),
      });
      if (pack.installed_version) control.setInstalled();
      else control.setInstall();
      row.appendChild(control.el);
    } else if (pack.repo) {
      // Not on the registry. Installable from GitHub after inspection and a clear warning.
      const control = makeInstallControl({
        packId: pack.repo,
        withMenu: false,
        onInstall: () => installFromRepo(pack, control),
      });
      control.setInstall();
      control.el.title = "Not on the registry. Installs from GitHub after inspection.";
      row.appendChild(control.el);
    }
    list.appendChild(row);
  }
  if (data.unresolved.length) {
    container.appendChild(el("div", "om-side-status",
      `${data.unresolved.length} node type(s) not found in any known pack.`));
  }
}

// The registry browser: search, the published-only filter, and the windowed result list.
function sinceText(ts) {
  if (!ts) return "never";
  const s = Date.now() / 1000 - ts;
  if (s < 90) return "just now";
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 129600) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

// A styled select whose choice is remembered under a storage key. Options are [value, label].
function dropdown(storageKey, fallback, options) {
  const select = el("select", "om-side-select");
  for (const [value, label] of options) {
    const option = el("option", null, label);
    option.value = value;
    select.appendChild(option);
  }
  let saved = null;
  try { saved = localStorage.getItem(storageKey); } catch {}
  select.value = options.some(([value]) => value === saved) ? saved : fallback;
  return select;
}

// How a licence lookup should run, from the panel's settings. Every speed-up is off by
// default, so the behaviour only changes for someone who asks for it.
// Whether the reader has taken the block off versions the registry banned.
//
// Off by default, and it lifts a block rather than silencing a warning: a banned version
// still carries its critical finding and still has to be confirmed. The answer travels with
// each request, so the server never holds a standing permission the reader cannot see.
function allowBanned() {
  return panelSetting("openManager.allowBanned", false) === true;
}

// The query a pack page is fetched with: how far its licence lookup may go, and whether a
// banned version should come back installable.
function packQuery() {
  return new URLSearchParams({ ...licenseOptions(), allow_banned: allowBanned() });
}

function licenseOptions() {
  const get = (key, fallback) => {
    try { return app.extensionManager.setting.get(key) ?? fallback; } catch { return fallback; }
  };
  return {
    concurrency: Number(get("openManager.licenseConcurrency", 8)) || 8,
    race: get("openManager.licenseRace", false) === true,
    use_api: get("openManager.licenseUseApi", false) === true,
    // Reuses the token already configured for starring; it only raises the API's rate limit.

  };
}

// How a sync should read the catalogue, from the panel's settings. The backend clamps the
// count, so a mistyped preference cannot turn the sync into a flood.
function syncOptions() {
  const get = (key, fallback) => {
    try { return app.extensionManager.setting.get(key) ?? fallback; } catch { return fallback; }
  };
  return {
    parallel: get("openManager.parallelSync", true) !== false,
    concurrency: Number(get("openManager.syncConcurrency", 8)) || 8,
  };
}

// The registry browser over the cached catalogue: search, a chosen sort, and a licence
// filter. Only a sync, an update or an install reaches the network.
//: Topics already looked up, so retyping or reopening does not ask GitHub again. The server
//: caches too; this saves the round trip.
const topicPacks = new Map();

//: What a search has to start with to be read as a topic rather than as words.
const TOPIC_PREFIX = "topic:";

// The pack ids carrying a GitHub topic, or null where it could not be answered.
//
// Args:
//   topic: The topic, as GitHub spells it.
// Returns:
//   `{ids, found, partial}` with `ids` a Set, or `{error}` with a sentence to show.
async function packsForTopic(topic) {
  if (topicPacks.has(topic)) return topicPacks.get(topic);
  let answer;
  try {
    const query = new URLSearchParams({ name: topic });
    answer = await (await api.fetchApi(`${API}/topic?${query}`)).json();
  } catch (error) {
    return { error: `The topic could not be looked up: ${error.message}` };
  }
  if (!answer.ok) return { error: answer.reason || "GitHub did not answer." };
  const result = { ids: new Set(answer.ids || []), found: answer.found || 0,
                   partial: Boolean(answer.partial) };
  topicPacks.set(topic, result);
  return result;
}

//: The topic a search box is asking for, or empty where it is asking for words.
function topicInQuery(value) {
  const text = String(value || "").trim().toLowerCase();
  return text.startsWith(TOPIC_PREFIX) ? text.slice(TOPIC_PREFIX.length).trim() : "";
}

// Open the pack manager and search it for a GitHub topic.
//
// Follows the same setting every other way in does, so a reader who has chosen modals gets a
// modal. Nothing new is introduced: the search box ends up holding `topic:<name>`, which is a
// query they could have typed, so what happened is visible and undoable.
function browseTopic(topic) {
  const root = openPanelWindow("registry");
  // The list is built asynchronously, so the search box is waited for rather than assumed.
  let tries = 0;
  const fill = () => {
    const box = (root?.querySelector?.(".om-search"))
      || document.querySelector(".om-float .om-search, .om-panel-window .om-search");
    if (!box) {
      if (tries++ < 40) setTimeout(fill, 150);
      return;
    }
    box.value = `${TOPIC_PREFIX}${topic}`;
    box.dispatchEvent(new Event("input", { bubbles: true }));
  };
  fill();
}

function renderRegistry(container) {
  const generation = viewGeneration;
  container.replaceChildren();
  const status = el("div", "om-side-status");
  status.appendChild(loadingBlock("Loading the catalogue"));
  container.appendChild(status);

  const showSyncPrompt = () => {
    if (!viewIsCurrent(generation)) return;
    container.replaceChildren();
    const box = el("div", "om-empty");
    box.appendChild(el("div", "om-empty-title", "The registry is not synced"));
    box.appendChild(el("div", "om-side-status",
      "Sync once to browse offline. Only a sync, an update or an install uses the network."));
    const go = el("button", "om-btn om-go", "Sync registry");
    go.onclick = startSync;
    box.appendChild(go);
    container.appendChild(box);
  };

  const showSyncing = () => {
    if (!viewIsCurrent(generation)) return;
    container.replaceChildren();
    const box = el("div", "om-empty");
    box.appendChild(el("div", "om-empty-title", "Syncing the registry..."));
    const bar = el("div", "om-side-status", "");
    box.appendChild(bar);
    container.appendChild(box);
    const poll = async () => {
      if (!viewIsCurrent(generation)) return;
      let info;
      try { info = await (await api.fetchApi(`${API}/catalog/state`)).json(); }
      catch { bar.textContent = "connection lost"; return; }
      if (info.syncing) { bar.textContent = `${info.done}/${info.total} pages`; setTimeout(poll, 800); }
      else if (info.cached) showCatalogue(info);
      else showSyncPrompt();
    };
    poll();
  };

  const startSync = async () => {
    try {
      await api.fetchApi(`${API}/catalog/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(syncOptions()),
      });
    } catch (error) {}
    showSyncing();
  };

  const showCatalogue = async (info) => {
    if (!viewIsCurrent(generation)) return;
    let nodes;
    try {
      nodes = (await (await api.fetchApi(`${API}/catalog`)).json()).nodes || [];
    } catch (error) {
      status.textContent = `Could not load catalogue: ${error.message}`;
      return;
    }
    if (!viewIsCurrent(generation)) {
      return;
    }
    container.replaceChildren();

    const header = el("div", "om-cat-head");
    header.appendChild(el("div", "om-side-status",
      `${nodes.length.toLocaleString()} packs · synced ${sinceText(info.fetched_at)}`));
    const update = el("button", "om-btn", "Update");
    update.onclick = startSync;
    header.appendChild(update);
    container.appendChild(header);

    const search = el("input", "om-search");
    search.type = "search";
    search.placeholder = "Search the registry, or topic:name";
    search.title = "Words match a pack's name, id, description and publisher. `topic:animation`"
      + " asks GitHub which repositories carry that tag and shows the packs among them, which"
      + " is what clicking a tag on a pack's page does.";
    search.spellcheck = false;
    container.appendChild(search);

    const controls = el("div", "om-side-controls");
    // The sidebar and the window are different widths, so they remember the view apart.
    // Sort and licence stay shared. The old shared key belongs to neither.
    try { localStorage.removeItem("om-registry-view"); } catch {}
    const viewKey = container.closest(".om-panel-window, .om-float")
      ? "om-registry-view-window" : "om-registry-view-side";
    const viewSel = dropdown(viewKey, "list", [
      ["list", "List view"],
      ["cards", "Card view"],
      ["table", "Table view"],
    ]);
    const sortSel = dropdown("om-registry-sort", "downloads", [
      ["downloads", "Most downloads"],
      ["released", "Recently released"],
      ["stars", "Most stars"],
      ["name", "Name A-Z"],
      ["license", "Licence: permissive first"],
      ["trusted", "Trusted authors first"],
    ]);
    const licSel = dropdown("om-registry-license", "all", [
      ["all", "All licences"],
      ["permissive", "Permissive"],
      ["weak-copyleft", "Weak copyleft"],
      ["copyleft", "Copyleft"],
      ["community", "Community"],
      ["non-commercial", "Non-commercial"],
      ["unknown", "Unknown"],
    ]);
    const filterWrap = el("label", "om-side-filter");
    const filterBox = el("input");
    filterBox.type = "checkbox";
    filterBox.checked = (localStorage.getItem("om-registry-published") ?? "1") === "1";
    filterWrap.appendChild(filterBox);
    filterWrap.appendChild(el("span", null, "Published only"));
    const trustWrap = el("label", "om-side-filter");
    const trustBox = el("input");
    trustBox.type = "checkbox";
    trustBox.checked = localStorage.getItem("om-registry-trusted") === "1";
    trustWrap.appendChild(trustBox);
    trustWrap.appendChild(el("span", null, "Trusted authors"));
    trustWrap.title = "Only packs whose repository belongs to an author you have trusted";
    controls.appendChild(viewSel);
    controls.appendChild(sortSel);
    controls.appendChild(licSel);
    controls.appendChild(filterWrap);
    controls.appendChild(trustWrap);
    container.appendChild(controls);

    const count = el("div", "om-side-status", "");
    const list = el("div", "om-side-list om-virt-host");
    // The sizer carries the height of every result at once so the scrollbar is true from
    // the first paint; the window holds only the rows near the viewport.
    const sizer = el("div", "om-virt");
    const win = el("div", "om-virt-win");
    sizer.appendChild(win);
    list.appendChild(sizer);
    container.appendChild(count);

    // Outside the scrolling area, on the same grid as the rows.
    const head = el("div", "om-table-head");
    for (const [cls, label] of [
      ["num", "#"], ["title", "Title"], ["ver", "Version"], ["action", "Action"],
      ["dl", "Downloads"], ["desc", "Description"], ["auth", "Author"],
      ["lic", "Licence"], ["star", "★"], ["date", "Updated"],
    ]) head.appendChild(el("div", `om-tcell om-tcell-${cls}`, label));
    container.appendChild(head);
    container.appendChild(list);

    const comparators = {
      downloads: (a, b) => (b.downloads - a.downloads),
      released: (a, b) => (b.released || "").localeCompare(a.released || "") || (b.downloads - a.downloads),
      stars: (a, b) => (b.stars - a.stars),
      name: (a, b) => (a.name || a.id).localeCompare(b.name || b.id),
      license: (a, b) => (a.license_rank - b.license_rank) || (b.downloads - a.downloads),
      trusted: (a, b) => (byTrustedAuthor(b) - byTrustedAuthor(a)) || (b.downloads - a.downloads),
    };
    // The whole catalogue is already in memory, so nothing here waits on the network: the
    // list is windowed rather than paged, and scrolling only decides which rows to build.
    const OVERSCAN = 4;
    // Table rows carry their own separator.
    const GAP = { list: 4, cards: 8, table: 0 };

    let filtered = [];
    let pitch = 56;   // one row's height plus its gap, read back from what was drawn
    let perRow = 1;   // entries per row: one in the list, the column count in the grid
    let from = -1;
    let to = -1;

    const cardsOn = () => viewSel.value === "cards";
    const tableOn = () => viewSel.value === "table";
    const gapNow = () => GAP[viewSel.value] ?? GAP.list;
    // Table column tiers. Each sits above that tier's minimum width, because the list clips
    // horizontal overflow rather than scrolling it.
    const WIDE = 1000;   // ten columns, minimum 968
    const MID = 470;     // six columns, minimum 430

    // Geometry is measured from the DOM rather than assumed, so a theme, a thumbnail size
    // or a wider panel is accounted for without being told.
    const measure = () => {
      const probe = win.firstElementChild;
      if (!probe) return false;
      const height = Math.round(probe.getBoundingClientRect().height);
      const columns = cardsOn()
        ? (getComputedStyle(win).gridTemplateColumns.split(" ").filter(Boolean).length || 1)
        : 1;
      if (height <= 0) return false;
      const changed = height + gapNow() !== pitch || columns !== perRow;
      pitch = height + gapNow();
      perRow = columns;
      return changed;
    };

    const paint = (force = false) => {
      const rows = Math.ceil(filtered.length / perRow);
      sizer.style.height = `${Math.max(0, rows * pitch - (rows ? gapNow() : 0))}px`;
      const firstRow = Math.max(0, Math.floor(list.scrollTop / pitch) - OVERSCAN);
      const rowsShown = Math.ceil(list.clientHeight / pitch) + OVERSCAN * 2;
      const start = firstRow * perRow;
      const end = Math.min(filtered.length, (firstRow + rowsShown) * perRow);
      if (!force && start === from && end === to) return;
      from = start;
      to = end;
      win.style.transform = `translateY(${firstRow * pitch}px)`;
      const build = cardsOn() ? buildResultCard : tableOn() ? buildResultTableRow : buildResultRow;
      // The absolute position, so the table numbers the result set and not the window.
      win.replaceChildren(...filtered.slice(start, end).map((entry, i) => build(entry, start + i)));
    };

    const fitColumns = () => {
      const width = list.clientWidth;
      const want = width <= 0 || width >= WIDE ? "om-t-wide"
        : width >= MID ? "om-t-mid" : "om-t-tight";
      for (const node of [head, win]) {
        node.classList.remove("om-t-wide", "om-t-mid", "om-t-tight");
        node.classList.add(want);
      }
      // The headings sit outside the scrolling list, so they are wider than the rows by
      // whatever it keeps for its scrollbar. Measured, since that width is the platform's.
      if (tableOn() && head.clientWidth > 0 && list.clientWidth > 0) {
        const gutter = Math.max(0, head.clientWidth - list.clientWidth);
        head.style.paddingRight = `${8 + gutter}px`;
      }
    };

    // The first paint after a change uses the previous geometry; whatever actually landed
    // is measured on the next frame and drawn again where it differs.
    const repaint = (force = true) => {
      fitColumns();
      paint(force);
      // The width read above can precede the layout it causes, leaving the tier a step
      // behind, so both it and the row height are read again on the settled frame.
      requestAnimationFrame(() => {
        const tier = head.className;
        fitColumns();
        if (measure() || head.className !== tier) paint(true);
      });
    };

    // Licences are read from the repository, so they are asked for only once the reader has
    // stopped on something. Sweeping the whole catalogue would otherwise queue every pack
    // it passed, which is thousands of reads for rows nobody looked at.
    let settle = null;
    const queueVisibleLicences = () => {
      clearTimeout(settle);
      settle = setTimeout(() => {
        for (const node of win.children) {
          if (node._entry && node._licPill) queueLicense(node._entry, node._licPill);
        }
      }, 250);
    };

    // One predicate, used by the full apply below and by the re-filter a resolved licence
    // triggers, so the two can never disagree about what belongs on screen.
    //: The topic being shown, and the ids it resolved to. Held here rather than looked up
    //: inside the predicate, which runs once per pack per keystroke.
    let topicNow = "";
    let topicIds = null;

    const matches = (node) => {
      const query = search.value.trim().toLowerCase();
      const tier = licSel.value;
      if (filterBox.checked && !node.advertised) return false;
      if (trustBox.checked && !byTrustedAuthor(node)) return false;
      if (tier !== "all" && node.license_tier !== tier) return false;
      // A topic search is a different question: it asks GitHub which repositories carry a
      // tag, so the words in a pack's name and description have no bearing on it.
      if (topicInQuery(query)) return topicIds ? topicIds.has(node.id) : false;
      if (!query) return true;
      return (node.name || "").toLowerCase().includes(query)
        || node.id.toLowerCase().includes(query)
        || (node.description || "").toLowerCase().includes(query)
        || (node.publisher || "").toLowerCase().includes(query);
    };

    // Asynchronous because a topic search has to be resolved first. The listeners call the
    // wrapper below rather than this, so a failure cannot surface as an unhandled rejection
    // in the console of a reader who only changed a dropdown.
    const applyNow = async () => {
      // A topic has to be resolved before anything can be filtered by it. The count says so
      // meanwhile, because a GitHub search takes a moment and an empty list would otherwise
      // read as "no packs carry this".
      const wantedTopic = topicInQuery(search.value);
      if (wantedTopic && wantedTopic !== topicNow) {
        topicNow = wantedTopic;
        topicIds = null;
        count.textContent = `Asking GitHub which packs are tagged ${wantedTopic}...`;
        const answer = await packsForTopic(wantedTopic);
        // Abandoned: the reader typed on, and a later apply owns the list now.
        if (topicInQuery(search.value) !== wantedTopic) return;
        if (answer.error) {
          topicIds = new Set();
          count.textContent = answer.error;
          filtered = [];
          from = to = -1;
          repaint();
          return;
        }
        topicIds = answer.ids;
        topicNow = wantedTopic;
      } else if (!wantedTopic) {
        topicNow = "";
        topicIds = null;
      }

      filtered = nodes.filter(matches).sort(comparators[sortSel.value] || comparators.downloads);
      count.textContent = wantedTopic
        ? `${filtered.length.toLocaleString()} tagged ${wantedTopic}`
        : `${filtered.length.toLocaleString()} shown`;
      win.className = `om-virt-win ${
        cardsOn() ? "om-card-grid" : tableOn() ? "om-table-win" : "om-list-win"}`;
      head.style.display = tableOn() ? "" : "none";
      list.classList.toggle("om-table-list", tableOn());
      list.scrollTop = 0;
      from = to = -1;
      repaint();
      queueVisibleLicences();
    };
    const apply = () => {
      applyNow().catch((error) => {
        count.textContent = `The list could not be filtered: ${error.message}`;
      });
    };

    // A licence read from a repository can move a pack out of the tier it was filtered by:
    // "unknown" is exactly the set being resolved, so rows leave it as answers arrive.
    // The reader's place in the list is kept rather than reset, since this happens while
    // they are reading it.
    onLicencesResolved = () => {
      if (!viewIsCurrent(generation)) { onLicencesResolved = null; return; }
      if (licSel.value === "all") return;
      const before = filtered.length;
      const anchor = list.scrollTop;
      filtered = nodes.filter(matches).sort(comparators[sortSel.value] || comparators.downloads);
      if (filtered.length === before) return;
      count.textContent = `${filtered.length.toLocaleString()} shown`;
      const rows = Math.ceil(filtered.length / perRow);
      list.scrollTop = Math.min(anchor, Math.max(0, rows * pitch - list.clientHeight));
      from = to = -1;
      repaint();
    };

    list.addEventListener("scroll", () => { paint(); queueVisibleLicences(); }, { passive: true });
    // A resized panel changes the column count and the card height, so the window is
    // remeasured rather than left describing the old layout. The observer lets go once the
    // view it belongs to has been replaced, rather than repainting a detached list.
    const shape = new ResizeObserver(() => {
      if (!viewIsCurrent(generation)) { shape.disconnect(); return; }
      repaint();
    });
    shape.observe(list);
    let timer = null;
    search.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(apply, 150); });
    viewSel.addEventListener("change", () => { localStorage.setItem(viewKey, viewSel.value); apply(); });
    sortSel.addEventListener("change", () => { localStorage.setItem("om-registry-sort", sortSel.value); apply(); });
    licSel.addEventListener("change", () => { localStorage.setItem("om-registry-license", licSel.value); apply(); });
    filterBox.addEventListener("change", () => {
      localStorage.setItem("om-registry-published", filterBox.checked ? "1" : "0");
      apply();
    });
    trustBox.addEventListener("change", () => {
      localStorage.setItem("om-registry-trusted", trustBox.checked ? "1" : "0");
      apply();
    });
    apply();
  };

  (async () => {
    let info;
    try { info = await (await api.fetchApi(`${API}/catalog/state`)).json(); }
    catch (error) { status.textContent = `Backend unavailable: ${error.message}`; return; }
    if (!viewIsCurrent(generation)) return;
    if (info.syncing) showSyncing();
    else if (info.cached) showCatalogue(info);
    else showSyncPrompt();
  })();
}
const sidebarStyle = document.createElement("style");
sidebarStyle.textContent = `
/* The panel as a window, for the legacy menu. The host fills the dialog so the panel keeps
   the height it relies on. */
.om-panel-window > div { flex: 1; min-height: 0; }
/* The close button floats over the dialog's top-right corner, which is where the panel's
   last tab would otherwise sit. The tab row stops short of it rather than running under. */
.om-panel-window .om-nav { padding-right: 30px; }
.om-legacy-btn { width: 100%; }

.om-side { display: flex; flex-direction: column; height: 100%; padding: 10px; gap: 8px;
  font: 13px/1.5 system-ui, sans-serif; color: var(--om-text); box-sizing: border-box; }
.om-nav { display: flex; gap: 4px; flex: none; }
.om-nav-btn { flex: 1; padding: 6px 4px; background: var(--om-surface); border: 1px solid var(--om-border);
  border-radius: 6px; color: var(--om-muted); cursor: pointer; font-size: 12px; }
.om-nav-btn:hover { background: var(--om-hover); }
.om-nav-more { flex: none; width: 28px; padding: 6px 0; font-size: 14px; line-height: 1; }
.om-nav-btn.active { background: var(--om-border); color: var(--om-text); border-color: var(--om-border); }
.om-content { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 8px; }
.om-cat-head { display: flex; gap: 8px; align-items: center; justify-content: space-between; }
.om-cat-head .om-btn { flex: none; padding: 5px 12px; font-size: 12px; }
.om-empty { display: flex; flex-direction: column; gap: 12px; align-items: flex-start;
  padding: 20px 4px; }
.om-empty-title { font-size: 15px; font-weight: 600; }
.om-search { width: 100%; padding: 7px 10px; border-radius: 6px; box-sizing: border-box;
  background: var(--om-input); color: var(--om-text); border: 1px solid var(--om-border); }
.om-side-status { color: var(--om-muted); font-size: 11px; }
.om-side-when { color: var(--om-muted); }
/* Where a pack came from, which decides how it updates. Quiet: it is a fact about the row,
   not a warning about it. */
.om-src { font-size: 11px; padding: 0 7px; border-radius: 999px; line-height: 17px;
  color: var(--om-text-2); background: var(--om-input); }
.om-src-disk { color: #d29922; }
.om-side-list { flex: 1; overflow-y: auto; overflow-x: hidden; display: flex;
  flex-direction: column; gap: 4px; padding-right: 8px; }
/* Windowed list. The host is a plain block because the sizer inside it, not the host,
   carries the full height of the results; the layout the rows sit in moves to the window.
   Other tabs keep the flex column above, so only the registry list is windowed. */
.om-side-list.om-virt-host { display: block; }
.om-virt { position: relative; width: 100%; }
.om-virt-win { position: absolute; top: 0; left: 0; right: 0; }
.om-virt-win.om-list-win { display: flex; flex-direction: column; gap: 4px; }
/* The window scrolls on one row pitch, so a row inside it may not change height with its
   content: a row that wrapped would put the scrollbar out of step with the rows it scrolls,
   and the error would accumulate over thousands of them. The metadata line therefore clips
   instead of wrapping. Rows in the other tabs are not windowed and keep their own sizing. */
.om-virt-win .om-side-row { height: 52px; box-sizing: border-box; }
/* flex-wrap keeps the pills on one line, but the text inside them wraps on its own and
   would add a second line for a long version and download count. Both are needed. */
.om-virt-win .om-side-meta { flex-wrap: nowrap; white-space: nowrap; overflow: hidden; }
/* The version and count are the only part allowed to give way; the badges hold their size,
   so a narrow panel truncates the text rather than dropping the licence off the end. */
.om-virt-win .om-meta-text {
  flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.om-virt-win .om-side-meta > .om-lic,
.om-virt-win .om-side-meta > .om-stars { flex: none; }
/* Cards in the window are the same height for the same reason rows are: the description
   occupies its three lines whether or not it fills them, and the metadata line clips rather
   than wrapping. Cards outside the window keep their natural height. */
.om-virt-win .om-card-desc { height: calc(1.45em * 3); }
.om-virt-win .om-card .om-side-meta {
  flex-wrap: nowrap; white-space: nowrap; overflow: hidden; min-width: 0; }
.om-virt-win .om-card-title { min-width: 0; }
/* Table view. One grid template, declared once and used by both the headings and the rows,
   so the two cannot drift apart. The description is the only flexible column; everything
   else is sized to its content, which is what keeps the columns steady while scrolling
   replaces the rows under them. */
.om-table-head, .om-virt-win.om-table-win .om-table-row {
  display: grid; align-items: center; column-gap: 10px;
  grid-template-columns:
    34px               /* #          */
    minmax(150px, 1.1fr) /* Title    */
    68px               /* Version    */
    92px               /* Action     */
    92px               /* Downloads  */
    minmax(120px, 2fr) /* Description*/
    minmax(80px, .7fr) /* Author     */
    104px              /* Licence    */
    56px               /* Stars      */
    82px;              /* Updated    */
}
/* Narrower panels drop columns rather than crush them. Per tier the template must have
   exactly as many columns as the tier leaves visible: a cell without one wraps and breaks
   the pitch the window scrolls on. Minimums, which set the breakpoints in fitColumns:
   wide 878px + 90px of gaps, mid 400px + 30px, tight 196px + 12px. */
.om-table-head.om-t-mid, .om-virt-win.om-table-win.om-t-mid .om-table-row {
  grid-template-columns: 26px minmax(88px, 1.3fr) 54px 84px minmax(72px, 1fr) 76px;
  column-gap: 6px;
}
.om-table-head.om-t-mid > .om-tcell-dl,
.om-table-head.om-t-mid > .om-tcell-auth,
.om-table-head.om-t-mid > .om-tcell-star,
.om-table-head.om-t-mid > .om-tcell-date,
.om-virt-win.om-table-win.om-t-mid .om-tcell-dl,
.om-virt-win.om-table-win.om-t-mid .om-tcell-auth,
.om-virt-win.om-table-win.om-t-mid .om-tcell-star,
.om-virt-win.om-table-win.om-t-mid .om-tcell-date { display: none; }
/* The sidebar tier. The row number goes too: at this width it costs the title a third of
   its room. */
.om-table-head.om-t-tight, .om-virt-win.om-table-win.om-t-tight .om-table-row {
  grid-template-columns: minmax(70px, 1fr) 50px 76px;
  column-gap: 6px;
}
.om-table-head.om-t-tight > .om-tcell-num,
.om-virt-win.om-table-win.om-t-tight .om-tcell-num,
.om-table-head.om-t-tight > .om-tcell-dl,
.om-table-head.om-t-tight > .om-tcell-desc,
.om-table-head.om-t-tight > .om-tcell-auth,
.om-table-head.om-t-tight > .om-tcell-lic,
.om-table-head.om-t-tight > .om-tcell-star,
.om-table-head.om-t-tight > .om-tcell-date,
.om-virt-win.om-table-win.om-t-tight .om-tcell-dl,
.om-virt-win.om-table-win.om-t-tight .om-tcell-desc,
.om-virt-win.om-table-win.om-t-tight .om-tcell-auth,
.om-virt-win.om-table-win.om-t-tight .om-tcell-lic,
.om-virt-win.om-table-win.om-t-tight .om-tcell-star,
.om-virt-win.om-table-win.om-t-tight .om-tcell-date { display: none; }
.om-table-head {
  padding: 6px 8px; box-sizing: border-box; font-size: 11px; font-weight: 600;
  color: var(--om-muted); text-transform: uppercase; letter-spacing: .04em;
  background: var(--om-surface); border: 1px solid var(--om-border);
  border-bottom: none; border-radius: 6px 6px 0 0;
}
/* The headings sit outside the scrolling area, which the rows do not, so the gap the list
   leaves for its scrollbar is matched here or the columns sit off by that much. */
.om-side-list.om-table-list { padding-right: 0; scrollbar-gutter: stable; }
.om-side-list.om-table-list { border: 1px solid var(--om-border); border-top: none;
  border-radius: 0 0 6px 6px; }
.om-virt-win.om-table-win { display: block; }
.om-virt-win.om-table-win .om-table-row {
  height: 34px; box-sizing: border-box; padding: 0 8px;
  border-bottom: 1px solid var(--om-border); font-size: 12px; color: var(--om-text-2);
}
.om-virt-win.om-table-win .om-table-row:hover { background: var(--om-hover); }
/* Every cell is one line. A wrapped cell would make its row taller than the pitch the
   window scrolls on, and the error would accumulate over thousands of rows. */
.om-tcell { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.om-tcell-num { color: var(--om-muted); font-variant-numeric: tabular-nums; }
.om-tcell-title { display: flex; align-items: center; gap: 6px; cursor: pointer; }
.om-tcell-title .om-side-name { overflow: hidden; text-overflow: ellipsis; }
.om-table-icon { width: 18px; height: 18px; flex: none; font-size: 10px; }
.om-tcell-ver, .om-tcell-dl, .om-tcell-star { font-variant-numeric: tabular-nums; }
.om-tcell-desc { color: var(--om-muted); cursor: pointer; }
/* Licence names arrive in several shapes, so the pill is clipped to its column rather than
   allowed to push the columns after it out of line. */
.om-tcell-lic { display: flex; align-items: center; }
.om-tcell-lic > .om-lic { min-width: 0; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; }
.om-tcell-date { color: var(--om-muted); font-variant-numeric: tabular-nums; }
.om-tcell-action { overflow: visible; }
.om-table-ictl { transform: scale(.85); transform-origin: left center; }
/* The heading row carries no icon, so its title cell is plain text like the rest. */
.om-table-head .om-tcell-title { display: block; cursor: default; }
/* The hub. Sized to its contents rather than the viewport: it is a short menu, and the
   panel behind it is the thing that wants the room. */
.om-dialog.om-hub {
  width: min(92vw, 430px); height: auto; max-height: 86vh;
  display: flex; flex-direction: column; padding: 0; overflow: hidden;
}
.om-hub-title {
  padding: 10px 14px; text-align: center; font-weight: 700; letter-spacing: .06em;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  background: var(--om-surface); border-bottom: 1px solid var(--om-border);
}
.om-hub-body { padding: 14px; display: flex; flex-direction: column; gap: 10px;
  overflow-y: auto; }
.om-hub-status { color: var(--om-muted); font-size: 11px; text-align: center; }
.om-hub-grid { display: flex; flex-direction: column; gap: 6px; }
.om-hub-btn {
  padding: 9px 12px; text-align: center; font-size: 13px; cursor: pointer;
  background: var(--om-surface); color: var(--om-text);
  border: 1px solid var(--om-border); border-radius: 6px;
}
.om-hub-btn:hover { background: var(--om-hover); }
/* Restarting is the one entry that throws work away, so it is the one that looks different. */
.om-hub-danger { border-color: #7f1d1d; color: #fca5a5; }
.om-hub-danger:hover { background: #7f1d1d; color: #fff; }
.om-hub-close {
  padding: 10px; font-size: 13px; cursor: pointer; color: var(--om-text);
  background: var(--om-surface); border: none; border-top: 1px solid var(--om-border);
}
.om-hub-close:hover { background: var(--om-hover); }
/* Scrollbars for the scrolling areas.

   From Chrome 121, Firefox, and Safari 18.2 the standard 'scrollbar-width' and
   'scrollbar-color' are honoured and '::-webkit-scrollbar' is ignored outright, so the
   standard pair has to carry the design. 'thin' there is a hairline the thumb colour barely
   shows through, which is why this reads well in older engines and disappears in current
   ones. 'auto' gives the platform's full width, and the thumb follows the theme's muted
   text so it is legible rather than a shade off the background.

   The webkit block below is a fallback for engines that predate the standard properties.
   Where both are understood the standard pair wins, and these are simply not consulted. */
.om-side-list, .om-body, .om-readme-body, .om-versions {
  scrollbar-width: auto;
  scrollbar-color: var(--om-scroll) transparent;
}
.om-side-list::-webkit-scrollbar, .om-body::-webkit-scrollbar,
.om-readme-body::-webkit-scrollbar, .om-versions::-webkit-scrollbar { width: 14px; height: 14px; }
.om-side-list::-webkit-scrollbar-track, .om-body::-webkit-scrollbar-track,
.om-readme-body::-webkit-scrollbar-track, .om-versions::-webkit-scrollbar-track { background: transparent; }
/* The border keeps the thumb clear of the content it sits beside without a track. */
.om-side-list::-webkit-scrollbar-thumb, .om-body::-webkit-scrollbar-thumb,
.om-readme-body::-webkit-scrollbar-thumb, .om-versions::-webkit-scrollbar-thumb {
  background: var(--om-scroll); border-radius: 7px;
  border: 3px solid transparent; background-clip: content-box; }
.om-side-list::-webkit-scrollbar-thumb:hover, .om-body::-webkit-scrollbar-thumb:hover,
.om-readme-body::-webkit-scrollbar-thumb:hover, .om-versions::-webkit-scrollbar-thumb:hover {
  background: var(--om-text-2); background-clip: content-box; }
.om-page { display: flex; flex-direction: column; gap: 4px; }
.om-spacer { flex: none; }
.om-side-row { display: flex; gap: 9px; align-items: center; padding: 7px 8px;
  border: 1px solid var(--om-border); border-radius: 7px; background: var(--om-surface); }
.om-side-row:hover { background: var(--om-hover); }
.om-side-icon { width: 30px; height: 30px; border-radius: 5px; object-fit: cover; flex: none; }
.om-side-initial { display: flex; align-items: center; justify-content: center; font-weight: 700;
  font-size: 13px; color: var(--om-muted); background: var(--om-input);
  border: 1px solid var(--om-border); }
.om-side-text { flex: 1; min-width: 0; cursor: pointer; }
.om-side-name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.om-side-meta { color: var(--om-muted); font-size: 11px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.om-lic { font-size: 10px; font-weight: 600; padding: 0 6px; border: 1px solid var(--om-muted);
  border-radius: 4px; line-height: 15px; }
.om-upd { font-size: 10px; font-weight: 600; padding: 0 6px; margin-left: 6px;
  border: 1px solid #1f6feb; color: #58a6ff; border-radius: 999px; line-height: 15px; }
.om-disabled { font-size: 10px; font-weight: 600; padding: 0 6px; margin-left: 6px;
  border: 1px solid var(--om-border); color: var(--om-muted); border-radius: 999px; line-height: 15px; }
.om-side-ictl { flex: none; }
.om-stars { color: var(--om-muted); font-size: 11px; white-space: nowrap; }
/* Card view. The column count follows the sidebar's width rather than a fixed breakpoint,
   so widening the panel packs more cards per row instead of stretching them. */
.om-card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 8px; align-content: start; }
.om-card { display: flex; flex-direction: column; gap: 7px; min-width: 0; padding: 10px;
  border: 1px solid var(--om-border); border-radius: 9px; background: var(--om-surface); }
.om-card:hover { background: var(--om-hover); }
.om-card-head { display: flex; gap: 9px; align-items: center; min-width: 0; cursor: pointer; }
.om-card-icon { width: 44px; height: 44px; border-radius: 8px; font-size: 18px; }
.om-card-title { flex: 1; min-width: 0; }
.om-card-pub { color: var(--om-muted); font-size: 11px; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap; }
/* Three lines of description, clipped rather than wrapped, so cards stay the same height. */
.om-card-desc { color: var(--om-text-2); font-size: 11px; line-height: 1.45; cursor: pointer;
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; }
/* Pushed to the bottom so the button lines up across cards of unequal text length. */
.om-card-ictl { margin-top: auto; }
.om-card-ictl .om-btn { width: 100%; padding: 6px 12px; font-size: 12px; }
.om-alert { display: flex; gap: 10px; align-items: flex-start; margin-bottom: 10px;
  background: #2b2412; border: 1px solid #9e6a00; border-left-width: 3px; border-radius: 8px;
  padding: 10px 12px; color: var(--om-text); }
.om-alert.om-alert-danger { background: #2b1615; border-color: #b62324; border-left-color: #f85149; }
.om-alert-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.om-alert-names { color: var(--om-text-2); font-size: 12px; overflow-wrap: anywhere; }
.om-alert-x { background: none; border: none; color: var(--om-muted); font-size: 18px; line-height: 1;
  cursor: pointer; padding: 0 2px; flex: none; }
.om-alert-x:hover { color: var(--om-text); }
.om-alert-more { align-self: flex-start; margin-top: 4px; }
.om-held { border: 1px solid var(--om-border); border-radius: 999px; padding: 0 7px;
  color: var(--om-muted); font-size: 11px; }
.om-side-updateall { flex: none; }
.om-dev { margin-top: 14px; display: flex; flex-direction: column; gap: 10px; }
/* The column already spaces its children, so a panel inside it drops its own margin rather
   than adding a second gap to the first. */
.om-dev > .om-panel { margin: 0; }
.om-wf-list { display: flex; flex-direction: column; gap: 6px;
  max-height: 40vh; overflow-y: auto; padding: 2px 2px 2px 0; }
/* Inside a panel the border is drawn for it, so the list sits in from that edge. */
.om-panel-body > .om-wf-list, .om-panel-body > .om-gal { padding: 10px 12px; }
/* A section that has nothing to show still has something to say, and was saying it hard
   against both edges. The same room the contents would have had. */
.om-panel-body > .om-side-status, .om-panel-body > .om-body,
.om-panel-body > .om-dl-note { padding: 12px; line-height: 1.5; }
.om-nodes-bar + .om-side-status { padding: 12px; }
.om-chg { display: flex; flex-direction: column; }
.om-chg-item { padding: 10px 12px; border-bottom: 1px solid var(--om-surface); }
.om-chg-item:last-child { border-bottom: none; }
.om-chg-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 4px; }
.om-chg-here { font-size: 11px; font-weight: 600; color: var(--om-text-2);
  border: 1px solid var(--om-border); border-radius: 999px; padding: 1px 8px; }
/* Publisher text, so it keeps the line breaks they wrote and wraps rather than overflowing. */
.om-chg-text { color: var(--om-text-2); white-space: pre-wrap; overflow-wrap: anywhere; }
/* pip's own words, set apart and set in the font pip wrote them for. */
.om-pip-errors { font-family: ui-monospace, monospace; font-size: 12px; color: #f0883e;
  background: var(--om-input); border-radius: 6px; padding: 8px 10px; margin-top: 4px;
  max-height: 30vh; overflow: auto; }
.om-panel-body > .om-chg-text { padding: 10px 12px; font-family: ui-monospace, monospace;
  font-size: 12px; max-height: 34vh; overflow: auto; }
.om-nodes-bar { display: flex; align-items: center; gap: 8px; padding: 8px 12px;
  border-bottom: 1px solid var(--om-surface); }
.om-nodes-at { flex: none; min-width: 110px; }
.om-nodelist { display: flex; flex-direction: column; max-height: 46vh; overflow-y: auto; }
.om-nodelist-item { padding: 8px 12px; border-bottom: 1px solid var(--om-surface); }
.om-nodelist-item:last-child { border-bottom: none; }
.om-node-name { font-weight: 600; font-family: ui-monospace, monospace; font-size: 12px; }
.om-wf-item { display: flex; align-items: baseline; gap: 10px; text-align: left;
  background: var(--om-surface); border: 1px solid var(--om-border); border-radius: 8px; padding: 8px 12px;
  color: var(--om-text); cursor: pointer; font: inherit; }
.om-wf-item:hover { border-color: #388bfd; background: #1c2230; }
.om-wf-name { font-weight: 600; }
.om-wf-path { color: var(--om-muted); font-size: 11px; }
/* Gallery. Columns are laid to the width available rather than to a fixed count, so the
   grid reflows with the dialog; the thumbnail edge is a setting. */
.om-gal { display: grid; gap: 8px; padding: 2px 0;
  grid-template-columns: repeat(auto-fill, minmax(var(--om-gal-thumb, 120px), 1fr)); }
.om-gal-cell { padding: 0; overflow: hidden; cursor: zoom-in; aspect-ratio: 1 / 1;
  background: var(--om-input); border: 1px solid var(--om-border); border-radius: 8px; }
.om-gal-cell:hover { border-color: #388bfd; }
.om-gal-cell:focus-visible { outline: 2px solid #388bfd; outline-offset: 2px; }
.om-gal-cell.om-gal-dead { display: none; }
.om-gal-img { display: block; width: 100%; height: 100%; object-fit: cover; }
/* Full view, above the pack dialog's own backdrop. */
.om-lb { position: fixed; inset: 0; z-index: 10010; background: rgba(0,0,0,.88);
  display: flex; align-items: center; justify-content: center; }
.om-lb-fig { margin: 0; display: flex; flex-direction: column; align-items: center; gap: 10px; }
.om-lb-img { max-width: 92vw; max-height: 82vh; object-fit: contain; border-radius: 6px; }
/* A clip letterboxes against black rather than showing the backdrop through it. */
video.om-lb-img { background: #000; }
.om-lb-cap { color: var(--om-text-2); font-size: 12px; text-align: center;
  max-width: 92vw; overflow-wrap: anywhere; }
.om-lb-nav { position: absolute; border: none; border-radius: 8px; cursor: pointer;
  background: rgba(0,0,0,.5); color: #fff; font-size: 26px; line-height: 1; padding: 12px 17px; }
.om-lb-nav:hover { background: rgba(0,0,0,.85); }
.om-lb-nav:focus-visible { outline: 2px solid #388bfd; }
.om-lb-prev, .om-lb-next { top: 50%; transform: translateY(-50%); }
.om-lb-prev { left: 16px; }
.om-lb-next { right: 16px; }
.om-lb-close { top: 14px; right: 16px; font-size: 22px; padding: 8px 14px; }
/* On a short or narrow viewport the arrows would sit over the picture, so they shrink and
   the image is given the room back. */
@media (max-width: 720px), (max-height: 560px) {
  .om-lb-img { max-width: 96vw; max-height: 74vh; }
  .om-lb-nav { font-size: 20px; padding: 8px 11px; }
  .om-lb-prev { left: 6px; }
  .om-lb-next { right: 6px; }
}
/* The ref picker sits inline among the header's buttons and chips. */
.om-refbar { display: inline-flex; gap: 6px; align-items: center; position: relative; }
.om-ref-note { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.om-ref-note b { flex: none; }
.om-ref-back { flex: none; margin-left: auto; padding: 4px 12px; font-size: 12px; }
.om-ref-label { color: var(--om-muted); font-size: 12px; }
/* Scoped so it beats the generic .om-side-select sizing defined further down, which would
   otherwise stretch the picker across the dialog. The width is set from the selected text. */
.om-refbar .om-ref-select { flex: none; min-width: 88px; max-width: 280px; }
/* Off-screen twin used only to measure the selected label. */
.om-ref-probe { position: absolute; left: -9999px; top: 0; white-space: pre; visibility: hidden; }
.om-side-controls { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.om-side-select { flex: 1 1 130px; min-width: 120px; padding: 5px 8px; border-radius: 6px;
  background: var(--om-input); color: var(--om-text); border: 1px solid var(--om-border); font-size: 12px; }
.om-side-filter { display: flex; gap: 5px; align-items: center; color: var(--om-muted); font-size: 12px; }

/* Download manager. Sized to its content rather than the panel's full height, so a short
   list is a short window. */
.om-dl-pick { width: min(90vw, 820px); height: auto; max-height: 80vh; }
.om-dl-pick .om-head { padding-right: 44px; }
/* The summary gives way to the controls beside it rather than being cut mid-word: a count
   that ends in "14 unreachab" reads as a rendering fault rather than as a shortened line. */
.om-dl-summary { color: var(--om-muted); font-size: 13px; flex: 1; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.om-dl-tools { display: flex; gap: 8px; flex: none; }
.om-dl-body { overflow-y: auto; padding: 14px 20px; flex: 1; min-height: 0; }
.om-dl-list, .om-dl-models { display: flex; flex-direction: column; gap: 10px; }
.om-dl-row { border: 1px solid var(--om-border); border-radius: 8px; padding: 10px 12px;
  display: flex; flex-direction: column; gap: 6px; background: var(--om-surface); }
.om-dl-top { display: flex; gap: 10px; align-items: baseline; }
.om-dl-name { font-weight: 600; flex: 1; word-break: break-all; }
.om-dl-state { text-transform: uppercase; font-size: 11px; letter-spacing: .04em;
  color: var(--om-muted); flex: none; }
.om-dl-downloading .om-dl-state { color: #58a6ff; }
.om-dl-done .om-dl-state { color: #3fb950; }
.om-dl-failed .om-dl-state { color: #f85149; }
.om-dl-paused .om-dl-state, .om-dl-cancelled .om-dl-state { color: #d29922; }
.om-dl-where { display: flex; gap: 8px; flex-wrap: wrap; color: var(--om-muted); font-size: 12px; }
/* A path can be longer than the panel is wide, and a pill that cannot shrink drags the whole
   row past the edge. The full path is on the title, so shortening the chip loses nothing. */
.om-dl-owner, .om-dl-src { border: 1px solid var(--om-border); border-radius: 999px;
  padding: 0 7px; max-width: 100%; min-width: 0; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap; }
.om-dl-bar { height: 4px; border-radius: 2px; background: var(--om-input); overflow: hidden; }
.om-dl-fill { height: 100%; background: #58a6ff; transition: width .3s linear; }
.om-dl-done .om-dl-fill { background: #3fb950; }
.om-dl-failed .om-dl-fill { background: #f85149; }
.om-dl-foot { display: flex; gap: 10px; align-items: center; }
.om-dl-size { color: var(--om-muted); font-size: 12px; flex: 1; }
.om-dl-acts { display: flex; gap: 6px; flex: none; }
.om-dl-btn { padding: 4px 10px; font-size: 12px; }
/* Add by URL: a stacked form rather than a row, so a long URL is readable as it is pasted. */
.om-dl-add { width: min(92vw, 560px); }
.om-dl-field { display: flex; flex-direction: column; gap: 4px; }
.om-dl-field > span { color: var(--om-muted); font-size: 11px; text-transform: uppercase;
  letter-spacing: .04em; }
.om-dl-note { color: var(--om-muted); font-size: 13px; }
.om-dl-ok { color: #3fb950; }
.om-dl-bad { color: #f85149; }
/* A model already on disk is dimmed but still selectable, because a file that is there can
   still be the wrong one. Refused ones cannot be picked at all. */
.om-dl-model { display: flex; gap: 10px; align-items: flex-start; cursor: pointer;
  border: 1px solid var(--om-border); border-radius: 8px; padding: 10px 12px;
  background: var(--om-surface); }
.om-dl-model:hover { border-color: var(--om-muted); }
/* The toolbar over a selectable list: what is selected on the left, what to do on the right. */
.om-lib-actions { display: flex; align-items: center; gap: 8px; padding: 2px 0 6px; }
.om-dl-have { opacity: .55; }
.om-dl-have:hover { opacity: .85; }
.om-dl-refused { opacity: .5; cursor: not-allowed; }
.om-dl-check { margin-top: 3px; flex: none; }
.om-dl-modeltext { display: flex; flex-direction: column; gap: 4px; min-width: 0; flex: 1; }
.om-dl-pickfoot { display: flex; gap: 12px; align-items: center; padding: 12px 20px;
  border-top: 1px solid var(--om-border); }
.om-dl-wf { flex: none; max-width: 320px; }
/* The way in, at the right-hand end of the workflow tab strip. Sized to sit in that row
   rather than to stand out from it. */
.om-dl-open { display: inline-flex; align-items: center; gap: 5px; margin: 0 6px;
  padding: 3px 9px; border-radius: 6px; border: 1px solid var(--om-border);
  background: transparent; color: var(--om-text-2); cursor: pointer; white-space: nowrap;
  font: 12px/1.4 system-ui, sans-serif; }
.om-dl-open:hover { background: var(--om-hover); color: var(--om-text); }
.om-dl-open-icon { font-size: 13px; line-height: 1; }
/* The label goes before the button does, so a crowded tab strip keeps the icon. */
@media (max-width: 1100px) { .om-dl-open-text { display: none; } }
/* In the control bar there is no room for words, so the icon carries it and the name is on
   the hover. Square rather than oblong, so the three read as a set of controls. */
.om-dl-open-icons { margin: 0 2px; padding: 3px; width: 26px; height: 24px;
  justify-content: center; }
.om-dl-open-icons .om-dl-open-text { display: none; }
.om-dl-open-icons .om-dl-open-icon { font-size: 14px; }
/* .om-side-select carries flex:1 for the sidebar's rows; in a stacked field that
   would stretch it down the column instead of across. */
.om-dl-field > select, .om-dl-field > input { flex: none; }
.om-dl-place { display: flex; gap: 6px; align-items: center; margin-top: 2px; }
.om-dl-place > span { color: var(--om-muted); font-size: 11px; flex: none; }
.om-dl-root { font-size: 11px; padding: 3px 6px; max-width: 340px; }
.om-dl-root option:disabled { color: var(--om-muted); }
/* A button label that carries an account name is never broken across lines; where they do
   not fit side by side the row wraps and each button stays whole. */
.om-note-wide { width: min(94vw, 640px); }
.om-cmd { flex: 1; min-width: 0; background: var(--om-input); color: var(--om-text);
  border: 1px solid var(--om-border); border-radius: 6px; padding: 7px 10px;
  font: 12px/1.5 ui-monospace, monospace; white-space: pre-wrap; overflow-wrap: anywhere;
  user-select: all; }
.om-note-foot { flex-wrap: wrap; }
.om-note-foot .om-btn { white-space: nowrap; }
/* Labelled values, label column sized to its longest label. */
.om-facts { display: grid; grid-template-columns: max-content minmax(0, 1fr);
  gap: 5px 16px; margin: 0; font-size: 12px; }
.om-facts dt { color: var(--om-muted); }
.om-facts dd { margin: 0; color: var(--om-text); overflow-wrap: anywhere; }
/* Two bars: what is being asked of the downloads, then which answer is showing. */
.om-dl-views { display: flex; gap: 4px; padding: 10px 20px 0; }
.om-dl-view { background: none; border: none; cursor: pointer; padding: 6px 12px;
  border-radius: 6px 6px 0 0; color: var(--om-muted); font: 600 13px/1.4 system-ui, sans-serif; }
.om-dl-view:hover { color: var(--om-text); background: var(--om-hover); }
.om-dl-view.om-dl-on { color: var(--om-text); background: var(--om-surface); }
/* Six tabs do not fit a narrow panel, and a tab cannot be shortened without losing what it
   says. So the strip scrolls on its own rather than widening the panel's contents and
   putting a horizontal scrollbar under everything else. */
.om-dl-tabs { display: flex; gap: 4px; padding: 0 20px; background: var(--om-surface);
  border-bottom: 1px solid var(--om-border);
  overflow-x: auto; scrollbar-width: thin; flex: none; }
.om-dl-tab { display: inline-flex; gap: 7px; align-items: center; background: none;
  border: none; border-bottom: 2px solid transparent; cursor: pointer; padding: 8px 10px;
  color: var(--om-muted); font: 13px/1.4 system-ui, sans-serif;
  flex: none; white-space: nowrap; }
.om-dl-tab:hover { color: var(--om-text); }
.om-dl-tab.om-dl-on { color: var(--om-text); border-bottom-color: #58a6ff; }
.om-dl-tab-count { border: 1px solid var(--om-border); border-radius: 999px; padding: 0 7px;
  font-size: 12px; }
/* An archived entry is a record rather than a file, so it reads quieter than a present one. */
.om-dl-row.om-dl-gone { opacity: .62; }
.om-dl-row.om-dl-gone:hover { opacity: 1; }
.om-dl-hash { display: flex; gap: 8px; align-items: baseline; }
.om-dl-hash-label { color: var(--om-muted); font-size: 11px; letter-spacing: .04em; flex: none; }
.om-dl-hash-value { color: var(--om-muted); font: 12px/1.4 ui-monospace, monospace;
  cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.om-dl-hash-value:hover { color: var(--om-text); }
/* A window rather than a dialog: it does not cover the canvas and does not take the pointer
   away from it. Sized by the caller, moved and folded by the reader. */
/* A remembered size belongs to the window it was chosen in. Opened on a narrower screen --
   a laptop after a desktop, a tablet, a browser window dragged small -- it is capped to what
   is actually there, so the right-hand controls never sit off the edge. */
/* A window that is not in front recedes: its chrome lightens towards the background and its
   contents lose a little contrast. Only ever a difference in degree, because an inactive
   window is still there to be read. */
.om-float:not(.om-float-active) .om-float-bar { background: var(--om-hover);
  color: var(--om-muted); }
.om-float:not(.om-float-active) .om-float-body { opacity: .82; }
.om-float:not(.om-float-active) { border-color: color-mix(in srgb, var(--om-border) 60%, transparent); }
/* Off by default: blurring text costs a repaint on every stacking change, and on a weak GPU
   with several windows open that is felt. */
.om-blur-inactive .om-float:not(.om-float-active) .om-float-body { filter: blur(1.5px); }
.om-float { position: fixed; display: flex; flex-direction: column;
  max-width: calc(100vw - 16px);
  background: var(--om-bg); color: var(--om-text); border: 1px solid var(--om-border);
  border-radius: 10px; box-shadow: var(--om-shadow, 0 10px 40px rgba(0,0,0,.5));
  overflow: hidden;
  font: var(--om-text-size, 14px)/1.5 system-ui, sans-serif; }
.om-float-bar { display: flex; align-items: center; gap: 8px; padding: 0 10px;
  min-height: var(--om-hdr, 44px);
  border-bottom: 1px solid var(--om-border); background: var(--om-surface);
  cursor: move; user-select: none; flex: none;
  /* Pointer events only reach a drag on touch if the browser is told not to treat the
     gesture as a scroll first. Without this a panel cannot be moved on a tablet. */
  touch-action: none; }
.om-float-folded .om-float-bar { border-bottom: none; }
/* Folded to its bar, a panel is a label rather than a control. Its own tools go: Rescan,
   Verify fully and the filter act on a list nobody can see, and a button that acts on
   something out of sight is a button pressed by accident. What stays is what can be read at
   a glance -- the title, the summary, the activity light -- and the two controls that act on
   the window itself rather than on its contents. */
.om-float-folded .om-float-tools { display: none; }
/* Still shortens before the close button does, because a summary can be long. */
.om-float-title { font-size: var(--om-title-size, 15px); font-weight: 600;
  flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; }
.om-float-badge { color: var(--om-muted); font-size: 13px; flex: 1; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* On a narrow window the tools are the one part that cannot shrink -- a button is as wide
   as its word. So the strip scrolls rather than shouldering the close button off the end,
   and every control stays reachable at any width. */
/* A row of its own under the title. Fixed height whatever the header is set to, because a
   button does not get easier to press by being taller, and scrolls sideways on a narrow
   panel rather than pushing anything off the end. */
.om-float-tools { display: flex; align-items: center; gap: 8px; flex: none;
  min-height: 38px; height: 38px; padding: 0 10px;
  border-bottom: 1px solid var(--om-border); background: var(--om-surface);
  overflow-x: auto; overflow-y: hidden; scrollbar-width: thin; }
.om-float-tools:empty { display: none; }
.om-float-tools > * { flex: none; }
/* Both controls get the same hit area, so the fold is as easy to land on as the close. */
.om-float-fold, .om-float-close { background: none; border: none; color: var(--om-muted);
  cursor: pointer; line-height: 1; flex: none; display: inline-flex;
  align-items: center; justify-content: center; width: 24px; height: 24px;
  border-radius: 5px; padding: 0; }
.om-float-fold { font-size: 16px; }
.om-float-close { font-size: 20px; }
.om-float-fold:hover, .om-float-close:hover { background: var(--om-hover); }
.om-float-fold:hover, .om-float-close:hover { color: var(--om-text); }
/* The height set here is the height that renders. Growing this instead would zero its
   flex-basis, throwing that height away and sizing the window to whatever it happens to hold. */
.om-float-body { display: flex; flex-direction: column; overflow: hidden;
  flex: 0 0 auto; min-height: 0;
  max-height: calc(100vh - var(--om-hdr, 44px) - 24px); }
.om-float-folded .om-float-body { display: none; }
/* A panel that does not float: the bar is a title rather than a handle. */
.om-float-fixed .om-float-bar { cursor: default; }
.om-float-grip { position: absolute; right: 0; bottom: 0; width: 16px; height: 16px;
  cursor: nwse-resize; touch-action: none; }
.om-float-grip::after { content: ""; position: absolute; right: 3px; bottom: 3px;
  width: 7px; height: 7px; border-right: 2px solid var(--om-muted);
  border-bottom: 2px solid var(--om-muted); opacity: .6; }
.om-float-folded .om-float-grip { display: none; }
.om-lib-row { border: 1px solid var(--om-border); border-radius: 8px; padding: 9px 12px;
  display: flex; flex-direction: column; gap: 5px; background: var(--om-surface); }
.om-lib-size { color: var(--om-muted); font-size: 12px; flex: none; }
.om-lib-lead { color: var(--om-muted); font-size: 13px; padding: 2px 2px 8px; }
.om-lib-group { border: 1px solid var(--om-border); border-radius: 8px; padding: 10px;
  display: flex; flex-direction: column; gap: 8px; background: var(--om-input); }
.om-lib-group-head { display: flex; gap: 10px; align-items: baseline; }
.om-lib-group-head .om-dl-name { flex: 1; }
.om-lib-group .om-lib-row { background: var(--om-surface); }
.om-lib-filter { flex: none; width: 200px; padding: 4px 8px; font-size: 12px; }
.om-cost { border: 1px solid var(--om-border); border-radius: 999px; padding: 0 6px;
  color: var(--om-muted); font-size: 10px; margin-left: 6px; white-space: nowrap; }
/* A pack taking a fifth of the whole start-up is worth noticing without reading the numbers. */
.om-cost-high { color: #d29922; border-color: #d29922; }
.om-cost-failed { background: #a5261d; }
.om-cost-line { color: var(--om-muted); }
/* Figures from a run that is not this one are marked rather than quietly presented. */
.om-cost-stale { color: #d29922; }
/* Sized to sit in the tab strip beside the buttons, not to draw the eye away from the canvas. */
.om-mon { display: inline-flex; align-items: center; gap: 10px; margin: 0 8px;
  font: 10px/1.2 system-ui, sans-serif; color: var(--om-muted); white-space: nowrap; }
.om-mon-cell { display: inline-flex; align-items: center; gap: 4px; }
.om-mon-label { letter-spacing: .04em; }
/* The track a figure fills, one shape per axis. */
.om-mon-bar { display: inline-block; width: 34px; height: 4px; border-radius: 2px;
  background: var(--om-input); overflow: hidden; position: relative; }
.om-mon-tube { display: inline-block; width: 5px; height: 14px; border-radius: 2px;
  background: var(--om-input); overflow: hidden; position: relative; }
/* What fills it. The colour says what is being measured -- blue for a share of a total, and
   a temperature paints its own from the scale -- while the axis says which way it grows. So
   a meter drawn as a column is still blue, rather than inheriting a thermometer's green. */
.om-mon-fill { display: block; background: #58a6ff;
  transition: width .4s linear, height .4s linear, background .4s linear; }
.om-mon-h .om-mon-fill { height: 100%; width: 0; }
.om-mon-v .om-mon-fill { position: absolute; left: 0; right: 0; bottom: 0; height: 0; }
.om-mon-hot { background: #f85149; }
.om-mon-value { min-width: 28px; text-align: right; font-variant-numeric: tabular-nums; }
.om-mon-dynamic { display: inline-flex; align-items: center; gap: 10px; }
.om-mon-degrees { min-width: 24px; }
/* The run bar. Where rgthree and Crystools put theirs, so it is a replacement rather than a
   second one, and hidden entirely when nothing is running. */
.om-prog { height: 14px; display: none; pointer-events: none; overflow: hidden;
  box-shadow: inset 0 -1px 0 rgba(0,0,0,.35), 0 1px 0 rgba(255,255,255,.06); }
/* In the layout, above the header, sharing the strip the other packs use. */
.om-prog-flow { position: relative; width: 100%; }
/* Pinned, for a layout with no such strip to join. */
.om-prog-pinned { position: fixed; top: 0; left: 0; right: 0; z-index: 10001; }
.om-prog-on { display: block; }
.om-prog-track { position: absolute; inset: 0; background: #16161d; overflow: hidden; }
/* Every colour here comes from the palette in use, set on the element as it paints. The
   fallbacks are the pack's own, for a palette that has only grey to offer. */
.om-prog { --om-prog-from: #4f688a; --om-prog-to: #84bbe7; --om-prog-cap: #d7ecff;
  --om-prog-glow: rgba(132,187,231,.85); --om-prog-halo: rgba(132,187,231,.45);
  --om-prog-sub: #6b5312; }
/* The node's own progress, in the node's own colour: a quieter fill in the space that node
   will occupy. No glow, so it never competes with the graph's progress for attention. */
.om-prog-sub { position: absolute; top: 0; bottom: 0; width: 0;
  background: var(--om-prog-sub);
  transition: width .15s linear, left .3s ease, background .3s ease; }
/* The graph's progress. Painted after the node's, so a finished node's block is taken over
   rather than left beside it. */
.om-prog-main { position: absolute; top: 0; bottom: 0; left: 0; width: 0;
  background: linear-gradient(90deg, var(--om-prog-from) 0%, var(--om-prog-to) 100%);
  transition: width .3s ease; }
/* The leading edge, which is the part worth looking at. */
.om-prog-main::after { content: ""; position: absolute; top: 0; bottom: 0; right: 0;
  width: 2px; background: var(--om-prog-cap);
  box-shadow: 0 0 6px 2px var(--om-prog-glow), 0 0 14px 4px var(--om-prog-halo); }
.om-prog-error .om-prog-main { background: linear-gradient(90deg, #8d2a24 0%, #f85149 100%); }
.om-prog-error .om-prog-main::after { background: #ffb4b0;
  box-shadow: 0 0 6px 2px rgba(248,81,73,.85); }
.om-prog-text { position: absolute; inset: 0; display: flex; align-items: center;
  padding: 0 8px; color: #fff; font: 600 9px/1 system-ui, sans-serif; letter-spacing: .02em;
  text-shadow: 0 0 3px rgba(0,0,0,.95), 0 1px 2px rgba(0,0,0,.9); white-space: nowrap;
  overflow: hidden; }
@media (prefers-reduced-motion: reduce) {
  .om-prog-sub, .om-prog-main { transition: none; }
}
/* The light in a panel header. A colour alone is something to worry about, so the reasoning
   is on the hover; this is only the colour, and the glow that makes it readable at a glance
   against a dark bar. */
.om-orb { width: 10px; height: 10px; border-radius: 50%; flex: none; margin-right: 2px;
  background: var(--om-muted); cursor: help; }
.om-orb-idle { background: #6e7681; box-shadow: 0 0 4px 1px rgba(110,118,129,.45); }
.om-orb-working { background: #3fb950; box-shadow: 0 0 8px 2px rgba(63,185,80,.55);
  animation: om-orb-breathe 2.4s ease-in-out infinite; }
.om-orb-stalling { background: #d29922; box-shadow: 0 0 8px 2px rgba(210,153,34,.55); }
/* Confirmed rather than suspected, so it asks to be looked at rather than sitting there. */
.om-orb-stalled { background: #d29922; box-shadow: 0 0 10px 3px rgba(210,153,34,.7);
  animation: om-orb-throb 1s ease-in-out infinite; }
.om-orb-oom { background: #f85149; box-shadow: 0 0 10px 3px rgba(248,81,73,.65); }
@keyframes om-orb-breathe { 0%, 100% { opacity: 1; } 50% { opacity: .55; } }
@keyframes om-orb-throb { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.35); } }
/* Anyone who has asked for less movement gets the colour and none of the animation. */
@media (prefers-reduced-motion: reduce) {
  .om-orb-working, .om-orb-stalled { animation: none; }
}
.om-mem-drop { padding: 2px 8px; font-size: 11px; flex: none; }
.om-keys { display: flex; flex-direction: column; gap: 12px; margin: 12px 0; }
.om-keys-row { border: 1px solid var(--om-border); border-radius: 8px; padding: 10px 12px;
  background: var(--om-surface); display: flex; flex-direction: column; gap: 6px; }
.om-keys-line { display: flex; gap: 8px; align-items: center; }
.om-keys-input { flex: 1; min-width: 0; font-family: ui-monospace, monospace; }
/* Six styles, two shapes: which one a cell gets is all that changes between them. */
.om-mon-v { align-items: center; }
/* Compact: the label and the figure sit together over a bar or under a column, so a cell is
   two elements deep instead of three wide. */
.om-mon-both { display: inline-flex; gap: 4px; align-items: baseline; }
.om-mon-compact { position: relative; }
.om-mon-compact .om-mon-value { min-width: 0; }
.om-mon-compact.om-mon-h { display: inline-grid; }
.om-mon-compact.om-mon-h > * { grid-area: 1 / 1; align-self: center; }
.om-mon-compact.om-mon-h .om-mon-bar { width: 62px; height: 13px; border-radius: 3px; }
/* The track is positioned, so it paints above anything that is not, however late the text
   comes in the markup. Positioning the text too is what puts it back on top.
   The text crosses both the empty track and the fill behind it, and the fill can be blue,
   green or red, so it is set white and given a dark outline rather than tinted to suit any
   one of them. */
.om-mon-compact.om-mon-h .om-mon-both { justify-self: center; padding: 0 4px;
  position: relative; z-index: 1; color: #fff; font-weight: 600;
  text-shadow: 0 0 3px rgba(0,0,0,.95), 0 1px 2px rgba(0,0,0,.9); }
.om-mon-compact.om-mon-v { flex-direction: column; gap: 2px; }
.om-mon-compact.om-mon-v .om-mon-tube { height: 16px; }
@media (max-width: 1500px) { .om-mon-label { display: none; } }
@media (max-width: 1200px) { .om-mon { display: none; } }
.om-mon { cursor: pointer; border-radius: 6px; padding: 2px 4px; }
.om-mon:hover { background: var(--om-hover); }
/* No padding on the body: the graphs run the full width of the window and the bars are what
   divide them, so nothing needs an inset or a frame. */
/* The graphs share whatever height the window has, so making the panel taller makes them
   taller rather than leaving them a fixed strip with space below. Only the model list scrolls. */
.om-mem-body { display: flex; flex-direction: column; padding: 0; gap: 0;
  flex: 1; min-height: 0; overflow-y: auto; }
/* No minimum height is set here on purpose. Naming one overrides the automatic minimum, which
   is the block's own content, and a figure smaller than the bar and the caption together lets
   the box shrink under them and clip the caption. Letting it be automatic means only the
   graph gives way, and the panel scrolls once even that has nothing left to give. */
.om-mem-graph { display: flex; flex-direction: column; flex: 1 1 auto;
  max-height: calc(var(--om-hdr, 44px) + 170px); }
/* The section bars are the panel's structure, so they are sized to be read at a glance from
   wherever the screen happens to be, and they follow the same setting the title bar does. */
.om-mem-bar { display: flex; align-items: center; gap: 10px; padding: 0 14px;
  min-height: var(--om-hdr, 44px);
  background: var(--om-surface); border-top: 1px solid var(--om-border);
  border-bottom: 1px solid var(--om-border); flex: none; }
.om-mem-body > :first-child .om-mem-bar, .om-mem-body > .om-mem-bar:first-child {
  border-top: none; }
.om-mem-bar-toggle { cursor: pointer; user-select: none; }
.om-mem-bar-toggle:hover { background: var(--om-hover); }
.om-mem-bar-fold { font-size: calc(var(--om-hdr, 44px) * 0.24); color: var(--om-muted);
  flex: none; width: calc(var(--om-hdr, 44px) * 0.3); }
/* Folded, a graph is just its bar, and the height it was using goes to the others. */
.om-mem-folded { flex: none; min-height: 0; }
.om-mem-folded .om-mem-canvas, .om-mem-folded .om-mem-graph-detail { display: none; }
.om-mem-bar-label { font-size: calc(var(--om-hdr, 44px) * 0.29); font-weight: 600;
  text-transform: uppercase; letter-spacing: .05em; color: var(--om-muted); flex: 1; }
.om-mem-bar-value { font-size: calc(var(--om-hdr, 44px) * 0.36); font-weight: 600;
  font-variant-numeric: tabular-nums; color: var(--om-text); }
/* The graph is the only part that gives way when the window is short.
   The basis is nought rather than automatic: drawing sets the canvas height attribute, which
   is also its intrinsic size, so an automatic basis would feed each drawing back into the
   layout and the graph would grow without end. */
/* Capped as well as floored. A graph is read by its shape, which a taller box does not
   improve, so past this the room goes to the list of models instead of to more empty chart. */
.om-mem-canvas { width: 100%; flex: 1 1 0; min-height: 34px; max-height: 140px;
  display: block; background: var(--om-input); }
.om-mem-graph-detail { color: var(--om-muted); font-size: 12px; padding: 0 14px;
  flex: none; height: 30px; min-height: 30px; max-height: 30px; box-sizing: border-box;
  display: flex; align-items: center;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.om-mem-graph-detail:empty { height: 0; min-height: 0; }
.om-mem-graph-detail:empty { padding: 0; }
.om-mem-models { padding: 10px 14px; flex: 2 1 auto; min-height: 90px; overflow-y: auto; }
.om-mem-model { border: 1px solid var(--om-border); border-radius: 8px; padding: 9px 11px;
  display: flex; flex-direction: column; gap: 6px; background: var(--om-surface); }
/* Nothing held is an ordinary state, not a problem, so it is said quietly and centred. */
.om-mem-empty { text-align: center; color: var(--om-muted); opacity: .55;
  padding: 26px 14px; font-size: 14px; }
/* How much of a model is on the device, against how much of it there is. */
.om-mem-split { height: 5px; border-radius: 3px; background: var(--om-input); overflow: hidden; }
.om-mem-resident { height: 100%; background: #a371f7; }
.om-mem-stream { border-color: #58a6ff; color: #58a6ff; }
.om-mem-map-slot:empty { display: none; }
.om-mem-map { display: flex; flex-direction: column; gap: 5px; margin-top: 2px; }
/* One square per stretch of the model, sized so the columns divide the width exactly. The
   frame holds the border and padding; the canvas holds neither, so what it measures is what
   it draws into. */
.om-mem-grid-frame { background: var(--om-input); border: 1px solid var(--om-border);
  border-radius: 5px; padding: 4px; }
.om-mem-grid { display: block; width: 100%; }
.om-mem-key { display: flex; flex-wrap: wrap; gap: 10px; color: var(--om-muted);
  font-size: 11px; align-items: center; }
.om-mem-key-item { display: inline-flex; align-items: center; gap: 5px; }
.om-mem-swatch { width: 8px; height: 8px; border-radius: 2px; flex: none; }
.om-mem-key-note { margin-left: auto; }
/* In the control bar the strip is one of several groups on a crowded row, so it gives up its
   outer margin and leans on the row's own spacing. */
.actionbar-container .om-mon { margin: 0 2px; }
.om-lib-sweep { border-color: #d29922; }
.om-mem-bar-label + .om-lib-row { margin-top: 2px; }
`;
document.head.appendChild(sidebarStyle);

// --- floating panels ------------------------------------------------------------------------


//: Room a panel needs around it before dragging it means anything. A window almost as wide
//: as the screen has nowhere to go, and letting it be dragged there is only a way to lose
//: the controls off an edge. With less than this to spare, a panel is presented centred and
//: fixed however the setting is set -- and goes back to floating the moment there is room.
const FLOAT_SLACK_X = 120;
const FLOAT_SLACK_Y = 80;

//: Open panels, by key. One panel per key, so a second call raises rather than duplicates.
const floatPanels = new Map();

let floatTop = FLOAT_Z;

//: Height of a panel's header bars. Read from the settings rather than fixed, because how
//: large a bar has to be to read comfortably depends on the screen it is on.
const HEADER_DEFAULT = 44;

function headerHeight() {
  const asked = Number(panelSetting("openManager.panelHeaders", HEADER_DEFAULT));
  return Number.isFinite(asked) ? Math.max(24, Math.min(80, Math.round(asked))) : HEADER_DEFAULT;
}

// Applied to every open panel, so changing the setting is visible at once rather than on the
// next time a panel happens to be opened.
function applyHeaderHeight() {
  const height = `${headerHeight()}px`;
  for (const panel of document.querySelectorAll(".om-float")) {
    panel.style.setProperty("--om-hdr", height);
  }
}

function floatRecall(key, fallback) {
  try {
    const saved = JSON.parse(localStorage.getItem(`om-float-${key}`) || "null");
    return saved && typeof saved === "object" ? saved : fallback;
  } catch {
    return fallback;
  }
}

function floatRemember(key, state) {
  try { localStorage.setItem(`om-float-${key}`, JSON.stringify(state)); } catch { /* private */ }
}

// A window the reader can move, size and fold away, that does not block the canvas underneath.
//
// Returns a handle rather than an element: the caller fills `body` and leaves placement,
// persistence and stacking to this.
// Say which window is in front.
//
// With several open, the one being typed into is not otherwise distinguishable from the three
// behind it: they are the same colour, at the same size, and only the stacking order says
// anything. This is the only signal that the keyboard is going somewhere in particular.
function markActive(panel) {
  for (const other of document.querySelectorAll(".om-float")) {
    other.classList.toggle("om-float-active", other === panel);
  }
}

function createFloatingPanel({ key, title, width = 820, height = 520, onClose,
                               centred = false, modal = false } = {}) {
  const open = floatingPanel(key);
  if (open) { open.present(); return open; }

  const saved = floatRecall(key, {});
  // What the screen can actually take. A size remembered from a larger window is brought
  // back into range rather than restored as a panel that hangs off the edge.
  const fits = (asked, floor, room) => Math.max(floor, Math.min(asked, room));
  // Presentation only. A panel that does not float still opens, folds, resizes to the size
  // it is given and closes the same way; it simply always appears in the middle and cannot
  // be dragged off somewhere and lost.
  // A modal never floats whatever the dragging setting says: it is centred over a backdrop,
  // which is the whole of what makes it a modal rather than a window.
  const wantsFloat = !modal && panelSetting("openManager.floatingPanels", true) !== false;
  const panel = el("div", "om-float");
  // Asked for every time rather than settled at open, so a window resized down to a laptop
  // or a tablet stops being draggable there and then, and a window opened up again goes
  // back to floating without being closed and reopened.
  const floating = () => wantsFloat
    && window.innerWidth - panel.offsetWidth >= FLOAT_SLACK_X
    && window.innerHeight - panel.offsetHeight >= FLOAT_SLACK_Y;
  //: Where the panel was floating before the window got too small for it. Centring
  //: overwrites the position, so without this a shrink and a grow leaves the panel wherever
  //: being centred put it rather than where the reader had it.
  let parked = null;
  const applyMode = () => {
    const now = floating();
    if (!now && !panel.classList.contains("om-float-fixed") && panel.style.left) {
      parked = { left: parseInt(panel.style.left, 10) || 0,
                 top: parseInt(panel.style.top, 10) || 0 };
    }
    panel.classList.toggle("om-float-fixed", !now);
  };
  // A remembered size is the reader's decision and is used as it stands. The figure passed in
  // has already been sized to the viewport and scaled by the setting, so nothing is applied to
  // it a second time here.
  panel.style.width = `${fits(saved.width || width, 280, window.innerWidth - 16)}px`;
  panel.style.setProperty("--om-hdr", `${headerHeight()}px`);

  const bar = el("div", "om-float-bar");
  const fold = el("button", "om-float-fold", "▾");
  fold.title = "Collapse";
  bar.appendChild(fold);
  const heading = el("div", "om-float-title", title);
  bar.appendChild(heading);
  const badge = el("div", "om-float-badge");
  bar.appendChild(badge);
  const close = el("button", "om-float-close", "×");
  close.title = "Close";
  bar.appendChild(close);
  panel.appendChild(bar);

  // The controls sit under the title rather than in it. A title bar carrying a filter box,
  // three buttons and a summary has no room left to be a title, and the row scales with the
  // header height setting, which is a size chosen for reading a title rather than for
  // pressing a button. This row is a fixed height for that reason.
  const tools = el("div", "om-float-tools");
  panel.appendChild(tools);

  const body = el("div", "om-float-body");
  body.style.height =
    `${fits(saved.height || height, 80, window.innerHeight - headerHeight() - 24)}px`;
  panel.appendChild(body);

  const grip = el("div", "om-float-grip");
  grip.title = "Resize";
  panel.appendChild(grip);

  // A modal is the same panel inside a backdrop, so everything below -- folding, resizing,
  // the remembered size, the header -- works identically and only the framing differs.
  const backdrop = modal ? el("div", "om-backdrop om-backdrop-panel") : null;
  if (backdrop) {
    backdrop.appendChild(panel);
    document.body.appendChild(backdrop);
  } else {
    document.body.appendChild(panel);
  }

  // Placement, clamped into the viewport. A position saved on a monitor that is no longer
  // attached would otherwise restore a panel nobody can reach.
  //
  // Mid-drag the rule is loose: a corner stays reachable and the rest may hang off, because
  // parking a panel at the edge is a thing people do on purpose.
  const place = (left, top) => {
    const rect = panel.getBoundingClientRect();
    const x = Math.min(Math.max(left, 8 - rect.width + 120), window.innerWidth - 120);
    const y = Math.min(Math.max(top, 0), window.innerHeight - 36);
    panel.style.left = `${Math.round(x)}px`;
    panel.style.top = `${Math.round(y)}px`;
  };

  // Opening, and recovering from a window resize, are not a drag: nobody chose this
  // position now. So where the panel fits, all of it goes on screen -- a position remembered
  // from a wide monitor otherwise reopens on a laptop or a tablet with the close button past
  // the right-hand edge. Where the panel is larger than the window, the loose rule is all
  // that is available, and at least it can be dragged.
  const settle = (left, top) => {
    const rect = panel.getBoundingClientRect();
    if (rect.width + 16 <= window.innerWidth) {
      left = Math.min(Math.max(left, 8), window.innerWidth - rect.width - 8);
    }
    if (rect.height + 16 <= window.innerHeight) {
      top = Math.min(Math.max(top, 8), window.innerHeight - rect.height - 8);
    }
    place(left, top);
  };
  // Truly centred, with only the margin the border needs as a floor. A larger floor wins
  // over the centring on a window barely wider than the panel, which is exactly the case
  // this is for, and leaves it sitting against one edge.
  const centre = () => place(
    Math.max(8, (window.innerWidth - panel.offsetWidth) / 2),
    Math.max(8, (window.innerHeight - panel.offsetHeight) / 2),
  );
  applyMode();
  if (floating()) {
    // A panel the reader has placed goes back where they put it. One they have not is placed
    // by its own default: the utility windows sit high, where they overlap least of the
    // graph, while a full page opens in the middle because it is the thing being read.
    settle(
      saved.left ?? Math.max(16, (window.innerWidth - panel.offsetWidth) / 2),
      saved.top ?? (centred
        ? Math.max(16, (window.innerHeight - panel.offsetHeight) / 2)
        : Math.max(56, window.innerHeight * 0.18)),
    );
  } else {
    centre();
  }

  // Size and position, and deliberately not whether it was folded. Collapsing is an
  // arrangement of the desk rather than a preference, and restoring it meant clicking a pack
  // and getting a window already collapsed, which reads as the click having failed.
  const state = () => ({
    left: parseInt(panel.style.left, 10) || 0,
    top: parseInt(panel.style.top, 10) || 0,
    width: panel.offsetWidth,
    height: parseInt(body.style.height, 10) || height,
  });
  const remember = () => {
    const now = state();
    // Written by an older build, read by nothing now.
    const { folded: _gone, ...previous } = floatRecall(key, {});
    // A centred panel has no position of its own to keep. Writing one away would move the
    // panel the moment there was room to float again, or the setting was turned back on --
    // to a place the reader never chose, on a screen they may not be using any more.
    if (!floating()) { delete now.left; delete now.top; }
    floatRemember(key, { ...previous, ...now });
  };

  const raise = () => {
    // Marked before the early return: a panel can already be on top and still not be the one
    // wearing the class, which is what happens when another window is destroyed.
    markActive(panel);
    if (Number(panel.style.zIndex) === floatTop && floatTop > FLOAT_Z) return;
    floatTop = floatTop >= FLOAT_Z_TOP ? FLOAT_Z : floatTop + 1;
    panel.style.zIndex = String(floatTop);
  };
  // Clicking anywhere in a window brings it forward, which is what makes it the active one.
  panel.addEventListener("pointerdown", raise, true);
  markActive(panel);
  panel.style.zIndex = String(FLOAT_Z);
  raise();
  panel.addEventListener("pointerdown", raise, true);

  const setFolded = (folded) => {
    panel.classList.toggle("om-float-folded", folded);
    // Unfolding grows the panel downwards, which can push it past the bottom of a short
    // window; folding shrinks it and may leave it floating oddly low. Either way it is not
    // a drag, so the same settling applies.
    requestAnimationFrame(() => {
      applyMode();
      if (floating()) {
        settle(parseInt(panel.style.left, 10) || 0, parseInt(panel.style.top, 10) || 0);
      } else {
        centre();
      }
    });
    fold.textContent = folded ? "▸" : "▾";
    fold.title = folded ? "Expand" : "Collapse";
    remember();
  };
  fold.onclick = (event) => { event.stopPropagation(); setFolded(!panel.classList.contains("om-float-folded")); };
  bar.addEventListener("dblclick", (event) => {
    if (event.target.closest("button")) return;
    setFolded(!panel.classList.contains("om-float-folded"));
  });

  // Dragging and resizing move the element directly and only write the result away on release,
  // so a drag is not a storm of layout and localStorage writes.
  const drag = (handle, onMove, allowed = () => true) => {
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target.closest("button") || !allowed()) return;
      event.preventDefault();
      const start = { x: event.clientX, y: event.clientY,
                      left: parseInt(panel.style.left, 10) || 0,
                      top: parseInt(panel.style.top, 10) || 0,
                      width: panel.offsetWidth,
                      height: parseInt(body.style.height, 10) || height };
      handle.setPointerCapture(event.pointerId);
      const move = (moved) => onMove(start, moved.clientX - start.x, moved.clientY - start.y);
      const done = () => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", done);
        handle.removeEventListener("pointercancel", done);
        remember();
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", done);
      handle.addEventListener("pointercancel", done);
    });
  };

  drag(bar, (start, dx, dy) => place(start.left + dx, start.top + dy), floating);
  drag(grip, (start, dx, dy) => {
    if (panel.classList.contains("om-float-folded")) return;
    panel.style.width = `${Math.max(280, start.width + dx)}px`;
    body.style.height = `${Math.max(80, start.height + dy)}px`;
    applyMode();
    if (!floating()) centre();
    // Anything drawn rather than laid out has to be told the size changed.
    panel.dispatchEvent(new CustomEvent("om-float-resize"));
  });

  const destroy = () => {
    remember();
    (backdrop || panel).remove();
    floatPanels.delete(key);
    onClose?.();
    // Whatever is highest now is the one in front; without this every window is left inactive.
    const rest = [...document.querySelectorAll(".om-float")]
      .sort((a, b) => (Number(a.style.zIndex) || 0) - (Number(b.style.zIndex) || 0));
    if (rest.length) markActive(rest[rest.length - 1]);
  };
  // Clicking away closes a modal, as it does everywhere else in the interface. closeOn is
  // used rather than a plain click handler because it ignores a drag that began inside and
  // ended outside, which is what selecting text or using a scrollbar looks like.
  if (backdrop) closeOn(backdrop, destroy);
  close.onclick = destroy;

  // A window left half off-screen after the browser is resized is brought back.
  const onResize = () => {
    if (!panel.isConnected) { window.removeEventListener("resize", onResize); return; }
    applyMode();
    if (!floating()) { centre(); return; }
    const back = parked;
    parked = null;
    settle(back?.left ?? (parseInt(panel.style.left, 10) || 0),
           back?.top ?? (parseInt(panel.style.top, 10) || 0));
  };
  window.addEventListener("resize", onResize);

  const handle = {
    el: panel, body, bar, tools, key,
    // The title is set again when what the window is showing changes, so a page read at a
    // branch or a tag says so where the reader is already looking.
    setTitle: (text) => {
      const label = bar.querySelector(".om-float-title");
      if (label) { label.textContent = text; label.title = text; }
    },
    raise, destroy,
    // Opening something already open. Raising alone leaves a collapsed window collapsed, so
    // the reader clicks and nothing they can see happens.
    present: () => { setFolded(false); raise(); },
    setBadge: (text) => { badge.textContent = text || ""; },
    isFolded: () => panel.classList.contains("om-float-folded"),
  };
  floatPanels.set(key, handle);
  return handle;
}

// The open panel for a key, or nothing.
//
// A handle whose element has left the document is not an open panel. Anything can remove a
// node -- another extension tidying up, a defensive sweep of our own -- and a handle left
// behind in the map would answer "already open" forever, with no way to get the window back.
function floatingPanel(key) {
  const found = floatPanels.get(key);
  if (found && found.el.isConnected) return found;
  if (found) floatPanels.delete(key);
  return null;
}

function closeFloatingPanel(key) {
  floatingPanel(key)?.destroy();
}

// --- download manager ---------------------------------------------------------------

//: Polled while the panel is open: often while something is moving, rarely when nothing is.
const DL_POLL_BUSY = 900;
const DL_POLL_IDLE = 4000;

let dlTimer = 0;
let dlFolders = null;

function dlWorkers() {
  const asked = Number(panelSetting("openManager.downloadWorkers", 2));
  return Number.isFinite(asked) ? Math.max(1, Math.min(8, Math.round(asked))) : 2;
}

async function dlPost(path, body) {
  const answer = await api.fetchApi(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  return answer.json();
}

// The model folders this ComfyUI has, read once. The picker needs them because a URL says
// what a file is called, never where it belongs.
async function modelFolders() {
  if (dlFolders) return dlFolders;
  try {
    dlFolders = await (await api.fetchApi(`${API}/models/folders`)).json();
  } catch {
    dlFolders = { folders: [], formats: [], media_formats: [], hosts: [] };
  }
  return dlFolders;
}

//: Registered paths per model folder, read once each. ComfyUI's own list, never a typed one.
const dlRoots = new Map();

async function modelRoots(directory) {
  if (!directory) return [];
  if (!dlRoots.has(directory)) {
    try {
      const answer = await (await api.fetchApi(
        `${API}/models/roots?directory=${encodeURIComponent(directory)}`)).json();
      dlRoots.set(directory, answer.roots || []);
    } catch {
      dlRoots.set(directory, []);
    }
  }
  return dlRoots.get(directory);
}

// Whether a model can actually be written here. A path on a drive that is not mounted is
// still registered, and still listed, but it cannot be chosen.
function rootUsable(root) {
  return !!root && root.writable && root.total > 0;
}

// Which location a new download starts on. ComfyUI's own default leads unless the reader
// has asked for whichever drive has the most room, which is the point of the setting on a
// machine whose default drive is the small one.
function preferredRoot(roots) {
  const usable = (roots || []).filter(rootUsable);
  if (!usable.length) return "";
  if (panelSetting("openManager.downloadLocation", "default") !== "most-free") return "";
  return usable.reduce((best, one) => (one.free > best.free ? one : best)).path;
}

// A long path with its middle dropped, so the drive and the folder both stay readable.
function shortPath(text, cap = 48) {
  const value = String(text || "");
  if (value.length <= cap) return value;
  const head = Math.ceil((cap - 3) * 0.42);
  return `${value.slice(0, head)}...${value.slice(value.length - (cap - 3 - head))}`;
}

function rootLabel(root, isDefault) {
  const space = root.total ? `${bytesText(root.free)} free` : "drive not available";
  return `${shortPath(root.path)} - ${space}${isDefault ? " (default)" : ""}`;
}

// The location picker. Every registered path is listed so the reader can see what ComfyUI
// knows; the ones that cannot be written are shown greyed rather than hidden, because their
// absence would otherwise look like a missing drive had been forgotten.
function rootSelect(roots, chosen) {
  const select = el("select", "om-side-select om-dl-root");
  roots.forEach((root, index) => {
    const option = el("option", null, rootLabel(root, index === 0));
    option.value = root.path;
    option.title = root.path;
    option.disabled = !rootUsable(root);
    select.appendChild(option);
  });
  const wanted = chosen || preferredRoot(roots);
  if (wanted && roots.some((root) => root.path === wanted && rootUsable(root))) {
    select.value = wanted;
  } else {
    const first = roots.find(rootUsable);
    if (first) select.value = first.path;
  }
  return select;
}

function bytesText(value) {
  const count = Number(value) || 0;
  if (count < 1024) return `${count} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let size = count / 1024;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) { size /= 1024; unit += 1; }
  return `${size < 10 ? size.toFixed(1) : Math.round(size)} ${units[unit]}`;
}

// The distinct extensions among some files, in the order they first appear.
function formatsOf(names) {
  const seen = [];
  for (const name of names) {
    const text = String(name || "");
    const cut = text.lastIndexOf(".");
    const suffix = cut > 0 ? text.slice(cut).toLowerCase() : "";
    if (suffix && !seen.includes(suffix)) seen.push(suffix);
  }
  return seen;
}

// Ask before fetching from an account the reader has not trusted. The same two modes as
// packs, kept on a list of their own: trusting someone to ship code that runs with ComfyUI's
// privileges is a different question from trusting a file they host, so neither answers the
// other.
async function confirmDownloadTrust(owner, what, plural = false, formats = []) {
  if (!owner) return true;
  const byAuthor = panelSetting("openManager.trustMode", "author") !== "action";
  if (byAuthor) {
    try {
      const answer = await api.fetchApi(
        `${API}/trust?kind=downloads&owner=${encodeURIComponent(owner)}`);
      if ((await answer.json()).trusted === true) return true;
    } catch {
      // Treated as untrusted, which asks rather than assumes.
    }
  }
  const host = owner.split("/")[0];
  const account = owner.slice(host.length + 1) || host;
  const choices = byAuthor
    ? [{ key: "always", label: `Trust ${owner}`, primary: true,
         hint: `Stops asking for anything ${account} hosts` },
       { key: "once", label: "This time only", hint: "Nothing is remembered" }]
    : [{ key: "once", label: "Download", primary: true }];

  const how = await chooseAction(`Download from ${owner}?`, "", choices, {
    wide: true,
    facts: [
      ["Host", host],
      ["Account", account],
      // Reaching this prompt in author mode means the list was consulted and did not have
      // them; in action mode the list is never consulted, which is a different answer.
      ["Trusted", byAuthor ? "No" : "Not tracked, asked every time"],
      [plural ? "Files" : "File", what],
      [formats.length === 1 ? "Format" : "Formats", formats.join(", ")],
      ["Trust covers", byAuthor ? "Downloads only, not packs" : ""],
    ],
  });
  if (!how) return false;
  if (how === "always") {
    try {
      await dlPost("/trust", { owner, kind: "downloads", trusted: true });
    } catch {
      toast(`Could not remember ${owner}; continuing anyway.`, { kind: "warn" });
    }
  }
  return true;
}

// What a batch would ask of each drive, asked before any of it is queued. The server
// measures each file at its host and adds what is already promised to that drive, because
// three downloads that each fit on their own can still not fit together.
//
// The answer is a question, not a refusal. Someone about to clear space, or who knows the
// figure is an over-count because two of the files replace what is already there, is better
// served by the numbers than by being stopped. Returns whether to go ahead.
async function confirmDiskRoom(items) {
  if (!items.length) return true;
  let report;
  try {
    report = await dlPost("/downloads/plan", {
      items: items.map((one) => ({
        url: one.url, name: one.name, directory: one.directory, root: one.root || "",
      })),
    });
  } catch {
    return true;
  }
  const short = (report?.drives || []).filter((drive) => drive.short);
  if (!short.length) return true;
  const facts = [];
  for (const drive of short) {
    facts.push([drive.path, `${bytesText(drive.free)} free of ${bytesText(drive.total)}`]);
    facts.push(["Downloading",
                `${bytesText(drive.adding)} in ${drive.files} file${drive.files === 1 ? "" : "s"}`]);
    if (drive.queued) {
      facts.push(["Already queued", `${bytesText(drive.queued)} still to arrive`]);
    }
    facts.push(["Short by", bytesText(Math.max(0, drive.needed - drive.free))]);
  }
  if (report.unknown) {
    facts.push(["Not measured",
                `${report.unknown} file${report.unknown === 1 ? "" : "s"} the host gave no size `
                + "for, so the real figure is higher"]);
  }
  facts.push(["If you go ahead", "Each download stops when the drive fills, keeping what "
                                 + "arrived. Nothing already on disk is touched."]);
  const go = await chooseAction(
    short.length === 1 ? `There is not room on ${short[0].path}`
                       : "Not enough room on these drives",
    "", [{ key: "go", label: "Queue anyway", primary: true }], { wide: true, facts });
  return !!go;
}

// Whether two paths name the same file, allowing for separator and case differences.
function samePlace(left, right) {
  const fold = (value) => String(value || "").replace(/[\\/]+/g, "/").replace(/\/$/, "").toLowerCase();
  return !!left && fold(left) === fold(right);
}

// Put one model on the queue, asking about the account first and about replacing a file that
// is already there. Returns whether it was queued.
async function queueModel(model, { source = "", askTrust = true } = {}) {
  if (askTrust && !(await confirmDownloadTrust(
      model.owner, model.name || "This model", false, formatsOf([model.name])))) {
    return false;
  }
  const body = {
    url: model.url, name: model.name, directory: model.directory, source,
    hash: model.hash || "", hash_type: model.hash_type || "",
    workers: dlWorkers(), overwrite: !!model.overwrite, root: model.root || "",
  };
  let result = await dlPost("/downloads", body);
  if (!result.ok && result.installed && !model.overwrite) {
    // Storing it somewhere else leaves the copy that is already there, which is a different
    // thing from replacing it and is worth saying plainly before it happens.
    const elsewhere = model.root
      && !samePlace(result.installed, `${model.root}\\${model.name}`)
      && !samePlace(result.installed, `${model.root}/${model.name}`);
    const replace = await chooseAction(
      elsewhere ? `Store a second copy of ${model.name}?` : `Replace ${model.name}?`,
      "",
      [{ key: "go", label: elsewhere ? "Download anyway" : "Download again", primary: true }],
      { wide: true,
        facts: [
          ["On disk", result.installed],
          ["Downloading to", elsewhere ? `${model.root}` : result.installed],
          ["Result", elsewhere
            ? "Second copy. The one on disk stays."
            : "Replaced once the new file arrives whole."],
        ] });
    if (!replace) return false;
    result = await dlPost("/downloads", { ...body, overwrite: true });
  }
  if (!result.ok) {
    notify("Not downloaded", result.reason || "The download was refused.");
    return false;
  }
  return true;
}

// --- the panel ----------------------------------------------------------------------

function dlStatusText(row) {
  if (row.status === "downloading") {
    return row.total ? `${bytesText(row.bytes)} of ${bytesText(row.total)}` : bytesText(row.bytes);
  }
  if (row.status === "pausing") return "Stopping...";
  if (row.status === "done") {
    const size = bytesText(row.bytes || row.total);
    return row.on_disk === false ? `${size} - no longer on disk` : size;
  }
  if (row.status === "failed") return row.error || "Failed";
  if (row.status === "paused") {
    return row.total ? `Paused at ${bytesText(row.bytes)} of ${bytesText(row.total)}`
                     : "Paused";
  }
  if (row.status === "cancelled") return "Cancelled";
  return "Waiting";
}

//: How the list is divided. Two questions are asked of the same downloads: what a transfer
//: is doing, and whether its file is there. A finished transfer therefore appears under both
//: Transfers and Downloaded, because those answer different things.
//:
//: Every tab is shown whether or not it holds anything. The list is a record, and a tab that
//: vanishes when empty cannot be consulted to find out that nothing is in it.
const DL_VIEWS = [
  {
    key: "transfers",
    title: "Transfers",
    tabs: [
      // A transfer in flight is stopped per row rather than swept up, so this tab offers
      // nothing to clear.
      { key: "downloading", title: "Downloading",
        holds: (row) => ["queued", "downloading", "pausing"].includes(row.status),
        empty: "Nothing is transferring.", clearable: false },
      { key: "suspended", title: "Suspended",
        holds: (row) => ["paused", "failed", "cancelled"].includes(row.status),
        empty: "Nothing is paused or waiting to be retried." },
      { key: "finished", title: "Finished",
        holds: (row) => row.status === "done",
        empty: "No transfer has completed yet." },
    ],
  },
  {
    key: "downloaded",
    title: "Downloaded",
    tabs: [
      // These rows are files rather than records, so each is managed from its own menu.
      // A single action over all of them would mean deleting every model at once.
      { key: "on-disk", title: "On Disk",
        holds: (row) => row.on_disk === true,
        empty: "No downloaded file is on disk.", clearable: false },
      { key: "archive", title: "Archive",
        holds: (row) => row.on_disk === false,
        empty: "Nothing downloaded here has been deleted." },
    ],
  },
];

//: Which tab the panel opens on, kept so it returns where it was left.
const DL_VIEW_KEY = "om-dl-view";

function dlRemember(key, value) {
  try { localStorage.setItem(key, value); } catch { /* private browsing */ }
}

function dlRecall(key, fallback) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}

function buildDownloadRow(row, refresh) {
  const item = el("div",
    `om-dl-row om-dl-${row.status}${row.on_disk === false ? " om-dl-gone" : ""}`);

  const top = el("div", "om-dl-top");
  top.appendChild(el("span", "om-dl-name", row.name || "(unnamed)"));
  top.appendChild(el("span", "om-dl-state", row.status));
  item.appendChild(top);

  const where = el("div", "om-dl-where");
  where.appendChild(el("span", null, row.directory || "?"));
  if (row.owner) {
    const from = el("span", "om-dl-owner", row.owner);
    from.title = row.url;
    where.appendChild(from);
  }
  if (row.source) where.appendChild(el("span", "om-dl-src", row.source));
  if (row.path) {
    const at = el("span", "om-dl-src", dirOf(row.path));
    at.title = row.path;
    where.appendChild(at);
  }
  item.appendChild(where);

  const bar = el("div", "om-dl-bar");
  const fill = el("div", "om-dl-fill");
  const share = row.total ? Math.min(100, (row.bytes / row.total) * 100) : 0;
  fill.style.width = `${row.status === "done" ? 100 : share}%`;
  bar.appendChild(fill);
  item.appendChild(bar);

  // The hash belongs to the file, so it reads with the path above it -- and it goes before
  // the action row rather than after, so the Manage menu always hangs from the corner of the
  // card instead of from the middle of one that happens to carry a hash.
  const digest = row.sha256 || row.declared_hash || row.hash || row.sha256_observed;
  if (digest) {
    const line = el("div", "om-dl-hash");
    line.appendChild(el("span", "om-dl-hash-label", "SHA256"));
    const value = el("code", "om-dl-hash-value", digest);
    value.title = `${digest}\nClick to copy`;
    value.onclick = () => {
      navigator.clipboard?.writeText(digest)
        .then(() => toast("Hash copied.", { kind: "ok" }))
        .catch(() => notify("Not copied", "The clipboard is not available here."));
    };
    line.appendChild(value);
    item.appendChild(line);
  }

  const foot = el("div", "om-dl-foot");
  foot.appendChild(el("span", "om-dl-size", dlStatusText(row)));
  const acts = el("span", "om-dl-acts");
  const act = (label, action, { primary = false, hint = "" } = {}) => {
    const button = el("button", `om-btn om-dl-btn${primary ? " om-go" : ""}`, label);
    if (hint) button.title = hint;
    button.onclick = async () => {
      button.disabled = true;
      await dlPost("/downloads/action", { action, id: row.id, workers: dlWorkers() });
      refresh();
    };
    acts.appendChild(button);
  };
  const moving = row.status === "queued" || row.status === "downloading";
  if (moving) {
    act("Pause", "pause", { hint: "Stops here. The bytes already fetched are kept." });
    act("Cancel", "cancel");
  }
  if (row.status === "paused") {
    act("Resume", "retry", { primary: true, hint: "Carries on from where it stopped" });
  }
  if (row.status === "failed" || row.status === "cancelled") act("Retry", "retry", { primary: true });
  if (row.on_disk === false) {
    act("Download again", "retry", { primary: true, hint: "The file is no longer on disk" });
  }
  if (row.on_disk === true) {
    const manage = el("button", "om-btn om-dl-btn om-caret", "Manage ▾");
    manage.onclick = (event) => {
      event.stopPropagation();
      openRowMenu(manage, { items: fileMenu(row, refresh), align: "right" });
    };
    acts.appendChild(manage);
  } else if (!moving && row.status !== "pausing") {
    act("Remove", "remove", { hint: "Removes this entry. Any file on disk is left alone." });
  }
  foot.appendChild(acts);
  item.appendChild(foot);

  if (row.error && row.status === "failed") item.title = row.error;
  return item;
}

// The actions a file already on disk offers. Deleting removes the file and keeps the record,
// so the entry moves to Archive and can be fetched again from there.
function fileMenu(row, refresh) {
  const send = async (action) => {
    const answer = await dlPost("/downloads/action", { action, id: row.id, workers: dlWorkers() });
    refresh();
    return answer;
  };
  return [
    { label: "Verify hash", fn: async () => {
        const note = toast(`Hashing ${row.name}...`, { sticky: true });
        const answer = await send("verify");
        note.remove();
        if (!answer.ok) { notify("Not verified", answer.reason || "The file could not be read."); return; }
        const facts = [
          ["File", row.name],
          ["On disk now", answer.sha256],
          ["Expected", answer.expected || "Nothing to compare against"],
          ["Expected from", answer.expected_from || ""],
          ["Match", answer.matches === null ? "Cannot say" : answer.matches ? "Yes" : "No"],
        ];
        await chooseAction(answer.matches === false ? "Hash does not match" : "Hash checked",
                           "", [], { wide: true, facts });
      } },
    { label: "Re-download", fn: async () => {
        const go = await chooseAction(`Re-download ${row.name}?`, "",
          [{ key: "go", label: "Re-download", primary: true }],
          { wide: true, facts: [
            ["File", row.path || row.name],
            ["Source", row.owner],
            ["Result", "Replaced once the new file has arrived whole"],
          ] });
        if (go) await send("redownload");
      } },
    { label: "Copy URL", fn: () => {
        navigator.clipboard?.writeText(row.url)
          .then(() => toast("URL copied.", { kind: "ok" }))
          .catch(() => notify("Not copied", "The clipboard is not available here."));
      } },
    { label: "Remove from list", fn: async () => {
        const go = await chooseAction(`Remove ${row.name} from the list?`, "",
          [{ key: "go", label: "Remove entry", primary: true }],
          { wide: true, facts: [["Entry", "Removed"], ["File on disk", "Kept"]] });
        if (go) await send("remove");
      } },
    { label: "Delete file", danger: true, fn: async () => {
        const go = await chooseAction(`Delete ${row.name}?`, "",
          [{ key: "go", label: "Delete file", primary: true }],
          { wide: true, facts: [
            ["File", row.path || row.name],
            ["Size", bytesText(row.bytes || row.total)],
            ["Kept", "The record, so it can be fetched again from Archive"],
          ] });
        if (!go) return;
        const answer = await send("delete");
        if (answer.ok) toast(`${row.name} deleted.`, { kind: "ok" });
        else notify("Not deleted", answer.reason || "The file could not be deleted.");
      } },
  ];
}

// The Download Manager: what has been fetched, what is on the way, and a way to add more.
function openDownloadManager() {
  if (floatingPanel("downloads")) { closeFloatingPanel("downloads"); return null; }

  const panel = createFloatingPanel({
    key: "downloads", title: "Download Manager", ...windowSize("downloads"),
    modal: !asWindow("downloads"),
    onClose: stopDownloadPolling,
  });
  const dialog = panel.el;
  const summary = el("div", "om-dl-summary", "Reading...");
  panel.bar.querySelector(".om-float-badge").appendChild(summary);
  const tools = panel.tools;
  const add = el("button", "om-btn om-go", "+ Add a download");
  add.onclick = () => addModel(refresh);
  tools.appendChild(add);
  const clear = el("button", "om-btn", "Clear");
  //: The rows the clear button would act on: whatever the open tab is showing.
  let showing = [];
  clear.onclick = async () => {
    if (!showing.length) return;
    const count = showing.length;
    const go = await chooseAction(`Clear ${tab.title}?`, "",
      [{ key: "go", label: `Remove ${count} entr${count === 1 ? "y" : "ies"}`, primary: true }],
      { wide: true,
        facts: [
          ["Tab", `${view.title} / ${tab.title}`],
          ["Entries", String(count)],
          ["Files on disk", "Not touched"],
        ] });
    if (!go) return;
    await dlPost("/downloads/action", { action: "remove-many", ids: showing.map((row) => row.id) });
    refresh();
  };
  tools.appendChild(clear);

  // Which view and tab are showing. Restored from last time, and checked against the
  // definitions so a renamed tab falls back rather than showing nothing.
  let view = DL_VIEWS.find((one) => one.key === dlRecall(DL_VIEW_KEY, "")) || DL_VIEWS[0];
  let tab = view.tabs.find((one) => one.key === dlRecall(`${DL_VIEW_KEY}-${view.key}`, "")) || view.tabs[0];

  const viewBar = el("div", "om-dl-views");
  const tabBar = el("div", "om-dl-tabs");
  panel.body.appendChild(viewBar);
  panel.body.appendChild(tabBar);

  const body = el("div", "om-dl-body");
  const list = el("div", "om-dl-list");
  body.appendChild(list);
  panel.body.appendChild(body);

  //: tab key -> the badge showing how many it holds, so counts update without rebuilding.
  const badges = new Map();

  const buildViewBar = () => {
    viewBar.replaceChildren(...DL_VIEWS.map((one) => {
      const button = el("button", `om-dl-view${one === view ? " om-dl-on" : ""}`, one.title);
      button.onclick = () => {
        if (one === view) return;
        view = one;
        tab = view.tabs.find((each) => each.key === dlRecall(`${DL_VIEW_KEY}-${view.key}`, ""))
              || view.tabs[0];
        dlRemember(DL_VIEW_KEY, view.key);
        buildViewBar();
        buildTabBar();
        refresh();
      };
      return button;
    }));
  };

  const buildTabBar = () => {
    badges.clear();
    tabBar.replaceChildren(...view.tabs.map((one) => {
      const button = el("button", `om-dl-tab${one === tab ? " om-dl-on" : ""}`);
      button.appendChild(el("span", null, one.title));
      const badge = el("span", "om-dl-tab-count", "0");
      badges.set(one.key, badge);
      button.appendChild(badge);
      button.onclick = () => {
        if (one === tab) return;
        tab = one;
        dlRemember(`${DL_VIEW_KEY}-${view.key}`, tab.key);
        buildTabBar();
        refresh();
      };
      return button;
    }));
  };

  buildViewBar();
  buildTabBar();

  const refresh = async () => {
    if (!dialog.isConnected) { stopDownloadPolling(); return; }
    let state;
    try {
      state = await (await api.fetchApi(`${API}/downloads`)).json();
    } catch {
      summary.textContent = "The download list could not be read";
      return;
    }
    if (!dialog.isConnected) { stopDownloadPolling(); return; }
    const rows = state.downloads || [];
    const busy = (state.running || 0) + (state.queued || 0);
    summary.textContent = busy
      ? `${state.running} running, ${state.queued} queued`
      : (rows.length ? `${rows.length} download${rows.length === 1 ? "" : "s"}` : "");
    // Counted across everything, not just what is showing, so an idle tab still says how
    // much is waiting in the others.
    for (const one of view.tabs) {
      const badge = badges.get(one.key);
      if (badge) badge.textContent = String(rows.filter(one.holds).length);
    }
    const mine = rows.filter(tab.holds);
    showing = mine;
    // Named for the tab it would empty, so it never reads as an action on the whole list.
    clear.textContent = `Clear ${tab.title}`;
    clear.title = `Removes the ${tab.title} entries from this list. Files on disk are left alone.`;
    clear.disabled = tab.clearable === false || !mine.length;
    clear.style.display = tab.clearable === false ? "none" : "";
    if (mine.length) {
      list.replaceChildren(...mine.map((row) => buildDownloadRow(row, refresh)));
    } else {
      const box = el("div", "om-empty");
      box.appendChild(el("div", "om-empty-title", tab.empty));
      if (!rows.length) box.appendChild(el("div", null, "Add one by URL, or from a workflow."));
      list.replaceChildren(box);
    }
    clearTimeout(dlTimer);
    const settling = rows.some((row) => row.status === "pausing");
    dlTimer = setTimeout(refresh, busy || settling ? DL_POLL_BUSY : DL_POLL_IDLE);
  };

  refresh();
  return panel;
}

function stopDownloadPolling() {
  clearTimeout(dlTimer);
  dlTimer = 0;
}

// --- adding ---------------------------------------------------------------------------

async function addModel(refresh) {
  const how = await chooseAction("Add a download", "",
    [{ key: "workflow", label: "From a workflow", primary: true,
       hint: "Lists the models an open workflow names" },
     { key: "url", label: "From a URL", hint: "Paste a Hugging Face or GitHub link" }]);
  if (how === "url") await addModelByUrl(refresh);
  if (how === "workflow") await addModelsFromWorkflow(refresh);
}

// Paste a URL, say where it goes, and queue it. Checked as it is typed, so a URL that will
// never be allowed says so here rather than as a download that fails later.
async function addModelByUrl(refresh) {
  const { folders } = await modelFolders();
  const backdrop = el("div", "om-backdrop");
  const box = el("div", "om-note om-dl-add");
  box.appendChild(el("div", "om-note-title", "Add by URL"));

  const field = (label, node) => {
    const wrap = el("label", "om-dl-field");
    wrap.appendChild(el("span", null, label));
    wrap.appendChild(node);
    box.appendChild(wrap);
    return node;
  };

  const url = field("URL", el("input", "om-search"));
  url.spellcheck = false;
  url.placeholder = "https://huggingface.co/account/repo/resolve/main/file.safetensors";
  const name = field("Save as", el("input", "om-search"));
  name.spellcheck = false;
  const folder = field("Folder", el("select", "om-side-select"));
  const blank = el("option", null, "Choose a folder");
  blank.value = "";
  folder.appendChild(blank);
  for (const key of folders) {
    const option = el("option", null, key);
    option.value = key;
    folder.appendChild(option);
  }
  // Offered only where the folder has more than one registered path, so the common case of
  // a single models directory is not given a choice that does not exist.
  const where = el("label", "om-dl-field om-dl-where-field");
  where.appendChild(el("span", null, "Store in"));
  where.style.display = "none";
  box.appendChild(where);
  let placeSelect = null;
  const showLocations = async () => {
    const roots = await modelRoots(folder.value);
    where.replaceChildren(el("span", null, "Store in"));
    placeSelect = null;
    if (roots.length < 2) { where.style.display = "none"; return; }
    placeSelect = rootSelect(roots);
    placeSelect.addEventListener("change", recheck);
    where.appendChild(placeSelect);
    where.style.display = "";
  };

  const idle = "Hugging Face and GitHub.";
  const note = el("div", "om-dl-note", idle);
  box.appendChild(note);

  const foot = el("div", "om-note-foot");
  const cancel = el("button", "om-btn", "Cancel");
  const ok = el("button", "om-btn om-go", "Download");
  cancel.onclick = () => backdrop.remove();
  foot.appendChild(cancel);
  foot.appendChild(ok);
  box.appendChild(foot);
  backdrop.appendChild(box);
  document.body.appendChild(backdrop);
  closeOn(backdrop);
  url.focus();

  let checked = null;
  let latest = 0;
  let debounce = 0;
  // The name follows the URL until the reader types one of their own, after which it is
  // theirs and a new URL leaves it alone.
  let ownName = false;
  const recheck = async () => {
    const typed = url.value.trim();
    if (!typed) {
      note.textContent = idle;
      note.className = "om-dl-note";
      checked = null;
      return;
    }
    const mine = ++latest;
    const answer = await dlPost("/models/check", {
      url: typed, name: ownName ? name.value.trim() : "", directory: folder.value,
      root: placeSelect?.value || "",
    });
    if (mine !== latest || !backdrop.isConnected) return;
    checked = answer;
    if (!ownName && answer.name) name.value = answer.name;
    // A link that is plainly an image, video or audio file has one place it belongs, so the
    // folder is filled in rather than left for the reader to find.
    if (!folder.value && answer.suggested_directory) {
      folder.value = answer.suggested_directory;
      await showLocations();
      return recheck();
    }
    const from = answer.rewritten
      ? `From ${answer.owner}. That was a link to the page, so the file behind it is used.`
      : `From ${answer.owner}.`;
    if (answer.ok) {
      note.textContent = answer.installed ? `${from} Already on disk; downloading replaces it.` : from;
      note.className = "om-dl-note om-dl-ok";
    } else if (answer.needs_directory) {
      // The URL is sound and only the folder is outstanding, which is not a refusal.
      note.textContent = `${from} Choose the folder it belongs in.`;
      note.className = "om-dl-note";
    } else {
      note.textContent = answer.reason || "That URL cannot be downloaded.";
      note.className = "om-dl-note om-dl-bad";
    }
  };
  url.addEventListener("input", () => {
    clearTimeout(debounce);
    debounce = setTimeout(recheck, 350);
  });
  name.addEventListener("input", () => { ownName = true; });
  name.addEventListener("change", recheck);
  folder.addEventListener("change", async () => { await showLocations(); recheck(); });

  ok.onclick = async () => {
    if (!url.value.trim()) { url.focus(); return; }
    if (!folder.value) {
      note.textContent = "Choose the folder it belongs in.";
      note.className = "om-dl-note om-dl-bad";
      folder.focus();
      return;
    }
    ok.disabled = true;
    clearTimeout(debounce);
    await recheck();
    ok.disabled = false;
    if (!checked?.ok) return;
    backdrop.remove();
    const model = { url: checked.url, name: checked.name, directory: folder.value,
                    owner: checked.owner, root: placeSelect?.value || "" };
    // Trust first, then the drive. Measuring the file means asking the host for it, and that
    // is not done until the reader has said this is an account they want a file from.
    if (!(await confirmDownloadTrust(model.owner, model.name, false, formatsOf([model.name])))) {
      return;
    }
    if (!(await confirmDiskRoom([model]))) return;
    const queued = await queueModel(model, { source: "added by URL", askTrust: false });
    if (queued) { toast(`Queued ${checked.name}.`, { kind: "ok" }); refresh?.(); }
  };
}

// Every workflow the reader has open, with the one in front marked.
function openWorkflowChoices() {
  try {
    const store = app.extensionManager?.workflow;
    const open = store?.openWorkflows || [];
    const active = store?.activeWorkflow;
    return open.map((workflow) => ({
      workflow,
      label: workflow.filename || workflow.key || workflow.path,
      active: workflow === active,
    }));
  } catch {
    return [];
  }
}

// One workflow's document. The tab in front is read from the live graph so unsaved edits
// count; a tab that has been opened carries its own copy; one that has not been loaded yet
// is read back from where it is saved.
async function workflowDocument(choice) {
  if (choice.active) {
    try {
      const live = app.graph.serialize();
      if (live) return live;
    } catch {
      // Fall through to what is stored.
    }
  }
  const content = choice.workflow?.content || choice.workflow?.originalContent;
  if (content) {
    try { return JSON.parse(content); } catch { /* fall through */ }
  }
  const path = choice.workflow?.path;
  if (!path) return null;
  try {
    const answer = await api.fetchApi(`/userdata/${encodeURIComponent(path)}`);
    return answer.ok ? await answer.json() : null;
  } catch {
    return null;
  }
}

async function addModelsFromWorkflow(refresh) {
  const choices = openWorkflowChoices();
  if (!choices.length) {
    notify("No workflows open", "Open a workflow and try again.");
    return;
  }

  const backdrop = el("div", "om-backdrop");
  const dialog = el("div", "om-dialog om-dl-pick");
  const close = el("button", "om-x", "×");
  close.title = "Close";
  close.onclick = () => backdrop.remove();
  dialog.appendChild(close);

  const head = el("div", "om-head");
  head.appendChild(el("div", "om-title", "Models in a workflow"));
  const picker = el("select", "om-side-select om-dl-wf");
  choices.forEach((choice, index) => {
    const option = el("option", null, choice.active ? `${choice.label} (open)` : choice.label);
    option.value = String(index);
    picker.appendChild(option);
  });
  const activeIndex = choices.findIndex((choice) => choice.active);
  picker.value = String(activeIndex >= 0 ? activeIndex : 0);
  head.appendChild(picker);
  dialog.appendChild(head);

  const body = el("div", "om-body om-dl-body");
  const list = el("div", "om-dl-models");
  body.appendChild(list);
  dialog.appendChild(body);

  const foot = el("div", "om-dl-pickfoot");
  const summary = el("span", "om-dl-summary", "");
  const download = el("button", "om-btn om-go", "Download selected");
  foot.appendChild(summary);
  foot.appendChild(download);
  dialog.appendChild(foot);

  backdrop.appendChild(dialog);
  document.body.appendChild(backdrop);
  closeOn(backdrop);

  let rows = [];
  const boxes = new Map();
  //: index -> the location that row will be stored in, where its folder offers a choice.
  const chosen = new Map();

  const selected = () => [...boxes.entries()]
    .filter(([, box]) => box.checked)
    .map(([index]) => ({ ...rows[index], root: chosen.get(index) || "" }));
  const updateSummary = () => {
    const picked = selected().length;
    const have = rows.filter((row) => row.installed).length;
    summary.textContent = rows.length
      ? `${picked} of ${rows.length} selected` + (have ? ` · ${have} already on disk` : "")
      : "";
    download.disabled = picked === 0;
  };

  const load = async () => {
    list.replaceChildren(el("div", "om-empty", "Reading the workflow..."));
    boxes.clear();
    rows = [];
    const choice = choices[Number(picker.value)] || choices[0];
    const doc = await workflowDocument(choice);
    if (!backdrop.isConnected) return;
    if (!doc) {
      list.replaceChildren(el("div", "om-empty", "That workflow could not be read."));
      updateSummary();
      return;
    }
    let answer;
    try {
      answer = await dlPost("/models/in-workflow", { workflow: doc });
    } catch {
      list.replaceChildren(el("div", "om-empty", "The workflow could not be scanned."));
      updateSummary();
      return;
    }
    if (!backdrop.isConnected) return;
    rows = answer.models || [];
    if (!rows.length) {
      list.replaceChildren(el("div", "om-empty", "This workflow does not name any model downloads."));
    } else {
      // Each row is offered the paths its own folder registers; a workflow can pull from
      // several folders and they do not share a list.
      const places = await Promise.all(rows.map((model) => modelRoots(model.directory)));
      if (!backdrop.isConnected) return;
      list.replaceChildren(...rows.map((model, index) =>
        buildModelRow(model, index, boxes, updateSummary, places[index], chosen)));
    }
    updateSummary();
  };

  picker.onchange = load;

  download.onclick = async () => {
    const picked = selected();
    backdrop.remove();
    // One question per account, counting only what that account is being asked about, and
    // a refusal covers the rest of their files rather than asking again for each.
    const perOwner = new Map();
    for (const model of picked) {
      if (!perOwner.has(model.owner)) perOwner.set(model.owner, []);
      perOwner.get(model.owner).push(model.name);
    }
    const answered = new Map();
    const ready = [];
    for (const model of picked) {
      if (!answered.has(model.owner)) {
        const names = perOwner.get(model.owner) || [model.name];
        answered.set(model.owner, await confirmDownloadTrust(
          model.owner,
          names.length === 1 ? `${model.name} in this workflow`
                             : `${names.length} models in this workflow`,
          names.length !== 1,
          formatsOf(names)));
      }
      if (!answered.get(model.owner)) continue;
      ready.push({ ...model, overwrite: !!model.installed, root: model.root || "" });
    }
    // The drive is asked about once for the batch rather than once per file, so a workflow
    // naming nine models is one question and not nine.
    if (!ready.length || !(await confirmDiskRoom(ready))) { refresh?.(); return; }
    let queued = 0;
    for (const model of ready) {
      if (await queueModel(model, { source: "from a workflow", askTrust: false })) queued += 1;
    }
    if (queued) toast(`Queued ${queued} model${queued === 1 ? "" : "s"}.`, { kind: "ok" });
    refresh?.();
  };

  load();
}

// One model a workflow asks for. An installed one is dimmed but still selectable: a file on
// disk can be truncated or the wrong weights, and fetching it again is how that gets fixed.
function dirOf(path) {
  const value = String(path || "");
  const cut = Math.max(value.lastIndexOf("\\"), value.lastIndexOf("/"));
  return cut > 0 ? value.slice(0, cut) : "";
}

function buildModelRow(model, index, boxes, onChange, roots, chosen) {
  const row = el("label",
    `om-dl-model${model.installed ? " om-dl-have" : ""}${model.allowed ? "" : " om-dl-refused"}`);
  const box = el("input", "om-dl-check");
  box.type = "checkbox";
  box.disabled = !model.allowed;
  box.checked = model.allowed && !model.installed;
  box.onchange = onChange;
  boxes.set(index, box);
  row.appendChild(box);

  const text = el("div", "om-dl-modeltext");
  text.appendChild(el("div", "om-dl-name", model.name || model.url));
  const meta = el("div", "om-dl-where");
  meta.appendChild(el("span", null, model.directory || "?"));
  if (model.owner) meta.appendChild(el("span", "om-dl-owner", model.owner));
  if (model.node) meta.appendChild(el("span", "om-dl-src", model.node));
  text.appendChild(meta);
  if (!model.allowed) {
    text.appendChild(el("div", "om-dl-note om-dl-bad", model.reason || "Not allowed."));
  } else if (model.installed) {
    const have = el("div", "om-dl-note", "On disk. Select to replace.");
    have.title = model.installed;
    text.appendChild(have);
  }
  if (model.allowed && (roots || []).length > 1) {
    const place = el("div", "om-dl-place");
    place.appendChild(el("span", null, "Store in"));
    const select = rootSelect(roots, model.installed ? dirOf(model.installed) : "");
    // The label wraps the row, so a click on the select would toggle the checkbox too.
    select.onclick = (event) => event.preventDefault();
    select.onchange = () => chosen.set(index, select.value);
    chosen.set(index, select.value);
    place.appendChild(select);
    text.appendChild(place);
  }
  row.appendChild(text);
  return row;
}

// --- the button -----------------------------------------------------------------------

// A way in at the right-hand end of the workflow tab strip. ComfyUI builds that strip after
// the extension loads, so this waits for it rather than assuming it is there.
// The slot at the right-hand end of the workflow tab strip, or nothing where ComfyUI has not
// drawn it yet.
function topbarSlot() {
  const strip = document.querySelector(".workflow-tabs-container.pointer-events-auto")?.firstElementChild;
  return strip
    ? [...strip.children].find((child) => !String(child.className).includes("workflow-tabs-container"))
    : null;
}

//: Set once the interface has been set up, so a setting changed during start-up does not send
//: the mount into a retry loop before there is anywhere to mount to.
let topbarReady = false;

// Where the buttons live. The tab strip carries them with their words; the control bar is
// tight on width and carries them as icons, which is why the two go together rather than
// being separate settings. Where a build has no control bar, the tab strip is the remaining
// place, same as the monitor strip does.
function buttonHost(slot) {
  if (panelSetting("openManager.buttonPlacement", "topbar") === "control") {
    const bar = document.querySelector(".actionbar-container");
    if (bar) {
      const group = bar.querySelector(".flex.gap-2") || bar.firstElementChild || bar;
      return { host: group, before: group.firstChild, icons: true };
    }
  }
  return slot ? { host: slot, before: slot.firstChild, icons: false } : null;
}

// Each control is decided on its own. They were once nested, which meant switching off the
// downloads button also took away the library button and the monitor -- three features behind
// one switch, and no way to tell from the settings that it would happen.
// Everywhere Open Manager can be reached, in one place.
//
// The tab strip renders the entries marked for it; the legacy menu renders all of them. It is
// one table because it used to be two lists, and the second one fell behind: the Model Library
// and the Memory panel were reachable from the tab strip for weeks while the legacy menu, which
// is the only way in for anyone on the classic interface, had never heard of them. A reskin
// cannot accumulate coverage gaps; a second list can, and did.
//
// `available` is whether the feature exists at all. `button` is whether it earns a place in the
// tab strip, which is a separate question with its own setting.
//: Whether ComfyUI was started with its legacy manager interface. Read once from the
//: arguments the server reports, because it is a launch flag and cannot change while running.
//: Unknown until that read returns, and unknown means modern: an install that never asked for
//: the old interface should not be given it.
let legacyUi = false;

async function readLegacyUi() {
  try {
    const stats = await (await api.fetchApi("/system_stats")).json();
    const argv = stats?.system?.argv || [];
    legacyUi = argv.some((one) => String(one).includes("enable-manager-legacy-ui"));
  } catch {
    legacyUi = false;
  }
  return legacyUi;
}

// Which way the Extensions button goes. `auto` follows ComfyUI, which is what almost everyone
// wants: the classic menu exists to serve the classic interface, and offering it on the modern
// one puts a second, smaller manager in front of the real one.
function managerEntry() {
  const asked = String(panelSetting("openManager.managerEntry", "auto") || "auto");
  if (asked === "classic" || asked === "panel") return asked;
  return legacyUi ? "classic" : "panel";
}

function managerDestinations() {
  return [
    { key: "registry", label: "Custom Nodes Manager", icon: "\u25a4",
      hint: "Browse and install from the Comfy Registry",
      open: () => openPanelWindow("registry") },
    { key: "missing", label: "Install Missing Custom Nodes", icon: "\u26a0",
      hint: "The packs supplying the node types this workflow is missing",
      open: () => openPanelWindow("missing") },
    { key: "github", label: "Install via Git URL", icon: "\u2325",
      hint: "Repositories you add by URL, kept across uninstalls",
      open: () => openPanelWindow("github") },
    { key: "installed", label: "Check for Updates", icon: "\u21bb",
      hint: "What is installed, and what has a newer version",
      open: () => openPanelWindow("installed") },
    { key: "downloads", label: "Download Manager", short: "Downloads", icon: "\u2b73",
      cls: "om-dl-downloads",
      hint: "Download Manager: fetch the models a workflow needs",
      open: openDownloadManager,
      button: () => panelSetting("openManager.downloadButton", true) !== false },
    { key: "library", label: "Model Library", short: "Models", icon: "\u25a4",
      cls: "om-lib-open",
      hint: "Model Library: what is on disk, and what is there twice",
      open: openModelLibrary,
      available: () => panelSetting("openManager.modelLibrary", false) !== false,
      button: () => panelSetting("openManager.modelLibrary", false) !== false },
    { key: "memory", label: "Memory", short: "Memory", icon: "\u25a6",
      cls: "om-mem-open",
      hint: "Memory: what is loaded, what it weighs, and where it sits",
      open: openMemoryPanel,
      button: () => panelSetting("openManager.memoryButton", true) !== false },
    { key: "scan", label: "Scan an Install", icon: "\u2691",
      hint: "Each installed pack's menu offers a VirusTotal scan of the files it ships",
      open: () => openPanelWindow("installed"),
      available: vtReady },
    { key: "environment", label: "Environment changes", icon: "\u2317",
      hint: "What recent installs did to your Python packages, and how to undo one",
      open: openEnvironmentDialog },
    { key: "about", label: "About and updates", icon: "\u2139",
      hint: "Which Open Manager this is, and what updating it takes here",
      open: openAboutDialog },
    { key: "keys", label: "Access keys", icon: "\u26bf",
      hint: "Hugging Face, GitHub and VirusTotal keys. Kept out of ComfyUI's settings, and "
            + "never shown back.",
      open: openKeysDialog },
  ].filter((one) => !one.available || one.available());
}

function mountTopbar(attempt = 0) {
  const slot = topbarSlot();
  if (!slot) {
    if (attempt < 40) setTimeout(() => mountTopbar(attempt + 1), 500);
    return false;
  }
  const where = buttonHost(slot);
  const make = (cls, icon, label, title, onclick) => {
    if (document.querySelector(`.${cls}`)) return null;
    const button = el("button", `om-dl-open ${cls}${where.icons ? " om-dl-open-icons" : ""}`);
    button.title = title;
    button.appendChild(el("span", "om-dl-open-icon", icon));
    button.appendChild(el("span", "om-dl-open-text", label));
    button.onclick = onclick;
    return button;
  };

  // Only the entries that ask for a place here, in the table's order.
  const wanted = managerDestinations()
    .filter((one) => one.cls && one.button && one.button())
    .map((one) => make(one.cls, one.icon, one.short || one.label, one.hint, one.open));
  // Inserted against one reference point, so they read left to right in the table's order
  // rather than in the reverse of it.
  for (const button of wanted) {
    if (button) where.host.insertBefore(button, where.before);
  }
  mountMonitor(slot);
  mountRunBar();
  return true;
}

// Rebuild the controls from the settings as they stand now. A switch that does nothing until
// the page is reloaded reads as a switch that does not work.
function remountTopbar() {
  if (!topbarReady) return;
  stopMonitor();
  monitorStrip = null;
  document.querySelectorAll(".om-dl-open, .om-mon, .om-prog").forEach((node) => node.remove());
  runBar.el = null;
  mountTopbar();
}

// --- node properties --------------------------------------------------------------------

// The model URLs a node declares. ComfyUI writes these itself when a template is loaded;
// this is how one is added by hand, so a graph can be shared with its weights named.
function nodeModels(node) {
  const declared = node?.properties?.models;
  return Array.isArray(declared) ? declared : [];
}

async function addModelUrlToNode(node) {
  const { folders } = await modelFolders();
  if (!folders.length) {
    notify("No model folders", "ComfyUI did not report any model folders to save into.");
    return;
  }
  const typed = await askText("Model URL for this node", "", "Check");
  if (!typed) return;
  const answer = await dlPost("/models/check", { url: typed, directory: "" });
  // Everything but the folder is judged first, so a URL that can never work is refused
  // before the reader is asked anything else about it.
  if (!answer.needs_directory) {
    notify("Not added", answer.reason || "That is not a URL this can use.");
    return;
  }
  // The folder is the one thing a URL cannot say, so it is asked rather than guessed.
  const folder = await pickFolder(folders, answer.name);
  if (!folder) return;
  const confirmed = await dlPost("/models/check", {
    url: answer.url, name: answer.name, directory: folder,
  });
  if (!confirmed.ok) {
    notify("Not added", confirmed.reason || "That URL cannot be used.");
    return;
  }
  node.properties = node.properties || {};
  const models = nodeModels(node).filter((item) => item?.url !== confirmed.url);
  models.push({ name: confirmed.name, url: confirmed.url, directory: folder });
  node.properties.models = models;
  app.graph.setDirtyCanvas(true, true);
  toast(`${confirmed.name} added to this node.`, { kind: "ok" });
}

// A folder chosen from the ones this ComfyUI has. Presented as a list rather than typed,
// so the answer is always one the server will accept.
function pickFolder(folders, name) {
  return new Promise((resolve) => {
    const backdrop = el("div", "om-backdrop");
    const box = el("div", "om-note");
    box.appendChild(el("div", "om-note-title", "Which folder?"));
    box.appendChild(factList([["Model", name || "This model"],
                              ["Loaded from", "A ComfyUI model folder"]]));
    const select = el("select", "om-side-select");
    for (const key of folders) {
      const option = el("option", null, key);
      option.value = key;
      select.appendChild(option);
    }
    if (folders.includes("checkpoints")) select.value = "checkpoints";
    box.appendChild(select);
    const foot = el("div", "om-note-foot");
    const cancel = el("button", "om-btn", "Cancel");
    const ok = el("button", "om-btn om-go", "Use this folder");
    cancel.onclick = () => { backdrop.remove(); resolve(""); };
    ok.onclick = () => { const value = select.value; backdrop.remove(); resolve(value); };
    foot.appendChild(cancel);
    foot.appendChild(ok);
    box.appendChild(foot);
    backdrop.appendChild(box);
    document.body.appendChild(backdrop);
    // Dismissing counts as cancelling. Without this the promise is never settled and
    // the caller waits for an answer that cannot arrive -- which is how a guarded
    // action stayed guarded after an Escape and refused to run again.
    closeOn(backdrop, () => { backdrop.remove(); resolve(""); });
  });
}

async function downloadNodeModels(node) {
  const models = nodeModels(node);
  if (!models.length) return;
  const answered = new Map();
  const ready = [];
  for (const declared of models) {
    const answer = await dlPost("/models/check", {
      url: declared.url || "", name: declared.name || "", directory: declared.directory || "",
    });
    if (!answer.ok) {
      notify(`Skipped ${declared.name || declared.url}`, answer.reason || "Not allowed.");
      continue;
    }
    if (!answered.has(answer.owner)) {
      answered.set(answer.owner, await confirmDownloadTrust(
        answer.owner, answer.name, false, formatsOf([answer.name])));
    }
    if (!answered.get(answer.owner)) continue;
    ready.push({
      url: answer.url, name: answer.name, directory: declared.directory, owner: answer.owner,
      hash: declared.hash, hash_type: declared.hash_type, overwrite: !!answer.installed,
    });
  }
  if (!ready.length || !(await confirmDiskRoom(ready))) return;
  let queued = 0;
  for (const model of ready) {
    if (await queueModel(model, { source: `node ${node.type || ""}`.trim(), askTrust: false })) {
      queued += 1;
    }
  }
  if (queued) {
    toast(`Queued ${queued} model${queued === 1 ? "" : "s"}.`, { kind: "ok" });
    if (!floatingPanel("downloads")) openDownloadManager();
  }
}

// --- resource monitor ---------------------------------------------------------------------

//: This viewer, so renewing a lease replaces it rather than stacking another.
const MONITOR_CLIENT = `om-${Math.random().toString(36).slice(2, 10)}`;

let monitorStrip = null;
let monitorTimer = 0;
let monitorListening = false;

function monitorInterval() {
  const asked = Number(panelSetting("openManager.monitorInterval", 2));
  return Number.isFinite(asked) ? Math.max(1, Math.min(10, asked)) : 2;
}

function monitorWants(key) {
  return panelSetting(`openManager.monitor${key}`, true) !== false;
}

function meterText(used, total) {
  if (!total) return "-";
  return `${Math.round((used / total) * 100)}%`;
}

//: Where a temperature sits on the scale a thermostat draws. Below the floor everything looks
//: identical; above the ceiling a card is in trouble whatever the exact figure.
const TEMP_FLOOR = 30;
const TEMP_CEILING = 95;

function tempShare(degrees) {
  const span = TEMP_CEILING - TEMP_FLOOR;
  return Math.max(0, Math.min(100, ((degrees - TEMP_FLOOR) / span) * 100));
}

function tempColour(degrees) {
  if (degrees >= 84) return "#f85149";
  if (degrees >= 70) return "#d29922";
  return "#3fb950";
}

//: How the strip is drawn. `mixed` is the default and the reason the others exist: a share of
//: a total reads naturally as a bar left to right, a temperature reads as a column, and most
//: people want both read the way they read. The single-axis styles are for anyone who would
//: rather have one shape than the right one, and the compact ones trade the separate label
//: for the text sitting on the bar.
const MONITOR_STYLES = [
  "mixed", "mixed-compact", "horizontal", "horizontal-compact", "vertical", "vertical-compact",
];

function monitorStyle() {
  const asked = String(panelSetting("openManager.monitorStyle", "mixed") || "mixed");
  return MONITOR_STYLES.includes(asked) ? asked : "mixed";
}

// How one cell of a given kind should be drawn under the chosen style. `meter` is a share of
// a total, `thermo` is a temperature.
function monitorShape(kind) {
  const style = monitorStyle();
  const compact = style.endsWith("-compact");
  const base = compact ? style.slice(0, -"-compact".length) : style;
  const axis = base === "mixed" ? (kind === "thermo" ? "v" : "h") : base[0];
  return { axis, compact };
}

// One cell. The parts are the same whichever way round it is drawn -- a track, something that
// fills it, a label and a figure -- so the shape is a matter of class names and which way the
// fill grows, not of four separate builders.
function monitorCell(kind, key, label, title) {
  const { axis, compact } = monitorShape(kind);
  const box = el("span",
    `om-mon-cell om-mon-${key} om-mon-${axis}${compact ? " om-mon-compact" : ""}`);
  box.title = title;
  const track = el("span", axis === "v" ? "om-mon-tube" : "om-mon-bar");
  const fill = el("span", "om-mon-fill");
  track.appendChild(fill);
  const name = el("span", "om-mon-label", label);
  const value = el("span", `om-mon-value${kind === "thermo" ? " om-mon-degrees" : ""}`, "-");

  if (compact) {
    // The label and the figure read as one phrase, over the bar or under the column. One
    // element instead of three is the whole point of the compact styles.
    const both = el("span", "om-mon-both");
    both.appendChild(name);
    both.appendChild(value);
    if (axis === "v") { box.appendChild(track); box.appendChild(both); }
    else { box.appendChild(track); box.appendChild(both); }
  } else {
    box.appendChild(name);
    box.appendChild(track);
    box.appendChild(value);
  }
  return { box, fill, value, axis };
}

// A meter: a share of something with a known total.
function monitorMeter(key, label, title) {
  return monitorCell("meter", key, label, title);
}

// A temperature. Drawn as a column by default, because that is how a thermometer reads and
// because it tells the two kinds of figure apart at a glance.
function monitorThermo(label, title) {
  const parts = monitorCell("thermo", "thermo", label, title);
  return { ...parts, mercury: parts.fill };
}

function buildMonitorStrip() {
  const strip = el("div", `om-mon om-mon-style-${monitorStyle()}`);
  strip.title = "Open the Memory panel";
  strip.onclick = () => openMemoryPanel();
  strip._cells = {
    cpu: monitorMeter("cpu", "CPU", "Processor load since the last reading"),
    ram: monitorMeter("ram", "RAM", "System memory in use"),
  };
  strip.appendChild(strip._cells.cpu.box);
  strip.appendChild(strip._cells.ram.box);
  if (!monitorWants("Cpu")) strip._cells.cpu.box.style.display = "none";
  if (!monitorWants("Ram")) strip._cells.ram.box.style.display = "none";
  //: Built from the reading, because how many processors and cards there are is not something
  //: to assume. Rebuilt only when that set changes, not on every tick.
  strip._dynamic = el("span", "om-mon-dynamic");
  strip.appendChild(strip._dynamic);
  strip._shape = "";
  strip._parts = [];
  return strip;
}

// Lay the strip out for the devices this reading describes. One machine has a card, another
// has four and a pair of sockets; the strip is built to match rather than to a fixed guess.
function syncMonitorDevices(reading) {
  const devices = monitorWants("Vram") ? (reading.devices || []) : [];
  const temps = monitorWants("Temp") ? (reading.cpu_temps || []) : [];
  const wantThermo = monitorWants("Temp");
  const shape = JSON.stringify([
    devices.map((one) => [one.index, one.name, "temp" in one]),
    temps.map((one) => one.label),
    wantThermo,
  ]);
  if (monitorStrip._shape === shape) return;
  monitorStrip._shape = shape;
  monitorStrip._parts = [];
  monitorStrip._dynamic.replaceChildren();

  for (const one of temps) {
    const thermo = monitorThermo(one.label.slice(0, 8), `${one.label} temperature`);
    monitorStrip._dynamic.appendChild(thermo.box);
    monitorStrip._parts.push({ kind: "cpu-temp", label: one.label, thermo });
  }
  for (const device of devices) {
    const many = devices.length > 1;
    const label = many ? `VRAM${device.index}` : "VRAM";
    const meter = monitorMeter("vram", label, device.name);
    monitorStrip._dynamic.appendChild(meter.box);
    monitorStrip._parts.push({ kind: "vram", index: device.index, meter });
    if (wantThermo && "temp" in device) {
      const thermo = monitorThermo(many ? `GPU${device.index}` : "GPU",
                                   `${device.name} temperature`);
      monitorStrip._dynamic.appendChild(thermo.box);
      monitorStrip._parts.push({ kind: "gpu-temp", index: device.index, thermo });
    }
  }
}


function paintMonitor(reading) {
  recordReading(reading);
  if (!monitorStrip?.isConnected) return;
  syncMonitorDevices(reading);
  const cells = monitorStrip._cells;
  const fillTo = (parts, share) => {
    const held = `${Math.max(0, Math.min(100, share))}%`;
    if (parts.axis === "v") { parts.fill.style.height = held; parts.fill.style.width = ""; }
    else { parts.fill.style.width = held; parts.fill.style.height = ""; }
  };
  const setMeter = (parts, share, text, title) => {
    parts.value.textContent = text;
    fillTo(parts, share);
    parts.fill.classList.toggle("om-mon-hot", share >= 90);
    if (title) parts.box.title = title;
  };
  const setThermo = (parts, degrees, title) => {
    parts.value.textContent = `${Math.round(degrees)}°`;
    fillTo(parts, tempShare(degrees));
    parts.fill.style.background = tempColour(degrees);
    if (title) parts.box.title = title;
  };

  if (typeof reading.cpu === "number") {
    setMeter(cells.cpu, reading.cpu, `${Math.round(reading.cpu)}%`,
             reading.cores?.length
               ? `${Math.round(reading.cpu)}% across ${reading.cores.length} logical processors`
               : "");
  }
  if (reading.ram?.total) {
    const share = (reading.ram.used / reading.ram.total) * 100;
    setMeter(cells.ram, share, meterText(reading.ram.used, reading.ram.total),
             `${bytesText(reading.ram.used)} of ${bytesText(reading.ram.total)} system memory`);
  }

  const byIndex = new Map((reading.devices || []).map((one) => [one.index, one]));
  for (const part of monitorStrip._parts) {
    if (part.kind === "vram") {
      const device = byIndex.get(part.index);
      if (!device?.total) continue;
      const share = (device.used / device.total) * 100;
      const busy = typeof device.util === "number" ? ` · ${device.util}% busy` : "";
      setMeter(part.meter, share, meterText(device.used, device.total),
               `${bytesText(device.used)} of ${bytesText(device.total)} on ${device.name}${busy}`);
    } else if (part.kind === "gpu-temp") {
      const device = byIndex.get(part.index);
      if (device && typeof device.temp === "number") {
        setThermo(part.thermo, device.temp, `${device.name} at ${device.temp}°C`);
      }
    } else if (part.kind === "cpu-temp") {
      const found = (reading.cpu_temps || []).find((one) => one.label === part.label);
      if (found) setThermo(part.thermo, found.temp, `${found.label} at ${found.temp}°C`);
    }
  }
}

async function renewMonitorLease() {
  if (!monitorStrip?.isConnected) return;
  // A hidden tab is not being read, so it stops asking and the server stops sampling.
  if (document.hidden) return;
  try {
    const answer = await dlPost("/monitor", {
      client: MONITOR_CLIENT, interval: monitorInterval(),
    });
    if (answer?.reading) paintMonitor(answer.reading);
  } catch {
    // The server will drop the lease on its own.
  }
}

function startMonitor() {
  if (!monitorListening) {
    // Registering the type is what makes ComfyUI dispatch it rather than report it as an
    // unknown message, so this goes on before the first push can arrive.
    api.addEventListener("open_manager.monitor", (event) => paintMonitor(event.detail || {}));
    monitorListening = true;
  }
  clearInterval(monitorTimer);
  // Renewed at a third of the lease's life, so one missed call does not drop it.
  monitorTimer = setInterval(renewMonitorLease, Math.max(1000, monitorInterval() * 1000));
  renewMonitorLease();
}

function stopMonitor() {
  clearInterval(monitorTimer);
  monitorTimer = 0;
  dlPost("/monitor", { client: MONITOR_CLIENT, release: true }).catch(() => {});
}

// Where the readout goes, and what it goes in front of.
//
// The control bar is the default because that is where ComfyUI already gathers this sort of
// thing, and where another monitor would be if one were installed -- so the two sit beside
// each other rather than in different corners of the window.
function monitorHost(fallback) {
  if (panelSetting("openManager.monitorPlacement", "control") !== "topbar") {
    // Beside whatever else the control bar is carrying, if anything.
    const beside = document.getElementById("crystools-monitors-root");
    if (beside?.parentElement) return { host: beside.parentElement, before: beside };
    const bar = document.querySelector(".actionbar-container");
    if (bar) {
      const group = bar.querySelector(".flex.gap-2") || bar.firstElementChild || bar;
      return { host: group, before: group.firstChild };
    }
    // No control bar on this interface; the tab strip is the remaining place.
  }
  // Ahead of the account control rather than after it: that button is the end of the strip
  // and nothing should read as sitting past it.
  const tabs = document.querySelector(".workflow-tabs-container.pointer-events-auto");
  const trailing = tabs?.querySelector(".ml-auto");
  if (trailing) return { host: trailing, before: trailing.firstChild };
  return fallback ? { host: fallback, before: fallback.firstChild } : null;
}

// A compact readout, shown when it is switched on and not otherwise.
function mountMonitor(slot) {
  if (panelSetting("openManager.monitor", false) === false) return false;
  if (document.querySelector(".om-mon")) return true;
  const where = monitorHost(slot);
  if (!where) return false;
  monitorStrip = buildMonitorStrip();
  where.host.insertBefore(monitorStrip, where.before);
  startMonitor();
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopMonitor();
    else if (monitorStrip?.isConnected) startMonitor();
  });
  window.addEventListener("pagehide", stopMonitor);
  return true;
}

// --- the run bar --------------------------------------------------------------------------------

//: One run, as it is understood so far. ComfyUI never broadcasts how many nodes a prompt has,
//: so the total is read from the queue once and allowed to grow: an expanding node -- a loop,
//: a subgraph -- creates nodes that were never in the prompt that was submitted.
const runBar = {
  el: null,
  promptId: "",
  total: 0,
  submitted: 0,
  done: new Set(),
  seen: new Set(),
  active: null,
  iteration: 0,
  loopAnchor: null,
  expanded: false,
  error: "",
  //: node id -> class name, read from the queued prompt. The graph can name its own nodes;
  //: a run submitted from the API or another tab is not in this graph at all, and "node 5"
  //: tells the reader nothing.
  types: new Map(),
};

//: The pack's own colours, for a palette that offers nothing but grey. From the project's
//: own mark: blue leads, yellow answers.
const BRAND_BLUE = "#84bbe7";
const BRAND_YELLOW = "#f9f276";

//: A colour at or below this saturation is grey, whatever its hue claims. ComfyUI's stock
//: node colour is a dark grey, and a grey progress bar reads as a disabled one.
const GREY_AT = 22;

function runHex(colour) {
  const text = String(colour || "").trim();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(text);
  if (short) return [1, 2, 3].map((i) => parseInt(short[i] + short[i], 16));
  const full = /^#([0-9a-f]{6})$/i.exec(text);
  if (full) {
    const value = parseInt(full[1], 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  }
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(text);
  if (rgb) {
    const parts = rgb[1].split(",").map((one) => parseFloat(one));
    if (parts.length >= 3 && parts.every((one) => Number.isFinite(one))) return parts.slice(0, 3);
  }
  return null;
}

function runIsGrey(colour) {
  const rgb = runHex(colour);
  if (!rgb) return true;
  return Math.max(...rgb) - Math.min(...rgb) <= GREY_AT;
}

// Lighter for a positive amount, darker for a negative one.
function runShade(colour, amount) {
  const rgb = runHex(colour) || runHex(BRAND_BLUE);
  const moved = rgb.map((one) => (amount >= 0
    ? one + (255 - one) * amount
    : one * (1 + amount)));
  return `rgb(${moved.map((one) => Math.round(Math.max(0, Math.min(255, one)))).join(", ")})`;
}

function runAlpha(colour, alpha) {
  const rgb = runHex(colour) || runHex(BRAND_BLUE);
  return `rgba(${rgb.map((one) => Math.round(one)).join(", ")}, ${alpha})`;
}

// The graph's progress takes the colour a node's header wears in the palette in use, so the
// bar belongs to the theme rather than to us. Where that is grey, the pack's own blue stands
// in: a grey bar reads as one that is not doing anything.
function runMainColour() {
  const header = String(window.LiteGraph?.NODE_DEFAULT_COLOR || "");
  return !runIsGrey(header) ? header : BRAND_BLUE;
}

// The running node's own colour, by the same rules the canvas draws it with, so the block
// filling in is the colour of the node you can see filling it. A run submitted from
// elsewhere is not in this graph, so its class is looked up for a category instead.
function runNodeColour(nodeId, type) {
  let node = null;
  try {
    node = app.graph?.getNodeById?.(Number(nodeId)) || null;
  } catch {
    node = null;
  }
  if (!node && type) {
    const category = window.LiteGraph?.registered_node_types?.[type]?.category || "";
    node = { type, category };
  }
  const tint = node ? nodeTint(node) : "";
  return tint && !runIsGrey(tint) ? tint : BRAND_YELLOW;
}

function buildRunBar() {
  const bar = el("div", "om-prog");
  const track = el("div", "om-prog-track");
  // The node's own progress goes in first, so the graph's progress paints over it rather
  // than beside it: a finished node's block belongs to the graph.
  const sub = el("div", "om-prog-sub");
  const main = el("div", "om-prog-main");
  track.appendChild(sub);
  track.appendChild(main);
  bar.appendChild(track);
  const text = el("div", "om-prog-text", "");
  bar.appendChild(text);
  bar.parts = { track, sub, main, text };
  return bar;
}

// What a node is called, for the readout. The graph knows; the progress message only carries
// ids, and an id on its own tells the reader nothing.
function runNodeLabel(nodeId) {
  const id = String(nodeId);
  try {
    const node = app.graph?.getNodeById?.(Number(id));
    if (node?.title || node?.type) return node.title || node.type;
  } catch {
    // Not in this graph, which is normal for a run submitted from somewhere else.
  }
  return runBar.types.get(id) || `node ${id}`;
}

// How many nodes the prompt has. Read from the queue rather than from this tab's own submit,
// so a run started from the API or another tab is measured too instead of reading "??%".
async function runTotalFor(promptId) {
  try {
    const queue = await (await api.fetchApi("/queue")).json();
    const running = (queue.queue_running || []).find((item) => item?.[1] === promptId);
    const prompt = running?.[2];
    if (!prompt || typeof prompt !== "object") return 0;
    // The same read gives every node's class, which is what the readout should say.
    runBar.types = new Map(Object.entries(prompt)
      .map(([id, node]) => [String(id), String(node?.class_type || "")])
      .filter(([, type]) => type));
    return Object.keys(prompt).length;
  } catch {
    return 0;
  }
}

function runBarReset(promptId) {
  runBar.promptId = promptId || "";
  runBar.total = 0;
  runBar.submitted = 0;
  runBar.done.clear();
  runBar.seen.clear();
  runBar.active = null;
  runBar.iteration = 0;
  runBar.loopAnchor = null;
  runBar.expanded = false;
  runBar.error = "";
  runBar.types = new Map();
}

function paintRunBar() {
  const bar = runBar.el;
  if (!bar?.isConnected) return;
  const { sub, main, text } = bar.parts;
  const total = Math.max(runBar.total, runBar.done.size, 1);
  const finished = Math.min(runBar.done.size, total);
  const share = (finished / total) * 100;
  const slice = 100 / total;

  // Recoloured as it paints rather than fixed when it was built, so switching palette during
  // a run is followed rather than waited out.
  if (!runBar.error) {
    const lead = runMainColour();
    bar.style.setProperty("--om-prog-from", runShade(lead, -0.4));
    bar.style.setProperty("--om-prog-to", lead);
    bar.style.setProperty("--om-prog-cap", runShade(lead, 0.6));
    bar.style.setProperty("--om-prog-glow", runAlpha(lead, 0.85));
    bar.style.setProperty("--om-prog-halo", runAlpha(lead, 0.45));
    // The node's block is the node's own colour, held back a little so the graph's progress
    // stays the brighter of the two and keeps the glow to itself.
    const tint = runBar.active
      ? runNodeColour(runBar.active.id, runBar.types.get(String(runBar.active.id)))
      : BRAND_YELLOW;
    bar.style.setProperty("--om-prog-sub", runShade(tint, -0.42));
  }

  main.style.width = `${share}%`;
  // The node's progress occupies the block it is working through, and no more: a node that
  // is a fifth of the graph cannot advance the bar by more than a fifth however many steps
  // it takes.
  const node = runBar.active;
  const within = node && node.max > 0 ? Math.min(1, node.value / node.max) : 0;
  sub.style.left = `${share}%`;
  sub.style.width = `${node ? Math.min(slice * within, 100 - share) : 0}%`;

  bar.classList.toggle("om-prog-error", !!runBar.error);
  const percent = Math.min(100, Math.round(((finished + within) / total) * 100));
  const parts = [`${percent}%`, `${finished}/${total} nodes`];
  if (runBar.expanded) parts[1] += "+";
  if (runBar.iteration > 1) parts.push(`iteration ${runBar.iteration}`);
  if (node) {
    parts.push(node.max > 1
      ? `${node.label} ${node.value}/${node.max}`
      : node.label);
  }
  if (runBar.error) parts.push(runBar.error);
  text.textContent = parts.join(" · ");
  bar.title = runBar.expanded
    ? "A node expanded into more nodes than the prompt held, so the total grew. The + says so."
    : "Graph progress over the running node's own.";
}

function runBarShow(on) {
  const bar = runBar.el;
  if (!bar) return;
  bar.classList.toggle("om-prog-on", on);
}

// Every reading comes from ComfyUI's own progress messages. `progress_state` carries one
// entry per non-pending node, which is what makes a per-node bar possible at all; the older
// `progress` message only ever describes whichever node happens to be running.
function onProgressState(detail) {
  if (!runBar.el) return;
  const nodes = detail?.nodes || {};
  if (detail?.prompt_id && detail.prompt_id !== runBar.promptId) runBarReset(detail.prompt_id);

  let active = null;
  for (const [id, entry] of Object.entries(nodes)) {
    const state = entry?.state;
    // A node that runs again having already finished is a loop coming round. The first such
    // node anchors the cycle, so the count follows the loop rather than every node in it.
    if (state === "running" && runBar.done.has(id)) {
      runBar.done.delete(id);
      if (runBar.loopAnchor === null) {
        runBar.loopAnchor = id;
        runBar.iteration = 2;
      } else if (id === runBar.loopAnchor) {
        runBar.iteration += 1;
      }
    }
    runBar.seen.add(id);
    if (state === "finished") runBar.done.add(id);
    if (state === "error") runBar.error = `error in ${runNodeLabel(entry.display_node_id || id)}`;
    if (state === "running") {
      active = {
        id,
        value: Number(entry.value) || 0,
        max: Number(entry.max) || 0,
        label: runNodeLabel(entry.display_node_id || entry.real_node_id || id),
      };
    }
  }
  runBar.active = active;
  // Expansion: more nodes have been seen than the prompt was submitted with.
  if (runBar.submitted && runBar.seen.size > runBar.submitted) {
    runBar.expanded = true;
    runBar.total = Math.max(runBar.total, runBar.seen.size);
  }
  paintRunBar();
}

// Where the bar goes. ComfyUI's current layout puts a strip above the header in
// `comfyui-body-top`, and that container carries its own stacking context, so a bar pinned
// to the window behind it is invisible however high its own z-index is. Mounting into the
// container is the only way to share that space rather than fight it. Older layouts have no
// such container, so the bar pins itself to the top of the window there instead.
function runBarHost() {
  const top = document.querySelector(".comfyui-body-top");
  if (top) return { host: top, before: top.firstChild, flow: true };
  return { host: document.body, before: null, flow: false };
}

function mountRunBar() {
  if (panelSetting("openManager.runBar", false) === false) return false;
  if (document.querySelector(".om-prog")) return true;
  const where = runBarHost();
  runBar.el = buildRunBar();
  runBar.el.classList.add(where.flow ? "om-prog-flow" : "om-prog-pinned");
  where.host.insertBefore(runBar.el, where.before);
  paintRunBar();
  return true;
}

function wireRunBar() {
  api.addEventListener("execution_start", async (event) => {
    if (!runBar.el) return;
    runBarReset(event.detail?.prompt_id || "");
    runBarShow(true);
    paintRunBar();
    const total = await runTotalFor(runBar.promptId);
    if (total) {
      runBar.submitted = total;
      runBar.total = Math.max(runBar.total, total);
      paintRunBar();
    }
  });
  // Cached nodes are done before they start. They never reach `progress_state`, so without
  // this a run that reuses most of its graph would sit at nothing until the one new node ran.
  api.addEventListener("execution_cached", (event) => {
    if (!runBar.el) return;
    for (const id of event.detail?.nodes || []) {
      runBar.done.add(String(id));
      runBar.seen.add(String(id));
    }
    paintRunBar();
  });
  api.addEventListener("progress_state", (event) => onProgressState(event.detail));
  api.addEventListener("execution_error", (event) => {
    if (!runBar.el) return;
    runBar.error = String(event.detail?.exception_type || "failed").split(".").pop();
    runBar.active = null;
    paintRunBar();
    setTimeout(() => runBarShow(false), 6000);
  });
  api.addEventListener("execution_success", () => {
    if (!runBar.el) return;
    runBar.active = null;
    if (runBar.total) runBar.done = new Set([...runBar.seen]);
    paintRunBar();
    setTimeout(() => { if (!runBar.active) runBarShow(false); }, 1400);
  });
  // Anything that ends a run without saying so, including an interrupt.
  api.addEventListener("executing", (event) => {
    if (!runBar.el) return;
    if (event.detail?.node == null && event.detail !== null) return;
    if (event.detail === null || event.detail?.node === null) {
      runBar.active = null;
      paintRunBar();
      setTimeout(() => { if (!runBar.active) runBarShow(false); }, 1400);
    }
  });
}

// --- memory panel ------------------------------------------------------------------------------

//: Readings kept for the graphs. At one a second this is four minutes of history, which is
//: enough to see a model load and not enough to be worth storing anywhere.
const MEMORY_HISTORY = 240;

//: Kept whether or not the panel is open, so opening it shows a graph rather than a blank
//: box waiting to fill.
const memoryHistory = { cpu: [], ram: [], vram: [] };

//: The panel asks for readings on its own lease, so it can have them faster than the strip
//: without changing what the strip asked for.
const MEMORY_CLIENT = `${MONITOR_CLIENT}-panel`;

function recordReading(reading) {
  const push = (key, value) => {
    if (typeof value !== "number" || Number.isNaN(value)) return;
    const series = memoryHistory[key];
    series.push(value);
    if (series.length > MEMORY_HISTORY) series.shift();
  };
  push("cpu", reading.cpu);
  if (reading.ram?.total) push("ram", (reading.ram.used / reading.ram.total) * 100);
  if (reading.vram?.total) push("vram", (reading.vram.used / reading.vram.total) * 100);
}

// A filled line of recent history, drawn the way a resource monitor draws one: newest at the
// right, the scale fixed at nought to a hundred so two graphs can be compared by eye.
function drawGraph(canvas, series, colour) {
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || 260;
  const height = canvas.clientHeight || 54;
  if (canvas.width !== width * ratio || canvas.height !== height * ratio) {
    canvas.width = width * ratio;
    canvas.height = height * ratio;
  }
  const pen = canvas.getContext("2d");
  pen.setTransform(ratio, 0, 0, ratio, 0, 0);
  pen.clearRect(0, 0, width, height);

  const style = getComputedStyle(canvas);
  pen.strokeStyle = style.getPropertyValue("--om-border") || "#30363d";
  pen.lineWidth = 1;
  for (let line = 1; line < 4; line += 1) {
    const y = (height / 4) * line;
    pen.beginPath();
    pen.moveTo(0, y + 0.5);
    pen.lineTo(width, y + 0.5);
    pen.stroke();
  }
  if (!series.length) return;

  const step = width / (MEMORY_HISTORY - 1);
  const at = (index) => ({
    x: width - (series.length - 1 - index) * step,
    y: height - (Math.max(0, Math.min(100, series[index])) / 100) * height,
  });
  pen.beginPath();
  pen.moveTo(at(0).x, height);
  for (let index = 0; index < series.length; index += 1) {
    const point = at(index);
    pen.lineTo(point.x, point.y);
  }
  pen.lineTo(at(series.length - 1).x, height);
  pen.closePath();
  pen.fillStyle = `${colour}33`;
  pen.fill();

  pen.beginPath();
  for (let index = 0; index < series.length; index += 1) {
    const point = at(index);
    if (index === 0) pen.moveTo(point.x, point.y);
    else pen.lineTo(point.x, point.y);
  }
  pen.strokeStyle = colour;
  pen.lineWidth = 1.5;
  pen.stroke();
}

// A header bar, a graph that runs the full width beneath it, and a line of figures. The bars
// are what separate one reading from the next, so the graphs need no frame of their own.
function memoryBar(label) {
  const bar = el("div", "om-mem-bar");
  bar.appendChild(el("span", "om-mem-bar-label", label));
  const value = el("span", "om-mem-bar-value", "");
  bar.appendChild(value);
  return { bar, value };
}

function buildGraphBlock(key, label, colour) {
  const box = el("div", "om-mem-graph");
  const head = memoryBar(label);
  head.value.textContent = "-";
  // The bar is the control: a graph nobody is watching folds away and gives its height to the
  // ones that are, and the reading stays on the bar so it is still legible while folded.
  head.bar.classList.add("om-mem-bar-toggle");
  const chevron = el("span", "om-mem-bar-fold", "▾");
  head.bar.insertBefore(chevron, head.bar.firstChild);
  box.appendChild(head.bar);
  const canvas = el("canvas", "om-mem-canvas");
  box.appendChild(canvas);
  const detail = el("div", "om-mem-graph-detail", "");
  box.appendChild(detail);

  const setFolded = (folded) => {
    box.classList.toggle("om-mem-folded", folded);
    chevron.textContent = folded ? "▸" : "▾";
    head.bar.title = folded ? `Show the ${label} graph` : `Hide the ${label} graph`;
    dlRemember(`om-mem-fold-${key}`, folded ? "1" : "0");
  };
  head.bar.onclick = () => setFolded(!box.classList.contains("om-mem-folded"));
  setFolded(dlRecall(`om-mem-fold-${key}`, "0") === "1");

  return { box, canvas, value: head.value, detail, key, colour,
           folded: () => box.classList.contains("om-mem-folded") };
}

//: Colours for the map, in the order the devices are reported: the one holding most of the
//: model first. A device is a colour rather than a label so a long resident stretch reads as
//: one band.
const BLOCK_COLOURS = ["#a371f7", "#3fb950", "#58a6ff", "#d29922", "#db61a2", "#39c5cf"];

function keyItem(device, seat) {
  const item = el("span", "om-mem-key-item");
  const swatch = el("span", "om-mem-swatch");
  swatch.style.background = blockColour(seat);
  item.appendChild(swatch);
  item.appendChild(el("span", null, `${device.device} · ${bytesText(device.bytes)}`));
  return item;
}

function blockColour(seat) {
  return seat < 0 ? "transparent" : BLOCK_COLOURS[seat % BLOCK_COLOURS.length];
}

//: How large a square wants to be, and the space between them. The real size is worked out
//: from these so the squares divide the width exactly.
const BLOCK_CELL = 7;
const BLOCK_GAP = 1;

// Squares laid out to fill the width exactly, rather than wrapped and left ragged.
//
// Drawn rather than built from elements. Flex wrapping divides a row by whole squares and
// leaves whatever does not fit as a gap at the end, so every row ends in a different place
// and the map looks like it has holes in it. Working out the size from the width instead
// means the columns always come out even, and a map costs one node rather than hundreds.
function paintBlockMap(canvas, cells) {
  const width = canvas.clientWidth;
  if (!width || !cells.length) return;
  const columns = Math.max(1, Math.floor((width + BLOCK_GAP) / (BLOCK_CELL + BLOCK_GAP)));
  const size = (width - (columns - 1) * BLOCK_GAP) / columns;
  const rows = Math.ceil(cells.length / columns);
  const height = Math.round(rows * size + (rows - 1) * BLOCK_GAP);

  const ratio = window.devicePixelRatio || 1;
  canvas.style.height = `${height}px`;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const pen = canvas.getContext("2d");
  pen.setTransform(ratio, 0, 0, ratio, 0, 0);
  pen.clearRect(0, 0, width, height);

  cells.forEach((seat, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    pen.fillStyle = blockColour(seat);
    pen.fillRect(column * (size + BLOCK_GAP), row * (size + BLOCK_GAP), size, size);
  });
}

// Where each part of a model sits, drawn the way a disk map is drawn: one square per stretch
// of the model, in the order the model is written, coloured by the device holding it.
function buildBlockMap(map) {
  const box = el("div", "om-mem-map");
  // The frame carries the border and the padding. A canvas measured with padding on it
  // reports a width it does not draw into, and the map comes out stretched.
  const frame = el("div", "om-mem-grid-frame");
  const canvas = el("canvas", "om-mem-grid");
  frame.appendChild(canvas);
  box.appendChild(frame);
  let cells = map.cells || [];
  const draw = () => paintBlockMap(canvas, cells);
  // Its width is not settled when it is built and changes with the window, so the element is
  // watched rather than the drawing being timed to guesses about layout.
  const watcher = new ResizeObserver(draw);
  watcher.observe(canvas);
  box._redraw = draw;

  const key = el("div", "om-mem-key");
  for (const [seat, device] of (map.devices || []).entries()) {
    key.appendChild(keyItem(device, seat));
  }
  // Named for what was actually counted. The page figures are coarser than the byte figure on
  // the row above, and saying which is which stops the two looking like a contradiction.
  const note = el("span", "om-mem-key-note", `${map.modules} ${map.unit || "blocks"}`);
  note.title = map.source === "pages"
    ? "Read from the streaming library, a page at a time, so the shares here step in whole "
      + "pages and differ slightly from the byte figure above."
    : "Read from the model's own modules.";
  key.appendChild(note);
  box.appendChild(key);

  // Repainting the same canvas and rewriting the key is what keeps a map that changes every
  // few seconds from flashing.
  return {
    el: box,
    update: (next) => {
      cells = next.cells || [];
      draw();
      note.textContent = `${next.modules} ${next.unit || "blocks"}`;
      const items = [...key.querySelectorAll(".om-mem-key-item")];
      const devices = next.devices || [];
      if (items.length !== devices.length) {
        key.replaceChildren(...devices.map((device, seat) => keyItem(device, seat)), note);
      } else {
        devices.forEach((device, seat) => {
          items[seat].lastChild.textContent = `${device.device} · ${bytesText(device.bytes)}`;
          items[seat].firstChild.style.background = blockColour(seat);
        });
      }
    },
  };
}

// Every map in the panel, redrawn at the width it now has.
function repaintBlockMaps(root) {
  for (const map of root.querySelectorAll(".om-mem-map")) map._redraw?.();
}

// A model ComfyUI is holding, and where its weights are.
// A model ComfyUI is holding. Built once and then kept up to date: these figures change every
// few seconds, and a row rebuilt on every reading is a row that blinks.
function buildMemoryModelRow(model, refresh) {
  const row = el("div", "om-mem-model");

  const top = el("div", "om-dl-top");
  const name = el("span", "om-dl-name", model.name);
  const size = el("span", "om-lib-size", bytesText(model.total));
  top.appendChild(name);
  top.appendChild(size);
  // One model at a time, and only while the queue is idle -- the server refuses otherwise
  // rather than pulling weights out from under a sampler.
  const drop = el("button", "om-btn om-mem-drop", "Unload");
  drop.title = "Unload this model and its clones. ComfyUI loads it again when a prompt needs "
    + "it. Refused while a prompt is running.";
  drop.onclick = async () => {
    // Asked for the same reason the two freeing buttons are: this hands memory back without
    // looking at what is holding it. The one guard that does exist is named rather than
    // relied on silently.
    const go = await chooseAction(`Unload ${row._name}?`,
      `This unloads ${row._name} regardless of what is holding it.`,
      [{ key: "go", label: "Unload", primary: true }],
      { wide: true, facts: [
        ["Frees", bytesText(row._total || 0)],
        ["Also unloads", "Any clone of this model, meaning a second copy made for another device"],
        ["Costs", "The next prompt that needs it loads it again"],
        ["While a prompt is running", "Refused, rather than pulling weights out from under it"],
      ] });
    if (!go) return;
    drop.disabled = true;
    let answer;
    try {
      answer = await dlPost("/monitor/unload", { id: row._id, name: row._name });
    } catch (error) {
      answer = { ok: false, reason: error.message };
    }
    drop.disabled = false;
    if (!answer?.ok) {
      notify("Not unloaded", answer?.reason || "ComfyUI would not unload it.");
      return;
    }
    toast(`${answer.name || row._name} unloaded${answer.freed ? `, ${bytesText(answer.freed)} freed` : ""}.`,
          { kind: "ok" });
    refresh?.();
  };
  top.appendChild(drop);
  row.appendChild(top);

  const bar = el("div", "om-mem-split");
  const resident = el("div", "om-mem-resident");
  bar.appendChild(resident);
  row.appendChild(bar);

  const meta = el("div", "om-dl-where");
  row.appendChild(meta);

  const slot = el("div", "om-mem-map-slot");
  row.appendChild(slot);

  //: The map is drawn into the same canvas each time, so it changes rather than flashing.
  let drawn = null;

  const tell = (model) => {
    name.textContent = model.name;
    size.textContent = bytesText(model.total);
    // Identity rather than position: the list is sorted by size and shifts as models come
    // and go, so the button has to say which model it meant.
    row._id = model.id;
    row._name = model.name;
    row._total = model.total;
    resident.style.width = `${Math.max(0, Math.min(100, model.share))}%`;
    resident.title = `${bytesText(model.resident)} on ${model.device}`;

    // The tags are a short list that changes shape, so they are rewritten; the parts that
    // move continuously are not.
    const tags = [model.device, `${bytesText(model.resident)} resident`];
    if (model.offloaded) tags.push(`${bytesText(model.offloaded)} offloaded`);
    if (model.in_use) tags.push("in use");
    if (model.pins?.pinned_bytes) tags.push(`${bytesText(model.pins.pinned_bytes)} pinned`);
    const parts = tags.map((text, index) =>
      el("span", index ? "om-dl-src" : null, text));
    if (model.streaming) {
      // "Streaming" on its own says nothing. What streams is the model's own weights, block
      // by block, so the tag says that and the map below shows which blocks are where.
      const tag = el("span", "om-dl-src om-mem-stream", "weights stream in blocks");
      tag.title = "This model's weights move between host and device while it runs, a block "
        + "at a time, so what is resident changes as it works.";
      parts.splice(model.offloaded ? 3 : 2, 0, tag);
    }
    if (model.pins?.failed) parts.push(el("span", "om-dl-src om-dl-bad", "pinning failed"));
    meta.replaceChildren(...parts);

    // Asked for per model, because walking one is cheap and walking every one is not.
    libGet(`/monitor/blocks?index=${model.index}&cells=240`)
      .then((found) => {
        if (!slot.isConnected) return;
        if (!found?.ok) {
          drawn = null;
          slot.replaceChildren(el("div", "om-dl-note", found?.reason || "No block map."));
          return;
        }
        if (drawn) drawn.update(found);
        else {
          drawn = buildBlockMap(found);
          slot.replaceChildren(drawn.el);
        }
      })
      .catch(() => {});
  };

  tell(model);
  row._update = tell;
  return row;
}

// What the machine is doing, at more length than the strip can show.
//: What the light can say, and how it says it. The wording is the server's, because the
//: server is what can tell a slow node from a stalled one; this only decides the colour.
const ACTIVITY_LOOK = {
  working: { title: "Working" },
  stalling: { title: "Potential memory stall" },
  stalled: { title: "Memory stalled" },
  oom: { title: "Out of memory" },
  idle: { title: "Idle" },
};

// A light in the panel's header. Green while there is work going through, amber where the
// card has gone quiet with memory full, red after an out-of-memory failure, grey when
// nothing is running. The reasoning is on the hover, because a colour on its own is a
// thing to worry about rather than something to act on.
function buildActivityOrb() {
  const orb = el("span", "om-orb om-orb-idle");
  orb.setAttribute("role", "img");
  orb.tell = (activity) => {
    const state = ACTIVITY_LOOK[activity?.state] ? activity.state : "idle";
    if (orb._state !== state) {
      orb._state = state;
      orb.className = `om-orb om-orb-${state}`;
    }
    const label = activity?.label || ACTIVITY_LOOK[state].title;
    const detail = activity?.detail || "";
    orb.title = detail ? `${label}\n${detail}` : label;
    orb.setAttribute("aria-label", label);
  };
  orb.tell(null);
  return orb;
}

function openMemoryPanel() {
  if (floatingPanel("memory")) { closeFloatingPanel("memory"); return null; }

  //: The most recent reading, read by the toolbar and the light as well as the graphs.
  let latest = null;
  const panel = createFloatingPanel({
    key: "memory", title: "Memory", ...windowSize("memory"),
    modal: !asWindow("memory"),
    onClose: () => {
      clearInterval(panel._tick);
      dlPost("/monitor", { client: MEMORY_CLIENT, release: true }).catch(() => {});
    },
  });
  const summary = el("div", "om-dl-summary", "");
  panel.bar.querySelector(".om-float-badge").appendChild(summary);

  // The light sits at the right of the bar, just inside the close button.
  const orb = buildActivityOrb();
  panel.bar.insertBefore(orb, panel.bar.querySelector(".om-float-close"));

  // Freeing memory is ComfyUI's own operation, handed to the thread that owns the models.
  // Always asked about, because it does not check what is using the memory first: there is
  // no version of this that is safe to fire by accident, and a button that usually asks is
  // a button whose confirmation stops being read.
  const freeing = async (what) => {
    const running = latest?.activity?.state && latest.activity.state !== "idle";
    const facts = [...what.facts];
    if (running) {
      facts.push(["Running right now", latest.activity.detail || "A prompt is going through."]);
    }
    const go = await chooseAction(what.ask, what.warning,
      [{ key: "go", label: what.action, primary: true }], { wide: true, facts });
    if (!go) return;
    const answer = await dlPost("/monitor/free", what.body);
    if (!answer?.ok) {
      notify("Not freed", answer?.reason || "ComfyUI would not take the request.");
      return;
    }
    toast(answer.did || "Asked ComfyUI to free memory.", { kind: "ok" });
    setTimeout(() => loadModels(), 1200);
  };

  // Anchored under the header rather than in it: these two act on the machine, and they
  // belong with the figures they act on rather than beside the close button.
  const tools = panel.tools;
  const clearVram = el("button", "om-btn om-dl-btn", "Clear VRAM");
  clearVram.title = "Unload every model on the card. They load again when a prompt needs them.";
  clearVram.onclick = () => freeing({
    ask: "Clear VRAM?",
    warning: "This clears VRAM regardless of what is using it.",
    action: "Clear VRAM",
    body: { vram: true },
    facts: [
      ["Unloads", "Every model ComfyUI is holding, in use or not"],
      ["A run in progress", "May fail, or stall while it loads what it needs again"],
      ["Keeps", "The cached results of the last run"],
    ],
  });
  tools.appendChild(clearVram);

  const clearRam = el("button", "om-btn om-dl-btn", "Clear RAM");
  clearRam.title = "Clear the cached results of the last run. ComfyUI unloads the models "
    + "with them, because the cached results hold on to them.";
  clearRam.onclick = () => freeing({
    ask: "Clear RAM?",
    warning: "This clears RAM regardless of what is using it, and takes the models with it.",
    action: "Clear RAM",
    body: { ram: true },
    facts: [
      ["Clears", "The cached results of the last run, in use or not"],
      ["Also unloads", "Every model. ComfyUI frees the two together, in that direction"],
      ["A run in progress", "May fail, or repeat work it had kept"],
    ],
  });
  tools.appendChild(clearRam);

  const body = el("div", "om-dl-body om-mem-body");
  const graphs = [
    buildGraphBlock("cpu", "CPU", "#58a6ff"),
    buildGraphBlock("ram", "System memory", "#3fb950"),
    buildGraphBlock("vram", "Graphics memory", "#a371f7"),
  ];
  for (const one of graphs) body.appendChild(one.box);

  body.appendChild(memoryBar("Models held").bar);
  const modelList = el("div", "om-dl-list om-mem-models");
  body.appendChild(modelList);
  panel.body.appendChild(body);

  const paint = () => {
    if (!panel.el.isConnected) return;
    for (const one of graphs) {
      const series = memoryHistory[one.key];
      if (!one.folded()) drawGraph(one.canvas, series, one.colour);
      one.value.textContent = series.length ? `${Math.round(series[series.length - 1])}%` : "-";
    }
    if (!latest) return;
    if (latest.ram?.total) {
      graphs[1].detail.textContent =
        `${bytesText(latest.ram.used)} of ${bytesText(latest.ram.total)} · ${bytesText(latest.ram.free)} free`;
    }
    if (latest.vram?.total) {
      const busy = typeof latest.vram.util === "number" ? ` · ${latest.vram.util}% busy` : "";
      const hot = typeof latest.vram.temp === "number" ? ` · ${latest.vram.temp}°C` : "";
      // The graph follows the first device; the rest are named rather than left out, so a
      // machine with four cards does not look like a machine with one.
      const others = (latest.devices || []).slice(1)
        .map((one) => `GPU${one.index} ${meterText(one.used, one.total)}`
                      + (typeof one.temp === "number" ? ` ${one.temp}°` : ""))
        .join(" · ");
      graphs[2].detail.textContent =
        `${bytesText(latest.vram.used)} of ${bytesText(latest.vram.total)}${busy}${hot} · ${latest.vram.name}`
        + (others ? `. Also ${others}` : "");
    }
    orb.tell(latest.activity);
    // A line worth reading, which also means every graph block is the same height.
    const cores = latest.cores?.length;
    const hottest = (latest.cpu_temps || [])[0];
    graphs[0].detail.textContent = [
      cores ? `${cores} logical processors` : "",
      cores ? `busiest ${Math.round(Math.max(...latest.cores))}%` : "",
      hottest ? `${hottest.label} ${hottest.temp}°C` : "",
    ].filter(Boolean).join(" · ");
  };

  panel.el.addEventListener("om-float-resize", () => { paint(); repaintBlockMaps(panel.el); });

  // Readings arrive on the same channel the strip listens to, so the panel just watches.
  const onReading = (event) => {
    latest = event.detail || {};
    recordReading(latest);
    paint();
  };
  api.addEventListener("open_manager.monitor", onReading);

  async function loadModels() {
    if (!panel.el.isConnected) return;
    let found;
    try {
      found = await (await api.fetchApi(`${API}/monitor/models`)).json();
    } catch {
      return;
    }
    if (!panel.el.isConnected) return;
    const rows = found.models || [];
    const totals = found.totals || {};
    summary.textContent = rows.length
      ? `${rows.length} held · ${bytesText(totals.resident || 0)} resident of ${bytesText(totals.total || 0)}`
      : "";
    if (!rows.length) {
      modelList._shape = "";
      const empty = el("div", "om-mem-empty", "No managed models in memory");
      empty.title = "ComfyUI loads a model when a prompt needs it and keeps it until the "
        + "memory is wanted for something else.";
      modelList.replaceChildren(empty);
      return;
    }
    // Rebuilt only when the set of models changes; otherwise every row is told the new
    // figures and keeps its own elements.
    const shape = rows.map((one) => one.name).join("|");
    if (modelList._shape !== shape) {
      modelList._shape = shape;
      modelList.replaceChildren(...rows.map((one, position) =>
        buildMemoryModelRow({ ...one, index: position }, loadModels)));
    } else {
      const built = [...modelList.children];
      rows.forEach((one, position) =>
        built[position]?._update?.({ ...one, index: position }));
    }
  }

  // Its own lease, asked for faster than the strip so the graphs move smoothly. The server
  // samples at whichever of the two is quicker and stops when both are gone.
  const renew = () => {
    if (!panel.el.isConnected) return;
    dlPost("/monitor", { client: MEMORY_CLIENT, interval: 1 })
      .then((answer) => { if (answer?.reading) { latest = answer.reading; recordReading(latest); paint(); } })
      .catch(() => {});
  };
  panel._tick = setInterval(() => { renew(); loadModels(); }, 3000);
  renew();
  loadModels();
  paint();

  // The listener outlives nothing: when the panel goes, so does it.
  const stopWatching = () => {
    if (panel.el.isConnected) return;
    api.removeEventListener("open_manager.monitor", onReading);
    clearInterval(watcher);
  };
  const watcher = setInterval(stopWatching, 2000);
  return panel;
}

// --- model library ---------------------------------------------------------------------------

//: Rows built at once. A library of tens of thousands is a real shape, and a panel that
//: tries to draw all of it stops responding.
const LIB_MAX_ROWS = 300;

//: Read once per panel session. Walking is cheap; asking for it on a timer is not.
let libIndex = null;
let libRefs = null;
let libDupes = null;
let libStorage = null;

async function libGet(path) {
  return (await api.fetchApi(`${API}${path}`)).json();
}

async function libPost(path, body) {
  const answer = await api.fetchApi(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  return answer.json();
}

//: What the library shows. Each tab answers a different question of the same files, so a file
//: can appear under more than one.
const LIB_TABS = [
  { key: "all", title: "All",
    empty: "No model files found in the registered folders." },
  { key: "duplicates", title: "Duplicates",
    empty: "No file is held in more than one place." },
  { key: "unreferenced", title: "No reference found",
    empty: "Every model is referenced by a workflow." },
  { key: "absent", title: "Not downloaded",
    empty: "Every model a workflow asks for is on disk." },
  { key: "storage", title: "Storage",
    empty: "Nothing indexed yet." },
];

function libFolderOf(path) {
  return dirOf(path);
}

// One file on disk.
function buildLibraryRow(file, refresh, { note = "" } = {}) {
  const row = el("div", "om-lib-row");

  const top = el("div", "om-dl-top");
  top.appendChild(el("span", "om-dl-name", file.name));
  top.appendChild(el("span", "om-lib-size", bytesText(file.size)));
  row.appendChild(top);

  const where = el("div", "om-dl-where");
  where.appendChild(el("span", null, file.directory));
  const place = el("span", "om-dl-src", libFolderOf(file.path));
  place.title = file.path;
  where.appendChild(place);
  if (file.mtime) where.appendChild(el("span", "om-dl-src", sinceText(file.mtime)));
  row.appendChild(where);

  if (note) row.appendChild(el("div", "om-dl-note", note));

  const foot = el("div", "om-dl-foot");
  const digest = el("span", "om-dl-size", file.sha256 ? `SHA256 ${file.sha256}` : "");
  foot.appendChild(digest);
  const acts = el("span", "om-dl-acts");
  const manage = el("button", "om-btn om-dl-btn om-caret", "Manage ▾");
  manage.onclick = (event) => {
    event.stopPropagation();
    openRowMenu(manage, { items: libraryMenu(file, digest, refresh), align: "right" });
  };
  acts.appendChild(manage);
  foot.appendChild(acts);
  row.appendChild(foot);
  return row;
}

// What one file on disk offers. Deletion is per file and confirmed; there is no action here
// that acts on more than the row it was opened from.
// Whether the library may read a file's contents. Off, it still describes what is on disk --
// names, sizes, folders, what no workflow references -- and never opens one. On a library
// that lives on a network share or a metered disk, an invitation to read 891 GB is not a
// convenience, so the invitation is what goes away rather than the answer being refused
// after it is accepted.
function mayHash() {
  return panelSetting("openManager.hashOnDemand", true) !== false;
}

function libraryMenu(file, digest, refresh) {
  if (!mayHash()) {
    return [
      { label: "Where it came from", fn: () => showProvenance(file) },
      { label: "Copy path", fn: () => {
          navigator.clipboard?.writeText(file.path)
            .then(() => toast("Path copied.", { kind: "ok" }))
            .catch(() => notify("Not copied", "The clipboard is not available here."));
        } },
      { label: "Delete file", danger: true, fn: () => confirmLibraryDelete(file, refresh) },
    ];
  }
  return [
    { label: file.sha256 ? "Re-hash" : "Hash", fn: async () => {
        const note = toast(`Hashing ${file.name}...`, { sticky: true });
        const answer = await libPost("/library/hash", { path: file.path, force: !!file.sha256 });
        note.remove();
        if (!answer.ok) { notify("Not hashed", answer.reason || "The file could not be read."); return; }
        file.sha256 = answer.sha256;
        digest.textContent = `SHA256 ${answer.sha256}`;
        toast("Hashed.", { kind: "ok" });
      } },
    { label: "Where it came from", fn: () => showProvenance(file) },
    { label: "Copy path", fn: () => {
        navigator.clipboard?.writeText(file.path)
          .then(() => toast("Path copied.", { kind: "ok" }))
          .catch(() => notify("Not copied", "The clipboard is not available here."));
      } },
    { label: "Copy hash", fn: async () => {
        const value = file.sha256 || (await libPost("/library/hash", { path: file.path })).sha256;
        if (!value) { notify("No hash", "The file could not be read."); return; }
        file.sha256 = value;
        digest.textContent = `SHA256 ${value}`;
        navigator.clipboard?.writeText(value)
          .then(() => toast("Hash copied.", { kind: "ok" }))
          .catch(() => notify("Not copied", "The clipboard is not available here."));
      } },
    { label: "Delete file", danger: true, fn: () => confirmLibraryDelete(file, refresh) },
  ];
}

// Deleting one model, asked for the same way whichever menu it was reached from.
async function confirmLibraryDelete(file, refresh) {
  const go = await chooseAction(`Delete ${file.name}?`, "",
    [{ key: "go", label: "Delete file", primary: true }],
    { wide: true, facts: [
      ["File", file.path],
      ["Folder", file.directory],
      ["Size", bytesText(file.size)],
      ["Recoverable", "No. This removes it from disk."],
    ] });
  if (!go) return;
  const answer = await libPost("/library/delete", { path: file.path });
  if (answer.ok) { toast(`${file.name} deleted.`, { kind: "ok" }); refresh(true); }
  else notify("Not deleted", answer.reason || "The file could not be deleted.");
}

// What is recorded about one model: the download that wrote it, a hash if one has been
// taken, and the workflows naming it. A model copied in by hand has none of that, and saying
// so is the useful answer -- it is how you tell a file you fetched from one you inherited.
async function showProvenance(file) {
  const note = toast("Looking...", { sticky: true });
  let found;
  try {
    found = await libPost("/library/provenance", { path: file.path });
  } finally {
    note.remove();
  }
  if (!found?.ok) {
    notify("Nothing to show", found?.reason || "That file could not be read.");
    return;
  }
  const facts = [
    ["File", found.name],
    ["Where", found.path],
    ["Size", bytesText(found.size)],
    ["Last changed", found.modified ? sinceText(found.modified) : ""],
  ];
  const from = found.download || {};
  if (from.url) {
    facts.push(["Downloaded", from.at ? sinceText(from.at) : "by the Download Manager"]);
    facts.push(["From", from.url]);
    if (from.owner) facts.push(["Account", from.owner]);
    if (from.source) facts.push(["Added", from.source]);
    if (from.hash) facts.push([`Expected ${(from.hash_type || "sha256").toUpperCase()}`, from.hash]);
  } else {
    facts.push(["Downloaded", "Not by Open Manager. Nothing here fetched this file."]);
  }
  facts.push(["SHA256", found.sha256 || "Not taken yet - use Hash on this row"]);
  const used = found.workflows || [];
  facts.push([
    "Used by",
    used.length ? used.slice(0, 12).join(", ") + (used.length > 12 ? ` and ${used.length - 12} more` : "")
                : `No saved workflow names it (${found.searched} searched)`,
  ]);
  await chooseAction(`Where ${found.name} came from`, "", [], { wide: true, facts });
}

// What the saved workflows ask for, cannot find, and recorded a source for. Selectable and
// queueable in one go, through the same trust prompt, disk check and queue a download from
// anywhere else goes through -- there is no second path to the network here.
function buildWantedSection(entries, refresh) {
  const parts = [];
  const workflows = new Set(entries.flatMap((one) => one.workflows));
  const lead = el("div", "om-lib-lead");
  lead.textContent =
    `${entries.length} model${entries.length === 1 ? "" : "s"} that `
    + `${workflows.size === 1 ? "a saved workflow asks" : `${workflows.size} saved workflows ask`}`
    + " for and cannot find. Each one records where it came from, so it can be fetched.";
  parts.push(lead);

  const boxes = new Map();
  const bar = el("div", "om-lib-actions");
  const summary = el("span", "om-dl-summary", "");
  const all = el("button", "om-btn", "Select none");
  const go = el("button", "om-btn om-go", "Download");
  const picked = () => entries.filter((_, index) => boxes.get(index)?.checked);
  const retally = () => {
    const chosen = picked();
    summary.textContent = chosen.length
      ? `${chosen.length} of ${entries.length} selected`
      : "Nothing selected";
    go.disabled = !chosen.length;
    all.textContent = chosen.length === entries.length ? "Select none" : "Select all";
  };
  all.onclick = () => {
    const turnOn = picked().length !== entries.length;
    for (const box of boxes.values()) box.checked = turnOn;
    retally();
  };
  go.onclick = async () => {
    const chosen = picked();
    if (!chosen.length) return;
    go.disabled = true;
    try {
      await fetchWanted(chosen, refresh);
    } finally {
      go.disabled = false;
      retally();
    }
  };
  bar.appendChild(summary);
  bar.appendChild(all);
  bar.appendChild(go);
  parts.push(bar);

  entries.forEach((entry, index) => {
    const row = el("label", "om-dl-model");
    const box = el("input", "om-dl-check");
    box.type = "checkbox";
    box.checked = true;
    box.onchange = retally;
    boxes.set(index, box);
    row.appendChild(box);

    const text = el("div", "om-dl-modeltext");
    text.appendChild(el("div", "om-dl-name", entry.model.name));
    const meta = el("div", "om-dl-where");
    meta.appendChild(el("span", null, entry.model.directory || "?"));
    if (entry.model.owner) meta.appendChild(el("span", "om-dl-owner", entry.model.owner));
    text.appendChild(meta);
    // Which workflows are waiting on it. The names are the answer to "why do I need this",
    // so the first few are shown rather than only a count.
    const asked = el("div", "om-dl-note",
      `Wanted by ${entry.workflows.slice(0, 3).join(", ")}`
      + (entry.workflows.length > 3 ? ` and ${entry.workflows.length - 3} more` : ""));
    asked.title = entry.workflows.join("\n");
    text.appendChild(asked);
    row.appendChild(text);
    parts.push(row);
  });

  retally();
  return parts;
}

// Queue what was selected: one trust question per account, one disk question for the batch,
// then the queue. The same three steps the workflow picker takes, because they are the same
// three questions however the model was found.
async function fetchWanted(entries, refresh) {
  const answered = new Map();
  const perOwner = new Map();
  for (const entry of entries) {
    if (!perOwner.has(entry.model.owner)) perOwner.set(entry.model.owner, []);
    perOwner.get(entry.model.owner).push(entry.model.name);
  }
  const ready = [];
  const skipped = [];
  for (const entry of entries) {
    const owner = entry.model.owner;
    if (!answered.has(owner)) {
      const names = perOwner.get(owner) || [entry.model.name];
      answered.set(owner, await confirmDownloadTrust(
        owner,
        names.length === 1 ? names[0] : `${names.length} models your workflows ask for`,
        names.length !== 1,
        formatsOf(names)));
    }
    if (!answered.get(owner)) { skipped.push(entry.model.name); continue; }
    ready.push({
      url: entry.model.url, name: entry.model.name, directory: entry.model.directory,
      owner, hash: entry.model.hash, hash_type: entry.model.hash_type,
    });
  }
  // Trust is per account, so declining one leaves the rest of a mixed batch going ahead.
  // That is the intent, but it is a surprise if nothing says so: the dialog that was just
  // refused named one account, not the batch.
  if (skipped.length) {
    toast(`Skipped ${skipped.length} model${skipped.length === 1 ? "" : "s"} from `
          + `${[...new Set(entries.filter((one) => skipped.includes(one.model.name))
                                  .map((one) => one.model.owner))].join(", ")}.`,
          { kind: "warn" });
  }
  if (!ready.length || !(await confirmDiskRoom(ready))) return;

  let queued = 0;
  for (const model of ready) {
    if (await queueModel(model, { source: "missing from a workflow", askTrust: false })) {
      queued += 1;
    }
  }
  if (queued) {
    toast(`Queued ${queued} model${queued === 1 ? "" : "s"}.`, { kind: "ok" });
    if (!floatingPanel("downloads")) openDownloadManager();
  }
  refresh?.(false);
}

// A set of files that are the same bytes in more than one place.
function buildDuplicateGroup(group, refresh) {
  const box = el("div", "om-lib-group");
  const head = el("div", "om-lib-group-head");
  head.appendChild(el("span", "om-dl-name", group.name));
  head.appendChild(el("span", "om-lib-size",
    `${group.copies.length} copies · ${bytesText(group.wasted)} reclaimable`));
  box.appendChild(head);
  if (group.state === "identical" && group.sha256) {
    const line = el("div", "om-dl-hash");
    line.appendChild(el("span", "om-dl-hash-label", "IDENTICAL"));
    line.appendChild(el("code", "om-dl-hash-value", group.sha256));
    box.appendChild(line);
  } else if (group.state === "different") {
    box.appendChild(el("div", "om-dl-note om-dl-bad",
      "Same filename, different contents. Which one loads depends on the order ComfyUI "
      + "searches its folders, so a workflow naming this file may not get the one you mean."));
  } else if (group.state === "similar") {
    box.appendChild(el("div", "om-dl-note",
      "Start and end match. That rules out a name clash but cannot prove the middle matches, "
      + "so these are not confirmed identical yet."));
  } else {
    box.appendChild(el("div", "om-dl-note",
      "Same name and size. Nothing has been read yet."));
  }
  for (const copy of group.copies) {
    box.appendChild(buildLibraryRow({ ...copy, sha256: group.sha256 }, refresh));
  }
  return box;
}

// One registered path, what it holds, and what is left on the drive it lives on.
//
// The drive figure is shown per root rather than summed: several roots frequently share a
// drive, and adding their free space together would report a machine as having far more room
// than it has.
function buildStorageRoot(root) {
  const row = el("div", "om-lib-row");
  const top = el("div", "om-dl-top");
  top.appendChild(el("span", "om-dl-name", dirOf(root.root) ? root.root : root.root));
  top.appendChild(el("span", "om-lib-size", bytesText(root.bytes)));
  row.appendChild(top);

  if (root.total) {
    const bar = el("div", "om-mem-split");
    const used = el("div", "om-mem-resident");
    const share = ((root.total - root.free) / root.total) * 100;
    used.style.width = `${Math.max(0, Math.min(100, share))}%`;
    if (share >= 90) used.style.background = "#f85149";
    else if (share >= 75) used.style.background = "#d29922";
    bar.title = `${bytesText(root.total - root.free)} of ${bytesText(root.total)} used on this drive`;
    bar.appendChild(used);
    row.appendChild(bar);
  }

  const meta = el("div", "om-dl-where");
  meta.appendChild(el("span", null, `${root.files} file${root.files === 1 ? "" : "s"}`));
  for (const folder of root.folders.slice(0, 4)) meta.appendChild(el("span", "om-dl-src", folder));
  if (root.total) {
    meta.appendChild(el("span", "om-dl-src", `${bytesText(root.free)} free on the drive`));
  }
  row.appendChild(meta);
  return row;
}

function buildStorageView(report, refresh) {
  const parts = [];
  const lead = el("div", "om-lib-lead");
  lead.textContent = `${report.files} files · ${bytesText(report.total)} across `
    + `${report.roots.length} registered path${report.roots.length === 1 ? "" : "s"}.`;
  parts.push(lead);

  // What could be given back, said only where there is something to give.
  const reclaim = [];
  if (report.duplicate_bytes) {
    reclaim.push(`${bytesText(report.duplicate_bytes)} in files sharing a name and size`);
  }
  if (report.partial_bytes) {
    reclaim.push(`${bytesText(report.partial_bytes)} in unfinished downloads`);
  }
  if (reclaim.length) {
    const note = el("div", "om-lib-lead");
    note.textContent = `Possibly reclaimable: ${reclaim.join(" · ")}. `
      + "Check the Duplicates tab before acting on the first.";
    parts.push(note);
  }

  parts.push(el("div", "om-mem-bar-label", "Registered paths"));
  parts.push(...report.roots.map(buildStorageRoot));

  if (report.partials?.length) {
    const head = el("div", "om-lib-row om-lib-sweep");
    const top = el("div", "om-dl-top");
    top.appendChild(el("span", "om-dl-name",
      `${report.partials.length} unfinished download${report.partials.length === 1 ? "" : "s"}`));
    top.appendChild(el("span", "om-lib-size", bytesText(report.partial_bytes)));
    head.appendChild(top);
    head.appendChild(el("div", "om-dl-note",
      "Part files left by downloads that stopped. A paused download will reuse its own; these "
      + "are the ones no entry in the Download Manager is waiting on."));
    const foot = el("div", "om-dl-foot");
    foot.appendChild(el("span", "om-dl-size", ""));
    const acts = el("span", "om-dl-acts");
    const sweep = el("button", "om-btn om-dl-btn om-go", "Clean up");
    sweep.onclick = async () => {
      const go = await chooseAction("Delete unfinished downloads?", "",
        [{ key: "go", label: "Delete them", primary: true }],
        { wide: true, facts: [
          ["Files", `${report.partials.length} part files`],
          ["Frees", bytesText(report.partial_bytes)],
          ["Models", "Not touched. Only part files are removed."],
        ] });
      if (!go) return;
      const answer = await libPost("/library/sweep", {});
      if (answer.ok) toast(`Freed ${bytesText(answer.bytes || 0)}.`, { kind: "ok" });
      refresh(true);
    };
    acts.appendChild(sweep);
    foot.appendChild(acts);
    head.appendChild(foot);
    parts.push(el("div", "om-mem-bar-label", "Unfinished downloads"), head);
  }

  parts.push(el("div", "om-mem-bar-label", "Largest files"));
  parts.push(...(report.largest || []).map((file) => {
    const row = el("div", "om-lib-row");
    const top = el("div", "om-dl-top");
    top.appendChild(el("span", "om-dl-name", file.name));
    top.appendChild(el("span", "om-lib-size", bytesText(file.size)));
    row.appendChild(top);
    const meta = el("div", "om-dl-where");
    meta.appendChild(el("span", null, file.directory));
    const place = el("span", "om-dl-src", dirOf(file.path));
    place.title = file.path;
    meta.appendChild(place);
    row.appendChild(meta);
    return row;
  }));
  return parts;
}

// The library: what is on disk, what is there twice, and what nothing appears to use.
function openModelLibrary() {
  if (floatingPanel("library")) { closeFloatingPanel("library"); return null; }

  const panel = createFloatingPanel({
    key: "library", title: "Model Library", ...windowSize("library"),
    modal: !asWindow("library"),
  });
  const summary = el("div", "om-dl-summary", "Reading...");
  panel.bar.querySelector(".om-float-badge").appendChild(summary);

  let tab = LIB_TABS.find((one) => one.key === dlRecall("om-lib-tab", "")) || LIB_TABS[0];

  const filter = el("input", "om-search om-lib-filter");
  filter.placeholder = "Filter by name or folder";
  filter.spellcheck = false;
  let filterTimer = 0;
  filter.addEventListener("input", () => {
    clearTimeout(filterTimer);
    filterTimer = setTimeout(draw, 200);
  });
  panel.tools.appendChild(filter);

  const rescan = el("button", "om-btn", "Rescan");
  rescan.title = "Walk the model folders again.";
  rescan.onclick = () => refresh(true);
  panel.tools.appendChild(rescan);

  // Two steps, because they cost very different amounts. The quick one reads two megabytes
  // per file and settles only whether a group is a name clash; the full one reads everything
  // and is the only thing that can call a group identical.
  const check = el("button", "om-btn", "Quick check");
  check.title = "Reads the start and end of each candidate. Fast, and rules out name clashes.";
  check.style.display = "none";
  check.onclick = async () => {
    check.disabled = true;
    check.textContent = "Checking...";
    libDupes = await libGet("/library/duplicates?level=quick");
    check.disabled = false;
    check.textContent = "Quick check";
    draw();
  };
  panel.tools.appendChild(check);

  const confirm = el("button", "om-btn om-go", "Verify fully");
  confirm.style.display = "none";
  confirm.onclick = async () => {
    confirm.disabled = true;
    confirm.textContent = "Reading...";
    libDupes = await libGet("/library/duplicates?level=full");
    confirm.disabled = false;
    draw();
  };
  panel.tools.appendChild(confirm);

  const tabBar = el("div", "om-dl-tabs");
  panel.body.appendChild(tabBar);
  const body = el("div", "om-dl-body");
  const list = el("div", "om-dl-list");
  body.appendChild(list);
  panel.body.appendChild(body);

  const badges = new Map();
  const buildTabs = () => {
    badges.clear();
    tabBar.replaceChildren(...LIB_TABS.map((one) => {
      const button = el("button", `om-dl-tab${one === tab ? " om-dl-on" : ""}`);
      button.appendChild(el("span", null, one.title));
      const badge = el("span", "om-dl-tab-count", "-");
      badges.set(one.key, badge);
      button.appendChild(badge);
      button.onclick = () => {
        if (one === tab) return;
        tab = one;
        dlRemember("om-lib-tab", tab.key);
        buildTabs();
        draw();
      };
      return button;
    }));
  };

  const counts = () => {
    const files = libIndex?.files || [];
    const referenced = new Set(libRefs?.names || []);
    const have = new Set(files.map((one) => one.name.toLowerCase()));
    return {
      all: files.length,
      duplicates: (libDupes?.groups?.length ?? 0) + (libDupes?.collisions?.length ?? 0),
      unreferenced: libRefs ? files.filter((one) => !referenced.has(one.name.toLowerCase())).length : 0,
      absent: libRefs ? [...referenced].filter((one) => !have.has(one)).length : 0,
      storage: libStorage?.roots?.length ?? 0,
    };
  };

  const draw = () => {
    if (!panel.el.isConnected) return;
    const files = libIndex?.files || [];
    const total = files.reduce((sum, one) => sum + (one.size || 0), 0);
    summary.textContent = libIndex
      ? `${files.length} files · ${bytesText(total)}`
        + (libIndex.skipped?.length ? ` · ${libIndex.skipped.length} unreachable` : "")
      : "Reading...";

    const found = counts();
    for (const [key, badge] of badges) badge.textContent = String(found[key] ?? 0);
    const onDupes = tab.key === "duplicates";
    const level = libDupes?.level || "names";
    const reading = mayHash();
    check.style.display = reading && onDupes && level === "names" ? "" : "none";
    confirm.style.display = reading && onDupes && level !== "full" ? "" : "none";
    if (onDupes && libDupes) {
      confirm.textContent = `Verify fully (${bytesText(libDupes.candidate_bytes || 0)})`;
      confirm.title = "Reads every candidate in full. Only this can confirm two files are "
        + "the same, and only confirmed groups are safe to reclaim.";
    }

    // Building every row of a large library at once is what makes a panel feel broken. The
    // list is capped and says so; the filter is how the rest is reached.
    const wanted = filter.value.trim().toLowerCase();
    const matches = (one) => !wanted
      || one.name.toLowerCase().includes(wanted)
      || String(one.directory).toLowerCase().includes(wanted)
      || String(one.path).toLowerCase().includes(wanted);
    const capped = (rows) => {
      if (rows.length <= LIB_MAX_ROWS) return rows.map((one) => buildLibraryRow(one, refresh));
      const head = el("div", "om-lib-lead",
        `Showing the ${LIB_MAX_ROWS} largest of ${rows.length}. Filter to narrow it.`);
      return [head, ...rows.slice(0, LIB_MAX_ROWS).map((one) => buildLibraryRow(one, refresh))];
    };

    const parts = [];
    if (tab.key === "all") {
      parts.push(...capped(files.filter(matches).sort((a, b) => b.size - a.size)));
    } else if (tab.key === "duplicates") {
      const level = libDupes?.level || "names";
      const clashes = libDupes?.collisions || [];
      if (libDupes?.groups?.length || clashes.length) {
        const head = el("div", "om-lib-lead");
        head.textContent = level === "full"
          ? `${bytesText(libDupes.reclaimable)} confirmed identical and safe to reclaim.`
          : level === "quick"
            ? `${bytesText(libDupes.candidate_bytes)} in candidates. Start and end checked; `
              + "nothing is confirmed identical until it is read in full."
            : `${bytesText(libDupes.candidate_bytes)} in files sharing a name and size. `
              + (mayHash()
                 ? "Nothing has been read."
                 : "Nothing has been read, and reading is switched off in settings, so these "
                   + "cannot be confirmed identical here.");
        parts.push(head);
        if (clashes.length) {
          const warn = el("div", "om-lib-lead om-dl-bad");
          warn.textContent = `${clashes.length} filename${clashes.length === 1 ? "" : "s"} `
            + "used by files that are not the same. These are not duplicates and deleting "
            + "one would lose something.";
          parts.push(warn, ...clashes.map((one) => buildDuplicateGroup(one, refresh)));
        }
        parts.push(...(libDupes.groups || []).map((one) => buildDuplicateGroup(one, refresh)));
      }
    } else if (tab.key === "storage") {
      if (libStorage?.ok) parts.push(...buildStorageView(libStorage, refresh));
    } else if (tab.key === "unreferenced") {
      const referenced = new Set(libRefs?.names || []);
      const mine = files.filter((one) => !referenced.has(one.name.toLowerCase())).filter(matches);
      if (mine.length) {
        const head = el("div", "om-lib-lead");
        head.textContent =
          `No mention of these in ${libRefs?.workflows ?? 0} saved workflows. `
          + "A workflow saved in API form, or a reference built while it runs, would not be "
          + "seen here, so treat this as what was found rather than as what is unused.";
        parts.push(head, ...capped(mine.sort((a, b) => b.size - a.size)));
      }
    } else {
      // Two different questions wear the same name on this tab. A workflow that recorded
      // where a model came from can have it fetched; a workflow that only names a file
      // cannot, because a filename is not a source. The ones that can be acted on go first,
      // and the rest are still worth listing -- knowing what is missing is the point.
      const have = new Set(files.map((one) => one.name.toLowerCase()));
      const byName = new Map();
      for (const entry of libRefs?.declared || []) {
        for (const model of entry.models || []) {
          const folded = (model.name || "").toLowerCase();
          if (!folded || !model.url || have.has(folded)) continue;
          if (wanted && !folded.includes(wanted)) continue;
          if (!byName.has(folded)) byName.set(folded, { model, workflows: [] });
          const slot = byName.get(folded);
          if (!slot.workflows.includes(entry.workflow)) slot.workflows.push(entry.workflow);
        }
      }
      // Most wanted first: a model three workflows are waiting on is the one to fetch.
      const fetchable = [...byName.values()].sort((a, b) =>
        b.workflows.length - a.workflows.length
        || (a.model.name || "").localeCompare(b.model.name || ""));
      const named = [...(libRefs?.names || [])]
        .filter((one) => !have.has(one) && !byName.has(one)
                         && (!wanted || one.includes(wanted)));

      if (fetchable.length) parts.push(...buildWantedSection(fetchable, refresh));
      if (named.length) {
        const head = el("div", "om-lib-lead");
        head.textContent = fetchable.length
          ? "Named by a workflow that did not record where it came from. A filename is not a "
            + "source, so these cannot be fetched from here."
          : "Asked for by a workflow, not found in any model folder.";
        parts.push(head, ...named.map((name) => {
          const row = el("div", "om-lib-row om-dl-gone");
          row.appendChild(el("div", "om-dl-name", name));
          row.appendChild(el("div", "om-dl-note",
            "Not on disk. Add it from the Download Manager."));
          return row;
        }));
      }
    }

    if (parts.length) {
      list.replaceChildren(...parts);
    } else {
      const box = el("div", "om-empty");
      box.appendChild(el("div", "om-empty-title", tab.empty));
      list.replaceChildren(box);
    }
  };

  const refresh = async (rescanNow = false) => {
    if (!panel.el.isConnected) return;
    summary.textContent = rescanNow ? "Walking the model folders..." : "Reading...";
    try {
      libIndex = await libGet(`/library${rescanNow ? "?refresh=1" : ""}`);
      if (!panel.el.isConnected) return;
      libRefs = await libGet("/library/references");
      if (!panel.el.isConnected) return;
      // The cheap pass only. Reading every candidate is an explicit action.
      libDupes = await libGet("/library/duplicates?level=names");
      if (!panel.el.isConnected) return;
      libStorage = await libGet("/library/storage");
    } catch {
      summary.textContent = "The model folders could not be read";
      return;
    }
    draw();
  };

  buildTabs();
  refresh(false);
  return panel;
}

const iconStyle = document.createElement("style");
iconStyle.textContent = `
.om-tab-icon { display: inline-block; width: 1.2rem; height: 1.2rem;
  background-color: currentColor;
  -webkit-mask: center / contain no-repeat url("${ICON_TAB}");
  mask: center / contain no-repeat url("${ICON_TAB}"); }
`;
document.head.appendChild(iconStyle);

app.registerExtension({
  name: "openmanager.browser",
  settings: [
    {
      // Not shown: it records that the one-time link render mode repair has run, so that it
      // runs once per reader rather than once per browser or once per load.
      id: "openManager.linkModeRepair",
      name: "Link render mode repair",
      category: ["Open Manager", "Internal", "linkModeRepair"],
      type: "hidden",
      defaultValue: 0,
    },
    {
      id: "openManager.windowManager",
      name: "Pack manager as a window",
      category: ["Open Manager", "Windows", "windowManager"],
      type: "boolean",
      defaultValue: true,
      tooltip: "The Registry, Installed, GitHub and Missing browser. As a window it is movable, stays put while you build, and a click on "
        + "the canvas does not shut it. As a modal it opens centred in front of everything "
        + "and closes when you click away or press Escape. Confirmations are always modal: "
        + "they are asking you a question.",
    },
    {
      id: "openManager.windowPacks",
      name: "Pack pages as windows",
      category: ["Open Manager", "Windows", "windowPacks"],
      type: "boolean",
      defaultValue: true,
      tooltip: "A pack's own page: its versions, README, nodes and gallery. One window per pack, so several can sit side by side. As a window it is movable, stays put while you build, and a click on "
        + "the canvas does not shut it. As a modal it opens centred in front of everything "
        + "and closes when you click away or press Escape. Confirmations are always modal: "
        + "they are asking you a question.",
    },
    {
      id: "openManager.windowDownloads",
      name: "Download Manager as a window",
      category: ["Open Manager", "Windows", "windowDownloads"],
      type: "boolean",
      defaultValue: true,
      tooltip: "The download queue. As a window it is movable, stays put while you build, and a click on "
        + "the canvas does not shut it. As a modal it opens centred in front of everything "
        + "and closes when you click away or press Escape. Confirmations are always modal: "
        + "they are asking you a question.",
    },
    {
      id: "openManager.windowLibrary",
      name: "Model Library as a window",
      category: ["Open Manager", "Windows", "windowLibrary"],
      type: "boolean",
      defaultValue: true,
      tooltip: "What is on disk: duplicates, unreferenced files and storage. As a window it is movable, stays put while you build, and a click on "
        + "the canvas does not shut it. As a modal it opens centred in front of everything "
        + "and closes when you click away or press Escape. Confirmations are always modal: "
        + "they are asking you a question.",
    },
    {
      id: "openManager.windowMemory",
      name: "Memory panel as a window",
      category: ["Open Manager", "Windows", "windowMemory"],
      type: "boolean",
      defaultValue: true,
      tooltip: "What is loaded and what it weighs. As a window it is movable, stays put while you build, and a click on "
        + "the canvas does not shut it. As a modal it opens centred in front of everything "
        + "and closes when you click away or press Escape. Confirmations are always modal: "
        + "they are asking you a question.",
    },
    {
      id: "openManager.windowSize",
      name: "Default window size",
      category: ["Open Manager", "Windows", "windowSize"],
      type: "combo",
      options: ["compact", "standard", "large"],
      defaultValue: "large",
      tooltip: "How large a window opens before you have sized it yourself. Sizes are taken "
        + "as a share of the browser window rather than a fixed number of pixels, so they suit "
        + "a laptop and a large monitor alike, with floors and ceilings so neither extreme "
        + "becomes unusable. Each window has its own share, so the Memory panel stays smaller "
        + "than a pack page. A window you have resized keeps the size you gave it, and this "
        + "does not override it.",
    },
    {
      id: "openManager.blurInactive",
      onChange: () => applyWindowLook(),
      name: "Blur inactive windows",
      category: ["Open Manager", "Windows", "blurInactive"],
      type: "boolean",
      defaultValue: false,
      tooltip: "Soften the contents of every window except the one in front, so the active "
        + "one reads first with several open. Off by default: blurring text is a repaint on "
        + "every change of which window is in front, and with several open on a weak GPU that "
        + "is felt. A window not in front is dimmed slightly either way.",
    },
    {
      id: "openManager.windowShadow",
      onChange: () => applyWindowLook(),
      name: "Drop shadow",
      category: ["Open Manager", "Windows", "windowShadow"],
      type: "boolean",
      defaultValue: true,
      tooltip: "The shadow that lifts a window off the graph behind it. Turn it off for a "
        + "flatter interface, or where the blur costs more than it is worth on a weak GPU.",
    },
    {
      id: "openManager.windowTitleSize",
      onChange: () => applyWindowLook(),
      name: "Title text size",
      category: ["Open Manager", "Windows", "windowTitleSize"],
      type: "number",
      defaultValue: 15,
      tooltip: "Size in pixels of the text in a window's title bar and on its section "
        + "headings. Clamped to 10-28. Independent of the header height, so a taller bar does "
        + "not have to mean larger text.",
    },
    {
      id: "openManager.windowTextSize",
      onChange: () => applyWindowLook(),
      name: "Content text size",
      category: ["Open Manager", "Windows", "windowTextSize"],
      type: "number",
      defaultValue: 13,
      tooltip: "Size in pixels of the body text inside windows: lists, descriptions and "
        + "READMEs. Clamped to 10-22. Raise it on a large or distant screen.",
    },
    {
      id: "openManager.managerEntry",
      name: "What the Extensions button opens",
      category: ["Open Manager", "Interface", "managerEntry"],
      type: "combo",
      options: ["auto", "panel", "classic"],
      defaultValue: "auto",
      tooltip: "'auto' follows ComfyUI: the classic menu of destinations where it was started "
        + "with --enable-manager-legacy-ui, and the panel otherwise. 'panel' always opens the "
        + "manager itself. 'classic' always opens the menu, which is the only way in on an "
        + "interface with no sidebar. Every destination is in both, so this decides the way "
        + "in rather than what is reachable.",
    },
    {
      id: "openManager.trustMode",
      name: "Remember trusted authors, or ask every time",
      category: ["Open Manager", "Interface", "trustMode"],
      type: "combo",
      options: ["author", "action"],
      defaultValue: "author",
      tooltip: "By author: asked once per account, and anything they publish is allowed from then on. By action: asked every time, naming the account, and nothing is remembered. Findings against a pack are shown either way.",
    },
    {
      id: "openManager.trustRegistry",
      name: "Ask before installing a registry pack from an untrusted author",
      category: ["Open Manager", "Interface", "trustRegistry"],
      type: "boolean",
      defaultValue: false,
      tooltip: "Only registry packs are affected. A GitHub install always asks, because nothing has scanned it, and a model download always asks about the account hosting it; neither is switched off here. Turn this on to be asked for registry packs as well, which are scanned and carry a status. Asked once per author, so several packs by someone already trusted do not ask again. Findings against a pack are shown either way.",
    },
    {
      id: "openManager.imageWorkflows",
      name: "Right-click a README image to load its workflow",
      category: ["Open Manager", "Interface", "imageWorkflows"],
      type: "boolean",
      defaultValue: true,
      tooltip: "Authors publish screenshots with the workflow written into the file. Right-clicking one offers to load it. Turn this off to keep the browser's own menu on README images.",
    },
    {
      id: "openManager.packLinks",
      name: "Open README links to other packs here",
      category: ["Open Manager", "Interface", "packLinks"],
      type: "boolean",
      defaultValue: true,
      tooltip: "A README link to another pack's repository opens that pack's page in Open Manager rather than leaving for GitHub. Middle-click and ctrl-click always go to GitHub.",
    },
    {
      id: "openManager.enrichMetadata",
      name: "Read pack README and repository metadata",
      category: ["Open Manager", "Registry", "enrichMetadata"],
      type: "boolean",
      defaultValue: true,
      tooltip: "A pack page reads its README, repository stats and gallery from the repository. Cached until the pack's versions change. Turn it off to keep a pack page to the registry alone and save the traffic.",
    },
    {
      id: "openManager.autoRenew",
      name: "Renew the offline registry",
      category: ["Open Manager", "Registry", "autoRenew"],
      type: "combo",
      options: [
        { text: "Off (manual only)", value: "off" },
        { text: "On every start", value: "startup" },
        { text: "When stale", value: "stale" },
      ],
      defaultValue: "startup",
      tooltip: "When the panel loads, refresh the cached registry in the background: never, once per launch, or only when older than the stale threshold.",
    },
    {
      id: "openManager.staleDays",
      name: "Days before the offline registry counts as stale",
      category: ["Open Manager", "Registry", "staleDays"],
      type: "number",
      defaultValue: 7,
      tooltip: "How old the offline copy of the registry may get before it is treated as out of date. Only consulted by the 'when stale' renewal policy; the other policies ignore it. Nothing is fetched because a catalogue is stale, it is only reported as such until a sync is asked for.",
    },
    {
      id: "openManager.parallelSync",
      name: "Sync the registry in parallel",
      category: ["Open Manager", "Registry", "parallelSync"],
      type: "boolean",
      defaultValue: true,
      tooltip: "Read several catalogue pages at once. Much faster on a broadband link; turn it off to read one page at a time.",
    },
    {
      id: "openManager.syncConcurrency",
      name: "Catalogue pages read at once when syncing",
      category: ["Open Manager", "Registry", "syncConcurrency"],
      type: "number",
      defaultValue: 8,
      tooltip: "How many pages a parallel sync keeps in flight. Clamped to 1-16; higher is not always faster and risks the registry rate-limiting you.",
    },
    {
      id: "openManager.allowBanned",
      name: "Install versions the registry has banned",
      category: ["Open Manager", "Registry", "allowBanned"],
      type: "boolean",
      defaultValue: false,
      tooltip: "Off, a banned version shows as Blocked and will not install. On, it installs "
        + "like any other version after a confirmation that names the ban, and the risk is "
        + "yours: a custom node reads and writes anything the account running ComfyUI can "
        + "reach, and nothing here has checked whether the ban is right. Worth knowing either "
        + "way: the registry's automated scanner is currently banning at a rate publishers "
        + "dispute, with no reason published, no category and no route to contest or clear "
        + "one, and it has caught working, widely used packs. Scan or read a pack before "
        + "installing it over a ban.",
    },
    {
      id: "openManager.galleryShow",
      name: "Show pack galleries",
      category: ["Open Manager", "Gallery", "galleryShow"],
      type: "boolean",
      defaultValue: true,
      tooltip: "Show the images a pack lists in [tool.open_manager] gallery. Entries given as absolute URLs are fetched from wherever the pack points, so turning this off keeps the panel to the hosts it already uses.",
    },
    {
      id: "openManager.galleryThumb",
      name: "Gallery thumbnail size",
      category: ["Open Manager", "Gallery", "galleryThumb"],
      type: "number",
      defaultValue: 120,
      tooltip: "Edge of a gallery thumbnail in pixels. Clamped to 80-320; the grid fits as many columns as the width allows.",
    },
    {
      id: "openManager.galleryExpanded",
      name: "Open pack galleries by default",
      category: ["Open Manager", "Gallery", "galleryExpanded"],
      type: "boolean",
      defaultValue: false,
      tooltip: "Start the gallery open on a pack page rather than collapsed. The images are fetched either way once the section is drawn, so this decides how much of the page you scroll past rather than how much is loaded.",
    },
    {
      id: "openManager.licenseUseApi",
      name: "Name licences through the GitHub API",
      category: ["Open Manager", "Licences", "licenseUseApi"],
      type: "boolean",
      defaultValue: false,
      tooltip: "Ask GitHub to name a repository's licence in one request instead of guessing at filenames. Needs a GitHub token, which is set in Open Manager's own Access keys dialog rather than here: keys are deliberately kept out of ComfyUI's settings. Without one the limit is 60 requests an hour, which a single listing exhausts, after which this stops helping. Falls back to reading files whenever the API cannot answer, so it only ever adds a licence, never removes one.",
    },
    {
      id: "openManager.licenseRace",
      name: "Fetch licence filenames together",
      category: ["Open Manager", "Licences", "licenseRace"],
      type: "boolean",
      defaultValue: false,
      tooltip: "Try every candidate licence filename at once rather than one after another. Answers a repository in a single round trip instead of up to fourteen, at the cost of more requests.",
    },
    {
      id: "openManager.licenseConcurrency",
      name: "Repositories read at once when naming licences",
      category: ["Open Manager", "Licences", "licenseConcurrency"],
      type: "number",
      defaultValue: 8,
      tooltip: "How many repositories are read at once when resolving licences for a listing. Clamped to 1-32.",
    },
    {
      id: "openManager.scanOnInstall",
      name: "Scan every new install before it is finished",
      category: ["Open Manager", "Scanning", "scanOnInstall"],
      type: "boolean",
      defaultValue: false,
      tooltip: "Check a freshly placed pack against VirusTotal before its requirements are installed and before ComfyUI is asked to restart. Needs a VirusTotal key, which is set in Open Manager's own Access keys dialog rather than here: keys are deliberately kept out of ComfyUI's settings. Where the day's allowance is spent you are asked whether to install without scanning.",
    },
    {
      id: "openManager.panelHeaders",
      onChange: () => applyHeaderHeight(),
      name: "Header height",
      category: ["Open Manager", "Windows", "panelHeaders"],
      type: "number",
      defaultValue: 44,
      tooltip: "Height in pixels of the title and section bars in the floating panels, and the size of the text on them. Clamped to 24-80. Raise it on a large or distant screen.",
    },
    {
      id: "openManager.monitor",
      onChange: () => remountTopbar(),
      name: "Resource monitor strip",
      category: ["Open Manager", "Monitor", "monitor"],
      type: "boolean",
      defaultValue: false,
      tooltip: "A compact CPU, RAM and VRAM readout beside the workflow tabs. The server samples only while a panel is watching and stops as soon as it is not, so nothing is measured when nobody is looking.",
    },
    {
      id: "openManager.monitorPlacement",
      onChange: () => remountTopbar(),
      name: "Where the resource monitor strip sits",
      category: ["Open Manager", "Monitor", "monitorPlacement"],
      type: "combo",
      options: ["control", "topbar"],
      defaultValue: "control",
      tooltip: "'control' puts the readout in ComfyUI's floating control bar, beside the queue controls and next to any other monitor already there. 'topbar' puts it in the workflow tab strip, ahead of the account button. Falls back to the tab strip where a build has no control bar.",
    },
    {
      id: "openManager.monitorStyle",
      onChange: () => remountTopbar(),
      name: "How the resource monitor strip is drawn",
      category: ["Open Manager", "Monitor", "monitorStyle"],
      type: "combo",
      options: MONITOR_STYLES,
      defaultValue: "mixed",
      tooltip: "'mixed' draws each figure the way it reads: a share of a total as a bar left "
        + "to right, a temperature as a column like a thermostat. 'horizontal' and 'vertical' "
        + "draw everything the one way instead. The compact styles drop the separate label "
        + "and put the text on the bar, or under the column, which is about half the width.",
    },
    {
      id: "openManager.monitorInterval",
      onChange: () => remountTopbar(),
      name: "Seconds between monitor readings",
      category: ["Open Manager", "Monitor", "monitorInterval"],
      type: "number",
      defaultValue: 2,
      tooltip: "How often the machine is sampled while the strip is on screen, clamped to 1 to 10 seconds. The Memory panel asks for one a second while it is open, and the server samples at whichever of the two is quicker. Nothing is sampled when neither is open.",
    },
    {
      id: "openManager.monitorCpu",
      onChange: () => remountTopbar(),
      name: "Show CPU in the monitor strip",
      category: ["Open Manager", "Monitor", "monitorCpu"],
      type: "boolean",
      defaultValue: true,
      tooltip: "Processor load. Needs psutil, which ComfyUI already depends on; the reading is left out where it cannot be taken.",
    },
    {
      id: "openManager.monitorRam",
      onChange: () => remountTopbar(),
      name: "Show RAM in the monitor strip",
      category: ["Open Manager", "Monitor", "monitorRam"],
      type: "boolean",
      defaultValue: true,
      tooltip: "System memory in use, as a share of the total, measured by ComfyUI's own model management rather than separately. Always available.",
    },
    {
      id: "openManager.monitorTemp",
      onChange: () => remountTopbar(),
      name: "Show temperatures in the monitor strip",
      category: ["Open Manager", "Monitor", "monitorTemp"],
      type: "boolean",
      defaultValue: true,
      tooltip: "A thermometer per graphics card, and per processor package where the platform reports one. Graphics temperatures come from NVIDIA's own tooling where it is installed; Windows reports no processor temperature to Python, so that reading is simply absent there.",
    },
    {
      id: "openManager.monitorVram",
      onChange: () => remountTopbar(),
      name: "Show VRAM in the monitor strip",
      category: ["Open Manager", "Monitor", "monitorVram"],
      type: "boolean",
      defaultValue: true,
      tooltip: "Graphics memory in use, as a share of the total, one meter per device. A machine with four cards gets four, labelled VRAM0 to VRAM3. Always available.",
    },
    {
      id: "openManager.startupTimes",
      name: "Show what each pack costs to load, on the Installed list",
      category: ["Open Manager", "Library", "startupTimes"],
      type: "boolean",
      defaultValue: false,
      tooltip: "ComfyUI times every pack it imports and writes the result to its log. This reads that back and puts the seconds beside each installed pack, with the total. Read once when the Installed view opens; nothing is measured or run.",
    },
    {
      id: "openManager.hashOnDemand",
      name: "Let the Model Library read the contents of a file",
      category: ["Open Manager", "Library", "hashOnDemand"],
      type: "boolean",
      defaultValue: true,
      tooltip: "Hashing and duplicate confirmation read a model from end to end, which on a "
        + "large library is hundreds of gigabytes. Nothing is ever read without being asked "
        + "for, so this decides whether the asking is offered at all. Off, the library still "
        + "reports names, sizes, folders, duplicates by name, and what no workflow "
        + "references, and never opens a file. A digest already taken is still shown.",
    },
    {
      id: "openManager.floatingPanels",
      name: "Windows can be dragged",
      category: ["Open Manager", "Windows", "floatingPanels"],
      type: "boolean",
      defaultValue: true,
      tooltip: "Presentation only, and only for surfaces set to open as windows. On, a "
        + "window can be dragged anywhere and reopens where you left it. Off, it always opens "
        + "in the middle and cannot be moved, which suits a single screen or anyone who would "
        + "rather not hunt for a window. Either way, a "
        + "window too small to move a panel around in presents it centred, because there is "
        + "nowhere to drag it to and an edge to lose it past. Folding, resizing and closing "
        + "work the same in every case.",
    },
    {
      id: "openManager.modelLibrary",
      onChange: () => remountTopbar(),
      name: "Model Library panel, and the Models button",
      category: ["Open Manager", "Library", "modelLibrary"],
      type: "boolean",
      defaultValue: false,
      tooltip: "Adds a Models button that opens the model library: everything on disk across every folder ComfyUI registers, what is held in more than one place, and what no saved workflow appears to reference. Nothing is read until the panel is opened, and nothing is hashed until it is asked for.",
    },
    {
      id: "openManager.downloadButton",
      onChange: () => remountTopbar(),
      name: "Show the Download Manager button",
      category: ["Open Manager", "Downloads", "downloadButton"],
      type: "boolean",
      defaultValue: true,
      tooltip: "Puts a Downloads button at the right-hand end of the workflow tab strip. Turn it off to reach the Download Manager from the command palette instead.",
    },
    {
      id: "openManager.runBar",
      onChange: () => remountTopbar(),
      name: "Run progress bar above the header",
      category: ["Open Manager", "Monitor", "runBar"],
      type: "boolean",
      defaultValue: false,
      tooltip: "A strip across the top of the window while a prompt runs: the graph's "
        + "progress as a gradient, and the running node's own progress filling the block "
        + "that node will occupy. Off by default because it sits where another pack may "
        + "already have put one; switch that one off before turning this on.",
    },
    {
      id: "openManager.memoryButton",
      onChange: () => remountTopbar(),
      name: "Show the Memory button, which opens this panel",
      category: ["Open Manager", "Monitor", "memoryButton"],
      type: "boolean",
      defaultValue: true,
      tooltip: "Opens the Memory panel: live graphs, what ComfyUI is holding, and where each "
        + "model's weights sit. Separate from the resource monitor, so switching the strip "
        + "off does not leave the panel reachable only from the command palette.",
    },
    {
      id: "openManager.buttonPlacement",
      onChange: () => remountTopbar(),
      name: "Where the Downloads, Models and Memory buttons sit",
      category: ["Open Manager", "Interface", "buttonPlacement"],
      type: "combo",
      options: ["topbar", "control"],
      defaultValue: "topbar",
      tooltip: "'topbar' puts Downloads, Models and Memory in the workflow tab strip with "
        + "their names. 'control' puts them in ComfyUI's floating control bar as icons, with "
        + "the name on the hover, which suits a narrow window or a crowded tab strip. Falls "
        + "back to the tab strip where a build has no control bar.",
    },
    {
      id: "openManager.downloadLocation",
      name: "Where new downloads are stored",
      category: ["Open Manager", "Downloads", "downloadLocation"],
      type: "combo",
      options: ["default", "most-free"],
      defaultValue: "default",
      tooltip: "Which of the paths ComfyUI registers for a model folder a download starts on. 'default' is ComfyUI's own first path, which honours is_default in extra_model_paths.yaml. 'most-free' picks the registered path with the most room, which suits a machine whose default drive is the small one. Either way the location is shown before the download starts and can be changed.",
    },
    {
      id: "openManager.downloadWorkers",
      name: "Models downloaded at once, in parallel",
      category: ["Open Manager", "Downloads", "downloadWorkers"],
      type: "number",
      defaultValue: 2,
      tooltip: "How many downloads run in parallel. Clamped to 1-8. More is not always faster: past a point the link is the limit and a stalled transfer takes a slot with it.",
    },
    {
      id: "openManager.nodeModelMenu",
      name: "Add and fetch model URLs from a node's menu",
      category: ["Open Manager", "Downloads", "nodeModelMenu"],
      type: "boolean",
      defaultValue: true,
      tooltip: "Right-clicking a node offers to download the models it names, and to add a URL to it so a shared graph carries its weights. Added URLs are checked against the same host and format rules as any other download.",
    },
  ],
  commands: [
    {
      id: "openmanager.panel",
      label: "Open Manager: open the panel",
      function: () => openPanelWindow(),
    },
    {
      id: "openmanager.memory",
      label: "Open Manager: open the Memory panel",
      function: () => openMemoryPanel(),
    },
    {
      id: "openmanager.library",
      label: "Open Manager: open the Model Library",
      function: () => openModelLibrary(),
    },
    {
      id: "openmanager.downloads",
      label: "Open Manager: open the Download Manager",
      function: () => openDownloadManager(),
    },
    {
      id: "openmanager.open",
      label: "Open Manager: browse a pack",
      function: async () => {
        const packId = await askText("Registry pack id", "was-node-suite-comfyui");
        if (packId) await openPack(packId);
      },
    },
    // The two ids the interface dispatches at a legacy manager. The first is what the
    // Extensions button sends; the second is its direct route to the pack browser.
    {
      id: "Comfy.Manager.Menu.ToggleVisibility",
      label: "Open Manager: toggle the menu",
      function: () => (managerEntry() === "classic"
        ? openManagerMenu()
        : togglePanelWindow("registry")),
    },
    {
      id: "Comfy.Manager.CustomNodesManager.ToggleVisibility",
      label: "Open Manager: toggle the pack browser",
      function: () => togglePanelWindow("registry"),
    },
  ],
  // ComfyUI asks each extension what to add to a node's right-click menu.
  getNodeMenuItems(node) {
    if (panelSetting("openManager.nodeModelMenu", true) === false) return [];
    const items = [null];
    const declared = nodeModels(node);
    if (declared.length) {
      items.push({
        content: `Download ${declared.length} model${declared.length === 1 ? "" : "s"} for this node`,
        callback: () => downloadNodeModels(node),
      });
    }
    items.push({
      content: "Add a model URL to this node",
      callback: () => addModelUrlToNode(node),
    });
    return items;
  },
  // ComfyUI reports the graph's missing node types here on every workflow load.
  afterConfigureGraph(missingNodeTypes) {
    lastMissingTypes = Array.isArray(missingNodeTypes)
      ? missingNodeTypes.map((m) => (typeof m === "string" ? m : m?.type || m?.name)).filter(Boolean)
      : null;
    refreshMissingIfActive();
  },
  setup() {
    app.extensionManager.registerSidebarTab({
      id: "openmanager",
      icon: "om-tab-icon",
      title: "Manager",
      tooltip: "Open Manager: browse the registry",
      type: "custom",
      render: renderSidebar,
    });
    // The legacy menu has no sidebar, so it gets a button to the same panel.
    addLegacyMenuButton();
    // The ways in at the right of the workflow tab strip: downloads, the library, the monitor.
    topbarReady = true;
    mountTopbar();
    // Wired once for the session rather than per mount: a remount that added another set of
    // listeners would count every node twice, then three times.
    wireRunBar();

    // Which interface ComfyUI is running, before anything asks which way in to offer.
    readLegacyUi().catch(() => {});
    migrateEntryMode();

    // Which keys are held, before anything that might want one runs. The move out of
    // ComfyUI's settings follows, and happens at most once.
    loadKeys().then(() => migrateKeys()).catch(() => {});

    // What is already on disk, so registry rows can say "Installed" on first paint.
    loadInstalledIndex();
    // Who the reader trusts, so rows can be badged and filtered without asking per row.
    loadTrustedAuthors();

    // Themes registered beside the built-ins, each carrying its grid background and its light
    // or dark UI mode.
    applyWindowLook();
    registerThemes().catch(() => {});
    watchThemeExtras();
    // One-time, and only for the value an earlier version of this extension wrote.
    repairLinkMode().then((fixed) => {
      if (!fixed) return;
      notify("Link shape put back",
        `An earlier version of Open Manager set ComfyUI's link render mode to ${fixed.from} `
        + `for every theme, including ComfyUI's own. It has been set back to ${fixed.to}, `
        + "which is ComfyUI's default. If you did want "
        + `${fixed.from}, set it under Settings > Lite Graph > Link Render Mode; this will `
        + "not change it again.");
    }).catch(() => {});
    // Renew the offline registry per the configured policy. The backend guards against
    // running more than once per server session.
    const policy = app.extensionManager.setting.get("openManager.autoRenew") ?? "startup";
    const staleDays = app.extensionManager.setting.get("openManager.staleDays") ?? 7;
    api.fetchApi(`${API}/catalog/auto-sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ policy, stale_days: staleDays, ...syncOptions() }),
    }).catch(() => {});
  },
});

window.openManager = { openPack };
