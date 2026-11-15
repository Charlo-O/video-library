import { readFile, mkdir, rename, unlink, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const run = promisify(execFile);
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
const minimumTimeoutMs = 180_000;

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
  if (new URL(video.downloadUrl).protocol !== 'https:') throw new Error('Original video URLs must use HTTPS');
  const timeoutMs = Math.max(minimumTimeoutMs, Math.ceil(video.bytes / (512 * 1024) * 1000) + 30_000);
  // A valid existing final is never removed. Replacement happens only after
  // the newly downloaded temporary file passes size and SHA-256 checks.
  const temp = `${final}.partial-${randomUUID()}`;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // curl honors HTTPS_PROXY / ALL_PROXY and the system certificate store.
      // Disable user curlrc so TLS verification cannot be disabled by a preset.
      const curlArgs = ['--disable', '--fail', '--location', '--silent', '--show-error',
        '--proto', '=https', '--proto-redir', '=https', '--max-redirs', '8',
        '--connect-timeout', '30', '--max-time', String(Math.ceil(timeoutMs / 1000)),
        '--output', temp, '--write-out', '%{http_code}', '--', video.downloadUrl];
      let status;
      try {
        const result = await run('curl', curlArgs, { timeout: timeoutMs + 10_000, maxBuffer: 256 * 1024 });
        status = Number(result.stdout.trim());
      } catch (cause) {
        if (cause.code === 'ENOENT') throw new Error('curl is required to download originals. Install curl and retry.', { cause });
        status = Number(String(cause.stdout || '').trim());
        const error = new Error(status >= 400 ? `HTTP ${status}: ${video.downloadUrl}` : `curl failed (${cause.code ?? cause.signal}): ${String(cause.stderr || cause.message).trim()}`, { cause });
        error.retryable = [408, 425, 429].includes(status) || status >= 500
          || [5, 6, 7, 18, 28, 35, 52, 55, 56, 92, 95].includes(cause.code) || cause.killed === true;
        throw error;
      }
      if (!(status >= 200 && status < 300)) {
        const error = new Error(`Unexpected HTTP ${status}: ${video.downloadUrl}`);
        error.retryable = false;
        throw error;
      }
      if (!(await matchesExisting(temp, video))) {
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
      console.log(`SKIP ${project.id}/${video.id} · size and SHA-256 verified`);
      continue;
    }
    console.log(`Downloading ${project.id}/${video.id} (${(video.bytes / 1e6).toFixed(1)} MB)`);
    await download(video, final);
  }
}
