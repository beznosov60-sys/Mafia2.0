const http = require('http');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const DATABASE_PATH = path.join(DATA_DIR, 'crm.db');

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DATABASE_PATH);
db.pragma('foreign_keys = ON');

const TABLE_DEFINITIONS = {
  clients: `
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      external_id TEXT UNIQUE,
      full_name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      created_at TEXT DEFAULT (DATETIME('now')),
      updated_at TEXT DEFAULT (DATETIME('now'))
    );
  `,
  managers: `
    CREATE TABLE IF NOT EXISTS managers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      created_at TEXT DEFAULT (DATETIME('now')),
      updated_at TEXT DEFAULT (DATETIME('now'))
    );
  `,
  tasks: `
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER,
      manager_id INTEGER,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'pending',
      due_date TEXT,
      created_at TEXT DEFAULT (DATETIME('now')),
      updated_at TEXT DEFAULT (DATETIME('now')),
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
      FOREIGN KEY (manager_id) REFERENCES managers(id) ON DELETE SET NULL
    );
  `,
  payments: `
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER,
      amount REAL NOT NULL,
      currency TEXT DEFAULT 'RUB',
      paid_at TEXT DEFAULT (DATETIME('now')),
      notes TEXT,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    );
  `,
  manager_payments: `
    CREATE TABLE IF NOT EXISTS manager_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      manager_id INTEGER NOT NULL,
      client_id TEXT,
      amount REAL NOT NULL,
      type TEXT DEFAULT 'client',
      paid_at TEXT DEFAULT (DATETIME('now')),
      metadata TEXT,
      FOREIGN KEY (manager_id) REFERENCES managers(id) ON DELETE CASCADE
    );
  `,
  manager_payment_meta: `
    CREATE TABLE IF NOT EXISTS manager_payment_meta (
      manager_id INTEGER PRIMARY KEY,
      salary REAL DEFAULT 0,
      bonus REAL DEFAULT 0,
      paid INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT (DATETIME('now')),
      FOREIGN KEY (manager_id) REFERENCES managers(id) ON DELETE CASCADE
    );
  `,
  storage: `
    CREATE TABLE IF NOT EXISTS storage (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT DEFAULT (DATETIME('now'))
    );
  `
};

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8'
};

const APP_DATA_KEYS = ['archivedClients', 'consultations'];

function ensureTables() {
  Object.values(TABLE_DEFINITIONS).forEach(statement => {
    db.prepare(statement).run();
  });
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 5_000_000) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function normalizeManagerPayments(rows = [], metaRows = []) {
  const result = {};

  metaRows.forEach(row => {
    result[row.manager_id] = {
      salary: row.salary ?? 0,
      bonus: row.bonus ?? 0,
      paid: !!row.paid,
      history: []
    };
  });

  rows.forEach(row => {
    if (!result[row.manager_id]) {
      result[row.manager_id] = { history: [] };
    }
    let metadata = {};
    if (row.metadata) {
      try {
        metadata = JSON.parse(row.metadata);
      } catch (error) {
        metadata = {};
      }
    }
    result[row.manager_id].history = result[row.manager_id].history || [];
    result[row.manager_id].history.push({
      clientId: row.client_id ?? undefined,
      amount: row.amount,
      date: row.paid_at,
      type: row.type || 'client',
      ...metadata
    });
  });

  return result;
}

function resolveStaticPath(requestUrl) {
  try {
    const url = new URL(requestUrl, 'http://localhost');
    const decodedPath = decodeURIComponent(url.pathname);
    const normalized = path
      .normalize(decodedPath)
      .replace(/^([.][.][/\\])+/, '')
      .replace(/^\/+/, '');

    const safePath = normalized || 'index.html';
    const absolutePath = path.join(PUBLIC_DIR, safePath);

    if (!absolutePath.startsWith(PUBLIC_DIR)) {
      return null;
    }

    return absolutePath;
  } catch (error) {
    console.error('Failed to resolve static path', error);
    return null;
  }
}

async function serveStaticFile(filePath, res) {
  try {
    const stats = await fs.promises.stat(filePath);
    const finalPath = stats.isDirectory() ? path.join(filePath, 'index.html') : filePath;
    const ext = path.extname(finalPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    const stream = fs.createReadStream(finalPath);
    stream.on('open', () => {
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable'
      });
    });
    stream.on('error', error => {
      console.error('Error while streaming static file:', error);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      }
      res.end('Internal Server Error');
    });

    stream.pipe(res);
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    console.error('Failed to serve static file:', error);
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Internal Server Error');
  }
}

function upsertStorageEntries(payload) {
  const entries = Object.entries(payload).filter(([key]) => APP_DATA_KEYS.includes(key));
  if (entries.length === 0) return [];

  const stmt = db.prepare(
    `INSERT INTO storage (key, value, updated_at) VALUES (?, ?, DATETIME('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;`
  );

  const updated = [];
  const txn = db.transaction(() => {
    entries.forEach(([key, value]) => {
      stmt.run(key, JSON.stringify(value));
      updated.push(key);
    });
  });

  txn();
  return updated;
}

