import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { IChallenge, ISolution } from '../types/hackerrank';
import { HackerRankAPIClient } from '../modules/HackerRankAPIClient';
import { SolutionManager } from '../modules/SolutionManager';
import { LanguageRegistry } from '../modules/LanguageRegistry';

export class ProblemWebviewPanel {
  public static currentPanels: Map<string, ProblemWebviewPanel> = new Map();
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];
  private currentLanguage: string;
  private currentSolutionPath: string;
  private isDisposed = false;

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly extensionUri: vscode.Uri,
    private readonly challenge: IChallenge,
    private readonly trackSlug: string,
    private readonly chapterSlug: string,
    solutionPath: string,
    language: string,
    private readonly apiClient: HackerRankAPIClient,
    private readonly solutionManager: SolutionManager,
    private readonly globalState?: vscode.Memento,
  ) {
    this.panel = panel;
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
          case 'changeLanguage':
            await this.handleChangeLanguage();
            break;
          case 'runRemoteTest':
            await this.handleRunRemoteTest();
            break;
          case 'submitHackerRank':
            await this.handleSubmitHackerRank();
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
    const existing = ProblemWebviewPanel.currentPanels.get(challenge.slug);
    if (existing) {
      existing.currentLanguage = language;
      existing.currentSolutionPath = solutionPath;
      existing.panel.webview.html = existing.getHtmlForWebview();
      existing.panel.reveal(vscode.ViewColumn.Beside);
      return existing;
    }

    const panel = vscode.window.createWebviewPanel(
      `hackerrank.${challenge.slug}`,
      challenge.name,
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.file(
            path.join(extensionUri.fsPath, 'node_modules', 'katex', 'dist'),
          ),
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

    ProblemWebviewPanel.currentPanels.set(challenge.slug, problemPanel);
    return problemPanel;
  }

  private async handleChangeLanguage(): Promise<void> {
    const availableLangs = LanguageRegistry.getSupportedForChallenge(
      this.challenge.languages,
    );
    // Pin current language first
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

    const newLangId = picked.langId;
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

    // Update Webview header
    this.panel.webview.html = this.getHtmlForWebview();

    // Reveal new solution document in editor
    const doc = await vscode.workspace.openTextDocument(
      this.currentSolutionPath,
    );
    await vscode.window.showTextDocument(doc, {
      viewColumn: vscode.ViewColumn.One,
    });
  }

  private async getActiveCode(): Promise<string> {
    const openDoc = vscode.workspace.textDocuments.find(
      (d) => d.uri.fsPath === this.currentSolutionPath,
    );
    if (openDoc) {
      if (openDoc.isDirty) {
        try {
          await openDoc.save();
        } catch (err: any) {
          console.warn(
            '[ProblemWebviewPanel] Auto-save before run/submit failed:',
            err?.message,
          );
        }
      }
      return openDoc.getText();
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

  private async handleRunRemoteTest(): Promise<void> {
    if (this.isDisposed) return;
    this.panel.webview.postMessage({ type: 'runTesting' });
    try {
      const code = await this.getActiveCode();
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

  private async handleSubmitHackerRank(): Promise<void> {
    if (this.isDisposed) return;
    this.panel.webview.postMessage({ type: 'submissionRunning' });
    try {
      const code = await this.getActiveCode();
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
      .replace(/\s*on\w+\s*=\s*[^>\s]+/gi, '')
      .replace(
        /\b(id|name)\s*=\s*["'](?:btn-run|btn-submit|btn-lang|btn-save|status-panel|results-panel)["']/gi,
        '',
      );
  }

  private getHtmlForWebview(): string {
    const nonce = this.getNonce();
    const langInfo = LanguageRegistry.get(this.currentLanguage);
    const katexCssUri = this.panel.webview.asWebviewUri(
      vscode.Uri.file(
        path.join(
          this.extensionUri.fsPath,
          'node_modules',
          'katex',
          'dist',
          'katex.min.css',
        ),
      ),
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this.panel.webview.cspSource} 'unsafe-inline'; font-src ${this.panel.webview.cspSource}; img-src https: data:; base-uri 'none'; form-action 'none'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${katexCssUri}">
  <style>
    body { font-family: var(--vscode-font-family); padding: 1.5rem; color: var(--vscode-foreground); background-color: var(--vscode-editor-background); line-height: 1.6; }
    .header { margin-bottom: 1.5rem; border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 1rem; }
    .title { font-size: 1.6rem; margin: 0 0 0.5rem 0; }
    .meta-bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 0.5rem; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 0.8rem; background-color: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
    .badge-easy { background-color: #2ec866; color: #fff; }
    .badge-medium { background-color: #ffc01e; color: #000; }
    .badge-hard { background-color: #ff375f; color: #fff; }
    .actions { display: flex; gap: 10px; margin: 1.5rem 0; flex-wrap: wrap; }
    button { padding: 8px 16px; border: none; border-radius: 4px; font-weight: 600; cursor: pointer; color: var(--vscode-button-foreground); background-color: var(--vscode-button-background); }
    button:hover { background-color: var(--vscode-button-hoverBackground); }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-secondary { background-color: var(--vscode-button-secondaryBackground, #3a3d41); color: var(--vscode-button-secondaryForeground, #fff); }
    .btn-secondary:hover { background-color: var(--vscode-button-secondaryHoverBackground, #45494e); }
    .section-title { font-size: 1.2rem; font-weight: 600; margin-top: 1.5rem; margin-bottom: 0.5rem; }
    .panel-box { border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 1rem; margin-top: 1rem; background-color: var(--vscode-editor-inactiveSelectionBackground); }
    .pass { color: #4ec9b0; font-weight: bold; }
    .fail { color: #f14c4c; font-weight: bold; }
    pre { background: var(--vscode-textCodeBlock-background); padding: 8px; border-radius: 4px; overflow-x: auto; font-family: var(--vscode-editor-font-family); }
  </style>
</head>
<body>
  <div class="header">
    <h1 class="title">${this.escapeHtml(this.challenge.name)}</h1>
    <div class="meta-bar">
      <span class="badge ${this.challenge.difficulty.toLowerCase() === 'easy' ? 'badge-easy' : this.challenge.difficulty.toLowerCase() === 'hard' ? 'badge-hard' : 'badge-medium'}">${this.escapeHtml(this.challenge.difficulty)}</span>
      <span class="badge">${this.escapeHtml(this.trackSlug)} / ${this.escapeHtml(this.chapterSlug)}</span>
      <span class="badge">Language: ${this.escapeHtml(langInfo.displayName)}</span>
    </div>
  </div>

  <div class="actions">
    <button id="btn-run">▶ Run Code</button>
    <button id="btn-submit">⬆ Submit Solution</button>
    <button id="btn-lang" class="btn-secondary">⚙ Change Language</button>
    <button id="btn-save" class="btn-secondary">💾 Save Solution...</button>
  </div>

  <div id="status-panel"></div>
  <div id="results-panel"></div>

  <div class="problem-statement">
    ${this.sanitizeQuestionHtml(this.challenge.questionHtml)}
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const btnRun = document.getElementById('btn-run');
    const btnSubmit = document.getElementById('btn-submit');
    const btnLang = document.getElementById('btn-lang');
    const btnSave = document.getElementById('btn-save');
    const statusPanel = document.getElementById('status-panel');
    const resultsPanel = document.getElementById('results-panel');

    function setButtonsDisabled(disabled) {
      btnRun.disabled = disabled;
      btnSubmit.disabled = disabled;
      btnLang.disabled = disabled;
    }

    function escapeHtml(str) {
      return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    btnRun.addEventListener('click', () => {
      setButtonsDisabled(true);
      statusPanel.innerHTML = '<p>Running sample tests on HackerRank cloud...</p>';
      resultsPanel.innerHTML = '';
      vscode.postMessage({ command: 'runRemoteTest' });
    });

    btnSubmit.addEventListener('click', () => {
      setButtonsDisabled(true);
      statusPanel.innerHTML = '<p>Submitting to official judge and polling verdict...</p>';
      resultsPanel.innerHTML = '';
      vscode.postMessage({ command: 'submitHackerRank' });
    });

    btnLang.addEventListener('click', () => {
      vscode.postMessage({ command: 'changeLanguage' });
    });

    btnSave.addEventListener('click', () => {
      vscode.postMessage({ command: 'saveSolution' });
    });

    window.addEventListener('message', (event) => {
      const msg = event.data;
      switch (msg.type) {
        case 'runTestResults':
          setButtonsDisabled(false);
          statusPanel.innerHTML = '';
          const res = msg.result;
          let html = '<div class="panel-box">';
          if (res.compileMessage) {
            html += '<div class="section-title fail">Compilation / Runtime Error</div>';
            html += '<pre>' + escapeHtml(res.compileMessage) + '</pre>';
          } else {
            html += '<div class="section-title">Sample Test Results</div>';
            res.testCases.forEach((t) => {
              const isPass = t.status === 1 || t.message === 'Success';
              const sClass = isPass ? 'pass' : 'fail';
              const sText = isPass ? 'PASSED' : 'FAILED';
              html += '<p>Test Case #' + escapeHtml(t.id) + ': <span class="' + sClass + '">' + sText + '</span> (' + escapeHtml(t.message) + ')</p>';
              if (!isPass) {
                html += '<pre>Input:\\n' + escapeHtml(t.stdin) + '\\nYour Output:\\n' + escapeHtml(t.stdout) + '\\nExpected:\\n' + escapeHtml(t.expectedOutput) + '</pre>';
              }
            });
          }
          html += '</div>';
          resultsPanel.innerHTML = html;
          break;

        case 'submissionResults':
          setButtonsDisabled(false);
          statusPanel.innerHTML = '';
          const isAccepted = msg.verdict.status === 'Accepted';
          const vClass = isAccepted ? 'pass' : 'fail';
          let vHtml = '<div class="panel-box"><div class="section-title">Submission Verdict: <span class="' + vClass + '">' + escapeHtml(msg.verdict.status) + '</span></div>';
          if (msg.verdict.testcaseResults) {
            msg.verdict.testcaseResults.forEach((t) => {
              vHtml += '<p>Test Case #' + escapeHtml(t.id) + ': ' + escapeHtml(t.message) + ' (' + escapeHtml(t.time) + 's)</p>';
            });
          }
          vHtml += '</div>';
          resultsPanel.innerHTML = vHtml;
          break;

        case 'runTestError':
        case 'submissionError':
          setButtonsDisabled(false);
          statusPanel.innerHTML = '<p class="fail">Error: ' + escapeHtml(msg.error || 'Unknown failure') + '</p>';
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
    ProblemWebviewPanel.currentPanels.delete(this.challenge.slug);
    this.panel.dispose();
    while (this.disposables.length) {
      const x = this.disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }
}
