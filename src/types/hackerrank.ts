export interface ITrack {
  id: number;
  name: string;
  description: string;
  slug: string;
}

export interface ITrackChallenges {
  id: number;
  slug: string;
  name: string;
  description: string;
  difficulty: string;
  trackSlug?: string;
  maxScore?: number;
  successRatio?: number;
}

export interface ISampleTestCase {
  id: number;
  input: string;
  output: string;
}

export interface IChallenge {
  id: number;
  slug: string;
  name: string;
  trackSlug?: string;
  chapterSlug?: string;
  languages: string[];
  difficulty: string;
  description: string;
  questionHtml: string;
  authorName?: string;
  authorAvatar?: string;
  languagesBoilerplate: Record<string, string>;
  sampleTestCases: ISampleTestCase[];
}

export interface ISession {
  email?: string;
  csrf_token?: string;
  hackerrank_cookie?: string;
}

export interface ISolution {
  code: string;
  language: 'typescript' | 'javascript';
}

export interface IRunResult {
  passed: boolean;
  testcaseId: number;
  expected: string;
  actual: string;
  durationMs: number;
  stderr?: string;
}

export interface ISubmissionTestcaseResult {
  id: number;
  status: number;
  message: string;
  time: number;
  isUnlocked?: boolean;
}

export interface ISubmissionResult {
  submissionId: number;
  challengeId: number;
  challengeSlug: string;
  status: string; // 'Accepted', 'Wrong Answer', etc.
  testcaseResults: ISubmissionTestcaseResult[];
}
