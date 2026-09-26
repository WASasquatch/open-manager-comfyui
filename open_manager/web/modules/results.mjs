import { api } from "../../../scripts/api.js";
import { API } from "./base.mjs";
import { el, safeUrl } from "./ui.mjs";
import { packName, registryControl, trustBadge } from "./installs.mjs";
import { openPack } from "./packs.mjs";
import { onLicencesResolved, licenseOptions } from "./registry.mjs";

const licJobs = new Map();

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
  mark.src = new URL(COMFY_MARK, new URL("../", import.meta.url)).href;
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
  mark.src = new URL(COMFY_MARK, new URL("../", import.meta.url)).href;
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

export { queueLicense, packIcon, countText, plusMark, repoButton, registryButton, starCount, buildResultRow, dayText, buildResultTableRow, buildResultCard };
