import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { WorkspaceScaffolder } from '../../src/modules/WorkspaceScaffolder';
import { IChallenge } from '../../src/types/hackerrank';

describe('WorkspaceScaffolder', () => {
  let tempDir: string;
  let scaffolder: WorkspaceScaffolder;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hr-scaffolder-test-'));
    scaffolder = new WorkspaceScaffolder(tempDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const mockChallenge: IChallenge = {
    id: 10,
    slug: 'simple-array-sum',
    name: 'Simple Array Sum',
    languages: ['typescript', 'javascript'],
    difficulty: 'Easy',
    description: 'Sum an array of integers',
    questionHtml:
      '<h1>Simple Array Sum</h1><p>Given an array of integers, find the sum.</p>',
    languagesBoilerplate: {
      typescript_template_head: 'import * as fs from "fs";\n',
      typescript_template:
        'function simpleArraySum(ar: number[]): number {\n  return 0;\n}\n',
      typescript_template_tail: 'console.log(simpleArraySum([1, 2, 3]));\n',
    },
    sampleTestCases: [
      { id: 0, input: '6\n1 2 3 4 10 11', output: '31' },
      { id: 1, input: '3\n5 10 15', output: '30' },
    ],
  };

  it('scaffolds solution.ts with concatenated boilerplate and testcases', async () => {
    const result = await scaffolder.scaffold(
      mockChallenge,
      'algorithms',
      'warmup',
    );

    expect(result.language).toBe('typescript');
    expect(result.solutionPath).toContain('solution.ts');
    expect(fs.existsSync(result.solutionPath)).toBe(true);

    const solutionContent = fs.readFileSync(result.solutionPath, 'utf8');
    expect(solutionContent).toContain('import * as fs from "fs";');
    expect(solutionContent).toContain('function simpleArraySum');
    expect(solutionContent).toContain('console.log(simpleArraySum');

    // Verify problem.md created via Turndown
    expect(fs.existsSync(result.problemPath)).toBe(true);
    const problemMd = fs.readFileSync(result.problemPath, 'utf8');
    expect(problemMd).toContain('# Simple Array Sum');

    // Verify dynamic testcases
    const test0In = path.join(result.targetDir, 'tests', 'input_0.txt');
    const test0Out = path.join(result.targetDir, 'tests', 'output_0.txt');
    const test1In = path.join(result.targetDir, 'tests', 'input_1.txt');
    const test1Out = path.join(result.targetDir, 'tests', 'output_1.txt');

    expect(fs.readFileSync(test0In, 'utf8')).toBe('6\n1 2 3 4 10 11');
    expect(fs.readFileSync(test0Out, 'utf8')).toBe('31');
    expect(fs.readFileSync(test1In, 'utf8')).toBe('3\n5 10 15');
    expect(fs.readFileSync(test1Out, 'utf8')).toBe('30');
  });

  it('protects existing solution from being overwritten', async () => {
    // First scaffold
    const firstResult = await scaffolder.scaffold(
      mockChallenge,
      'algorithms',
      'warmup',
    );
    fs.writeFileSync(firstResult.solutionPath, '// USER WORK IN PROGRESS');

    // Second scaffold of same problem
    const secondResult = await scaffolder.scaffold(
      mockChallenge,
      'algorithms',
      'warmup',
    );
    const solutionContent = fs.readFileSync(secondResult.solutionPath, 'utf8');

    expect(solutionContent).toBe('// USER WORK IN PROGRESS');
  });

  it('falls back to JavaScript when TypeScript is not supported', async () => {
    const jsOnlyChallenge: IChallenge = {
      ...mockChallenge,
      slug: 'js-only-task',
      languages: ['javascript'],
      languagesBoilerplate: {
        javascript_template: 'function solve() { return 42; }\n',
      },
    };

    const result = await scaffolder.scaffold(
      jsOnlyChallenge,
      'algorithms',
      'warmup',
    );
    expect(result.language).toBe('javascript');
    expect(result.solutionPath).toContain('solution.js');
    expect(fs.existsSync(result.solutionPath)).toBe(true);
  });
});
