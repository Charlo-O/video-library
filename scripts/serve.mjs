import http from 'node:http';
import path from 'node:path';
import { readFile, stat, open } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('../dist/', import.meta.url)));
const base = '/video-library/';
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.json': 'application/json', '.md': 'text/plain; charset=utf-8' };
export function createServer() {
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      if (url.pathname === '/') { response.writeHead(302, { Location: base }); response.end(); return; }
      if (!url.pathname.startsWith(base)) throw new Error('outside');
      let file = path.resolve(root, decodeURIComponent(url.pathname.slice(base.length)));
      if (file !== root && !file.startsWith(root + path.sep)) throw new Error('outside');
      let info = await stat(file);
      if (info.isDirectory()) {
        if (!url.pathname.endsWith('/')) { response.writeHead(301, { Location: url.pathname + '/' + url.search }); response.end(); return; }
        file = path.join(file, 'index.html'); info = await stat(file);
      }
      response.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
      response.setHeader('Accept-Ranges', 'bytes'); response.setHeader('Cache-Control', 'no-cache');
      const range = request.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
      if (range) {
        const start = Number(range[1]), end = Math.min(Number(range[2] || info.size - 1), info.size - 1);
        if (start > end || start >= info.size) { response.writeHead(416, { 'Content-Range': `bytes */${info.size}` }); response.end(); return; }
        response.writeHead(206, { 'Content-Range': `bytes ${start}-${end}/${info.size}`, 'Content-Length': end - start + 1 });
        if (request.method === 'HEAD') response.end(); else createReadStream(file, { start, end }).pipe(response);
      } else {
        response.setHeader('Content-Length', info.size);
        if (request.method === 'HEAD') response.end(); else createReadStream(file).pipe(response);
      }
    } catch { response.writeHead(404); response.end('Not found'); }
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) createServer().listen(Number(process.env.PORT || 4180), '127.0.0.1', () => console.log(`http://127.0.0.1:${process.env.PORT || 4180}${base}`));
