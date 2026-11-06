export interface AttrSpan {
  name: string;
  value: string;
  nameStart: number;
  nameEnd: number;
  valueStart: number;
  valueEnd: number;
}

export interface ElementNode {
  kind: "element";
  name: string;
  attrs: Record<string, string>;
  attrSpans: AttrSpan[];
  children: Node[];
  start: number;
  openEnd: number;
  end: number;
  selfClosing: boolean;
  nameStart: number;
  nameEnd: number;
}

export interface TextNode {
  kind: "text";
  /** Decoded text. Offsets still refer to the source. */
  text: string;
  start: number;
  end: number;
}

export type Node = ElementNode | TextNode;

export interface ParseDiagnostic {
  message: string;
  offset: number;
  line: number;
  column: number;
}

export interface ParseResult {
  root: ElementNode;
  error?: ParseDiagnostic;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

export function decodeXml(raw: string): string {
  return raw.replace(/&(#x[0-9a-fA-F]+|#\d+|[A-Za-z][A-Za-z0-9]+);/g, (all, body: string) => {
    if (body[0] === "#") {
      const codePoint = body[1] === "x" || body[1] === "X" ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10);
      if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return all;
      return String.fromCodePoint(codePoint);
    }
    return ENTITIES[body] ?? all;
  });
}

export function positionAt(source: string, offset: number): { line: number; column: number } {
  let line = 1;
  let column = 1;
  const end = Math.min(offset, source.length);
  for (let i = 0; i < end; i++) {
    if (source[i] === "\n") {
      line++;
      column = 1;
    } else {
      column++;
    }
  }
  return { line, column };
}

function isSpace(char: string | undefined): boolean {
  return char === " " || char === "\n" || char === "\r" || char === "\t";
}

function isNameStart(char: string | undefined): boolean {
  return !!char && /[A-Za-z_:]/.test(char);
}

function isNameChar(char: string | undefined): boolean {
  return !!char && /[A-Za-z0-9_:\-.]/.test(char);
}

function syntheticRoot(source: string): ElementNode {
  return {
    kind: "element",
    name: "#root",
    attrs: {},
    attrSpans: [],
    children: [],
    start: 0,
    openEnd: 0,
    end: source.length,
    selfClosing: false,
    nameStart: 0,
    nameEnd: 0,
  };
}

export function parseUsx(source: string): ParseResult {
  const root = syntheticRoot(source);
  const stack: ElementNode[] = [root];
  let error: ParseDiagnostic | undefined;
  let i = 0;

  const diagnose = (message: string, offset: number): ParseDiagnostic => {
    const position = positionAt(source, offset);
    return { message, offset, line: position.line, column: position.column };
  };

  const closeOpen = (end: number) => {
    while (stack.length > 1) {
      const open = stack.pop();
      if (open) open.end = end;
    }
    root.end = source.length;
  };

  while (i < source.length && !error) {
    if (source[i] !== "<") {
      const start = i;
      const next = source.indexOf("<", i);
      const end = next === -1 ? source.length : next;
      const raw = source.slice(start, end);
      if (raw.length > 0) {
        stack[stack.length - 1].children.push({
          kind: "text",
          text: decodeXml(raw),
          start,
          end,
        });
      }
      i = end;
      continue;
    }

    if (source.startsWith("<!--", i)) {
      const end = source.indexOf("-->", i + 4);
      if (end === -1) {
        error = diagnose("Unclosed comment", i);
        break;
      }
      i = end + 3;
      continue;
    }

    if (source.startsWith("<![CDATA[", i)) {
      const end = source.indexOf("]]>", i + 9);
      if (end === -1) {
        error = diagnose("Unclosed CDATA section", i);
        break;
      }
      const start = i + 9;
      stack[stack.length - 1].children.push({
        kind: "text",
        text: source.slice(start, end),
        start,
        end,
      });
      i = end + 3;
      continue;
    }

    if (source.startsWith("<?", i) || source.startsWith("<!", i)) {
      const end = source.indexOf(">", i + 2);
      if (end === -1) {
        error = diagnose("Unclosed declaration", i);
        break;
      }
      i = end + 1;
      continue;
    }

    if (source[i + 1] === "/") {
      const nameStart = i + 2;
      let cursor = nameStart;
      while (isNameChar(source[cursor])) cursor++;
      const name = source.slice(nameStart, cursor);
      while (isSpace(source[cursor])) cursor++;
      if (!name || source[cursor] !== ">") {
        error = diagnose("Malformed end tag", i);
        break;
      }
      const end = cursor + 1;
      const open = stack[stack.length - 1];
      if (!open || open === root || open.name !== name) {
        error = diagnose(`End tag </${name || "?"}> does not match <${open && open !== root ? open.name : "document"}>`, i);
        break;
      }
      open.end = end;
      stack.pop();
      i = end;
      continue;
    }

    const opened = readOpen(source, i);
    if ("message" in opened) {
      error = diagnose(opened.message, opened.offset);
      break;
    }
    const element: ElementNode = {
      kind: "element",
      name: opened.name,
      attrs: opened.attrs,
      attrSpans: opened.attrSpans,
      children: [],
      start: i,
      openEnd: opened.end,
      end: opened.end,
      selfClosing: opened.selfClosing,
      nameStart: opened.nameStart,
      nameEnd: opened.nameEnd,
    };
    stack[stack.length - 1].children.push(element);
    if (!opened.selfClosing) stack.push(element);
    i = opened.end;
  }

  if (!error && i >= source.length && stack.length > 1) {
    const open = stack[stack.length - 1];
    error = diagnose(`Unclosed <${open.name}>`, open.start);
  }
  if (stack.length > 1) closeOpen(error?.offset ?? source.length);
  root.end = source.length;
  return error ? { root, error } : { root };
}

