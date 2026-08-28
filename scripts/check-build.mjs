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
const precache = JSON.parse(await readFile(resolve(root, 'dist/web/precache-manifest.json'), 'utf8'));
const assets = await readdir(resolve(root, 'dist/web/assets'));
if (!index.includes('desktop-bridge.js')) throw new Error('Le pont de sauvegarde n’est pas chargé.');
if (sw.includes('__BUILD__')) throw new Error('La version du Service Worker n’est pas estampillée.');
if (assets.length < 35) throw new Error('Des ressources semblent manquer dans la construction.');
if (!precache.includes('./formation.html') || !precache.includes('./assets/hero.mp4')) throw new Error('Le cache hors ligne est incomplet.');
console.log(`Vérification réussie : ${assets.length} ressources et ${precache.length} fichiers hors ligne.`);
