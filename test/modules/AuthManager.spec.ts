import * as vscode from 'vscode';
import { AuthManager } from '../../src/modules/AuthManager';
import { MockSecretStorage } from '../mocks/vscode';

describe('AuthManager', () => {
  let secrets: MockSecretStorage;
  let mockContext: vscode.ExtensionContext;
  let authManager: AuthManager;

  beforeEach(() => {
    jest.clearAllMocks();
    secrets = new MockSecretStorage();
    const globalStateData = new Map<string, any>();
    mockContext = {
      secrets,
      globalState: {
        get: jest.fn((k: string) => globalStateData.get(k)),
        update: jest.fn(async (k: string, v: any) => {
          globalStateData.set(k, v);
        }),
      },
      subscriptions: [],
    } as unknown as vscode.ExtensionContext;
    authManager = new AuthManager(mockContext);
  });

  describe('Session Storage & Verification', () => {
    it('returns null when no session is saved', async () => {
      const session = await authManager.getSession();
      expect(session).toBeNull();
      expect(await authManager.isLoggedIn()).toBe(false);
    });

    it('saves and retrieves session correctly', async () => {
      await authManager.saveSession({
        hackerrank_cookie: '_hrank_session=mock_cookie_123',
        csrf_token: 'mock_csrf_abc',
        auth_method: 'cookie',
      });

      const session = await authManager.getSession();
      expect(session).not.toBeNull();
      expect(session?.hackerrank_cookie).toBe('_hrank_session=mock_cookie_123');
      expect(session?.csrf_token).toBe('mock_csrf_abc');
      expect(session?.auth_method).toBe('cookie');
      expect(await authManager.isLoggedIn()).toBe(true);
    });

    it('clears session upon logout', async () => {
      await authManager.saveSession({
        hackerrank_cookie: '_hrank_session=mock_cookie_123',
        csrf_token: 'mock_csrf_abc',
      });
      expect(await authManager.isLoggedIn()).toBe(true);

      await authManager.logout();
      expect(await authManager.getSession()).toBeNull();
      expect(await authManager.isLoggedIn()).toBe(false);
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        'Signed out from HackerRank.',
      );
    });

    it('gracefully falls back to globalState when OS Keyring throws an error', async () => {
      secrets.store.mockRejectedValue(
        new Error('An OS keyring could not be identified'),
      );
      secrets.get.mockRejectedValue(
        new Error('An OS keyring could not be identified'),
      );

      await authManager.saveSession({
        hackerrank_cookie: '_hrank_session=keyring_fallback_cookie',
        csrf_token: 'csrf_fallback_val',
      });

      const session = await authManager.getSession();
      expect(session).not.toBeNull();
      expect(session?.hackerrank_cookie).toBe(
        '_hrank_session=keyring_fallback_cookie',
      );
      expect(session?.csrf_token).toBe('csrf_fallback_val');
      expect(await authManager.isLoggedIn()).toBe(true);
    });
    it('throws a descriptive error when both SecretStorage and globalState fail', async () => {
      secrets.store.mockRejectedValue(new Error('Keyring failure'));
      (mockContext.globalState!.update as jest.Mock).mockRejectedValue(
        new Error('Disk I/O error'),
      );

      await expect(
        authManager.saveSession({
          hackerrank_cookie: '_hrank_session=cookie',
        }),
      ).rejects.toThrow('Failed to persist session');
    });
  });

  describe('Manual Cookie Authentication', () => {
    it('prompts user and saves session when valid cookie is entered', async () => {
      (vscode.window.showInputBox as jest.Mock)
        .mockResolvedValueOnce('_hrank_session=manual_cookie_value')
        .mockResolvedValueOnce('manual_csrf_token');

      (global as any).fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: true,
          model: { id: 999, username: 'testuser' },
        }),
      });

      const success = await authManager.loginWithCookie();

      expect(success).toBe(true);
      const session = await authManager.getSession();
      expect(session?.hackerrank_cookie).toContain('manual_cookie_value');
      expect(session?.csrf_token).toBe('manual_csrf_token');
      expect(await authManager.isLoggedIn()).toBe(true);
    });

    it('returns false and does not save session if user cancels input', async () => {
      (vscode.window.showInputBox as jest.Mock).mockResolvedValueOnce(
        undefined,
      );
      const success = await authManager.loginWithCookie();

      expect(success).toBe(false);
      expect(await authManager.getSession()).toBeNull();
      expect(await authManager.isLoggedIn()).toBe(false);
    });

    it('handles unexpected showInputBox rejection gracefully', async () => {
      (vscode.window.showInputBox as jest.Mock).mockRejectedValueOnce(
        new Error('UI modal crash'),
      );
      const success = await authManager.loginWithCookie();
      expect(success).toBe(false);
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('Failed to save session cookie'),
      );
    });

    it('disposes cleanly without throwing', () => {
      expect(() => authManager.dispose()).not.toThrow();
    });
  });

  describe('Security & Sanitization', () => {
    it('strips CRLF and control characters in formatCookieString', () => {
      const dirty =
        '  _hrank_session=valid_cookie\r\nX-Injected: attack\0\x1F  ';
      const cleaned = authManager.formatCookieString(dirty);
      expect(cleaned).toBe('_hrank_session=valid_cookieX-Injected: attack');
      expect(cleaned).not.toContain('\r');
      expect(cleaned).not.toContain('\n');
    });

    it('clears globalState plaintext fallback when secret storage succeeds', async () => {
      // First save to globalState fallback
      await (mockContext.globalState.update as jest.Mock)(
        'hackerrank_cookie',
        'stale_plaintext_cookie',
      );

      // Now save normally (secrets succeeds)
      await authManager.saveSession({
        hackerrank_cookie: '_hrank_session=new_secure_cookie',
      });

      expect(mockContext.globalState.update).toHaveBeenCalledWith(
        'hackerrank_cookie',
        undefined,
      );
      expect(mockContext.globalState.update).toHaveBeenCalledWith(
        'hackerrank_csrf',
        undefined,
      );
    });
  });
});
