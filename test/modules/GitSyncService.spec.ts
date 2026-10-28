import * as vscode from 'vscode';
import { GitSyncService } from '../../src/modules/GitSyncService';

describe('GitSyncService', () => {
  let gitSyncService: GitSyncService;

  beforeEach(() => {
    jest.clearAllMocks();
    gitSyncService = new GitSyncService('/test/workspace');
  });

  it('generates the standardized commit message format', () => {
    const message = gitSyncService.buildCommitMessage('algorithms', 'simple-array-sum', 'typescript');
    expect(message).toBe('feat(algorithms): solve simple-array-sum in typescript');
  });

  it('rejects sync when workspace is not inside a git repository', async () => {
    // Mock execSync failure for git rev-parse
    jest.spyOn(gitSyncService as any, 'isInsideGitRepo').mockReturnValue(false);

    const success = await gitSyncService.syncSolution('algorithms', 'warmup', 'simple-array-sum', 'typescript');
    expect(success).toBe(false);
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('not an initialized Git repository')
    );
  });

  it('stages, commits and pushes when repository is valid', async () => {
    jest.spyOn(gitSyncService as any, 'isInsideGitRepo').mockReturnValue(true);
    const execMock = jest.spyOn(gitSyncService as any, 'runGitCommand').mockReturnValue('');
    jest.spyOn(gitSyncService as any, 'hasRemoteOrigin').mockReturnValue(true);

    const success = await gitSyncService.syncSolution('algorithms', 'warmup', 'simple-array-sum', 'typescript');
    expect(success).toBe(true);

    // Verify git add
    expect(execMock).toHaveBeenCalledWith(['add', 'tracks/algorithms/warmup/simple-array-sum/']);
    // Verify git commit
    expect(execMock).toHaveBeenCalledWith([
      'commit',
      '-m',
      'feat(algorithms): solve simple-array-sum in typescript'
    ]);
    // Verify git push
    expect(execMock).toHaveBeenCalledWith(['push', 'origin', 'HEAD']);
  });
});
