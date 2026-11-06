import { bookName, chapterKicker } from "./books";
import { resolveMarker, type ResolvedMarker } from "./markers";
import { elementText, parseUsx, usxElement, type ElementNode, type Node, type ParseDiagnostic } from "./parse";

export interface RenderResult {
  html: string;
  title: string;
  bookCode: string;
  error?: ParseDiagnostic;
}

interface Note {
  id: string;
  label: string;
  body: string;
  auto: boolean;
  kind: string;
}

interface Flow {
  blocks: string[];
  table: string[] | null;
  sidebar: string[] | null;
}

interface Chapter {
  number: string;
  displayNumber: string;
  alt: string;
  sid: string;
  kicker?: string;
  descriptions: string[];
  notes: Note[];
  headerOpen: boolean;
  flow: Flow;
}

interface RenderContext {
  notes: Note[];
  endnotes: Note[];
  nextId: () => string;
}

const LEVELED = new Set(["poetry", "indent", "hang", "list", "division"]);

export function callerLabel(index: number): string {
  let n = index;
  let label = "";
  while (n > 0) {
    n--;
    label = String.fromCharCode(97 + (n % 26)) + label;
    n = Math.floor(n / 26);
  }
  return label;
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function domId(prefix: string, ref: string): string {
  const safe = ref.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return `${prefix}-${safe || "ref"}`;
}

function emptyFlow(): Flow {
  return { blocks: [], table: null, sidebar: null };
}

function destination(flow: Flow): string[] {
  return flow.sidebar ?? flow.blocks;
}

function flushTable(flow: Flow): void {
  if (!flow.table) return;
  destination(flow).push(`<table class="table">${flow.table.join("")}</table>`);
  flow.table = null;
}

function closeSidebar(flow: Flow): void {
  if (!flow.sidebar) return;
  flushTable(flow);
  const html = `<aside class="sidebar">${flow.sidebar.join("")}</aside>`;
  flow.sidebar = null;
  flow.blocks.push(html);
}

function finish(flow: Flow): void {
  closeSidebar(flow);
  flushTable(flow);
}

function pushBlock(flow: Flow, html: string): void {
  flushTable(flow);
  destination(flow).push(html);
}

function pushRow(flow: Flow, html: string): void {
  flow.table ??= [];
  flow.table.push(html);
}

export function renderUsx(source: string): RenderResult {
  const parsed = parseUsx(source);
  const usx = usxElement(parsed.root);
  if (!usx) {
    return {
      html: "",
      title: "Scripture",
      bookCode: "",
      error: parsed.error ?? {
        message: "This file has no usx element.",
        offset: 0,
        line: 1,
        column: 1,
      },
    };
  }

  let bookCode = "";
  let title = "";
  let bookKicker = "";
  const subtitles: string[] = [];
  const chapters: Chapter[] = [];
  const frontFlow = emptyFlow();
  const frontNotes: Note[] = [];
  const endnotes: Note[] = [];
  let current: Chapter | undefined;
  let noteSerial = 0;
  const ctx: RenderContext = {
    notes: frontNotes,
    endnotes,
    nextId: () => {
      noteSerial += 1;
      return `n${noteSerial}`;
    },
  };

  const flow = (): Flow => (current ? current.flow : frontFlow);

  for (const child of usx.children) {
    if (child.kind !== "element") continue;
    if (child.name === "book") {
      bookCode = child.attrs.code || bookCode;
      continue;
    }
    if (child.name === "chapter") {
      if (!child.attrs.number) continue;
      if (current) finish(current.flow);
      finish(frontFlow);
      current = {
        number: child.attrs.number,
        displayNumber: child.attrs.pubnumber || child.attrs.number,
        alt: child.attrs.altnumber || "",
        sid: child.attrs.sid || "",
        descriptions: [],
        notes: [],
        headerOpen: true,
        flow: emptyFlow(),
      };
      ctx.notes = current.notes;
      for (const grand of child.children) {
        if (grand.kind !== "element" || grand.name !== "char") continue;
        const base = resolveMarker(grand.attrs.style)?.info.style;
        if (base === "ca") current.alt = elementText(grand).trim();
        if (base === "cp") current.displayNumber = elementText(grand).trim() || current.displayNumber;
      }
      chapters.push(current);
      continue;
    }
    if (child.name === "table") {
      if (current) current.headerOpen = false;
      pushBlock(flow(), renderTableElement(child, ctx));
      continue;
    }
    if (child.name === "sidebar") {
      if (current) current.headerOpen = false;
      pushBlock(flow(), renderSidebarElement(child, ctx));
      continue;
    }
    if (child.name === "figure") {
      if (current) current.headerOpen = false;
      pushBlock(flow(), renderFigure(child, ctx));
      continue;
    }
    if (child.name !== "para") {
      if (current) current.headerOpen = false;
      const html = renderChild(child, ctx);
      if (html) pushBlock(flow(), html);
      continue;
    }

    const style = child.attrs.style || "p";
    const resolved = resolveMarker(style);
    const layout = resolved?.info.layout;

    if (layout === "hidden" || layout === "intro-end") continue;

    if (layout === "chapter-label") {
      const text = elementText(child).trim();
      if (!current) {
        if (text) bookKicker = text;
        continue;
      }
      if (current.headerOpen) {
        if (text) current.kicker = text;
        continue;
      }
    }
    if (current?.headerOpen && layout === "published-chapter") {
      const text = elementText(child).trim();
      if (text) current.displayNumber = text;
      continue;
    }
    if (current?.headerOpen && layout === "chapter-description") {
      current.descriptions.push(renderPara(child, ctx));
      continue;
    }

    if (resolved?.info.style === "mt" && resolved.level === 1) {
      title = elementText(child);
      continue;
    }
    if (!current && (resolved?.info.style === "mt" || resolved?.info.style === "mte")) {
      subtitles.push(renderPara(child, ctx));
      continue;
    }

    if (current) current.headerOpen = false;
    renderBlock(child, flow(), ctx);
  }

  if (current) finish(current.flow);
  finish(frontFlow);

  if (!title) title = bookName(bookCode);
  const kickerName = chapterKicker(bookCode);
  const parts: string[] = [];
  parts.push(
    `<header class="masthead"><h1>${escapeHtml(title)}</h1>${subtitles.join("")}</header>`,
  );
  if (frontFlow.blocks.length > 0 || frontNotes.length > 0) {
    const notes = frontNotes.length > 0 ? renderNotes(frontNotes, "Notes") : "";
    parts.push(`<section class="front">${frontFlow.blocks.join("")}${notes}</section>`);
  }
  for (const chapter of chapters) {
    const kicker = chapter.kicker || bookKicker || kickerName;
    const label = `${kicker} ${chapter.number}`;
    const sidAttr = chapter.sid ? ` data-sid="${escapeHtml(chapter.sid)}"` : "";
    const alt = chapter.alt ? `<sup class="va">${escapeHtml(chapter.alt)}</sup>` : "";
    const notes = chapter.notes.length > 0 ? renderNotes(chapter.notes, "Footnotes") : "";
    parts.push(
      `<section class="chapter" aria-label="${escapeHtml(label)}"><header class="chapter-head"${sidAttr}><p class="chapter-kicker">${escapeHtml(kicker)}</p><h2>${escapeHtml(chapter.displayNumber)}${alt}</h2></header>${chapter.descriptions.join("")}${chapter.flow.blocks.join("")}${notes}</section>`,
    );
  }
  if (endnotes.length > 0) parts.push(renderNotes(endnotes, "Endnotes"));

  return { html: parts.join(""), title, bookCode, error: parsed.error };
}

function renderNotes(notes: Note[], label: string): string {
  const items = notes
    .map((note) => {
      const kind = note.kind === "x" || note.kind === "ex" ? ` class="xref"` : "";
      const mark = note.label
        ? `<a class="note-back" href="#caller-${note.id}">${escapeHtml(note.label)}</a>`
        : `<span class="note-back">·</span>`;
      return `<li id="note-${note.id}"${kind}>${mark}<span class="note-body">${note.body}</span></li>`;
    })
    .join("");
  return `<aside class="notes" aria-label="${label}"><ol>${items}</ol></aside>`;
}

function renderBlock(element: ElementNode, flow: Flow, ctx: RenderContext): void {
  const style = element.attrs.style || "p";
  const resolved = resolveMarker(style);
  const layout = resolved?.info.layout;

  if (layout === "sidebar-start") {
    flushTable(flow);
    if (flow.sidebar) closeSidebar(flow);
    flow.sidebar = [];
    if (element.attrs.category) flow.sidebar.push(`<p class="cat">${escapeHtml(element.attrs.category)}</p>`);
    const inner = renderInline(element.children, ctx);
    if (inner.trim()) flow.sidebar.push(`<p class="block esb" data-style="esb">${inner}</p>`);
    return;
  }
  if (layout === "sidebar-end") {
    closeSidebar(flow);
    return;
  }
  if (layout === "table-row") {
    pushRow(flow, renderRow(element, ctx));
    return;
  }
  if (layout === "blank") {
    pushBlock(flow, `<div class="blank" data-style="${escapeHtml(style)}"></div>`);
    return;
  }
  if (layout === "page-break") {
    pushBlock(flow, `<hr class="pb">`);
    return;
  }
  const html = renderPara(element, ctx);
  if (html) pushBlock(flow, html);
}

function headingTag(resolved: ResolvedMarker | undefined): string {
  if (!resolved) return "p";
  const { info, level } = resolved;
  if (info.layout !== "heading" && info.layout !== "title") return "p";
  if (info.style === "ms" || info.style === "s") {
    if (level <= 1) return "h3";
    if (level === 2) return "h4";
    return "h5";
  }
  if (level <= 1) return "h3";
  if (level === 2) return "h4";
  return "h5";
}

function verseSid(element: ElementNode): string | undefined {
  for (const child of element.children) {
    if (child.kind !== "element") continue;
    if (child.name === "verse" && child.attrs.number && child.attrs.sid) return child.attrs.sid;
    const nested = verseSid(child);
    if (nested) return nested;
  }
  return undefined;
}

function renderPara(element: ElementNode, ctx: RenderContext): string {
  const style = element.attrs.style || "p";
  const resolved = resolveMarker(style);
  const layout = resolved?.info.layout ?? "paragraph";
  const level = resolved?.level ?? 1;
  const inner = renderInline(element.children, ctx);
  const ref = verseSid(element) || element.attrs.vid || "";
  const vid = element.attrs.vid ? ` data-vid="${escapeHtml(element.attrs.vid)}"` : "";
  const sid = ref ? ` data-sid="${escapeHtml(ref)}"` : "";
  if (layout === "periph") {
    const id = element.attrs.id ? ` data-periph="${escapeHtml(element.attrs.id)}"` : "";
    return `<h3 class="block periph" data-style="periph"${sid}${id}>${inner}</h3>`;
  }
  const tag = headingTag(resolved);
  const levelAttr = resolved && LEVELED.has(layout) ? ` data-level="${level}" style="--level:${level}"` : "";
  return `<${tag} class="block ${escapeHtml(style)}" data-style="${escapeHtml(style)}"${sid}${vid}${levelAttr}>${inner}</${tag}>`;
}

function renderInline(nodes: Node[], ctx: RenderContext): string {
  let html = "";
  for (const node of nodes) {
    if (node.kind === "text") html += escapeHtml(node.text);
    else html += renderChild(node, ctx);
  }
  return html;
}

function renderChild(element: ElementNode, ctx: RenderContext): string {
  if (element.name === "verse") return renderVerse(element, ctx);
  if (element.name === "note") return renderNote(element, ctx);
  if (element.name === "char") return renderChar(element, ctx);
  if (element.name === "figure") return renderFigure(element, ctx);
  if (element.name === "ms") return renderMilestone(element);
  if (element.name === "optbreak") return "<wbr>";
  if (element.name === "ref") {
    const loc = element.attrs.loc || "";
    const inner = renderInline(element.children, ctx);
    const data = loc ? ` data-href="${escapeHtml(loc)}"` : "";
    return `<span class="link"${data}>${inner || escapeHtml(loc)}</span>`;
  }
  if (element.name === "para") return renderPara(element, ctx);
  if (element.name === "table") return renderTableElement(element, ctx);
  if (element.name === "row") return renderRow(element, ctx);
  if (element.name === "cell") return renderTableCell(element, resolveMarker(element.attrs.style), ctx);
  return renderInline(element.children, ctx);
}

function renderVerse(element: ElementNode, ctx: RenderContext): string {
  if (!element.attrs.number) return "";
  const shown = element.attrs.pubnumber || element.attrs.number;
  const sid = element.attrs.sid || "";
  const id = sid ? ` id="${domId("v", sid)}"` : "";
  const data = sid ? ` data-sid="${escapeHtml(sid)}"` : "";
  const alt = element.attrs.altnumber ? `<sup class="va">${escapeHtml(element.attrs.altnumber)}</sup>` : "";
  return `<sup class="verse"${id}${data}>${escapeHtml(shown)}</sup>${alt}${renderInline(element.children, ctx)}`;
}

function renderNote(element: ElementNode, ctx: RenderContext): string {
  const style = element.attrs.style || "f";
  const bucket = style === "fe" ? ctx.endnotes : ctx.notes;
  const caller = element.attrs.caller ?? "+";
  const visible = caller !== "-";
  const auto = visible && (caller === "+" || caller === "");
  const autoCount = bucket.reduce((count, note) => count + (note.auto ? 1 : 0), 0);
  const label = auto ? callerLabel(autoCount + 1) : caller;
  const id = ctx.nextId();
  let body = "";
  if (element.attrs.category) body += `<span class="cat">${escapeHtml(element.attrs.category)}</span> `;
  body += renderInline(element.children, ctx);
  bucket.push({ id, label: visible ? label : "", body, auto, kind: style });
  if (!visible) return "";
  return `<sup class="caller" id="caller-${id}"><a href="#note-${id}">${escapeHtml(label)}</a></sup>`;
}

function renderChar(element: ElementNode, ctx: RenderContext): string {
  const style = element.attrs.style || "";
  const resolved = resolveMarker(style);
  const base = resolved?.info.style || style;
  if (base === "fig") return renderFigure(element, ctx);
  const inner = renderInline(element.children, ctx);
  if (base === "add" || base === "addpn") return `<em class="add">${inner}</em>`;
  if (base === "dc" || base === "fdc") return `<em class="dc">${inner}</em>`;
  if (base === "wj") return `<span class="wj">${inner}</span>`;
  if (base === "fq" || base === "fqa" || base === "xq") return `<em class="fq">${inner}</em>`;
  if (base === "fr") return `<span class="fr">${inner}</span>`;
  if (base === "va" || base === "ca") return `<sup class="va">${inner}</sup>`;
  if (base === "vp" || base === "fv") return `<sup class="vp">${inner}</sup>`;
  if (base === "ft") return inner;
  if (base === "rb" || (base === "pro" && element.attrs.gloss)) return renderRuby(inner, element.attrs.gloss);
  if (element.attrs["link-href"] || base === "jmp") return renderLink(inner, element);
  if (base === "w" || base === "wg" || base === "wh" || base === "wa") return `<span class="w"${wordAttributes(element)}>${inner}</span>`;
  if (base === "bd") return `<strong class="bd">${inner}</strong>`;
  if (base === "bdit") return `<strong class="bdit"><em>${inner}</em></strong>`;
  if (!style) return inner;
  return `<span class="char ${escapeHtml(base)}">${inner}</span>`;
}

function wordAttributes(element: ElementNode): string {
  const title = [element.attrs.lemma, element.attrs.strong, element.attrs.srcloc].filter(Boolean);
  let extra = "";
  if (title.length > 0) extra += ` title="${escapeHtml(title.join(" · "))}"`;
  if (element.attrs.strong) extra += ` data-strong="${escapeHtml(element.attrs.strong)}"`;
  if (element.attrs.srcloc) extra += ` data-srcloc="${escapeHtml(element.attrs.srcloc)}"`;
  for (const [name, value] of Object.entries(element.attrs)) {
    if (name.startsWith("x-")) extra += ` data-${escapeHtml(name)}="${escapeHtml(value)}"`;
  }
  return extra;
}

function renderRuby(inner: string, gloss: string | undefined): string {
  if (!gloss) return `<span class="rb">${inner}</span>`;
  const reading = gloss
    .split(":")
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" · ");
  return `<ruby class="rb">${inner}<rp>(</rp><rt>${escapeHtml(reading)}</rt><rp>)</rp></ruby>`;
}

