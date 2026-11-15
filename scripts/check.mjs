import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const dist = path.join(root, 'dist');
const catalog = JSON.parse(await readFile(path.join(root, 'data/catalog.json'), 'utf8'));
const files = [];
async function walk(dir) { for (const entry of await readdir(dir, { withFileTypes: true })) { const p = path.join(dir, entry.name); entry.isDirectory() ? await walk(p) : files.push(p); } }
await walk(dist);
const errors = [];
async function link(file, raw) {
  const ref = raw.replace(/&amp;/g, '&');
  if (!ref || /^(?:https?:|data:|blob:|mailto:|#)/.test(ref)) return;
  const clean = decodeURIComponent(ref.split(/[?#]/)[0]);
  const target = path.resolve(path.dirname(file), clean);
  if (target !== dist && !target.startsWith(dist + path.sep)) { errors.push(`Outside path: ${ref}`); return; }
  try { const info = await stat(target); if (info.isDirectory()) await stat(path.join(target, 'index.html')); }
  catch { errors.push(`${path.relative(dist, file)} → ${ref}`); }
}
for (const file of files) {
  if (file.endsWith('.html')) {
    const html = await readFile(file, 'utf8');
    for (const tag of html.matchAll(/<(?:a|img|link|script|video)\b[^>]*>/g)) for (const ref of tag[0].matchAll(/\b(?:src|href|poster)="([^"]+)"/g)) await link(file, ref[1]);
  }
  if (file.endsWith('.js')) execFileSync(process.execPath, ['--check', file]);
}
const home = await readFile(path.join(dist, 'index.html'), 'utf8');
assert.equal((home.match(/class="film-card"/g) || []).length, catalog.projects.length);
const seen = new Set();
let previewBytes = 0, originalBytes = 0, count = 0;
for (const p of catalog.projects) {
  assert.ok(!seen.has(p.id)); seen.add(p.id);
  assert.match(p.releaseTag, /^[\w-]+-v\d+\.\d+\.\d+$/);
  assert.ok(!JSON.stringify(p).includes('/Volumes/'), 'Local source paths must not be published');
  for (const v of p.videos) {
    const size = (await stat(path.join(dist, v.preview))).size;
    assert.equal(size, v.previewBytes);
    assert.ok(size < 25 * 1024 * 1024, `Preview too large: ${p.id}/${v.id}`);
    assert.match(v.sha256, /^[a-f0-9]{64}$/);
    assert.ok(v.downloadUrl.includes(`/releases/download/${p.releaseTag}/`));
    assert.ok(v.duration > 0 && v.previewDuration > 0 && v.width > 0 && v.height > 0);
    if (!v.previewComplete) assert.ok(v.previewDuration >= 23 && v.previewDuration <= 25);
    previewBytes += size; originalBytes += v.bytes; count++;
  }
}
const bytes = (await Promise.all(files.map(async f => (await stat(f)).size))).reduce((sum, n) => sum + n, 0);
assert.ok(bytes < 750 * 1024 * 1024, 'Published site must remain comfortably below the Pages limit');
assert.ok(files.filter(f => f.endsWith('.mp4')).length === count, 'Only one web preview per catalog film should be published');
if (errors.length) throw new Error(errors.join('\n'));
console.log(`PASS ${catalog.projects.length} projects, ${count} films; ${(bytes / 1e6).toFixed(1)} MB site; ${(originalBytes / 1e9).toFixed(2)} GB originals indexed for Releases.`);
