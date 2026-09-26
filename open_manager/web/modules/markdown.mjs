import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import { API } from "./base.mjs";
import { el, notify } from "./ui.mjs";
import { appendDeveloperBlock } from "./packs.mjs";
import { linkHeadings, attachmentMedia, embedMediaLinks, offerImageWorkflows, absolutiseLinks } from "./pack-extras.mjs";

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

export { loadingBlock, docResolve, renderMarkdownInto, openPackDoc, paintPackBody };
