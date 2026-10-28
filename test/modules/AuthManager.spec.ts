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
    mockContext = {
      secrets,
      subscriptions: []
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
        csrf_token: 'mock_csrf_abc'
      });

      const session = await authManager.getSession();
      expect(session).not.toBeNull();
      expect(session?.hackerrank_cookie).toBe('_hrank_session=mock_cookie_123');
      expect(session?.csrf_token).toBe('mock_csrf_abc');
      expect(await authManager.isLoggedIn()).toBe(true);
    });

    it('clears session upon logout', async () => {
      await authManager.saveSession({
        hackerrank_cookie: '_hrank_session=mock_cookie_123',
        csrf_token: 'mock_csrf_abc'
      });
      expect(await authManager.isLoggedIn()).toBe(true);

      await authManager.logout();
      expect(await authManager.getSession()).toBeNull();
      expect(await authManager.isLoggedIn()).toBe(false);
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('Signed out from HackerRank.');
    });
  });

  describe('Manual Cookie Authentication', () => {
    it('prompts user and saves session when valid cookie is entered', async () => {
      (vscode.window.showInputBox as jest.Mock).mockResolvedValueOnce('_hrank_session=manual_cookie_value');
      const success = await authManager.loginWithManualCookie();

      expect(success).toBe(true);
      const session = await authManager.getSession();
      expect(session?.hackerrank_cookie).toContain('manual_cookie_value');
      expect(await authManager.isLoggedIn()).toBe(true);
    });

    it('returns false and does not save session if user cancels input', async () => {
      (vscode.window.showInputBox as jest.Mock).mockResolvedValueOnce(undefined);
      const success = await authManager.loginWithManualCookie();

      expect(success).toBe(false);
      expect(await authManager.getSession()).toBeNull();
      expect(await authManager.isLoggedIn()).toBe(false);
    });
  });

  describe('Display Environment Detection', () => {
    it('detects when graphical display is missing on Linux', () => {
      const originalDisplay = process.env.DISPLAY;
      const originalWayland = process.env.WAYLAND_DISPLAY;
      delete process.env.DISPLAY;
      delete process.env.WAYLAND_DISPLAY;

      expect(authManager.hasDisplayEnvironment('linux')).toBe(false);

      process.env.DISPLAY = ':0';
      expect(authManager.hasDisplayEnvironment('linux')).toBe(true);

      // Restore
      if (originalDisplay) process.env.DISPLAY = originalDisplay;
      else delete process.env.DISPLAY;
      if (originalWayland) process.env.WAYLAND_DISPLAY = originalWayland;
      else delete process.env.WAYLAND_DISPLAY;
    });

    it('considers darwin and win32 as always having display', () => {
      expect(authManager.hasDisplayEnvironment('darwin')).toBe(true);
      expect(authManager.hasDisplayEnvironment('win32')).toBe(true);
    });
  });
});
