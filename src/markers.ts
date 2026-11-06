/**
 * USFM 3.0.1 marker inventory, as published in the local USFM docs, mapped
 * onto USX style values. Numbered markers (#), milestone pairs (-s/-e), and
 * table column spans (th1-2) resolve to the base marker.
 *
 * Page appearance for the styles used on a published page:
 * char:add = italic translator addition
 * char:wj = words of Jesus, ordinary text on the page and red in Features
 * note:f = footnotes
 * para:r = parallel-passage references
 * para:d = psalm superscriptions, in small caps
 */

export const TOKEN_TYPES = [
  "chapter",
  "verse",
  "heading",
  "poetry",
  "addition",
  "wordsOfJesus",
  "note",
  "reference",
  "title",
  "meta",
  "marker",
  "attribute",
] as const;

export type TokenType = (typeof TOKEN_TYPES)[number];

export type MarkerType = "Paragraph" | "Character" | "Note" | "Chapter" | "Verse" | "Book" | "Milestone";

export type Layout =
  | "hidden"
  | "title"
  | "heading"
  | "reference"
  | "paragraph"
  | "margin"
  | "right"
  | "center"
  | "indent"
  | "hang"
  | "embedded"
  | "poetry"
  | "poetry-right"
  | "poetry-center"
  | "selah"
  | "acrostic"
  | "hebrew"
  | "blank"
  | "nobreak"
  | "speaker"
  | "division"
  | "list"
  | "list-header"
  | "list-footer"
  | "chapter-label"
  | "published-chapter"
  | "chapter-description"
  | "intro-end"
  | "periph"
  | "page-break"
  | "sidebar-start"
  | "sidebar-end"
  | "table-row"
  | "table-cell"
  | "char"
  | "note"
  | "milestone"
  | "liturgical";

export interface MarkerInfo {
  style: string;
  markerType: MarkerType;
  token: TokenType;
  /** Color the scripture text inside the element, not only the style code. */
  content: boolean;
  /** Kept in the file, omitted from the reading page. */
  hidden: boolean;
  name: string;
  page: string;
  numbered: boolean;
  deprecated: boolean;
  layout: Layout;
}

export interface ResolvedMarker {
  info: MarkerInfo;
  /** Style value as written, such as q2 or qt1-s. */
  style: string;
  /** 1 when the marker is unnumbered. For q2 this is 2. */
  level: number;
  /** Table column span. th1-2 is columns 1 through 2. */
  columns?: { start: number; end: number };
  edge?: "start" | "end";
}

export interface AttributeSpec {
  name: string;
  description: string;
}

function define(
  style: string,
  markerType: MarkerType,
  token: TokenType,
  content: boolean,
  hidden: boolean,
  name: string,
  page: string,
  layout: Layout,
  numbered = false,
  deprecated = false,
): MarkerInfo {
  return { style, markerType, token, content, hidden, name, page, numbered, deprecated, layout };
}

const paragraph = (
  style: string,
  token: TokenType,
  name: string,
  page: string,
  layout: Layout,
  numbered = false,
  content = false,
  hidden = false,
  deprecated = false,
) => define(style, "Paragraph", token, content, hidden, name, page, layout, numbered, deprecated);

const character = (
  style: string,
  token: TokenType,
  name: string,
  page: string,
  numbered = false,
  deprecated = false,
) => define(style, "Character", token, true, false, name, page, "char", numbered, deprecated);

