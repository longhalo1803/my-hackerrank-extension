import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { IChallenge, ISolution } from '../types/hackerrank';
import { HackerRankAPIClient } from '../modules/HackerRankAPIClient';
import { SolutionManager } from '../modules/SolutionManager';
import { LanguageRegistry } from '../modules/LanguageRegistry';

export class ProblemWebviewPanel {
  public static currentPanel: ProblemWebviewPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];
  private currentLanguage: string;
  private currentSolutionPath: string;
  private challenge: IChallenge;
  private trackSlug: string;
  private chapterSlug: string;
  private isDisposed = false;

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly extensionUri: vscode.Uri,
    challenge: IChallenge,
    trackSlug: string,
    chapterSlug: string,
    solutionPath: string,
    language: string,
    private readonly apiClient: HackerRankAPIClient,
    private readonly solutionManager: SolutionManager,
    private readonly globalState?: vscode.Memento,
  ) {
    this.panel = panel;
    this.challenge = challenge;
    this.trackSlug = trackSlug;
    this.chapterSlug = chapterSlug;
    this.currentLanguage = language;
    this.currentSolutionPath = solutionPath;

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.html = this.getHtmlForWebview();

    this.panel.webview.onDidReceiveMessage(
      async (message) => {
        if (
          !message ||
          typeof message !== 'object' ||
          !('command' in message)
        ) {
          return;
        }
        switch (message.command) {
          case 'autoSaveCode':
            this.handleAutoSaveCode(message.code);
            break;
          case 'readClipboard':
            try {
              const clipText = await vscode.env.clipboard.readText();
              this.panel.webview.postMessage({ type: 'clipboardData', text: clipText });
            } catch (err: any) {
              console.warn('[ProblemWebviewPanel] Clipboard read error:', err?.message);
            }
            break;
          case 'writeClipboard':
            if (typeof message.text === 'string') {
              try {
                await vscode.env.clipboard.writeText(message.text);
              } catch (err: any) {
                console.warn('[ProblemWebviewPanel] Clipboard write error:', err?.message);
              }
            }
            break;
          case 'changeLanguage':
            if (message.language) {
              await this.applyLanguageChange(message.language);
            } else {
              await this.handleChangeLanguage();
            }
            break;
          case 'runRemoteTest':
            await this.handleRunRemoteTest(message.code);
            break;
          case 'submitHackerRank':
            await this.handleSubmitHackerRank(message.code);
            break;
          case 'saveSolution':
            await this.handleSaveSolution();
            break;
        }
      },
      null,
      this.disposables,
    );
  }

  public static render(
    extensionUri: vscode.Uri,
    challenge: IChallenge,
    trackSlug: string,
    chapterSlug: string,
    solutionPath: string,
    language: string,
    apiClient: HackerRankAPIClient,
    solutionManager: SolutionManager,
    globalState?: vscode.Memento,
  ): ProblemWebviewPanel {
    if (
      ProblemWebviewPanel.currentPanel &&
      !ProblemWebviewPanel.currentPanel.isDisposed
    ) {
      ProblemWebviewPanel.currentPanel.loadChallenge(
        challenge,
        trackSlug,
        chapterSlug,
        solutionPath,
        language,
      );
      return ProblemWebviewPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      'hackerrank.workbench',
      `HackerRank: ${challenge.name}`,
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.file(path.join(extensionUri.fsPath, 'media')),
        ],
      },
    );

    const problemPanel = new ProblemWebviewPanel(
      panel,
      extensionUri,
      challenge,
      trackSlug,
      chapterSlug,
      solutionPath,
      language,
      apiClient,
      solutionManager,
      globalState,
    );

    ProblemWebviewPanel.currentPanel = problemPanel;
    return problemPanel;
  }

  public loadChallenge(
    challenge: IChallenge,
    trackSlug: string,
    chapterSlug: string,
    solutionPath: string,
    language: string,
  ): void {
    if (this.isDisposed) return;
    this.challenge = challenge;
    this.trackSlug = trackSlug;
    this.chapterSlug = chapterSlug;
    this.currentSolutionPath = solutionPath;
    this.currentLanguage = language;
    this.panel.title = `HackerRank: ${challenge.name}`;
    this.panel.reveal(vscode.ViewColumn.One);

    let code = '';
    if (fs.existsSync(solutionPath)) {
      code = fs.readFileSync(solutionPath, 'utf8');
    }

    const langInfo = LanguageRegistry.get(this.currentLanguage);
    const availableLanguages = LanguageRegistry.getSupportedForChallenge(
      this.challenge.languages,
    );

    this.panel.webview.postMessage({
      type: 'challengeLoaded',
      challenge: {
        ...this.challenge,
        questionHtml: this.sanitizeQuestionHtml(this.challenge.questionHtml),
      },
      trackSlug: this.trackSlug,
      chapterSlug: this.chapterSlug,
      language: this.currentLanguage,
      fileExtension: langInfo.extension,
      availableLanguages,
      code,
    });
  }

  private handleAutoSaveCode(code: string | undefined): void {
    if (typeof code !== 'string' || code.trim().length === 0) return;
    try {
      fs.writeFileSync(this.currentSolutionPath, code, 'utf8');
    } catch (err: any) {
      console.warn('[ProblemWebviewPanel] Auto-save failed:', err?.message);
    }
  }

  private async applyLanguageChange(newLangId: string): Promise<void> {
    if (newLangId === this.currentLanguage) return;
    this.currentLanguage = newLangId;
    if (this.globalState) {
      try {
        await this.globalState.update('hackerrank.lastUsedLanguage', newLangId);
      } catch (err: any) {
        console.warn(
          '[ProblemWebviewPanel] Non-critical persistence failure for lastUsedLanguage:',
          err?.message,
        );
      }
    }

    this.currentSolutionPath = this.solutionManager.prepareSolutionFile(
      this.challenge,
      this.trackSlug,
      newLangId,
    );

    let code = '';
    if (fs.existsSync(this.currentSolutionPath)) {
      code = fs.readFileSync(this.currentSolutionPath, 'utf8');
    }

    const langInfo = LanguageRegistry.get(newLangId);

    this.panel.webview.postMessage({
      type: 'languageChanged',
      language: newLangId,
      fileExtension: langInfo.extension,
      slug: this.challenge.slug,
      code,
    });
  }

  private async handleChangeLanguage(): Promise<void> {
    const availableLangs = LanguageRegistry.getSupportedForChallenge(
      this.challenge.languages,
    );
    availableLangs.sort((a, b) => {
      if (a.id === this.currentLanguage) return -1;
      if (b.id === this.currentLanguage) return 1;
      return a.displayName.localeCompare(b.displayName);
    });

    const items = availableLangs.map((l) => ({
      label: l.displayName,
      description: l.id === this.currentLanguage ? '(Current)' : l.id,
      langId: l.id,
    }));

    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select programming language for this challenge',
    });

    if (!picked || picked.langId === this.currentLanguage) {
      return;
    }

    await this.applyLanguageChange(picked.langId);
  }

  private async getActiveCode(passedCode?: string): Promise<string> {
    if (typeof passedCode === 'string' && passedCode.length > 0) {
      this.handleAutoSaveCode(passedCode);
      return passedCode;
    }
    if (fs.existsSync(this.currentSolutionPath)) {
      return fs.readFileSync(this.currentSolutionPath, 'utf8');
    }
    throw new Error(`Solution file not found at ${this.currentSolutionPath}`);
  }

  private handleActionError(err: any, fallbackPrefix: string) {
    if (
      err.message &&
      (err.message.includes('logged in') ||
        err.message.includes('sign in') ||
        err.message.includes('Sign In'))
    ) {
      vscode.window
        .showErrorMessage(
          `HackerRank Authentication Required: ${err.message}`,
          'Sign In with Cookie',
        )
        .then((action) => {
          if (action === 'Sign In with Cookie') {
            vscode.commands.executeCommand('hackerrank.signin');
          }
        });
    } else {
      vscode.window.showErrorMessage(`${fallbackPrefix}: ${err.message}`);
    }
  }

  private async handleRunRemoteTest(passedCode?: string): Promise<void> {
    if (this.isDisposed) return;
    this.panel.webview.postMessage({ type: 'runTesting' });
    try {
      const code = await this.getActiveCode(passedCode);
      const solution: ISolution = {
        code,
        language: this.currentLanguage,
      };

      const compileTestId = await this.apiClient.compileTests(
        this.challenge.slug,
        solution,
      );
      const result = await this.apiClient.pollCompileTest(
        this.challenge.slug,
        compileTestId,
      );

      if (this.isDisposed) return;
      this.panel.webview.postMessage({
        type: 'runTestResults',
        result,
      });
    } catch (err: any) {
      if (this.isDisposed) return;
      this.panel.webview.postMessage({
        type: 'runTestError',
        error: err.message,
      });
      this.handleActionError(err, 'Remote test error');
    }
  }

  private async handleSubmitHackerRank(passedCode?: string): Promise<void> {
    if (this.isDisposed) return;
    this.panel.webview.postMessage({ type: 'submissionRunning' });
    try {
      const code = await this.getActiveCode(passedCode);
      const solution: ISolution = {
        code,
        language: this.currentLanguage,
      };

      const submissionId = await this.apiClient.submitCode(
        this.challenge.slug,
        solution,
      );
      const verdict = await this.apiClient.pollSubmission(
        this.challenge.slug,
        submissionId,
      );

      if (this.isDisposed) return;
      this.panel.webview.postMessage({
        type: 'submissionResults',
        verdict,
      });
    } catch (err: any) {
      if (this.isDisposed) return;
      this.panel.webview.postMessage({
        type: 'submissionError',
        error: err.message,
      });
      this.handleActionError(err, 'HackerRank submission error');
    }
  }

  private async handleSaveSolution(): Promise<void> {
    const lang = LanguageRegistry.get(this.currentLanguage);
    const suggestedName = `${this.challenge.slug}${lang.extension}`;
    await this.solutionManager.exportSolution(
      this.currentSolutionPath,
      suggestedName,
    );
  }

  private getNonce(): string {
    return crypto.randomBytes(16).toString('base64');
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private sanitizeQuestionHtml(rawHtml: string): string {
    if (!rawHtml) return '';
    return rawHtml
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
      .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
      .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<link\b[^>]*>/gi, '')
      .replace(/\s*on\w+\s*=\s*(['"]).*?\1/gi, '')
      .replace(/\s*on\w+\s*=\s*[^>\s]+/gi, '');
  }

  private getHtmlForWebview(): string {
    const nonce = this.getNonce();
    const langInfo = LanguageRegistry.get(this.currentLanguage);
    const katexCssUri = this.panel.webview.asWebviewUri(
      vscode.Uri.file(
        path.join(
          this.extensionUri.fsPath,
          'media',
          'katex',
          'katex.min.css',
        ),
      ),
    );
    const monacoVsUri = this.panel.webview.asWebviewUri(
      vscode.Uri.file(
        path.join(this.extensionUri.fsPath, 'media', 'monaco', 'min', 'vs'),
      ),
    );
    const monacoLoaderUri = this.panel.webview.asWebviewUri(
      vscode.Uri.file(
        path.join(
          this.extensionUri.fsPath,
          'media',
          'monaco',
          'min',
          'vs',
          'loader.js',
        ),
      ),
    );
    const monacoCssUri = this.panel.webview.asWebviewUri(
      vscode.Uri.file(
        path.join(
          this.extensionUri.fsPath,
          'media',
          'monaco',
          'min',
          'vs',
          'editor',
          'editor.main.css',
        ),
      ),
    );

    let initialCode = '';
    if (fs.existsSync(this.currentSolutionPath)) {
      initialCode = fs.readFileSync(this.currentSolutionPath, 'utf8');
    }

    const availableLangs = LanguageRegistry.getSupportedForChallenge(
      this.challenge.languages,
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this.panel.webview.cspSource} 'unsafe-inline'; font-src ${this.panel.webview.cspSource} data:; img-src https: data:; base-uri 'none'; form-action 'none'; script-src ${this.panel.webview.cspSource} 'unsafe-eval' 'nonce-${nonce}'; worker-src blob: data: ${this.panel.webview.cspSource};">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HackerRank: ${this.escapeHtml(this.challenge.name)}</title>
  <link rel="stylesheet" href="${katexCssUri}">
  <link rel="stylesheet" href="${monacoCssUri}">
  <style>
/* Hallmark · v2.0.0 · genre modern-minimal · shape app screen · theme custom-workbench · job solve-and-test */
/* critique: Single-window dual-pane coding workbench with embedded Monaco editor and test execution console */

    :root {
      --bg-canvas: #0d1117;
      --bg-surface: #161b22;
      --bg-surface-elevated: #21262d;
      --bg-subtle: #21262d;
      --bg-input: #0b0e14;
      --border-subtle: #30363d;
      --border-muted: #21262d;
      --border-focus: #58a6ff;
      --text-main: #e6edf3;
      --text-secondary: #8b949e;
      --text-dim: #9aa0a6;
      --primary-fill: #238636;
      --primary-hover: #2ea043;
      --primary-active: #1d732d;
      --primary-text: #ffffff;
      --secondary-fill: #21262d;
      --secondary-hover: #30363d;
      --secondary-active: #161b22;
      --secondary-text: #c9d1d9;
      --pass-fill: rgba(46, 160, 67, 0.15);
      --pass-text: #3fb950;
      --pass-border: #238636;
      --fail-fill: rgba(248, 81, 73, 0.15);
      --fail-text: #f85149;
      --fail-border: #da3633;
      --font-body: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      --font-code: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier, monospace;
      --radius-sm: 4px;
      --radius-md: 6px;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    html, body {
      height: 100%;
      overflow-x: clip;
      background-color: var(--bg-canvas);
      color: var(--text-main);
      font-family: var(--font-body);
      font-size: 13px;
      line-height: 1.5;
    }

    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: 0.01ms !important;
        transition-duration: 0.01ms !important;
      }
    }

    .topbar {
      height: 48px;
      background-color: var(--bg-surface);
      border-bottom: 1px solid var(--border-subtle);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 16px;
      gap: 12px;
    }

    .meta-group {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .problem-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-main);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      text-wrap: balance;
    }

    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: var(--radius-sm);
      font-size: 11px;
      line-height: 1.4;
      font-weight: 500;
    }

    .badge-easy {
      background-color: var(--pass-fill);
      color: var(--pass-text);
      border: 1px solid var(--pass-border);
    }

    .badge-medium {
      background-color: rgba(210, 153, 34, 0.15);
      color: #d29922;
      border: 1px solid #9e6a03;
    }

    .badge-hard {
      background-color: var(--fail-fill);
      color: var(--fail-text);
      border: 1px solid var(--fail-border);
    }

    .badge-track {
      background-color: var(--bg-subtle);
      color: var(--text-secondary);
      border: 1px solid var(--border-muted);
    }

    .action-group {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    select, button {
      font-family: var(--font-body);
      font-size: 12px;
      height: 32px;
      padding: 0 12px;
      border-radius: var(--radius-sm);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: background-color 140ms ease, border-color 140ms ease, color 140ms ease;
    }

    select:focus-visible, button:focus-visible {
      outline: 2px solid var(--border-focus);
      outline-offset: 1px;
    }

    button:disabled, select:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    select {
      background-color: var(--secondary-fill);
      color: var(--secondary-text);
      border: 1px solid var(--border-subtle);
      padding-right: 20px;
    }

    .btn-secondary {
      background-color: var(--secondary-fill);
      color: var(--secondary-text);
      border: 1px solid var(--border-subtle);
    }

    .btn-secondary:hover {
      background-color: var(--secondary-hover);
      border-color: var(--border-focus);
    }

    .btn-secondary:active {
      background-color: var(--secondary-active);
    }

    .btn-primary {
      background-color: var(--primary-fill);
      color: var(--primary-text);
      border: 1px solid var(--pass-border);
      font-weight: 600;
    }

    .btn-primary:hover {
      background-color: var(--primary-hover);
    }

    .btn-primary:active {
      background-color: var(--primary-active);
    }

    .workbench {
      display: grid;
      grid-template-columns: minmax(320px, 45%) minmax(380px, 55%);
      height: calc(100% - 48px);
      overflow: hidden;
    }

    .pane-description {
      border-right: 1px solid var(--border-subtle);
      background-color: var(--bg-canvas);
      overflow-y: auto;
      padding: 24px 20px;
    }

    .pane-workspace {
      display: flex;
      flex-direction: column;
      height: 100%;
      background-color: var(--bg-canvas);
      overflow: hidden;
    }

    .editor-wrapper {
      flex: 1 1 58%;
      display: flex;
      flex-direction: column;
      border-bottom: 1px solid var(--border-subtle);
      background-color: var(--bg-input);
      color: var(--text-main);
      min-height: 180px;
      overflow: hidden;
    }

    .pane-tabs {
      height: 36px;
      background-color: var(--bg-surface);
      border-bottom: 1px solid var(--border-subtle);
      display: flex;
      align-items: center;
      padding: 0 8px;
      gap: 8px;
    }

    .file-pill {
      background-color: var(--bg-subtle);
      color: var(--text-main);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sm);
      font-size: 12px;
      padding: 4px 8px;
    }

    #monaco-editor-container {
      flex: 1;
      width: 100%;
      height: 100%;
      overflow: hidden;
    }

    .console-wrapper {
      flex: 0 0 42%;
      background-color: var(--bg-surface);
      color: var(--text-main);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .console-header {
      height: 36px;
      background-color: var(--bg-surface-elevated);
      border-bottom: 1px solid var(--border-subtle);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 12px;
    }

    .test-cases-nav {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .testcase-tab {
      background: none;
      border: 1px solid transparent;
      border-radius: var(--radius-sm);
      height: 24px;
      padding: 0 8px;
      font-size: 11px;
      color: var(--text-secondary);
    }

    .testcase-tab.active {
      background-color: var(--bg-subtle);
      color: var(--text-main);
      border-color: var(--border-subtle);
    }

    .console-content {
      flex: 1;
      padding: 16px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .verdict-banner {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-radius: var(--radius-sm);
      font-size: 12px;
      font-weight: 600;
    }

    .verdict-pass {
      background-color: var(--pass-fill);
      color: var(--pass-text);
      border: 1px solid var(--pass-border);
    }

    .verdict-fail {
      background-color: var(--fail-fill);
      color: var(--fail-text);
      border: 1px solid var(--fail-border);
    }

    .io-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }

    .io-block {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .io-label {
      font-size: 11px;
      color: var(--text-dim);
    }

    .io-box {
      background-color: var(--bg-input);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sm);
      padding: 8px 12px;
      font-family: var(--font-code);
      font-size: 12px;
      color: var(--text-main);
      white-space: pre-wrap;
    }

    pre, code {
      font-family: var(--font-code);
    }

    pre {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      padding: 8px 12px;
      border-radius: var(--radius-sm);
      overflow-x: auto;
      margin: 8px 0;
    }
  </style>
</head>
<body>

  <!-- Top Bar -->
  <header class="topbar">
    <div class="meta-group">
      <span class="problem-title" id="display-title">${this.escapeHtml(this.challenge.name)}</span>
      <span class="badge ${this.challenge.difficulty.toLowerCase() === 'easy' ? 'badge-easy' : this.challenge.difficulty.toLowerCase() === 'hard' ? 'badge-hard' : 'badge-medium'}" id="display-diff">${this.escapeHtml(this.challenge.difficulty)}</span>
      <span class="badge badge-track" id="display-track">${this.escapeHtml(this.trackSlug)} / ${this.escapeHtml(this.chapterSlug)}</span>
    </div>

    <div class="action-group">
      <select id="lang-select" aria-label="Select programming language">
        ${availableLangs
          .map(
            (l) =>
              `<option value="${l.id}" ${l.id === this.currentLanguage ? 'selected' : ''}>${this.escapeHtml(l.displayName)}</option>`,
          )
          .join('')}
      </select>
      <button class="btn-secondary" id="btn-run">Run Code</button>
      <button class="btn-primary" id="btn-submit">Submit Solution</button>
      <button class="btn-secondary" id="btn-save" title="Export Solution">Export</button>
    </div>
  </header>

  <!-- Dual-Pane Workbench -->
  <main class="workbench">
    <!-- Left Pane: Problem Description -->
    <section class="pane-description" aria-label="Problem statement">
      <div id="problem-statement">
        ${this.sanitizeQuestionHtml(this.challenge.questionHtml)}
      </div>
    </section>

    <!-- Right Pane: Monaco Code Buffer + Test Console -->
    <section class="pane-workspace" aria-label="Coding workspace">
      <div class="editor-wrapper">
        <div class="pane-tabs">
          <span class="file-pill" id="file-label">${this.escapeHtml(this.challenge.slug)}${langInfo.extension}</span>
          <div style="margin-left: auto; display: flex; gap: 8px;">
            <button class="btn-secondary" id="btn-copy-code" title="Copy code" style="height: 24px; padding: 0 8px; font-size: 11px;">Copy</button>
            <button class="btn-secondary" id="btn-paste-code" title="Paste code" style="height: 24px; padding: 0 8px; font-size: 11px;">Paste</button>
          </div>
        </div>
        <div id="monaco-editor-container"></div>
      </div>

      <div class="console-wrapper" id="test-console">
        <div class="console-header">
          <div class="test-cases-nav" id="testcase-nav">
            <button class="testcase-tab active" data-idx="0">Sample Case 0</button>
          </div>
          <span class="io-label" id="console-status-text">Ready</span>
        </div>
        <div class="console-content" id="results-panel">
          <div class="io-label">Run sample tests or submit solution to view execution output.</div>
        </div>
      </div>
    </section>
  </main>

  <script nonce="${nonce}" src="${monacoLoaderUri}"></script>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const btnRun = document.getElementById('btn-run');
    const btnSubmit = document.getElementById('btn-submit');
    const btnSave = document.getElementById('btn-save');
    const btnCopy = document.getElementById('btn-copy-code');
    const btnPaste = document.getElementById('btn-paste-code');
    const langSelect = document.getElementById('lang-select');
    const displayTitle = document.getElementById('display-title');
    const displayDiff = document.getElementById('display-diff');
    const displayTrack = document.getElementById('display-track');
    const fileLabel = document.getElementById('file-label');
    const problemStatement = document.getElementById('problem-statement');
    const resultsPanel = document.getElementById('results-panel');
    const consoleStatusText = document.getElementById('console-status-text');

    let monacoEditor = null;
    let autoSaveTimer = null;
    let isSettingProgrammaticValue = false;
    let currentLang = ${JSON.stringify(this.currentLanguage).replace(/</g, '\\u003c')};
    let initialSource = ${JSON.stringify(initialCode).replace(/</g, '\\u003c')};

    function mapMonacoLanguage(langId) {
      if (!langId) return 'plaintext';
      const l = langId.toLowerCase();
      if (l.includes('sql') || l.includes('db') || l.includes('oracle')) return 'sql';
      if (l.includes('python') || l.includes('py')) return 'python';
      if (l === 'javascript' || l.includes('node')) return 'javascript';
      if (l === 'typescript') return 'typescript';
      if (l.includes('cpp')) return 'cpp';
      if (l === 'c') return 'c';
      if (l.includes('java')) return 'java';
      if (l.includes('csharp')) return 'csharp';
      if (l.includes('ruby')) return 'ruby';
      if (l.includes('go')) return 'go';
      if (l.includes('rust')) return 'rust';
      if (l.includes('sh') || l.includes('bash')) return 'shell';
      if (l.includes('php')) return 'php';
      if (l.includes('kotlin')) return 'kotlin';
      if (l.includes('swift')) return 'swift';
      if (l.includes('scala')) return 'scala';
      if (l.includes('perl')) return 'perl';
      if (l.includes('lua')) return 'lua';
      if (l.includes('clojure')) return 'clojure';
      if (l.includes('r')) return 'r';
      return 'plaintext';
    }

    function doCopy() {
      if (!monacoEditor) return;
      const selection = monacoEditor.getSelection();
      const text = (selection && !selection.isEmpty())
        ? monacoEditor.getModel().getValueInRange(selection)
        : monacoEditor.getValue();
      if (text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).catch(() => {
            vscode.postMessage({ command: 'writeClipboard', text: text });
          });
        } else {
          vscode.postMessage({ command: 'writeClipboard', text: text });
        }
      }
    }

    function doPaste(text) {
      if (!monacoEditor || typeof text !== 'string') return;
      const selection = monacoEditor.getSelection();
      monacoEditor.executeEdits('clipboard-paste', [{
        range: selection,
        text: text,
        forceMoveMarkers: true,
      }]);
      monacoEditor.focus();
    }

    function requestPaste() {
      if (navigator.clipboard && navigator.clipboard.readText) {
        navigator.clipboard.readText().then(text => {
          if (text) doPaste(text);
        }).catch(() => {
          vscode.postMessage({ command: 'readClipboard' });
        });
      } else {
        vscode.postMessage({ command: 'readClipboard' });
      }
    }

    if (btnCopy) btnCopy.addEventListener('click', doCopy);
    if (btnPaste) btnPaste.addEventListener('click', requestPaste);

    window.addEventListener('paste', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const clipData = e.clipboardData ? e.clipboardData.getData('text/plain') : '';
      if (clipData) {
        doPaste(clipData);
      } else {
        vscode.postMessage({ command: 'readClipboard' });
      }
    });

    require.config({ paths: { vs: '${monacoVsUri}' }, cspNonce: '${nonce}' });
    require(['vs/editor/editor.main'], function() {
      monacoEditor = monaco.editor.create(document.getElementById('monaco-editor-container'), {
        value: initialSource,
        language: mapMonacoLanguage(currentLang),
        theme: 'vs-dark',
        automaticLayout: true,
        minimap: { enabled: false },
        fontSize: 13,
        lineNumbers: 'on',
        scrollBeyondLastLine: false,
        padding: { top: 12, bottom: 12 },
      });

      monacoEditor.onDidChangeModelContent(() => {
        if (isSettingProgrammaticValue) return;
        clearTimeout(autoSaveTimer);
        autoSaveTimer = setTimeout(() => {
          const code = monacoEditor.getValue();
          vscode.postMessage({ command: 'autoSaveCode', code: code });
        }, 500);
      });

      monacoEditor.onKeyDown((e) => {
        if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyV' || e.keyCode === 52)) {
          e.preventDefault();
          e.stopPropagation();
          requestPaste();
        }
        if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyC' || e.keyCode === 33)) {
          e.preventDefault();
          e.stopPropagation();
          doCopy();
        }
      });
    });

    btnRun.addEventListener('click', () => {
      const code = monacoEditor ? monacoEditor.getValue() : '';
      btnRun.disabled = true;
      btnSubmit.disabled = true;
      consoleStatusText.textContent = 'Running sample tests...';
      resultsPanel.innerHTML = '<div class="io-label">Running test suite on HackerRank remote container...</div>';
      vscode.postMessage({ command: 'runRemoteTest', code: code });
    });

    btnSubmit.addEventListener('click', () => {
      const code = monacoEditor ? monacoEditor.getValue() : '';
      btnRun.disabled = true;
      btnSubmit.disabled = true;
      consoleStatusText.textContent = 'Submitting...';
      resultsPanel.innerHTML = '<div class="io-label">Evaluating solution against hidden test cases...</div>';
      vscode.postMessage({ command: 'submitHackerRank', code: code });
    });

    btnSave.addEventListener('click', () => {
      vscode.postMessage({ command: 'saveSolution' });
    });

    langSelect.addEventListener('change', () => {
      const chosen = langSelect.value;
      vscode.postMessage({ command: 'changeLanguage', language: chosen });
    });

    function escapeHtml(str) {
      return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (!msg) return;

      switch (msg.type) {
        case 'clipboardData':
          doPaste(msg.text);
          break;

        case 'challengeLoaded':
          clearTimeout(autoSaveTimer);
          displayTitle.textContent = msg.challenge.name;
          displayDiff.textContent = msg.challenge.difficulty;
          const diffLower = String(msg.challenge.difficulty || '').toLowerCase();
          displayDiff.className = 'badge ' + (diffLower === 'easy' ? 'badge-easy' : diffLower === 'hard' ? 'badge-hard' : 'badge-medium');
          displayTrack.textContent = msg.trackSlug + ' / ' + msg.chapterSlug;
          problemStatement.innerHTML = msg.challenge.questionHtml || '';
          currentLang = msg.language;
          initialSource = msg.code || '';
          if (Array.isArray(msg.availableLanguages) && msg.availableLanguages.length > 0) {
            langSelect.innerHTML = msg.availableLanguages
              .map(l => '<option value="' + escapeHtml(l.id) + '"' + (l.id === currentLang ? ' selected' : '') + '>' + escapeHtml(l.displayName) + '</option>')
              .join('');
          }
          if (fileLabel && msg.challenge.slug) {
            fileLabel.textContent = msg.challenge.slug + (msg.fileExtension || '');
          }
          if (monacoEditor) {
            isSettingProgrammaticValue = true;
            try {
              monacoEditor.setValue(initialSource);
              monaco.editor.setModelLanguage(monacoEditor.getModel(), mapMonacoLanguage(currentLang));
            } finally {
              isSettingProgrammaticValue = false;
            }
          }
          consoleStatusText.textContent = 'Ready';
          resultsPanel.innerHTML = '<div class="io-label">Challenge loaded. Ready to write code.</div>';
          break;

        case 'languageChanged':
          clearTimeout(autoSaveTimer);
          currentLang = msg.language;
          initialSource = msg.code || '';
          if (fileLabel && msg.slug) {
            fileLabel.textContent = msg.slug + (msg.fileExtension || '');
          }
          if (monacoEditor) {
            isSettingProgrammaticValue = true;
            try {
              monacoEditor.setValue(initialSource);
              monaco.editor.setModelLanguage(monacoEditor.getModel(), mapMonacoLanguage(currentLang));
            } finally {
              isSettingProgrammaticValue = false;
            }
          }
          break;

        case 'runTestResults':
          btnRun.disabled = false;
          btnSubmit.disabled = false;
          consoleStatusText.textContent = 'Completed';
          let outHtml = '';
          const compileResult = msg.result;
          const cases = compileResult ? (compileResult.testCases || compileResult.testcaseResults || []) : [];

          if (compileResult && compileResult.compileMessage && compileResult.compileMessage.trim().length > 0) {
            outHtml += '<div class="verdict-banner verdict-fail"><span>Compiler Output: ' + escapeHtml(compileResult.compileMessage) + '</span></div>';
          }

          if (Array.isArray(cases) && cases.length > 0) {
            const allPassed = cases.every(t => t.status === 1 || t.status === 'Accepted' || t.status === 'Success' || t.message === 'Success');
            const summaryMsg = allPassed ? 'Accepted: Sample test cases passed' : 'Failed: ' + (cases.find(c => c.status !== 1 && c.status !== 'Accepted' && c.status !== 'Success')?.message || 'Wrong Answer');
            outHtml += '<div class="verdict-banner ' + (allPassed ? 'verdict-pass' : 'verdict-fail') + '">';
            outHtml += '<span>' + escapeHtml(summaryMsg) + '</span>';
            outHtml += '</div>';

            cases.forEach((t, idx) => {
              const isPass = t.status === 1 || t.status === 'Accepted' || t.status === 'Success' || t.message === 'Success';
              outHtml += '<div style="margin-top: 10px; border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 8px 12px; background: var(--bg-surface-elevated);">';
              outHtml += '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">';
              outHtml += '<span class="io-label" style="font-weight: 600; color: var(--text-main);">Test Case #' + (t.id !== undefined ? t.id : idx) + '</span>';
              outHtml += '<span class="badge ' + (isPass ? 'badge-easy' : 'badge-hard') + '">' + escapeHtml(t.message || (isPass ? 'Success' : 'Wrong Answer')) + '</span>';
              outHtml += '</div>';
              outHtml += '<div class="io-grid">';
              outHtml += '<div class="io-block"><span class="io-label">Compiler Input</span><div class="io-box">' + escapeHtml(t.stdin || t.input || '') + '</div></div>';
              outHtml += '<div class="io-block"><span class="io-label">Expected Output</span><div class="io-box">' + escapeHtml(t.expectedOutput || '') + '</div></div>';
              outHtml += '<div class="io-block" style="grid-column: span 2;"><span class="io-label">Your Output</span><div class="io-box">' + escapeHtml(t.stdout || t.output || '') + '</div></div>';
              outHtml += '</div>';
              outHtml += '</div>';
            });
          } else if (compileResult && compileResult.status === 'Error') {
            outHtml += '<div class="verdict-banner verdict-fail"><span>Error: Execution failed or encountered runtime error</span></div>';
          } else {
            outHtml += '<div class="io-box">' + escapeHtml(JSON.stringify(compileResult, null, 2)) + '</div>';
          }
          resultsPanel.innerHTML = outHtml;
          break;

        case 'submissionResults':
          btnRun.disabled = false;
          btnSubmit.disabled = false;
          consoleStatusText.textContent = 'Verdict Received';
          const verdict = msg.verdict;
          const isAccepted = verdict && verdict.status === 'Accepted';
          let vHtml = '<div class="verdict-banner ' + (isAccepted ? 'verdict-pass' : 'verdict-fail') + '">';
          vHtml += '<span>Verdict: ' + escapeHtml(verdict ? verdict.status : 'Unknown') + '</span>';
          vHtml += '</div>';
          const subCases = verdict ? (verdict.testcaseResults || verdict.testCases || []) : [];
          if (Array.isArray(subCases) && subCases.length > 0) {
            subCases.forEach((t, i) => {
              const tPass = t.status === 1 || t.status === 'Accepted' || t.status === 'Success' || t.message === 'Success';
              vHtml += '<div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid var(--border-muted);">';
              vHtml += '<span class="io-label">Test Case #' + (t.id !== undefined ? t.id : i) + ' (' + escapeHtml(t.time ? t.time + 's' : '0.0s') + ')</span>';
              vHtml += '<span class="badge ' + (tPass ? 'badge-easy' : 'badge-hard') + '">' + escapeHtml(t.message || (tPass ? 'Passed' : 'Failed')) + '</span>';
              vHtml += '</div>';
            });
          }
          resultsPanel.innerHTML = vHtml;
          break;

        case 'runTestError':
        case 'submissionError':
          btnRun.disabled = false;
          btnSubmit.disabled = false;
          consoleStatusText.textContent = 'Error';
          resultsPanel.innerHTML = '<div class="verdict-banner verdict-fail"><span>Error: ' + escapeHtml(msg.error || 'Execution failed') + '</span></div>';
          break;
      }
    });
  </script>
</body>
</html>`;
  }

  public dispose() {
    if (this.isDisposed) {
      return;
    }
    this.isDisposed = true;
    if (ProblemWebviewPanel.currentPanel === this) {
      ProblemWebviewPanel.currentPanel = undefined;
    }
    this.panel.dispose();
    while (this.disposables.length) {
      const x = this.disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }
}
