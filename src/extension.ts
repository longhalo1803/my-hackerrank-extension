import * as vscode from 'vscode';
import { AuthManager } from './modules/AuthManager';
import { HackerRankAPIClient } from './modules/HackerRankAPIClient';
import { ChallengesTreeProvider } from './modules/ChallengesTreeProvider';
import { WorkspaceScaffolder } from './modules/WorkspaceScaffolder';
import { LocalTestRunner } from './modules/LocalTestRunner';
import { GitSyncService } from './modules/GitSyncService';
import { ProblemWebviewPanel } from './views/ProblemWebviewPanel';

export function activate(context: vscode.ExtensionContext) {
  const outputChannel = vscode.window.createOutputChannel('HackerRank');
  outputChannel.appendLine('[Extension] HackerRank Native extension activated.');

  const authManager = new AuthManager(context);
  const apiClient = new HackerRankAPIClient(authManager);
  const treeProvider = new ChallengesTreeProvider(apiClient);
  const localTestRunner = new LocalTestRunner();

  const workspaceRoot =
    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
  const scaffolder = new WorkspaceScaffolder(workspaceRoot);
  const gitSyncService = new GitSyncService(workspaceRoot);

  vscode.window.registerTreeDataProvider('challengesExplorer', treeProvider);

  const signinCmd = vscode.commands.registerCommand(
    'hackerrank.signin',
    async () => {
      outputChannel.appendLine('[Auth] Initiating sign-in process...');
      const success = await authManager.loginWithGoogle();
      if (success) {
        outputChannel.appendLine('[Auth] Sign-in successful. Refreshing challenges tree.');
        treeProvider.refresh();
      } else {
        outputChannel.appendLine('[Auth] Sign-in was not completed.');
      }
    },
  );

  const signinManualCmd = vscode.commands.registerCommand(
    'hackerrank.signinManual',
    async () => {
      outputChannel.appendLine('[Auth] Initiating manual cookie sign-in...');
      const success = await authManager.loginWithManualCookie();
      if (success) {
        outputChannel.appendLine('[Auth] Manual cookie sign-in successful. Refreshing challenges tree.');
        treeProvider.refresh();
      } else {
        outputChannel.appendLine('[Auth] Manual cookie sign-in was cancelled or invalid.');
      }
    },
  );

  const checkStatusCmd = vscode.commands.registerCommand(
    'hackerrank.checkStatus',
    async () => {
      const loggedIn = await authManager.isLoggedIn();
      const session = await authManager.getSession();
      outputChannel.show(true);
      if (loggedIn) {
        const masked = session?.hackerrank_cookie
          ? session.hackerrank_cookie.substring(0, 25) + '...'
          : 'Active';
        outputChannel.appendLine(`[Status] Logged in. Session Cookie: ${masked}`);
        vscode.window.showInformationMessage(`HackerRank: Logged in (Session active)`);
      } else {
        outputChannel.appendLine('[Status] Not logged in.');
        vscode.window.showWarningMessage('HackerRank: Not logged in. Run "HackerRank: Sign In" to connect.');
      }
    },
  );

  const logoutCmd = vscode.commands.registerCommand(
    'hackerrank.logout',
    async () => {
      outputChannel.appendLine('[Auth] Logging out...');
      await authManager.logout();
      treeProvider.refresh();
    },
  );

  const refreshCmd = vscode.commands.registerCommand(
    'hackerrank.refreshChallenges',
    () => {
      treeProvider.refresh();
    },
  );

  const openChallengeCmd = vscode.commands.registerCommand(
    'hackerrank.openChallenge',
    async (trackSlug: string, chapterSlug: string, challengeSlug: string) => {
      try {
        if (!workspaceRoot) {
          vscode.window.showErrorMessage(
            'Please open a workspace folder before opening HackerRank challenges.',
          );
          return;
        }

        const challenge = await apiClient.getChallenge(challengeSlug);
        if (!challenge) {
          vscode.window.showWarningMessage(
            `Challenge "${challengeSlug}" does not support TypeScript or JavaScript.`,
          );
          return;
        }

        const scaffoldResult = await scaffolder.scaffold(
          challenge,
          trackSlug,
          chapterSlug,
        );

        // Open solution file in editor
        const doc = await vscode.workspace.openTextDocument(
          scaffoldResult.solutionPath,
        );
        await vscode.window.showTextDocument(doc, {
          viewColumn: vscode.ViewColumn.Beside,
        });

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
          gitSyncService,
        );
      } catch (err: any) {
        vscode.window.showErrorMessage(
          `Failed to open challenge: ${err.message}`,
        );
      }
    },
  );

  context.subscriptions.push(
    signinCmd,
    signinManualCmd,
    checkStatusCmd,
    logoutCmd,
    refreshCmd,
    openChallengeCmd,
    outputChannel,
    { dispose: () => authManager.dispose() },
  );
}

export function deactivate() {}
