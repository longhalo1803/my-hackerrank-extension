import { AuthManager } from './AuthManager';
import {
  ITrack,
  ITrackChallenges,
  IChallenge,
  ISolution,
  ISubmissionResult,
  ISampleTestCase,
  IRemoteRunResult,
  IRemoteRunTestCase,
  CompileTestPayload,
  CompileTestResponse,
  SubmissionPayload,
} from '../types/hackerrank';

export class HackerRankAPIClient {
  static readonly BASE_URI = 'https://www.hackerrank.com/rest';

  constructor(private readonly authManager: AuthManager) {}

  private async getHeaders(
    requireCsrf: boolean = false,
  ): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    try {
      const session = await this.authManager.getSession();
      if (session?.hackerrank_cookie) {
        const cookie = session.hackerrank_cookie.trim();
        const formattedCookie = cookie.startsWith('_hrank_session=')
          ? cookie
          : `_hrank_session=${cookie}`;
        headers['Cookie'] = formattedCookie;

        let csrfToken = session.csrf_token;
        if (!csrfToken && requireCsrf) {
          csrfToken = await this.authManager.fetchCsrfToken(formattedCookie);
          if (csrfToken) {
            await this.authManager.saveSession({
              hackerrank_cookie: formattedCookie,
              csrf_token: csrfToken,
            });
          }
        }

        if (csrfToken) {
          headers['X-CSRF-Token'] = csrfToken;
        }
      }
    } catch {
      // Safe fallback: proceed with basic json headers
    }

