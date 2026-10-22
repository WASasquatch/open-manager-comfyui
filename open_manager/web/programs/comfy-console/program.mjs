const KEEP = 10000;

const BLOCK = 200;

const LINE_PX = 17;

const NEAR_END = 24;

const TAB_STOP = 8;

const LINE_CAP = 20000;

const PENDING_CAP = 256;

const SEEN_CAP = 4000;

const FIND_WAIT = 140;

const MARK_CAP = 200;

const PALETTE = [
  "#6e7681", "#f85149", "#3fb950", "#d29922", "#58a6ff", "#bc8cff", "#39c5cf", "#c9d1d9",
  "#8b949e", "#ff7b72", "#56d364", "#e3b341", "#79c0ff", "#d2a8ff", "#56d4dd", "#f0f6fc",
];

const CUBE = [0, 95, 135, 175, 215, 255];

const FLAGS = ["bold", "dim", "italic", "under", "strike", "inverse"];

const CONTROL = /[\x00-\x1f\x7f]/g;

function hex(red, green, blue) {
  return `#${[red, green, blue]
    .map((value) => Math.max(0, Math.min(255, Number(value) | 0)).toString(16).padStart(2, "0"))
    .join("")}`;
}

function xterm(index) {
  if (index < 16) return PALETTE[index];
  if (index < 232) {
    const value = index - 16;
    return hex(CUBE[Math.floor(value / 36)], CUBE[Math.floor(value / 6) % 6], CUBE[value % 6]);
  }
  const grey = 8 + (index - 232) * 10;
  return hex(grey, grey, grey);
}

function plainPen() {
  return { fg: null, bg: null, bold: false, dim: false, italic: false, under: false,
           strike: false, inverse: false };
}

function penKey(pen) {
  return `${pen.fg ?? ""}|${pen.bg ?? ""}|${FLAGS.map((flag) => (pen[flag] ? 1 : 0)).join("")}`;
}

function lookOf(pen) {
  let fg = pen.fg;
  let bg = pen.bg;
  const classes = [];
  const rules = [];
  if (pen.inverse) {
    [fg, bg] = [bg, fg];
    if (fg === null) rules.push("color: var(--con-back)");
    if (bg === null) rules.push("background: var(--con-ink)");
  }
  if (typeof fg === "number" && fg < 16) classes.push(`con-f${fg}`);
  else if (fg !== null) rules.push(`color: ${typeof fg === "number" ? xterm(fg) : fg}`);
  if (typeof bg === "number" && bg < 16) classes.push(`con-b${bg}`);
  else if (bg !== null) rules.push(`background: ${typeof bg === "number" ? xterm(bg) : bg}`);
  if (pen.bold) classes.push("con-bold");
  if (pen.dim) classes.push("con-dim");
  if (pen.italic) classes.push("con-it");
  if (pen.under && pen.strike) classes.push("con-ulst");
  else if (pen.under) classes.push("con-ul");
  else if (pen.strike) classes.push("con-st");
  return { classes: classes.join(" "), rules: rules.join("; ") };
}

function cutRuns(runs, from, to) {
  const kept = [];
  let at = 0;
  for (const run of runs) {
    if (at >= to) break;
    const stop = at + run.text.length;
    if (stop > from) {
      kept.push({ text: run.text.slice(Math.max(0, from - at), Math.min(run.text.length, to - at)),
                  look: run.look });
    }
    at = stop;
  }
  return kept;
}

function mergeRuns(runs) {
  const kept = [];
  for (const run of runs) {
    if (!run.text) continue;
    const last = kept[kept.length - 1];
    if (last && last.look === run.look) last.text += run.text;
    else kept.push({ text: run.text, look: run.look });
  }
  return kept;
}

function appendRun(line, text, look) {
  const last = line.runs[line.runs.length - 1];
  if (last && last.look === look) last.text += text;
  else line.runs.push({ text, look });
  line.len += text.length;
}

