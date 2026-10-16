const { Plugin, MarkdownRenderChild, Notice } = require("obsidian");

/* ---------- parsing ---------- */

function parseTime(s) {
  if (!s) return 0;
  s = s.trim();
  if (!s.includes(":") && s.endsWith("s")) return parseFloat(s);
  return s.split(":").map(parseFloat).reduce((a, v) => a * 60 + v, 0);
}

function parseTTML(text) {
  let doc = new DOMParser().parseFromString(text, "application/xml");
  // fall back to the lenient HTML parser if the pasted XML is incomplete
  if (doc.getElementsByTagName("parsererror").length) {
    doc = new DOMParser().parseFromString(text, "text/html");
  }
  const first = (names) => {
    for (const n of names) {
      const el = doc.getElementsByTagName(n)[0];
      if (el && el.textContent.trim()) return el.textContent.trim();
    }
    return "";
  };
  const title = first(["ttm:title", "title"]);
  const artist = first(["ttm:agent", "agent"]);

  const ps = Array.from(doc.getElementsByTagName("p"));
  const all = ps.map((p) => ({
    start: parseTime(p.getAttribute("begin")),
    end: parseTime(p.getAttribute("end")),
    text: (p.textContent || "").replace(/\s+/g, " ").trim(),
  }));
  const duration = all.length ? Math.max(...all.map((l) => l.end)) : 0;
  return { lines: all.filter((l) => l.text), duration, title, artist };
}

function parseLRC(text) {
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const m = raw.match(/^\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)$/);
    if (m) out.push({ start: +m[1] * 60 + parseFloat(m[2]), text: m[3].trim() });
  }
  const lines = out.map((l, i) => ({
    start: l.start,
    end: i < out.length - 1 ? out[i + 1].start : l.start + 5,
    text: l.text,
  }));
  const duration = lines.length ? lines[lines.length - 1].end : 0;
  const get = (k) => (text.match(new RegExp("^\\[" + k + ":(.*)\\]", "mi")) || [])[1] || "";
  return {
    lines: lines.filter((l) => l.text),
    duration,
    title: get("ti").trim(),
    artist: get("ar").trim(),
  };
}

function fmt(t) {
  t = Math.max(0, Math.floor(t));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

/* ---------- player ---------- */

class Lyrica extends MarkdownRenderChild {
  constructor(el, data) {
    super(el);
    this.data = data;
    this.pos = 0;
    this.playing = false;
    this.last = 0;
    this.active = -1;
    this.raf = null;
  }

  onload() {
    const root = this.containerEl;
    root.empty();
    root.addClass("lp-root");

    if (this.data.title || this.data.artist) {
      const head = root.createDiv({ cls: "lp-head" });
      if (this.data.title) head.createDiv({ cls: "lp-title", text: this.data.title });
      if (this.data.artist) head.createDiv({ cls: "lp-artist", text: this.data.artist });
    }

    this.view = root.createDiv({ cls: "lp-view" });
    this.view.createDiv({ cls: "lp-pad" });
    this.lineEls = this.data.lines.map((l) => {
      const row = this.view.createDiv({ cls: "lp-line" });
      row.createSpan({ cls: "lp-text", text: l.text });
      row.addEventListener("click", () => this.seek(l.start));
      return row;
    });
    this.view.createDiv({ cls: "lp-pad" });

    const bar = root.createDiv({ cls: "lp-controls" });
    this.btn = bar.createEl("button", { cls: "lp-btn", text: "▶ Play" });
    this.btn.addEventListener("click", () => this.toggle());

    this.slider = bar.createEl("input", { cls: "lp-slider", type: "range" });
    this.slider.min = "0";
    this.slider.max = String(this.data.duration || 1);
    this.slider.step = "0.01";
    this.slider.value = "0";
    this.slider.addEventListener("input", () => this.seek(parseFloat(this.slider.value)));

    this.time = bar.createSpan({ cls: "lp-time" });
    this.update(true);
  }

  onunload() {
    if (this.raf) cancelAnimationFrame(this.raf);
  }

  toggle() {
    if (this.playing) return this.pause();
    if (this.pos >= this.data.duration) this.pos = 0;
    this.playing = true;
    this.last = performance.now();
    this.btn.setText("❚❚ Pause");
    this.loop();
  }

  pause() {
    this.playing = false;
    this.btn.setText("▶ Play");
    if (this.raf) cancelAnimationFrame(this.raf);
  }

  seek(t) {
    this.pos = Math.min(Math.max(0, t), this.data.duration);
    this.last = performance.now();
    this.update(true);
  }

  loop() {
    this.raf = requestAnimationFrame((now) => {
      if (!this.playing) return;
      this.pos += (now - this.last) / 1000;
      this.last = now;
      if (this.pos >= this.data.duration) {
        this.pos = this.data.duration;
        this.update();
        return this.pause();
      }
      this.update();
      this.loop();
    });
  }

  update(force) {
    const lines = this.data.lines;
    let idx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].start <= this.pos) idx = i;
      else break;
    }
    const changed = idx !== this.active;
    this.active = idx;

    if (changed || force) {
      this.lineEls.forEach((el, i) => {
        const d = idx < 0 ? i + 1 : Math.abs(i - idx);
        el.dataset.d = String(Math.min(d, 4));
        el.toggleClass("lp-active", i === idx);
        el.toggleClass("lp-past", idx >= 0 && i < idx);
        if (i !== idx) el.style.removeProperty("--p");
      });
    }

    if (idx >= 0) {
      const l = lines[idx];
      const span = Math.max(0.1, l.end - l.start);
      const p = Math.min(1, Math.max(0, (this.pos - l.start) / span));
      this.lineEls[idx].style.setProperty("--p", (p * 100).toFixed(1));
    }

    if (changed || force) {
      if (idx >= 0) {
        const el = this.lineEls[idx];
        const top = el.offsetTop - this.view.clientHeight / 2 + el.clientHeight / 2;
        this.view.scrollTo({ top, behavior: "smooth" });
      } else {
        this.view.scrollTo({ top: 0, behavior: "smooth" });
      }
    }

    this.slider.value = String(this.pos);
    this.time.setText(`${fmt(this.pos)} / ${fmt(this.data.duration)}`);
  }
}

