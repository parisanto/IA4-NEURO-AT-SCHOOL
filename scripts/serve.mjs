import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', 'dist', 'web');
const port = Number(process.env.PORT || 8800);
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8', '.png': 'image/png',
  '.woff2': 'font/woff2', '.mp4': 'video/mp4'
};

createServer(async (request, response) => {
  const requested = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
  const relative = requested === '/' ? 'index.html' : requested.replace(/^\/+/, '');
  const candidate = normalize(join(root, relative));
  if (!candidate.startsWith(root)) { response.writeHead(403).end('Accès refusé'); return; }
  try {
    const info = await stat(candidate);
    if (!info.isFile()) throw new Error('not a file');
    response.writeHead(200, { 'Content-Type': mime[extname(candidate)] || 'application/octet-stream' });
    createReadStream(candidate).pipe(response);
  } catch {
    response.writeHead(404).end('Fichier introuvable');
  }
}).listen(port, '127.0.0.1', () => console.log(`IA4-NEURO : http://127.0.0.1:${port}`));
