const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'cookies.sqlite');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS cookies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    notes TEXT DEFAULT '',
    cookieData TEXT NOT NULL,
    createdAt TEXT NOT NULL
  );
`);

// Migrate old schema: if quantity column exists, rebuild table without it
const cols = db.pragma('table_info(cookies)').map(c => c.name);
if (cols.includes('quantity')) {
  db.exec(`
    CREATE TABLE cookies_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      notes TEXT DEFAULT '',
      cookieData TEXT NOT NULL DEFAULT '',
      createdAt TEXT NOT NULL
    );
    INSERT INTO cookies_new (id, name, notes, cookieData, createdAt)
      SELECT id, name, COALESCE(notes,''), COALESCE(cookieData,''), createdAt FROM cookies;
    DROP TABLE cookies;
    ALTER TABLE cookies_new RENAME TO cookies;
  `);
} else if (!cols.includes('cookieData')) {
  db.exec(`ALTER TABLE cookies ADD COLUMN cookieData TEXT NOT NULL DEFAULT ''`);
}

const nowIso = () => new Date().toISOString();

function listCookies() {
  const stmt = db.prepare(`SELECT id, name, notes, cookieData, createdAt FROM cookies ORDER BY id DESC`);
  return stmt.all().map(r => ({
    id: r.id,
    name: r.name,
    notes: r.notes || '',
    cookieData: r.cookieData || '',
    createdAt: r.createdAt
  }));
}

function addCookie({ name, notes, cookieData }) {
  const stmt = db.prepare(`INSERT INTO cookies (name, notes, cookieData, createdAt) VALUES (@name, @notes, @cookieData, @createdAt)`);
  const info = stmt.run({ name, notes: notes || '', cookieData, createdAt: nowIso() });
  const getStmt = db.prepare(`SELECT id, name, notes, cookieData, createdAt FROM cookies WHERE id = ?`);
  return getStmt.get(info.lastInsertRowid);
}

function deleteCookie(id) {
  const stmt = db.prepare(`DELETE FROM cookies WHERE id = ?`);
  const info = stmt.run(id);
  return info.changes > 0;
}

function clearCookies() {
  const stmt = db.prepare(`DELETE FROM cookies`);
  stmt.run();
}

function normalizeImportedCookie(c) {
  if (!c || typeof c !== 'object') return null;
  const name = typeof c.name === 'string' ? c.name.trim() : '';
  if (!name) return null;
  const notes = typeof c.notes === 'string' ? c.notes.trim() : '';
  const cookieData = typeof c.cookieData === 'string' ? c.cookieData.trim() : '';
  const createdAt = typeof c.createdAt === 'string' && c.createdAt ? c.createdAt : nowIso();
  return { name, notes, cookieData, createdAt };
}

function importCookies(cookies) {
  clearCookies();
  let imported = 0, skipped = 0;
  const insert = db.prepare(`INSERT INTO cookies (name, notes, cookieData, createdAt) VALUES (@name, @notes, @cookieData, @createdAt)`);
  const tx = db.transaction((items) => {
    for (const c of items) {
      const norm = normalizeImportedCookie(c);
      if (!norm) { skipped++; continue; }
      insert.run(norm);
      imported++;
    }
  });
  tx(cookies);
  return { imported, skipped };
}

function exportCookies() {
  return {
    version: 1,
    exportedAt: nowIso(),
    cookies: listCookies()
  };
}

module.exports = {
  listCookies,
  addCookie,
  deleteCookie,
  clearCookies,
  importCookies,
  exportCookies
};
