const path = require('path');
const express = require('express');
const {
  listCookies,
  addCookie,
  deleteCookie,
  clearCookies,
  importCookies,
  exportCookies
} = require('./src/db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '1mb' }));

// Serve frontend
app.use(express.static(path.join(__dirname, 'public')));

// API
app.get('/api/cookies', async (req, res) => {
  const cookies = await listCookies();
  res.json({ cookies });
});

app.post('/api/cookies', async (req, res) => {
  const { name, notes, cookieData } = req.body || {};

  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }

  if (typeof cookieData !== 'string' || !cookieData.trim()) {
    return res.status(400).json({ error: 'cookieData is required' });
  }

  try {
    JSON.parse(cookieData);
  } catch {
    return res.status(400).json({ error: 'cookieData must be valid JSON' });
  }

  const created = await addCookie({
    name: name.trim(),
    notes: typeof notes === 'string' ? notes.trim() : '',
    cookieData: cookieData.trim()
  });

  res.status(201).json({ cookie: created });
});

app.delete('/api/cookies/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid id' });
  }

  const deleted = await deleteCookie(id);
  if (!deleted) return res.status(404).json({ error: 'Not found' });

  res.json({ ok: true });
});

app.post('/api/cookies/clear', async (req, res) => {
  await clearCookies();
  res.json({ ok: true });
});

app.get('/api/cookies/export', async (req, res) => {
  const data = await exportCookies();
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="cookies-export.json"');
  res.status(200).send(JSON.stringify(data, null, 2));
});

app.post('/api/cookies/import', async (req, res) => {
  const { cookies } = req.body || {};
  if (!Array.isArray(cookies)) {
    return res.status(400).json({ error: 'cookies must be an array' });
  }

  const result = await importCookies(cookies);
  res.json({ ok: true, imported: result.imported, skipped: result.skipped });
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Cookie Saver running on http://localhost:${PORT}`);
});
