import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import { SolutionManager } from '../../src/modules/SolutionManager';
import { IChallenge } from '../../src/types/hackerrank';

describe('SolutionManager', () => {
  let tempStorageRoot: string;
  let solutionManager: SolutionManager;

  const sampleChallenge: IChallenge = {
    id: 101,
    slug: 'simple-array-sum',
    name: 'Simple Array Sum',
    languages: ['typescript', 'python3'],
    difficulty: 'Easy',
    description: 'Sum an array',
    questionHtml: '<p>Sum</p>',
    languagesBoilerplate: {
      typescript_template_head: 'import * as fs from "fs";',
      typescript_template: 'function simpleArraySum() {}',
      typescript_template_tail: 'main();',
    },
    sampleTestCases: [],
  };

  beforeEach(() => {
    tempStorageRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'hr-test-storage-'),
    );
    solutionManager = new SolutionManager(tempStorageRoot);
  });

  afterEach(() => {
    try {
      fs.rmSync(tempStorageRoot, { recursive: true, force: true });
    } catch {
      // ignore cleanup
    }
  });

  it('generates secure directory structure preventing path traversal', () => {
    const dir = solutionManager.getSolutionsDir('algorithms');
    expect(fs.existsSync(dir)).toBe(true);
    expect(dir.startsWith(tempStorageRoot)).toBe(true);

    expect(() => solutionManager.getSolutionsDir('../malicious')).toThrow(
      'Security Violation',
    );
    expect(() =>
      solutionManager.getSolutionPath('algorithms', '../../hack', 'typescript'),
    ).toThrow('Security Violation');
  });

  it('assembles normalized boilerplate with clean delimiters', () => {
    const code = solutionManager.assembleBoilerplate(
      sampleChallenge,
      'typescript',
    );
    expect(code).toContain(
      'import * as fs from "fs";\n\nfunction simpleArraySum() {}\n\nmain();\n',
    );
  });

  it('scaffolds solution file once and reuses existing without overwrite', () => {
    const filePath = solutionManager.prepareSolutionFile(
      sampleChallenge,
      'algorithms',
      'typescript',
    );
    expect(fs.existsSync(filePath)).toBe(true);

    // Modify file
    fs.writeFileSync(filePath, '// user custom edit', 'utf8');

    // Re-call prepareSolutionFile
    const filePath2 = solutionManager.prepareSolutionFile(
      sampleChallenge,
      'algorithms',
      'typescript',
    );
    expect(filePath2).toBe(filePath);
    expect(fs.readFileSync(filePath2, 'utf8')).toBe('// user custom edit');
  });

  it('exports solution via vscode showSaveDialog', async () => {
    const solutionPath = solutionManager.prepareSolutionFile(
      sampleChallenge,
      'algorithms',
      'typescript',
    );
    const exportTarget = path.join(tempStorageRoot, 'exported-solution.ts');

    (vscode.window.showSaveDialog as jest.Mock).mockResolvedValueOnce({
      fsPath: exportTarget,
    });

    const success = await solutionManager.exportSolution(
      solutionPath,
      'simple-array-sum.ts',
    );
    expect(success).toBe(true);
    expect(fs.existsSync(exportTarget)).toBe(true);
    expect(vscode.window.showInformationMessage).toHaveBeenCalled();
  });

  it('rejects path traversal or malicious character in langId', () => {
    expect(() =>
      solutionManager.getSolutionPath('algorithms', 'simple-sum', '../ts'),
    ).toThrow('Security Violation: Invalid language id');
    expect(() =>
      solutionManager.getSolutionPath('algorithms', 'simple-sum', 'lang/path'),
    ).toThrow('Security Violation: Invalid language id');
  });

  it('returns false when exporting non-existent solution file', async () => {
    const success = await solutionManager.exportSolution(
      '/path/does/not/exist.ts',
      'fallback.ts',
    );
    expect(success).toBe(false);
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('Solution file not found'),
    );
  });

  it('returns false when user cancels save dialog', async () => {
    const solutionPath = solutionManager.prepareSolutionFile(
      sampleChallenge,
      'algorithms',
      'typescript',
    );
    (vscode.window.showSaveDialog as jest.Mock).mockResolvedValueOnce(
      undefined,
    );

    const success = await solutionManager.exportSolution(
      solutionPath,
      'simple-array-sum.ts',
    );
    expect(success).toBe(false);
  });
});
