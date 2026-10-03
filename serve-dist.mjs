#!/usr/bin/env node
// Static file server for MED dist/ — dependency-free, foreground on PORT.
import { createServer } from 'node:http';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { resolve, join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), 'dist');
if (!existsSync(join(root, 'index.html'))) {
  console.error('dist/index.html missing; build step failed.');
  process.exit(1);
}
const mime = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json'
};
const server = createServer((req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let path = resolve(root, '.' + decodeURIComponent(url.pathname));
    if (path !== root && !path.startsWith(root + '/')) { res.writeHead(404); res.end(); return; }
    try { if (statSync(path).isDirectory()) path = join(path, 'index.html'); } catch { path = join(root, 'index.html'); }
    const content = readFileSync(path);
    res.setHeader('Content-Type', mime[extname(path)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.end(content);
  } catch { res.writeHead(404); res.end('Not found'); }
});
const port = Number(process.env.PORT || 3000);
server.listen(port, '0.0.0.0', () => console.log(`MED static serving ${root} on :${port}`));
