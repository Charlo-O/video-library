import { readFile, writeFile, mkdir, link, copyFile, stat, unlink } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const run = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const sourceFile = process.argv[2];
if (!sourceFile) throw new Error('Usage: node scripts/publish-videos.mjs /absolute/private-sources.json');
const sources = JSON.parse(await readFile(sourceFile, 'utf8'));
const catalog = JSON.parse(await readFile(path.join(root, 'data/catalog.json'), 'utf8'));
const work = path.join(path.dirname(path.resolve(sourceFile)), 'release-assets');
const repo = catalog.repository;
async function api(args) { return JSON.parse((await run('gh', ['api', ...args], { maxBuffer: 8e6 })).stdout); }
async function hash(file) { const h = createHash('sha256'); for await (const chunk of createReadStream(file)) h.update(chunk); return h.digest('hex'); }
const existingReleases = [];
for (let page = 1; ; page++) {
  const rows = await api([`repos/${repo}/releases?per_page=100&page=${page}`]);
  existingReleases.push(...rows); if (rows.length < 100) break;
}
const states = new Map();
const tasks = [];
for (const project of catalog.projects) {
  const dir = path.join(work, project.releaseTag); await mkdir(dir, { recursive: true });
  let release = existingReleases.find(release => release.tag_name === project.releaseTag);
  if (!release) {
    const credits = await Promise.all(project.credits.map(async id => { try { return await readFile(path.join(root, 'credits', `${id}.md`), 'utf8'); } catch { return ''; } }));
    const body = `${project.description}\n\n项目页：https://charlo.cn/video-library/videos/${project.id}/\n${project.interactiveUrl ? `交互体验：${project.interactiveUrl}\n` : ''}\n本发布保存原始成片，网页上的压缩预览另行发布。\n\n` + project.videos.map(v => `- ${v.title} · ${v.width} × ${v.height} · ${v.duration}s · ${(v.bytes / 1e6).toFixed(1)} MB`).join('\n') + (credits.some(Boolean) ? '\n\n来源与署名\n\n' + credits.filter(Boolean).join('\n\n') : '') + '\n\n校验文件见 SHA256SUMS.txt；没有为第三方内容重新授予许可证。\n';
    const notes = path.join(dir, 'notes.md'); await writeFile(notes, body);
    release = await api(['--method', 'POST', `repos/${repo}/releases`, '-f', `tag_name=${project.releaseTag}`, '-f', 'target_commitish=main', '-F', 'draft=true', '-f', `name=${project.title} · v${project.version}`, '-F', `body=@${notes}`]);
  }
  states.set(project.id, { project, release, dir, complete: 0 });
  const sourceProject = sources.find(p => p.id === project.id);
  for (const video of project.videos) tasks.push(async () => {
    const state = states.get(project.id);
    const existing = state.release.assets.find(asset => asset.name === video.assetName);
    const verified = existing?.state === 'uploaded' && existing.size === video.bytes && existing.digest === `sha256:${video.sha256}`;
    if (!verified) {
      if (!state.release.draft) throw new Error(`Published version is immutable or cannot be verified: ${project.id}/${video.id}; use a new version.`);
      const input = sourceProject.videos.find(v => v.id === video.id).source;
      if ((await stat(input)).size !== video.bytes) throw new Error(`Source changed: ${input}`);
      if (await hash(input) !== video.sha256) throw new Error(`Source SHA-256 changed: ${project.id}/${video.id}`);
      const staged = path.join(dir, video.assetName);
      await unlink(staged).catch(error => { if (error.code !== 'ENOENT') throw error; });
      try { await link(input, staged); } catch { await copyFile(input, staged); }
      let done = false;
      for (let attempt = 1; attempt <= 3 && !done; attempt++) {
        try {
          await run('gh', ['release', 'upload', project.releaseTag, staged, '--repo', repo, '--clobber'], { maxBuffer: 2e6 });
          done = true;
        } catch (error) {
          const fresh = await api([`repos/${repo}/releases/${state.release.id}`]).catch(() => null);
          done = fresh?.assets.some(asset => asset.name === video.assetName && asset.state === 'uploaded' && asset.size === video.bytes && asset.digest === `sha256:${video.sha256}`);
          if (!done && attempt === 3) throw error;
          if (!done) console.log(`RETRY ${project.id}/${video.id} attempt ${attempt + 1}`);
        }
      }
    }
    state.complete++;
    console.log(`${verified ? 'EXISTS' : 'UPLOADED'} ${project.id}/${video.id} · ${(video.bytes / 1e6).toFixed(1)} MB`);
  });
  console.log(`RELEASE ${project.id} ${release.draft ? 'draft' : 'published'}`);
}
let cursor = 0;
const failures = [];
await Promise.all(Array.from({ length: 3 }, async () => {
  while (cursor < tasks.length) {
    try { await tasks[cursor++](); } catch (error) { failures.push(error.message); console.error(`FAILED ${error.message}`); }
  }
}));
if (failures.length) throw new Error(failures.join('\n'));
const publications = [];
for (const { project, dir } of states.values()) {
  const manifest = path.join(dir, 'release-manifest.json');
  const sums = path.join(dir, 'SHA256SUMS.txt');
  await writeFile(manifest, JSON.stringify({ id: project.id, title: project.title, version: project.version, videos: project.videos.map(({ id, title, assetName, duration, width, height, bytes, sha256 }) => ({ id, title, assetName, duration, width, height, bytes, sha256 })) }, null, 2));
  await writeFile(sums, project.videos.map(v => `${v.sha256}  ${v.assetName}`).join('\n') + '\n');
  await run('gh', ['release', 'upload', project.releaseTag, manifest, sums, '--repo', repo, '--clobber']);
  const full = JSON.parse((await run('gh', ['api', `repos/${repo}/releases/${states.get(project.id).release.id}`])).stdout);
  for (const video of project.videos) {
    const asset = full.assets.find(asset => asset.name === video.assetName);
    if (!asset || asset.size !== video.bytes) throw new Error(`Uploaded size mismatch: ${project.id}/${video.id}`);
    if (asset.digest?.startsWith('sha256:') && asset.digest !== `sha256:${video.sha256}`) throw new Error(`Uploaded hash mismatch: ${project.id}/${video.id}`);
  }
  if (full.draft) await api(['--method', 'PATCH', `repos/${repo}/releases/${full.id}`, '-F', 'draft=false']);
  publications.push({ id: project.id, tag: project.releaseTag, releaseId: full.id, videos: project.videos.length, verifiedBytes: project.videos.reduce((sum, v) => sum + v.bytes, 0) });
  console.log(`PUBLISHED ${project.id} · ${project.videos.length} files verified`);
}
await writeFile(path.join(root, 'data/publication.json'), JSON.stringify({ schemaVersion: 1, repository: repo, projects: publications }, null, 2));
console.log(`Published and verified ${publications.length} releases.`);
