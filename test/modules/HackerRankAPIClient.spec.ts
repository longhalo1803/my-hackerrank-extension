import { HackerRankAPIClient } from '../../src/modules/HackerRankAPIClient';
import { AuthManager } from '../../src/modules/AuthManager';

// Mock global fetch
const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

describe('HackerRankAPIClient', () => {
  let mockAuthManager: jest.Mocked<AuthManager>;
  let apiClient: HackerRankAPIClient;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthManager = {
      getSession: jest.fn().mockResolvedValue({
        hackerrank_cookie: '_hrank_session=mock_cookie_123',
        csrf_token: 'mock_csrf_abc',
      }),
      isLoggedIn: jest.fn().mockResolvedValue(true),
      fetchCsrfToken: jest.fn().mockResolvedValue('mock_csrf_abc'),
      saveSession: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AuthManager>;

    apiClient = new HackerRankAPIClient(mockAuthManager);
  });

  describe('Tracks and Challenges Querying', () => {
    it('fetches and maps tracks list', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          models: [
            {
              id: 1,
              name: 'Algorithms',
              slug: 'algorithms',
              description: 'Algorithmic problems',
            },
            {
              id: 2,
              name: 'Data Structures',
              slug: 'data-structures',
              description: 'Core data structures',
            },
          ],
        }),
      });

      const tracks = await apiClient.getTracks();
      expect(tracks.length).toBe(2);
      expect(tracks[0].slug).toBe('algorithms');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://www.hackerrank.com/rest/contests/master/tracks',
        expect.objectContaining({
          headers: expect.objectContaining({
            Cookie: '_hrank_session=mock_cookie_123',
            'X-CSRF-Token': 'mock_csrf_abc',
          }),
        }),
      );
    });

    it('fetches chapter challenges using fixed subdomains query parameter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          models: [
            {
              id: 101,
              slug: 'simple-array-sum',
              name: 'Simple Array Sum',
              preview: 'Sum array numbers',
              difficulty_name: 'Easy',
            },
          ],
        }),
      });

      const challenges = await apiClient.getChallenges('algorithms', 'warmup');
      expect(challenges.length).toBe(1);
      expect(challenges[0].slug).toBe('simple-array-sum');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('filters[subdomains][]=warmup'),
        expect.any(Object),
      );
    });
  });

  describe('Challenge Details and Multi-Language Extraction', () => {
    it('returns challenge with extracted boilerplate across all supported languages', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          model: {
            id: 202,
            slug: 'multi-lang-challenge',
            name: 'Multi Language Challenge',
            languages: ['typescript', 'python3', 'cpp'],
            difficulty_name: 'Easy',
            body_html: '<p>Solve this</p>',
            preview: 'Solve this preview',
            typescript_template_head: 'import * as fs from "fs";',
            typescript_template: 'function solve() {}',
            typescript_template_tail: 'solve();',
            python3_template: 'def solve(): pass',
            sample_test_cases: [{ input: '1 2 3', output: '6' }],
          },
        }),
      });

      const challenge = await apiClient.getChallenge('multi-lang-challenge');
      expect(challenge).not.toBeNull();
      expect(challenge?.slug).toBe('multi-lang-challenge');
      expect(challenge?.languages).toEqual(['typescript', 'python3', 'cpp']);
      expect(challenge?.languagesBoilerplate['typescript_template']).toBe(
        'function solve() {}',
      );
      expect(challenge?.languagesBoilerplate['python3_template']).toBe(
        'def solve(): pass',
      );
      expect(challenge?.sampleTestCases.length).toBe(1);
    });

    it('returns null when API returns no model', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ model: null }),
      });

      const challenge = await apiClient.getChallenge('non-existent');
      expect(challenge).toBeNull();
    });
  });

  describe('Remote Run Code (compile_tests)', () => {
    it('throws error when user is not logged in', async () => {
      mockAuthManager.isLoggedIn.mockResolvedValueOnce(false);
      await expect(
        apiClient.compileTests('simple-array-sum', {
          code: 'console.log(6);',
          language: 'typescript',
        }),
      ).rejects.toThrow('You need to be logged in to HackerRank to run code');
    });

    it('throws specific server error when HackerRank rejects compile_tests', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: false,
          model: null,
          message: 'You need to be logged in to submit code.',
          errors: ['You need to be logged in to submit code.'],
        }),
      });

      await expect(
        apiClient.compileTests('simple-array-sum', {
          code: 'console.log(6);',
          language: 'typescript',
        }),
      ).rejects.toThrow(
        'HackerRank rejected code run: You need to be logged in to submit code.',
      );
    });

    it('initiates compile_tests and polls result successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          model: { id: 888123 },
        }),
      });

      const runId = await apiClient.compileTests('simple-array-sum', {
        code: 'console.log(6);',
        language: 'typescript',
      });
      expect(runId).toBe(888123);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://www.hackerrank.com/rest/contests/master/challenges/simple-array-sum/compile_tests',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            code: 'console.log(6);',
            language: 'typescript',
            customtestcase: false,
            playlist_slug: null,
          }),
        }),
      );

      // Poll response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          model: {
            id: 888123,
            status: 1,
            testcase_status: [1],
            testcase_message: ['Success'],
            stdin: ['1 2 3'],
            stdout: ['6'],
            expected_output: ['6'],
          },
        }),
      });

      const runResult = await apiClient.pollCompileTest(
        'simple-array-sum',
        888123,
        5,
        10,
        10,
      );
      expect(runResult.status).toBe('Complete');
      expect(runResult.testCases.length).toBe(1);
      expect(runResult.testCases[0].status).toBe(1);
      expect(runResult.testCases[0].stdout).toBe('6');
    });

    it('handles remote compile error output properly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          model: {
            id: 888124,
            status: 'Error',
            compilemessage: 'SyntaxError: Unexpected token',
          },
        }),
      });

      const runResult = await apiClient.pollCompileTest(
        'simple-array-sum',
        888124,
        5,
        10,
        10,
      );
      expect(runResult.status).toBe('Error');
      expect(runResult.compileMessage).toBe('SyntaxError: Unexpected token');
    });
  });

  describe('Code Submission & Polling', () => {
    it('throws error when user is not logged in', async () => {
      mockAuthManager.isLoggedIn.mockResolvedValueOnce(false);
      await expect(
        apiClient.submitCode('simple-array-sum', {
          code: 'console.log(6);',
          language: 'typescript',
        }),
      ).rejects.toThrow(
        'You need to be logged in to HackerRank to submit code',
      );
    });

    it('throws specific server error when HackerRank rejects submission', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: false,
          model: null,
          message: 'Rate limit exceeded',
        }),
      });

      await expect(
        apiClient.submitCode('simple-array-sum', {
          code: 'console.log(6);',
          language: 'typescript',
        }),
      ).rejects.toThrow('HackerRank rejected submission: Rate limit exceeded');
    });

    it('initiates code submission and returns submission id', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          model: {
            id: 999123,
          },
        }),
      });

      const submissionId = await apiClient.submitCode('simple-array-sum', {
        code: 'console.log(6);',
        language: 'typescript',
      });

      expect(submissionId).toBe(999123);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://www.hackerrank.com/rest/contests/master/challenges/simple-array-sum/submissions',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            code: 'console.log(6);',
            language: 'typescript',
            contest_slug: 'master',
            playlist_slug: null,
          }),
        }),
      );
    });

    it('stops polling immediately and throws when server returns HTTP 401 or 403 on pollCompileTest', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      await expect(
        apiClient.pollCompileTest('simple-array-sum', 12345, 5, 10, 10),
      ).rejects.toThrow('HackerRank session expired or rejected (HTTP 401)');
    });

    it('stops polling immediately and throws when server returns HTTP 401 or 403 on pollSubmission', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
      });

      await expect(
        apiClient.pollSubmission('simple-array-sum', 999123, 5, 10, 10),
      ).rejects.toThrow('HackerRank session expired or rejected (HTTP 403)');
    });

    it('throws when compile test polling times out after maximum attempts', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          model: { status: 0, status_string: 'Processing' },
        }),
      });

      await expect(
        apiClient.pollCompileTest('simple-array-sum', 12345, 2, 10, 10),
      ).rejects.toThrow(
        'Compile test polling timed out after maximum attempts',
      );
    });

    it('polls submission verdict until completed', async () => {
      // First poll: Processing
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          model: {
            id: 999123,
            challenge_id: 101,
            challenge_slug: 'simple-array-sum',
            status: 'Processing',
          },
        }),
      });

      // Second poll: Accepted
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          model: {
            id: 999123,
            challenge_id: 101,
            challenge_slug: 'simple-array-sum',
            status: 'Accepted',
            testcase_message: ['Success', 'Success'],
            testcase_status: [1, 1],
            codechecker_time: [0.05, 0.04],
          },
        }),
      });

      const result = await apiClient.pollSubmission(
        'simple-array-sum',
        999123,
        10,
        50,
        10,
      );
      expect(result.status).toBe('Accepted');
      expect(result.testcaseResults.length).toBe(2);
      expect(result.testcaseResults[0].status).toBe(1);
    });

    it('handles network failure during submission polling and retries', async () => {
      mockFetch.mockRejectedValueOnce(new Error('ECONNRESET'));
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          model: {
            id: 999123,
            status: 'Accepted',
            testcase_message: ['Success'],
            testcase_status: [1],
          },
        }),
      });

      const result = await apiClient.pollSubmission(
        'simple-array-sum',
        999123,
        5,
        10,
        10,
      );
      expect(result.status).toBe('Accepted');
    });

    it('throws informative error when getTracks fetch encounters network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('DNS resolution failure'));
      await expect(apiClient.getTracks()).rejects.toThrow(
        'Failed to connect to HackerRank tracks API',
      );
    });
  });
});
