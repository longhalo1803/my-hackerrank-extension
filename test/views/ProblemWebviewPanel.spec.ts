import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ProblemWebviewPanel } from '../../src/views/ProblemWebviewPanel';
import { IChallenge } from '../../src/types/hackerrank';
import { HackerRankAPIClient } from '../../src/modules/HackerRankAPIClient';
import { SolutionManager } from '../../src/modules/SolutionManager';

describe('ProblemWebviewPanel: Single-Window Hallmark Workbench', () => {
  const extensionUri = vscode.Uri.file('/mock/extension');
  const tempDir = path.join(__dirname, '..', 'temp-webview-test');
  let mockApiClient: jest.Mocked<HackerRankAPIClient>;
  let solutionManager: SolutionManager;
  let mockWebview: any;
  let mockPanel: any;
  let messageHandler: ((msg: any) => Promise<void>) | undefined;

  const mockChallengeA: IChallenge = {
    id: 101,
    name: 'Solve Me First',
    slug: 'solve-me-first',
    trackSlug: 'algorithms',
    difficulty: 'Easy',
    languages: ['python3', 'javascript'],
    description: 'Solve me first challenge description',
    questionHtml: '<p>Compute the sum of two integers.</p>',
    languagesBoilerplate: {
      python3: 'def solveMeFirst(a,b):\n    return a+b\n',
    },
    sampleTestCases: [],
  };

  const mockChallengeB: IChallenge = {
    id: 102,
    name: 'Simple Array Sum',
    slug: 'simple-array-sum',
    trackSlug: 'algorithms',
    difficulty: 'Easy',
    languages: ['python3'],
    description: 'Simple array sum challenge description',
    questionHtml: '<p>Sum an array of integers.</p>',
    languagesBoilerplate: {
      python3: 'def simpleArraySum(ar):\n    return sum(ar)\n',
    },
    sampleTestCases: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    solutionManager = new SolutionManager(tempDir);
    mockApiClient = {
      compileTests: jest.fn(),
      pollCompileTest: jest.fn(),
      submitCode: jest.fn(),
      pollSubmission: jest.fn(),
    } as any;

    mockWebview = {
      html: '',
      cspSource: 'vscode-webview-resource:',
      asWebviewUri: jest.fn((uri) => uri),
      postMessage: jest.fn(),
      onDidReceiveMessage: jest.fn((handler: any) => {
        messageHandler = handler;
        return { dispose: jest.fn() };
      }),
    };

    mockPanel = {
      webview: mockWebview,
      reveal: jest.fn(),
      dispose: jest.fn(),
      onDidDispose: jest.fn(),
    };

    (vscode.window.createWebviewPanel as jest.Mock).mockReturnValue(mockPanel);
    ProblemWebviewPanel.currentPanel = undefined;
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('renders in ViewColumn.One and injects Hallmark design tokens & Monaco container', () => {
    const solutionPath = solutionManager.prepareSolutionFile(
      mockChallengeA,
      'algorithms',
      'python3',
    );

    const panel = ProblemWebviewPanel.render(
      extensionUri,
      mockChallengeA,
      'algorithms',
      'warmup',
      solutionPath,
      'python3',
      mockApiClient,
      solutionManager,
    );

    expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
      'hackerrank.workbench',
      'HackerRank: Solve Me First',
      vscode.ViewColumn.One,
      expect.objectContaining({
        enableScripts: true,
      }),
    );

    const html = mockWebview.html;
    expect(html).toContain('Hallmark · v2.0.0');
    expect(html).toContain('--bg-canvas');
    expect(html).toContain('--border-subtle');
    expect(html).toContain('id="monaco-editor-container"');
    expect(html).toContain('id="test-console"');
    expect(html).toContain('vs/loader.js');
    expect(panel).toBeDefined();
  });

  it('safely escapes script breakout tags in initialCode', () => {
    const maliciousCode = 'const x = "</script><script>alert(1)</script>";';
    const maliciousChallenge: IChallenge = {
      ...mockChallengeA,
      slug: 'script-escape-test',
      languagesBoilerplate: {
        python3: maliciousCode,
      },
    };
    const solutionPath = solutionManager.prepareSolutionFile(
      maliciousChallenge,
      'algorithms',
      'python3',
    );

    ProblemWebviewPanel.render(
      extensionUri,
      maliciousChallenge,
      'algorithms',
      'warmup',
      solutionPath,
      'python3',
      mockApiClient,
      solutionManager,
    );

    const html = mockWebview.html;
    expect(html).not.toContain('let initialSource = "const x = \\"</script>');
    expect(html).toContain('\\u003c/script');
  });

  it('supports in-place challenge swapping via loadChallenge without creating new panels', () => {
    const solutionPathA = solutionManager.prepareSolutionFile(
      mockChallengeA,
      'algorithms',
      'python3',
    );
    const panel = ProblemWebviewPanel.render(
      extensionUri,
      mockChallengeA,
      'algorithms',
      'warmup',
      solutionPathA,
      'python3',
      mockApiClient,
      solutionManager,
    );

    expect(vscode.window.createWebviewPanel).toHaveBeenCalledTimes(1);

    const solutionPathB = solutionManager.prepareSolutionFile(
      mockChallengeB,
      'algorithms',
      'python3',
    );

    // Call loadChallenge to switch to Challenge B
    (panel as any).loadChallenge(
      mockChallengeB,
      'algorithms',
      'warmup',
      solutionPathB,
      'python3',
    );

    // No new panel created, panel is revealed and message is posted to Monaco
    expect(vscode.window.createWebviewPanel).toHaveBeenCalledTimes(1);
    expect(mockPanel.reveal).toHaveBeenCalled();
    expect(mockWebview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'challengeLoaded',
        challenge: expect.objectContaining({ slug: 'simple-array-sum' }),
      }),
    );
  });

  it('auto-saves code from Monaco on receiving autoSaveCode message', async () => {
    const solutionPath = solutionManager.prepareSolutionFile(
      mockChallengeA,
      'algorithms',
      'python3',
    );

    ProblemWebviewPanel.render(
      extensionUri,
      mockChallengeA,
      'algorithms',
      'warmup',
      solutionPath,
      'python3',
      mockApiClient,
      solutionManager,
    );

    expect(messageHandler).toBeDefined();
    const updatedCode = 'def solveMeFirst(a, b):\n    return a + b\n';

    await messageHandler!({
      command: 'autoSaveCode',
      code: updatedCode,
    });

    const savedOnDisk = fs.readFileSync(solutionPath, 'utf8');
    expect(savedOnDisk).toBe(updatedCode);
  });

  it('handles readClipboard and writeClipboard bridge messages', async () => {
    const solutionPath = solutionManager.prepareSolutionFile(
      mockChallengeA,
      'algorithms',
      'python3',
    );

    ProblemWebviewPanel.render(
      extensionUri,
      mockChallengeA,
      'algorithms',
      'warmup',
      solutionPath,
      'python3',
      mockApiClient,
      solutionManager,
    );

    expect(messageHandler).toBeDefined();

    // writeClipboard
    await messageHandler!({
      command: 'writeClipboard',
      text: 'SELECT * FROM city;',
    });
    expect(vscode.env.clipboard.writeText).toHaveBeenCalledWith('SELECT * FROM city;');

    // readClipboard
    (vscode.env.clipboard.readText as jest.Mock).mockResolvedValueOnce('Pasted code string');
    await messageHandler!({
      command: 'readClipboard',
    });
    expect(vscode.env.clipboard.readText).toHaveBeenCalled();
    expect(mockWebview.postMessage).toHaveBeenCalledWith({
      type: 'clipboardData',
      text: 'Pasted code string',
    });
  });

  it('handles runRemoteTest and posts runTestResults with standardized payload', async () => {
    const solutionPath = solutionManager.prepareSolutionFile(
      mockChallengeA,
      'algorithms',
      'python3',
    );

    ProblemWebviewPanel.render(
      extensionUri,
      mockChallengeA,
      'algorithms',
      'warmup',
      solutionPath,
      'python3',
      mockApiClient,
      solutionManager,
    );

    const mockRunResult = {
      id: 2059635015,
      status: 'Complete',
      testCases: [
        {
          id: 0,
          status: 0,
          message: 'Wrong Answer',
          stdin: '4\n73\n67\n38\n33',
          stdout: '75\n',
          expectedOutput: '75\n67\n40\n33',
        },
      ],
    };

    mockApiClient.compileTests.mockResolvedValueOnce(2059635015);
    mockApiClient.pollCompileTest.mockResolvedValueOnce(mockRunResult as any);

    await messageHandler!({
      command: 'runRemoteTest',
      code: 'def solveMeFirst(a, b):\n    return a + b\n',
    });

    expect(mockApiClient.compileTests).toHaveBeenCalledWith(
      'solve-me-first',
      expect.objectContaining({
        language: 'python3',
        code: 'def solveMeFirst(a, b):\n    return a + b\n',
      }),
    );
    expect(mockApiClient.pollCompileTest).toHaveBeenCalledWith(
      'solve-me-first',
      2059635015,
    );
    expect(mockWebview.postMessage).toHaveBeenCalledWith({
      type: 'runTestResults',
      result: mockRunResult,
    });
  });

  it('handles submitHackerRank and posts submissionResults', async () => {
    const solutionPath = solutionManager.prepareSolutionFile(
      mockChallengeA,
      'algorithms',
      'python3',
    );

    ProblemWebviewPanel.render(
      extensionUri,
      mockChallengeA,
      'algorithms',
      'warmup',
      solutionPath,
      'python3',
      mockApiClient,
      solutionManager,
    );

    const mockSubmissionResult = {
      id: 998877,
      status: 'Complete',
      verdict: 'Accepted',
      score: 10,
      testcaseResults: [
        {
          id: 0,
          status: 'Accepted',
          message: 'Success',
          score: 10,
        },
      ],
    };

    mockApiClient.submitCode.mockResolvedValueOnce(998877);
    mockApiClient.pollSubmission.mockResolvedValueOnce(mockSubmissionResult as any);

    await messageHandler!({
      command: 'submitHackerRank',
      code: 'def solveMeFirst(a, b):\n    return a + b\n',
    });

    expect(mockApiClient.submitCode).toHaveBeenCalledWith(
      'solve-me-first',
      expect.objectContaining({
        language: 'python3',
      }),
    );
    expect(mockApiClient.pollSubmission).toHaveBeenCalledWith(
      'solve-me-first',
      998877,
    );
    expect(mockWebview.postMessage).toHaveBeenCalledWith({
      type: 'submissionResults',
      verdict: mockSubmissionResult,
    });
  });
});
