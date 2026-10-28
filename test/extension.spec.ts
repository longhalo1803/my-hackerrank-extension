import * as vscode from 'vscode';
import { activate, deactivate } from '../src/extension';

describe('Extension Lifecycle & Command Registration', () => {
  it('activates and registers all HackerRank commands', () => {
    const subscriptions: any[] = [];
    const context = {
      subscriptions,
      extensionUri: { fsPath: '/test/extension' },
      secrets: {
        get: jest.fn(),
        store: jest.fn(),
        delete: jest.fn(),
      },
    } as unknown as vscode.ExtensionContext;

    activate(context);

    expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
      'hackerrank.signin',
      expect.any(Function),
    );
    expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
      'hackerrank.signinManual',
      expect.any(Function),
    );
    expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
      'hackerrank.checkStatus',
      expect.any(Function),
    );
    expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
      'hackerrank.logout',
      expect.any(Function),
    );
    expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
      'hackerrank.refreshChallenges',
      expect.any(Function),
    );
    expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
      'hackerrank.openChallenge',
      expect.any(Function),
    );
    expect(subscriptions.length).toBe(8);
  });

  it('deactivates cleanly', () => {
    expect(() => deactivate()).not.toThrow();
  });
});
