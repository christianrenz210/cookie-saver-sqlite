const path = require('path');
const USE_PG = !!process.env.DATABASE_URL;

let db;
let pgPool;

if (USE_PG) {
  const { Pool } = require('pg');
  pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  // Init Postgres schema
  pgPool.query(`
    CREATE TABLE IF NOT EXISTS cookies (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      notes TEXT DEFAULT '',
      "cookieData" TEXT NOT NULL,
      "createdAt" TEXT NOT NULL
    );
  `).catch(console.error);

} else {
  const Database = require('better-sqlite3');
  const dbPath = path.join(__dirname, '..', 'cookies.sqlite');
  db = new Database(dbPath);
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

  // Migrate old schema
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
}

const nowIso = () => new Date().toISOString();

async function listCookies() {
  if (USE_PG) {
    const res = await pgPool.query('SELECT id, name, notes, "cookieData", "createdAt" FROM cookies ORDER BY id DESC');
    return res.rows.map(r => ({
      id: r.id,
      name: r.name,
      notes: r.notes || '',
      cookieData: r.cookieData || '',
      createdAt: r.createdAt
    }));
  } else {
    const stmt = db.prepare(`SELECT id, name, notes, cookieData, createdAt FROM cookies ORDER BY id DESC`);
    return stmt.all().map(r => ({
      id: r.id,
      name: r.name,
      notes: r.notes || '',
      cookieData: r.cookieData || '',
      createdAt: r.createdAt
    }));
  }
}

async function addCookie({ name, notes, cookieData }) {
  if (USE_PG) {
    const res = await pgPool.query(
      `INSERT INTO cookies (name, notes, "cookieData", "createdAt") VALUES ($1, $2, $3, $4) RETURNING id, name, notes, "cookieData", "createdAt"`,
      [name, notes || '', cookieData, nowIso()]
    );
    return {
      id: res.rows[0].id,
      name: res.rows[0].name,
      notes: res.rows[0].notes,
      cookieData: res.rows[0].cookieData,
      createdAt: res.rows[0].createdAt
    };
  } else {
    const stmt = db.prepare(`INSERT INTO cookies (name, notes, cookieData, createdAt) VALUES (@name, @notes, @cookieData, @createdAt)`);
    const info = stmt.run({ name, notes: notes || '', cookieData, createdAt: nowIso() });
    const getStmt = db.prepare(`SELECT id, name, notes, cookieData, createdAt FROM cookies WHERE id = ?`);
    return getStmt.get(info.lastInsertRowid);
  }
}

async function deleteCookie(id) {
  if (USE_PG) {
    const res = await pgPool.query(`DELETE FROM cookies WHERE id = $1`, [id]);
    return res.rowCount > 0;
  } else {
    const stmt = db.prepare(`DELETE FROM cookies WHERE id = ?`);
    const info = stmt.run(id);
    return info.changes > 0;
  }
}

async function clearCookies() {
  if (USE_PG) {
    await pgPool.query(`DELETE FROM cookies`);
  } else {
    const stmt = db.prepare(`DELETE FROM cookies`);
    stmt.run();
  }
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

async function importCookies(cookies) {
  await clearCookies();
  let imported = 0, skipped = 0;
  
  if (USE_PG) {
    const client = await pgPool.connect();
    try {
      await client.query('BEGIN');
      for (const c of cookies) {
        const norm = normalizeImportedCookie(c);
        if (!norm) { skipped++; continue; }
        await client.query(
          `INSERT INTO cookies (name, notes, "cookieData", "createdAt") VALUES ($1, $2, $3, $4)`,
          [norm.name, norm.notes, norm.cookieData, norm.createdAt]
        );
        imported++;
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } else {
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
  }
  return { imported, skipped };
}

async function exportCookies() {
  return {
    version: 1,
    exportedAt: nowIso(),
    cookies: await listCookies()
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
