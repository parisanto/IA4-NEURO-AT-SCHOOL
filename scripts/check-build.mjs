import { access, readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const required = [
  'dist/web/index.html', 'dist/web/formation.html', 'dist/web/sw.js',
  'dist/web/desktop-bridge.js', 'dist/web/manifest.webmanifest',
  'dist/web/precache-manifest.json',
  'src-tauri/tauri.conf.json', 'src-tauri/Cargo.toml', 'src-tauri/src/main.rs'
];
for (const path of required) await access(resolve(root, path));

const index = await readFile(resolve(root, 'dist/web/index.html'), 'utf8');
const sw = await readFile(resolve(root, 'dist/web/sw.js'), 'utf8');
const tauriConfig = JSON.parse(await readFile(resolve(root, 'src-tauri/tauri.conf.json'), 'utf8'));
const precache = JSON.parse(await readFile(resolve(root, 'dist/web/precache-manifest.json'), 'utf8'));
const assets = await readdir(resolve(root, 'dist/web/assets'));
if (!index.includes('desktop-bridge.js')) throw new Error('Le pont de sauvegarde n’est pas chargé.');
if (sw.includes('__BUILD__')) throw new Error('La version du Service Worker n’est pas estampillée.');
if (assets.length < 35) throw new Error('Des ressources semblent manquer dans la construction.');
if (!precache.includes('./formation.html') || !precache.includes('./assets/hero.mp4')) throw new Error('Le cache hors ligne est incomplet.');
const inlineHandlers = (index.match(/\son[a-z]+\s*=/gi) || []).length;
const disabledCspChanges = tauriConfig.app?.security?.dangerousDisableAssetCspModification || [];
const scriptCsp = String(tauriConfig.app?.security?.csp || '').match(/script-src[^;]*/)?.[0] || '';
if (inlineHandlers && !disabledCspChanges.includes('script-src')) {
  throw new Error(`${inlineHandlers} commandes intégrées seraient bloquées par les empreintes CSP de Tauri.`);
}
if (inlineHandlers && !scriptCsp.includes("'unsafe-inline'")) {
  throw new Error('La CSP native ne permet pas les commandes intégrées historiques.');
}
console.log(`Vérification réussie : ${assets.length} ressources et ${precache.length} fichiers hors ligne.`);
