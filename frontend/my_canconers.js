/* ── Estat ─────────────────────────────────────────────────── */
const state = { canconers: [], active: null };

/* ── Init ──────────────────────────────────────────────────── */
(async () => {
  Auth.captureTokenFromURL();
  const user = await Auth.loadUser();
  if (!user) { window.location.href = '/'; return; }
  Auth.renderUserWidget('user-widget');
  document.querySelector('header .subtitle').textContent = `Hola, ${user.name}!`;
  await Promise.all([loadCanconers(), loadProposals()]);
})();

/* ── Cançoners ─────────────────────────────────────────────── */
async function loadCanconers() {
  const res  = await Auth.apiFetch('/canconers');
  const data = await res.json();
  state.canconers = data;
  renderList();
}

function renderList() {
  const ul    = document.getElementById('mc-list');
  const empty = document.getElementById('mc-empty');
  ul.innerHTML = '';
  if (!state.canconers.length) { empty.hidden = false; return; }
  empty.hidden = true;

  state.canconers.forEach(c => {
    const li = document.createElement('li');
    if (state.active?.id === c.id) li.classList.add('active');
    const date = new Date(c.updated_at).toLocaleDateString('ca-ES');
    li.innerHTML = `
      <div class="mc-title">${c.title}</div>
      <div class="mc-info">${c.song_count} cançons · ${date}</div>`;
    li.addEventListener('click', () => openCanconer(c.id));
    ul.appendChild(li);
  });
}

async function openCanconer(id) {
  const res  = await Auth.apiFetch(`/canconers/${id}`);
  const data = await res.json();
  state.active = data;
  renderList(); // actualitza classe active
  renderDetail();
}

function renderDetail() {
  const c  = state.active;
  const el = document.getElementById('mc-detail');
  el.hidden = false;

  document.getElementById('mc-detail-title').textContent = c.title;
  const date = new Date(c.updated_at).toLocaleDateString('ca-ES', { dateStyle: 'long' });
  document.getElementById('mc-detail-meta').textContent =
    `${c.songs.length} cançons · Actualitzat el ${date}`;

  renderShareBox(c);
  renderSongsList(c.songs);
}

function renderShareBox(c) {
  const box      = document.getElementById('share-box');
  const disabled = document.getElementById('share-disabled');
  if (c.share_token) {
    box.hidden = false; disabled.hidden = true;
    const url = `${location.origin}/c/${c.share_token}`;
    document.getElementById('share-url').value = url;
  } else {
    box.hidden = true; disabled.hidden = false;
  }
}

function renderSongsList(songs) {
  const ul = document.getElementById('mc-songs-list');
  ul.innerHTML = '';
  songs.forEach((s, i) => {
    const { transposeKey } = Transpose;
    const key = transposeKey(s.key, s.semitones);
    const li  = document.createElement('li');
    li.innerHTML = `
      <span class="mc-pos">${i + 1}</span>
      <span class="mc-stitle">${s.title}</span>
      <span class="mc-artist">${s.artist}</span>
      <span class="mc-key">${key}</span>`;
    ul.appendChild(li);
  });
}

/* ── Accions del detall ────────────────────────────────────── */
document.getElementById('btn-load').addEventListener('click', () => {
  if (!state.active) return;
  // Serialitzem el cançoner a sessionStorage perquè app.js el llegeixi
  sessionStorage.setItem('load_canconer', JSON.stringify(state.active));
  window.location.href = '/';
});

document.getElementById('btn-delete').addEventListener('click', async () => {
  if (!state.active) return;
  if (!confirm(`Eliminar "${state.active.title}"? Aquesta acció no es pot desfer.`)) return;
  await Auth.apiFetch(`/canconers/${state.active.id}`, { method: 'DELETE' });
  state.active = null;
  document.getElementById('mc-detail').hidden = true;
  await loadCanconers();
});

document.getElementById('btn-share').addEventListener('click', async () => {
  if (!state.active) return;
  const hasToken = !!state.active.share_token;
  // Toggle: si no té token, en genera un; si en té, mostra la caixa
  if (!hasToken) {
    const res  = await Auth.apiFetch(`/canconers/${state.active.id}/share`, {
      method: 'POST', body: JSON.stringify({ action: 'enable' }),
    });
    const { share_token } = await res.json();
    state.active.share_token = share_token;
  }
  renderShareBox(state.active);
});

document.getElementById('btn-enable-share').addEventListener('click', async () => {
  const res = await Auth.apiFetch(`/canconers/${state.active.id}/share`, {
    method: 'POST', body: JSON.stringify({ action: 'enable' }),
  });
  const { share_token } = await res.json();
  state.active.share_token = share_token;
  renderShareBox(state.active);
});

document.getElementById('btn-copy').addEventListener('click', () => {
  const url = document.getElementById('share-url').value;
  navigator.clipboard.writeText(url).then(() => {
    const btn = document.getElementById('btn-copy');
    btn.textContent = '✓ Copiat!';
    setTimeout(() => { btn.textContent = 'Copiar'; }, 2000);
  });
});

document.getElementById('btn-revoke').addEventListener('click', async () => {
  if (!confirm('Revocar l\'enllaç? Qui el tingui ja no podrà accedir al cançoner.')) return;
  await Auth.apiFetch(`/canconers/${state.active.id}/share`, {
    method: 'POST', body: JSON.stringify({ action: 'disable' }),
  });
  state.active.share_token = null;
  renderShareBox(state.active);
});

/* ── Propostes ─────────────────────────────────────────────── */
async function loadProposals() {
  const res   = await Auth.apiFetch('/proposals');
  const data  = await res.json();
  const ul    = document.getElementById('proposals-list');
  const empty = document.getElementById('proposals-empty');
  const badge = document.getElementById('proposals-badge');

  ul.innerHTML = '';
  const pending = data.filter(p => p.status === 'pending').length;
  badge.textContent = pending ? `${pending} pendent${pending > 1 ? 's' : ''}` : '';
  badge.hidden = !pending;

  if (!data.length) { empty.hidden = false; return; }
  empty.hidden = true;

  data.forEach(p => {
    const li = document.createElement('li');
    const statusLabel = { pending: 'Pendent', approved: 'Aprovada', rejected: 'Rebutjada' }[p.status];
    li.innerHTML = `
      <div style="flex:1">
        <div style="display:flex;align-items:center;gap:.5rem">
          <span class="p-title">${p.song_title}</span>
          <span class="p-artist">${p.song_artist}</span>
          <span class="p-status status-${p.status}">${statusLabel}</span>
        </div>
        ${p.notes ? `<div class="p-notes">Nota: ${p.notes}</div>` : ''}
      </div>`;
    ul.appendChild(li);
  });
}
