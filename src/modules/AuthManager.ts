import * as vscode from 'vscode';
import * as http from 'http';
import * as crypto from 'crypto';
import { ISession } from '../types/hackerrank';

export class AuthManager {
  private static readonly SECRET_COOKIE_KEY = 'hackerrank_cookie';
  private static readonly SECRET_CSRF_KEY = 'hackerrank_csrf';
  private activeServer: http.Server | null = null;

  constructor(private readonly context: vscode.ExtensionContext) {
    if (this.context.globalState?.setKeysForSync) {
      try {
        this.context.globalState.setKeysForSync([]);
      } catch {
        // Ignore environments where setKeysForSync is unsupported
      }
    }
  }

  async getSession(): Promise<ISession | null> {
    let cookie: string | undefined;
    let csrfToken: string | undefined;

    try {
      cookie = await this.context.secrets.get(AuthManager.SECRET_COOKIE_KEY);
      csrfToken = await this.context.secrets.get(AuthManager.SECRET_CSRF_KEY);
    } catch {
      // SecretStorage/Keyring read failed, transparently fall back to globalState
    }

    if (!cookie && this.context.globalState) {
      try {
        cookie = this.context.globalState.get<string>(
          AuthManager.SECRET_COOKIE_KEY,
        );
        csrfToken = this.context.globalState.get<string>(
          AuthManager.SECRET_CSRF_KEY,
        );
      } catch {
        return null;
      }
    }

    if (!cookie) {
      return null;
    }

    return {
      hackerrank_cookie: cookie,
      csrf_token: csrfToken,
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
      savedToSecrets = true;

      // Clean up plaintext fallback if secret store succeeded
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
        } catch {
          // Non-critical
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
    } catch {
      return false;
    }
  }

