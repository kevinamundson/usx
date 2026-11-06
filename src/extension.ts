import * as vscode from "vscode";
import { dropDocument, parseDocument } from "./documents";
import { markerAt } from "./locate";
import { attributeValueNote, TOKEN_TYPES } from "./markers";
import { openPreview } from "./preview";
import { tokenizeUsx } from "./tokens";

const legend = new vscode.SemanticTokensLegend([...TOKEN_TYPES]);

class UsxTokens implements vscode.DocumentSemanticTokensProvider {
  provideDocumentSemanticTokens(document: vscode.TextDocument): vscode.SemanticTokens {
    const builder = new vscode.SemanticTokensBuilder(legend);
    const { tokens } = tokenizeUsx(document.getText());
    let lastEnd = 0;
    for (const token of tokens) {
      const start = Math.max(token.start, lastEnd);
      if (token.end <= start) continue;
      const typeIndex = TOKEN_TYPES.indexOf(token.type);
      if (typeIndex < 0) continue;
      pushSpan(builder, document, start, token.end, typeIndex);
      lastEnd = token.end;
    }
    return builder.build();
  }
}

function pushSpan(
  builder: vscode.SemanticTokensBuilder,
  document: vscode.TextDocument,
  start: number,
  end: number,
  typeIndex: number,
): void {
  let position = document.positionAt(start);
  const endPosition = document.positionAt(end);
  while (position.line < endPosition.line) {
    const length = document.lineAt(position.line).text.length - position.character;
    if (length > 0) builder.push(position.line, position.character, length, typeIndex, 0);
    position = new vscode.Position(position.line + 1, 0);
  }
  const length = endPosition.character - position.character;
  if (length > 0) builder.push(position.line, position.character, length, typeIndex, 0);
}

class UsxHover implements vscode.HoverProvider {
  provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | undefined {
    const parsed = parseDocument(document);
    const hit = markerAt(parsed.root, document.offsetAt(position));
    if (!hit || hit.end <= hit.start) return undefined;
    const markdown = new vscode.MarkdownString();
    if (hit.attribute) {
      const value = document.getText(new vscode.Range(document.positionAt(hit.start), document.positionAt(hit.end)));
      markdown.appendMarkdown(`**${hit.attribute.name}** · Parameter\n\n`);
      markdown.appendMarkdown(`${hit.attribute.description}`);
      const note = value === hit.attribute.name ? "" : attributeValueNote(hit.attribute.name, value);
      if (note) markdown.appendMarkdown(`\n\n${note}`);
    } else {
      markdown.appendMarkdown(`**${hit.style}** · ${hit.info.markerType}\n\n`);
      markdown.appendMarkdown(`${hit.info.name}\n\n`);
      markdown.appendMarkdown(hit.page);
      if (hit.info.deprecated) markdown.appendMarkdown("\n\nDeprecated in USFM 3.0.");
    }
    const range = new vscode.Range(document.positionAt(hit.start), document.positionAt(hit.end));
    return new vscode.Hover(markdown, range);
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const selector: vscode.DocumentSelector = { language: "usx" };
  context.subscriptions.push(
    vscode.languages.registerDocumentSemanticTokensProvider(selector, new UsxTokens(), legend),
    vscode.languages.registerHoverProvider(selector, new UsxHover()),
    vscode.commands.registerCommand("usx.showPreview", () => openPreview(context, false)),
    vscode.commands.registerCommand("usx.showPreviewToSide", () => openPreview(context, true)),
    vscode.workspace.onDidCloseTextDocument((document) => dropDocument(document.uri)),
  );
}

export function deactivate(): void {}
