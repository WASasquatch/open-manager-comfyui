import { ICON_TAB, TASKBAR_Z, DESK_Z, MODAL_Z, MENU_Z, HOST_MENU_Z } from "./base.mjs";
import { GRIP_BAR, GRIP_INSET } from "./grips.mjs";

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
.om-toast-x { flex: none; align-self: center; background: none; border: none; padding: 0 2px;
  margin: 0 -6px 0 0; color: var(--om-muted); font-size: 18px; line-height: 1; cursor: pointer;
  display: flex; align-items: center; }
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
body.om-bridge .om-backdrop { z-index: ${HOST_MENU_Z - 40}; }
body.om-bridge .om-menu { z-index: ${HOST_MENU_Z - 30}; }
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
@supports (color: oklch(from red l c h)) {
  .queue-button-group.om-resume > [data-testid="queue-button"][data-variant="primary"] {
    background: oklch(from var(--color-primary-background, #0b8ce9) l c calc(h - 60)); }
  .queue-button-group.om-resume > [data-testid="queue-button"][data-variant="primary"]:hover {
    background: oklch(from var(--color-primary-background, #0b8ce9) calc(l + .05) c calc(h - 60)); }
}
.queue-button-group.om-resume > [data-testid="queue-button"][data-variant="primary"]:has(> [data-testid="queue-button-icon"][class*="lucide--play"]) {
  font-size: 0; }
.queue-button-group.om-resume > [data-testid="queue-button"][data-variant="primary"]:has(> [data-testid="queue-button-icon"][class*="lucide--play"])::after {
  content: "Resume"; font-size: .875rem; line-height: 1.25rem; margin-left: -.375rem; }
.queue-button-group.om-resume > [data-testid="queue-button"][data-variant="primary"] > [data-testid="queue-button-icon"][class*="lucide--play"] {
  --svg: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolygon points='5 4 15 12 5 20 5 4'/%3E%3Cline x1='19' x2='19' y1='5' y2='19'/%3E%3C/svg%3E"); }
.om-run-split { height: 1px; margin: 4px 2px; background: var(--color-border-subtle, var(--om-border)); }
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
.om-policy { display: flex; align-items: center; gap: 8px; margin: 10px 0 2px; }
.om-policy-label { font-size: 12px; opacity: .7; flex: none; }
.om-policy-pick { flex: 1; min-width: 0; }
.om-dep { display: flex; justify-content: space-between; gap: 12px; padding: 5px 12px;
  border-bottom: 1px solid var(--om-surface); font-size: 12px; }
.om-dep:last-child { border-bottom: none; }
.om-dep-name { font-family: ui-monospace, monospace; color: var(--om-text-2); overflow-wrap: anywhere; }
.om-dep-status { flex: none; white-space: nowrap; }
`;
document.head.appendChild(style);

const sidebarStyle = document.createElement("style");
sidebarStyle.textContent = `
.om-panel-window > div { flex: 1; min-height: 0; }
.om-panel-window .om-nav { padding-right: 30px; }
.om-legacy-btn { width: 100%; }

.om-side { display: flex; flex-direction: column; height: 100%; padding: 10px; gap: 8px;
  font: 13px/1.5 system-ui, sans-serif; color: var(--om-text); box-sizing: border-box; }
.om-nav { display: flex; gap: 4px; flex: none; }
.om-nav-btn { flex: 1; padding: 6px 4px; background: var(--om-surface); border: 1px solid var(--om-border);
  border-radius: 6px; color: var(--om-muted); cursor: pointer; font-size: 15px; line-height: 1; }
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
  width: min(94vw, 1060px); height: auto; max-height: 90vh;
  display: flex; flex-direction: column; gap: 18px; padding: 28px 30px 20px; overflow: hidden;
}
.om-hub-title {
  padding: 6px 14px; text-align: center; font-weight: 700; font-size: 22px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  background: #000; color: #fff;
}
.om-hub-body { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 30px; overflow-y: auto; align-items: start; }
.om-hub-col { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.om-hub-stack { display: flex; flex-direction: column; gap: 4px; margin-bottom: 14px; }
.om-hub-btn {
  padding: 5px 10px; text-align: center; font-size: 16px; cursor: pointer;
  background: var(--om-surface); color: var(--om-text);
  border: 1px solid var(--om-border); border-radius: 8px;
}
.om-hub-btn:hover { background: var(--om-hover); }
.om-hub-danger { background: #5c0000; border-color: #7f1d1d; color: #fff; }
.om-hub-danger:hover { background: #7f1d1d; }
.om-hub-check { display: flex; align-items: center; gap: 8px; margin-bottom: 14px;
  font: 14px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; cursor: pointer; }
.om-hub-select { padding: 3px 6px; font-size: 14px; border-radius: 4px;
  background: var(--om-surface); color: var(--om-text); border: 1px solid var(--om-border); }
.om-hub-group { position: relative; display: flex; flex-direction: column; gap: 4px;
  margin-top: 30px; padding: 22px 10px 10px; border: 1px solid var(--om-border);
  border-radius: 4px; }
.om-hub-group-pair { display: grid; grid-template-columns: 1fr 1fr; }
.om-hub-group-pair .om-hub-btn { font-size: 14px; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; }
.om-hub-tag { position: absolute; top: -10px; left: 50%; transform: translateX(-50%);
  padding: 1px 32px; border-radius: 4px; background: #8b1a1a; color: #fff;
  font: 700 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.om-hub-status { margin-top: 14px; padding: 10px; min-height: 120px;
  border: 1px solid var(--om-border); background: var(--om-input);
  font: 13px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color: var(--om-text-2); white-space: pre-wrap; }
.om-hub-close {
  padding: 4px; font-size: 18px; cursor: pointer; color: var(--om-text);
  background: var(--om-surface); border: 1px solid var(--om-border); border-radius: 8px;
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
.om-lib-sources { display: flex; flex-direction: column; gap: 4px; margin-top: 6px; }
.om-lib-source { display: flex; align-items: center; gap: 8px; min-width: 0;
  color: var(--om-muted); font-size: 12px; }
.om-lib-source-title, .om-lib-source-more { background: none; border: 0; padding: 0;
  color: var(--om-text); font: inherit; font-size: 13px; cursor: pointer; flex: none; }
.om-lib-source-title:hover, .om-lib-source-more:hover { text-decoration: underline; }
.om-lib-source-more { color: var(--om-muted); font-size: 12px; align-self: flex-start; }
.om-lib-source-path { overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  min-width: 0; direction: rtl; text-align: left; }
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
.om-qol-issue { margin-left: 6px; color: var(--om-text-2); font-size: 12px;
  text-decoration: underline; text-underline-offset: 2px; }
.om-qol-issue:hover { color: var(--om-text); }
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
.om-presets { display: flex; flex-direction: column; gap: 10px; padding: 12px 14px;
  min-height: 100%; box-sizing: border-box; }
.om-preset-save { display: flex; gap: 8px; align-items: center; }
.om-preset-save .om-search { flex: 1; }
.om-preset-list { display: flex; flex-direction: column; gap: 6px; }
.om-preset-row { border: 1px solid var(--om-border); border-radius: 8px; padding: 8px 10px;
  display: flex; flex-direction: column; gap: 4px; background: var(--om-surface); }
.om-preset-head { display: flex; align-items: center; gap: 8px; min-width: 0; }
.om-preset-name { flex: 1; min-width: 0; font-weight: 600; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap; }
.om-preset-marks { display: inline-flex; gap: 4px; flex: none; }
.om-preset-marks .om-chip { font-size: 10px; padding: 0 6px; }
.om-preset-more { padding: 4px 8px; }
.om-preset-meta { display: flex; align-items: center; gap: 10px; min-width: 0; }
.om-preset-values { flex: 1; min-width: 0; color: var(--om-muted); font-size: 11px; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap; }
.om-preset-store { display: inline-flex; align-items: center; flex: none; margin-left: auto;
  font-size: 11px; }
.om-preset-fold { flex: none; width: 20px; padding: 0; border: 0; background: none;
  color: var(--om-muted); cursor: pointer; font-size: 15px; line-height: 1; }
.om-preset-fold:hover { color: var(--om-text); }
.om-preset-name { cursor: pointer; }
.om-preset-fields { display: flex; flex-direction: column; margin-top: 4px;
  border: 1px solid var(--om-border); border-radius: 6px; background: var(--om-input);
  overflow: hidden; }
.om-preset-fields-head { display: flex; align-items: center; gap: 10px; padding: 6px 10px;
  border-bottom: 1px solid var(--om-border); min-height: 18px; }
.om-preset-count { flex: 1; color: var(--om-muted); font-size: 11px; }
.om-preset-filter.om-search { width: 180px; flex: none; padding: 3px 8px; font-size: 12px; }
.om-preset-field-list { max-height: 360px; overflow-y: auto; overscroll-behavior: contain; }
.om-preset-field { display: grid; grid-template-columns: 150px minmax(0, 1fr) auto;
  gap: 12px; align-items: start; padding: 5px 10px; font-size: 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--om-border) 55%, transparent); }
.om-preset-field:last-child { border-bottom: 0; }
.om-preset-field:hover { background: var(--om-hover); }
.om-preset-field[hidden] { display: none; }
.om-preset-key { color: var(--om-muted); overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; line-height: 20px; }
.om-preset-full { color: var(--om-text-2); line-height: 20px; min-width: 0; overflow: hidden;
  white-space: nowrap; text-overflow: ellipsis; user-select: text;
  font-variant-numeric: tabular-nums; }
.om-preset-blank { color: var(--om-muted); font-style: italic; }
.om-preset-long .om-preset-full { white-space: pre-wrap; word-break: break-word;
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; cursor: pointer; }
.om-preset-field-open .om-preset-full { display: block; -webkit-line-clamp: unset;
  max-height: 220px; overflow-y: auto; cursor: auto; padding: 6px 8px; margin: 2px 0;
  line-height: 1.5; border: 1px solid var(--om-border); border-radius: 4px;
  background: var(--om-surface); }
.om-preset-use.om-btn { padding: 1px 8px; font-size: 11px; line-height: 16px; margin-top: 1px; }
.om-preset-acts { display: inline-flex; gap: 4px; flex: none; }
.om-preset-empty { color: var(--om-muted); font-size: 13px; padding: 8px 2px; }
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
.om-task-item { position: relative; }
.om-task-x { position: absolute; right: 5px; top: 50%; transform: translateY(-50%);
  width: 20px; height: 20px; display: none; align-items: center; justify-content: center;
  border-radius: 4px; background: var(--om-surface); color: var(--om-muted);
  box-shadow: -6px 0 6px -2px var(--om-surface); font-size: 15px; line-height: 1; }
.om-task-item:hover .om-task-x, .om-task-item:focus-visible .om-task-x { display: inline-flex; }
.om-task-x:hover { background: var(--om-hover); color: var(--om-text); }
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
  .om-task-x { display: inline-flex; }
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
.om-pause { display: inline-flex; align-items: center; justify-content: flex-start; flex: none;
  width: 26px; height: 100%; padding: 0 0 0 6px; border: 0; border-radius: 0; cursor: pointer;
  overflow: hidden; box-sizing: border-box;
  background: color-mix(in oklch, var(--color-primary-background, #0b8ce9) 42%, #5b6470);
  color: #fff; transition: width .2s ease, padding .2s ease, background .15s; }
.om-pause svg { flex: none; }
.om-pause.om-pause-out { width: 0; padding-left: 0; pointer-events: none; }
.queue-button-group > [data-testid="queue-button"] {
  transition: color .15s, background-color .15s, border-color .15s, border-radius .12s ease .2s; }
.queue-button-group.om-pause-on > [data-testid="queue-button"] {
  transition: color .15s, background-color .15s, border-color .15s, border-radius 0s; }
.om-pause:hover:not(:disabled) {
  background: color-mix(in oklch, var(--color-primary-background, #0b8ce9) 58%, #5b6470); }
.om-pause:disabled { cursor: default; }
.om-pause-busy svg { animation: om-pause-beat 1s ease-in-out infinite; }
@keyframes om-pause-beat { 50% { opacity: .35; } }
@media (prefers-reduced-motion: reduce) {
  .om-pause, .queue-button-group > [data-testid="queue-button"] { transition: none; } }
.queue-button-group.om-pause-on > [data-testid="queue-button"] {
  border-top-right-radius: 0; border-bottom-right-radius: 0; }
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
.om-mem-held { display: flex; flex-direction: column; flex: 2 1 auto; min-height: 0; }
.om-mem-bar-grab:not(.om-mem-bar-toggle) { cursor: grab; }
.om-mem-dragging { opacity: .45; }
.om-mem-body > [data-section] { position: relative; }
.om-mem-over-top::after, .om-mem-over-bottom::after { content: ""; position: absolute;
  left: 0; right: 0; height: 3px; background: var(--om-accent, #4493f8);
  pointer-events: none; z-index: 2; }
.om-mem-over-top::after { top: 0; }
.om-mem-over-bottom::after { bottom: 0; }
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

const gripStyle = document.createElement("style");
gripStyle.textContent = `
.om-grip { position: absolute; left: 0; right: ${GRIP_INSET}px; bottom: 0;
  width: auto !important; height: ${GRIP_BAR}px !important; cursor: ns-resize; touch-action: none; z-index: 2; }
.om-grip::after { content: ""; position: absolute; left: 50%; top: 50%; width: 24px; height: 2px;
  margin: -1px 0 0 -12px; border-radius: 1px; background: var(--om-muted, #8b949e); opacity: .35; }
.om-grip:hover::after, .om-grip[data-om-held="1"]::after { opacity: .95; }
`;
document.head.appendChild(gripStyle);

const iconStyle = document.createElement("style");
iconStyle.textContent = `
.om-tab-icon { display: inline-block; width: 1.2rem; height: 1.2rem;
  background-color: currentColor;
  -webkit-mask: center / contain no-repeat url("${ICON_TAB}");
  mask: center / contain no-repeat url("${ICON_TAB}"); }
`;
document.head.appendChild(iconStyle);
