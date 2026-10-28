import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn } from 'child_process';
import { IRunResult } from '../types/hackerrank';

export class LocalTestRunner {
  private normalizeOutput(str: string): string {
    return str
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map((line) => line.trimEnd())
      .join('\n')
      .trim();
  }

  async runSingle(
    challengeDir: string,
    language: 'typescript' | 'javascript',
    testcaseId: number,
    timeoutMs = 5000,
  ): Promise<IRunResult> {
    const testsDir = path.join(challengeDir, 'tests');
    const inputPath = path.join(testsDir, `input_${testcaseId}.txt`);
    const outputPath = path.join(testsDir, `output_${testcaseId}.txt`);

    const inputData = fs.existsSync(inputPath)
      ? fs.readFileSync(inputPath, 'utf8')
      : '';
    const expectedOutput = fs.existsSync(outputPath)
      ? this.normalizeOutput(fs.readFileSync(outputPath, 'utf8'))
      : '';

    const tempOutputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hr-out-'));
    const tempOutputFile = path.join(tempOutputDir, 'output.txt');

    const env = {
      ...process.env,
      OUTPUT_PATH: tempOutputFile,
    };

    const isTS = language === 'typescript';
    const command = isTS ? 'npx' : process.execPath;
    const args = isTS ? ['tsx', 'solution.ts'] : ['solution.js'];

    const startTime = Date.now();

    return new Promise<IRunResult>((resolve) => {
      let stdout = '';
      let stderr = '';
      let isTimedOut = false;

      const child = spawn(command, args, {
        cwd: challengeDir,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const timer = setTimeout(() => {
        isTimedOut = true;
        child.kill('SIGKILL');
      }, timeoutMs);

      if (child.stdin) {
        child.stdin.write(inputData);
        child.stdin.end();
      }

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        try {
          fs.rmSync(tempOutputDir, { recursive: true, force: true });
        } catch {}
        resolve({
          passed: false,
          testcaseId,
          expected: expectedOutput,
          actual: '',
          durationMs: Date.now() - startTime,
          stderr: `Process launch failed: ${err.message}`,
        });
      });

      child.on('close', (_code) => {
        clearTimeout(timer);
        const durationMs = Date.now() - startTime;

        let actual = '';
        if (fs.existsSync(tempOutputFile)) {
          const fileContent = fs.readFileSync(tempOutputFile, 'utf8');
          actual =
            fileContent.length > 0
              ? this.normalizeOutput(fileContent)
              : this.normalizeOutput(stdout);
        } else {
          actual = this.normalizeOutput(stdout);
        }

        try {
          fs.rmSync(tempOutputDir, { recursive: true, force: true });
        } catch {}

        if (isTimedOut) {
          resolve({
            passed: false,
            testcaseId,
            expected: expectedOutput,
            actual,
            durationMs,
            stderr: `Execution timed out (${timeoutMs}ms limit)`,
          });
          return;
        }

        const passed = actual === expectedOutput;

        resolve({
          passed,
          testcaseId,
          expected: expectedOutput,
          actual,
          durationMs,
          stderr: stderr.trim(),
        });
      });
    });
  }

  async runAll(
    challengeDir: string,
    language: 'typescript' | 'javascript',
    timeoutMs = 5000,
  ): Promise<IRunResult[]> {
    const testsDir = path.join(challengeDir, 'tests');
    if (!fs.existsSync(testsDir)) {
      return [];
    }

    const testFiles = fs.readdirSync(testsDir);
    const inputFiles = testFiles
      .filter((f) => f.startsWith('input_') && f.endsWith('.txt'))
      .sort((a, b) => {
        const idA = parseInt(a.replace('input_', '').replace('.txt', ''), 10);
        const idB = parseInt(b.replace('input_', '').replace('.txt', ''), 10);
        return idA - idB;
      });

    const results: IRunResult[] = [];

    for (const file of inputFiles) {
      const id = parseInt(file.replace('input_', '').replace('.txt', ''), 10);
      const res = await this.runSingle(challengeDir, language, id, timeoutMs);
      results.push(res);
    }

    return results;
  }
}
