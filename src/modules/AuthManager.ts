import * as vscode from 'vscode';
import { ISession } from '../types/hackerrank';

export class AuthManager {
  private static readonly SECRET_COOKIE_KEY = 'hackerrank_cookie';
  private static readonly SECRET_CSRF_KEY = 'hackerrank_csrf';
  private static readonly AUTH_METHOD_KEY = 'hackerrank_auth_method';

  constructor(private readonly context: vscode.ExtensionContext) {
    if (this.context.globalState?.setKeysForSync) {
      try {
        this.context.globalState.setKeysForSync([]);
      } catch (err: any) {
        console.warn(
          '[AuthManager] setKeysForSync not supported in this environment:',
          err?.message,
        );
      }
    }
  }

  async getSession(): Promise<ISession | null> {
    let cookie: string | undefined;
    let csrfToken: string | undefined;
    let authMethod: 'cookie' | undefined;

    try {
      cookie = await this.context.secrets.get(AuthManager.SECRET_COOKIE_KEY);
      csrfToken = await this.context.secrets.get(AuthManager.SECRET_CSRF_KEY);
      authMethod = (await this.context.secrets.get(
        AuthManager.AUTH_METHOD_KEY,
      )) as 'cookie' | undefined;
    } catch (err: any) {
      console.warn(
        '[AuthManager] SecretStorage read failed, falling back to globalState:',
        err?.message,
      );
    }

    if (!cookie && this.context.globalState) {
      try {
        cookie = this.context.globalState.get<string>(
          AuthManager.SECRET_COOKIE_KEY,
        );
        csrfToken = this.context.globalState.get<string>(
          AuthManager.SECRET_CSRF_KEY,
        );
        authMethod = this.context.globalState.get<'cookie'>(
          AuthManager.AUTH_METHOD_KEY,
        );
      } catch (err: any) {
        console.warn('[AuthManager] globalState read failed:', err?.message);
        return null;
      }
    }

    if (!cookie) {
      return null;
    }

    return {
      hackerrank_cookie: cookie,
      csrf_token: csrfToken,
      auth_method: authMethod,
    };
  }

  async saveSession(session: ISession): Promise<void> {
    let savedToSecrets = false;
    let secretsError: Error | null = null;

    try {
      if (session.hackerrank_cookie) {
        await this.context.secrets.store(
          AuthManager.SECRET_COOKIE_KEY,
          session.hackerrank_cookie,
        );
      }
      if (session.csrf_token) {
        await this.context.secrets.store(
          AuthManager.SECRET_CSRF_KEY,
          session.csrf_token,
        );
      } else {
        await this.context.secrets.delete(AuthManager.SECRET_CSRF_KEY);
      }
      if (session.auth_method) {
        await this.context.secrets.store(
          AuthManager.AUTH_METHOD_KEY,
          session.auth_method,
        );
      } else {
        await this.context.secrets.delete(AuthManager.AUTH_METHOD_KEY);
      }
      savedToSecrets = true;

      // Clear plaintext fallback from globalState if secretStorage succeeded
      if (this.context.globalState) {
        try {
          await this.context.globalState.update(
            AuthManager.SECRET_COOKIE_KEY,
            undefined,
          );
          await this.context.globalState.update(
            AuthManager.SECRET_CSRF_KEY,
            undefined,
          );
          await this.context.globalState.update(
            AuthManager.AUTH_METHOD_KEY,
            undefined,
          );
        } catch (cleanupErr: any) {
          console.warn(
            '[AuthManager] Failed to clear plaintext fallback from globalState:',
            cleanupErr?.message,
          );
        }
      }
    } catch (err: any) {
      secretsError = err;
      vscode.window.showWarningMessage(
        `Secure OS Keyring unavailable (${err.message || 'Keyring error'}). Session saved in extension local storage.`,
      );
    }

    if (!savedToSecrets && this.context.globalState) {
      try {
        if (session.hackerrank_cookie) {
          await this.context.globalState.update(
            AuthManager.SECRET_COOKIE_KEY,
            session.hackerrank_cookie,
          );
        }
        if (session.csrf_token) {
          await this.context.globalState.update(
            AuthManager.SECRET_CSRF_KEY,
            session.csrf_token,
          );
        } else {
          await this.context.globalState.update(
            AuthManager.SECRET_CSRF_KEY,
            undefined,
          );
        }
        if (session.auth_method) {
          await this.context.globalState.update(
            AuthManager.AUTH_METHOD_KEY,
            session.auth_method,
          );
        } else {
          await this.context.globalState.update(
            AuthManager.AUTH_METHOD_KEY,
            undefined,
          );
        }
      } catch (globalErr: any) {
        throw new Error(
          `Failed to persist session to both SecretStorage and globalState. Keyring error: ${secretsError?.message}, GlobalState error: ${globalErr.message}`,
        );
      }
    }
  }

  async isLoggedIn(): Promise<boolean> {
    try {
      const session = await this.getSession();
      return Boolean(
        session &&
        session.hackerrank_cookie &&
        session.hackerrank_cookie.length > 0,
      );
    } catch (err: any) {
      console.warn(
        '[AuthManager] isLoggedIn check encountered error:',
        err?.message,
      );
      return false;
    }
  }

