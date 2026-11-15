import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { createServer } from './serve.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const catalog = JSON.parse(await readFile(path.join(root, 'data/catalog.json'), 'utf8'));
const out = process.env.SMOKE_OUT || '/tmp/video-library-smoke'; await mkdir(out, { recursive: true });
let server;
let url = process.env.SMOKE_URL;
if (!url) { server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); url = `http://127.0.0.1:${server.address().port}/video-library/`; }
let browserPath = process.env.CHROME_PATH;
for (const candidate of ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium']) {
  if (browserPath) break; try { await access(candidate); browserPath = candidate; } catch {}
}
const browser = await chromium.launch({ executablePath: browserPath, headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const report = [];
const selectedProjects = process.env.SMOKE_PROJECTS?.split(',');
const selectedModes = process.env.SMOKE_MODES?.split(',');
const screenshots = new Set(['ripples', 'watercat', 'architecture', 'whole-circle', 'glasses', 'ascii']);
try {
  for (const [mode, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
    if (selectedModes && !selectedModes.includes(mode)) continue;
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: mode === 'mobile', hasTouch: mode === 'mobile' });
    const page = await context.newPage(); page.setDefaultTimeout(20000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', response => { if (new URL(response.url()).origin === new URL(url).origin && response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
    assert.equal(await page.locator('.film-card').count(), catalog.projects.length);
    assert.equal(await page.locator('video').count(), 0, 'Gallery must not load every video at once');
    for (const [id] of Object.entries(catalog.categories)) {
      await page.locator(`[data-filter="${id}"]`).click();
      assert.equal(await page.locator('.film-card:visible').count(), catalog.projects.filter(p => p.category === id).length);
    }
    await page.locator('[data-filter="all"]').click();
    await page.locator('#search').fill('水猫'); assert.equal(await page.locator('.film-card:visible').count(), 1);
    await page.locator('#search').fill('no-such-project-xyz'); assert.equal(await page.locator('#empty').isVisible(), true);
    await page.locator('#search').fill('');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: path.join(out, `${mode}-gallery.png`) });
    const selected = selectedProjects ? catalog.projects.filter(p => selectedProjects.includes(p.id)) : mode === 'desktop' ? catalog.projects : catalog.projects.filter(p => screenshots.has(p.id));
    for (const project of selected) {
      const response = await page.goto(new URL(`videos/${project.id}/`, url).href, { waitUntil: 'domcontentloaded', timeout: 45000 });
      assert.equal(response.status(), 200);
      assert.equal(await page.locator('.variant').count(), project.videos.length);
      const original = await page.locator('#download-original').getAttribute('href'); assert.equal(original, project.videos[0].downloadUrl);
      await page.locator('#player').evaluate(video => { video.muted = true; });
      await page.getByRole('button', { name: '播放视频预览', exact: true }).click();
      await page.waitForFunction(() => { const v = document.querySelector('#player'); return v.currentTime > .1 && v.videoWidth > 0 && !v.error; });
      if (project.videos.length > 1) {
        await page.locator('.variant').last().click();
        assert.equal(await page.locator('#download-original').getAttribute('href'), project.videos.at(-1).downloadUrl);
        await page.getByRole('button', { name: '播放视频预览', exact: true }).click();
        await page.waitForFunction(() => document.querySelector('#player').currentTime > .1);
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${project.id} overflow`);
      if (screenshots.has(project.id)) await page.screenshot({ path: path.join(out, `${mode}-${project.id}.png`) });
      report.push({ project: project.id, mode, status: 'passed' });
      console.log(`PASS ${mode} ${project.id}`);
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
} finally {
  await writeFile(path.join(out, 'report.json'), JSON.stringify({ url, report }, null, 2));
  await browser.close(); if (server) await new Promise(resolve => server.close(resolve));
}
console.log(`Video playback and navigation passed. Screenshots: ${out}`);