function renderLink(inner: string, element: ElementNode): string {
  const href = element.attrs["link-href"] || "";
  const title = element.attrs["link-title"] ? ` title="${escapeHtml(element.attrs["link-title"])}"` : "";
  const anchor = element.attrs["link-id"] ? ` id="${domId("link", element.attrs["link-id"])}"` : "";
  if (/^https?:\/\//i.test(href)) {
    return `<a class="link" href="${escapeHtml(href)}"${title}${anchor} target="_blank" rel="noopener noreferrer">${inner}</a>`;
  }
  const data = href ? ` data-href="${escapeHtml(href)}"` : "";
  return `<span class="link"${data}${title}${anchor}>${inner}</span>`;
}

function renderFigure(element: ElementNode, ctx: RenderContext): string {
  const alt = element.attrs.alt || "";
  const src = element.attrs.src || "";
  const size = element.attrs.size === "span" ? "fig-span" : "fig-col";
  const loc = element.attrs.loc ? ` data-loc="${escapeHtml(element.attrs.loc)}"` : "";
  const caption = renderInline(element.children, ctx);
  const img = src ? `<img alt="${escapeHtml(alt)}" src="${escapeHtml(safeSrc(src))}">` : "";
  const ref = element.attrs.ref ? `<span class="fig-ref">${escapeHtml(element.attrs.ref)}</span>` : "";
  const copy = element.attrs.copy ? `<span class="fig-copy">${escapeHtml(element.attrs.copy)}</span>` : "";
  const place = element.attrs.loc ? `<span class="fig-loc">${escapeHtml(element.attrs.loc)}</span>` : "";
  const described = alt && alt !== caption ? `<span class="fig-alt">${escapeHtml(alt)}</span>` : "";
  return `<span class="fig ${size}"${loc}>${img}<span class="figcaption">${caption}${described}${ref}${copy}${place}</span></span>`;
}

