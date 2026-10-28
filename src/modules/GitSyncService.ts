import * as vscode from "vscode";
import { execFileSync } from "child_process";
import * as path from "path";

export class GitSyncService {
  constructor(private readonly workspaceRoot: string) {}

  buildCommitMessage(
    trackSlug: string,
    challengeSlug: string,
    language: string,
  ): string {
    return `feat(${trackSlug}): solve ${challengeSlug} in ${language}`;
  }

  private isInsideGitRepo(): boolean {
    try {
      execFileSync("git", ["rev-parse", "--is-inside-work-tree"], {
        cwd: this.workspaceRoot,
        stdio: "ignore",
      });
      return true;
    } catch {
      return false;
    }
  }

  private hasRemoteOrigin(): boolean {
    try {
      const output = execFileSync("git", ["remote"], {
        cwd: this.workspaceRoot,
        encoding: "utf8",
      });
      return output.includes("origin");
    } catch {
      return false;
    }
  }

  private runGitCommand(args: string[]): string {
    return execFileSync("git", args, {
      cwd: this.workspaceRoot,
      encoding: "utf8",
    });
  }

  async syncSolution(
    trackSlug: string,
    chapterSlug: string,
    challengeSlug: string,
    language: string,
  ): Promise<boolean> {
    if (!this.workspaceRoot) {
      vscode.window.showErrorMessage(
        "No active workspace folder opened for Git sync.",
      );
      return false;
    }

    if (!this.isInsideGitRepo()) {
      vscode.window.showErrorMessage(
        'Workspace is not an initialized Git repository. Run "git init" in the workspace terminal first.',
      );
      return false;
    }

    try {
      const relPath =
        path.join("tracks", trackSlug, chapterSlug, challengeSlug) + "/";
      this.runGitCommand(["add", relPath]);

      const commitMsg = this.buildCommitMessage(
        trackSlug,
        challengeSlug,
        language,
      );
      this.runGitCommand(["commit", "-m", commitMsg]);

      if (this.hasRemoteOrigin()) {
        this.runGitCommand(["push", "origin", "HEAD"]);
        vscode.window.showInformationMessage(
          `Committed and pushed solution: "${commitMsg}"`,
        );
      } else {
        vscode.window.showInformationMessage(
          `Committed solution locally: "${commitMsg}" (No origin remote configured)`,
        );
      }

      return true;
    } catch (err: any) {
      vscode.window.showErrorMessage(`Git sync failed: ${err.message}`);
      return false;
    }
  }
}