export const MARKERS: Record<string, MarkerInfo> = {
  id: define("id", "Book", "meta", true, true, "File identification", "Book code, name, language, and edition. Not shown on the page.", "hidden"),
  usfm: paragraph("usfm", "meta", "USFM version", "USFM version number for the file. Not shown on the page.", "hidden", false, true, true),
  ide: paragraph("ide", "meta", "Encoding", "Character encoding. Not shown on the page.", "hidden", false, true, true),
  sts: paragraph("sts", "meta", "Status", "Project text status code. Not shown on the page.", "hidden", false, true, true),
  rem: paragraph("rem", "meta", "Remark", "Editorial note. Not shown on the page.", "hidden", false, true, true),
  h: paragraph("h", "meta", "Running header", "Not shown in the page body. A numbered header is deprecated.", "hidden", true, true, true),
  toc: paragraph("toc", "meta", "Table of contents text", "Long text, short text, or book abbreviation. Not shown on the page.", "hidden", true, true, true),
  toca: paragraph("toca", "meta", "Alternate contents text", "Alternate-language contents text. Not shown on the page.", "hidden", true, true, true),
  periph: paragraph("periph", "title", "Peripheral division", "Shown as a division title. The id attribute selects the standard division.", "periph", false, true),

  p: paragraph("p", "marker", "Paragraph", "Shown as a body paragraph.", "paragraph"),
  m: paragraph("m", "marker", "Margin paragraph", "Flush-left continuation paragraph.", "margin"),
  po: paragraph("po", "marker", "Letter opening", "Shown as the opening of a letter.", "paragraph"),
  pr: paragraph("pr", "marker", "Right-aligned paragraph", "Shown aligned to the trailing edge. Also used for a refrain.", "right"),
  cls: paragraph("cls", "marker", "Closure of an epistle", "Shown as a closing paragraph.", "paragraph"),
  pmo: paragraph("pmo", "marker", "Embedded text opening", "Opening of an embedded text block.", "embedded"),
  pm: paragraph("pm", "marker", "Embedded text", "Paragraph inside an embedded text block.", "embedded"),
  pmc: paragraph("pmc", "marker", "Embedded text closing", "Close of an embedded text block.", "embedded"),
  pmr: paragraph("pmr", "marker", "Embedded text refrain", "Refrain of an embedded text, aligned to the trailing edge.", "right"),
  pi: paragraph("pi", "marker", "Indented paragraph", "Indented by the marker number. pi is level 1.", "indent", true),
  mi: paragraph("mi", "marker", "Indented margin paragraph", "Flush left, indented from the margin.", "indent"),
  nb: paragraph("nb", "marker", "No break", "Continues the previous paragraph with no break, including across a chapter.", "nobreak"),
  pc: paragraph("pc", "marker", "Centered paragraph", "Shown centered.", "center"),
  ph: paragraph("ph", "marker", "Hanging indent", "Hanging indent. The number is the level.", "hang", true),
  b: paragraph("b", "marker", "Blank line", "Shown as a blank line.", "blank"),
  lit: paragraph("lit", "marker", "Liturgical note", "Shown in italic at the trailing edge.", "liturgical", false, true),

  mt: paragraph("mt", "title", "Main title", "Level 1 is the book title. Further levels are shown under it.", "title", true, true),
  mte: paragraph("mte", "title", "Major title ending", "Shown centered at the end of the book.", "title", true, true),
  ms: paragraph("ms", "heading", "Major section heading", "Shown in bold italic as a major heading. ms is level 1.", "heading", true, true),
  mr: paragraph("mr", "reference", "Major section reference", "Shown in italic under the major heading.", "reference", false, true),
  s: paragraph("s", "heading", "Section heading", "Shown in bold italic as a section heading. s is level 1.", "heading", true, true),
  sr: paragraph("sr", "reference", "Section reference range", "Shown in italic under the section heading.", "reference", false, true),
  r: paragraph("r", "reference", "Parallel passage reference", "Shown in italic under the section heading.", "reference", false, true),
  d: paragraph("d", "title", "Descriptive title", "Psalm superscription. Shown in small caps.", "reference", false, true),
  sp: paragraph("sp", "heading", "Speaker", "Shown as a speaker label.", "speaker", false, true),
  sd: paragraph("sd", "heading", "Semantic division", "Vertical space that marks a division. sd is level 1.", "division", true, true),

  q: paragraph("q", "poetry", "Poetry line", "Indented by the marker number. q is level 1.", "poetry", true, true),
  qr: paragraph("qr", "poetry", "Right-aligned poetry", "Poetic line at the trailing edge.", "poetry-right", false, true),
  qc: paragraph("qc", "poetry", "Centered poetry", "Poetic line, centered.", "poetry-center", false, true),
  qs: define(
    "qs",
    "Character",
    "poetry",
    true,
    false,
    "Selah",
    "Selah. A paragraph with this style is set at the trailing edge, in italic.",
    "selah",
  ),
  qa: paragraph("qa", "poetry", "Acrostic heading", "Shown as a small acrostic label.", "acrostic", false, true),
  qac: character("qac", "poetry", "Acrostic letter", "Shown as the acrostic letter."),
  qm: paragraph("qm", "poetry", "Embedded poetry", "Poetic line inside embedded text. qm is level 1.", "poetry", true, true),
  qd: paragraph("qd", "poetry", "Hebrew note", "Shown in small caps after the verse it belongs to.", "hebrew", false, true),

  lh: paragraph("lh", "marker", "List header", "Introductory remark of a list.", "list-header", false, true),
  li: paragraph("li", "marker", "List entry", "List item. li is level 1.", "list", true),
  lf: paragraph("lf", "marker", "List footer", "Concluding remark of a list.", "list-footer", false, true),
  lim: paragraph("lim", "marker", "Embedded list entry", "List item inside embedded text. lim is level 1.", "list", true),
  litl: character("litl", "marker", "List total", "The total in an accounting list."),
  lik: character("lik", "marker", "List key", "The key of a key-value list entry."),
  liv: character("liv", "marker", "List value", "A value of a list entry. liv is level 1.", true),

  tr: paragraph("tr", "marker", "Table row", "A row of heading or body cells.", "table-row"),
  th: define("th", "Character", "marker", true, false, "Table heading", "Column heading. The number is the column. A dash spans columns.", "table-cell", true),
  thr: define("thr", "Character", "marker", true, false, "Right-aligned table heading", "Trailing-edge column heading. A dash spans columns.", "table-cell", true),
  tc: define("tc", "Character", "marker", true, false, "Table cell", "Body cell. The number is the column. A dash spans columns.", "table-cell", true),
  tcr: define("tcr", "Character", "marker", true, false, "Right-aligned table cell", "Trailing-edge body cell. A dash spans columns.", "table-cell", true),

  imt: paragraph("imt", "title", "Introduction major title", "Major introduction title. imt is level 1.", "heading", true, true),
  is: paragraph("is", "heading", "Introduction section heading", "Introduction section. is is level 1.", "heading", true, true),
  ip: paragraph("ip", "marker", "Introduction paragraph", "Introduction body paragraph.", "paragraph"),
  ipi: paragraph("ipi", "marker", "Indented introduction paragraph", "Indented introduction paragraph.", "indent"),
  im: paragraph("im", "marker", "Introduction margin paragraph", "Flush-left introduction paragraph.", "margin"),
  imi: paragraph("imi", "marker", "Indented introduction margin", "Indented flush-left introduction paragraph.", "indent"),
  ipq: paragraph("ipq", "poetry", "Introduction quote", "Quoted scripture in the introduction, in italic.", "reference", false, true),
  imq: paragraph("imq", "poetry", "Introduction margin quote", "Flush-left quoted scripture in the introduction.", "reference", false, true),
  ipr: paragraph("ipr", "marker", "Introduction right-aligned paragraph", "Introduction paragraph at the trailing edge.", "right"),
  iq: paragraph("iq", "poetry", "Introduction poetry", "Poetic line in the introduction. iq is level 1.", "poetry", true, true),
  ib: paragraph("ib", "marker", "Introduction blank line", "Shown as a blank line.", "blank"),
  ili: paragraph("ili", "marker", "Introduction list item", "Introduction list item. ili is level 1.", "list", true),
  iot: paragraph("iot", "title", "Introduction outline title", "Title of an introduction outline.", "heading", false, true),
  io: paragraph("io", "marker", "Introduction outline entry", "Outline entry. io is level 1.", "list", true),
  ior: character("ior", "reference", "Introduction outline reference", "Reference range at the end of an outline entry."),
  iqt: character("iqt", "poetry", "Introduction quoted text", "Quoted text in the introduction."),
  iex: paragraph("iex", "reference", "Introduction bridge", "Explanatory or bridge text, in italic.", "reference", false, true),
  imte: paragraph("imte", "title", "Introduction title ending", "Introduction title at the end of the introduction.", "title", true, true),
  ie: paragraph("ie", "meta", "Introduction end", "Marks the end of the introduction. Not shown on the page.", "intro-end", false, false, true),

  add: character("add", "addition", "Translator addition", "Set in italic."),
  bk: character("bk", "title", "Quoted book title", "Shown in italic."),
  dc: character("dc", "addition", "Deuterocanonical addition", "Shown in italic. Preferred where content is deuterocanonical only."),
  k: character("k", "marker", "Keyword", "Shown in semibold."),
  nd: character("nd", "title", "Name of God", "Shown in small caps."),
  ord: character("ord", "verse", "Ordinal ending", "Shown as a superscript ending, such as st or th."),
  pn: character("pn", "marker", "Proper name", "Proper name."),
  png: character("png", "marker", "Geographic proper name", "Geographic name, used in Chinese texts."),
  addpn: character("addpn", "addition", "Proper name in an addition", "Deprecated. Nest pn inside add instead.", false, true),
  qt: character("qt", "poetry", "Quoted text", "Quoted text in the scripture body, in italic."),
  sig: character("sig", "marker", "Signature", "Author signature, in italic."),
  sls: character("sls", "marker", "Secondary language", "Passage in a secondary language, in italic."),
  tl: character("tl", "marker", "Transliteration", "Transliterated word, in italic."),
  wj: character(
    "wj",
    "wordsOfJesus",
    "Words of Jesus",
    "Ordinary text on the page. Features marks it in red.",
  ),
  em: character("em", "marker", "Emphasis", "Shown in italic."),
  bd: character("bd", "marker", "Bold", "Shown in bold."),
  it: character("it", "marker", "Italic", "Shown in italic."),
  bdit: character("bdit", "marker", "Bold italic", "Shown in bold italic."),
  no: character("no", "marker", "Normal", "Resets the surrounding character style."),
  sc: character("sc", "marker", "Small caps", "Shown in small caps."),
  sup: character("sup", "verse", "Superscript", "Shown as a superscript."),
  fig: character("fig", "marker", "Figure", "Illustration. alt, src, size, loc, copy, and ref are its parameters. src, size, and ref are required."),
  ndx: character("ndx", "reference", "Subject index entry", "Subject index entry."),
  rb: character("rb", "marker", "Ruby gloss", "The base text with the gloss parameter as a ruby annotation."),
  pro: character("pro", "marker", "Pronunciation", "Deprecated. Use rb.", false, true),
  w: character("w", "reference", "Wordlist entry", "Glossary word. lemma is the default attribute. strong and srcloc are optional."),
  wg: character("wg", "reference", "Greek wordlist entry", "Greek wordlist entry."),
  wh: character("wh", "reference", "Hebrew wordlist entry", "Hebrew wordlist entry."),
  wa: character("wa", "reference", "Aramaic wordlist entry", "Aramaic wordlist entry."),
  jmp: character("jmp", "reference", "Link text", "Link. link-href is the target. link-title and link-id are optional."),

  f: define("f", "Note", "note", true, false, "Footnote", "Called out in the verse and collected at the end of the chapter.", "note"),
  fe: define("fe", "Note", "note", true, false, "Endnote", "Called out in the verse and collected at the end of the book.", "note"),
  ef: define("ef", "Note", "note", true, false, "Study footnote", "Extended footnote, collected with the chapter notes.", "note"),
  fr: character("fr", "note", "Footnote origin reference", "Shown with the footnote."),
  fq: character("fq", "note", "Footnote quotation", "Shown in italic inside the footnote."),
  fqa: character("fqa", "note", "Alternate translation", "Shown in italic inside the footnote."),
  fk: character("fk", "note", "Footnote keyword", "Shown in semibold inside the footnote."),
  fl: character("fl", "note", "Footnote label", "Label text inside the footnote."),
  fw: character("fw", "note", "Witness list", "List of witnesses in a critical footnote."),
  fp: character("fp", "note", "Footnote paragraph", "A further paragraph inside the footnote."),
  fv: character("fv", "verse", "Footnote verse number", "Verse number inside a footnote, shown as a superscript."),
  ft: character("ft", "note", "Footnote text", "Shown with the footnote."),
  fdc: character("fdc", "addition", "Footnote deuterocanonical content", "Deprecated. Use dc.", false, true),
  fm: character("fm", "note", "Footnote reference mark", "Reference mark inside a footnote."),

  x: define("x", "Note", "note", true, false, "Cross reference", "Collected with the chapter notes.", "note"),
  ex: define("ex", "Note", "note", true, false, "Study cross reference", "Extended cross reference, collected with the chapter notes.", "note"),
  xo: character("xo", "reference", "Cross reference origin", "Chapter and verse the targets belong to."),
  xk: character("xk", "reference", "Cross reference keyword", "Keyword from the text, in semibold."),
  xq: character("xq", "reference", "Cross reference quotation", "Quotation from the text, in italic."),
  xt: character("xt", "reference", "Cross reference target", "Target references. link-href is the default attribute."),
  xta: character("xta", "reference", "Cross reference added text", "Text added around a target reference."),
  xop: character("xop", "reference", "Published origin reference", "Origin text to publish when it differs from xo."),
  xot: character("xot", "reference", "Old Testament target", "Target references published in Old Testament editions."),
  xnt: character("xnt", "reference", "New Testament target", "Target references published in New Testament editions."),
  xdc: character("xdc", "reference", "Deuterocanonical target", "Deprecated. Use dc.", false, true),
  rq: character("rq", "reference", "Inline quotation reference", "Reference printed in the text column, in italic."),
  cat: character("cat", "note", "Category", "Category tag for a study note or sidebar."),

  esb: paragraph("esb", "note", "Sidebar", "Opens a sidebar. The category attribute names its group.", "sidebar-start", false, true),
  esbe: paragraph("esbe", "note", "Sidebar end", "Closes the sidebar.", "sidebar-end"),

  c: define("c", "Chapter", "chapter", false, false, "Chapter number", "Shown as the chapter heading.", "heading"),
  ca: character("ca", "chapter", "Alternate chapter number", "Shown beside the chapter number."),
  cl: paragraph("cl", "chapter", "Chapter label", "Replaces the chapter kicker. Before the first chapter, it applies to every chapter.", "chapter-label", false, true),
  cp: paragraph("cp", "chapter", "Published chapter character", "Shown in place of the chapter number.", "published-chapter", false, true),
  cd: paragraph("cd", "chapter", "Chapter description", "Shown under the chapter heading.", "chapter-description", false, true),
  v: define("v", "Verse", "verse", false, false, "Verse number", "Shown as a small verse number.", "char"),
  va: character("va", "verse", "Alternate verse number", "Shown as a small alternate number."),
  vp: character("vp", "verse", "Published verse character", "Shown as the published verse number."),

  pb: paragraph("pb", "meta", "Page break", "Shown as a divider.", "page-break"),

  "qt-s": define("qt-s", "Milestone", "poetry", false, false, "Quotation start", "Marks the start of a quotation. who names the speaker. qt-s is level 1.", "milestone", true),
  "qt-e": define("qt-e", "Milestone", "poetry", false, false, "Quotation end", "Marks the end of a quotation. qt-e is level 1.", "milestone", true),
  "ts-s": define("ts-s", "Milestone", "meta", false, false, "Translator's section start", "Marks the start of a translator's section. Not printed as scripture.", "milestone"),
  "ts-e": define("ts-e", "Milestone", "meta", false, false, "Translator's section end", "Marks the end of a translator's section. Not printed as scripture.", "milestone"),
};

