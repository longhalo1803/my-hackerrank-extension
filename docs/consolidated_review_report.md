# Consolidated Goldfish Review Report: HackerRank Native Extension

**Target Document:** [docs/designs/hackerrank_extension.md](file:///home/longlt/Long-Project/My-own-hackerrank/docs/designs/hackerrank_extension.md) (`Lines 1-421`)  
**Review Preset:** Preset 1 (Consolidated report with all review rubrics — Uninterrupted Full Flow)  
**Evaluated Review Personas:**

- `egm-zoom-out` (Skeptical Architect & Simplicity)
- `egm-design` (Hostile Design Critic & Security)
- `egm-structural` (Document Architect & Layout)
- `egm-comprehension` (Naive Reader & Specification Clarity)
- `egm-codebase-details` (Pedantic Technical Quality Auditor)
- `egm-implementation-readiness` (Pragmatic Tech Lead & Operational Boundaries)

---

## Executive Summary & Triage Overview

Across all 6 review personas, the design document is fundamentally solid in scope and user intent, but exhibits several critical implementation gaps, runtime execution hazards, and missing boundary definitions.

The findings are grouped and prioritized into:

- 🔴 **Blockers (7 items)**: Flaws that cause runtime crashes, build failures, bot-blocking, or architectural deadlocks.
- 🟡 **Majors (8 items)**: Functional defects, missing error recovery, undefined API contracts, or process leakage.
- 🟢 **Nits (7 items)**: Formatting inconsistencies, unstated prerequisites, redundant abstractions, or dead dependencies.

---

## Prioritized Findings

### 🔴 Blocker Findings

#### 1. Infeasible Headed Playwright OAuth Automation & Missing Browser Executable

- **Reviewer Lenses:** `egm-zoom-out`, `egm-design`, `egm-codebase-details`, `egm-comprehension`, `egm-implementation-readiness`
- **Affected Scope:** [docs/designs/hackerrank_extension.md#L24-L26](file:///home/longlt/Long-Project/My-own-hackerrank/docs/designs/hackerrank_extension.md#L24-L26), [L52-L56](file:///home/longlt/Long-Project/My-own-hackerrank/docs/designs/hackerrank_extension.md#L52-L56), [L128-L133](file:///home/longlt/Long-Project/My-own-hackerrank/docs/designs/hackerrank_extension.md#L128-L133), [L245](file:///home/longlt/Long-Project/My-own-hackerrank/docs/designs/hackerrank_extension.md#L245), [L265](file:///home/longlt/Long-Project/My-own-hackerrank/docs/designs/hackerrank_extension.md#L265)
- **Discrepancy Description & Rationale:**
  1. **Google Bot Detection**: Google OAuth blocks logins from automated browser frameworks (detecting `navigator.webdriver` and DevTools automation flags) with _"This browser or app may not be secure"_. Launching Playwright to automate Google OAuth will fail for end users.
  2. **Missing Binary in `playwright-core`**: `playwright-core` does not include Chromium binaries. Spawning `chromium.launch({ headless: false })` throws an immediate `Executable does not exist` runtime error unless a ~200MB Chromium binary is downloaded (violating the `<5MB` bundle constraint in L230) or system browser channel is explicitly configured.
  3. **Headless / Remote Crash**: Spawning headed Chromium unconditionally crashes with `No DISPLAY` on Remote SSH, WSL, Dev Containers, and GitHub Codespaces.
  4. **Process Leakage**: Aborting auth or closing the browser window leaves hanging promises and orphaned browser processes.
- **Remediation**:
  - Primary Strategy: Launch system Chrome/Edge via channel configuration `chromium.launch({ channel: 'chrome', headless: false })`, or use `vscode.env.openExternal` with a local loopback server (`http://127.0.0.1:<port>/callback`).
  - Fallback Strategy: Implement an explicit manual session cookie prompt (`vscode.window.showInputBox` saving `_hrank_session` into `context.secrets`) whenever `process.env.DISPLAY` is absent or browser launch fails.
  - Lifecycle: Add a 120-second timeout and wire `browser.close()` into extension deactivation.

#### 2. Undefined Submission API Payload vs. Scaffolding Concatenation Contract

- **Reviewer Lenses:** `egm-zoom-out`, `egm-comprehension`, `egm-implementation-readiness`
- **Affected Scope:** [docs/designs/hackerrank_extension.md#L62-L66](file:///home/longlt/Long-Project/My-own-hackerrank/docs/designs/hackerrank_extension.md#L62-L66), [L163-L167](file:///home/longlt/Long-Project/My-own-hackerrank/docs/designs/hackerrank_extension.md#L163-L167), [L180-L184](file:///home/longlt/Long-Project/My-own-hackerrank/docs/designs/hackerrank_extension.md#L180-L184), [L317-L323](file:///home/longlt/Long-Project/My-own-hackerrank/docs/designs/hackerrank_extension.md#L317-L323)
- **Discrepancy Description & Rationale:**
  `WorkspaceScaffolder` concatenates `head + template + tail` into `solution.ts`. The design does not define what payload is sent to `POST /rest/contests/master/challenges/{slug}/submissions`. If HackerRank expects only the solution function stub, sending the whole concatenated file causes compiler re-declaration errors (`main`, `readLine`, imports). If the remote judge expects the full code, user edits outside the stub must not be mangled.
- **Remediation**:
  Explicitly specify the submission API contract. For HackerRank's submission endpoint, posting the complete source file replaces the template head/tail on the remote judge. Define clear demarcation comments in `solution.ts` (e.g. `// [START_SOLUTION]` ... `// [END_SOLUTION]`) to support both full-file and function-only submission schemas without ambiguous boundaries.

#### 3. Dropping Java Language Support & Restricting to JS/TS (User Decision)

- **Reviewer Lenses:** `egm-zoom-out`, `egm-codebase-details`, `egm-design`, `user-decision`
- **Affected Scope:** [docs/designs/hackerrank_extension.md#L178](file:///home/longlt/Long-Project/My-own-hackerrank/docs/designs/hackerrank_extension.md#L178), [L301-L315](file:///home/longlt/Long-Project/My-own-hackerrank/docs/designs/hackerrank_extension.md#L301-L315)
- **Discrepancy Description & Rationale:**
  Original design included Java execution (`java -DoutputPath=... Solution`), creating JVM property bugs (`OUTPUT_PATH` null pointer), class-naming discrepancies (`Solution.java` vs `solution.java`), and dirty classfile build artifacts. Per user instruction, all Java language support and compilers are completely removed from the project.
- **Remediation & Specification**:
  - Restrict supported languages exclusively to TypeScript (`typescript`, `.ts`) and JavaScript (`javascript`, `.js`).
  - If a problem does not support TypeScript or JavaScript (`!languages.includes('typescript') && !languages.includes('javascript')`), return `null` and display a user warning: `"Challenge does not support TypeScript or JavaScript"`.
  - Local execution is handled strictly via Node.js runtime (`node` / `tsx`), eliminating all Java runtime dependencies, `javac` compilation steps, and JVM environment injection issues.

#### 4. Missing HTML-to-Markdown Converter Dependency (`turndown`)

- **Reviewer Lenses:** `egm-comprehension`, `egm-codebase-details`
- **Affected Scope:** [docs/designs/hackerrank_extension.md#L158](file:///home/longlt/Long-Project/My-own-hackerrank/docs/designs/hackerrank_extension.md#L158), [L245](file:///home/longlt/Long-Project/My-own-hackerrank/docs/designs/hackerrank_extension.md#L245), [L302](file:///home/longlt/Long-Project/My-own-hackerrank/docs/designs/hackerrank_extension.md#L302)
- **Discrepancy Description & Rationale:**
  The design specifies that `problem.md` is generated by converting `body_html` from HackerRank API. Line 245 lists `markdown-it` in dependencies. However, `markdown-it` is a Markdown-to-HTML parser; it cannot convert HTML back to Markdown.
- **Remediation**:
  Add `turndown` and `@types/turndown` to `package.json` dependencies (or drop redundant `problem.md` export and store `problem.html`).

#### 5. Jest Test Configuration Missing `vscode` Mock Mapping

- **Reviewer Lenses:** `egm-codebase-details`, `egm-implementation-readiness`
- **Affected Scope:** [docs/designs/hackerrank_extension.md#L355-L374](file:///home/longlt/Long-Project/My-own-hackerrank/docs/designs/hackerrank_extension.md#L355-L374)
- **Discrepancy Description & Rationale:**
  The modules under test (`AuthManager`, `HackerRankTreeProvider`, `ProblemWebviewPanel`) import `vscode`. Running Jest with `ts-jest` in a Node environment fails with `Cannot find module 'vscode'` because `vscode` is an external runtime host dependency.
- **Remediation**:
  Create `test/mocks/vscode.ts` with mocks for `SecretStorage`, `window`, `workspace`, `TreeItem`, `EventEmitter`, and configure `jest.config.js`:
  ```javascript
  moduleNameMapper: {
    '^vscode$': '<rootDir>/test/mocks/vscode.ts'
  }
  ```

#### 6. Inverted Information Architecture in Document Structure

- **Reviewer Lenses:** `egm-structural`
- **Affected Scope:** [docs/designs/hackerrank_extension.md#L39-L49](file:///home/longlt/Long-Project/My-own-hackerrank/docs/designs/hackerrank_extension.md#L39-L49)
- **Discrepancy Description & Rationale:**
  Section 1.3 `## Resolved Design Decisions` appears prematurely before `## Proposed Solution` (L50) and `## Core Use Cases (CUJs)` (L81). A reader encounters architectural resolutions before knowing what system or user journeys are being proposed.
- **Remediation**:
  Move `Resolved Design Decisions` to the end of Section 1 or relocate after `Core Use Cases (CUJs)` under `Technical Architecture`.

#### 7. Runtime Dependency on `tsx` for Packaged VSIX Extension

- **Reviewer Lenses:** `egm-implementation-readiness`, `egm-design`
- **Affected Scope:** [docs/designs/hackerrank_extension.md#L245-L247](file:///home/longlt/Long-Project/My-own-hackerrank/docs/designs/hackerrank_extension.md#L245-L247), [L308-L310](file:///home/longlt/Long-Project/My-own-hackerrank/docs/designs/hackerrank_extension.md#L308-L310)
- **Discrepancy Description & Rationale:**
  `tsx` is listed under `devDependencies`. When the extension is packaged into a production `.vsix` file, `devDependencies` are omitted. Running `npx tsx solution.ts` at runtime will fail if the end user does not have `npx` or global `tsx` installed.
- **Remediation**:
  Move `tsx` to production `dependencies` in `package.json`, or bundle `esbuild` to transpile TypeScript to in-memory JavaScript before executing with `node`.

---

### 🟡 Major Findings

#### 8. Subprocess Execution Deadlock, Missing Timeout & Cancellation

- **Reviewer Lenses:** `egm-zoom-out`, `egm-design`, `egm-codebase-details`
- **Affected Scope:** [docs/designs/hackerrank_extension.md#L170-L179](file:///home/longlt/Long-Project/My-own-hackerrank/docs/designs/hackerrank_extension.md#L170-L179), [L308-L315](file:///home/longlt/Long-Project/My-own-hackerrank/docs/designs/hackerrank_extension.md#L308-L315)
- **Discrepancy Description & Rationale:**
  `LocalTestRunner` uses `child_process.spawn` without an execution timeout or `maxBuffer` cap. If a user's solution contains an infinite loop (`while(true)`), the extension hangs indefinitely. Large outputs (>64KB) will deadlock stdout/stderr pipes.
- **Remediation**:
  Enforce a strict 5000ms timeout with `SIGKILL` on the spawned child process. Normalize CRLF (`\r\n` -> `\n`) and trim trailing whitespace during diff comparison.

#### 9. Class Proliferation & Redundant Passthrough (`RemoteJudgeClient`)

- **Reviewer Lenses:** `egm-zoom-out`
- **Affected Scope:** [docs/designs/hackerrank_extension.md#L111](file:///home/longlt/Long-Project/My-own-hackerrank/docs/designs/hackerrank_extension.md#L111), [L141-L143](file:///home/longlt/Long-Project/My-own-hackerrank/docs/designs/hackerrank_extension.md#L141-L143), [L180-L184](file:///home/longlt/Long-Project/My-own-hackerrank/docs/designs/hackerrank_extension.md#L180-L184), [L317-L323](file:///home/longlt/Long-Project/My-own-hackerrank/docs/designs/hackerrank_extension.md#L317-L323)
- **Discrepancy Description & Rationale:**
  `HackerRankAPIClient` already implements `submitCode` and `pollSubmission`. `RemoteJudgeClient` is an unnecessary passthrough layer that merely forwards calls from `ProblemWebviewPanel` to `HackerRankAPIClient`.
- **Remediation**:
  Delete `RemoteJudgeClient`. Have `ProblemWebviewPanel` call `HackerRankAPIClient` directly.

#### 10. Missing Git Guards & Uninitialized Workspace Failures

- **Reviewer Lenses:** `egm-zoom-out`, `egm-design`, `egm-codebase-details`, `egm-implementation-readiness`
- **Affected Scope:** [docs/designs/hackerrank_extension.md#L76-L79](file:///home/longlt/Long-Project/My-own-hackerrank/docs/designs/hackerrank_extension.md#L76-L79), [L185-L191](file:///home/longlt/Long-Project/My-own-hackerrank/docs/designs/hackerrank_extension.md#L185-L191), [L324-L332](file:///home/longlt/Long-Project/My-own-hackerrank/docs/designs/hackerrank_extension.md#L324-L332)
- **Discrepancy Description & Rationale:**
  1. The workspace may not be an initialized Git repository, and `origin` may not exist. Blindly running `git add . && git commit && git push origin HEAD` throws `fatal: not a git repository`.
  2. Bypasses VS Code's native `vscode.git` API, SSH key agents, and GPG signing.
  3. `GitSyncService.syncSolution(trackSlug, challengeSlug, language)` omits `chapterSlug`, preventing construction of the documented path `tracks/{track_slug}/{chapter_slug}/{challenge_slug}/`.
- **Remediation**:
  - Update signature: `syncSolution(trackSlug, chapterSlug, challengeSlug, language)`.
  - Guard: Check `vscode.workspace.workspaceFolders`, verify `git rev-parse --is-inside-work-tree`, prompt user to `git init` if missing, or use VS Code Git API to stage and prefill commit message.

#### 11. Missing Webview Content Security Policy (CSP) & KaTeX Asset Resolution

- **Reviewer Lenses:** `egm-codebase-details`, `egm-design`, `egm-implementation-readiness`
- **Affected Scope:** [docs/designs/hackerrank_extension.md#L61](file:///home/longlt/Long-Project/My-own-hackerrank/docs/designs/hackerrank_extension.md#L61), [L333-L343](file:///home/longlt/Long-Project/My-own-hackerrank/docs/designs/hackerrank_extension.md#L333-L343)
- **Discrepancy Description & Rationale:**
  Loading KaTeX CSS and WOFF2 fonts in a VS Code Webview requires `localResourceRoots: [vscode.Uri.file(...)]` and `webview.asWebviewUri(...)`. Rendering raw `body_html` without an explicit CSP or sanitization poses an XSS vulnerability.
- **Remediation**:
  Configure `localResourceRoots` pointing to the extension's media/katex folder, add `<meta http-equiv="Content-Security-Policy">` with `default-src 'none'; style-src ${webview.cspSource}; font-src ${webview.cspSource}; script-src 'nonce-...';`, and sanitize `body_html` with DOMPurify.

#### 12. Asynchronous `SecretStorage` vs Synchronous `isLoggedIn()` Signature

- **Reviewer Lenses:** `egm-codebase-details`, `egm-implementation-readiness`
- **Affected Scope:** [docs/designs/hackerrank_extension.md#L268-L269](file:///home/longlt/Long-Project/My-own-hackerrank/docs/designs/hackerrank_extension.md#L268-L269)
- **Discrepancy Description & Rationale:**
  `context.secrets.get()` returns `Thenable<string | undefined>`. Typing `isLoggedIn(): boolean` is an asynchronous signature bug.
- **Remediation**:
  Update signature to `async isLoggedIn(): Promise<boolean>`.

#### 13. Undefined HackerRank API Response Contracts & Interfaces (Aligned with `hackerrank-vscode`)

- **Reviewer Lenses:** `egm-implementation-readiness`, `egm-comprehension`, `user-recommendation`
- **Affected Scope:** [docs/designs/hackerrank_extension.md#L271-L280](file:///home/longlt/Long-Project/My-own-hackerrank/docs/designs/hackerrank_extension.md#L271-L280)
- **Discrepancy Description & Rationale:**
  No TypeScript interface definitions existed in the design for API responses, challenge metadata, and submission payloads.
- **Remediation & Reference Alignment:**
  Following the architecture of `suyash-purwar/hackerrank-vscode/src/modules/interface/`, define explicit typed models in `src/types/hackerrank.ts`:
  - `IChallenge`: `id`, `slug`, `name`, `trackSlug`, `languages: string[]`, `difficulty`, `questionHtml` (`body_html`), `languagesBoilerplate: Record<string, string>` (extracting `${lang}_template_head`, `${lang}_template`, `${lang}_template_tail`).
  - `ITrack`: `id`, `name`, `slug`, `description`.
  - `ITrackChallenges`: `id`, `slug`, `name`, `description`, `difficulty`.
  - `ISolution`: `{ code: string; language: string; }`.
  - `ISession`: `{ email?: string; csrf_token?: string; hackerrank_cookie?: string; }`.
  - `ISubmissionResponse` / `apiPoller`: Polls `model.status !== 'Processing'` with incremental backoff (`500ms + 200ms * tries`, max 5-10 tries).
  - Default JS/TS boilerplate fallback when custom template is absent: `function processData(input) { ... }` with standard Node stdin reader.

#### 14. Destructive Solution Scaffolding Overwrites

- **Reviewer Lenses:** `egm-codebase-details`, `egm-comprehension`
- **Affected Scope:** [docs/designs/hackerrank_extension.md#L154-L162](file:///home/longlt/Long-Project/My-own-hackerrank/docs/designs/hackerrank_extension.md#L154-L162), [L301-L305](file:///home/longlt/Long-Project/My-own-hackerrank/docs/designs/hackerrank_extension.md#L301-L305)
- **Discrepancy Description & Rationale:**
  Clicking a challenge re-invokes `WorkspaceScaffolder`. Unconditionally writing `solution.ts` obliterates previously written user code.
- **Remediation**:
  Check `fs.existsSync(solutionPath)` before writing. If it exists, skip template writing and open the existing file.

#### 15. Single-Sample Test Case Limitation

- **Reviewer Lenses:** `egm-codebase-details`, `egm-comprehension`
- **Affected Scope:** [docs/designs/hackerrank_extension.md#L160-L162](file:///home/longlt/Long-Project/My-own-hackerrank/docs/designs/hackerrank_extension.md#L160-L162), [L303](file:///home/longlt/Long-Project/My-own-hackerrank/docs/designs/hackerrank_extension.md#L303)
- **Discrepancy Description & Rationale:**
  Hardcoding `tests/input_0.txt` and `output_0.txt` fails challenges with multiple sample test cases.
- **Remediation**:
  Iterate through `challenge.sample_test_cases` to scaffold `tests/input_${i}.txt` and `tests/output_${i}.txt`.

---

### 🟢 Nit Findings

#### 16. Superfluous Dependencies (`ejs`, `markdown-it`) vs Native TS Template Literals

- **Reviewer Lenses:** `egm-zoom-out`, `egm-codebase-details`
- **Affected Scope:** [docs/designs/hackerrank_extension.md#L158](file:///home/longlt/Long-Project/My-own-hackerrank/docs/designs/hackerrank_extension.md#L158), [L245](file:///home/longlt/Long-Project/My-own-hackerrank/docs/designs/hackerrank_extension.md#L245)
- **Remediation**: Drop `ejs`. Use TypeScript template literals for rendering HTML in `ProblemWebviewPanel`.

#### 17. Inconsistent Git Commit Message Template

- **Reviewer Lenses:** `egm-design`, `egm-implementation-readiness`, `egm-structural`
- **Affected Scope:** [docs/designs/hackerrank_extension.md#L48](file:///home/longlt/Long-Project/My-own-hackerrank/docs/designs/hackerrank_extension.md#L48), [L329](file:///home/longlt/Long-Project/My-own-hackerrank/docs/designs/hackerrank_extension.md#L329), [L417](file:///home/longlt/Long-Project/My-own-hackerrank/docs/designs/hackerrank_extension.md#L417)
- **Remediation**: Standardize format to `feat({track_slug}): solve {challenge_slug} in {language}` everywhere.

#### 18. CI Build Script Chaining Ambiguity

- **Reviewer Lenses:** `egm-codebase-details`
- **Affected Scope:** [docs/designs/hackerrank_extension.md#L247](file:///home/longlt/Long-Project/My-own-hackerrank/docs/designs/hackerrank_extension.md#L247), [L386](file:///home/longlt/Long-Project/My-own-hackerrank/docs/designs/hackerrank_extension.md#L386)
- **Remediation**: Define `"compile": "tsc -p ./ && npm run copy-assets"` in `package.json`.

#### 19. Unstated Workstation Prerequisites

- **Reviewer Lenses:** `egm-comprehension`
- **Affected Scope:** [docs/designs/hackerrank_extension.md#L26](file:///home/longlt/Long-Project/My-own-hackerrank/docs/designs/hackerrank_extension.md#L26), [L170](file:///home/longlt/Long-Project/My-own-hackerrank/docs/designs/hackerrank_extension.md#L170)
- **Remediation**: Add a Prerequisites section listing `git` and `node >= 18` (Java completely eliminated).

#### 20. Unused Remote API Endpoint (`compile_tests`)

- **Reviewer Lenses:** `egm-comprehension`
- **Affected Scope:** [docs/designs/hackerrank_extension.md#L121](file:///home/longlt/Long-Project/My-own-hackerrank/docs/designs/hackerrank_extension.md#L121), [L141-L143](file:///home/longlt/Long-Project/My-own-hackerrank/docs/designs/hackerrank_extension.md#L141-L143)
- **Remediation**: Mark `compile_tests` as reserved for optional future cloud test runs or prune from minimal API client.

#### 21. VS Code API Monospace Tokens Missing Documentation Hyperlinks

- **Reviewer Lenses:** `egm-structural`
- **Affected Scope:** [docs/designs/hackerrank_extension.md#L55](file:///home/longlt/Long-Project/My-own-hackerrank/docs/designs/hackerrank_extension.md#L55), [L132](file:///home/longlt/Long-Project/My-own-hackerrank/docs/designs/hackerrank_extension.md#L132), [L146](file:///home/longlt/Long-Project/My-own-hackerrank/docs/designs/hackerrank_extension.md#L146)
- **Remediation**: Wrap `vscode.*` identifiers with clickable links to official VS Code API docs.

#### 22. Altitude Boilerplate in Section 5

- **Reviewer Lenses:** `egm-zoom-out`
- **Affected Scope:** [docs/designs/hackerrank_extension.md#L344-L397](file:///home/longlt/Long-Project/My-own-hackerrank/docs/designs/hackerrank_extension.md#L344-L397)
- **Remediation**: Condense generic devDependencies and JSON configs to emphasize custom architectural configurations.

---

## Traceability Matrix

| Finding ID |  Severity  | Short Title                                            | Reviewer Source(s)                                                                                        | Action Item / Status                                                     |
| :--------- | :--------: | :----------------------------------------------------- | :-------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------- |
| **#1**     | 🔴 Blocker | Headed Playwright OAuth & Missing Runtime              | `egm-zoom-out`, `egm-design`, `egm-codebase-details`, `egm-comprehension`, `egm-implementation-readiness` | Replace with system browser channel / loopback + manual cookie fallback  |
| **#2**     | 🔴 Blocker | Undefined Submission API Payload Contract              | `egm-zoom-out`, `egm-comprehension`, `egm-implementation-readiness`                                       | Define payload schema & solution demarcation boundary                    |
| **#3**     | 🔴 Blocker | Drop Java & Enforce TS/JS Language Filter              | `user-decision`, `egm-zoom-out`, `egm-codebase-details`                                                   | Drop Java completely; return null if problem lacks TS/JS support         |
| **#4**     | 🔴 Blocker | Missing HTML-to-Markdown Dependency                    | `egm-comprehension`, `egm-codebase-details`                                                               | Add `turndown` & `@types/turndown` to `package.json`                     |
| **#5**     | 🔴 Blocker | Jest Config Missing `vscode` Module Mock               | `egm-codebase-details`, `egm-implementation-readiness`                                                    | Add `test/mocks/vscode.ts` & `moduleNameMapper`                          |
| **#6**     | 🔴 Blocker | Inverted Information Architecture                      | `egm-structural`                                                                                          | Relocate `Resolved Design Decisions` after CUJs                          |
| **#7**     | 🔴 Blocker | Runtime Dependency on `tsx` in VSIX                    | `egm-implementation-readiness`, `egm-design`                                                              | Move `tsx` to production dependencies or bundle transpile step           |
| **#8**     |  🟡 Major  | Subprocess Timeout & Output Normalization              | `egm-zoom-out`, `egm-design`, `egm-codebase-details`                                                      | Enforce 5000ms timeout, `SIGKILL`, and CRLF/LF whitespace normalization  |
| **#9**     |  🟡 Major  | Class Proliferation (`RemoteJudgeClient`)              | `egm-zoom-out`                                                                                            | Delete `RemoteJudgeClient`, wire Webview directly to API client          |
| **#10**    |  🟡 Major  | Missing Git Guards & Uninitialized Repo                | `egm-zoom-out`, `egm-design`, `egm-codebase-details`, `egm-implementation-readiness`                      | Add `chapterSlug`, verify workspace git init, guard uninitialized states |
| **#11**    |  🟡 Major  | Webview CSP & KaTeX Asset URI Mapping                  | `egm-codebase-details`, `egm-design`, `egm-implementation-readiness`                                      | Add strict CSP meta tag, `localResourceRoots`, and DOMPurify             |
| **#12**    |  🟡 Major  | Async `SecretStorage` vs Sync `isLoggedIn`             | `egm-codebase-details`, `egm-implementation-readiness`                                                    | Change `isLoggedIn()` return type to `Promise<boolean>`                  |
| **#13**    |  🟡 Major  | Typed API Contracts (Aligned with `hackerrank-vscode`) | `user-recommendation`, `egm-readiness`, `egm-comprehension`                                               | Adopt IChallenge, ITrack, ISolution, apiPoller from reference repo       |
| **#14**    |  🟡 Major  | Destructive Solution Overwriting                       | `egm-codebase-details`, `egm-comprehension`                                                               | Add `fs.existsSync` guard before scaffolding starter code                |
| **#15**    |  🟡 Major  | Single-Sample Test Case Limitation                     | `egm-codebase-details`, `egm-comprehension`                                                               | Iterate all `sample_test_cases` for `input_{i}.txt` / `output_{i}.txt`   |
| **#16**    |   🟢 Nit   | Drop Superfluous `ejs` Dependency                      | `egm-zoom-out`, `egm-codebase-details`                                                                    | Replace with TypeScript template literals                                |
| **#17**    |   🟢 Nit   | Standardize Git Commit Message Format                  | `egm-design`, `egm-implementation-readiness`, `egm-structural`                                            | Unify to `feat({track_slug}): solve {challenge_slug} in {language}`      |
| **#18**    |   🟢 Nit   | CI Build Script Chaining                               | `egm-codebase-details`                                                                                    | Chain `tsc -p ./ && npm run copy-assets`                                 |
| **#19**    |   🟢 Nit   | Add Host Prerequisites Documentation                   | `egm-comprehension`                                                                                       | Document `git`, `node >= 18`, and `java` requirements                    |
| **#20**    |   🟢 Nit   | Clarify Unused `compile_tests` Endpoint                | `egm-comprehension`                                                                                       | Mark optional / future or prune                                          |
| **#21**    |   🟢 Nit   | VS Code API Monospace Links                            | `egm-structural`                                                                                          | Add hyperlinks to official VS Code API documentation                     |
| **#22**    |   🟢 Nit   | Section 5 Altitude Condensation                        | `egm-zoom-out`                                                                                            | Prune low-level repetitive configs in favor of architectural specs       |
