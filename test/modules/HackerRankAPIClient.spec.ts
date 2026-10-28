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
            'X-Csrf-Token': 'mock_csrf_abc',
          }),
        }),
      );
    });

    it('fetches chapter challenges', async () => {
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
    });
  });

  describe('Challenge Language Filtering & Boilerplate (User Requirement)', () => {
    it('returns null when challenge supports neither TypeScript nor JavaScript', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          model: {
            id: 201,
            slug: 'c-only-challenge',
            name: 'C Only Challenge',
            languages: ['c', 'cpp', 'java'],
            body_html: '<p>C only</p>',
          },
        }),
      });

      const challenge = await apiClient.getChallenge('c-only-challenge');
      expect(challenge).toBeNull();
    });

    it('returns challenge with extracted boilerplate when TypeScript is supported', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          model: {
            id: 202,
            slug: 'ts-challenge',
            name: 'TypeScript Challenge',
            languages: ['typescript', 'javascript', 'python3'],
            difficulty_name: 'Easy',
            body_html: '<p>Solve this</p>',
            preview: 'Solve this preview',
            typescript_template_head: 'import * as fs from "fs";',
            typescript_template: 'function solve() {}',
            typescript_template_tail: 'solve();',
            sample_test_cases: [{ input: '1 2 3', output: '6' }],
          },
        }),
      });

      const challenge = await apiClient.getChallenge('ts-challenge');
      expect(challenge).not.toBeNull();
      expect(challenge?.slug).toBe('ts-challenge');
      expect(challenge?.languages).toContain('typescript');
      expect(challenge?.languagesBoilerplate['typescript_template']).toBe(
        'function solve() {}',
      );
      expect(challenge?.sampleTestCases.length).toBe(1);
      expect(challenge?.sampleTestCases[0].input).toBe('1 2 3');
    });

    it('provides standard fallback boilerplate when custom template is absent', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          model: {
            id: 203,
            slug: 'js-fallback-challenge',
            name: 'JS Fallback Challenge',
            languages: ['javascript'],
            difficulty_name: 'Medium',
            body_html: '<p>Fallback</p>',
            preview: 'Fallback preview',
          },
        }),
      });

      const challenge = await apiClient.getChallenge('js-fallback-challenge');
      expect(challenge).not.toBeNull();
      expect(challenge?.languagesBoilerplate['javascript_template']).toContain(
        'processData',
      );
    });
  });

  describe('Code Submission & Polling', () => {
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
            customtestcase: false,
            playlist_slug: '',
            code: 'console.log(6);',
            language: 'typescript',
          }),
        }),
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
  });
});