const PRIVATE: MarkerInfo = define(
  "z",
  "Paragraph",
  "marker",
  true,
  false,
  "Private marker",
  "The \\z namespace is reserved for local markup. It is not part of USFM.",
  "paragraph",
);

const TABLE_BASE = /^(thr|tcr|th|tc)(\d+)?(?:-(\d+))?$/;
const MILESTONE = /^(qt|ts)(\d+)?-(s|e)$/;
const NUMBERED = /^([a-z]+)(\d+)$/;

export function resolveMarker(style: string | undefined): ResolvedMarker | undefined {
  if (!style) return undefined;
  const exact = MARKERS[style];
  if (exact) {
    const edge = style.endsWith("-s") ? "start" : style.endsWith("-e") ? "end" : undefined;
    return { info: exact, style, level: 1, edge };
  }

  const milestone = MILESTONE.exec(style);
  if (milestone) {
    const base = `${milestone[1]}-${milestone[3]}`;
    const info = MARKERS[base];
    if (info) {
      return {
        info,
        style,
        level: milestone[2] ? Number(milestone[2]) : 1,
        edge: milestone[3] === "s" ? "start" : "end",
      };
    }
  }

  const table = TABLE_BASE.exec(style);
  if (table && MARKERS[table[1]]) {
    const start = table[2] ? Number(table[2]) : 1;
    const end = table[3] ? Number(table[3]) : start;
    return { info: MARKERS[table[1]], style, level: start, columns: { start, end } };
  }

  const numbered = NUMBERED.exec(style);
  if (numbered && MARKERS[numbered[1]]?.numbered) {
    const info = MARKERS[numbered[1]];
    const level = Number(numbered[2]);
    if (info.style === "h" && level > 0) {
      return {
        info: { ...info, deprecated: true, page: "Deprecated numbered running header. Not shown on the page." },
        style,
        level,
      };
    }
    return { info, style, level };
  }

  if (/^z[A-Za-z0-9]/.test(style)) return { info: PRIVATE, style, level: 1 };
  return undefined;
}