  async logout(): Promise<void> {
    try {
      await this.context.secrets.delete(AuthManager.SECRET_COOKIE_KEY);
      await this.context.secrets.delete(AuthManager.SECRET_CSRF_KEY);
      await this.context.secrets.delete(AuthManager.AUTH_METHOD_KEY);
    } catch (err: any) {
      console.warn(
        '[AuthManager] Failed to delete credentials from SecretStorage:',
        err?.message,
      );
    }
    if (this.context.globalState) {
      try {
        await this.context.globalState.update(
          AuthManager.SECRET_COOKIE_KEY,
          undefined,
        );
        await this.context.globalState.update(
          AuthManager.SECRET_CSRF_KEY,
          undefined,
        );
        await this.context.globalState.update(
          AuthManager.AUTH_METHOD_KEY,
          undefined,
        );
      } catch (err: any) {
        vscode.window.showWarningMessage(
          `Could not clear local session storage: ${err.message}`,
        );
      }
    }
    vscode.window.showInformationMessage('Signed out from HackerRank.');
  }

  formatCookieString(raw: string): string {
    let cleaned = raw.replace(/[\r\n\0-\x1F\x7F]/g, '').trim();
    if (cleaned.toLowerCase().startsWith('cookie:')) {
      cleaned = cleaned.substring(7).trim();
    }
    if (cleaned.includes('_hrank_session=')) {
      return cleaned;
    }
    return `_hrank_session=${cleaned}`;
  }

  async verifySessionWithServer(
    cookie: string,
  ): Promise<{ id: number; username: string } | null> {
    try {
      const resp = await fetch('https://www.hackerrank.com/rest/hackers/me', {
        headers: {
          Cookie: cookie,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });
      if (!resp.ok) {
        return null;
      }
      const data = (await resp.json()) as any;
      if (data?.status && data?.model?.username) {
        return {
          id: data.model.id,
          username: data.model.username,
        };
      }
      return null;
    } catch (err: any) {
      console.warn(
        '[AuthManager] verifySessionWithServer network error:',
        err?.message,
      );
      return null;
    }
  }

  async getCurrentUser(): Promise<{ id: number; username: string } | null> {
    const session = await this.getSession();
    if (!session?.hackerrank_cookie) {
      return null;
    }
    return this.verifySessionWithServer(session.hackerrank_cookie);
  }

  async fetchCsrfToken(cookie?: string): Promise<string | undefined> {
    const headers: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    };
    if (cookie) {
      headers['Cookie'] = cookie;
    }

    const testUrls = [
      'https://www.hackerrank.com/dashboard',
      'https://www.hackerrank.com/settings/profile',
    ];

    const csrfPatterns = [
      /<meta\s+name=["']csrf-token["']\s+content=["']([^"']+)["']/i,
      /<meta\s+content=["']([^"']+)["']\s+name=["']csrf-token["']/i,
      /csrf[_-]?token["']?\s*[:=]\s*["']([a-zA-Z0-9_\-\.\+/=]+)["']/i,
    ];

    for (const url of testUrls) {
      try {
        const resp = await fetch(url, { headers });
        if (!resp.ok) {
          continue;
        }

        const html = await resp.text();
        for (const pattern of csrfPatterns) {
          const match = html.match(pattern);
          if (match && match[1]) {
            return match[1];
          }
        }
      } catch (err: any) {
        console.warn(
          `[AuthManager] Failed to fetch CSRF token from ${url}:`,
          err?.message,
        );
      }
    }

    return undefined;
  }

  async loginWithCookie(): Promise<boolean> {
    try {
      const cookieInput = await vscode.window.showInputBox({
        prompt:
          'Enter your HackerRank cookie (e.g. _hrank_session=... or full Cookie header from DevTools)',
        placeHolder: '_hrank_session=...',
        password: true,
        ignoreFocusOut: true,
      });

      if (!cookieInput || cookieInput.trim().length === 0) {
        return false;
      }

      const formattedCookie = this.formatCookieString(cookieInput);

      const csrfInput = await vscode.window.showInputBox({
        prompt:
          'Enter your HackerRank X-CSRF-Token (optional: from DevTools Network headers; press Enter to auto-extract)',
        placeHolder: 'X-CSRF-Token (optional)',
        password: false,
        ignoreFocusOut: true,
      });

      let csrfToken = csrfInput
        ? csrfInput.replace(/[\r\n\0-\x1F\x7F]/g, '').trim()
        : undefined;

      if (!csrfToken) {
        csrfToken = await this.fetchCsrfToken(formattedCookie);
      }

      const user = await this.verifySessionWithServer(formattedCookie);
      if (!user) {
        const choice = await vscode.window.showWarningMessage(
          'HackerRank server did not recognize an active login session with this cookie. Save anyway?',
          'Save Anyway',
          'Cancel',
        );
        if (choice !== 'Save Anyway') {
          return false;
        }
      }

      await this.saveSession({
        hackerrank_cookie: formattedCookie,
        csrf_token: csrfToken,
        auth_method: 'cookie',
        auth_time: Date.now(),
      });

      if (user) {
        vscode.window.showInformationMessage(
          `[HackerRank] Đăng nhập thành công! User: ${user.username} (ID: ${user.id}). CSRF token: ${csrfToken ? 'attached' : 'pending'}.`,
        );
      } else {
        vscode.window.showInformationMessage(
          '[HackerRank] Session cookie đã được lưu.',
        );
      }
      return true;
    } catch (err: any) {
      vscode.window.showErrorMessage(
        `Failed to save session cookie: ${err.message}`,
      );
      return false;
    }
  }

  dispose(): void {
    // No-op for cookie-based authentication
  }
}
