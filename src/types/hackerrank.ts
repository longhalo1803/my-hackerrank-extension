export interface ChallengeSummary {
  id: number;
  name: string;
  slug: string;
  contest_slug: string;
  kind: 'code' | 'fullstack' | 'database';
  difficulty_name: 'Easy' | 'Medium' | 'Hard';
  max_score: number;
  total_count: number;
  solved_count: number;
  success_ratio: number;
  custom_case: boolean;
  compile_and_test: boolean;
  solved?: boolean;
}

export interface ChallengeDetail extends ChallengeSummary {
  body_html: string;
  languages: string[];
  default_language: string;
  [templateKey: `${string}_template`]: string | undefined;
  [templateHeadKey: `${string}_template_head`]: string | undefined;
  [templateTailKey: `${string}_template_tail`]: string | undefined;
}

export interface CompileTestPayload {
  code: string;
  language: string;
  customtestcase: boolean;
  custominput?: string;
  playlist_slug?: string | null;
}
export interface CompileTestResponse {
  id: number;
  status: number; // 0: Processing, 1: Success, 2: Compile Error
  status_string: string;
  testcase_status: number[]; // 1: Pass, 0: Fail
  stdout: string[];
  stderr: string[];
  expected_output?: string[];
  time: number[];
  memory: number[];
  compilemessage?: string;
  error_markers?: {
    markers: Array<{ row: number; col: number; text: string }>;
  } | null;
}

export interface SubmissionPayload {
  code: string;
  language: string;
  contest_slug: string;
  playlist_slug?: string | null;
}

export interface SubmissionResult {
  id: number;
  challenge_id: number;
  status:
    | 'Accepted'
    | 'Wrong Answer'
    | 'Compilation Error'
    | 'Runtime Error'
    | 'Time Limit Exceeded';
  status_code: number;
  score: number;
  display_score: string;
  testcase_status: number[];
  testcase_message: string[];
  time: number[];
  memory: number[];
  language: string;
  code: string;
  codechecker_hash: string;
}

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
  solved?: boolean;
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
  auth_method?: 'cookie';
  auth_time?: number;
}

export interface ISolution {
  code: string;
  language: string;
}

export interface IRemoteRunTestCase {
  id: number;
  status: number; // 1 = passed, 0 = failed
  message: string;
  stdin: string;
  stdout: string;
  expectedOutput: string;
}

export interface IRemoteRunResult {
  id: number;
  status: 'Processing' | 'Complete' | 'Error';
  compileMessage?: string;
  testCases: IRemoteRunTestCase[];
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

export interface ILanguageInfo {
  id: string;
  displayName: string;
  extension: string;
  vscodeLanguageId: string;
}