export function markerInfo(style: string | undefined): MarkerInfo | undefined {
  return resolveMarker(style)?.info;
}

export function unknownMarker(style: string): MarkerInfo {
  return define(style, "Paragraph", "marker", true, false, `Marker ${style}`, "Shown as a paragraph. This style is not in USFM 3.0.1.", "paragraph");
}

export function pageDescription(resolved: ResolvedMarker): string {
  const { info, level } = resolved;
  if (info.style === "q") {
    if (level === 1) return "Indented one level.";
    if (level === 2) return "Indented two levels.";
    return `Indented ${level} levels.`;
  }
  if (info.style === "s") {
    return level <= 1 ? "Shown in bold italic as a section heading." : "Shown in bold italic as a smaller section heading.";
  }
  if (info.style === "ms") {
    return level <= 1 ? "Shown in bold italic as a major heading." : "Shown in bold italic as a smaller major heading.";
  }
  if (info.numbered && level > 1) return `${info.page} This one is level ${level}.`;
  return info.page;
}

export const ATTRIBUTES: Record<string, AttributeSpec> = {
  lemma: {
    name: "lemma",
    description: "Citation form in the glossary. Default attribute of w. Several forms are separated with a colon. w, wg, wh, and wa.",
  },
  strong: {
    name: "strong",
    description: "Strong’s number, H#### for Hebrew or G#### for Greek. Several numbers are separated with a comma. Used on w.",
  },
  srcloc: {
    name: "srcloc",
    description: "Where the word sits in the source text. Used on w.",
  },
  gloss: {
    name: "gloss",
    description: "Ruby reading gloss. Default attribute of rb. Parts of a compound gloss are separated with a colon.",
  },
  "link-href": {
    name: "link-href",
    description: "Target of a link, as a URI or a scripture reference. Default attribute of xt and jmp. Also link-title and link-id.",
  },
  "link-title": {
    name: "link-title",
    description: "Plain-text description of a linked resource, such as a tooltip. Used with jmp and other linked text.",
  },
  "link-id": {
    name: "link-id",
    description: "Anchor identifier for this link location.",
  },
  alt: {
    name: "alt",
    description: "Short description of a figure.",
  },
  src: {
    name: "src",
    description: "Required figure filename or address.",
  },
  size: {
    name: "size",
    description: "Required figure size. col places it in the column. span places it across the columns.",
  },
  loc: {
    name: "loc",
    description: "Reference range where a figure may be inserted.",
  },
  copy: {
    name: "copy",
    description: "Rights holder or copyright line for a figure.",
  },
  ref: {
    name: "ref",
    description: "Required scripture reference printed with a figure caption.",
  },
  who: {
    name: "who",
    description: "Speaker named by a quotation milestone (qt-s).",
  },
  sid: {
    name: "sid",
    description: "Identifier of a starting milestone, chapter, or verse. The matching end uses the same value as eid.",
  },
  eid: {
    name: "eid",
    description: "Identifier of an ending milestone, chapter, or verse. It matches the sid of the start.",
  },
  vid: {
    name: "vid",
    description: "Verse this paragraph continues, such as JHN 1:2.",
  },
  altnumber: {
    name: "altnumber",
    description: "Alternate chapter or verse number, the USX form of ca or va.",
  },
  pubnumber: {
    name: "pubnumber",
    description: "Chapter or verse character to publish, the USX form of cp or vp.",
  },
  caller: {
    name: "caller",
    description: "Note caller. + is generated automatically. - prints no caller. Any other character is used as written.",
  },
  category: {
    name: "category",
    description: "Category of a study note or sidebar. The same role as the cat marker.",
  },
  id: {
    name: "id",
    description:
      "Peripheral division identifier. Standard values include title, halftitle, promo, imprimatur, pubdata, foreword, preface, contents, alphacontents, abbreviations, intbible, intot, intpent, inthistory, intpoetry, intprophesy, intdc, intnt, intgospels, intepistles, intletters, chron, measures, maps, lxxquotes, cover, and spine. A project value starts with x-.",
  },
  code: {
    name: "code",
    description: "Book identifier on id, such as GEN or MAT.",
  },
  number: {
    name: "number",
    description: "Chapter or verse number. This is the # parameter of c and v.",
  },
  closed: {
    name: "closed",
    description: "USX records whether the USFM end marker was written. false means the next marker closed the span.",
  },
};

