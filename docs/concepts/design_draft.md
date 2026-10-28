# HackerRank Native Extension for Antigravity IDE & VS Code Forks

- **Author:** longlt
- **Status:** Draft
- **Date:** 2026-10-28

---

## Overview

A native developer extension for Antigravity IDE and VS Code forks (Cursor, Windsurf, VSCodium) that integrates HackerRank directly into the editor. It allows developers to browse coding challenges, scaffold boilerplate code into their local workspace, verify solutions against sample test cases offline, and submit answers to HackerRank without using the web-based code editor.

## The Problem

Practicing coding challenges on HackerRank's web editor creates several developer friction points:

1. **Suboptimal Editing Experience**: Lack of personal keybindings (Vim/Emacs), customized LSP, linters, and personal snippets available in local IDEs.
2. **Authentication Obstacles**: Modern HackerRank accounts predominantly use Google/GitHub OAuth, which breaks simple email/password scraping extensions. Manual cookie extraction via browser DevTools is tedious and fragile.
3. **Network Dependence**: Developers cannot execute or test code against sample inputs locally without an active internet connection or sending code to HackerRank's remote judge.
4. **Workspace Disconnect**: Solutions solved on the web are not organized as local Git-tracked repositories for personal reference and portfolio building.

## Goals

- **Native In-Editor Workflow**: Provide a full problem-solving loop (browse, read, write, test, submit) inside Antigravity IDE and VS Code forks.
- **Frictionless Google OAuth**: Automate browser authentication using a headed Playwright instance to capture session cookies with zero manual DevTools interaction.
- **Automated Workspace Scaffolding**: Create organized local files (`solution.ts` / `solution.js` / `Solution.java`, `problem.md`, `testcases.json`) in the active workspace with starter code assembled from HackerRank template parts (`head` + `template` + `tail`).
- **Targeted Minimal Runtime Execution**: Optimize local test execution strictly for TypeScript, JavaScript (via Node.js/`tsx`), and Java (`javac`/`java`), removing all other language runtime bloat.
- **Offline Sample Test Execution**: Execute code against sample test cases locally via stdin/stdout piping without waiting for HackerRank cloud queue latency.
- **Official Submission & Polling**: Submit solutions directly to HackerRank judge endpoints and stream/poll verdict results into the editor.
- **Automated Git Sync**: Automatically commit accepted solutions to the user's local Git repository with formatted commit messages, enabling 1-click or automated push to personal GitHub.

## Non-Goals

- **Non-Target Language Runtimes**: Explicitly excluding support and local execution tooling for Python, C, C++, Rust, Go, Ruby, and other languages to keep the extension footprint minimal and focused.
- **Non-VS-Code Editor Support**: Explicitly excluding Zed, Neovim, and JetBrains from extension scope to leverage native VS Code TreeView and Webview APIs without local server overhead.
- **HackerRank for Work Support**: Enterprise recruiting assessments and interview screening APIs are out of scope.
- **Custom Test Case Creation Suite**: No complex visual test generator; focuses on sample test cases provided by HackerRank problem definitions.
- **Local Judge for Hidden Tests**: Hidden tests remain private on HackerRank servers; local runner only evaluates public sample test cases.

## Resolved Design Decisions

- **Language Selection Hierarchy**:
  1. Primary Default: **TypeScript** (`solution.ts`).
  2. Fallback 1: **JavaScript** (`solution.js`) if TypeScript boilerplate is absent.
  3. Fallback 2: **Java** (`Solution.java`) if neither JS nor TS is supported.
  4. Unsupported: Challenges supporting none of these three languages are flagged as unsupported and skipped.
- **Workspace Directory & Git Sync**:
  - Files scaffold into the user's active workspace under `./tracks/{track_slug}/{chapter_slug}/{challenge_slug}/`.
  - On successful submission (verdict `Accepted`), extension executes `git add . && git commit -m "feat(hackerrank): solve {challenge_slug} in {language}"` and offers automated `git push`.

