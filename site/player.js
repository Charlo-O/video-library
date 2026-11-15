(() => {
  const project = JSON.parse(document.querySelector('#project-data').textContent);
  const player = document.querySelector('#player');
  const error = document.querySelector('#playback-error');
  const buttons = [...document.querySelectorAll('[data-index]')];
  const time = n => { const value = Math.round(n); return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`; };
  const set = (id, value) => { document.querySelector(id).textContent = value; };
  function choose(index) {
    const video = project.videos[index];
    player.pause();
    player.poster = `../../${video.poster}`;
    player.src = `../../${video.preview}`;
    player.load();
    error.hidden = true;
    buttons.forEach(button => { const active = Number(button.dataset.index) === index; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
    set('#preview-kind', video.previewComplete ? '完整内容压缩预览' : `${time(video.previewDuration)} 精选画面预览 · 无声`);
    set('#preview-audio', video.previewHasAudio ? '有声' : '无声');
    set('#original-duration', time(video.duration));
    set('#original-size', `${video.width} × ${video.height}`);
    set('#original-bytes', `${(video.bytes / 1e6).toFixed(1)} MB`);
    set('#original-audio', video.hasAudio ? '有声' : '无声');
    document.querySelector('#download-original').href = video.downloadUrl;
    const url = new URL(location.href); url.searchParams.set('film', video.id); history.replaceState(null, '', url);
  }
  buttons.forEach(button => button.addEventListener('click', () => choose(Number(button.dataset.index))));
  player.addEventListener('error', () => { error.hidden = false; });
  document.querySelector('#retry-player').addEventListener('click', () => { error.hidden = true; player.load(); player.play().catch(() => { error.hidden = false; }); });
  const initial = new URLSearchParams(location.search).get('film');
  const index = project.videos.findIndex(video => video.id === initial);
  if (index > 0) choose(index);
})();
