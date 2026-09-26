import { STATUS_COLOUR, SEVERITY_COLOUR } from "./base.mjs";
import { install, uninstall } from "./installs.mjs";

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

export { el, safeUrl, safeArt, openUrl, badge, closeOn, stateRow, findingCard, toastHost, toastShut, toast, tipWith, liveTip, notify, askText, confirmAction, factList, chooseAction, openRowMenu, placeRowMenu, tabbedPanel, panel, collapsible, countNote };
