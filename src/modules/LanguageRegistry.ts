import { ILanguageInfo } from '../types/hackerrank';

export class LanguageRegistry {
  private static readonly LANGUAGES: Record<string, ILanguageInfo> = {
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
    objectivec: {
      id: 'objectivec',
      displayName: 'Objective-C',
      extension: '.m',
      vscodeLanguageId: 'objective-c',
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
    pypy3: {
      id: 'pypy3',
      displayName: 'PyPy 3',
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
    swift: {
      id: 'swift',
      displayName: 'Swift',
      extension: '.swift',
      vscodeLanguageId: 'swift',
    },
    typescript: {
      id: 'typescript',
      displayName: 'TypeScript',
      extension: '.ts',
      vscodeLanguageId: 'typescript',
    },
  };

  public static get(langId: string): ILanguageInfo {
    const existing = this.LANGUAGES[langId];
    if (existing) {
      return existing;
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
    if (['python3', 'pypy3', 'ruby', 'perl', 'r'].includes(lang.id)) {
      return '# Enter your code here\n';
    }
    if (['clojure'].includes(lang.id)) {
      return ';; Enter your code here\n';
    }
    if (['erlang'].includes(lang.id)) {
      return '% Enter your code here\n';
    }
    return '// Enter your code here\n';
  }
}
