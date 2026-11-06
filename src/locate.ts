import { attributeInfo, pageDescription, resolveMarker, unknownMarker, type AttributeSpec, type MarkerInfo } from "./markers";
import { usxElement, type ElementNode, type Node } from "./parse";

export interface MarkerHit {
  info: MarkerInfo;
  style: string;
  start: number;
  end: number;
  page: string;
  attribute?: AttributeSpec;
}

function chainAt(root: ElementNode, offset: number): ElementNode[] {
  const chain: ElementNode[] = [];
  const visit = (node: Node) => {
    if (node.kind !== "element") return;
    if (offset < node.start || offset >= node.end) return;
    chain.push(node);
    for (const child of node.children) visit(child);
  };
  visit(root);
  return chain;
}

function hitFor(style: string, start: number, end: number): MarkerHit {
  const resolved = resolveMarker(style);
  if (!resolved) {
    const info = unknownMarker(style);
    return { info, style, start, end, page: info.page };
  }
  return { info: resolved.info, style, start, end, page: pageDescription(resolved) };
}

export function markerAt(root: ElementNode, offset: number): MarkerHit | undefined {
  const chain = chainAt(root, offset);
  if (chain.length === 0) return undefined;
  const inner = chain[chain.length - 1];
  for (const attr of inner.attrSpans) {
    const onValue = offset >= attr.valueStart && offset < attr.valueEnd;
    const onName = offset >= attr.nameStart && offset < attr.nameEnd;
    if (!onValue && !onName) continue;
    if (attr.name === "style" && onValue) return hitFor(attr.value, attr.valueStart, attr.valueEnd);
    const spec = attributeInfo(attr.name);
    if (!spec) continue;
    const marker = hitFor(inner.attrs.style || inner.name, onValue ? attr.valueStart : attr.nameStart, onValue ? attr.valueEnd : attr.nameEnd);
    return { ...marker, attribute: spec, start: onValue ? attr.valueStart : attr.nameStart, end: onValue ? attr.valueEnd : attr.nameEnd };
  }
  for (let index = chain.length - 1; index >= 0; index--) {
    const style = chain[index].attrs.style;
    if (!style) continue;
    return hitFor(style, chain[index].start, chain[index].end);
  }
  return undefined;
}

export function bookCodeIn(root: ElementNode): string {
  const usx = usxElement(root);
  if (!usx) return "";
  for (const child of usx.children) {
    if (child.kind === "element" && child.name === "book" && child.attrs.code) return child.attrs.code;
  }
  return "";
}

export function referenceAt(root: ElementNode, offset: number): string | undefined {
  let ref: string | undefined;
  const visit = (node: Node) => {
    if (node.kind !== "element" || node.start > offset) return;
    if (node.name === "chapter" && node.attrs.number && node.attrs.sid) ref = node.attrs.sid;
    if (node.name === "verse" && node.attrs.number && node.attrs.sid) ref = node.attrs.sid;
    if (node.name === "para" && node.attrs.vid) ref = node.attrs.vid;
    for (const child of node.children) visit(child);
  };
  visit(root);
  return ref;
}

export function offsetOfReference(root: ElementNode, ref: string): number | undefined {
  let found: number | undefined;
  const visit = (node: Node) => {
    if (found !== undefined || node.kind !== "element") return;
    if (
      (node.name === "verse" && node.attrs.sid === ref && node.attrs.number) ||
      (node.name === "para" && node.attrs.vid === ref) ||
      (node.name === "chapter" && node.attrs.sid === ref && node.attrs.number)
    ) {
      found = node.start;
      return;
    }
    for (const child of node.children) visit(child);
  };
  visit(root);
  return found;
}
