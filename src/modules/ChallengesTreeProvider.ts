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
  ) {
    const collapsible =
      type === 'challenge'
        ? vscode.TreeItemCollapsibleState.None
        : vscode.TreeItemCollapsibleState.Collapsed;

    super(label, collapsible);

    if (type === 'challenge') {
      this.contextValue = 'challenge';
      this.description = difficulty || '';
      this.command = {
        command: 'hackerrank.openChallenge',
        title: 'Open Challenge',
        arguments: [trackSlug, chapterSlug, challengeSlug],
      };
    } else if (type === 'chapter') {
      this.contextValue = 'chapter';
    } else {
      this.contextValue = 'track';
    }
  }
}

export class ChallengesTreeProvider implements vscode.TreeDataProvider<ChallengeTreeItem> {
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
