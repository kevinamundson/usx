import * as crypto from "crypto";
import * as vscode from "vscode";
import { formatReference } from "./books";
import { parseDocument } from "./documents";
import { bookCodeIn, offsetOfReference, referenceAt } from "./locate";
import { renderUsx } from "./render";

let active: UsxPreview | undefined;

export function openPreview(context: vscode.ExtensionContext, beside: boolean): void {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== "usx") {
    void vscode.window.showInformationMessage("Open a USX file to preview it.");
    return;
  }
  if (active) {
    active.show(editor.document, false);
    return;
  }
  active = new UsxPreview(context, editor.document, beside);
}

class UsxPreview {
  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];
  private document: vscode.TextDocument;
  private features: boolean;
  private byVerse: boolean;
  private ready = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;

  constructor(private readonly context: vscode.ExtensionContext, document: vscode.TextDocument, beside: boolean) {
    this.document = document;
    this.features = context.workspaceState.get("usx.features", false);
    this.byVerse = vscode.workspace.getConfiguration("usx").get("preview.byVerse", false);
    this.panel = vscode.window.createWebviewPanel("usx.preview", "USX Preview", beside ? vscode.ViewColumn.Beside : vscode.ViewColumn.Active, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")],
    });
    this.panel.webview.html = this.shell();
    this.panel.webview.onDidReceiveMessage((message) => this.onMessage(message), undefined, this.disposables);
    this.panel.onDidDispose(() => this.dispose(), undefined, this.disposables);
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document.uri.toString() === this.document.uri.toString()) {
          this.document = event.document;
          this.schedule();
        }
      }),
      vscode.window.onDidChangeTextEditorSelection((event) => {
        if (event.textEditor.document.uri.toString() === this.document.uri.toString()) {
          this.postReference(event.selections[0]?.active);
        }
      }),
      vscode.workspace.onDidCloseTextDocument((document) => {
        if (document.uri.toString() === this.document.uri.toString()) this.panel.dispose();
      }),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (!event.affectsConfiguration("usx.preview.byVerse")) return;
        this.byVerse = vscode.workspace.getConfiguration("usx").get("preview.byVerse", false);
        void this.panel.webview.postMessage({ type: "verses", value: this.byVerse });
      }),
    );
  }

  show(document: vscode.TextDocument, preserveFocus: boolean): void {
    this.document = document;
    this.panel.reveal(this.panel.viewColumn, preserveFocus);
    this.publish();
    const editor = vscode.window.visibleTextEditors.find((item) => item.document.uri.toString() === document.uri.toString());
    this.postReference(editor?.selection.active);
  }

  private dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    active = undefined;
    for (const disposable of this.disposables) disposable.dispose();
  }

  private shell(): string {
    const nonce = crypto.randomBytes(16).toString("base64");
    const css = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "media", "preview.css"));
    const script = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "media", "preview.js"));
    const logo = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "media", "logo.png"));
    const csp = [
      "default-src 'none'",
      `style-src ${this.panel.webview.cspSource}`,
      `img-src ${this.panel.webview.cspSource} https: http: data:`,
      `script-src 'nonce-${nonce}' ${this.panel.webview.cspSource}`,
    ].join("; ");
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<title>USX Preview</title>
<link rel="stylesheet" href="${css}">
</head>
<body class="${this.byVerse ? "verses" : ""}">
<header class="toolbar">
  <div class="tools">
    <div class="segment" role="group" aria-label="Preview appearance">
      <button type="button" id="mode-page" aria-pressed="true">Page</button>
      <button type="button" id="mode-features" aria-pressed="false">Features</button>
    </div>
    <div class="segment" role="group" aria-label="Scripture layout">
      <button type="button" id="layout-paragraph" aria-pressed="${this.byVerse ? "false" : "true"}">Paragraph</button>
      <button type="button" id="layout-verse" aria-pressed="${this.byVerse ? "true" : "false"}">Verse</button>
    </div>
  </div>
  <div class="ref" id="ref">Scripture</div>
  <div class="mark"><img class="logo" src="${logo}" alt="USX"></div>
</header>
<p class="legend" id="legend"><em class="add">Italic</em> marks a translator addition. <span class="wj">Red</span> marks words of Jesus, which the page leaves as ordinary text.</p>
<div class="frame">
  <div id="banner" hidden></div>
  <main id="sheet" aria-label="Scripture"></main>
</div>
<script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
  }

  private onMessage(message: { type?: string; ref?: string; value?: boolean }): void {
    if (message.type === "ready") {
      this.ready = true;
      void this.panel.webview.postMessage({ type: "features", value: this.features });
      void this.panel.webview.postMessage({ type: "verses", value: this.byVerse });
      this.publish();
      const editor = vscode.window.visibleTextEditors.find((item) => item.document.uri.toString() === this.document.uri.toString());
      this.postReference(editor?.selection.active);
      return;
    }
    if (message.type === "features") {
      this.features = !!message.value;
      void this.context.workspaceState.update("usx.features", this.features);
      return;
    }
    if (message.type === "verses") {
      this.byVerse = !!message.value;
      void vscode.workspace.getConfiguration("usx").update("preview.byVerse", this.byVerse, vscode.ConfigurationTarget.Global);
      return;
    }
    if (message.type === "open" && message.ref) this.revealSource(message.ref);
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.publish(), 120);
  }

  private publish(): void {
    if (!this.ready) return;
    const result = renderUsx(this.document.getText());
    this.panel.title = result.title ? `${result.title} Preview` : "USX Preview";
    const error = result.error ? `Line ${result.error.line}, column ${result.error.column}: ${result.error.message}` : "";
    void this.panel.webview.postMessage({
      type: "render",
      html: result.html,
      title: result.title,
      error,
    });
  }

  private postReference(position: vscode.Position | undefined): void {
    if (!this.ready || !position) return;
    const parsed = parseDocument(this.document);
    const ref = referenceAt(parsed.root, this.document.offsetAt(position));
    void this.panel.webview.postMessage({
      type: "reveal",
      ref: ref ?? "",
      label: formatReference(ref, bookCodeIn(parsed.root) || undefined),
    });
  }

  private revealSource(ref: string): void {
    const parsed = parseDocument(this.document);
    const offset = offsetOfReference(parsed.root, ref);
    if (offset === undefined) return;
    const position = this.document.positionAt(offset);
    const selection = new vscode.Selection(position, position);
    const visible = vscode.window.visibleTextEditors.find((item) => item.document.uri.toString() === this.document.uri.toString());
    if (visible) {
      visible.selection = selection;
      visible.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
      return;
    }
    void vscode.window.showTextDocument(this.document, { preview: false }).then((editor) => {
      editor.selection = selection;
      editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    });
  }
}
