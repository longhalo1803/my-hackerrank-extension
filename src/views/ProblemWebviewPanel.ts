import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { IChallenge, ISolution } from '../types/hackerrank';
import { LocalTestRunner } from '../modules/LocalTestRunner';
import { HackerRankAPIClient } from '../modules/HackerRankAPIClient';
import { GitSyncService } from '../modules/GitSyncService';

export class ProblemWebviewPanel {
  public static currentPanels: Map<string, ProblemWebviewPanel> = new Map();
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly extensionUri: vscode.Uri,
    private readonly challenge: IChallenge,
    private readonly trackSlug: string,
    private readonly chapterSlug: string,
    private readonly challengeDir: string,
    private readonly solutionPath: string,
    private readonly language: 'typescript' | 'javascript',
    private readonly testRunner: LocalTestRunner,
    private readonly apiClient: HackerRankAPIClient,
    private readonly gitSyncService: GitSyncService
  ) {
    this.panel = panel;
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.html = this.getHtmlForWebview();

    this.panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'runLocalTests':
            await this.handleRunLocalTests();
            break;
          case 'submitHackerRank':
            await this.handleSubmitHackerRank();
            break;
          case 'commitGit':
            await this.handleCommitGit();
            break;
        }
      },
      null,
      this.disposables
    );
  }

  public static render(
    extensionUri: vscode.Uri,
    challenge: IChallenge,
    trackSlug: string,
    chapterSlug: string,
    challengeDir: string,
    solutionPath: string,
    language: 'typescript' | 'javascript',
    testRunner: LocalTestRunner,
    apiClient: HackerRankAPIClient,
    gitSyncService: GitSyncService
  ): ProblemWebviewPanel {
    const existing = ProblemWebviewPanel.currentPanels.get(challenge.slug);
    if (existing) {
      existing.panel.reveal(vscode.ViewColumn.One);
      return existing;
    }

    const panel = vscode.window.createWebviewPanel(
      `hackerrank.${challenge.slug}`,
      challenge.name,
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.file(path.join(extensionUri.fsPath, 'node_modules', 'katex', 'dist')),
          vscode.Uri.file(path.join(extensionUri.fsPath, 'media'))
        ]
      }
    );

    const problemPanel = new ProblemWebviewPanel(
      panel,
      extensionUri,
      challenge,
      trackSlug,
      chapterSlug,
      challengeDir,
      solutionPath,
      language,
      testRunner,
      apiClient,
      gitSyncService
    );

    ProblemWebviewPanel.currentPanels.set(challenge.slug, problemPanel);
    return problemPanel;
  }

  private async handleRunLocalTests(): Promise<void> {
    this.panel.webview.postMessage({ type: 'localTestRunning' });
    try {
      const results = await this.testRunner.runAll(this.challengeDir, this.language);
      this.panel.webview.postMessage({
        type: 'localTestResults',
        results
      });
    } catch (err: any) {
      this.panel.webview.postMessage({
        type: 'localTestError',
        error: err.message
      });
    }
  }

  private async handleSubmitHackerRank(): Promise<void> {
    this.panel.webview.postMessage({ type: 'submissionRunning' });
    try {
      let code = '';
      if (fs.existsSync(this.solutionPath)) {
        code = fs.readFileSync(this.solutionPath, 'utf8');
      } else {
        throw new Error(`Solution file not found at ${this.solutionPath}`);
      }

      const solution: ISolution = {
        code,
        language: this.language
      };

      const submissionId = await this.apiClient.submitCode(this.challenge.slug, solution);
      const verdict = await this.apiClient.pollSubmission(this.challenge.slug, submissionId);

      this.panel.webview.postMessage({
        type: 'submissionResults',
        verdict
      });

      if (verdict.status === 'Accepted') {
        this.panel.webview.postMessage({ type: 'enableGitSync' });
      }
    } catch (err: any) {
      this.panel.webview.postMessage({
        type: 'submissionError',
        error: err.message
      });
    }
  }

  private async handleCommitGit(): Promise<void> {
    await this.gitSyncService.syncSolution(
      this.trackSlug,
      this.chapterSlug,
      this.challenge.slug,
      this.language
    );
  }

  private getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  private getHtmlForWebview(): string {
    const nonce = this.getNonce();
    const katexCssUri = this.panel.webview.asWebviewUri(
      vscode.Uri.file(path.join(this.extensionUri.fsPath, 'node_modules', 'katex', 'dist', 'katex.min.css'))
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this.panel.webview.cspSource} 'unsafe-inline'; font-src ${this.panel.webview.cspSource}; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${katexCssUri}">
  <style>
    body { font-family: var(--vscode-font-family); padding: 1.5rem; color: var(--vscode-foreground); background-color: var(--vscode-editor-background); line-height: 1.6; }
    .header { margin-bottom: 1.5rem; border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 1rem; }
    .title { font-size: 1.6rem; margin: 0 0 0.5rem 0; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 0.8rem; background-color: var(--vscode-badge-background); color: var(--vscode-badge-foreground); margin-right: 8px; }
    .actions { display: flex; gap: 10px; margin: 1.5rem 0; }
    button { padding: 8px 16px; border: none; border-radius: 4px; font-weight: 600; cursor: pointer; color: var(--vscode-button-foreground); background-color: var(--vscode-button-background); }
    button:hover { background-color: var(--vscode-button-hoverBackground); }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    .section-title { font-size: 1.2rem; font-weight: 600; margin-top: 1.5rem; margin-bottom: 0.5rem; }
    .panel-box { border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 1rem; margin-top: 1rem; }
    .pass { color: #4ec9b0; font-weight: bold; }
    .fail { color: #f14c4c; font-weight: bold; }
  </style>
</head>
<body>
  <div class="header">
    <h1 class="title">${this.challenge.name}</h1>
    <div>
      <span class="badge">${this.challenge.difficulty}</span>
      <span class="badge">${this.trackSlug} / ${this.chapterSlug}</span>
      <span class="badge">Language: ${this.language}</span>
    </div>
  </div>

  <div class="actions">
    <button id="btn-run">▶ Run Local Tests</button>
    <button id="btn-submit">⬆ Submit to HackerRank</button>
    <button id="btn-git" disabled>✔ Commit & Push to GitHub</button>
  </div>

  <div id="status-panel"></div>
  <div id="results-panel"></div>

  <div class="problem-statement">
    ${this.challenge.questionHtml}
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const btnRun = document.getElementById('btn-run');
    const btnSubmit = document.getElementById('btn-submit');
    const btnGit = document.getElementById('btn-git');
    const statusPanel = document.getElementById('status-panel');
    const resultsPanel = document.getElementById('results-panel');

    btnRun.addEventListener('click', () => {
      statusPanel.innerHTML = '<p>Running local tests...</p>';
      resultsPanel.innerHTML = '';
      vscode.postMessage({ command: 'runLocalTests' });
    });

    btnSubmit.addEventListener('click', () => {
      statusPanel.innerHTML = '<p>Submitting to HackerRank and polling verdict...</p>';
      resultsPanel.innerHTML = '';
      vscode.postMessage({ command: 'submitHackerRank' });
    });

    btnGit.addEventListener('click', () => {
      statusPanel.innerHTML = '<p>Staging, committing, and pushing to GitHub...</p>';
      vscode.postMessage({ command: 'commitGit' });
    });

    window.addEventListener('message', (event) => {
      const msg = event.data;
      switch (msg.type) {
        case 'localTestResults':
          statusPanel.innerHTML = '';
          let html = '<div class="panel-box"><div class="section-title">Local Test Results</div>';
          msg.results.forEach((r) => {
            const statusClass = r.passed ? 'pass' : 'fail';
            const statusText = r.passed ? 'PASSED' : 'FAILED';
            html += '<p>Testcase #' + r.testcaseId + ': <span class="' + statusClass + '">' + statusText + '</span> (' + r.durationMs + 'ms)</p>';
            if (!r.passed) {
              html += '<pre>Expected:\\n' + r.expected + '\\nActual:\\n' + r.actual + (r.stderr ? '\\nError:\\n' + r.stderr : '') + '</pre>';
            }
          });
          html += '</div>';
          resultsPanel.innerHTML = html;
          break;

        case 'submissionResults':
          statusPanel.innerHTML = '';
          const isAccepted = msg.verdict.status === 'Accepted';
          const vClass = isAccepted ? 'pass' : 'fail';
          let vHtml = '<div class="panel-box"><div class="section-title">Submission Verdict: <span class="' + vClass + '">' + msg.verdict.status + '</span></div>';
          if (msg.verdict.testcaseResults) {
            msg.verdict.testcaseResults.forEach((t) => {
              vHtml += '<p>Testcase #' + t.id + ': ' + t.message + ' (' + t.time + 's)</p>';
            });
          }
          vHtml += '</div>';
          resultsPanel.innerHTML = vHtml;
          break;

        case 'enableGitSync':
          btnGit.removeAttribute('disabled');
          break;

        case 'localTestError':
        case 'submissionError':
          statusPanel.innerHTML = '<p class="fail">Error: ' + (msg.error || 'Unknown failure') + '</p>';
          break;
      }
    });
  </script>
</body>
</html>`;
  }

  public dispose() {
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
