import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const sourceDir = resolve(projectRoot, 'Site-local');
const outputDir = resolve(projectRoot, 'dist', 'web');
const desktop = process.argv.includes('--desktop');
const buildId = process.env.BUILD_ID || (desktop ? 'desktop' : 'local');

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

const entries = [
  'index.html',
  'formation.html',
  'manifest.webmanifest',
  'sw.js',
  'desktop-bridge.js',
  'assets'
];

for (const entry of entries) {
  await cp(resolve(sourceDir, entry), resolve(outputDir, entry), { recursive: true });
}

async function listFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(path));
    else files.push('./' + relative(outputDir, path).split(sep).join('/'));
  }
  return files;
}

const precache = ['./', ...await listFiles(outputDir)]
  .filter(path => path !== './sw.js')
  .sort();
await writeFile(resolve(outputDir, 'precache-manifest.json'), JSON.stringify(precache, null, 2), 'utf8');

const serviceWorkerPath = resolve(outputDir, 'sw.js');
const serviceWorker = await readFile(serviceWorkerPath, 'utf8');
await writeFile(serviceWorkerPath, serviceWorker.replaceAll('__BUILD__', buildId), 'utf8');

if (desktop) {
  // Les ressources sont directement embarquées par Tauri. Le Service Worker reste
  // présent pour garder exactement la même source, mais porte une version stable.
  const indexPath = resolve(outputDir, 'index.html');
  const index = await readFile(indexPath, 'utf8');
  await writeFile(indexPath, index.replace('</head>', '    <meta name="ia4-runtime" content="desktop">\n</head>'), 'utf8');
}

console.log(`IA4-NEURO construit dans ${outputDir} (${desktop ? 'bureau' : 'web'}, ${buildId})`);
