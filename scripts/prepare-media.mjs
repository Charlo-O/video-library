import { readFile, writeFile, mkdir, stat, access } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const input = process.argv[2];
if (!input) throw new Error('Pass a local source manifest; it is never copied into the public catalog.');
const sources = JSON.parse(await readFile(input, 'utf8'));
const work = process.env.VIDEO_WORK || path.dirname(path.resolve(input));
await mkdir(path.join(root, 'data'), { recursive: true });
await mkdir(path.join(work, 'state'), { recursive: true });
async function hash(file) { const h = createHash('sha256'); for await (const chunk of createReadStream(file)) h.update(chunk); return h.digest('hex'); }
function probe(file) { return JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', file], { encoding: 'utf8', maxBuffer: 2e6 })); }
async function run(args) {
  await new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
    let error = ''; p.stderr.on('data', chunk => { error += chunk; });
    p.on('error', reject); p.on('close', code => code === 0 ? resolve() : reject(new Error(error)));
  });
}
const tasks = [];
const projects = sources.map(project => {
  const version = project.version || '1.0.0';
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Project version must use x.y.z');
  const publicProject = { ...project, version, releaseTag: `${project.id}-v${version}`, releaseUrl: `https://github.com/Charlo-O/video-library/releases/tag/${project.id}-v${version}`, videos: new Array(project.videos.length) };
  project.videos.forEach((video, index) => tasks.push(async () => {
    await access(video.source);
    const sourceInfo = await stat(video.source);
    const stateFile = path.join(work, 'state', `${project.id}-${video.id}.json`);
    const fingerprint = `${sourceInfo.size}:${sourceInfo.mtimeMs}:preview-v1`;
    const dir = path.join(root, 'media', project.id);
    await mkdir(dir, { recursive: true });
    const poster = path.join(dir, `${video.id}.jpg`);
    const preview = path.join(dir, `${video.id}.mp4`);
    let cached;
    try { cached = JSON.parse(await readFile(stateFile, 'utf8')); await access(poster); await access(preview); } catch { cached = null; }
    if (cached?.fingerprint === fingerprint) {
      const assetName = `${project.id}-${video.id}-v${version}.mp4`;
      publicProject.videos[index] = { ...cached.video, assetName, downloadUrl: `https://github.com/Charlo-O/video-library/releases/download/${publicProject.releaseTag}/${assetName}` };
      console.log(`CACHED ${project.id}/${video.id}`); return;
    }
    const p = probe(video.source);
    const v = p.streams.find(stream => stream.codec_type === 'video');
    const hasAudio = p.streams.some(stream => stream.codec_type === 'audio');
    const duration = Number(p.format.duration);
    const complete = duration <= 90;
    const width = v.width, height = v.height;
    const scale = width >= height ? 'scale=min(960\\,iw):-2' : 'scale=-2:min(960\\,ih)';
    await run(['-ss', String(duration * .55), '-i', video.source, '-frames:v', '1', '-vf', scale, '-c:v', 'mjpeg', '-q:v', '3', '-threads', '2', poster]);
    const encode = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-maxrate', '1400k', '-bufsize', '2800k', '-pix_fmt', 'yuv420p', '-threads', '3', '-movflags', '+faststart'];
    if (complete) {
      await run(['-i', video.source, '-map', '0:v:0', '-map', '0:a:0?', '-vf', `${scale},fps=24,setsar=1`, ...encode, '-c:a', 'aac', '-b:a', '96k', '-map_metadata', '-1', preview]);
    } else {
      const args = [];
      for (const fraction of [.08, .4, .72]) args.push('-ss', String(duration * fraction), '-t', '8', '-i', video.source);
      const filters = [0, 1, 2].map(i => `[${i}:v:0]${scale},fps=24,setsar=1,setpts=PTS-STARTPTS[v${i}]`).join(';') + ';[v0][v1][v2]concat=n=3:v=1:a=0[out]';
      await run([...args, '-filter_complex', filters, '-map', '[out]', '-an', ...encode, '-map_metadata', '-1', preview]);
    }
    const pp = probe(preview);
    const pv = pp.streams.find(stream => stream.codec_type === 'video');
    const assetName = `${project.id}-${video.id}-v${version}.mp4`;
    const result = {
      id: video.id, title: video.title, assetName, duration: Math.round(duration * 100) / 100,
      width, height, bytes: sourceInfo.size, sha256: await hash(video.source), hasAudio,
      poster: `media/${project.id}/${video.id}.jpg`, preview: `media/${project.id}/${video.id}.mp4`,
      previewDuration: Math.round(Number(pp.format.duration) * 100) / 100,
      previewWidth: pv.width, previewHeight: pv.height, previewBytes: Number(pp.format.size), previewComplete: complete,
      previewHasAudio: pp.streams.some(stream => stream.codec_type === 'audio'),
      downloadUrl: `https://github.com/Charlo-O/video-library/releases/download/${publicProject.releaseTag}/${assetName}`,
    };
    publicProject.videos[index] = result;
    await writeFile(stateFile, JSON.stringify({ fingerprint, video: result }, null, 2));
    console.log(`READY ${project.id}/${video.id} · ${(result.previewBytes / 1e6).toFixed(2)} MB preview`);
  }));
  return publicProject;
});
let cursor = 0;
await Promise.all(Array.from({ length: 3 }, async () => { while (cursor < tasks.length) await tasks[cursor++](); }));
const catalog = { schemaVersion: 1, repository: 'Charlo-O/video-library', categories: { interactive: '交互演示', motion: '动态视觉', product: '产品宣传', tutorial: '教程与内容' }, projects };
await writeFile(path.join(root, 'data/catalog.json'), JSON.stringify(catalog, null, 2));
console.log(`Catalog: ${projects.length} projects, ${tasks.length} films, ${(projects.flatMap(p => p.videos).reduce((sum, v) => sum + v.previewBytes, 0) / 1e6).toFixed(1)} MB of web previews.`);
