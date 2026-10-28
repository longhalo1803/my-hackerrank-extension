import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { LocalTestRunner } from '../../src/modules/LocalTestRunner';

describe('LocalTestRunner', () => {
  let tempDir: string;
  let runner: LocalTestRunner;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hr-runner-test-'));
    runner = new LocalTestRunner();

    // Create tests directory
    fs.mkdirSync(path.join(tempDir, 'tests'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('runs JavaScript solution successfully against sample testcase', async () => {
    // Write solution.js reading from stdin and printing to stdout
    const solutionCode = `
      const fs = require('fs');
      const input = fs.readFileSync(0, 'utf-8').trim();
      const nums = input.split(/\\s+/).map(Number);
      const sum = nums.reduce((a, b) => a + b, 0);
      console.log(sum);
    `;
    fs.writeFileSync(path.join(tempDir, 'solution.js'), solutionCode);
    fs.writeFileSync(path.join(tempDir, 'tests', 'input_0.txt'), '10 20 30\n');
    fs.writeFileSync(path.join(tempDir, 'tests', 'output_0.txt'), '60\n');

    const results = await runner.runAll(tempDir, 'javascript');
    expect(results.length).toBe(1);
    expect(results[0].passed).toBe(true);
    expect(results[0].actual).toBe('60');
    expect(results[0].expected).toBe('60');
  });

  it('handles OUTPUT_PATH environment variable file output', async () => {
    // Write solution.js writing to process.env.OUTPUT_PATH
    const solutionCode = `
      const fs = require('fs');
      const outputPath = process.env.OUTPUT_PATH;
      fs.writeFileSync(outputPath, 'HELLO_HACKERRANK\\n');
    `;
    fs.writeFileSync(path.join(tempDir, 'solution.js'), solutionCode);
    fs.writeFileSync(path.join(tempDir, 'tests', 'input_0.txt'), '');
    fs.writeFileSync(path.join(tempDir, 'tests', 'output_0.txt'), 'HELLO_HACKERRANK');

    const results = await runner.runAll(tempDir, 'javascript');
    expect(results.length).toBe(1);
    expect(results[0].passed).toBe(true);
    expect(results[0].actual).toBe('HELLO_HACKERRANK');
  });

  it('detects test failure and provides expected vs actual diff', async () => {
    const solutionCode = `console.log('wrong output');`;
    fs.writeFileSync(path.join(tempDir, 'solution.js'), solutionCode);
    fs.writeFileSync(path.join(tempDir, 'tests', 'input_0.txt'), '');
    fs.writeFileSync(path.join(tempDir, 'tests', 'output_0.txt'), 'correct output');

    const results = await runner.runAll(tempDir, 'javascript');
    expect(results.length).toBe(1);
    expect(results[0].passed).toBe(false);
    expect(results[0].actual).toBe('wrong output');
    expect(results[0].expected).toBe('correct output');
  });

  it('terminates hanging process on timeout', async () => {
    const infiniteLoopCode = `while(true) {}`;
    fs.writeFileSync(path.join(tempDir, 'solution.js'), infiniteLoopCode);
    fs.writeFileSync(path.join(tempDir, 'tests', 'input_0.txt'), '');
    fs.writeFileSync(path.join(tempDir, 'tests', 'output_0.txt'), 'done');

    // Run with 500ms timeout for test speed
    const results = await runner.runAll(tempDir, 'javascript', 500);
    expect(results.length).toBe(1);
    expect(results[0].passed).toBe(false);
    expect(results[0].stderr).toContain('timed out');
  });
});
