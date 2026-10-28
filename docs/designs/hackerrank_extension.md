# HackerRank Native Extension for Antigravity IDE & VS Code Forks

- **Author:** longlt
- **Status:** Approved (Remediated)
- **Date:** 2026-10-28

---

## Overview

A native developer extension for Antigravity IDE and VS Code forks (Cursor, Windsurf, VSCodium) that integrates HackerRank directly into the editor. It allows developers to browse coding challenges, scaffold boilerplate code into their local workspace, verify solutions against sample test cases offline, and submit answers to HackerRank without using the web-based code editor.

### Host Prerequisites

- **Node.js**: Version `>= 18.x` (native `fetch` support).
- **Git**: Version `>= 2.25` installed and accessible in the system `PATH`.
- **Google Chrome / Chromium**: Installed locally for browser-assisted authentication (or manual cookie input in headless/remote environments).

## The Problem

Practicing coding challenges on HackerRank's web editor creates several developer friction points:

1. **Suboptimal Editing Experience**: Lack of personal keybindings (Vim/Emacs), customized LSP, linters, and personal snippets available in local IDEs.
2. **Authentication Obstacles**: Modern HackerRank accounts predominantly use Google/GitHub OAuth, which breaks simple email/password scraping extensions. Manual cookie extraction via browser DevTools is tedious and fragile.
3. **Network Dependence**: Developers cannot execute or test code against sample inputs locally without an active internet connection or sending code to HackerRank's remote judge.
4. **Workspace Disconnect**: Solutions solved on the web are not organized as local Git-tracked repositories for personal reference and portfolio building.

## Goals

- **Native In-Editor Workflow**: Provide a full problem-solving loop (browse, read, write, test, submit) inside Antigravity IDE and VS Code forks.
- **Resilient OAuth Authentication**: Automate browser authentication using system Chrome via Playwright with an automatic headless/remote fallback to secure manual session cookie entry.
- **Automated Workspace Scaffolding**: Create organized local files (`solution.ts` / `solution.js`, `problem.md`, sample inputs/outputs) in the active workspace with starter code assembled from HackerRank template parts (`head` + `template` + `tail`).
- **Strictly Focused Runtime Execution**: Optimize local test execution strictly for TypeScript and JavaScript (Node.js runtime via `tsx`), returning `null` and alerting for challenges lacking JS/TS support.
- **Offline Sample Test Execution**: Execute code against all sample test cases locally via stdin/stdout piping with execution timeouts and output normalization.
- **Official Submission & Polling**: Submit solutions directly to HackerRank judge endpoints and poll verdict results into the editor using incremental backoff.
- **Dedicated Git Sync**: Provide explicit, user-triggered Git commit and push actions with repository guards and standardized commit messages.

## Non-Goals

- **Non-JS/TS Language Runtimes**: Explicitly excluding support and local execution tooling for Java, Python, C, C++, Rust, Go, Ruby, and other languages. Challenges without TypeScript or JavaScript support return `null`.
- **Non-VS-Code Editor Support**: Explicitly excluding Zed, Neovim, and JetBrains from extension scope to leverage native VS Code TreeView, Webview, and SecretStorage APIs.
- **HackerRank for Work Support**: Enterprise recruiting assessments and interview screening APIs are out of scope.
- **Custom Test Case Creation Suite**: No visual test generator; focuses on sample test cases provided by HackerRank problem definitions.
- **Local Judge for Hidden Tests**: Hidden tests remain private on HackerRank servers; local runner only evaluates public sample test cases.

## Critical User Journeys (CUJs)

### CUJ 1: One-Click Google Authentication & Remote Fallback