function lineCount(count) {
  return `${count.toLocaleString()} line${count === 1 ? "" : "s"}`;
}

function fileStamp() {
  const now = new Date();
  const two = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}-`
    + `${two(now.getHours())}${two(now.getMinutes())}${two(now.getSeconds())}`;
}

function makeSheet(host) {
  const blocks = [];
  const owner = new WeakMap();
  const fresh = () => {
    const block = { el: document.createElement("div"), count: 0 };
    block.el.className = "con-block";
    blocks.push(block);
    host.appendChild(block.el);
    return block;
  };
  return {
    blocks,
    add(node, before = null) {
      let block = before ? owner.get(before) : blocks[blocks.length - 1];
      if (!block || (!before && block.count >= BLOCK)) block = fresh();
      block.el.insertBefore(node, before && before.parentNode === block.el ? before : null);
      block.count += 1;
      owner.set(node, block);
    },
    drop(node) {
      const block = owner.get(node);
      node.remove();
      if (!block) return;
      owner.delete(node);
      block.count -= 1;
      if (block.count <= 0 && block !== blocks[blocks.length - 1]) {
        block.el.remove();
        blocks.splice(blocks.indexOf(block), 1);
      }
    },
    shift() {
      const block = blocks.shift();
      block?.el.remove();
      return block;
    },
    clear() {
      blocks.length = 0;
      host.replaceChildren();
    },
  };
}

export const program = {
  open(api) {
    const win = api.window({ size: "library", title: "Console" });
    const prefs = { wrap: true, times: false };
    const looks = [{ classes: "", rules: "" }];
    const lookIds = new Map([[penKey(plainPen()), 0]]);
    const lines = [];
    const dirty = new Set();
    const seen = new Set();
    let pen = plainPen();
    let penId = 0;
    let pending = "";
    let stamp = "";
    let row = 0;
    let col = 0;
    let floor = 0;
    let needle = "";
    let matched = 0;
    let follow = true;
    let frame = 0;
    let ready = false;
    let early = [];
    let syncing = 0;
    let failed = false;
    let findTimer = 0;

    const toolButton = (label, tip, pressable) => {
      const button = api.el("button", `om-btn${pressable ? " con-toggle" : ""}`, label);
      button.type = "button";
      if (tip) button.title = tip;
      if (pressable) button.setAttribute("aria-pressed", "false");
      return button;
    };

    const find = api.el("input", "om-search con-find");
    find.placeholder = "Find";
    find.spellcheck = false;
    const wrapButton = toolButton("Wrap", "Wrap long lines", true);
    const timesButton = toolButton("Times", "When each line was written", true);
    const copyButton = toolButton("Copy", "Copy the selection, or every line shown", false);
    const saveButton = toolButton("Save", "Save every line as a .log file", false);
    const clearButton = toolButton("Clear", "", false);
    win.tools.append(find, wrapButton, timesButton, copyButton, saveButton, clearButton);

    const wrap = api.el("div", "con");
    const view = api.el("div", "con-view");
    const out = api.el("div", "con-out");
    out.tabIndex = 0;
    const sheetHost = api.el("div", "con-sheet");
    const hitsHost = api.el("div", "con-sheet");
    hitsHost.hidden = true;
    const none = api.el("div", "con-none");
    none.hidden = true;
    out.append(sheetHost, hitsHost, none);
    const end = api.el("button", "con-end", "↓");
    end.type = "button";
    end.title = "Latest";
    end.setAttribute("aria-label", "Latest");
    end.hidden = true;
    view.append(out, end);
    const status = api.el("div", "con-status");
    wrap.append(view, status);
    win.body.appendChild(wrap);

    const sheet = makeSheet(sheetHost);
    const hits = makeSheet(hitsHost);

    const wake = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };

    const touch = (line) => {
      line.text = null;
      line.low = null;
      dirty.add(line);
      wake();
    };

    const addLine = () => {
      const line = { runs: [], len: 0, at: "", text: null, low: null, node: null, hit: null,
                     rule: false };
      lines.push(line);
      touch(line);
      return line;
    };

    const write = (text) => {
      if (!text || col >= LINE_CAP) return;
      const line = lines[row];
      const piece = text.length > LINE_CAP - col ? text.slice(0, LINE_CAP - col) : text;
      line.rule = false;
      if (!line.at) line.at = stamp;
      if (col > line.len) appendRun(line, " ".repeat(col - line.len), 0);
      if (col === line.len) {
        appendRun(line, piece, penId);
      } else {
        const stop = col + piece.length;
        line.runs = mergeRuns([...cutRuns(line.runs, 0, col), { text: piece, look: penId },
                               ...cutRuns(line.runs, stop, line.len)]);
        line.len = Math.max(line.len, stop);
      }
      col += piece.length;
      touch(line);
    };

    const newline = () => {
      row += 1;
      col = 0;
      if (row >= lines.length) {
        addLine();
        row = lines.length - 1;
      }
    };

    const erase = (mode) => {
      const line = lines[row];
      if (mode === 2) {
        if (!line.len) return;
        line.runs = [];
        line.len = 0;
      } else if (mode === 1) {
        const blank = Math.min(col + 1, line.len);
        if (!blank) return;
        line.runs = mergeRuns([{ text: " ".repeat(blank), look: 0 },
                               ...cutRuns(line.runs, blank, line.len)]);
      } else {
        if (col >= line.len) return;
        line.runs = cutRuns(line.runs, 0, col);
        line.len = col;
      }
      touch(line);
    };

    const setPen = (codes) => {
      const list = codes.length ? codes : [0];
      for (let at = 0; at < list.length; at += 1) {
        const code = list[at];
        if (code === 0) pen = plainPen();
        else if (code === 1) pen.bold = true;
        else if (code === 2) pen.dim = true;
        else if (code === 3) pen.italic = true;
        else if (code === 4 || code === 21) pen.under = true;
        else if (code === 7) pen.inverse = true;
        else if (code === 9) pen.strike = true;
        else if (code === 22) {
          pen.bold = false;
          pen.dim = false;
        } else if (code === 23) pen.italic = false;
        else if (code === 24) pen.under = false;
        else if (code === 27) pen.inverse = false;
        else if (code === 29) pen.strike = false;
        else if (code >= 30 && code <= 37) pen.fg = code - 30;
        else if (code === 39) pen.fg = null;
        else if (code >= 40 && code <= 47) pen.bg = code - 40;
        else if (code === 49) pen.bg = null;
        else if (code >= 90 && code <= 97) pen.fg = code - 82;
        else if (code >= 100 && code <= 107) pen.bg = code - 92;
        else if (code === 38 || code === 48) {
          let colour = null;
          if (list[at + 1] === 5 && at + 2 < list.length) {
            colour = Math.max(0, Math.min(255, list[at + 2] | 0));
            at += 2;
          } else if (list[at + 1] === 2 && at + 4 < list.length) {
            colour = hex(list[at + 2], list[at + 3], list[at + 4]);
            at += 4;
          } else {
            break;
          }
          if (code === 38) pen.fg = colour;
          else pen.bg = colour;
        }
      }
      const key = penKey(pen);
      let id = lookIds.get(key);
      if (id === undefined) {
        id = looks.length;
        looks.push(lookOf(pen));
        lookIds.set(key, id);
      }
      penId = id;
    };

    const control = (final, body) => {
      if (/^[?<>=]/.test(body)) return;
      const params = body ? body.split(";").map((part) => (/^\d+$/.test(part) ? Number(part)
        : part === "" ? 0 : -1)) : [];
      const count = Math.max(1, params[0] || 0);
      if (final === "m") setPen(params);
      else if (final === "K") erase(params[0] || 0);
      else if (final === "A") row = Math.max(floor, row - count);
      else if (final === "B") row = Math.min(lines.length - 1, row + count);
      else if (final === "C") col += count;
      else if (final === "D") col = Math.max(0, col - count);
      else if (final === "G") col = count - 1;
      else if (final === "E" || final === "F") {
        row = final === "E" ? Math.min(lines.length - 1, row + count) : Math.max(floor, row - count);
        col = 0;
      }
    };

    const feed = (data) => {
      const text = pending + data;
      pending = "";
      let at = 0;
      while (at < text.length) {
        CONTROL.lastIndex = at;
        const found = CONTROL.exec(text);
        const stop = found ? found.index : text.length;
        if (stop > at) write(text.slice(at, stop));
        if (!found) break;
        const char = text[stop];
        at = stop + 1;
        if (char === "\n") newline();
        else if (char === "\r") col = 0;
        else if (char === "\t") write(" ".repeat(TAB_STOP - (col % TAB_STOP)));
        else if (char === "\b") col = Math.max(0, col - 1);
        else if (char === "\x1b") {
          const next = text[at];
          if (next === undefined) {
            pending = "\x1b";
            break;
          }
          if (next === "[") {
            let close = at + 1;
            while (close < text.length) {
              const code = text.charCodeAt(close);
              if (code >= 0x40 && code <= 0x7e) break;
              close += 1;
            }
            if (close >= text.length) {
              pending = text.slice(stop);
              break;
            }
            control(text[close], text.slice(at + 1, close));
            at = close + 1;
          } else if (next === "]") {
            const bell = text.indexOf("\x07", at);
            const ends = text.indexOf("\x1b\\", at);
            const close = bell < 0 ? ends : ends < 0 ? bell : Math.min(bell, ends);
            if (close < 0) {
              pending = text.slice(stop);
              break;
            }
            at = close + (close === ends ? 2 : 1);
          } else {
            at += "()*+-./#%".includes(next) ? 2 : 1;
          }
        }
      }
      if (pending.length > PENDING_CAP) pending = "";
    };

    const keyOf = (entry) => `${entry.t}\u0000${entry.m.length}\u0000${entry.m.slice(0, 96)}`;

    const take = (entries) => {
      for (const entry of entries) {
        if (!entry || typeof entry.m !== "string") continue;
        const key = keyOf(entry);
        if (seen.has(key)) continue;
        seen.add(key);
        if (seen.size > SEEN_CAP) seen.delete(seen.values().next().value);
        stamp = String(entry.t || "");
        feed(entry.m);
      }
    };

    const divide = () => {
      row = lines.length - 1;
      col = 0;
      if (lines[row].len) addLine();
      const rule = lines[lines.length - 1];
      rule.rule = true;
      touch(rule);
      addLine();
      row = lines.length - 1;
      floor = row;
      pen = plainPen();
      penId = 0;
      pending = "";
    };

    const sync = async (again) => {
      const token = ++syncing;
      ready = false;
      const answer = await api.logs.read();
      if (token !== syncing || !win.isOpen()) return;
      if (answer.ok) {
        failed = false;
        const entries = answer.entries;
        const known = seen.size > 0;
        if (again && known && entries.length
            && !entries.some((entry) => typeof entry?.m === "string" && seen.has(keyOf(entry)))) {
          divide();
        }
        take(entries);
      } else if (!again) {
        failed = true;
      }
      const held = early;
      early = [];
      take(held);
      ready = true;
      wake();
    };

    const timeOf = (line) => (line.at.length >= 19 && line.at[10] === "T"
      ? line.at.slice(11, 19) : "");

    const textOf = (line) => {
      if (line.text === null) {
        line.text = line.runs.length === 1 ? line.runs[0].text
          : line.runs.map((run) => run.text).join("");
      }
      return line.text;
    };

    const lowOf = (line) => {
      if (line.low === null) line.low = textOf(line).toLowerCase();
      return line.low;
    };

    const matches = (line) => !line.rule && line.len > 0 && lowOf(line).includes(needle);

    const marksOf = (line) => {
      const marks = [];
      const hay = lowOf(line);
      let at = hay.indexOf(needle);
      while (at >= 0 && marks.length < MARK_CAP) {
        marks.push([at, at + needle.length]);
        at = hay.indexOf(needle, at + needle.length);
      }
      return marks;
    };

    const piece = (text, look, marked) => {
      const style = looks[look] || looks[0];
      if (!marked && !style.classes && !style.rules) return document.createTextNode(text);
      const node = document.createElement(marked ? "mark" : "span");
      node.textContent = text;
      const classes = marked ? `con-hit${style.classes ? ` ${style.classes}` : ""}` : style.classes;
      if (classes) node.className = classes;
      if (style.rules) node.style.cssText = style.rules;
      return node;
    };

    const paint = (node, line, marks) => {
      if (line.rule) {
        node.className = "con-line con-rule";
        node.replaceChildren();
        return;
      }
      if (node.className !== "con-line") node.className = "con-line";
      const parts = [];
      const time = timeOf(line);
      if (time) parts.push(api.el("span", "con-at", time));
      let pos = 0;
      let mark = 0;
      for (const run of line.runs) {
        const stop = pos + run.text.length;
        let at = pos;
        while (at < stop) {
          let until = stop;
          let marked = false;
          if (marks) {
            while (mark < marks.length && marks[mark][1] <= at) mark += 1;
            if (mark < marks.length) {
              if (marks[mark][0] <= at) {
                marked = true;
                until = Math.min(stop, marks[mark][1]);
              } else {
                until = Math.min(stop, marks[mark][0]);
              }
            }
          }
          parts.push(piece(run.text.slice(at - pos, until - pos), run.look, marked));
          at = until;
        }
        pos = stop;
      }
      node.replaceChildren(...parts);
    };

    const nextHit = (line) => {
      if (line === lines[lines.length - 1]) return null;
      for (let at = lines.indexOf(line) + 1; at > 0 && at < lines.length; at += 1) {
        if (lines[at].hit) return lines[at].hit;
      }
      return null;
    };

    const heldCount = () => {
      const last = lines[lines.length - 1];
      return lines.length - (last && !last.len && !last.rule ? 1 : 0);
    };

    const tell = () => {
      const total = heldCount();
      const said = needle ? `${matched.toLocaleString()} of ${lineCount(total)}` : lineCount(total);
      if (status.textContent !== said) status.textContent = said;
      const empty = needle ? matched === 0 : failed && total === 0;
      const note = needle ? "Nothing matches that." : "The console could not be read.";
      if (none.textContent !== note) none.textContent = note;
      none.hidden = !empty;
    };

    const toEnd = () => {
      out.scrollTop = out.scrollHeight;
    };

    const trim = () => {
      while (lines.length > KEEP + BLOCK && sheet.blocks.length > 1) {
        const block = sheet.blocks[0];
        const count = block.count;
        if (count <= 0 || row < count) break;
        const height = !follow && !needle ? block.el.offsetHeight : 0;
        sheet.shift();
        for (const line of lines.splice(0, count)) {
          line.node = null;
          if (!line.hit) continue;
          hits.drop(line.hit);
          line.hit = null;
          matched -= 1;
        }
        row -= count;
        floor = Math.max(0, floor - count);
        if (height) out.scrollTop -= height;
      }
    };

    function draw() {
      frame = 0;
      if (!win.isOpen()) return;
      for (const line of dirty) {
        if (!line.node) {
          line.node = api.el("div", "con-line");
          sheet.add(line.node);
        }
        paint(line.node, line, null);
        if (!needle) continue;
        const hit = matches(line);
        if (hit && !line.hit) {
          line.hit = api.el("div", "con-line");
          hits.add(line.hit, nextHit(line));
          matched += 1;
        } else if (!hit && line.hit) {
          hits.drop(line.hit);
          line.hit = null;
          matched -= 1;
        }
        if (line.hit) paint(line.hit, line, marksOf(line));
      }
      dirty.clear();
      trim();
      tell();
      if (follow) toEnd();
    }

    const search = () => {
      findTimer = 0;
      const next = find.value.trim() ? find.value.toLowerCase() : "";
      if (next === needle) return;
      needle = next;
      hits.clear();
      matched = 0;
      for (const line of lines) {
        line.hit = null;
        if (!needle || !matches(line)) continue;
        line.hit = api.el("div", "con-line");
        paint(line.hit, line, marksOf(line));
        hits.add(line.hit);
        matched += 1;
      }
      sheetHost.hidden = !!needle;
      hitsHost.hidden = !needle;
      follow = true;
      end.hidden = true;
      tell();
      toEnd();
    };

    const clear = () => {
      lines.length = 0;
      dirty.clear();
      sheet.clear();
      hits.clear();
      matched = 0;
      row = 0;
      col = 0;
      floor = 0;
      addLine();
      follow = true;
      end.hidden = true;
    };

    const plainOf = (line) => {
      if (line.rule) return "";
      const time = prefs.times ? timeOf(line) : "";
      return time ? `${time}  ${textOf(line)}` : textOf(line);
    };

    const heldLines = (onlyHits) => {
      const held = onlyHits ? lines.filter((line) => line.hit) : lines.slice();
      while (held.length && !held[held.length - 1].len && !held[held.length - 1].rule) held.pop();
      return held;
    };

    const applyPrefs = () => {
      wrap.classList.toggle("con-wrap", prefs.wrap);
      wrap.classList.toggle("con-times", prefs.times);
      for (const [button, on] of [[wrapButton, prefs.wrap], [timesButton, prefs.times]]) {
        button.setAttribute("aria-pressed", on ? "true" : "false");
        button.classList.toggle("con-on", on);
      }
      if (follow) requestAnimationFrame(toEnd);
    };

    out.addEventListener("scroll", () => {
      follow = out.scrollHeight - out.scrollTop - out.clientHeight <= NEAR_END;
      end.hidden = follow;
    }, { passive: true });

    const resize = new ResizeObserver(() => {
      if (follow) toEnd();
    });
    resize.observe(out);
    resize.observe(sheetHost);
    resize.observe(hitsHost);

    end.onclick = () => {
      follow = true;
      end.hidden = true;
      toEnd();
      out.focus({ preventScroll: true });
    };

    find.addEventListener("input", () => {
      clearTimeout(findTimer);
      findTimer = setTimeout(search, FIND_WAIT);
    });

    find.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || !find.value) return;
      event.preventDefault();
      event.stopPropagation();
      find.value = "";
      clearTimeout(findTimer);
      search();
    });

    wrapButton.onclick = () => {
      prefs.wrap = !prefs.wrap;
      applyPrefs();
      void api.storage.set("wrap", prefs.wrap);
    };

    timesButton.onclick = () => {
      prefs.times = !prefs.times;
      applyPrefs();
      void api.storage.set("times", prefs.times);
    };

    copyButton.onclick = async () => {
      const picked = window.getSelection();
      let text = "";
      let count = 0;
      if (picked && !picked.isCollapsed && out.contains(picked.anchorNode)) {
        text = picked.toString();
      } else {
        const held = heldLines(!!needle);
        text = held.map(plainOf).join("\n");
        count = held.length;
      }
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        api.toast(count ? `Copied ${lineCount(count)}` : "Copied");
      } catch {
        api.toast("Not copied", { kind: "warn" });
      }
    };

    saveButton.onclick = () => {
      const held = heldLines(false);
      const blob = new Blob([`${held.map(plainOf).join("\n")}\n`],
                            { type: "text/plain;charset=utf-8" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `comfyui-console-${fileStamp()}.log`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 4000);
    };

    clearButton.onclick = clear;

    win.onKey((event) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== "f") return;
      event.preventDefault();
      find.focus();
      find.select();
    });

    const unwatch = api.logs.watch((entries) => {
      if (entries === null) {
        void sync(true);
        return;
      }
      if (!ready) early.push(...entries);
      else take(entries);
    });

    win.onClose(() => {
      unwatch();
      resize.disconnect();
      clearTimeout(findTimer);
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      syncing += 1;
    });

    api.style(`
      .con { --con-back: #15171a; --con-ink: #d0d7de; display: flex; flex-direction: column;
        flex: 1; min-height: 0; }
      .con-toggle { --con-accent: var(--p-button-text-primary-color, #388bfd); }
      .om-float-tools .om-btn.con-on { color: var(--con-accent); border-color: var(--con-accent);
        background: color-mix(in srgb, var(--con-accent) 14%, var(--om-input)); }
      .con-find { width: 220px; min-width: 120px; flex: 0 1 220px; padding: 4px 9px;
        font-size: 12px; }
      .con-view { position: relative; flex: 1; min-height: 0; background: var(--con-back); }
      .con-out { position: absolute; inset: 0; overflow: auto; padding: 6px 0 12px;
        color: var(--con-ink); outline: none;
        font: 12px/${LINE_PX}px ui-monospace, "Cascadia Mono", "Cascadia Code", Consolas,
          "SF Mono", Menlo, monospace;
        scrollbar-width: thin;
        scrollbar-color: color-mix(in srgb, var(--con-ink) 28%, transparent) transparent; }
      .con-sheet { min-width: max-content; }
      .con-wrap .con-sheet { min-width: 0; }
      .con-sheet[hidden] { display: none; }
      .con-block { content-visibility: auto;
        contain-intrinsic-block-size: auto ${BLOCK * LINE_PX}px; }
      .con-line { min-height: ${LINE_PX}px; padding: 0 12px; white-space: pre; }
      .con-wrap .con-line { white-space: pre-wrap; overflow-wrap: anywhere; }
      .con-at { display: none; margin-right: 1.5ch; color: #6e7681; user-select: none; }
      .con-times .con-at { display: inline; }
      .con-rule { min-height: 0; height: 0; margin: 8px 12px;
        border-top: 1px dashed color-mix(in srgb, var(--con-ink) 25%, transparent); }
      .con-hit { color: inherit; background: rgba(210, 153, 34, .4); border-radius: 2px; }
      .con-bold { font-weight: 700; }
      .con-dim { opacity: .62; }
      .con-it { font-style: italic; }
      .con-ul { text-decoration: underline; }
      .con-st { text-decoration: line-through; }
      .con-ulst { text-decoration: underline line-through; }
      ${PALETTE.map((colour, at) => `.con-f${at} { color: ${colour}; }
      .con-b${at} { background: ${colour}; }`).join("\n      ")}
      .con-end { position: absolute; right: 18px; bottom: 14px; width: 30px; height: 30px;
        padding: 0; border-radius: 50%; border: 1px solid var(--om-border);
        background: var(--om-surface); color: var(--om-text); font-size: 15px; line-height: 1;
        cursor: pointer; box-shadow: 0 2px 8px rgba(0, 0, 0, .4); }
      .con-end:hover { background: var(--om-hover); }
      .con-end[hidden] { display: none; }
      .con-none { padding: 26px; text-align: center; font: 12px system-ui, sans-serif;
        opacity: .6; }
      .con-none[hidden] { display: none; }
      .con-status { flex: none; padding: 5px 10px; font-size: 11px; opacity: .65;
        border-top: 1px solid var(--om-border); font-variant-numeric: tabular-nums; }
    `);

    addLine();
    applyPrefs();
    tell();
    void sync(false);
    void (async () => {
      const [wrapped, timed] = await Promise.all([api.storage.get("wrap", true),
                                                  api.storage.get("times", false)]);
      if (!win.isOpen()) return;
      prefs.wrap = wrapped !== false;
      prefs.times = timed === true;
      applyPrefs();
    })();
    return win;
  },
};
