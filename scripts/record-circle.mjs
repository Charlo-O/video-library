import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const target = process.argv[2];
if (!target) throw new Error('Usage: node scripts/record-circle.mjs /absolute/output.mp4');
await mkdir(path.dirname(target), { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
let encoder;
let server;
let recordingURL = process.env.RECORD_URL;
try {
  if (!recordingURL) {
    const source = process.env.RECORD_SOURCE || fileURLToPath(new URL('../../interactive-lab/projects/whole-circle/index.html', import.meta.url));
    const html = await readFile(source);
    server = http.createServer((request, response) => {
      if (request.url === '/favicon.ico') { response.writeHead(204); response.end(); return; }
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(html);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    recordingURL = `http://127.0.0.1:${server.address().port}/`;
  }
  const page = await browser.newPage({ viewport: { width: 960, height: 720 }, deviceScaleFactor: 1 });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, route => route.abort());
  await page.addInitScript(() => {
    let time = 0;
    let queue = [];
    let seed = 147;
    performance.now = () => time;
    requestAnimationFrame = callback => { queue.push(callback); return queue.length; };
    cancelAnimationFrame = () => {};
    Math.random = () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; };
    window.__videoClock = { get ready() { return queue.length > 0; }, step(ms) { time += ms; const callbacks = queue; queue = []; callbacks.forEach(callback => callback(time)); } };
  });
  await page.goto(recordingURL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.addStyleTag({ content: '#lab-navigation{display:none!important}' });
  // RAF is intentionally frozen. Playwright's default RAF polling would freeze too.
  await page.waitForFunction(() => window.__videoClock?.ready, null, { polling: 100, timeout: 15000 });
  if (pageErrors.length) throw new Error(pageErrors.join('\n'));
  const session = await page.context().newCDPSession(page);
  encoder = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-vcodec', 'mjpeg', '-framerate', '24', '-i', 'pipe:0', '-an', '-c:v', 'libx264', '-threads', '4', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', target], { stdio: ['pipe', 'ignore', 'pipe'] });
  let error = ''; encoder.stderr.on('data', chunk => { error += chunk; });
  const ended = once(encoder, 'close');
  for (let i = 0; i < 432; i++) {
    if (i === 82) { await page.mouse.move(670, 360); await page.mouse.down(); }
    if (i > 82 && i <= 118) { const a = (i - 82) / 36 * Math.PI * .7; await page.mouse.move(480 + Math.cos(a) * 190, 360 + Math.sin(a) * 190); }
    if (i === 119) await page.mouse.up();
    if (i === 145) await page.keyboard.press('ArrowRight');
    if (i === 170) { await page.locator('#stage').focus(); await page.keyboard.down('Space'); }
    if (i === 275) await page.keyboard.up('Space');
    await page.evaluate(() => window.__videoClock.step(1000 / 24));
    const { data } = await session.send('Page.captureScreenshot', { format: 'jpeg', quality: 85, fromSurface: true });
    if (!encoder.stdin.write(Buffer.from(data, 'base64'))) await once(encoder.stdin, 'drain');
    if (i % 96 === 0) console.log(`Circle: ${i}/432 frames`);
  }
  encoder.stdin.end();
  const [code] = await ended;
  if (code !== 0) throw new Error(error);
  if (pageErrors.length) throw new Error(pageErrors.join('\n'));
  await writeFile(target + '.provenance.json', JSON.stringify({ source: process.env.RECORD_URL || 'interactive-lab/projects/whole-circle/index.html', fps: 24, frames: 432, width: 960, height: 720, gestures: ['drag', 'arrow-right', 'hold-space'], fonts: 'System fallbacks; optional Google Fonts requests blocked for deterministic recording.', note: 'Recorded from the current interactive implementation, not from the reference video.' }, null, 2));
  console.log(`Recorded ${target}`);
} finally { if (encoder && encoder.exitCode === null) encoder.kill(); await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); }
