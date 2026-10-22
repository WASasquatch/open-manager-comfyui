import { app } from "../../../../../../scripts/app.js";
import { api } from "../../../../../../scripts/api.js";
import { locator } from "./kit.mjs";

const ANNOTATION = /\s*\[(input|output|temp)\]\s*$/i;

const built = new WeakMap();

function annotated(path, fallback) {
  const match = ANNOTATION.exec(path);
  if (!match) return { path, root: fallback };
  const root = match[1].toLowerCase();
  return { path: path.slice(0, match.index), root: root === "output" || root === "temp" ? root : "input" };
}

function outputsOf(node) {
  return node ? app.nodeOutputs?.[locator(node)] : undefined;
}

function previewsOf(node) {
  return node ? app.nodePreviewImages?.[locator(node)] : undefined;
}

function stillImages(node, outputs) {
  if (outputs.animated?.find(Boolean) || node.previewMediaType === "video" || node.videoContainer) return false;
  const images = outputs.images?.filter((image) => image !== null);
  if (!images?.length) return false;
  return !images.some((image) => image.filename?.toLowerCase().endsWith(".svg"));
}

function outputUrl(node, outputs) {
  const image = outputs.images[0];
  if (!image) return undefined;
  const filename = image.filename ?? "";
  const place = annotated(filename, image.type === undefined ? "input" : image.type);
  const params = new URLSearchParams({
    ...image,
    filename: node.comfyClass === "LoadImageOutput" ? filename : place.path,
    type: place.root,
  });
  const preview = stillImages(node, outputs) ? app.getPreviewFormatParam?.() || "" : "";
  return api.apiURL(`/view?${params}${preview}${app.getRandParam?.() || ""}`);
}

function nodeImageUrl(node) {
  if (!node) return undefined;
  const previews = previewsOf(node);
  if (previews?.length) return previews[0];
  const outputs = outputsOf(node);
  if (!outputs?.images?.length) return undefined;
  let entry = built.get(node);
  if (entry?.outputs !== outputs) {
    entry = { outputs, url: outputUrl(node, outputs) };
    built.set(node, entry);
  }
  return entry.url;
}

function withoutRand(url) {
  const [path, query] = url.split("?");
  if (!query) return url;
  const params = new URLSearchParams(query);
  params.delete("rand");
  return `${path}?${params}`;
}

export { annotated, nodeImageUrl, outputsOf, previewsOf, withoutRand };