## Critical User Journeys (CUJs)

### CUJ 1: One-Click Google Authentication

- **Given**: User is logged out and opens Antigravity IDE.
- **When**: User clicks "Sign in to HackerRank" in the Challenges TreeView.
- **Then**: A headed Chromium window opens to `https://www.hackerrank.com/auth/login`. User clicks "Continue with Google" and completes sign-in. The window closes automatically, credentials are saved to `context.secrets`, and the Challenges TreeView populates with available tracks.

### CUJ 2: Browse and Scaffold Problem (TS Priority & Official Boilerplate)

- **Given**: User is signed in and browsing the "Algorithms" track in the Activity Bar.
- **When**: User clicks on "Simple Array Sum" under the "Warmup" chapter.
- **Then**:
  1. A Webview panel opens showing the problem description with rendered math formulas (KaTeX).
  2. Extension queries `GET /challenges/simple-array-sum` and extracts official HackerRank boilerplate parts:
     - `typescript_template_head`: imports, stdin buffer handler, `readLine()` helper.
     - `typescript_template`: the stub function `simpleArraySum(ar: number[]): number`.
     - `typescript_template_tail`: the official `main()` execution function reading input and writing to `process.env.OUTPUT_PATH`.
  3. Concatenates them into `tracks/algorithms/warmup/simple-array-sum/solution.ts`.
  4. Automatically opens `solution.ts` side-by-side in the editor with cursor positioned inside the solve function.

### CUJ 3: Local Offline Test and Remote Submit

- **Given**: User has written a solution in `solution.ts`.
- **When**: User triggers "HackerRank: Run Local Tests".
- **Then**: Local engine executes `solution.ts` (via `tsx`/`node`) using sample `input_0.txt` as stdin, asserts against sample `output_0.txt`, and reports test results in 0.1s in the Webview pane without network calls.
- **When**: User clicks "Submit Solution".
- **Then**: Extension sends the code to HackerRank submissions endpoint, polls status, and displays the final verdict (Accepted / Wrong Answer).

### CUJ 4: Automated GitHub Commit

- **Given**: User's solution receives an `Accepted` verdict from HackerRank judge.
- **When**: Verification completes successfully.
- **Then**: Extension automatically stages `solution.ts` and `problem.md`, commits with message `feat(algorithms): solve simple-array-sum in typescript`, and syncs with the user's GitHub remote repository.

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
│  │  - Fetch Boilerplate  │              │  - child_process (node/ts)│  │
│  │  - Write solution.ts  │              │  - Pipe input_0.txt       │  │
│  │  - Write testcases    │              │  - Compare output_0.txt   │  │
│  └───────────┬───────────┘              └─────────────┬─────────────┘  │
│              │                                        │                │
│              ▼                                        ▼                │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Problem WebviewPanel (Dedicated Action Buttons)                  │  │
│  │  - Render HTML/KaTeX Problem Statement                           │  │
│  │  - [Button 1: Run Local Tests]     ──► LocalTestRunner           │  │
│  │  - [Button 2: Submit HackerRank]   ──► RemoteJudgeClient         │  │
│  │  - [Button 3: Commit & Push Git]   ──► GitSyncService            │  │
│  └───────────┬────────────────────────────────────────┬─────────────┘  │
│              │                                        │                │
└──────────────┼────────────────────────────────────────┼────────────────┘
               │                                        │
               ▼                                        ▼
    ┌──────────────────────┐               ┌───────────────────────────┐
    │ AuthManager          │               │ HackerRank Cloud Backend  │
    │  - Playwright Headed │               │  - /challenges/{slug}     │
    │  - Google OAuth      │               │  - /compile_tests         │
    │  - SecretStorage     │               │  - /submissions           │
    └──────────────────────┘               └───────────────────────────┘