- **Given**: User is logged out and opens Antigravity IDE.
- **When**: User clicks "Sign in to HackerRank" in the Challenges TreeView.
- **Then**:
  1. If a display server is detected, extension launches system Chrome via `chromium.launch({ channel: 'chrome', headless: false })` at `https://www.hackerrank.com/auth/login`.
  2. User completes Google OAuth; extension intercepts `_hrank_session` cookie and CSRF token, saves them into [`vscode.ExtensionContext.secrets`](https://code.visualstudio.com/api/references/vscode-api#SecretStorage), closes browser, and refreshes the tree.
  3. If running in a headless environment (Remote SSH, WSL without GUI, Codespaces) or if browser launch fails, extension prompts user via `vscode.window.showInputBox` to enter their session cookie directly.

### CUJ 2: Browse and Scaffold Problem (TS Priority & Official Boilerplate)

- **Given**: User is signed in and browsing the "Algorithms" track in the Activity Bar.
- **When**: User clicks on "Simple Array Sum" under the "Warmup" chapter.
- **Then**:
  1. Extension queries `GET /rest/contests/master/challenges/simple-array-sum`.
  2. Checks supported languages:
     - If `languages` contains `typescript`: Selects TypeScript (`solution.ts`).
     - Else if `languages` contains `javascript`: Selects JavaScript (`solution.js`).
     - Else: Returns `null`, displays warning (`"Challenge does not support TypeScript or JavaScript"`), and aborts scaffolding.
  3. If `tracks/{track_slug}/{chapter_slug}/{challenge_slug}/solution.ts` already exists, opens existing file to prevent overwriting user work.
  4. If not, concatenates `head` + `template` (or fallback standard boilerplate) + `tail` into `solution.ts`.
  5. Converts `body_html` to `problem.md` using `turndown`, creates `tests/input_{i}.txt` and `tests/output_{i}.txt` for all sample test cases, and opens `solution.ts` beside the Webview.

### CUJ 3: Local Offline Test and Remote Submit

- **Given**: User has written code in `solution.ts`.
- **When**: User clicks **[Button 1: Run Local Tests]** in the Webview panel.
- **Then**: Local engine spawns `tsx solution.ts` with a 5000ms timeout cap, pipes `tests/input_0.txt` to stdin, normalizes CRLF/LF line endings, and reports pass/fail diff in < 200ms without network calls.
- **When**: User clicks **[Button 2: Submit to HackerRank]**.
- **Then**: Extension reads entire solution code from editor, calls `POST /submissions`, polls status with incremental backoff (`500ms + 200ms * tries`), and renders official pass/fail verdict matrix in the Webview.

### CUJ 4: Dedicated Git Commit & Remote Push

- **Given**: User's solution receives an `Accepted` verdict from HackerRank judge.
- **When**: User clicks **[Button 3: Commit & Push to GitHub]**.
- **Then**: Extension verifies workspace is an initialized Git repository, stages `tracks/{track_slug}/{chapter_slug}/{challenge_slug}/`, creates commit with message `feat({track_slug}): solve {challenge_slug} in {language}`, and pushes to `origin HEAD` if remote is configured.

---

## Resolved Design Decisions

- **Language Whitelist & Priority**:
  1. Primary Default: **TypeScript** (`solution.ts`).
  2. Fallback: **JavaScript** (`solution.js`) if TypeScript is absent.
  3. Unsupported: If neither is supported, `HackerRankAPIClient.getChallenge()` returns `null` and alerts user. Java, Python, C++, etc. are completely eliminated.
- **Boilerplate Assembly & Fallback**:
  - Follows reference implementation (`suyash-purwar/hackerrank-vscode`): Assembles `${lang}_template_head` + `${lang}_template` + `${lang}_template_tail`.
  - If `${lang}_template` is absent, injects HackerRank's standard Node.js boilerplate (`function processData(input) { ... }` with `process.stdin` listener).
- **Submission Payload Contract**:
  - Full code submission: The complete editor contents are sent as `{ customtestcase: false, playlist_slug: "", code: string, language: string }` to `POST /rest/contests/master/challenges/{slug}/submissions`.
- **Component Streamlining (Zoom-Out Refactor)**:
  - Removed `RemoteJudgeClient` passthrough class; `ProblemWebviewPanel` interacts directly with `HackerRankAPIClient`.
  - Replaced `ejs` with pure TypeScript template literals.
- **Security & Webview CSP**:
  - Webview enforces strict CSP: `default-src 'none'; style-src ${webview.cspSource}; font-src ${webview.cspSource}; script-src 'nonce-...';`.
  - Assets (KaTeX CSS/fonts) are routed through `webview.asWebviewUri`.

---

## Technical Plan (Architecture)

### 1. High-Level System Architecture

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        Antigravity IDE / VS Code                       │
│                                                                        │
│  ┌───────────────────────┐              ┌───────────────────────────┐  │
│  │ Activity Bar: TreeView│              │ Main Editor: solution.ts  │  │
│  │  - Track (Algorithms) │              │  - Head: Imports & Stdin  │  │
│  │  - Chapter (Warmup)   │              │  - Body: Solving Function │  │
│  │  - Problem (Sum Array)│              │  - Tail: main() & Output  │  │
│  └───────────┬───────────┘              └─────────────┬─────────────┘  │
│              │ (Click)                                │                │
│              ▼                                        ▼                │
│  ┌───────────────────────┐              ┌───────────────────────────┐  │
│  │ WorkspaceScaffolder   │              │ LocalTestRunner           │  │
│  │  - Check TS/JS Support│              │  - child_process (tsx)    │  │
│  │  - Guard Existing File│              │  - 5000ms Timeout Cap     │  │
│  │  - Turndown body_html │              │  - Pipe tests/input_*.txt │  │
│  │  - Write tests/*.txt  │              │  - Normalize & Diff Out   │  │
│  └───────────┬───────────┘              └─────────────┬─────────────┘  │
│              │                                        │                │
│              ▼                                        ▼                │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ ProblemWebviewPanel (Strict CSP + KaTeX)                         │  │
│  │  - Render HTML Problem Statement & Math Formulas                 │  │
│  │  - [Button 1: Run Local Tests]     ──► LocalTestRunner           │  │
│  │  - [Button 2: Submit HackerRank]   ──► HackerRankAPIClient       │  │
│  │  - [Button 3: Commit & Push Git]   ──► GitSyncService            │  │
│  └───────────┬────────────────────────────────────────┬─────────────┘  │
│              │                                        │                │
└──────────────┼────────────────────────────────────────┼────────────────┘
               │                                        │
               ▼                                        ▼
    ┌──────────────────────┐               ┌───────────────────────────┐
    │ AuthManager          │               │ HackerRank REST API       │
    │  - System Chrome     │               │  - /tracks & /chapters    │
    │  - Manual Fallback   │               │  - /challenges/{slug}     │
    │  - SecretStorage     │               │  - /submissions & Polling │
    └──────────────────────┘               └───────────────────────────┘
```

### 2. Component Deconstruction & Responsibilities

#### A. `AuthManager` (Authentication Subsystem)

- **Primary Mechanism**: Launches system Chrome via `playwright-core`:
  ```typescript
  chromium.launch({ channel: "chrome", headless: false });
  ```
- **Interception**: Monitors cookie changes for `_hrank_session` and captures CSRF token from response headers.
- **Fallback Mechanism**: If `process.env.DISPLAY` is undefined or browser launch fails (e.g. Remote SSH, Docker), prompts user via `vscode.window.showInputBox` to paste `_hrank_session` cookie directly.
- **Storage**: Persists tokens in [`vscode.ExtensionContext.secrets`](https://code.visualstudio.com/api/references/vscode-api#SecretStorage).
- **Session Check**: `async isLoggedIn(): Promise<boolean>`.

#### B. `HackerRankAPIClient` (Network & Polling Subsystem)

- Typed HTTP client leveraging Node.js native `fetch`.
- **Domain Models & Interfaces (`src/types/hackerrank.ts`)**:
  - `ITrack`: `{ id: number; name: string; slug: string; description: string; }`
  - `ITrackChallenges`: `{ id: number; slug: string; name: string; description: string; difficulty: string; }`
  - `IChallenge`: `{ id: number; slug: string; name: string; trackSlug?: string; languages: string[]; difficulty: string; questionHtml: string; languagesBoilerplate: Record<string, string>; sampleTestcases: { input: string; output: string }[]; }`
  - `ISolution`: `{ code: string; language: 'typescript' | 'javascript'; }`
  - `ISubmissionResult`: `{ id: number; status: string; testcaseResults: { status: number; message: string; time: number }[]; }`
- **Core Methods**:
  - `getTracks(): Promise<ITrack[]>`: `/rest/contests/master/tracks`
  - `getChapters(trackSlug: string): Promise<string[]>`: `/rest/contests/master/tracks/{track}/chapters`
  - `getChallenges(trackSlug: string, chapterSlug: string): Promise<ITrackChallenges[]>`
  - `getChallenge(challengeSlug: string): Promise<IChallenge | null>`:
    - If `!model.languages.includes('typescript') && !model.languages.includes('javascript')`, returns `null`.
    - Extracts `${lang}_template_head`, `${lang}_template`, `${lang}_template_tail`.
  - `submitCode(challengeSlug: string, solution: ISolution): Promise<number>`: Posts to `/submissions` and returns `submissionId`.
  - `pollSubmission(challengeSlug: string, submissionId: number): Promise<ISubmissionResult>`:
    - Uses incremental delay (`500ms + 200ms * tries`, max 10 tries).
    - Resolves when `model.status !== 'Processing'`.

#### C. `ChallengesTreeProvider` (Sidebar Navigation)

- Implements [`vscode.TreeDataProvider<TreeItem>`](https://code.visualstudio.com/api/references/vscode-api#TreeDataProvider).
- Tree hierarchy: Track -> Chapter -> Challenge.
- Displays difficulty badges and solved state. Filters out challenges returning `null`.

#### D. `WorkspaceScaffolder` (Workspace Generator)

- Directory layout:
  ```text
  ./tracks/
  └── {track_slug}/
      └── {chapter_slug}/
          └── {challenge_slug}/
              ├── solution.ts (or solution.js)
              ├── problem.md
              └── tests/
                  ├── input_0.txt
                  ├── output_0.txt
                  ├── input_1.txt
                  └── output_1.txt
  ```
- **Overwrite Protection**: Checks `fs.existsSync(solutionPath)`. If solution already exists, re-uses existing file and avoids destructive overwriting.
- **Conversion**: Converts `questionHtml` (`body_html`) into `problem.md` using `turndown`.
- **Dynamic Testcases**: Generates `input_${i}.txt` and `output_${i}.txt` for all sample testcases in `challenge.sampleTestcases`.

#### E. `LocalTestRunner` (Offline Execution Engine)

- Triggered by **[Button 1: Run Local Tests]**.
- Spawns child process via `child_process.spawn`:
  - TypeScript: `npx tsx solution.ts` (with `OUTPUT_PATH` injected in `env`).
  - JavaScript: `node solution.js`.
- **Process Guardrails**:
  - 5000ms execution timeout with `SIGKILL` to prevent infinite loops.
  - Pipes `tests/input_${i}.txt` into `stdin`.
  - Normalizes line endings (`\r\n` -> `\n`) and trims trailing whitespace.
  - Returns `{ passed: boolean, testcaseId: number, expected: string, actual: string, durationMs: number, stderr: string }`.

#### F. `GitSyncService` (Version Control Integration)

- Triggered by **[Button 3: Commit & Push to GitHub]** (active when submission status is `Accepted`).
- Signature: `syncSolution(trackSlug: string, chapterSlug: string, challengeSlug: string, language: string): Promise<void>`.
- **Workspace Guards**:
  - Validates `vscode.workspace.workspaceFolders` exists and is non-empty.
  - Checks `git rev-parse --is-inside-work-tree`. If not in a git repo, prompts user to initialize (`git init`).
  - Stages challenge directory: `git add tracks/{track_slug}/{chapter_slug}/{challenge_slug}/`.
  - Commits with unified template: `git commit -m "feat({track_slug}): solve {challenge_slug} in {language}"`.
  - Pushes to remote if `git remote` is configured.

#### G. `ProblemWebviewPanel` (Webview Controller)

- Implements Webview panel lifecycle.
- Injects strict Content Security Policy meta tag:
  ```html
  <meta
    http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${webview.cspSource}; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';"
  />
  ```
- Maps KaTeX stylesheet and font assets via `webview.asWebviewUri`.
- Listens to webview events:
  - `runLocalTest` -> invokes `LocalTestRunner`.
  - `submitHackerRank` -> calls `HackerRankAPIClient.submitCode()` and polls status directly.
  - `commitGit` -> invokes `GitSyncService`.

---

## Detailed Implementation Plan

### Target Files to Create

#### 1. `package.json` (Create)

- **Dependencies**:
  - `playwright-core`: `^1.40.0`
  - `turndown`: `^7.1.2`
  - `katex`: `^0.16.9`
  - `tsx`: `^4.7.0` (production dependency for runtime TS execution)
- **DevDependencies**:
  - `@types/vscode`: `^1.83.0`
  - `@types/node`: `^18.18.0`
  - `@types/turndown`: `^5.0.4`
  - `@types/katex`: `^0.16.7`
  - `typescript`: `^5.2.0`
  - `copyfiles`: `^2.4.1`
  - `jest`: `^29.7.0`
  - `ts-jest`: `^29.1.1`
  - `@types/jest`: `^29.5.10`
  - `eslint`: `^8.54.0`
- **Scripts**:
  - `"compile"`: `"tsc -p ./ && npm run copy-assets"`
  - `"copy-assets"`: `"copyfiles -u 1 src/media/**/* out/"`
  - `"watch"`: `"tsc -watch -p ./"`
  - `"lint"`: `"eslint src --ext ts"`
  - `"test"`: `"jest --coverage"`

#### 2. `tsconfig.json` (Create)

- Target `ES2022`, module `CommonJS`, rootDir `./src`, outDir `./out`, `strict: true`.

#### 3. `src/types/hackerrank.ts` (Create)

- Export interfaces `ITrack`, `ITrackChallenges`, `IChallenge`, `ISolution`, `ISession`, `ISubmissionResult`, `IRunResult`.

#### 4. `src/modules/AuthManager.ts` (Create)

- Implements `loginWithGoogle()` with system browser channel `chrome` and fallback to `vscode.window.showInputBox` manual cookie input.
- Methods: `saveSession()`, `getSession()`, `isLoggedIn(): Promise<boolean>`, `logout()`.

#### 5. `src/modules/HackerRankAPIClient.ts` (Create)

- HTTP client wrapping native `fetch` with session cookies and CSRF tokens.
- Implements `getTracks()`, `getChapters()`, `getChallenges()`, `getChallenge()`, `submitCode()`, `pollSubmission()`.
- Enforces language filter: returns `null` if neither TypeScript nor JavaScript is supported.

#### 6. `src/modules/ChallengesTreeProvider.ts` (Create)

- Implements `vscode.TreeDataProvider<TreeItem>` rendering Tracks -> Chapters -> Challenges.

#### 7. `src/modules/WorkspaceScaffolder.ts` (Create)

- Scaffolds problem files into `./tracks/{track_slug}/{chapter_slug}/{challenge_slug}/`.
- Guards against overwriting existing `solution.ts`/`solution.js`.
- Converts HTML to Markdown using `turndown`. Writes all sample test cases (`input_${i}.txt`, `output_${i}.txt`).

#### 8. `src/modules/LocalTestRunner.ts` (Create)

- Executes tests via `child_process.spawn` (`tsx` or `node`) with 5000ms timeout cap.
- Normalizes whitespace/CRLF and asserts against sample test cases.

#### 9. `src/modules/GitSyncService.ts` (Create)

- Validates Git workspace root, stages challenge directory, creates commit `feat({track_slug}): solve {challenge_slug} in {language}`, and pushes to `origin HEAD`.

#### 10. `src/views/ProblemWebviewPanel.ts` (Create)

- Manages Webview panel with strict CSP and KaTeX asset loading.
- Wires UI action buttons directly to `LocalTestRunner`, `HackerRankAPIClient`, and `GitSyncService`.

#### 11. `test/mocks/vscode.ts` (Create)

- Mock implementation of `vscode` namespace: `SecretStorage`, `window`, `workspace`, `Uri`, `TreeItem`, `EventEmitter`.

#### 12. `jest.config.js` (Create)

- Configures `ts-jest` preset, `testEnvironment: 'node'`, and `moduleNameMapper`:
  ```javascript
  moduleNameMapper: {
    '^vscode$': '<rootDir>/test/mocks/vscode.ts'
  }
  ```

#### 13. Unit Test Specs (`test/modules/*.spec.ts`)

- `AuthManager.spec.ts`: Tests cookie parsing, secret storage mock, and login state checks.
- `HackerRankAPIClient.spec.ts`: Tests track fetching, language filtering (`return null`), and submission polling backoff.
- `WorkspaceScaffolder.spec.ts`: Tests file scaffolding, boilerplate assembly, overwrite protection, and turndown conversion.
- `LocalTestRunner.spec.ts`: Tests subprocess spawning, 5000ms timeout kill, CRLF normalization, and diff checking.
- `GitSyncService.spec.ts`: Tests git command arguments and workspace repository validation.

#### 14. `.github/workflows/ci.yml` (Create)

- Triggers on `push` and `pull_request` to `main`.
- Matrix: Node 18, 20 on `ubuntu-latest`. Runs lint, compile, and Jest unit tests.

---

## Verification Plan

### Automated CI & Unit Tests

- `npm test`: Executes all unit tests via Jest with `test/mocks/vscode.ts`. Target code coverage > 80%.
- `npm run lint`: Verifies zero ESLint warnings or errors.
- `npm run compile`: Compiles TypeScript and copies media assets without error.

### Manual E2E Verification Workflow (Extension Development Host)

1.  **Launch**: Press `F5` in Antigravity IDE to launch Extension Development Host.
2.  **Verify Auth (CUJ 1)**:
    - Click "Sign in to HackerRank". System Chrome launches to login page.
    - On headless environment, verify prompt asks for `_hrank_session` cookie directly.
    - Confirm Challenges TreeView populates with tracks.
3.  **Verify Language Filter & Scaffolding (CUJ 2)**:
    - Select a JS/TS challenge: Confirm `solution.ts` and `problem.md` are scaffolded.
    - Select a non-JS/TS challenge: Confirm extension displays notification and returns `null`.
    - Edit `solution.ts` and re-click problem: Confirm existing code is not overwritten.
4.  **Verify Offline Run & Submit (CUJ 3)**:
    - Click `[Run Local Tests]`: Verify test runs in < 200ms and reports `Passed`.
    - Click `[Submit to HackerRank]`: Verify code submits, status polls, and verdict `Accepted` is displayed.
5.  **Verify Git Sync (CUJ 4)**:
    - Click `[Commit & Push to GitHub]`: Verify git commit `feat({track_slug}): solve {challenge_slug} in {language}` is created.

---

_Drafted with EGM_
