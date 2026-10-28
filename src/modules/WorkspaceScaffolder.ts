import * as fs from 'fs';
import * as path from 'path';
import TurndownService from 'turndown';
import { IChallenge } from '../types/hackerrank';

export interface IScaffoldResult {
  targetDir: string;
  solutionPath: string;
  problemPath: string;
  language: 'typescript' | 'javascript';
}

export class WorkspaceScaffolder {
  private readonly turndownService: TurndownService;

  constructor(private readonly workspaceRoot: string) {
    this.turndownService = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
    });
  }

  async scaffold(
    challenge: IChallenge,
    trackSlug: string,
    chapterSlug: string,
  ): Promise<IScaffoldResult> {
    const isTS = challenge.languages.includes('typescript');
    const isJS = challenge.languages.includes('javascript');

    if (!isTS && !isJS) {
      throw new Error(
        `Challenge ${challenge.slug} does not support TypeScript or JavaScript.`,
      );
    }

    const language: 'typescript' | 'javascript' = isTS
      ? 'typescript'
      : 'javascript';
    const filename = isTS ? 'solution.ts' : 'solution.js';

    const targetDir = path.join(
      this.workspaceRoot,
      'tracks',
      trackSlug,
      chapterSlug,
      challenge.slug,
    );
    fs.mkdirSync(targetDir, { recursive: true });

    const solutionPath = path.join(targetDir, filename);

    // Overwrite protection: preserve existing user edits
    if (!fs.existsSync(solutionPath)) {
      const head =
        challenge.languagesBoilerplate[`${language}_template_head`] || '';
      const body = challenge.languagesBoilerplate[`${language}_template`] || '';
      const tail =
        challenge.languagesBoilerplate[`${language}_template_tail`] || '';

      const boilerplate = `${head}${body}${tail}`;
      fs.writeFileSync(solutionPath, boilerplate, 'utf8');
    }

    // Convert question HTML to problem.md
    const problemPath = path.join(targetDir, 'problem.md');
    const problemMarkdown = this.turndownService.turndown(
      challenge.questionHtml || '',
    );
    fs.writeFileSync(problemPath, problemMarkdown, 'utf8');

    // Scaffold sample testcases
    const testsDir = path.join(targetDir, 'tests');
    fs.mkdirSync(testsDir, { recursive: true });

    if (challenge.sampleTestCases && challenge.sampleTestCases.length > 0) {
      challenge.sampleTestCases.forEach((tc, idx) => {
        fs.writeFileSync(
          path.join(testsDir, `input_${idx}.txt`),
          tc.input,
          'utf8',
        );
        fs.writeFileSync(
          path.join(testsDir, `output_${idx}.txt`),
          tc.output,
          'utf8',
        );
      });
    } else {
      // Default placeholder if none provided
      const defaultIn = path.join(testsDir, 'input_0.txt');
      const defaultOut = path.join(testsDir, 'output_0.txt');
      if (!fs.existsSync(defaultIn)) {
        fs.writeFileSync(defaultIn, '', 'utf8');
      }
      if (!fs.existsSync(defaultOut)) {
        fs.writeFileSync(defaultOut, '', 'utf8');
      }
    }

    return {
      targetDir,
      solutionPath,
      problemPath,
      language,
    };
  }
}
