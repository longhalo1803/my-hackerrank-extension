import * as vscode from 'vscode';
import { HackerRankAPIClient } from './HackerRankAPIClient';

export type TreeItemType = 'track' | 'chapter' | 'challenge';

export class ChallengeTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly type: TreeItemType,
    public readonly trackSlug?: string,
    public readonly chapterSlug?: string,
    public readonly challengeSlug?: string,
    public readonly difficulty?: string,
    public readonly solved?: boolean,
  ) {
    const collapsible =
      type === 'challenge'
        ? vscode.TreeItemCollapsibleState.None
        : vscode.TreeItemCollapsibleState.Collapsed;

    super(label, collapsible);

    if (type === 'challenge') {
      this.contextValue = 'challenge';
      this.description = difficulty || '';
      if (solved) {
        this.iconPath = new vscode.ThemeIcon(
          'pass-filled',
          new vscode.ThemeColor('testing.iconPassed'),
        );
        this.tooltip = `${label} (${difficulty || 'Medium'}) - Solved ✓`;
      } else {
        this.iconPath = new vscode.ThemeIcon('circle-outline');
        this.tooltip = `${label} (${difficulty || 'Medium'}) - Unsolved`;
      }
      this.command = {
        command: 'hackerrank.openChallenge',
        title: 'Open Challenge',
        arguments: [trackSlug, chapterSlug, challengeSlug],
      };
    } else if (type === 'chapter') {
      this.contextValue = 'chapter';
      this.iconPath = new vscode.ThemeIcon('folder');
    } else {
      this.contextValue = 'track';
      this.iconPath = new vscode.ThemeIcon('repo');
    }
  }
}

export class ChallengesTreeProvider
  implements vscode.TreeDataProvider<ChallengeTreeItem>, vscode.Disposable
{
  private _onDidChangeTreeData: vscode.EventEmitter<
    ChallengeTreeItem | undefined | null | void
  > = new vscode.EventEmitter<ChallengeTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<
    ChallengeTreeItem | undefined | null | void
  > = this._onDidChangeTreeData.event;

  constructor(private readonly apiClient: HackerRankAPIClient) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }

  getTreeItem(element: ChallengeTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: ChallengeTreeItem): Promise<ChallengeTreeItem[]> {
    try {
      if (!element) {
        // Root: Tracks
        const tracks = await this.apiClient.getTracks();
        return tracks.map(
          (t) => new ChallengeTreeItem(t.name, 'track', t.slug),
        );
      }

      if (element.type === 'track' && element.trackSlug) {
        // Chapters
        const chapters = await this.apiClient.getChapters(element.trackSlug);
        return chapters.map(
          (c) => new ChallengeTreeItem(c, 'chapter', element.trackSlug, c),
        );
      }

      if (
        element.type === 'chapter' &&
        element.trackSlug &&
        element.chapterSlug
      ) {
        // Challenges
        const challenges = await this.apiClient.getChallenges(
          element.trackSlug,
          element.chapterSlug,
        );
        return challenges.map(
          (ch) =>
            new ChallengeTreeItem(
              ch.name,
              'challenge',
              element.trackSlug,
              element.chapterSlug,
              ch.slug,
              ch.difficulty,
              ch.solved,
            ),
        );
      }

      return [];
    } catch (err: any) {
      vscode.window.showErrorMessage(
        `Failed to load HackerRank challenges: ${err.message}`,
      );
      return [];
    }
  }
}
