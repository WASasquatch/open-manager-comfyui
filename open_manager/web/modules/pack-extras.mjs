import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import { API } from "./base.mjs";
import { el, safeUrl, openUrl, toast, notify, confirmAction } from "./ui.mjs";
import { rememberInstall, install } from "./installs.mjs";
import { openPack, repoName } from "./packs.mjs";
import { docResolve, openPackDoc } from "./markdown.mjs";
import { panelSetting } from "./settings.mjs";
import { packQuery } from "./registry.mjs";
import { openWorkflow } from "./workflows.mjs";

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
  await openWorkflow(workflow, {
    label: path,
    ask: { origin: `the ${repoName(repository) || "pack"} repository`, repository },
  });
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
      await openWorkflow(workflow, {
        label: image.getAttribute("alt") || "this image",
        ask: { origin: "an image in this README", repository: view._repository || "" },
      });
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

export { refreshPackThemes, fillThemeTitles, addPackTheme, loadExampleWorkflow, linkHeadings, attachmentMedia, embedMediaLinks, offerImageWorkflows, absolutiseLinks, quickInstall };