function persistManagerPayments(data) {
  const normalized = data && typeof data === 'object' ? data : {};
  const insertPayment = db.prepare(
    `INSERT INTO manager_payments (manager_id, client_id, amount, type, paid_at, metadata)
     VALUES (?, ?, ?, ?, ?, ?);`
  );
  const insertMeta = db.prepare(
    `INSERT INTO manager_payment_meta (manager_id, salary, bonus, paid, updated_at)
     VALUES (?, ?, ?, ?, DATETIME('now'))
     ON CONFLICT(manager_id) DO UPDATE SET
       salary = excluded.salary,
       bonus = excluded.bonus,
       paid = excluded.paid,
       updated_at = excluded.updated_at;`
  );
  const deletePayments = db.prepare('DELETE FROM manager_payments WHERE manager_id = ?');
  const deleteMeta = db.prepare('DELETE FROM manager_payment_meta WHERE manager_id = ?');

  const txn = db.transaction(() => {
    const managerIds = Object.keys(normalized);

    if (managerIds.length === 0) {
      db.prepare('DELETE FROM manager_payments').run();
      db.prepare('DELETE FROM manager_payment_meta').run();
      return;
    }

    const placeholders = managerIds.map(() => '?').join(',');
    db.prepare(`DELETE FROM manager_payments WHERE manager_id NOT IN (${placeholders})`).run(...managerIds);
    db.prepare(`DELETE FROM manager_payment_meta WHERE manager_id NOT IN (${placeholders})`).run(...managerIds);

    Object.entries(normalized).forEach(([managerId, info]) => {
      const numericManagerId = Number(managerId) || managerId;
      deletePayments.run(numericManagerId);
      deleteMeta.run(numericManagerId);
      insertMeta.run(
        numericManagerId,
        Number(info?.salary) || 0,
        Number(info?.bonus) || 0,
        info?.paid ? 1 : 0
      );

      const history = Array.isArray(info?.history) ? info.history : [];
      history.forEach(entry => {
        const { clientId = null, amount = 0, date = new Date().toISOString(), type = 'client', ...rest } = entry || {};
        insertPayment.run(
          numericManagerId,
          clientId ?? null,
          Number(amount) || 0,
          type,
          date,
          Object.keys(rest).length ? JSON.stringify(rest) : null
        );
      });
    });
  });

  txn();
}

