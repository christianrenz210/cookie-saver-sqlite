const API_BASE = '/api';

const els = {
  nameInput: document.getElementById('nameInput'),
  notesInput: document.getElementById('notesInput'),
  cookieDataInput: document.getElementById('cookieDataInput'),
  addBtn: document.getElementById('addBtn'),
  refreshBtn: document.getElementById('refreshBtn'),
  clearBtn: document.getElementById('clearBtn'),
  exportBtn: document.getElementById('exportBtn'),
  importFile: document.getElementById('importFile'),
  importTextBtn: document.getElementById('importTextBtn'),

  formAlert: document.getElementById('formAlert'),
  successToast: document.getElementById('successToast'),

  emptyState: document.getElementById('emptyState'),
  listWrap: document.getElementById('listWrap'),
  cookiesTbody: document.getElementById('cookiesTbody'),

  importModal: document.getElementById('importModal'),
  importTextArea: document.getElementById('importTextArea'),
  importModalConfirmBtn: document.getElementById('importModalConfirmBtn'),
  importModalAlert: document.getElementById('importModalAlert')
};

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '<')
    .replaceAll('>', '>')
    .replaceAll('"', '"')
    .replaceAll("'", '&#039;');
}

function showFormError(msg) {
  els.formAlert.textContent = msg;
  els.formAlert.classList.remove('d-none');
}

function clearFormError() {
  els.formAlert.textContent = '';
  els.formAlert.classList.add('d-none');
}

function showSuccess(msg) {
  els.successToast.textContent = msg;
  els.successToast.classList.remove('d-none');
  setTimeout(() => {
    els.successToast.classList.add('d-none');
  }, 2500);
}

function formatDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

