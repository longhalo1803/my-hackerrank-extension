import { ILanguageInfo } from '../types/hackerrank';

export class LanguageRegistry {
  private static readonly LANGUAGES: Record<string, ILanguageInfo> = {
    bash: {
      id: 'bash',
      displayName: 'Bash',
      extension: '.sh',
      vscodeLanguageId: 'shellscript',
    },
    c: { id: 'c', displayName: 'C', extension: '.c', vscodeLanguageId: 'c' },
    clojure: {
      id: 'clojure',
      displayName: 'Clojure',
      extension: '.clj',
      vscodeLanguageId: 'clojure',
    },
    cpp: {
      id: 'cpp',
      displayName: 'C++',
      extension: '.cpp',
      vscodeLanguageId: 'cpp',
    },
    cpp14: {
      id: 'cpp14',
      displayName: 'C++14',
      extension: '.cpp',
      vscodeLanguageId: 'cpp',
    },
    cpp20: {
      id: 'cpp20',
      displayName: 'C++20',
      extension: '.cpp',
      vscodeLanguageId: 'cpp',
    },
    csharp: {
      id: 'csharp',
      displayName: 'C#',
      extension: '.cs',
      vscodeLanguageId: 'csharp',
    },
    db2: {
      id: 'db2',
      displayName: 'IBM DB2',
      extension: '.sql',
      vscodeLanguageId: 'sql',
    },
    erlang: {
      id: 'erlang',
      displayName: 'Erlang',
      extension: '.erl',
      vscodeLanguageId: 'erlang',
    },
    go: {
      id: 'go',
      displayName: 'Go',
      extension: '.go',
      vscodeLanguageId: 'go',
    },
    haskell: {
      id: 'haskell',
      displayName: 'Haskell',
      extension: '.hs',
      vscodeLanguageId: 'haskell',
    },
    java: {
      id: 'java',
      displayName: 'Java',
      extension: '.java',
      vscodeLanguageId: 'java',
    },
    java8: {
      id: 'java8',
      displayName: 'Java 8',
      extension: '.java',
      vscodeLanguageId: 'java',
    },
    java15: {
      id: 'java15',
      displayName: 'Java 15',
      extension: '.java',
      vscodeLanguageId: 'java',
    },
    javascript: {
      id: 'javascript',
      displayName: 'JavaScript',
      extension: '.js',
      vscodeLanguageId: 'javascript',
    },
    julia: {
      id: 'julia',
      displayName: 'Julia',
      extension: '.jl',
      vscodeLanguageId: 'julia',
    },
    kotlin: {
      id: 'kotlin',
      displayName: 'Kotlin',
      extension: '.kt',
      vscodeLanguageId: 'kotlin',
    },
    lua: {
      id: 'lua',
      displayName: 'Lua',
      extension: '.lua',
      vscodeLanguageId: 'lua',
    },
    mysql: {
      id: 'mysql',
      displayName: 'MySQL',
      extension: '.sql',
      vscodeLanguageId: 'sql',
    },
    objectivec: {
      id: 'objectivec',
      displayName: 'Objective-C',
      extension: '.m',
      vscodeLanguageId: 'objective-c',
    },
    oracle: {
      id: 'oracle',
      displayName: 'Oracle SQL',
      extension: '.sql',
      vscodeLanguageId: 'sql',
    },
    perl: {
      id: 'perl',
      displayName: 'Perl',
      extension: '.pl',
      vscodeLanguageId: 'perl',
    },
    php: {
      id: 'php',
      displayName: 'PHP',
      extension: '.php',
      vscodeLanguageId: 'php',
    },
    pypy: {
      id: 'pypy',
      displayName: 'PyPy',
      extension: '.py',
      vscodeLanguageId: 'python',
    },
    pypy3: {
      id: 'pypy3',
      displayName: 'PyPy 3',
      extension: '.py',
      vscodeLanguageId: 'python',
    },
    python: {
      id: 'python',
      displayName: 'Python',
      extension: '.py',
      vscodeLanguageId: 'python',
    },
    python3: {
      id: 'python3',
      displayName: 'Python 3',
      extension: '.py',
      vscodeLanguageId: 'python',
    },
    r: { id: 'r', displayName: 'R', extension: '.r', vscodeLanguageId: 'r' },
    ruby: {
      id: 'ruby',
      displayName: 'Ruby',
      extension: '.rb',
      vscodeLanguageId: 'ruby',
    },
    rust: {
      id: 'rust',
      displayName: 'Rust',
      extension: '.rs',
      vscodeLanguageId: 'rust',
    },
    scala: {
      id: 'scala',
      displayName: 'Scala',
      extension: '.scala',
      vscodeLanguageId: 'scala',
    },
    sql: {
      id: 'sql',
      displayName: 'SQL',
      extension: '.sql',
      vscodeLanguageId: 'sql',
    },
    swift: {
      id: 'swift',
      displayName: 'Swift',
      extension: '.swift',
      vscodeLanguageId: 'swift',
    },
    tsql: {
      id: 'tsql',
      displayName: 'MS SQL Server',
      extension: '.sql',
      vscodeLanguageId: 'sql',
    },
    typescript: {
      id: 'typescript',
      displayName: 'TypeScript',
      extension: '.ts',
      vscodeLanguageId: 'typescript',
    },
  };

  public static get(langId: string): ILanguageInfo {
    const key = langId.toLowerCase();
    const existing = this.LANGUAGES[key];
    if (existing) {
      return existing;
    }

    // Dynamic heuristic detection for database/dialects
    if (key.includes('sql') || key.includes('db') || key.includes('oracle')) {
      return {
        id: langId,
        displayName: langId.toUpperCase(),
        extension: '.sql',
        vscodeLanguageId: 'sql',
      };
    }

    if (key.includes('py')) {
      return {
        id: langId,
        displayName: langId.toUpperCase(),
        extension: '.py',
        vscodeLanguageId: 'python',
      };
    }

    if (key.includes('sh') || key.includes('bash')) {
      return {
        id: langId,
        displayName: langId.toUpperCase(),
        extension: '.sh',
        vscodeLanguageId: 'shellscript',
      };
    }

    if (key.includes('cpp')) {
      return {
        id: langId,
        displayName: langId.toUpperCase(),
        extension: '.cpp',
        vscodeLanguageId: 'cpp',
      };
    }

    // Dynamic fallback for any unlisted language
    return {
      id: langId,
      displayName: langId.toUpperCase(),
      extension: `.${langId}`,
      vscodeLanguageId: langId,
    };
  }

  public static getSupportedForChallenge(
    supportedLangIds: string[],
  ): ILanguageInfo[] {
    return supportedLangIds.map((id) => this.get(id));
  }

  public static getFallbackBoilerplate(langId: string): string {
    const lang = this.get(langId);
    const key = lang.id.toLowerCase();
    if (['db2', 'mysql', 'oracle', 'tsql', 'sql'].includes(key) || key.includes('sql') || key.includes('db')) {
      return '-- Enter your query here\n';
    }
    if (['python', 'python3', 'pypy', 'pypy3', 'ruby', 'perl', 'r', 'bash', 'shell'].includes(key)) {
      return '# Enter your code here\n';
    }
    if (['clojure'].includes(key)) {
      return ';; Enter your code here\n';
    }
    if (['erlang'].includes(key)) {
      return '% Enter your code here\n';
    }
    return '// Enter your code here\n';
  }
}
