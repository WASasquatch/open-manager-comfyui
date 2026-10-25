const REPORT = "/open_manager/v1/api/registry-report/";

const STATUS_WORDS = {
  flagged: "Flagged", banned: "Banned", active: "Active", pending: "Pending",
  deleted: "Deleted",
};

const FROM_WORDS = { reviewer: "Reviewer", registry: "Registry", scan: "Automated scan" };

let comfyApi = null;

async function ask(path) {
  if (!comfyApi) ({ api: comfyApi } = await import("/scripts/api.js"));
  const answer = await comfyApi.fetchApi(path);
  let data = null;
  try {
    data = await answer.json();
  } catch {
    data = null;
  }
  if (!answer.ok || !data?.ok) {
    throw new Error(data?.reason || `the server answered ${answer.status}`);
  }
  return data;
}

function plural(count, word, many = `${word}s`) {
  return `${count} ${count === 1 ? word : many}`;
}

export const program = {
  open(api, carried) {
    const win = api.window({ size: "manager", title: "Registry Report" });
    const state = { pack: "", version: "", report: null, raw: false, latest: 0 };

    const packBox = api.el("input", "om-search rr-pack");
    packBox.placeholder = "Pack id";
    packBox.spellcheck = false;
    const versionPick = api.el("select", "om-side-select rr-version");
    versionPick.hidden = true;
    const rawButton = api.el("button", "om-btn rr-raw", "Raw");
    rawButton.disabled = true;
    win.tools.append(packBox, versionPick, rawButton);

    const body = api.el("div", "rr-body");
    win.body.appendChild(body);

    const chip = (status) => api.el("span", `rr-chip rr-status-${status || "unknown"}`,
      STATUS_WORDS[status] || status || "Unknown");

    const say = (text, cls = "rr-empty") => body.replaceChildren(api.el("div", cls, text));

    const section = (title, extra = "") => {
      const box = api.el("section", "rr-section");
      const head = api.el("div", "rr-section-head");
      head.appendChild(api.el("span", "rr-section-title", title));
      if (extra) head.appendChild(api.el("span", "rr-section-extra", extra));
      box.appendChild(head);
      return box;
    };

    const headerOf = (report) => {
      const head = api.el("div", "rr-head");
      const titles = api.el("div", "rr-titles");
      titles.appendChild(api.el("div", "rr-name", report.pack.name || report.pack.id));
      const line = api.el("div", "rr-line");
      line.appendChild(api.el("span", "rr-version-text", report.version));
      line.appendChild(chip(report.status));
      if (report.created_at) line.appendChild(api.el("span", "rr-muted", report.created_at));
      if (report.pack.publisher) line.appendChild(api.el("span", "rr-muted", report.pack.publisher));
      titles.appendChild(line);
      head.appendChild(titles);
      if (report.pack.repository) {
        const link = api.el("a", "rr-link", "Repository");
        link.href = report.pack.repository;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        head.appendChild(link);
      }
      return head;
    };

    const noteOf = (note, last) => {
      const row = api.el("div", `rr-note rr-tone-${note.tone || "note"}`);
      const top = api.el("div", "rr-note-top");
      top.appendChild(api.el("span", "rr-from", FROM_WORDS[note.from] || "Registry"));
      if (note.status) top.appendChild(chip(note.status));
      if (note.severity) top.appendChild(api.el("span", "rr-severity", note.severity));
      if (note.again) top.appendChild(api.el("span", "rr-muted", "re-review"));
      if (last) top.appendChild(api.el("span", "rr-now", "Now"));
      row.appendChild(top);
      if (note.from === "scan") {
        row.appendChild(api.el("div", "rr-meaning", plural(note.matches || 0, "match", "matches")));
        return row;
      }
      row.appendChild(api.el("div", "rr-meaning", note.meaning || note.category || note.text));
      if (note.detail) row.appendChild(api.el("div", "rr-detail", note.detail));
      if (note.meaning && (note.category || note.policy)) {
        const said = [note.policy ? `policy ${note.policy}` : "", note.category]
          .filter(Boolean).join(" · ");
        row.appendChild(api.el("div", "rr-source", said));
      }
      return row;
    };

    const findingOf = (finding) => {
      const item = api.el("div", "rr-finding");
      const where = api.el("button", "rr-where",
        finding.line ? `${finding.file}:${finding.line}` : finding.file || "(no file)");
      where.type = "button";
      item.appendChild(where);
      if (finding.line_text) item.appendChild(api.el("code", "rr-code-line", finding.line_text));
      const facts = [finding.rule, finding.scanner,
                     finding.confidence ? `${finding.confidence}% confidence` : "",
                     (finding.attack || []).join(", ")].filter(Boolean);
      if (facts.length) item.appendChild(api.el("div", "rr-rule", facts.join(" · ")));
      if (finding.code) {
        const code = api.el("pre", "rr-code", finding.code);
        code.hidden = true;
        item.appendChild(code);
        where.onclick = () => { code.hidden = !code.hidden; };
        where.classList.add("rr-where-open");
      } else {
        where.disabled = true;
      }
      return item;
    };

    const groupOf = (group) => {
      const box = api.el("details", `rr-group rr-sev-${group.severity || "none"}`);
      const summary = api.el("summary", "rr-group-head");
      summary.appendChild(api.el("span", "rr-group-label", group.label));
      summary.appendChild(api.el("span", "rr-count", String(group.count)));
      if (group.severity && group.severity !== "info") {
        summary.appendChild(api.el("span", "rr-severity", group.severity));
      }
      box.appendChild(summary);
      if (group.explain) box.appendChild(api.el("div", "rr-explain", group.explain));
      if (group.tags?.length) box.appendChild(api.el("div", "rr-muted rr-tags-line", group.tags.join(" · ")));
      let filled = false;
      box.addEventListener("toggle", () => {
        if (!box.open || filled) return;
        filled = true;
        for (const finding of group.findings) box.appendChild(findingOf(finding));
        if (group.more) box.appendChild(api.el("div", "rr-muted rr-more", `${group.more} more`));
      });
      return box;
    };

    const draw = () => {
      const report = state.report;
      if (!report) return;
      rawButton.classList.toggle("om-go", state.raw);
      if (state.raw) {
        body.replaceChildren(api.el("pre", "rr-raw-text", report.raw || "The registry gives no report."));
        return;
      }
      const parts = [headerOf(report)];
      parts.push(api.el("div", `rr-verdict rr-tone-${report.verdict.tone}`, report.verdict.text));

      const notes = report.notes || [];
      const said = section("Notes", notes.length ? "oldest first" : "");
      if (notes.length) notes.forEach((note, at) => said.appendChild(noteOf(note, at === notes.length - 1)));
      else said.appendChild(api.el("div", "rr-muted", "None."));
      parts.push(said);

      const scan = report.scan || { matches: 0, groups: [], tags: [] };
      if (scan.matches) {
        const box = section("Automated scan",
          `${plural(scan.matches, "match", "matches")} in ${plural(scan.files, "file")}`
          + (scan.scanners?.length ? ` · ${scan.scanners.join(", ")}` : ""));
        if (scan.tags?.length) {
          const tags = api.el("div", "rr-tags");
          for (const tag of scan.tags) {
            const one = api.el("span", "rr-tag", tag.label);
            one.appendChild(api.el("span", "rr-tag-count", String(tag.count)));
            tags.appendChild(one);
          }
          box.appendChild(tags);
        }
        for (const group of scan.groups) box.appendChild(groupOf(group));
        parts.push(box);
      }
      body.replaceChildren(...parts);
      body.scrollTop = 0;
    };

    const fillVersions = (report) => {
      const rows = (report.versions || []).filter((one) => one.status !== "active"
        || one.version === report.version);
      versionPick.replaceChildren(...rows.map((one) => {
        const option = api.el("option", null,
          `${one.version}${one.status !== "active" ? ` · ${STATUS_WORDS[one.status] || one.status}` : ""}`);
        option.value = one.version;
        return option;
      }));
      versionPick.value = report.version;
      versionPick.hidden = rows.length < 2;
    };

    const load = async (pack, version = "") => {
      const id = String(pack || "").trim();
      if (!id) {
        say("No pack.");
        return;
      }
      const ticket = ++state.latest;
      state.pack = id;
      state.version = String(version || "");
      packBox.value = id;
      win.setTitle(`Registry Report · ${id}`);
      say("Reading the registry...");
      try {
        const query = state.version ? `?version=${encodeURIComponent(state.version)}` : "";
        const report = await ask(`${REPORT}${encodeURIComponent(id)}${query}`);
        if (ticket !== state.latest) return;
        state.report = report;
        state.version = report.version;
        rawButton.disabled = false;
        fillVersions(report);
        draw();
      } catch (error) {
        if (ticket !== state.latest) return;
        state.report = null;
        rawButton.disabled = true;
        versionPick.hidden = true;
        say(`No report: ${error.message}.`, "rr-empty rr-error");
      }
    };

    packBox.addEventListener("keydown", (event) => {
      if (event.key === "Enter") { event.preventDefault(); void load(packBox.value); }
    });
    versionPick.addEventListener("change", () => { void load(state.pack, versionPick.value); });
    rawButton.onclick = () => { state.raw = !state.raw; draw(); };
    win.onCarry((next) => {
      win.present();
      void load(next?.pack, next?.version);
    });

    api.style(`
      .rr-body { flex: 1; min-height: 0; overflow-y: auto; padding: 12px 14px 18px;
        display: flex; flex-direction: column; gap: 12px; font-size: 12px; }
      .rr-pack { width: 200px; }
      .rr-version { max-width: 220px; }
      .rr-empty { padding: 28px; text-align: center; opacity: .65; }
      .rr-error { color: #f85149; opacity: 1; }
      .rr-head { display: flex; align-items: flex-start; gap: 12px; }
      .rr-titles { flex: 1; min-width: 0; }
      .rr-name { font-size: 16px; font-weight: 600; overflow-wrap: anywhere; }
      .rr-line { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 4px; }
      .rr-version-text { font-family: ui-monospace, monospace; }
      .rr-muted { opacity: .6; }
      .rr-link { color: #58a6ff; white-space: nowrap; }
      .rr-chip { padding: 1px 7px; border-radius: 9px; font-size: 10px; font-weight: 600;
        color: #fff; background: #6e7681; }
      .rr-status-flagged { background: #9e6a00; }
      .rr-status-banned { background: #b62324; }
      .rr-status-active { background: #238636; }
      .rr-verdict { padding: 10px 12px; border-radius: 8px; font-size: 13px; font-weight: 600;
        border: 1px solid var(--om-border); border-left-width: 4px; }
      .rr-tone-danger { border-left-color: #f85149; }
      .rr-tone-caution { border-left-color: #d29922; }
      .rr-tone-clear { border-left-color: #2ea043; }
      .rr-tone-note { border-left-color: #388bfd; }
      .rr-section { display: flex; flex-direction: column; gap: 6px; }
      .rr-section-head { display: flex; align-items: baseline; gap: 8px; padding-bottom: 4px;
        border-bottom: 1px solid var(--om-border); }
      .rr-section-title { font-size: 13px; font-weight: 600; }
      .rr-section-extra { opacity: .6; font-size: 11px; }
      .rr-note { padding: 8px 10px; border: 1px solid var(--om-border); border-left-width: 3px;
        border-radius: 6px; display: flex; flex-direction: column; gap: 4px; }
      .rr-note-top { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 11px; }
      .rr-from { font-weight: 600; opacity: .8; }
      .rr-now { margin-left: auto; font-size: 10px; font-weight: 600; opacity: .7; }
      .rr-severity { padding: 0 5px; border-radius: 3px; font-size: 10px; text-transform: uppercase;
        font-weight: 600; background: color-mix(in srgb, #f85149 25%, transparent); }
      .rr-meaning { font-weight: 600; font-size: 12.5px; }
      .rr-detail { line-height: 1.45; overflow-wrap: anywhere; }
      .rr-source { font-family: ui-monospace, monospace; font-size: 10.5px; opacity: .55;
        overflow-wrap: anywhere; }
      .rr-tags { display: flex; flex-wrap: wrap; gap: 6px; }
      .rr-tag { display: inline-flex; align-items: center; gap: 5px; padding: 2px 8px;
        border-radius: 10px; border: 1px solid var(--om-border); font-size: 11px; }
      .rr-tag-count { opacity: .6; }
      .rr-group { border: 1px solid var(--om-border); border-radius: 6px; padding: 0 10px; }
      .rr-group[open] { padding-bottom: 8px; }
      .rr-group-head { display: flex; align-items: center; gap: 8px; padding: 8px 0; cursor: pointer;
        list-style: none; }
      .rr-group-head::-webkit-details-marker { display: none; }
      .rr-group-head::before { content: "\\25B8"; opacity: .6; font-size: 10px; }
      .rr-group[open] > .rr-group-head::before { content: "\\25BE"; }
      .rr-group-label { flex: 1; font-weight: 600; }
      .rr-count { opacity: .7; font-variant-numeric: tabular-nums; }
      .rr-sev-high .rr-group-label, .rr-sev-critical .rr-group-label { color: #f85149; }
      .rr-explain { opacity: .8; line-height: 1.45; margin: -2px 0 6px; }
      .rr-tags-line { font-size: 11px; margin-bottom: 6px; }
      .rr-finding { border-top: 1px solid var(--om-border); padding: 6px 0; display: flex;
        flex-direction: column; gap: 3px; }
      .rr-where { align-self: flex-start; background: none; border: none; padding: 0;
        color: inherit; font-family: ui-monospace, monospace; font-size: 11px; font-weight: 600; }
      .rr-where-open { cursor: pointer; color: #58a6ff; }
      .rr-code-line { font-family: ui-monospace, monospace; font-size: 11px; opacity: .85;
        white-space: pre-wrap; overflow-wrap: anywhere; }
      .rr-rule { font-size: 10.5px; opacity: .55; }
      .rr-code { margin: 4px 0 0; padding: 8px; border-radius: 5px; overflow-x: auto;
        font-size: 11px; background: rgba(0, 0, 0, .3); white-space: pre; }
      .rr-more { padding-top: 6px; }
      .rr-raw-text { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere;
        font-family: ui-monospace, monospace; font-size: 11px; }
    `);

    if (carried?.pack) void load(carried.pack, carried.version);
    else {
      say("No pack.");
      win.autofocus(packBox);
    }
    return win;
  },
};
