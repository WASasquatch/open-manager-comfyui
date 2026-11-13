const ROW_CAP = 400;

const LIST_CAP = 60;

const CARD_ROWS = 8;

const ABSENT = "absent";

const KIND_WORDS = {
  core: "ComfyUI core",
  partner: "Partner nodes",
  frontend: "ComfyUI frontend",
  unknown: "Unknown pack",
  absent: "Missing",
};

const TABS = [
  { key: "packs", label: "Packs" },
  { key: "nodes", label: "Nodes" },
  { key: "missing", label: "Missing" },
  { key: "workflows", label: "Workflows" },
  { key: "remove", label: "Remove" },
];

const FILTERS = {
  packs: [
    { key: "all", label: "All" },
    { key: "used", label: "In use" },
    { key: "unused", label: "Not in any workflow" },
    { key: "off", label: "Off or failed" },
  ],
  nodes: [
    { key: "packs", label: "From packs" },
    { key: "core", label: "Core" },
    { key: "missing", label: "Missing" },
    { key: "all", label: "All" },
  ],
};

const fold = (value) => String(value ?? "").trim().toLowerCase().replace(/_/g, "-");

const bare = (dir) => String(dir || "").replace(/\.disabled$/i, "");

function ownerRepo(url) {
  const found = /github\.com[/:]+([^/\s]+)\/([^/#?\s]+)/i.exec(String(url || ""));
  return found ? `${found[1]}/${found[2].replace(/\.git$/i, "")}`.toLowerCase() : "";
}

function repoOf(text) {
  const value = String(text || "").trim();
  return /^[\w.-]+\/[\w.-]+$/.test(value) ? value.toLowerCase() : ownerRepo(value);
}

const repoName = (url) => ownerRepo(url).split("/")[1] || "";

const plural = (count, word, many = `${word}s`) =>
  `${Number(count || 0).toLocaleString()} ${count === 1 ? word : many}`;

function compare(a, b) {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { sensitivity: "base", numeric: true });
}

function blank(fields) {
  return {
    provides: new Set(), used: new Set(), waiting: new Set(), workflows: new Set(),
    placed: 0, off: 0, last: 0, removed: "", ...fields,
  };
}

function build(api, raw, removed) {
  const { installed, audit, startup, gates } = raw;
  const own = String(audit.own || "");
  const failedNames = new Set((startup?.stale ? [] : startup?.packs || [])
    .filter((row) => row?.failed).map((row) => fold(bare(row.name))));
  const packs = new Map();
  const byName = new Map();
  const byRepo = new Map();
  const index = (map, key, pack) => {
    if (!key) return;
    const held = map.get(key);
    if (!held || (held.disabled && !pack.disabled)) map.set(key, pack);
  };
  for (const one of installed || []) {
    const dir = String(one?.dir || one?.id || "");
    if (!dir) continue;
    const pack = blank({
      key: dir, dir, name: bare(dir), id: String(one.id || dir),
      registryId: String(one.registry_id || ""), repository: String(one.repository || ""),
      version: String(one.version || ""), source: String(one.source || ""),
      disabled: !!one.disabled, git: !!one.from_git, installedAt: Number(one.installed_at) || 0,
      installed: true, own: !!own && dir === own, removed: removed.get(dir) || "",
    });
    pack.failed = !pack.disabled && failedNames.has(fold(pack.name));
    packs.set(dir, pack);
    for (const name of [pack.dir, pack.name, pack.id, pack.registryId]) index(byName, fold(name), pack);
    index(byRepo, ownerRepo(pack.repository), pack);
  }

  const files = new Set(audit.files || []);
  const loose = (folder) => {
    const key = `loose:${folder}`;
    if (!packs.has(key)) {
      packs.set(key, blank({
        key, dir: folder, name: bare(folder) || folder, id: folder, registryId: "", repository: "",
        version: "", source: "", disabled: false, git: false, installedAt: 0, failed: false,
        installed: false, loose: true, file: files.has(folder), own: !!own && folder === own,
        removed: removed.get(folder) || "",
      }));
    }
    return packs.get(key);
  };

  const packFor = (module) => {
    const parts = String(module || "").split(".");
    for (let size = parts.length; size > 0; size -= 1) {
      const name = parts.slice(0, size).join(".");
      const hit = packs.get(name) || byName.get(fold(name)) || byName.get(fold(name.split("@")[0]));
      if (hit) return hit;
    }
    return null;
  };

  const hints = audit.hints || {};
  const packOfHint = (hint) => (hint ? byName.get(fold(hint.cnr_id)) || byRepo.get(repoOf(hint.aux_id))
    || byName.get(fold(String(hint.aux_id || "").split("/").pop())) : null);

  const owners = new Map();
  const ownerOf = (type) => {
    if (owners.has(type)) return owners.get(type);
    const found = api.packs.owner(type) || { kind: "unknown" };
    let held = { kind: found.kind };
    if (found.kind === "pack") {
      held = { kind: "pack", pack: packFor(found.module) || packFor(found.folder) || loose(found.folder) };
    } else if (found.kind === "frontend" || found.kind === "unknown") {
      const hint = hints[type];
      const pack = fold(hint?.cnr_id) === "comfy-core" ? null : packOfHint(hint);
      if (pack) held = { kind: "pack", pack };
      else if (fold(hint?.cnr_id) === "comfy-core") held = { kind: "core" };
    }
    owners.set(type, held);
    return held;
  };

  for (const type of api.packs.types()) {
    const owner = ownerOf(type);
    if (owner.pack) owner.pack.provides.add(type);
  }

  const multi = (audit.users || []).length > 1;
  const me = String(audit.user || "");
  const flows = (audit.workflows || []).map((one, at) => ({
    index: at,
    path: String(one.path || ""),
    user: String(one.user || ""),
    mine: !me || String(one.user || "") === me,
    label: `${multi ? `${one.user}: ` : ""}${String(one.path || "").replace(/\.json$/i, "")}`,
    time: Number(one.at) || 0,
    api: one.kind === "api",
    open: !!one.open,
    modified: !!one.modified,
    saved: one.saved !== false,
    nodes: Number(one.nodes) || 0,
    types: one.types && typeof one.types === "object" ? one.types : {},
    packs: new Set(),
    missing: new Set(),
  }));

  const types = new Map();
  const statOf = (type) => {
    let stat = types.get(type);
    if (!stat) {
      stat = { type, owner: ownerOf(type), workflows: [], placed: 0, off: 0, last: 0, home: null,
               hint: null };
      types.set(type, stat);
    }
    return stat;
  };

  for (const flow of flows) {
    for (const [type, pair] of Object.entries(flow.types)) {
      const count = Number(pair?.[0]) || 0;
      const off = Number(pair?.[1]) || 0;
      const stat = statOf(type);
      stat.workflows.push(flow.index);
      stat.placed += count;
      stat.off += off;
      stat.last = Math.max(stat.last, flow.time);
      const pack = stat.owner.pack;
      if (pack) {
        pack.used.add(type);
        pack.workflows.add(flow.index);
        pack.placed += count;
        pack.off += off;
        pack.last = Math.max(pack.last, flow.time);
        flow.packs.add(pack.key);
      } else if (stat.owner.kind === ABSENT) {
        flow.missing.add(type);
      }
    }
  }

  const model = { packs, types, flows, byName, byRepo, gates: gates || {}, audit, own,
                  settled: false, resolveNote: "" };
  for (const stat of types.values()) {
    if (stat.owner.kind !== ABSENT) continue;
    stat.hint = hints[stat.type] || null;
    if (fold(stat.hint?.cnr_id) === "comfy-core") {
      stat.home = { core: true };
      continue;
    }
    const pack = packOfHint(stat.hint);
    if (pack) settle(model, stat, pack);
  }
  return model;
}

function settle(model, stat, pack) {
  stat.home = { pack };
  pack.waiting.add(stat.type);
  pack.placed += stat.placed;
  pack.off += stat.off;
  pack.last = Math.max(pack.last, stat.last);
  for (const at of stat.workflows) {
    pack.workflows.add(at);
    model.flows[at]?.packs.add(pack.key);
  }
}

async function resolveMissing(api, model) {
  const asking = [...model.types.values()].filter((stat) => stat.owner.kind === ABSENT && !stat.home);
  if (asking.length) {
    const hints = {};
    for (const stat of asking) {
      if (stat.hint && (stat.hint.cnr_id || stat.hint.aux_id)) hints[stat.type] = stat.hint;
    }
    const answer = await api.packs.resolve(asking.map((stat) => stat.type), hints);
    if (!Array.isArray(answer?.packs)) {
      model.resolveNote = `Missing nodes not matched to packs: ${answer?.reason || "no answer"}.`;
    }
    for (const found of answer?.packs || []) {
      const pack = model.byName.get(fold(found.pack_id)) || model.byRepo.get(ownerRepo(found.repo))
        || model.byName.get(fold(repoName(found.repo)));
      for (const type of found.classes || []) {
        const stat = model.types.get(type);
        if (!stat || stat.home) continue;
        if (pack) settle(model, stat, pack);
        else {
          stat.home = { source: {
            title: String(found.title || repoName(found.repo) || found.repo || "Unnamed pack"),
            repo: String(found.repo || ""), packId: String(found.pack_id || ""),
          } };
        }
      }
    }
  }
  model.settled = true;
}

function missingGroups(model) {
  const groups = new Map();
  for (const stat of model.types.values()) {
    if (stat.owner.kind !== ABSENT) continue;
    const home = stat.home || {};
    let key = "unknown";
    let made = null;
    if (home.pack) {
      const pack = home.pack;
      key = `pack:${pack.key}`;
      made = {
        title: pack.name, pack, packId: pack.registryId, rank: 1, tone: "warn",
        state: pack.removed ? "Removed" : pack.disabled ? "Switched off" : pack.failed
          ? "Failed to load" : "Installed, node not registered",
      };
    } else if (home.source) {
      key = `repo:${home.source.repo || home.source.title}`;
      made = { title: home.source.title, packId: home.source.packId, repo: home.source.repo,
               rank: 0, tone: "bad", state: "Not installed" };
    } else if (home.core) {
      key = "core";
      made = { title: "ComfyUI core", rank: 2, tone: "warn", state: "Newer than this ComfyUI" };
    } else {
      made = { title: model.settled ? "Unknown pack" : "Matching to packs", rank: 3, tone: "",
               state: model.settled ? "No pack found" : "" };
    }
    if (!groups.has(key)) groups.set(key, { key, ...made, types: [], workflows: new Set() });
    const group = groups.get(key);
    group.types.push(stat);
    for (const at of stat.workflows) group.workflows.add(at);
  }
  return [...groups.values()].sort((a, b) => a.rank - b.rank
    || b.workflows.size - a.workflows.size || compare(a.title, b.title));
}

function candidateKeys(model) {
  return new Set(Object.values(candidates(model)).flat().map((pack) => pack.key));
}

function candidates(model) {
  const found = { unused: [], dormant: [], nodeless: [] };
  for (const pack of model.packs.values()) {
    if (!pack.installed || pack.own || pack.removed || pack.workflows.size) continue;
    if (pack.disabled || pack.failed) found.dormant.push(pack);
    else if (pack.provides.size) found.unused.push(pack);
    else found.nodeless.push(pack);
  }
  for (const list of Object.values(found)) list.sort((a, b) => compare(a.name, b.name));
  return found;
}

export const program = {
  open(api) {
    const win = api.window({ size: "pack", title: "Node Audit" });
    const find = api.el("input", "om-search na-find");
    find.placeholder = "Find a pack, node or workflow";
    find.spellcheck = false;
    const again = api.el("button", "om-btn", "Rescan");
    win.tools.append(find, again);

    const shell = api.el("div", "na-shell");
    const tiles = api.el("div", "na-tiles");
    const notes = api.el("div", "na-notes");
    const tabs = api.el("div", "na-tabs");
    const bar = api.el("div", "na-bar");
    const list = api.el("div", "na-list");
    const foot = api.el("div", "na-foot");
    shell.append(tiles, notes, tabs, bar, list, foot);
    win.body.appendChild(shell);

    const view = {
      tab: "packs",
      filter: { packs: "all", nodes: "packs" },
      sort: {},
    };
    const expanded = new Set();
    const picked = new Set();
    const progress = new Map();
    const removed = new Map();
    let model = null;
    let latest = 0;
    let busy = false;
    let query = "";

    const keepView = () => { void api.storage.set("view", view); };

    const when = (seconds) => (seconds ? api.when(new Date(seconds * 1000)) : "");

    const mark = (text, tone = "") => api.el("span", `na-mark${tone ? ` na-mark-${tone}` : ""}`, text);

    const say = (text, cls = "na-empty") => list.replaceChildren(api.el("div", cls, text));

    const keyed = (node, key) => {
      node.dataset.naKey = key;
      return node;
    };

    const matches = (...texts) => !query
      || texts.some((text) => String(text || "").toLowerCase().includes(query));

    const openFlow = async (flow) => {
      if (!flow.mine) return;
      api.graph.show();
      let result = "";
      try {
        result = await api.graph.open(flow.path);
      } catch (error) {
        api.notify("Not opened", `${flow.label} could not be opened: ${error.message}`);
        return;
      }
      if (result === "missing") api.toast(`${flow.label} is not among this user's workflows.`);
    };

    const flowChips = (indexes) => {
      const box = api.el("div", "na-flows");
      const ordered = [...indexes].map((at) => model.flows[at]).filter(Boolean)
        .sort((a, b) => b.time - a.time);
      for (const flow of ordered.slice(0, LIST_CAP)) {
        const chip = api.el("button", "na-flow", flow.label);
        chip.type = "button";
        chip.disabled = !flow.mine;
        chip.title = [flow.path, when(flow.time) && `saved ${when(flow.time)}`,
                      flow.modified ? "unsaved changes" : "",
                      flow.mine ? "" : `${flow.user}'s`].filter(Boolean).join(" · ");
        chip.onclick = (event) => { event.stopPropagation(); void openFlow(flow); };
        box.appendChild(chip);
      }
      if (ordered.length > LIST_CAP) {
        box.appendChild(api.el("span", "na-more-inline", `${ordered.length - LIST_CAP} more`));
      }
      return box;
    };

    const freq = (count, most) => {
      const cell = api.el("span", "na-freq");
      const track = api.el("span", "na-track");
      const fill = api.el("i", "na-fill");
      const share = most ? count / most : 0;
      fill.style.width = `${count ? Math.max(3, Math.round(share * 100)) : 0}%`;
      track.appendChild(fill);
      cell.append(track, api.el("span", "na-num", count.toLocaleString()));
      return cell;
    };

    const ownerLabel = (stat) => {
      if (stat.owner.pack) return stat.owner.pack.name;
      if (stat.owner.kind !== ABSENT) return KIND_WORDS[stat.owner.kind] || "Unknown pack";
      const home = stat.home || {};
      if (home.pack) return `${home.pack.name} (not loaded)`;
      if (home.source) return `${home.source.title} (not installed)`;
      if (home.core) return "ComfyUI core (newer)";
      return model.settled ? "Unknown pack" : "Matching...";
    };

    const packMarks = (pack) => {
      const marks = [];
      if (pack.own) marks.push(mark("Open Manager"));
      if (pack.removed) marks.push(mark(pack.removed === "uninstall" ? "uninstalled" : "switched off", "warn"));
      else if (pack.disabled) marks.push(mark("off"));
      if (pack.failed) marks.push(mark("failed to load", "bad"));
      if (pack.loose && !pack.removed) {
        marks.push(pack.file ? mark("single file") : mark("not on disk, restart to unload", "warn"));
      }
      if (pack.waiting.size) marks.push(mark(`${pack.waiting.size} needed, not loaded`, "warn"));
      if (pack.placed && pack.off === pack.placed) marks.push(mark("muted or bypassed only"));
      if (pack.git) marks.push(mark("git"));
      return marks;
    };

    const grid = (name, columns, items, { cells, detail, key, title, scope = "" }) => {
      const fallback = columns.find((one) => one.first) || columns[0];
      const asked = view.sort[name] || {};
      const column = columns.find((one) => one.key === asked.key) || fallback;
      const dir = asked.key === column.key && (asked.dir === 1 || asked.dir === -1) ? asked.dir : column.dir;
      const ordered = [...items].sort((a, b) => compare(column.value(a), column.value(b)) * dir
        || compare(title(a), title(b)));
      const box = api.el("div", `na-grid na-grid-${name}`);
      const head = api.el("div", "na-line na-head");
      for (const one of columns) {
        const button = keyed(api.el("button", [one.wide && "na-wide", one.end && "na-end"].filter(Boolean).join(" "),
          one.label), `sort:${scope}/${name}:${one.key}`);
        button.type = "button";
        if (one === column) {
          button.classList.add("na-sorted");
          button.textContent = `${one.label} ${dir > 0 ? "↑" : "↓"}`;
        }
        button.onclick = () => {
          view.sort[name] = { key: one.key, dir: one === column ? -dir : one.dir };
          keepView();
          draw();
        };
        head.appendChild(button);
      }
      box.appendChild(head);
      for (const item of ordered.slice(0, ROW_CAP)) {
        const id = `${scope}/${name}:${key(item)}`;
        const row = api.el("div", "na-row");
        const line = api.el("div", "na-line");
        line.append(...cells(item));
        row.appendChild(line);
        if (detail) {
          keyed(line, `row:${id}`);
          line.tabIndex = 0;
          line.setAttribute("role", "button");
          line.setAttribute("aria-expanded", String(expanded.has(id)));
          const flip = () => {
            const shown = row.querySelector(":scope > .na-detail");
            if (shown) {
              shown.remove();
              expanded.delete(id);
            } else {
              row.appendChild(detail(item));
              expanded.add(id);
            }
            row.classList.toggle("na-open", !shown);
            line.setAttribute("aria-expanded", String(!shown));
          };
          line.onclick = flip;
          line.onkeydown = (event) => {
            if (event.key === "Enter" || event.key === " ") { event.preventDefault(); flip(); }
          };
          if (expanded.has(id)) {
            row.appendChild(detail(item));
            row.classList.add("na-open");
          }
        }
        box.appendChild(row);
      }
      if (ordered.length > ROW_CAP) {
        box.appendChild(api.el("div", "na-more",
          `${(ordered.length - ROW_CAP).toLocaleString()} more`));
      }
      return box;
    };

    const nameCell = (text, sub, marks = []) => {
      const cell = api.el("span", "na-name-cell");
      const words = api.el("span", "na-words");
      words.appendChild(api.el("span", "na-name", text));
      if (sub) words.appendChild(api.el("span", "na-sub", sub));
      cell.append(words, ...marks);
      cell.title = sub ? `${text}\n${sub}` : text;
      return cell;
    };

    const typeTable = (stats, scope) => {
      const most = Math.max(1, ...stats.map((stat) => stat.workflows.length));
      return grid("types", [
        { key: "type", label: "Node", value: (s) => s.type, dir: 1 },
        { key: "workflows", label: "Workflows", value: (s) => s.workflows.length, dir: -1, first: true },
        { key: "placed", label: "Placed", value: (s) => s.placed, dir: -1, end: true, wide: true },
        { key: "last", label: "Last saved", value: (s) => s.last, dir: -1, wide: true },
      ], stats, {
        scope,
        key: (s) => s.type,
        title: (s) => s.type,
        cells: (s) => [
          nameCell(s.type, "", s.off && s.off === s.placed ? [mark("muted or bypassed")] : []),
          freq(s.workflows.length, most),
          api.el("span", "na-num na-wide", s.off ? `${s.placed} (${s.off} off)` : String(s.placed)),
          api.el("span", "na-sub na-wide", when(s.last)),
        ],
        detail: (s) => {
          const box = api.el("div", "na-detail");
          box.appendChild(flowChips(s.workflows));
          return box;
        },
      });
    };

    const packDetail = (pack) => {
      const box = api.el("div", "na-detail");
      const facts = api.el("div", "na-facts");
      const fact = (text) => { if (text) facts.appendChild(api.el("span", null, text)); };
      fact(pack.loose ? `Loaded from ${pack.file ? `${pack.dir}.py` : pack.dir}` : `Folder ${pack.dir}`);
      if (pack.version && pack.version !== "present") fact(`Version ${pack.version}`);
      if (pack.installedAt) fact(`Installed ${when(pack.installedAt)}`);
      if (pack.registryId) fact(`Registry ${pack.registryId}`);
      fact(pack.disabled ? "Nodes not loaded" : `Registers ${plural(pack.provides.size, "node")}`);
      box.appendChild(facts);

      const used = [...pack.used].map((type) => model.types.get(type)).filter(Boolean);
      if (used.length) {
        box.appendChild(api.el("div", "na-sub-head", `In workflows (${used.length})`));
        box.appendChild(typeTable(used, `pack:${pack.key}`));
      }
      const waiting = [...pack.waiting].map((type) => model.types.get(type)).filter(Boolean);
      if (waiting.length) {
        box.appendChild(api.el("div", "na-sub-head",
          `Needed by workflows, not loaded (${waiting.length})`));
        box.appendChild(typeTable(waiting, `wait:${pack.key}`));
      }
      const idle = [...pack.provides].filter((type) => !pack.used.has(type)).sort(compare);
      if (idle.length) {
        const more = api.el("details", "na-idle");
        more.appendChild(api.el("summary", "na-sub-head", `In no workflow (${idle.length})`));
        more.addEventListener("toggle", () => {
          if (!more.open || more.querySelector(".na-idle-list")) return;
          more.appendChild(api.el("div", "na-idle-list", idle.join(", ")));
        });
        box.appendChild(more);
      }

      const acts = api.el("div", "na-acts");
      if (pack.registryId) {
        const page = api.el("button", "om-btn", "Pack page");
        page.onclick = () => { void api.packs.open(pack.registryId); };
        acts.appendChild(page);
      }
      if (pack.installed && !pack.own && !pack.removed) {
        if (!pack.disabled) {
          const off = api.el("button", "om-btn", "Switch off");
          off.onclick = () => { void removePacks([pack], "off"); };
          acts.appendChild(off);
        }
        const drop = api.el("button", "om-btn om-danger", "Uninstall");
        drop.onclick = () => { void removePacks([pack], "uninstall"); };
        acts.appendChild(drop);
      }
      if (acts.childElementCount) box.appendChild(acts);
      return box;
    };

    const drawPacks = () => {
      const filter = view.filter.packs;
      const items = [...model.packs.values()].filter((pack) => {
        if (filter === "used" && !pack.workflows.size) return false;
        if (filter === "unused" && pack.workflows.size) return false;
        if (filter === "off" && !pack.disabled && !pack.failed) return false;
        return matches(pack.name, pack.id, pack.registryId, ...pack.used, ...pack.waiting);
      });
      if (!items.length) { say(query ? "Nothing matches that." : "No packs here."); return; }
      const most = Math.max(1, ...items.map((pack) => pack.workflows.size));
      list.replaceChildren(grid("packs", [
        { key: "name", label: "Pack", value: (p) => p.name, dir: 1 },
        { key: "nodes", label: "Nodes used", value: (p) => p.used.size + p.waiting.size, dir: -1, end: true },
        { key: "workflows", label: "Workflows", value: (p) => p.workflows.size, dir: -1, first: true },
        { key: "placed", label: "Placed", value: (p) => p.placed, dir: -1, end: true, wide: true },
        { key: "last", label: "Last saved", value: (p) => p.last, dir: -1, wide: true },
      ], items, {
        key: (p) => p.key,
        title: (p) => p.name,
        cells: (p) => [
          nameCell(p.name, p.id !== p.name && p.id !== p.dir ? p.id : "", packMarks(p)),
          api.el("span", "na-num",
            p.disabled || p.loose && !p.provides.size
              ? String(p.used.size + p.waiting.size)
              : `${p.used.size} of ${p.provides.size}`),
          freq(p.workflows.size, most),
          api.el("span", "na-num na-wide", p.placed.toLocaleString()),
          api.el("span", "na-sub na-wide", when(p.last)),
        ],
        detail: packDetail,
      }));
    };

    const drawNodes = () => {
      const filter = view.filter.nodes;
      const items = [...model.types.values()].filter((stat) => {
        const kind = stat.owner.pack ? "packs" : stat.owner.kind === ABSENT ? "missing" : "core";
        if (filter !== "all" && filter !== kind) return false;
        return matches(stat.type, ownerLabel(stat));
      });
      if (!items.length) { say(query ? "Nothing matches that." : "No nodes here."); return; }
      const most = Math.max(1, ...items.map((stat) => stat.workflows.length));
      list.replaceChildren(grid("nodes", [
        { key: "type", label: "Node", value: (s) => s.type, dir: 1 },
        { key: "pack", label: "From", value: (s) => ownerLabel(s), dir: 1 },
        { key: "workflows", label: "Workflows", value: (s) => s.workflows.length, dir: -1, first: true },
        { key: "placed", label: "Placed", value: (s) => s.placed, dir: -1, end: true, wide: true },
        { key: "last", label: "Last saved", value: (s) => s.last, dir: -1, wide: true },
      ], items, {
        key: (s) => s.type,
        title: (s) => s.type,
        cells: (s) => [
          nameCell(s.type, "", s.off && s.off === s.placed ? [mark("muted or bypassed")] : []),
          api.el("span", `na-sub${s.owner.kind === ABSENT ? " na-missing" : ""}`, ownerLabel(s)),
          freq(s.workflows.length, most),
          api.el("span", "na-num na-wide", s.placed.toLocaleString()),
          api.el("span", "na-sub na-wide", when(s.last)),
        ],
        detail: (s) => {
          const box = api.el("div", "na-detail");
          box.appendChild(flowChips(s.workflows));
          return box;
        },
      }));
    };

    const drawMissing = () => {
      const groups = missingGroups(model).filter((group) => matches(group.title,
        ...group.types.map((stat) => stat.type)));
      if (!groups.length) {
        say(query ? "Nothing matches that." : "Every node the workflows use is installed.");
        return;
      }
      const cards = groups.map((group) => {
        const card = api.el("section", "na-card");
        const head = api.el("div", "na-card-head");
        head.appendChild(api.el("span", "na-card-title", group.title));
        if (group.state) head.appendChild(mark(group.state, group.tone));
        head.appendChild(api.el("span", "na-card-meta",
          `${plural(group.types.length, "node type")} in ${plural(group.workflows.size, "workflow")}`));
        if (group.packId) {
          const page = api.el("button", "om-btn", group.pack ? "Pack page" : "Open to install");
          page.onclick = () => { void api.packs.open(group.packId); };
          head.appendChild(page);
        } else if (/^https?:\/\//i.test(group.repo || "")) {
          const link = api.el("a", "na-link", "Repository");
          link.href = group.repo;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          head.appendChild(link);
        }
        const types = query && !matches(group.title)
          ? group.types.filter((stat) => matches(stat.type)) : group.types;
        const whole = expanded.has(`card:${group.key}`) || types.length <= CARD_ROWS;
        const shown = whole ? types
          : [...types].sort((a, b) => b.workflows.length - a.workflows.length).slice(0, CARD_ROWS);
        card.append(head, typeTable(shown, group.key));
        if (types.length > CARD_ROWS) {
          const more = keyed(api.el("button", "na-card-more",
            whole ? "Show fewer" : `Show all ${types.length.toLocaleString()}`), `more:${group.key}`);
          more.type = "button";
          more.onclick = () => {
            if (whole) expanded.delete(`card:${group.key}`);
            else expanded.add(`card:${group.key}`);
            draw();
          };
          card.appendChild(more);
        }
        return card;
      });
      list.replaceChildren(...cards);
    };

    const drawWorkflows = () => {
      const items = model.flows.filter((flow) => matches(flow.label,
        ...[...flow.packs].map((key) => model.packs.get(key)?.name), ...flow.missing));
      if (!items.length) {
        say(query ? "Nothing matches that." : "No saved workflows were found.");
        return;
      }
      list.replaceChildren(grid("workflows", [
        { key: "name", label: "Workflow", value: (f) => f.label, dir: 1 },
        { key: "nodes", label: "Nodes", value: (f) => f.nodes, dir: -1, end: true },
        { key: "packs", label: "Packs", value: (f) => f.packs.size, dir: -1, end: true },
        { key: "missing", label: "Missing", value: (f) => f.missing.size, dir: -1, end: true },
        { key: "last", label: "Last saved", value: (f) => (f.saved ? f.time : 0), dir: -1,
          first: true, wide: true },
      ], items, {
        key: (f) => f.index,
        title: (f) => f.label,
        cells: (f) => {
          const marks = [];
          if (f.open) marks.push(mark(f.modified ? "open, unsaved changes" : "open"));
          if (!f.saved) marks.push(mark("never saved"));
          if (f.api) marks.push(mark("API format"));
          return [
            nameCell(f.label, "", marks),
            api.el("span", "na-num", f.nodes.toLocaleString()),
            api.el("span", "na-num", String(f.packs.size)),
            api.el("span", `na-num${f.missing.size ? " na-missing" : ""}`, String(f.missing.size)),
            api.el("span", "na-sub na-wide", f.saved ? when(f.time) : ""),
          ];
        },
        detail: (f) => {
          const box = api.el("div", "na-detail");
          const acts = api.el("div", "na-acts");
          if (f.mine) {
            const go = api.el("button", "om-btn om-go", "Open");
            go.onclick = () => { void openFlow(f); };
            acts.appendChild(go);
            box.appendChild(acts);
          }
          const names = [...f.packs].map((key) => model.packs.get(key)?.name).filter(Boolean).sort(compare);
          box.appendChild(api.el("div", "na-sub-head", names.length ? `Packs (${names.length})` : "No packs"));
          if (names.length) box.appendChild(api.el("div", "na-idle-list", names.join(", ")));
          if (f.missing.size) {
            box.appendChild(api.el("div", "na-sub-head", `Missing (${f.missing.size})`));
            box.appendChild(api.el("div", "na-idle-list na-missing",
              [...f.missing].sort(compare).join(", ")));
          }
          return box;
        },
      }));
    };

    const SECTIONS = [
      { key: "unused", title: "Not in any workflow",
        why: "Their nodes are in no saved or open workflow." },
      { key: "dormant", title: "Switched off or failed to load",
        why: "Not loaded. No workflow names them, and the community node list matches none of "
          + "the missing nodes to them." },
      { key: "nodeless", title: "No nodes",
        why: "They register no nodes, so no workflow can show their use." },
    ];

    const pickRow = (pack) => {
      const row = api.el("label", "na-pick");
      const box = keyed(api.el("input"), `pick:${pack.key}`);
      box.type = "checkbox";
      box.checked = picked.has(pack.key);
      box.disabled = busy;
      box.onchange = () => {
        if (box.checked) picked.add(pack.key);
        else picked.delete(pack.key);
        draw();
      };
      const facts = [];
      if (pack.provides.size) facts.push(`registers ${plural(pack.provides.size, "node")}`);
      if (pack.installedAt) facts.push(`installed ${when(pack.installedAt)}`);
      if (pack.version && pack.version !== "present") facts.push(pack.version);
      const state = progress.get(pack.key) || "";
      row.append(box, nameCell(pack.name, facts.join(" · "), packMarks(pack)),
        api.el("span", "na-pick-state", state));
      return row;
    };

    const drawRemove = () => {
      const found = candidates(model);
      const shown = SECTIONS.map((section) => ({
        ...section, packs: found[section.key].filter((pack) => matches(pack.name, pack.id)),
      })).filter((section) => section.packs.length);
      const parts = [];
      if (model.gates.install === false) {
        parts.push(api.el("div", "na-banner",
          `Uninstalling is switched off on this install (${model.gates.names?.install || "OPEN_MANAGER_NO_INSTALL"}).`));
      }
      if (!shown.length) {
        parts.push(api.el("div", "na-empty", query ? "Nothing matches that."
          : "Every installed pack is used by a workflow."));
        list.replaceChildren(...parts);
        return;
      }
      for (const section of shown) {
        const box = api.el("section", "na-section");
        const head = api.el("div", "na-section-head");
        head.appendChild(api.el("span", "na-section-title", section.title));
        head.appendChild(api.el("span", "na-card-meta", String(section.packs.length)));
        const all = api.el("label", "na-all");
        const check = keyed(api.el("input"), `all:${section.key}`);
        check.type = "checkbox";
        const on = section.packs.filter((pack) => picked.has(pack.key)).length;
        check.checked = on === section.packs.length;
        check.indeterminate = on > 0 && on < section.packs.length;
        check.disabled = busy || !model.settled;
        check.onchange = () => {
          for (const pack of section.packs) {
            if (check.checked) picked.add(pack.key);
            else picked.delete(pack.key);
          }
          draw();
        };
        all.append(check, api.el("span", null, "Select all"));
        head.appendChild(all);
        box.appendChild(head);
        box.appendChild(api.el("div", "na-section-why", section.why));
        for (const pack of section.packs) box.appendChild(pickRow(pack));
        parts.push(box);
      }
      list.replaceChildren(...parts);
    };

    const drawFoot = () => {
      if (!model || view.tab !== "remove") { foot.replaceChildren(); return; }
      const listed = candidateKeys(model);
      const chosen = [...picked].filter((key) => listed.has(key)).map((key) => model.packs.get(key));
      const text = api.el("span", "na-foot-text",
        busy ? "Working..." : chosen.length ? `${plural(chosen.length, "pack")} selected` : "None selected");
      const clear = keyed(api.el("button", "om-btn", "Clear"), "foot:clear");
      clear.disabled = busy || !chosen.length;
      clear.onclick = () => { picked.clear(); draw(); };
      const off = keyed(api.el("button", "om-btn", "Switch off"), "foot:off");
      off.title = "Renames each to end in .disabled";
      off.disabled = busy || !model.settled || !chosen.some((pack) => !pack.disabled);
      off.onclick = () => { void removePacks(chosen.filter((pack) => !pack.disabled), "off"); };
      const drop = keyed(api.el("button", "om-btn om-danger", chosen.length ? `Uninstall ${chosen.length}` : "Uninstall"),
        "foot:drop");
      drop.disabled = busy || !model.settled || !chosen.length || model.gates.install === false;
      drop.onclick = () => { void removePacks(chosen, "uninstall"); };
      foot.replaceChildren(text, clear, off, drop);
    };

    const removePacks = async (chosen, how) => {
      if (busy || !chosen.length) return;
      const uninstalling = how === "uninstall";
      if (uninstalling && model.gates.install === false) {
        api.notify("Uninstalling is off", "This install does not allow packs to be uninstalled.");
        return;
      }
      const nameList = (packs, cap) => packs.slice(0, cap).map((pack) => pack.name).join(", ")
        + (packs.length > cap ? `, and ${packs.length - cap} more` : "");
      const listed = nameList(chosen, 10);
      const clones = uninstalling ? chosen.filter((pack) => pack.git) : [];
      const clonesText = !clones.length ? ""
        : clones.length === 1 ? ` ${clones[0].name} is a git clone: changes made in it are lost too.`
          : ` ${nameList(clones, 5)} are git clones: changes made in them are lost too.`;
      const used = chosen.filter((pack) => pack.workflows.size);
      const usedText = !used.length ? ""
        : used.length === 1 ? ` ${used[0].name} is in ${plural(used[0].workflows.size, "workflow")}.`
          : ` ${nameList(used, 5)} are in workflows.`;
      const text = uninstalling
        ? `Deletes ${listed} from custom_nodes.${clonesText}${usedText}`
        : `Renames ${listed} to end in .disabled.${usedText}`;
      const title = `${uninstalling ? "Uninstall" : "Switch off"} ${chosen.length === 1 ? chosen[0].name : plural(chosen.length, "pack")}?`;
      const go = await api.confirm(title, text, uninstalling ? "Uninstall" : "Switch off", uninstalling);
      if (!go || !win.isOpen()) return;
      busy = true;
      const done = [];
      const failed = [];
      for (const pack of chosen) {
        progress.set(pack.key, uninstalling ? "Uninstalling..." : "Switching off...");
        draw();
        const answer = uninstalling ? await api.packs.uninstall(pack.dir) : await api.packs.switchOff(pack.dir);
        if (answer?.ok) {
          pack.removed = how;
          removed.set(pack.dir, how);
          picked.delete(pack.key);
          progress.set(pack.key, uninstalling ? "Uninstalled" : "Switched off");
          done.push(pack);
        } else {
          progress.set(pack.key, "Failed");
          failed.push(`${pack.name}: ${answer?.reason || "no answer"}`);
        }
      }
      busy = false;
      if (done.length) {
        await api.packs.refresh().catch(() => {});
        api.packs.restart();
        api.toast(`${uninstalling ? "Uninstalled" : "Switched off"} ${plural(done.length, "pack")}.`, { kind: "ok" });
      }
      if (failed.length) {
        api.notify(`${plural(failed.length, "pack")} not ${uninstalling ? "uninstalled" : "switched off"}`,
          failed.join("\n"));
      }
      draw();
    };

    const drawTiles = () => {
      const packs = [...model.packs.values()].filter((pack) => pack.installed && !pack.removed);
      const used = packs.filter((pack) => pack.workflows.size).length;
      const found = candidates(model);
      const missing = [...model.types.values()].filter((stat) => stat.owner.kind === ABSENT);
      const missingFlows = model.flows.filter((flow) => flow.missing.size).length;
      const tile = (key, number, label, tone, go) => {
        const button = keyed(api.el("button", `na-tile${tone ? ` na-tile-${tone}` : ""}`), `tile:${key}`);
        button.type = "button";
        button.append(api.el("span", "na-tile-num", number), api.el("span", "na-tile-label", label));
        button.onclick = go;
        return button;
      };
      const unused = found.unused.length + found.dormant.length;
      tiles.replaceChildren(
        tile("workflows", model.flows.length.toLocaleString(), "Workflows read", "", () => setTab("workflows")),
        tile("used", `${used} of ${packs.length}`, "Packs in use", "",
          () => { view.filter.packs = "used"; setTab("packs"); }),
        tile("unused", String(unused), "Packs in no workflow", unused ? "warn" : "", () => setTab("remove")),
        tile("missing", String(missing.length), missingFlows
          ? `Missing node types, in ${plural(missingFlows, "workflow")}`
          : "Missing node types", missing.length ? "bad" : "", () => setTab("missing")),
      );
    };

    const drawNotes = () => {
      const parts = [];
      const open = model.flows.filter((flow) => flow.open).length;
      if (open) parts.push(`${plural(open, "open tab")} included`);
      const skipped = model.audit.skipped || [];
      if (skipped.length) {
        const note = api.el("span", "na-note-warn", `${plural(skipped.length, "file")} not read`);
        note.title = skipped.slice(0, 30).map((one) => `${one.path}: ${one.reason}`).join("\n");
        parts.push(note);
      }
      if (model.audit.capped) parts.push(api.el("span", "na-note-warn", "Stopped at 5,000 workflow files"));
      if (!model.settled) parts.push("Matching missing nodes to packs...");
      if (model.resolveNote) parts.push(api.el("span", "na-note-warn", model.resolveNote));
      const counted = [...model.packs.values()].filter((pack) => pack.removed).length;
      if (counted) parts.push(api.el("span", "na-note-warn", `${plural(counted, "pack")} removed, loaded until ComfyUI restarts`));
      parts.push(`Read ${new Date((model.audit.searched_at || Date.now() / 1000) * 1000).toLocaleTimeString()}`);
      notes.replaceChildren(...parts.map((part) => (typeof part === "string" ? api.el("span", null, part) : part)));
    };

    const drawTabs = () => {
      const found = candidates(model);
      const counts = {
        missing: [...model.types.values()].filter((stat) => stat.owner.kind === ABSENT).length,
        remove: found.unused.length + found.dormant.length + found.nodeless.length,
      };
      tabs.replaceChildren(...TABS.map((one) => {
        const button = keyed(api.el("button", `na-tab${view.tab === one.key ? " na-tab-on" : ""}`, one.label),
          `tab:${one.key}`);
        button.type = "button";
        button.setAttribute("aria-pressed", String(view.tab === one.key));
        if (counts[one.key]) button.appendChild(api.el("span", "na-tab-count", String(counts[one.key])));
        button.onclick = () => setTab(one.key);
        return button;
      }));
    };

    const drawBar = () => {
      const filters = FILTERS[view.tab];
      if (!filters) { bar.replaceChildren(); return; }
      bar.replaceChildren(...filters.map((one) => {
        const chip = keyed(api.el("button", "na-chip", one.label), `chip:${view.tab}:${one.key}`);
        chip.type = "button";
        chip.setAttribute("aria-pressed", String(view.filter[view.tab] === one.key));
        chip.onclick = () => {
          view.filter[view.tab] = one.key;
          keepView();
          draw();
        };
        return chip;
      }));
    };

    const draw = () => {
      if (!model || !win.isOpen()) return;
      const scroll = list.scrollTop;
      const focused = shell.contains(document.activeElement) ? document.activeElement.dataset?.naKey : "";
      drawTiles();
      drawNotes();
      drawTabs();
      drawBar();
      ({ packs: drawPacks, nodes: drawNodes, missing: drawMissing, workflows: drawWorkflows,
         remove: drawRemove })[view.tab]();
      drawFoot();
      list.scrollTop = scroll;
      if (focused) {
        shell.querySelector(`[data-na-key="${CSS.escape(focused)}"]`)?.focus({ preventScroll: true });
      }
    };

    const prunePicked = () => {
      const listed = candidateKeys(model);
      for (const key of [...picked]) if (!listed.has(key)) picked.delete(key);
    };

    const setTab = (key) => {
      if (!TABS.some((one) => one.key === key)) return;
      if (view.tab !== key) list.scrollTop = 0;
      view.tab = key;
      keepView();
      draw();
      list.scrollTop = 0;
    };

    const load = async () => {
      const ticket = ++latest;
      again.disabled = true;
      if (!model) {
        const box = api.el("div", "om-loading");
        box.append(api.el("div", "om-loading-spin"), api.el("div", "om-loading-text", "Reading workflows"));
        list.replaceChildren(box);
      }
      try {
        const [installed, audit, startup, gates] = await Promise.all([
          api.packs.installed(), api.packs.audit(), api.packs.startup(), api.packs.gates(),
        ]);
        if (ticket !== latest || !win.isOpen()) return;
        if (!audit?.ok) throw new Error(audit?.reason || "the workflows could not be read");
        const next = build(api, { installed, audit, startup, gates }, removed);
        model = next;
        progress.clear();
        prunePicked();
        draw();
        await resolveMissing(api, next);
        if (ticket !== latest || model !== next) return;
        prunePicked();
        draw();
      } catch (error) {
        if (ticket !== latest) return;
        model = null;
        tiles.replaceChildren();
        notes.replaceChildren();
        tabs.replaceChildren();
        bar.replaceChildren();
        foot.replaceChildren();
        say(`Not read: ${error.message}.`, "na-empty na-error");
      } finally {
        if (ticket === latest) again.disabled = false;
      }
    };

    let typing = 0;
    find.addEventListener("input", () => {
      clearTimeout(typing);
      typing = setTimeout(() => {
        query = find.value.trim().toLowerCase();
        draw();
      }, 120);
    });
    find.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && find.value) {
        event.stopPropagation();
        find.value = "";
        query = "";
        draw();
      }
    });
    again.onclick = () => { if (!busy) void load(); };

    api.style(`
      .na-shell { display: flex; flex-direction: column; flex: 1; min-height: 0; font-size: 12px;
        container-type: inline-size; }
      .na-find { width: 240px; }
      .na-tiles { flex: none; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px;
        padding: 10px 12px 0; }
      .na-tile { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; min-width: 0;
        padding: 8px 10px; border: 1px solid var(--om-border); border-radius: 8px; background: transparent;
        color: inherit; font: inherit; text-align: left; cursor: pointer; }
      .na-tile:hover { background: var(--om-hover); }
      .na-tile-num { font-size: 18px; font-weight: 600; font-variant-numeric: tabular-nums; }
      .na-tile-label { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        font-size: 11px; color: var(--om-muted); }
      .na-tile-warn .na-tile-num { color: #d29922; }
      .na-tile-bad .na-tile-num { color: #f85149; }
      .na-notes { flex: none; display: flex; flex-wrap: wrap; gap: 4px 14px; padding: 7px 12px 0;
        font-size: 11px; color: var(--om-muted); }
      .na-note-warn { color: #d29922; cursor: default; }
      .na-tabs { flex: none; display: flex; gap: 2px; padding: 6px 12px 0; overflow-x: auto;
        border-bottom: 1px solid var(--om-border); }
      .na-tab { display: inline-flex; align-items: center; padding: 6px 12px; border: 0;
        border-bottom: 2px solid transparent; background: transparent; color: var(--om-muted);
        font: inherit; white-space: nowrap; cursor: pointer; }
      .na-tab:hover { color: var(--om-text); }
      .na-tab-on { color: var(--om-text); font-weight: 600;
        border-bottom-color: var(--om-host-accent, #388bfd); }
      .na-tab-count { margin-left: 6px; padding: 0 6px; border-radius: 999px; font-size: 10px;
        font-weight: 600; background: color-mix(in srgb, var(--om-text) 12%, transparent); }
      .na-bar { flex: none; display: flex; flex-wrap: wrap; align-items: center; gap: 6px;
        padding: 8px 12px 2px; }
      .na-bar:empty { display: none; }
      .na-chip { padding: 3px 11px; border: 1px solid var(--om-border); border-radius: 999px;
        background: transparent; color: var(--om-muted); font: inherit; cursor: pointer; }
      .na-chip:hover { background: var(--om-hover); color: var(--om-text); }
      .na-chip[aria-pressed="true"] { color: var(--om-text);
        background: color-mix(in srgb, var(--om-text) 12%, transparent);
        border-color: color-mix(in srgb, var(--om-text) 32%, transparent); }
      .na-list { flex: 1; min-height: 0; overflow-y: auto; padding: 4px 12px 14px;
        container-type: inline-size; }
      .na-grid { display: flex; flex-direction: column; }
      .na-grid-packs { --na-cols: minmax(0, 1fr) 84px 150px 64px 76px; }
      .na-grid-nodes { --na-cols: minmax(0, 1.4fr) minmax(0, 1fr) 150px 64px 76px; }
      .na-grid-workflows { --na-cols: minmax(0, 1fr) 56px 50px 56px 76px; }
      .na-grid-types { --na-cols: minmax(0, 1fr) 140px 80px 76px; }
      .na-line { display: grid; grid-template-columns: var(--na-cols); align-items: center; gap: 10px;
        min-height: 22px; padding: 5px 8px; border-radius: 6px; }
      .na-head { position: sticky; top: 0; z-index: 2; border-radius: 0; background: var(--om-bg);
        border-bottom: 1px solid var(--om-border); }
      .na-head button { overflow: hidden; padding: 0; border: 0; background: none; color: var(--om-muted);
        font: inherit; font-size: 11px; text-align: left; text-overflow: ellipsis; white-space: nowrap;
        cursor: pointer; }
      .na-head button:hover, .na-head .na-sorted { color: var(--om-text); }
      .na-head .na-sorted { font-weight: 600; }
      .na-detail .na-head { position: static; background: transparent; }
      .na-row { border-bottom: 1px solid color-mix(in srgb, var(--om-border) 55%, transparent); }
      .na-row > .na-line { cursor: pointer; }
      .na-row > .na-line:hover { background: var(--om-hover); }
      .na-row > .na-line:focus-visible { outline: 2px solid var(--om-host-accent, #388bfd);
        outline-offset: -2px; }
      .na-open > .na-line { background: color-mix(in srgb, var(--om-text) 6%, transparent); }
      .na-name-cell { display: flex; align-items: center; gap: 6px; min-width: 0; }
      .na-words { display: flex; flex-direction: column; min-width: 0; }
      .na-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
      .na-sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--om-muted); }
      .na-num { font-variant-numeric: tabular-nums; white-space: nowrap; text-align: right; }
      .na-head .na-end { text-align: right; }
      .na-missing { color: #f85149; }
      .na-freq { display: flex; align-items: center; gap: 8px; min-width: 0; }
      .na-track { flex: 1; height: 6px; overflow: hidden; border-radius: 3px;
        background: color-mix(in srgb, var(--om-text) 10%, transparent); }
      .na-fill { display: block; height: 100%; border-radius: 3px;
        background: var(--om-host-accent, #388bfd); }
      .na-freq .na-num { min-width: 28px; text-align: right; }
      .na-mark { flex: none; padding: 0 6px; border: 1px solid var(--om-border); border-radius: 999px;
        color: var(--om-muted); font-size: 10px; font-weight: 400; line-height: 16px; white-space: nowrap; }
      .na-mark-warn { color: #d29922; border-color: color-mix(in srgb, #d29922 55%, transparent); }
      .na-mark-bad { color: #f85149; border-color: color-mix(in srgb, #f85149 55%, transparent); }
      .na-detail { display: flex; flex-direction: column; gap: 8px; padding: 6px 8px 12px 18px; }
      .na-detail .na-grid { padding-left: 2px; border-left: 2px solid var(--om-border); }
      .na-detail .na-line { padding: 3px 8px; }
      .na-facts { display: flex; flex-wrap: wrap; gap: 4px 14px; color: var(--om-muted); }
      .na-acts { display: flex; flex-wrap: wrap; gap: 6px; }
      .na-sub-head { font-size: 11px; font-weight: 600; color: var(--om-muted); cursor: default; }
      .na-idle summary { cursor: pointer; }
      .na-idle-list { padding-top: 4px; line-height: 1.55; overflow-wrap: anywhere; color: var(--om-muted); }
      .na-flows { display: flex; flex-wrap: wrap; gap: 4px; }
      .na-flow { max-width: 300px; overflow: hidden; padding: 2px 8px; border: 1px solid var(--om-border);
        border-radius: 5px; background: transparent; color: inherit; font: inherit; font-size: 11px;
        text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
      .na-flow:not(:disabled):hover { background: var(--om-hover); border-color: var(--om-host-accent, #388bfd); }
      .na-flow:disabled { opacity: .55; cursor: default; }
      .na-more, .na-more-inline { color: var(--om-muted); }
      .na-more { padding: 10px 8px; }
      .na-more-inline { align-self: center; font-size: 11px; }
      .na-empty { padding: 28px; text-align: center; color: var(--om-muted); }
      .na-error { color: #f85149; }
      .na-link { color: var(--om-host-accent, #58a6ff); }
      .na-card { margin-top: 10px; border: 1px solid var(--om-border); border-radius: 8px; overflow: hidden; }
      .na-card-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 8px 10px;
        border-bottom: 1px solid var(--om-border); }
      .na-card-title { font-size: 13px; font-weight: 600; }
      .na-card-meta { color: var(--om-muted); }
      .na-card-head > .om-btn, .na-card-head > .na-link { margin-left: auto; }
      .na-card > .na-grid { padding: 0 4px 4px; }
      .na-card-more { display: block; width: 100%; padding: 7px 10px; border: 0;
        border-top: 1px solid var(--om-border); background: transparent; color: var(--om-muted);
        font: inherit; text-align: left; cursor: pointer; }
      .na-card-more:hover { background: var(--om-hover); color: var(--om-text); }
      .na-foot .om-btn:disabled, .na-acts .om-btn:disabled { opacity: .45; cursor: default; }
      .na-banner { margin-top: 8px; padding: 8px 10px; border: 1px solid var(--om-border);
        border-left: 3px solid #d29922; border-radius: 6px; }
      .na-section { margin-top: 10px; }
      .na-section-head { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; gap: 8px;
        padding: 7px 8px; background: var(--om-bg); border-bottom: 1px solid var(--om-border); }
      .na-section-title { font-size: 13px; font-weight: 600; }
      .na-section-why { padding: 6px 8px 4px; line-height: 1.45; color: var(--om-muted); }
      .na-all { display: flex; align-items: center; gap: 6px; margin-left: auto; color: var(--om-muted);
        cursor: pointer; user-select: none; }
      .na-pick { display: grid; grid-template-columns: 16px minmax(0, 1fr) auto; align-items: center;
        gap: 10px; padding: 7px 8px; border-radius: 6px; cursor: pointer;
        border-bottom: 1px solid color-mix(in srgb, var(--om-border) 55%, transparent); }
      .na-pick:hover { background: var(--om-hover); }
      .na-pick input, .na-all input { margin: 0; accent-color: var(--om-host-accent, #388bfd); }
      .na-pick-state { color: var(--om-muted); white-space: nowrap; }
      .na-foot { flex: none; display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
        padding: 8px 12px; border-top: 1px solid var(--om-border); }
      .na-foot:empty { display: none; }
      .na-foot-text { margin-right: auto; color: var(--om-muted); }
      @container (max-width: 620px) {
        .na-wide { display: none; }
        .na-grid-packs { --na-cols: minmax(0, 1fr) 64px 110px; }
        .na-grid-nodes { --na-cols: minmax(0, 1fr) minmax(0, .8fr) 100px; }
        .na-grid-workflows { --na-cols: minmax(0, 1fr) 44px 40px 48px; }
        .na-grid-types { --na-cols: minmax(0, 1fr) 100px; }
      }
      @container (max-width: 520px) {
        .na-tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
    `);

    void (async () => {
      const kept = await api.storage.get("view", null);
      if (kept && typeof kept === "object") {
        if (TABS.some((one) => one.key === kept.tab)) view.tab = kept.tab;
        for (const [name, filters] of Object.entries(FILTERS)) {
          if (filters.some((one) => one.key === kept.filter?.[name])) view.filter[name] = kept.filter[name];
        }
        if (kept.sort && typeof kept.sort === "object") view.sort = { ...kept.sort };
      }
      await load();
    })();
    win.autofocus(find);
    return win;
  },
};