/* ---------- plugin ---------- */

const TEMPLATE = `<?xml version="1.0" encoding="utf-8"?>
<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata">
  <head>
    <metadata>
      <ttm:title>Song title</ttm:title>
      <ttm:agent type="person">Artist</ttm:agent>
    </metadata>
  </head>
  <body>
    <div>
      <p begin="00:00:00.000" end="00:00:04.000">First line</p>
    </div>
  </body>
</tt>`;

module.exports = class LyricaPlugin extends Plugin {
  async insertBlock(editor) {
    if (!editor) {
      new Notice("Lyrica: open a note in edit mode first");
      return;
    }
    // use clipboard if it already holds TTML / LRC, otherwise a blank template
    let body = TEMPLATE;
    try {
      const clip = (await navigator.clipboard.readText()) || "";
      if (/<\s*tt[\s>]/i.test(clip) || /^\[\d+:\d+(\.\d+)?\]/m.test(clip)) {
        body = clip.trim();
      }
    } catch (e) {
      /* clipboard not available, use template */
    }
    const prefix = editor.getCursor().ch > 0 ? "\n" : "";
    editor.replaceSelection(`${prefix}\`\`\`lyrica\n${body}\n\`\`\`\n`);
  }

  onload() {
    this.addCommand({
      id: "insert-lyrica-block",
      name: "Insert lyrics block",
      editorCallback: (editor) => this.insertBlock(editor),
    });

    this.addRibbonIcon("music", "Insert Lyrica block", () => {
      this.insertBlock(this.app.workspace.activeEditor?.editor);
    });

    this.registerMarkdownCodeBlockProcessor("lyrica", async (source, el, ctx) => {
      let text = source;

      // optional: "file: something.ttml" instead of pasted lyrics
      const fm = source.trim().match(/^file\s*:\s*(.+)$/i);
      if (fm) {
        const name = fm[1].trim().replace(/^\[\[|\]\]$/g, "");
        const f =
          this.app.metadataCache.getFirstLinkpathDest(name, ctx.sourcePath) ||
          this.app.vault.getAbstractFileByPath(name);
        if (!f) {
          el.createDiv({ text: `Lyrica: file not found: ${name}` });
          return;
        }
        text = await this.app.vault.cachedRead(f);
      }

      let data;
      try {
        data = /<\s*(tt|p)[\s>]/i.test(text) ? parseTTML(text) : parseLRC(text);
      } catch (e) {
        console.error(e);
        el.createDiv({ text: "Lyrica: could not parse lyrics." });
        return;
      }
      if (!data.lines.length) {
        el.createDiv({ text: "Lyrica: no timed lyric lines found." });
        return;
      }
      ctx.addChild(new Lyrica(el, data));
    });
  }
};