  async logout(): Promise<void> {
    try {
      await this.context.secrets.delete(AuthManager.SECRET_COOKIE_KEY);
      await this.context.secrets.delete(AuthManager.SECRET_CSRF_KEY);
    } catch {
      // Non-critical if secrets delete fails
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
      } catch (err: any) {
        vscode.window.showWarningMessage(
          `Could not clear local session storage: ${err.message}`,
        );
      }
    }
    vscode.window.showInformationMessage('Signed out from HackerRank.');
  }

  hasDisplayEnvironment(platform: string = process.platform): boolean {
    if (platform === 'darwin' || platform === 'win32') {
      return true;
    }
    return Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
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
    } catch {
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

  async fetchCsrfToken(cookie: string): Promise<string | undefined> {
    const userAgent =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

    try {
      const resp = await fetch('https://www.hackerrank.com/dashboard', {
        headers: {
          Cookie: cookie,
          'User-Agent': userAgent,
        },
      });
      if (resp.ok) {
        const html = await resp.text();
        const match =
          html.match(/"_csrf_token":\s*"([^"]+)"/) ||
          html.match(
            /<meta[^>]*content=["']([^"']+)["'][^>]*name=["']csrf-token["']/i,
          ) ||
          html.match(
            /<meta[^>]*name=["']csrf-token["'][^>]*content=["']([^"']+)["']/i,
          ) ||
          html.match(/name="csrf-token"\s+content="([^"]+)"/);
        if (match && match[1]) {
          return match[1];
        }
      }
    } catch {
      // Fallback to challenge page
    }

    try {
      const resp = await fetch(
        'https://www.hackerrank.com/challenges/simple-array-sum/problem',
        {
          headers: {
            Cookie: cookie,
            'User-Agent': userAgent,
          },
        },
      );
      if (resp.ok) {
        const html = await resp.text();
        const match =
          html.match(
            /<meta[^>]*content=["']([^"']+)["'][^>]*name=["']csrf-token["']/i,
          ) ||
          html.match(
            /<meta[^>]*name=["']csrf-token["'][^>]*content=["']([^"']+)["']/i,
          ) ||
          html.match(/"_csrf_token":\s*"([^"]+)"/) ||
          html.match(/name="csrf-token"\s+content="([^"]+)"/);
        if (match && match[1]) {
          return match[1];
        }
      }
    } catch {
      // Secondary fallback failed
    }

    return undefined;
  }

  async loginWithManualCookie(): Promise<boolean> {
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
      });

      if (user) {
        vscode.window.showInformationMessage(
          `HackerRank session verified! Logged in as ${user.username} (ID: ${user.id}). CSRF token: ${csrfToken ? 'attached' : 'pending'}.`,
        );
      } else {
        vscode.window.showInformationMessage('HackerRank session saved.');
      }
      return true;
    } catch (err: any) {
      vscode.window.showErrorMessage(
        `Failed to save manual session: ${err.message}`,
      );
      return false;
    }
  }

  async loginWithGoogle(): Promise<boolean> {
    await this.dispose();

    const stateToken = crypto.randomBytes(16).toString('hex');

    return new Promise<boolean>((resolve) => {
      let resolved = false;

      const finish = (result: boolean) => {
        if (!resolved) {
          resolved = true;
          this.dispose();
          resolve(result);
        }
      };

      this.activeServer = http.createServer(async (req, res) => {
        const reqUrl = new URL(
          req.url || '/',
          `http://${req.headers.host || '127.0.0.1'}`,
        );

        // Set permissive CORS for local bookmarklet / browser sync
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        if (reqUrl.pathname === '/callback') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
            if (body.length > 65536) req.destroy();
          });

          req.on('end', async () => {
            try {
              let cookie = '';
              let csrfToken: string | undefined;
              let providedToken = '';

              if (req.method === 'POST') {
                const parsed = JSON.parse(body);
                cookie = parsed.cookie || '';
                csrfToken = parsed.csrf_token || undefined;
                providedToken = parsed.state || '';
              } else {
                cookie = reqUrl.searchParams.get('cookie') || '';
                csrfToken = reqUrl.searchParams.get('csrf_token') || undefined;
                providedToken = reqUrl.searchParams.get('state') || '';
              }

              if (providedToken !== stateToken) {
                res.writeHead(403, {
                  'Content-Type': 'text/html; charset=utf-8',
                });
                res.end(
                  '<h3>Invalid security state token. Handshake rejected.</h3>',
                );
                return;
              }

              const formattedCookie = this.formatCookieString(cookie);
              if (!csrfToken) {
                csrfToken = await this.fetchCsrfToken(formattedCookie);
              }

              const user = await this.verifySessionWithServer(formattedCookie);
              if (!user) {
                res.writeHead(400, {
                  'Content-Type': 'text/html; charset=utf-8',
                });
                res.end(
                  '<h3>HackerRank session verification failed. Ensure you are signed in on HackerRank.</h3>',
                );
                vscode.window.showWarningMessage(
                  'Browser handshake received, but HackerRank session verification failed.',
                );
                finish(false);
                return;
              }

              await this.saveSession({
                hackerrank_cookie: formattedCookie,
                csrf_token: csrfToken,
              });

              res.writeHead(200, {
                'Content-Type': 'text/html; charset=utf-8',
              });
              res.end(`
                <body style="font-family: sans-serif; text-align: center; padding-top: 50px;">
                  <h2 style="color: #2ec866;">&#10004; HackerRank Login Connected!</h2>
                  <p>Authenticated as <b>${user.username}</b>. You can close this browser tab and return to VS Code.</p>
                </body>
              `);

              vscode.window.showInformationMessage(
                `Successfully connected to HackerRank as ${user.username}!`,
              );
              finish(true);
            } catch (err: any) {
              res.writeHead(500, {
                'Content-Type': 'text/html; charset=utf-8',
              });
              res.end(`<h3>Authentication error: ${err.message}</h3>`);
              vscode.window.showErrorMessage(`Callback error: ${err.message}`);
              finish(false);
            }
          });
        } else {
          res.writeHead(404);
          res.end('Not found');
        }
      });

      // Bind to ephemeral port on 127.0.0.1
      this.activeServer.listen(0, '127.0.0.1', () => {
        const address = this.activeServer?.address() as { port: number };
        const port = address.port;

        const syncScript = `javascript:(function(){const c=document.cookie;const m=document.querySelector('meta[name="csrf-token"]');const csrf=m?m.content:'';if(!c||!c.includes('_hrank_session')){alert('Please make sure you are logged in to HackerRank in this tab.');return;}fetch('http://127.0.0.1:${port}/callback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cookie:c,csrf_token:csrf,state:'${stateToken}'})}).then(r=>r.text()).then(h=>{document.body.innerHTML=h;}).catch(e=>alert('Sync error: '+e.message));})();`;

        // 1. Copy sync snippet to clipboard
        vscode.env.clipboard.writeText(syncScript);

        // 2. Open official HackerRank login / dashboard in system default browser
        vscode.env.openExternal(
          vscode.Uri.parse('https://www.hackerrank.com/auth/login'),
        );

        vscode.window
          .showInformationMessage(
            '1. Log in to HackerRank in your browser.\n2. Paste (Ctrl+V) the copied sync script into the browser URL bar (or run in DevTools Console).',
            'Paste Cookie Manually Instead',
          )
          .then((choice) => {
            if (choice === 'Paste Cookie Manually Instead') {
              finish(false);
              this.loginWithManualCookie();
            }
          });
      });

      this.activeServer.on('error', (err) => {
        vscode.window.showErrorMessage(
          `Failed to start auth listener: ${err.message}`,
        );
        finish(false);
      });

      // Timeout after 1 minutes
      setTimeout(() => {
        if (!resolved) {
          vscode.window.showWarningMessage(
            'Browser login timed out (1 minute).',
          );
          finish(false);
        }
      }, 60000);
    });
  }

  async dispose(): Promise<void> {
    if (this.activeServer) {
      try {
        this.activeServer.close();
      } catch {
        // Ignore close errors during disposal
      }
      this.activeServer = null;
    }
  }
}
