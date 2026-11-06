import * as vscode from "vscode";
import { parseUsx, type ParseResult } from "./parse";

const cache = new Map<string, { version: number; parsed: ParseResult }>();

export function parseDocument(document: vscode.TextDocument): ParseResult {
  const key = document.uri.toString();
  const hit = cache.get(key);
  if (hit && hit.version === document.version) return hit.parsed;
  const parsed = parseUsx(document.getText());
  cache.set(key, { version: document.version, parsed });
  return parsed;
}

export function dropDocument(uri: vscode.Uri): void {
  cache.delete(uri.toString());
}
