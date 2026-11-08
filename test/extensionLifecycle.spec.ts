import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { activate } from '../src/extension';
import { ProblemWebviewPanel } from '../src/views/ProblemWebviewPanel';

describe('Extension Lifecycle: Single-Window Challenge Navigation', () => {
  let registeredCommands: Map<string, (...args: any[]) => any>;
  let subscriptions: any[];
  let tempStorageDir: string;

  const mockChallengeA = {
    id: 1,
    name: 'Solve Me First',
    slug: 'solve-me-first',
    trackSlug: 'algorithms',
    difficulty: 'Easy',
    languages: ['python3'],
    questionHtml: '<p>Problem A</p>',
    description: 'Problem A',
    languagesBoilerplate: {},
    sampleTestCases: [],
  };

  const mockChallengeB = {
    id: 2,
    name: 'Simple Array Sum',
    slug: 'simple-array-sum',
    trackSlug: 'algorithms',
    difficulty: 'Easy',
    languages: ['python3'],
    questionHtml: '<p>Problem B</p>',
    description: 'Problem B',
    languagesBoilerplate: {},
    sampleTestCases: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    registeredCommands = new Map();
    subscriptions = [];
    (ProblemWebviewPanel as any).currentPanel = undefined;

    tempStorageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hr-ext-test-'));

    (vscode.commands.registerCommand as jest.Mock).mockImplementation(
      (cmd: string, handler: (...args: any[]) => any) => {
        registeredCommands.set(cmd, handler);
        return { dispose: jest.fn() };
      },
    );

    const context = {
      subscriptions,
      extensionUri: { fsPath: '/test/extension' },
      globalStorageUri: { fsPath: tempStorageDir },
      globalState: {
        get: jest.fn(),
        update: jest.fn(),
      },
      secrets: {
        get: jest.fn(),
        store: jest.fn(),
        delete: jest.fn(),
      },
    } as unknown as vscode.ExtensionContext;

    activate(context);
  });

  afterEach(() => {
    if (tempStorageDir && fs.existsSync(tempStorageDir)) {
      fs.rmSync(tempStorageDir, { recursive: true, force: true });
    }
  });

  it('never calls showTextDocument when opening a challenge', async () => {
    const renderSpy = jest
      .spyOn(ProblemWebviewPanel, 'render')
      .mockReturnValue({
        loadChallenge: jest.fn(),
      } as any);

    // Mock API client fetching challenge
    const openChallengeHandler = registeredCommands.get(
      'hackerrank.openChallenge',
    );
    expect(openChallengeHandler).toBeDefined();

    // Trigger open challenge command
    // Note: Since HackerRankAPIClient is instantiated inside activate, we can mock via proto or spy
    const HackerRankAPIClient =
      require('../src/modules/HackerRankAPIClient').HackerRankAPIClient;
    jest
      .spyOn(HackerRankAPIClient.prototype, 'getChallenge')
      .mockResolvedValue(mockChallengeA);

    await openChallengeHandler!('algorithms', 'warmup', 'solve-me-first');

    // ASSERT: Neither openTextDocument nor showTextDocument were called!
    expect(vscode.window.showTextDocument).not.toHaveBeenCalled();
    expect(vscode.workspace.openTextDocument).not.toHaveBeenCalled();

    // ASSERT: Single-window ProblemWebviewPanel was rendered
    expect(renderSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ slug: 'solve-me-first' }),
      'algorithms',
      'warmup',
      expect.any(String),
      'python3',
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it('reuses active webview panel when switching to another problem', async () => {
    const mockLoadChallenge = jest.fn();
    const existingPanel = {
      loadChallenge: mockLoadChallenge,
    } as any;

    // Set active panel
    (ProblemWebviewPanel as any).currentPanel = existingPanel;

    const HackerRankAPIClient =
      require('../src/modules/HackerRankAPIClient').HackerRankAPIClient;
    jest
      .spyOn(HackerRankAPIClient.prototype, 'getChallenge')
      .mockResolvedValue(mockChallengeB);

    const openChallengeHandler = registeredCommands.get(
      'hackerrank.openChallenge',
    );
    await openChallengeHandler!('algorithms', 'warmup', 'simple-array-sum');

    // Should load in-place on existingPanel instead of creating a second panel or opening a tab
    expect(vscode.window.showTextDocument).not.toHaveBeenCalled();
    expect(mockLoadChallenge).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'simple-array-sum' }),
      'algorithms',
      'warmup',
      expect.any(String),
      'python3',
    );
  });
});
