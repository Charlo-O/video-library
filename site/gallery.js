(() => {
  const cards = [...document.querySelectorAll('.film-card')];
  const search = document.querySelector('#search');
  const filters = [...document.querySelectorAll('[data-filter]')];
  let selected = 'all';
  const params = new URLSearchParams(location.search);
  const initial = params.get('category');
  if (filters.some(button => button.dataset.filter === initial)) selected = initial;
  search.value = params.get('q') || '';
  function update() {
    const query = search.value.trim().toLowerCase();
    let count = 0;
    for (const card of cards) {
      card.hidden = !(selected === 'all' || card.dataset.category === selected) || !card.dataset.search.includes(query);
      if (!card.hidden) count++;
    }
    for (const button of filters) {
      const active = button.dataset.filter === selected;
      button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
    }
    document.querySelector('#result-count').textContent = `${count} 个项目`;
    document.querySelector('#empty').hidden = count !== 0;
    const next = new URL(location.href);
    selected === 'all' ? next.searchParams.delete('category') : next.searchParams.set('category', selected);
    query ? next.searchParams.set('q', search.value.trim()) : next.searchParams.delete('q');
    history.replaceState(null, '', next);
  }
  filters.forEach(button => button.addEventListener('click', () => { selected = button.dataset.filter; update(); }));
  search.addEventListener('input', update);
  update();
})();