function safeSrc(src: string): string {
  const trimmed = src.trim();
  if (/^(https?:|data:image\/)/i.test(trimmed)) return trimmed;
  if (/^[A-Za-z0-9_./~-]+$/.test(trimmed)) return trimmed;
  return "";
}

function renderMilestone(element: ElementNode): string {
  const resolved = resolveMarker(element.attrs.style || "");
  if (element.attrs.who && resolved?.edge !== "end") return `<span class="who">${escapeHtml(element.attrs.who)}</span>`;
  if (resolved?.info.style === "ts-s" || resolved?.info.style === "ts-e") {
    return `<span class="ms" data-style="${escapeHtml(element.attrs.style || "")}"></span>`;
  }
  return "";
}

function renderRow(element: ElementNode, ctx: RenderContext): string {
  const cells: string[] = [];
  let loose = "";
  const flushLoose = () => {
    if (loose.trim()) cells.push(`<td>${loose}</td>`);
    loose = "";
  };
  for (const node of element.children) {
    if (node.kind === "text") {
      loose += escapeHtml(node.text);
      continue;
    }
    const resolved = resolveMarker(node.attrs.style || "");
    if (node.name === "cell" || resolved?.info.layout === "table-cell") {
      flushLoose();
      cells.push(renderTableCell(node, resolved, ctx));
      continue;
    }
    loose += renderChild(node, ctx);
  }
  flushLoose();
  return `<tr>${cells.join("")}</tr>`;
}