```

### 2. Component Deconstruction & Responsibilities

#### A. `AuthManager` (Authentication Subsystem)

- **Engine**: Bundles `playwright-core` to launch an isolated Chromium window on command.
- **Login Trigger**: Opens `https://www.hackerrank.com/auth/login`.
- **Interception**: Monitors cookie jar for `_hrank_session` and intercepts CSRF tokens from response headers/meta tags upon user completing Google OAuth.
- **Storage**: Securely saves the session string into `vscode.ExtensionContext.secrets` (VS Code SecretStorage API). Never writes credentials to plain text files.

#### B. `HackerRankAPIClient` (Network Subsystem)

- Standard HTTP client leveraging Node.js native `fetch`.
- **Endpoints**:
  - `GET /rest/contests/master/tracks`: Fetches tracks list.
  - `GET /rest/contests/master/tracks/{track}/chapters`: Fetches track sub-categories.
  - `GET /rest/contests/master/tracks/{track}/challenges?filters[sub_domains][]={chapter}`: Fetches problems.
  - `GET /rest/contests/master/challenges/{slug}`: Fetches challenge metadata, body HTML, and language templates.
  - `POST /rest/contests/master/challenges/{slug}/compile_tests`: Triggers remote test compile.
  - `POST /rest/contests/master/challenges/{slug}/submissions`: Submits solution.
  - `GET /rest/contests/master/challenges/{slug}/(compile_tests|submissions)/{id}`: Polls judge verdict.

#### C. `ChallengesTreeProvider` (Sidebar Explorer)

- Implements `vscode.TreeDataProvider<ChallengeItem>`.
- Renders hierarchical tree: Tracks -> Chapters -> Challenges.
- Displays icons indicating difficulty level and solved state (`Pass` vs `Unsolved`).

#### D. `WorkspaceScaffolder` (Local Code & Testcase Generator)

- Directory Structure:
  ```text
  ./tracks/
  └── {track_slug}/
      └── {chapter_slug}/
          └── {challenge_slug}/
              ├── solution.ts       # Head + Template + Tail
              ├── problem.md        # Converted from body_html
              └── tests/
                  ├── input_0.txt   # Sample Input
                  └── output_0.txt  # Sample Output
  ```
- **Language Assembly**:
  - If TypeScript supported: Concatenates `typescript_template_head + typescript_template + typescript_template_tail`.
  - Else if JavaScript supported: Concatenates `javascript_template_head + javascript_template + javascript_template_tail`.
  - Else if Java supported: Concatenates `java_template_head + java_template + java_template_tail`.
  - Else: Displays user notification that challenge is outside chosen language profile.

#### E. `LocalTestRunner` (Offline Execution Engine)

- Executes without network calls via **[Button 1: Run Local Tests]**.
- **TypeScript/JavaScript Runner**:
  - Uses `child_process.spawn` running `npx tsx` or Node.js with in-memory TypeScript loader.
  - Injects environment variable: `OUTPUT_PATH = path.join(tempDir, 'actual_output.txt')`.
  - Pipes `input_0.txt` into `stdin`.
  - Captures `stdout`, `stderr`, and file contents of `OUTPUT_PATH`.
  - Performs trim and character-by-character comparison against `output_0.txt`.
- **Java Runner**:
  - Executes `javac Solution.java && java -DoutputPath=... Solution < input_0.txt`.

#### F. `RemoteJudgeClient` (Official HackerRank Submission Engine)

- Triggered exclusively by **[Button 2: Submit to HackerRank]**.
- Single responsibility: Posts solution code to `POST /submissions`, polls verdict every 1s, and renders pass/fail testcase matrix on Webview.
- Completely decoupled from Git operations to allow repeated submissions without polluting Git commit logs.

#### G. `GitSyncService` (Dedicated Version Control Automation)

