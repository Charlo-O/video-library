import { readFile, writeFile, mkdir, cp, rm, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(root, 'dist');
const catalog = JSON.parse(await readFile(path.join(root, 'data/catalog.json'), 'utf8'));
await rm(dist, { recursive: true, force: true }); await mkdir(dist, { recursive: true });
await cp(path.join(root, 'site'), dist, { recursive: true });
await cp(path.join(root, 'media'), path.join(dist, 'media'), { recursive: true });
await cp(path.join(root, 'credits'), path.join(dist, 'credits'), { recursive: true });
await cp(path.join(root, 'data'), path.join(dist, 'data'), { recursive: true });
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const json = value => JSON.stringify(value).replace(/</g, '\\u003c');
const time = n => { const value = Math.round(n); return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`; };
const mb = n => `${(n / 1e6).toFixed(1)} MB`;
const videos = catalog.projects.flatMap(p => p.videos);
const categories = catalog.categories;
const header = prefix => `<header class="header"><a class="brand" href="${prefix}"><span class="brand-mark">c.</span> CHARLO <span class="brand-slash">/</span> FILMS</a><nav aria-label="站点导航"><a href="https://charlo.cn/interactive-lab/">交互实验室 <span>↗</span></a><a href="https://github.com/${catalog.repository}" target="_blank" rel="noopener">GitHub <span>↗</span></a></nav></header>`;
const footer = prefix => `<footer><span>Made with curiosity. <span class="author">— Charlo</span></span><div><a href="${prefix}credits.html">来源与署名</a><a href="https://github.com/${catalog.repository}/releases" target="_blank" rel="noopener">原片与版本 ↗</a></div></footer>`;
const shell = (title, description, prefix, body, script = '') => `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#171817"><meta name="description" content="${esc(description)}"><title>${esc(title)} · Charlo Films</title><link rel="icon" href="${prefix}favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="${prefix}style.css"></head><body><a class="skip" href="#main">跳至内容</a>${header(prefix)}<main id="main">${body}</main>${footer(prefix)}${script}</body></html>`;

const ordered = [...catalog.projects].sort((a, b) => Number(b.featured) - Number(a.featured));
const cards = ordered.map((p, i) => {
  const v = p.videos[0];
  return `<a class="film-card" href="./videos/${p.id}/" data-category="${p.category}" data-search="${esc(`${p.title} ${p.description} ${p.id}`.toLowerCase())}"><div class="poster"><img src="./${v.poster}" width="${v.width}" height="${v.height}" alt="${esc(p.title)}画面" loading="${i < 4 ? 'eager' : 'lazy'}" decoding="async"><span class="category-label">${categories[p.category]}</span><span class="play-mark" aria-hidden="true">▶</span><span class="duration">${time(v.duration)}</span>${p.videos.length > 1 ? `<span class="version-count">${p.videos.length} 部影片</span>` : ''}</div><div class="film-info"><h2>${esc(p.title)}<span aria-hidden="true">↗</span></h2><p>${esc(p.description)}</p></div></a>`;
}).join('\n');
const buttons = `<button class="filter active" data-filter="all" aria-pressed="true">全部 <span>${catalog.projects.length}</span></button>` + Object.entries(categories).map(([id, title]) => `<button class="filter" data-filter="${id}" aria-pressed="false">${title} <span>${catalog.projects.filter(p => p.category === id).length}</span></button>`).join('');
const intro = `<section class="intro"><div><p class="eyebrow"><span class="status-dot"></span> MOTION / INTERACTION / STORIES</p><h1>视频作品集<span class="accent">.</span></h1><p class="lead">把纸张、玻璃、自然与想法，变成流动的画面。</p></div><div class="collection-count"><strong>${String(catalog.projects.length).padStart(2, '0')}</strong><span>个项目<br>${videos.length} 部影片</span></div></section>`;
const toolbar = `<section class="browse" aria-label="筛选视频"><div class="filters" role="group" aria-label="作品分类">${buttons}</div><label class="search"><svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="10" cy="10" r="6.5"/><path d="m15 15 5 5"/></svg><input id="search" type="search" placeholder="搜索作品" aria-label="搜索作品"></label></section><p id="result-count" class="result-count" aria-live="polite">${catalog.projects.length} 个项目</p>`;
await writeFile(path.join(dist, 'index.html'), shell('视频作品集', 'Charlo 的交互演示、动态视觉、产品宣传与教程视频。', './', intro + toolbar + `<section class="film-grid" aria-label="视频作品">${cards}</section><p id="empty" class="empty" hidden>没有找到匹配的作品。试试其他关键词。</p>`, '<script defer src="./gallery.js"></script>'));

for (const project of catalog.projects) {
  const v = project.videos[0];
  const kind = v.previewComplete ? '完整内容压缩预览' : `${time(v.previewDuration)} 精选画面预览 · 无声`;
  const variants = project.videos.map((video, i) => `<button class="variant${i === 0 ? ' active' : ''}" data-index="${i}" aria-pressed="${i === 0}"><span>${esc(video.title)}</span><small>${time(video.duration)}</small></button>`).join('');
  const credits = await Promise.all(project.credits.map(async id => ({ id, text: await readFile(path.join(root, 'credits', `${id}.md`), 'utf8') })));
  const body = `<a class="back-link" href="../../">← 全部作品</a><section class="project-heading"><div><p class="eyebrow">${categories[project.category]} <span class="divider">/</span> ${esc(project.id.toUpperCase())}</p><h1>${esc(project.title)}</h1><p class="lead">${esc(project.description)}</p></div>${project.interactiveUrl ? `<a class="experience-link" href="${project.interactiveUrl}">亲自体验 <span>↗</span></a>` : ''}</section><section class="project-layout"><div class="player-column"><div class="video-frame"><video id="player" controls playsinline preload="none" poster="../../${v.poster}" src="../../${v.preview}" aria-label="${esc(project.title)}视频预览"></video><button class="start-preview" id="start-preview" type="button" aria-label="播放视频预览"><span aria-hidden="true">▶</span> 播放预览</button></div><div class="player-caption"><span id="preview-kind">${kind}</span><span id="preview-audio">${v.previewHasAudio ? '有声' : '无声'}</span></div><p class="playback-error" id="playback-error" hidden>预览暂时无法播放，可以下载原片观看。<button id="retry-player">重试</button></p><div class="project-context"><h2>关于这件作品</h2><p>${esc(project.description)}</p>${project.interactiveUrl ? '<p>视频展示作品的动态过程，也可以打开交互页面，亲自操作画面。</p>' : ''}<p>这里提供网页预览；原始成片作为项目版本保存在 GitHub Releases 中。</p></div></div><aside class="film-details" aria-label="影片版本与下载"><div class="details-label">影片版本 <span>${project.videos.length}</span></div><div class="variants">${variants}</div><dl><div><dt>原片时长</dt><dd id="original-duration">${time(v.duration)}</dd></div><div><dt>原片尺寸</dt><dd id="original-size">${v.width} × ${v.height}</dd></div><div><dt>原片大小</dt><dd id="original-bytes">${mb(v.bytes)}</dd></div><div><dt>声音</dt><dd id="original-audio">${v.hasAudio ? '有声' : '无声'}</dd></div></dl><a class="download-button" id="download-original" href="${v.downloadUrl}">下载原片 <span>↓</span></a><a class="release-link" href="${project.releaseUrl}" target="_blank" rel="noopener">版本记录与校验文件 ↗</a><p class="download-note">下载保留原始画质。网页预览经过压缩，长片提供精选片段。</p></aside></section>${credits.length ? `<section class="credits-section"><h2>来源与署名</h2>${credits.map(({ id, text }) => `<details><summary>查看完整来源说明</summary><pre>${esc(text)}</pre><a href="../../credits/${id}.md">打开署名文件 ↗</a></details>`).join('')}</section>` : ''}`;
  const dir = path.join(dist, 'videos', project.id); await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'index.html'), shell(project.title, project.description, '../../', body, `<script id="project-data" type="application/json">${json(project)}</script><script defer src="../../player.js"></script>`));
}
const creditsBody = `<a class="back-link" href="./">← 全部作品</a><section class="project-heading"><div><p class="eyebrow">SOURCES & CREDITS</p><h1>来源与署名</h1><p class="lead">保留每部影片原有的来源记录与署名。</p></div></section><div class="credits-intro"><p>这里收录 Charlo 的项目成片、交互演示与改编作品。视频与其中的第三方内容保留各自的权利归属，本集合没有为全部内容统一授予新的许可证。</p><p>完整原片存放在项目 Releases。网页提供压缩预览；超过 90 秒的影片使用 24 秒精选画面预览，原始成片的声音和画质保持不变。</p></div><section class="credit-list">${catalog.projects.filter(p => p.credits.length).map(p => `<a href="./videos/${p.id}/"><span>${esc(p.title)}</span><span>查看项目署名 ↗</span></a>`).join('')}</section><div class="credits-intro"><p>全年圆环演示从当前交互实现重新录制，没有将目录中的参考视频作为成片发布。剪纸、花卉、钟表等作品的灵感与制作记录以各原项目文档为准。</p><p>原片下载后可用仓库提供的脚本核对 SHA-256，确认与发布文件一致。</p></div>`;
await writeFile(path.join(dist, 'credits.html'), shell('来源与署名', '视频作品的来源与音效署名。', './', creditsBody));
await writeFile(path.join(dist, '.nojekyll'), '');
console.log(`Built ${catalog.projects.length} project pages and ${videos.length} films.`);