const ATTRIBUTE_TOKENS = new Set(Object.keys(ATTRIBUTES));

export function attributeInfo(name: string): AttributeSpec | undefined {
  if (ATTRIBUTES[name]) return ATTRIBUTES[name];
  if (name.startsWith("x-")) {
    return { name, description: "User-defined attribute. USFM requires the x- prefix, and compliant tools may ignore it." };
  }
  return undefined;
}

export function isDocumentedAttribute(name: string): boolean {
  return ATTRIBUTE_TOKENS.has(name) || name.startsWith("x-");
}

export function attributeValueNote(name: string, value: string): string {
  if (name === "caller" && value === "+") return "The preview generates a, b, c, and so on, and restarts at each chapter.";
  if (name === "caller" && value === "-") return "The preview lists the note and prints no caller.";
  if (name === "caller" && value) return "The preview prints this character as the caller.";
  if (name === "size" && value && value !== "col" && value !== "span") return "USFM defines col and span.";
  if (name === "id" && value.startsWith("x-")) return "This is a project-defined division identifier.";
  if (name.startsWith("x-")) return "This is a project-defined attribute.";
  return "";
}

/** Canonical style names from the USFM 3.0.1 marker index. */
export function documentedStyles(): string[] {
  return Object.keys(MARKERS);
}
