import * as vscode from "vscode";
import { chromium, Browser } from "playwright-core";
import { ISession } from "../types/hackerrank";

export class AuthManager {
  private static readonly SECRET_COOKIE_KEY = "hackerrank_cookie";
  private static readonly SECRET_CSRF_KEY = "hackerrank_csrf";
  private activeBrowser: Browser | null = null;

  constructor(private readonly context: vscode.ExtensionContext) {}

  async getSession(): Promise<ISession | null> {
    const cookie = await this.context.secrets.get(
      AuthManager.SECRET_COOKIE_KEY,
    );
    const csrfToken = await this.context.secrets.get(
      AuthManager.SECRET_CSRF_KEY,
    );

    if (!cookie) {
      return null;
    }

    return {
      hackerrank_cookie: cookie,
      csrf_token: csrfToken,
    };
  }

  async saveSession(session: ISession): Promise<void> {
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
    }
  }

  async isLoggedIn(): Promise<boolean> {
    const session = await this.getSession();
    return Boolean(
      session &&
      session.hackerrank_cookie &&
      session.hackerrank_cookie.length > 0,
    );
  }

  async logout(): Promise<void> {
    await this.context.secrets.delete(AuthManager.SECRET_COOKIE_KEY);
    await this.context.secrets.delete(AuthManager.SECRET_CSRF_KEY);
    vscode.window.showInformationMessage("Signed out from HackerRank.");
  }

  hasDisplayEnvironment(platform: string = process.platform): boolean {
    if (platform === "darwin" || platform === "win32") {
      return true;
    }
    return Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
  }

  async loginWithManualCookie(): Promise<boolean> {
    const cookieInput = await vscode.window.showInputBox({
      prompt: "Enter your HackerRank _hrank_session cookie",
      placeHolder: "_hrank_session=...",
      password: true,
      ignoreFocusOut: true,
    });

    if (!cookieInput || cookieInput.trim().length === 0) {
      return false;
    }

    const trimmed = cookieInput.trim();
    const formattedCookie = trimmed.startsWith("_hrank_session=")
      ? trimmed
      : `_hrank_session=${trimmed}`;

    await this.saveSession({
      hackerrank_cookie: formattedCookie,
    });

    vscode.window.showInformationMessage(
      "HackerRank session saved successfully.",
    );
    return true;
  }

  async loginWithGoogle(): Promise<boolean> {
    if (!this.hasDisplayEnvironment()) {
      vscode.window.showWarningMessage(
        "No graphical display detected. Falling back to manual session cookie entry.",
      );
      return this.loginWithManualCookie();
    }

    try {
      this.activeBrowser = await chromium.launch({
        channel: "chrome",
        headless: false,
      });
    } catch {
      vscode.window.showWarningMessage(
        "System Google Chrome not found or failed to launch. Falling back to manual cookie entry.",
      );
      return this.loginWithManualCookie();
    }

    const browserContext = await this.activeBrowser.newContext();
    const page = await browserContext.newPage();

    let capturedCookie: string | null = null;
    let capturedCsrf: string | null = null;

    try {
      await page.goto("https://www.hackerrank.com/auth/login");

      // Poll cookies for _hrank_session
      const checkInterval = 1000;
      const maxWaitMs = 120000; // 2 minutes timeout
      let elapsed = 0;

      while (elapsed < maxWaitMs) {
        const cookies = await browserContext.cookies();
        const sessionCookie = cookies.find((c) => c.name === "_hrank_session");

        if (sessionCookie) {
          capturedCookie = `_hrank_session=${sessionCookie.value}`;
          break;
        }

        await new Promise((r) => setTimeout(r, checkInterval));
        elapsed += checkInterval;
      }

      if (capturedCookie) {
        // Try to obtain CSRF token from page
        try {
          const csrfMeta = await page.$('meta[name="csrf-token"]');
          if (csrfMeta) {
            capturedCsrf = await csrfMeta.getAttribute("content");
          }
        } catch {
          // Non-critical if CSRF is captured later via HTTP client
        }

        await this.saveSession({
          hackerrank_cookie: capturedCookie,
          csrf_token: capturedCsrf ?? undefined,
        });

        vscode.window.showInformationMessage(
          "Successfully logged in to HackerRank!",
        );
        return true;
      } else {
        vscode.window.showErrorMessage("Login timed out or was cancelled.");
        return false;
      }
    } catch (err: any) {
      vscode.window.showErrorMessage(`Authentication error: ${err.message}`);
      return false;
    } finally {
      if (this.activeBrowser) {
        await this.activeBrowser.close();
        this.activeBrowser = null;
      }
    }
  }

  async dispose(): Promise<void> {
    if (this.activeBrowser) {
      await this.activeBrowser.close();
      this.activeBrowser = null;
    }
  }
}
