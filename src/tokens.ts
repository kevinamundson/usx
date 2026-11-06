import { isDocumentedAttribute, markerInfo, type TokenType } from "./markers";
import { parseUsx, type ElementNode, type Node, type ParseResult } from "./parse";

export interface Token {
  start: number;
  end: number;
  type: TokenType;
}

export interface TokenizeResult {
  tokens: Token[];
  parsed: ParseResult;
}

function contentType(ancestors: ElementNode[]): TokenType | undefined {
  for (let index = ancestors.length - 1; index >= 0; index--) {
    const element = ancestors[index];
    const info = markerInfo(element.attrs.style);
    if (!info) continue;
    if (element.name === "char" || element.name === "note" || element.name === "para" || element.name === "book") {
      return info.content ? info.token : undefined;
    }
  }
  return undefined;
}

function attributeType(element: ElementNode, name: string, value: string): TokenType | undefined {
  if (name === "style") return markerInfo(value)?.token ?? "marker";
  if (name === "number" && (element.name === "chapter" || element.name === "verse")) {
    return element.name === "chapter" ? "chapter" : "verse";
  }
  if (name === "caller") return "note";
  if (name === "code") return "meta";
  if (isDocumentedAttribute(name)) return "attribute";
  return undefined;
}

export function tokenizeUsx(source: string): TokenizeResult {
  const parsed = parseUsx(source);
  const tokens: Token[] = [];
  const ancestors: ElementNode[] = [];

  const visit = (node: Node) => {
    if (node.kind === "text") {
      if (!node.text.trim()) return;
      const type = contentType(ancestors);
      if (type) tokens.push({ start: node.start, end: node.end, type });
      return;
    }
    for (const attr of node.attrSpans) {
      const type = attributeType(node, attr.name, attr.value);
      if (type && attr.valueEnd > attr.valueStart) {
        tokens.push({ start: attr.valueStart, end: attr.valueEnd, type });
      }
    }
    ancestors.push(node);
    for (const child of node.children) visit(child);
    ancestors.pop();
  };

  visit(parsed.root);
  tokens.sort((a, b) => a.start - b.start || a.end - b.end);
  return { tokens, parsed };
}