function renderTableCell(element: ElementNode, resolved: ResolvedMarker | undefined, ctx: RenderContext): string {
  const base = resolved?.info.style || "tc";
  const tag = base === "th" || base === "thr" ? "th" : "td";
  const right = base === "thr" || base === "tcr" || element.attrs.align === "end";
  const center = element.attrs.align === "center";
  const align = right ? " right" : center ? " center" : "";
  const columns = resolved?.columns;
  const span = columns && columns.end > columns.start ? ` colspan="${columns.end - columns.start + 1}"` : "";
  return `<${tag} class="cell ${escapeHtml(base)}${align}"${span}>${renderInline(element.children, ctx)}</${tag}>`;
}

function renderTableElement(element: ElementNode, ctx: RenderContext): string {
  const rows: string[] = [];
  for (const child of element.children) {
    if (child.kind !== "element") continue;
    if (child.name === "row" || resolveMarker(child.attrs.style)?.info.layout === "table-row") rows.push(renderRow(child, ctx));
  }
  return `<table class="table">${rows.join("")}</table>`;
}

function renderSidebarElement(element: ElementNode, ctx: RenderContext): string {
  const flow = emptyFlow();
  flow.sidebar = [];
  if (element.attrs.category) flow.sidebar.push(`<p class="cat">${escapeHtml(element.attrs.category)}</p>`);
  for (const child of element.children) {
    if (child.kind !== "element") continue;
    if (child.name === "para") renderBlock(child, flow, ctx);
    else if (child.name === "table") pushBlock(flow, renderTableElement(child, ctx));
    else {
      const html = renderChild(child, ctx);
      if (html) pushBlock(flow, html);
    }
  }
  closeSidebar(flow);
  return flow.blocks.join("");
}
