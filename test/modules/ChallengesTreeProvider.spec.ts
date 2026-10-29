import * as vscode from 'vscode';
import {
  ChallengesTreeProvider,
  ChallengeTreeItem,
} from '../../src/modules/ChallengesTreeProvider';
import { HackerRankAPIClient } from '../../src/modules/HackerRankAPIClient';

describe('ChallengesTreeProvider', () => {
  let mockApiClient: jest.Mocked<HackerRankAPIClient>;
  let treeProvider: ChallengesTreeProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    mockApiClient = {
      getTracks: jest
        .fn()
        .mockResolvedValue([
          { id: 1, name: 'Algorithms', slug: 'algorithms', description: '' },
        ]),
      getChapters: jest.fn().mockResolvedValue(['warmup', 'strings']),
      getChallenges: jest.fn().mockResolvedValue([
        {
          id: 101,
          slug: 'simple-array-sum',
          name: 'Simple Array Sum',
          difficulty: 'Easy',
          description: '',
        },
      ]),
    } as unknown as jest.Mocked<HackerRankAPIClient>;

    treeProvider = new ChallengesTreeProvider(mockApiClient);
  });

  it('returns tracks at root level', async () => {
    const rootItems = await treeProvider.getChildren();
    expect(rootItems.length).toBe(1);
    expect(rootItems[0].label).toBe('Algorithms');
    expect(rootItems[0].type).toBe('track');
    expect(rootItems[0].collapsibleState).toBe(
      vscode.TreeItemCollapsibleState.Collapsed,
    );
  });

  it('returns chapters under a track item', async () => {
    const trackItem = new ChallengeTreeItem(
      'Algorithms',
      'track',
      'algorithms',
    );
    const chapterItems = await treeProvider.getChildren(trackItem);

    expect(chapterItems.length).toBe(2);
    expect(chapterItems[0].label).toBe('warmup');
    expect(chapterItems[0].type).toBe('chapter');
    expect(chapterItems[0].trackSlug).toBe('algorithms');
    expect(chapterItems[0].chapterSlug).toBe('warmup');
  });

  it('returns challenges under a chapter item with command binding', async () => {
    const chapterItem = new ChallengeTreeItem(
      'warmup',
      'chapter',
      'algorithms',
      'warmup',
    );
    const challengeItems = await treeProvider.getChildren(chapterItem);

    expect(challengeItems.length).toBe(1);
    expect(challengeItems[0].label).toBe('Simple Array Sum');
    expect(challengeItems[0].type).toBe('challenge');
    expect(challengeItems[0].command).toBeDefined();
    expect(challengeItems[0].command?.command).toBe('hackerrank.openChallenge');
  });

  it('renders checkmark icon and tooltip for solved challenges and circle for unsolved', () => {
    const solvedItem = new ChallengeTreeItem(
      'Solved Problem',
      'challenge',
      'algorithms',
      'warmup',
      'solved-prob',
      'Easy',
      true,
    );
    expect((solvedItem.iconPath as any)?.id).toBe('pass-filled');
    expect(solvedItem.tooltip).toContain('Solved ✓');

    const unsolvedItem = new ChallengeTreeItem(
      'Unsolved Problem',
      'challenge',
      'algorithms',
      'warmup',
      'unsolved-prob',
      'Hard',
      false,
    );
    expect((unsolvedItem.iconPath as any)?.id).toBe('circle-outline');
    expect(unsolvedItem.tooltip).toContain('Unsolved');
  });
});