interface OpenTag {
  name: string;
  attrs: Record<string, string>;
  attrSpans: AttrSpan[];
  end: number;
  selfClosing: boolean;
  nameStart: number;
  nameEnd: number;
}

function readOpen(source: string, start: number): OpenTag | { message: string; offset: number } {
  let i = start + 1;
  if (!isNameStart(source[i])) return { message: "Malformed start tag", offset: start };
  const nameStart = i;
  i++;
  while (isNameChar(source[i])) i++;
  const nameEnd = i;
  const name = source.slice(nameStart, nameEnd);
  const attrs: Record<string, string> = {};
  const attrSpans: AttrSpan[] = [];

  while (i < source.length) {
    while (isSpace(source[i])) i++;
    if (i >= source.length) return { message: `Unclosed <${name}>`, offset: start };
    if (source[i] === ">") {
      return { name, attrs, attrSpans, end: i + 1, selfClosing: false, nameStart, nameEnd };
    }
    if (source[i] === "/" && source[i + 1] === ">") {
      return { name, attrs, attrSpans, end: i + 2, selfClosing: true, nameStart, nameEnd };
    }
    if (!isNameStart(source[i])) return { message: `Malformed attribute in <${name}>`, offset: i };
    const attrNameStart = i;
    i++;
    while (isNameChar(source[i])) i++;
    const attrNameEnd = i;
    const attrName = source.slice(attrNameStart, attrNameEnd);
    while (isSpace(source[i])) i++;
    if (source[i] !== "=") return { message: `Expected = after ${attrName}`, offset: i };
    i++;
    while (isSpace(source[i])) i++;
    const quote = source[i];
    if (quote !== '"' && quote !== "'") return { message: `Expected a quoted value for ${attrName}`, offset: i };
    i++;
    const valueStart = i;
    while (i < source.length && source[i] !== quote) i++;
    if (i >= source.length) return { message: `Unclosed value for ${attrName}`, offset: valueStart };
    const valueEnd = i;
    const value = decodeXml(source.slice(valueStart, valueEnd));
    attrs[attrName] = value;
    attrSpans.push({
      name: attrName,
      value,
      nameStart: attrNameStart,
      nameEnd: attrNameEnd,
      valueStart,
      valueEnd,
    });
    i++;
  }
  return { message: `Unclosed <${name}>`, offset: start };
}

export function usxElement(root: ElementNode): ElementNode | undefined {
  for (const child of root.children) {
    if (child.kind === "element" && child.name === "usx") return child;
  }
  if (root.name === "usx") return root;
  return undefined;
}

export function elementText(element: ElementNode): string {
  let text = "";
  for (const child of element.children) {
    if (child.kind === "text") text += child.text;
    else text += elementText(child);
  }
  return text.replace(/\s+/g, " ").trim();
}
