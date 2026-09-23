import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { nodeTint, refreshExtras, registerThemes, repairLinkMode, watchThemeExtras } from "./themes.js";

const API = "/open_manager/v1/api";

const OM_BUILD = "0.2.0-desktop";

const iconUrl = (name) =>
  `${new URL(name, import.meta.url).href}?v=${encodeURIComponent(OM_BUILD)}`;

const ICON_TAB = iconUrl("./discovery.svg");

const ICON_BRAND = iconUrl("./open-manager.svg");

const ICON_PROGRAM = iconUrl("./program.svg");

const ICON_MEMORY = iconUrl("./memory.svg");

const ICON_DOWNLOADS = iconUrl("./downloads.svg");

const ICON_LIBRARY = iconUrl("./library.svg");

const ICON_DESKTOP = iconUrl("./desktop.svg");

const ICON_FOLDER = iconUrl("./folder.svg");

const ICON_NOTE = iconUrl("./note.svg");

const ICON_FILE = iconUrl("./file.svg");

const ICON_BIN = iconUrl("./bin.svg");

const ICON_FLOW = iconUrl("./workflow.svg");

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

const FLOAT_Z = 1300;
const FLOAT_Z_TOP = 1398;
const TASKBAR_Z = 1399;

const DESK_Z = 900;

const MODAL_Z = 1400;
const MENU_Z = 1450;
const HOST_MENU_Z = 1900;

const LOADING_GRACE = 180;

const style = document.createElement("style");
style.textContent = `
:root {
  --om-bg: var(--comfy-menu-bg, #16181d);
  --om-surface: var(--comfy-input-bg, #1b1f24);
  --om-input: var(--comfy-input-bg, #0d1117);
  --om-border: var(--border-color, #30363d);
  --om-hover: var(--content-hover-bg, #30363d);
  --om-text: var(--fg-color, #e6edf3);
  --om-text-2: var(--input-text, #adbac7);
  --om-muted: var(--descrip-text, #8b949e);
  --om-bar-h: 0px;
  --om-scroll: var(--descrip-text, #8b949e);
}
.om-backdrop {
  position: fixed; inset: 0; background: rgba(0,0,0,.65);
  display: flex; align-items: center; justify-content: center; z-index: ${MODAL_Z};
}
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
.om-hero-bare .om-icon { width: 120px; height: 120px; border-radius: 12px; }
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
[data-om-tint] { box-shadow: inset 0 -2px 0 var(--om-tab-tint);
  background: color-mix(in srgb, var(--om-tab-tint) 14%, var(--om-tab-under, #151915)) !important;
  --comfy-menu-bg: color-mix(in srgb, var(--om-tab-tint) 14%, var(--om-tab-under, #151915)); }
[data-om-tint].p-togglebutton-checked {
  background: color-mix(in srgb, var(--om-tab-tint) 28%, var(--om-tab-under, #151915)) !important;
  --comfy-menu-bg: color-mix(in srgb, var(--om-tab-tint) 28%, var(--om-tab-under, #151915)); }
[data-om-titled] .workflow-label { display: none !important; }
.om-tab-title { display: inline-block; max-width: 150px; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap; font-size: .875rem; }
.om-tab-row { display: flex !important; align-items: center; gap: 10px;
  justify-content: space-between; cursor: default; }
.om-tab-row-label { color: var(--om-muted, #8b949e); font-size: 12px; }
.om-tab-swatches { display: inline-flex; align-items: center; gap: 4px; }
.om-tab-swatch { width: 17px; height: 17px; padding: 0; border-radius: 50%; flex: none;
  display: inline-flex; align-items: center; justify-content: center; line-height: 1;
  border: 1px solid rgba(255,255,255,.28); background: transparent; cursor: pointer;
  font: 600 11px/1 system-ui, sans-serif; color: var(--om-muted, #8b949e); }
.om-tab-swatch-pick, .om-tab-swatch-off { color: var(--om-text, #e6edf3); }
.om-tab-swatch:hover { transform: scale(1.15); }
.om-tab-swatch-on { outline: 2px solid #fff; outline-offset: 1px; }
.om-tab-swatch-pick, .om-tab-swatch-off { border-style: dashed; }
.om-tab-name { max-width: 150px; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; padding: 2px 8px; border-radius: 5px; cursor: pointer;
  border: 1px solid var(--om-border, #2c332b); background: transparent; color: inherit;
  font: inherit; font-size: 12px; }
.om-tab-name:hover { border-color: #388bfd; }
.om-tab-split:not([class*="border"]) { height: 1px; margin: 4px 0; padding: 0;
  background: var(--om-border, #2c332b); }
.om-tab-picker { position: fixed; left: -100px; top: -100px; width: 1px; height: 1px;
  opacity: 0; pointer-events: none; }
.om-tip { position: fixed; z-index: 10020; max-width: 320px; padding: 6px 9px;
  border-radius: 6px; pointer-events: none; opacity: 0; transition: opacity .1s linear;
  background: var(--om-surface, #161b22); border: 1px solid var(--om-border, #2c332b);
  color: var(--om-text, #e6edf3); font: 11px/1.45 system-ui, sans-serif;
  box-shadow: 0 6px 18px rgba(0,0,0,.45); }
.om-tip-on { opacity: 1; }
.om-tip-lead { font-weight: 600; }
.om-tip-line { color: var(--om-muted, #8b949e); margin-top: 2px; }
.om-tip-data { max-width: 380px; }
.om-tip-facts { display: grid; grid-template-columns: max-content minmax(0, 1fr);
  gap: 2px 14px; margin: 4px 0 0; font-variant-numeric: tabular-nums; }
.om-tip-facts:first-child { margin-top: 0; }
.om-tip-facts dt { color: var(--om-muted, #8b949e); }
.om-tip-facts dd { margin: 0; color: var(--om-text, #e6edf3); overflow-wrap: anywhere; }
.om-tip-facts + .om-tip-line { margin-top: 5px; padding-top: 4px;
  border-top: 1px solid var(--om-border, #2c332b); }
.om-toasts { position: fixed; right: 16px; bottom: calc(16px + var(--om-bar-h, 0px));
  z-index: 10001;
  display: flex; flex-direction: column; gap: 8px; align-items: flex-end; }
.comfyui-body .fixed.bottom-0 { bottom: var(--om-bar-h, 0px); }
.comfyui-body .fixed.bottom-2 { bottom: calc(0.5rem + var(--om-bar-h, 0px)); }
.comfyui-body .fixed.bottom-4 { bottom: calc(1rem + var(--om-bar-h, 0px)); }
.comfyui-body .fixed.bottom-6 { bottom: calc(1.5rem + var(--om-bar-h, 0px)); }
.comfyui-body .fixed.bottom-8 { bottom: calc(2rem + var(--om-bar-h, 0px)); }
.om-toast { background: var(--om-surface); color: var(--om-text); border: 1px solid var(--om-border);
  border-left: 3px solid #388bfd; border-radius: 8px; padding: 10px 14px;
  font: 13px/1.4 system-ui, sans-serif; max-width: 420px; box-shadow: 0 6px 20px rgba(0,0,0,.4);
  display: flex; gap: 10px; align-items: center; }
.om-toast-ok { border-left-color: #2ea043; }
.om-toast-warn { border-left-color: #d29922; }
.om-toast-text { flex: 1; min-width: 0; }
.om-toast-x { flex: none; align-self: flex-start; background: none; border: none; padding: 0 2px;
  margin: 0 -6px 0 0; color: var(--om-muted); font-size: 18px; line-height: 1.1; cursor: pointer; }
.om-toast-x:hover { color: var(--om-text); }
.om-restart { gap: 12px; }
.om-toast .om-btn { flex: none; }
.om-note { background: var(--om-bg); color: var(--om-text); border: 1px solid var(--om-border); border-radius: 10px;
  padding: 18px 20px; width: min(90vw, 460px); font: 13px/1.5 system-ui, sans-serif;
  display: flex; flex-direction: column; gap: 12px; }
.om-note-title { font-size: var(--om-title-size, 15px); font-weight: 600; }
.om-note-body { color: var(--om-text-2); white-space: pre-wrap; }
.om-note-foot { display: flex; gap: 10px; justify-content: flex-end; }
.om-ictl { display: inline-flex; align-items: stretch; }
.om-ictl > .om-btn:not(:last-child) { border-top-right-radius: 0; border-bottom-right-radius: 0;
  border-right: none; }
.om-ictl .om-btn.om-caret { margin-left: 0; padding: 6px 9px; font-size: 11px; line-height: 1;
  border-top-left-radius: 0; border-bottom-left-radius: 0;
  background: var(--om-border); border-color: var(--om-border); color: var(--om-text-2);
  border-left: 1px solid rgba(1, 4, 9, .4); }
.om-ictl .om-btn.om-caret:hover { background: var(--om-hover); }
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
[data-reka-popper-content-wrapper]:has([data-reka-menu-content]),
[data-reka-popper-content-wrapper]:has([data-reka-context-menu-content]),
[data-reka-popper-content-wrapper]:has([role="menu"]) { z-index: ${HOST_MENU_Z} !important; }
.om-side-ictl .om-btn { padding: 5px 12px; font-size: 12px; }
.om-body { flex: 1; min-height: 0; overflow: auto; padding: 16px 20px; }
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
@media (prefers-reduced-motion: reduce) {
  .om-loading-spin { animation: none; border-top-color: var(--om-border); }
  .om-loading-text::after { content: "..."; animation: none; }
}
.om-readme-body { line-height: 1.6; overflow-wrap: anywhere; padding-inline: 24px; }
.om-readme-body img { max-width: 100%; height: auto; }
.om-readme-body pre { background: var(--om-input); padding: 10px; border-radius: 6px; overflow: auto; }
.om-readme-body h1, .om-readme-body h2 { border-bottom: 1px solid var(--om-border); padding-bottom: 4px; }
.om-readme-body a { color: #539bf5; }
.om-readme-body a.om-doc-link::after { content: " \\2197"; opacity: .55; font-size: .85em; }
.om-doc-trail { display: flex; align-items: center; gap: 10px; margin: 0 0 16px;
  padding: 16px 0 10px; border-bottom: 1px solid var(--om-border); }
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
.om-gh-mark { display: block; }
.om-repo-link { display: inline-flex; align-items: center; }
.om-icon-btn { display: inline-flex; align-items: center; justify-content: center;
  padding: 6px 10px; text-decoration: none; box-sizing: border-box; }
a.om-btn { text-decoration: none; color: var(--om-text); }
.om-gh-fallback { font-size: 13px; line-height: 1; }
.om-comfy-mark { display: block; width: 14px; height: 14px; }
.om-icon-btn .om-comfy-mark { width: 16px; height: 16px; }
.om-registry-link:hover { background: var(--om-hover); }
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
.om-readme-media { max-width: 100%; height: auto; border-radius: 6px; margin: 12px 0; display: block; }
.om-readme-gone { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap;
  margin: 12px 0; padding: 8px 12px; border-left: 3px solid var(--om-border);
  background: var(--om-surface); border-radius: 0 6px 6px 0; }
.om-readme-gone-note { color: var(--om-muted); font-size: 12px; }
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
.om-panel .om-versions { border: none; border-radius: 0; background: transparent; }
.om-versions .om-row { padding-right: 10px; }
.om-versions .om-row { border: none; border-bottom: 1px solid var(--om-surface); border-radius: 0; margin: 0; background: transparent; }
.om-versions .om-row:last-child { border-bottom: none; }
.om-versions .om-badge-local { background: var(--om-input); color: var(--om-text-2);
  border: 1px solid var(--om-border); }
.om-row-local .om-ver { color: var(--om-text); }
.om-row-deprecated { opacity: .55; transition: opacity .12s ease; }
.om-versions .om-row-deprecated:hover,
.om-versions .om-row-deprecated:focus-within { opacity: 1; }
.om-ver { font-weight: 600; font-family: ui-monospace, monospace; }
.om-badge { padding: 2px 9px; border-radius: 999px; font-size: 11px; font-weight: 600;
  text-transform: uppercase; color: var(--om-input); display: inline-block; }
.om-marks { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; min-width: 0; }
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

const safeUrl = (value) => {
  const text = String(value ?? "").trim();
  return /^https?:\/\//i.test(text) ? text : "";
};

const ART_BAD = /["'()\\\s<>]/;

const safeArt = (value) => {
  const text = String(value ?? "").trim();
  if (!text || ART_BAD.test(text)) return "";
  if (/^https?:\/\//i.test(text)) return text;
  return /^\/(?!\/)/.test(text) ? text : "";
};

const openUrl = (value) => {
  const url = safeUrl(value);
  if (url) window.open(url, "_blank", "noopener,noreferrer");
  else if (String(value ?? "").trim()) {
    notify("Link not opened", "This link is not an http(s) URL.");
  }
};

const badge = (status) => {
  const node = el("span", "om-badge", status);
  node.style.background = STATUS_COLOUR[status] || STATUS_COLOUR.unknown;
  return node;
};

function closeOn(backdrop, dismiss) {
  const shut = dismiss || (() => backdrop.remove());
  let pressedAway = false;
  backdrop.addEventListener("mousedown", (event) => {
    pressedAway = event.target === backdrop;
  });
  backdrop.addEventListener("click", (event) => {
    if (pressedAway && event.target === backdrop) shut();
    pressedAway = false;
  });
  const onKey = (event) => {
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
  const replacements = report.replacements || [];
  if (replacements.some((item) => item.abi)) {
    gate.textContent = "Install anyway (breaks binary packages)";
    gate.className = "om-btn om-danger";
  } else if (replacements.some((item) => item.core && item.direction === "downgrade")) {
    gate.textContent = "Downgrade dependencies and install";
    gate.className = "om-btn om-danger";
  }
}

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

function versionSwitch(installed, chosen) {
  if (!installed || installed === "present" || installed === chosen) return null;
  const cmp = compareVersions(chosen, installed);
  return { from: installed, to: chosen, direction: cmp < 0 ? "downgrade" : cmp > 0 ? "upgrade" : "reinstall" };
}

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
    closeOn(backdrop, () => { backdrop.remove(); resolve(false); });

    appendImpact(packId, entry.version, impactSlot, go);
  });
}


function toastHost() {
  let host = document.querySelector(".om-toasts");
  if (!host) { host = el("div", "om-toasts"); document.body.appendChild(host); }
  return host;
}

function toastShut(node, after) {
  const close = el("button", "om-toast-x", "×");
  close.title = "Close";
  close.setAttribute("aria-label", "Close");
  close.onclick = () => { node.remove(); after?.(); };
  node.appendChild(close);
  return close;
}

function toast(message, opts = {}) {
  const node = el("div", `om-toast${opts.kind ? " om-toast-" + opts.kind : ""}`);
  const body = el("span", "om-toast-text", message);
  node.appendChild(body);
  let timer = 0;
  toastShut(node, () => clearTimeout(timer));
  toastHost().appendChild(node);
  timer = opts.sticky ? 0 : setTimeout(() => node.remove(), opts.duration || 4000);
  return {
    set: (text) => { body.textContent = text; },
    kind: (k) => { node.className = `om-toast om-toast-${k}`; },
    settle: (text, kind, duration = 6000) => {
      body.textContent = text;
      node.className = `om-toast om-toast-${kind}`;
      clearTimeout(timer);
      timer = setTimeout(() => node.remove(), duration);
    },
    remove: () => { clearTimeout(timer); node.remove(); },
  };
}


let restartToast = null;

function remindRestart() {
  if (restartToast) return;
  const node = el("div", "om-toast om-toast-warn om-restart");
  node.appendChild(el("span", "om-toast-text", "Restart to load the changes."));
  const button = el("button", "om-btn om-go", "Restart server");
  button.onclick = () => restartServer(button);
  node.appendChild(button);
  toastShut(node, () => { if (restartToast === node) restartToast = null; });
  toastHost().appendChild(node);
  restartToast = node;
}

async function restartServer(button) {
  button.disabled = true;
  button.textContent = "Restarting...";
  try {
    await api.fetchApi(`${API}/reboot`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
    });
  } catch (error) {
  }
  const started = Date.now();
  const waitForUp = async () => {
    try {
      const answer = await api.fetchApi("/system_stats", { cache: "no-store" });
      if (answer.ok) { location.reload(); return; }
    } catch (error) {
    }
    if (Date.now() - started < 180000) {
      setTimeout(waitForUp, 1500);
    } else {
      button.disabled = false;
      button.textContent = "Restart server";
      notify("Restart timed out", "The server did not come back within three minutes.");
    }
  };
  setTimeout(waitForUp, 3000);
}


const TIP_DELAY = 220;

const TIP_BEAT = 400;

const tip = { node: null, host: null, timer: 0, opening: 0 };

function tipNode() {
  if (!tip.node) {
    tip.node = el("div", "om-tip");
    tip.node.setAttribute("role", "tooltip");
    tip.node.id = "om-tip";
    document.body.appendChild(tip.node);
  }
  return tip.node;
}

const tipLines = (value) => (Array.isArray(value) ? value : [value])
  .flatMap((one) => String(one ?? "").split("\n"))
  .map((one) => one.trim())
  .filter(Boolean);

function tipShape(said) {
  if (said && typeof said === "object" && !Array.isArray(said)) {
    const lead = tipLines(said.lead);
    return {
      lead: lead[0] || "",
      facts: (said.facts || []).filter((one) => Array.isArray(one) && one[1]),
      lines: [...lead.slice(1), ...tipLines(said.lines)],
    };
  }
  const lines = tipLines(said || "");
  return { lead: lines.shift() || "", facts: [], lines };
}

const tipBare = (shape) => !shape.lead && !shape.facts.length && !shape.lines.length;

function tipWith(said, ...more) {
  const lines = more.filter(Boolean);
  if (!lines.length) return said;
  const shape = tipShape(said);
  return { ...shape, lines: [...shape.lines, ...lines] };
}

function tipSpoken(shape) {
  const said = [];
  if (shape.lead) said.push(shape.lead);
  if (shape.facts.length) {
    said.push(shape.facts.map(([label, value]) => `${label} ${value}`).join(", "));
  }
  said.push(...shape.lines);
  return said.map((one) => (/[.:;?!]$/.test(one) ? one : `${one}.`)).join(" ");
}

function tipSay(shape) {
  const node = tipNode();
  const parts = [];
  if (shape.lead) parts.push(el("div", "om-tip-lead", shape.lead));
  if (shape.facts.length) parts.push(factList(shape.facts, "om-tip-facts"));
  for (const line of shape.lines) parts.push(el("div", "om-tip-line", line));
  node.replaceChildren(...parts);
  node.classList.toggle("om-tip-data", shape.facts.length > 0);
  node.setAttribute("aria-label", tipSpoken(shape));
  return node;
}

function tipPlace(host) {
  const node = tipNode();
  const at = host.getBoundingClientRect();
  const box = node.getBoundingClientRect();
  const gap = 8;
  let top = at.bottom + gap;
  if (top + box.height > window.innerHeight - 4) top = Math.max(4, at.top - box.height - gap);
  let left = at.left + at.width / 2 - box.width / 2;
  left = Math.max(6, Math.min(left, window.innerWidth - box.width - 6));
  node.style.top = `${Math.round(top)}px`;
  node.style.left = `${Math.round(left)}px`;
}

function tipClose() {
  clearTimeout(tip.opening);
  clearInterval(tip.timer);
  tip.timer = 0;
  tip.host?.removeAttribute("aria-describedby");
  tip.host = null;
  tip.node?.classList.remove("om-tip-on");
}

function tipOpen(host) {
  const shape = tipShape(host.__omTip?.());
  if (tipBare(shape)) { tipClose(); return; }
  tip.host = host;
  host.setAttribute("aria-describedby", "om-tip");
  tipSay(shape).classList.add("om-tip-on");
  tipPlace(host);
  clearInterval(tip.timer);
  tip.timer = setInterval(() => {
    if (!tip.host?.isConnected || tip.host !== host) { tipClose(); return; }
    const now = tipShape(host.__omTip?.());
    if (tipBare(now)) { tipClose(); return; }
    tipSay(now);
    tipPlace(host);
  }, TIP_BEAT);
}

function liveTip(host, say) {
  if (!host) return host;
  host.__omTip = typeof say === "function" ? say : () => say;
  host.removeAttribute("title");
  if (host.__omTipBound) return host;
  host.__omTipBound = true;
  const open = () => {
    clearTimeout(tip.opening);
    tip.opening = setTimeout(() => tipOpen(host), TIP_DELAY);
  };
  const shut = () => { if (tip.host === host || !tip.host) tipClose(); };
  host.addEventListener("pointerenter", open);
  host.addEventListener("pointerleave", shut);
  host.addEventListener("pointerdown", shut);
  host.addEventListener("focus", open);
  host.addEventListener("blur", shut);
  return host;
}


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
    closeOn(backdrop, () => { backdrop.remove(); resolve(false); });
  });
}

function factList(rows, cls = "om-facts") {
  const list = el("dl", cls);
  for (const [label, value] of rows) {
    if (!value) continue;
    list.appendChild(el("dt", null, label));
    list.appendChild(el("dd", null, value));
  }
  return list;
}

function chooseAction(title, message, choices,
                     { wide = false, facts = [], extra = null } = {}) {
  return new Promise((resolve) => {
    const backdrop = el("div", "om-backdrop");
    const box = el("div", `om-note${wide ? " om-note-wide" : ""}`);
    box.appendChild(el("div", "om-note-title", title));
    if (facts.length) box.appendChild(factList(facts));
    if (extra) box.appendChild(extra);
    if (message) {
      const body = el("div", "om-note-body", message);
      body.style.whiteSpace = "pre-line";
      box.appendChild(body);
    }
    const foot = el("div", "om-note-foot");
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
    closeOn(backdrop, () => { backdrop.remove(); resolve(""); });
  });
}


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
  control.setUpdate = (target, onUpdate) => {
    const label = button("Update", "om-btn installing", onUpdate);
    label.title = `Update to ${target}`;
    if (!withMenu) { wrap.replaceChildren(label); return; }
    wrap.replaceChildren(label, caretFor("installing"));
  };
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
  if (open) {
    const again = open._omAnchor === anchor;
    open.remove();
    if (again) return;
  }
  const menu = el("div", "om-menu");
  menu._omAnchor = anchor;
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


const installState = new Map();

const installedIndex = new Map();

const foldId = (value) => String(value ?? "").trim().toLowerCase().replace(/_/g, "-");

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
  }
}

function installedPack(packId) {
  return installedIndex.get(foldId(packId)) || null;
}

function updateTarget(record, newest) {
  if (!record || !newest) return "";
  if (!isRelease(record.version) || !isRelease(newest)) return "";
  if (isHeld(record)) return "";
  return compareVersions(newest, record.version) > 0 ? String(newest) : "";
}

const COMFY_LEAD = /^comfy[\s_-]?ui[\s_.-]+/i;
const COMFY_TRAIL = /[\s_.-]+comfy[\s_-]?ui$/i;

const NAME_FLOOR = 4;

function shortPackName(name) {
  const text = String(name || "").trim();
  const cut = text.replace(COMFY_LEAD, "").replace(COMFY_TRAIL, "").trim();
  return cut.length >= NAME_FLOOR ? cut : text;
}

function packName(name, cls) {
  const text = String(name || "");
  const shown = shortPackName(text);
  const holder = el("span", cls, shown);
  if (shown !== text) holder.title = text;
  return holder;
}

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
  if (entry.is_self) {
    const here = el("div", `om-ictl ${cls}`);
    const button = el("button", "om-btn", "About");
    button.title = "About and updates";
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
  const ahead = updateTarget(onDisk, entry.advertised);
  const busy = installState.get(entry.id);
  if (ahead && (!busy || busy === "installed")) {
    control.setUpdate(ahead, () => quickInstall(entry.id, control));
  }
  control.el.classList.add(cls);
  return control;
}

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
  const restoreOffers = [];
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
          allow_banned: allowBanned(),
          with_deps: !job.scanFirst,
        }),
      });
      result = await answer.json();
    } catch (error) {
      result = { ok: false, reason: error.message };
    }
    if (result.ok) {
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

async function openEnvironmentDialog() {
  const backdrop = el("div", "om-backdrop");
  const box = el("div", "om-note om-note-wide");
  box.appendChild(el("div", "om-note-title", "Environment changes"));
  box.appendChild(el("div", "om-dl-note",
    "Installs that changed packages, newest first. Restoring needs a restart."));
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
        "No package changes recorded."));
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

async function showInstallFailure(job, result) {
  const backdrop = el("div", "om-backdrop");
  const box = el("div", "om-note om-note-wide");
  box.appendChild(el("div", "om-note-title",
    `${job.name}: requirements did not install`));
  box.appendChild(el("div", "om-dl-note",
    "The pack is on disk but may not load, or may load with parts missing."));

  const ran = result.installer === "uv" ? "uv" : "pip";
  const errors = result.pip_errors || [];
  if (errors.length) {
    const why = el("div", "om-keys-row");
    why.appendChild(el("div", "om-dl-name", `What ${ran} said`));
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
    const log = panel(`${ran} output`, "the last of it", { open: !errors.length });
    const body = el("div", "om-chg-text");
    body.textContent = result.pip_output;
    log.body.appendChild(body);
    box.appendChild(log);
  }

  const summary = environmentSummary(result.environment);
  box.appendChild(el("div", "om-dl-note", summary
    ? `Python environment changed: ${summary}.`
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

async function offerRestore(entryId, packName) {
  let preview;
  try {
    preview = await dlPost("/environment/restore", { id: entryId });
  } catch (error) {
    notify("Could not read the record", error.message);
    return;
  }
  if (!preview?.ok) {
    notify("Could not read the record", preview?.reason || "");
    return;
  }
  const plan = preview.plan || {};
  const facts = [];
  if (plan.uninstall?.length) facts.push(["Uninstall", plan.uninstall.join(", ")]);
  if (plan.install?.length) facts.push(["Put back", plan.install.join(", ")]);
  for (const one of plan.refused || []) {
    facts.push([`Left alone: ${one.name}`, one.reason]);
  }
  facts.push(["Afterwards", "ComfyUI needs a restart."]);
  if (!plan.uninstall?.length && !plan.install?.length) {
    notify("Nothing to put back",
      "Everything this install changed is left alone: pip or ComfyUI depends on it.");
    return;
  }

  const go = await chooseAction(`Restore packages to before ${packName}?`,
    "Packs installed since may depend on these packages.",
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
  const installed = rowsRoot ? rowsRoot._installedVersion : "";
  const change = versionSwitch(installed, entry.version);
  if (panelSetting("openManager.trustRegistry", false) === true) {
    const repository = await repositoryForPack(packId, entry, rowsRoot);
    const parts = repoOwnerName(repository);
    if (parts && !(await confirmAuthorTrust(parts.owner, repository, "install a pack"))) return;
  }
  if (!(await confirmInstall(packId, entry, change))) return;

  let scanFirst = vtReady() && panelSetting("openManager.scanOnInstall", false) === true;
  if (scanFirst && (await vtRemaining()) === 0) {
    const go = await confirmAction(
      "VirusTotal allowance spent",
      `${packId} cannot be scanned before it installs. Install without scanning?`,
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

const trustedAuthors = new Set();

async function loadTrustedAuthors() {
  try {
    const answer = await api.fetchApi(`${API}/trust`);
    const authors = (await answer.json()).authors || [];
    trustedAuthors.clear();
    for (const row of authors) trustedAuthors.add(foldId(row.owner));
  } catch {
  }
}

function byTrustedAuthor(entry) {
  const parts = repoOwnerName(entry?.repository || "");
  return !!parts && trustedAuthors.has(foldId(parts.owner));
}

function trustBadge(entry) {
  if (!byTrustedAuthor(entry)) return null;
  const parts = repoOwnerName(entry.repository);
  const pill = el("span", "om-trusted", "✓ trusted");
  pill.title = `You trust ${parts.owner}`;
  return pill;
}

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

async function authorStanding(owner, repo, consultList) {
  const standing = { owner, trusted: false, stars: null, created: null, pushed: null, packs: 0 };
  if (consultList) {
    try {
      const answer = await api.fetchApi(`${API}/trust?owner=${encodeURIComponent(owner)}`);
      standing.trusted = (await answer.json()).trusted === true;
    } catch {
    }
    if (standing.trusted) return standing;
  }
  try {
    const answer = await api.fetchApi(`${API}/repo-meta?repo=${encodeURIComponent(repo)}`);
    const meta = await answer.json();
    standing.stars = meta.stars ?? null;
    standing.pushed = meta.pushed_at || null;
  } catch {}
  try {
    const answer = await api.fetchApi(`${API}/installed`);
    const packs = (await answer.json()).packs || [];
    standing.packs = packs.filter((pack) => {
      const url = (pack.repository || "").toLowerCase();
      return url.includes(`github.com/${owner.toLowerCase()}/`);
    }).length;
  } catch {}
  return standing;
}

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
      toast(`Could not remember ${owner}.`, { kind: "warn" });
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
      "Not scanned by the registry. A pack runs with ComfyUI's privileges."));
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
    `This removes ${packId} from custom_nodes.`,
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

function repoOwnerName(url) {
  const match = /github\.com[/:]+([^/]+)\/([^/#?]+)/i.exec(url || "");
  return match ? { owner: match[1], repo: match[2].replace(/\.git$/, "") } : null;
}

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
  }
}

async function starRepo(repository, button) {
  const parts = repoOwnerName(repository);
  if (!parts) { if (repository) openUrl(repository); return; }
  const openRepo = () =>
    window.open(`https://github.com/${parts.owner}/${parts.repo}`, "_blank", "noopener,noreferrer");
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

function tagChip(tag) {
  const chip = el("button", "om-tag om-tag-go", tag);
  chip.title = `Find other packs tagged ${tag}`;
  chip.onclick = () => browseTopic(String(tag).toLowerCase());
  return chip;
}

function packRoot(node) {
  return node?.closest(".om-dialog, .om-float") || null;
}

async function openPack(packId) {
  const already = floatingPanel(`pack:${packId}`);
  if (already) { already.present(); return already; }
  const showing = document.querySelector(".om-backdrop[data-om-pack]");
  if (showing?.dataset.omPack === packId) return;

  const backdrop = el("div", "om-backdrop");
  backdrop.dataset.omPack = packId;
  const dialog = el("div", "om-dialog");
  dialog.appendChild(el("div", "om-body", `Reading ${packId} from the registry...`));
  backdrop.appendChild(dialog);
  closeOn(backdrop);

  let waiting = null;
  const showWaiting = () => {
    if (waiting !== "shown") {
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

  const close = el("button", "om-x", "×");
  close.title = "Close";
  close.onclick = () => backdrop.remove();
  dialog.appendChild(close);

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

const WINDOW_SETTINGS = {
  manager: "openManager.windowManager",
  packs: "openManager.windowPacks",
  downloads: "openManager.windowDownloads",
  library: "openManager.windowLibrary",
  memory: "openManager.windowMemory",
};

function asWindow(surface) {
  return panelSetting(WINDOW_SETTINGS[surface], true) !== false;
}

const WINDOW_SCALE = { compact: 0.8, standard: 1, large: 1.25 };

const WINDOW_SIZES = {
  manager: { vw: 0.66, vh: 0.70, min: [420, 320], max: [1600, 1200] },
  pack: { vw: 0.72, vh: 0.74, min: [420, 340], max: [1800, 1300] },
  downloads: { vw: 0.56, vh: 0.50, min: [380, 280], max: [1300, 900] },
  library: { vw: 0.62, vh: 0.58, min: [420, 320], max: [1500, 1000] },
  memory: { vw: 0.44, vh: 0.60, min: [340, 320], max: [1000, 1000] },
  desktop: { vw: 0.34, vh: 0.62, min: [360, 420], max: [720, 1000] },
  folder: { vw: 0.34, vh: 0.46, min: [300, 240], max: [760, 900] },
  note: { vw: 0.40, vh: 0.56, min: [340, 280], max: [900, 1100] },
  props: { vw: 0.24, vh: 0.44, min: [280, 260], max: [520, 760] },
};

const WINDOW_ROOM = { width: 0.94, height: 0.88 };

function windowSize(name) {
  const spec = Object.hasOwn(WINDOW_SIZES, name) ? WINDOW_SIZES[name] : WINDOW_SIZES.manager;
  const scale = windowScale();
  const pick = (share, extent, low, high, room) => Math.round(
    Math.max(low, Math.min(high, extent * room, extent * share * scale)));
  const tall = pick(spec.vh, workHeight(), spec.min[1], spec.max[1], WINDOW_ROOM.height);
  return {
    width: pick(spec.vw, window.innerWidth, spec.min[0], spec.max[0], WINDOW_ROOM.width),
    height: Math.max(120, tall - headerHeight()),
  };
}

function windowScale() {
  const asked = String(panelSetting("openManager.windowSize", "standard") || "standard");
  return WINDOW_SCALE[asked] ?? 1;
}

const TEXT_LIMITS = { title: [10, 28], body: [10, 22] };

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
  document.body.classList.toggle("om-blur-inactive",
    panelSetting("openManager.blurInactive", false) !== false);
  root.style.setProperty("--om-blur-back",
    `${clamp([1, 12], panelSetting("openManager.blurAmount", 3), 3)}px`);
  applyAero();
  for (const panel of floatPanels.values()) panel.refreshIcon?.();
}

function applyAero() {
  const root = document.documentElement;
  const on = panelSetting("openManager.aero", false) === true;
  document.body.classList.toggle("om-aero", on);
  if (!on) return;
  const held = (name, low, high, fallback) =>
    Math.min(high, Math.max(low, Number(panelSetting(name, fallback)) || fallback));
  root.style.setProperty("--om-aero-alpha",
    `${held("openManager.aeroAlpha", 10, 100, 55)}%`);
  root.style.setProperty("--om-aero-dark",
    String(held("openManager.aeroDark", 0, 70, 18) / 100));
  root.style.setProperty("--om-aero-blur",
    `${held("openManager.aeroBlur", 0, 40, 12)}px`);
}

function showPackWindow(packId, data) {
  const panel = createFloatingPanel({
    key: `pack:${packId}`,
    title: data.pack?.name || packId,
    ...windowSize("pack"),
    centred: true,
  });
  panel.setIcon(data.pack?.icon || "");
  if (panel.body.childElementCount) return panel;
  try {
    buildPackBody(panel.body, data);
  } catch (error) {
    panel.body.replaceChildren(
      packProblem(`Could not show ${packId}`, error, { remove: panel.destroy }));
  }
  return panel;
}

async function localPack(packId) {
  try {
    const answer = await api.fetchApi(`${API}/local/${encodeURIComponent(packId)}`);
    const found = await answer.json();
    return found?.ok ? found : null;
  } catch {
    return null;
  }
}

function showLocalPackWindow(packId, info) {
  const panel = createFloatingPanel({
    key: `pack:${packId}`,
    title: info.pyproject?.display_name || info.pyproject?.name || packId,
    ...windowSize("pack"),
    centred: true,
  });
  panel.setIcon(info.pyproject?.icon || "");
  if (panel.body.childElementCount) return panel;
  buildLocalPackBody(panel.body, info);
  return panel;
}

function remoteToUrl(remote) {
  const text = String(remote || "").trim();
  if (!text) return "";
  const ssh = text.match(/^(?:ssh:\/\/)?git@([^:/]+)[:/](.+?)(?:\.git)?$/);
  if (ssh) return `https://${ssh[1]}/${ssh[2]}`;
  return safeUrl(text.replace(/\.git$/, "")) || "";
}

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
    " Read from the files in this directory. No published versions, registry status or "
    + "findings."));
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
        ? "This pack is switched off."
        : "ComfyUI lists no nodes from this pack."));
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

function registryReason(data, status) {
  const detail = data?.detail ?? data?.reason ?? "";
  if (typeof detail === "string" && detail.trim().startsWith("{")) {
    try {
      const inner = JSON.parse(detail);
      const said = inner.message || inner.error;
      if (said) return `the registry says: ${said}`;
    } catch {
    }
  }
  if (data?.status === 404 || status === 404) return "the registry has no entry for it";
  return String(detail || `HTTP ${status}`);
}

function buildPackBody(dialog, { pack, resolution, versions }) {

  const hero = el("div", "om-hero");
  if (pack.banner) {
    const banner = el("img", "om-banner");
    banner.src = pack.banner;
    banner.onerror = () => { banner.remove(); hero.classList.add("om-hero-bare"); };
    hero.appendChild(banner);
  } else {
    hero.classList.add("om-hero-bare");
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
  const members = pack.publisher_members || [];
  chip("author", pack.author || members.join(", "));
  const declaring = versions.find((entry) => entry.compatibility?.declared);
  if (declaring) {
    const node = el("span", "om-chip");
    node.appendChild(el("b", null, "requires"));
    node.appendChild(document.createTextNode(" "
      + declaring.compatibility.notes.map((n) => `${n.label} ${n.declared}`).join(" · ")));
    if (declaring.compatibility.state === "differs") node.classList.add("om-chip-differs");
    node.title = `Declared by version ${declaring.version}.`;
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

  const body = el("div", "om-body");
  body.appendChild(hero);
  body.appendChild(el("div", "om-release-slot"));

  if (resolution.newest_is_hidden) {
    const notice = el("div", "om-notice");
    notice.appendChild(el("b", null,
      `Registry latest ${resolution.registry_advertises || "none"} · newest published ${resolution.newest}`));
    body.appendChild(notice);
  }

  const versionsBox = el("div", "om-versions");
  versionsBox._installedVersion = pack.installed_version || "";
  for (const entry of versions) {
    const row = el("div", "om-row");
    row.title = versionFacts(entry);
    if (entry.deprecated) row.classList.add("om-row-deprecated");
    const number = el("div", "om-ver", entry.version);
    if (entry.compatibility?.state === "differs") {
      const flag = el("span", "om-ver-flag", "!");
      flag.title = entry.compatibility.notes
        .filter((n) => n.state === "differs")
        .map((n) => `Declares ${n.label} ${n.declared}; this install reports ${n.yours}.`)
        .join("\n")
        + "\nIt installs either way.";
      number.appendChild(flag);
    }
    row.appendChild(number);
    const marks = el("div", "om-marks");
    const mark = badge(entry.status);
    mark.dataset.version = entry.version;
    mark.title = `Status: ${entry.status}`;
    marks.appendChild(mark);
    row.appendChild(marks);
    row.appendChild(el("div", "om-why", (entry.created_at || "").slice(0, 10)));

    const worst = entry.assessment?.findings?.[0];
    row.appendChild(el("div", "om-why", worst ? worst.title : "no findings"));

    if (entry.installable === false) {
      const blocked = el("span", "om-blocked", "Blocked");
      blocked.title = entry.blocked_reason || "Blocked by policy";
      row.appendChild(blocked);
    } else {
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
        const change = versionSwitch(pack.installed_version || "", entry.version);
        control.setInstall(change
          ? { downgrade: "Downgrade", upgrade: "Upgrade", reinstall: "Reinstall" }[change.direction]
          : "");
      }
      row.appendChild(control.el);
    }
    versionsBox.appendChild(row);
  }
  const localVersion = pack.installed_version || installedPack(pack.id)?.version || "";
  if (localVersion && !versions.some((one) => one.version === localVersion)) {
    const record = installedPack(pack.id);
    const row = el("div", "om-row om-row-local");
    row.title = `${localVersion} is installed here and not published on the registry.`;
    row.appendChild(el("div", "om-ver", localVersion));
    const marks = el("div", "om-marks");
    const chip = el("span", "om-badge om-badge-local", "local");
    chip.title = "Installed here, and not a version the registry publishes.";
    marks.appendChild(chip);
    row.appendChild(marks);
    row.appendChild(el("div", "om-why", record?.installed_at
      ? installedText(new Date(Number(record.installed_at) * 1000))
      : "on disk"));
    row.appendChild(el("div", "om-why",
      record?.from_git ? "from a repository" : "not assessed"));
    let control;
    control = makeInstallControl({
      packId: pack.id,
      entry: { version: localVersion, status: "active", name: pack.name || pack.id },
      rowsRoot: versionsBox,
      withMenu: Boolean(record),
      items: record
        ? installedMenu(record, { version: localVersion, name: pack.name || pack.id },
                        () => control, versionsBox)
        : undefined,
    });
    control.setInstalled();
    row.appendChild(control.el);
    versionsBox.insertBefore(row, versionsBox.firstChild);
  }
  const versionNote = [`${versions.length} published`];
  if (pack.installed_version) {
    versionNote.push(`installed ${pack.installed_version}`
      + (versions.some((one) => one.version === pack.installed_version) ? "" : " (local)"));
  }
  else if (resolution.newest) versionNote.push(`newest ${resolution.newest}`);
  const tabs = tabbedPanel({ remember: "om-pack-tab" });
  body.appendChild(tabs.root);
  tabs.add({
    id: "versions",
    title: "Versions",
    note: versionNote.join(" · "),
    order: 10,
    pane: versionsBox,
  });
  attachStatusReasons(pack.id, versionsBox, versions);

  const shownVersion = pack.installed_version
    || (installedPack(pack.id)?.version || (installedPack(pack.id) ? "installed" : ""))
    || resolution.newest || versions[0]?.version;
  if (shownVersion) {
    const nodesPane = el("div", "om-tabpane");

    let atVersion = shownVersion;
    let held = [];
    let source = "";
    let term = "";
    let group = "";
    let installedHere = "";

    const pickable = versions.map((entry) => entry.version);
    const onDisk = installedPack(pack.id);
    const mineVersion = pack.installed_version || onDisk?.version || "";
    const picker = el("select", "om-side-select om-nodes-at");
    const option = (version, label) => {
      const made = el("option", null, label || version);
      made.value = version;
      if (version === shownVersion) made.selected = true;
      return made;
    };
    for (const version of pickable) {
      picker.appendChild(option(version,
        version === mineVersion ? `${version} (Installed)` : version));
    }
    if (mineVersion && !pickable.includes(mineVersion)) {
      const mine = option(mineVersion, `${mineVersion} (Installed)`);
      const after = [...picker.options]
        .find((one) => compareVersions(mineVersion, one.value) > 0);
      picker.insertBefore(mine, after || null);
    } else if (!mineVersion && onDisk) {
      picker.insertBefore(option("installed", "Installed copy"), picker.firstChild);
    }
    picker.title = "Which version's node list to show";
    picker.onclick = (event) => event.stopPropagation();

    const finder = el("input", "om-search om-nodes-find");
    finder.type = "search";
    finder.placeholder = "Filter by name, category or description";
    finder.spellcheck = false;
    finder.onclick = (event) => event.stopPropagation();
    const groups = el("select", "om-side-select om-nodes-group");
    groups.onclick = (event) => event.stopPropagation();
    groups.title = "Show one category only";

    const bar = el("div", "om-nodes-bar");
    bar.appendChild(el("span", "om-ref-label", "version"));
    bar.appendChild(picker);
    bar.appendChild(finder);
    bar.appendChild(groups);
    const nodesBar = () => bar;

    let loaded = false;
    const fill = async (wantIndex = false) => {
      if (loaded && !wantIndex) return;
      loaded = true;
      nodesPane.replaceChildren(loadingBlock("Reading the node list"));
      let data;
      try {
        const query = new URLSearchParams({ version: atVersion, repo: pack.repository || "" });
        if (wantIndex) query.set("index", "1");
        const answer = await api.fetchApi(
          `${API}/comfy-nodes/${encodeURIComponent(pack.id)}?${query}`);
        data = await answer.json();
        if (!data.ok) throw new Error(data.reason || `HTTP ${answer.status}`);
      } catch (error) {
        loaded = false;
        nodesPane.replaceChildren(nodesBar(), el("div", "om-side-status",
          `The node list could not be read: ${error.message}`));
        return;
      }
      if (!data.known) {
        const empty = el("div", "om-nodelist");
        empty.appendChild(el("div", "om-side-status",
          installedHere && installedHere !== atVersion
            ? `No node list published for ${atVersion}. Version ${installedHere} is installed here.`
            : `No node list published for ${atVersion}.`));
        if (data.indexable) {
          const ask = el("button", "om-btn", "Look in the community index");
          ask.title = "Class names the repository registers, tied to no version.";
          ask.onclick = () => fill(true);
          const row = el("div", "om-actions");
          row.appendChild(ask);
          empty.appendChild(row);
        }
        nodesPane.replaceChildren(nodesBar(), empty);
        nodesTab.note("no list");
        return;
      }
      held = data.nodes;
      source = data.source || "";
      installedHere = data.installed || "";
      const seen = [...new Set(held.map((one) => one.category || "").filter(Boolean))].sort();
      groups.replaceChildren(el("option", null, "Every category"));
      groups.firstChild.value = "";
      for (const name of seen) {
        const option = el("option", null, name);
        option.value = name;
        groups.appendChild(option);
      }
      groups.style.display = seen.length > 1 ? "" : "none";
      group = seen.includes(group) ? group : "";
      groups.value = group;
      nodesTab.note(`${countNote(held.length, "node")}`
        + (source === "registry" ? ` in ${atVersion}`
          : source === "install"
            ? (atVersion === "installed" ? " in the installed copy" : ` in ${atVersion}, as installed`)
            : " from the index, no version"));
      render();
    };

    const matches = (one) => {
      if (group && (one.category || "") !== group) return false;
      if (!term) return true;
      const hay = (`${one.name} ${one.display_name || ""} ${one.category || ""} `
        + `${one.description || ""}`).toLowerCase();
      return term.split(/\s+/).every((word) => hay.includes(word));
    };

    const render = () => {
      const list = el("div", "om-nodelist");
      if (source && source !== "registry") {
        const from = el("div", "om-side-status om-nodelist-from",
          source === "install"
            ? (atVersion === "installed"
              ? "From the installed copy, which states no version."
              : `From the installed copy. The registry publishes no list for ${atVersion}.`)
            : `From the community index: the pack as last indexed, not ${atVersion}.`);
        list.appendChild(from);
      }
      const shown = held.filter(matches);
      if (!shown.length) {
        list.appendChild(el("div", "om-side-status",
          `Nothing matches${term ? ` "${finder.value.trim()}"` : ""}`
          + `${group ? ` in ${group}` : ""}. ${held.length} in the list.`));
        nodesPane.replaceChildren(nodesBar(), list);
        return;
      }
      for (const one of shown) {
        const item = el("div", "om-nodelist-item");
        const head = el("div", "om-chg-head");
        head.appendChild(el("div", "om-node-name", one.display_name || one.name));
        if (one.display_name && one.display_name !== one.name) {
          head.appendChild(el("div", "om-why", one.name));
        }
        if (one.deprecated) head.appendChild(el("span", "om-chg-here", "deprecated"));
        if (one.experimental) head.appendChild(el("span", "om-chg-here", "experimental"));
        if (one.category) head.appendChild(el("div", "om-why", one.category));
        item.appendChild(head);
        if (one.description) {
          const note = el("div", "om-chg-text");
          note.textContent = one.description;
          item.appendChild(note);
        }
        const ports = [];
        const inputs = one.inputs || {};
        if (inputs.required) ports.push(countNote(inputs.required, "required input"));
        if (inputs.optional) ports.push(`${inputs.optional} optional`);
        if (one.outputs?.length) ports.push(`outputs ${one.outputs.join(", ")}`);
        if (ports.length) item.appendChild(el("div", "om-why", ports.join(" · ")));
        nodeDragFrom(item, one);
        list.appendChild(item);
      }
      if (shown.length !== held.length) {
        list.appendChild(el("div", "om-side-status om-nodelist-from",
          `${shown.length} of ${held.length} shown.`));
      }
      nodesPane.replaceChildren(nodesBar(), list);
    };

    finder.oninput = () => { term = finder.value.trim().toLowerCase(); render(); };
    groups.onchange = () => { group = groups.value; render(); };

    picker.onchange = () => {
      atVersion = picker.value;
      loaded = false;
      fill();
    };
    const nodesTab = tabs.add({
      id: "nodes",
      title: "Nodes",
      order: 30,
      pane: nodesPane,
      onShow: fill,
    });
  }

  const noted = versions.filter((entry) => entry.changelog);
  {
    const list = el("div", "om-chg");
    if (!noted.length) {
      list.appendChild(el("div", "om-side-status", "No changelog published."));
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
      const note = el("div", "om-chg-text");
      note.textContent = entry.changelog;
      item.appendChild(note);
      list.appendChild(item);
    }
    tabs.add({
      id: "changelog",
      title: "Changelog",
      note: noted.length ? countNote(noted.length, "version") : "none",
      order: 20,
      pane: list,
    });
    tabs.start();
  }

  if (app.extensionManager.setting.get("openManager.enrichMetadata")) {
    const readme = el("div", "om-readme");
    readme.appendChild(loadingBlock("Reading the repository"));
    body.appendChild(readme);
    appendReadme(pack.id, readme);
  }

  dialog.appendChild(body);
}

function openRepoPack(pack) {
  if (asWindow("packs")) return showRepoPackWindow(pack);

  const backdrop = el("div", "om-backdrop");
  const dialog = el("div", "om-dialog");
  dialog.style.height = "auto";
  dialog.style.maxHeight = "84vh";
  backdrop.appendChild(dialog);
  document.body.appendChild(backdrop);
  closeOn(backdrop);

  const close = el("button", "om-x", "×");
  close.title = "Close";
  close.onclick = () => backdrop.remove();
  dialog.appendChild(close);

  buildRepoPackBody(dialog, pack);
  return backdrop;
}

function showRepoPackWindow(pack) {
  const panel = createFloatingPanel({
    key: `pack:${pack.repo}`,
    title: pack.title || repoName(pack.repo),
    ...windowSize("pack"),
    centred: true,
  });
  if (panel.body.childElementCount) return panel;
  buildRepoPackBody(panel.body, pack);
  return panel;
}

function buildRepoPackBody(container, pack) {
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

  const body = el("div", "om-body");
  body.appendChild(hero);
  body.appendChild(el("div", "om-release-slot"));
  if (app.extensionManager.setting.get("openManager.enrichMetadata")) {
    const readme = el("div", "om-readme");
    readme.appendChild(loadingBlock("Reading the repository"));
    body.appendChild(readme);
    renderMetaInto(readme, api.fetchApi(
      `${API}/repo-meta?repo=${encodeURIComponent(pack.repo)}`));
  } else {
    body.appendChild(el("div", "om-readme-status",
      "Read pack README and repository metadata is off in Settings > Open Manager > Registry."));
  }
  container.appendChild(body);
}

function repoName(url) {
  const match = /github\.com[:/]+[^/]+\/([^/#?]+)/i.exec(url || "");
  return match ? match[1].replace(/\.git$/, "") : (url || "repository");
}

async function appendReadme(packId, slot) {
  return renderMetaInto(slot, api.fetchApi(
    `${API}/readme/${encodeURIComponent(packId)}`));
}

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

  const heroActions = packRoot(slot)?.querySelector(".om-hero-actions");
  let facts = heroActions?.querySelector(".om-chips");
  if (heroActions && !facts) {
    facts = el("div", "om-chips");
    heroActions.appendChild(facts);
  }
  const inHeader = Boolean(facts);
  if (!facts) facts = el("div", "om-chips");
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
  if (meta.stars) {
    const star = packRoot(slot)?.querySelector(".om-star");
    const label = star?.lastChild;
    if (label && !star.classList.contains("om-starred")) {
      label.textContent = `★ ${Number(meta.stars).toLocaleString()}`;
      star.title = `Star on GitHub (${Number(meta.stars).toLocaleString()} stars)`;
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

  const body = el("div", "om-at-ref");
  const picker = buildRefPicker(meta, body);
  if (picker.firstChild) (heroActions || slot).appendChild(picker);
  slot.appendChild(body);
  await paintPackBody(body, meta, meta);
}

function loadingBlock(what) {
  const box = el("div", "om-loading");
  box.appendChild(el("div", "om-loading-spin"));
  box.appendChild(el("div", "om-loading-text", what || "Loading"));
  return box;
}

function docFolder(path) {
  const cut = String(path || "").lastIndexOf("/");
  return cut < 0 ? "" : String(path).slice(0, cut);
}

function docResolve(base, href) {
  const parts = String(base || "").split("/").filter(Boolean);
  for (const step of String(href || "").split("/")) {
    if (!step || step === ".") continue;
    if (step === "..") parts.pop();
    else parts.push(step);
  }
  return parts.join("/");
}

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

const STYLE_REFUSED = /url\(|image-set\(|expression\(|javascript:|@import|[<>{}]|\\/i;

const MD_SCAN = /```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]+`|<\/?[a-zA-Z][^>]*>/g;

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
      try { node.style.setProperty(name, value, priority); } catch {}
    }
  }
}

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

function buildRefPicker(meta, host) {
  const bar = el("div", "om-refbar");
  const repo = meta.repository || "";
  if (!repo.toLowerCase().includes("github.com")) return bar;
  const publishedVersions = () => new Set(
    [...(packRoot(host)?.querySelectorAll(".om-versions .om-ver") || [])]
      .map((n) => n.firstChild?.textContent?.trim() || n.textContent.trim()));

  const current = meta.default_branch || "main";
  const select = el("select", "om-side-select om-ref-select");
  const first = el("option", null, current);
  first.value = current;
  select.appendChild(first);
  const status = el("span", "om-side-status", "");

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
      markRef(ref, select.options[select.selectedIndex]?.textContent || ref);
      offerRef(ref, select.options[select.selectedIndex]?.textContent || "");
    } catch (error) {
      status.textContent = "could not read that ref";
    }
  });

function shortRef(ref) {
  const text = String(ref || "");
  return /^[0-9a-f]{40}$/i.test(text) ? text.slice(0, 7) : text;
}

  const markRef = (ref, caption) => {
    const page = packRoot(host) || host;
    page.querySelector(".om-ref-note")?.remove();
    const holder = page.classList?.contains("om-float") ? page : null;
    if (holder) {
      const handle = [...floatPanels.values()].find((one) => one.el === holder);
      const base = handle?._baseTitle
        || (handle ? (handle._baseTitle = handle.title?.() || "") : "");
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

  const offerRef = (ref, caption) => {
    const versions = packRoot(host)?.querySelector(".om-versions");
    if (!versions) return;
    versions.querySelector(".om-ref-row")?.remove();
    if (!ref || ref === current) return;
    versions.prepend(buildRefInstallRow(meta, ref, caption));
    versions.closest("details")?.setAttribute("open", "");
  };

  bar.appendChild(el("span", "om-ref-label", "ref"));
  bar.appendChild(select);
  bar.appendChild(status);
  bar.appendChild(probe);
  fitToSelection();
  return bar;
}

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

const CAPABILITY_LABELS = {
  filesystem: ["Filesystem read and write", "Reads or writes files outside its own folder"],
  network: ["Network access", "Contacts hosts over the network at runtime"],
  subprocess: ["Subprocess execution", "Starts other programs"],
  binaries: ["External binaries", "Ships or calls compiled executables"],
  environment: ["Environment access", "Reads or sets environment variables"],
  dynamic_code: ["Dynamic code execution", "Builds and runs code at runtime"],
  packages: ["Package and dependency changes", "Installs or changes Python packages"],
  models: ["Model downloads", "Fetches model weights"],
  credentials: ["Credentials and API keys", "Reads tokens or keys"],
  telemetry: ["Telemetry or analytics", "Reports usage off this machine"],
  compilation: ["Native or GPU compilation", "Compiles code or kernels on your machine"],
  hardware: ["Direct hardware access", "Talks to devices directly"],
};

const CAPABILITY_ICONS = {
  filesystem: [["path", "M3 7h6l2 3h10v9H3z"]],
  network: [["circle", 12, 12, 8], ["path", "M4 12h16"],
            ["path", "M12 4c3.2 3.4 3.2 12.6 0 16"], ["path", "M12 4c-3.2 3.4-3.2 12.6 0 16"]],
  subprocess: [["rect", 3, 4, 18, 16, 2], ["path", "M7.5 9.5l3 2.5-3 2.5"],
               ["path", "M13 15h4"]],
  binaries: [["path", "M12 3l8 4.5v9L12 21l-8-4.5v-9z"], ["path", "M4 7.5l8 4.5 8-4.5"],
             ["path", "M12 12v9"]],
  environment: [["path", "M4 8h16"], ["circle", 9, 8, 2.2], ["path", "M4 16h16"],
                ["circle", 15, 16, 2.2]],
  dynamic_code: [["path", "M8.5 7L3.5 12l5 5"], ["path", "M15.5 7l5 5-5 5"]],
  packages: [["rect", 3, 7, 18, 13, 2], ["path", "M12 10v6"], ["path", "M9 13l3 3 3-3"]],
  models: [["ellipse", 12, 6, 8, 3], ["path", "M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6"],
           ["path", "M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"]],
  credentials: [["circle", 8, 15.5, 3.5], ["path", "M10.5 13L20 3.5"], ["path", "M16 4h4v4"]],
  telemetry: [["path", "M4 19v-4"], ["path", "M9.3 19v-8"], ["path", "M14.7 19v-12"],
              ["path", "M20 19v-6"]],
  compilation: [["path", "M14.5 6.2a4 4 0 1 0 3.3 3.3L21 6l-3-3z"], ["path", "M12.6 11.4L4 20"]],
  hardware: [["rect", 7, 7, 10, 10, 1.5], ["path", "M10 3v4"], ["path", "M14 3v4"],
             ["path", "M10 17v4"], ["path", "M14 17v4"], ["path", "M3 10h4"],
             ["path", "M3 14h4"], ["path", "M17 10h4"], ["path", "M17 14h4"]],
};

const CAPABILITY_FALLBACK = [["path", "M12 3l9 9-9 9-9-9z"], ["path", "M12 9v4"],
                             ["path", "M12 16.2v.4"]];

function capabilityIcon(key, size = 14) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.7");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.classList.add("om-cap-icon");
  for (const shape of CAPABILITY_ICONS[key] || CAPABILITY_FALLBACK) {
    const [kind, ...rest] = shape;
    const node = document.createElementNS(ns, kind);
    if (kind === "path") node.setAttribute("d", rest[0]);
    else if (kind === "circle") {
      node.setAttribute("cx", rest[0]);
      node.setAttribute("cy", rest[1]);
      node.setAttribute("r", rest[2]);
    } else if (kind === "ellipse") {
      node.setAttribute("cx", rest[0]);
      node.setAttribute("cy", rest[1]);
      node.setAttribute("rx", rest[2]);
      node.setAttribute("ry", rest[3]);
    } else if (kind === "rect") {
      node.setAttribute("x", rest[0]);
      node.setAttribute("y", rest[1]);
      node.setAttribute("width", rest[2]);
      node.setAttribute("height", rest[3]);
      if (rest[4] != null) node.setAttribute("rx", rest[4]);
    }
    svg.appendChild(node);
  }
  return svg;
}

function capabilityTitle(key) {
  const known = CAPABILITY_LABELS[key];
  if (known) return known[0];
  return String(key).replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

function buildCapabilities(keys, refused = []) {
  const box = panel("Access and capabilities", countNote(keys.length, "declaration"),
    { open: false, remember: "om-caps-open" });
  const content = el("div", "om-caps-pane");
  box.body.appendChild(content);
  box.pane = content;
  content.appendChild(el("div", "om-caps-note", "Declared by the author, not verified."));
  if (keys.length) {
    const grid = el("div", "om-caps");
    for (const key of keys) {
      const cell = el("div", "om-cap");
      const head = el("div", "om-cap-head");
      head.appendChild(capabilityIcon(key));
      head.appendChild(el("span", "om-cap-name", capabilityTitle(key)));
      cell.appendChild(head);
      const blurb = CAPABILITY_LABELS[key]?.[1];
      if (blurb) cell.appendChild(el("span", "om-cap-what", blurb));
      grid.appendChild(cell);
    }
    content.appendChild(grid);
  }
  if (refused.length) {
    const bad = el("div", "om-caps-bad");
    bad.appendChild(el("b", null,
      `${refused.length === 1 ? "One declaration" : `${refused.length} declarations`} `
      + "not recognised"));
    bad.appendChild(el("div", "om-caps-list", refused.join(", ")));
    bad.appendChild(el("div", "om-cap-what", "Not in the accepted list, so not shown."));
    content.appendChild(bad);
  }
  return box;
}

function appendDeveloperBlock(slot, meta) {
  const dev = meta.developer || {};
  const matched = (meta.incompatible || []).filter((entry) => entry.matched);
  const workflows = dev.example_workflows || [];
  const themes = dev.themes || [];
  const gallery = panelSetting("openManager.galleryShow", true) ? (dev.gallery || []) : [];
  const capabilities = dev.capabilities || [];
  const badCapabilities = dev.capabilities_unknown || [];

  const releaseSlot = packRoot(slot)?.querySelector(".om-release-slot");
  if (dev.release_note && releaseSlot) {
    releaseSlot.replaceChildren();
    const note = el("div", "om-release");
    note.appendChild(el("b", null, "From the developer"));
    note.appendChild(el("div", "om-release-body", dev.release_note));
    releaseSlot.appendChild(note);
  }

  if (!matched.length && !dev.source && !dev.docs && !dev.funding
    && !workflows.length && !themes.length && !gallery.length && !capabilities.length
    && !badCapabilities.length) return;

  const block = el("div", "om-dev");
  const tabs = packRoot(slot)?.querySelector(".om-tabs")?.__omTabs || null;

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

  if (capabilities.length || badCapabilities.length) {
    const built = buildCapabilities(capabilities, badCapabilities);
    if (tabs) {
      tabs.add({ id: "capabilities", title: "Access", order: 40,
                 note: countNote(capabilities.length, "declaration"), pane: built.pane });
    } else {
      block.appendChild(built);
    }
  }

  if (gallery.length) {
    const built = buildGallery(meta, gallery);
    if (tabs && built) {
      tabs.add({ id: "gallery", title: "Gallery", order: 70,
                 note: countNote(gallery.length, "image"), pane: built.pane });
    } else if (built) {
      block.appendChild(built);
    }
  }

  if (themes.length) {
    const themeRows = [];
    const built = collapsible("Themes", themes, (path) => {
      const item = el("button", "om-wf-item");
      item.appendChild(el("span", "om-wf-name", path.split("/").pop().replace(/\.json$/, "")));
      item.appendChild(el("span", "om-wf-path", path));
      item.title = `Add ${path} to your themes`;
      item.onclick = () => addPackTheme(meta.repository, meta.default_branch, path, item);
      themeRows.push([path, item]);
      return item;
    }, { note: countNote(themes.length, "theme"), remember: "om-themes-open" });
    const titles = () => fillThemeTitles(meta.repository, meta.default_branch, themeRows);
    if (tabs) {
      tabs.add({ id: "themes", title: "Themes", order: 50,
                 note: countNote(themes.length, "theme"), pane: built.pane, onShow: titles });
    } else {
      built.addEventListener("toggle", () => { if (built.open) titles(); });
      if (built.open) titles();
      block.appendChild(built);
    }
  }

  if (workflows.length) {
    const previews = dev.example_workflow_previews || {};
    const built = collapsible("Example workflows", workflows, (path) => {
      const item = el("button", "om-wf-item");
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
    }, { note: countNote(workflows.length, "workflow"), remember: "om-workflows-open" });
    if (tabs) {
      tabs.add({ id: "workflows", title: "Workflows", order: 60,
                 note: countNote(workflows.length, "workflow"), pane: built.pane });
    } else {
      block.appendChild(built);
    }
  }

  slot.appendChild(block);
}

function tabbedPanel({ remember = "", collapsible = true } = {}) {
  const root = el("div", "om-tabs");
  const strip = el("div", "om-tabstrip");
  strip.setAttribute("role", "tablist");
  const body = el("div", "om-tabbody");
  root.appendChild(strip);
  root.appendChild(body);
  const sections = [];
  let active = "";

  const fold = el("button", "om-tabfold");
  fold.type = "button";
  const foldKey = remember && collapsible ? `${remember}-shut` : "";
  let shut = false;
  if (foldKey) {
    try { shut = localStorage.getItem(foldKey) === "1"; } catch {}
  }
  if (collapsible) strip.appendChild(fold);

  const loadActive = () => {
    const found = sections.find((one) => one.id === active);
    if (!found?.onShow) return;
    try { found.onShow(); } catch {}
  };

  const paintFold = () => {
    root.classList.toggle("om-tabs-shut", shut);
    fold.textContent = shut ? "▸" : "▾";
    fold.title = shut ? "Show the sections" : "Hide the sections and read on";
    fold.setAttribute("aria-label", fold.title);
    fold.setAttribute("aria-expanded", shut ? "false" : "true");
  };

  const setShut = (next, { load = true } = {}) => {
    shut = next;
    paintFold();
    if (foldKey) {
      try { localStorage.setItem(foldKey, shut ? "1" : "0"); } catch {}
    }
    if (!shut && load) loadActive();
  };

  fold.onclick = () => setShut(!shut);
  paintFold();

  const show = (id) => {
    const found = sections.find((one) => one.id === id);
    if (!found) return;
    active = id;
    for (const one of sections) {
      const on = one.id === id;
      one.tab.classList.toggle("om-tab-on", on);
      one.tab.setAttribute("aria-selected", on ? "true" : "false");
    }
    body.replaceChildren(found.pane);
    if (remember) {
      try { localStorage.setItem(remember, id); } catch {}
    }
    if (!shut) loadActive();
  };

  const add = ({ id, title, note = "", order = 50, pane, onShow = null }) => {
    const tab = el("button", "om-tab");
    tab.type = "button";
    tab.setAttribute("role", "tab");
    tab.appendChild(el("span", "om-tab-name", title));
    const count = el("span", "om-tab-note", note);
    tab.appendChild(count);
    tab.onclick = () => {
      if (shut) setShut(false, { load: false });
      show(id);
    };
    const entry = { id, title, order, tab, pane, onShow, count };
    sections.push(entry);
    sections.sort((a, b) => a.order - b.order);
    strip.replaceChildren(...(collapsible ? [fold] : []),
                          ...sections.map((one) => one.tab));
    if (active) show(active);
    return {
      pane,
      note: (text) => { count.textContent = text; },
    };
  };

  const start = () => {
    if (!sections.length) return;
    let chosen = sections[0].id;
    if (remember) {
      try {
        const saved = localStorage.getItem(remember);
        if (saved && sections.some((one) => one.id === saved)) chosen = saved;
      } catch {}
    }
    show(chosen);
  };

  const api = { root, add, show, start, has: (id) => sections.some((one) => one.id === id) };
  root.__omTabs = api;
  return api;
}

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

function collapsible(title, paths, build, {
  listClass = "om-wf-list", open = false, remember = "", note = "",
} = {}) {
  const box = panel(title, note || String(paths.length), { open, remember });
  const list = el("div", listClass);
  for (const path of paths) list.appendChild(build(path));
  box.body.appendChild(list);
  box.pane = list;
  return box;
}

function countNote(count, noun) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

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
    try { await app.extensionManager.setting.set(id, ""); } catch {}
    keysHeld[name] = true;
    moved.push(label);
    if (answer.warning) {
      notify("Key stored, with a caveat", `${label}: ${answer.warning}.`);
    }
  }
  if (moved.length) {
    toast(`${moved.join(" and ")} moved from ComfyUI's settings to Open Manager > Access keys.`,
          { kind: "ok", sticky: true });
  }
}

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
  }
}

let selfInfo = null;

async function loadSelfInfo(check = false) {
  if (selfInfo && !check) return selfInfo;
  try {
    const answer = await api.fetchApi(`${API}/self${check ? "?check=1" : ""}`);
    if (answer.ok) selfInfo = await answer.json();
  } catch {
  }
  return selfInfo;
}

function selfUpdateTarget(pack) {
  const id = foldId(pack.registry_id || pack.id || "");
  if (!selfInfo || !id || id !== foldId(selfInfo.node_id || "")) return "";
  return selfInfo.behind ? String(selfInfo.newest || "") : "";
}

async function openAboutDialog() {
  let info = null;
  try {
    const answer = await api.fetchApi(`${API}/self?check=1`);
    if (answer.ok) { info = await answer.json(); selfInfo = info; }
  } catch {
  }

  const backdrop = el("div", "om-backdrop");
  const box = el("div", "om-note om-note-wide");
  box.appendChild(el("div", "om-note-title", "Open Manager"));

  if (!info) {
    box.appendChild(el("div", "om-dl-note",
      "The server did not answer, so how this copy is installed is unknown."));
  } else {
    const packaged = info.mode === "package";
    const facts = el("div", "om-keys-row");
    const head = el("div", "om-dl-top");
    head.appendChild(el("span", "om-dl-name", `Version ${info.version}`));
    head.appendChild(el("span", "om-dl-src",
      packaged ? "installed as a package" : "installed as a custom node"));
    if (info.behind && info.newest) {
      head.appendChild(el("span", "om-upd", `update → ${info.newest}`));
    } else if (info.newest) {
      head.appendChild(el("span", "om-dl-src", "up to date"));
    }
    facts.appendChild(head);
    facts.appendChild(el("div", "om-dl-note", info.path));
    box.appendChild(facts);

    if (packaged) {
      box.appendChild(el("div", "om-dl-note",
        "Open Manager is installed in site-packages in place of ComfyUI Manager and cannot "
        + "update itself from here."));
      for (const step of info.steps || []) {
        const row = el("div", "om-keys-row");
        row.appendChild(el("div", "om-dl-note", step.label));
        const line = el("div", "om-keys-line");
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
        "Open Manager is a pack in custom_nodes and updates from its page."));
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

async function openKeysDialog() {
  const found = await loadKeys();
  const backdrop = el("div", "om-backdrop");
  const box = el("div", "om-note om-note-wide");
  box.appendChild(el("div", "om-note-title", "Access keys"));
  box.appendChild(el("div", "om-dl-note",
    "Kept unencrypted in Open Manager's own file, restricted to this account and used only "
    + "by this server. Never written to ComfyUI's settings, sent in a URL or shown back."));
  box.appendChild(el("div", "om-dl-note",
    "Where an environment variable is set, it is used instead."));
  if (found?.warning) box.appendChild(el("div", "om-dl-note om-dl-bad", found.warning));

  const rows = el("div", "om-keys");
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

function vtKey() {
  return keysHeld.virustotal ? "set" : "";
}

function vtReady() {
  return vtKey().length > 0;
}

async function vtRemaining() {
  try {
    const s = await (await api.fetchApi(`${API}/scan/state`)).json();
    return Math.max(0, (s.budget || 0) - (s.budget_used || 0));
  } catch {
    return null;
  }
}


function panelSetting(key, fallback) {
  try {
    const value = app.extensionManager.setting.get(key);
    return value === undefined || value === null ? fallback : value;
  } catch {
    return fallback;
  }
}

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

const PACK_REF = /^pack:([A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+){0,5})$/;
const PACK_REF_DEPTH = 6;

function resolvePackAssets(value, repository, depth = 0) {
  if (typeof value === "string") {
    const match = PACK_REF.exec(value.trim());
    if (!match) return value;
    const query = new URLSearchParams({ repo: repository || "", path: match[1] });
    return `${API}/pack-asset?${query.toString()}`;
  }
  if (depth >= PACK_REF_DEPTH) return value;
  if (Array.isArray(value)) {
    return value.map((one) => resolvePackAssets(one, repository, depth + 1));
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, one] of Object.entries(value)) {
      out[key] = resolvePackAssets(one, repository, depth + 1);
    }
    return out;
  }
  return value;
}

const THEME_REFRESH_CAP = 40;

function themeIsNewer(candidate, current) {
  const one = Number(candidate);
  const two = Number(current);
  if (Number.isFinite(one) && Number.isFinite(two)) return one > two;
  return String(candidate ?? "") !== String(current ?? "");
}

async function refreshPackThemes() {
  let data;
  try {
    const answer = await api.fetchApi(`${API}/theme-updates`);
    data = await answer.json();
    if (!answer.ok || !data.ok) return [];
  } catch {
    return [];
  }
  const setting = app.extensionManager?.setting;
  const service = app.extensionManager?.colorPalette;
  if (!setting) return [];
  let store;
  try {
    store = setting.get("Comfy.CustomColorPalettes") || {};
  } catch {
    return [];
  }
  const next = { ...store };
  const updated = [];
  for (const entry of (data.themes || []).slice(0, THEME_REFRESH_CAP)) {
    const theme = resolvePackAssets(entry.theme, entry.repo);
    const id = theme?.id;
    if (!id || !next[id]) continue;
    if (!themeIsNewer(theme.version, next[id].version)) continue;
    next[id] = theme;
    updated.push(theme.name || id);
  }
  if (!updated.length) return [];
  try {
    await setting.set("Comfy.CustomColorPalettes", next);
    const active = service?.getActiveColorPalette?.()?.id;
    if (active && next[active]) {
      try { await service.loadColorPalette(active); } catch {}
    }
  } catch {
    return [];
  }
  return updated;
}

const themeNames = new Map();

const THEME_NAME_CAP = 20;

async function readThemeName(repository, branch, path) {
  const key = `${repository || ""}|${path}`;
  if (themeNames.has(key)) return themeNames.get(key);
  try {
    const query = new URLSearchParams({ repo: repository || "", branch: branch || "", path });
    const answer = await api.fetchApi(`${API}/theme?${query.toString()}`);
    const data = await answer.json();
    if (!answer.ok || !data.ok) return "";
    const name = String(data.theme?.name || data.theme?.id || "").trim().slice(0, 80);
    if (name) themeNames.set(key, name);
    return name;
  } catch {
    return "";
  }
}

async function fillThemeTitles(repository, branch, rows) {
  for (const [path, item] of rows.slice(0, THEME_NAME_CAP)) {
    if (item.dataset.omThemeName) continue;
    const name = await readThemeName(repository, branch, path);
    if (!name) continue;
    const label = item.querySelector(".om-wf-name");
    if (label) label.textContent = name;
    item.title = `Add ${name} to your themes`;
    item.dataset.omThemeName = "1";
  }
}

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
  const theme = resolvePackAssets(data.theme, repository);
  const name = theme.name || theme.id;
  if (!(await confirmAction("Add theme", `Add "${name}" to your themes?`, "Add"))) return;
  try {
    const setting = app.extensionManager.setting;
    const service = app.extensionManager.colorPalette;
    const store = setting.get("Comfy.CustomColorPalettes") || {};
    const replacing = Boolean(store[theme.id]);
    await setting.set("Comfy.CustomColorPalettes", { ...store, [theme.id]: theme });
    button.classList.add("om-wf-added");

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

async function loadWorkflowGraph(workflow, label, origin, repository) {
  const parts = repoOwnerName(repository || "");
  if (parts && !(await confirmAuthorTrust(parts.owner, repository, "load a workflow"))) return;
  const active = activeWorkflow();
  const choices = [{ key: "tab", label: "Open in new tab", primary: true }];
  if (active) choices.push({ key: "replace", label: "Replace current graph",
                             hint: "Discards unsaved changes to the open workflow" });
  const where = origin ? `From ${origin}. ` : "";
  const how = await chooseAction(
    "Load workflow",
    `${where}Running this workflow can download models and write files.

`
    + (active
      ? `"${label}" can open alongside your work or take the place of the graph you have open.`
      : `"${label}" opens in a new tab.`),
    choices);
  if (!how) return;
  const name = String(label).split("/").pop();
  try {
    if (how === "replace") await app.loadGraphData(workflow, true, true, active);
    else await app.loadGraphData(workflow);
    toast(how === "replace" ? `Loaded ${name}.` : `Opened ${name}.`,
          { kind: "ok" });
  } catch (error) {
    notify("Could not load workflow", error.message);
  }
}

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
    }
  }
  return null;
}

function slugify(text) {
  return String(text || "").trim().toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-");
}

function linkHeadings(view) {
  const seen = new Map();
  for (const heading of view.querySelectorAll("h1, h2, h3, h4, h5, h6")) {
    const base = slugify(heading.textContent);
    if (!base) continue;
    const count = seen.get(base) || 0;
    seen.set(base, count + 1);
    heading.id = count ? `${base}-${count}` : base;
  }
}

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
    const href = safeUrl(anchor.getAttribute("href") || "");
    if (!href) continue;
    const bare = ATTACHMENT.test(href);
    if (!bare && !VIDEO_EXT.test(href) && !IMAGE_EXT.test(href)) continue;
    const assetId = (ATTACHMENT_ID.exec(href) || [])[1];
    const signed = assetId ? media[assetId.toLowerCase()] : "";
    const source = signed || href;
    const text = (anchor.textContent || "").trim();
    if (text && text !== href) continue;

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
    if (bare) video.onerror = () => video.replaceWith(asImage());
    else video.onerror = () => video.replaceWith(asDeadLink());
    anchor.replaceWith(video);
  }
}

function offerPackLink(anchor, href) {
  const match = /^https?:\/\/(?:www\.)?github\.com\/([^/#?]+)\/([^/#?]+)\/?$/i.exec(href || "");
  if (!match) return;
  anchor.onclick = async (event) => {
    if (panelSetting("openManager.packLinks", true) !== true) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    let found = null;
    try {
      const answer = await api.fetchApi(`${API}/pack-for-repo?repo=${encodeURIComponent(href)}`);
      found = (await answer.json()).id || null;
    } catch {
    }
    if (found) await openPack(found);
    else openUrl(href);
  };
}

const TEXT_CHUNK_CAP = 8 * 1024 * 1024;

async function pngText(bytes, wanted) {
  if (bytes.length < 8 || bytes[0] !== 0x89 || bytes[1] !== 0x50) return "";
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  let at = 8;
  while (at + 12 <= bytes.length) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(bytes[at + 4], bytes[at + 5], bytes[at + 6], bytes[at + 7]);
    if (type === "IEND") break;
    if (type === "tEXt" || type === "iTXt") {
      const body = bytes.subarray(at + 8, at + 8 + length);
      let split = 0;
      while (split < body.length && body[split] !== 0) split += 1;
      if (decoder.decode(body.subarray(0, split)) === wanted) {
        if (type === "tEXt") return decoder.decode(body.subarray(split + 1));
        const compressed = body[split + 1] === 1;
        let cursor = split + 3;
        for (let field = 0; field < 2; field += 1) {
          while (cursor < body.length && body[cursor] !== 0) cursor += 1;
          cursor += 1;
        }
        const payload = body.subarray(cursor);
        if (!compressed) return decoder.decode(payload);
        try {
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
        if (key === "workflow" || parsed.nodes) return parsed;
      } catch {
      }
    }
    return null;
  };

  let partial = null;
  let ranged = false;
  try {
    partial = await read({ Range: "bytes=0-262143" });
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

function offerImageWorkflows(view) {
  let reading = false;
  view.addEventListener("contextmenu", async (event) => {
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

const licJobs = new Map();

let onLicencesResolved = null;
let licTimer = 0;

const LICENSE_BATCH = 200;

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

function packIcon(url, name, extra) {
  const initial = (String(name || "?").replace(/^[^a-z0-9]+/i, "") || "?")[0].toUpperCase();
  const letter = el("div", "om-side-icon om-side-initial", initial);
  if (extra) letter.classList.add(extra);
  if (!url) return letter;
  const icon = el("img", "om-side-icon");
  if (extra) icon.classList.add(extra);
  icon.src = url;
  icon.onerror = () => icon.replaceWith(letter);
  return icon;
}

function countText(value) {
  const n = Number(value) || 0;
  if (n < 1e4) return n.toLocaleString();
  const scale = (size, suffix) => {
    const v = n / size;
    return (v >= 99.95 ? String(Math.round(v)) : v.toFixed(1)) + suffix;
  };
  return n >= 999500 ? scale(1e6, "M") : scale(1e3, "k");
}

const GITHUB_MARK = "M6.766 11.328c-2.063-.25-3.516-1.734-3.516-3.656 0-.781.281-1.625.75-2.188-.203-.515-.172-1.609.063-2.062.625-.078 1.468.25 1.968.703.594-.187 1.219-.281 1.985-.281.765 0 1.39.094 1.953.265.484-.437 1.344-.765 1.969-.687.218.422.25 1.515.046 2.047.5.593.766 1.39.766 2.203 0 1.922-1.453 3.375-3.547 3.64.531.344.89 1.094.89 1.954v1.625c0 .468.391.734.86.547C13.781 14.359 16 11.53 16 8.03 16 3.61 12.406 0 7.984 0 3.563 0 0 3.61 0 8.031a7.88 7.88 0 0 0 5.172 7.422c.422.156.828-.125.828-.547v-1.25c-.219.094-.5.156-.75.156-1.031 0-1.64-.562-2.078-1.609-.172-.422-.36-.672-.719-.719-.187-.015-.25-.093-.25-.187 0-.188.313-.328.625-.328.453 0 .844.281 1.25.86.313.452.64.655 1.031.655s.641-.14 1-.5c.266-.265.47-.5.657-.656";

function isGithubUrl(url) {
  try {
    return new URL(url, window.location.href).hostname.toLowerCase()
      .replace(/^www\./, "") === "github.com";
  } catch {
    return false;
  }
}

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

function plusMark(size = 14) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.classList.add("om-plus-mark");
  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", "M8 3.25v9.5M3.25 8h9.5");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "1.9");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("fill", "none");
  svg.appendChild(path);
  return svg;
}

function repoButton(url, label) {
  const safe = safeUrl(url);
  if (!safe) return null;
  const github = isGithubUrl(safe);
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

const COMFY_MARK = "comfy-logomark-yellow.svg";

function registryUrl(packId) {
  return `https://registry.comfy.org/nodes/${encodeURIComponent(packId)}`;
}

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
  link.onclick = (event) => event.stopPropagation();
  return link;
}

function registryButton(packId) {
  if (!packId) return null;
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
  link.onclick = (event) => event.stopPropagation();
  return link;
}

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
  meta.appendChild(el("span", "om-meta-text",
    `${entry.advertised || "no version"} · ${countText(entry.downloads)} ↓`));
  const stars = starCount(entry.stars);
  if (stars) meta.appendChild(stars);
  const lic = el("span", "om-lic");
  paintLicense(lic, entry);
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

function dayText(stamp) {
  const day = String(stamp || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : "-";
}

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

function buildResultCard(entry) {
  const card = el("div", "om-card");
  const head = el("div", "om-card-head");
  head.appendChild(packIcon(entry.icon, entry.name || entry.id, "om-card-icon"));
  const title = el("div", "om-card-title");
  title.appendChild(packName(entry.name || entry.id, "om-side-name"));
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

let lastMissingTypes = null;

function collectMissingNodeTypes() {
  const registered = window.LiteGraph?.registered_node_types || {};
  const types = new Set();
  for (const type of lastMissingTypes || []) {
    if (type && !registered[type]) types.add(type);
  }
  for (const node of app.graph?._nodes || []) {
    const type = node.type;
    if (type && !registered[type]) types.add(type);
  }
  return [...types];
}

let viewGeneration = 0;

function beginView() {
  return ++viewGeneration;
}

function viewIsCurrent(generation) {
  return generation === viewGeneration;
}

function refreshInstalledIfActive() {
  const active = document.querySelector(".om-nav-btn.active");
  const content = document.querySelector(".om-content");
  if (active && content && active.textContent === "Installed") renderInstalled(content);
}

function refreshMissingIfActive() {
  const active = document.querySelector(".om-nav-btn.active");
  const content = document.querySelector(".om-content");
  if (active && content && active.textContent === "Missing") renderMissing(content);
}

function openPanelWindow(view) {
  if (asWindow("manager")) {
    const panel = createFloatingPanel({
      key: "manager", title: "Node Discovery", ...windowSize("manager"), centred: true,
    });
    panel.setMaskIcon(ICON_TAB);
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
  const host = el("div");
  dialog.appendChild(host);
  backdrop.appendChild(dialog);
  document.body.appendChild(backdrop);
  closeOn(backdrop);
  renderSidebar(host, view);
  return dialog;
}

function togglePanelWindow(view) {
  const shown = floatingPanel("manager");
  if (shown?.isMinimised?.()) { shown.present(); return shown.el; }
  if (shown) { closeFloatingPanel("manager"); return null; }
  const existing = document.querySelector(".om-backdrop .om-panel-window");
  if (existing) {
    existing.closest(".om-backdrop").remove();
    return null;
  }
  return openPanelWindow(view);
}

function openManagerMenu() {
  const existing = document.querySelector(".om-backdrop .om-hub");
  if (existing) { existing.closest(".om-backdrop").remove(); return null; }

  const backdrop = el("div", "om-backdrop");
  const dialog = el("div", "om-dialog om-hub");
  dialog.appendChild(el("div", "om-hub-title", "Open Manager Menu"));

  const body = el("div", "om-hub-body");
  const status = el("div", "om-hub-status", "Reading the registry cache...");
  body.appendChild(status);

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

const DRAWER_SHARE = 23;

const DRAWER_KEY = "om-drawer-share";

async function sizeDrawer(root) {
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
  panel.style.flexBasis = `calc(${share}% - 4px)`;

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

  const more = el("button", "om-nav-btn om-nav-more", "\u22ef");
  more.title = "Open Manager Menu";
  more.onclick = () => openManagerMenu();
  nav.appendChild(more);
  select(Object.hasOwn(views, initial ?? "") ? initial : "registry");
}

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
    status.textContent = "No repositories yet.";
    return;
  }
  status.textContent = `${repos.length} repositor${repos.length === 1 ? "y" : "ies"}`;
  for (const repo of repos) list.appendChild(buildGithubRow(repo, container));
}

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

async function removeGithubSource(repo, container) {
  const installed = !!repo.installed_version;
  const ok = await confirmAction(
    `Remove ${repo.name}`,
    installed
      ? `This takes ${repo.owner}/${repo.name} off your list and uninstalls it from custom_nodes.`
      : `This takes ${repo.owner}/${repo.name} off your list.`,
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

function isRelease(v) {
  return /^\d+(\.\d+)*$/.test((v || "").trim());
}

function updateInstalled(pack, row, control) {
  install({
    packId: pack.registry_id,
    entry: { version: pack.latest, status: "active", name: pack.registry_id || pack.id },
    control,
    rowsRoot: row,
    overwrite: true,
  });
}

async function renderInstalled(container) {
  const generation = viewGeneration;
  container.replaceChildren();
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

  const [timings] = await Promise.all([loadStartupTimes(), loadHolds(), loadSelfInfo(true)]);
  if (!viewIsCurrent(generation)) return;
  if (timings?.ok && timings.packs?.length) {
    const worst = timings.packs[0];
    const line = el("div", "om-side-status om-cost-line");
    line.textContent = (timings.stale ? "Last run: " : "")
      + `${timings.total.toFixed(1)}s importing ${timings.packs.length} packs`
      + (worst ? ` · slowest ${worst.name} at ${worst.seconds.toFixed(2)}s` : "");
    line.classList.toggle("om-cost-stale", !!timings.stale);
    line.title = timings.stale
      ? timings.reason
      : "Read from ComfyUI's own log, for the run that is loaded now.";
    container.insertBefore(line, list);
  }

  const controls = el("div", "om-side-controls");
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
    all.title = "Updates every pack with a newer registry version, except held packs.";
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

  renderCollisions(container, generation).catch(() => {});
}

const heldVersions = new Map();

async function loadHolds() {
  heldVersions.clear();
  try {
    const found = await (await api.fetchApi(`${API}/holds`)).json();
    for (const [name, held] of Object.entries(found.holds || {})) {
      heldVersions.set(foldId(name), held);
    }
  } catch {
  }
}

function holdKey(pack) {
  return String(pack.dir || pack.id || "").replace(/\.disabled$/, "");
}

function isHeld(pack) {
  return heldVersions.has(foldId(holdKey(pack))) || heldVersions.has(foldId(pack.id));
}

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

function isInstalledUpdatable(pack) {
  return !!pack.registry_id && !!updateTarget(pack, pack.latest);
}

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

function installedText(when) {
  const days = Math.floor((Date.now() - when.getTime()) / 86400000);
  if (!Number.isFinite(days) || days < 0) return "installed";
  if (days < 1) return "installed today";
  if (days < 30) return `installed ${days}d ago`;
  if (days < 365) return `installed ${Math.floor(days / 30)}mo ago`;
  const years = Math.floor(days / 365);
  return `installed ${years}y ago`;
}

function whenText(when) {
  const days = Math.floor((Date.now() - when.getTime()) / 86400000);
  if (!Number.isFinite(days) || days < 0) return "";
  if (days < 1) return "today";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
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
    since.title = `Installed ${when.toLocaleString()}.`;
    meta.appendChild(since);
  }
  if (pack.disabled) meta.appendChild(el("span", "om-disabled", "disabled"));
  if (isHeld(pack)) {
    const badge = el("span", "om-held", `held at ${pack.version}`);
    badge.title = "No update is offered for this pack until the hold is lifted.";
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
  else if (selfUpdateTarget(pack)) {
    meta.appendChild(el("span", "om-upd", `update → ${selfUpdateTarget(pack)}`));
  }
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
  const mine = selfUpdateTarget(pack);
  if (mine) {
    control.setUpdate(mine, () => openAboutDialog());
    control.el.querySelector(".om-btn").title =
      `Version ${mine} is published. Open Manager updates from About and updates.`;
  } else if (vstatus === "banned" || vstatus === "flagged") {
    control.setStatusInstalled(vstatus);
  } else if (updatable) {
    control.setUpdate(pack.latest, () => updateInstalled(pack, row, control));
  } else {
    control.setInstalled();
  }
  control.el.classList.add("om-side-ictl");
  row.appendChild(control.el);
  return row;
}

async function updateEveryPack(packs) {
  if (!packs.length) return;
  const facts = packs.slice(0, 24).map((pack) => [pack.id, `${pack.version} -> ${pack.latest}`]);
  if (packs.length > facts.length) {
    facts.push(["And more", `${packs.length - facts.length} others`]);
  }
  facts.push(["One at a time", "Each finishes before the next starts."]);
  facts.push(["Dependencies", "Each pack installs its own requirements."]);
  facts.push(["Held packs", "Left alone"]);
  facts.push(["Takes effect", "After ComfyUI restarts"]);
  const go = await chooseAction(`Update ${packs.length} pack${packs.length === 1 ? "" : "s"}?`,
    "", [{ key: "go", label: "Update them", primary: true }], { wide: true, facts });
  if (!go) return;

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
  facts.push(["Effect", "A graph saved with another pack's node loads the one in use."]);
  chooseAction("Node names claimed twice", "", [], { wide: true, facts });
}

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

function sinceText(ts) {
  if (!ts) return "never";
  const s = Date.now() / 1000 - ts;
  if (s < 90) return "just now";
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 129600) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

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

function allowBanned() {
  return panelSetting("openManager.allowBanned", false) === true;
}

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

  };
}

function syncOptions() {
  const get = (key, fallback) => {
    try { return app.extensionManager.setting.get(key) ?? fallback; } catch { return fallback; }
  };
  return {
    parallel: get("openManager.parallelSync", true) !== false,
    concurrency: Number(get("openManager.syncConcurrency", 8)) || 8,
  };
}

const topicPacks = new Map();

const TOPIC_PREFIX = "topic:";

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

function topicInQuery(value) {
  const text = String(value || "").trim().toLowerCase();
  return text.startsWith(TOPIC_PREFIX) ? text.slice(TOPIC_PREFIX.length).trim() : "";
}

function browseTopic(topic) {
  const root = openPanelWindow("registry");
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
    search.title = "Matches a pack's name, id, description and publisher. topic:animation shows"
      + " the packs whose GitHub repository carries that topic.";
    search.spellcheck = false;
    container.appendChild(search);

    const controls = el("div", "om-side-controls");
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
    const sizer = el("div", "om-virt");
    const win = el("div", "om-virt-win");
    sizer.appendChild(win);
    list.appendChild(sizer);
    container.appendChild(count);

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
    const OVERSCAN = 4;
    const GAP = { list: 4, cards: 8, table: 0 };

    let filtered = [];
    let pitch = 56;
    let perRow = 1;
    let from = -1;
    let to = -1;

    const cardsOn = () => viewSel.value === "cards";
    const tableOn = () => viewSel.value === "table";
    const gapNow = () => GAP[viewSel.value] ?? GAP.list;
    const WIDE = 1000;
    const MID = 470;

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
      if (tableOn() && head.clientWidth > 0 && list.clientWidth > 0) {
        const gutter = Math.max(0, head.clientWidth - list.clientWidth);
        head.style.paddingRight = `${8 + gutter}px`;
      }
    };

    const repaint = (force = true) => {
      fitColumns();
      paint(force);
      requestAnimationFrame(() => {
        const tier = head.className;
        fitColumns();
        if (measure() || head.className !== tier) paint(true);
      });
    };

    let settle = null;
    const queueVisibleLicences = () => {
      clearTimeout(settle);
      settle = setTimeout(() => {
        for (const node of win.children) {
          if (node._entry && node._licPill) queueLicense(node._entry, node._licPill);
        }
      }, 250);
    };

    let topicNow = "";
    let topicIds = null;

    const matches = (node) => {
      const query = search.value.trim().toLowerCase();
      const tier = licSel.value;
      if (filterBox.checked && !node.advertised) return false;
      if (trustBox.checked && !byTrustedAuthor(node)) return false;
      if (tier !== "all" && node.license_tier !== tier) return false;
      if (topicInQuery(query)) return topicIds ? topicIds.has(node.id) : false;
      if (!query) return true;
      return (node.name || "").toLowerCase().includes(query)
        || node.id.toLowerCase().includes(query)
        || (node.description || "").toLowerCase().includes(query)
        || (node.publisher || "").toLowerCase().includes(query);
    };

    const applyNow = async () => {
      const wantedTopic = topicInQuery(search.value);
      if (wantedTopic && wantedTopic !== topicNow) {
        topicNow = wantedTopic;
        topicIds = null;
        count.textContent = `Asking GitHub which packs are tagged ${wantedTopic}...`;
        const answer = await packsForTopic(wantedTopic);
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
.om-panel-window > div { flex: 1; min-height: 0; }
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
.om-src { font-size: 11px; padding: 0 7px; border-radius: 999px; line-height: 17px;
  color: var(--om-text-2); background: var(--om-input); }
.om-src-disk { color: #d29922; }
.om-side-list { flex: 1; overflow-y: auto; overflow-x: hidden; display: flex;
  flex-direction: column; gap: 4px; padding-right: 8px; }
.om-side-list.om-virt-host { display: block; }
.om-virt { position: relative; width: 100%; }
.om-virt-win { position: absolute; top: 0; left: 0; right: 0; }
.om-virt-win.om-list-win { display: flex; flex-direction: column; gap: 4px; }
.om-virt-win .om-side-row { height: 52px; box-sizing: border-box; }
.om-virt-win .om-side-meta { flex-wrap: nowrap; white-space: nowrap; overflow: hidden; }
.om-virt-win .om-meta-text {
  flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.om-virt-win .om-side-meta > .om-lic,
.om-virt-win .om-side-meta > .om-stars { flex: none; }
.om-virt-win .om-card-desc { height: calc(1.45em * 3); }
.om-virt-win .om-card .om-side-meta {
  flex-wrap: nowrap; white-space: nowrap; overflow: hidden; min-width: 0; }
.om-virt-win .om-card-title { min-width: 0; }
.om-table-head, .om-virt-win.om-table-win .om-table-row {
  display: grid; align-items: center; column-gap: 10px;
  grid-template-columns:
    34px
    minmax(150px, 1.1fr)
    68px
    92px
    92px
    minmax(120px, 2fr)
    minmax(80px, .7fr)
    104px
    56px
    82px;
}
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
.om-side-list.om-table-list { padding-right: 0; scrollbar-gutter: stable; }
.om-side-list.om-table-list { border: 1px solid var(--om-border); border-top: none;
  border-radius: 0 0 6px 6px; }
.om-virt-win.om-table-win { display: block; }
.om-virt-win.om-table-win .om-table-row {
  height: 34px; box-sizing: border-box; padding: 0 8px;
  border-bottom: 1px solid var(--om-border); font-size: 12px; color: var(--om-text-2);
}
.om-virt-win.om-table-win .om-table-row:hover { background: var(--om-hover); }
.om-tcell { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.om-tcell-num { color: var(--om-muted); font-variant-numeric: tabular-nums; }
.om-tcell-title { display: flex; align-items: center; gap: 6px; cursor: pointer; }
.om-tcell-title .om-side-name { overflow: hidden; text-overflow: ellipsis; }
.om-table-icon { width: 18px; height: 18px; flex: none; font-size: 10px; }
.om-tcell-ver, .om-tcell-dl, .om-tcell-star { font-variant-numeric: tabular-nums; }
.om-tcell-desc { color: var(--om-muted); cursor: pointer; }
.om-tcell-lic { display: flex; align-items: center; }
.om-tcell-lic > .om-lic { min-width: 0; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; }
.om-tcell-date { color: var(--om-muted); font-variant-numeric: tabular-nums; }
.om-tcell-action { overflow: visible; }
.om-table-ictl { transform: scale(.85); transform-origin: left center; }
.om-table-head .om-tcell-title { display: block; cursor: default; }
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
.om-hub-danger { border-color: #7f1d1d; color: #fca5a5; }
.om-hub-danger:hover { background: #7f1d1d; color: #fff; }
.om-hub-close {
  padding: 10px; font-size: 13px; cursor: pointer; color: var(--om-text);
  background: var(--om-surface); border: none; border-top: 1px solid var(--om-border);
}
.om-hub-close:hover { background: var(--om-hover); }
.om-side-list, .om-body, .om-readme-body, .om-versions {
  scrollbar-width: auto;
  scrollbar-color: var(--om-scroll) transparent;
}
.om-side-list::-webkit-scrollbar, .om-body::-webkit-scrollbar,
.om-readme-body::-webkit-scrollbar, .om-versions::-webkit-scrollbar { width: 14px; height: 14px; }
.om-side-list::-webkit-scrollbar-track, .om-body::-webkit-scrollbar-track,
.om-readme-body::-webkit-scrollbar-track, .om-versions::-webkit-scrollbar-track { background: transparent; }
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
.om-card-desc { color: var(--om-text-2); font-size: 11px; line-height: 1.45; cursor: pointer;
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; }
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
.om-dev > .om-panel { margin: 0; }
.om-tabs { margin: 10px 0; border: 1px solid var(--om-border, #2c332b); border-radius: 8px;
  overflow: hidden; }
.om-tabstrip { display: flex; flex-wrap: wrap; gap: 2px; padding: 4px;
  border-bottom: 1px solid var(--om-border, #2c332b);
  background: var(--comfy-menu-bg, rgba(255,255,255,0.03)); }
.om-tab { display: inline-flex; align-items: baseline; gap: 5px; padding: 5px 10px;
  border: 0; border-radius: 6px; background: transparent; color: inherit; font: inherit;
  font-size: 12px; cursor: pointer; }
.om-tab:hover { background: var(--om-input, rgba(255,255,255,0.06)); }
.om-tab-on { background: var(--om-input, rgba(255,255,255,0.10)); font-weight: 600; }
.om-tab-note { font-size: 10px; opacity: 0.6; white-space: nowrap; }
.om-tabfold { flex: none; display: inline-flex; align-items: center; justify-content: center;
  width: 20px; padding: 0; border: 0; border-radius: 6px; background: transparent;
  color: var(--om-muted); font: inherit; font-size: 11px; line-height: 1; cursor: pointer; }
.om-tabfold:hover { background: var(--om-input, rgba(255,255,255,0.06)); color: var(--om-text); }
.om-tabfold:focus-visible { outline: 2px solid #388bfd; outline-offset: 1px; }
.om-tabs-shut > .om-tabstrip { border-bottom: 0; }
.om-tabs-shut > .om-tabbody { display: none; }
.om-tabbody { max-height: 46vh; overflow: auto; }
.om-tabs > .om-tabbody > * { padding: 10px; }
.om-tabbody .om-wf-list, .om-tabbody .om-nodelist, .om-tabbody .om-chg,
.om-tabbody .om-chg-text, .om-tabbody .om-gal, .om-tabbody .om-caps,
.om-tabbody .om-versions { max-height: none; overflow: visible; }
.om-tabbody .om-side-status { line-height: 1.5; }
.om-tabbody > .om-caps-pane > .om-caps-note { padding: 0 0 6px; }
.om-wf-list { display: flex; flex-direction: column; gap: 6px;
  max-height: 40vh; overflow-y: auto; padding: 2px 2px 2px 0; }
.om-caps { display: grid; gap: 6px; padding: 0 12px 10px;
  grid-template-columns: repeat(auto-fill, minmax(max(290px, calc(50% - 3px)), 1fr)); }
.om-cap { display: flex; flex-direction: column; gap: 2px; padding: 7px 9px;
  border: 1px solid var(--om-border, #2c332b); border-radius: 6px;
  background: var(--comfy-input-bg, rgba(255,255,255,0.03)); }
.om-cap-head { display: flex; align-items: center; gap: 6px; min-width: 0; }
.om-cap-icon { flex: none; opacity: 0.85; }
.om-cap-name { font-weight: 600; font-size: 12px; min-width: 0; }

.om-cap-what { font-size: 11px; opacity: 0.72; line-height: 1.35; padding-left: 20px; }
.om-caps-note { padding: 10px 12px 6px; font-size: 11px; opacity: 0.72; }
.om-caps-bad { margin: 0 12px 10px; padding: 8px 10px; border-radius: 6px;
  border: 1px solid var(--om-warn-border, rgba(217,112,95,0.45));
  background: var(--om-warn-bg, rgba(217,112,95,0.10)); font-size: 11px; }
.om-caps-list { font-family: ui-monospace, monospace; margin: 3px 0 4px; word-break: break-all; }
.om-panel-body > .om-wf-list, .om-panel-body > .om-gal { padding: 10px 12px; }
.om-panel-body > .om-side-status, .om-panel-body > .om-body,
.om-panel-body > .om-dl-note { padding: 12px; line-height: 1.5; }
.om-panel-body > * > .om-side-status:only-child { padding: 12px; line-height: 1.5; }
.om-nodes-bar + .om-side-status { padding: 12px; }
.om-chg { display: flex; flex-direction: column; }
.om-chg-item { padding: 10px 12px; border-bottom: 1px solid var(--om-surface); }
.om-chg-item:last-child { border-bottom: none; }
.om-chg-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 4px; }
.om-chg-here { font-size: 11px; font-weight: 600; color: var(--om-text-2);
  border: 1px solid var(--om-border); border-radius: 999px; padding: 1px 8px; }
.om-chg-text { color: var(--om-text-2); white-space: pre-wrap; overflow-wrap: anywhere; }
.om-pip-errors { font-family: ui-monospace, monospace; font-size: 12px; color: #f0883e;
  background: var(--om-input); border-radius: 6px; padding: 8px 10px; margin-top: 4px;
  max-height: 30vh; overflow: auto; }
.om-panel-body > .om-chg-text { padding: 10px 12px; font-family: ui-monospace, monospace;
  font-size: 12px; max-height: 34vh; overflow: auto; }
.om-nodes-bar { display: flex; align-items: center; gap: 8px; padding: 8px 12px;
  flex-wrap: wrap; border-bottom: 1px solid var(--om-surface); }
.om-nodes-at { flex: none; min-width: 110px; }
.om-nodelist { display: flex; flex-direction: column; gap: 6px; padding: 6px 0;
  max-height: 46vh; overflow-y: auto; }
.om-nodes-find { flex: 1 1 200px; min-width: 140px; }
.om-nodes-group { max-width: 200px; flex: 0 1 auto; }
.om-nodelist-item.om-node-here { cursor: grab; }
.om-nodelist-item.om-node-here:active { cursor: grabbing; }
.om-nodelist-item.om-node-here a { cursor: pointer; }
.om-nodelist-item.om-node-here:hover {
  background: color-mix(in srgb, var(--om-bg) 74%, #000); }
.om-nodelist-item.om-node-absent { opacity: .72; }
.om-nodelist-from { padding: 0 0 8px; line-height: 1.5; }
.om-nodelist-item { padding: 8px 12px; border-radius: 8px;
  background: color-mix(in srgb, var(--om-bg) 84%, #000); }
.om-node-ghost { position: fixed; left: -9999px; top: 0; width: 190px; border-radius: 8px;
  overflow: hidden; box-shadow: 0 8px 20px rgba(0,0,0,.5); pointer-events: none;
  font: 11px/1 system-ui, sans-serif; }
.om-node-ghost-bar { padding: 7px 9px; font-weight: 600; white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis; background: var(--om-ghost-title, #333);
  color: var(--om-ghost-text, #e6edf3); }
.om-node-ghost-body { position: relative; background: var(--om-ghost-body, #353535); }
.om-node-ghost-slot { position: absolute; width: 7px; height: 7px; border-radius: 50%;
  background: var(--om-ghost-slot, #9a9a9a); }
.om-node-name { font-weight: 600; font-family: ui-monospace, monospace; font-size: 12px; }
.om-wf-item { display: flex; align-items: baseline; gap: 10px; text-align: left;
  background: var(--om-surface); border: 1px solid var(--om-border); border-radius: 8px; padding: 8px 12px;
  color: var(--om-text); cursor: pointer; font: inherit; }
.om-wf-item:hover { border-color: #388bfd; background: #1c2230; }
.om-wf-name { font-weight: 600; }
.om-wf-path { color: var(--om-muted); font-size: 11px; }
.om-gal { display: grid; gap: 8px; padding: 2px 0;
  grid-template-columns: repeat(auto-fill, minmax(var(--om-gal-thumb, 120px), 1fr)); }
.om-gal-cell { padding: 0; overflow: hidden; cursor: zoom-in; aspect-ratio: 1 / 1;
  background: var(--om-input); border: 1px solid var(--om-border); border-radius: 8px; }
.om-gal-cell:hover { border-color: #388bfd; }
.om-gal-cell:focus-visible { outline: 2px solid #388bfd; outline-offset: 2px; }
.om-gal-cell.om-gal-dead { display: none; }
.om-gal-img { display: block; width: 100%; height: 100%; object-fit: cover; }
.om-lb { position: fixed; inset: 0; z-index: 10010; background: rgba(0,0,0,.88);
  display: flex; align-items: center; justify-content: center; }
.om-lb-fig { margin: 0; display: flex; flex-direction: column; align-items: center; gap: 10px; }
.om-lb-img { max-width: 92vw; max-height: 82vh; object-fit: contain; border-radius: 6px; }
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
@media (max-width: 720px), (max-height: 560px) {
  .om-lb-img { max-width: 96vw; max-height: 74vh; }
  .om-lb-nav { font-size: 20px; padding: 8px 11px; }
  .om-lb-prev { left: 6px; }
  .om-lb-next { right: 6px; }
}
.om-refbar { display: inline-flex; gap: 6px; align-items: center; position: relative; }
.om-ref-note { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.om-ref-note b { flex: none; }
.om-ref-back { flex: none; margin-left: auto; padding: 4px 12px; font-size: 12px; }
.om-ref-label { color: var(--om-muted); font-size: 12px; }
.om-refbar .om-ref-select { flex: none; min-width: 88px; max-width: 280px; }
.om-ref-probe { position: absolute; left: -9999px; top: 0; white-space: pre; visibility: hidden; }
.om-side-controls { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.om-side-select { flex: 1 1 130px; min-width: 120px; padding: 5px 8px; border-radius: 6px;
  background: var(--om-input); color: var(--om-text); border: 1px solid var(--om-border); font-size: 12px; }
.om-side-filter { display: flex; gap: 5px; align-items: center; color: var(--om-muted); font-size: 12px; }

.om-dl-pick { width: min(90vw, 820px); height: auto; max-height: 80vh; }
.om-dl-pick .om-head { padding-right: 44px; }
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
.om-dl-add { width: min(92vw, 560px); }
.om-dl-field { display: flex; flex-direction: column; gap: 4px; }
.om-dl-field > span { color: var(--om-muted); font-size: 11px; text-transform: uppercase;
  letter-spacing: .04em; }
.om-dl-note { color: var(--om-muted); font-size: 13px; }
.om-dl-ok { color: #3fb950; }
.om-dl-bad { color: #f85149; }
.om-dl-model { display: flex; gap: 10px; align-items: flex-start; cursor: pointer;
  border: 1px solid var(--om-border); border-radius: 8px; padding: 10px 12px;
  background: var(--om-surface); }
.om-dl-model:hover { border-color: var(--om-muted); }
.om-lib-actions { display: flex; align-items: center; gap: 8px; padding: 2px 0 6px; }
.om-dl-have { opacity: .55; }
.om-dl-have:hover { opacity: .85; }
.om-dl-refused { opacity: .5; cursor: not-allowed; }
.om-dl-check { margin-top: 3px; flex: none; }
.om-dl-modeltext { display: flex; flex-direction: column; gap: 4px; min-width: 0; flex: 1; }
.om-dl-pickfoot { display: flex; gap: 12px; align-items: center; padding: 12px 20px;
  border-top: 1px solid var(--om-border); }
.om-dl-wf { flex: none; max-width: 320px; }
.om-dl-open { display: inline-flex; align-items: center; gap: 5px; margin: 0 6px;
  padding: 3px 9px; border-radius: 6px; border: 1px solid var(--om-border);
  background: transparent; color: var(--om-text-2); cursor: pointer; white-space: nowrap;
  font: 12px/1.4 system-ui, sans-serif; }
.om-dl-open:hover { background: var(--om-hover); color: var(--om-text); }
.om-dl-open-icon { font-size: 13px; line-height: 1; }
@media (max-width: 1100px) { .om-dl-open-text { display: none; } }
.om-dl-open-icons { margin: 2px; padding: 3px; width: 28px; min-height: 24px;
  align-self: stretch; justify-content: center; }
.om-dl-open-icons .om-dl-open-text { display: none; }
.om-dl-open-icons .om-dl-open-icon { font-size: 14px; }
.om-dl-field > select, .om-dl-field > input { flex: none; }
.om-dl-place { display: flex; gap: 6px; align-items: center; margin-top: 2px; }
.om-dl-place > span { color: var(--om-muted); font-size: 11px; flex: none; }
.om-dl-root { font-size: 11px; padding: 3px 6px; max-width: 340px; }
.om-dl-root option:disabled { color: var(--om-muted); }
.om-note-wide { width: min(94vw, 640px); }
.om-cmd { flex: 1; min-width: 0; background: var(--om-input); color: var(--om-text);
  border: 1px solid var(--om-border); border-radius: 6px; padding: 7px 10px;
  font: 12px/1.5 ui-monospace, monospace; white-space: pre-wrap; overflow-wrap: anywhere;
  user-select: all; }
.om-note-foot { flex-wrap: wrap; }
.om-note-foot .om-btn { white-space: nowrap; }
.om-facts { display: grid; grid-template-columns: max-content minmax(0, 1fr);
  gap: 5px 16px; margin: 0; font-size: 12px; }
.om-facts dt { color: var(--om-muted); }
.om-facts dd { margin: 0; color: var(--om-text); overflow-wrap: anywhere; }
.om-dl-views { display: flex; align-items: center; gap: 4px; padding: 10px 20px 0; }
.om-dl-bar-end { margin-left: auto; display: inline-flex; align-items: center; gap: 8px;
  flex: none; padding-bottom: 6px; }
.om-dl-plus { display: inline-flex; align-items: center; justify-content: center;
  min-width: 30px; height: 26px; padding: 0 8px; line-height: 0; }
.om-plus-mark { display: block; }
.om-dl-view { background: none; border: none; cursor: pointer; padding: 6px 12px;
  border-radius: 6px 6px 0 0; color: var(--om-muted); font: 600 13px/1.4 system-ui, sans-serif; }
.om-dl-view:hover { color: var(--om-text); background: var(--om-hover); }
.om-dl-view.om-dl-on { color: var(--om-text); background: var(--om-surface); }
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
.om-dl-row.om-dl-gone { opacity: .62; }
.om-dl-row.om-dl-gone:hover { opacity: 1; }
.om-dl-hash { display: flex; gap: 8px; align-items: baseline; }
.om-dl-hash-label { color: var(--om-muted); font-size: 11px; letter-spacing: .04em; flex: none; }
.om-dl-hash-value { color: var(--om-muted); font: 12px/1.4 ui-monospace, monospace;
  cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.om-dl-hash-value:hover { color: var(--om-text); }
.om-float:not(.om-float-active) .om-float-bar { background-color: var(--om-hover);
  background-image: var(--om-bar-paint, none);
  color: var(--om-muted); }
.om-float:not(.om-float-active) .om-float-body,
.om-float:not(.om-float-active) .om-float-tools { opacity: .82; }
.om-float:not(.om-float-active) { border-color: color-mix(in srgb, var(--om-border) 60%, transparent); }
.om-blur-inactive .om-float:not(.om-float-active) .om-float-body,
.om-blur-inactive .om-float:not(.om-float-active) .om-float-tools {
  filter: blur(var(--om-blur-back, 3px)); }
body.om-aero .om-float { background: transparent; }
body.om-aero .om-float-body { background: var(--om-bg); }
body.om-aero .om-float-bar,
body.om-aero .om-float-tools {
  background-color: color-mix(in srgb, var(--om-surface) var(--om-aero-alpha, 55%), transparent);
  -webkit-backdrop-filter: blur(var(--om-aero-blur, 12px)) saturate(140%);
  backdrop-filter: blur(var(--om-aero-blur, 12px)) saturate(140%); }
body.om-aero .om-float-bar { position: relative; }
body.om-aero .om-float-tools { position: relative; }
body.om-aero .om-float-bar::after,
body.om-aero .om-float-tools::after {
  content: ""; position: absolute; inset: 0; pointer-events: none;
  background: rgba(0, 0, 0, var(--om-aero-dark, .18)); }
body.om-aero .om-float-bar > *,
body.om-aero .om-float-tools > * { position: relative; z-index: 1; }
body.om-aero .om-float:not(.om-float-active) .om-float-bar,
body.om-aero .om-float:not(.om-float-active) .om-float-tools {
  background-color: color-mix(in srgb, var(--om-surface)
    calc(var(--om-aero-alpha, 55%) * 0.7), transparent); }
body.om-aero .om-float-tools {
  background-color: color-mix(in srgb, var(--om-surface)
    calc(var(--om-aero-alpha, 55%) + 26%), transparent); }
body.om-aero .om-float:not(.om-float-active) .om-float-tools {
  background-color: color-mix(in srgb, var(--om-surface)
    calc(var(--om-aero-alpha, 55%) * 0.7 + 22%), transparent); }
body.om-aero .om-float-tools::after {
  background: rgba(0, 0, 0, calc(var(--om-aero-dark, .18) + .10)); }
.om-float { position: fixed; display: flex; flex-direction: column;
  max-width: calc(100vw - 16px);
  background: var(--om-bg); color: var(--om-text); border: 1px solid var(--om-border);
  border-radius: 10px; box-shadow: var(--om-shadow, 0 10px 40px rgba(0,0,0,.5));
  overflow: hidden;
  font: var(--om-text-size, 14px)/1.5 system-ui, sans-serif; }
.om-float-bar { display: flex; align-items: center; gap: 8px; padding: 0 10px;
  min-height: var(--om-hdr, 44px);
  border-bottom: 1px solid var(--om-border); background: var(--om-surface);
  background-image: var(--om-bar-paint, none);
  cursor: move; user-select: none; flex: none;
  touch-action: none; }
.om-float-folded .om-float-bar { border-bottom: none; }
.om-float-folded .om-float-tools { display: none; }
.om-float-icon { width: calc(var(--om-title-size, 15px) * 1.5); flex: none;
  height: calc(var(--om-title-size, 15px) * 1.5); border-radius: 4px;
  object-fit: cover; background: var(--om-input); }
.om-float-glyph { width: calc(var(--om-title-size, 15px) * 1.5); flex: none;
  height: calc(var(--om-title-size, 15px) * 1.5); background-color: currentColor;
  opacity: .85; }
.om-float-title { font-size: var(--om-title-size, 15px); font-weight: 600;
  flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; }
.om-float-badge { color: var(--om-muted); font-size: 13px; flex: 1; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.om-float-tools { display: flex; align-items: center; gap: 8px; flex: none;
  min-height: 38px; height: 38px; padding: 0 10px;
  border-bottom: 1px solid var(--om-border); background: var(--om-surface);
  overflow-x: auto; overflow-y: hidden; scrollbar-width: thin; }
.om-float-tools:empty { display: none; }
.om-float-tools .om-tools-menu { order: -1; }
.om-float-tools .om-tools-menu + .om-tools-menu { margin-left: -4px; }
.om-float-tools .om-btn, .om-deskset .om-btn { padding: 4px 11px; border-radius: 4px; font-size: 12px;
  line-height: 18px; background: var(--om-input); border-color: var(--om-border);
  color: var(--om-text); font-weight: 400; }
.om-float-tools .om-btn:hover:not(:disabled), .om-deskset .om-btn:hover:not(:disabled) { background: var(--om-hover);
  border-color: color-mix(in srgb, var(--om-text) 26%, var(--om-border)); }
.om-float-tools .om-btn:active:not(:disabled), .om-deskset .om-btn:active:not(:disabled) { background: var(--om-border); }
.om-float-tools .om-btn:disabled, .om-deskset .om-btn:disabled { opacity: .45; cursor: default; }
.om-float-tools .om-btn.om-go, .om-deskset .om-btn.om-go { background: var(--om-input); color: var(--om-text);
  border-color: color-mix(in srgb, var(--om-text) 30%, var(--om-border)); font-weight: 500; }
.om-float-tools .om-btn.om-go:hover:not(:disabled), .om-deskset .om-btn.om-go:hover:not(:disabled) { background: var(--om-hover); }
.om-float-tools .om-btn.om-danger, .om-deskset .om-btn.om-danger { background: var(--om-input); border-color: var(--om-border);
  color: #f85149; }
.om-float-tools .om-btn.om-danger:hover:not(:disabled),
.om-deskset .om-btn.om-danger:hover:not(:disabled) {
  background: color-mix(in srgb, #f85149 14%, transparent); border-color: #f85149; }
.om-float-tools .om-side-select { flex: 0 0 auto; min-width: 0; width: auto; padding: 4px 6px;
  border-radius: 4px; font-size: 12px; background: var(--om-input); }
.om-float-tools > * { flex: none; }
.om-float-away { display: none !important; }
.om-float-travel { transition: transform .16s ease-in, opacity .16s ease-in;
  pointer-events: none; will-change: transform, opacity; }
@media (prefers-reduced-motion: reduce) { .om-float-travel { transition: none; } }
.om-float-fold, .om-float-close, .om-float-min { background: none; border: none; color: var(--om-muted);
  cursor: pointer; line-height: 1; flex: none; display: inline-flex;
  align-items: center; justify-content: center; width: 24px; height: 24px;
  border-radius: 5px; padding: 0; }
.om-float-fold { font-size: 16px; }
.om-float-min { font-size: 13px; }
.om-float-min:hover { background: var(--om-hover); color: var(--om-text); }
.om-float-close { font-size: 20px; }
.om-float-fold:hover, .om-float-close:hover { background: var(--om-hover); }
.om-float-fold:hover, .om-float-close:hover { color: var(--om-text); }
.om-float-body { display: flex; flex-direction: column; overflow: hidden;
  flex: 0 0 auto; min-height: 0;
  max-height: calc(100vh - var(--om-hdr, 44px) - 24px - var(--om-bar-h, 0px)); }
.om-float-folded .om-float-body { display: none; }
.om-float-fixed .om-float-bar { cursor: default; }
.om-float-grip { position: absolute; right: 0; bottom: 0; width: 16px; height: 16px;
  cursor: nwse-resize; touch-action: none; }
.om-float-grip::after { content: ""; position: absolute; right: 3px; bottom: 3px;
  width: 7px; height: 7px; border-right: 2px solid var(--om-muted);
  border-bottom: 2px solid var(--om-muted); opacity: .6; }
.om-float-folded .om-float-grip { display: none; }
.om-files { display: flex; height: 100%; min-height: 0; }
.om-files-tree { flex: none; width: 212px; min-width: 0; overflow: auto; padding: 8px 6px; }
.om-files-grip { flex: none; width: 7px; cursor: col-resize; align-self: stretch;
  border-left: 1px solid var(--om-border); }
.om-files-grip:hover { background: color-mix(in srgb, var(--om-text) 14%, transparent); }
.om-files-group { display: flex; align-items: center; gap: 5px; width: 100%;
  padding: 8px 8px 4px; border: 0; background: transparent; cursor: pointer;
  color: var(--om-muted); font: inherit; font-size: 11px;
  font-weight: 700; text-transform: uppercase; letter-spacing: .04em; text-align: left; }
.om-files-group:hover { color: var(--om-text-2); }
.om-files-group-mark { flex: none; font-size: 8px; line-height: 1; }
.om-files-group-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; }
.om-files-group-count { flex: none; font-weight: 600; letter-spacing: 0;
  color: var(--om-muted); }
.om-files-node { display: flex; align-items: center; gap: 2px; border-radius: 5px; }
.om-files-node:hover { background: var(--om-hover); }
.om-files-node-on { background: var(--om-hover); }
.om-files-node-on .om-files-place { color: var(--om-text); font-weight: 600; }
.om-files-where { flex: 0 1 auto; min-width: 0; padding-right: 4px; color: var(--om-muted);
  font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.om-files-node .om-files-place { flex: 1 1 auto; }
.om-files-twist { flex: none; width: 20px; height: 20px; padding: 0; border: 0;
  display: flex; align-items: center; justify-content: center; border-radius: 4px;
  background: transparent; color: var(--om-text-2); font: inherit; font-size: 11px;
  line-height: 1; cursor: pointer; }
.om-files-twist:hover { color: var(--om-text); background: var(--om-border); }
.om-files-place { display: block; flex: 1; min-width: 0; text-align: left; padding: 5px 6px;
  border: 0; border-radius: 5px; background: transparent; color: var(--om-text-2);
  font: inherit; font-size: 12px; cursor: pointer; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap; }
.om-files-place:hover { color: var(--om-text); }
.om-files-right { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.om-files-trail { display: flex; align-items: center; gap: 2px; flex: none; flex-wrap: wrap;
  padding: 6px 8px; border-bottom: 1px solid var(--om-border); font-size: 13px; }
.om-files-readonly { margin-left: auto; padding: 1px 8px; border-radius: 999px;
  background: var(--om-input); border: 1px solid var(--om-border);
  color: var(--om-muted); font-size: 11px; }
.om-files-list { flex: 1; min-height: 0; overflow: auto; padding: 4px; }
.om-files-row { display: flex; align-items: center; gap: 8px; padding: 5px 8px;
  border-radius: 5px; cursor: default; }
.om-files-row:hover { background: var(--om-hover); }
.om-files-row-on,
.om-files-row-on:hover {
  background: color-mix(in srgb, var(--p-button-text-primary-color, #388bfd) 26%, transparent); }
.om-files-list:focus-visible { outline: none; }
.om-files-folder { cursor: pointer; }
.om-files-kind { flex: none; width: 52px; color: var(--om-muted); font-size: 11px; }
.om-mgr-keys { color: var(--om-muted); font-size: 11px; margin-top: 2px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.om-props-head2 { color: var(--om-muted); font-size: 11px; font-weight: 700;
  text-transform: uppercase; letter-spacing: .06em; margin-top: 4px; }
.om-props-keys { display: flex; flex-wrap: wrap; gap: 4px; }
.om-props-key-chip { padding: 2px 8px; border: 1px solid var(--om-border);
  border-radius: 999px; background: var(--om-input); color: var(--om-text-2);
  font-size: 11px; }
.om-props-sub { color: var(--om-text-2); font-size: 12px; }
.om-props-note { color: var(--om-muted); font-size: 11px; }
.om-mgr-list { flex: 1; min-height: 0; overflow: auto; padding: 6px; }
.om-mgr-row { display: flex; align-items: center; gap: 10px; padding: 8px 10px;
  border-radius: 6px; }
.om-mgr-row:hover { background: var(--om-hover); }
.om-mgr-art { width: 26px; height: 26px; flex: none; background-color: currentColor; }
.om-mgr-shot { width: 26px; height: 26px; flex: none; border-radius: 5px;
  object-fit: cover; }
.om-mgr-text { flex: 1; min-width: 0; }
.om-mgr-name { font-size: 13px; font-weight: 600; display: flex; align-items: baseline;
  gap: 8px; }
.om-mgr-by { color: var(--om-muted); font-size: 11px; font-weight: 400; }
.om-mgr-hint { color: var(--om-text-2); font-size: 12px; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap; }
.om-mgr-switch { flex: none; }
.om-task { display: flex; align-items: center; gap: 0; flex: none;
  height: var(--workflow-tabs-height, 2.375rem); padding: 0 8px 0 0;
  background: var(--comfy-menu-bg, var(--om-bg));
  border-top: 1px solid var(--interface-stroke, var(--om-border));
  color: var(--om-text); font: 500 12px/1.4 system-ui, sans-serif;
  overflow: hidden; }
.om-task-strip { display: flex; align-items: center; gap: 0; flex: 1; height: 100%;
  min-width: 0; overflow-x: auto; overflow-y: hidden; overscroll-behavior-x: contain;
  scrollbar-width: thin; }
.om-task-start { flex: none; }
.om-task-start[aria-expanded="true"] { background: var(--om-input); }
.om-start { position: fixed; z-index: ${MENU_Z}; width: 268px;
  height: min(420px, 62vh);
  display: flex; flex-direction: column; overflow: hidden; padding: 4px;
  background: var(--om-surface); border: 1px solid var(--om-border); border-radius: 10px;
  box-shadow: 0 10px 30px rgba(0,0,0,.55); font: 13px/1.5 system-ui, sans-serif; }
.om-start-find { margin: 2px 2px 4px; }
.om-start-list { flex: 1; min-height: 0; overflow-y: auto; align-content: start;
  scrollbar-width: thin; }
.om-start-row { display: flex; align-items: center; gap: 9px; padding: 6px 10px;
  border-radius: 6px; cursor: pointer; color: var(--om-text); }
.om-start-row:hover, .om-start-row:focus-visible { background: var(--om-hover); outline: none; }
.om-start-art { width: 17px; height: 17px; flex: none; background-color: currentColor; }
.om-start-img { width: 17px; height: 17px; flex: none; object-fit: contain; }
.om-start-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; }
.om-start-pin { flex: none; padding: 2px 7px; border: 1px solid var(--om-border);
  border-radius: 5px; background: transparent; color: var(--om-muted); font: inherit;
  font-size: 11px; cursor: pointer; visibility: hidden; }
.om-start-row:hover .om-start-pin, .om-start-pin:focus-visible { visibility: visible; }
.om-start-pin:hover { color: var(--om-text); background: var(--om-input); }
.om-start-none { padding: 10px; color: var(--om-muted); }
.om-start-pop { width: 248px; height: auto; max-height: min(420px, 62vh);
  padding: 4px 2px; overflow-y: auto; scrollbar-width: thin; }
.om-start-group .om-start-name { font-weight: 600; }
.om-start-more { flex: none; padding-left: 6px; color: var(--om-muted); font-size: 13px; }
.om-task-pinned { position: fixed; left: 0; right: 0; bottom: 0; z-index: ${TASKBAR_Z}; }
.om-task-hidden { transform: translateY(calc(100% + 4px)); }
.om-task { transition: transform .16s ease-out; }
@media (prefers-reduced-motion: reduce) { .om-task { transition: none; } }
.om-desk { position: fixed; z-index: ${DESK_Z}; overflow: hidden;
  background: var(--bg-color, var(--om-bg)); background-size: cover;
  background-position: center;
  display: none; flex-direction: column; }
.om-desk-on { display: flex; }
.om-desk-chrome { transition: transform .18s ease, opacity .18s ease; }
.om-desk-chrome.om-desk-away { transform: translateY(-150%); opacity: 0;
  pointer-events: none !important; }
.om-desk-chrome.om-desk-under.om-desk-away { transform: translateY(150%); }
.om-tab-drop { outline: 2px dashed var(--om-accent, #4493f8); outline-offset: -2px;
  border-radius: 6px; background: color-mix(in srgb, var(--om-accent, #4493f8) 12%, transparent); }
body.om-desk-open .workflow-tabs .p-togglebutton-checked {
  box-shadow: none !important; border-bottom-color: transparent !important;
  color: var(--om-muted, #8b949e) !important; }
body.om-desk-open .workflow-tabs .p-togglebutton-checked::before { opacity: .4; }
body.om-desk-open .workflow-tabs [data-om-tint].p-togglebutton-checked {
  background: color-mix(in srgb, var(--om-tab-tint) 14%, var(--om-tab-under, #151915)) !important;
  --comfy-menu-bg: color-mix(in srgb, var(--om-tab-tint) 14%, var(--om-tab-under, #151915)); }
body.om-desk-open .subgraph-breadcrumb,
body.om-desk-open div:has(> div > .actionbar-container),
body.om-desk-open div:has(> .actionbar-container) {
  transform: translateY(-150%) !important; opacity: 0 !important;
  pointer-events: none !important;
  transition: transform .18s ease, opacity .18s ease; }
.om-desk-grid { position: relative; height: 100%; overflow: hidden;
  --om-desk-icon: 44px; --om-desk-label: 12px; }
.om-desk-cell { position: absolute; touch-action: none; }
.om-desk-dragging { opacity: .7; z-index: 2; cursor: grabbing; }
.om-desk-ghost { position: absolute; border-radius: 8px; pointer-events: none;
  border: 1px dashed color-mix(in srgb, var(--om-text) 45%, transparent);
  background: color-mix(in srgb, var(--om-text) 8%, transparent); }
.om-deskset { display: flex; flex-direction: column; gap: 10px; padding: 14px 16px;
  flex: 1; min-height: 0; overflow-y: auto; }
.om-deskset-head { display: flex; align-items: center; gap: 10px; margin-top: 14px;
  color: var(--om-text); font-size: 13px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .08em; }
.om-deskset-head:first-of-type { margin-top: 4px; }
.om-deskset-head::after { content: ""; flex: 1; height: 1px;
  background: var(--om-border); }
.om-deskset-screen { border: 6px solid #0c0d10; border-radius: 10px; overflow: hidden;
  aspect-ratio: 16 / 9; position: relative; background: var(--bg-color, var(--om-bg));
  background-size: cover; background-position: center;
  box-shadow: 0 6px 16px rgba(0,0,0,.45); flex: none; }
.om-deskset-stand { width: 64px; height: 6px; margin: 0 auto; border-radius: 0 0 5px 5px;
  background: #0c0d10; flex: none; }
.om-deskset-cell { position: absolute; display: flex; flex-direction: column;
  align-items: center; gap: 2px; }
.om-deskset-cell span:last-child { color: var(--om-text); line-height: 1.2;
  text-shadow: 0 1px 2px rgba(0,0,0,.8); white-space: nowrap; }
.om-deskset-row { display: flex; align-items: center; gap: 10px; }
.om-deskset-row > label { flex: none; min-width: 108px; color: var(--om-muted);
  font-size: 13px; }
.om-deskset-row > input[type="range"] { flex: 1; }
.om-deskset-figure { flex: none; min-width: 42px; text-align: right;
  font-variant-numeric: tabular-nums; color: var(--om-text-2); font-size: 12px; }
.om-deskset-papers { display: grid; gap: 8px; grid-template-columns: repeat(auto-fill, 86px);
  max-height: 150px; overflow-y: auto; flex: none; }
.om-deskset-paper { width: 86px; height: 50px; padding: 0; border-radius: 6px;
  border: 1px solid var(--om-border); background: var(--om-input) center / cover no-repeat;
  cursor: pointer; }
.om-deskset-paper-on { outline: 2px solid var(--p-button-text-primary-color, #388bfd);
  outline-offset: 1px; }
.om-deskset-note { color: var(--om-muted); font-size: 12px; line-height: 1.5; }
.om-deskset-palette { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.om-deskset-palette-row { display: inline-flex; align-items: center; gap: 4px; }
.om-deskset-swatch { width: 22px; height: 18px; border-radius: 4px;
  border: 1px solid var(--om-border); background-size: cover; }
.om-deskset-custom { display: flex; align-items: center; gap: 6px; width: 100%;
  padding-left: 118px; }
.om-deskset-dip { width: 34px; height: 22px; padding: 0; border-radius: 4px;
  border: 1px solid var(--om-border); background: none; cursor: pointer; }
.om-deskset-dip-label { color: var(--om-muted); font-size: 12px; }
.om-deskset-paint-name { flex: none; color: var(--om-muted); font-size: 13px;
  min-width: 108px; }
.om-deskset-switch { gap: 8px; cursor: pointer; color: var(--om-text-2); font-size: 12px; }
.om-deskset-by { margin-left: auto; color: var(--om-muted); font-size: 11px; }
.om-deskset-switch > input { flex: none; }
.om-pad { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.om-pad-pane { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.om-pad-tabs { flex: 1; min-height: 0; display: flex; flex-direction: column;
  margin: 0; border: 0; border-radius: 0; }
.om-pad-tabs > .om-tabbody { flex: 1; min-height: 0; max-height: none; overflow: hidden;
  display: flex; flex-direction: column; }
.om-pad-tabs > .om-tabbody > .om-pad-pane { flex: 1; min-height: 0; padding: 0; }
.om-pad-tabs > .om-tabbody > .om-pad-view { flex: 1; min-height: 0; padding: 14px 18px; }
.om-pad-view img { max-width: 100%; height: auto; }
.om-float-title-name { cursor: text; border-radius: 4px; padding: 0 3px; margin: 0 -3px; }
.om-float-title-name:hover { background: var(--om-hover); }
.om-rename { outline: 1px solid var(--p-button-text-primary-color, #388bfd);
  outline-offset: 1px; border-radius: 4px; background: var(--om-input);
  cursor: text; white-space: pre-wrap; overflow-wrap: anywhere; -webkit-line-clamp: none; }
.om-pad-tools-quiet .om-pad-tool:not(.om-pad-file),
.om-pad-tools-quiet .om-pad-split { opacity: .32; pointer-events: none; }
.om-pad-tools { display: flex; align-items: center; gap: 4px; padding: 6px 8px; flex: none;
  border-bottom: 1px solid var(--om-border); }
.om-pad-tool { min-width: 28px; height: 26px; padding: 0 7px; border-radius: 5px;
  border: 1px solid var(--om-border); background: transparent; color: var(--om-text-2);
  font: 600 12px/1 system-ui, sans-serif; cursor: pointer; }
.om-pad-tool:hover { background: var(--om-hover); color: var(--om-text); }
.om-pad-file { font-weight: 500; letter-spacing: .01em; }
.om-pad-split { width: 1px; height: 18px; flex: none; margin: 0 3px;
  background: var(--om-border); }
.om-pad-state { margin-left: auto; color: var(--om-muted); font-size: 11px; }
.om-pad-edit { flex: 1; min-height: 0; width: 100%; resize: none; border: none;
  padding: 14px 18px; background: var(--om-input); color: var(--om-text);
  font: 13px/1.6 ui-monospace, monospace; }
.om-pad-edit:focus { outline: none; }
.om-pad-view { flex: 1; min-height: 0; overflow: auto; padding: 12px 16px; }
.om-fold-list { display: flex; flex-direction: column; gap: 2px; padding: 6px;
  flex: 1; min-height: 0; overflow: auto; }
.om-fold-row { display: flex; align-items: center; gap: 9px; padding: 6px 8px;
  border-radius: 6px; cursor: pointer; color: var(--om-text); }
.om-fold-row:hover { background: var(--om-hover); }
.om-fold-row-on { background: color-mix(in srgb, var(--p-button-text-primary-color, #388bfd) 24%, transparent); }
.om-fold-art { width: 18px; height: 18px; flex: none; background-color: currentColor; }
.om-fold-img { width: 18px; height: 18px; flex: none; object-fit: contain; }
.om-fold-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; }
.om-fold-meta { flex: none; color: var(--om-muted); font-size: 11px; }
.om-fold-empty { padding: 14px; color: var(--om-muted); font-size: 13px; }
.om-fold-list:focus-visible { outline: none; }
.om-fold-lift { opacity: .45; }
.om-fold-over { outline: 1px dashed var(--p-button-text-primary-color, #388bfd);
  outline-offset: -2px; }
.om-save { gap: 10px; }
.om-save-trail { display: flex; align-items: center; gap: 2px; flex-wrap: wrap;
  font-size: 12px; }
.om-save-step { padding: 2px 6px; border: 0; border-radius: 5px; background: transparent;
  color: var(--om-text-2); font: inherit; font-size: 12px; cursor: pointer; }
.om-save-step:hover { background: var(--om-hover); color: var(--om-text); }
.om-save-sep { color: var(--om-muted); }
.om-save-list { flex: none; height: 220px; border: 1px solid var(--om-border);
  border-radius: 8px; background: var(--om-input); }
.om-save-dim { color: var(--om-muted); cursor: default; }
.om-props { display: flex; flex-direction: column; gap: 12px; padding: 14px 16px;
  height: 100%; min-height: 0; overflow: auto; }
.om-props-head { display: flex; align-items: center; gap: 12px; }
.om-props-face { width: 48px; height: 48px; flex: none; display: flex;
  align-items: center; justify-content: center; }
.om-props-art { width: 44px; height: 44px; background-color: currentColor; }
.om-props-img { width: 44px; height: 44px; object-fit: contain; }
.om-props-name { font-size: 15px; font-weight: 600; overflow-wrap: anywhere;
  border-radius: 4px; padding: 1px 4px; margin: -1px -4px; cursor: text; }
.om-props-name:hover { background: var(--om-hover); }
.om-props-rows { display: flex; flex-direction: column; gap: 5px;
  border-top: 1px solid var(--om-border); padding-top: 12px; }
.om-props-row { display: flex; gap: 10px; align-items: baseline; font-size: 12px; }
.om-props-key { flex: none; width: 74px; color: var(--om-muted); }
.om-props-value { flex: 1; min-width: 0; color: var(--om-text); overflow-wrap: anywhere; }
.om-props-tools { display: flex; gap: 8px; flex-wrap: wrap; margin-top: auto;
  padding-top: 10px; }
.om-props-shades { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.om-props-plain { background: var(--om-text); }
.om-props-muted { opacity: .45; }
.om-props-gone .om-props-value { color: #d29922; }
.om-trash-row { display: flex; align-items: center; gap: 9px; padding: 6px 8px;
  border-radius: 6px; color: var(--om-text); }
.om-trash-row:hover { background: var(--om-hover); }
.om-trash-when { flex: none; color: var(--om-muted); font-size: 11px; }
.om-desk-cell { display: flex; flex-direction: column; align-items: center; gap: 4px;
  width: calc(var(--om-desk-icon) + 26px); padding: 6px 3px 5px; border-radius: 8px;
  position: absolute;
  border: 1px solid transparent; background: transparent; color: var(--om-text);
  font: inherit; cursor: pointer; text-align: center; }
.om-desk-cell:hover { background: color-mix(in srgb, var(--om-text) 12%, transparent); }
.om-desk-cell-on { background: color-mix(in srgb, var(--p-button-text-primary-color, #388bfd) 26%, transparent);
  border-color: color-mix(in srgb, var(--p-button-text-primary-color, #388bfd) 60%, transparent); }
.om-desk-cell:focus-visible { outline: 1px solid var(--p-button-text-primary-color, #388bfd);
  outline-offset: 1px; }
.om-desk-art { width: var(--om-desk-icon); height: var(--om-desk-icon); flex: none;
  background-color: currentColor;
  filter: drop-shadow(0 1px 3px rgba(0,0,0,.55)); }
.om-desk-img { width: var(--om-desk-icon); height: var(--om-desk-icon); flex: none;
  object-fit: contain; filter: drop-shadow(0 1px 3px rgba(0,0,0,.55)); }
.om-desk-name { font-size: var(--om-desk-label); line-height: 1.35; overflow-wrap: anywhere;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  height: calc(var(--om-desk-label) * 2.7); width: 100%;
  overflow: hidden; text-shadow: 0 1px 3px rgba(0,0,0,.85); }
.om-desk-live { position: absolute; left: 50%; bottom: 2px; transform: translateX(-50%);
  width: 5px; height: 5px; border-radius: 50%;
  background: var(--p-button-text-primary-color, #388bfd); visibility: hidden; }
.om-desk-cell-live .om-desk-live { visibility: visible; }
.om-desk-cell-lost .om-desk-art, .om-desk-cell-lost .om-desk-img { opacity: .38; }
.om-desk-cell-lost .om-desk-name { opacity: .55; font-style: italic; }
.om-desk-tab { display: flex; align-items: center; justify-content: center; flex: none;
  width: 38px; height: 100%; padding: 0; border: none; background: transparent;
  border-right: 1px solid var(--interface-stroke, var(--om-border));
  color: var(--om-muted); cursor: pointer;
  transition: background var(--default-transition-duration, .1s) linear,
              color var(--default-transition-duration, .1s) linear; }
.om-desk-tab:hover { color: var(--om-text);
  background: var(--p-togglebutton-hover-background, var(--content-hover-bg, var(--om-hover))); }
.om-desk-tab:focus-visible { outline: 1px solid var(--p-button-text-primary-color, #388bfd);
  outline-offset: -2px; }
.om-desk-tab-on { color: var(--om-text);
  box-shadow: inset 0 -2px 0 0 var(--p-button-text-primary-color, #388bfd); }
.om-desk-mark { width: 17px; height: 17px; background-color: currentColor; }
.om-task-item { display: flex; align-items: center; gap: 8px; flex: none;
  min-width: 90px; max-width: 240px; height: 100%; padding: 0 12px;
  border: 0; border-right: 1px solid var(--interface-stroke, var(--om-border));
  border-radius: 0; background: transparent;
  color: var(--om-text-2); font-family: inherit; font-size: .875rem; font-weight: 500;
  line-height: 1.43; text-align: left; opacity: .75; cursor: pointer;
  transition: background var(--default-transition-duration, .1s) linear,
              opacity var(--default-transition-duration, .1s) linear,
              color var(--default-transition-duration, .1s) linear; }
.om-task-item:hover { opacity: 1; color: var(--om-text);
  background: var(--p-togglebutton-hover-background, var(--content-hover-bg, var(--om-hover))); }
.om-task-item:focus-visible { outline: 1px solid var(--p-button-text-primary-color, #388bfd);
  outline-offset: 1px; }
.om-task-on { background: color-mix(in srgb, var(--om-text) 6%, transparent); }
.om-task-front { opacity: 1; color: var(--om-text);
  background: var(--om-surface);
  box-shadow: inset 0 -2px 0 0 var(--p-button-text-primary-color, #388bfd); }
.om-task-start { border-right: 1px solid var(--interface-stroke, var(--om-border)); }
.om-task-start-bare { min-width: var(--om-start-wide, 38px);
  width: var(--om-start-wide, 38px); padding: 0; justify-content: center; }
.om-task-text { flex: 1; min-width: 0; max-width: 150px; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap; }
.om-task-icon { width: 16px; height: 16px; flex: none; border-radius: 3px;
  object-fit: cover; background: var(--om-input); }
.om-task-glyph { width: 16px; height: 16px; flex: none; display: inline-flex;
  align-items: center; justify-content: center; border-radius: 3px;
  font-size: 11px; line-height: 1; }
.om-task-count { flex: none; min-width: 18px; padding: 1px 6px; border-radius: 9px;
  background: var(--om-border); color: var(--om-text-2); font-size: 11px;
  line-height: 1.4; text-align: center; }
.om-task-pop { position: fixed; z-index: ${MENU_Z}; min-width: 220px; max-width: 340px;
  max-height: 50vh; overflow-y: auto; padding: 4px;
  background: var(--om-surface); border: 1px solid var(--om-border); border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0,0,0,.5); font: 13px/1.5 system-ui, sans-serif;
  opacity: 0; transition: opacity .09s linear; }
.om-task-pop-on { opacity: 1; }
.om-task-row { display: flex; align-items: center; gap: 8px; padding: 6px 8px;
  border-radius: 6px; cursor: pointer; color: var(--om-text); }
.om-task-row:hover, .om-task-row:focus-visible { background: var(--om-hover); outline: none; }
.om-task-row-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; }
.om-task-row-state { flex: none; color: var(--om-muted); font-size: 11px; }
.om-task-shut { flex: none; width: 18px; height: 18px; padding: 0; border: none;
  border-radius: 4px; background: none; color: var(--om-muted); font-size: 14px;
  line-height: 1; cursor: pointer; visibility: hidden; }
.om-task-row:hover .om-task-shut, .om-task-row:focus-within .om-task-shut { visibility: visible; }
.om-task-shut:hover { background: var(--om-hover); color: var(--om-text); }
@media (max-width: 700px) {
  .om-task-item .om-task-text { display: none; }
  .om-task-item { max-width: none; }
}
@media (pointer: coarse) {
  .om-task { height: 48px; }
  .om-task-item { height: calc(100% - 10px); }
  .om-task-row { padding: 9px 8px; }
  .om-task-shut { visibility: visible; }
}
@media (prefers-reduced-motion: reduce) {
  .om-task-pop { transition: none; }
}
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
.om-cost-high { color: #d29922; border-color: #d29922; }
.om-cost-failed { background: #a5261d; }
.om-cost-line { color: var(--om-muted); }
.om-cost-stale { color: #d29922; }
.om-mon { display: inline-flex; align-items: center; gap: 10px; margin: 0 8px;
  font: 10px/1.2 system-ui, sans-serif; color: var(--om-muted); white-space: nowrap; }
.om-mon-cell { display: inline-flex; align-items: center; gap: 4px; }
.om-mon-label { letter-spacing: .04em; }
.om-mon-bar { display: inline-block; width: 34px; height: 4px; border-radius: 2px;
  background: var(--om-input); overflow: hidden; position: relative; }
.om-mon-tube { display: inline-block; width: 5px; height: 14px; border-radius: 2px;
  background: var(--om-input); overflow: hidden; position: relative; }
.om-mon-fill { display: block; background: #58a6ff;
  transition: width .4s linear, height .4s linear, background .4s linear; }
.om-mon-h .om-mon-fill { height: 100%; width: 0; }
.om-mon-v .om-mon-fill { position: absolute; left: 0; right: 0; bottom: 0; height: 0; }
.om-mon-hot { background: #f85149; }
.om-mon-value { min-width: 28px; text-align: right; font-variant-numeric: tabular-nums; }
.om-mon-dynamic { display: inline-flex; align-items: center; gap: 10px; }
.om-mon-degrees { min-width: 24px; }
.om-prog { height: 0; pointer-events: none; overflow: hidden;
  transition: height .2s ease; }
.om-prog-flow { position: relative; width: 100%; }
.om-prog-pinned { position: fixed; top: 0; left: 0; right: 0; z-index: 10001; }
.om-prog-on { height: 14px;
  box-shadow: inset 0 -1px 0 rgba(0,0,0,.35), 0 1px 0 rgba(255,255,255,.06); }
.om-prog-track { position: absolute; inset: 0; background: #16161d; overflow: hidden; }
.om-prog { --om-prog-from: #4f688a; --om-prog-to: #84bbe7; --om-prog-cap: #d7ecff;
  --om-prog-glow: rgba(132,187,231,.85); --om-prog-halo: rgba(132,187,231,.45);
  --om-prog-sub: #6b5312; }
.om-prog-sub { position: absolute; top: 0; bottom: 0; width: 0;
  background: var(--om-prog-sub);
  transition: width .15s linear, left .3s ease, background .3s ease; }
.om-prog-main { position: absolute; top: 0; bottom: 0; left: 0; width: 0;
  background: linear-gradient(90deg, var(--om-prog-from) 0%, var(--om-prog-to) 100%);
  transition: width .3s ease; }
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
  .om-prog-sub, .om-prog-main, .om-prog { transition: none; }
}
.om-orb { width: 10px; height: 10px; border-radius: 50%; flex: none; margin-right: 2px;
  background: var(--om-muted); cursor: help; }
.om-orb-mark { width: calc(var(--om-title-size, 15px) * .85); margin-right: 0;
  height: calc(var(--om-title-size, 15px) * .85); cursor: pointer; }
.om-orb-idle { background: #6e7681; box-shadow: 0 0 4px 1px rgba(110,118,129,.45); }
.om-orb-working { background: #3fb950; box-shadow: 0 0 8px 2px rgba(63,185,80,.55);
  animation: om-orb-breathe 2.4s ease-in-out infinite; }
.om-orb-stalling { background: #d29922; box-shadow: 0 0 8px 2px rgba(210,153,34,.55); }
.om-orb-stalled { background: #d29922; box-shadow: 0 0 10px 3px rgba(210,153,34,.7);
  animation: om-orb-throb 1s ease-in-out infinite; }
.om-orb-oom { background: #f85149; box-shadow: 0 0 10px 3px rgba(248,81,73,.65); }
.om-orb-quiet { background: transparent; box-shadow: none;
  border: 2px solid #8b949e; box-sizing: border-box; }
.om-orb-streaming { background: #39c5cf; box-shadow: 0 0 8px 2px rgba(57,197,207,.55);
  animation: om-orb-breathe 2.4s ease-in-out infinite; }
.om-orb-hang { background: #f0883e;
  box-shadow: 0 0 0 2px rgba(240,136,62,.3), 0 0 12px 4px rgba(240,136,62,.7);
  animation: om-orb-throb 1s ease-in-out infinite; }
.om-facts dt .om-orb { display: inline-block; vertical-align: middle; }
.om-orb-thrashing { background: #db61a2; box-shadow: 0 0 10px 3px rgba(219,97,162,.6);
  animation: om-orb-throb 1.4s ease-in-out infinite; }
.om-mem-gone { opacity: .6; border-style: dashed; }
.om-mem-gone .om-mem-grid { filter: grayscale(.55); }
.om-mem-gone-bar .om-mem-resident { background: var(--om-muted); }
@keyframes om-orb-breathe { 0%, 100% { opacity: 1; } 50% { opacity: .55; } }
@keyframes om-orb-throb { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.35); } }
@media (prefers-reduced-motion: reduce) {
  .om-orb-working, .om-orb-stalled, .om-orb-thrashing, .om-orb-streaming,
  .om-orb-hang { animation: none; }
}
.om-mem-drop { padding: 2px 8px; font-size: 11px; flex: none; }
.om-keys { display: flex; flex-direction: column; gap: 12px; margin: 12px 0; }
.om-keys-row { border: 1px solid var(--om-border); border-radius: 8px; padding: 10px 12px;
  background: var(--om-surface); display: flex; flex-direction: column; gap: 6px; }
.om-keys-line { display: flex; gap: 8px; align-items: center; }
.om-keys-input { flex: 1; min-width: 0; font-family: ui-monospace, monospace; }
.om-mon-v { align-items: center; }
.om-mon-both { display: inline-flex; gap: 4px; align-items: baseline; }
.om-mon-compact { position: relative; }
.om-mon-compact .om-mon-value { min-width: 0; }
.om-mon-compact.om-mon-h { display: inline-grid; }
.om-mon-compact.om-mon-h > * { grid-area: 1 / 1; align-self: center; }
.om-mon-compact.om-mon-h .om-mon-bar { width: 62px; height: 13px; border-radius: 3px; }
.om-mon-compact.om-mon-h .om-mon-both { justify-self: center; padding: 0 4px;
  position: relative; z-index: 1; color: #fff; font-weight: 600;
  text-shadow: 0 0 3px rgba(0,0,0,.95), 0 1px 2px rgba(0,0,0,.9); }
.om-mon-compact.om-mon-v { flex-direction: column; gap: 2px; }
.om-mon-compact.om-mon-v .om-mon-tube { height: 16px; }
.om-mon-style-vertical .om-mon-v .om-mon-label,
.om-mon-style-vertical-compact .om-mon-v .om-mon-label {
  writing-mode: vertical-rl; text-orientation: mixed; line-height: 1; letter-spacing: .06em; }
.om-mon-style-vertical, .om-mon-style-vertical-compact,
.om-mon-style-vertical .om-mon-dynamic,
.om-mon-style-vertical-compact .om-mon-dynamic { align-items: stretch; }
.om-mon-style-vertical .om-mon-v, .om-mon-style-vertical-compact .om-mon-v {
  align-items: stretch; min-height: 28px; }
.om-mon-style-vertical .om-mon-v .om-mon-value { align-self: center; }
.om-mon-style-vertical .om-mon-v .om-mon-label,
.om-mon-style-vertical-compact .om-mon-v .om-mon-label { align-self: flex-start; }
.om-mon-style-vertical .om-mon-v .om-mon-tube,
.om-mon-style-vertical-compact .om-mon-compact.om-mon-v .om-mon-tube {
  width: 10px; height: auto; border-radius: 3px; }
.om-mon-style-vertical-compact .om-mon-compact.om-mon-v {
  flex-direction: row; gap: 3px; }
.om-mon-style-vertical-compact .om-mon-compact.om-mon-v .om-mon-value { display: none; }
@media (max-width: 1500px) { .om-mon-label { display: none; } }
@media (max-width: 1200px) { .om-mon { display: none; } }
.om-mon { cursor: pointer; border-radius: 6px; padding: 2px 4px; }
.om-mon:hover { background: var(--om-hover); }
.om-mem-body { display: flex; flex-direction: column; padding: 0; gap: 0;
  flex: 1; min-height: 0; overflow-y: auto; }
.om-mem-graph { display: flex; flex-direction: column; flex: 1 1 auto;
  max-height: calc(var(--om-hdr, 44px) + 170px); }
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
.om-mem-folded { flex: none; min-height: 0; }
.om-mem-folded .om-mem-canvas, .om-mem-folded .om-mem-graph-detail { display: none; }
.om-mem-bar-label { font-size: calc(var(--om-hdr, 44px) * 0.29); font-weight: 600;
  text-transform: uppercase; letter-spacing: .05em; color: var(--om-muted); flex: 1; }
.om-mem-bar-value { font-size: calc(var(--om-hdr, 44px) * 0.36); font-weight: 600;
  font-variant-numeric: tabular-nums; color: var(--om-text); }
.om-mem-quiet .om-mem-canvas, .om-mem-quiet .om-mem-bar-value { opacity: .45; }
.om-mem-quiet .om-mem-graph-detail { color: #d29922; }
.om-mon-quiet { opacity: .45; }
.om-mem-link { display: flex; align-items: center; gap: 10px; padding: 8px 14px;
  background: var(--om-surface); flex: none; }
.om-mem-link[hidden] { display: none; }
.om-mem-link-text { flex: 1; min-width: 0; font-size: 13px; color: var(--om-muted);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.om-mem-link-bad .om-mem-link-text { color: #d29922; }
.om-mem-link .om-btn { flex: none; }
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
.om-mem-empty { text-align: center; color: var(--om-muted); opacity: .55;
  padding: 26px 14px; font-size: 14px; }
.om-mem-split { height: 5px; border-radius: 3px; background: var(--om-input); overflow: hidden; }
.om-mem-resident { height: 100%; background: #a371f7; }
.om-mem-stream { border-color: #58a6ff; color: #58a6ff; }
.om-mem-map-slot:empty { display: none; }
.om-mem-map { display: flex; flex-direction: column; gap: 5px; margin-top: 2px; }
.om-mem-grid-frame { background: var(--om-input); border: 1px solid var(--om-border);
  border-radius: 5px; padding: 4px; }
.om-mem-grid { display: block; width: 100%; }
.om-mem-key { display: flex; flex-wrap: wrap; gap: 10px; color: var(--om-muted);
  font-size: 11px; align-items: center; }
.om-mem-key-item { display: inline-flex; align-items: center; gap: 5px; }
.om-mem-swatch { width: 8px; height: 8px; border-radius: 2px; flex: none; }
.om-mem-key-note { margin-left: auto; }
.actionbar-container .om-mon { margin: 0 2px; }
.om-lib-sweep { border-color: #d29922; }
.om-mem-bar-label + .om-lib-row { margin-top: 2px; }
`;
document.head.appendChild(sidebarStyle);


const FLOAT_SLACK_X = 16;
const FLOAT_SLACK_Y = 16;

const DRAG_DWELL = 600;

const DRAG_GAP = 300;

const floatPanels = new Map();

let floatTop = FLOAT_Z;

let taskRoom = 0;

const floatHooks = new Set();

let floatWanted = "";

function workHeight() {
  return window.innerHeight - taskRoom;
}

function setTaskRoom(height) {
  const px = Math.max(0, Math.round(height));
  if (px === taskRoom) return;
  taskRoom = px;
  document.documentElement.style.setProperty("--om-bar-h", `${px}px`);
  for (const panel of floatPanels.values()) panel.reflow?.();
  deskFit();
}

function floatChanged() {
  for (const fn of floatHooks) {
    try { fn(); } catch {}
  }
}

function floatWantFocus(key) {
  floatWanted = String(key || "");
}

function floatTakeFocus() {
  const key = floatWanted;
  floatWanted = "";
  return key;
}

function deskReduced() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function floatGroup(key) {
  const text = String(key || "");
  const at = text.indexOf(":");
  return at > 0 ? text.slice(0, at) : (text || "window");
}

function taskbarOn() {
  return panelSetting("openManager.taskbar", false) === true;
}

function taskbarGrouped() {
  return panelSetting("openManager.taskbarGroups", false) === true;
}

const HEADER_DEFAULT = 44;

function headerHeight() {
  const asked = Number(panelSetting("openManager.panelHeaders", HEADER_DEFAULT));
  return Number.isFinite(asked) ? Math.max(24, Math.min(80, Math.round(asked))) : HEADER_DEFAULT;
}

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
  try { localStorage.setItem(`om-float-${key}`, JSON.stringify(state)); } catch {}
}

function markActive(panel) {
  let changed = false;
  for (const other of document.querySelectorAll(".om-float:not(.om-float-away)")) {
    const want = other === panel;
    if (other.classList.contains("om-float-active") !== want) changed = true;
    other.classList.toggle("om-float-active", want);
  }
  if (changed) floatChanged();
}

const BAR_INERT = "button, input, textarea, select, [contenteditable]";

const BAR_PAINTS = {
  plain: "",
  accent: "var(--p-button-text-primary-color, #388bfd)",
  green: "#3fb950",
  amber: "#d29922",
  red: "#f85149",
  purple: "#a371f7",
  teal: "#39c5cf",
  grey: "var(--om-muted)",
};

function barTint(value) {
  const wanted = String(value || "").trim().toLowerCase();
  if (Object.hasOwn(BAR_PAINTS, wanted)) return BAR_PAINTS[wanted];
  return TAB_HEX.test(wanted) ? wanted : "";
}

function barPaint(look, { over = "transparent" } = {}) {
  const from = barTint(look?.from || look?.tint);
  if (!from) return "";
  const to = barTint(look?.to) || from;
  const near = `color-mix(in srgb, ${from} 22%, ${over})`;
  const far = `color-mix(in srgb, ${to} ${look?.to ? 22 : 6}%, ${over})`;
  return `linear-gradient(100deg, ${near}, ${far})`;
}

function readColour(text) {
  const parts = String(text || "").split(",").map((one) => one.trim().toLowerCase())
    .filter(Boolean);
  if (!parts.length) return null;
  if (parts.length > 1 && barTint(parts[0]) && barTint(parts[1])) {
    return { from: parts[0], to: parts[1] };
  }
  return barTint(parts[0]) ? { tint: parts[0] } : null;
}

function paintBar(bar, look) {
  bar.style.setProperty("--om-bar-paint", barPaint(look) || "none");
}

function createFloatingPanel({ key, title, width = 820, height = 520, onClose,
                               centred = false, modal = false } = {}) {
  const open = floatingPanel(key);
  if (open) { open.present(); return open; }

  let id = String(key);
  const saved = floatRecall(id, {});
  const fits = (asked, floor, room) => Math.max(floor, Math.min(asked, room));
  const wantsFloat = !modal && panelSetting("openManager.floatingPanels", true) !== false;
  const panel = el("div", "om-float");
  panel.tabIndex = -1;
  panel.addEventListener("keydown", (event) => {
    const on = event.target;
    if (!(on instanceof Element)) return;
    if (!on.closest("input, textarea, select, [contenteditable='true']")) return;
    event.stopPropagation();
  });
  const floating = () => wantsFloat;
  const roomy = () => window.innerWidth - panel.offsetWidth >= FLOAT_SLACK_X
    && workHeight() - panel.offsetHeight >= FLOAT_SLACK_Y;
  let placed = false;
  const anchored = () => floating() && (roomy() || placed);
  let parked = null;
  let minimised = false;
  let awayAt = 0;
  let snug = true;
  const applyMode = () => {
    const now = anchored();
    if (!now && snug && panel.style.left) {
      parked = { left: parseInt(panel.style.left, 10) || 0,
                 top: parseInt(panel.style.top, 10) || 0 };
    }
    snug = now;
    panel.classList.toggle("om-float-fixed", !floating());
  };
  panel.style.width = `${fits(saved.width || width, 280, window.innerWidth - 16)}px`;
  panel.style.setProperty("--om-hdr", `${headerHeight()}px`);

  const bar = el("div", "om-float-bar");
  const shrink = el("button", "om-float-min", "▁");
  shrink.title = "Minimise";
  shrink.setAttribute("aria-label", "Minimise");
  shrink.hidden = modal || !taskbarOn();
  const fold = el("button", "om-float-fold", "▾");
  fold.title = "Collapse";
  bar.appendChild(fold);
  const mark = el("img", "om-float-icon");
  mark.alt = "";
  mark.hidden = true;
  mark.onerror = () => { mark.hidden = true; };
  bar.appendChild(mark);
  const glyph = el("span", "om-float-glyph");
  glyph.hidden = true;
  bar.appendChild(glyph);
  const heading = el("div", "om-float-title", title);
  bar.appendChild(heading);
  const badge = el("div", "om-float-badge");
  bar.appendChild(badge);
  bar.appendChild(shrink);
  const close = el("button", "om-float-close", "×");
  close.title = "Close";
  bar.appendChild(close);
  panel.appendChild(bar);

  const tools = el("div", "om-float-tools");
  panel.appendChild(tools);

  const body = el("div", "om-float-body");
  body.style.height =
    `${fits(saved.height || height, 80, workHeight() - headerHeight() - 24)}px`;
  panel.appendChild(body);

  paintBar(bar, deskLook(id));

  const grip = el("div", "om-float-grip");
  grip.title = "Resize";
  panel.appendChild(grip);

  const backdrop = modal ? el("div", "om-backdrop om-backdrop-panel") : null;
  if (backdrop) {
    backdrop.appendChild(panel);
    document.body.appendChild(backdrop);
  } else {
    document.body.appendChild(panel);
  }

  const place = (left, top) => {
    const rect = panel.getBoundingClientRect();
    const x = Math.min(Math.max(left, 8 - rect.width + 120), window.innerWidth - 120);
    const y = Math.min(Math.max(top, 0), workHeight() - 36);
    panel.style.left = `${Math.round(x)}px`;
    panel.style.top = `${Math.round(y)}px`;
  };

  const settle = (left, top) => {
    const rect = panel.getBoundingClientRect();
    if (rect.width + 16 <= window.innerWidth) {
      left = Math.min(Math.max(left, 8), window.innerWidth - rect.width - 8);
    }
    if (rect.height + 16 <= workHeight()) {
      top = Math.min(Math.max(top, 8), workHeight() - rect.height - 8);
    }
    place(left, top);
  };
  const centre = () => place(
    Math.max(8, (window.innerWidth - panel.offsetWidth) / 2),
    Math.max(8, (workHeight() - panel.offsetHeight) / 2),
  );
  applyMode();
  if (anchored()) {
    settle(
      saved.left ?? Math.max(16, (window.innerWidth - panel.offsetWidth) / 2),
      saved.top ?? (centred
        ? Math.max(16, (workHeight() - panel.offsetHeight) / 2)
        : Math.max(56, workHeight() * 0.18)),
    );
  } else {
    centre();
  }

  const state = () => ({
    left: parseInt(panel.style.left, 10) || 0,
    top: parseInt(panel.style.top, 10) || 0,
    width: panel.offsetWidth,
    height: parseInt(body.style.height, 10) || height,
  });
  const remember = () => {
    if (minimised) return;
    const now = state();
    const { folded: _gone, ...previous } = floatRecall(id, {});
    if (!anchored()) { delete now.left; delete now.top; }
    floatRemember(id, { ...previous, ...now });
  };

  const raise = () => {
    markActive(panel);
    if (Number(panel.style.zIndex) === floatTop && floatTop > FLOAT_Z) return;
    floatTop = floatTop >= FLOAT_Z_TOP ? FLOAT_Z : floatTop + 1;
    panel.style.zIndex = String(floatTop);
  };
  panel.addEventListener("pointerdown", raise, true);
  let dwellFrom = 0;
  let dwellSeen = 0;
  panel.addEventListener("dragover", () => {
    if (panel.classList.contains("om-float-active")) return;
    const now = Date.now();
    if (!dwellFrom || now - dwellSeen > DRAG_GAP) dwellFrom = now;
    dwellSeen = now;
    if (now - dwellFrom < DRAG_DWELL) return;
    dwellFrom = 0;
    raise();
  });
  markActive(panel);
  panel.style.zIndex = String(FLOAT_Z);
  raise();
  panel.addEventListener("pointerdown", raise, true);

  const setFolded = (folded) => {
    panel.classList.toggle("om-float-folded", folded);
    requestAnimationFrame(() => {
      applyMode();
      if (anchored()) {
        settle(parseInt(panel.style.left, 10) || 0, parseInt(panel.style.top, 10) || 0);
      } else {
        centre();
      }
    });
    fold.textContent = folded ? "▸" : "▾";
    fold.title = folded ? "Expand" : "Collapse";
    remember();
  };
  const taskSeat = () => {
    const item = taskBar?.querySelector(`[data-om-task="${CSS.escape(id)}"]`)
      || taskBar?.querySelector(`[data-om-group="${CSS.escape(floatGroup(id))}"]`)
      || taskBar;
    return item?.getBoundingClientRect() || null;
  };

  const travel = (toward, after) => {
    const seat = taskSeat();
    const from = panel.getBoundingClientRect();
    if (!seat || !from.width || !from.height || deskReduced()) { after(); return; }
    const scale = Math.max(0.08, Math.min(1, seat.width / from.width));
    const dx = seat.left + seat.width / 2 - (from.left + from.width / 2);
    const dy = seat.top + seat.height / 2 - (from.top + from.height / 2);
    const shut = `translate(${Math.round(dx)}px, ${Math.round(dy)}px) scale(${scale})`;
    panel.classList.add("om-float-travel");
    if (toward === "bar") {
      panel.style.transform = shut;
      panel.style.opacity = "0";
    } else {
      panel.style.transform = shut;
      panel.style.opacity = "0";
      requestAnimationFrame(() => {
        panel.style.transform = "";
        panel.style.opacity = "";
      });
    }
    const done = () => {
      panel.removeEventListener("transitionend", done);
      clearTimeout(fallback);
      panel.classList.remove("om-float-travel");
      panel.style.transform = "";
      panel.style.opacity = "";
      after();
    };
    const fallback = setTimeout(done, 260);
    panel.addEventListener("transitionend", done);
  };

  const setMinimised = (want) => {
    if (modal || want === minimised) return;
    if (want && !taskbarOn()) return;
    minimised = want;
    if (want) {
      travel("bar", () => panel.classList.add("om-float-away"));
    } else {
      panel.classList.remove("om-float-away");
      travel("window", () => {});
    }
    if (want) {
      awayAt = Date.now();
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && panel.contains(focused)) focused.blur();
      panel.classList.remove("om-float-active");
      const rest = [...document.querySelectorAll(".om-float:not(.om-float-away)")]
        .sort((a, b) => (Number(a.style.zIndex) || 0) - (Number(b.style.zIndex) || 0));
      markActive(rest[rest.length - 1] || null);
      panel.dispatchEvent(new CustomEvent("om-win:minimise", { detail: { key: id } }));
      floatWantFocus(id);
      floatChanged();
      return;
    }
    requestAnimationFrame(() => {
      applyMode();
      if (anchored()) {
        settle(parseInt(panel.style.left, 10) || 0, parseInt(panel.style.top, 10) || 0);
      } else {
        centre();
      }
      remember();
      panel.dispatchEvent(new CustomEvent("om-float-resize"));
    });
    panel.dispatchEvent(new CustomEvent("om-win:restore", { detail: { key: id } }));
    raise();
    panel.focus({ preventScroll: true });
    floatChanged();
  };
  shrink.onclick = (event) => { event.stopPropagation(); setMinimised(true); };
  fold.onclick = (event) => { event.stopPropagation(); setFolded(!panel.classList.contains("om-float-folded")); };
  bar.addEventListener("dblclick", (event) => {
    if (event.target.closest(BAR_INERT)) return;
    setFolded(!panel.classList.contains("om-float-folded"));
  });

  const drag = (handle, onMove, allowed = () => true) => {
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target.closest(BAR_INERT) || !allowed()) return;
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

  drag(bar, (start, dx, dy) => {
    placed = true;
    snug = true;
    place(start.left + dx, start.top + dy);
  }, floating);
  drag(grip, (start, dx, dy) => {
    if (panel.classList.contains("om-float-folded")) return;
    panel.style.width = `${Math.max(280, start.width + dx)}px`;
    body.style.height = `${Math.max(80, start.height + dy)}px`;
    applyMode();
    if (!anchored()) centre();
    panel.dispatchEvent(new CustomEvent("om-float-resize"));
  });

  const destroy = async () => {
    const asked = handle.confirmClose?.();
    if (asked === false) return;
    if (asked && typeof asked.then === "function" && !await asked) return;
    remember();
    (backdrop || panel).remove();
    floatPanels.delete(id);
    onClose?.();
    panel.dispatchEvent(new CustomEvent("om-prog-close"));
    const rest = [...document.querySelectorAll(".om-float:not(.om-float-away)")]
      .sort((a, b) => (Number(a.style.zIndex) || 0) - (Number(b.style.zIndex) || 0));
    if (rest.length) markActive(rest[rest.length - 1]);
    floatChanged();
  };
  if (backdrop) closeOn(backdrop, destroy);
  close.onclick = destroy;

  const onResize = () => {
    if (!panel.isConnected) { window.removeEventListener("resize", onResize); return; }
    if (minimised) return;
    applyMode();
    if (!anchored()) { centre(); return; }
    const back = parked;
    parked = null;
    settle(back?.left ?? (parseInt(panel.style.left, 10) || 0),
           back?.top ?? (parseInt(panel.style.top, 10) || 0));
  };
  window.addEventListener("resize", onResize);

  let art = null;
  const showIcon = () => {
    const shown = art?.bar === false ? null : art;
    const wanted = panelSetting("openManager.windowIcons", true) !== false ? shown : null;
    if (wanted?.kind === "src") {
      mark.src = wanted.url;
      mark.hidden = false;
    } else {
      mark.hidden = true;
      mark.removeAttribute("src");
    }
    if (wanted?.kind === "mask") {
      glyph.style.setProperty("-webkit-mask", `center / contain no-repeat url("${wanted.url}")`);
      glyph.style.setProperty("mask", `center / contain no-repeat url("${wanted.url}")`);
      glyph.style.backgroundColor = wanted.tint || "currentColor";
      glyph.hidden = false;
    } else {
      glyph.hidden = true;
    }
  };

  const handle = {
    el: panel, body, bar, tools, key: id,
    group: floatGroup(id),
    modal,
    setTitle: (text) => {
      const label = bar.querySelector(".om-float-title");
      if (label) { label.textContent = text; label.title = text; }
      floatChanged();
    },
    title: () => heading.textContent || "",
    icon: () => (art ? { ...art } : null),
    refreshIcon: showIcon,
    raise, destroy,
    rekey: (next) => {
      const want = String(next || "");
      if (!want || want === id) return id;
      floatingPanel(want)?.destroy();
      const carried = floatRecall(id, null);
      floatPanels.delete(id);
      try { localStorage.removeItem(`om-float-${id}`); } catch {}
      id = want;
      handle.key = id;
      handle.group = floatGroup(id);
      if (carried) floatRemember(id, carried);
      floatPanels.set(id, handle);
      floatChanged();
      return id;
    },
    minimise: () => setMinimised(true),
    restore: () => setMinimised(false),
    isMinimised: () => minimised,
    minimisedAt: () => awayAt,
    reflow: onResize,
    showMinimise: () => { shrink.hidden = modal || !taskbarOn(); },
    present: () => { setMinimised(false); setFolded(false); raise(); },
    setMaskIcon: (url, { bar = true, tint = "" } = {}) => {
      const text = safeArt(url);
      art = text ? { kind: "mask", url: text, bar, tint: TAB_HEX.test(tint) ? tint : "" } : null;
      showIcon();
      floatChanged();
    },
    setIcon: (url, { bar = true } = {}) => {
      const text = safeArt(url);
      art = text ? { kind: "src", url: text, bar } : null;
      showIcon();
      floatChanged();
    },
    setBadge: (text) => { badge.textContent = text || ""; },
    setLook: (look) => paintBar(bar, look),
    isFolded: () => panel.classList.contains("om-float-folded"),
  };
  floatPanels.set(id, handle);
  floatChanged();
  return handle;
}

function floatingPanel(key) {
  const found = floatPanels.get(key);
  if (found && found.el.isConnected) return found;
  if (found) floatPanels.delete(key);
  return null;
}

function closeFloatingPanel(key) {
  floatingPanel(key)?.destroy();
}


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

async function modelFolders() {
  if (dlFolders) return dlFolders;
  try {
    dlFolders = await (await api.fetchApi(`${API}/models/folders`)).json();
  } catch {
    dlFolders = { folders: [], formats: [], media_formats: [], hosts: [] };
  }
  return dlFolders;
}

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

function rootUsable(root) {
  return !!root && root.writable && root.total > 0;
}

function preferredRoot(roots) {
  const usable = (roots || []).filter(rootUsable);
  if (!usable.length) return "";
  if (panelSetting("openManager.downloadLocation", "default") !== "most-free") return "";
  return usable.reduce((best, one) => (one.free > best.free ? one : best)).path;
}

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

async function confirmDownloadTrust(owner, what, plural = false, formats = []) {
  if (!owner) return true;
  const byAuthor = panelSetting("openManager.trustMode", "author") !== "action";
  if (byAuthor) {
    try {
      const answer = await api.fetchApi(
        `${API}/trust?kind=downloads&owner=${encodeURIComponent(owner)}`);
      if ((await answer.json()).trusted === true) return true;
    } catch {
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
      toast(`Could not remember ${owner}.`, { kind: "warn" });
    }
  }
  return true;
}

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
  facts.push(["If queued", "Each download stops when the drive fills, keeping what arrived"]);
  const go = await chooseAction(
    short.length === 1 ? `There is not room on ${short[0].path}`
                       : "Not enough room on these drives",
    "", [{ key: "go", label: "Queue anyway", primary: true }], { wide: true, facts });
  return !!go;
}

function samePlace(left, right) {
  const fold = (value) => String(value || "").replace(/[\\/]+/g, "/").replace(/\/$/, "").toLowerCase();
  return !!left && fold(left) === fold(right);
}

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

const DL_VIEWS = [
  {
    key: "transfers",
    title: "Transfers",
    tabs: [
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
      { key: "on-disk", title: "On Disk",
        holds: (row) => row.on_disk === true,
        empty: "No downloaded file is on disk.", clearable: false },
      { key: "archive", title: "Archive",
        holds: (row) => row.on_disk === false,
        empty: "Nothing downloaded here has been deleted." },
    ],
  },
];

const DL_VIEW_KEY = "om-dl-view";

function dlRemember(key, value) {
  try { localStorage.setItem(key, value); } catch {}
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

function openDownloadManager() {
  const shown = floatingPanel("downloads");
  if (shown?.isMinimised?.()) { shown.present(); return shown; }
  if (shown) { closeFloatingPanel("downloads"); return null; }

  const panel = createFloatingPanel({
    key: "downloads", title: "Download Manager", ...windowSize("downloads"),
    modal: !asWindow("downloads"),
    onClose: stopDownloadPolling,
  });
  panel.setMaskIcon(ICON_DOWNLOADS);
  const dialog = panel.el;
  const summary = el("div", "om-dl-summary", "Reading...");
  panel.bar.querySelector(".om-float-badge").appendChild(summary);
  const barEnd = el("span", "om-dl-bar-end");
  const add = el("button", "om-btn om-go om-dl-plus");
  add.appendChild(plusMark(14));
  add.setAttribute("aria-label", "Add a download");
  liveTip(add, () => "Add a download. A URL, or a model a workflow is missing.");
  add.onclick = () => addModel(refresh);
  barEnd.appendChild(add);
  const clear = el("button", "om-btn", "Clear");
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
  barEnd.appendChild(clear);

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

  const badges = new Map();

  const buildViewBar = () => {
    const buttons = DL_VIEWS.map((one) => {
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
    });
    viewBar.replaceChildren(...buttons, barEnd);
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
    if (!dialog.isConnected || panel.isMinimised?.()) { stopDownloadPolling(); return; }
    let state;
    try {
      state = await (await api.fetchApi(`${API}/downloads`)).json();
    } catch {
      summary.textContent = "The download list could not be read";
      return;
    }
    if (!dialog.isConnected || panel.isMinimised?.()) { stopDownloadPolling(); return; }
    const rows = state.downloads || [];
    const busy = (state.running || 0) + (state.queued || 0);
    summary.textContent = busy
      ? `${state.running} running, ${state.queued} queued`
      : (rows.length ? `${rows.length} download${rows.length === 1 ? "" : "s"}` : "");
    for (const one of view.tabs) {
      const badge = badges.get(one.key);
      if (badge) badge.textContent = String(rows.filter(one.holds).length);
    }
    const mine = rows.filter(tab.holds);
    showing = mine;
    clear.textContent = `Clear ${tab.title}`;
    clear.title = `Removes the ${tab.title} entries from this list. Files on disk are left alone.`;
    clear.disabled = tab.clearable === false || !mine.length;
    clear.style.display = tab.clearable === false ? "none" : "";
    if (mine.length) {
      list.replaceChildren(...mine.map((row) => buildDownloadRow(row, refresh)));
    } else {
      const box = el("div", "om-empty");
      box.appendChild(el("div", "om-empty-title", tab.empty));
      list.replaceChildren(box);
    }
    clearTimeout(dlTimer);
    const settling = rows.some((row) => row.status === "pausing");
    dlTimer = setTimeout(refresh, busy || settling ? DL_POLL_BUSY : DL_POLL_IDLE);
  };

  panel.el.addEventListener("om-win:minimise", stopDownloadPolling);
  panel.el.addEventListener("om-win:restore", () => refresh());
  refresh();
  return panel;
}

function stopDownloadPolling() {
  clearTimeout(dlTimer);
  dlTimer = 0;
}


async function addModel(refresh) {
  const how = await chooseAction("Add a download", "",
    [{ key: "workflow", label: "From a workflow", primary: true,
       hint: "Lists the models an open workflow names" },
     { key: "url", label: "From a URL", hint: "Paste a Hugging Face or GitHub link" }]);
  if (how === "url") await addModelByUrl(refresh);
  if (how === "workflow") await addModelsFromWorkflow(refresh);
}

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
    if (!folder.value && answer.suggested_directory) {
      folder.value = answer.suggested_directory;
      await showLocations();
      return recheck();
    }
    const from = `From ${answer.owner}.`;
    if (answer.ok) {
      note.textContent = answer.installed ? `${from} Already on disk; downloading replaces it.` : from;
      note.className = "om-dl-note om-dl-ok";
    } else if (answer.needs_directory) {
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
    if (!(await confirmDownloadTrust(model.owner, model.name, false, formatsOf([model.name])))) {
      return;
    }
    if (!(await confirmDiskRoom([model]))) return;
    const queued = await queueModel(model, { source: "added by URL", askTrust: false });
    if (queued) { toast(`Queued ${checked.name}.`, { kind: "ok" }); refresh?.(); }
  };
}

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

async function workflowDocument(choice) {
  if (choice.active) {
    try {
      const live = app.graph.serialize();
      if (live) return live;
    } catch {
    }
  }
  const content = choice.workflow?.content || choice.workflow?.originalContent;
  if (content) {
    try { return JSON.parse(content); } catch {}
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
    notify("No workflows open");
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
    const option = el("option", null, choice.active ? `${choice.label} (current)` : choice.label);
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
    select.onclick = (event) => event.preventDefault();
    select.onchange = () => chosen.set(index, select.value);
    chosen.set(index, select.value);
    place.appendChild(select);
    text.appendChild(place);
  }
  row.appendChild(text);
  return row;
}


function topbarSlot() {
  const strip = document.querySelector(".workflow-tabs-container.pointer-events-auto")?.firstElementChild;
  return strip
    ? [...strip.children].find((child) => !String(child.className).includes("workflow-tabs-container"))
    : null;
}

let topbarReady = false;

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

function managerEntry() {
  const asked = String(panelSetting("openManager.managerEntry", "auto") || "auto");
  if (asked === "classic" || asked === "panel") return asked;
  return legacyUi ? "classic" : "panel";
}

const PROGRAM_BASE = new URL("./programs/", import.meta.url).href;

const ENTRY_FILE = "program.mjs";

let deskProgramsOff = [];

let deskGates = { files: false, writes: false, desktop: false };

async function loadGates() {
  try {
    const answer = await (await api.fetchApi(`${API}/gates`)).json();
    if (answer?.ok) deskGates = { ...deskGates, ...answer };
  } catch {}
  return deskGates;
}

function filesOn() {
  return deskGates.files !== false
    && panelSetting("openManager.fileBrowser", false) === true;
}

function filesWritable() {
  return filesOn() && deskGates.writes === true;
}

const PROGRAM_WAIT = 6000;

let programRows = [];

const programModules = new Map();

function programOff(id) {
  return deskProgramsOff.includes(id);
}

function programIconArt(entry) {
  const plain = { kind: "mask", url: ICON_PROGRAM };
  if (!entry.icon) return plain;
  const url = safeArt(`${PROGRAM_BASE}${entry.id}/${entry.icon}?v=${entry.stamp || 0}`);
  if (!url) return plain;
  return { kind: /\.svg($|\?)/i.test(entry.icon) ? "mask" : "src", url };
}

function programRow(entry) {
  const art = programIconArt(entry);
  return {
    key: entry.id,
    kind: "program",
    label: entry.name,
    hint: entry.hint || `${entry.name}, a program this install ships`,
    program: entry,
    desk: {
      at: 40,
      label: entry.name,
      art: art.url,
      kind: art.kind,
      window: `${entry.id}:main`,
      off: !entry.surfaces?.desktop,
      look: entry.look && (entry.look.tint || entry.look.from) ? entry.look : null,
    },
    open: () => runProgram(entry),
  };
}

async function importProgram(entry) {
  if (programModules.has(entry.id)) return programModules.get(entry.id);
  const url = `${PROGRAM_BASE}${entry.id}/${ENTRY_FILE}?v=${entry.stamp || entry.version || 0}`;
  const waited = new Promise((_settle, fail) => {
    setTimeout(() => fail(new Error("took too long to load")), PROGRAM_WAIT);
  });
  const held = await Promise.race([import( url), waited]);
  const made = held?.program || held?.default || null;
  if (!made || typeof made.open !== "function") {
    throw new Error("exports no program with an open function");
  }
  programModules.set(entry.id, made);
  return made;
}

const PROGRAM_VIEWS = 12;

function programView(entry) {
  if (!entry.multiple || panelSetting("openManager.programWindows", false) !== true) {
    return "main";
  }
  for (let at = 1; at <= PROGRAM_VIEWS; at += 1) {
    if (!floatingPanel(`${entry.id}:${at}`)) return String(at);
  }
  const held = [];
  for (let at = 1; at <= PROGRAM_VIEWS; at += 1) {
    const found = floatingPanel(`${entry.id}:${at}`);
    if (found) held.push([Number(found.el.style.zIndex) || 0, String(at)]);
  }
  held.sort((a, b) => a[0] - b[0]);
  return held.length ? held[0][1] : "main";
}

async function runProgram(entry, carried, wanted = "") {
  const view = wanted || programView(entry);
  const open = floatingPanel(`${entry.id}:${view}`);
  if (open) {
    open.present();
    if (carried !== undefined && typeof open._omCarry === "function") open._omCarry(carried);
    return open;
  }
  let made = null;
  try {
    made = await importProgram(entry);
  } catch (error) {
    notify(`${entry.name} did not load`, `${entry.name} could not be started: ${error.message}`);
    return null;
  }
  try {
    return made.open(programApi(entry, view), carried);
  } catch (error) {
    notify(`${entry.name} stopped`, `${entry.name} failed while opening: ${error.message}`);
    return null;
  }
}

async function loadPrograms() {
  let answer = null;
  try {
    answer = await (await api.fetchApi(`${API}/programs`)).json();
  } catch {
    answer = null;
  }
  programRows = (answer?.programs || [])
    .filter((one) => !programOff(one.id))
    .map(programRow);
  for (const row of programRows) TASK_GROUP_NAMES[row.key] = row.label;
}

let scopeAnswer = null;

function scopesStyles() {
  if (scopeAnswer !== null) return scopeAnswer;
  scopeAnswer = false;
  try {
    const probe = el("style");
    probe.textContent =
      "@scope (.om-scope-probe) { .om-scope-target { color: rgb(1, 2, 3); } }";
    document.head.appendChild(probe);
    const outer = el("div", "om-scope-probe");
    outer.style.cssText = "position: fixed; left: -9999px; top: -9999px;";
    const inner = el("span", "om-scope-target");
    outer.appendChild(inner);
    document.body.appendChild(outer);
    scopeAnswer = getComputedStyle(inner).color === "rgb(1, 2, 3)";
    probe.remove();
    outer.remove();
  } catch {
    scopeAnswer = false;
  }
  return scopeAnswer;
}

function programScope(id) {
  return `om-scope-${id}`;
}

function programStyle(id, css) {
  const mark = `om-prog-${id}`;
  let sheet = document.getElementById(mark);
  if (!sheet) {
    sheet = el("style");
    sheet.id = mark;
    document.head.appendChild(sheet);
  }
  const text = String(css || "");
  sheet.textContent = scopesStyles()
    ? `@scope (.${programScope(id)}) {\n${text}\n}`
    : text;
}

function programStore(id) {
  return {
    get: async (name, fallback = null) => {
      try {
        const answer = await (await api.fetchApi(
          `${API}/programs/store?id=${encodeURIComponent(id)}`)).json();
        const held = answer?.ok ? (answer.data || {}) : {};
        return Object.hasOwn(held, name) ? held[name] : fallback;
      } catch {
        return fallback;
      }
    },
    set: async (name, value) => {
      try {
        const answer = await (await api.fetchApi(
          `${API}/programs/store?id=${encodeURIComponent(id)}`)).json();
        const held = answer?.ok ? (answer.data || {}) : {};
        held[name] = value;
        const kept = await dlPost("/programs/store", { id, data: held });
        return kept?.ok === true;
      } catch {
        return false;
      }
    },
  };
}

function programWindow(entry, options = {}) {
  const view = String(options.view || "main").replace(/[^a-z0-9-]/gi, "").slice(0, 24) || "main";
  const panel = createFloatingPanel({
    key: `${entry.id}:${view}`,
    title: String(options.title || entry.name).slice(0, 80),
    ...windowSize(Object.hasOwn(WINDOW_SIZES, options.size) ? options.size : "note"),
    modal: false,
  });
  panel.el.classList.add(programScope(entry.id));
  const art = programIconArt(entry);
  if (art.kind === "mask") panel.setMaskIcon(art.url);
  else panel.setIcon(art.url);
  return {
    body: panel.body,
    tools: panel.tools,
    setTitle: (text) => panel.setTitle(String(text || "").slice(0, 80)),
    setBadge: (text) => panel.setBadge(String(text || "").slice(0, 24)),
    present: () => panel.present(),
    close: () => panel.destroy(),
    isOpen: () => panel.el.isConnected,
    onClose: (fn) => { panel.el.addEventListener("om-prog-close", fn, { once: true }); },
    onCarry: (fn) => { panel._omCarry = fn; },
    onKey: (fn) => {
      panel.el.addEventListener("keydown", (event) => {
        const on = event.target;
        if (on instanceof Element
            && on.closest("input, textarea, select, [contenteditable='true']")) return;
        fn(event);
      });
    },
  };
}

function assetPath(item) {
  return item?.sub ? `${item.sub}/${item.name}` : String(item?.name || "");
}

const HOST_ROOTS = ["output", "input", "temp"];

const SHOWN_KINDS = { image: "still", still: "still", video: "video", audio: "audio" };

const EDITS_HERE = new Set([".md", ".txt", ".json", ".yaml", ".yml", ".csv", ".toml",
                            ".ini", ".cfg", ".conf", ".log", ".env", ".diff", ".patch"]);

function suffixOf(name) {
  const at = String(name || "").lastIndexOf(".");
  return at < 0 ? "" : name.slice(at).toLowerCase();
}

const PLACE_ROOTS = {
  "asset:output": "output", "asset:input": "input", "asset:temp": "temp",
};

function viewRootOf(place) {
  return PLACE_ROOTS[place] || String(place || "");
}

function assetUrl(item, { preview = false, root = "output" } = {}) {
  const where = String(item?.root || root);
  if (!HOST_ROOTS.includes(where)) {
    const ours = new URLSearchParams({
      root: where, path: assetPath(item), v: `${item?.at || 0}-${item?.size || 0}`,
    });
    return `${API}/assets/view?${ours.toString()}`;
  }
  const query = new URLSearchParams({
    filename: String(item?.name || ""),
    subfolder: String(item?.sub || ""),
    type: where,
  });
  if (preview) query.set("preview", "webp;70");
  return `/api/view?${query.toString()}`;
}

function assetThumbUrl(item, { root = "output", edge = 0 } = {}) {
  const query = new URLSearchParams({
    root: String(item?.root || root),
    path: assetPath(item),
    v: `${item?.at || 0}-${item?.size || 0}`,
  });
  if (edge) query.set("edge", String(Math.max(64, Math.min(1024, Math.round(edge)))));
  return `${API}/assets/thumb?${query.toString()}`;
}

async function assetFile(item, root) {
  const answer = await fetch(assetUrl(item, { root }));
  if (!answer.ok) throw new Error(`${item.name} could not be read`);
  const blob = await answer.blob();
  return new File([blob], item.name, { type: blob.type || "application/octet-stream" });
}

async function assetWorkflow(item, root) {
  const readers = window.comfyAPI || {};
  const tail = String(item?.name || "").toLowerCase().split(".").pop();
  const read = {
    png: readers.png?.getFromPngFile,
    webp: readers.webp?.getFromWebpFile,
    mp4: readers.isobmff?.getFromIsobmffFile,
    mov: readers.isobmff?.getFromIsobmffFile,
    m4v: readers.isobmff?.getFromIsobmffFile,
    webm: readers.ebml?.getFromWebmFile,
    flac: readers.flac?.getFromFlacFile,
    avif: readers.avif?.getFromAvifFile,
  }[tail];
  if (typeof read !== "function") return null;
  let held = null;
  try {
    held = await read(await assetFile(item, root));
  } catch {
    return null;
  }
  if (!held) return null;
  const flow = held.workflow || held.Workflow || null;
  const prompt = held.prompt || held.Prompt || null;
  if (!flow && !prompt) return null;
  return { workflow: flow || "", prompt: prompt || "" };
}

async function loadAssetWorkflow(item, root) {
  try {
    await app.handleFile(await assetFile(item, root));
    return true;
  } catch (error) {
    notify("Not loaded", `${item.name} could not be opened as a workflow: ${error.message}`);
    return false;
  }
}

const ASSET_DRAG_TYPE = "application/x-om-asset";

let assetDropWired = false;

function assetCarried(event) {
  return [...(event.dataTransfer?.types || [])].includes(ASSET_DRAG_TYPE);
}

function tabDropZone(event) {
  const at = event.target instanceof Element ? event.target : null;
  return at?.closest('.workflow-tabs, [data-testid="topbar-workflow-tabs"]') || null;
}

function markTabDrop(zone) {
  for (const old of document.querySelectorAll(".om-tab-drop")) {
    if (old !== zone) old.classList.remove("om-tab-drop");
  }
  zone?.classList.add("om-tab-drop");
}

function mountAssetDrop() {
  if (assetDropWired) return;
  assetDropWired = true;
  document.addEventListener("dragover", (event) => {
    if (!assetCarried(event)) return;
    const zone = tabDropZone(event);
    if (!zone) { markTabDrop(null); return; }
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    markTabDrop(zone);
  }, true);
  document.addEventListener("dragleave", (event) => {
    if (assetCarried(event) && !tabDropZone(event)) markTabDrop(null);
  }, true);
  document.addEventListener("dragend", () => markTabDrop(null), true);
  document.addEventListener("drop", async (event) => {
    if (!assetCarried(event)) return;
    const zone = tabDropZone(event);
    markTabDrop(null);
    if (!zone) return;
    event.preventDefault();
    event.stopPropagation();
    let sent = null;
    try { sent = JSON.parse(event.dataTransfer.getData(ASSET_DRAG_TYPE)); } catch { return; }
    if (!sent?.name) return;
    await loadAssetWorkflow(sent, sent.root || "output");
  }, true);
}

function assetDraggable(node, item, root) {
  if (!(node instanceof Element) || !item?.name) return;
  mountAssetDrop();
  node.draggable = true;
  node.addEventListener("dragstart", (event) => {
    event.dataTransfer.setData(ASSET_DRAG_TYPE, JSON.stringify({
      name: String(item.name), sub: String(item.sub || ""), root: String(root || "output"),
    }));
    event.dataTransfer.effectAllowed = "copy";
  });
}

function programAssets() {
  return {
    roots: [...HOST_ROOTS],
    list: async (options = {}) => {
      const query = new URLSearchParams({
        root: options.root || "output",
        path: options.path || "",
        page: String(options.page ?? 0),
        size: String(options.size ?? 120),
        sort: options.sort || "new",
        kind: options.kind || "all",
        q: options.find || "",
      });
      try {
        const answer = await (await api.fetchApi(`${API}/assets?${query}`)).json();
        return answer?.ok ? answer : { ok: false, items: [], folders: [], total: 0 };
      } catch {
        return { ok: false, items: [], folders: [], total: 0 };
      }
    },
    search: async (options = {}) => {
      const query = new URLSearchParams({
        root: options.root || "output",
        path: options.path || "",
        q: options.find || "",
        size: String(options.size ?? 120),
      });
      try {
        const answer = await (await api.fetchApi(`${API}/assets/search?${query}`)).json();
        return answer?.ok ? answer : { ok: false, items: [], read: 0, capped: false };
      } catch {
        return { ok: false, items: [], read: 0, capped: false };
      }
    },
    url: (item, root) => assetUrl(item, { root }),
    preview: (item, root, edge) => assetThumbUrl(item, { root, edge }),
    hostPreview: (item, root) => assetUrl(item, { preview: true, root }),
    peek: async (root, path, count = 4) => {
      const query = new URLSearchParams({
        root: root || "output", path: path || "", count: String(count),
      });
      try {
        const answer = await (await api.fetchApi(`${API}/assets/peek?${query}`)).json();
        return answer?.ok ? answer : { ok: false, items: [] };
      } catch {
        return { ok: false, items: [] };
      }
    },
    path: (item) => assetPath(item),
    remove: (root, path) => dlPost("/assets/remove", { root, path }),
    write: (root, path, data, replace = false) =>
      dlPost("/assets/write", { root, path, data, replace: !!replace }),
    workflow: (item, root) => assetWorkflow(item, root),
    carries: async (root, path) => {
      try {
        const query = new URLSearchParams({ root: root || "output", path: path || "" });
        const answer = await (await api.fetchApi(`${API}/assets/workflow?${query}`)).json();
        return answer?.ok ? answer : { ok: false, keys: [], kind: "" };
      } catch {
        return { ok: false, keys: [], kind: "" };
      }
    },
    strip: (root, path) => dlPost("/assets/workflow/remove", { root, path }),
    load: (item, root) => loadAssetWorkflow(item, root),
    drag: (node, item, root) => assetDraggable(node, item, root),
  };
}

async function runProgramById(id, carried) {
  const row = programRows.find((one) => one.key === id);
  if (!row) {
    notify("Not here", `No program called ${id} is loaded.`);
    return null;
  }
  return runProgram(row.program, carried);
}

function programApi(entry, view = "main") {
  return {
    id: entry.id,
    name: entry.name,
    view,
    run: (id, carried) => runProgramById(String(id || ""), carried),
    el: (tag, cls, text) => el(tag, cls, text),
    window: (options = {}) => programWindow(entry, { view, ...options }),
    style: (css) => programStyle(entry.id, css),
    storage: programStore(entry.id),
    assets: programAssets(),
    toast: (text, options) => toast(String(text || "").slice(0, 300), options),
    notify: (title, text) => notify(String(title || entry.name).slice(0, 80),
                                    String(text || "").slice(0, 600)),
    confirm: (title, text, label) => confirmAction(String(title || "").slice(0, 80),
                                                   String(text || "").slice(0, 600),
                                                   String(label || "Yes").slice(0, 24), false),
    ask: (title, value, label) => askText(String(title || "").slice(0, 80), value, label),
    menu: (anchor, items) => openRowMenu(anchor, { items, align: "left" }),
    tip: (host, say) => liveTip(host, say),
    setting: (name, fallback = null) => (String(name || "").startsWith("openManager.")
      ? panelSetting(String(name), fallback)
      : fallback),
    bytes: (value) => bytesText(value),
    count: (value, noun) => countNote(value, noun),
    when: (date) => whenText(date),
    canWrite: () => deskGates.writes === true,
    graph: {
      nodes: () => graphNodes(),
      drag: (node, entry) => nodeDragFrom(node, entry),
      add: (type) => addNodeAt(String(type || ""), canvasCentre()),
      show: () => hideDesk(),
    },
  };
}

function managerDestinations() {
  return [
    { key: "registry", kind: "program", label: "Custom Nodes Manager", icon: "\u25a4",
      hint: "Browse and install from the Comfy Registry",
      desk: { at: 0, label: "Node Discovery", art: ICON_TAB, kind: "mask", window: "manager" },
      open: () => openPanelWindow("registry") },
    { key: "missing", kind: "action", label: "Install Missing Custom Nodes", icon: "\u26a0",
      hint: "The packs supplying the node types this workflow is missing",
      open: () => openPanelWindow("missing") },
    { key: "github", kind: "action", label: "Install via Git URL", icon: "\u2325",
      hint: "Repositories you add by URL, kept across uninstalls",
      open: () => openPanelWindow("github") },
    { key: "installed", kind: "action", label: "Check for Updates", icon: "\u21bb",
      hint: "What is installed, and what has a newer version",
      open: () => openPanelWindow("installed") },
    { key: "downloads", kind: "program", label: "Download Manager", short: "Downloads", icon: "\u2b73",
      cls: "om-dl-downloads",
      hint: "Download Manager: fetch the models a workflow needs",
      desk: { at: 2, label: "Download Manager", art: ICON_DOWNLOADS, kind: "mask",
              window: "downloads" },
      open: openDownloadManager,
      button: () => panelSetting("openManager.downloadButton", true) !== false },
    { key: "library", kind: "program", label: "Model Library", short: "Models", icon: "\u25a4",
      cls: "om-lib-open",
      hint: "Model Library: what is on disk, and what is there twice",
      desk: { at: 3, label: "Model Library", art: ICON_LIBRARY, kind: "mask",
              window: "library" },
      open: openModelLibrary,
      available: () => panelSetting("openManager.modelLibrary", false) !== false,
      button: () => panelSetting("openManager.modelLibrary", false) !== false },
    { key: "notepad", kind: "program", label: "Notepad",
      icon: "✎",
      hint: "A blank note",
      desk: { at: 3, label: "Notepad", art: ICON_NOTE, kind: "mask", window: "", off: true },
      open: () => openNote(draftNote()) },
    { key: "desksettings", kind: "program", label: "Desktop Settings", icon: "⚙",
      hint: "The wallpaper, the icons, the windows and the programs",
      desk: { at: 4, label: "Desktop Settings", art: ICON_DESKTOP, kind: "mask",
              window: "desktop", off: true },
      open: () => openDesktopSettings() },
    { key: "documents", kind: "program", label: "Documents", icon: "▤",
      hint: "Somewhere of your own to keep things",
      revisit: true,
      desk: { at: 1, label: "Documents", art: ICON_FOLDER, kind: "mask", window: "files" },
      available: () => filesOn(),
      open: () => openFileBrowser("docs:documents", "") },
    { key: "files", kind: "program", label: "Folders", icon: "▧",
      hint: "Every folder: the notes, the input, output and temp directories, and the models",
      revisit: true,
      desk: { at: 6, label: "Folders", art: ICON_FOLDER, kind: "mask",
              window: "files", off: true },
      available: () => filesOn(),
      open: () => openFileBrowser() },
    { key: "programs", kind: "program", label: "Manage Programs", icon: "▦",
      hint: "Everything installed, what it declares, and whether it is switched on",
      desk: { at: 5, label: "Manage Programs", art: ICON_PROGRAM, kind: "mask",
              window: "programs", off: true },
      open: () => openManagePrograms() },
    { key: "memory", kind: "program", label: "Memory", short: "Memory", icon: "\u25a6",
      cls: "om-mem-open",
      hint: "Memory: what is loaded, what it weighs, and where it sits",
      desk: { at: 1, label: "Memory", art: ICON_MEMORY, kind: "mask", window: "memory" },
      open: openMemoryPanel,
      button: () => panelSetting("openManager.memoryButton", true) !== false },
    { key: "scan", kind: "action", label: "Scan an Install", icon: "\u2691",
      hint: "Each installed pack's menu offers a VirusTotal scan of the files it ships",
      open: () => openPanelWindow("installed"),
      available: vtReady },
    { key: "environment", kind: "action", label: "Environment changes", icon: "\u2317",
      hint: "What recent installs did to your Python packages, and how to undo one",
      open: openEnvironmentDialog },
    { key: "about", kind: "action", label: "About and updates", icon: "\u2139",
      hint: "Which Open Manager this is, and what updating it takes here",
      open: openAboutDialog },
    { key: "keys", kind: "action", label: "Access keys", icon: "\u26bf",
      hint: "Hugging Face, GitHub and VirusTotal keys",
      open: openKeysDialog },
  ].concat(programRows)
    .filter((one) => (!Object.hasOwn(one, "available") || one.available()));
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

  const wanted = managerDestinations()
    .filter((one) => one.cls && one.button && one.button())
    .map((one) => make(one.cls, one.icon, one.short || one.label, one.hint, one.open));
  for (const button of wanted) {
    if (button) where.host.insertBefore(button, where.before);
  }
  mountMonitor(slot);
  mountRunBar();
  mountTabMarks();
  return true;
}

function remountTopbar() {
  if (!topbarReady) return;
  stopMonitor();
  monitorStrip = null;
  document.querySelectorAll(".om-dl-open, .om-mon, .om-prog").forEach((node) => node.remove());
  runBar.el = null;
  mountTopbar();
  taskbarSync();
}


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
  if (!answer.needs_directory) {
    notify("Not added", answer.reason || "That is not a URL this can use.");
    return;
  }
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


const MONITOR_CLIENT = `om-${Math.random().toString(36).slice(2, 10)}`;

let monitorStrip = null;
let monitorTimer = 0;

function monitorInterval() {
  const asked = Number(panelSetting("openManager.monitorInterval", 2));
  return Number.isFinite(asked) ? Math.max(1, Math.min(10, asked)) : 2;
}

const LINK_QUIET = 12000;
const LINK_WOKE = 8000;
const LINK_DEADLINE = 8000;
const LINK_VERIFY = 10000;
const LINK_TRY_BASE = 15000;
const LINK_TRY_CAP = 240000;
const LINK_POLL_BASE = 3000;
const LINK_POLL_CAP = 30000;
const LINK_STRIKES = 3;

const link = {
  pushAt: 0, pullAt: 0, failAt: 0, fail: "", status: 0, every: 0, running: false,
  strikes: 0, tries: 0, nextTryAt: 0, verifyUntil: 0, socketSeen: null,
  nextPostAt: 0, pollStep: 0, hiddenAt: 0, hiddenFor: 0,
};

const readingHooks = new Set();

const monitorFlight = new Set();

function monitorDeadline(ms) {
  const stop = new AbortController();
  const timer = setTimeout(
    () => stop.abort(new DOMException("timed out", "TimeoutError")), ms || LINK_DEADLINE);
  stop.done = () => { clearTimeout(timer); monitorFlight.delete(stop); };
  monitorFlight.add(stop);
  return stop;
}

function dropMonitorCalls() {
  for (const stop of [...monitorFlight]) {
    stop.dropped = true;
    stop.abort(new DOMException("dropped", "AbortError"));
    stop.done();
  }
}

function linkEvery() {
  return Math.max(1, link.every || monitorInterval());
}

function linkReached() {
  link.pullAt = Date.now();
  link.fail = "";
  link.status = 0;
  link.pollStep = 0;
  link.nextPostAt = 0;
}

function linkLeased(answer) {
  link.running = !!answer?.running;
  const every = Number(answer?.reading?.every || answer?.interval);
  if (Number.isFinite(every) && every > 0) link.every = every;
}

function linkFailed(why, status) {
  link.failAt = Date.now();
  link.fail = why;
  link.status = status || 0;
  link.pollStep = Math.min(link.pollStep + 1, 4);
  const base = Math.min(LINK_POLL_CAP, LINK_POLL_BASE * (2 ** link.pollStep));
  link.nextPostAt = Date.now() + LINK_POLL_BASE + Math.round(Math.random() * base);
}

function linkMayPost() {
  return Date.now() >= link.nextPostAt;
}

async function monFetch(path, options, ms) {
  const stop = monitorDeadline(ms);
  let answer;
  try {
    answer = await api.fetchApi(`${API}${path}`, { ...options, signal: stop.signal });
  } catch (wrong) {
    if (!stop.dropped) linkFailed(wrong?.name === "TimeoutError" ? "slow" : "cut");
    throw wrong;
  } finally {
    stop.done();
  }
  if (!answer.ok) {
    linkFailed("refused", answer.status);
    throw new Error(`HTTP ${answer.status}`);
  }
  linkReached();
  return answer.json();
}

function monPost(path, body, ms) {
  return monFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  }, ms);
}

function monGet(path, ms) {
  return monFetch(path, {}, ms);
}

function monRelease(client) {
  const stop = monitorDeadline(4000);
  api.fetchApi(`${API}/monitor`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client, release: true }),
    signal: stop.signal,
  }).catch(() => {}).finally(() => stop.done());
}

function pushStale() {
  const since = link.pushAt || link.pullAt;
  if (!since) return false;
  return Date.now() - since > Math.max(LINK_QUIET, linkEvery() * 3000 + 4000);
}

function httpAlive() {
  if (!link.pullAt && !link.failAt) return true;
  return !!link.pullAt && link.pullAt >= link.failAt;
}

function linkAsleep() {
  return document.hidden || (!!link.hiddenAt && Date.now() - link.hiddenAt < LINK_WOKE);
}

function linkState() {
  if (linkAsleep()) return "asleep";
  if (Date.now() < link.verifyUntil) return "reviving";
  if (!httpAlive()) return link.fail || "cut";
  if (!pushStale()) return "live";
  return link.running ? "feed" : "idle";
}

function linkDown() {
  const state = linkState();
  return state !== "live" && state !== "feed";
}

function takeReading(reading) {
  recordReading(reading);
  paintMonitor(reading);
  for (const hook of [...readingHooks]) hook(reading);
}

function linkTick() {
  if (linkAsleep()) { link.strikes = 0; return; }
  if (!pushStale()) {
    link.strikes = 0;
    link.tries = 0;
    link.nextTryAt = 0;
    link.verifyUntil = 0;
    return;
  }
  if (!httpAlive() || !link.running) return;
  link.strikes += 1;
  if (link.strikes < LINK_STRIKES) return;
  reviveSocket(false);
}

function reviveSocket(asked) {
  const now = Date.now();
  if (now < link.verifyUntil) return;
  if (!asked && now < link.nextTryAt) return;
  let socket;
  try { socket = api.socket; } catch { return; }
  if (socket === undefined) return;
  const hold = (ms) => { link.verifyUntil = now + ms; link.strikes = 0; };
  if (socket === null) { hold(2000); return; }
  if (socket.readyState === WebSocket.CLOSING || socket.readyState === WebSocket.CLOSED) {
    hold(2000);
    return;
  }
  if (socket.readyState === WebSocket.CONNECTING && socket !== link.socketSeen) {
    link.socketSeen = socket;
    hold(LINK_VERIFY);
    return;
  }
  const wedged = socket === link.socketSeen && link.tries >= 2;
  link.strikes = 0;
  link.tries += 1;
  link.socketSeen = socket;
  link.verifyUntil = now + LINK_VERIFY;
  link.nextTryAt = link.verifyUntil
    + Math.round(Math.random() * Math.min(LINK_TRY_CAP, LINK_TRY_BASE * (2 ** link.tries)));
  if (!window.name && api.clientId) window.name = api.clientId;
  if (!wedged) {
    try { socket.close(); } catch {}
    return;
  }
  api.socket = null;
  try { socket.close(); } catch {}
  api.init();
}

const LINK_SAY = {
  asleep: {
    short: "paused while hidden",
    line: "Paused while this window is not on screen.",
    lead: "Paused while hidden",
    tip: "Readings start again when the window comes back.",
  },
  reviving: {
    short: "reconnecting",
    line: "Rebuilding the connection to the server.",
    lead: "Reconnecting",
    tip: "Readings in the gap are lost.",
  },
  slow: {
    short: "the server is not answering",
    line: "The server is not answering this tab.",
    lead: "Not answering",
    tip: "Heavy graph work stops the server answering.",
  },
  cut: {
    short: "cannot reach the server",
    line: "This tab cannot reach the server.",
    lead: "Out of reach",
  },
  refused: {
    short: "the request was refused",
    line: "The server refused the request.",
    lead: "Refused",
  },
  feed: {
    short: "the live connection is quiet",
    line: "The live connection is quiet. These readings are the check every few seconds.",
    lead: "Live connection quiet",
  },
  idle: {
    short: "the server is not sampling",
    line: "The server is not sampling.",
    lead: "Not sampling",
    tip: "The server answered but is not measuring; it starts again when something asks.",
  },
};

function linkFacts() {
  const age = readingAge();
  const next = link.nextPostAt - Date.now();
  return [
    ["Last reading", Number.isFinite(age) ? `${Math.round(age / 1000)}s ago` : "none yet"],
    ["Failed tries", link.tries ? String(link.tries) : ""],
    ["Next try", next > 0 ? `in ${Math.max(1, Math.round(next / 1000))}s` : ""],
  ];
}

function linkText() {
  const say = LINK_SAY[linkState()];
  if (!say) return "";
  const left = link.nextPostAt - Date.now();
  return left > 0
    ? `${say.line} Trying again in ${Math.max(1, Math.round(left / 1000))} seconds.`
    : say.line;
}

function buildLinkRow(retry) {
  const row = el("div", "om-mem-link");
  const text = el("span", "om-mem-link-text", "");
  const act = el("button", "om-btn om-dl-btn", "Reconnect");
  row.appendChild(text);
  row.appendChild(act);
  liveTip(row, () => (row._say ? { ...row._say, facts: linkFacts() } : ""));
  act.onclick = () => retry();
  row.tell = (state) => {
    if (row._busy || Date.now() < (row._until || 0)) return;
    const say = LINK_SAY[state];
    row.hidden = !say;
    if (!say) return;
    row.classList.toggle("om-mem-link-bad", state !== "asleep" && state !== "feed");
    text.textContent = linkText();
    row._say = { lead: say.lead, lines: [say.tip] };
    act.hidden = state === "asleep";
    act.disabled = state === "reviving";
  };
  row.working = (line) => {
    row._busy = true;
    row.hidden = false;
    row.classList.add("om-mem-link-bad");
    text.textContent = line;
    act.hidden = false;
    act.disabled = true;
  };
  row.settled = (line, bad) => {
    row._busy = false;
    row._until = Date.now() + 5000;
    row.hidden = false;
    row.classList.toggle("om-mem-link-bad", !!bad);
    text.textContent = line;
    act.hidden = false;
    act.disabled = false;
  };
  row.free = () => { row._busy = false; row._until = 0; };
  row.tell("live");
  return row;
}

function monitorWants(key) {
  return panelSetting(`openManager.monitor${key}`, true) !== false;
}

function meterText(used, total) {
  if (!total) return "-";
  return `${Math.round((used / total) * 100)}%`;
}

const TEMP_FLOOR = 30;
const TEMP_CEILING = 95;

function tempShare(degrees) {
  const span = TEMP_CEILING - TEMP_FLOOR;
  return Math.max(0, Math.min(100, ((degrees - TEMP_FLOOR) / span) * 100));
}

const TEMP_WARM = 70;
const TEMP_HOT = 84;

function tempColour(degrees) {
  if (degrees >= TEMP_HOT) return "#f85149";
  if (degrees >= TEMP_WARM) return "#d29922";
  return "#3fb950";
}

const MONITOR_STYLES = [
  "mixed", "mixed-compact", "horizontal", "horizontal-compact", "vertical", "vertical-compact",
];

function monitorStyle() {
  const asked = String(panelSetting("openManager.monitorStyle", "mixed") || "mixed");
  return MONITOR_STYLES.includes(asked) ? asked : "mixed";
}

function monitorShape(kind) {
  const style = monitorStyle();
  const compact = style.endsWith("-compact");
  const base = compact ? style.slice(0, -"-compact".length) : style;
  const axis = base === "mixed" ? (kind === "thermo" ? "v" : "h") : base[0];
  return { axis, compact, base };
}

function monitorCell(kind, key, label, title) {
  const { axis, compact, base } = monitorShape(kind);
  const box = el("span",
    `om-mon-cell om-mon-${key} om-mon-${axis}${compact ? " om-mon-compact" : ""}`);
  box._say = title;
  liveTip(box, () => tipWith(box._say,
    linkText() || (readingQuiet() ? quietText(readingAge()) : "")));
  const track = el("span", axis === "v" ? "om-mon-tube" : "om-mon-bar");
  const fill = el("span", "om-mon-fill");
  track.appendChild(fill);
  const name = el("span", "om-mon-label", label);
  const value = el("span", `om-mon-value${kind === "thermo" ? " om-mon-degrees" : ""}`, "-");

  if (compact && base === "vertical") {
    track.appendChild(value);
    box.appendChild(name);
    box.appendChild(track);
  } else if (compact) {
    const both = el("span", "om-mon-both");
    both.appendChild(name);
    both.appendChild(value);
    box.appendChild(track);
    box.appendChild(both);
  } else {
    box.appendChild(name);
    box.appendChild(track);
    box.appendChild(value);
  }
  return { box, fill, value, axis };
}

function monitorMeter(key, label, title) {
  return monitorCell("meter", key, label, title);
}

function monitorThermo(label, title) {
  const parts = monitorCell("thermo", "thermo", label, title);
  return { ...parts, mercury: parts.fill };
}

function buildMonitorStrip() {
  const strip = el("div", `om-mon om-mon-style-${monitorStyle()}`);
  liveTip(strip, () => ["Open the Memory panel",
    linkText()
      || (readingQuiet()
        ? `${quietText(readingAge())}. These figures are the last that arrived.`
        : "")]
    .filter(Boolean).join("\n"));
  strip.onclick = () => openMemoryPanel();
  strip._cells = {
    cpu: monitorMeter("cpu", "CPU", "Processor load since the last reading"),
    ram: monitorMeter("ram", "RAM", "System memory in use"),
  };
  strip.appendChild(strip._cells.cpu.box);
  strip.appendChild(strip._cells.ram.box);
  if (!monitorWants("Cpu")) strip._cells.cpu.box.style.display = "none";
  if (!monitorWants("Ram")) strip._cells.ram.box.style.display = "none";
  strip._dynamic = el("span", "om-mon-dynamic");
  strip.appendChild(strip._dynamic);
  strip._shape = "";
  strip._parts = [];
  return strip;
}

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

  const sensors = new Map();
  for (const one of temps) {
    const base = one.label.slice(0, 8);
    sensors.set(base, (sensors.get(base) || 0) + 1);
  }
  for (const [at, one] of temps.entries()) {
    const base = one.label.slice(0, 8);
    const thermo = monitorThermo(sensors.get(base) > 1 ? `${base}:${at}` : base,
                                 `${one.label} temperature`);
    monitorStrip._dynamic.appendChild(thermo.box);
    monitorStrip._parts.push({ kind: "cpu-temp", label: one.label, at, thermo });
  }
  for (const device of devices) {
    const many = devices.length > 1;
    const label = many ? `VRAM:${device.index}` : "VRAM";
    const meter = monitorMeter("vram", label, device.name);
    monitorStrip._dynamic.appendChild(meter.box);
    monitorStrip._parts.push({ kind: "vram", index: device.index, meter });
    if (wantThermo && "temp" in device) {
      const thermo = monitorThermo(many ? `GPU:${device.index}` : "GPU",
                                   `${device.name} temperature`);
      monitorStrip._dynamic.appendChild(thermo.box);
      monitorStrip._parts.push({ kind: "gpu-temp", index: device.index, thermo });
    }
  }
}


function paintMonitor(reading) {
  if (!monitorStrip?.isConnected) return;
  syncMonitorDevices(reading);
  const cells = monitorStrip._cells;
  const fillTo = (parts, share) => {
    const held = `${Math.max(0, Math.min(100, share))}%`;
    if (parts.axis === "v") { parts.fill.style.height = held; parts.fill.style.width = ""; }
    else { parts.fill.style.width = held; parts.fill.style.height = ""; }
  };
  const setMeter = (parts, share, text, said) => {
    parts.value.textContent = text;
    fillTo(parts, share);
    parts.fill.classList.toggle("om-mon-hot", share >= 90);
    parts.box._say = said;
  };
  const setThermo = (parts, degrees, name) => {
    parts.value.textContent = `${Math.round(degrees)}°`;
    fillTo(parts, tempShare(degrees));
    parts.fill.style.background = tempColour(degrees);
    if (!name) return;
    parts.box._say = { lead: name, facts: [
      ["Temperature", `${Math.round(degrees)} °C`],
      ["Warm above", `${TEMP_WARM} °C`],
      ["Hot above", `${TEMP_HOT} °C`],
    ] };
  };

  if (typeof reading.cpu === "number") {
    const cores = reading.cores || [];
    const hottest = (reading.cpu_temps || [])[0];
    setMeter(cells.cpu, reading.cpu, `${Math.round(reading.cpu)}%`, { lead: "Processor", facts: [
      ["Load", `${Math.round(reading.cpu)}%`],
      ["Busiest core", cores.length ? `${Math.round(Math.max(...cores))}%` : ""],
      ["Processors", cores.length ? `${cores.length} logical` : ""],
      ["Temperature", hottest ? `${Math.round(hottest.temp)} °C` : ""],
    ] });
  }
  if (reading.ram?.total) {
    const share = (reading.ram.used / reading.ram.total) * 100;
    setMeter(cells.ram, share, meterText(reading.ram.used, reading.ram.total), {
      lead: "System memory",
      facts: [
        ["In use", `${bytesText(reading.ram.used)} of ${bytesText(reading.ram.total)}`],
        ["Share", `${Math.round(share)}%`],
        ["Free", reading.ram.free ? bytesText(reading.ram.free) : ""],
      ],
      lines: [share >= 90 ? "Nearly full." : ""],
    });
  }

  const byIndex = new Map((reading.devices || []).map((one) => [one.index, one]));
  for (const part of monitorStrip._parts) {
    if (part.kind === "vram") {
      const device = byIndex.get(part.index);
      if (!device?.total) continue;
      const share = (device.used / device.total) * 100;
      setMeter(part.meter, share, meterText(device.used, device.total), {
        lead: device.name,
        facts: [
          ["In use", `${bytesText(device.used)} of ${bytesText(device.total)}`],
          ["Share", `${Math.round(share)}%`],
          ["Utilisation", typeof device.util === "number" ? `${device.util}%` : ""],
          ["Memory traffic", typeof device.mem_util === "number" ? `${device.mem_util}%` : ""],
          ["Power", device.watts == null ? ""
            : `${Math.round(device.watts)} W${device.watt_limit
              ? ` of ${Math.round(device.watt_limit)} W` : ""}`],
          ["Temperature",
           typeof device.temp === "number" ? `${Math.round(device.temp)} °C` : ""],
        ],
        lines: [share >= 90 ? "Nearly full." : ""],
      });
    } else if (part.kind === "gpu-temp") {
      const device = byIndex.get(part.index);
      if (device && typeof device.temp === "number") {
        setThermo(part.thermo, device.temp, device.name);
      }
    } else if (part.kind === "cpu-temp") {
      const sensors = reading.cpu_temps || [];
      const found = sensors[part.at]?.label === part.label
        ? sensors[part.at]
        : sensors.find((one) => one.label === part.label);
      if (found) setThermo(part.thermo, found.temp, found.label);
    }
  }
}

function markMonitorQuiet() {
  if (!monitorStrip?.isConnected) return;
  monitorStrip.classList.toggle("om-mon-quiet", linkDown() || readingQuiet());
}

let monitorBusy = false;

async function renewMonitorLease() {
  if (!monitorStrip?.isConnected) return;
  markMonitorQuiet();
  if (document.hidden || monitorBusy || !linkMayPost()) return;
  monitorBusy = true;
  try {
    const answer = await monPost("/monitor",
      { client: MONITOR_CLIENT, interval: monitorInterval() },
      Math.max(LINK_DEADLINE, monitorInterval() * 2000));
    linkLeased(answer);
    if (answer?.reading) takeReading(answer.reading);
  } catch {
  } finally {
    monitorBusy = false;
  }
  markMonitorQuiet();
  linkTick();
}

function startMonitor() {
  clearInterval(monitorTimer);
  monitorTimer = setInterval(renewMonitorLease, Math.max(1000, monitorInterval() * 1000));
  renewMonitorLease();
}

function wireMonitorLink() {
  api.addEventListener("open_manager.monitor", (event) => {
    link.pushAt = Date.now();
    link.strikes = 0;
    link.tries = 0;
    link.verifyUntil = 0;
    takeReading(event.detail || {});
  });
  api.addEventListener("reconnecting", () => {
    link.verifyUntil = Date.now() + LINK_VERIFY;
  });
  api.addEventListener("reconnected", () => {
    link.verifyUntil = 0;
    link.tries = 0;
    link.strikes = 0;
    link.nextTryAt = 0;
    renewMonitorLease();
  });
  window.addEventListener("online", () => {
    link.nextPostAt = 0;
    link.pollStep = 0;
    link.nextTryAt = 0;
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      link.hiddenAt = Date.now();
      if (monitorTimer) stopMonitor();
      return;
    }
    if (link.hiddenAt) link.hiddenFor += Date.now() - link.hiddenAt;
    link.hiddenAt = 0;
    link.strikes = 0;
    link.nextPostAt = 0;
    if (monitorStrip?.isConnected) startMonitor();
    else if (panelSetting("openManager.monitor", false) !== false) mountTopbar();
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted && monitorStrip?.isConnected) startMonitor();
  });
  window.addEventListener("pagehide", () => {
    if (monitorTimer) stopMonitor();
    if (floatingPanel("memory")) monRelease(MEMORY_CLIENT);
  });
}

function stopMonitor() {
  clearInterval(monitorTimer);
  monitorTimer = 0;
  monRelease(MONITOR_CLIENT);
}

function monitorHost(fallback) {
  if (panelSetting("openManager.monitorPlacement", "control") !== "topbar") {
    const beside = document.getElementById("crystools-monitors-root");
    if (beside?.parentElement) return { host: beside.parentElement, before: beside };
    const bar = document.querySelector(".actionbar-container");
    if (bar) {
      const group = bar.querySelector(".flex.gap-2") || bar.firstElementChild || bar;
      return { host: group, before: group.firstChild };
    }
  }
  const tabs = document.querySelector(".workflow-tabs-container.pointer-events-auto");
  const trailing = tabs?.querySelector(".ml-auto");
  if (trailing) return { host: trailing, before: trailing.firstChild };
  return fallback ? { host: fallback, before: fallback.firstChild } : null;
}

function mountMonitor(slot) {
  if (panelSetting("openManager.monitor", false) === false) return false;
  if (document.querySelector(".om-mon")) return true;
  const where = monitorHost(slot);
  if (!where) return false;
  monitorStrip = buildMonitorStrip();
  where.host.insertBefore(monitorStrip, where.before);
  startMonitor();
  return true;
}


const NODE_DRAG_TYPE = "application/x-om-node";

const nodeDropHosts = new Set();

let dragGuardReady = false;

function nodeTypeHere(entry) {
  const types = window.LiteGraph?.registered_node_types;
  const name = entry?.name ? String(entry.name) : "";
  if (!types || !name) return "";
  return Object.prototype.hasOwnProperty.call(types, name) ? name : "";
}

function shownGraph() {
  return app.canvas?.graph || app.graph || null;
}

function addNodeAt(type, at) {
  const lg = window.LiteGraph;
  if (!nodeTypeHere({ name: type })) {
    notify("Not added", `${type} is not registered in this ComfyUI, so it cannot be created.`);
    return null;
  }
  const canvas = app.canvas;
  const graph = shownGraph();
  if (!canvas || !graph) return null;
  let where = [0, 0];
  try {
    where = canvas.convertEventToCanvasOffset(at);
  } catch {
    where = [0, 0];
  }
  const made = lg.createNode(type, undefined, {
    pos: [Math.round(where[0]), Math.round(where[1])],
  });
  if (!made) {
    notify("Not added", `${type} could not be created.`);
    return null;
  }
  canvas.emitBeforeChange?.();
  try {
    graph.add(made);
  } finally {
    canvas.emitAfterChange?.();
  }
  try {
    app.extensionManager?.workflow?.activeWorkflow?.changeTracker?.captureCanvasState?.();
  } catch {
  }
  graph.setDirtyCanvas?.(true, true);
  toast(`${made.title || type} added to the graph.`, { kind: "ok" });
  return made;
}

function canvasCentre() {
  const canvas = app.canvas?.canvas;
  const rect = canvas?.getBoundingClientRect();
  if (!rect) return { clientX: 0, clientY: 0 };
  return { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
}

function mountNodeDrop() {
  const canvas = app.canvas?.canvas;
  if (!canvas) return;
  const carried = (event) => [...(event.dataTransfer?.types || [])].includes(NODE_DRAG_TYPE);
  for (const host of [canvas.parentElement, canvas]) {
    if (!host || nodeDropHosts.has(host)) continue;
    nodeDropHosts.add(host);
    host.addEventListener("dragover", (event) => {
      if (!carried(event)) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    }, true);
    host.addEventListener("drop", (event) => {
      if (!carried(event)) return;
      const type = event.dataTransfer.getData(NODE_DRAG_TYPE);
      event.preventDefault();
      event.stopPropagation();
      if (type) addNodeAt(type, event);
    }, true);
  }
}

function guardWindowDrags() {
  if (dragGuardReady) return;
  dragGuardReady = true;
  document.addEventListener("dragstart", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target?.closest(".om-float, .om-dialog, .om-lb, .om-backdrop, .om-task, "
      + ".om-task-pop")) return;
    if (target.closest("[data-om-drag]")) return;
    event.preventDefault();
  }, true);
}

const GHOST_ROW = 15;

const GHOST_ROWS_MAX = 7;

function nodeGhost(entry, type) {
  const lg = window.LiteGraph || {};
  const inputs = entry?.inputs || {};
  const ins = Number(inputs.required || 0) + Number(inputs.optional || 0);
  const outs = (entry?.outputs || []).length;
  const rows = Math.max(1, Math.min(GHOST_ROWS_MAX, Math.max(ins, outs)));
  const ghost = el("div", "om-node-ghost");
  ghost.style.setProperty("--om-ghost-title", lg.NODE_DEFAULT_COLOR || "#333");
  ghost.style.setProperty("--om-ghost-body", lg.NODE_DEFAULT_BGCOLOR || "#353535");
  ghost.style.setProperty("--om-ghost-text", lg.NODE_TITLE_COLOR || "#e6edf3");
  ghost.appendChild(el("div", "om-node-ghost-bar", entry?.display_name || type));
  const body = el("div", "om-node-ghost-body");
  body.style.height = `${rows * GHOST_ROW + 10}px`;
  const dot = (side, at) => {
    const slot = el("span", "om-node-ghost-slot");
    slot.style[side] = "5px";
    slot.style.top = `${at * GHOST_ROW + 8}px`;
    body.appendChild(slot);
  };
  for (let at = 0; at < Math.min(rows, ins); at += 1) dot("left", at);
  for (let at = 0; at < Math.min(rows, outs); at += 1) dot("right", at);
  ghost.appendChild(body);
  return ghost;
}

function carryNode(event, type, entry) {
  if (!event.dataTransfer) return;
  event.dataTransfer.setData(NODE_DRAG_TYPE, type);
  event.dataTransfer.effectAllowed = "copy";
  const ghost = nodeGhost(entry, type);
  document.body.appendChild(ghost);
  try {
    event.dataTransfer.setDragImage(ghost, 14, 12);
  } catch {
  }
  requestAnimationFrame(() => ghost.remove());
}

function graphNodes() {
  const types = window.LiteGraph?.registered_node_types || {};
  const made = [];
  for (const [type, held] of Object.entries(types)) {
    const def = held?.nodeData;
    const ports = def?.inputs && typeof def.inputs === "object" ? Object.values(def.inputs) : [];
    made.push({
      name: type,
      display_name: def?.display_name || held?.title || type,
      category: def?.category || held?.category || "",
      module: def?.python_module || "",
      description: def?.description || "",
      deprecated: def?.deprecated === true,
      experimental: def?.experimental === true,
      inputs: {
        required: ports.filter((one) => one && !one.isOptional).length,
        optional: ports.filter((one) => one && one.isOptional).length,
      },
      takes: ports.map((one) => ({ name: String(one?.name || ""),
                                   type: String(one?.type || ""),
                                   optional: one?.isOptional === true })),
      outputs: (def?.outputs || []).map((one) => String(one?.type || one?.name || "")),
    });
  }
  return made;
}

function nodeDragFrom(item, entry) {
  const type = nodeTypeHere(entry);
  if (!type) {
    item.classList.add("om-node-absent");
    liveTip(item, () => `${entry.name}\nNot registered in this ComfyUI.`);
    return;
  }
  mountNodeDrop();
  guardWindowDrags();
  const dialogued = () => !!item.closest(".om-backdrop");
  liveTip(item, () => ({ lead: type }));
  item.classList.add("om-node-here");
  item.dataset.omDrag = "1";
  item.draggable = true;
  item.addEventListener("dragstart", (event) => {
    if (event.target instanceof Element && event.target.closest("a")) {
      event.preventDefault();
      return;
    }
    if (dialogued()) {
      event.preventDefault();
      return;
    }
    carryNode(event, type, entry);
  });
  item.ondblclick = (event) => {
    event.stopPropagation();
    addNodeAt(type, canvasCentre());
  };
}


const TAB_MARK_KEY = "om-tab-marks";

const TAB_TINTS = [
  ["Red", "#f85149"], ["Amber", "#d29922"], ["Green", "#3fb950"], ["Teal", "#39c5cf"],
  ["Blue", "#58a6ff"], ["Purple", "#a371f7"], ["Pink", "#db61a2"], ["Grey", "#8b949e"],
];

const TAB_HEX = /^#[0-9a-fA-F]{6}$/;

const TAB_MENU_PICK = '[role="menuitem"], li.p-contextmenu-item, [data-reka-collection-item]';

const TAB_MENU_WAIT = 1500;

const TAB_TITLE_CAP = 80;

let tabMarks = null;
let tabSeenKey = "";
let tabWatching = false;

function tabMarksAll() {
  if (tabMarks) return tabMarks;
  try {
    const held = JSON.parse(localStorage.getItem(TAB_MARK_KEY) || "{}");
    tabMarks = held && typeof held === "object" ? held : {};
  } catch {
    tabMarks = {};
  }
  return tabMarks;
}

const TAB_SCRATCH_NAME = /(^|\/)Unsaved Workflow( \(\d+\))?\.json$/i;

function tabMarksTidy() {
  const all = tabMarksAll();
  const saved = new Set(flowList().map((one) => tabKeyOf(one)));
  let gone = 0;
  for (const key of Object.keys(all)) {
    if (!TAB_SCRATCH_NAME.test(key) || saved.has(key)) continue;
    delete all[key];
    gone += 1;
  }
  if (gone) tabMarksSave();
  return gone;
}

function tabMarksSave() {
  try { localStorage.setItem(TAB_MARK_KEY, JSON.stringify(tabMarksAll())); } catch {}
}

function tabKeyOf(workflow) {
  return String(workflow?.path || workflow?.key || "");
}

const tabTemp = new WeakMap();

function tabScratch(workflow) {
  return !!workflow && workflow.isTemporary === true;
}

function tabMarkOf(workflow) {
  if (!workflow) return null;
  if (tabScratch(workflow)) return tabTemp.get(workflow) || null;
  return tabMarksAll()[tabKeyOf(workflow)] || null;
}

function tabTint(value) {
  const text = String(value || "").trim();
  return TAB_HEX.test(text) ? text : "";
}

function tabStrip() {
  return document.querySelector(".workflow-tabs");
}

function openWorkflows() {
  return app.extensionManager?.workflow?.openWorkflows || [];
}

function tabMarksOn() {
  return panelSetting("openManager.tabMarks", true) !== false;
}

function tabExtrasWrite(workflow, mark) {
  const active = app.extensionManager?.workflow?.activeWorkflow;
  if (!active || active.key !== workflow?.key) return;
  const extra = app.graph?.extra;
  if (!extra) return;
  if (mark.title) extra.om_custom_title = mark.title;
  else delete extra.om_custom_title;
  if (mark.colour) extra.om_tab_color = mark.colour;
  else delete extra.om_tab_color;
}

function tabExtrasRead() {
  const active = app.extensionManager?.workflow?.activeWorkflow;
  const extra = app.graph?.extra;
  if (!active || !extra) return;
  const title = String(extra.om_custom_title || "").trim().slice(0, TAB_TITLE_CAP);
  const colour = tabTint(extra.om_tab_color);
  if (!title && !colour) return;
  if (tabScratch(active)) {
    const held = { ...(tabTemp.get(active) || {}) };
    if (title) held.title = title;
    if (colour) held.colour = colour;
    tabTemp.set(active, held);
    return;
  }
  const all = tabMarksAll();
  const key = tabKeyOf(active);
  const now = { ...(all[key] || {}) };
  if (title) now.title = title;
  if (colour) now.colour = colour;
  all[key] = now;
  tabMarksSave();
}

function setTabMark(workflow, patch) {
  if (!workflow) return;
  const tidy = (held) => {
    const now = { ...held, ...patch };
    if (!now.colour) delete now.colour;
    if (!now.title) delete now.title;
    return now;
  };
  if (tabScratch(workflow)) {
    const now = tidy(tabTemp.get(workflow) || {});
    if (Object.keys(now).length) tabTemp.set(workflow, now);
    else tabTemp.delete(workflow);
    tabExtrasWrite(workflow, now);
    paintTabs();
    return;
  }
  const key = tabKeyOf(workflow);
  if (!key) return;
  const all = tabMarksAll();
  const now = tidy(all[key] || {});
  if (Object.keys(now).length) all[key] = now;
  else delete all[key];
  tabMarksSave();
  tabExtrasWrite(workflow, now);
  paintTabs();
}

function paintTab(tab, mark) {
  const tint = mark?.colour || "";
  if (tab.style.getPropertyValue("--om-tab-tint") !== tint) {
    if (tint) tab.style.setProperty("--om-tab-tint", tint);
    else tab.style.removeProperty("--om-tab-tint");
  }
  if ((tab.getAttribute("data-om-tint") || "") !== tint) {
    if (tint) tab.setAttribute("data-om-tint", tint);
    else tab.removeAttribute("data-om-tint");
  }

  const label = tab.querySelector(".workflow-label");
  if (!label) return;
  const wanted = mark?.title || "";
  const own = tab.querySelector(".om-tab-title");
  if (!wanted) {
    if (own) own.remove();
    tab.removeAttribute("data-om-titled");
    return;
  }
  if (tab.getAttribute("data-om-titled") !== "1") tab.setAttribute("data-om-titled", "1");
  if (own) {
    if (own.textContent !== wanted) own.textContent = wanted;
    return;
  }
  const shown = el("span", "om-tab-title", wanted);
  liveTip(shown, () => `${wanted}
${label.textContent.trim()}`);
  label.parentElement.insertBefore(shown, label);
}

function paintTabs() {
  const strip = tabStrip();
  if (!strip) return;
  const off = !tabMarksOn();
  const open = openWorkflows();
  [...strip.children].forEach((tab, index) => {
    paintTab(tab, off ? null : tabMarkOf(open[index]));
  });
}

function tabUnderlay() {
  const root = document.documentElement;
  const now = getComputedStyle(root).getPropertyValue("--comfy-menu-bg").trim();
  if (!now || now === root.style.getPropertyValue("--om-tab-under")) return;
  root.style.setProperty("--om-tab-under", now);
}

function tabTick() {
  tabUnderlay();
  const active = app.extensionManager?.workflow?.activeWorkflow;
  const key = active ? tabKeyOf(active) : "";
  if (key && key !== tabSeenKey) {
    tabSeenKey = key;
    tabExtrasRead();
  }
  paintTabs();
}

function tabAt(event) {
  const strip = tabStrip();
  if (!strip || !(event.target instanceof Element)) return null;
  const tabs = [...strip.children];
  const tab = tabs.find((one) => one.contains(event.target));
  if (!tab) return null;
  return openWorkflows()[tabs.indexOf(tab)] || null;
}

function awaitTabMenu(workflow) {
  let timer = 0;
  const watcher = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        const item = node.matches?.(TAB_MENU_PICK) ? node : node.querySelector?.(TAB_MENU_PICK);
        if (!item) continue;
        watcher.disconnect();
        clearTimeout(timer);
        injectTabMenu(item, workflow);
        return;
      }
    }
  });
  watcher.observe(document.body, { childList: true, subtree: true });
  timer = setTimeout(() => watcher.disconnect(), TAB_MENU_WAIT);
}

function closeHostMenu() {
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
}

function pickTabColour(workflow) {
  const field = el("input", "om-tab-picker");
  field.type = "color";
  field.value = tabMarkOf(workflow)?.colour || "#58a6ff";
  document.body.appendChild(field);
  field.addEventListener("change", () => {
    setTabMark(workflow, { colour: tabTint(field.value) });
    field.remove();
  });
  field.click();
}

function injectTabMenu(item, workflow) {
  const host = item.parentElement;
  if (!host || host.querySelector(".om-tab-row")) return;
  const mark = (tabMarksOn() ? tabMarkOf(workflow) : null) || {};
  const shell = () => {
    const holder = el(item.tagName.toLowerCase() === "li" ? "li" : "div", null);
    holder.className = item.className;
    holder.classList.add("om-tab-row");
    return holder;
  };
  const divider = () => {
    const theirs = host.querySelector('[role="separator"], hr');
    if (theirs) {
      const copy = theirs.cloneNode(true);
      copy.classList.add("om-tab-split");
      return copy;
    }
    const made = el(item.tagName.toLowerCase() === "li" ? "li" : "div", "om-tab-split");
    made.setAttribute("role", "separator");
    return made;
  };

  const colours = shell();
  colours.appendChild(el("span", "om-tab-row-label", "Colour"));
  const swatches = el("span", "om-tab-swatches");
  for (const [name, value] of TAB_TINTS) {
    const dot = el("button", "om-tab-swatch");
    dot.style.background = value;
    dot.title = name;
    if (mark.colour === value) dot.classList.add("om-tab-swatch-on");
    dot.onclick = (event) => {
      event.stopPropagation();
      setTabMark(workflow, { colour: value });
      closeHostMenu();
    };
    swatches.appendChild(dot);
  }
  const custom = el("button", "om-tab-swatch om-tab-swatch-pick", "+");
  custom.title = "Custom colour";
  custom.onclick = (event) => {
    event.stopPropagation();
    closeHostMenu();
    pickTabColour(workflow);
  };
  swatches.appendChild(custom);
  const clear = el("button", "om-tab-swatch om-tab-swatch-off", "×");
  clear.title = "No colour";
  clear.onclick = (event) => {
    event.stopPropagation();
    setTabMark(workflow, { colour: "" });
    closeHostMenu();
  };
  swatches.appendChild(clear);
  colours.appendChild(swatches);

  const titles = shell();
  titles.appendChild(el("span", "om-tab-row-label", "Title"));
  const naming = el("span", "om-tab-swatches");
  const set = el("button", "om-tab-name", mark.title || "Set a title");
  set.title = "A label for this tab only.";
  set.onclick = async (event) => {
    event.stopPropagation();
    closeHostMenu();
    const asked = await askText("Tab title", mark.title || workflow.filename || "", "Set");
    if (asked === null) return;
    setTabMark(workflow, { title: String(asked).slice(0, TAB_TITLE_CAP) });
  };
  naming.appendChild(set);
  if (mark.title) {
    const drop = el("button", "om-tab-swatch om-tab-swatch-off", "×");
    drop.title = "Use the file's own name";
    drop.onclick = (event) => {
      event.stopPropagation();
      setTabMark(workflow, { title: "" });
      closeHostMenu();
    };
    naming.appendChild(drop);
  }
  titles.appendChild(naming);

  const sending = shell();
  sending.appendChild(el("span", "om-tab-row-label", "Desktop"));
  const sender = el("span", "om-tab-swatches");
  const send = el("button", "om-tab-name",
                  workflow.isTemporary ? "Not saved yet" : "Put a shortcut on the desktop");
  send.disabled = !!workflow.isTemporary;
  send.title = workflow.isTemporary
    ? "This tab has never been saved."
    : "A shortcut on the desktop that opens this workflow.";
  send.onclick = async (event) => {
    event.stopPropagation();
    closeHostMenu();
    const made = await makeFlowLink("", workflow);
    if (!made) return;
    await loadDeskDocs();
    paintDeskIcons();
    toast(`Made a shortcut to ${made.name}.`, { kind: "ok" });
  };
  sender.appendChild(send);
  sending.appendChild(sender);

  host.appendChild(divider());
  if (tabMarksOn()) {
    host.appendChild(colours);
    host.appendChild(titles);
  }
  host.appendChild(sending);
}

function onTabMenu(event) {
  const workflow = tabAt(event);
  if (workflow) awaitTabMenu(workflow);
}

function mountTabMarks() {
  if (tabWatching) { tabTick(); return; }
  const strip = tabStrip();
  if (!strip) return;
  tabWatching = true;
  let due = 0;
  const watcher = new MutationObserver(() => {
    if (due) return;
    due = requestAnimationFrame(() => { due = 0; tabTick(); });
  });
  watcher.observe(strip, { childList: true, subtree: true, characterData: true,
                           attributes: true, attributeFilter: ["class"] });
  document.addEventListener("contextmenu", onTabMenu, true);
  tabMarksTidy();
  tabTick();
}

const TASK_GROUP_NAMES = {
  pack: "Custom nodes",
  manager: "Node Discovery",
  downloads: "Download Manager",
  library: "Model Library",
  memory: "Memory",
  desktop: "Desktop settings",
  programs: "Manage Programs",
  files: "Folders",
  note: "Notes",
  props: "Properties",
  wastebasket: "Trash",
};

const TASK_POP_IN = 180;

const TASK_POP_OUT = 260;

let taskBar = null;

let taskStart = null;

let taskStrip = null;

let startPanel = null;
let taskDue = 0;
let taskPop = null;
let taskPopFor = null;
let taskPopIn = 0;
let taskPopOut = 0;
let taskWired = false;

function taskGroupName(group) {
  const known = Object.hasOwn(TASK_GROUP_NAMES, group) ? TASK_GROUP_NAMES[group] : "";
  if (known) return known;
  const text = String(group || "Window");
  return text.length > 18 ? `${text.slice(0, 17)}…` : text;
}

function taskWindows() {
  const out = [];
  for (const [key, panel] of [...floatPanels]) {
    if (!panel.el.isConnected) { floatPanels.delete(key); continue; }
    if (panel.modal) continue;
    out.push(panel);
  }
  return out;
}

function taskEntries() {
  const open = taskWindows();
  if (!taskbarGrouped()) return open.map((panel) => ({ group: panel.group, members: [panel] }));
  const entries = [];
  const seen = new Map();
  for (const panel of open) {
    const found = seen.get(panel.group);
    if (found) { found.members.push(panel); continue; }
    const made = { group: panel.group, members: [panel] };
    seen.set(panel.group, made);
    entries.push(made);
  }
  return entries;
}

function taskbarHost() {
  const bottom = document.getElementById("comfyui-body-bottom");
  if (bottom) return { host: bottom, before: bottom.firstChild, flow: true };
  return { host: document.body, before: null, flow: false };
}

function taskTint(text) {
  let sum = 0;
  for (const ch of String(text)) sum = (sum * 31 + ch.codePointAt(0)) % 360;
  return `hsl(${sum} 42% 38%)`;
}

function taskInitial(text) {
  const label = String(text || "?").trim();
  const node = el("span", "om-task-glyph", (label[0] || "?").toUpperCase());
  node.style.background = taskTint(label);
  node.style.color = "#fff";
  return node;
}

function omIcon(art, { name = "", cls = "om-task-glyph", img = "om-task-icon" } = {}) {
  const url = safeArt(art?.url);
  if (url && art.kind === "src") {
    const node = el("img", img);
    node.alt = "";
    node.draggable = false;
    node.onerror = () => node.replaceWith(art.fallback?.kind === "mask"
      ? omIcon({ kind: "mask", url: art.fallback.url }, { name, cls, img })
      : taskInitial(name));
    node.src = url;
    return node;
  }
  if (url && art.kind === "mask") {
    const node = el("span", cls);
    node.style.backgroundColor = art.tint || "currentColor";
    node.style.setProperty("-webkit-mask", `center / contain no-repeat url("${url}")`);
    node.style.setProperty("mask", `center / contain no-repeat url("${url}")`);
    return node;
  }
  return taskInitial(name);
}

function taskIcon(panel) {
  return omIcon(panel.icon?.(), { name: panel.title?.() || panel.key });
}

function taskOneMenu(panel) {
  const items = [panel.isMinimised()
    ? { label: "Restore", fn: () => panel.present() }
    : { label: "Minimise", fn: () => panel.minimise() },
    { label: "Close", danger: true, fn: () => panel.destroy() }];
  const rest = taskWindows().filter((one) => one !== panel);
  if (rest.length) {
    items.push({
      label: `Close ${rest.length} other window${rest.length === 1 ? "" : "s"}`,
      danger: true,
      fn: () => { for (const one of rest) one.destroy(); },
    });
  }
  return items;
}

function taskGroupMenu(entry) {
  const items = [];
  const away = entry.members.filter((one) => one.isMinimised());
  const live = entry.members.filter((one) => !one.isMinimised());
  if (away.length) {
    items.push({ label: "Restore all", fn: () => { for (const one of away) one.present(); } });
  }
  if (live.length) {
    items.push({ label: "Minimise all", fn: () => { for (const one of live) one.minimise(); } });
  }
  items.push({
    label: `Close these ${entry.members.length} windows`,
    danger: true,
    fn: () => { for (const one of [...entry.members]) one.destroy(); },
  });
  return items;
}

function buildTaskRow(panel) {
  const row = el("div", "om-task-row");
  row.setAttribute("role", "menuitem");
  row.tabIndex = -1;
  row.appendChild(taskIcon(panel));
  const name = panel.title?.() || panel.key;
  row.appendChild(el("span", "om-task-row-name", name));
  const minimised = panel.isMinimised();
  const front = !minimised && panel.el.classList.contains("om-float-active");
  row.appendChild(el("span", "om-task-row-state",
    minimised ? "Minimised" : (front ? "In front" : "")));
  const shut = el("button", "om-task-shut", "×");
  shut.type = "button";
  shut.tabIndex = -1;
  shut.setAttribute("aria-hidden", "true");
  shut.onclick = (event) => { event.stopPropagation(); panel.destroy(); };
  row.appendChild(shut);
  row.onclick = () => { panel.present(); closeTaskPop(false); };
  row.addEventListener("auxclick", (event) => {
    if (event.button !== 1) return;
    event.preventDefault();
    panel.destroy();
  });
  return row;
}

function fillTaskPop(entry) {
  if (!taskPop) return;
  taskPop.replaceChildren(...entry.members.map(buildTaskRow));
  placeRowMenu(taskPop, taskPopFor, "left");
}

function taskPopLater() {
  clearTimeout(taskPopOut);
  taskPopOut = setTimeout(() => closeTaskPop(false), TASK_POP_OUT);
}

function closeTaskPop(back) {
  clearTimeout(taskPopIn);
  clearTimeout(taskPopOut);
  taskPopIn = 0;
  taskPopOut = 0;
  taskPop?.remove();
  taskPop = null;
  const was = taskPopFor;
  taskPopFor = null;
  if (was) {
    was.setAttribute("aria-expanded", "false");
    was.removeAttribute("aria-controls");
    if (back && was.isConnected) was.focus();
  }
}

function openTaskPop(item, entry, intoIt) {
  if (taskPopFor === item && taskPop) {
    if (intoIt) taskPop.querySelector(".om-task-row")?.focus();
    return;
  }
  closeTaskPop(false);
  taskPop = el("div", "om-task-pop");
  taskPop.id = `om-task-pop-${String(entry.group).replace(/[^a-z0-9_-]/gi, "-")}`;
  taskPop.setAttribute("role", "menu");
  taskPop.setAttribute("aria-label", `${taskGroupName(entry.group)} windows`);
  taskPop.addEventListener("pointerenter", () => { clearTimeout(taskPopOut); taskPopOut = 0; });
  taskPop.addEventListener("pointerleave", taskPopLater);
  taskPop.addEventListener("keydown", onTaskPopKey);
  document.body.appendChild(taskPop);
  taskPopFor = item;
  fillTaskPop(entry);
  requestAnimationFrame(() => taskPop?.classList.add("om-task-pop-on"));
  item.setAttribute("aria-expanded", "true");
  item.setAttribute("aria-controls", taskPop.id);
  if (intoIt) taskPop.querySelector(".om-task-row")?.focus();
}

function onTaskPopKey(event) {
  if (!taskPop) return;
  const rows = [...taskPop.querySelectorAll(".om-task-row")];
  const here = event.target instanceof Element ? event.target.closest(".om-task-row") : null;
  const at = rows.indexOf(here);
  if (event.key === "ArrowDown") {
    event.preventDefault();
    rows[Math.min(rows.length - 1, at + 1)]?.focus();
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    (at <= 0 ? rows[0] : rows[at - 1])?.focus();
  } else if (event.key === "Home") {
    event.preventDefault();
    rows[0]?.focus();
  } else if (event.key === "End") {
    event.preventDefault();
    rows[rows.length - 1]?.focus();
  } else if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    here?.click();
  } else if (event.key === "Delete") {
    event.preventDefault();
    here?.querySelector(".om-task-shut")?.click();
  } else if (event.key === "Escape") {
    event.preventDefault();
    closeTaskPop(true);
  } else if (event.key === "Tab") {
    closeTaskPop(false);
  }
}

function buildTaskOne(panel) {
  const item = el("button", "om-task-item");
  item.type = "button";
  item.dataset.omTask = panel.key;
  const name = panel.title?.() || panel.key;
  const minimised = panel.isMinimised();
  const front = !minimised && panel.el.classList.contains("om-float-active");
  if (!minimised) item.classList.add("om-task-on");
  if (front) {
    item.classList.add("om-task-front");
    item.setAttribute("aria-current", "true");
  }
  item.appendChild(taskIcon(panel));
  item.appendChild(el("span", "om-task-text", name));
  item.setAttribute("aria-label", minimised ? `${name}, minimised` : name);
  liveTip(item, () => ({
    lead: name,
    facts: [
      ["State", panel.isMinimised() ? "Minimised"
        : (panel.el.classList.contains("om-float-active") ? "In front" : "Open")],
      ["Group", taskGroupName(panel.group)],
    ],
  }));
  item.onclick = () => {
    if (panel.isMinimised()) { panel.present(); return; }
    if (panel.el.classList.contains("om-float-active")) { panel.minimise(); return; }
    panel.present();
  };
  item.addEventListener("pointerdown", (event) => {
    if (event.button === 1) event.preventDefault();
  });
  item.addEventListener("auxclick", (event) => {
    if (event.button !== 1) return;
    event.preventDefault();
    panel.destroy();
  });
  item.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    closeTaskPop(false);
    openRowMenu(item, { items: taskOneMenu(panel), align: "left" });
  });
  return item;
}

function buildTaskGroup(entry) {
  const item = el("button", "om-task-item");
  item.type = "button";
  item.dataset.omGroup = entry.group;
  item._omEntry = entry;
  const label = taskGroupName(entry.group);
  const live = entry.members.filter((one) => !one.isMinimised());
  const front = entry.members.some((one) => !one.isMinimised()
    && one.el.classList.contains("om-float-active"));
  if (live.length) item.classList.add("om-task-on");
  if (front) {
    item.classList.add("om-task-front");
    item.setAttribute("aria-current", "true");
  }
  item.appendChild(entry.group === "pack"
    ? el("span", "om-task-glyph", "▤")
    : taskInitial(label));
  item.appendChild(el("span", "om-task-text", label));
  item.appendChild(el("span", "om-task-count", String(entry.members.length)));
  item.setAttribute("aria-haspopup", "menu");
  item.setAttribute("aria-expanded", "false");
  item.setAttribute("aria-label", `${label}, ${entry.members.length} windows`);
  item.addEventListener("pointerenter", (event) => {
    if (event.pointerType === "touch") return;
    clearTimeout(taskPopOut);
    taskPopOut = 0;
    clearTimeout(taskPopIn);
    taskPopIn = setTimeout(() => openTaskPop(item, entry, false), taskPop ? 0 : TASK_POP_IN);
  });
  item.addEventListener("pointerleave", () => {
    clearTimeout(taskPopIn);
    taskPopIn = 0;
    taskPopLater();
  });
  item.onclick = () => {
    if (taskPopFor === item) closeTaskPop(false);
    else openTaskPop(item, entry, false);
  };
  item.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    closeTaskPop(false);
    openRowMenu(item, { items: taskGroupMenu(entry), align: "left" });
  });
  return item;
}

function taskNodeFor(key) {
  if (!taskBar || !key) return null;
  const direct = taskBar.querySelector(`[data-om-task="${CSS.escape(key)}"]`);
  if (direct) return direct;
  const panel = floatPanels.get(key);
  return panel ? taskBar.querySelector(`[data-om-group="${CSS.escape(panel.group)}"]`) : null;
}

function onTaskKey(event) {
  const item = event.target instanceof Element
    ? event.target.closest(".om-task-item") : null;
  if (!item || !taskBar) return;
  const items = taskWalk();
  const at = items.indexOf(item);
  const go = (to) => {
    const next = items[Math.max(0, Math.min(items.length - 1, to))];
    if (!next) return;
    for (const one of items) one.tabIndex = one === next ? 0 : -1;
    next.focus();
    next.scrollIntoView({ block: "nearest", inline: "nearest" });
  };
  if (event.key === "ArrowRight") { event.preventDefault(); go(at + 1); return; }
  if (event.key === "ArrowLeft") { event.preventDefault(); go(at - 1); return; }
  if (event.key === "Home") { event.preventDefault(); go(0); return; }
  if (event.key === "End") { event.preventDefault(); go(items.length - 1); return; }
  if (event.key === "Escape") { closeTaskPop(true); return; }
  if (event.key === "Delete") {
    const panel = item.dataset.omTask ? floatingPanel(item.dataset.omTask) : null;
    if (panel) { event.preventDefault(); panel.destroy(); }
    return;
  }
  if (item._omEntry && (event.key === "Enter" || event.key === " " || event.key === "ArrowUp")) {
    event.preventDefault();
    openTaskPop(item, item._omEntry, true);
  }
}

function closeStart(back) {
  if (!startPanel) return;
  startPanel.remove();
  closeStartPop();
  startPanel = null;
  taskStart?.setAttribute("aria-expanded", "false");
  taskStart?.removeAttribute("aria-controls");
  if (back) taskStart?.focus();
}

function startRow(art, label, { pin = null, pinned = false, open }) {
  const row = el("div", "om-start-row");
  row.tabIndex = -1;
  row.setAttribute("role", "menuitem");
  row.appendChild(omIcon(art, { name: label, cls: "om-start-art", img: "om-start-img" }));
  row.appendChild(el("span", "om-start-name", label));
  if (pin) {
    const mark = el("button", "om-start-pin", pinned ? "On the desktop" : "Pin");
    mark.type = "button";
    mark.onclick = (event) => {
      event.stopPropagation();
      pin(!pinned);
      closeStart(false);
    };
    row.appendChild(mark);
  }
  row.addEventListener("pointerenter", () => {
    if (!row.closest(".om-start-pop")) closeStartPop();
  });
  row.onclick = () => { closeStart(false); open(); };
  row.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    closeStart(false);
    open();
  });
  return row;
}

let startPop = null;

function closeStartPop() {
  startPop?.remove();
  startPop = null;
}

const START_SETTINGS = new Set(["desksettings", "programs"]);

function startGroupOf(row) {
  const said = String(row.program?.group || "").trim();
  if (said) return said;
  return START_SETTINGS.has(row.key) ? "Settings" : "Programs";
}

function startProgramRow(row) {
  const label = row.desk?.label || row.label;
  return startRow(
    row.desk ? { kind: row.desk.kind, url: row.desk.art } : { kind: "mask", url: ICON_PROGRAM },
    label,
    {
      open: () => deskOpenRow(row),
      pinned: pinnedOn(row.key),
      pin: desktopOn() ? (on) => (on ? pinDesk(row.key) : unpinDesk(row.key)) : null,
    },
  );
}

function openStartPop(anchor, rows) {
  closeStartPop();
  if (!rows.length || !startPanel) return;
  startPop = el("div", "om-start om-start-pop");
  startPop.setAttribute("role", "menu");
  startPop.replaceChildren(...rows);
  document.body.appendChild(startPop);
  const from = anchor.getBoundingClientRect();
  const beside = startPanel.getBoundingClientRect();
  const box = startPop.getBoundingClientRect();
  const left = beside.right + box.width + 8 <= window.innerWidth
    ? beside.right + 2
    : Math.max(8, beside.left - box.width - 2);
  const top = Math.max(8, Math.min(from.top - 4, window.innerHeight - box.height - 8));
  startPop.style.left = `${Math.round(left)}px`;
  startPop.style.top = `${Math.round(top)}px`;
}

function startGroupRow(label, art, rows) {
  const row = el("div", "om-start-row om-start-group");
  row.tabIndex = -1;
  row.setAttribute("role", "menuitem");
  row.setAttribute("aria-haspopup", "menu");
  row.appendChild(omIcon(art, { name: label, cls: "om-start-art", img: "om-start-img" }));
  row.appendChild(el("span", "om-start-name", label));
  row.appendChild(el("span", "om-start-more", "›"));
  const show = () => openStartPop(row, rows);
  row.addEventListener("pointerenter", show);
  row.onclick = show;
  row.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " " || event.key === "ArrowRight") {
      event.preventDefault();
      show();
      startPop?.querySelector(".om-start-row")?.focus();
    }
  });
  return row;
}

function fillStart(list, want) {
  const text = want.trim().toLowerCase();
  const fits = (label) => !text || label.toLowerCase().includes(text);
  closeStartPop();

  const programs = managerDestinations()
    .filter((row) => row.kind === "program" && (!row.available || row.available()))
    .filter((row) => row.program?.surfaces?.start !== false);
  const docs = deskDocs.slice();
  const extras = [
    ["Trash", { kind: "mask", url: ICON_BIN }, () => openWastebasket()],
  ];

  if (text) {
    const rows = [];
    for (const row of programs.filter((one) => fits(one.desk?.label || one.label))) {
      rows.push(startProgramRow(row));
    }
    for (const one of docs.filter((one) => fits(one.name))) {
      rows.push(startRow(docArt(one), one.name, { open: () => openDoc(one) }));
    }
    for (const [label, art, open] of extras.filter(([label]) => fits(label))) {
      rows.push(startRow(art, label, { open }));
    }
    list.replaceChildren(...(rows.length
      ? rows
      : [el("div", "om-start-none", "Nothing here matches that.")]));
    return;
  }

  const drawers = new Map();
  for (const row of programs) {
    const name = startGroupOf(row);
    if (!drawers.has(name)) drawers.set(name, []);
    drawers.get(name).push(startProgramRow(row));
  }

  const rows = [];
  const named = [...drawers.keys()]
    .filter((one) => one !== "Programs" && one !== "Settings")
    .sort((a, b) => a.localeCompare(b));
  for (const name of ["Programs", ...named, "Settings"]) {
    const held = drawers.get(name);
    if (!held?.length) continue;
    rows.push(startGroupRow(name, { kind: "mask", url: START_ART[name] || ICON_PROGRAM }, held));
  }

  const deskRows = [
    ...docs.map((one) => startRow(docArt(one), one.name, { open: () => openDoc(one) })),
    ...extras.map(([label, art, open]) => startRow(art, label, { open })),
  ];
  if (deskRows.length) {
    rows.push(startGroupRow("Desktop", { kind: "mask", url: ICON_DESKTOP }, deskRows));
  }

  list.replaceChildren(...(rows.length
    ? rows
    : [el("div", "om-start-none", "Nothing here yet.")]));
}

function openStart() {
  if (!taskBar?.isConnected) return null;
  closeTaskPop(false);
  closeStart(false);
  startPanel = el("div", "om-start");
  startPanel.setAttribute("role", "menu");
  startPanel.setAttribute("aria-label", "Start");
  startPanel.id = `om-start-${Math.random().toString(36).slice(2, 8)}`;
  const find = el("input", "om-search om-start-find");
  find.placeholder = "Search";
  find.spellcheck = false;
  const list = el("div", "om-start-list");
  startPanel.appendChild(find);
  startPanel.appendChild(list);
  document.body.appendChild(startPanel);
  fillStart(list, "");
  placeRowMenu(startPanel, taskStart, "left");
  taskStart.setAttribute("aria-expanded", "true");
  taskStart.setAttribute("aria-controls", startPanel.id);
  find.addEventListener("input", () => {
    fillStart(list, find.value);
    placeRowMenu(startPanel, taskStart, "left");
  });
  startPanel.addEventListener("keydown", (event) => {
    const rows = [...list.querySelectorAll(".om-start-row")];
    const at = rows.indexOf(document.activeElement);
    if (event.key === "Escape") { event.preventDefault(); closeStart(true); return; }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      (rows[at + 1] || rows[0])?.focus();
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      (at <= 0 ? rows[rows.length - 1] : rows[at - 1])?.focus();
    }
  });
  if (desktopOn() && !deskDocs.length) {
    loadDeskDocs().then(() => { if (startPanel) fillStart(list, find.value); }).catch(() => {});
  }
  find.focus();
  return startPanel;
}

function taskWalk() {
  return [taskStart, ...(taskStrip ? taskStrip.children : [])].filter(Boolean);
}

function onTaskAway(event) {
  const target = event.target instanceof Element ? event.target : null;
  if (startPanel && !(target && (startPanel.contains(target) || startPop?.contains(target)
      || taskStart?.contains(target)))) {
    closeStart(false);
  }
  if (!taskPop) return;
  if (target && (taskPop.contains(target) || taskPopFor?.contains(target))) return;
  closeTaskPop(false);
}

function dropTaskbar() {
  closeTaskPop(false);
  closeStart(false);
  taskBar?.remove();
  taskBar = null;
  taskStart = null;
  taskStrip = null;
  setTaskRoom(0);
}

function mountTaskbar() {
  if (taskBar?.isConnected) return;
  const where = taskbarHost();
  taskBar = el("div", `om-task${where.flow ? "" : " om-task-pinned"}`);
  taskBar.setAttribute("role", "toolbar");
  taskBar.setAttribute("aria-label", "Open Manager windows");
  taskBar.setAttribute("aria-orientation", "horizontal");
  taskBar.addEventListener("keydown", onTaskKey);
  taskStart = el("button", "om-task-item om-task-start");
  taskStart.type = "button";
  taskStart.setAttribute("aria-label", "Start");
  taskStart.setAttribute("aria-haspopup", "menu");
  taskStart.setAttribute("aria-expanded", "false");
  taskStart.tabIndex = -1;
  taskStart.appendChild(omIcon({ kind: "src", url: ICON_BRAND },
                               { name: "Start", cls: "om-task-glyph", img: "om-task-icon" }));
  const startWord = el("span", "om-task-text", "Start");
  startWord.hidden = panelSetting("openManager.startLabel", false) !== true;
  taskStart.classList.toggle("om-task-start-bare", startWord.hidden);
  taskStart.appendChild(startWord);
  taskStart.onclick = () => (startPanel ? closeStart(true) : openStart());
  taskBar.appendChild(taskStart);
  taskStrip = el("div", "om-task-strip");
  taskBar.appendChild(taskStrip);
  taskStrip.addEventListener("wheel", (event) => {
    if (!event.deltaY || event.deltaX) return;
    event.preventDefault();
    taskStrip.scrollLeft += event.deltaY;
  }, { passive: false });
  where.host.insertBefore(taskBar, where.before);
  guardWindowDrags();
  watchTaskbarEdge();
  taskbarShow(!taskbarHides());
  matchStartWidth();
  if (taskWired) return;
  taskWired = true;
  document.addEventListener("pointerdown", onTaskAway, true);
  window.addEventListener("resize", () => { closeTaskPop(false); closeStart(false); });
}

function paintTaskbar() {
  if (!taskbarOn()) { dropTaskbar(); return; }
  const entries = taskEntries();
  const had = taskBar?.contains(document.activeElement)
    ? (document.activeElement.dataset.omTask || document.activeElement.dataset.omGroup || "")
    : "";
  const popped = taskPopFor?.dataset.omGroup || "";
  mountTaskbar();
  taskStrip.replaceChildren(...entries.map((entry) => (entry.members.length > 1
    ? buildTaskGroup(entry)
    : buildTaskOne(entry.members[0]))));
  setTaskRoom(taskBar.getBoundingClientRect().height);
  const front = taskStrip.querySelector('[aria-current="true"]')
    || taskStrip.firstElementChild || taskStart;
  for (const one of taskWalk()) one.tabIndex = one === front ? 0 : -1;
  const wanted = floatTakeFocus();
  const target = (wanted && taskNodeFor(wanted))
    || (had && (taskStrip.querySelector(`[data-om-task="${CSS.escape(had)}"]`)
      || taskStrip.querySelector(`[data-om-group="${CSS.escape(had)}"]`)));
  if (target) {
    for (const one of taskWalk()) one.tabIndex = one === target ? 0 : -1;
    target.focus();
    target.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  if (!popped) return;
  const again = entries.find((one) => one.group === popped && one.members.length > 1);
  const button = again && taskStrip.querySelector(`[data-om-group="${CSS.escape(popped)}"]`);
  if (!again || !button) { closeTaskPop(false); return; }
  taskPopFor = button;
  button.setAttribute("aria-expanded", "true");
  if (taskPop) button.setAttribute("aria-controls", taskPop.id);
  fillTaskPop(again);
}

const DESK_TAB_ID = "om-desk-tab";

const START_ART = {
  Programs: ICON_PROGRAM,
  Settings: ICON_DESKTOP,
  Games: ICON_BRAND,
};

const DESK_STRIP = '[data-testid="topbar-workflow-tabs"] > div > .workflow-tabs-container';

let deskLayer = null;
let deskTab = null;
let deskShown = false;
let deskWatcher = null;
let deskChromeWatcher = null;
let deskRoom = null;
let deskWired = false;
let deskWatchTimer = 0;
let deskSeenPath = "";
let deskArmAt = 0;

const DESK_HASH = "#desktop";

let deskHashBefore = null;

function deskHashOn() {
  try {
    return location.hash === DESK_HASH;
  } catch {
    return false;
  }
}

let deskHashWanted = deskHashOn();

function deskHashAsked() {
  return deskHashWanted || deskHashOn();
}

function setDeskHash(on) {
  try {
    if (on) {
      if (deskHashOn()) return;
      deskHashBefore = location.hash || "";
      history.replaceState(null, "", DESK_HASH);
      return;
    }
    if (!deskHashOn()) return;
    history.replaceState(null, "",
      deskHashBefore || `${location.pathname}${location.search}`);
    deskHashBefore = null;
  } catch {
  }
}
let deskSideRoom = null;

function desktopOn() {
  return deskGates.desktop !== false
    && panelSetting("openManager.desktop", false) === true;
}

function deskStrip() {
  return document.querySelector(DESK_STRIP);
}

function deskCanvasBox() {
  return document.getElementById("graph-canvas-container");
}

function deskFreeBox() {
  return document.querySelector(".graph-canvas-panel") || deskCanvasBox();
}

function deskAsked() {
  const query = new URLSearchParams(window.location.search);
  return query.has("share") || query.has("template");
}

function deskFit() {
  if (!deskLayer) return;
  const box = deskCanvasBox()?.getBoundingClientRect();
  if (!box || !box.width || !box.height) return;
  const floor = taskBar?.isConnected
    ? taskBar.getBoundingClientRect().top
    : window.innerHeight;
  const bottom = Math.min(box.bottom, floor);
  const tall = Math.max(80, bottom - box.top);
  deskLayer.style.left = `${Math.round(box.left)}px`;
  deskLayer.style.top = `${Math.round(box.top)}px`;
  deskLayer.style.width = `${Math.round(box.width)}px`;
  deskLayer.style.height = `${Math.round(tall)}px`;
  const grid = deskLayer.querySelector(".om-desk-grid");
  if (!grid) return;
  const free = deskFreeBox()?.getBoundingClientRect();
  if (!free || !free.width) return;
  const strip = document.querySelector('[data-testid="topbar-workflow-tabs"]')
    ?.getBoundingClientRect();
  const ceiling = strip && strip.height ? Math.max(strip.bottom, box.top) : free.top;
  const gap = (value) => Math.max(10, Math.round(value));
  deskInset.left = gap(free.left - box.left + 10);
  deskInset.top = gap(ceiling - box.top + 10);
  deskInset.right = gap(box.right - free.right + 10);
  deskInset.bottom = gap(Math.min(box.bottom, floor) - free.bottom + 10);
  placeDeskCells();
}

function buildDesk() {
  if (deskLayer?.isConnected) return deskLayer;
  deskLayer = el("div", "om-desk");
  deskLayer.hidden = true;
  deskLayer.classList.remove("om-desk-on");
  const grid = el("div", "om-desk-grid");
  grid.setAttribute("role", "listbox");
  grid.setAttribute("aria-label", "Desktop");
  grid.addEventListener("keydown", onDeskKey);
  const deskTypes = (event) => [...(event.dataTransfer?.types || [])];
  const deskCarried = (event) => {
    const types = deskTypes(event);
    return types.includes(DESK_DRAG_TYPE) || types.includes(FILE_DRAG_TYPE);
  };
  grid.addEventListener("dragover", (event) => {
    if (!deskCarried(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const onto = event.target instanceof Element
      ? event.target.closest(".om-desk-cell[data-om-drop]") : null;
    deskGhost(onto ? null : deskSpotAt(event));
  });
  grid.addEventListener("dragleave", (event) => {
    if (event.target === grid) deskGhost(null);
  });
  grid.addEventListener("drop", (event) => {
    deskGhost(null);
    if (!deskCarried(event)) return;
    let key = event.dataTransfer.getData(DESK_DRAG_TYPE);
    if (!key) {
      try { key = docKey(JSON.parse(event.dataTransfer.getData(FILE_DRAG_TYPE))); }
      catch { return; }
    }
    deskArrangeAt(key, deskSpotAt(event));
  });
  deskLayer.appendChild(grid);
  deskLayer.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    const spot = el("span");
    spot.style.cssText = `position: fixed; left: ${event.clientX}px; top: ${event.clientY}px;`
      + " width: 1px; height: 1px;";
    document.body.appendChild(spot);
    openRowMenu(spot, {
      items: [
        { label: "New note", fn: () => newDeskNote() },
        { label: "New folder", fn: () => newDeskFolder() },
        { label: "New workflow shortcut", fn: () => newDeskFlow() },
        { label: "Trash", fn: () => openWastebasket() },
        { label: "Arrange icons", fn: () => deskArrange() },
        { label: "Desktop settings", fn: () => openDesktopSettings() },
        { label: "Leave the desktop", fn: () => hideDesk() },
      ],
      align: "left",
    });
    setTimeout(() => spot.remove(), 50);
  });
  deskLayer.addEventListener("pointerdown", (event) => {
    if (event.target === deskLayer || event.target === grid) deskSelect(null);
  });
  dropDocsInto(deskLayer, () => DOC_DESKTOP, () => {});
  document.body.appendChild(deskLayer);
  const box = deskCanvasBox();
  if (box && window.ResizeObserver) {
    deskRoom?.disconnect();
    deskRoom = new ResizeObserver(() => deskFit());
    deskRoom.observe(box);
  }
  window.addEventListener("resize", deskFit);
  deskFit();
  return deskLayer;
}

const DESK_FITS = {
  cover: { size: "cover", repeat: "no-repeat", movable: true },
  contain: { size: "contain", repeat: "no-repeat", movable: false },
  centre: { size: "auto", repeat: "no-repeat", movable: true },
  tile: { size: "auto", repeat: "repeat", movable: false },
};

function deskFitNow() {
  return DESK_FITS[String(panelSetting("openManager.desktopFit", "cover"))] || DESK_FITS.cover;
}

function deskFocus() {
  return {
    x: deskNumber("openManager.desktopFocusX", 50, 0, 100),
    y: deskNumber("openManager.desktopFocusY", 50, 0, 100),
  };
}

function deskPosition(fit) {
  if (!fit.movable) return "top left";
  const spot = deskFocus();
  return `${spot.x}% ${spot.y}%`;
}

function deskPaperUrl(asked) {
  const text = String(asked || "").trim();
  if (!text) return "";
  if (/^https?:\/\//i.test(text) || text.startsWith("/")) return safeArt(text);
  return `${API}/wallpaper?name=${encodeURIComponent(text)}`;
}

function deskNumber(key, fallback, low, high) {
  const asked = Number(panelSetting(key, fallback));
  if (!Number.isFinite(asked)) return fallback;
  return Math.max(low, Math.min(high, Math.round(asked)));
}

function applyDeskLook() {
  if (!deskLayer) return;
  const url = deskPaperUrl(panelSetting("openManager.desktopWallpaper", ""));
  const fit = deskFitNow();
  if (url) {
    const test = new Image();
    test.onload = () => {
      if (!deskLayer) return;
      deskLayer.style.backgroundImage = `url("${url}")`;
      deskLayer.style.backgroundSize = fit.size;
      deskLayer.style.backgroundRepeat = fit.repeat;
      deskLayer.style.backgroundPosition = deskPosition(fit);
    };
    test.onerror = () => {
      if (!deskLayer) return;
      deskLayer.style.backgroundImage = "";
      toast("That wallpaper could not be read, so the desktop is plain.", { kind: "warn" });
    };
    test.src = url;
  } else {
    deskLayer.style.backgroundImage = "";
  }
  const grid = deskLayer.querySelector(".om-desk-grid");
  if (!grid) return;
  grid.style.setProperty("--om-desk-icon",
    `${deskNumber("openManager.desktopIconSize", 44, 28, 96)}px`);
  grid.style.setProperty("--om-desk-label",
    `${deskNumber("openManager.desktopLabelSize", 12, 9, 18)}px`);
  placeDeskCells();
}

async function deskPapers() {
  try {
    return await (await api.fetchApi(`${API}/wallpapers`)).json();
  } catch {
    return { ok: false, wallpapers: [] };
  }
}

const DESK_SNAP_SLACK = 4;

const DESK_DRAG_TYPE = "application/x-om-desk";

const DESK_SPRING = 900;

const DESK_GAP = 3;

const DESK_CELL_KEEP = 300;

let deskCarry = null;

let deskCells = {};

const deskInset = { left: 10, top: 10, right: 10, bottom: 10 };

let deskSaveDue = 0;

let deskPinDue = 0;

let deskOffDue = 0;

let deskWriting = Promise.resolve();

let deskPinned = [];

let deskUnpinned = [];

function deskStep(grid) {
  const icon = deskNumber("openManager.desktopIconSize", 44, 28, 96);
  const label = deskNumber("openManager.desktopLabelSize", 12, 9, 18);
  const probe = grid.querySelector(".om-desk-cell");
  const wide = probe?.offsetWidth || icon + 28;
  const tall = probe?.offsetHeight || Math.round(icon + label * 2.7 + 17);
  return { wide: wide + DESK_GAP, tall: tall + DESK_GAP, cell: { wide, tall } };
}

function deskCapacity(grid) {
  const step = deskStep(grid);
  const room = {
    wide: grid.clientWidth - deskInset.left - deskInset.right,
    tall: grid.clientHeight - deskInset.top - deskInset.bottom,
  };
  const cols = Math.max(1, Math.floor((room.wide + DESK_GAP) / step.wide));
  const rows = Math.max(1, Math.floor((room.tall + DESK_GAP) / step.tall));
  return { cols, rows, step: { wide: step.wide, tall: step.tall, cell: step.cell } };
}

function deskTaken(grid, except) {
  const held = new Set();
  for (const cell of grid.querySelectorAll(".om-desk-cell")) {
    if (cell === except) continue;
    const spot = deskCells[cell.dataset.omDeskKey];
    if (spot) held.add(`${spot.col},${spot.row}`);
  }
  return held;
}

function deskFreeSpot(grid, want, except) {
  const { cols, rows } = deskCapacity(grid);
  const held = deskTaken(grid, except);
  const col = Math.max(0, Math.min(cols - 1, want.col));
  const row = Math.max(0, Math.min(rows - 1, want.row));
  if (!held.has(`${col},${row}`)) return { col, row };
  for (let ring = 1; ring < cols + rows; ring += 1) {
    for (let dc = -ring; dc <= ring; dc += 1) {
      for (let dr = -ring; dr <= ring; dr += 1) {
        if (Math.abs(dc) !== ring && Math.abs(dr) !== ring) continue;
        const tryCol = col + dc;
        const tryRow = row + dr;
        if (tryCol < 0 || tryRow < 0 || tryCol >= cols || tryRow >= rows) continue;
        if (!held.has(`${tryCol},${tryRow}`)) return { col: tryCol, row: tryRow };
      }
    }
  }
  return { col, row };
}

function placeDeskCells() {
  if (!deskLayer) return;
  const grid = deskLayer.querySelector(".om-desk-grid");
  if (!grid || !grid.clientWidth || !grid.clientHeight) return;
  const { cols, rows, step } = deskCapacity(grid);
  let next = 0;
  for (const cell of grid.querySelectorAll(".om-desk-cell")) {
    const key = cell.dataset.omDeskKey;
    let spot = deskCells[key];
    if (!spot) {
      spot = deskFreeSpot(grid, { col: Math.floor(next / rows) % cols, row: next % rows }, cell);
      deskCells[key] = spot;
    }
    next += 1;
    cell.style.left = `${deskInset.left + spot.col * step.wide}px`;
    cell.style.top = `${deskInset.top + spot.row * step.tall}px`;
  }
}

function keepDesk(body) {
  deskWriting = deskWriting
    .catch(() => {})
    .then(() => dlPost("/desktop-layout", body).catch(() => {}));
  return deskWriting;
}

function sweepDeskCells() {
  const keys = Object.keys(deskCells);
  if (keys.length <= DESK_CELL_KEEP) return;
  const grid = deskGrid();
  const live = new Set([...(grid ? grid.querySelectorAll(".om-desk-cell") : [])]
    .map((one) => one.dataset.omDeskKey));
  for (const key of keys) {
    if (!live.has(key) && Object.keys(deskCells).length > DESK_CELL_KEEP) {
      delete deskCells[key];
    }
  }
}

function saveDeskCells() {
  clearTimeout(deskSaveDue);
  deskSaveDue = setTimeout(() => {
    sweepDeskCells();
    keepDesk({ cells: deskCells });
  }, 400);
}

function authorColours() {
  return panelSetting("openManager.programColours", true) !== false;
}

function windowColour() {
  return String(panelSetting("openManager.windowColour", "") || "").trim().toLowerCase();
}

function deskLook(key) {
  const row = managerDestinations().find((one) => one.desk?.window === key);
  const author = authorColours() ? row?.desk?.look : null;
  if (author?.tint || author?.from) return author;
  return readColour(windowColour());
}

async function setWindowColour(tint) {
  try {
    await app.extensionManager.setting.set("openManager.windowColour", tint);
  } catch {}
  repaintLooks();
}

function saveProgramsOff() {
  clearTimeout(deskOffDue);
  deskOffDue = setTimeout(() => keepDesk({ off: deskProgramsOff }), 400);
}

async function setProgramOn(id, on) {
  const at = deskProgramsOff.indexOf(id);
  if (on && at >= 0) deskProgramsOff.splice(at, 1);
  if (!on && at < 0) deskProgramsOff.push(id);
  saveProgramsOff();
  await loadPrograms();
  paintDeskIcons();
}

function saveDeskPins() {
  clearTimeout(deskPinDue);
  deskPinDue = setTimeout(() => keepDesk({
    pinned: deskPinned, unpinned: deskUnpinned,
  }), 400);
}

async function loadDeskCells() {
  try {
    const answer = await (await api.fetchApi(`${API}/desktop-layout`)).json();
    if (answer?.cells && typeof answer.cells === "object") deskCells = answer.cells;
    if (Array.isArray(answer?.pinned)) deskPinned = answer.pinned;
    if (Array.isArray(answer?.unpinned)) deskUnpinned = answer.unpinned;
    if (Array.isArray(answer?.off)) deskProgramsOff = answer.off;
  } catch {
    deskCells = {};
  }
  repaintLooks();
}

function repaintLooks() {
  for (const [key, held] of floatPanels) {
    if (held.el.isConnected) held.setLook?.(deskLook(key));
  }
  document.querySelector(".om-deskset-palette")?._omPaint?.();
}

function deskGrid() {
  return deskLayer?.querySelector(".om-desk-grid") || null;
}

function deskCellFor(key) {
  return deskLayer?.querySelector(`[data-om-desk-key="${CSS.escape(key)}"]`) || null;
}

function deskGhost(spot) {
  const grid = deskGrid();
  if (!grid) return;
  let ghost = grid.querySelector(".om-desk-ghost");
  if (!spot) { ghost?.remove(); return; }
  const probe = grid.querySelector(".om-desk-cell");
  const { step } = deskCapacity(grid);
  if (!ghost) {
    ghost = el("div", "om-desk-ghost");
    grid.appendChild(ghost);
  }
  ghost.style.width = `${probe?.offsetWidth || step.wide - 12}px`;
  ghost.style.height = `${probe?.offsetHeight || step.tall - 12}px`;
  ghost.style.left = `${deskInset.left + spot.col * step.wide}px`;
  ghost.style.top = `${deskInset.top + spot.row * step.tall}px`;
}

function deskSpotAt(event) {
  const grid = deskGrid();
  if (!grid) return null;
  const box = grid.getBoundingClientRect();
  const { cols, rows, step } = deskCapacity(grid);
  const left = event.clientX - box.left - (deskCarry ? deskCarry.grabX : step.wide / 2);
  const top = event.clientY - box.top - (deskCarry ? deskCarry.grabY : step.tall / 2);
  const want = {
    col: Math.max(0, Math.min(cols - 1, Math.round((left - deskInset.left) / step.wide))),
    row: Math.max(0, Math.min(rows - 1, Math.round((top - deskInset.top) / step.tall))),
  };
  return deskFreeSpot(grid, want, deskCarry ? deskCellFor(deskCarry.key) : null);
}

function deskArrangeAt(key, spot) {
  if (!key || !spot) return;
  deskCells[key] = spot;
  saveDeskCells();
  placeDeskCells();
}

function dragDeskByPointer(cell, event) {
  const grid = cell.parentElement;
  if (!grid) return;
  const start = { x: event.clientX, y: event.clientY };
  const from = { left: cell.offsetLeft, top: cell.offsetTop };
  const { step, cols, rows } = deskCapacity(grid);
  let moved = false;
  let spot = null;
  try { cell.setPointerCapture(event.pointerId); } catch {}

  const onMove = (move) => {
    const dx = move.clientX - start.x;
    const dy = move.clientY - start.y;
    if (!moved && Math.abs(dx) < DESK_SNAP_SLACK && Math.abs(dy) < DESK_SNAP_SLACK) return;
    if (!moved) {
      moved = true;
      cell.classList.add("om-desk-dragging");
    }
    cell.style.left = `${from.left + dx}px`;
    cell.style.top = `${from.top + dy}px`;
    spot = deskFreeSpot(grid, {
      col: Math.max(0, Math.min(cols - 1,
        Math.round((from.left + dx - deskInset.left) / step.wide))),
      row: Math.max(0, Math.min(rows - 1,
        Math.round((from.top + dy - deskInset.top) / step.tall))),
    }, cell);
    deskGhost(spot);
  };

  const onUp = () => {
    try { cell.releasePointerCapture?.(event.pointerId); } catch {}
    cell.removeEventListener("pointermove", onMove);
    cell.removeEventListener("pointerup", onUp);
    cell.removeEventListener("pointercancel", onUp);
    if (!moved) return;
    cell.classList.remove("om-desk-dragging");
    deskGhost(null);
    if (spot) deskArrangeAt(cell.dataset.omDeskKey, spot);
    else placeDeskCells();
  };

  cell.addEventListener("pointermove", onMove);
  cell.addEventListener("pointerup", onUp);
  cell.addEventListener("pointercancel", onUp);
}

function dragDeskCell(cell) {
  cell.draggable = true;
  cell.dataset.omDrag = "1";
  cell.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    deskSelect(cell);
    if (event.pointerType !== "mouse") dragDeskByPointer(cell, event);
  });
  cell.addEventListener("dragstart", (event) => {
    const box = cell.getBoundingClientRect();
    deskCarry = {
      key: cell.dataset.omDeskKey,
      grabX: event.clientX - box.left,
      grabY: event.clientY - box.top,
    };
    event.dataTransfer.setData(DESK_DRAG_TYPE, cell.dataset.omDeskKey);
    event.dataTransfer.effectAllowed = "move";
    requestAnimationFrame(() => cell.classList.add("om-desk-dragging"));
  });
  cell.addEventListener("dragend", () => {
    cell.classList.remove("om-desk-dragging");
    deskCarry = null;
    deskGhost(null);
  });
}

function deskArrange() {
  deskCells = {};
  placeDeskCells();
  saveDeskCells();
  toast("Icons arranged.", { kind: "ok" });
}

let deskDocs = [];

function docPath(item) {
  return String(item?.path || "");
}

const DOC_KINDS = { folder: "folder", link: "link", file: "file" };

const DOC_WORDS = { folder: "Folder", link: "Shortcut", note: "Note" };

function docWord(item) {
  if (item?.kind === "file") return FILE_WORDS[item.what] || "File";
  return DOC_WORDS[item?.kind] || "Note";
}

function keySafe(text) {
  return encodeURIComponent(String(text || ""))
    .replace(/[!'()*~]/g, (one) => `%${one.charCodeAt(0).toString(16).toUpperCase()}`);
}

function awayFromDocs(item) {
  const place = String(item?.place || "");
  return place && !place.startsWith("docs:") ? place : "";
}

function docKey(item) {
  const kind = DOC_KINDS[item?.kind] || "note";
  if (item.id) return `${kind}:${item.id}`;
  const away = awayFromDocs(item);
  return `${kind}:${keySafe(away ? `${away}/${docPath(item)}` : docPath(item))}`;
}

function placeDoc(place, path, name) {
  return { id: "", place, path, name, kind: "file", what: "text", edits: true,
           size: 0, at: 0, icon: "", colour: "", target: "" };
}

function docReadOnly(doc) {
  return !!awayFromDocs(doc) && !filesWritable();
}

async function readDocText(doc) {
  const away = awayFromDocs(doc);
  const where = away
    ? `${API}/assets/text?${new URLSearchParams({ root: away, path: docPath(doc) })}`
    : `${API}/docs/note?path=${encodeURIComponent(docPath(doc))}`;
  try {
    return await (await api.fetchApi(where)).json();
  } catch {
    return { ok: false, reason: "It could not be read." };
  }
}

function writeDocText(doc, body) {
  const away = awayFromDocs(doc);
  return away
    ? dlPost("/assets/text", { root: away, path: docPath(doc), body })
    : dlPost("/docs/write", { path: docPath(doc), body });
}

const NEW_NOTE_NAME = "New Document";

let noteDrafts = 0;

const NEW_FOLDER_NAME = "New Folder";

function editInPlace(node, was, commit) {
  if (node._omEditing) return;
  node._omEditing = true;
  node.textContent = was;
  node.contentEditable = "plaintext-only";
  if (node.contentEditable !== "plaintext-only") node.contentEditable = "true";
  node.spellcheck = false;
  node.classList.add("om-rename");
  const range = document.createRange();
  range.selectNodeContents(node);
  const picked = window.getSelection();
  picked?.removeAllRanges();
  picked?.addRange(range);
  node.focus();
  let settled = false;
  const finish = async (keep) => {
    if (settled) return;
    settled = true;
    const asked = (node.textContent || "").trim();
    node._omEditing = false;
    node.contentEditable = "false";
    node.classList.remove("om-rename");
    node.removeEventListener("keydown", onKey, true);
    node.removeEventListener("paste", onPaste, true);
    node.removeEventListener("blur", onBlur);
    if (!keep || !asked || asked === was) { node.textContent = was; return; }
    const got = await commit(asked);
    node.textContent = typeof got === "string" && got ? got : was;
  };
  const onKey = (event) => {
    event.stopPropagation();
    if (event.key === "Enter") { event.preventDefault(); finish(true); }
    else if (event.key === "Escape") { event.preventDefault(); finish(false); }
  };
  const onPaste = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const text = (event.clipboardData?.getData("text/plain") || "").replace(/\s+/g, " ");
    document.execCommand("insertText", false, text);
  };
  const onBlur = () => finish(true);
  node.addEventListener("keydown", onKey, true);
  node.addEventListener("paste", onPaste, true);
  node.addEventListener("blur", onBlur);
}

async function docsIn(path) {
  try {
    const answer = await (await api.fetchApi(
      `${API}/docs?path=${encodeURIComponent(path || "")}`)).json();
    return { ok: answer?.ok === true, items: answer?.ok ? (answer.items || []) : [] };
  } catch {
    return { ok: false, items: [] };
  }
}

const DOC_DESKTOP = "Desktop";

const DOC_DOCUMENTS = "Documents";

async function loadDeskDocs() {
  const answer = await docsIn(DOC_DESKTOP);
  if (answer.ok) deskDocs = answer.items;
}

function mediaUrl(name) {
  return `${API}/docs/media?name=${encodeURIComponent(name)}`;
}

function docIconUrl(item) {
  return item?.icon ? `${API}/docs/icon?name=${encodeURIComponent(item.icon)}` : "";
}

const PLAIN_ART = { folder: ICON_FOLDER, link: ICON_FLOW, file: ICON_FILE };

function docThumbUrl(item) {
  if (item?.kind !== "file" || (item.what !== "image" && item.what !== "video")) return "";
  const where = docsWhere(docPath(item));
  return assetThumbUrl({
    name: where.path.split("/").pop(), sub: parentOf(where.path),
    at: item.at, size: item.size,
  }, { root: where.place, edge: 128 });
}

function docArt(item) {
  const plain = { kind: "mask", url: PLAIN_ART[item?.kind] || ICON_NOTE,
                  tint: item?.colour || "" };
  const url = docIconUrl(item) || docThumbUrl(item);
  return url ? { kind: "src", url, fallback: plain } : plain;
}

function applyDocIcon(panel, item) {
  const url = docIconUrl(item);
  if (url) panel.setIcon(url);
  else panel.setMaskIcon(PLAIN_ART[item?.kind] || ICON_NOTE, { tint: item?.colour || "" });
}

function noteSrcOk(raw) {
  const text = String(raw || "");
  if (/^data:image\//i.test(text)) return true;
  if (/^https?:\/\//i.test(text)) return true;
  try {
    const at = new URL(text, window.location.href);
    return at.origin === window.location.origin && at.pathname === `${API}/docs/media`;
  } catch {
    return false;
  }
}

function scrubNoteView(view) {
  for (const node of view.querySelectorAll("script, iframe, object, embed")) node.remove();
  for (const img of view.querySelectorAll("img")) {
    if (!noteSrcOk(img.getAttribute("src"))) img.removeAttribute("src");
  }
  for (const link of view.querySelectorAll("a[href]")) {
    if (/^\s*javascript:/i.test(link.getAttribute("href") || "")) {
      link.removeAttribute("href");
      continue;
    }
    link.target = "_blank";
    link.rel = "noreferrer noopener";
  }
}

async function renderNoteInto(view, text) {
  try {
    const html = await app.extensionManager.renderMarkdownToHtml(String(text || ""));
    view.innerHTML = typeof html === "string" ? html : "";
    scrubNoteView(view);
  } catch {
    view.replaceChildren();
    const pre = el("pre");
    pre.textContent = String(text || "");
    view.appendChild(pre);
  }
}

async function keepNoteImage(file) {
  try {
    const answer = await (await api.fetchApi(`${API}/docs/media`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: await file.arrayBuffer(),
    })).json();
    return answer?.ok ? answer.name : "";
  } catch {
    return "";
  }
}

async function docFind(id) {
  if (!id) return null;
  try {
    const answer = await (await api.fetchApi(
      `${API}/docs/find?id=${encodeURIComponent(id)}`)).json();
    return answer?.ok ? answer.item : null;
  } catch {
    return null;
  }
}

function refreshDocs() {
  loadDeskDocs().then(() => paintDeskIcons()).catch(() => {});
  for (const [key, held] of floatPanels) {
    if (!held.el.isConnected) continue;
    if (key.startsWith("props:") || key === "wastebasket") {
      held._omFill?.();
    }
  }
}

async function renameDoc(item, name) {
  const away = awayFromDocs(item);
  if (away) {
    const done = await dlPost("/files/rename",
                              { place: away, path: docPath(item), name }).catch(() => null);
    if (!done?.ok) {
      notify("Not renamed", done?.reason || "It could not be renamed.");
      return null;
    }
    return { ...item, name: done.name, path: parentOf(docPath(item))
      ? `${parentOf(docPath(item))}/${done.name}` : done.name };
  }
  const answer = await dlPost("/docs/rename", { path: docPath(item), name }).catch(() => null);
  if (!answer?.ok) {
    notify("Not renamed", answer?.reason || "It could not be renamed.");
    return null;
  }
  floatingPanel(docKey(item))?._omDocSet?.(answer.item);
  refreshDocs();
  return answer.item;
}

function draftNote() {
  return { kind: "note", id: "", path: "", name: NEW_NOTE_NAME, size: 0, icon: "",
           at: Math.floor(Date.now() / 1000) };
}

function openNote(item) {
  const key = item.id || docPath(item)
    ? docKey(item)
    : `note:draft-${++noteDrafts}`;
  const held = floatingPanel(key);
  if (held) { held.present(); return held; }
  let doc = item;
  let dirty = false;
  const panel = createFloatingPanel({
    key, title: item.name || "Note", ...windowSize("note"), modal: false,
  });
  applyDocIcon(panel, doc);
  const onDisk = () => !!docPath(doc);

  const wrap = el("div", "om-pad");
  const tools = el("div", "om-pad-tools");
  const state = el("span", "om-pad-state", "");
  const edit = el("textarea", "om-pad-edit");
  edit.spellcheck = true;
  const view = el("div", "om-pad-view");

  const heading = panel.bar.querySelector(".om-float-title");
  heading?.classList.add("om-float-title-name");
  let pressed = null;
  heading?.addEventListener("pointerdown", (event) => {
    pressed = { x: event.clientX, y: event.clientY };
  });
  heading?.addEventListener("click", (event) => {
    const from = pressed;
    pressed = null;
    if (!from) return;
    if (Math.abs(event.clientX - from.x) > 3 || Math.abs(event.clientY - from.y) > 3) return;
    editInPlace(heading, doc.name || "", async (name) => {
      if (!onDisk()) {
        doc = { ...doc, name };
        return name;
      }
      const next = await renameDoc(doc, name);
      if (!next) return "";
      doc = next;
      return doc.name;
    });
  });

  const tabs = tabbedPanel({ remember: "om-note-tab", collapsible: false });
  tabs.root.classList.add("om-pad-tabs");
  let saveDue = 0;
  const sealed = docReadOnly(doc);
  if (sealed) {
    edit.readOnly = true;
    tools.classList.add("om-pad-tools-quiet");
  }

  panel._omDocSet = (next) => {
    doc = next;
    panel.setTitle(next.name || "Note");
    applyDocIcon(panel, next);
  };

  const saveAs = async ({ copy = false } = {}) => {
    const where = await askSaveTarget(parentOf(docPath(doc)), doc.name || NEW_NOTE_NAME);
    if (!where) return false;
    clearTimeout(saveDue);
    const answer = await dlPost("/docs/new",
      { parent: where.parent, name: where.name, body: edit.value }).catch(() => null);
    if (!answer?.ok) {
      state.textContent = answer?.reason || "Not saved";
      notify("Not saved", answer?.reason || "It could not be saved.");
      return false;
    }
    doc = answer.item;
    dirty = false;
    panel.setTitle(doc.name || "Note");
    panel.rekey(`note:${doc.id}`);
    state.textContent = copy ? "Saved as a copy" : "Saved";
    refreshDocs();
    return true;
  };

  let saving = null;

  const save = async () => {
    clearTimeout(saveDue);
    if (saving) return saving;
    saving = saveNow();
    try {
      return await saving;
    } finally {
      saving = null;
    }
  };

  const saveNow = async () => {
    if (!onDisk()) return saveAs();
    state.textContent = "Saving";
    let answer = await writeDocText(doc, edit.value).catch(() => null);
    if (!answer?.ok && !awayFromDocs(doc)) {
      const found = await docFind(doc.id);
      if (found) {
        doc = found;
        panel.setTitle(doc.name || "Note");
        answer = await writeDocText(doc, edit.value).catch(() => null);
      }
    }
    if (answer?.ok) dirty = false;
    state.textContent = answer?.ok ? "Saved" : (answer?.reason || "Not saved");
    return !!answer?.ok;
  };
  wrap.addEventListener("keydown", (event) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key !== "s") return;
    event.preventDefault();
    event.stopPropagation();
    if (sealed && !event.shiftKey) {
      state.textContent = "Read-only";
      return;
    }
    void (event.shiftKey ? saveAs() : save());
  });

  const keep = () => {
    clearTimeout(saveDue);
    if (sealed) {
      state.textContent = "Read-only";
      return;
    }
    dirty = true;
    if (!onDisk()) {
      state.textContent = "Not saved yet";
      return;
    }
    state.textContent = "Editing";
    saveDue = setTimeout(save, 900);
  };

  const wrapSelection = (before, after) => {
    const start = edit.selectionStart;
    const end = edit.selectionEnd;
    const held2 = edit.value.slice(start, end);
    edit.focus();
    document.execCommand("insertText", false, `${before}${held2}${after}`);
    if (!held2) edit.setSelectionRange(start + before.length, start + before.length);
    keep();
  };

  for (const [label, before, after, hint] of [
    ["B", "**", "**", "Bold"],
    ["I", "*", "*", "Italic"],
    ["#", "## ", "", "Heading"],
    ["•", "- ", "", "List item"],
    ["“", "> ", "", "Quote"],
    ["</>", "`", "`", "Code"],
    ["⚓", "[", "](https://)", "Link"],
  ]) {
    const button = el("button", "om-pad-tool", label);
    button.type = "button";
    liveTip(button, () => hint);
    button.onclick = () => wrapSelection(before, after);
    tools.appendChild(button);
  }
  const fileMenu = el("button", "om-pad-tool om-pad-file", "File ▾");
  fileMenu.type = "button";
  fileMenu.onclick = () => openRowMenu(fileMenu, {
    items: [
      { label: "New", fn: () => openNote(draftNote()) },
      !sealed && { label: "Save", fn: () => save() },
      { label: "Save As", fn: () => saveAs({ copy: onDisk() }) },
      { label: "Export", fn: () => (onDisk()
        ? exportDoc(doc)
        : exportText(`${doc.name || NEW_NOTE_NAME}.md`, edit.value)) },
    ].filter(Boolean),
    align: "left",
  });
  tools.insertBefore(el("span", "om-pad-split"), tools.firstChild);
  tools.insertBefore(fileMenu, tools.firstChild);
  tools.appendChild(state);

  edit.oninput = keep;
  edit.onkeydown = (event) => {
    if (!event.ctrlKey && !event.metaKey) return;
    const key2 = event.key.toLowerCase();
    if (key2 === "b") { event.preventDefault(); wrapSelection("**", "**"); }
    else if (key2 === "i") { event.preventDefault(); wrapSelection("*", "*"); }
    else if (key2 === "k") { event.preventDefault(); wrapSelection("[", "](https://)"); }
    else if (key2 === "s") { event.preventDefault(); clearTimeout(saveDue); save(); }
  };

  const carried = (event) => [...(event.clipboardData?.files || [])]
    .filter((one) => one.type.startsWith("image/"));

  edit.addEventListener("paste", async (event) => {
    const images = carried(event);
    if (!images.length) return;
    event.preventDefault();
    event.stopPropagation();
    for (const file of images) {
      state.textContent = "Adding the image";
      const name = await keepNoteImage(file);
      if (!name) { state.textContent = "The image was not kept"; continue; }
      edit.focus();
      document.execCommand("insertText", false, `\n![](${mediaUrl(name)})\n`);
      keep();
    }
  });

  const editor = el("div", "om-pad-pane");
  editor.appendChild(edit);

  tabs.add({
    id: "editor",
    title: "Editor",
    order: 10,
    pane: editor,
    onShow: () => tools.classList.toggle("om-pad-tools-quiet", sealed),
  });
  tabs.add({
    id: "view", title: "View", order: 20, pane: view,
    onShow: () => {
      tools.classList.add("om-pad-tools-quiet");
      renderNoteInto(view, edit.value);
    },
  });
  wrap.appendChild(tools);
  wrap.appendChild(tabs.root);
  panel.body.appendChild(wrap);

  panel.confirmClose = () => (dirty && !onDisk()
    ? confirmAction(`${doc.name} has not been saved`,
                    "Closing this window now loses what is in it.", "Close anyway", true)
    : true);

  if (!onDisk()) {
    tabs.start();
    tabs.show("editor");
    state.textContent = "Not saved yet";
    edit.focus();
    return panel;
  }

  readDocText(doc)
    .then((answer) => {
      if (!answer?.ok) { state.textContent = answer?.reason || "Could not be read"; return; }
      edit.value = answer.body || "";
      if (sealed) state.textContent = "Read-only";
      panel.setTitle(answer.name || doc.name || "Note");
      tabs.start();
      tabs.show(item.openAt === "view" ? "view" : "editor");
      if (item.openAt === "view") renderNoteInto(view, edit.value);
      else edit.focus();
    })
    .catch(() => { state.textContent = "Could not be read"; });

  return panel;
}

const FILE_DRAG_TYPE = "application/x-om-file";

function carriedDoc(event) {
  return [...(event.dataTransfer?.types || [])].includes(FILE_DRAG_TYPE);
}

function carriedHost(event) {
  return [...(event.dataTransfer?.types || [])].includes(FILE_MOVE_TYPE);
}

function docKindOf(name, folder) {
  if (folder) return "folder";
  if (name.endsWith(".omlink")) return "link";
  return name.endsWith(".md") ? "note" : "file";
}

function docsPathOf(place, path) {
  const home = place === "docs:documents" ? DOC_DOCUMENTS : DOC_DESKTOP;
  return path ? `${home}/${path}` : home;
}

function parentOf(path) {
  const at = String(path || "").lastIndexOf("/");
  return at < 0 ? "" : path.slice(0, at);
}

function dragDocFrom(node, item) {
  node.dataset.omDrag = "1";
  node.draggable = true;
  node.addEventListener("dragstart", (event) => {
    event.dataTransfer.setData(FILE_DRAG_TYPE, JSON.stringify({
      path: docPath(item), id: item.id, kind: item.kind, name: item.name,
    }));
    const where = docsWhere(docPath(item));
    event.dataTransfer.setData(FILE_MOVE_TYPE, JSON.stringify({
      place: where.place, path: where.path, name: item.name, kind: item.kind,
    }));
    event.dataTransfer.effectAllowed = "copyMove";
    requestAnimationFrame(() => node.classList.add("om-fold-lift"));
  });
  node.addEventListener("dragend", () => node.classList.remove("om-fold-lift"));
}

async function hostDropInto(event, parent) {
  let sent = null;
  try { sent = JSON.parse(event.dataTransfer.getData(FILE_MOVE_TYPE)); } catch { return; }
  if (!sent?.path) return;
  const into = docsWhere(parent);
  const keep = event.ctrlKey;
  const spot = parent === DOC_DESKTOP ? deskSpotAt(event) : null;
  if (sent.place === into.place
      && (sent.path === into.path || parentOf(sent.path) === into.path)) return;
  const answer = await dlPost(keep ? "/files/copy" : "/files/move",
                              { place: sent.place, path: sent.path,
                                into: into.path, intoPlace: into.place }).catch(() => null);
  if (!answer?.ok) {
    notify(keep ? "Not copied" : "Not moved",
           answer?.reason || (keep ? "It could not be copied." : "It could not be moved."));
    return;
  }
  await loadDeskDocs().catch(() => {});
  if (spot) {
    const landed = deskDocs.find((one) => docPath(one) === `${DOC_DESKTOP}/${answer.name}`);
    if (landed) deskArrangeAt(docKey(landed), spot);
  }
  refreshDocs();
  toast(keep ? `Copied ${sent.name}` : `Moved ${sent.name}`);
}

function dropDocsInto(node, where, after, { spring = null } = {}) {
  node.dataset.omDrop = "1";
  let springDue = 0;
  const restSpring = () => { clearTimeout(springDue); springDue = 0; };
  node.addEventListener("dragover", (event) => {
    if (!carriedDoc(event) && !carriedHost(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = !carriedDoc(event) && event.ctrlKey ? "copy" : "move";
    node.classList.add("om-fold-over");
    if (spring && !springDue) {
      springDue = setTimeout(() => { springDue = 0; spring(); }, DESK_SPRING);
    }
  });
  node.addEventListener("dragleave", () => {
    node.classList.remove("om-fold-over");
    restSpring();
  });
  node.addEventListener("drop", async (event) => {
    if (!carriedDoc(event) && !carriedHost(event)) return;
    event.preventDefault();
    event.stopPropagation();
    node.classList.remove("om-fold-over");
    restSpring();
    if (!carriedDoc(event)) {
      await hostDropInto(event, where());
      after?.();
      return;
    }
    let sent = null;
    try { sent = JSON.parse(event.dataTransfer.getData(FILE_DRAG_TYPE)); } catch { return; }
    if (!sent?.path) return;
    const parent = where();
    if (sent.path === parent || parentOf(sent.path) === parent) return;
    const answer = await dlPost("/docs/move", { path: sent.path, parent }).catch(() => null);
    if (!answer?.ok) { notify("Not moved", answer?.reason || "It could not be moved."); return; }
    const gone = docKey(sent);
    if (parent && deskCells[gone]) {
      delete deskCells[gone];
      saveDeskCells();
    }
    floatingPanel(gone)?._omDocSet?.(answer.item);
    refreshDocs();
    after?.();
  });
}

function sortDocs(items, way) {
  const by = {
    name: (a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
    edited: (a, b) => (b.at || 0) - (a.at || 0),
    size: (a, b) => (b.size || 0) - (a.size || 0),
  }[way] || (() => 0);
  return [...items].sort((a, b) =>
    (a.kind !== "folder") - (b.kind !== "folder") || by(a, b));
}

function docsWhere(path) {
  const whole = String(path || "");
  const at = whole.indexOf("/");
  const home = (at < 0 ? whole : whole.slice(0, at)).toLowerCase();
  return {
    place: home === DOC_DOCUMENTS.toLowerCase() ? "docs:documents" : "docs:desktop",
    path: at < 0 ? "" : whole.slice(at + 1),
  };
}

function openFolder(item) {
  const where = docsWhere(docPath(item));
  return openFileBrowser(where.place, where.path);
}

function flowStore() {
  try {
    return app.extensionManager?.workflow || null;
  } catch {
    return null;
  }
}

function flowList() {
  const store = flowStore();
  const held = store?.workflows;
  const all = Array.isArray(held) ? held : (held?.value || []);
  return [...all].filter((one) => one && !one.isTemporary);
}

function flowMissing(target) {
  const text = String(target || "");
  if (!text) return true;
  const store = flowStore();
  const held = store?.workflows;
  const all = Array.isArray(held) ? held : (held?.value || []);
  if (!all.length) return false;
  return !store.getWorkflowByPath?.(text);
}

async function flowByPath(target, { fresh = false } = {}) {
  const store = flowStore();
  if (!store) return null;
  let found = store.getWorkflowByPath?.(target) || null;
  if (!found) {
    await store.loadWorkflows?.().catch(() => {});
    found = store.getWorkflowByPath?.(target) || null;
  }
  if (!found || fresh) {
    await store.syncWorkflows?.().catch(() => {});
    found = store.getWorkflowByPath?.(target) || found;
  }
  return found;
}

async function openFlowLink(item) {
  const target = String(item?.target || "");
  if (!target) {
    notify("Nothing to open", "This shortcut names no workflow.");
    return false;
  }
  const store = flowStore();
  const flow = await flowByPath(target);
  if (!flow) {
    notify("Workflow not found", `${target} is no longer in this ComfyUI.`);
    return false;
  }
  if (store?.activeWorkflow?.path === flow.path) {
    hideDesk();
    return true;
  }
  try {
    if (!flow.isLoaded) await flow.load();
    await app.loadGraphData(flow.activeState, true, true, flow,
                            { checkForRerouteMigration: false });
  } catch (error) {
    notify("Not opened", `${target} could not be opened: ${error.message}`);
    return false;
  }
  hideDesk();
  return true;
}

async function relinkFlow(item, after) {
  const chosen = await askWorkflow();
  if (!chosen) return;
  const answer = await dlPost("/docs/link/target",
                              { path: docPath(item), target: chosen.path || chosen })
    .catch(() => null);
  if (!answer?.ok) {
    notify("Not pointed", answer?.reason || "The shortcut could not be pointed at that.");
    return;
  }
  floatingPanel(docKey(item))?._omDocSet?.(answer.item);
  refreshDocs();
  after?.();
}

function openDoc(item) {
  if (item.kind === "folder") return openFolder(item);
  if (item.kind === "link") return openFlowLink(item);
  if (item.kind === "file" && !item.edits) return openDocFile(item);
  return openNote(item);
}

function openDocFile(item) {
  const kind = SHOWN_KINDS[item.what] || "";
  if (!kind) {
    notify(item.name, `There is no viewer here for ${docWord(item).toLowerCase()} files.`);
    return null;
  }
  const where = docsWhere(docPath(item));
  const sub = parentOf(where.path);
  const beside = deskDocs.some((one) => docPath(one) === docPath(item))
    ? deskDocs.filter((one) => SHOWN_KINDS[one.what] === kind)
    : [item];
  runProgramById(kind === "still" ? "viewer" : "player", {
    items: beside.map((one) => ({
      name: docsWhere(docPath(one)).path.split("/").pop(),
      sub, kind, size: one.size, at: one.at,
    })),
    name: where.path.split("/").pop(),
    root: where.place,
  });
  return null;
}

function askWorkflow() {
  return new Promise((settle) => {
    const backdrop = el("div", "om-backdrop");
    const box = el("div", "om-note om-note-wide om-save");
    box.appendChild(el("div", "om-note-title", "Which workflow?"));
    const find = el("input", "om-search");
    find.placeholder = "Filter by name";
    find.spellcheck = false;
    const list = el("div", "om-fold-list om-save-list");
    const foot = el("div", "om-note-foot");
    const cancel = el("button", "om-btn", "Cancel");
    const add = el("button", "om-btn om-go", "Choose");
    add.disabled = true;
    foot.appendChild(cancel);
    foot.appendChild(add);
    box.appendChild(find);
    box.appendChild(list);
    box.appendChild(foot);
    backdrop.appendChild(box);
    document.body.appendChild(backdrop);

    let chosen = null;
    const done = (answer) => { backdrop.remove(); settle(answer); };

    const fill = () => {
      const want = find.value.trim().toLowerCase();
      const all = flowList()
        .filter((one) => !want || String(one.filename || one.path).toLowerCase().includes(want))
        .sort((a, b) => String(a.filename || a.path).toLowerCase()
          .localeCompare(String(b.filename || b.path).toLowerCase()));
      if (!all.length) {
        list.replaceChildren(el("div", "om-fold-empty", "No saved workflows match"));
        return;
      }
      list.replaceChildren(...all.slice(0, 400).map((one) => {
        const row = el("div", "om-fold-row");
        row.appendChild(omIcon({ kind: "mask", url: ICON_FLOW },
                               { name: one.filename, cls: "om-fold-art", img: "om-fold-img" }));
        row.appendChild(el("span", "om-fold-name", one.filename || one.path));
        const where = String(one.directory || "").replace(/^workflows\/?/, "");
        if (where) row.appendChild(el("span", "om-fold-meta", where));
        row.onclick = () => {
          chosen = one;
          add.disabled = false;
          for (const other of list.querySelectorAll(".om-fold-row")) {
            other.classList.toggle("om-fold-row-on", other === row);
          }
        };
        row.ondblclick = () => { chosen = one; add.click(); };
        return row;
      }));
    };

    cancel.onclick = () => done(null);
    add.onclick = () => (chosen ? done(chosen) : find.focus());
    find.addEventListener("input", fill);
    find.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && chosen) { event.preventDefault(); add.click(); }
    });
    closeOn(backdrop, () => done(null));
    Promise.resolve(flowStore()?.loadWorkflows?.()).catch(() => {}).then(() => {
      if (backdrop.isConnected) fill();
    });
    fill();
    find.focus();
  });
}

async function makeFlowLink(parent, flow) {
  const answer = await dlPost("/docs/link", {
    parent: parent || DOC_DESKTOP, name: flow.filename || flow.key || "Workflow",
    target: flow.path,
  }).catch(() => null);
  if (!answer?.ok) {
    notify("Not created", answer?.reason || "The shortcut could not be created.");
    return null;
  }
  refreshDocs();
  return answer.item;
}

async function newDeskFlow() {
  const flow = await askWorkflow();
  if (!flow) return;
  const made = await makeFlowLink("", flow);
  if (!made) return;
  await loadDeskDocs();
  paintDeskIcons();
  const cell = deskCellFor(docKey(made));
  if (cell) deskSelect(cell);
}

function askSaveTarget(startAt, startName) {
  return new Promise((settle) => {
    const backdrop = el("div", "om-backdrop");
    const box = el("div", "om-note om-note-wide om-save");
    box.appendChild(el("div", "om-note-title", "Save as"));
    const trail = el("div", "om-save-trail");
    const list = el("div", "om-fold-list om-save-list");
    const field = el("input", "om-search");
    field.value = startName || NEW_NOTE_NAME;
    field.spellcheck = false;
    const foot = el("div", "om-note-foot");
    const folder = el("button", "om-btn", "New folder");
    const cancel = el("button", "om-btn", "Cancel");
    const keep = el("button", "om-btn om-go", "Save");
    foot.appendChild(folder);
    foot.appendChild(cancel);
    foot.appendChild(keep);
    box.appendChild(trail);
    box.appendChild(list);
    box.appendChild(field);
    box.appendChild(foot);
    backdrop.appendChild(box);
    document.body.appendChild(backdrop);

    let here = String(startAt || "");
    let chosen = "";

    const done = (answer) => { backdrop.remove(); settle(answer); };

    const paintTrail = () => {
      const steps = here ? here.split("/") : [];
      trail.replaceChildren();
      const step = (label, to) => {
        const hop = el("button", "om-save-step", label);
        hop.onclick = () => { here = to; chosen = ""; fill(); };
        trail.appendChild(hop);
      };
      step("Desktop", "");
      let walked = "";
      for (const part of steps) {
        walked = walked ? `${walked}/${part}` : part;
        trail.appendChild(el("span", "om-save-sep", "›"));
        step(part.split("~")[0], walked);
      }
    };

    const fill = async () => {
      paintTrail();
      const answer = await docsIn(here);
      if (!backdrop.isConnected) return;
      if (!answer.ok) { here = ""; fill(); return; }
      const rows = sortDocs(answer.items, "name").map((one) => {
        const row = el("div", "om-fold-row");
        if (one.kind !== "folder") row.classList.add("om-save-dim");
        row.appendChild(omIcon(docArt(one),
                               { name: one.name, cls: "om-fold-art", img: "om-fold-img" }));
        row.appendChild(el("span", "om-fold-name", one.name));
        if (one.kind === "folder") {
          row.onclick = () => {
            chosen = docPath(one);
            for (const other of list.querySelectorAll(".om-fold-row")) {
              other.classList.toggle("om-fold-row-on", other === row);
            }
          };
          row.ondblclick = () => { here = docPath(one); chosen = ""; fill(); };
        } else {
          row.onclick = () => { field.value = one.name; };
        }
        return row;
      });
      list.replaceChildren(...rows);
    };

    folder.onclick = async () => {
      const answer = await dlPost("/docs/folder", { parent: here, name: NEW_FOLDER_NAME })
        .catch(() => null);
      if (!answer?.ok) {
        notify("Not created", answer?.reason || "It could not be created.");
        return;
      }
      here = docPath(answer.item);
      chosen = "";
      refreshDocs();
      fill();
    };
    cancel.onclick = () => done(null);
    keep.onclick = () => {
      const name = field.value.trim();
      if (!name) { field.focus(); return; }
      done({ parent: chosen || here, name });
    };
    field.addEventListener("keydown", (event) => {
      if (event.key === "Enter") { event.preventDefault(); keep.click(); }
    });
    closeOn(backdrop, () => done(null));
    fill();
    field.focus();
    field.select();
  });
}

async function trashHolds() {
  try {
    const answer = await (await api.fetchApi(`${API}/docs/trash`)).json();
    return answer?.ok ? (answer.items || []) : [];
  } catch {
    return [];
  }
}

async function emptyWastebasket() {
  const items = await trashHolds();
  if (!items.length) {
    toast("The Trash is already empty.", { kind: "ok" });
    return false;
  }
  const sure = await confirmAction("Empty the Trash",
    `${countNote(items.length, "item")} will be deleted from disk. This cannot be undone.`,
    "Empty", true);
  if (!sure) return false;
  const answer = await dlPost("/docs/trash/empty", {}).catch(() => null);
  if (!answer?.ok) {
    notify("Not emptied", answer?.reason || "It could not be emptied.");
    return false;
  }
  refreshDocs();
  return true;
}

function openWastebasket() {
  const key = "wastebasket";
  const held = floatingPanel(key);
  if (held) { held.present(); return held; }
  const panel = createFloatingPanel({
    key, title: "Trash", ...windowSize("folder"), modal: false,
  });
  panel.setMaskIcon(ICON_BIN);

  const list = el("div", "om-fold-list");
  const drain = el("button", "om-btn om-danger", "Empty Trash");
  panel.tools.appendChild(drain);

  const fill = async () => {
    const items = await trashHolds();
    if (!panel.el.isConnected) return;
    drain.disabled = !items.length;
    panel.setBadge(items.length ? countNote(items.length, "item") : "");
    if (!items.length) {
      list.replaceChildren();
      return;
    }
    list.replaceChildren(...items.map((one) => buildTrashRow(one, fill)));
  };

  panel._omFill = fill;

  drain.onclick = () => emptyWastebasket().then((done) => { if (done) fill(); });

  binDropInto(panel.body, fill);

  panel.body.appendChild(list);
  fill();
  return panel;
}

function buildTrashRow(entry, after) {
  const row = el("div", "om-trash-row");
  const art = el("span", "om-fold-art");
  const url = entry.kind === "folder" ? ICON_FOLDER : ICON_NOTE;
  art.style.setProperty("-webkit-mask", `center / contain no-repeat url("${url}")`);
  art.style.setProperty("mask", `center / contain no-repeat url("${url}")`);
  row.appendChild(art);
  row.appendChild(el("span", "om-fold-name", entry.name));
  row.appendChild(el("span", "om-trash-when", whenText(new Date(entry.at * 1000))));
  const back = el("button", "om-btn", "Restore");
  back.onclick = async () => {
    back.disabled = true;
    const answer = await dlPost("/docs/restore", { token: entry.token }).catch(() => null);
    if (!answer?.ok) {
      back.disabled = false;
      notify("Not restored", answer?.reason || "It could not be restored.");
      return;
    }
    refreshDocs();
    after?.();
  };
  row.appendChild(back);
  return row;
}

const ICON_TYPES = ".ico,.png,.webp,image/x-icon,image/vnd.microsoft.icon,image/png,image/webp";

function propsKey(item) {
  return `props:${docKey(item)}`;
}

function propsRow(label, value) {
  const row = el("div", "om-props-row");
  row.appendChild(el("span", "om-props-key", label));
  row.appendChild(el("span", "om-props-value", value));
  return row;
}

async function docMeasure(path) {
  try {
    const answer = await (await api.fetchApi(
      `${API}/docs/measure?path=${encodeURIComponent(path || "")}`)).json();
    return answer?.ok ? answer : null;
  } catch {
    return null;
  }
}

function drawable(file) {
  return new Promise((settle) => {
    const url = URL.createObjectURL(file);
    const probe = new Image();
    probe.onload = () => { URL.revokeObjectURL(url); settle(true); };
    probe.onerror = () => { URL.revokeObjectURL(url); settle(false); };
    probe.src = url;
  });
}

function openDocProps(item) {
  const key = propsKey(item);
  const held = floatingPanel(key);
  if (held) { held.present(); return held; }
  let doc = item;
  const panel = createFloatingPanel({
    key, title: `${item.name} properties`, ...windowSize("props"), modal: false,
  });
  applyDocIcon(panel, doc);

  const wrap = el("div", "om-props");
  const head = el("div", "om-props-head");
  const face = el("div", "om-props-face");
  const named = el("div", "om-props-name", doc.name);
  head.appendChild(face);
  head.appendChild(named);
  const rows = el("div", "om-props-rows");
  const tools = el("div", "om-props-tools");
  wrap.appendChild(head);
  wrap.appendChild(rows);
  wrap.appendChild(tools);
  panel.body.appendChild(wrap);

  const shades = el("div", "om-props-shades");
  const swatches = el("span", "om-tab-swatches");
  shades.appendChild(el("span", "om-props-key", "Colour"));
  shades.appendChild(swatches);
  wrap.insertBefore(shades, tools);

  const paintShades = () => {
    swatches.replaceChildren();
    const plain = el("button", "om-tab-swatch om-props-plain");
    plain.type = "button";
    plain.title = "Default";
    plain.classList.toggle("om-tab-swatch-on", !doc.colour);
    plain.onclick = () => tintDoc("");
    swatches.appendChild(plain);
    for (const [name, value] of TAB_TINTS) {
      const dot = el("button", "om-tab-swatch");
      dot.type = "button";
      dot.style.background = value;
      dot.title = name;
      dot.classList.toggle("om-tab-swatch-on", doc.colour === value);
      dot.onclick = () => tintDoc(value);
      swatches.appendChild(dot);
    }
    const custom = el("button", "om-tab-swatch om-tab-swatch-pick", "+");
    custom.type = "button";
    custom.title = "Custom colour";
    custom.onclick = () => {
      const field = el("input");
      field.type = "color";
      field.value = doc.colour || "#58a6ff";
      field.style.cssText = "position: fixed; left: -100px; top: 0; opacity: 0;";
      document.body.appendChild(field);
      field.addEventListener("change", () => {
        const picked = field.value;
        field.remove();
        tintDoc(picked);
      });
      field.click();
    };
    swatches.appendChild(custom);
  };

  const tintDoc = async (colour) => {
    const answer = await dlPost("/docs/colour", { path: docPath(doc), colour }).catch(() => null);
    if (!answer?.ok) {
      notify("Not coloured", answer?.reason || "The colour could not be kept.");
      return;
    }
    took(answer.item);
  };

  const pickIcon = el("button", "om-btn", "Choose icon");
  const dropIcon = el("button", "om-btn", "Use the plain folder");
  const file = el("input");
  file.type = "file";
  file.accept = ICON_TYPES;
  file.hidden = true;
  tools.appendChild(pickIcon);
  tools.appendChild(dropIcon);
  tools.appendChild(file);

  const paint = () => {
    panel.setTitle(`${doc.name} properties`);
    applyDocIcon(panel, doc);
    named.textContent = doc.name;
    face.replaceChildren(omIcon(docArt(doc),
                                { name: doc.name, cls: "om-props-art", img: "om-props-img" }));
    const where = parentOf(docPath(doc));
    rows.replaceChildren(
      propsRow("Kind", docWord(doc)),
      propsRow("Where", where ? where.split("/").map((one) => one.split("~")[0]).join(" / ")
                              : "Desktop"),
      propsRow("Edited", whenText(new Date(doc.at * 1000))),
      propsRow("Id", doc.id || "none"),
    );
    if (doc.colour) rows.appendChild(propsRow("Colour", doc.colour));
    if (doc.kind === "folder") rows.appendChild(propsRow("Holds", countNote(doc.holds || 0, "item")));
    else if (doc.kind !== "link") rows.appendChild(propsRow("Size", bytesText(doc.size)));
    if (doc.kind === "link") {
      rows.appendChild(propsRow("Opens", doc.target || "nothing"));
      const found = propsRow("Workflow", "looking");
      rows.appendChild(found);
      const said = found.querySelector(".om-props-value");
      flowByPath(doc.target).then((flow) => {
        if (!panel.el.isConnected) return;
        said.textContent = flow ? "here" : "no longer in this ComfyUI";
        found.classList.toggle("om-props-gone", !flow);
      });
    } else {
      const total = propsRow(doc.kind === "folder" ? "Total" : "Words", "counting");
      rows.appendChild(total);
      const spot = total.querySelector(".om-props-value");
      docMeasure(docPath(doc)).then((got) => {
        if (!panel.el.isConnected) return;
        if (!got) { spot.textContent = "could not be counted"; return; }
        spot.textContent = doc.kind === "folder"
          ? `${bytesText(got.bytes)} in ${countNote(got.files, "file")}`
            + `${got.folders ? `, ${countNote(got.folders, "folder")}` : ""}`
            + `${got.capped ? ", partial count" : ""}`
          : `${got.words} in ${countNote(got.lines, "line")}`;
      });
    }
    const folderish = doc.kind === "folder";
    pickIcon.hidden = !folderish;
    dropIcon.hidden = !folderish || !doc.icon;
    paintShades();
    shades.classList.toggle("om-props-muted", !!doc.icon);
    shades.title = doc.icon
      ? "A colour does not show while the folder has its own icon."
      : "";
  };

  const took = (next) => {
    doc = next;
    floatingPanel(docKey(next))?._omDocSet?.(next);
    refreshDocs();
    paint();
  };

  named.addEventListener("click", () => {
    editInPlace(named, doc.name || "", async (name) => {
      const next = await renameDoc(doc, name);
      if (!next) return "";
      doc = next;
      paint();
      return doc.name;
    });
  });

  pickIcon.onclick = () => file.click();
  file.onchange = async () => {
    const chosen = file.files?.[0];
    file.value = "";
    if (!chosen) return;
    if (!await drawable(chosen)) {
      notify("Not kept", "That file could not be decoded as an image, so it was not kept.");
      return;
    }
    let answer = null;
    try {
      answer = await (await api.fetchApi(
        `${API}/docs/icon?path=${encodeURIComponent(docPath(doc))}`,
        { method: "POST", headers: { "Content-Type": "application/octet-stream" },
          body: await chosen.arrayBuffer() },
      )).json();
    } catch {
      answer = null;
    }
    if (!answer?.ok) {
      notify("Not kept", answer?.reason || "That icon could not be kept.");
      return;
    }
    took(answer.item);
  };
  dropIcon.onclick = async () => {
    const answer = await dlPost("/docs/icon/clear", { path: docPath(doc) }).catch(() => null);
    if (!answer?.ok) {
      notify("Not cleared", answer?.reason || "The icon could not be cleared.");
      return;
    }
    took(answer.item);
  };

  panel._omDocSet = (next) => { doc = next; paint(); };
  panel._omFill = async () => {
    const found = await docFind(doc.id);
    if (!panel.el.isConnected) return;
    if (!found) { panel.destroy(); return; }
    doc = found;
    paint();
  };

  paint();
  return panel;
}

function undoToast(message, label, fn) {
  const node = el("div", "om-toast om-toast-ok");
  node.appendChild(el("span", "om-toast-text", message));
  const button = el("button", "om-btn om-go", label);
  button.onclick = async () => {
    button.disabled = true;
    await fn();
    node.remove();
  };
  node.appendChild(button);
  const timer = setTimeout(() => node.remove(), 9000);
  toastShut(node, () => clearTimeout(timer));
  toastHost().appendChild(node);
}

function pullDown(url, name) {
  const link = el("a");
  link.href = url;
  link.download = name || "";
  link.rel = "noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function exportDoc(item) {
  pullDown(`${API}/docs/export?path=${encodeURIComponent(docPath(item))}`);
}

function exportText(name, text) {
  const blob = new Blob([String(text ?? "")], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  pullDown(url, name);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function renameDocIn(node, item, after) {
  const label = node?.querySelector(".om-fold-name, .om-desk-name");
  if (!label) return;
  editInPlace(label, item.name || "", async (name) => {
    const next = await renameDoc(item, name);
    after?.();
    return next?.name || "";
  });
}

async function removeDoc(item, after) {
  const answer = await dlPost("/docs/remove", { path: docPath(item) }).catch(() => null);
  if (!answer?.ok) {
    notify("Not deleted", answer?.reason || "It could not be deleted.");
    return;
  }
  floatingPanel(docKey(item))?.destroy?.();
  if (deskCells[docKey(item)]) {
    delete deskCells[docKey(item)];
    saveDeskCells();
  }
  refreshDocs();
  after?.();
  undoToast(`${item.name} moved to the Trash.`, "Undo", async () => {
    await dlPost("/docs/restore", { token: answer.token }).catch(() => {});
    refreshDocs();
    after?.();
  });
}

const OPEN_WORDS = { folder: "Open folder", link: "Open workflow", file: "Open" };

function docMenuItems(item, after, node) {
  return [
    { label: OPEN_WORDS[item.kind] || "Open note", fn: () => openDoc(item) },
    item.kind === "note" || (item.kind === "file" && item.edits)
      ? { label: "Open in View", fn: () => openDoc({ ...item, openAt: "view" }) }
      : null,
    { label: "Rename", fn: () => renameDocIn(node, item, after) },
    item.kind === "link"
      ? { label: flowMissing(item.target) ? "Locate workflow" : "Point at another workflow",
          fn: () => relinkFlow(item, after) }
      : null,
    item.kind === "link" ? null : { label: "Export", fn: () => exportDoc(item) },
    { label: "Properties", fn: () => openDocProps(item) },
    { label: "Delete", danger: true, fn: () => removeDoc(item, after) },
  ].filter(Boolean);
}

async function newDeskNote() {
  const answer = await dlPost("/docs/new", { parent: DOC_DESKTOP, name: NEW_NOTE_NAME })
    .catch(() => null);
  if (!answer?.ok) {
    notify("Not created", answer?.reason || "It could not be created.");
    return;
  }
  await loadDeskDocs();
  paintDeskIcons();
  openNote(answer.item);
}

async function newDeskFolder() {
  const answer = await dlPost("/docs/folder", { parent: DOC_DESKTOP, name: NEW_FOLDER_NAME })
    .catch(() => null);
  if (!answer?.ok) {
    notify("Not created", answer?.reason || "It could not be created.");
    return;
  }
  await loadDeskDocs();
  paintDeskIcons();
  const cell = deskLayer?.querySelector(
    `[data-om-desk-key="${CSS.escape(docKey(answer.item))}"]`);
  if (cell) {
    deskSelect(cell);
    renameDocIn(cell, answer.item, async () => { await loadDeskDocs(); paintDeskIcons(); });
  }
}

function buildDocCell(item) {
  const cell = el("div", "om-desk-cell");
  cell._omDoc = item;
  cell.dataset.omDeskKey = docKey(item);
  cell.dataset.omDeskWindow = docKey(item);
  cell.tabIndex = -1;
  cell.setAttribute("role", "option");
  cell.setAttribute("aria-selected", "false");
  cell.appendChild(omIcon(docArt(item),
                          { name: item.name, cls: "om-desk-art", img: "om-desk-img" }));
  cell.appendChild(el("span", "om-desk-name", item.name));
  cell.appendChild(el("span", "om-desk-live"));
  if (item.kind === "link") cell.dataset.omFlowTarget = String(item.target || "");
  liveTip(cell, () => ({
    lead: item.name,
    facts: [
      ["Kind", docWord(item)],
      item.kind === "folder"
        ? ["Holds", `${item.holds} item${item.holds === 1 ? "" : "s"}`]
        : (item.kind === "link"
          ? ["Opens", String(item.target || "").replace(/^workflows\//, "")]
          : ["Size", bytesText(item.size)]),
      ["Edited", whenText(new Date(item.at * 1000))],
    ],
    lines: item.kind === "link" && flowMissing(item.target)
      ? ["That workflow is not in this ComfyUI any more."]
      : undefined,
  }));
  cell.onclick = () => deskSelect(cell);
  cell.ondblclick = () => openDoc(item);
  cell.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    event.stopPropagation();
    deskSelect(cell);
    openRowMenu(cell, { items: docMenuItems(item, refreshDocs, cell), align: "left" });
  });
  if (item.kind === "folder") {
    dropDocsInto(cell, () => docPath(item), refreshDocs, { spring: () => openFolder(item) });
  }
  dragDocFrom(cell, item);
  dragDeskCell(cell);
  return cell;
}

const PROGRAM_ID = /^[a-z0-9][a-z0-9-]{0,31}$/;

function packPinnable(id) {
  return installedIndex.has(foldId(id));
}

function deskRowFor(key) {
  const found = managerDestinations().find((one) => one.key === key);
  if (found) {
    return found.desk ? found : { ...found, desk: {
      at: 50, label: found.short || found.label, art: ICON_BRAND, kind: "src",
      window: `panel:${found.key}`,
    } };
  }
  if (key.startsWith("pack:")) {
    const id = key.slice(5);
    if (!id || !packPinnable(id)) return null;
    return {
      key, kind: "program", label: id, hint: `The page for ${id}`,
      desk: { at: 60, label: id, art: ICON_BRAND, kind: "src", window: key },
      open: () => openPack(id),
    };
  }
  const pinned = filePinParts(key);
  if (pinned) {
    const where = pinned.place.split(":")[1] || pinned.place;
    const label = pinned.path ? pinned.path.split("/").pop() : where;
    return {
      key, kind: "program", label,
      hint: `${where}${pinned.path ? `/${pinned.path}` : ""}`,
      revisit: true,
      desk: { at: 70, label, art: ICON_FOLDER, kind: "mask", window: "files" },
      open: () => openFileBrowser(pinned.place, pinned.path),
    };
  }
  if (!programOff(key) && PROGRAM_ID.test(key)) {
    return {
      key, kind: "program", label: key, gone: true,
      hint: `${key} is not in this install any more.`,
      desk: { at: 60, label: key, art: ICON_PROGRAM, kind: "mask", window: "" },
      open: () => notify("Not installed",
        `The program ${key} is not in this install any more.`),
    };
  }
  return null;
}

function deskRows() {
  const built = managerDestinations()
    .filter((row) => row.desk && (!row.available || row.available()))
    .filter((row) => !row.desk.off || deskPinned.includes(row.key))
    .filter((row) => !deskUnpinned.includes(row.key))
    .sort((a, b) => a.desk.at - b.desk.at);
  const seen = new Set(built.map((one) => one.key));
  for (const key of deskPinned) {
    if (seen.has(key)) continue;
    const row = deskRowFor(key);
    if (!row) continue;
    seen.add(key);
    built.push(row);
  }
  return built;
}

function pinnedOn(key) {
  return deskRows().some((one) => one.key === key);
}

function pinDesk(key) {
  const away = deskUnpinned.indexOf(key);
  if (away >= 0) deskUnpinned.splice(away, 1);
  else if (!deskPinned.includes(key)) deskPinned.push(key);
  const spot = deskCells[key];
  const grid = deskGrid();
  if (spot && grid && deskTaken(grid, null).has(`${spot.col},${spot.row}`)) {
    delete deskCells[key];
    saveDeskCells();
  }
  saveDeskPins();
  paintDeskIcons();
}

function unpinDesk(key) {
  const held = deskPinned.indexOf(key);
  if (held >= 0) deskPinned.splice(held, 1);
  else if (!deskUnpinned.includes(key)) deskUnpinned.push(key);
  if (deskCells[key]) {
    delete deskCells[key];
    saveDeskCells();
  }
  saveDeskPins();
  paintDeskIcons();
}

function deskOpenRow(row) {
  if (!row) return;
  const held = row.desk?.window ? floatingPanel(row.desk.window) : null;
  if (held && !row.revisit) { held.present(); return; }
  row.open?.();
}

function deskSelect(cell) {
  if (!deskLayer) return;
  for (const one of deskLayer.querySelectorAll(".om-desk-cell")) {
    const want = one === cell;
    one.classList.toggle("om-desk-cell-on", want);
    one.tabIndex = want ? 0 : -1;
    one.setAttribute("aria-selected", want ? "true" : "false");
  }
}

function paintDeskLive() {
  if (!deskLayer) return;
  for (const cell of deskLayer.querySelectorAll(".om-desk-cell")) {
    const held = floatingPanel(cell.dataset.omDeskWindow);
    cell.classList.toggle("om-desk-cell-live", !!held);
    if (!Object.hasOwn(cell.dataset, "omFlowTarget")) continue;
    cell.classList.toggle("om-desk-cell-lost", flowMissing(cell.dataset.omFlowTarget));
  }
}

function onDeskKey(event) {
  const cell = event.target instanceof Element
    ? event.target.closest(".om-desk-cell") : null;
  if (!cell || !deskLayer) return;
  const cells = [...deskLayer.querySelectorAll(".om-desk-cell")];
  const at = cells.indexOf(cell);
  const go = (to) => {
    const next = cells[Math.max(0, Math.min(cells.length - 1, to))];
    if (!next) return;
    deskSelect(next);
    next.focus();
  };
  if (event.key === "ArrowDown" || event.key === "ArrowRight") {
    event.preventDefault();
    go(at + 1);
  } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
    event.preventDefault();
    go(at - 1);
  } else if (event.key === "Home") {
    event.preventDefault();
    go(0);
  } else if (event.key === "End") {
    event.preventDefault();
    go(cells.length - 1);
  } else if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    if (cell._omDoc) openDoc(cell._omDoc);
    else if (cell._omOpen) cell._omOpen();
    else if (cell._omRow) deskOpenRow(cell._omRow);
  } else if (event.key === "F2" && cell._omDoc) {
    event.preventDefault();
    renameDocIn(cell, cell._omDoc, refreshDocs);
  } else if (event.key === "Delete" && cell._omDoc) {
    event.preventDefault();
    removeDoc(cell._omDoc, refreshDocs);
  }
}

function buildDeskCell(row) {
  const cell = el("div", "om-desk-cell");
  cell._omRow = row;
  cell.dataset.omDeskKey = row.key;
  cell.dataset.omDeskWindow = row.desk.window || "";
  cell.tabIndex = -1;
  cell.setAttribute("role", "option");
  cell.setAttribute("aria-selected", "false");
  cell.appendChild(omIcon({ kind: row.desk.kind, url: row.desk.art },
                          { name: row.desk.label, cls: "om-desk-art", img: "om-desk-img" }));
  cell.appendChild(el("span", "om-desk-name", row.desk.label));
  cell.appendChild(el("span", "om-desk-live"));
  cell.classList.toggle("om-desk-cell-lost", !!row.gone);
  liveTip(cell, () => ({
    lead: row.desk.label,
    lines: [row.gone || !floatingPanel(row.desk.window)
      ? row.hint
      : "Its window is open."],
  }));
  cell.onclick = () => deskSelect(cell);
  cell.ondblclick = () => deskOpenRow(row);
  cell.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    event.stopPropagation();
    deskSelect(cell);
    openRowMenu(cell, {
      items: [
        row.gone ? null : { label: `Open ${row.desk.label}`, fn: () => deskOpenRow(row) },
        { label: "Remove from the desktop", fn: () => unpinDesk(row.key) },
      ].filter(Boolean),
      align: "left",
    });
  });
  dragDeskCell(cell);
  return cell;
}

function buildBinCell() {
  const cell = el("div", "om-desk-cell");
  cell.dataset.omDeskKey = "wastebasket";
  cell.dataset.omDeskWindow = "wastebasket";
  cell.tabIndex = -1;
  cell.setAttribute("role", "option");
  cell.setAttribute("aria-selected", "false");
  cell._omOpen = () => openWastebasket();
  cell.appendChild(omIcon({ kind: "mask", url: ICON_BIN },
                          { name: "Trash", cls: "om-desk-art", img: "om-desk-img" }));
  cell.appendChild(el("span", "om-desk-name", "Trash"));
  cell.appendChild(el("span", "om-desk-live"));
  liveTip(cell, () => ({ lead: "Trash" }));
  cell.onclick = () => deskSelect(cell);
  cell.ondblclick = () => openWastebasket();
  cell.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    event.stopPropagation();
    deskSelect(cell);
    openRowMenu(cell, {
      items: [
        { label: "Open Trash", fn: () => openWastebasket() },
        { label: "Empty Trash", danger: true, fn: () => emptyWastebasket() },
      ],
      align: "left",
    });
  });
  binDropInto(cell);
  dragDeskCell(cell);
  return cell;
}

function binDropInto(node, after = null) {
  node.dataset.omDrop = "bin";
  node.addEventListener("dragover", (event) => {
    if (!carriedDoc(event) && !carriedHost(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    node.classList.add("om-fold-over");
  });
  node.addEventListener("dragleave", () => node.classList.remove("om-fold-over"));
  node.addEventListener("drop", async (event) => {
    if (!carriedDoc(event) && !carriedHost(event)) return;
    event.preventDefault();
    event.stopPropagation();
    node.classList.remove("om-fold-over");
    const sent = carriedDoc(event)
      ? readDrag(event, FILE_DRAG_TYPE)
      : binnable(readDrag(event, FILE_MOVE_TYPE));
    if (!sent?.path) return;
    await removeDoc(sent, () => {});
    after?.();
  });
}

function readDrag(event, type) {
  try { return JSON.parse(event.dataTransfer.getData(type)); } catch { return null; }
}

function binnable(sent) {
  if (!sent?.path) return null;
  if (!String(sent.place || "").startsWith("docs:")) {
    notify(sent.name || "Not binned",
           "Only items in Desktop and Documents can go to the Trash.");
    return null;
  }
  return { ...sent, path: docsPathOf(sent.place, sent.path) };
}

function paintDeskIcons() {
  if (!deskLayer) return;
  const grid = deskLayer.querySelector(".om-desk-grid");
  if (!grid) return;
  const rows = deskRows();
  const shape = [...rows.map((one) => one.key), "wastebasket",
                 ...deskDocs.map((one) => `${docKey(one)}=${one.name}=${one.icon || ""}`
                   + `=${one.target || ""}=${one.colour || ""}`)]
                 .join("|");
  if (grid._shape === shape) { paintDeskLive(); return; }
  grid._shape = shape;
  grid.replaceChildren(...rows.map(buildDeskCell), buildBinCell(),
                       ...deskDocs.map(buildDocCell));
  const first = grid.firstElementChild;
  if (first) first.tabIndex = 0;
  placeDeskCells();
  paintDeskLive();
}

function deskChrome() {
  const found = [];
  const bar = document.querySelector(".actionbar-container");
  const cluster = bar?.closest(".mx-1") || bar?.parentElement || bar;
  if (cluster) found.push(cluster);
  const crumb = document.querySelector(".subgraph-breadcrumb");
  if (crumb) found.push(crumb);
  const panel = deskFreeBox();
  const room = panel?.getBoundingClientRect();
  for (const group of panel?.querySelectorAll(".p-buttongroup") || []) {
    const box = group.getBoundingClientRect();
    if (!box.height || !room) continue;
    if (box.bottom > room.bottom - 160) found.push(group);
  }
  return found;
}

function slideChrome(away) {
  const room = deskFreeBox()?.getBoundingClientRect();
  for (const node of deskChrome()) {
    const box = node.getBoundingClientRect();
    node.classList.add("om-desk-chrome");
    if (room && box.height) {
      node.classList.toggle("om-desk-under", box.top > room.top + room.height / 2);
    }
    node.classList.toggle("om-desk-away", away);
  }
}

function chromeHost() {
  const bar = document.querySelector(".actionbar-container");
  return bar?.closest(".p-splitterpanel") || document.body;
}

function watchDeskChrome() {
  if (deskChromeWatcher) return;
  let due = 0;
  deskChromeWatcher = new MutationObserver(() => {
    if (due) return;
    due = requestAnimationFrame(() => { due = 0; slideChrome(deskShown); });
  });
  deskChromeWatcher.observe(chromeHost(), { childList: true, subtree: true });
}

function deskSidebar() {
  return document.querySelector(".side-tool-bar-container");
}

function fitDeskTab() {
  if (!deskTab?.isConnected) return;
  const side = deskSidebar()?.getBoundingClientRect();
  const wide = side && side.width >= 24 ? Math.round(side.width) : 38;
  deskTab.style.width = `${wide}px`;
}

function watchDeskTabWidth() {
  const side = deskSidebar();
  if (!side || !window.ResizeObserver) return;
  deskSideRoom?.disconnect();
  deskSideRoom = new ResizeObserver(() => fitDeskTab());
  deskSideRoom.observe(side);
}

function paintDeskTab() {
  if (!deskTab) return;
  deskTab.classList.toggle("om-desk-tab-on", deskShown);
  deskTab.setAttribute("aria-pressed", deskShown ? "true" : "false");
}

function showDesk() {
  if (!desktopOn()) return;
  loadDeskDocs().then(() => paintDeskIcons()).catch(() => {});
  buildDesk();
  paintDeskIcons();
  applyDeskLook();
  deskFit();
  deskLayer.hidden = false;
  deskLayer.classList.add("om-desk-on");
  requestAnimationFrame(() => { deskFit(); placeDeskCells(); });
  deskShown = true;
  deskSeenPath = activePath();
  deskArmAt = Date.now() + (sessionReady ? 1200 : 8000);
  document.body.classList.add("om-desk-open");
  setDeskHash(true);
  slideChrome(true);
  paintDeskTab();
  taskbarSync();
  sessionKeep();
}

function hideDesk() {
  if (!deskShown) return;
  deskShown = false;
  deskHashWanted = false;
  if (deskLayer) {
    deskLayer.hidden = true;
    deskLayer.classList.remove("om-desk-on");
  }
  document.body.classList.remove("om-desk-open");
  setDeskHash(false);
  slideChrome(false);
  paintDeskTab();
  taskbarSync();
  sessionKeep();
}

function deskShowing() {
  return deskShown;
}

function mountDeskTab() {
  if (!desktopOn()) return;
  const strip = deskStrip();
  if (!strip) return;
  const held = document.getElementById(DESK_TAB_ID);
  if (held && held.parentElement === strip && strip.firstChild === held) return;
  held?.remove();
  deskTab = el("button", "om-desk-tab");
  deskTab.id = DESK_TAB_ID;
  deskTab.type = "button";
  deskTab.setAttribute("aria-label", "Desktop");
  const mark = el("span", "om-desk-mark");
  mark.style.setProperty("-webkit-mask", `center / contain no-repeat url("${ICON_DESKTOP}")`);
  mark.style.setProperty("mask", `center / contain no-repeat url("${ICON_DESKTOP}")`);
  deskTab.appendChild(mark);
  liveTip(deskTab, () => ({
    lead: "Desktop",
    lines: [deskShown ? "Hide the desktop" : "Show the desktop"],
  }));
  deskTab.onclick = () => { if (deskShown) hideDesk(); else showDesk(); };
  strip.insertBefore(deskTab, strip.firstChild);
  fitDeskTab();
  watchDeskTabWidth();
  paintDeskTab();
}

function watchDeskTab() {
  if (deskWatcher) return;
  const host = document.querySelector('[data-testid="topbar-workflow-tabs"]')
    || document.body;
  let due = 0;
  deskWatcher = new MutationObserver(() => {
    if (due) return;
    due = requestAnimationFrame(() => { due = 0; mountDeskTab(); });
  });
  deskWatcher.observe(host, { childList: true, subtree: true });
}

function activePath() {
  try {
    return String(app.extensionManager?.workflow?.activeWorkflow?.path || "");
  } catch {
    return "";
  }
}

function watchDeskWork() {
  clearInterval(deskWatchTimer);
  deskSeenPath = activePath();
  let deskChromeAway = null;
  deskWatchTimer = setInterval(() => {
    const open = deskShown && !!deskLayer && !deskLayer.hidden;
    if (deskLayer && !deskShown) deskLayer.classList.remove("om-desk-on");
    document.body.classList.toggle("om-desk-open", open);
    if (open || deskChromeAway !== false) {
      slideChrome(open);
      deskChromeAway = open;
    }
    if (!deskShown) return;
    const now = activePath();
    if (!now) return;
    if (!deskSeenPath || Date.now() < deskArmAt) { deskSeenPath = now; return; }
    if (now !== deskSeenPath) {
      deskSeenPath = now;
      hideDesk();
    }
  }, 250);
}

function leaveDeskOnWork() {
  if (deskWired) return;
  deskWired = true;
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !deskShown) return;
    if (document.querySelector(".om-backdrop, .om-menu, .om-lb, .om-task-pop, .om-start")) return;
    const on = event.target;
    if (on instanceof Element
        && on.closest(".om-float input, .om-float textarea, .om-float select, "
          + ".om-float [contenteditable='true']")) return;
    hideDesk();
  }, true);
  document.addEventListener("pointerdown", (event) => {
    if (!deskShown) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest(`#${DESK_TAB_ID}`) || target.closest(".om-desk")) return;
    if (target.closest(".p-togglebutton") || target.closest(".new-blank-workflow-button")) {
      hideDesk();
    }
  }, true);
}

function applyDesktop() {
  const on = desktopOn();
  if (!on) {
    hideDesk();
    document.body.classList.remove("om-desk-open");
    slideChrome(false);
    document.getElementById(DESK_TAB_ID)?.remove();
    deskTab = null;
    deskWatcher?.disconnect();
    deskWatcher = null;
    deskChromeWatcher?.disconnect();
    deskChromeWatcher = null;
    deskSideRoom?.disconnect();
    deskSideRoom = null;
    clearInterval(deskWatchTimer);
    deskWatchTimer = 0;
    deskRoom?.disconnect();
    deskRoom = null;
    deskLayer?.remove();
    deskLayer = null;
    taskbarSync();
    return;
  }
  mountDeskTab();
  watchDeskTab();
  watchDeskChrome();
  leaveDeskOnWork();
  watchDeskWork();
  buildDesk();
  paintDeskIcons();
  applyDeskLook();
  taskbarSync();
}

const SESSION_KEY = "om-session";

let sessionReady = false;

let sessionDue = 0;

function sessionRead() {
  try {
    const held = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    if (!held || typeof held !== "object") return null;
    return { desk: held.desk === true, windows: Array.isArray(held.windows) ? held.windows : [] };
  } catch {
    return null;
  }
}

function sessionWrite() {
  if (!sessionReady) return;
  const windows = [...floatPanels.values()]
    .filter((one) => one.el.isConnected && !one.modal && one.key)
    .map((one) => ({ key: one.key, away: one.isMinimised?.() === true }));
  try {
    localStorage.setItem(SESSION_KEY,
      JSON.stringify({ v: 1, desk: deskShown === true, windows }));
  } catch {
  }
}

function sessionKeep() {
  clearTimeout(sessionDue);
  sessionDue = setTimeout(sessionWrite, 300);
}

function windowOpener(key) {
  if (key === "desktop") return () => openDesktopSettings();
  if (key === "wastebasket") return () => openWastebasket();
  if (key.startsWith("pack:")) {
    const id = key.slice(5);
    return id ? () => openPack(id) : null;
  }
  if (key.startsWith("note:")) {
    const id = key.slice(key.indexOf(":") + 1);
    return async () => {
      const found = await docFind(id);
      if (found) openDoc(found);
    };
  }
  const at = key.indexOf(":");
  if (at > 0) {
    const id = key.slice(0, at);
    const view = key.slice(at + 1);
    const program = programRows.find((one) => one.key === id);
    if (program) return () => runProgram(program.program, undefined, view);
  }
  const row = managerDestinations().find((one) => one.desk?.window === key);
  if (row) return () => deskOpenRow(row);
  if (key === "manager") return () => openPanelWindow("registry");
  if (key.startsWith("files:")) return () => openFileBrowser();
  return null;
}

async function restoreSession() {
  const held = sessionRead();
  const asked = deskHashAsked();
  if (!held) {
    if (asked) showDesk();
    sessionReady = true;
    return asked;
  }
  for (const one of held.windows) {
    const key = String(one?.key || "");
    const open = windowOpener(key);
    if (!open) continue;
    try {
      await open();
    } catch {
      continue;
    }
    if (one.away) floatingPanel(key)?.minimise?.();
  }
  if (held.desk || asked) showDesk();
  sessionReady = true;
  sessionWrite();
  return true;
}

function deskNothingOpen() {
  return new Promise((settle) => {
    let tries = 0;
    const look = () => {
      tries += 1;
      if (openWorkflows().length || activePath()) { settle(false); return; }
      if (tries >= 25) { settle(true); return; }
      setTimeout(look, 200);
    };
    look();
  });
}

async function startDesktop() {
  await loadGates().catch(() => {});
  const programsReady = loadPrograms().then(() => {
    if (deskLayer) paintDeskIcons();
  }).catch(() => {});
  if (!desktopOn()) {
    programsReady.then(() => restoreSession()).catch(() => { sessionReady = true; });
    return;
  }
  loadDeskCells().then(() => placeDeskCells()).catch(() => {});
  loadDeskDocs().then(() => paintDeskIcons()).catch(() => {});
  applyDesktop();
  programsReady.then(() => restoreSession()).then((remembered) => {
    if (remembered || deskAsked()) return;
    return deskNothingOpen().then((empty) => {
      if (empty && !deskShown) showDesk();
    });
  }).catch(() => { sessionReady = true; });
}

let taskHideWired = false;

function matchStartWidth(tries = 12) {
  if (!taskStart) return;
  const tab = document.getElementById(DESK_TAB_ID);
  const wide = Math.round(tab?.getBoundingClientRect().width || 0);
  if (wide >= 24) {
    taskStart.style.setProperty("--om-start-wide", `${wide}px`);
    return;
  }
  if (tries > 0) requestAnimationFrame(() => matchStartWidth(tries - 1));
}

function taskbarHides() {
  return panelSetting("openManager.taskbarHide", false) === true;
}

function taskbarShow(on) {
  if (!taskBar) return;
  taskBar.classList.toggle("om-task-hidden", taskbarHides() && !on);
}

function watchTaskbarEdge() {
  if (taskHideWired) return;
  taskHideWired = true;
  let over = false;
  const near = (event) => {
    if (!taskBar || !taskbarHides()) return;
    const bar = taskBar.getBoundingClientRect();
    const reach = Math.max(28, bar.height);
    over = event.clientY >= window.innerHeight - reach;
    taskbarShow(over || !!startPanel);
  };
  document.addEventListener("pointermove", near, { passive: true });
  document.addEventListener("pointerleave", () => {
    over = false;
    if (!startPanel) taskbarShow(false);
  });
}

function taskbarSync() {
  matchStartWidth();
  if (taskDue) return;
  taskDue = requestAnimationFrame(() => { taskDue = 0; paintTaskbar(); });
}

floatHooks.add(taskbarSync);

floatHooks.add(paintDeskLive);

floatHooks.add(sessionKeep);

function applyTaskbar() {
  const on = taskbarOn();
  closeTaskPop(false);
  if (!on) {
    const back = [...floatPanels.values()]
      .filter((one) => one.el.isConnected && one.isMinimised?.())
      .sort((a, b) => a.minimisedAt() - b.minimisedAt());
    for (const one of back) one.restore();
  }
  for (const button of document.querySelectorAll(".om-float-min")) {
    button.hidden = !on || !!button.closest(".om-backdrop");
  }
  paintTaskbar();
}


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
  types: new Map(),
};

const BRAND_BLUE = "#84bbe7";
const BRAND_YELLOW = "#f9f276";

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

function runMainColour() {
  const header = String(window.LiteGraph?.NODE_DEFAULT_COLOR || "");
  return !runIsGrey(header) ? header : BRAND_BLUE;
}

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

function runNodeLabel(nodeId) {
  const id = String(nodeId);
  try {
    const node = app.graph?.getNodeById?.(Number(id));
    if (node?.title || node?.type) return node.title || node.type;
  } catch {
  }
  return runBar.types.get(id) || `node ${id}`;
}

async function runTotalFor(promptId) {
  try {
    const queue = await (await api.fetchApi("/queue")).json();
    const running = (queue.queue_running || []).find((item) => item?.[1] === promptId);
    const prompt = running?.[2];
    if (!prompt || typeof prompt !== "object") return 0;
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

  if (!runBar.error) {
    const lead = runMainColour();
    bar.style.setProperty("--om-prog-from", runShade(lead, -0.4));
    bar.style.setProperty("--om-prog-to", lead);
    bar.style.setProperty("--om-prog-cap", runShade(lead, 0.6));
    bar.style.setProperty("--om-prog-glow", runAlpha(lead, 0.85));
    bar.style.setProperty("--om-prog-halo", runAlpha(lead, 0.45));
    const tint = runBar.active
      ? runNodeColour(runBar.active.id, runBar.types.get(String(runBar.active.id)))
      : BRAND_YELLOW;
    bar.style.setProperty("--om-prog-sub", runShade(tint, -0.42));
  }

  main.style.width = `${share}%`;
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
    ? "A node expanded into more nodes than the prompt held, so the total grew."
    : "Graph progress over the running node's own.";
}

function runBarShow(on) {
  const bar = runBar.el;
  if (!bar) return;
  bar.classList.toggle("om-prog-on", on);
}

function onProgressState(detail) {
  if (!runBar.el) return;
  const nodes = detail?.nodes || {};
  if (detail?.prompt_id && detail.prompt_id !== runBar.promptId) runBarReset(detail.prompt_id);

  let active = null;
  for (const [id, entry] of Object.entries(nodes)) {
    const state = entry?.state;
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
  if (runBar.submitted && runBar.seen.size > runBar.submitted) {
    runBar.expanded = true;
    runBar.total = Math.max(runBar.total, runBar.seen.size);
  }
  paintRunBar();
}

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


const MEMORY_HISTORY = 240;

const memoryHistory = { cpu: [], ram: [], vram: [] };

const MEMORY_CLIENT = `${MONITOR_CLIENT}-panel`;

const READING_QUIET = 6000;

let lastReadingAt = 0;

function readingAge() {
  if (!lastReadingAt) return Infinity;
  const hidden = link.hiddenFor + (link.hiddenAt ? Date.now() - link.hiddenAt : 0);
  return Math.max(0, Date.now() - lastReadingAt - hidden);
}

function readingQuiet() {
  return readingAge() > Math.max(READING_QUIET, monitorInterval() * 3000);
}

function quietText(age) {
  if (!Number.isFinite(age)) return "nothing since the panel opened";
  const seconds = Math.round(age / 1000);
  if (seconds < 90) return `no reading for ${seconds} seconds`;
  const minutes = Math.round(seconds / 60);
  return `no reading for ${minutes} minute${minutes === 1 ? "" : "s"}`;
}

function recordReading(reading) {
  lastReadingAt = Date.now();
  link.hiddenFor = 0;
  link.hiddenAt = document.hidden ? Date.now() : 0;
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

const BLOCK_COLOURS = ["#a371f7", "#3fb950", "#58a6ff", "#d29922", "#db61a2", "#39c5cf"];

function keyItem(device, seat) {
  const item = el("span", "om-mem-key-item");
  const swatch = el("span", "om-mem-swatch");
  swatch.style.background = blockColour(seat);
  item.appendChild(swatch);
  item.appendChild(el("span", null, `${device.device} · ${bytesText(device.bytes)}`));
  return item;
}

function heatKeyItem() {
  const item = el("span", "om-mem-key-item om-mem-key-hot");
  const swatch = el("span", "om-mem-swatch");
  swatch.style.background = `rgba(${BLOCK_HOT}, .8)`;
  item.appendChild(swatch);
  item.appendChild(el("span", null, "in use now"));
  item.title = "Pages the run has just faulted in, fading as they go quiet.";
  return item;
}

function blockColour(seat) {
  return seat < 0 ? "transparent" : BLOCK_COLOURS[seat % BLOCK_COLOURS.length];
}

const BLOCK_GAP = 1;

const BLOCK_CELL_MAX = 14;

const BLOCK_ROWS_LIMIT = 10;

function blockGrid(canvas, count) {
  const width = canvas.clientWidth;
  if (!width || !count) return null;
  const ratio = window.devicePixelRatio || 1;
  const gap = Math.max(1, Math.round(BLOCK_GAP * ratio));
  const deviceWidth = Math.max(1, Math.round(width * ratio));
  const pick = (rows) => {
    const columns = Math.max(1, Math.ceil(count / rows));
    return { rows, columns, step: deviceWidth / columns };
  };
  let best = pick(1);
  for (let rows = 2; rows <= BLOCK_ROWS_LIMIT; rows += 1) {
    const candidate = pick(rows);
    if (candidate.step > BLOCK_CELL_MAX * ratio) break;
    best = candidate;
  }
  const step = Math.min(best.step, BLOCK_CELL_MAX * ratio);
  const deviceHeight = Math.max(1, Math.round(best.rows * step));
  return { width, ratio, gap, step, columns: best.columns, rows: best.rows,
           deviceWidth, deviceHeight, height: Math.round(deviceHeight / ratio) };
}

function blockRect(grid, index) {
  const column = index % grid.columns;
  const row = Math.floor(index / grid.columns);
  const left = Math.round(column * grid.step);
  const top = Math.round(row * grid.step);
  return [left, top,
          Math.max(1, Math.round((column + 1) * grid.step) - left - grid.gap),
          Math.max(1, Math.round((row + 1) * grid.step) - top - grid.gap)];
}

function paintBlockMap(canvas, cells) {
  const grid = blockGrid(canvas, cells.length);
  if (!grid) return;
  canvas.style.height = `${grid.height}px`;
  canvas.width = grid.deviceWidth;
  canvas.height = grid.deviceHeight;
  const pen = canvas.getContext("2d");
  pen.setTransform(1, 0, 0, 1, 0, 0);
  pen.clearRect(0, 0, grid.deviceWidth, grid.deviceHeight);

  cells.forEach((seat, index) => {
    pen.fillStyle = blockColour(seat);
    pen.fillRect(...blockRect(grid, index));
  });
  canvas._omGrid = grid;
}

const BLOCK_HOT = "255, 255, 255";

const HEAT_FRAME = 60;

const HEAT_FADE = 2500;

function paintBlockHeat(canvas, heat, at) {
  const grid = canvas._omGrid;
  if (!grid || !heat?.length) return false;
  const base = canvas._omBase;
  if (!base) return false;
  const pen = canvas.getContext("2d");
  pen.setTransform(1, 0, 0, 1, 0, 0);
  pen.drawImage(base, 0, 0);
  const fade = Math.max(0, 1 - (performance.now() - at) / HEAT_FADE);
  if (!fade) return false;
  let lit = false;
  for (let index = 0; index < heat.length; index += 1) {
    const value = heat[index];
    if (!value) continue;
    lit = true;
    pen.fillStyle = `rgba(${BLOCK_HOT}, ${(value / 100) * 0.75 * fade})`;
    pen.fillRect(...blockRect(grid, index));
  }
  return lit;
}

function buildBlockMap(map) {
  const box = el("div", "om-mem-map");
  const frame = el("div", "om-mem-grid-frame");
  const canvas = el("canvas", "om-mem-grid");
  frame.appendChild(canvas);
  box.appendChild(frame);
  let cells = map.cells || [];
  let heat = map.heat || [];
  let heatAt = 0;
  let beating = 0;

  const snapshot = () => {
    if (!canvas.width || !canvas.height) return;
    let base = canvas._omBase;
    if (!base) { base = document.createElement("canvas"); canvas._omBase = base; }
    if (base.width !== canvas.width || base.height !== canvas.height) {
      base.width = canvas.width;
      base.height = canvas.height;
    }
    const pen = base.getContext("2d");
    pen.setTransform(1, 0, 0, 1, 0, 0);
    pen.clearRect(0, 0, base.width, base.height);
    pen.drawImage(canvas, 0, 0);
  };

  const draw = () => { paintBlockMap(canvas, cells); snapshot(); };

  const beat = () => {
    beating = 0;
    if (!canvas.isConnected || document.hidden) return;
    if (paintBlockHeat(canvas, heat, heatAt)) {
      beating = setTimeout(() => requestAnimationFrame(beat), HEAT_FRAME);
    } else {
      draw();
    }
  };
  const warm = () => {
    if (beating || !heat.some(Boolean)) return;
    beating = setTimeout(() => requestAnimationFrame(beat), HEAT_FRAME);
  };

  const watcher = new ResizeObserver(draw);
  watcher.observe(canvas);
  box._redraw = draw;

  const key = el("div", "om-mem-key");
  for (const [seat, device] of (map.devices || []).entries()) {
    key.appendChild(keyItem(device, seat));
  }
  const hot = heatKeyItem();
  hot.hidden = !map.heat;
  key.appendChild(hot);
  const note = el("span", "om-mem-key-note", `${map.modules} ${map.unit || "blocks"}`);
  note.title = (map.source === "pages"
    ? "Read from the streaming library, a page at a time. The shares here step in whole "
      + "pages and differ slightly from the byte figure above."
    : "Read from the model's own modules.")
    + (map.heat ? " A square lights when the run faults that page in, and fades as it goes "
                  + "quiet."
                : "");
  key.appendChild(note);
  box.appendChild(key);

  return {
    el: box,
    update: (next) => {
      const shape = (next.cells || []).join(",");
      const moved = shape !== cells.join(",");
      cells = next.cells || [];
      heat = next.heat || [];
      heatAt = performance.now();
      if (moved || !canvas._omBase) draw();
      warm();
      const rate = Number.isFinite(next.faults)
        ? ` · ${Math.round(next.faults)} faults/s`
          + (next.refaults >= 1 ? `, ${Math.round(next.refaults)} back` : "")
        : "";
      note.textContent = `${next.modules} ${next.unit || "blocks"}${rate}`;
      hot.hidden = !next.heat;
      const items = [...key.querySelectorAll(".om-mem-key-item:not(.om-mem-key-hot)")];
      const devices = next.devices || [];
      if (items.length !== devices.length) {
        key.replaceChildren(...devices.map((device, seat) => keyItem(device, seat)), hot, note);
      } else {
        devices.forEach((device, seat) => {
          items[seat].lastChild.textContent = `${device.device} · ${bytesText(device.bytes)}`;
          items[seat].firstChild.style.background = blockColour(seat);
        });
      }
    },
  };
}

function repaintBlockMaps(root) {
  for (const map of root.querySelectorAll(".om-mem-map")) map._redraw?.();
}

const BLOCK_CELLS_FIRST = 240;

const BLOCK_CELLS_MAX = 1024;

function buildMemoryModelRow(model, refresh) {
  const row = el("div", "om-mem-model");

  const top = el("div", "om-dl-top");
  const name = el("span", "om-dl-name", model.name);
  const size = el("span", "om-lib-size", bytesText(model.total));
  top.appendChild(name);
  top.appendChild(size);
  const drop = el("button", "om-btn om-mem-drop", "Unload");
  drop.title = "Unload this model and its clones. ComfyUI loads it again when a prompt needs "
    + "it. Refused while a prompt is running.";
  drop.onclick = async () => {
    const go = await chooseAction(`Unload ${row._name}?`,
      `This unloads ${row._name} regardless of what is holding it.`,
      [{ key: "go", label: "Unload", primary: true }],
      { wide: true, facts: [
        ["Frees", bytesText(row._total || 0)],
        ["Also unloads", "Any clone of this model, meaning a second copy made for another device"],
        ["Costs", "The next prompt that needs it loads it again"],
        ["While a prompt is running", "Refused"],
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
  liveTip(bar, () => bar._say || "");
  row.appendChild(bar);

  const meta = el("div", "om-dl-where");
  row.appendChild(meta);

  const slot = el("div", "om-mem-map-slot");
  row.appendChild(slot);

  let drawn = null;

  const tell = (model) => {
    name.textContent = model.name;
    size.textContent = bytesText(model.total);
    row._id = model.id;
    row._name = model.name;
    row._total = model.total;
    resident.style.width = `${Math.max(0, Math.min(100, model.share))}%`;
    bar._say = `${bytesText(model.resident)} on ${model.device}`
      + (model.offloaded ? `\n${bytesText(model.offloaded)} offloaded to host memory` : "");

    const tags = [model.device, `${bytesText(model.resident)} resident`];
    if (model.offloaded) tags.push(`${bytesText(model.offloaded)} offloaded`);
    if (model.in_use) tags.push("in use");
    if (model.pins?.pinned_bytes) tags.push(`${bytesText(model.pins.pinned_bytes)} pinned`);
    const parts = tags.map((text, index) =>
      el("span", index ? "om-dl-src" : null, text));
    if (model.streaming) {
      const tag = el("span", "om-dl-src om-mem-stream", "weights stream in blocks");
      tag.title = "This model's weights move between host and device while it runs, a block "
        + "at a time, so what is resident changes as it works.";
      parts.splice(model.offloaded ? 3 : 2, 0, tag);
    }
    if (model.pins?.failed) parts.push(el("span", "om-dl-src om-dl-bad", "pinning failed"));
    meta.replaceChildren(...parts);

    row._index = model.index;
    row._streaming = !!model.streaming;
  };

  let asking = false;
  row._blocks = () => {
    if (asking || !slot.isConnected || document.hidden || row._inView === false) return;
    asking = true;
    libGet(`/monitor/blocks?index=${row._index}&cells=${row._cells || BLOCK_CELLS_FIRST}`)
      .then((found) => {
        asking = false;
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
        if (found.modules) row._cells = Math.min(found.modules, BLOCK_CELLS_MAX);
        row._busy = Number.isFinite(found.faults) && found.faults > 0;
      })
      .catch(() => { asking = false; });
  };

  tell(model);
  row._blocks();
  row._update = tell;
  return row;
}

const ACTIVITY_LOOK = {
  working: { title: "Working", legend: "The card is doing arithmetic." },
  streaming: { title: "Streaming weights", legend: "The model is larger than the card, so "
    + "weights cross the bus as they are needed." },
  stalling: { title: "Potential memory stall", legend: "Memory is nearly full and nothing has "
    + "moved for a short while." },
  stalled: { title: "Memory stalled", legend: "Quiet, memory full, and nothing has moved for "
    + "the better part of a minute." },
  hang: { title: "Possible GPU hang", legend: "Busy, memory full, nothing arriving and "
    + "nothing advancing." },
  oom: { title: "Out of memory", legend: "The last run failed for memory. ComfyUI unloaded "
    + "everything it held." },
  idle: { title: "Idle", legend: "Nothing is running. Models may still be held." },
  quiet: { title: "Not reporting", legend: "No reading has arrived. The figures shown are the "
    + "last that did." },
  thrashing: { title: "Streaming thrash", legend: "Weights are being fetched again as fast as "
    + "they are dropped." },
};

function activityLegend() {
  const list = el("dl", "om-facts");
  for (const [state, look] of Object.entries(ACTIVITY_LOOK)) {
    if (!look.legend) continue;
    const term = el("dt");
    term.appendChild(el("span", `om-orb om-orb-${state}`));
    term.appendChild(document.createTextNode(` ${look.title}`));
    list.appendChild(term);
    list.appendChild(el("dd", null, look.legend));
  }
  return list;
}

function openActivityLegend() {
  chooseAction("What the light means", "", [], { wide: true, extra: activityLegend() });
}

function buildActivityOrb() {
  const orb = el("span", "om-orb om-orb-idle");
  orb.setAttribute("role", "img");
  orb.tabIndex = 0;
  liveTip(orb, () => orb._say || "");
  orb.onclick = (event) => { event.stopPropagation(); openActivityLegend(); };
  orb.onkeydown = (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    event.stopPropagation();
    openActivityLegend();
  };
  orb.tell = (activity, quietFor = 0, state = "") => {
    const look = quietFor ? "quiet" : (ACTIVITY_LOOK[activity?.state] ? activity.state : "idle");
    const say = LINK_SAY[state];
    if (orb._state !== look) {
      orb._state = look;
      orb.className = `om-orb om-orb-${look}`;
    }
    const label = quietFor
      ? `Not reporting: ${quietText(quietFor)}`
      : (activity?.label || ACTIVITY_LOOK[look].title);
    const detail = quietFor
      ? (say?.tip || "No reading has arrived; the figures shown are the last that did.")
      : (activity?.detail || "");
    orb._say = { lead: label, facts: quietFor ? [] : (activity?.facts || []), lines: [detail] };
    orb.setAttribute("aria-label", label);
  };
  orb.tell(null);
  return orb;
}

const DESKSET_SCALE = 0.26;

function deskRealRect() {
  const box = deskCanvasBox()?.getBoundingClientRect();
  if (!box || !box.width || !box.height) {
    return { width: window.innerWidth, height: window.innerHeight };
  }
  const floor = taskBar?.isConnected
    ? taskBar.getBoundingClientRect().top
    : window.innerHeight;
  return { width: box.width, height: Math.max(80, Math.min(box.bottom, floor) - box.top) };
}

function deskSetPreview(screen) {
  const real = deskRealRect();
  screen.style.aspectRatio = `${Math.round(real.width)} / ${Math.round(real.height)}`;
  const shown = screen.getBoundingClientRect();
  const scale = shown.width > 0 ? shown.width / real.width : DESKSET_SCALE;
  const url = deskPaperUrl(panelSetting("openManager.desktopWallpaper", ""));
  const fit = deskFitNow();
  screen.style.backgroundImage = url ? `url("${url}")` : "";
  screen.style.backgroundSize = fit.size === "auto" ? "auto" : fit.size;
  screen.style.backgroundRepeat = fit.repeat;
  screen.style.backgroundPosition = deskPosition(fit);
  screen.style.cursor = url && fit.movable ? "grab" : "default";
  const icon = deskNumber("openManager.desktopIconSize", 44, 28, 96) * scale;
  const label = deskNumber("openManager.desktopLabelSize", 12, 9, 18) * scale;
  const step = { wide: (88 + 12) * scale, tall: (109 + 12) * scale };
  const inset = { left: 73 * scale, top: 48 * scale };
  const cells = deskRows().map((row, at) => {
    const spot = deskCells[row.key] || { col: 0, row: Number(row.desk.at) || at };
    const cell = el("div", "om-deskset-cell");
    cell.style.left = `${inset.left + spot.col * step.wide}px`;
    cell.style.top = `${inset.top + spot.row * step.tall}px`;
    cell.style.width = `${Math.max(8, step.wide - 4)}px`;
    const art = omIcon({ kind: row.desk.kind, url: row.desk.art },
                       { name: row.desk.label, cls: "om-desk-art", img: "om-desk-img" });
    art.style.width = `${Math.max(6, icon)}px`;
    art.style.height = `${Math.max(6, icon)}px`;
    cell.appendChild(art);
    const name = el("span", null, row.desk.label);
    name.style.fontSize = `${Math.max(3, label)}px`;
    cell.appendChild(name);
    return cell;
  });
  screen.replaceChildren(...cells);
}

function slideWallpaper(screen, after) {
  screen.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    if (!deskFitNow().movable) return;
    if (!String(panelSetting("openManager.desktopWallpaper", "")).trim()) return;
    const box = screen.getBoundingClientRect();
    const start = deskFocus();
    const from = { x: event.clientX, y: event.clientY };
    let moved = false;
    let spot = start;
    try { screen.setPointerCapture(event.pointerId); } catch {}
    screen.style.cursor = "grabbing";

    const onMove = (move) => {
      const dx = (move.clientX - from.x) / Math.max(1, box.width) * 100;
      const dy = (move.clientY - from.y) / Math.max(1, box.height) * 100;
      if (!moved && Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      moved = true;
      spot = {
        x: Math.round(Math.max(0, Math.min(100, start.x - dx))),
        y: Math.round(Math.max(0, Math.min(100, start.y - dy))),
      };
      screen.style.backgroundPosition = `${spot.x}% ${spot.y}%`;
      if (deskLayer) deskLayer.style.backgroundPosition = `${spot.x}% ${spot.y}%`;
    };

    const onUp = async () => {
      try { screen.releasePointerCapture?.(event.pointerId); } catch {}
      screen.removeEventListener("pointermove", onMove);
      screen.removeEventListener("pointerup", onUp);
      screen.removeEventListener("pointercancel", onUp);
      screen.style.cursor = "grab";
      if (!moved) return;
      await app.extensionManager.setting.set("openManager.desktopFocusX", spot.x);
      await app.extensionManager.setting.set("openManager.desktopFocusY", spot.y);
      after?.(spot);
    };

    screen.addEventListener("pointermove", onMove);
    screen.addEventListener("pointerup", onUp);
    screen.addEventListener("pointercancel", onUp);
  });
}

function deskSetPapers(box, screen) {
  deskPapers().then((answer) => {
    if (!box.isConnected) return;
    const held = String(panelSetting("openManager.desktopWallpaper", ""));
    const found = answer.wallpapers || [];
    if (!found.length) {
      box.replaceChildren(el("div", "om-deskset-note", "No wallpapers yet."));
      return;
    }
    box.replaceChildren(...found.map((one) => {
      const pick = el("button", "om-deskset-paper");
      pick.type = "button";
      pick.style.backgroundImage = `url("${deskPaperUrl(one.name)}")`;
      pick.classList.toggle("om-deskset-paper-on", one.name === held);
      liveTip(pick, () => ({
        lead: one.name,
        facts: one.builtin
          ? [["Size", bytesText(one.size)], ["Source", "Came with Open Manager"]]
          : [["Size", bytesText(one.size)], ["Added", whenText(new Date(one.at * 1000))]],
        lines: one.builtin ? [] : ["Middle-click deletes it."],
      }));
      pick.onclick = async () => {
        await app.extensionManager.setting.set("openManager.desktopWallpaper", one.name);
        applyDeskLook();
        deskSetPreview(screen);
        deskSetPapers(box, screen);
      };
      pick.addEventListener("auxclick", async (event) => {
        if (event.button !== 1 || one.builtin) return;
        event.preventDefault();
        const answer2 = await dlPost("/wallpaper/remove", { name: one.name }).catch(() => null);
        if (!answer2?.ok) { notify("Not removed", answer2?.reason || "It could not be removed."); return; }
        if (one.name === held) {
          await app.extensionManager.setting.set("openManager.desktopWallpaper", "");
          applyDeskLook();
          deskSetPreview(screen);
        }
        deskSetPapers(box, screen);
      });
      return pick;
    }));
  }).catch(() => {});
}

function deskHeading(title) {
  const head = el("div", "om-deskset-head");
  head.appendChild(el("span", null, title));
  return head;
}

function windowPalette() {
  const box = el("div", "om-deskset-palette");
  const row = el("div", "om-deskset-palette-row");
  const custom = el("div", "om-deskset-custom");
  custom.hidden = true;
  const pair = { from: el("input"), to: el("input") };
  const paint = () => {
    row.replaceChildren();
    const held = windowColour();
    const named = readColour(held);
    for (const name of Object.keys(BAR_PAINTS)) {
      const dot = el("button", "om-tab-swatch om-deskset-swatch");
      dot.type = "button";
      dot.title = name === "plain" ? "The theme's own bar" : name;
      dot.style.background = name === "plain"
        ? "var(--om-surface)"
        : `var(--om-surface) ${barPaint({ tint: name }, { over: "var(--om-surface)" })}`;
      dot.style.backgroundBlendMode = "normal";
      dot.classList.toggle("om-tab-swatch-on", held === name || (!held && name === "plain"));
      dot.onclick = () => {
        custom.hidden = true;
        setWindowColour(name === "plain" ? "" : name).then(paint);
      };
      row.appendChild(dot);
    }
    const mine = el("button", "om-tab-swatch om-deskset-swatch om-tab-swatch-pick", "+");
    mine.type = "button";
    mine.title = "A colour, or a gradient, of your own";
    const own = named && !Object.hasOwn(BAR_PAINTS, held);
    if (own) {
      mine.textContent = "";
      mine.style.background =
        `var(--om-surface) ${barPaint(named, { over: "var(--om-surface)" })}`;
    }
    mine.classList.toggle("om-tab-swatch-on", !!own);
    mine.onclick = () => {
      custom.hidden = !custom.hidden;
      if (custom.hidden) return;
      pair.from.value = TAB_HEX.test(named?.from || named?.tint || "")
        ? (named.from || named.tint) : "#58a6ff";
      pair.to.value = TAB_HEX.test(named?.to || "") ? named.to : pair.from.value;
    };
    row.appendChild(mine);
  };

  const apply = () => {
    const from = pair.from.value;
    const to = pair.to.value;
    setWindowColour(from === to ? from : `${from},${to}`).then(paint);
  };
  for (const [side, field] of Object.entries(pair)) {
    field.type = "color";
    field.className = "om-deskset-dip";
    field.title = side === "from" ? "Left of the bar" : "Right of the bar";
    field.addEventListener("change", apply);
  }
  custom.appendChild(el("span", "om-deskset-dip-label", "From"));
  custom.appendChild(pair.from);
  custom.appendChild(el("span", "om-deskset-dip-label", "to"));
  custom.appendChild(pair.to);

  box.appendChild(el("span", "om-deskset-paint-name", "Window colour"));
  box.appendChild(row);
  box.appendChild(custom);
  box._omPaint = paint;
  paint();
  return box;
}

function colourSwitch() {
  const row = el("label", "om-deskset-row om-deskset-switch");
  const box = el("input");
  box.type = "checkbox";
  box.checked = authorColours();
  box.onchange = async () => {
    try {
      await app.extensionManager.setting.set("openManager.programColours", box.checked);
    } catch {}
    repaintLooks();
  };
  row.appendChild(box);
  row.appendChild(el("span", null, "Let programs colour their window bar"));
  return row;
}

function openProgramProps(entry) {
  const key = `props:program:${entry.id}`;
  const held = floatingPanel(key);
  if (held) { held.present(); return held; }
  const panel = createFloatingPanel({
    key, title: `${entry.name} properties`, ...windowSize("props"), modal: false,
  });
  const art = programIconArt(entry);
  if (art.kind === "mask") panel.setMaskIcon(art.url);
  else panel.setIcon(art.url);

  const wrap = el("div", "om-props");
  const head = el("div", "om-props-head");
  const face = el("div", "om-props-face");
  face.appendChild(omIcon({ kind: art.kind, url: art.url },
                          { name: entry.name, cls: "om-props-art", img: "om-props-img" }));
  head.appendChild(face);
  const titles = el("div");
  titles.appendChild(el("div", "om-props-name", entry.name));
  titles.appendChild(el("div", "om-props-sub", entry.hint || ""));
  head.appendChild(titles);
  wrap.appendChild(head);

  const rows = el("div", "om-props-rows");
  const row = (label, value) => {
    const one = el("div", "om-props-row");
    one.appendChild(el("span", "om-props-key", label));
    one.appendChild(el("span", "om-props-value", value));
    rows.appendChild(one);
    return one;
  };
  const surfaces = [];
  if (entry.surfaces?.desktop) surfaces.push("desktop");
  if (entry.surfaces?.start !== false) surfaces.push("start menu");
  row("Name", entry.name);
  row("Id", entry.id);
  row("Author", entry.author || "unstated");
  row("Version", entry.version || "unstated");
  row("Windows", entry.multiple ? "several at once" : "one at a time");
  row("Appears in", surfaces.join(", ") || "nowhere on its own");
  row("State", deskProgramsOff.includes(entry.id) ? "Switched off" : "Switched on");
  wrap.appendChild(rows);

  if ((entry.tags || []).length) {
    wrap.appendChild(el("div", "om-props-head2", "Keywords"));
    const keys = el("div", "om-props-keys");
    for (const tag of entry.tags) keys.appendChild(el("span", "om-props-key-chip", tag));
    wrap.appendChild(keys);
  }

  wrap.appendChild(el("div", "om-props-head2", "Declared"));
  const caps = el("div", "om-props-keys");
  const held2 = entry.capabilities || [];
  if (!held2.length) caps.appendChild(el("span", "om-props-note", "Nothing."));
  for (const one of held2) caps.appendChild(el("span", "om-props-key-chip", one));
  wrap.appendChild(caps);
  wrap.appendChild(el("div", "om-props-note",
    "Declared by the author and not verified. A program ships with Open Manager and runs "
    + "with everything this page has."));

  panel.body.appendChild(wrap);
  return panel;
}

function openManagePrograms() {
  const held = floatingPanel("programs");
  if (held) { held.present(); return held; }
  const panel = createFloatingPanel({
    key: "programs", title: "Manage Programs", ...windowSize("folder"), modal: false,
  });
  panel.setMaskIcon(ICON_PROGRAM);

  const find = el("input", "om-search");
  find.placeholder = "Search by name, author or keyword";
  find.spellcheck = false;
  panel.tools.appendChild(find);
  const list = el("div", "om-mgr-list");
  panel.body.appendChild(list);

  const state = { all: [], problems: [], find: "" };

  const matches = (one) => {
    const want = state.find.trim().toLowerCase();
    if (!want) return true;
    return [one.name, one.id, one.author, one.hint, ...(one.tags || [])]
      .filter(Boolean).some((text) => String(text).toLowerCase().includes(want));
  };

  const draw = () => {
    const shown = state.all.filter(matches);
    list.replaceChildren();
    if (!shown.length) {
      list.appendChild(el("div", "om-fold-empty",
        state.all.length ? "Nothing matches that." : "No programs are installed."));
    }
    for (const one of shown) {
      const row = el("div", "om-mgr-row");
      const art = programIconArt(one);
      row.appendChild(omIcon({ kind: art.kind, url: art.url },
                             { name: one.name, cls: "om-mgr-art", img: "om-mgr-shot" }));
      const text = el("div", "om-mgr-text");
      const head = el("div", "om-mgr-name", one.name);
      if (one.author) head.appendChild(el("span", "om-mgr-by", one.author));
      text.appendChild(head);
      text.appendChild(el("div", "om-mgr-hint", one.hint || ""));
      if ((one.tags || []).length) {
        text.appendChild(el("div", "om-mgr-keys", one.tags.join("  ·  ")));
      }
      row.appendChild(text);
      const mark = el("label", "om-mgr-switch");
      const box = el("input");
      box.type = "checkbox";
      box.checked = !deskProgramsOff.includes(one.id);
      box.onchange = () => { setProgramOn(one.id, box.checked); };
      mark.appendChild(box);
      row.appendChild(mark);
      row.ondblclick = () => openProgramProps(one);
      row.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        openRowMenu(row, { items: [
          { label: "Properties", fn: () => openProgramProps(one) },
          { label: deskProgramsOff.includes(one.id) ? "Switch on" : "Switch off",
            fn: () => { setProgramOn(one.id, deskProgramsOff.includes(one.id)); draw(); } },
        ], align: "left" });
      });
      liveTip(row, () => ({
        lead: one.name,
        facts: [
          ["Version", one.version || "unstated"],
          ["Windows", one.multiple ? "several allowed" : "one"],
        ],
        lines: [one.hint || ""],
      }));
      list.appendChild(row);
    }
    for (const problem of state.problems) {
      list.appendChild(el("div", "om-deskset-note", problem));
    }
  };

  const fill = async () => {
    try {
      const answer = await (await api.fetchApi(`${API}/programs`)).json();
      state.all = answer?.programs || [];
      state.problems = answer?.problems || [];
    } catch {
      state.all = [];
      state.problems = ["The programs could not be read."];
    }
    if (!panel.el.isConnected) return;
    panel.setBadge(countNote(state.all.length, "program"));
    draw();
  };

  let typing = 0;
  find.oninput = () => {
    clearTimeout(typing);
    typing = setTimeout(() => { state.find = find.value; draw(); }, 200);
  };
  panel._omFill = fill;
  fill();
  return panel;
}

const FILE_WORDS = {
  image: "Image", video: "Video", audio: "Audio", model: "Model", text: "Text",
  other: "File",
};

let fileWindows = 0;

function openFileBrowser(start = "", at = "") {
  const wanted = `${start}|${at || ""}`;
  for (const [key, one] of floatPanels) {
    if (!key.startsWith("files:")) continue;
    if (start ? one._omAt?.() === wanted : true) {
      one.present();
      return one;
    }
  }
  const panel = createFloatingPanel({
    key: `files:${++fileWindows}`, title: "Folders", ...windowSize("folder"), modal: false,
  });
  panel.setMaskIcon(ICON_FOLDER);

  const state = { places: [], place: start, path: at || "", writable: false, heavy: false,
                  folders: [], items: [], marks: {} };

  const placeWritable = (held) => !!state.places.find((one) => one.id === held)?.writable;

  const wrap = el("div", "om-files");
  const tree = el("div", "om-files-tree");
  const right = el("div", "om-files-right");
  const trail = el("div", "om-files-trail");
  const list = el("div", "om-files-list");
  list.tabIndex = 0;
  right.appendChild(trail);
  right.appendChild(list);
  const grip = el("div", "om-files-grip");
  grip.title = "Resize";
  wrap.appendChild(tree);
  wrap.appendChild(grip);
  wrap.appendChild(right);

  const TREE_KEY = "om-files-tree-width";
  const TREE_MIN = 150;
  const TREE_MAX = 560;

  const setTree = (width) => {
    const held = Math.max(TREE_MIN, Math.min(TREE_MAX, Math.round(width)));
    tree.style.width = `${held}px`;
    return held;
  };

  try {
    setTree(Number(localStorage.getItem(TREE_KEY)) || 212);
  } catch {
    setTree(212);
  }

  grip.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    try {
      grip.setPointerCapture(event.pointerId);
    } catch {
    }
    const from = { x: event.clientX, width: tree.offsetWidth };
    const move = (held) => setTree(from.width + (held.clientX - from.x));
    const done = () => {
      grip.removeEventListener("pointermove", move);
      grip.removeEventListener("pointerup", done);
      grip.removeEventListener("pointercancel", done);
      try { localStorage.setItem(TREE_KEY, String(tree.offsetWidth)); } catch {}
    };
    grip.addEventListener("pointermove", move);
    grip.addEventListener("pointerup", done);
    grip.addEventListener("pointercancel", done);
  });
  panel.body.appendChild(wrap);

  const here = (name) => (state.path ? `${state.path}/${name}` : name);

  let chosen = "";
  let order = [];

  const rowFor = (name) => list.querySelector(`[data-om-name="${CSS.escape(name)}"]`);

  const mark = (name, { scroll = false } = {}) => {
    chosen = name || "";
    for (const row of list.querySelectorAll(".om-files-row")) {
      row.classList.toggle("om-files-row-on", row.dataset.omName === chosen);
    }
    if (scroll) rowFor(chosen)?.scrollIntoView({ block: "nearest" });
  };

  const step = (by) => {
    if (!order.length) return;
    const at = order.indexOf(chosen);
    const to = at < 0
      ? (by > 0 ? 0 : order.length - 1)
      : Math.max(0, Math.min(order.length - 1, at + by));
    mark(order[to], { scroll: true });
  };

  const markOf = (place, path) => state.marks[`${place}|${path || ""}`] || null;

  const markArt = (place, path, name) => {
    const mark = markOf(place, path);
    if (mark?.icon) {
      return omIcon(
        { kind: "src", url: `${API}/marks/icon?name=${encodeURIComponent(mark.icon)}`,
          fallback: { kind: "mask", url: ICON_FOLDER } },
        { name, cls: "om-fold-art", img: "om-fold-img" });
    }
    return omIcon({ kind: "mask", url: ICON_FOLDER, tint: mark?.colour || "" },
                  { name, cls: "om-fold-art", img: "om-fold-img" });
  };

  const readMarks = async () => {
    try {
      const answer = await (await api.fetchApi(`${API}/marks`)).json();
      state.marks = answer?.ok ? (answer.marks || {}) : {};
    } catch {
      state.marks = {};
    }
  };

  const ask = async (place, path) => {
    const query = new URLSearchParams({ place, path: path || "" });
    try {
      return await (await api.fetchApi(`${API}/files?${query}`)).json();
    } catch {
      return { ok: false, reason: "That directory could not be read." };
    }
  };

  const post = async (where, body) => {
    try {
      return await dlPost(where, body);
    } catch {
      return { ok: false, reason: "The server did not answer." };
    }
  };

  const drawTrail = () => {
    trail.replaceChildren();
    const place = state.places.find((one) => one.id === state.place);
    if (!place) return;
    const step = (label, to, last) => {
      const crumb = el("button", `gal-step${last ? " gal-step-here" : ""}`, label);
      crumb.onclick = () => go(state.place, to);
      trail.appendChild(crumb);
    };
    const parts = state.path ? state.path.split("/") : [];
    step(place.label, "", !parts.length);
    let walked = "";
    parts.forEach((part, at) => {
      walked = walked ? `${walked}/${part}` : part;
      trail.appendChild(el("span", "gal-sep", "›"));
      step(shownName(part), walked, at === parts.length - 1);
    });
    if (!state.writable) trail.appendChild(el("span", "om-files-readonly", "Read-only"));
  };

  const tintFolder = (path) => {
    const field = el("input");
    field.type = "color";
    field.value = markOf(state.place, path)?.colour || "#3fb950";
    field.style.position = "fixed";
    field.style.left = "-9999px";
    document.body.appendChild(field);
    field.addEventListener("change", async () => {
      const picked = field.value;
      field.remove();
      const answer = await post("/marks/colour",
                                { place: state.place, path, colour: picked });
      if (!answer?.ok) {
        notify("Not coloured", answer?.reason || "The colour could not be kept.");
        return;
      }
      await readMarks();
      drawTree();
      fill();
    });
    field.click();
  };

  const iconFolder = (path) => {
    const field = el("input");
    field.type = "file";
    field.accept = ".png,.webp,.ico,image/png,image/webp,image/x-icon";
    field.style.display = "none";
    document.body.appendChild(field);
    field.addEventListener("change", async () => {
      const file = field.files?.[0];
      field.remove();
      if (!file) return;
      const at = file.name.lastIndexOf(".");
      const suffix = at < 0 ? "" : file.name.slice(at).toLowerCase();
      const held = await file.arrayBuffer();
      let raw = "";
      const bytes = new Uint8Array(held);
      for (let i = 0; i < bytes.length; i += 1) raw += String.fromCharCode(bytes[i]);
      const answer = await post("/marks/icon",
                                { place: state.place, path, suffix, data: btoa(raw) });
      if (!answer?.ok) {
        notify("Not set", answer?.reason || "The icon could not be kept.");
        return;
      }
      await readMarks();
      drawTree();
      fill();
    });
    field.click();
  };

  const shownName = (part) => (state.place.startsWith("docs:")
    ? String(part || "").replace(/~[0-9a-z]{8}(\.[A-Za-z0-9]+)?$/, "")
    : part);


  const openFileAt = async (one) => {
    const kind = SHOWN_KINDS[one.kind] || "";
    if (kind) {
      const beside = state.items
        .filter((other) => SHOWN_KINDS[other.kind] === kind)
        .map((other) => ({ name: other.name, sub: state.path || "", kind,
                           size: other.size, at: other.at }));
      runProgramById(kind === "still" ? "viewer" : "player",
                     { items: beside, name: one.name, root: viewRootOf(state.place) });
      return;
    }
    if (state.place.startsWith("docs:")) {
      const here = docsPathHere();
      const want = here ? `${here}/${one.name}` : one.name;
      const answer = await docsIn(here);
      const item = (answer.items || []).find((other) => docPath(other) === want);
      if (item) { openDoc(item); return; }
    }
    if (EDITS_HERE.has(suffixOf(one.name))) {
      openNote(placeDoc(state.place, here(one.name), one.label || one.name));
      return;
    }
    notify(one.label || one.name, "No viewer for this kind of file.");
  };

  const newFolder = el("button", "om-btn", "New folder");
  newFolder.onclick = async () => {
    const asked = await askText("New folder", "Untitled", "Make");
    if (asked === null) return;
    const answer = await post("/files/folder",
                              { place: state.place, path: state.path, name: String(asked) });
    if (!answer?.ok) {
      notify("Not made", answer?.reason || "It could not be made.");
      return;
    }
    under.delete(branch(state.place, state.path));
    await readInto(state.place, state.path);
    drawTree();
    fill();
  };

  const docsPathHere = () => {
    const home = state.place === "docs:documents" ? DOC_DOCUMENTS : DOC_DESKTOP;
    return state.path ? `${home}/${state.path}` : home;
  };

  const newNote = el("button", "om-btn om-go", "New note");
  newNote.onclick = async () => {
    const answer = await dlPost("/docs/new",
                                { parent: docsPathHere(), name: NEW_NOTE_NAME })
      .catch(() => null);
    if (!answer?.ok) {
      notify("Not made", answer?.reason || "It could not be made.");
      return;
    }
    fill();
    openDoc(answer.item);
  };

  panel.tools.appendChild(newNote);
  panel.tools.appendChild(newFolder);

  const drawTools = () => {
    newFolder.hidden = !state.writable;
    newNote.hidden = !(state.writable && state.place.startsWith("docs:"));
  };

  const pickTarget = (title) => new Promise((settle) => {
    const backdrop = el("div", "om-backdrop");
    const box = el("div", "om-note om-note-wide om-save");
    box.appendChild(el("div", "om-note-title", title));
    const trail = el("div", "om-save-trail");
    const list = el("div", "om-fold-list om-save-list");
    const foot = el("div", "om-note-foot");
    const cancel = el("button", "om-btn", "Cancel");
    const choose = el("button", "om-btn om-go", "Choose this folder");
    foot.appendChild(cancel);
    foot.appendChild(choose);
    box.appendChild(trail);
    box.appendChild(list);
    box.appendChild(foot);
    backdrop.appendChild(box);
    document.body.appendChild(backdrop);

    let atPlace = "";
    let atPath = "";

    const done = (answer) => { backdrop.remove(); settle(answer); };
    cancel.onclick = () => done(null);
    choose.onclick = () => done(atPlace ? { place: atPlace, path: atPath } : null);
    closeOn(backdrop, () => done(null));

    const step = (label, fn, last) => {
      const crumb = el("button", `gal-step${last ? " gal-step-here" : ""}`, label);
      crumb.onclick = fn;
      trail.appendChild(crumb);
    };

    const show = async () => {
      trail.replaceChildren();
      list.replaceChildren();
      choose.disabled = !atPlace;
      if (!atPlace) {
        step("Everywhere", () => {}, true);
        let group = "";
        for (const one of state.places) {
          if (one.group !== group) {
            group = one.group;
            list.appendChild(el("div", "om-files-group", group));
          }
          const row = el("div", "om-fold-row");
          row.appendChild(omIcon({ kind: "mask", url: ICON_FOLDER },
                                 { name: one.label, cls: "om-fold-art", img: "om-fold-img" }));
          row.appendChild(el("span", "om-fold-name", one.label));
          if (one.note) row.appendChild(el("span", "om-files-where", one.note));
          row.onclick = () => { atPlace = one.id; atPath = ""; void show(); };
          list.appendChild(row);
        }
        return;
      }
      const place = state.places.find((one) => one.id === atPlace);
      step("Everywhere", () => { atPlace = ""; atPath = ""; void show(); }, false);
      trail.appendChild(el("span", "gal-sep", "›"));
      const parts = atPath ? atPath.split("/") : [];
      step(place?.label || atPlace, () => { atPath = ""; void show(); }, !parts.length);
      let walked = "";
      parts.forEach((part, at) => {
        walked = walked ? `${walked}/${part}` : part;
        const to = walked;
        trail.appendChild(el("span", "gal-sep", "›"));
        step(shownName(part), () => { atPath = to; void show(); }, at === parts.length - 1);
      });
      const answer = await ask(atPlace, atPath);
      if (!backdrop.isConnected) return;
      const folders = answer?.ok ? (answer.folders || []) : [];
      if (!folders.length) {
        list.replaceChildren(el("div", "om-fold-empty", "No folders in here."));
        return;
      }
      list.replaceChildren();
      for (const one of folders) {
        const row = el("div", "om-fold-row");
        row.appendChild(omIcon({ kind: "mask", url: ICON_FOLDER },
                               { name: one.name, cls: "om-fold-art", img: "om-fold-img" }));
        row.appendChild(el("span", "om-fold-name", one.label || one.name));
        row.onclick = () => {
          atPath = atPath ? `${atPath}/${one.name}` : one.name;
          void show();
        };
        list.appendChild(row);
      }
    };
    void show();
  });

  const sendTo = async (name, keep) => {
    const wanted = await pickTarget(keep ? "Copy to" : "Move to");
    if (!wanted) return;
    const answer = await post(keep ? "/files/copy" : "/files/move", {
      place: state.place, path: here(name), into: wanted.path, intoPlace: wanted.place,
    });
    if (!answer?.ok) {
      notify(keep ? "Not copied" : "Not moved", answer?.reason || "It could not be sent there.");
      return;
    }
    under.delete(branch(wanted.place, wanted.path));
    drawTree();
    fill();
    if (String(wanted.place).startsWith("docs:") || state.place.startsWith("docs:")) {
      refreshDocs();
    }
    toast(keep ? `Copied ${name}` : `Moved ${name}`);
  };

  const rowMenu = (name, folder) => {
    const path = here(name);
    const items = [
      folder
        ? { label: "Open", fn: () => go(state.place, path) }
        : { label: "Open", fn: () => {
            const one = state.items.find((other) => other.name === name);
            if (one) void openFileAt(one);
          } },
      folder
        ? { label: "Shortcut on the desktop",
            fn: () => makeFolderShortcut(state.place, path, name) }
        : null,
    ];
    if (state.writable) {
      items.push({ label: "Move to...", fn: () => sendTo(name, false) });
      items.push({ label: "Copy to...", fn: () => sendTo(name, true) });
      items.push({ label: "Rename", fn: async () => {
        const asked = await askText("Rename", name, "Rename");
        if (asked === null) return;
        const answer = await post("/files/rename",
                                  { place: state.place, path, name: String(asked) });
        if (!answer?.ok) {
          notify("Not renamed", answer?.reason || "It could not be renamed.");
          return;
        }
        fill();
      } });
      if (folder) {
        items.push({ label: "Colour...", fn: () => tintFolder(path) });
        items.push({ label: "Icon...", fn: () => iconFolder(path) });
        if (markOf(state.place, path)) {
          items.push({ label: "Plain folder", fn: async () => {
            await post("/marks/clear", { place: state.place, path });
            await readMarks();
            drawTree();
            fill();
          } });
        }
      }
      items.push({ label: "Delete", danger: true, fn: async () => {
        if (state.place.startsWith("docs:")) {
          await removeDoc({ name, path: docsPathOf(state.place, path),
                            kind: docKindOf(name, folder) }, fill);
          return;
        }
        const sure = await confirmAction(`Delete ${name}?`,
          state.heavy
            ? "It is deleted from disk, not moved to the Trash. Getting it back means "
              + "downloading it again."
            : "It is deleted from disk, not moved to the Trash.",
          "Delete", true);
        if (!sure) return;
        const answer = await post("/files/remove", { place: state.place, path });
        if (!answer?.ok) {
          notify("Not deleted", answer?.reason || "It could not be deleted.");
          return;
        }
        fill();
      } });
    }
    return items.filter(Boolean);
  };

  const drawList = () => {
    list.replaceChildren();
    if (!state.folders.length && !state.items.length) {
      list.appendChild(el("div", "om-fold-empty", "Nothing here."));
      return;
    }
    for (const one of state.folders) {
      const row = el("div", "om-files-row om-files-folder");
      row.dataset.omName = one.name;
      row.onclick = () => mark(one.name);
      row.appendChild(markArt(state.place, here(one.name), one.name));
      row.appendChild(el("span", "om-fold-name", one.label || one.name));
      row.appendChild(el("span", "om-fold-meta", "Folder"));
      row.ondblclick = () => go(state.place, here(one.name));
      row.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        mark(one.name);
        openRowMenu(row, { items: rowMenu(one.name, true), align: "left" });
      });
      if (state.writable) dropFileInto(row, () => here(one.name));
      if (state.writable) dragFileFrom(row, one.name, true);
      list.appendChild(row);
    }
    for (const one of state.items) {
      const row = el("div", "om-files-row");
      row.dataset.omName = one.name;
      row.onclick = () => mark(one.name);
      row.appendChild(el("span", "om-files-kind", FILE_WORDS[one.kind] || "File"));
      row.appendChild(el("span", "om-fold-name", one.label || one.name));
      row.appendChild(el("span", "om-fold-meta", bytesText(one.size)));
      row.ondblclick = () => { void openFileAt(one); };
      row.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        mark(one.name);
        openRowMenu(row, { items: rowMenu(one.name, false), align: "left" });
      });
      if (state.writable) dragFileFrom(row, one.name);
      list.appendChild(row);
    }
  };

  const dragFileFrom = (row, name, folder) => {
    row.draggable = true;
    row.dataset.omDrag = "1";
    row.addEventListener("dragstart", (event) => {
      event.dataTransfer.setData(FILE_MOVE_TYPE, JSON.stringify({
        place: state.place, path: here(name), name, kind: docKindOf(name, folder),
      }));
      event.dataTransfer.effectAllowed = "copyMove";
    });
  };

  const dropFileInto = (node, into, place = null, unless = null) => {
    node.addEventListener("dragover", (event) => {
      if (unless?.(event)) return;
      if (![...(event.dataTransfer?.types || [])].includes(FILE_MOVE_TYPE)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = event.ctrlKey ? "copy" : "move";
      node.classList.add("om-fold-over");
    });
    node.addEventListener("dragleave", () => node.classList.remove("om-fold-over"));
    node.addEventListener("drop", async (event) => {
      node.classList.remove("om-fold-over");
      if (unless?.(event)) return;
      if (![...(event.dataTransfer?.types || [])].includes(FILE_MOVE_TYPE)) return;
      event.preventDefault();
      event.stopPropagation();
      let sent = null;
      try { sent = JSON.parse(event.dataTransfer.getData(FILE_MOVE_TYPE)); } catch { return; }
      if (!sent?.path) return;
      const wanted = (typeof place === "function" ? place() : place) || state.place;
      const keep = event.ctrlKey;
      const target = into();
      if (sent.place === wanted
          && (sent.path === target || parentOf(sent.path) === target)) return;
      const answer = await post(keep ? "/files/copy" : "/files/move",
                                { place: sent.place, path: sent.path,
                                  into: target, intoPlace: wanted });
      if (!answer?.ok) {
        notify(keep ? "Not copied" : "Not moved",
               answer?.reason || (keep ? "It could not be copied." : "It could not be moved."));
        return;
      }
      under.delete(branch(wanted, target));
      if (!keep) under.delete(branch(sent.place, parentOf(sent.path)));
      drawTree();
      fill();
      if (String(wanted).startsWith("docs:")
          || (!keep && String(sent.place || "").startsWith("docs:"))) refreshDocs();
    });
  };

  dropFileInto(list, () => state.path, null,
               (event) => !state.writable || !!event.target?.closest?.(".om-files-folder"));

  const opened = new Set();
  const under = new Map();

  const branch = (place, path) => `${place}|${path || ""}`;

  const readInto = async (place, path) => {
    const key = branch(place, path);
    if (under.has(key)) return under.get(key);
    const answer = await ask(place, path);
    const found = answer?.ok ? (answer.folders || []) : [];
    under.set(key, found);
    return found;
  };

  const openTo = async (place, path) => {
    opened.add(branch(place, ""));
    await readInto(place, "");
    const parts = String(path || "").split("/").filter(Boolean);
    let walked = "";
    for (const part of parts) {
      opened.add(branch(place, walked));
      await readInto(place, walked);
      walked = walked ? `${walked}/${part}` : part;
    }
    drawTree();
  };

  const treeRow = (place, path, label, depth, whole, note = "") => {
    const key = branch(place, path);
    const here = place === state.place && (path || "") === (state.path || "");
    const row = el("div", `om-files-node${here ? " om-files-node-on" : ""}`);
    row.style.paddingLeft = `${4 + depth * 13}px`;
    const twist = el("button", "om-files-twist", opened.has(key) ? "▼" : "▶");
    twist.title = opened.has(key) ? "Collapse" : "Expand";
    twist.onclick = async (event) => {
      event.stopPropagation();
      if (opened.has(key)) {
        opened.delete(key);
        drawTree();
        return;
      }
      opened.add(key);
      await readInto(place, path);
      drawTree();
    };
    const art = markArt(place, path, label);
    const name = el("button", "om-files-place", label);
    name.title = whole || label;
    name.onclick = async () => {
      if (!opened.has(key)) {
        opened.add(key);
        await readInto(place, path);
      }
      go(place, path);
    };
    if (placeWritable(place)) dropFileInto(row, () => path, place);
    row.appendChild(twist);
    row.appendChild(art);
    row.appendChild(name);
    if (note) {
      const where = el("span", "om-files-where", note);
      where.title = whole || note;
      row.appendChild(where);
    }
    return row;
  };

  const growTree = (place, path, depth, into) => {
    if (!opened.has(branch(place, path))) return;
    for (const one of under.get(branch(place, path)) || []) {
      const below = path ? `${path}/${one.name}` : one.name;
      into.appendChild(treeRow(place, below, one.label || one.name, depth, below));
      growTree(place, below, depth + 1, into);
    }
  };

  list.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") { event.preventDefault(); step(1); }
    else if (event.key === "ArrowUp") { event.preventDefault(); step(-1); }
    else if (event.key === "Home") { event.preventDefault(); mark(order[0] || "", { scroll: true }); }
    else if (event.key === "End") {
      event.preventDefault();
      mark(order[order.length - 1] || "", { scroll: true });
    } else if (event.key === "Enter" && chosen) {
      event.preventDefault();
      if (state.folders.some((one) => one.name === chosen)) { go(state.place, here(chosen)); return; }
      const one = state.items.find((other) => other.name === chosen);
      if (one) void openFileAt(one);
    } else if (event.key === "Escape") {
      mark("");
    }
  });

  const GROUPS_KEY = "om-files-shut-groups";

  const readShut = () => {
    try {
      const held = JSON.parse(localStorage.getItem(GROUPS_KEY) || "[]");
      return new Set(Array.isArray(held) ? held.filter((one) => typeof one === "string") : []);
    } catch {
      return new Set();
    }
  };

  let shutGroups = readShut();

  const keepShut = () => {
    try {
      localStorage.setItem(GROUPS_KEY, JSON.stringify([...shutGroups]));
    } catch {
    }
  };

  const groupRow = (name, count) => {
    const shut = shutGroups.has(name);
    const row = el("button", `om-files-group${shut ? " om-files-group-shut" : ""}`);
    row.type = "button";
    row.setAttribute("aria-expanded", shut ? "false" : "true");
    row.appendChild(el("span", "om-files-group-mark", shut ? "▶" : "▼"));
    row.appendChild(el("span", "om-files-group-name", name));
    if (shut) row.appendChild(el("span", "om-files-group-count", String(count)));
    row.onclick = () => {
      if (shutGroups.has(name)) shutGroups.delete(name);
      else shutGroups.add(name);
      keepShut();
      drawTree();
    };
    return row;
  };

  const drawTree = () => {
    tree.replaceChildren();
    const order = [];
    const byGroup = new Map();
    for (const one of state.places) {
      if (!byGroup.has(one.group)) { byGroup.set(one.group, []); order.push(one.group); }
      byGroup.get(one.group).push(one);
    }
    for (const name of order) {
      const held = byGroup.get(name) || [];
      tree.appendChild(groupRow(name, held.length));
      if (shutGroups.has(name)) continue;
      for (const one of held) {
        tree.appendChild(treeRow(one.id, "", one.label, 0, one.path, one.note));
        growTree(one.id, "", 1, tree);
      }
    }
  };

  const fill = async () => {
    const answer = await ask(state.place, state.path);
    if (!panel.el.isConnected) return;
    if (!answer.ok) {
      state.folders = [];
      state.items = [];
      state.writable = false;
      drawTrail();
      list.replaceChildren(el("div", "om-fold-empty",
                              answer.reason || "That could not be read."));
      return;
    }
    state.folders = answer.folders || [];
    state.items = answer.items || [];
    state.writable = !!answer.writable;
    drawTools();
    state.heavy = !!answer.heavy;
    panel.setBadge(countNote(state.items.length, "file"));
    drawTrail();
    drawList();
    order = [...state.folders.map((one) => one.name),
             ...state.items.map((one) => one.name)];
    mark(order.includes(chosen) ? chosen : "");
  };

  const go = (place, path) => {
    state.place = place;
    state.path = String(path || "");
    drawTree();
    fill();
    void openTo(place, state.path);
  };

  (async () => {
    let answer = null;
    await readMarks();
    try {
      answer = await (await api.fetchApi(`${API}/files/places`)).json();
    } catch {
      answer = null;
    }
    if (!panel.el.isConnected) return;
    if (!answer?.ok) {
      wrap.replaceChildren(el("div", "om-fold-empty",
        answer?.reason || "The file browser is not available."));
      return;
    }
    state.places = answer.places || [];
    go(state.place || state.places[0]?.id || "", state.path);
  })();

  panel._omFill = fill;
  panel._omAt = () => `${state.place}|${state.path || ""}`;
  return panel;
}

const FILE_MOVE_TYPE = "application/x-om-hostfile";

function makeFolderShortcut(place, path, name) {
  pinDesk(filePinKey(place, path));
  toast(`Shortcut to ${name} added.`, { kind: "ok" });
}

const FILE_PIN = "files:";

function filePinKey(place, path) {
  return `${FILE_PIN}${encodeURIComponent(`${place}|${path || ""}`)}`;
}

function filePinParts(key) {
  if (!key.startsWith(FILE_PIN)) return null;
  let text = "";
  try {
    text = decodeURIComponent(key.slice(FILE_PIN.length));
  } catch {
    return null;
  }
  const at = text.lastIndexOf("|");
  if (at < 0) return null;
  return { place: text.slice(0, at), path: text.slice(at + 1) };
}

function filesSwitch() {
  const row = el("label", "om-deskset-row om-deskset-switch");
  const box = el("input");
  box.type = "checkbox";
  box.checked = panelSetting("openManager.fileBrowser", false) === true;
  box.onchange = async () => {
    try {
      await app.extensionManager.setting.set("openManager.fileBrowser", box.checked);
    } catch {}
    remountTopbar();
    if (deskLayer) paintDeskIcons();
  };
  row.appendChild(box);
  row.appendChild(el("span", null, "ComfyUI file browser"));
  const note = el("span", "om-deskset-by",
    deskGates.writes ? "writing allowed" : "read-only");
  row.appendChild(note);
  return row;
}

function deskChoice(key, label, choices, fallback, after = null) {
  const row = el("div", "om-deskset-row");
  row.appendChild(el("label", null, label));
  const pick = el("select", "om-side-select");
  for (const one of choices) {
    const option = el("option", null, one[0].toUpperCase() + one.slice(1));
    option.value = one;
    pick.appendChild(option);
  }
  const held = panelSetting(key, fallback);
  pick.value = choices.includes(held) ? held : fallback;
  pick.addEventListener("change", async () => {
    try {
      await app.extensionManager.setting.set(key, pick.value);
    } catch {}
    after?.(pick.value);
  });
  row.appendChild(pick);
  return row;
}

function deskSwitch(key, label, { fallback = false, after = null } = {}) {
  const row = el("label", "om-deskset-row om-deskset-switch");
  const box = el("input");
  box.type = "checkbox";
  box.checked = panelSetting(key, fallback) === true;
  box.onchange = async () => {
    try {
      await app.extensionManager.setting.set(key, box.checked);
    } catch {}
    after?.(box.checked);
  };
  row.appendChild(box);
  row.appendChild(el("span", null, label));
  return row;
}

function aeroSwitch() {
  const row = el("label", "om-deskset-row om-deskset-switch");
  const box = el("input");
  box.type = "checkbox";
  box.checked = panelSetting("openManager.aero", false) === true;
  box.onchange = async () => {
    try {
      await app.extensionManager.setting.set("openManager.aero", box.checked);
    } catch {}
    applyWindowLook();
  };
  row.appendChild(box);
  row.appendChild(el("span", null, "Aero window headers"));
  return row;
}

function manySwitch() {
  const row = el("label", "om-deskset-row om-deskset-switch");
  const box = el("input");
  box.type = "checkbox";
  box.checked = panelSetting("openManager.programWindows", false) === true;
  box.onchange = async () => {
    try {
      await app.extensionManager.setting.set("openManager.programWindows", box.checked);
    } catch {}
  };
  row.appendChild(box);
  row.appendChild(el("span", null, "Open a window each time, for programs that allow it"));
  return row;
}

function openDesktopSettings() {
  const held = floatingPanel("desktop");
  if (held) { held.present(); return held; }
  const panel = createFloatingPanel({
    key: "desktop", title: "Desktop Settings", ...windowSize("desktop"), modal: false,
  });
  panel.setMaskIcon(ICON_DESKTOP);

  const body = el("div", "om-deskset");
  const screen = el("div", "om-deskset-screen");
  body.appendChild(screen);
  body.appendChild(el("div", "om-deskset-stand"));

  const redraw = () => { applyDeskLook(); applyWindowLook(); deskSetPreview(screen); };
  slideWallpaper(screen, () => redraw());
  panel.el.addEventListener("om-float-resize", () => deskSetPreview(screen));
  window.addEventListener("resize", () => {
    if (panel.el.isConnected) deskSetPreview(screen);
  });

  body.appendChild(deskHeading("Wallpaper"));

  const fitRow = el("div", "om-deskset-row");
  fitRow.appendChild(el("label", null, "Wallpaper fit"));
  const fit = el("select", "om-side-select");
  for (const [value, label] of [["cover", "Cover"], ["contain", "Contain"],
                                ["centre", "Centre"], ["tile", "Tile"]]) {
    const option = el("option", null, label);
    option.value = value;
    fit.appendChild(option);
  }
  fit.value = String(panelSetting("openManager.desktopFit", "cover"));
  fit.onchange = async () => {
    await app.extensionManager.setting.set("openManager.desktopFit", fit.value);
    redraw();
  };
  fitRow.appendChild(fit);
  body.appendChild(fitRow);

  const slider = (label, key, low, high, fallback, unit = "px") => {
    const row = el("div", "om-deskset-row");
    row.appendChild(el("label", null, label));
    const range = el("input", null);
    range.type = "range";
    range.min = String(low);
    range.max = String(high);
    range.step = "1";
    range.value = String(deskNumber(key, fallback, low, high));
    const figure = el("span", "om-deskset-figure", `${range.value}${unit}`);
    range.oninput = () => { figure.textContent = `${range.value}${unit}`; };
    range.onchange = async () => {
      await app.extensionManager.setting.set(key, Number(range.value));
      redraw();
    };
    row.appendChild(range);
    row.appendChild(figure);
    return row;
  };
  body.appendChild(slider("Wallpaper across", "openManager.desktopFocusX", 0, 100, 50, "%"));
  body.appendChild(slider("Wallpaper down", "openManager.desktopFocusY", 0, 100, 50, "%"));

  const papers = el("div", "om-deskset-papers");
  body.appendChild(papers);
  deskSetPapers(papers, screen);

  const tools = el("div", "om-deskset-row");
  const add = el("button", "om-btn om-go", "Add a wallpaper");
  const file = el("input", null);
  file.type = "file";
  file.accept = Object.keys({ ".png": 1, ".jpg": 1, ".jpeg": 1, ".webp": 1, ".gif": 1 })
    .join(",");
  file.style.display = "none";
  file.onchange = async () => {
    const chosen = file.files?.[0];
    file.value = "";
    if (!chosen) return;
    const name = chosen.name.replace(/[^A-Za-z0-9._ -]+/g, "-").slice(-120);
    const payload = await chosen.arrayBuffer();
    let answer = null;
    try {
      answer = await (await api.fetchApi(
        `${API}/wallpaper/save?name=${encodeURIComponent(name)}`,
        { method: "POST", body: payload },
      )).json();
    } catch {
      answer = null;
    }
    if (!answer?.ok) {
      notify("Not kept", answer?.reason || "That image could not be kept.");
      return;
    }
    await app.extensionManager.setting.set("openManager.desktopWallpaper", answer.name);
    redraw();
    deskSetPapers(papers, screen);
    toast(`${answer.name} is now the wallpaper.`, { kind: "ok" });
  };
  add.onclick = () => file.click();
  const clear = el("button", "om-btn", "No wallpaper");
  clear.onclick = async () => {
    await app.extensionManager.setting.set("openManager.desktopWallpaper", "");
    redraw();
    deskSetPapers(papers, screen);
  };
  tools.appendChild(add);
  tools.appendChild(clear);
  tools.appendChild(file);
  body.appendChild(tools);

  body.appendChild(deskHeading("Icons"));
  body.appendChild(slider("Icon size", "openManager.desktopIconSize", 28, 96, 44));
  body.appendChild(slider("Label size", "openManager.desktopLabelSize", 9, 18, 12));

  body.appendChild(deskHeading("Windows"));
  body.appendChild(windowPalette());
  body.appendChild(colourSwitch());
  body.appendChild(aeroSwitch());
  body.appendChild(slider("Aero opacity", "openManager.aeroAlpha", 10, 100, 55, "%"));
  body.appendChild(slider("Aero darkening", "openManager.aeroDark", 0, 70, 18, "%"));
  body.appendChild(slider("Aero blur", "openManager.aeroBlur", 0, 40, 12));
  body.appendChild(deskSwitch("openManager.blurInactive", "Blur inactive windows",
                              { after: () => applyWindowLook() }));
  body.appendChild(slider("Inactive blur", "openManager.blurAmount", 1, 12, 3));
  body.appendChild(deskSwitch("openManager.windowShadow", "Drop shadow",
                              { fallback: true, after: () => applyWindowLook() }));
  body.appendChild(deskSwitch("openManager.windowIcons", "Show an icon in each window title",
                              { fallback: true }));
  body.appendChild(slider("Title text size", "openManager.windowTitleSize", 10, 28, 15));
  body.appendChild(slider("Content text size", "openManager.windowTextSize", 10, 22, 13));
  body.appendChild(slider("Header height", "openManager.panelHeaders", 30, 64, 44));
  body.appendChild(deskChoice("openManager.windowSize", "Default window size",
                              ["compact", "standard", "large"], "large"));

  body.appendChild(deskHeading("Taskbar"));
  body.appendChild(deskSwitch("openManager.taskbar", "Show the taskbar",
                              { fallback: true, after: () => taskbarSync() }));
  body.appendChild(deskSwitch("openManager.taskbarGroups",
                              "Group windows of the same kind",
                              { after: () => taskbarSync() }));
  body.appendChild(deskSwitch("openManager.taskbarHide",
                              "Hide it until the pointer nears the bottom",
                              { after: (on) => { taskbarSync(); taskbarShow(!on); } }));
  body.appendChild(deskSwitch("openManager.startLabel", "Write Start on the Start button",
                              { after: () => taskbarSync() }));

  if (deskGates.files !== false) {
    body.appendChild(deskHeading("Files"));
    body.appendChild(filesSwitch());
  }

  body.appendChild(deskHeading("Programs"));
  body.appendChild(manySwitch());
  const manage = el("div", "om-deskset-row");
  const go = el("button", "om-btn", "Manage programs");
  go.onclick = () => openManagePrograms();
  manage.appendChild(go);
  body.appendChild(manage);


  panel.body.appendChild(body);
  deskSetPreview(screen);
  return panel;
}

function openMemoryPanel() {
  const shown = floatingPanel("memory");
  if (shown?.isMinimised?.()) { shown.present(); return shown; }
  if (shown) { closeFloatingPanel("memory"); return null; }

  let latest = null;
  const panel = createFloatingPanel({
    key: "memory", title: "Memory", ...windowSize("memory"),
    modal: !asWindow("memory"),
    onClose: () => shutDown(),
  });
  panel.setMaskIcon(ICON_MEMORY, { bar: false });
  const summary = el("div", "om-dl-summary", "");
  panel.bar.querySelector(".om-float-badge").appendChild(summary);

  const orb = buildActivityOrb();
  orb.classList.add("om-orb-mark");
  panel.bar.insertBefore(orb, panel.bar.querySelector(".om-float-title"));

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
  clearRam.title = "Clear the cached results of the last run and unload every model.";
  clearRam.onclick = () => freeing({
    ask: "Clear RAM?",
    warning: "This clears RAM regardless of what is using it, and takes the models with it.",
    action: "Clear RAM",
    body: { ram: true },
    facts: [
      ["Clears", "The cached results of the last run, in use or not"],
      ["Also unloads", "Every model"],
      ["A run in progress", "May fail, or repeat work it had kept"],
    ],
  });
  tools.appendChild(clearRam);

  const body = el("div", "om-dl-body om-mem-body");

  const linkRow = buildLinkRow(() => relink());
  body.appendChild(linkRow);

  const relink = async () => {
    linkRow.working("Asking the server...");
    dropMonitorCalls();
    let answer = null;
    try {
      answer = await monPost("/monitor",
        { client: MEMORY_CLIENT, interval: 1, watch: true }, LINK_DEADLINE);
    } catch {
      answer = null;
    }
    if (answer) {
      linkLeased(answer);
      if (answer.reading) takeReading(answer.reading);
      loadModels();
    }
    if (answer && !pushStale()) {
      linkRow.settled("Reconnected.", false);
      return;
    }
    reviveSocket(true);
    linkRow.free();
    paint();
  };

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

  const showEmpty = () => {
    if (modelList._got) return;
    const say = LINK_SAY[linkState()];
    const line = say ? say.line : "Reading what is in memory";
    if (modelList._line === line) return;
    modelList._line = line;
    modelList.replaceChildren(el("div", "om-mem-empty", line));
  };
  showEmpty();

  const paint = () => {
    if (!panel.el.isConnected) return;
    for (const one of graphs) {
      const series = memoryHistory[one.key];
      if (!one.folded()) drawGraph(one.canvas, series, one.colour);
      one.value.textContent = series.length ? `${Math.round(series[series.length - 1])}%` : "-";
    }
    const state = linkState();
    linkRow.tell(state);
    showEmpty();
    const quietFor = readingQuiet() ? readingAge() : 0;
    body.classList.toggle("om-mem-quiet", !!quietFor);
    if (quietFor) {
      orb.tell(latest?.activity, quietFor, state);
      const say = LINK_SAY[state];
      graphs[0].detail.textContent = say
        ? `${quietText(quietFor)}: ${say.short}`
        : quietText(quietFor);
      return;
    }
    if (!latest) return;
    if (latest.ram?.total) {
      graphs[1].detail.textContent =
        `${bytesText(latest.ram.used)} of ${bytesText(latest.ram.total)} · ${bytesText(latest.ram.free)} free`;
    }
    if (latest.vram?.total) {
      const busy = typeof latest.vram.util === "number"
        ? ` · ${latest.vram.util}% busy`
          + (typeof latest.vram.mem_util === "number"
            ? `, ${latest.vram.mem_util}% memory traffic` : "")
        : "";
      const hot = typeof latest.vram.temp === "number" ? ` · ${latest.vram.temp}°C` : "";
      const others = (latest.devices || []).slice(1)
        .map((one) => `GPU${one.index} ${meterText(one.used, one.total)}`
                      + (typeof one.temp === "number" ? ` ${one.temp}°` : ""))
        .join(" · ");
      graphs[2].detail.textContent =
        `${bytesText(latest.vram.used)} of ${bytesText(latest.vram.total)}${busy}${hot} · ${latest.vram.name}`
        + (others ? `. Also ${others}` : "");
    }
    orb.tell(latest.activity);
    const cores = latest.cores?.length;
    const hottest = (latest.cpu_temps || [])[0];
    graphs[0].detail.textContent = [
      cores ? `${cores} logical processors` : "",
      cores ? `busiest ${Math.round(Math.max(...latest.cores))}%` : "",
      hottest ? `${hottest.label} ${hottest.temp}°C` : "",
    ].filter(Boolean).join(" · ");
  };

  panel.el.addEventListener("om-float-resize", () => { paint(); repaintBlockMaps(panel.el); });

  const onReading = (reading) => {
    latest = reading;
    paint();
  };
  readingHooks.add(onReading);

  async function loadModels() {
    if (!panel.el.isConnected || panel._loading) return;
    panel._loading = true;
    let found;
    try {
      found = await monGet("/monitor/models", LINK_DEADLINE);
    } catch {
      if (panel.el.isConnected) showEmpty();
      return;
    } finally {
      panel._loading = false;
    }
    if (!panel.el.isConnected) return;
    try {
      const rows = found.models || [];
      const totals = found.totals || {};
      modelList._got = true;
      summary.textContent = rows.length
        ? `${rows.length} held · ${bytesText(totals.resident || 0)} resident of ${bytesText(totals.total || 0)}`
        : "";
      if (!rows.length) {
        modelList._shape = "";
        modelList.replaceChildren(el("div", "om-mem-empty", "No managed models in memory"));
        return;
      }
      const shape = rows.map((one) => one.name).join("|");
      if (modelList._shape !== shape) {
        modelList._shape = shape;
        const built = rows.map((one, position) =>
          buildMemoryModelRow({ ...one, index: position }, loadModels));
        for (const row of built) watchRow(row);
        modelList.replaceChildren(...built, ...releasedRows(rows));
      } else {
        const built = [...modelList.children].filter((node) => !node._released);
        rows.forEach((one, position) =>
          built[position]?._update?.({ ...one, index: position }));
      }
    } catch {
      modelList._got = true;
      modelList.replaceChildren(
        el("div", "om-dl-note om-dl-bad", "Could not draw the models held."));
    }
  }

  const released = new Map();
  const releasedRows = (live) => {
    const names = new Set(live.map((one) => one.name));
    for (const node of [...modelList.children]) {
      if (node._released || !node._name || names.has(node._name)) continue;
      node._released = true;
      node.classList.add("om-mem-gone");
      node.querySelector(".om-mem-split")?.classList.add("om-mem-gone-bar");
      const drop = node.querySelector(".om-mem-drop");
      if (drop) {
        drop.textContent = "Dismiss";
        drop.title = "Remove this card. The model is already gone.";
        drop.onclick = () => { released.delete(node._name); node.remove(); };
      }
      node.querySelector(".om-dl-where")?.appendChild(
        el("span", "om-dl-src om-dl-bad", "released"));
      released.set(node._name, node);
    }
    for (const [name, node] of released) {
      if (names.has(name)) { released.delete(name); node.remove(); }
    }
    return [...released.values()];
  };

  const watching = new IntersectionObserver((entries) => {
    for (const entry of entries) entry.target._inView = entry.isIntersecting;
  }, { root: modelList, rootMargin: "40px" });
  const watchRow = (row) => { row._inView = true; watching.observe(row); };
  const asleep = () => document.hidden || panel.isMinimised?.() === true;

  const heatTick = () => {
    if (!panel.el.isConnected || asleep()) return;
    for (const row of modelList.children) {
      if (row._released || !row._inView) continue;
      if (row._streaming || row._busy) row._blocks?.();
    }
  };

  const renew = () => {
    if (!panel.el.isConnected) return;
    if (asleep()) {
      if (!panel._asleep) {
        panel._asleep = true;
        monRelease(MEMORY_CLIENT);
      }
      return;
    }
    panel._asleep = false;
    if (panel._renewing || !linkMayPost()) return;
    panel._renewing = true;
    monPost("/monitor", { client: MEMORY_CLIENT, interval: 1, watch: true }, LINK_DEADLINE)
      .then((answer) => {
        linkLeased(answer);
        if (answer?.reading) takeReading(answer.reading);
      })
      .catch(() => { paint(); })
      .finally(() => { panel._renewing = false; linkTick(); });
  };
  panel._tick = setInterval(() => {
    renew();
    if (!asleep()) loadModels();
    paint();
  }, 3000);
  panel._heat = setInterval(heatTick, 1000);
  const wake = () => {
    if (asleep()) return;
    renew();
    loadModels();
    paint();
  };
  document.addEventListener("visibilitychange", wake);
  panel.el.addEventListener("om-win:minimise", () => renew());
  panel.el.addEventListener("om-win:restore", () => {
    wake();
    repaintBlockMaps(panel.el);
  });
  renew();
  loadModels();
  paint();

  const shutDown = () => {
    readingHooks.delete(onReading);
    document.removeEventListener("visibilitychange", wake);
    clearInterval(panel._tick);
    clearInterval(panel._heat);
    clearInterval(watcher);
    watching.disconnect();
    monRelease(MEMORY_CLIENT);
  };
  const stopWatching = () => {
    if (panel.el.isConnected) return;
    shutDown();
  };
  const watcher = setInterval(stopWatching, 2000);
  return panel;
}


const LIB_MAX_ROWS = 300;

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
    facts.push(["Downloaded", "Not by Open Manager"]);
  }
  facts.push(["SHA256", found.sha256 || "Not hashed"]);
  const used = found.workflows || [];
  facts.push([
    "Used by",
    used.length ? used.slice(0, 12).join(", ") + (used.length > 12 ? ` and ${used.length - 12} more` : "")
                : `No saved workflow names it (${found.searched} searched)`,
  ]);
  await chooseAction(`Where ${found.name} came from`, "", [], { wide: true, facts });
}

function buildWantedSection(entries, refresh) {
  const parts = [];
  const workflows = new Set(entries.flatMap((one) => one.workflows));
  const lead = el("div", "om-lib-lead");
  lead.textContent =
    `${entries.length} model${entries.length === 1 ? "" : "s"} that `
    + `${workflows.size === 1 ? "a saved workflow asks" : `${workflows.size} saved workflows ask`}`
    + " for and cannot find.";
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
      "Start and end match. Not yet confirmed identical."));
  } else {
    box.appendChild(el("div", "om-dl-note",
      "Same name and size. Nothing has been read yet."));
  }
  for (const copy of group.copies) {
    box.appendChild(buildLibraryRow({ ...copy, sha256: group.sha256 }, refresh));
  }
  return box;
}

function buildStorageRoot(root) {
  const row = el("div", "om-lib-row");
  const top = el("div", "om-dl-top");
  top.appendChild(el("span", "om-dl-name", root.root));
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

  const reclaim = [];
  if (report.duplicate_bytes) {
    reclaim.push(`${bytesText(report.duplicate_bytes)} in files sharing a name and size`);
  }
  if (report.partial_bytes) {
    reclaim.push(`${bytesText(report.partial_bytes)} in unfinished downloads`);
  }
  if (reclaim.length) {
    const note = el("div", "om-lib-lead");
    note.textContent = `Possibly reclaimable: ${reclaim.join(" · ")}.`;
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
      "Part files of unfinished downloads, including any still in the Download Manager."));
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

function openModelLibrary() {
  const shown = floatingPanel("library");
  if (shown?.isMinimised?.()) { shown.present(); return shown; }
  if (shown) { closeFloatingPanel("library"); return null; }

  const panel = createFloatingPanel({
    key: "library", title: "Model Library", ...windowSize("library"),
    modal: !asWindow("library"),
  });
  panel.setMaskIcon(ICON_LIBRARY);
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
      confirm.title = "Reads every candidate in full to confirm which files are identical.";
    }

    const wanted = filter.value.trim().toLowerCase();
    const matches = (one) => !wanted
      || one.name.toLowerCase().includes(wanted)
      || String(one.directory).toLowerCase().includes(wanted)
      || String(one.path).toLowerCase().includes(wanted);
    const capped = (rows) => {
      if (rows.length <= LIB_MAX_ROWS) return rows.map((one) => buildLibraryRow(one, refresh));
      const head = el("div", "om-lib-lead",
        `Showing the ${LIB_MAX_ROWS} largest of ${rows.length}.`);
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
          ? `${bytesText(libDupes.reclaimable)} reclaimable from confirmed identical copies.`
          : level === "quick"
            ? `${bytesText(libDupes.candidate_bytes)} in candidates. Start and end checked, `
              + "not yet confirmed identical."
            : `${bytesText(libDupes.candidate_bytes)} in files sharing a name and size. `
              + (mayHash()
                 ? "Nothing has been read."
                 : "Nothing has been read. Reading file contents is off in settings.");
        parts.push(head);
        if (clashes.length) {
          const warn = el("div", "om-lib-lead om-dl-bad");
          warn.textContent = `${clashes.length} filename${clashes.length === 1 ? "" : "s"} `
            + "used by files that are not the same. These are not duplicates.";
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
          + "Filenames built at run time are not seen.";
        parts.push(head, ...capped(mine.sort((a, b) => b.size - a.size)));
      }
    } else {
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
          ? "Named by a workflow that records no source for them. These cannot be fetched from here."
          : "Asked for by a workflow, not found in any model folder.";
        parts.push(head, ...named.map((name) => {
          const row = el("div", "om-lib-row om-dl-gone");
          row.appendChild(el("div", "om-dl-name", name));
          row.appendChild(el("div", "om-dl-note",
            "Not on disk."));
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
      tooltip: "The Registry, Installed, GitHub and Missing browser. On, it opens as a movable window that stays "
        + "open while you work. Off, it opens centred and closes on a click away or "
        + "Escape.",
    },
    {
      id: "openManager.windowPacks",
      name: "Pack pages as windows",
      category: ["Open Manager", "Windows", "windowPacks"],
      type: "boolean",
      defaultValue: true,
      tooltip: "A pack's own page: its versions, README, nodes and gallery. One window per pack. On, it opens as a movable window that stays "
        + "open while you work. Off, it opens centred and closes on a click away or "
        + "Escape.",
    },
    {
      id: "openManager.windowDownloads",
      name: "Download Manager as a window",
      category: ["Open Manager", "Windows", "windowDownloads"],
      type: "boolean",
      defaultValue: true,
      tooltip: "The download queue. On, it opens as a movable window that stays "
        + "open while you work. Off, it opens centred and closes on a click away or "
        + "Escape.",
    },
    {
      id: "openManager.windowLibrary",
      name: "Model Library as a window",
      category: ["Open Manager", "Windows", "windowLibrary"],
      type: "boolean",
      defaultValue: true,
      tooltip: "What is on disk: duplicates, unreferenced files and storage. On, it opens as a movable window that stays "
        + "open while you work. Off, it opens centred and closes on a click away or "
        + "Escape.",
    },
    {
      id: "openManager.windowMemory",
      name: "Memory panel as a window",
      category: ["Open Manager", "Windows", "windowMemory"],
      type: "boolean",
      defaultValue: true,
      tooltip: "What is loaded and what it weighs. On, it opens as a movable window that stays "
        + "open while you work. Off, it opens centred and closes on a click away or "
        + "Escape.",
    },
    {
      id: "openManager.windowSize",
      name: "Default window size",
      category: ["Open Manager", "Windows", "windowSize"],
      type: "combo",
      options: ["compact", "standard", "large"],
      defaultValue: "large",
      tooltip: "The size a window opens at until you resize it, as a share of the browser "
        + "window.",
    },
    {
      id: "openManager.themeNodeArt",
      name: "Theme images behind node bodies",
      category: ["Open Manager", "Theme", "themeNodeArt"],
      type: "boolean",
      defaultValue: true,
      onChange: () => refreshExtras(),
      tooltip: "A theme may paint a texture behind every node body. Off paints nothing and "
        + "leaves the theme's colours, gradients, icons and glow alone.",
    },
    {
      id: "openManager.themeNodeArtOpacity",
      name: "Node background image strength",
      category: ["Open Manager", "Theme", "themeNodeArtOpacity"],
      type: "slider",
      attrs: { min: 0, max: 1, step: 0.05 },
      defaultValue: 1,
      onChange: () => refreshExtras(),
      tooltip: "Multiplies the image strength the theme declares: 1 is as declared, lower is "
        + "fainter.",
    },
    {
      id: "openManager.themeTitleIcons",
      name: "Theme icons in node titles",
      category: ["Open Manager", "Theme", "themeTitleIcons"],
      type: "boolean",
      defaultValue: true,
      onChange: () => refreshExtras(),
      tooltip: "A theme may replace the dot at the left of a node's title with an icon. Off "
        + "restores the dot. A subgraph keeps its own marker, a node whose dot colour you set "
        + "keeps your colour, and no icon is drawn when zoomed far out.",
    },
    {
      id: "openManager.themeGlow",
      name: "Selection glow",
      category: ["Open Manager", "Theme", "themeGlow"],
      type: "boolean",
      defaultValue: true,
      onChange: () => refreshExtras(),
      tooltip: "A theme may light a selected node with a coloured halo and suppress its drop "
        + "shadow while it does. Off falls back to ComfyUI's own outline and shadow, both "
        + "coloured by the theme.",
    },
    {
      id: "openManager.themeBackdrop",
      name: "Theme graph backdrop",
      category: ["Open Manager", "Theme", "themeBackdrop"],
      type: "boolean",
      defaultValue: true,
      onChange: () => refreshExtras(),
      tooltip: "A theme may put an image behind the graph in place of ComfyUI's flat canvas "
        + "colour. Off restores the palette's canvas colour. ComfyUI's dot grid is drawn over "
        + "the image unless the theme turns it off or replaces it.",
    },
    {
      id: "openManager.themeNodeOpacity",
      name: "Node body opacity",
      category: ["Open Manager", "Theme", "themeNodeOpacity"],
      type: "slider",
      attrs: { min: 0, max: 1, step: 0.05 },
      defaultValue: 1,
      onChange: () => refreshExtras(),
      tooltip: "How solid a node body is drawn: 0.6 is 60 percent, whatever the theme asks "
        + "for. At 1 the theme's own value is used, or solid if it sets none. Title bars, "
        + "widgets and text boxes are unaffected.",
    },
    {
      id: "openManager.desktop",
      onChange: () => {
        if (desktopOn() && panelSetting("openManager.taskbar", false) !== true) {
          app.extensionManager.setting.set("openManager.taskbar", true).then(() => {
            applyTaskbar();
            toast("Taskbar switched on.", { kind: "ok" });
          }).catch(() => {});
        }
        applyDesktop();
      },
      name: "Desktop mode, on a tab of its own",
      category: ["Open Manager", "Desktop", "desktop"],
      type: "boolean",
      defaultValue: false,
      tooltip: "Adds a desktop tab at the left of the workflow tabs. Switches the "
        + "taskbar on. Has no effect unless OPEN_MANAGER_ENABLE_DESKTOP is set.",
    },
    {
      id: "openManager.desktopWallpaper",
      onChange: () => applyDeskLook(),
      name: "Desktop wallpaper",
      category: ["Open Manager", "Desktop", "desktopWallpaper"],
      type: "text",
      defaultValue: "",
      tooltip: "The name of an image in your wallpapers directory, or an address beginning "
        + "http, https or a slash. Empty for a plain desktop.",
    },
    {
      id: "openManager.desktopFit",
      onChange: () => applyDeskLook(),
      name: "How the wallpaper fills the desktop",
      category: ["Open Manager", "Desktop", "desktopFit"],
      type: "combo",
      options: ["cover", "contain", "centre", "tile"],
      defaultValue: "cover",
      tooltip: "Cover fills the desktop and crops what does not fit. Contain shows the whole "
        + "image and leaves space around it. Centre shows it at its own size. Tile repeats it "
        + "from the top left.",
    },
    {
      id: "openManager.desktopFocusX",
      onChange: () => applyDeskLook(),
      name: "Wallpaper position across",
      category: ["Open Manager", "Desktop", "desktopFocusX"],
      type: "slider",
      attrs: { min: 0, max: 100, step: 1 },
      defaultValue: 50,
      tooltip: "Which part of the wallpaper to show when it is wider than the desktop: 0 is "
        + "the left edge, 100 the right. No effect where the whole image fits.",
    },
    {
      id: "openManager.desktopFocusY",
      onChange: () => applyDeskLook(),
      name: "Wallpaper position down",
      category: ["Open Manager", "Desktop", "desktopFocusY"],
      type: "slider",
      attrs: { min: 0, max: 100, step: 1 },
      defaultValue: 50,
      tooltip: "Which part of the wallpaper to show when it is taller than the desktop: 0 is "
        + "the top edge, 100 the bottom.",
    },
    {
      id: "openManager.windowColour",
      onChange: () => repaintLooks(),
      name: "Window colour",
      category: ["Open Manager", "Desktop", "windowColour"],
      type: "text",
      defaultValue: "",
      tooltip: "A colour for every window bar: accent, green, amber, red, purple, teal, grey "
        + "or a #rrggbb, or two of these separated by a comma for a gradient. Empty draws "
        + "the plain theme bar.",
    },
    {
      id: "openManager.programWindows",
      name: "A window each time",
      category: ["Open Manager", "Desktop", "programWindows"],
      type: "boolean",
      defaultValue: false,
      tooltip: "Programs that allow several windows, such as the Image Viewer and the Video "
        + "Player, open a new window each time instead of reusing the one already open.",
    },
    {
      id: "openManager.programColours",
      onChange: () => repaintLooks(),
      name: "Program window colours",
      category: ["Open Manager", "Desktop", "programColours"],
      type: "boolean",
      defaultValue: true,
      tooltip: "A program may ask for a colour on its own window bar, taken from the theme's "
        + "palette. Switch this off to draw every window bar the same.",
    },
    {
      id: "openManager.desktopIconSize",
      onChange: () => applyDeskLook(),
      name: "Desktop icon size",
      category: ["Open Manager", "Desktop", "desktopIconSize"],
      type: "slider",
      attrs: { min: 28, max: 96, step: 4 },
      defaultValue: 44,
      tooltip: "How large a desktop icon is drawn, in pixels.",
    },
    {
      id: "openManager.desktopLabelSize",
      onChange: () => applyDeskLook(),
      name: "Desktop label size",
      category: ["Open Manager", "Desktop", "desktopLabelSize"],
      type: "slider",
      attrs: { min: 9, max: 18, step: 1 },
      defaultValue: 12,
      tooltip: "The type size of the name under each icon, in pixels.",
    },
    {
      id: "openManager.taskbar",
      onChange: () => applyTaskbar(),
      name: "Taskbar along the bottom, and a minimise button",
      category: ["Open Manager", "Windows", "taskbar"],
      type: "boolean",
      defaultValue: false,
      tooltip: "Lists open windows in a strip at the foot of the screen, and gives every "
        + "window a minimise button. Switching it off restores anything minimised at the time.",
    },
    {
      id: "openManager.taskbarHide",
      onChange: () => { taskbarSync(); taskbarShow(true); },
      name: "Hide the taskbar until the pointer nears it",
      category: ["Open Manager", "Desktop", "taskbarHide"],
      type: "boolean",
      defaultValue: false,
      tooltip: "The bar slides away and comes back when the pointer reaches the bottom of "
        + "the screen. It stays out while its menu is open.",
    },
    {
      id: "openManager.startLabel",
      onChange: () => taskbarSync(),
      name: "Write Start on the Start button",
      category: ["Open Manager", "Desktop", "startLabel"],
      type: "boolean",
      defaultValue: false,
      tooltip: "Off, the button is its mark alone and the width of the Desktop tab.",
    },
    {
      id: "openManager.taskbarGroups",
      onChange: () => applyTaskbar(),
      name: "Group windows of the same kind in the taskbar",
      category: ["Open Manager", "Windows", "taskbarGroups"],
      type: "boolean",
      defaultValue: false,
      tooltip: "One entry per kind of window, with a list of its windows.",
    },
    {
      id: "openManager.windowIcons",
      name: "Show an icon in each window title",
      category: ["Open Manager", "Windows", "windowIcons"],
      type: "boolean",
      defaultValue: true,
      onChange: () => applyWindowLook(),
      tooltip: "A window with an icon shows it before its title. Off keeps title bars "
        + "to text.",
    },
    {
      id: "openManager.fileBrowser",
      onChange: () => { remountTopbar(); if (deskLayer) paintDeskIcons(); },
      name: "ComfyUI file browser",
      category: ["Open Manager", "Desktop", "fileBrowser"],
      type: "boolean",
      defaultValue: false,
      tooltip: "A window onto ComfyUI's input, output, temp and model directories. Read-only "
        + "unless OPEN_MANAGER_FILE_WRITES is set. Has no effect unless "
        + "OPEN_MANAGER_ENABLE_FILES is set.",
    },
    {
      id: "openManager.aero",
      onChange: () => applyWindowLook(),
      name: "Aero window headers",
      category: ["Open Manager", "Windows", "aero"],
      type: "boolean",
      defaultValue: false,
      tooltip: "Draws every window header as glass: the theme's colours, translucent, over a "
        + "blur of what is behind the window.",
    },
    {
      id: "openManager.aeroAlpha",
      onChange: () => applyWindowLook(),
      name: "Aero opacity",
      category: ["Open Manager", "Windows", "aeroAlpha"],
      type: "slider",
      attrs: { min: 10, max: 100, step: 5 },
      defaultValue: 55,
      tooltip: "How solid the glass is. Lower shows more of the wallpaper through it.",
    },
    {
      id: "openManager.aeroDark",
      onChange: () => applyWindowLook(),
      name: "Aero darkening",
      category: ["Open Manager", "Windows", "aeroDark"],
      type: "slider",
      attrs: { min: 0, max: 70, step: 2 },
      defaultValue: 18,
      tooltip: "How far the glass is darkened.",
    },
    {
      id: "openManager.aeroBlur",
      onChange: () => applyWindowLook(),
      name: "Aero blur",
      category: ["Open Manager", "Windows", "aeroBlur"],
      type: "slider",
      attrs: { min: 0, max: 40, step: 2 },
      defaultValue: 12,
      tooltip: "How far what is behind the window is softened before it is seen through the "
        + "header.",
    },
    {
      id: "openManager.blurAmount",
      onChange: () => applyWindowLook(),
      name: "Inactive blur",
      category: ["Open Manager", "Windows", "blurAmount"],
      type: "slider",
      attrs: { min: 1, max: 12, step: 1 },
      defaultValue: 3,
      tooltip: "How much windows not in front are blurred when Blur inactive windows "
        + "is on.",
    },
    {
      id: "openManager.blurInactive",
      onChange: () => applyWindowLook(),
      name: "Blur inactive windows",
      category: ["Open Manager", "Windows", "blurInactive"],
      type: "boolean",
      defaultValue: false,
      tooltip: "Blurs the contents of every window except the one in front. Windows not in "
        + "front are dimmed slightly either way.",
    },
    {
      id: "openManager.windowShadow",
      onChange: () => applyWindowLook(),
      name: "Drop shadow",
      category: ["Open Manager", "Windows", "windowShadow"],
      type: "boolean",
      defaultValue: true,
      tooltip: "Draws a shadow under each window.",
    },
    {
      id: "openManager.windowTitleSize",
      onChange: () => applyWindowLook(),
      name: "Title text size",
      category: ["Open Manager", "Windows", "windowTitleSize"],
      type: "number",
      defaultValue: 15,
      tooltip: "Size in pixels of the text in a window's title bar and on its section "
        + "headings. Clamped to 10-28.",
    },
    {
      id: "openManager.windowTextSize",
      onChange: () => applyWindowLook(),
      name: "Content text size",
      category: ["Open Manager", "Windows", "windowTextSize"],
      type: "number",
      defaultValue: 13,
      tooltip: "Size in pixels of the body text inside windows: lists, descriptions and "
        + "READMEs. Clamped to 10-22.",
    },
    {
      id: "openManager.tabMarks",
      onChange: () => paintTabs(),
      name: "Colour and title workflow tabs",
      category: ["Open Manager", "Interface", "tabMarks"],
      type: "boolean",
      defaultValue: true,
      tooltip: "Adds Colour and Title to the right-click menu on a workflow tab. Both are "
        + "saved in the workflow, and setting either marks it as changed.",
    },
    {
      id: "openManager.managerEntry",
      name: "What the Extensions button opens",
      category: ["Open Manager", "Interface", "managerEntry"],
      type: "combo",
      options: ["auto", "panel", "classic"],
      defaultValue: "auto",
      tooltip: "'auto' follows ComfyUI: the classic menu where it was started with "
        + "--enable-manager-legacy-ui, and the panel otherwise. 'panel' always opens the "
        + "manager. 'classic' always opens the menu.",
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
      tooltip: "GitHub installs and model downloads always ask. On, registry packs ask as "
        + "well, once per author. Findings against a pack are shown either way.",
    },
    {
      id: "openManager.imageWorkflows",
      name: "Right-click a README image to load its workflow",
      category: ["Open Manager", "Interface", "imageWorkflows"],
      type: "boolean",
      defaultValue: true,
      tooltip: "Right-clicking a README image that carries a workflow offers to load it. "
        + "Off keeps the browser's own menu on README images.",
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
      tooltip: "A pack page reads its README, repository stats and gallery from the "
        + "repository. Cached until the pack's versions change. Off keeps a pack page to the "
        + "registry alone.",
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
      tooltip: "How old the offline copy of the registry may get before the 'When stale' "
        + "renewal policy refreshes it.",
    },
    {
      id: "openManager.parallelSync",
      name: "Sync the registry in parallel",
      category: ["Open Manager", "Registry", "parallelSync"],
      type: "boolean",
      defaultValue: true,
      tooltip: "Read several catalogue pages at once. Off reads one page at a time.",
    },
    {
      id: "openManager.syncConcurrency",
      name: "Catalogue pages read at once when syncing",
      category: ["Open Manager", "Registry", "syncConcurrency"],
      type: "number",
      defaultValue: 8,
      tooltip: "How many pages a parallel sync keeps in flight. Clamped to 1-16. Higher "
        + "risks the registry rate-limiting you.",
    },
    {
      id: "openManager.allowBanned",
      name: "Install versions the registry has banned",
      category: ["Open Manager", "Registry", "allowBanned"],
      type: "boolean",
      defaultValue: false,
      tooltip: "Off, a banned version shows as Blocked and will not install. On, it installs "
        + "after a confirmation that names the ban.",
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
      tooltip: "Start the gallery open on a pack page rather than collapsed. The images are "
        + "fetched either way once the section is drawn.",
    },
    {
      id: "openManager.licenseUseApi",
      name: "Name licences through the GitHub API",
      category: ["Open Manager", "Licences", "licenseUseApi"],
      type: "boolean",
      defaultValue: false,
      tooltip: "Ask GitHub to name a repository's licence in one request instead of guessing "
        + "at filenames. Needs a GitHub token, set under Open Manager > Access keys. Without "
        + "one the limit is 60 requests an hour, which one listing spends. Falls back to "
        + "reading files when the API cannot answer.",
    },
    {
      id: "openManager.licenseRace",
      name: "Fetch licence filenames together",
      category: ["Open Manager", "Licences", "licenseRace"],
      type: "boolean",
      defaultValue: false,
      tooltip: "Try every candidate licence filename at once rather than one after another. "
        + "One round trip per repository, at the cost of more requests.",
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
      tooltip: "Check a freshly placed pack against VirusTotal before its requirements are "
        + "installed and before ComfyUI is asked to restart. Needs a VirusTotal key, set under "
        + "Open Manager > Access keys. Where the day's allowance is spent you are asked "
        + "whether to install without scanning.",
    },
    {
      id: "openManager.panelHeaders",
      onChange: () => applyHeaderHeight(),
      name: "Header height",
      category: ["Open Manager", "Windows", "panelHeaders"],
      type: "number",
      defaultValue: 44,
      tooltip: "Height in pixels of the title and section bars in the floating panels. "
        + "Clamped to 24-80.",
    },
    {
      id: "openManager.monitor",
      onChange: () => remountTopbar(),
      name: "Resource monitor strip",
      category: ["Open Manager", "Monitor", "monitor"],
      type: "boolean",
      defaultValue: false,
      tooltip: "A compact CPU, RAM and VRAM readout.",
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
      tooltip: "'mixed' draws a share of a total as a bar and a temperature as a column. "
        + "'horizontal' draws everything as bars, and 'vertical' as columns with each name "
        + "down the side. The compact styles put the text on the bar, or at the foot of the "
        + "column; 'vertical-compact' leaves the figure to the hover.",
    },
    {
      id: "openManager.monitorInterval",
      onChange: () => remountTopbar(),
      name: "Seconds between monitor readings",
      category: ["Open Manager", "Monitor", "monitorInterval"],
      type: "number",
      defaultValue: 2,
      tooltip: "How often the machine is sampled while the strip is on screen, clamped to 1 to 10 seconds. Once a second while the Memory panel is open.",
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
      tooltip: "System memory in use, as a share of the total. Always available.",
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
      tooltip: "Graphics memory in use, as a share of the total, one meter per device. A machine with four cards gets four, labelled VRAM:0 to VRAM:3, and a machine with one names it VRAM. Always available.",
    },
    {
      id: "openManager.startupTimes",
      name: "Show what each pack costs to load, on the Installed list",
      category: ["Open Manager", "Library", "startupTimes"],
      type: "boolean",
      defaultValue: false,
      tooltip: "The import time ComfyUI logs for each pack, in seconds, shown beside it on the Installed list with the total.",
    },
    {
      id: "openManager.hashOnDemand",
      name: "Let the Model Library read the contents of a file",
      category: ["Open Manager", "Library", "hashOnDemand"],
      type: "boolean",
      defaultValue: true,
      tooltip: "On, the library offers hashing and duplicate confirmation, which read each "
        + "model end to end. Off, the library still reports names, sizes, folders, duplicates "
        + "by name, and what no workflow references, and never opens a file. A digest already "
        + "taken is still shown.",
    },
    {
      id: "openManager.floatingPanels",
      name: "Windows can be dragged",
      category: ["Open Manager", "Windows", "floatingPanels"],
      type: "boolean",
      defaultValue: true,
      tooltip: "For panels set to open as windows. On, a window can be dragged anywhere and "
        + "reopens where you left it. Off, it always opens in the middle and cannot be moved. "
        + "A browser window too small to move a panel around in presents it centred.",
    },
    {
      id: "openManager.modelLibrary",
      onChange: () => remountTopbar(),
      name: "Model Library panel, and the Models button",
      category: ["Open Manager", "Library", "modelLibrary"],
      type: "boolean",
      defaultValue: false,
      tooltip: "Adds a Models button that opens the model library: everything on disk across every folder ComfyUI registers, what is held in more than one place, and what no saved workflow appears to reference.",
    },
    {
      id: "openManager.downloadButton",
      onChange: () => remountTopbar(),
      name: "Show the Download Manager button",
      category: ["Open Manager", "Downloads", "downloadButton"],
      type: "boolean",
      defaultValue: true,
      tooltip: "Adds a Downloads button that opens the Download Manager.",
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
        + "that node will occupy.",
    },
    {
      id: "openManager.memoryButton",
      onChange: () => remountTopbar(),
      name: "Show the Memory button",
      category: ["Open Manager", "Monitor", "memoryButton"],
      type: "boolean",
      defaultValue: true,
      tooltip: "Opens the Memory panel: live graphs, what ComfyUI is holding, and where each "
        + "model's weights sit.",
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
        + "the name on the hover. Falls back to the tab strip where a build has no control "
        + "bar.",
    },
    {
      id: "openManager.downloadLocation",
      name: "Where new downloads are stored",
      category: ["Open Manager", "Downloads", "downloadLocation"],
      type: "combo",
      options: ["default", "most-free"],
      defaultValue: "default",
      tooltip: "Which of the paths ComfyUI registers for a model folder a download starts "
        + "on. 'default' is ComfyUI's own first path, which honours is_default in "
        + "extra_model_paths.yaml. 'most-free' picks the registered path with the most room. "
        + "The location is shown before the download starts and can be changed.",
    },
    {
      id: "openManager.downloadWorkers",
      name: "Models downloaded at once, in parallel",
      category: ["Open Manager", "Downloads", "downloadWorkers"],
      type: "number",
      defaultValue: 2,
      tooltip: "How many downloads run in parallel. Clamped to 1-8. A stalled transfer holds "
        + "its slot.",
    },
    {
      id: "openManager.nodeModelMenu",
      name: "Add and fetch model URLs from a node's menu",
      category: ["Open Manager", "Downloads", "nodeModelMenu"],
      type: "boolean",
      defaultValue: true,
      tooltip: "Right-clicking a node offers to download the models it names, and to add a "
        + "URL to it. Added URLs are checked against the same host and format rules as any "
        + "other download.",
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
      id: "openmanager.start",
      label: "Open Manager: open the Start menu",
      function: () => {
        if (!taskbarOn()) {
          toast("The taskbar is off. Switch it on under Open Manager > Windows.");
          return;
        }
        paintTaskbar();
        if (startPanel) closeStart(true);
        else openStart();
      },
    },
    {
      id: "openmanager.desktop",
      label: "Open Manager: show or hide the desktop",
      function: () => {
        if (deskGates.desktop === false) {
          toast("Desktop mode is not switched on for this install "
            + "(OPEN_MANAGER_ENABLE_DESKTOP).");
          return;
        }
        if (!desktopOn()) {
          toast("Desktop mode is off. Switch it on in the Open Manager settings, under "
            + "Desktop.");
          return;
        }
        if (deskShowing()) hideDesk();
        else showDesk();
      },
    },
    {
      id: "openmanager.desktopsettings",
      label: "Open Manager: desktop settings",
      function: () => openDesktopSettings(),
    },
    {
      id: "openmanager.minimise",
      label: "Open Manager: minimise the window in front",
      function: () => {
        if (!taskbarOn()) {
          toast("The taskbar is off, so windows cannot be minimised.");
          return;
        }
        const front = [...floatPanels.values()].find((one) => one.el.isConnected && !one.modal
          && !one.isMinimised() && one.el.classList.contains("om-float-active"));
        if (!front) { toast("No window to minimise."); return; }
        front.minimise();
      },
    },
    {
      id: "openmanager.restore",
      label: "Open Manager: restore the last minimised window",
      function: () => {
        const away = [...floatPanels.values()]
          .filter((one) => one.el.isConnected && one.isMinimised())
          .sort((a, b) => a.minimisedAt() - b.minimisedAt());
        if (!away.length) { toast("Nothing is minimised."); return; }
        away[away.length - 1].present();
      },
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
        const packId = await askText("Registry pack id");
        if (packId) await openPack(packId);
      },
    },
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
      title: "Discovery",
      tooltip: "Open Manager: Node Discovery",
      type: "custom",
      render: renderSidebar,
    });
    addLegacyMenuButton();
    topbarReady = true;
    wireMonitorLink();
    mountTopbar();
    wireRunBar();

    readLegacyUi().catch(() => {});
    migrateEntryMode();

    loadKeys().then(() => migrateKeys()).catch(() => {});

    loadInstalledIndex();
    loadTrustedAuthors();

    applyWindowLook();
    applyTaskbar();
    startDesktop();
    registerThemes().catch(() => {});
    watchThemeExtras();
    refreshPackThemes().then((updated) => {
      if (!updated.length) return;
      toast(`Updated ${updated.length === 1 ? updated[0] : `${updated.length} themes`} `
        + "from the installed pack.", { kind: "ok" });
    }).catch(() => {});
    repairLinkMode().then((fixed) => {
      if (!fixed) return;
      notify("Link shape put back",
        `An earlier version of Open Manager set ComfyUI's link render mode to ${fixed.from} `
        + `for every theme. It has been set back to ${fixed.to}. To keep ${fixed.from}, set `
        + "it under Settings > Lite Graph > Link Render Mode; this will not change it again.");
    }).catch(() => {});
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
