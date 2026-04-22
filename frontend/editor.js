/* ════════════════════════════════════════════════════════════
   editor.js — Lògica de l'editor de cançons
   ════════════════════════════════════════════════════════════ */

/* ── Teoria musical ────────────────────────────────────────── */
const CHROMATIC = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const ALL_KEYS  = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B',
                   'Cm','C#m','Dm','D#m','Em','Fm','F#m','Gm','G#m','Am','A#m','Bm'];

// Intervals des de la tònica per a cada tipus d'acord (en semitons)
const SCALE_DEGREES = {
  major: [
    { interval: 0,  suffixes: ['', 'maj7', '6', 'sus2', 'sus4', 'add9'] },
    { interval: 2,  suffixes: ['m', 'm7', 'sus4'] },
    { interval: 4,  suffixes: ['m', 'm7'] },
    { interval: 5,  suffixes: ['', 'maj7', '7'] },
    { interval: 7,  suffixes: ['', '7', 'sus4'] },
    { interval: 9,  suffixes: ['m', 'm7'] },
    { interval: 11, suffixes: ['dim', 'm7b5'] },
  ],
  minor: [
    { interval: 0,  suffixes: ['m', 'm7', 'mmaj7'] },
    { interval: 2,  suffixes: ['dim', 'm7b5'] },
    { interval: 3,  suffixes: ['', 'maj7'] },
    { interval: 5,  suffixes: ['m', 'm7'] },
    { interval: 7,  suffixes: ['m', '7'] },
    { interval: 8,  suffixes: ['', 'maj7'] },
    { interval: 10, suffixes: ['', '7'] },
  ],
};

function rootOf(key) {
  return key.replace('m', '').replace('#', '#');
}
function isMajor(key) { return !key.endsWith('m') || key.endsWith('#m') || key === 'Am'; }

// Genera la llista d'acords suggerits per a un to donat
function chordsForKey(key) {
  const isMin = key.endsWith('m');
  const root  = isMin ? key.slice(0, -1) : key;
  const rootIdx = CHROMATIC.indexOf(root);
  if (rootIdx === -1) return { diatonic: [], secondary: [] };

  const degrees = isMin ? SCALE_DEGREES.minor : SCALE_DEGREES.major;
  const diatonic = [];
  const secondary = [];

  degrees.forEach(({ interval, suffixes }) => {
    const noteIdx  = (rootIdx + interval) % 12;
    const note     = CHROMATIC[noteIdx];
    suffixes.forEach((suf, i) => {
      (i === 0 ? diatonic : secondary).push(note + suf);
    });
  });

  return { diatonic, secondary };
}

/* ── Inicialitzar selector de tons ─────────────────────────── */
const selKey = document.getElementById('meta-key');
ALL_KEYS.forEach(k => {
  const opt = document.createElement('option');
  opt.value = opt.textContent = k;
  selKey.appendChild(opt);
});
selKey.value = 'Am'; // valor per defecte

/* ── Elements ──────────────────────────────────────────────── */
const editor    = document.getElementById('editor');
const highlight = document.getElementById('editor-highlight');
const chordMenu = document.getElementById('chord-menu');
const menuGroups = document.getElementById('chord-menu-groups');
const preview   = document.getElementById('preview-panel');
const previewBody = document.getElementById('preview-body');
const palette   = document.getElementById('chord-palette');
const saveStatus = document.getElementById('save-status');