ensureTables();

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;

  try {
    if (req.method === 'GET' && pathname === '/api/app-data') {
      const placeholders = APP_DATA_KEYS.map(() => '?').join(',');
      const rows = APP_DATA_KEYS.length
        ? db.prepare(`SELECT key, value FROM storage WHERE key IN (${placeholders})`).all(...APP_DATA_KEYS)
        : [];
      const payload = APP_DATA_KEYS.reduce((acc, key) => {
        const row = rows.find(r => r.key === key);
        if (!row) {
          acc[key] = key === 'archivedClients' ? [] : {};
        } else {
          try {
            acc[key] = JSON.parse(row.value);
          } catch (error) {
            acc[key] = key === 'archivedClients' ? [] : {};
          }
        }
        return acc;
      }, {});
      sendJson(res, 200, payload);
      return;
    }

    if (req.method === 'POST' && pathname === '/api/app-data') {
      try {
        const payload = await parseJsonBody(req);
        const updated = upsertStorageEntries(payload || {});
        if (updated.length === 0) {
          sendJson(res, 400, { error: 'No valid keys to save' });
          return;
        }
        sendJson(res, 200, { status: 'saved', updated });
      } catch (error) {
        console.error('Failed to persist app data', error);
        sendJson(res, 500, { error: 'Failed to save app data' });
      }
      return;
    }

    if (req.method === 'GET' && pathname === '/api/clients') {
      const rows = db.prepare('SELECT * FROM clients ORDER BY id DESC').all();
      sendJson(res, 200, rows);
      return;
    }

    if (req.method === 'POST' && pathname === '/api/clients') {
      try {
        const clients = await parseJsonBody(req);
        if (!Array.isArray(clients)) {
          sendJson(res, 400, { error: 'Payload must be an array of clients' });
          return;
        }

        const insert = db.prepare(
          `INSERT INTO clients (id, external_id, full_name, email, phone, updated_at)
           VALUES (@id, @external_id, @full_name, @email, @phone, DATETIME('now'))
           ON CONFLICT(id) DO UPDATE SET
             external_id = excluded.external_id,
             full_name = excluded.full_name,
             email = excluded.email,
             phone = excluded.phone,
             updated_at = excluded.updated_at;`
        );
        const insertNoId = db.prepare(
          `INSERT INTO clients (external_id, full_name, email, phone, updated_at)
           VALUES (?, ?, ?, ?, DATETIME('now'))
           ON CONFLICT(external_id) DO UPDATE SET
             full_name = excluded.full_name,
             email = excluded.email,
             phone = excluded.phone,
             updated_at = excluded.updated_at;`
        );

        const txn = db.transaction(() => {
          const existingIds = db.prepare('SELECT id FROM clients').all().map(row => row.id);
          const payloadIds = clients.map(c => c.id).filter(id => id !== undefined && id !== null);
          const idsToDelete = existingIds.filter(id => !payloadIds.includes(id));
          if (idsToDelete.length > 0) {
            const placeholders = idsToDelete.map(() => '?').join(',');
            db.prepare(`DELETE FROM clients WHERE id IN (${placeholders})`).run(...idsToDelete);
          }

          clients.forEach(client => {
            const record = {
              id: client.id || null,
              external_id: client.external_id || null,
              full_name: client.full_name || client.name || 'Без имени',
              email: client.email || null,
              phone: client.phone || null
            };
            if (record.id) {
              insert.run(record);
            } else {
              insertNoId.run(record.external_id, record.full_name, record.email, record.phone);
            }
          });
        });

        txn();
        sendJson(res, 200, { status: 'ok' });
      } catch (error) {
        console.error('Failed to upsert clients', error);
        sendJson(res, 500, { error: 'Failed to save clients' });
      }
      return;
    }

    if (req.method === 'GET' && pathname === '/api/managers') {
      const rows = db.prepare('SELECT * FROM managers ORDER BY id DESC').all();
      sendJson(res, 200, rows);
      return;
    }

    if (req.method === 'POST' && pathname === '/api/managers') {
      try {
        const payload = await parseJsonBody(req);
        if (!Array.isArray(payload)) {
          sendJson(res, 400, { error: 'Payload must be an array of managers' });
          return;
        }

        const insert = db.prepare(
          `INSERT INTO managers (id, full_name, email, phone, updated_at)
           VALUES (@id, @full_name, @email, @phone, DATETIME('now'))
           ON CONFLICT(id) DO UPDATE SET
             full_name = excluded.full_name,
             email = excluded.email,
             phone = excluded.phone,
             updated_at = excluded.updated_at;`
        );
        const insertNoId = db.prepare('INSERT INTO managers (full_name, email, phone) VALUES (?, ?, ?);');

        const txn = db.transaction(() => {
          const existingIds = db.prepare('SELECT id FROM managers').all().map(row => row.id);
          const payloadIds = payload.map(m => m.id).filter(id => id !== undefined && id !== null);
          const idsToDelete = existingIds.filter(id => !payloadIds.includes(id));
          if (idsToDelete.length > 0) {
            const placeholders = idsToDelete.map(() => '?').join(',');
            db.prepare(`DELETE FROM managers WHERE id IN (${placeholders})`).run(...idsToDelete);
          }

          payload.forEach(manager => {
            const record = {
              id: manager.id || null,
              full_name: manager.full_name || manager.name || manager.title || 'Без имени',
              email: manager.email || null,
              phone: manager.phone || manager.telephone || null
            };
            if (record.id) {
              insert.run(record);
            } else {
              insertNoId.run(record.full_name, record.email, record.phone);
            }
          });
        });

        txn();
        sendJson(res, 200, { status: 'ok' });
      } catch (error) {
        console.error('Failed to upsert managers', error);
        sendJson(res, 500, { error: 'Failed to save managers' });
      }
      return;
    }

    if (req.method === 'GET' && pathname === '/api/manager-payments') {
      const paymentsRows = db
        .prepare(
          'SELECT manager_id, client_id, amount, type, paid_at, metadata FROM manager_payments ORDER BY paid_at DESC'
        )
        .all();
      const metaRows = db.prepare('SELECT manager_id, salary, bonus, paid FROM manager_payment_meta').all();
      sendJson(res, 200, normalizeManagerPayments(paymentsRows, metaRows));
      return;
    }

    if (req.method === 'POST' && pathname === '/api/manager-payments') {
      try {
        const payload = await parseJsonBody(req);
        persistManagerPayments(payload);
        sendJson(res, 200, { status: 'ok' });
      } catch (error) {
        console.error('Failed to persist manager payments', error);
        sendJson(res, 500, { error: 'Failed to save manager payments' });
      }
      return;
    }

    if (req.method === 'GET' && pathname === '/api/db-status') {
      sendJson(res, 200, { database: DATABASE_PATH, tables: Object.keys(TABLE_DEFINITIONS) });
      return;
    }
  } catch (error) {
    console.error('Unhandled API error', error);
    sendJson(res, 500, { error: 'Internal server error' });
    return;
  }

  const filePath = resolveStaticPath(req.url);
  if (!filePath) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bad request');
    return;
  }

  await serveStaticFile(filePath, res);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