- Triggered explicitly by **[Button 3: Commit & Push to GitHub]** (enabled when problem state is `Accepted`).
- Single responsibility: Version control management.
  1. Stages files: `git add tracks/{track}/{chapter}/{challenge}/`.
  2. Creates atomic commit: `git commit -m "feat({track}): solve {challenge} in {language}"`.
  3. Pushes to remote: executes `git push origin HEAD` and displays status notification.

---

## Alternatives Considered

### Alternative A: Cross-Editor Local Web Server (Zed + Antigravity Support)

- **Description**: Run a local HTTP/WebSocket daemon (`localhost:3000`) and a browser dashboard companion so that non-VS-Code editors like Zed could share the same engine.
- **Pros**: Universal editor compatibility.
- **Cons**: Requires running an external daemon process, forces split-screen context switching between browser and editor, loses native IDE TreeView integration.
- **Reason for Rejection**: Explicitly rejected by user to prioritize a seamless, 100% native in-editor experience inside Antigravity IDE and VS Code forks.

### Alternative B: Webview Built with Vite + React SPA

- **Description**: Build the problem description and test results panel as a client-side Single Page Application using Vite, React, and Tailwind.
- **Pros**: Reusable component architecture, rich reactive state.
- **Cons**: Requires dual build configurations (`tsc` for extension host, `vite build` for Webview), bloats extension bundle with React runtime, and requires complex asynchronous message passing via `vscode.postMessage`.
- **Reason for Rejection**: Violates YAGNI. The Webview is primarily a document viewer rendering Markdown/KaTeX with three action buttons. TypeScript + EJS/Template Strings handles this in a single build pipeline with zero bundle bloat.

### Alternative C: Programmatic Email/Password Scraping (Legacy Repo Approach)

- **Description**: Scrape CSRF tokens from `GET /auth/login` and send raw credentials via `POST /rest/auth/login`.
- **Pros**: Fully headless without popping up a browser window.
- **Cons**: Fails completely for users authenticating via Google or GitHub OAuth; vulnerable to Akamai bot protection and graphical Captchas.
- **Reason for Rejection**: Headed Playwright automation allows real Google OAuth login, solves Captchas naturally in browser context, and guarantees reliable cookie capture.

### Alternative D: Comprehensive Multi-Language Runtime Matrix

- **Description**: Support local compilation and execution for C, C++, Python, Java, Rust, and Go out of the box.
- **Pros**: Covers all HackerRank programming tracks.
- **Cons**: Requires maintaining complex local compiler detection (GCC, Clang, Python, Cargo), increases error surface, and introduces unnecessary bloat.
- **Reason for Rejection**: User specifically only uses TypeScript/JavaScript and Java. Restricting the runner to `tsx`/`node` and `javac`/`java` eliminates dead weight.

---

## Non-Functional Requirements

### Security & Privacy

- **Zero Credential Exposure**: User email and password are never solicited or stored. Session tokens (`_hrank_session` and CSRF tokens) are stored exclusively in `vscode.ExtensionContext.secrets` (backed by OS keychain/SecretStorage).
- **Browser Sandbox Isolation**: The Playwright instance is launched with a dedicated user data profile and automatically terminated immediately after capturing cookies.

### Performance & Latency

- **Instant Local Feedback**: Local offline test execution executes under 250ms via `child_process.spawn`, bypassing HackerRank queue wait times.
- **Minimal Bundle Footprint**: By eliminating heavy runtimes (React, Vite, Python/C compilers), the compiled extension size remains under 5MB.

---

## Detailed Implementation Plan

### Target Files to Create

#### 1. `package.json` (Create)

