import * as fs from 'fs';
import * as path from 'path';

describe('Monaco Editor Assets Packaging', () => {
  const mediaRoot = path.join(__dirname, '..', 'media', 'monaco');

  it('contains the minified Monaco loader script', () => {
    const loaderPath = path.join(mediaRoot, 'min', 'vs', 'loader.js');
    expect(fs.existsSync(loaderPath)).toBe(true);
  });

  it('contains the core Monaco editor main bundle', () => {
    const editorMainPath = path.join(
      mediaRoot,
      'min',
      'vs',
      'editor',
      'editor.main.js',
    );
    expect(fs.existsSync(editorMainPath)).toBe(true);
  });

  it('contains the core Monaco editor CSS stylesheet', () => {
    const editorCssPath = path.join(
      mediaRoot,
      'min',
      'vs',
      'editor',
      'editor.main.css',
    );
    expect(fs.existsSync(editorCssPath)).toBe(true);
  });

  it('contains all static AMD module dependencies required by editor.main.js', () => {
    const vsRoot = path.join(mediaRoot, 'min', 'vs');
    const visited = new Set<string>();
    const missing: string[] = [];

    function resolveDep(fromFile: string, dep: string): string | null {
      if (['require', 'exports', 'module'].includes(dep)) return null;
      const cleanDep = dep.endsWith('!') ? dep.slice(0, -1) : dep;
      if (cleanDep.startsWith('vs/')) {
        return cleanDep.slice(3) + '.js';
      }
      if (cleanDep.startsWith('.')) {
        const dir = path.dirname(fromFile);
        return path.normalize(path.join(dir, cleanDep)) + '.js';
      }
      return null;
    }

    function walk(relFile: string) {
      if (visited.has(relFile)) return;
      visited.add(relFile);
      const fullPath = path.join(vsRoot, relFile);
      if (!fs.existsSync(fullPath)) {
        missing.push(relFile);
        return;
      }
      const content = fs.readFileSync(fullPath, 'utf8');
      const regex = /define\((?:["'][^"']*["'],\s*)?\[([^\]]*)\]/g;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(content)) !== null) {
        const deps = match[1]
          .split(',')
          .map((s) => s.trim().replace(/^["']|["']$/g, ''))
          .filter(Boolean);
        for (const d of deps) {
          const next = resolveDep(relFile, d);
          if (next) walk(next);
        }
      }
    }

    walk('editor/editor.main.js');
    expect(missing).toEqual([]);
  });
});
