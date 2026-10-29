# HackerRank Native for VS Code & Antigravity

[![VS Code Extension](https://img.shields.io/badge/VS%20Code-Extension-blue?logo=visualstudiocode)](https://marketplace.visualstudio.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)

**HackerRank Native** is a lightweight, cloud-native VS Code and Antigravity IDE extension that allows you to browse, code, test, and submit HackerRank challenges directly within your editor — without touching your local file workspace or installing local language runtimes.

---

## ✨ Features

- **Explorer Tree View**: Browse tracks (Algorithms, Data Structures, etc.), chapters, and challenges right from the Activity Bar.
- **Visual Solved Indicators**: Instant recognition of solved challenges with green checkmarks (`✓`) and unsolved challenges with empty indicators.
- **Non-Invasive Sandbox**: Solution files are safely created and managed in global extension storage. Your project workspace is never polluted.
- **Multi-Language Support**: Switch languages seamlessly via QuickPick (`Python 3`, `TypeScript`, `C++`, `Java 8`, `Go`, `Rust`, `C#`, etc.) with automatic template assembly and language persistence.
- **Side-by-Side Webview**: Beautiful problem descriptions rendered with KaTeX for mathematical notation, with action buttons to Run, Submit, Change Language, and Export.
- **100% Cloud Remote Execution**:
  - **Run Code**: Triggers remote sample tests via HackerRank compile APIs.
  - **Submit Solution**: Submits your solution to the official HackerRank evaluation judge and displays testcase verdicts in real-time.
- **Export Solution**: Save your finished code to any local folder or project workspace whenever you choose.
- **Flexible & Secure Authentication**:
  - **Google OAuth / Browser Sync**: 1-click loopback synchronization with your default browser.
  - **Manual Session Cookie**: Direct cookie sign-in fallback with automated CSRF extraction.
  - **Secure Storage**: Credentials stored via VS Code's OS Keyring (`SecretStorage`).

---

## 🚀 Quick Start

### 1. Installation

Package and install the extension:

```bash
# Package the extension
npx @vscode/vsce package

# Install into VS Code or Antigravity
code --install-extension hackerrank-native-0.1.0.vsix
```

### 2. Sign In

1. Open the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`).
2. Run **`HackerRank: Sign In (Google OAuth)`**:
   - Your browser will open the HackerRank login page.
   - The sync script is automatically copied to your clipboard.
   - After signing in on the browser, paste into the address bar or DevTools Console to complete the 1-click handshake.
3. _Alternative_: Run **`HackerRank: Sign In with Cookie (Direct)`** and paste your `_hrank_session` cookie.

### 3. Solving Challenges

1. Open the **HackerRank** icon on the Activity Bar.
2. Expand a Track (e.g. _Algorithms_) and Chapter (e.g. _Warmup_).
3. Click any challenge to open the problem description side-by-side with your solution file.
4. Write your solution in the editor tab.
5. Click **▶ Run Code** to test against sample test cases, or **⬆ Submit Solution** to submit to the official judge.
6. Click **💾 Save Solution...** to export your code to your local machine.

---

## 🛠 Available Commands

| Command                        | Title                                      | Description                                                     |
| :----------------------------- | :----------------------------------------- | :-------------------------------------------------------------- |
| `hackerrank.signin`            | `HackerRank: Sign In (Google OAuth)`       | Connect your HackerRank account via browser loopback handshake. |
| `hackerrank.signinManual`      | `HackerRank: Sign In with Cookie (Direct)` | Sign in by pasting your session cookie and CSRF token.          |
| `hackerrank.checkStatus`       | `HackerRank: Check Login Status`           | Verify current active session and username.                     |
| `hackerrank.logout`            | `HackerRank: Sign Out`                     | Clear saved credentials from secure storage.                    |
| `hackerrank.refreshChallenges` | `HackerRank: Refresh Challenges`           | Reload tracks, chapters, and challenge status.                  |

---

## 🔒 Security & Privacy

- **No Hardcoded Credentials**: Your session cookies and CSRF tokens are stored exclusively in your operating system's native keychain (`vscode.secrets`) with plaintext fallback excluded from cloud sync (`setKeysForSync([])`).
- **Path Traversal Protection**: All file paths and language slugs are strictly validated (`/^[a-z0-9_-]+$/`).
- **Content Security Policy**: Webviews enforce strict CSP headers, nonce-based script execution, and sanitized HTML descriptions.

---

## 💻 Development & Testing

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Run automated test suite (Jest)
npm test

# Lint codebase
npm run lint
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