- **Type / Scope**: Extension Manifest & Build Configuration.
- **Proposed Changes**:
  - Declare VS Code engine compatibility (`^1.83.0`).
  - Register `viewsContainers` in `activitybar` (`id: hackerrank-challenges`).
  - Register `views` (`id: challengesExplorer`).
  - Register commands: `hackerrank.signin`, `hackerrank.openChallenge`, `hackerrank.runLocalTest`, `hackerrank.submit`, `hackerrank.gitSync`.
  - Dependencies: `playwright-core`, `ejs`, `markdown-it`, `katex`.
  - DevDependencies: `@types/vscode`, `@types/node`, `@types/ejs`, `typescript`, `copyfiles`, `tsx`, `jest`, `ts-jest`, `@types/jest`, `eslint`.
  - Build & Test scripts: `compile`, `watch`, `copy-assets`, `lint`, `"test": "jest --coverage"`.

#### 2. `tsconfig.json` (Create)

- **Type / Scope**: TypeScript Compiler Configuration.
- **Proposed Changes**:
  - Target `ES2022`, module `CommonJS`, root directory `./src`, out directory `./out`.
  - Enable strict type checking (`strict: true`).

#### 3. `src/extension.ts` (Create)

- **Type / Scope**: Extension Entry Point & Command Dispatcher.
- **Proposed Changes**:
  - Implement `activate(context: vscode.ExtensionContext)` and `deactivate()`.
  - Instantiate `AuthManager`, `HackerRankAPIClient`, `ChallengesTreeProvider`, `WorkspaceScaffolder`, `LocalTestRunner`, `RemoteJudgeClient`, and `GitSyncService`.
  - Register all extension commands and subscribe them to `context.subscriptions`.

#### 4. `src/modules/AuthManager.ts` (Create)

- **Type / Scope**: Authentication & Session Manager.
- **Proposed Changes**:
  - `loginWithGoogle()`: Launches headed Chromium instance via `playwright-core` at `https://www.hackerrank.com/auth/login`.
  - Monitors browser cookie changes to capture `_hrank_session` and intercepts CSRF tokens.
  - Closes browser window upon successful session capture.
  - `saveSession()` and `getSession()`: Persists and reads tokens securely via `context.secrets`.
  - `isLoggedIn()`: Returns boolean status of current session validity.

#### 5. `src/modules/HackerRankAPIClient.ts` (Create)

- **Type / Scope**: HTTP Client for HackerRank REST Endpoints.
- **Proposed Changes**:
  - Wraps native Node.js `fetch` with session cookie and `X-Csrf-Token` headers.
  - `getTracks()`: Fetches track categories (`/rest/contests/master/tracks`).
  - `getChapters(trackSlug)`: Fetches sub-track categories (`/rest/contests/master/tracks/{track}/chapters`).
  - `getChallenges(trackSlug, chapterSlug)`: Fetches challenge lists filtered by sub-domain.
  - `getChallengeDetail(challengeSlug)`: Fetches HTML description, testcases, and boilerplate code templates.
  - `submitCode(challengeSlug, code, language)`: Submits solution to `/rest/contests/master/challenges/{slug}/submissions`.
  - `pollSubmission(challengeSlug, submissionId)`: Polls verdict status every 1000ms until completed.

#### 6. `src/modules/ChallengesTreeProvider.ts` (Create)

- **Type / Scope**: Sidebar Navigation TreeView Provider.
- **Proposed Changes**:
  - Implements `vscode.TreeDataProvider<TreeItem>`.
  - Hierarchy:
    - Level 1: Tracks (`Algorithms`, `Data Structures`, `Java`).
    - Level 2: Chapters (`Warmup`, `Strings`, `Sorting`).
    - Level 3: Challenges (`Simple Array Sum`, `Compare the Triplets`).
  - Decorates tree nodes with difficulty badges (Easy / Medium / Hard) and completion status.

#### 7. `src/modules/WorkspaceScaffolder.ts` (Create)