async function apiFetchJSON(url, options) {
  const res = await fetch(url, options);
  const text = await res.text();
  const data = text
    ? (() => {
        try {
          return JSON.parse(text);
        } catch {
          return null;
        }
      })()
    : null;

  if (!res.ok) {
    const msg = data && data.error ? data.error : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

const cookieDataMap = new Map();

function renderCookies(cookies) {
  els.cookiesTbody.innerHTML = '';
  cookieDataMap.clear();

  if (!cookies || cookies.length === 0) {
    els.emptyState.classList.remove('d-none');
    els.listWrap.classList.add('d-none');
    return;
  }

  els.emptyState.classList.add('d-none');
  els.listWrap.classList.remove('d-none');

  for (const c of cookies) {
    const tr = document.createElement('tr');

    cookieDataMap.set(String(c.id), { name: c.name, cookieData: c.cookieData });

    tr.innerHTML = `
      <td>
        <div class="fw-semibold">${escapeHtml(c.name)}</div>
      </td>
      <td>
        <div class="cookie-notes" title="${escapeHtml(c.notes || '')}">
          ${escapeHtml(c.notes || '') || '<span class="small-muted">—</span>'}
        </div>
      </td>
      <td class="small-muted">${escapeHtml(formatDate(c.createdAt))}</td>
      <td class="table-actions">
        <div class="d-flex gap-2 justify-content-end">
          <button class="btn btn-sm btn-outline-secondary view-json-btn" data-id="${escapeHtml(c.id)}">View</button>
          <button class="btn btn-sm btn-outline-danger" data-id="${escapeHtml(c.id)}">Delete</button>
        </div>
      </td>
    `;

    els.cookiesTbody.appendChild(tr);
  }
}

async function loadCookies() {
  const data = await apiFetchJSON(`${API_BASE}/cookies`);
  renderCookies(data.cookies || []);
}

els.addBtn.addEventListener('click', async () => {
  clearFormError();

  const name = els.nameInput.value.trim();
  const notes = els.notesInput.value.trim();
  const cookieData = els.cookieDataInput.value.trim();

  if (!name) return showFormError('Cookie name is required.');
  if (!cookieData) return showFormError('Cookie JSON is required.');
  try { JSON.parse(cookieData); } catch { return showFormError('Cookie JSON is not valid JSON.'); }

  try {
    await apiFetchJSON(`${API_BASE}/cookies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, notes, cookieData })
    });

    els.nameInput.value = '';
    els.notesInput.value = '';
    els.cookieDataInput.value = '';
    showSuccess('Saved!');
    await loadCookies();
  } catch (e) {
    showFormError(e.message || String(e));
  }
});

els.cookiesTbody.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-id]');
  if (!btn || btn.classList.contains('view-json-btn')) return;

  const id = Number(btn.getAttribute('data-id'));
  const ok = confirm('Delete this cookie entry?');
  if (!ok) return;

  try {
    await apiFetchJSON(`${API_BASE}/cookies/${id}`, { method: 'DELETE' });
    showSuccess('Deleted.');
    await loadCookies();
  } catch (err) {
    showFormError(err.message || String(err));
  }
});

els.refreshBtn.addEventListener('click', loadCookies);

els.clearBtn.addEventListener('click', async () => {
  const ok = confirm('Clear ALL cookies? This cannot be undone.');
  if (!ok) return;

  try {
    await apiFetchJSON(`${API_BASE}/cookies/clear`, { method: 'POST' });
    showSuccess('All cleared.');
    await loadCookies();
  } catch (e) {
    showFormError(e.message || String(e));
  }
});

els.exportBtn.addEventListener('click', () => {
  window.location.href = `${API_BASE}/cookies/export`;
});

async function importCookiesPayload(payload) {
  const ok = confirm('Import will replace current cookies. Continue?');
  if (!ok) return;

  try {
    const res = await apiFetchJSON(`${API_BASE}/cookies/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    showSuccess(`Imported: ${res.imported}${res.skipped ? ` (skipped ${res.skipped})` : ''}`);
    await loadCookies();
  } catch (e) {
    showFormError(e.message || String(e));
  }
}

els.importFile.addEventListener('change', async () => {
  const file = els.importFile.files && els.importFile.files[0];
  els.importFile.value = '';
  if (!file) return;

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);

    let cookies = [];
    if (Array.isArray(parsed)) cookies = parsed;
    else if (parsed && Array.isArray(parsed.cookies)) cookies = parsed.cookies;
    else throw new Error('Invalid JSON format. Expected { cookies: [...] } or [...]');

    await importCookiesPayload({ cookies });
  } catch (e) {
    showFormError(e.message || String(e));
  }
});

const importModalInstance = new bootstrap.Modal(els.importModal);

const viewJsonModalEl = document.getElementById('viewJsonModal');
const viewJsonModalInstance = new bootstrap.Modal(viewJsonModalEl);
const viewJsonPre = document.getElementById('viewJsonPre');
const viewJsonModalTitle = document.getElementById('viewJsonModalTitle');
const copyJsonBtn = document.getElementById('copyJsonBtn');

els.cookiesTbody.addEventListener('click', (e) => {
  const btn = e.target.closest('.view-json-btn');
  if (!btn) return;
  const entry = cookieDataMap.get(btn.getAttribute('data-id'));
  if (!entry) return;
  viewJsonModalTitle.textContent = `Cookie JSON — ${entry.name}`;
  try {
    viewJsonPre.textContent = JSON.stringify(JSON.parse(entry.cookieData), null, 2);
  } catch {
    viewJsonPre.textContent = entry.cookieData;
  }
  viewJsonModalInstance.show();
});

copyJsonBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(viewJsonPre.textContent);
  copyJsonBtn.textContent = 'Copied!';
  setTimeout(() => { copyJsonBtn.textContent = 'Copy'; }, 1500);
});

els.importTextBtn.addEventListener('click', () => {
  els.importModalAlert.classList.add('d-none');
  els.importModalAlert.textContent = '';
  els.importTextArea.value = '';
  importModalInstance.show();
});

els.importModalConfirmBtn.addEventListener('click', async () => {
  els.importModalAlert.classList.add('d-none');
  els.importModalAlert.textContent = '';

  try {
    const raw = els.importTextArea.value.trim();
    if (!raw) throw new Error('Paste JSON first.');

    const parsed = JSON.parse(raw);

    let cookies = [];
    if (Array.isArray(parsed)) cookies = parsed;
    else if (parsed && Array.isArray(parsed.cookies)) cookies = parsed.cookies;
    else throw new Error('Invalid JSON format. Expected { cookies: [...] } or [...]');

    await importCookiesPayload({ cookies });
    importModalInstance.hide();
  } catch (e) {
    els.importModalAlert.textContent = e.message || String(e);
    els.importModalAlert.classList.remove('d-none');
  }
});

loadCookies();
