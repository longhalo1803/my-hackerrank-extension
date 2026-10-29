import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import { IChallenge } from '../types/hackerrank';
import { LanguageRegistry } from './LanguageRegistry';

export class SolutionManager {
  private static readonly SLUG_REGEX = /^[a-zA-Z0-9_-]+$/;

  constructor(private readonly storageRoot: string) {}

  public getSolutionsDir(trackSlug: string): string {
    if (!SolutionManager.SLUG_REGEX.test(trackSlug)) {
      throw new Error(`Security Violation: Invalid track slug "${trackSlug}".`);
    }

    const dir = path.resolve(this.storageRoot, 'solutions', trackSlug);
    if (!dir.startsWith(path.resolve(this.storageRoot) + path.sep)) {
      throw new Error(
        'Security Violation: Path traversal detected in solutions directory.',
      );
    }

    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  public getSolutionPath(
    trackSlug: string,
    challengeSlug: string,
    langId: string,
  ): string {
    if (!SolutionManager.SLUG_REGEX.test(challengeSlug)) {
      throw new Error(
        `Security Violation: Invalid challenge slug "${challengeSlug}".`,
      );
    }
    if (!SolutionManager.SLUG_REGEX.test(langId)) {
      throw new Error(`Security Violation: Invalid language id "${langId}".`);
    }

    const lang = LanguageRegistry.get(langId);
    const dir = this.getSolutionsDir(trackSlug);
    const filename = `${challengeSlug}-${lang.id}${lang.extension}`;
    const solutionPath = path.resolve(dir, filename);

    if (!solutionPath.startsWith(dir + path.sep)) {
      throw new Error(
        'Security Violation: Path traversal detected in solution filename.',
      );
    }

    return solutionPath;
  }

  public assembleBoilerplate(challenge: IChallenge, langId: string): string {
    const head =
      challenge.languagesBoilerplate[`${langId}_template_head`] || '';
    const body = challenge.languagesBoilerplate[`${langId}_template`] || '';
    const tail =
      challenge.languagesBoilerplate[`${langId}_template_tail`] || '';

    const parts = [head.trimEnd(), body.trim(), tail.trimStart()].filter(
      (p) => p.length > 0,
    );
    if (parts.length > 0) {
      return parts.join('\n\n') + '\n';
    }

    return LanguageRegistry.getFallbackBoilerplate(langId);
  }

  public prepareSolutionFile(
    challenge: IChallenge,
    trackSlug: string,
    langId: string,
  ): string {
    const solutionPath = this.getSolutionPath(
      trackSlug,
      challenge.slug,
      langId,
    );

    if (!fs.existsSync(solutionPath)) {
      const code = this.assembleBoilerplate(challenge, langId);
      fs.writeFileSync(solutionPath, code, 'utf8');
    }

    return solutionPath;
  }

  public async exportSolution(
    currentSolutionPath: string,
    suggestedName: string,
  ): Promise<boolean> {
    if (!fs.existsSync(currentSolutionPath)) {
      vscode.window.showErrorMessage(
        `Solution file not found at ${currentSolutionPath}`,
      );
      return false;
    }

    const defaultDir =
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || os.homedir();
    const targetUri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(path.join(defaultDir, suggestedName)),
      saveLabel: 'Save Solution',
      title: 'Export HackerRank Solution',
    });

    if (targetUri) {
      try {
        await fs.promises.copyFile(currentSolutionPath, targetUri.fsPath);
        vscode.window.showInformationMessage(
          `Solution successfully saved to: ${targetUri.fsPath}`,
        );
        return true;
      } catch (err: any) {
        vscode.window.showErrorMessage(
          `Failed to export solution: ${err.message}`,
        );
        return false;
      }
    }

    return false;
  }
}