- **Type / Scope**: Local File Scaffolder & Code Assembler.
- **Proposed Changes**:
  - Language Priority Resolution:
    1. Checks for `typescript_template`. If exists, chooses TypeScript.
    2. Else checks for `javascript_template`. If exists, chooses JavaScript.
    3. Else checks for `java_template`. If exists, chooses Java.
    4. If none exist, aborts with notification.
  - Assembles code boilerplate: `head + template + tail`.
  - Creates workspace directory: `./tracks/{track_slug}/{chapter_slug}/{challenge_slug}/`.
  - Writes `solution.ts` (or `.js` / `.java`), `problem.md` (converted from `body_html`), `tests/input_0.txt`, `tests/output_0.txt`.
  - Opens `solution.ts` in editor side-by-side with the Webview problem pane.

#### 8. `src/modules/LocalTestRunner.ts` (Create)

- **Type / Scope**: Offline Test Execution Engine.
- **Proposed Changes**:
  - `runTests(challengePath, language)`: Spawns runner process based on language:
    - TypeScript: `npx tsx solution.ts` or Node with in-memory loader.
    - JavaScript: `node solution.js`.
    - Java: `javac Solution.java && java Solution`.
  - Sets environment variable `OUTPUT_PATH` to temporary actual output file.
  - Pipes `input_0.txt` into process `stdin`.
  - Reads actual output and compares character-by-character with `output_0.txt`.
  - Returns structured result: `{ passed: boolean, expected: string, actual: string, durationMs: number, stderr: string }`.

#### 9. `src/modules/RemoteJudgeClient.ts` (Create)

- **Type / Scope**: Cloud Submission Engine.
- **Proposed Changes**:
  - `submit(challengeSlug, code, language)`: Calls `HackerRankAPIClient.submitCode`.
  - Initiates polling loop until submission state transitions from pending/compiling to resolved.
  - Parses returned testcase verdict matrix (Accepted, Wrong Answer, Terminated due to timeout).

#### 10. `src/modules/GitSyncService.ts` (Create)

- **Type / Scope**: Git Automation Service.
- **Proposed Changes**:
  - `syncSolution(trackSlug, challengeSlug, language)`:
    - Executes `git add tracks/{track_slug}/{chapter_slug}/{challenge_slug}/`.
    - Executes `git commit -m "feat({track_slug}): solve {challenge_slug} in {language}"`.
    - If remote is configured: executes `git push origin HEAD`.
  - Emits user information message with commit status.

#### 11. `src/views/ProblemWebviewPanel.ts` (Create)

- **Type / Scope**: Webview Lifecycle & Controller.
- **Proposed Changes**:
  - `show(challengeData)`: Creates or reveals `vscode.WebviewPanel`.
  - Renders HTML from `src/templates/problem.ejs` with `markdown-it` and `KaTeX` assets.
  - Wires message listener:
    - `onDidReceiveMessage('runLocalTest')` -> invokes `LocalTestRunner`.
    - `onDidReceiveMessage('submitHackerRank')` -> invokes `RemoteJudgeClient`.
    - `onDidReceiveMessage('commitGit')` -> invokes `GitSyncService`.
  - Posts execution and judge test results back to the Webview DOM.

#### 12. `src/templates/problem.ejs` (Create)

- **Type / Scope**: HTML Template for Problem View.
- **Proposed Changes**:
  - Header: Challenge title, track, difficulty badge, max score.
  - Body: Markdown-rendered problem description, input format, constraints, and KaTeX math formulas.
  - Action Bar:
    - `[Button 1: Run Local Tests]`
    - `[Button 2: Submit to HackerRank]`
    - `[Button 3: Commit & Push to GitHub]` (disabled until problem passes with Accepted verdict).
  - Results Panel: Tabs for Local Test output vs Remote Judge testcase matrix.

#### 13. `jest.config.js` (Create)

- **Type / Scope**: Jest Unit Testing Configuration.
- **Proposed Changes**:
  - Preset: `ts-jest`.
  - Test environment: `node`.
  - Test match pattern: `test/**/*.spec.ts`.
  - Coverage directory: `./coverage`.
  - Collect coverage from `src/modules/**/*.ts`.

