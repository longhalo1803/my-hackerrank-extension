import { AuthManager } from './AuthManager';
import {
  ITrack,
  ITrackChallenges,
  IChallenge,
  ISolution,
  ISubmissionResult,
  ISampleTestCase,
} from '../types/hackerrank';

const DEFAULT_NODE_BOILERPLATE = `function processData(input: string) {
    // Enter your code here
}

process.stdin.resume();
process.stdin.setEncoding("ascii");
let _input = "";
process.stdin.on("data", function (input: string) {
    _input += input;
});

process.stdin.on("end", function () {
   processData(_input);
});`;

export class HackerRankAPIClient {
  static readonly BASE_URI = 'https://www.hackerrank.com/rest';

  constructor(private readonly authManager: AuthManager) {}

  private async getHeaders(): Promise<Record<string, string>> {
    const session = await this.authManager.getSession();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (session?.hackerrank_cookie) {
      headers['Cookie'] = session.hackerrank_cookie;
    }
    if (session?.csrf_token) {
      headers['X-Csrf-Token'] = session.csrf_token;
    }

    return headers;
  }

  async getTracks(): Promise<ITrack[]> {
    const url = `${HackerRankAPIClient.BASE_URI}/contests/master/tracks`;
    const headers = await this.getHeaders();
    const response = await fetch(url, { method: 'GET', headers });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch tracks: ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as any;
    return (data.models || []).map((t: any) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      description: t.description || '',
    }));
  }

  async getChapters(trackSlug: string): Promise<string[]> {
    const url = `${HackerRankAPIClient.BASE_URI}/contests/master/tracks/${trackSlug}/chapters`;
    const headers = await this.getHeaders();
    const response = await fetch(url, { method: 'GET', headers });

    if (!response.ok) {
      return ['all'];
    }

    const data = (await response.json()) as any;
    if (Array.isArray(data.models)) {
      return data.models.map((c: any) => c.slug || c.name);
    }
    return ['all'];
  }

  async getChallenges(
    trackSlug: string,
    chapterSlug?: string,
  ): Promise<ITrackChallenges[]> {
    const query =
      chapterSlug && chapterSlug !== 'all'
        ? `?filters[sub_domains][]=${chapterSlug}&offset=0&limit=200`
        : '?offset=0&limit=200';
    const url = `${HackerRankAPIClient.BASE_URI}/contests/master/tracks/${trackSlug}/challenges${query}`;
    const headers = await this.getHeaders();
    const response = await fetch(url, { method: 'GET', headers });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch challenges: ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as any;
    return (data.models || []).map((c: any) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      description: c.preview || '',
      difficulty: c.difficulty_name || 'Medium',
      trackSlug,
      maxScore: c.max_score,
      successRatio: c.success_ratio,
    }));
  }

  async getChallenge(challengeSlug: string): Promise<IChallenge | null> {
    const url = `${HackerRankAPIClient.BASE_URI}/contests/master/challenges/${challengeSlug}`;
    const headers = await this.getHeaders();
    const response = await fetch(url, { method: 'GET', headers });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch challenge ${challengeSlug}: ${response.status}`,
      );
    }

    const data = (await response.json()) as any;
    const model = data.model;

    if (!model) {
      return null;
    }

    const supportedLanguages: string[] = model.languages || [];
    const hasTS = supportedLanguages.includes('typescript');
    const hasJS = supportedLanguages.includes('javascript');

    // User Requirement: return null if challenge does not support TS or JS
    if (!hasTS && !hasJS) {
      return null;
    }

    const languagesBoilerplate: Record<string, string> = {};

    for (const lang of ['typescript', 'javascript']) {
      if (supportedLanguages.includes(lang)) {
        const key = `${lang}_template`;
        const keyHead = `${lang}_template_head`;
        const keyTail = `${lang}_template_tail`;

        if (model[key]) {
          languagesBoilerplate[key] = model[key];
        } else {
          languagesBoilerplate[key] = DEFAULT_NODE_BOILERPLATE;
        }

        if (model[keyHead]) {
          languagesBoilerplate[keyHead] = model[keyHead];
        }
        if (model[keyTail]) {
          languagesBoilerplate[keyTail] = model[keyTail];
        }
      }
    }

    const sampleTestCases: ISampleTestCase[] = [];
    if (Array.isArray(model.sample_test_cases)) {
      model.sample_test_cases.forEach((tc: any, index: number) => {
        sampleTestCases.push({
          id: index,
          input: tc.input || '',
          output: tc.output || '',
        });
      });
    }

    return {
      id: model.id,
      slug: model.slug,
      name: model.name,
      languages: supportedLanguages,
      difficulty: model.difficulty_name || 'Medium',
      description: model.preview || '',
      questionHtml: model.body_html || '',
      authorName: model.author_name,
      authorAvatar: model.author_avatar,
      languagesBoilerplate,
      sampleTestCases,
    };
  }

  async submitCode(
    challengeSlug: string,
    solution: ISolution,
  ): Promise<number> {
    const url = `${HackerRankAPIClient.BASE_URI}/contests/master/challenges/${challengeSlug}/submissions`;
    const headers = await this.getHeaders();
    const body = JSON.stringify({
      customtestcase: false,
      playlist_slug: '',
      code: solution.code,
      language: solution.language,
    });

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
    });

    if (!response.ok) {
      throw new Error(
        `Failed to submit code: ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as any;
    if (!data.model || !data.model.id) {
      throw new Error('Invalid submission response from HackerRank');
    }

    return data.model.id;
  }

  async pollSubmission(
    challengeSlug: string,
    submissionId: number,
    maxTries = 10,
    seedMs = 500,
    stepMs = 200,
  ): Promise<ISubmissionResult> {
    let tries = 0;

    while (tries < maxTries) {
      const delay = seedMs + stepMs * tries;
      await new Promise((r) => setTimeout(r, delay));

      const url = `${HackerRankAPIClient.BASE_URI}/contests/master/challenges/${challengeSlug}/submissions/${submissionId}`;
      const headers = await this.getHeaders();
      const response = await fetch(url, { method: 'GET', headers });

      if (response.ok) {
        const data = (await response.json()) as any;
        const model = data.model;

        if (model && model.status !== 'Processing') {
          const testcaseResults = (model.testcase_message || []).map(
            (msg: string, idx: number) => ({
              id: idx,
              message: msg,
              status: model.testcase_status ? model.testcase_status[idx] : 0,
              time: model.codechecker_time ? model.codechecker_time[idx] : 0,
            }),
          );

          return {
            submissionId: model.id,
            challengeId: model.challenge_id,
            challengeSlug: model.challenge_slug || challengeSlug,
            status: model.status,
            testcaseResults,
          };
        }
      }

      tries++;
    }

    throw new Error('Submission polling timed out after maximum attempts');
  }
}
