import * as vscode from 'vscode';
import { AuthManager } from './modules/AuthManager';
import { HackerRankAPIClient } from './modules/HackerRankAPIClient';
import { ChallengesTreeProvider } from './modules/ChallengesTreeProvider';
import { SolutionManager } from './modules/SolutionManager';
import { ProblemWebviewPanel } from './views/ProblemWebviewPanel';

export function activate(context: vscode.ExtensionContext) {
  const outputChannel = vscode.window.createOutputChannel('HackerRank');
  outputChannel.appendLine(
    '[Extension] HackerRank Native extension activated.',
  );

  const authManager = new AuthManager(context);
  const apiClient = new HackerRankAPIClient(authManager);
  const treeProvider = new ChallengesTreeProvider(apiClient);

  // Cross-platform sandbox storage (never touches workspace folder)
  const storageRoot = context.globalStorageUri.fsPath;
  const solutionManager = new SolutionManager(storageRoot);

  vscode.window.registerTreeDataProvider('challengesExplorer', treeProvider);

  // Startup session verification (non-blocking)
  void (async () => {
    try {
      const session = await authManager.getSession();
      if (!session?.hackerrank_cookie) {
        return;
      }

      outputChannel.appendLine('[Auth] Validating startup session...');
      const user = await authManager.getCurrentUser();
      if (user) {
        outputChannel.appendLine(
          `[Auth] Active session verified: ${user.username}.`,
        );
        treeProvider.refresh();
      } else {
        outputChannel.appendLine(
          '[Auth] Saved session has expired or is invalid.',
        );
        const choice = await vscode.window.showWarningMessage(
          'HackerRank: Session cookie is expired or invalid. Please sign in again.',
          'Sign In with Cookie',
        );
        if (choice === 'Sign In with Cookie') {
          await vscode.commands.executeCommand('hackerrank.signin');
        }
      }
    } catch (err: any) {
      outputChannel.appendLine(
        `[Auth] Startup session check error: ${err.message}`,
      );
    }
  })();

  const signinCmd = vscode.commands.registerCommand(
    'hackerrank.signin',
    async () => {
      try {
        outputChannel.appendLine('[Auth] Initiating cookie sign-in...');
        const success = await authManager.loginWithCookie();
        if (success) {
          outputChannel.appendLine(
            '[Auth] Cookie sign-in successful. Refreshing challenges tree.',
          );
          treeProvider.refresh();
        } else {
          outputChannel.appendLine('[Auth] Cookie sign-in was not completed.');
        }
      } catch (err: any) {
        outputChannel.appendLine(`[Auth] Sign-in error: ${err.message}`);
        vscode.window.showErrorMessage(`Sign-in error: ${err.message}`);
      }
    },
  );

  const checkStatusCmd = vscode.commands.registerCommand(
    'hackerrank.checkStatus',
    async () => {
      try {
        outputChannel.show(true);
        outputChannel.appendLine(
          '[Status] Checking HackerRank session status...',
        );
        const user = await authManager.getCurrentUser();
        if (user) {
          outputChannel.appendLine(
            `[Status] Active session verified: Logged in as ${user.username} (ID: ${user.id}).`,
          );
          vscode.window.showInformationMessage(
            `HackerRank: Logged in as ${user.username}`,
          );
        } else {
          const hasLocalSession = await authManager.isLoggedIn();
          if (hasLocalSession) {
            outputChannel.appendLine(
              '[Status] Local session cookie exists but HackerRank reported unauthenticated (expired or invalid).',
            );
            vscode.window.showWarningMessage(
              'HackerRank: Session cookie is expired or invalid. Please sign in again.',
            );
          } else {
            outputChannel.appendLine('[Status] Not logged in.');
            vscode.window.showWarningMessage(
              'HackerRank: Not logged in. Run "HackerRank: Sign In with Cookie" to connect.',
            );
          }
        }
      } catch (err: any) {
        outputChannel.appendLine(
          `[Status] Error checking status: ${err.message}`,
        );
        vscode.window.showErrorMessage(
          `Error checking login status: ${err.message}`,
        );
      }
    },
  );

  const logoutCmd = vscode.commands.registerCommand(
    'hackerrank.logout',
    async () => {
      try {
        outputChannel.appendLine('[Auth] Logging out...');
        await authManager.logout();
        treeProvider.refresh();
      } catch (err: any) {
        outputChannel.appendLine(`[Auth] Logout error: ${err.message}`);
        vscode.window.showErrorMessage(`Logout error: ${err.message}`);
      }
    },
  );

  const refreshCmd = vscode.commands.registerCommand(
    'hackerrank.refreshChallenges',
    () => {
      try {
        treeProvider.refresh();
      } catch (err: any) {
        outputChannel.appendLine(`[Tree] Refresh error: ${err.message}`);
      }
    },
  );

  const openChallengeCmd = vscode.commands.registerCommand(
    'hackerrank.openChallenge',
    async (trackSlug: string, chapterSlug: string, challengeSlug: string) => {
      try {
        const challenge = await apiClient.getChallenge(challengeSlug);
        if (!challenge) {
          vscode.window.showWarningMessage(
            `Could not load details for challenge "${challengeSlug}".`,
          );
          return;
        }

        // Determine default language: use lastUsedLanguage if supported, otherwise challenge's primary language
        const lastLanguage = context.globalState.get<string>(
          'hackerrank.lastUsedLanguage',
        );
        const defaultLang =
          lastLanguage && challenge.languages.includes(lastLanguage)
            ? lastLanguage
            : challenge.languages[0] || 'typescript';

        // Prepare solution file in global extension storage
        const solutionPath = solutionManager.prepareSolutionFile(
          challenge,
          trackSlug,
          defaultLang,
        );

        // Open solution file in primary editor
        const doc = await vscode.workspace.openTextDocument(solutionPath);
        await vscode.window.showTextDocument(doc, {
          viewColumn: vscode.ViewColumn.One,
        });

        // Open Webview panel with problem description and action controls side-by-side
        ProblemWebviewPanel.render(
          context.extensionUri,
          challenge,
          trackSlug,
          chapterSlug,
          solutionPath,
          defaultLang,
          apiClient,
          solutionManager,
          context.globalState,
        );
      } catch (err: any) {
        outputChannel.appendLine(
          `[Error] Failed to open challenge "${challengeSlug}": ${err.message}`,
        );
        vscode.window.showErrorMessage(
          `Failed to open challenge: ${err.message}`,
        );
      }
    },
  );

  context.subscriptions.push(
    signinCmd,
    checkStatusCmd,
    logoutCmd,
    refreshCmd,
    openChallengeCmd,
    outputChannel,
    treeProvider,
    { dispose: () => authManager.dispose() },
  );
}

export function deactivate() {}