/* ── Ressaltat sintàctic ───────────────────────────────────── */
function escHTML(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function syntaxHighlight(raw) {
  // Ordre: primer sec, després ch, després la resta és text pla
  return escHTML(raw)
    .replace(/&lt;sec&gt;(.*?)&lt;\/sec&gt;/g,
      '<span class="hl-tag">&lt;sec&gt;</span><span class="hl-sec">$1</span><span class="hl-tag">&lt;/sec&gt;</span>')
    .replace(/&lt;ch&gt;(.*?)&lt;\/ch&gt;/g,
      '<span class="hl-tag">&lt;ch&gt;</span><span class="hl-ch">$1</span><span class="hl-tag">&lt;/ch&gt;</span>');
}

function updateHighlight() {
  highlight.innerHTML = syntaxHighlight(editor.value) + '\n'; // \n evita col·lapse al final
  syncScroll();
}

function syncScroll() {
  highlight.scrollTop = editor.scrollTop;
}
editor.addEventListener('scroll', syncScroll);
editor.addEventListener('input', () => { updateHighlight(); updatePreview(); });

/* ── Vista prèvia ──────────────────────────────────────────── */
function rawToPreview(raw) {
  return escHTML(raw)
    .replace(/&lt;sec&gt;(.*?)&lt;\/sec&gt;/g, '<span class="section-title">— $1 —</span>')
    .replace(/&lt;ch&gt;(.*?)&lt;\/ch&gt;/g, '<span class="chord">$1</span>');
}

function updatePreview() {
  if (!preview.hidden) {
    previewBody.innerHTML = rawToPreview(editor.value);
  }
}

document.getElementById('toggle-preview').addEventListener('change', e => {
  preview.hidden = !e.target.checked;
  updatePreview();
});

/* ── Paleta i menú d'acords ────────────────────────────────── */
function buildChordUI() {
  const key = selKey.value;
  const { diatonic, secondary } = chordsForKey(key);

  // Paleta lateral
  palette.innerHTML = '';
  [...diatonic, ...secondary].forEach(ch => {
    const chip = document.createElement('button');
    chip.className = 'chip';
    chip.textContent = ch;
    chip.addEventListener('click', () => insertAtCursor(`<ch>${ch}</ch>`));
    palette.appendChild(chip);
  });

  // Contingut del menú contextual
  menuGroups.innerHTML = '';
  [
    { label: 'Acords diatònics', chords: diatonic },
    { label: 'Variacions', chords: secondary },
  ].forEach(({ label, chords }) => {
    if (!chords.length) return;
    const lbl = document.createElement('div');
    lbl.className = 'chord-group-label';
    lbl.textContent = label;
    menuGroups.appendChild(lbl);

    const wrap = document.createElement('div');
    wrap.className = 'chord-group-items';
    chords.forEach(ch => {
      const btn = document.createElement('button');
      btn.textContent = ch;
      btn.addEventListener('mousedown', e => {
        e.preventDefault(); // evita que el textarea perdi el focus
        hideChordMenu();
        insertAtCursor(`<ch>${ch}</ch>`);
      });
      wrap.appendChild(btn);
    });
    menuGroups.appendChild(wrap);
  });
}

selKey.addEventListener('change', buildChordUI);

/* ── Menú contextual ───────────────────────────────────────── */
editor.addEventListener('contextmenu', e => {
  e.preventDefault();
  buildChordUI(); // regenera amb el to actual
  positionMenu(e.clientX, e.clientY);
  chordMenu.hidden = false;
});

document.addEventListener('click', hideChordMenu);
document.addEventListener('keydown', e => { if (e.key === 'Escape') hideChordMenu(); });

function hideChordMenu() { chordMenu.hidden = true; }

function positionMenu(x, y) {
  chordMenu.hidden = false; // momentàniament visible per mesurar
  const mw = chordMenu.offsetWidth;
  const mh = chordMenu.offsetHeight;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  chordMenu.style.left = (x + mw > vw ? vw - mw - 8 : x) + 'px';
  chordMenu.style.top  = (y + mh > vh ? vh - mh - 8 : y) + 'px';
}

/* ── Inserir text al cursor ────────────────────────────────── */
function insertAtCursor(text) {
  const start = editor.selectionStart;
  const end   = editor.selectionEnd;
  const val   = editor.value;
  editor.value = val.slice(0, start) + text + val.slice(end);
  const pos = start + text.length;
  editor.setSelectionRange(pos, pos);
  editor.focus();
  updateHighlight();
  updatePreview();
}

/* ── Barra d'eines ─────────────────────────────────────────── */
document.getElementById('editor-toolbar').addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;

  if (action === 'sec') {
    const name = prompt('Nom de la secció (ex: Estrofa 1, Tornada…)');
    if (name) insertAtCursor(`<sec> ${name} </sec>\n`);
  } else if (action === 'ch') {
    const sel = editor.value.slice(editor.selectionStart, editor.selectionEnd).trim();
    insertAtCursor(sel ? `<ch>${sel}</ch>` : '<ch></ch>');
    if (!sel) {
      // Posicionar cursor dins del tag
      const pos = editor.selectionStart - 5;
      editor.setSelectionRange(pos, pos);
    }
  } else if (action === 'undo') {
    document.execCommand('undo');
  } else if (action === 'redo') {
    document.execCommand('redo');
  }
});

/* ── Dreceres de teclat ────────────────────────────────────── */
editor.addEventListener('keydown', e => {
  // Tab → 2 espais
  if (e.key === 'Tab') {
    e.preventDefault();
    insertAtCursor('  ');
  }
});



/* ── Guardar ───────────────────────────────────────────────── */
document.getElementById('btn-save').addEventListener('click', async () => {
  const title   = document.getElementById('meta-title').value.trim();
  const artist  = document.getElementById('meta-artist').value.trim();
  const key     = selKey.value;
  const capo    = parseInt(document.getElementById('meta-capo').value) || 0;
  const lang    = document.getElementById('meta-language').value;
  const tags    = document.getElementById('meta-tags').value.trim();
  const content = editor.value.trim();

  if (!title || !artist || !content) {
    setStatus('⚠ Títol, artista i contingut són obligatoris.', 'err');
    return;
  }

  try {
    const res = await fetch('/api/songs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, artist, key, capo, content, language: lang, tags }),
    });
    if (!res.ok) throw new Error();
    const { id } = await res.json();
    setStatus(`✓ Cançó guardada (id: ${id})`, 'ok');
    // Opcional: redirigir al cançoner principal
    // setTimeout(() => window.location.href = '/', 1200);
  } catch {
    setStatus('✕ Error guardant la cançó.', 'err');
  }
});

function setStatus(msg, cls) {
  saveStatus.textContent = msg;
  saveStatus.className = cls;
  setTimeout(() => { saveStatus.textContent = ''; saveStatus.className = ''; }, 4000);
}

/* ── Arrencada ─────────────────────────────────────────────── */
buildChordUI();
updateHighlight();