#### 14. Unit Test Specs: `test/modules/*.spec.ts` (Create)

- **Type / Scope**: Unit Test Suites (Jest).
- **Proposed Changes**:
  - `test/modules/AuthManager.spec.ts`: Tests cookie regex extraction, SecretStorage read/write mocks, and login state predicates.
  - `test/modules/HackerRankAPIClient.spec.ts`: Mocks `fetch` responses for `/tracks`, `/challenges`, and `/submissions`, verifying request headers and error handling.
  - `test/modules/ChallengesTreeProvider.spec.ts`: Tests tree node hierarchy construction and icon/badge mapping.
  - `test/modules/WorkspaceScaffolder.spec.ts`: Tests boilerplate code assembly (`head + template + tail`), language priority resolution (TS > JS > Java), and filesystem writing.
  - `test/modules/LocalTestRunner.spec.ts`: Tests stdin piping, output capture, whitespace trimming, and diff assertions using mock subprocesses.
  - `test/modules/RemoteJudgeClient.spec.ts`: Tests submission polling backoff and verdict resolution.
  - `test/modules/GitSyncService.spec.ts`: Tests `git` command arguments generation, commit message format, and error handling.

#### 15. `.github/workflows/ci.yml` (Create)

- **Type / Scope**: GitHub Actions Continuous Integration Workflow.
- **Proposed Changes**:
  - Trigger: `push` and `pull_request` on branch `main`.
  - OS Matrix: `ubuntu-latest`.
  - Node Versions: `18.x`, `20.x`.
  - Steps:
    1. Checkout repository (`actions/checkout@v4`).
    2. Setup Node.js environment (`actions/setup-node@v4`).
    3. Install dependencies: `npm ci`.
    4. Lint codebase: `npm run lint`.
    5. Compile extension: `npm run compile`.
    6. Execute Jest unit tests with coverage: `npm test`.

---

## Verification Plan

### Automated CI & Unit Tests

- `npm test`: Executes all `test/modules/*.spec.ts` via Jest. Must pass 100% with target code coverage > 80%.
- `npm run lint`: Verifies zero ESLint warnings or errors.
- `npm run compile`: Executes `tsc -p ./` and asset copying. Must complete with 0 errors.
- **GitHub Actions CI**: Automated pipeline runs on every push and PR to ensure clean builds across Node 18 and 20.

### Manual E2E Verification Workflow (Extension Development Host)

1.  **Launch Extension**: Press `F5` in Antigravity IDE to launch a fresh Extension Development Host.
2.  **Verify CUJ 1 (Auth)**:
    - Click "Sign in to HackerRank" in Activity Bar.
    - Confirm Playwright Chromium window opens at HackerRank login page.
    - Log in with Google; confirm window closes automatically.
    - Confirm Challenges TreeView populates with tracks (`Algorithms`, `Data Structures`).
3.  **Verify CUJ 2 (Scaffold)**:
    - Expand `Algorithms` -> `Warmup` -> click `Simple Array Sum`.
    - Confirm Webview opens showing problem statement and KaTeX math formulas.
    - Confirm `tracks/algorithms/warmup/simple-array-sum/solution.ts` is created with starter boilerplate (`head` + `template` + `tail`).
    - Confirm `tests/input_0.txt` and `tests/output_0.txt` are created.
4.  **Verify CUJ 3 (Local Run & Remote Submit)**:
    - Complete the solving function in `solution.ts`.
    - Click `[Run Local Tests]`: Verify test runs in < 200ms and reports `Passed` in Webview.
    - Click `[Submit to HackerRank]`: Verify code submits, status polls, and official verdict `Accepted` is displayed.
5.  **Verify CUJ 4 (Git Sync)**:
    - Confirm `[Commit & Push to GitHub]` button activates.
    - Click button: Confirm git commit is created with message `feat(algorithms): solve simple-array-sum in typescript` and pushed to GitHub.

---

_Drafted with EGM_
