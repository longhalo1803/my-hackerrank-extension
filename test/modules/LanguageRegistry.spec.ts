import { LanguageRegistry } from '../../src/modules/LanguageRegistry';

describe('LanguageRegistry', () => {
  it('retrieves known language information by id', () => {
    const ts = LanguageRegistry.get('typescript');
    expect(ts.id).toBe('typescript');
    expect(ts.displayName).toBe('TypeScript');
    expect(ts.extension).toBe('.ts');
    expect(ts.vscodeLanguageId).toBe('typescript');

    const py = LanguageRegistry.get('python3');
    expect(py.id).toBe('python3');
    expect(py.extension).toBe('.py');
  });

  it('provides safe dynamic fallback for unlisted languages', () => {
    const unlisted = LanguageRegistry.get('brainfuck' as any);
    expect(unlisted.id).toBe('brainfuck');
    expect(unlisted.displayName).toBe('BRAINFUCK');
    expect(unlisted.extension).toBe('.brainfuck');
  });

  it('filters supported languages for a specific challenge', () => {
    const supported = LanguageRegistry.getSupportedForChallenge([
      'python3',
      'cpp',
      'nonexistent',
    ]);
    expect(supported.length).toBe(3);
    expect(supported[0].displayName).toBe('Python 3');
    expect(supported[1].displayName).toBe('C++');
  });

  it('provides minimal comment stubs for fallback boilerplate', () => {
    expect(LanguageRegistry.getFallbackBoilerplate('python3')).toBe(
      '# Enter your code here\n',
    );
    expect(LanguageRegistry.getFallbackBoilerplate('clojure')).toBe(
      ';; Enter your code here\n',
    );
    expect(LanguageRegistry.getFallbackBoilerplate('erlang')).toBe(
      '% Enter your code here\n',
    );
    expect(LanguageRegistry.getFallbackBoilerplate('typescript')).toBe(
      '// Enter your code here\n',
    );
  });
});
