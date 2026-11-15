import { readFile, mkdir, rename, unlink, stat } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const ids = [];
let all = false;
let help = false;
let output = path.join(root, 'downloads');
let outputSpecified = false;
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--all') {
    if (all) throw new Error('Specify --all only once');
    all = true;
  } else if (arg === '--output') {
    if (outputSpecified) throw new Error('Specify --output only once');
    const value = args[++i];
    if (!value || value.startsWith('-')) throw new Error('--output requires a directory path');
    output = path.resolve(value);
    outputSpecified = true;
  } else if (arg === '--help' || arg === '-h') {
    help = true;
  } else if (arg.startsWith('-')) {
    throw new Error(`Unknown option: ${arg}`);
  } else {
    ids.push(arg);
  }
}
if (all && ids.length) throw new Error('Use --all or project IDs, not both');
if (!help && args.length && !all && !ids.length) throw new Error('Choose --all or at least one project ID');

const catalog = JSON.parse(await readFile(path.join(root, 'data/catalog.json'), 'utf8'));
if (help || !args.length) {
  console.log('Download originals from GitHub Releases and verify SHA-256.\nUsage: npm run download -- ripples watercat [--output /absolute/folder]\n       npm run download -- --all [--output /absolute/folder]');
  console.log(`Available: ${catalog.projects.map(project => project.id).join(', ')}`);
  process.exit(0);
}
const byId = new Map(catalog.projects.map(project => [project.id, project]));
const uniqueIds = [...new Set(ids)];
const unknown = uniqueIds.filter(id => !byId.has(id));
if (unknown.length) throw new Error(`Unknown project id: ${unknown.join(', ')}`);
const projects = all ? catalog.projects : uniqueIds.map(id => byId.get(id));
const maxRetries = 3;
const timeoutMs = 180_000;

async function matchesExisting(file, video) {
  let info;
  try { info = await stat(file); }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  if (!info.isFile() || info.size !== video.bytes) return false;
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex') === video.sha256;
}

function retryable(error) {
  if (typeof error.retryable === 'boolean') return error.retryable;
  return ['TypeError', 'AbortError', 'TimeoutError'].includes(error.name)
    || ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ENETUNREACH', 'ECONNREFUSED', 'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT'].includes(error.code ?? error.cause?.code);
}

async function download(video, final) {
  // A valid existing final is never removed. Replacement happens only after
  // the newly downloaded temporary file passes size and SHA-256 checks.
  const temp = `${final}.partial-${randomUUID()}`;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(video.downloadUrl, { signal: AbortSignal.timeout(timeoutMs) });
      if (!response.ok) {
        await response.body?.cancel();
        const error = new Error(`HTTP ${response.status}: ${video.downloadUrl}`);
        error.retryable = [408, 425, 429].includes(response.status) || response.status >= 500;
        throw error;
      }
      if (!response.body) {
        const error = new Error(`Empty response: ${video.downloadUrl}`);
        error.retryable = false;
        throw error;
      }
      const hash = createHash('sha256');
      let size = 0;
      const meter = new Transform({ transform(chunk, encoding, callback) {
        size += chunk.length;
        hash.update(chunk);
        callback(null, chunk);
      } });
      await pipeline(Readable.fromWeb(response.body), meter, createWriteStream(temp));
      if (size !== video.bytes || hash.digest('hex') !== video.sha256) {
        const error = new Error(`Checksum mismatch: ${video.assetName}`);
        error.retryable = false;
        throw error;
      }
      await rename(temp, final);
      console.log(`VERIFIED ${video.assetName}`);
      return;
    } catch (error) {
      await unlink(temp).catch(() => {});
      if (attempt === maxRetries || !retryable(error)) throw error;
      const waitMs = 1000 * 2 ** attempt;
      console.warn(`RETRY ${attempt + 1}/${maxRetries} ${video.assetName}: ${error.message} (in ${waitMs / 1000}s)`);
      await delay(waitMs);
    }
  }
}

for (const project of projects) {
  const dir = path.join(output, project.id);
  await mkdir(dir, { recursive: true });
  for (const video of project.videos) {
    const final = path.join(dir, video.assetName);
    if (await matchesExisting(final, video)) {
      console.log(`EXISTS ${project.id}/${video.id} · SHA-256 verified`);
      continue;
    }
    console.log(`Downloading ${project.id}/${video.id} (${(video.bytes / 1e6).toFixed(1)} MB)`);
    await download(video, final);
  }
}