    return headers;
  }

  async getTracks(): Promise<ITrack[]> {
    const url = `${HackerRankAPIClient.BASE_URI}/contests/master/tracks`;
    const headers = await this.getHeaders();
    let response: Response;
    try {
      response = await fetch(url, { method: 'GET', headers });
    } catch (netErr: any) {
      throw new Error(
        `Failed to connect to HackerRank tracks API: ${netErr.message}`,
      );
    }

    if (!response.ok) {
      throw new Error(
        `Failed to fetch tracks: ${response.status} ${response.statusText}`,
      );
    }

    let data: any;
    try {
      data = await response.json();
    } catch {
      throw new Error('Failed to parse tracks response from HackerRank');
    }

    return (data?.models || []).map((t: any) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      description: t.description || '',
    }));
  }

  async getChapters(trackSlug: string): Promise<string[]> {
    try {
      const url = `${HackerRankAPIClient.BASE_URI}/contests/master/tracks/${encodeURIComponent(trackSlug)}/chapters`;
      const headers = await this.getHeaders();
      const response = await fetch(url, { method: 'GET', headers });

      if (!response.ok) {
        return ['all'];
      }

      const data = (await response.json()) as any;
      if (Array.isArray(data.models) && data.models.length > 0) {
        return data.models.map((c: any) => c.slug || c.name);
      }
      return ['all'];
    } catch {
      return ['all'];
    }
  }

  async getChallenges(
    trackSlug: string,
    chapterSlug?: string,
  ): Promise<ITrackChallenges[]> {
    const query =
      chapterSlug && chapterSlug !== 'all'
        ? `?offset=0&limit=200&filters[subdomains][]=${encodeURIComponent(chapterSlug)}&track_login=true`
        : '?offset=0&limit=200&track_login=true';
    const url = `${HackerRankAPIClient.BASE_URI}/contests/master/tracks/${encodeURIComponent(trackSlug)}/challenges${query}`;
    const headers = await this.getHeaders();
    let response: Response;
    try {
      response = await fetch(url, { method: 'GET', headers });
    } catch (netErr: any) {
      throw new Error(
        `Failed to connect to HackerRank challenges API: ${netErr.message}`,
      );
    }

    if (!response.ok) {
      throw new Error(
        `Failed to fetch challenges: ${response.status} ${response.statusText}`,
      );
    }

    let data: any;
    try {
      data = await response.json();
    } catch {
      throw new Error('Failed to parse challenges response from HackerRank');
    }

    return (data?.models || []).map((c: any) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      description: c.preview || '',
      difficulty: c.difficulty_name || 'Medium',
      trackSlug,
      maxScore: c.max_score,
      successRatio: c.success_ratio,
      solved: Boolean(c.solved),
    }));
  }

  async getChallenge(challengeSlug: string): Promise<IChallenge | null> {
    const url = `${HackerRankAPIClient.BASE_URI}/contests/master/challenges/${encodeURIComponent(challengeSlug)}`;
    const headers = await this.getHeaders();
    let response: Response;
    try {
      response = await fetch(url, { method: 'GET', headers });
    } catch (netErr: any) {
      throw new Error(
        `Failed to connect to HackerRank challenge API (${challengeSlug}): ${netErr.message}`,
      );
    }

    if (!response.ok) {
      throw new Error(
        `Failed to fetch challenge ${challengeSlug}: ${response.status}`,
      );
    }

    let data: any;
    try {
      data = await response.json();
    } catch {
      throw new Error(
        `Failed to parse challenge response for ${challengeSlug}`,
      );
    }

    const model = data?.model;
    if (!model) {
      return null;
    }

    const supportedLanguages: string[] = model.languages || [];
    const languagesBoilerplate: Record<string, string> = {};

    for (const lang of supportedLanguages) {
      const key = `${lang}_template`;
      const keyHead = `${lang}_template_head`;
      const keyTail = `${lang}_template_tail`;

      if (model[key]) {
        languagesBoilerplate[key] = model[key];
      }
      if (model[keyHead]) {
        languagesBoilerplate[keyHead] = model[keyHead];
      }
      if (model[keyTail]) {
        languagesBoilerplate[keyTail] = model[keyTail];
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

  async compileTests(
    challengeSlug: string,
    solution: ISolution,
  ): Promise<number> {
    const isLoggedIn = await this.authManager.isLoggedIn();
    if (!isLoggedIn) {
      throw new Error(
        'You need to be logged in to HackerRank to run code. Please sign in via "HackerRank: Sign In with Cookie (Direct)" or "HackerRank: Sign In with Google".',
      );
    }

    const url = `${HackerRankAPIClient.BASE_URI}/contests/master/challenges/${encodeURIComponent(challengeSlug)}/compile_tests`;
    const headers = await this.getHeaders(true);
    const payload: CompileTestPayload = {
      code: solution.code,
      language: solution.language,
      customtestcase: false,
      playlist_slug: null,
    };
    const body = JSON.stringify(payload);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body,
      });
    } catch (networkErr: any) {
      throw new Error(`Failed to trigger compile tests: ${networkErr.message}`);
    }

    if (!response.ok) {
      throw new Error(
        `Failed to run code: ${response.status} ${response.statusText}`,
      );
    }

    let data: any;
    try {
      data = await response.json();
    } catch {
      throw new Error('Invalid JSON response received from compile_tests API');
    }

    if (!data || !data.model || !data.model.id) {
      const serverMessage =
        data?.message ||
        (Array.isArray(data?.errors) ? data.errors.join('; ') : undefined);
      if (serverMessage) {
        throw new Error(`HackerRank rejected code run: ${serverMessage}`);
      }
      throw new Error(
        'Invalid compile_tests response structure from HackerRank',
      );
    }

    return data.model.id;
  }

  async pollCompileTest(
    challengeSlug: string,
    compileTestId: number,
    maxTries = 15,
    seedMs = 500,
    stepMs = 200,
  ): Promise<IRemoteRunResult> {
    let tries = 0;
    const headers = await this.getHeaders(false);

    while (tries < maxTries) {
      const delay = seedMs + stepMs * tries;
      await new Promise((r) => setTimeout(r, delay));

      const url = `${HackerRankAPIClient.BASE_URI}/contests/master/challenges/${encodeURIComponent(challengeSlug)}/compile_tests/${encodeURIComponent(compileTestId)}`;
      let response: Response | undefined;

      try {
        response = await fetch(url, { method: 'GET', headers });
      } catch (pollNetErr: any) {
        if (tries >= maxTries - 1) {
          throw new Error(
            `Compile test polling network failure after maximum attempts: ${pollNetErr.message}`,
          );
        }
        tries++;
        continue;
      }

      if (response && (response.status === 401 || response.status === 403)) {
        throw new Error(
          `HackerRank session expired or rejected (HTTP ${response.status}). Please sign in again.`,
        );
      }

      if (response && response.ok) {
        let data: any;
        try {
          data = await response.json();
        } catch {
          tries++;
          continue;
        }

        const model = data?.model as CompileTestResponse | undefined;
        if (
          model &&
          (model.status === 1 ||
            model.status === 2 ||
            (model as any).status === 'Complete' ||
            (model as any).status === 'Error' ||
            model.status_string === 'Complete' ||
            model.status_string === 'Error' ||
            Boolean(
              model.compilemessage && model.compilemessage.trim().length > 0,
            ))
        ) {
          const testCases: IRemoteRunTestCase[] = [];
          const statusArray = model.testcase_status || [];
          const msgArray = (model as any).testcase_message || [];
          const stdinArray = (model as any).stdin || [];
          const stdoutArray = model.stdout || [];
          const expectedArray = model.expected_output || [];

          const totalCount = Math.max(
            statusArray.length,
            msgArray.length,
            stdinArray.length,
            stdoutArray.length,
          );

          for (let i = 0; i < totalCount; i++) {
            testCases.push({
              id: i,
              status: statusArray[i] ?? 0,
              message:
                msgArray[i] ||
                (statusArray[i] === 1 ? 'Success' : 'Wrong Answer'),
              stdin: stdinArray[i] || '',
              stdout: stdoutArray[i] || '',
              expectedOutput: expectedArray[i] || '',
            });
          }

          return {
            id: model.id || compileTestId,
            status:
              model.status === 2 ||
              (model.compilemessage && model.compilemessage.trim().length > 0)
                ? 'Error'
                : 'Complete',
            compileMessage: model.compilemessage || undefined,
            testCases,
          };
        }
      }

      tries++;
    }

    throw new Error('Compile test polling timed out after maximum attempts');
  }

  async submitCode(
    challengeSlug: string,
    solution: ISolution,
  ): Promise<number> {
    const isLoggedIn = await this.authManager.isLoggedIn();
    if (!isLoggedIn) {
      throw new Error(
        'You need to be logged in to HackerRank to submit code. Please sign in via "HackerRank: Sign In with Cookie (Direct)" or "HackerRank: Sign In with Google".',
      );
    }

    const url = `${HackerRankAPIClient.BASE_URI}/contests/master/challenges/${encodeURIComponent(challengeSlug)}/submissions`;
    const headers = await this.getHeaders(true);
    const payload: SubmissionPayload = {
      code: solution.code,
      language: solution.language,
      contest_slug: 'master',
      playlist_slug: null,
    };
    const body = JSON.stringify(payload);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body,
      });
    } catch (networkErr: any) {
      throw new Error(
        `Failed to submit code due to network failure: ${networkErr.message}`,
      );
    }

    if (!response.ok) {
      throw new Error(
        `Failed to submit code: ${response.status} ${response.statusText}`,
      );
    }

    let data: any;
    try {
      data = await response.json();
    } catch {
      throw new Error(
        'Invalid JSON response received from HackerRank submission API',
      );
    }

    if (!data || !data.model || !data.model.id) {
      const serverMessage =
        data?.message ||
        (Array.isArray(data?.errors) ? data.errors.join('; ') : undefined);
      if (serverMessage) {
        throw new Error(`HackerRank rejected submission: ${serverMessage}`);
      }
      throw new Error('Invalid submission response structure from HackerRank');
    }

    return data.model.id;
  }

  async pollSubmission(
    challengeSlug: string,
    submissionId: number,
    maxTries = 15,
    seedMs = 500,
    stepMs = 200,
  ): Promise<ISubmissionResult> {
    let tries = 0;
    const headers = await this.getHeaders(false);

    while (tries < maxTries) {
      const delay = seedMs + stepMs * tries;
      await new Promise((r) => setTimeout(r, delay));

      const url = `${HackerRankAPIClient.BASE_URI}/contests/master/challenges/${encodeURIComponent(challengeSlug)}/submissions/${encodeURIComponent(submissionId)}`;
      let response: Response | undefined;

      try {
        response = await fetch(url, { method: 'GET', headers });
      } catch (pollNetErr: any) {
        if (tries >= maxTries - 1) {
          throw new Error(
            `Submission polling network failure after maximum attempts: ${pollNetErr.message}`,
          );
        }
        tries++;
        continue;
      }

      if (response && (response.status === 401 || response.status === 403)) {
        throw new Error(
          `HackerRank session expired or rejected (HTTP ${response.status}). Please sign in again.`,
        );
      }

      if (response && response.ok) {
        let data: any;
        try {
          data = await response.json();
        } catch {
          tries++;
          continue;
        }

        const model = data?.model;
        if (model && model.status !== 'Processing') {
          const msgCount = (model.testcase_message || []).length;
          const statusCount = (model.testcase_status || []).length;
          const totalCount = Math.max(msgCount, statusCount);

          const testcaseResults = Array.from(
            { length: totalCount },
            (_, idx) => ({
              id: idx,
              message:
                model.testcase_message?.[idx] ||
                (model.status === 'Accepted' ? 'Success' : 'Failed'),
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
