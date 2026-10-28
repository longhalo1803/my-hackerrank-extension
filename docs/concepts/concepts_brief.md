# HackerRank Extension for Antigravity IDE & VS Code Forks

- **Author:** longlt
- **Date:** 2026-10-28
- **Target Platforms:** Antigravity IDE, Cursor, Windsurf, VS Code (Code-OSS forks)
- **Status:** In Ideation / Brainstorming (EGM)

## Overview

A native VS Code/Antigravity extension allowing developers to browse, download, solve, locally test, and submit HackerRank challenges directly within the IDE without using the HackerRank browser code editor.

## Architecture & Platform Scope

### 1. Scope Boundary: VS Code Ecosystem Exclusivity

- **Target Platforms**: Strictly restricted to Antigravity IDE and VS Code forks (Cursor, Windsurf, VSCodium). Zed support is explicitly excluded.
- **Benefits of Elimination**:
  - Eliminates the need for external local servers or floating companion windows.
  - Native access to `vscode.window.createTreeView` for hierarchical problem navigation.
  - Native access to `vscode.window.createWebviewPanel` for rich problem rendering with KaTeX and math typesetting.
  - Native access to `vscode.SecretStorage` for secure session token storage.

### 2. Core Modules Architecture

```
[Activity Bar]
      │
      ▼
[Challenges TreeView] ──► HackerRank REST API (/tracks, /chapters, /challenges)
      │ (User selects problem)
      ▼
[Workspace Manager] ────► Scaffolds ./hackerrank/{track}/{slug}/solution.<ext>
      │
 ┌────┴────────────────────────┐
 ▼                             ▼
[Problem Webview]       [Dual-Judge Runner]
Render Markdown/KaTeX   1. Local: child_process executes code against sample testcases
                        2. Remote: POST /compile_tests & /submissions with session
```

### 3. Key Subsystems

- **`AuthManager`**:
  - Headed Chromium instance via `playwright-core` launched on user request (`HackerRank: Login`).
  - User signs in via Google OAuth directly in the browser window.
  - Script intercepts `_hrank_session` cookie and CSRF token upon completion.
  - Closes browser and saves session into `context.secrets`.
- **`ChallengeExplorer`**:
  - TreeDataProvider implementing a 3-tier hierarchy: Track -> Chapter -> Challenge.
  - Badges for difficulty (Easy, Medium, Hard) and completion status.
- **`ChallengeWorkspace`**:
  - Scaffolds files directly into the active workspace directory.
  - Assembles template boilerplate: `<lang>_template_head` + `<lang>_template` + `<lang>_template_tail`.
- **`JudgeRunner`**:
  - Local Engine: Spawns local compilers/interpreters (`python3`, `g++`, `node`) against extracted sample test cases.
  - Remote Engine: Calls HackerRank `/compile_tests` and `/submissions` endpoints and polls verdict.

## Goals vs. Non-Goals

### In-Scope Goals

- 100% native in-editor experience for Antigravity IDE.
- Automated Google OAuth login without manual cookie extraction.
- Offline problem solving and sample test case verification.
- Direct in-editor submission to official HackerRank profile.
- Full Markdown and math formula rendering (KaTeX) inside Webview.

### Out-of-Scope Non-Goals

- Support for non-VS-Code editors (Zed, Neovim, JetBrains).
- Enterprise recruitment workflows (HackerRank for Work).
- Storing unencrypted user passwords.

## Key Decisions & Staging for Next Steps

1. **Runtime & Language**: TypeScript (`@types/vscode`), Node.js runtime.
2. **Webview UI Stack**: Pure TypeScript + Template Strings / EJS. Loại bỏ Vite + React để tránh bloat và phức tạp hóa build pipeline không cần thiết.
3. **Browser Automation**: `playwright-core` to minimize package bloat.
