const fs = require('fs');
const path = require('path');

const vsDir = path.join(__dirname, '..', 'media', 'monaco', 'min', 'vs');

if (!fs.existsSync(vsDir)) {
  const nodeMonaco = path.join(__dirname, '..', 'node_modules', 'monaco-editor', 'min');
  if (fs.existsSync(nodeMonaco)) {
    fs.mkdirSync(path.dirname(vsDir), { recursive: true });
    fs.cpSync(nodeMonaco, path.join(__dirname, '..', 'media', 'monaco', 'min'), { recursive: true });
  } else {
    console.log('Monaco directory not found, skipping prune.');
    process.exit(0);
  }
}

const KEEP_PREFIXES = [
  'loader.js',
  'editor',
  'assets',
  'basic-languages',
  'language',
  'nls.messages-loader.js',
  'index',
  'initialize',
  'main',
  'lspLanguageFeatures',
  'monaco.contribution',
  'toggleHighContrast',
  'workers',
  'editorWorkerHost',
  'tsMode',
  'ts.worker',
  'jsonMode',
  'json.worker',
  'cssMode',
  'css.worker',
  'htmlMode',
  'html.worker',
  // HackerRank actual languages
  'python',
  'sql',
  'mysql',
  'pgsql',
  'cpp',
  'csharp',
  'java',
  'javascript',
  'typescript',
  'go',
  'rust',
  'ruby',
  'php',
  'kotlin',
  'swift',
  'shell',
  'r-',
  'perl',
  'clojure',
  'scala',
  'lua',
];

const files = fs.readdirSync(vsDir);
let removedCount = 0;

for (const file of files) {
  const shouldKeep = KEEP_PREFIXES.some((prefix) => file.startsWith(prefix));
  if (!shouldKeep) {
    const fullPath = path.join(vsDir, file);
    fs.rmSync(fullPath, { recursive: true, force: true });
    removedCount++;
  }
}

console.log(`Pruned ${removedCount} unused Monaco files from media/monaco/min/vs.`);

