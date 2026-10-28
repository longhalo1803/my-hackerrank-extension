import * as vscode from 'vscode';
import { AuthManager } from './modules/AuthManager';
import { HackerRankAPIClient } from './modules/HackerRankAPIClient';
import { ChallengesTreeProvider } from './modules/ChallengesTreeProvider';
import { WorkspaceScaffolder } from './modules/WorkspaceScaffolder';
import { LocalTestRunner } from './modules/LocalTestRunner';
import { GitSyncService } from './modules/GitSyncService';
import { ProblemWebviewPanel } from './views/ProblemWebviewPanel';

export function activate(context: vscode.ExtensionContext) {
  const authManager = new AuthManager(context);
  const apiClient = new HackerRankAPIClient(authManager);
  const treeProvider = new ChallengesTreeProvider(apiClient);
  const localTestRunner = new LocalTestRunner();

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
  const scaffolder = new WorkspaceScaffolder(workspaceRoot);
  const gitSyncService = new GitSyncService(workspaceRoot);

  vscode.window.registerTreeDataProvider('challengesExplorer', treeProvider);

  const signinCmd = vscode.commands.registerCommand('hackerrank.signin', async () => {
    const success = await authManager.loginWithGoogle();
    if (success) {
      treeProvider.refresh();
    }
  });

  const logoutCmd = vscode.commands.registerCommand('hackerrank.logout', async () => {
    await authManager.logout();
    treeProvider.refresh();
  });

  const refreshCmd = vscode.commands.registerCommand('hackerrank.refreshChallenges', () => {
    treeProvider.refresh();
  });

  const openChallengeCmd = vscode.commands.registerCommand(
    'hackerrank.openChallenge',
    async (trackSlug: string, chapterSlug: string, challengeSlug: string) => {
      try {
        if (!workspaceRoot) {
          vscode.window.showErrorMessage('Please open a workspace folder before opening HackerRank challenges.');
          return;
        }

        const challenge = await apiClient.getChallenge(challengeSlug);
        if (!challenge) {
          vscode.window.showWarningMessage(`Challenge "${challengeSlug}" does not support TypeScript or JavaScript.`);
          return;
        }

        const scaffoldResult = await scaffolder.scaffold(challenge, trackSlug, chapterSlug);

        // Open solution file in editor
        const doc = await vscode.workspace.openTextDocument(scaffoldResult.solutionPath);
        await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside });

        // Open Webview panel with problem description and action buttons
        ProblemWebviewPanel.render(
          context.extensionUri,
          challenge,
          trackSlug,
          chapterSlug,
          scaffoldResult.targetDir,
          scaffoldResult.solutionPath,
          scaffoldResult.language,
          localTestRunner,
          apiClient,
          gitSyncService
        );
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to open challenge: ${err.message}`);
      }
    }
  );

  context.subscriptions.push(
    signinCmd,
    logoutCmd,
    refreshCmd,
    openChallengeCmd,
    { dispose: () => authManager.dispose() }
  );
}

export function deactivate() {}
