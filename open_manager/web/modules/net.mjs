import { api } from "../../../scripts/api.js";
import { API } from "./base.mjs";

async function dlPost(path, body) {
  const answer = await api.fetchApi(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  return answer.json();
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

function dlRemember(key, value) {
  try { localStorage.setItem(key, value); } catch {}
}

function dlRecall(key, fallback) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}

function nodeModels(node) {
  const declared = node?.properties?.models;
  return Array.isArray(declared) ? declared : [];
}

export { dlPost, bytesText, dlRemember, dlRecall, nodeModels };
