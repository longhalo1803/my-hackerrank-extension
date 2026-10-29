export const window = {
  showInformationMessage: jest.fn(),
  showErrorMessage: jest.fn(),
  showWarningMessage: jest.fn(),
  showInputBox: jest.fn(),
  showQuickPick: jest.fn(),
  showSaveDialog: jest.fn(),
  createTreeView: jest.fn(),
  registerTreeDataProvider: jest.fn(),
  createWebviewPanel: jest.fn(),
  createOutputChannel: jest.fn(() => ({
    appendLine: jest.fn(),
    show: jest.fn(),
    dispose: jest.fn(),
  })),
  activeTextEditor: undefined,
  showTextDocument: jest.fn(),
};

export const workspace = {
  workspaceFolders: [
    {
      uri: { fsPath: '/test/workspace' },
      name: 'test-workspace',
      index: 0,
    },
  ],
  openTextDocument: jest.fn(),
  fs: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
  },
};

export class TreeItem {
  label: string;
  collapsibleState?: number;
  iconPath?: any;
  tooltip?: string;
  constructor(label: string, collapsibleState?: number) {
    this.label = label;
    this.collapsibleState = collapsibleState;
  }
}

export class ThemeIcon {
  constructor(
    public readonly id: string,
    public readonly color?: any,
  ) {}
}

export class ThemeColor {
  constructor(public readonly id: string) {}
}

export enum TreeItemCollapsibleState {
  None = 0,
  Collapsed = 1,
  Expanded = 2,
}

export enum ViewColumn {
  One = 1,
  Two = 2,
  Three = 3,
  Active = -1,
  Beside = -2,
}

export class EventEmitter<T = any> {
  event = jest.fn();
  fire = jest.fn((_data?: T) => {});
}

export const Uri = {
  file: (path: string) => ({ fsPath: path, path, scheme: 'file' }),
  parse: (uri: string) => ({ fsPath: uri, path: uri, scheme: 'https' }),
};

export const commands = {
  registerCommand: jest.fn(),
  executeCommand: jest.fn(),
};

export class MockSecretStorage {
  private data = new Map<string, string>();
  get = jest.fn(async (key: string): Promise<string | undefined> =>
    this.data.get(key),
  );
  store = jest.fn(async (key: string, value: string): Promise<void> => {
    this.data.set(key, value);
  });
  delete = jest.fn(async (key: string): Promise<void> => {
    this.data.delete(key);
  });
}
